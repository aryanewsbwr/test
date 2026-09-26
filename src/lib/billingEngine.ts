/**
 * 2008 AUTHENTIC VB6 BILLING ENGINE (REVERSE-ENGINEERED)
 * Directly implements legacy 2008 VB6 billing logic:
 * 1. Financial Year aware (April-March calendar year split)
 * 2. Daily newspapers (date-by-date delivery with RateChange & 7-Day DayOfWeek matrix)
 * 3. Weekly magazines (MagzineDay matching DayOfWeek)
 * 4. Fortnightly & Bi-Monthly periodicals (1st and 16th dates)
 * 5. Monthly & Quarterly periodicals (1st of month)
 * 6. Holiday exclusions (oc_date in Holiday table)
 * 7. Discontinue tracking (Permanent 'P' and Temporary 'T' date ranges)
 * 8. Subscriptions schedule filtering (From_Day 1-7 or specific weekdays)
 * 9. Delivery charges (cd.delivery_charge / cd.Dely in BillDel / BillNo)
 * 10. Customer discounts (cust.dis / cd.discount_percent in BillNo Dis_Amt)
 * 11. Previous due ledger bringing forward (Opening Dues + prior paper totals + delivery - receipts)
 * 12. 100% schema alignment with billYYYYYYYY and billnoYYYYYYYY tables
 */

import { cleanOrTransliterateHindi } from './transliteration';

export interface BillingLineItem {
  customer_id: number;
  name_eng: string;
  customer_hindi?: string;
  sort_order: number;
  item: string;
  rate: number | null;
  qty: number | null;
  days_or_copies: number | null;
  amount: number;
}

export interface CustomerMonthlyBill {
  bill_no: number;
  customer_id: number;
  name_eng: string;
  customer_hindi: string;
  region_id: number;
  region_name: string;
  month: string;
  year: number;
  opening_balance_this_bill: number;
  current_month_charges: number;
  previous_due: number; // Retained for compatibility (= opening_balance_this_bill)
  paper_amount: number;
  delivery_amount: number;
  discount_amount: number;
  retail_sale_amount: number;
  total_payable: number;
  breakup: BillingLineItem[];
  db_bill_items?: any[];
  db_billno_item?: any;
  db_billdel_items?: any[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const FORTNIGHTLY_PUBS = new Set([11, 13, 17, 18, 23, 24, 109]);

// Parse DD/MM/YYYY or YYYY-MM-DD to YYYY-MM-DD
function parseLegacyDateToIso(dStr: string | null | undefined): string | null {
  if (!dStr || dStr.trim() === '' || dStr === 'null') return null;
  const clean = dStr.trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    return clean.split('T')[0];
  }
  return null;
}

export function calculateBilling({
  monthName,
  year,
  regionId = 'all',
  customers = [],
  subscriptions = [],
  rates = [],
  ratechanges = [],
  publications = [],
  holidays = [],
  discontinues = [],
  publicationDiscontinues = [],
  bills = [],
  billHeaders = [],
  receipts = [],
  regions = [],
  retailSales = [],
  startBillId
}: {
  monthName: string;
  year: number | string;
  regionId?: string | number;
  customers: any[];
  subscriptions: any[];
  rates: any[];
  ratechanges: any[];
  publications: any[];
  holidays: any[];
  discontinues: any[];
  publicationDiscontinues?: any[];
  bills?: any[];
  billHeaders?: any[];
  receipts: any[];
  regions: any[];
  retailSales?: any[];
  startBillId?: number;
}) {
  let monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === monthName.toLowerCase() || m.toLowerCase().startsWith(monthName.toLowerCase().slice(0, 3)));
  if (monthIdx === -1) monthIdx = 7; // August default

  const standardMonthName = MONTH_NAMES[monthIdx];
  const monthNum = monthIdx + 1; // 1-12

  // Parse financial year (e.g. 2025, '2025', '20252026', '2025-2026')
  let startYear = 2025;
  const yStr = String(year);
  if (yStr.length === 8) {
    startYear = parseInt(yStr.slice(0, 4), 10);
  } else if (yStr.includes('-')) {
    startYear = parseInt(yStr.split('-')[0], 10);
  } else {
    startYear = parseInt(yStr, 10) || 2025;
  }

  // In Indian fiscal year: April (monthIdx=3) to Dec (monthIdx=11) is startYear, Jan-Mar (0-2) is startYear+1
  const calendarYear = monthIdx >= 3 ? startYear : startYear + 1;
  const daysInMonth = new Date(calendarYear, monthIdx + 1, 0).getDate();
  const monthStartIso = `${calendarYear}-${String(monthNum).padStart(2, '0')}-01`;
  const monthEndIso = `${calendarYear}-${String(monthNum).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Index Publications
  const pubMap = new Map<number, any>();
  for (const p of publications) {
    const pid = p.publication_id || p.publica_id || p.Publica_id;
    if (pid) pubMap.set(pid, p);
  }

  // Index Regions
  const regMap = new Map<number, any>();
  for (const r of regions) {
    const rid = r.region_id || r.Region_id;
    if (rid) regMap.set(rid, r);
  }

  // Track any missing rates loudly instead of silently using fallback
  const missingRateWarnings: Array<{ publica_id: number; date: string; day_of_week: number; message: string }> = [];

  // Rate lookup cache: (publicaId, dayOfWeek, targetDateIso) -> resolved rate
  const rateMemo = new Map<string, number>();

  // Rate lookup function: ratechange table takes priority over standard rate table
  const getEffectiveRate = (publicaId: number, dayOfWeek: number, targetDateIso: string): number => {
    const cacheKey = `${publicaId}-${dayOfWeek}-${targetDateIso}`;
    if (rateMemo.has(cacheKey)) {
      return rateMemo.get(cacheKey)!;
    }

    // 1. Check ratechanges: rc.Publica_id = publica_id AND (rc.Dayofweek = dayOfWeek OR rc.Dayofweek = 0) AND rc.Dated <= targetDateIso ORDER BY rc.Dated DESC LIMIT 1
    let matchingChanges = ratechanges.filter(rc => {
      const rPub = rc.Publica_id || rc.publica_id;
      const rDay = rc.Dayofweek !== undefined ? rc.Dayofweek : rc.dayofweek;
      const rDated = rc.Dated || rc.dated;
      const rDatedIso = parseLegacyDateToIso(rDated);
      return (
        rPub === publicaId &&
        (rDay === dayOfWeek || rDay === 0 || rDay === null || rDay === undefined) &&
        rDatedIso && rDatedIso <= targetDateIso
      );
    });

    // Fallback: If no day-specific ratechange found (common for periodicals/magazines with Dayofweek=1 in DB), check any ratechange for this publication
    if (matchingChanges.length === 0) {
      matchingChanges = ratechanges.filter(rc => {
        const rPub = rc.Publica_id || rc.publica_id;
        const rDated = rc.Dated || rc.dated;
        const rDatedIso = parseLegacyDateToIso(rDated);
        return rPub === publicaId && rDatedIso && rDatedIso <= targetDateIso;
      });
    }

    if (matchingChanges.length > 0) {
      matchingChanges.sort((a, b) => {
        const dA = parseLegacyDateToIso(a.Dated || a.dated) || '';
        const dB = parseLegacyDateToIso(b.Dated || b.dated) || '';
        if (dB !== dA) return dB.localeCompare(dA);
        // On same date, exact DayOfWeek match (1-7) takes priority over general DayOfWeek (0)
        const dayA = a.Dayofweek !== undefined ? a.Dayofweek : a.dayofweek;
        const dayB = b.Dayofweek !== undefined ? b.Dayofweek : b.dayofweek;
        return (dayB === dayOfWeek ? 1 : 0) - (dayA === dayOfWeek ? 1 : 0);
      });
      const top = matchingChanges[0];
      const res = Number(top.NewRate !== undefined ? top.NewRate : (top.new_rate !== undefined ? top.new_rate : (top.newrate || 0)));
      rateMemo.set(cacheKey, res);
      return res;
    }

    // 2. Fallback to standard rates table: r.Publica_id = publica_id AND r.Dayofweek = dayOfWeek
    const stdRate = rates.find(r => {
      const rPub = r.Publica_id || r.publica_id;
      const rDay = r.Dayofweek !== undefined ? r.Dayofweek : r.dayofweek;
      return rPub === publicaId && rDay === dayOfWeek;
    });
    if (stdRate) {
      const val = stdRate.Rate !== undefined ? stdRate.Rate : stdRate.rate;
      if (val !== undefined && val !== null && val > 0) {
        const res = Number(val);
        rateMemo.set(cacheKey, res);
        return res;
      }
    }

    // 3. Fallback any standard rate for publication
    const anyRate = rates.find(r => (r.Publica_id || r.publica_id) === publicaId);
    if (anyRate) {
      const val = anyRate.Rate !== undefined ? anyRate.Rate : anyRate.rate;
      if (val !== undefined && val !== null && val > 0) {
        const res = Number(val);
        rateMemo.set(cacheKey, res);
        return res;
      }
    }

    const warnMsg = `[BillingEngine WARN] Missing rate for publication #${publicaId} on date ${targetDateIso} (DayOfWeek: ${dayOfWeek}). Returning 0.00.`;
    console.warn(warnMsg);
    missingRateWarnings.push({
      publica_id: publicaId,
      date: targetDateIso,
      day_of_week: dayOfWeek,
      message: warnMsg
    });
    rateMemo.set(cacheKey, 0.0);
    return 0.0;
  };

  // Pre-index publicationDiscontinues by pubId
  const pubDisMap = new Map<number, { fromIso: string | null; toIso: string | null }[]>();
  for (const pd of publicationDiscontinues) {
    const pId = Number(pd.Publica_id || pd.publica_id || pd.publication_id);
    if (!pId) continue;
    if (!pubDisMap.has(pId)) pubDisMap.set(pId, []);
    pubDisMap.get(pId)!.push({
      fromIso: parseLegacyDateToIso(pd.FromDate || pd.from_date || pd.fromdate),
      toIso: parseLegacyDateToIso(pd.ToDate || pd.to_date || pd.todate)
    });
  }

  // Check if publication is globally discontinued in publicationdis table
  const isPubDiscontinued = (publicaId: number, targetDateIso: string): boolean => {
    const list = pubDisMap.get(publicaId);
    if (!list) return false;
    return list.some(item => {
      if (item.fromIso && targetDateIso < item.fromIso) return false;
      if (item.toIso && targetDateIso > item.toIso) return false;
      return true;
    });
  };

  // Pre-index holidays by date ISO
  // key: dateIso -> { general: boolean, pubIds: Set<number> }
  const holidayMap = new Map<string, { general: boolean; pubIds: Set<number> }>();
  for (const h of holidays) {
    const hIso = parseLegacyDateToIso(h.oc_date || h.Oc_Date || h.dated || h.Dated);
    if (!hIso) continue;
    if (!holidayMap.has(hIso)) {
      holidayMap.set(hIso, { general: false, pubIds: new Set<number>() });
    }
    const entry = holidayMap.get(hIso)!;
    const hPub = Number(h.publication_id || h.publica_id || h.Publica_id || 0);
    if (!hPub || hPub === 0) {
      entry.general = true;
    } else {
      entry.pubIds.add(hPub);
    }
  }

  // Holiday check: Daily newspapers skip on general (pub=0) and pub-specific holidays.
  // Periodicals ONLY skip if holiday explicitly specifies that exact publication_id.
  const isHoliday = (publicaId: number, targetDateIso: string, isDaily: boolean = true): boolean => {
    const entry = holidayMap.get(targetDateIso);
    if (!entry) return false;
    if (isDaily) {
      return entry.general || entry.pubIds.has(publicaId);
    } else {
      return entry.pubIds.has(publicaId);
    }
  };

  // Pre-index discontinues by customerId
  const custDisMap = new Map<number, { pubId: number; tempFrom: string; isPerm: boolean; tempTo: string | null }[]>();
  for (const d of discontinues) {
    const cid = Number(d.customer_id || d.Customer_id);
    if (!cid) continue;
    const tempFrom = parseLegacyDateToIso(d.temp_from || d.Temp_From);
    if (!tempFrom) continue;
    if (!custDisMap.has(cid)) custDisMap.set(cid, []);
    custDisMap.get(cid)!.push({
      pubId: Number(d.publica_id || d.Publica_id || 0),
      tempFrom,
      isPerm: (d.temp_perma || d.Temp_Perma || 'P').toUpperCase().startsWith('P'),
      tempTo: parseLegacyDateToIso(d.temp_to || d.Temp_To)
    });
  }

  // Discontinue check: checks active suspension / permanent stop
  // Authoritative column is `temp_from` (verified directly against database schema)
  const isDiscontinued = (custId: number, publicaId: number, targetDateIso: string): boolean => {
    const list = custDisMap.get(custId);
    if (!list) return false;
    return list.some(d => {
      if (d.pubId !== 0 && d.pubId !== publicaId) return false;
      if (d.isPerm) {
        return targetDateIso >= d.tempFrom;
      } else {
        if (!d.tempTo) return targetDateIso >= d.tempFrom;
        return targetDateIso >= d.tempFrom && targetDateIso <= d.tempTo;
      }
    });
  };

  // Check schedule day filter (cd.From_Day)
  const isScheduleMatch = (fromDay: any, dayOfWeek: number): boolean => {
    if (!fromDay) return true;
    if (Array.isArray(fromDay)) {
      return fromDay.includes(dayOfWeek);
    }
    const str = String(fromDay).trim();
    if (str === '' || str === '1-7' || str.toLowerCase() === 'daily') return true;
    if (str.includes('-')) {
      const parts = str.split('-').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return dayOfWeek >= parts[0] && dayOfWeek <= parts[1];
      }
    }
    const daysList = str.split(',').map(Number);
    return daysList.includes(dayOfWeek);
  };

  // Filter customers by region if specified
  let targetCustomers = customers;
  if (regionId && regionId !== 'all') {
    const rId = typeof regionId === 'string' ? parseInt(regionId, 10) : regionId;
    targetCustomers = targetCustomers.filter(c => (c.region_id || c.Region_id) === rId);
  }

  // Group subscriptions by customer_id
  const subsByCust = new Map<number, any[]>();
  for (const s of subscriptions) {
    const cid = s.customer_id || s.Customer_id;
    if (!subsByCust.has(cid)) {
      subsByCust.set(cid, []);
    }
    subsByCust.get(cid)!.push(s);
  }

  // Group retail sales by customer_id
  const retailSalesByCust = new Map<number, any[]>();
  for (const rs of retailSales) {
    const cid = rs.customer_id || rs.Customer_id;
    if (cid) {
      if (!retailSalesByCust.has(cid)) {
        retailSalesByCust.set(cid, []);
      }
      retailSalesByCust.get(cid)!.push(rs);
    }
  }

  const FY_MONTH_ORDER: Record<string, number> = {
    'dues': -1,
    'april': 0, 'apr': 0,
    'may': 1,
    'june': 2, 'jun': 2,
    'july': 3, 'jul': 3,
    'august': 4, 'aug': 4,
    'september': 5, 'sep': 5,
    'october': 6, 'oct': 6,
    'november': 7, 'nov': 7,
    'december': 8, 'dec': 8,
    'january': 9, 'jan': 9,
    'february': 10, 'feb': 10,
    'march': 11, 'mar': 11
  };

  const targetFyIndex = FY_MONTH_ORDER[standardMonthName.toLowerCase()] ?? 4;

  // Pre-index prior bills and receipts for Previous Due calculation
  // Step A: Year-End Opening Balance from Month = 'Dues'
  const yearEndDuesMap = new Map<number, number>();
  // Step B: Prior Billed charges in the CURRENT FY (strictly prior to target billing month)
  const priorBilledInFyMap = new Map<number, number>();

  const allHeaders = (billHeaders && billHeaders.length > 0) ? billHeaders : bills;
  for (const b of allHeaders) {
    const cid = b.customer_id || b.Customer_id;
    const bMonth = (b.month || b.Month || '').toLowerCase().trim();
    if (bMonth === 'dues') {
      const val = Number(b.due_amt !== undefined ? b.due_amt : (b.Due_Amt || 0));
      yearEndDuesMap.set(cid, val);
    }
  }

  // If separate line items exist in bills (TotalAmt), sum them by customer for prior months:
  const hasLineItems = bills.some(b => b.totalamt !== undefined || b.TotalAmt !== undefined);
  if (hasLineItems) {
    for (const b of bills) {
      const cid = b.customer_id || b.Customer_id;
      const bMonth = (b.month || b.Month || '').toLowerCase().trim();
      const mIdx = FY_MONTH_ORDER[bMonth];
      if (mIdx !== undefined && mIdx < targetFyIndex && (b.totalamt !== undefined || b.TotalAmt !== undefined)) {
        const lineAmt = Number(b.totalamt !== undefined ? b.totalamt : b.TotalAmt);
        priorBilledInFyMap.set(cid, (priorBilledInFyMap.get(cid) || 0) + lineAmt);
      }
    }
    // Add delivery and subtract discount from allHeaders for prior months
    for (const b of allHeaders) {
      const cid = b.customer_id || b.Customer_id;
      const bMonth = (b.month || b.Month || '').toLowerCase().trim();
      const mIdx = FY_MONTH_ORDER[bMonth];
      if (mIdx !== undefined && mIdx < targetFyIndex) {
        const delAmt = Number(b.del_amt !== undefined ? b.del_amt : (b.Del_Amt || 0));
        const disAmt = Number(b.dis_amt !== undefined ? b.dis_amt : (b.Dis_Amt || 0));
        priorBilledInFyMap.set(cid, (priorBilledInFyMap.get(cid) || 0) + delAmt - disAmt);
      }
    }
  } else {
    // If only bill headers were passed (bills === allHeaders)
    for (const b of allHeaders) {
      const cid = b.customer_id || b.Customer_id;
      const bMonth = (b.month || b.Month || '').toLowerCase().trim();
      const mIdx = FY_MONTH_ORDER[bMonth];
      if (mIdx !== undefined && mIdx < targetFyIndex && bMonth !== 'dues') {
        const delAmt = Number(b.del_amt !== undefined ? b.del_amt : (b.Del_Amt || 0));
        const disAmt = Number(b.dis_amt !== undefined ? b.dis_amt : (b.Dis_Amt || 0));
        let monthPaper = 0;
        if (b.paper_amount !== undefined || b.paper_amt !== undefined || b.Paper_Amt !== undefined) {
          monthPaper = Number(b.paper_amount !== undefined ? b.paper_amount : (b.paper_amt !== undefined ? b.paper_amt : b.Paper_Amt));
        }
        if (monthPaper === 0 && (b.bill_amt !== undefined || b.BillAmt !== undefined)) {
          monthPaper = Number(b.bill_amt !== undefined ? b.bill_amt : b.BillAmt);
        }
        priorBilledInFyMap.set(cid, (priorBilledInFyMap.get(cid) || 0) + monthPaper + delAmt - disAmt);
      }
    }

    // For prior months where bills had 0 paper_amount or were absent, check receipts for the billed amount
    const priorMonthsWithBills = new Set<string>();
    for (const b of allHeaders) {
      const bMonth = (b.month || b.Month || '').toLowerCase().trim();
      const mPaper = Number(b.paper_amount !== undefined ? b.paper_amount : (b.paper_amt !== undefined ? b.paper_amt : (b.Paper_Amt || b.bill_amt || b.BillAmt || 0)));
      if (mPaper > 0) priorMonthsWithBills.add(bMonth);
    }

    for (const r of receipts) {
      const cid = r.customer_id || r.Customer_id;
      const rMonth = (r.month || r.Month || '').toLowerCase().trim();
      const mIdx = FY_MONTH_ORDER[rMonth];
      if (mIdx !== undefined && mIdx < targetFyIndex && rMonth !== 'dues') {
        if (!priorMonthsWithBills.has(rMonth)) {
          const bAmt = Number(r.bill_amt !== undefined ? r.bill_amt : (r.BillAmt || 0));
          if (bAmt > 0) {
            priorBilledInFyMap.set(cid, (priorBilledInFyMap.get(cid) || 0) + bAmt);
          }
        }
      }
    }
  }

  // Step C: Prior Receipts in the CURRENT FY (strictly prior to target billing month)
  const priorReceiptsInFyMap = new Map<number, number>();
  for (const r of receipts) {
    const cid = r.customer_id || r.Customer_id;
    const rMonth = (r.month || r.Month || '').toLowerCase().trim();
    const mIdx = FY_MONTH_ORDER[rMonth];

    const recDate = parseLegacyDateToIso(r.mal_recp_dt || r.MalRecpDt || r.bill_date || r.BillDate);
    // In legacy ledger: receipt is prior if its voucher date is before target month start,
    // OR if its associated month is strictly prior to target month and voucher date is not after target month
    let isPrior = false;
    if (mIdx !== undefined && mIdx < targetFyIndex) {
      if (!recDate || recDate <= monthEndIso) {
        isPrior = true;
      }
    } else if (recDate && recDate < monthStartIso) {
      isPrior = true;
    }

    if (isPrior) {
      const recpAmt = Number(r.mal_recp_amt !== undefined ? r.mal_recp_amt : (r.MalRecpAmt || r.bill_amt || r.BillAmt || 0));
      const lessAmt = Number(r.less_amt !== undefined ? r.less_amt : (r.LessAmt || 0));
      priorReceiptsInFyMap.set(cid, (priorReceiptsInFyMap.get(cid) || 0) + recpAmt + lessAmt);
    }
  }

  const generatedBills: CustomerMonthlyBill[] = [];
  const allBreakupLines: BillingLineItem[] = [];

  let grandTotalBilling = 0;
  let nextBillId = startBillId !== undefined && startBillId > 0 ? startBillId : 1001;

  for (let cIdx = 0; cIdx < targetCustomers.length; cIdx++) {
    const cust = targetCustomers[cIdx];
    const custId = cust.customer_id || cust.Customer_id;
    const custSubs = subsByCust.get(custId) || [];

    const custBreakup: BillingLineItem[] = [];
    const dbBillItems: any[] = [];
    const dbBilldelItems: any[] = [];
    let customerPaperTotal = 0;
    let customerDeliveryTotal = 0;
    let customerDiscountTotal = 0;

    const custRegionId = cust.region_id || cust.Region_id || 1;

    // =========================================================================
    // 1. PROCESS EACH SUBSCRIPTION LINE ITEM
    // =========================================================================
    for (let sIdx = 0; sIdx < custSubs.length; sIdx++) {
      const cd = custSubs[sIdx];
      const pubId = cd.publication_id || cd.publica_id || cd.Publica_id;
      const pub = pubMap.get(pubId);
      const rawHindi = pub?.pub_hindi || pub?.Pub_Hindi;
      const englishName = pub?.name || pub?.public_name || pub?.Public_name || cd.publication_name || `Publication #${pubId}`;
      const pubName = rawHindi && rawHindi.trim().length > 0
        ? cleanOrTransliterateHindi(rawHindi, englishName)
        : englishName;
      const typeP = pub?.type_p || pub?.TypeP || pub?.frequency || 'Daily';
      const is513 = pubId === 513;
      const magzineDay = is513 ? 2 : (pubId === 33 ? 6 : (pub?.magzine_day || pub?.MagzineDay || 0));
      const isDaily = !is513 && (typeP.toLowerCase() === 'daily' || typeP.toLowerCase() === 'newspaper');
      const isWeekly = is513 || pubId === 33 || magzineDay >= 1 || typeP.toLowerCase() === 'weekly';
      const isFortnightly = FORTNIGHTLY_PUBS.has(pubId) || typeP.toLowerCase().includes('fortnight') || typeP.toLowerCase().includes('bi-month') || typeP.toLowerCase().includes('bi-weekly');

      const sDateIso = parseLegacyDateToIso(cd.s_date || cd.S_Date) || '2000-01-01';
      const cDateIso = parseLegacyDateToIso(cd.c_date || cd.C_Date);

      const qty = Number(cd.qty || cd.Qty || 1);

      // Group day counts by resolved rate
      const rateDaysMap = new Map<number, number>();

      // CASE A: Daily Newspapers
      if (isDaily) {
        for (let day = 1; day <= daysInMonth; day++) {
          const targetDateIso = `${calendarYear}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dObj = new Date(calendarYear, monthIdx, day);
          const legacyDayOfWeek = dObj.getDay() + 1; // 1=Sun..7=Sat

          // Active date range check: Target_Date >= s_date AND (c_date is empty OR Target_Date < c_date)
          if (targetDateIso < sDateIso) continue;
          if (cDateIso && targetDateIso >= cDateIso) continue;

          // Holiday, Global Publication Discontinue & Customer Discontinue checks
          if (isPubDiscontinued(pubId, targetDateIso)) continue;
          if (isHoliday(pubId, targetDateIso)) continue;
          if (isDiscontinued(custId, pubId, targetDateIso)) continue;

          // Schedule day check
          const deliveryDays = cd.delivery_days || cd.from_day || cd.From_Day;
          if (!isScheduleMatch(deliveryDays, legacyDayOfWeek)) continue;

          // Resolve rate on this date
          const rate = getEffectiveRate(pubId, legacyDayOfWeek, targetDateIso);
          if (rate > 0) {
            rateDaysMap.set(rate, (rateDaysMap.get(rate) || 0) + 1);
          }
        }
      }
      // CASE B: Weekly Magazines (MagzineDay matching DayOfWeek)
      else if (isWeekly && magzineDay >= 1) {
        for (let day = 1; day <= daysInMonth; day++) {
          const targetDateIso = `${calendarYear}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dObj = new Date(calendarYear, monthIdx, day);
          const legacyDayOfWeek = dObj.getDay() + 1;

          if (legacyDayOfWeek !== magzineDay) continue;
          if (targetDateIso < sDateIso) continue;
          if (cDateIso && targetDateIso >= cDateIso) continue;
          if (isPubDiscontinued(pubId, targetDateIso)) continue;
          if (isHoliday(pubId, targetDateIso, false)) continue;
          if (isDiscontinued(custId, pubId, targetDateIso)) continue;

          const rate = getEffectiveRate(pubId, legacyDayOfWeek, targetDateIso);
          if (rate > 0) {
            // Standard weekly magazines in monthly cycle (e.g. India Today) cap at 4 issues per month
            const currentTotalCopies = Array.from(rateDaysMap.values()).reduce((a, b) => a + b, 0);
            if (is513 && currentTotalCopies >= 4) continue;
            rateDaysMap.set(rate, (rateDaysMap.get(rate) || 0) + 1);
          }
        }
      }
      // CASE C: Fortnightly & Bi-Monthly (1st and 16th dates)
      else if (isFortnightly) {
        const periodDates = [
          `${calendarYear}-${String(monthNum).padStart(2, '0')}-01`,
          `${calendarYear}-${String(monthNum).padStart(2, '0')}-16`
        ];
        for (const pDateIso of periodDates) {
          if (pDateIso < sDateIso) continue;
          if (cDateIso && pDateIso >= cDateIso) continue;
          if (isPubDiscontinued(pubId, pDateIso)) continue;
          if (isHoliday(pubId, pDateIso, false)) continue;
          if (isDiscontinued(custId, pubId, pDateIso)) continue;

          let rate = getEffectiveRate(pubId, 1, pDateIso) || getEffectiveRate(pubId, 2, pDateIso) || getEffectiveRate(pubId, 0, pDateIso);
          if (!rate || rate === 0) {
            for (let d = 3; d <= 7; d++) {
              const alt = getEffectiveRate(pubId, d, pDateIso);
              if (alt > 0) { rate = alt; break; }
            }
          }
          if (rate > 0) {
            rateDaysMap.set(rate, (rateDaysMap.get(rate) || 0) + 1);
          }
        }
      }
      // CASE D: Monthly + Quarterly Magazines (1st of month)
      else {
        const pDateIso = `${calendarYear}-${String(monthNum).padStart(2, '0')}-01`;
        const isQuarterlyAllowed = pubId !== 75 || [1, 4, 7, 10].includes(monthNum);

        if (isQuarterlyAllowed && sDateIso <= monthStartIso && (!cDateIso || cDateIso > monthStartIso)) {
          if (!isPubDiscontinued(pubId, pDateIso) && !isHoliday(pubId, pDateIso, false) && !isDiscontinued(custId, pubId, pDateIso)) {
            let rate = getEffectiveRate(pubId, 1, pDateIso) || getEffectiveRate(pubId, 0, pDateIso);
            if (!rate || rate === 0) {
              for (let d = 2; d <= 7; d++) {
                const alt = getEffectiveRate(pubId, d, pDateIso);
                if (alt > 0) { rate = alt; break; }
              }
            }
            if (rate > 0) {
              rateDaysMap.set(rate, (rateDaysMap.get(rate) || 0) + 1);
            }
          }
        }
      }

      // Add line items for each rate
      let snoCounter = 1;
      let subPaperTotal = 0;
      Array.from(rateDaysMap.entries()).forEach(([rate, daysOrCopies]) => {
        const lineAmt = Math.round(rate * qty * daysOrCopies * 100) / 100;
        subPaperTotal += lineAmt;
        customerPaperTotal += lineAmt;
        custBreakup.push({
          customer_id: custId,
          name_eng: cust.name_eng || cust.Name_eng || `Customer #${custId}`,
          customer_hindi: cust.name_hindi || cust.Name_hindi || '',
          sort_order: 1,
          item: pubName,
          rate: rate,
          qty: qty * daysOrCopies,
          days_or_copies: daysOrCopies,
          amount: lineAmt
        });

        // DB Schema for billYYYYYYYY
        dbBillItems.push({
          Bill_id: nextBillId,
          Customer_id: custId,
          Publica_id: pubId,
          Region_id: custRegionId,
          Qty: daysOrCopies * qty,
          Rate: rate,
          D_Charges: null,
          TotalAmt: lineAmt,
          Month: standardMonthName,
          year: String(startYear),
          sno: snoCounter++
        });
      });

      // Line-item discount: Subscriptions specify discount percentage in `dis` / `discount_percent` / `Dis`
      // Customer master table does not have a global discount column
      const subDisRaw = cd.dis !== undefined && cd.dis !== null ? cd.dis : (cd.discount_percent !== undefined ? cd.discount_percent : cd.Dis);
      const applicableDisPercent = Number(subDisRaw || 0);

      if (applicableDisPercent > 0 && subPaperTotal > 0) {
        const subDisAmt = Math.round((subPaperTotal * (applicableDisPercent / 100)) * 100) / 100;
        customerDiscountTotal += subDisAmt;
      }

      // Delivery Charges per Subscription: only if subscription was active during the month
      const dely = Number(cd.delivery_charge !== undefined ? cd.delivery_charge : (cd.dely || cd.Dely || 0));
      if (dely > 0 && sDateIso <= monthEndIso && (!cDateIso || cDateIso >= monthStartIso)) {
        customerDeliveryTotal += dely;
        custBreakup.push({
          customer_id: custId,
          name_eng: cust.name_eng || cust.Name_eng || `Customer #${custId}`,
          customer_hindi: cust.name_hindi || cust.Name_hindi || '',
          sort_order: 2,
          item: `${pubName} - Delivery`,
          rate: dely,
          qty: 1,
          days_or_copies: 1,
          amount: dely
        });
        dbBilldelItems.push({
          Customer_id: custId,
          Region_id: custRegionId,
          Publica_id: pubId,
          month: standardMonthName,
          year: String(startYear),
          Dely: dely,
          sno: snoCounter
        });
      }
    }

    // =========================================================================
    // 1B. PROCESS RETAIL / COUNTER SALES TO PERMANENT CUSTOMERS
    // =========================================================================
    const custRetailSales = retailSalesByCust.get(custId) || [];
    let customerRetailTotal = 0;

    for (const rs of custRetailSales) {
      const vrDate = parseLegacyDateToIso(rs.vr_date || rs.Vr_Date || rs.dated || rs.Dated);
      // Ensure transaction falls within target billing month
      if (vrDate && vrDate >= monthStartIso && vrDate <= monthEndIso) {
        const copies = Number(rs.copies || rs.Copies || 1);
        let lineAmt = 0;
        let effectiveRate = 0;

        if (rs.amt !== undefined && rs.amt !== null) {
          lineAmt = Number(rs.amt);
          effectiveRate = Number(rs.rate || rs.Rate || (copies > 0 ? lineAmt / copies : lineAmt));
        } else if (rs.Amt !== undefined && rs.Amt !== null) {
          lineAmt = Number(rs.Amt);
          effectiveRate = Number(rs.Rate || rs.rate || (copies > 0 ? lineAmt / copies : lineAmt));
        } else if (rs.amount !== undefined && rs.amount !== null) {
          lineAmt = Number(rs.amount);
          effectiveRate = Number(rs.rate || rs.Rate || (copies > 0 ? lineAmt / copies : lineAmt));
        } else {
          effectiveRate = Number(rs.rate || rs.Rate || 0);
          lineAmt = Math.round(copies * effectiveRate * 100) / 100;
        }
        const pubId = rs.publica_id || rs.Publica_id;
        const pub = pubMap.get(pubId);
        const pubName = pub?.pub_hindi 
          ? cleanOrTransliterateHindi(pub.pub_hindi, pub.name || pub.public_name)
          : (pub?.name || pub?.public_name || pub?.Public_name || rs.public_name || `Publication #${pubId}`);

        customerRetailTotal += lineAmt;

        // Add to breakup with sort_order 1 (Paper / Magazine Item) so it appears in itemized line items
        custBreakup.push({
          customer_id: custId,
          name_eng: cust.name_eng || cust.Name_eng || `Customer #${custId}`,
          customer_hindi: cust.name_hindi || cust.Name_hindi || '',
          sort_order: 1,
          item: pubName,
          rate: effectiveRate,
          qty: copies,
          days_or_copies: copies,
          amount: lineAmt
        });

        // Add to db_bill_items with sno: null (matching historical legacy billYYYYYYYY pattern)
        dbBillItems.push({
          Bill_id: nextBillId,
          Customer_id: custId,
          Publica_id: pubId,
          Region_id: custRegionId,
          Qty: copies,
          Rate: effectiveRate,
          D_Charges: null,
          TotalAmt: lineAmt,
          Month: standardMonthName,
          year: String(startYear),
          sno: null
        });
      }
    }

    // Customer Discount Total Line in Breakup
    // Note: Discounts strictly apply ONLY to subscription paper totals, never to retail sales or delivery charges
    if (customerDiscountTotal > 0) {
      custBreakup.push({
        customer_id: custId,
        name_eng: cust.name_eng || cust.Name_eng || `Customer #${custId}`,
        customer_hindi: cust.name_hindi || cust.Name_hindi || '',
        sort_order: 3,
        item: `Total Discount`,
        rate: null,
        qty: null,
        days_or_copies: null,
        amount: -customerDiscountTotal
      });
    }

    // =========================================================================
    // 2. CHARGES & TOTAL COMPUTATION (Formula 8)
    // =========================================================================
    const yearEndOpeningDue = yearEndDuesMap.has(custId)
      ? yearEndDuesMap.get(custId)!
      : Number(cust.dueamount || cust.Dueamount || 0);

    const priorBilledInFy = priorBilledInFyMap.get(custId) || 0;
    const priorPaidInFy = priorReceiptsInFyMap.get(custId) || 0;
    const previousDue = Math.round((yearEndOpeningDue + priorBilledInFy - priorPaidInFy) * 100) / 100;

    const openingBalanceThisBill = previousDue;
    const currentMonthCharges = Math.round((customerPaperTotal + customerDeliveryTotal + customerRetailTotal - customerDiscountTotal) * 100) / 100;
    const totalPayable = Math.round((openingBalanceThisBill + currentMonthCharges) * 100) / 100;

    // Only generate bill if customer has active papers, retail sales, or outstanding dues
    if (totalPayable === 0 && customerPaperTotal === 0 && customerRetailTotal === 0 && custBreakup.length === 0) {
      continue;
    }

    // Insert "Current Month Charges" Subtotal row into Breakup
    let currentMonthLabel = 'Current Month Charges (चालू माह शुल्क)';
    if (customerDeliveryTotal > 0 || customerDiscountTotal > 0) {
      const parts = [`Papers: ₹${(customerPaperTotal + customerRetailTotal).toFixed(2)}`];
      if (customerDeliveryTotal > 0) parts.push(`Delivery: ₹${customerDeliveryTotal.toFixed(2)}`);
      if (customerDiscountTotal > 0) parts.push(`Discount: -₹${customerDiscountTotal.toFixed(2)}`);
      currentMonthLabel = `Current Month Charges (${parts.join(' + ')})`;
    }

    custBreakup.push({
      customer_id: custId,
      name_eng: cust.name_eng || cust.Name_eng || `Customer #${custId}`,
      customer_hindi: cust.name_hindi || cust.Name_hindi || '',
      sort_order: 4,
      item: currentMonthLabel,
      rate: null,
      qty: null,
      days_or_copies: null,
      amount: currentMonthCharges
    });

    // Previous Due (Sort_order 5)
    if (previousDue !== 0) {
      custBreakup.push({
        customer_id: custId,
        name_eng: cust.name_eng || cust.Name_eng || `Customer #${custId}`,
        customer_hindi: cust.name_hindi || cust.Name_hindi || '',
        sort_order: 5,
        item: 'Previous Due (Opening + Prior Ledger)',
        rate: null,
        qty: null,
        days_or_copies: null,
        amount: previousDue
      });
    }

    custBreakup.push({
      customer_id: custId,
      name_eng: cust.name_eng || cust.Name_eng || `Customer #${custId}`,
      customer_hindi: cust.name_hindi || cust.Name_hindi || '',
      sort_order: 9,
      item: 'GRAND TOTAL',
      rate: null,
      qty: null,
      days_or_copies: null,
      amount: totalPayable
    });

    const reg = regMap.get(custRegionId);

    // In billnoYYYYYYYY:
    // - Due_Amt is NULL for monthly bills (only populated in the FY anchor row Month='Dues')
    // - Balance stores the carried-forward opening balance (deficit = negative, advance = positive)
    const dbBillnoItem = {
      Bill_id: nextBillId,
      Customer_id: custId,
      Region_id: custRegionId,
      Due_Amt: null,
      Del_Amt: customerDeliveryTotal > 0 ? customerDeliveryTotal : null,
      Dis_Amt: customerDiscountTotal > 0 ? customerDiscountTotal : null,
      Month: standardMonthName,
      year: String(startYear),
      Balance: openingBalanceThisBill !== 0 ? -openingBalanceThisBill : 0
    };

    const billObj: CustomerMonthlyBill = {
      bill_no: nextBillId,
      customer_id: custId,
      name_eng: cust.name_eng || cust.Name_eng || `Customer #${custId}`,
      customer_hindi: cust.name_hindi || cust.Name_hindi || '',
      region_id: custRegionId,
      region_name: reg ? (reg.name || reg.region_name || reg.Region_name) : `Region #${custRegionId}`,
      month: standardMonthName,
      year: startYear,
      opening_balance_this_bill: openingBalanceThisBill,
      current_month_charges: currentMonthCharges,
      previous_due: openingBalanceThisBill,
      paper_amount: customerPaperTotal + customerRetailTotal,
      delivery_amount: customerDeliveryTotal,
      discount_amount: customerDiscountTotal,
      retail_sale_amount: customerRetailTotal,
      total_payable: totalPayable,
      breakup: custBreakup,
      db_bill_items: dbBillItems,
      db_billno_item: dbBillnoItem,
      db_billdel_items: dbBilldelItems
    };

    generatedBills.push(billObj);
    allBreakupLines.push(...custBreakup);
    grandTotalBilling += totalPayable;
    nextBillId++;
  }

  return {
    month: standardMonthName,
    year: startYear,
    calendar_year: calendarYear,
    region_id: regionId,
    total_bills: generatedBills.length,
    grand_total: Math.round(grandTotalBilling * 100) / 100,
    bills: generatedBills,
    breakup_lines: allBreakupLines,
    missing_rate_warnings: missingRateWarnings
  };
}
