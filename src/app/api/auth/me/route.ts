import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { clearSessionCookie, setSessionCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Renews the login while the user stays active, so a removed user drops out when it runs out
export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) {
    const res = NextResponse.json({ error: 'Please log in again' }, { status: 401 });
    clearSessionCookie(res);
    return res;
  }

  const { password_hash, ...safeUser } = user;
  const res = NextResponse.json({ user: safeUser });
  await setSessionCookie(res, req, user.id);
  return res;
}
