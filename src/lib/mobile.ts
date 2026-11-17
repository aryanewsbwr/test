// Server side of the staff mobile app (/m): who is using it, which customers they may see,
// a customer's balance, and the next receipt number from their book.
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from './supabaseAdmin';
import { currentUser, AppUser } from './auth';
import { fySuffix } from './financialYear';
import { monthCode } from './backupTables';
import { getReliableHindiName, storedHindiName } from './transliteration';

export const MOBILE_TABLE = 'mobile_staff';

export interface MobileStaff {
  user_id: string;
  pin_hash: string | null;
  region_ids: number[] | null;
  collect_id: number | null;
  fails: number;
  locked_until: string | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

// The PIN is salted with the user's id, so two staff with the same PIN get different hashes
export function hashPin(userId: string, pin: string): string {
  const salt = process.env.AUTH_SECRET_SALT || process.env.SESSION_SECRET || 'mobile_pin';
  return crypto.createHash('sha256').update(`${salt}|pin|${userId}|${pin}`).digest('hex');
}

export const isPin = (v: unknown) => /^\d{4}$/.test(String(v ?? ''));

// A missing table gets a clear message instead of a database error
export function explainMissing(message: string): string {
  return /does not exist|schema cache|relation/i.test(message)
    ? 'मोबाइल ऐप की टेबल अभी डेटाबेस में नहीं है। supabase/mobile_staff.sql चलाएँ।'
    : message;
}

export async function staffRow(userId: string): Promise<MobileStaff | null> {
  const { data, error } = await db.from(MOBILE_TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(explainMissing(error.message));
  return (data as MobileStaff) || null;
}

export interface MobileCaller {
  user: AppUser;
  staff: MobileStaff | null;
  regions: number[] | null; // null: every line
}

// The logged-in user, with their mobile settings; or a refusal to return
export async function mobileCaller(req: NextRequest): Promise<MobileCaller | NextResponse> {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'फिर से लॉगिन करें' }, { status: 401 });
  let staff: MobileStaff | null = null;
  try { staff = await staffRow(user.id); } catch { staff = null; }
  // An admin sees every line; anyone else only their own lines when some are set
  const own = (staff?.region_ids || []).filter(n => Number(n) > 0).map(Number);
  const regions = user.role === 'admin' || own.length === 0 ? null : own;
  return { user, staff, regions };
}

export const canSeeRegion = (caller: MobileCaller, regionId: unknown) =>
  !caller.regions || caller.regions.includes(Number(regionId));

// Today in India, as 2026-11-17 and 17/11/2026
export function todayIndia() {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const iso = d.toISOString().slice(0, 10);
  const [y, m, day] = iso.split('-');
  return { iso, ddmmyyyy: `${day}/${m}/${y}`, monthIndex: Number(m) - 1, year: Number(y) };
}

async function readAll(table: string, columns: string, filter: (q: any) => any, order = 'id'): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(db.from(table).select(columns)).order(order, { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

// Balance for each customer: opening dues + paper bills + delivery - receipts - less,
// the same sum the Due List uses (it matches the old software customer for customer).
export async function balancesFor(customerIds: number[]): Promise<Map<number, number>> {
  const suffix = fySuffix();
  const out = new Map<number, number>();
  customerIds.forEach(id => out.set(id, 0));
  for (let i = 0; i < customerIds.length; i += 200) {
    const ids = customerIds.slice(i, i + 200);
    const inIds = (q: any) => q.in('customer_id', ids);
    const [headers, lines, deliveries, receipts] = await Promise.all([
      readAll(`billno${suffix}`, 'customer_id, month, due_amt, dis_amt', inIds, 'bill_id'),
      readAll(`bill${suffix}`, 'customer_id, total_amt', inIds),
      readAll(`billdel${suffix}`, 'customer_id, dely', inIds),
      readAll(`receipt${suffix}`, 'customer_id, mal_recp_amt, less_amt', inIds)
    ]);
    const add = (id: any, n: number) => out.set(Number(id), (out.get(Number(id)) || 0) + n);
    for (const h of headers) {
      if (monthCode(h.month) === 'due') add(h.customer_id, Number(h.due_amt || 0));
      else add(h.customer_id, -Number(h.dis_amt || 0));
    }
    for (const l of lines) add(l.customer_id, Number(l.total_amt || 0));
    for (const d of deliveries) add(d.customer_id, Number(d.dely || 0));
    for (const r of receipts) add(r.customer_id, -Number(r.mal_recp_amt || 0) - Number(r.less_amt || 0));
  }
  out.forEach((v, k) => out.set(k, round(v)));
  return out;
}

// --- Customer names and the search list -------------------------------------------------

const ADDRESS_MOBILE = /(?:\+?91[\s-]?)?[6-9]\d{9}/g;

export function customerCard(c: any, regionName: (id: number) => string) {
  const hindi = getReliableHindiName(storedHindiName(c), c.name_eng);
  return {
    customer_id: Number(c.customer_id),
    name: hindi || String(c.name_eng || '').trim() || `ग्राहक #${c.customer_id}`,
    name_eng: String(c.name_eng || '').trim(),
    region_id: Number(c.region_id || 0),
    region: regionName(Number(c.region_id || 0)),
    priority: Number(c.priority || 0)
  };
}

export function phonesOf(c: any): string[] {
  const text = [c.phone, c.add1, c.add2].filter(Boolean).join(' ');
  const found = (text.match(ADDRESS_MOBILE) || []).map(p => p.replace(/\D/g, '').slice(-10));
  return Array.from(new Set(found));
}

let regionCache: { at: number; names: Map<number, string> } | null = null;
export async function regionNames(): Promise<Map<number, string>> {
  if (regionCache && Date.now() - regionCache.at < 10 * 60 * 1000) return regionCache.names;
  const { data, error } = await db.from('regiond').select('region_id, region_name').order('region_id');
  if (error) throw new Error(`Could not read regions: ${error.message}`);
  const names = new Map<number, string>((data || []).map((r: any) => [Number(r.region_id), String(r.region_name || `#${r.region_id}`).trim()]));
  regionCache = { at: Date.now(), names };
  return names;
}

interface SearchEntry { card: ReturnType<typeof customerCard>; keys: string; phones: string[] }
let searchCache: { at: number; list: SearchEntry[] } | null = null;

// Every customer with the words a search can match (English, Hindi, number, mobile), kept for a few minutes
export async function searchList(): Promise<SearchEntry[]> {
  if (searchCache && Date.now() - searchCache.at < 5 * 60 * 1000) return searchCache.list;
  const names = await regionNames();
  const regionName = (id: number) => names.get(id) || '';
  const rows = await readAll('customer', '*', q => q, 'customer_id');
  const list = rows.map(c => {
    const card = customerCard(c, regionName);
    const phones = phonesOf(c);
    const keys = [card.name, card.name_eng, String(card.customer_id)].join(' ').toLowerCase();
    return { card, keys, phones };
  });
  searchCache = { at: Date.now(), list };
  return list;
}

// Hindi vowel signs and nukta dropped, and English vowels after the first letter, so small
// spelling slips (शर्मा / शरमा, sharma / sharmaa) still match
function loose(s: string): string {
  return s.toLowerCase()
    .replace(/[़्ँंः]/g, '')
    .replace(/[ा-ौ]/g, '')
    .replace(/(\w)[aeiouy]+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchCustomers(list: SearchEntry[], query: string, limit = 30) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const digits = q.replace(/\D/g, '');
  // A number: the customer no., or a mobile number (last digits are enough)
  if (/^[\d\s+-]+$/.test(q) && digits) {
    const exact = list.filter(e => String(e.card.customer_id) === digits);
    const phone = digits.length >= 4 ? list.filter(e => e.phones.some(p => p.endsWith(digits) || p.includes(digits))) : [];
    return Array.from(new Set([...exact, ...phone])).slice(0, limit).map(e => e.card);
  }
  const words = q.split(/\s+/).filter(Boolean);
  const looseWords = words.map(loose).filter(Boolean);
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of list) {
    let score = 0;
    if (words.every(w => e.keys.includes(w))) score = e.keys.startsWith(words[0]) || e.card.name.toLowerCase().startsWith(words[0]) ? 3 : 2;
    else {
      const lk = loose(e.keys);
      if (looseWords.length && looseWords.every(w => lk.includes(w))) score = 1;
    }
    if (score) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.card.name.localeCompare(b.e.card.name, 'hi'));
  return scored.slice(0, limit).map(s => s.e.card);
}

// --- Bills and receipt books ---------------------------------------------------------------

const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
export const HINDI_MONTHS: Record<string, string> = {
  April: 'अप्रैल', May: 'मई', June: 'जून', July: 'जुलाई', August: 'अगस्त', September: 'सितम्बर',
  October: 'अक्टूबर', November: 'नवम्बर', December: 'दिसम्बर', January: 'जनवरी', February: 'फ़रवरी', March: 'मार्च', Dues: 'पिछला बकाया'
};

export function monthName(m: unknown): string {
  const c = String(m ?? '').trim().toLowerCase();
  if (c === 'dues') return 'Dues';
  return FY_MONTHS.find(x => x.toLowerCase().slice(0, 3) === c.slice(0, 3)) || String(m ?? '');
}

// The customer's latest bill: its number, month, year and amount, as the Receipt screen picks it
export async function latestBill(customerId: number) {
  const suffix = fySuffix();
  const [{ data: heads, error }, { data: lines, error: lineError }] = await Promise.all([
    db.from(`billno${suffix}`).select('*').eq('customer_id', customerId).order('bill_id', { ascending: true }),
    db.from(`bill${suffix}`).select('bill_id, total_amt').eq('customer_id', customerId)
  ]);
  if (error || lineError) throw new Error(`Could not read bills: ${(error || lineError)!.message}`);
  const sum = new Map<number, number>();
  (lines || []).forEach((l: any) => sum.set(Number(l.bill_id), (sum.get(Number(l.bill_id)) || 0) + Number(l.total_amt || 0)));
  const bills = (heads || []).map((b: any) => {
    const isDues = monthCode(b.month) === 'due';
    const amount = isDues ? Number(b.due_amt || 0) : (sum.get(Number(b.bill_id)) || 0) + Number(b.del_amt || 0) - Number(b.dis_amt || 0);
    return { bill_id: Number(b.bill_id), month: monthName(b.month), year: String(b.year || ''), amount: round(amount) };
  });
  bills.sort((a, b) => Number(a.year) - Number(b.year) || (a.month === 'Dues' ? -1 : FY_MONTHS.indexOf(a.month)) - (b.month === 'Dues' ? -1 : FY_MONTHS.indexOf(b.month)));
  return bills[bills.length - 1] || null;
}

// The collector's book in use and the next receipt number in it that is not used yet
export async function nextBookNumber(collectId: number | null | undefined): Promise<{ book: string; next: string } | null> {
  if (!collectId) return null;
  const { data: books, error } = await db.from(`receiptissue${fySuffix()}`).select('*').eq('Collect_id', collectId).order('sno', { ascending: true });
  if (error || !books?.length) return null;
  const open = [...books].reverse().find((b: any) => !b.RecDate) || books[books.length - 1];
  const from = Number(open.ReceiptFrom) || 0;
  const to = Number(open.ReceiptTo) || 0;
  if (!from || !to) return null;
  // Receipts are cut in order, so the latest ones are enough to find the last number used
  const { data: recent } = await db.from(`receipt${fySuffix()}`).select('remarks').order('id', { ascending: false }).limit(3000);
  let last = from - 1;
  for (const r of recent || []) {
    let n = NaN;
    try { n = Number(JSON.parse(r.remarks || '{}').manual_rep_no); } catch { /* old rows */ }
    if (n >= from && n <= to && n > last) last = n;
  }
  return { book: `${from} - ${to}`, next: last < to ? String(last + 1) : '' };
}

export async function collectorName(collectId: number | null | undefined): Promise<string> {
  if (!collectId) return '';
  const { data } = await db.from('collect').select('name').eq('Collect_id', collectId).maybeSingle();
  return String((data as any)?.name || '').trim();
}
