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
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim().toLowerCase();

    // One hawker name can own many ids: return the id carrying the most subscriptions
    const busiestOf = searchParams.get('busiest_of');
    if (busiestOf) {
      const ids = busiestOf.split(',').map(Number).filter(id => id > 0);
      if (ids.length === 0) {
        return NextResponse.json({ error: 'busiest_of needs at least one hawker id' }, { status: 400 });
      }
      const counts = await Promise.all(ids.map(async id => {
        const { count, error } = await supabase
          .from('customer_detail')
          .select('*', { count: 'exact', head: true })
          .eq('hawker_id', id);
        if (error) throw error;
        return count || 0;
      }));
      return NextResponse.json({ hawker_id: ids[counts.indexOf(Math.max(...counts))] });
    }

    let hawkers: any[] = [];
    try {
      // Supabase returns at most 1000 rows per request, so read the table page by page
      const PAGE_SIZE = 1000;
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('hawker')
          .select('*')
          .order('hawker_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error || !data) {
          hawkers = [];
          break;
        }
        hawkers.push(...data);
        if (data.length < PAGE_SIZE) break;
      }
    } catch (_) {
      hawkers = [];
    }

    if (hawkers.length === 0) {
      hawkers = loadJson('hawkers.json');
    }

    let filtered = hawkers.filter((h: any) => h.name && h.name.trim().length > 0);

    if (search) {
      filtered = filtered.filter((h: any) =>
        h.name?.toLowerCase().includes(search) ||
        h.hindi_name?.includes(search) ||
        h.hawker_id?.toString() === search ||
        h.phone?.includes(search) ||
        h.mobile?.includes(search)
      );
    }

    const decoded = filtered.map((h: any) => ({
      ...h,
      hindi_name: cleanOrTransliterateHindi(h.hindi_name, h.name)
    }));

    return NextResponse.json({ total: decoded.length, hawkers: decoded });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hawker_id, name, hindi_name, address, city, phone, mobile, region_id = 1, commission_rate = 0 } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Hawker Name is required' }, { status: 400 });
    }

    const hawkerList = loadJson('hawkers.json');
    let finalHawkerId = hawker_id ? parseInt(hawker_id, 10) : 0;
    const isUpdate = finalHawkerId > 0 && hawkerList.some((h: any) => h.hawker_id === finalHawkerId);

    if (!isUpdate) {
      const maxId = hawkerList.reduce((max: number, h: any) => Math.max(max, h.hawker_id || 0), 0);
      finalHawkerId = maxId + 1;
    }

    const hindi = cleanOrTransliterateHindi(hindi_name, name);
    const record = {
      hawker_id: finalHawkerId,
      name: name.trim(),
      hindi_name: hindi,
      address: address || '',
      city: city || 'BEAWAR',
      phone: phone || '',
      mobile: mobile || '',
      region_id: parseInt(region_id, 10) || 1,
      commission_rate: Number(commission_rate || 0)
    };

    // 1. Save to Supabase matching exact schema
    try {
      const supabaseHawkerRecord = {
        hawker_id: finalHawkerId,
        name: name.trim(),
        phone: mobile || phone || '',
        area: address || city || 'BEAWAR',
        commission_rate: Number(commission_rate || 0)
      };
      if (isUpdate) {
        await supabase.from('hawker').update(supabaseHawkerRecord).eq('hawker_id', finalHawkerId);
      } else {
        await supabase.from('hawker').insert([supabaseHawkerRecord]);
      }
    } catch (dbErr) {
      console.warn('Supabase hawker save warning:', dbErr);
    }

    // 2. Update local hawkers.json
    try {
      let updated = hawkerList;
      if (isUpdate) {
        updated = updated.map((h: any) => h.hawker_id === finalHawkerId ? { ...h, ...record } : h);
      } else {
        updated.push(record);
      }
      saveJson('hawkers.json', updated);
    } catch (fErr) {}

    return NextResponse.json({
      success: true,
      message: `Hawker #${finalHawkerId} (${name}) ${isUpdate ? 'updated' : 'created'} successfully!`,
      hawker: record
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idStr = searchParams.get('hawker_id') || searchParams.get('id');
    if (!idStr) return NextResponse.json({ error: 'hawker_id is required' }, { status: 400 });

    const hid = parseInt(idStr, 10);

    try {
      await supabase.from('hawker').delete().eq('hawker_id', hid);
    } catch (dbErr) {
      console.warn('Supabase delete warning:', dbErr);
    }

    try {
      const list = loadJson('hawkers.json');
      saveJson('hawkers.json', list.filter((h: any) => h.hawker_id !== hid));
    } catch (fErr) {}

    return NextResponse.json({ success: true, message: `Hawker #${hid} deleted successfully.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
