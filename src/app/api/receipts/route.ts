import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { fySuffix } from '@/lib/financialYear';

export const dynamic = 'force-dynamic';

// This year's receipts from the database, for one customer or a page of all of them
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerIdStr = searchParams.get('customer_id');
    const table = `receipt${fySuffix()}`;

    if (customerIdStr) {
      const cid = parseInt(customerIdStr, 10);
      const { data, error } = await supabase.from(table).select('*').eq('customer_id', cid).order('id');
      if (error) throw new Error(`Could not read receipts: ${error.message}`);
      return NextResponse.json({ customer_id: cid, total: data.length, receipts: data });
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 1000);
    const start = (page - 1) * limit;
    const { data, count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .order('id', { ascending: false })
      .range(start, start + limit - 1);
    if (error) throw new Error(`Could not read receipts: ${error.message}`);

    return NextResponse.json({ total: count || 0, page, limit, receipts: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
