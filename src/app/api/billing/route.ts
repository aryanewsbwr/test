import { NextRequest, NextResponse } from 'next/server';
import { fetchPublications, fetchRegions } from '@/lib/publicationsData';
import { replaceMonthBills } from '@/lib/billCommit';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';
import { calculateBilling, MONTH_NAMES, parseLegacyDateToIso } from '@/lib/billingEngine';
import { getReliableHindiName } from '@/lib/transliteration';

export const dynamic = 'force-dynamic';

let cachedCusts: any[] | null = null;
let cachedRates: any[] | null = null;
let cachedPubs: any[] | null = null;
let cachedBills: any[] | null = null;
let cachedReceipts: any[] | null = null;
let cachedPubDis: any[] | null = null;
let cachedAllSubs: any[] | null = null;

function loadJson(filename: string): any[] {
  const tmpPath = path.join(os.tmpdir(), filename);
  if (fs.existsSync(tmpPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {}
  }
  const srcF = path.join(process.cwd(), 'src', 'data', filename);
  if (fs.existsSync(srcF)) {
    try {
      return JSON.parse(fs.readFileSync(srcF, 'utf-8'));
    } catch {}
  }
  const f = path.join(process.cwd(), 'public', 'data', filename);
  if (fs.existsSync(f)) {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

async function fetchAllFromSupabase(table: string): Promise<any[]> {
  try {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    const total = count || 0;
    if (total === 0) return [];
    const ranges: number[] = [];
    for (let from = 0; from < total; from += 1000) ranges.push(from);
    const promises = ranges.map(from => supabase.from(table).select('*').range(from, from + 999));
    const results = await Promise.all(promises);
    return results.flatMap(r => r.data || []);
  } catch (err) {
    console.error(`Error in fetchAllFromSupabase for ${table}:`, err);
    return [];
  }
}

// Rates, rate changes, holidays and discontinues are read fresh for every run, so an entry
// made today counts straight away. A failed read stops the run instead of billing old data.
async function getRates(): Promise<any[]> {
  const rows = await fetchEveryRow('rate', '*', 'id');
  return rows.map((r: any) => ({
    publica_id: r.publica_id,
    dayofweek: r.dayofweek,
    rate: Number(r.rate)
  }));
}

async function getRateChanges(): Promise<any[]> {
  const rows = await fetchEveryRow('ratechange', '*', 'id');
  return rows.map((r: any) => {
    const effD = (r.effective_date || '').split('T')[0];
    return {
      publica_id: r.publica_id,
      dayofweek: r.dayofweek,
      oldrate: Number(r.oldrate ?? 0),
      new_rate: Number(r.newrate ?? 0),
      dated: effD,
      effective_date: effD
    };
  });
}

async function getDiscontinues(): Promise<any[]> {
  const [mainRows, extraRows] = await Promise.all([
    fetchEveryRow('discontinue', '*', 'discontinue_id'),
    fetchEveryRow('customer_discontinue', '*', 'id')
  ]);

  // The tables have no subscription dates, so those still come from the original import
  const localMap = new Map<string, any>();
  for (const ld of loadJson('discontinues.json') || []) {
    if (ld.discontinue_id) localMap.set(`id-${ld.discontinue_id}`, ld);
    localMap.set(`${ld.customer_id}-${ld.publica_id}-${ld.temp_from}`, ld);
  }
  return [...mainRows, ...extraRows].map((d: any) => {
    const match = localMap.get(`id-${d.discontinue_id}`) || localMap.get(`${d.customer_id}-${d.publica_id}-${d.temp_from}`);
    return match ? { ...d, s_date: d.s_date || match.s_date, c_date: d.c_date || match.c_date } : d;
  });
}

// Regions starting with Z are not billed in All Regions. Pick one directly to bill it.
async function dropHiddenRegions(custs: any[]): Promise<any[]> {
  const regions = await fetchRegions();
  const hidden = new Set(regions.filter(r => /^\s*z/i.test(String(r.region_name || r.name || ''))).map(r => Number(r.region_id)));
  return custs.filter(c => !hidden.has(Number(c.region_id || c.Region_id)));
}

async function getCustomers(regionId?: string | number): Promise<any[]> {
  // 1. If regionId is specified (and not 'all'), fetch directly from Supabase first
  if (regionId && regionId !== 'all') {
    try {
      const rId = parseInt(String(regionId), 10);
      const { data: supaCusts, error } = await supabase
        .from('customer')
        .select('*')
        .eq('region_id', rId);
      if (!error && supaCusts && supaCusts.length > 0) {
        return supaCusts;
      }
    } catch (e) {
      console.warn('Supabase fetch error for region customers:', e);
    }
  }

  // 2. Check in-memory cache
  if (cachedCusts && cachedCusts.length > 0) return cachedCusts;

  // 3. Check local JSON files
  cachedCusts = loadJson('all_customers.json');
  if (cachedCusts && cachedCusts.length > 0) return cachedCusts;

  // 4. Fallback: Fetch all from Supabase
  try {
    const supaAll = await fetchAllFromSupabase('customer');
    if (supaAll && supaAll.length > 0) {
      cachedCusts = supaAll;
      return cachedCusts;
    }
  } catch (err) {
    console.error('Error fetching all customers from Supabase:', err);
  }

  return [];
}

function getAllSubscriptions(): any[] {
  if (cachedAllSubs && cachedAllSubs.length > 0) return cachedAllSubs;
  cachedAllSubs = loadJson('all_subscriptions.json');
  return cachedAllSubs || [];
}

async function getActiveCustomerIds(targetCustIds: number[], month: string, year: number | string, fySuffix: string): Promise<Set<number>> {
  const allRetail = loadJson('retailsale.json') || [];

  const targetMonthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === month.toLowerCase() || m.toLowerCase().startsWith(month.toLowerCase().slice(0, 3)));
  const actualMonthIdx = targetMonthIdx >= 0 ? targetMonthIdx : 9; // default October
  const actualMonthNum = actualMonthIdx + 1;
  const startYr = parseInt(String(year).slice(0, 4), 10) || 2026;
  const calYr = actualMonthIdx >= 3 ? startYr : startYr + 1;
  const daysInM = new Date(calYr, actualMonthIdx + 1, 0).getDate();
  const mStartIso = `${calYr}-${String(actualMonthNum).padStart(2, '0')}-01`;

  // Determine prior month in financial year cycle
  const priorMonthName = actualMonthIdx > 0 ? MONTH_NAMES[actualMonthIdx - 1] : 'March';
  const priorMonthShort = priorMonthName.slice(0, 4);

  const activeCustSet = new Set<number>();

  // Single Region or targeted customers (chunk by 100 for reliable Supabase queries)
  const CHUNK_SIZE = 100;
  for (let i = 0; i < targetCustIds.length; i += CHUNK_SIZE) {
    const chunk = targetCustIds.slice(i, i + CHUNK_SIZE);
    try {
      const [cdRes, billRes] = await Promise.all([
        supabase
          .from('customer_detail')
          .select('customer_id, s_date, c_date')
          .in('customer_id', chunk),
        supabase
          .from(`billno${fySuffix}`)
          .select('customer_id, balance')
          .in('customer_id', chunk)
          .or(`month.ilike.${priorMonthName},month.ilike.${priorMonthShort}%`)
      ]);

      if (cdRes.data && cdRes.data.length > 0) {
        for (const s of cdRes.data) {
          const cDateIso = parseLegacyDateToIso(s.c_date);
          if (!cDateIso || cDateIso >= mStartIso) {
            activeCustSet.add(Number(s.customer_id));
          }
        }
      }

      if (billRes.data && billRes.data.length > 0) {
        for (const b of billRes.data) {
          if (b.balance !== null && Number(b.balance) !== 0) {
            activeCustSet.add(Number(b.customer_id));
          }
        }
      }
    } catch (err) {
      console.error('Error fetching active customer details in getActiveCustomerIds:', err);
    }
  }

  for (const rs of allRetail) {
    activeCustSet.add(Number(rs.customer_id || rs.Customer_id));
  }
  return activeCustSet;
}

async function getHolidays(): Promise<any[]> {
  return fetchEveryRow('holiday', '*', 'id');
}

async function getPublicationDiscontinues(): Promise<any[]> {
  const localPubDis = loadJson('publicationdis.json') || [];
  try {
    const { data, error } = await supabase.from('publicationdis').select('*');
    // The database is the only live list: merging the file would bring back ended stops
    if (!error && data && data.length > 0) return data;
  } catch (err) {
    // fallback
  }
  return localPubDis;
}

async function getSupplements(): Promise<any[]> {
  try {
    const { data, error } = await supabaseAdmin.storage.from('news-images').download('data/pubsupplements.json');
    if (!error && data) {
      const text = await data.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Supabase storage download error in billing:', err);
  }

  const localList = loadJson('pubsupplements.json') || [];
  return localList;
}



async function getMaxBillId(fySuffix: string): Promise<number> {
  try {
    const { data } = await supabase
      .from(`billno${fySuffix}`)
      .select('bill_id')
      .order('bill_id', { ascending: false })
      .limit(1);
    if (data && data.length > 0 && data[0].bill_id) {
      return Number(data[0].bill_id);
    }
  } catch (_) {}
  return 1000;
}

async function fetchSubscriptions(customerIds: number[]): Promise<any[]> {
  if (customerIds.length === 0) return [];

  const CHUNK_SIZE = 100;
  const result: any[] = [];

  // Query customer_detail directly from Supabase in safe 100-customer chunks
  for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
    const chunk = customerIds.slice(i, i + CHUNK_SIZE);
    try {
      const { data: cdSubs, error } = await supabase
        .from('customer_detail')
        .select('*')
        .in('customer_id', chunk)
        .limit(1000);
      if (error) throw error;
      if (cdSubs && cdSubs.length > 0) {
        result.push(...cdSubs);
      }
    } catch (err: any) {
      console.error('Error fetching customer_detail chunk:', err);
      throw new Error(`Could not read subscriptions: ${err.message}`);
    }
  }

  return result;
}

// Reads the whole table however large it grows. Sorted so pages never overlap, and a failed
// page throws because a missing receipt would silently inflate Previous Due.
async function fetchEveryRow(table: string, columns: string, orderBy: string): Promise<any[]> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  const ranges: number[] = [];
  for (let from = 0; from < (count || 0); from += 1000) ranges.push(from);
  const results = await Promise.all(
    ranges.map(from => supabase.from(table).select(columns).order(orderBy, { ascending: true }).range(from, from + 999))
  );
  const failed = results.find(r => r.error);
  if (failed) throw failed.error;
  return results.flatMap(r => r.data || []);
}

async function fetchBillsAndReceipts(customerIds: number[], fySuffix: string) {
  if (customerIds.length === 0) return { bills: [], billHeaders: [], receipts: [] };

  // When querying all customers (> 500), load entire FY ledger in parallel ranges!
  if (customerIds.length > 500) {
    try {
      const [receipts, bills, billHeaders] = await Promise.all([
        fetchEveryRow(`receipt${fySuffix}`, 'customer_id, month, mal_recp_amt, less_amt, recp_no, recp_date', 'id'),
        fetchEveryRow(`bill${fySuffix}`, 'bill_id, customer_id, publica_id, qty, rate, total_amt, month', 'id'),
        fetchEveryRow(`billno${fySuffix}`, 'bill_id, customer_id, due_amt, del_amt, dis_amt, month, balance', 'bill_id')
      ]);

      return { receipts, bills, billHeaders };
    } catch (e) {
      console.error('Error in parallel fetchBillsAndReceipts:', e);
    }
  }

  // Safe chunk size (40 customers) ensures that line items never exceed Supabase's hard 1,000 max_rows limit
  const CHUNK_SIZE = 40;
  const allBills: any[] = [];
  const allBillHeaders: any[] = [];
  const allReceipts: any[] = [];

  for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
    const chunk = customerIds.slice(i, i + CHUNK_SIZE);
    const [headerRes, itemsRes, receiptRes] = await Promise.all([
      supabase.from(`billno${fySuffix}`).select('*').in('customer_id', chunk).limit(1000),
      supabase.from(`bill${fySuffix}`).select('*').in('customer_id', chunk).limit(1000),
      supabase.from(`receipt${fySuffix}`).select('*').in('customer_id', chunk).limit(1000)
    ]);
    const failed = headerRes.error || itemsRes.error || receiptRes.error;
    if (failed) throw new Error(`Could not read bills and receipts: ${failed.message}`);
    allBillHeaders.push(...(headerRes.data || []));
    allBills.push(...(itemsRes.data || []));
    allReceipts.push(...(receiptRes.data || []));
  }
  return { bills: allBills, billHeaders: allBillHeaders, receipts: allReceipts };
}

async function fetchRetailSales(customerIds: number[], fySuffix: string): Promise<any[]> {
  if (customerIds.length === 0) return [];
  const localSales = loadJson('retailsale.json');
  const matchingLocal = (localSales || []).filter((s: any) => {
    const cid = Number(s.Customer_id || s.customer_id);
    return customerIds.includes(cid);
  });

  const matchingDb: any[] = [];
  try {
    const CHUNK_SIZE = 250;
    for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
      const chunk = customerIds.slice(i, i + CHUNK_SIZE);
      const { data: tblData } = await supabase
        .from(`retailsale${fySuffix}`)
        .select('*')
        .in('customer_id', chunk)
        .limit(50000);

      if (tblData && tblData.length > 0) {
        matchingDb.push(...tblData.map((r: any) => ({
          Retail_id: r.retail_id || r.Retail_id || r.sale_id,
          Vr_Date: r.vr_date || r.Vr_Date || r.dated || r.Dated,
          Customer_id: Number(r.customer_id || r.Customer_id),
          Publica_id: Number(r.publica_id || r.Publica_id),
          Copies: Number(r.copies || r.Copies || 1),
          Rate: Number(r.rate !== undefined && r.rate !== null ? r.rate : (r.Rate || 0)),
          Amt: r.amt !== undefined && r.amt !== null ? Number(r.amt) : (r.Amt !== undefined && r.Amt !== null ? Number(r.Amt) : (r.amount || 0)),
          Narr: r.narr || r.Narr || r.narration || ''
        })));
      }
    }
  } catch (_) {}

  const seen = new Set<string>();
  const merged: any[] = [];
  for (const item of [...matchingLocal, ...matchingDb]) {
    const cid = Number(item.Customer_id || item.customer_id);
    const pid = Number(item.Publica_id || item.publica_id);
    const vDate = item.Vr_Date || item.vr_date || item.dated || item.Dated || '';
    const rate = Number(item.Rate !== undefined && item.Rate !== null ? item.Rate : (item.rate || 0));
    const amt = Number(item.Amt !== undefined && item.Amt !== null ? item.Amt : (item.amt !== undefined && item.amt !== null ? item.amt : (item.amount || 0)));
    const copies = Number(item.Copies || item.copies || 1);
    const rId = item.Retail_id || item.retail_id || item.sale_id || '';

    const key = `${cid}_${pid}_${vDate}_${copies}_${rate}_${amt}_${rId}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({
        Retail_id: rId ? Number(rId) : undefined,
        Vr_Date: vDate,
        Customer_id: cid,
        Publica_id: pid,
        Copies: copies,
        Rate: rate,
        Amt: amt,
        Narr: item.Narr || item.narr || item.narration || ''
      });
    }
  }
  return merged;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || 'August';
    const year = searchParams.get('year') || '2026';
    const regionId = searchParams.get('region_id') || 'all';
    const customerIdStr = searchParams.get('customer_id');
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '200', 10);

    // Fetch core reference datasets directly from Supabase
    const [rates, ratechanges, pubs, discontinues, regions] = await Promise.all([
      getRates(),
      getRateChanges(),
      fetchPublications(),
      getDiscontinues(),
      fetchRegions()
    ]);

    // Determine fiscal year suffix (e.g. 20252026)
    let fySuffix = '20252026';
    const yStr = String(year);
    if (yStr.length === 8) {
      fySuffix = yStr;
    } else {
      const startY = parseInt(yStr, 10) || 2025;
      fySuffix = `${startY}${startY + 1}`;
    }

    // If single customer queried (for Breakup / Slip): Instant calculation
    if (customerIdStr) {
      const cid = parseInt(customerIdStr, 10);
      let targetCust = (cachedCusts || []).find(c => (c.customer_id || c.Customer_id) === cid);
      if (!targetCust) {
        const { data: dbCust } = await supabase.from('customer').select('*').eq('customer_id', cid).single();
        if (dbCust) targetCust = dbCust;
      }
      const targetCusts = targetCust ? [targetCust] : [];

      const [custSubs, { bills: liveCustBills, billHeaders: liveCustBillHeaders, receipts: liveCustReceipts }, pubDis, liveRetail, maxBillId, liveHolidays, liveSupps] = await Promise.all([
        fetchSubscriptions([cid]),
        fetchBillsAndReceipts([cid], fySuffix),
        getPublicationDiscontinues(),
        fetchRetailSales([cid], fySuffix),
        getMaxBillId(fySuffix),
        getHolidays(),
        getSupplements()
      ]);

      const singleResult = calculateBilling({
        monthName: month,
        year: year,
        regionId: 'all',
        customers: targetCusts,
        subscriptions: custSubs,
        rates: rates,
        ratechanges: ratechanges,
        publications: pubs,
        holidays: liveHolidays,
        discontinues: discontinues,
        publicationDiscontinues: pubDis,
        bills: liveCustBills,
        billHeaders: liveCustBillHeaders,
        receipts: liveCustReceipts,
        regions: regions,
        retailSales: liveRetail,
        supplements: liveSupps,
        startBillId: maxBillId + 1
      });

      const singleBill = singleResult.bills[0] || null;
      if (singleBill) {
        singleBill.customer_hindi = getReliableHindiName(singleBill.customer_hindi, singleBill.name_eng);
      }
      const singleBreakup = (singleResult.breakup_lines || []).map(bl => ({
        ...bl,
        customer_hindi: getReliableHindiName(bl.customer_hindi || '', bl.name_eng)
      }));

      return NextResponse.json({
        customer_id: cid,
        bill: singleBill,
        breakup: singleBreakup
      });
    }

    let targetCusts = await getCustomers(regionId);

    // Filter by region
    if (regionId && regionId !== 'all') {
      const rId = parseInt(regionId, 10);
      targetCusts = targetCusts.filter(c => (c.region_id || c.Region_id) === rId);
    } else {
      targetCusts = await dropHiddenRegions(targetCusts);
    }

    // Filter by search text
    if (search) {
      targetCusts = targetCusts.filter(c => 
        String(c.name_eng || c.Name_eng || '').toLowerCase().includes(search) ||
        String(c.name_hindi || c.Name_hindi || '').toLowerCase().includes(search) ||
        String(c.customer_id || c.Customer_id || '') === search ||
        String(c.customer_id || c.Customer_id || '').includes(search) ||
        String(c.phone || '').includes(search) ||
        String(c.add1 || '').toLowerCase().includes(search) ||
        String(c.hindi_add || '').toLowerCase().includes(search)
      );
    } else {
      // In FoxPro monthly delivery billing, only active delivery customers receive bills.
      // Filter out discontinued / closed customers with 0 current deliveries.
      const candidateIds = targetCusts.map(c => Number(c.customer_id || c.Customer_id));
      const activeCustSet = await getActiveCustomerIds(candidateIds, month, year, fySuffix);
      targetCusts = targetCusts.filter(c => activeCustSet.has(Number(c.customer_id || c.Customer_id)));
    }

    // Sort target customers strictly by customer_id ascending
    targetCusts.sort((a, b) => {
      const idA = Number(a.customer_id || a.Customer_id || 0);
      const idB = Number(b.customer_id || b.Customer_id || 0);
      return idA - idB;
    });

    const totalCustCount = targetCusts.length;
    // Paginate target customers for instant response
    const paginatedCusts = targetCusts.slice((page - 1) * limit, page * limit);
    const paginatedCustIds = paginatedCusts.map(c => c.customer_id || c.Customer_id);

    const [paginatedSubs, { bills: liveCustBills, billHeaders: liveCustBillHeaders, receipts: liveCustReceipts }, pubDis, dbBatchRetail, maxBillId, liveHolidays, liveSupps] = await Promise.all([
      fetchSubscriptions(paginatedCustIds),
      fetchBillsAndReceipts(paginatedCustIds, fySuffix),
      getPublicationDiscontinues(),
      fetchRetailSales(paginatedCustIds, fySuffix),
      getMaxBillId(fySuffix),
      getHolidays(),
      getSupplements()
    ]);

    const result = calculateBilling({
      monthName: month,
      year: year,
      regionId: regionId,
      customers: paginatedCusts,
      subscriptions: paginatedSubs,
      rates: rates,
      ratechanges: ratechanges,
      publications: pubs,
      holidays: liveHolidays,
      discontinues: discontinues,
      publicationDiscontinues: pubDis,
      bills: liveCustBills,
      billHeaders: liveCustBillHeaders,
      receipts: liveCustReceipts,
      regions: regions,
      retailSales: dbBatchRetail,
      supplements: liveSupps,
      startBillId: maxBillId + 1 + (page - 1) * limit
    });

    // Strip heavy breakup arrays from list view for maximum speed
    const lightweightBills = result.bills.map(b => ({
      bill_no: b.bill_no,
      customer_id: b.customer_id,
      name_eng: b.name_eng,
      customer_hindi: getReliableHindiName(b.customer_hindi, b.name_eng),
      region_name: b.region_name,
      previous_due: b.previous_due,
      paper_amount: b.paper_amount,
      delivery_amount: b.delivery_amount,
      discount_amount: b.discount_amount,
      paid_this_month: b.paid_this_month,
      total_payable: b.total_payable,
      month: b.month,
      year: b.year
    }));

    return NextResponse.json({
      month: month,
      year: year,
      page: page,
      limit: limit,
      total_customers: totalCustCount,
      total_bills: lightweightBills.length,
      grand_total: result.grand_total,
      bills: lightweightBills
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const refused = await refuseWithout(request, 'can_billing');
  if (refused) return refused;

  try {
    const body = await request.json();
    const { month = 'August', year = '2026', region_id = 'all', commitToDb = false } = body;

    let targetCusts = await getCustomers(region_id);
    if (region_id && region_id !== 'all') {
      const rId = parseInt(region_id, 10);
      targetCusts = targetCusts.filter(c => (c.region_id || c.Region_id) === rId);
    } else {
      targetCusts = await dropHiddenRegions(targetCusts);
    }

    // Determine fiscal year suffix (e.g. 20252026)
    let fySuffix = '20252026';
    const yStr = String(year);
    if (yStr.length === 8) {
      fySuffix = yStr;
    } else {
      const startY = parseInt(yStr, 10) || 2025;
      fySuffix = `${startY}${startY + 1}`;
    }
    // In FoxPro monthly delivery billing, only active delivery customers receive bills.
    // Filter out discontinued / closed customers with 0 current deliveries.
    const candidateIds = targetCusts.map(c => Number(c.customer_id || c.Customer_id));
    const activeCustSet = await getActiveCustomerIds(candidateIds, month, year, fySuffix);
    targetCusts = targetCusts.filter(c => activeCustSet.has(Number(c.customer_id || c.Customer_id)));

    // Sort target customers strictly by customer_id ascending
    targetCusts.sort((a, b) => {
      const idA = Number(a.customer_id || a.Customer_id || 0);
      const idB = Number(b.customer_id || b.Customer_id || 0);
      return idA - idB;
    });

    const targetCustIds = targetCusts.map(c => c.customer_id || c.Customer_id);

    const [targetSubs, { bills: liveCustBills, billHeaders: liveCustBillHeaders, receipts: liveCustReceipts }, pubDis, dbBatchRetail, maxBillId, liveHolidays, rates, ratechanges, pubs, discontinues, regions, liveSupps] = await Promise.all([
      fetchSubscriptions(targetCustIds),
      fetchBillsAndReceipts(targetCustIds, fySuffix),
      getPublicationDiscontinues(),
      fetchRetailSales(targetCustIds, fySuffix),
      getMaxBillId(fySuffix),
      getHolidays(),
      getRates(),
      getRateChanges(),
      fetchPublications(),
      getDiscontinues(),
      fetchRegions(),
      getSupplements()
    ]);

    const result = calculateBilling({
      monthName: month,
      year: year,
      regionId: region_id,
      customers: targetCusts,
      subscriptions: targetSubs,
      rates: rates,
      ratechanges: ratechanges,
      publications: pubs,
      holidays: liveHolidays,
      discontinues: discontinues,
      publicationDiscontinues: pubDis,
      bills: liveCustBills,
      billHeaders: liveCustBillHeaders,
      receipts: liveCustReceipts,
      regions: regions,
      retailSales: dbBatchRetail,
      supplements: liveSupps,
      startBillId: maxBillId + 1
    });

    // If commit to live Supabase DB is requested:
    let savedToSupabase = false;
    let savedBillnoCount = 0;
    let savedBillItemsCount = 0;

    if (commitToDb && supabase) {
      const billnoTable = `billno${fySuffix}`;
      const billTable = `bill${fySuffix}`;
      const billdelTable = `billdel${fySuffix}`;

      // Extract all DB rows normalized to lowercase column names for PostgreSQL
      const billnoRows = result.bills.map(b => {
        const item = b.db_billno_item;
        if (!item) return null;
        return {
          bill_id: item.bill_id ?? item.Bill_id,
          customer_id: item.customer_id ?? item.Customer_id,
          region_id: item.region_id ?? item.Region_id,
          due_amt: item.due_amt ?? item.Due_Amt,
          del_amt: item.del_amt ?? item.Del_Amt,
          dis_amt: item.dis_amt ?? item.Dis_Amt,
          month: item.month ?? item.Month,
          year: String(item.year ?? item.Year ?? '2026'),
          balance: item.balance ?? item.Balance ?? 0
        };
      }).filter(Boolean);

      const billRows = result.bills.flatMap(b => b.db_bill_items || []).map((item: any) => {
        if (!item) return null;
        return {
          bill_id: item.bill_id ?? item.Bill_id,
          customer_id: item.customer_id ?? item.Customer_id,
          publica_id: item.publica_id ?? item.Publica_id,
          region_id: item.region_id ?? item.Region_id,
          qty: item.qty ?? item.Qty,
          rate: item.rate ?? item.Rate,
          d_charges: item.d_charges ?? item.D_Charges,
          total_amt: item.total_amt ?? item.TotalAmt,
          month: item.month ?? item.Month,
          year: String(item.year ?? item.Year ?? '2026'),
          sno: item.sno ?? item.Sno
        };
      }).filter(Boolean);

      const billdelRows = result.bills.flatMap(b => b.db_billdel_items || []).map((item: any) => {
        if (!item) return null;
        return {
          customer_id: item.customer_id ?? item.Customer_id,
          region_id: item.region_id ?? item.Region_id,
          publica_id: item.publica_id ?? item.Publica_id,
          month: item.month ?? item.Month,
          year: String(item.year ?? item.Year ?? '2026'),
          dely: item.dely ?? item.Dely,
          sno: item.sno ?? item.Sno
        };
      }).filter(Boolean);

      await replaceMonthBills(
        supabase,
        { billno: billnoTable, bill: billTable, billdel: billdelTable },
        month,
        targetCustIds.map(Number),
        { headers: billnoRows, lines: billRows, deliveries: billdelRows }
      );

      // Update customer cbal for single or small region runs without blocking batch execution
      if (result.bills.length <= 100) {
        for (let i = 0; i < result.bills.length; i += 50) {
          const chunk = result.bills.slice(i, i + 50);
          await Promise.all(
            chunk.map(b =>
              supabase.from('customer').update({ cbal: -b.total_payable }).eq('customer_id', b.customer_id)
            )
          );
        }
      }

      savedToSupabase = true;
      savedBillnoCount = billnoRows.length;
      savedBillItemsCount = billRows.length;
    }

    return NextResponse.json({
      success: true,
      month: result.month,
      year: result.year,
      total_customers: targetCusts.length,
      total_bills_generated: result.bills.length,
      grand_total: result.grand_total,
      saved_to_supabase: savedToSupabase,
      saved_billno_count: savedBillnoCount,
      saved_bill_items_count: savedBillItemsCount
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
