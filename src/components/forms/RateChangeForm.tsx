'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, Calendar, Search, RefreshCw, X, History, Trash2, Edit3, ArrowRight, BookOpen } from 'lucide-react';
import { Publication, Rate, RateChange } from '@/lib/types';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { getPublicationPeriodicityAndRates, PeriodicityInfo } from '@/lib/rateEngine';

interface RateChangeFormProps {
  onClose: () => void;
  publications?: Publication[];
  rates?: Rate[];
  ratechanges?: RateChange[];
  onSave?: (pubId: number, newRates: Record<number, number>, effDateIso: string) => void;
}

const WEEKDAYS = [
  { id: 1, name: 'Sunday', hindi: 'रविवार', short: 'Sun' },
  { id: 2, name: 'Monday', hindi: 'सोमवार', short: 'Mon' },
  { id: 3, name: 'Tuesday', hindi: 'मंगलवार', short: 'Tue' },
  { id: 4, name: 'Wednesday', hindi: 'बुधवार', short: 'Wed' },
  { id: 5, name: 'Thursday', hindi: 'गुरुवार', short: 'Thu' },
  { id: 6, name: 'Friday', hindi: 'शुक्रवार', short: 'Fri' },
  { id: 7, name: 'Saturday', hindi: 'शनिवार', short: 'Sat' },
];

export default function RateChangeForm({
  onClose,
  publications = [],
  rates = [],
  ratechanges = [],
  onSave
}: RateChangeFormProps) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  const todayDdmmyyyy = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // Publications list
  const [pubList, setPubList] = useState<Publication[]>([]);
  const [selectedPub, setSelectedPub] = useState<Publication | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Periodicity info
  const [periodInfo, setPeriodInfo] = useState<PeriodicityInfo | null>(null);

  // Rate states
  const [effectiveDate, setEffectiveDate] = useState<string>(todayDdmmyyyy);
  const [currentRates, setCurrentRates] = useState<Record<number, number>>({});
  const [newRates, setNewRates] = useState<Record<number, number>>({});

  // Rate Change History
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Status message
  const [msg, setMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Normalize publications
  useEffect(() => {
    const cleaned = (publications || []).map((p: any) => {
      const pid = Number(p.publica_id ?? p.id ?? 0);
      const name = String(p.public_name || p.name || `Publication #${pid}`).trim();
      const hindi = p.pub_hindi || '';
      return {
        ...p,
        publica_id: pid,
        public_name: name,
        pub_hindi: hindi ? cleanOrTransliterateHindi(hindi, name) : name
      };
    }).filter((p: any) => p.publica_id > 0 && p.public_name.length > 0);

    cleaned.sort((a, b) => a.public_name.localeCompare(b.public_name, undefined, { sensitivity: 'base' }));
    setPubList(cleaned);

    if (cleaned.length > 0 && !selectedPub) {
      loadPublicationRates(cleaned[0]);
    }
  }, [publications]);

  // Load publication and resolve effective rates based on periodicity
  const loadPublicationRates = async (pub: Publication) => {
    setSelectedPub(pub);
    setSearchTerm('');
    setEffectiveDate(todayDdmmyyyy);

    const info = getPublicationPeriodicityAndRates(pub, todayIso, rates, ratechanges);
    setPeriodInfo(info);
    setCurrentRates(info.rates);
    setNewRates({ ...info.rates });

    // Fetch history
    fetchHistory(pub.publica_id);
  };

  const fetchHistory = async (pubId: number) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/rates?history=true&publica_id=${pubId}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data.history || []);
      }
    } catch (e) {
      console.warn('History fetch error:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Convert DD/MM/YYYY or YYYY-MM-DD to YYYY-MM-DD
  const toIso = (str: string): string => {
    if (!str) return todayIso;
    const clean = str.trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return clean;
  };

  // Format date display
  const formatDateDisplay = (val: string) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length === 8) {
      return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    }
    return val;
  };

  // F1 copy first rate across all rows (if daily or multiple rows)
  const copySundayRate = () => {
    const sun = newRates[1] || 0;
    const updated: Record<number, number> = {};
    if (periodInfo?.rows) {
      periodInfo.rows.forEach(r => { updated[r.id] = sun; });
    } else {
      WEEKDAYS.forEach(d => { updated[d.id] = sun; });
    }
    setNewRates(updated);
    setMsg({ text: `F1 Pressed: Copied ₹${sun.toFixed(2)} across all slots!` });
    setTimeout(() => setMsg(null), 3000);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isHistoryOpen) setIsHistoryOpen(false);
        else onClose();
      } else if (e.key === 'F1') {
        e.preventDefault();
        copySundayRate();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [newRates, isHistoryOpen, periodInfo]);

  // Load a historical revision into editor for fixing
  const handleSelectHistoryRevision = (effDate: string) => {
    if (!effDate || !periodInfo) return;
    const cleanDate = effDate.split('T')[0];
    const parts = cleanDate.split('-');
    const ddmmyyyy = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : cleanDate;

    const dateChanges = historyList.filter(h => {
      const hDate = (h.dated || h.Dated || h.effective_date || '').split('T')[0];
      return hDate === cleanDate;
    });

    const loadedNewRates: Record<number, number> = { ...currentRates };
    const loadedOldRates: Record<number, number> = { ...currentRates };

    dateChanges.forEach(dc => {
      const dow = Number(dc.dayofweek !== undefined ? dc.dayofweek : dc.Dayofweek);
      const newVal = Number(dc.new_rate ?? dc.NewRate ?? dc.newrate ?? 0);
      const oldVal = Number(dc.oldrate ?? dc.OldRate ?? 0);

      if (periodInfo.isDaily) {
        if (dow === 0) {
          WEEKDAYS.forEach(w => {
            loadedNewRates[w.id] = newVal;
            if (oldVal > 0) loadedOldRates[w.id] = oldVal;
          });
        } else if (dow >= 1 && dow <= 7) {
          loadedNewRates[dow] = newVal;
          if (oldVal > 0) loadedOldRates[dow] = oldVal;
        }
      } else {
        // Periodical (Fortnightly, Monthly, etc.)
        const slot = periodInfo.periodicity === 'Fortnightly' ? (dow === 2 ? 2 : 1) : 1;
        loadedNewRates[slot] = newVal;
        if (oldVal > 0) loadedOldRates[slot] = oldVal;
      }
    });

    setEffectiveDate(ddmmyyyy);
    setNewRates(loadedNewRates);
    setCurrentRates(loadedOldRates);
    setIsHistoryOpen(false);
    setMsg({ text: `Loaded Revision from ${ddmmyyyy}. You can now edit rates or date, and click Save / Update!` });
    setTimeout(() => setMsg(null), 5000);
  };

  // Delete a revision
  const handleDeleteHistoryRevision = async (effDate: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!effDate || !selectedPub) return;
    const cleanDate = effDate.split('T')[0];
    const confirmDelete = window.confirm(`Are you sure you want to delete rate change revision for date ${cleanDate}?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/rates?publica_id=${selectedPub.publica_id}&effective_date=${cleanDate}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setHistoryList(prev => prev.filter(h => {
          const hDate = (h.dated || h.Dated || h.effective_date || '').split('T')[0];
          return hDate !== cleanDate;
        }));
        setMsg({ text: `Rate change revision for ${cleanDate} deleted successfully.` });
        setTimeout(() => setMsg(null), 3000);
      }
    } catch (err: any) {
      setMsg({ text: `Error deleting: ${err.message}`, isError: true });
    }
  };

  // Save / Update Rate Change
  const handleSaveRateChange = async () => {
    if (!selectedPub || !periodInfo) {
      setMsg({ text: 'Please select a publication first.', isError: true });
      return;
    }

    const effIso = toIso(effectiveDate);
    setIsSaving(true);
    setMsg(null);

    // Map rates to appropriate dayofweek for FoxPro database alignment:
    // Daily: { 1..7 }
    // Fortnightly: Issue 1 -> dayofweek=1 (or 2), Issue 2 -> dayofweek=2
    // Monthly: dayofweek=3
    // Quarterly: dayofweek=4
    // Special: dayofweek=6
    // Weekly: dayofweek=1 (or magzine_day)
    let payloadRates: Record<number, number> = {};
    let payloadOldRates: Record<number, number> = {};

    if (periodInfo.isDaily) {
      payloadRates = { ...newRates };
      payloadOldRates = { ...currentRates };
    } else if (periodInfo.periodicity === 'Fortnightly') {
      // Slot 1 and Slot 2
      payloadRates = {
        1: newRates[1] || newRates[2] || 0,
        2: newRates[2] || newRates[1] || 0
      };
      payloadOldRates = {
        1: currentRates[1] || currentRates[2] || 0,
        2: currentRates[2] || currentRates[1] || 0
      };
    } else {
      // Single issue rate for Monthly (3), Quarterly (4), Special (6), Weekly (1)
      const pRates = rates.filter(r => (r.publica_id || (r as any).Publica_id) === selectedPub.publica_id);
      const targetDow = pRates[0]?.dayofweek || (pRates[0] as any)?.Dayofweek || (
        periodInfo.periodicity === 'Monthly' ? 3 :
        periodInfo.periodicity === 'Quarterly' ? 4 :
        periodInfo.periodicity === 'Special' ? 6 : 1
      );
      const rateVal = newRates[1] || Object.values(newRates)[0] || 0;
      const oldVal = currentRates[1] || Object.values(currentRates)[0] || 0;

      payloadRates[targetDow] = rateVal;
      payloadOldRates[targetDow] = oldVal;
    }

    try {
      const res = await fetch('/api/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publica_id: selectedPub.publica_id,
          is_rate_change: true,
          effective_date: effIso,
          new_rates: payloadRates,
          old_rates: payloadOldRates
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (effIso <= todayIso) {
        setCurrentRates({ ...newRates });
      }

      // Refresh history
      fetchHistory(selectedPub.publica_id);

      if (onSave) {
        onSave(selectedPub.publica_id, payloadRates, effIso);
      }

      setMsg({ text: `✓ Rate change for "${selectedPub.public_name}" effective from ${effectiveDate} saved successfully!` });
    } catch (err: any) {
      setMsg({ text: `Error saving rate change: ${err.message}`, isError: true });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const rows = periodInfo?.rows || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 select-none">
      <div className="d2-window w-[720px] max-w-full bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma text-xs">
        
        {/* Title Bar */}
        <div className="d2-title bg-gradient-to-r from-[#0A246A] to-[#A6CAF0] text-white px-2.5 py-1 font-bold flex justify-between items-center shadow-xs">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-yellow-300" />
            <span>Rate Change Master (अखबार / पत्रिका दर परिवर्तन मास्टर)</span>
          </div>
          <button 
            onClick={onClose} 
            className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Main Body */}
        <div className="p-3 space-y-2.5">
          
          {/* Publication Selector Bar */}
          <div className="bg-white p-2 border border-[#808080] shadow-inner flex flex-wrap items-center gap-2">
            <label className="font-bold text-[#800000] whitespace-nowrap">
              Publication (अखबार / पत्रिका):
            </label>
            <select
              value={selectedPub?.publica_id || ''}
              onChange={(e) => {
                const found = pubList.find(p => p.publica_id === Number(e.target.value));
                if (found) loadPublicationRates(found);
              }}
              className="flex-1 min-w-[200px] px-2 py-0.5 border border-[#7F9DB9] bg-white font-bold text-black text-xs outline-none"
            >
              {pubList.map(p => (
                <option key={p.publica_id} value={p.publica_id}>
                  #{p.publica_id} - {p.public_name} {p.pub_hindi ? `(${p.pub_hindi})` : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="px-2.5 py-1 bg-[#E6F4FE] hover:bg-[#C8E8FA] active:bg-[#BCE4FA] border border-[#006699] text-blue-900 rounded-xs text-[11px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
            >
              <History className="w-3.5 h-3.5" />
              <span>Rate History ({historyList.length})</span>
            </button>
          </div>

          {/* Periodicity & Classification Badge */}
          {periodInfo && (
            <div className="flex items-center justify-between px-3 py-1 bg-blue-50 border border-blue-200 text-blue-950 font-bold text-[11px] rounded-xs shadow-xs">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-blue-800" />
                <span>Classification: <span className="text-blue-900 underline font-black">{periodInfo.label}</span></span>
              </div>
              <span className="text-[10px] text-slate-600 font-normal">
                {periodInfo.isDaily ? '7-Day Weekday Schedule' : `${periodInfo.periodicity} Periodical Schedule`}
              </span>
            </div>
          )}

          {/* Effective Date Row */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 border border-amber-300 rounded-xs text-xs font-bold text-amber-950 shadow-xs">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-900" />
              <span className="text-amber-900">Effective Date (लागू दिनांक):</span>
              <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1.5 py-0.5 shadow-inner">
                <input 
                  type="text" 
                  value={effectiveDate} 
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  onBlur={() => setEffectiveDate(formatDateDisplay(effectiveDate))}
                  placeholder="DD/MM/YYYY"
                  className="w-24 text-center font-mono font-bold text-blue-900 outline-none bg-transparent"
                />
              </div>
              <span className="text-[10.5px] text-amber-800 font-normal">
                (इस दिनांक से नया रेट लागू होगा)
              </span>
            </div>

            {periodInfo?.isDaily && (
              <button 
                type="button"
                onClick={copySundayRate}
                className="px-2.5 py-0.5 bg-[#FFF4C8] hover:bg-[#FFE99A] border border-[#CCA000] text-black text-[11px] font-bold shadow-xs cursor-pointer rounded-xs"
                title="Press F1 to copy Sunday new rate to Monday through Saturday"
              >
                Press F1: Copy Sunday Rate
              </button>
            )}
          </div>

          {/* Rate Grid: Smart Daily vs Magazine/Periodical */}
          <div className="bg-white border border-[#808080] shadow-sm">
            <div className="bg-[#ECE9D8] text-center font-bold text-xs py-1 border-b border-[#808080] text-[#000080] flex items-center justify-between px-3">
              <span>{periodInfo?.isDaily ? 'Weekdays Rate (दर विवरण)' : `Periodical Rate (${periodInfo?.periodicity || 'Magazine'})`}</span>
              <span className="text-[10px] text-slate-600">Enter New Rate(s)</span>
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#ECE9D8] border-b border-[#808080]">
                  <th className="p-1.5 border-r text-left w-12 text-center">#</th>
                  <th className="p-1.5 border-r text-left">
                    {periodInfo?.isDaily ? 'Weekday (दिन)' : 'Issue / Frequency (अंक / आवृति)'}
                  </th>
                  <th className="p-1.5 border-r text-center w-28 text-slate-700 bg-slate-50">Current Rate (₹)</th>
                  <th className="p-1.5 text-center w-36 text-emerald-900 bg-emerald-50">New Rate (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.id} className="border-b border-slate-200 hover:bg-blue-50/60">
                    <td className="p-1.5 border-r text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="p-1.5 border-r font-bold text-slate-900">
                      <div>{r.label}</div>
                      {r.sub && <div className="text-[10px] text-slate-500 font-normal">{r.sub}</div>}
                    </td>
                    <td className="p-1.5 border-r text-center font-mono font-bold text-slate-600 bg-slate-50/50">
                      ₹{((currentRates[r.id] ?? 0)).toFixed(2)}
                    </td>
                    <td className="p-1 text-center bg-emerald-50/30">
                      <div className="flex items-center justify-center">
                        <span className="text-emerald-800 font-bold mr-1">₹</span>
                        <input 
                          type="number"
                          step="0.25"
                          value={newRates[r.id] ? newRates[r.id] : (newRates[r.id] === 0 ? '0' : '')}
                          placeholder="0.00"
                          onChange={(e) => setNewRates({ ...newRates, [r.id]: parseFloat(e.target.value) || 0 })}
                          className="w-24 text-center text-xs font-mono font-bold outline-none bg-white border border-emerald-500 text-emerald-950 py-0.5 shadow-inner focus:bg-yellow-50"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Feedback Message */}
          {msg && (
            <div className={`p-1.5 text-center text-xs font-bold rounded-xs ${
              msg.isError 
                ? 'bg-red-100 text-red-800 border border-red-300' 
                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
            }`}>
              {msg.text}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#808080]">
            <button
              type="button"
              onClick={handleSaveRateChange}
              disabled={isSaving}
              className="px-5 py-1.5 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] border border-[#006699] font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>💾</span>
              <span><u>S</u>ave / Update Rate Change</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-[#808080] font-bold text-xs shadow-xs cursor-pointer"
            >
              Cancel / Close
            </button>
          </div>
        </div>

        {/* Rate Change History Modal Dialog */}
        {isHistoryOpen && selectedPub && (
          <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-3">
            <div className="d2-window w-[620px] max-h-[480px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma text-xs">
              <div className="d2-title bg-[#0A246A] text-white px-2.5 py-1 font-bold flex justify-between items-center shadow-xs">
                <span>📜 Rate Change History - {selectedPub.public_name} (#{selectedPub.publica_id})</span>
                <button onClick={() => setIsHistoryOpen(false)} className="text-white hover:text-red-300 font-bold cursor-pointer">✕</button>
              </div>

              <div className="p-2.5 space-y-2 flex-1 overflow-hidden flex flex-col">
                <div className="bg-white p-2 border border-slate-300 text-xs text-blue-900 font-bold flex justify-between items-center">
                  <span>Publication: #{selectedPub.publica_id} - {selectedPub.public_name} ({periodInfo?.periodicity || 'Magazine'})</span>
                  <span className="text-slate-600 font-normal">Recorded Changes: {historyList.length}</span>
                </div>

                <div className="flex-1 bg-white border border-slate-400 overflow-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#ECE9D8] border-b border-slate-400">
                      <tr>
                        <th className="p-1 border-r text-center w-10">#</th>
                        <th className="p-1 border-r text-left">Effective Date (दिनांक)</th>
                        <th className="p-1 border-r text-left">
                          {periodInfo?.isDaily ? 'Day / Weekday (दिन)' : 'Issue / Frequency'}
                        </th>
                        <th className="p-1 border-r text-right w-20">Old Rate (₹)</th>
                        <th className="p-1 border-r text-right w-20 text-emerald-800">New Rate (₹)</th>
                        <th className="p-1 text-center w-24">Action (कार्य)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingHistory ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-500 font-bold">
                            Loading rate change history...
                          </td>
                        </tr>
                      ) : historyList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-500 font-bold">
                            No previous rate change revisions found for this publication.
                          </td>
                        </tr>
                      ) : (
                        historyList.map((h, idx) => {
                          const dayNum = h.dayofweek !== undefined ? h.dayofweek : h.Dayofweek;
                          let dayLabel = '';
                          if (periodInfo?.isDaily) {
                            const dayObj = WEEKDAYS.find(w => w.id === dayNum);
                            dayLabel = dayNum === 0 ? 'All Days (सभी दिन)' : (dayObj ? `${dayObj.name} (${dayObj.hindi})` : `Day ${dayNum}`);
                          } else if (periodInfo?.periodicity === 'Fortnightly') {
                            dayLabel = dayNum === 2 ? 'Issue 2 (16th-End)' : 'Issue 1 (1st-15th)';
                          } else {
                            dayLabel = `${periodInfo?.periodicity || 'Monthly'} Issue`;
                          }

                          const effDate = (h.dated || h.Dated || h.effective_date || '').split('T')[0];
                          const oldVal = Number(h.oldrate ?? h.OldRate ?? 0);
                          const newVal = Number(h.new_rate ?? h.NewRate ?? 0);

                          return (
                            <tr 
                              key={idx} 
                              onClick={() => handleSelectHistoryRevision(effDate)}
                              title="Click row to edit this rate change revision"
                              className="border-b border-slate-200 hover:bg-blue-100/70 cursor-pointer transition-colors"
                            >
                              <td className="p-1 border-r text-center font-mono text-slate-500">{idx + 1}</td>
                              <td className="p-1 border-r font-mono font-bold text-blue-900">{effDate}</td>
                              <td className="p-1 border-r font-bold text-slate-700">{dayLabel}</td>
                              <td className="p-1 border-r text-right font-mono text-slate-500">₹{oldVal.toFixed(2)}</td>
                              <td className="p-1 border-r text-right font-mono font-bold text-emerald-700 bg-emerald-50/50">₹{newVal.toFixed(2)}</td>
                              <td className="p-1 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectHistoryRevision(effDate)}
                                    className="px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-400 rounded-xs text-[10px] font-bold cursor-pointer"
                                    title="Edit / Correct this rate change"
                                  >
                                    ✏️ Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteHistoryRevision(effDate, e)}
                                    className="px-1.5 py-0.5 bg-red-100 hover:bg-red-200 text-red-900 border border-red-400 rounded-xs text-[10px] font-bold cursor-pointer"
                                    title="Delete this revision"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-2 border-t bg-[#ECE9D8] flex justify-end">
                <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="px-4 py-1 bg-white border border-[#808080] font-bold text-xs cursor-pointer hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
