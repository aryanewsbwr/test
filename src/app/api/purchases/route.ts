import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Transaction > Purchase: the bills received from publishers, kept exactly as the old software
// kept them, so its bills and these show together in the Purchase reports.
//   purchase       (Purchase_id, Publish_id, R_Date, Bill_No, Bill_Date, Total, Addless, NetAmt)
//   purchasedetail (Purchase_id, Bill_No, Publica_id, Qty, Rate, Amt, Day)
// Purchase_id has no automatic numbering, so a new bill takes the next number here.
// Day (Sunday ... Saturday) is the website's own column; bills from the old software have none.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const round = (n: number) => Math.round(n * 100) / 100;
const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

async function all(table: string, columns = '*'): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from(table).select(columns).order('Purchase_id', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

// The old software saved dates as 2026-10-05 or 05/10/2026; the screen works with 2026-10-05
function isoDate(value: unknown): string {
  const t = String(value ?? '').trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t;
}

// GET                -> { bills: [...] } every bill, newest first, with its line count and copies
// GET ?id=12         -> { bill, lines }
// GET ?last_rates=1  -> { rates: { "publica_id|Day": rate, "publica_id|": rate } } the last rate used
export async function GET(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_billing');
  if (refused) return refused;
  try {
    const params = req.nextUrl.searchParams;

    if (params.get('last_rates') === '1') {
      const lines = await all('purchasedetail');
      const rates: Record<string, number> = {};
      // In bill order, so a later bill's rate replaces an earlier one
      for (const l of lines) {
        const rate = Number(l.Rate);
        if (!(rate > 0)) continue;
        rates[`${l.Publica_id}|`] = rate;
        if (l.Day) rates[`${l.Publica_id}|${l.Day}`] = rate;
      }
      return NextResponse.json({ rates });
    }

    const id = Number(params.get('id'));
    if (id) {
      const [{ data: bill, error }, { data: lines, error: lineError }] = await Promise.all([
        supabaseAdmin.from('purchase').select('*').eq('Purchase_id', id).maybeSingle(),
        supabaseAdmin.from('purchasedetail').select('*').eq('Purchase_id', id)
      ]);
      if (error || lineError) throw new Error((error || lineError)!.message);
      if (!bill) return NextResponse.json({ error: `Bill #${id} was not found` }, { status: 404 });
      return NextResponse.json({
        bill: { ...bill, R_Date: isoDate(bill.R_Date), Bill_Date: isoDate(bill.Bill_Date) },
        lines: lines || []
      });
    }

    const [bills, lines] = await Promise.all([all('purchase'), all('purchasedetail', 'Purchase_id, Qty')]);
    const copies = new Map<number, { n: number; qty: number }>();
    for (const l of lines) {
      const c = copies.get(Number(l.Purchase_id)) || { n: 0, qty: 0 };
      c.n++; c.qty += Number(l.Qty) || 0;
      copies.set(Number(l.Purchase_id), c);
    }
    return NextResponse.json({
      bills: bills
        .map(b => ({ ...b, R_Date: isoDate(b.R_Date), Bill_Date: isoDate(b.Bill_Date), lines: copies.get(Number(b.Purchase_id))?.n || 0, copies: copies.get(Number(b.Purchase_id))?.qty || 0 }))
        .sort((a, b) => String(b.R_Date).localeCompare(String(a.R_Date)) || Number(b.Purchase_id) - Number(a.Purchase_id))
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not read purchases' }, { status: 500 });
  }
}

// POST { purchase_id?, publish_id, bill_no, bill_date, r_date, addless, lines: [{ publica_id, day, qty, rate }] }
// A new bill when purchase_id is not given, otherwise that bill is updated (its lines replaced).
export async function POST(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_billing');
  if (refused) return refused;
  try {
    const body = await req.json().catch(() => ({}));
    const publishId = Number(body.publish_id);
    const billNo = String(body.bill_no ?? '').trim();
    const addless = round(Number(body.addless) || 0);
    if (!publishId) return NextResponse.json({ error: 'Publisher चुनें' }, { status: 400 });
    if (!billNo) return NextResponse.json({ error: 'Pub. Bill No. भरें' }, { status: 400 });
    if (!isDate(body.bill_date) || !isDate(body.r_date)) return NextResponse.json({ error: 'दोनों तारीख सही भरें' }, { status: 400 });

    const lines = (Array.isArray(body.lines) ? body.lines : []).map((l: any) => ({
      publica_id: Number(l.publica_id),
      day: DAYS.includes(l.day) ? l.day : null,
      qty: Math.round(Number(l.qty) || 0),
      rate: round(Number(l.rate) || 0)
    }));
    if (lines.length === 0) return NextResponse.json({ error: 'कम से कम एक पेपर जोड़ें' }, { status: 400 });
    const wrong = lines.findIndex((l: any) => !l.publica_id || l.qty <= 0 || l.rate <= 0);
    if (wrong >= 0) return NextResponse.json({ error: `लाइन ${wrong + 1}: पेपर, Qty और Rate भरें` }, { status: 400 });

    const total = round(lines.reduce((s: number, l: any) => s + l.qty * l.rate, 0));
    const editing = Number(body.purchase_id) || 0;

    // The same bill from the same publisher is not entered twice
    const { data: same, error: sameError } = await supabaseAdmin.from('purchase').select('Purchase_id')
      .eq('Publish_id', publishId).eq('Bill_No', billNo);
    if (sameError) throw new Error(sameError.message);
    if ((same || []).some(s => Number(s.Purchase_id) !== editing)) {
      return NextResponse.json({ error: `इस Publisher का Bill No. ${billNo} पहले से सेव है। उसे Find से खोलकर बदलें।` }, { status: 409 });
    }

    let id = editing;
    if (!id) {
      const { data: last, error } = await supabaseAdmin.from('purchase').select('Purchase_id').order('Purchase_id', { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      id = (Number(last?.[0]?.Purchase_id) || 0) + 1;
    }
    const header = {
      Purchase_id: id, Publish_id: publishId, R_Date: body.r_date, Bill_No: billNo, Bill_Date: body.bill_date,
      Total: total, Addless: addless, NetAmt: round(total + addless)
    };
    const detail = (withDay: boolean) => lines.map((l: any) => ({
      Purchase_id: id, Bill_No: billNo, Publica_id: l.publica_id, Qty: l.qty, Rate: l.rate, Amt: round(l.qty * l.rate),
      ...(withDay ? { Day: l.day } : {})
    }));

    // The lines are written first and the bill last, so a bill never shows without its lines.
    // On an update the old lines are kept in hand, and put back if the new ones do not save.
    const { data: oldLines, error: oldError } = await supabaseAdmin.from('purchasedetail').select('*').eq('Purchase_id', id);
    if (oldError) throw new Error(oldError.message);
    const putBack = async () => {
      await supabaseAdmin.from('purchasedetail').delete().eq('Purchase_id', id);
      if (oldLines?.length) await supabaseAdmin.from('purchasedetail').insert(oldLines);
    };
    const { error: clearError } = await supabaseAdmin.from('purchasedetail').delete().eq('Purchase_id', id);
    if (clearError) throw new Error(clearError.message);
    let dayKept = true;
    let { error: lineError } = await supabaseAdmin.from('purchasedetail').insert(detail(true));
    if (lineError && /Day/.test(lineError.message) && /column/i.test(lineError.message)) {
      // The Day column has not been added to the database yet
      dayKept = false;
      ({ error: lineError } = await supabaseAdmin.from('purchasedetail').insert(detail(false)));
    }
    if (lineError) {
      await putBack();
      throw new Error(`Lines not saved: ${lineError.message}`);
    }

    const { error: billError } = editing
      ? await supabaseAdmin.from('purchase').update(header).eq('Purchase_id', id)
      : await supabaseAdmin.from('purchase').insert(header);
    if (billError) {
      await putBack();
      throw new Error(`Bill not saved: ${billError.message}`);
    }
    return NextResponse.json({ ok: true, purchase_id: id, total, net: header.NetAmt, day_kept: dayKept });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not save the bill' }, { status: 500 });
  }
}

// DELETE ?id=12 -> removes that bill and its lines
export async function DELETE(req: NextRequest) {
  const refused = await refuseWithout(req, 'can_billing');
  if (refused) return refused;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'Bill is required' }, { status: 400 });
  const { error } = await supabaseAdmin.from('purchase').delete().eq('Purchase_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: lineError } = await supabaseAdmin.from('purchasedetail').delete().eq('Purchase_id', id);
  if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
