import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import path from 'path';
import fs from 'fs';

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
    const pubs = loadJson('publishers.json');
    return NextResponse.json({ total: pubs.length, publishers: pubs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { publish_id, name, address = '', city = 'BEAWAR', phone = '', mobile = '', category = 'Main Publisher', type = 'Publisher' } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Publisher Name is required' }, { status: 400 });
    }

    const list = loadJson('publishers.json');
    let finalId = publish_id ? parseInt(publish_id, 10) : 0;
    const isUpdate = finalId > 0 && list.some((p: any) => p.publish_id === finalId);

    if (!isUpdate) {
      const maxId = list.reduce((max: number, p: any) => Math.max(max, p.publish_id || 0), 0);
      finalId = maxId + 1;
    }

    const record = {
      publish_id: finalId,
      name: name.trim(),
      address,
      city,
      phone,
      mobile,
      category,
      type
    };

    try {
      const supabaseRecord = {
        publish_id: finalId,
        name: name.trim(),
        address: address || '',
        city: city || '',
        phone: phone || '',
        mobile: mobile || '',
        category: category || 'Newspaper'
      };
      if (isUpdate) {
        await supabase.from('publisher').update(supabaseRecord).eq('publish_id', finalId);
      } else {
        await supabase.from('publisher').insert([supabaseRecord]);
      }
    } catch (dbErr) {
      console.warn('Supabase publisher warning:', dbErr);
    }

    try {
      let updated = list;
      if (isUpdate) {
        updated = updated.map((p: any) => p.publish_id === finalId ? { ...p, ...record } : p);
      } else {
        updated.push(record);
      }
      saveJson('publishers.json', updated);
    } catch (fErr) {}

    return NextResponse.json({
      success: true,
      message: `Publisher #${finalId} (${name}) saved successfully!`,
      publisher: record
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idStr = searchParams.get('publish_id') || searchParams.get('id');
    if (!idStr) return NextResponse.json({ error: 'publish_id is required' }, { status: 400 });

    const pid = parseInt(idStr, 10);

    try {
      await supabase.from('publisher').delete().eq('publish_id', pid);
    } catch (dbErr) {
      console.warn('Supabase delete warning:', dbErr);
    }

    try {
      const list = loadJson('publishers.json');
      saveJson('publishers.json', list.filter((p: any) => p.publish_id !== pid));
    } catch (fErr) {}

    return NextResponse.json({ success: true, message: `Publisher #${pid} deleted successfully.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
