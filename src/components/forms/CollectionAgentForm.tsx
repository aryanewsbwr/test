'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CollectionAgent } from '@/lib/types';

interface Props {
  isOpen?: boolean;
  onClose: () => void;
  onSaveAgent?: (agent: Partial<CollectionAgent>) => void;
}

export default function CollectionAgentForm({ isOpen = true, onClose, onSaveAgent }: Props) {
  const [agents, setAgents] = useState<CollectionAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const showStatus = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus(''), 3000);
  };

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/collection-agents');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAgents(data.agents);
    } catch (e: any) {
      showStatus(`Error: could not load collection agents (${e.message})`);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgentDetails = (a: CollectionAgent) => {
    setSelectedAgentId(a.collect_id);
    setName(a.name || '');
    setAddress(a.address || '');
    setCity(a.city || '');
    setPhone(a.phone || '');
    setMobile(a.mobile || '');
    setStatus(`Agent #${a.collect_id} "${a.name}" loaded.`);
    setTimeout(() => setStatus(''), 2500);
  };

  // Load selected agent data
  useEffect(() => {
    if (!selectedAgentId) return;
    const a = agents.find(ag => ag.collect_id === selectedAgentId);
    if (a) {
      loadAgentDetails(a);
    }
  }, [selectedAgentId]);

  // Keyboard shortcut handler (Alt+S, Alt+U, Alt+D, Alt+F, Alt+C, Alt+E, Esc)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isFindOpen) {
          setIsFindOpen(false);
        } else {
          onClose();
        }
        return;
      }
      if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 's' || key === 'u') {
          e.preventDefault();
          handleSave();
        } else if (key === 'd') {
          e.preventDefault();
          handleDelete();
        } else if (key === 'f') {
          e.preventDefault();
          setIsFindOpen(true);
        } else if (key === 'c') {
          e.preventDefault();
          handleCancel();
        } else if (key === 'e') {
          e.preventDefault();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFindOpen, name, address, city, phone, mobile, selectedAgentId]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      showStatus('Error: Collection Agent Name cannot be empty');
      return;
    }
    try {
      const res = await fetch('/api/collection-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collect_id: selectedAgentId, name, address, city, phone, mobile })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const agentData: CollectionAgent = data.agent;
      setAgents(prev => [agentData, ...prev.filter(a => a.collect_id !== agentData.collect_id)]);
      if (onSaveAgent) {
        onSaveAgent(agentData);
      }
      setSelectedAgentId(agentData.collect_id);
      showStatus(`Collection Agent "${agentData.name}" saved successfully.`);
    } catch (e: any) {
      showStatus(`Error: ${e.message}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedAgentId) {
      setStatus('Please find and select a collection agent first to delete.');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    if (window.confirm(`Are you sure you want to delete Collection Agent "${name}"?`)) {
      const res = await fetch(`/api/collection-agents?id=${selectedAgentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        showStatus(`Error: ${data.error}`);
        return;
      }
      setAgents(prev => prev.filter(a => a.collect_id !== selectedAgentId));
      handleCancel();
      showStatus(`Collection Agent "${name}" deleted.`);
    }
  };

  const handleCancel = () => {
    setSelectedAgentId(null);
    setName('');
    setAddress('');
    setCity('');
    setPhone('');
    setMobile('');
    setStatus('');
    setIsFindOpen(false);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const filteredAgents = agents.filter(a => 
    (a.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    String(a.collect_id || '').includes(searchQuery) ||
    (a.phone || '').includes(searchQuery) ||
    (a.mobile || '').includes(searchQuery) ||
    (a.address || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="d2-window relative w-full max-w-[620px] max-h-[calc(100vh-60px)] sm:max-h-[calc(100vh-70px)] bg-white border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl font-tahoma flex flex-col select-none overflow-hidden my-auto shrink-0">
      
      {/* Titlebar matching media_1791373601013.png */}
      <div className="d2-title bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <img 
            src="/legacy_images/paper.ico" 
            alt="ico" 
            className="w-4 h-4" 
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          <span className="font-bold text-xs text-[#808080]">Collection Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">_</button>
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Body with Clean White Canvas matching media_1791373601013.png */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white text-xs min-h-0">
        
        {/* Header Title */}
        <div className="text-center">
          <h1 
            className="text-xl font-black text-[#800000] tracking-wider uppercase font-serif"
          >
            COLLECTION AGENT
          </h1>
        </div>

        {/* Input Fields matching exact proportions of media_1791373601013.png */}
        <div className="space-y-3 max-w-[460px] mx-auto w-full pt-1">
          
          {/* Name Row */}
          <div className="flex items-center gap-4">
            <label className="w-20 font-bold text-[#800000] text-right shrink-0">Name</label>
            <div className="w-56 border border-[#7F9DB9] bg-white px-2 py-0.5 shadow-inner">
              <input 
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jagdish"
                className="w-full bg-transparent font-bold text-black outline-none text-xs"
                autoFocus
              />
            </div>
          </div>

          {/* Address Row */}
          <div className="flex items-center gap-4">
            <label className="w-20 font-bold text-[#800000] text-right shrink-0">Address</label>
            <div className="w-80 border border-[#7F9DB9] bg-white px-2 py-0.5 shadow-inner">
              <input 
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-transparent text-black outline-none text-xs"
              />
            </div>
          </div>

          {/* City Row */}
          <div className="flex items-center gap-4">
            <label className="w-20 font-bold text-[#800000] text-right shrink-0">City</label>
            <div className="w-56 border border-[#7F9DB9] bg-white px-2 py-0.5 shadow-inner">
              <input 
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-transparent text-black outline-none text-xs"
              />
            </div>
          </div>

          {/* Phone Row */}
          <div className="flex items-center gap-4">
            <label className="w-20 font-bold text-[#800000] text-right shrink-0">Phone</label>
            <div className="w-56 border border-[#7F9DB9] bg-white px-2 py-0.5 shadow-inner">
              <input 
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-transparent font-mono text-black outline-none text-xs"
              />
            </div>
          </div>

          {/* Mobile Row */}
          <div className="flex items-center gap-4">
            <label className="w-20 font-bold text-[#800000] text-right shrink-0">Mobile</label>
            <div className="w-56 border border-[#7F9DB9] bg-white px-2 py-0.5 shadow-inner">
              <input 
                type="text"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full bg-transparent font-mono text-black outline-none text-xs"
              />
            </div>
          </div>

        </div>

        {/* Status Notification */}
        {status && (
          <div className={`p-1 font-bold text-center text-xs ${status.startsWith('Error') ? 'bg-red-100 text-red-800 border border-red-400' : 'bg-emerald-100 text-emerald-800 border border-emerald-400'}`}>
            {status}
          </div>
        )}

        {/* Action Buttons in 2 Rows matching media_1791373601013.png */}
        <div className="shrink-0 flex flex-col items-center justify-center gap-2 pt-3 border-t border-slate-200">
          
          {/* Row 1: Save, Update, Del */}
          <div className="flex items-center justify-center gap-3">
            <button 
              onClick={handleSave}
              className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                💾 <u>S</u>ave
              </span>
            </button>

            <button 
              onClick={handleSave}
              className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                ↩ <u>U</u>pdate
              </span>
            </button>

            <button 
              onClick={handleDelete}
              className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                🗑 <u>D</u>el
              </span>
            </button>
          </div>

          {/* Row 2: Find, Cancel, Exit */}
          <div className="flex items-center justify-center gap-3">
            <button 
              onClick={() => {
                loadAgents();
                setIsFindOpen(true);
              }}
              className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-blue-900 ring-1 ring-blue-400"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                🔍 <u>F</u>ind
              </span>
            </button>

            <button 
              onClick={handleCancel}
              className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                ❌ <u>C</u>ancel
              </span>
            </button>

            <button 
              onClick={onClose}
              className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-red-800"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                🛑 <u>E</u>xit
              </span>
            </button>
          </div>

        </div>

      </div>

      {/* Find Collection Agent Modal Dialog */}
      {isFindOpen && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="d2-window bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl p-3 w-full max-w-md space-y-2 text-xs flex flex-col max-h-[85vh]">
            
            <div className="d2-title bg-[#0A246A] text-white px-2 py-1 font-bold flex justify-between items-center">
              <span>Find Collection Agent ({filteredAgents.length} Agents Found)</span>
              <button onClick={() => setIsFindOpen(false)} className="text-white hover:text-red-300 font-bold cursor-pointer">✕</button>
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Type Agent Name, City, Phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-2 py-1 border border-slate-400 bg-white font-bold text-blue-900 outline-none"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-auto border border-slate-300 bg-white max-h-60">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#ECE9D8] sticky top-0 border-b font-bold">
                  <tr>
                    <th className="p-1.5 border-r w-14">ID</th>
                    <th className="p-1.5 border-r">Agent Name</th>
                    <th className="p-1.5 border-r">City / Area</th>
                    <th className="p-1.5 border-r">Phone</th>
                    <th className="p-1.5 w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map(a => (
                    <tr 
                      key={a.collect_id}
                      onClick={() => {
                        loadAgentDetails(a);
                        setIsFindOpen(false);
                      }}
                      className="border-b hover:bg-blue-100 cursor-pointer"
                    >
                      <td className="p-1.5 border-r font-mono font-bold text-blue-900">#{a.collect_id}</td>
                      <td className="p-1.5 border-r font-bold text-slate-800">{a.name}</td>
                      <td className="p-1.5 border-r text-slate-600">{a.city || a.address || '-'}</td>
                      <td className="p-1.5 border-r font-mono text-slate-700">{a.mobile || a.phone || '-'}</td>
                      <td className="p-1.5 text-center">
                        <button
                          type="button"
                          className="px-2 py-0.5 bg-blue-700 text-white font-bold text-[10px] rounded-xs shadow-xs"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredAgents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500 italic">
                        No collection agents found matching &quot;{searchQuery}&quot;
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-1">
              <button 
                onClick={() => setIsFindOpen(false)}
                className="px-4 py-1 bg-[#ECE9D8] border border-[#808080] font-bold text-xs cursor-pointer hover:bg-white"
              >
                Close (Esc)
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
