import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { POST as saveSubscription } from '@/app/api/subscriptions/route';
import { mobileCaller, customerInLine, earliestChangeDate, addDays, logAction } from '@/lib/mobile';

export const dynamic = 'force-dynamic';

const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// POST { customer_id, publica_id, qty, date, kind: 'start' | 'extra' }
//   start: अखबार चालू from that date (runs until it is stopped)
//   extra: अतिरिक्त अखबार for that one day only (billing counts a paper up to the day before its close date)
// Saved like the Customer screen's Insert, with the hawker who brings the customer's papers.
export async function POST(req: NextRequest) {
  const caller = await mobileCaller(req);
  if (caller instanceof NextResponse) return caller;
  if (!caller.user.permissions?.can_mark_discontinue) return NextResponse.json({ error: 'आपको अखबार चालू करने की अनुमति नहीं है' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const customerId = Number(body.customer_id);
    const publicaId = Number(body.publica_id);
    const qty = Math.round(Number(body.qty) || 0);
    const date = String(body.date || '');
    const extra = body.kind === 'extra';
    if (!customerId || !publicaId) return NextResponse.json({ error: 'ग्राहक और अखबार चुनें' }, { status: 400 });
    if (qty < 1 || qty > 50) return NextResponse.json({ error: 'कॉपी 1 से 50 तक' }, { status: 400 });
    if (!isDate(date)) return NextResponse.json({ error: 'तारीख सही भरें' }, { status: 400 });
    if (date < earliestChangeDate()) return NextResponse.json({ error: 'पिछले महीनों का बिल बन चुका है। इस महीने या आगे की तारीख चुनें।' }, { status: 400 });
    const { refusal } = await customerInLine(caller, customerId);
    if (refusal) return refusal;

    // The hawker who already brings this customer's papers (the latest one)
    const { data: subs, error } = await db.from('customer_detail').select('*').eq('customer_id', customerId).order('sno', { ascending: false });
    if (error) throw new Error(error.message);
    const hawkerId = Number((subs || []).find((s: any) => Number(s.hawker_id))?.hawker_id) || 0;
    if (!hawkerId) return NextResponse.json({ error: 'इस ग्राहक का हॉकर तय नहीं है। पहली बार का अखबार कंप्यूटर पर जोड़ें।' }, { status: 400 });

    const res = await saveSubscription(new NextRequest(new URL('/api/subscriptions', req.nextUrl.origin), {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId, publica_id: publicaId, hawker_id: hawkerId, qty,
        circulation: 'Morning', s_date: date, c_date: extra ? addDays(date, 1) : null, from_day: '1-7', dis: 0, dely: 0
      })
    }));
    const json = await res.json();
    if (!res.ok || json.error) return NextResponse.json({ error: json.error || 'सेव नहीं हुआ' }, { status: res.ok ? 500 : res.status });
    await logAction(caller, extra ? 'extra' : 'start', customerId, { publica_id: publicaId, qty, date, sno: json.subscription?.sno });
    return NextResponse.json({ ok: true, by: caller.user.name || caller.user.username, at: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not save' }, { status: 500 });
  }
}
