'use client';

import React, { useEffect, useState } from 'react';
import { Building2, Save, CheckCircle2 } from 'lucide-react';
import { CompanyInfo, DEFAULT_COMPANY, loadCompany } from '@/lib/companyInfo';

// Master > Company: the firm's name, address and numbers printed at the top of every bill, report
// and WhatsApp bill image. Saved in the database; the prints use them from the next print on.

interface CompanyFormProps {
  onClose: () => void;
}

export default function CompanyForm({ onClose }: CompanyFormProps) {
  const [form, setForm] = useState<CompanyInfo>({ ...DEFAULT_COMPANY });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/company', { cache: 'no-store' }).then(r => r.json()).then(d => { if (d.company) setForm({ ...DEFAULT_COMPANY, ...d.company }); }).catch(() => {});
  }, []);

  const set = (k: keyof CompanyInfo) => (e: React.ChangeEvent<HTMLInputElement>) => { setMsg(null); setForm(f => ({ ...f, [k]: e.target.value })); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      await loadCompany(true);
      setMsg({ text: 'फर्म का विवरण सेव हो गया। अगले प्रिंट से बिल और रिपोर्ट पर यही छपेगा।', good: true });
    } catch (err: any) {
      setMsg({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof CompanyInfo, label: string, extra = '') => (
    <div>
      <label className="block font-bold text-slate-700 mb-0.5">{label}</label>
      <input type="text" value={form[k]} onChange={set(k)} className={`vb-input w-full ${extra}`} />
    </div>
  );

  return (
    <div className="d2-window relative w-[720px] max-w-[96vw] vb-window flex flex-col shadow-2xl overflow-hidden font-tahoma">
      <div className="d2-title vb-titlebar-xp select-none">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          <span>Company & Agency Profile (फर्म विवरण)</span>
        </div>
        <button onClick={onClose} className="vb-win-btn vb-win-btn-close">✕</button>
      </div>

      <form onSubmit={handleSave} className="flex-1 p-3 bg-[#ECE9D8] flex flex-col gap-2">
        <div className="text-center">
          <h1 className="text-base font-black text-[#8B0000] tracking-wider uppercase">AGENCY PROFILE & BILL HEADER</h1>
          <p className="text-[11px] text-slate-700 font-bold">ये विवरण सभी बिल (4-in-1 और 58mm), रिपोर्ट और WhatsApp बिल पर छपते हैं।</p>
        </div>

        <div className="bg-white p-3 vb-box-inset space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-3">
            {field('name', 'Agency Name (English):', 'font-bold uppercase')}
            {field('hindi_name', 'फर्म का नाम (हिंदी):', 'font-bold')}
          </div>
          {field('address', 'पूरा पता (रिपोर्ट, 58mm बिल, WhatsApp बिल पर):')}
          <div className="grid grid-cols-2 gap-3">
            {field('short_address', 'छोटा पता (4-in-1 बिल पर):')}
            {field('proprietor', 'हस्ताक्षर के नीचे नाम (4-in-1 बिल):')}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field('whatsapp', 'WhatsApp नंबर:', 'font-mono')}
            {field('phone', 'फ़ोन नंबर:', 'font-mono')}
            {field('email', 'Email:')}
          </div>
          {msg && (
            <div className={`p-1.5 border font-bold text-[11px] flex items-center gap-1.5 ${msg.good ? 'bg-emerald-100 border-emerald-400 text-emerald-900' : 'bg-red-50 border-red-400 text-red-800'}`}>
              {msg.good && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              <span>{msg.text}</span>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-300 flex items-center justify-end gap-2 text-xs font-bold">
          <button type="submit" disabled={busy} className="vb-btn bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-1 cursor-pointer px-3 py-1">
            <Save className="w-3.5 h-3.5" /> <span>{busy ? 'रुकिए…' : 'Save Profile'}</span>
          </button>
          <button type="button" onClick={onClose} className="vb-btn bg-white hover:bg-red-50 text-red-800 cursor-pointer px-3 py-1">Close</button>
        </div>
      </form>
    </div>
  );
}
