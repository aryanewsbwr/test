import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Hawker priority and Hindi name, one row per hawker NAME (supabase/hawker_priority.sql).
// A name without a priority is not shown in any list; hawkers starting with Z never are.
export interface HawkerPriority { priority: number; hindi_name: string }

// Order of a priority in lists: 1, 2, 3 ... then 0 (e.g. Whatsapp) at the end, then none
export const priorityRank = (p: number | null | undefined) => (p === null || p === undefined ? 1e9 : p === 0 ? 1e8 : p);

export const hawkerKey = (name: unknown) => String(name ?? '').trim().toLowerCase();

// null when the table is not made yet, so nothing is hidden before the SQL is run
export async function loadHawkerPriorities(): Promise<Map<string, HawkerPriority> | null> {
  const { data, error } = await supabaseAdmin.from('hawker_priority').select('name_key, priority, hindi_name');
  if (error) return null;
  return new Map((data || []).map((r: any) => [String(r.name_key), { priority: Number(r.priority), hindi_name: String(r.hindi_name || '') }]));
}

export async function saveHawkerPriority(name: string, priority: unknown, hindiName: unknown) {
  const key = hawkerKey(name);
  if (!key) return;
  if (priority === '' || priority === null) {
    const { error } = await supabaseAdmin.from('hawker_priority').delete().eq('name_key', key);
    if (error) throw new Error(`Could not save the priority: ${error.message}`);
    return;
  }
  const value = Number(priority);
  if (!Number.isInteger(value) || value < 0) throw new Error('Priority must be a whole number (0, 1, 2 ...)');
  const { error } = await supabaseAdmin.from('hawker_priority').upsert({
    name_key: key, name: String(name).trim(), priority: value, hindi_name: String(hindiName ?? '').trim() || null, updated_at: new Date().toISOString()
  });
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message)
    ? 'पहले supabase/hawker_priority.sql एक बार Supabase SQL Editor में चलाएँ'
    : `Could not save the priority: ${error.message}`);
}
