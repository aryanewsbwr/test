'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingCart, 
  Plus, 
  Save, 
  Trash2, 
  X, 
  Printer, 
  Calendar, 
  DollarSign, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Clock,
  ArrowRight
} from 'lucide-react';
import { Publication, Rate, RateChange, CounterSale } from '@/lib/types';
import { getSingleEffectiveRate } from '@/lib/rateEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  publications: Publication[];
  rates?: Rate[];
  ratechanges?: RateChange[];
}

interface SaleItem {
  id: number;
  publica_id: number;
  pub_name: string;
  pub_hindi?: string;
  qty: number;
  rate: number;
  total: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_HINDI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];

export default function CounterSaleForm({ 
  isOpen, 
  onClose, 
  publications,
  rates = [],
  ratechanges = []
}: Props) {
  const [activeTab, setActiveTab] = useState<'new_sale' | 'register'>('new_sale');
  const [saleDate, setSaleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState('Walk-in Counter Customer (काउंटर ग्राहक)');
  const [remarks, setRemarks] = useState('');
  
  // Selected publication and item form state
  const [selectedPubId, setSelectedPubId] = useState<number>(publications[0]?.publica_id || 1);
  const [pubSearch, setPubSearch] = useState('');
  const [inputQty, setInputQty] = useState<number>(1);
  const [inputRate, setInputRate] = useState<number>(5.0);
  
  // Current sale items in cart
  const [items, setItems] = useState<SaleItem[]>([]);
  
  // Register / History state
  const [historyDate, setHistoryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [historyList, setHistoryList] = useState<CounterSale[]>([]);
  const [historySummary, setHistorySummary] = useState({ total_items: 0, total_qty: 0, total_amount: 0 });
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // UI states
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{
    receiptNo: string;
    date: string;
    customer: string;
    items: SaleItem[];
    total: number;
  } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Focus ref for publication select or qty
  const qtyInputRef = useRef<HTMLInputElement>(null);

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

  // Calculate day of week
  const dateObj = new Date(saleDate + 'T12:00:00');
  const dayIndex = isNaN(dateObj.getTime()) ? 0 : dateObj.getDay(); // 0 = Sun
  const dayOfWeekVb6 = dayIndex + 1; // 1 = Sun .. 7 = Sat

  // Auto-calculate rate when selectedPubId or saleDate changes
  useEffect(() => {
    if (!selectedPubId) return;
    const pub = publications.find(p => p.publica_id === Number(selectedPubId));
    if (!pub) return;

    // Use getSingleEffectiveRate from rateEngine
    const effective = getSingleEffectiveRate(
      pub.publica_id,
      dayOfWeekVb6,
      saleDate,
      rates,
      ratechanges,
      pub.magzine_day
    );

    setInputRate(effective > 0 ? effective : (pub.today_rate || 5.0));
  }, [selectedPubId, saleDate, rates, ratechanges, dayOfWeekVb6, publications]);

  // Load history register when switching to register tab or when date changes
  const loadHistory = async (dateFilter: string = historyDate) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/counter-sale?date=${encodeURIComponent(dateFilter)}`);
      const data = await res.json();
      if (data.success) {
        setHistoryList(data.sales || []);
        setHistorySummary({
          total_items: data.total_items || 0,
          total_qty: data.total_qty || 0,
          total_amount: data.total_amount || 0
        });
      }
    } catch (err) {
      console.error('Failed to load counter sales history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'register') {
      loadHistory(historyDate);
    }
  }, [isOpen, activeTab, historyDate]);

  const handleCancel = () => {
    setItems([]);
    setInputQty(1);
    setRemarks('');
    setStatus(null);
    setPubSearch('');
  };

  // Keyboard shortcut listener (Alt+S = Save, Alt+P = Print, Alt+C = Cancel, Esc = Close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (items.length > 0 && !isSaving) {
          handleCompleteSale();
        }
      } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleCancel();
      } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (lastReceipt) {
          setShowPrintModal(true);
        } else if (items.length > 0) {
          // Preview current items
          setLastReceipt({
            receiptNo: `CS-${Date.now().toString().slice(-6)}`,
            date: saleDate,
            customer: customerName,
            items: [...items],
            total: grandTotal
          });
          setShowPrintModal(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, items, isSaving, lastReceipt, saleDate, customerName]);

  if (!isOpen) return null;

  // Add Item to Bill
  const handleAddItem = () => {
    const pub = publications.find(p => p.publica_id === Number(selectedPubId));
    if (!pub) return;

    if (inputQty <= 0) {
      setStatus({ type: 'error', message: 'Quantity must be at least 1 (संख्या कम से कम 1 होनी चाहिए).' });
      return;
    }

    const rate = Number(inputRate) || 0;
    const qty = Number(inputQty) || 1;
    const total = Number((qty * rate).toFixed(2));

    // Check if already in items
    const existingIndex = items.findIndex(it => it.publica_id === pub.publica_id);
    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].qty += qty;
      updated[existingIndex].rate = rate;
      updated[existingIndex].total = Number((updated[existingIndex].qty * rate).toFixed(2));
      setItems(updated);
    } else {
      const newItem: SaleItem = {
        id: Date.now() + Math.random(),
        publica_id: pub.publica_id,
        pub_name: pub.public_name,
        pub_hindi: pub.pub_hindi,
        qty,
        rate,
        total
      };
      setItems([...items, newItem]);
    }

    // Reset qty back to 1
    setInputQty(1);
    setStatus(null);

    // Focus back on qty
    qtyInputRef.current?.focus();
  };

  const handleRemoveItem = (id: number) => {
    setItems(items.filter(it => it.id !== id));
  };

  const grandTotal = items.reduce((sum, it) => sum + it.total, 0);
  const grandQty = items.reduce((sum, it) => sum + it.qty, 0);

  // Complete Sale & Persist to Supabase and JSON
  const handleCompleteSale = async () => {
    if (items.length === 0) {
      setStatus({ type: 'error', message: 'Please add at least one publication to complete sale.' });
      return;
    }

    setIsSaving(true);
    setStatus(null);

    try {
      const receiptNumber = `CS-${Date.now().toString().slice(-6)}`;
      const res = await fetch('/api/counter-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_date: saleDate,
          customer_name: customerName,
          remarks: remarks || `Counter Cash Sale (${receiptNumber})`,
          items: items.map(it => ({
            publica_id: it.publica_id,
            pub_name: it.pub_name,
            qty: it.qty,
            rate: it.rate,
            total: it.total
          }))
        })
      });

      const data = await res.json();
      if (data.success) {
        // Record receipt for printing
        setLastReceipt({
          receiptNo: receiptNumber,
          date: saleDate,
          customer: customerName,
          items: [...items],
          total: grandTotal
        });

        setStatus({
          type: 'success',
          message: `Sale of ₹${grandTotal.toFixed(2)} (${grandQty} copies) saved successfully to database! Slip No: ${receiptNumber}`
        });

        // Clear current cart items
        setItems([]);
        setRemarks('');

        // Refresh history if already on register or for background sync
        loadHistory(saleDate);
      } else {
        setStatus({
          type: 'error',
          message: data.error || 'Failed to record counter sale.'
        });
      }
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: `Error connecting to server: ${err.message}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete an entry from history
  const handleDeleteHistory = async (sale: CounterSale) => {
    if (!confirm(`Are you sure you want to cancel / delete sale for ${sale.pub_name || `Pub #${sale.publica_id}`} (₹${sale.amt})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/counter-sale?id=${encodeURIComponent(String(sale.id))}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      loadHistory(historyDate);
    } catch (err: any) {
      setStatus({ type: 'error', message: `Sale not deleted: ${err.message}` });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="w-full max-w-4xl bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl font-tahoma flex flex-col max-h-[95vh]">
        {/* VB6 Window Titlebar */}
        <div className="bg-linear-to-r from-[#0A246A] via-[#0A246A] to-[#A6CAF0] text-white px-3 py-1.5 flex items-center justify-between font-bold text-xs select-none shadow-xs">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-yellow-300" />
            <span className="tracking-wide">Counter & Walk-in Cash Sale Entry (काउंटर नकद खुदरा बिक्री)</span>
            <span className="text-[10px] bg-blue-900/80 px-1.5 py-0.5 rounded-xs text-yellow-200 border border-blue-400">
              VB6 Direct Mode
            </span>
          </div>
          <button 
            onClick={onClose} 
            className="w-5 h-5 bg-[#ECE9D8] text-black font-bold text-xs flex items-center justify-center border border-black hover:bg-red-600 hover:text-white transition-colors"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Tab Header Bar */}
        <div className="flex items-center gap-1 px-3 pt-2 bg-[#ECE9D8] border-b border-[#808080]">
          <button
            type="button"
            onClick={() => setActiveTab('new_sale')}
            className={`px-4 py-1.5 text-xs font-bold border-t-2 border-l-2 border-r-2 rounded-t-xs transition-colors flex items-center gap-1.5 ${
              activeTab === 'new_sale'
                ? 'bg-white border-white border-r-[#404040] text-blue-900 shadow-xs'
                : 'bg-[#ECE9D8] border-transparent text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 text-blue-700" />
            <span>New Cash Sale (नई काउंटर बिक्री)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              loadHistory(historyDate);
            }}
            className={`px-4 py-1.5 text-xs font-bold border-t-2 border-l-2 border-r-2 rounded-t-xs transition-colors flex items-center gap-1.5 ${
              activeTab === 'register'
                ? 'bg-white border-white border-r-[#404040] text-blue-900 shadow-xs'
                : 'bg-[#ECE9D8] border-transparent text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-700" />
            <span>Today's Sales Register (बिक्री रजिस्टर एवं इतिहास)</span>
          </button>
        </div>

        {/* Tab 1: New Sale */}
        {activeTab === 'new_sale' && (
          <div className="p-3 flex-1 overflow-auto space-y-3 text-xs bg-white">
            {/* Notification Banner */}
            {status && (
              <div className={`p-2.5 border rounded-xs flex items-center justify-between font-bold text-xs ${
                status.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-400' 
                  : 'bg-red-50 text-red-900 border-red-400'
              }`}>
                <div className="flex items-center gap-2">
                  {status.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{status.message}</span>
                </div>
                {lastReceipt && (
                  <button 
                    onClick={() => setShowPrintModal(true)}
                    className="ml-3 px-2 py-0.5 bg-emerald-700 text-white text-[11px] rounded-xs hover:bg-emerald-800 flex items-center gap-1"
                  >
                    <Printer className="w-3 h-3" /> Print Slip (स्लिप देखें)
                  </button>
                )}
              </div>
            )}

            {/* Header: Date, Customer, Day info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-300 rounded-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Sale Date (बिक्री दिनांक):</span>
                  <span className="text-[11px] font-semibold text-blue-700">
                    {DAY_NAMES[dayIndex]} ({DAY_HINDI[dayIndex]})
                  </span>
                </label>
                <div className="relative">
                  <input 
                    type="date"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-400 bg-white font-mono font-bold text-slate-900 focus:outline-blue-600"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Customer / Purchaser (ग्राहक का विवरण / नकद बिक्री):
                </label>
                <input 
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in Counter Customer (काउंटर ग्राहक)"
                  className="w-full px-2 py-1.5 border border-slate-400 bg-white text-slate-900 focus:outline-blue-600"
                />
              </div>
            </div>

            {/* Add Publication Item Section */}
            <div className="p-3 bg-amber-50/70 border border-amber-300 rounded-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                  <ShoppingCart className="w-3.5 h-3.5" /> Select Publication & Rate (अखबार एवं स्वतः दर चयन)
                </span>
                <span className="text-[11px] text-slate-500">
                  Weekday: Day {dayOfWeekVb6} ({DAY_NAMES[dayIndex]})
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                {/* Publication Select with Search */}
                <div className="md:col-span-6">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">Publication (अखबार / पत्रिका):</label>
                    <input 
                      type="text"
                      placeholder="🔍 Quick search..."
                      value={pubSearch}
                      onChange={(e) => setPubSearch(e.target.value)}
                      className="w-36 px-1.5 py-0.5 text-[11px] border border-slate-300 bg-white rounded-xs"
                    />
                  </div>
                  <select 
                    value={selectedPubId}
                    onChange={(e) => setSelectedPubId(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border border-slate-400 bg-white font-bold text-blue-900 focus:outline-blue-600 text-xs"
                  >
                    {filteredPubs.map(p => (
                      <option key={p.publica_id} value={p.publica_id}>
                        {p.public_name} {p.pub_hindi ? `(${p.pub_hindi})` : ''} {p.is_closed ? ' [CLOSED]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Qty (संख्या):</label>
                  <input 
                    ref={qtyInputRef}
                    type="number"
                    min="1"
                    value={inputQty}
                    onChange={(e) => setInputQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddItem();
                    }}
                    className="w-full px-2 py-1.5 border border-slate-400 bg-white font-bold text-center text-sm font-mono text-blue-900 focus:outline-blue-600"
                  />
                </div>

                {/* Rate (Auto-populated, editable) */}
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Rate / Copy (₹):</label>
                  <input 
                    type="number"
                    step="0.25"
                    min="0"
                    value={inputRate}
                    onChange={(e) => setInputRate(parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddItem();
                    }}
                    className="w-full px-2 py-1.5 border border-slate-400 bg-white font-bold text-center text-sm font-mono text-emerald-800 focus:outline-blue-600"
                  />
                </div>

                {/* Add Item Button */}
                <div className="md:col-span-2">
                  <button 
                    type="button"
                    onClick={handleAddItem}
                    className="w-full py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold border border-black shadow-xs flex items-center justify-center gap-1 cursor-pointer transition-colors active:translate-y-0.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> + Add (जोड़ें)
                  </button>
                </div>
              </div>

              {/* Subtotal Preview */}
              <div className="flex justify-between items-center text-[11px] text-slate-600 pt-1">
                <span>
                  Current Selection Total: <b className="text-slate-800 font-mono">{inputQty} × ₹{Number(inputRate).toFixed(2)} = ₹{(inputQty * inputRate).toFixed(2)}</b>
                </span>
                <span className="text-slate-400 italic">Press Enter in Qty / Rate to add instantly</span>
              </div>
            </div>

            {/* Cart Items Table */}
            <div className="border border-slate-300 rounded-xs overflow-hidden">
              <div className="bg-[#ECE9D8] px-3 py-1.5 border-b border-slate-300 font-bold text-slate-800 flex justify-between items-center">
                <span>Current Sale Items ({items.length} item{items.length === 1 ? '' : 's'})</span>
                {items.length > 0 && (
                  <button 
                    type="button" 
                    onClick={() => setItems([])} 
                    className="text-red-700 hover:text-red-900 text-[11px] font-normal hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="overflow-auto max-h-56">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b sticky top-0">
                    <tr>
                      <th className="p-2 border-r w-12 text-center">S.No</th>
                      <th className="p-2 border-r">Publication Name</th>
                      <th className="p-2 border-r w-24 text-center">Qty (प्रतियां)</th>
                      <th className="p-2 border-r w-28 text-right">Rate (₹)</th>
                      <th className="p-2 border-r w-32 text-right">Amount (₹)</th>
                      <th className="p-2 w-16 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                          No items added yet. Select a publication above and click "+ Add (जोड़ें)" or press Enter.
                        </td>
                      </tr>
                    ) : (
                      items.map((it, idx) => (
                        <tr key={it.id} className="border-b hover:bg-amber-50/50 transition-colors">
                          <td className="p-2 border-r text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-2 border-r">
                            <div className="font-bold text-slate-900">{it.pub_name}</div>
                            {it.pub_hindi && (
                              <div className="text-[11px] text-slate-500">{it.pub_hindi}</div>
                            )}
                          </td>
                          <td className="p-2 border-r text-center font-bold font-mono text-blue-900">{it.qty}</td>
                          <td className="p-2 border-r text-right font-mono text-slate-700">₹{it.rate.toFixed(2)}</td>
                          <td className="p-2 border-r text-right font-mono font-bold text-emerald-800 text-sm">
                            ₹{it.total.toFixed(2)}
                          </td>
                          <td className="p-2 text-center">
                            <button 
                              onClick={() => handleRemoveItem(it.id)}
                              className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded-xs"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Grand Total Summary Box */}
            <div className="flex flex-wrap items-center justify-between p-3 bg-emerald-50 border-2 border-emerald-300 rounded-xs">
              <div className="space-y-1">
                <div className="text-xs text-slate-600">
                  Total Items: <b className="font-mono text-slate-900">{items.length}</b> &nbsp;|&nbsp; 
                  Total Copies: <b className="font-mono text-blue-900">{grandQty}</b>
                </div>
                <div className="text-[11px] text-slate-500">
                  Payment Mode: <span className="font-bold text-emerald-800">Cash / काउंटर नकद</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-600 font-bold mr-2">Grand Total (कुल नकद देय):</span>
                <span className="text-2xl font-black text-emerald-800 font-mono tracking-tight">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Sales Register / History */}
        {activeTab === 'register' && (
          <div className="p-3 flex-1 overflow-auto space-y-3 text-xs bg-white">
            {/* Register Filter Controls & Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Date Filter */}
              <div className="p-3 bg-slate-50 border border-slate-300 rounded-xs">
                <label className="block font-bold text-slate-700 mb-1">Filter Date (दिनांक):</label>
                <div className="flex items-center gap-1">
                  <input 
                    type="date"
                    value={historyDate}
                    onChange={(e) => setHistoryDate(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-400 bg-white font-mono font-bold text-xs"
                  />
                  <button 
                    onClick={() => loadHistory(historyDate)}
                    disabled={isLoadingHistory}
                    className="p-1 bg-[#ECE9D8] border border-black hover:bg-slate-200"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <button 
                  onClick={() => {
                    setHistoryDate('');
                    loadHistory('all');
                  }}
                  className="mt-1 text-[11px] text-blue-700 hover:underline"
                >
                  Show All History
                </button>
              </div>

              {/* Total Transactions Card */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xs flex flex-col justify-center">
                <span className="text-blue-700 font-semibold text-[11px]">Total Transactions</span>
                <span className="text-xl font-bold font-mono text-blue-950">{historySummary.total_items}</span>
              </div>

              {/* Total Copies Card */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xs flex flex-col justify-center">
                <span className="text-amber-700 font-semibold text-[11px]">Total Copies Sold</span>
                <span className="text-xl font-bold font-mono text-amber-950">{historySummary.total_qty}</span>
              </div>

              {/* Total Cash Collection Card */}
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xs flex flex-col justify-center">
                <span className="text-emerald-700 font-semibold text-[11px]">Total Cash Collected</span>
                <span className="text-xl font-black font-mono text-emerald-800">
                  ₹{historySummary.total_amount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Register Data Table */}
            <div className="border border-slate-300 rounded-xs overflow-hidden">
              <div className="bg-[#ECE9D8] px-3 py-1.5 border-b border-slate-300 font-bold text-slate-800 flex justify-between items-center">
                <span>Recorded Counter Sales ({historyList.length} records)</span>
                <button 
                  onClick={() => window.print()}
                  className="px-2 py-0.5 bg-white border border-slate-400 hover:bg-slate-100 text-[11px] flex items-center gap-1 font-bold"
                >
                  <Printer className="w-3 h-3" /> Print Register (रजिस्टर प्रिंट)
                </button>
              </div>

              <div className="overflow-auto max-h-72">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b sticky top-0">
                    <tr>
                      <th className="p-2 border-r w-12 text-center">S.No</th>
                      <th className="p-2 border-r w-24">Date</th>
                      <th className="p-2 border-r">Publication</th>
                      <th className="p-2 border-r w-36">Customer</th>
                      <th className="p-2 border-r w-16 text-center">Qty</th>
                      <th className="p-2 border-r w-20 text-right">Rate</th>
                      <th className="p-2 border-r w-24 text-right">Amount (₹)</th>
                      <th className="p-2 w-16 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingHistory ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-blue-700" />
                          Loading counter sales from Supabase...
                        </td>
                      </tr>
                    ) : historyList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400 italic">
                          No counter sales found for {historyDate || 'the selected period'}.
                        </td>
                      </tr>
                    ) : (
                      historyList.map((sale, idx) => (
                        <tr key={sale.id || idx} className="border-b hover:bg-slate-50 transition-colors">
                          <td className="p-2 border-r text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-2 border-r font-mono text-slate-700">{sale.sale_date || sale.Sale_Date}</td>
                          <td className="p-2 border-r">
                            <span className="font-bold text-slate-900">{sale.pub_name || `Pub #${sale.publica_id}`}</span>
                            {sale.pub_hindi && <span className="text-[11px] text-slate-500 ml-1">({sale.pub_hindi})</span>}
                          </td>
                          <td className="p-2 border-r text-slate-600 truncate">{sale.customer_name || 'Counter'}</td>
                          <td className="p-2 border-r text-center font-mono font-bold text-blue-900">{sale.qty || sale.Qty}</td>
                          <td className="p-2 border-r text-right font-mono">₹{Number(sale.rate || (sale.amt && sale.qty ? sale.amt / sale.qty : 0)).toFixed(2)}</td>
                          <td className="p-2 border-r text-right font-mono font-bold text-emerald-800">
                            ₹{Number(sale.amt || sale.Amt || 0).toFixed(2)}
                          </td>
                          <td className="p-2 text-center">
                            <button 
                              onClick={() => handleDeleteHistory(sale)}
                              className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded-xs"
                              title="Delete / Cancel Sale"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VB6 Dialog Footer Actions */}
        <div className="bg-[#ECE9D8] border-t border-[#808080] px-4 py-2 flex flex-wrap items-center justify-between gap-2 select-none">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                if (lastReceipt) {
                  setShowPrintModal(true);
                } else if (items.length > 0) {
                  setLastReceipt({
                    receiptNo: `CS-${Date.now().toString().slice(-6)}`,
                    date: saleDate,
                    customer: customerName,
                    items: [...items],
                    total: grandTotal
                  });
                  setShowPrintModal(true);
                } else {
                  alert('No sale items available to print.');
                }
              }}
              disabled={items.length === 0 && !lastReceipt}
              className="px-3 py-1 bg-[#ECE9D8] border border-black shadow-xs hover:bg-slate-200 disabled:opacity-40 font-bold text-xs flex items-center gap-1.5 cursor-pointer active:translate-y-0.5"
              title="Print Memo (Alt+P)"
            >
              <Printer className="w-3.5 h-3.5" /> Print Cash Memo (प्रिंट) <span className="text-[10px] text-slate-500">[Alt+P]</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'new_sale' && (
              <>
                <button 
                  onClick={handleCompleteSale}
                  disabled={items.length === 0 || isSaving}
                  className="px-5 py-1.5 bg-emerald-700 text-white font-bold border border-black shadow-xs hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:translate-y-0.5"
                  title="Complete Sale (Alt+S)"
                >
                  {isSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Complete Cash Sale (बिक्री सुरक्षित करें)</span>
                  <span className="text-[10px] bg-emerald-900 px-1 rounded-xs">[Alt+S]</span>
                </button>

                <button 
                  onClick={handleCancel}
                  disabled={items.length === 0}
                  className="px-3.5 py-1.5 bg-[#ECE9D8] border border-black shadow-xs hover:bg-slate-200 disabled:opacity-50 font-bold text-xs cursor-pointer active:translate-y-0.5"
                  title="Cancel / Clear Sale (Alt+C)"
                >
                  ✖ Cancel (रद्द करें) <span className="text-[10px] text-slate-500">[Alt+C]</span>
                </button>
              </>
            )}

            <button 
              onClick={onClose}
              className="px-4 py-1.5 bg-[#ECE9D8] border border-black shadow-xs hover:bg-slate-200 font-bold text-xs cursor-pointer active:translate-y-0.5"
            >
              Close (बंद करें)
            </button>
          </div>
        </div>
      </div>

      {/* Cash Memo Printable Slip Modal */}
      {showPrintModal && lastReceipt && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white border-2 border-black p-6 w-full max-w-md shadow-2xl font-mono text-xs space-y-4">
            <div className="flex justify-between items-start border-b pb-2">
              <div className="text-center w-full">
                <h2 className="text-base font-black tracking-wide">NEWSPAPER & MAGAZINE AGENCY</h2>
                <div className="text-[11px] text-slate-600">COUNTER CASH SALE MEMO (नकद रसीद)</div>
                <div className="text-[10px] text-slate-500">Alwar / Rajasthan</div>
              </div>
              <button 
                onClick={() => setShowPrintModal(false)}
                className="text-slate-500 hover:text-black font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="border-b pb-2 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Receipt No: <b>{lastReceipt.receiptNo}</b></span>
                <span>Date: <b>{lastReceipt.date}</b></span>
              </div>
              <div>Customer: <b>{lastReceipt.customer}</b></div>
              <div>Mode: <b>CASH (नकद)</b></div>
            </div>

            {/* Memo Items Table */}
            <table className="w-full text-left border-collapse border-b pb-2">
              <thead>
                <tr className="border-b border-black font-bold">
                  <th className="py-1">Particulars</th>
                  <th className="py-1 text-center">Qty</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Amt (₹)</th>
                </tr>
              </thead>
              <tbody>
                {lastReceipt.items.map((it, idx) => (
                  <tr key={idx} className="border-b border-dashed border-slate-300">
                    <td className="py-1">{it.pub_name}</td>
                    <td className="py-1 text-center">{it.qty}</td>
                    <td className="py-1 text-right">₹{it.rate.toFixed(2)}</td>
                    <td className="py-1 text-right font-bold">₹{it.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total */}
            <div className="flex justify-between items-center text-sm font-black border-b border-black pb-2">
              <span>NET PAYABLE (कुल राशि):</span>
              <span className="text-base">₹{lastReceipt.total.toFixed(2)}</span>
            </div>

            <div className="text-center text-[11px] text-slate-600 italic">
              Received with thanks. Paid by Cash.<br />
              Thank You! Please Visit Again (धन्यवाद!)
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button 
                onClick={() => window.print()}
                className="px-4 py-1.5 bg-blue-700 text-white font-bold rounded-xs flex items-center gap-1 hover:bg-blue-800"
              >
                <Printer className="w-3.5 h-3.5" /> Print Receipt (प्रिंट)
              </button>
              <button 
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-1.5 bg-slate-200 text-slate-800 font-bold rounded-xs hover:bg-slate-300"
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
