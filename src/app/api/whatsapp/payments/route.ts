import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';
import { customersFor } from '@/lib/waCustomers';
import { balancesFor } from '@/lib/mobile';
import { fySuffix } from '@/lib/financialYear';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Online payments sent on WhatsApp, one card per customer number, so a screenshot is never missed:
//  green  - a screenshot (photo / file) came and the number is one customer's: cut the receipt
//  yellow - a "paid" message without a screenshot, or the number is saved on several customers
//  red    - the number is not saved on any customer
//  grey   - done: ticked, or a receipt for that customer is dated on or after the message
type Colour = 'green' | 'yellow' | 'red' | 'grey';
const ORDER: Colour[] = ['green', 'yellow', 'red', 'grey'];
const PAYMENT_TYPES = ['image', 'document'];
const PAID_WORDS = /(paid|payment|done|kar diya|kr diya|कर दिया|भेज दिया|जमा|भुगतान|transfer|upi|phonepe|phone pe|gpay|google pay|paytm|₹|rs\.?\s*\d)/i;

const isoOf = (v: any) => {
  const t = String(v ?? '').trim().split('T')[0].split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};
const indiaToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// The newest receipt date (date paid or date entered) of each customer
async function lastReceipts(ids: number[]) {
  const out = new Map<number, { date: string; amount: number }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin.from(`receipt${fySuffix()}`).select('customer_id, recp_date, mal_recp_amt, remarks').in('customer_id', ids.slice(i, i + 200));
    for (const r of data || []) {
      let paid = '';
      try { paid = isoOf(JSON.parse(r.remarks || '{}').mal_recp_dt); } catch { paid = ''; }
      const date = [isoOf(r.recp_date), paid].sort().pop() || '';
      const id = Number(r.customer_id);
      if (date && (!out.has(id) || date > out.get(id)!.date)) out.set(id, { date, amount: Number(r.mal_recp_amt || 0) });
    }
  }
  return out;
}

/**
 * GET ?days=7     payment messages of the last days (1-60), as cards
 * PATCH { ids, handled }   tick a card's messages done (or not)
 */
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_reports');
  if (refused) return refused;
  const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 7));
  const since = new Date(Date.now() + 5.5 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin.from('wa_replies_report').select('*').gte('tareekh', since).limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const payments = (data || []).filter(r => PAYMENT_TYPES.includes(r.msg_type) || r.shreni === 'पेमेंट किया' || PAID_WORDS.test(String(r.body || '')));

  // One card per number, its messages oldest first
  const byNumber = new Map<string, any[]>();
  for (const r of payments) byNumber.set(r.from_number, [...(byNumber.get(r.from_number) || []), r]);
  const numbers = Array.from(byNumber.keys());
  const customersOf = await customersFor(numbers);
  const ids = Array.from(new Set(numbers.flatMap(n => customersOf(n).map((c: any) => Number(c.customer_id)))));
  const [dues, receipts] = await Promise.all([balancesFor(ids), lastReceipts(ids)]);

  // Short-lived links so the screenshots show on the card itself
  const paths = payments.filter(r => r.media_path && PAYMENT_TYPES.includes(r.msg_type)).map(r => r.media_path);
  const links = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 100) {
    const { data: signed } = await supabaseAdmin.storage.from('wa-media').createSignedUrls(paths.slice(i, i + 100), 3600);
    for (const s of signed || []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
  }

  const cards = numbers.map(number => {
    const msgs = byNumber.get(number)!.sort((a, b) => `${a.tareekh} ${a.samay}`.localeCompare(`${b.tareekh} ${b.samay}`));
    const customers = customersOf(number).map((c: any) => ({ ...c, due: dues.get(Number(c.customer_id)) ?? null, last_receipt: receipts.get(Number(c.customer_id)) || null }));
    const first = msgs[0];
    const pending = msgs.filter(m => !m.handled);
    // A receipt dated on or after the first message counts as the payment entered
    const receiptMade = customers.length === 1 && !!customers[0].last_receipt && customers[0].last_receipt.date >= first.tareekh;
    const screenshot = msgs.some(m => PAYMENT_TYPES.includes(m.msg_type));
    let colour: Colour;
    let why: string;
    if (pending.length === 0) { colour = 'grey'; why = 'हो गया (टिक किया)'; }
    else if (receiptMade) { colour = 'grey'; why = `रसीद बन गई (${customers[0].last_receipt.date.split('-').reverse().join('/')}, ₹${customers[0].last_receipt.amount})`; }
    else if (customers.length === 0) { colour = 'red'; why = 'यह नंबर किसी ग्राहक का नहीं है'; }
    else if (customers.length > 1) { colour = 'yellow'; why = `यह नंबर ${customers.length} ग्राहकों का है, सही ग्राहक चुनें`; }
    else if (screenshot) { colour = 'green'; why = 'स्क्रीनशॉट आया, रसीद काटें'; }
    else { colour = 'yellow'; why = 'पेमेंट का मैसेज है, स्क्रीनशॉट नहीं'; }
    return {
      number, profile_name: msgs.find(m => m.profile_name)?.profile_name || '', colour, why,
      first_date: first.tareekh, last_time: `${msgs[msgs.length - 1].tareekh} ${msgs[msgs.length - 1].samay}`,
      customers, ids: msgs.map(m => m.id),
      messages: msgs.map(m => ({ id: m.id, date: m.tareekh, time: m.samay, type: m.msg_type, body: m.body, handled: m.handled, media: m.media_path || null, link: m.media_path ? links.get(m.media_path) || null : null }))
    };
  }).sort((a, b) => ORDER.indexOf(a.colour) - ORDER.indexOf(b.colour) || b.last_time.localeCompare(a.last_time));

  return NextResponse.json({ cards, since, today: indiaToday() });
}

export async function PATCH(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_reports');
  if (refused) return refused;
  const body = await req.json().catch(() => ({}));
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger);
  if (!ids.length || typeof body.handled !== 'boolean') return NextResponse.json({ error: 'ids and handled are required' }, { status: 400 });
  const { error } = await supabaseAdmin.from('wa_incoming').update({ handled: body.handled }).in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
