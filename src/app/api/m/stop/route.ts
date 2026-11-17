import { NextRequest, NextResponse } from 'next/server';
import { POST as saveStop } from '@/app/api/discontinue/route';
import { mobileCaller, customerInLine, earliestChangeDate, todayIndia, logAction } from '@/lib/mobile';

export const dynamic = 'force-dynamic';

const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// POST { customer_id, publica_id, kind: 'temporary' | 'permanent', from, to?, reason? }
// अखबार बंद, saved exactly as the Discontinue screen saves it (a permanent stop also closes the paper)
export async function POST(req: NextRequest) {
  const caller = await mobileCaller(req);
  if (caller instanceof NextResponse) return caller;
  if (!caller.user.permissions?.can_mark_discontinue) return NextResponse.json({ error: 'आपको अखबार बंद करने की अनुमति नहीं है' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const customerId = Number(body.customer_id);
    const publicaId = Number(body.publica_id);
    const permanent = body.kind === 'permanent';
    const from = String(body.from || '');
    const to = permanent ? from : String(body.to || '');
    if (!customerId || !publicaId) return NextResponse.json({ error: 'ग्राहक और अखबार चुनें' }, { status: 400 });
    if (!isDate(from) || !isDate(to)) return NextResponse.json({ error: 'तारीख सही भरें' }, { status: 400 });
    if (from < earliestChangeDate()) return NextResponse.json({ error: 'पिछले महीनों का बिल बन चुका है। इस महीने या आगे की तारीख चुनें।' }, { status: 400 });
    if (to < from) return NextResponse.json({ error: '"कब तक" की तारीख "कब से" के बाद की हो' }, { status: 400 });
    const { refusal } = await customerInLine(caller, customerId);
    if (refusal) return refusal;

    const res = await saveStop(new NextRequest(new URL('/api/discontinue', req.nextUrl.origin), {
      method: 'POST',
      body: JSON.stringify({ customer_id: customerId, publica_id: publicaId, temp_perma: permanent ? 'Permanent' : 'Temporary', temp_from: from, temp_to: to, entry_date: todayIndia().iso })
    }));
    const json = await res.json();
    if (!res.ok) return NextResponse.json({ error: json.error || 'सेव नहीं हुआ' }, { status: res.status });
    await logAction(caller, 'stop', customerId, { publica_id: publicaId, kind: permanent ? 'permanent' : 'temporary', from, to, reason: String(body.reason || '').slice(0, 300) });
    return NextResponse.json({ ok: true, by: caller.user.name || caller.user.username, at: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not save' }, { status: 500 });
  }
}
