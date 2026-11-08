import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formatWhatsAppPhone, getSecureWhatsAppToken, sendWhatsAppReminderMessage, whatsAppDisplayName } from '@/lib/whatsappService';
import { storedHindiName } from '@/lib/transliteration';
import { reminderAmount, reminderDate } from '@/lib/paymentReminder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A screen sends a few customers at a time, so one request stays well inside the time limit
const MOST_AT_ONCE = 25;

/**
 * Sends the payment reminder to customers who still owe, each to every mobile number they have.
 * Body: { customers: [{ customer_id, amount }] }, the amounts the Due Region Wise Summary shows.
 * A customer already reminded today on a number is not sent to again on it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const list: { customer_id: number; amount: number }[] = (Array.isArray(body.customers) ? body.customers : [])
      .map((c: any) => ({ customer_id: Number(c.customer_id), amount: Math.round(Number(c.amount) * 100) / 100 }))
      .filter((c: any) => c.customer_id > 0);
    if (list.length === 0) return NextResponse.json({ error: 'Choose the customers to remind.' }, { status: 400 });
    if (list.length > MOST_AT_ONCE) return NextResponse.json({ error: `At most ${MOST_AT_ONCE} customers at a time.` }, { status: 400 });
    if (!getSecureWhatsAppToken()) {
      return NextResponse.json({ error: 'WhatsApp API credentials could not be loaded securely' }, { status: 400 });
    }

    const { data: customers, error } = await supabaseAdmin
      .from('customer')
      .select('*')
      .in('customer_id', list.map(c => c.customer_id));
    if (error) throw new Error(`Could not read customers: ${error.message}`);
    const byId = new Map((customers || []).map((c: any) => [Number(c.customer_id), c]));

    const today = new Date();
    const date = reminderDate(today);
    const dayKey = date.split('/').reverse().join('');
    const logId = (cid: number, phone: string) => `REM-${dayKey}-${cid}-${phone}`;

    // Who has a number to send to
    const targets: { cid: number; amount: number; phone: string; cust: any }[] = [];
    const results: any[] = [];
    for (const c of list) {
      const cust = byId.get(c.customer_id);
      if (!cust) { results.push({ customer_id: c.customer_id, status: 'skipped', reason: 'Customer not found' }); continue; }
      if (!(c.amount > 0)) { results.push({ customer_id: c.customer_id, status: 'skipped', reason: 'Nothing due' }); continue; }
      const phones = Array.from(new Set(String(cust.phone || '').split(/[,/;]+/).map(p => formatWhatsAppPhone(p.trim())).filter(Boolean))) as string[];
      if (phones.length === 0) { results.push({ customer_id: c.customer_id, status: 'skipped', reason: 'No mobile number' }); continue; }
      for (const phone of phones) targets.push({ cid: c.customer_id, amount: c.amount, phone, cust });
    }

    // Numbers already reminded today
    const { data: sentToday } = targets.length
      ? await supabaseAdmin.from('whatsapp_messages').select('bill_id')
        .in('bill_id', targets.map(t => logId(t.cid, t.phone)))
        .in('status', ['sent', 'delivered', 'read'])
      : { data: [] as any[] };
    const already = new Set((sentToday || []).map((r: any) => r.bill_id));

    for (const t of targets) {
      const id = logId(t.cid, t.phone);
      if (already.has(id)) {
        results.push({ customer_id: t.cid, phone: t.phone, status: 'skipped', reason: 'Already reminded today' });
        continue;
      }
      const res = await sendWhatsAppReminderMessage({
        toPhone: t.phone,
        customerName: whatsAppDisplayName(t.cust.name_eng, storedHindiName(t.cust)),
        customerId: String(t.cid),
        date,
        amount: reminderAmount(t.amount)
      });
      const row = {
        customer_id: String(t.cid),
        bill_id: id,
        phone: t.phone,
        wamid: res.wamid || null,
        status: res.success ? 'sent' : 'failed',
        error_code: res.errorCode || null,
        error_json: res.errorJson || null,
        bill_month: 'Payment Reminder',
        total_amount: t.amount
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
