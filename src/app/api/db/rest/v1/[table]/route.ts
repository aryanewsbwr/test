import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// The browser forms reach the database only through here, after the login check in
// middleware. Only the tables those forms use are open, so app_users stays out of reach.
const BROWSER_TABLES = /^(customer|collect|region|holiday|(receipt|billno|bill)\d{8})$/;

const REQUEST_HEADERS = ['accept', 'accept-profile', 'content-profile', 'content-type', 'prefer', 'range', 'range-unit'];
const RESPONSE_HEADERS = ['content-type', 'content-range', 'preference-applied'];

async function forward(req: NextRequest, { params }: { params: { table: string } }) {
  if (!BROWSER_TABLES.test(params.table)) {
    return NextResponse.json({ error: 'This table is not available here' }, { status: 403 });
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const headers = new Headers({ apikey: key, Authorization: `Bearer ${key}` });
  for (const name of REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = req.method === 'POST' || req.method === 'PATCH';
  const upstream = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${params.table}${req.nextUrl.search}`,
    { method: req.method, headers, body: hasBody ? await req.text() : undefined, cache: 'no-store' }
  );

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  const body = upstream.status === 204 || req.method === 'HEAD' ? null : await upstream.text();
  return new NextResponse(body, { status: upstream.status, headers: responseHeaders });
}

export { forward as GET, forward as HEAD, forward as POST, forward as PATCH, forward as DELETE };
