'use client';

import React, { useEffect, useState } from 'react';

// User Permissions > a user's mobile app (/m) settings: the 4-digit PIN they log in with,
// the lines (regions) they see, and the collector whose receipt books fill their receipt no.
export default function MobileStaffPanel({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [regions, setRegions] = useState<{ region_id: number; region_name: string }[]>([]);
  const [agents, setAgents] = useState<{ collect_id: number; name: string }[]>([]);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState('');
  const [lines, setLines] = useState<number[]>([]);
  const [collectId, setCollectId] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/regions').then(r => r.json()).then(j => setRegions((j.regions || []).map((r: any) => ({ region_id: Number(r.region_id), region_name: String(r.region_name || r.name || r.region_id) }))
      .sort((a: any, b: any) => a.region_name.localeCompare(b.region_name, undefined, { numeric: true })))).catch(() => {});
    fetch('/api/collection-agents').then(r => r.json()).then(j => setAgents(j.agents || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setPin(''); setMsg(null);
    fetch(`/api/m/admin?user_id=${encodeURIComponent(userId)}`).then(r => r.json()).then(j => {
      if (j.error) { setMsg({ text: j.error, error: true }); return; }
      setHasPin(!!j.has_pin); setLines(j.region_ids || []); setCollectId(j.collect_id ? String(j.collect_id) : '');
    }).catch(() => setMsg({ text: 'Could not read mobile settings', error: true }));
  }, [userId]);

  const save = async (clearPin = false) => {
    if (pin && !/^\d{4}$/.test(pin)) { setMsg({ text: 'पिन 4 अंकों का हो', error: true }); return; }
    setBusy(true);
    const res = await fetch('/api/m/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, pin: clearPin ? '' : pin, clear_pin: clearPin, region_ids: lines, collect_id: collectId ? Number(collectId) : null })
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ text: j.error || 'Not saved', error: true }); return; }
    setHasPin(clearPin ? false : hasPin || !!pin);
    setPin('');
    setMsg({ text: '✓ मोबाइल ऐप की सेटिंग सेव हुई' });
  };

  const toggle = (id: number) => setLines(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));

  return (
    <fieldset className="border border-[#808080] p-2 bg-white/60 relative space-y-1.5 text-[11px]">
      <legend className="px-1.5 font-bold text-[#000080] text-xs">📱 Mobile App (/m) — पिन, लाइन, रसीद बुक</legend>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold w-[92px]">4-digit PIN:</span>
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder={hasPin ? '•••• (set)' : 'not set'}
          className="w-[90px] px-1.5 py-0.5 border border-[#808080] bg-white font-mono" />
        <span className={hasPin ? 'text-emerald-700 font-bold' : 'text-slate-500'}>{hasPin ? 'PIN is set — type a new one to change' : 'No PIN: this user cannot open the mobile app'}</span>
        {hasPin && <button onClick={() => save(true)} disabled={busy} className="px-2 py-0.5 border border-[#808080] bg-white hover:bg-red-50 text-red-800">Remove PIN</button>}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-bold w-[92px]">Receipt books:</span>
        <select value={collectId} onChange={e => setCollectId(e.target.value)} className="px-1 py-0.5 border border-[#808080] bg-white">
          <option value="">— none (type receipt no.) —</option>
          {agents.map(a => <option key={a.collect_id} value={a.collect_id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <div className="font-bold">Lines this user sees {isAdmin ? '(admin: every line)' : lines.length ? `(${lines.length})` : '(none ticked: every line)'}:</div>
        <div className="grid grid-cols-4 gap-1 max-h-[90px] overflow-y-auto p-1 bg-white border border-slate-200 mt-0.5">
          {regions.map(r => (
            <label key={r.region_id} className={`flex items-center gap-1 cursor-pointer ${lines.includes(r.region_id) ? 'font-bold' : ''}`}>
              <input type="checkbox" checked={lines.includes(r.region_id)} onChange={() => toggle(r.region_id)} disabled={isAdmin} />
              <span className="truncate">{r.region_name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => save(false)} disabled={busy} className="px-3 py-1 border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] bg-[#ECE9D8] font-bold">Save Mobile Settings</button>
        {msg && <span className={msg.error ? 'text-red-800 font-bold' : 'text-emerald-800 font-bold'}>{msg.text}</span>}
      </div>
    </fieldset>
  );
}
