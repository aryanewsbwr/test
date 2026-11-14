// Who counts as owing, the way the old software's Dues Report decides it: more than ₹1.
// A ₹1 left over from paise rounding is not a due. Checked against its 2 III list of 13 Nov 2026.
export const isDue = (balance: unknown) => Number(balance) > 1;

// The list's total as the old software prints it: the exact amounts added, then rounded once
// (adding the rounded amounts drifts a rupee or two on lines like ₹897.50).
export const dueTotal = (balances: unknown[]) => Math.round(balances.reduce((s: number, b) => s + (Number(b) || 0), 0));

// The order the collector walks: by priority, then customer number
export const byPriority = (a: any, b: any) =>
  (Number(a.priority) || 99999) - (Number(b.priority) || 99999) || Number(a.customer_id) - Number(b.customer_id);

// All regions: region by region (2 II before 2 III before 10), each region in priority order
export const byRegionThenPriority = (a: any, b: any) =>
  String(a.region_name || '').localeCompare(String(b.region_name || ''), undefined, { numeric: true, sensitivity: 'base' }) || byPriority(a, b);
