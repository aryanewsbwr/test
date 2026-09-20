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
  year: string | number;
  previous_due: number;
  paper_amount: number;
  delivery_amount: number;
  discount_amount: number;
  retail_sale_amount: number;
  total_payable: number;
  breakup: BillingLineItem[];
  db_bill_items?: any[];
  db_billno_item?: any;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const FORTNIGHTLY_PUBS = new Set([11, 13, 17, 18, 23, 24, 33, 109, 216]);

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
  bills = [],
  receipts = [],
  regions = []
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
  bills: any[];
  receipts: any[];
  regions: any[];
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

  // Rate lookup function: ratechange table takes priority over standard rate table
  const getEffectiveRate = (publicaId: number, dayOfWeek: number, targetDateIso: string): number => {
    // 1. Check ratechanges: rc.Publica_id = publica_id AND (rc.Dayofweek = dayOfWeek OR rc.Dayofweek = 0) AND rc.Dated <= targetDateIso ORDER BY rc.Dated DESC LIMIT 1
    const matchingChanges = ratechanges.filter(rc => {
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
      return top.NewRate !== undefined ? top.NewRate : (top.new_rate !== undefined ? top.new_rate : (top.newrate || 0));
    }

    // 2. Fallback to standard rates table: r.Publica_id = publica_id AND r.Dayofweek = dayOfWeek
    const stdRate = rates.find(r => {
      const rPub = r.Publica_id || r.publica_id;
      const rDay = r.Dayofweek !== undefined ? r.Dayofweek : r.dayofweek;
      return rPub === publicaId && rDay === dayOfWeek;
    });
    if (stdRate) {
      const val = stdRate.Rate !== undefined ? stdRate.Rate : stdRate.rate;
      if (val !== undefined && val !== null && val > 0) return Number(val);
    }

    // 3. Fallback any standard rate for publication
    const anyRate = rates.find(r => (r.Publica_id || r.publica_id) === publicaId);
    if (anyRate) {
      const val = anyRate.Rate !== undefined ? anyRate.Rate : anyRate.rate;
      if (val !== undefined && val !== null && val > 0) return Number(val);
    }

    return 5.0; // Standard fallback
  };

  // Holiday check: Daily newspapers skip on general (pub=0) and pub-specific holidays.
  // Periodicals ONLY skip if holiday explicitly specifies that exact publication_id.
  const isHoliday = (publicaId: number, targetDateIso: string, isDaily: boolean = true): boolean => {
    return holidays.some(h => {
      const hIso = parseLegacyDateToIso(h.oc_date || h.Oc_Date || h.dated || h.Dated);
      if (!hIso) return false;
      const hPub = h.publication_id || h.publica_id || h.Publica_id;
      if (isDaily) {
        return hIso === targetDateIso && (!hPub || hPub === 0 || hPub === publicaId);
      } else {
        return hIso === targetDateIso && hPub === publicaId;
      }
    });
  };

  // Discontinue check: checks active suspension / permanent stop
  const isDiscontinued = (custId: number, publicaId: number, targetDateIso: string): boolean => {
    return discontinues.some(d => {
      const dCust = d.customer_id || d.Customer_id;
      if (dCust !== custId) return false;

      const dPub = d.publica_id || d.Publica_id;
      if (dPub && dPub !== 0 && dPub !== publicaId) return false;

      const tempFrom = parseLegacyDateToIso(d.temp_from || d.Temp_From || d.entry_date || d.EntryDate);
      if (!tempFrom) return false;

      const isPerm = (d.temp_perma || d.Temp_Perma || 'P').toUpperCase().startsWith('P');
      if (isPerm) {
        return targetDateIso >= tempFrom;
      } else {
        const tempTo = parseLegacyDateToIso(d.temp_to || d.Temp_To);
        if (!tempTo) return targetDateIso >= tempFrom;
        return targetDateIso >= tempFrom && targetDateIso <= tempTo;
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

  for (const b of bills) {
    const cid = b.customer_id || b.Customer_id;
    const bMonth = (b.month || b.Month || '').toLowerCase().trim();
    const mIdx = FY_MONTH_ORDER[bMonth];

    if (bMonth === 'dues') {
      const val = Number(b.due_amt !== undefined ? b.due_amt : (b.Due_Amt || 0));
      yearEndDuesMap.set(cid, val);
    } else if (mIdx !== undefined && mIdx < targetFyIndex) {
      // Prior month in this FY
      const delAmt = Number(b.del_amt !== undefined ? b.del_amt : (b.Del_Amt || b.dely || b.Dely || 0));
      const disAmt = Number(b.dis_amt !== undefined ? b.dis_amt : (b.Dis_Amt || 0));
      let monthPaper = 0;
      if (b.totalamt !== undefined || b.TotalAmt !== undefined) {
        monthPaper = Number(b.totalamt !== undefined ? b.totalamt : b.TotalAmt);
      } else if (b.balance !== undefined || b.Balance !== undefined) {
        const bal = Number(b.balance !== undefined ? b.balance : b.Balance);
        const due = Number(b.due_amt !== undefined ? b.due_amt : (b.Due_Amt || 0));
        monthPaper = bal - due - delAmt + disAmt;
      }
      const netMonthCharge = monthPaper + delAmt - disAmt;
      priorBilledInFyMap.set(cid, (priorBilledInFyMap.get(cid) || 0) + netMonthCharge);
    }
  }

  // Step C: Prior Receipts in the CURRENT FY (strictly prior to target billing month)
  const priorReceiptsInFyMap = new Map<number, number>();
  for (const r of receipts) {
    const cid = r.customer_id || r.Customer_id;
    const rMonth = (r.month || r.Month || '').toLowerCase().trim();
    const mIdx = FY_MONTH_ORDER[rMonth];

    let isPrior = false;
    if (mIdx !== undefined && mIdx < targetFyIndex) {
      isPrior = true;
    } else {
      const recDate = parseLegacyDateToIso(r.mal_recp_dt || r.MalRecpDt || r.bill_date || r.BillDate);
      if (recDate && recDate < monthStartIso) {
        isPrior = true;
      }
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
  let nextBillId = 1001;

  for (let cIdx = 0; cIdx < targetCustomers.length; cIdx++) {
    const cust = targetCustomers[cIdx];
    const custId = cust.customer_id || cust.Customer_id;
    const custSubs = subsByCust.get(custId) || [];

    const custBreakup: BillingLineItem[] = [];
    const dbBillItems: any[] = [];
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
      const pubName = pub?.name || pub?.public_name || pub?.Public_name || cd.publication_name || `Publication #${pubId}`;
      const typeP = pub?.type_p || pub?.TypeP || pub?.frequency || 'Daily';
      const magzineDay = pub?.magzine_day || pub?.MagzineDay || 0;
      const isDaily = typeP.toLowerCase() === 'daily' || typeP.toLowerCase() === 'newspaper';
      const isWeekly = magzineDay >= 1 || typeP.toLowerCase() === 'weekly';
      const isFortnightly = FORTNIGHTLY_PUBS.has(pubId) || typeP.toLowerCase().includes('fortnight') || typeP.toLowerCase().includes('bi-month') || typeP.toLowerCase().includes('bi-weekly');

      const sDateIso = parseLegacyDateToIso(cd.s_date || cd.S_Date || cd.created_at) || '2000-01-01';
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

          // Active date range check
          if (targetDateIso < sDateIso) continue;
          if (cDateIso && targetDateIso >= cDateIso) continue;

          // Holiday & Discontinue checks
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
          if (isHoliday(pubId, targetDateIso, false)) continue;
          if (isDiscontinued(custId, pubId, targetDateIso)) continue;

          const rate = getEffectiveRate(pubId, legacyDayOfWeek, targetDateIso);
          if (rate > 0) {
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
          if (isDiscontinued(custId, pubId, pDateIso)) continue;

          const rate = getEffectiveRate(pubId, 1, pDateIso);
          if (rate > 0) {
            rateDaysMap.set(rate, (rateDaysMap.get(rate) || 0) + 1);
          }
        }
      }
      // CASE D: Monthly + Quarterly Magazines (1st of month)
      else {
        const pDateIso = `${calendarYear}-${String(monthNum).padStart(2, '0')}-01`;
        const isQuarterlyAllowed = pubId !== 75 || [1, 4, 7, 10].includes(monthNum);

        if (isQuarterlyAllowed && sDateIso <= monthEndIso && (!cDateIso || cDateIso > monthStartIso)) {
          if (!isDiscontinued(custId, pubId, pDateIso)) {
            const rate = getEffectiveRate(pubId, 1, pDateIso);
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

      // Discount Priority: Subscription-level % (cd.dis) strictly overrides Customer-level % (cust.discount).
      // They NEVER combine or stack.
      const subDisRaw = cd.dis !== undefined && cd.dis !== null ? cd.dis : (cd.discount_percent !== undefined ? cd.discount_percent : cd.Dis);
      const subDisPercent = Number(subDisRaw || 0);
      const custDisPercent = Number(cust.discount !== undefined ? cust.discount : (cust.dis || cust.Dis || 0));
      const applicableDisPercent = subDisPercent > 0 ? subDisPercent : custDisPercent;

      if (applicableDisPercent > 0 && subPaperTotal > 0) {
        const subDisAmt = Math.round((subPaperTotal * (applicableDisPercent / 100)) * 100) / 100;
        customerDiscountTotal += subDisAmt;
      }

      // Delivery Charges per Subscription
      const dely = Number(cd.delivery_charge !== undefined ? cd.delivery_charge : (cd.dely || cd.Dely || 0));
      if (dely > 0 && (!cDateIso || cDateIso > monthStartIso)) {
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
      }
    }

    // Customer Discount Total Line in Breakup
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
    // 2. PREVIOUS DUE (Sort_order 4)
    // =========================================================================
    // Prior financial year carry-forward anchor (Month = 'Dues' in current FY table).
    // If not found (new customer created this FY), fallback to cust.dueamount.
    // NEVER sum both cust.dueamount and Year_End_Dues together!
    const yearEndOpeningDue = yearEndDuesMap.has(custId)
      ? yearEndDuesMap.get(custId)!
      : Number(cust.dueamount || cust.Dueamount || 0);

    const priorBilledInFy = priorBilledInFyMap.get(custId) || 0;
    const priorPaidInFy = priorReceiptsInFyMap.get(custId) || 0;
    const previousDue = Math.round((yearEndOpeningDue + priorBilledInFy - priorPaidInFy) * 100) / 100;

    if (previousDue !== 0) {
      custBreakup.push({
        customer_id: custId,
        name_eng: cust.name_eng || cust.Name_eng || `Customer #${custId}`,
        customer_hindi: cust.name_hindi || cust.Name_hindi || '',
        sort_order: 4,
        item: 'Previous Due (Opening + Prior Ledger)',
        rate: null,
        qty: null,
        days_or_copies: null,
        amount: previousDue
      });
    }

    // =========================================================================
    // 3. GRAND TOTAL (Sort_order 9)
    // =========================================================================
    const totalPayable = Math.round((previousDue + customerPaperTotal + customerDeliveryTotal - customerDiscountTotal) * 100) / 100;

    // Only generate bill if customer has active papers or outstanding dues
    if (totalPayable === 0 && customerPaperTotal === 0 && custBreakup.length === 0) {
      continue;
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

    const dbBillnoItem = {
      Bill_id: nextBillId,
      Customer_id: custId,
      Region_id: custRegionId,
      Due_Amt: previousDue !== 0 ? previousDue : null,
      Del_Amt: customerDeliveryTotal > 0 ? customerDeliveryTotal : null,
      Dis_Amt: customerDiscountTotal > 0 ? customerDiscountTotal : null,
      Month: standardMonthName,
      year: String(startYear),
      Balance: totalPayable
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
      previous_due: previousDue,
      paper_amount: customerPaperTotal,
      delivery_amount: customerDeliveryTotal,
      discount_amount: customerDiscountTotal,
      retail_sale_amount: 0,
      total_payable: totalPayable,
      breakup: custBreakup,
      db_bill_items: dbBillItems,
      db_billno_item: dbBillnoItem
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
    breakup_lines: allBreakupLines
  };
}
