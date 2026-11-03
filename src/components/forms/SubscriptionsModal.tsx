'use client';

import React, { useState, useEffect } from 'react';
import { Customer, CustomerDetail, Publication, Hawker } from '@/lib/types';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';

interface SubscriptionsModalProps {
  customer: Customer;
  onClose: () => void;
  publications?: Publication[];
  hawkers?: Hawker[];
}

export default function SubscriptionsModal({
  customer,
  onClose,
  publications = [],
  hawkers = []
}: SubscriptionsModalProps) {
  const [subs, setSubs] = useState<CustomerDetail[]>([]);
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!customer) return;
    setIsLoading(true);
    fetch(`/api/subscriptions?customer_id=${customer.customer_id}`)
      .then(r => r.json())
      .then(data => setSubs(data.subscriptions || []))
      .catch(() => setSubs([]))
      .finally(() => setIsLoading(false));
  }, [customer]);

  const activeSubs = subs.filter(s => s.is_active !== false);
  const discontinuedSubs = subs.filter(s => s.is_active === false);
  const displayedSubs = tab === 'active' ? activeSubs : subs;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-tahoma">
      <div className="d2-window relative w-[820px] h-[580px] vb-window flex flex-col shadow-2xl overflow-hidden">
        {/* Title Bar */}
        <div className="d2-title vb-titlebar-xp select-none">
          <div className="flex items-center gap-1.5">
            <img src="/legacy_images/paper.ico" alt="ico" className="w-3.5 h-3.5" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <span>Customer Subscribed Papers & Delivery Schedule - ID #{customer.customer_id}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onClose} className="vb-win-btn vb-win-btn-close">✕</button>
          </div>
        </div>

        {/* Body with Background Texture matching Customer1.jpg */}
        <div 
          className="flex-1 relative p-4 flex flex-col justify-between bg-cover bg-center"
          style={{ backgroundImage: "url('/legacy_images/Customer1.jpg'), linear-gradient(135deg, #E6F0FA 0%, #FFFFFF 100%)" }}
        >
          {/* Customer Header Information */}
          <div className="bg-white/95 p-3 vb-box-inset flex items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-500 font-bold block">Customer:</span>
              <strong className="text-slate-900 text-sm">{customer.name_eng}</strong>
              <span className="text-indigo-900 font-hindi font-bold ml-2 text-xs">
                ({cleanOrTransliterateHindi(customer.name_hindi, customer.name_eng)})
              </span>
            </div>

            <div className="flex items-center gap-3 text-right">
              <div>
                <span className="text-[10px] text-slate-500 font-bold block">Route Priority:</span>
                <span className="font-mono font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  #{customer.priority}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 font-bold block">Current Balance:</span>
                <strong className={`font-mono ${customer.cbal > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  ₹{customer.cbal?.toFixed(2)}
                </strong>
              </div>
            </div>
          </div>

          {/* Active vs All History Filter Tabs */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTab('active')}
                className={`px-3 py-1 text-xs font-bold border cursor-pointer ${
                  tab === 'active' 
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs' 
                    : 'bg-[#ECE9D8] text-slate-800 border-slate-400 hover:bg-white'
                }`}
              >
                ● Active Deliveries ({activeSubs.length})
              </button>
              <button
                onClick={() => setTab('all')}
                className={`px-3 py-1 text-xs font-bold border cursor-pointer ${
                  tab === 'all' 
                    ? 'bg-indigo-700 text-white border-indigo-800 shadow-xs' 
                    : 'bg-[#ECE9D8] text-slate-800 border-slate-400 hover:bg-white'
                }`}
              >
                All Subscription History ({subs.length})
              </button>
            </div>

            <span className="text-xs font-bold text-[#8B0000]">
              {activeSubs.length} Active Daily Papers • {discontinuedSubs.length} Discontinued
            </span>
          </div>

          {/* Subscriptions Grid matching screenshot_06.jpg */}
          <div className="flex-1 bg-white vb-grid overflow-auto my-1">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400">Loading subscriptions...</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#ECE9D8]">
                  <tr>
                    <th className="p-1.5 border">Status</th>
                    <th className="p-1.5 border">Publication Name</th>
                    <th className="p-1.5 border">Hawker</th>
                    <th className="p-1.5 border text-center">Qty</th>
                    <th className="p-1.5 border">Circulation</th>
                    <th className="p-1.5 border">Start Date (S_Date)</th>
                    <th className="p-1.5 border">Stop Date (C_Date)</th>
                    <th className="p-1.5 border">Schedule</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSubs.map((s, idx) => {
                    const isActive = s.is_active !== false;

                    return (
                      <tr 
                        key={idx}
                        className={`border-b ${isActive ? 'hover:bg-emerald-50/60' : 'bg-red-50/40 opacity-75 hover:bg-red-50'}`}
                      >
                        <td className="p-1.5 border text-center font-bold">
                          {isActive ? (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-400 rounded text-[10px]">
                              🟢 Active
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-800 border border-red-300 rounded text-[10px]">
                              ✕ Stopped
                            </span>
                          )}
                        </td>
                        <td className="p-1.5 border font-bold text-slate-900">{s.publication_name}</td>
                        <td className="p-1.5 border font-semibold text-slate-800">{s.hawker_name}</td>
                        <td className="p-1.5 border text-center font-mono font-bold">{s.qty}</td>
                        <td className="p-1.5 border">{s.circulation}</td>
                        <td className="p-1.5 border font-mono">{s.s_date || 'Initial'}</td>
                        <td className="p-1.5 border font-mono font-bold text-red-700">
                          {s.c_date || '-'}
                        </td>
                        <td className="p-1.5 border text-indigo-900 font-bold">
                          {s.from_day === '1-7' ? 'Daily (All 7 Days)' : `Days ${s.from_day}`}
                        </td>
                      </tr>
                    );
                  })}
                  {displayedSubs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                        No {tab === 'active' ? 'active' : ''} subscriptions recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom Trapezoidal 3D Buttons */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-300/80">
            <div className="text-[11px] text-slate-600 font-bold">
              Tip: Discontinued papers are automatically exempted during billing calculation.
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => { setMsg('Subscription updated.'); setTimeout(() => setMsg(''), 2000); }} className="vb-action-btn">
                <span>💾 Save Changes</span>
              </button>
              <button onClick={onClose} className="vb-action-btn text-red-700">
                <span>🛑 Close</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
