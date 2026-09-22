'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Newspaper, 
  Truck, 
  Building2, 
  MapPin, 
  Calendar, 
  FileText, 
  Receipt, 
  Clock, 
  DollarSign, 
  Printer, 
  Search, 
  Plus, 
  Save, 
  Trash2, 
  RefreshCw, 
  X, 
  Copy,
  CheckCircle2,
  AlertCircle,
  Phone,
  Tag,
  ChevronLeft,
  ChevronRight,
  Calculator,
  Layers,
  Settings
} from 'lucide-react';
import { Customer, Publication, Hawker, Publisher, Region, Rate, RateChange, Holiday, Discontinue, PaymentReceipt, CustomerDetail } from '@/lib/types';
import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { getEffectiveWeekdayRates } from '@/lib/rateEngine';

import PublisherForm from './forms/PublisherForm';
import PublicationForm from './forms/PublicationForm';
import CustomerForm from './forms/CustomerForm';
import SubscriptionsModal from './forms/SubscriptionsModal';
import DailyProcessForm from './forms/DailyProcessForm';
import ReceiptForm from './forms/ReceiptForm';
import BillingForm from './forms/BillingForm';
import HawkerForm from './forms/HawkerForm';
import RegionForm from './forms/RegionForm';
import HolidayForm from './forms/HolidayForm';
import RateMatrixForm from './forms/RateMatrixForm';
import CollectionAgentForm from './forms/CollectionAgentForm';
import UserPermissionsForm from './forms/UserPermissionsForm';
import CounterSaleForm from './forms/CounterSaleForm';
import RetailSalePermanentForm from './forms/RetailSalePermanentForm';
import PeriodForm from './forms/PeriodForm';
import ReportsForm from './forms/ReportsForm';
import BackupRestoreModal from './forms/BackupRestoreModal';
import DiscontinueForm from './forms/DiscontinueForm';
import CompanyForm from './forms/CompanyForm';
import PurchaseForm from './forms/PurchaseForm';
import PubDiscontinueForm from './forms/PubDiscontinueForm';
import ReceiptAllotmentForm from './forms/ReceiptAllotmentForm';
import HawkerPriorityForm from './forms/HawkerPriorityForm';
import ApplyCustomerAgentForm from './forms/ApplyCustomerAgentForm';
import MessageForm from './forms/MessageForm';

// Legacy Day of Week Names (1=Sun .. 7=Sat)
const LEGACY_DAYS = [
  { id: 1, name: 'Sunday', hindi: 'रविवार', short: 'Sun' },
  { id: 2, name: 'Monday', hindi: 'सोमवार', short: 'Mon' },
  { id: 3, name: 'Tuesday', hindi: 'मंगलवार', short: 'Tue' },
  { id: 4, name: 'Wednesday', hindi: 'बुधवार', short: 'Wed' },
  { id: 5, name: 'Thursday', hindi: 'गुरुवार', short: 'Thu' },
  { id: 6, name: 'Friday', hindi: 'शुक्रवार', short: 'Fri' },
  { id: 7, name: 'Saturday', hindi: 'शनिवार', short: 'Sat' },
];

export default function VB6DesktopLayout() {
  // Active Form Window (starts null on clean MDI desktop)
  const [activeWindow, setActiveWindow] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Core Static Lists
  const [publications, setPublications] = useState<Publication[]>([]);
  const [hawkers, setHawkers] = useState<Hawker[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [ratechanges, setRatechanges] = useState<RateChange[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [discontinues, setDiscontinues] = useState<Discontinue[]>([]);

  // Customer Management (24,581 Full Dataset with Server-Side / Indexed Search)
  const [custSearch, setCustSearch] = useState('');
  const [custPage, setCustPage] = useState(1);
  const [custTotal, setCustTotal] = useState(24581);
  const [custTotalPages, setCustTotalPages] = useState(492);
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [selectedCustSubs, setSelectedCustSubs] = useState<CustomerDetail[]>([]);
  const [selectedCustReceipts, setSelectedCustReceipts] = useState<PaymentReceipt[]>([]);
  const [isLoadingCusts, setIsLoadingCusts] = useState(false);
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);
  const [subsTab, setSubsTab] = useState<'active' | 'all'>('active');
  const [isSubsModalOpen, setIsSubsModalOpen] = useState(false);
  const [selectedCustForModal, setSelectedCustForModal] = useState<Customer | null>(null);
  const [isCustFormOpen, setIsCustFormOpen] = useState(false);

  // Publication Rates Form State
  const [selectedPub, setSelectedPub] = useState<Publication | null>(null);
  const [editingRates, setEditingRates] = useState<Record<number, number>>({ 1: 5.0, 2: 5.0, 3: 5.0, 4: 5.0, 5: 5.0, 6: 5.0, 7: 5.0 });

  // New Modal States for Full 2008 Master Set
  const [isPeriodOpen, setIsPeriodOpen] = useState(true);
  const [currentPeriod, setCurrentPeriod] = useState({ month: 'August', startYear: 2026, endYear: 2027 });
  const [isRateMatrixOpen, setIsRateMatrixOpen] = useState(false);
  const [isCollectionAgentsOpen, setIsCollectionAgentsOpen] = useState(false);
  const [isUserPermOpen, setIsUserPermOpen] = useState(false);
  const [isCounterSaleOpen, setIsCounterSaleOpen] = useState(false);
  const [isRetailSalePermanentOpen, setIsRetailSalePermanentOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<string>('hawker_daily_qty');
  const [backupModalMode, setBackupModalMode] = useState<'backup_master' | 'backup_yearly' | 'restore' | 'balance_forward' | null>(null);

  // New Vacation Hold Form State
  const [vacationCustId, setVacationCustId] = useState<string>('1');
  const [vacationFrom, setVacationFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [vacationTo, setVacationTo] = useState<string>('');
  const [vacationType, setVacationType] = useState<'Temporary' | 'Permanent'>('Temporary');

  // Status Notification
  const [statusMessage, setStatusMessage] = useState('System Ready. Complete 24,581 legacy customer records and 39,681 subscriptions loaded.');

  // Load Initial Metadata
  useEffect(() => {
    fetch('/data/publishers.json').then(r => r.json()).then(setPublishers).catch(() => {});
    fetch('/api/publications?with_rates=true').then(r => r.json()).then(data => {
      if (data.publications) {
        setPublications(data.publications);
        if (data.publications.length > 0) setSelectedPub(data.publications[0]);
      }
    }).catch(() => {
      fetch('/data/publications.json').then(r => r.json()).then(data => {
        setPublications(data);
        if (data.length > 0) setSelectedPub(data[0]);
      }).catch(() => {});
    });
    fetch('/data/regions.json').then(r => r.json()).then(setRegions).catch(() => {});
    fetch('/data/hawkers.json').then(r => r.json()).then(setHawkers).catch(() => {});
    fetch('/data/rates.json').then(r => r.json()).then(setRates).catch(() => {});
    fetch('/data/ratechanges.json').then(r => r.json()).then(setRatechanges).catch(() => {});
    fetch('/data/holidays.json').then(r => r.json()).then(setHolidays).catch(() => {});
    fetch('/data/discontinues.json').then(r => r.json()).then(setDiscontinues).catch(() => {});
  }, []);

  // Fetch Customers dynamically based on search & page
  const fetchCustomers = (search: string, page: number) => {
    setIsLoadingCusts(true);
    fetch(`/api/customers?search=${encodeURIComponent(search)}&page=${page}&limit=50`)
      .then(r => r.json())
      .then(data => {
        if (data.customers) {
          setCustomerList(data.customers);
          setCustTotal(data.total);
          setCustTotalPages(data.totalPages);
          if (data.customers.length > 0 && !selectedCust) {
            setSelectedCust(data.customers[0]);
          }
        }
      })
      .catch(err => console.error('Cust fetch error:', err))
      .finally(() => setIsLoadingCusts(false));
  };

  useEffect(() => {
    fetchCustomers(custSearch, custPage);
  }, [custPage]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCustPage(1);
      fetchCustomers(custSearch, 1);
    }, 250);
    return () => clearTimeout(timer);
  }, [custSearch]);

  // Load Subscriptions & Receipts when Selected Customer Changes
  useEffect(() => {
    if (!selectedCust) return;
    setIsLoadingSubs(true);
    
    // Subscriptions
    fetch(`/api/subscriptions?customer_id=${selectedCust.customer_id}`)
      .then(r => r.json())
      .then(data => setSelectedCustSubs(data.subscriptions || []))
      .catch(() => setSelectedCustSubs([]))
      .finally(() => setIsLoadingSubs(false));

    // Receipts
    fetch(`/api/receipts?customer_id=${selectedCust.customer_id}`)
      .then(r => r.json())
      .then(data => setSelectedCustReceipts(data.receipts || []))
      .catch(() => setSelectedCustReceipts([]));
  }, [selectedCust]);

  // Update rates when publication changes
  useEffect(() => {
    if (!selectedPub) return;
    const effective = getEffectiveWeekdayRates(selectedPub.publica_id, new Date().toISOString().split('T')[0], rates, ratechanges);
    setEditingRates(effective);
  }, [selectedPub, rates, ratechanges]);

  // Keyboard Shortcuts (F1 for Rates, Ctrl+C for Customer, Ctrl+D for Discontinue, Ctrl+R for Receipt)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        if (activeWindow !== null) return;
        e.preventDefault();
        const sunRate = editingRates[1] || 5.0;
        const updated: Record<number, number> = {};
        LEGACY_DAYS.forEach(d => { updated[d.id] = sunRate; });
        setEditingRates(updated);
        setStatusMessage(`F1 Triggered: Copied Sunday rate (₹${sunRate}) across all 7 weekdays!`);
      } else if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setActiveWindow('customers');
      } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setActiveWindow('discontinue');
      } else if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        setActiveWindow('receipts');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingRates]);

  return (
    <div className="flex flex-col h-screen w-full select-none bg-[#3A6EA5] font-tahoma overflow-hidden">
      
      {/* 1. TOP WINDOW TITLE BAR */}
      <div className="vb-titlebar border-b border-black select-none">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 bg-yellow-400 border border-black rounded-xs flex items-center justify-center text-[9px] font-black text-black">
            VB
          </div>
          <span className="tracking-wide">Aryan News Agency (2008 Visual Basic Desktop Edition) - [Beawar, Rajasthan]</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-4 h-4 bg-[#ECE9D8] hover:bg-white text-black font-bold text-[10px] flex items-center justify-center border border-black cursor-pointer shadow-xs">_</button>
          <button className="w-4 h-4 bg-[#ECE9D8] hover:bg-white text-black font-bold text-[10px] flex items-center justify-center border border-black cursor-pointer shadow-xs">□</button>
          <button className="w-4 h-4 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] flex items-center justify-center border border-black cursor-pointer shadow-xs">✕</button>
        </div>
      </div>

      {/* Classic VB6 Top Menu Bar */}
      <div className="bg-[#ECE9D8] border-b border-[#808080] px-2 py-0.5 flex items-center gap-1 text-xs select-none relative z-40">
        
        {/* 1. Master Menu */}
        <div className="relative">
          <button 
            onClick={() => setActiveMenu(activeMenu === 'master' ? null : 'master')}
            className={`px-2 py-0.5 hover:bg-[#316AC5] hover:text-white cursor-pointer ${activeMenu === 'master' ? 'bg-[#316AC5] text-white' : 'text-black'}`}
          >
            <u>M</u>aster
          </button>
          {activeMenu === 'master' && (
            <div className="absolute top-full left-0 min-w-[240px] bg-[#ECE9D8] vb-box-outset shadow-2xl z-50 py-1 flex flex-col text-black text-xs">
              <button onClick={() => { setActiveWindow('company'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Company
              </button>
              <button onClick={() => { setActiveWindow('publishers'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Publisher/Dealer/Sub Agent
              </button>
              <button onClick={() => { setActiveWindow('publications'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Publication
              </button>
              <button onClick={() => { setActiveWindow('regions'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Region
              </button>
              <button onClick={() => { setActiveWindow('hawkers'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Hawker
              </button>
              <button onClick={() => { setActiveWindow('customers'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                <span>Customer</span>
                <span className="text-slate-600 font-mono text-[11px] ml-6">Ctrl+C</span>
              </button>
              <button onClick={() => { setActiveWindow('collectionagent'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Collection Agent
              </button>
              <button onClick={() => { setIsRateMatrixOpen(true); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Rate Change
              </button>
              <button onClick={() => { setActiveWindow('holidays'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Holiday
              </button>
              <button onClick={() => { setIsMessageOpen(true); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Message
              </button>
            </div>
          )}
        </div>

        {/* 2. Transaction Menu (media_1789800222706.png) */}
        <div className="relative">
          <button 
            onClick={() => setActiveMenu(activeMenu === 'trans' ? null : 'trans')}
            className={`px-2 py-0.5 hover:bg-[#316AC5] hover:text-white cursor-pointer ${activeMenu === 'trans' ? 'bg-[#316AC5] text-white' : 'text-black'}`}
          >
            <u>T</u>ransaction
          </button>
          {activeMenu === 'trans' && (
            <div className="absolute top-full left-0 min-w-[280px] bg-[#ECE9D8] vb-box-outset shadow-2xl z-50 py-1 flex flex-col text-black text-xs">
              <button onClick={() => { setActiveWindow('purchase'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Purchase
              </button>
              <button onClick={() => { setIsCounterSaleOpen(true); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Counter Sale
              </button>
              <button onClick={() => { setIsRetailSalePermanentOpen(true); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Retail Sale To Permanent Customer
              </button>
              <button onClick={() => { setActiveWindow('discontinue'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                <span>Discontinue</span>
                <span className="text-slate-600 font-mono text-[11px] ml-6">Ctrl+D</span>
              </button>
              <button onClick={() => { setActiveWindow('hawkerpriority'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Hawker&apos;s Customer Priority
              </button>
              <button onClick={() => { setActiveWindow('applyagent'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Apply Customer Agent
              </button>
              <button onClick={() => { setActiveWindow('pubdiscontinue'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Publication Discontinue
              </button>
              <button onClick={() => { setActiveWindow('pubdiscontinue'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Publication Supplement
              </button>
              <button onClick={() => { setActiveWindow('receiptallot'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Receipt Allotment
              </button>
              <button onClick={() => { setActiveWindow('receipts'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                <span>Payment Receipt</span>
                <span className="text-slate-600 font-mono text-[11px] ml-6">Ctrl+R</span>
              </button>
              <button onClick={() => { setActiveWindow('receipts'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                New Payment Receipt
              </button>
            </div>
          )}
        </div>

        {/* 3. Process Menu */}
        <div className="relative">
          <button 
            onClick={() => setActiveMenu(activeMenu === 'process' ? null : 'process')}
            className={`px-2 py-0.5 hover:bg-[#316AC5] hover:text-white cursor-pointer ${activeMenu === 'process' ? 'bg-[#316AC5] text-white' : 'text-black'}`}
          >
            <u>P</u>rocess
          </button>
          {activeMenu === 'process' && (
            <div className="absolute top-full left-0 min-w-[240px] bg-[#ECE9D8] vb-box-outset shadow-2xl z-50 py-1 flex flex-col text-black text-xs">
              <button onClick={() => { setActiveWindow('billing'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Bill Generation
              </button>
              <button onClick={() => { setIsPeriodOpen(true); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Select Period
              </button>
              <button onClick={() => { setActiveMenu(null); setBackupModalMode('balance_forward'); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Balance Forward
              </button>
            </div>
          )}
        </div>

        {/* 4. Reports Menu (media_1789803199219.png - Exact 16 Options) */}
        <div className="relative">
          <button 
            onClick={() => setActiveMenu(activeMenu === 'reports' ? null : 'reports')}
            className={`px-2 py-0.5 hover:bg-[#316AC5] hover:text-white cursor-pointer ${activeMenu === 'reports' ? 'bg-[#316AC5] text-white' : 'text-black'}`}
          >
            <u>R</u>eports
          </button>
          {activeMenu === 'reports' && (
            <div className="absolute top-full left-0 min-w-[280px] bg-[#ECE9D8] vb-box-outset shadow-2xl z-50 py-1 flex flex-col text-black text-xs">
              {/* 1. Customer > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Customer</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[280px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('cust_detail_month'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Customer Detail / Month Register</button>
                  <button onClick={() => { setSelectedReportType('cust_pub_starting'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Customer Publication Starting</button>
                  <button onClick={() => { setSelectedReportType('circ_type_pub'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Circulation Type Publication Report</button>
                  <button onClick={() => { setSelectedReportType('cust_choose_pub'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Customer Wise Choose Publication</button>
                </div>
              </div>

              {/* 2. Discontinue > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Discontinue</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[280px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('discontinue_datewise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Discontinue Date Wise</button>
                  <button onClick={() => { setSelectedReportType('discontinue_hawkerwise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Discontinue Hawker Wise With Address</button>
                </div>
              </div>

              {/* 3. Purchase > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Purchase</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[260px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('purchase_datewise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Purchase Date Wise Report</button>
                  <button onClick={() => { setSelectedReportType('purchase_publisherwise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Purchase Publisher Wise</button>
                </div>
              </div>

              {/* 4. Counter Sale > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Counter Sale</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[260px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('countersale_datewise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Counter Sale Date Wise</button>
                  <button onClick={() => { setSelectedReportType('countersale_pubwise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Counter Sale Publication Wise</button>
                </div>
              </div>

              {/* 5. Retail Customer Sale To Permanent > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Retail Customer Sale To Permanent</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[280px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('retailsale_region_datewise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Retail Sale Region Date Wise Report</button>
                </div>
              </div>

              {/* 6. Reciept > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Reciept</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[260px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('receipt_nowise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Receipt Number Wise Report</button>
                  <button onClick={() => { setSelectedReportType('receipt_realamt'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Actual Amount Receipt Report</button>
                </div>
              </div>

              {/* 7. Hawker Wise Report > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Hawker Wise Report</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[280px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('hawker_daily_qty'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Daily Quantity of Newspaper</button>
                  <button onClick={() => { setSelectedReportType('hawker_magazine_qty'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Quantity of Magazine</button>
                </div>
              </div>

              {/* 8. Outstanding Report > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Outstanding Report</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[280px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('dues_ledger'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Customer Outstanding Dues Ledger</button>
                  <button onClick={() => { setSelectedReportType('previous_dues_wise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Previous Dues Wise Report</button>
                  <button onClick={() => { setSelectedReportType('due_region_summary'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Due Region Wise Summary</button>
                  <button onClick={() => { setSelectedReportType('dues_ledger'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Collection Agent Dues Report</button>
                </div>
              </div>

              {/* 9. Sale > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Sale</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[260px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('consolidated_sale'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Consolidated Sale Report</button>
                  <button onClick={() => { setSelectedReportType('daily_sale'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Daily / Periodic Sale Report</button>
                </div>
              </div>

              {/* 10. Publication Daily Report > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Publication Daily Report</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[280px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('due_region_summary'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Region Wise Publication Report</button>
                  <button onClick={() => { setSelectedReportType('hawker_cust_priority'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Region-Wise Start End Report</button>
                </div>
              </div>

              {/* 11. Bill Printing > */}
              <div className="relative group/sub">
                <button className="w-full px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                  <span>Bill Printing</span>
                  <span className="text-[10px] text-slate-600 group-hover/sub:text-white">›</span>
                </button>
                <div className="hidden group-hover/sub:flex absolute left-full top-0 min-w-[240px] bg-[#ECE9D8] vb-box-outset shadow-2xl py-1 flex-col text-black text-xs z-50">
                  <button onClick={() => { setSelectedReportType('bill_print_region'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Region Wise Bill Printing</button>
                  <button onClick={() => { setSelectedReportType('bill_print_single'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Single Bill Printing</button>
                </div>
              </div>

              {/* 12. Hawker's Customer Priority */}
              <button onClick={() => { setSelectedReportType('hawker_cust_priority'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Hawker&apos;s Customer Priority
              </button>

              {/* 13. Sticker Printing */}
              <button onClick={() => { setSelectedReportType('sticker_printing'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Sticker Printing
              </button>

              {/* 14. Hawker Report Datewise */}
              <button onClick={() => { setSelectedReportType('hawker_daily_qty'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Hawker Report Datewise
              </button>

              {/* 15. Collection Hawker Datewise */}
              <button onClick={() => { setSelectedReportType('receipt_nowise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Collection Hawker Datewise
              </button>

              {/* 16. Collection Datewise */}
              <button onClick={() => { setSelectedReportType('receipt_nowise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Collection Datewise
              </button>
            </div>
          )}
        </div>

        {/* 5. Tools Menu (4 Options) */}
        <div className="relative">
          <button 
            onClick={() => setActiveMenu(activeMenu === 'tools' ? null : 'tools')}
            className={`px-2 py-0.5 hover:bg-[#316AC5] hover:text-white cursor-pointer ${activeMenu === 'tools' ? 'bg-[#316AC5] text-white' : 'text-black'}`}
          >
            <u>T</u>ools
          </button>
          {activeMenu === 'tools' && (
            <div className="absolute top-full left-0 min-w-[260px] bg-[#ECE9D8] vb-box-outset shadow-2xl z-50 py-1 flex flex-col text-black text-xs">
              <button onClick={() => { setActiveMenu(null); setBackupModalMode('balance_forward'); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                1. Year-End Balance Forward
              </button>
              <button onClick={() => { setActiveMenu(null); setBackupModalMode('backup_master'); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                2. Master Database Backup
              </button>
              <button onClick={() => { setActiveMenu(null); setBackupModalMode('backup_yearly'); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                3. Yearly Database Backup
              </button>
              <button onClick={() => { setActiveMenu(null); setBackupModalMode('restore'); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                4. Database Restore
              </button>
            </div>
          )}
        </div>

        {/* 6. Exit Menu */}
        <div className="relative">
          <button 
            onClick={() => {
              if (confirm('Are you sure you want to exit Aryan News Software?')) {
                setIsPeriodOpen(true);
              }
            }}
            className="px-2 py-0.5 hover:bg-[#316AC5] hover:text-white cursor-pointer text-black"
          >
            <u>E</u>xit
          </button>
        </div>

      </div>

      {/* 3. MAIN MDI DESKTOP CANVAS */}
      <div className="flex-1 p-3 overflow-auto flex items-center justify-center relative">
        
        {/* Clean MDI Desktop Wallpaper (When no form is open) */}
        {activeWindow === null && (
          <div className="flex flex-col items-center justify-center text-center p-8 opacity-85 select-none pointer-events-none">
            <div className="w-24 h-24 rounded-full bg-white/20 border-2 border-white/40 shadow-2xl flex items-center justify-center mb-3 backdrop-blur-xs">
              <span className="text-3xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-wider font-serif">ANA</span>
            </div>
            <h1 className="text-2xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] tracking-wide">
              ARYAN NEWS AGENCY
            </h1>
            <p className="text-sm font-bold text-yellow-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] mt-0.5">
              Beawar, Rajasthan • Newspaper Distribution Management System
            </p>
            <span className="text-xs text-white/80 mt-2 font-mono">
              Ready. Select an option from Master, Transactions, or Reports menu to open a form.
            </span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 1. CUSTOMER MASTER (screenshot_05.jpg) - EXACT 2008 REPLICA */}
        {/* ========================================================================= */}
        {activeWindow === 'customers' && (
          <CustomerForm 
            onClose={() => setActiveWindow(null)}
            customer={null}
            publications={publications}
            hawkers={hawkers}
            regions={regions}
            onSelectCustomer={(c) => setSelectedCust(c)}
            onSaveCustomer={(savedCust) => {
              fetchCustomers(custSearch, 1);
              setSelectedCust(savedCust as Customer);
              setStatusMessage(`Customer #${savedCust.customer_id} (${savedCust.name_eng}) saved.`);
            }}
          />
        )}

        {/* 2. Publisher Master Form (screenshot_01.jpg) */}
        {activeWindow === 'publishers' && (
          <PublisherForm 
            onClose={() => setActiveWindow(null)} 
            publishers={publishers} 
          />
        )}

        {/* 3. Publication Master & Weekday Rates (screenshot_02.jpg) */}
        {activeWindow === 'publications' && (
          <PublicationForm 
            onClose={() => setActiveWindow(null)} 
            publications={publications}
            publishers={publishers}
            rates={rates}
            ratechanges={ratechanges}
            onSave={(savedPub) => {
              setPublications(prev => [savedPub, ...prev.filter(p => p.publica_id !== savedPub.publica_id)]);
              fetch('/api/publications?with_rates=true')
                .then(r => r.json())
                .then(data => { if (data.publications) setPublications(data.publications); })
                .catch(() => {});
              setStatusMessage(`Publication #${savedPub.publica_id} "${savedPub.public_name}" saved.`);
            }}
            onDelete={(pubId) => {
              setPublications(prev => prev.filter(p => p.publica_id !== pubId));
              fetch('/api/publications?with_rates=true')
                .then(r => r.json())
                .then(data => { if (data.publications) setPublications(data.publications); })
                .catch(() => {});
              setStatusMessage(`Publication #${pubId} deleted.`);
            }}
          />
        )}

        {/* 4. Region Master Form (screenshot_03.jpg) */}
        {activeWindow === 'regions' && (
          <RegionForm 
            onClose={() => setActiveWindow(null)} 
            regions={regions} 
          />
        )}

        {/* 5. Hawker Master Form (screenshot_04.jpg) */}
        {activeWindow === 'hawkers' && (
          <HawkerForm 
            onClose={() => setActiveWindow(null)} 
            hawkers={hawkers}
            regions={regions}
          />
        )}

        {/* 5b. Collection Agent Form (media_1789799625957.png) */}
        {activeWindow === 'collectionagent' && (
          <CollectionAgentForm 
            onClose={() => setActiveWindow(null)} 
          />
        )}

        {/* 6. Holiday Master Form (screenshot_07.jpg) */}
        {activeWindow === 'holidays' && (
          <HolidayForm 
            onClose={() => setActiveWindow(null)} 
            holidays={holidays}
            publications={publications}
          />
        )}

        {/* 7. Daily Hawker Distribution Process (screenshot_08.jpg) */}
        {activeWindow === 'dailyprocess' && (
          <DailyProcessForm 
            onClose={() => setActiveWindow(null)} 
            hawkers={hawkers}
            publications={publications}
          />
        )}

        {/* 8. Payment Receipt Entry Form (screenshot_13.jpg) */}
        {activeWindow === 'receipts' && (
          <ReceiptForm 
            onClose={() => setActiveWindow(null)} 
          />
        )}

        {/* 9. Monthly Billing Generation Engine (screenshot_13.jpg) */}
        {activeWindow === 'billing' && (
          <BillingForm 
            onClose={() => setActiveWindow(null)} 
            customers={customerList}
            publications={publications}
            rates={rates}
            holidays={holidays}
            discontinues={discontinues}
          />
        )}

        {/* 9b. Customer Vacation Hold / Discontinue Form (screenshot_11.jpg) */}
        {activeWindow === 'discontinue' && (
          <DiscontinueForm 
            onClose={() => setActiveWindow(null)} 
            publications={publications}
          />
        )}

        {/* 9c. Company & Agency Profile Form (Companyback copy.jpg) */}
        {activeWindow === 'company' && (
          <CompanyForm 
            onClose={() => setActiveWindow(null)} 
          />
        )}

        {/* 9d. Publisher Purchase Invoice Entry (Purchase.jpg) */}
        {activeWindow === 'purchase' && (
          <PurchaseForm 
            onClose={() => setActiveWindow(null)} 
            publishers={publishers}
            publications={publications}
          />
        )}

        {/* 9e. Publication Discontinue (screenshot_11.jpg) */}
        {activeWindow === 'pubdiscontinue' && (
          <PubDiscontinueForm 
            onClose={() => setActiveWindow(null)} 
            publications={publications}
          />
        )}

        {/* 9f. Receipt Allotment (screenshot_12.jpg) */}
        {activeWindow === 'receiptallot' && (
          <ReceiptAllotmentForm 
            onClose={() => setActiveWindow(null)} 
          />
        )}

        {/* 9g. Hawker's Customer Priority */}
        {activeWindow === 'hawkerpriority' && (
          <HawkerPriorityForm 
            onClose={() => setActiveWindow(null)} 
          />
        )}

        {/* 9h. Apply Customer Agent */}
        {activeWindow === 'applyagent' && (
          <ApplyCustomerAgentForm 
            onClose={() => setActiveWindow(null)} 
          />
        )}

        {/* 10. Crystal Reports Viewer */}
        {activeWindow === 'reports' && (
          <ReportsForm 
            initialReport={selectedReportType}
            onClose={() => setActiveWindow(null)} 
          />
        )}

        {/* 10b. Bill Message Master Form */}
        {isMessageOpen && (
          <MessageForm 
            onClose={() => setIsMessageOpen(false)} 
          />
        )}

        {/* 11. Modal: Authentic Subscriptions Details (screenshot_06.jpg) */}
        {isSubsModalOpen && selectedCustForModal && (
          <SubscriptionsModal 
            customer={selectedCustForModal}
            onClose={() => setIsSubsModalOpen(false)}
            publications={publications}
            hawkers={hawkers}
          />
        )}

        {/* 12. Modal: 7-Day Rates Matrix & Revisions */}
        {(isRateMatrixOpen || activeWindow === 'ratechanges') && (
          <RateMatrixForm 
            isOpen={true}
            onClose={() => {
              setIsRateMatrixOpen(false);
              if (activeWindow === 'ratechanges') setActiveWindow(null);
            }}
            publications={publications}
            rates={rates}
            ratechanges={ratechanges}
          />
        )}

        {/* 13. Modal: Collection Agents */}
        {isCollectionAgentsOpen && (
          <CollectionAgentForm 
            isOpen={isCollectionAgentsOpen}
            onClose={() => setIsCollectionAgentsOpen(false)}
          />
        )}

        {/* 14. Modal: User Security & Menu Permissions */}
        {isUserPermOpen && (
          <UserPermissionsForm 
            isOpen={isUserPermOpen}
            onClose={() => setIsUserPermOpen(false)}
          />
        )}

        {/* 15a. Modal: Counter & Walk-in Cash Sale Entry */}
        {isCounterSaleOpen && (
          <CounterSaleForm 
            isOpen={isCounterSaleOpen}
            onClose={() => setIsCounterSaleOpen(false)}
            publications={publications}
            rates={rates}
            ratechanges={ratechanges}
          />
        )}

        {/* 15b. Modal: Retail Sale to Permanent Customer */}
        {isRetailSalePermanentOpen && (
          <RetailSalePermanentForm 
            isOpen={isRetailSalePermanentOpen}
            onClose={() => setIsRetailSalePermanentOpen(false)}
            publications={publications}
            rates={rates}
            ratechanges={ratechanges}
            customers={customerList}
          />
        )}

        {/* 16. Modal: Period Detail Entrance & Selection (screenshot_15.jpg) */}
        {isPeriodOpen && (
          <PeriodForm 
            isOpen={isPeriodOpen}
            onLogin={(m, sY, eY) => {
              setCurrentPeriod({ month: m, startYear: sY, endYear: eY });
              setIsPeriodOpen(false);
              setStatusMessage(`Period: ${m} ${sY}-${eY} logged in successfully.`);
            }}
            onExit={() => setIsPeriodOpen(false)}
          />
        )}

        {/* 17. Modal: Backup, Restore & Balance Forward Tools */}
        {backupModalMode && (
          <BackupRestoreModal 
            mode={backupModalMode}
            onClose={() => setBackupModalMode(null)}
          />
        )}

      </div>

      {/* 5. CLASSIC STATUS BAR */}
      <div className="bg-[#ECE9D8] border-t border-[#808080] p-1 flex items-center gap-2 text-[11px] text-slate-800">
        <div className="vb-status-panel flex-1 truncate">
          <strong>Status:</strong> {statusMessage}
        </div>
        <div 
          onClick={() => setIsPeriodOpen(true)} 
          className="vb-status-panel w-44 text-center font-bold text-blue-900 cursor-pointer hover:bg-blue-100"
          title="Click to Change Financial Period"
        >
          📅 Period: {currentPeriod.month} {currentPeriod.startYear}-{currentPeriod.endYear}
        </div>
        <div className="vb-status-panel w-28 text-center font-bold text-blue-900">
          User: ADMIN
        </div>
        <div className="vb-status-panel w-24 text-center text-emerald-800 font-bold">
          ● ONLINE
        </div>
      </div>

    </div>
  );
}
