'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, FileCheck2 } from 'lucide-react';
import { Publisher, Publication } from '@/lib/types';

// Transaction > Purchase > कच्चा बिल: a daily diary of copies received from a publisher.
// Pick the publisher and the day, enter each paper's copies (F1 / double-click adds a line, F2 removes
// the bottom one) and save the day. The month's diary shows below, day by day, with each paper's total.
// "पक्का बिल बनाएँ" fills the Purchase tab with the month's copies not yet billed; once that bill is saved,
// those days are marked with it. The diary never counts in the Purchase reports.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HINDI_DAYS = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];

interface Line { key: number; publica_id: number; qty: string; note: string }

export interface PakkaLine { publica_id: number; day: string; qty: number }

interface Props {
  publishers: Publisher[];
  papersOf: (publishId: string) => Publication[];
  pubName: (id: unknown) => string;
  isNewspaper: (id: unknown) => boolean;
  onMakePakka: (publishId: string, month: string, lines: PakkaLine[]) => void;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayIndex = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay() : -1;
};
const dmy = (iso: string) => String(iso || '').slice(0, 10).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');

export default function KachaBillTab({ publishers, papersOf, pubName, isNewspaper, onMakePakka }: Props) {
  const [publishId, setPublishId] = useState('');
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState<Line[]>([]);
  const [monthRows, setMonthRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const month = date.slice(0, 7);
  const papers = useMemo(() => papersOf(publishId), [papersOf, publishId]);

  const loadMonth = async (keepLines = false) => {
    if (!publishId || !/^\d{4}-\d{2}$/.test(month)) { setMonthRows([]); return; }
    try {
      const res = await fetch(`/api/purchases/kacha?publish_id=${publishId}&month=${month}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load');
      setMonthRows(json.rows || []);
      if (!keepLines) {
        // The chosen day's entries not yet billed come back into the entry lines
        setLines((json.rows || []).filter((r: any) => String(r.entry_date).slice(0, 10) === date && !r.purchase_id)
          .map((r: any, i: number) => ({ key: Date.now() + i, publica_id: Number(r.publica_id), qty: String(r.qty), note: r.note || '' })));
      }
    } catch (err: any) {
      setMonthRows([]);
      setMessage({ text: err.message || String(err), good: false });
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setMessage(null); loadMonth(); }, [publishId, date]);

  const addLine = () => {
    if (!publishId) return;
    const used = new Set(lines.map(l => l.publica_id));
    const next = papers.find(p => !used.has(Number(p.publica_id))) || papers[0];
    setLines(ls => [...ls, { key: Date.now(), publica_id: Number(next?.publica_id) || 0, qty: '', note: '' }]);
  };
  const removeLastLine = () => setLines(ls => ls.slice(0, -1));
  const setLine = (key: number, change: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...change } : l)));

  // F1 adds a line, F2 removes the bottom line
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); addLine(); }
      if (e.key === 'F2') { e.preventDefault(); removeLastLine(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const saveDay = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const dow = dayIndex(date);
      const res = await fetch('/api/purchases/kacha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publish_id: Number(publishId), entry_date: date,
          lines: lines.map(l => ({ publica_id: l.publica_id, qty: Number(l.qty), note: l.note, day: isNewspaper(l.publica_id) && dow >= 0 ? DAYS[dow] : null }))
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setMessage({ text: `${dmy(date)} की डायरी सेव हो गई (${json.saved} लाइन)`, good: true });
      loadMonth(true);
    } catch (err: any) {
      setMessage({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  // The month: one row per day, one column per paper
  const monthPapers = Array.from(new Set(monthRows.map(r => Number(r.publica_id))));
  const dates = Array.from(new Set(monthRows.map(r => String(r.entry_date).slice(0, 10)))).sort();
  const qtyOn = (d: string, pub: number) => monthRows.filter(r => String(r.entry_date).slice(0, 10) === d && Number(r.publica_id) === pub)
    .reduce((s, r) => s + Number(r.qty || 0), 0);
  const billedOn = (d: string) => monthRows.filter(r => String(r.entry_date).slice(0, 10) === d && r.purchase_id).map(r => r.purchase_id);
  const open = monthRows.filter(r => !r.purchase_id);
  const totalOf = (pub: number, rows = monthRows) => rows.filter(r => Number(r.publica_id) === pub).reduce((s, r) => s + Number(r.qty || 0), 0);

  // Month's copies not yet billed, for the real bill: a newspaper by day of week, a magazine as one line
  const makePakka = () => {
    const sums = new Map<string, PakkaLine>();
    for (const r of open) {
      const day = isNewspaper(r.publica_id) ? (r.day || DAYS[dayIndex(String(r.entry_date).slice(0, 10))] || '') : '';
      const k = `${r.publica_id}|${day}`;
      const s = sums.get(k) || { publica_id: Number(r.publica_id), day, qty: 0 };
      s.qty += Number(r.qty || 0);
      sums.set(k, s);
    }
    const ordered = Array.from(sums.values()).sort((a, b) =>
      pubName(a.publica_id).localeCompare(pubName(b.publica_id)) || DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
    onMakePakka(publishId, month, ordered);
  };

  const sortedPublishers = [...publishers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const dow = dayIndex(date);

  return (
    <div className="flex-1 flex flex-col gap-2 overflow-hidden">
      <div className="bg-white p-3 vb-box-inset grid grid-cols-3 max-md:grid-cols-1 gap-3 text-sm">
        <label className="block">
          <span className="block font-bold text-slate-800 mb-1">Publisher</span>
          <select value={publishId} onChange={e => setPublishId(e.target.value)} className="vb-input w-full bg-white font-bold text-sm">
            <option value="">— चुनें —</option>
            {sortedPublishers.map(p => <option key={p.publish_id} value={p.publish_id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block font-bold text-slate-800 mb-1">तारीख <span className="font-normal text-slate-600">({dow >= 0 ? HINDI_DAYS[dow] : '-'})</span></span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="vb-input w-full font-bold text-sm" />
        </label>
        <div className="flex items-end text-xs text-slate-600">
          यह डायरी Purchase रिपोर्ट में नहीं गिनी जाती। असली बिल आने पर &quot;पक्का बिल बनाएँ&quot; दबाएँ।
        </div>
      </div>

      {/* The chosen day's copies */}
      <div
        className="bg-white vb-grid overflow-auto max-h-[170px] min-h-[110px]"
        title="F1 या डबल-क्लिक: नई लाइन · F2: नीचे की लाइन हटाएँ"
        onDoubleClick={e => { if (!(e.target as HTMLElement).closest('input,select,button')) addLine(); }}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-[#D4D0C8] text-[13px]">
            <tr>
              <th className="p-1.5 border border-slate-400 w-10">#</th>
              <th className="p-1.5 border border-slate-400 text-left">पेपर</th>
              <th className="p-1.5 border border-slate-400 text-right w-28">आई कॉपी (Qty)</th>
              <th className="p-1.5 border border-slate-400 text-left">नोट</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="border-b border-slate-200">
                <td className="p-1 text-center text-slate-600">{i + 1}</td>
                <td className="p-1">
                  <select value={l.publica_id} onChange={e => setLine(l.key, { publica_id: Number(e.target.value) })} className="w-full p-1 border border-slate-300 bg-white font-bold text-sm">
                    {!papers.some(p => Number(p.publica_id) === l.publica_id) && <option value={l.publica_id}>{pubName(l.publica_id)}</option>}
                    {papers.map(p => <option key={p.publica_id} value={p.publica_id}>{pubName(p.publica_id)}</option>)}
                  </select>
                </td>
                <td className="p-1 text-right">
                  <input type="number" min="0" value={l.qty} onChange={e => setLine(l.key, { qty: e.target.value })} className="w-24 p-1 text-right font-mono font-bold border border-slate-300" />
                </td>
                <td className="p-1">
                  <input value={l.note} onChange={e => setLine(l.key, { note: e.target.value })} placeholder="जैसे: 5 कम आए, वापसी..." className="w-full p-1 border border-slate-300 text-sm" />
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-slate-500">Publisher चुनें, फिर F1 दबाएँ या यहाँ डबल-क्लिक करें (F2: नीचे की लाइन हटाएँ)</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={addLine} disabled={!publishId} className="vb-btn bg-white hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1 cursor-pointer px-3 py-1.5 font-bold text-sm">
            <Plus className="w-4 h-4 text-emerald-600" /> पेपर जोड़ें (F1)
          </button>
          <button onClick={removeLastLine} disabled={lines.length === 0} className="vb-btn bg-white hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1 cursor-pointer px-3 py-1.5 font-bold text-sm">
            <Trash2 className="w-4 h-4 text-red-600" /> नीचे की लाइन हटाएँ (F2)
          </button>
        </div>
        <button onClick={saveDay} disabled={busy || !publishId} className="vb-btn bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-1 cursor-pointer px-4 py-1.5 font-bold text-sm">
          <Save className="w-4 h-4" /> {busy ? 'रुकिए...' : `${dmy(date)} की डायरी सेव करें`}
        </button>
      </div>

      {message && (
        <div className={`text-sm font-bold px-3 py-1.5 border ${message.good ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-red-50 border-red-400 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* The month, day by day */}
      <div className="flex-1 bg-white vb-grid overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0 bg-[#D4D0C8]">
            <tr>
              <th className="p-1.5 border border-slate-400 text-left whitespace-nowrap">दिनांक</th>
              {monthPapers.map(p => <th key={p} className="p-1.5 border border-slate-400 text-right">{pubName(p)}</th>)}
              <th className="p-1.5 border border-slate-400 text-left">स्थिति</th>
            </tr>
          </thead>
          <tbody>
            {dates.map(d => {
              const billed = billedOn(d);
              return (
                <tr key={d} onClick={() => setDate(d)} className={`border-b border-slate-200 cursor-pointer hover:bg-yellow-50 ${d === date ? 'bg-blue-50' : ''} ${billed.length ? 'text-slate-500' : ''}`}>
                  <td className="p-1.5 font-mono whitespace-nowrap">{dmy(d)} <span className="text-slate-500">{HINDI_DAYS[dayIndex(d)]}</span></td>
                  {monthPapers.map(p => <td key={p} className="p-1.5 text-right font-mono font-bold">{qtyOn(d, p) || ''}</td>)}
                  <td className="p-1.5">{billed.length ? `पक्का बिल #${Array.from(new Set(billed)).join(', ')}` : 'कच्चा'}</td>
                </tr>
              );
            })}
            {dates.length === 0 && (
              <tr><td colSpan={monthPapers.length + 2} className="p-4 text-center text-slate-500">{publishId ? 'इस महीने की कोई डायरी नहीं' : 'Publisher चुनें'}</td></tr>
            )}
            {dates.length > 0 && (
              <tr className="border-t-2 border-black font-black bg-slate-100">
                <td className="p-1.5">कुल (बाकी कच्चा)</td>
                {monthPapers.map(p => <td key={p} className="p-1.5 text-right font-mono">{totalOf(p, open)}</td>)}
                <td className="p-1.5 font-normal text-slate-600">पूरे महीने: {monthPapers.map(p => totalOf(p)).reduce((a, b) => a + b, 0)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button onClick={makePakka} disabled={open.length === 0} title="इस महीने की बाकी कच्ची कॉपियों से असली बिल भरें"
          className="vb-btn bg-[#0A246A] hover:bg-[#1B3D8F] disabled:opacity-50 text-white flex items-center gap-1 cursor-pointer px-4 py-1.5 font-bold text-sm">
          <FileCheck2 className="w-4 h-4" /> पक्का बिल बनाएँ ({month})
        </button>
      </div>
    </div>
  );
}
