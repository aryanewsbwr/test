import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SENT_STATUSES = ['sent', 'delivered', 'read'];
// Marks a region sent before sends were recorded: no real number or wamid exists for these rows
const MANUAL_PHONE = 'manual';
const PAGE_SIZE = 1000;
const CHUNK_SIZE = 200;

function fySuffixFor(year: string): string {
  if (year.length === 8) return year;
  const startYear = parseInt(year, 10) || 2026;
  return `${startYear}${startYear + 1}`;
}

// Same month text BillThermalPreview sends as bill_month
const billMonthKey = (month: string, year: string) => `${month} ${year}`;

async function loadMonthBills(month: string, year: string) {
  const table = `billno${fySuffixFor(year)}`;
  const monthFilter = `month.ilike.${month},month.ilike.${month.slice(0, 3)}%`;

  const { count, error: countError } = await supabase
    .from(table)
    .select('bill_id', { count: 'exact', head: true })
    .or(monthFilter);
  if (countError) throw countError;

  // Fetch every page at once: a month has thousands of bills and this runs on each screen load
  const pages = await Promise.all(
    Array.from({ length: Math.ceil((count || 0) / PAGE_SIZE) }, async (_, page) => {
      const from = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from(table)
        .select('bill_id, customer_id, region_id')
        .or(monthFilter)
        .order('bill_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return (data || []) as { bill_id: number; customer_id: number; region_id: number }[];
    })
  );
  return pages.flat();
}

async function loadSentRows(billMonth: string) {
  const rows: { customer_id: string; phone: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('customer_id, phone')
      .eq('bill_month', billMonth)
      .in('status', SENT_STATUSES)
      .order('customer_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function readPeriod(source: URLSearchParams | Record<string, any>) {
  const get = (key: string) => String((source instanceof URLSearchParams ? source.get(key) : source[key]) ?? '').trim();
  return { month: get('month'), year: get('year'), regionId: Number(get('region_id')) };
}

/** GET /api/whatsapp/regions?month=October&year=2026: bills sent per region for that month */
export async function GET(request: NextRequest) {
  try {
    const { month, year } = readPeriod(new URL(request.url).searchParams);
    if (!month || !year) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
    }

    const [bills, sentRows] = await Promise.all([loadMonthBills(month, year), loadSentRows(billMonthKey(month, year))]);
    const sentCustomers = new Map(sentRows.map(r => [r.customer_id, r.phone]));

    const regions: Record<string, { total: number; sent: number; manual: number }> = {};
    for (const b of bills) {
      const entry = (regions[b.region_id] = regions[b.region_id] || { total: 0, sent: 0, manual: 0 });
      entry.total++;
      const phone = sentCustomers.get(String(b.customer_id));
      if (phone !== undefined) {
        entry.sent++;
        if (phone === MANUAL_PHONE) entry.manual++;
      }
    }

    return NextResponse.json({ regions });
  } catch (err: any) {
    console.error('WhatsApp region status error:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

/** POST { region_id, month, year }: records a region's bills as already sent, without sending anything */
export async function POST(request: NextRequest) {
  try {
    const { month, year, regionId } = readPeriod(await request.json());
    if (!month || !year || !regionId) {
      return NextResponse.json({ error: 'region_id, month and year are required' }, { status: 400 });
    }

    const regionBills = (await loadMonthBills(month, year)).filter(b => b.region_id === regionId);
    const billMonth = billMonthKey(month, year);
    let marked = 0;

    for (let i = 0; i < regionBills.length; i += CHUNK_SIZE) {
      const chunk = regionBills.slice(i, i + CHUNK_SIZE);
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('whatsapp_messages')
        .select('bill_id')
        .in('bill_id', chunk.map(b => String(b.bill_id)))
        .in('status', SENT_STATUSES);
      if (existingError) throw existingError;

      const alreadySent = new Set((existing || []).map(r => r.bill_id));
      const rows = chunk
        .filter(b => !alreadySent.has(String(b.bill_id)))
        .map(b => ({
          customer_id: String(b.customer_id),
          bill_id: String(b.bill_id),
          phone: MANUAL_PHONE,
          status: 'sent',
          bill_month: billMonth
        }));

      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from('whatsapp_messages').insert(rows);
        if (error) throw error;
        marked += rows.length;
      }
    }

    return NextResponse.json({ success: true, marked });
  } catch (err: any) {
    console.error('WhatsApp mark region error:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

/** DELETE ?region_id=&month=&year=: undoes a manual mark. Real sends are never removed. */
export async function DELETE(request: NextRequest) {
  try {
    const { month, year, regionId } = readPeriod(new URL(request.url).searchParams);
    if (!month || !year || !regionId) {
      return NextResponse.json({ error: 'region_id, month and year are required' }, { status: 400 });
    }

    const regionBills = (await loadMonthBills(month, year)).filter(b => b.region_id === regionId);
    for (let i = 0; i < regionBills.length; i += CHUNK_SIZE) {
      const { error } = await supabaseAdmin
        .from('whatsapp_messages')
        .delete()
        .eq('phone', MANUAL_PHONE)
        .eq('bill_month', billMonthKey(month, year))
        .in('bill_id', regionBills.slice(i, i + CHUNK_SIZE).map(b => String(b.bill_id)));
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('WhatsApp unmark region error:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
