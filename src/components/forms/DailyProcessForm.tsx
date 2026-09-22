'use client';

import React, { useState } from 'react';
import { Hawker, Publication } from '@/lib/types';
import { getLegacyDayOfWeek } from '@/lib/rateEngine';

interface DailyProcessFormProps {
  onClose: () => void;
  hawkers?: Hawker[];
  publications?: Publication[];
}

const LEGACY_DAYS = [
  { id: 1, name: 'Sunday', hindi: 'रविवार' },
  { id: 2, name: 'Monday', hindi: 'सोमवार' },
  { id: 3, name: 'Tuesday', hindi: 'मंगलवार' },
  { id: 4, name: 'Wednesday', hindi: 'बुधवार' },
  { id: 5, name: 'Thursday', hindi: 'गुरुवार' },
  { id: 6, name: 'Friday', hindi: 'शुक्रवार' },
  { id: 7, name: 'Saturday', hindi: 'शनिवार' },
];

export default function DailyProcessForm({
  onClose,
  hawkers = [],
  publications = []
}: DailyProcessFormProps) {
  const [supplyDate, setSupplyDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedHawkerId, setSelectedHawkerId] = useState('all');
  const [results, setResults] = useState<any[]>([]);
  const [isCalculated, setIsCalculated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const dateObj = new Date(supplyDate);
  const dayOfWeek = getLegacyDayOfWeek(dateObj);
  const dayInfo = LEGACY_DAYS.find(d => d.id === dayOfWeek);

  const handleCalculate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/daily-process?date=${supplyDate}&hawker_id=${selectedHawkerId}`);
      const data = await res.json();
      setResults(data.manifest || []);
      setIsCalculated(true);
    } catch (err) {
      console.error('Failed to calculate daily process:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial calculation
  React.useEffect(() => {
    handleCalculate();
  }, [supplyDate, selectedHawkerId]);

  const totalCopies = results.reduce((acc, r) => acc + (r.copies || 0), 0);

  return (
    <div className="relative w-[750px] h-[550px] vb-window flex flex-col shadow-2xl overflow-hidden font-tahoma">
      {/* Title Bar */}
      <div className="vb-titlebar-xp select-none">
        <div className="flex items-center gap-1.5">
          <img src="/legacy_images/paper.ico" alt="ico" className="w-3.5 h-3.5" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span>Daily Hawker Distribution Process (दैनिक वितरण पर्ची)</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="vb-win-btn">_</button>
          <button className="vb-win-btn">□</button>
          <button onClick={onClose} className="vb-win-btn vb-win-btn-close">✕</button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 p-4 bg-[#ECE9D8] flex flex-col justify-between overflow-hidden">
        {/* Header */}
        <div className="text-center pb-2 border-b border-slate-300">
          <h1 className="text-lg font-black text-[#8B0000] tracking-wider uppercase">
            DAILY MORNING HAWKER SUPPLY CALCULATION
          </h1>
          <span className="text-xs font-bold text-slate-700">
            Selected Day: <strong className="text-indigo-900">{dayInfo?.name} ({dayInfo?.hindi}) - Day #{dayOfWeek}</strong>
          </span>
        </div>

        {/* Filter Controls */}
        <div className="bg-white p-3 vb-box-inset flex items-center justify-between gap-4 text-xs font-bold my-2">
          <div className="flex items-center gap-2">
            <label className="text-[#8B0000]">Supply Date:</label>
            <input 
              type="date"
              value={supplyDate}
              onChange={(e) => setSupplyDate(e.target.value)}
              className="vb-input font-bold"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[#8B0000]">Hawker:</label>
            <select 
              value={selectedHawkerId}
              onChange={(e) => setSelectedHawkerId(e.target.value)}
              className="vb-input bg-white font-bold"
            >
              <option value="all">All Hawkers (सभी हॉकर)</option>
              {hawkers.slice(0, 40).map(h => (
                <option key={h.hawker_id} value={h.hawker_id}>#{h.hawker_id} {h.name}</option>
              ))}
            </select>
          </div>

          <button onClick={handleCalculate} className="vb-action-btn bg-emerald-100">
            <span>⚡ Calculate Supply</span>
          </button>
        </div>

        {/* Results Grid */}
        <div className="flex-1 bg-white vb-grid overflow-auto my-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#ECE9D8]">
              <tr>
                <th className="p-1.5 border">Hawker Name</th>
                <th className="p-1.5 border">Publication</th>
                <th className="p-1.5 border">Circulation</th>
                <th className="p-1.5 border text-right">Required Copies</th>
                <th className="p-1.5 border text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                <tr key={idx} className="border-b hover:bg-blue-50">
                  <td className="p-1.5 border font-bold text-slate-900">{r.hawker_name}</td>
                  <td className="p-1.5 border font-semibold">{r.publica_name}</td>
                  <td className="p-1.5 border">
                    <span className="px-1.5 py-0.2 bg-blue-100 text-blue-900 rounded text-[10px] font-bold">
                      {r.circulation}
                    </span>
                  </td>
                  <td className="p-1.5 border text-right font-mono font-bold text-indigo-900 text-sm">
                    {r.copies} copies
                  </td>
                  <td className="p-1.5 border text-center">
                    <button className="px-2 py-0.5 bg-blue-100 hover:bg-blue-200 border border-blue-400 font-bold text-[10px] cursor-pointer">
                      Print Parchi
                    </button>
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                    Click "Calculate Supply" above to generate morning hawker drop sheets.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="bg-[#ECE9D8] p-2 flex items-center justify-between border-t border-slate-300 text-xs font-bold">
          <div>
            Total Calculated Supply: <strong className="text-indigo-900 text-sm">{totalCopies} Copies</strong>
          </div>

          <div className="flex items-center gap-2">
            <button className="vb-action-btn bg-yellow-50">
              <span>🖨️ Print All Parchis</span>
            </button>
            <button onClick={onClose} className="vb-action-btn text-red-700">
              <span>🛑 Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
