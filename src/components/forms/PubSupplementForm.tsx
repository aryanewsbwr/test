'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Publication, Rate } from '@/lib/types';
import { getSingleEffectiveRate } from '@/lib/rateEngine';

interface PubSupplementFormProps {
  onClose: () => void;
  publications?: Publication[];
  rates?: Rate[];
  ratechanges?: any[];
}

interface RegionItem {
  region_id: number;
  region_name: string;
  name?: string;
  hindi_name?: string;
}

interface SupplementRecord {
  id: number;
  publica_id: number;
  publicasup_id?: number;
  public_name: string;
  supplement_name: string;
  date: string;
  date_iso: string;
  month?: string;
  year?: string;
  rate: number;
  region_ids: number[];
  all_regions: boolean;
  updated_at?: string;
}

export default function PubSupplementForm({
  onClose,
  publications = [],
  rates = [],
  ratechanges = []
}: PubSupplementFormProps) {
  // Clean & Sort publications
  const cleanAndSortPubs = (list: any[]) => {
    return (list || [])
      .map((p: any) => {
        const pid = Number(p.publica_id ?? p.publication_id ?? p.id ?? 0);
        const name = String(p.public_name || p.name || (pid > 0 ? `Publication #${pid}` : '')).trim();
        return {
          ...p,
          publica_id: pid,
          public_name: name
        };
      })
      .filter((p: any) => p.publica_id > 0 && !isNaN(p.publica_id) && p.public_name && !p.public_name.includes('NaN'))
      .sort((a: any, b: any) => a.public_name.localeCompare(b.public_name, undefined, { sensitivity: 'base' }));
  };

  const [pubList, setPubList] = useState<Publication[]>(() => cleanAndSortPubs(publications));
  const [selectedPubId, setSelectedPubId] = useState<number | ''>('');
  const [selectedSuppPubId, setSelectedSuppPubId] = useState<number | ''>('');
  const [supplementName, setSupplementName] = useState<string>('');
  
  // Date in DD/MM/YYYY
  const [dateStr, setDateStr] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  });

  const [supplementRate, setSupplementRate] = useState<number | ''>(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Regions State
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<number[]>([]);
  const [isAllRegions, setIsAllRegions] = useState<boolean>(true);
  const [regionSearch, setRegionSearch] = useState<string>('');

  // Find Modal & History
  const [isFindOpen, setIsFindOpen] = useState<boolean>(false);
  const [supplementsHistory, setSupplementsHistory] = useState<SupplementRecord[]>([]);
  const [findSearch, setFindSearch] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Status message & busy state
  const [msg, setMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Load Publications if not passed
  useEffect(() => {
    if (publications && publications.length > 0) {
      setPubList(cleanAndSortPubs(publications));
    } else {
      fetch('/api/publications?with_rates=false')
        .then(r => r.json())
        .then(d => {
          const list = d.publications || (Array.isArray(d) ? d : []);
          setPubList(cleanAndSortPubs(list));
        })
        .catch(() => {});
    }
  }, [publications]);

  // Load Regions from API
  useEffect(() => {
    fetch('/api/regions')
      .then(r => r.json())
      .then(d => {
        const list = d.regions || (Array.isArray(d) ? d : []);
        setRegions(list);
        // Default: all regions selected
        setSelectedRegionIds(list.map((r: any) => Number(r.region_id || r.id)));
      })
      .catch(() => {});
  }, []);

  // Fetch supplements history
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/supplements');
      const data = await res.json();
      setSupplementsHistory(data.supplements || []);
    } catch (err) {
      console.error('Error fetching supplements history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // ISO Date Helper
  const getIsoDate = (dStr: string) => {
    if (!dStr) return new Date().toISOString().split('T')[0];
    const parts = dStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dStr;
  };

  // Convert ISO (YYYY-MM-DD) to DD/MM/YYYY
  const parseIsoToDdMmYyyy = (iso: string) => {
    if (!iso) return '';
    const clean = iso.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return iso;
  };

  // Rate Helper for a publication
  const getPubRate = (pubId: number, targetDateStr: string) => {
    const pub = pubList.find(p => p.publica_id === pubId);
    if (!pub) return 5.0;
    const targetIso = getIsoDate(targetDateStr);
    const dObj = new Date(targetIso + 'T12:00:00');
    const dOfWeek = (isNaN(dObj.getTime()) ? 0 : dObj.getDay()) + 1;

    const eff = getSingleEffectiveRate(pub.publica_id, dOfWeek, targetIso, rates, ratechanges, pub.magzine_day);
    if (eff > 0) return eff;
    if (pub.current_rates && pub.current_rates[dOfWeek] > 0) return pub.current_rates[dOfWeek];
    if (pub.today_rate && pub.today_rate > 0) return pub.today_rate;
    return 5.0;
  };

  // Handle Main Publication change
  const handlePubChange = (pubIdStr: string) => {
    if (!pubIdStr) {
      setSelectedPubId('');
      if (!selectedSuppPubId) {
        setSupplementRate(0);
        setSupplementName('');
      }
      return;
    }
    const pId = parseInt(pubIdStr, 10);
    setSelectedPubId(pId);
    const pub = pubList.find(p => p.publica_id === pId);
    if (pub) {
      // If Supplement Name is not yet chosen, default to this publication
      if (!selectedSuppPubId) {
        setSelectedSuppPubId(pId);
        setSupplementName(pub.public_name);
        const autoRate = getPubRate(pId, dateStr);
        setSupplementRate(autoRate);
      }
    }
  };

  // Handle Supplement Publication dropdown change
  const handleSupplementPubChange = (suppIdStr: string) => {
    if (!suppIdStr) {
      setSelectedSuppPubId('');
      setSupplementName('');
      return;
    }
    const sId = parseInt(suppIdStr, 10);
    setSelectedSuppPubId(sId);
    const sPub = pubList.find(p => p.publica_id === sId);
    if (sPub) {
      setSupplementName(sPub.public_name);
      const autoRate = getPubRate(sId, dateStr);
      setSupplementRate(autoRate);
      // If Main publication not chosen yet, set it too
      if (!selectedPubId) {
        setSelectedPubId(sId);
      }
    }
  };

  // Region Selection Handlers
  const handleToggleRegion = (rId: number) => {
    setIsAllRegions(false);
    setSelectedRegionIds(prev => {
      if (prev.includes(rId)) {
        return prev.filter(id => id !== rId);
      } else {
        const next = [...prev, rId];
        if (next.length === regions.length) {
          setIsAllRegions(true);
        }
        return next;
      }
    });
  };

  const handleToggleAllRegions = (checked: boolean) => {
    setIsAllRegions(checked);
    if (checked) {
      setSelectedRegionIds(regions.map(r => Number(r.region_id || (r as any).id)));
    } else {
      setSelectedRegionIds([]);
    }
  };

  // Filtered regions for checklist display
  const filteredRegions = useMemo(() => {
    if (!regionSearch.trim()) return regions;
    const q = regionSearch.toLowerCase().trim();
    return regions.filter(r => 
      String(r.region_id).includes(q) ||
      String(r.region_name || r.name || '').toLowerCase().includes(q) ||
      String(r.hindi_name || '').toLowerCase().includes(q)
    );
  }, [regions, regionSearch]);

  // Save / Update Handler
  const handleSave = async () => {
    if (!selectedPubId && !selectedSuppPubId) {
      setMsg({ text: 'Please select a Publication.', isError: true });
      return;
    }
    if (!isAllRegions && selectedRegionIds.length === 0) {
      setMsg({ text: 'Please select at least one region or check "Select All Regions".', isError: true });
      return;
    }

    const mainPub = pubList.find(p => p.publica_id === (selectedPubId || selectedSuppPubId));
    const suppPub = pubList.find(p => p.publica_id === (selectedSuppPubId || selectedPubId));

    if (!mainPub) {
      setMsg({ text: 'Invalid publication selected.', isError: true });
      return;
    }

    setIsSaving(true);
    setMsg({ text: 'Saving publication supplement...', isError: false });

    try {
      const payload = {
        id: selectedId,
        publicasup_id: mainPub.publica_id,
        publica_id: suppPub?.publica_id || mainPub.publica_id,
        public_name: mainPub.public_name,
        supplement_name: supplementName.trim() || suppPub?.public_name || mainPub.public_name,
        date: dateStr,
        rate: Number(supplementRate || 0),
        region_ids: isAllRegions ? [] : selectedRegionIds,
        all_regions: isAllRegions
      };

      const res = await fetch('/api/supplements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      setMsg({ 
        text: `✓ Supplement saved for ${mainPub.public_name} (${payload.supplement_name}) @ ₹${Number(supplementRate || 0).toFixed(2)} (${isAllRegions ? 'All Regions' : `${selectedRegionIds.length} Regions`})!`, 
        isError: false 
      });

      setSelectedId(data.supplement?.id || null);
      fetchHistory();
    } catch (err: any) {
      setMsg({ text: `Error: ${err.message}`, isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  // Load a record from history into form
  const handleLoadRecord = (rec: SupplementRecord) => {
    setSelectedId(rec.id);
    setSelectedPubId(rec.publicasup_id || rec.publica_id);
    setSelectedSuppPubId(rec.publica_id);
    setSupplementName(rec.supplement_name || '');
    setDateStr(parseIsoToDdMmYyyy(rec.date_iso || rec.date));
    setSupplementRate(rec.rate);
    setIsAllRegions(Boolean(rec.all_regions || !rec.region_ids || rec.region_ids.length === 0));
    setSelectedRegionIds(rec.region_ids || (rec.all_regions ? regions.map(r => r.region_id) : []));
    setIsFindOpen(false);
    setMsg({ text: `Loaded supplement #${rec.id} (${rec.public_name} - ${rec.supplement_name} @ ₹${rec.rate})`, isError: false });
  };

  // Delete Record Handler
  const handleDeleteRecord = async (id: number, pubName: string) => {
    if (!window.confirm(`Are you sure you want to delete supplement #${id} for ${pubName}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/supplements?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');

      // Optimistically remove from modal history state immediately
      setSupplementsHistory(prev => prev.filter(s => s.id !== id));
      setMsg({ text: `✓ Supplement #${id} deleted successfully.`, isError: false });
      if (selectedId === id) {
        handleCancel();
      }
      fetchHistory();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleCancel = () => {
    setSelectedId(null);
    setSelectedPubId('');
    setSelectedSuppPubId('');
    setSupplementName('');
    setSupplementRate(0);
    setIsAllRegions(true);
    setSelectedRegionIds(regions.map(r => Number(r.region_id || (r as any).id)));
    setMsg(null);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFindOpen) setIsFindOpen(false);
        else onClose();
        return;
      }
      if (e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 's' || k === 'u') {
          e.preventDefault();
          handleSave();
        } else if (k === 'd') {
          e.preventDefault();
          if (selectedId) {
            const pub = pubList.find(p => p.publica_id === selectedPubId);
            handleDeleteRecord(selectedId, pub?.public_name || '');
          }
        } else if (k === 'f') {
          e.preventDefault();
          setIsFindOpen(true);
          fetchHistory();
        } else if (k === 'c') {
          e.preventDefault();
          handleCancel();
        } else if (k === 'e') {
          e.preventDefault();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFindOpen, selectedPubId, selectedSuppPubId, selectedId, supplementRate, dateStr, isAllRegions, selectedRegionIds]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 select-none">
      
      {/* 3D Classic Windows Dialog Window */}
      <div className="d2-window w-[580px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl overflow-hidden font-tahoma text-xs flex flex-col">
        
        {/* Title Bar */}
        <div className="d2-title bg-[#0A246A] text-white px-2 py-1 flex justify-between items-center select-none font-bold">
          <div className="flex items-center gap-1.5 text-xs">
            <img 
              src="/legacy_images/paper.ico" 
              alt="ico" 
              className="w-4 h-4" 
              onError={(e) => (e.currentTarget.style.display = 'none')} 
            />
            <span className="tracking-wide">Publication Info - Supplement</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={onClose}
              className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-4 space-y-3 bg-[#ECE9D8]">
          
          {/* Header Title */}
          <div className="text-center pb-1">
            <h1 className="text-xl font-black text-[#800000] tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>
              PUBLICATIONS SUPPLEMENT
            </h1>
          </div>

          {/* Form Fields Grid */}
          <div className="space-y-2.5 bg-white p-3 border border-[#808080] shadow-inner">
            
            {/* 1. Publication Name (Main Paper) */}
            <div className="flex items-center gap-3">
              <label className="w-32 font-bold text-[#000080] text-right shrink-0">Publication Name</label>
              <select 
                value={selectedPubId}
                onChange={(e) => handlePubChange(e.target.value)}
                className="flex-1 px-2 py-1 border border-[#808080] bg-white font-bold text-black outline-none shadow-xs"
                autoFocus
              >
                <option value="">-- Select Main Publication --</option>
                {pubList.map(p => (
                  <option key={`pub_${p.publica_id}`} value={p.publica_id}>{p.public_name}</option>
                ))}
              </select>
            </div>

            {/* 2. Supplement Name (Supplement Publication Dropdown) */}
            <div className="flex items-center gap-3">
              <label className="w-32 font-bold text-[#800000] text-right shrink-0">Supplement Name</label>
              <select 
                value={selectedSuppPubId}
                onChange={(e) => handleSupplementPubChange(e.target.value)}
                className="flex-1 px-2 py-1 border border-[#808080] bg-white font-bold text-black outline-none shadow-xs"
              >
                <option value="">-- Select Supplement Publication --</option>
                {pubList.map(p => (
                  <option key={`supp_${p.publica_id}`} value={p.publica_id}>{p.public_name}</option>
                ))}
              </select>
            </div>

            {/* 3. Date & Supplement Rate Row */}
            <div className="flex items-center gap-3">
              <label className="w-32 font-bold text-[#800000] text-right shrink-0">Date</label>
              <input 
                type="text" 
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                placeholder="DD/MM/YYYY"
                className="w-32 px-2 py-1 border border-[#808080] bg-white font-mono font-bold text-black outline-none text-center shadow-xs"
              />

              <label className="font-bold text-[#000080] shrink-0 ml-2">Supplement Rate (₹)</label>
              <input 
                type="number" 
                step="0.25"
                min="0"
                value={supplementRate}
                onChange={(e) => setSupplementRate(parseFloat(e.target.value) || 0)}
                className="w-28 px-2 py-1 border border-[#808080] bg-white font-mono font-bold text-[#800000] outline-none text-right shadow-xs"
              />
            </div>

            {/* 4. Region Selection Box (Old Software Style Checklist with Select All) */}
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-[#000080]">
                  Applicable Delivery Regions (वितरण क्षेत्र सूची):
                </label>
                <span className="text-[11px] font-mono text-slate-600 font-semibold">
                  {isAllRegions ? `✓ All Regions Selected (${regions.length})` : `${selectedRegionIds.length} of ${regions.length} selected`}
                </span>
              </div>

              {/* Search filter for regions */}
              <input
                type="text"
                placeholder="Filter regions..."
                value={regionSearch}
                onChange={(e) => setRegionSearch(e.target.value)}
                className="w-full px-2 py-0.5 mb-1.5 border border-[#808080] text-[11px] bg-white outline-none"
              />

              {/* Scrollable Regions List */}
              <div className="h-32 overflow-y-auto border border-[#808080] bg-white p-1.5 space-y-1 shadow-inner">
                {filteredRegions.map(r => {
                  const rId = Number(r.region_id || (r as any).id);
                  const isChecked = isAllRegions || selectedRegionIds.includes(rId);
                  return (
                    <label 
                      key={rId}
                      className={`flex items-center gap-2 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-50 ${isChecked ? 'bg-blue-50/70 font-semibold' : 'text-slate-700'}`}
                    >
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={() => handleToggleRegion(rId)}
                        className="cursor-pointer"
                      />
                      <span className="font-mono text-[11px] text-blue-900 font-bold">#{rId}</span>
                      <span className="text-xs">{r.region_name || r.name}</span>
                      {r.hindi_name && <span className="text-[10px] text-slate-500">({r.hindi_name})</span>}
                    </label>
                  );
                })}
              </div>

              {/* Select All Option right below list */}
              <div className="flex items-center justify-between mt-1.5 pt-1 bg-[#ECE9D8] px-2 py-1 border border-[#808080]">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-black">
                  <input 
                    type="checkbox" 
                    checked={isAllRegions}
                    onChange={(e) => handleToggleAllRegions(e.target.checked)}
                    className="cursor-pointer w-4 h-4"
                  />
                  <span>Select All Regions (सभी क्षेत्र लागू करें)</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleAllRegions(true)}
                    className="px-2 py-0.5 bg-white border border-[#808080] text-[10px] font-bold hover:bg-slate-100 cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleAllRegions(false)}
                    className="px-2 py-0.5 bg-white border border-[#808080] text-[10px] font-bold hover:bg-slate-100 cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Feedback Message */}
          {msg && (
            <div className={`p-1.5 text-xs font-bold text-center border ${msg.isError ? 'bg-red-100 text-red-800 border-red-300' : 'bg-green-100 text-green-800 border-green-300'}`}>
              {msg.text}
            </div>
          )}

          {/* 3D Action Toolbar (Save, Update, Del, Find, Cancel, Exit) */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <button 
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                💾 <u>S</u>ave
              </span>
            </button>

            <button 
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                ↩ <u>U</u>pdate
              </span>
            </button>

            <button 
              type="button"
              onClick={() => {
                if (selectedId) {
                  const pub = pubList.find(p => p.publica_id === selectedPubId);
                  handleDeleteRecord(selectedId, pub?.public_name || '');
                } else {
                  setMsg({ text: 'Please select a supplement from Find first to delete.', isError: true });
                }
              }}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                🗑 <u>D</u>el
              </span>
            </button>

            <button 
              type="button"
              onClick={() => {
                setIsFindOpen(true);
                fetchHistory();
              }}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                🔍 <u>F</u>ind
              </span>
            </button>

            <button 
              type="button"
              onClick={handleCancel}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                ✕ <u>C</u>ancel
              </span>
            </button>

            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] via-[#C8E8FA] to-[#B2EBF2] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#80DEEA] border border-[#00838F] shadow-xs transform -skew-x-12 cursor-pointer text-xs font-bold text-red-800"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                🛑 <u>E</u>xit
              </span>
            </button>
          </div>

        </div>

      </div>

      {/* Find & History Modal */}
      {isFindOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4 select-none">
          <div className="d2-window w-full max-w-xl bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl p-3 space-y-2 text-xs font-tahoma">
            
            {/* Title */}
            <div className="d2-title bg-[#0A246A] text-white px-2 py-1 font-bold flex justify-between items-center">
              <span>Publication Supplement History ({supplementsHistory.length})</span>
              <button 
                type="button" 
                onClick={() => setIsFindOpen(false)} 
                className="text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Search Filter */}
            <input 
              type="text" 
              placeholder="Search supplement by Publication, Name, Date, Rate..."
              value={findSearch}
              onChange={(e) => setFindSearch(e.target.value)}
              className="w-full px-2 py-1 bg-white border border-[#808080] font-bold outline-none shadow-inner"
              autoFocus
            />

            {/* List */}
            <div className="bg-white border border-[#808080] max-h-72 overflow-auto divide-y divide-slate-200 shadow-inner">
              {isLoadingHistory && (
                <div className="p-3 text-center text-slate-500 italic">Loading supplements...</div>
              )}
              {!isLoadingHistory && supplementsHistory.length === 0 && (
                <div className="p-4 text-center text-slate-500 italic">
                  No publication supplements added yet.
                </div>
              )}
              {!isLoadingHistory && supplementsHistory
                .filter(s => {
                  if (!findSearch.trim()) return true;
                  const q = findSearch.toLowerCase().trim();
                  return (
                    String(s.public_name || '').toLowerCase().includes(q) ||
                    String(s.supplement_name || '').toLowerCase().includes(q) ||
                    String(s.date || '').includes(q) ||
                    String(s.rate).includes(q)
                  );
                })
                .map((s) => {
                  const dStr = parseIsoToDdMmYyyy(s.date_iso || s.date);
                  const regText = s.all_regions ? 'All Regions' : `${s.region_ids?.length || 0} Regions`;
                  return (
                    <div 
                      key={s.id}
                      className="p-2 hover:bg-[#F0F4FF] flex justify-between items-center gap-2 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-blue-900 text-xs">{s.public_name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-mono">📅 {dStr}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-mono font-bold">₹{Number(s.rate || 0).toFixed(2)}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          <span>Supplement: <strong>{s.supplement_name}</strong></span>
                          <span className="text-slate-500 ml-2">📍 {regText}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadRecord(s)}
                          className="px-2.5 py-1 bg-[#ECE9D8] hover:bg-white active:bg-[#D4D0C8] border border-[#808080] text-blue-900 font-bold text-[11px] rounded-xs shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          ↩ Load
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(s.id, s.public_name)}
                          className="px-2 py-1 bg-red-50 hover:bg-red-600 hover:text-white border border-red-300 text-red-700 font-bold text-[11px] rounded-xs shadow-xs cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          🗑 Del
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-1">
              <button 
                type="button"
                onClick={() => setIsFindOpen(false)}
                className="px-4 py-1 bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] font-bold cursor-pointer hover:bg-white"
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
