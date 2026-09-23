'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  amt: number;
}

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

  // Customer Selection
  const [custIdInput, setCustIdInput] = useState<string>('');
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [isFindOpen, setIsFindOpen] = useState<boolean>(false);
  const [findSearch, setFindSearch] = useState<string>('');
  const [filteredCusts, setFilteredCusts] = useState<Customer[]>([]);

  // Rows in the grid (Publication | Copies | Rate | Rec.Amt)
  const defaultPubId = publications.find(p => p.publica_id === 512)?.publica_id || publications[0]?.publica_id || 1;
  const [rows, setRows] = useState<SaleRow[]>([
    { publica_id: defaultPubId, copies: 1, rate: 60.0, amt: 60.0 }
  ]);

  // Narration
  const [narration, setNarration] = useState<string>('');
  
  // Proces Y/N toggle
  const [isProcessYes, setIsProcessYes] = useState<boolean>(true);

  // Status & Feedback
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Parse DD/MM/YYYY to YYYY-MM-DD
  const getIsoDate = (dStr: string) => {
    const parts = dStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return new Date().toISOString().split('T')[0];
  };

  // Convert Day of Week for rate lookup
  const isoDate = getIsoDate(vrDateStr);
  const dateObj = new Date(isoDate + 'T12:00:00');
  const dayOfWeekVb6 = (isNaN(dateObj.getTime()) ? 0 : dateObj.getDay()) + 1;

  // Rate Helper for a publication
  const getPubDefaultRate = (pubId: number) => {
    const pub = publications.find(p => p.publica_id === pubId);
    if (!pub) return 5.0;
    const isMag = (pub.type_p || '').toLowerCase().includes('mag');
    if (isMag) {
      if (pub.publica_id === 512 || pub.publica_id === 513) return 60.0;
      if (pub.today_rate && pub.today_rate > 0) return pub.today_rate;
      return 60.0;
    }
    const eff = getSingleEffectiveRate(pub.publica_id, dayOfWeekVb6, isoDate, rates, ratechanges);
    return eff > 0 ? eff : (pub.today_rate || 5.0);
  };

  // Handle typing Customer ID
  const handleCustIdLookup = (idVal: string) => {
    const num = parseInt(idVal.trim(), 10);
    if (!isNaN(num)) {
      const found = customers.find(c => c.customer_id === num);
      if (found) {
        setSelectedCust(found);
        setStatusMsg(null);
        return;
      }
      // If not in preloaded list, fetch from API
      fetch(`/api/customers?search=${num}&limit=5`)
        .then(r => r.json())
        .then(data => {
          const match = (data.customers || []).find((c: any) => c.customer_id === num);
          if (match) {
            setSelectedCust(match);
            setStatusMsg(null);
          } else {
            setStatusMsg({ text: `Customer #${num} not found. Click Find to search.`, isError: true });
          }
        })
        .catch(() => {});
    }
  };

  // Filter customers in Find modal
  useEffect(() => {
    if (!findSearch.trim()) {
      setFilteredCusts(customers.slice(0, 50));
      return;
    }
    const q = findSearch.toLowerCase().trim();
    const hits = customers.filter(c => 
      String(c.customer_id).includes(q) ||
      (c.name_eng || '').toLowerCase().includes(q) ||
      (c.name_hindi || '').includes(q) ||
      (c.phone || '').includes(q)
    ).slice(0, 50);
    setFilteredCusts(hits);
  }, [findSearch, customers]);

  // Update a row in grid
  const handleUpdateRow = (index: number, field: keyof SaleRow, value: any) => {
    setRows(prev => {
      const updated = [...prev];
      const cur = { ...updated[index] };
      if (field === 'publica_id') {
        cur.publica_id = Number(value);
        cur.rate = getPubDefaultRate(Number(value));
        cur.amt = cur.rate; // Rec.Amt per copy defaults to publication rate
      } else if (field === 'copies') {
        cur.copies = Math.max(1, Number(value) || 1);
      } else if (field === 'rate') {
        cur.rate = Number(value) || 0;
        // If amt was matching previous rate or unset, sync it
        if (!cur.amt || cur.amt === cur.rate) {
          cur.amt = cur.rate;
        }
      } else if (field === 'amt') {
        cur.amt = Number(value) || 0; // Rec.Amt per copy set by user
      }
      updated[index] = cur;
      return updated;
    });
  };

  const handleAddRow = () => {
    const nextPubId = publications[0]?.publica_id || 1;
    setRows(prev => [...prev, { publica_id: nextPubId, copies: 1, rate: getPubDefaultRate(nextPubId), amt: getPubDefaultRate(nextPubId) }]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length <= 1) {
      setRows([{ publica_id: defaultPubId, copies: 1, rate: 60.0, amt: 60.0 }]);
      return;
    }
    setRows(prev => prev.filter((_, idx) => idx !== index));
  };

  // Keyboard Shortcuts (Alt+S, Alt+U, Alt+D, Alt+F, Alt+C, Alt+E, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFindOpen) setIsFindOpen(false);
        else onClose();
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
      } else if (e.altKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        handleSave();
      } else if (e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsFindOpen(true);
      } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleCancel();
      } else if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFindOpen, selectedCust, rows, narration, vrDateStr]);

  // SAVE ACTION (Saves to both API and local file, immediate update)
  const handleSave = async () => {
    if (!selectedCust) {
      setStatusMsg({ text: 'Please select a permanent customer first (type ID or click Find).', isError: true });
      return;
    }
    if (rows.length === 0 || rows.some(r => r.amt <= 0)) {
      setStatusMsg({ text: 'Please add at least one valid publication row with rate > 0.', isError: true });
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);

    try {
      const payload = {
        customer_id: selectedCust.customer_id,
        vr_date: getIsoDate(vrDateStr),
        items: rows.map(r => ({
          publica_id: r.publica_id,
          copies: r.copies,
          rate: r.rate,
          amt: r.amt,
          narr: narration
        }))
      };

      const res = await fetch('/api/retail-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const total = rows.reduce((s, r) => s + (Number(r.copies || 1) * Number(r.amt || 0)), 0);
        setStatusMsg({ 
          text: `Record Saved! Retail sale of ₹${total.toFixed(2)} recorded for Customer #${selectedCust.customer_id} (${selectedCust.name_eng}). Added to Monthly Bill.`, 
          isError: false 
        });
      } else {
        setStatusMsg({ text: data.error || 'Failed to save retail sale.', isError: true });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Error communicating with server.', isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setCustIdInput('');
    setSelectedCust(null);
    setRows([{ publica_id: defaultPubId, copies: 1, rate: 60.0, amt: 60.0 }]);
    setNarration('');
    setStatusMsg(null);
  };

  const handleDelete = async () => {
    if (!selectedCust) {
      setStatusMsg({ text: 'No customer record selected to delete.', isError: true });
      return;
    }
    handleCancel();
    setStatusMsg({ text: 'Current entry cleared.', isError: false });
  };

  if (!isOpen) return null;

  const totalCopies = rows.reduce((s, r) => s + Number(r.copies || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (Number(r.copies || 1) * Number(r.amt || 0)), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 font-sans select-none">
      
      {/* AUTHENTIC 2008 VB6 FORM WINDOW matching screenshot_09.jpg */}
      <div 
        className="w-full max-w-[620px] bg-[#ECE9D8] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[3px_3px_10px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden text-black"
        style={{ fontFamily: 'MS Sans Serif, Tahoma, sans-serif' }}
      >
        
        {/* Title Bar matching screenshot_09.jpg */}
        <div className="bg-gradient-to-r from-[#0055EA] via-[#3B82F6] to-[#0055EA] text-white px-2 py-1 flex items-center justify-between text-xs font-bold shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🗎</span>
            <span>Retail Sale to Permanent Customer</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={onClose}
              className="w-5 h-4 bg-[#D4D0C8] hover:bg-slate-200 border border-t-white border-l-white border-r-[#404040] border-b-[#404040] text-black text-[10px] font-bold flex items-center justify-center leading-none"
              title="Minimize"
            >
              _
            </button>
            <button 
              className="w-5 h-4 bg-[#D4D0C8] hover:bg-slate-200 border border-t-white border-l-white border-r-[#404040] border-b-[#404040] text-black text-[10px] font-bold flex items-center justify-center leading-none"
              title="Maximize"
            >
              □
            </button>
            <button 
              onClick={onClose}
              className="w-5 h-4 bg-[#E81123] hover:bg-red-700 text-white text-[10px] font-bold flex items-center justify-center leading-none ml-0.5"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="p-4 space-y-3.5">
          
          {/* Header Title: RETAIL SALE TO PERMANENT CUSTOMER (dark maroon centered bold) */}
          <div className="text-center pt-1 pb-1">
            <h1 className="text-[#800000] font-black text-xl tracking-wider uppercase font-serif">
              RETAIL SALE TO PERMANENT CUSTOMER
            </h1>
          </div>

          {/* Row 1: Date & Period :- 2026-2027 */}
          <div className="flex items-center justify-start text-xs font-bold">
            <label className="text-[#800000] w-14 shrink-0 font-bold text-[13px]">Date</label>
            <input 
              type="text" 
              value={vrDateStr}
              onChange={(e) => setVrDateStr(e.target.value)}
              className="w-28 px-2 py-0.5 bg-white border border-black text-black font-bold font-mono text-center text-xs outline-none"
              title="Format: DD/MM/YYYY"
            />
            <span className="ml-8 font-black text-xs text-black">
              Period :- <span className="font-mono">{periodStr}</span>
            </span>
          </div>

          {/* Row 2: Name Input & Customer Details Box */}
          <div className="space-y-1.5">
            <div className="flex items-center text-xs font-bold">
              <label className="text-[#800000] w-14 shrink-0 font-bold text-[13px]">Name</label>
              <input 
                type="text" 
                placeholder="Type Cust ID (e.g. 24669)"
                value={custIdInput}
                onChange={(e) => {
                  setCustIdInput(e.target.value);
                  handleCustIdLookup(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustIdLookup(custIdInput);
                }}
                className="w-48 px-2 py-0.5 bg-white border border-black text-black font-bold text-xs outline-none"
              />
              <button 
                onClick={() => setIsFindOpen(true)}
                className="ml-2 px-2 py-0.5 bg-[#D4D0C8] hover:bg-slate-200 border border-t-white border-l-white border-r-[#404040] border-b-[#404040] text-[11px] font-bold cursor-pointer"
                title="Search Customer (Alt+F)"
              >
                🔍 Search
              </button>
            </div>

            {/* Sunken Customer Info Display Box matching screenshot_09.jpg */}
            <div className="w-full bg-white border border-black p-2 min-h-[50px] text-xs font-sans text-black">
              {selectedCust ? (
                <div className="space-y-0.5">
                  <div className="font-black text-sm text-blue-950 flex items-center justify-between">
                    <span>
                      {selectedCust.name_eng} 
                      {selectedCust.name_hindi && (
                        <span className="text-slate-700 font-normal ml-2">
                          ({cleanOrTransliterateHindi(selectedCust.name_hindi, selectedCust.name_eng)})
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs bg-yellow-100 px-1.5 py-0.5 border border-yellow-400">
                      Cust ID: #{selectedCust.customer_id}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-700 flex justify-between">
                    <span>
                      {selectedCust.add1 || 'Main Market, Beawar'} • Region: #{selectedCust.region_id}
                    </span>
                    <span className="font-bold text-red-900">
                      Cur. Bal: ₹{Number(selectedCust.dueamount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 italic text-[11px] pt-1.5 text-center">
                  --- Type Customer ID above or click "Find" button below to load customer ---
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Grid / Table matching screenshot_09.jpg */}
          <div className="border border-black bg-[#909090] text-black text-xs overflow-hidden">
            
            {/* 3D Beveled Header */}
            <div className="grid grid-cols-12 bg-[#ECE9D8] border-b border-black font-bold text-[11px] divide-x divide-black select-none">
              <div className="col-span-6 p-1 text-left">Publication</div>
              <div className="col-span-2 p-1 text-center">Copies</div>
              <div className="col-span-2 p-1 text-right">Rate</div>
              <div className="col-span-2 p-1 text-right">Rec.Amt</div>
            </div>

            {/* Grid Rows */}
            <div className="divide-y divide-slate-400 bg-white min-h-[90px] max-h-[140px] overflow-auto">
              {rows.map((row, idx) => (
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
                          {p.public_name || (p as any).name} (#{p.publica_id}) {p.type_p ? `[${p.type_p}]` : ''}
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
                      className="w-full text-center font-mono font-bold bg-transparent outline-none"
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
                      title="Rate (MRP/Printed Rate)"
                    />
                  </div>

                  {/* Rec.Amt (Recovery Amount Per Copy) */}
                  <div className="col-span-2 p-1 text-right flex items-center justify-end gap-1">
                    <input 
                      type="number" 
                      step="0.5"
                      value={row.amt}
                      onChange={(e) => handleUpdateRow(idx, 'amt', e.target.value)}
                      className="w-full text-right font-mono font-black text-emerald-950 bg-transparent outline-none focus:bg-yellow-100"
                      title="Rec.Amt (Per Copy Recovery Rate charged to customer)"
                    />
                    {rows.length > 1 && (
                      <button 
                        onClick={() => handleRemoveRow(idx)}
                        className="text-red-700 hover:text-red-900 font-bold text-xs px-1 cursor-pointer"
                        title="Remove Item"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                </div>
              ))}
            </div>

            {/* Grid Footer with Total & Add Row */}
            <div className="grid grid-cols-12 bg-[#ECE9D8] border-t border-black font-bold text-xs p-1 divide-x divide-black select-none">
              <div className="col-span-6 flex items-center justify-between px-1">
                <button 
                  onClick={handleAddRow}
                  className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-[#808080] text-[10px] font-bold cursor-pointer"
                >
                  + Add Line
                </button>
                <span className="text-[11px] uppercase">Voucher Total:</span>
              </div>
              <div className="col-span-2 text-center font-mono text-[11px]">{totalCopies}</div>
              <div className="col-span-2 text-right"></div>
              <div className="col-span-2 text-right font-mono font-black text-emerald-900">
                ₹{totalAmount.toFixed(2)}
              </div>
            </div>

          </div>

          {/* Row 4: Narration */}
          <div className="flex items-start text-xs font-bold">
            <label className="text-[#000080] w-18 shrink-0 font-bold text-[13px] pt-1">Narration</label>
            <textarea 
              rows={2}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="e.g. August Month Issue / Special Edition"
              className="w-full px-2 py-1 bg-white border border-black text-xs font-sans outline-none resize-none"
            />
          </div>

          {/* Status Message */}
          {statusMsg && (
            <div className={`text-xs font-bold p-1 text-center border ${statusMsg.isError ? 'bg-red-50 text-red-900 border-red-300' : 'bg-emerald-50 text-emerald-900 border-emerald-300'}`}>
              {statusMsg.text}
            </div>
          )}

          {/* Row 5: Action Buttons matching screenshot_09.jpg */}
          <div className="flex items-center justify-between pt-2 select-none">
            
            {/* Bottom-Left: Proces Y/N Button */}
            <button 
              onClick={() => setIsProcessYes(!isProcessYes)}
              className="px-3 py-1 bg-[#ECE9D8] hover:bg-slate-200 border border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-xs active:translate-y-0.5 text-xs font-bold text-[#006666] cursor-pointer"
              title="Toggle Monthly Billing Process Inclusion"
            >
              <u>P</u>roces {isProcessYes ? 'Y' : 'N'}
            </button>

            {/* Parallelogram Beveled Cyan Gradient Buttons (Row 1 & Row 2) */}
            <div className="flex flex-col items-end gap-2">
              
              {/* Top Row: Save, Update, Del */}
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    💾 <u>S</u>ave
                  </span>
                </button>

                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    ↩ <u>U</u>pdate
                  </span>
                </button>

                <button 
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
                  onClick={() => setIsFindOpen(true)}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    🔍 <u>F</u>ind
                  </span>
                </button>

                <button 
                  onClick={handleCancel}
                  className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
                >
                  <span className="transform skew-x-12 flex items-center gap-1">
                    ❌ <u>C</u>ancel
                  </span>
                </button>

                <button 
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

      {/* Customer Find Search Modal */}
      {isFindOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-black border-b-black p-3 space-y-2 text-xs">
            <div className="bg-[#0055EA] text-white px-2 py-1 font-bold flex justify-between items-center">
              <span>Find Permanent Customer</span>
              <button onClick={() => setIsFindOpen(false)} className="text-white font-bold">✕</button>
            </div>
            
            <input 
              type="text" 
              placeholder="Search by ID, Name, Phone..."
              value={findSearch}
              onChange={(e) => setFindSearch(e.target.value)}
              className="w-full px-2 py-1 bg-white border border-black font-bold outline-none"
              autoFocus
            />

            <div className="bg-white border border-black max-h-60 overflow-auto divide-y divide-slate-200">
              {filteredCusts.map(c => (
                <div 
                  key={c.customer_id}
                  onClick={() => {
                    setSelectedCust(c);
                    setCustIdInput(String(c.customer_id));
                    setIsFindOpen(false);
                    setStatusMsg(null);
                  }}
                  className="p-1.5 hover:bg-blue-100 cursor-pointer flex justify-between items-center"
                >
                  <div>
                    <strong className="text-blue-900 font-mono">#{c.customer_id}</strong> - {c.name_eng}
                    {c.name_hindi && <span className="text-slate-600 block text-[10px]">({cleanOrTransliterateHindi(c.name_hindi, c.name_eng)})</span>}
                  </div>
                  <span className="text-[10px] text-slate-500">{c.add1 || 'Beawar'}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button 
                onClick={() => setIsFindOpen(false)}
                className="px-3 py-1 bg-white border border-black font-bold"
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
