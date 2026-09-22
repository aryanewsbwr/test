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

      // Query customer_detail directly from Supabase for this customer
      const { data: dbSingleSubs } = await supabase
        .from('customer_detail')
        .select('*')
        .eq('customer_id', cid);
      const custSubs = dbSingleSubs || [];

      // Query retailsale directly from Supabase for this customer
      const { data: dbSingleRetail } = await supabase
        .from(retailTableName)
        .select('*')
        .eq('Customer_id', cid);
      const custRetail = dbSingleRetail || [];

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
        bills: cachedBills || [],
        receipts: cachedReceipts || [],
        regions: cachedRegions || [],
        retailSales: custRetail
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

    // Query customer_detail directly from Supabase for this page of customers
    const { data: dbBatchSubs } = await supabase
      .from('customer_detail')
      .select('*')
      .in('customer_id', paginatedCustIds);
    const paginatedSubs = dbBatchSubs || [];

    // Query retailsale directly from Supabase for this page of customers
    const { data: dbBatchRetail } = await supabase
      .from(retailTableName)
      .select('*')
      .in('Customer_id', paginatedCustIds);
    const paginatedRetail = dbBatchRetail || [];

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
      bills: cachedBills || [],
      receipts: cachedReceipts || [],
      regions: cachedRegions || [],
      retailSales: paginatedRetail
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
    const { data: dbBatchSubs } = await supabase
      .from('customer_detail')
      .select('*')
      .in('customer_id', targetCustIds);
    const targetSubs = dbBatchSubs || [];

    // Query retailsale directly from Supabase for target customers
    const { data: dbBatchRetail } = await supabase
      .from(retailTableName)
      .select('*')
      .in('Customer_id', targetCustIds);
    const targetRetail = dbBatchRetail || [];

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
      bills: cachedBills || [],
      receipts: cachedReceipts || [],
      regions: cachedRegions || [],
      retailSales: targetRetail
    });

    // If commit to live Supabase DB is requested:
    let savedToSupabase = false;
    let savedBillnoCount = 0;
    let savedBillItemsCount = 0;

    if (commitToDb && supabase) {
      // Determine fiscal year suffix (e.g. 20252026)
      let fySuffix = '20252026';
      const yStr = String(year);
      if (yStr.length === 8) {
        fySuffix = yStr;
      } else {
        const startY = parseInt(yStr, 10) || 2025;
        fySuffix = `${startY}${startY + 1}`;
      }

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
