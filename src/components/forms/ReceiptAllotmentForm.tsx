'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ReceiptAllotmentFormProps {
  onClose: () => void;
}

interface AllotmentRow {
  sno: number;
  collector_name: string;
  receipt_from: number;
  receipt_to: number;
  allot_date: string;
  rec_date?: string | null;
}

export default function ReceiptAllotmentForm({ onClose }: ReceiptAllotmentFormProps) {
  // Starts 100% empty - no default collector pre-selected
  const [collectorName, setCollectorName] = useState('');
  const [collectors, setCollectors] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  
  // Allotments for selected collector
  const [allotments, setAllotments] = useState<AllotmentRow[]>([]);
  const [allAllotments, setAllAllotments] = useState<AllotmentRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // Inputs
  const [receiptFrom, setReceiptFrom] = useState('');
  const [receiptTo, setReceiptTo] = useState('');
  const [allotDate, setAllotDate] = useState('');
  const [recDate, setRecDate] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingSno, setEditingSno] = useState<number | null>(null);

  // Messages & Loading
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Refs for keyboard shortcuts & Enter navigation
  const dropdownRef = useRef<HTMLDivElement>(null);
  const collectorInputRef = useRef<HTMLInputElement>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const allotDateInputRef = useRef<HTMLInputElement>(null);
  const recDateInputRef = useRef<HTMLInputElement>(null);

  // Default date format DD/MM/YYYY
  const getTodayStr = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // 1. Initial Load: Fetch Collectors & Allotments (starts empty until collector selected)
  const fetchAllotments = async (targetCollector: string = '') => {
    setIsLoading(true);
    try {
      const url = targetCollector 
        ? `/api/receipt-allotment?collector_name=${encodeURIComponent(targetCollector)}` 
        : '/api/receipt-allotment';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        const rawAll = data.all_allotments || [];
        const rawFiltered = data.allotments || [];
        
        if (targetCollector.trim()) {
          setAllotments(sortAndIndexRows(rawFiltered));
        } else {
          setAllotments([]); // Clean & empty: no default entries shown until searched
        }
        setAllAllotments(rawAll);
        if (data.collectors && data.collectors.length > 0) {
          const sortedCols = [...data.collectors].sort((a, b) => 
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
          );
          setCollectors(sortedCols);
        }
      }
    } catch (err) {
      console.error('Failed to load allotments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllotments('');
    setAllotDate(getTodayStr());
    if (collectorInputRef.current) {
      collectorInputRef.current.focus();
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Date parser for sorting
  const parseDateToTimestamp = (dStr?: string | null): number => {
    if (!dStr) return 0;
    if (dStr.includes('/')) {
      const parts = dStr.split('/');
      if (parts.length === 3) {
        const dd = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return new Date(`${yyyy}-${mm}-${dd}`).getTime() || 0;
      }
    }
    if (dStr.includes('-')) {
      const parts = dStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return new Date(dStr).getTime() || 0;
      }
    }
    return 0;
  };

  const sortAndIndexRows = (rows: AllotmentRow[]): AllotmentRow[] => {
    return [...rows].sort((a, b) => (Number(a.sno) || 0) - (Number(b.sno) || 0));
  };

  // When collector changes, filter/fetch allotments
  const handleSelectCollector = (name: string) => {
    setCollectorName(name);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    setSelectedRowIndex(null);
    setIsEditing(false);
    setEditingSno(null);
    clearInputs();
    
    // Instant in-memory filter sorted by date
    if (name.trim()) {
      const matched = allAllotments.filter(a => (a.collector_name || '').toLowerCase() === name.trim().toLowerCase());
      setAllotments(sortAndIndexRows(matched));
    } else {
      setAllotments([]);
    }

    // Also fetch fresh from server
    fetchAllotments(name);
    if (fromInputRef.current) {
      fromInputRef.current.focus();
    }
  };

  // Auto-calculate next receipt range
  const handleSuggestNextRange = () => {
    let maxTo = 1000;
    if (allAllotments.length > 0) {
      maxTo = Math.max(...allAllotments.map(a => Number(a.receipt_to) || 0), 1000);
    }
    const nextFrom = maxTo + 1;
    const nextTo = nextFrom + 99; // 100-leaf receipt book
    setReceiptFrom(String(nextFrom));
    setReceiptTo(String(nextTo));
    setAllotDate(getTodayStr());
    setRecDate('');
    setIsEditing(false);
    setEditingSno(null);
    if (allotDateInputRef.current) allotDateInputRef.current.focus();
  };

  const clearInputs = () => {
    setReceiptFrom('');
    setReceiptTo('');
    setAllotDate(getTodayStr());
    setRecDate('');
    setIsEditing(false);
    setEditingSno(null);
  };

  // Select row for editing or marking return date
  const handleSelectRow = (row: AllotmentRow, idx: number) => {
    setSelectedRowIndex(idx);
    setReceiptFrom(String(row.receipt_from));
    setReceiptTo(String(row.receipt_to));
    setAllotDate(row.allot_date || getTodayStr());
    setRecDate(row.rec_date || '');
    setIsEditing(true);
    setEditingSno(row.sno);
  };

  // Save Allotment
  const handleSave = async () => {
    if (!collectorName || !collectorName.trim()) {
      setStatusMsg({ text: 'Please select or enter a Collector Name.', isError: true });
      if (collectorInputRef.current) collectorInputRef.current.focus();
      return;
    }

    if (!receiptFrom || !receiptTo) {
      setStatusMsg({ text: 'Please enter Receipt From and Receipt To numbers.', isError: true });
      if (!receiptFrom && fromInputRef.current) fromInputRef.current.focus();
      else if (toInputRef.current) toInputRef.current.focus();
      return;
    }

    const fromNum = parseInt(receiptFrom, 10);
    const toNum = parseInt(receiptTo, 10);

    if (isNaN(fromNum) || isNaN(toNum) || fromNum <= 0 || toNum <= 0) {
      setStatusMsg({ text: 'Please enter valid positive numbers for receipt range.', isError: true });
      return;
    }

    if (toNum < fromNum) {
      setStatusMsg({ text: 'Receipt To must be greater than or equal to Receipt From.', isError: true });
      return;
    }

    setIsLoading(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/receipt-allotment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collector_name: collectorName.trim(),
          receipt_from: fromNum,
          receipt_to: toNum,
          allot_date: allotDate || getTodayStr(),
          rec_date: recDate ? recDate.trim() : null,
          edit_sno: isEditing ? editingSno : undefined
        })
      });

      const data = await res.json();
      if (data.success) {
        setStatusMsg({ text: data.message || 'Receipt allotment saved successfully!' });
        setAllotments(data.allotments || []);
        setAllAllotments(data.all_allotments || []);
        clearInputs();
        setSelectedRowIndex(null);
        if (fromInputRef.current) fromInputRef.current.focus();
      } else {
        setStatusMsg({ text: data.error || 'Failed to save allotment.', isError: true });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Network error saving allotment.', isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Allotment Row
  const handleDeleteRow = async (sno: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete allotment SNO #${sno} for ${collectorName}?`)) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/receipt-allotment?collector_name=${encodeURIComponent(collectorName)}&sno=${sno}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ text: 'Allotment deleted successfully!' });
        setAllotments(data.allotments || []);
        setAllAllotments(data.all_allotments || []);
        clearInputs();
      } else {
        setStatusMsg({ text: data.error || 'Failed to delete allotment.', isError: true });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Error deleting allotment.', isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard shortcut listener: Alt+S -> Save, Alt+X / Esc -> Exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey && (e.key === 's' || e.key === 'S')) || (e.ctrlKey && e.key === 's')) {
        e.preventDefault();
        handleSave();
      } else if (e.altKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [collectorName, receiptFrom, receiptTo, allotDate, recDate, isEditing, editingSno]);

  return (
    <div className="d2-window relative w-[620px] max-w-[95vw] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden my-auto">
      
      {/* 1. Classic Title Bar (Matching media_1791524917718_364a84c2.png) */}
      <div className="d2-title bg-gradient-to-r from-[#0A246A] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          <img 
            src="/legacy_images/paper.ico" 
            alt="ico" 
            className="w-4 h-4" 
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          <span className="text-xs">Receipt Allotment</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* 2. Main Window Interior */}
      <div className="bg-white p-5 flex flex-col gap-3">
        
        {/* Top Section: Name Combobox + Action Buttons */}
        <div className="flex items-start justify-between gap-6">
          
          {/* Name Field with Combobox */}
          <div className="flex items-center gap-3 flex-1 pt-1">
            <label className="font-bold text-[#800000] text-sm shrink-0">Name</label>
            
            <div className="relative flex-1" ref={dropdownRef}>
              <div className="flex items-center border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white">
                <input 
                  ref={collectorInputRef}
                  type="text" 
                  value={collectorName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCollectorName(val);
                    setHighlightedIndex(-1);
                    setIsDropdownOpen(val.trim().length > 0);
                    if (val.trim()) {
                      const matched = allAllotments.filter(a => (a.collector_name || '').toLowerCase() === val.trim().toLowerCase());
                      setAllotments(sortAndIndexRows(matched));
                    } else {
                      setAllotments([]);
                    }
                  }}
                  onKeyDown={(e) => {
                    const filtered = collectors.filter(c => (c.name || '').toLowerCase().includes(collectorName.toLowerCase()));
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setIsDropdownOpen(true);
                      setHighlightedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
                    } else if (e.key === 'Enter') {
                      if (isDropdownOpen && highlightedIndex >= 0 && filtered[highlightedIndex]) {
                        e.preventDefault();
                        handleSelectCollector(filtered[highlightedIndex].name);
                      } else if (collectorName.trim()) {
                        setIsDropdownOpen(false);
                        handleSelectCollector(collectorName.trim());
                        if (fromInputRef.current) fromInputRef.current.focus();
                      }
                    } else if (e.key === 'Escape') {
                      setIsDropdownOpen(false);
                    }
                  }}
                  placeholder="Select or enter Collector Name..."
                  className="w-full px-2 py-1 font-bold text-black outline-none text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(prev => !prev);
                    setHighlightedIndex(-1);
                  }}
                  tabIndex={-1}
                  className="px-1.5 py-1 bg-[#ECE9D8] hover:bg-[#D4D0C8] border-l border-[#808080] cursor-pointer text-slate-700"
                  title="Show collectors list"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Collectors Autocomplete Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-0.5 bg-white border-2 border-[#808080] shadow-xl max-h-48 overflow-y-auto z-50 text-xs">
                  {collectors.filter(c => (c.name || '').toLowerCase().includes(collectorName.toLowerCase())).length > 0 ? (
                    collectors
                      .filter(c => (c.name || '').toLowerCase().includes(collectorName.toLowerCase()))
                      .map((c, idx) => {
                        const isHighlighted = highlightedIndex === idx;
                        return (
                          <div 
                            key={c.collect_id || idx}
                            onClick={() => handleSelectCollector(c.name)}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            className={`px-2 py-1.5 cursor-pointer font-bold border-b border-slate-100 flex justify-between items-center ${
                              isHighlighted ? 'bg-[#0A246A] text-white' : 'hover:bg-[#0A246A] hover:text-white'
                            }`}
                          >
                            <span>{c.name}</span>
                            <span className="text-[10px] opacity-70 font-mono">ID: #{c.collect_id}</span>
                          </div>
                        );
                      })
                  ) : (
                    <div className="p-2 text-slate-500 italic">No collectors found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Action Buttons (Matching slanted VB6 style) */}
          <div className="flex flex-col gap-2 shrink-0">
            <button 
              onClick={handleSave}
              disabled={isLoading}
              className="px-5 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center justify-center gap-1 text-xs font-bold text-black disabled:opacity-50 min-w-[85px]"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                💾 <u>S</u>ave
              </span>
            </button>
            <button 
              onClick={onClose}
              className="px-5 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center justify-center gap-1 text-xs font-bold text-black min-w-[85px]"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600 inline-block mr-0.5"></span>
                E<u>x</u>it
              </span>
            </button>
          </div>

        </div>

        {/* 3. The Authentic Allotment Data Grid (Matching media_1791524917718_364a84c2.png) */}
        <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white flex flex-col overflow-hidden">
          
          {/* Header Bar */}
          <div className="bg-[#D8D8D8] text-black text-xs font-bold grid grid-cols-12 border-b border-[#808080] py-1 text-center shadow-xs">
            <span className="col-span-2 border-r border-[#808080]">SNO</span>
            <span className="col-span-3 border-r border-[#808080]">Receipt From</span>
            <span className="col-span-3 border-r border-[#808080]">Receipt To</span>
            <span className="col-span-2 border-r border-[#808080]">Allot.Date</span>
            <span className="col-span-2">Rec.Date</span>
          </div>

          {/* Grid Rows with Dark Slate-Grey Backdrop */}
          <div className="bg-[#607080] min-h-[160px] max-h-[220px] overflow-y-auto text-xs font-mono text-white">
            {allotments.length > 0 ? (
              allotments.map((a, idx) => {
                const isSelected = selectedRowIndex === idx;
                return (
                  <div 
                    key={idx} 
                    onClick={() => handleSelectRow(a, idx)}
                    className={`grid grid-cols-12 border-b border-[#4D5B68] text-center py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#0A246A] text-yellow-300 ring-1 ring-yellow-400' : 'hover:bg-[#4E5C6B]'
                    }`}
                    title="Click to edit or mark return date"
                  >
                    <span className="col-span-2 border-r border-[#4D5B68]">{a.sno}</span>
                    <span className="col-span-3 border-r border-[#4D5B68] tracking-wider">{a.receipt_from}</span>
                    <span className="col-span-3 border-r border-[#4D5B68] tracking-wider">{a.receipt_to}</span>
                    <span className="col-span-2 border-r border-[#4D5B68]">{a.allot_date}</span>
                    <span className="col-span-2 flex items-center justify-center gap-1">
                      <span>{a.rec_date && a.rec_date !== '-' ? a.rec_date : '-'}</span>
                      {isSelected && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRow(a.sno, e)}
                          className="text-red-400 hover:text-red-200 p-0.5 ml-1"
                          title="Delete this allotment"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-300 italic text-xs">
                {collectorName.trim() ? `No receipt books allotted to "${collectorName}" yet.` : 'No collector selected. Search or select a Collector Name above.'}
              </div>
            )}
          </div>

        </div>

        {/* 4. Entry / Editor Controls Row */}
        <div className="bg-[#ECE9D8] p-2.5 border border-[#808080] flex items-center justify-between gap-2 text-xs">
          
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[#000080]">
              {isEditing ? `Edit Allotment #${editingSno}:` : 'New Allotment:'}
            </span>

            {/* Receipt From */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-700">From:</span>
              <input 
                ref={fromInputRef}
                type="number"
                value={receiptFrom}
                onChange={(e) => setReceiptFrom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (toInputRef.current) toInputRef.current.focus();
                  }
                }}
                placeholder=""
                className="w-16 px-1 py-0.5 border border-[#808080] bg-white font-mono font-bold text-black text-center text-xs"
              />
            </div>

            {/* Receipt To */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-700">To:</span>
              <input 
                ref={toInputRef}
                type="number"
                value={receiptTo}
                onChange={(e) => setReceiptTo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (allotDateInputRef.current) allotDateInputRef.current.focus();
                  }
                }}
                placeholder=""
                className="w-16 px-1 py-0.5 border border-[#808080] bg-white font-mono font-bold text-black text-center text-xs"
              />
            </div>

            {/* Allot Date */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-700">Allot:</span>
              <input 
                ref={allotDateInputRef}
                type="text"
                value={allotDate}
                onChange={(e) => setAllotDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (recDateInputRef.current) recDateInputRef.current.focus();
                  }
                }}
                placeholder="DD/MM/YYYY"
                className="w-20 px-1 py-0.5 border border-[#808080] bg-white font-mono font-bold text-black text-center text-xs"
              />
            </div>

            {/* Return Date */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-700">Return:</span>
              <input 
                ref={recDateInputRef}
                type="text"
                value={recDate}
                onChange={(e) => setRecDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave();
                  }
                }}
                placeholder="DD/MM/YYYY"
                className="w-20 px-1 py-0.5 border border-[#808080] bg-white font-mono font-bold text-black text-center text-xs"
                title="Leave blank until receipt book is returned"
              />
            </div>
          </div>

          {/* Quick Helper Button: Suggest Next Book */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleSuggestNextRange}
              className="px-2 py-0.5 bg-white hover:bg-blue-50 border border-blue-600 text-blue-900 font-bold text-[11px] cursor-pointer flex items-center gap-0.5 shadow-xs"
              title="Auto-calculate next available receipt book range (100 receipts)"
            >
              <Plus className="w-3 h-3" />
              <span>Next Book</span>
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={clearInputs}
                className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-500 font-bold text-[11px] cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

        </div>

        {/* Status Message Notification */}
        {statusMsg && (
          <div className={`text-center text-xs font-bold py-1 px-2 border flex items-center justify-center gap-1.5 ${
            statusMsg.isError 
              ? 'bg-rose-50 text-rose-800 border-rose-300' 
              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
          }`}>
            {statusMsg.isError ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

      </div>

    </div>
  );
}

