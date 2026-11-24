'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowActive } from '@/components/MdiWindow';
import { allCustomers, CachedCustomer, searchCustomers } from '@/lib/customerCache';
import { HAWKER_CODES, parseCsv, parsePhonePeStatement, parsePnbStatement } from '@/lib/bankMilan';
import { printSheet } from '@/lib/printSheet';

// Bank Milan (बैंक जमा मिलान): which customer each UPI credit in the PNB account came from.
// Upload the PNB statement (and the PhonePe one for full payer names); the website suggests the
// customer from the payer's UPI ID, mobile number, a receipt of the same amount and the PhonePe name.
// Staff confirm (✓), mark "not a customer" (बाहर), and fill in the receipt number and hawker.

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const rupees = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function BankMilanForm({ onClose }: { onClose: () => void }) {
  const active = useWindowActive();
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 7 * 86400000)));
  const [to, setTo] = useState(isoDay(today));
  const [show, setShow] = useState<'pending' | 'all' | 'ok' | 'out'>('pending');
  const [rows, setRows] = useState<any[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [filter, setFilter] = useState('');
  const [agents, setAgents] = useState<{ collect_id: number; name: string }[]>([]);
  const [all, setAll] = useState<CachedCustomer[] | null>(null);
  // the row whose customer box is open, and what is typed there
  const [picking, setPicking] = useState<{ key: string; text: string } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/bank-milan?from=${from}&to=${to}&show=${show}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'लोड नहीं हुआ');
      setRows(data.rows || []);
      setPending(data.pending || 0);
    } catch (err: any) {
      setMsg({ text: err.message, error: true });
    } finally {
      setLoading(false);
    }
  }, [from, to, show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/collection-agents').then(r => r.json()).then(d => setAgents(d.agents || [])).catch(() => {});
    allCustomers().then(setAll).catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active.current || e.key !== 'Escape') return;
      e.preventDefault();
      if (picking) setPicking(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking, onClose, active]);

  const save = async (key: string, data: any) => {
    setMsg(null);
    const res = await fetch('/api/bank-milan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', key, data }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ text: out.error || 'सेव नहीं हुआ', error: true }); return false; }
    await load(true);
    return true;
  };

  const readFile = (file: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('फाइल नहीं पढ़ी गई'));
    r.readAsText(file, 'utf-8');
  });

  const uploadPnb = async (file: File) => {
    setMsg({ text: 'PNB स्टेटमेंट पढ़ा जा रहा है...' });
    try {
      const credits = parsePnbStatement(await readFile(file));
      if (!credits.length) throw new Error('इस फाइल में कोई जमा (Cr) लाइन नहीं मिली — PNB का CSV स्टेटमेंट चुनें');
      const res = await fetch('/api/bank-milan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upload', credits }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setMsg({ text: `फाइल में ${out.in_file} जमा — ${out.added} नई जोड़ी गईं (${rupees(out.amount)}), बाकी पहले से थीं।` });
      load(true);
    } catch (err: any) { setMsg({ text: err.message, error: true }); }
  };

  const uploadPhonePe = async (file: File) => {
    setMsg({ text: 'PhonePe स्टेटमेंट पढ़ा जा रहा है...' });
    try {
      const rows = parsePhonePeStatement(await readFile(file)).map(r => ({ utr: r.utr, name: r.name }));
      if (!rows.length) throw new Error('इस फाइल में कोई CREDIT लाइन नहीं मिली — PhonePe का CSV स्टेटमेंट चुनें');
      const res = await fetch('/api/bank-milan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'phonepe', rows }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setMsg({ text: `PhonePe की ${out.rows} लाइनें — ${out.updated} जमा में पूरा नाम जुड़ा। (जो जमा अभी PNB से नहीं आईं, उनके नाम PNB फाइल के बाद फिर डालें)` });
      load(true);
    } catch (err: any) { setMsg({ text: err.message, error: true }); }
  };

  // Himanshu's Bank_Milaan_Master.csv: his matches so far, once
  const importMaster = async (file: File) => {
    if (!confirm('हिमांशु की Bank_Milaan_Master.csv फाइल से उनके अब तक के मिलान वेबसाइट पर लाएँ? (जो जमा पहले से यहाँ हैं, वो नहीं बदलेंगी)')) return;
    setMsg({ text: 'पुरानी फाइल पढ़ी जा रही है...' });
    try {
      const [head, ...lines] = parseCsv((await readFile(file)).replace(/^﻿/, '')).filter(r => r.length > 8);
      const col = (name: string) => head.findIndex(h => h.trim() === name);
      const at = { date: col('तारीख'), txn: col('Txn No'), utr: col('UTR'), sender: col('भेजने वाला (बैंक)'), vpa: col('UPI ID'), mob: col('मोबाइल (UPI)'),
        amt: col('राशि ₹'), cid: col('ग्राहक ID'), src: col('ID कहाँ से'), chk: col('जाँच'), pp: col('PhonePe में नाम'), rec: col('रसीद नंबर'), hk: col('हॉकर'), note: col('टिप्पणी') };
      if (at.utr < 0 || at.amt < 0 || at.date < 0) throw new Error('यह Bank_Milaan_Master.csv नहीं लगती');
      const rows = lines.map(r => {
        const g = (i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
        const d = g(at.date).match(/^(\d{2})-(\d{2})-(\d{4})$/);
        const key = g(at.utr);
        const src = g(at.src), chk = g(at.chk);
        const out = src === 'डेटाबेस से बाहर';
        const ok = !out && /^\d+$/.test(g(at.cid)) && (src.startsWith('आपने') || /आपने (पक्का|चुना)/.test(chk));
        const part = key.match(/^(.+)-(\d+)$/);
        return {
          key, txn_no: g(at.txn), credit_date: d ? `${d[3]}-${d[2]}-${d[1]}` : null, amount: Number(g(at.amt)) || 0,
          payer_name: g(at.sender).replace(/^↳\s*/, ''), payer_vpa: g(at.vpa), payer_mobile: g(at.mob), phonepe_name: g(at.pp) || null,
          parent_key: part && g(at.sender).startsWith('↳') ? part[1] : null,
          customer_id: /^\d+$/.test(g(at.cid)) ? Number(g(at.cid)) : null,
          status: out ? 'out' : ok ? 'ok' : '',
          note: g(at.note) || (out ? chk.replace(/^डेटाबेस से बाहर\s*—?\s*/, '') : '') || null,
          receipt_no: g(at.rec) || null, hawker: g(at.hk) || null, updated_by: 'हिमांशु (पुरानी फ़ाइल)'
        };
      }).filter(r => r.key && r.credit_date);
      const res = await fetch('/api/bank-milan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import', rows }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setMsg({ text: `पुरानी फाइल से ${out.rows} जमा और ${out.links} पक्की UPI ID आ गईं।` });
      setFrom(rows.reduce((m, r) => (r.credit_date! < m ? r.credit_date! : m), from));
      load(true);
    } catch (err: any) { setMsg({ text: err.message, error: true }); }
  };

  const hawkerOptions = useMemo(() => {
    const list = agents.map(a => ({ value: a.name, label: a.name }));
    for (const [code, name] of Object.entries(HAWKER_CODES)) if (!list.some(o => o.value === code)) list.push({ value: code, label: `${name} (${code})` });
    return list;
  }, [agents]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.payer_name, r.phonepe_name, r.payer_vpa, r.payer_mobile, r.customer_id, r.suggest_id, r.customer_name, r.suggest_name, r.receipt_no, r.amount]
      .some(v => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, filter]);
  const total = shown.reduce((s, r) => s + (r.parent_key ? 0 : r.amount), 0);
  const found = picking && all ? searchCustomers(all, picking.text, 8) : [];

  const fileButton = (label: string, onFile: (f: File) => void, title: string) => (
    <label title={title} className="px-2 py-1 bg-[#E6F4FE] hover:bg-[#C8E8FA] border border-[#006699] text-blue-900 font-bold cursor-pointer whitespace-nowrap">
      {label}
      <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </label>
  );

  return (
    <div className="d2-window w-full max-w-[1180px] max-h-[calc(100vh-2rem)] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma text-xs">
      <div className="d2-title bg-[#0A246A] text-white px-2 py-1 flex items-center justify-between font-bold shrink-0">
        <span>🏦 Bank Milan (बैंक जमा मिलान) — बाकी: {pending}</span>
        <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
      </div>

      <div className="p-2 space-y-2 flex-1 min-h-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {fileButton('⬆ PNB स्टेटमेंट (CSV)', uploadPnb, 'PNB ONE BIZ से डाउनलोड किया CSV स्टेटमेंट')}
          {fileButton('⬆ PhonePe स्टेटमेंट (CSV)', uploadPhonePe, 'PhonePe Business का CSV — भेजने वाले का पूरा नाम जोड़ता है')}
          <span className="font-bold text-[#800000] ml-2">तारीख</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-1 border border-[#7F9DB9] bg-white" />
          <span>से</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-1 border border-[#7F9DB9] bg-white" />
          <select value={show} onChange={e => setShow(e.target.value as any)} className="px-1 py-0.5 border border-[#7F9DB9] bg-white font-bold">
            <option value="pending">बाकी (ग्राहक पक्का नहीं)</option>
            <option value="all">सभी जमा</option>
            <option value="ok">पक्के</option>
            <option value="out">डेटाबेस से बाहर</option>
          </select>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="नाम, UPI ID, राशि, रसीद खोजें..." className="flex-1 min-w-[160px] px-1.5 py-0.5 border border-[#7F9DB9] bg-white" />
          <button onClick={() => load()} className="px-2 py-1 border border-[#808080] bg-white font-bold cursor-pointer">↻</button>
          <button onClick={() => printSheet(sheetRef.current, `Bank Jama ${dmy(from)} - ${dmy(to)}`)} className="px-2 py-1 bg-[#0A246A] text-white font-bold cursor-pointer">🖨 Print</button>
          {fileButton('पुरानी फाइल', importMaster, 'एक बार: हिमांशु की Bank_Milaan_Master.csv से अब तक के मिलान लाएँ')}
        </div>

        {msg && <div className={`px-2 py-1 border font-bold shrink-0 break-words ${msg.error ? 'bg-red-50 border-red-400 text-red-800' : 'bg-emerald-50 border-emerald-400 text-emerald-900'}`}>{msg.text}</div>}

        <div className="flex-1 min-h-0 overflow-auto bg-white border border-[#808080]">
          <div ref={sheetRef} className="font-serif bg-white">
            <div className="px-2 py-1 font-bold text-[13px] text-black">बैंक जमा रजिस्टर: {dmy(from)} से {dmy(to)} — {shown.length} जमा, {rupees(total)}</div>
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-[#1F4E78] text-white">
                <tr>
                  {['क्र.', 'तारीख', 'भेजने वाला / UPI ID', 'राशि', 'ग्राहक', 'रसीद नं.', 'हॉकर', ''].map((h, i) => (
                    <th key={i} className="px-1 py-1 border border-[#808080] text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="p-3 text-center text-slate-500">लोड हो रहा है...</td></tr>}
                {!loading && !shown.length && <tr><td colSpan={8} className="p-3 text-center text-slate-500">इन तारीखों में कोई जमा नहीं{show === 'pending' ? ' बाकी' : ''}। ऊपर से PNB स्टेटमेंट डालें।</td></tr>}
                {!loading && shown.map((r, i) => {
                  const done = r.status === 'ok';
                  const out = r.status === 'out';
                  const chosen = done ? r.customer_id : r.suggest_id;
                  return (
                    <tr key={r.key} className={`align-top ${out ? 'bg-slate-100 text-slate-500' : done ? 'bg-emerald-50' : i % 2 ? 'bg-[#F4F8FC]' : ''}`}>
                      <td className="px-1 py-0.5 border border-slate-300">{i + 1}</td>
                      <td className="px-1 py-0.5 border border-slate-300 whitespace-nowrap">{dmy(r.credit_date)}</td>
                      <td className="px-1 py-0.5 border border-slate-300">
                        <div className="font-bold">{r.parent_key ? '↳ ' : ''}{r.payer_name || '—'}{r.payer_bank ? <span className="font-normal text-slate-500"> · {r.payer_bank}</span> : null}</div>
                        {r.phonepe_name && <div className="text-[10px] text-indigo-800">PhonePe: {r.phonepe_name}</div>}
                        <div className="text-[10px] text-slate-500 font-mono">{r.payer_vpa}</div>
                      </td>
                      <td className="px-1 py-0.5 border border-slate-300 text-right font-bold whitespace-nowrap">{rupees(r.amount)}</td>
                      <td className="px-1 py-0.5 border border-slate-300 min-w-[230px] relative">
                        {out ? (
                          <span className="italic">डेटाबेस से बाहर{r.note ? ` — ${r.note}` : ''}</span>
                        ) : picking?.key === r.key ? (
                          <div data-noprint>
                            <input autoFocus value={picking?.text || ''} onChange={e => setPicking({ key: r.key, text: e.target.value })}
                              placeholder="ग्राहक नं. या नाम..." className="w-full px-1 border border-blue-500" />
                            <div className="absolute z-20 left-0 right-0 bg-white border border-slate-400 shadow-lg max-h-56 overflow-auto">
                              {!all && <div className="p-1 text-slate-500">ग्राहक लिस्ट लोड हो रही है...</div>}
                              {found.map(c => (
                                <button key={c.customer_id} onClick={async () => { setPicking(null); await save(r.key, { customer_id: c.customer_id, status: 'ok' }); }}
                                  className="block w-full text-left px-1 py-0.5 hover:bg-blue-100 cursor-pointer">
                                  <b className="font-mono text-blue-900">#{c.customer_id}</b> {c.name_hindi || c.name_eng}{c.region ? <span className="text-emerald-800"> · {c.region}</span> : null}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : chosen ? (
                          <div>
                            <span className={done ? 'font-bold' : 'text-slate-500'}>#{chosen} {done ? r.customer_name : r.suggest_name}</span>
                            {!done && r.suggest_from && <span className="ml-1 text-[10px] text-amber-800">(सुझाव: {r.suggest_from})</span>}
                          </div>
                        ) : <span className="text-red-700 font-bold">— ग्राहक नहीं मिला —</span>}
                        {!done && !out && r.alternatives?.length > 0 && (
                          <div className="text-[10px] text-slate-600">शायद: {r.alternatives.map((a: any) => (
                            <button key={a.id} data-noprint onClick={() => save(r.key, { customer_id: a.id, status: 'ok' })} className="underline text-blue-800 mr-1 cursor-pointer">#{a.id} {a.name}</button>
                          ))}</div>
                        )}
                        {!done && !out && r.warning && <div className="text-[10px] text-red-700">{r.warning}</div>}
                      </td>
                      <td className="px-1 py-0.5 border border-slate-300 w-[90px]">
                        <input defaultValue={r.receipt_no || ''} placeholder={r.receipt_suggest || ''} key={`rec-${r.key}-${r.receipt_no}`}
                          onBlur={e => { const v = e.target.value.trim(); if (v !== (r.receipt_no || '')) save(r.key, { receipt_no: v || null }); }}
                          className="w-full px-1 border border-slate-300 font-mono" />
                      </td>
                      <td className="px-1 py-0.5 border border-slate-300 w-[110px]">
                        <select value={r.hawker || ''} onChange={e => save(r.key, { hawker: e.target.value || null })} className="w-full border border-slate-300 bg-white">
                          <option value="">—</option>
                          {r.hawker && !hawkerOptions.some(o => o.value === r.hawker) && <option value={r.hawker}>{r.hawker}</option>}
                          {hawkerOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-0.5 border border-slate-300 whitespace-nowrap" data-noprint>
                        {!done && !out && chosen && (
                          <button onClick={() => save(r.key, { customer_id: chosen, status: 'ok' })} title="यही ग्राहक है — पक्का करें"
                            className="px-1.5 mr-1 bg-emerald-600 text-white font-bold cursor-pointer">✓</button>
                        )}
                        {!out && (
                          <button onClick={() => setPicking({ key: r.key, text: '' })} title="ग्राहक चुनें / बदलें" className="px-1.5 mr-1 border border-blue-500 text-blue-900 font-bold cursor-pointer">✎</button>
                        )}
                        {!out && !done && (
                          <button onClick={() => { const note = prompt('यह जमा किसकी है? (जैसे BR, नकद बिक्री, दूसरा काम)'); if (note !== null) save(r.key, { status: 'out', customer_id: null, note: note.trim() || null }); }}
                            title="ग्राहक की नहीं — डेटाबेस से बाहर" className="px-1.5 mr-1 border border-slate-500 text-slate-700 cursor-pointer">बाहर</button>
                        )}
                        {(done || out) && (
                          <button onClick={() => save(r.key, { status: '' })} title="फिर से खोलें" className="px-1.5 border border-slate-400 text-slate-600 cursor-pointer">↺</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="text-[10px] text-slate-600 shrink-0">
          ✓ = सुझाया ग्राहक पक्का · ✎ = दूसरा ग्राहक चुनें · बाहर = ग्राहक की जमा नहीं · पक्का करने पर वह UPI ID उस ग्राहक की याद रहती है, अगली बार अपने-आप सुझाव आएगा।
        </div>
      </div>
    </div>
  );
}
