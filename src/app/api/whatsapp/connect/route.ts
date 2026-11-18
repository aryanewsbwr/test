import { NextRequest, NextResponse } from 'next/server';
import { refuseWithout } from '@/lib/auth';
import { getSecureWhatsAppToken } from '@/lib/whatsappService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Checks the WhatsApp connection with the stored token, so nobody needs Meta's tools:
// which number the website sends from, which WhatsApp Business Accounts the token can manage,
// and whether each account is subscribed to this app (without that, Meta forwards no replies).
//   GET   -> { phone, accounts: [{ id, name, subscribed_apps }] }
//   POST  -> subscribes every account the token manages to the app, then returns the same

const VERSION = process.env.WA_API_VERSION || 'v25.0';
const graph = async (path: string, token: string, method = 'GET') => {
  const res = await fetch(`https://graph.facebook.com/${VERSION}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, { method, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
};

async function status(token: string, waba = '') {
  const phoneId = process.env.WA_PHONE_NUMBER_ID || '';
  const phone = phoneId
    ? (await graph(`${phoneId}?fields=display_phone_number,verified_name,quality_rating,platform_type,status,code_verification_status`, token)).data
    : { error: 'WA_PHONE_NUMBER_ID is not set' };
  // The accounts this token may manage, from the token's own description
  const debug = (await graph(`debug_token?input_token=${encodeURIComponent(token)}`, token)).data?.data || {};
  const ids = new Set<string>();
  for (const scope of debug.granular_scopes || []) {
    if (/whatsapp_business_(management|messaging)/.test(scope.scope)) (scope.target_ids || []).forEach((id: string) => ids.add(String(id)));
  }
  // Failing that, the accounts of the businesses the token belongs to, or one given as ?waba=
  if (!ids.size) {
    const biz = (await graph('me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name},client_whatsapp_business_accounts{id,name}', token)).data;
    for (const b of biz?.data || []) {
      for (const w of [...(b.owned_whatsapp_business_accounts?.data || []), ...(b.client_whatsapp_business_accounts?.data || [])]) ids.add(String(w.id));
    }
  }
  if (waba && /^\d+$/.test(waba)) ids.add(waba);
  const accounts = [];
  for (const id of Array.from(ids)) {
    const info = (await graph(`${id}?fields=name`, token)).data;
    const apps = (await graph(`${id}/subscribed_apps`, token)).data;
    accounts.push({ id, name: info?.name || '', subscribed_apps: (apps?.data || []).map((a: any) => a.whatsapp_business_api_data?.name || a.name || a.id), error: apps?.error?.message || info?.error?.message || null });
  }
  return { phone, app_id: debug.app_id || null, token_type: debug.type || null, scopes: (debug.granular_scopes || []).map((g: any) => `${g.scope}:${(g.target_ids || []).length}`), accounts };
}

export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;
  const token = getSecureWhatsAppToken();
  if (!token) return NextResponse.json({ error: 'WhatsApp token is not set' }, { status: 500 });
  return NextResponse.json(await status(token, req.nextUrl.searchParams.get('waba') || ''));
}

export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_manage_users');
  if (refused) return refused;
  const token = getSecureWhatsAppToken();
  if (!token) return NextResponse.json({ error: 'WhatsApp token is not set' }, { status: 500 });
  const waba = req.nextUrl.searchParams.get('waba') || '';
  const before = await status(token, waba);
  const results = [];
  for (const a of before.accounts) {
    const r = await graph(`${a.id}/subscribed_apps`, token, 'POST');
    results.push({ id: a.id, ok: r.ok, error: r.data?.error?.message || null });
  }
  return NextResponse.json({ subscribed: results, ...(await status(token, waba)) });
}
