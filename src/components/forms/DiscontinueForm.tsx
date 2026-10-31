'use client';

import { fyLabel } from '@/lib/financialYear';
import React, { useState, useEffect, useRef } from 'react';
import { Customer, Publication, Hawker } from '@/lib/types';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';

interface DiscontinueFormProps {
  onClose: () => void;
  publications?: Publication[];
  hawkers?: Hawker[];
}

// Helper to normalize publication objects and sort alphabetically (A to Z)
const normalizeAndSortPubs = (list: any[]) => {
  const cleaned = (list || []).map((p: any) => {
    const pid = Number(p.publica_id ?? p.publication_id ?? p.Publica_id ?? p.id ?? 0);
    const name = String(p.public_name || p.name || p.Public_name || (pid > 0 ? `Publication #${pid}` : '')).trim();
    const hindi = p.pub_hindi || p.Pub_Hindi || '';
    return {
      ...p,
      publica_id: pid,
      public_name: name,
      pub_hindi: hindi ? cleanOrTransliterateHindi(hindi, name) : ''
    };
  }).filter((p: any) => {
    const pid = Number(p.publica_id);
    const name = String(p.public_name || '');
    return pid > 0 && !isNaN(pid) && name.length > 0 && !name.toLowerCase().includes('nan');
  });

  // Alphabetical sort by Publication Name (A to Z)
  cleaned.sort((a: any, b: any) => a.public_name.localeCompare(b.public_name, undefined, { sensitivity: 'base' }));
  return cleaned;
};

export default function DiscontinueForm({ 
  onClose, 
  publications = [], 
  hawkers: initialHawkers = []
}: DiscontinueFormProps) {
  // Today's formatted dates
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayDdmmyyyy = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // ==========================================
  // CUSTOMER DISCONTINUE STATE
  // ==========================================
  const [entryDate, setEntryDate] = useState<string>(todayDdmmyyyy);
  const [periodStr, setPeriodStr] = useState<string>(fyLabel());

  // Customer Search & Selection
  const [custSearchTerm, setCustSearchTerm] = useState('');
  const [isSearchingCust, setIsSearchingCust] = useState(false);
  const [custSuggestions, setCustSuggestions] = useState<Customer[]>([]);
  const [showCustSuggestions, setShowCustSuggestions] = useState(false);
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);

  // Customer's Subscribed Publications
  const [customerSubs, setCustomerSubs] = useState<any[]>([]);
  const [selectedPubId, setSelectedPubId] = useState<string>('0'); // '0' = All Papers
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);

  // Publications & Hawkers & Regions
  const [pubList, setPubList] = useState<Publication[]>(() => normalizeAndSortPubs(publications));
  const [hawkerList, setHawkerList] = useState<Hawker[]>(initialHawkers);
  const [selectedHawkerId, setSelectedHawkerId] = useState<string>('');
  const [regionList, setRegionList] = useState<any[]>([]);
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>('all');

  // Discontinue Type & Dates
  const [holdType, setHoldType] = useState<'Temporary' | 'Permanent'>('Temporary');
  const [fromDate, setFromDate] = useState<string>(todayDdmmyyyy);
  const [toDate, setToDate] = useState<string>('');

  // Status & Feedback
  const [msg, setMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Find Modal State
  const [showFindModal, setShowFindModal] = useState(false);
  const [findSearch, setFindSearch] = useState('');
  const [allDiscontinues, setAllDiscontinues] = useState<any[]>([]);
  const [isLoadingDiscs, setIsLoadingDiscs] = useState(false);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Ensure client dates are synced to current system day
  useEffect(() => {
    const cur = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const dStr = `${p(cur.getDate())}/${p(cur.getMonth() + 1)}/${cur.getFullYear()}`;
    setEntryDate(dStr);
    setFromDate(dStr);
  }, []);

  // Load Regions
  useEffect(() => {
    fetch('/api/regions')
      .then(r => r.json())
      .then(d => {
        const regs = d.regions || (Array.isArray(d) ? d : []);
        setRegionList(regs);
      })
      .catch(() => {});
  }, []);

  // Sync publications (sorted alphabetically, no NaN)
  useEffect(() => {
    if (publications && publications.length > 0) {
      setPubList(normalizeAndSortPubs(publications));
    }
    fetch('/api/publications?with_rates=false')
      .then(r => r.json())
      .then(data => {
        const list = data.publications || (Array.isArray(data) ? data : []);
        if (list.length > 0) {
          setPubList(normalizeAndSortPubs(list));
        }
      })
      .catch(() => {
        fetch('/data/publications.json')
          .then(r => r.json())
          .then(list => {
            if (Array.isArray(list) && list.length > 0) {
              setPubList(normalizeAndSortPubs(list));
            }
          })
          .catch(() => {});
      });
  }, [publications]);

  // Load Hawkers if not provided
  useEffect(() => {
    fetch('/api/hawkers')
      .then(r => r.json())
      .then(data => {
        const hList = data.hawkers || (Array.isArray(data) ? data : []);
        const valid = hList.filter((h: any) => h.name && h.name.trim().length > 0);
        setHawkerList(valid);
      })
      .catch(() => {});
  }, []);

  // Global Keyboard shortcuts: F1 (Temporary), F2 (Permanent), Escape (Exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setHoldType('Temporary');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setHoldType('Permanent');
      } else if (e.key === 'Escape') {
        if (showFindModal) {
          setShowFindModal(false);
        } else if (showCustSuggestions) {
          setShowCustSuggestions(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFindModal, showCustSuggestions, onClose]);

  // Customer search by Name or ID with Region Filter
  const handleCustSearchChange = (val: string, regId: string = selectedRegionFilter) => {
    setCustSearchTerm(val);
    if (!val.trim()) {
      setCustSuggestions([]);
      setShowCustSuggestions(false);
      return;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      setIsSearchingCust(true);
      try {
        const regionParam = regId && regId !== 'all' ? `&region_id=${regId}` : '';
        const res = await fetch(`/api/customers?search=${encodeURIComponent(val.trim())}&limit=20${regionParam}`);
        if (res.ok) {
          const data = await res.json();
          setCustSuggestions(data.customers || []);
          setShowCustSuggestions(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingCust(false);
      }
    }, 200);
  };

  // Select customer from suggestion list
  const handleSelectCustomer = async (c: Customer) => {
    setSelectedCust(c);
    setCustSearchTerm(`${c.name_eng || ''} (#${c.customer_id})`);
    setFindSearch(String(c.customer_id)); // Auto-target Find to this selected customer
    setShowCustSuggestions(false);
    setMsg(null);

    // Auto-select customer's hawker
    if ((c as any).hawker_id) {
      setSelectedHawkerId(String((c as any).hawker_id));
    }

    // Fetch this customer's actual subscriptions to populate Publication dropdown accurately
    setIsLoadingSubs(true);
    try {
      const res = await fetch(`/api/subscriptions?customer_id=${c.customer_id}`);
      if (res.ok) {
        const data = await res.json();
        const subs = data.subscriptions || data.all_subscriptions || [];
        setCustomerSubs(subs);
        setSelectedPubId('0'); // Default to All Papers

        // If customer has a specific hawker on first active sub, sync that too
        const activeSub = subs.find((s: any) => s.is_active);
        if (activeSub?.hawker_id) {
          setSelectedHawkerId(String(activeSub.hawker_id));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSubs(false);
    }
  };

  // Auto-format continuous 8 digits to DD/MM/YYYY on display
  const formatDateDisplay = (val: string): string => {
    const s = val.trim().replace(/\D/g, '');
    if (s.length === 8) {
      return `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4, 8)}`;
    }
    return val;
  };

  // Date parsing helper (DD/MM/YYYY, DD-MM-YYYY, DDMMYYYY, or YYYY-MM-DD -> ISO)
  const toIsoDate = (val: string): string => {
    if (!val) return '';
    const s = val.trim();
    if (!s || s === '-' || s === '---') return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{8}$/.test(s)) {
      const yrFirst = parseInt(s.slice(0, 4), 10);
      if (yrFirst >= 1990 && yrFirst <= 2099) {
        return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      }
      return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
    }
    const parts = s.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return '';
  };

  // Save / Submit Discontinue Entry
  const handleSave = async () => {
    if (!selectedCust) {
      setMsg({ text: 'कृपया पहले ग्राहक का नाम खोजें और चुनें (Please search and select a Customer Name).', isError: true });
      return;
    }

    if (!fromDate) {
      setMsg({ text: 'कृपया फ्रॉम डेट (From Date) दर्ज करें.', isError: true });
      return;
    }

    if (holdType === 'Temporary' && !toDate) {
      setMsg({ text: 'अस्थाई छुट्टी के लिए समाप्ति दिनांक (To Date) दर्ज करें.', isError: true });
      return;
    }

    setIsSaving(true);
    setMsg(null);

    try {
      const fromIso = toIsoDate(fromDate);
      const toIso = holdType === 'Temporary' ? toIsoDate(toDate) : fromIso;
      const pubId = parseInt(selectedPubId, 10) || 0;

      const payload = {
        customer_id: selectedCust.customer_id,
        publica_id: pubId,
        temp_perma: holdType === 'Permanent' ? 'Permanent' : 'Temporary',
        temp_from: fromIso,
        temp_to: toIso,
        entry_date: todayIso,
        financial_year: periodStr.replace('-', '')
      };

      const res = await fetch('/api/discontinue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save discontinue record');

      setMsg({
        text: `✓ ${holdType === 'Permanent' ? 'स्थाई बंद (Permanent Stop)' : 'अस्थाई छुट्टी (Temporary Hold)'} सफलतापूर्वक दर्ज हुआ! (Saved for #${selectedCust.customer_id} ${selectedCust.name_eng})`,
        isError: false
      });

      // Refresh customer's subscriptions if permanent
      if (holdType === 'Permanent') {
        const subRes = await fetch(`/api/subscriptions?customer_id=${selectedCust.customer_id}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          setCustomerSubs(subData.subscriptions || []);
        }
      }

    } catch (err: any) {
      setMsg({ text: `त्रुटि (Error): ${err.message}`, isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to format ISO date YYYY-MM-DD to DD/MM/YYYY
  const formatIsoToDdmmyyyy = (iso: string | null | undefined): string => {
    if (!iso) return '-';
    const s = String(iso).trim();
    if (s.toLowerCase().startsWith('p') || s.toLowerCase().includes('permanent')) return 'Permanent';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    const parts = s.split(/[\/\-]/);
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return s;
  };

  // Load Discontinues for Find Dialog
  const handleOpenFind = async () => {
    setShowFindModal(true);
    setIsLoadingDiscs(true);
    if (selectedCust) {
      setFindSearch(String(selectedCust.customer_id));
    }
    try {
      const url = selectedCust 
        ? `/api/discontinue?customer_id=${selectedCust.customer_id}`
        : '/api/discontinue';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const list = (data.discontinues || []).sort((a: any, b: any) => (b.discontinue_id || 0) - (a.discontinue_id || 0));
        setAllDiscontinues(list);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDiscs(false);
    }
  };

  // Cancel / Reset Form
  const handleCancel = () => {
    setCustSearchTerm('');
    setSelectedCust(null);
    setCustomerSubs([]);
    setSelectedPubId('0');
    setHoldType('Temporary');
    setFromDate(todayDdmmyyyy);
    setToDate('');
    setMsg(null);
  };

  // Delete Discontinue Record (by ID)
  const handleDeleteRecord = async (discId: number) => {
    if (!confirm(`Are you sure you want to delete this customer discontinue record #${discId}?`)) return;
    try {
      const res = await fetch(`/api/discontinue?id=${discId}`, { method: 'DELETE' });
      if (res.ok) {
        setAllDiscontinues(prev => prev.filter(d => (d.discontinue_id || d.Discontinue_id) !== discId));
        alert(`Record #${discId} successfully deleted.`);
      } else {
        const d = await res.json();
        alert(`Delete failed: ${d.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  // Main Form Delete Button Action
  const handleMainDelete = async () => {
    if (!selectedCust) {
      handleOpenFind();
      return;
    }
    try {
      const res = await fetch(`/api/discontinue?customer_id=${selectedCust.customer_id}`, { cache: 'no-store' });
      const data = await res.json();
      const existing = data.discontinues || [];
      if (existing.length === 0) {
        alert(`No active discontinue entry found for Customer #${selectedCust.customer_id} (${selectedCust.name_eng}). Opening Find list.`);
        handleOpenFind();
        return;
      }

      const latest = existing[0];
      if (!confirm(`Are you sure you want to delete discontinue record #${latest.discontinue_id} for Customer #${selectedCust.customer_id} (${latest.temp_from} to ${latest.temp_to})?`)) return;

      await handleDeleteRecord(latest.discontinue_id);
      setMsg({ text: `✓ Discontinue entry #${latest.discontinue_id} deleted.`, isError: false });
      handleCancel();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Keyboard shortcut listener (Esc to close, Alt+S to save, Alt+F to find, Alt+C to cancel, Alt+E to exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showFindModal) {
          setShowFindModal(false);
        } else if (showCustSuggestions) {
          setShowCustSuggestions(false);
        } else {
          onClose();
        }
        return;
      }
      if (e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 's') {
          e.preventDefault();
          handleSave();
        } else if (k === 'f') {
          e.preventDefault();
          handleOpenFind();
        } else if (k === 'c') {
          e.preventDefault();
          handleCancel();
        } else if (k === 'd') {
          e.preventDefault();
          handleMainDelete();
        } else if (k === 'e') {
          e.preventDefault();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFindModal, showCustSuggestions, selectedCust, selectedPubId, fromDate, toDate, holdType]);

  return (
    <div className="relative w-full max-w-[590px] max-h-[calc(100vh-60px)] sm:max-h-[calc(100vh-70px)] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden text-xs my-auto shrink-0">
      
      {/* Title Bar matching screenshot_10.jpg */}
      <div className="bg-[#0A246A] text-white px-2 py-1 flex items-center justify-between font-bold shrink-0">
        <div className="flex items-center gap-1.5">
          <img 
            src="/legacy_images/paper.ico" 
            alt="ico" 
            className="w-4 h-4" 
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          <span className="text-xs tracking-wide">
            Customer Discontinue
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">_</button>
          <button className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between space-y-3 bg-[#ECE9D8] min-h-0">
        
        {/* CUSTOMER DISCONTINUE INFO (screenshot_10.jpg) */}
        <div className="space-y-2.5">
          {/* Header Title matching screenshot_10.jpg */}
          <div className="text-center">
            <h1 
              className="text-2xl font-black text-[#800000] tracking-wider uppercase" 
              style={{ fontFamily: 'Georgia, serif' }}
            >
              CUSTOMER DISCONTINUE INFO
            </h1>
          </div>

          {/* Date & Period Row */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <label className="font-bold text-[#800000] text-xs">Date</label>
              <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1 py-0.5 shadow-inner">
                <input 
                  type="text" 
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-24 text-center font-mono font-bold text-black outline-none bg-transparent"
                  placeholder="DD/MM/YYYY"
                />
              </div>
            </div>

            <div className="font-bold text-black text-xs">
              Period :- <span className="text-[#000080] font-mono">{periodStr}</span>
            </div>
          </div>

          {/* Customer Search Row with Region Filter */}
          <div className="space-y-2">
            {/* Region Filter */}
            <div className="flex items-center gap-2">
              <label className="w-28 font-bold text-[#000080] text-right shrink-0">
                Region Filter
              </label>
              <div className="flex-1">
                <select
                  value={selectedRegionFilter}
                  onChange={(e) => {
                    const regId = e.target.value;
                    setSelectedRegionFilter(regId);
                    if (custSearchTerm.trim()) {
                      handleCustSearchChange(custSearchTerm, regId);
                    }
                  }}
                  className="w-full px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner text-xs"
                >
                  <option value="all">-- All Regions (सभी क्षेत्र) --</option>
                  {regionList.map((r: any) => (
                    <option key={r.region_id || r.id} value={r.region_id || r.id}>
                      #{r.region_id || r.id} - {r.region_name || r.name} {r.hindi_name ? `(${r.hindi_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Customer Name Search (Search by Name, NOT by ID) */}
            <div className="relative">
              <div className="flex items-center gap-2">
                <label className="w-28 font-bold text-[#800000] text-right shrink-0">
                  Customer Name
                </label>
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={custSearchTerm}
                    onChange={(e) => handleCustSearchChange(e.target.value, selectedRegionFilter)}
                    onFocus={() => { if (custSuggestions.length > 0) setShowCustSuggestions(true); }}
                    placeholder="ग्राहक का नाम टाइप करके खोजें (Type name to search)..."
                    className="w-full px-2 py-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner"
                  />
                  {isSearchingCust && (
                    <span className="absolute right-2 top-1 text-[10px] text-slate-500 font-bold">
                      खोज जारी...
                    </span>
                  )}
                </div>
              </div>

              {/* Customer Autocomplete Dropdown */}
              {showCustSuggestions && custSuggestions.length > 0 && (
                <div className="absolute left-30 right-0 top-7 z-50 bg-white border border-[#808080] shadow-xl max-h-48 overflow-y-auto">
                  {custSuggestions.map((c: any) => {
                    const rName = regionList.find(r => Number(r.region_id || r.id) === Number(c.region_id))?.region_name || '';
                    return (
                      <div 
                        key={c.customer_id}
                        onClick={() => handleSelectCustomer(c)}
                        className="p-1.5 hover:bg-[#0A246A] hover:text-white cursor-pointer border-b border-slate-100 flex items-center justify-between text-xs"
                      >
                        <div>
                          <strong className="text-blue-900 group-hover:text-white font-mono">#{c.customer_id}</strong>
                          <span className="ml-1 font-bold">{c.name_eng}</span>
                          {c.name_hindi && (
                            <span className="ml-1 text-slate-600 group-hover:text-slate-200">
                              ({cleanOrTransliterateHindi(c.name_hindi, c.name_eng)})
                            </span>
                          )}
                        </div>
                        <div className="text-right text-[10px] text-slate-500 group-hover:text-slate-200">
                          {rName && <span className="font-bold text-emerald-800 group-hover:text-emerald-200 mr-1">[{rName}]</span>}
                          <span>{[c.add1, c.add2].filter(Boolean).join(', ') || ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Publication Dropdown - Populated according to the person */}
          <div className="flex items-center gap-2">
            <label className="w-28 font-bold text-[#800000] text-right shrink-0">
              Publication
            </label>
            <div className="flex-1">
              <select 
                value={selectedPubId}
                onChange={(e) => setSelectedPubId(e.target.value)}
                className="w-full px-2 py-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner"
              >
                <option value="0">All Papers (सभी अखबार/पत्रिका)</option>
                {customerSubs && customerSubs.length > 0 && (
                  <optgroup label="-- Customer's Subscribed Papers --">
                    {customerSubs
                      .map((sub: any) => {
                        const pId = Number(sub.publica_id || sub.publication_id);
                        const matched = pubList.find(p => p.publica_id === pId);
                        const pName = sub.publication_name || matched?.public_name || `Paper #${pId}`;
                        const isClosed = sub.is_active === false || (sub.c_date && sub.c_date !== '' && sub.c_date !== '-');
                        return { pId, pName, qty: sub.qty, isClosed, sno: sub.sno };
                      })
                      .filter(s => s.pId > 0 && !isNaN(s.pId) && !s.pName.includes('NaN'))
                      .sort((a, b) => a.pName.localeCompare(b.pName, undefined, { sensitivity: 'base' }))
                      .map(sub => (
                        <option key={`sub-${sub.sno || sub.pId}`} value={sub.pId}>
                          #{sub.pId} - {sub.pName} {sub.qty ? `(Qty: ${sub.qty})` : ''} {sub.isClosed ? '[ALREADY CLOSED]' : '[ACTIVE]'}
                        </option>
                      ))}
                  </optgroup>
                )}
                <optgroup label="-- All Publications (A to Z) --">
                  {pubList
                    .filter(p => !customerSubs.some((s: any) => Number(s.publica_id || s.publication_id) === p.publica_id))
                    .map(p => (
                      <option key={`pub-${p.publica_id}`} value={p.publica_id}>
                        #{p.publica_id} - {p.public_name} {p.pub_hindi ? `(${p.pub_hindi})` : ''}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Hawker Dropdown - Shows only hawker(s) delivering to this customer */}
          <div className="flex items-center gap-2">
            <label className="w-28 font-bold text-[#800000] text-right shrink-0">
              Hawker
            </label>
            <div className="flex-1">
              <select 
                value={selectedHawkerId}
                onChange={(e) => setSelectedHawkerId(e.target.value)}
                className="w-full px-2 py-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner"
              >
                {(() => {
                  // Determine hawkers delivering to this customer
                  if (selectedCust) {
                    const custHawkerIds = new Set<number>();
                    if ((selectedCust as any).hawker_id) {
                      custHawkerIds.add(Number((selectedCust as any).hawker_id));
                    }
                    customerSubs.forEach((s: any) => {
                      const hid = Number(s.hawker_id);
                      if (hid > 0) custHawkerIds.add(hid);
                    });

                    const matchedHawkers = Array.from(custHawkerIds).map(hid => {
                      const found = hawkerList.find(h => Number(h.hawker_id) === hid);
                      return found || {
                        hawker_id: hid,
                        name: `Hawker #${hid}`,
                        hindi_name: ''
                      };
                    });

                    if (matchedHawkers.length > 0) {
                      return (
                        <>
                          <option value="">-- Select Delivering Hawker --</option>
                          <optgroup label="-- Customer's Delivering Hawker(s) --">
                            {matchedHawkers.map((h: any) => (
                              <option key={`cust-hwk-${h.hawker_id}`} value={h.hawker_id}>
                                #{h.hawker_id} {h.name} {h.hindi_name ? `(${h.hindi_name})` : ''}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="-- All Other Hawkers --">
                            {hawkerList
                              .filter(h => !custHawkerIds.has(Number(h.hawker_id)))
                              .map((h: any) => (
                                <option key={`all-hwk-${h.hawker_id}`} value={h.hawker_id}>
                                  #{h.hawker_id} {h.name} {h.hindi_name ? `(${h.hindi_name})` : ''}
                                </option>
                              ))}
                          </optgroup>
                        </>
                      );
                    }
                  }

                  // Default when no customer selected yet
                  return (
                    <>
                      <option value="">-- Select Hawker --</option>
                      {hawkerList.map((h) => (
                        <option key={h.hawker_id} value={h.hawker_id}>
                          #{h.hawker_id} {h.name} {h.hindi_name ? `(${h.hindi_name})` : ''}
                        </option>
                      ))}
                    </>
                  );
                })()}
              </select>
            </div>
          </div>

          {/* Address & Subscription Details Inset Box matching screenshot_10.jpg */}
          <div className="ml-30 mr-1 p-2 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white shadow-inner min-h-[52px] text-[11px] text-slate-700">
            {selectedCust ? (
              <div className="space-y-0.5">
                <div>
                  <strong>Address:</strong> {[selectedCust.add1, selectedCust.add2].filter(Boolean).join(', ') || 'None'}
                </div>
                <div>
                  <strong>Active Papers:</strong> {
                    customerSubs.filter(s => s.is_active !== false && (!s.c_date || s.c_date === '-')).length > 0
                      ? customerSubs
                          .filter(s => s.is_active !== false && (!s.c_date || s.c_date === '-'))
                          .map(s => s.publication_name || `Pub #${s.publica_id}`)
                          .join(', ')
                      : <span className="text-red-700 font-bold">No active papers currently delivered</span>
                  }
                </div>
              </div>
            ) : (
              <span className="text-slate-400 italic">
                ग्राहक का चयन करने पर पता एवं चालू अखबार यहाँ दिखाई देंगे (Address & active papers will appear here)
              </span>
            )}
          </div>

          {/* Temporary / Permanent Group Box matching screenshot_10.jpg */}
          <fieldset className="border border-[#808080] p-3 mx-1 my-1 relative">
            <legend className="px-1.5 font-bold text-[#800000] text-xs">
              Temporary/Permanent
            </legend>

            {/* Checkboxes Row */}
            <div className="flex items-center justify-center gap-10 pb-2">
              <label className="flex items-center gap-1.5 font-bold text-black cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={holdType === 'Temporary'}
                  onChange={() => setHoldType('Temporary')}
                  className="cursor-pointer"
                />
                <span>Temporary (अस्थाई छुट्टी)</span>
              </label>

              <label className="flex items-center gap-1.5 font-bold text-black cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={holdType === 'Permanent'}
                  onChange={() => setHoldType('Permanent')}
                  className="cursor-pointer"
                />
                <span>Permanent (स्थाई बंद)</span>
              </label>
            </div>

            {/* From & To Dates */}
            <div className="flex items-center justify-center gap-8 pt-1">
              <div className="flex items-center gap-2">
                <label className="font-bold text-[#800000]">From</label>
                <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1.5 py-0.5 shadow-inner">
                  <input 
                    type="text" 
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    onBlur={() => setFromDate(formatDateDisplay(fromDate))}
                    placeholder="DD/MM/YYYY"
                    className="w-24 text-center font-mono font-bold text-black outline-none bg-transparent"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="font-bold text-[#800000]">To</label>
                <div className={`border border-t-[#808080] border-l-[#808080] border-r-white border-b-white px-1.5 py-0.5 shadow-inner ${holdType === 'Permanent' ? 'bg-slate-200 opacity-60' : 'bg-white'}`}>
                  <input 
                    type="text" 
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    onBlur={() => setToDate(formatDateDisplay(toDate))}
                    disabled={holdType === 'Permanent'}
                    placeholder={holdType === 'Permanent' ? '---' : 'DD/MM/YYYY'}
                    className="w-24 text-center font-mono font-bold text-black outline-none bg-transparent disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Hotkeys Hint matching screenshot_10.jpg */}
            <div className="text-center pt-2.5 font-bold text-[#800000] text-[11px]">
              F1 - Temporary &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; F2 - Permanent
            </div>
          </fieldset>

          {/* Customer Status Msg */}
          {msg && (
            <div className={`text-center py-1 px-2 border font-bold text-xs ${
              msg.isError 
                ? 'bg-red-100 text-red-900 border-red-300' 
                : 'bg-emerald-100 text-emerald-900 border-emerald-400'
            }`}>
              {msg.text}
            </div>
          )}
        </div>

        {/* Action Buttons matching VB6 (Save, Update, Delete, Find, Cancel, Exit) */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-1 pt-2 border-t border-[#808080] bg-[#ECE9D8] pb-1">
          <button 
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
          >
            <u>S</u>ave
          </button>

          <button 
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
          >
            <u>U</u>pdate
          </button>

          <button 
            type="button"
            onClick={handleMainDelete}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
          >
            <u>D</u>elete
          </button>

          <button 
            type="button"
            onClick={handleOpenFind}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
          >
            <u>F</u>ind
          </button>

          <button 
            type="button"
            onClick={handleCancel}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
          >
            <u>C</u>ancel
          </button>

          <button 
            type="button"
            onClick={onClose}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
          >
            <u>E</u>xit
          </button>
        </div>

      </div>

      {/* Find Modal Dialog (Search / Delete Discontinue Entries for Customer Discontinue) */}
      {showFindModal && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-3 z-50">
          <div className="bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl w-full h-[450px] flex flex-col font-tahoma text-xs">
            
            {/* Modal Title Bar */}
            <div className="bg-[#0A246A] text-white px-2 py-1 flex items-center justify-between font-bold">
              <span>Find Customer Discontinues (ग्राहक रोक सूची)</span>
              <button 
                onClick={() => setShowFindModal(false)}
                className="w-4 h-4 bg-[#ECE9D8] text-black text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-2 flex-1 flex flex-col justify-between overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <label className="font-bold text-[#800000]">Search:</label>
                <input 
                  type="text" 
                  value={findSearch}
                  onChange={(e) => setFindSearch(e.target.value)}
                  placeholder="Filter by Customer ID or Name..."
                  className="flex-1 px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold outline-none"
                />
              </div>

              {/* Table */}
              <div className="flex-1 bg-white border border-[#808080] overflow-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-[#ECE9D8] border-b border-[#808080]">
                    <tr>
                      <th className="p-1 border-r text-left">Customer Name</th>
                      <th className="p-1 border-r text-left">Publication</th>
                      <th className="p-1 border-r text-center">Type</th>
                      <th className="p-1 border-r text-center">From</th>
                      <th className="p-1 border-r text-center">To</th>
                      <th className="p-1 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allDiscontinues.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-500 font-bold">
                          {isLoadingDiscs ? 'Loading customer discontinue records...' : 'No customer discontinue records found.'}
                        </td>
                      </tr>
                    ) : (
                      allDiscontinues
                        .filter(d => {
                          if (!findSearch.trim()) return true;
                          const s = findSearch.toLowerCase();
                          return (
                            String(d.customer_id).includes(s) || 
                            String(d.customer_name || '').toLowerCase().includes(s) ||
                            String(d.customer_hindi || '').toLowerCase().includes(s) ||
                            String(d.publication_name || '').toLowerCase().includes(s) ||
                            String(d.region_name || '').toLowerCase().includes(s) ||
                            String(d.discontinue_id).includes(s)
                          );
                        })
                        .slice(0, 150)
                        .map((d) => {
                          const isPerm = String(d.temp_perma).toUpperCase().startsWith('P');
                          return (
                            <tr key={d.discontinue_id} className="border-b hover:bg-blue-50">
                              <td className="p-1 border-r">
                                <div className="font-bold text-blue-950">
                                  {d.customer_name || `Customer #${d.customer_id}`}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  #{d.customer_id} {d.region_name ? `• ${d.region_name}` : ''}
                                </div>
                              </td>
                              <td className="p-1 border-r">
                                <span className="font-bold text-slate-800">
                                  {d.publication_name || (d.publica_id ? `Paper #${d.publica_id}` : 'All Papers (सभी)')}
                                </span>
                              </td>
                              <td className="p-1 border-r text-center font-bold">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  isPerm ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {isPerm ? 'Permanent' : 'Temporary'}
                                </span>
                              </td>
                              <td className="p-1 border-r text-center font-mono font-bold">
                                {formatIsoToDdmmyyyy(d.temp_from || d.entry_date)}
                              </td>
                              <td className="p-1 border-r text-center font-mono font-bold">
                                {isPerm ? 'Permanent' : formatIsoToDdmmyyyy(d.temp_to)}
                              </td>
                              <td className="p-1 text-center">
                                <button 
                                  onClick={() => handleDeleteRecord(d.discontinue_id)}
                                  className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold cursor-pointer shadow-xs"
                                  title="Delete this entry"
                                >
                                  Del
                                </button>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-between items-center pt-2">
                <span className="font-bold text-slate-600 text-[11px]">
                  Total Records: {allDiscontinues.length}
                </span>
                <button 
                  onClick={() => setShowFindModal(false)}
                  className="px-3 py-0.5 bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] font-bold cursor-pointer hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
