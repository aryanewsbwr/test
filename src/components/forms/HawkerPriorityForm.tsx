'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ArrowUp, ArrowDown, Save, X } from 'lucide-react';

interface HawkerPriorityFormProps {
  onClose: () => void;
}

export default function HawkerPriorityForm({ onClose }: HawkerPriorityFormProps) {
  const [hawkers, setHawkers] = useState<any[]>([]);
  const [selectedHawker, setSelectedHawker] = useState<string>('1');
  const [customerRoute, setCustomerRoute] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/hawkers')
      .then(r => r.json())
      .then(d => {
        const list = d.hawkers || [];
        setHawkers(list);
        if (list.length > 0) setSelectedHawker(list[0].hawker_id?.toString() || '1');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedHawker) return;
    const hid = parseInt(selectedHawker, 10);
    supabase
      .from('customer')
      .select('customer_id, name_eng, priority, region_id')
      .eq('region_id', hid)
      .order('priority', { ascending: true })
      .limit(50)
      .then(({ data }) => {
        setCustomerRoute(data || []);
      });
  }, [selectedHawker]);

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const items = [...customerRoute];
    const temp = items[idx];
    items[idx] = items[idx - 1];
    items[idx - 1] = temp;
    setCustomerRoute(items);
  };

  const moveDown = (idx: number) => {
    if (idx === customerRoute.length - 1) return;
    const items = [...customerRoute];
    const temp = items[idx];
    items[idx] = items[idx + 1];
    items[idx + 1] = temp;
    setCustomerRoute(items);
  };

  // Nothing is saved from here yet: the list is not tied to the hawker's own customers,
  // so writing these positions would reorder the wrong routes. Route order is set per
  // customer in Customer Info (Priority).
  const handleSave = () => {
    setMsg('Not saved: set route order in Customer Info (Priority) for now.');
    setTimeout(() => setMsg(''), 4000);
  };

  return (
    <div className="relative w-[640px] h-[520px] bg-white border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden">
      
      {/* Title Bar */}
      <div className="bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <img src="/legacy_images/paper.ico" alt="ico" className="w-4 h-4" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span className="font-bold text-xs text-[#808080]">Hawker's Customer Priority</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">_</button>
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 bg-white p-4 flex flex-col justify-between overflow-hidden">
        
        {/* Top Controls */}
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-2">
            <label className="font-bold text-[#800000] text-xs">Hawker</label>
            <select 
              value={selectedHawker}
              onChange={(e) => setSelectedHawker(e.target.value)}
              className="px-2 py-1 border border-[#808080] bg-white font-bold text-xs outline-none"
            >
              {hawkers.map(h => (
                <option key={h.hawker_id} value={h.hawker_id}>{h.name || `Hawker ${h.hawker_id}`}</option>
              ))}
            </select>
          </div>

          <span className="text-xs text-slate-600 font-bold">
            Delivery Route Sequence ({customerRoute.length} Customers)
          </span>
        </div>

        {/* Priority Grid */}
        <div className="flex-1 bg-white border border-[#808080] my-2 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#ECE9D8] border-b">
              <tr>
                <th className="p-1 border-r text-center w-16">Seq No</th>
                <th className="p-1 border-r text-center w-20">Cust ID</th>
                <th className="p-1 border-r text-left">Customer Name</th>
                <th className="p-1 border-r text-center w-20">Priority</th>
                <th className="p-1 text-center w-24">Reorder</th>
              </tr>
            </thead>
            <tbody>
              {customerRoute.map((c, idx) => (
                <tr key={c.customer_id} className="border-b hover:bg-blue-50 text-[11px]">
                  <td className="p-1 border-r text-center font-mono font-bold">{idx + 1}</td>
                  <td className="p-1 border-r text-center font-mono font-bold text-blue-900">#{c.customer_id}</td>
                  <td className="p-1 border-r font-bold">{c.name_eng}</td>
                  <td className="p-1 border-r text-center font-mono">{idx + 1}</td>
                  <td className="p-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        className="p-0.5 bg-slate-100 hover:bg-slate-200 border disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3 text-slate-700" />
                      </button>
                      <button 
                        onClick={() => moveDown(idx)}
                        disabled={idx === customerRoute.length - 1}
                        className="p-0.5 bg-slate-100 hover:bg-slate-200 border disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3 text-slate-700" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {msg && (
          <div className="text-center text-xs font-bold text-emerald-800 bg-emerald-50 py-0.5 border border-emerald-300 mb-1">
            {msg}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <button 
            onClick={handleSave}
            className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-6 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-6">💾 Save Priorities</span>
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-1 bg-white hover:bg-red-50 text-red-800 border border-slate-300 text-xs font-bold cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>

    </div>
  );
}
