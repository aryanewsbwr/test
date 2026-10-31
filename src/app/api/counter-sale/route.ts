import { NextRequest, NextResponse } from 'next/server';
import { fetchPublications } from '@/lib/publicationsData';
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
    const dateParam = searchParams.get('date'); // e.g. "2026-09-19"
    const limitParam = parseInt(searchParams.get('limit') || '500', 10);

    const localSales = loadJson('countersale.json');
    const publications = await fetchPublications();
    const pubMap = new Map<number, any>();
    publications.forEach((p: any) => pubMap.set(Number(p.publica_id), p));

    // Try fetching latest from Supabase if possible, otherwise rely on localSales
    let mergedSales = [...localSales];
    try {
      const { data: dbSales, error } = await supabase
        .from('countersale')
        .select('*')
        .order('Sale_Date', { ascending: false })
        .limit(1000);

      if (!error && dbSales && dbSales.length > 0) {
        const normalizeDate = (d: string) => {
          if (!d) return '';
          if (d.includes('/')) {
            const p = d.split('/');
            if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
          }
          return d.split('T')[0];
        };

        const existingKeys = new Set(
          mergedSales.map(s => `${s.publica_id || s.Publica_id}_${normalizeDate(s.sale_date || s.Sale_Date)}_${s.qty || s.Qty}_${s.amt || s.Amt}`)
        );

        dbSales.forEach((dbRow: any) => {
          const isoDate = normalizeDate(dbRow.Sale_Date);
          const key = `${dbRow.Publica_id}_${isoDate}_${dbRow.Qty}_${dbRow.Amt}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            mergedSales.push({
              id: `sb_${dbRow.Publica_id}_${Date.now()}_${Math.floor(Math.random()*1000)}`,
              publica_id: Number(dbRow.Publica_id),
              Publica_id: Number(dbRow.Publica_id),
              qty: Number(dbRow.Qty || 1),
              Qty: Number(dbRow.Qty || 1),
              rate: Number(dbRow.Qty ? (dbRow.Amt / dbRow.Qty).toFixed(2) : dbRow.Amt),
              amt: Number(dbRow.Amt || 0),
              Amt: Number(dbRow.Amt || 0),
              sale_date: isoDate,
              Sale_Date: dbRow.Sale_Date,
              customer_name: 'Counter Customer',
              created_at: new Date().toISOString()
            });
          }
        });
      }
    } catch {
      // Supabase fetch optional fallback
    }

    // Filter by date if requested
    let filtered = mergedSales;
    if (dateParam && dateParam !== 'all') {
      filtered = mergedSales.filter(s => {
        const sDate = s.sale_date || s.Sale_Date || '';
        return sDate === dateParam || sDate.startsWith(dateParam);
      });
    }

    // Enrich with publication names
    const enriched = filtered.map(s => {
      const pubId = Number(s.publica_id || s.Publica_id);
      const pub = pubMap.get(pubId);
      return {
        ...s,
        publica_id: pubId,
        pub_name: pub ? pub.public_name : (s.pub_name || `Pub #${pubId}`),
        pub_hindi: pub ? pub.pub_hindi : '',
        qty: Number(s.qty || s.Qty || 1),
        rate: Number(s.rate || (s.amt && s.qty ? s.amt / s.qty : 0)),
        amt: Number(s.amt || s.Amt || 0)
      };
    });

    // Summary calculations
    const totalQty = enriched.reduce((sum, item) => sum + item.qty, 0);
    const totalAmount = enriched.reduce((sum, item) => sum + item.amt, 0);

    return NextResponse.json({
      success: true,
      date: dateParam || 'all',
      total_items: enriched.length,
      total_qty: totalQty,
      total_amount: Number(totalAmount.toFixed(2)),
      sales: enriched.slice(0, limitParam)
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

    const localSales = loadJson('countersale.json');
    const newSalesToSave: any[] = [];
    const supabaseRowsToInsert: any[] = [];

    const nowIso = new Date().toISOString();

    for (const item of items) {
      const pubId = Number(item.publica_id);
      const qty = Number(item.qty) || 1;
      const rate = Number(item.rate) || 0;
      const amt = Number(item.total !== undefined ? item.total : (qty * rate));
      const pub = pubMap.get(pubId);

      const saleId = Date.now() + Math.floor(Math.random() * 1000);

      const saleObj = {
        id: saleId,
        publica_id: pubId,
        Publica_id: pubId,
        pub_name: item.pub_name || (pub ? pub.public_name : `Pub #${pubId}`),
        pub_hindi: pub ? pub.pub_hindi : '',
        qty,
        Qty: qty,
        rate,
        Rate: rate,
        amt,
        Amt: amt,
        sale_date,
        Sale_Date: sale_date,
        customer_name,
        remarks,
        created_at: nowIso
      };

      newSalesToSave.push(saleObj);

      supabaseRowsToInsert.push({
        Publica_id: pubId,
        Qty: qty,
        Amt: amt,
        Sale_Date: sale_date
      });
    }

    // 1. Save to Supabase
    let supabaseSuccess = false;
    try {
      const { error: sbErr } = await supabase
        .from('countersale')
        .insert(supabaseRowsToInsert);
      if (!sbErr) supabaseSuccess = true;
      else console.error('Supabase countersale insert warning:', sbErr);
    } catch (err) {
      console.error('Supabase countersale insert exception:', err);
    }

    // 2. Save to local JSON backup
    const updatedSales = [...newSalesToSave, ...localSales];
    saveJson('countersale.json', updatedSales);

    return NextResponse.json({
      success: true,
      message: `Successfully recorded ${newSalesToSave.length} counter sale item(s).`,
      saved_count: newSalesToSave.length,
      supabase_synced: supabaseSuccess,
      sales: newSalesToSave
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const pubId = searchParams.get('publica_id');
    const saleDate = searchParams.get('sale_date');

    const localSales = loadJson('countersale.json');

    const remainingSales = localSales.filter((s: any) => {
      if (id && String(s.id) === String(id)) return false;
      if (pubId && saleDate) {
        const sPub = String(s.publica_id || s.Publica_id);
        const sDate = String(s.sale_date || s.Sale_Date);
        if (sPub === String(pubId) && sDate === String(saleDate)) return false;
      }
      return true;
    });

    saveJson('countersale.json', remainingSales);

    // Also attempt deletion from Supabase if publica_id and sale_date provided
    if (pubId && saleDate) {
      try {
        await supabase
          .from('countersale')
          .delete()
          .match({ Publica_id: Number(pubId), Sale_Date: saleDate });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: 'Counter sale entry deleted successfully.'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
