import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import path from 'path';
import fs from 'fs';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { getEffectiveWeekdayRates } from '@/lib/rateEngine';
import { parseDateToIso } from '@/lib/discontinueEngine';
import { fetchPublications } from '@/lib/publicationsData';

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

const stopEnd = (d: any): string => String(d.oc_date || d.to_date || d.ToDate || '').split('T')[0];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const statusFilter = (searchParams.get('status') || 'all').trim().toLowerCase();
    const withRates = searchParams.get('with_rates') !== 'false';
    const order = (searchParams.get('order') || 'desc').toLowerCase();

    let pubs = await fetchPublications();
    let rates = loadJson('rates.json');
    let ratechanges = loadJson('ratechanges.json').map((r: any) => ({
      publica_id: r.publica_id ?? r.Publica_id,
      dayofweek: r.dayofweek ?? r.Dayofweek,
      oldrate: r.oldrate ?? r.old_rate ?? r.OldRate ?? 0,
      new_rate: r.new_rate ?? r.newrate ?? r.NewRate ?? 0,
      dated: (r.dated || r.Dated || r.effective_date || '').split('T')[0],
      effective_date: (r.effective_date || r.dated || r.Dated || '').split('T')[0]
    }));

    // Fetch latest rate changes from Supabase
    try {
      const { data: sbRc } = await supabase
        .from('ratechange')
        .select('*')
        .order('effective_date', { ascending: false });

      if (sbRc && sbRc.length > 0) {
        const seenKeys = new Set(
          ratechanges.map((r: any) => `${r.publica_id}-${r.dayofweek}-${r.effective_date}-${r.new_rate}`)
        );

        sbRc.forEach((r: any) => {
          const pid = r.publica_id ?? r.Publica_id;
          const dow = r.dayofweek ?? r.Dayofweek;
          const effD = (r.effective_date || r.Dated || r.dated || '').split('T')[0];
          const newR = Number(r.newrate ?? r.new_rate ?? r.NewRate ?? 0);
          const oldR = Number(r.oldrate ?? r.old_rate ?? r.OldRate ?? 0);
          const key = `${pid}-${dow}-${effD}-${newR}`;

          if (!seenKeys.has(key)) {
            ratechanges.push({
              publica_id: pid,
              dayofweek: dow,
              oldrate: oldR,
              new_rate: newR,
              dated: effD,
              effective_date: effD
            });
            seenKeys.add(key);
          }
        });
      }
    } catch (_) {}

    try {
      const { data: sbRates } = await supabase.from('rate').select('*');
      if (sbRates && sbRates.length > 0) {
        rates = sbRates.map((r: any) => ({
          publica_id: r.publica_id ?? r.Publica_id,
          dayofweek: r.dayofweek ?? r.Dayofweek,
          rate: Number(r.rate ?? r.Rate)
        }));
      }
    } catch (_) {}

    let pubdis = loadJson('publicationdis.json');
    try {
      const { data: sbPubdis } = await supabase.from('publicationdis').select('*');
      if (sbPubdis && sbPubdis.length > 0) {
        pubdis = sbPubdis;
      }
    } catch (_) {}
    // Strictly purge any corrupt or NaN publications
    pubs = pubs.filter((p: any) => {
      const pid = Number(p.publica_id ?? p.publication_id);
      const name = String(p.public_name || p.name || '');
      return pid && !isNaN(pid) && pid > 0 && name.length > 0 && !name.toLowerCase().includes('nan');
    });

    const todayIso = new Date().toISOString().split('T')[0];

    const enriched = pubs.map((p: any) => {
      const decodedHindi = cleanOrTransliterateHindi(p.pub_hindi, p.public_name);
      const effectiveRates = withRates ? getEffectiveWeekdayRates(p.publica_id, '2099-12-31', rates, ratechanges, p.magzine_day) : null;
      
      // A stop counts while it runs today or later, the same dates billing goes by
      const disc = pubdis
        .filter((d: any) => (d.publica_id || d.Publica_id) === p.publica_id && stopEnd(d) >= todayIso)
        .sort((a: any, b: any) => stopEnd(b).localeCompare(stopEnd(a)))[0];
      const toDate = disc ? stopEnd(disc) : null;
      const fromDate = disc ? (disc.entry_date || disc.from_date || disc.FromDate) : null;
      const isPermanent = !!(disc && (disc.is_permanent || toDate! >= '2090-01-01'));
      const isClosed = !!disc;

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

    if (order === 'desc') {
      filtered.sort((a: any, b: any) => b.publica_id - a.publica_id);
    } else if (order === 'asc') {
      filtered.sort((a: any, b: any) => a.publica_id - b.publica_id);
    } else if (order === 'alpha' || order === 'name') {
      filtered.sort((a: any, b: any) => (a.public_name || '').localeCompare(b.public_name || '', undefined, { sensitivity: 'base' }));
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
      closed_to,
      reopen = false
    } = body;

    if (!public_name || !public_name.trim()) {
      return NextResponse.json({ error: 'Publication Name is required' }, { status: 400 });
    }

    const hindiName = cleanOrTransliterateHindi(pub_hindi, public_name);
    const pubList = await fetchPublications();

    let finalPubId = publica_id ? parseInt(publica_id, 10) : 0;
    const isUpdate = !is_new && finalPubId > 0 && pubList.some((p: any) => p.publica_id === finalPubId);

    if (!isUpdate) {
      // Assign new unique ID checking both JSON and Supabase
      finalPubId = pubList.reduce((max: number, p: any) => Math.max(max, Number(p.publica_id) || 0), 0) + 1;
    }

    const pubRecord = {
      publica_id: finalPubId,
      public_name: public_name.trim(),
      pub_hindi: hindiName,
      type_p: type_p || 'Daily',
      publish_id: parseInt(publish_id, 10) || 1,
      abrv: abrv || public_name.slice(0, 4).toUpperCase(),
      circulation: circulation || 'Morning',
      duration: duration || 'Daily',
      magzine_day: magzine_day ? parseInt(magzine_day, 10) : null,
      magzine_month: magzine_month ? parseInt(magzine_month, 10) : null,
      chr_del: chr_del ? 1 : 0
    };

    // 1. Save to Supabase publication table, the list billing reads, before anything depends on it
    const { error: sbPubErr } = isUpdate
      ? await supabase.from('publication').update(pubRecord).eq('publica_id', finalPubId)
      : await supabase.from('publication').insert([pubRecord]);
    if (sbPubErr) throw new Error(`Could not save publication: ${sbPubErr.message}`);

    const todayIso = new Date().toISOString().split('T')[0];

    // 2. Save 7-day rates in Supabase and local cache
    if (customRates && typeof customRates === 'object') {
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

      const rateRows = Object.entries(customRates).map(([day, rate]) => ({
        id: nextRateId++,
        publica_id: finalPubId,
        dayofweek: parseInt(day, 10),
        rate: Number(rate)
      }));

      try {
        await supabase.from('rate').delete().eq('publica_id', finalPubId);
        const { error: sbRateErr } = await supabase.from('rate').insert(rateRows);
        if (sbRateErr) console.error('Supabase rate insert error:', sbRateErr);
      } catch (rErr) {
        console.warn('Supabase rate update warning:', rErr);
      }

      // Update local rates.json
      try {
        const ratesFile = path.join(process.cwd(), 'public', 'data', 'rates.json');
        if (fs.existsSync(ratesFile)) {
          let curRates = JSON.parse(fs.readFileSync(ratesFile, 'utf-8'));
          curRates = curRates.filter((r: any) => (r.publica_id || r.Publica_id) !== finalPubId);
          rateRows.forEach(r => {
            curRates.push({ publica_id: r.publica_id, dayofweek: r.dayofweek, rate: r.rate });
          });
          saveJson('rates.json', curRates);
        }
      } catch (fErr) {}

      // Log in Supabase ratechange table with explicit IDs
      try {
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

        const rateChangeRows = Object.entries(customRates).map(([day, rate]) => ({
          id: nextRcId++,
          publica_id: finalPubId,
          oldrate: Number(rate),
          newrate: Number(rate),
          effective_date: todayIso,
          dayofweek: parseInt(day, 10)
        }));
        await supabase.from('ratechange').insert(rateChangeRows);

        let curRateChanges = loadJson('ratechanges.json');
        rateChangeRows.forEach(rc => curRateChanges.push({
          publica_id: rc.publica_id,
          dated: rc.effective_date,
          effective_date: rc.effective_date,
          dayofweek: rc.dayofweek,
          oldrate: rc.oldrate,
          new_rate: rc.newrate
        }));
        saveJson('ratechanges.json', curRateChanges);
      } catch (rcErr) {
        console.warn('Ratechange record warning:', rcErr);
      }
    }

    // 3. Handle Closed / Discontinue status in Supabase publicationdis. Billing reads these rows,
    // so a failure here must reach the screen. Ended stops are kept as history.
    const { data: stopRows, error: stopReadErr } = await supabase
      .from('publicationdis')
      .select('*')
      .eq('publica_id', finalPubId);
    if (stopReadErr) throw new Error(`Could not read publication stops: ${stopReadErr.message}`);
    const activeStops = (stopRows || []).filter((d: any) => stopEnd(d) >= todayIso);

    if (is_closed || is_permanent) {
      const fromD = parseDateToIso(closed_from) || todayIso;
      const toD = is_permanent ? '2099-12-31' : (parseDateToIso(closed_to) || '2050-03-31');
      const stopFields = { entry_date: fromD, oc_date: toD, dis_type: toD >= '2050-01-01' ? 'P' : 'T' };
      const { error: stopErr } = activeStops.length > 0
        ? await supabase.from('publicationdis').update(stopFields).eq('id', activeStops[0].id)
        : await supabase.from('publicationdis').insert([{ ...stopFields, publica_id: finalPubId, remark: 'Discontinued' }]);
      if (stopErr) throw new Error(`Could not save publication stop: ${stopErr.message}`);
    } else if (reopen) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      for (const stop of activeStops) {
        const { error: stopErr } = String(stop.entry_date || '') > yesterday
          ? await supabase.from('publicationdis').delete().eq('id', stop.id)
          : await supabase.from('publicationdis').update({ oc_date: yesterday }).eq('id', stop.id);
        if (stopErr) throw new Error(`Could not reopen publication: ${stopErr.message}`);
      }
    }

    try {
      const { data: allStops } = await supabase.from('publicationdis').select('*');
      if (allStops && allStops.length > 0) saveJson('publicationdis.json', allStops);
    } catch (fErr) {}

    // 4. Update local publications.json
    try {
      let updatedPubList = pubList;
      if (isUpdate) {
        updatedPubList = updatedPubList.map((p: any) => p.publica_id === finalPubId ? { ...p, ...pubRecord } : p);
      } else {
        updatedPubList.unshift(pubRecord);
      }
      saveJson('publications.json', updatedPubList);
    } catch (fErr) {}

    const fullRecord = {
      ...pubRecord,
      is_closed: !!is_closed,
      is_permanent: !!is_permanent,
      closed_from: is_closed ? (closed_from || todayIso) : null,
      closed_to: is_permanent ? '2099-12-31' : (is_closed ? (closed_to || '2050-03-31') : null),
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

    // Deleting removes the rates, so a paper still on a subscription would bill at zero
    const { count: subCount, error: subErr } = await supabase
      .from('customer_detail')
      .select('customer_id', { count: 'exact', head: true })
      .eq('publica_id', pubId);
    if (subErr) throw new Error(`Could not check subscriptions: ${subErr.message}`);
    if ((subCount || 0) > 0) {
      return NextResponse.json({ error: `${subCount} subscriptions use this publication. Close it instead of deleting.` }, { status: 400 });
    }

    // 1. Delete from Supabase matching exact table schemas
    for (const table of ['rate', 'ratechange', 'publicationdis', 'publication']) {
      const { error: delErr } = await supabase.from(table).delete().eq('publica_id', pubId);
      if (delErr) throw new Error(`Could not delete from ${table}: ${delErr.message}`);
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
