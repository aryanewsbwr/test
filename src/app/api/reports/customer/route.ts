import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { storedHindiName, cleanOrTransliterateHindi } from '@/lib/transliteration';
import { fetchPublications, fetchRegions } from '@/lib/publicationsData';
import { monthCode } from '@/lib/backupTables';
import { fyStartYear } from '@/lib/financialYear';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reports > Customer, as in the old software, for one customer or every customer of a region:
//   kind=detail     Customer Detail: every paper the customer has taken, open and closed, and their stops
//   kind=monthwise  Customer MonthWise Detail: bill, payments (date and receipt no.) and balance month by month
// Only the chosen customers' rows are read.

const FY_MONTHS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];
const MONTH_NAMES: Record<string, string> = {
  apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September',
  oct: 'October', nov: 'November', dec: 'December', jan: 'January', feb: 'February', mar: 'March'
};
const CHUNK = 200;

// Every row of a table for these customers, a page at a time
async function rowsFor(table: string, ids: number[], columns = '*'): Promise<any[]> {
  const all: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin.from(table).select(columns).in('customer_id', part).range(from, from + 999);
      if (error) throw new Error(`Could not read ${table}: ${error.message}`);
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return all;
}

const byCustomer = (rows: any[]) => {
  const map = new Map<number, any[]>();
  for (const r of rows) {
    const id = Number(r.customer_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(r);
  }
  return map;
};

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
    const kind = params.get('kind') === 'monthwise' ? 'monthwise' : 'detail';
    const customerId = Number(params.get('customer_id'));
    const regionId = Number(params.get('region_id'));
    const startYear = Number(params.get('year')) || fyStartYear();

    const [pubs, regions] = await Promise.all([fetchPublications(), fetchRegions()]);
    // A Hindi paper by its Hindi name, an English paper by its English name, as on the bills
    const pubName = new Map<number, string>(pubs.map((p: any) => {
      const english = String(p.public_name || p.abrv || '').trim();
      const hindi = String(p.pub_hindi || p.Pub_Hindi || '').trim();
      return [Number(p.publica_id), hindi ? cleanOrTransliterateHindi(hindi, english) : english];
    }));
    const regionName = (id: unknown) => regions.find((r: any) => Number(r.region_id) === Number(id))?.region_name || '';

    // The customers: the one chosen, or every customer of the region in priority order
    let customers: any[] = [];
    if (Number.isInteger(customerId) && customerId > 0) {
      const { data, error } = await supabaseAdmin.from('customer').select('*').eq('customer_id', customerId).maybeSingle();
      if (error) throw new Error(`Could not read the customer: ${error.message}`);
      if (!data) return NextResponse.json({ error: `Customer #${customerId} was not found.` }, { status: 404 });
      customers = [data];
    } else if (Number.isInteger(regionId) && regionId > 0) {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabaseAdmin.from('customer').select('*').eq('region_id', regionId).range(from, from + 999);
        if (error) throw new Error(`Could not read customers: ${error.message}`);
        customers.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      customers.sort((a, b) => (Number(a.priority) || 99999) - (Number(b.priority) || 99999) || Number(a.customer_id) - Number(b.customer_id));
    } else {
      return NextResponse.json({ error: 'ग्राहक या क्षेत्र (Region) चुनें।' }, { status: 400 });
    }
    const ids = customers.map(c => Number(c.customer_id));
    const head = (c: any) => ({
      customer_id: Number(c.customer_id),
      name: String(c.name_eng || '').trim(),
      name_hindi: storedHindiName(c),
      address: [c.add1, c.add2].filter(Boolean).join(', '),
      phone: c.phone || '',
      priority: c.priority ?? '',
      region_name: regionName(c.region_id)
    });
    const regionMode = customers.length !== 1 || !(customerId > 0);
    const title = (base: string) => regionMode ? `${base} — ${regionName(regionId)}` : base;

    if (kind === 'detail') {
      const [subs, stops] = await Promise.all([rowsFor('customer_detail', ids), rowsFor('discontinue', ids)]);
      const hawkerIds = Array.from(new Set(subs.map(s => Number(s.hawker_id)).filter(Boolean)));
      const hawkerName = new Map<number, string>();
      for (let i = 0; i < hawkerIds.length; i += CHUNK) {
        const { data, error } = await supabaseAdmin.from('hawker').select('hawker_id, name').in('hawker_id', hawkerIds.slice(i, i + CHUNK));
        if (error) throw new Error(`Could not read hawkers: ${error.message}`);
        (data || []).forEach((h: any) => hawkerName.set(Number(h.hawker_id), String(h.name || '').trim()));
      }
      const subsOf = byCustomer(subs);
      const stopsOf = byCustomer(stops);
      const out = customers.map(c => {
        const own = (subsOf.get(Number(c.customer_id)) || []).sort((a, b) => (Number(a.sno) || 0) - (Number(b.sno) || 0));
        const ownStops = (stopsOf.get(Number(c.customer_id)) || [])
          .sort((a, b) => String(b.temp_from || b.entry_date || '').localeCompare(String(a.temp_from || a.entry_date || '')));
        return {
          customer: head(c),
          rows: own.map(s => ({
            sno: s.sno,
            item: pubName.get(Number(s.publica_id)) || `Paper #${s.publica_id}`,
            hawker: hawkerName.get(Number(s.hawker_id)) || (s.hawker_id ? `Hawker #${s.hawker_id}` : ''),
            qty: Number(s.qty) || 0,
            del_day: s.from_day || '1-7',
            start_date: s.s_date || '',
            close_date: s.c_date || ''
          })),
          // Stops: Temporary (from - to) and Permanent
          stops: ownStops.map(d => ({
            item: pubName.get(Number(d.publica_id)) || (d.publica_id ? `Paper #${d.publica_id}` : 'सभी पेपर'),
            type: String(d.temp_perma || '').toLowerCase().startsWith('p') ? 'Permanent' : 'Temporary',
            from: d.temp_from || '',
            to: d.temp_to || '',
            entry: d.entry_date || ''
          }))
        };
      })
        // A region shows its customers who take a paper now or have a stop on record
        .filter(x => !regionMode || x.rows.some(r => !r.close_date) || x.stops.length > 0);
      return NextResponse.json({ kind, report_title: title('CUSTOMER DETAIL REPORT'), customers: out });
    }

    // MonthWise: the financial year that starts in April of `year`
    const suffix = `${startYear}${startYear + 1}`;
    const [headers, lines, deliveries, receipts] = await Promise.all([
      rowsFor(`billno${suffix}`, ids, 'customer_id, month, due_amt, dis_amt'),
      rowsFor(`bill${suffix}`, ids, 'customer_id, month, publica_id, total_amt'),
      rowsFor(`billdel${suffix}`, ids, 'customer_id, month, publica_id, dely'),
      rowsFor(`receipt${suffix}`, ids, 'customer_id, month, recp_no, recp_date, mal_recp_amt, less_amt, remarks')
    ]).catch((err: any) => {
      throw new Error(/does not exist|relation|schema cache/i.test(String(err.message))
        ? `There are no bills for ${startYear}-${String(startYear + 1).slice(2)} yet.`
        : err.message);
    });
    const headersOf = byCustomer(headers), linesOf = byCustomer(lines), delOf = byCustomer(deliveries), recOf = byCustomer(receipts);

    const one = (c: any) => {
      const id = Number(c.customer_id);
      const blank = () => ({ papers: new Map<string, number>(), bill: 0, delivery: 0, discount: 0, received: 0, less: 0, payments: [] as any[] });
      const months = new Map(FY_MONTHS.map(m => [m, blank()]));
      let opening = 0;
      for (const h of headersOf.get(id) || []) {
        const m = monthCode(h.month);
        if (m === 'due') { opening += Number(h.due_amt || 0); continue; }
        const row = months.get(m);
        if (row) row.discount += Number(h.dis_amt || 0);
      }
      for (const l of linesOf.get(id) || []) {
        const row = months.get(monthCode(l.month));
        if (!row) continue;
        const name = pubName.get(Number(l.publica_id)) || `Paper #${l.publica_id}`;
        row.bill += Number(l.total_amt || 0);
        row.papers.set(name, (row.papers.get(name) || 0) + Number(l.total_amt || 0));
      }
      for (const d of delOf.get(id) || []) {
        const row = months.get(monthCode(d.month));
        if (row) row.delivery += Number(d.dely || 0);
      }
      // A payment counts in the month it was received; the bill month is used only when there is no date
      for (const r of recOf.get(id) || []) {
        let extra: any = {};
        try { extra = JSON.parse(r.remarks || '{}'); } catch {}
        const paidOn = extra.mal_recp_dt || r.recp_date || '';
        const when = yearMonth(paidOn);
        const inYear = when && ((when.y === startYear && when.m >= 4) || (when.y === startYear + 1 && when.m <= 3));
        const m = inYear ? FY_MONTHS[(when!.m + 8) % 12] : monthCode(r.month);
        const row = months.get(m) || months.get('mar')!;
        row.received += Number(r.mal_recp_amt || 0);
        row.less += Number(r.less_amt || 0);
        // The receipt book's number is the one written on the paper slip; the software's number otherwise
        row.payments.push({
          date: paidOn,
          receipt_no: String(extra.manual_rep_no || extra.mal_rep_no || r.recp_no || ''),
          amount: round(Number(r.mal_recp_amt || 0)),
          less: round(Number(r.less_amt || 0))
        });
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
          payments: r.payments.sort((a, b) => String(a.date).localeCompare(String(b.date))),
          has_entries: r.bill !== 0 || r.delivery !== 0 || r.discount !== 0 || r.received !== 0 || r.less !== 0
        };
      });
      // Months after the last one with any entry are left off, so the year doesn't trail empty rows
      let last = -1;
      out.forEach((r, i) => { if (r.has_entries) last = i; });
      const shown = out.slice(0, last + 1);
      // One column per paper, the biggest first, in the same order every month
      const paperTotals = new Map<string, number>();
      shown.forEach(r => r.papers.forEach(p => paperTotals.set(p.name, (paperTotals.get(p.name) || 0) + p.amount)));
      const paperNames = Array.from(paperTotals.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
      const sum = (k: 'bill' | 'delivery' | 'discount' | 'total' | 'received' | 'less') => round(shown.reduce((s, r) => s + r[k], 0));
      return {
        customer: head(c),
        opening: round(opening),
        paper_names: paperNames,
        paper_totals: paperNames.map(name => round(paperTotals.get(name) || 0)),
        rows: shown,
        totals: { bill: sum('bill'), delivery: sum('delivery'), discount: sum('discount'), total: sum('total'), received: sum('received'), less: sum('less'), balance }
      };
    };

    const out = customers.map(one)
      // A region shows its customers who have any bill or payment this year
      .filter(x => !regionMode || x.rows.length > 0 || x.opening !== 0);
    return NextResponse.json({
      kind,
      report_title: title(`CUSTOMER MONTHWISE DETAIL (${startYear}-${String(startYear + 1).slice(2)})`),
      customers: out
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not make the report' }, { status: 500 });
  }
}
