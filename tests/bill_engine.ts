// The billing engine itself (not only billLedger.ts) must write bills the old software's way.
// Customer 1383, November 2026, with the real April-October bills and receipts:
// Balance = -305 (previous due, without November), Due_Amt NULL, a November receipt is "Paid after
// the bill", and a receipt number repeated on a different receipt is still counted.
// Run: npx tsx tests/bill_engine.ts
import { calculateBilling } from '../src/lib/billingEngine';

let failed = 0;
const check = (ok: boolean, what: string) => { if (!ok) { failed++; console.error('FAIL', what); } else console.log('ok  ', what); };

const months: [string, number, number][] = [ // month, bill id, lines total
  ['April', 5944, 150], ['May', 11128, 155], ['June', 16305, 150], ['July', 21400, 155],
  ['Aug', 27017, 150], ['Sept', 32134, 150], ['Oct', 37220, 155]
];
const billHeaders = [
  { bill_id: 2, customer_id: 1383, region_id: 38, due_amt: 285, del_amt: null, dis_amt: null, month: 'Dues', year: '2026', balance: null },
  ...months.map(([month, id]) => ({ bill_id: id, customer_id: 1383, region_id: 38, due_amt: null, del_amt: null, dis_amt: null, month, year: '2026', balance: 0 }))
];
const bills = months.map(([month, id, total]) => ({ bill_id: id, customer_id: 1383, publica_id: 5, region_id: 38, qty: 30, rate: 5, total_amt: total, month, year: '2026', sno: 1 }));
const receipts = [
  { id: 1, recp_no: 100, customer_id: 1383, month: 'Dues', mal_recp_amt: 285, less_amt: 0 },
  { id: 2, recp_no: 101, customer_id: 1383, month: 'April', mal_recp_amt: 150, less_amt: 0 },
  { id: 3, recp_no: 102, customer_id: 1383, month: 'May', mal_recp_amt: 150, less_amt: 0 },
  { id: 4, recp_no: 103, customer_id: 1383, month: 'June', mal_recp_amt: 150, less_amt: 0 },
  { id: 5, recp_no: 104, customer_id: 1383, month: 'Aug', mal_recp_amt: 305, less_amt: 5 }
];

const base = {
  monthName: 'November', year: '2026', regionId: 'all',
  customers: [{ customer_id: 1383, region_id: 38, name_eng: 'Test 1383' }],
  subscriptions: [{ sno: 1, customer_id: 1383, publica_id: 5, hawker_id: 1, qty: 1, circulation: 'Morning', s_date: '2026-04-01', c_date: null, from_day: '1-7', dis: 0, dely: 0 }],
  rates: [1, 2, 3, 4, 5, 6, 7].map(d => ({ publica_id: 5, dayofweek: d, rate: 5 })),
  ratechanges: [], publications: [{ publica_id: 5, public_name: 'Dainik Bhaskar', type_p: 'Daily' }],
  holidays: [], discontinues: [], publicationDiscontinues: [], regions: [{ region_id: 38, region_name: 'R38' }],
  retailSales: [], supplements: [], billHeaders, bills, startBillId: 42293
};

const one = (extraReceipts: any[] = []) => calculateBilling({ ...base, receipts: [...receipts, ...extraReceipts] } as any).bills[0];

const nov = one();
check(!!nov, 'a November bill is made');
check(Number(nov.db_billno_item.Balance) === -305, `Balance = -305 (got ${nov.db_billno_item.Balance})`);
check(nov.db_billno_item.Due_Amt === null, 'Due_Amt is NULL in a monthly bill');
check(nov.previous_due === 305, `previous due 305 (got ${nov.previous_due})`);
check(nov.total_payable === 305 + Number(nov.current_month_charges), 'total = previous due + this month');

// A receipt for November is paid after the bill: Balance does not move
const paid = one([{ id: 6, recp_no: 105, customer_id: 1383, month: 'Nov', mal_recp_amt: 300, less_amt: 0 }]);
check(Number(paid.db_billno_item.Balance) === -305, 'a November receipt does not change the November Balance');
check(paid.paid_this_month === 300, 'it shows as paid after the bill (300)');

// The same receipt number on a second, different receipt is still counted (keyed on the row id)
const dup = one([{ id: 7, recp_no: 104, customer_id: 1383, month: 'Sept', mal_recp_amt: 100, less_amt: 0 }]);
check(Number(dup.db_billno_item.Balance) === -205, `repeated receipt number is not dropped: Balance -205 (got ${dup.db_billno_item.Balance})`);

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('bill engine: all checks passed');
