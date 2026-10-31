import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { parseDateToIso } from '@/lib/discontinueEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pubIdStr = searchParams.get('publica_id');

    const { data, error } = await supabase
      .from('publicationdis')
      .select('*')
      .order('id', { ascending: false });
    if (error) throw new Error(error.message);

    const list = (data || []).map((r: any) => ({ ...r, from_date: r.entry_date, to_date: r.oc_date }));

    if (pubIdStr) {
      const pid = parseInt(pubIdStr, 10);
      const filtered = list.filter((p: any) => (p.publica_id || p.Publica_id) === pid);
      return NextResponse.json({ total: filtered.length, discontinues: filtered });
    }

    return NextResponse.json({ total: list.length, discontinues: list });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      publica_id,
      from_date,
      to_date,
      dis_type = 'P',
      remark = 'Discontinued'
    } = body;

    if (publica_id === undefined || publica_id === null || publica_id === '') {
      return NextResponse.json({ error: 'publica_id is required' }, { status: 400 });
    }

    const pid = parseInt(String(publica_id), 10) || 0;
    const fromIso = parseDateToIso(from_date) || new Date().toISOString().split('T')[0];
    const isPerm = String(dis_type).trim().toUpperCase().startsWith('P');
    const toIso = isPerm ? (parseDateToIso(to_date) || '2050-03-31') : (parseDateToIso(to_date) || fromIso);

    const { data: last, error: lastError } = await supabase
      .from('publicationdis')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    if (lastError) throw new Error(lastError.message);

    const record = {
      id: Number(last?.[0]?.id || 0) + 1,
      publica_id: pid,
      entry_date: fromIso,
      from_date: fromIso,
      to_date: toIso,
      oc_date: toIso,
      news_mag: null,
      dis_type: isPerm ? 'P' : 'T',
      remark: remark || 'Discontinued'
    };

    const { error } = await supabase.from('publicationdis').insert([{
      id: record.id,
      publica_id: pid,
      entry_date: fromIso,
      oc_date: toIso,
      dis_type: record.dis_type,
      remark: record.remark
    }]);
    if (error) throw new Error(`Could not save the stop: ${error.message}`);

    return NextResponse.json({
      success: true,
      message: `Publication discontinue recorded successfully!`,
      record
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idStr = searchParams.get('id');
    if (!idStr) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const did = parseInt(idStr, 10);

    const { error } = await supabase.from('publicationdis').delete().eq('id', did);
    if (error) throw new Error(`Could not delete the stop: ${error.message}`);

    return NextResponse.json({ success: true, message: `Publication discontinue #${did} removed.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
