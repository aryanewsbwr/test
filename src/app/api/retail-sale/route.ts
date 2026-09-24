import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const custIdParam = searchParams.get('customer_id');
    const limit = parseInt(searchParams.get('limit') || '500', 10);

    // 1. Fetch Publications from Supabase for names
    const { data: dbPubs } = await supabase
      .from('publication')
      .select('publica_id, public_name, pub_hindi');

    const pubMap = new Map<number, any>();
    (dbPubs || []).forEach((p: any) => pubMap.set(Number(p.publica_id), p));

    // 2. Fetch Retail Sales from Supabase table retailsale20252026
    let query = supabase
      .from('retailsale20252026')
      .select('*')
      .order('retail_id', { ascending: false })
      .limit(limit);

    if (dateParam && dateParam !== 'all') {
      query = query.eq('vr_date', dateParam);
    }
    if (custIdParam) {
      query = query.eq('customer_id', Number(custIdParam));
    }

    const { data: dbSales, error } = await query;

    if (error) {
      console.error('Supabase retail sale query error:', error);
      return NextResponse.json({ error: error.message, sales: [] }, { status: 500 });
    }

    const salesList = dbSales || [];

    // 3. Fetch matching customer details from Supabase if needed
    const customerIds = Array.from(new Set(salesList.map((s: any) => Number(s.customer_id)).filter(Boolean)));
    const custMap = new Map<number, any>();
    if (customerIds.length > 0) {
      const { data: dbCusts } = await supabase
        .from('customer')
        .select('customer_id, name_eng, name_hindi, add1, region_id')
        .in('customer_id', customerIds.slice(0, 200));

      (dbCusts || []).forEach((c: any) => custMap.set(Number(c.customer_id), c));
    }

    // 4. Enrich sales with Supabase publication & customer metadata
    const enriched = salesList.map((s: any) => {
      const pubId = Number(s.publica_id);
      const custId = Number(s.customer_id);
      const pub = pubMap.get(pubId);
      const cust = custMap.get(custId);

      return {
        retail_id: Number(s.retail_id),
        Retail_id: Number(s.retail_id),
        sale_id: Number(s.retail_id),
        vr_date: s.vr_date,
        Vr_Date: s.vr_date,
        customer_id: custId,
        Customer_id: custId,
        customer_name_eng: cust ? cust.name_eng : `Customer #${custId}`,
        customer_name_hindi: cust ? (cust.name_hindi || cust.name_eng) : `ग्राहक #${custId}`,
        customer_address: cust ? (cust.add1 || '') : '',
        region_id: cust ? cust.region_id : null,
        publica_id: pubId,
        Publica_id: pubId,
        public_name: pub ? (pub.public_name || pub.name) : `Publication #${pubId}`,
        Publica_Name: pub ? (pub.public_name || pub.name) : `Publication #${pubId}`,
        copies: Number(s.copies || 1),
        Copies: Number(s.copies || 1),
        rate: Number(s.rate || 0),
        Rate: Number(s.rate || 0),
        amt: Number(s.amt !== undefined ? s.amt : 0),
        Amt: Number(s.amt !== undefined ? s.amt : 0),
        amount: Number(s.amt !== undefined ? s.amt : 0),
        narr: s.narr || '',
        Narr: s.narr || '',
        narration: s.narr || ''
      };
    });

    return NextResponse.json({
      source: 'supabase',
      total: enriched.length,
      sales: enriched
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customer_id,
      vr_date = new Date().toISOString().split('T')[0],
      publica_id,
      copies = 1,
      rate = 0,
      amt = 0,
      narr = '',
      items = []
    } = body;

    if (!customer_id) {
      return NextResponse.json({ error: 'Customer ID is required.' }, { status: 400 });
    }

    // Determine highest retail_id from Supabase
    let maxId = 1200;
    try {
      const { data: maxRow } = await supabase
        .from('retailsale20252026')
        .select('retail_id')
        .order('retail_id', { ascending: false })
        .limit(1);

      if (maxRow && maxRow.length > 0 && maxRow[0].retail_id) {
        maxId = Math.max(maxId, Number(maxRow[0].retail_id));
      }
    } catch (_) {}

    // Prepare rows for insertion into Supabase
    let rowsToInsert: any[] = [];

    if (Array.isArray(items) && items.length > 0) {
      rowsToInsert = items.map((item: any, idx: number) => ({
        retail_id: maxId + 1 + idx,
        vr_date: vr_date,
        customer_id: Number(customer_id),
        publica_id: Number(item.publica_id || item.Publica_id),
        copies: Number(item.copies || item.qty || 1),
        rate: Number(item.rate || 0),
        amt: Number(item.amt !== undefined ? item.amt : (Number(item.copies || 1) * Number(item.rate || 0))),
        narr: item.narr || narr || ''
      }));
    } else if (publica_id) {
      rowsToInsert = [{
        retail_id: maxId + 1,
        vr_date: vr_date,
        customer_id: Number(customer_id),
        publica_id: Number(publica_id),
        copies: Number(copies || 1),
        rate: Number(rate || 0),
        amt: Number(amt !== undefined ? amt : (Number(copies || 1) * Number(rate || 0))),
        narr: narr || ''
      }];
    } else {
      return NextResponse.json({ error: 'At least one publication item is required.' }, { status: 400 });
    }

    // Direct insert into Supabase table
    const { data: inserted, error: insertError } = await supabase
      .from('retailsale20252026')
      .insert(rowsToInsert)
      .select();

    if (insertError) {
      console.error('Supabase retail sale insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      source: 'supabase',
      message: `Successfully saved ${rowsToInsert.length} retail sale item(s) to Supabase.`,
      sales: inserted || rowsToInsert
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const retailId = searchParams.get('retail_id');
    const customerId = searchParams.get('customer_id');
    const date = searchParams.get('date');

    if (retailId) {
      const { error } = await supabase
        .from('retailsale20252026')
        .delete()
        .eq('retail_id', Number(retailId));

      if (error) throw error;
      return NextResponse.json({ success: true, message: `Retail sale #${retailId} deleted from Supabase.` });
    }

    if (customerId && date) {
      const { error } = await supabase
        .from('retailsale20252026')
        .delete()
        .eq('customer_id', Number(customerId))
        .eq('vr_date', date);

      if (error) throw error;
      return NextResponse.json({ success: true, message: `Retail sales for customer #${customerId} on ${date} deleted from Supabase.` });
    }

    return NextResponse.json({ error: 'retail_id or (customer_id and date) required.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
