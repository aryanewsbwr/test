'use client';

import React, { useState, useEffect } from 'react';
import { Newspaper, Save, RefreshCw, X, Calendar, DollarSign } from 'lucide-react';
import { Publication, Rate, RateChange } from '@/lib/types';
import { getEffectiveWeekdayRates } from '@/lib/rateEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  publications: Publication[];
  rates: Rate[];
  ratechanges: RateChange[];
  onSaveRate?: (pubId: number, dayRates: Record<number, number>) => void;
}

const DAYS = [
  { id: 1, name: 'Sunday', hindi: 'रविवार', short: 'Sun' },
  { id: 2, name: 'Monday', hindi: 'सोमवार', short: 'Mon' },
  { id: 3, name: 'Tuesday', hindi: 'मंगलवार', short: 'Tue' },
  { id: 4, name: 'Wednesday', hindi: 'बुधवार', short: 'Wed' },
  { id: 5, name: 'Thursday', hindi: 'गुरुवार', short: 'Thu' },
  { id: 6, name: 'Friday', hindi: 'शुक्रवार', short: 'Fri' },
  { id: 7, name: 'Saturday', hindi: 'शनिवार', short: 'Sat' },
];

export default function RateMatrixForm({ isOpen, onClose, publications, rates, ratechanges, onSaveRate }: Props) {
  const [selectedPubId, setSelectedPubId] = useState<number>(0);
  const [dayRates, setDayRates] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
  const [status, setStatus] = useState('');

  const selectedPub = publications.find(p => p.publica_id === selectedPubId);

  useEffect(() => {
    if (!selectedPubId) {
      setDayRates({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
      return;
    }
    const effective = getEffectiveWeekdayRates(selectedPubId, new Date().toISOString().split('T')[0], rates, ratechanges);
    setDayRates(effective);
  }, [selectedPubId, rates, ratechanges]);

  const handleCancel = () => {
    setSelectedPubId(0);
    setDayRates({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
    setStatus('');
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      const res = await fetch('/api/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publica_id: selectedPubId,
          rates: dayRates
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (onSaveRate) onSaveRate(selectedPubId, dayRates);
      setStatus(`Rates for ${selectedPub?.public_name} updated and persisted successfully.`);
    } catch (err: any) {
      setStatus(`Error updating rates: ${err.message}`);
    }
    setTimeout(() => setStatus(''), 3000);
  };

  const pubRevisions = ratechanges.filter(rc => rc.publica_id === selectedPubId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="d2-window w-full max-w-3xl bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl font-tahoma flex flex-col max-h-[90vh]">
        {/* Titlebar */}
        <div className="d2-title bg-linear-to-r from-[#0A246A] to-[#A6CAF0] text-white px-3 py-1 flex items-center justify-between font-bold text-xs select-none">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-yellow-300" />
            <span>7-Day Pricing Matrix & Rate Revision Master (दैनिक दर निर्धारण)</span>
          </div>
          <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white">✕</button>
        </div>

        <div className="p-4 flex-1 overflow-auto space-y-4 text-xs">
          {/* Publication Selector */}
          <div className="bg-white p-3 border border-[#808080] shadow-inner flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800">Select Publication (अखबार चुनें):</span>
              <select 
                value={selectedPubId} 
                onChange={(e) => setSelectedPubId(Number(e.target.value))}
                className="px-3 py-1 border border-slate-400 bg-amber-50 font-bold text-blue-900 rounded-xs"
              >
                <option value="0">-- Select Publication (अखबार चुनें) --</option>
                {publications.map(pub => (
                  <option key={pub.publica_id} value={pub.publica_id}>
                    {pub.public_name} ({pub.type_p || 'Newspaper'})
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[11px] text-slate-600">
              Publication ID: <span className="font-bold text-blue-900">{selectedPub?.publica_id}</span> | Publisher ID: <span className="font-bold">{selectedPub?.publish_id}</span>
            </div>
          </div>

          {/* 7-Day Matrix */}
          <div className="bg-white p-3 border border-[#808080] shadow-inner space-y-2">
            <h4 className="font-bold text-slate-800 border-b pb-1 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-700" />
              Standard Day-wise Selling Price (वार अनुसार मूल्य - सोमवार से रविवार):
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-2">
              {DAYS.map(day => (
                <div key={day.id} className="bg-slate-50 border border-slate-300 p-2 rounded-xs flex flex-col items-center gap-1">
                  <span className="font-bold text-slate-800 text-[11px]">{day.name}</span>
                  <span className="text-[10px] text-slate-500">{day.hindi}</span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-slate-500 font-bold">₹</span>
                    <input 
                      type="number"
                      step="0.25"
                      min="0"
                      value={dayRates[day.id] ?? 5.0}
                      onChange={(e) => setDayRates({ ...dayRates, [day.id]: parseFloat(e.target.value) || 0 })}
                      className="w-16 px-1.5 py-0.5 border border-slate-400 text-center font-bold text-blue-900 bg-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Historical Rate Changes */}
          <div className="bg-white p-3 border border-[#808080] shadow-inner space-y-2">
            <h4 className="font-bold text-slate-800 border-b pb-1">
              Historical Rate Revisions for {selectedPub?.public_name} (दर परिवर्तन इतिहास):
            </h4>
            {pubRevisions.length > 0 ? (
              <div className="max-h-36 overflow-auto border border-slate-300">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-[#ECE9D8] text-slate-800 font-bold sticky top-0 border-b">
                    <tr>
                      <th className="p-1.5 border-r">Effective Date (दिनांक)</th>
                      <th className="p-1.5 border-r">Revised Rate (संशोधित दर)</th>
                      <th className="p-1.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pubRevisions.map((rc, i) => (
                      <tr key={i} className="border-b hover:bg-amber-50">
                        <td className="p-1.5 border-r font-mono text-blue-900">{rc.dated ? new Date(rc.dated).toLocaleDateString('en-GB') : '-'}</td>
                        <td className="p-1.5 border-r font-bold text-emerald-800">₹{Number(rc.new_rate || 0).toFixed(2)}</td>
                        <td className="p-1.5 text-slate-600">Rate revision recorded in database</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">No historical rate revisions recorded for this publication.</p>
            )}
          </div>

          {status && (
            <div className="bg-emerald-100 text-emerald-800 p-2 border border-emerald-400 rounded-xs font-bold text-center">
              {status}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-[#ECE9D8] border-t border-[#808080] px-4 py-2 flex items-center justify-between">
          <button 
            onClick={() => setDayRates({ 1: 5.0, 2: 5.0, 3: 5.0, 4: 5.0, 5: 5.0, 6: 5.0, 7: 5.0 })}
            className="px-3 py-1 bg-[#ECE9D8] border border-black shadow-xs hover:bg-slate-200 font-bold text-xs flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Default
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSave}
              disabled={!selectedPubId}
              className="px-4 py-1 bg-emerald-700 text-white border border-black shadow-xs hover:bg-emerald-800 disabled:opacity-50 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Save Rates (दर सुरक्षित करें)
            </button>
            <button 
              onClick={handleCancel}
              className="px-3 py-1 bg-[#ECE9D8] border border-black shadow-xs hover:bg-slate-200 font-bold text-xs cursor-pointer"
            >
              ✖ Cancel (रद्द करें)
            </button>
            <button 
              onClick={onClose}
              className="px-4 py-1 bg-[#ECE9D8] border border-black shadow-xs hover:bg-slate-200 font-bold text-xs cursor-pointer"
            >
              Close (बंद करें)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
