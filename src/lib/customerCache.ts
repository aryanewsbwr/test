'use client';

// Every customer (number, names, phone), loaded once per browser session, so a customer search can
// filter instantly as you type instead of asking the server on every letter.
export interface CachedCustomer { customer_id: number; name_eng: string; name_hindi: string; phone: string }

let loading: Promise<CachedCustomer[]> | null = null;

export function allCustomers(): Promise<CachedCustomer[]> {
  if (!loading) {
    loading = fetch('/api/customers?all=true')
      .then(r => r.json())
      .then(d => (d.customers || []).map((c: any) => ({
        customer_id: Number(c.customer_id), name_eng: String(c.name_eng || ''), name_hindi: String(c.name_hindi || ''), phone: String(c.phone || '')
      })))
      .catch(err => { loading = null; throw err; });
  }
  return loading;
}

// Best matches first: the exact number, then names starting with the text, then names / phones containing it
export function searchCustomers(list: CachedCustomer[], text: string, limit = 12): CachedCustomer[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const scored: { c: CachedCustomer; s: number }[] = [];
  for (const c of list) {
    const id = String(c.customer_id);
    const eng = c.name_eng.toLowerCase();
    let s = 0;
    if (id === q) s = 100;
    else if (/^\d+$/.test(q) && id.startsWith(q)) s = 60;
    else if (eng.startsWith(q) || c.name_hindi.startsWith(text.trim())) s = 50;
    else if (eng.includes(q) || c.name_hindi.includes(text.trim())) s = 30;
    else if (/^\d{4,}$/.test(q) && c.phone.includes(q)) s = 20;
    if (s) scored.push({ c, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.c.customer_id - b.c.customer_id).slice(0, limit).map(x => x.c);
}
