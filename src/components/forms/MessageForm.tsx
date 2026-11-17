'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, Save, Trash2 } from 'lucide-react';
import { loadCompany } from '@/lib/companyInfo';

// Master > Message: messages for the bills (शुभ दीपावली, a notice ...), kept in the database.
// The newest message prints at the bottom of every bill (4-in-1 and 58mm) and on WhatsApp bills;
// delete it to stop printing it.

interface Props {
  onClose: () => void;
}

interface MessageRecord { message_id: number; dated: string; message: string }

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function MessageForm({ onClose }: Props) {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [dated, setDated] = useState(todayIso());
  const [currentMessage, setCurrentMessage] = useState('');
  const [status, setStatus] = useState<{ text: string; good: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/messages', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load');
      setMessages(json.messages || []);
    } catch (err: any) {
      setStatus({ text: err.message || String(err), good: false });
    }
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!currentMessage.trim()) { setStatus({ text: 'संदेश लिखें', good: false }); return; }
    setBusy(true); setStatus(null);
    try {
      const res = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dated, message: currentMessage }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setCurrentMessage('');
      setStatus({ text: 'संदेश सेव हो गया। अब यह सबसे ऊपर है और बिलों पर छपेगा।', good: true });
      await Promise.all([load(), loadCompany(true)]);
    } catch (err: any) {
      setStatus({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (m: MessageRecord) => {
    if (!confirm(`यह संदेश हटाना है?\n\n${m.message}`)) return;
    setBusy(true); setStatus(null);
    try {
      const res = await fetch(`/api/messages?id=${m.message_id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not delete');
      await Promise.all([load(), loadCompany(true)]);
    } catch (err: any) {
      setStatus({ text: err.message || String(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d2-window relative w-[540px] max-w-[96vw] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden text-xs">
      <div className="d2-title bg-gradient-to-r from-[#0A246A] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Bill Message Master (संदेश प्रविष्टि)</span>
        </div>
        <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
      </div>

      <div className="p-3 space-y-3">
        {status && <div className={`p-1.5 border font-bold text-center ${status.good ? 'bg-emerald-100 border-emerald-400 text-emerald-900' : 'bg-red-50 border-red-400 text-red-800'}`}>{status.text}</div>}

        <div className="border border-[#808080] p-2.5 bg-[#F5F4EA] space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-20 font-bold text-slate-800">Date:</span>
            <input type="date" value={dated} onChange={e => setDated(e.target.value)} className="px-2 py-0.5 border border-[#808080] bg-white text-xs font-mono" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-bold text-slate-800">बिल पर छपने वाला संदेश (छोटा रखें, एक लाइन):</span>
            <textarea rows={2} maxLength={120} value={currentMessage} onChange={e => setCurrentMessage(e.target.value)}
              placeholder="जैसे: दीपावली की हार्दिक शुभकामनाएँ"
              className="p-1.5 border border-[#808080] bg-white text-xs font-sans resize-none" />
            <span className="text-[10px] text-slate-500 text-right">{currentMessage.length} / 120</span>
          </div>
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={busy} className="px-3 py-1 bg-white hover:bg-slate-100 border border-[#808080] font-bold flex items-center gap-1 cursor-pointer text-blue-900 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> <span>Save Message</span>
            </button>
          </div>
        </div>

        <div>
          <span className="font-bold text-slate-800 block mb-1">संदेश (सबसे ऊपर वाला बिलों पर छपता है):</span>
          <div className="border border-[#808080] bg-white max-h-48 overflow-y-auto divide-y divide-slate-200">
            {messages.length === 0 ? (
              <div className="p-3 text-center text-slate-400">कोई संदेश नहीं — बिलों पर कोई संदेश नहीं छपेगा।</div>
            ) : messages.map((m, i) => (
              <div key={m.message_id} className={`p-2 flex items-start justify-between gap-2 ${i === 0 ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                <div className="space-y-0.5">
                  <span className="font-mono text-[10px] text-blue-800 font-bold block">{m.dated}{i === 0 ? ' · बिलों पर छप रहा है' : ''}</span>
                  <p className="text-slate-800 text-[11px] font-sans">{m.message}</p>
                </div>
                <button onClick={() => handleDelete(m)} disabled={busy} className="text-red-600 hover:text-red-800 p-0.5" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-1 bg-white hover:bg-slate-100 border border-[#808080] font-bold cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}
