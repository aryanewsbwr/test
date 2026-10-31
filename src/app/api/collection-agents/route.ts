import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// The collect table keeps the old software's column name Collect_id
const toAgent = (row: any) => ({
  collect_id: row.Collect_id,
  name: row.name || '',
  address: row.address || '',
  city: row.city || '',
  phone: row.phone || '',
  mobile: row.mobile || ''
});

export async function GET() {
  const { data, error } = await supabaseAdmin.from('collect').select('*').order('Collect_id', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: (data || []).map(toAgent) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Collection Agent Name cannot be empty' }, { status: 400 });

    const { data: all, error: readError } = await supabaseAdmin.from('collect').select('Collect_id, name');
    if (readError) throw new Error(readError.message);

    const id = Number(body.collect_id) || 0;
    if ((all || []).some(a => a.name?.trim().toLowerCase() === name.toLowerCase() && a.Collect_id !== id)) {
      return NextResponse.json({ error: `Collection Agent "${name}" already exists` }, { status: 400 });
    }

    const row = {
      name,
      address: String(body.address || '').trim(),
      city: String(body.city || '').trim(),
      phone: String(body.phone || '').trim(),
      mobile: String(body.mobile || '').trim()
    };

    if (id) {
      const { data, error } = await supabaseAdmin.from('collect').update(row).eq('Collect_id', id).select();
      if (error) throw new Error(error.message);
      if (!data?.length) return NextResponse.json({ error: 'Collection Agent not found' }, { status: 404 });
      return NextResponse.json({ agent: toAgent(data[0]) });
    }

    const nextId = Math.max(0, ...(all || []).map(a => Number(a.Collect_id) || 0)) + 1;
    const { data, error } = await supabaseAdmin.from('collect').insert({ Collect_id: nextId, ...row }).select();
    if (error) throw new Error(error.message);
    return NextResponse.json({ agent: toAgent(data![0]) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('collect').delete().eq('Collect_id', id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Collection Agent not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
