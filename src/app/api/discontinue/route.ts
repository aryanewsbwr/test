import { NextRequest, NextResponse } from 'next/server';
import { fyLabel, fySuffix } from '@/lib/financialYear';
import { fetchAllRows, fetchPublications, fetchRegions } from '@/lib/publicationsData';
import { closeSubscriptions, reopenSubscriptions } from '@/lib/subscriptionStops';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { parseDateToIso } from '@/lib/discontinueEngine';
import { storedHindiName } from '@/lib/transliteration';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerIdStr = searchParams.get('customer_id');

    const discs: any[] = await fetchAllRows('discontinue', 'discontinue_id', false);

    // Sort newest first
    discs.sort((a: any, b: any) => (b.discontinue_id || 0) - (a.discontinue_id || 0));

    // Load customer, publication, and region lookup maps for enrichment
    const custMap = new Map<number, any>();
    const custIds = Array.from(new Set(discs.map((d: any) => Number(d.customer_id)))).filter(Boolean);
    for (let i = 0; i < custIds.length; i += 200) {
      const { data, error } = await supabase
        .from('customer')
        .select('*')
        .in('customer_id', custIds.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const c of data || []) custMap.set(Number(c.customer_id), c);
    }

    const allPubs = await fetchPublications();
    const pubMap = new Map<number, string>();
    for (const p of allPubs) {
      const pid = Number(p.publica_id || p.publication_id || p.id);
      if (pid) pubMap.set(pid, p.public_name || p.name || `Publication #${pid}`);
    }

    const allRegions = await fetchRegions();
    const regionMap = new Map<number, string>();
    for (const r of allRegions) {
      const rid = Number(r.region_id || r.id);
      if (rid) regionMap.set(rid, r.region_name || r.name || `Region #${rid}`);
    }

    const enrichedDiscs = discs.map((d: any) => {
      const cid = Number(d.customer_id || d.Customer_id);
      const cust = custMap.get(cid);
      const pid = Number(d.publica_id || d.Publica_id || 0);
      const pubName = pid === 0 ? 'All Papers (सभी अखबार/पत्रिका)' : (pubMap.get(pid) || (pid > 0 ? `Paper #${pid}` : 'All Papers'));
      const regionId = cust?.region_id ? Number(cust.region_id) : 0;
      const regionName = regionId ? (regionMap.get(regionId) || `Region #${regionId}`) : '';

      return {
        ...d,
        customer_id: cid,
        customer_name: cust?.name_eng || (cid ? `Customer #${cid}` : ''),
        customer_hindi: storedHindiName(cust),
        publica_id: pid,
        publication_name: pubName,
        region_id: regionId,
        region_name: regionName
      };
    });

    if (customerIdStr) {
      const cid = parseInt(customerIdStr, 10);
      const filtered = enrichedDiscs.filter((d: any) => (d.customer_id || d.Customer_id) === cid);
      return NextResponse.json({ total: filtered.length, discontinues: filtered });
    }

    return NextResponse.json({ total: enrichedDiscs.length, discontinues: enrichedDiscs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customer_id,
      publica_id = 0,
      temp_perma = 'Temporary',
      temp_from,
      temp_to,
      entry_date = new Date().toISOString().split('T')[0],
      financial_year = fySuffix()
    } = body;

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    const cid = parseInt(customer_id, 10);
    const pubId = parseInt(publica_id, 10) || 0;
    const fromIso = parseDateToIso(temp_from) || entry_date;
    const isPerm = temp_perma.startsWith('P') || temp_perma.toUpperCase() === 'PERMANENT';
    const toIso = isPerm ? fromIso : (parseDateToIso(temp_to) || fromIso);

    const { count, error: countError } = await supabase
      .from('discontinue')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', cid);
    if (countError) throw new Error(countError.message);

    const record: any = {
      sno: (count || 0) + 1,
      entry_date,
      customer_id: cid,
      publica_id: pubId,
      temp_perma: isPerm ? 'Permanent' : 'Temporary',
      temp_from: fromIso,
      temp_to: toIso,
      financial_year: fyLabel()
    };

    // Numbers come from the database, and two people saving at once simply try the next one
    for (let attempt = 0; ; attempt++) {
      const { data: last, error: lastError } = await supabase
        .from('discontinue')
        .select('discontinue_id')
        .order('discontinue_id', { ascending: false })
        .limit(1);
      if (lastError) throw new Error(lastError.message);

      record.discontinue_id = Number(last?.[0]?.discontinue_id || 0) + 1;
      const { error } = await supabase.from('discontinue').insert([record]);
      if (!error) break;
      if (error.code !== '23505' || attempt >= 4) throw new Error(`Could not save the stop: ${error.message}`);
    }

    // A permanent stop also closes the subscriptions it covers
    if (isPerm) await closeSubscriptions(cid, pubId, fromIso);

    return NextResponse.json({
      success: true,
      message: `${temp_perma} discontinue / vacation hold recorded successfully!`,
      discontinue: record
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idStr = searchParams.get('discontinue_id') || searchParams.get('id');
    if (!idStr) return NextResponse.json({ error: 'discontinue_id is required' }, { status: 400 });

    const did = parseInt(idStr, 10);

    const { data: stop, error: readError } = await supabase.from('discontinue').select('*').eq('discontinue_id', did).maybeSingle();
    if (readError) throw new Error(`Could not read the stop: ${readError.message}`);

    // Billing also reads customer_discontinue, so a stop must leave both tables
    for (const table of ['discontinue', 'customer_discontinue']) {
      const { error } = await supabase.from(table).delete().eq('discontinue_id', did);
      if (error) throw new Error(`Could not delete the stop: ${error.message}`);
    }

    // A permanent stop closed its subscriptions when saved; deleting it opens them again
    if (stop && String(stop.temp_perma || '').toUpperCase().startsWith('P') && stop.temp_from) {
      await reopenSubscriptions(Number(stop.customer_id), Number(stop.publica_id) || 0, String(stop.temp_from).split('T')[0]);
    }

    return NextResponse.json({ success: true, message: `Discontinue record #${did} deleted.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
