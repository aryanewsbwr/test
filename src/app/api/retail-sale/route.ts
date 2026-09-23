import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

function loadJson(filename: string): any[] {
  const f = path.join(process.cwd(), 'public', 'data', filename);
  if (fs.existsSync(f)) {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

function saveJson(filename: string, data: any): void {
  const f = path.join(process.cwd(), 'public', 'data', filename);
  fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // e.g. "2025-04-06"
    const custIdParam = searchParams.get('customer_id'); // e.g. "11930"
    const limit = parseInt(searchParams.get('limit') || '500', 10);

    const publications = loadJson('publications.json');
    const pubMap = new Map<number, any>();
    publications.forEach((p: any) => pubMap.set(Number(p.publica_id), p));

    const customers = loadJson('all_customers.json');
    const custMap = new Map<number, any>();
    customers.forEach((c: any) => custMap.set(Number(c.customer_id), c));

    const localSales = loadJson('retailsale.json');
    let mergedSales = [...localSales];

    // Try fetching latest from Supabase table retailsale20252026
    try {
      let query = supabase
        .from('retailsale20252026')
        .select('*')
        .order('Retail_id', { ascending: false })
        .limit(limit);

      if (dateParam && dateParam !== 'all') {
        query = query.eq('Vr_Date', dateParam);
      }
      if (custIdParam) {
        query = query.eq('Customer_id', Number(custIdParam));
      }

      const { data: dbSales, error } = await query;

      if (!error && dbSales && dbSales.length > 0) {
        const existingIds = new Set(mergedSales.map(s => Number(s.Retail_id || s.retail_id)));
        dbSales.forEach((dbRow: any) => {
          const rId = Number(dbRow.Retail_id);
          if (!existingIds.has(rId)) {
            existingIds.add(rId);
            mergedSales.push({
              Retail_id: rId,
              retail_id: rId,
              Vr_Date: dbRow.Vr_Date,
              vr_date: dbRow.Vr_Date,
              Customer_id: Number(dbRow.Customer_id),
              customer_id: Number(dbRow.Customer_id),
              Publica_id: Number(dbRow.Publica_id),
              publica_id: Number(dbRow.Publica_id),
              Copies: Number(dbRow.Copies || 1),
              copies: Number(dbRow.Copies || 1),
              Rate: Number(dbRow.Rate || 0),
              rate: Number(dbRow.Rate || 0),
              Amt: Number(dbRow.Amt || 0),
              amt: Number(dbRow.Amt || 0),
              Narr: dbRow.Narr || '',
              narr: dbRow.Narr || ''
            });
          }
        });
      }
    } catch (sbErr) {
      console.warn('Supabase retailsale20252026 read warning:', sbErr);
    }

    // Filter local if needed
    let filtered = mergedSales;
    if (dateParam && dateParam !== 'all') {
      filtered = filtered.filter(s => (s.Vr_Date || s.vr_date) === dateParam);
    }
    if (custIdParam) {
      filtered = filtered.filter(s => Number(s.Customer_id || s.customer_id) === Number(custIdParam));
    }

    // Sort descending by Retail_id
    filtered.sort((a, b) => Number(b.Retail_id || b.retail_id || 0) - Number(a.Retail_id || a.retail_id || 0));

    // Enrich with publication and customer metadata
    const enriched = filtered.slice(0, limit).map(s => {
      const pubId = Number(s.Publica_id || s.publica_id);
      const custId = Number(s.Customer_id || s.customer_id);
      const pub = pubMap.get(pubId);
      const cust = custMap.get(custId);

      return {
        ...s,
        Retail_id: Number(s.Retail_id || s.retail_id),
        retail_id: Number(s.Retail_id || s.retail_id),
        Customer_id: custId,
        customer_id: custId,
        customer_name_eng: cust ? cust.name_eng : `Customer #${custId}`,
        customer_name_hindi: cust ? (cust.name_hindi || cust.name_eng) : `ग्राहक #${custId}`,
        customer_address: cust ? (cust.add1 || '') : '',
        region_id: cust ? cust.region_id : null,
        Publica_id: pubId,
        publica_id: pubId,
        pub_name: pub ? pub.public_name : `Publication #${pubId}`,
        pub_hindi: pub ? (pub.pub_hindi || pub.public_name) : `प्रकाशन #${pubId}`,
        Copies: Number(s.Copies || s.copies || 1),
        copies: Number(s.Copies || s.copies || 1),
        Rate: Number(s.Rate || s.rate || 0),
        rate: Number(s.Rate || s.rate || 0),
        Amt: Number(s.Amt || s.amt || 0),
        amt: Number(s.Amt || s.amt || 0),
        Narr: s.Narr || s.narr || '',
        narr: s.Narr || s.narr || ''
      };
    });

    return NextResponse.json({
      success: true,
      sales: enriched,
      total_count: enriched.length,
      total_amount: enriched.reduce((sum, item) => sum + item.Amt, 0),
      total_copies: enriched.reduce((sum, item) => sum + item.Copies, 0)
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customer_id,
      vr_date = new Date().toISOString().split('T')[0],
      items = []
    } = body;

    if (!customer_id) {
      return NextResponse.json({ error: 'Customer ID is required for Retail Sale to Permanent Customer.' }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one publication item is required.' }, { status: 400 });
    }

    // Determine next Retail_id
    let maxId = 1115;
    try {
      const { data: maxRow } = await supabase
        .from('retailsale20252026')
        .select('Retail_id')
        .order('Retail_id', { ascending: false })
        .limit(1);

      if (maxRow && maxRow.length > 0 && maxRow[0].Retail_id) {
        maxId = Math.max(maxId, Number(maxRow[0].Retail_id));
      }
    } catch {
      // fallback
    }

    const localSales = loadJson('retailsale.json');
    if (localSales.length > 0) {
      const localMax = Math.max(...localSales.map((s: any) => Number(s.Retail_id || s.retail_id || 0)));
      maxId = Math.max(maxId, localMax);
    }

    const newRowsToSave: any[] = [];
    const supabaseRows: any[] = [];

    items.forEach((item: any, idx: number) => {
      const nextId = maxId + 1 + idx;
      const pubId = Number(item.publica_id || item.Publica_id);
      const copies = Number(item.copies || item.qty || 1);
      const rate = Number(item.rate || 0);
      const amt = Number(item.amt !== undefined ? item.amt : (copies * rate));
      const narr = item.narr || item.remarks || '';

      const row = {
        Retail_id: nextId,
        retail_id: nextId,
        Vr_Date: vr_date,
        vr_date: vr_date,
        Customer_id: Number(customer_id),
        customer_id: Number(customer_id),
        Publica_id: pubId,
        publica_id: pubId,
        Copies: copies,
        copies: copies,
        Rate: rate,
        rate: rate,
        Amt: amt,
        amt: amt,
        Narr: narr,
        narr: narr,
        created_at: new Date().toISOString()
      };

      newRowsToSave.push(row);

      supabaseRows.push({
        Retail_id: nextId,
        Vr_Date: vr_date,
        Customer_id: Number(customer_id),
        Publica_id: pubId,
        Copies: copies,
        Rate: rate,
        Amt: amt,
        Narr: narr
      });
    });

    // 1. Insert into Supabase
    let sbSuccess = false;
    try {
      // Try generic retailsale table
      const genRows = items.map(item => {
        const copies = Number(item.copies || item.qty || 1);
        const rate = Number(item.rate || 0);
        const amt = Number(item.amt !== undefined ? item.amt : (copies * rate));
        return {
          customer_id: Number(customer_id),
          publica_id: Number(item.publica_id || item.Publica_id),
          copies: copies,
          rate: rate,
          amount: amt,
          vr_date: vr_date,
          narration: item.narr || item.remarks || '',
          financial_year: '2026-2027'
        };
      });

      const { error: genErr } = await supabase.from('retailsale').insert(genRows);
      if (!genErr) sbSuccess = true;

      // Also try retailsale20252026 if applicable
      const { error: sbErr } = await supabase.from('retailsale20252026').insert(supabaseRows);
      if (!sbErr) sbSuccess = true;
    } catch (err) {
      console.error('Supabase retailsale insert error:', err);
    }

    // 2. Save into local JSON file
    const updatedLocal = [...newRowsToSave, ...localSales];
    saveJson('retailsale.json', updatedLocal);

    return NextResponse.json({
      success: true,
      message: `Successfully recorded ${newRowsToSave.length} retail sale item(s) for customer #${customer_id}.`,
      sales: newRowsToSave,
      supabase_synced: sbSuccess
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const retailId = searchParams.get('retail_id');

    if (!retailId) {
      return NextResponse.json({ error: 'retail_id parameter is required.' }, { status: 400 });
    }

    const idNum = Number(retailId);

    // Delete from Supabase
    try {
      await supabase
        .from('retailsale20252026')
        .delete()
        .eq('Retail_id', idNum);
    } catch (err) {
      console.error('Failed to delete from Supabase:', err);
    }

    // Delete from local JSON
    const localSales = loadJson('retailsale.json');
    const filtered = localSales.filter((s: any) => Number(s.Retail_id || s.retail_id) !== idNum);
    saveJson('retailsale.json', filtered);

    return NextResponse.json({
      success: true,
      message: `Retail sale record #${idNum} deleted successfully.`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
