import { NextRequest, NextResponse } from 'next/server';
import { fetchPublications } from '@/lib/publicationsData';
import { supabase } from '@/lib/supabaseClient';
import path from 'path';
import fs from 'fs';
import { getEffectiveWeekdayRates } from '@/lib/rateEngine';

export const dynamic = 'force-dynamic';

function loadJson(filename: string) {
  const f = path.join(process.cwd(), 'public', 'data', filename);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
  return [];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pubIdStr = searchParams.get('publica_id') || searchParams.get('pub_id');
    const dateStr = searchParams.get('date') || '2099-12-31';
    const isHistory = searchParams.get('history') === 'true';

    let rates = loadJson('rates.json');
    let ratechanges = loadJson('ratechanges.json').map((r: any) => ({
      publica_id: r.publica_id ?? r.Publica_id,
      dayofweek: r.dayofweek ?? r.Dayofweek,
      oldrate: r.oldrate ?? r.old_rate ?? r.OldRate ?? 0,
      new_rate: r.new_rate ?? r.newrate ?? r.NewRate ?? 0,
      dated: (r.dated || r.Dated || r.effective_date || '').split('T')[0],
      effective_date: (r.effective_date || r.dated || r.Dated || '').split('T')[0]
    }));

    // Fetch latest rate changes from Supabase (Supabase is source of truth for ratechange)
    try {
      const { data: sbRc } = await supabase
        .from('ratechange')
        .select('*')
        .order('effective_date', { ascending: false });

      if (sbRc && sbRc.length > 0) {
        ratechanges = sbRc.map((r: any) => ({
          id: r.id,
          publica_id: r.publica_id ?? r.Publica_id,
          dayofweek: r.dayofweek ?? r.Dayofweek,
          oldrate: Number(r.oldrate ?? r.old_rate ?? r.OldRate ?? 0),
          new_rate: Number(r.newrate ?? r.new_rate ?? r.NewRate ?? 0),
          dated: (r.effective_date || r.Dated || r.dated || '').split('T')[0],
          effective_date: (r.effective_date || r.Dated || r.dated || '').split('T')[0]
        }));
      }
    } catch (sbErr) {
      console.warn('Supabase ratechange fetch notice:', sbErr);
    }

    // Try fetching latest rates from Supabase
    try {
      const { data: sbRates } = await supabase.from('rate').select('*');
      if (sbRates && sbRates.length > 0) {
        rates = sbRates.map((r: any) => ({
          publica_id: r.publica_id,
          dayofweek: r.dayofweek,
          rate: Number(r.rate)
        }));
      }
    } catch (_) {}

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
      // 1. Fetch max ID from Supabase to assign explicit IDs (prevent postgres sequence collision)
      let nextRcId = 3000;
      try {
        const { data: maxRc } = await supabase
          .from('ratechange')
          .select('id')
          .order('id', { ascending: false })
          .limit(1);
        if (maxRc && maxRc.length > 0 && maxRc[0].id) {
          nextRcId = Number(maxRc[0].id) + 1;
        }
      } catch (_) {}

      // Build rate changes records with lowercase PostgreSQL columns
      const rateChangeRows: any[] = [];
      const jsonRateChanges: any[] = [];

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
          jsonRateChanges.push({
            publica_id: pubId,
            dayofweek: dayNum,
            oldrate: oldVal,
            new_rate: rateVal,
            dated: effDateIso,
            effective_date: effDateIso
          });
        }
      });

      // 2. Insert or Update Supabase ratechange table
      // If updating a rate change for this effective_date, delete older duplicates for this date first so it acts as a clean update
      if (rateChangeRows.length > 0) {
        try {
          if (is_rate_change && effDateIso) {
            await supabase
              .from('ratechange')
              .delete()
              .eq('publica_id', pubId)
              .eq('effective_date', effDateIso);
          }
          const { error: rcErr } = await supabase.from('ratechange').insert(rateChangeRows);
          if (rcErr) console.warn('Supabase ratechange insert error:', rcErr);
        } catch (rcErr) {
          console.warn('Supabase ratechange insert warning:', rcErr);
        }
      }

      // 3. Update Supabase rate table with explicit IDs (always update base rates)
      let nextRateId = 1000;
      try {
        const { data: maxRate } = await supabase
          .from('rate')
          .select('id')
          .order('id', { ascending: false })
          .limit(1);
        if (maxRate && maxRate.length > 0 && maxRate[0].id) {
          nextRateId = Number(maxRate[0].id) + 1;
        }
      } catch (_) {}

      const rateRows = Object.entries(targetRates).map(([day, rate]) => ({
        id: nextRateId++,
        publica_id: pubId,
        dayofweek: parseInt(day, 10),
        rate: Number(rate)
      }));

      try {
        await supabase.from('rate').delete().eq('publica_id', pubId);
        const { error: rErr } = await supabase.from('rate').insert(rateRows);
        if (rErr) console.warn('Supabase rate insert error:', rErr);
      } catch (dbErr) {
        console.warn('Supabase rate update warning:', dbErr);
      }

      // 4. Update local JSON files for immediate offline & cache reflection
      try {
        const ratesFile = path.join(process.cwd(), 'public', 'data', 'rates.json');
        const rcsFile = path.join(process.cwd(), 'public', 'data', 'ratechanges.json');

        if (fs.existsSync(rcsFile)) {
          let currentRcs = JSON.parse(fs.readFileSync(rcsFile, 'utf-8'));
          if (is_rate_change && effDateIso) {
            currentRcs = currentRcs.filter((rc: any) => {
              const rPub = rc.publica_id || rc.Publica_id;
              const rEff = (rc.effective_date || rc.Dated || rc.dated || '').split('T')[0];
              return !(rPub === pubId && rEff === effDateIso);
            });
          }
          jsonRateChanges.forEach(rc => {
            currentRcs.push(rc);
          });
          fs.writeFileSync(rcsFile, JSON.stringify(currentRcs, null, 2), 'utf-8');
        }

        if (fs.existsSync(ratesFile)) {
          let currentRates = JSON.parse(fs.readFileSync(ratesFile, 'utf-8'));
          currentRates = currentRates.filter((r: any) => (r.publica_id || r.Publica_id) !== pubId);
          rateRows.forEach(r => {
            currentRates.push({ publica_id: r.publica_id, dayofweek: r.dayofweek, rate: r.rate });
          });
          fs.writeFileSync(ratesFile, JSON.stringify(currentRates, null, 2), 'utf-8');
        }
      } catch (fsErr) {
        console.warn('File update warning:', fsErr);
      }

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

    if (rcIdStr) {
      const rcId = parseInt(rcIdStr, 10);
      await supabase.from('ratechange').delete().eq('id', rcId);
    } else if (pubIdStr && effDate) {
      const pubId = parseInt(pubIdStr, 10);
      const effIso = effDate.split('T')[0];
      await supabase.from('ratechange').delete().eq('publica_id', pubId).eq('effective_date', effIso);

      // Also clean local JSON
      try {
        const rcsFile = path.join(process.cwd(), 'public', 'data', 'ratechanges.json');
        if (fs.existsSync(rcsFile)) {
          let currentRcs = JSON.parse(fs.readFileSync(rcsFile, 'utf-8'));
          currentRcs = currentRcs.filter((rc: any) => {
            const rPub = rc.publica_id || rc.Publica_id;
            const rEff = (rc.effective_date || rc.Dated || rc.dated || '').split('T')[0];
            return !(rPub === pubId && rEff === effIso);
          });
          fs.writeFileSync(rcsFile, JSON.stringify(currentRcs, null, 2), 'utf-8');
        }
      } catch (_) {}
    }

    return NextResponse.json({ success: true, message: 'Rate change revision deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

