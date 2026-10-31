import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

// Reads a whole table, however large. The database returns at most 1,000 rows per request.
export async function fetchAllRows(table: string, orderBy: string, ascending = true): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(orderBy, { ascending }).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

// The publication table is the only list. A failed read stops the caller instead of using old data.
export async function fetchPublications(): Promise<any[]> {
  return fetchAllRows('publication', 'publica_id');
}

export async function fetchRegions(): Promise<any[]> {
  const rows = await fetchAllRows('regiond', 'region_id');
  return rows.map((r: any) => ({ ...r, name: r.region_name }));
}

// Next free id in a table whose ids are given by the app rather than the database
export async function nextId(table: string, column = 'id'): Promise<number> {
  const { data, error } = await supabase.from(table).select(column).order(column, { ascending: false }).limit(1);
  if (error) throw new Error(`Could not read ${table}: ${error.message}`);
  return Number((data?.[0] as any)?.[column] || 0) + 1;
}

// Swaps a paper's weekday rates. The new set goes in before the old set is removed,
// so a failure never leaves the paper with no rates for billing.
export async function replaceBaseRates(pubId: number, dayRates: Record<string, any>) {
  const { data: oldRates, error: oldErr } = await supabase.from('rate').select('id').eq('publica_id', pubId);
  if (oldErr) throw new Error(`Could not read rates: ${oldErr.message}`);
  let id = await nextId('rate');
  const rows = Object.entries(dayRates).map(([day, rate]) => ({ id: id++, publica_id: pubId, dayofweek: parseInt(day, 10), rate: Number(rate) }));
  const { error: insErr } = await supabase.from('rate').insert(rows);
  if (insErr) throw new Error(`Rates not saved: ${insErr.message}`);
  const oldIds = (oldRates || []).map((r: any) => r.id);
  if (oldIds.length) {
    const { error: delErr } = await supabase.from('rate').delete().in('id', oldIds);
    if (delErr) throw new Error(`New rates saved, but the old ones were not removed: ${delErr.message}`);
  }
}
