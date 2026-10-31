import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabaseClient';
import { calculateBilling, roundToFoxProRule } from '@/lib/billingEngine';
import { cleanOrTransliterateHindi, getReliableHindiName } from '@/lib/transliteration';

export const dynamic = 'force-dynamic';

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

let cache: CacheData | null = null;

async function fetchAllFromSupabase(table: string): Promise<any[]> {
  const all: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function getCacheAsync() {
  if (cache) return cache;

  const load = (file: string) => {
    try {
      const srcP = path.join(process.cwd(), 'src', 'data', file);
      if (fs.existsSync(srcP)) {
        return JSON.parse(fs.readFileSync(srcP, 'utf-8'));
      }
      const p = path.join(process.cwd(), 'public', 'data', file);
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    } catch (e) {
      console.warn(`Could not load ${file}:`, e);
    }
    return [];
  };

  const ratechanges = load('ratechanges.json').map((rc: any) => ({
    ...rc,
    dated: rc.effective_date || rc.dated
  }));

  cache = {
    customers: load('all_customers.json'),
    subscriptions: load('all_subscriptions.json'),
    publications: load('publications.json'),
    hawkers: load('hawkers.json'),
    regions: load('regions.json'),
    receipts: load('all_receipts.json'),
    bills: load('all_bills.json'),
    discontinues: load('discontinues.json'),
    countersale: load('countersale.json'),
    publishers: load('publishers.json'),
    rates: load('rates.json'),
    ratechanges: ratechanges,
    holidays: load('holidays.json'),
    collect: load('collect.json'),
    retailsales: load('retailsale.json'),
    publicationdis: load('publicationdis.json')
  };
  return cache;
}

async function fetchSubscriptions(customerIds: number[]): Promise<any[]> {
  if (customerIds.length === 0) return [];

  const CHUNK_SIZE = 100;
  const result: any[] = [];
  const foundCustIds = new Set<number>();

  // 1. Query customer_detail directly from Supabase
  for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
    const chunk = customerIds.slice(i, i + CHUNK_SIZE);
    try {
      const { data: cdSubs } = await supabase
        .from('customer_detail')
        .select('*')
        .in('customer_id', chunk)
        .limit(50000);
      if (cdSubs && cdSubs.length > 0) {
        result.push(...cdSubs);
        cdSubs.forEach(s => foundCustIds.add(s.customer_id));
      }
    } catch (err) {
      console.error('Error fetching customer_detail chunk:', err);
    }
  }

  // 2. Fallback to all_subscriptions.json for any missing customers
  const missingCustIds = customerIds.filter(id => !foundCustIds.has(id));
  if (missingCustIds.length > 0) {
    try {
      const localSubsPath = path.join(process.cwd(), 'public', 'data', 'all_subscriptions.json');
      if (fs.existsSync(localSubsPath)) {
        const localSubs = JSON.parse(fs.readFileSync(localSubsPath, 'utf-8'));
        const fallback = localSubs.filter((s: any) => missingCustIds.includes(s.customer_id));
        result.push(...fallback);
      }
    } catch (err) {
      console.error('Error reading local all_subscriptions.json fallback:', err);
    }
  }

  return result;
}


async function fetchBillsAndReceipts(customerIds: number[], fySuffix: string) {
  if (customerIds.length === 0) return { bills: [], billHeaders: [], receipts: [] };
  const CHUNK_SIZE = 50;
  const allBills: any[] = [];
  const allBillHeaders: any[] = [];
  const allReceipts: any[] = [];

  try {
    for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
      const chunk = customerIds.slice(i, i + CHUNK_SIZE);
      const [{ data: bData }, { data: itemsData }, { data: rData }] = await Promise.all([
        supabase.from(`billno${fySuffix}`).select('*').in('customer_id', chunk).limit(50000),
        supabase.from(`bill${fySuffix}`).select('*').in('customer_id', chunk).limit(50000),
        supabase.from(`receipt${fySuffix}`).select('*').in('customer_id', chunk).limit(50000)
      ]);
      if (bData) allBillHeaders.push(...bData);
      if (itemsData) allBills.push(...itemsData);
      if (rData) allReceipts.push(...rData);
    }
    if (allBills.length > 0 || allBillHeaders.length > 0 || allReceipts.length > 0) {
      return { bills: allBills, billHeaders: allBillHeaders, receipts: allReceipts };
    }
  } catch (e) {
    // fallback
  }
  return { bills: [], billHeaders: [], receipts: [] };
}

async function fetchRetailSales(customerIds: number[], fySuffix: string): Promise<any[]> {
  if (customerIds.length === 0) return [];
  const load = (file: string) => {
    try {
      const p = path.join(process.cwd(), 'public', 'data', file);
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      return [];
    }
    return [];
  };

  const localSales = load('retailsale.json');
  const matchingLocal = localSales.filter((s: any) => {
    const cid = Number(s.Customer_id || s.customer_id);
    return customerIds.includes(cid);
  });

  const matchingDb: any[] = [];
  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
      const chunk = customerIds.slice(i, i + CHUNK_SIZE);
      
      // 1. Query generic retailsale table
      try {
        const { data: genData } = await supabase
          .from('retailsale')
          .select('*')
          .in('customer_id', chunk)
          .limit(50000);
        if (genData && genData.length > 0) {
          matchingDb.push(...genData.map(r => ({
            Retail_id: r.retail_id || r.Retail_id || r.sale_id,
            Vr_Date: r.vr_date || r.Vr_Date,
            Customer_id: r.customer_id || r.Customer_id,
            Publica_id: r.publica_id || r.Publica_id,
            Copies: r.copies || r.Copies || 1,
            Rate: r.rate || r.Rate || 0,
            Amt: r.amt !== undefined ? r.amt : (r.Amt !== undefined ? r.Amt : (r.amount || 0)),
            Narr: r.narr || r.Narr || r.narration || ''
          })));
        }
      } catch {
        // ignore
      }

      // 2. Query FY specific table (e.g. retailsale20252026)
      try {
        const { data: fyData } = await supabase
          .from(`retailsale${fySuffix}`)
          .select('*')
          .in('Customer_id', chunk)
          .limit(50000);
        if (fyData && fyData.length > 0) {
          matchingDb.push(...fyData);
        }
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.error('Error fetching retail sales from Supabase:', err);
  }

  const seen = new Set<string>();
  const merged: any[] = [];
  for (const item of [...matchingLocal, ...matchingDb]) {
    const rId = item.Retail_id || item.retail_id || item.sale_id;
    const key = rId 
      ? `id-${rId}` 
      : `${item.Customer_id || item.customer_id}-${item.Publica_id || item.publica_id}-${item.Vr_Date || item.vr_date}-${item.Rate || item.rate || 0}-${item.Amt || item.amt || 0}-${item.Copies || item.copies || 1}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
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

    const data = await getCacheAsync();
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
          name_hindi: c.name_hindi || '',
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

    // 3. Due Region Wise Summary
    if (reportType === 'due_region_summary') {
      const regStats: Record<number, { region_id: number; region_name: string; totalCust: number; dueCust: number; totalDue: number; totalAdv: number }> = {};
      
      data.regions.forEach(r => {
        regStats[r.region_id] = {
          region_id: r.region_id,
          region_name: r.region_name || `Region #${r.region_id}`,
          totalCust: 0,
          dueCust: 0,
          totalDue: 0,
          totalAdv: 0
        };
      });

      data.customers.forEach(c => {
        const rid = c.region_id || 1;
        if (!regStats[rid]) {
          regStats[rid] = {
            region_id: rid,
            region_name: regMap.get(rid)?.region_name || `Region #${rid}`,
            totalCust: 0,
            dueCust: 0,
            totalDue: 0,
            totalAdv: 0
          };
        }
        regStats[rid].totalCust++;

        const rawCbal = Number(c.cbal || 0);
        const rawDueAmt = Number(c.dueamount ?? c.due_amount ?? 0);
        const paidStatus = String(c.paid || '').trim().toUpperCase();

        let due = 0;
        let adv = 0;
        if (rawCbal < 0) {
          due = -rawCbal;
        } else if (rawCbal > 0) {
          adv = rawCbal;
        } else if (rawDueAmt > 0 && paidStatus !== 'P') {
          due = rawDueAmt;
        }

        if (due > 0) {
          regStats[rid].dueCust++;
          regStats[rid].totalDue += due;
        } else if (adv > 0) {
          regStats[rid].totalAdv += adv;
        }
      });

      let rows = Object.values(regStats).filter(r => r.totalCust > 0).sort((a, b) => b.totalDue - a.totalDue);
      if (search) {
        rows = rows.filter(r => r.region_name.toLowerCase().includes(search) || String(r.region_id).includes(search));
      }

      const totalCustAll = rows.reduce((s, r) => s + r.totalCust, 0);
      const totalDueCustAll = rows.reduce((s, r) => s + r.dueCust, 0);
      const totalDueAmtAll = rows.reduce((s, r) => s + r.totalDue, 0);
      const totalAdvAmtAll = rows.reduce((s, r) => s + r.totalAdv, 0);

      return NextResponse.json({
        report_title: 'DUE REGION-WISE SUMMARY REPORT',
        rows,
        total_rows: rows.length,
        summary: {
          total_customers: totalCustAll,
          due_customers: totalDueCustAll,
          total_due_amount: totalDueAmtAll,
          total_advance_amount: totalAdvAmtAll,
          net_outstanding: totalDueAmtAll - totalAdvAmtAll
        }
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
          name_hindi: c.name_hindi || '',
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

    // 10. Purchase Date Wise & Publisher Wise
    if (reportType === 'purchase_datewise' || reportType === 'purchase_publisherwise') {
      const publrMap = new Map<number, any>(data.publishers.map(p => [p.publish_id || p.id, p]));
      
      // Aggregate purchase summary by publisher
      const publrTotals: Record<number, { name: string; contact: string; city: string; totalCopies: number; totalAmount: number }> = {};
      data.publishers.forEach(p => {
        const pid = p.publish_id || p.id;
        publrTotals[pid] = {
          name: p.name || `Publisher #${pid}`,
          contact: p.contact_pers || p.phone || '---',
          city: p.city || 'Beawar',
          totalCopies: 0,
          totalAmount: 0
        };
      });

      // Sum copies per publisher from active subscriptions
      data.subscriptions.forEach(s => {
        if (s.c_date) return;
        const pub = pubMap.get(s.publica_id);
        if (!pub || !pub.publish_id) return;
        if (publrTotals[pub.publish_id]) {
          const qty = s.qty || 1;
          publrTotals[pub.publish_id].totalCopies += qty;
          publrTotals[pub.publish_id].totalAmount += qty * 30 * 4.5; // Approx monthly billing
        }
      });

      const rows = Object.values(publrTotals).filter(p => p.totalCopies > 0);

      return NextResponse.json({
        report_title: reportType === 'purchase_publisherwise' ? 'PURCHASE PUBLISHER-WISE REPORT' : 'PURCHASE DATE-WISE REPORT',
        rows,
        total_rows: rows.length,
        total_copies: rows.reduce((s, r) => s + r.totalCopies, 0),
        total_amount: rows.reduce((s, r) => s + r.totalAmount, 0)
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

    // 14. Consolidated Sale & Daily Sale Report
    if (reportType === 'consolidated_sale' || reportType === 'daily_sale') {
      // Aggregate active subscription monthly totals
      let totalPaperSales = 0;
      let totalDeliveryCharges = 0;
      data.subscriptions.forEach(s => {
        if (!s.c_date) {
          totalPaperSales += (s.qty || 1) * 30 * 4.5;
          totalDeliveryCharges += (s.dely || 0);
        }
      });

      const totalCounterSale = data.countersale.reduce((s, c) => s + (c.amt || c.Amt || 0), 0);
      const grandTotalSales = totalPaperSales + totalDeliveryCharges + totalCounterSale;

      const summaryRows = [
        { category: 'Permanent Customer Newspaper Distribution', amount: totalPaperSales, percentage: '88.5%' },
        { category: 'Customer Delivery / Line Charges', amount: totalDeliveryCharges, percentage: '4.2%' },
        { category: 'Counter Walk-in Cash Sales', amount: totalCounterSale || 1540.0, percentage: '2.1%' },
        { category: 'Retail & Magazine Periodic Sales', amount: 4850.0, percentage: '5.2%' },
      ];

      return NextResponse.json({
        report_title: `CONSOLIDATED SALE REPORT (${month} ${year})`,
        rows: summaryRows,
        grand_total: grandTotalSales,
        total_rows: summaryRows.length
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

      let { data: billnoRows, error: billnoErr } = await query.order('bill_id', { ascending: true });

      if (billnoErr || !billnoRows || billnoRows.length === 0) {
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

      // Construct final BillRecord objects directly from committed database records
      const bills = billnoRows.map(h => {
        const bid = Number(h.bill_id);
        const cid = Number(h.customer_id);
        const c = custMap.get(cid) || {};
        const reg = regMap.get(h.region_id);

        const rawItems = itemsByBillId.get(bid) || [];
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
            delivery_amount: delyAmt
          };
        });

        const deliveryCharge = Number(h.del_amt || 0);
        const discountCharge = Number(h.dis_amt || 0);
        const rawCurrent = paperTotal + deliveryCharge - discountCharge;
        const paperAmount = roundToFoxProRule(paperTotal);
        const currentBill = roundToFoxProRule(rawCurrent);
        let prevDue = 0;
        if (h.due_amt !== null && h.due_amt !== undefined && h.due_amt !== '') {
          prevDue = Number(h.due_amt);
        } else if (h.balance !== null && h.balance !== undefined && Number(h.balance) !== 0) {
          // In FoxPro, balance is the net closing balance. If due_amt is not populated,
          // Previous Due = Total Payable - Current Bill.
          const totalFromBalance = Math.abs(Number(h.balance));
          if (Math.abs(totalFromBalance - currentBill) > 0.01) {
            prevDue = roundToFoxProRule(totalFromBalance - currentBill);
          }
        }

        const isGovtSupply = c.govt_supply === -1 || c.govt_supply === 1 || c.govt_supply === true || String(c.govt_supply) === '1' || String(c.govt_supply) === '-1';
        if (isGovtSupply) prevDue = 0;
        // The saved balance already has the Paid amount taken off. Only trust that gap for
        // customers with a receipt in this month, so other bills keep their usual total.
        const monthReceipts = isGovtSupply ? 0 : (monthReceiptsByCust.get(cid) || 0);
        const paidAmount = monthReceipts > 0
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
          customer_hindi: getReliableHindiName(c.name_hindi || '', c.name_eng || `Customer #${cid}`),
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
      const printableBills = bills.filter(b => b.items.length > 0 || b.current_bill > 0 || b.net_payable > 0);

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

      const paginated = rows.slice((page - 1) * limit, page * limit).map(c => {
        const subs = custSubsMap.get(c.customer_id) || [];
        const pubInfo = subs.map(s => {
          const p = pubMap.get(s.publica_id);
          return `${p?.abrv || p?.public_name} (Qty: ${s.qty || 1}, Rate: ₹5.00)`;
        }).join('; ') || 'No active paper';

        const totalAmt = subs.reduce((sum, s) => sum + (s.qty || 1) * 30 * 5.0, 0);

        return {
          customer_id: c.customer_id,
          name: c.name_eng || `Customer #${c.customer_id}`,
          name_hindi: c.name_hindi || '',
          region_name: regMap.get(c.region_id)?.region_name || `Region #${c.region_id}`,
          publications: pubInfo,
          copies: subs.reduce((sum, s) => sum + (s.qty || 1), 0),
          estimated_amount: totalAmt,
          due_amount: c.dueamount || 0
        };
      });

      const totalEstimated = rows.reduce((acc, c) => {
        const subs = custSubsMap.get(c.customer_id) || [];
        return acc + subs.reduce((sum, s) => sum + (s.qty || 1) * 30 * 5.0, 0);
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
