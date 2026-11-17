'use client';

import React, { useState, useEffect } from 'react';

// Transaction > Apply Customer Agent: puts a collection agent on the customers of a region
// (optionally only customer numbers From .. To). "No agent" takes the agent off again.
// Before applying, the screen shows how many customers it will change and who they are with now.

interface ApplyCustomerAgentFormProps {
  onClose: () => void;
}

export default function ApplyCustomerAgentForm({ onClose }: ApplyCustomerAgentFormProps) {
  const [agents, setAgents] = useState<{ collect_id: number; name: string }[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [regions, setRegions] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [fromCustId, setFromCustId] = useState('');
  const [toCustId, setToCustId] = useState('');
  const [preview, setPreview] = useState<{ total: number; by_agent: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/regions').then(r => r.json()).then(d => setRegions((d.regions || [])
      .sort((a: any, b: any) => String(a.region_name || a.name).localeCompare(String(b.region_name || b.name), undefined, { numeric: true, sensitivity: 'base' })))).catch(() => {});
    fetch('/api/collection-agents').then(r => r.json()).then(d => setAgents((d.agents || []).filter((a: any) => a.name)
      .sort((a: any, b: any) => a.name.localeCompare(b.name)))).catch(() => {});
  }, []);

  const agentName = (id: string | number) => (Number(id) === -1 ? 'कोई Agent नहीं' : agents.find(a => a.collect_id === Number(id))?.name || `#${id}`);

  // How many customers the choice covers, and who they are with now
  useEffect(() => {
    setPreview(null);
    if (!selectedRegion) return;
    const q = new URLSearchParams({ region_id: selectedRegion });
    if (fromCustId) q.set('from', fromCustId);
    if (toCustId) q.set('to', toCustId);
    const t = setTimeout(() => {
      fetch(`/api/customers/agent?${q.toString()}`, { cache: 'no-store' }).then(r => r.json()).then(d => { if (!d.error) setPreview(d); }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [selectedRegion, fromCustId, toCustId]);

  const handleApply = async () => {
    setMsg(null);
    if (!selectedAgent) { setMsg({ text: 'Agent चुनें', good: false }); return; }
    if (!selectedRegion) { setMsg({ text: 'Region चुनें', good: false }); return; }
    const region = regions.find(r => String(r.region_id) === selectedRegion);
    const range = fromCustId || toCustId ? ` (ग्राहक नं. ${fromCustId || 'शुरू'} से ${toCustId || 'आखिर'} तक)` : '';
    if (!confirm(`${region?.region_name || region?.name || selectedRegion}${range} के ${preview?.total ?? ''} ग्राहकों पर "${agentName(selectedAgent)}" लगाना है?`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/customers/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collect_id: Number(selectedAgent), region_id: Number(selectedRegion), from: Number(fromCustId) || 0, to: Number(toCustId) || 0 })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not apply');
      setMsg({ text: `${json.updated} ग्राहकों पर "${agentName(selectedAgent)}" लग गया`, good: true });
      setFromCustId(f => f); // refresh the preview below
      const q = new URLSearchParams({ region_id: selectedRegion });
      if (fromCustId) q.set('from', fromCustId);
      if (toCustId) q.set('to', toCustId);
      fetch(`/api/customers/agent?${q.toString()}`, { cache: 'no-store' }).then(r => r.json()).then(d => { if (!d.error) setPreview(d); }).catch(() => {});
    } catch (err: any) {
      setMsg({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d2-window relative w-[540px] max-w-[96vw] bg-white border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden">
      <div className="d2-title bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 flex items-center justify-between">
        <span className="font-bold text-xs text-[#000080]">Apply Customer Agent</span>
        <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
      </div>

      <div className="bg-white p-4 flex flex-col gap-3">
        <h1 className="text-center text-xl font-black text-[#800000] tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>APPLY COLLECTION AGENT</h1>

        <div className="space-y-3 max-w-[440px] mx-auto w-full text-xs">
          <div className="flex items-center gap-3">
            <label className="w-32 font-bold text-[#000080] text-right">Collection Agent</label>
            <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)} className="flex-1 px-2 py-1 border border-[#808080] bg-white font-bold text-black outline-none">
              <option value="">— चुनें —</option>
              <option value="-1">कोई Agent नहीं (हटाएँ)</option>
              {agents.map(a => <option key={a.collect_id} value={a.collect_id}>{a.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-32 font-bold text-[#000080] text-right">Region</label>
            <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)} className="flex-1 px-2 py-1 border border-[#808080] bg-white font-bold text-black outline-none">
              <option value="">— चुनें —</option>
              {regions.map(r => <option key={r.region_id} value={r.region_id}>{r.region_name || r.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-32 font-bold text-[#800000] text-right">From Cust ID</label>
            <input type="number" value={fromCustId} onChange={e => setFromCustId(e.target.value)} placeholder="खाली = शुरू से"
              className="w-36 px-2 py-1 border border-[#808080] bg-white font-mono font-bold text-black outline-none text-center" />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-32 font-bold text-[#800000] text-right">To Cust ID</label>
            <input type="number" value={toCustId} onChange={e => setToCustId(e.target.value)} placeholder="खाली = आखिर तक"
              className="w-36 px-2 py-1 border border-[#808080] bg-white font-mono font-bold text-black outline-none text-center" />
          </div>
          {preview && (
            <div className="bg-[#F0EEE2] border border-[#808080] p-2">
              <b>{preview.total} ग्राहक</b> चुने गए। अभी: {Object.entries(preview.by_agent).map(([k, n]) => `${agentName(k)} ${n}`).join(' · ') || '—'}
            </div>
          )}
        </div>

        {msg && <div className={`text-center text-xs font-bold py-1 border ${msg.good ? 'text-emerald-800 bg-emerald-50 border-emerald-300' : 'text-red-800 bg-red-50 border-red-300'}`}>{msg.text}</div>}

        <div className="flex items-center justify-center gap-3 pt-2 border-t border-slate-200">
          <button onClick={handleApply} disabled={busy} className="px-4 py-1.5 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm cursor-pointer text-xs font-bold text-black disabled:opacity-50">
            🚀 {busy ? 'रुकिए…' : 'Apply Agent'}
          </button>
          <button onClick={onClose} className="px-4 py-1.5 bg-white hover:bg-red-50 text-red-800 border border-slate-300 text-xs font-bold cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}
