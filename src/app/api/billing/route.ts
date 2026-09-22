import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { supabase } from '@/lib/supabaseClient';
import { calculateBilling } from '@/lib/billingEngine';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';

export const dynamic = 'force-dynamic';

let cachedCusts: any[] | null = null;
let cachedRates: any[] | null = null;
let cachedRateChanges: any[] | null = null;
let cachedPubs: any[] | null = null;
let cachedHolidays: any[] | null = null;
let cachedDiscontinues: any[] | null = null;
let cachedBills: any[] | null = null;
let cachedReceipts: any[] | null = null;
let cachedRegions: any[] | null = null;
let cachedPubDis: any[] | null = null;

function loadLocalDatasets() {
  const loadJson = (filename: string) => {
    const f = path.join(process.cwd(), 'public', 'data', filename);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
    return [];
  };

  if (!cachedCusts) cachedCusts = loadJson('all_customers.json');
  if (!cachedRates) cachedRates = loadJson('rates.json');
  if (!cachedRateChanges) cachedRateChanges = loadJson('ratechanges.json');
  if (!cachedPubs) cachedPubs = loadJson('publications.json');
  if (!cachedHolidays) cachedHolidays = loadJson('holidays.json');
  if (!cachedDiscontinues) cachedDiscontinues = loadJson('discontinues.json');
  if (!cachedBills) cachedBills = loadJson('all_bills.json');
  if (!cachedReceipts) cachedReceipts = loadJson('all_receipts.json');
  if (!cachedRegions) cachedRegions = loadJson('regions.json');
}

async function getPublicationDiscontinues(): Promise<any[]> {
  if (cachedPubDis) return cachedPubDis;
  try {
    const { data } = await supabase.from('publicationdis').select('*');
    if (data && data.length > 0) cachedPubDis = data;
  } catch (err) {
    console.error('Failed to fetch publicationdis:', err);
  }
  return cachedPubDis || [];
}

async function fetchSubscriptions(customerIds: number[]): Promise<any[]> {
  if (customerIds.length === 0) return [];

  // Query authoritative customer_detailback in safe chunks of 200
  const CHUNK_SIZE = 200;
  const backSubs: any[] = [];
  for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
    const chunk = customerIds.slice(i, i + CHUNK_SIZE);
    const { data } = await supabase
      .from('customer_detailback')
      .select('*')
      .in('Customer_id', chunk);
    if (data) backSubs.push(...data);
  }

  const parseD = (d: any, t: any) => {
    if (!d) return 0;
    const p = String(d).split('/');
    if (p.length !== 3) return 0;
    const tp = String(t || '00:00').split(':');
    return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]), Number(tp[0]) || 0, Number(tp[1]) || 0).getTime();
  };

  const subsByCust = new Map<number, any[]>();
  for (const row of backSubs) {
    const cid = row.Customer_id || row.customer_id;
    if (!subsByCust.has(cid)) subsByCust.set(cid, []);
    subsByCust.get(cid)!.push(row);
  }

  const result: any[] = [];
  const foundCustIds = new Set<number>();

  subsByCust.forEach((rows, cid) => {
    foundCustIds.add(cid);
    let maxTime = 0;
    for (const r of rows) {
      const t = parseD(r.Dated, r.PostedTime);
      if (t > maxTime) maxTime = t;
    }
    const latestRows = rows.filter(r => parseD(r.Dated, r.PostedTime) === maxTime);
    result.push(...latestRows);
  });

  // Fallback to customer_detail if any customer had no records in customer_detailback
  const missingCustIds = customerIds.filter(id => !foundCustIds.has(id));
  if (missingCustIds.length > 0) {
    for (let i = 0; i < missingCustIds.length; i += CHUNK_SIZE) {
      const chunk = missingCustIds.slice(i, i + CHUNK_SIZE);
      const { data: cdSubs } = await supabase
        .from('customer_detail')
        .select('*')
        .in('customer_id', chunk);
      if (cdSubs) result.push(...cdSubs);
    }
  }

  return result;
}

async function fetchBillsAndReceipts(customerIds: number[], fySuffix: string) {
  if (customerIds.length === 0) return { bills: [], receipts: [] };
  const CHUNK_SIZE = 200;
  const allBills: any[] = [];
  const allReceipts: any[] = [];

  if (fySuffix === '20262027') {
    for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
      const chunk = customerIds.slice(i, i + CHUNK_SIZE);
      const [{ data: bData }, { data: rData }] = await Promise.all([
        supabase.from('bill').select('*').in('customer_id', chunk).eq('financial_year', '2026-2027'),
        supabase.from('receipt').select('*').in('customer_id', chunk).eq('financial_year', '2026-2027')
      ]);
      if (bData) allBills.push(...bData);
      if (rData) allReceipts.push(...rData);
    }
    return { bills: allBills, receipts: allReceipts };
  } else {
    try {
      for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
        const chunk = customerIds.slice(i, i + CHUNK_SIZE);
        const [{ data: bData }, { data: rData }] = await Promise.all([
          supabase.from(`billno${fySuffix}`).select('*').in('Customer_id', chunk),
          supabase.from(`receipt${fySuffix}`).select('*').in('Customer_id', chunk)
        ]);
        if (bData) allBills.push(...bData);
        if (rData) allReceipts.push(...rData);
      }
      if (allBills.length > 0) {
        return { bills: allBills, receipts: allReceipts };
      }
    } catch (e) {
      // fallback to cached
    }
    const bFiltered = (cachedBills || []).filter(b => customerIds.includes(b.customer_id || b.Customer_id));
    const rFiltered = (cachedReceipts || []).filter(r => customerIds.includes(r.customer_id || r.Customer_id));
    return { bills: bFiltered, receipts: rFiltered };
  }
}

export async function GET(request: NextRequest) {
  try {
    loadLocalDatasets();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || 'August';
    const year = searchParams.get('year') || '2026';
    const regionId = searchParams.get('region_id') || 'all';
    const customerIdStr = searchParams.get('customer_id');
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let targetCusts = cachedCusts || [];

    // Determine fiscal year suffix (e.g. 20252026)
    let fySuffix = '20252026';
    const yStr = String(year);
    if (yStr.length === 8) {
      fySuffix = yStr;
    } else {
      const startY = parseInt(yStr, 10) || 2025;
      fySuffix = `${startY}${startY + 1}`;
    }
    const retailTableName = `retailsale${fySuffix}`;

    // If single customer queried (for Breakup / Slip): Instant calculation
    if (customerIdStr) {
      const cid = parseInt(customerIdStr, 10);
      targetCusts = targetCusts.filter(c => (c.customer_id || c.Customer_id) === cid);

      const [custSubs, { bills: liveCustBills, receipts: liveCustReceipts }, pubDis, { data: dbSingleRetail }] = await Promise.all([
        fetchSubscriptions([cid]),
        fetchBillsAndReceipts([cid], fySuffix),
        getPublicationDiscontinues(),
        supabase.from(retailTableName).select('*').eq('Customer_id', cid)
      ]);

      const singleResult = calculateBilling({
        monthName: month,
        year: year,
        regionId: 'all',
        customers: targetCusts,
        subscriptions: custSubs,
        rates: cachedRates || [],
        ratechanges: cachedRateChanges || [],
        publications: cachedPubs || [],
        holidays: cachedHolidays || [],
        discontinues: cachedDiscontinues || [],
        publicationDiscontinues: pubDis,
        bills: liveCustBills,
        receipts: liveCustReceipts,
        regions: cachedRegions || [],
        retailSales: dbSingleRetail || []
      });

      const singleBill = singleResult.bills[0] || null;
      if (singleBill) {
        singleBill.customer_hindi = cleanOrTransliterateHindi(singleBill.customer_hindi, singleBill.name_eng);
      }
      const singleBreakup = (singleResult.breakup_lines || []).map(bl => ({
        ...bl,
        customer_hindi: cleanOrTransliterateHindi(bl.customer_hindi || '', bl.name_eng)
      }));

      return NextResponse.json({
        customer_id: cid,
        bill: singleBill,
        breakup: singleBreakup
      });
    }

    // Filter by region
    if (regionId && regionId !== 'all') {
      const rId = parseInt(regionId, 10);
      targetCusts = targetCusts.filter(c => (c.region_id || c.Region_id) === rId);
    }

    // Filter by search text
    if (search) {
      targetCusts = targetCusts.filter(c => 
        (c.name_eng || c.Name_eng || '').toLowerCase().includes(search) ||
        (c.customer_id || c.Customer_id)?.toString() === search ||
        (c.phone || '').includes(search)
      );
    }

    const totalCustCount = targetCusts.length;
    // Paginate target customers for instant response
    const paginatedCusts = targetCusts.slice((page - 1) * limit, page * limit);
    const paginatedCustIds = paginatedCusts.map(c => c.customer_id || c.Customer_id);

    const [paginatedSubs, { bills: liveCustBills, receipts: liveCustReceipts }, pubDis, { data: dbBatchRetail }] = await Promise.all([
      fetchSubscriptions(paginatedCustIds),
      fetchBillsAndReceipts(paginatedCustIds, fySuffix),
      getPublicationDiscontinues(),
      supabase.from(retailTableName).select('*').in('Customer_id', paginatedCustIds)
    ]);

    const result = calculateBilling({
      monthName: month,
      year: year,
      regionId: regionId,
      customers: paginatedCusts,
      subscriptions: paginatedSubs,
      rates: cachedRates || [],
      ratechanges: cachedRateChanges || [],
      publications: cachedPubs || [],
      holidays: cachedHolidays || [],
      discontinues: cachedDiscontinues || [],
      publicationDiscontinues: pubDis,
      bills: liveCustBills,
      receipts: liveCustReceipts,
      regions: cachedRegions || [],
      retailSales: dbBatchRetail || []
    });

    // Strip heavy breakup arrays from list view for maximum speed
    const lightweightBills = result.bills.map(b => ({
      bill_no: b.bill_no,
      customer_id: b.customer_id,
      name_eng: b.name_eng,
      customer_hindi: cleanOrTransliterateHindi(b.customer_hindi, b.name_eng),
      region_name: b.region_name,
      previous_due: b.previous_due,
      paper_amount: b.paper_amount,
      delivery_amount: b.delivery_amount,
      discount_amount: b.discount_amount,
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
  try {
    loadLocalDatasets();
    const body = await request.json();
    const { month = 'August', year = '2026', region_id = 'all', commitToDb = false } = body;

    let targetCusts = cachedCusts || [];
    if (region_id && region_id !== 'all') {
      const rId = parseInt(region_id, 10);
      targetCusts = targetCusts.filter(c => (c.region_id || c.Region_id) === rId);
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
    const retailTableName = `retailsale${fySuffix}`;

    const targetCustIds = targetCusts.map(c => c.customer_id || c.Customer_id);

    const fetchRetailSales = async (custIds: number[]) => {
      const allRetail: any[] = [];
      const CHUNK_SIZE = 200;
      for (let i = 0; i < custIds.length; i += CHUNK_SIZE) {
        const chunk = custIds.slice(i, i + CHUNK_SIZE);
        const { data } = await supabase.from(retailTableName).select('*').in('Customer_id', chunk);
        if (data) allRetail.push(...data);
      }
      return allRetail;
    };

    const [targetSubs, { bills: liveCustBills, receipts: liveCustReceipts }, pubDis, dbBatchRetail] = await Promise.all([
      fetchSubscriptions(targetCustIds),
      fetchBillsAndReceipts(targetCustIds, fySuffix),
      getPublicationDiscontinues(),
      fetchRetailSales(targetCustIds)
    ]);

    const result = calculateBilling({
      monthName: month,
      year: year,
      regionId: region_id,
      customers: targetCusts,
      subscriptions: targetSubs,
      rates: cachedRates || [],
      ratechanges: cachedRateChanges || [],
      publications: cachedPubs || [],
      holidays: cachedHolidays || [],
      discontinues: cachedDiscontinues || [],
      publicationDiscontinues: pubDis,
      bills: liveCustBills,
      receipts: liveCustReceipts,
      regions: cachedRegions || [],
      retailSales: dbBatchRetail || []
    });

    // If commit to live Supabase DB is requested:
    let savedToSupabase = false;
    let savedBillnoCount = 0;
    let savedBillItemsCount = 0;

    if (commitToDb && supabase) {
      const billnoTable = `billno${fySuffix}`;
      const billTable = `bill${fySuffix}`;

      // Extract all DB rows
      const billnoRows = result.bills.map(b => b.db_billno_item).filter(Boolean);
      const billRows = result.bills.flatMap(b => b.db_bill_items || []).filter(Boolean);

      // Insert in batches of 500 to Supabase
      const insertBatch = async (tableName: string, rows: any[]) => {
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          await supabase.from(tableName).upsert(batch);
        }
      };

      try {
        await insertBatch(billnoTable, billnoRows);
        await insertBatch(billTable, billRows);
        savedToSupabase = true;
        savedBillnoCount = billnoRows.length;
        savedBillItemsCount = billRows.length;
      } catch (dbErr) {
        console.error('Error saving to Supabase:', dbErr);
      }
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
