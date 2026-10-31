'use client';

import { fySuffix } from '@/lib/financialYear';
import React, { useState, useEffect, useMemo } from 'react';
import { AppUser } from '@/lib/auth';
import { Customer, Publication, Hawker } from '@/lib/types';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';

interface Props {
  user: AppUser;
  onLogout: () => void;
  onSwitchToDesktop?: () => void;
}

export default function HawkerMobilePortal({ user, onLogout, onSwitchToDesktop }: Props) {
  const [activeTab, setActiveTab] = useState<'delivery' | 'collection' | 'hold' | 'summary'>('delivery');
  
  // Data state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [hawkers, setHawkers] = useState<Hawker[]>([]);
  const [selectedHawkerId, setSelectedHawkerId] = useState<number>(user.hawker_id || 1);
  const [isLoading, setIsLoading] = useState(true);

  // Today's formatted dates
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayDdmmyyyy = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  
  // Collection Form State
  const [selectedCustForCollect, setSelectedCustForCollect] = useState<Customer | null>(null);
  const [collectAmount, setCollectAmount] = useState<string>('');
  const [collectMode, setCollectMode] = useState<'Cash' | 'Online' | 'Cheque'>('Cash');
  const [collectDiscount, setCollectDiscount] = useState<string>('0');
  const [collectRemark, setCollectRemark] = useState<string>('');
  const [isSavingCollect, setIsSavingCollect] = useState(false);
  const [collectSuccessMsg, setCollectSuccessMsg] = useState<{ text: string; receiptNo?: number; phone?: string; amt?: number } | null>(null);

  // Hold Form State
  const [holdCust, setHoldCust] = useState<Customer | null>(null);
  const [holdFromDate, setHoldFromDate] = useState<string>(todayDdmmyyyy);
  const [holdToDate, setHoldToDate] = useState<string>('');
  const [isSavingHold, setIsSavingHold] = useState(false);
  const [holdSuccessMsg, setHoldSuccessMsg] = useState<string | null>(null);

  // Today's Receipts list for this hawker
  const [todayReceipts, setTodayReceipts] = useState<any[]>([]);

  // Load initial data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cRes, pRes, hRes, rRes] = await Promise.all([
        fetch(`/api/customers?limit=5000&order=asc`),
        fetch(`/api/publications?with_rates=false`),
        fetch(`/api/hawkers`),
        fetch(`/api/receipts?limit=200`)
      ]);

      if (cRes.ok) {
        const cData = await cRes.json();
        setCustomers(cData.customers || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setPublications(pData.publications || []);
      }
      if (hRes.ok) {
        const hData = await hRes.json();
        setHawkers(hData.hawkers || []);
      }
      if (rRes.ok) {
        const rData = await rRes.json();
        setTodayReceipts(rData.receipts || []);
      }
    } catch (err) {
      console.error('Error loading mobile portal data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter customers assigned to this hawker
  const hawkerCustomers = useMemo(() => {
    return customers.filter(c => {
      const hId = Number((c as any).hawker_id || (c as any).Hawker_id || 0);
      if (user.role === 'admin') {
        // Admin can filter by any hawker
        return selectedHawkerId === 0 || hId === selectedHawkerId;
      }
      return selectedHawkerId > 0 ? hId === selectedHawkerId : true;
    });
  }, [customers, selectedHawkerId, user.role]);

  // Filtered search list
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return hawkerCustomers;
    const s = searchTerm.toLowerCase().trim();
    return hawkerCustomers.filter(c => 
      c.name_eng.toLowerCase().includes(s) ||
      (c.name_hindi && c.name_hindi.includes(s)) ||
      String(c.customer_id).includes(s) ||
      (c.phone && c.phone.includes(s)) ||
      (c.add1 && c.add1.toLowerCase().includes(s))
    );
  }, [hawkerCustomers, searchTerm]);

  // Summary counts for delivery newspapers
  const deliverySummary = useMemo(() => {
    let totalPapers = 0;
    let totalDues = 0;
    let dueCustomersCount = 0;

    hawkerCustomers.forEach(c => {
      const due = Number(c.cbal || c.dueamount || c.due_amount || 0);
      if (due > 0) {
        totalDues += due;
        dueCustomersCount++;
      }
      totalPapers += Number((c as any).total_papers || 1);
    });

    return { totalCustomers: hawkerCustomers.length, totalPapers, totalDues, dueCustomersCount };
  }, [hawkerCustomers]);

  // Today's Collection summary by this hawker
  const myTodayReceipts = useMemo(() => {
    return todayReceipts.filter(r => {
      const rDate = (r.r_date || r.date || '').split('T')[0];
      const matchesDate = rDate === todayIso || rDate === todayDdmmyyyy;
      const matchesHawker = selectedHawkerId === 0 || Number(r.hawker_id || 0) === selectedHawkerId;
      return matchesDate && matchesHawker;
    });
  }, [todayReceipts, todayIso, todayDdmmyyyy, selectedHawkerId]);

  const totalCollectedToday = useMemo(() => {
    let cash = 0;
    let online = 0;
    myTodayReceipts.forEach(r => {
      const amt = Number(r.amount || r.r_amount || 0);
      const mode = String(r.payment_mode || r.remark || '').toLowerCase();
      if (mode.includes('online') || mode.includes('upi')) {
        online += amt;
      } else {
        cash += amt;
      }
    });
    return { cash, online, total: cash + online };
  }, [myTodayReceipts]);

  // Handle Save Payment Collection
  const handleSaveCollection = async () => {
    if (!selectedCustForCollect) {
      alert('कृपया पहले ग्राहक का चयन करें (Please select a customer)');
      return;
    }
    const amt = parseFloat(collectAmount);
    if (!amt || amt <= 0) {
      alert('कृपया वैध संग्रह राशि दर्ज करें (Enter valid collection amount)');
      return;
    }

    setIsSavingCollect(true);
    setCollectSuccessMsg(null);

    try {
      const payload = {
        customer_id: selectedCustForCollect.customer_id,
        hawker_id: selectedHawkerId,
        amount: amt,
        discount: parseFloat(collectDiscount) || 0,
        r_date: todayIso,
        payment_mode: collectMode,
        remark: collectRemark.trim() || `Collected by ${user.name} (${collectMode})`
      };

      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save receipt');

      const savedRec = data.receipt || { receipt_no: data.receipt_no || Date.now() };

      // Update customer local balance
      setCustomers(prev => prev.map(c => {
        if (c.customer_id === selectedCustForCollect.customer_id) {
          const curBal = Number(c.cbal || c.dueamount || c.due_amount || 0);
          return {
            ...c,
            cbal: Math.max(0, curBal - amt),
            dueamount: Math.max(0, curBal - amt),
            due_amount: Math.max(0, curBal - amt)
          };
        }
        return c;
      }));

      // Add to today's receipts
      setTodayReceipts(prev => [data.receipt || {
        receipt_no: savedRec.receipt_no,
        customer_id: selectedCustForCollect.customer_id,
        customer_name: selectedCustForCollect.name_eng,
        amount: amt,
        r_date: todayIso,
        payment_mode: collectMode,
        hawker_id: selectedHawkerId
      }, ...prev]);

      setCollectSuccessMsg({
        text: `✓ ₹${amt.toFixed(2)} का भुगतान रसीद #${savedRec.receipt_no} सफलता से दर्ज हुआ!`,
        receiptNo: savedRec.receipt_no,
        phone: selectedCustForCollect.phone,
        amt: amt
      });

      // Clear collection input
      setCollectAmount('');
      setCollectRemark('');
    } catch (err: any) {
      alert(`त्रुटि: ${err.message}`);
    } finally {
      setIsSavingCollect(false);
    }
  };

  // Handle Save Vacation Hold
  const handleSaveHold = async () => {
    if (!holdCust) {
      alert('कृपया ग्राहक चुनें (Please select customer)');
      return;
    }
    if (!holdFromDate) {
      alert('प्रारंभ दिनांक दर्ज करें (Enter from date)');
      return;
    }

    setIsSavingHold(true);
    setHoldSuccessMsg(null);

    try {
      const parts = holdFromDate.split('/');
      const fromIso = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}` : holdFromDate;
      const toParts = holdToDate ? holdToDate.split('/') : [];
      const toIso = toParts.length === 3 ? `${toParts[2]}-${toParts[1].padStart(2, '0')}-${toParts[0].padStart(2, '0')}` : fromIso;

      const payload = {
        customer_id: holdCust.customer_id,
        publica_id: 0,
        temp_perma: 'Temporary',
        temp_from: fromIso,
        temp_to: toIso,
        entry_date: todayIso,
        financial_year: fySuffix()
      };

      const res = await fetch('/api/discontinue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to record hold');
      }

      setHoldSuccessMsg(`✓ #${holdCust.customer_id} ${holdCust.name_eng} का अवकाश दर्ज हुआ (${holdFromDate} से ${holdToDate || '1 दिन'})`);
      setHoldCust(null);
      setHoldToDate('');
    } catch (err: any) {
      alert(`त्रुटि: ${err.message}`);
    } finally {
      setIsSavingHold(false);
    }
  };

  // WhatsApp receipt share helper
  const shareReceiptWhatsApp = (phone: string, rNo: number, amt: number, custName: string) => {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msgText = encodeURIComponent(
      `🙏 *Aryan Newspaper Agency, Beawar*\n\n` +
      `धन्यवाद! श्री/श्रीमती *${custName}*\n` +
      `आपकी अखबार भुगतान रसीद विवरण:\n` +
      `🧾 *रसीद नं:* #${rNo}\n` +
      `📅 *दिनांक:* ${todayDdmmyyyy}\n` +
      `💵 *प्राप्त राशि:* ₹${amt.toFixed(2)}\n\n` +
      `हॉकर: ${user.name}\n` +
      `किसी भी सहायता हेतु संपर्क करें: 01462-XXXXXX`
    );
    window.open(`https://wa.me/${targetPhone}?text=${msgText}`, '_blank');
  };

  const activeHawkerObj = hawkers.find(h => h.hawker_id === selectedHawkerId);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans select-none pb-20">
      
      {/* Top Mobile App Header */}
      <header className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-amber-400 text-blue-950 font-black flex items-center justify-center text-base shadow-sm">
              🚴
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-wide flex items-center gap-1.5">
                <span>Aryan News</span>
                <span className="text-[10px] bg-blue-700 px-1.5 py-0.2 rounded font-mono font-bold">
                  {user.role === 'admin' ? 'ADMIN' : 'HAWKER'}
                </span>
              </div>
              <div className="text-[11px] text-blue-200">
                {user.name} • {todayDdmmyyyy}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSwitchToDesktop && (
              <button
                type="button"
                onClick={onSwitchToDesktop}
                className="px-2.5 py-1 bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 text-white text-[11px] font-bold rounded shadow-xs"
                title="Open Full Desktop Mode"
              >
                🖥️ Desktop
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="px-2.5 py-1 bg-red-600/80 hover:bg-red-700 active:bg-red-800 text-white text-[11px] font-bold rounded shadow-xs"
            >
              लॉगआउट
            </button>
          </div>
        </div>

        {/* Hawker Line Selector (Admin can switch any line, Hawker defaults to their own) */}
        <div className="bg-blue-950/80 px-3 py-1.5 border-t border-blue-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <span className="text-blue-300 font-bold text-[11px] shrink-0">वितरण लाइन:</span>
            {user.role === 'admin' ? (
              <select
                value={selectedHawkerId}
                onChange={(e) => setSelectedHawkerId(Number(e.target.value))}
                className="bg-blue-900 text-white font-bold text-xs rounded px-2 py-0.5 border border-blue-700 outline-none flex-1"
              >
                <option value={0}>-- सभी लाइनें (All Hawkers) --</option>
                {hawkers.map(h => (
                  <option key={h.hawker_id} value={h.hawker_id}>
                    #{h.hawker_id} - {h.name} {h.hindi_name ? `(${h.hindi_name})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-bold text-amber-300">
                #{selectedHawkerId} {activeHawkerObj?.name || 'My Route'}
              </span>
            )}
          </div>

          <div className="text-[11px] text-blue-200 font-mono font-bold">
            {deliverySummary.totalCustomers} ग्राहक
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto w-full px-3 py-3 flex-1 flex flex-col">
        
        {/* ========================================================================= */}
        {/* TAB 1: DELIVERY SHEET & CUSTOMER CHECKLIST                               */}
        {/* ========================================================================= */}
        {activeTab === 'delivery' && (
          <div className="space-y-3">
            
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase">कुल ग्राहक</div>
                <div className="text-lg font-black text-blue-900 font-mono">{deliverySummary.totalCustomers}</div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase">बकाया ग्राहक</div>
                <div className="text-lg font-black text-amber-700 font-mono">{deliverySummary.dueCustomersCount}</div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase">कुल बकाया</div>
                <div className="text-lg font-black text-red-700 font-mono">₹{Math.round(deliverySummary.totalDues)}</div>
              </div>
            </div>

            {/* Search Input Box */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="🔍 ग्राहक का नाम, फोन या ID खोजें..."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 shadow-xs outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 font-bold text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Customers List Cards */}
            <div className="space-y-2">
              {isLoading ? (
                <div className="text-center py-8 text-slate-500 font-bold text-xs">
                  ग्राहक डेटा लोड हो रहा है...
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-bold text-xs bg-white rounded-lg border border-slate-200">
                  कोई ग्राहक नहीं मिला (No customer found)
                </div>
              ) : (
                filteredCustomers.map(cust => {
                  const due = Number(cust.cbal || cust.dueamount || cust.due_amount || 0);
                  const isDue = due > 0;
                  const phoneClean = (cust.phone || '').trim();

                  return (
                    <div
                      key={cust.customer_id}
                      className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs hover:border-blue-400 transition-all space-y-1.5"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                            <span className="font-mono text-blue-900">#{cust.customer_id}</span>
                            <span>{cust.name_eng}</span>
                          </div>
                          {cust.name_hindi && (
                            <div className="text-xs text-slate-600">
                              {cleanOrTransliterateHindi(cust.name_hindi, cust.name_eng)}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 pt-0.5">
                            {[cust.add1, cust.add2].filter(Boolean).join(', ') || 'स्थानीय पता'}
                          </div>
                        </div>

                        {/* Due Balance Badge */}
                        <div className="text-right">
                          <div className={`font-mono font-black text-sm ${isDue ? 'text-red-700' : 'text-emerald-700'}`}>
                            ₹{due.toFixed(2)}
                          </div>
                          <div className="text-[9px] text-slate-500 font-bold uppercase">
                            {isDue ? 'बकाया' : 'शून्य'}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons for this Customer */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        {/* 1-Tap Collect */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustForCollect(cust);
                            setCollectAmount(due > 0 ? String(due) : '');
                            setActiveTab('collection');
                          }}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded shadow-xs flex items-center justify-center gap-1"
                        >
                          <span>💵</span>
                          <span>रसीद / संग्रह</span>
                        </button>

                        {/* 1-Tap Vacation Hold */}
                        <button
                          type="button"
                          onClick={() => {
                            setHoldCust(cust);
                            setActiveTab('hold');
                          }}
                          className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 active:bg-amber-300 text-amber-900 border border-amber-300 font-bold text-xs rounded"
                          title="छुट्टी / अवकाश रोक"
                        >
                          🛑 अवकाश
                        </button>

                        {/* Call Customer */}
                        {phoneClean && (
                          <a
                            href={`tel:${phoneClean}`}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 font-bold text-xs rounded flex items-center gap-1"
                          >
                            <span>📞</span>
                            <span>कॉल</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PAYMENT COLLECTION & INSTANT RECEIPT                             */}
        {/* ========================================================================= */}
        {activeTab === 'collection' && (
          <div className="space-y-3">
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-3">
              <h2 className="text-base font-extrabold text-blue-950 border-b pb-2 flex items-center gap-2">
                <span>💵</span>
                <span>भुगतान संग्रह एवं रसीद (Payment Collection)</span>
              </h2>

              {/* Selected Customer Banner */}
              {selectedCustForCollect ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-blue-950 text-sm">
                      #{selectedCustForCollect.customer_id} {selectedCustForCollect.name_eng}
                    </div>
                    <div className="text-xs text-slate-600">
                      {[selectedCustForCollect.add1, selectedCustForCollect.phone].filter(Boolean).join(' • ')}
                    </div>
                    <div className="text-xs font-bold text-red-800 pt-0.5">
                      वर्तमान बकाया: ₹{Number(selectedCustForCollect.cbal || selectedCustForCollect.dueamount || 0).toFixed(2)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustForCollect(null)}
                    className="text-xs text-blue-800 underline font-bold"
                  >
                    बदलें
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">ग्राहक चुनें (Select Customer):</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ग्राहक का नाम या ID लिखें..."
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-bold outline-none"
                  />
                  {searchTerm && filteredCustomers.length > 0 && (
                    <div className="bg-white border border-slate-300 rounded max-h-40 overflow-y-auto divide-y divide-slate-100 shadow-lg text-xs">
                      {filteredCustomers.slice(0, 8).map(c => (
                        <div
                          key={c.customer_id}
                          onClick={() => {
                            setSelectedCustForCollect(c);
                            const due = Number(c.cbal || c.dueamount || 0);
                            setCollectAmount(due > 0 ? String(due) : '');
                            setSearchTerm('');
                          }}
                          className="p-2 hover:bg-blue-50 cursor-pointer flex justify-between items-center"
                        >
                          <div>
                            <strong>#{c.customer_id}</strong> {c.name_eng}
                          </div>
                          <span className="font-mono text-red-700 font-bold">
                            ₹{Number(c.cbal || c.dueamount || 0).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Amount Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">प्राप्त राशि (Amount in ₹) *</label>
                <input
                  type="number"
                  step="1"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-2xl font-mono font-black text-blue-900 border-2 border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-600 focus:bg-yellow-50/40"
                />
              </div>

              {/* Payment Mode Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">भुगतान माध्यम (Payment Mode):</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'Online', 'Cheque'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCollectMode(mode)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        collectMode === mode 
                          ? 'bg-blue-900 text-white border-blue-900 shadow-xs' 
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {mode === 'Cash' ? '💵 Cash (नकद)' : mode === 'Online' ? '📱 UPI / Online' : '🏦 Cheque'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remark */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">टिप्पणी / विवरण (Remark):</label>
                <input
                  type="text"
                  value={collectRemark}
                  onChange={(e) => setCollectRemark(e.target.value)}
                  placeholder="e.g. Month Bill Payment, GPay Ref..."
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-bold outline-none"
                />
              </div>

              {/* Success Message Banner with WhatsApp Share */}
              {collectSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg space-y-2">
                  <div className="font-bold text-emerald-900 text-xs">
                    {collectSuccessMsg.text}
                  </div>
                  {collectSuccessMsg.phone && (
                    <button
                      type="button"
                      onClick={() => shareReceiptWhatsApp(
                        collectSuccessMsg.phone!,
                        collectSuccessMsg.receiptNo || 0,
                        collectSuccessMsg.amt || 0,
                        selectedCustForCollect?.name_eng || 'Customer'
                      )}
                      className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <span>💬</span>
                      <span>ग्राहक को WhatsApp पर रसीद भेजें</span>
                    </button>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleSaveCollection}
                disabled={isSavingCollect || !selectedCustForCollect}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 active:from-emerald-800 active:to-green-900 disabled:opacity-50 text-white font-black text-sm rounded-lg shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <span>💾</span>
                <span>{isSavingCollect ? 'सुरक्षित हो रहा है...' : 'रसीद सुरक्षित करें (Save Receipt)'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CUSTOMER VACATION HOLD / DISCONTINUE                               */}
        {/* ========================================================================= */}
        {activeTab === 'hold' && (
          <div className="space-y-3">
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-3">
              <h2 className="text-base font-extrabold text-amber-900 border-b pb-2 flex items-center gap-2">
                <span>🛑</span>
                <span>ग्राहक अवकाश / बंद रोक (Vacation Hold)</span>
              </h2>

              {holdCust ? (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-amber-950 text-sm">
                      #{holdCust.customer_id} {holdCust.name_eng}
                    </div>
                    <div className="text-xs text-slate-600">
                      {[holdCust.add1, holdCust.phone].filter(Boolean).join(' • ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHoldCust(null)}
                    className="text-xs text-amber-900 underline font-bold"
                  >
                    बदलें
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">ग्राहक चुनें (Select Customer):</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ग्राहक खोजें..."
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-bold outline-none"
                  />
                  {searchTerm && filteredCustomers.length > 0 && (
                    <div className="bg-white border border-slate-300 rounded max-h-40 overflow-y-auto divide-y divide-slate-100 shadow-lg text-xs">
                      {filteredCustomers.slice(0, 8).map(c => (
                        <div
                          key={c.customer_id}
                          onClick={() => {
                            setHoldCust(c);
                            setSearchTerm('');
                          }}
                          className="p-2 hover:bg-amber-50 cursor-pointer flex justify-between items-center"
                        >
                          <div>
                            <strong>#{c.customer_id}</strong> {c.name_eng}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">From Date (प्रारंभ दिनांक):</label>
                  <input
                    type="text"
                    value={holdFromDate}
                    onChange={(e) => setHoldFromDate(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-bold font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">To Date (समाप्ति दिनांक):</label>
                  <input
                    type="text"
                    value={holdToDate}
                    onChange={(e) => setHoldToDate(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-bold font-mono outline-none"
                  />
                </div>
              </div>

              {holdSuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg text-xs font-bold">
                  {holdSuccessMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveHold}
                disabled={isSavingHold || !holdCust}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white font-black text-sm rounded-lg shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <span>🛑</span>
                <span>{isSavingHold ? 'सुरक्षित हो रहा है...' : 'अवकाश रोक दर्ज करें (Record Hold)'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: TODAY'S COLLECTION SUMMARY                                        */}
        {/* ========================================================================= */}
        {activeTab === 'summary' && (
          <div className="space-y-3">
            
            {/* Summary Top Cards */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase">नकद संग्रह (Cash)</div>
                <div className="text-base font-black text-emerald-700 font-mono">₹{totalCollectedToday.cash.toFixed(2)}</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase">ऑनलाइन (UPI)</div>
                <div className="text-base font-black text-blue-700 font-mono">₹{totalCollectedToday.online.toFixed(2)}</div>
              </div>
              <div className="bg-gradient-to-br from-blue-900 to-indigo-950 p-3 rounded-lg text-white shadow-xs">
                <div className="text-[10px] text-blue-200 font-bold uppercase">कुल संग्रह (Total)</div>
                <div className="text-base font-black text-amber-300 font-mono">₹{totalCollectedToday.total.toFixed(2)}</div>
              </div>
            </div>

            {/* List of today's receipts */}
            <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-extrabold text-slate-900 text-xs">
                  आज की रसीदें (Today&apos;s Receipts - {myTodayReceipts.length})
                </h3>
                <button
                  type="button"
                  onClick={loadData}
                  className="text-[10px] text-blue-700 underline font-bold"
                >
                  रिफ्रेश
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {myTodayReceipts.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 italic text-xs">
                    आज अभी तक कोई रसीद दर्ज नहीं हुई है.
                  </div>
                ) : (
                  myTodayReceipts.map((r, idx) => (
                    <div key={r.receipt_no || idx} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">
                          #{r.receipt_no} - {r.customer_name || `ग्राहक #${r.customer_id}`}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {r.payment_mode || 'Cash'} • {r.remark || 'Collection'}
                        </div>
                      </div>
                      <div className="text-right font-mono font-black text-emerald-800 text-sm">
                        ₹{Number(r.amount || r.r_amount || 0).toFixed(2)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Bottom Sticky Mobile Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-300 shadow-xl z-50">
        <div className="max-w-4xl mx-auto grid grid-cols-4 divide-x divide-slate-100">
          
          <button
            type="button"
            onClick={() => setActiveTab('delivery')}
            className={`py-2.5 flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors ${
              activeTab === 'delivery' ? 'text-blue-900 bg-blue-50' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="text-base">🚴</span>
            <span className="text-[10px]">वितरण सूची</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('collection')}
            className={`py-2.5 flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors ${
              activeTab === 'collection' ? 'text-blue-900 bg-blue-50' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="text-base">💵</span>
            <span className="text-[10px]">रसीद संग्रह</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hold')}
            className={`py-2.5 flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors ${
              activeTab === 'hold' ? 'text-blue-900 bg-blue-50' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="text-base">🛑</span>
            <span className="text-[10px]">अवकाश रोक</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`py-2.5 flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors ${
              activeTab === 'summary' ? 'text-blue-900 bg-blue-50' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="text-base">📊</span>
            <span className="text-[10px]">आज का कुल</span>
          </button>

        </div>
      </nav>

    </div>
  );
}
