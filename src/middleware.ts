import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SESSION_COOKIE } from '@/lib/session';

// Meta calls the webhook without a login; it checks its own signature
const OPEN_PATHS = ['/api/auth/login', '/api/auth/logout', '/api/webhooks/whatsapp'];

export async function middleware(req: NextRequest) {
  if (OPEN_PATHS.includes(req.nextUrl.pathname)) return NextResponse.next();

  const userId = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (userId) return NextResponse.next();

  return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
}

// /data holds the customer and hawker files the screens load
export const config = {
  matcher: ['/api/:path*', '/data/:path*']
};
