import { NextRequest, NextResponse } from 'next/server';
import { fetchAllRows, fetchPublications, nextId, replaceBaseRates } from '@/lib/publicationsData';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getEffectiveWeekdayRates } from '@/lib/rateEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pubIdStr = searchParams.get('publica_id') || searchParams.get('pub_id');
    const dateStr = searchParams.get('date') || '2099-12-31';
    const isHistory = searchParams.get('history') === 'true';

    // The rate and ratechange tables are the only source, the same ones billing reads
    const [dbRates, dbChanges] = await Promise.all([fetchAllRows('rate', 'id'), fetchAllRows('ratechange', 'id')]);
    const rates = dbRates.map((r: any) => ({ publica_id: r.publica_id, dayofweek: r.dayofweek, rate: Number(r.rate) }));
    const ratechanges = dbChanges.map((r: any) => {
      const day = (r.effective_date || '').split('T')[0];
      return { id: r.id, publica_id: r.publica_id, dayofweek: r.dayofweek, oldrate: Number(r.oldrate || 0), new_rate: Number(r.newrate || 0), dated: day, effective_date: day };
    });

    if (searchParams.get('tables') === 'true') {
      return NextResponse.json({ rates, ratechanges });
    }

    // History mode: return chronological history of rate changes for a publication
    if (isHistory && pubIdStr) {
      const pubId = parseInt(pubIdStr, 10);
      const pubChanges = ratechanges.filter((rc: any) => (rc.publica_id || rc.Publica_id) === pubId);
      pubChanges.sort((a: any, b: any) => {
        const dA = (a.effective_date || a.dated || '').split('T')[0];
        const dB = (b.effective_date || b.dated || '').split('T')[0];
        if (dB !== dA) return dB.localeCompare(dA);
        const dayA = a.dayofweek ?? a.Dayofweek ?? 0;
        const dayB = b.dayofweek ?? b.Dayofweek ?? 0;
        return dayA - dayB;
      });
      return NextResponse.json({
        publica_id: pubId,
        history: pubChanges
      });
    }

    if (pubIdStr) {
      const pubId = parseInt(pubIdStr, 10);
      const effective = getEffectiveWeekdayRates(pubId, dateStr, rates, ratechanges);
      return NextResponse.json({
        publica_id: pubId,
        date: dateStr,
        rates: effective
      });
    }

    // Return effective rates for all publications
    const pubs = await fetchPublications();
    const allRates: Record<number, Record<number, number>> = {};
    for (const p of pubs) {
      allRates[p.publica_id] = getEffectiveWeekdayRates(p.publica_id, dateStr, rates, ratechanges, p.magzine_day);
    }

    return NextResponse.json({
      date: dateStr,
      publications_count: pubs.length,
      rates: allRates
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      publica_id, 
      day_rates, 
      dated, 
      new_rates, 
      old_rates, 
      is_rate_change = false,
      effective_date 
    } = body;

    if (!publica_id) {
      return NextResponse.json({ error: 'publica_id is required' }, { status: 400 });
    }

    const pubId = parseInt(publica_id, 10);
    const effDateIso = (effective_date || dated || new Date().toISOString().split('T')[0]).split('T')[0];

    const targetRates = (is_rate_change && new_rates) ? new_rates : day_rates;

    if (targetRates && typeof targetRates === 'object') {
      // 1. Ids are given here, matching how the rows were imported
      let nextRcId = await nextId('ratechange');

      // Build rate changes records with lowercase PostgreSQL columns
      const rateChangeRows: any[] = [];

      Object.entries(targetRates).forEach(([day, rate]) => {
        const dayNum = parseInt(day, 10);
        const rateVal = Number(rate);
        if (rateVal > 0) {
          const oldVal = (old_rates && old_rates[dayNum]) ? Number(old_rates[dayNum]) : 0;
          rateChangeRows.push({
            id: nextRcId++,
            publica_id: pubId,
            dayofweek: dayNum,
            oldrate: oldVal,
            newrate: rateVal,
            effective_date: effDateIso
          });
        }
      });

      // 2. Rate changes: a change for the same date replaces the earlier one.
      // New rows go in first, so a failure never leaves the date with no rates.
      if (rateChangeRows.length > 0) {
        const { data: earlier, error: readErr } = is_rate_change && effDateIso
          ? await supabase.from('ratechange').select('id').eq('publica_id', pubId).eq('effective_date', effDateIso)
          : { data: [], error: null };
        if (readErr) throw new Error(`Could not read rate changes: ${readErr.message}`);
        const { error: rcErr } = await supabase.from('ratechange').insert(rateChangeRows);
        if (rcErr) throw new Error(`Rate change not saved: ${rcErr.message}`);
        const oldIds = (earlier || []).map((r: any) => r.id);
        if (oldIds.length) {
          const { error: delErr } = await supabase.from('ratechange').delete().in('id', oldIds);
          if (delErr) throw new Error(`New rate change saved, but the earlier one for this date was not removed: ${delErr.message}`);
        }
      }

      // 3. Update Supabase rate table with explicit IDs (always update base rates)
      // 3. Base rates
      await replaceBaseRates(pubId, targetRates);

      return NextResponse.json({
        success: true,
        message: is_rate_change 
          ? `Rate Change for Publication #${pubId} effective ${effDateIso} recorded successfully!`
          : `Rates for Publication #${pubId} updated successfully!`,
        publica_id: pubId,
        effective_date: effDateIso,
        rates: targetRates
      });
    }

    return NextResponse.json({ error: 'day_rates or new_rates object is required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE a specific rate change revision (by publica_id and effective_date or by id)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pubIdStr = searchParams.get('publica_id');
    const effDate = searchParams.get('effective_date');
    const rcIdStr = searchParams.get('id');

    if (!pubIdStr && !rcIdStr) {
      return NextResponse.json({ error: 'publica_id or id is required' }, { status: 400 });
    }

    const { error } = rcIdStr
      ? await supabase.from('ratechange').delete().eq('id', parseInt(rcIdStr, 10))
      : effDate
        ? await supabase.from('ratechange').delete().eq('publica_id', parseInt(pubIdStr!, 10)).eq('effective_date', effDate.split('T')[0])
        : { error: { message: 'effective_date is required with publica_id' } };
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, message: 'Rate change revision deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

