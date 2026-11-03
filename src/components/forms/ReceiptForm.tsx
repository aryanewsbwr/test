'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fySuffix, previousFySuffix } from '@/lib/financialYear';
import { receiptBookWarning } from '@/lib/receiptBooks';
import { Customer, Region } from '@/lib/types';
import { sushaToUnicode } from '@/lib/transliteration';
import { mobilesIn, withoutMobiles } from '@/lib/phoneNumbers';

interface ReceiptFormProps {
  onClose: () => void;
}

interface AllotmentInfo {
  sno: number;
  collector_name: string;
  receipt_from: number;
  receipt_to: number;
  allot_date: string;
  rec_date?: string | null;
}

const ALL_FY_MONTHS = [
  'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December', 'January', 'February', 'March'
];

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

const getFyMonthIndex = (mStr?: string | null): number => {
  if (!mStr) return 99;
  const clean = mStr.trim().toLowerCase();
  if (FY_MONTH_ORDER[clean] !== undefined) return FY_MONTH_ORDER[clean];
  const prefix = clean.slice(0, 3);
  if (FY_MONTH_ORDER[prefix] !== undefined) return FY_MONTH_ORDER[prefix];
  return 99;
};

// Remarks hold saved details as JSON, with the typed note in narr. Older updates nested
// the JSON inside narr again, so unwrap until only the note is left.
const plainNarration = (value: any): string => {
  let text = String(value ?? '');
  while (text.trim().startsWith('{')) {
    try {
      text = String(JSON.parse(text).narr ?? '');
    } catch {
      break;
    }
  }
  return text;
};

const compareReceipts = (a: any, b: any): number => {
  const yA = parseInt(a.year || '2025', 10);
  const yB = parseInt(b.year || '2025', 10);
  if (yA !== yB) return yA - yB;
  const mA = getFyMonthIndex(a.month || a.Month);
  const mB = getFyMonthIndex(b.month || b.Month);
  if (mA !== mB) return mA - mB;
  return Number(a.rep_id || a.receipt_id || 0) - Number(b.rep_id || b.receipt_id || 0);
};

const normalizeMonthName = (mStr?: string | null): string => {
  if (!mStr) return 'October';
  const clean = mStr.trim().toLowerCase();
  if (clean === 'dues') return 'Dues';
  const found = ALL_FY_MONTHS.find(m => 
    m.toLowerCase().startsWith(clean.slice(0, 3)) || clean.startsWith(m.toLowerCase().slice(0, 3))
  );
  return found || mStr;
};

const isDuesRow = (bill: any) => String(bill.month ?? bill.Month ?? '').trim().toLowerCase() === 'dues';

const getCurrentMonthName = () => {
  const mIndex = new Date().getMonth();
  const calMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return calMonths[mIndex] || 'October';
};

export default function ReceiptForm({ onClose }: ReceiptFormProps) {
  const now = new Date();
  const defDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  // Top Customer & Collection States
  const [priorityId, setPriorityId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerMobiles, setCustomerMobiles] = useState<string[]>([]);
  const [customerRegion, setCustomerRegion] = useState('');
  
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allRegions, setAllRegions] = useState<Region[]>([]);
  const [filteredCustomerSuggestions, setFilteredCustomerSuggestions] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(0);

  // Collection Agent & Allotted Book Range (No default pre-selected)
  const [collectionAgentName, setCollectionAgentName] = useState('');
  const [selectedBookRange, setSelectedBookRange] = useState('');
  const [collectors, setCollectors] = useState<{ collect_id: number; name: string }[]>([]);
  const [allotments, setAllotments] = useState<AllotmentInfo[]>([]);
  const [activeBookRange, setActiveBookRange] = useState('');

  // Middle Grids States
  const [customerBills, setCustomerBills] = useState<any[]>([]);
  const [customerReceipts, setCustomerReceipts] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string | number | null>(null);

  // Control Section States
  const [receiptNo, setReceiptNo] = useState<number>(1196605);
  const [receiptDate, setReceiptDate] = useState(defDateStr);
  const [billNo, setBillNo] = useState('');
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(getCurrentMonthName());
  
  const [billAmt, setBillAmt] = useState<number | string>('');
  const [manualRcpAmt, setManualRcpAmt] = useState<number | string>('');
  const [lessAmt, setLessAmt] = useState<number | string>('');
  const [revAmt, setRevAmt] = useState<number | string>('');
  const [balAmt, setBalAmt] = useState<number | string>('');
  const [manualRecpNo, setManualRecpNo] = useState('');
  const [manualRecpDate, setManualRecpDate] = useState(defDateStr);
  
  const [totalCustomerDue, setTotalCustomerDue] = useState<number>(0);
  const [priorCreditBal, setPriorCreditBal] = useState<number>(0);
  const [totalPayableAmt, setTotalPayableAmt] = useState<number | null>(null);
  const [narration, setNarration] = useState('');
  
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Cheque'>('Cash');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeDate, setChequeDate] = useState('');

  const [msg, setMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Update Receipt Modal States matching FoxPro screen
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | number | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateRepId, setUpdateRepId] = useState<string | number>('');
  const [updateBillNo, setUpdateBillNo] = useState<string | number>('');
  const [updateRecpNo, setUpdateRecpNo] = useState<string | number>('');
  const [updateRecpDate, setUpdateRecpDate] = useState('');
  const [updateYear, setUpdateYear] = useState('2026');
  const [updateMonth, setUpdateMonth] = useState('April');
  const [updateBillAmt, setUpdateBillAmt] = useState<string | number>('');
  const [updateMalRecpAmt, setUpdateMalRecpAmt] = useState<string | number>('');
  const [updateLessAmt, setUpdateLessAmt] = useState<string | number>('');
  const [updateRevAmt, setUpdateRevAmt] = useState<string | number>('');
  const [updateBal, setUpdateBal] = useState<string | number>('');
  const [updateMalRecpNo, setUpdateMalRecpNo] = useState<string | number>('');
  const [updateMalRecpDt, setUpdateMalRecpDt] = useState('');
  const [updateDebit, setUpdateDebit] = useState<string | number>('');
  const [updateCredit, setUpdateCredit] = useState<string | number>('');
  const [updatePaymentMode, setUpdatePaymentMode] = useState<'Cash' | 'Cheque'>('Cash');
  const [updateChequeNo, setUpdateChequeNo] = useState('');
  const [updateChequeDate, setUpdateChequeDate] = useState('');
  const [updateTotalAmt, setUpdateTotalAmt] = useState<string | number>('');
  const [updateNarration, setUpdateNarration] = useState('');
  const [isUpdatingReceipt, setIsUpdatingReceipt] = useState(false);
  const [isDeletingReceipt, setIsDeletingReceipt] = useState(false);

  // Refs for keyboard shortcuts & Enter/Tab navigation
  const customerInputRef = useRef<HTMLInputElement>(null);
  const customerIdRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const monthSelectRef = useRef<HTMLSelectElement>(null);
  const billNoRef = useRef<HTMLInputElement>(null);
  const billAmtRef = useRef<HTMLInputElement>(null);
  const manualRcpAmtRef = useRef<HTMLInputElement>(null);
  const lessAmtRef = useRef<HTMLInputElement>(null);
  const revAmtRef = useRef<HTMLInputElement>(null);
  const balRef = useRef<HTMLInputElement>(null);
  const manualRecpNoRef = useRef<HTMLInputElement>(null);
  const manualRecpDateRef = useRef<HTMLInputElement>(null);
  const chequeNoRef = useRef<HTMLInputElement>(null);
  const chequeDateRef = useRef<HTMLInputElement>(null);
  const applyBtnRef = useRef<HTMLButtonElement>(null);

  // Shift+Tab goes back along the same boxes Enter and Tab go forward through,
  // skipping any that are hidden, locked or read only
  const ENTRY_ORDER = [customerInputRef, monthSelectRef, manualRcpAmtRef, lessAmtRef, revAmtRef, manualRecpNoRef, manualRecpDateRef, chequeNoRef, chequeDateRef, applyBtnRef];
  const focusPrevious = (from: React.RefObject<HTMLElement>) => {
    for (let i = ENTRY_ORDER.indexOf(from as any) - 1; i >= 0; i--) {
      const box = ENTRY_ORDER[i].current as (HTMLInputElement | null);
      if (box && box.offsetParent !== null && !box.disabled && !box.readOnly) {
        box.focus();
        return;
      }
    }
  };

  // Custom dropdown states for Collection Name and Allotted Books
  const [isCollectionDropdownOpen, setIsCollectionDropdownOpen] = useState(true);
  const [highlightedCollectionIndex, setHighlightedCollectionIndex] = useState(0);
  const collectionContainerRef = useRef<HTMLDivElement>(null);
  const collectionButtonRef = useRef<HTMLDivElement>(null);

  const [isBookDropdownOpen, setIsBookDropdownOpen] = useState(false);
  const [highlightedBookIndex, setHighlightedBookIndex] = useState(0);
  const bookContainerRef = useRef<HTMLDivElement>(null);
  const bookButtonRef = useRef<HTMLDivElement>(null);

  // Allotted Books for chosen Collector (in exact sequential order sno ASC matching Receipt Allotment)
  const collectorBooks = useMemo(() => {
    if (!collectionAgentName) return [];
    const matched = allotments.filter(a => (a.collector_name || '').toLowerCase() === collectionAgentName.toLowerCase());
    return [...matched].sort((a, b) => (Number(a.sno) || 0) - (Number(b.sno) || 0));
  }, [collectionAgentName, allotments]);

  // Financial Year Months up to Current Date / Receipt Date (e.g. Dues, April ... October)
  const availableMonths = useMemo(() => {
    let refDate = new Date();
    if (receiptDate) {
      const parts = receiptDate.split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
          refDate = new Date(y, m, d);
        }
      }
    }

    const currentMonthIdx = refDate.getMonth(); // 0 for Jan, 3 for Apr, 9 for Oct
    // Months elapsed since April in the financial year:
    const elapsedCount = currentMonthIdx >= 3
      ? (currentMonthIdx - 3 + 1)
      : (currentMonthIdx + 12 - 3 + 1);

    const activeFyMonths = ALL_FY_MONTHS.slice(0, Math.min(12, Math.max(1, elapsedCount)));
    return ['Dues', ...activeFyMonths];
  }, [receiptDate]);

  // 1. Initial Load: Next Receipt Number, Customers, Regions, Collectors & Allotments
  useEffect(() => {
    // Automatically open and focus Collection Name dropdown immediately on mount
    setIsCollectionDropdownOpen(true);
    setTimeout(() => {
      if (collectionButtonRef.current) {
        collectionButtonRef.current.focus();
      }
    }, 50);

    // Load next receipt number
    supabase
      .from(`receipt${fySuffix()}`)
      .select('recp_no')
      .order('recp_no', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const highestNo = Number(data[0].recp_no) || 1196604;
          setReceiptNo(highestNo + 1);
        } else {
          setReceiptNo(1196605);
        }
      });

    // Load Collectors Master (sorted alphabetically)
    supabase
      .from('collect')
      .select('*')
      .then(({ data }) => {
        if (data && data.length > 0) {
          const list = data.map((c: any) => ({
            collect_id: c.Collect_id || c.collect_id || c.id,
            name: c.name || c.collector_name || `Collector #${c.Collect_id}`
          })).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
          setCollectors(list);
        }
      });

    // Load Regions Master (regiond, the list the Region screen keeps)
    fetch('/api/regions')
      .then(res => res.json())
      .then(data => {
        if (data?.regions) setAllRegions(data.regions);
      })
      .catch(() => {});

    // Load every customer (24,000+) from the database for search as you type
    fetch('/api/customers?all=true')
      .then(res => res.json())
      .then(data => {
        if (data?.customers) setAllCustomers(data.customers);
      })
      .catch(() => {});

    // Load Receipt Allotments (starts empty, user selects collector)
    fetch('/api/receipt-allotment')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.all_allotments) {
          setAllotments(data.all_allotments);
        }
      })
      .catch(err => console.warn('Could not load allotments:', err));
  }, []);

  // Update active book range badge for selected collector & auto-open book dropdown
  const handleCollectorChange = (name: string, customAllotments?: AllotmentInfo[], autoOpenBooks: boolean = true) => {
    setCollectionAgentName(name);
    setIsCollectionDropdownOpen(false);
    if (!name) {
      setActiveBookRange('');
      setSelectedBookRange('');
      return;
    }
    const source = customAllotments || allotments;
    const matched = source.filter(a => (a.collector_name || '').toLowerCase() === name.toLowerCase());
    if (matched && matched.length > 0) {
      const sorted = [...matched].sort((a, b) => (Number(a.sno) || 0) - (Number(b.sno) || 0));
      const active = [...sorted].reverse().find(a => !a.rec_date || a.rec_date === '-') || sorted[sorted.length - 1];
      const rangeStr = `${active.receipt_from} - ${active.receipt_to}`;
      setActiveBookRange(rangeStr);
      setSelectedBookRange(rangeStr);
      setManualRecpNo(String(active.receipt_from));
      const activeIdx = sorted.findIndex(b => `${b.receipt_from} - ${b.receipt_to}` === rangeStr);
      setHighlightedBookIndex(activeIdx >= 0 ? activeIdx : sorted.length - 1);
    } else {
      setActiveBookRange('');
      setSelectedBookRange('');
    }

    if (autoOpenBooks) {
      setTimeout(() => {
        setIsBookDropdownOpen(true);
        if (bookButtonRef.current) {
          bookButtonRef.current.focus();
        }
      }, 50);
    }
  };

  const handleSelectBook = (rangeStr: string) => {
    setSelectedBookRange(rangeStr);
    setActiveBookRange(rangeStr);
    setIsBookDropdownOpen(false);
    if (rangeStr) {
      const parts = rangeStr.split('-').map(s => s.trim());
      if (parts[0]) {
        setManualRecpNo(parts[0]);
      }
    }
    setTimeout(() => {
      if (customerInputRef.current) {
        customerInputRef.current.focus();
      }
    }, 50);
  };

  const handleBookRangeChange = (rangeStr: string) => {
    handleSelectBook(rangeStr);
  };

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
      if (collectionContainerRef.current && !collectionContainerRef.current.contains(e.target as Node)) {
        setIsCollectionDropdownOpen(false);
      }
      if (bookContainerRef.current && !bookContainerRef.current.contains(e.target as Node)) {
        setIsBookDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 2. Customer Typeahead Filter
  const handleCustomerSearchChange = async (query: string) => {
    setCustomerSearchQuery(query);
    if (!query.trim()) {
      setFilteredCustomerSuggestions([]);
      setIsCustomerDropdownOpen(false);
      return;
    }

    const q = query.toLowerCase().trim();
    let matches = allCustomers.filter(c => 
      String(c.name_eng || '').toLowerCase().includes(q) ||
      String(c.name_hindi || '').toLowerCase().includes(q) ||
      String(c.add1 || '').toLowerCase().includes(q) ||
      String(c.add2 || '').toLowerCase().includes(q) ||
      String(c.phone || '').includes(q) ||
      String(c.customer_id || '').includes(q) ||
      String(c.priority || '').includes(q)
    ).slice(0, 30);

    // If local in-memory array doesn't have matches (e.g. before initial load completes), query backend API directly
    if (matches.length === 0) {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=30`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.customers && data.customers.length > 0) {
            matches = data.customers;
          }
        }
      } catch (err) {
        console.warn('Backend search error:', err);
      }
    }

    setFilteredCustomerSuggestions(matches);
    setHighlightedCustomerIndex(0);
    setIsCustomerDropdownOpen(matches.length > 0);
  };

  // 3. Load Customer Details & Unpaid Bills & Previous Receipts
  // Helper for Bill Display Amount (handles bill_amt, due_amt, paper_amount, balance)
  const getBillDisplayAmount = (b: any): number => {
    if (b.bill_amt !== null && b.bill_amt !== undefined && b.bill_amt !== '') {
      return Number(b.bill_amt) || 0;
    }
    if (b.due_amt !== null && b.due_amt !== undefined && b.due_amt !== '') {
      return Number(b.due_amt) || 0;
    }
    if (b.paper_amount !== null && b.paper_amount !== undefined && b.paper_amount !== '') {
      return Number(b.paper_amount) || 0;
    }
    if (b.Bill_Amt !== null && b.Bill_Amt !== undefined) {
      return Number(b.Bill_Amt) || 0;
    }
    if (b.balance !== null && b.balance !== undefined && b.balance !== '') {
      return Math.abs(Number(b.balance)) || 0;
    }
    return 0;
  };

  // Advance already paid towards this bill: what the customer owes overall is less than the bill.
  // billno.balance can't be used here: it stores the amount payable as a negative number.
  const getPriorCreditBalance = (effectiveDues: number, billAmount: number): number => {
    return Math.max(0, billAmount - effectiveDues);
  };

  // Select Month and find corresponding bill
  const handleSelectMonth = (m: string, billsList?: any[], receiptsList?: any[], custDues?: number) => {
    const normalized = normalizeMonthName(m);
    setMonth(normalized);
    const bList = billsList || customerBills;
    const rList = receiptsList || customerReceipts;
    const effectiveDues = custDues !== undefined ? custDues : totalCustomerDue;

    if (!bList || bList.length === 0) {
      return;
    }

    const cleanM = (m || '').trim().toLowerCase();
    const matchedBill = bList.find((b: any) => {
      const bM = (b.month || b.Month || '').trim().toLowerCase();
      return bM === cleanM || bM.startsWith(cleanM.slice(0, 3)) || cleanM.startsWith(bM.slice(0, 3));
    });

    if (matchedBill) {
      const bId = matchedBill.bill_no?.toString() || matchedBill.bill_id?.toString() || matchedBill.Bill_id?.toString() || '';
      setSelectedBillId(bId);
      setBillNo(bId);
      setYear(String(matchedBill.year || matchedBill.Year || '2026'));

      const bDisplayAmt = getBillDisplayAmount(matchedBill);
      setBillAmt(bDisplayAmt);

      // Keep payment receipt fields clean for manual entry
      setManualRcpAmt('');
      setLessAmt('');
      setRevAmt('');
      setBalAmt('');
      setTotalPayableAmt(0);
      setPriorCreditBal(0);
    }
  };

  // 3. Load Customer Details & Unpaid Bills & Previous Receipts
  const handleSelectCustomer = async (cust: Customer, stayInSearch = false) => {
    setIsCustomerDropdownOpen(false);
    setCustomerSearchQuery(cust.name_eng || cust.name_hindi || '');
    setCustomerName(cust.name_eng || cust.name_hindi || '');
    setCustomerId(String(cust.customer_id));
    setPriorityId(cust.priority?.toString() || '');

    // English address when there is one, otherwise the Hindi one decoded from the old font.
    // Mobile numbers typed into the address are shown with the phone numbers instead.
    const englishAddress = withoutMobiles([cust.add1, cust.add2].filter(Boolean).join(', '));
    const hindiAddress = String(cust.hindi_add || '').trim();
    const decodedHindi = /[ऀ-ॿ]/.test(hindiAddress) ? hindiAddress : sushaToUnicode(hindiAddress);
    setCustomerAddress(englishAddress || withoutMobiles(decodedHindi));
    setCustomerMobiles(mobilesIn(cust.phone, cust.add1, cust.add2, hindiAddress));

    const reg = allRegions.find(r => r.region_id === cust.region_id);
    setCustomerRegion(reg ? (reg.region_name || `SR${reg.region_id}`) : (cust.region_id ? `SR${cust.region_id}` : ''));

    // Reset control section fields initially
    setBillNo('');
    setYear(String(new Date().getFullYear()));
    setMonth(getCurrentMonthName());
    setBillAmt('');
    setManualRcpAmt('');
    setLessAmt('');
    setRevAmt('');
    setBalAmt('');
    setTotalPayableAmt(null);
    setPriorCreditBal(0);
    setNarration('');

    // Fetch Bills & Receipts
    setIsLoadingHistory(true);
    try {
      // 1. Fetch Bills (billno20262027 or billno20252026) along with line item amounts from bill20262027
      let bList: any[] = [];
      const [b26Res, items26Res] = await Promise.all([
        supabase
          .from(`billno${fySuffix()}`)
          .select('*')
          .eq('customer_id', cust.customer_id)
          .order('bill_id', { ascending: true }),
        supabase
          .from(`bill${fySuffix()}`)
          .select('bill_id, total_amt')
          .eq('customer_id', cust.customer_id)
      ]);

      const sumByBillId = new Map<number, number>();
      if (items26Res.data) {
        items26Res.data.forEach((it: any) => {
          const bid = Number(it.bill_id);
          sumByBillId.set(bid, (sumByBillId.get(bid) || 0) + (Number(it.total_amt) || 0));
        });
      }

      if (b26Res.data && b26Res.data.length > 0) {
        bList = b26Res.data.map((b: any) => {
          const bid = Number(b.bill_id);
          const computedAmt = sumByBillId.get(bid);
          const delAmt = Number(b.del_amt ?? b.Del_amt ?? b.Del_Amt ?? 0);
          const disAmt = Number(b.dis_amt ?? b.Dis_amt ?? b.Dis_Amt ?? 0);
          // Only the yearly 'Dues' row carries the balance brought forward. A month with no
          // papers only repeats the balance, so it charges just its delivery less discount.
          const finalAmt = isDuesRow(b)
            ? Number(b.due_amt ?? b.Due_Amt ?? 0)
            : (computedAmt ?? 0) + delAmt - disAmt;
          return {
            ...b,
            bill_amt: finalAmt,
            due_amt: finalAmt,
            del_amt: delAmt,
            dis_amt: disAmt
          };
        });
      } else {
        // Fallback to 20252026
        const [b25Res, items25Res] = await Promise.all([
          supabase
            .from(`billno${previousFySuffix()}`)
            .select('*')
            .eq('customer_id', cust.customer_id)
            .order('bill_id', { ascending: true }),
          supabase
            .from(`bill${previousFySuffix()}`)
            .select('bill_id, total_amt')
            .eq('customer_id', cust.customer_id)
        ]);

        if (items25Res.data) {
          items25Res.data.forEach((it: any) => {
            const bid = Number(it.bill_id);
            sumByBillId.set(bid, (sumByBillId.get(bid) || 0) + (Number(it.total_amt) || 0));
          });
        }

        if (b25Res.data && b25Res.data.length > 0) {
          bList = b25Res.data.map((b: any) => {
            const bid = Number(b.Bill_id || b.bill_id);
            const computedAmt = sumByBillId.get(bid);
            const delAmt = Number(b.del_amt ?? b.Del_amt ?? b.Del_Amt ?? 0);
            const disAmt = Number(b.dis_amt ?? b.Dis_amt ?? b.Dis_Amt ?? 0);
            const finalAmt = isDuesRow(b)
              ? Number(b.due_amt ?? b.Due_Amt ?? 0)
              : (computedAmt ?? 0) + delAmt - disAmt;
            return {
              ...b,
              bill_id: bid,
              customer_id: b.Customer_id || b.customer_id,
              month: b.Month || b.month,
              year: b.Year || b.year,
              bill_amt: finalAmt,
              due_amt: finalAmt,
              del_amt: delAmt,
              dis_amt: disAmt
            };
          });
        }
      }

      // Sort customer bills strictly in chronological monthly order (Dues -> April -> May -> ... -> March)
      if (bList && bList.length > 0) {
        bList.sort((a: any, b: any) => {
          const yA = parseInt(a.year || a.Year || '2026', 10);
          const yB = parseInt(b.year || b.Year || '2026', 10);
          if (yA !== yB) return yA - yB;
          return getFyMonthIndex(a.month || a.Month) - getFyMonthIndex(b.month || b.Month);
        });
      }

      setCustomerBills(bList || []);

      // 2. Fetch this year's receipts from the database
      let rList: any[] = [];
      try {
        const r26Res = await supabase
          .from(`receipt${fySuffix()}`)
          .select('*')
          .eq('customer_id', cust.customer_id)
          .order('id', { ascending: true });
        if (r26Res.error) throw r26Res.error;

        const r26 = (r26Res.data || []).map((r: any) => {
          let parsedRemarks: any = null;
          if (r.remarks && typeof r.remarks === 'string' && r.remarks.trim().startsWith('{')) {
            try { parsedRemarks = JSON.parse(r.remarks); } catch (e) {}
          }
          const repId = r.receipt_id || r.Receipt_id || (r.id > 18383 ? r.id - 18383 : r.id);
          return {
            ...r,
            rep_id: repId,
            receipt_id: repId,
            bill_no: r.bill_no ?? parsedRemarks?.bill_no ?? '-',
            manual_rep_no: r.mal_rep_no ?? parsedRemarks?.manual_rep_no ?? '-',
            mal_rep_no: r.mal_rep_no ?? parsedRemarks?.manual_rep_no ?? '-',
            mal_recp_dt: r.mal_recp_dt ?? parsedRemarks?.mal_recp_dt ?? '-',
            balance: r.balance ?? parsedRemarks?.balance ?? 0,
            cash_chq: r.cash_chq ?? parsedRemarks?.cash_chq ?? 'Cash',
            r_amt: r.mal_recp_amt ?? r.r_amt ?? 0
          };
        });

        // Sort chronologically by year (2025 -> 2026), bill month (Dues, April .. March) and rep_id
        rList = [...r26].sort(compareReceipts);
      } catch (err) {
        console.warn('Error fetching receipts:', err);
      }

      setCustomerReceipts(rList || []);

      // 3. Compute Total Dues = Total Bills - Total Receipts (Including Less/Discount amount)
      const totalBillsCalc = bList.reduce((sum, b) => sum + (Number(b.bill_amt) || 0), 0);
      const totalRecpsCalc = rList.reduce((sum, r) => sum + (Number(r.mal_recp_amt ?? r.r_amt ?? 0) + Number(r.less_amt || 0)), 0);
      const calculatedDues = Math.round((totalBillsCalc - totalRecpsCalc) * 100) / 100;
      setTotalCustomerDue(calculatedDues);

      // 4. Auto-select latest bill month (e.g. Sept / October)
      let pendingMonth = getCurrentMonthName();
      if (bList.length > 0) {
        const lastBill = bList[bList.length - 1];
        if (lastBill && (lastBill.month || lastBill.Month)) {
          pendingMonth = normalizeMonthName(lastBill.month || lastBill.Month);
        }
      }
      handleSelectMonth(pendingMonth, bList, rList, calculatedDues);

      // Enter keeps the cursor in the search, with the name selected so typing starts a new search.
      // Tab or a click goes on to the Month.
      setTimeout(() => {
        if (stayInSearch) {
          customerInputRef.current?.focus();
          customerInputRef.current?.select();
        } else {
          monthSelectRef.current?.focus();
        }
      }, 50);

    } catch (err) {
      console.error('Error fetching customer bills/receipts:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Lookup customer by ID directly
  const handleLookupCustomerId = (idStr: string) => {
    setCustomerId(idStr);
    const cid = parseInt(idStr, 10);
    if (!isNaN(cid) && allCustomers.length > 0) {
      const match = allCustomers.find(c => c.customer_id === cid);
      if (match) {
        handleSelectCustomer(match);
      }
    }
  };

  // 4. Select Bill from Left Grid
  const handleSelectBill = (b: any) => {
    const bId = b.bill_no?.toString() || b.bill_id?.toString() || b.Bill_id?.toString() || '';
    setSelectedBillId(bId);
    setBillNo(bId);
    const m = normalizeMonthName(b.month || b.Month || getCurrentMonthName());
    setMonth(m);
    setYear(String(b.year || b.Year || '2026'));
    const amt = getBillDisplayAmount(b);

    // If there is no due (nothing owed, or an advance), data in control section should NOT be there!
    if (totalCustomerDue <= 0) {
      setBillAmt('');
      setManualRcpAmt('');
      setLessAmt('');
      setRevAmt('');
      setBalAmt('');
      setTotalPayableAmt(0);
      setPriorCreditBal(0);
      return;
    }

    setBillAmt(amt);
    const credit = getPriorCreditBalance(totalCustomerDue, amt);
    setPriorCreditBal(credit);
    setBalAmt(credit > 0 ? credit : 0);

    const currentLess = Number(lessAmt) || 0;
    const netPayable = Math.max(0, amt - currentLess - credit);
    setTotalPayableAmt(netPayable);

    setManualRcpAmt(netPayable > 0 ? netPayable : amt);
    setRevAmt(0);
    if (manualRcpAmtRef.current) manualRcpAmtRef.current.focus();
  };

  // Calculation Handlers matching authentic FoxPro / VB6 math
  const handleManualRcpAmtChange = (valStr: string) => {
    if (valStr === '') {
      setManualRcpAmt('');
      setBalAmt('');
      setTotalPayableAmt(0);
      return;
    }
    const val = parseFloat(valStr) || 0;
    setManualRcpAmt(val);
    setTotalPayableAmt(val);

    const bAmt = Number(billAmt) || (totalCustomerDue > 0 ? totalCustomerDue : 0);
    const currentLess = Number(lessAmt) || 0;
    const netDueForThisBill = bAmt - priorCreditBal;
    // Calculation: (Ml. Rcp. At. + Ls. Amt) - Bill Amt
    const bal = (val + currentLess) - netDueForThisBill;
    setBalAmt(bal);
  };

  const handleLessAmtChange = (valStr: string) => {
    if (valStr === '') {
      setLessAmt('');
      const bAmt = Number(billAmt) || 0;
      const netDueForThisBill = bAmt - priorCreditBal;
      const mVal = Number(manualRcpAmt) || 0;
      if (manualRcpAmt !== '') {
        setBalAmt(mVal - netDueForThisBill);
      }
      return;
    }
    const discount = parseFloat(valStr) || 0;
    setLessAmt(discount);

    const bAmt = Number(billAmt) || 0;
    const netDueForThisBill = bAmt - priorCreditBal;
    const curManual = Number(manualRcpAmt) || 0;
    const bal = (curManual + discount) - netDueForThisBill;
    setBalAmt(bal);
  };

  const handleRevAmtChange = (valStr: string) => {
    if (valStr === '') {
      setRevAmt('');
      return;
    }
    const val = parseFloat(valStr) || 0;
    setRevAmt(val);
    const bAmt = Number(billAmt) || (totalCustomerDue > 0 ? totalCustomerDue : 0);
    const currentLess = Number(lessAmt) || 0;
    const netDueForThisBill = bAmt - priorCreditBal;
    const bal = (val + currentLess) - netDueForThisBill;
    setBalAmt(bal);
  };

  const handleBillAmtChange = (valStr: string) => {
    if (valStr === '') {
      setBillAmt('');
      return;
    }
    const val = parseFloat(valStr) || 0;
    setBillAmt(val);
    const currentLess = Number(lessAmt) || 0;
    const curManual = Number(manualRcpAmt) || 0;
    const netDueForThisBill = val - priorCreditBal;
    if (manualRcpAmt !== '') {
      setBalAmt((curManual + currentLess) - netDueForThisBill);
    }
  };

  // 5. Grid Totals Calculation (Footer)
  const totalBillsSum = useMemo(() => {
    return customerBills.reduce((acc, b) => acc + getBillDisplayAmount(b), 0);
  }, [customerBills]);

  const totalReceiptsReceivedSum = useMemo(() => {
    return customerReceipts.reduce((acc, r) => acc + Number(r.r_amt ?? r.mal_recp_amt ?? r.R_amt ?? 0), 0);
  }, [customerReceipts]);

  // Balance Calculations: Effective received amount is taken from manual receipt amount
  const numManualRcpAmt = Number(manualRcpAmt) || 0;
  const numRevAmt = Number(revAmt) || 0;
  const numLessAmt = Number(lessAmt) || 0;
  const numBillAmt = Number(billAmt) || 0;
  const effectiveReceivedForDue = numManualRcpAmt > 0 ? numManualRcpAmt : numRevAmt;
  const calculatedRemainingBal = Math.round((totalCustomerDue - effectiveReceivedForDue - numLessAmt) * 100) / 100;

  // 6. Save / Apply Receipt & Advance to Next Entry Instantly
  const handleApply = async () => {
    if (!customerId || !customerName) {
      setMsg({ text: 'Please select a customer first.', isError: true });
      if (customerInputRef.current) customerInputRef.current.focus();
      return;
    }
    if (effectiveReceivedForDue <= 0 && numLessAmt <= 0) {
      setMsg({ text: 'Please enter a valid Manual Receipt Amount (Ml. Rcp. At.).', isError: true });
      if (manualRcpAmtRef.current) manualRcpAmtRef.current.focus();
      return;
    }
    const bookWarning = receiptBookWarning(manualRecpNo, selectedBookRange);
    if (bookWarning && !confirm(`${bookWarning}\n\nरसीद नंबर चुनी गई बुक में नहीं है। फिर भी सेव करें? (Save anyway?)`)) {
      if (manualRecpNoRef.current) manualRecpNoRef.current.focus();
      return;
    }

    setIsSaving(true);
    setMsg(null);

    try {
      const cid = parseInt(customerId, 10);
      // Re-read the highest number so two open screens can't hand out the same receipt no
      const { data: highestRows, error: highestErr } = await supabase
        .from(`receipt${fySuffix()}`)
        .select('recp_no')
        .order('recp_no', { ascending: false })
        .limit(1);
      if (highestErr) throw highestErr;
      const appliedReceiptNo = Math.max(receiptNo, (Number(highestRows?.[0]?.recp_no) || 0) + 1);
      const appliedManualNo = manualRecpNo;

      const metadata = {
        bill_no: billNo ? parseInt(billNo, 10) : null,
        manual_rep_no: appliedManualNo || null,
        mal_recp_dt: manualRecpDate || receiptDate || defDateStr,
        balance: calculatedRemainingBal,
        cash_chq: paymentMode,
        cheque_no: paymentMode === 'Cheque' ? chequeNo : null,
        cheque_date: paymentMode === 'Cheque' ? chequeDate : null,
        narr: narration || '',
        agent: collectionAgentName || ''
      };

      const receiptPayload = {
        recp_no: appliedReceiptNo,
        recp_date: receiptDate || defDateStr,
        customer_id: cid,
        bill_amt: numBillAmt || totalCustomerDue,
        less_amt: numLessAmt,
        mal_recp_amt: effectiveReceivedForDue,
        month: month || 'Sept',
        year: year || '2026',
        remarks: JSON.stringify(metadata)
      };

      // 1. Insert into receipt20262027
      const { data: insertedData, error: insertErr } = await supabase
        .from(`receipt${fySuffix()}`)
        .insert([receiptPayload])
        .select();

      // Stop here so a receipt that was not saved never changes the customer balance
      if (insertErr) throw insertErr;

      // 2. Adjust Customer Due Balance in Supabase Customer Table (cbal is minus when owed)
      await supabase
        .from('customer')
        .update({ 
          due_amount: calculatedRemainingBal,
          cbal: -calculatedRemainingBal
        })
        .eq('customer_id', cid);

      // 3. Compute proper sequential Rep. Id
      const createdId = insertedData && insertedData[0]?.id;
      const savedRepId = createdId
        ? (createdId > 18383 ? createdId - 18383 : createdId)
        : (customerReceipts.length + 1);

      // Immediately append the newly saved receipt to the Right Grid
      const newReceiptGridRow = {
        id: createdId,
        rep_id: savedRepId,
        receipt_id: savedRepId,
        receipt_no: appliedReceiptNo,
        recp_no: appliedReceiptNo,
        bill_id: billNo,
        bill_no: billNo,
        month: month,
        year: year,
        manual_rep_no: appliedManualNo,
        mal_rep_no: appliedManualNo,
        mal_recp_dt: manualRecpDate || receiptDate,
        bill_date: receiptDate,
        recp_date: receiptDate,
        bill_amt: numBillAmt || effectiveReceivedForDue,
        less_amt: numLessAmt,
        balance: calculatedRemainingBal,
        r_amt: effectiveReceivedForDue,
        mal_recp_amt: effectiveReceivedForDue,
        cash_chq: paymentMode
      };
      setCustomerReceipts(prev => [...prev, newReceiptGridRow].sort(compareReceipts));

      // 4. Update customer master in local state
      setAllCustomers(prev => prev.map(c => c.customer_id === cid ? { ...c, due_amount: calculatedRemainingBal, cbal: -calculatedRemainingBal } : c));
      setTotalCustomerDue(calculatedRemainingBal);

      setMsg({ 
        text: `Receipt #${appliedReceiptNo} applied successfully! Balance: ₹${calculatedRemainingBal.toFixed(2)}` 
      });

      // 5. Increment System Receipt No & Manual Receipt No for the next entry
      setReceiptNo(appliedReceiptNo + 1);
      const nextManualNo = parseInt(appliedManualNo, 10);
      if (!isNaN(nextManualNo) && nextManualNo > 0) {
        setManualRecpNo(String(nextManualNo + 1));
      }

      // 6. Reset Control Section fields matching original VB6 software (video sec_22)
      setBillNo('');
      setSelectedBillId('');
      setBillAmt('');
      setManualRcpAmt('');
      setLessAmt('');
      setRevAmt('');
      setBalAmt('');
      setTotalPayableAmt(0);
      setNarration('');
      setChequeNo('');
      setChequeDate('');
      setPriorCreditBal(0);

      // Reset customer search box and refocus for the next customer entry!
      setCustomerSearchQuery('');
      setTimeout(() => {
        if (customerInputRef.current) {
          customerInputRef.current.focus();
        }
      }, 80);

    } catch (err: any) {
      console.error('Error saving receipt:', err);
      setMsg({ text: `Error saving receipt: ${err.message || 'Database error'}`, isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  // Update Modal Handlers
  const populateUpdateFields = (target: any) => {
    const repId = target.rep_id || target.receipt_id || (target.id > 18383 ? target.id - 18383 : target.id) || '';
    const bAmt = Number(target.bill_amt ?? target.Bill_amt ?? 0);
    const mRecpAmt = Number(target.mal_recp_amt ?? target.r_amt ?? target.R_amt ?? 0);
    const lAmt = Number(target.less_amt ?? target.Less_amt ?? 0);
    const rev = mRecpAmt + lAmt;
    const bal = rev - bAmt;

    setUpdateRepId(repId);
    setUpdateBillNo(target.bill_no || target.bill_id || target.Bill_id || '');
    setUpdateRecpNo(target.receipt_no || target.recp_no || '');
    setUpdateRecpDate(target.recp_date || target.bill_date || target.Bill_date || defDateStr);
    setUpdateYear(String(target.year || target.Year || '2026'));
    setUpdateMonth(normalizeMonthName(target.month || target.Month || 'April'));
    setUpdateBillAmt(bAmt);
    setUpdateMalRecpAmt(mRecpAmt);
    setUpdateLessAmt(lAmt);
    setUpdateRevAmt(rev);
    setUpdateBal(bal);
    setUpdateMalRecpNo(target.manual_rep_no || target.mal_rep_no || target.Manual_rep_no || '0');
    setUpdateMalRecpDt(target.mal_recp_dt || target.recp_date || defDateStr);
    setUpdateDebit(bAmt);
    setUpdateCredit(mRecpAmt);
    setUpdateTotalAmt(bAmt);
    setUpdatePaymentMode(target.cash_chq === 'Cheque' ? 'Cheque' : 'Cash');
    setUpdateChequeNo(target.cheque_no || '');
    setUpdateChequeDate(target.cheque_date || '');
    setUpdateNarration(plainNarration(target.narr || target.remarks));
  };

  const openUpdateModal = (receiptToEdit?: any) => {
    let target = receiptToEdit;
    if (!target) {
      if (selectedReceiptId) {
        target = customerReceipts.find(r => {
          const rid = r.rep_id || r.receipt_id || (r.id > 18383 ? r.id - 18383 : r.id);
          return String(rid) === String(selectedReceiptId);
        });
      }
      if (!target && customerReceipts.length > 0) {
        target = customerReceipts[customerReceipts.length - 1];
      }
    }

    if (!target) {
      setMsg({ text: 'No receipt available to update.', isError: true });
      return;
    }

    const targetRid = target.rep_id || target.receipt_id || (target.id > 18383 ? target.id - 18383 : target.id);
    setSelectedReceiptId(targetRid);
    populateUpdateFields(target);
    setIsUpdateModalOpen(true);
  };

  const handleRepNoChange = (newRepId: string) => {
    setUpdateRepId(newRepId);
    const matched = customerReceipts.find(r => {
      const rid = r.rep_id || r.receipt_id || (r.id > 18383 ? r.id - 18383 : r.id);
      return String(rid) === String(newRepId).trim();
    });
    if (matched) {
      populateUpdateFields(matched);
    }
  };

  const handleUpdateMalRecpAmtChange = (val: string) => {
    setUpdateMalRecpAmt(val);
    const mAmt = Number(val) || 0;
    const lAmt = Number(updateLessAmt) || 0;
    const bAmt = Number(updateBillAmt) || 0;
    const rev = mAmt + lAmt;
    setUpdateRevAmt(rev);
    setUpdateBal(rev - bAmt);
    setUpdateCredit(mAmt);
  };

  const handleUpdateLessAmtChange = (val: string) => {
    setUpdateLessAmt(val);
    const mAmt = Number(updateMalRecpAmt) || 0;
    const lAmt = Number(val) || 0;
    const bAmt = Number(updateBillAmt) || 0;
    const rev = mAmt + lAmt;
    setUpdateRevAmt(rev);
    setUpdateBal(rev - bAmt);
  };

  const handleUpdateBillAmtChange = (val: string) => {
    setUpdateBillAmt(val);
    const mAmt = Number(updateMalRecpAmt) || 0;
    const lAmt = Number(updateLessAmt) || 0;
    const bAmt = Number(val) || 0;
    const rev = mAmt + lAmt;
    setUpdateBal(rev - bAmt);
    setUpdateDebit(bAmt);
    setUpdateTotalAmt(bAmt);
  };

  const handleSaveUpdate = async () => {
    if (!updateRecpNo && !updateRepId) return;
    setIsUpdatingReceipt(true);
    try {
      const numBill = Number(updateBillAmt) || 0;
      const numLess = Number(updateLessAmt) || 0;
      const numRev = Number(updateMalRecpAmt) || 0;
      const numBal = Number(updateBal) || 0;

      const metadata = {
        bill_no: updateBillNo ? parseInt(String(updateBillNo), 10) : null,
        manual_rep_no: updateMalRecpNo || null,
        mal_recp_dt: updateMalRecpDt || updateRecpDate,
        balance: numBal,
        cash_chq: updatePaymentMode,
        cheque_no: updatePaymentMode === 'Cheque' ? updateChequeNo : null,
        cheque_date: updatePaymentMode === 'Cheque' ? updateChequeDate : null,
        narr: updateNarration || ''
      };

      const updatePayload = {
        recp_date: updateRecpDate,
        bill_amt: numBill,
        less_amt: numLess,
        mal_recp_amt: numRev,
        month: updateMonth,
        year: updateYear,
        remarks: JSON.stringify(metadata)
      };

      // Rep. Id is only a display number, so it can't identify the row
      const cid = parseInt(customerId, 10);
      if (!updateRecpNo || isNaN(cid)) throw new Error('This receipt has no receipt number, so it was not changed.');
      const { data: updatedRows, error: updErr } = await supabase
        .from(`receipt${fySuffix()}`)
        .update(updatePayload)
        .eq('customer_id', cid)
        .eq('recp_no', updateRecpNo)
        .select('id');
      if (updErr) throw updErr;
      if (!updatedRows || updatedRows.length === 0) throw new Error('Receipt was not found, so nothing was changed.');

      setCustomerReceipts(prev => prev.map(r => {
        const rid = r.rep_id || r.receipt_id || (r.id > 18383 ? r.id - 18383 : r.id);
        if (String(rid) === String(updateRepId) || (updateRecpNo && String(r.recp_no || r.receipt_no) === String(updateRecpNo))) {
          return {
            ...r,
            recp_date: updateRecpDate,
            bill_date: updateRecpDate,
            bill_no: updateBillNo,
            bill_id: updateBillNo,
            month: updateMonth,
            year: updateYear,
            bill_amt: numBill,
            less_amt: numLess,
            mal_recp_amt: numRev,
            r_amt: numRev,
            balance: numBal,
            manual_rep_no: updateMalRecpNo,
            mal_rep_no: updateMalRecpNo,
            mal_recp_dt: updateMalRecpDt,
            cash_chq: updatePaymentMode,
            cheque_no: updateChequeNo,
            cheque_date: updateChequeDate,
            remarks: JSON.stringify(metadata)
          };
        }
        return r;
      }));

      const totalBillsCalc = customerBills.reduce((sum, b) => sum + (Number(b.bill_amt) || 0), 0);
      const updatedRecps = customerReceipts.map(r => {
        const rid = r.rep_id || r.receipt_id || (r.id > 18383 ? r.id - 18383 : r.id);
        if (String(rid) === String(updateRepId)) {
          return { ...r, mal_recp_amt: numRev, less_amt: numLess };
        }
        return r;
      });
      const totalRecpsCalc = updatedRecps.reduce((sum, r) => sum + (Number(r.mal_recp_amt ?? r.r_amt ?? 0) + Number(r.less_amt || 0)), 0);
      const calculatedDues = Math.round((totalBillsCalc - totalRecpsCalc) * 100) / 100;
      setTotalCustomerDue(calculatedDues);

      // A changed amount changes the balance too, the same as saving or deleting
      const { error: balanceErr } = await supabase
        .from('customer')
        .update({ due_amount: calculatedDues, cbal: -calculatedDues })
        .eq('customer_id', cid);
      if (balanceErr) throw new Error(`Receipt updated, but the balance was not: ${balanceErr.message}`);
      setAllCustomers(prev => prev.map(c => c.customer_id === cid ? { ...c, due_amount: calculatedDues, cbal: -calculatedDues } : c));

      setIsUpdateModalOpen(false);
      setMsg({ text: `Receipt Rep #${updateRepId} (Recp #${updateRecpNo}) updated successfully!` });
    } catch (err: any) {
      console.error('Failed to update receipt:', err);
      setMsg({ text: 'Error updating receipt: ' + err.message, isError: true });
    } finally {
      setIsUpdatingReceipt(false);
    }
  };

  const handleDeleteReceipt = async () => {
    if (!updateRecpNo && !updateRepId) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete Receipt Rep #${updateRepId} (Recp #${updateRecpNo})?\nThis will reverse the payment and recalculate the customer due amount.`
    );
    if (!confirmDelete) return;

    setIsDeletingReceipt(true);
    try {
      // 1. Delete from Supabase receipt20262027. Rep. Id is only a display number, so it can't identify the row
      const receiptCid = parseInt(customerId, 10);
      if (!updateRecpNo || isNaN(receiptCid)) throw new Error('This receipt has no receipt number, so it was not deleted.');
      const { data: deletedRows, error: delErr } = await supabase
        .from(`receipt${fySuffix()}`)
        .delete()
        .eq('customer_id', receiptCid)
        .eq('recp_no', updateRecpNo)
        .select('id');
      if (delErr) throw delErr;
      if (!deletedRows || deletedRows.length === 0) throw new Error('Receipt was not found, so nothing was deleted.');

      // 2. Remove receipt from local customerReceipts state
      const filteredReceipts = customerReceipts.filter(r => {
        const rid = r.rep_id || r.receipt_id || (r.id > 18383 ? r.id - 18383 : r.id);
        const matchRepId = String(rid) === String(updateRepId);
        const matchRecpNo = updateRecpNo && String(r.recp_no || r.receipt_no) === String(updateRecpNo);
        return !(matchRepId || matchRecpNo);
      });
      setCustomerReceipts(filteredReceipts);

      // 4. Recalculate customer due balance
      const totalBillsCalc = customerBills.reduce((sum, b) => sum + (Number(b.bill_amt) || 0), 0);
      const totalRecpsCalc = filteredReceipts.reduce((sum, r) => sum + (Number(r.mal_recp_amt ?? r.r_amt ?? 0) + Number(r.less_amt || 0)), 0);
      const calculatedDues = Math.round((totalBillsCalc - totalRecpsCalc) * 100) / 100;
      setTotalCustomerDue(calculatedDues);

      // 5. Update customer record in Supabase customer table
      const cid = parseInt(customerId, 10);
      if (!isNaN(cid) && cid > 0) {
        await supabase
          .from('customer')
          .update({ 
            due_amount: calculatedDues,
            cbal: -calculatedDues
          })
          .eq('customer_id', cid);

        setAllCustomers(prev => prev.map(c => c.customer_id === cid ? { ...c, due_amount: calculatedDues, cbal: -calculatedDues } : c));
      }

      setIsUpdateModalOpen(false);
      setMsg({ text: `Receipt Rep #${updateRepId} (Recp #${updateRecpNo}) deleted successfully!` });
    } catch (err: any) {
      console.error('Failed to delete receipt:', err);
      setMsg({ text: 'Error deleting receipt: ' + err.message, isError: true });
    } finally {
      setIsDeletingReceipt(false);
    }
  };

  // Keyboard Shortcuts: F1=Cash, F2=Cheque, Alt+A / Alt+S -> Apply, Alt+U -> Update, Alt+E / Esc -> Exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isUpdateModalOpen) {
        if (e.key === 'F1') {
          e.preventDefault();
          setUpdatePaymentMode('Cash');
        } else if (e.key === 'F2') {
          e.preventDefault();
          setUpdatePaymentMode('Cheque');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsUpdateModalOpen(false);
        } else if (e.altKey && e.key.toLowerCase() === 'u') {
          e.preventDefault();
          handleSaveUpdate();
        } else if (e.altKey && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          handleDeleteReceipt();
        } else if (e.altKey && e.key.toLowerCase() === 'e') {
          e.preventDefault();
          setIsUpdateModalOpen(false);
        }
        return;
      }

      if (e.key === 'F1') {
        e.preventDefault();
        setPaymentMode('Cash');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setPaymentMode('Cheque');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'a' || k === 's') {
          e.preventDefault();
          handleApply();
        } else if (k === 'u') {
          e.preventDefault();
          openUpdateModal();
        } else if (k === 'e') {
          e.preventDefault();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customerId, customerName, revAmt, lessAmt, totalCustomerDue, receiptNo, receiptDate, billNo, month, year, paymentMode, manualRecpNo, narration, isUpdateModalOpen, updateRepId, updateRecpNo, updateBillAmt, updateMalRecpAmt, updateLessAmt, updatePaymentMode, updateChequeNo, updateChequeDate, updateNarration, customerReceipts, selectedReceiptId]);

  return (
    <div className="d2-window relative w-full max-w-[920px] max-h-[calc(100vh-40px)] bg-[#C0DCF8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden my-auto shrink-0">
      
      {/* 1. Classic Windows Title Bar matching RecieptEntryRecording.mp4 */}
      <div className="d2-title bg-gradient-to-r from-[#0A246A] to-[#A6CAF0] text-white px-2 py-0.5 flex items-center justify-between font-bold text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          <img 
            src="/legacy_images/paper.ico" 
            alt="ico" 
            className="w-4 h-4" 
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          <span className="tracking-wide text-xs">Payment Recipt</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">_</button>
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* 2. Main Window Interior */}
      <div className="flex-1 p-2.5 flex flex-col justify-between overflow-y-auto min-h-0 bg-[#D4E8FA] gap-1.5">
        
        {/* TOP CUSTOMER HEADER SECTION */}
        <div className="space-y-1 text-xs bg-[#D4E8FA]">
          
          {/* Row 1: Pr., Id, Collection Agent & Active Range */}
          <div className="flex items-center justify-between gap-3 max-md:flex-wrap max-md:gap-y-1.5">
            
            {/* Pr. & Id */}
            <div className="flex items-center gap-2 max-md:flex-wrap">
              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080]">Pr.</label>
                <input 
                  type="text" 
                  value={priorityId}
                  readOnly
                  className="w-16 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-slate-800 text-center outline-none text-xs"
                />
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080]">Id</label>
                <input 
                  ref={customerIdRef}
                  type="number" 
                  value={customerId}
                  onChange={(e) => handleLookupCustomerId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (customerInputRef.current) customerInputRef.current.focus();
                    }
                  }}
                  placeholder=""
                  className="w-20 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-blue-900 outline-none text-center text-xs"
                />
              </div>
            </div>

            {/* Collection Section: Exactly 2 controls matching video (Collection Name & Collection No. / Book Range) */}
            <div className="flex items-center gap-2 max-md:flex-wrap">
              <label className="font-bold text-[#000080]">Collection</label>

              {/* 1. Collection Name Custom Dropdown */}
              <div className="relative" ref={collectionContainerRef}>
                <div 
                  ref={collectionButtonRef}
                  tabIndex={0}
                  onClick={() => setIsCollectionDropdownOpen(prev => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setIsCollectionDropdownOpen(true);
                      setHighlightedCollectionIndex(prev => (prev + 1) % (collectors.length + 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setIsCollectionDropdownOpen(true);
                      setHighlightedCollectionIndex(prev => (prev - 1 + collectors.length + 1) % (collectors.length + 1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (highlightedCollectionIndex === 0) {
                        handleCollectorChange('', undefined, true);
                      } else if (collectors[highlightedCollectionIndex - 1]) {
                        handleCollectorChange(collectors[highlightedCollectionIndex - 1].name, undefined, true);
                      }
                    } else if (e.key === 'Tab') {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        if (highlightedCollectionIndex > 0 && collectors[highlightedCollectionIndex - 1]) {
                          handleCollectorChange(collectors[highlightedCollectionIndex - 1].name, undefined, true);
                        } else {
                          setIsCollectionDropdownOpen(false);
                          setIsBookDropdownOpen(true);
                          setTimeout(() => bookButtonRef.current?.focus(), 50);
                        }
                      }
                    } else if (e.key === 'Escape') {
                      setIsCollectionDropdownOpen(false);
                    } else if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
                      // Quick typeahead jump
                      const char = e.key.toLowerCase();
                      const foundIdx = collectors.findIndex(c => (c.name || '').toLowerCase().startsWith(char));
                      if (foundIdx !== -1) {
                        setHighlightedCollectionIndex(foundIdx + 1);
                        setIsCollectionDropdownOpen(true);
                      }
                    }
                  }}
                  className="w-40 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-bold text-slate-800 outline-none text-xs cursor-pointer flex items-center justify-between select-none focus:ring-1 focus:ring-blue-600"
                >
                  <span className="truncate">{collectionAgentName || '-- Select Collection --'}</span>
                  <span className="ml-1 text-[10px] text-slate-600 bg-[#ECE9D8] px-1 border border-t-white border-l-white border-r-[#808080] border-b-[#808080]">▼</span>
                </div>

                {/* Dropdown Options Popup */}
                {isCollectionDropdownOpen && (
                  <div className="absolute left-0 top-full mt-0.5 w-48 bg-white border-2 border-[#0A246A] shadow-2xl max-h-56 overflow-y-auto z-50 text-xs font-tahoma">
                    <div
                      onClick={() => handleCollectorChange('', undefined, true)}
                      onMouseEnter={() => setHighlightedCollectionIndex(0)}
                      className={`px-2 py-1 cursor-pointer font-bold border-b border-slate-100 ${
                        highlightedCollectionIndex === 0 ? 'bg-[#0A246A] text-white' : 'hover:bg-blue-50 text-slate-500 italic'
                      }`}
                    >
                      -- Select Collection --
                    </div>
                    {collectors.map((c, idx) => {
                      const itemIdx = idx + 1;
                      const isHighlighted = itemIdx === highlightedCollectionIndex;
                      return (
                        <div
                          key={c.collect_id}
                          onClick={() => handleCollectorChange(c.name, undefined, true)}
                          onMouseEnter={() => setHighlightedCollectionIndex(itemIdx)}
                          className={`px-2 py-1 cursor-pointer font-bold border-b border-slate-100 flex items-center justify-between ${
                            isHighlighted ? 'bg-[#0A246A] text-white' : 'hover:bg-blue-50 text-slate-900'
                          }`}
                        >
                          <span>{c.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. Collection No. / Allotted Books Custom Dropdown (Matching video: 2401 - 2700) */}
              <div className="relative" ref={bookContainerRef}>
                <div
                  ref={bookButtonRef}
                  tabIndex={0}
                  onClick={() => {
                    if (collectorBooks.length > 0) setIsBookDropdownOpen(prev => !prev);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (collectorBooks.length > 0) {
                        setIsBookDropdownOpen(true);
                        setHighlightedBookIndex(prev => (prev + 1) % collectorBooks.length);
                      }
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (collectorBooks.length > 0) {
                        setIsBookDropdownOpen(true);
                        setHighlightedBookIndex(prev => (prev - 1 + collectorBooks.length) % collectorBooks.length);
                      }
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (collectorBooks.length > 0 && collectorBooks[highlightedBookIndex]) {
                        const b = collectorBooks[highlightedBookIndex];
                        handleSelectBook(`${b.receipt_from} - ${b.receipt_to}`);
                      } else {
                        setIsBookDropdownOpen(false);
                        customerInputRef.current?.focus();
                      }
                    } else if (e.key === 'Tab') {
                      if (e.shiftKey) {
                        e.preventDefault();
                        setIsBookDropdownOpen(false);
                        setIsCollectionDropdownOpen(true);
                        setTimeout(() => collectionButtonRef.current?.focus(), 50);
                      } else {
                        e.preventDefault();
                        if (collectorBooks.length > 0 && collectorBooks[highlightedBookIndex]) {
                          const b = collectorBooks[highlightedBookIndex];
                          handleSelectBook(`${b.receipt_from} - ${b.receipt_to}`);
                        } else {
                          setIsBookDropdownOpen(false);
                          customerInputRef.current?.focus();
                        }
                      }
                    } else if (e.key === 'Escape') {
                      setIsBookDropdownOpen(false);
                    }
                  }}
                  className="w-40 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-slate-800 outline-none text-xs cursor-pointer flex items-center justify-between select-none focus:ring-1 focus:ring-blue-600"
                >
                  <span className="truncate">
                    {selectedBookRange || (collectionAgentName ? (collectorBooks.length > 0 ? '-- Choose Book --' : '-- No Books Allotted --') : '-- Allotted Books --')}
                  </span>
                  <span className="ml-1 text-[10px] text-slate-600 bg-[#ECE9D8] px-1 border border-t-white border-l-white border-r-[#808080] border-b-[#808080]">▼</span>
                </div>

                {/* Dropdown Options Popup for Allotted Books */}
                {isBookDropdownOpen && collectorBooks.length > 0 && (
                  <div className="absolute left-0 top-full mt-0.5 w-40 bg-white border-2 border-[#0A246A] shadow-2xl max-h-56 overflow-y-auto z-50 text-xs font-mono font-bold">
                    {collectorBooks.map((b, idx) => {
                      const rangeStr = `${b.receipt_from} - ${b.receipt_to}`;
                      const isHighlighted = idx === highlightedBookIndex;
                      const isSelected = selectedBookRange === rangeStr;
                      return (
                        <div
                          key={idx}
                          ref={(el) => {
                            if (isHighlighted && el) {
                              el.scrollIntoView({ block: 'nearest' });
                            }
                          }}
                          onClick={() => handleSelectBook(rangeStr)}
                          onMouseEnter={() => setHighlightedBookIndex(idx)}
                          className={`px-2.5 py-1.5 cursor-pointer border-b border-slate-100 flex items-center justify-between text-xs transition-colors ${
                            isHighlighted 
                              ? 'bg-[#0A246A] text-white font-bold' 
                              : isSelected 
                                ? 'bg-blue-100 text-blue-900 font-bold' 
                                : 'hover:bg-blue-50 text-slate-900 font-bold'
                          }`}
                        >
                          <span className="tracking-wide">{rangeStr}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Row 2: Customer Name Autocomplete Search & Month */}
          <div className="flex items-center justify-between gap-3 max-md:flex-wrap max-md:gap-y-1.5">
            
            {/* Customer Search Autocomplete Input */}
            <div className="flex items-center gap-2 flex-1 relative max-md:basis-full" ref={dropdownRef}>
              <label className="font-bold text-[#000080] shrink-0">Customer</label>
              
              <div className="relative flex-1">
                <input 
                  ref={customerInputRef}
                  type="text" 
                  value={customerSearchQuery}
                  onChange={(e) => handleCustomerSearchChange(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                    if (customerSearchQuery.trim()) setIsCustomerDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      if (bookButtonRef.current) {
                        bookButtonRef.current.focus();
                        setIsBookDropdownOpen(true);
                      } else if (collectionButtonRef.current) {
                        collectionButtonRef.current.focus();
                        setIsCollectionDropdownOpen(true);
                      }
                    } else if (e.key === 'Tab') {
                      if (isCustomerDropdownOpen && filteredCustomerSuggestions.length > 0) {
                        e.preventDefault();
                        handleSelectCustomer(filteredCustomerSuggestions[highlightedCustomerIndex]);
                      } else {
                        e.preventDefault();
                        if (monthSelectRef.current) monthSelectRef.current.focus();
                      }
                    } else if (isCustomerDropdownOpen && filteredCustomerSuggestions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightedCustomerIndex(prev => (prev + 1) % filteredCustomerSuggestions.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightedCustomerIndex(prev => (prev - 1 + filteredCustomerSuggestions.length) % filteredCustomerSuggestions.length);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSelectCustomer(filteredCustomerSuggestions[highlightedCustomerIndex], true);
                      }
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      customerInputRef.current?.select();
                    }
                  }}
                  placeholder="Type Customer Name to search (e.g. Rajeev, Prabha, Dinesh, Tara)..."
                  className="w-full px-2 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-bold text-blue-950 outline-none text-xs"
                />

                {/* Autocomplete Dropdown Popup Menu */}
                {isCustomerDropdownOpen && filteredCustomerSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-0.5 bg-white border-2 border-[#0A246A] shadow-2xl max-h-56 overflow-y-auto z-50 text-xs font-tahoma">
                    {filteredCustomerSuggestions.map((cust, idx) => {
                      const isHighlighted = idx === highlightedCustomerIndex;
                      return (
                        <div 
                          key={cust.customer_id}
                          onClick={() => handleSelectCustomer(cust)}
                          onMouseEnter={() => setHighlightedCustomerIndex(idx)}
                          className={`px-2.5 py-1.5 cursor-pointer font-bold border-b border-slate-100 flex items-center justify-between text-xs ${
                            isHighlighted ? 'bg-[#0A246A] text-white' : 'hover:bg-blue-50 text-slate-900'
                          }`}
                        >
                          <span className="truncate">{cust.name_eng || cust.name_hindi}</span>
                          <span className="text-[10px] opacity-75 font-mono ml-2 shrink-0">
                            Pr: {cust.priority || '-'} | ID: #{cust.customer_id}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Month & Region (Matching video: Month : - Sept  Region :- SR2) */}
            <div className="flex items-center gap-3 shrink-0 font-bold text-xs text-[#000080]">
              <div>
                Month : - <span className="text-[#800000] font-black">{month}</span>
              </div>
              {customerRegion && (
                <div>
                  Region :- <span className="text-[#800000] font-black">{customerRegion}</span>
                </div>
              )}
            </div>

          </div>

          {/* Row 3: Address & Phone, shown only */}
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 items-baseline">
            <label className="font-bold text-[#000080]">Address :</label>
            <span className="font-bold text-slate-800 text-xs truncate" title={customerAddress}>
              {customerAddress || '---'}
            </span>
            <label className="font-bold text-[#000080]">Mob. No. :</label>
            <span className="font-bold text-slate-800 text-xs font-mono">
              {customerMobiles.length > 0 ? customerMobiles.join(',   ') : '---'}
            </span>
          </div>

        </div>

        {/* MIDDLE TWO-PANEL GRIDS matching RecieptEntryRecording.mp4 */}
        <div className="flex gap-2 flex-1 my-0.5 overflow-hidden min-h-[190px] max-h-[250px] max-md:flex-col max-md:max-h-none">
          
          {/* Left Grid: Bills History (28% width) with Footer Total */}
          <div className="w-[28%] max-md:w-full max-md:h-40 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white flex flex-col overflow-hidden">
            <div className="bg-[#0080FF] text-white text-[11px] font-bold grid grid-cols-4 border-b border-black text-center py-0.5">
              <span className="border-r border-black">Bill No</span>
              <span className="border-r border-black">Year</span>
              <span className="border-r border-black">Month</span>
              <span>Bill Amt.</span>
            </div>
            <div className="flex-1 bg-white overflow-y-auto text-xs font-mono text-black">
              {customerBills.length > 0 ? (
                customerBills.map((b, idx) => {
                  const bId = b.bill_no || b.bill_id || b.Bill_id;
                  const isSelected = selectedBillId === String(bId);
                  return (
                    <div 
                      key={idx} 
                      onClick={() => handleSelectBill(b)}
                      className={`grid grid-cols-4 border-b border-slate-200 text-center py-0.5 cursor-pointer text-[10px] transition-colors ${
                        isSelected ? 'bg-blue-800 text-white font-bold ring-1 ring-blue-900' : 'hover:bg-blue-50 text-black'
                      }`}
                      title="Click to select this bill"
                    >
                      <span className="border-r border-slate-200">{bId}</span>
                      <span className="border-r border-slate-200">{b.year || b.Year || '2026'}</span>
                      <span className="border-r border-slate-200">{(b.month || b.Month || '').slice(0, 4)}</span>
                      <span className="font-bold">{getBillDisplayAmount(b)}</span>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-slate-400 italic text-[10px]">
                  {isLoadingHistory ? 'Loading bills...' : 'No pending bills'}
                </div>
              )}
            </div>

            {/* Left Grid Footer: Total Bill Amount for Financial Year in Red Text */}
            <div className="bg-[#F4F4F4] border-t border-slate-300 px-2 py-0.5 flex justify-end items-center font-mono font-bold text-red-600 text-xs">
              <span>{totalBillsSum}</span>
            </div>
          </div>

          {/* Right Grid: Receipts History (72% width) with Footer Total */}
          <div className="flex-1 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white flex flex-col overflow-hidden max-md:flex-none max-md:h-52 max-md:overflow-x-auto max-md:[&>*]:min-w-[640px]">
            <div className="bg-[#0080FF] text-white text-[10px] font-bold grid grid-cols-10 border-b border-black text-center py-0.5">
              <span className="border-r border-black">Rep. Id</span>
              <span className="border-r border-black">Bill No</span>
              <span className="border-r border-black">Month</span>
              <span className="border-r border-black">Ml.No.</span>
              <span className="border-r border-black">Ml.Date</span>
              <span className="border-r border-black">Rp Amt.</span>
              <span className="border-r border-black">L.Amt.</span>
              <span className="border-r border-black">Rep.Date</span>
              <span className="border-r border-black">R Amt.</span>
              <span>Cash/Chq</span>
            </div>
            <div className="flex-1 bg-white overflow-y-auto text-xs font-mono text-black">
              {customerReceipts.length > 0 ? (
                customerReceipts.map((r, idx) => {
                  const rid = r.rep_id || r.receipt_id || (r.id > 18383 ? r.id - 18383 : r.id);
                  const isSelected = String(selectedReceiptId) === String(rid);
                  return (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedReceiptId(rid)}
                      onDoubleClick={() => openUpdateModal(r)}
                      className={`grid grid-cols-10 border-b border-slate-200 text-center py-0.5 cursor-pointer text-[10px] ${
                        isSelected ? 'bg-blue-800 text-white font-bold ring-1 ring-blue-900' : 'hover:bg-blue-50 text-black'
                      }`}
                      title="Click to select, double-click to update"
                    >
                      <span className="border-r border-slate-200">{rid}</span>
                      <span className="border-r border-slate-200">{r.bill_no || r.bill_id || r.Bill_id || '-'}</span>
                      <span className="border-r border-slate-200">{(r.month || r.Month || '').slice(0, 4)}</span>
                      <span className="border-r border-slate-200">{r.manual_rep_no || r.mal_rep_no || r.Manual_rep_no || '-'}</span>
                      <span className="border-r border-slate-200">{r.mal_recp_dt || '-'}</span>
                      <span className="border-r border-slate-200">{r.mal_recp_amt ?? r.bill_amt ?? r.Bill_amt ?? 0}</span>
                      <span className="border-r border-slate-200">{r.less_amt || r.Less_amt || 0}</span>
                      <span className="border-r border-slate-200">{r.recp_date || r.bill_date || r.Bill_date || '-'}</span>
                      <span className={`border-r border-slate-200 font-bold ${isSelected ? 'text-yellow-300' : 'text-blue-700'}`}>{r.r_amt ?? r.mal_recp_amt ?? 0}</span>
                      <span>{r.cash_chq || r.Cash_chq || 'Cash'}</span>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-slate-400 italic text-[10px]">
                  {isLoadingHistory ? 'Loading receipts...' : 'No previous receipts'}
                </div>
              )}
            </div>

            {/* Right Grid Footer: Total Received & Total Due (Matching Video: 905, 1055) */}
            <div className="bg-[#F4F4F4] border-t border-slate-300 px-4 py-0.5 flex justify-between items-center font-mono font-bold text-red-600 text-xs">
              <span>Total Received: {totalReceiptsReceivedSum}</span>
              <span>Total Due: {totalCustomerDue}</span>
            </div>
          </div>

        </div>

        {/* BOTTOM CONTROL SECTION matching RecieptEntryRecording.mp4 */}
        <div className="border border-[#0080C0] bg-[#D4E8FA] p-2 space-y-1.5 relative text-xs">
          
          {/* Box Title */}
          <div className="absolute -top-2.5 left-3 bg-[#D4E8FA] px-1 font-bold text-[#800000] text-xs">
            Control Section
          </div>

          {/* Clean Ledger Grid: 5 columns aligned vertically across Row 1, Row 2, Row 3 */}
          <div className="space-y-1.5 max-w-4xl">
            {/* Control Row 1: Low Opacity for uneditable/system-locked fields */}
            <div className="grid grid-cols-[auto_auto_auto_auto_auto] max-md:grid-cols-2 max-md:gap-y-1.5 gap-x-3 items-center opacity-70">
              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-16 shrink-0">Recp. No</label>
                <input 
                  type="text" 
                  value={receiptNo}
                  readOnly
                  className="w-20 px-1 py-0.5 bg-[#E8E8E8] border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs text-slate-700 cursor-not-allowed select-none"
                />
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-18 shrink-0 text-right">Recp Date</label>
                <input 
                  type="text" 
                  value={receiptDate}
                  readOnly
                  className="w-24 px-1 py-0.5 bg-[#E8E8E8] border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs text-slate-700 cursor-not-allowed select-none"
                />
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-18 shrink-0 text-right">Bill No</label>
                <input 
                  ref={billNoRef}
                  type="text" 
                  value={billNo}
                  readOnly
                  placeholder=""
                  className="w-24 px-1 py-0.5 bg-[#E8E8E8] border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs text-slate-700 cursor-not-allowed select-none"
                />
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-14 shrink-0 text-right">Year</label>
                <input 
                  type="text" 
                  value={year}
                  readOnly
                  className="w-16 px-1 py-0.5 bg-[#E8E8E8] border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs text-slate-700 cursor-not-allowed select-none"
                />
              </div>

              {/* Empty placeholder for 5th column */}
              <div></div>
            </div>

            {/* Control Row 2: Active inputs & Read-only Amounts */}
            <div className="grid grid-cols-[auto_auto_auto_auto_auto] max-md:grid-cols-2 max-md:gap-y-1.5 gap-x-3 items-center">
              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-16 shrink-0">Month</label>
                <select 
                  ref={monthSelectRef}
                  value={month}
                  onChange={(e) => handleSelectMonth(e.target.value)}
                  onKeyDown={(e) => {
                    const len = availableMonths.length || 1;
                    const currentIndex = availableMonths.indexOf(month);
                    if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      const nextIdx = (currentIndex + 1) % len;
                      handleSelectMonth(availableMonths[nextIdx]);
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      const prevIdx = (currentIndex - 1 + len) % len;
                      handleSelectMonth(availableMonths[prevIdx]);
                    } else if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      focusPrevious(monthSelectRef);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      if (manualRcpAmtRef.current) manualRcpAmtRef.current.focus();
                    }
                  }}
                  className="w-20 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-bold text-[11px] leading-tight focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-1 opacity-75">
                <label className="font-bold text-[#000080] text-xs w-18 shrink-0 text-right">Bill Amt</label>
                <input 
                  ref={billAmtRef}
                  type="text" 
                  value={billAmt === '' ? '' : billAmt}
                  readOnly
                  placeholder="0"
                  className="w-24 px-1 py-0.5 bg-[#E8E8E8] border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-right text-xs text-slate-800 cursor-not-allowed select-none"
                />
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-18 shrink-0 text-right">Ml. Rcp. At.</label>
                <input 
                  ref={manualRcpAmtRef}
                  type="number" 
                  value={manualRcpAmt === '' ? '' : manualRcpAmt}
                  placeholder="0"
                  onChange={(e) => handleManualRcpAmtChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      focusPrevious(manualRcpAmtRef);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      if (lessAmtRef.current) lessAmtRef.current.focus();
                    }
                  }}
                  className="w-24 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-14 shrink-0 text-right">Ls. Amt</label>
                <input 
                  ref={lessAmtRef}
                  type="number" 
                  value={lessAmt === '' ? '' : lessAmt}
                  placeholder="0"
                  onChange={(e) => handleLessAmtChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      focusPrevious(lessAmtRef);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      if (revAmtRef.current) revAmtRef.current.focus();
                      else if (manualRecpNoRef.current) manualRecpNoRef.current.focus();
                    }
                  }}
                  className="w-16 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono text-center text-red-700 font-bold text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-16 shrink-0 text-right">Rev.Amt</label>
                <input 
                  ref={revAmtRef}
                  type="number" 
                  value={revAmt === '' ? '' : revAmt}
                  placeholder="0"
                  onChange={(e) => handleRevAmtChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      focusPrevious(revAmtRef);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      if (manualRecpNoRef.current) manualRecpNoRef.current.focus();
                    }
                  }}
                  className="w-20 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-blue-900 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Control Row 3: Mal. Recp, Total Amt, Total Dues */}
            <div className="grid grid-cols-[auto_auto_auto_auto_auto] max-md:grid-cols-2 max-md:gap-y-1.5 gap-x-3 items-center">
              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-16 shrink-0 truncate">Mal. Recp</label>
                <input 
                  ref={manualRecpNoRef}
                  type="text" 
                  value={manualRecpNo}
                  onChange={(e) => setManualRecpNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      focusPrevious(manualRecpNoRef);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      if (manualRecpDateRef.current) manualRecpDateRef.current.focus();
                    }
                  }}
                  placeholder=""
                  className="w-20 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs w-18 shrink-0 text-right truncate">Mal. Date</label>
                <input 
                  ref={manualRecpDateRef}
                  type="text" 
                  value={manualRecpDate}
                  onChange={(e) => setManualRecpDate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      focusPrevious(manualRecpDateRef);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      if (paymentMode === 'Cheque') {
                        if (chequeNoRef.current) chequeNoRef.current.focus();
                      } else {
                        if (applyBtnRef.current) applyBtnRef.current.focus();
                      }
                    }
                  }}
                  placeholder="DD/MM/YYYY"
                  className="w-24 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono text-center text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Total Amt: Low Opacity for uneditable/informational field */}
              <div className="flex items-center gap-1 opacity-70">
                <label className="font-bold text-[#000080] text-xs w-18 shrink-0 text-right">Total Amt</label>
                <input 
                  type="text" 
                  value={totalPayableAmt !== null && totalPayableAmt !== undefined && totalPayableAmt !== 0 ? totalPayableAmt : (manualRcpAmt !== '' ? manualRcpAmt : '')}
                  readOnly
                  className="w-24 px-1.5 py-0.5 bg-[#E8E8E8] border border-[#808080] font-mono font-bold text-center text-slate-700 text-xs cursor-not-allowed select-none"
                />
              </div>

              {/* Total Dues: Full Vivid Opacity & Prominent Visibility */}
              <div className="flex items-center gap-1 col-span-2">
                <label className="font-bold text-[#000080] text-xs w-14 shrink-0 text-right">Total Dues</label>
                <input 
                  type="text" 
                  value={`${Math.round((totalCustomerDue - (Number(manualRcpAmt) || 0) - (Number(lessAmt) || 0)) * 100) / 100}`}
                  readOnly
                  className="w-24 px-1.5 py-0.5 bg-[#FFCCCC] border border-[#808080] font-mono font-black text-center text-red-900 text-xs shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Control Row 4: Shortcuts, Narration, Mode, Cheque, Action Buttons (Matching screenshot_13.jpg) */}
          <div className="flex items-center justify-between pt-1 flex-wrap gap-2 border-t border-slate-300">
            
            {/* Shortcuts & Narration & Payment Mode */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-xs text-[#800000] shrink-0">F1 - Cash &nbsp; F2 - Cheque</span>

              {/* Narration Field */}
              <div className="flex items-center gap-1">
                <label className="font-bold text-[#000080] text-xs shrink-0">Narration</label>
                <input 
                  type="text" 
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder=""
                  className="w-28 px-1 py-0.5 bg-white border border-[#808080] font-mono text-xs"
                />
              </div>
              
              <label className="flex items-center gap-1 font-bold text-[#000080] cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={paymentMode === 'Cash'}
                  onChange={() => setPaymentMode('Cash')}
                />
                <span>Cash</span>
              </label>

              <label className="flex items-center gap-1 font-bold text-[#000080] cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={paymentMode === 'Cheque'}
                  onChange={() => {
                    setPaymentMode('Cheque');
                    setTimeout(() => {
                      if (chequeNoRef.current) chequeNoRef.current.focus();
                    }, 50);
                  }}
                />
                <span>Cheque</span>
              </label>

              {/* Cheque Details matching screenshot_13.jpg */}
              <div className="flex items-center gap-1">
                <span className="font-bold text-[#000080]">Cheque No</span>
                <input 
                  ref={chequeNoRef}
                  type="text" 
                  disabled={paymentMode !== 'Cheque'}
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      focusPrevious(chequeNoRef);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      if (chequeDateRef.current) chequeDateRef.current.focus();
                    }
                  }}
                  placeholder=""
                  className="w-20 px-1 py-0.5 bg-white border border-[#808080] font-mono font-bold text-xs disabled:bg-slate-100"
                />
                <span className="font-bold text-[#000080]">Cheque Date</span>
                <input 
                  ref={chequeDateRef}
                  type="text" 
                  disabled={paymentMode !== 'Cheque'}
                  value={chequeDate}
                  onChange={(e) => setChequeDate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      focusPrevious(chequeDateRef);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      if (applyBtnRef.current) applyBtnRef.current.focus();
                    }
                  }}
                  placeholder="//"
                  className="w-16 px-1 py-0.5 bg-white border border-[#808080] font-mono text-center text-xs disabled:bg-slate-100"
                />
              </div>
            </div>

            {/* Action Buttons matching screenshot_13.jpg */}
            <div className="flex items-center gap-2">
              <button 
                ref={applyBtnRef}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    focusPrevious(applyBtnRef);
                  }
                }}
                onClick={handleApply}
                disabled={isSaving}
                className="px-4 py-1 bg-white hover:bg-blue-50 border border-[#808080] text-xs font-bold text-black cursor-pointer shadow-xs disabled:opacity-50 min-w-[70px] focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                <u>A</u>pply
              </button>
              <button 
                type="button"
                onClick={() => openUpdateModal()}
                disabled={isSaving}
                className="px-4 py-1 bg-white hover:bg-blue-50 border border-[#808080] text-xs font-bold text-black cursor-pointer shadow-xs disabled:opacity-50 min-w-[70px]"
              >
                <u>U</u>pdate
              </button>
              <button 
                onClick={onClose}
                className="px-4 py-1 bg-white hover:bg-red-50 border border-[#808080] text-xs font-bold text-black cursor-pointer shadow-xs min-w-[70px]"
              >
                <u>E</u>xit
              </button>
            </div>

          </div>

          {msg && (
            <div className={`p-1 font-bold text-[11px] text-center border ${
              msg.isError 
                ? 'bg-rose-100 border-rose-400 text-rose-900' 
                : 'bg-emerald-100 border-emerald-400 text-emerald-900'
            }`}>
              {msg.text}
            </div>
          )}

        </div>

      </div>

      {/* 4. UPDATE RECEIPT MODAL (Matching FoxPro Screen in media_1791953418411_773bd0d5.png) */}
      {isUpdateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="w-[720px] bg-[#D4F1D4] border-2 border-[#5BA35B] shadow-2xl p-3 text-xs text-black font-sans space-y-2 select-none">

            {msg?.isError && (
              <div role="alert" className="p-1 font-bold text-[11px] text-center border bg-rose-100 border-rose-400 text-rose-900">
                {msg.text}
              </div>
            )}

            {/* Header Row: Bill No | Customer Name Banner | Rep No */}
            <div className="grid grid-cols-12 gap-2 items-center pb-1">
              <div className="col-span-3 flex items-center gap-1.5">
                <label className="font-bold text-[#000080] shrink-0">Bill No</label>
                <input 
                  type="text" 
                  value={updateBillNo}
                  onChange={(e) => setUpdateBillNo(e.target.value)}
                  className="w-full px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
                />
              </div>

              <div className="col-span-6 bg-[#BCE2F8] border border-[#7CBCE5] py-0.5 px-2 text-center font-bold text-[#000080] text-sm truncate shadow-xs">
                {customerName || 'Customer'}
              </div>

              <div className="col-span-3 flex items-center justify-end gap-1.5">
                <label className="font-bold text-[#000080] shrink-0">Rep No</label>
                <div className="flex items-center">
                  <input 
                    type="text" 
                    value={updateRepId}
                    onChange={(e) => handleRepNoChange(e.target.value)}
                    className="w-20 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
                  />
                  <span className="font-bold text-[#000080] ml-0.5 text-xs">*</span>
                </div>
              </div>
            </div>

            {/* Row 1: Recp. No | Recp Date | Year | Month */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <label className="col-span-2 font-bold text-[#000080]">Recp. No</label>
              <input 
                type="text" 
                value={updateRecpNo}
                readOnly
                className="col-span-2 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
              />

              <label className="col-span-2 font-bold text-[#000080] text-right">Recp Date</label>
              <input 
                type="text" 
                value={updateRecpDate}
                onChange={(e) => setUpdateRecpDate(e.target.value)}
                className="col-span-2 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
              />

              <label className="col-span-1 font-bold text-[#000080] text-right">Year</label>
              <input 
                type="text" 
                value={updateYear}
                onChange={(e) => setUpdateYear(e.target.value)}
                className="col-span-1 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
              />

              <label className="col-span-1 font-bold text-[#000080] text-right">Month</label>
              <select 
                value={updateMonth}
                onChange={(e) => setUpdateMonth(e.target.value)}
                className="col-span-1 px-0.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-bold text-[11px] leading-tight focus:outline-none"
              >
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Row 2: Bill Amt | Mal. Recp. Amt | L. Amt | Rev.Amt | Bal. */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <label className="col-span-2 font-bold text-[#000080]">Bill Amt</label>
              <input 
                type="number" 
                value={updateBillAmt}
                onChange={(e) => handleUpdateBillAmtChange(e.target.value)}
                className="col-span-2 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-right text-xs"
              />

              <label className="col-span-2 font-bold text-[#000080] text-right truncate">Mal. Recp. Amt</label>
              <input 
                type="number" 
                value={updateMalRecpAmt}
                onChange={(e) => handleUpdateMalRecpAmtChange(e.target.value)}
                className="col-span-1 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
              />

              <label className="col-span-1 font-bold text-[#000080] text-right truncate">L. Amt</label>
              <input 
                type="number" 
                value={updateLessAmt}
                onChange={(e) => handleUpdateLessAmtChange(e.target.value)}
                className="col-span-1 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
              />

              <label className="col-span-1 font-bold text-[#000080] text-right truncate">Rev.Amt</label>
              <input 
                type="text" 
                value={updateRevAmt}
                readOnly
                className="col-span-1 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-blue-900 text-xs"
              />

              <label className="col-span-1 font-bold text-[#000080] text-right truncate">Bal.</label>
              <input 
                type="text" 
                value={updateBal}
                readOnly
                className="col-span-1 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-red-700 text-xs"
              />
            </div>

            {/* Row 3: Mal. Recp. No | Mal. Recp. Dt. | Debit | Credit */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <label className="col-span-2 font-bold text-[#000080] truncate">Mal. Recp. No</label>
              <input 
                type="text" 
                value={updateMalRecpNo}
                onChange={(e) => setUpdateMalRecpNo(e.target.value)}
                className="col-span-2 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
              />

              <label className="col-span-2 font-bold text-[#000080] text-right truncate">Mal. Recp. Dt.</label>
              <input 
                type="text" 
                value={updateMalRecpDt}
                onChange={(e) => setUpdateMalRecpDt(e.target.value)}
                className="col-span-2 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
              />

              <label className="col-span-1 font-bold text-[#000080] text-right truncate">Debit</label>
              <input 
                type="text" 
                value={updateDebit}
                readOnly
                className="col-span-1 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
              />

              <label className="col-span-1 font-bold text-[#000080] text-right truncate">Credit</label>
              <input 
                type="text" 
                value={updateCredit}
                readOnly
                className="col-span-1 px-1 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
              />
            </div>

            {/* Row 4: Payment Mode, Total Amt, Action Buttons */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-5 flex items-center gap-3">
                <label className="flex items-center gap-1 cursor-pointer font-bold text-xs">
                  <input 
                    type="checkbox" 
                    checked={updatePaymentMode === 'Cash'}
                    onChange={() => setUpdatePaymentMode('Cash')}
                    className="accent-[#800000]"
                  />
                  Cash
                </label>
                <label className="flex items-center gap-1 cursor-pointer font-bold text-xs">
                  <input 
                    type="checkbox" 
                    checked={updatePaymentMode === 'Cheque'}
                    onChange={() => setUpdatePaymentMode('Cheque')}
                    className="accent-[#800000]"
                  />
                  Cheque
                </label>
                <span className="text-[11px] font-bold text-[#800000]">F1 - Cash F2 - Cheque</span>
              </div>

              <div className="col-span-4 flex items-center justify-end gap-1.5">
                <label className="font-bold text-[#000080] truncate">Total Amt</label>
                <input 
                  type="text" 
                  value={updateTotalAmt}
                  readOnly
                  className="w-24 px-1.5 py-0.5 bg-[#FFFFCC] border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono font-bold text-center text-xs"
                />
              </div>

              <div className="col-span-3 flex justify-end">
                <button 
                  type="button"
                  onClick={handleSaveUpdate}
                  disabled={isUpdatingReceipt}
                  className="w-20 py-1 bg-white hover:bg-emerald-50 border border-[#808080] text-xs font-bold text-black cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <u>U</u>pdate
                </button>
              </div>
            </div>

            {/* Row 5: Cheque No, Cheque Date, Exit Button */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-9 flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="font-bold text-[#000080]">Cheque No</label>
                  <input 
                    type="text" 
                    value={updateChequeNo}
                    disabled={updatePaymentMode !== 'Cheque'}
                    onChange={(e) => setUpdateChequeNo(e.target.value)}
                    className="w-28 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono text-xs disabled:bg-slate-100"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="font-bold text-[#000080]">Cheque Date</label>
                  <input 
                    type="text" 
                    value={updateChequeDate}
                    disabled={updatePaymentMode !== 'Cheque'}
                    placeholder="//"
                    onChange={(e) => setUpdateChequeDate(e.target.value)}
                    className="w-24 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-mono text-center text-xs disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="col-span-3 flex justify-end gap-1.5">
                <button 
                  type="button"
                  onClick={handleDeleteReceipt}
                  disabled={isDeletingReceipt || isUpdatingReceipt}
                  className="w-16 py-1 bg-white hover:bg-red-100 border border-red-700 text-xs font-bold text-red-700 cursor-pointer shadow-xs disabled:opacity-50"
                  title="Delete this receipt and restore customer balance"
                >
                  <u>D</u>elete
                </button>
                <button 
                  type="button"
                  onClick={() => setIsUpdateModalOpen(false)}
                  className="w-16 py-1 bg-white hover:bg-rose-50 border border-[#808080] text-xs font-bold text-black cursor-pointer shadow-xs"
                >
                  <u>E</u>xit
                </button>
              </div>
            </div>

            {/* Row 6: Narration */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <label className="col-span-2 font-bold text-[#000080]">Narration</label>
              <input 
                type="text" 
                value={updateNarration}
                onChange={(e) => setUpdateNarration(e.target.value)}
                className="col-span-10 px-1.5 py-0.5 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white font-bold text-xs"
              />
            </div>

          </div>
        </div>
      )}

    </div>
  );
}


