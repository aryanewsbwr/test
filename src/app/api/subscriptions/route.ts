import { NextRequest, NextResponse } from 'next/server';
import { fetchPublications } from '@/lib/publicationsData';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import path from 'path';
import fs from 'fs';
import { parseDateToIso } from '@/lib/discontinueEngine';

export const dynamic = 'force-dynamic';

let cachedPubs: any[] | null = null;
let cachedHawkers: any[] | null = null;
let cachedDiscontinues: any[] | null = null;
let cachedAllSubs: any[] | null = null;

function loadLocalData() {
  const loadJson = (filename: string) => {
    const srcF = path.join(process.cwd(), 'src', 'data', filename);
    if (fs.existsSync(srcF)) {
      try {
        return JSON.parse(fs.readFileSync(srcF, 'utf-8'));
      } catch {}
    }
    const f = path.join(process.cwd(), 'public', 'data', filename);
    if (fs.existsSync(f)) {
      try {
        return JSON.parse(fs.readFileSync(f, 'utf-8'));
      } catch {}
    }
    return [];
  };

  if (!cachedHawkers) cachedHawkers = loadJson('hawkers.json');
  if (!cachedDiscontinues) cachedDiscontinues = loadJson('discontinues.json');
  if (!cachedAllSubs) cachedAllSubs = loadJson('all_subscriptions.json');
}

export async function GET(request: NextRequest) {
  try {
    cachedPubs = await fetchPublications();
    const { searchParams } = new URL(request.url);
    const customerIdStr = searchParams.get('customer_id') || searchParams.get('customerId');
    const activeOnly = searchParams.get('active_only') === 'true';

    if (!customerIdStr) {
      return NextResponse.json({ subscriptions: [], total: 0, active_count: 0, discontinued_count: 0 });
    }

    const cid = parseInt(customerIdStr, 10);
    loadLocalData();

    // 1. Get Subscriptions from Supabase customer_detail
    let subs: any[] = [];
    try {
      const { data: dbSubs, error: subsErr } = await supabase
        .from('customer_detail')
        .select('*')
        .eq('customer_id', cid);

      if (!subsErr && dbSubs && dbSubs.length > 0) {
        subs = dbSubs;
      }
    } catch (e) {
      console.warn('Error querying customer_detail from Supabase:', e);
    }

    // 2. Fallback to local backup if Supabase table has 0 rows for this customer
    if (subs.length === 0 && cachedAllSubs) {
      subs = cachedAllSubs.filter((s: any) => Number(s.customer_id || s.Customer_id) === cid);
    }

    // 2. Find customer discontinues & publication discontinues (Fetch live from Supabase merged with local)
    let custDiscs: any[] = [];
    const pubDisMap = new Map<number, any>();

    try {
      const [dRes, cdRes, pdRes] = await Promise.all([
        supabase.from('discontinue').select('*').eq('customer_id', cid),
        supabase.from('customer_discontinue').select('*').eq('customer_id', cid),
        supabase.from('publicationdis').select('*')
      ]);
      const liveDiscs = [...(dRes.data || []), ...(cdRes.data || [])];
      const localDiscs = (cachedDiscontinues || []).filter(d => (d.customer_id || d.Customer_id) === cid);
      custDiscs = [...liveDiscs];
      const seen = new Set(liveDiscs.map((d: any) => `${d.customer_id}-${d.publica_id}-${d.temp_from}-${d.temp_to}`));
      for (const ld of localDiscs) {
        const key = `${ld.customer_id || ld.Customer_id}-${ld.publica_id || ld.Publica_id}-${ld.temp_from || ld.Temp_From}-${ld.temp_to || ld.Temp_To}`;
        if (!seen.has(key)) {
          custDiscs.push(ld);
          seen.add(key);
        }
      }

      // Map permanent publication discontinues
      const allPubDis = pdRes.data || [];
      const todayIsoNow = new Date().toISOString().split('T')[0];
      allPubDis.forEach((pd: any) => {
        const pid = Number(pd.publica_id || pd.Publica_id);
        const isPerm = (pd.dis_type || pd.Dis_Type || '').toUpperCase().startsWith('P');
        const fromIso = parseDateToIso(pd.from_date || pd.FromDate || pd.fromdate || pd.entry_date);
        const toIso = parseDateToIso(pd.to_date || pd.ToDate || pd.todate || pd.oc_date);

        // If toIso exists and has already passed in the past, the suspension is EXPIRED (not currently discontinued)
        const isExpired = toIso && toIso < todayIsoNow;

        if (pid && isPerm && !isExpired) {
          pubDisMap.set(pid, pd);
        }
      });
    } catch {
      custDiscs = (cachedDiscontinues || []).filter(d => (d.customer_id || d.Customer_id) === cid);
    }

    const todayIso = new Date().toISOString().split('T')[0];

    const enriched = subs.map(s => {
      const pId = s.publica_id || s.publication_id || s.Publica_id;
      const hId = s.hawker_id || s.Hawker_id;
      const pub = (cachedPubs || []).find(p => (p.publica_id || p.publication_id) === pId);
      const hw = (cachedHawkers || []).find(h => (h.hawker_id || h.Hawker_id) === hId);
      const subSno = s.sno || s.SNo;
      const sDateIso = parseDateToIso(s.s_date || s.S_Date);

      // Check explicit close date in subscription
      const rawCDate = s.c_date || s.C_Date;
      const hasCloseDate = rawCDate && String(rawCDate).trim().length > 0 && String(rawCDate).trim() !== 'null' && String(rawCDate).trim() !== '-';

      // Check if matching permanent or temporary discontinue exists
      // Authentic rule: A discontinue record must match this publication AND must belong to this subscription
      // (Older discontinue stops from prior subscriptions MUST NOT affect a re-started subscription)
      const matchingDisc = custDiscs.find(d => {
        const dPub = d.publica_id !== undefined ? d.publica_id : d.Publica_id;
        if (dPub !== pId && dPub !== 0 && dPub !== null && dPub !== undefined) return false;

        // If discontinue specifies sno, match exact sno
        const dSno = d.sno || d.SNo;
        if (dSno && subSno && dSno === subSno) return true;

        // If discontinue specifies s_date, match exact subscription start date
        const dSDateIso = parseDateToIso(d.s_date || d.S_Date);
        if (dSDateIso && sDateIso && dSDateIso === sDateIso) return true;

        // Re-subscription scope: If discontinue happened BEFORE this subscription started (e.g. stopped 02/08, new start 06/08),
        // it cannot discontinue this newer subscription!
        const dFromIso = parseDateToIso(d.temp_from || d.Temp_From);
        if (dFromIso && sDateIso && sDateIso > dFromIso) return false;

        return true;
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
          const tFromIso = parseDateToIso(tFrom) || tFrom;
          const tToIso = parseDateToIso(tTo) || tTo;
          const isOnHold = todayIso >= tFromIso && todayIso <= tToIso;
          hold_info = {
            is_on_hold: isOnHold,
            from: tFrom,
            to: tTo,
            type: 'Temporary Vacation Hold'
          };
        }
      }

      // Check if publication is globally discontinued (publicationdis)
      const matchingPubDis = pubDisMap.get(Number(pId));
      if (matchingPubDis) {
        is_active = false;
        if (!effectiveCloseDate) {
          effectiveCloseDate = matchingPubDis.entry_date || matchingPubDis.Entry_Date || 'Discontinued';
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
    const { action, customer_id, publica_id, c_date, sno } = body;

    // Handle Discontinue Action
    if (action === 'discontinue' && customer_id && publica_id) {
      const closeDate = c_date || new Date().toISOString().split('T')[0];

      // Close only the chosen row: older stopped rows of the same paper keep their own c_date
      const match = sno ? { customer_id, sno } : { customer_id, publica_id };
      const { error: closeError } = await supabase
        .from('customer_detail')
        .update({ c_date: closeDate })
        .match(match);

      if (closeError) throw closeError;

      return NextResponse.json({
        success: true,
        message: `Subscription for Publication #${publica_id} discontinued as of ${closeDate}`,
        c_date: closeDate
      });
    }

    // Default Insert
    if (!Number(customer_id) || !Number(publica_id) || !Number(body.hawker_id) || !body.s_date) {
      return NextResponse.json({ error: 'customer_id, publica_id, hawker_id and s_date are required' }, { status: 400 });
    }

    // sno is omitted so Supabase generates it (same as the backup-restore import)
    const { data, error } = await supabase
      .from('customer_detail')
      .insert([{
        customer_id: Number(customer_id),
        publica_id: Number(publica_id),
        hawker_id: Number(body.hawker_id),
        qty: Number(body.qty) || 1,
        circulation: body.circulation || 'Morning',
        s_date: body.s_date,
        c_date: c_date || null,
        from_day: body.from_day || '1-7',
        dis: Number(body.dis) || 0,
        dely: Number(body.dely) || 0
      }])
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

    if (!sno && !pubId) {
      return NextResponse.json({ error: 'sno or publica_id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('customer_detail')
      .delete()
      .match(sno ? { customer_id: cid, sno } : { customer_id: cid, publica_id: pubId });

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Subscription removed' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
