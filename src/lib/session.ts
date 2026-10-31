import type { NextRequest, NextResponse } from 'next/server';

// Signed login cookie. Middleware runs on the edge runtime, so this file uses Web Crypto only.
export const SESSION_COOKIE = 'ana_session';

const SESSION_SECONDS = 7 * 24 * 60 * 60;

async function signingKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string) {
  return Uint8Array.from((hex.match(/../g) || []).map(pair => parseInt(pair, 16)));
}

export async function createSessionToken(userId: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const body = `${encodeURIComponent(userId)}.${expires}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(body));
  return `${body}.${toHex(signature)}`;
}

// The user id inside a valid, unexpired token, otherwise null
export async function readSessionToken(token: string | undefined): Promise<string | null> {
  const [encodedId, expires, signature] = (token || '').split('.');
  if (!encodedId || !expires || !/^[0-9a-f]{64}$/.test(signature || '')) return null;
  if (Number(expires) * 1000 <= Date.now()) return null;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(),
      fromHex(signature),
      new TextEncoder().encode(`${encodedId}.${expires}`)
    );
    return valid ? decodeURIComponent(encodedId) : null;
  } catch {
    return null;
  }
}

function isHttps(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  return (forwarded || req.nextUrl.protocol.replace(':', '')) === 'https';
}

export async function setSessionCookie(res: NextResponse, req: NextRequest, userId: string) {
  res.cookies.set(SESSION_COOKIE, await createSessionToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    path: '/',
    maxAge: SESSION_SECONDS
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}
