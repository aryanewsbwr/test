// The old software's (VB6) bill ledger, confirmed by Himanshu on 28 Nov 2026 against VB6's own bills.
// Stored values are never rounded; only the printed / WhatsApp total is (.25 and above goes up).
import { roundToFoxProRule } from './billingEngine';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Previous due for the bill of month M (financial-year index: Apr = 0 ... Mar = 11):
 * Dues + every earlier month's bill (lines + Del_Amt - Dis_Amt) - receipts whose Month is EARLIER than M
 * (MalRecpAmt + LessAmt; 'Dues' receipts count as earlier). Receipts of month M are not in it.
 * Billno.Balance of that bill = -previous due.
 */
export function ledgerPreviousDue(
  dues: number,
  bills: { month: number; amount: number }[],
  receipts: { month: number; amount: number }[],
  M: number
): number {
  const billed = bills.filter(b => b.month < M).reduce((s, b) => s + b.amount, 0);
  const paid = receipts.filter(r => r.month < M).reduce((s, r) => s + r.amount, 0);
  const due = r2(dues + billed - paid);
  return Math.abs(due) < 0.005 ? 0 : due;
}

/**
 * What a bill shows: bill amount = previous due (-Balance) + this month's lines + Del_Amt - Dis_Amt;
 * "Paid after the bill" = receipts with this bill's month; now payable = bill amount - paid, rounded
 * only here, for printing.
 */
export function billPrintTotals(o: { previousDue: number; lines: number; delivery?: number; discount?: number; paidAfter?: number }) {
  const billAmount = r2(o.previousDue + o.lines + (o.delivery || 0) - (o.discount || 0));
  const paidAfter = r2(o.paidAfter || 0);
  return { billAmount, paidAfter, nowPayable: roundToFoxProRule(billAmount - paidAfter) };
}
