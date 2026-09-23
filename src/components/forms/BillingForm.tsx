'use client';

import React, { useState, useEffect } from 'react';
import { Printer, RefreshCw, X, Search, FileText, Eye, CheckCircle2, ChevronLeft, ChevronRight, Play, Database, Check } from 'lucide-react';
import { Customer, Publication, Rate, Holiday, Discontinue } from '@/lib/types';
import { BillingLineItem } from '@/lib/billingEngine';

interface BillingFormProps {
  onClose: () => void;
  customers?: Customer[];
  publications?: Publication[];
  rates?: Rate[];
  holidays?: Holiday[];
  discontinues?: Discontinue[];
}

const MONTHS = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

const FINANCIAL_YEARS = [
  { label: '2026-2027', value: '20262027', year: 2026 },
  { label: '2025-2026', value: '20252026', year: 2025 },
  { label: '2024-2025', value: '20242025', year: 2024 }
];

export default function BillingForm({ onClose }: BillingFormProps) {
  const [month, setMonth] = useState('August');
  const [selectedYear, setSelectedYear] = useState('20262027');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [commitToDatabase, setCommitToDatabase] = useState(true);
  const [regions, setRegions] = useState<any[]>([]);
  
  // Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processStatus, setProcessStatus] = useState('');
  const [processDone, setProcessDone] = useState(false);
  const [summaryData, setSummaryData] = useState<{ totalBills: number; grandTotal: number; savedToSupabase?: boolean } | null>(null);

  // Grid / Viewer States
  const [showGrid, setShowGrid] = useState(false);
  const [bills, setBills] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);

  // Single Customer Breakup Modal
  const [breakupCustomer, setBreakupCustomer] = useState<any | null>(null);
  const [breakupLines, setBreakupLines] = useState<BillingLineItem[]>([]);
  const [isLoadingBreakup, setIsLoadingBreakup] = useState(false);

  // Single Customer Print Slip Dialog
  const [selectedBillForPrint, setSelectedBillForPrint] = useState<any | null>(null);

  // Load regions
  useEffect(() => {
    fetch('/data/regions.json')
      .then(r => r.json())
      .then(d => setRegions(d || []))
      .catch(() => {});
  }, []);

  // Execute Bill Processing (Matching VB6 BillProcessing screenshot_14.jpg)
  const handleProcess = async () => {
    setIsProcessing(true);
    setProcessDone(false);
    setProgress(15);
    setProcessStatus(`Calculating date-effective rates, holidays & subscriptions for ${month}...`);

    try {
      setTimeout(() => setProgress(40), 200);
      setTimeout(() => setProgress(75), 500);

      // 1. Process via API POST
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          year: selectedYear,
          region_id: selectedRegion,
          commitToDb: commitToDatabase
        })
      });
      const data = await res.json();

      // 2. Load first page of bills for preview
      const gridRes = await fetch(`/api/billing?month=${month}&year=${selectedYear}&region_id=${selectedRegion}&page=1&limit=50`);
      const gridData = await gridRes.json();

      setProgress(100);
      setBills(gridData.bills || []);
      setTotalCustomers(gridData.total_customers || data.total_customers || 0);
      setSummaryData({
        totalBills: data.total_bills_generated || gridData.total_customers || 0,
        grandTotal: data.grand_total || gridData.grand_total || 0,
        savedToSupabase: data.saved_to_supabase
      });
      setProcessStatus(`Bill Processing Complete! ${data.total_bills_generated || gridData.total_customers} bills calculated successfully.`);
      setProcessDone(true);
    } catch (err: any) {
      setProcessStatus(`Error processing bills: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Fetch paginated / searched bills when grid is open
  const fetchBillsPage = async (p: number, s: string) => {
    try {
      const query = `/api/billing?month=${month}&year=${selectedYear}&region_id=${selectedRegion}&search=${encodeURIComponent(s)}&page=${p}&limit=50`;
      const res = await fetch(query);
      const data = await res.json();
      setBills(data.bills || []);
      setTotalCustomers(data.total_customers || 0);
    } catch (err) {
      console.error(err);
    }
  };

  // Auto-refresh bills when month, year, or region changes if grid is open
  useEffect(() => {
    if (showGrid) {
      fetchBillsPage(1, searchQuery);
      setPage(1);
    }
  }, [month, selectedYear, selectedRegion, showGrid]);

  // Open Breakup Modal
  const handleOpenBreakup = async (bill: any) => {
    setBreakupCustomer(bill);
    setIsLoadingBreakup(true);
    try {
      const targetMonth = bill.month || month;
      const targetYear = bill.year || selectedYear;
      const res = await fetch(`/api/billing?customer_id=${bill.customer_id}&month=${targetMonth}&year=${targetYear}`);
      const data = await res.json();
      setBreakupLines(data.breakup || []);
    } catch (err) {
      console.error('Error fetching breakup:', err);
    } finally {
      setIsLoadingBreakup(false);
    }
  };

  const totalPages = Math.ceil(totalCustomers / 50) || 1;

  return (
    <div className={`relative ${showGrid ? 'w-[920px] h-[640px]' : 'w-[600px] h-auto'} bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden transition-all duration-200`}>
      
      {/* Title Bar matching screenshot_14.jpg */}
      <div className="bg-gradient-to-r from-[#0A246A] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold text-xs">
        <div className="flex items-center gap-1.5">
          <img 
            src="/legacy_images/paper.ico" 
            alt="ico" 
            className="w-4 h-4" 
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          <span>Bill Processing & Monthly Generation (बिल जेनरेशन)</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">_</button>
          <button className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-white cursor-pointer">□</button>
          <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Authentic Bill Processing Bar (screenshot_14.jpg) */}
      <div className="p-4 bg-white border border-t-[#808080] border-l-[#808080] border-r-white border-b-white m-3 space-y-3">
        
        {/* Row 1: Region, Month, Year & Process Button */}
        <div className="grid grid-cols-12 gap-2 items-center text-xs">
          
          {/* Region Dropdown */}
          <div className="col-span-5 flex items-center gap-1.5">
            <label className="font-bold text-[#000080] text-xs shrink-0">Region:</label>
            <select 
              value={selectedRegion}
              onChange={(e) => { setSelectedRegion(e.target.value); setProcessDone(false); }}
              className="w-full px-1.5 py-1 border border-[#808080] bg-white font-bold text-slate-900 outline-none text-xs"
            >
              <option value="all">All Regions (सभी क्षेत्र)</option>
              {regions.map(r => (
                <option key={r.region_id || r.id} value={r.region_id || r.id}>
                  {r.name || r.region_name || `Region ${r.region_id}`}
                </option>
              ))}
            </select>
          </div>

          {/* Month Dropdown */}
          <div className="col-span-3 flex items-center gap-1.5">
            <label className="font-bold text-[#000080] text-xs shrink-0">Month:</label>
            <select 
              value={month}
              onChange={(e) => { setMonth(e.target.value); setProcessDone(false); }}
              className="w-full px-1.5 py-1 border border-[#808080] bg-white font-bold text-[#8B0000] outline-none text-xs"
            >
              {MONTHS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year Dropdown */}
          <div className="col-span-2 flex items-center gap-1">
            <select 
              value={selectedYear}
              onChange={(e) => { setSelectedYear(e.target.value); setProcessDone(false); }}
              className="w-full px-1 py-1 border border-[#808080] bg-white font-bold text-slate-900 outline-none text-xs"
            >
              {FINANCIAL_YEARS.map(y => (
                <option key={y.value} value={y.value}>{y.label}</option>
              ))}
            </select>
          </div>

          {/* Process Button matching screenshot_14.jpg */}
          <div className="col-span-2 flex justify-end">
            <button 
              onClick={handleProcess}
              disabled={isProcessing}
              className="w-full py-1 bg-gradient-to-b from-[#E0F7FA] to-[#B2EBF2] hover:from-[#B2EBF2] hover:to-[#80DEEA] border border-[#00838F] shadow-sm transform -skew-x-6 cursor-pointer flex items-center justify-center gap-1 text-xs font-bold text-black disabled:opacity-50"
            >
              <span className="transform skew-x-6 flex items-center gap-1">
                <img src="/legacy_images/paper.ico" alt="ico" className="w-3.5 h-3.5" onError={(e) => (e.currentTarget.style.display = 'none')} />
                <u>P</u>rocess
              </span>
            </button>
          </div>

        </div>

        {/* Database Sync Option */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-600">
          <label className="flex items-center gap-1.5 cursor-pointer font-bold select-none text-slate-800">
            <input 
              type="checkbox" 
              checked={commitToDatabase} 
              onChange={(e) => setCommitToDatabase(e.target.checked)}
              className="cursor-pointer"
            />
            <Database className="w-3.5 h-3.5 text-blue-700" />
            <span>Save & Commit generated bills to live Supabase Database (bill / billno tables)</span>
          </label>
          <span className="text-slate-500 font-mono text-[10px]">VB6 2008 Precision Engine</span>
        </div>

        {/* Progress Bar & Status */}
        {isProcessing && (
          <div className="space-y-1 pt-1">
            <div className="w-full bg-slate-200 h-3 border border-slate-400 overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-[11px] font-bold text-blue-900 text-center animate-pulse">{processStatus}</p>
          </div>
        )}

        {/* Completion Card & Quick Actions */}
        {processDone && (
          <div className="bg-[#ECE9D8] p-3 border border-[#808080] space-y-2 select-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{processStatus}</span>
              </div>
              <span className="text-xs font-black font-mono text-blue-900">
                Grand Total: <strong className="text-sm">₹{summaryData?.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button 
                onClick={() => setShowGrid(!showGrid)}
                className="px-3 py-1 bg-white hover:bg-blue-50 border border-blue-600 text-blue-900 font-bold text-xs cursor-pointer flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5 text-blue-700" />
                <span>{showGrid ? 'Hide Bills List' : 'View Generated Bills & Breakup'}</span>
              </button>

              <button 
                onClick={() => window.print()}
                className="px-3 py-1 bg-[#0A246A] hover:bg-[#000080] text-white font-bold text-xs cursor-pointer flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Invoices / Slips</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Expandable Bills Ledger Grid when user clicks "View Generated Bills" */}
      {showGrid && (
        <div className="flex-1 px-3 pb-3 flex flex-col justify-between overflow-hidden">
          
          {/* Search Toolbar */}
          <div className="flex items-center justify-between pb-1 text-xs">
            <span className="font-bold text-slate-700 text-[11px]">
              Showing {bills.length} bills on page {page} of {totalPages} (Total Customers: {totalCustomers})
            </span>

            <div className="flex items-center gap-1 bg-white px-2 py-0.5 border border-slate-400">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <input 
                type="text"
                placeholder="Search Customer / Hindi / Phone..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  fetchBillsPage(1, e.target.value);
                }}
                className="outline-none text-xs w-56 font-bold"
              />
            </div>
          </div>

          {/* Grid Table */}
          <div className="flex-1 bg-white vb-grid overflow-auto border border-[#808080]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#ECE9D8] border-b border-[#808080]">
                <tr>
                  <th className="p-1.5 border text-center">Bill No</th>
                  <th className="p-1.5 border text-left">Customer Name (Hindi/Eng)</th>
                  <th className="p-1.5 border text-left">Region</th>
                  <th className="p-1.5 border text-right">Previous Due</th>
                  <th className="p-1.5 border text-right">Current Papers</th>
                  <th className="p-1.5 border text-right">Delivery</th>
                  <th className="p-1.5 border text-right">Discount</th>
                  <th className="p-1.5 border text-right">Total Payable</th>
                  <th className="p-1.5 border text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b, idx) => (
                  <tr key={idx} className="border-b hover:bg-blue-50 text-[11px]">
                    <td className="p-1 border-r font-mono text-center font-bold">#{b.bill_no}</td>
                    <td className="p-1 border-r font-bold text-blue-900">
                      <div>{b.name_eng}</div>
                      {b.customer_hindi && <div className="text-[10px] text-slate-500 font-normal">{b.customer_hindi}</div>}
                    </td>
                    <td className="p-1 border-r text-slate-700 text-[10px]">{b.region_name}</td>
                    <td className="p-1 border-r text-right font-mono text-slate-700">₹{b.previous_due?.toFixed(2)}</td>
                    <td className="p-1 border-r text-right font-mono font-bold text-slate-800">₹{b.paper_amount?.toFixed(2)}</td>
                    <td className="p-1 border-r text-right font-mono text-slate-600">₹{b.delivery_amount?.toFixed(2)}</td>
                    <td className="p-1 border-r text-right font-mono text-rose-700">
                      {b.discount_amount ? `-₹${b.discount_amount?.toFixed(2)}` : '₹0.00'}
                    </td>
                    <td className="p-1 border-r text-right font-mono font-bold text-blue-900 bg-blue-50/50">
                      ₹{b.total_payable?.toFixed(2)}
                    </td>
                    <td className="p-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          onClick={() => handleOpenBreakup(b)}
                          className="px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 border border-amber-400 text-amber-900 font-bold rounded-xs text-[10px] cursor-pointer flex items-center gap-0.5"
                          title="View Exact SQL Line Breakup"
                        >
                          <Eye className="w-2.5 h-2.5" />
                          <span>Breakup</span>
                        </button>
                        <button 
                          onClick={() => setSelectedBillForPrint(b)}
                          className="px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 border border-blue-400 text-blue-900 font-bold rounded-xs text-[10px] cursor-pointer"
                        >
                          Slip
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pt-2 flex items-center justify-between text-xs font-bold">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchBillsPage(p, searchQuery); }}
                disabled={page === 1}
                className="px-2 py-0.5 bg-white border border-slate-400 disabled:opacity-50 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span>Page {page} of {totalPages}</span>
              <button 
                onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchBillsPage(p, searchQuery); }}
                disabled={page >= totalPages}
                className="px-2 py-0.5 bg-white border border-slate-400 disabled:opacity-50 cursor-pointer"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            
            <button 
              onClick={onClose} 
              className="px-4 py-1 bg-white hover:bg-red-50 text-red-800 border border-red-400 font-bold cursor-pointer"
            >
              Close
            </button>
          </div>

        </div>
      )}

      {/* Breakup Modal */}
      {breakupCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-black border-b-black shadow-2xl p-3 flex flex-col max-h-[85vh]">
            
            <div className="bg-[#0A246A] text-white px-2 py-1 flex items-center justify-between font-bold text-xs mb-2">
              <span>Itemized Billing Breakup - Customer #{breakupCustomer.customer_id}: {breakupCustomer.name_eng}</span>
              <button onClick={() => setBreakupCustomer(null)} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center">✕</button>
            </div>

            <div className="bg-white p-2 vb-box-inset flex-1 overflow-auto">
              {isLoadingBreakup ? (
                <div className="p-8 text-center text-slate-400">Loading itemized breakup...</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-[#ECE9D8] sticky top-0">
                    <tr>
                      <th className="p-1.5 border text-left">Sort</th>
                      <th className="p-1.5 border text-left">Item Name</th>
                      <th className="p-1.5 border text-right">Rate</th>
                      <th className="p-1.5 border text-center">Qty</th>
                      <th className="p-1.5 border text-center">Days / Copies</th>
                      <th className="p-1.5 border text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakupLines.map((item, idx) => (
                      <tr key={idx} className={`border-b text-[11px] ${item.sort_order === 9 ? 'bg-amber-100 font-bold text-blue-900 border-t-2 border-black' : item.sort_order === 4 ? 'bg-slate-50 italic text-slate-700' : item.sort_order === 3 ? 'text-rose-700' : 'hover:bg-blue-50'}`}>
                        <td className="p-1 border-r text-center font-mono">{item.sort_order}</td>
                        <td className="p-1 border-r font-bold">{item.item}</td>
                        <td className="p-1 border-r text-right font-mono">{item.rate !== null ? `₹${item.rate.toFixed(2)}` : '-'}</td>
                        <td className="p-1 border-r text-center font-mono">{item.qty !== null ? item.qty : '-'}</td>
                        <td className="p-1 border-r text-center font-mono font-bold text-indigo-900">{item.days_or_copies !== null ? item.days_or_copies : '-'}</td>
                        <td className="p-1 text-right font-mono font-bold">
                          {item.amount < 0 ? `-₹${Math.abs(item.amount).toFixed(2)}` : `₹${item.amount.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 text-xs font-bold">
              <span>Total Payable: <strong className="text-blue-900 text-sm font-mono">₹{breakupCustomer.total_payable?.toFixed(2)}</strong></span>
              <button 
                onClick={() => setBreakupCustomer(null)}
                className="px-4 py-1 bg-white border border-[#808080] hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Bill Slip Print Modal (2-Part Invoice: Customer Slip + Office Counterfoil) */}
      {selectedBillForPrint && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 font-mono">
          <div className="w-full max-w-md bg-white border-2 border-black p-4 text-xs shadow-2xl space-y-3">
            
            {/* Part 1: Customer Invoice */}
            <div className="border-b-2 border-dashed border-black pb-3 space-y-1">
              <div className="text-center pb-1 border-b">
                <h2 className="font-black text-sm uppercase">ARYAN NEWS AGENCY</h2>
                <p className="text-[10px]">Beawar, Rajasthan • Newspaper Distributors</p>
                <p className="text-[11px] font-bold text-blue-900 mt-0.5">CUSTOMER BILL - {selectedBillForPrint.month} {selectedBillForPrint.year}</p>
              </div>

              <div className="flex justify-between text-[11px]">
                <span><strong>Bill No:</strong> #{selectedBillForPrint.bill_no}</span>
                <span><strong>Cust ID:</strong> #{selectedBillForPrint.customer_id}</span>
              </div>
              <div className="text-[11px]">
                <strong>Name:</strong> {selectedBillForPrint.name_eng}
                {selectedBillForPrint.customer_hindi && <span className="text-[10px] text-slate-600 block">{selectedBillForPrint.customer_hindi}</span>}
              </div>

              <div className="border-t border-b py-1.5 space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Previous Due (बकाया):</span>
                  <span>₹{selectedBillForPrint.previous_due?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Papers (चालू माह):</span>
                  <span>₹{selectedBillForPrint.paper_amount?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery Charges:</span>
                  <span>₹{selectedBillForPrint.delivery_amount?.toFixed(2)}</span>
                </div>
                {selectedBillForPrint.discount_amount > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>Discount:</span>
                    <span>-₹{selectedBillForPrint.discount_amount?.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm border-t pt-1">
                  <span>Total Payable (कुल देय):</span>
                  <span>₹{selectedBillForPrint.total_payable?.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Part 2: Office Counterfoil */}
            <div className="space-y-1 text-[10px]">
              <div className="text-center font-bold text-[10px] text-slate-600 uppercase">
                --- Office Collection Counterfoil ---
              </div>
              <div className="flex justify-between">
                <span>Bill: #{selectedBillForPrint.bill_no} | Cust: #{selectedBillForPrint.customer_id}</span>
                <span>Due: <strong>₹{selectedBillForPrint.total_payable?.toFixed(2)}</strong></span>
              </div>
              <div>Customer: {selectedBillForPrint.name_eng}</div>
              <div className="flex justify-between pt-1 border-t border-slate-300 text-slate-500">
                <span>Receiver Sig: ____________</span>
                <span>Date: ___/___/2026</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 print:hidden border-t">
              <button 
                onClick={() => window.print()}
                className="px-4 py-1 bg-[#0A246A] text-white font-bold text-xs cursor-pointer"
              >
                Print Slip
              </button>
              <button 
                onClick={() => setSelectedBillForPrint(null)}
                className="px-4 py-1 bg-slate-200 hover:bg-slate-300 text-black font-bold text-xs cursor-pointer"
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
