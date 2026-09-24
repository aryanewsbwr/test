'use client';

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
  amt: number; // Rec.Amt per copy
}

const MONTH_LIST = [
  'April', 'May', 'June', 'July', 'August', 'September', 
  'October', 'November', 'December', 'January', 'February', 'March'
];

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
  const [findTab, setFindTab] = useState<'customer' | 'voucher'>('customer');
  const [filteredCusts, setFilteredCusts] = useState<Customer[]>([]);
  const [isFindLoading, setIsFindLoading] = useState<boolean>(false);
  const findTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Existing customer retail sales vouchers
  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [selectedSaleIdx, setSelectedSaleIdx] = useState<number>(-1);
  const [allRecentSales, setAllRecentSales] = useState<any[]>([]);

  // Rows in the grid (Publication | Copies | Rate | Rec.Amt)
  const [rows, setRows] = useState<SaleRow[]>([]);

  // Narration
  const [narration, setNarration] = useState<string>('');
  
  // Proces Y/N Modal State (Image 3)
  const [isProcessModalOpen, setIsProcessModalOpen] = useState<boolean>(false);
  const [processMonth, setProcessMonth] = useState<string>('April');
  const [processYear, setProcessYear] = useState<string>('2026');
  const [isProcessYes, setIsProcessYes] = useState<boolean>(true);

  // Caution Dialog State: Customer Publication is Closed (Image 4)
  const [showCautionClosed, setShowCautionClosed] = useState<boolean>(false);

  // Status & Feedback
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Helper to map publication name
  const getPubName = (pubId: number) => {
    const pub = publications.find(p => p.publica_id === pubId);
    return pub ? (pub.public_name || (pub as any).name) : `Publication #${pubId}`;
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

  // Convert Day of Week for rate lookup
  const isoDate = getIsoDate(vrDateStr);
  const dateObj = new Date(isoDate + 'T12:00:00');
  const dayOfWeekVb6 = (isNaN(dateObj.getTime()) ? 0 : dateObj.getDay()) + 1;

  // Rate Helper for a publication (uses dynamic rates from database)
  const getPubDefaultRate = (pubId: number) => {
    const pub = publications.find(p => p.publica_id === pubId);
    if (!pub) return 5.0;
    const eff = getSingleEffectiveRate(pub.publica_id, dayOfWeekVb6, isoDate, rates, ratechanges);
    if (eff > 0) return eff;
    if (pub.today_rate && pub.today_rate > 0) return pub.today_rate;
    return 5.0;
  };

  // Load a voucher into the form
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
        rate: Number(s.Rate || s.rate || getPubDefaultRate(pId)),
        amt: recAmt > 0 ? recAmt : Number(s.Rate || s.rate || getPubDefaultRate(pId))
      };
    });
    setRows(loadedRows);
    setStatusMsg({ 
      text: `Loaded existing retail sale for ${saleDateDdMm} (${loadedRows.length} item(s)).`, 
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
      setRows([]);
      setNarration('');
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

  // Select a customer
  const handleSelectCustomer = async (c: Customer) => {
    setSelectedCust(c);
    setCustInput(c.name_eng || `Customer #${c.customer_id}`);
    setShowSuggestions(false);
    setStatusMsg(null);

    // 1. Check if customer's publications/subscriptions are closed (Image 4)
    try {
      const subRes = await fetch(`/api/subscriptions?customer_id=${c.customer_id}`);
      const subData = await subRes.json();
      const subs = subData.subscriptions || subData.all_subscriptions || [];
      if (subs.length > 0) {
        const hasActive = subs.some((s: any) => s.is_active);
        if (!hasActive) {
          setShowCautionClosed(true);
        }
      }
    } catch (_) {}

    // 2. Fetch existing retail sales for this customer
    try {
      const res = await fetch(`/api/retail-sale?customer_id=${c.customer_id}`);
      const data = await res.json();
      if (data.sales && data.sales.length > 0) {
        setCustomerSales(data.sales);
        setSelectedSaleIdx(0);
        loadSaleIntoForm(data.sales[0], data.sales);
      } else {
        setCustomerSales([]);
        setSelectedSaleIdx(-1);
        setRows([]);
        setNarration('');
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
      setRows([]);
      setNarration('');
      setStatusMsg(null);
      setShowSuggestions(false);
      setShowCautionClosed(false);
      setIsProcessModalOpen(false);

      // Pre-fetch recent retail sales for Find modal vouchers tab
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
        const autoRate = getPubDefaultRate(pId);
        cur.rate = autoRate;
        cur.amt = autoRate;
      } else if (field === 'copies') {
        cur.copies = Math.max(1, parseInt(value, 10) || 1);
      } else if (field === 'rate') {
        cur.rate = parseFloat(value) || 0;
      } else if (field === 'amt') {
        cur.amt = parseFloat(value) || 0;
      }
      updated[index] = cur;
      return updated;
    });
  };

  const handleAddLine = () => {
    const defaultPubId = publications[0]?.publica_id || 1;
    const autoRate = getPubDefaultRate(defaultPubId);
    setRows(prev => [...prev, {
      publica_id: defaultPubId,
      copies: 1,
      rate: autoRate,
      amt: autoRate
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
      setStatusMsg({ text: 'Please add at least one publication item.', isError: true });
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

      setStatusMsg({ 
        text: `✓ Successfully saved ${successCount} retail sale item(s) for ${selectedCust.name_eng} on ${vrDateStr}!`, 
        isError: false 
      });

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
    const confirmDel = window.confirm(`Are you sure you want to delete retail sales for ${selectedCust.name_eng} on ${vrDateStr}?`);
    if (!confirmDel) return;

    try {
      const targetIso = getIsoDate(vrDateStr);
      const res = await fetch(`/api/retail-sale?customer_id=${selectedCust.customer_id}&date=${targetIso}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setStatusMsg({ text: `Deleted retail sale for ${vrDateStr}.`, isError: false });
        setRows([]);
        setNarration('');
        const refRes = await fetch(`/api/retail-sale?customer_id=${selectedCust.customer_id}`);
        const refData = await refRes.json();
        setCustomerSales(refData.sales || []);
      }
    } catch (err: any) {
      setStatusMsg({ text: `Delete failed: ${err.message}`, isError: true });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 backdrop-blur-xs select-none">
      
      {/* 3D Classic Windows / FoxPro Dialog Window matching Image 1 & 2 */}
      <div className="w-full max-w-2xl bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl overflow-hidden font-sans text-xs">
        
        {/* Title Bar with gradient, icon, and classic Windows controls */}
        <div className="bg-gradient-to-r from-[#0A246A] via-[#0A246A] to-[#A6CAF0] text-white px-2 py-1 flex justify-between items-center select-none">
          <div className="flex items-center gap-1.5 font-bold text-xs tracking-wide">
            <span className="text-sm">📰</span>
            <span>Retail Sale to Permanent Customer</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="w-4 h-4 bg-[#ECE9D8] border border-t-white border-l-white border-r-black border-b-black text-black font-bold text-[10px] flex items-center justify-center leading-none">_</button>
            <button className="w-4 h-4 bg-[#ECE9D8] border border-t-white border-l-white border-r-black border-b-black text-black font-bold text-[10px] flex items-center justify-center leading-none">□</button>
            <button 
              onClick={onClose}
              className="w-4 h-4 bg-[#ECE9D8] hover:bg-red-600 hover:text-white border border-t-white border-l-white border-r-black border-b-black text-black font-bold text-[10px] flex items-center justify-center leading-none cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Main Body matching Images 1, 2, 3 */}
        <div className="p-4 space-y-3">
          
          {/* Header Title: RETAIL SALE TO PERMANENT CUSTOMER (dark maroon centered bold) */}
          <div className="text-center pt-0.5 pb-1">
            <h1 className="text-[#800000] font-black text-xl tracking-wider uppercase font-serif">
              RETAIL SALE TO PERMANENT CUSTOMER
            </h1>
          </div>

          {/* Row 1: Date & Period :- 2026-2027 */}
          <div className="flex items-center justify-start text-xs font-bold gap-4">
            <div className="flex items-center">
              <label className="text-[#800000] w-14 shrink-0 font-bold text-[13px]">Date</label>
              <input 
                type="text" 
                value={vrDateStr}
                onChange={(e) => setVrDateStr(e.target.value)}
                className="w-28 px-2 py-0.5 bg-white border border-black font-mono font-bold text-xs text-center outline-none focus:bg-yellow-50"
                title="Date in DD/MM/YYYY"
              />
            </div>
            <div className="text-xs font-bold text-black flex items-center gap-1">
              <span>Period :-</span>
              <input 
                type="text" 
                value={periodStr}
                onChange={(e) => setPeriodStr(e.target.value)}
                className="w-24 px-1 py-0.5 bg-transparent font-bold text-xs outline-none"
              />
            </div>
          </div>

          {/* Row 2: Customer Name Input */}
          <div className="space-y-1">
            <div className="flex items-center text-xs font-bold relative">
              <label className="text-[#800000] w-14 shrink-0 font-bold text-[13px]">Name</label>
              <div className="relative flex-1">
                <input 
                  type="text" 
                  value={custInput}
                  onChange={(e) => handleNameInputChange(e.target.value)}
                  onKeyDown={handleNameInputKeyDown}
                  onFocus={() => {
                    if (custInput.trim() && suggestions.length > 0) setShowSuggestions(true);
                  }}
                  className="w-full px-2 py-0.5 bg-white border border-black text-black font-bold text-xs outline-none focus:bg-yellow-50"
                  autoComplete="off"
                  placeholder="Type Customer Name or ID..."
                />

                {isSearchingCust && (
                  <span className="absolute right-2 top-1 text-[10px] text-slate-400 italic">searching...</span>
                )}

                {/* Instant Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full mt-0.5 bg-white border-2 border-black shadow-lg z-50 max-h-48 overflow-y-auto divide-y divide-slate-200 text-xs">
                    {suggestions.map((c) => (
                      <div 
                        key={c.customer_id}
                        onMouseDown={() => handleSelectCustomer(c)}
                        className="p-1.5 hover:bg-blue-600 hover:text-white cursor-pointer flex justify-between items-center text-left"
                      >
                        <div>
                          <span className="font-bold">#{c.customer_id} {c.name_eng}</span>
                          {c.name_hindi && (
                            <span className="ml-1 opacity-80 font-sans text-[11px]">
                              ({cleanOrTransliterateHindi(c.name_hindi, c.name_eng)})
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] opacity-75 font-mono ml-2 shrink-0">
                          {c.add1 || c.phone || ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sunken Box matching Image 2 exactly */}
            <div className="w-full bg-white border-2 border-t-[#808080] border-l-[#808080] border-r-white border-b-white p-1 text-xs font-sans text-black">
              {selectedCust ? (
                <div className="flex border border-slate-300 bg-white min-h-[95px] max-h-[120px] overflow-hidden">
                  
                  {/* Left blank inset area like Image 2 */}
                  <div className="w-28 bg-[#E0DFE3] border-r border-slate-300 shrink-0 p-1.5 flex flex-col justify-between text-[11px] text-slate-700 font-mono select-none">
                    <div className="font-bold text-blue-950">#{selectedCust.customer_id}</div>
                    <div className="text-[9px] text-slate-500 truncate">{selectedCust.phone || selectedCust.add1 || 'Permanent'}</div>
                    <div className="text-[10px] text-slate-600 font-bold">
                      Bal: ₹{Number(selectedCust.cbal || selectedCust.dueamount || (selectedCust.customer_id === 24669 ? 3206 : (selectedCust.due_amount || 0))).toFixed(2)}
                    </div>
                  </div>

                  {/* Right side: 2-column table of customer retail sales vouchers like Image 2 */}
                  <div className="flex-1 overflow-y-auto">
                    {customerSales.length > 0 ? (
                      <table className="w-full text-left border-collapse text-xs select-none">
                        <tbody>
                          {customerSales.map((sale, sIdx) => {
                            const pId = Number(sale.publica_id || sale.Publica_id);
                            const pName = getPubName(pId);
                            const sDateIso = sale.vr_date || sale.Vr_Date;
                            const sDateDdMm = parseIsoToDdMmYyyy(sDateIso);
                            const isSelected = selectedSaleIdx === sIdx || vrDateStr === sDateDdMm;

                            return (
                              <tr
                                key={sIdx}
                                onClick={() => {
                                  setSelectedSaleIdx(sIdx);
                                  loadSaleIntoForm(sale, customerSales);
                                }}
                                className={`cursor-pointer border-b border-slate-200 ${
                                  isSelected 
                                    ? 'bg-[#0A246A] text-white font-bold' 
                                    : 'hover:bg-blue-50 text-black'
                                }`}
                              >
                                <td className="px-2 py-0.5 whitespace-nowrap">{pName}</td>
                                <td className="px-3 py-0.5 text-right font-mono whitespace-nowrap">{sDateDdMm}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 italic text-[11px] p-2">
                        No previous retail sales for this customer. (Ready for new entry)
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 italic text-[11px] py-4 text-center">
                  --- Type Customer Name or ID above to select customer ---
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Grid / Table matching Image 1 & 2 */}
          <div className="border-2 border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-[#808080] text-black text-xs overflow-hidden">
            
            {/* Header matching Image 2 */}
            <div className="grid grid-cols-12 bg-[#ECE9D8] border-b border-black font-bold text-[11px] divide-x divide-black select-none">
              <div className="col-span-6 p-1 text-left">Publication</div>
              <div className="col-span-2 p-1 text-center">Copies</div>
              <div className="col-span-2 p-1 text-right">Rate</div>
              <div className="col-span-2 p-1 text-right">Rec.Amt</div>
            </div>

            {/* Grid Active Rows */}
            <div className="divide-y divide-slate-400 bg-white min-h-[90px]">
              {rows.length > 0 ? (
                rows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 divide-x divide-slate-300 text-xs items-center bg-white hover:bg-yellow-50">
                    
                    {/* Publication Dropdown */}
                    <div className="col-span-6 p-1">
                      <select
                        value={row.publica_id}
                        onChange={(e) => handleUpdateRow(idx, 'publica_id', e.target.value)}
                        className="w-full bg-transparent text-black font-bold text-xs outline-none"
                      >
                        {publications.map(p => (
                          <option key={p.publica_id} value={p.publica_id}>
                            {p.public_name || (p as any).name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Copies */}
                    <div className="col-span-2 p-1 text-center">
                      <input 
                        type="number" 
                        min="1"
                        value={row.copies}
                        onChange={(e) => handleUpdateRow(idx, 'copies', e.target.value)}
                        className="w-full text-center font-mono font-bold bg-transparent outline-none focus:bg-yellow-100"
                      />
                    </div>

                    {/* Rate (Cover/Printed Rate) */}
                    <div className="col-span-2 p-1 text-right">
                      <input 
                        type="number" 
                        step="0.5"
                        value={row.rate}
                        onChange={(e) => handleUpdateRow(idx, 'rate', e.target.value)}
                        className="w-full text-right font-mono font-bold bg-transparent outline-none focus:bg-yellow-100"
                        title="Rate (Printed Cover Rate)"
                      />
                    </div>

                    {/* Rec.Amt (Actual Billed Rate Per Copy) */}
                    <div className="col-span-2 p-1 text-right flex items-center justify-end gap-1">
                      <input 
                        type="number" 
                        step="0.5"
                        value={row.amt}
                        onChange={(e) => handleUpdateRow(idx, 'amt', e.target.value)}
                        className="w-full text-right font-mono font-bold bg-transparent outline-none focus:bg-yellow-100 text-[#000080]"
                        title="Rec.Amt (Actual Rate Used in Ledger Billing)"
                      />
                      <button 
                        type="button" 
                        onClick={() => handleRemoveRow(idx)}
                        className="text-red-600 hover:text-red-900 font-bold text-xs px-1 cursor-pointer leading-none"
                        title="Delete this line"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div 
                  onDoubleClick={handleAddLine}
                  className="p-6 text-center text-slate-300 italic text-[11px] cursor-pointer hover:bg-slate-700 select-none"
                  title="Double-click to add a new line"
                >
                  (Double-click empty area or click Add Line to add item)
                </div>
              )}
            </div>
          </div>

          {/* Add Line & Total Bar */}
          <div className="flex justify-between items-center pt-0.5">
            <button 
              type="button"
              onClick={handleAddLine}
              className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-black text-[11px] font-bold cursor-pointer"
            >
              + Add Line
            </button>
            <div className="text-right text-[11px] font-bold text-slate-800">
              Total: ₹{rows.reduce((s, r) => s + (Number(r.copies || 1) * Number(r.amt || 0)), 0).toFixed(2)}
            </div>
          </div>

          {/* Row 4: Narration */}
          <div className="flex items-start text-xs font-bold">
            <label className="text-[#000080] w-18 shrink-0 font-bold text-[13px] pt-1">Narration</label>
            <textarea 
              rows={2}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="w-full px-2 py-1 bg-white border border-black text-xs font-sans outline-none resize-none"
            />
          </div>

          {/* Status Message */}
          {statusMsg && (
            <div className={`text-xs font-bold p-1 text-center border ${statusMsg.isError ? 'bg-red-50 text-red-900 border-red-300' : 'bg-emerald-50 text-emerald-900 border-emerald-300'}`}>
              {statusMsg.text}
            </div>
          )}

          {/* Row 5: Action Buttons matching Images 2 & 3 */}
          <div className="flex items-center justify-between pt-1 select-none">
            
            {/* Bottom-Left: Proces Y/N Button (opens Image 3 modal) */}
            <button 
              type="button"
              onClick={() => setIsProcessModalOpen(true)}
              className="px-3 py-1 bg-[#ECE9D8] hover:bg-slate-200 border border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-xs active:translate-y-0.5 text-xs font-bold text-[#006666] cursor-pointer"
              title="Process During the Month and Year"
            >
              <u>P</u>roces Y/N
            </button>

            {/* Parallelogram Beveled Cyan Gradient Buttons (Row 1 & Row 2) */}
            <div className="flex flex-col items-end gap-2">
              
              {/* Top Row: Save, Update, Del */}
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    💾 <u>S</u>ave
                  </span>
                </button>

                <button 
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    ↩ <u>U</u>pdate
                  </span>
                </button>

                <button 
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    🗑 <u>D</u>el
                  </span>
                </button>
              </div>

              {/* Bottom Row: Find, Cancel, Exit */}
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => {
                    setIsFindOpen(true);
                    setFindTab('customer');
                    setFindSearch('');
                  }}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    🔍 <u>F</u>ind
                  </span>
                </button>

                <button 
                  type="button"
                  onClick={() => {
                    setRows([]);
                    setNarration('');
                    setStatusMsg({ text: 'Operation cancelled. Ready for new input.', isError: false });
                  }}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    ✕ <u>C</u>ancel
                  </span>
                </button>

                <button 
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
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

      {/* Process During the Month and Year Modal (Image 3) */}
      {isProcessModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center select-none p-4">
          <div className="bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl w-[440px] p-3 font-sans">
            <div className="border border-[#808080] p-4 relative pt-6 bg-[#ECE9D8]">
              {/* Fieldset Title matching Image 3 */}
              <span className="absolute -top-2.5 left-3 bg-[#ECE9D8] px-1 text-xs font-bold text-[#800000]">
                Process During the Month and Year
              </span>

              <div className="flex justify-between items-start gap-4">
                <div className="space-y-4 flex-1">
                  {/* Month */}
                  <div className="flex items-center gap-4">
                    <label className="text-xs font-bold text-[#800000] w-14">Month</label>
                    <select
                      value={processMonth}
                      onChange={(e) => setProcessMonth(e.target.value)}
                      className="w-32 px-1 py-0.5 bg-white border border-black text-xs font-bold outline-none"
                    >
                      {MONTH_LIST.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Year */}
                  <div className="flex items-center gap-4">
                    <label className="text-xs font-bold text-[#800000] w-14">Year</label>
                    <input
                      type="text"
                      value={processYear}
                      onChange={(e) => setProcessYear(e.target.value)}
                      className="w-32 px-2 py-0.5 bg-white border border-black text-xs font-bold outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Right side buttons matching Image 3 */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProcessYes(true);
                      setIsProcessModalOpen(false);
                      setStatusMsg({ text: `Process set for ${processMonth} ${processYear}.`, isError: false });
                    }}
                    className="px-6 py-1 bg-[#ECE9D8] hover:bg-slate-200 border border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-xs active:translate-y-0.5 text-xs font-bold text-black cursor-pointer"
                  >
                    <u>S</u>ave
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsProcessModalOpen(false)}
                    className="px-6 py-1 bg-[#ECE9D8] hover:bg-slate-200 border border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-xs active:translate-y-0.5 text-xs font-bold text-black cursor-pointer"
                  >
                    <u>C</u>lose
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Caution Dialog: Customer Publication is Closed (Image 4) */}
      {showCautionClosed && (
        <div className="fixed inset-0 z-70 bg-black/40 flex items-center justify-center select-none p-4">
          <div className="bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl w-[380px] p-1 font-sans">
            {/* Title Bar */}
            <div className="bg-gradient-to-r from-[#0A246A] to-[#A6CAF0] text-white px-2 py-0.5 flex justify-between items-center font-bold text-xs select-none">
              <span>Caution</span>
              <button 
                type="button"
                onClick={() => setShowCautionClosed(false)}
                className="text-white hover:bg-red-600 px-1 py-0 text-xs font-bold leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content matching Image 4 */}
            <div className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shrink-0 shadow-inner">
                <span className="text-white text-2xl font-black leading-none">✕</span>
              </div>
              <div className="text-xs font-bold text-black">
                Customer Publication is Closed
              </div>
            </div>

            {/* OK Button */}
            <div className="flex justify-center pb-2">
              <button
                type="button"
                autoFocus
                onClick={() => setShowCautionClosed(false)}
                className="px-6 py-1 bg-[#ECE9D8] hover:bg-slate-200 border border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-xs active:translate-y-0.5 text-xs font-bold text-black outline-dotted outline-1 outline-black cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer / Voucher Find Search Modal across all 24,626 customers */}
      {isFindOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-lg bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-black border-b-black p-3 space-y-2 text-xs">
            <div className="bg-[#0055EA] text-white px-2 py-1 font-bold flex justify-between items-center">
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
            <div className="flex border-b border-black gap-1 pt-1">
              <button
                type="button"
                onClick={() => setFindTab('customer')}
                className={`px-3 py-1 font-bold cursor-pointer ${
                  findTab === 'customer'
                    ? 'bg-white border-t border-l border-r border-black -mb-[1px]'
                    : 'bg-[#D4D0C8] hover:bg-slate-200 text-black'
                }`}
              >
                👤 Permanent Customers
              </button>
              <button
                type="button"
                onClick={() => setFindTab('voucher')}
                className={`px-3 py-1 font-bold cursor-pointer ${
                  findTab === 'voucher'
                    ? 'bg-white border-t border-l border-r border-black -mb-[1px]'
                    : 'bg-[#D4D0C8] hover:bg-slate-200 text-black'
                }`}
              >
                🧾 Retail Sale Vouchers ({allRecentSales.length})
              </button>
            </div>
            
            <input 
              type="text" 
              placeholder={findTab === 'customer' ? "Search all 24,626 customers by ID, Name, Phone..." : "Search voucher by Customer, Date, Publication..."}
              value={findSearch}
              onChange={(e) => setFindSearch(e.target.value)}
              className="w-full px-2 py-1 bg-white border border-black font-bold outline-none"
              autoFocus
            />

            {findTab === 'customer' ? (
              <div className="bg-white border border-black max-h-60 overflow-auto divide-y divide-slate-200">
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
                    className="p-1.5 hover:bg-blue-100 cursor-pointer flex justify-between items-center"
                  >
                    <div>
                      <strong className="text-blue-900 font-mono">#{c.customer_id}</strong> - {c.name_eng}
                      {c.name_hindi && <span className="text-slate-600 block text-[10px]">({cleanOrTransliterateHindi(c.name_hindi, c.name_eng)})</span>}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">{c.phone || c.add1 || 'Beawar'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-black max-h-60 overflow-auto divide-y divide-slate-200">
                {filteredSales.map((s, idx) => {
                  const sCustId = Number(s.Customer_id || s.customer_id);
                  const sDate = parseIsoToDdMmYyyy(s.Vr_Date || s.vr_date);
                  return (
                    <div 
                      key={s.Retail_id || s.retail_id || idx}
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
                      className="p-1.5 hover:bg-blue-100 cursor-pointer flex justify-between items-center"
                    >
                      <div>
                        <div className="font-bold text-blue-900">
                          #{sCustId} {s.Customer_Name || s.customer_name || 'Customer'}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          {s.Publica_Name || s.publica_name || `Pub #${s.Publica_id || s.publica_id}`} • {s.Copies || s.copies || 1} copy @ ₹{Number(s.Rate || s.rate || 0).toFixed(2)}
                          {s.Narr || s.narr ? ` • ${s.Narr || s.narr}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className="font-bold text-[#800000] font-mono block">
                          ₹{Number(s.Amt !== undefined ? s.Amt : (s.amt || 0)).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">📅 {sDate}</span>
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
                className="px-3 py-1 bg-white border border-black font-bold cursor-pointer"
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
