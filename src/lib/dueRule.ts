// Who counts as owing, the way the old software's Dues Report decides it: more than ₹1.
// A ₹1 left over from paise rounding is not a due. Checked against its 2 III list of 13 Nov 2026.
export const isDue = (balance: unknown) => Number(balance) > 1;

// The list's total as the old software prints it: the exact amounts added, then rounded once
// (adding the rounded amounts drifts a rupee or two on lines like ₹897.50).
export const dueTotal = (balances: unknown[]) => Math.round(balances.reduce((s: number, b) => s + (Number(b) || 0), 0));
