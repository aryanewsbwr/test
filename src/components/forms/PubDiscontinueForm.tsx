'use client';

import React, { useState, useEffect } from 'react';
import { Publication } from '@/lib/types';
import { supabase } from '@/lib/supabaseClient';

interface PubDiscontinueFormProps {
  onClose: () => void;
  publications?: Publication[];
  mode?: 'discontinue' | 'supplement';
}

export default function PubDiscontinueForm({ onClose, publications = [], mode = 'discontinue' }: PubDiscontinueFormProps) {
  const isSupplement = mode === 'supplement';
  const [pubList, setPubList] = useState<Publication[]>([]);
  const [selectedPub, setSelectedPub] = useState('');
  const [supplementName, setSupplementName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (publications && publications.length > 0) {
      setPubList(publications);
      setSelectedPub('');
    } else {
      fetch('/data/publications.json')
        .then(r => r.json())
        .then(d => {
          setPubList(d || []);
          setSelectedPub('');
        })
        .catch(() => {});
    }
  }, [publications]);

  const handleSave = async () => {
    if (!selectedPub) {
      setMsg('Please select a publication.');
      return;
    }
    setMsg(`Publication discontinuation saved for ${selectedPub}`);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleCancel = () => {
    setSelectedPub('');
    setFromDate('');
    setToDate('');
    setMsg('');
  };

  return (
    <div className="relative w-[520px] h-[360px] bg-white border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden">
      
      {/* Title Bar matching screenshot_11.jpg */}
      <div className="bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <img src="/legacy_images/paper.ico" alt="ico" className="w-4 h-4" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span className="font-bold text-xs text-[#808080]">Publication Info</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">_</button>
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Body matching screenshot_11.jpg */}
      <div className="flex-1 bg-white p-4 flex flex-col justify-between">
        
        {/* Header */}
        <div className="text-center pb-2">
          <h1 className="text-xl font-black text-[#800000] tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>
            {isSupplement ? 'PUBLICATIONS SUPPLEMENT' : 'PUBLICATIONS DISCONTINUE'}
          </h1>
        </div>

        {/* Input Fields matching screenshot_11.jpg */}
        <div className="space-y-3 max-w-[400px] mx-auto w-full text-xs">
          <div className="flex items-center gap-3">
            <label className="w-32 font-bold text-[#000080] text-right">Publication Name</label>
            <select 
              value={selectedPub}
              onChange={(e) => setSelectedPub(e.target.value)}
              className="flex-1 px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none"
            >
              <option value="">-- Select Publication --</option>
              {pubList.map(p => (
                <option key={p.publica_id} value={p.public_name}>{p.public_name}</option>
              ))}
            </select>
          </div>

          {isSupplement ? (
            <>
              <div className="flex items-center gap-3">
                <label className="w-32 font-bold text-[#800000] text-right">Supplement Name</label>
                <input 
                  type="text" 
                  value={supplementName}
                  onChange={(e) => setSupplementName(e.target.value)}
                  placeholder="e.g. Rasrang / Parivar"
                  className="flex-1 px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-32 font-bold text-[#800000] text-right">Date</label>
                <input 
                  type="text" 
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="w-36 px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-mono font-bold text-black outline-none text-center"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <label className="w-32 font-bold text-[#800000] text-right">From</label>
                <input 
                  type="text" 
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  placeholder="//"
                  className="w-36 px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-mono font-bold text-black outline-none text-center"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="w-32 font-bold text-[#800000] text-right">To</label>
                <input 
                  type="text" 
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  placeholder="//"
                  className="w-36 px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-mono font-bold text-black outline-none text-center"
                />
              </div>
            </>
          )}
        </div>

        {msg && (
          <div className="text-center text-xs font-bold text-emerald-800 bg-emerald-50 py-0.5 border border-emerald-300">
            {msg}
          </div>
        )}

        {/* Action Buttons matching screenshot_11.jpg */}
        <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-200">
          <button 
            onClick={handleSave}
            className="px-3.5 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12">💾 <u>S</u>ave</span>
          </button>
          <button 
            onClick={handleSave}
            className="px-3.5 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12">↩ <u>U</u>pdate</span>
          </button>
          <button 
            onClick={() => setMsg('Discontinuation deleted.')}
            className="px-3.5 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12">🗑️ <u>D</u>el</span>
          </button>
          <button 
            onClick={() => setMsg('Showing publication stop records')}
            className="px-3.5 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12">🔍 <u>F</u>ind</span>
          </button>
          <button 
            onClick={handleCancel}
            className="px-3.5 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12 text-red-700">❌ <u>C</u>ancel</span>
          </button>
          <button 
            onClick={onClose}
            className="px-3.5 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12 text-red-800 font-bold">🛑 E<u>x</u>it</span>
          </button>
        </div>

      </div>

    </div>
  );
}
