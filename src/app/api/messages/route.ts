import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';
import { forgetCompany } from '@/lib/companyServer';

export const dynamic = 'force-dynamic';

// Master > Message: the bill messages, kept in the old software's message table
// (Message_id, Dated, Message). The newest one prints at the bottom of every bill.
const explain = (m: string) => (/does not exist|schema cache|relation/i.test(m)
  ? 'message टेबल अभी डेटाबेस में नहीं है। supabase/company_message.sql चलाएँ।' : m);

// GET -> { messages: [{ message_id, dated, message }] } newest first
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  const { data, error } = await db.from('message').select('*').order('message_id', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: explain(error.message) }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
}

// POST { dated, message }
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  const b = await req.json().catch(() => ({}));
  const text = String(b.message ?? '').trim().slice(0, 300);
  const dated = String(b.dated ?? '').trim().slice(0, 10);
  if (!text) return NextResponse.json({ error: 'संदेश लिखें' }, { status: 400 });
  const { data: last, error: lastError } = await db.from('message').select('message_id').order('message_id', { ascending: false }).limit(1);
  if (lastError) return NextResponse.json({ error: explain(lastError.message) }, { status: 500 });
  const { error } = await db.from('message').insert({ message_id: (Number(last?.[0]?.message_id) || 0) + 1, dated, message: text });
  if (error) return NextResponse.json({ error: explain(error.message) }, { status: 500 });
  forgetCompany();
  return NextResponse.json({ ok: true });
}

// DELETE ?id=3
export async function DELETE(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await db.from('message').delete().eq('message_id', id);
  if (error) return NextResponse.json({ error: explain(error.message) }, { status: 500 });
  forgetCompany();
  return NextResponse.json({ ok: true });
}
