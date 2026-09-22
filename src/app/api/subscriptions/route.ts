import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

let cachedPubs: any[] | null = null;
let cachedHawkers: any[] | null = null;
let cachedDiscontinues: any[] | null = null;

function loadLocalData() {
  const loadJson = (filename: string) => {
    const f = path.join(process.cwd(), 'public', 'data', filename);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
    return [];
  };

  if (!cachedPubs) cachedPubs = loadJson('publications.json');
  if (!cachedHawkers) cachedHawkers = loadJson('hawkers.json');
  if (!cachedDiscontinues) cachedDiscontinues = loadJson('discontinues.json');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerIdStr = searchParams.get('customer_id') || searchParams.get('customerId');
    const activeOnly = searchParams.get('active_only') === 'true';

    if (!customerIdStr) {
      return NextResponse.json({ subscriptions: [], total: 0, active_count: 0, discontinued_count: 0 });
    }

    const cid = parseInt(customerIdStr, 10);
    loadLocalData();

    // 1. Get Subscriptions directly from Supabase customer_detail
    const { data: dbSubs, error: subsErr } = await supabase
      .from('customer_detail')
      .select('*')
      .eq('customer_id', cid);

    if (subsErr) {
      console.warn('Error querying customer_detail from Supabase:', subsErr);
    }
    const subs = dbSubs || [];

    // 2. Find customer discontinues
    const custDiscs = (cachedDiscontinues || []).filter(d => (d.customer_id || d.Customer_id) === cid);

    const todayIso = new Date().toISOString().split('T')[0];

    const enriched = subs.map(s => {
      const pId = s.publica_id || s.publication_id || s.Publica_id;
      const hId = s.hawker_id || s.Hawker_id;
      const pub = (cachedPubs || []).find(p => (p.publica_id || p.publication_id) === pId);
      const hw = (cachedHawkers || []).find(h => (h.hawker_id || h.Hawker_id) === hId);

      // Check explicit close date in subscription
      const rawCDate = s.c_date || s.C_Date;
      const hasCloseDate = rawCDate && String(rawCDate).trim().length > 0 && String(rawCDate).trim() !== 'null' && String(rawCDate).trim() !== '-';

      // Check if matching permanent or temporary discontinue exists
      const matchingDisc = custDiscs.find(d => {
        const dPub = d.publica_id || d.Publica_id;
        return dPub === pId || dPub === 0 || !dPub;
      });

      let is_active = !hasCloseDate;
      let hold_info = null;
      let effectiveCloseDate = hasCloseDate ? String(rawCDate).trim() : null;

      if (matchingDisc) {
        const isPerm = (matchingDisc.temp_perma || matchingDisc.Temp_Perma || '').toUpperCase().startsWith('P');
        const tFrom = matchingDisc.temp_from || matchingDisc.Temp_From;
        const tTo = matchingDisc.temp_to || matchingDisc.Temp_To;

        if (isPerm) {
          is_active = false;
          if (!effectiveCloseDate && tFrom) {
            effectiveCloseDate = tFrom;
          }
        } else if (tFrom && tTo) {
          const isOnHold = todayIso >= tFrom && todayIso <= tTo;
          hold_info = {
            is_on_hold: isOnHold,
            from: tFrom,
            to: tTo,
            type: 'Temporary Vacation Hold'
          };
        }
      }

      return {
        ...s,
        sno: s.sno || s.SNo,
        customer_id: cid,
        publica_id: pId,
        publication_name: pub ? (pub.public_name || pub.name) : (s.publication_name || `Publication #${pId}`),
        hawker_id: hId,
        hawker_name: hw ? (hw.name || hw.hawker_name) : (s.hawker_name || `Hawker #${hId}`),
        qty: Number(s.qty || s.Qty || 1),
        circulation: s.circulation || s.Circulation || 'Morning',
        from_day: s.from_day || s.From_Day || '1-7',
        s_date: s.s_date || s.S_Date || '',
        c_date: effectiveCloseDate,
        dis: Number(s.dis ?? s.discount_percent ?? s.Dis ?? 0),
        dely: Number(s.dely ?? s.delivery_charge ?? s.Dely ?? 0),
        is_active,
        hold_info
      };
    });

    const finalSubs = activeOnly ? enriched.filter(s => s.is_active) : enriched;

    return NextResponse.json({
      source: 'authentic_database',
      subscriptions: finalSubs,
      all_subscriptions: enriched,
      total: enriched.length,
      active_count: enriched.filter(s => s.is_active).length,
      discontinued_count: enriched.filter(s => !s.is_active).length
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Add or Update Subscription in Supabase
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, customer_id, publica_id, c_date, discontinue_type } = body;

    // Handle Discontinue Action
    if (action === 'discontinue' && customer_id && publica_id) {
      const closeDate = c_date || new Date().toISOString().split('T')[0];

      // Update in Supabase customer_detail if available
      try {
        await supabase
          .from('customer_detail')
          .update({ c_date: closeDate })
          .match({ customer_id: customer_id, publication_id: publica_id });
      } catch (err) {
        console.warn('Supabase update warning:', err);
      }

      return NextResponse.json({
        success: true,
        message: `Subscription for Publication #${publica_id} discontinued as of ${closeDate}`,
        c_date: closeDate
      });
    }

    // Default Insert
    const { data, error } = await supabase
      .from('customer_detail')
      .insert([body])
      .select();

    if (error) throw error;
    return NextResponse.json({ success: true, subscription: data?.[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerIdStr = searchParams.get('customer_id');
    const snoStr = searchParams.get('sno');
    const publicaIdStr = searchParams.get('publica_id');

    if (!customerIdStr) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    const cid = parseInt(customerIdStr, 10);
    const sno = snoStr ? parseInt(snoStr, 10) : undefined;
    const pubId = publicaIdStr ? parseInt(publicaIdStr, 10) : undefined;

    try {
      let query = supabase.from('customer_detail').delete().eq('customer_id', cid);
      if (pubId) query = query.eq('publication_id', pubId);
      await query;
    } catch (dbErr) {
      console.warn('Supabase sub delete warning:', dbErr);
    }


    return NextResponse.json({ success: true, message: 'Subscription removed' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
