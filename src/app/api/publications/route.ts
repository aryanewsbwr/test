import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import path from 'path';
import fs from 'fs';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { getEffectiveWeekdayRates } from '@/lib/rateEngine';

export const dynamic = 'force-dynamic';

function loadJson(filename: string) {
  const f = path.join(process.cwd(), 'public', 'data', filename);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
  return [];
}

function saveJson(filename: string, data: any) {
  const f = path.join(process.cwd(), 'public', 'data', filename);
  fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const statusFilter = (searchParams.get('status') || 'all').trim().toLowerCase();
    const withRates = searchParams.get('with_rates') !== 'false';

    const pubs = loadJson('publications.json');
    const rates = loadJson('rates.json');
    const ratechanges = loadJson('ratechanges.json');
    const pubdis = loadJson('publicationdis.json');

    const todayIso = new Date().toISOString().split('T')[0];

    const enriched = pubs.map((p: any) => {
      const decodedHindi = cleanOrTransliterateHindi(p.pub_hindi, p.public_name);
      const effectiveRates = withRates ? getEffectiveWeekdayRates(p.publica_id, todayIso, rates, ratechanges) : null;
      
      const disc = pubdis.find((d: any) => (d.publica_id || d.Publica_id) === p.publica_id);
      const toDate = disc ? (disc.to_date || disc.ToDate) : null;
      const fromDate = disc ? (disc.from_date || disc.FromDate) : null;
      const isPermanent = !!(disc && (disc.is_permanent || toDate >= '2090-01-01' || toDate === '2099-12-31' || toDate === 'Permanent'));
      const isClosed = !!(disc && (toDate >= todayIso || toDate >= '2025-01-01' || isPermanent));

      return {
        ...p,
        pub_hindi: decodedHindi,
        current_rates: effectiveRates,
        today_rate: effectiveRates ? effectiveRates[new Date().getDay() + 1] : 5.0,
        is_closed: isClosed,
        is_permanent: isPermanent,
        closed_from: isClosed ? fromDate : null,
        closed_to: isClosed ? toDate : null
      };
    });

    let filtered = enriched;
    if (statusFilter === 'active') {
      filtered = filtered.filter((p: any) => !p.is_closed);
    } else if (statusFilter === 'closed') {
      filtered = filtered.filter((p: any) => p.is_closed);
    } else if (statusFilter === 'permanent') {
      filtered = filtered.filter((p: any) => p.is_permanent);
    }

    if (search) {
      filtered = filtered.filter((p: any) =>
        p.public_name?.toLowerCase().includes(search) ||
        p.pub_hindi?.includes(search) ||
        p.publica_id?.toString() === search ||
        p.abrv?.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({
      total: filtered.length,
      active_count: enriched.filter((p: any) => !p.is_closed).length,
      closed_count: enriched.filter((p: any) => p.is_closed).length,
      permanent_count: enriched.filter((p: any) => p.is_permanent).length,
      publications: filtered
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      is_new = false,
      publica_id,
      public_name,
      pub_hindi,
      type_p = 'Daily',
      publish_id = 1,
      abrv = '',
      circulation = 'Morning',
      duration = 'Daily',
      magzine_day = null,
      magzine_month = null,
      chr_del = 0,
      rates: customRates,
      is_closed = false,
      is_permanent = false,
      closed_from,
      closed_to
    } = body;

    if (!public_name || !public_name.trim()) {
      return NextResponse.json({ error: 'Publication Name is required' }, { status: 400 });
    }

    const hindiName = cleanOrTransliterateHindi(pub_hindi, public_name);
    const pubList = loadJson('publications.json');

    let finalPubId = publica_id ? parseInt(publica_id, 10) : 0;
    const isUpdate = !is_new && finalPubId > 0 && pubList.some((p: any) => p.publica_id === finalPubId);

    if (!isUpdate) {
      // Assign new unique ID
      const maxId = pubList.reduce((max: number, p: any) => Math.max(max, p.publica_id || 0), 0);
      finalPubId = maxId + 1;
    }

    const pubRecord = {
      publica_id: finalPubId,
      public_name: public_name.trim(),
      pub_hindi: hindiName,
      type_p,
      publish_id: parseInt(publish_id, 10) || 1,
      abrv: abrv || public_name.slice(0, 4).toUpperCase(),
      circulation,
      duration,
      magzine_day: magzine_day ? parseInt(magzine_day, 10) : null,
      magzine_month: magzine_month ? parseInt(magzine_month, 10) : null,
      chr_del: chr_del ? 1 : 0
    };

    // 1. Save to Supabase publication table
    try {
      if (isUpdate) {
        await supabase.from('publication').update(pubRecord).eq('publica_id', finalPubId);
      } else {
        await supabase.from('publication').insert([pubRecord]);
      }
    } catch (dbErr) {
      console.warn('Supabase publication save warning:', dbErr);
    }

    const todayIso = new Date().toISOString().split('T')[0];

    // 2. Save 7-day rates
    if (customRates && typeof customRates === 'object') {
      const rateRows = Object.entries(customRates).map(([day, rate]) => ({
        Publica_id: finalPubId,
        Dayofweek: parseInt(day, 10),
        Rate: Number(rate)
      }));

      try {
        await supabase.from('rate').upsert(rateRows, { onConflict: 'Publica_id,Dayofweek' });
      } catch (rErr) {
        console.warn('Supabase rate upsert warning:', rErr);
      }

      // Update local rates.json
      try {
        const ratesFile = path.join(process.cwd(), 'public', 'data', 'rates.json');
        if (fs.existsSync(ratesFile)) {
          let curRates = JSON.parse(fs.readFileSync(ratesFile, 'utf-8'));
          curRates = curRates.filter((r: any) => r.publica_id !== finalPubId);
          rateRows.forEach(r => {
            curRates.push({ publica_id: r.Publica_id, dayofweek: r.Dayofweek, rate: r.Rate });
          });
          saveJson('rates.json', curRates);
        }
      } catch (fErr) {}

      // If new publication or price update, also log in ratechange table for current date
      try {
        const rateChangeRows = Object.entries(customRates).map(([day, rate]) => ({
          publica_id: finalPubId,
          dated: todayIso,
          dayofweek: parseInt(day, 10),
          new_rate: Number(rate)
        }));
        await supabase.from('ratechange').insert(rateChangeRows);

        let curRateChanges = loadJson('ratechanges.json');
        rateChangeRows.forEach(rc => curRateChanges.push(rc));
        saveJson('ratechanges.json', curRateChanges);
      } catch (rcErr) {
        console.warn('Ratechange record warning:', rcErr);
      }
    }

    // 3. Handle Closed / Discontinue status in publicationdis
    try {
      let pdis = loadJson('publicationdis.json');
      if (is_closed || is_permanent) {
        const fromD = closed_from || todayIso;
        const toD = is_permanent ? '2099-12-31' : (closed_to || '2050-03-31');

        await supabase.from('publicationdis').delete().eq('Publica_id', finalPubId);
        await supabase.from('publicationdis').insert([{
          Publica_id: finalPubId,
          FromDate: fromD,
          ToDate: toD
        }]);

        pdis = pdis.filter((d: any) => (d.publica_id || d.Publica_id) !== finalPubId);
        pdis.push({ 
          publica_id: finalPubId, 
          Publica_id: finalPubId, 
          from_date: fromD, 
          FromDate: fromD, 
          to_date: toD, 
          ToDate: toD,
          is_permanent: !!is_permanent 
        });
        saveJson('publicationdis.json', pdis);
      } else {
        await supabase.from('publicationdis').delete().eq('Publica_id', finalPubId);
        pdis = pdis.filter((d: any) => (d.publica_id || d.Publica_id) !== finalPubId);
        saveJson('publicationdis.json', pdis);
      }
    } catch (pdErr) {
      console.warn('Publicationdis update warning:', pdErr);
    }

    // 4. Update local publications.json
    try {
      let updatedPubList = pubList;
      if (isUpdate) {
        updatedPubList = updatedPubList.map((p: any) => p.publica_id === finalPubId ? { ...p, ...pubRecord } : p);
      } else {
        updatedPubList.push(pubRecord);
      }
      saveJson('publications.json', updatedPubList);
    } catch (fErr) {}

    const fullRecord = {
      ...pubRecord,
      is_closed: !!is_closed,
      closed_from: is_closed ? (closed_from || todayIso) : null,
      closed_to: is_closed ? (closed_to || '2050-03-31') : null,
      current_rates: customRates
    };

    return NextResponse.json({
      success: true,
      message: `Publication #${finalPubId} (${public_name}) ${isUpdate ? 'updated' : 'created'} successfully!`,
      publication: fullRecord
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pubIdStr = searchParams.get('publica_id') || searchParams.get('id');

    if (!pubIdStr) {
      return NextResponse.json({ error: 'publica_id is required' }, { status: 400 });
    }

    const pubId = parseInt(pubIdStr, 10);

    // 1. Delete from Supabase
    try {
      await supabase.from('publication').delete().eq('publica_id', pubId);
      await supabase.from('rate').delete().eq('publica_id', pubId);
      await supabase.from('ratechange').delete().eq('publica_id', pubId);
      await supabase.from('publicationdis').delete().eq('Publica_id', pubId);
    } catch (dbErr) {
      console.warn('Supabase delete warning:', dbErr);
    }

    // 2. Delete from local JSON files
    try {
      const pubList = loadJson('publications.json');
      const updatedPubs = pubList.filter((p: any) => p.publica_id !== pubId);
      saveJson('publications.json', updatedPubs);

      const ratesList = loadJson('rates.json');
      const updatedRates = ratesList.filter((r: any) => r.publica_id !== pubId);
      saveJson('rates.json', updatedRates);

      let pdis = loadJson('publicationdis.json');
      pdis = pdis.filter((d: any) => (d.publica_id || d.Publica_id) !== pubId);
      saveJson('publicationdis.json', pdis);
    } catch (fErr) {}

    return NextResponse.json({
      success: true,
      message: `Publication #${pubId} deleted successfully.`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
