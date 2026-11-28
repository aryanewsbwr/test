// The bill ledger rule (VB6, confirmed by Himanshu 28 Nov 2026). Run: npx tsx tests/bill_ledger.ts
import { ledgerPreviousDue, billPrintTotals } from '../src/lib/billLedger';

let failed = 0;
const check = (ok: boolean, what: string) => { if (!ok) { failed++; console.error('FAIL', what); } else console.log('ok  ', what); };
const APR = 0, MAY = 1, JUN = 2, JUL = 3, AUG = 4, SEP = 5, OCT = 6, NOV = 7, DUES = -1;

// Customer 1383 as in VB6 (Dues 285; bills Apr-Oct; receipts with LessAmt 5 on the August one)
const bills1383 = [
  { month: APR, amount: 150 }, { month: MAY, amount: 155 }, { month: JUN, amount: 150 }, { month: JUL, amount: 155 },
  { month: AUG, amount: 150 }, { month: SEP, amount: 150 }, { month: OCT, amount: 155 }
];
const paid1383 = [
  { month: DUES, amount: 285 }, { month: APR, amount: 150 }, { month: MAY, amount: 150 }, { month: JUN, amount: 150 },
  { month: AUG, amount: 310 } // 305 cash + 5 LessAmt
];
check(ledgerPreviousDue(285, bills1383, paid1383, JUN) === 5, '1383 June previous due 5 (VB6 Balance -5)');
check(ledgerPreviousDue(285, bills1383, paid1383, AUG) === 160, '1383 Aug previous due 160 (VB6 Balance -160)');
check(ledgerPreviousDue(285, bills1383, paid1383, OCT) === 150, '1383 Oct previous due 150 (VB6 Balance -150)');
check(ledgerPreviousDue(285, bills1383, paid1383, NOV) === 305, '1383 Nov previous due 305 (VB6 Balance -305)');

// A receipt of the bill's own month is NOT in the previous due; it is "Paid after the bill"
const withNovReceipt = [...paid1383, { month: NOV, amount: 300 }];
check(ledgerPreviousDue(285, bills1383, withNovReceipt, NOV) === 305, 'a November receipt does not change the November previous due');
const nov = billPrintTotals({ previousDue: 305, lines: 140 });
check(nov.billAmount === 445 && nov.nowPayable === 445, '1383 Nov bill: 305 + 140 = 445');
const novPaid = billPrintTotals({ previousDue: 305, lines: 140, paidAfter: 300 });
check(novPaid.billAmount === 445 && novPaid.paidAfter === 300 && novPaid.nowPayable === 145, 'paid after the bill: 445 - 300 = 145');

// Rounding only on the printed total
const b1739 = billPrintTotals({ previousDue: 9.5, lines: 126 });
check(b1739.billAmount === 135.5 && b1739.nowPayable === 136, '1739: 9.50 + 126 = 135.50, prints 136');
check(billPrintTotals({ previousDue: 0, lines: 139.24 }).nowPayable === 139, '139.24 prints 139');
check(billPrintTotals({ previousDue: 0, lines: 139.25 }).nowPayable === 140, '139.25 prints 140');
check(ledgerPreviousDue(0, [{ month: APR, amount: 139.5 }], [], MAY) === 139.5, 'previous due is never rounded (139.50 stays)');

// Advance customers keep their sign
check(billPrintTotals({ previousDue: -45, lines: 140 }).nowPayable === 95, 'advance 45 + 140 = 95 (1384)');
check(billPrintTotals({ previousDue: -0.5, lines: 126 }).nowPayable === 126, '-0.50 + 126 = 125.50, prints 126 (1465)');

// Re-generating an old month gives the same previous due (receipts of later months are ignored)
const later = [...paid1383, { month: OCT, amount: 150 }, { month: NOV, amount: 445 }];
check(ledgerPreviousDue(285, bills1383, later, OCT) === 150, 're-generating October ignores Oct/Nov receipts');

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('bill ledger: all checks passed');
