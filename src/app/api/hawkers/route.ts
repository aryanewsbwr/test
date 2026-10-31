import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { fetchAllRows, nextId } from '@/lib/publicationsData';

export const dynamic = 'force-dynamic';

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

    const hawkers = await fetchAllRows('hawker', 'hawker_id');

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
    const { hawker_id, name, hindi_name, address, city, phone, mobile } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Hawker Name is required' }, { status: 400 });
    }

    let finalHawkerId = hawker_id ? parseInt(hawker_id, 10) : 0;
    if (finalHawkerId > 0) {
      const { data: found, error: findErr } = await supabase.from('hawker').select('hawker_id').eq('hawker_id', finalHawkerId);
      if (findErr) throw new Error(`Could not read hawkers: ${findErr.message}`);
      if (!found?.length) finalHawkerId = 0;
    }
    const isUpdate = finalHawkerId > 0;
    if (!isUpdate) finalHawkerId = await nextId('hawker', 'hawker_id');

    // The hawker table has these columns only, the same as the old software
    const record = {
      hawker_id: finalHawkerId,
      name: name.trim(),
      address: address || '',
      city: city || 'BEAWAR',
      phone: phone || '',
      mobile: mobile || ''
    };

    const { error } = isUpdate
      ? await supabase.from('hawker').update(record).eq('hawker_id', finalHawkerId)
      : await supabase.from('hawker').insert([record]);
    if (error) throw new Error(`Could not save hawker: ${error.message}`);

    return NextResponse.json({
      success: true,
      message: `Hawker #${finalHawkerId} (${name}) ${isUpdate ? 'updated' : 'created'} successfully!`,
      hawker: { ...record, hindi_name: cleanOrTransliterateHindi(hindi_name, name) }
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

    // Subscriptions keep their hawker number, so a hawker still delivering is kept
    const { count, error: countErr } = await supabase
      .from('customer_detail')
      .select('customer_id', { count: 'exact', head: true })
      .eq('hawker_id', hid);
    if (countErr) throw new Error(`Could not check subscriptions: ${countErr.message}`);
    if ((count || 0) > 0) {
      return NextResponse.json({ error: `${count} subscriptions use this hawker. Move them before deleting it.` }, { status: 400 });
    }

    const { data, error } = await supabase.from('hawker').delete().eq('hawker_id', hid).select();
    if (error) throw new Error(`Could not delete hawker: ${error.message}`);
    if (!data?.length) return NextResponse.json({ error: 'Hawker not found' }, { status: 404 });

    return NextResponse.json({ success: true, message: `Hawker #${hid} deleted successfully.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
