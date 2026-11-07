import { backupTables, BackupTable, compareRows, findBackupTable, monthCode, RowDifference, rowKey } from './backupTables';
import { roundToFoxProRule } from './billingEngine';
import { fySuffix } from './financialYear';
import { oldSoftwareTables, readSqlFile, rowsOf } from './oldSoftwareFile';
import { indexOldSections, isClosedYear, OLD_FOOTER, OLD_HEADER, OldFileCount, OldRows, oldRowsOf, oldSoftwarePart, oldSoftwareSourceTables, oldSoftwareYears } from './oldSoftwareExport';

const BILL_FIX_BATCH = 50;
const FILE_FORMAT = 'aryan-news-backup';
const MOBILE_TABLE = 'customer_mobile';
const PAGE_SIZE = 1000;
const PARALLEL_PAGES = 6;
const WRITE_BATCH = 500;
const PARALLEL_WRITES = 4;

type Progress = (message: string) => void;

export async function readJson(res: Response) {
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

// The old software's history (years and tables this website never held) is kept once, gzipped,
// in a private storage bucket, in pieces under the upload limit
const HISTORY_PIECE = 32 * 1024 * 1024;

export async function oldHistoryInfo(): Promise<{ missing?: boolean; name?: string; saved_at?: string; size?: number }> {
  return fetch('/api/old-software-base').then(readJson);
}

export async function saveOldHistory(file: File, onProgress: Progress) {
  const head = new TextDecoder().decode(await file.slice(0, 40).arrayBuffer());
  if (!head.startsWith('-- MySQL')) throw new Error('यह पुराने सॉफ्टवेयर की बैकअप (.sql) फाइल नहीं है');
  if (!(await indexOldSections(file)).has('customer')) throw new Error('इस फाइल में customer टेबल नहीं मिली, यह पूरी बैकअप फाइल नहीं लगती');
  const folder = `v${Date.now()}`;
  const reader = file.stream().pipeThrough(new CompressionStream('gzip')).getReader();
  let pending: Uint8Array[] = [];
  let pendingSize = 0;
  let index = 0;
  const upload = async () => {
    onProgress(`पुराना इतिहास वेबसाइट पर रखा जा रहा है... (हिस्सा ${index + 1})`);
    const { url } = await fetch('/api/old-software-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'part', folder, index })
    }).then(readJson);
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/gzip' }, body: new Blob(pending as BlobPart[]) });
    if (!res.ok) throw new Error(`Upload of piece ${index + 1} failed (${res.status})`);
    pending = [];
    pendingSize = 0;
    index++;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (value) {
      pending.push(value);
      pendingSize += value.length;
      if (pendingSize >= HISTORY_PIECE) await upload();
    }
    if (done) break;
  }
  if (pendingSize > 0) await upload();
  return fetch('/api/old-software-base', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'finish', folder, parts: index, name: file.name, size: file.size })
  }).then(readJson);
}

async function loadOldHistory(onProgress: Progress): Promise<Blob | null> {
  const meta = await fetch('/api/old-software-base?links=1').then(readJson);
  if (meta.missing) return null;
  const pieces: Blob[] = [];
  for (let i = 0; i < meta.links.length; i++) {
    onProgress(`पुराना इतिहास आ रहा है... (${i + 1} / ${meta.links.length})`);
    const res = await fetch(meta.links[i]);
    if (!res.ok) throw new Error(`History piece ${i + 1} could not be read (${res.status})`);
    pieces.push(await res.blob());
  }
  onProgress('पुराना इतिहास खोला जा रहा है...');
  const history = await new Response(new Blob(pieces).stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  if (meta.size && history.size !== meta.size) throw new Error('पुराना इतिहास पूरा नहीं आया');
  return history;
}

// A complete backup for the old software. Its restore replaces the whole database, so the file
// holds every table it has: the masters, then each year from 2007-08 read, written and let go one
// at a time, from this website's data; a table the website has nothing for is copied as it is from
// the old software's history kept here. Chrome and Edge write the file straight to disk; other
// browsers build it in memory first.
export async function downloadOldSoftwareFile(onProgress: Progress) {
  const fileName = `AryanNews_ForOldSoftware_${new Date().toISOString().slice(0, 10)}.sql`;
  let writable: any = null;
  const picker = (window as any).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName, types: [{ description: 'MySQL backup', accept: { 'application/sql': ['.sql'] } }] });
      writable = await handle.createWritable();
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new Error('फाइल सेव करने की जगह नहीं चुनी गई');
      writable = null;
    }
  }
  const parts: BlobPart[] = [];
  let history: Blob | null = null;
  let sections = new Map<string, [number, number]>();
  const write = async (pieces: Iterable<string | { copy: string }>) => {
    for (const piece of pieces) {
      let out: string | Uint8Array;
      if (typeof piece === 'string') {
        out = piece;
      } else {
        const [start, end] = sections.get(piece.copy)!;
        out = new Uint8Array(await history!.slice(start, end).arrayBuffer());
      }
      if (writable) await writable.write(out);
      else parts.push(out as BlobPart);
    }
  };

  try {
    history = await loadOldHistory(onProgress);
    if (history) {
      onProgress('पुराने इतिहास की टेबल ढूँढी जा रही हैं...');
      sections = await indexOldSections(history);
    }
    const inHistory = (name: string) => sections.has(name);
    const count: OldFileCount = { filled: [], copied: [], empty: [] };
    let rows = 0;
    const read = async (names: string[], label: string) => {
      const tables: Record<string, any[]> = {};
      for (let i = 0; i < names.length; i++) {
        onProgress(`${label}: ${names[i]} (${i + 1} of ${names.length})...`);
        const { rows: found, missing } = await fetchTable(names[i]);
        if (!missing) tables[names[i]] = found;
        rows += found.length;
      }
      return tables;
    };

    // The old software's own rows for these tables, so each unchanged row is written exactly as it had it
    const utf8 = new TextDecoder('utf-8');
    const oldRows = async (names: string[]) => {
      const found = new Map<string, OldRows>();
      for (const name of names.map(n => n.toLowerCase())) {
        const at = sections.get(name);
        if (!at || found.has(name)) continue;
        onProgress(`पुराने इतिहास से मिलाया जा रहा है: ${name}...`);
        found.set(name, oldRowsOf(utf8.decode(await history!.slice(at[0], at[1]).arrayBuffer())));
      }
      return found;
    };

    await write([OLD_HEADER]);
    const masters = await read(oldSoftwareSourceTables([]), 'Masters');
    const masterRows = await oldRows(Object.keys(masters));
    const subscriptions = masterRows.get('customer_detail');
    await write(oldSoftwarePart(masters, null, count, inHistory, masterRows));
    masterRows.clear();
    for (const year of oldSoftwareYears()) {
      const label = `${year.slice(0, 4)}-${year.slice(6)}`;
      // A closed year the history has is copied from it, so it is not fetched
      const names = oldSoftwareSourceTables([year]).filter(name => /\d{8}$/.test(name) && !(isClosedYear(year) && inHistory(name.toLowerCase())));
      const yearly = await read(names, label);
      const yearRows = isClosedYear(year) ? new Map<string, OldRows>() : await oldRows([...Object.keys(yearly), `discontinue${year}`]);
      if (subscriptions) yearRows.set('customer_detail', subscriptions);
      onProgress(`${label}: writing...`);
      await write(oldSoftwarePart({ ...masters, ...yearly }, year, count, inHistory, yearRows));
    }
    // Tables the old software made after the layouts here were taken come across from its history too
    const written = new Set([...count.filled, ...count.copied, ...count.empty].map(name => name.toLowerCase()));
    for (const name of Array.from(sections.keys())) {
      if (written.has(name)) continue;
      await write([{ copy: name }]);
      count.copied.push(name);
    }
    await write([OLD_FOOTER]);

    if (writable) {
      await writable.close();
    } else {
      const url = URL.createObjectURL(new Blob(parts, { type: 'application/sql' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    return { rows, history: !!history, ...count };
  } catch (err) {
    await writable?.abort?.().catch(() => {});
    throw err;
  }
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
  billFixes?: any[];
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

// Each software numbers receipts itself, so one payment typed into both looks like two receipts.
// Equal payments are counted, so a second ₹155 the same month is still brought in.
export function withoutRepeatedReceipts(rows: any[], liveReceipts: any[]) {
  const payment = (receipt: any) =>
    `${receipt.customer_id}|${monthCode(receipt.month)}|${Number(receipt.mal_recp_amt) || 0}|${Number(receipt.less_amt) || 0}`;
  const held = new Map<string, number>();
  for (const receipt of liveReceipts) held.set(payment(receipt), (held.get(payment(receipt)) || 0) + 1);
  return rows.filter(row => {
    const left = held.get(payment(row)) || 0;
    if (left > 0) held.set(payment(row), left - 1);
    return left === 0;
  });
}

// The old software keeps mobile numbers in their own table. They only fill a blank phone here,
// so a number corrected on this website is never replaced.
export function withMobileNumbers(customers: any[], mobiles: any[], liveCustomers: any[]) {
  const hasPhone = (phone: any) => /\d/.test(String(phone ?? ''));
  const held = new Set(liveCustomers.filter(c => hasPhone(c.phone)).map(c => Number(c.customer_id)));
  const numbers = new Map(mobiles.filter(m => hasPhone(m.mobile)).map(m => [Number(m.customer_id), String(m.mobile).trim()]));
  return customers.map(c => {
    const mobile = numbers.get(Number(c.customer_id));
    return mobile && !hasPhone(c.phone) && !held.has(Number(c.customer_id)) ? { ...c, phone: mobile } : c;
  });
}

// A name retyped in the old software outdates the corrected Hindi, so it is decoded afresh.
// A stray \ from an earlier import is not a new name.
export function withoutOutdatedHindi(changes: any[], liveCustomers: any[]) {
  const letters = (name: any) => String(name ?? '').replace(/\\/g, '').trim();
  const liveNames = new Map(liveCustomers.map(c => [Number(c.customer_id), c.name_hindi]));
  return changes.map(c => (letters(c.name_hindi) === letters(liveNames.get(Number(c.customer_id))) ? c : { ...c, name_hindi_unicode: null }));
}

const FY_MONTHS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];
const isGovtSupply = (customer: any) => [1, -1, true, '1', '-1'].includes(customer.govt_supply);

const billsByMonth = (headers: any[], lines: any[]) => {
  const linesOf = new Map<string, any[]>();
  for (const line of lines) {
    const key = `${line.bill_id}|${line.customer_id}`;
    linesOf.set(key, [...(linesOf.get(key) || []), line]);
  }
  const bills = new Map<string, { header: any; lines: any[]; amount: number }>();
  for (const header of headers) {
    if (monthCode(header.month) === 'due') continue;
    const billLines = linesOf.get(`${header.bill_id}|${header.customer_id}`) || [];
    const amount = billLines.reduce((sum, line) => sum + Number(line.total_amt || 0), 0) + Number(header.del_amt || 0) - Number(header.dis_amt || 0);
    bills.set(`${header.customer_id}|${monthCode(header.month)}`, { header, lines: billLines, amount });
  }
  return bills;
};

// The bills whose charge differs from the old software. Only months the file has bills for count,
// so bills made here for a month the file has not reached yet are left alone.
export function billCorrections(fileHeaders: any[], fileLines: any[], liveHeaders: any[], liveLines: any[], receipts: any[] = []) {
  const fromFile = billsByMonth(fileHeaders, fileLines);
  const live = billsByMonth(liveHeaders, liveLines);
  const fileMonths = new Set(fileHeaders.map(header => monthCode(header.month)));
  const monthNames = new Map(liveHeaders.map(header => [monthCode(header.month), header.month]));
  const taken = new Set(liveHeaders.map(header => Number(header.bill_id)));
  let nextId = Math.max(0, ...Array.from(taken));

  // What a bill shows as payable. The old file's balance field means something else, so it is
  // worked out here the way this website's bills do, and the bill prints the right amount.
  const charges = new Map<string, { month: number; amount: number }[]>();
  for (const [key, bill] of Array.from(live).concat(Array.from(fromFile))) {
    const [customer, code] = key.split('|');
    if (fromFile.has(key) && live.get(key) === bill) continue;
    charges.set(customer, [...(charges.get(customer) || []), { month: FY_MONTHS.indexOf(code), amount: bill.amount }]);
  }
  const dues = new Map<string, number>();
  for (const header of [...fileHeaders, ...liveHeaders]) {
    if (monthCode(header.month) === 'due') dues.set(String(header.customer_id), Number(header.due_amt || 0));
  }
  const paid = new Map<string, { month: number; amount: number }[]>();
  const seen = new Set<string>();
  for (const receipt of receipts) {
    const key = `${receipt.customer_id}|${receipt.recp_no}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const customer = String(receipt.customer_id);
    paid.set(customer, [...(paid.get(customer) || []), { month: FY_MONTHS.indexOf(monthCode(receipt.month)), amount: (Number(receipt.mal_recp_amt) || 0) + (Number(receipt.less_amt) || 0) }]);
  }
  const payable = (customer: string, code: string) => {
    const month = FY_MONTHS.indexOf(code);
    const upTo = (rows: { month: number; amount: number }[] = []) => rows.filter(row => row.month <= month).reduce((sum, row) => sum + row.amount, 0);
    return -roundToFoxProRule((dues.get(customer) || 0) + upTo(charges.get(customer)) - upTo(paid.get(customer)));
  };

  const fixes: any[] = [];
  for (const key of Array.from(new Set([...Array.from(fromFile.keys()), ...Array.from(live.keys())]))) {
    const file = fromFile.get(key);
    const here = live.get(key);
    const [customer, code] = key.split('|');
    if (!fileMonths.has(code)) continue;
    if (here && Math.abs((file?.amount || 0) - here.amount) < 1) continue;

    const customer_id = Number(customer);
    const month = here?.header.month ?? monthNames.get(code) ?? file?.header.month;
    if (here && (!file || file.lines.length === 0)) {
      fixes.push({ customer_id, month, bill_id: here.header.bill_id, remove: true, lines: [] });
      continue;
    }
    if (!file) continue;
    const bill_id = here?.header.bill_id ?? (taken.has(Number(file.header.bill_id)) ? ++nextId : Number(file.header.bill_id));
    taken.add(bill_id);
    const lines = file.lines.map(line => ({ ...line, bill_id, month }));
    fixes.push(here
      ? { customer_id, month, bill_id, lines, header: { del_amt: file.header.del_amt, dis_amt: file.header.dis_amt, balance: Number(here.header.balance || 0) + here.amount - file.amount } }
      : { customer_id, month, bill_id, lines, newHeader: { ...file.header, bill_id, month, balance: payable(customer, code) } });
  }
  return fixes;
}

// Each billed customer's balance from their bills and receipts, the way bills work out dues.
// Government supply customers and customers with no bill this year keep what they have.
export function balancesToCorrect(customers: any[], headers: any[], lines: any[], receipts: any[]) {
  const owed = new Map<number, number>();
  const add = (id: any, amount: number) => owed.set(Number(id), (owed.get(Number(id)) || 0) + amount);

  const linesTotal = new Map<string, number>();
  for (const line of lines) {
    const key = `${line.bill_id}|${line.customer_id}`;
    linesTotal.set(key, (linesTotal.get(key) || 0) + Number(line.total_amt || 0));
  }
  for (const header of headers) {
    const charge = monthCode(header.month) === 'due'
      ? Number(header.due_amt || 0)
      : (linesTotal.get(`${header.bill_id}|${header.customer_id}`) || 0) + Number(header.del_amt || 0) - Number(header.dis_amt || 0);
    add(header.customer_id, charge);
  }
  const billed = new Set(owed.keys());

  const seen = new Set<string>();
  for (const receipt of receipts) {
    const key = `${receipt.customer_id}|${receipt.recp_no}`;
    if (seen.has(key)) continue;
    seen.add(key);
    add(receipt.customer_id, -(Number(receipt.mal_recp_amt || 0) + Number(receipt.less_amt || 0)));
  }

  return customers
    .filter(c => billed.has(Number(c.customer_id)) && !isGovtSupply(c))
    .map(c => ({ customer_id: c.customer_id, was: Number(c.cbal || 0), cbal: -Math.round((owed.get(Number(c.customer_id)) || 0) * 100) / 100 }))
    .filter(c => Math.abs(c.cbal - c.was) > 1)
    .map(({ customer_id, cbal }) => ({ customer_id, cbal }));
}

// Bills are corrected one by one through billCorrections instead
const CAREFUL_ADDS = /^(billno|bill2)/;
// Settings that make this website match the old software. Saved money rows are never changed this way.
const FOLLOW_FILE = /^(customer|customer_detail|publication|rate|receiptissue\d+)$/;

// The name can't be trusted, as a file may come with no extension, so the first bytes decide
async function fileKind(file: Blob): Promise<'backup' | 'zip' | 'old'> {
  const [first, second] = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (first === 0x1f && second === 0x8b) return 'backup';
  if (first === 0x50 && second === 0x4b) return 'zip';
  return 'old';
}

export async function planRestore(file: File, onProgress: Progress): Promise<RestorePlan> {
  const kind = await fileKind(file);
  if (kind === 'zip') throw new Error('यह ZIP फाइल है। पहले इसे खोलें (Extract), फिर अंदर की .sql फाइल चुनें');

  if (kind === 'old') {
    const definitions = oldSoftwareTables();
    const wanted = new Set([...definitions.map(d => d.source), MOBILE_TABLE]);
    const tables = await readSqlFile(file, wanted, percent => onProgress(`Reading the file (${percent}%)...`));
    if (!tables.customer) throw new Error('यह सही बैकअप फाइल नहीं है: इसमें ग्राहकों का डाटा नहीं मिला');

    const items: RestoreItem[] = [];
    const billHeaders = new Map<string, any[]>();
    for (const definition of definitions) {
      if (!tables[definition.source]) continue;
      const table = findBackupTable(definition.target)!;
      onProgress(`Comparing ${table.name} with the database...`);
      const { rows: live } = await fetchTable(table.name);
      const mapped = rowsOf(tables[definition.source], definition.map);
      const fileRows = table.name === 'customer' && tables[MOBILE_TABLE]
        ? withMobileNumbers(mapped, rowsOf(tables[MOBILE_TABLE], row => row), live)
        : mapped;
      if (table.name.startsWith('billno')) billHeaders.set(table.name.slice(6), live);

      const difference = compareRows(fileRows, live, table.oldKey || table.key, {
        fileBlankIsSame: true,
        ignore: table.oldIgnore
      });
      if (table.name === 'customer') difference.change = withoutOutdatedHindi(difference.change, live);

      let add = difference.add;
      const headers = table.name.startsWith('billno') ? live : table.name.startsWith('bill2') ? billHeaders.get(table.name.slice(4)) : null;
      if (headers) add = withoutBilledMonths(add, headers);
      if (table.name === 'customer_detail') add = withoutHeldPapers(add, live);
      if (table.name.startsWith('billdel')) add = withoutBilledMonths(add, live);
      if (/^receipt\d/.test(table.name)) add = withoutRepeatedReceipts(add, live);

      items.push({
        ...difference,
        add,
        remove: [],
        table,
        fileCount: fileRows.length,
        live,
        useAdd: add.length > 0 && !CAREFUL_ADDS.test(table.name),
        useChange: FOLLOW_FILE.test(table.name) && difference.change.length > 0,
        useRemove: false,
        skipped: difference.add.length - add.length
      });
    }
    const billnoItem = items.find(i => i.table.name.startsWith('billno'));
    const billItem = items.find(i => i.table.name.startsWith('bill2'));
    const receiptItem = items.find(i => /^receipt\d/.test(i.table.name));
    const billFixes = billnoItem && billItem
      ? billCorrections(
          rowsOf(tables[billnoItem.table.name], row => row),
          rowsOf(tables[billItem.table.name], definitions.find(d => d.source === billItem.table.name)!.map),
          billnoItem.live,
          billItem.live,
          [...(receiptItem?.live || []), ...(receiptItem?.add || [])]
        )
      : [];
    return { kind: 'old', items, billFixes };
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
  field: 'add' | 'update' | 'remove' | 'closeStops' | 'setBalances' | 'fixBills',
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
  const within = item.table.assignIdWithin;
  if (within) {
    const highest = new Map<string, number>();
    for (const row of item.live) highest.set(String(row[within]), Math.max(highest.get(String(row[within])) || 0, Number(row[column]) || 0));
    return item.add.map(row => {
      const next = (highest.get(String(row[within])) || 0) + 1;
      highest.set(String(row[within]), next);
      return { ...row, [column]: next };
    });
  }

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

  const billFixes = plan.billFixes || [];
  const billnoName = plan.items.find(i => i.table.name.startsWith('billno'))?.table.name;
  for (let i = 0; billnoName && i < billFixes.length; i += BILL_FIX_BATCH) {
    await writeBatches(billnoName, 'fixBills', billFixes.slice(i, i + BILL_FIX_BATCH), () => {});
  }

  // Last, because the customer updates above write the balance they first read
  if (plan.kind === 'old') {
    onProgress('Checking customer balances...');
    const suffix = fySuffix();
    const [customers, headers, lines, receipts] = await Promise.all(
      ['customer', `billno${suffix}`, `bill${suffix}`, `receipt${suffix}`].map(async name => (await fetchTable(name)).rows)
    );
    const balances = balancesToCorrect(customers, headers, lines, receipts);
    if (balances.length > 0) await writeBatches('customer', 'setBalances', balances, () => {});
  }

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
