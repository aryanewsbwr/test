'use client';

import React, { useCallback, useEffect, useState } from 'react';

// Online payments sent on WhatsApp, one card per number, coloured by what to do next:
// green = screenshot came, cut the receipt; yellow = check; red = number not a customer's;
// grey = done (ticked, or a receipt is already made after the message). Screenshots show on the card.

type Colour = 'green' | 'yellow' | 'red' | 'grey';
const LOOK: Record<Colour, { card: string; band: string; label: string }> = {
  green: { card: 'border-emerald-500 bg-emerald-50', band: 'bg-emerald-600', label: 'रसीद काटें' },
  yellow: { card: 'border-amber-400 bg-amber-50', band: 'bg-amber-500', label: 'देखें' },
  red: { card: 'border-red-400 bg-red-50', band: 'bg-red-600', label: 'ग्राहक नहीं मिला' },
  grey: { card: 'border-slate-300 bg-slate-50 opacity-70', band: 'bg-slate-400', label: 'हो गया' }
};
const shown = (n: string) => String(n || '').replace(/^91(\d{10})$/, '+91 $1');
const dmy = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
const rupees = (n: number | null) => (n === null || n === undefined ? '-' : `₹${Number(n).toLocaleString('en-IN')}`);

export default function WhatsAppPaymentsView() {
  const [days, setDays] = useState(3);
  const [cards, setCards] = useState<any[]>([]);
  const [show, setShow] = useState<Colour | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [big, setBig] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMsg('');
    try {
      const res = await fetch(`/api/whatsapp/payments?days=${days}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'लोड नहीं हुआ');
      setCards(data.cards || []);
    } catch (err: any) {
      setCards([]); setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const tick = async (card: any, handled: boolean) => {
    setCards(list => list.map(c => (c.number === card.number ? { ...c, colour: handled ? 'grey' : c.colour, why: handled ? 'हो गया (टिक किया)' : c.why } : c)));
    const res = await fetch('/api/whatsapp/payments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: card.ids, handled }) });
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error || 'सेव नहीं हुआ'); load(); }
    else if (!handled) load();
  };

  // Office / staff number: its messages are not customer payments
  const hideOwn = async (card: any) => {
    if (!confirm(`${shown(card.number)} (${card.profile_name || 'बिना नाम'}) हमारा / स्टाफ का नंबर है?\n\nइसके मैसेज इस लिस्ट में आगे नहीं दिखेंगे।`)) return;
    const res = await fetch('/api/whatsapp/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ own: card.number, name: card.profile_name }) });
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error || 'सेव नहीं हुआ'); return; }
    setCards(list => list.filter(c => c.number !== card.number));
  };
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (n: string) => setOpen(s => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  const count = (c: Colour) => cards.filter(x => x.colour === c).length;
  const list = show === 'all' ? cards : cards.filter(c => c.colour === show);

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-xs">
      <div className="flex items-center gap-2 pb-2 border-b flex-wrap">
        <label className="font-bold text-[#800000]">पिछले</label>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="px-1 py-1 border border-[#808080] font-bold">
          {[1, 3, 7, 15, 30].map(d => <option key={d} value={d}>{d === 1 ? 'आज' : `${d} दिन`}</option>)}
        </select>
        <button onClick={load} className="px-3 py-1 bg-[#ECE9D8] border border-[#808080] font-bold cursor-pointer hover:bg-white">↻ Refresh</button>
        <div className="ml-auto flex gap-1 flex-wrap">
          {(['all', 'green', 'yellow', 'red', 'grey'] as const).map(c => (
            <button key={c} onClick={() => setShow(c)}
              className={`px-2 py-1 border font-bold cursor-pointer rounded ${show === c ? 'ring-2 ring-[#0A246A]' : ''} ${c === 'all' ? 'bg-white border-[#808080]' : `${LOOK[c].band} text-white border-transparent`}`}>
              {c === 'all' ? `सभी (${cards.length})` : `${LOOK[c].label} (${count(c)})`}
            </button>
          ))}
        </div>
      </div>

      {msg && <div className="mt-2 font-bold text-red-800 bg-red-50 border border-red-300 px-2 py-1">{msg}</div>}

      <div className="flex-1 overflow-auto mt-2 select-text">
        {loading ? (
          <div className="p-6 text-center text-slate-500">लोड हो रहा है...</div>
        ) : list.length === 0 ? (
          <div className="p-6 text-center text-slate-500">कोई पेमेंट मैसेज नहीं</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
            {list.map(card => {
              const look = LOOK[card.colour as Colour];
              const shots = card.messages.filter((m: any) => m.link);
              const texts = card.messages.filter((m: any) => m.body);
              return (
                <div key={card.number} className={`border-2 rounded overflow-hidden ${look.card}`}>
                  <div className={`${look.band} text-white px-2 py-1 flex items-center gap-2 font-bold`}>
                    <span className="flex-1 min-w-0 truncate" title={card.why}>{look.label} — {card.why}</span>
                    <span className="font-mono text-[11px] shrink-0">{dmy(card.last_time.slice(0, 10))} {card.last_time.slice(11)}</span>
                    {card.colour === 'grey' ? (
                      card.why.startsWith('हो गया') && <button onClick={() => tick(card, false)} className="shrink-0 px-2 py-0.5 bg-white text-slate-700 rounded font-bold cursor-pointer">↩ वापस</button>
                    ) : (
                      <button onClick={() => tick(card, true)} className="shrink-0 px-2 py-0.5 bg-white text-[#0A246A] rounded font-bold cursor-pointer">✓ हो गया</button>
                    )}
                  </div>
                  <div className="p-2 flex gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div><span className="font-mono font-bold">{shown(card.number)}</span> <span className="text-slate-500">{card.profile_name}</span></div>
                      {card.customers.length === 0 ? (
                        <div className="text-red-700 font-bold">कोई ग्राहक नहीं — Customer में यह नंबर जोड़ें</div>
                      ) : card.customers.map((c: any) => (
                        <div key={c.customer_id} className="leading-tight">
                          <b className="font-mono text-blue-900">#{c.customer_id}</b> <b>{c.name}</b>
                          <div className="text-[11px] text-slate-700">
                            बकाया <b className={c.due > 1 ? 'text-red-700' : 'text-emerald-700'}>{rupees(c.due)}</b>
                            {c.last_receipt && <> · आखिरी रसीद {dmy(c.last_receipt.date)} ({rupees(c.last_receipt.amount)})</>}
                          </div>
                        </div>
                      ))}
                      {texts.map((m: any) => {
                        const long = String(m.body).length > 160 || String(m.body).split('\n').length > 3;
                        const full = open.has(`${card.number}|${m.id}`);
                        return (
                          <div key={m.id} className="bg-white border border-slate-200 rounded px-1.5 py-0.5">
                            <div className={`whitespace-pre-wrap break-words ${long && !full ? 'line-clamp-3' : ''}`}>
                              <span className="text-slate-400 font-mono text-[10px]">{m.time} </span>{m.body}
                            </div>
                            {long && <button onClick={() => toggleOpen(`${card.number}|${m.id}`)} className="text-[10px] font-bold text-blue-800 cursor-pointer">{full ? 'कम दिखाएँ ▲' : 'पूरा पढ़ें ▼'}</button>}
                          </div>
                        );
                      })}
                    </div>
                    {shots.length > 0 && (
                      <div className="flex flex-col gap-1 shrink-0">
                        {shots.map((m: any) => (
                          m.type === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={m.id} src={m.link} alt="screenshot" onClick={() => setBig(m.link)}
                              className="w-24 h-32 object-cover border border-slate-400 rounded cursor-zoom-in bg-white" />
                          ) : (
                            <a key={m.id} href={m.link} target="_blank" rel="noreferrer" className="w-24 px-1 py-2 text-center border border-slate-400 rounded bg-white font-bold text-blue-900">📄 फाइल खोलें</a>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                  {card.customers.length !== 1 && (
                    <div className="px-2 pb-1.5 flex justify-end">
                      <button onClick={() => hideOwn(card)} className="text-[10px] text-slate-600 underline cursor-pointer">हमारा / स्टाफ का नंबर — छिपाएँ</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-1.5 text-[11px] text-slate-500 border-t">
        हरा: स्क्रीनशॉट आया, रसीद काटें · पीला: खुद देखें · लाल: नंबर किसी ग्राहक का नहीं · ग्रे: रसीद बन गई या टिक किया (रसीद काटने के बाद Refresh करें)।
      </div>

      {big && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="screenshot" className="max-h-full max-w-full rounded shadow-2xl" />
        </div>
      )}
    </div>
  );
}
