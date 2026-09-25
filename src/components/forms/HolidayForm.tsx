'use client';

import React, { useState, useEffect } from 'react';
import { Holiday, Publication } from '@/lib/types';
import { supabase } from '@/lib/supabaseClient';

interface HolidayFormProps {
  onClose: () => void;
  holidays?: Holiday[];
  publications?: Publication[];
}

export default function HolidayForm({ onClose, holidays = [], publications = [] }: HolidayFormProps) {
  const now = new Date();
  const defDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  
  const [holidayDate, setHolidayDate] = useState(defDateStr);
  const [occasion, setOccasion] = useState('');
  const [selectedPubMap, setSelectedPubMap] = useState<Record<number, boolean>>({});
  const [applyAllNewspaper, setApplyAllNewspaper] = useState(false);
  const [applyAllMagzine, setApplyAllMagzine] = useState(false);
  
  const [pubList, setPubList] = useState<Publication[]>([]);
  const [msg, setMsg] = useState('');
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [existingHolidays, setExistingHolidays] = useState<any[]>([]);

  // Load and sort publications alphabetically
  useEffect(() => {
    if (publications && publications.length > 0) {
      const sorted = [...publications].sort((a, b) => a.public_name.localeCompare(b.public_name));
      setPubList(sorted);
    } else {
      fetch('/data/publications.json')
        .then(r => r.json())
        .then(d => {
          const sorted = (d || []).sort((a: any, b: any) => a.public_name.localeCompare(b.public_name));
          setPubList(sorted);
        })
        .catch(() => {});
    }
  }, [publications]);

  // Load existing holidays for Find dialog
  const loadHolidays = async () => {
    try {
      const res = await fetch('/api/holidays');
      const json = await res.json();
      if (json && json.holidays && json.holidays.length > 0) {
        setExistingHolidays(json.holidays);
        return;
      }
      const { data } = await supabase.from('holiday').select('*').order('id', { ascending: false }).limit(300);
      if (data && data.length > 0) {
        setExistingHolidays(data);
      } else if (holidays && holidays.length > 0) {
        setExistingHolidays(holidays);
      }
    } catch (e) {
      setExistingHolidays(holidays);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, []);

  // Toggle single publication checkbox
  const togglePub = (pubId: number) => {
    setSelectedPubMap(prev => ({
      ...prev,
      [pubId]: !prev[pubId]
    }));
  };

  // Check if publication is a newspaper vs magazine
  const isNewspaper = (p: Publication) => {
    const t = (p.type_p || (p as any).TypeP || (p as any).typep || '').trim().toLowerCase();
    return t === 'newspaper' || t === 'daily' || t === 'morning' || t === 'evening';
  };

  const isMagazine = (p: Publication) => {
    const t = (p.type_p || (p as any).TypeP || (p as any).typep || '').trim().toLowerCase();
    return t === 'magzine' || t === 'magazine' || t === 'weekly' || t === 'monthly' || t === 'fortnightly';
  };

  // Toggle all newspapers (F1)
  const handleApplyAllNewspaper = (checked: boolean) => {
    setApplyAllNewspaper(checked);
    setSelectedPubMap(prev => {
      const updated = { ...prev };
      pubList.forEach(p => {
        if (isNewspaper(p)) {
          updated[p.publica_id] = checked;
        }
      });
      return updated;
    });
    setMsg(checked ? 'F1: Selected all 31 Newspapers (समाचार पत्र)' : 'F1: Deselected all Newspapers');
    setTimeout(() => setMsg(''), 2500);
  };

  // Toggle all magazines (F2)
  const handleApplyAllMagzine = (checked: boolean) => {
    setApplyAllMagzine(checked);
    setSelectedPubMap(prev => {
      const updated = { ...prev };
      pubList.forEach(p => {
        if (isMagazine(p)) {
          updated[p.publica_id] = checked;
        }
      });
      return updated;
    });
    setMsg(checked ? 'F2: Selected all Magazines (पत्रिकाएं)' : 'F2: Deselected all Magazines');
    setTimeout(() => setMsg(''), 2500);
  };

  // Keyboard shortcuts (F1 for Newspaper, F2 for Magzine)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        e.stopPropagation();
        handleApplyAllNewspaper(!applyAllNewspaper);
      } else if (e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        handleApplyAllMagzine(!applyAllMagzine);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyAllNewspaper, applyAllMagzine, pubList]);

  // Save Holiday Definition
  const handleSave = async () => {
    if (!occasion.trim()) {
      setMsg('Please enter an Occasion name (One word only).');
      return;
    }
    const selectedIds = Object.keys(selectedPubMap).filter(k => selectedPubMap[Number(k)]).map(Number);
    if (selectedIds.length === 0) {
      setMsg('Please select at least one publication.');
      return;
    }

    setMsg(`Saving holiday for ${selectedIds.length} publications...`);
    try {
      const records = selectedIds.map(pid => ({
        publica_id: pid,
        oc_date: holidayDate,
        dated: holidayDate,
        remark: occasion.trim()
      }));

      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holidays: records })
      });

      if (res.ok) {
        setMsg(`Holiday '${occasion.trim()}' saved successfully for ${selectedIds.length} publications in Supabase!`);
        loadHolidays();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setMsg(`Save failed: ${errData.error || 'Server error'}`);
      }
    } catch (err: any) {
      setMsg(`Error saving holiday: ${err.message}`);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  // Cancel / Reset
  const handleCancel = () => {
    setOccasion('');
    setSelectedPubMap({});
    setApplyAllNewspaper(false);
    setApplyAllMagzine(false);
    setMsg('');
  };

  return (
    <div className="relative w-[520px] h-[640px] bg-white border-2 border-[#808080] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden">
      
      {/* Title Bar matching screenshot_07.jpg */}
      <div className="bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <img 
            src="/legacy_images/paper.ico" 
            alt="ico" 
            className="w-4 h-4" 
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          <span className="font-bold text-xs text-[#808080]">Define Holiday</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">_</button>
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 bg-white p-3 flex flex-col justify-between relative overflow-hidden">
        
        {/* Top Header matching screenshot_07.jpg */}
        <div className="text-center pb-1">
          <h1 className="text-2xl font-black text-[#000080] tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>
            Holiday Info
          </h1>
        </div>

        {/* Middle Section: Left Cartoon & Labels + Right Input Controls */}
        <div className="flex gap-2 flex-1 overflow-hidden my-1">
          
          {/* Left Graphic & Side Labels */}
          <div className="w-36 flex flex-col justify-start items-center relative select-none shrink-0 pt-2">
            {/* Cartoon Image */}
            <img 
              src="/legacy_images/Holiday.jpg" 
              alt="Holiday Mascot" 
              className="w-32 h-auto object-contain pointer-events-none drop-shadow-sm" 
            />

            {/* Exact Floating Labels overlaid as in screenshot_07.jpg */}
            <div className="absolute top-1 left-2 font-bold text-xs text-[#000080]">
              Date
            </div>
            <div className="absolute top-12 left-2 font-bold text-xs text-[#000080]">
              Occasion
            </div>
            <div className="absolute top-24 left-2 font-bold text-xs text-[#000080]">
              Publication
            </div>
          </div>

          {/* Right Inputs Column */}
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            
            {/* 1. Date Box (Masked style) */}
            <div>
              <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white p-1 inline-block w-40">
                <input 
                  type="text" 
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full text-xs font-mono font-black text-black outline-none tracking-wider"
                  placeholder="DD/MM/YYYY"
                />
              </div>
            </div>

            {/* 2. Occasion Note & Textbox */}
            <div className="mt-1">
              <span className="text-[11px] font-bold text-red-600 block">
                Note : Enter Occasion Name One Word Only
              </span>
              <input 
                type="text"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value.replace(/\s+/g, ''))}
                placeholder=""
                className="w-full border border-t-[#808080] border-l-[#808080] border-r-white border-b-white px-2 py-0.5 text-xs font-bold outline-none text-black bg-white"
              />
            </div>

            {/* 3. Publication Multi-Select Checklist Grid */}
            <div className="flex-1 border border-t-[#808080] border-l-[#808080] border-r-[#808080] border-b-[#808080] mt-2 overflow-auto bg-white">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-[#E0E0E0] border-b border-[#808080]">
                  <tr>
                    <th className="w-8 border-r border-[#808080] p-1 text-center">
                      <span className="sr-only">Check</span>
                    </th>
                    <th className="p-1 text-left font-bold text-black border-r border-[#808080]">
                      Publication
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pubList.map((p) => {
                    const isChecked = !!selectedPubMap[p.publica_id];
                    return (
                      <tr 
                        key={p.publica_id} 
                        onClick={() => togglePub(p.publica_id)}
                        className={`border-b border-slate-200 cursor-pointer text-[11px] ${isChecked ? 'bg-blue-100 font-bold' : 'hover:bg-slate-50'}`}
                      >
                        <td className="p-1 text-center border-r border-slate-200" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => togglePub(p.publica_id)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="p-1 text-black font-bold truncate">
                          {p.public_name}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>

        </div>

        {/* Shortcuts & Bulk Checkboxes matching screenshot_07.jpg */}
        <div className="text-center pt-1">
          <div className="text-xs font-bold text-[#800000] tracking-wide mb-1">
            F1 - Newspaper &nbsp;&nbsp;&nbsp;&nbsp; F2 - Magzine
          </div>

          <div className="flex items-center justify-center gap-6 text-xs font-bold text-[#000080]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input 
                type="checkbox" 
                checked={applyAllNewspaper}
                onChange={(e) => handleApplyAllNewspaper(e.target.checked)}
                className="cursor-pointer"
              />
              <span>Apply All Newspaper</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input 
                type="checkbox" 
                checked={applyAllMagzine}
                onChange={(e) => handleApplyAllMagzine(e.target.checked)}
                className="cursor-pointer"
              />
              <span>Apply All Magzine</span>
            </label>
          </div>
        </div>

        {/* Message Banner */}
        {msg && (
          <div className="text-center text-xs font-bold text-emerald-800 bg-emerald-50 py-0.5 border border-emerald-300 my-1">
            {msg}
          </div>
        )}

        {/* Classic Parallelogram-Beveled Action Buttons matching screenshot_07.jpg */}
        <div className="flex flex-col items-center justify-center gap-2 pt-2 select-none">
          
          {/* Top Row: Save, Update, Find */}
          <div className="flex items-center justify-center gap-3">
            
            {/* Save Button */}
            <button 
              onClick={handleSave}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                💾 <u>S</u>ave
              </span>
            </button>

            {/* Update Button */}
            <button 
              onClick={handleSave}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                ↩ <u>U</u>pdate
              </span>
            </button>

            {/* Find Button */}
            <button 
              onClick={() => setIsFindOpen(true)}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                🔍 <u>F</u>ind
              </span>
            </button>

          </div>

          {/* Bottom Row: Cancel, Exit */}
          <div className="flex items-center justify-center gap-3">
            
            {/* Cancel Button */}
            <button 
              onClick={handleCancel}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1 text-red-700">
                ❌ <u>C</u>ancel
              </span>
            </button>

            {/* Exit Button */}
            <button 
              onClick={onClose}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1 text-red-800 font-bold">
                🛑 E<u>x</u>it
              </span>
            </button>

          </div>

        </div>

      </div>

      {/* Find Modal Dialog */}
      {isFindOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 font-tahoma">
          <div className="w-full max-w-lg bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-black border-b-black shadow-2xl p-3 flex flex-col max-h-[80vh]">
            
            <div className="bg-[#0A246A] text-white px-2 py-1 flex items-center justify-between font-bold text-xs mb-2">
              <span>Saved Holiday List ({existingHolidays.length} Records)</span>
              <button onClick={() => setIsFindOpen(false)} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center">✕</button>
            </div>

            <div className="bg-white p-2 vb-box-inset flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#ECE9D8] sticky top-0">
                  <tr>
                    <th className="p-1 border text-left">Date</th>
                    <th className="p-1 border text-left">Occasion</th>
                    <th className="p-1 border text-left">Publication ID</th>
                  </tr>
                </thead>
                <tbody>
                  {existingHolidays.map((h, idx) => {
                    const dStr = h.oc_date || h.dated || h.holiday_date || h.H_Date || h.h_date || '';
                    const occStr = h.remark || h.occasion || h.Occasion || 'Press Holiday';
                    const pubIdVal = Number(h.publica_id || h.Publica_id || 0);
                    return (
                      <tr 
                        key={idx} 
                        onClick={() => {
                          setHolidayDate(dStr);
                          setOccasion(occStr);
                          setIsFindOpen(false);
                        }}
                        className="border-b hover:bg-blue-50 cursor-pointer text-[11px]"
                      >
                        <td className="p-1 border-r font-mono font-bold">{dStr}</td>
                        <td className="p-1 border-r font-bold text-blue-900">{occStr}</td>
                        <td className="p-1 font-mono">{pubIdVal === 0 ? 'All (Global)' : `Pub #${pubIdVal}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={() => setIsFindOpen(false)}
                className="px-4 py-1 bg-white border border-[#808080] text-xs font-bold cursor-pointer"
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
