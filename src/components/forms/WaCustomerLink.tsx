'use client';

import React, { useEffect, useState } from 'react';

// WhatsApp Replies: confirm the customer a number was matched to, or pick the right one. The link
// is kept so this number's messages match that customer from now on.
export default function WaCustomerLink({ number, customers, onSaved }: { number: string; customers: any[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const confirmed = customers.length === 1 && customers[0].confirmed;

  useEffect(() => {
    if (!open || !q.trim()) { setFound([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/customers?search=${encodeURIComponent(q.trim())}&page=1&limit=15`).then(r => r.json())
        .then(d => setFound(d.customers || [])).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

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
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ग्राहक नंबर या नाम लिखें..."
            className="w-full px-1.5 py-0.5 border border-slate-400 font-bold" />
          {found.slice(0, 10).map(c => (
            <button key={c.customer_id} onClick={() => link(Number(c.customer_id))} className="w-full text-left px-1 py-0.5 hover:bg-blue-100 cursor-pointer">
              <b className="font-mono text-blue-900">#{c.customer_id}</b> {c.name_hindi || c.name_eng}
            </button>
          ))}
        </div>
      )}
      {err && <div className="text-red-700 font-bold">{err}</div>}
    </div>
  );
}
