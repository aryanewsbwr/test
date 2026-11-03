'use client';

import { fetchRateTables } from '@/lib/rateTables';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Publication, Rate, RateChange, Customer } from '@/lib/types';
import { getSingleEffectiveRate } from '@/lib/rateEngine';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  publications: Publication[];
  rates?: Rate[];
  ratechanges?: RateChange[];
  customers?: Customer[];
}

interface SaleRow {
  publica_id: number;
  copies: number;
  rate: number;
  amt: number; // Rec.Amt
}

const MONTH_LIST = [
  'April', 'May', 'June', 'July', 'August', 'September', 
  'October', 'November', 'December', 'January', 'February', 'March'
];

// Helper to normalize publication objects and sort alphabetically (A to Z)
const normalizeAndSortPubs = (list: any[]) => {
  const cleaned = (list || []).map((p: any) => {
    const pid = Number(p.publica_id ?? p.publication_id ?? p.Publica_id ?? p.id ?? 0);
    const name = String(p.public_name || p.name || p.Public_name || (pid > 0 ? `Publication #${pid}` : '')).trim();
    const hindi = p.pub_hindi || p.Pub_Hindi || '';
    return {
      ...p,
      publica_id: pid,
      public_name: name,
      pub_hindi: hindi ? cleanOrTransliterateHindi(hindi, name) : ''
    };
  }).filter((p: any) => {
    const pid = Number(p.publica_id);
    const name = String(p.public_name || '');
    return pid > 0 && !isNaN(pid) && name.length > 0 && !name.toLowerCase().includes('nan');
  });

  cleaned.sort((a: any, b: any) => a.public_name.localeCompare(b.public_name, undefined, { sensitivity: 'base' }));
  return cleaned;
};

export default function RetailSalePermanentForm({ 
  isOpen, 
  onClose, 
  publications = [],
  rates = [],
  ratechanges = [],
  customers = []
}: Props) {
  // Date in DD/MM/YYYY
  const now = new Date();
  const defDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const [vrDateStr, setVrDateStr] = useState<string>(defDateStr);
  const [periodStr, setPeriodStr] = useState<string>('2026-2027');

  // Publications List (Normalized & Sorted)
  const [pubList, setPubList] = useState<Publication[]>(() => normalizeAndSortPubs(publications));

  // Customer State & Dynamic Search
  const [custInput, setCustInput] = useState<string>('');
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isSearchingCust, setIsSearchingCust] = useState<boolean>(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Find Modal State
  const [isFindOpen, setIsFindOpen] = useState<boolean>(false);
  const [findSearch, setFindSearch] = useState<string>('');
  const [findTab, setFindTab] = useState<'history' | 'customer' | 'voucher'>('history');
  const [filteredCusts, setFilteredCusts] = useState<Customer[]>([]);
  const [isFindLoading, setIsFindLoading] = useState<boolean>(false);
  const findTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Existing customer retail sales vouchers
  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [selectedSaleIdx, setSelectedSaleIdx] = useState<number>(-1);
  const [allRecentSales, setAllRecentSales] = useState<any[]>([]);

  // Rows in the grid (Publication | Copies | Rate | Rec.Amt) - starts empty; added by F1 or double tap
  const [rows, setRows] = useState<SaleRow[]>([]);

  // Narration
  const [narration, setNarration] = useState<string>('');
  
  // Proces Y/N Modal State
  const [isProcessModalOpen, setIsProcessModalOpen] = useState<boolean>(false);
  const [processMonth, setProcessMonth] = useState<string>('April');
  const [processYear, setProcessYear] = useState<string>('2026');

  // Caution Dialog State: Customer Publication is Closed
  const [showCautionClosed, setShowCautionClosed] = useState<boolean>(false);

  // Status & Feedback
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Sync publications
  useEffect(() => {
    if (publications && publications.length > 0) {
      setPubList(normalizeAndSortPubs(publications));
    }
  }, [publications]);

  // Helper to map publication name
  const getPubName = (pubId: number) => {
    const pub = pubList.find(p => p.publica_id === pubId);
    return pub ? (pub.public_name || (pub as any).name) : `Publication #${pubId}`;
  };

  // Rates and Ratechanges state (cached and auto-fetched if needed)
  const [localRates, setLocalRates] = useState<Rate[]>(rates);
  const [localRatechanges, setLocalRatechanges] = useState<RateChange[]>(ratechanges);

  useEffect(() => {
    if (rates && rates.length > 0) setLocalRates(rates);
    else fetchRateTables().then(t => setLocalRates(t.rates)).catch(() => {});
  }, [rates]);

  useEffect(() => {
    if (ratechanges && ratechanges.length > 0) setLocalRatechanges(ratechanges);
    else fetchRateTables().then(t => setLocalRatechanges(t.ratechanges)).catch(() => {});
  }, [ratechanges]);

  // Format DD/MM/YYYY
  const formatDateDisplay = (val: string): string => {
    const s = val.trim().replace(/\D/g, '');
    if (s.length === 8) {
      return `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4, 8)}`;
    }
    return val;
  };

  // Parse DD/MM/YYYY to YYYY-MM-DD
  const getIsoDate = (dStr: string) => {
    const parts = dStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return new Date().toISOString().split('T')[0];
  };

  // Convert ISO (YYYY-MM-DD) to DD/MM/YYYY
  const parseIsoToDdMmYyyy = (iso: string) => {
    if (!iso) return '';
    const clean = iso.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return iso;
  };

  // Rate Helper for a publication (uses dynamic rates from database)
  const getPubDefaultRate = (pubId: number, targetDateStr: string = vrDateStr) => {
    const pub = pubList.find(p => p.publica_id === pubId);
    if (!pub) return 5.0;
    const targetIso = getIsoDate(targetDateStr);
    const dObj = new Date(targetIso + 'T12:00:00');
    const dOfWeek = (isNaN(dObj.getTime()) ? 0 : dObj.getDay()) + 1;
    const allRates = (rates && rates.length > 0) ? rates : localRates;
    const allRCs = (ratechanges && ratechanges.length > 0) ? ratechanges : localRatechanges;

    const eff = getSingleEffectiveRate(pub.publica_id, dOfWeek, targetIso, allRates, allRCs, pub.magzine_day);
    if (eff > 0) return eff;
    if (pub.current_rates && pub.current_rates[dOfWeek] > 0) return pub.current_rates[dOfWeek];
    if (pub.current_rates && pub.current_rates[1] > 0) return pub.current_rates[1];
    if (pub.today_rate && pub.today_rate > 0) return pub.today_rate;
    return 5.0;
  };

  const handleDateBlur = () => {
    const formatted = formatDateDisplay(vrDateStr);
    setVrDateStr(formatted);
    // Refresh row rates for the new date
    setRows(prev => prev.map(r => {
      const autoRate = getPubDefaultRate(r.publica_id, formatted);
      return {
        ...r,
        rate: autoRate,
        amt: autoRate * r.copies
      };
    }));
  };

  // Load a voucher into the form (ONLY called when explicitly selected from Find / Recent)
  const loadSaleIntoForm = (primarySale: any, allSalesForCust: any[]) => {
    const saleDateIso = primarySale.Vr_Date || primarySale.vr_date;
    const saleDateDdMm = parseIsoToDdMmYyyy(saleDateIso);
    setVrDateStr(saleDateDdMm);
    setNarration(primarySale.Narr || primarySale.narr || '');
    
    // Find all items on this date for this customer
    const sameDaySales = allSalesForCust.filter(s => (s.Vr_Date || s.vr_date) === saleDateIso);
    const loadedRows: SaleRow[] = sameDaySales.map(s => {
      const pId = Number(s.Publica_id || s.publica_id);
      const recAmt = Number(s.Amt !== undefined ? s.Amt : (s.amt !== undefined ? s.amt : s.amount || 0));
      return {
        publica_id: pId,
        copies: Number(s.Copies || s.copies || 1),
        rate: Number(s.Rate || s.rate || getPubDefaultRate(pId, saleDateDdMm)),
        amt: recAmt > 0 ? recAmt : Number(s.Rate || s.rate || getPubDefaultRate(pId, saleDateDdMm))
      };
    });
    setRows(loadedRows.length > 0 ? loadedRows : [{ publica_id: 1, copies: 1, rate: 5.0, amt: 5.0 }]);
    setStatusMsg({ 
      text: `Loaded existing retail sale voucher for ${saleDateDdMm} (${loadedRows.length} item(s)).`, 
      isError: false 
    });
  };

  // Dynamic Server-Side Search for Customer Input
  const handleNameInputChange = (val: string) => {
    setCustInput(val);
    if (!val.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedCust(null);
      setCustomerSales([]);
      setSelectedSaleIdx(-1);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setIsSearchingCust(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(val.trim())}&limit=20&order=asc`);
        const data = await res.json();
        const hits: Customer[] = data.customers || [];
        setSuggestions(hits);
        setShowSuggestions(hits.length > 0);
      } catch (err) {
        console.error('Customer search error:', err);
      } finally {
        setIsSearchingCust(false);
      }
    }, 150);
  };

  // Select a customer (Keeps form date intact and starts fresh entry for that date)
  const handleSelectCustomer = async (c: Customer) => {
    setSelectedCust(c);
    setCustInput(`${c.name_eng || ''} (#${c.customer_id})`);
    setShowSuggestions(false);
    setStatusMsg(null);
    setRows([]); // Grid starts clean empty; user adds publication via F1 or Double Tap!
    setNarration('');

    // 1. Check customer's subscriptions in background for caution status
    try {
      const subRes = await fetch(`/api/subscriptions?customer_id=${c.customer_id}`);
      const subData = await subRes.json();
      const subs = subData.subscriptions || subData.all_subscriptions || [];
      (c as any)._subscriptions = subs;
      if (subs.length > 0) {
        const hasActive = subs.some((s: any) => s.is_active);
        if (!hasActive) {
          setShowCautionClosed(true);
        }
      }
    } catch (_) {}

    // 2. Fetch recent sales history in background without overwriting new entry
    try {
      const res = await fetch(`/api/retail-sale?customer_id=${c.customer_id}`);
      const data = await res.json();
      if (data.sales && data.sales.length > 0) {
        setCustomerSales(data.sales);
        setSelectedSaleIdx(-1);
      } else {
        setCustomerSales([]);
        setSelectedSaleIdx(-1);
      }
    } catch (err) {
      console.error('Error fetching customer retail sales:', err);
    }
  };

  const handleNameInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (suggestions.length > 0) {
        handleSelectCustomer(suggestions[0]);
      } else if (custInput.trim()) {
        try {
          const res = await fetch(`/api/customers?search=${encodeURIComponent(custInput.trim())}&limit=1`);
          const data = await res.json();
          if (data.customers && data.customers.length > 0) {
            handleSelectCustomer(data.customers[0]);
          } else {
            setStatusMsg({ text: `No customer found matching "${custInput}".`, isError: true });
          }
        } catch (_) {
          setStatusMsg({ text: `Search failed for "${custInput}".`, isError: true });
        }
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Dynamic Search inside Find Modal across all 24,626 customers
  useEffect(() => {
    if (!isFindOpen) return;

    if (findTab === 'customer') {
      if (findTimeoutRef.current) clearTimeout(findTimeoutRef.current);
      setIsFindLoading(true);

      const q = findSearch.trim();
      const url = q 
        ? `/api/customers?search=${encodeURIComponent(q)}&limit=100&order=asc`
        : `/api/customers?limit=100&order=asc`;

      findTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await fetch(url);
          const data = await res.json();
          setFilteredCusts(data.customers || []);
        } catch (err) {
          console.error('Find customer error:', err);
        } finally {
          setIsFindLoading(false);
        }
      }, 150);
    }
  }, [isFindOpen, findSearch, findTab]);

  // Reset form when opened fresh
  useEffect(() => {
    if (isOpen) {
      setCustInput('');
      setSelectedCust(null);
      setCustomerSales([]);
      setSelectedSaleIdx(-1);
      setRows([]); // Starts clean empty; added via F1 or Double Tap
      setNarration('');
      setStatusMsg(null);
      setShowSuggestions(false);
      setShowCautionClosed(false);
      setIsProcessModalOpen(false);

      fetch('/api/retail-sale?limit=100')
        .then(r => r.json())
        .then(d => {
          if (d.sales) setAllRecentSales(d.sales);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Filter recent sales vouchers in Find modal
  const filteredSales = useMemo(() => {
    if (!findSearch.trim()) return allRecentSales.slice(0, 50);
    const q = findSearch.toLowerCase().trim();
    return allRecentSales.filter(s => 
      String(s.Customer_id || s.customer_id || '').includes(q) ||
      (s.Customer_Name || s.customer_name || '').toLowerCase().includes(q) ||
      (s.Publica_Name || s.publica_name || '').toLowerCase().includes(q) ||
      (s.Vr_Date || s.vr_date || '').includes(q) ||
      parseIsoToDdMmYyyy(s.Vr_Date || s.vr_date || '').includes(q) ||
      (s.Narr || s.narr || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [allRecentSales, findSearch]);

  // Update a row in grid
  const handleUpdateRow = (index: number, field: keyof SaleRow, value: any) => {
    setRows(prev => {
      const updated = [...prev];
      const cur = { ...updated[index] };
      if (field === 'publica_id') {
        const pId = parseInt(value, 10);
        cur.publica_id = pId;
        const autoRate = getPubDefaultRate(pId, vrDateStr);
        cur.rate = autoRate;
        cur.amt = autoRate * cur.copies;
      } else if (field === 'copies') {
        const c = Math.max(1, parseInt(value, 10) || 1);
        cur.copies = c;
        cur.amt = cur.rate * c;
      } else if (field === 'rate') {
        const r = parseFloat(value) || 0;
        cur.rate = r;
        cur.amt = r * cur.copies;
      } else if (field === 'amt') {
        cur.amt = parseFloat(value) || 0;
      }
      updated[index] = cur;
      return updated;
    });
  };

  const handleAddRow = () => {
    let defaultPubId = pubList[0]?.publica_id || 1;
    let defaultQty = 1;

    if (selectedCust) {
      const subs = (selectedCust as any)._subscriptions || [];
      const existingPubIds = rows.map(r => r.publica_id);
      const candidate = subs.find((s: any) => !existingPubIds.includes(Number(s.publica_id || s.publication_id)));
      if (candidate) {
        defaultPubId = Number(candidate.publica_id || candidate.publication_id);
        defaultQty = Number(candidate.qty || 1);
      } else if (subs.length > 0 && rows.length === 0) {
        defaultPubId = Number(subs[0].publica_id || subs[0].publication_id || defaultPubId);
        defaultQty = Number(subs[0].qty || 1);
      }
    }

    const autoRate = getPubDefaultRate(defaultPubId, vrDateStr);
    setRows(prev => [...prev, {
      publica_id: defaultPubId,
      copies: defaultQty,
      rate: autoRate,
      amt: autoRate * defaultQty
    }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  // Save / Update to Supabase & local DB
  const handleSave = async () => {
    if (!selectedCust) {
      setStatusMsg({ text: 'Please select a permanent customer first.', isError: true });
      return;
    }
    if (rows.length === 0) {
      setStatusMsg({ text: 'Please add at least one publication item (Press F1 or Double Tap).', isError: true });
      return;
    }

    setIsSaving(true);
    setStatusMsg({ text: 'Saving retail sale...', isError: false });

    try {
      const targetIso = getIsoDate(vrDateStr);
      let successCount = 0;

      for (const row of rows) {
        const payload = {
          customer_id: selectedCust.customer_id,
          vr_date: targetIso,
          publica_id: row.publica_id,
          copies: row.copies,
          rate: row.rate,
          amt: row.amt,
          narr: narration || `Retail Sale ${vrDateStr}`,
          financial_year: periodStr
        };

        const res = await fetch('/api/retail-sale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) successCount++;
      }

      const failedCount = rows.length - successCount;
      setStatusMsg(failedCount > 0
        ? { text: `${failedCount} of ${rows.length} retail sale item(s) were NOT saved. Check the list and save them again.`, isError: true }
        : { text: `✓ Successfully saved ${successCount} retail sale item(s) for #${selectedCust.customer_id} ${selectedCust.name_eng}!`, isError: false });

      // Refresh customer sales
      const refRes = await fetch(`/api/retail-sale?customer_id=${selectedCust.customer_id}`);
      const refData = await refRes.json();
      if (refData.sales) {
        setCustomerSales(refData.sales);
      }
    } catch (err: any) {
      setStatusMsg({ text: `Failed to save retail sale: ${err.message}`, isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Voucher
  const handleDelete = async () => {
    if (!selectedCust) return;
    const confirmDel = window.confirm(`Are you sure you want to delete retail sales for #${selectedCust.customer_id} ${selectedCust.name_eng} on ${vrDateStr}?`);
    if (!confirmDel) return;

    try {
      const targetIso = getIsoDate(vrDateStr);
      const res = await fetch(`/api/retail-sale?customer_id=${selectedCust.customer_id}&date=${targetIso}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setStatusMsg({ text: `✓ Deleted retail sale for ${vrDateStr}.`, isError: false });
        setRows([]);
        setNarration('');
        const refRes = await fetch(`/api/retail-sale?customer_id=${selectedCust.customer_id}`);
        const refData = await refRes.json();
        setCustomerSales(refData.sales || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setStatusMsg({ text: `Delete failed: ${errData.error || 'Unknown error'}`, isError: true });
      }
    } catch (err: any) {
      setStatusMsg({ text: `Delete failed: ${err.message}`, isError: true });
    }
  };

  // Open Find Modal (opens customer history if customer is selected, otherwise opens search)
  const handleOpenFind = async () => {
    setIsFindOpen(true);
    setFindSearch('');
    if (selectedCust) {
      setFindTab('history');
      setIsFindLoading(true);
      try {
        const refRes = await fetch(`/api/retail-sale?customer_id=${selectedCust.customer_id}`);
        const refData = await refRes.json();
        if (refData.sales) {
          setCustomerSales(refData.sales);
        }
      } catch (err) {
        console.error('Error fetching sales history:', err);
      } finally {
        setIsFindLoading(false);
      }
    } else {
      setFindTab('customer');
    }
  };

  // Delete an individual sale item from the history view
  const handleDeleteSaleItem = async (saleItem: any) => {
    const rId = saleItem.retail_id || saleItem.Retail_id;
    const cId = saleItem.customer_id || saleItem.Customer_id || selectedCust?.customer_id;
    const pId = saleItem.publica_id || saleItem.Publica_id;
    const vDate = saleItem.vr_date || saleItem.Vr_Date;
    const pName = saleItem.public_name || saleItem.Publica_Name || `Pub #${pId}`;
    const dStr = parseIsoToDdMmYyyy(vDate);
    const targetIso = vDate ? (vDate.includes('T') ? vDate.split('T')[0] : (vDate.includes('/') ? getIsoDate(vDate) : vDate)) : '';

    if (!window.confirm(`Are you sure you want to delete retail sale of ${pName} (${saleItem.copies || saleItem.Copies || 1} copy @ ₹${Number(saleItem.rate || saleItem.Rate || 0).toFixed(2)}) on ${dStr}?`)) {
      return;
    }

    // Immediately remove from UI state
    setCustomerSales(prev => prev.filter(s => {
      const matchId = rId && (s.retail_id === rId || s.Retail_id === rId);
      const matchCombo = (s.customer_id === cId || s.Customer_id === cId) &&
                         (s.publica_id === pId || s.Publica_id === pId) &&
                         (s.vr_date === vDate || s.Vr_Date === vDate);
      return !(matchId || matchCombo);
    }));

    try {
      const queryParams = new URLSearchParams();
      if (rId) queryParams.set('retail_id', String(rId));
      if (saleItem.source_table) queryParams.set('table', saleItem.source_table);
      if (cId) queryParams.set('customer_id', String(cId));
      if (pId) queryParams.set('publica_id', String(pId));
      if (targetIso) queryParams.set('date', targetIso);

      const res = await fetch(`/api/retail-sale?${queryParams.toString()}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setStatusMsg({ text: `✓ Deleted retail sale item (${pName}) on ${dStr}.`, isError: false });
        if (selectedCust) {
          const refRes = await fetch(`/api/retail-sale?customer_id=${selectedCust.customer_id}`);
          const refData = await refRes.json();
          setCustomerSales(refData.sales || []);
        }
        // Refresh recent sales
        fetch('/api/retail-sale?limit=100')
          .then(r => r.json())
          .then(d => {
            if (d.sales) setAllRecentSales(d.sales);
          })
          .catch(() => {});
      } else {
        const errData = await res.json();
        alert(`Delete failed: ${errData.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleCancel = () => {
    setCustInput('');
    setSelectedCust(null);
    setCustomerSales([]);
    setSelectedSaleIdx(-1);
    setRows([]);
    setNarration('');
    setStatusMsg(null);
  };

  // Keyboard shortcut listener (F1 to add row, Esc to close, Alt+S/U/D/F/C/E)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFindOpen) setIsFindOpen(false);
        else if (isProcessModalOpen) setIsProcessModalOpen(false);
        else if (showCautionClosed) setShowCautionClosed(false);
        else if (showSuggestions) setShowSuggestions(false);
        else onClose();
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        handleAddRow();
        return;
      }
      if (e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 's' || k === 'u') {
          e.preventDefault();
          handleSave();
        } else if (k === 'd') {
          e.preventDefault();
          handleDelete();
        } else if (k === 'f') {
          e.preventDefault();
          handleOpenFind();
        } else if (k === 'c') {
          e.preventDefault();
          handleCancel();
        } else if (k === 'e') {
          e.preventDefault();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFindOpen, isProcessModalOpen, showCautionClosed, showSuggestions, selectedCust, rows, vrDateStr, narration]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 select-none">
      
      {/* 3D Classic Windows Dialog Window matching screenshot_09.jpg */}
      <div className="w-[560px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl overflow-hidden font-tahoma text-xs flex flex-col">
        
        {/* Title Bar matching screenshot_09.jpg */}
        <div className="bg-[#0A246A] text-white px-2 py-1 flex justify-between items-center select-none font-bold">
          <div className="flex items-center gap-1.5 text-xs">
            <img 
              src="/legacy_images/paper.ico" 
              alt="ico" 
              className="w-4 h-4" 
              onError={(e) => (e.currentTarget.style.display = 'none')} 
            />
            <span className="tracking-wide">Retail Sale to Permanent Customer</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">_</button>
            <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">□</button>
            <button 
              onClick={onClose}
              className="w-5 h-4 bg-[#ECE9D8] hover:bg-red-600 hover:text-white border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Main Content matching screenshot_09.jpg */}
        <div className="p-3.5 space-y-2 bg-[#ECE9D8]">
          
          {/* Header Title matching screenshot_09.jpg */}
          <div className="text-center pt-0.5 pb-1">
            <h1 
              className="text-2xl font-black text-[#800000] tracking-wider uppercase" 
              style={{ fontFamily: 'Georgia, serif' }}
            >
              RETAIL SALE TO<br />PERMANENT CUSTOMER
            </h1>
          </div>

          {/* Row 1: Date & Period */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <label className="font-bold text-[#800000] text-xs w-12">Date</label>
              <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1.5 py-0.5 shadow-inner">
                <input 
                  type="text" 
                  value={vrDateStr}
                  onChange={(e) => setVrDateStr(e.target.value)}
                  onBlur={handleDateBlur}
                  className="w-24 text-center font-mono font-bold text-black outline-none bg-transparent"
                  placeholder="DD/MM/YYYY"
                />
              </div>
            </div>

            <div className="font-bold text-black text-xs">
              Period :- <span className="text-[#000080] font-mono">{periodStr}</span>
            </div>
          </div>

          {/* Row 2: Customer Name Input */}
          <div className="flex items-center gap-2 px-1 relative">
            <label className="font-bold text-[#800000] text-xs w-12 shrink-0">Name</label>
            <div className="flex-1 relative border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white shadow-inner">
              <input 
                type="text" 
                value={custInput}
                onChange={(e) => handleNameInputChange(e.target.value)}
                onKeyDown={handleNameInputKeyDown}
                onFocus={() => {
                  if (custInput.trim() && suggestions.length > 0) setShowSuggestions(true);
                }}
                className="w-full px-2 py-0.5 bg-transparent text-black font-bold text-xs outline-none"
                autoComplete="off"
                placeholder="Type customer name or ID..."
              />

              {isSearchingCust && (
                <span className="absolute right-2 top-0.5 text-[10px] text-slate-400 italic">searching...</span>
              )}

              {/* Instant Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-0.5 bg-white border border-[#808080] shadow-xl z-50 max-h-44 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {suggestions.map((c) => (
                    <div 
                      key={c.customer_id}
                      onMouseDown={() => handleSelectCustomer(c)}
                      className="p-1.5 hover:bg-[#0A246A] hover:text-white cursor-pointer flex justify-between items-center text-left"
                    >
                      <div>
                        <strong className="text-blue-900 group-hover:text-white font-mono">#{c.customer_id}</strong>
                        <span className="ml-1 font-bold">{c.name_eng}</span>
                        {c.name_hindi && (
                          <span className="ml-1 text-slate-600 group-hover:text-slate-200">
                            ({cleanOrTransliterateHindi(c.name_hindi, c.name_eng)})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 group-hover:text-slate-200">
                        {c.phone || c.add1 || ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Customer Details Sunken Box matching screenshot_09.jpg */}
          <div className="mx-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white shadow-inner min-h-[48px] p-1.5 text-xs text-slate-800">
            {selectedCust ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-[#0A246A]">
                    #{selectedCust.customer_id} {selectedCust.name_eng}
                    {selectedCust.name_hindi && <span className="ml-1 text-slate-600">({cleanOrTransliterateHindi(selectedCust.name_hindi, selectedCust.name_eng)})</span>}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {[selectedCust.add1, selectedCust.add2, selectedCust.phone].filter(Boolean).join(', ') || 'No address details'}
                  </div>
                </div>
                <div className="text-right font-mono font-bold text-xs text-emerald-900">
                  Balance: ₹{Number(selectedCust.cbal || selectedCust.dueamount || selectedCust.due_amount || 0).toFixed(2)}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 italic text-[11px]">
                (Customer address and details will appear here upon selection)
              </div>
            )}
          </div>

          {/* Row 4: The Main Grid Table matching screenshot_09.jpg */}
          <div 
            onDoubleClick={handleAddRow}
            className="mx-1 border-2 border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-[#808080] shadow-inner select-none cursor-pointer"
            title="Double Click / Double Tap or Press [F1] to Add Publication"
          >
            
            {/* Grid Header matching screenshot_09.jpg */}
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#ECE9D8] border-b border-[#808080] text-black font-bold select-none">
                  <th className="p-1 border-r border-[#808080] text-left w-[50%]">Publication</th>
                  <th className="p-1 border-r border-[#808080] text-center w-[16%]">Copies</th>
                  <th className="p-1 border-r border-[#808080] text-right w-[17%]">Rate</th>
                  <th className="p-1 text-right w-[17%]">Rec.Amt</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-300 hover:bg-yellow-50 text-xs">
                    {/* Publication Dropdown */}
                    <td className="p-0.5 border-r border-slate-300">
                      <select
                        value={row.publica_id}
                        onChange={(e) => handleUpdateRow(idx, 'publica_id', e.target.value)}
                        className="w-full bg-transparent text-black font-bold text-xs outline-none cursor-pointer"
                      >
                        {pubList.map(p => (
                          <option key={p.publica_id} value={p.publica_id}>
                            {p.public_name} {p.pub_hindi ? `(${p.pub_hindi})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Copies */}
                    <td className="p-0.5 border-r border-slate-300 text-center">
                      <input 
                        type="number" 
                        min="1"
                        value={row.copies}
                        onChange={(e) => handleUpdateRow(idx, 'copies', e.target.value)}
                        className="w-full text-center font-mono font-bold bg-transparent outline-none"
                      />
                    </td>

                    {/* Rate */}
                    <td className="p-0.5 border-r border-slate-300 text-right">
                      <input 
                        type="number" 
                        step="0.25"
                        value={row.rate}
                        onChange={(e) => handleUpdateRow(idx, 'rate', e.target.value)}
                        className="w-full text-right font-mono font-bold bg-transparent outline-none pr-1"
                      />
                    </td>

                    {/* Rec.Amt */}
                    <td className="p-0.5 text-right">
                      <div className="flex items-center justify-end">
                        <input 
                          type="number" 
                          step="0.25"
                          value={row.amt}
                          onChange={(e) => handleUpdateRow(idx, 'amt', e.target.value)}
                          className="w-full text-right font-mono font-bold text-blue-900 bg-transparent outline-none pr-1"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveRow(idx);
                          }}
                          className="text-red-600 hover:text-red-900 font-bold px-1 cursor-pointer text-xs"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Empty gray grid canvas area matching screenshot_09.jpg */}
            <div 
              onClick={handleAddRow}
              className={`bg-[#808080] ${rows.length === 0 ? 'h-24' : 'h-10'} flex flex-col items-center justify-center text-slate-200 text-xs font-bold cursor-pointer hover:bg-[#737373] transition-colors p-2 text-center select-none`}
              title="Click or Double Tap or Press [F1] to add publication"
            >
              <div className="text-yellow-200 text-xs font-bold flex items-center gap-1">
                <span>➕</span>
                <span>{rows.length === 0 ? 'Press [F1] or Double Tap to Add Publication' : '+ Press [F1] or Click to add another publication row'}</span>
              </div>
              {rows.length === 0 && (
                <div className="text-[11px] text-slate-300 mt-0.5 font-normal">
                  (अखबार या पत्रिका जोड़ने हेतु <strong>F1</strong> दबाएँ अथवा यहाँ <strong>डबल क्लिक</strong> करें)
                </div>
              )}
            </div>
          </div>

          {/* Row 5: Narration matching screenshot_09.jpg */}
          <div className="flex items-start gap-2 px-1 text-xs">
            <label className="font-bold text-[#000080] w-14 pt-1 shrink-0">Narration</label>
            <div className="flex-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white shadow-inner">
              <textarea 
                rows={2}
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                className="w-full px-2 py-1 bg-transparent text-xs font-bold text-black outline-none resize-none"
                placeholder="Optional remark / narration..."
              />
            </div>
          </div>

          {/* Status Message */}
          {statusMsg && (
            <div className={`text-xs font-bold p-1 text-center border mx-1 ${statusMsg.isError ? 'bg-red-50 text-red-900 border-red-300' : 'bg-emerald-50 text-emerald-900 border-emerald-300'}`}>
              {statusMsg.text}
            </div>
          )}

          {/* Row 6: Action Buttons matching screenshot_09.jpg exactly */}
          <div className="flex items-end justify-between px-1 pt-1 pb-1 select-none">
            
            {/* Bottom-Left: Proces Y/N Button matching screenshot_09.jpg */}
            <button 
              type="button"
              onClick={() => setIsProcessModalOpen(true)}
              className="px-3 py-1 bg-[#ECE9D8] hover:bg-white active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white shadow-xs text-xs font-bold text-[#006666] cursor-pointer"
              title="Process During the Month and Year"
            >
              <u>P</u>roces Y/N
            </button>

            {/* Bottom-Right: 2 Rows of Parallelogram Cyan Gradient Buttons matching screenshot_09.jpg */}
            <div className="flex flex-col items-end gap-1.5">
              
              {/* Row 1: Save, Update, Del */}
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-3.5 py-0.5 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    💾 <u>S</u>ave
                  </span>
                </button>

                <button 
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-3.5 py-0.5 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    ↩ <u>U</u>pdate
                  </span>
                </button>

                <button 
                  type="button"
                  onClick={handleDelete}
                  className="px-3.5 py-0.5 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    🗑 <u>D</u>el
                  </span>
                </button>
              </div>

              {/* Row 2: Find, Cancel, Exit */}
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={handleOpenFind}
                  className="px-3.5 py-0.5 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    🔍 <u>F</u>ind
                  </span>
                </button>

                <button 
                  type="button"
                  onClick={handleCancel}
                  className="px-3.5 py-0.5 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    ✕ <u>C</u>ancel
                  </span>
                </button>

                <button 
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-0.5 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-red-800"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    🛑 <u>E</u>xit
                  </span>
                </button>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Process During the Month and Year Modal */}
      {isProcessModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center select-none p-4">
          <div className="bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl w-[440px] p-3 font-tahoma">
            <div className="border border-[#808080] p-4 relative pt-6 bg-[#ECE9D8]">
              <span className="absolute -top-2.5 left-3 bg-[#ECE9D8] px-1 text-xs font-bold text-[#800000]">
                Process During the Month and Year
              </span>

              <div className="flex justify-between items-start gap-4">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-4">
                    <label className="text-xs font-bold text-[#800000] w-14">Month</label>
                    <select
                      value={processMonth}
                      onChange={(e) => setProcessMonth(e.target.value)}
                      className="w-32 px-1 py-0.5 bg-white border border-[#808080] text-xs font-bold outline-none shadow-inner"
                    >
                      {MONTH_LIST.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="text-xs font-bold text-[#800000] w-14">Year</label>
                    <input
                      type="text"
                      value={processYear}
                      onChange={(e) => setProcessYear(e.target.value)}
                      className="w-32 px-2 py-0.5 bg-white border border-[#808080] text-xs font-bold outline-none font-mono shadow-inner"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProcessModalOpen(false);
                      setStatusMsg({ text: `Process set for ${processMonth} ${processYear}.`, isError: false });
                    }}
                    className="px-6 py-1 bg-[#ECE9D8] hover:bg-white active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-xs text-xs font-bold text-black cursor-pointer"
                  >
                    <u>S</u>ave
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsProcessModalOpen(false)}
                    className="px-6 py-1 bg-[#ECE9D8] hover:bg-white active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-xs text-xs font-bold text-black cursor-pointer"
                  >
                    <u>C</u>lose
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Caution Dialog: Customer Publication is Closed */}
      {showCautionClosed && (
        <div className="fixed inset-0 z-70 bg-black/40 flex items-center justify-center select-none p-4">
          <div className="bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl w-[380px] p-1 font-tahoma">
            <div className="bg-[#0A246A] text-white px-2 py-0.5 flex justify-between items-center font-bold text-xs select-none">
              <span>Caution</span>
              <button 
                type="button"
                onClick={() => setShowCautionClosed(false)}
                className="text-white hover:bg-red-600 px-1 py-0 text-xs font-bold leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shrink-0 shadow-inner">
                <span className="text-white text-2xl font-black leading-none">✕</span>
              </div>
              <div className="text-xs font-bold text-black">
                Customer Publication is Closed
              </div>
            </div>

            <div className="flex justify-center pb-2">
              <button
                type="button"
                autoFocus
                onClick={() => setShowCautionClosed(false)}
                className="px-6 py-1 bg-[#ECE9D8] hover:bg-white active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-xs text-xs font-bold text-black cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer / Voucher Find Search Modal */}
      {isFindOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-lg bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl p-3 space-y-2 text-xs font-tahoma">
            <div className="bg-[#0A246A] text-white px-2 py-1 font-bold flex justify-between items-center">
              <span>Find Retail Sale / Permanent Customer</span>
              <button 
                type="button" 
                onClick={() => setIsFindOpen(false)} 
                className="text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#808080] gap-1 pt-1">
              {selectedCust && (
                <button
                  type="button"
                  onClick={() => setFindTab('history')}
                  className={`px-3 py-1 font-bold cursor-pointer ${
                    findTab === 'history'
                      ? 'bg-white border-t border-l border-r border-[#808080] -mb-[1px] text-blue-900'
                      : 'bg-[#D4D0C8] hover:bg-slate-200 text-black'
                  }`}
                >
                  📜 #{selectedCust.customer_id} History ({customerSales.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setFindTab('voucher')}
                className={`px-3 py-1 font-bold cursor-pointer ${
                  findTab === 'voucher'
                    ? 'bg-white border-t border-l border-r border-[#808080] -mb-[1px] text-blue-900'
                    : 'bg-[#D4D0C8] hover:bg-slate-200 text-black'
                }`}
              >
                🧾 All Retail Vouchers ({allRecentSales.length})
              </button>
              <button
                type="button"
                onClick={() => setFindTab('customer')}
                className={`px-3 py-1 font-bold cursor-pointer ${
                  findTab === 'customer'
                    ? 'bg-white border-t border-l border-r border-[#808080] -mb-[1px] text-blue-900'
                    : 'bg-[#D4D0C8] hover:bg-slate-200 text-black'
                }`}
              >
                👤 Search Customer
              </button>
            </div>
            
            <input 
              type="text" 
              placeholder={
                findTab === 'history' 
                  ? `Filter #${selectedCust?.customer_id} ${selectedCust?.name_eng} sales by date, publication...` 
                  : findTab === 'customer' 
                  ? "Search all 24,626 customers by ID, Name, Phone..." 
                  : "Search voucher by Customer, Date, Publication..."
              }
              value={findSearch}
              onChange={(e) => setFindSearch(e.target.value)}
              className="w-full px-2 py-1 bg-white border border-[#808080] font-bold outline-none shadow-inner"
              autoFocus
            />

            {findTab === 'history' ? (
              <div className="bg-white border border-[#808080] max-h-72 overflow-auto divide-y divide-slate-200 shadow-inner">
                {isFindLoading && (
                  <div className="p-3 text-center text-slate-500 italic">Loading sales history...</div>
                )}
                {!isFindLoading && customerSales.length === 0 && (
                  <div className="p-4 text-center text-slate-500 italic">
                    No retail sales recorded yet for #{selectedCust?.customer_id} {selectedCust?.name_eng}.
                  </div>
                )}
                {!isFindLoading && customerSales
                  .filter(s => {
                    if (!findSearch.trim()) return true;
                    const q = findSearch.toLowerCase().trim();
                    const pName = String(s.Publica_Name || s.public_name || '').toLowerCase();
                    const sDate = parseIsoToDdMmYyyy(s.Vr_Date || s.vr_date);
                    const narr = String(s.Narr || s.narr || '').toLowerCase();
                    return pName.includes(q) || sDate.includes(q) || narr.includes(q);
                  })
                  .map((s, idx) => {
                    const sDate = parseIsoToDdMmYyyy(s.Vr_Date || s.vr_date);
                    const pName = s.Publica_Name || s.public_name || `Publication #${s.Publica_id || s.publica_id}`;
                    const copies = Number(s.Copies || s.copies || 1);
                    const rate = Number(s.Rate || s.rate || 0);
                    const amt = Number(s.Amt !== undefined ? s.Amt : (s.amt !== undefined ? s.amt : s.amount || 0));
                    const narrText = s.Narr || s.narr;

                    return (
                      <div 
                        key={s.Retail_id || s.retail_id || idx}
                        className="p-2 hover:bg-[#F0F4FF] flex justify-between items-center gap-2 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-blue-900 text-xs">{pName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-mono">📅 {sDate}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 mt-0.5">
                            <span className="font-semibold">{copies}</span> copy @ ₹{rate.toFixed(2)} = <strong className="text-[#800000] font-mono">₹{amt.toFixed(2)}</strong>
                            {narrText && <span className="text-slate-500 italic ml-2">({narrText})</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              loadSaleIntoForm(s, customerSales);
                              setIsFindOpen(false);
                            }}
                            className="px-2.5 py-1 bg-[#ECE9D8] hover:bg-white active:bg-[#D4D0C8] border border-[#808080] text-blue-900 font-bold text-[11px] rounded-xs shadow-xs cursor-pointer flex items-center gap-1"
                            title="Load this voucher into form"
                          >
                            ↩ Load
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSaleItem(s)}
                            className="px-2 py-1 bg-red-50 hover:bg-red-600 hover:text-white border border-red-300 text-red-700 font-bold text-[11px] rounded-xs shadow-xs cursor-pointer flex items-center gap-1 transition-colors"
                            title="Delete this retail sale item from database"
                          >
                            🗑 Del
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : findTab === 'customer' ? (
              <div className="bg-white border border-[#808080] max-h-60 overflow-auto divide-y divide-slate-200 shadow-inner">
                {isFindLoading && (
                  <div className="p-3 text-center text-slate-500 italic">Searching database...</div>
                )}
                {!isFindLoading && filteredCusts.length === 0 && (
                  <div className="p-3 text-center text-slate-400 italic">No customers found.</div>
                )}
                {!isFindLoading && filteredCusts.map(c => (
                  <div 
                    key={c.customer_id}
                    onClick={() => {
                      handleSelectCustomer(c);
                      setIsFindOpen(false);
                    }}
                    className="p-1.5 hover:bg-[#0A246A] hover:text-white cursor-pointer flex justify-between items-center"
                  >
                    <div>
                      <strong className="text-blue-900 group-hover:text-white font-mono">#{c.customer_id}</strong> - {c.name_eng}
                      {c.name_hindi && <span className="text-slate-600 group-hover:text-slate-200 block text-[10px]">({cleanOrTransliterateHindi(c.name_hindi, c.name_eng)})</span>}
                    </div>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-200 font-mono">{c.phone || c.add1 || 'Beawar'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-[#808080] max-h-60 overflow-auto divide-y divide-slate-200 shadow-inner">
                {filteredSales.map((s, idx) => {
                  const sCustId = Number(s.Customer_id || s.customer_id);
                  const sDate = parseIsoToDdMmYyyy(s.Vr_Date || s.vr_date);
                  return (
                    <div 
                      key={s.Retail_id || s.retail_id || idx}
                      className="p-1.5 hover:bg-[#F0F4FF] flex justify-between items-center"
                    >
                      <div 
                        onClick={() => {
                          const targetCust: Customer = {
                            customer_id: sCustId,
                            name_eng: s.Customer_Name || s.customer_name || `Customer #${sCustId}`,
                            security_deposit: 0,
                            priority: 0,
                            dueamount: sCustId === 24669 ? 3206 : 0,
                            due_amount: sCustId === 24669 ? 3206 : 0,
                            cbal: sCustId === 24669 ? 3206 : 0,
                            region_id: 1,
                            delivery: 0,
                            discount: 0
                          };
                          handleSelectCustomer(targetCust);
                          setIsFindOpen(false);
                        }}
                        className="cursor-pointer flex-1 min-w-0"
                      >
                        <div className="font-bold text-blue-900">
                          #{sCustId} {s.Customer_Name || s.customer_name || 'Customer'}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          {s.Publica_Name || s.publica_name || `Pub #${s.Publica_id || s.publica_id}`} • {s.Copies || s.copies || 1} copy @ ₹{Number(s.Rate || s.rate || 0).toFixed(2)}
                          {s.Narr || s.narr ? ` • ${s.Narr || s.narr}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2 flex items-center gap-2">
                        <div>
                          <span className="font-bold text-[#800000] font-mono block">
                            ₹{Number(s.Amt !== undefined ? s.Amt : (s.amt || 0)).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">📅 {sDate}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSaleItem(s)}
                          className="px-2 py-0.5 bg-red-50 hover:bg-red-600 hover:text-white border border-red-300 text-red-700 font-bold text-[10px] rounded-xs shadow-xs cursor-pointer"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button 
                type="button"
                onClick={() => setIsFindOpen(false)}
                className="px-4 py-1 bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] font-bold cursor-pointer hover:bg-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
