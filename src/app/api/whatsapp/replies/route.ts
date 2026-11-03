import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_SET_UP = 'WhatsApp जवाब अभी चालू नहीं हैं: supabase/whatsapp_replies.sql एक बार SQL Editor में चलाना बाकी है।';
const plainError = (error: any) =>
  ['42P01', 'PGRST205'].includes(error?.code) ? NOT_SET_UP : String(error?.message || error);

// The customers whose saved numbers include these WhatsApp numbers (91 + 10 digits)
async function customersFor(numbers: string[]) {
  const found = new Map<string, any[]>();
  const tens = Array.from(new Set(numbers.map(n => String(n).slice(-10)).filter(n => /^\d{10}$/.test(n))));
  for (let i = 0; i < tens.length; i += 40) {
    const chunk = tens.slice(i, i + 40);
    const { data } = await supabaseAdmin
      .from('customer')
      .select('customer_id, name_eng, name_hindi_unicode, region_id, phone')
      .or(chunk.map(n => `phone.ilike.*${n}*`).join(','));
    for (const c of data || []) {
      for (const n of chunk) {
        if (!String(c.phone || '').includes(n)) continue;
        found.set(n, [...(found.get(n) || []), { customer_id: c.customer_id, name: c.name_hindi_unicode || c.name_eng, region_id: c.region_id }]);
      }
    }
  }
  return (number: string) => found.get(String(number).slice(-10)) || [];
}

/**
 * GET ?date=YYYY-MM-DD   that day's replies and failed bills
 * GET ?pending=1         every reply not yet ticked as handled
 * GET ?media=<path>      a short-lived link to a customer's photo or voice note
 */
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_reports');
  if (refused) return refused;
  const params = new URL(req.url).searchParams;

  const media = params.get('media');
  if (media) {
    const { data, error } = await supabaseAdmin.storage.from('wa-media').createSignedUrl(media, 600);
    if (error || !data) return NextResponse.json({ error: 'फाइल नहीं मिली' }, { status: 404 });
    return NextResponse.json({ url: data.signedUrl });
  }

  const date = params.get('date') || '';
  const pending = params.get('pending') === '1';
  if (!pending && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date is required' }, { status: 400 });

  let replyQuery = supabaseAdmin.from('wa_replies_report').select('*').limit(2000);
  replyQuery = pending ? replyQuery.eq('handled', false) : replyQuery.eq('tareekh', date);
  const { data: replies, error } = await replyQuery;
  if (error) return NextResponse.json({ error: plainError(error) }, { status: 500 });

  let failed: any[] = [];
  if (!pending) {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const { data, error: failedError } = await supabaseAdmin
      .from('wa_failed_report')
      .select('*')
      .gte('samay', date)
      .lt('samay', next.toISOString().slice(0, 10))
      .limit(2000);
    if (failedError) return NextResponse.json({ error: plainError(failedError) }, { status: 500 });
    failed = data || [];
  }

  const customersOf = await customersFor([...(replies || []).map(r => r.from_number), ...failed.map(f => f.recipient)]);
  return NextResponse.json({
    replies: (replies || []).map(r => ({ ...r, customers: customersOf(r.from_number) })),
    failed: failed.map(f => ({ ...f, customers: customersOf(f.recipient) }))
  });
}

// PATCH { id, handled?, note? }: the office ticks a reply as done or writes a remark
export async function PATCH(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_reports');
  if (refused) return refused;
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const change: Record<string, any> = {};
  if (typeof body.handled === 'boolean') change.handled = body.handled;
  if (typeof body.note === 'string') change.note = body.note.trim() || null;
  if (Object.keys(change).length === 0) return NextResponse.json({ error: 'nothing to change' }, { status: 400 });

  const { error } = await supabaseAdmin.from('wa_incoming').update(change).eq('id', id);
  if (error) return NextResponse.json({ error: plainError(error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
