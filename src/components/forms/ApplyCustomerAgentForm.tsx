'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface ApplyCustomerAgentFormProps {
  onClose: () => void;
}

export default function ApplyCustomerAgentForm({ onClose }: ApplyCustomerAgentFormProps) {
  const [agents, setAgents] = useState<string[]>(['Mohan Lal', 'Suresh Sharma', 'Dinesh News', 'Ramesh Kumar']);
  const [selectedAgent, setSelectedAgent] = useState('Mohan Lal');
  const [regions, setRegions] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('1');
  const [fromCustId, setFromCustId] = useState('');
  const [toCustId, setToCustId] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/regions')
      .then(r => r.json())
      .then(d => {
        const list = d.regions || [];
        setRegions(list);
        if (list.length > 0) setSelectedRegion(list[0].region_id?.toString() || '1');
      })
      .catch(() => {});
  }, []);

  const handleApply = async () => {
    setMsg(`Collection Agent ${selectedAgent} applied to customers in selected range.`);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="d2-window relative w-[520px] h-[360px] bg-white border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden">
      
      {/* Title Bar */}
      <div className="d2-title bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <img src="/legacy_images/paper.ico" alt="ico" className="w-4 h-4" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span className="font-bold text-xs text-[#808080]">Apply Customer Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 bg-white p-4 flex flex-col justify-between">
        
        {/* Header */}
        <div className="text-center pb-2">
          <h1 className="text-xl font-black text-[#800000] tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>
            APPLY COLLECTION AGENT
          </h1>
        </div>

        {/* Input Fields */}
        <div className="space-y-3 max-w-[420px] mx-auto w-full text-xs">
          <div className="flex items-center gap-3">
            <label className="w-32 font-bold text-[#000080] text-right">Collection Agent</label>
            <select 
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="flex-1 px-2 py-0.5 border border-[#808080] bg-white font-bold text-black outline-none"
            >
              {agents.map((a, i) => (
                <option key={i} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-32 font-bold text-[#000080] text-right">Region</label>
            <select 
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="flex-1 px-2 py-0.5 border border-[#808080] bg-white font-bold text-black outline-none"
            >
              {regions.map(r => (
                <option key={r.region_id} value={r.region_id}>{r.name || `Region ${r.region_id}`}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-32 font-bold text-[#800000] text-right">From Cust ID</label>
            <input 
              type="number" 
              value={fromCustId}
              onChange={(e) => setFromCustId(e.target.value)}
              placeholder="e.g. 1001"
              className="w-36 px-2 py-0.5 border border-[#808080] bg-white font-mono font-bold text-black outline-none text-center"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="w-32 font-bold text-[#800000] text-right">To Cust ID</label>
            <input 
              type="number" 
              value={toCustId}
              onChange={(e) => setToCustId(e.target.value)}
              placeholder="e.g. 1500"
              className="w-36 px-2 py-0.5 border border-[#808080] bg-white font-mono font-bold text-black outline-none text-center"
            />
          </div>
        </div>

        {msg && (
          <div className="text-center text-xs font-bold text-emerald-800 bg-emerald-50 py-0.5 border border-emerald-300">
            {msg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3 pt-2 border-t border-slate-200">
          <button 
            onClick={handleApply}
            className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-6 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-6">🚀 <u>A</u>pply Agent</span>
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
