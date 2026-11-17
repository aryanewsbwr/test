import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Transaction > Apply Customer Agent: puts a collection agent (collect.Collect_id) on customers, as the
// old software did, in the customer's Self_Agent column. -1 there means no agent (the customer pays himself).
// The customers: one region, optionally only customer numbers from .. to.

function scope(q: any, regionId: number, fromId: number, toId: number) {
  q = q.eq('region_id', regionId);
  if (fromId) q = q.gte('customer_id', fromId);
  if (toId) q = q.lte('customer_id', toId);
  return q;
}

// GET ?region_id=62&from=&to= -> { total, by_agent: { "-1": 120, "4": 30 } } for the customers it would change
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  const p = req.nextUrl.searchParams;
  const regionId = Number(p.get('region_id'));
  if (!regionId) return NextResponse.json({ error: 'Region चुनें' }, { status: 400 });
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await scope(db.from('customer').select('customer_id, self_agent'), regionId, Number(p.get('from')) || 0, Number(p.get('to')) || 0)
      .order('customer_id').range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const byAgent: Record<string, number> = {};
  for (const r of rows) { const k = String(r.self_agent ?? -1); byAgent[k] = (byAgent[k] || 0) + 1; }
  return NextResponse.json({ total: rows.length, by_agent: byAgent });
}

// POST { collect_id (or -1 to remove), region_id, from?, to? } -> { updated }
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_access_master');
  if (refused) return refused;
  const body = await req.json().catch(() => ({}));
  const regionId = Number(body.region_id);
  const collectId = Number(body.collect_id);
  const fromId = Number(body.from) || 0;
  const toId = Number(body.to) || 0;
  if (!regionId) return NextResponse.json({ error: 'Region चुनें' }, { status: 400 });
  if (!collectId) return NextResponse.json({ error: 'Agent चुनें' }, { status: 400 });
  if (fromId && toId && toId < fromId) return NextResponse.json({ error: '"To" ग्राहक नं. "From" से बड़ा हो' }, { status: 400 });
  if (collectId !== -1) {
    const { data: agent } = await db.from('collect').select('Collect_id').eq('Collect_id', collectId).maybeSingle();
    if (!agent) return NextResponse.json({ error: 'यह Agent नहीं मिला' }, { status: 400 });
  }
  const { data, error } = await scope(db.from('customer').update({ self_agent: collectId }), regionId, fromId, toId).select('customer_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: (data || []).length });
}
