'use client';

import React, { useState, useEffect } from 'react';
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

  // Load collection agents from /data/collect.json
  useEffect(() => {
    fetch('/data/collect.json')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAgents(data);
        }
      })
      .catch(() => {});
  }, []);

  // Load selected agent data
  useEffect(() => {
    if (!selectedAgentId) return;
    const a = agents.find(ag => ag.collect_id === selectedAgentId);
    if (a) {
      setName(a.name || '');
      setAddress(a.address || '');
      setCity(a.city || '');
      setPhone(a.phone || '');
      setMobile(a.mobile || '');
    }
  }, [selectedAgentId, agents]);

  // Keyboard shortcut handler (Alt+S, Alt+U, Alt+D, Alt+F, Alt+C, Alt+E, Esc)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 's') {
          e.preventDefault();
          handleSave();
        } else if (key === 'u') {
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
  }, [isOpen, name, address, city, phone, mobile, selectedAgentId]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) {
      setStatus('Error: Collection Agent Name cannot be empty');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    const agentData: Partial<CollectionAgent> = {
      collect_id: selectedAgentId || agents.length + 1,
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      phone: phone.trim(),
      mobile: mobile.trim(),
    };

    if (onSaveAgent) {
      onSaveAgent(agentData);
    }
    setStatus(`Collection Agent "${name.trim()}" saved successfully.`);
    setTimeout(() => setStatus(''), 3000);
  };

  const handleDelete = () => {
    if (!selectedAgentId) {
      setStatus('Please find and select a collection agent first to delete.');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    if (window.confirm(`Are you sure you want to delete Collection Agent "${name}"?`)) {
      setAgents(prev => prev.filter(a => a.collect_id !== selectedAgentId));
      setStatus(`Collection Agent "${name}" deleted.`);
      handleCancel();
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
  };

  const filteredAgents = agents.filter(a => 
    (a.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.collect_id.toString().includes(searchQuery) ||
    (a.phone || '').includes(searchQuery) ||
    (a.mobile || '').includes(searchQuery)
  );

  return (
    <div className="w-[580px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl font-tahoma flex flex-col relative select-none">
      {/* Titlebar matching 2008 VB6 Window */}
      <div className="bg-linear-to-r from-[#0A246A] via-[#3A6EA5] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">💾</span>
          <span className="tracking-wide">Collection Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-5 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">_</button>
          <button className="w-5 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main White Form Body matching media_1789799625957.png */}
      <div className="bg-white p-6 flex flex-col justify-between min-h-[380px]">
        {/* Maroon Header */}
        <div className="text-center pt-1 pb-4">
          <h1 className="text-xl font-black text-[#800000] tracking-wider font-sans">
            COLLECTION AGENT
          </h1>
        </div>

        {/* Input Fields matching exact layout */}
        <div className="space-y-3 px-8">
          {/* Name */}
          <div className="flex items-center">
            <label className="w-24 font-bold text-[#800000] text-[13px] shrink-0">Name</label>
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-[240px] px-1.5 py-0.5 border border-[#7F9DB9] bg-white font-bold text-black text-[13px] shadow-inner outline-none focus:border-[#0A246A]"
              autoFocus
            />
          </div>

          {/* Address - slightly longer */}
          <div className="flex items-center">
            <label className="w-24 font-bold text-[#800000] text-[13px] shrink-0">Address</label>
            <input 
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-[320px] px-1.5 py-0.5 border border-[#7F9DB9] bg-white text-black text-[13px] shadow-inner outline-none focus:border-[#0A246A]"
            />
          </div>

          {/* City */}
          <div className="flex items-center">
            <label className="w-24 font-bold text-[#800000] text-[13px] shrink-0">City</label>
            <input 
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-[200px] px-1.5 py-0.5 border border-[#7F9DB9] bg-white text-black text-[13px] shadow-inner outline-none focus:border-[#0A246A]"
            />
          </div>

          {/* Phone */}
          <div className="flex items-center">
            <label className="w-24 font-bold text-[#800000] text-[13px] shrink-0">Phone</label>
            <input 
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-[200px] px-1.5 py-0.5 border border-[#7F9DB9] bg-white text-black text-[13px] shadow-inner outline-none focus:border-[#0A246A]"
            />
          </div>

          {/* Mobile */}
          <div className="flex items-center">
            <label className="w-24 font-bold text-[#800000] text-[13px] shrink-0">Mobile</label>
            <input 
              type="text"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-[200px] px-1.5 py-0.5 border border-[#7F9DB9] bg-white text-black text-[13px] shadow-inner outline-none focus:border-[#0A246A]"
            />
          </div>
        </div>

        {/* Status Message */}
        {status && (
          <div className={`mt-2 py-1 px-2 text-center text-xs font-bold ${status.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-300' : 'bg-emerald-50 text-emerald-800 border border-emerald-300'}`}>
            {status}
          </div>
        )}

        {/* Slanted Parallelogram Action Buttons matching media_1789799625957.png */}
        <div className="pt-6 pb-2 flex flex-col items-center gap-2 select-none">
          {/* Top Row: Save, Update, Del */}
          <div className="flex items-center gap-4">
            {/* Save */}
            <button 
              onClick={handleSave}
              className="px-5 py-1 bg-linear-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
            >
              <span className="transform skew-x-12 flex items-center gap-1.5 text-xs font-bold text-black">
                <span className="text-sm leading-none">💾</span>
                <span><u>S</u>ave</span>
              </span>
            </button>

            {/* Update */}
            <button 
              onClick={handleSave}
              className="px-5 py-1 bg-linear-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
            >
              <span className="transform skew-x-12 flex items-center gap-1.5 text-xs font-bold text-black">
                <span className="text-sm font-bold leading-none">↩</span>
                <span><u>U</u>pdate</span>
              </span>
            </button>

            {/* Del */}
            <button 
              onClick={handleDelete}
              className="px-5 py-1 bg-linear-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
            >
              <span className="transform skew-x-12 flex items-center gap-1.5 text-xs font-bold text-black">
                <span className="text-sm leading-none">🗑</span>
                <span><u>D</u>el</span>
              </span>
            </button>
          </div>

          {/* Bottom Row: Find, Cancel, Exit (Staggered slightly right) */}
          <div className="flex items-center gap-4 ml-16">
            {/* Find */}
            <button 
              onClick={() => setIsFindOpen(true)}
              className="px-5 py-1 bg-linear-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
            >
              <span className="transform skew-x-12 flex items-center gap-1.5 text-xs font-bold text-black">
                <span className="text-sm leading-none">🔍</span>
                <span><u>F</u>ind</span>
              </span>
            </button>

            {/* Cancel */}
            <button 
              onClick={handleCancel}
              className="px-5 py-1 bg-linear-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
            >
              <span className="transform skew-x-12 flex items-center gap-1.5 text-xs font-bold text-black">
                <span className="w-3.5 h-3.5 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-black leading-none">✕</span>
                <span><u>C</u>ancel</span>
              </span>
            </button>

            {/* Exit */}
            <button 
              onClick={onClose}
              className="px-5 py-1 bg-linear-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
            >
              <span className="transform skew-x-12 flex items-center gap-1.5 text-xs font-bold text-black">
                <span className="w-3.5 h-3.5 bg-red-800 text-white rounded-xs flex items-center justify-center text-[9px] font-black leading-none">🛑</span>
                <span><u>E</u>xit</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Find Agent Modal Dialog */}
      {isFindOpen && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl p-3 w-full max-w-md space-y-2 text-xs">
            <div className="bg-[#0A246A] text-white px-2 py-1 font-bold flex justify-between items-center">
              <span>Find Collection Agent ({filteredAgents.length} Found)</span>
              <button onClick={() => setIsFindOpen(false)} className="text-white hover:text-red-300 font-bold cursor-pointer">✕</button>
            </div>
            <input 
              type="text"
              placeholder="Search by Name, ID, Mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2 py-1 border border-slate-400 bg-white text-black font-bold outline-none"
              autoFocus
            />
            <div className="max-h-56 overflow-auto border border-slate-300 bg-white">
              {filteredAgents.map(a => (
                <button
                  key={a.collect_id}
                  onClick={() => {
                    setSelectedAgentId(a.collect_id);
                    setIsFindOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 border-b hover:bg-blue-100 flex justify-between items-center cursor-pointer text-slate-900"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-xs">{a.name}</span>
                    {a.address && <span className="text-[10px] text-slate-500 truncate max-w-[260px]">{a.address}</span>}
                  </div>
                  <div className="text-right">
                    <span className="text-blue-900 font-mono text-[10px] font-bold">#{a.collect_id}</span>
                    {a.mobile && <div className="text-[10px] text-slate-600 font-mono">{a.mobile}</div>}
                  </div>
                </button>
              ))}
              {filteredAgents.length === 0 && (
                <div className="p-3 text-center text-slate-500">No agents found matching &quot;{searchQuery}&quot;</div>
              )}
            </div>
            <div className="flex justify-end">
              <button 
                onClick={() => setIsFindOpen(false)}
                className="px-3 py-1 bg-white border border-[#808080] font-bold text-xs cursor-pointer hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
