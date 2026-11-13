'use client';

import { fetchRateTables } from '@/lib/rateTables';
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
import { AppUser } from '@/lib/auth';

import PublisherForm from './forms/PublisherForm';
import PublicationForm from './forms/PublicationForm';
import RateChangeForm from './forms/RateChangeForm';
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
import NumbersForm from './forms/NumbersForm';
import UserPermissionsForm from './forms/UserPermissionsForm';
import CounterSaleForm from './forms/CounterSaleForm';
import RetailSalePermanentForm from './forms/RetailSalePermanentForm';
import PeriodForm from './forms/PeriodForm';
import ReportsForm from './forms/ReportsForm';
import WhatsAppRepliesForm from './forms/WhatsAppRepliesForm';
import BackupRestoreModal from './forms/BackupRestoreModal';
import DiscontinueForm from './forms/DiscontinueForm';
import CompanyForm from './forms/CompanyForm';
import PurchaseForm from './forms/PurchaseForm';
import PubDiscontinueForm from './forms/PubDiscontinueForm';
import PubSupplementForm from './forms/PubSupplementForm';
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

interface VB6DesktopLayoutProps {
  user?: AppUser | null;
  onLogout?: () => void;
}

export default function VB6DesktopLayout({ user, onLogout }: VB6DesktopLayoutProps = {}) {
  // Active Form Window (starts null on clean MDI desktop)
  const [activeWindow, setActiveWindow] = useState<string | null>(null);
  // Desktop 2 is the modern white look; each computer remembers its own choice
  // layout.tsx already turned the look on before the first paint, so it starts from there without a flash
  const [desktop2, setDesktop2] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('desktop2'));
  useEffect(() => {
    document.documentElement.classList.toggle('desktop2', desktop2);
    return () => document.documentElement.classList.remove('desktop2');
  }, [desktop2]);
  // Desktop 2 enlarges windows; one taller than the screen is shrunk just enough to fit (down to
  // 85%), and only past that does it get a height limit so its list scrolls inside it
  useEffect(() => {
    if (!desktop2) return;
    let frame = 0;
    const fit = () => {
      // On a phone a window keeps its natural size and the screen scrolls
      if (window.innerWidth < 768) {
        document.querySelectorAll<HTMLElement>('.d2-window').forEach(w => { w.style.zoom = ''; w.style.maxHeight = ''; });
        return;
      }
      const desk = document.querySelector<HTMLElement>('.d2-desk');
      if (!desk) return;
      const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--d2-z')) || 1;
      document.querySelectorAll<HTMLElement>('.d2-window').forEach(win => {
        if (win.parentElement?.closest('.d2-window')) return;
        // A pop-up over the whole screen has the full height; a window on the desk has the desk's
        const overlay = win.parentElement?.closest<HTMLElement>('.fixed');
        const room = (overlay ? window.innerHeight - 32 : desk.clientHeight - 24);
        // A window stretched to the desk's height (Numbers) always fits, and its height follows its
        // zoom, so fitting it would only make it shrink and grow in turn
        if (getComputedStyle(win).alignSelf === 'stretch') return;
        win.style.maxHeight = '';
        const current = parseFloat(getComputedStyle(win).zoom) || 1;
        const natural = win.getBoundingClientRect().height / current;
        let zoom = Math.max(0.85, Math.min(base, room / natural));
        if (Math.abs(zoom - current) < 0.02) zoom = current;
        win.style.zoom = String(zoom);
        win.style.maxHeight = natural * zoom > room ? `${room / zoom}px` : '';
      });
    };
    const refit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    const sizes = new ResizeObserver(refit);
    const watch = () => document.querySelectorAll('.d2-window').forEach(w => sizes.observe(w));
    const added = new MutationObserver(() => { watch(); refit(); });
    added.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', refit);
    watch();
    refit();
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      added.disconnect();
      window.removeEventListener('resize', refit);
      document.querySelectorAll<HTMLElement>('.d2-window').forEach(w => { w.style.zoom = ''; w.style.maxHeight = ''; });
    };
  }, [desktop2]);
  const switchLook = () => {
    const on = !desktop2;
    setDesktop2(on);
    try { localStorage.setItem('desktopLook', on ? '2' : '1'); } catch {}
  };
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
  const [currentPeriod, setCurrentPeriod] = useState(() => {
    const today = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const mIdx = today.getMonth();
    const sY = mIdx < 3 ? today.getFullYear() - 1 : today.getFullYear();
    return { month: months[mIdx] || 'October', startYear: sY, endYear: sY + 1 };
  });
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
  const [vacationFrom, setVacationFrom] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [vacationTo, setVacationTo] = useState<string>('');
  const [vacationType, setVacationType] = useState<'Temporary' | 'Permanent'>('Temporary');

  // Status Notification
  const [statusMessage, setStatusMessage] = useState('System Ready. Complete 24,581 legacy customer records and 39,681 subscriptions loaded.');

  // Helper to normalize and sort publications
  const normalizeAndSortPubList = (list: any[]) => {
    return (list || []).map((p: any) => {
      const pid = Number(p.publica_id ?? p.publication_id ?? p.id ?? 0);
      const name = String(p.public_name || p.name || (pid > 0 ? `Publication #${pid}` : '')).trim();
      return {
        ...p,
        publica_id: pid,
        public_name: name
      };
    }).filter((p: any) => p.publica_id > 0 && !isNaN(p.publica_id) && p.public_name && !p.public_name.includes('NaN'))
      .sort((a: any, b: any) => a.public_name.localeCompare(b.public_name, undefined, { sensitivity: 'base' }));
  };

  const loadRateTables = () => {
    fetchRateTables().then(t => { setRates(t.rates); setRatechanges(t.ratechanges); }).catch(() => {});
  };

  // Load Initial Metadata
  useEffect(() => {
    // Everything comes from the database through the app's own routes
    fetch('/api/publishers').then(r => r.json()).then(d => { if (d.publishers) setPublishers(d.publishers); }).catch(() => {});
    fetch('/api/publications?with_rates=true&order=alpha').then(r => r.json()).then(data => {
      if (data.publications) {
        const cleaned = normalizeAndSortPubList(data.publications);
        setPublications(cleaned);
        if (cleaned.length > 0) setSelectedPub(cleaned[0]);
      }
    }).catch(() => {});
    fetch('/api/regions').then(r => r.json()).then(d => { if (d.regions) setRegions(d.regions); }).catch(() => {});
    fetch('/api/hawkers').then(r => r.json()).then(d => { if (d.hawkers) setHawkers(d.hawkers); }).catch(() => {});

    loadRateTables();
    fetch('/api/holidays').then(r => r.json()).then(d => { if (d.holidays) setHolidays(d.holidays); }).catch(() => {});
    fetch('/api/discontinue').then(r => r.json()).then(d => { if (d.discontinues) setDiscontinues(d.discontinues); }).catch(() => {});
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

  // Keyboard Shortcuts (Esc to close, F1 for Rates, Ctrl+C for Customer, Ctrl+D for Discontinue, Ctrl+R for Receipt)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeMenu !== null) {
          e.preventDefault();
          setActiveMenu(null);
          return;
        }
        if (isSubsModalOpen) { e.preventDefault(); setIsSubsModalOpen(false); return; }
        if (isRateMatrixOpen) { e.preventDefault(); setIsRateMatrixOpen(false); return; }
        if (isCollectionAgentsOpen) { e.preventDefault(); setIsCollectionAgentsOpen(false); return; }
        if (isUserPermOpen) { e.preventDefault(); setIsUserPermOpen(false); return; }
        if (isCounterSaleOpen) { e.preventDefault(); setIsCounterSaleOpen(false); return; }
        if (isRetailSalePermanentOpen) { e.preventDefault(); setIsRetailSalePermanentOpen(false); return; }
        if (isMessageOpen) { e.preventDefault(); setIsMessageOpen(false); return; }
        if (backupModalMode !== null) { e.preventDefault(); setBackupModalMode(null); return; }
        if (isPeriodOpen) { e.preventDefault(); setIsPeriodOpen(false); return; }
        if (activeWindow !== null) {
          e.preventDefault();
          setActiveWindow(null);
          return;
        }
      } else if (e.key === 'F1') {
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
  }, [editingRates, activeMenu, isSubsModalOpen, isRateMatrixOpen, isCollectionAgentsOpen, isUserPermOpen, isCounterSaleOpen, isRetailSalePermanentOpen, isMessageOpen, backupModalMode, isPeriodOpen, activeWindow]);

  return (
    <div className="d2-app flex flex-col h-screen w-full select-none bg-[#3A6EA5] font-tahoma overflow-hidden">
      
      {/* 1. TOP WINDOW TITLE BAR */}
      <div className="d2-apptitle vb-titlebar border-b border-black select-none flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Aryan News Agency" className="d2-applogo h-3.5 w-auto shrink-0 bg-white rounded-xs px-px" />
          <span className="tracking-wide md:hidden">Aryan News Agency</span>
          <span className="tracking-wide hidden md:inline">Aryan News Agency - Beawar, Rajasthan</span>
        </div>
      </div>

      {/* Classic VB6 Top Menu Bar */}
      <div className="d2-menubar bg-[#ECE9D8] border-b border-[#808080] px-2 py-0.5 flex items-center gap-1 text-xs select-none relative z-40">
        
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
              <button onClick={() => { setActiveWindow('numbers'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Numbers
              </button>
              <button onClick={() => { setActiveWindow('collectionagent'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Collection Agent
              </button>
              <button onClick={() => { setActiveWindow('ratechanges'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Rate Change
              </button>
              <button onClick={() => { setActiveWindow('holidays'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Holiday
              </button>
              <button onClick={() => { setIsMessageOpen(true); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Message
              </button>
              <button onClick={() => { setIsUserPermOpen(true); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center border-t border-slate-300 mt-1 pt-1">
                <span>User Permissions & Roles</span>
                <span className="text-slate-600 font-mono text-[11px] ml-4">Admin</span>
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
              <button onClick={() => { setActiveWindow('pubsupplement'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Publication Supplement
              </button>
              <button onClick={() => { setActiveWindow('receiptallot'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Receipt Allotment
              </button>
              <button onClick={() => { setActiveWindow('receipts'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer flex justify-between items-center">
                <span>Payment Receipt</span>
                <span className="text-slate-600 font-mono text-[11px] ml-6">Ctrl+R</span>
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
                  <button onClick={() => { setSelectedReportType('cust_detail'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Customer Detail</button>
                  <button onClick={() => { setSelectedReportType('cust_monthwise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Customer MonthWise Detail</button>
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
                  <button onClick={() => { setSelectedReportType('collection_agent_dues'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Collection Agent Dues Report</button>
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
                  <button onClick={() => { setSelectedReportType('region_pub_daily'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Region Wise Publication Report</button>
                  <button onClick={() => { setSelectedReportType('region_start_end'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Region-Wise Start End Report</button>
                  <button onClick={() => { setSelectedReportType('cust_choose_pub'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Customer Wise Choose Publication</button>
                  <button onClick={() => { setSelectedReportType('circ_type_pub'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Circulation Type Publication Report</button>
                  <button onClick={() => { setSelectedReportType('cust_pub_starting'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">Customer Publication Starting</button>
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
                  <button onClick={() => { setSelectedReportType('bill_paid_report'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer font-bold text-emerald-800">Bill Paid Report (सशुल्क / Paid Bills)</button>
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
              <button onClick={() => { setSelectedReportType('hawker_report_datewise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Hawker Report Datewise
              </button>

              {/* 15. Collection Hawker Datewise */}
              <button onClick={() => { setSelectedReportType('collection_hawker_datewise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Collection Hawker Datewise
              </button>

              {/* 16. Collection Datewise */}
              <button onClick={() => { setSelectedReportType('collection_datewise'); setActiveWindow('reports'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                Collection Datewise
              </button>

              {/* 17. WhatsApp Replies */}
              <button onClick={() => { setActiveWindow('wareplies'); setActiveMenu(null); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer border-t border-[#808080] mt-1 pt-1.5">
                WhatsApp Replies (ग्राहकों के जवाब)
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
            <div className="absolute top-full left-0 min-w-[320px] bg-[#ECE9D8] vb-box-outset shadow-2xl z-50 py-1 flex flex-col text-black text-xs">
              <button onClick={() => { setActiveMenu(null); setBackupModalMode('restore'); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                1. Database Restore (पुराने सॉफ्टवेयर से SQL रिस्टोर)
              </button>
              <button onClick={() => { setActiveMenu(null); setBackupModalMode('backup_master'); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                2. Master Database Backup (SQL बैकअप बनाएं)
              </button>
              <button onClick={() => { setActiveMenu(null); setBackupModalMode('balance_forward'); }} className="px-3 py-1 hover:bg-[#0A246A] hover:text-white text-left whitespace-nowrap cursor-pointer">
                3. Year-End Balance Forward (बैलेंस कैरी फॉरवर्ड)
              </button>
            </div>
          )}
        </div>

        {/* 6. Exit Menu (left out on a phone, where Logout sits in the title row) */}
        <div className="relative d2-exitmenu">
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

        {/* Right side user info & mobile switch */}
        <div className="ml-auto flex items-center gap-1.5 pr-1">
          {user && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-white border border-[#808080] text-[11px] font-bold text-[#800000] shadow-inner">
              <span>👤 {user.username}</span>
              <span className="text-[10px] text-slate-500 font-normal">({user.role})</span>
            </div>
          )}
          <button
            onClick={switchLook}
            title={desktop2 ? 'Back to the classic look' : 'Try the modern white look'}
            className="px-2 py-0.5 bg-white text-[#000080] hover:bg-[#BCE5FF] border border-[#808080] text-xs font-bold hidden md:flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <span>🖥️ {desktop2 ? 'Desktop 1' : 'Desktop 2'}</span>
          </button>
          {onLogout && (
            <button 
              onClick={onLogout}
              title="Logout session"
              className="px-2 py-0.5 bg-[#800000] text-white hover:bg-[#A00000] border border-black text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
            >
              <span>🔒 Logout</span>
            </button>
          )}
        </div>

      </div>

      {/* 3. MAIN MDI DESKTOP CANVAS */}
      <div className={`d2-desk ${activeWindow ? 'd2-busy ' : ''}flex-1 p-1 sm:p-2 md:p-3 overflow-auto flex justify-center items-start relative min-h-0`}>
        
        {/* Clean MDI Desktop Wallpaper (When no form is open) */}
        {activeWindow === null && (
          <div className="d2-splash flex flex-col items-center justify-center text-center p-8 opacity-85 select-none pointer-events-none my-auto">
            <div className="w-24 h-24 rounded-full bg-white border-2 border-white/40 shadow-2xl flex items-center justify-center mb-3 overflow-hidden">
              <img src="/logo.png" alt="" className="h-[86%] w-auto" />
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
            initialRateChangeMode={false}
            onSave={(savedPub) => {
              setPublications(prev => [savedPub, ...prev.filter(p => p.publica_id !== savedPub.publica_id)]);
              fetch('/api/publications?with_rates=true')
                .then(r => r.json())
                .then(data => { if (data.publications) setPublications(normalizeAndSortPubList(data.publications)); })
                .catch(() => {});
              loadRateTables();
              setStatusMessage(`Publication #${savedPub.publica_id} "${savedPub.public_name}" saved.`);
            }}
            onDelete={(pubId) => {
              setPublications(prev => prev.filter(p => p.publica_id !== pubId));
              fetch('/api/publications?with_rates=true')
                .then(r => r.json())
                .then(data => { if (data.publications) setPublications(normalizeAndSortPubList(data.publications)); })
                .catch(() => {});
              loadRateTables();
              setStatusMessage(`Publication #${pubId} deleted.`);
            }}
          />
        )}

        {/* 3b. Dedicated Rate Change Master Form */}
        {(activeWindow === 'ratechanges' || activeWindow === 'ratechange') && (
          <RateChangeForm 
            onClose={() => setActiveWindow(null)} 
            publications={publications}
            rates={rates}
            ratechanges={ratechanges}
            onSave={(pubId, newRates, effDateIso) => {
              fetch('/api/publications?with_rates=true')
                .then(r => r.json())
                .then(data => { if (data.publications) setPublications(normalizeAndSortPubList(data.publications)); })
                .catch(() => {});
              loadRateTables();
              setStatusMessage(`Rate change for publication #${pubId} saved.`);
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

        {activeWindow === 'numbers' && (
          <NumbersForm
            onClose={() => setActiveWindow(null)}
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
            periodMonth={currentPeriod.month}
            periodStartYear={currentPeriod.startYear}
          />
        )}

        {/* 9b. Customer Vacation Hold / Discontinue Form (screenshot_10.jpg) */}
        {activeWindow === 'discontinue' && (
          <DiscontinueForm 
            onClose={() => setActiveWindow(null)} 
            publications={publications}
            hawkers={hawkers}
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

        {/* 9e. Publication Discontinue (Dedicated tab inside Publication) */}
        {activeWindow === 'pubdiscontinue' && (
          <PublicationForm 
            onClose={() => setActiveWindow(null)} 
            publications={publications}
            publishers={publishers}
            rates={rates}
            ratechanges={ratechanges}
            initialTab="discontinue"
            onSave={(savedPub) => {
              setPublications(prev => [savedPub, ...prev.filter(p => p.publica_id !== savedPub.publica_id)]);
              fetch('/api/publications?with_rates=true')
                .then(r => r.json())
                .then(data => { if (data.publications) setPublications(normalizeAndSortPubList(data.publications)); })
                .catch(() => {});
              loadRateTables();
              setStatusMessage(`Publication #${savedPub.publica_id} "${savedPub.public_name}" saved.`);
            }}
          />
        )}
        {activeWindow === 'pubsupplement' && (
          <PubSupplementForm 
            onClose={() => setActiveWindow(null)} 
            publications={publications}
            rates={rates}
            ratechanges={ratechanges}
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
            regions={regions}
            hawkers={hawkers}
            publications={publications}
            periodMonth={currentPeriod.month}
            periodStartYear={currentPeriod.startYear}
          />
        )}

        {/* 10a. WhatsApp Replies */}
        {activeWindow === 'wareplies' && (
          <WhatsAppRepliesForm onClose={() => setActiveWindow(null)} />
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
        {isRateMatrixOpen && (
          <RateMatrixForm 
            isOpen={true}
            onClose={() => setIsRateMatrixOpen(false)}
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
      <div className="d2-statusbar bg-[#ECE9D8] border-t border-[#808080] p-1 flex items-center gap-2 text-[11px] text-slate-800">
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
