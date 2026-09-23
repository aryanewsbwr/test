import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import path from 'path';
import fs from 'fs';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';

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
    const regions = loadJson('regions.json');
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

    const regList = loadJson('regions.json');
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
    try {
      if (isUpdate) {
        await supabase.from('regiond').update({ Region_id: finalRegId, Region_name: rName.trim() }).eq('Region_id', finalRegId);
      } else {
        await supabase.from('regiond').insert([{ Region_id: finalRegId, Region_name: rName.trim() }]);
      }
    } catch (dbErr) {
      console.warn('Supabase region save warning:', dbErr);
    }

    // 2. Update local regions.json
    try {
      let updated = regList;
      if (isUpdate) {
        updated = updated.map((r: any) => (r.region_id || r.id) === finalRegId ? { ...r, ...record } : r);
      } else {
        updated.push(record);
      }
      saveJson('regions.json', updated);
    } catch (fErr) {}

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

    try {
      await supabase.from('regiond').delete().eq('Region_id', rid);
    } catch (dbErr) {
      console.warn('Supabase delete warning:', dbErr);
    }

    try {
      const list = loadJson('regions.json');
      saveJson('regions.json', list.filter((r: any) => (r.region_id || r.id) !== rid));
    } catch (fErr) {}

    return NextResponse.json({ success: true, message: `Region #${rid} deleted successfully.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
