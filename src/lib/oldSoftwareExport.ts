import { fyLabel, fySuffix } from './financialYear';
import { monthCode } from './backupTables';
import { unicodeToSusha } from './sushaEncode';
import { sushaToUnicode } from './transliteration';
import schema from './oldSoftwareSchema.json';

// Writes this website's data as a MySQL file the old software (MySQL Administrator, MySQL 5.0)
// can restore. It is the reverse of oldSoftwareFile.ts, and follows the old software's own rules:
// - opening dues sit only on the 'Dues' bill row, and a bill's Balance is the due before that month
// - each customer's subscriptions are numbered 1, 2, 3 and bill lines point at that number
// - dates are dd/mm/yyyy where the old software keeps them as text
// - a customer's inactive mark and a hawker's region come from columns old_software_marks.sql adds

type Kind = 'n' | 's' | 'hindi' | 'dmy' | 'date';
type Column = [oldName: string, kind: Kind, value: (row: any) => any];

interface OldTableSpec {
  name: string;
  create: string;
  mode: 'replace';
  columns: Column[];
  rows: any[];
}

const FY_MONTHS = ['due', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];
const BATCH = 400;

// The website's column name is the old name in small letters, unless a table says otherwise.
// Older years kept the old software's own names, so capitals and underscores do not matter.
const squash = (name: string) => name.toLowerCase().replace(/_/g, '');
function pick(row: any, name: string) {
  if (row[name] !== undefined) return row[name];
  const lower = name.toLowerCase();
  if (row[lower] !== undefined) return row[lower];
  const wanted = squash(name);
  for (const key in row) if (squash(key) === wanted) return row[key];
  return undefined;
}
const first = (...values: any[]) => values.find(v => v !== undefined && v !== null && v !== '');

// The old software spells bill months its own way; bills made here say "August", "September"
const OLD_MONTH: Record<string, string> = {
  due: 'Dues', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'Aug', sep: 'Sept', oct: 'Oct',
  nov: 'Nov', dec: 'Dec', jan: 'Jan', feb: 'Feb', mar: 'March'
};
const oldMonth = (month: any) => OLD_MONTH[monthCode(month)] ?? month;
// Its year is the year the month falls in; some of this website's tables left it empty
const yearOf = (row: any, startYear: number) =>
  first(pick(row, 'year'), ['jan', 'feb', 'mar'].includes(monthCode(pick(row, 'month'))) ? String(startYear + 1) : String(startYear));
// Nothing charged is NULL in the old software, not 0
const orNull = (value: any) => (value === null || value === undefined || value === '' || Number(value) === 0 ? null : value);
const col = (oldName: string, kind: Kind = 'n', from?: string): Column => [oldName, kind, row => pick(row, from || oldName)];

function isoDate(value: any): string | null {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10) === '0000-00-00' ? null : text.slice(0, 10);
  const parts = text.split(/[/\-.]/);
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  return null;
}

// A date the old software typed wrongly ("03/07/201 ") goes back as it was
function dmy(value: any): string {
  const iso = isoDate(value);
  if (iso) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  // One kept here year first (204-01-01) is still written day first, as the old software typed it
  const parts = String(value ?? '').match(/^(\d{1,3})-(\d{1,2})-(\d{1,2})$/);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : String(value ?? '');
}

function sqlValue(value: any, kind: Kind): string {
  if (kind === 'dmy') return quote(dmy(value));
  if (kind === 'date') {
    const iso = isoDate(value);
    return iso ? quote(iso) : 'NULL';
  }
  if (value === null || value === undefined) return 'NULL';
  if (kind === 'n') {
    if (value === true) return '-1';
    if (value === false) return '0';
    if (String(value).trim() === '') return 'NULL';
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n * 10000) / 10000) : 'NULL';
  }
  return quote(kind === 'hindi' ? unicodeToSusha(String(value)) : String(value));
}

function quote(text: string): string {
  return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0') + "'";
}

const money = (v: any) => Number(v) || 0;
const round2 = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};

// ---- The old software's own rows, from its history kept on the website ----

// One table's rows from an old software dump, each value exactly as the dump wrote it ('text', 12, NULL)
export interface OldRows {
  columns: string[];
  rows: string[][];
}

export function oldRowsOf(text: string): OldRows {
  let columns: string[] = [];
  const rows: string[][] = [];
  const INSERT = /INSERT INTO `[^`]+` \(([^)]*)\) VALUES/g;
  for (let m = INSERT.exec(text); m; m = INSERT.exec(text)) {
    if (!columns.length) columns = Array.from(m[1].matchAll(/`([^`]+)`/g), c => c[1].toLowerCase());
    let pos = INSERT.lastIndex;
    while (pos < text.length) {
      while (pos < text.length && text[pos] !== '(' && text[pos] !== ';') pos++;
      if (pos >= text.length || text[pos] === ';') break;
      const tokens: string[] = [];
      pos++;
      while (pos < text.length) {
        while (text[pos] === ' ') pos++;
        const begin = pos;
        if (text[pos] === "'") {
          pos++;
          while (pos < text.length) {
            if (text[pos] === '\\') pos += 2;
            else if (text[pos] === "'" && text[pos + 1] === "'") pos += 2;
            else if (text[pos] === "'") { pos++; break; }
            else pos++;
          }
          tokens.push(text.slice(begin, pos));
        } else {
          while (pos < text.length && text[pos] !== ',' && text[pos] !== ')') pos++;
          tokens.push(text.slice(begin, pos).trim());
        }
        while (text[pos] === ' ') pos++;
        if (text[pos] === ')') { pos++; break; }
        pos++;
      }
      rows.push(tokens);
    }
    INSERT.lastIndex = pos;
  }
  return { columns, rows };
}

const UNESCAPE: Record<string, string> = { n: '\n', r: '\r', t: '\t', '0': '\0', Z: '\x1a' };
function tokenValue(token: string): any {
  if (token === 'NULL') return null;
  if (token[0] !== "'") return token;
  return token.slice(1, -1).replace(/\\([\s\S])|''/g, (all, ch) => (ch === undefined ? "'" : UNESCAPE[ch] ?? ch));
}

// The same meaning written two ways counts as the same: NULL, '' and 0; 'As Per Norm' and 'AsPerNorm'; 02/04/2026 and 2026-04-02
function sameMeaning(value: any): string {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (s === '' || s === '__/__/____') return '';
  const n = Number(s);
  if (!Number.isNaN(n)) return n === 0 ? '' : String(Math.round(n * 100) / 100);
  if (/^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(s)) {
    const iso = isoDate(s);
    return iso && Number(iso.slice(0, 4)) >= 1900 ? iso : s.split(/[/.-]/).map(Number).sort((a, b) => a - b).join('.');
  }
  return s.toLowerCase().replace(/\s+/g, '');
}

// How each column of a row the old software already has is written. By default a value with the same
// meaning is written exactly as the old software has it, and a changed value is the website's.
// - OLD_ONLY: the website never kept it truly; the old software's value stays while the rest of the row is unchanged
// - ALWAYS_OLD: the website holds only a default for it (every customer 'P'); the old software's value stays
// - FILL_FROM_OLD: lost on the way to the website; an empty value here takes the old software's
// - SAME_AS: two values the website and the old software use for the same thing
const OLD_ONLY: Record<string, string[]> = {
  receipt: ['debit', 'credit'], bill: ['sno'], billdel: ['sno'], billno: ['balance'],
  customer_detail: ['dis'], discontinue: ['hawker_id']
};
const ALWAYS_OLD: Record<string, string[]> = { customer: ['paid'], holiday: ['occasion'] };
const FILL_FROM_OLD: Record<string, string[]> = {
  receipt: ['narr', 'ramt'], customer_detail: ['s_date'], discontinue: ['s_date'], customer: ['phone']
};
const SAME_AS: Record<string, Record<string, string[]>> = {
  customer_detail: { from_day: ['', '1-7'] },
  publication: { circulation: ['', 'morning'] }
};
// Still empty after that: the value of another column (a receipt's RAmt is what was received)
const OR_ELSE: Record<string, Record<string, string>> = { receipt: { ramt: 'malrecpamt' } };
// What makes a row the same row when its number differs (renumbered on the website)
const SAME_ROW: Record<string, string[]> = {
  receipt: ['customer_id', 'receiptno', 'malrecpdt', 'malrecpamt'],
  billno: ['customer_id', 'month'],
  bill: ['customer_id', 'publica_id', 'month', 'qty', 'totalamt'],
  billdel: ['customer_id', 'publica_id', 'month'],
  customer_detail: ['customer_id', 'publica_id', 'sno'],
  rate: ['publica_id', 'dayofweek'],
  ratechange: ['publica_id', 'dayofweek', 'dated'],
  holiday: ['oc_date', 'publica_id']
};

/**
 * Finds, for each website row, the same row in the old software's table: by its number when the rest
 * agrees, otherwise by what makes it the same row. A row the old software has keeps the old software's
 * number; a new row keeps the website's, or gets the next free one if the old software uses it already.
 */
function matchOldRows(name: string, body: string, columns: Column[], rows: any[], old: OldRows) {
  const base = name.toLowerCase().replace(/\d{8}$/, '');
  const names = columns.map(c => c[0].toLowerCase());
  const at = new Map(old.columns.map((c, i) => [c, i]));
  const found = body.match(/PRIMARY KEY\s*\(`([^`]+)`\)/)?.[1]?.toLowerCase();
  const pk = found && at.has(found) && names.includes(found) ? found : undefined;
  const oldOnly = new Set(OLD_ONLY[base] || []);
  const alwaysOld = new Set(ALWAYS_OLD[base] || []);
  const fill = new Set(FILL_FROM_OLD[base] || []);
  const sameAs = SAME_AS[base] || {};
  // A table with its own number (customer, hawker...) is matched by that number alone
  const identity = (SAME_ROW[base] || (pk ? [] : names)).filter(n => at.has(n) && names.includes(n));
  const rest = names.filter(n => at.has(n) && n !== pk && n !== 'bill_id' && !oldOnly.has(n) && !alwaysOld.has(n) && !fill.has(n));
  const decoded = old.rows.map(r => r.map(tokenValue));
  const plain = (n: string, v: string) => (sameAs[n]?.includes(v) ? sameAs[n][0] : v);
  const meaning = (row: any[], n: string) => plain(n, sameMeaning(row[at.get(n)!]));
  const key = (get: (n: string) => string) => identity.map(get).join('|');

  const byPk = new Map<string, number>();
  const byKey = new Map<string, number[]>();
  decoded.forEach((r, i) => {
    if (pk) byPk.set(meaning(r, pk), i);
    const k = key(n => meaning(r, n));
    byKey.set(k, [...(byKey.get(k) || []), i]);
  });
  const used = new Set<number>();

  const list = rows.map(row => {
    const values = columns.map(([, , value]) => value(row));
    const tokens = values.map((v, i) => sqlValue(v, columns[i][1]));
    // The website's value read back as the file has it, so both are compared the same way
    const mine = (n: string) => {
      const i = names.indexOf(n);
      return plain(n, sameMeaning(columns[i][1] === 'hindi' ? values[i] : tokenValue(tokens[i])));
    };
    const theirs = (r: any[], n: string) =>
      columns[names.indexOf(n)][1] === 'hindi' ? sameMeaning(sushaToUnicode(String(r[at.get(n)!] ?? ''))) : meaning(r, n);
    // Hindi is the same when either way of reading it agrees
    const same = (o: any[], n: string) => {
      if (mine(n) === theirs(o, n)) return true;
      const i = names.indexOf(n);
      return columns[i][1] === 'hindi' && sameMeaning(tokenValue(tokens[i])) === meaning(o, n);
    };
    let match = pk ? byPk.get(mine(pk)) : undefined;
    if (match !== undefined && (used.has(match) || !identity.every(n => same(decoded[match!], n)))) match = undefined;
    if (match === undefined && identity.length) match = (byKey.get(key(mine)) || []).find(i => !used.has(i));
    if (match !== undefined) used.add(match);
    return { values, tokens, match, mine, same };
  });

  // Numbers: the old software's for its rows; a new row's own unless the old software already uses it
  const numbers = new Map<number, string>();
  if (pk) {
    const p = names.indexOf(pk);
    const taken = new Set(list.filter(x => x.match !== undefined).map(x => meaning(decoded[x.match!], pk)));
    const all = [...decoded.map(r => Number(r[at.get(pk)!]) || 0), ...list.map(x => Number(tokenValue(x.tokens[p])) || 0)];
    let next = Math.max(0, ...all);
    list.forEach((x, i) => {
      if (x.match !== undefined) numbers.set(i, old.rows[x.match][at.get(pk)!]);
      else if (taken.has(x.mine(pk))) numbers.set(i, String(++next));
      else taken.add(x.mine(pk));
    });
  }
  return { names, at, pk, decoded, list, numbers, rest, oldOnly, alwaysOld, fill, base };
}

/**
 * Each website row written the old software's way (see OLD_ONLY and the rest above), in the old
 * software's order: its rows first as it has them, then the rows new on the website.
 */
function withOldValues(name: string, body: string, columns: Column[], rows: any[], old: OldRows) {
  const m = matchOldRows(name, body, columns, rows, old);
  const orElse = OR_ELSE[m.base] || {};
  const lines = m.list.map((x, r) => {
    const o = x.match === undefined ? null : m.decoded[x.match];
    const unchanged = !!o && m.rest.every(n => x.same(o, n));
    const tokens = m.names.map((n, i) => {
      if (n === m.pk && m.numbers.has(r)) return m.numbers.get(r)!;
      if (!o || !m.at.has(n)) return x.tokens[i];
      const oldToken = old.rows[x.match!][m.at.get(n)!];
      if (m.alwaysOld.has(n)) return oldToken;
      if (m.oldOnly.has(n)) return unchanged ? oldToken : x.tokens[i];
      if (x.same(o, n)) return oldToken;
      if (m.fill.has(n) && x.mine(n) === '') return oldToken;
      return x.tokens[i];
    });
    // Only for a row the old software does not have; its own value (even 0) stands
    if (!o) m.names.forEach((n, i) => {
      if (orElse[n] && sameMeaning(tokenValue(tokens[i])) === '') tokens[i] = tokens[m.names.indexOf(orElse[n])];
    });
    return { order: x.match ?? Infinity, line: ' (' + tokens.join(',') + ')' };
  });
  const out = lines.map((l, i) => ({ ...l, i })).sort((a, b) => a.order - b.order || a.i - b.i).map(l => l.line);
  return { out, fromOld: m.list.filter(x => x.match !== undefined).length };
}

/**
 * A year's bills numbered as the old software has them, and every receipt and bill line pointed at the
 * right one: a website bill the old software has takes its number. A receipt keeps pointing at its own
 * customer's bill, whether it carries the website's number or the old software's (restored from it).
 */
function billNumbers(specs: Map<string, OldTableSpec>, year: string, old: OldRows) {
  const headers = specs.get(`billno${year}`);
  if (!headers) return;
  const m = matchOldRows(headers.name, headers.create, headers.columns, headers.rows, old);
  const value = (spec: OldTableSpec, column: string) => {
    const c = spec.columns.find(x => x[0].toLowerCase() === column);
    return (row: any) => (c ? c[2](row) : undefined);
  };
  const id = value(headers, 'bill_id'), customer = value(headers, 'customer_id'), month = value(headers, 'month');
  const website = new Map<number, { to: number; customer: number }>();
  const written = new Map<number, number>();
  const byMonth = new Map<string, number>();
  headers.rows.forEach((row, i) => {
    const mine = Number(id(row));
    const to = Number(m.numbers.get(i) ?? mine);
    website.set(mine, { to, customer: Number(customer(row)) });
    written.set(to, Number(customer(row)));
    byMonth.set(`${Number(customer(row))}|${sameMeaning(month(row))}`, to);
  });
  const point = (spec: OldTableSpec | undefined) => {
    if (!spec) return;
    const cId = value(spec, 'customer_id'), cMonth = value(spec, 'month');
    spec.columns = spec.columns.map(c => {
      if (c[0].toLowerCase() !== 'bill_id') return c;
      const before = c[2];
      return [c[0], c[1], (row: any) => {
        const bill = Number(before(row));
        const who = Number(cId(row));
        if (website.get(bill)?.customer === who) return website.get(bill)!.to;
        if (written.get(bill) === who) return bill;
        return byMonth.get(`${who}|${sameMeaning(cMonth(row))}`) ?? before(row);
      }] as Column;
    });
  };
  point(headers);
  point(specs.get(`bill${year}`));
  point(specs.get(`receipt${year}`));
}

// A receipt edited before the receipt screen was fixed kept its saved details inside the narration, again and again
function plainNarration(value: any): string {
  let text = String(value ?? '');
  while (text.trim().startsWith('{')) {
    try {
      text = String(JSON.parse(text).narr ?? '');
    } catch {
      break;
    }
  }
  return text;
}

// One saved detail of a receipt, looking also inside a narration an earlier edit filled with the details
function savedDetail(r: any, key: string): any {
  let details = remarksOf(r);
  for (let depth = 0; depth < 20 && details && typeof details === 'object'; depth++) {
    if (details[key] !== undefined && details[key] !== null && details[key] !== '') return details[key];
    try {
      details = typeof details.narr === 'string' && details.narr.trim().startsWith('{') ? JSON.parse(details.narr) : null;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function remarksOf(r: any): any {
  try {
    return typeof r.remarks === 'string' && r.remarks.trim().startsWith('{') ? JSON.parse(r.remarks) : {};
  } catch {
    return {};
  }
}

// The first and last day of a bill month, from the year's starting year
function monthRange(code: string, startYear: number): [string, string] | null {
  const index = FY_MONTHS.indexOf(code);
  if (index < 1) return null;
  const month = ((index + 2) % 12) + 1;
  const year = index >= 10 ? startYear + 1 : startYear;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, '0')}`];
}

// Each customer's subscriptions numbered 1, 2, 3, and a way to find the one a bill line belongs to
// A subscription the old software already had keeps its number there, so its older bills still point at it
function oldNumbers(old?: OldRows) {
  const byCustomer = new Map<number, { publica: number; start: string; end: string; qty: number; hawker: number; sno: number }[]>();
  if (!old) return byCustomer;
  const at = (n: string) => old.columns.indexOf(n);
  const [c, p, s, e, q, h, n] = ['customer_id', 'publica_id', 's_date', 'c_date', 'qty', 'hawker_id', 'sno'].map(at);
  if (c < 0 || n < 0) return byCustomer;
  for (const raw of old.rows) {
    const r = raw.map(tokenValue);
    const id = Number(r[c]);
    const entry = { publica: Number(r[p]), start: sameMeaning(r[s]), end: sameMeaning(r[e]), qty: Number(r[q]), hawker: Number(r[h]), sno: Number(r[n]) };
    byCustomer.set(id, [...(byCustomer.get(id) || []), entry]);
  }
  return byCustomer;
}

function numberSubscriptions(details: any[], startYear: number, old?: OldRows) {
  const before = oldNumbers(old);
  const byCustomer = new Map<number, any[]>();
  for (const d of details) {
    const id = Number(pick(d, 'customer_id'));
    byCustomer.set(id, [...(byCustomer.get(id) || []), d]);
  }
  const numbered: { row: any; sno: number }[] = [];
  const lookup = new Map<string, { sno: number; start: string; end: string | null; hawker: any }[]>();
  for (const [customer, rows] of Array.from(byCustomer).sort((a, b) => a[0] - b[0])) {
    rows.sort((a, b) => (Number(pick(a, 'sno')) || 0) - (Number(pick(b, 'sno')) || 0) || String(isoDate(pick(a, 's_date'))).localeCompare(String(isoDate(pick(b, 's_date')))));
    const theirs = before.get(customer) || [];
    const taken = new Set<number>();
    let next = Math.max(0, ...theirs.map(t => t.sno || 0));
    const numbers = rows.map(row => {
      if (!theirs.length) return 0;
      const start = sameMeaning(pick(row, 's_date'));
      const score = (t: (typeof theirs)[number]) =>
        (t.start === start ? 4 : 0) + (t.qty === Number(pick(row, 'qty')) ? 2 : 0) + (t.hawker === Number(pick(row, 'hawker_id')) ? 1 : 0) + (t.end === sameMeaning(pick(row, 'c_date')) ? 1 : 0);
      const best = theirs.filter(t => t.publica === Number(pick(row, 'publica_id')) && !taken.has(t.sno) && score(t) >= 3).sort((a, b) => score(b) - score(a))[0];
      if (!best) return 0;
      taken.add(best.sno);
      return best.sno;
    });
    rows.forEach((row, i) => {
      const sno = theirs.length ? numbers[i] || ++next : i + 1;
      numbered.push({ row, sno });
      const key = `${customer}|${pick(row, 'publica_id')}`;
      lookup.set(key, [...(lookup.get(key) || []), { sno, start: isoDate(pick(row, 's_date')) || '0000-00-00', end: isoDate(pick(row, 'c_date')), hawker: pick(row, 'hawker_id') }]);
    });
  }
  const subscriptionFor = (customer: any, publica: any, month: any) => {
    const list = lookup.get(`${Number(customer)}|${publica}`) || [];
    if (list.length === 0) return null;
    const range = monthRange(monthCode(month), startYear);
    const latest = (rows: typeof list) => rows.reduce((best, r) => (r.start >= best.start ? r : best));
    const active = range ? list.filter(r => r.start <= range[1] && (!r.end || r.end >= range[0])) : [];
    return latest(active.length ? active : list);
  };
  return { numbered, subscriptionFor, lookup };
}

// The due before each month's bill: opening dues + earlier months' bills - earlier months' receipts
function previousDues(headers: any[], lines: any[], deliveries: any[], receipts: any[]) {
  const charge = new Map<string, number>();
  const add = (customer: any, month: any, amount: number) => {
    const key = `${Number(customer)}|${FY_MONTHS.indexOf(monthCode(month))}`;
    charge.set(key, (charge.get(key) || 0) + amount);
  };
  const dues = new Map<number, number>();
  for (const h of headers) {
    if (monthCode(pick(h, 'month')) === 'due') dues.set(Number(pick(h, 'customer_id')), money(pick(h, 'due_amt')));
    else add(pick(h, 'customer_id'), pick(h, 'month'), -money(pick(h, 'dis_amt')));
  }
  for (const l of lines) add(pick(l, 'customer_id'), pick(l, 'month'), money(pick(l, 'total_amt')));
  for (const d of deliveries) add(pick(d, 'customer_id'), pick(d, 'month'), money(pick(d, 'dely')));
  for (const r of receipts) add(pick(r, 'customer_id'), pick(r, 'month'), -(money(first(r.mal_recp_amt, pick(r, 'MalRecpAmt'))) + money(pick(r, 'less_amt'))));

  // A bill made here stores the amount payable after the month (Balance = -(due before + this month)),
  // a bill from the old software the due before it. Either becomes the old meaning; a figure that
  // fits neither is the old software's own and is kept as it is.
  return (header: any) => {
    const id = Number(pick(header, 'customer_id'));
    const upTo = FY_MONTHS.indexOf(monthCode(pick(header, 'month')));
    let owed = dues.get(id) || 0;
    for (let m = 1; m < upTo; m++) owed += charge.get(`${id}|${m}`) || 0;
    // Receipts against the opening dues count from the first month
    owed += charge.get(`${id}|0`) || 0;
    const before = round2(-owed);
    const stored = pick(header, 'balance');
    if (stored === null || stored === undefined || stored === '') return before;
    const thisMonth = charge.get(`${id}|${upTo}`) || 0;
    const fits = (value: number) => Math.abs(Number(stored) - value) < 1;
    return fits(before) || fits(before - thisMonth) ? before : Number(stored);
  };
}

/**
 * The old software's customer_mobile table (91 + 10 digits, one row per number) with the phone numbers
 * kept on this website. A customer whose website numbers it already has keeps its rows as they are (so a
 * second number stays); one with a number it lacks gets the website's numbers; one with no number here
 * keeps what the old software had.
 */
// The 10-digit mobile numbers in a phone field ("919413079793, 9414866528")
const tenDigitMobiles = (phone: any) =>
  Array.from(new Set(Array.from(String(phone ?? '').matchAll(/(?:\+?91|0)?[\s-]*([6-9]\d{9})(?!\d)/g), x => x[1])));

function customerMobiles(customers: any[], old?: OldRows) {
  const theirs = new Map<number, { id: number; mobile: string }[]>();
  let next = 0;
  if (old) {
    const [i, c, m] = ['id', 'customer_id', 'mobile'].map(n => old.columns.indexOf(n));
    for (const raw of old.rows) {
      const r = raw.map(tokenValue);
      const row = { id: Number(r[i]), mobile: String(r[m] ?? '') };
      next = Math.max(next, row.id || 0);
      theirs.set(Number(r[c]), [...(theirs.get(Number(r[c])) || []), row]);
    }
  }
  const ten = (text: string) => text.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  const rows: { id: number; customer_id: number; mobile: string }[] = [];
  const done = new Set<number>();
  for (const customer of customers) {
    const id = Number(pick(customer, 'customer_id'));
    const mine = tenDigitMobiles(pick(customer, 'phone'));
    const had = theirs.get(id) || [];
    const hadTen = new Set(had.map(h => ten(h.mobile)));
    done.add(id);
    if (!mine.length || mine.every(n => hadTen.has(n))) {
      had.forEach(h => rows.push({ id: h.id, customer_id: id, mobile: h.mobile }));
      continue;
    }
    for (const n of mine) {
      const same = had.find(h => ten(h.mobile) === n);
      rows.push({ id: same ? same.id : ++next, customer_id: id, mobile: same ? same.mobile : `91${n}` });
    }
  }
  // Numbers of a customer this website does not have stay as the old software kept them
  theirs.forEach((had, id) => { if (!done.has(id)) had.forEach(h => rows.push({ id: h.id, customer_id: id, mobile: h.mobile })); });
  return rows.sort((a, b) => a.id - b.id);
}

export function oldSoftwareSpecs(tables: Record<string, any[]>, suffix = fySuffix(), old?: Map<string, OldRows>): OldTableSpec[] {
  const startYear = Number(suffix.slice(0, 4));
  const get = (name: string) => tables[name] || [];
  const details = numberSubscriptions(get('customer_detail'), startYear, old?.get('customer_detail'));
  const headers = get(`billno${suffix}`);
  const lines = get(`bill${suffix}`);
  const deliveries = get(`billdel${suffix}`);
  const receipts = get(`receipt${suffix}`);
  const dueBefore = previousDues(headers, lines, deliveries, receipts);
  // Lines of an older year in the old software's own names keep their own numbers
  const lineSno = (row: any) => ('Customer_id' in row) ? row.sno : details.subscriptionFor(pick(row, 'customer_id'), pick(row, 'publica_id'), pick(row, 'month'))?.sno ?? pick(row, 'sno');
  const label = fyLabel(new Date(Date.UTC(startYear, 5, 1)));
  // The old software keeps mobile numbers in customer_mobile, not in the customer's phone
  const mobilesThere = new Map<number, Set<string>>();
  const kept = old?.get('customer_mobile');
  if (kept) {
    const [c, m] = ['customer_id', 'mobile'].map(n => kept.columns.indexOf(n));
    for (const raw of kept.rows) {
      const id = Number(tokenValue(raw[c]));
      mobilesThere.set(id, (mobilesThere.get(id) || new Set()).add(String(tokenValue(raw[m]) ?? '').replace(/\D/g, '').slice(-10)));
    }
  }
  const phoneHere = (r: any) => {
    const numbers = tenDigitMobiles(pick(r, 'phone'));
    const there = mobilesThere.get(Number(pick(r, 'customer_id')));
    return numbers.length && there && numbers.every(n => there.has(n)) ? '' : pick(r, 'phone');
  };
  const openSubscriptions = new Set(get('customer_detail').filter(d => !isoDate(pick(d, 'c_date'))).map(d => Number(pick(d, 'customer_id'))));

  return [
    {
      name: 'customer',
      mode: 'replace',
      create: "`Customer_id` int(11) NOT NULL auto_increment,\n  `name_eng` varchar(50) default NULL,\n  `Type_Cust` tinyint(1) default NULL,\n  `name_hindi` varchar(50) default NULL,\n  `add1` text,\n  `add2` text,\n  `phone` tinytext,\n  `Security_Deposit` int(11) default NULL,\n  `Type` tinytext,\n  `Priority` int(11) default NULL,\n  `Self_Agent` tinyint(1) default NULL,\n  `FontType` tinyint(1) default NULL,\n  `dueamount` float default NULL,\n  `Region_id` int(11) default NULL,\n  `Paid` text,\n  `Delivery` int(11) default NULL,\n  `Discount` int(11) default NULL,\n  `GovtSupply` tinyint(1) default NULL,\n  `Hindi_Add` text,\n  `Cbal` float default NULL,\n  `pmonth` text,\n  `pyear` text,\n  `is_inactive` tinyint(1) NOT NULL default '0',\n  PRIMARY KEY  (`Customer_id`),\n  KEY `idx_inactive_region` (`is_inactive`,`Region_id`)",
      columns: [
        col('Customer_id'), col('name_eng', 's'), col('Type_Cust'),
        ['name_hindi', 'hindi', r => (pick(r, 'name_hindi') || pick(r, 'name_hindi_unicode') || null)],
        col('add1', 's'), col('add2', 's'), ['phone', 's', phoneHere], col('Security_Deposit'), col('Type', 's'), col('Priority'),
        col('Self_Agent'), col('FontType', 'n', 'font_type'), col('dueamount'), col('Region_id'), col('Paid', 's'), col('Delivery'),
        col('Discount'), col('GovtSupply', 'n', 'govt_supply'), col('Hindi_Add', 'hindi', 'hindi_add'), col('Cbal'), col('pmonth', 's'), col('pyear', 's'),
        // Kept by the website once old_software_marks.sql has run; until then a customer with no running paper counts as inactive
        ['is_inactive', 'n', r => pick(r, 'is_inactive') ?? (openSubscriptions.has(Number(pick(r, 'customer_id'))) ? 0 : 1)]
      ],
      rows: get('customer')
    },
    {
      name: 'customer_detail',
      mode: 'replace',
      create: "`sno` int(11) default NULL,\n  `Customer_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `Hawker_id` int(11) default NULL,\n  `Qty` int(11) default NULL,\n  `Circulation` tinytext,\n  `S_Date` varchar(10) default NULL,\n  `C_Date` varchar(10) default NULL,\n  `From_Day` text,\n  `Hawk_Sub` tinyint(1) default NULL,\n  `Dis` text,\n  `Dely` int(11) default NULL,\n  KEY `idx_customerid` (`Customer_id`),\n  KEY `idx_hawkerid` (`Hawker_id`),\n  KEY `idx_publicaid` (`Publica_id`)",
      columns: [
        ['sno', 'n', r => r.sno], ...['Customer_id', 'Publica_id', 'Hawker_id', 'Qty'].map(n => [n, 'n', (r: any) => pick(r.row, n)] as Column),
        ['Circulation', 's', r => pick(r.row, 'circulation')], ['S_Date', 'dmy', r => pick(r.row, 's_date')], ['C_Date', 'dmy', r => pick(r.row, 'c_date')],
        ['From_Day', 's', r => pick(r.row, 'from_day')], ['Hawk_Sub', 'n', r => pick(r.row, 'hawk_sub')], ['Dis', 's', r => pick(r.row, 'dis') ?? ''], ['Dely', 'n', r => pick(r.row, 'dely')]
      ],
      rows: details.numbered
    },
    {
      name: 'customer_mobile',
      mode: 'replace',
      create: "`id` int(11) NOT NULL auto_increment,\n  `customer_id` int(11) default NULL,\n  `mobile` varchar(15) default NULL,\n  PRIMARY KEY  (`id`),\n  UNIQUE KEY `uk_cust_mobile` (`customer_id`,`mobile`),\n  KEY `customer_id` (`customer_id`),\n  KEY `idx_custid` (`customer_id`)",
      columns: [col('id'), col('customer_id'), col('mobile', 's')],
      rows: customerMobiles(get('customer'), old?.get('customer_mobile'))
    },
    {
      name: 'hawker',
      mode: 'replace',
      create: "`Hawker_id` int(11) NOT NULL auto_increment,\n  `name` varchar(50) default NULL,\n  `address` text,\n  `city` varchar(50) default NULL,\n  `phone` tinytext,\n  `mobile` tinytext,\n  `Region_id` int(11) default NULL,\n  PRIMARY KEY  (`Hawker_id`)",
      columns: [col('Hawker_id'), col('name', 's'), col('address', 's'), col('city', 's'), col('phone', 's'), col('mobile', 's'), col('Region_id')],
      rows: get('hawker')
    },
    {
      name: 'publication',
      mode: 'replace',
      create: "`Publica_id` int(11) NOT NULL auto_increment,\n  `Public_name` varchar(50) default NULL,\n  `TypeP` varchar(15) default NULL,\n  `Publish_id` int(11) default NULL,\n  `Abrv` varchar(5) default NULL,\n  `Circulation` varchar(15) default NULL,\n  `Duration` tinytext,\n  `MagzineDay` tinytext,\n  `MagzineMonth` tinytext,\n  `ChrDel` tinyint(1) default NULL,\n  `Pub_Hindi` text,\n  PRIMARY KEY  (`Publica_id`)",
      columns: [
        col('Publica_id'), col('Public_name', 's'), col('TypeP', 's', 'type_p'), col('Publish_id'), col('Abrv', 's'), col('Circulation', 's'),
        col('Duration', 's'), col('MagzineDay', 's', 'magzine_day'), col('MagzineMonth', 's', 'magzine_month'), col('ChrDel', 'n', 'chr_del'), col('Pub_Hindi', 'hindi')
      ],
      rows: get('publication')
    },
    {
      name: 'publisher',
      mode: 'replace',
      create: "`Publish_id` int(11) NOT NULL auto_increment,\n  `name` varchar(50) default NULL,\n  `address` text,\n  `city` varchar(50) default NULL,\n  `state` varchar(50) default NULL,\n  `pincode` tinytext,\n  `phone` tinytext,\n  `mobile` tinytext,\n  `fax` tinytext,\n  `email` text,\n  `Website` text,\n  `Category` tinytext,\n  `Type` tinytext,\n  PRIMARY KEY  (`Publish_id`)",
      columns: [col('Publish_id'), ...['name', 'address', 'city', 'state', 'pincode', 'phone', 'mobile', 'fax', 'email', 'Website', 'Category', 'Type'].map(n => col(n, 's'))],
      rows: get('publisher')
    },
    {
      name: 'regiond',
      mode: 'replace',
      create: "`Region_id` int(11) NOT NULL auto_increment,\n  `Region_name` varchar(50) default NULL,\n  PRIMARY KEY  (`Region_id`)",
      columns: [col('Region_id'), col('Region_name', 's')],
      rows: get('regiond')
    },
    {
      name: 'collect',
      mode: 'replace',
      create: "`Collect_id` int(11) NOT NULL auto_increment,\n  `name` varchar(50) default NULL,\n  `address` text,\n  `city` varchar(50) default NULL,\n  `phone` tinytext,\n  `mobile` tinytext,\n  PRIMARY KEY  (`Collect_id`)",
      columns: [col('Collect_id'), ...['name', 'address', 'city', 'phone', 'mobile'].map(n => col(n, 's'))],
      rows: get('collect')
    },
    {
      name: 'rate',
      mode: 'replace',
      create: "`Publica_id` int(11) default NULL,\n  `Rate` float default NULL,\n  `Dayofweek` int(11) default NULL",
      columns: [col('Publica_id'), col('Rate'), col('Dayofweek')],
      // Repeated rows for one paper and day: billing here takes the first, so that one goes
      rows: get('rate').filter((r, i, all) => all.findIndex(o => pick(o, 'publica_id') === pick(r, 'publica_id') && pick(o, 'dayofweek') === pick(r, 'dayofweek')) === i)
    },
    {
      name: 'ratechange',
      mode: 'replace',
      create: "`Publica_id` int(11) default NULL,\n  `OldRate` float default NULL,\n  `NewRate` float default NULL,\n  `Dated` date default NULL,\n  `Dayofweek` int(11) default NULL",
      columns: [col('Publica_id'), col('OldRate'), col('NewRate'), ['Dated', 'date', r => pick(r, 'effective_date') ?? pick(r, 'dated')], col('Dayofweek')],
      rows: get('ratechange')
    },
    {
      name: 'holiday',
      mode: 'replace',
      create: "`Oc_Date` varchar(10) default NULL,\n  `Occasion` tinytext,\n  `Publica_id` int(11) default NULL",
      columns: [['Oc_Date', 'dmy', r => pick(r, 'oc_date') ?? pick(r, 'dated')], ['Occasion', 's', r => pick(r, 'occasion') ?? pick(r, 'remark') ?? ''], col('Publica_id')],
      rows: get('holiday')
    },
    {
      name: 'publicationdis',
      mode: 'replace',
      create: "`Publica_id` int(11) default NULL,\n  `FromDate` date default NULL,\n  `ToDate` date default NULL",
      columns: [col('Publica_id'), ['FromDate', 'date', r => pick(r, 'entry_date')], ['ToDate', 'date', r => pick(r, 'oc_date')]],
      rows: get('publicationdis')
    },
    {
      name: 'publicationsup',
      mode: 'replace',
      create: "`Publica_id` int(11) default NULL,\n  `PublicaSup_id` int(11) default NULL,\n  `Month` text,\n  `Year` text,\n  `Region_id` int(11) default NULL",
      columns: [col('Publica_id'), col('PublicaSup_id'), col('Month', 's'), col('Year', 's'), col('Region_id')],
      rows: get('publicationsup')
    },
    {
      name: `discontinue${suffix}`,
      mode: 'replace',
      create: "`Discontinue_id` int(11) NOT NULL auto_increment,\n  `SNo` int(11) default NULL,\n  `EntryDate` varchar(10) default NULL,\n  `Customer_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `Temp_Perma` varchar(1) default NULL,\n  `Temp_From` date default NULL,\n  `Temp_To` date default NULL,\n  `S_Date` varchar(10) default NULL,\n  `C_Date` varchar(10) default NULL,\n  `Hawker_id` int(11) default NULL,\n  PRIMARY KEY  (`Discontinue_id`)",
      columns: [
        col('Discontinue_id'), col('SNo', 'n', 'sno'), ['EntryDate', 'dmy', r => pick(r, 'entry_date')], col('Customer_id'), col('Publica_id'),
        ['Temp_Perma', 's', r => (/^p/i.test(String(pick(r, 'temp_perma') || '')) ? 'P' : 'T')],
        ['Temp_From', 'date', r => pick(r, 'temp_from')], ['Temp_To', 'date', r => pick(r, 'temp_to')],
        ['S_Date', 'dmy', r => pick(r, 's_date')], ['C_Date', 'dmy', r => pick(r, 'c_date')],
        ['Hawker_id', 'n', r => pick(r, 'hawker_id') ?? (details.lookup.get(`${Number(pick(r, 'customer_id'))}|${pick(r, 'publica_id')}`) || [])
          .find(s => s.start === isoDate(pick(r, 's_date')))?.hawker ?? null]
      ],
      rows: get('discontinue').filter(r => r.financial_year === label || (!r.financial_year && suffix === fySuffix()))
    },
    {
      name: `billno${suffix}`,
      mode: 'replace',
      create: "`Bill_id` int(11) NOT NULL auto_increment,\n  `Customer_id` int(11) default NULL,\n  `Region_id` int(11) default NULL,\n  `Due_Amt` float default NULL,\n  `Del_Amt` float default NULL,\n  `Dis_Amt` float default NULL,\n  `Month` text,\n  `year` text,\n  `Balance` float default NULL,\n  PRIMARY KEY  (`Bill_id`),\n  KEY `idx_custid_month` (`Customer_id`,`Month`(10))",
      columns: [
        col('Bill_id'), col('Customer_id'), col('Region_id'),
        // An older year still in the old software's own names was billed there, so its figures stay as they are
        ['Due_Amt', 'n', r => ('Due_Amt' in r ? r.Due_Amt : monthCode(pick(r, 'month')) === 'due' ? pick(r, 'due_amt') : null)],
        ['Del_Amt', 'n', r => ('Del_Amt' in r ? r.Del_Amt : orNull(pick(r, 'del_amt')))], ['Dis_Amt', 'n', r => ('Dis_Amt' in r ? r.Dis_Amt : orNull(pick(r, 'dis_amt')))],
        ['Month', 's', r => oldMonth(pick(r, 'month'))], ['year', 's', r => yearOf(r, startYear)],
        ['Balance', 'n', r => ('Balance' in r ? r.Balance : monthCode(pick(r, 'month')) === 'due' ? orNull(pick(r, 'balance')) : dueBefore(r))]
      ],
      rows: headers
    },
    {
      name: `bill${suffix}`,
      mode: 'replace',
      create: "`Bill_id` int(11) default NULL,\n  `Customer_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `Region_id` int(11) default NULL,\n  `Qty` int(11) default NULL,\n  `Rate` float default NULL,\n  `D_Charges` float default NULL,\n  `TotalAmt` float default NULL,\n  `Month` text,\n  `year` text,\n  `sno` int(11) default NULL,\n  KEY `idx_custid_month` (`Customer_id`,`Month`(10))",
      columns: [
        col('Bill_id'), col('Customer_id'), col('Publica_id'), col('Region_id'), col('Qty'), col('Rate'), col('D_Charges'),
        col('TotalAmt', 'n', 'total_amt'), ['Month', 's', r => oldMonth(pick(r, 'month'))], ['year', 's', r => yearOf(r, startYear)], ['sno', 'n', lineSno]
      ],
      rows: lines
    },
    {
      name: `billdel${suffix}`,
      mode: 'replace',
      create: "`Customer_id` int(11) default NULL,\n  `Region_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `month` text,\n  `year` text,\n  `Dely` int(11) default NULL,\n  `sno` int(11) default NULL,\n  KEY `idx_custid_month` (`Customer_id`,`month`(10))",
      columns: [col('Customer_id'), col('Region_id'), col('Publica_id'), ['month', 's', r => oldMonth(pick(r, 'month'))], ['year', 's', r => yearOf(r, startYear)], col('Dely'), ['sno', 'n', lineSno]],
      rows: deliveries
    },
    {
      name: `receipt${suffix}`,
      mode: 'replace',
      create: "`Receipt_id` int(11) NOT NULL auto_increment,\n  `Bill_id` int(11) default NULL,\n  `ReceiptNo` int(11) default NULL,\n  `ManualRepNo` int(11) default NULL,\n  `BillDate` varchar(10) default NULL,\n  `BillAmt` float default NULL,\n  `MalRecpDt` varchar(10) default NULL,\n  `Month` tinytext,\n  `Year` tinytext,\n  `DueAmt` float default NULL,\n  `MalRecpAmt` float default NULL,\n  `Balance` float default NULL,\n  `LessAmt` float default NULL,\n  `RAmt` float default NULL,\n  `ChequeNo` tinytext,\n  `ChequeDate` varchar(10) default NULL,\n  `Debit` float default NULL,\n  `Credit` float default NULL,\n  `Cash_Chq` tinytext,\n  `Narr` text,\n  `customer_id` int(11) default NULL,\n  PRIMARY KEY  (`Receipt_id`),\n  KEY `idx_custid` (`customer_id`)",
      columns: [
        // A receipt made or restored here keeps its book details in remarks; an older year's has the old columns
        ['Receipt_id', 'n', r => first(r.id, pick(r, 'Receipt_id'))], ['Bill_id', 'n', r => first(remarksOf(r).bill_no, pick(r, 'Bill_id'))],
        ['ReceiptNo', 'n', r => first(r.recp_no, pick(r, 'ReceiptNo'))],
        ['ManualRepNo', 'n', r => first(remarksOf(r).manual_rep_no, remarksOf(r).mal_rep_no, pick(r, 'ManualRepNo'))],
        ['BillDate', 'dmy', r => first(r.recp_date, pick(r, 'BillDate'))], ['BillAmt', 'n', r => first(r.bill_amt, pick(r, 'BillAmt'))],
        ['MalRecpDt', 'dmy', r => first(remarksOf(r).mal_recp_dt, pick(r, 'MalRecpDt'), r.recp_date)],
        ['Month', 's', r => oldMonth(pick(r, 'month'))], ['Year', 's', r => yearOf(r, startYear)], ['DueAmt', 'n', r => pick(r, 'DueAmt') ?? null],
        ['MalRecpAmt', 'n', r => first(r.mal_recp_amt, pick(r, 'MalRecpAmt'))],
        ['Balance', 'n', r => first(remarksOf(r).balance, pick(r, 'Balance'), 0)], ['LessAmt', 'n', r => first(pick(r, 'less_amt'), 0)],
        ['RAmt', 'n', r => first(savedDetail(r, 'r_amt'), pick(r, 'RAmt')) ?? null],
        ['ChequeNo', 's', r => first(remarksOf(r).cheque_no, pick(r, 'ChequeNo'), '')],
        ['ChequeDate', 's', r => (isoDate(remarksOf(r).cheque_date) ? dmy(remarksOf(r).cheque_date) : first(pick(r, 'ChequeDate'), '__/__/____'))],
        ['Debit', 'n', r => first(pick(r, 'Debit'), r.bill_amt)], ['Credit', 'n', r => first(pick(r, 'Credit'), r.mal_recp_amt)],
        ['Cash_Chq', 's', r => first(remarksOf(r).cash_chq, pick(r, 'Cash_Chq'), 'Cash')],
        ['Narr', 's', r => plainNarration(first(remarksOf(r).narr, pick(r, 'Narr'), ''))], ['customer_id', 'n', r => pick(r, 'customer_id')]
      ],
      rows: receipts
    },
    {
      name: `retailsale${suffix}`,
      mode: 'replace',
      create: "`Retail_id` int(11) NOT NULL auto_increment,\n  `Vr_Date` date default NULL,\n  `Customer_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `Copies` int(11) default NULL,\n  `Rate` float default NULL,\n  `Amt` float default NULL,\n  `Narr` text,\n  PRIMARY KEY  (`Retail_id`)",
      columns: [col('Retail_id'), col('Vr_Date', 'date'), col('Customer_id'), col('Publica_id'), col('Copies'), col('Rate'), col('Amt'), col('Narr', 's')],
      // A sale dated in another year (last year's copied in) is that year's, not this one's
      rows: get(`retailsale${suffix}`).filter(r => {
        const day = isoDate(pick(r, 'vr_date'));
        return !day || (day >= `${startYear}-04-01` && day <= `${startYear + 1}-03-31`);
      })
    },
    {
      name: `receiptissue${suffix}`,
      mode: 'replace',
      create: "`sno` int(11) default NULL,\n  `Collect_id` int(11) default NULL,\n  `ReceiptFrom` text,\n  `ReceiptTo` text,\n  `IssueDate` date default NULL,\n  `RecDate` date default NULL",
      columns: [col('sno'), col('Collect_id'), col('ReceiptFrom', 's'), col('ReceiptTo', 's'), col('IssueDate', 'date'), col('RecDate', 'date')],
      rows: get(`receiptissue${suffix}`)
    }
  ];
}

// Every year the old software has tables for, from 2007-08 to the running one
// A year the old software had already closed when its history was saved here (historyYear is the year it
// was saved in): the old software's own copy is the right one. A year worked on here, such as 2026-27,
// always comes from this website, even after it closes.
export const isClosedYear = (year: string | null, historyYear: string) => !!year && !!historyYear && year < historyYear;

export function oldSoftwareYears(): string[] {
  const years: string[] = [];
  for (let start = 2007; start <= Number(fySuffix().slice(0, 4)); start++) years.push(`${start}${start + 1}`);
  return years;
}

const YEARLY = ['billno', 'bill', 'billdel', 'receipt', 'retailsale', 'receiptissue'];
const MASTERS = ['customer', 'customer_detail', 'hawker', 'publication', 'publisher', 'regiond', 'collect', 'rate', 'ratechange',
  'holiday', 'publicationdis', 'publicationsup', 'discontinue'];

// The tables the export reads from this website; years it has no table for are skipped
export function oldSoftwareSourceTables(years = oldSoftwareYears()): string[] {
  return [...MASTERS, ...years.flatMap(year => YEARLY.map(name => `${name}${year}`))];
}

// A database name MySQL takes as it is: letters, digits and _
export const validDatabaseName = (name: string) => /^[A-Za-z0-9_]{1,64}$/.test(name);

// The file's opening. It makes the database and uses it: test (the live one), or another name such as
// test_check to restore next to the live one and compare before replacing it.
export function oldHeader(database = 'test'): string {
  if (!validDatabaseName(database)) throw new Error(`Database name "${database}" can only have letters, digits and _`);
  return OLD_HEADER.replace(/\btest\b/g, database);
}

export const OLD_HEADER = [
  '-- MySQL Administrator dump 1.4\n--\n-- ------------------------------------------------------\n-- Made by the Aryan News Agency website\n\n\n',
  '/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;\n/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;\n/*!40101 SET NAMES utf8 */;\n\n',
  "/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;\n/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;\n/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;\n\n\n",
  '--\n-- Create schema test\n--\n\nCREATE DATABASE /*!32312 IF NOT EXISTS*/ test;\nUSE test;\n\n'
].join('');
// The old software's view and function, then the closing settings
export const OLD_FOOTER = (schema as { tail: string }).tail +
  '/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;\n/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;\n/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;\n/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;\n/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;\n/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;\n';

const OLD_TABLES = (schema as { tables: { name: string; body: string; engine: string }[] }).tables;

export interface OldFileCount {
  filled: string[];
  // Taken whole from the old software's history kept on the website (older years, its own tables)
  copied: string[];
  empty: string[];
}

// Where each table's part of an old software dump begins and ends, so it can be copied byte for byte
const SECTION = /\r?\n--\r?\n-- (?:Table structure for table `[^`]*`\.`([^`]+)`|View structure for view|Temporary table structure|Function|Procedure|Definition of)/g;

export async function indexOldSections(file: Blob): Promise<Map<string, [number, number]>> {
  const PIECE = 16 * 1024 * 1024;
  const sections = new Map<string, [number, number]>();
  let open: { name: string; start: number } | null = null;
  const close = (end: number) => {
    if (open) sections.set(open.name, [open.start, end]);
    open = null;
  };
  let carry = '';
  let carryAt = 0;
  for (let offset = 0; offset < file.size; offset += PIECE) {
    const bytes = new Uint8Array(await file.slice(offset, offset + PIECE).arrayBuffer());
    let piece = '';
    for (let i = 0; i < bytes.length; i += 32768) piece += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768) as unknown as number[]);
    const text = carry + piece;
    const base = carryAt;
    // A marker cut by the piece's end is found in the next round
    const limit = offset + PIECE >= file.size ? text.length : Math.max(0, text.length - 200);
    SECTION.lastIndex = 0;
    for (let m = SECTION.exec(text); m && m.index < limit; m = SECTION.exec(text)) {
      const start = base + m.index + m[0].indexOf('-');
      close(start);
      if (m[1]) open = { name: m[1].toLowerCase(), start };
    }
    carry = text.slice(limit);
    carryAt = base + limit;
  }
  close(file.size);
  return sections;
}

/**
 * One part of a complete backup for the old software, made from this website alone: the master
 * tables (year = null) or one year's tables. Every table the old software has (oldSoftwareSchema.json,
 * its structure only, from its 1 Nov 2026 backup) is written in its own layout; tables this website
 * keeps are filled from it, the rest go in empty so the old software still opens.
 * The file is OLD_HEADER, the masters, each year in turn, then OLD_FOOTER.
 */
export function* oldSoftwarePart(
  tables: Record<string, any[]>,
  year: string | null,
  count: OldFileCount,
  inHistory: (name: string) => boolean = () => false,
  old: Map<string, OldRows> = new Map(),
  historyYear = ''
): Generator<string | { copy: string }> {
  const specs = new Map(oldSoftwareSpecs(tables, year || fySuffix(), old).map(s => [s.name.toLowerCase(), s]));
  if (year && old.has(`billno${year}`)) billNumbers(specs, year, old.get(`billno${year}`)!);
  // A name ending in a date, like customer_backup_20261028, is not a year's table
  const years = oldSoftwareYears();
  const mine = (name: string) => (year ? name.endsWith(year) : !years.some(y => name.endsWith(y)));
  const layouts = OLD_TABLES.filter(t => mine(t.name.toLowerCase()));
  // A year the old software never had, such as one opened on this website after it stopped
  for (const [name, spec] of Array.from(specs)) {
    if (mine(name) && spec.rows.length && !layouts.some(t => t.name.toLowerCase() === name)) {
      layouts.push({ name: spec.name, body: '  ' + spec.create, engine: 'ENGINE=MyISAM DEFAULT CHARSET=latin1' });
    }
  }

  for (const table of layouts) {
    const name = table.name;
    const spec = specs.get(name.toLowerCase());
    // Nothing here for it, but the old software's history has it: that part goes in as it is
    // A closed year is the old software's own: it goes in exactly as the old software kept it
    if ((!(spec && spec.rows.length) || isClosedYear(year, historyYear)) && inHistory(name.toLowerCase())) {
      yield { copy: name.toLowerCase() };
      count.copied.push(name);
      continue;
    }
    yield `--\n-- Table structure for table \`test\`.\`${name}\`\n--\n\nDROP TABLE IF EXISTS \`${name}\`;\nCREATE TABLE \`${name}\` (\n${table.body}\n) ${table.engine};\n\n`;
    yield `--\n-- Dumping data for table \`test\`.\`${name}\`\n--\n\n/*!40000 ALTER TABLE \`${name}\` DISABLE KEYS */;\n`;
    if (spec && spec.rows.length) {
      // Only the columns this table's layout has (one old year's receipts have no RAmt)
      const present = new Set(Array.from(table.body.matchAll(/^\s*`([^`]+)`/gm), m => m[1].toLowerCase()));
      const columns = spec.columns.filter(c => present.has(c[0].toLowerCase()));
      const names = columns.map(c => `\`${c[0]}\``).join(',');
      const history = old.get(name.toLowerCase());
      const all = history
        ? withOldValues(name, table.body, columns, spec.rows, history).out
        : spec.rows.map(row => ' (' + columns.map(([, kind, value]) => sqlValue(value(row), kind)).join(',') + ')');
      for (let i = 0; i < all.length; i += BATCH) {
        yield `INSERT INTO \`${name}\` (${names}) VALUES \n${all.slice(i, i + BATCH).join(',\n')};\n`;
      }
      count.filled.push(name);
    } else {
      count.empty.push(name);
    }
    yield `/*!40000 ALTER TABLE \`${name}\` ENABLE KEYS */;\n\n\n`;
  }
}
