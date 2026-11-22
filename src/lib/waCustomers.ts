import { supabaseAdmin } from '@/lib/supabaseAdmin';

const tenOf = (n: unknown) => String(n ?? '').replace(/\D/g, '').slice(-10);

// The customers a WhatsApp number (91 + 10 digits) belongs to. A number staff have confirmed or
// corrected in WhatsApp Replies (wa_number_links) gives just that customer; otherwise every
// customer whose saved phone numbers include it.
export async function customersFor(numbers: string[]) {
  const found = new Map<string, any[]>();
  const tens = Array.from(new Set(numbers.map(tenOf).filter(n => /^\d{10}$/.test(n))));

  // Confirmed / corrected numbers first (the table may not exist yet: then nothing is linked)
  const linked = new Map<string, number>();
  for (let i = 0; i < tens.length; i += 200) {
    const { data, error } = await supabaseAdmin.from('wa_number_links').select('number, customer_id').in('number', tens.slice(i, i + 200));
    if (error) break;
    for (const l of data || []) linked.set(String(l.number), Number(l.customer_id));
  }
  const linkedIds = Array.from(new Set(Array.from(linked.values())));
  if (linkedIds.length) {
    const { data } = await supabaseAdmin.from('customer').select('customer_id, name_eng, name_hindi_unicode, region_id').in('customer_id', linkedIds);
    const byId = new Map((data || []).map((c: any) => [Number(c.customer_id), c]));
    for (const [n, id] of Array.from(linked.entries())) {
      const c = byId.get(id);
      if (c) found.set(n, [{ customer_id: c.customer_id, name: c.name_hindi_unicode || c.name_eng, region_id: c.region_id, confirmed: true }]);
    }
  }

  const rest = tens.filter(n => !found.has(n));
  for (let i = 0; i < rest.length; i += 40) {
    const chunk = rest.slice(i, i + 40);
    const { data } = await supabaseAdmin
      .from('customer')
      .select('customer_id, name_eng, name_hindi_unicode, region_id, phone')
      .or(chunk.map(n => `phone.ilike.*${n}*`).join(','));
    for (const c of data || []) {
      for (const n of chunk) {
        if (!String(c.phone || '').includes(n)) continue;
        found.set(n, [...(found.get(n) || []), { customer_id: c.customer_id, name: c.name_hindi_unicode || c.name_eng, region_id: c.region_id }]);
      }
    }
  }
  // Each customer's region name, so staff can see where the customer is
  const regionIds = Array.from(new Set(Array.from(found.values()).flat().map(c => Number(c.region_id)).filter(Boolean)));
  if (regionIds.length) {
    const { data } = await supabaseAdmin.from('regiond').select('region_id, region_name').in('region_id', regionIds);
    const names = new Map((data || []).map((r: any) => [Number(r.region_id), String(r.region_name || '').trim()]));
    for (const list of Array.from(found.values())) for (const c of list) c.region_name = names.get(Number(c.region_id)) || '';
  }
  return (number: string) => found.get(tenOf(number)) || [];
}
