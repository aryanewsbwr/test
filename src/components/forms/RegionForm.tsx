'use client';

import React, { useState, useEffect } from 'react';
import { Region } from '@/lib/types';

interface RegionFormProps {
  onClose: () => void;
  regions?: Region[];
}

export default function RegionForm({ onClose, regions = [] }: RegionFormProps) {
  const [selectedRegion, setSelectedRegion] = useState<Region>({
    region_id: 0,
    region_name: '',
    hindi_name: ''
  });

  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [msg, setMsg] = useState('');

  const handleCancel = () => {
    setSelectedRegion({
      region_id: 0,
      region_name: '',
      hindi_name: ''
    });
    setMsg('');
    setSearchTerm('');
    setIsFindOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFindOpen) setIsFindOpen(false);
        else onClose();
      } else if (e.altKey) {
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
  }, [selectedRegion, isFindOpen]);

  const handleSave = async () => {
    if (!selectedRegion.region_name.trim()) {
      setMsg('Error: Region Name cannot be empty');
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    try {
      const res = await fetch('/api/regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedRegion)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.region?.region_id && !selectedRegion.region_id) {
        setSelectedRegion(data.region);
      }
      setMsg('Region details saved successfully in Supabase!');
    } catch (err: any) {
      setMsg(`Error saving region: ${err.message}`);
    }
    setTimeout(() => setMsg(''), 3000);
  };

  const handleDelete = async () => {
    if (!selectedRegion.region_id) {
      setMsg('Select an existing region to delete');
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    if (window.confirm(`Are you sure you want to delete Region "${selectedRegion.region_name}"?`)) {
      try {
        const res = await fetch(`/api/regions?id=${selectedRegion.region_id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMsg(`Region "${selectedRegion.region_name}" deleted.`);
        setSelectedRegion({ region_id: 0, region_name: '', hindi_name: '' });
      } catch (err: any) {
        setMsg(`Error deleting region: ${err.message}`);
      }
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const filtered = regions.filter(r => 
    r.region_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.region_id.toString().includes(searchTerm)
  );

  return (
    <div className="d2-window relative w-full max-w-[650px] max-h-[calc(100vh-60px)] sm:max-h-[calc(100vh-70px)] vb-window flex flex-col shadow-2xl overflow-hidden font-tahoma my-auto shrink-0">
      {/* Title Bar */}
      <div className="d2-title vb-titlebar-xp select-none shrink-0">
        <div className="flex items-center gap-1.5">
          <img src="/legacy_images/paper.ico" alt="ico" className="w-3.5 h-3.5" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span>Region / Area Master (क्षेत्र विवरण) - ID #{selectedRegion.region_id}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="vb-win-btn vb-win-btn-close">✕</button>
        </div>
      </div>

      {/* Main Body */}
      <div 
        className="flex-1 overflow-y-auto relative p-3 sm:p-4 flex flex-col justify-between bg-cover bg-center min-h-0"
        style={{ backgroundImage: "url('/legacy_images/Region.jpg'), linear-gradient(135deg, #E6F0FA 0%, #FFFFFF 100%)" }}
      >
        {/* Header */}
        <div className="text-center pt-0.5">
          <h1 className="text-xl font-black text-[#8B0000] tracking-wider uppercase drop-shadow-xs">
            REGION / AREA MASTER
          </h1>
        </div>

        {/* Input Fields */}
        <div className="grid grid-cols-12 gap-y-2 gap-x-2 text-xs font-bold text-black items-center max-w-[520px] mx-auto w-full pt-2">
          
          <label className="col-span-4 text-right pr-2 text-[#8B0000]">Region ID</label>
          <input 
            type="text" 
            value={selectedRegion.region_id} 
            readOnly
            className="col-span-8 vb-input font-bold bg-slate-100 font-mono"
          />

          <label className="col-span-4 text-right pr-2 text-[#8B0000]">Region Name</label>
          <input 
            type="text" 
            value={selectedRegion.region_name || ''} 
            onChange={(e) => setSelectedRegion({ ...selectedRegion, region_name: e.target.value })}
            className="col-span-8 vb-input font-bold"
          />

          <label className="col-span-4 text-right pr-2 text-[#8B0000]">Hindi Name</label>
          <input 
            type="text" 
            value={selectedRegion.hindi_name || ''} 
            onChange={(e) => setSelectedRegion({ ...selectedRegion, hindi_name: e.target.value })}
            className="col-span-8 vb-input font-hindi font-bold"
          />
        </div>

        {/* Message Banner */}
        {msg && (
          <div className="text-center text-xs font-bold text-emerald-800 bg-emerald-100 py-0.5 border border-emerald-400">
            {msg}
          </div>
        )}

        {/* Action Buttons matching screenshot_03.jpg */}
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-1.5 pt-2 border-t border-slate-300/80 bg-[#ECE9D8] pb-1">
          <button onClick={handleSave} className="vb-action-btn">
            <span>💾 Save</span>
          </button>
          <button onClick={handleSave} className="vb-action-btn">
            <span>🔄 Update</span>
          </button>
          <button onClick={handleDelete} className="vb-action-btn">
            <span>🗑️ Del</span>
          </button>
          <button onClick={() => setIsFindOpen(true)} className="vb-action-btn bg-yellow-50">
            <span>🔍 Find ({regions.length})</span>
          </button>
          <button onClick={handleCancel} title="Alt+C: Cancel and clear fields to blank" className="vb-action-btn">
            <span>❌ Cancel</span>
          </button>
          <button onClick={onClose} className="vb-action-btn text-red-700">
            <span>🛑 Exit</span>
          </button>
        </div>
      </div>

      {/* Find Region Modal */}
      {isFindOpen && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="d2-window w-[460px] h-[340px] bg-[#ECE9D8] vb-window flex flex-col">
            <div className="d2-title vb-titlebar-xp">
              <span>Find Region / Zone</span>
              <button onClick={() => setIsFindOpen(false)} className="vb-win-btn vb-win-btn-close">✕</button>
            </div>
            <div className="p-2 flex-1 flex flex-col gap-2 overflow-hidden text-xs">
              <input 
                type="text" 
                placeholder="Search region name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="vb-input w-full"
              />
              <div className="flex-1 bg-white vb-grid overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#ECE9D8]">
                    <tr>
                      <th className="p-1">ID</th>
                      <th className="p-1">Region Name</th>
                      <th className="p-1">Hindi Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr 
                        key={r.region_id}
                        onClick={() => { setSelectedRegion(r); setIsFindOpen(false); }}
                        className="cursor-pointer hover:bg-[#316AC5] hover:text-white border-b"
                      >
                        <td className="p-1 font-mono">#{r.region_id}</td>
                        <td className="p-1 font-bold">{r.region_name}</td>
                        <td className="p-1 font-hindi">{r.hindi_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
