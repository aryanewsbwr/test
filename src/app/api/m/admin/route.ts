import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';
import { MOBILE_TABLE, hashPin, isPin, explainMissing } from '@/lib/mobile';

export const dynamic = 'force-dynamic';

// User Permissions screen: a user's mobile-app settings (never the PIN itself)
// GET ?user_id=x -> { has_pin, region_ids, collect_id }
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;
  const userId = String(req.nextUrl.searchParams.get('user_id') || '');
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  const { data, error } = await db.from(MOBILE_TABLE).select('pin_hash, region_ids, collect_id').eq('user_id', userId).maybeSingle();
  if (error) return NextResponse.json({ error: explainMissing(error.message) }, { status: 500 });
  return NextResponse.json({ has_pin: !!data?.pin_hash, region_ids: data?.region_ids || [], collect_id: data?.collect_id ?? null });
}

// POST { user_id, pin?, clear_pin?, region_ids, collect_id }
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id || '');
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  const pin = String(body.pin ?? '').trim();
  if (pin && !isPin(pin)) return NextResponse.json({ error: 'पिन 4 अंकों का हो' }, { status: 400 });

  const row: any = {
    user_id: userId,
    region_ids: (Array.isArray(body.region_ids) ? body.region_ids : []).map(Number).filter((n: number) => n > 0),
    collect_id: Number(body.collect_id) || null,
    updated_at: new Date().toISOString()
  };
  if (pin) Object.assign(row, { pin_hash: hashPin(userId, pin), fails: 0, locked_until: null });
  if (body.clear_pin) Object.assign(row, { pin_hash: null });

  const { error } = await db.from(MOBILE_TABLE).upsert(row, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: explainMissing(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
