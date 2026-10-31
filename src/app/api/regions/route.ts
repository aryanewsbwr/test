import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { fetchRegions } from '@/lib/publicationsData';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const regions = await fetchRegions();
    const decoded = regions.map((r: any) => {
      const rName = String(r.region_name || r.name || '');
      return {
        ...r,
        region_name: rName,
        name: rName,
        hindi_name: cleanOrTransliterateHindi(r.hindi_name, rName)
      };
    });
    return NextResponse.json({ total: decoded.length, regions: decoded });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { region_id, region_name, name, hindi_name, zone = 'Beawar' } = body;

    const rName = region_name || name;
    if (!rName || !rName.trim()) {
      return NextResponse.json({ error: 'Region Name is required' }, { status: 400 });
    }

    const regList = await fetchRegions();
    let finalRegId = region_id ? parseInt(region_id, 10) : 0;
    const isUpdate = finalRegId > 0 && regList.some((r: any) => (r.region_id || r.id) === finalRegId);

    if (!isUpdate) {
      const maxId = regList.reduce((max: number, r: any) => Math.max(max, r.region_id || r.id || 0), 0);
      finalRegId = maxId + 1;
    }

    const hindi = cleanOrTransliterateHindi(hindi_name, rName);
    const record = {
      region_id: finalRegId,
      region_name: rName.trim(),
      name: rName.trim(),
      hindi_name: hindi,
      zone: zone || 'Beawar'
    };

    // 1. Save to Supabase regiond table
    const regionRow = { region_id: finalRegId, region_name: record.region_name, hindi_name: hindi, zone: record.zone };
    const { error: regionErr } = isUpdate
      ? await supabase.from('regiond').update(regionRow).eq('region_id', finalRegId)
      : await supabase.from('regiond').insert([regionRow]);
    if (regionErr) throw new Error(`Could not save region: ${regionErr.message}`);

    return NextResponse.json({
      success: true,
      message: `Region #${finalRegId} (${rName}) ${isUpdate ? 'updated' : 'created'} successfully!`,
      region: record
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idStr = searchParams.get('region_id') || searchParams.get('id');
    if (!idStr) return NextResponse.json({ error: 'region_id is required' }, { status: 400 });

    const rid = parseInt(idStr, 10);

    // A region still holding customers would leave them with no region on their bills
    const { count: custCount, error: custErr } = await supabase
      .from('customer')
      .select('customer_id', { count: 'exact', head: true })
      .eq('region_id', rid);
    if (custErr) throw new Error(`Could not check customers: ${custErr.message}`);
    if ((custCount || 0) > 0) {
      return NextResponse.json({ error: `${custCount} customers are in this region. Move them before deleting it.` }, { status: 400 });
    }

    const { error: delErr } = await supabase.from('regiond').delete().eq('region_id', rid);
    if (delErr) throw new Error(`Could not delete region: ${delErr.message}`);

    return NextResponse.json({ success: true, message: `Region #${rid} deleted successfully.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
