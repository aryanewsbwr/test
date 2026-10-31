import path from 'path';
import fs from 'fs';
import { supabase } from '@/lib/supabaseClient';

// The publication table is the live list. The file is only a fallback for when it can't be read.
export async function fetchPublications(): Promise<any[]> {
  const { data, error } = await supabase.from('publication').select('*').order('publica_id', { ascending: true });
  if (!error && data && data.length > 0) return data;
  const f = path.join(process.cwd(), 'public', 'data', 'publications.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : [];
}
