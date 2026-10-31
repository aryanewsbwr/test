import { NextRequest, NextResponse } from 'next/server';
import { fetchPublications } from '@/lib/publicationsData';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// The countersale table keeps dates as dd/mm/yyyy
function toSaleTableDate(iso: string): string {
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return d ? `${d}/${m}/${y}` : iso;
}

function toIsoDate(d: string): string {
  if (!d) return '';
  if (d.includes('/')) {
    const p = d.split('/');
    if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  }
  return d.split('T')[0];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // e.g. "2026-09-19"
    const limitParam = parseInt(searchParams.get('limit') || '500', 10);

    const publications = await fetchPublications();
    const pubMap = new Map<number, any>();
    publications.forEach((p: any) => pubMap.set(Number(p.publica_id), p));

    let query = supabase.from('countersale').select('*').order('id', { ascending: false });
    if (dateParam && dateParam !== 'all') query = query.eq('vr_date', toSaleTableDate(dateParam));
    const { data: dbSales, error } = await query.limit(limitParam);
    if (error) throw new Error(`Could not read counter sales: ${error.message}`);

    const sales = (dbSales || []).map((row: any) => {
      const pubId = Number(row.publica_id);
      const pub = pubMap.get(pubId);
      const qty = Number(row.copies || 1);
      const amt = Number(row.amt || 0);
      const isoDate = toIsoDate(row.vr_date);
      return {
        id: row.id,
        publica_id: pubId,
        pub_name: pub ? pub.public_name : `Pub #${pubId}`,
        pub_hindi: pub ? pub.pub_hindi : '',
        qty,
        rate: Number(row.rate || (qty ? amt / qty : 0)),
        amt,
        sale_date: isoDate,
        Sale_Date: isoDate,
        remarks: row.remark || '',
        customer_name: 'Counter Customer'
      };
    });

    const totalQty = sales.reduce((sum, item) => sum + item.qty, 0);
    const totalAmount = sales.reduce((sum, item) => sum + item.amt, 0);

    return NextResponse.json({
      success: true,
      date: dateParam || 'all',
      total_items: sales.length,
      total_qty: totalQty,
      total_amount: Number(totalAmount.toFixed(2)),
      sales
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sale_date = new Date().toISOString().split('T')[0],
      customer_name = 'Walk-in Counter Customer (काउंटर ग्राहक)',
      remarks = '',
      items = []
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No sale items provided.' }, { status: 400 });
    }

    const publications = await fetchPublications();
    const pubMap = new Map<number, any>();
    publications.forEach((p: any) => pubMap.set(Number(p.publica_id), p));

    const rows = items.map((item: any) => {
      const qty = Number(item.qty) || 1;
      const rate = Number(item.rate) || 0;
      return {
        publica_id: Number(item.publica_id),
        copies: qty,
        rate,
        amt: Number(item.total !== undefined ? item.total : (qty * rate)),
        vr_date: toSaleTableDate(sale_date),
        remark: remarks || null
      };
    });

    const { data: saved, error: sbErr } = await supabase.from('countersale').insert(rows).select();
    if (sbErr) throw new Error(`Could not save counter sale: ${sbErr.message}`);

    const sales = (saved || []).map((row: any) => {
      const pub = pubMap.get(Number(row.publica_id));
      return {
        id: row.id,
        publica_id: Number(row.publica_id),
        pub_name: pub ? pub.public_name : `Pub #${row.publica_id}`,
        pub_hindi: pub ? pub.pub_hindi : '',
        qty: Number(row.copies),
        rate: Number(row.rate),
        amt: Number(row.amt),
        sale_date,
        Sale_Date: sale_date,
        customer_name,
        remarks
      };
    });

    return NextResponse.json({
      success: true,
      message: `Successfully recorded ${sales.length} counter sale item(s).`,
      saved_count: sales.length,
      supabase_synced: true,
      sales
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Removes one sale by its row number, so other sales of the same paper that day stay
export async function DELETE(request: NextRequest) {
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data, error } = await supabase.from('countersale').delete().eq('id', id).select('id');
    if (error) throw new Error(`Could not delete counter sale: ${error.message}`);
    if (!data?.length) return NextResponse.json({ error: 'Counter sale not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: 'Counter sale entry deleted successfully.'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
