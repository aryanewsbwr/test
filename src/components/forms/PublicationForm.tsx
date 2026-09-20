'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Publication, Rate, RateChange, Publisher } from '@/lib/types';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { getEffectiveWeekdayRates } from '@/lib/rateEngine';

interface PublicationFormProps {
  onClose: () => void;
  publications: Publication[];
  publishers?: Publisher[];
  rates?: Rate[];
  ratechanges?: RateChange[];
  onSave?: (pub: Publication) => void;
  onDelete?: (pubId: number) => void;
}

const WEEKDAYS = [
  { id: 1, name: 'Sunday', hindi: 'रविवार', defaultRate: 5.0 },
  { id: 2, name: 'Monday', hindi: 'सोमवार', defaultRate: 5.0 },
  { id: 3, name: 'Tuesday', hindi: 'मंगलवार', defaultRate: 5.0 },
  { id: 4, name: 'Wednesday', hindi: 'बुधवार', defaultRate: 5.0 },
  { id: 5, name: 'Thursday', hindi: 'गुरुवार', defaultRate: 5.0 },
  { id: 6, name: 'Friday', hindi: 'शुक्रवार', defaultRate: 5.0 },
  { id: 7, name: 'Saturday', hindi: 'शनिवार', defaultRate: 5.0 },
];

export default function PublicationForm({ 
  onClose, 
  publications = [], 
  publishers = [],
  rates = [],
  ratechanges = [],
  onSave,
  onDelete
}: PublicationFormProps) {
  const [selectedPub, setSelectedPub] = useState<Publication>({
    publica_id: 0,
    public_name: '',
    pub_hindi: '',
    abrv: '',
    publish_id: 0,
    type_p: '',
    circulation: '',
    duration: '',
    chr_del: 0,
    is_closed: false,
    is_permanent: false,
    closed_from: null,
    closed_to: null
  });

  const [isNewMode, setIsNewMode] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isPermanent, setIsPermanent] = useState(false);
  const [closedFrom, setClosedFrom] = useState('');
  const [closedTo, setClosedTo] = useState('');

  const [weekdayRates, setWeekdayRates] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0
  });

  const [publishingDay, setPublishingDay] = useState('');
  const [delChargesChecked, setDelChargesChecked] = useState(false);
  const [pubList, setPubList] = useState<Publication[]>(publications);

  useEffect(() => {
    if (publications && publications.length > 0) {
      setPubList(publications);
    }
  }, [publications]);

  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findTab, setFindTab] = useState<'all' | 'active' | 'closed' | 'permanent'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [msg, setMsg] = useState('');
  const [selectedDayRow, setSelectedDayRow] = useState<number>(1);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleCancel = () => {
    setIsNewMode(false);
    setSelectedPub({
      publica_id: 0,
      public_name: '',
      pub_hindi: '',
      abrv: '',
      publish_id: 0,
      type_p: '',
      circulation: '',
      duration: '',
      chr_del: 0,
      is_closed: false,
      is_permanent: false,
      closed_from: null,
      closed_to: null
    });
    setWeekdayRates({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
    setPublishingDay('');
    setDelChargesChecked(false);
    setIsClosed(false);
    setIsPermanent(false);
    setClosedFrom('');
    setClosedTo('');
    setMsg('Form cleared to blank.');
    setSearchTerm('');
    setIsFindOpen(false);
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
  };

  const loadPublication = (p: Publication) => {
    setIsNewMode(false);
    const hindiName = cleanOrTransliterateHindi(p.pub_hindi, p.public_name);
    const isPerm = Boolean(p.is_permanent || p.closed_to === '2099-12-31' || (p.closed_to && p.closed_to >= '2090-01-01'));
    const isClsd = Boolean(p.is_closed || isPerm);

    setSelectedPub({
      ...p,
      pub_hindi: hindiName,
      type_p: p.type_p || '',
      circulation: p.circulation || '',
      duration: p.duration || '',
      publish_id: p.publish_id || 0,
      is_closed: isClsd,
      is_permanent: isPerm
    });
    setDelChargesChecked(!!p.chr_del);
    setIsClosed(isClsd);
    setIsPermanent(isPerm);
    setClosedFrom(p.closed_from || '');
    setClosedTo(p.closed_to || '');

    // Load effective 7-day weekday rates with rate changes
    const effectiveRates = getEffectiveWeekdayRates(p.publica_id, new Date().toISOString().split('T')[0], rates, ratechanges);
    setWeekdayRates(effectiveRates);
  };

  const handleNew = () => {
    setIsNewMode(true);
    setSelectedPub({
      publica_id: 0,
      public_name: '',
      pub_hindi: '',
      abrv: '',
      publish_id: 0,
      type_p: '',
      circulation: '',
      duration: '',
      chr_del: 0,
      is_closed: false,
      is_permanent: false,
      closed_from: null,
      closed_to: null
    });
    setWeekdayRates({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
    setPublishingDay('');
    setDelChargesChecked(false);
    setIsClosed(false);
    setIsPermanent(false);
    setClosedFrom('');
    setClosedTo('');
    setMsg('NEW PUBLICATION MODE: Enter Name, Publisher, Type, and Rates. Click Save to assign new ID.');
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
  };

  // Auto-transliterate Hindi when English name is typed
  const handleNameChange = (newName: string) => {
    const autoHindi = cleanOrTransliterateHindi(undefined, newName);
    setSelectedPub(prev => ({
      ...prev,
      public_name: newName,
      pub_hindi: autoHindi || prev.pub_hindi
    }));
  };

  // Keyboard shortcut listener (F1 to copy Sunday rate, F10 to select Del Charges, F12 to unselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        copySundayRate();
      } else if (e.key === 'F10') {
        e.preventDefault();
        setDelChargesChecked(true);
        setMsg('F10: Delivery Charges Selected [ON]');
        setTimeout(() => setMsg(''), 2000);
      } else if (e.key === 'F12') {
        e.preventDefault();
        setDelChargesChecked(false);
        setMsg('F12: Delivery Charges Unselected [OFF]');
        setTimeout(() => setMsg(''), 2000);
      } else if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handleNew();
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
      } else if (e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsFindOpen(true);
      } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [weekdayRates, selectedPub, isNewMode, isClosed, isPermanent, closedFrom, closedTo]);

  const copySundayRate = () => {
    const sun = weekdayRates[1] || 0;
    const updated: Record<number, number> = {};
    WEEKDAYS.forEach(d => { updated[d.id] = sun; });
    setWeekdayRates(updated);
    setMsg(`F1 Triggered: Copied Sunday rate (₹${sun}) across all 7 weekdays!`);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleSave = async () => {
    if (!selectedPub.public_name.trim()) {
      setMsg('Error: Publication Name cannot be empty');
      setTimeout(() => setMsg(''), 3000);
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const pubToSave = {
      ...selectedPub,
      is_new: isNewMode || selectedPub.publica_id === 0,
      chr_del: delChargesChecked ? 1 : 0,
      rates: weekdayRates,
      is_closed: isClosed || isPermanent,
      is_permanent: isPermanent,
      closed_from: (isClosed || isPermanent) ? (closedFrom || todayStr) : null,
      closed_to: isPermanent ? '2099-12-31' : (isClosed ? (closedTo || '2050-03-31') : null)
    };

    try {
      const res = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pubToSave)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setIsNewMode(false);
      const saved = data.publication || pubToSave;
      setSelectedPub(saved);

      setPubList(prev => {
        const idx = prev.findIndex(p => p.publica_id === saved.publica_id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = saved;
          return updated;
        } else {
          return [...prev, saved];
        }
      });

      if (onSave) {
        onSave(saved);
      }
      setMsg(`Publication #${saved.publica_id} "${saved.public_name}" saved successfully with effective rates for current date!`);
    } catch (err: any) {
      setMsg(`Error saving publication: ${err.message}`);
    }
    setTimeout(() => setMsg(''), 4000);
  };

  const handleUpdate = () => {
    if (!selectedPub.publica_id || isNewMode) {
      setMsg('Error: Please select an existing publication first to update, or click Save to create new.');
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    handleSave();
  };

  const handleDelete = async () => {
    if (!selectedPub.publica_id || isNewMode) {
      setMsg('Error: Select an existing publication first to delete');
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    if (window.confirm(`Are you sure you want to delete publication #${selectedPub.publica_id} "${selectedPub.public_name}"?`)) {
      try {
        const res = await fetch(`/api/publications?id=${selectedPub.publica_id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (onDelete) onDelete(selectedPub.publica_id);
        setMsg(`Publication "${selectedPub.public_name}" deleted.`);
        setPubList(prev => {
          const remaining = prev.filter(p => p.publica_id !== selectedPub.publica_id);
          if (remaining.length > 0) {
            loadPublication(remaining[0]);
          } else {
            handleCancel();
          }
          return remaining;
        });
      } catch (err: any) {
        setMsg(`Error deleting: ${err.message}`);
      }
      setTimeout(() => setMsg(''), 3000);
    }
  };

  // Filtered publications for Find Modal with Active / Closed / Permanent Tabs
  const filtered = pubList.filter(p => {
    if (findTab === 'active' && (p.is_closed || p.is_permanent)) return false;
    if (findTab === 'closed' && (!p.is_closed || p.is_permanent)) return false;
    if (findTab === 'permanent' && !p.is_permanent) return false;

    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      p.public_name.toLowerCase().includes(s) ||
      (p.pub_hindi && p.pub_hindi.includes(s)) ||
      (p.abrv && p.abrv.toLowerCase().includes(s)) ||
      p.publica_id.toString().includes(s)
    );
  });

  const activeCount = pubList.filter(p => !p.is_closed && !p.is_permanent).length;
  const closedCount = pubList.filter(p => p.is_closed && !p.is_permanent).length;
  const permanentCount = pubList.filter(p => p.is_permanent).length;

  return (
    <div className="relative w-[760px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden">
      {/* Title Bar */}
      <div className="bg-gradient-to-r from-[#0A246A] via-[#3A6EA5] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📰</span>
          <span className="tracking-wide">Publication Info - {isNewMode ? '[NEW ENTRY]' : `[ID: #${selectedPub.publica_id}]`}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-5 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">_</button>
          <button className="w-5 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Body */}
      <div 
        className="p-4 flex flex-col justify-between bg-cover bg-center min-h-[520px]"
        style={{ backgroundImage: "url('/legacy_images/Publication.jpg'), linear-gradient(135deg, #F0F4F8 0%, #FFFFFF 100%)" }}
      >
        {/* Header with Title and Active/Closed Status */}
        <div className="flex items-center justify-between pb-2 border-b border-[#CCA000]/40">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-[#800000] tracking-wider uppercase font-sans">
              PUBLICATIONS
            </h1>
            <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 border border-blue-200">
              {isNewMode ? 'NEW PUBLICATION' : `ID: #${selectedPub.publica_id}`}
            </span>
          </div>

          {/* Status Badge */}
          <div>
            {isNewMode ? (
              <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-400 font-bold text-[11px] rounded-xs shadow-xs">
                ✨ Entering New Publication
              </span>
            ) : isPermanent ? (
              <span className="px-2.5 py-0.5 bg-red-700 text-white border border-red-900 font-bold text-[11px] rounded-xs shadow-xs flex items-center gap-1">
                🔴 PERMANENTLY CLOSED (स्थाई रूप से बंद)
              </span>
            ) : isClosed ? (
              <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-400 font-bold text-[11px] rounded-xs shadow-xs flex items-center gap-1">
                🟠 TEMPORARILY CLOSED (अस्थाई बंद)
              </span>
            ) : (
              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-400 font-bold text-[11px] rounded-xs shadow-xs flex items-center gap-1">
                🟢 ACTIVE (चालू)
              </span>
            )}
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-12 gap-y-1.5 gap-x-2 text-xs font-bold text-black items-center max-w-[670px] mx-auto w-full pt-1">
          {/* Publication Name */}
          <label className="col-span-4 text-right pr-2 text-[#800000]">Publication Name</label>
          <div className="col-span-8 flex items-center gap-1">
            <input 
              ref={nameInputRef}
              type="text" 
              value={selectedPub.public_name || ''} 
              onChange={(e) => handleNameChange(e.target.value)}
              className="flex-1 px-2 py-0.5 border border-[#7F9DB9] bg-white font-bold text-black text-xs shadow-inner outline-none focus:border-[#0A246A]"
              placeholder="e.g. THE TIMES OF INDIA, DAINIK NAVAJYOTI..."
              autoFocus
            />
            {isNewMode && (
              <span className="px-1.5 py-0.5 bg-yellow-200 text-yellow-900 text-[10px] font-bold border border-yellow-400">
                NEW
              </span>
            )}
          </div>

          {/* Pub. Name Hindi */}
          <label className="col-span-4 text-right pr-2 text-[#800000]">Pub. Name Hindi</label>
          <input 
            type="text" 
            value={selectedPub.pub_hindi || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, pub_hindi: e.target.value })}
            className="col-span-8 px-2 py-0.5 border border-[#7F9DB9] bg-white font-bold text-blue-900 text-xs shadow-inner outline-none focus:border-[#0A246A]"
            placeholder="हिंदी नाम"
          />

          {/* Abbreviation */}
          <label className="col-span-4 text-right pr-2 text-[#800000]">Abrevation</label>
          <input 
            type="text" 
            value={selectedPub.abrv || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, abrv: e.target.value })}
            className="col-span-8 px-2 py-0.5 border border-[#7F9DB9] bg-white text-black text-xs shadow-inner outline-none focus:border-[#0A246A]"
          />

          {/* Publisher */}
          <label className="col-span-4 text-right pr-2 text-[#800000]">Publisher</label>
          <select 
            value={selectedPub.publish_id || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, publish_id: Number(e.target.value) || 0 })}
            className="col-span-8 px-2 py-0.5 border border-[#7F9DB9] bg-white font-bold text-black text-xs outline-none focus:border-[#0A246A]"
          >
            <option value="">-- Select Publisher --</option>
            {publishers.map(p => (
              <option key={p.publish_id} value={p.publish_id}>{p.name}</option>
            ))}
          </select>

          {/* Type */}
          <label className="col-span-4 text-right pr-2 text-[#800000]">Type</label>
          <select 
            value={selectedPub.type_p || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, type_p: e.target.value })}
            className="col-span-8 px-2 py-0.5 border border-[#7F9DB9] bg-white font-bold text-black text-xs outline-none focus:border-[#0A246A]"
          >
            <option value="">-- Select Type --</option>
            <option value="Daily">Daily (दैनिक)</option>
            <option value="Weekly">Weekly (साप्ताहिक)</option>
            <option value="Monthly">Monthly (मासिक)</option>
            <option value="Fortnightly">Fortnightly (पाक्षिक)</option>
            <option value="Magzine">Magazine (पत्रिका)</option>
          </select>

          {/* Rate & Duration */}
          <label className="col-span-4 text-right pr-2 text-[#800000]">Rate</label>
          <div className="col-span-8 flex items-center gap-2">
            <input 
              type="number"
              step="0.05"
              value={weekdayRates[1] ? weekdayRates[1] : (weekdayRates[1] === 0 ? '0' : '')} 
              placeholder="0.00"
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setWeekdayRates({ ...weekdayRates, 1: val });
              }}
              className="w-28 px-2 py-0.5 border border-[#7F9DB9] bg-white text-center font-bold text-black text-xs shadow-inner outline-none"
            />
            <label className="text-[#800000] font-bold text-xs pl-2">Duration</label>
            <select 
              value={selectedPub.duration || ''} 
              onChange={(e) => setSelectedPub({ ...selectedPub, duration: e.target.value })}
              className="flex-1 px-2 py-0.5 border border-[#7F9DB9] bg-white font-bold text-black text-xs outline-none"
            >
              <option value="">-- Select Duration --</option>
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Fortnightly">Fortnightly</option>
            </select>
          </div>

          {/* Publishing Day */}
          <label className="col-span-4 text-right pr-2 text-[#800000]">Publishing Day</label>
          <select 
            value={publishingDay || ''}
            onChange={(e) => setPublishingDay(e.target.value)}
            className="col-span-8 px-2 py-0.5 border border-[#7F9DB9] bg-white font-bold text-black text-xs outline-none"
          >
            <option value="">-- Select Publishing Day --</option>
            <option value="Sunday">Sunday</option>
            <option value="Monday">Monday</option>
            <option value="Tuesday">Tuesday</option>
            <option value="Wednesday">Wednesday</option>
            <option value="Thursday">Thursday</option>
            <option value="Friday">Friday</option>
            <option value="Saturday">Saturday</option>
          </select>

          {/* Circulation */}
          <label className="col-span-4 text-right pr-2 text-[#800000]">Circulation</label>
          <select 
            value={selectedPub.circulation || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, circulation: e.target.value })}
            className="col-span-8 px-2 py-0.5 border border-[#7F9DB9] bg-white font-bold text-black text-xs outline-none"
          >
            <option value="">-- Select Circulation --</option>
            <option value="Morning">Morning (प्रातःकालीन)</option>
            <option value="Evening">Evening (सायंकालीन)</option>
            <option value="As Per Norm">As Per Norm (नियम अनुसार)</option>
          </select>

          {/* Closed / Discontinued / Permanent Close Status Section */}
          <div className="col-span-12 bg-white/95 border border-[#800000]/30 p-2 rounded-xs my-0.5 shadow-xs space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-amber-900 text-xs">
                  <input 
                    type="checkbox" 
                    checked={isClosed && !isPermanent} 
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (checked) {
                        setIsClosed(true);
                        setIsPermanent(false);
                        if (!closedFrom) setClosedFrom(new Date().toISOString().split('T')[0]);
                        if (!closedTo || closedTo === '2099-12-31') setClosedTo('2050-03-31');
                      } else {
                        if (!isPermanent) {
                          setIsClosed(false);
                          setClosedFrom('');
                          setClosedTo('');
                        }
                      }
                    }} 
                    className="cursor-pointer"
                  />
                  <span>🟠 Temporary Close (अस्थाई बंद)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer font-extrabold text-red-700 bg-red-50 px-2 py-0.5 border border-red-300 rounded-xs text-xs hover:bg-red-100">
                  <input 
                    type="checkbox" 
                    checked={isPermanent} 
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsPermanent(checked);
                      if (checked) {
                        setIsClosed(true);
                        if (!closedFrom) setClosedFrom(new Date().toISOString().split('T')[0]);
                        setClosedTo('2099-12-31');
                      } else {
                        setIsClosed(false);
                        setClosedFrom('');
                        setClosedTo('');
                      }
                    }} 
                    className="cursor-pointer accent-red-700"
                  />
                  <span>🔴 Permanently Close (स्थाई रूप से बंद)</span>
                </label>
              </div>

              {(isClosed || isPermanent) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsClosed(false);
                    setIsPermanent(false);
                    setClosedFrom('');
                    setClosedTo('');
                    setMsg('Publication reopened (चालू की गई). Click Save/Update to commit.');
                  }}
                  className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xs shadow-xs cursor-pointer"
                >
                  ✅ Reopen Publication (पुनः चालू करें)
                </button>
              )}
            </div>

            {isClosed && (
              <div className="flex items-center gap-3 font-bold text-slate-800 text-xs pt-1 border-t border-slate-200">
                <div className="flex items-center gap-1.5">
                  <span>Closed From:</span>
                  <input 
                    type="date" 
                    value={closedFrom} 
                    onChange={(e) => setClosedFrom(e.target.value)} 
                    className="px-1.5 py-0.5 border border-slate-400 bg-white text-xs font-mono font-bold text-blue-900"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span>To:</span>
                  {isPermanent ? (
                    <span className="px-2 py-0.5 bg-red-700 text-white font-mono font-bold text-xs rounded-xs">
                      2099-12-31 (Permanent / स्थाई)
                    </span>
                  ) : (
                    <input 
                      type="date" 
                      value={closedTo} 
                      onChange={(e) => setClosedTo(e.target.value)} 
                      className="px-1.5 py-0.5 border border-slate-400 bg-white text-xs font-mono font-bold text-blue-900"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Weekdays Rate Grid matching screenshot_02.jpg */}
        <div className="flex items-center justify-center gap-8 pt-2 pb-1">
          {/* Weekdays Grid */}
          <div className="w-[300px] bg-white border border-[#808080] shadow-sm">
            <div className="bg-[#ECE9D8] text-center font-bold text-xs py-1 border-b border-[#808080] text-[#000080] flex items-center justify-between px-2">
              <span>Weekdays Rate (दर विवरण)</span>
              <span className="text-[10px] text-slate-600">Effective Rates</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#ECE9D8] border-b border-[#808080]">
                  <th className="p-1 border-r text-left">Weekdays</th>
                  <th className="p-1 text-center w-24">Rate (₹)</th>
                </tr>
              </thead>
              <tbody>
                {WEEKDAYS.map((d) => (
                  <tr 
                    key={d.id}
                    onClick={() => setSelectedDayRow(d.id)}
                    className={`cursor-pointer border-b border-slate-200 ${selectedDayRow === d.id ? 'bg-[#316AC5] text-white font-bold' : 'hover:bg-blue-50 text-black'}`}
                  >
                    <td className="p-1 border-r">{d.name} ({d.hindi})</td>
                    <td className="p-0.5 text-center">
                      <input 
                        type="number"
                        step="0.25"
                        value={weekdayRates[d.id] ? weekdayRates[d.id] : (weekdayRates[d.id] === 0 ? '0' : '')}
                        placeholder="0.00"
                        onChange={(e) => setWeekdayRates({ ...weekdayRates, [d.id]: parseFloat(e.target.value) || 0 })}
                        className={`w-full text-center text-xs font-bold outline-none ${selectedDayRow === d.id ? 'bg-[#316AC5] text-white' : 'bg-transparent text-black'}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right Side Shortcut Labels & Checkbox */}
          <div className="space-y-3 text-xs font-bold">
            <div className="text-red-700 font-bold text-xs leading-relaxed">
              <div>F10 Select Del. Charges</div>
              <div>F12 Unselect Del. Charges</div>
            </div>
            
            <label className="flex items-center gap-2 cursor-pointer text-slate-900 font-bold text-xs">
              <input 
                type="checkbox" 
                checked={delChargesChecked}
                onChange={(e) => setDelChargesChecked(e.target.checked)}
                className="cursor-pointer"
              />
              <span>Del. Charges (डिलीवरी शुल्क)</span>
            </label>

            <div>
              <button 
                onClick={copySundayRate}
                className="px-3 py-1.5 bg-[#FFF4C8] hover:bg-[#FFE99A] border border-[#CCA000] text-black text-xs font-bold shadow-xs cursor-pointer rounded-xs"
              >
                Press F1: Copy Sunday Rate
              </button>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {msg && (
          <div className={`py-1 px-2 text-center text-xs font-bold my-1 ${msg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-300' : 'bg-emerald-50 text-emerald-800 border border-emerald-300'}`}>
            {msg}
          </div>
        )}

        {/* Action Buttons matching screenshot_02.jpg with New button */}
        <div className="flex items-center justify-center gap-2 pt-2 border-t border-[#808080]">
          {/* New / Add Button */}
          <button 
            onClick={handleNew}
            title="Alt+N: Create a clean new publication"
            className="px-3.5 py-1 bg-gradient-to-b from-[#FFF4C8] via-[#FFE99A] to-[#FFD84D] hover:from-[#FFFDEB] hover:to-[#FFE073] active:from-[#E6B800] border border-[#CCA000] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
          >
            <span className="transform skew-x-12 flex items-center gap-1 text-xs font-bold text-amber-950">
              ➕ <u>N</u>ew
            </span>
          </button>

          {/* Save Button */}
          <button 
            onClick={handleSave}
            title="Alt+S: Save publication and 7-day rate matrix"
            className="px-3.5 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
          >
            <span className="transform skew-x-12 flex items-center gap-1 text-xs font-bold text-black">
              💾 <u>S</u>ave
            </span>
          </button>
          
          {/* Update Button */}
          <button 
            onClick={handleUpdate}
            title="Update publication"
            className="px-3.5 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
          >
            <span className="transform skew-x-12 flex items-center gap-1 text-xs font-bold text-black">
              ↩ <u>U</u>pdate
            </span>
          </button>

          {/* Delete Button */}
          <button 
            onClick={handleDelete}
            title="Delete publication"
            className="px-3.5 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
          >
            <span className="transform skew-x-12 flex items-center gap-1 text-xs font-bold text-black">
              🗑 <u>D</u>el
            </span>
          </button>

          {/* Find Button */}
          <button 
            onClick={() => setIsFindOpen(true)}
            title="Alt+F: Find publications (Active and Closed)"
            className="px-3.5 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors ring-1 ring-blue-400"
          >
            <span className="transform skew-x-12 flex items-center gap-1 text-xs font-bold text-blue-900">
              🔍 <u>F</u>ind
            </span>
          </button>

          {/* Cancel Button */}
          <button 
            onClick={handleCancel}
            title="Alt+C: Cancel and clear all fields to blank"
            className="px-3.5 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
          >
            <span className="transform skew-x-12 flex items-center gap-1 text-xs font-bold text-black">
              ✖ <u>C</u>ancel
            </span>
          </button>

          {/* Exit Button */}
          <button 
            onClick={onClose}
            className="px-3.5 py-1 bg-gradient-to-b from-[#E6F4FE] via-[#C8E8FA] to-[#9FD6F4] hover:from-[#F0F8FF] hover:to-[#BCE4FA] active:from-[#89C7ED] active:to-[#D5EBFB] border border-[#006699] shadow-xs transform -skew-x-12 cursor-pointer transition-colors"
          >
            <span className="transform skew-x-12 flex items-center gap-1 text-xs font-bold text-red-800">
              🛑 <u>E</u>xit
            </span>
          </button>
        </div>
      </div>

      {/* Find Publication Modal Dialog with Active / Closed Filters */}
      {isFindOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-3">
          <div className="w-[660px] max-h-[480px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma text-xs">
            {/* Find Dialog Titlebar */}
            <div className="bg-[#0A246A] text-white px-2 py-1 font-bold flex justify-between items-center">
              <span>Find Publication ({filtered.length} Matching Records)</span>
              <button onClick={() => setIsFindOpen(false)} className="text-white hover:text-red-300 font-bold cursor-pointer">✕</button>
            </div>
            
            <div className="p-2.5 space-y-2 flex-1 overflow-hidden flex flex-col">
              {/* Search Box & Tab Filter */}
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="Search by Name, Hindi, Abbr, ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 px-2 py-1 border border-slate-400 bg-white font-bold outline-none text-blue-900"
                  autoFocus
                />
              </div>

              {/* Status Filter Tabs (All, Active, Temp Closed, Permanently Closed) */}
              <div className="flex items-center gap-1 border-b border-slate-300 pb-1">
                <button
                  type="button"
                  onClick={() => setFindTab('all')}
                  className={`px-2.5 py-1 font-bold text-xs rounded-t-xs border cursor-pointer ${findTab === 'all' ? 'bg-white border-slate-400 border-b-white text-blue-900 shadow-xs' : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'}`}
                >
                  All ({pubList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFindTab('active')}
                  className={`px-2.5 py-1 font-bold text-xs rounded-t-xs border cursor-pointer ${findTab === 'active' ? 'bg-white border-slate-400 border-b-white text-emerald-800 shadow-xs' : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'}`}
                >
                  🟢 Active ({activeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFindTab('closed')}
                  className={`px-2.5 py-1 font-bold text-xs rounded-t-xs border cursor-pointer ${findTab === 'closed' ? 'bg-white border-slate-400 border-b-white text-amber-800 shadow-xs' : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'}`}
                >
                  🟠 Temp Closed ({closedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFindTab('permanent')}
                  className={`px-2.5 py-1 font-bold text-xs rounded-t-xs border cursor-pointer ${findTab === 'permanent' ? 'bg-white border-slate-400 border-b-white text-red-700 shadow-xs' : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'}`}
                >
                  🔴 Perm Closed ({permanentCount})
                </button>
              </div>
              
              {/* Publication Grid */}
              <div className="flex-1 bg-white border border-slate-300 overflow-auto max-h-[300px]">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#ECE9D8] border-b font-bold text-slate-800">
                    <tr>
                      <th className="p-1.5 border-r text-left w-12">ID</th>
                      <th className="p-1.5 border-r text-left">Publication Name</th>
                      <th className="p-1.5 border-r text-left">Hindi Name</th>
                      <th className="p-1.5 border-r text-left w-20">Type</th>
                      <th className="p-1.5 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr 
                        key={p.publica_id}
                        onClick={() => {
                          loadPublication(p);
                          setIsFindOpen(false);
                        }}
                        className={`cursor-pointer border-b hover:bg-blue-100 ${p.is_permanent ? 'bg-red-50/70 text-red-950' : p.is_closed ? 'bg-amber-50/60 text-amber-950' : 'text-slate-900'}`}
                      >
                        <td className="p-1.5 border-r font-mono text-blue-900 font-bold">#{p.publica_id}</td>
                        <td className="p-1.5 border-r font-bold">{p.public_name}</td>
                        <td className="p-1.5 border-r font-bold text-blue-800">{cleanOrTransliterateHindi(p.pub_hindi, p.public_name) || '-'}</td>
                        <td className="p-1.5 border-r">{p.type_p || 'Daily'}</td>
                        <td className="p-1.5 text-center">
                          {p.is_permanent ? (
                            <span 
                              className="px-1.5 py-0.5 bg-red-700 text-white rounded-xs font-bold text-[10px] inline-block shadow-2xs"
                              title="Permanently closed"
                            >
                              🔴 Perm Closed
                            </span>
                          ) : p.is_closed ? (
                            <span 
                              className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-xs font-bold text-[10px] inline-block"
                              title={`Closed from ${p.closed_from || '-'} to ${p.closed_to || '-'}`}
                            >
                              🟠 Temp Closed
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xs font-bold text-[10px] inline-block">
                              🟢 Active
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-500 font-bold">
                          No {findTab !== 'all' ? findTab : ''} publications found matching &quot;{searchTerm}&quot;
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Bottom Close */}
            <div className="p-2 border-t bg-[#ECE9D8] flex justify-between items-center">
              <div className="text-[11px] text-slate-600 font-bold">
                Showing {filtered.length} publications ({activeCount} active, {closedCount} temp closed, {permanentCount} perm closed)
              </div>
              <button 
                onClick={() => setIsFindOpen(false)}
                className="px-4 py-1 bg-white border border-[#808080] font-bold text-xs cursor-pointer hover:bg-slate-100"
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
