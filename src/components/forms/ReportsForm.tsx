'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Printer, RefreshCw, Search, Download, ZoomIn, ZoomOut, 
  ChevronLeft, ChevronRight, FileText, X, Filter, Calendar,
  ArrowLeft, Eye, SlidersHorizontal, CheckSquare
} from 'lucide-react';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { Bill4in1Preview } from '@/components/reports/Bill4in1Preview';
import { BillThermalPreview } from '@/components/reports/BillThermalPreview';
import { printBills4in1 } from '@/lib/bill4in1Export';
import { printBillsThermal58mm } from '@/lib/billThermalExport';

interface ReportsFormProps {
  onClose: () => void;
  initialReport?: string;
  initialRegion?: number | string;
  initialHawker?: number | string;
  initialPub?: number | string;
  regions?: any[];
  hawkers?: any[];
  publications?: any[];
  periodMonth: string;
  periodStartYear: number;
}

type WaRegionStatus = Record<string, { total: number; sent: number; manual: number }>;

// Regions starting with Z are hidden from Region Wise Bill Printing (same rule in /api/reports)
const isHiddenBillRegion = (name: unknown) => /^\s*z/i.test(String(name || ''));

// Last WhatsApp region counts per month, so the dropdown is red straight away while it refreshes
const waRegionCache = new Map<string, WaRegionStatus>();

const REPORT_INFO: Record<string, { title: string; category: string; hasRegion?: boolean; hasHawker?: boolean; hasPub?: boolean; hasPeriod?: boolean; hasCustId?: boolean }> = {
  bill_print_region: { title: 'Region Wise Bill Printing', category: 'Bill Printing', hasRegion: true, hasPeriod: true },
  bill_print_single: { title: 'Single Bill Printing', category: 'Bill Printing', hasCustId: true, hasPeriod: true },
  bill_paid_report: { title: 'Bill Paid Report', category: 'Bill Printing', hasRegion: true, hasPeriod: true },
  hawker_daily_qty: { title: 'Daily Quantity of Newspaper', category: 'Hawker Wise Report', hasHawker: true, hasRegion: true, hasPeriod: true },
  hawker_magazine_qty: { title: 'Quantity of Magazine', category: 'Hawker Wise Report', hasHawker: true, hasPeriod: true },
  dues_ledger: { title: 'Customer Outstanding Dues Ledger', category: 'Outstanding Report', hasRegion: true },
  previous_dues_wise: { title: 'Previous Dues Wise Report', category: 'Outstanding Report', hasRegion: true },
  due_region_summary: { title: 'Due Region Wise Summary', category: 'Outstanding Report' },
  collection_agent_dues: { title: 'Collection Agent Dues Report', category: 'Outstanding Report', hasPeriod: true },
  cust_detail_month: { title: 'Customer Detail / Month Register', category: 'Customer', hasRegion: true, hasPeriod: true },
  cust_pub_starting: { title: 'Customer Publication Starting', category: 'Customer', hasPub: true, hasHawker: true },
  circ_type_pub: { title: 'Circulation Type Publication Report', category: 'Customer' },
  cust_choose_pub: { title: 'Customer Wise Choose Publication', category: 'Customer', hasPub: true },
  discontinue_datewise: { title: 'Discontinue Date Wise', category: 'Discontinue', hasPeriod: true },
  discontinue_hawkerwise: { title: 'Discontinue Hawker Wise With Address', category: 'Discontinue', hasHawker: true },
  purchase_datewise: { title: 'Purchase Date Wise Report', category: 'Purchase', hasPeriod: true },
  purchase_publisherwise: { title: 'Purchase Publisher Wise', category: 'Purchase' },
  countersale_datewise: { title: 'Counter Sale Date Wise', category: 'Counter Sale', hasPeriod: true },
  countersale_pubwise: { title: 'Counter Sale Publication Wise', category: 'Counter Sale', hasPub: true },
  retailsale_region_datewise: { title: 'Retail Sale Region Date Wise Report', category: 'Retail Customer Sale To Permanent', hasRegion: true, hasPeriod: true },
  receipt_nowise: { title: 'Receipt Number Wise Report', category: 'Reciept', hasPeriod: true },
  receipt_realamt: { title: 'Actual Amount Receipt Report', category: 'Reciept', hasPeriod: true },
  hawker_cust_priority: { title: "Hawker's Customer Priority", category: "Hawker's Customer Priority", hasHawker: true },
  sticker_printing: { title: 'Sticker Printing', category: 'Sticker Printing', hasRegion: true },
  consolidated_sale: { title: 'Consolidated Sale Report', category: 'Sale', hasPeriod: true },
  daily_sale: { title: 'Daily / Periodic Sale Report', category: 'Sale', hasPeriod: true },
  region_pub_daily: { title: 'Region Wise Publication Report', category: 'Publication Daily Report', hasRegion: true, hasPeriod: true },
  region_start_end: { title: 'Region-Wise Start End Report', category: 'Publication Daily Report', hasRegion: true, hasPeriod: true },
  hawker_report_datewise: { title: 'Hawker Report Datewise', category: 'Hawker Report Datewise', hasPeriod: true },
  collection_hawker_datewise: { title: 'Collection Hawker Datewise', category: 'Collection Hawker Datewise', hasHawker: true, hasPeriod: true },
  collection_datewise: { title: 'Collection Datewise', category: 'Collection Datewise', hasPeriod: true },
};

export default function ReportsForm({ 
  onClose, 
  initialReport = 'hawker_daily_qty',
  initialRegion = 'all',
  initialHawker = 'all',
  initialPub = 'all',
  regions: propsRegions = [],
  hawkers: propsHawkers = [],
  publications: propsPubs = [],
  periodMonth,
  periodStartYear
}: ReportsFormProps) {
  const [viewMode, setViewMode] = useState<'criteria' | 'preview'>('criteria');
  const [activeReport, setActiveReport] = useState<string>(initialReport);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filters / Parameters
  const [regions, setRegions] = useState<any[]>(propsRegions || []);
  const [hawkers, setHawkers] = useState<any[]>(propsHawkers || []);
  const [publications, setPublications] = useState<any[]>(propsPubs || []);
  const [selectedRegion, setSelectedRegion] = useState<string>(initialRegion !== undefined && initialRegion !== 'undefined' ? String(initialRegion) : 'all');
  const [selectedHawker, setSelectedHawker] = useState<string>(initialHawker !== undefined && initialHawker !== 'undefined' ? String(initialHawker) : 'all');
  const [selectedPub, setSelectedPub] = useState<string>(initialPub !== undefined && initialPub !== 'undefined' ? String(initialPub) : 'all');
  const [selectedMonth, setSelectedMonth] = useState<string>(periodMonth);
  const [selectedYear, setSelectedYear] = useState<string>(String(periodStartYear));
  const [targetCustId, setTargetCustId] = useState<string>('');
  const [selectedCustName, setSelectedCustName] = useState<string>('');
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState<boolean>(false);
  const [highlightedCustIndex, setHighlightedCustIndex] = useState<number>(0);
  const [billBatchLimit, setBillBatchLimit] = useState<number>(0);
  const [billPrintMode, setBillPrintMode] = useState<'detail' | 'simple'>('simple');
  const [billPrinterType, setBillPrinterType] = useState<'4in1_a4' | 'thermal_58mm'>('4in1_a4');
  // WhatsApp sent counts per region for the selected month
  const [waRegionStatus, setWaRegionStatus] = useState<WaRegionStatus>({});
  const [waRegionError, setWaRegionError] = useState('');
  const [isUpdatingWaRegion, setIsUpdatingWaRegion] = useState(false);

  // Report Data
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadWaRegionStatus = useCallback(async () => {
    const cacheKey = `${selectedMonth}|${selectedYear}`;
    setWaRegionStatus(waRegionCache.get(cacheKey) || {});
    try {
      const params = new URLSearchParams({ month: selectedMonth, year: selectedYear });
      const res = await fetch(`/api/whatsapp/regions?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load WhatsApp region status');
      waRegionCache.set(cacheKey, data.regions || {});
      setWaRegionStatus(data.regions || {});
      setWaRegionError('');
    } catch (err: any) {
      console.warn('WhatsApp region status error:', err);
      setWaRegionStatus({});
      setWaRegionError('Could not check which regions were already sent on WhatsApp.');
    }
  }, [selectedMonth, selectedYear]);

  // Follow the app's Period, including when it is changed while this form is open
  useEffect(() => {
    setSelectedMonth(periodMonth);
    setSelectedYear(String(periodStartYear));
  }, [periodMonth, periodStartYear]);

  // Sync initialReport when prop changes
  useEffect(() => {
    if (initialReport) {
      setActiveReport(initialReport);
      setCurrentPage(1);
      setViewMode('criteria');
      setErrorMessage(null);
    }
  }, [initialReport]);

  // Load Dropdown Metadata with API & Local Fallback
  useEffect(() => {
    if (propsRegions && propsRegions.length > 0) {
      setRegions(propsRegions);
    } else {
      fetch('/api/regions')
        .then(r => r.json())
        .then(d => {
          if (d.regions && d.regions.length > 0) setRegions(d.regions);
          else if (Array.isArray(d)) setRegions(d);
        })
        .catch(() => {
          fetch('/data/regions.json').then(r => r.json()).then(d => setRegions(d || [])).catch(() => {});
        });
    }

    if (propsHawkers && propsHawkers.length > 0) {
      setHawkers(propsHawkers);
    } else {
      fetch('/api/hawkers')
        .then(r => r.json())
        .then(d => {
          if (d.hawkers && d.hawkers.length > 0) setHawkers(d.hawkers);
          else if (Array.isArray(d)) setHawkers(d);
        })
        .catch(() => {
          fetch('/data/hawkers.json').then(r => r.json()).then(d => setHawkers(d || [])).catch(() => {});
        });
    }

    if (propsPubs && propsPubs.length > 0) {
      setPublications(propsPubs);
    } else {
      fetch('/api/publications?with_rates=true')
        .then(r => r.json())
        .then(d => {
          if (d.publications && d.publications.length > 0) setPublications(d.publications);
          else if (Array.isArray(d)) setPublications(d);
        })
        .catch(() => {
          fetch('/data/publications.json').then(r => r.json()).then(d => setPublications(d || [])).catch(() => {});
        });
    }
  }, [propsRegions, propsHawkers, propsPubs]);

  // Live search customers for autocomplete in Single Bill Printing
  const handleCustomerSearch = useCallback(async (query: string) => {
    setTargetCustId(query);
    setSelectedCustName('');
    const q = query.trim();
    if (!q) {
      setCustomerSuggestions([]);
      setIsCustomerDropdownOpen(false);
      return;
    }

    setIsSearchingCustomers(true);
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=15`);
      const data = await res.json();
      const list = data?.customers || (Array.isArray(data) ? data : []);
      setCustomerSuggestions(list);
      setHighlightedCustIndex(0);
      setIsCustomerDropdownOpen(list.length > 0);
    } catch (err) {
      console.warn('Customer search error:', err);
    } finally {
      setIsSearchingCustomers(false);
    }
  }, []);

  const handleSelectCustomer = (cust: any) => {
    setTargetCustId(String(cust.customer_id));
    setSelectedCustName(cust.name_eng || cust.name_hindi || `Customer #${cust.customer_id}`);
    setIsCustomerDropdownOpen(false);
  };

  // Fetch Report Data from API
  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
        type: activeReport,
        region_id: selectedRegion,
        hawker_id: selectedHawker,
        publica_id: selectedPub,
        month: selectedMonth,
        year: selectedYear,
        page: String(currentPage),
        limit: activeReport.includes('bill_print') ? (billBatchLimit === 0 ? '9999' : String(billBatchLimit)) : '50',
        search: targetCustId || searchQuery
      });

      const res = await fetch(`/api/reports?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setReportData(json);
        setTotalPages(json.total_pages || 1);
        setErrorMessage(null);
      } else {
        setReportData(null);
        setErrorMessage(json.error || 'Failed to load report data.');
      }
    } catch (err: any) {
      console.error('Failed to load report:', err);
      setErrorMessage(err.message || 'An error occurred while loading report.');
    } finally {
      setIsLoading(false);
    }
  }, [activeReport, selectedRegion, selectedHawker, selectedPub, selectedMonth, selectedYear, currentPage, searchQuery, targetCustId, billBatchLimit]);

  useEffect(() => {
    if (viewMode === 'preview') {
      fetchReport();
    }
  }, [viewMode, fetchReport]);

  const now = new Date();
  const printDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${now.toLocaleTimeString()}`;

  // Reload on return from the preview too, so bills just sent turn the region red
  useEffect(() => {
    if (activeReport === 'bill_print_region' && viewMode === 'criteria') loadWaRegionStatus();
  }, [activeReport, viewMode, loadWaRegionStatus]);

  // Counts the send right away instead of waiting for the reload
  const handleBillsSent = (sentBills: { region_id?: number | string }[]) => {
    const cacheKey = `${selectedMonth}|${selectedYear}`;
    const next = { ...(waRegionCache.get(cacheKey) || {}) };
    sentBills.forEach(b => {
      const entry = next[String(b.region_id)];
      if (entry) next[String(b.region_id)] = { ...entry, sent: Math.min(entry.total, entry.sent + 1) };
    });
    waRegionCache.set(cacheKey, next);
    setWaRegionStatus(next);
  };

  const selectedRegionWa = selectedRegion !== 'all' ? waRegionStatus[selectedRegion] : undefined;
  const selectedRegionName = regions.find(r => String(r.region_id || r.id) === selectedRegion)?.region_name || `#${selectedRegion}`;

  const updateWaRegionMark = async (request: () => Promise<Response>) => {
    setIsUpdatingWaRegion(true);
    try {
      const res = await request();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update the region');
      await loadWaRegionStatus();
    } catch (err: any) {
      setWaRegionError(err?.message || 'Could not update the region.');
    } finally {
      setIsUpdatingWaRegion(false);
    }
  };

  const handleMarkRegionSent = () => {
    if (!window.confirm(`Mark all ${selectedMonth} ${selectedYear} bills of ${selectedRegionName} as already sent on WhatsApp?\n\nNothing will be sent to customers. WhatsApp Bill (All) will then treat them as already sent.`)) return;
    updateWaRegionMark(() => fetch('/api/whatsapp/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region_id: selectedRegion, month: selectedMonth, year: selectedYear })
    }));
  };

  const handleUnmarkRegionSent = () => {
    if (!window.confirm(`Remove the "sent before" mark from ${selectedRegionName}? Bills really sent on WhatsApp stay recorded.`)) return;
    const params = new URLSearchParams({ region_id: selectedRegion, month: selectedMonth, year: selectedYear });
    updateWaRegionMark(() => fetch(`/api/whatsapp/regions?${params.toString()}`, { method: 'DELETE' }));
  };

  const handleShowPreview = () => {
    setViewMode('preview');
  };

  const handlePrint = () => {
    if (activeReport === 'bill_print_region' || activeReport === 'bill_print_single' || activeReport === 'bill_paid_report') {
      if (billPrinterType === 'thermal_58mm') {
        printBillsThermal58mm(reportData?.rows || [], currentMeta.title, billPrintMode);
      } else {
        printBills4in1(reportData?.rows || [], currentMeta.title, billPrintMode);
      }
    } else {
      window.print();
    }
  };

  const handleExportCSV = () => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) {
      alert('No data available to export.');
      return;
    }
    const rows = reportData.rows;
    const headers = Object.keys(rows[0]).filter(k => typeof rows[0][k] !== 'object');
    const csvContent = [
      headers.join(','),
      ...rows.map((r: any) => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeReport}_${selectedMonth}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentMeta = REPORT_INFO[activeReport] || { 
    title: activeReport.replace(/_/g, ' ').toUpperCase(), 
    category: 'General Report',
    hasRegion: true,
    hasPeriod: true
  };

  // =========================================================================
  // VIEW 1: AUTHENTIC VB6 REPORT CRITERIA SELECTION DIALOG (screenshot_14.jpg)
  // =========================================================================
  if (viewMode === 'criteria') {
    return (
      <div className="w-[540px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl font-tahoma flex flex-col relative select-none text-xs">
        
        {/* VB6 Dialog Titlebar */}
        <div className="bg-gradient-to-r from-[#0A246A] via-[#3A6EA5] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold">
          <div className="flex items-center gap-1.5">
            <img src="/legacy_images/paper.ico" alt="ico" className="w-4 h-4" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <span className="tracking-wide">{currentMeta.title}</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">_</button>
            <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">□</button>
            <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 bg-[#ECE9D8] space-y-4">
          
          {/* Header Banner */}
          <div className="text-center pb-2 border-b border-[#808080]">
            <h1 className="text-lg font-black text-[#800000] tracking-wide uppercase font-serif">
              {currentMeta.title}
            </h1>
            <p className="text-[11px] text-slate-700 font-sans font-bold">
              {currentMeta.category} • Aryan News Agency [Beawar]
            </p>
          </div>

          {/* Criteria Inputs Box */}
          <div className="space-y-3 bg-[#F0EEE2] p-4 border border-[#808080] shadow-inner text-xs">
            
            {/* Region Dropdown */}
            {(currentMeta.hasRegion || activeReport === 'bill_print_region' || activeReport === 'retailsale_region_datewise') && (
              <div className="flex items-center">
                <label className="w-28 font-bold text-[#000080] shrink-0">Region</label>
                <select 
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="flex-1 px-2 py-1 border border-[#7F9DB9] bg-white text-black font-bold outline-none"
                >
                  <option value="all">-- All Regions --</option>
                  {[...regions]
                    .filter(r => activeReport !== 'bill_print_region' || !isHiddenBillRegion(r.region_name || r.name))
                    .sort((a, b) => String(a.region_name || a.name || '').localeCompare(String(b.region_name || b.name || ''), undefined, { numeric: true, sensitivity: 'base' }))
                    .map(r => {
                      const sentInfo = activeReport === 'bill_print_region' ? waRegionStatus[r.region_id || r.id] : undefined;
                      const isSent = !!sentInfo && sentInfo.sent > 0;
                      return (
                        <option key={r.region_id || r.id} value={r.region_id || r.id} style={isSent ? { color: '#DC2626' } : undefined}>
                          {isSent ? '● ' : ''}{r.region_name || r.name} (#{r.region_id || r.id}){isSent ? ` - Sent ${sentInfo.sent}/${sentInfo.total}` : ''}
                        </option>
                      );
                    })}
                </select>
              </div>
            )}

            {/* WhatsApp status of the selected region */}
            {activeReport === 'bill_print_region' && selectedRegionWa && selectedRegionWa.total > 0 && (
              <div className="flex items-center flex-wrap gap-2 pl-28">
                {selectedRegionWa.sent > 0 && (
                  <span className="px-2.5 py-1 bg-red-600 text-white font-bold rounded">
                    ● Sent on WhatsApp ({selectedRegionWa.sent}/{selectedRegionWa.total})
                  </span>
                )}
                {selectedRegionWa.sent < selectedRegionWa.total && (
                  <button
                    type="button"
                    onClick={handleMarkRegionSent}
                    disabled={isUpdatingWaRegion}
                    title="Record this region's bills as already sent. Nothing is sent to customers."
                    className="px-2.5 py-1 bg-white hover:bg-red-50 border border-red-600 text-red-700 font-bold rounded cursor-pointer disabled:opacity-60 disabled:cursor-default"
                  >
                    Mark as Sent Before
                  </button>
                )}
                {selectedRegionWa.manual > 0 && (
                  <button
                    type="button"
                    onClick={handleUnmarkRegionSent}
                    disabled={isUpdatingWaRegion}
                    title="Remove the manual mark. Real WhatsApp sends stay recorded."
                    className="px-2.5 py-1 bg-[#ECE9D8] hover:bg-white border border-slate-500 text-slate-800 font-bold rounded cursor-pointer disabled:opacity-60 disabled:cursor-default"
                  >
                    Undo Mark
                  </button>
                )}
              </div>
            )}
            {activeReport === 'bill_print_region' && waRegionError && (
              <p role="alert" className="pl-28 font-bold text-amber-800">{waRegionError}</p>
            )}

            {/* Hawker Dropdown */}
            {(currentMeta.hasHawker || activeReport.includes('hawker')) && (
              <div className="flex items-center">
                <label className="w-28 font-bold text-[#000080] shrink-0">Hawker</label>
                <select 
                  value={selectedHawker}
                  onChange={(e) => setSelectedHawker(e.target.value)}
                  className="flex-1 px-2 py-1 border border-[#7F9DB9] bg-white text-black font-bold outline-none"
                >
                  <option value="all">-- All Hawkers --</option>
                  {[...hawkers]
                    .filter(h => h.name || h.hawker_name)
                    .sort((a, b) => String(a.name || a.hawker_name || '').localeCompare(String(b.name || b.hawker_name || ''), undefined, { numeric: true, sensitivity: 'base' }))
                    .map(h => (
                      <option key={h.hawker_id || h.id} value={h.hawker_id || h.id}>
                        {h.name || h.hawker_name} (#{h.hawker_id || h.id})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Publication Dropdown */}
            {(currentMeta.hasPub || activeReport === 'cust_choose_pub' || activeReport === 'cust_pub_starting' || activeReport === 'countersale_pubwise') && (
              <div className="flex items-center">
                <label className="w-28 font-bold text-[#000080] shrink-0">Publication</label>
                <select 
                  value={selectedPub}
                  onChange={(e) => setSelectedPub(e.target.value)}
                  className="flex-1 px-2 py-1 border border-[#7F9DB9] bg-white text-black font-bold outline-none"
                >
                  <option value="all">-- All Publications --</option>
                  {[...publications]
                    .sort((a, b) => String(a.public_name || a.name || '').localeCompare(String(b.public_name || b.name || ''), undefined, { numeric: true, sensitivity: 'base' }))
                    .map(p => (
                      <option key={p.publica_id || p.id} value={p.publica_id || p.id}>
                        {p.public_name || p.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Customer ID / Name Filter for Single Bill Printing with live autocomplete dropdown */}
            {(currentMeta.hasCustId || activeReport === 'bill_print_single') && (
              <div className="flex items-center relative">
                <label className="w-28 font-bold text-[#800000] shrink-0">Customer ID</label>
                <div className="relative flex-1 flex items-center gap-2 max-w-sm">
                  <input 
                    type="text"
                    placeholder="e.g. 24669 or Customer Name..."
                    value={targetCustId}
                    onChange={(e) => handleCustomerSearch(e.target.value)}
                    onFocus={() => {
                      if (targetCustId.trim() && customerSuggestions.length > 0) {
                        setIsCustomerDropdownOpen(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (isCustomerDropdownOpen && customerSuggestions.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedCustIndex(prev => (prev + 1) % customerSuggestions.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedCustIndex(prev => (prev - 1 + customerSuggestions.length) % customerSuggestions.length);
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSelectCustomer(customerSuggestions[highlightedCustIndex]);
                        } else if (e.key === 'Escape') {
                          setIsCustomerDropdownOpen(false);
                        }
                      }
                    }}
                    className="w-48 px-2 py-1 border border-[#7F9DB9] bg-white text-black font-bold font-mono outline-none text-xs"
                    autoFocus
                  />
                  {selectedCustName && (
                    <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 border border-blue-200 rounded truncate">
                      ✓ {selectedCustName}
                    </span>
                  )}

                  {/* Autocomplete suggestions dropdown */}
                  {isCustomerDropdownOpen && customerSuggestions.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 w-80 bg-white border-2 border-[#0A246A] shadow-2xl max-h-56 overflow-y-auto z-50 text-xs">
                      {customerSuggestions.map((cust, idx) => {
                        const isHighlighted = idx === highlightedCustIndex;
                        return (
                          <div 
                            key={cust.customer_id}
                            onClick={() => handleSelectCustomer(cust)}
                            onMouseEnter={() => setHighlightedCustIndex(idx)}
                            className={`px-2.5 py-1.5 cursor-pointer font-bold border-b border-slate-100 flex items-center justify-between text-xs ${
                              isHighlighted ? 'bg-[#0A246A] text-white' : 'hover:bg-blue-50 text-slate-900'
                            }`}
                          >
                            <div className="flex flex-col truncate pr-2">
                              <span className="truncate">{cust.name_eng}</span>
                              {cust.name_hindi && (
                                <span className="text-[10px] text-slate-500 font-normal">
                                  {cust.name_hindi}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono shrink-0 opacity-80">
                              #{cust.customer_id}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Period (Month & Year) */}
            {(currentMeta.hasPeriod !== false) && (
              <div className="flex items-center">
                <label className="w-28 font-bold text-[#000080] shrink-0">Period</label>
                <div className="flex items-center gap-2">
                  <select 
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-2 py-1 border border-[#7F9DB9] bg-white text-black font-bold outline-none"
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <select 
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="px-2 py-1 border border-[#7F9DB9] bg-white text-black font-bold font-mono outline-none"
                  >
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2027">2027</option>
                  </select>
                </div>
              </div>
            )}

            {/* Batch Size for 4-in-1 Bill Printing */}
            {(activeReport === 'bill_print_region') && (
              <div className="flex items-center">
                <label className="w-28 font-bold text-[#000080] shrink-0">Print Batch</label>
                <select 
                  value={billBatchLimit}
                  onChange={(e) => setBillBatchLimit(Number(e.target.value))}
                  className="px-2 py-1 border border-[#7F9DB9] bg-white text-black font-bold outline-none"
                >
                  <option value={0}>All Bills in Selected Region (Default)</option>
                  <option value={40}>40 Bills (10 A4 Sheets)</option>
                  <option value={100}>100 Bills (25 A4 Sheets)</option>
                  <option value={200}>200 Bills (50 A4 Sheets)</option>
                  <option value={20}>20 Bills (5 A4 Sheets)</option>
                </select>
              </div>
            )}

            {/* Printer Output Target: 4-in-1 A4 vs 58mm Thermal */}
            {(activeReport === 'bill_print_region' || activeReport === 'bill_print_single') && (
              <div className="flex items-center justify-between p-2 bg-[#E8F4FD] border border-[#7FB5DA] rounded-xs text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[#000080]">Printer (प्रिंटर):</span>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
                    <input 
                      type="radio" 
                      name="billPrinterTypeCriteria" 
                      checked={billPrinterType === '4in1_a4'} 
                      onChange={() => setBillPrinterType('4in1_a4')} 
                    />
                    <span>📄 4-in-1 (A4 Sheet)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
                    <input 
                      type="radio" 
                      name="billPrinterTypeCriteria" 
                      checked={billPrinterType === 'thermal_58mm'} 
                      onChange={() => setBillPrinterType('thermal_58mm')} 
                    />
                    <span>🧾 58mm Thermal (203 DPI)</span>
                  </label>
                </div>
              </div>
            )}

            {/* Bill Print Format Option: Simple vs Detail (available for BOTH 4-in-1 and 58mm Thermal) */}
            {(activeReport === 'bill_print_region' || activeReport === 'bill_print_single') && (
              <div className="flex items-center justify-between p-2 bg-[#FFF9E6] border border-[#E0C060] rounded-xs text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[#000080]">Format (बिल प्रारूप):</span>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
                    <input 
                      type="radio" 
                      name="billPrintModeCriteria" 
                      checked={billPrintMode === 'simple'} 
                      onChange={() => setBillPrintMode('simple')} 
                    />
                    <span>📄 Simple (सरल - Delivery Merged)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
                    <input 
                      type="radio" 
                      name="billPrintModeCriteria" 
                      checked={billPrintMode === 'detail'} 
                      onChange={() => setBillPrintMode('detail')} 
                    />
                    <span>📑 Detail (विस्तृत - Delivery Separate)</span>
                  </label>
                </div>
              </div>
            )}

          </div>

          {/* Classic Slanted / Beveled VB6 Action Buttons */}
          <div className="flex items-center justify-center gap-3 pt-3 border-t border-[#808080]">
            <button 
              onClick={handleShowPreview}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                🔍 <u>S</u>how Preview
              </span>
            </button>
            <button 
              onClick={() => {
                setViewMode('preview');
                setTimeout(() => {
                  if (activeReport === 'bill_print_region' || activeReport === 'bill_print_single' || activeReport === 'bill_paid_report') {
                    if (billPrinterType === 'thermal_58mm') {
                      printBillsThermal58mm(reportData?.rows || [], currentMeta.title, billPrintMode);
                    } else {
                      printBills4in1(reportData?.rows || [], currentMeta.title, billPrintMode);
                    }
                  } else {
                    window.print();
                  }
                }, 800);
              }}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 flex items-center gap-1">
                🖨️ Direct <u>P</u>rint
              </span>
            </button>
            <button 
              onClick={onClose}
              className="px-4 py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-12 cursor-pointer flex items-center gap-1 text-xs font-bold text-black"
            >
              <span className="transform skew-x-12 text-red-800 flex items-center gap-1">
                🛑 E<u>x</u>it
              </span>
            </button>
          </div>

        </div>

      </div>
    );
  }

  // =========================================================================
  // VIEW 2: AUTHENTIC CRYSTAL REPORTS 8.5/9.0 VIEWER (frmMultiPgPreview)
  // =========================================================================
  return (
    <div className="max-w-[1040px] w-full max-h-[88vh] h-[88vh] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden text-xs">
      
      {/* 1. Crystal Reports Classic Title Bar */}
      <div className="bg-gradient-to-r from-[#0A246A] via-[#3A6EA5] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold shrink-0">
        <div className="flex items-center gap-1.5">
          <img src="/legacy_images/paper.ico" alt="ico" className="w-4 h-4" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span>Crystal Report Viewer - Aryan News Agency [Beawar] - [{currentMeta.title}]</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">_</button>
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* 2. Top Toolbar with All 16 Report Selectors & Parameters Button */}
      <div className="bg-[#ECE9D8] border-b border-[#808080] p-1 flex items-center justify-between font-bold gap-2 flex-wrap shrink-0">
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* Back to Parameters Button */}
          <button 
            onClick={() => setViewMode('criteria')}
            className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-[#808080] flex items-center gap-1 cursor-pointer font-bold text-[#000080]"
            title="Open Parameters Selection Dialog"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Parameters</span>
          </button>

          <div className="h-4 w-[1px] bg-[#808080]"></div>

          {/* Quick Switch Report Dropdown */}
          <select 
            value={activeReport}
            onChange={(e) => {
              setActiveReport(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2 py-0.5 border border-[#808080] bg-white font-bold text-black outline-none text-xs max-w-[280px]"
          >
            <optgroup label="1. Customer Reports">
              <option value="cust_detail_month">Customer Detail / Month Register</option>
              <option value="cust_pub_starting">Customer Publication Starting</option>
              <option value="circ_type_pub">Circulation Type Publication Report</option>
              <option value="cust_choose_pub">Customer Wise Choose Publication</option>
            </optgroup>
            <optgroup label="2. Discontinue Reports">
              <option value="discontinue_datewise">Discontinue Date Wise</option>
              <option value="discontinue_hawkerwise">Discontinue Hawker Wise With Address</option>
            </optgroup>
            <optgroup label="3. Purchase Reports">
              <option value="purchase_datewise">Purchase Date Wise Report</option>
              <option value="purchase_publisherwise">Purchase Publisher Wise</option>
            </optgroup>
            <optgroup label="4. Counter Sale Reports">
              <option value="countersale_datewise">Counter Sale Date Wise</option>
              <option value="countersale_pubwise">Counter Sale Publication Wise</option>
            </optgroup>
            <optgroup label="5. Retail Customer Sale">
              <option value="retailsale_region_datewise">Retail Sale Region Date Wise Report</option>
            </optgroup>
            <optgroup label="6. Receipt Reports">
              <option value="receipt_nowise">Receipt Number Wise Report</option>
              <option value="receipt_realamt">Actual Amount Receipt Report</option>
            </optgroup>
            <optgroup label="7. Hawker Wise Reports">
              <option value="hawker_daily_qty">Daily Quantity of Newspaper</option>
              <option value="hawker_magazine_qty">Quantity of Magazine</option>
            </optgroup>
            <optgroup label="8. Outstanding Reports">
              <option value="dues_ledger">Customer Outstanding Dues Ledger</option>
              <option value="previous_dues_wise">Previous Dues Wise Report</option>
              <option value="due_region_summary">Due Region Wise Summary</option>
              <option value="collection_agent_dues">Collection Agent Dues Report</option>
            </optgroup>
            <optgroup label="9. Sale Reports">
              <option value="consolidated_sale">Consolidated Sale Report</option>
              <option value="daily_sale">Daily / Periodic Sale Report</option>
            </optgroup>
            <optgroup label="10. Publication Daily Report">
              <option value="region_pub_daily">Region Wise Publication Report</option>
              <option value="region_start_end">Region-Wise Start End Report</option>
            </optgroup>
            <optgroup label="11. Bill Printing & Payment Status">
              <option value="bill_print_region">Region Wise Bill Printing</option>
              <option value="bill_print_single">Single Bill Printing</option>
              <option value="bill_paid_report">Bill Paid Report (सशुल्क / Paid Bills)</option>
            </optgroup>
            <optgroup label="12-16. Operational Reports">
              <option value="hawker_cust_priority">Hawker&apos;s Customer Priority</option>
              <option value="sticker_printing">Sticker Printing</option>
              <option value="hawker_report_datewise">Hawker Report Datewise</option>
              <option value="collection_hawker_datewise">Collection Hawker Datewise</option>
              <option value="collection_datewise">Collection Datewise</option>
            </optgroup>
          </select>

          <div className="h-4 w-[1px] bg-[#808080]"></div>

          {/* Bill Printing Target & Format Switcher in Top Bar */}
          {activeReport.includes('bill_print') && (
            <div className="flex items-center gap-1.5">
              {/* Target: 4-in-1 vs 58mm Thermal */}
              <div className="flex items-center bg-white p-0.5 border border-[#808080] rounded-xs text-[11px]">
                <button
                  type="button"
                  onClick={() => setBillPrinterType('4in1_a4')}
                  className={`px-2 py-0.5 font-bold cursor-pointer transition-colors ${
                    billPrinterType === '4in1_a4'
                      ? 'bg-blue-700 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title="4-in-1 A4 Sheet Layout"
                >
                  📄 4-in-1 (A4)
                </button>
                <button
                  type="button"
                  onClick={() => setBillPrinterType('thermal_58mm')}
                  className={`px-2 py-0.5 font-bold cursor-pointer transition-colors ${
                    billPrinterType === 'thermal_58mm'
                      ? 'bg-emerald-700 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title="58mm (203 DPI) Thermal Receipt Roll"
                >
                  🧾 58mm Thermal
                </button>
              </div>

              {/* Simple vs Detail (available for BOTH 4-in-1 and 58mm Thermal) */}
              <div className="flex items-center bg-white p-0.5 border border-[#808080] rounded-xs text-[11px]">
                <button
                  type="button"
                  onClick={() => setBillPrintMode('simple')}
                  className={`px-2 py-0.5 font-bold cursor-pointer transition-colors ${
                    billPrintMode === 'simple'
                      ? 'bg-blue-700 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Simple Print: Delivery is merged directly into publication prices"
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setBillPrintMode('detail')}
                  className={`px-2 py-0.5 font-bold cursor-pointer transition-colors ${
                    billPrintMode === 'detail'
                      ? 'bg-blue-700 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Detail Print: Delivery charge is shown separately in the summary box"
                >
                  Detail
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <button 
            onClick={handlePrint}
            className={`px-2 py-0.5 border flex items-center gap-1 cursor-pointer font-bold ${
              activeReport.includes('bill_print') 
                ? billPrinterType === 'thermal_58mm'
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-900 shadow-xs'
                  : 'bg-blue-700 hover:bg-blue-800 text-white border-blue-900 shadow-xs' 
                : 'bg-white hover:bg-slate-100 border-[#808080]'
            }`}
            title={activeReport.includes('bill_print') 
              ? billPrinterType === 'thermal_58mm'
                ? 'Print 58mm Thermal Bills / Save as 58mm PDF'
                : `Print 4-in-1 A4 Sheets / Save PDF (${billPrintMode === 'simple' ? 'Simple' : 'Detail'})` 
              : "Print Report (Ctrl+P)"}
          >
            <Printer className={`w-3.5 h-3.5 ${activeReport.includes('bill_print') ? 'text-white' : 'text-blue-900'}`} />
            <span>
              {activeReport.includes('bill_print') 
                ? billPrinterType === 'thermal_58mm'
                  ? 'Print 58mm Thermal'
                  : `Print 4 in 1 A4 (${billPrintMode === 'simple' ? 'Simple' : 'Detail'})` 
                : 'Print'}
            </span>
          </button>

          <button 
            onClick={handleExportCSV}
            className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-[#808080] flex items-center gap-1 cursor-pointer"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-800" />
            <span>Export</span>
          </button>

          <button 
            onClick={fetchReport}
            className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-[#808080] flex items-center gap-1 cursor-pointer"
            title="Refresh Report Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-700 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <div className="h-4 w-[1px] bg-[#808080]"></div>

          {/* Zoom Buttons */}
          <button 
            onClick={() => setZoomLevel(prev => Math.min(150, prev + 15))}
            className="px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-[#808080] cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono">{zoomLevel}%</span>
          <button 
            onClick={() => setZoomLevel(prev => Math.max(75, prev - 15))}
            className="px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-[#808080] cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Page Nav */}
        <div className="flex items-center gap-2">
          <button 
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="px-1.5 py-0.5 bg-white border border-[#808080] cursor-pointer disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px]">Page {currentPage} of {totalPages}</span>
          <button 
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="px-1.5 py-0.5 bg-white border border-[#808080] cursor-pointer disabled:opacity-40"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      {/* 3. Filter Bar */}
      <div className="bg-[#F0EEE2] border-b border-[#808080] px-2 py-1 flex items-center gap-3 text-xs flex-wrap font-sans shrink-0">
        
        {/* Active Criteria Badge */}
        <div className="flex items-center gap-1 font-bold text-slate-700">
          <span>Period:</span>
          <span className="bg-white px-1.5 py-0.5 border border-[#808080] font-mono text-[#000080]">
            {selectedMonth} {selectedYear}
          </span>
        </div>

        {selectedRegion !== 'all' && (
          <div className="flex items-center gap-1 font-bold text-slate-700">
            <span>Region:</span>
            <span className="bg-white px-1.5 py-0.5 border border-[#808080] text-emerald-800">
              {regions.find(r => String(r.region_id) === String(selectedRegion))?.region_name || `#${selectedRegion}`}
            </span>
          </div>
        )}

        {selectedHawker !== 'all' && (
          <div className="flex items-center gap-1 font-bold text-slate-700">
            <span>Hawker:</span>
            <span className="bg-white px-1.5 py-0.5 border border-[#808080] text-blue-900">
              {hawkers.find(h => String(h.hawker_id) === String(selectedHawker))?.name || `#${selectedHawker}`}
            </span>
          </div>
        )}

        {/* Live Search */}
        <div className="flex items-center gap-1 ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search within report..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="px-1.5 py-0.5 border border-[#808080] bg-white text-[11px] w-44 outline-none"
          />
        </div>

      </div>

      {/* 4. Main Crystal Reports Canvas Area */}
      <div className="flex-1 bg-[#525659] p-4 overflow-auto flex justify-center items-start">
        
        {/* Printable Paper Canvas (A4 sheet or auto-fit for 58mm thermal preview) */}
        <div 
          className={`bg-white shadow-[0_4px_25px_rgba(0,0,0,0.6)] font-serif text-black border border-slate-300 transition-all duration-150 ${
            activeReport.includes('bill_print') && billPrinterType === 'thermal_58mm'
              ? 'p-3 min-h-0 w-auto'
              : 'p-8 min-h-[900px]'
          }`}
          style={{ 
            width: activeReport.includes('bill_print') && billPrinterType === 'thermal_58mm'
              ? 'auto'
              : `${Math.round(880 * (zoomLevel / 100))}px`, 
            fontSize: `${Math.round(11 * (zoomLevel / 100))}px`
          }}
        >
          
          {/* Header */}
          <div className="text-center pb-3 border-b-2 border-black space-y-1">
            <h1 className="text-xl font-black tracking-wider uppercase">ARYAN NEWS AGENCY</h1>
            <p className="text-[11px] text-slate-700 font-sans font-bold">Main Market, Near Clock Tower, Beawar (Raj.) - 305901 • Ph: 01462-250000</p>
            <h2 className="text-sm font-black text-[#000080] underline tracking-wide uppercase pt-1 font-sans">
              {reportData?.report_title || currentMeta.title}
            </h2>
            <div className="flex justify-between text-[10px] font-sans font-bold text-slate-600 pt-1">
              <span>Date: {printDateStr}</span>
              <span>Financial Period: {selectedMonth} {selectedYear}</span>
              <span>Page: {currentPage} of {totalPages}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-slate-500 font-sans">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-2 text-blue-900" />
              <span>Loading authentic report data from database...</span>
            </div>
          ) : errorMessage ? (
            <div className="p-10 my-8 max-w-xl mx-auto bg-[#FFF5F5] border-2 border-red-500 rounded shadow-md text-center font-sans">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3 font-bold text-2xl border border-red-300">
                ✕
              </div>
              <h3 className="text-base font-bold text-red-800 mb-2">
                Bill Not Generated Yet!
              </h3>
              <p className="text-xs text-red-700 leading-relaxed font-semibold">
                {errorMessage}
              </p>
              <div className="mt-4 p-2.5 bg-white border border-red-200 rounded text-[11px] text-slate-700 text-left">
                <strong>How to fix:</strong>
                <ol className="list-decimal ml-4 mt-1 space-y-1">
                  <li>Go to <strong>Process &rarr; Bill Generation</strong>.</li>
                  <li>Select Month: <strong>{selectedMonth}</strong>, Financial Year: <strong>{selectedYear}</strong>.</li>
                  <li>Click <strong>Execute Process</strong> to compute &amp; save bills to database.</li>
                  <li>Then return to <strong>Reports &rarr; Bill Printing</strong> to preview or print.</li>
                </ol>
              </div>
            </div>
          ) : !reportData || !reportData.rows || reportData.rows.length === 0 ? (
            <div className="p-16 text-center text-slate-500 font-sans">
              No matching records found for the selected criteria.
            </div>
          ) : (
            <div className="pt-3 font-sans">
              
              {/* ========================================================================= */}
              {/* REPORT 1: BILL PRINTING (4-IN-1 A4 or 58mm THERMAL 203 DPI) */}
              {/* ========================================================================= */}
              {(activeReport === 'bill_print_region' || activeReport === 'bill_print_single') && (
                billPrinterType === 'thermal_58mm' ? (
                  <BillThermalPreview 
                    bills={reportData.rows || []} 
                    title={currentMeta.title}
                    zoomLevel={zoomLevel}
                    initialPrintMode={billPrintMode}
                    onBillsSent={handleBillsSent}
                  />
                ) : (
                  <Bill4in1Preview
                    bills={reportData.rows || []} 
                    title={currentMeta.title} 
                    zoomLevel={zoomLevel} 
                    initialPrintMode={billPrintMode}
                  />
                )
              )}

              {/* ========================================================================= */}
              {/* REPORT 1B: BILL PAID REPORT (UPI / ONLINE CONFIRMATION TABLE) */}
              {/* ========================================================================= */}
              {activeReport === 'bill_paid_report' && (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-300 p-2 text-xs font-bold text-emerald-900 flex justify-between items-center rounded-xs">
                    <span>✓ Bill Payments Verified & Received</span>
                    <span>Total Received: <span className="font-mono text-sm font-black">₹{Number(reportData.total_received || 0).toFixed(2)}</span> ({reportData.total_rows || 0} payments)</span>
                  </div>
                  <table className="w-full text-xs border-collapse border border-black bg-white">
                    <thead>
                      <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                        <th className="p-1.5 text-center border-r border-black w-14">Ac.No</th>
                        <th className="p-1.5 text-left border-r border-black">Customer Name</th>
                        <th className="p-1.5 text-center border-r border-black w-24">Phone</th>
                        <th className="p-1.5 text-center border-r border-black w-20">Bill No</th>
                        <th className="p-1.5 text-center border-r border-black w-28">Payment Date</th>
                        <th className="p-1.5 text-center border-r border-black w-24">Time</th>
                        <th className="p-1.5 text-center border-r border-black w-24">Mode</th>
                        <th className="p-1.5 text-right border-r border-black w-24 font-black">Paid (₹)</th>
                        <th className="p-1.5 text-right border-r border-black w-24">Remaining Due</th>
                        <th className="p-1.5 text-center w-20">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.rows.map((r: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                          <td className="p-1.5 text-center border-r border-slate-300 font-mono font-bold text-blue-900">#{r.customer_id}</td>
                          <td className="p-1.5 border-r border-slate-300 font-bold text-blue-950">
                            <div>{r.customer_name}</div>
                            {r.customer_hindi && <div className="text-[10px] text-slate-500 font-normal">{r.customer_hindi}</div>}
                          </td>
                          <td className="p-1.5 text-center border-r border-slate-300 font-mono">{r.phone || '---'}</td>
                          <td className="p-1.5 text-center border-r border-slate-300 font-mono font-bold text-purple-900">#{r.bill_no}</td>
                          <td className="p-1.5 text-center border-r border-slate-300 font-mono font-bold">{r.payment_date}</td>
                          <td className="p-1.5 text-center border-r border-slate-300 font-mono text-slate-700">{r.payment_time}</td>
                          <td className="p-1.5 text-center border-r border-slate-300 font-bold text-slate-800">
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-xs text-[10px] uppercase">
                              {r.payment_mode}
                            </span>
                          </td>
                          <td className="p-1.5 border-r border-slate-300 text-right font-mono font-bold text-emerald-800">
                            ₹{Number(r.paid_amount || 0).toFixed(2)}
                          </td>
                          <td className="p-1.5 border-r border-slate-300 text-right font-mono font-bold text-slate-700">
                            ₹{Number(r.net_balance || 0).toFixed(2)}
                          </td>
                          <td className="p-1.5 text-center font-bold">
                            <span className="px-1.5 py-0.5 bg-emerald-600 text-white rounded-xs text-[10px] shadow-xs">
                              PAID ✓
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                        <td colSpan={7} className="p-2 text-left uppercase border-r border-black font-black">
                          Total Payments Received:
                        </td>
                        <td className="p-2 text-right font-mono text-sm text-emerald-900 border-r border-black font-black">
                          ₹{Number(reportData.total_received || 0).toFixed(2)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* ========================================================================= */}
              {/* REPORT 2: HAWKER DAILY QUANTITY OF NEWSPAPER / MAGAZINE MATRIX */}
              {/* ========================================================================= */}
              {(activeReport === 'hawker_daily_qty' || activeReport === 'hawker_magazine_qty') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-10">S.No</th>
                      <th className="p-1 text-left border-r border-black">Hawker / Distributor</th>
                      {(reportData.target_pubs || []).map((tp: any) => (
                        <th key={tp.publica_id} className="p-1 text-right border-r border-black">
                          {tp.name}
                        </th>
                      ))}
                      <th className="p-1 text-right font-black w-24">Total Copies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any, idx: number) => (
                      <tr key={r.hawker.hawker_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono">{(currentPage - 1) * 50 + idx + 1}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">
                          {r.hawker.name || `Hawker #${r.hawker.hawker_id}`}
                        </td>
                        {(reportData.target_pubs || []).map((tp: any) => (
                          <td key={tp.publica_id} className="p-1 border-r border-slate-300 text-right font-mono">
                            {r.counts[tp.publica_id] || '-'}
                          </td>
                        ))}
                        <td className="p-1 text-right font-mono font-black text-slate-900 bg-slate-50">
                          {r.total}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={2} className="p-1.5 text-left uppercase border-r border-black">
                        Total Distribution Copies:
                      </td>
                      {(reportData.target_pubs || []).map((tp: any) => (
                        <td key={tp.publica_id} className="p-1.5 text-right font-mono border-r border-black">
                          {reportData.pub_totals?.[tp.publica_id] || 0}
                        </td>
                      ))}
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">
                        {reportData.grand_total}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 3: CUSTOMER OUTSTANDING DUES LEDGER */}
              {/* ========================================================================= */}
              {(activeReport === 'dues_ledger' || activeReport === 'previous_dues_wise' || activeReport === 'advance_list') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1 text-left border-r border-black">Customer Name</th>
                      <th className="p-1 text-left border-r border-black">Address / Area</th>
                      <th className="p-1 text-center border-r border-black w-20">Region</th>
                      <th className="p-1 text-right border-r border-black w-24">Due Amt (₹)</th>
                      <th className="p-1 text-right border-r border-black w-20">Adv (₹)</th>
                      <th className="p-1 text-right font-black w-24">Net Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((c: any) => (
                      <tr key={c.customer_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono font-bold">#{c.customer_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">
                          <div>{c.name}</div>
                          {c.name_hindi && <div className="text-[10px] text-slate-600 font-sans">{cleanOrTransliterateHindi(c.name_hindi, c.name)}</div>}
                        </td>
                        <td className="p-1 border-r border-slate-300 text-slate-700 truncate max-w-[220px]">{c.address}</td>
                        <td className="p-1 border-r border-slate-300 text-center text-slate-600 text-[10px]">{c.region_name}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono text-red-900 font-bold">
                          ₹{Number(c.due_amount).toFixed(2)}
                        </td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono text-emerald-800">
                          ₹{Number(c.advance).toFixed(2)}
                        </td>
                        <td className="p-1 text-right font-mono font-black text-slate-900">
                          ₹{Number(c.net_balance).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={4} className="p-1.5 text-left uppercase border-r border-black">
                        Report Total ({reportData.total_rows} Customers):
                      </td>
                      <td className="p-1.5 text-right font-mono border-r border-black text-red-900">
                        ₹{Number(reportData.total_due || 0).toFixed(2)}
                      </td>
                      <td className="p-1.5 text-right font-mono border-r border-black text-emerald-800">
                        ₹{Number(reportData.total_advance || 0).toFixed(2)}
                      </td>
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">
                        ₹{Number(reportData.net_total || 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 4: DUE REGION WISE SUMMARY */}
              {/* ========================================================================= */}
              {activeReport === 'due_region_summary' && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-14">Reg ID</th>
                      <th className="p-1 text-left border-r border-black">Region / Area Name</th>
                      <th className="p-1 text-right border-r border-black">Total Cust</th>
                      <th className="p-1 text-right border-r border-black">Due Cust</th>
                      <th className="p-1 text-right border-r border-black">Total Dues (₹)</th>
                      <th className="p-1 text-right border-r border-black">Total Adv (₹)</th>
                      <th className="p-1 text-right font-black">Net Receivable (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any) => (
                      <tr key={r.region_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono">#{r.region_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{r.region_name}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono">{r.totalCust}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono text-red-800">{r.dueCust}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono font-bold text-red-900">
                          ₹{Number(r.totalDue).toFixed(2)}
                        </td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono text-emerald-800">
                          ₹{Number(r.totalAdv).toFixed(2)}
                        </td>
                        <td className="p-1 text-right font-mono font-black text-slate-900">
                          ₹{(Number(r.totalDue) - Number(r.totalAdv)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {reportData.summary && (
                      <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                        <td colSpan={2} className="p-1.5 text-left uppercase border-r border-black">Grand Total:</td>
                        <td className="p-1.5 text-right font-mono border-r border-black">{reportData.summary.total_customers}</td>
                        <td className="p-1.5 text-right font-mono border-r border-black text-red-900">{reportData.summary.due_customers}</td>
                        <td className="p-1.5 text-right font-mono border-r border-black text-red-900">₹{Number(reportData.summary.total_due_amount).toFixed(2)}</td>
                        <td className="p-1.5 text-right font-mono border-r border-black text-emerald-800">₹{Number(reportData.summary.total_advance_amount).toFixed(2)}</td>
                        <td className="p-1.5 text-right font-mono text-sm text-blue-900">₹{Number(reportData.summary.net_outstanding).toFixed(2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 5: CUSTOMER DETAIL / MONTH REGISTER */}
              {/* ========================================================================= */}
              {activeReport === 'cust_detail_month' && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1 text-left border-r border-black">Customer Name</th>
                      <th className="p-1 text-left border-r border-black">Address</th>
                      <th className="p-1 text-left border-r border-black">Subscribed Newspapers</th>
                      <th className="p-1 text-left border-r border-black">Hawker</th>
                      <th className="p-1 text-right font-black w-24">Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((c: any) => (
                      <tr key={c.customer_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono font-bold">#{c.customer_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">
                          <div>{c.name}</div>
                          {c.name_hindi && <div className="text-[10px] text-slate-600 font-sans">{cleanOrTransliterateHindi(c.name_hindi, c.name)}</div>}
                        </td>
                        <td className="p-1 border-r border-slate-300 text-slate-700 truncate max-w-[200px]">{c.address}</td>
                        <td className="p-1 border-r border-slate-300 text-slate-900 font-medium">{c.publications}</td>
                        <td className="p-1 border-r border-slate-300 text-slate-700">{c.hawkers}</td>
                        <td className="p-1 text-right font-mono font-bold text-red-900">
                          ₹{Number(c.due_amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 6: RETAIL SALE REGION DATE WISE REPORT */}
              {/* ========================================================================= */}
              {activeReport === 'retailsale_region_datewise' && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1 text-left border-r border-black">Customer Name</th>
                      <th className="p-1 text-left border-r border-black">Region</th>
                      <th className="p-1 text-left border-r border-black">Newspaper Subscriptions</th>
                      <th className="p-1 text-center border-r border-black w-16">Copies</th>
                      <th className="p-1 text-right border-r border-black w-24">Monthly Est (₹)</th>
                      <th className="p-1 text-right font-black w-24">Due Amt (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any) => (
                      <tr key={r.customer_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono font-bold">#{r.customer_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">
                          <div>{r.name}</div>
                          {r.name_hindi && <div className="text-[10px] text-slate-600 font-sans">{cleanOrTransliterateHindi(r.name_hindi, r.name)}</div>}
                        </td>
                        <td className="p-1 border-r border-slate-300 text-slate-700">{r.region_name}</td>
                        <td className="p-1 border-r border-slate-300 text-slate-900">{r.publications}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono font-bold">{r.copies}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono font-bold text-emerald-900">₹{Number(r.estimated_amount).toFixed(2)}</td>
                        <td className="p-1 text-right font-mono font-bold text-red-900">₹{Number(r.due_amount).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={5} className="p-1.5 text-left uppercase border-r border-black">Total Estimated Monthly Revenue:</td>
                      <td className="p-1.5 text-right font-mono text-sm text-emerald-900 border-r border-black">₹{Number(reportData.total_estimated || 0).toFixed(2)}</td>
                      <td className="p-1.5 text-right font-mono">---</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 7: COLLECTION AGENT DUES REPORT */}
              {/* ========================================================================= */}
              {activeReport === 'collection_agent_dues' && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1.5 text-center border-r border-black w-14">Agent ID</th>
                      <th className="p-1.5 text-left border-r border-black">Collection Agent Name</th>
                      <th className="p-1.5 text-left border-r border-black">Address</th>
                      <th className="p-1.5 text-right border-r border-black w-24">Customers</th>
                      <th className="p-1.5 text-right border-r border-black w-24">Due Cust</th>
                      <th className="p-1.5 text-right border-r border-black w-28">Total Dues (₹)</th>
                      <th className="p-1.5 text-right font-black w-28">Net Collectible (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((a: any) => (
                      <tr key={a.agent_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1.5 text-center border-r border-slate-300 font-mono font-bold">#{a.agent_id}</td>
                        <td className="p-1.5 border-r border-slate-300 font-bold text-blue-950">{a.agent_name}</td>
                        <td className="p-1.5 border-r border-slate-300 text-slate-700">{a.address}</td>
                        <td className="p-1.5 border-r border-slate-300 text-right font-mono">{a.total_customers}</td>
                        <td className="p-1.5 border-r border-slate-300 text-right font-mono text-red-800">{a.due_customers}</td>
                        <td className="p-1.5 border-r border-slate-300 text-right font-mono font-bold text-red-900">₹{Number(a.total_due).toFixed(2)}</td>
                        <td className="p-1.5 text-right font-mono font-black text-blue-900">₹{Number(a.net_collectible).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={5} className="p-1.5 text-left uppercase border-r border-black">Grand Total:</td>
                      <td className="p-1.5 text-right font-mono text-red-900 border-r border-black">₹{Number(reportData.total_due || 0).toFixed(2)}</td>
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">₹{Number(reportData.net_total || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 8: REGION WISE PUBLICATION DAILY DISTRIBUTION MATRIX */}
              {/* ========================================================================= */}
              {activeReport === 'region_pub_daily' && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-12">Reg ID</th>
                      <th className="p-1 text-left border-r border-black">Delivery Region Name</th>
                      {(reportData.target_pubs || []).map((tp: any) => (
                        <th key={tp.publica_id} className="p-1 text-right border-r border-black">
                          {tp.name}
                        </th>
                      ))}
                      <th className="p-1 text-right font-black w-24">Total Copies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any) => (
                      <tr key={r.region.region_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono">#{r.region.region_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{r.region.region_name}</td>
                        {(reportData.target_pubs || []).map((tp: any) => (
                          <td key={tp.publica_id} className="p-1 border-r border-slate-300 text-right font-mono">
                            {r.counts[tp.publica_id] || '-'}
                          </td>
                        ))}
                        <td className="p-1 text-right font-mono font-black text-slate-900 bg-slate-50">
                          {r.total}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={2} className="p-1.5 text-left uppercase border-r border-black">Total Distribution:</td>
                      {(reportData.target_pubs || []).map((tp: any) => (
                        <td key={tp.publica_id} className="p-1.5 text-right font-mono border-r border-black">
                          {reportData.pub_totals?.[tp.publica_id] || 0}
                        </td>
                      ))}
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">{reportData.grand_total}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 9: REGION-WISE START END REPORT */}
              {/* ========================================================================= */}
              {activeReport === 'region_start_end' && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1.5 text-center border-r border-black w-14">Reg ID</th>
                      <th className="p-1.5 text-left border-r border-black">Region Name</th>
                      <th className="p-1.5 text-right border-r border-black w-28">New Subscriptions Started</th>
                      <th className="p-1.5 text-right border-r border-black w-28">Discontinued / Closed</th>
                      <th className="p-1.5 text-right font-black w-28">Net Circulation Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any) => (
                      <tr key={r.region_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1.5 text-center border-r border-slate-300 font-mono font-bold">#{r.region_id}</td>
                        <td className="p-1.5 border-r border-slate-300 font-bold text-blue-950">{r.region_name}</td>
                        <td className="p-1.5 border-r border-slate-300 text-right font-mono font-bold text-emerald-800">+{r.started}</td>
                        <td className="p-1.5 border-r border-slate-300 text-right font-mono font-bold text-red-800">-{r.ended}</td>
                        <td className="p-1.5 text-right font-mono font-black text-blue-900">
                          {r.net_change >= 0 ? `+${r.net_change}` : `${r.net_change}`}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={2} className="p-1.5 text-left uppercase border-r border-black">Total Net Change:</td>
                      <td className="p-1.5 text-right font-mono text-emerald-900 border-r border-black">+{reportData.total_started}</td>
                      <td className="p-1.5 text-right font-mono text-red-900 border-r border-black">-{reportData.total_ended}</td>
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">
                        {reportData.total_started - reportData.total_ended >= 0 
                          ? `+${reportData.total_started - reportData.total_ended}` 
                          : `${reportData.total_started - reportData.total_ended}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 10: CUSTOMER PUBLICATION STARTING */}
              {/* ========================================================================= */}
              {activeReport === 'cust_pub_starting' && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1 text-left border-r border-black">Customer Name</th>
                      <th className="p-1 text-left border-r border-black">Publication</th>
                      <th className="p-1 text-center border-r border-black w-24">Start Date</th>
                      <th className="p-1 text-center border-r border-black w-14">Qty</th>
                      <th className="p-1 text-left border-r border-black">Hawker</th>
                      <th className="p-1 text-left">Circulation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono">#{r.customer_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{r.customer_name}</td>
                        <td className="p-1 border-r border-slate-300 font-bold">{r.publication}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono">{r.start_date}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono font-bold">{r.qty}</td>
                        <td className="p-1 border-r border-slate-300">{r.hawker}</td>
                        <td className="p-1 text-slate-600">{r.circulation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 11: CIRCULATION TYPE PUBLICATION REPORT */}
              {/* ========================================================================= */}
              {activeReport === 'circ_type_pub' && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-2 text-left border-r border-black">Circulation Shift</th>
                      <th className="p-2 text-right border-r border-black">Total Subscriptions</th>
                      <th className="p-2 text-right border-r border-black">Total Daily Copies</th>
                      <th className="p-2 text-left">Major Publications Distributed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-2 border-r border-slate-300 font-bold text-blue-950">{r.circulation}</td>
                        <td className="p-2 border-r border-slate-300 text-right font-mono font-bold">{r.total_subscriptions}</td>
                        <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-blue-900">{r.total_copies}</td>
                        <td className="p-2 text-slate-800 text-[11px]">{r.top_publications}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 12: CUSTOMER CHOOSE PUBLICATION */}
              {/* ========================================================================= */}
              {activeReport === 'cust_choose_pub' && (
                <div>
                  <div className="bg-blue-50 p-2 border border-blue-200 mb-2 font-sans font-bold flex justify-between">
                    <span>Subscribers for: {reportData.selected_pub}</span>
                    <span>Total Copies: {reportData.total_copies}</span>
                  </div>
                  <table className="w-full text-xs border-collapse border border-black">
                    <thead>
                      <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                        <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                        <th className="p-1 text-left border-r border-black">Customer Name</th>
                        <th className="p-1 text-left border-r border-black">Address</th>
                        <th className="p-1 text-left border-r border-black">Region</th>
                        <th className="p-1 text-left border-r border-black">Hawker</th>
                        <th className="p-1 text-center border-r border-black w-14">Qty</th>
                        <th className="p-1 text-center w-24">Since</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.rows.map((r: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                          <td className="p-1 text-center border-r border-slate-300 font-mono">#{r.customer_id}</td>
                          <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{r.name}</td>
                          <td className="p-1 border-r border-slate-300 text-slate-700">{r.address}</td>
                          <td className="p-1 border-r border-slate-300 text-slate-600">{r.region_name}</td>
                          <td className="p-1 border-r border-slate-300">{r.hawker_name}</td>
                          <td className="p-1 border-r border-slate-300 text-center font-mono font-bold">{r.qty}</td>
                          <td className="p-1 text-center font-mono">{r.start_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ========================================================================= */}
              {/* REPORT 13: DISCONTINUE REPORTS */}
              {/* ========================================================================= */}
              {(activeReport === 'discontinue_datewise' || activeReport === 'discontinue_hawkerwise') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1 text-left border-r border-black">Customer Name</th>
                      <th className="p-1 text-left border-r border-black">Address</th>
                      <th className="p-1 text-left border-r border-black">Publication Stopped</th>
                      <th className="p-1 text-center border-r border-black w-24">From Date</th>
                      <th className="p-1 text-center border-r border-black w-24">To Date</th>
                      <th className="p-1 text-center w-24">Hold Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((d: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono">#{d.customer_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{d.customer_name}</td>
                        <td className="p-1 border-r border-slate-300 text-slate-700">{d.address}</td>
                        <td className="p-1 border-r border-slate-300 font-bold">{d.publication}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono">{d.from_date || '---'}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono">{d.to_date || 'Permanent'}</td>
                        <td className="p-1 text-center font-bold text-rose-800">{d.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 14: RECEIPT NUMBER WISE & ACTUAL AMOUNT */}
              {/* ========================================================================= */}
              {(activeReport === 'receipt_nowise' || activeReport === 'receipt_realamt') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-20">Receipt No</th>
                      <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1 text-left border-r border-black">Customer Name</th>
                      <th className="p-1 text-center border-r border-black w-24">Receipt Date</th>
                      <th className="p-1 text-right border-r border-black w-20">Due Amt</th>
                      <th className="p-1 text-right border-r border-black w-24">Received (₹)</th>
                      <th className="p-1 text-right border-r border-black w-16">Less Amt</th>
                      <th className="p-1 text-right border-r border-black w-20">Balance</th>
                      <th className="p-1 text-center w-16">Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any) => (
                      <tr key={r.receipt_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono font-bold text-blue-900">{r.receipt_no}</td>
                        <td className="p-1 text-center border-r border-slate-300 font-mono">#{r.customer_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{r.customer_name}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono">{r.bill_date}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono">₹{Number(r.due_amt).toFixed(2)}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono font-bold text-emerald-800">₹{Number(r.received_amt).toFixed(2)}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono">₹{Number(r.less_amt).toFixed(2)}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono">₹{Number(r.balance).toFixed(2)}</td>
                        <td className="p-1 text-center font-bold">{r.payment_mode}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={5} className="p-1.5 text-left uppercase border-r border-black">Total Receipts Collected:</td>
                      <td className="p-1.5 text-right font-mono text-sm text-emerald-900 border-r border-black">₹{Number(reportData.total_received || 0).toFixed(2)}</td>
                      <td className="p-1.5 text-right font-mono border-r border-black">₹{Number(reportData.total_discount || 0).toFixed(2)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 15: PURCHASE DATE WISE & PUBLISHER WISE */}
              {/* ========================================================================= */}
              {(activeReport === 'purchase_datewise' || activeReport === 'purchase_publisherwise') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1.5 text-left border-r border-black">Publisher / Press Name</th>
                      <th className="p-1.5 text-left border-r border-black">Contact Person / Phone</th>
                      <th className="p-1.5 text-left border-r border-black">Station / City</th>
                      <th className="p-1.5 text-right border-r border-black w-28">Monthly Copies</th>
                      <th className="p-1.5 text-right font-black w-36">Est. Purchase (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((p: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1.5 border-r border-slate-300 font-bold text-blue-950">{p.name}</td>
                        <td className="p-1.5 border-r border-slate-300 text-slate-700">{p.contact}</td>
                        <td className="p-1.5 border-r border-slate-300">{p.city}</td>
                        <td className="p-1.5 border-r border-slate-300 text-right font-mono font-bold">{p.totalCopies}</td>
                        <td className="p-1.5 text-right font-mono font-black text-emerald-900">₹{Number(p.totalAmount).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={3} className="p-1.5 text-left uppercase border-r border-black">Total Newspaper Procurement:</td>
                      <td className="p-1.5 text-right font-mono border-r border-black">{reportData.total_copies}</td>
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">₹{Number(reportData.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 16: COUNTER SALE REPORTS */}
              {/* ========================================================================= */}
              {(activeReport === 'countersale_datewise' || activeReport === 'countersale_pubwise') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-14">Txn ID</th>
                      <th className="p-1 text-center border-r border-black w-24">Date</th>
                      <th className="p-1 text-left border-r border-black">Publication Name</th>
                      <th className="p-1 text-left border-r border-black">Customer / Counter</th>
                      <th className="p-1 text-center border-r border-black w-14">Qty</th>
                      <th className="p-1 text-right border-r border-black w-20">Rate (₹)</th>
                      <th className="p-1 text-right font-black w-24">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((s: any) => (
                      <tr key={s.id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono">#{s.id}</td>
                        <td className="p-1 text-center border-r border-slate-300 font-mono">{s.sale_date}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{s.publication}</td>
                        <td className="p-1 border-r border-slate-300 text-slate-700">{s.customer_name}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono font-bold">{s.qty}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono">₹{Number(s.rate).toFixed(2)}</td>
                        <td className="p-1 text-right font-mono font-bold text-emerald-800">₹{Number(s.total_amt).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={6} className="p-1.5 text-left uppercase border-r border-black">Grand Total Cash Sales:</td>
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">₹{Number(reportData.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 17: HAWKER CUSTOMER PRIORITY REPORT */}
              {/* ========================================================================= */}
              {activeReport === 'hawker_cust_priority' && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-14">Priority</th>
                      <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1 text-left border-r border-black">Customer Name</th>
                      <th className="p-1 text-left border-r border-black">Delivery Address</th>
                      <th className="p-1 text-left">Newspaper & Magazines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any) => (
                      <tr key={r.customer_id} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono font-black text-blue-900">#{r.priority}</td>
                        <td className="p-1 text-center border-r border-slate-300 font-mono">#{r.customer_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{r.name}</td>
                        <td className="p-1 border-r border-slate-300 text-slate-700">{r.address}</td>
                        <td className="p-1 font-medium">{r.publications}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 18: STICKER PRINTING LABELS */}
              {/* ========================================================================= */}
              {activeReport === 'sticker_printing' && (
                <div className="grid grid-cols-3 gap-3 font-sans">
                  {reportData.rows.map((s: any) => (
                    <div key={s.customer_id} className="border border-slate-400 p-2.5 rounded-xs bg-slate-50 text-[10px] space-y-0.5">
                      <div className="flex justify-between font-bold border-b border-slate-300 pb-0.5">
                        <span className="text-blue-900 font-mono">#{s.customer_id}</span>
                        <span className="text-slate-600">{s.region}</span>
                      </div>
                      <div className="font-bold text-slate-900 text-[11px] pt-0.5">{s.name}</div>
                      <div className="text-slate-600 truncate">{s.address1 || s.address2 || 'Beawar'}</div>
                      <div className="text-[9px] text-slate-500 font-mono">Ph: {s.phone || '---'}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ========================================================================= */}
              {/* REPORT 19: CONSOLIDATED & DAILY SALE REPORT */}
              {/* ========================================================================= */}
              {(activeReport === 'consolidated_sale' || activeReport === 'daily_sale') && (
                <div className="space-y-4">
                  <table className="w-full text-xs border-collapse border border-black">
                    <thead>
                      <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                        <th className="p-2 text-left border-r border-black">Distribution & Revenue Category</th>
                        <th className="p-2 text-right border-r border-black w-36">Total Amount (₹)</th>
                        <th className="p-2 text-center w-24">Contribution %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.rows.map((r: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                          <td className="p-2 border-r border-slate-300 font-bold text-blue-950">{r.category}</td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-bold text-emerald-900">
                            ₹{Number(r.amount).toFixed(2)}
                          </td>
                          <td className="p-2 text-center font-mono font-bold">{r.percentage}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                        <td className="p-2 text-left uppercase border-r border-black">Gross Consolidated Revenue:</td>
                        <td className="p-2 text-right font-mono text-sm text-blue-900 border-r border-black">
                          ₹{Number(reportData.grand_total || 0).toFixed(2)}
                        </td>
                        <td className="p-2 text-center font-mono">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* ========================================================================= */}
              {/* REPORT 20: COLLECTION DATEWISE & HAWKER DATEWISE */}
              {/* ========================================================================= */}
              {(activeReport === 'collection_datewise' || activeReport === 'collection_hawker_datewise') && (
                <table className="w-full text-xs border-collapse border border-black font-sans">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1.5 text-center border-r border-black w-24">Receipt No</th>
                      <th className="p-1.5 text-center border-r border-black w-24">Date</th>
                      <th className="p-1.5 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1.5 text-left border-r border-black">Customer Name</th>
                      <th className="p-1.5 text-left border-r border-black">Region</th>
                      <th className="p-1.5 text-center border-r border-black w-20">Mode</th>
                      <th className="p-1.5 text-right font-black w-28">Collected Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono font-bold text-blue-900">{r.receipt_no}</td>
                        <td className="p-1 text-center border-r border-slate-300 font-mono">{r.receipt_date}</td>
                        <td className="p-1 text-center border-r border-slate-300 font-mono">#{r.customer_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{r.customer_name}</td>
                        <td className="p-1 border-r border-slate-300 text-slate-700">{r.region_name}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-bold">{r.mode}</td>
                        <td className="p-1 text-right font-mono font-bold text-emerald-800">₹{Number(r.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={6} className="p-1.5 text-left uppercase border-r border-black">Total Collections:</td>
                      <td className="p-1.5 text-right font-mono text-sm text-emerald-900">₹{Number(reportData.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 21: HAWKER REPORT DATEWISE */}
              {/* ========================================================================= */}
              {activeReport === 'hawker_report_datewise' && (
                <table className="w-full text-xs border-collapse border border-black font-sans">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1.5 text-center border-r border-black w-14">Hawker ID</th>
                      <th className="p-1.5 text-left border-r border-black">Hawker / Distributor Name</th>
                      <th className="p-1.5 text-left border-r border-black">Delivery Area / Region</th>
                      <th className="p-1.5 text-right border-r border-black w-28">Active Customers</th>
                      <th className="p-1.5 text-right font-black w-28">Daily Copies Delivered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((r: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono font-bold">#{r.hawker_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{r.hawker_name}</td>
                        <td className="p-1 border-r border-slate-300 text-slate-700">{r.area}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono font-bold">{r.active_customers}</td>
                        <td className="p-1 text-right font-mono font-black text-blue-900">{r.total_copies}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={4} className="p-1.5 text-left uppercase border-r border-black">Total Distribution:</td>
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">{reportData.total_copies}</td>
                    </tr>
                  </tbody>
                </table>
              )}

            </div>
          )}

          {/* Footer Signatures matching Crystal Reports */}
          <div className="pt-14 flex justify-between text-xs font-serif font-bold">
            <div className="text-center">
              <div className="w-36 border-t border-black pt-1">Prepared By</div>
            </div>
            <div className="text-center">
              <div className="w-36 border-t border-black pt-1">Checked By</div>
            </div>
            <div className="text-center">
              <div className="w-36 border-t border-black pt-1">For Aryan News Agency</div>
            </div>
          </div>

          <div className="text-center pt-8 text-[10px] text-slate-500 font-sans">
            --- End of Report (Crystal Reports for Windows • Aryan News Agency) ---
          </div>

        </div>

      </div>

    </div>
  );
}
