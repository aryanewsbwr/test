import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { refuseWithout, currentUser } from '@/lib/auth';
import { companyAndMessage, forgetCompany } from '@/lib/companyServer';

export const dynamic = 'force-dynamic';

const explain = (m: string) => (/does not exist|schema cache|relation|column/i.test(m)
  ? 'company / message टेबल अभी डेटाबेस में नहीं है (या कॉलम कम हैं)। supabase/company_message.sql चलाएँ।' : m);

// GET -> { company, message } what bills and reports print (defaults until something is saved)
export async function GET(req: NextRequest) {
  if (!(await currentUser(req))) return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
  forgetCompany();
  return NextResponse.json(await companyAndMessage());
}

// POST { name, hindi_name, address, short_address, phone, whatsapp, email, proprietor } -> saved as row 1
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  const b = await req.json().catch(() => ({}));
  const t = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
  if (!t(b.name)) return NextResponse.json({ error: 'फर्म का नाम भरें' }, { status: 400 });
  const row = {
    id: 1, name: t(b.name, 50), hindi_name: t(b.hindi_name), address: t(b.address, 300), short_address: t(b.short_address),
    phone: t(b.phone, 60), mobile: t(b.whatsapp, 60), email: t(b.email), proprietor: t(b.proprietor)
  };
  const { error } = await db.from('company').upsert(row, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: explain(error.message) }, { status: 500 });
  forgetCompany();
  return NextResponse.json({ ok: true });
}
