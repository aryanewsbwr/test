import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAllRows, fetchPublications, nextId } from '@/lib/publicationsData';
import { parseLegacyDateToIso, MONTH_NAMES } from '@/lib/billingEngine';

export const dynamic = 'force-dynamic';

// The publicationsup table holds one row per region, the same as the old software. The screen
// shows one entry per supplement, so rows saved together are grouped back into one, named by
// the lowest row id. Region 0 means every region.
const groupKey = (r: any) => [r.publicasup_id, r.publica_id, r.month, r.year, r.rate ?? '', r.supplement_name ?? '', r.sup_date ?? ''].join('|');

async function loadSupplements(): Promise<any[]> {
  const [rows, pubs] = await Promise.all([fetchAllRows('publicationsup', 'id'), fetchPublications()]);
  const pubName = new Map(pubs.map((p: any) => [Number(p.publica_id), p.public_name]));
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return Array.from(groups.values()).map(list => {
    const first = list[0];
    const regionIds = list.map(r => Number(r.region_id || 0)).filter(Boolean);
    const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(String(first.month || '').toLowerCase().slice(0, 3)));
    const dateIso = first.sup_date || (monthIdx >= 0 ? `${first.year}-${String(monthIdx + 1).padStart(2, '0')}-01` : '');
    return {
      id: Math.min(...list.map(r => Number(r.id))),
      row_ids: list.map(r => Number(r.id)),
      publicasup_id: Number(first.publicasup_id),
      publica_id: Number(first.publica_id),
      public_name: pubName.get(Number(first.publicasup_id)) || `Publication #${first.publicasup_id}`,
      supplement_name: first.supplement_name || pubName.get(Number(first.publica_id)) || '',
      date: dateIso,
      date_iso: dateIso,
      month: first.month,
      year: first.year,
      rate: Number(first.rate || 0),
      region_ids: regionIds,
      all_regions: list.some(r => !Number(r.region_id))
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pubId = searchParams.get('publica_id');

    let filtered = await loadSupplements();
    if (pubId) {
      filtered = filtered.filter((s: any) =>
        Number(s.publica_id) === Number(pubId) || Number(s.publicasup_id) === Number(pubId)
      );
    }

    // Sort by date descending
    filtered.sort((a: any, b: any) => (b.date_iso || '').localeCompare(a.date_iso || ''));

    return NextResponse.json({ total: filtered.length, supplements: filtered });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, supplements: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      publica_id,
      publicasup_id,
      supplement_name = '',
      public_name = '',
      date,
      rate = 0,
      region_ids = [],
      all_regions = true
    } = body;

    const parentPubId = Number(publicasup_id || publica_id);
    const suppPubId = Number(publica_id || publicasup_id);

    if (!parentPubId && !suppPubId) {
      return NextResponse.json({ error: 'Publication is required.' }, { status: 400 });
    }

    const dateIso = parseLegacyDateToIso(date) || new Date().toISOString().split('T')[0];
    const dateObj = new Date(dateIso + 'T12:00:00');
    const monthName = MONTH_NAMES[dateObj.getMonth()];
    const yearStr = String(dateObj.getFullYear());
    const regions: number[] = all_regions || !Array.isArray(region_ids) || region_ids.length === 0 ? [0] : region_ids.map(Number);

    let rowId = await nextId('publicationsup');
    const rows = regions.map(regionId => ({
      id: rowId++,
      publicasup_id: parentPubId,
      publica_id: suppPubId,
      month: monthName,
      year: yearStr,
      region_id: regionId,
      rate: Number(rate || 0),
      supplement_name: String(supplement_name).trim() || String(public_name).trim() || null,
      sup_date: dateIso
    }));

    // An edit replaces the entry's rows. The new rows go in first, so a failure keeps the old entry.
    const before = id ? (await loadSupplements()).find(s => s.id === Number(id)) : null;
    const { data: saved, error } = await supabaseAdmin.from('publicationsup').insert(rows).select();
    if (error) throw new Error(`Could not save supplement: ${error.message}`);
    if (before) {
      const { error: delErr } = await supabaseAdmin.from('publicationsup').delete().in('id', before.row_ids);
      if (delErr) throw new Error(`Supplement saved, but the old entry was not removed: ${delErr.message}`);
    }

    const newId = Math.min(...(saved || []).map((r: any) => Number(r.id)));
    const record = (await loadSupplements()).find(s => s.id === newId);

    return NextResponse.json({
      success: true,
      message: `Publication supplement saved successfully!`,
      supplement: record
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ error: 'Supplement ID is required.' }, { status: 400 });
    }

    const target = (await loadSupplements()).find(s => s.id === id);
    if (!target) return NextResponse.json({ error: 'Supplement not found.' }, { status: 404 });

    const { error } = await supabaseAdmin.from('publicationsup').delete().in('id', target.row_ids);
    if (error) throw new Error(`Could not delete supplement: ${error.message}`);

    return NextResponse.json({ success: true, message: `Supplement #${id} deleted successfully.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
