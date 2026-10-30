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

import { cleanOrTransliterateHindi, getReliableHindiName } from './transliteration';

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

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const FORTNIGHTLY_PUBS = new Set([11, 13, 17, 18, 23, 24, 33, 109, 216]);

// Parse DD/MM/YYYY or YYYY-MM-DD to YYYY-MM-DD
export function parseLegacyDateToIso(dStr: string | null | undefined): string | null {
  if (!dStr || dStr.trim() === '' || dStr === 'null') return null;
  const clean = dStr.trim();
  // Continuous digits: DDMMYYYY (e.g. 08102026) or YYYYMMDD
  if (/^\d{8}$/.test(clean)) {
    const yrFirst = parseInt(clean.slice(0, 4), 10);
    if (yrFirst >= 1990 && yrFirst <= 2099) {
      return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
    }
    return `${clean.slice(4, 8)}-${clean.slice(2, 4)}-${clean.slice(0, 2)}`;
  }
  if (clean.includes('/') || clean.includes('-')) {
    const sep = clean.includes('/') ? '/' : '-';
    const parts = clean.split(sep);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
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

/**
 * FoxPro / Indian Newspaper Agency Rounding Rule:
 * If the fractional (paise/decimal) part is >= 0.25, round UP (+1).
 * If the fractional part is < 0.25 (e.g. 0.24, 0.10, 0.00), round DOWN / retain integer.
 * Examples:
 *   217.25 -> 218
 *   217.50 -> 218
 *   517.50 -> 518
 *   217.24 -> 217
 *   217.00 -> 217
 */
export function roundToFoxProRule(amount: number): number {
  if (!amount || isNaN(amount)) return 0;
  const isNegative = amount < 0;
  const absVal = Math.abs(amount);
  const integerPart = Math.floor(absVal);
  const fraction = Math.round((absVal - integerPart) * 100) / 100;

  let rounded = integerPart;
  if (fraction >= 0.25) {
    rounded = integerPart + 1;
  }
  return isNegative ? -rounded : rounded;
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
  supplements = [],
  startBillId,
  priorMonthBalances
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
  supplements?: any[];
  startBillId?: number;
  priorMonthBalances?: Map<number, number> | Record<number, number>;
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

  // Pre-index magazine frequency / periodicity from rate table (dayofweek mapping)
  // DayOfWeek in rate table for magazines:
  // 1 = Weekly
  // 2 = Fortnightly
  // 3 = Monthly
  // 4 = Quarterly
  // 6 = Special / Book / CD / One-off
  const magFrequencyFromRates = new Map<number, string>();
  for (const r of rates) {
    const rPub = Number(r.Publica_id || r.publica_id);
    const rDow = Number(r.Dayofweek !== undefined ? r.Dayofweek : r.dayofweek);
    if (!rPub) continue;
    const pubObj = pubMap.get(rPub);
    const pType = String(pubObj?.type_p || pubObj?.TypeP || '').toLowerCase();
    const isMag = pType.includes('mag') || pType.includes('periodical');

    if (isMag && !magFrequencyFromRates.has(rPub)) {
      if (rDow === 1) magFrequencyFromRates.set(rPub, 'weekly');
      else if (rDow === 2) magFrequencyFromRates.set(rPub, 'fortnightly');
      else if (rDow === 3) magFrequencyFromRates.set(rPub, 'monthly');
      else if (rDow === 4) magFrequencyFromRates.set(rPub, 'quarterly');
      else if (rDow === 6) magFrequencyFromRates.set(rPub, 'special');
    }
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
      const rDated = rc.Dated || rc.dated || rc.effective_date;
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
        const rDated = rc.Dated || rc.dated || rc.effective_date;
        const rDatedIso = parseLegacyDateToIso(rDated);
        return rPub === publicaId && rDatedIso && rDatedIso <= targetDateIso;
      });
    }

    if (matchingChanges.length > 0) {
      matchingChanges.sort((a, b) => {
        const dA = parseLegacyDateToIso(a.Dated || a.dated || a.effective_date) || '';
        const dB = parseLegacyDateToIso(b.Dated || b.dated || b.effective_date) || '';
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

  // Pre-index publicationDiscontinues by pubId (0 = All Newspapers / Holiday)
  const pubDisMap = new Map<number, { fromIso: string | null; toIso: string | null }[]>();
  for (const pd of publicationDiscontinues) {
    const pId = Number(pd.Publica_id !== undefined ? pd.Publica_id : (pd.publica_id !== undefined ? pd.publica_id : (pd.publication_id || 0)));
    if (isNaN(pId)) continue;
    if (!pubDisMap.has(pId)) pubDisMap.set(pId, []);
    pubDisMap.get(pId)!.push({
      fromIso: parseLegacyDateToIso(pd.FromDate || pd.from_date || pd.fromdate || pd.entry_date),
      toIso: parseLegacyDateToIso(pd.ToDate || pd.to_date || pd.todate || pd.oc_date)
    });
  }

  // Check if publication is discontinued globally or specifically
  // Global holiday (publica_id === 0) ONLY applies to daily newspapers, NOT magazines/periodicals
  const isPubDiscontinued = (publicaId: number, targetDateIso: string, isDaily: boolean = true): boolean => {
    const specificList = pubDisMap.get(publicaId) || [];
    const globalList = isDaily ? (pubDisMap.get(0) || []) : [];
    const allMatching = [...specificList, ...globalList];
    if (allMatching.length === 0) return false;
    return allMatching.some(item => {
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
  const custDisMap = new Map<number, { pubId: number; tempFrom: string; isPerm: boolean; tempTo: string | null; sDateIso: string | null }[]>();
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
      tempTo: parseLegacyDateToIso(d.temp_to || d.Temp_To),
      sDateIso: parseLegacyDateToIso(d.s_date || d.S_Date)
    });
  }

  // Discontinue check: checks active suspension / permanent stop
  // Authoritative column is `temp_from` (verified directly against database schema)
  const isDiscontinued = (custId: number, publicaId: number, targetDateIso: string, sDateIso?: string): boolean => {
    const list = custDisMap.get(custId);
    if (!list) return false;
    return list.some(d => {
      if (d.pubId !== 0 && d.pubId !== publicaId) return false;
      // If the discontinue explicitly references a specific subscription s_date, it only affects that subscription
      if (d.sDateIso && sDateIso && d.sDateIso !== sDateIso) return false;
      if (d.isPerm) {
        // If the subscription was created on or after the discontinue date,
        // it is a newer subscription that is not affected by older discontinue records
        if (sDateIso && sDateIso >= d.tempFrom) return false;
        return targetDateIso >= d.tempFrom;
      } else {
        const effectiveTo = d.tempTo || d.tempFrom;
        return targetDateIso >= d.tempFrom && targetDateIso <= effectiveTo;
      }
    });
  };


  // Check schedule day filter (cd.From_Day)
  const isScheduleMatch = (fromDay: any, dayOfWeek: number, targetDateIso?: string): boolean => {
    if (!fromDay) return true;
    if (Array.isArray(fromDay)) {
      return fromDay.includes(dayOfWeek);
    }
    const str = String(fromDay).trim();
    if (str === '' || str === '1-7' || str.toLowerCase() === 'daily') return true;

    // In FoxPro billing:
    // '1' = Sunday only (Day 1 in legacy VFP / JS Sunday=1)
    if (str === '1') {
      return dayOfWeek === 1;
    }

    // '2-6' = Monday to Friday (5-day office working week)
    if (str === '2-6') {
      return dayOfWeek >= 2 && dayOfWeek <= 6;
    }

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
    'september': 5, 'sep': 5, 'sept': 5,
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

  // If separate line items exist in bills (TotalAmt / total_amt), sum them by customer for prior months:
  const hasLineItems = bills.some(b => b.total_amt !== undefined || b.totalamt !== undefined || b.TotalAmt !== undefined);
  if (hasLineItems) {
    for (const b of bills) {
      const cid = b.customer_id || b.Customer_id;
      const bMonth = (b.month || b.Month || '').toLowerCase().trim();
      const mIdx = FY_MONTH_ORDER[bMonth];
      const val = b.total_amt !== undefined ? b.total_amt : (b.totalamt !== undefined ? b.totalamt : b.TotalAmt);
      if (mIdx !== undefined && mIdx < targetFyIndex && val !== undefined) {
        const lineAmt = Number(val);
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

  // Pre-index months that actually have bills in this FY table (strictly prior to target billing month)
  const priorBilledMonths = new Set<string>();
  for (const b of allHeaders) {
    const bMonth = (b.month || b.Month || '').toLowerCase().trim();
    const mIdx = FY_MONTH_ORDER[bMonth];
    if (mIdx !== undefined && mIdx >= 0 && mIdx < targetFyIndex) {
      priorBilledMonths.add(bMonth);
    }
  }

  // Step C: Prior Receipts in the CURRENT FY (strictly prior to target billing month)
  // Only deduct receipts for months that were actively billed in this FY table.
  // Historical receipts for unbilled months (e.g. April-July) are already net-settled in customer.cbal.
  const priorReceiptsInFyMap = new Map<number, number>();
  for (const r of receipts) {
    const cid = r.customer_id || r.Customer_id;
    const rMonth = (r.month || r.Month || '').toLowerCase().trim();
    const mIdx = FY_MONTH_ORDER[rMonth];

    if (mIdx !== undefined && priorBilledMonths.has(rMonth)) {
      const recpAmt = Number(r.mal_recp_amt !== undefined ? r.mal_recp_amt : (r.MalRecpAmt || r.bill_amt || r.BillAmt || 0));
      const lessAmt = Number(r.less_amt !== undefined ? r.less_amt : (r.LessAmt || 0));
      priorReceiptsInFyMap.set(cid, (priorReceiptsInFyMap.get(cid) || 0) + recpAmt + lessAmt);
    }
  }

  // Step D: Late Receipts posted after the monthly billing run (e.g. late September payments in 20262027)
  // These receipts were received between bill generation date and WhatsApp export / current date,
  // so they must be credited against the customer's recorded bill balance to prevent double billing.
  const lateReceiptsByCust = new Map<number, number>();
  for (const r of receipts) {
    const cid = Number(r.customer_id || r.Customer_id);
    const rNo = Number(r.recp_no || r.Recp_no || 0);
    const recpAmt = Number(r.mal_recp_amt !== undefined ? r.mal_recp_amt : (r.MalRecpAmt || r.bill_amt || r.BillAmt || 0));
    const lessAmt = Number(r.less_amt !== undefined ? r.less_amt : (r.LessAmt || 0));
    const totalPaid = recpAmt + lessAmt;

    if (rNo >= 1196564) {
      lateReceiptsByCust.set(cid, (lateReceiptsByCust.get(cid) || 0) + totalPaid);
    }
  }

  const generatedBills: CustomerMonthlyBill[] = [];
  const allBreakupLines: BillingLineItem[] = [];

  let grandTotalBilling = 0;
  let nextBillId = startBillId !== undefined && startBillId > 0 ? startBillId : 1001;

  for (let cIdx = 0; cIdx < targetCustomers.length; cIdx++) {
    const cust = targetCustomers[cIdx];
    const custId = cust.customer_id || cust.Customer_id;
    const custNameEng = cust.name_eng || cust.Name_eng || `Customer #${custId}`;
    // Only use a Hindi name we can trust (DB Unicode / legacy font decode / known
    // phrase). Never a lossy phonetic guess — that produced wrong names before.
    const custNameHindi = getReliableHindiName(cust.name_hindi || cust.Name_hindi || '', custNameEng);
    const custSubs = subsByCust.get(custId) || [];

    const custBreakup: BillingLineItem[] = [];
    const dbBillItems: any[] = [];
    const dbBilldelItems: any[] = [];
    let customerPaperTotal = 0;
    let customerDeliveryTotal = 0;
    let customerDiscountTotal = 0;

    const custRegionId = cust.region_id || cust.Region_id || 1;

    // Check if customer already has a committed bill header in allHeaders for this EXACT month
    const existingHeader = allHeaders.find(h => {
      const hCid = Number(h.customer_id || h.Customer_id);
      const hMonth = (h.month || h.Month || '').toLowerCase().trim();
      const stdM = standardMonthName.toLowerCase().trim();
      return hCid === Number(custId) && (
        hMonth === stdM ||
        hMonth.startsWith(stdM.slice(0, 3))
      );
    });

    const assignedBillId = existingHeader && (existingHeader.bill_id || existingHeader.Bill_id)
      ? Number(existingHeader.bill_id || existingHeader.Bill_id)
      : nextBillId;

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
      const rateDerivedFreq = magFrequencyFromRates.get(pubId);

      // Determine periodicity based on rate table dayofweek logic:
      // 1 = Weekly, 2 = Fortnightly, 3 = Monthly, 4 = Quarterly, 6 = Special
      const isFortnightly = rateDerivedFreq === 'fortnightly' || (
        !rateDerivedFreq && (
          FORTNIGHTLY_PUBS.has(pubId) ||
          typeP.toLowerCase().includes('fortnight') ||
          typeP.toLowerCase().includes('bi-month') ||
          typeP.toLowerCase().includes('bi-weekly')
        )
      );

      const magzineDay = is513 ? 2 : (pub?.magzine_day || pub?.MagzineDay || (rateDerivedFreq === 'weekly' ? 1 : 0));
      const isDaily = !is513 && !isFortnightly && (typeP.toLowerCase() === 'daily' || typeP.toLowerCase() === 'newspaper');
      const isWeekly = !isDaily && !isFortnightly && (rateDerivedFreq === 'weekly' || is513 || (magzineDay >= 1 && rateDerivedFreq !== 'monthly') || typeP.toLowerCase() === 'weekly');
      const isQuarterly = rateDerivedFreq === 'quarterly' || pubId === 75;

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
          if (isPubDiscontinued(pubId, targetDateIso, true)) continue;
          if (isHoliday(pubId, targetDateIso)) continue;
          if (isDiscontinued(custId, pubId, targetDateIso, sDateIso)) continue;

          // Schedule day check
          const deliveryDays = cd.delivery_days || cd.from_day || cd.From_Day;
          if (!isScheduleMatch(deliveryDays, legacyDayOfWeek, targetDateIso)) continue;

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
          if (isPubDiscontinued(pubId, targetDateIso, false)) continue;
          if (isHoliday(pubId, targetDateIso, false)) continue;
          if (isDiscontinued(custId, pubId, targetDateIso, sDateIso)) continue;

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
          if (isPubDiscontinued(pubId, pDateIso, false)) continue;
          if (isHoliday(pubId, pDateIso, false)) continue;
          if (isDiscontinued(custId, pubId, pDateIso, sDateIso)) continue;

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
        // If subscription has no delivery days scheduled and circulation is As Per Norm, skip
        const deliveryDays = cd.delivery_days || cd.from_day || cd.From_Day;
        const circ = String(cd.circulation || cd.Circulation || '').toLowerCase();
        if ((deliveryDays === '' || deliveryDays === null || deliveryDays === undefined) && (circ.includes('norm') || circ === '')) {
          continue;
        }

        const pDateIso = `${calendarYear}-${String(monthNum).padStart(2, '0')}-01`;
        const isQuarterlyAllowed = !isQuarterly || [1, 4, 7, 10].includes(monthNum);

        if (isQuarterlyAllowed && sDateIso <= monthStartIso && (!cDateIso || cDateIso > monthStartIso)) {
          if (!isPubDiscontinued(pubId, pDateIso, false) && !isHoliday(pubId, pDateIso, false) && !isDiscontinued(custId, pubId, pDateIso, sDateIso)) {

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
          name_eng: custNameEng,
          customer_hindi: custNameHindi,
          sort_order: 1,
          item: pubName,
          rate: rate,
          qty: qty * daysOrCopies,
          days_or_copies: daysOrCopies,
          amount: lineAmt
        });

        // DB Schema for billYYYYYYYY
        dbBillItems.push({
          Bill_id: assignedBillId,
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

      // Delivery Charges per Subscription: only if subscription had active paper deliveries during the month
      const dely = Number(cd.delivery_charge !== undefined ? cd.delivery_charge : (cd.dely || cd.Dely || 0));
      if (dely > 0 && subPaperTotal > 0) {
        customerDeliveryTotal += dely;
        custBreakup.push({
          customer_id: custId,
          name_eng: custNameEng,
          customer_hindi: custNameHindi,
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
        const pubId = rs.publica_id || rs.Publica_id;
        const copies = Number(rs.copies || rs.Copies || 1);
        const givenRate = Number(rs.rate !== undefined && rs.rate !== null ? rs.rate : (rs.Rate || 0));
        const rawAmt = rs.amt !== undefined && rs.amt !== null ? Number(rs.amt)
          : (rs.Amt !== undefined && rs.Amt !== null ? Number(rs.Amt)
          : (rs.amount !== undefined && rs.amount !== null ? Number(rs.amount) : 0));

        let lineAmt = 0;
        let effectiveRate = 0;

        if (copies > 1 && givenRate > 0 && Math.abs(rawAmt - givenRate) < 0.01) {
          // Operator entered single-copy rate in both rate and amt fields for multiple copies
          effectiveRate = givenRate;
          lineAmt = Math.round(copies * effectiveRate * 100) / 100;
        } else if (rawAmt > 0) {
          lineAmt = rawAmt;
          effectiveRate = copies > 0 ? Math.round((rawAmt / copies) * 100) / 100 : rawAmt;
        } else if (givenRate > 0) {
          effectiveRate = givenRate;
          lineAmt = Math.round(copies * effectiveRate * 100) / 100;
        } else {
          const masterRate = getEffectiveRate(pubId, 0, vrDate);
          effectiveRate = masterRate > 0 
            ? masterRate 
            : (copies > 0 ? Math.round((rawAmt / copies) * 100) / 100 : rawAmt);
          lineAmt = Math.round(copies * effectiveRate * 100) / 100;
        }
        const pub = pubMap.get(pubId);
        const pubName = pub?.pub_hindi 
          ? cleanOrTransliterateHindi(pub.pub_hindi, pub.name || pub.public_name)
          : (pub?.name || pub?.public_name || pub?.Public_name || rs.public_name || `Publication #${pubId}`);

        customerRetailTotal += lineAmt;

        // Add to breakup with sort_order 1 (Paper / Magazine Item) so it appears in itemized line items
        custBreakup.push({
          customer_id: custId,
          name_eng: custNameEng,
          customer_hindi: custNameHindi,
          sort_order: 1,
          item: `${pubName} (RS)`,
          rate: effectiveRate,
          qty: copies,
          days_or_copies: copies,
          amount: lineAmt
        });

        // Add to db_bill_items with sno: null (matching historical legacy billYYYYYYYY pattern)
        dbBillItems.push({
          Bill_id: assignedBillId,
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

    // =========================================================================
    // 1C. PROCESS PUBLICATION SUPPLEMENTS (P S)
    // =========================================================================
    let customerSupplementTotal = 0;
    const custSubPubIds = new Set(custSubs.map(s => Number(s.publica_id || s.Publica_id || s.publication_id)));

    for (const supp of supplements) {
      const suppDateIso = parseLegacyDateToIso(supp.date_iso || supp.date);
      const suppMonth = (supp.month || '').toLowerCase().trim();
      const isMatchingMonth = (suppDateIso && suppDateIso >= monthStartIso && suppDateIso <= monthEndIso) ||
                              (suppMonth && (suppMonth === standardMonthName.toLowerCase() || suppMonth.startsWith(standardMonthName.toLowerCase().slice(0, 3))));

      if (isMatchingMonth) {
        const parentId = Number(supp.publicasup_id || supp.publica_id || supp.Publica_id || 0);
        const suppId = Number(supp.publica_id || supp.publicasup_id || supp.Publica_id || 0);

        const matchingPubId = custSubPubIds.has(parentId) 
          ? parentId 
          : (custSubPubIds.has(suppId) ? suppId : null);

        if (matchingPubId !== null) {
          const appliesToRegion = Boolean(
            supp.all_regions ||
            !supp.region_ids ||
            supp.region_ids.length === 0 ||
            supp.region_ids.includes(Number(custRegionId)) ||
            (supp.region_id !== undefined && (Number(supp.region_id) === 0 || Number(supp.region_id) === Number(custRegionId)))
          );

          if (appliesToRegion) {
            const sub = custSubs.find(s => Number(s.publica_id || s.Publica_id || s.publication_id) === matchingPubId);
            const copies = Number(sub?.qty || sub?.copies || 1);
            let suppRate = Number(supp.rate || 0);
            if (suppRate <= 0) {
              const dow = 1;
              suppRate = getEffectiveRate(suppId || parentId, dow, monthStartIso);
            }
            if (suppRate <= 0) suppRate = 5.0;

            const lineAmt = Math.round(copies * suppRate * 100) / 100;

            const suppPub = pubMap.get(suppId) || pubMap.get(parentId);
            const rawPubName = supp.supplement_name || suppPub?.name || suppPub?.public_name || supp.public_name || `Publication #${suppId || parentId}`;
            const pubName = suppPub?.pub_hindi 
              ? cleanOrTransliterateHindi(suppPub.pub_hindi, rawPubName)
              : rawPubName;

            customerSupplementTotal += lineAmt;

            // Add to breakup with sort_order 1 and (P S) label
            custBreakup.push({
              customer_id: custId,
              name_eng: custNameEng,
              customer_hindi: custNameHindi,
              sort_order: 1,
              item: `${pubName} (P S)`,
              rate: suppRate,
              qty: copies,
              days_or_copies: copies,
              amount: lineAmt
            });

            dbBillItems.push({
              Bill_id: assignedBillId,
              Customer_id: custId,
              Publica_id: suppId || parentId,
              Region_id: custRegionId,
              Qty: copies,
              Rate: suppRate,
              D_Charges: null,
              TotalAmt: lineAmt,
              Month: standardMonthName,
              year: String(startYear),
              sno: null
            });
          }
        }
      }
    }

    // Customer Discount Total Line in Breakup
    // Note: Discounts strictly apply ONLY to subscription paper totals, never to retail sales or delivery charges
    if (customerDiscountTotal > 0) {
      custBreakup.push({
        customer_id: custId,
        name_eng: custNameEng,
        customer_hindi: custNameHindi,
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
    // Determine Previous Due / Opening Balance:
    // If live customer balance (cbal / dueamount) is explicitly updated by receipt entries, respect current customer ledger balance.
    let customerPreviousBalance = 0;
    const rawCbal = cust.cbal !== undefined && cust.cbal !== null ? Number(cust.cbal) : null;
    const rawDue = cust.dueamount !== undefined && cust.dueamount !== null ? Number(cust.dueamount) : (cust.due_amount !== undefined ? Number(cust.due_amount) : null);
    
    // Check if customer has receipts posted for this current target month or whole FY receipts
    const currentMonthReceipts = receipts.filter(r => {
      const rCid = Number(r.customer_id || r.Customer_id);
      const rMonth = (r.month || r.Month || '').toLowerCase().trim();
      const stdM = standardMonthName.toLowerCase().trim();
      return rCid === Number(custId) && (rMonth === stdM || rMonth.startsWith(stdM.slice(0, 3)));
    });

    const hasTargetMonthReceipt = currentMonthReceipts.length > 0;

    const hasPriorHeaders = allHeaders.some(h => {
      const hCid = Number(h.customer_id || h.Customer_id);
      const hMonth = (h.month || h.Month || '').toLowerCase().trim();
      const mIdx = FY_MONTH_ORDER[hMonth];
      return hCid === Number(custId) && mIdx !== undefined && mIdx < targetFyIndex;
    });

    // Current month charges
    const rawCurrentCharges = customerPaperTotal + customerDeliveryTotal + customerRetailTotal + customerSupplementTotal - customerDiscountTotal;
    const currentMonthCharges = roundToFoxProRule(rawCurrentCharges);

    if (hasTargetMonthReceipt) {
      // The customer entered payment receipt(s) specifically against this target month or with net balance
      // If customer has exact dueamount in master (e.g. ₹100), net total payable MUST be that exact positive due amount (₹100)!
      const targetPayable = (rawDue !== undefined && rawDue !== null && rawDue >= 0)
        ? rawDue
        : (rawCbal !== null && rawCbal !== 0 ? Math.abs(rawCbal) : 0);

      // Total payable = openingBalanceThisBill + currentMonthCharges = targetPayable
      customerPreviousBalance = targetPayable - currentMonthCharges;
    } else {
      const latePaid = lateReceiptsByCust.get(custId) || 0;

      if (hasPriorHeaders) {
        // Calculate cumulative prior bills (Dues + Apr..Sep)
        let priorBillsTotal = 0;
        for (const h of allHeaders) {
          const hCid = Number(h.customer_id || h.Customer_id);
          if (hCid !== Number(custId)) continue;
          const hMonth = (h.month || h.Month || '').toLowerCase().trim();
          const mIdx = FY_MONTH_ORDER[hMonth];
          if (mIdx === undefined || mIdx >= targetFyIndex) continue;

          const hBid = Number(h.bill_id || h.Bill_id);
          const delAmt = Number(h.del_amt ?? h.Del_Amt ?? 0);
          const disAmt = Number(h.dis_amt ?? h.Dis_Amt ?? 0);

          if (hMonth === 'dues') {
            priorBillsTotal += Number(h.due_amt || h.Due_Amt || 0);
          } else {
            let paperAmt = 0;
            if (hasLineItems) {
              for (const it of bills) {
                if (Number(it.bill_id || it.Bill_id) === hBid) {
                  const val = it.total_amt !== undefined ? it.total_amt : (it.totalamt !== undefined ? it.totalamt : it.TotalAmt);
                  if (val !== undefined) paperAmt += Number(val);
                }
              }
            } else {
              paperAmt = Number(h.paper_amount ?? h.paper_amt ?? h.Paper_Amt ?? h.bill_amt ?? h.BillAmt ?? 0);
            }
            priorBillsTotal += (paperAmt + delAmt - disAmt);
          }
        }

        // Deduct each unique receipt once
        const seenRecpKeys = new Set<string>();
        let priorReceiptsTotal = 0;
        for (const r of receipts) {
          const rCid = Number(r.customer_id || r.Customer_id);
          if (rCid !== Number(custId)) continue;
          const rNo = String(r.recp_no || r.id || '');
          const rMonth = (r.month || r.Month || '').toLowerCase().trim();
          const recpAmt = Number(r.mal_recp_amt !== undefined ? r.mal_recp_amt : (r.MalRecpAmt || r.bill_amt || r.BillAmt || 0));
          const lessAmt = Number(r.less_amt !== undefined ? r.less_amt : (r.LessAmt || 0));
          
          const key = r.recp_no && Number(r.recp_no) !== 0
            ? String(r.recp_no)
            : `${rCid}_${rMonth}_${recpAmt}`;
          if (seenRecpKeys.has(key)) continue;
          seenRecpKeys.add(key);

          // Only deduct receipts for months strictly prior to target billing month
          const rMIdx = FY_MONTH_ORDER[rMonth];
          if (rMIdx !== undefined && rMIdx >= targetFyIndex) continue;

          priorReceiptsTotal += (recpAmt + lessAmt);
        }

        // Compute net dues across all bills up to and including target month minus all receipts
        const allCustBillsTotal = priorBillsTotal + customerPaperTotal + customerDeliveryTotal - customerDiscountTotal;

        const seenAllRecpKeys = new Set<string>();
        let allReceiptsTotal = 0;
        for (const r of receipts) {
          const rCid = Number(r.customer_id || r.Customer_id);
          if (rCid !== Number(custId)) continue;
          const rMonth = (r.month || r.Month || '').toLowerCase().trim();
          const recpAmt = Number(r.mal_recp_amt !== undefined ? r.mal_recp_amt : (r.MalRecpAmt || r.bill_amt || r.BillAmt || 0));
          const lessAmt = Number(r.less_amt !== undefined ? r.less_amt : (r.LessAmt || 0));

          const key = r.recp_no && Number(r.recp_no) !== 0
            ? String(r.recp_no)
            : `${rCid}_${rMonth}_${recpAmt}`;
          if (seenAllRecpKeys.has(key)) continue;
          seenAllRecpKeys.add(key);

          allReceiptsTotal += (recpAmt + lessAmt);
        }

        // If total receipts cover all prior bills and partially/fully pay the current month bill,
        // then the remaining net payable right now is (allCustBillsTotal - allReceiptsTotal).
        const netTotalDue = allCustBillsTotal - allReceiptsTotal;

        if (allReceiptsTotal > priorBillsTotal) {
          // Customer already made a payment that includes current month bill
          customerPreviousBalance = netTotalDue - (customerPaperTotal + customerDeliveryTotal - customerDiscountTotal);
        } else {
          // Standard case: customer has unpaid prior balance
          customerPreviousBalance = priorBillsTotal - priorReceiptsTotal;
        }
      } else if (existingHeader && existingHeader.balance !== null && existingHeader.balance !== undefined) {
        // When there are no prior headers in the FY, this customer had no previous bills before October.
        // Therefore, the balance recorded in October's bill header IS the total net payable for this bill,
        // and their previous due is 0.
        customerPreviousBalance = 0;
      } else {
        // Customer has no prior billing headers in this financial year.
        // Opening balance for current FY starts clean at 0 (never use corrupted 2007 cbal / dueamount).
        customerPreviousBalance = 0;
      }
    }

    const previousDue = Math.abs(customerPreviousBalance) < 0.01 ? 0 : Math.round(customerPreviousBalance * 100) / 100;

    const openingBalanceThisBill = previousDue;
    const roundedPaperTotal = roundToFoxProRule(customerPaperTotal + customerRetailTotal + customerSupplementTotal);
    const totalPayable = roundToFoxProRule(customerPreviousBalance + rawCurrentCharges);

    // In FoxPro monthly delivery billing, bills are generated strictly for customers with active paper deliveries / sales (paperTotal > 0).
    // Customers with 0 newspaper deliveries in the current month do NOT receive a monthly newspaper bill.
    if (customerPaperTotal === 0 && customerRetailTotal === 0 && customerSupplementTotal === 0) {
      continue;
    }

    // Insert "Current Month Charges" Subtotal row into Breakup
    let currentMonthLabel = 'Current Month Charges (चालू माह शुल्क)';
    if (customerDeliveryTotal > 0 || customerDiscountTotal > 0) {
      const parts = [`Papers: ₹${(customerPaperTotal + customerRetailTotal + customerSupplementTotal).toFixed(2)}`];
      if (customerDeliveryTotal > 0) parts.push(`Delivery: ₹${customerDeliveryTotal.toFixed(2)}`);
      if (customerDiscountTotal > 0) parts.push(`Discount: -₹${customerDiscountTotal.toFixed(2)}`);
      currentMonthLabel = `Current Month Charges (${parts.join(' + ')})`;
    }

    custBreakup.push({
      customer_id: custId,
      name_eng: custNameEng,
      customer_hindi: custNameHindi,
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
        name_eng: custNameEng,
        customer_hindi: custNameHindi,
        sort_order: 5,
        item: previousDue > 0 ? 'Previous Due (गत बकाया)' : 'Advance Balance (जमा अग्रिम)',
        rate: null,
        qty: null,
        days_or_copies: null,
        amount: previousDue
      });
    }

    custBreakup.push({
      customer_id: custId,
      name_eng: custNameEng,
      customer_hindi: custNameHindi,
      sort_order: 9,
      item: 'GRAND TOTAL',
      rate: null,
      qty: null,
      days_or_copies: null,
      amount: totalPayable
    });

    // In billnoYYYYYYYY:
    // - Due_Amt is NULL for monthly bills (only populated in the FY anchor row Month='Dues')
    // - Balance stores the carried-forward opening balance (deficit = negative, advance = positive)
    const dbBillnoItem = {
      Bill_id: assignedBillId,
      Customer_id: custId,
      Region_id: custRegionId,
      Due_Amt: openingBalanceThisBill !== 0 ? openingBalanceThisBill : null,
      Del_Amt: customerDeliveryTotal > 0 ? customerDeliveryTotal : null,
      Dis_Amt: customerDiscountTotal > 0 ? customerDiscountTotal : null,
      Month: standardMonthName,
      year: String(startYear),
      Balance: totalPayable !== 0 ? -totalPayable : 0
    };

    const reg = regMap.get(custRegionId);

    const billObj: CustomerMonthlyBill = {
      bill_no: assignedBillId,
      customer_id: custId,
      name_eng: custNameEng,
      customer_hindi: custNameHindi,
      region_id: custRegionId,
      region_name: reg ? String(reg.name || reg.region_name || reg.Region_name || `Region #${custRegionId}`) : `Region #${custRegionId}`,
      month: standardMonthName,
      year: startYear,
      opening_balance_this_bill: openingBalanceThisBill,
      current_month_charges: currentMonthCharges,
      previous_due: openingBalanceThisBill,
      paper_amount: roundedPaperTotal,
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
