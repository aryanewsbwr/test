'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Truck, Plus, Save, Trash2, Search, FilePlus2 } from 'lucide-react';
import { Publisher, Publication } from '@/lib/types';

// Transaction > Purchase: a bill received from a publisher, as in the old software's Purchase screen.
// Publisher, Pub. Bill No., Bill Date and Received Date at the top; one line per paper and day
// (Qty x Rate); then Total, Add/Less and Net Amount. Saved to the same purchase tables the old
// software used, so the Purchase reports show these bills with the old ones.

// Day of the week (DOW) of each line; saved as the full name, shown short
const DAYS: { en: string; short: string; hi: string }[] = [
  { en: 'Sunday', short: 'Sun', hi: 'रविवार' }, { en: 'Monday', short: 'Mon', hi: 'सोमवार' },
  { en: 'Tuesday', short: 'Tue', hi: 'मंगलवार' }, { en: 'Wednesday', short: 'Wed', hi: 'बुधवार' },
  { en: 'Thursday', short: 'Thu', hi: 'गुरुवार' }, { en: 'Friday', short: 'Fri', hi: 'शुक्रवार' },
  { en: 'Saturday', short: 'Sat', hi: 'शनिवार' }
];

interface Line {
  key: number;
  publica_id: number;
  day: string;
  qty: string;
  rate: string;
}

interface PurchaseFormProps {
  onClose: () => void;
  publishers?: Publisher[];
  publications?: Publication[];
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const weekday = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? DAYS[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()].en : '';
};
const dmy = (iso: string) => iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amountOf = (l: Line) => Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0) * 100) / 100;

export default function PurchaseForm({ onClose, publishers = [], publications = [] }: PurchaseFormProps) {
  const [billId, setBillId] = useState<number | null>(null);
  const [publishId, setPublishId] = useState<string>('');
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [rDate, setRDate] = useState(today());
  const [addless, setAddless] = useState('0');
  const [lines, setLines] = useState<Line[]>([]);
  const [lastRates, setLastRates] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [bills, setBills] = useState<any[] | null>(null);
  const [findText, setFindText] = useState('');

  const sortedPublishers = useMemo(
    () => [...publishers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [publishers]
  );
  const publisherName = (id: unknown) => publishers.find(p => Number(p.publish_id) === Number(id))?.name || `Publisher #${id}`;
  const pubName = (id: unknown) => publications.find(p => Number(p.publica_id) === Number(id))?.public_name || `Paper #${id}`;

  // The chosen publisher's papers first; every paper when the publisher has none listed
  const papers = useMemo(() => {
    const own = publications.filter(p => publishId && Number(p.publish_id) === Number(publishId));
    return (own.length ? own : publications).slice().sort((a, b) => String(a.public_name).localeCompare(String(b.public_name)));
  }, [publications, publishId]);

  const loadRates = () => fetch('/api/purchases?last_rates=1', { cache: 'no-store' })
    .then(r => r.json()).then(j => setLastRates(j.rates || {})).catch(() => {});
  useEffect(() => { loadRates(); }, []);

  // The rate last paid for this paper on this day, or on any day
  const rateFor = (pub: number, day: string) => {
    const r = lastRates[`${pub}|${day}`] ?? lastRates[`${pub}|`];
    return r ? String(r) : '';
  };

  const total = Math.round(lines.reduce((s, l) => s + amountOf(l), 0) * 100) / 100;
  const net = Math.round((total + (Number(addless) || 0)) * 100) / 100;
  const copies = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const addLine = () => {
    const pub = Number(papers[0]?.publica_id) || 0;
    const day = weekday(rDate);
    setLines(ls => [...ls, { key: Date.now(), publica_id: pub, day, qty: '', rate: rateFor(pub, day) }]);
  };
  const setLine = (key: number, change: Partial<Line>) => setLines(ls => ls.map(l => {
    if (l.key !== key) return l;
    const next = { ...l, ...change };
    // A new paper or day brings the rate last paid for it
    if ((change.publica_id !== undefined || change.day !== undefined) && rateFor(next.publica_id, next.day)) {
      next.rate = rateFor(next.publica_id, next.day);
    }
    return next;
  }));

  const startNew = () => {
    setBillId(null); setBillNo(''); setBillDate(today()); setRDate(today()); setAddless('0'); setLines([]); setMessage(null);
  };

  const save = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_id: billId || undefined,
          publish_id: Number(publishId), bill_no: billNo, bill_date: billDate, r_date: rDate, addless: Number(addless) || 0,
          lines: lines.map(l => ({ publica_id: l.publica_id, day: l.day, qty: Number(l.qty), rate: Number(l.rate) }))
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setBillId(json.purchase_id);
      setMessage({
        text: `${billId ? 'बिल अपडेट हो गया' : 'बिल सेव हो गया'} (#${json.purchase_id}) — Net ₹${money(json.net)}`
          + (json.day_kept ? '' : '। दिन (Day) अभी सेव नहीं हुआ: डेटाबेस में Day कॉलम जोड़ना बाकी है।'),
        good: true
      });
      loadRates();
      setBills(null);
    } catch (err: any) {
      setMessage({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!billId || !confirm(`बिल नं. ${billNo} (${publisherName(publishId)}) हमेशा के लिए हटाना है?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases?id=${billId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not delete');
      startNew();
      setBills(null);
      setMessage({ text: 'बिल हटा दिया गया', good: true });
    } catch (err: any) {
      setMessage({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  const openFind = async () => {
    setFindOpen(true);
    if (bills) return;
    try {
      const json = await fetch('/api/purchases', { cache: 'no-store' }).then(r => r.json());
      if (json.error) throw new Error(json.error);
      setBills(json.bills || []);
    } catch (err: any) {
      setBills([]);
      setMessage({ text: err.message || String(err), good: false });
    }
  };

  const openBill = async (id: number) => {
    setBusy(true);
    try {
      const json = await fetch(`/api/purchases?id=${id}`, { cache: 'no-store' }).then(r => r.json());
      if (json.error) throw new Error(json.error);
      const b = json.bill;
      setBillId(Number(b.Purchase_id));
      setPublishId(String(b.Publish_id ?? ''));
      setBillNo(String(b.Bill_No ?? ''));
      setBillDate(b.Bill_Date || today());
      setRDate(b.R_Date || today());
      setAddless(String(Number(b.Addless) || 0));
      setLines((json.lines || []).map((l: any, i: number) => ({
        key: Date.now() + i, publica_id: Number(l.Publica_id), day: l.Day || '', qty: String(l.Qty ?? ''), rate: String(l.Rate ?? '')
      })));
      setFindOpen(false);
      setMessage(null);
    } catch (err: any) {
      setMessage({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  const shownBills = (bills || []).filter(b => {
    const q = findText.trim().toLowerCase();
    return !q || String(b.Bill_No).toLowerCase().includes(q) || publisherName(b.Publish_id).toLowerCase().includes(q);
  });

  const canSave = !busy && !!publishId && !!billNo.trim() && lines.length > 0;

  return (
    <div className="d2-window relative w-[920px] max-w-full h-[620px] vb-window flex flex-col shadow-2xl overflow-hidden font-tahoma">
      <div className="d2-title vb-titlebar-xp select-none">
        <div className="flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" />
          <span>Purchase (अखबार खरीद बिल)</span>
        </div>
        <button onClick={onClose} className="vb-win-btn vb-win-btn-close">✕</button>
      </div>

      <div className="flex-1 p-3 bg-[#ECE9D8] flex flex-col gap-2 overflow-hidden relative">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-black text-[#8B0000] tracking-wide">PURCHASE</h1>
          <span className={`text-xs font-bold px-2 py-0.5 border ${billId ? 'bg-amber-50 border-amber-400 text-amber-900' : 'bg-white border-slate-400 text-slate-700'}`}>
            {billId ? `पुराना बिल #${billId} खुला है — बदलकर Update करें` : 'नया बिल'}
          </span>
        </div>

        {/* Bill details */}
        <div className="bg-white p-3 vb-box-inset grid grid-cols-4 max-md:grid-cols-2 gap-3 text-sm">
          <label className="block">
            <span className="block font-bold text-slate-800 mb-1">Publisher</span>
            <select value={publishId} onChange={e => setPublishId(e.target.value)} className="vb-input w-full bg-white font-bold text-sm">
              <option value="">— चुनें —</option>
              {sortedPublishers.map(p => <option key={p.publish_id} value={p.publish_id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block font-bold text-slate-800 mb-1">Pub. Bill No.</span>
            <input value={billNo} onChange={e => setBillNo(e.target.value)} className="vb-input w-full font-mono font-bold text-sm" />
          </label>
          <label className="block">
            <span className="block font-bold text-slate-800 mb-1">Bill Date</span>
            <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} className="vb-input w-full font-bold text-sm" />
          </label>
          <label className="block">
            <span className="block font-bold text-slate-800 mb-1">Received Date <span className="font-normal text-slate-600">({DAYS.find(d => d.en === weekday(rDate))?.hi || '-'})</span></span>
            <input type="date" value={rDate} onChange={e => setRDate(e.target.value)} className="vb-input w-full font-bold text-sm" />
          </label>
        </div>

        {/* Papers on the bill */}
        <div className="flex-1 bg-white vb-grid overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-[#D4D0C8] text-[13px]">
              <tr>
                <th className="p-2 border border-slate-400 text-center w-10">#</th>
                <th className="p-2 border border-slate-400 text-left">Paper (पेपर)</th>
                <th className="p-2 border border-slate-400 text-center w-28" title="Day of the week">DOW</th>
                <th className="p-2 border border-slate-400 text-right w-24">Qty</th>
                <th className="p-2 border border-slate-400 text-right w-24">Rate (₹)</th>
                <th className="p-2 border border-slate-400 text-right w-32">Amount (₹)</th>
                <th className="p-2 border border-slate-400 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key} className="border-b border-slate-200 hover:bg-yellow-50">
                  <td className="p-1.5 text-center text-slate-600">{i + 1}</td>
                  <td className="p-1.5">
                    <select value={l.publica_id} onChange={e => setLine(l.key, { publica_id: Number(e.target.value) })} className="w-full p-1 border border-slate-300 bg-white font-bold text-sm">
                      {!papers.some(p => Number(p.publica_id) === l.publica_id) && <option value={l.publica_id}>{pubName(l.publica_id)}</option>}
                      {papers.map(p => <option key={p.publica_id} value={p.publica_id}>{p.public_name}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <select value={l.day} onChange={e => setLine(l.key, { day: e.target.value })} className="w-full p-1 border border-slate-300 bg-white text-sm font-bold text-center">
                      <option value="">All</option>
                      {DAYS.map(d => <option key={d.en} value={d.en}>{d.short}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5 text-right">
                    <input type="number" min="0" value={l.qty} onChange={e => setLine(l.key, { qty: e.target.value })} className="w-20 p-1 text-right font-mono font-bold border border-slate-300" />
                  </td>
                  <td className="p-1.5 text-right">
                    <input type="number" min="0" step="0.01" value={l.rate} onChange={e => setLine(l.key, { rate: e.target.value })} className="w-20 p-1 text-right font-mono border border-slate-300" />
                  </td>
                  <td className="p-1.5 text-right font-mono font-bold">{money(amountOf(l))}</td>
                  <td className="p-1.5 text-center">
                    <button title="यह लाइन हटाएँ" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))} className="text-red-600 hover:text-red-800 cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-500">Publisher चुनें, फिर &quot;+ पेपर जोड़ें&quot; दबाएँ</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex items-end justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <button onClick={addLine} disabled={!publishId} className="vb-btn bg-white hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1 cursor-pointer px-3 py-1.5 font-bold">
              <Plus className="w-4 h-4 text-emerald-600" /> पेपर जोड़ें
            </button>
            <span className="text-slate-700">कुल Qty: <b className="text-blue-900 font-mono">{copies}</b></span>
          </div>
          <div className="grid grid-cols-[auto_8rem] gap-x-3 gap-y-1 items-center bg-white vb-box-inset px-3 py-2">
            <span className="text-right font-bold text-slate-700">Total</span>
            <span className="text-right font-mono font-bold">₹{money(total)}</span>
            <span className="text-right font-bold text-slate-700">Add / Less</span>
            <input type="number" step="0.01" value={addless} onChange={e => setAddless(e.target.value)} title="जोड़ना हो तो +, घटाना हो तो - लिखें" className="p-1 text-right font-mono border border-slate-300" />
            <span className="text-right font-black text-[#8B0000]">Net Amt.</span>
            <span className="text-right font-mono font-black text-[#8B0000] text-base">₹{money(net)}</span>
          </div>
        </div>

        {message && (
          <div className={`text-sm font-bold px-3 py-1.5 border ${message.good ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-red-50 border-red-400 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-between border-t border-slate-300 pt-2">
          <div className="flex gap-2">
            <button onClick={startNew} disabled={busy} className="vb-btn bg-white hover:bg-slate-100 flex items-center gap-1 cursor-pointer px-3 py-1.5 font-bold text-sm">
              <FilePlus2 className="w-4 h-4" /> नया बिल
            </button>
            <button onClick={openFind} disabled={busy} className="vb-btn bg-white hover:bg-slate-100 flex items-center gap-1 cursor-pointer px-3 py-1.5 font-bold text-sm">
              <Search className="w-4 h-4" /> Find (पुराने बिल)
            </button>
          </div>
          <div className="flex gap-2">
            {billId && (
              <button onClick={remove} disabled={busy} className="vb-btn bg-white hover:bg-red-50 text-red-700 flex items-center gap-1 cursor-pointer px-3 py-1.5 font-bold text-sm">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
            <button onClick={save} disabled={!canSave} className="vb-btn bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-1 cursor-pointer px-4 py-1.5 font-bold text-sm">
              <Save className="w-4 h-4" /> {busy ? 'रुकिए...' : billId ? 'Update' : 'Save'}
            </button>
            <button onClick={onClose} className="vb-btn bg-white hover:bg-red-50 text-red-800 cursor-pointer px-3 py-1.5 font-bold text-sm">Exit</button>
          </div>
        </div>

        {/* Find: the saved bills, newest first */}
        {findOpen && (
          <div className="absolute inset-2 bg-[#ECE9D8] border-2 border-[#0A246A] shadow-2xl flex flex-col p-3 gap-2 z-10">
            <div className="flex items-center justify-between">
              <span className="font-black text-[#0A246A]">पुराने खरीद बिल — खोलने के लिए लाइन पर क्लिक करें</span>
              <button onClick={() => setFindOpen(false)} className="vb-btn bg-white px-3 py-1 font-bold cursor-pointer text-sm">बंद करें</button>
            </div>
            <input autoFocus value={findText} onChange={e => setFindText(e.target.value)} placeholder="Bill No. या Publisher का नाम..." className="vb-input text-sm p-1.5" />
            <div className="flex-1 overflow-auto bg-white vb-grid">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-[#D4D0C8]">
                  <tr>
                    <th className="p-2 border border-slate-400 text-left">Received</th>
                    <th className="p-2 border border-slate-400 text-left">Publisher</th>
                    <th className="p-2 border border-slate-400 text-left">Bill No.</th>
                    <th className="p-2 border border-slate-400 text-right">Qty</th>
                    <th className="p-2 border border-slate-400 text-right">Net Amt.</th>
                  </tr>
                </thead>
                <tbody>
                  {bills === null && <tr><td colSpan={5} className="p-4 text-center text-slate-500">लोड हो रहा है...</td></tr>}
                  {shownBills.map(b => (
                    <tr key={b.Purchase_id} onClick={() => openBill(Number(b.Purchase_id))} className="border-b border-slate-200 hover:bg-yellow-50 cursor-pointer">
                      <td className="p-2 font-mono">{dmy(b.R_Date) || '-'}</td>
                      <td className="p-2 font-bold">{publisherName(b.Publish_id)}</td>
                      <td className="p-2 font-mono">{b.Bill_No}</td>
                      <td className="p-2 text-right font-mono">{b.copies}</td>
                      <td className="p-2 text-right font-mono font-bold">₹{money(Number(b.NetAmt) || Number(b.Total) || 0)}</td>
                    </tr>
                  ))}
                  {bills !== null && shownBills.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">कोई बिल नहीं मिला</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
