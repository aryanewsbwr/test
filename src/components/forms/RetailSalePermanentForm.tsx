'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  UserCheck, 
  Plus, 
  Save, 
  Trash2, 
  X, 
  Printer, 
  Calendar, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Clock,
  ArrowRight,
  Receipt
} from 'lucide-react';
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

interface SaleLineItem {
  id: string;
  publica_id: number;
  pub_name: string;
  pub_hindi?: string;
  copies: number;
  rate: number;
  amt: number;
  narr: string;
}

export default function RetailSalePermanentForm({ 
  isOpen, 
  onClose, 
  publications,
  rates = [],
  ratechanges = [],
  customers = []
}: Props) {
  const [activeTab, setActiveTab] = useState<'new_sale' | 'register'>('new_sale');
  const [vrDate, setVrDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Permanent Customer Selection
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isFindCustOpen, setIsFindCustOpen] = useState(false);
  const [custSearchQuery, setCustSearchQuery] = useState('');
  
  // Line item input state
  const [selectedPubId, setSelectedPubId] = useState<number>(publications[0]?.publica_id || 1);
  const [pubSearch, setPubSearch] = useState('');
  const [inputCopies, setInputCopies] = useState<number>(1);
  const [inputRate, setInputRate] = useState<number>(5.0);
  const [inputNarr, setInputNarr] = useState<string>('');
  
  // Items in this sale voucher
  const [items, setItems] = useState<SaleLineItem[]>([]);
  
  // History Register State
  const [historyDate, setHistoryDate] = useState<string>('');
  const [historyCustId, setHistoryCustId] = useState<string>('');
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [historySummary, setHistorySummary] = useState({ total_items: 0, total_copies: 0, total_amount: 0 });
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // UI states
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{
    voucherNo?: number | string;
    date: string;
    customer: Customer;
    items: SaleLineItem[];
    total: number;
  } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Day of week calculation
  const dateObj = new Date(vrDate + 'T12:00:00');
  const dayIndex = isNaN(dateObj.getTime()) ? 0 : dateObj.getDay();
  const dayOfWeekVb6 = dayIndex + 1; // 1 = Sun .. 7 = Sat

  // Auto-calculate rate when selected publication or date changes
  useEffect(() => {
    if (!selectedPubId) return;
    const pub = publications.find(p => p.publica_id === Number(selectedPubId));
    if (!pub) return;

    const effective = getSingleEffectiveRate(
      pub.publica_id,
      dayOfWeekVb6,
      vrDate,
      rates,
      ratechanges
    );

    setInputRate(effective > 0 ? effective : (pub.today_rate || 5.0));
  }, [selectedPubId, vrDate, rates, ratechanges, dayOfWeekVb6, publications]);

  // Load customer when customer ID is entered
  const handleCustomerIdChange = (val: string) => {
    if (!val) {
      setSelectedCustomerId('');
      setSelectedCustomer(null);
      return;
    }
    const idNum = parseInt(val, 10);
    setSelectedCustomerId(isNaN(idNum) ? '' : idNum);
    
    const found = customers.find(c => c.customer_id === idNum);
    if (found) {
      setSelectedCustomer(found);
    } else {
      setSelectedCustomer(null);
    }
  };

  const handleSelectCustomerFromModal = (cust: Customer) => {
    setSelectedCustomerId(cust.customer_id);
    setSelectedCustomer(cust);
    setIsFindCustOpen(false);
    setStatus(null);
  };

  // Add line item to grid
  const handleAddItem = () => {
    if (!selectedPubId) {
      setStatus({ type: 'error', message: 'Please select a publication.' });
      return;
    }
    if (inputCopies <= 0) {
      setStatus({ type: 'error', message: 'Quantity must be at least 1.' });
      return;
    }

    const pub = publications.find(p => p.publica_id === Number(selectedPubId));
    const copies = Number(inputCopies) || 1;
    const rate = Number(inputRate) || 0;
    const amt = parseFloat((copies * rate).toFixed(2));

    const newItem: SaleLineItem = {
      id: `${Date.now()}_${Math.random()}`,
      publica_id: Number(selectedPubId),
      pub_name: pub ? pub.public_name : `Publication #${selectedPubId}`,
      pub_hindi: pub?.pub_hindi || pub?.public_name,
      copies,
      rate,
      amt,
      narr: inputNarr.trim()
    };

    setItems(prev => [...prev, newItem]);
    setInputCopies(1);
    setInputNarr('');
    setStatus(null);
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const totalCopies = items.reduce((sum, item) => sum + item.copies, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.amt, 0);

  // Save Retail Sale to Permanent Customer
  const handleSave = async () => {
    if (!selectedCustomerId) {
      setStatus({ type: 'error', message: 'Please select a valid permanent customer.' });
      return;
    }
    if (items.length === 0) {
      setStatus({ type: 'error', message: 'Please add at least one publication item.' });
      return;
    }

    setIsSaving(true);
    setStatus(null);

    try {
      const payload = {
        customer_id: selectedCustomerId,
        vr_date: vrDate,
        items: items.map(it => ({
          publica_id: it.publica_id,
          copies: it.copies,
          rate: it.rate,
          amt: it.amt,
          narr: it.narr
        }))
      };

      const res = await fetch('/api/retail-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        setStatus({
          type: 'success',
          message: `Saved retail sale successfully for Customer #${selectedCustomerId}! Voucher items: ${items.length}`
        });

        if (selectedCustomer) {
          setLastReceipt({
            voucherNo: data.sales?.[0]?.Retail_id || 'RTL-' + Date.now(),
            date: vrDate,
            customer: selectedCustomer,
            items: [...items],
            total: totalAmount
          });
          setShowPrintModal(true);
        }

        // Reset form items
        setItems([]);
      } else {
        setStatus({ type: 'error', message: data.error || 'Failed to save retail sale.' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Network error saving retail sale.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Load History
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      let url = '/api/retail-sale?limit=300';
      if (historyDate) url += `&date=${encodeURIComponent(historyDate)}`;
      if (historyCustId) url += `&customer_id=${encodeURIComponent(historyCustId)}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setHistoryList(data.sales || []);
        setHistorySummary({
          total_items: data.total_count || 0,
          total_copies: data.total_copies || 0,
          total_amount: data.total_amount || 0
        });
      }
    } catch (err) {
      console.error('Failed to load retail sales:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'register') {
      loadHistory();
    }
  }, [isOpen, activeTab, historyDate, historyCustId]);

  if (!isOpen) return null;

  // Filter publications by search
  const filteredPubs = publications.filter(p => {
    if (!pubSearch.trim()) return true;
    const query = pubSearch.toLowerCase();
    return (
      p.public_name.toLowerCase().includes(query) ||
      (p.pub_hindi && p.pub_hindi.includes(query)) ||
      String(p.publica_id).includes(query)
    );
  });

  // Filter customers for find modal
  const filteredCustomers = customers.filter(c => {
    if (!custSearchQuery.trim()) return true;
    const q = custSearchQuery.toLowerCase();
    return (
      String(c.customer_id).includes(q) ||
      c.name_eng.toLowerCase().includes(q) ||
      (c.name_hindi && c.name_hindi.includes(q)) ||
      (c.add1 && c.add1.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 backdrop-blur-[1px] animate-in fade-in duration-150">
      <div className="bg-[#ECE9D8] w-full max-w-4xl vb-box-outset shadow-2xl flex flex-col max-h-[92vh] text-xs select-none">
        
        {/* 1. Classic VB6 Window Title Bar */}
        <div className="bg-[#000080] text-white px-3 py-1.5 flex items-center justify-between font-bold tracking-wide">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-yellow-300" />
            <span>Retail Sale To Permanent Customer (स्थायी ग्राहक खुदरा बिक्री - 2025-2026)</span>
          </div>
          <button 
            onClick={onClose}
            className="w-5 h-5 bg-[#ECE9D8] text-black hover:bg-red-600 hover:text-white flex items-center justify-center font-bold text-xs vb-box-outset border"
          >
            ×
          </button>
        </div>

        {/* 2. Window Sub-Tabs */}
        <div className="bg-[#E0DFD8] border-b border-[#808080] px-3 pt-2 flex items-center gap-1">
          <button
            onClick={() => setActiveTab('new_sale')}
            className={`px-4 py-1.5 font-bold flex items-center gap-1.5 rounded-t cursor-pointer border-t border-l border-r ${
              activeTab === 'new_sale' 
                ? 'bg-[#ECE9D8] border-[#808080] text-blue-900 border-b-transparent -mb-[1px]' 
                : 'bg-[#D4D0C8] border-[#A0A0A0] text-slate-600 hover:bg-[#ECE9D8]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>1. New Retail Sale Entry (नवीन खुदरा बिक्री)</span>
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`px-4 py-1.5 font-bold flex items-center gap-1.5 rounded-t cursor-pointer border-t border-l border-r ${
              activeTab === 'register' 
                ? 'bg-[#ECE9D8] border-[#808080] text-blue-900 border-b-transparent -mb-[1px]' 
                : 'bg-[#D4D0C8] border-[#A0A0A0] text-slate-600 hover:bg-[#ECE9D8]'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>2. Retail Sales Register (खुदरा बिक्री लेजर व रजिस्टर)</span>
          </button>
        </div>

        {/* 3. Main Body */}
        <div className="p-3 overflow-y-auto flex-1 flex flex-col gap-3">

          {/* Status Alert Banner */}
          {status && (
            <div className={`p-2 rounded flex items-center gap-2 border text-xs ${
              status.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                : 'bg-red-50 text-red-800 border-red-300'
            }`}>
              {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
              <span className="font-semibold">{status.message}</span>
            </div>
          )}

          {activeTab === 'new_sale' ? (
            <>
              {/* Customer Selection Card */}
              <div className="bg-white p-3 vb-box-inset flex flex-col gap-2">
                <div className="flex items-center justify-between border-b pb-1">
                  <span className="font-bold text-blue-900 uppercase tracking-wide flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" /> Permanent Customer Details (स्थायी ग्राहक विवरण)
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 font-bold">Voucher Date:</span>
                    <input 
                      type="date"
                      value={vrDate}
                      onChange={(e) => setVrDate(e.target.value)}
                      className="border border-[#808080] px-2 py-0.5 bg-[#FFFDF0] font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-3 items-center pt-1">
                  <div className="col-span-3 flex items-center gap-2">
                    <label className="font-bold text-slate-700 whitespace-nowrap">Customer ID:</label>
                    <input 
                      type="number"
                      placeholder="e.g. 108"
                      value={selectedCustomerId}
                      onChange={(e) => handleCustomerIdChange(e.target.value)}
                      className="border border-[#808080] px-2 py-1 font-bold text-blue-900 bg-[#FFFFE0] w-24 text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button 
                      onClick={() => setIsFindCustOpen(true)}
                      className="px-2 py-1 bg-[#ECE9D8] vb-box-outset hover:bg-[#D4D0C8] font-bold text-slate-800 flex items-center gap-1 cursor-pointer"
                      title="Search customer by name or address"
                    >
                      <Search className="w-3.5 h-3.5 text-blue-800" />
                      <span>Find</span>
                    </button>
                  </div>

                  <div className="col-span-6 bg-[#F8F9FA] p-2 border border-slate-200 rounded">
                    {selectedCustomer ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{selectedCustomer.name_eng}</span>
                          <span className="text-blue-800 font-bold">({cleanOrTransliterateHindi(selectedCustomer.name_hindi, selectedCustomer.name_eng)})</span>
                        </div>
                        <div className="text-slate-600 text-[11px] flex gap-3">
                          <span>Addr: {selectedCustomer.add1 || 'N/A'}</span>
                          <span>Region: {selectedCustomer.region_id || '-'}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">No permanent customer selected. Type Customer ID or click &quot;Find&quot;.</span>
                    )}
                  </div>

                  <div className="col-span-3 bg-blue-50 border border-blue-200 p-2 text-right rounded">
                    <div className="text-[10px] uppercase font-bold text-blue-700">Current Balance (Cur. Bal)</div>
                    <div className={`font-mono text-base font-bold ${
                      (selectedCustomer?.cbal || 0) > 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}>
                      ₹{(selectedCustomer?.cbal || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Line Item Input Section */}
              <div className="bg-[#FFFFF0] p-2.5 vb-box-inset flex flex-col gap-2">
                <div className="font-bold text-slate-800 border-b pb-1 flex items-center justify-between">
                  <span>Add Retail Publication Item (पत्रिका / समाचार पत्र जोड़ें)</span>
                  <span className="text-[11px] text-slate-500 font-normal">Shortcut: Press Add button or Enter</span>
                </div>

                <div className="grid grid-cols-12 gap-2 items-center">
                  {/* Publication Picker */}
                  <div className="col-span-5 flex flex-col gap-0.5">
                    <label className="font-bold text-slate-700">Select Publication:</label>
                    <select
                      value={selectedPubId}
                      onChange={(e) => setSelectedPubId(Number(e.target.value))}
                      className="border border-[#808080] p-1 font-semibold text-slate-900 bg-white"
                    >
                      {filteredPubs.map(p => (
                        <option key={p.publica_id} value={p.publica_id}>
                          #{p.publica_id} - {p.public_name} {p.pub_hindi ? `(${cleanOrTransliterateHindi(p.pub_hindi, p.public_name)})` : ''} [₹{p.today_rate || 5}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Copies */}
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <label className="font-bold text-slate-700">Copies (Qty):</label>
                    <input 
                      type="number"
                      min={1}
                      value={inputCopies}
                      onChange={(e) => setInputCopies(Math.max(1, parseInt(e.target.value) || 1))}
                      className="border border-[#808080] p-1 font-bold text-center text-slate-900 bg-white"
                    />
                  </div>

                  {/* Rate */}
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <label className="font-bold text-slate-700">Rate (दर ₹):</label>
                    <input 
                      type="number"
                      step="0.25"
                      value={inputRate}
                      onChange={(e) => setInputRate(parseFloat(e.target.value) || 0)}
                      className="border border-[#808080] p-1 font-bold text-center text-slate-900 bg-white"
                    />
                  </div>

                  {/* Line Total */}
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <label className="font-bold text-slate-700">Total (योग ₹):</label>
                    <div className="border border-[#808080] p-1 font-bold text-center text-blue-900 bg-[#E8EEF5]">
                      ₹{((Number(inputCopies) || 1) * (Number(inputRate) || 0)).toFixed(2)}
                    </div>
                  </div>

                  {/* Add Button */}
                  <div className="col-span-1 flex items-end">
                    <button
                      onClick={handleAddItem}
                      className="w-full py-1 bg-[#0A246A] text-white font-bold rounded hover:bg-blue-800 flex items-center justify-center gap-1 cursor-pointer shadow"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {/* Narrative / Remarks */}
                <div className="flex items-center gap-2 pt-1">
                  <label className="font-bold text-slate-700 whitespace-nowrap">Remarks / Narrative (विवरण):</label>
                  <input 
                    type="text"
                    placeholder="e.g. Extra special Sunday issue, supplement copies, etc."
                    value={inputNarr}
                    onChange={(e) => setInputNarr(e.target.value)}
                    className="flex-1 border border-[#808080] px-2 py-0.5 bg-white text-slate-800"
                  />
                </div>
              </div>

              {/* Items Grid Table */}
              <div className="bg-white vb-box-inset flex-1 min-h-[160px] overflow-y-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-[#0A246A] text-white sticky top-0 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="p-1.5 border-r border-blue-800 w-12 text-center">S.No</th>
                      <th className="p-1.5 border-r border-blue-800">Publication Name (प्रकाशन)</th>
                      <th className="p-1.5 border-r border-blue-800 w-24 text-center">Copies</th>
                      <th className="p-1.5 border-r border-blue-800 w-28 text-right">Rate (₹)</th>
                      <th className="p-1.5 border-r border-blue-800 w-32 text-right">Amount (₹)</th>
                      <th className="p-1.5 border-r border-blue-800">Remarks / Narrative</th>
                      <th className="p-1.5 w-16 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                          No items added yet. Choose a publication above and click &quot;Add&quot;.
                        </td>
                      </tr>
                    ) : (
                      items.map((it, idx) => (
                        <tr key={it.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F9F9F9]'}>
                          <td className="p-1.5 border-r text-center font-bold text-slate-600">{idx + 1}</td>
                          <td className="p-1.5 border-r font-semibold text-slate-900">
                            {it.pub_name} {it.pub_hindi ? <span className="text-blue-800 font-normal">({cleanOrTransliterateHindi(it.pub_hindi, it.pub_name)})</span> : null}
                          </td>
                          <td className="p-1.5 border-r text-center font-bold text-slate-800">{it.copies}</td>
                          <td className="p-1.5 border-r text-right font-mono font-bold text-slate-800">₹{it.rate.toFixed(2)}</td>
                          <td className="p-1.5 border-r text-right font-mono font-bold text-blue-900">₹{it.amt.toFixed(2)}</td>
                          <td className="p-1.5 border-r text-slate-600 text-[11px]">{it.narr || '-'}</td>
                          <td className="p-1.5 text-center">
                            <button
                              onClick={() => handleRemoveItem(it.id)}
                              className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5 mx-auto" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary & Actions Bar */}
              <div className="bg-[#D4D0C8] p-2 vb-box-outset flex items-center justify-between">
                <div className="flex items-center gap-6 font-bold text-slate-800 text-sm">
                  <span>Total Items: <span className="text-blue-900">{items.length}</span></span>
                  <span>Total Copies: <span className="text-blue-900">{totalCopies}</span></span>
                  <span>Grand Total: <span className="text-emerald-800 font-mono text-base font-extrabold">₹{totalAmount.toFixed(2)}</span></span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setItems([])}
                    className="px-3 py-1.5 bg-[#ECE9D8] vb-box-outset hover:bg-[#E0DFD8] text-slate-700 font-bold cursor-pointer"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || items.length === 0 || !selectedCustomerId}
                    className={`px-5 py-1.5 font-bold flex items-center gap-1.5 rounded cursor-pointer shadow ${
                      isSaving || items.length === 0 || !selectedCustomerId
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-[#000080] text-white hover:bg-blue-900'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Saving...' : 'Save Retail Sale (F5)'}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Tab 2: Retail Sales Register */
            <div className="flex flex-col gap-3 flex-1">
              <div className="bg-white p-2.5 vb-box-inset flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="font-bold text-slate-700">Filter Date:</label>
                    <input 
                      type="date"
                      value={historyDate}
                      onChange={(e) => setHistoryDate(e.target.value)}
                      className="border border-[#808080] px-2 py-1 bg-[#FFFDF0] font-bold"
                    />
                    {historyDate && (
                      <button 
                        onClick={() => setHistoryDate('')} 
                        className="text-xs text-blue-700 underline cursor-pointer"
                      >
                        Clear Date
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="font-bold text-slate-700">Customer ID:</label>
                    <input 
                      type="number"
                      placeholder="All Customers"
                      value={historyCustId}
                      onChange={(e) => setHistoryCustId(e.target.value)}
                      className="border border-[#808080] px-2 py-1 w-28 text-center font-bold"
                    />
                    {historyCustId && (
                      <button 
                        onClick={() => setHistoryCustId('')} 
                        className="text-xs text-blue-700 underline cursor-pointer"
                      >
                        Clear Cust
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={loadHistory}
                    className="px-3 py-1 bg-[#ECE9D8] vb-box-outset hover:bg-[#D4D0C8] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* History Table */}
              <div className="bg-white vb-box-inset flex-1 overflow-y-auto max-h-[420px]">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-[#000080] text-white sticky top-0 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="p-1.5 border-r border-blue-900 w-16 text-center">Retail ID</th>
                      <th className="p-1.5 border-r border-blue-900 w-24 text-center">Date</th>
                      <th className="p-1.5 border-r border-blue-900 w-24 text-center">Cust ID</th>
                      <th className="p-1.5 border-r border-blue-900">Customer Name</th>
                      <th className="p-1.5 border-r border-blue-900">Publication</th>
                      <th className="p-1.5 border-r border-blue-900 w-20 text-center">Copies</th>
                      <th className="p-1.5 border-r border-blue-900 w-24 text-right">Rate</th>
                      <th className="p-1.5 border-r border-blue-900 w-24 text-right">Amount</th>
                      <th className="p-1.5 border-r border-blue-900">Remarks</th>
                      <th className="p-1.5 w-16 text-center">Print</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingHistory ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-500 font-bold">
                          Loading Retail Sales register from Supabase...
                        </td>
                      </tr>
                    ) : historyList.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-400 italic">
                          No retail sales records found for this filter criteria.
                        </td>
                      </tr>
                    ) : (
                      historyList.map((row, idx) => (
                        <tr key={row.Retail_id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F9F9F9]'}>
                          <td className="p-1.5 border-r text-center font-bold text-blue-900">#{row.Retail_id}</td>
                          <td className="p-1.5 border-r text-center font-mono">{row.Vr_Date}</td>
                          <td className="p-1.5 border-r text-center font-bold">{row.Customer_id}</td>
                          <td className="p-1.5 border-r font-semibold text-slate-900">
                            {row.customer_name_eng}
                          </td>
                          <td className="p-1.5 border-r font-medium text-slate-800">
                            {row.pub_name} {row.pub_hindi ? <span className="text-blue-800 text-[11px]">({cleanOrTransliterateHindi(row.pub_hindi, row.pub_name)})</span> : null}
                          </td>
                          <td className="p-1.5 border-r text-center font-bold">{row.Copies}</td>
                          <td className="p-1.5 border-r text-right font-mono">₹{Number(row.Rate || 0).toFixed(2)}</td>
                          <td className="p-1.5 border-r text-right font-mono font-bold text-emerald-800">₹{Number(row.Amt || 0).toFixed(2)}</td>
                          <td className="p-1.5 border-r text-slate-500 text-[11px]">{row.Narr || '-'}</td>
                          <td className="p-1.5 text-center">
                            <button
                              onClick={() => {
                                setLastReceipt({
                                  voucherNo: row.Retail_id,
                                  date: row.Vr_Date,
                                  customer: {
                                    customer_id: row.Customer_id,
                                    name_eng: row.customer_name_eng,
                                    name_hindi: row.customer_name_hindi,
                                    add1: row.customer_address,
                                    region_id: row.region_id
                                  } as any,
                                  items: [{
                                    id: String(row.Retail_id),
                                    publica_id: row.Publica_id,
                                    pub_name: row.pub_name,
                                    pub_hindi: row.pub_hindi,
                                    copies: row.Copies,
                                    rate: row.Rate,
                                    amt: row.Amt,
                                    narr: row.Narr
                                  }],
                                  total: row.Amt
                                });
                                setShowPrintModal(true);
                              }}
                              className="p-1 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded"
                              title="Print Slip"
                            >
                              <Printer className="w-3.5 h-3.5 mx-auto" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* History Summary Footer */}
              <div className="bg-[#D4D0C8] p-2 vb-box-outset flex items-center justify-between font-bold text-slate-800">
                <div className="flex items-center gap-6">
                  <span>Total Records: <span className="text-blue-900">{historySummary.total_items}</span></span>
                  <span>Total Copies: <span className="text-blue-900">{historySummary.total_copies}</span></span>
                  <span>Total Value: <span className="text-emerald-900 font-mono text-base font-extrabold">₹{historySummary.total_amount.toFixed(2)}</span></span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Bar */}
        <div className="bg-[#D4D0C8] border-t border-[#808080] px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span>Aryan News Agency • 1:1 VB6 Retail Sale Module</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-[#ECE9D8] vb-box-outset hover:bg-[#D4D0C8] font-bold text-slate-800 cursor-pointer"
          >
            Close (Esc)
          </button>
        </div>

      </div>

      {/* Find Customer Modal */}
      {isFindCustOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[#ECE9D8] w-full max-w-2xl vb-box-outset shadow-2xl flex flex-col max-h-[80vh] text-xs">
            <div className="bg-[#000080] text-white px-3 py-1.5 flex items-center justify-between font-bold">
              <span>Find Permanent Customer (ग्राहक खोजें)</span>
              <button 
                onClick={() => setIsFindCustOpen(false)}
                className="w-5 h-5 bg-[#ECE9D8] text-black hover:bg-red-600 hover:text-white flex items-center justify-center font-bold text-xs"
              >
                ×
              </button>
            </div>
            <div className="p-3 flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-2">
                <label className="font-bold text-slate-700">Search Customer:</label>
                <input 
                  type="text"
                  placeholder="Type ID, Name in English, Hindi, or Address..."
                  value={custSearchQuery}
                  onChange={(e) => setCustSearchQuery(e.target.value)}
                  className="flex-1 border border-[#808080] px-2 py-1 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  autoFocus
                />
              </div>

              <div className="bg-white vb-box-inset flex-1 overflow-y-auto max-h-[350px]">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-[#ECE9D8] border-b border-[#808080] font-bold sticky top-0 text-[11px]">
                    <tr>
                      <th className="p-1.5 border-r w-16 text-center">Cust ID</th>
                      <th className="p-1.5 border-r">Name (Eng)</th>
                      <th className="p-1.5 border-r">Name (Hindi)</th>
                      <th className="p-1.5 border-r">Address</th>
                      <th className="p-1.5 border-r w-16 text-center">Region</th>
                      <th className="p-1.5 w-16 text-center">Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.slice(0, 100).map(c => (
                      <tr 
                        key={c.customer_id} 
                        className="hover:bg-blue-100 cursor-pointer border-b border-slate-100"
                        onDoubleClick={() => handleSelectCustomerFromModal(c)}
                      >
                        <td className="p-1.5 border-r text-center font-bold text-blue-900">#{c.customer_id}</td>
                        <td className="p-1.5 border-r font-semibold text-slate-900">{c.name_eng}</td>
                        <td className="p-1.5 border-r text-blue-800">{cleanOrTransliterateHindi(c.name_hindi, c.name_eng)}</td>
                        <td className="p-1.5 border-r text-slate-600 text-[11px]">{c.add1 || '-'}</td>
                        <td className="p-1.5 border-r text-center">{c.region_id}</td>
                        <td className="p-1.5 text-center">
                          <button
                            onClick={() => handleSelectCustomerFromModal(c)}
                            className="px-2 py-0.5 bg-[#000080] text-white rounded font-bold hover:bg-blue-800"
                          >
                            Pick
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slip / Print Modal */}
      {showPrintModal && lastReceipt && (
        <div className="fixed inset-0 z-70 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full p-6 rounded shadow-2xl border flex flex-col gap-4 font-mono text-xs">
            <div className="text-center border-b pb-3 flex flex-col items-center">
              <div className="text-base font-extrabold tracking-wider text-slate-900">ARYAN NEWS AGENCY</div>
              <div className="text-[11px] text-slate-600">Old Bus Stand, Bikaner (Raj.) • Ph: 0151-2200000</div>
              <div className="text-sm font-bold mt-2 bg-slate-100 px-3 py-0.5 rounded border border-slate-300">
                RETAIL SALE MEMO (स्थायी ग्राहक खुदरा पर्ची)
              </div>
            </div>

            <div className="flex justify-between border-b pb-2 text-[11px]">
              <div>
                <div><strong>Voucher No:</strong> #{lastReceipt.voucherNo}</div>
                <div><strong>Date:</strong> {lastReceipt.date}</div>
              </div>
              <div className="text-right">
                <div><strong>Customer ID:</strong> #{lastReceipt.customer.customer_id}</div>
                <div><strong>Name:</strong> {lastReceipt.customer.name_eng}</div>
                <div><strong>Region:</strong> #{lastReceipt.customer.region_id || '-'}</div>
              </div>
            </div>

            <div className="border-b pb-2">
              <table className="w-full text-left">
                <thead className="border-b font-bold text-slate-700">
                  <tr>
                    <th className="py-1">Item</th>
                    <th className="py-1 text-center">Qty</th>
                    <th className="py-1 text-right">Rate</th>
                    <th className="py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lastReceipt.items.map((it, i) => (
                    <tr key={i} className="border-b border-dashed border-slate-200">
                      <td className="py-1">{it.pub_name}</td>
                      <td className="py-1 text-center">{it.copies}</td>
                      <td className="py-1 text-right">₹{it.rate.toFixed(2)}</td>
                      <td className="py-1 text-right font-bold">₹{it.amt.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center font-bold text-sm">
              <span>Total Payable:</span>
              <span className="text-base">₹{lastReceipt.total.toFixed(2)}</span>
            </div>

            <div className="text-[10px] text-center text-slate-500 pt-2 border-t">
              Thank You for your business! Retail sale recorded in account.
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-1.5 bg-[#000080] text-white font-bold rounded flex items-center gap-1.5 hover:bg-blue-900 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Memo</span>
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-1.5 bg-slate-200 text-slate-800 font-bold rounded hover:bg-slate-300 cursor-pointer"
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
