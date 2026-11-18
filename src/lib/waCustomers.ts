import { supabaseAdmin } from '@/lib/supabaseAdmin';

// The customers whose saved numbers include these WhatsApp numbers (91 + 10 digits)
export async function customersFor(numbers: string[]) {
  const found = new Map<string, any[]>();
  const tens = Array.from(new Set(numbers.map(n => String(n).slice(-10)).filter(n => /^\d{10}$/.test(n))));
  for (let i = 0; i < tens.length; i += 40) {
    const chunk = tens.slice(i, i + 40);
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
  return (number: string) => found.get(String(number).slice(-10)) || [];
}

