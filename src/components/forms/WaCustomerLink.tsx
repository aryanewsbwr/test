'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { allCustomers, CachedCustomer, searchCustomers } from '@/lib/customerCache';

// WhatsApp Replies: confirm the customer a number was matched to, or pick the right one. The link
// is kept so this number's messages match that customer from now on.
export default function WaCustomerLink({ number, customers, onSaved }: { number: string; customers: any[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [all, setAll] = useState<CachedCustomer[] | null>(null);
  const [pick, setPick] = useState(0);
  const [err, setErr] = useState('');
  const confirmed = customers.length === 1 && customers[0].confirmed;

  // The full customer list is loaded once (then kept for the session): every letter filters instantly
  useEffect(() => {
    if (!open || all) return;
    allCustomers().then(setAll).catch(() => setErr('ग्राहक लिस्ट नहीं आई, फिर कोशिश करें'));
  }, [open, all]);
  const found = useMemo(() => (all ? searchCustomers(all, q) : []), [all, q]);
  // Esc closes this search box (wherever the cursor is), not the WhatsApp Replies window
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); setQ(''); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  useEffect(() => { setPick(0); }, [q]);

  const link = async (customerId: number) => {
    setErr('');
    const res = await fetch('/api/whatsapp/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number, customer_id: customerId }) });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || 'सेव नहीं हुआ'); return; }
    setOpen(false); setQ('');
    onSaved();
  };
  const unlink = async () => {
    const res = await fetch(`/api/whatsapp/links?number=${encodeURIComponent(number)}`, { method: 'DELETE' });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || 'नहीं हुआ'); return; }
    onSaved();
  };

  return (
    <div className="text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        {confirmed ? (
          <span className="text-emerald-700 font-bold">✓ पक्का किया हुआ ग्राहक</span>
        ) : customers.length === 1 ? (
          <button onClick={() => link(Number(customers[0].customer_id))} className="px-1.5 py-0.5 border border-emerald-500 bg-emerald-50 text-emerald-800 rounded font-bold cursor-pointer">✓ सही ग्राहक है</button>
        ) : null}
        <button onClick={() => setOpen(o => !o)} className="px-1.5 py-0.5 border border-blue-400 bg-blue-50 text-blue-900 rounded font-bold cursor-pointer">✎ {customers.length ? 'ग्राहक बदलें' : 'ग्राहक चुनें'}</button>
        {confirmed && <button onClick={unlink} className="text-slate-500 underline cursor-pointer">पक्का हटाएँ</button>}
      </div>
      {open && (
        <div className="mt-1 border border-slate-300 bg-white rounded p-1 space-y-1">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ग्राहक नंबर, नाम या फ़ोन लिखें... (↑↓ से चुनें, Enter)"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setPick(i => Math.min(i + 1, Math.max(found.length - 1, 0))); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setPick(i => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && found[pick]) { e.preventDefault(); link(found[pick].customer_id); }
            }}
            className="w-full px-1.5 py-0.5 border border-slate-400 font-bold" />
          {!all && <div className="text-slate-500 px-1">ग्राहक लिस्ट लोड हो रही है (पहली बार 2-3 सेकंड)...</div>}
          {all && q.trim() && !found.length && <div className="text-slate-500 px-1">कोई ग्राहक नहीं मिला</div>}
          {found.map((c, i) => (
            <button key={c.customer_id} onClick={() => link(c.customer_id)} onMouseEnter={() => setPick(i)}
              className={`w-full text-left px-1 py-0.5 cursor-pointer ${i === pick ? 'bg-[#0A246A] text-white' : 'hover:bg-blue-100'}`}>
              <b className={`font-mono ${i === pick ? 'text-yellow-200' : 'text-blue-900'}`}>#{c.customer_id}</b> {c.name_hindi || c.name_eng}
              {c.name_hindi && c.name_eng && <span className={i === pick ? 'text-slate-200' : 'text-slate-500'}> · {c.name_eng}</span>}
              {c.region && <span className={i === pick ? 'text-yellow-100' : 'text-emerald-800'}> · {c.region}</span>}
            </button>
          ))}
        </div>
      )}
      {err && <div className="text-red-700 font-bold">{err}</div>}
    </div>
  );
}
