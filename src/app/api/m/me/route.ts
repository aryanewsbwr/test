import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { fySuffix } from '@/lib/financialYear';
import { mobileCaller, todayIndia, regionNames } from '@/lib/mobile';

export const dynamic = 'force-dynamic';

// Who is using the app, what they may do, their lines, and what they collected today
export async function GET(req: NextRequest) {
  const caller = await mobileCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { user } = caller;
  const today = todayIndia();

  const { data: mine } = await db.from(`receipt${fySuffix()}`).select('mal_recp_amt, remarks')
    .eq('recp_date', today.ddmmyyyy).ilike('remarks', `%"entered_by":"${user.id.replace(/[%_"]/g, '')}"%`);
  const amount = (mine || []).reduce((s: number, r: any) => s + Number(r.mal_recp_amt || 0), 0);

  const names = await regionNames();
  const lines = Array.from(names.entries())
    .filter(([id]) => !caller.regions || caller.regions.includes(id))
    .map(([id, name]) => ({ region_id: id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return NextResponse.json({
    id: user.id,
    name: user.name || user.username,
    can_collect: !!user.permissions?.can_collect,
    can_stop: !!user.permissions?.can_mark_discontinue,
    lines,
    today: { amount: Math.round(amount * 100) / 100, count: (mine || []).length }
  });
}
