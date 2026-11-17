import { NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { getAllUsers } from '@/lib/auth';
import { MOBILE_TABLE, explainMissing } from '@/lib/mobile';

export const dynamic = 'force-dynamic';

// The names on the mobile login screen: active users who have a PIN set. Open before login,
// so it gives only the id and name.
export async function GET() {
  const { data, error } = await db.from(MOBILE_TABLE).select('user_id, pin_hash');
  if (error) return NextResponse.json({ error: explainMissing(error.message) }, { status: 500 });
  const withPin = new Set((data || []).filter((r: any) => r.pin_hash).map((r: any) => r.user_id));
  const users = (await getAllUsers())
    .filter(u => u.is_active !== false && withPin.has(u.id))
    .map(u => ({ id: u.id, name: u.name || u.username }))
    .sort((a, b) => a.name.localeCompare(b.name, 'hi'));
  return NextResponse.json({ staff: users });
}
