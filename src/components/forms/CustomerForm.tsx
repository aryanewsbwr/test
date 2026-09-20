'use client';

import React, { useState, useEffect } from 'react';
import { Users, Plus } from 'lucide-react';
import { Customer, CustomerDetail, Publication, Hawker, Region } from '@/lib/types';
import { cleanOrTransliterateHindi, englishToHindiPhonetic, transliterateToHindiAsync } from '@/lib/transliteration';

interface Props {
  isOpen?: boolean;
  onClose: () => void;
  customer?: Customer | null;
  publications?: Publication[];
  hawkers?: Hawker[];
  regions?: Region[];
  onSelectCustomer?: (customer: Customer) => void;
  onSaveCustomer?: (customer: Partial<Customer>, subs: Partial<CustomerDetail>[]) => void;
}

function formatLegacyDate(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr.trim() === '' || dateStr === 'null') return '-';
  const clean = dateStr.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(clean)) return clean;
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const [y, m, d] = clean.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(clean);
  if (isNaN(d.getTime())) return clean;
  return d.toLocaleDateString('en-GB');
}

export default function CustomerForm({
  isOpen = true,
  onClose,
  customer,
  publications = [],
  hawkers = [],
  regions = [],
  onSelectCustomer,
  onSaveCustomer
}: Props) {
  // Form State
  const [selectedCustId, setSelectedCustId] = useState<number>(0);
  const [nameEng, setNameEng] = useState('');
  const [nameHindi, setNameHindi] = useState('');
  const [add1, setAdd1] = useState('');
  const [hindiAdd, setHindiAdd] = useState('');
  const [phone, setPhone] = useState('');
  const [regionId, setRegionId] = useState<number>(0);
  const [securityDeposit, setSecurityDeposit] = useState<number>(0);
  const [dueAmount, setDueAmount] = useState<number>(0);
  const [priority, setPriority] = useState<number>(1);
  const [isCustomerType, setIsCustomerType] = useState<boolean>(true);
  const [isSubAgentType, setIsSubAgentType] = useState<boolean>(false);
  const [isSusha05, setIsSusha05] = useState<boolean>(true);
  const [isSelf, setIsSelf] = useState<boolean>(true);
  const [isGovtSupply, setIsGovtSupply] = useState<boolean>(false);
  const [isNameHindiManual, setIsNameHindiManual] = useState(false);
  const [isAddHindiManual, setIsAddHindiManual] = useState(false);
  const nameDebounceTimer = React.useRef<NodeJS.Timeout | null>(null);
  const addDebounceTimer = React.useRef<NodeJS.Timeout | null>(null);

  // Subscriptions Table
  const [subscriptions, setSubscriptions] = useState<CustomerDetail[]>([]);
  const [subFilter, setSubFilter] = useState<'active' | 'all'>('active');
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);

  // Find Dialog State
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [status, setStatus] = useState('');

  // Sync with current customer prop
  useEffect(() => {
    if (!customer || !customer.customer_id) return;
    setSelectedCustId(customer.customer_id);
    setNameEng(customer.name_eng || '');
    setNameHindi(cleanOrTransliterateHindi(customer.name_hindi || '', customer.name_eng));
    setAdd1(customer.add1 || '');
    setHindiAdd(cleanOrTransliterateHindi(customer.hindi_add || '', customer.add1 || ''));
    setPhone(customer.phone || '');
    setRegionId(customer.region_id || regions[0]?.region_id || 1);
    setSecurityDeposit(customer.security_deposit || 0);
    setDueAmount(customer.dueamount || 0);
    setPriority(customer.priority || 1);
  }, [customer, regions]);

  // Load Subscriptions for current customer
  useEffect(() => {
    if (!selectedCustId) return;
    setIsLoadingSubs(true);
    fetch(`/api/subscriptions?customer_id=${selectedCustId}`)
      .then(r => r.json())
      .then(data => {
        setSubscriptions(data.subscriptions || []);
      })
      .catch(() => setSubscriptions([]))
      .finally(() => setIsLoadingSubs(false));
  }, [selectedCustId]);

  // Search when typing in Find Dialog
  useEffect(() => {
    if (!isFindOpen) return;
    const timer = setTimeout(() => {
      setIsSearching(true);
      fetch(`/api/customers?search=${encodeURIComponent(searchQuery)}&page=1&limit=50&order=desc`)
        .then(r => r.json())
        .then(data => {
          setSearchResults(data.customers || []);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, isFindOpen]);

  const handleCancel = () => {
    setSelectedCustId(0);
    setNameEng('');
    setNameHindi('');
    setAdd1('');
    setHindiAdd('');
    setPhone('');
    setRegionId(0);
    setSecurityDeposit(0);
    setDueAmount(0);
    setPriority(1);
    setSubscriptions([]);
    setStatus('');
    setIsCustomerType(true);
    setIsSubAgentType(false);
    setIsSelf(true);
    setIsGovtSupply(false);
    setSearchQuery('');
    setIsFindOpen(false);
  };

  // Keyboard shortcut handler (Alt+S, Alt+U, Alt+D, Alt+F, Alt+C, Alt+E, F1, Esc)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFindOpen) setIsFindOpen(false);
        else onClose();
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        handleAddSubscriptionRow();
        return;
      }
      if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 's' || key === 'u') {
          e.preventDefault();
          handleSave();
        } else if (key === 'd') {
          e.preventDefault();
          handleDeleteCustomer();
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
  }, [isOpen, isFindOpen, nameEng, nameHindi, add1, hindiAdd, phone, regionId, securityDeposit, dueAmount, priority, selectedCustId, subscriptions]);

  if (!isOpen) return null;

  const handleSelectFoundCustomer = (cust: Customer) => {
    setSelectedCustId(cust.customer_id);
    setNameEng(cust.name_eng || '');
    setNameHindi(cleanOrTransliterateHindi(cust.name_hindi || '', cust.name_eng));
    setAdd1(cust.add1 || '');
    setHindiAdd(cleanOrTransliterateHindi(cust.hindi_add || '', cust.add1 || ''));
    setPhone(cust.phone || '');
    setRegionId(cust.region_id || 1);
    setSecurityDeposit(cust.security_deposit || 0);
    setDueAmount(cust.dueamount || 0);
    setPriority(cust.priority || 1);
    if (onSelectCustomer) onSelectCustomer(cust);
    setIsFindOpen(false);
  };

  const handleNameEngChange = (val: string) => {
    setNameEng(val);
    if (!isNameHindiManual) {
      if (nameDebounceTimer.current) clearTimeout(nameDebounceTimer.current);
      nameDebounceTimer.current = setTimeout(async () => {
        if (!val.trim()) {
          setNameHindi('');
          return;
        }
        const converted = await transliterateToHindiAsync(val);
        setNameHindi(converted);
      }, 300);
    }
  };

  const handleAdd1Change = (val: string) => {
    setAdd1(val);
    if (!isAddHindiManual) {
      if (addDebounceTimer.current) clearTimeout(addDebounceTimer.current);
      addDebounceTimer.current = setTimeout(async () => {
        if (!val.trim()) {
          setHindiAdd('');
          return;
        }
        const converted = await transliterateToHindiAsync(val);
        setHindiAdd(converted);
      }, 300);
    }
  };

  const handleHindiFieldKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>, field: 'name' | 'add') => {
    if (e.key === ' ' || e.key === 'Enter') {
      const currentText = field === 'name' ? nameHindi : hindiAdd;
      const tokens = currentText.split(/(\s+)/);
      const lastToken = tokens[tokens.length - 1];
      if (lastToken && /[a-zA-Z]/.test(lastToken)) {
        e.preventDefault();
        const converted = await transliterateToHindiAsync(lastToken);
        tokens[tokens.length - 1] = converted + (e.key === ' ' ? ' ' : '');
        const updated = tokens.join('');
        if (field === 'name') {
          setNameHindi(updated);
          setIsNameHindiManual(true);
        } else {
          setHindiAdd(updated);
          setIsAddHindiManual(true);
        }
      }
    }
  };

  const handleAddSubscriptionRow = () => {
    const pub = publications[0];
    const hwk = hawkers[0];
    const newSub: CustomerDetail = {
      sno: subscriptions.length + 1,
      customer_id: selectedCustId,
      publica_id: pub?.publica_id || 1,
      publication_name: pub?.public_name || 'Newspaper',
      hawker_id: hwk?.hawker_id || 1,
      hawker_name: hwk?.name || 'Hawker',
      qty: 1,
      circulation: 'Daily',
      s_date: new Date().toISOString().split('T')[0],
      c_date: null,
      from_day: '1-7',
      dely: 0,
      dis: 0,
      is_active: true
    };
    setSubscriptions([...subscriptions, newSub]);
  };

  const handleDeleteSubscriptionRow = async (sno: number) => {
    const targetSub = subscriptions.find(s => s.sno === sno);
    if (targetSub && selectedCustId) {
      try {
        await fetch(`/api/subscriptions?customer_id=${selectedCustId}&sno=${sno}&publica_id=${targetSub.publica_id || ''}`, {
          method: 'DELETE'
        });
      } catch (err) {
        console.warn('Subscription delete warning:', err);
      }
    }
    setSubscriptions(subscriptions.filter(s => s.sno !== sno));
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustId) {
      setStatus('Please select or find a customer first to delete.');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    if (window.confirm(`Are you sure you want to delete Customer #${selectedCustId} (${nameEng})?`)) {
      try {
        const res = await fetch(`/api/customers?customer_id=${selectedCustId}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setStatus(`Customer #${selectedCustId} deleted successfully.`);
        handleCancel();
      } catch (err: any) {
        setStatus(`Error deleting customer: ${err.message}`);
      }
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const handleDiscontinueSubscriptionRow = async (sno: number) => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    const formattedToday = `${d}/${m}/${y}`;

    setSubscriptions(subscriptions.map(s => {
      if (s.sno === sno) {
        return {
          ...s,
          c_date: formattedToday,
          is_active: false
        };
      }
      return s;
    }));

    // Post to API
    const targetSub = subscriptions.find(s => s.sno === sno);
    if (targetSub) {
      try {
        await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'discontinue',
            customer_id: selectedCustId,
            publica_id: targetSub.publica_id || (targetSub as any).publication_id,
            c_date: `${y}-${m}-${d}`
          })
        });
      } catch (err) {
        console.warn('Discontinue API warning:', err);
      }
    }
  };

  const handleReactivateSubscriptionRow = (sno: number) => {
    setSubscriptions(subscriptions.map(s => {
      if (s.sno === sno) {
        return {
          ...s,
          c_date: null,
          is_active: true
        };
      }
      return s;
    }));
  };

  const handleSave = async () => {
    if (!nameEng.trim()) {
      setStatus('Error: Customer English Name is required.');
      return;
    }
    const updatedCust: Partial<Customer> = {
      customer_id: selectedCustId,
      name_eng: nameEng,
      name_hindi: nameHindi,
      add1,
      hindi_add: hindiAdd,
      phone,
      region_id: regionId,
      security_deposit: Number(securityDeposit),
      dueamount: Number(dueAmount),
      priority: Number(priority)
    };

    try {
      // Save directly to backend API (Supabase)
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCust)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const savedCust = data.customer || updatedCust;
      if (savedCust.customer_id) {
        setSelectedCustId(savedCust.customer_id);
      }

      // Prepend to search results so it is immediately visible in the find list
      setSearchResults(prev => [savedCust, ...prev.filter(c => c.customer_id !== savedCust.customer_id)]);

      if (onSaveCustomer) {
        onSaveCustomer(savedCust, subscriptions);
      }
      setStatus(`Customer #${savedCust.customer_id} - ${savedCust.name_eng} saved successfully!`);
    } catch (e: any) {
      console.warn('API save error:', e);
      setStatus(`Error saving customer: ${e.message || e}`);
    }
    setTimeout(() => setStatus(''), 3500);
  };

  return (
    <div className="w-full max-w-4xl bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl font-tahoma flex flex-col relative select-none">
      
      {/* Titlebar */}
      <div className="bg-linear-to-r from-[#0A246A] to-[#A6CAF0] text-white px-2 py-0.5 flex items-center justify-between font-bold text-xs">
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-yellow-300" />
          <span>Customer Info - [Customer ID: #{selectedCustId}]</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">_</button>
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Body matching screenshot_05.jpg */}
      <div className="p-3 space-y-2 text-xs">
        
        {/* Header Title */}
        <h2 className="text-center font-black text-[#000080] text-base tracking-wider">
          Customer Info
        </h2>

        {/* 2-Column Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start bg-pink-50/20 p-2.5 border border-pink-100 rounded-xs">
          
          {/* Left Column (2 Cols) */}
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center gap-2">
              <label className="w-24 font-bold text-slate-800">Name (Eng)</label>
              <input 
                type="text" 
                value={nameEng}
                onChange={(e) => handleNameEngChange(e.target.value)}
                placeholder="Type customer name in English..."
                className="flex-1 px-2 py-0.5 border border-[#808080] bg-white font-bold text-blue-900 shadow-inner"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="w-24 font-bold text-slate-800">Name (Hindi)</label>
              <div className="flex-1 flex gap-1">
                <input 
                  type="text" 
                  value={nameHindi}
                  onChange={(e) => {
                    setNameHindi(e.target.value);
                    setIsNameHindiManual(true);
                  }}
                  onKeyDown={(e) => handleHindiFieldKeyDown(e, 'name')}
                  placeholder="हिंदी नाम (ऑटो-ट्रांसलेट)..."
                  className="flex-1 px-2 py-0.5 border border-[#808080] bg-white font-bold text-indigo-900 shadow-inner"
                />
                <button 
                  type="button" 
                  onClick={async () => {
                    const converted = await transliterateToHindiAsync(nameEng);
                    setNameHindi(converted);
                    setIsNameHindiManual(false);
                  }}
                  className="px-2 py-0.5 bg-[#D4F0FF] hover:bg-[#BCE5FF] border border-[#006699] text-[10px] font-bold text-blue-900 cursor-pointer"
                  title="Translate to Hindi"
                >
                  अ/A
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-24 font-bold text-slate-800">Address</label>
              <input 
                type="text" 
                value={add1}
                onChange={(e) => handleAdd1Change(e.target.value)}
                placeholder="Type address in English..."
                className="flex-1 px-2 py-0.5 border border-[#808080] bg-white shadow-inner"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="w-24 font-bold text-slate-800">Add. (Hindi)</label>
              <div className="flex-1 flex gap-1">
                <input 
                  type="text" 
                  value={hindiAdd}
                  onChange={(e) => {
                    setHindiAdd(e.target.value);
                    setIsAddHindiManual(true);
                  }}
                  onKeyDown={(e) => handleHindiFieldKeyDown(e, 'add')}
                  placeholder="हिंदी पता..."
                  className="flex-1 px-2 py-0.5 border border-[#808080] bg-white shadow-inner"
                />
                <button 
                  type="button" 
                  onClick={async () => {
                    const converted = await transliterateToHindiAsync(add1);
                    setHindiAdd(converted);
                    setIsAddHindiManual(false);
                  }}
                  className="px-2 py-0.5 bg-[#D4F0FF] hover:bg-[#BCE5FF] border border-[#006699] text-[10px] font-bold text-blue-900 cursor-pointer"
                  title="Translate to Hindi"
                >
                  अ/A
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-24 font-bold text-slate-800">Region</label>
              <select 
                value={regionId || ''}
                onChange={(e) => setRegionId(Number(e.target.value) || 0)}
                className="flex-1 px-2 py-0.5 border border-[#808080] bg-white font-bold text-slate-800"
              >
                <option value="">-- Select Region --</option>
                {regions.map(r => (
                  <option key={r.region_id} value={r.region_id}>{r.region_name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <label className="font-bold text-slate-800 text-[11px]">Security Deposit</label>
                <input 
                  type="number" 
                  value={securityDeposit}
                  onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                  className="w-20 px-1.5 py-0.5 border border-[#808080] bg-white font-mono text-center font-bold"
                />
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold text-slate-800 text-[11px]">Due Amt.</label>
                <input 
                  type="number" 
                  value={dueAmount}
                  onChange={(e) => setDueAmount(Number(e.target.value))}
                  className="w-20 px-1.5 py-0.5 border border-[#808080] bg-white font-mono text-center font-bold text-red-700"
                />
              </div>
            </div>
          </div>

          {/* Right Column (Checkboxes & Extras matching screenshot_05.jpg) */}
          <div className="space-y-2 border-l border-slate-300 pl-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 cursor-pointer font-bold text-blue-900">
                <input type="checkbox" checked={isCustomerType} onChange={(e) => setIsCustomerType(e.target.checked)} />
                <span>Customer</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={isSubAgentType} onChange={(e) => setIsSubAgentType(e.target.checked)} />
                <span>Sub Agent</span>
              </label>
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <label className="flex items-center gap-1 cursor-pointer font-bold text-red-900">
                <input type="checkbox" checked={isSusha05} onChange={(e) => setIsSusha05(e.target.checked)} />
                <span>Susha 05</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-14 font-bold text-slate-800">Phone</label>
              <input 
                type="text" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1 px-1.5 py-0.5 border border-[#808080] bg-white font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="w-14 font-bold text-slate-800">Priority</label>
              <input 
                type="number" 
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-20 px-1.5 py-0.5 border border-[#808080] bg-white font-mono font-bold text-center"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 cursor-pointer font-bold text-emerald-900">
                <input type="checkbox" checked={isSelf} onChange={(e) => setIsSelf(e.target.checked)} />
                <span>Self</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={!isSelf} onChange={(e) => setIsSelf(!e.target.checked)} />
                <span>Other</span>
              </label>
            </div>

            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1 cursor-pointer font-bold text-purple-900 text-[11px]">
                <input type="checkbox" checked={isGovtSupply} onChange={(e) => setIsGovtSupply(e.target.checked)} />
                <span>Govt Supply</span>
              </label>
            </div>
          </div>

        </div>

        {/* Subscriptions Grid matching screenshot_05.jpg */}
        <div className="space-y-1">
          
          {/* Subscriptions Header with Active vs All Filter Tabs */}
          <div className="flex items-center justify-between pb-0.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSubFilter('active')}
                className={`px-2.5 py-0.5 text-xs font-bold border cursor-pointer ${
                  subFilter === 'active' 
                    ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs' 
                    : 'bg-[#ECE9D8] text-slate-800 border-slate-400 hover:bg-white'
                }`}
              >
                ● Active Deliveries (चालू अखबार: {subscriptions.filter(s => s.is_active !== false && (!s.c_date || s.c_date === '' || s.c_date === '-')).length})
              </button>
              <button
                type="button"
                onClick={() => setSubFilter('all')}
                className={`px-2.5 py-0.5 text-xs font-bold border cursor-pointer ${
                  subFilter === 'all' 
                    ? 'bg-indigo-700 text-white border-indigo-800 shadow-xs' 
                    : 'bg-[#ECE9D8] text-slate-800 border-slate-400 hover:bg-white'
                }`}
              >
                All Subscription History (सभी इतिहास: {subscriptions.length})
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span className="text-emerald-800">
                Active: {subscriptions.filter(s => s.is_active !== false && (!s.c_date || s.c_date === '' || s.c_date === '-')).length}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-red-800">
                Discontinued: {subscriptions.filter(s => s.is_active === false || (s.c_date && s.c_date !== '' && s.c_date !== '-')).length}
              </span>
            </div>
          </div>

          <div className="border border-[#808080] bg-white shadow-inner overflow-auto max-h-52">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#ECE9D8] text-slate-900 font-bold border-b sticky top-0 text-[11px]">
                <tr>
                  <th className="p-1 border-r text-center">S No</th>
                  <th className="p-1 border-r">Item (Publication)</th>
                  <th className="p-1 border-r text-center">HW/SA</th>
                  <th className="p-1 border-r">Hawker</th>
                  <th className="p-1 border-r text-center">Qty</th>
                  <th className="p-1 border-r text-center">Circulation</th>
                  <th className="p-1 border-r text-center">Def.Days</th>
                  <th className="p-1 border-r text-center">St.Dt.</th>
                  <th className="p-1 border-r text-center">Cl.Dt.</th>
                  <th className="p-1 border-r text-center">Dis.</th>
                  <th className="p-1 border-r text-center">Del.</th>
                  <th className="p-1 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingSubs ? (
                  <tr>
                    <td colSpan={12} className="p-4 text-center text-slate-500 font-bold">Loading subscriptions...</td>
                  </tr>
                ) : subscriptions.length > 0 ? (
                  (() => {
                    const displayed = subFilter === 'active' 
                      ? subscriptions.filter(s => s.is_active !== false && (!s.c_date || s.c_date === '' || s.c_date === '-'))
                      : subscriptions;

                    if (displayed.length === 0) {
                      return (
                        <tr>
                          <td colSpan={12} className="p-4 text-center text-slate-500 italic">
                            No active subscriptions. Switch to "All Subscription History" to view stopped papers.
                          </td>
                        </tr>
                      );
                    }

                    return displayed.map((sub, idx) => {
                      const isDiscontinued = sub.is_active === false || (sub.c_date && sub.c_date !== '' && sub.c_date !== '-');

                      return (
                        <tr 
                          key={sub.sno || idx} 
                          className={`border-b text-[11px] ${
                            isDiscontinued 
                              ? 'bg-red-50/70 hover:bg-red-100/60 text-slate-600' 
                              : 'hover:bg-emerald-50/50 text-slate-900'
                          }`}
                        >
                          <td className="p-1 border-r font-mono text-center">{idx + 1}</td>
                          <td className="p-1 border-r font-bold">
                            <div className="flex items-center gap-1.5">
                              <span className={isDiscontinued ? 'line-through text-slate-500' : 'text-blue-900'}>
                                {sub.publication_name || `Pub #${sub.publica_id}`}
                              </span>
                              {isDiscontinued && (
                                <span className="px-1 py-0.2 bg-red-100 text-red-800 border border-red-300 rounded text-[9px] font-bold">
                                  बंद / Stopped
                                </span>
                              )}
                              {sub.hold_info && !isDiscontinued && (
                                <span className="px-1 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[9px] font-bold">
                                  छुट्टी ({sub.hold_info.to})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-1 border-r font-mono text-center">HW</td>
                          <td className="p-1 border-r text-slate-700">{sub.hawker_name || `Hwk #${sub.hawker_id}`}</td>
                          <td className="p-1 border-r font-bold text-center font-mono">{sub.qty}</td>
                          <td className="p-1 border-r text-center">{sub.circulation || 'Morning'}</td>
                          <td className="p-1 border-r font-mono text-center">{sub.from_day || '1-7'}</td>
                          <td className="p-1 border-r font-mono text-center">{formatLegacyDate(sub.s_date)}</td>
                          <td className="p-1 border-r font-mono text-center">
                            {isDiscontinued ? (
                              <span className="font-bold text-red-700 bg-red-100/80 px-1 rounded">
                                {formatLegacyDate(sub.c_date)}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-1 border-r font-mono text-center">{sub.dis || 0}%</td>
                          <td className="p-1 border-r font-mono text-center">₹{sub.dely || 0}</td>
                          <td className="p-1 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {isDiscontinued ? (
                                <button 
                                  type="button"
                                  onClick={() => handleReactivateSubscriptionRow(sub.sno)}
                                  className="px-1.5 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-400 rounded text-[10px] font-bold cursor-pointer"
                                  title="Reactivate Subscription (पुनः चालू करें)"
                                >
                                  पुनः चालू
                                </button>
                              ) : (
                                <button 
                                  type="button"
                                  onClick={() => handleDiscontinueSubscriptionRow(sub.sno)}
                                  className="px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-400 rounded text-[10px] font-bold cursor-pointer"
                                  title="Stop Delivery / Discontinue Paper (अखबार बंद करें)"
                                >
                                  बंद करें
                                </button>
                              )}
                              <button 
                                type="button"
                                onClick={() => handleDeleteSubscriptionRow(sub.sno)}
                                className="text-red-600 hover:text-red-800 font-bold px-1"
                                title="Delete row"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()
                ) : (
                  <tr>
                    <td colSpan={12} className="p-3 text-center text-slate-500 italic">No newspaper subscriptions for this customer. Click [+ Insert Item] to add.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Red Legacy Shortcut Notice from screenshot_05.jpg */}
          <div className="flex items-center justify-between text-[11px] px-1">
            <span className="font-bold text-[#800000]">
              Note :- Press F1 to Insert Items - Press F2 to Delete Selected Items - Press F10 to Delete Empty Grid
            </span>
            <button 
              type="button"
              onClick={handleAddSubscriptionRow}
              className="px-2 py-0.5 bg-blue-100 hover:bg-blue-200 border border-blue-400 text-blue-900 font-bold rounded-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> + Insert Item
            </button>
          </div>
        </div>

        {status && (
          <div className="p-1.5 bg-emerald-100 text-emerald-800 border border-emerald-400 font-bold text-center text-xs">
            {status}
          </div>
        )}

        {/* Bottom Buttons matching screenshot_05.jpg */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-[#808080]">
          <button 
            onClick={handleSave}
            className="px-4 py-1 bg-[#D4F0FF] hover:bg-[#BCE5FF] border border-[#006699] text-black font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer"
          >
            💾 <u>S</u>ave
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-1 bg-[#D4F0FF] hover:bg-[#BCE5FF] border border-[#006699] text-black font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer"
          >
            ↪ <u>U</u>pdate
          </button>
          <button 
            onClick={handleDeleteCustomer}
            className="px-4 py-1 bg-[#D4F0FF] hover:bg-[#BCE5FF] border border-[#006699] text-black font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer"
          >
            🗑 <u>D</u>elete
          </button>
          <button 
            onClick={() => setIsFindOpen(true)}
            className="px-5 py-1 bg-[#D4F0FF] hover:bg-[#BCE5FF] border border-[#006699] text-black font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer ring-2 ring-blue-400"
          >
            🔍 <u>F</u>ind Customer
          </button>
          <button 
            onClick={handleCancel}
            title="Alt+C: Cancel and clear all customer fields to blank"
            className="px-4 py-1 bg-[#D4F0FF] hover:bg-[#BCE5FF] border border-[#006699] text-black font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer"
          >
            ✖ <u>C</u>ancel
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-1 bg-[#D4F0FF] hover:bg-[#BCE5FF] border border-[#006699] text-black font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer"
          >
            🛑 <u>E</u>xit
          </button>
        </div>

      </div>

      {/* Find Customer Popup Dialog */}
      {isFindOpen && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#ECE9D8] border-2 border-white shadow-2xl p-3 w-full max-w-xl space-y-2 text-xs flex flex-col max-h-[85vh]">
            <div className="bg-[#0A246A] text-white px-2 py-1 font-bold flex justify-between items-center">
              <span>Find Customer (ग्राहक खोजें - 24,581 Records)</span>
              <button onClick={() => setIsFindOpen(false)} className="text-white hover:text-red-300 font-bold">✕</button>
            </div>
            
            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Type Name, Hindi Name, Customer ID, or Phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-2.5 py-1 border border-slate-400 bg-white font-bold text-blue-900"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-auto border border-slate-300 bg-white max-h-72">
              {isSearching ? (
                <div className="p-4 text-center text-slate-500 font-bold">Searching 24,581 customers...</div>
              ) : searchResults.length > 0 ? (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#ECE9D8] sticky top-0 border-b font-bold">
                    <tr>
                      <th className="p-1.5 border-r">ID</th>
                      <th className="p-1.5 border-r">Customer Name</th>
                      <th className="p-1.5 border-r">Hindi Name</th>
                      <th className="p-1.5 border-r">Phone</th>
                      <th className="p-1.5">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map(c => (
                      <tr 
                        key={c.customer_id}
                        onClick={() => handleSelectFoundCustomer(c)}
                        className="border-b hover:bg-blue-100 cursor-pointer"
                      >
                        <td className="p-1.5 border-r font-mono font-bold text-blue-900">#{c.customer_id}</td>
                        <td className="p-1.5 border-r font-bold text-slate-800">{c.name_eng}</td>
                        <td className="p-1.5 border-r text-indigo-900 font-bold">{cleanOrTransliterateHindi(c.name_hindi || '', c.name_eng)}</td>
                        <td className="p-1.5 border-r font-mono text-slate-600">{c.phone || '-'}</td>
                        <td className="p-1.5">
                          <span className="px-2 py-0.5 bg-blue-700 text-white font-bold text-[10px] rounded-xs">
                            Select
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-4 text-center text-slate-500">Type in the search box to find any of the 24,581 customers.</div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button onClick={() => setIsFindOpen(false)} className="px-4 py-1 bg-[#ECE9D8] border border-black font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
