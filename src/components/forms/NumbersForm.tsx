'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Region } from '@/lib/types';
import { displayPhones, normalizePhones } from '@/lib/phoneNumbers';

interface NumbersFormProps {
  onClose: () => void;
  regions?: Region[];
}

// A region can hold thousands of customers, so only this many rows are drawn at once
const MAX_ROWS = 500;

// Bills fall back to a number written in the address when the customer has none saved
const numberInAddress = (c: any): string => {
  const match = `${c.hindi_add || ''} ${c.add1 || ''} ${c.add2 || ''}`.match(/\b[6-9]\d{9}\b/);
  return match ? match[0] : '';
};

const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function NumbersForm({ onClose, regions = [] }: NumbersFormProps) {
  const [regionId, setRegionId] = useState('');
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyNotSetUp, setHistoryNotSetUp] = useState(false);

  const sortedRegions = useMemo(
    () => [...regions].sort((a: any, b: any) => String(a.region_name || a.name || '').localeCompare(String(b.region_name || b.name || ''))),
    [regions]
  );

  const regionNames = useMemo(
    () => new Map(regions.map((r: any) => [Number(r.region_id), String(r.region_name || r.name || '')])),
    [regions]
  );

  // A region loads whole and is searched on screen; with no region, search looks through everyone
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        if (regionId) {
          const rows: any[] = [];
          for (let page = 1; ; page++) {
            const res = await fetch(`/api/customers?region_id=${regionId}&limit=1000&page=${page}&order=asc`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not load customers');
            rows.push(...(data.customers || []));
            if (cancelled) return;
            if (page >= (data.totalPages || 1)) break;
          }
          setCustomers(rows);
        } else if (search.trim().length >= 2) {
          const res = await fetch(`/api/customers?search=${encodeURIComponent(search.trim())}&limit=200&order=asc`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not load customers');
          if (!cancelled) setCustomers(data.customers || []);
        } else {
          setCustomers([]);
        }
      } catch (err: any) {
        if (!cancelled) setMsg({ text: err.message, bad: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const timer = setTimeout(load, regionId ? 0 : 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [regionId, regionId ? '' : search]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = async (forRegion: string) => {
    try {
      const res = await fetch(`/api/customers/numbers${forRegion ? `?region_id=${forRegion}` : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load history');
      setHistory(data.history || []);
      setHistoryNotSetUp(Boolean(data.not_set_up));
    } catch (err: any) {
      setMsg({ text: err.message, bad: true });
    }
  };

  useEffect(() => {
    if (showHistory) loadHistory(regionId);
  }, [showHistory, regionId]);

  const needle = search.trim().toLowerCase();
  const matches = (c: any) => !needle
    || String(c.customer_id).includes(needle)
    || String(c.name_eng || '').toLowerCase().includes(needle)
    || String(c.name_hindi || '').includes(search.trim())
    || String(c.phone || '').includes(needle)
    || `${c.add1 || ''} ${c.hindi_add || ''}`.toLowerCase().includes(needle);

  const filtered = useMemo(
    () => customers.filter(c => (!regionId || matches(c)) && (!onlyMissing || !String(c.phone || '').trim())),
    [customers, regionId, needle, onlyMissing] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shown = filtered.slice(0, MAX_ROWS);

  const shownHistory = history.filter(h => !needle
    || String(h.customer_id).includes(needle)
    || String(h.customer_name || '').toLowerCase().includes(needle)
    || String(h.old_phone || '').includes(needle)
    || String(h.new_phone || '').includes(needle));

  // Only rows whose number really differs count as changed
  const pending = Object.entries(edits)
    .map(([id, value]) => ({ id: Number(id), value, customer: customers.find(c => c.customer_id === Number(id)) }))
    .filter(e => e.customer)
    .map(e => {
      const stored = String(e.customer.phone || '').trim();
      const normalized = normalizePhones(e.value);
      return { ...e, stored, normalized, changed: e.value.trim() !== displayPhones(stored) && normalized !== stored };
    })
    .filter(e => e.changed);
  const invalidIds = new Set(pending.filter(e => e.normalized === null).map(e => e.id));

  const handleRegion = (value: string) => {
    if (pending.length > 0 && !window.confirm(`${pending.length} changed numbers are not applied yet. Leave without saving them?`)) return;
    setEdits({});
    setCustomers([]);
    setRegionId(value);
  };

  const handleApply = async () => {
    if (invalidIds.size > 0) {
      setMsg({ text: `${invalidIds.size} number(s) in red are not valid. A mobile number has 10 digits.`, bad: true });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/customers/numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: pending.map(e => ({ customer_id: e.id, phone: e.value, old_phone: e.stored })) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the numbers');

      const saved: Record<number, string> = data.saved || {};
      setCustomers(prev => prev.map(c => (saved[c.customer_id] !== undefined ? { ...c, phone: saved[c.customer_id] } : c)));
      setEdits(prev => {
        const next = { ...prev };
        Object.keys(saved).forEach(id => delete next[Number(id)]);
        return next;
      });

      const problems: string[] = [];
      if (data.changed_elsewhere?.length) problems.push(`${data.changed_elsewhere.length} changed by someone else, reload to see them (${data.changed_elsewhere.join(', ')})`);
      if (data.failed?.length) problems.push(`${data.failed.length} not saved (${data.failed.join(', ')})`);
      setMsg({ text: [`${Object.keys(saved).length} number(s) changed.`, ...problems].join(' '), bad: problems.length > 0 });
      if (showHistory) loadHistory(regionId);
    } catch (err: any) {
      setMsg({ text: err.message, bad: true });
    } finally {
      setSaving(false);
    }
  };

  // Enter moves down the list, so a run of numbers can be typed without the mouse
  const focusNextRow = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    (document.querySelector(`input[data-number-row="${index + 1}"]`) as HTMLInputElement | null)?.focus();
  };

  return (
    <div className="d2-window relative w-full max-w-[1000px] self-stretch min-h-0 bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma overflow-hidden">
      <div className="d2-title shrink-0 bg-gradient-to-r from-[#0A246A] to-[#A6CAF0] px-2 py-1 flex items-center justify-between">
        <span className="font-bold text-sm text-white">Customer Numbers</span>
        <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-2 p-2 border-b border-[#808080] text-sm">
        <label className="font-bold text-[#800000]">Region</label>
        <select
          value={regionId}
          onChange={(e) => handleRegion(e.target.value)}
          className="px-2 py-1 border border-[#7F9DB9] bg-white font-bold text-black outline-none max-w-[220px]"
        >
          <option value="">-- All Regions (search below) --</option>
          {sortedRegions.map((r: any) => (
            <option key={r.region_id} value={r.region_id}>{r.region_name || r.name}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, ID or number"
          className="flex-1 min-w-[160px] px-2 py-1 border border-[#7F9DB9] bg-white font-bold text-black placeholder:text-slate-600 outline-none"
        />
        <label className="flex items-center gap-1 font-bold text-black cursor-pointer">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          No number only
        </label>
      </div>

      <div className="flex-1 min-h-0 bg-white m-2 border border-[#808080] overflow-auto">
        {showHistory ? (
          <table className="w-full text-sm text-black">
            <thead className="sticky top-0 z-10 bg-[#ECE9D8] border-b">
              <tr>
                <th className="p-1.5 border-r text-left w-44">Date & Time</th>
                <th className="p-1.5 border-r text-center w-20">Cust ID</th>
                <th className="p-1.5 border-r text-left">Customer</th>
                <th className="p-1.5 border-r text-left">Old Number</th>
                <th className="p-1.5 border-r text-left">New Number</th>
                <th className="p-1.5 text-left w-24">Changed By</th>
              </tr>
            </thead>
            <tbody>
              {shownHistory.map(h => (
                <tr key={h.id} className="border-b hover:bg-blue-50">
                  <td className="p-1.5 border-r font-semibold">{formatWhen(h.changed_at)}</td>
                  <td className="p-1.5 border-r text-center font-bold text-blue-900">#{h.customer_id}</td>
                  <td className="p-1.5 border-r font-bold">{h.customer_name}</td>
                  <td className="p-1.5 border-r font-semibold text-slate-700">{displayPhones(h.old_phone) || '(no number)'}</td>
                  <td className="p-1.5 border-r font-bold">{displayPhones(h.new_phone) || '(removed)'}</td>
                  <td className="p-1.5 font-semibold">{h.changed_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm text-black">
            <thead className="sticky top-0 z-10 bg-[#ECE9D8] border-b">
              <tr>
                <th className="p-1.5 border-r text-center w-20">Cust ID</th>
                <th className="p-1.5 border-r text-left">Customer</th>
                <th className="p-1.5 border-r text-left w-48">Region</th>
                <th className="p-1.5 text-left w-56">Number</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c, index) => {
                const addressNumber = numberInAddress(c);
                const value = edits[c.customer_id] ?? displayPhones(c.phone);
                const isChanged = pending.some(e => e.id === c.customer_id);
                return (
                  <tr key={c.customer_id} className={`border-b ${isChanged ? 'bg-amber-100' : 'hover:bg-blue-50'}`}>
                    <td className="p-1.5 border-r text-center font-bold text-blue-900">#{c.customer_id}</td>
                    <td className="p-1.5 border-r">
                      <div className="font-bold">{c.name_eng}</div>
                      {c.name_hindi && <div className="text-[13px] font-semibold text-slate-800">{c.name_hindi}</div>}
                    </td>
                    <td className="p-1.5 border-r font-bold">{regionNames.get(Number(c.region_id)) || `Region #${c.region_id}`}</td>
                    <td className="p-1">
                      <input
                        type="text"
                        inputMode="tel"
                        data-number-row={index}
                        value={value}
                        placeholder={addressNumber ? `In address: ${addressNumber}` : 'No number'}
                        onChange={(e) => setEdits(prev => ({ ...prev, [c.customer_id]: e.target.value }))}
                        onKeyDown={(e) => focusNextRow(e, index)}
                        className={`w-full px-2 py-1 text-base font-bold placeholder:text-sm placeholder:font-semibold placeholder:text-slate-500 outline-none border focus:border-2 focus:border-[#0A246A] ${invalidIds.has(c.customer_id) ? 'border-red-600 bg-red-50 text-red-800' : 'border-[#7F9DB9] bg-white text-black'}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!showHistory && shown.length === 0 && (
          <div className="p-6 text-center text-sm font-bold text-slate-700">
            {loading ? 'Loading customers...' : (regionId || needle.length >= 2) ? 'No customers found.' : 'Select a region, or search for a customer.'}
          </div>
        )}
        {showHistory && shownHistory.length === 0 && (
          <div className="p-6 text-center text-sm font-bold text-slate-700">
            {historyNotSetUp ? 'History is not set up yet. Run supabase/phone_history.sql in Supabase.' : 'No number changes yet.'}
          </div>
        )}
      </div>

      {msg && (
        <div className={`shrink-0 mx-2 mb-1 px-2 py-1 text-center text-sm font-bold border ${msg.bad ? 'text-red-800 bg-red-50 border-red-300' : 'text-emerald-800 bg-emerald-50 border-emerald-300'}`}>
          {msg.text}
        </div>
      )}

      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-sm">
        <span className="text-black font-bold">
          {showHistory
            ? `${shownHistory.length} change(s), newest first`
            : `${filtered.length} customer(s)${filtered.length > MAX_ROWS ? `, first ${MAX_ROWS} shown, search to find others` : ''}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-1 bg-white hover:bg-blue-50 text-blue-900 border border-slate-400 font-bold cursor-pointer"
          >
            {showHistory ? 'Back to Numbers' : 'History'}
          </button>
          <button
            onClick={handleApply}
            disabled={saving || pending.length === 0}
            className="px-4 py-1 bg-[#0A246A] hover:bg-[#316AC5] disabled:opacity-40 disabled:cursor-not-allowed text-white border border-black font-bold cursor-pointer"
          >
            {saving ? 'Applying...' : `Apply${pending.length > 0 ? ` (${pending.length})` : ''}`}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-white hover:bg-red-50 text-red-800 border border-slate-300 font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
