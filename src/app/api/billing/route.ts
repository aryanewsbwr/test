import { NextRequest, NextResponse } from 'next/server';
import { fetchPublications, fetchRegions } from '@/lib/publicationsData';
import { replaceMonthBills } from '@/lib/billCommit';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { refuseWithout } from '@/lib/auth';
import { calculateBilling, MONTH_NAMES, parseLegacyDateToIso } from '@/lib/billingEngine';
import { getReliableHindiName } from '@/lib/transliteration';

export const dynamic = 'force-dynamic';

// Every input below is read from the database for each run. A failed read stops the run
// instead of billing from an old copy.

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

  // s_date ties a stop to the subscription it was entered for. Without the column every stop
  // would hit every subscription of that paper, so billing waits for it.
  if (mainRows.length > 0 && !('s_date' in mainRows[0])) {
    throw new Error('Stops have no subscription dates yet. Run supabase/move_json_to_database.sql in Supabase first.');
  }
  return [...mainRows, ...extraRows];
}

// Regions starting with Z are not billed in All Regions. Pick one directly to bill it.
async function dropHiddenRegions(custs: any[]): Promise<any[]> {
  const regions = await fetchRegions();
  const hidden = new Set(regions.filter(r => /^\s*z/i.test(String(r.region_name || r.name || ''))).map(r => Number(r.region_id)));
  return custs.filter(c => !hidden.has(Number(c.region_id || c.Region_id)));
}

async function getCustomers(regionId?: string | number): Promise<any[]> {
  if (!regionId || regionId === 'all') return fetchEveryRow('customer', '*', 'customer_id');
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('customer')
      .select('*')
      .eq('region_id', parseInt(String(regionId), 10))
      .order('customer_id')
      .range(from, from + 999);
    if (error) throw new Error(`Could not read customers: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

async function getActiveCustomerIds(targetCustIds: number[], month: string, year: number | string, fySuffix: string): Promise<Set<number>> {
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
    const [cdRes, billRes] = await Promise.all([
      supabaseAdmin
        .from('customer_detail')
        .select('customer_id, s_date, c_date')
        .in('customer_id', chunk),
      supabaseAdmin
        .from(`billno${fySuffix}`)
        .select('customer_id, balance')
        .in('customer_id', chunk)
        .or(`month.ilike.${priorMonthName},month.ilike.${priorMonthShort}%`)
    ]);
    // A failed read would quietly leave customers out of the bill run
    const failed = cdRes.error || billRes.error;
    if (failed) throw new Error(`Could not read subscriptions: ${failed.message}`);

    for (const s of cdRes.data || []) {
      const cDateIso = parseLegacyDateToIso(s.c_date);
      if (!cDateIso || cDateIso >= mStartIso) {
        activeCustSet.add(Number(s.customer_id));
      }
    }

    for (const b of billRes.data || []) {
      if (b.balance !== null && Number(b.balance) !== 0) {
        activeCustSet.add(Number(b.customer_id));
      }
    }
  }
  return activeCustSet;
}

async function getHolidays(): Promise<any[]> {
  return fetchEveryRow('holiday', '*', 'id');
}

async function getPublicationDiscontinues(): Promise<any[]> {
  return fetchEveryRow('publicationdis', '*', 'id');
}

// Supplements entered for the billed month, the old software's PublicationSup rows. The month
// names in the table vary (Aug, Sept, October), so the year is matched here and the month by
// the engine. Region 0 means every region.
async function getSupplements(month: string, year: number | string): Promise<any[]> {
  const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(String(month).toLowerCase().slice(0, 3)));
  const startYr = parseInt(String(year).slice(0, 4), 10);
  const calYr = monthIdx >= 3 ? startYr : startYr + 1;
  const { data, error } = await supabaseAdmin.from('publicationsup').select('*').eq('year', String(calYr));
  if (error) throw new Error(`Could not read supplements: ${error.message}`);
  return (data || []).map((s: any) => {
    const regionId = Number(s.region_id || 0);
    return {
      ...s,
      rate: Number(s.rate || 0),
      region_id: regionId,
      region_ids: regionId ? [regionId] : [],
      all_regions: !regionId
    };
  });
}



async function getMaxBillId(fySuffix: string): Promise<number> {
  try {
    const { data } = await supabaseAdmin
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
      const { data: cdSubs, error } = await supabaseAdmin
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
  const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  const ranges: number[] = [];
  for (let from = 0; from < (count || 0); from += 1000) ranges.push(from);
  const results = await Promise.all(
    ranges.map(from => supabaseAdmin.from(table).select(columns).order(orderBy, { ascending: true }).range(from, from + 999))
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
      supabaseAdmin.from(`billno${fySuffix}`).select('*').in('customer_id', chunk).limit(1000),
      supabaseAdmin.from(`bill${fySuffix}`).select('*').in('customer_id', chunk).limit(1000),
      supabaseAdmin.from(`receipt${fySuffix}`).select('*').in('customer_id', chunk).limit(1000)
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

  // 40 customers at a time keeps each read under the database's 1,000-row page
  const matchingDb: any[] = [];
  const CHUNK_SIZE = 40;
  for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
    const chunk = customerIds.slice(i, i + CHUNK_SIZE);
    const { data: tblData, error } = await supabaseAdmin
      .from(`retailsale${fySuffix}`)
      .select('*')
      .in('customer_id', chunk)
      .limit(1000);
    if (error) throw new Error(`Could not read retail sales: ${error.message}`);

    matchingDb.push(...(tblData || []).map((r: any) => ({
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

  const seen = new Set<string>();
  const merged: any[] = [];
  for (const item of matchingDb) {
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
      const { data: dbCust, error: custErr } = await supabaseAdmin.from('customer').select('*').eq('customer_id', cid);
      if (custErr) throw new Error(`Could not read customer: ${custErr.message}`);
      const targetCusts = dbCust || [];

      const [custSubs, { bills: liveCustBills, billHeaders: liveCustBillHeaders, receipts: liveCustReceipts }, pubDis, liveRetail, maxBillId, liveHolidays, liveSupps] = await Promise.all([
        fetchSubscriptions([cid]),
        fetchBillsAndReceipts([cid], fySuffix),
        getPublicationDiscontinues(),
        fetchRetailSales([cid], fySuffix),
        getMaxBillId(fySuffix),
        getHolidays(),
        getSupplements(month, year)
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
      getSupplements(month, year)
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
      getSupplements(month, year)
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
    let balanceWarning = '';
    let savedBillnoCount = 0;
    let savedBillItemsCount = 0;

    if (commitToDb && supabaseAdmin) {
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
        supabaseAdmin,
        { billno: billnoTable, bill: billTable, billdel: billdelTable },
        month,
        targetCustIds.map(Number),
        { headers: billnoRows, lines: billRows, deliveries: billdelRows }
      );

      // Each customer's balance after this bill, minus meaning owed, for the dues reports.
      // The bills are already saved, so a failure here is reported instead of undoing them.
      for (let i = 0; i < result.bills.length; i += 1000) {
        const balances = result.bills.slice(i, i + 1000).map(b => ({ customer_id: b.customer_id, cbal: -b.total_payable }));
        const { error } = await supabaseAdmin.from('customer').upsert(balances, { onConflict: 'customer_id' });
        if (error) balanceWarning = `Bills saved, but customer balances were not updated: ${error.message}`;
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
      saved_bill_items_count: savedBillItemsCount,
      ...(balanceWarning ? { warning: balanceWarning } : {})
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
