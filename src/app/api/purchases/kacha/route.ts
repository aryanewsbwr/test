import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Transaction > Purchase > कच्चा बिल: a daily diary of the copies that came in from each publisher,
// kept apart from the real (pakka) bills, so the Purchase reports only ever count real bills.
// When the publisher's bill arrives, the month's diary fills the Purchase tab, and once that bill is
// saved its diary days are marked with the bill's Purchase_id, so they are never billed twice.
//   purchase_kacha (id, entry_date, publish_id, publica_id, day, qty, note, purchase_id, created_at)

const TABLE = 'purchase_kacha';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const isMonth = (v: unknown) => /^\d{4}-\d{2}$/.test(String(v || ''));

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
};

// A missing table gets a clear message instead of a database error
const explain = (message: string) => /does not exist|schema cache|relation/i.test(message)
  ? 'कच्चा बिल की टेबल अभी डेटाबेस में नहीं है। पहले दिया गया SQL चलाएँ।'
  : message;

// GET ?publish_id=3&month=2026-11 -> { rows } that publisher's diary for the month, by date
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_billing');
  if (refused) return refused;
  const params = req.nextUrl.searchParams;
  const publishId = Number(params.get('publish_id'));
  const month = String(params.get('month') || '');
  if (!publishId || !isMonth(month)) return NextResponse.json({ error: 'Publisher और महीना चुनें' }, { status: 400 });
  const { from, to } = monthRange(month);
  const { data, error } = await supabaseAdmin.from(TABLE).select('*')
    .eq('publish_id', publishId).gte('entry_date', from).lte('entry_date', to)
    .order('entry_date', { ascending: true }).order('id', { ascending: true });
  if (error) return NextResponse.json({ error: explain(error.message) }, { status: 500 });
  return NextResponse.json({ rows: data || [] });
}

// POST { publish_id, entry_date, lines: [{ publica_id, day, qty, note }] }
//   saves that day's diary for the publisher (its not-yet-billed lines are replaced)
// POST { action: 'billed', publish_id, month, purchase_id }
//   marks the month's not-yet-billed diary lines as part of that saved bill
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_billing');
  if (refused) return refused;
  try {
    const body = await req.json().catch(() => ({}));
    const publishId = Number(body.publish_id);
    if (!publishId) return NextResponse.json({ error: 'Publisher चुनें' }, { status: 400 });

    if (body.action === 'billed') {
      const purchaseId = Number(body.purchase_id);
      if (!purchaseId || !isMonth(body.month)) return NextResponse.json({ error: 'Bill और महीना चाहिए' }, { status: 400 });
      const { from, to } = monthRange(body.month);
      const { data, error } = await supabaseAdmin.from(TABLE).update({ purchase_id: purchaseId })
        .eq('publish_id', publishId).gte('entry_date', from).lte('entry_date', to).is('purchase_id', null).select('id');
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, marked: (data || []).length });
    }

    if (!isDate(body.entry_date)) return NextResponse.json({ error: 'तारीख सही भरें' }, { status: 400 });
    const lines = (Array.isArray(body.lines) ? body.lines : []).map((l: any) => ({
      publica_id: Number(l.publica_id),
      day: DAYS.includes(l.day) ? l.day : null,
      qty: Math.round(Number(l.qty) || 0),
      note: String(l.note ?? '').trim().slice(0, 300) || null
    }));
    const wrong = lines.findIndex((l: any) => !l.publica_id || l.qty <= 0);
    if (wrong >= 0) return NextResponse.json({ error: `लाइन ${wrong + 1}: पेपर और Qty भरें` }, { status: 400 });

    // The day's diary is written again; lines already in a saved bill stay as they are
    const { data: old, error: oldError } = await supabaseAdmin.from(TABLE).select('*')
      .eq('publish_id', publishId).eq('entry_date', body.entry_date).is('purchase_id', null);
    if (oldError) throw new Error(oldError.message);
    const { error: clearError } = await supabaseAdmin.from(TABLE).delete()
      .eq('publish_id', publishId).eq('entry_date', body.entry_date).is('purchase_id', null);
    if (clearError) throw new Error(clearError.message);
    if (lines.length) {
      const { error } = await supabaseAdmin.from(TABLE).insert(lines.map((l: any) => ({ ...l, publish_id: publishId, entry_date: body.entry_date })));
      if (error) {
        // Put the day back as it was
        if (old?.length) await supabaseAdmin.from(TABLE).insert(old.map(({ id, created_at, ...rest }: any) => rest));
        throw new Error(error.message);
      }
    }
    return NextResponse.json({ ok: true, saved: lines.length });
  } catch (err: any) {
    return NextResponse.json({ error: explain(err.message || 'Could not save') }, { status: 500 });
  }
}

// DELETE ?id=5 -> removes one diary line that is not yet in a bill
export async function DELETE(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_billing');
  if (refused) return refused;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'Line is required' }, { status: 400 });
  const { error } = await supabaseAdmin.from(TABLE).delete().eq('id', id).is('purchase_id', null);
  if (error) return NextResponse.json({ error: explain(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
