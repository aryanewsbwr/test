import { NextRequest, NextResponse } from 'next/server';
import { mobileCaller, searchList, matchCustomers } from '@/lib/mobile';

export const dynamic = 'force-dynamic';

// GET ?q=शर्मा | sharma | 5179 | 98290 -> { customers: [{ customer_id, name, name_eng, region }] }
export async function GET(req: NextRequest) {
  const caller = await mobileCaller(req);
  if (caller instanceof NextResponse) return caller;
  try {
    const q = String(req.nextUrl.searchParams.get('q') || '').slice(0, 60);
    const list = (await searchList()).filter(e => !caller.regions || caller.regions.includes(e.card.region_id));
    return NextResponse.json({ customers: matchCustomers(list, q) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Search failed' }, { status: 500 });
  }
}
