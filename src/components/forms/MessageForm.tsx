'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, Save, X, Trash2, Calendar, FileText } from 'lucide-react';

interface Props {
  onClose: () => void;
}

interface MessageRecord {
  id: number;
  dated: string;
  message: string;
}

export default function MessageForm({ onClose }: Props) {
  const [messages, setMessages] = useState<MessageRecord[]>([
    { id: 1, dated: new Date().toISOString().split('T')[0], message: 'Aryan News Agency - Always at your service. Please pay bills on time.' },
    { id: 2, dated: '2026-08-15', message: 'Happy Independence Day to all our valued readers!' }
  ]);
  const [dated, setDated] = useState(new Date().toISOString().split('T')[0]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [status, setStatus] = useState('');

  // Load saved message
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ana_bill_messages');
      if (saved) {
        setMessages(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const handleSave = () => {
    if (!currentMessage.trim()) {
      setStatus('Please enter a message.');
      return;
    }

    const newRecord: MessageRecord = {
      id: Date.now(),
      dated: dated,
      message: currentMessage.trim()
    };

    const updated = [newRecord, ...messages];
    setMessages(updated);
    try {
      localStorage.setItem('ana_bill_messages', JSON.stringify(updated));
    } catch {}

    setCurrentMessage('');
    setStatus('Message saved for bill printing!');
    setTimeout(() => setStatus(''), 3000);
  };

  const handleDelete = (id: number) => {
    const updated = messages.filter(m => m.id !== id);
    setMessages(updated);
    try {
      localStorage.setItem('ana_bill_messages', JSON.stringify(updated));
    } catch {}
  };

  return (
    <div className="relative w-[540px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden text-xs">
      
      {/* Title Bar */}
      <div className="bg-gradient-to-r from-[#0A246A] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Bill Message Master (संदेश प्रविष्टि)</span>
        </div>
        <button 
          onClick={onClose} 
          className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="p-3 space-y-3">
        {status && (
          <div className="p-1.5 bg-yellow-100 border border-yellow-400 text-yellow-900 font-bold text-center">
            {status}
          </div>
        )}

        {/* Input Form */}
        <div className="border border-[#808080] p-2.5 bg-[#F5F4EA] space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-20 font-bold text-slate-800">Date:</span>
            <input 
              type="date" 
              value={dated} 
              onChange={e => setDated(e.target.value)}
              className="px-2 py-0.5 border border-[#808080] bg-white text-xs font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-bold text-slate-800">Bill Footer Message / Announcement:</span>
            <textarea 
              rows={3}
              value={currentMessage}
              onChange={e => setCurrentMessage(e.target.value)}
              placeholder="Enter message to appear on monthly customer bills (e.g. शुभ दीपावली, Notice, etc.)..."
              className="p-1.5 border border-[#808080] bg-white text-xs font-sans resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button 
              onClick={handleSave}
              className="px-3 py-1 bg-white hover:bg-slate-100 border border-[#808080] font-bold flex items-center gap-1 cursor-pointer text-blue-900"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Message</span>
            </button>
          </div>
        </div>

        {/* Saved Messages List */}
        <div>
          <span className="font-bold text-slate-800 block mb-1">Recent Messages:</span>
          <div className="border border-[#808080] bg-white max-h-48 overflow-y-auto divide-y divide-slate-200">
            {messages.length === 0 ? (
              <div className="p-3 text-center text-slate-400">No messages found.</div>
            ) : (
              messages.map(m => (
                <div key={m.id} className="p-2 flex items-start justify-between gap-2 hover:bg-slate-50">
                  <div className="space-y-0.5">
                    <span className="font-mono text-[10px] text-blue-800 font-bold block">{m.dated}</span>
                    <p className="text-slate-800 text-[11px] font-sans">{m.message}</p>
                  </div>
                  <button 
                    onClick={() => handleDelete(m.id)}
                    className="text-red-600 hover:text-red-800 p-0.5"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button 
            onClick={onClose}
            className="px-4 py-1 bg-white hover:bg-slate-100 border border-[#808080] font-bold cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>

    </div>
  );
}
