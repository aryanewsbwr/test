import { backupTables, BackupTable, compareRows, findBackupTable, monthCode, RowDifference, rowKey } from './backupTables';
import { oldSoftwareTables, readSqlFile, rowsOf } from './oldSoftwareFile';

const FILE_FORMAT = 'aryan-news-backup';
const PAGE_SIZE = 1000;
const PARALLEL_PAGES = 6;
const WRITE_BATCH = 500;
const PARALLEL_WRITES = 4;

type Progress = (message: string) => void;

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return data;
}

async function eachInParallel<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.all(items.slice(i, i + limit).map(work));
  }
}

async function fetchTable(name: string): Promise<{ rows: any[]; missing: boolean }> {
  const get = (from: number) => fetch(`/api/backup-restore?table=${name}&from=${from}`).then(readJson);
  const first = await get(0);
  if (first.missing) return { rows: [], missing: true };

  const starts: number[] = [];
  for (let from = PAGE_SIZE; from < first.total; from += PAGE_SIZE) starts.push(from);

  const pages = new Map<number, any[]>([[0, first.rows]]);
  await eachInParallel(starts, PARALLEL_PAGES, async from => {
    pages.set(from, (await get(from)).rows);
  });

  const rows = [0, ...starts].flatMap(from => pages.get(from) || []);
  if (rows.length !== first.total) throw new Error(`${name}: expected ${first.total} rows, received ${rows.length}`);
  return { rows, missing: false };
}

async function saveBackupFile(tables: Record<string, any[]>, fileName: string) {
  const counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));
  const lines = [JSON.stringify({ format: FILE_FORMAT, version: 1, taken_at: new Date().toISOString(), tables: counts }) + '\n'];
  for (const [table, rows] of Object.entries(tables)) {
    for (let i = 0; i < rows.length; i += PAGE_SIZE) {
      lines.push(JSON.stringify({ table, rows: rows.slice(i, i + PAGE_SIZE) }) + '\n');
    }
  }

  const gzipped = new Blob(lines).stream().pipeThrough(new CompressionStream('gzip'));
  const blob = await new Response(gzipped).blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadBackup(includeOlderYears: boolean, onProgress: Progress) {
  const definitions = backupTables(includeOlderYears);
  const tables: Record<string, any[]> = {};

  for (let i = 0; i < definitions.length; i++) {
    onProgress(`Reading ${definitions[i].name} (${i + 1} of ${definitions.length})...`);
    const { rows, missing } = await fetchTable(definitions[i].name);
    if (!missing) tables[definitions[i].name] = rows;
  }

  onProgress('Compressing the file...');
  await saveBackupFile(tables, `AryanNews_Backup_${new Date().toISOString().slice(0, 10)}.json.gz`);
  return Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);
}

export interface RestoreItem extends RowDifference {
  table: BackupTable;
  fileCount: number;
  live: any[];
  useAdd: boolean;
  useChange: boolean;
  useRemove: boolean;
  skipped: number;
}

export interface RestorePlan {
  kind: 'backup' | 'old';
  takenAt?: string;
  items: RestoreItem[];
}

async function readBackupFile(file: File): Promise<{ takenAt: string; tables: Record<string, any[]> }> {
  const text = file.stream().pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream());
  const reader = text.getReader();
  const tables: Record<string, any[]> = {};
  let header: any = null;
  let carry = '';

  const takeLine = (line: string) => {
    if (!line) return;
    const parsed = JSON.parse(line);
    if (!header) {
      if (parsed.format !== FILE_FORMAT) throw new Error('This is not an Aryan News backup file');
      header = parsed;
    } else {
      (tables[parsed.table] = tables[parsed.table] || []).push(...parsed.rows);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const lines = (carry + value).split('\n');
    carry = lines.pop() || '';
    lines.forEach(takeLine);
  }
  takeLine(carry);

  for (const [name, count] of Object.entries<number>(header?.tables || {})) {
    if ((tables[name]?.length || 0) !== count) throw new Error(`The backup file is incomplete: ${name} should have ${count} rows`);
  }
  return { takenAt: header.taken_at, tables };
}

// A bill from the old file must not sit beside the one already made here for that customer and month
export function withoutBilledMonths(rows: any[], liveHeaders: any[]) {
  const billed = new Set(liveHeaders.map(bill => `${bill.customer_id}|${monthCode(bill.month)}`));
  return rows.filter(row => !billed.has(`${row.customer_id}|${monthCode(row.month)}`));
}

// A subscription edited here looks new in the old file; adding it would bill that paper twice.
// A paper restarted there is different: every row here is closed and its start date is new.
export function withoutHeldPapers(rows: any[], liveSubscriptions: any[]) {
  const today = new Date().toISOString().slice(0, 10);
  const isOpen = (sub: any) => !sub.c_date || String(sub.c_date).slice(0, 10) >= today;
  const paper = (sub: any) => `${sub.customer_id}|${sub.publica_id}`;
  const held = new Set(liveSubscriptions.map(paper));
  const running = new Set(liveSubscriptions.filter(isOpen).map(paper));
  const starts = new Set(liveSubscriptions.map(sub => `${paper(sub)}|${String(sub.s_date).slice(0, 10)}`));
  return rows.filter(row => {
    if (!held.has(paper(row))) return true;
    return isOpen(row) && !!row.s_date && !running.has(paper(row)) && !starts.has(`${paper(row)}|${row.s_date}`);
  });
}

// Each software numbers receipts itself, so one payment typed into both looks like two receipts
export function withoutRepeatedReceipts(rows: any[], liveReceipts: any[]) {
  const payment = (receipt: any) =>
    `${receipt.customer_id}|${monthCode(receipt.month)}|${Number(receipt.mal_recp_amt) || 0}|${Number(receipt.less_amt) || 0}`;
  const held = new Set(liveReceipts.map(payment));
  return rows.filter(row => !held.has(payment(row)));
}

// These could change what customers are charged, so they stay unticked unless chosen
const CAREFUL_ADDS = /^(billno|bill2|rate)/;

export async function planRestore(file: File, onProgress: Progress): Promise<RestorePlan> {
  if (/\.sql$|\.txt$/i.test(file.name)) {
    const definitions = oldSoftwareTables();
    const tables = await readSqlFile(file, new Set(definitions.map(d => d.source)), percent => onProgress(`Reading the file (${percent}%)...`));

    const items: RestoreItem[] = [];
    const billHeaders = new Map<string, any[]>();
    for (const definition of definitions) {
      if (!tables[definition.source]) continue;
      const table = findBackupTable(definition.target)!;
      onProgress(`Comparing ${table.name} with the database...`);
      const fileRows = rowsOf(tables[definition.source], definition.map);
      const { rows: live } = await fetchTable(table.name);
      if (table.name.startsWith('billno')) billHeaders.set(table.name.slice(6), live);

      const difference = compareRows(fileRows, live, table.oldKey || table.key, {
        fileBlankIsSame: true,
        ignore: table.oldIgnore
      });

      let add = difference.add;
      const headers = table.name.startsWith('billno') ? live : table.name.startsWith('bill2') ? billHeaders.get(table.name.slice(4)) : null;
      if (headers) add = withoutBilledMonths(add, headers);
      if (table.name === 'customer_detail') add = withoutHeldPapers(add, live);
      if (table.name.startsWith('billdel')) add = withoutBilledMonths(add, live);
      if (table.name.startsWith('receipt')) add = withoutRepeatedReceipts(add, live);

      items.push({
        ...difference,
        add,
        remove: [],
        table,
        fileCount: fileRows.length,
        live,
        useAdd: add.length > 0 && !CAREFUL_ADDS.test(table.name),
        // Balances and blanks are already held back, so this only brings in edits like a new address
        useChange: table.name === 'customer' && difference.change.length > 0,
        useRemove: false,
        skipped: difference.add.length - add.length
      });
    }
    return { kind: 'old', items };
  }

  onProgress('Reading the backup file...');
  const { takenAt, tables } = await readBackupFile(file);
  const items: RestoreItem[] = [];
  for (const [name, fileRows] of Object.entries(tables)) {
    const table = findBackupTable(name);
    if (!table) throw new Error(`The backup has an unknown table: ${name}`);
    onProgress(`Comparing ${name} with the database...`);
    const { rows: live, missing } = await fetchTable(name);
    if (missing) throw new Error(`Table ${name} does not exist in the database`);

    const difference = compareRows(fileRows, live, table.key);
    items.push({
      ...difference,
      table,
      fileCount: fileRows.length,
      live,
      useAdd: difference.add.length > 0,
      useChange: difference.change.length > 0,
      useRemove: difference.remove.length > 0,
      skipped: 0
    });
  }
  return { kind: 'backup', takenAt, items };
}

async function writeBatches(
  table: string,
  field: 'add' | 'update' | 'remove' | 'closeStops',
  rows: any[],
  onDone: (count: number) => void,
  onRefused: (failed: { row: string; error: string }[]) => void = () => {}
) {
  const batches: any[][] = [];
  for (let i = 0; i < rows.length; i += WRITE_BATCH) batches.push(rows.slice(i, i + WRITE_BATCH));

  await eachInParallel(batches, PARALLEL_WRITES, async batch => {
    const { failed = [] } = await fetch('/api/backup-restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, [field]: batch })
    }).then(readJson);
    onRefused(failed);
    onDone(batch.length - failed.length);
  });
}

// A backup keeps its own numbers; only rows from an old software file need new ones
function numbered(item: RestoreItem, kind: RestorePlan['kind']): any[] {
  if (kind === 'backup') return item.add;
  if (item.table.databaseNumbers) return item.add.map(({ id, ...row }) => row);
  if (!item.table.assignId) return item.add;

  const column = item.table.idColumn || 'id';
  let next = item.live.reduce((highest, row) => Math.max(highest, Number(row[column]) || 0), 0);
  return item.add.map(row => {
    next++;
    return item.table.name === 'holiday' ? { ...row, id: next, holiday_id: next } : { ...row, [column]: next };
  });
}

function permanentStops(plan: RestorePlan): any[] {
  if (plan.kind !== 'old') return [];
  const item = plan.items.find(i => i.table.name === 'discontinue');
  return item?.useAdd ? item.add.filter(row => row.temp_perma === 'Permanent') : [];
}

// Adds and changes go first and removals last, so stopping halfway never loses a row
export async function applyRestore(plan: RestorePlan, onProgress: Progress) {
  const chosen = plan.items.filter(i => (i.useAdd && i.add.length) || (i.useChange && i.change.length) || (i.useRemove && i.remove.length));
  const total = chosen.reduce((sum, i) => sum + (i.useAdd ? i.add.length : 0) + (i.useChange ? i.change.length : 0) + (i.useRemove ? i.remove.length : 0), 0);
  let done = 0;
  const tick = (count: number) => {
    done += count;
    onProgress(`Saving ${done.toLocaleString()} of ${total.toLocaleString()} rows...`);
  };

  onProgress('Saving a safety copy of the tables that will change...');
  await saveBackupFile(
    Object.fromEntries(chosen.map(i => [i.table.name, i.live])),
    `AryanNews_BeforeRestore_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json.gz`
  );

  const refused = new Map<string, { row: string; error: string }[]>();
  for (const item of chosen) {
    const note = (failed: { row: string; error: string }[]) => {
      if (failed.length > 0) refused.set(item.table.name, [...(refused.get(item.table.name) || []), ...failed]);
    };
    if (item.useAdd) await writeBatches(item.table.name, 'add', numbered(item, plan.kind), tick, note);
    if (item.useChange) await writeBatches(item.table.name, 'update', item.change, tick);
  }
  for (const item of chosen) {
    if (item.useRemove) await writeBatches(item.table.name, 'remove', item.remove, tick);
  }

  // A permanent stop from the old file closes its subscriptions, as the Discontinue screen does
  const stops = permanentStops(plan);
  if (stops.length > 0) await writeBatches('discontinue', 'closeStops', stops, () => {});

  onProgress('Checking the result...');
  const problems: string[] = [];
  for (const item of chosen) {
    const notSaved = refused.get(item.table.name) || [];
    if (notSaved.length > 0) {
      problems.push(`${item.table.name}: ${notSaved.length} rows not saved (${notSaved.slice(0, 5).map(f => f.row).join(', ')}): ${notSaved[0].error}`);
    }
    const expected = item.live.length + (item.useAdd ? item.add.length - notSaved.length : 0) - (item.useRemove ? item.remove.length : 0);
    const { rows } = await fetchTable(item.table.name);
    if (rows.length !== expected) problems.push(`${item.table.name}: expected ${expected} rows, found ${rows.length}`);
    if (plan.kind === 'backup' && item.useAdd && item.useRemove) {
      const keys = new Set(rows.map(row => rowKey(row, item.table.key)));
      if (item.add.some(row => !keys.has(rowKey(row, item.table.key)))) problems.push(`${item.table.name}: some restored rows are missing`);
    }
  }
  return { saved: done, problems };
}
