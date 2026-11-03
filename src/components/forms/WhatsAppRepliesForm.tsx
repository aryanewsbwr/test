'use client';

import React, { useCallback, useEffect, useState } from 'react';

interface WhatsAppRepliesFormProps {
  onClose: () => void;
}

interface Match { customer_id: number; name: string; region_id: number }

const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const shown = (number: string) => String(number || '').replace(/^91(\d{10})$/, '+91 $1');

// Categories that need someone to act get a colour; the rest stay plain
const CATEGORY_COLOUR: Record<string, string> = {
  'पेमेंट किया': 'bg-emerald-100 text-emerald-900',
  'फोटो/फाइल – शायद पेमेंट': 'bg-emerald-50 text-emerald-900',
  'गलत नंबर (बटन)': 'bg-red-100 text-red-900',
  'गलत नंबर / पहचान नहीं': 'bg-red-100 text-red-900',
  'पेपर बंद / बदलाव': 'bg-amber-100 text-amber-900',
  'नकद / हॉकर को देंगे': 'bg-sky-100 text-sky-900',
  'वॉइस मैसेज – खुद सुनें': 'bg-violet-100 text-violet-900',
  'खुद देखें': 'bg-yellow-100 text-yellow-900'
};

function Customers({ list }: { list: Match[] }) {
  if (list.length === 0) return <span className="text-slate-400">नहीं मिला</span>;
  return <>{list.map(c => <div key={c.customer_id}><b className="font-mono text-blue-900">#{c.customer_id}</b> {c.name}</div>)}</>;
}

export default function WhatsAppRepliesForm({ onClose }: WhatsAppRepliesFormProps) {
  const [date, setDate] = useState(today());
  const [pendingOnly, setPendingOnly] = useState(false);
  const [tab, setTab] = useState<'replies' | 'failed'>('replies');
  const [replies, setReplies] = useState<any[]>([]);
  const [failed, setFailed] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch(`/api/whatsapp/replies?${pendingOnly ? 'pending=1' : `date=${date}`}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'लोड नहीं हुआ');
      setReplies(data.replies || []);
      setFailed(data.failed || []);
    } catch (err: any) {
      setReplies([]);
      setFailed([]);
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [date, pendingOnly]);

  useEffect(() => { load(); }, [load]);

  const change = async (id: number, fields: { handled?: boolean; note?: string }) => {
    setReplies(rows => rows.map(r => (r.id === id ? { ...r, ...fields } : r)));
    const res = await fetch('/api/whatsapp/replies', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields })
    });
    if (!res.ok) {
      setMsg((await res.json().catch(() => ({}))).error || 'सेव नहीं हुआ');
      load();
    }
  };

  const openMedia = async (path: string) => {
    const tabWindow = window.open('', '_blank');
    const res = await fetch(`/api/whatsapp/replies?media=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (res.ok && tabWindow) tabWindow.location.href = data.url;
    else {
      tabWindow?.close();
      setMsg(data.error || 'फाइल नहीं खुली');
    }
  };

  const left = replies.filter(r => !r.handled).length;

  return (
    <div className="d2-window relative w-[1100px] max-w-[96vw] h-[600px] max-h-[88vh] bg-white border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden">

      {/* Title Bar */}
      <div className="d2-title bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 flex items-center justify-between">
        <span className="font-bold text-xs text-[#808080]">WhatsApp Replies (ग्राहकों के जवाब)</span>
        <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
      </div>

      <div className="flex-1 bg-white p-3 flex flex-col overflow-hidden">

        {/* Controls */}
        <div className="flex items-center gap-3 pb-2 border-b text-xs flex-wrap">
          <label className="font-bold text-[#800000]">तारीख</label>
          <input type="date" value={date} disabled={pendingOnly} onChange={e => setDate(e.target.value)}
            className="px-2 py-1 border border-[#808080] font-bold outline-none disabled:opacity-40" />
          <label className="flex items-center gap-1 font-bold cursor-pointer">
            <input type="checkbox" checked={pendingOnly} onChange={e => { setPendingOnly(e.target.checked); setTab('replies'); }} />
            सभी बाकी जवाब (हर तारीख के)
          </label>
          <button onClick={load} className="px-3 py-1 bg-[#ECE9D8] border border-[#808080] font-bold cursor-pointer hover:bg-white">↻ Refresh</button>
          <div className="ml-auto flex gap-1">
            <button onClick={() => setTab('replies')}
              className={`px-3 py-1 border font-bold cursor-pointer ${tab === 'replies' ? 'bg-[#0A246A] text-white border-[#0A246A]' : 'bg-white border-[#808080]'}`}>
              जवाब ({replies.length}, बाकी {left})
            </button>
            {!pendingOnly && (
              <button onClick={() => setTab('failed')}
                className={`px-3 py-1 border font-bold cursor-pointer ${tab === 'failed' ? 'bg-[#0A246A] text-white border-[#0A246A]' : 'bg-white border-[#808080]'}`}>
                बिल नहीं पहुंचे ({failed.length})
              </button>
            )}
          </div>
        </div>

        {msg && <div className="mt-2 text-xs font-bold text-red-800 bg-red-50 border border-red-300 px-2 py-1">{msg}</div>}

        {/* Grid */}
        <div className="flex-1 border border-[#808080] mt-2 overflow-auto select-text">
          {loading ? (
            <div className="p-6 text-center text-xs text-slate-500">लोड हो रहा है...</div>
          ) : tab === 'replies' ? (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#ECE9D8] border-b">
                <tr>
                  <th className="p-1 border-r w-10">✓</th>
                  {pendingOnly && <th className="p-1 border-r w-20">तारीख</th>}
                  <th className="p-1 border-r w-12">समय</th>
                  <th className="p-1 border-r w-32 text-left">नंबर / नाम</th>
                  <th className="p-1 border-r w-48 text-left">ग्राहक</th>
                  <th className="p-1 border-r w-36 text-left">श्रेणी</th>
                  <th className="p-1 border-r text-left">संदेश</th>
                  <th className="p-1 border-r w-16">फाइल</th>
                  <th className="p-1 w-44 text-left">नोट</th>
                </tr>
              </thead>
              <tbody>
                {replies.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-slate-500">कोई जवाब नहीं</td></tr>
                )}
                {replies.map(r => (
                  <tr key={r.id} className={`border-b align-top ${r.handled ? 'opacity-50' : ''}`}>
                    <td className="p-1 border-r text-center">
                      <input type="checkbox" checked={!!r.handled} onChange={e => change(r.id, { handled: e.target.checked })} />
                    </td>
                    {pendingOnly && <td className="p-1 border-r font-mono">{r.tareekh}</td>}
                    <td className="p-1 border-r font-mono">{r.samay}</td>
                    <td className="p-1 border-r">
                      <div className="font-mono">{shown(r.from_number)}</div>
                      <div className="text-slate-500">{r.profile_name}</div>
                    </td>
                    <td className="p-1 border-r"><Customers list={r.customers} /></td>
                    <td className="p-1 border-r">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${CATEGORY_COLOUR[r.shreni] || ''}`}>{r.shreni}</span>
                    </td>
                    <td className="p-1 border-r whitespace-pre-wrap break-words">{r.body}</td>
                    <td className="p-1 border-r text-center">
                      {r.media_path && (
                        <button onClick={() => openMedia(r.media_path)} className="px-2 py-0.5 bg-[#ECE9D8] border border-[#808080] font-bold cursor-pointer hover:bg-white">
                          {r.msg_type === 'audio' ? '🔊 सुनें' : '🖼 देखें'}
                        </button>
                      )}
                    </td>
                    <td className="p-1">
                      <input defaultValue={r.note || ''} placeholder="नोट..."
                        onBlur={e => { if (e.target.value.trim() !== (r.note || '')) change(r.id, { note: e.target.value }); }}
                        className="w-full px-1 py-0.5 border border-[#808080] outline-none" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#ECE9D8] border-b">
                <tr>
                  <th className="p-1 border-r w-16">समय</th>
                  <th className="p-1 border-r w-32 text-left">नंबर</th>
                  <th className="p-1 border-r w-56 text-left">ग्राहक</th>
                  <th className="p-1 text-left">कारण</th>
                </tr>
              </thead>
              <tbody>
                {failed.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-slate-500">सभी बिल पहुंच गए</td></tr>
                )}
                {failed.map(f => (
                  <tr key={f.wamid} className="border-b align-top">
                    <td className="p-1 border-r font-mono">{String(f.samay || '').slice(11, 16)}</td>
                    <td className="p-1 border-r font-mono">{shown(f.recipient)}</td>
                    <td className="p-1 border-r"><Customers list={f.customers} /></td>
                    <td className="p-1">{f.error_code ? `${f.error_code}: ` : ''}{f.error_title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500">
          <span>श्रेणी शब्दों से अंदाज़ा है — &quot;खुद देखें&quot; वाले जवाब ज़रूर पढ़ें।</span>
          <button onClick={onClose} className="px-4 py-1 bg-white hover:bg-red-50 text-red-800 border border-slate-300 text-xs font-bold cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}
