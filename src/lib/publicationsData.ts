import path from 'path';
import fs from 'fs';
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

// The publication table is the live list. The file is only a fallback for when it can't be read.
export async function fetchPublications(): Promise<any[]> {
  const { data, error } = await supabase.from('publication').select('*').order('publica_id', { ascending: true });
  if (!error && data && data.length > 0) return data;
  const f = path.join(process.cwd(), 'public', 'data', 'publications.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : [];
}

// Same rule for regions: the regiond table is live, the file is only a fallback
export async function fetchRegions(): Promise<any[]> {
  const { data, error } = await supabase.from('regiond').select('*').order('region_id', { ascending: true });
  if (!error && data && data.length > 0) return data.map((r: any) => ({ ...r, name: r.region_name }));
  const f = path.join(process.cwd(), 'public', 'data', 'regions.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : [];
}
