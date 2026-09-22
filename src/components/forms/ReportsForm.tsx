'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Printer, RefreshCw, Search, Download, ZoomIn, ZoomOut, 
  ChevronLeft, ChevronRight, FileText, X, Filter, Calendar 
} from 'lucide-react';

interface ReportsFormProps {
  onClose: () => void;
  initialReport?: string;
  initialRegion?: number | string;
  initialHawker?: number | string;
  initialPub?: number | string;
}

export default function ReportsForm({ 
  onClose, 
  initialReport = 'hawker_daily_qty',
  initialRegion = 'all',
  initialHawker = 'all',
  initialPub = 'all'
}: ReportsFormProps) {
  const [activeReport, setActiveReport] = useState<string>(initialReport);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filters
  const [regions, setRegions] = useState<any[]>([]);
  const [hawkers, setHawkers] = useState<any[]>([]);
  const [publications, setPublications] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>(String(initialRegion));
  const [selectedHawker, setSelectedHawker] = useState<string>(String(initialHawker));
  const [selectedPub, setSelectedPub] = useState<string>(String(initialPub));
  const [selectedMonth, setSelectedMonth] = useState<string>('August');
  const [selectedYear, setSelectedYear] = useState<string>('2026');

  // Report Data
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Sync initialReport when prop changes
  useEffect(() => {
    if (initialReport) {
      setActiveReport(initialReport);
      setCurrentPage(1);
    }
  }, [initialReport]);

  // Load Dropdown Metadata
  useEffect(() => {
    fetch('/data/regions.json').then(r => r.json()).then(d => setRegions(d || [])).catch(() => {});
    fetch('/data/hawkers.json').then(r => r.json()).then(d => setHawkers(d || [])).catch(() => {});
    fetch('/data/publications.json').then(r => r.json()).then(d => setPublications(d || [])).catch(() => {});
  }, []);

  // Fetch Report Data from API
  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        type: activeReport,
        region_id: selectedRegion,
        hawker_id: selectedHawker,
        publica_id: selectedPub,
        month: selectedMonth,
        year: selectedYear,
        page: String(currentPage),
        limit: '50',
        search: searchQuery
      });

      const res = await fetch(`/api/reports?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setReportData(json);
        setTotalPages(json.total_pages || 1);
      }
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeReport, selectedRegion, selectedHawker, selectedPub, selectedMonth, selectedYear, currentPage, searchQuery]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const now = new Date();
  const printDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${now.toLocaleTimeString()}`;

  const handlePrint = () => {
    window.print();
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

  return (
    <div className="relative w-[1020px] h-[720px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden text-xs">
      
      {/* 1. Crystal Reports Classic Title Bar */}
      <div className="bg-gradient-to-r from-[#0A246A] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold">
        <div className="flex items-center gap-1.5">
          <img src="/legacy_images/paper.ico" alt="ico" className="w-4 h-4" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span>Crystal Report Viewer - Aryan News Agency [Beawar]</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">_</button>
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* 2. Top Toolbar with All 16 Report Selectors */}
      <div className="bg-[#ECE9D8] border-b border-[#808080] p-1.5 flex items-center justify-between font-bold gap-2 flex-wrap">
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* Main 16 Reports Dropdown */}
          <select 
            value={activeReport}
            onChange={(e) => {
              setActiveReport(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2 py-0.5 border border-[#808080] bg-white font-bold text-black outline-none text-xs max-w-[320px]"
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
            </optgroup>
            <optgroup label="9. Sale Reports">
              <option value="consolidated_sale">Consolidated Sale Report</option>
              <option value="daily_sale">Daily / Periodic Sale Report</option>
            </optgroup>
            <optgroup label="11. Bill Printing">
              <option value="bill_print_region">Region Wise Bill Printing</option>
              <option value="bill_print_single">Single Bill Printing</option>
            </optgroup>
            <optgroup label="12-16. Operational Reports">
              <option value="hawker_cust_priority">Hawker&apos;s Customer Priority</option>
              <option value="sticker_printing">Sticker Printing</option>
              <option value="hawker_report_datewise">Hawker Report Datewise</option>
              <option value="collection_datewise">Collection Datewise</option>
            </optgroup>
          </select>

          <div className="h-4 w-[1px] bg-[#808080]"></div>

          {/* Action Buttons */}
          <button 
            onClick={handlePrint}
            className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-[#808080] flex items-center gap-1 cursor-pointer"
            title="Print Report (Ctrl+P)"
          >
            <Printer className="w-3.5 h-3.5 text-blue-900" />
            <span>Print</span>
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

      {/* 3. Filter Bar (Contextual depending on active report) */}
      <div className="bg-[#F0EEE2] border-b border-[#808080] px-2 py-1 flex items-center gap-3 text-xs flex-wrap font-sans">
        
        {/* Region Filter */}
        <div className="flex items-center gap-1">
          <span className="font-bold text-slate-700">Region:</span>
          <select 
            value={selectedRegion}
            onChange={(e) => { setSelectedRegion(e.target.value); setCurrentPage(1); }}
            className="px-1 py-0.5 border border-[#808080] bg-white text-[11px] max-w-[140px]"
          >
            <option value="all">All Regions</option>
            {regions.map(r => (
              <option key={r.region_id} value={r.region_id}>{r.region_name} (#{r.region_id})</option>
            ))}
          </select>
        </div>

        {/* Hawker Filter */}
        {(activeReport.includes('hawker') || activeReport === 'cust_pub_starting' || activeReport === 'cust_choose_pub') && (
          <div className="flex items-center gap-1">
            <span className="font-bold text-slate-700">Hawker:</span>
            <select 
              value={selectedHawker}
              onChange={(e) => { setSelectedHawker(e.target.value); setCurrentPage(1); }}
              className="px-1 py-0.5 border border-[#808080] bg-white text-[11px] max-w-[150px]"
            >
              <option value="all">All Hawkers</option>
              {hawkers.filter(h => h.name).slice(0, 80).map(h => (
                <option key={h.hawker_id} value={h.hawker_id}>{h.name} (#{h.hawker_id})</option>
              ))}
            </select>
          </div>
        )}

        {/* Publication Filter */}
        {(activeReport === 'cust_choose_pub' || activeReport === 'cust_pub_starting' || activeReport === 'countersale_pubwise') && (
          <div className="flex items-center gap-1">
            <span className="font-bold text-slate-700">Publication:</span>
            <select 
              value={selectedPub}
              onChange={(e) => { setSelectedPub(e.target.value); setCurrentPage(1); }}
              className="px-1 py-0.5 border border-[#808080] bg-white text-[11px] max-w-[160px]"
            >
              <option value="all">All Publications</option>
              {publications.slice(0, 50).map(p => (
                <option key={p.publica_id} value={p.publica_id}>{p.abrv || p.public_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Month & Year Filter */}
        <div className="flex items-center gap-1">
          <span className="font-bold text-slate-700">Period:</span>
          <select 
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
            className="px-1 py-0.5 border border-[#808080] bg-white text-[11px]"
          >
            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select 
            value={selectedYear}
            onChange={(e) => { setSelectedYear(e.target.value); setCurrentPage(1); }}
            className="px-1 py-0.5 border border-[#808080] bg-white text-[11px]"
          >
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2027">2027</option>
          </select>
        </div>

        {/* Live Search */}
        <div className="flex items-center gap-1 ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <input 
            type="text"
            placeholder="Search report..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="px-1.5 py-0.5 border border-[#808080] bg-white text-[11px] w-36 outline-none"
          />
        </div>

      </div>

      {/* 4. Main Crystal Reports Canvas Area */}
      <div className="flex-1 bg-[#525659] p-4 overflow-auto flex justify-center items-start">
        
        {/* Printable White Sheet of Paper */}
        <div 
          className="bg-white shadow-[0_4px_25px_rgba(0,0,0,0.6)] p-8 font-serif text-black border border-slate-300 transition-all duration-150 min-h-[900px]"
          style={{ 
            width: `${Math.round(880 * (zoomLevel / 100))}px`, 
            fontSize: `${Math.round(11 * (zoomLevel / 100))}px`
          }}
        >
          
          {/* Header */}
          <div className="text-center pb-3 border-b-2 border-black space-y-1">
            <h1 className="text-xl font-black tracking-wider uppercase">ARYAN NEWS AGENCY</h1>
            <p className="text-[11px] text-slate-700 font-sans font-bold">Main Market, Near Clock Tower, Beawar (Raj.) - 305901 • Ph: 01462-250000</p>
            <h2 className="text-sm font-black text-[#000080] underline tracking-wide uppercase pt-1 font-sans">
              {reportData?.report_title || 'CRYSTAL REPORT VIEWER'}
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
          ) : !reportData || !reportData.rows || reportData.rows.length === 0 ? (
            <div className="p-16 text-center text-slate-500 font-sans">
              No matching records found for the selected criteria.
            </div>
          ) : (
            <div className="pt-3 font-sans">
              
              {/* ========================================================================= */}
              {/* REPORT 1 & 7: HAWKER DAILY QUANTITY OF NEWSPAPER / MAGAZINE MATRIX */}
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
                    {/* Grand Total Summary Row */}
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
              {/* REPORT 2: CUSTOMER OUTSTANDING DUES LEDGER & PREVIOUS DUES */}
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
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{c.name}</td>
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
              {/* REPORT 3: DUE REGION WISE SUMMARY */}
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
              {/* REPORT 4: CUSTOMER DETAIL / MONTH REGISTER */}
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
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{c.name}</td>
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
              {/* REPORT 5: CUSTOMER PUBLICATION STARTING */}
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
              {/* REPORT 6: CIRCULATION TYPE PUBLICATION REPORT */}
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
              {/* REPORT 7: CUSTOMER CHOOSE PUBLICATION */}
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
                        <th className="p-1 text-center font-black w-14">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.rows.map((r: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                          <td className="p-1 text-center border-r border-slate-300 font-mono">#{r.customer_id}</td>
                          <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{r.name}</td>
                          <td className="p-1 border-r border-slate-300 text-slate-700 truncate max-w-[200px]">{r.address}</td>
                          <td className="p-1 border-r border-slate-300 text-slate-600">{r.region_name}</td>
                          <td className="p-1 border-r border-slate-300">{r.hawker_name}</td>
                          <td className="p-1 text-center font-mono font-bold">{r.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ========================================================================= */}
              {/* REPORT 8: DISCONTINUE REPORTS */}
              {/* ========================================================================= */}
              {(activeReport === 'discontinue_datewise' || activeReport === 'discontinue_hawkerwise') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1 text-left border-r border-black">Customer Name</th>
                      <th className="p-1 text-left border-r border-black">Address</th>
                      <th className="p-1 text-left border-r border-black">Publication</th>
                      <th className="p-1 text-center border-r border-black w-24">From Date</th>
                      <th className="p-1 text-center border-r border-black w-24">To Date</th>
                      <th className="p-1 text-center font-black">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((d: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono">#{d.customer_id}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{d.customer_name}</td>
                        <td className="p-1 border-r border-slate-300 text-slate-700 truncate max-w-[200px]">{d.address}</td>
                        <td className="p-1 border-r border-slate-300 font-medium">{d.publication}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono">{d.from_date}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono">{d.to_date}</td>
                        <td className="p-1 text-center font-bold text-red-900">{d.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 9: RECEIPT REPORTS */}
              {/* ========================================================================= */}
              {(activeReport === 'receipt_nowise' || activeReport === 'receipt_realamt') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1 text-center border-r border-black w-20">Receipt No</th>
                      <th className="p-1 text-center border-r border-black w-14">Cust ID</th>
                      <th className="p-1 text-left border-r border-black">Customer Name</th>
                      <th className="p-1 text-center border-r border-black w-24">Date</th>
                      <th className="p-1 text-right border-r border-black w-20">Due (₹)</th>
                      <th className="p-1 text-right border-r border-black w-24">Received (₹)</th>
                      <th className="p-1 text-right border-r border-black w-20">Discount (₹)</th>
                      <th className="p-1 text-center">Mode</th>
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
                        <td className="p-1 border-r border-slate-300 text-right font-mono text-slate-500">₹{Number(r.less_amt).toFixed(2)}</td>
                        <td className="p-1 text-center font-bold">{r.payment_mode}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={5} className="p-1.5 text-left uppercase border-r border-black">Total Receipts:</td>
                      <td className="p-1.5 text-right font-mono border-r border-black text-emerald-900">₹{Number(reportData.total_received || 0).toFixed(2)}</td>
                      <td className="p-1.5 text-right font-mono border-r border-black text-slate-600">₹{Number(reportData.total_discount || 0).toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 10: PURCHASE REPORTS */}
              {/* ========================================================================= */}
              {(activeReport === 'purchase_datewise' || activeReport === 'purchase_publisherwise') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1.5 text-left border-r border-black">Publisher / Dealer Name</th>
                      <th className="p-1.5 text-left border-r border-black">City / Contact</th>
                      <th className="p-1.5 text-right border-r border-black">Daily Copies Received</th>
                      <th className="p-1.5 text-right font-black">Estimated Monthly Purchase (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((p: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1.5 border-r border-slate-300 font-bold text-blue-950">{p.name}</td>
                        <td className="p-1.5 border-r border-slate-300 text-slate-700">{p.city} • {p.contact}</td>
                        <td className="p-1.5 border-r border-slate-300 text-right font-mono font-bold">{p.totalCopies}</td>
                        <td className="p-1.5 text-right font-mono font-bold text-blue-900">₹{Number(p.totalAmount).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={2} className="p-1.5 text-left uppercase border-r border-black">Total Purchases:</td>
                      <td className="p-1.5 text-right font-mono border-r border-black">{reportData.total_copies}</td>
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">₹{Number(reportData.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 11: COUNTER SALE REPORTS */}
              {/* ========================================================================= */}
              {(activeReport === 'countersale_datewise' || activeReport === 'countersale_pubwise') && (
                <table className="w-full text-xs border-collapse border border-black">
                  <thead>
                    <tr className="border-b-2 border-t border-black bg-slate-100 font-bold text-[11px]">
                      <th className="p-1.5 text-center border-r border-black w-24">Sale Date</th>
                      <th className="p-1.5 text-left border-r border-black">Publication</th>
                      <th className="p-1.5 text-left border-r border-black">Customer / Buyer</th>
                      <th className="p-1.5 text-center border-r border-black w-14">Qty</th>
                      <th className="p-1.5 text-right border-r border-black w-20">Rate (₹)</th>
                      <th className="p-1.5 text-right font-black w-24">Total Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((s: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-300 text-[11px] hover:bg-yellow-50">
                        <td className="p-1 text-center border-r border-slate-300 font-mono">{s.sale_date}</td>
                        <td className="p-1 border-r border-slate-300 font-bold text-blue-950">{s.publication}</td>
                        <td className="p-1 border-r border-slate-300">{s.customer_name}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono font-bold">{s.qty}</td>
                        <td className="p-1 border-r border-slate-300 text-right font-mono">₹{Number(s.rate).toFixed(2)}</td>
                        <td className="p-1 text-right font-mono font-bold text-emerald-800">₹{Number(s.total_amt).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-b-2 border-black font-black text-xs bg-slate-100">
                      <td colSpan={5} className="p-1.5 text-left uppercase border-r border-black">Grand Total Cash Sales:</td>
                      <td className="p-1.5 text-right font-mono text-sm text-blue-900">₹{Number(reportData.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ========================================================================= */}
              {/* REPORT 12: HAWKER CUSTOMER PRIORITY REPORT */}
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
              {/* REPORT 13: STICKER PRINTING LABELS */}
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
              {/* REPORT 14: CONSOLIDATED SALE REPORT */}
              {/* ========================================================================= */}
              {activeReport === 'consolidated_sale' && (
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

              {/* Default Fallback Table */}
              {!['hawker_daily_qty', 'hawker_magazine_qty', 'dues_ledger', 'previous_dues_wise', 'advance_list', 'due_region_summary', 'cust_detail_month', 'cust_pub_starting', 'circ_type_pub', 'cust_choose_pub', 'discontinue_datewise', 'discontinue_hawkerwise', 'receipt_nowise', 'receipt_realamt', 'purchase_datewise', 'purchase_publisherwise', 'countersale_datewise', 'countersale_pubwise', 'hawker_cust_priority', 'sticker_printing', 'consolidated_sale'].includes(activeReport) && (
                <div className="p-8 text-center text-slate-600 font-sans">
                  <FileText className="w-10 h-10 mx-auto text-blue-900 mb-2" />
                  <p className="font-bold">Displaying records for {reportData.report_title}</p>
                  <p className="text-xs text-slate-500 mt-1">Total {reportData.total_rows} entries processed.</p>
                </div>
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
