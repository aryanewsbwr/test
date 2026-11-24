import { fySuffix, previousFySuffix } from './financialYear';

export interface BackupTable {
  name: string;
  // Column(s) that identify one row in this table
  key: string[];
  // Rows from the old software have no database id, so they match on this instead
  oldKey?: string[];
  // Money tables are never overwritten from an old software file, only added to
  money?: boolean;
  // Rows added from an old software file get the next number here, because both
  // softwares count separately and the same number can mean two different rows
  assignId?: boolean;
  idColumn?: string;
  // The next number counts within this column, not across the whole table
  assignIdWithin?: string;
  // The database numbers new rows of this table itself
  databaseNumbers?: boolean;
  // Columns that differ between the two softwares without meaning a real change
  oldIgnore?: string[];
  // Values the two softwares write differently for the same thing (blank and '1-7' are every day)
  oldSame?: Record<string, string[]>;
}

const MASTER_TABLES: BackupTable[] = [
  // Cbal is the old software's own figure (the last bill's balance) and comes in as it has it
  { name: 'customer', key: ['customer_id'], oldIgnore: ['paid', 'delivery', 'discount'] },
  // A paper is the same subscription by its start date; a hawker or circulation changed there is a change to it
  { name: 'customer_detail', key: ['customer_id', 'sno'], oldKey: ['customer_id', 'publica_id', 's_date'], oldSame: { from_day: ['', '1-7'] } },
  { name: 'hawker', key: ['hawker_id'] },
  { name: 'publication', key: ['publica_id'], oldSame: { circulation: ['', 'morning'] } },
  { name: 'publisher', key: ['publish_id'] },
  { name: 'regiond', key: ['region_id'] },
  { name: 'collect', key: ['Collect_id'] },
  { name: 'rate', key: ['id'], oldKey: ['publica_id', 'dayofweek'], assignId: true },
  { name: 'ratechange', key: ['id'], oldKey: ['publica_id', 'dayofweek', 'effective_date'], assignId: true },
  { name: 'holiday', key: ['id'], oldKey: ['oc_date', 'publica_id'], assignId: true, oldIgnore: ['holiday_id'] },
  { name: 'publicationdis', key: ['id'], oldKey: ['publica_id', 'entry_date'], assignId: true, oldIgnore: ['dis_type', 'remark'] },
  { name: 'publicationsup', key: ['id'], oldKey: ['publica_id', 'publicasup_id', 'month', 'year', 'region_id'], assignId: true },
  {
    name: 'discontinue',
    key: ['discontinue_id'],
    oldKey: ['customer_id', 'publica_id', 'temp_from'],
    assignId: true,
    idColumn: 'discontinue_id',
    oldIgnore: ['discontinue_id', 'sno', 'financial_year']
  },
  { name: 'customer_discontinue', key: ['id'] },
  { name: 'countersale', key: ['id'] },
  { name: 'whatsapp_messages', key: ['id'] }
];

function yearlyTables(suffix: string): BackupTable[] {
  return [
    { name: `billno${suffix}`, key: ['bill_id'], money: true },
    { name: `bill${suffix}`, key: ['id'], oldKey: ['bill_id', 'publica_id', 'sno'], money: true },
    // The line number (sno) is each software's own count of the customer's papers, so it is not compared
    { name: `billdel${suffix}`, key: ['id'], oldKey: ['customer_id', 'publica_id', 'month'], money: true, oldIgnore: ['id', 'sno'] },
    {
      name: `receipt${suffix}`,
      key: ['id'],
      oldKey: ['customer_id', 'recp_no'],
      money: true,
      databaseNumbers: true,
      oldIgnore: ['id', 'bill_amt', 'recp_date', 'remarks', 'region_id', 'year']
    },
    {
      name: `retailsale${suffix}`,
      key: ['retail_id'],
      oldKey: ['customer_id', 'vr_date', 'publica_id', 'copies', 'amt'],
      money: true,
      assignId: true,
      idColumn: 'retail_id',
      oldIgnore: ['retail_id', 'rate', 'narr']
    },
    {
      name: `receiptissue${suffix}`,
      key: ['Collect_id', 'sno'],
      oldKey: ['Collect_id', 'ReceiptFrom', 'ReceiptTo'],
      assignId: true,
      assignIdWithin: 'Collect_id',
      idColumn: 'sno',
      oldIgnore: ['sno']
    }
  ];
}

const FIRST_FY_START = 2007;

export function olderYearSuffixes(): string[] {
  const suffixes: string[] = [];
  const stop = Number(previousFySuffix().slice(0, 4));
  for (let year = FIRST_FY_START; year < stop; year++) suffixes.push(`${year}${year + 1}`);
  return suffixes;
}

export function backupTables(includeOlderYears = false): BackupTable[] {
  const suffixes = [fySuffix(), previousFySuffix(), ...(includeOlderYears ? olderYearSuffixes() : [])];
  return [...MASTER_TABLES, ...suffixes.flatMap(yearlyTables)];
}

// Every year's tables, so the server can recognise a table named in any backup
export function findBackupTable(name: string): BackupTable | undefined {
  return backupTables(true).find(t => t.name === name);
}

export interface RowDifference {
  add: any[];
  change: any[];
  remove: any[];
  same: number;
}

const blank = (value: any) => value === null || value === undefined || String(value).trim() === '';

function sameValue(a: any, b: any): boolean {
  if (blank(a) || blank(b)) return blank(a) && blank(b);
  const numberA = Number(a);
  const numberB = Number(b);
  if (!Number.isNaN(numberA) && !Number.isNaN(numberB)) return numberA === numberB;
  return String(a).trim() === String(b).trim();
}

// "Aug" and "August" are the same bill month
export function monthCode(month: any): string {
  return String(month ?? '').trim().toLowerCase().slice(0, 3);
}

export function rowKey(row: any, key: string[]): string {
  return key.map(column => (column === 'month' ? monthCode(row[column]) : String(row[column] ?? '').trim())).join('|');
}

// Identical keys can repeat, like two lines of one paper, so each gets its own turn number
function keysOf(rows: any[], key: string[]): string[] {
  const turns = new Map<string, number>();
  return rows.map(row => {
    const id = rowKey(row, key);
    const turn = (turns.get(id) || 0) + 1;
    turns.set(id, turn);
    return `${id}#${turn}`;
  });
}

export interface CompareOptions {
  // An old software file leaves many columns empty, which says nothing about the live value
  fileBlankIsSame?: boolean;
  // The file is the master copy: a blank in it clears the live value. Only an empty value and a 0 count
  // as the same, as the two softwares write "nothing" differently.
  mirror?: boolean;
  same?: Record<string, string[]>;
  ignore?: string[];
}

// Only the file's own columns are compared, because an old software file has fewer
export function compareRows(fileRows: any[], liveRows: any[], key: string[], options: CompareOptions = {}): RowDifference {
  const ignore = options.ignore || [];
  const liveKeys = keysOf(liveRows, key);
  const live = new Map<string, any>(liveKeys.map((id, i) => [id, liveRows[i]]));
  const result: RowDifference = { add: [], change: [], remove: [], same: 0 };
  const seen = new Set<string>();

  const empty = (value: any) => blank(value) || Number(value) === 0;
  const alike = (column: string, value: any, current: any) => {
    if (column === 'month') return monthCode(value) === monthCode(current);
    const values = options.same?.[column];
    const lower = (v: any) => String(v ?? '').trim().toLowerCase();
    return !!values && values.includes(lower(value)) && values.includes(lower(current));
  };
  const unchanged = (value: any, current: any, column = '') =>
    sameValue(value, current) || alike(column, value, current) || (!!options.mirror && empty(value) && empty(current)) || (!!options.fileBlankIsSame && (blank(value) || Number(value) === 0) && (blank(current) || Number(current) === 0 || blank(value)));

  keysOf(fileRows, key).forEach((id, i) => {
    const row = fileRows[i];
    seen.add(id);

    const current = live.get(id);
    if (!current) {
      result.add.push(row);
      return;
    }
    // Only the columns that really differ are written, so a blank in an old file never wipes a live value
    const changed = Object.keys(row).filter(column => !ignore.includes(column) && !unchanged(row[column], current[column], column));
    if (changed.length === 0) {
      result.same++;
    } else {
      result.change.push({ ...current, ...Object.fromEntries(changed.map(column => [column, row[column]])) });
    }
  });

  result.remove = liveRows.filter((_, i) => !seen.has(liveKeys[i]));
  return result;
}
