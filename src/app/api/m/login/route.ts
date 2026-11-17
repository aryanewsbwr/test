import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { getAllUsers } from '@/lib/auth';
import { setSessionCookie } from '@/lib/session';
import { MOBILE_TABLE, hashPin, isPin, staffRow, explainMissing } from '@/lib/mobile';

export const dynamic = 'force-dynamic';

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

// POST { user_id, pin } -> logs in with the 4-digit PIN. Five wrong PINs lock that name for 15 minutes.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id || '');
    const pin = String(body.pin || '');
    if (!userId || !isPin(pin)) return NextResponse.json({ error: 'नाम चुनें और 4 अंकों का पिन डालें' }, { status: 400 });

    const user = (await getAllUsers()).find(u => u.id === userId && u.is_active !== false);
    const staff = user ? await staffRow(userId) : null;
    if (!user || !staff?.pin_hash) return NextResponse.json({ error: 'इस नाम का पिन नहीं बना है' }, { status: 401 });

    if (staff.locked_until && new Date(staff.locked_until).getTime() > Date.now()) {
      const mins = Math.ceil((new Date(staff.locked_until).getTime() - Date.now()) / 60000);
      return NextResponse.json({ error: `बहुत बार गलत पिन। ${mins} मिनट बाद फिर कोशिश करें।` }, { status: 429 });
    }

    if (hashPin(userId, pin) !== staff.pin_hash) {
      const fails = (staff.fails || 0) + 1;
      const lock = fails >= MAX_TRIES;
      await db.from(MOBILE_TABLE).update({
        fails: lock ? 0 : fails,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null
      }).eq('user_id', userId);
      return NextResponse.json({
        error: lock ? `बहुत बार गलत पिन। ${LOCK_MINUTES} मिनट बाद फिर कोशिश करें।` : `गलत पिन (${MAX_TRIES - fails} बार और)`
      }, { status: 401 });
    }

    if (staff.fails || staff.locked_until) {
      await db.from(MOBILE_TABLE).update({ fails: 0, locked_until: null }).eq('user_id', userId);
    }
    const res = NextResponse.json({ ok: true, name: user.name });
    await setSessionCookie(res, req, user.id);
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: explainMissing(err.message || 'Login failed') }, { status: 500 });
  }
}
