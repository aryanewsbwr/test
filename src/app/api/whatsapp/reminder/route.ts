import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formatWhatsAppPhone, getSecureWhatsAppToken, sendWhatsAppReminderMessage, whatsAppDisplayName } from '@/lib/whatsappService';
import { getReliableHindiName, storedHindiName } from '@/lib/transliteration';
import { reminderAmount, reminderDate } from '@/lib/paymentReminder';
import { reminderBillPng, ReminderStatement } from '@/lib/reminderBillImage';
import { fySuffix } from '@/lib/financialYear';
import { monthCode } from '@/lib/backupTables';
import { fetchRegions } from '@/lib/publicationsData';
import { displayPhones } from '@/lib/phoneNumbers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// A screen sends a few customers at a time, so one request stays well inside the time limit
const MOST_AT_ONCE = 10;
const FY_MONTHS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];

// Every row of a year table for these customers, a page at a time
async function rowsFor(table: string, columns: string, ids: number[]): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from(table).select(columns).in('customer_id', ids).order('customer_id').range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < 1000) return all;
  }
}

/**
 * Each customer's account for this year, worked out the way the Due Region Wise Summary does:
 * opening dues + paper bills + delivery - receipts - less. Also the last month billed.
 */
async function statements(ids: number[]) {
  const suffix = fySuffix();
  const startYear = Number(suffix.slice(0, 4));
  const [headers, lines, deliveries, receipts] = await Promise.all([
    rowsFor(`billno${suffix}`, 'customer_id, month, due_amt, dis_amt', ids),
    rowsFor(`bill${suffix}`, 'customer_id, month, total_amt', ids),
    rowsFor(`billdel${suffix}`, 'customer_id, month, dely', ids),
    rowsFor(`receipt${suffix}`, 'customer_id, mal_recp_amt, less_amt', ids)
  ]);
  const round = (n: number) => Math.round(n * 100) / 100;
  const out = new Map<number, Omit<ReminderStatement, 'name' | 'date' | 'year' | 'customerId'>>();
  const monthly = new Map<string, number>();
  const get = (id: any) => {
    const key = Number(id);
    if (!out.has(key)) out.set(key, { yearEndDues: 0, bills: 0, delivery: 0, received: 0, less: 0, balance: 0 });
    return out.get(key)!;
  };
  const add = (id: any, month: any, n: number) => {
    const k = `${Number(id)}|${monthCode(month)}`;
    monthly.set(k, (monthly.get(k) || 0) + n);
  };
  const lastMonth = new Map<number, string>();
  for (const h of headers) {
    const m = monthCode(h.month);
    if (m === 'due') { get(h.customer_id).yearEndDues += Number(h.due_amt || 0); continue; }
    get(h.customer_id).bills -= Number(h.dis_amt || 0);
    add(h.customer_id, h.month, -Number(h.dis_amt || 0));
    const before = lastMonth.get(Number(h.customer_id));
    if (FY_MONTHS.includes(m) && (!before || FY_MONTHS.indexOf(m) > FY_MONTHS.indexOf(before))) lastMonth.set(Number(h.customer_id), m);
  }
  for (const l of lines) { get(l.customer_id).bills += Number(l.total_amt || 0); add(l.customer_id, l.month, Number(l.total_amt || 0)); }
  for (const d of deliveries) { get(d.customer_id).delivery += Number(d.dely || 0); add(d.customer_id, d.month, Number(d.dely || 0)); }
  for (const r of receipts) {
    get(r.customer_id).received += Number(r.mal_recp_amt || 0);
    get(r.customer_id).less += Number(r.less_amt || 0);
  }
  for (const [id, s] of Array.from(out.entries())) {
    s.yearEndDues = round(s.yearEndDues); s.bills = round(s.bills); s.delivery = round(s.delivery);
    s.received = round(s.received); s.less = round(s.less);
    s.balance = round(s.yearEndDues + s.bills + s.delivery - s.received - s.less);
    const m = lastMonth.get(id);
    if (m) {
      const year = FY_MONTHS.indexOf(m) >= 9 ? startYear + 1 : startYear;
      s.lastBillMonth = `${m[0].toUpperCase()}${m.slice(1)} ${year}`;
      s.lastBillAmount = round(monthly.get(`${id}|${m}`) || 0);
    }
  }
  return { out, year: `${startYear}-${String(startYear + 1).slice(2)}` };
}

// The reminder bill for one customer
function imageFor(cid: number, cust: any, account: Omit<ReminderStatement, 'name' | 'date' | 'year' | 'customerId'>,
  region: string, phone: string, date: string, year: string) {
  return reminderBillPng({
    ...account,
    customerId: cid,
    name: String(cust.name_eng || `Customer #${cid}`).replace(/\s+crd\b/i, '').trim(),
    nameHindi: getReliableHindiName(storedHindiName(cust) || '', cust.name_eng || '') || undefined,
    region: region || (cust.region_id ? `SR${cust.region_id}` : ''),
    phone: displayPhones(phone),
    date,
    year
  });
}

/**
 * GET ?customer_id=: the reminder bill image as the customer would get it, for the check before sending
 */
export async function GET(request: NextRequest) {
  try {
    const cid = Number(new URL(request.url).searchParams.get('customer_id'));
    if (!(cid > 0)) return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    const [{ data: cust }, regions, { out, year }] = await Promise.all([
      supabaseAdmin.from('customer').select('*').eq('customer_id', cid).maybeSingle(),
      fetchRegions().catch(() => [] as any[]),
      statements([cid])
    ]);
    if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    const account = out.get(cid) || { yearEndDues: 0, bills: 0, delivery: 0, received: 0, less: 0, balance: 0 };
    const region = regions.find((r: any) => Number(r.region_id) === Number(cust.region_id))?.region_name || '';
    const phone = String(cust.phone || '').split(/[,/;]+/)[0]?.trim() || '';
    const png = await imageFor(cid, cust, account, region, phone, reminderDate(), year);
    return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

/**
 * Sends the payment reminder with the reminder bill image to customers who still owe, each to
 * every mobile number they have. Body: { customer_ids: [...] }. The amount due is worked out
 * here from the year's bills and receipts. A number already reminded today is not sent to again.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ids: number[] = Array.from(new Set<number>((Array.isArray(body.customer_ids) ? body.customer_ids : []).map(Number)))
      .filter(id => id > 0);
    if (ids.length === 0) return NextResponse.json({ error: 'Choose the customers to remind.' }, { status: 400 });
    if (ids.length > MOST_AT_ONCE) return NextResponse.json({ error: `At most ${MOST_AT_ONCE} customers at a time.` }, { status: 400 });
    if (!getSecureWhatsAppToken()) {
      return NextResponse.json({ error: 'WhatsApp API credentials could not be loaded securely' }, { status: 400 });
    }

    const [{ data: customers, error }, regions, { out: accounts, year }] = await Promise.all([
      supabaseAdmin.from('customer').select('*').in('customer_id', ids),
      fetchRegions().catch(() => [] as any[]),
      statements(ids)
    ]);
    if (error) throw new Error(`Could not read customers: ${error.message}`);
    const byId = new Map((customers || []).map((c: any) => [Number(c.customer_id), c]));
    const regionName = new Map(regions.map((r: any) => [Number(r.region_id), r.region_name]));

    const today = new Date();
    const date = reminderDate(today);
    const dayKey = date.split('/').reverse().join('');
    const logId = (cid: number, phone: string) => `REM-${dayKey}-${cid}-${phone}`;

    // Who owes and has a number to send to
    const targets: { cid: number; phone: string; cust: any; account: NonNullable<ReturnType<typeof accounts.get>> }[] = [];
    const results: any[] = [];
    for (const cid of ids) {
      const cust = byId.get(cid);
      const account = accounts.get(cid);
      if (!cust) { results.push({ customer_id: cid, status: 'skipped', reason: 'Customer not found' }); continue; }
      if (!account || !(account.balance > 0)) { results.push({ customer_id: cid, status: 'skipped', reason: 'Nothing due' }); continue; }
      const phones = Array.from(new Set(String(cust.phone || '').split(/[,/;]+/).map(p => formatWhatsAppPhone(p.trim())).filter(Boolean))) as string[];
      if (phones.length === 0) { results.push({ customer_id: cid, status: 'skipped', reason: 'No mobile number' }); continue; }
      for (const phone of phones) targets.push({ cid, phone, cust, account });
    }

    // Numbers already reminded today
    const { data: sentToday } = targets.length
      ? await supabaseAdmin.from('whatsapp_messages').select('bill_id')
        .in('bill_id', targets.map(t => logId(t.cid, t.phone)))
        .in('status', ['sent', 'delivered', 'read'])
      : { data: [] as any[] };
    const already = new Set((sentToday || []).map((r: any) => r.bill_id));

    const images = new Map<number, Buffer>();
    for (const t of targets) {
      const id = logId(t.cid, t.phone);
      if (already.has(id)) {
        results.push({ customer_id: t.cid, phone: t.phone, status: 'skipped', reason: 'Already reminded today' });
        continue;
      }
      if (!images.has(t.cid)) {
        images.set(t.cid, await imageFor(t.cid, t.cust, t.account, regionName.get(Number(t.cust.region_id)) || '', t.phone, date, year));
      }
      const res = await sendWhatsAppReminderMessage({
        toPhone: t.phone,
        customerName: whatsAppDisplayName(t.cust.name_eng, storedHindiName(t.cust)),
        customerId: String(t.cid),
        date,
        amount: reminderAmount(t.account.balance),
        image: images.get(t.cid)!
      });
      const row = {
        customer_id: String(t.cid),
        bill_id: id,
        phone: t.phone,
        wamid: res.wamid || null,
        status: res.success ? 'sent' : 'failed',
        error_code: res.errorCode || null,
        error_json: res.errorJson || null,
        media_id: res.mediaId || null,
        bill_month: 'Payment Reminder',
        total_amount: t.account.balance
      };
      const { error: logError } = await supabaseAdmin.from('whatsapp_messages').insert(row);
      if (logError?.code === '23505') {
        await supabaseAdmin.from('whatsapp_messages').update(row).eq('bill_id', id);
      } else if (logError) {
        console.warn('[WhatsApp Reminder] Could not log:', logError);
      }
      results.push({
        customer_id: t.cid,
        phone: t.phone,
        status: res.success ? 'sent' : 'failed',
        reason: res.success ? undefined : (res.errorJson?.error_data?.details || res.errorJson?.message || res.errorCode)
      });
    }

    return NextResponse.json({
      success: true,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
