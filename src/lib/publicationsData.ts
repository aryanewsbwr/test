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
const FREQUENCY_BY_RATE_DAY: Record<number, string> = { 1: 'Weekly', 2: 'Fortnightly', 3: 'Monthly', 4: 'Quarterly', 6: 'Special' };

// Older magazines keep their frequency only in the day of their rate row. Saving new rates
// replaces that row, so the frequency moves to the paper's Duration first.
async function keepMagazineFrequency(pubId: number, oldRates: any[]) {
  const frequency = FREQUENCY_BY_RATE_DAY[Number(oldRates[0]?.dayofweek)];
  if (!frequency) return;
  const { data: pub, error } = await supabase.from('publication').select('type_p, duration').eq('publica_id', pubId).maybeSingle();
  if (error) throw new Error(`Could not read publication: ${error.message}`);
  if (!pub || pub.duration || !/mag|periodical/i.test(pub.type_p || '')) return;
  const { error: saveErr } = await supabase.from('publication').update({ duration: frequency }).eq('publica_id', pubId);
  if (saveErr) throw new Error(`Could not save the magazine's frequency: ${saveErr.message}`);
}

export async function replaceBaseRates(pubId: number, dayRates: Record<string, any>) {
  const { data: oldRates, error: oldErr } = await supabase.from('rate').select('id, dayofweek').eq('publica_id', pubId).order('id');
  if (oldErr) throw new Error(`Could not read rates: ${oldErr.message}`);
  await keepMagazineFrequency(pubId, oldRates || []);
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
