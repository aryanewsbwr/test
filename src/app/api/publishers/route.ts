import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/publicationsData';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const pubs = await fetchAllRows('publisher', 'publish_id');
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

    const list = await fetchAllRows('publisher', 'publish_id');
    let finalId = publish_id ? parseInt(publish_id, 10) : 0;
    const isUpdate = finalId > 0 && list.some((p: any) => p.publish_id === finalId);

    if (!isUpdate) {
      const maxId = list.reduce((max: number, p: any) => Math.max(max, p.publish_id || 0), 0);
      finalId = maxId + 1;
    }

    const record = {
      publish_id: finalId,
      name: name.trim(),
      address: address || '',
      city: city || '',
      phone: phone || '',
      mobile: mobile || '',
      category: category || 'Newspaper',
      type: type || 'Publisher'
    };

    const { error } = isUpdate
      ? await supabase.from('publisher').update(record).eq('publish_id', finalId)
      : await supabase.from('publisher').insert([record]);
    if (error) throw new Error(`Could not save publisher: ${error.message}`);

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

    // Papers keep their publisher number, so one still in use is kept
    const { count, error: countErr } = await supabase
      .from('publication')
      .select('publica_id', { count: 'exact', head: true })
      .eq('publish_id', pid);
    if (countErr) throw new Error(`Could not check publications: ${countErr.message}`);
    if ((count || 0) > 0) {
      return NextResponse.json({ error: `${count} publications belong to this publisher. Move them before deleting it.` }, { status: 400 });
    }

    const { data, error } = await supabase.from('publisher').delete().eq('publish_id', pid).select();
    if (error) throw new Error(`Could not delete publisher: ${error.message}`);
    if (!data?.length) return NextResponse.json({ error: 'Publisher not found' }, { status: 404 });

    return NextResponse.json({ success: true, message: `Publisher #${pid} deleted successfully.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
