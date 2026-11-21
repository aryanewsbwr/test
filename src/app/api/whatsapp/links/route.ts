import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// WhatsApp Replies: which customer a WhatsApp number belongs to, as confirmed or corrected by staff.
//   POST   { number, customer_id }  link the number to that customer (from now on)
//   DELETE ?number=                  remove the link (matching goes back to the saved phone numbers)
const tenOf = (n: unknown) => String(n ?? '').replace(/\D/g, '').slice(-10);
const missingTable = (msg: string) => /does not exist|schema cache/i.test(msg)
  ? 'पहले supabase/wa_number_links.sql एक बार Supabase SQL Editor में चलाएँ' : msg;

export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_reports');
  if (refused) return refused;
  const body = await req.json().catch(() => ({}));
  const number = tenOf(body.number);
  const customerId = Number(body.customer_id);
  if (!/^\d{10}$/.test(number) || !Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: 'नंबर और ग्राहक दोनों चाहिए' }, { status: 400 });
  }
  const { data: cust } = await supabaseAdmin.from('customer').select('customer_id').eq('customer_id', customerId).maybeSingle();
  if (!cust) return NextResponse.json({ error: `ग्राहक #${customerId} नहीं मिला` }, { status: 400 });
  const { error } = await supabaseAdmin.from('wa_number_links').upsert({ number, customer_id: customerId, set_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: missingTable(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_reports');
  if (refused) return refused;
  const number = tenOf(req.nextUrl.searchParams.get('number'));
  if (!/^\d{10}$/.test(number)) return NextResponse.json({ error: 'number required' }, { status: 400 });
  const { error } = await supabaseAdmin.from('wa_number_links').delete().eq('number', number);
  if (error) return NextResponse.json({ error: missingTable(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
