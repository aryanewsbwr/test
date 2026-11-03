'use client';

import { fetchRateTables } from '@/lib/rateTables';
import { fyLabel } from '@/lib/financialYear';
import React, { useState, useEffect, useRef } from 'react';
import { Publication, Rate, RateChange, Publisher } from '@/lib/types';
import { cleanOrTransliterateHindi, transliterateToHindiAsync } from '@/lib/transliteration';
import { getEffectiveWeekdayRates } from '@/lib/rateEngine';

interface PublicationFormProps {
  onClose: () => void;
  publications: Publication[];
  publishers?: Publisher[];
  rates?: Rate[];
  ratechanges?: RateChange[];
  initialTab?: 'master' | 'discontinue';
  initialRateChangeMode?: boolean;
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

const DAY_NAME_TO_ID: Record<string, number> = {
  'Sunday': 1,
  'Monday': 2,
  'Tuesday': 3,
  'Wednesday': 4,
  'Thursday': 5,
  'Friday': 6,
  'Saturday': 7
};

const ID_TO_DAY_NAME: Record<number, string> = {
  1: 'Sunday',
  2: 'Monday',
  3: 'Tuesday',
  4: 'Wednesday',
  5: 'Thursday',
  6: 'Friday',
  7: 'Saturday'
};

export default function PublicationForm({ 
  onClose, 
  publications = [], 
  publishers = [],
  rates = [],
  ratechanges = [],
  initialTab = 'master',
  initialRateChangeMode = false,
  onSave,
  onDelete
}: PublicationFormProps) {
  const [activeMainTab, setActiveMainTab] = useState<'master' | 'discontinue'>(initialTab || 'master');

  const [selectedPub, setSelectedPub] = useState<Publication>({
    publica_id: 0,
    public_name: '',
    pub_hindi: '',
    abrv: '',
    publish_id: 0,
    type_p: '',
    circulation: '',
    duration: '',
    magzine_day: 0,
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

  // Rate Change Revision Mode State
  const [isRateChangeMode, setIsRateChangeMode] = useState(Boolean(initialRateChangeMode));
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayDateObj = new Date();
  const todayDdmmyyyy = `${pad(todayDateObj.getDate())}/${pad(todayDateObj.getMonth() + 1)}/${todayDateObj.getFullYear()}`;
  const [rateChangeEffDate, setRateChangeEffDate] = useState<string>(todayDdmmyyyy);
  const [newWeekdayRates, setNewWeekdayRates] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0
  });

  // Rate History Modal State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Tab 2: Publication Discontinue State
  const [pubDisMode, setPubDisMode] = useState<'single' | 'holiday'>('single');
  const [pubDisHolidayDesc, setPubDisHolidayDesc] = useState('');
  const [pubDisSelectedId, setPubDisSelectedId] = useState<string>('');
  const [pubDisHoldType, setPubDisHoldType] = useState<'Temporary' | 'Permanent'>('Temporary');
  const [pubDisFromDate, setPubDisFromDate] = useState<string>(todayDdmmyyyy);
  const [pubDisToDate, setPubDisToDate] = useState<string>('');
  const [pubDisRemark, setPubDisRemark] = useState<string>('Discontinued');
  const [pubDisMsg, setPubDisMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isPubDisSaving, setIsPubDisSaving] = useState(false);
  const [pubDisHistoryList, setPubDisHistoryList] = useState<any[]>([]);
  const [isLoadingPubDisHistory, setIsLoadingPubDisHistory] = useState(false);

  const fetchPubDisHistory = async () => {
    setIsLoadingPubDisHistory(true);
    try {
      const res = await fetch('/api/publicationdis', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPubDisHistoryList(data.discontinues || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingPubDisHistory(false);
    }
  };

  useEffect(() => {
    if (activeMainTab === 'discontinue') {
      fetchPubDisHistory();
      if (selectedPub.publica_id > 0 && !pubDisSelectedId) {
        setPubDisSelectedId(String(selectedPub.publica_id));
      }
    }
  }, [activeMainTab, selectedPub.publica_id]);

  const handlePubDisSave = async () => {
    const isHoliday = pubDisMode === 'holiday' || pubDisSelectedId === '0';
    if (!isHoliday && !pubDisSelectedId) {
      setPubDisMsg({ text: 'कृपया पहले पत्रिका/अखबार (Publication) चुनें.', isError: true });
      return;
    }
    if (!pubDisFromDate) {
      setPubDisMsg({ text: 'कृपया फ्रॉम डेट (From Date) दर्ज करें.', isError: true });
      return;
    }
    if (pubDisHoldType === 'Temporary' && !pubDisToDate) {
      setPubDisMsg({ text: 'अस्थाई छुट्टी के लिए समाप्ति दिनांक (To Date) दर्ज करें.', isError: true });
      return;
    }

    setIsPubDisSaving(true);
    setPubDisMsg(null);
    try {
      const fromIso = toIsoDate(pubDisFromDate);
      const toIso = pubDisHoldType === 'Permanent' ? '2099-12-31' : toIsoDate(pubDisToDate);
      const pid = isHoliday ? 0 : parseInt(pubDisSelectedId, 10);
      const descText = isHoliday 
        ? (pubDisHolidayDesc.trim() || pubDisRemark.trim() || 'General Holiday')
        : (pubDisRemark.trim() || 'Discontinued');

      const res = await fetch('/api/publicationdis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publica_id: pid,
          from_date: fromIso,
          to_date: toIso,
          dis_type: pubDisHoldType === 'Permanent' ? 'P' : 'T',
          remark: descText
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save publication discontinue');

      await fetchPubDisHistory();
      const label = isHoliday 
        ? `[Holiday] सभी समाचार पत्र (${descText})` 
        : (pubList.find(p => p.publica_id === pid)?.public_name || `Pub #${pid}`);

      setPubDisMsg({
        text: `✓ ${label} का ${pubDisHoldType === 'Permanent' ? 'स्थाई बंद (Permanent Stop)' : 'अस्थाई रोक / अवकाश (Hold / Holiday)'} सफलतापूर्वक दर्ज हुआ!`,
        isError: false
      });
    } catch (err: any) {
      setPubDisMsg({ text: `त्रुटि: ${err.message}`, isError: true });
    } finally {
      setIsPubDisSaving(false);
    }
  };

  const handlePubDisDelete = async (discId: number) => {
    if (!confirm(`Are you sure you want to delete discontinue record #${discId}?`)) return;
    try {
      const res = await fetch(`/api/publicationdis?id=${discId}`, { method: 'DELETE' });
      if (res.ok) {
        setPubDisHistoryList(prev => prev.filter(d => d.id !== discId));
        setPubDisMsg({ text: `✓ Record #${discId} successfully deleted.`, isError: false });
      } else {
        const d = await res.json();
        setPubDisMsg({ text: `Delete failed: ${d.error || 'Server error'}`, isError: true });
      }
    } catch (err: any) {
      setPubDisMsg({ text: `Error: ${err.message}`, isError: true });
    }
  };

  const [isPubDisFindOpen, setIsPubDisFindOpen] = useState(false);
  const [pubDisFindSearch, setPubDisFindSearch] = useState('');

  const handlePubDisCancel = () => {
    setPubDisMode('single');
    setPubDisHolidayDesc('');
    setPubDisSelectedId(selectedPub.publica_id > 0 ? String(selectedPub.publica_id) : '');
    setPubDisHoldType('Temporary');
    setPubDisFromDate(todayDdmmyyyy);
    setPubDisToDate('');
    setPubDisRemark('Discontinued');
    setPubDisMsg(null);
  };

  const handlePubDisMainDelete = async () => {
    const isHoliday = pubDisMode === 'holiday' || pubDisSelectedId === '0';
    if (!isHoliday && !pubDisSelectedId) {
      setIsPubDisFindOpen(true);
      return;
    }
    const pid = isHoliday ? 0 : parseInt(pubDisSelectedId, 10);
    const pubName = isHoliday ? `[Holiday] All Daily Newspapers` : (pubList.find(p => p.publica_id === pid)?.public_name || `Pub #${pid}`);
    
    try {
      const res = await fetch(`/api/publicationdis?publica_id=${pid}`, { cache: 'no-store' });
      const data = await res.json();
      const existing = data.discontinues || [];
      if (existing.length === 0) {
        alert(`No active discontinue entry found for ${pubName}. Opening Find list.`);
        setIsPubDisFindOpen(true);
        return;
      }

      const latest = existing[0];
      const fDate = (latest.from_date || latest.entry_date || '-').split('T')[0];
      const tDate = (latest.to_date || latest.oc_date || 'Permanent').split('T')[0];
      if (!confirm(`Are you sure you want to delete discontinue record #${latest.id} for ${pubName} (${fDate} to ${tDate})?`)) return;

      await handlePubDisDelete(latest.id);
      setPubDisMsg({ text: `✓ Discontinue entry #${latest.id} for ${pubName} has been deleted.`, isError: false });
      handlePubDisCancel();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const formatDateDisplay = (val: string): string => {
    const s = val.trim().replace(/\D/g, '');
    if (s.length === 8) {
      return `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4, 8)}`;
    }
    return val;
  };

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
    setIsRateChangeMode(false);
    setRateChangeEffDate(todayDdmmyyyy);
    setNewWeekdayRates({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
    setSelectedPub({
      publica_id: 0,
      public_name: '',
      pub_hindi: '',
      abrv: '',
      publish_id: 0,
      type_p: '',
      circulation: '',
      duration: '',
      magzine_day: 0,
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

  const [localRates, setLocalRates] = useState<Rate[]>(rates);
  const [localRatechanges, setLocalRatechanges] = useState<RateChange[]>(ratechanges);

  useEffect(() => {
    if (rates && rates.length > 0) setLocalRates(rates);
    else fetchRateTables().then(t => setLocalRates(t.rates)).catch(() => {});
  }, [rates]);

  useEffect(() => {
    if (ratechanges && ratechanges.length > 0) setLocalRatechanges(ratechanges);
    else fetchRateTables().then(t => setLocalRatechanges(t.ratechanges)).catch(() => {});
  }, [ratechanges]);

  const handleOpenHistory = async () => {
    if (!selectedPub.publica_id) {
      setMsg('Please select an existing publication first to view rate change history.');
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    setIsHistoryOpen(true);
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/rates?history=true&publica_id=${selectedPub.publica_id}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data.history || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Load a historical revision into the Rate Change editor for fixing/editing
  const handleSelectHistoryRevision = (effDate: string) => {
    if (!effDate) return;
    const cleanDate = effDate.split('T')[0];
    const parts = cleanDate.split('-'); // YYYY-MM-DD
    const ddmmyyyy = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : cleanDate;

    // Filter all changes for this publication on this date
    const dateChanges = historyList.filter(h => {
      const hDate = (h.dated || h.Dated || h.effective_date || '').split('T')[0];
      return hDate === cleanDate;
    });

    const loadedNewRates: Record<number, number> = { ...weekdayRates };
    const loadedOldRates: Record<number, number> = { ...weekdayRates };

    dateChanges.forEach(dc => {
      const dow = Number(dc.dayofweek !== undefined ? dc.dayofweek : dc.Dayofweek);
      const newVal = Number(dc.new_rate ?? dc.NewRate ?? dc.newrate ?? 0);
      const oldVal = Number(dc.oldrate ?? dc.OldRate ?? 0);

      if (dow === 0) {
        WEEKDAYS.forEach(w => {
          loadedNewRates[w.id] = newVal;
          if (oldVal > 0) loadedOldRates[w.id] = oldVal;
        });
      } else if (dow >= 1 && dow <= 7) {
        loadedNewRates[dow] = newVal;
        if (oldVal > 0) loadedOldRates[dow] = oldVal;
      }
    });

    setRateChangeEffDate(ddmmyyyy);
    setNewWeekdayRates(loadedNewRates);
    setWeekdayRates(loadedOldRates);
    setIsRateChangeMode(true);
    setIsHistoryOpen(false);
    setMsg(`Loaded Rate Change Revision from ${ddmmyyyy}. You can now edit rates or date, and click Save to update!`);
    setTimeout(() => setMsg(''), 5000);
  };

  // Delete an accidental rate change revision
  const handleDeleteHistoryRevision = async (effDate: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!effDate || !selectedPub.publica_id) return;
    const cleanDate = effDate.split('T')[0];
    const confirmDelete = window.confirm(`Are you sure you want to delete rate change revision for date ${cleanDate}?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/rates?publica_id=${selectedPub.publica_id}&effective_date=${cleanDate}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setHistoryList(prev => prev.filter(h => {
          const hDate = (h.dated || h.Dated || h.effective_date || '').split('T')[0];
          return hDate !== cleanDate;
        }));
        setMsg(`Rate change revision for ${cleanDate} deleted.`);
        setTimeout(() => setMsg(''), 3000);
      }
    } catch (err) {
      console.error('Error deleting rate change:', err);
    }
  };

  const loadPublication = (p: Publication) => {
    setIsNewMode(false);
    setIsRateChangeMode(false);
    setRateChangeEffDate(todayDdmmyyyy);
    const hindiName = cleanOrTransliterateHindi(p.pub_hindi, p.public_name);
    const isPerm = Boolean(p.is_permanent || p.closed_to === '2099-12-31' || (p.closed_to && p.closed_to >= '2090-01-01'));
    const isClsd = Boolean(p.is_closed || isPerm);

    const magDay = p.magzine_day !== undefined && p.magzine_day !== null 
      ? Number(p.magzine_day) 
      : (p.publica_id === 513 || p.publica_id === 512 || p.publica_id === 9 ? 2 : (p.publica_id === 6 ? 1 : (p.publica_id === 7 || p.publica_id === 8 ? 7 : 0)));
    const dayName = ID_TO_DAY_NAME[magDay] || '';
    setPublishingDay(dayName);

    const isMag = (p.type_p || '').toLowerCase().includes('mag') || (p.type_p || '').toLowerCase().includes('periodical');

    // Deduce duration if missing
    let deducedDuration = p.duration || '';
    if (!deducedDuration && isMag) {
      const activeRates = (rates && rates.length > 0) ? rates : localRates;
      const activeRateChanges = (ratechanges && ratechanges.length > 0) ? ratechanges : localRatechanges;
      const pRates = activeRates.filter(r => (r.publica_id || (r as any).Publica_id) === p.publica_id);
      const pRcs = activeRateChanges.filter(r => (r.publica_id || (r as any).Publica_id) === p.publica_id);
      const dow = pRates[0]?.dayofweek || (pRates[0] as any)?.Dayofweek || pRcs[pRcs.length - 1]?.dayofweek;
      if (dow === 1) deducedDuration = 'Weekly';
      else if (dow === 2) deducedDuration = 'Fortnightly';
      else if (dow === 3) deducedDuration = 'Monthly';
      else if (dow === 4) deducedDuration = 'Quarterly';
      else if (dow === 6) deducedDuration = 'Special';
      else deducedDuration = 'Fortnightly';
    }

    setSelectedPub({
      ...p,
      pub_hindi: hindiName,
      type_p: p.type_p || '',
      circulation: p.circulation || '',
      duration: deducedDuration,
      publish_id: p.publish_id || 0,
      magzine_day: magDay,
      is_closed: isClsd,
      is_permanent: isPerm
    });
    setDelChargesChecked(!!p.chr_del);
    setIsClosed(isClsd);
    setIsPermanent(isPerm);
    setClosedFrom(p.closed_from || '');
    setClosedTo(p.closed_to || '');

    // Load effective rates
    const activeRates = (rates && rates.length > 0) ? rates : localRates;
    const activeRateChanges = (ratechanges && ratechanges.length > 0) ? ratechanges : localRatechanges;
    const effectiveRates = (p.current_rates && Object.values(p.current_rates).some(v => v > 0))
      ? { ...p.current_rates }
      : getEffectiveWeekdayRates(p.publica_id, '2099-12-31', activeRates, activeRateChanges, magDay);

    // If Magazine and Fortnightly, scan ratechanges for Issue 1 (1-15) vs Issue 2 (16-31) rates
    if (isMag && (deducedDuration === 'Fortnightly' || deducedDuration === ' पाक्षिक')) {
      const pRcs = activeRateChanges
        .filter(r => (r.publica_id || (r as any).Publica_id) === p.publica_id)
        .sort((a: any, b: any) => ((a.effective_date || a.dated || '')).localeCompare(b.effective_date || b.dated || ''));
      
      let r1 = 0;
      let r2 = 0;
      for (let i = pRcs.length - 1; i >= 0; i--) {
        const rc: any = pRcs[i];
        const dStr = (rc.effective_date || rc.dated || '').split('T')[0];
        const day = parseInt(dStr.split('-')[2], 10);
        const val = Number(rc.new_rate ?? rc.NewRate ?? 0);
        if (day <= 15 && !r1) r1 = val;
        if (day > 15 && !r2) r2 = val;
        if (r1 && r2) break;
      }
      const base = activeRates.find(r => (r.publica_id || (r as any).Publica_id) === p.publica_id)?.rate || 0;
      effectiveRates[1] = r1 || r2 || base || 0;
      effectiveRates[2] = r2 || r1 || base || 0;
    }

    setWeekdayRates(effectiveRates);
    setNewWeekdayRates({ ...effectiveRates });
    if (magDay >= 1 && magDay <= 7) {
      setSelectedDayRow(magDay);
    } else {
      setSelectedDayRow(1);
    }
  };

  const handleNew = () => {
    setIsNewMode(true);
    setIsRateChangeMode(false);
    setRateChangeEffDate(todayDdmmyyyy);
    setNewWeekdayRates({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
    setSelectedPub({
      publica_id: 0,
      public_name: '',
      pub_hindi: '',
      abrv: '',
      publish_id: 0,
      type_p: '',
      circulation: '',
      duration: '',
      magzine_day: 0,
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

  const pubNameDebounce = useRef<NodeJS.Timeout | null>(null);

  // Auto-transliterate Hindi when English name is typed (debounced for accuracy)
  const handleNameChange = (newName: string) => {
    setSelectedPub(prev => ({
      ...prev,
      public_name: newName
    }));

    if (pubNameDebounce.current) clearTimeout(pubNameDebounce.current);
    pubNameDebounce.current = setTimeout(async () => {
      if (!newName.trim()) return;
      const autoHindi = await transliterateToHindiAsync(newName);
      setSelectedPub(prev => ({
        ...prev,
        pub_hindi: autoHindi || prev.pub_hindi
      }));
    }, 300);
  };

  useEffect(() => {
    if (initialRateChangeMode && pubList.length > 0 && selectedPub.publica_id === 0) {
      loadPublication(pubList[0]);
      setIsRateChangeMode(true);
    }
  }, [initialRateChangeMode, pubList]);

  // Keyboard shortcut listener (F1 to copy Sunday rate, F10 to select Del Charges, F12 to unselect, Esc to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFindOpen) setIsFindOpen(false);
        else if (isHistoryOpen) setIsHistoryOpen(false);
        else if (isPubDisFindOpen) setIsPubDisFindOpen(false);
        else onClose();
        return;
      } else if (e.key === 'F1') {
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
      } else if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [weekdayRates, selectedPub, isNewMode, isClosed, isPermanent, closedFrom, closedTo, isFindOpen, isHistoryOpen, isPubDisFindOpen]);

  const copySundayRate = () => {
    if (isRateChangeMode) {
      const sun = newWeekdayRates[1] || 0;
      const updated: Record<number, number> = {};
      WEEKDAYS.forEach(d => { updated[d.id] = sun; });
      setNewWeekdayRates(updated);
      setMsg(`F1 Triggered: Copied Sunday New Rate (₹${sun}) across all 7 weekdays!`);
    } else {
      const sun = weekdayRates[1] || 0;
      const updated: Record<number, number> = {};
      WEEKDAYS.forEach(d => { updated[d.id] = sun; });
      setWeekdayRates(updated);
      setMsg(`F1 Triggered: Copied Sunday rate (₹${sun}) across all 7 weekdays!`);
    }
    setTimeout(() => setMsg(''), 3000);
  };

  const handlePublishingDayChange = (dayName: string) => {
    setPublishingDay(dayName);
    const dayId = DAY_NAME_TO_ID[dayName] || 0;
    setSelectedPub(prev => ({
      ...prev,
      magzine_day: dayId || null
    }));

    if (dayId >= 1 && dayId <= 7) {
      setSelectedDayRow(dayId);
      setWeekdayRates(prev => {
        // If the selected day already has a rate > 0, keep it
        if (prev[dayId] && prev[dayId] > 0) return prev;
        // Otherwise grab existing rate from previous day / day 1
        const existingRate = prev[1] || Object.values(prev).find(v => v > 0) || 0;
        if (existingRate > 0) {
          const updated: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
          updated[dayId] = existingRate;
          return updated;
        }
        return prev;
      });
      setNewWeekdayRates(prev => {
        if (prev[dayId] && prev[dayId] > 0) return prev;
        const existingRate = prev[1] || Object.values(prev).find(v => v > 0) || 0;
        if (existingRate > 0) {
          const updated: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
          updated[dayId] = existingRate;
          return updated;
        }
        return prev;
      });
    }
  };

  const handleSave = async () => {
    if (!selectedPub.public_name.trim()) {
      setMsg('Error: Publication Name cannot be empty');
      setTimeout(() => setMsg(''), 3000);
      return;
    }

    // Billing goes by Duration, so a magazine without one would be charged the wrong issues
    if (/mag|periodical/i.test(selectedPub.type_p || '') && !selectedPub.duration) {
      setMsg('Error: Please select Duration for this magazine (Weekly, Fortnightly, Monthly or Quarterly)');
      setTimeout(() => setMsg(''), 4000);
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const pubMagDay = publishingDay ? (DAY_NAME_TO_ID[publishingDay] || null) : (selectedPub.magzine_day || null);

    // If Rate Change Revision Mode:
    if (isRateChangeMode && selectedPub.publica_id > 0) {
      const effIso = toIsoDate(rateChangeEffDate) || todayStr;
      try {
        const res = await fetch('/api/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publica_id: selectedPub.publica_id,
            is_rate_change: true,
            effective_date: effIso,
            new_rates: newWeekdayRates,
            old_rates: weekdayRates
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (effIso <= todayStr) {
          setWeekdayRates({ ...newWeekdayRates });
        }
        setIsRateChangeMode(false);

        // Fetch refreshed rates & ratechanges
        fetchRateTables().then(t => { setLocalRates(t.rates); setLocalRatechanges(t.ratechanges); }).catch(() => {});

        const updatedPub: Publication = {
          ...selectedPub,
          current_rates: effIso <= todayStr ? { ...newWeekdayRates } : selectedPub.current_rates
        };
        if (onSave) {
          onSave(updatedPub);
        }
        setMsg(`✓ Rate Change for Publication #${selectedPub.publica_id} "${selectedPub.public_name}" effective ${effIso} saved successfully!`);
      } catch (err: any) {
        setMsg(`Error saving rate change: ${err.message}`);
      }
      setTimeout(() => setMsg(''), 4000);
      return;
    }

    // Standard Publication Save
    const pubToSave = {
      ...selectedPub,
      magzine_day: pubMagDay,
      is_new: isNewMode || selectedPub.publica_id === 0,
      chr_del: delChargesChecked ? 1 : 0,
      rates: weekdayRates,
      is_closed: isClosed || isPermanent,
      is_permanent: isPermanent,
      closed_from: (isClosed || isPermanent) ? (closedFrom || todayStr) : null,
      closed_to: isPermanent ? '2099-12-31' : (isClosed ? (closedTo || '2050-03-31') : null),
      reopen: Boolean(selectedPub.is_closed) && !isClosed && !isPermanent
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
      loadPublication(saved);

      setPubList(prev => [saved, ...prev.filter(p => p.publica_id !== saved.publica_id)]);

      if (onSave) {
        onSave(saved);
      }
      setMsg(`Publication #${saved.publica_id} "${saved.public_name}" saved successfully with effective rates!`);
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
    <div className="d2-window relative w-full max-w-[780px] d2:max-w-[1360px] max-h-[calc(100vh-60px)] sm:max-h-[calc(100vh-70px)] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden my-auto shrink-0">
      {/* Title Bar */}
      <div className="d2-title bg-gradient-to-r from-[#0A246A] via-[#3A6EA5] to-[#A6CAF0] text-white px-2 py-1 flex items-center justify-between font-bold text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📰</span>
          <span className="tracking-wide">
            {activeMainTab === 'discontinue' ? 'Publication Discontinue' : `Publication Info - ${isNewMode ? '[NEW ENTRY]' : `[ID: #${selectedPub.publica_id}]`}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* VB6 Two Tabs: 1. Publication Master & Rates, 2. Publication Discontinue */}
      <div className="flex items-end px-2 sm:px-3 pt-2 bg-[#D4D0C8] border-b border-[#808080] gap-1 overflow-x-auto flex-nowrap shrink-0 scrollbar-thin">
        <button
          type="button"
          onClick={() => setActiveMainTab('master')}
          className={`px-3 sm:px-4 py-1 font-bold text-xs border-t-2 border-l-2 border-r-2 rounded-t-sm cursor-pointer whitespace-nowrap transition-colors ${
            activeMainTab === 'master'
              ? 'bg-[#ECE9D8] text-[#800000] border-t-white border-l-white border-r-[#404040] -mb-[1px] pb-1.5 shadow-sm'
              : 'bg-[#C0BCB0] text-slate-700 border-t-[#D4D0C8] border-l-[#D4D0C8] border-r-[#808080] hover:bg-[#D4D0C8]'
          }`}
        >
          📰 1. Publication Master & Rates (प्रकाशन विवरण व दर)
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveMainTab('discontinue');
            if (selectedPub.publica_id > 0) {
              setPubDisSelectedId(String(selectedPub.publica_id));
            }
          }}
          className={`px-3 sm:px-4 py-1 font-bold text-xs border-t-2 border-l-2 border-r-2 rounded-t-sm cursor-pointer whitespace-nowrap transition-colors ${
            activeMainTab === 'discontinue'
              ? 'bg-[#ECE9D8] text-[#000080] border-t-white border-l-white border-r-[#404040] -mb-[1px] pb-1.5 shadow-sm'
              : 'bg-[#C0BCB0] text-slate-700 border-t-[#D4D0C8] border-l-[#D4D0C8] border-r-[#808080] hover:bg-[#D4D0C8]'
          }`}
        >
          🛑 2. Publication Discontinue (प्रकाशन बंद / अवकाश)
        </button>
      </div>

      {/* Tab 1: Publication Master & Rates */}
      {activeMainTab === 'master' && (
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 flex flex-col justify-between space-y-3 bg-[#ECE9D8] min-h-0">
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

        {/* Desktop 2 puts the fields and the rates side by side, so the window fits without scrolling */}
        <div className="d2:flex d2:items-start d2:gap-6 space-y-3 d2:space-y-0">
        {/* Form Inputs Grid */}
        <div className="grid grid-cols-12 gap-y-1.5 gap-x-2 text-xs font-bold text-black items-center max-w-[670px] mx-auto w-full pt-1 d2:flex-1">
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
          <div className="col-span-8 flex items-center gap-1">
            <input 
              type="text" 
              value={selectedPub.pub_hindi || ''} 
              onChange={(e) => setSelectedPub({ ...selectedPub, pub_hindi: e.target.value })}
              className="flex-1 px-2 py-0.5 border border-[#7F9DB9] bg-white font-bold text-blue-900 text-xs shadow-inner outline-none focus:border-[#0A246A]"
              placeholder="हिंदी नाम"
            />
            <button
              type="button"
              onClick={async () => {
                if (selectedPub.public_name) {
                  const autoHindi = await transliterateToHindiAsync(selectedPub.public_name);
                  setSelectedPub(prev => ({ ...prev, pub_hindi: autoHindi }));
                }
              }}
              className="px-2 py-0.5 bg-[#D4F0FF] hover:bg-[#BCE5FF] border border-[#006699] text-[10px] font-bold text-blue-900 cursor-pointer"
              title="Translate to Hindi"
            >
              अ/A
            </button>
          </div>

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
            {(() => {
              const isMag = (selectedPub.type_p || '').toLowerCase().includes('mag') || 
                            (selectedPub.type_p || '').toLowerCase().includes('periodical') ||
                            selectedPub.duration === 'Fortnightly' ||
                            selectedPub.duration === 'Monthly' ||
                            selectedPub.duration === 'Weekly' ||
                            selectedPub.duration === 'Quarterly';

              const activeRateDay = isMag 
                ? (selectedDayRow || 1)
                : ((publishingDay && DAY_NAME_TO_ID[publishingDay]) || selectedDayRow || 1);

              const curRateVal = weekdayRates[activeRateDay] ?? (Object.values(weekdayRates).find(v => v > 0) ?? 0);
              return (
                <input 
                  type="number"
                  step="0.05"
                  value={curRateVal ? curRateVal : (curRateVal === 0 ? '0' : '')} 
                  placeholder="0.00"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setWeekdayRates(prev => ({
                      ...prev,
                      [activeRateDay]: val
                    }));
                  }}
                  className="w-28 px-2 py-0.5 border border-[#7F9DB9] bg-white text-center font-bold text-black text-xs shadow-inner outline-none"
                />
              );
            })()}
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
              <option value="Quarterly">Quarterly</option>
            </select>
          </div>

          {/* Publishing Day */}
          <label className="col-span-4 text-right pr-2 text-[#800000]">Publishing Day</label>
          <select 
            value={publishingDay || ''}
            onChange={(e) => handlePublishingDayChange(e.target.value)}
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

        {/* Weekdays Rate Section with Rate Change Revision Mode */}
        <div className="flex flex-col items-center gap-1.5 pt-1 pb-1 d2:w-[600px] d2:shrink-0">
          {/* Mode Selector & Rate History Button */}
          <div className="flex items-center justify-center gap-5 py-1 px-3 bg-[#E3DFCA] border border-[#BFBAA0] rounded-xs shadow-xs text-xs font-bold">
            <label className="flex items-center gap-1.5 cursor-pointer text-[#800000]">
              <input 
                type="radio" 
                name="rateMode" 
                checked={!isRateChangeMode} 
                onChange={() => setIsRateChangeMode(false)} 
                className="cursor-pointer"
              />
              <span>Standard Rate (वर्तमान दर)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-[#006600] bg-white px-2 py-0.5 border border-green-600/40 rounded-xs shadow-xs">
              <input 
                type="radio" 
                name="rateMode" 
                checked={isRateChangeMode} 
                onChange={() => {
                  setIsRateChangeMode(true);
                  setNewWeekdayRates({ ...weekdayRates });
                }} 
                className="cursor-pointer"
              />
              <span>📈 Rate Change (दर परिवर्तन)</span>
            </label>

            <button
              type="button"
              onClick={handleOpenHistory}
              className="px-2.5 py-0.5 bg-[#E6F4FE] hover:bg-[#C8E8FA] active:bg-[#BCE4FA] border border-[#006699] text-blue-900 rounded-xs text-[11px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
            >
              <span>📜</span>
              <span>Rate History (दर इतिहास)</span>
            </button>
          </div>

          {/* Effective Date Row (Shown only when in Rate Change Mode) */}
          {isRateChangeMode && (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-300 rounded-xs text-xs font-bold text-amber-950 shadow-xs">
              <span className="text-amber-900">📅 Effective Date (लागू दिनांक):</span>
              <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1.5 py-0.5 shadow-inner">
                <input 
                  type="text" 
                  value={rateChangeEffDate} 
                  onChange={(e) => setRateChangeEffDate(e.target.value)}
                  onBlur={() => setRateChangeEffDate(formatDateDisplay(rateChangeEffDate))}
                  placeholder="DD/MM/YYYY"
                  className="w-24 text-center font-mono font-bold text-blue-900 outline-none bg-transparent"
                />
              </div>
              <span className="text-[10px] text-amber-800 font-normal">(इस दिनांक से नया रेट लागू होगा)</span>
            </div>
          )}

          {/* Weekdays or Magazine Issue Rate Grid and Shortcuts */}
          <div className="flex items-center justify-center gap-6 pt-1 pb-1 w-full max-w-[620px]">
            {/* Grid Container */}
            <div className={`${isRateChangeMode ? 'w-[370px]' : 'w-[300px]'} bg-white border border-[#808080] shadow-sm transition-all`}>
              {(() => {
                const isMagazineType = (selectedPub.type_p || '').toLowerCase().includes('mag') || 
                                       (selectedPub.type_p || '').toLowerCase().includes('periodical') ||
                                       selectedPub.duration === 'Fortnightly' ||
                                       selectedPub.duration === 'Monthly' ||
                                       selectedPub.duration === 'Weekly' ||
                                       selectedPub.duration === 'Quarterly';

                if (isMagazineType) {
                  // Determine magazine periodicity rows
                  const dur = selectedPub.duration || 'Fortnightly';
                  const magRows: { id: number; label: string; sub: string }[] = [];

                  if (dur === 'Fortnightly' || dur === ' पाक्षिक') {
                    magRows.push({ id: 1, label: 'Issue 1 (प्रथम अंक)', sub: '1st - 15th' });
                    magRows.push({ id: 2, label: 'Issue 2 (द्वितीय अंक)', sub: '16th - End' });
                  } else if (dur === 'Monthly' || dur === 'मासिक') {
                    magRows.push({ id: 1, label: 'Monthly Issue (मासिक अंक)', sub: 'Full Month' });
                  } else if (dur === 'Quarterly' || dur === 'त्रैमासिक') {
                    magRows.push({ id: 1, label: 'Quarterly Issue (त्रैमासिक अंक)', sub: '3 Months' });
                  } else {
                    magRows.push({ id: 1, label: 'Regular Issue (अंक दर)', sub: dur });
                  }

                  return (
                    <div>
                      <div className="bg-[#ECE9D8] text-center font-bold text-xs py-1 border-b border-[#808080] text-[#800000] flex items-center justify-between px-2">
                        <span>Magazine Issue Rate ({dur})</span>
                        <span className="text-[10px] text-slate-600">
                          {isRateChangeMode ? 'Enter New Rates' : 'Effective Rates'}
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#ECE9D8] border-b border-[#808080]">
                            <th className="p-1 border-r text-left">Period / Issue</th>
                            {isRateChangeMode ? (
                              <>
                                <th className="p-1 border-r text-center w-20 text-slate-600">Current (₹)</th>
                                <th className="p-1 text-center w-24 text-emerald-800 bg-emerald-50">New Rate (₹)</th>
                              </>
                            ) : (
                              <th className="p-1 text-center w-24">Rate (₹)</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {magRows.map((r) => (
                            <tr 
                              key={r.id}
                              onClick={() => setSelectedDayRow(r.id)}
                              className={`cursor-pointer border-b border-slate-200 ${selectedDayRow === r.id ? 'bg-amber-50 font-bold' : 'hover:bg-amber-50 text-black'}`}
                            >
                              <td className="p-1 border-r">
                                <div className="font-bold text-blue-900">{r.label}</div>
                                <div className="text-[10px] text-slate-500">{r.sub}</div>
                              </td>
                              {isRateChangeMode ? (
                                <>
                                  <td className="p-1 border-r text-center font-bold text-slate-600 bg-slate-50">
                                    {weekdayRates[r.id] ?? 0}
                                  </td>
                                  <td className="p-0.5 text-center bg-emerald-50/40">
                                    <input 
                                      type="number"
                                      step="0.25"
                                      value={newWeekdayRates[r.id] ? newWeekdayRates[r.id] : (newWeekdayRates[r.id] === 0 ? '0' : '')}
                                      placeholder="0.00"
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setNewWeekdayRates(prev => ({ ...prev, [r.id]: val }));
                                      }}
                                      className="w-full text-center text-xs font-bold outline-none bg-white border border-emerald-500 text-emerald-900 shadow-inner focus:bg-yellow-50"
                                    />
                                  </td>
                                </>
                              ) : (
                                <td className="p-0.5 text-center">
                                  <input 
                                    type="number"
                                    step="0.25"
                                    value={weekdayRates[r.id] ? weekdayRates[r.id] : (weekdayRates[r.id] === 0 ? '0' : '')}
                                    placeholder="0.00"
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setWeekdayRates(prev => ({ ...prev, [r.id]: val }));
                                    }}
                                    className="w-full text-center text-xs font-bold outline-none bg-transparent text-black"
                                  />
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }

                // Standard Newspaper 7-day Weekdays table
                return (
                  <div>
                    <div className="bg-[#ECE9D8] text-center font-bold text-xs py-1 border-b border-[#808080] text-[#000080] flex items-center justify-between px-2">
                      <span>Weekdays Rate (दर विवरण)</span>
                      <span className="text-[10px] text-slate-600">
                        {isRateChangeMode ? 'Enter New Rates' : 'Effective Rates'}
                      </span>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#ECE9D8] border-b border-[#808080]">
                          <th className="p-1 border-r text-left">Weekdays</th>
                          {isRateChangeMode ? (
                            <>
                              <th className="p-1 border-r text-center w-20 text-slate-600">Current (₹)</th>
                              <th className="p-1 text-center w-24 text-emerald-800 bg-emerald-50">New Rate (₹)</th>
                            </>
                          ) : (
                            <th className="p-1 text-center w-24">Rate (₹)</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {WEEKDAYS.map((d) => (
                          <tr 
                            key={d.id}
                            onClick={() => setSelectedDayRow(d.id)}
                            className={`cursor-pointer border-b border-slate-200 ${selectedDayRow === d.id ? 'bg-blue-50 font-bold' : 'hover:bg-blue-50 text-black'}`}
                          >
                            <td className="p-1 border-r">{d.name} ({d.hindi})</td>
                            {isRateChangeMode ? (
                              <>
                                <td className="p-1 border-r text-center font-bold text-slate-600 bg-slate-50">
                                  {weekdayRates[d.id] ?? 0}
                                </td>
                                <td className="p-0.5 text-center bg-emerald-50/40">
                                  <input 
                                    type="number"
                                    step="0.25"
                                    value={newWeekdayRates[d.id] ? newWeekdayRates[d.id] : (newWeekdayRates[d.id] === 0 ? '0' : '')}
                                    placeholder="0.00"
                                    onChange={(e) => setNewWeekdayRates({ ...newWeekdayRates, [d.id]: parseFloat(e.target.value) || 0 })}
                                    className="w-full text-center text-xs font-bold outline-none bg-white border border-emerald-500 text-emerald-900 shadow-inner focus:bg-yellow-50"
                                  />
                                </td>
                              </>
                            ) : (
                              <td className="p-0.5 text-center">
                                <input 
                                  type="number"
                                  step="0.25"
                                  value={weekdayRates[d.id] ? weekdayRates[d.id] : (weekdayRates[d.id] === 0 ? '0' : '')}
                                  placeholder="0.00"
                                  onChange={(e) => setWeekdayRates({ ...weekdayRates, [d.id]: parseFloat(e.target.value) || 0 })}
                                  className="w-full text-center text-xs font-bold outline-none bg-transparent text-black"
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Right Side Shortcut Labels & Checkbox */}
            <div className="space-y-2.5 text-xs font-bold">
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
                  {isRateChangeMode ? 'Press F1: Copy Sunday New Rate' : 'Press F1: Copy Sunday Rate'}
                </button>
              </div>
            </div>
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
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-1 sm:gap-2 pt-2 border-t border-[#808080] bg-[#ECE9D8] pb-1">
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
      )}

      {/* Tab 2: Publication Discontinue */}
      {activeMainTab === 'discontinue' && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 flex flex-col justify-between space-y-3 bg-[#ECE9D8] min-h-0">
          <div className="space-y-3">
            <div className="text-center">
              <h1 
                className="text-2xl font-black text-[#800000] tracking-wider uppercase" 
                style={{ fontFamily: 'Georgia, serif' }}
              >
                PUBLICATIONS DISCONTINUE
              </h1>
            </div>

            {/* Date & Period Row */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <label className="font-bold text-[#800000] text-xs">Date</label>
                <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-1 py-0.5 shadow-inner">
                  <input 
                    type="text" 
                    value={pubDisFromDate}
                    onChange={(e) => setPubDisFromDate(e.target.value)}
                    onBlur={() => setPubDisFromDate(formatDateDisplay(pubDisFromDate))}
                    className="w-24 text-center font-mono font-bold text-black outline-none bg-transparent"
                    placeholder="DD/MM/YYYY"
                  />
                </div>
              </div>

              <div className="font-bold text-black text-xs">
                Period :- <span className="text-[#000080] font-mono">{fyLabel()}</span>
              </div>
            </div>

            {/* Mode Selection: Single Publication vs Holiday */}
            <div className="flex items-center justify-center gap-8 py-1 px-2 bg-[#E3DFCA] border border-[#BFBAA0] rounded-xs">
              <label className="flex items-center gap-2 font-bold text-[#800000] cursor-pointer text-xs">
                <input 
                  type="radio" 
                  name="pubDisMode"
                  value="single"
                  checked={pubDisMode === 'single'}
                  onChange={() => {
                    setPubDisMode('single');
                  }}
                  className="cursor-pointer"
                />
                <span>Single Publication (विशिष्ट अखबार)</span>
              </label>

              <label className="flex items-center gap-2 font-bold text-[#006600] cursor-pointer text-xs bg-white px-2 py-0.5 border border-[#006600]/40 rounded-xs shadow-xs">
                <input 
                  type="radio" 
                  name="pubDisMode"
                  value="holiday"
                  checked={pubDisMode === 'holiday'}
                  onChange={() => {
                    setPubDisMode('holiday');
                    setPubDisHoldType('Temporary');
                  }}
                  className="cursor-pointer"
                />
                <span>🏖️ Holiday (अवकाश - सभी दैनिक समाचार पत्र)</span>
              </label>
            </div>

            {/* If Single Publication: Show Publication Dropdown */}
            {pubDisMode === 'single' ? (
              <>
                {/* Publication Select */}
                <div className="flex items-center gap-2">
                  <label className="w-28 font-bold text-[#800000] text-right shrink-0">
                    Publication
                  </label>
                  <div className="flex-1">
                    <select 
                      value={pubDisSelectedId}
                      onChange={(e) => setPubDisSelectedId(e.target.value)}
                      className="w-full px-2 py-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner"
                    >
                      <option value="">-- कृपया पत्रिका/अखबार चुनें (Select Publication) --</option>
                      {pubList.map((p) => (
                        <option key={p.publica_id} value={p.publica_id}>
                          #{p.publica_id} - {p.public_name} {p.pub_hindi ? `(${p.pub_hindi})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Remark / Reason */}
                <div className="flex items-center gap-2">
                  <label className="w-28 font-bold text-[#800000] text-right shrink-0">
                    Remark / कारण
                  </label>
                  <div className="flex-1">
                    <input 
                      type="text" 
                      value={pubDisRemark}
                      onChange={(e) => setPubDisRemark(e.target.value)}
                      placeholder="e.g. Strike / Discontinued"
                      className="w-full px-2 py-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Holiday Mode: All Newspapers Banner */}
                <div className="flex items-center gap-2">
                  <label className="w-28 font-bold text-[#006600] text-right shrink-0">
                    Target
                  </label>
                  <div className="flex-1 px-3 py-1.5 bg-[#E8F5E9] border border-[#81C784] font-bold text-[#1B5E20] text-xs rounded-xs flex items-center gap-2 shadow-inner">
                    <span>🏖️</span>
                    <span>All Daily Newspapers (सभी दैनिक समाचार पत्र - पत्रिकाएं शामिल नहीं)</span>
                  </div>
                </div>

                {/* Holiday Description Input Box */}
                <div className="flex items-center gap-2">
                  <label className="w-28 font-bold text-[#006600] text-right shrink-0">
                    Description / विवरण
                  </label>
                  <div className="flex-1">
                    <input 
                      type="text" 
                      value={pubDisHolidayDesc}
                      onChange={(e) => setPubDisHolidayDesc(e.target.value)}
                      placeholder="e.g. Diwali Holiday, Holi, Press Closed, Strike, etc."
                      className="w-full px-2 py-1 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner focus:border-green-600"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Temporary / Permanent Group Box */}
            <fieldset className="border border-[#808080] p-3 mx-1 my-1 relative">
              <legend className="px-1.5 font-bold text-[#800000] text-xs">
                Temporary/Permanent (अस्थाई / स्थाई रोक)
              </legend>

              {/* Checkboxes Row */}
              <div className="flex items-center justify-center gap-10 pb-2">
                <label className="flex items-center gap-1.5 font-bold text-black cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={pubDisHoldType === 'Temporary'}
                    onChange={() => setPubDisHoldType('Temporary')}
                    className="cursor-pointer"
                  />
                  <span>Temporary (अस्थाई रोक)</span>
                </label>

                <label className="flex items-center gap-1.5 font-bold text-black cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={pubDisHoldType === 'Permanent'}
                    onChange={() => setPubDisHoldType('Permanent')}
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
                      value={pubDisFromDate}
                      onChange={(e) => setPubDisFromDate(e.target.value)}
                      onBlur={() => setPubDisFromDate(formatDateDisplay(pubDisFromDate))}
                      placeholder="DD/MM/YYYY"
                      className="w-24 text-center font-mono font-bold text-black outline-none bg-transparent"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="font-bold text-[#800000]">To</label>
                  <div className={`border border-t-[#808080] border-l-[#808080] border-r-white border-b-white px-1.5 py-0.5 shadow-inner ${pubDisHoldType === 'Permanent' ? 'bg-slate-200 opacity-60' : 'bg-white'}`}>
                    <input 
                      type="text" 
                      value={pubDisToDate}
                      onChange={(e) => setPubDisToDate(e.target.value)}
                      onBlur={() => setPubDisToDate(formatDateDisplay(pubDisToDate))}
                      disabled={pubDisHoldType === 'Permanent'}
                      placeholder={pubDisHoldType === 'Permanent' ? '---' : 'DD/MM/YYYY'}
                      className="w-24 text-center font-mono font-bold text-black outline-none bg-transparent disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              {/* Hotkeys Hint */}
              <div className="text-center pt-2.5 font-bold text-[#800000] text-[11px]">
                F1 - Temporary &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; F2 - Permanent
              </div>
            </fieldset>

            {/* Publication Status Msg */}
            {pubDisMsg && (
              <div className={`text-center py-1 px-2 border font-bold text-xs ${
                pubDisMsg.isError 
                  ? 'bg-red-100 text-red-900 border-red-300' 
                  : 'bg-emerald-100 text-emerald-900 border-emerald-400'
              }`}>
                {pubDisMsg.text}
              </div>
            )}
          </div>

          {/* Action Buttons matching VB6 */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-1 pt-2 border-t border-[#808080] bg-[#ECE9D8] pb-1">
            <button 
              type="button"
              onClick={handlePubDisSave}
              disabled={isPubDisSaving}
              className="flex-1 min-w-[50px] py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
            >
              <u>S</u>ave
            </button>

            <button 
              type="button"
              onClick={handlePubDisSave}
              disabled={isPubDisSaving}
              className="flex-1 min-w-[50px] py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
            >
              <u>U</u>pdate
            </button>

            <button 
              type="button"
              onClick={handlePubDisMainDelete}
              className="flex-1 min-w-[50px] py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
            >
              <u>D</u>elete
            </button>

            <button 
              type="button"
              onClick={() => {
                fetchPubDisHistory();
                setIsPubDisFindOpen(true);
              }}
              className="flex-1 min-w-[50px] py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
            >
              <u>F</u>ind
            </button>

            <button 
              type="button"
              onClick={handlePubDisCancel}
              className="flex-1 min-w-[50px] py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
            >
              <u>C</u>ancel
            </button>

            <button 
              type="button"
              onClick={onClose}
              className="flex-1 min-w-[50px] py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-red-800 shadow-xs cursor-pointer text-center"
            >
              <u>E</u>xit
            </button>
          </div>
        </div>
      )}

      {/* Publication Discontinue Find Modal */}
      {isPubDisFindOpen && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-3 z-50">
          <div className="d2-window bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl w-full h-[450px] flex flex-col font-tahoma text-xs">
            {/* Modal Title Bar */}
            <div className="d2-title bg-[#0A246A] text-white px-2 py-1 flex items-center justify-between font-bold">
              <span>Find Publication Discontinues (अखबार रोक सूची)</span>
              <button 
                onClick={() => setIsPubDisFindOpen(false)}
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
                  value={pubDisFindSearch}
                  onChange={(e) => setPubDisFindSearch(e.target.value)}
                  placeholder="Filter by publication name or ID..."
                  className="flex-1 px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold outline-none"
                />
              </div>

              {/* Table */}
              <div className="flex-1 bg-white border border-[#808080] overflow-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-[#ECE9D8] border-b border-[#808080]">
                    <tr>
                      <th className="p-1 border-r text-center">#ID</th>
                      <th className="p-1 border-r text-left">Publication</th>
                      <th className="p-1 border-r text-left">Type</th>
                      <th className="p-1 border-r text-left">From</th>
                      <th className="p-1 border-r text-left">To</th>
                      <th className="p-1 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pubDisHistoryList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-500 font-bold">
                          {isLoadingPubDisHistory ? 'Loading publication discontinue records...' : 'No publication discontinue records found.'}
                        </td>
                      </tr>
                    ) : (
                      pubDisHistoryList
                        .filter(d => {
                          if (!pubDisFindSearch.trim()) return true;
                          const s = pubDisFindSearch.toLowerCase();
                          const pId = d.publica_id !== undefined ? d.publica_id : d.Publica_id;
                          const isHoli = pId === 0 || pId === '0';
                          const pubName = isHoli ? 'holiday all newspapers' : (pubList.find(p => p.publica_id === pId)?.public_name || '').toLowerCase();
                          const remark = (d.remark || '').toLowerCase();
                          return String(pId).includes(s) || pubName.includes(s) || remark.includes(s) || String(d.id).includes(s);
                        })
                        .map((d) => {
                          const pId = d.publica_id !== undefined ? d.publica_id : d.Publica_id;
                          const isHolidayRec = pId === 0 || pId === '0';
                          const pubName = isHolidayRec 
                            ? `🏖️ [HOLIDAY] All Newspapers ${d.remark ? `(${d.remark})` : ''}` 
                            : (pubList.find(p => p.publica_id === pId)?.public_name || `Pub #${pId}`);
                          const isPerm = String(d.dis_type).toUpperCase().startsWith('P');
                          return (
                            <tr key={d.id} className={`border-b hover:bg-blue-50 ${isHolidayRec ? 'bg-emerald-50/50' : ''}`}>
                              <td className="p-1 border-r text-center font-mono font-bold">#{d.id}</td>
                              <td className={`p-1 border-r font-bold ${isHolidayRec ? 'text-emerald-900' : 'text-blue-900'}`}>
                                {pubName}
                              </td>
                              <td className="p-1 border-r font-bold">
                                {isHolidayRec ? (
                                  <span className="text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded text-[10px]">Holiday</span>
                                ) : (
                                  isPerm ? 'Permanent' : 'Temporary'
                                )}
                              </td>
                              <td className="p-1 border-r font-mono">{(d.from_date || d.entry_date || '-').split('T')[0]}</td>
                              <td className="p-1 border-r font-mono">{(d.to_date || d.oc_date || 'Permanent').split('T')[0]}</td>
                              <td className="p-1 text-center">
                                <button 
                                  onClick={() => handlePubDisDelete(d.id)}
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
            </div>

            {/* Modal Bottom Close */}
            <div className="p-2 border-t bg-[#ECE9D8] flex justify-end">
              <button 
                onClick={() => setIsPubDisFindOpen(false)}
                className="px-4 py-1 bg-white border border-[#808080] font-bold text-xs cursor-pointer hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Find Publication Modal Dialog with Active / Closed Filters */}
      {isFindOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-3">
          <div className="d2-window w-[660px] max-h-[480px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma text-xs">
            {/* Find Dialog Titlebar */}
            <div className="d2-title bg-[#0A246A] text-white px-2 py-1 font-bold flex justify-between items-center">
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

      {/* Rate Change History Modal Dialog */}
      {isHistoryOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-3">
          <div className="d2-window w-[580px] max-h-[460px] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma text-xs">
            {/* Titlebar */}
            <div className="d2-title bg-[#0A246A] text-white px-2 py-1 font-bold flex justify-between items-center">
              <span>📜 Rate Change History - {selectedPub.public_name} (#{selectedPub.publica_id})</span>
              <button onClick={() => setIsHistoryOpen(false)} className="text-white hover:text-red-300 font-bold cursor-pointer">✕</button>
            </div>
            
            <div className="p-2.5 space-y-2 flex-1 overflow-hidden flex flex-col">
              <div className="bg-white p-2 border border-slate-300 text-xs text-blue-900 font-bold flex justify-between items-center">
                <span>Publication: #{selectedPub.publica_id} - {selectedPub.public_name}</span>
                <span className="text-slate-600 font-normal">Total Recorded Changes: {historyList.length}</span>
              </div>

              {/* History Table */}
              <div className="flex-1 bg-white border border-slate-400 overflow-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#ECE9D8] border-b border-slate-400">
                    <tr>
                      <th className="p-1 border-r text-center w-10">#</th>
                      <th className="p-1 border-r text-left">Effective Date (दिनांक)</th>
                      <th className="p-1 border-r text-left">Day / Weekday (दिन)</th>
                      <th className="p-1 border-r text-right w-20">Old Rate (₹)</th>
                      <th className="p-1 border-r text-right w-20 text-emerald-800">New Rate (₹)</th>
                      <th className="p-1 text-center w-24">Action (कार्य)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingHistory ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-500 font-bold">
                          Loading rate change history...
                        </td>
                      </tr>
                    ) : historyList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-500 font-bold">
                          No previous rate change revisions found for this publication.
                        </td>
                      </tr>
                    ) : (
                      historyList.map((h, idx) => {
                        const dayNum = h.dayofweek !== undefined ? h.dayofweek : h.Dayofweek;
                        const dayObj = WEEKDAYS.find(w => w.id === dayNum);
                        const dayLabel = dayNum === 0 ? 'All Days (सभी दिन)' : (dayObj ? `${dayObj.name} (${dayObj.hindi})` : `Day ${dayNum}`);
                        const effDate = (h.dated || h.Dated || h.effective_date || '').split('T')[0];
                        const oldVal = Number(h.oldrate ?? h.OldRate ?? 0);
                        const newVal = Number(h.new_rate ?? h.NewRate ?? 0);

                        return (
                          <tr 
                            key={idx} 
                            onClick={() => handleSelectHistoryRevision(effDate)}
                            title="Click row to edit this rate change revision"
                            className="border-b border-slate-200 hover:bg-blue-100/70 cursor-pointer transition-colors"
                          >
                            <td className="p-1 border-r text-center font-mono text-slate-500">{idx + 1}</td>
                            <td className="p-1 border-r font-mono font-bold text-blue-900">{effDate}</td>
                            <td className="p-1 border-r font-bold text-slate-700">{dayLabel}</td>
                            <td className="p-1 border-r text-right font-mono text-slate-500">₹{oldVal.toFixed(2)}</td>
                            <td className="p-1 border-r text-right font-mono font-bold text-emerald-700 bg-emerald-50/50">₹{newVal.toFixed(2)}</td>
                            <td className="p-1 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSelectHistoryRevision(effDate)}
                                  className="px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-400 rounded-xs text-[10px] font-bold cursor-pointer"
                                  title="Edit / Correct this rate change"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteHistoryRevision(effDate, e)}
                                  className="px-1.5 py-0.5 bg-red-100 hover:bg-red-200 text-red-900 border border-red-400 rounded-xs text-[10px] font-bold cursor-pointer"
                                  title="Delete this revision"
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-2 border-t bg-[#ECE9D8] flex justify-end">
              <button 
                onClick={() => setIsHistoryOpen(false)}
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
