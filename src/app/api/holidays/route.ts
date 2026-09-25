import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

let cachedHolidays: any[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

async function fetchAllHolidaysFromSupabase(): Promise<any[]> {
  const now = Date.now();
  if (cachedHolidays && cachedHolidays.length > 0 && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedHolidays;
  }

  try {
    const all: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('holiday')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (all.length > 0) {
      cachedHolidays = all;
      lastFetchTime = now;
      return cachedHolidays;
    }
  } catch (err) {
    console.error('Failed to fetch holidays from Supabase:', err);
  }

  // Fallback to local JSON if Supabase fails
  const f = path.join(process.cwd(), 'public', 'data', 'holidays.json');
  if (fs.existsSync(f)) {
    try {
      cachedHolidays = JSON.parse(fs.readFileSync(f, 'utf-8'));
      lastFetchTime = now;
      return cachedHolidays || [];
    } catch {
      return [];
    }
  }

  return cachedHolidays || [];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pubId = searchParams.get('publica_id');
    const date = searchParams.get('date');
    const refresh = searchParams.get('refresh') === 'true';

    if (refresh) {
      cachedHolidays = null;
    }

    let holidays = await fetchAllHolidaysFromSupabase();

    if (pubId) {
      const pid = Number(pubId);
      holidays = holidays.filter(h => Number(h.publica_id || h.Publica_id) === pid);
    }

    if (date) {
      holidays = holidays.filter(h => (h.oc_date || h.dated || '') === date);
    }

    return NextResponse.json({
      success: true,
      count: holidays.length,
      holidays: holidays
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { holidays: newItems, publica_id, oc_date, remark } = body;

    const itemsToInsert: any[] = [];

    if (Array.isArray(newItems)) {
      itemsToInsert.push(...newItems.map(item => ({
        publica_id: Number(item.publica_id || 0),
        oc_date: item.oc_date || item.holiday_date || item.dated || '',
        dated: item.dated || item.oc_date || item.holiday_date || '',
        remark: item.remark || item.occasion || 'Press Holiday'
      })));
    } else if (oc_date) {
      itemsToInsert.push({
        publica_id: Number(publica_id || 0),
        oc_date: oc_date,
        dated: oc_date,
        remark: remark || 'Press Holiday'
      });
    }

    if (itemsToInsert.length === 0) {
      return NextResponse.json({ error: 'No holiday records provided to insert' }, { status: 400 });
    }

    // Get current max holiday_id
    const { data: maxRow } = await supabase
      .from('holiday')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    let nextId = (maxRow && maxRow.length > 0 && maxRow[0].id) ? Number(maxRow[0].id) + 1 : 1;

    const rowsWithIds = itemsToInsert.map(row => ({
      id: nextId++,
      holiday_id: nextId - 1,
      publica_id: row.publica_id,
      oc_date: row.oc_date,
      dated: row.dated,
      remark: row.remark
    }));

    const { data, error } = await supabase.from('holiday').insert(rowsWithIds).select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Invalidate in-memory cache
    cachedHolidays = null;

    return NextResponse.json({
      success: true,
      inserted: data?.length || rowsWithIds.length,
      data: data
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
