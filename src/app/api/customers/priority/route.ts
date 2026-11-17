import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';
import { getReliableHindiName, storedHindiName } from '@/lib/transliteration';

export const dynamic = 'force-dynamic';

// Transaction > Hawker's Customer Priority: a hawker's customers (those he brings a running paper to)
// in delivery order (the customer's Priority), to be moved up or down and saved.

const iso = (v: unknown) => {
  const t = String(v ?? '').trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};

async function hawkerCustomers(hawkerId: number) {
  const today = new Date().toISOString().slice(0, 10);
  // Page by page: a hawker's rows, old closed ones included, can pass the 1,000 a request returns
  const subs: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('customer_detail').select('customer_id, publica_id, qty, s_date, c_date')
      .eq('hawker_id', hawkerId).order('sno', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    subs.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const running = (subs || []).filter(s => { const s1 = iso(s.s_date), c = iso(s.c_date); return (!s1 || s1 <= today) && (!c || today < c); });
  const ids = Array.from(new Set(running.map(s => Number(s.customer_id))));
  const customers: any[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error: e } = await db.from('customer').select('customer_id, name_eng, name_hindi, name_hindi_unicode, priority, region_id').in('customer_id', ids.slice(i, i + 300));
    if (e) throw new Error(e.message);
    customers.push(...(data || []));
  }
  const { data: pubs } = await db.from('publication').select('publica_id, abrv, public_name');
  const short = new Map((pubs || []).map((p: any) => [Number(p.publica_id), String(p.abrv || p.public_name || p.publica_id).trim()]));
  return customers.map(c => ({
    customer_id: Number(c.customer_id),
    name: getReliableHindiName(storedHindiName(c), c.name_eng) || c.name_eng,
    name_eng: c.name_eng,
    priority: Number(c.priority) || 0,
    region_id: Number(c.region_id) || 0,
    papers: running.filter(s => Number(s.customer_id) === Number(c.customer_id)).map(s => `${short.get(Number(s.publica_id)) || s.publica_id}${Number(s.qty) > 1 ? ` ×${s.qty}` : ''}`).join(', ')
  })).sort((a, b) => a.priority - b.priority || a.customer_id - b.customer_id);
}

// GET ?hawker_id=1378 -> { customers: [...] } in delivery order
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  const hawkerId = Number(req.nextUrl.searchParams.get('hawker_id'));
  if (!hawkerId) return NextResponse.json({ error: 'हॉकर चुनें' }, { status: 400 });
  try {
    return NextResponse.json({ customers: await hawkerCustomers(hawkerId) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST { hawker_id, customer_ids: [in the new order] }
// The hawker's customers keep the same priority numbers they had, handed out in the new order,
// so customers of other hawkers in the same region keep their places.
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  try {
    const body = await req.json().catch(() => ({}));
    const hawkerId = Number(body.hawker_id);
    const order: number[] = (Array.isArray(body.customer_ids) ? body.customer_ids : []).map(Number).filter((n: number) => n > 0);
    if (!hawkerId || !order.length) return NextResponse.json({ error: 'हॉकर और ग्राहक चाहिए' }, { status: 400 });
    const current = await hawkerCustomers(hawkerId);
    const known = new Set(current.map(c => c.customer_id));
    if (order.length !== current.length || order.some(id => !known.has(id))) {
      return NextResponse.json({ error: 'सूची बदल गई है। हॉकर फिर से चुनकर दोबारा करें।' }, { status: 409 });
    }
    // The numbers in use, smallest first, made strictly increasing (a repeated number moves up by one)
    const numbers = current.map(c => c.priority).sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) numbers[i] = Math.max(numbers[i] || 1, i ? numbers[i - 1] + 1 : 1);
    const was = new Map(current.map(c => [c.customer_id, c.priority]));
    const changes = order.map((id, i) => ({ id, priority: numbers[i] })).filter(x => was.get(x.id) !== x.priority);
    for (const x of changes) {
      const { error } = await db.from('customer').update({ priority: x.priority }).eq('customer_id', x.id);
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, changed: changes.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
