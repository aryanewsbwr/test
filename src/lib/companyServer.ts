// The firm's details and the latest bill message, read on the server (for WhatsApp bill images).
import { supabaseAdmin as db } from './supabaseAdmin';
import { CompanyInfo, DEFAULT_COMPANY, companyFromRow } from './companyInfo';

let cache: { at: number; company: CompanyInfo; message: string } | null = null;

export async function companyAndMessage(): Promise<{ company: CompanyInfo; message: string }> {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const [c, m] = await Promise.all([
    db.from('company').select('*').order('id', { ascending: true }).limit(1),
    db.from('message').select('*').order('message_id', { ascending: false }).limit(1)
  ]);
  // A table not made yet simply leaves the defaults
  const company = !c.error && c.data?.[0] ? companyFromRow(c.data[0]) : { ...DEFAULT_COMPANY };
  const message = !m.error && m.data?.[0] ? String(m.data[0].message || '').trim() : '';
  cache = { at: Date.now(), company, message };
  return cache;
}

export const forgetCompany = () => { cache = null; };
