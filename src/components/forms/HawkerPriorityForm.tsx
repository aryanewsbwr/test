'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Save } from 'lucide-react';

// Transaction > Hawker's Customer Priority: choose a hawker, see every customer he brings a running
// paper to in delivery order, move them up or down (or type the place), and save the new order.

interface HawkerPriorityFormProps {
  onClose: () => void;
}

interface Row { customer_id: number; name: string; name_eng: string; priority: number; papers: string }

export default function HawkerPriorityForm({ onClose }: HawkerPriorityFormProps) {
  const [hawkers, setHawkers] = useState<any[]>([]);
  const [selectedHawker, setSelectedHawker] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/hawkers').then(r => r.json()).then(d => {
      const list = (d.hawkers || []).filter((h: any) => h.name)
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' }));
      setHawkers(list);
    }).catch(() => {});
  }, []);

  const load = async (hid: string) => {
    setRows([]); setChanged(false); setMsg(null); setPicked(null);
    if (!hid) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/priority?hawker_id=${hid}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load');
      setRows(json.customers || []);
    } catch (err: any) {
      setMsg({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(selectedHawker); }, [selectedHawker]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const list = [...rows];
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    setRows(list); setChanged(true); setPicked(to);
  };

  // Up / Down arrow keys move the picked customer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (picked === null || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); move(picked, picked - 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(picked, picked + 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/customers/priority', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hawker_id: Number(selectedHawker), customer_ids: rows.map(r => r.customer_id) })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setMsg({ text: `क्रम सेव हो गया (${json.changed} ग्राहकों का नंबर बदला)`, good: true });
      await load(selectedHawker);
    } catch (err: any) {
      setMsg({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d2-window relative w-[760px] max-w-[96vw] h-[600px] max-h-[92vh] bg-white border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden">
      <div className="d2-title bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 flex items-center justify-between">
        <span className="font-bold text-xs text-[#000080]">Hawker&apos;s Customer Priority (हॉकर का डिलीवरी क्रम)</span>
        <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
      </div>

      <div className="flex-1 bg-white p-3 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-xs">
            <span className="font-bold text-[#800000]">Hawker</span>
            <select value={selectedHawker} onChange={e => { if (!changed || confirm('बदला हुआ क्रम सेव नहीं हुआ। छोड़ दें?')) setSelectedHawker(e.target.value); }}
              className="px-2 py-1 border border-[#808080] bg-white font-bold text-xs outline-none min-w-[220px]">
              <option value="">— हॉकर चुनें —</option>
              {hawkers.map(h => <option key={h.hawker_id} value={h.hawker_id}>{h.name}</option>)}
            </select>
          </label>
          <span className="text-xs text-slate-600 font-bold">{busy ? 'रुकिए…' : `${rows.length} ग्राहक · लाइन चुनकर ↑ ↓ से खिसकाएँ`}</span>
        </div>

        <div className="flex-1 border border-[#808080] overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[#ECE9D8] border-b">
              <tr>
                <th className="p-1 border-r w-14 text-center">क्रम</th>
                <th className="p-1 border-r w-16 text-center">ID</th>
                <th className="p-1 border-r text-left">ग्राहक</th>
                <th className="p-1 border-r text-left">अखबार</th>
                <th className="p-1 border-r w-16 text-center">Priority</th>
                <th className="p-1 w-24 text-center">ऊपर / नीचे</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.customer_id} onClick={() => setPicked(i)} className={`border-b cursor-pointer ${picked === i ? 'bg-yellow-100' : 'hover:bg-blue-50'}`}>
                  <td className="p-1 border-r text-center">
                    <input type="number" min={1} max={rows.length} defaultValue={i + 1} key={`${c.customer_id}-${i}`}
                      onBlur={e => move(i, Math.min(rows.length, Math.max(1, Number(e.target.value) || i + 1)) - 1)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-12 text-center border border-slate-300 font-mono" title="नया क्रम लिखकर Enter" />
                  </td>
                  <td className="p-1 border-r text-center font-mono">{c.customer_id}</td>
                  <td className="p-1 border-r font-bold">{c.name}{c.name_eng && c.name_eng !== c.name && <span className="font-normal text-slate-500"> · {c.name_eng}</span>}</td>
                  <td className="p-1 border-r text-slate-700">{c.papers}</td>
                  <td className="p-1 border-r text-center font-mono text-slate-500">{c.priority}</td>
                  <td className="p-1 text-center">
                    <button onClick={e => { e.stopPropagation(); move(i, i - 1); }} disabled={i === 0} className="px-1.5 py-0.5 border border-slate-400 bg-white disabled:opacity-30 mr-1" aria-label="ऊपर"><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={e => { e.stopPropagation(); move(i, i + 1); }} disabled={i === rows.length - 1} className="px-1.5 py-0.5 border border-slate-400 bg-white disabled:opacity-30" aria-label="नीचे"><ArrowDown className="w-3 h-3" /></button>
                  </td>
                </tr>
              ))}
              {!busy && selectedHawker && rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">इस हॉकर के पास अभी कोई चालू ग्राहक नहीं</td></tr>}
              {!selectedHawker && <tr><td colSpan={6} className="p-6 text-center text-slate-500">ऊपर से हॉकर चुनें</td></tr>}
            </tbody>
          </table>
        </div>

        {msg && <div className={`text-xs font-bold px-2 py-1 border ${msg.good ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-red-50 border-red-400 text-red-800'}`}>{msg.text}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={save} disabled={busy || !changed} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 cursor-pointer">
            <Save className="w-3.5 h-3.5" /> क्रम सेव करें
          </button>
          <button onClick={onClose} className="px-4 py-1.5 border border-[#808080] bg-[#ECE9D8] font-bold text-xs cursor-pointer">बंद करें</button>
        </div>
      </div>
    </div>
  );
}
