// The bill messages (Master > Message) live in the old software's `message` table. Restores have
// brought it in with its own column names (Message_id / Dated / Message, or similar), so the names
// are looked up once from the database instead of being assumed.
import { supabaseAdmin as db } from './supabaseAdmin';

export interface BillMessage { message_id: number | null; dated: string; message: string }
interface Cols { id: string | null; dated: string | null; text: string }

let colsCache: Cols | null = null;

async function columnNames(): Promise<string[]> {
  // The database's own description of its tables
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' }, cache: 'no-store' });
      if (res.ok) {
        const spec = await res.json();
        const props = spec?.definitions?.message?.properties;
        if (props) return Object.keys(props);
      }
    } catch { /* read a row instead */ }
  }
  const { data, error } = await db.from('message').select('*').limit(1);
  if (error) throw new Error(`message टेबल डेटाबेस में नहीं मिला (${error.message})`);
  return data?.[0] ? Object.keys(data[0]) : [];
}

async function cols(): Promise<Cols> {
  if (colsCache) return colsCache;
  const names = await columnNames();
  const find = (re: RegExp) => names.find(n => re.test(n)) || null;
  const text = find(/^message$/i) || find(/^(msg|message_?text|text|remark)$/i);
  if (!text) throw new Error(`message टेबल में संदेश वाला कॉलम नहीं मिला (कॉलम: ${names.join(', ') || 'कोई नहीं'})`);
  colsCache = { id: find(/^message_?id$/i) || find(/^(id|sno|msg_?id)$/i), dated: find(/^(dated|date|msg_?date|message_?date)$/i), text };
  return colsCache;
}

const isoDate = (v: unknown) => {
  const s = String(v ?? '').trim().split('T')[0].split(' ')[0];
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
};

// Newest first
export async function listMessages(limit = 200): Promise<BillMessage[]> {
  const c = await cols();
  let q = db.from('message').select('*');
  if (c.id) q = q.order(c.id, { ascending: false });
  const { data, error } = await q.limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data || []).map((r: any) => ({ message_id: c.id ? Number(r[c.id]) || null : null, dated: c.dated ? isoDate(r[c.dated]) : '', message: String(r[c.text] ?? '').trim() }))
    .filter(r => r.message);
  // Without a number column, the newest is the latest date
  if (!c.id) rows.sort((a, b) => b.dated.localeCompare(a.dated));
  return rows;
}

export async function addMessage(dated: string, text: string): Promise<void> {
  const c = await cols();
  const row: Record<string, any> = { [c.text]: text };
  if (c.dated) row[c.dated] = dated || null;
  if (c.id) {
    const { data, error } = await db.from('message').select(c.id).order(c.id, { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    row[c.id] = (Number((data?.[0] as any)?.[c.id]) || 0) + 1;
  }
  const { error } = await db.from('message').insert(row);
  if (error) throw new Error(error.message);
}

// By its number, or (in a table without numbers) by its text
export async function deleteMessage(id: number | null, text: string): Promise<void> {
  const c = await cols();
  let q = db.from('message').delete();
  if (c.id && id) q = q.eq(c.id, id);
  else {
    if (!text) throw new Error('कौन सा संदेश हटाना है, पता नहीं चला');
    q = q.eq(c.text, text);
  }
  const { error } = await q;
  if (error) throw new Error(error.message);
}
