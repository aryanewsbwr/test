import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseAdmin';
import { isDue, dueTotal } from '@/lib/dueRule';
import { mobileCaller, canSeeRegion, regionNames, customerCard, phonesOf, balancesFor } from '@/lib/mobile';

export const dynamic = 'force-dynamic';

// GET ?region_id=11 -> that line's customers who owe, in the hawker's order, with the line's total.
// The same rule as the Due List: more than ₹1 owed, the total rounded once.
export async function GET(req: NextRequest) {
  const caller = await mobileCaller(req);
  if (caller instanceof NextResponse) return caller;
  try {
    const regionId = Number(req.nextUrl.searchParams.get('region_id'));
    if (!regionId) return NextResponse.json({ error: 'लाइन चुनें' }, { status: 400 });
    if (!canSeeRegion(caller, regionId)) return NextResponse.json({ error: 'यह लाइन आपकी नहीं है' }, { status: 403 });

    const { data: customers, error } = await db.from('customer').select('*').eq('region_id', regionId).order('customer_id').limit(5000);
    if (error) throw new Error(error.message);
    const names = await regionNames();
    const balances = await balancesFor((customers || []).map((c: any) => Number(c.customer_id)));
    const rows = (customers || [])
      .map((c: any) => ({ ...customerCard(c, rid => names.get(rid) || ''), balance: balances.get(Number(c.customer_id)) || 0, phones: phonesOf(c) }))
      .filter(r => isDue(r.balance))
      .sort((a, b) => a.priority - b.priority || a.customer_id - b.customer_id);
    return NextResponse.json({
      region: names.get(regionId) || '',
      count: rows.length,
      total: dueTotal(rows.map(r => r.balance)),
      customers: rows
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not read dues' }, { status: 500 });
  }
}
