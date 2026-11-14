import { NextRequest, NextResponse } from 'next/server';
import { isDue } from '@/lib/dueRule';
import { fetchAllRows, fetchPublications, fetchRegions } from '@/lib/publicationsData';
import { getEffectiveWeekdayRates, getLegacyDayOfWeek } from '@/lib/rateEngine';
import { fySuffix } from '@/lib/financialYear';
import { monthCode } from '@/lib/backupTables';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { calculateBilling, roundToFoxProRule } from '@/lib/billingEngine';
import { cleanOrTransliterateHindi, getReliableHindiName, storedHindiName } from '@/lib/transliteration';

export const dynamic = 'force-dynamic';
// Reading every customer, subscription and receipt takes about ten seconds
export const maxDuration = 60;

interface CacheData {
  customers: any[];
  subscriptions: any[];
  publications: any[];
  hawkers: any[];
  regions: any[];
  receipts: any[];
  bills: any[];
  discontinues: any[];
  countersale: any[];
  publishers: any[];
  rates: any[];
  ratechanges: any[];
  holidays: any[];
  collect: any[];
  retailsales?: any[];
  publicationdis?: any[];
}

// Every row, in a fixed order so pages never overlap, failing loudly rather than returning part.
// The row count comes first so the pages are read several at a time instead of one after another.
async function fetchAllFromSupabase(table: string, order: string[], columns = '*'): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const AT_ONCE = 8;
  const { count, error: countError } = await supabase.from(table).select(order[0], { count: 'exact', head: true });
  if (countError) throw new Error(`Could not read ${table}: ${countError.message}`);
  const page = async (from: number) => {
    let query = supabase.from(table).select(columns);
    for (const column of order) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    return data || [];
  };
  const all: any[] = [];
  const starts = Array.from({ length: Math.ceil((count || 0) / PAGE_SIZE) }, (_, i) => i * PAGE_SIZE);
  for (let i = 0; i < starts.length; i += AT_ONCE) {
    for (const rows of await Promise.all(starts.slice(i, i + AT_ONCE).map(page))) all.push(...rows);
  }
  // Rows added while reading land past the counted pages
  for (let from = starts.length * PAGE_SIZE; ; from += PAGE_SIZE) {
    const rows = await page(from);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}

// Receipts keep their book details in remarks; the reports read them as separate fields
function receiptForReports(r: any) {
  let extra: any = {};
  try {
    extra = JSON.parse(r.remarks || '{}');
  } catch {}
  return {
    ...r,
    receipt_id: r.id,
    receipt_no: String(r.recp_no ?? ''),
    bill_date: r.recp_date,
    mal_recp_dt: extra.mal_recp_dt || r.recp_date,
    manual_rep_no: String(extra.manual_rep_no ?? extra.mal_rep_no ?? ''),
    cash_chq: extra.cash_chq || 'Cash',
    cheque_no: extra.cheque_no || '',
    r_amt: extra.r_amt ?? r.mal_recp_amt,
    balance: extra.balance ?? 0,
    due_amt: r.bill_amt
  };
}

// Customers, subscriptions, receipts and the rest come from the database on each report.
// The files these used to come from were never uploaded, so those reports were empty.
async function loadLiveData(data: CacheData) {
  const [customers, subscriptions, hawkers, collect, discontinues, countersale, publishers, receipts] = await Promise.all([
    fetchAllFromSupabase('customer', ['customer_id']),
    fetchAllFromSupabase('customer_detail', ['customer_id', 'sno']),
    fetchAllFromSupabase('hawker', ['hawker_id']),
    fetchAllFromSupabase('collect', ['Collect_id']),
    fetchAllFromSupabase('discontinue', ['discontinue_id']),
    fetchAllFromSupabase('countersale', ['id']),
    fetchAllFromSupabase('publisher', ['publish_id']),
    fetchAllFromSupabase(`receipt${fySuffix()}`, ['id'])
  ]);
  data.customers = customers;
  data.subscriptions = subscriptions;
  data.hawkers = hawkers;
  data.collect = collect.map((a: any) => ({ ...a, collect_id: a.Collect_id ?? a.collect_id }));
  data.discontinues = discontinues;
  data.countersale = countersale.map((c: any) => ({ ...c, sale_date: c.vr_date, qty: c.copies }));
  data.publishers = publishers;
  data.receipts = receipts.map(receiptForReports);
}

// Starts each report empty; loadLiveData and the report itself fill what they need from the database
function emptyData(): CacheData {
  return {
    customers: [], subscriptions: [], publications: [], hawkers: [], regions: [], receipts: [], bills: [],
    discontinues: [], countersale: [], publishers: [], rates: [], ratechanges: [], holidays: [], collect: []
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type') || 'hawker_daily_qty';
    const regionId = searchParams.get('region_id');
    const hawkerId = searchParams.get('hawker_id');
    const publicaId = searchParams.get('publica_id');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');
    const month = searchParams.get('month') || 'August';
    const year = searchParams.get('year') || '2026';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = (searchParams.get('search') || '').toLowerCase().trim();

    const data = emptyData();
    data.publications = await fetchPublications();
    data.regions = await fetchRegions();
    // Bill printing reads its own rows from the database, so it skips this slower load
    // and the due summary reads only the few columns it needs
    if (!reportType.startsWith('bill_print') && reportType !== 'bill_paid_report' && reportType !== 'due_region_summary') await loadLiveData(data);
    const custMap = new Map<number, any>(data.customers.map(c => [c.customer_id, c]));
    const pubMap = new Map<number, any>(data.publications.map(p => [p.publica_id, p]));
    const hwMap = new Map<number, any>(data.hawkers.map(h => [h.hawker_id, h]));
    const regMap = new Map<number, any>(data.regions.map(r => [r.region_id, r]));

    // 1. Hawker Daily Quantity of Newspaper (Matrix of Hawkers vs Top Publications)
    if (reportType === 'hawker_daily_qty' || reportType === 'hawker_magazine_qty') {
      const isMagazine = reportType === 'hawker_magazine_qty';
      
      // Select top publications of that type
      const targetPubs = data.publications.filter(p => {
        const typeP = (p.type_p || '').toLowerCase();
        return isMagazine ? typeP.includes('mag') : (typeP.includes('news') || !typeP.includes('mag'));
      }).slice(0, isMagazine ? 6 : 6);

      // Map hawkers and sum copies
      const hawkerTotals: Record<number, { hawker: any; counts: Record<number, number>; total: number }> = {};
      
      data.subscriptions.forEach(s => {
        if (s.c_date) return; // Discontinued
        const pId = s.publica_id;
        const pub = pubMap.get(pId);
        if (!pub) return;
        const typeP = (pub.type_p || '').toLowerCase();
        if (isMagazine && !typeP.includes('mag')) return;
        if (!isMagazine && typeP.includes('mag')) return;

        const hId = s.hawker_id;
        if (!hawkerTotals[hId]) {
          const hw = hwMap.get(hId) || { hawker_id: hId, name: `Hawker #${hId}`, hawker_name: `Hawker #${hId}` };
          hawkerTotals[hId] = { hawker: hw, counts: {}, total: 0 };
        }
        const qty = s.qty || 1;
        hawkerTotals[hId].counts[pId] = (hawkerTotals[hId].counts[pId] || 0) + qty;
        hawkerTotals[hId].total += qty;
      });

      let rows = Object.values(hawkerTotals)
        .filter(r => r.total > 0)
        .sort((a, b) => b.total - a.total);

      if (hawkerId && hawkerId !== 'all') {
        const hIdNum = parseInt(hawkerId, 10);
        rows = rows.filter(r => r.hawker.hawker_id === hIdNum);
      }
      if (regionId && regionId !== 'all') {
        const rIdNum = parseInt(regionId, 10);
        rows = rows.filter(r => r.hawker.region_id === rIdNum);
      }
      if (search) {
        rows = rows.filter(r => (r.hawker.name || '').toLowerCase().includes(search) || String(r.hawker.hawker_id).includes(search));
      }

      const grandTotal = rows.reduce((s, r) => s + r.total, 0);
      const pubTotals: Record<number, number> = {};
      targetPubs.forEach(p => {
        pubTotals[p.publica_id] = rows.reduce((s, r) => s + (r.counts[p.publica_id] || 0), 0);
      });

      return NextResponse.json({
        report_title: isMagazine ? 'HAWKER-WISE MAGAZINE QUANTITY REPORT' : 'HAWKER-WISE DAILY NEWSPAPER QUANTITY REPORT',
        target_pubs: targetPubs.map(p => ({ publica_id: p.publica_id, name: p.abrv || p.public_name || p.name })),
        rows: rows.slice((page - 1) * limit, page * limit),
        total_rows: rows.length,
        grand_total: grandTotal,
        pub_totals: pubTotals,
        page,
        total_pages: Math.ceil(rows.length / limit) || 1
      });
    }

    // 2. Customer Outstanding Dues Ledger & Previous Dues
    if (reportType === 'dues_ledger' || reportType === 'previous_dues_wise' || reportType === 'advance_list') {
      const customersWithBalances = data.customers.map(c => {
        const rawCbal = Number(c.cbal || 0);
        const rawDueAmt = Number(c.dueamount ?? c.due_amount ?? 0);
        const paidStatus = String(c.paid || '').trim().toUpperCase();

        let dueAmount = 0;
        let advanceAmount = 0;

        if (rawCbal < 0) {
          dueAmount = -rawCbal;
        } else if (rawCbal > 0) {
          advanceAmount = rawCbal;
        } else if (rawDueAmt > 0 && paidStatus !== 'P') {
          dueAmount = rawDueAmt;
        }

        const netBalance = dueAmount > 0 ? dueAmount : -advanceAmount;
        const status = dueAmount > 0 ? 'Due' : (advanceAmount > 0 ? 'Advance' : 'Clear');

        return {
          customer_id: c.customer_id,
          name: c.name_eng || `Customer #${c.customer_id}`,
          name_hindi: storedHindiName(c),
          address: [c.add1, c.add2].filter(Boolean).join(', ') || '---',
          phone: c.phone || '---',
          region_id: c.region_id || 1,
          region_name: regMap.get(c.region_id)?.region_name || `Region #${c.region_id}`,
          due_amount: dueAmount,
          advance: advanceAmount,
          net_balance: netBalance,
          status: status
        };
      });

      let rows = customersWithBalances.filter(c => {
        if (reportType === 'advance_list') return c.advance > 0;
        return c.due_amount > 0;
      });

      if (reportType === 'previous_dues_wise') {
        rows.sort((a, b) => b.due_amount - a.due_amount);
      }

      if (regionId && regionId !== 'all') {
        const rIdNum = parseInt(regionId, 10);
        rows = rows.filter(c => c.region_id === rIdNum);
      }
      if (search) {
        rows = rows.filter(c => 
          String(c.name || '').toLowerCase().includes(search) || 
          String(c.address || '').toLowerCase().includes(search) ||
          String(c.customer_id).includes(search)
        );
      }

      const totalDue = rows.reduce((sum, c) => sum + c.due_amount, 0);
      const totalAdv = rows.reduce((sum, c) => sum + c.advance, 0);

      const paginated = rows.slice((page - 1) * limit, page * limit);

      return NextResponse.json({
        report_title: reportType === 'advance_list' ? 'CUSTOMER ADVANCE BALANCE LIST' : 'CUSTOMER OUTSTANDING DUES LEDGER',
        rows: paginated,
        total_rows: rows.length,
        total_due: totalDue,
        total_advance: totalAdv,
        net_total: totalDue - totalAdv,
        page,
        total_pages: Math.ceil(rows.length / limit) || 1
      });
    }

    // 3. Due Region Wise Summary: the old software's due query, worked out from this year's bills and receipts:
    // opening dues + paper bills + delivery - receipts - less. Only the 'Dues' row holds the opening dues,
    // since bills made on this website also keep the carried balance in due_amt.
    if (reportType === 'due_region_summary') {
      const suffix = fySuffix();
      const [customers, headers, lines, deliveries, receipts] = await Promise.all([
        fetchAllFromSupabase('customer', ['customer_id'], 'customer_id, name_eng, name_hindi, name_hindi_unicode, hindi_add, add1, add2, region_id, priority, phone')
          .catch(() => fetchAllFromSupabase('customer', ['customer_id'])),
        fetchAllFromSupabase(`billno${suffix}`, ['bill_id'], 'customer_id, month, due_amt, dis_amt'),
        fetchAllFromSupabase(`bill${suffix}`, ['id'], 'customer_id, total_amt'),
        fetchAllFromSupabase(`billdel${suffix}`, ['id'], 'customer_id, dely'),
        fetchAllFromSupabase(`receipt${suffix}`, ['id'], 'customer_id, mal_recp_amt, less_amt')
      ]);
      data.customers = customers;
      const parts = new Map<number, { dues: number; bill: number; delivery: number; receipt: number; less: number }>();
      const part = (id: any) => {
        const key = Number(id);
        if (!parts.has(key)) parts.set(key, { dues: 0, bill: 0, delivery: 0, receipt: 0, less: 0 });
        return parts.get(key)!;
      };
      for (const h of headers) {
        if (monthCode(h.month) === 'due') part(h.customer_id).dues += Number(h.due_amt || 0);
        else part(h.customer_id).bill -= Number(h.dis_amt || 0);
      }
      for (const l of lines) part(l.customer_id).bill += Number(l.total_amt || 0);
      for (const d of deliveries) part(d.customer_id).delivery += Number(d.dely || 0);
      for (const r of receipts) {
        part(r.customer_id).receipt += Number(r.mal_recp_amt || 0);
        part(r.customer_id).less += Number(r.less_amt || 0);
      }
      const round = (n: number) => Math.round(n * 100) / 100;

      const balances = data.customers.map(c => {
        const p = parts.get(Number(c.customer_id)) || { dues: 0, bill: 0, delivery: 0, receipt: 0, less: 0 };
        return {
          customer_id: c.customer_id,
          priority: Number(c.priority || 0),
          region_id: c.region_id || 1,
          region_name: regMap.get(c.region_id)?.region_name || `Region #${c.region_id}`,
          name: c.name_eng || `Customer #${c.customer_id}`,
          name_hindi: storedHindiName(c),
          address: c.hindi_add || [c.add1, c.add2].filter(Boolean).join(', '),
          phone: c.phone || '',
          year_end_dues: round(p.dues),
          total_bill: round(p.bill),
          total_delivery: round(p.delivery),
          total_receipt: round(p.receipt),
          total_less: round(p.less),
          final_balance: round(p.dues + p.bill + p.delivery - p.receipt - p.less)
        };
      });
      const owing = balances.filter(b => b.final_balance !== 0);
      const totals = (rows: typeof owing) => ({
        due_customers: rows.filter(b => isDue(b.final_balance)).length,
        advance_customers: rows.filter(b => b.final_balance < 0).length,
        total_due_amount: round(rows.reduce((s, b) => s + (isDue(b.final_balance) ? b.final_balance : 0), 0)),
        total_advance_amount: round(rows.reduce((s, b) => s - Math.min(b.final_balance, 0), 0)),
        net_outstanding: round(rows.reduce((s, b) => s + b.final_balance, 0))
      });

      // One region, or every region, customer by customer in the order the hawker goes
      if (regionId && regionId !== 'all') {
        let rows = regionId === 'all_list' ? owing : owing.filter(b => b.region_id === parseInt(regionId, 10));
        if (search) rows = rows.filter(b => b.name.toLowerCase().includes(search) || String(b.customer_id).includes(search));
        rows.sort((a, b) => a.region_id - b.region_id || a.priority - b.priority || a.customer_id - b.customer_id);
        return NextResponse.json({
          report_title: regionId === 'all_list' ? 'DUE LIST - ALL REGIONS' : `DUE LIST - ${regMap.get(parseInt(regionId, 10))?.region_name || `Region #${regionId}`}`,
          view: 'customers',
          rows,
          total_rows: rows.length,
          summary: totals(rows)
        });
      }

      const byRegion = new Map<number, any>();
      for (const b of balances) {
        if (!byRegion.has(b.region_id)) byRegion.set(b.region_id, { region_id: b.region_id, region_name: b.region_name, totalCust: 0, owing: [] });
        const r = byRegion.get(b.region_id);
        r.totalCust++;
        if (b.final_balance !== 0) r.owing.push(b);
      }
      let rows = Array.from(byRegion.values()).map(({ owing: list, ...r }) => {
        const t = totals(list);
        return { ...r, dueCust: t.due_customers, advCust: t.advance_customers, totalDue: t.total_due_amount, totalAdv: t.total_advance_amount };
      }).filter(r => r.dueCust > 0 || r.advCust > 0).sort((a, b) => String(a.region_name).localeCompare(String(b.region_name), undefined, { numeric: true }));
      if (search) {
        rows = rows.filter(r => r.region_name.toLowerCase().includes(search) || String(r.region_id).includes(search));
      }
      const shown = new Set(rows.map(r => r.region_id));
      return NextResponse.json({
        report_title: 'DUE REGION-WISE SUMMARY REPORT',
        view: 'regions',
        rows,
        total_rows: rows.length,
        summary: { total_customers: rows.reduce((s, r) => s + r.totalCust, 0), ...totals(owing.filter(b => shown.has(b.region_id))) }
      });
    }

    // 4. Customer Detail / Month Register
    if (reportType === 'cust_detail_month') {
      let rows = data.customers;
      if (regionId && regionId !== 'all') {
        const rIdNum = parseInt(regionId, 10);
        rows = rows.filter(c => c.region_id === rIdNum);
      }
      if (search) {
        rows = rows.filter(c => 
          (c.name_eng || '').toLowerCase().includes(search) || 
          String(c.customer_id).includes(search) ||
          (c.add1 || '').toLowerCase().includes(search)
        );
      }

      // Group active subscriptions by customer
      const custSubsMap = new Map<number, any[]>();
      data.subscriptions.forEach(s => {
        if (!s.c_date) {
          const list = custSubsMap.get(s.customer_id) || [];
          list.push(s);
          custSubsMap.set(s.customer_id, list);
        }
      });

      const paginated = rows.slice((page - 1) * limit, page * limit).map(c => {
        const subs = custSubsMap.get(c.customer_id) || [];
        const pubNames = subs.map(s => {
          const p = pubMap.get(s.publica_id);
          return `${p?.abrv || p?.public_name || 'Pub #' + s.publica_id} (${s.qty || 1})`;
        }).join(', ') || 'No active subscription';

        const hwNames = Array.from(new Set(subs.map(s => hwMap.get(s.hawker_id)?.name).filter(Boolean))).join(', ') || 'Direct';

        return {
          customer_id: c.customer_id,
          name: c.name_eng || `Customer #${c.customer_id}`,
          name_hindi: storedHindiName(c),
          address: [c.add1, c.add2].filter(Boolean).join(', ') || '---',
          phone: c.phone || '---',
          region_name: regMap.get(c.region_id)?.region_name || `Region #${c.region_id}`,
          publications: pubNames,
          hawkers: hwNames,
          due_amount: c.dueamount || 0,
          advance: c.cbal || 0
        };
      });

      return NextResponse.json({
        report_title: `CUSTOMER DETAIL / MONTH REGISTER (${month} ${year})`,
        rows: paginated,
        total_rows: rows.length,
        page,
        total_pages: Math.ceil(rows.length / limit) || 1
      });
    }

    // 5. Customer Publication Starting
    if (reportType === 'cust_pub_starting') {
      let subs = data.subscriptions.filter(s => s.s_date && s.s_date.trim().length > 0);
      if (publicaId && publicaId !== 'all') {
        const pIdNum = parseInt(publicaId, 10);
        subs = subs.filter(s => s.publica_id === pIdNum);
      }
      if (search) {
        subs = subs.filter(s => {
          const cust = custMap.get(s.customer_id);
          return (cust?.name_eng || '').toLowerCase().includes(search) || String(s.customer_id).includes(search);
        });
      }

      const rows = subs.slice((page - 1) * limit, page * limit).map(s => {
        const cust = custMap.get(s.customer_id);
        const pub = pubMap.get(s.publica_id);
        const hw = hwMap.get(s.hawker_id);
        return {
          customer_id: s.customer_id,
          customer_name: cust?.name_eng || `Customer #${s.customer_id}`,
          address: [cust?.add1, cust?.add2].filter(Boolean).join(', ') || '---',
          publication: pub?.public_name || pub?.name || `Pub #${s.publica_id}`,
          hawker: hw?.name || `Hawker #${s.hawker_id}`,
          start_date: s.s_date,
          qty: s.qty || 1,
          circulation: s.circulation || 'Morning'
        };
      });

      return NextResponse.json({
        report_title: 'CUSTOMER PUBLICATION STARTING REPORT',
        rows,
        total_rows: subs.length,
        page,
        total_pages: Math.ceil(subs.length / limit) || 1
      });
    }

    // 6. Circulation Type Publication Report
    if (reportType === 'circ_type_pub') {
      const circStats: Record<string, { circulation: string; totalCopies: number; totalSubs: number; pubs: Record<string, number> }> = {};
      data.subscriptions.forEach(s => {
        if (s.c_date) return;
        const circ = s.circulation || 'Morning';
        if (!circStats[circ]) circStats[circ] = { circulation: circ, totalCopies: 0, totalSubs: 0, pubs: {} };
        const q = s.qty || 1;
        circStats[circ].totalCopies += q;
        circStats[circ].totalSubs += 1;
        const p = pubMap.get(s.publica_id)?.public_name || `Pub #${s.publica_id}`;
        circStats[circ].pubs[p] = (circStats[circ].pubs[p] || 0) + q;
      });

      const rows = Object.values(circStats).map(c => ({
        circulation: c.circulation,
        total_subscriptions: c.totalSubs,
        total_copies: c.totalCopies,
        top_publications: Object.entries(c.pubs).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => `${name}: ${qty}`).join('; ')
      }));

      return NextResponse.json({
        report_title: 'CIRCULATION TYPE PUBLICATION REPORT',
        rows,
        total_rows: rows.length
      });
    }

    // 7. Customer Wise Choose Publication
    if (reportType === 'cust_choose_pub') {
      let chosenPubId = publicaId && publicaId !== 'all' ? parseInt(publicaId, 10) : 5; // Default to Patrika or first pub
      const targetPub = pubMap.get(chosenPubId) || data.publications[0];
      chosenPubId = targetPub ? targetPub.publica_id : 5;

      const matchingSubs = data.subscriptions.filter(s => !s.c_date && s.publica_id === chosenPubId);
      let rows = matchingSubs.map(s => {
        const cust = custMap.get(s.customer_id);
        const hw = hwMap.get(s.hawker_id);
        return {
          customer_id: s.customer_id,
          name: cust?.name_eng || `Customer #${s.customer_id}`,
          address: [cust?.add1, cust?.add2].filter(Boolean).join(', ') || '---',
          region_name: regMap.get(cust?.region_id)?.region_name || `Region #${cust?.region_id}`,
          hawker_name: hw?.name || `Hawker #${s.hawker_id}`,
          qty: s.qty || 1,
          start_date: s.s_date || '---'
        };
      });

      if (search) {
        rows = rows.filter(r => r.name.toLowerCase().includes(search) || r.address.toLowerCase().includes(search));
      }

      return NextResponse.json({
        report_title: `CUSTOMERS SUBSCRIBED TO: ${targetPub?.public_name || 'Selected Publication'}`,
        selected_pub: targetPub?.public_name,
        rows: rows.slice((page - 1) * limit, page * limit),
        total_rows: rows.length,
        total_copies: rows.reduce((s, r) => s + r.qty, 0),
        page,
        total_pages: Math.ceil(rows.length / limit) || 1
      });
    }

    // 8. Discontinue Date Wise & Hawker Wise
    if (reportType === 'discontinue_datewise' || reportType === 'discontinue_hawkerwise') {
      let discs = data.discontinues;
      if (search) {
        discs = discs.filter(d => {
          const c = custMap.get(d.customer_id);
          return (c?.name_eng || '').toLowerCase().includes(search) || String(d.customer_id).includes(search);
        });
      }

      const rows = discs.slice((page - 1) * limit, page * limit).map(d => {
        const c = custMap.get(d.customer_id);
        const p = pubMap.get(d.publica_id);
        return {
          customer_id: d.customer_id,
          customer_name: c?.name_eng || `Customer #${d.customer_id}`,
          address: [c?.add1, c?.add2].filter(Boolean).join(', ') || '---',
          publication: p?.public_name || `Publication #${d.publica_id}`,
          from_date: d.temp_from,
          to_date: d.temp_to,
          type: d.temp_perma === 'P' ? 'Permanent' : 'Temporary Hold'
        };
      });

      return NextResponse.json({
        report_title: reportType === 'discontinue_hawkerwise' ? 'DISCONTINUE HAWKER-WISE WITH ADDRESS' : 'DISCONTINUE DATE-WISE REPORT',
        rows,
        total_rows: discs.length,
        page,
        total_pages: Math.ceil(discs.length / limit) || 1
      });
    }

    // 9. Receipt Number Wise & Actual Amount Receipt
    if (reportType === 'receipt_nowise' || reportType === 'receipt_realamt') {
      let rcps = data.receipts;
      if (search) {
        rcps = rcps.filter(r => 
          (r.receipt_no || '').toLowerCase().includes(search) || 
          String(r.customer_id).includes(search) ||
          (r.manual_rep_no || '').toLowerCase().includes(search)
        );
      }

      const paginated = rcps.slice((page - 1) * limit, page * limit).map(r => {
        const c = custMap.get(r.customer_id);
        return {
          receipt_id: r.receipt_id,
          receipt_no: r.receipt_no || r.manual_rep_no || `R-${r.receipt_id}`,
          customer_id: r.customer_id,
          customer_name: c?.name_eng || `Customer #${r.customer_id}`,
          bill_date: r.bill_date || r.mal_recp_dt || '---',
          due_amt: r.due_amt || 0,
          received_amt: r.r_amt || r.mal_recp_amt || 0,
          less_amt: r.less_amt || 0,
          balance: r.balance || 0,
          payment_mode: r.cash_chq || 'Cash',
          cheque_no: r.cheque_no || '---'
        };
      });

      const totalReceived = rcps.reduce((s, r) => s + (r.r_amt || r.mal_recp_amt || 0), 0);
      const totalLess = rcps.reduce((s, r) => s + (r.less_amt || 0), 0);

      return NextResponse.json({
        report_title: reportType === 'receipt_realamt' ? 'ACTUAL AMOUNT RECEIPT REPORT' : 'RECEIPT NUMBER-WISE REPORT',
        rows: paginated,
        total_rows: rcps.length,
        total_received: totalReceived,
        total_discount: totalLess,
        page,
        total_pages: Math.ceil(rcps.length / limit) || 1
      });
    }

    // 10. Purchase Date Wise & Publisher Wise: the purchase and purchasedetail entries from the
    // old software (brought over when its data was imported), never an estimate. Date Wise keeps
    // only the chosen month; Publisher Wise shows everything, grouped by publisher.
    if (reportType === 'purchase_datewise' || reportType === 'purchase_publisherwise') {
      const field = (row: any, name: string) => row?.[name] ?? row?.[name.toLowerCase()] ?? row?.[name.toUpperCase()];
      const [purchases, details] = await Promise.all([
        fetchAllFromSupabase('purchase', ['Purchase_id']).catch(() => [] as any[]),
        fetchAllFromSupabase('purchasedetail', ['Purchase_id']).catch(() => [] as any[])
      ]);

      // The purchase date as year and month, from '2026-10-05' or '05/10/2026'
      const yearMonthOf = (value: any): string => {
        const t = String(value || '').split('T')[0];
        let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[1]}-${m[2]}`;
        m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m) return `${m[3]}-${m[2].padStart(2, '0')}`;
        return '';
      };
      const monthIdx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthCode(month));
      const startYear = parseInt(year, 10) || new Date().getFullYear();
      const wantedYearMonth = `${monthIdx >= 0 && monthIdx <= 2 ? startYear + 1 : startYear}-${String(monthIdx + 1).padStart(2, '0')}`;

      const copiesByPurchase = new Map<number, number>();
      details.forEach(d => {
        const pid = Number(field(d, 'Purchase_id'));
        copiesByPurchase.set(pid, (copiesByPurchase.get(pid) || 0) + Number(field(d, 'Qty') || 0));
      });

      const publrMap = new Map<number, any>(data.publishers.map(p => [p.publish_id || p.id, p]));
      const groups = new Map<string, { name: string; contact: string; city: string; totalCopies: number; totalAmount: number }>();
      let kept = 0;
      purchases.forEach(row => {
        const when = field(row, 'R_Date') || field(row, 'Bill_Date');
        if (reportType === 'purchase_datewise' && monthIdx >= 0 && yearMonthOf(when) !== wantedYearMonth) return;
        kept++;
        const publisherId = Number(field(row, 'Publish_id') || 0);
        const publisher = publrMap.get(publisherId);
        const key = reportType === 'purchase_datewise' ? `${yearMonthOf(when)}|${String(when).split('T')[0]}|${publisherId}` : String(publisherId);
        if (!groups.has(key)) {
          groups.set(key, {
            name: reportType === 'purchase_datewise'
              ? `${String(when).split('T')[0]} — ${publisher?.name || `Publisher #${publisherId}`}`
              : publisher?.name || `Publisher #${publisherId}`,
            contact: publisher?.contact_pers || publisher?.phone || '---',
            city: publisher?.city || '',
            totalCopies: 0,
            totalAmount: 0
          });
        }
        const g = groups.get(key)!;
        g.totalCopies += copiesByPurchase.get(Number(field(row, 'Purchase_id'))) || 0;
        const amount = Number(field(row, 'NetAmt') || 0) || Number(field(row, 'Total') || 0);
        g.totalAmount += amount;
      });

      const rows = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, g]) => ({
        ...g, totalAmount: Math.round(g.totalAmount * 100) / 100
      }));

      return NextResponse.json({
        report_title: reportType === 'purchase_publisherwise' ? 'PURCHASE PUBLISHER-WISE REPORT' : `PURCHASE DATE-WISE REPORT (${month.toUpperCase()} ${year})`,
        rows,
        total_rows: rows.length,
        total_copies: rows.reduce((s, r) => s + r.totalCopies, 0),
        total_amount: Math.round(rows.reduce((s, r) => s + r.totalAmount, 0) * 100) / 100,
        report_note: purchases.length === 0
          ? 'वेबसाइट पर कोई खरीद एंट्री नहीं है। खरीद पुराने सॉफ्टवेयर में दर्ज होती है।'
          : kept === 0 && reportType === 'purchase_datewise' ? `${month} ${year} में कोई खरीद एंट्री नहीं मिली।` : undefined
      });
    }

    // 11. Counter Sale Date Wise & Publication Wise
    if (reportType === 'countersale_datewise' || reportType === 'countersale_pubwise') {
      const sales = data.countersale;
      const rows = sales.map(s => {
        const p = pubMap.get(s.publica_id || s.Publica_id);
        return {
          id: s.id,
          sale_date: s.sale_date || s.Sale_Date,
          publication: p?.public_name || `Pub #${s.publica_id}`,
          customer_name: s.customer_name || 'Counter Walk-in',
          qty: s.qty || s.Qty || 1,
          rate: s.rate || 0,
          total_amt: s.amt || s.Amt || 0
        };
      });

      return NextResponse.json({
        report_title: reportType === 'countersale_pubwise' ? 'COUNTER SALE PUBLICATION-WISE' : 'COUNTER SALE DATE-WISE REPORT',
        rows,
        total_rows: rows.length,
        total_amount: rows.reduce((s, r) => s + r.total_amt, 0)
      });
    }

    // 12. Hawker Customer Priority Report
    if (reportType === 'hawker_cust_priority') {
      let targetHId = hawkerId && hawkerId !== 'all' ? parseInt(hawkerId, 10) : 1;
      const hw = hwMap.get(targetHId) || data.hawkers[0];
      targetHId = hw ? hw.hawker_id : 1;

      // Find all customers with subscriptions belonging to this hawker
      const hwSubs = data.subscriptions.filter(s => !s.c_date && s.hawker_id === targetHId);
      const uniqueCustIds = Array.from(new Set(hwSubs.map(s => s.customer_id)));

      let custRows = uniqueCustIds.map(cid => {
        const c = custMap.get(cid);
        const mySubs = hwSubs.filter(s => s.customer_id === cid);
        const pubsStr = mySubs.map(s => {
          const p = pubMap.get(s.publica_id);
          return `${p?.abrv || p?.public_name} (${s.qty || 1})`;
        }).join(', ');

        return {
          customer_id: cid,
          priority: c?.priority || cid,
          name: c?.name_eng || `Customer #${cid}`,
          address: [c?.add1, c?.add2].filter(Boolean).join(', ') || '---',
          phone: c?.phone || '---',
          publications: pubsStr
        };
      }).sort((a, b) => a.priority - b.priority);

      if (search) {
        custRows = custRows.filter(r => r.name.toLowerCase().includes(search) || r.address.toLowerCase().includes(search));
      }

      return NextResponse.json({
        report_title: `HAWKER CUSTOMER PRIORITY: ${hw?.name || 'Selected Hawker'}`,
        hawker_name: hw?.name,
        rows: custRows.slice((page - 1) * limit, page * limit),
        total_rows: custRows.length,
        page,
        total_pages: Math.ceil(custRows.length / limit) || 1
      });
    }

    // 13. Sticker Printing Labels
    if (reportType === 'sticker_printing') {
      let rows = data.customers;
      if (regionId && regionId !== 'all') {
        rows = rows.filter(c => c.region_id === parseInt(regionId, 10));
      }
      if (search) {
        rows = rows.filter(c => (c.name_eng || '').toLowerCase().includes(search) || String(c.customer_id).includes(search));
      }

      const paginated = rows.slice((page - 1) * 24, page * 24).map(c => ({
        customer_id: c.customer_id,
        name: c.name_eng || `Customer #${c.customer_id}`,
        address1: c.add1 || '',
        address2: c.add2 || '',
        region: regMap.get(c.region_id)?.region_name || `Region #${c.region_id}`,
        phone: c.phone || ''
      }));

      return NextResponse.json({
        report_title: 'CUSTOMER DISPATCH STICKER PRINTING',
        rows: paginated,
        total_rows: rows.length,
        page,
        total_pages: Math.ceil(rows.length / 24) || 1
      });
    }

    // 14. Consolidated Sale & Daily Sale Report: the chosen month's generated bills, delivery
    // charges and counter sales, straight from the year's tables. Nothing is estimated: a month
    // whose bills are not generated yet shows zero.
    if (reportType === 'consolidated_sale' || reportType === 'daily_sale') {
      const yStr = String(year);
      const suffix = yStr.length === 8 ? yStr : `${parseInt(yStr, 10) || 2026}${(parseInt(yStr, 10) || 2026) + 1}`;
      const monthStart3 = month.trim().slice(0, 3);

      // Adds up one column of a year table for the chosen month, a page at a time
      const sumMonth = async (table: string, column: string): Promise<number> => {
        let total = 0;
        for (let from = 0; ; from += 1000) {
          const { data: rows, error } = await supabase.from(table).select(`${column}, month`)
            .ilike('month', `${monthStart3}%`).range(from, from + 999);
          if (error) throw new Error(`Could not read ${table}: ${error.message}`);
          for (const r of rows || []) total += Number((r as any)[column] || 0);
          if (!rows || rows.length < 1000) return Math.round(total * 100) / 100;
        }
      };

      const [paperBills, discounts, delivery] = await Promise.all([
        sumMonth(`bill${suffix}`, 'total_amt'),
        sumMonth(`billno${suffix}`, 'dis_amt'),
        sumMonth(`billdel${suffix}`, 'dely')
      ]);

      // Counter sales of that calendar month (vr_date is kept as DD/MM/YYYY)
      const monthIdx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthCode(month));
      const startYear = parseInt(yStr.slice(0, 4), 10) || new Date().getFullYear();
      const calendarYear = monthIdx >= 0 && monthIdx <= 2 ? startYear + 1 : startYear;
      const totalCounterSale = Math.round(data.countersale.reduce((sum, c) => {
        const part = String(c.vr_date || c.sale_date || c.Sale_Date || '').split('/');
        const inMonth = part.length === 3 && Number(part[1]) === monthIdx + 1 && Number(part[2]) === calendarYear;
        return inMonth ? sum + Number(c.amt || c.Amt || 0) : sum;
      }, 0) * 100) / 100;

      const netPaper = Math.round((paperBills - discounts) * 100) / 100;
      const grandTotalSales = Math.round((netPaper + delivery + totalCounterSale) * 100) / 100;
      const pct = (n: number) => (grandTotalSales > 0 ? `${((n / grandTotalSales) * 100).toFixed(1)}%` : '—');

      const summaryRows = [
        { category: 'Customer Newspaper Bills (after discount)', amount: netPaper, percentage: pct(netPaper) },
        { category: 'Customer Delivery / Line Charges', amount: delivery, percentage: pct(delivery) },
        { category: 'Counter Walk-in Cash Sales', amount: totalCounterSale, percentage: pct(totalCounterSale) }
      ];

      return NextResponse.json({
        report_title: `CONSOLIDATED SALE REPORT (${month} ${year})`,
        rows: summaryRows,
        grand_total: grandTotalSales,
        total_rows: summaryRows.length,
        report_note: netPaper === 0 && delivery === 0
          ? `${month} ${suffix.slice(0, 4)}-${suffix.slice(6)} के बिल अभी नहीं बने हैं (Process → Bill Generation), इसलिए रकम शून्य है।`
          : undefined
      });
    }

    // 15. Bill Printing: Region Wise, Single Bill Printing & Bill Paid Report
    // ARCHITECTURE: Bills must be generated first via Process -> Bill Generation.
    // Bill Printing in Reports only reads committed bills from database for high speed, and returns an error if not generated yet.
    if (reportType === 'bill_print_region' || reportType === 'bill_print_single' || reportType === 'bill_paid_report') {
      let fySuffix = '20252026';
      const yStr = String(year);
      if (yStr.length === 8) {
        fySuffix = yStr;
      } else {
        const startY = parseInt(yStr, 10) || 2026;
        fySuffix = `${startY}${startY + 1}`;
      }

      const standardMonth = month.trim();
      const monthPrefix = standardMonth.slice(0, 3);
      const billnoTable = `billno${fySuffix}`;
      const billTable = `bill${fySuffix}`;
      const billdelTable = `billdel${fySuffix}`;

      // Build query for committed bill headers in the selected month
      let query = supabase
        .from(billnoTable)
        .select('*');

      // Month match: standard full name or prefix (e.g. 'September' or 'Sept', 'August' or 'Aug')
      query = query.or(`month.ilike.${standardMonth},month.ilike.${monthPrefix}%`);

      if (regionId && regionId !== 'all') {
        const rNum = parseInt(regionId, 10);
        query = query.eq('region_id', rNum);
      }

      // If user searched by Customer ID or numeric input, filter directly at DB level
      const trimmedSearch = (search || '').trim();

      // All Regions preview leaves out regions starting with Z; a direct customer search still finds them
      if (reportType === 'bill_print_region' && (!regionId || regionId === 'all') && !trimmedSearch) {
        const hiddenRegionIds = data.regions
          .filter(r => /^\s*z/i.test(String(r.region_name || r.name || '')))
          .map(r => r.region_id);
        if (hiddenRegionIds.length > 0) {
          query = query.not('region_id', 'in', `(${hiddenRegionIds.join(',')})`);
        }
      }

      const isNumericSearch = /^\d+$/.test(trimmedSearch);
      if (isNumericSearch) {
        query = query.eq('customer_id', parseInt(trimmedSearch, 10));
      } else if (trimmedSearch) {
        // If searching by customer name or phone, first find matching customer_ids from customer table
        const { data: matchedCusts } = await supabase
          .from('customer')
          .select('customer_id')
          .or(`name_eng.ilike.%${trimmedSearch}%,phone.ilike.%${trimmedSearch}%`)
          .limit(200);

        const matchedIds = (matchedCusts || []).map(c => c.customer_id).filter(Boolean);
        if (matchedIds.length > 0) {
          query = query.in('customer_id', matchedIds);
        } else {
          // No customer matched text search
          return NextResponse.json({
            report_title: reportType === 'bill_print_single'
              ? `SINGLE CUSTOMER BILL PRINTING (${standardMonth.toUpperCase()} ${year})`
              : `REGION-WISE BILL PRINTING (${standardMonth.toUpperCase()} ${year})`,
            error: `No customer found matching "${trimmedSearch}".`,
            not_generated: true,
            rows: [],
            total_rows: 0,
            page: 1,
            total_pages: 1
          }, { status: 400 });
        }
      }

      // Read every page: a month has far more bills than the database returns at once
      let billnoRows: any[] = [];
      let billnoErr: any = null;
      const orderedQuery = query.order('bill_id', { ascending: true });
      for (let from = 0; ; from += 1000) {
        const { data: page, error: pageErr } = await orderedQuery.range(from, from + 999);
        if (pageErr) { billnoErr = pageErr; break; }
        billnoRows.push(...(page || []));
        if (!page || page.length < 1000) break;
      }

      if (billnoErr || billnoRows.length === 0) {
        return NextResponse.json({
          report_title: reportType === 'bill_print_single'
            ? `SINGLE CUSTOMER BILL PRINTING (${standardMonth.toUpperCase()} ${year})`
            : `REGION-WISE BILL PRINTING (${standardMonth.toUpperCase()} ${year})`,
          error: `Bill is not generated yet for ${standardMonth} ${year}! Please generate the bill first from Process -> Bill Generation.`,
          not_generated: true,
          rows: [],
          total_rows: 0,
          page: 1,
          total_pages: 1
        }, { status: 400 });
      }

      // If single bill printing and no specific search, take the first customer
      if (reportType === 'bill_print_single' && billnoRows.length > 1 && !search && regionId === 'all') {
        billnoRows = billnoRows.slice(0, 1);
      }

      if (billnoRows.length === 0) {
        return NextResponse.json({
          report_title: reportType === 'bill_print_single'
            ? `SINGLE CUSTOMER BILL PRINTING (${standardMonth.toUpperCase()} ${year})`
            : `REGION-WISE BILL PRINTING (${standardMonth.toUpperCase()} ${year})`,
          error: `No generated bills found matching customer for ${standardMonth} ${year}.`,
          not_generated: true,
          rows: [],
          total_rows: 0,
          page: 1,
          total_pages: 1
        }, { status: 400 });
      }

      // Fetch line items and delivery charges for these bills
      const targetBillIds = billnoRows.map(b => b.bill_id).filter(Boolean);
      const targetCustIds = billnoRows.map(b => b.customer_id).filter(Boolean);

      const allBillItems: any[] = [];
      const allBilldelItems: any[] = [];

      for (let i = 0; i < targetBillIds.length; i += 200) {
        const chunk = targetBillIds.slice(i, i + 200);
        const { data: bItems } = await supabase.from(billTable).select('*').in('bill_id', chunk);
        if (bItems && bItems.length > 0) allBillItems.push(...bItems);
      }

      for (let i = 0; i < targetCustIds.length; i += 200) {
        const chunk = targetCustIds.slice(i, i + 200);
        const { data: delItems } = await supabase
          .from(billdelTable)
          .select('*')
          .in('customer_id', chunk)
          .or(`month.ilike.${standardMonth},month.ilike.${monthPrefix}%`);
        if (delItems && delItems.length > 0) allBilldelItems.push(...delItems);
      }

      // Publication map
      const pubMap = new Map<number, any>();
      (data.publications || []).forEach((p: any) => pubMap.set(p.publica_id, p));

      // Customer map: merge from cache and also fetch any missing customer details directly from Supabase
      const custMap = new Map<number, any>();
      (data.customers || []).forEach((c: any) => custMap.set(c.customer_id, c));

      const missingCustIds = targetCustIds.filter(id => !custMap.has(Number(id)));
      if (missingCustIds.length > 0) {
        for (let i = 0; i < missingCustIds.length; i += 200) {
          const chunk = missingCustIds.slice(i, i + 200);
          const { data: fetchedCusts } = await supabase
            .from('customer')
            .select('*')
            .in('customer_id', chunk);
          (fetchedCusts || []).forEach(c => custMap.set(c.customer_id, c));
        }
      }

      // Delivery charges map: customer_id + '_' + publica_id -> dely amount
      const delMap = new Map<string, number>();
      allBilldelItems.forEach(d => {
        const key = `${d.customer_id}_${d.publica_id}`;
        delMap.set(key, (delMap.get(key) || 0) + Number(d.dely || 0));
      });

      // Group bill line items by bill_id
      const itemsByBillId = new Map<number, any[]>();
      allBillItems.forEach(it => {
        const bid = Number(it.bill_id);
        if (!itemsByBillId.has(bid)) itemsByBillId.set(bid, []);
        itemsByBillId.get(bid)!.push(it);
      });

      const monthDaysMap: Record<string, number> = {
        'january': 31, 'february': 28, 'march': 31, 'april': 30,
        'may': 31, 'june': 30, 'july': 31, 'august': 31,
        'september': 30, 'october': 31, 'november': 30, 'december': 31
      };
      const daysInMonth = monthDaysMap[standardMonth.toLowerCase()] || 31;

      // Receipts marked for this bill's month, for the Paid line ('Sept' / 'Octo' are stored spellings)
      const monthReceiptsByCust = new Map<number, number>();
      const receiptMonthNames = Array.from(new Set([standardMonth, monthPrefix, standardMonth.slice(0, 4)]));
      for (let i = 0; i < targetCustIds.length; i += 200) {
        const chunk = targetCustIds.slice(i, i + 200);
        const { data: monthReceipts } = await supabase
          .from(`receipt${fySuffix}`)
          .select('customer_id, mal_recp_amt, less_amt')
          .in('customer_id', chunk)
          .in('month', receiptMonthNames);
        (monthReceipts || []).forEach(r => {
          const rCid = Number(r.customer_id);
          const received = Number(r.mal_recp_amt || 0) + Number(r.less_amt || 0);
          monthReceiptsByCust.set(rCid, (monthReceiptsByCust.get(rCid) || 0) + received);
        });
      }

      // Each paper's discount %, so a discounted paper can show its amount after discount
      const discountPctByPub = new Map<string, number>();
      const discountedCustIds = billnoRows.filter(h => Number(h.dis_amt || 0) > 0).map(h => h.customer_id);
      for (let i = 0; i < discountedCustIds.length; i += 200) {
        const { data: discSubs } = await supabase
          .from('customer_detail')
          .select('customer_id, publica_id, dis')
          .in('customer_id', discountedCustIds.slice(i, i + 200))
          .gt('dis', 0);
        (discSubs || []).forEach(s => {
          const key = `${s.customer_id}_${s.publica_id}`;
          discountPctByPub.set(key, Math.max(discountPctByPub.get(key) || 0, Number(s.dis)));
        });
      }

      // Construct final BillRecord objects directly from committed database records
      const bills = billnoRows.map(h => {
        const bid = Number(h.bill_id);
        const cid = Number(h.customer_id);
        const c = custMap.get(cid) || {};
        const reg = regMap.get(h.region_id);

        // A reused bill number can leave another customer's lines under the same bill_id
        const rawItems = (itemsByBillId.get(bid) || []).filter(it => Number(it.customer_id) === cid);
        // Keep rate tiers for the same publication grouped together (sorted by id / insertion sequence, or by publication + sno)
        rawItems.sort((a, b) => {
          if (a.id && b.id) return Number(a.id) - Number(b.id);
          if (a.publica_id !== b.publica_id) return Number(a.publica_id) - Number(b.publica_id);
          return Number(a.sno || 0) - Number(b.sno || 0);
        });

        let paperTotal = 0;
        const seenPubDelivery = new Set<number>();
        const lineItems = rawItems.map((it, idx) => {
          const pub = pubMap.get(it.publica_id);
          const rawHindi = pub?.pub_hindi || pub?.Pub_Hindi;
          const engName = pub?.public_name || pub?.name || `Publication #${it.publica_id}`;
          const pubName = rawHindi && rawHindi.trim().length > 0
            ? cleanOrTransliterateHindi(rawHindi, engName)
            : engName;

          const itemAmt = Number(it.total_amt || 0);
          paperTotal += itemAmt;

          // Delivery charge is per publication per customer per month.
          // If a publication has multiple rate tiers (e.g. weekdays vs Sundays),
          // assign delivery charge only to the first tier of that publication.
          let delyAmt = 0;
          if (!seenPubDelivery.has(it.publica_id)) {
            delyAmt = delMap.get(`${cid}_${it.publica_id}`) || 0;
            seenPubDelivery.add(it.publica_id);
          }

          return {
            sno: idx + 1,
            pub_name: pubName,
            circulation: pub?.circulation || 'Morning',
            qty: Number(it.qty || 1),
            days: Number(it.qty || daysInMonth),
            rate: Number(it.rate || 0),
            amount: itemAmt,
            net_amount: undefined as number | undefined,
            delivery_amount: delyAmt
          };
        });

        const deliveryCharge = Number(h.del_amt || 0);
        const discountCharge = Number(h.dis_amt || 0);
        if (discountCharge > 0) {
          lineItems.forEach((line, idx) => {
            const pct = discountPctByPub.get(`${cid}_${rawItems[idx].publica_id}`) || 0;
            line.net_amount = Math.round(line.amount * (100 - pct)) / 100;
          });
          // Saved discount doesn't match the subscription %: share it across the papers instead
          const netTotal = lineItems.reduce((sum, line) => sum + (line.net_amount ?? line.amount), 0);
          if (paperTotal > 0 && Math.abs(paperTotal - netTotal - discountCharge) > 0.01) {
            lineItems.forEach(line => { line.net_amount = line.amount * (1 - discountCharge / paperTotal); });
          }
        }
        const rawCurrent = paperTotal + deliveryCharge - discountCharge;
        const paperAmount = roundToFoxProRule(paperTotal);
        const currentBill = roundToFoxProRule(rawCurrent);
        const isGovtSupply = c.govt_supply === -1 || c.govt_supply === 1 || c.govt_supply === true || String(c.govt_supply) === '1' || String(c.govt_supply) === '-1';
        // The saved balance already has the Paid amount taken off. Only trust that gap for
        // customers with a receipt in this month, so other bills keep their usual total.
        const monthReceipts = isGovtSupply ? 0 : (monthReceiptsByCust.get(cid) || 0);
        // The engine saves due_amt whenever there is a real Previous Due, so with none saved, a
        // total lower than this bill by exactly the month's receipts is a payment. Older bills
        // whose gap has another cause keep the Previous Due below.
        const paidOffThisBill = monthReceipts > 0
          && (h.due_amt === null || h.due_amt === undefined || h.due_amt === '')
          && Math.abs(rawCurrent + Number(h.balance || 0) - monthReceipts) < 1;
        let prevDue = 0;
        if (h.due_amt !== null && h.due_amt !== undefined && h.due_amt !== '') {
          prevDue = Number(h.due_amt);
        } else if (h.balance !== null && h.balance !== undefined && Number(h.balance) !== 0) {
          // In FoxPro, balance is the net closing balance. If due_amt is not populated,
          // Previous Due = Total Payable - Current Bill.
          const totalFromBalance = Math.abs(Number(h.balance));
          if (!paidOffThisBill && Math.abs(totalFromBalance - currentBill) > 0.01) {
            prevDue = roundToFoxProRule(totalFromBalance - currentBill);
          }
        }

        if (isGovtSupply) prevDue = 0;
        const paidAmount = paidOffThisBill ? monthReceipts : monthReceipts > 0
          ? Math.min(monthReceipts, Math.max(0, rawCurrent + prevDue + Number(h.balance || 0)))
          : 0;
        const netPayable = isGovtSupply ? currentBill : roundToFoxProRule(rawCurrent + prevDue - paidAmount);

        // Extract phone number from c.phone, c.hindi_add, c.add1, or c.add2 if present
        let rawPhone = c.phone || '';
        if (!rawPhone || rawPhone === '---') {
          const hAdd = String(c.hindi_add || '');
          const m1 = hAdd.match(/\b([6-9]\d{9})\b/);
          if (m1) rawPhone = m1[1];
          else {
            const a1 = String(c.add1 || '');
            const m2 = a1.match(/\b([6-9]\d{9})\b/);
            if (m2) rawPhone = m2[1];
            else {
              const a2 = String(c.add2 || '');
              const m3 = a2.match(/\b([6-9]\d{9})\b/);
              if (m3) rawPhone = m3[1];
            }
          }
        }

        return {
          bill_no: bid,
          bill_date: `${daysInMonth}/${standardMonth}/${year}`,
          customer_id: cid,
          priority: c.priority !== undefined && c.priority !== null && Number(c.priority) > 0 ? Number(c.priority) : cid,
          customer_name: c.name_eng || `Customer #${cid}`,
          customer_hindi: getReliableHindiName(storedHindiName(c), c.name_eng || `Customer #${cid}`),
          address: [c.add1, c.add2].filter(Boolean).join(', ') || 'Main Market, Beawar',
          phone: rawPhone || '---',
          region_id: h.region_id,
          region_name: reg?.region_name || `Region #${h.region_id}`,
          month: standardMonth,
          year: year,
          items: lineItems,
          delivery_charge: deliveryCharge,
          discount_amount: discountCharge,
          paper_amount: paperAmount,
          current_bill: currentBill,
          previous_due: prevDue,
          paid_amount: paidAmount,
          advance: c.cbal || 0,
          net_payable: netPayable
        };
      });

      // Filter to only printable bills (customers with billed items)
      // A customer whose advance covers the bill has nothing to pay, so the region run leaves
      // them out of printing and WhatsApp. Looking one customer up still shows their bill.
      const skipSettled = reportType === 'bill_print_region' && !trimmedSearch;
      const printableBills = bills
        .filter(b => b.items.length > 0 || b.current_bill > 0 || b.net_payable > 0)
        .filter(b => !skipSettled || b.net_payable > 0);

      // Sort by Route Priority ASC
      printableBills.sort((a, b) => {
        const pA = Number(a.priority) > 0 ? Number(a.priority) : 999999;
        const pB = Number(b.priority) > 0 ? Number(b.priority) : 999999;
        if (pA !== pB) return pA - pB;
        return a.customer_id - b.customer_id;
      });

      const regTitle = regionId && regionId !== 'all'
        ? regMap.get(parseInt(regionId, 10))?.region_name || `Region #${regionId}`
        : 'ALL REGIONS';

      // If Bill Paid Report: Fetch receipts for this month or receipts paid towards bills
      if (reportType === 'bill_paid_report') {
        const rcptTable = `receipt${fySuffix}`;
        const targetCustIds = bills.map(b => b.customer_id);

        // Fetch receipts for these customers in chunks
        const allCustReceipts: any[] = [];
        for (let i = 0; i < targetCustIds.length; i += 200) {
          const chunk = targetCustIds.slice(i, i + 200);
          const { data: rChunk } = await supabase
            .from(rcptTable)
            .select('*')
            .in('customer_id', chunk);
          if (rChunk) allCustReceipts.push(...rChunk);
        }

        // Map receipts for each customer
        const receiptsListByCust = new Map<number, any[]>();
        allCustReceipts.forEach(r => {
          const cid = Number(r.customer_id || r.Customer_id);
          if (!receiptsListByCust.has(cid)) receiptsListByCust.set(cid, []);
          receiptsListByCust.get(cid)!.push(r);
        });

        // Filter and construct rows showing customer name, bill no, payment amount, date/time, and mode
        const paidRows: any[] = [];
        const monthNamesList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthNum = String(monthNamesList.indexOf(standardMonth) + 1).padStart(2, '0');

        bills.forEach(b => {
          const custRcpts = receiptsListByCust.get(b.customer_id) || [];
          if (custRcpts.length > 0) {
            custRcpts.forEach(r => {
              const rAmt = Number(r.mal_recp_amt || r.r_amt || 0);
              const lessAmt = Number(r.less_amt || 0);
              const totalR = rAmt + lessAmt;
              if (totalR > 0) {
                let parsedRemarks: any = null;
                if (r.remarks && typeof r.remarks === 'string' && r.remarks.trim().startsWith('{')) {
                  try { parsedRemarks = JSON.parse(r.remarks); } catch (_) {}
                }
                const payMode = r.cash_chq || parsedRemarks?.cash_chq || (parsedRemarks?.narr?.includes('UPI') ? 'UPI' : (r.chq_no ? 'UPI / Online' : 'Cash'));
                const recpDate = r.recp_date || parsedRemarks?.mal_recp_dt || b.bill_date;
                const recpTime = r.created_at ? new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (parsedRemarks?.time || '10:30:00 AM');

                // Match payment specifically to this bill:
                // 1) Receipt explicitly mentions or targets this bill_no
                const isForThisBill = (r.bill_no && Number(r.bill_no) === Number(b.bill_no)) ||
                                      (r.narr && r.narr.includes(String(b.bill_no))) ||
                                      (parsedRemarks?.narr && parsedRemarks.narr.includes(String(b.bill_no)));

                // 2) If the bill still has a pending balance (net_payable > 0, like ₹100),
                // prior advance receipts (like ₹6971) were already deducted to arrive at ₹100.
                // They should NOT be shown as if the ₹100 bill is paid.
                // A payment only counts as paying this bill if:
                // - It explicitly matches this bill number, OR
                // - The bill has been settled/cleared (net_payable <= 0), OR
                // - The payment was specifically made for the bill amount (e.g. ₹100).
                if (b.net_payable > 0 && !isForThisBill && totalR !== b.net_payable) {
                  return;
                }

                paidRows.push({
                  receipt_id: r.id || r.recp_no,
                  receipt_no: r.recp_no || r.id,
                  customer_id: b.customer_id,
                  customer_name: b.customer_name,
                  customer_hindi: b.customer_hindi,
                  phone: b.phone,
                  region_name: b.region_name,
                  bill_no: b.bill_no,
                  bill_amount: b.current_bill,
                  paid_amount: totalR,
                  net_balance: b.net_payable,
                  payment_date: recpDate,
                  payment_time: recpTime,
                  payment_mode: payMode,
                  month: standardMonth,
                  year: year
                });
              }
            });
          } else if (b.net_payable <= 0) {
            // Customer settled via account advance
            paidRows.push({
              receipt_id: b.bill_no,
              receipt_no: `ADV-${b.bill_no}`,
              customer_id: b.customer_id,
              customer_name: b.customer_name,
              customer_hindi: b.customer_hindi,
              phone: b.phone,
              region_name: b.region_name,
              bill_no: b.bill_no,
              bill_amount: b.current_bill,
              paid_amount: b.current_bill,
              net_balance: b.net_payable,
              payment_date: b.bill_date,
              payment_time: '12:00:00 PM',
              payment_mode: 'Advance Adjusted',
              month: standardMonth,
              year: year
            });
          }
        });

        paidRows.sort((a, b) => a.customer_id - b.customer_id);
        const finalRows = paidRows.slice((page - 1) * limit, page * limit);
        const totalPaidSum = paidRows.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0);

        return NextResponse.json({
          report_title: `BILL PAID REPORT (UPI / ONLINE / CASH): ${regTitle} (${standardMonth.toUpperCase()} ${year})`,
          rows: finalRows,
          total_rows: paidRows.length,
          total_received: totalPaidSum,
          page,
          total_pages: Math.ceil(paidRows.length / limit) || 1
        });
      }

      const finalRows = printableBills.slice((page - 1) * limit, page * limit);

      return NextResponse.json({
        report_title: reportType === 'bill_print_single'
          ? `SINGLE CUSTOMER BILL PRINTING (${standardMonth.toUpperCase()} ${year})`
          : `REGION-WISE BILL PRINTING: ${regTitle} (${standardMonth.toUpperCase()} ${year})`,
        rows: finalRows,
        total_rows: printableBills.length,
        page,
        total_pages: Math.ceil(printableBills.length / limit) || 1
      });
    }

    // 16. Collection Datewise & Collection Hawker Datewise
    if (reportType === 'collection_datewise' || reportType === 'collection_hawker_datewise') {
      let rcps = data.receipts;
      if (search) {
        rcps = rcps.filter(r => 
          (r.receipt_no || '').toLowerCase().includes(search) || 
          String(r.customer_id).includes(search)
        );
      }

      const rows = rcps.slice((page - 1) * limit, page * limit).map(r => {
        const c = custMap.get(r.customer_id);
        return {
          receipt_no: r.receipt_no || r.manual_rep_no || `REC-${r.receipt_id}`,
          receipt_date: r.bill_date || r.mal_recp_dt || '2026-08-10',
          customer_id: r.customer_id,
          customer_name: c?.name_eng || `Customer #${r.customer_id}`,
          region_name: regMap.get(c?.region_id)?.region_name || `Region #${c?.region_id || 1}`,
          amount: r.r_amt || r.mal_recp_amt || 0,
          mode: r.cash_chq || 'Cash',
          cheque_no: r.cheque_no || '---'
        };
      });

      const totalAmt = rcps.reduce((s, r) => s + (r.r_amt || r.mal_recp_amt || 0), 0);

      return NextResponse.json({
        report_title: reportType === 'collection_hawker_datewise' ? 'COLLECTION HAWKER DATEWISE REPORT' : 'COLLECTION DATEWISE REPORT',
        rows,
        total_rows: rcps.length,
        total_amount: totalAmt,
        page,
        total_pages: Math.ceil(rcps.length / limit) || 1
      });
    }

    // 17. Hawker Report Datewise
    if (reportType === 'hawker_report_datewise') {
      const hwMapTotals: Record<number, { hawker: any; active_customers: number; total_copies: number }> = {};
      data.subscriptions.forEach(s => {
        if (s.c_date) return;
        const hid = s.hawker_id || 1;
        if (!hwMapTotals[hid]) {
          const hw = hwMap.get(hid) || { hawker_id: hid, name: `Hawker #${hid}` };
          hwMapTotals[hid] = { hawker: hw, active_customers: 0, total_copies: 0 };
        }
        hwMapTotals[hid].active_customers += 1;
        hwMapTotals[hid].total_copies += (s.qty || 1);
      });

      let rows = Object.values(hwMapTotals).sort((a, b) => b.total_copies - a.total_copies);
      if (search) {
        rows = rows.filter(r => (r.hawker.name || '').toLowerCase().includes(search));
      }

      return NextResponse.json({
        report_title: `HAWKER REPORT DATEWISE (${month} ${year})`,
        rows: rows.slice((page - 1) * limit, page * limit).map(r => ({
          hawker_id: r.hawker.hawker_id,
          hawker_name: r.hawker.name || `Hawker #${r.hawker.hawker_id}`,
          active_customers: r.active_customers,
          total_copies: r.total_copies,
          area: r.hawker.area || regMap.get(r.hawker.region_id)?.region_name || 'Beawar'
        })),
        total_rows: rows.length,
        total_copies: rows.reduce((s, r) => s + r.total_copies, 0),
        page,
        total_pages: Math.ceil(rows.length / limit) || 1
      });
    }

    // 18. Retail Sale Region Date Wise Report
    if (reportType === 'retailsale_region_datewise' || reportType === 'retailsale_datewise') {
      let rows = data.customers;
      if (regionId && regionId !== 'all') {
        const rIdNum = parseInt(regionId, 10);
        rows = rows.filter(c => c.region_id === rIdNum);
      }
      if (search) {
        rows = rows.filter(c => (c.name_eng || '').toLowerCase().includes(search) || String(c.customer_id).includes(search));
      }

      const custSubsMap = new Map<number, any[]>();
      data.subscriptions.forEach(s => {
        if (!s.c_date) {
          const list = custSubsMap.get(s.customer_id) || [];
          list.push(s);
          custSubsMap.set(s.customer_id, list);
        }
      });

      // Each paper's rate on each day of the month, from the same rate tables billing reads
      const [rateRows, changeRows] = await Promise.all([fetchAllRows('rate', 'id'), fetchAllRows('ratechange', 'id')]);
      const rateList = rateRows.map((r: any) => ({ publica_id: r.publica_id, dayofweek: r.dayofweek, rate: Number(r.rate) }));
      const changeList = changeRows.map((r: any) => {
        const day = String(r.effective_date || '').split('T')[0];
        return { id: r.id, publica_id: r.publica_id, dayofweek: r.dayofweek, oldrate: Number(r.oldrate || 0), new_rate: Number(r.newrate || 0), dated: day, effective_date: day };
      });
      const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthCode(month));
      const yearNum = parseInt(year, 10);
      const monthDays = monthIndex >= 0 && yearNum > 0 ? new Date(Date.UTC(yearNum, monthIndex + 1, 0)).getUTCDate() : 0;
      const priced = new Map<number, { monthly: number; rates: number[] }>();
      const priceOf = (pubId: number) => {
        if (!priced.has(pubId)) {
          const rates: number[] = [];
          let monthly = 0;
          for (let d = 1; d <= monthDays; d++) {
            const date = new Date(Date.UTC(yearNum, monthIndex, d));
            const iso = date.toISOString().split('T')[0];
            const weekday = getLegacyDayOfWeek(new Date(yearNum, monthIndex, d));
            const rate = getEffectiveWeekdayRates(pubId, iso, rateList as any, changeList as any, pubMap.get(pubId)?.magzine_day)[weekday] || 0;
            monthly += rate;
            if (rate > 0) rates.push(rate);
          }
          priced.set(pubId, { monthly: Math.round(monthly * 100) / 100, rates });
        }
        return priced.get(pubId)!;
      };
      // One rate, or the lowest to highest when it differs by weekday (Sunday edition)
      const rateText = (rates: number[]) => {
        if (!rates.length) return 'no rate';
        const lo = Math.min(...rates), hi = Math.max(...rates);
        return lo === hi ? `₹${lo.toFixed(2)}` : `₹${lo.toFixed(2)}-${hi.toFixed(2)}`;
      };

      const paginated = rows.slice((page - 1) * limit, page * limit).map(c => {
        const subs = custSubsMap.get(c.customer_id) || [];
        const pubInfo = subs.map(s => {
          const p = pubMap.get(s.publica_id);
          return `${p?.abrv || p?.public_name} (Qty: ${s.qty || 1}, Rate: ${rateText(priceOf(s.publica_id).rates)})`;
        }).join('; ') || 'No active paper';

        const totalAmt = subs.reduce((sum, s) => sum + (s.qty || 1) * priceOf(s.publica_id).monthly, 0);

        return {
          customer_id: c.customer_id,
          name: c.name_eng || `Customer #${c.customer_id}`,
          name_hindi: storedHindiName(c),
          region_name: regMap.get(c.region_id)?.region_name || `Region #${c.region_id}`,
          publications: pubInfo,
          copies: subs.reduce((sum, s) => sum + (s.qty || 1), 0),
          estimated_amount: totalAmt,
          due_amount: c.dueamount || 0
        };
      });

      const totalEstimated = rows.reduce((acc, c) => {
        const subs = custSubsMap.get(c.customer_id) || [];
        return acc + subs.reduce((sum, s) => sum + (s.qty || 1) * priceOf(s.publica_id).monthly, 0);
      }, 0);

      return NextResponse.json({
        report_title: `RETAIL SALE TO PERMANENT CUSTOMER REGION DATE-WISE REPORT (${month.toUpperCase()} ${year})`,
        rows: paginated,
        total_rows: rows.length,
        total_estimated: totalEstimated,
        page,
        total_pages: Math.ceil(rows.length / limit) || 1
      });
    }

    // 19. Collection Agent Dues Report
    if (reportType === 'collection_agent_dues') {
      const agents = data.collect && data.collect.length > 0 ? data.collect : [
        { collect_id: 1, name: 'Main Office Counter', address: 'Main Market, Beawar' },
        { collect_id: 2, name: 'Suresh Kumar Sharma', address: 'Station Road, Beawar' },
        { collect_id: 3, name: 'Rameshwar Lal', address: 'Sendra Road, Beawar' },
      ];

      // Calculate dues per agent or by region
      const agentStats = agents.map(ag => {
        const assignedCusts = data.customers.filter(c => (c.collect_id || (c.region_id % agents.length + 1)) === ag.collect_id);
        const dueCusts = assignedCusts.filter(c => {
          const rawCbal = Number(c.cbal || 0);
          const rawDue = Number(c.dueamount ?? c.due_amount ?? 0);
          const paid = String(c.paid || '').trim().toUpperCase();
          return rawCbal < 0 || (rawCbal === 0 && rawDue > 0 && paid !== 'P');
        });
        const totalDue = assignedCusts.reduce((sum, c) => {
          const rawCbal = Number(c.cbal || 0);
          const rawDue = Number(c.dueamount ?? c.due_amount ?? 0);
          const paid = String(c.paid || '').trim().toUpperCase();
          if (rawCbal < 0) return sum + (-rawCbal);
          if (rawCbal === 0 && rawDue > 0 && paid !== 'P') return sum + rawDue;
          return sum;
        }, 0);
        const totalAdv = assignedCusts.reduce((sum, c) => {
          const rawCbal = Number(c.cbal || 0);
          return rawCbal > 0 ? sum + rawCbal : sum;
        }, 0);

        return {
          agent_id: ag.collect_id,
          agent_name: ag.name || `Agent #${ag.collect_id}`,
          address: ag.address || 'Beawar',
          phone: ag.phone || ag.mobile || '---',
          total_customers: assignedCusts.length,
          due_customers: dueCusts.length,
          total_due: totalDue,
          total_advance: totalAdv,
          net_collectible: totalDue - totalAdv
        };
      });

      return NextResponse.json({
        report_title: `COLLECTION AGENT OUTSTANDING DUES REPORT (${month.toUpperCase()} ${year})`,
        rows: agentStats,
        total_rows: agentStats.length,
        total_due: agentStats.reduce((s, a) => s + a.total_due, 0),
        total_advance: agentStats.reduce((s, a) => s + a.total_advance, 0),
        net_total: agentStats.reduce((s, a) => s + a.net_collectible, 0)
      });
    }

    // 20. Region Wise Publication Daily Report (Matrix of Regions vs Top Publications)
    if (reportType === 'region_pub_daily') {
      const targetPubs = data.publications.filter(p => !((p.type_p || '').toLowerCase().includes('mag'))).slice(0, 6);
      const regTotals: Record<number, { region: any; counts: Record<number, number>; total: number }> = {};

      data.regions.forEach(r => {
        regTotals[r.region_id] = { region: r, counts: {}, total: 0 };
      });

      data.subscriptions.forEach(s => {
        if (s.c_date) return;
        const cust = custMap.get(s.customer_id);
        const rId = cust?.region_id || 1;
        if (!regTotals[rId]) {
          const regObj = regMap.get(rId) || { region_id: rId, region_name: `Region #${rId}` };
          regTotals[rId] = { region: regObj, counts: {}, total: 0 };
        }
        const qty = s.qty || 1;
        regTotals[rId].counts[s.publica_id] = (regTotals[rId].counts[s.publica_id] || 0) + qty;
        regTotals[rId].total += qty;
      });

      let rows = Object.values(regTotals).filter(r => r.total > 0).sort((a, b) => b.total - a.total);
      if (regionId && regionId !== 'all') {
        const rNum = parseInt(regionId, 10);
        rows = rows.filter(r => r.region.region_id === rNum);
      }
      if (search) {
        rows = rows.filter(r => (r.region.region_name || '').toLowerCase().includes(search));
      }

      const grandTotal = rows.reduce((s, r) => s + r.total, 0);
      const pubTotals: Record<number, number> = {};
      targetPubs.forEach(p => {
        pubTotals[p.publica_id] = rows.reduce((s, r) => s + (r.counts[p.publica_id] || 0), 0);
      });

      return NextResponse.json({
        report_title: `REGION-WISE DAILY PUBLICATION DISTRIBUTION REPORT (${month.toUpperCase()} ${year})`,
        target_pubs: targetPubs.map(p => ({ publica_id: p.publica_id, name: p.abrv || p.public_name })),
        rows: rows.slice((page - 1) * limit, page * limit),
        total_rows: rows.length,
        grand_total: grandTotal,
        pub_totals: pubTotals,
        page,
        total_pages: Math.ceil(rows.length / limit) || 1
      });
    }

    // 21. Region-Wise Start End Report (New Starts and Discontinues by Region)
    if (reportType === 'region_start_end') {
      const regStartEnd: Record<number, { region_name: string; started: number; ended: number; net_change: number; details: any[] }> = {};
      
      data.regions.forEach(r => {
        regStartEnd[r.region_id] = {
          region_name: r.region_name || `Region #${r.region_id}`,
          started: 0,
          ended: 0,
          net_change: 0,
          details: []
        };
      });

      data.subscriptions.forEach(s => {
        const cust = custMap.get(s.customer_id);
        const rId = cust?.region_id || 1;
        if (!regStartEnd[rId]) {
          regStartEnd[rId] = {
            region_name: regMap.get(rId)?.region_name || `Region #${rId}`,
            started: 0,
            ended: 0,
            net_change: 0,
            details: []
          };
        }
        if (s.s_date) {
          regStartEnd[rId].started += (s.qty || 1);
        }
        if (s.c_date) {
          regStartEnd[rId].ended += (s.qty || 1);
        }
        regStartEnd[rId].net_change = regStartEnd[rId].started - regStartEnd[rId].ended;
      });

      let rows = Object.entries(regStartEnd).map(([rId, st]) => ({
        region_id: parseInt(rId, 10),
        ...st
      })).filter(r => r.started > 0 || r.ended > 0).sort((a, b) => b.started - a.started);

      if (regionId && regionId !== 'all') {
        const rNum = parseInt(regionId, 10);
        rows = rows.filter(r => r.region_id === rNum);
      }

      return NextResponse.json({
        report_title: `REGION-WISE START & END PUBLICATION REPORT (${month.toUpperCase()} ${year})`,
        rows: rows.slice((page - 1) * limit, page * limit),
        total_rows: rows.length,
        total_started: rows.reduce((s, r) => s + r.started, 0),
        total_ended: rows.reduce((s, r) => s + r.ended, 0),
        page,
        total_pages: Math.ceil(rows.length / limit) || 1
      });
    }

    // Default Fallback
    return NextResponse.json({
      report_title: 'CRYSTAL REPORT VIEWER - ARYAN NEWS AGENCY',
      rows: [],
      total_rows: 0,
      page: 1,
      total_pages: 1
    });

  } catch (err: any) {
    console.error('Reports API error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
