// After a restore from an old software (VB6) backup, checks the live website against the backup file,
// month by month: bill count, lowest and highest Bill_id, month text, balance total, bill line count and
// amount total, and receipts (count and amount). Any difference is a failure (exit code 1).
// Do not loosen these checks to make them pass: a difference means the restore is wrong.
//
// Run: VERIFY_LOGIN='{"username":"...","password":"..."}' npx tsx scripts/verify_restore.ts <backup.sql> [fySuffix]
// It reads the live data through the website (the login needs admin rights) and changes nothing.
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const [file, fy = '20262027'] = process.argv.slice(2);
const SITE = process.env.VERIFY_SITE || 'https://anasoftware.vercel.app';
if (!file || !process.env.VERIFY_LOGIN) {
  console.error('Usage: VERIFY_LOGIN=\'{"username":"...","password":"..."}\' npx tsx scripts/verify_restore.ts <backup.sql> [fySuffix]');
  process.exit(2);
}
const TABLES = { billno: `billno${fy}`, bill: `bill${fy}`, receipt: `receipt${fy}` };

// --- the backup file: column names from CREATE TABLE, rows from INSERT INTO ... VALUES (...),(...);
function splitRows(values: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [], field = '', quoted = false, inRow = false, wasQuoted = false;
  for (let i = 0; i < values.length; i++) {
    const ch = values[i];
    if (quoted) {
      if (ch === '\\') { field += values[++i]; continue; }
      if (ch === "'") { quoted = false; continue; }
      field += ch;
    } else if (ch === "'") { quoted = true; wasQuoted = true; }
    else if (ch === '(' && !inRow) { inRow = true; row = []; field = ''; wasQuoted = false; }
    else if ((ch === ',' || ch === ')') && inRow) {
      const v = field.trim();
      row.push(!wasQuoted && v === 'NULL' ? null : (wasQuoted ? field : v));
      field = ''; wasQuoted = false;
      if (ch === ')') { rows.push(row); inRow = false; }
    } else if (inRow) field += ch;
  }
  return rows;
}

async function readBackup() {
  const want = new Set(Object.values(TABLES));
  const columns: Record<string, string[]> = {};
  const data: Record<string, Record<string, any>[]> = {};
  let current = '';
  const lines = createInterface({ input: createReadStream(file, { encoding: 'latin1' }), crlfDelay: Infinity });
  for await (const line of lines) {
    const create = line.match(/^CREATE TABLE `(\w+)`/);
    if (create) { current = want.has(create[1]) ? create[1] : ''; if (current) columns[current] = []; continue; }
    if (current && /^\s+`/.test(line)) { columns[current].push(line.split('`')[1].toLowerCase()); continue; }
    if (line.startsWith(')')) current = '';
    const insert = line.match(/^INSERT INTO `(\w+)` VALUES (.*);\s*$/);
    if (insert && want.has(insert[1])) {
      const cols = columns[insert[1]];
      for (const r of splitRows(insert[2])) (data[insert[1]] ||= []).push(Object.fromEntries(cols.map((c, i) => [c, r[i]])));
    }
  }
  return data;
}

// --- the live website, read through its own data route
let cookie = '';
async function login() {
  const res = await fetch(`${SITE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: process.env.VERIFY_LOGIN });
  cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  if (!res.ok || !cookie) throw new Error(`Login failed (${res.status})`);
}
async function readLive(table: string, select: string, order = 'bill_id') {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SITE}/api/db/rest/v1/${table}?select=${select}&order=${order}&limit=1000&offset=${from}`, { headers: { cookie } });
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`${table}: ${JSON.stringify(page).slice(0, 200)}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const num = (v: any) => Number(v ?? 0) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
type Sum = { bills: number; minId: number; maxId: number; balance: number; lines: number; amount: number };
function byMonth(headers: any[], lines: any[]) {
  const out = new Map<string, Sum>();
  const s = (m: string) => out.get(m) || (out.set(m, { bills: 0, minId: Infinity, maxId: -Infinity, balance: 0, lines: 0, amount: 0 }), out.get(m)!);
  for (const h of headers) {
    const x = s(String(h.month ?? '').trim());
    x.bills++; x.minId = Math.min(x.minId, num(h.bill_id)); x.maxId = Math.max(x.maxId, num(h.bill_id)); x.balance = r2(x.balance + num(h.balance));
  }
  for (const l of lines) { const x = s(String(l.month ?? '').trim()); x.lines++; x.amount = r2(x.amount + num(l.totalamt ?? l.total_amt)); }
  return out;
}

(async () => {
  console.log(`Reading ${file} ...`);
  const backup = await readBackup();
  await login();
  console.log('Reading the live website ...');
  const [liveHeaders, liveLines, liveReceipts] = await Promise.all([
    readLive(TABLES.billno, 'bill_id,month,balance'),
    readLive(TABLES.bill, 'bill_id,month,total_amt'),
    readLive(TABLES.receipt, 'month,mal_recp_amt', 'id')
  ]);

  let failures = 0;
  const fileMonths = byMonth(backup[TABLES.billno] || [], backup[TABLES.bill] || []);
  const liveMonths = byMonth(liveHeaders, liveLines);
  const months = Array.from(new Set([...Array.from(fileMonths.keys()), ...Array.from(liveMonths.keys())]));
  console.log('\nMonth      | backup bills  ids          balance  lines  amount   | website');
  for (const m of months) {
    const f = fileMonths.get(m), l = liveMonths.get(m);
    const same = !!f && !!l && f.bills === l.bills && f.minId === l.minId && f.maxId === l.maxId && f.balance === l.balance && f.lines === l.lines && f.amount === l.amount;
    if (!same) failures++;
    const show = (x?: Sum) => x ? `${x.bills} ${x.minId}-${x.maxId} bal ${x.balance} lines ${x.lines} amt ${x.amount}` : 'none';
    console.log(`${same ? 'ok  ' : 'FAIL'} ${JSON.stringify(m).padEnd(11)} backup ${show(f)} | website ${show(l)}`);
  }

  // Receipts: count and amount per month
  const rec = (rows: any[], amt: (r: any) => number) => {
    const out = new Map<string, { n: number; amt: number }>();
    for (const r of rows) { const m = String(r.month ?? '').trim(); const x = out.get(m) || { n: 0, amt: 0 }; x.n++; x.amt = r2(x.amt + amt(r)); out.set(m, x); }
    return out;
  };
  const fr = rec(backup[TABLES.receipt] || [], r => num(r.malrecpamt)), lr = rec(liveReceipts, r => num(r.mal_recp_amt));
  for (const m of Array.from(new Set([...Array.from(fr.keys()), ...Array.from(lr.keys())]))) {
    const f = fr.get(m), l = lr.get(m);
    const same = !!f && !!l && f.n === l.n && f.amt === l.amt;
    if (!same) failures++;
    console.log(`${same ? 'ok  ' : 'FAIL'} receipts ${JSON.stringify(m)}: backup ${f ? `${f.n} / ${f.amt}` : 'none'} | website ${l ? `${l.n} / ${l.amt}` : 'none'}`);
  }

  console.log(failures ? `\n${failures} difference(s): the restore does NOT match the backup.` : '\nThe website matches the backup.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e.message || e); process.exit(2); });
