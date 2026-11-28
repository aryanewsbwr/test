// Restore round trip: bills from an old software (VB6) backup must end up in the website exactly as
// in the file — same Bill_id, month text ('Oct', 'Nov', 'Sept'), sno, rate (0 for free papers) and
// balance — whatever bills the website had before. Run: npx tsx tests/restore_roundtrip.ts
import { billCorrections } from '../src/lib/backupClient';
import { billPairFilters } from '../src/lib/billCommit';

type Row = Record<string, any>;
let failed = 0;
const check = (ok: boolean, what: string) => { if (!ok) { failed++; console.error('FAIL', what); } else console.log('ok  ', what); };

// The backup (VB6): October 37220 and November 42504 for customer 1383, a free paper at rate 0
const fileHeaders: Row[] = [
  { bill_id: 1, customer_id: 1383, region_id: 38, due_amt: 285, del_amt: null, dis_amt: null, month: 'Dues', year: '2026', balance: null },
  { bill_id: 37220, customer_id: 1383, region_id: 38, due_amt: null, del_amt: null, dis_amt: 140, month: 'Oct', year: '2026', balance: -285 },
  { bill_id: 42504, customer_id: 1383, region_id: 38, due_amt: null, del_amt: null, dis_amt: null, month: 'Nov', year: '2026', balance: -140 }
];
const fileLines: Row[] = [
  { bill_id: 37220, customer_id: 1383, publica_id: 4, region_id: 38, qty: 28, rate: 0, d_charges: 0, total_amt: 0, month: 'Oct', year: '2026', sno: 1 },
  { bill_id: 42504, customer_id: 1383, publica_id: 4, region_id: 38, qty: 30, rate: 5, d_charges: 0, total_amt: 150, month: 'Nov', year: '2026', sno: 1 }
];

// The website before the restore: its own numbers, full month names, full rate + discount, its balance
const liveHeaders: Row[] = [
  { bill_id: 1, customer_id: 1383, region_id: 38, due_amt: 285, del_amt: null, dis_amt: null, month: 'Dues', year: '2026', balance: null },
  { bill_id: 43803, customer_id: 1383, region_id: 38, due_amt: null, del_amt: 0, dis_amt: 140, month: 'October', year: '2026', balance: -285 },
  { bill_id: 54118, customer_id: 1383, region_id: 38, due_amt: null, del_amt: 0, dis_amt: 0, month: 'November', year: '2026', balance: -435 },
  // A bill the backup does not have at all
  { bill_id: 54119, customer_id: 9999, region_id: 38, due_amt: null, del_amt: 0, dis_amt: 0, month: 'November', year: '2026', balance: 0 }
];
const liveLines: Row[] = [
  { id: 1, bill_id: 43803, customer_id: 1383, publica_id: 4, region_id: 38, qty: 28, rate: 5, d_charges: 0, total_amt: 140, month: 'October', year: '2026', sno: 3 },
  { id: 2, bill_id: 54118, customer_id: 1383, publica_id: 4, region_id: 38, qty: 30, rate: 5, d_charges: 0, total_amt: 150, month: 'November', year: '2026', sno: 3 }
];

const fixes = billCorrections(fileHeaders, fileLines, liveHeaders, liveLines);

// Apply the fixes the way the restore route does: removals first, then the file's bills
let headers = liveHeaders.map(h => ({ ...h }));
let lines = liveLines.map(l => ({ ...l }));
for (const f of fixes.filter((f: any) => f.remove)) {
  headers = headers.filter(h => !(h.bill_id === f.bill_id && h.customer_id === f.customer_id));
  lines = lines.filter(l => !(l.bill_id === f.bill_id && l.customer_id === f.customer_id));
}
for (const f of fixes.filter((f: any) => !f.remove)) {
  check(!headers.some(h => h.bill_id === f.newHeader.bill_id), `bill no. ${f.newHeader.bill_id} is free before it goes in`);
  headers.push({ ...f.newHeader });
  lines.push(...f.lines);
}
check(fixes.every((f: any, i: number) => !f.remove || fixes.slice(0, i).every((g: any) => g.remove)), 'every removal comes before every insert');

const norm = (rows: Row[], keys: string[]) => rows.map(r => keys.map(k => String(r[k] ?? '')).join('|')).sort().join('\n');
const H = ['bill_id', 'customer_id', 'region_id', 'due_amt', 'del_amt', 'dis_amt', 'month', 'year', 'balance'];
const L = ['bill_id', 'customer_id', 'publica_id', 'qty', 'rate', 'd_charges', 'total_amt', 'month', 'year', 'sno'];
check(norm(headers, H) === norm(fileHeaders, H), 'billno after restore equals the backup (ids, month text, balance)');
check(norm(lines, L) === norm(fileLines, L), 'bill lines after restore equal the backup (sno, rate 0, month text)');
check(!headers.some(h => /^(October|November)$/.test(h.month)), 'no website month names left');

// A second restore of the same backup changes nothing
const again = billCorrections(fileHeaders, fileLines, headers, lines);
check(again.length === 0, 'restoring the same backup again changes nothing');

// Bulk removal must hit exactly the pairs asked for. The website does not keep Bill_id unique, so a bill
// that stays (42504 of 1383) can share its number with one that goes (42504 of 9999).
{
  const rows = [
    { bill_id: 43803, customer_id: 1383 }, // goes
    { bill_id: 42504, customer_id: 9999 }, // goes
    { bill_id: 42504, customer_id: 1383 }, // stays: same number, other customer
    { bill_id: 43803, customer_id: 9999 }  // stays
  ];
  const gone = rows.slice(0, 2);
  const matches = (filter: string, r: Row) => Array.from(filter.matchAll(/and\(customer_id\.eq\.(\d+),bill_id\.in\.\(([\d,]+)\)\)/g))
    .some(m => Number(m[1]) === r.customer_id && m[2].split(',').map(Number).includes(r.bill_id));
  const filters = billPairFilters(gone, 1);
  const hit = rows.filter(r => filters.some(f => matches(f, r)));
  check(hit.length === 2 && gone.every(g => hit.includes(g)), 'bulk removal deletes only the exact bill + customer pairs');
}

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('restore round trip: all checks passed');
