import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { storedHindiName } from '@/lib/transliteration';
import { fetchPublications, fetchRegions } from '@/lib/publicationsData';
import { monthCode } from '@/lib/backupTables';
import { fyStartYear } from '@/lib/financialYear';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reports > Customer, as in the old software:
//   kind=detail     Customer Detail: every paper the customer has taken, open and closed
//   kind=monthwise  Customer MonthWise Detail: the customer's bill, payments and balance month by month
// Only this one customer's rows are read, so the report opens quickly.

const FY_MONTHS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];
const MONTH_NAMES: Record<string, string> = {
  apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September',
  oct: 'October', nov: 'November', dec: 'December', jan: 'January', feb: 'February', mar: 'March'
};

async function rows(table: string, customerId: number, columns = '*'): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from(table).select(columns).eq('customer_id', customerId).range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < 1000) return all;
  }
}

// '05/11/2026', '2026-11-05' or '2026-11-05T00:00:00' -> { y: 2026, m: 11 }
function yearMonth(value: unknown): { y: number; m: number } | null {
  const s = String(value ?? '').trim();
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return { y: Number(match[1]), m: Number(match[2]) };
  match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (match) return { y: Number(match[3]), m: Number(match[2]) };
  return null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const customerId = Number(params.get('customer_id'));
    const kind = params.get('kind') === 'monthwise' ? 'monthwise' : 'detail';
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return NextResponse.json({ error: 'Please choose a customer first.' }, { status: 400 });
    }

    const { data: cust, error: custError } = await supabaseAdmin.from('customer').select('*').eq('customer_id', customerId).maybeSingle();
    if (custError) throw new Error(`Could not read the customer: ${custError.message}`);
    if (!cust) return NextResponse.json({ error: `Customer #${customerId} was not found.` }, { status: 404 });

    const [pubs, regions] = await Promise.all([fetchPublications(), fetchRegions()]);
    const pubName = new Map<number, string>(pubs.map((p: any) => [Number(p.publica_id), String(p.public_name || p.abrv || '').trim()]));
    const region = regions.find((r: any) => Number(r.region_id) === Number(cust.region_id));
    const customer = {
      customer_id: customerId,
      name: String(cust.name_eng || '').trim(),
      name_hindi: storedHindiName(cust),
      address: [cust.add1, cust.add2].filter(Boolean).join(', '),
      phone: cust.phone || '',
      priority: cust.priority ?? '',
      region_name: region?.region_name || ''
    };

    if (kind === 'detail') {
      const subs = await rows('customer_detail', customerId);
      const hawkerIds = Array.from(new Set(subs.map(s => Number(s.hawker_id)).filter(Boolean)));
      const hawkerName = new Map<number, string>();
      if (hawkerIds.length) {
        const { data, error } = await supabaseAdmin.from('hawker').select('hawker_id, name').in('hawker_id', hawkerIds);
        if (error) throw new Error(`Could not read hawkers: ${error.message}`);
        (data || []).forEach((h: any) => hawkerName.set(Number(h.hawker_id), String(h.name || '').trim()));
      }
      // In S.No. order, as the old report listed them
      subs.sort((a, b) => (Number(a.sno) || 0) - (Number(b.sno) || 0));
      return NextResponse.json({
        kind,
        report_title: 'CUSTOMER DETAIL REPORT',
        customer,
        rows: subs.map(s => ({
          sno: s.sno,
          item: pubName.get(Number(s.publica_id)) || `Paper #${s.publica_id}`,
          hawker: hawkerName.get(Number(s.hawker_id)) || (s.hawker_id ? `Hawker #${s.hawker_id}` : ''),
          qty: Number(s.qty) || 0,
          del_day: s.from_day || '1-7',
          start_date: s.s_date || '',
          close_date: s.c_date || ''
        }))
      });
    }

    // MonthWise: the financial year that starts in April of `year`
    const startYear = Number(params.get('year')) || fyStartYear();
    const suffix = `${startYear}${startYear + 1}`;
    const [headers, lines, deliveries, receipts] = await Promise.all([
      rows(`billno${suffix}`, customerId, 'month, due_amt, dis_amt'),
      rows(`bill${suffix}`, customerId, 'month, publica_id, total_amt'),
      rows(`billdel${suffix}`, customerId, 'month, publica_id, dely'),
      rows(`receipt${suffix}`, customerId, 'month, recp_date, mal_recp_amt, less_amt, remarks')
    ]).catch((err: any) => {
      throw new Error(/does not exist|relation|schema cache/i.test(String(err.message))
        ? `There are no bills for ${startYear}-${String(startYear + 1).slice(2)} yet.`
        : err.message);
    });

    const blank = () => ({ papers: new Map<string, number>(), bill: 0, delivery: 0, discount: 0, received: 0, less: 0 });
    const months = new Map(FY_MONTHS.map(m => [m, blank()]));
    let opening = 0;
    for (const h of headers) {
      const m = monthCode(h.month);
      if (m === 'due') { opening += Number(h.due_amt || 0); continue; }
      months.get(m) && (months.get(m)!.discount += Number(h.dis_amt || 0));
    }
    for (const l of lines) {
      const row = months.get(monthCode(l.month));
      if (!row) continue;
      const name = pubName.get(Number(l.publica_id)) || `Paper #${l.publica_id}`;
      row.bill += Number(l.total_amt || 0);
      row.papers.set(name, (row.papers.get(name) || 0) + Number(l.total_amt || 0));
    }
    for (const d of deliveries) {
      const row = months.get(monthCode(d.month));
      if (row) row.delivery += Number(d.dely || 0);
    }
    // A payment counts in the month it was received; the bill month is used only when there is no date
    for (const r of receipts) {
      let extra: any = {};
      try { extra = JSON.parse(r.remarks || '{}'); } catch {}
      const when = yearMonth(extra.mal_recp_dt || r.recp_date);
      const inYear = when && ((when.y === startYear && when.m >= 4) || (when.y === startYear + 1 && when.m <= 3));
      const m = inYear ? FY_MONTHS[(when!.m + 8) % 12] : monthCode(r.month);
      const row = months.get(m) || months.get('mar')!;
      row.received += Number(r.mal_recp_amt || 0);
      row.less += Number(r.less_amt || 0);
    }

    let balance = round(opening);
    const out = FY_MONTHS.map((m, i) => {
      const r = months.get(m)!;
      const total = round(r.bill + r.delivery - r.discount);
      balance = round(balance + total - r.received - r.less);
      return {
        month: `${MONTH_NAMES[m]} ${i < 9 ? startYear : startYear + 1}`,
        papers: Array.from(r.papers.entries()).map(([name, amount]) => ({ name, amount: round(amount) })),
        bill: round(r.bill), delivery: round(r.delivery), discount: round(r.discount), total,
        received: round(r.received), less: round(r.less), balance,
        has_entries: r.bill !== 0 || r.delivery !== 0 || r.discount !== 0 || r.received !== 0 || r.less !== 0
      };
    });
    // Months after the last one with any entry are left off, so the year doesn't trail empty rows
    let last = -1;
    out.forEach((r, i) => { if (r.has_entries) last = i; });
    const shown = out.slice(0, last + 1);
    const sum = (k: 'bill' | 'delivery' | 'discount' | 'total' | 'received' | 'less') => round(shown.reduce((s, r) => s + r[k], 0));

    return NextResponse.json({
      kind,
      report_title: `CUSTOMER MONTHWISE DETAIL (${startYear}-${String(startYear + 1).slice(2)})`,
      customer,
      opening: round(opening),
      rows: shown,
      totals: { bill: sum('bill'), delivery: sum('delivery'), discount: sum('discount'), total: sum('total'), received: sum('received'), less: sum('less'), balance }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not make the report' }, { status: 500 });
  }
}
