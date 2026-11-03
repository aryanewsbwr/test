'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Hawker, Region } from '@/lib/types';

interface Props {
  isOpen?: boolean;
  onClose: () => void;
  hawkers?: Hawker[];
  regions?: Region[];
  onSaveHawker?: (hawker: Partial<Hawker>, allottedRegions: number[]) => void;
}

export default function HawkerForm({ isOpen = true, onClose, hawkers = [], regions = [], onSaveHawker }: Props) {
  const [hawkerList, setHawkerList] = useState<Hawker[]>(hawkers);
  const [regionList, setRegionList] = useState<Region[]>(regions);
  const [selectedHawkerId, setSelectedHawkerId] = useState<number | null>(null);
  
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [allottedRegions, setAllottedRegions] = useState<number[]>([]);
  
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load Hawkers and Regions from API if not already provided
  const loadHawkersAndRegions = async () => {
    try {
      if (!hawkers || hawkers.length === 0) {
        const hRes = await fetch('/api/hawkers');
        const hData = await hRes.json();
        if (hData.hawkers) setHawkerList(hData.hawkers);
        else if (Array.isArray(hData)) setHawkerList(hData);
      } else {
        setHawkerList(hawkers);
      }

      if (!regions || regions.length === 0) {
        const rRes = await fetch('/api/regions');
        const rData = await rRes.json();
        if (rData.regions) setRegionList(rData.regions);
        else if (Array.isArray(rData)) setRegionList(rData);
      } else {
        setRegionList(regions);
      }
    } catch (e) {
      console.error('Failed to load hawkers/regions:', e);
    }
  };

  useEffect(() => {
    loadHawkersAndRegions();
  }, [hawkers, regions]);

  // Load selected hawker data
  const loadHawkerDetails = (h: Hawker) => {
    setSelectedHawkerId(h.hawker_id);
    setName(h.name || '');
    setAddress(h.address || '');
    setCity(h.city || '');
    setPhone(h.phone || '');
    setMobile(h.mobile || '');
    setAllottedRegions(h.region_id ? [Number(h.region_id)] : []);
    setStatus(`Hawker #${h.hawker_id} "${h.name}" loaded.`);
    setTimeout(() => setStatus(''), 2500);
  };

  useEffect(() => {
    if (!selectedHawkerId) return;
    const h = hawkerList.find(hk => hk.hawker_id === selectedHawkerId);
    if (h) {
      loadHawkerDetails(h);
    }
  }, [selectedHawkerId]);

  // Global Keyboard shortcuts (Alt+S, Alt+U, Alt+D, Alt+F, Alt+C, Alt+E, Esc)
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
  }, [isOpen, isFindOpen, name, address, city, phone, mobile, selectedHawkerId, allottedRegions]);

  if (!isOpen) return null;

  const toggleRegion = (regionId: number) => {
    if (allottedRegions.includes(regionId)) {
      setAllottedRegions(allottedRegions.filter(id => id !== regionId));
    } else {
      setAllottedRegions([...allottedRegions, regionId]);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setStatus('Error: Hawker Name cannot be empty');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    const payload = {
      hawker_id: selectedHawkerId || undefined,
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      phone: phone.trim(),
      mobile: mobile.trim(),
      region_id: allottedRegions[0] || 1,
      allottedRegions
    };

    try {
      const res = await fetch('/api/hawkers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const saved = data.hawker || payload;
      if (saved.hawker_id && !selectedHawkerId) {
        setSelectedHawkerId(saved.hawker_id);
      }
      setHawkerList(prev => [saved, ...prev.filter(h => h.hawker_id !== saved.hawker_id)]);

      if (onSaveHawker) {
        onSaveHawker(saved, allottedRegions);
      }
      setStatus(`Hawker "${name.trim()}" saved successfully!`);
    } catch (err: any) {
      setStatus(`Error saving hawker: ${err.message}`);
    }
    setTimeout(() => setStatus(''), 3000);
  };

  const handleDelete = async () => {
    if (!selectedHawkerId) {
      setStatus('Please find and select a hawker first to delete.');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    if (window.confirm(`Are you sure you want to delete Hawker "${name}"?`)) {
      try {
        const res = await fetch(`/api/hawkers?id=${selectedHawkerId}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setHawkerList(prev => prev.filter(h => h.hawker_id !== selectedHawkerId));
        setStatus(`Hawker "${name}" deleted.`);
        handleCancel();
      } catch (err: any) {
        setStatus(`Error deleting hawker: ${err.message}`);
      }
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const handleCancel = () => {
    setSelectedHawkerId(null);
    setName('');
    setAddress('');
    setCity('');
    setPhone('');
    setMobile('');
    setAllottedRegions([]);
    setStatus('');
    setIsFindOpen(false);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const filteredHawkers = hawkerList.filter(h => 
    (h.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    String(h.hawker_id || '').includes(searchQuery) ||
    (h.phone || '').includes(searchQuery) ||
    (h.mobile || '').includes(searchQuery) ||
    (h.address || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="d2-window relative w-full max-w-[700px] max-h-[calc(100vh-60px)] sm:max-h-[calc(100vh-70px)] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl font-tahoma flex flex-col select-none overflow-hidden my-auto shrink-0">
      
      {/* Titlebar matching media_1791373522564.png */}
      <div className="d2-title bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <img 
            src="/legacy_images/paper.ico" 
            alt="ico" 
            className="w-4 h-4" 
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          <span className="font-bold text-xs text-[#808080]">Hawker Master</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">_</button>
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Form Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#ECE9D8] text-xs min-h-0">
        
        {/* Centered Bold Title */}
        <h2 
          className="text-center font-black text-[#800000] text-xl tracking-wider"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          HAWKER DETAIL
        </h2>

        {/* Form Content: Left 5 Inputs Box & Right Region Allotment Box */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
          
          {/* Left Inputs Box */}
          <div className="sm:col-span-8 p-3 bg-[#ECE9D8] border border-t-[#808080] border-l-[#808080] border-r-white border-b-white space-y-2.5 shadow-inner">
            
            <div className="flex items-center gap-2">
              <label className="w-16 font-bold text-[#800000] shrink-0 text-right pr-1">Name</label>
              <div className="flex-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1.5 py-0.5 shadow-inner">
                <input 
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent font-bold text-black outline-none text-xs"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-16 font-bold text-[#800000] shrink-0 text-right pr-1">Address</label>
              <div className="flex-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1.5 py-0.5 shadow-inner">
                <input 
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-transparent text-black outline-none text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-16 font-bold text-[#800000] shrink-0 text-right pr-1">City</label>
              <div className="flex-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1.5 py-0.5 shadow-inner">
                <input 
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-transparent text-black outline-none text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-16 font-bold text-[#800000] shrink-0 text-right pr-1">Phone</label>
              <div className="flex-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1.5 py-0.5 shadow-inner">
                <input 
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-transparent font-mono text-black outline-none text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-16 font-bold text-[#800000] shrink-0 text-right pr-1">Mobile</label>
              <div className="flex-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1.5 py-0.5 shadow-inner">
                <input 
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full bg-transparent font-mono text-black outline-none text-xs"
                />
              </div>
            </div>

          </div>

          {/* Right Region Allotment Checklist Box */}
          <div className="sm:col-span-4 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white shadow-inner flex flex-col h-[180px]">
            <div className="d2-title bg-[#ECE9D8] border-b border-[#808080] px-2 py-1 font-bold text-[11px] text-slate-800 flex justify-between items-center shrink-0">
              <span className="font-bold text-black">Region Allotment</span>
              <span className="text-[10px] text-[#000080]">({allottedRegions.length} checked)</span>
            </div>
            
            <div className="p-1 overflow-y-auto flex-1 space-y-1">
              {regionList.map((reg) => {
                const isChecked = allottedRegions.includes(reg.region_id);
                return (
                  <label 
                    key={reg.region_id}
                    className={`flex items-center gap-2 px-1.5 py-0.5 text-[11px] cursor-pointer select-none rounded-xs ${
                      isChecked ? 'bg-blue-100 font-bold text-blue-900' : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <input 
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleRegion(reg.region_id)}
                      className="cursor-pointer accent-blue-900"
                    />
                    <span className="truncate">{reg.region_name}</span>
                  </label>
                );
              })}
              {regionList.length === 0 && (
                <div className="p-2 text-center text-slate-400 italic text-[10px]">
                  Loading regions...
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Status Notification */}
        {status && (
          <div className={`p-1 font-bold text-center text-xs ${status.startsWith('Error') ? 'bg-red-100 text-red-800 border border-red-400' : 'bg-emerald-100 text-emerald-800 border border-emerald-400'}`}>
            {status}
          </div>
        )}

        {/* Action Buttons matching media_1791373522564.png */}
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-slate-300">
          
          {/* Save Button */}
          <button 
            onClick={handleSave}
            title="Alt+S: Save Hawker"
            className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12 flex items-center gap-1">
              💾 <u>S</u>ave
            </span>
          </button>

          {/* Update Button */}
          <button 
            onClick={handleSave}
            title="Alt+U: Update Hawker"
            className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12 flex items-center gap-1">
              ↩ <u>U</u>pdate
            </span>
          </button>

          {/* Delete Button */}
          <button 
            onClick={handleDelete}
            title="Alt+D: Delete Hawker"
            className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12 flex items-center gap-1">
              🗑 <u>D</u>el
            </span>
          </button>

          {/* Find Button */}
          <button 
            onClick={() => {
              loadHawkersAndRegions();
              setIsFindOpen(true);
            }}
            title="Alt+F: Find Hawker"
            className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-blue-900 ring-1 ring-blue-400"
          >
            <span className="transform skew-x-12 flex items-center gap-1">
              🔍 <u>F</u>ind
            </span>
          </button>

          {/* Cancel Button */}
          <button 
            onClick={handleCancel}
            title="Alt+C: Clear fields"
            className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
          >
            <span className="transform skew-x-12 flex items-center gap-1">
              ✖ <u>C</u>ancel
            </span>
          </button>

          {/* Exit Button */}
          <button 
            onClick={onClose}
            title="Alt+E or Esc: Exit Hawker Master"
            className="px-4 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-red-800"
          >
            <span className="transform skew-x-12 flex items-center gap-1">
              🛑 <u>E</u>xit
            </span>
          </button>

        </div>

      </div>

      {/* Find Hawker Modal Dialog */}
      {isFindOpen && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="d2-window bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl p-3 w-full max-w-lg space-y-2 text-xs flex flex-col max-h-[85vh]">
            
            <div className="d2-title bg-[#0A246A] text-white px-2 py-1 font-bold flex justify-between items-center">
              <span>Find Hawker ({filteredHawkers.length} Hawkers Found)</span>
              <button onClick={() => setIsFindOpen(false)} className="text-white hover:text-red-300 font-bold cursor-pointer">✕</button>
            </div>

            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Type Name, Address, ID, or Phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-2 py-1 border border-slate-400 bg-white font-bold text-blue-900 outline-none"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-auto border border-slate-300 bg-white max-h-64">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#ECE9D8] sticky top-0 border-b font-bold">
                  <tr>
                    <th className="p-1.5 border-r w-14">ID</th>
                    <th className="p-1.5 border-r">Hawker Name</th>
                    <th className="p-1.5 border-r">Address / Line</th>
                    <th className="p-1.5 border-r">Phone</th>
                    <th className="p-1.5 w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHawkers.map(h => (
                    <tr 
                      key={h.hawker_id}
                      onClick={() => {
                        loadHawkerDetails(h);
                        setIsFindOpen(false);
                      }}
                      className="border-b hover:bg-blue-100 cursor-pointer"
                    >
                      <td className="p-1.5 border-r font-mono font-bold text-blue-900">#{h.hawker_id}</td>
                      <td className="p-1.5 border-r font-bold text-slate-800">{h.name}</td>
                      <td className="p-1.5 border-r text-slate-600">{h.address || h.city || '-'}</td>
                      <td className="p-1.5 border-r font-mono text-slate-700">{h.mobile || h.phone || '-'}</td>
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
                  {filteredHawkers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500 italic">
                        No hawkers found matching &quot;{searchQuery}&quot;
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
