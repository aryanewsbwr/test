import React, { useState, useRef, useEffect } from 'react';
import { Printer, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { BillRecord, BillPrintMode, BOY_LOGO_B64 } from '@/lib/bill4in1Export';
import { getReliableHindiName } from '@/lib/transliteration';
import { billRoundOff, formatRoundOff, roundToFoxProRule } from '@/lib/billingEngine';
import { generateDynamicUpiQrSvg } from '@/lib/upiQrHelper';
import { printBillsThermal58mm, getThermalPublicationDisplayName } from '@/lib/billThermalExport';

interface BillThermalPreviewProps {
  bills: BillRecord[];
  title?: string;
  zoomLevel?: number;
  initialPrintMode?: BillPrintMode;
  onBillsSent?: (bills: BillRecord[]) => void;
}

function formatMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '0.00';
  return Number(n).toFixed(2);
}

function formatShortMonthYear(m: string | undefined, y: string | number | undefined): string {
  const shortMap: Record<string, string> = {
    'january': 'Jan', 'february': 'Feb', 'march': 'Mar', 'april': 'Apr',
    'may': 'May', 'june': 'Jun', 'july': 'Jul', 'august': 'Aug',
    'september': 'Sep', 'sept': 'Sep', 'october': 'Oct', 'november': 'Nov', 'december': 'Dec'
  };
  const cleanM = (m || '').trim().toLowerCase();
  const sM = shortMap[cleanM] || (m ? m.slice(0, 3) : '');
  return `${sM} ${y || ''}`.trim();
}

function computeNextMonthBillDate(m: string | undefined, y: string | number | undefined): string {
  const mLow = (m || '').toLowerCase().slice(0, 3);
  const mList = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const mIdx = mList.indexOf(mLow);
  const baseYear = Number(y) || 2026;
  if (mIdx >= 0) {
    const nextM = (mIdx + 1) % 12;
    const nextYr = nextM === 0 ? baseYear + 1 : baseYear;
    return `01-${String(nextM + 1).padStart(2, '0')}-${nextYr}`;
  }
  return `01-10-${baseYear}`;
}

// Same month text the send route stores in whatsapp_messages.bill_month
function billMonthKey(b: BillRecord): string {
  return `${b.month || ''} ${b.year || ''}`.trim() || 'Oct 2026';
}

function waSentKey(b: BillRecord): string {
  return `${b.customer_id}|${billMonthKey(b)}`;
}

function formatSentTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function cleanPhone(p: string | undefined | null): string {
  if (!p || p === '---') return '';
  const digits = String(p).replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return String(p).trim();
}

export const BillThermalPreview: React.FC<BillThermalPreviewProps> = ({
  bills = [],
  title = 'Aryan News Agency - Monthly Bills',
  zoomLevel = 100,
  initialPrintMode = 'simple',
  onBillsSent
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [printMode, setPrintMode] = useState<BillPrintMode>(initialPrintMode);
  const [viewAll, setViewAll] = useState(false);
  const [scale, setScale] = useState(1);
  const [isSendingWa, setIsSendingWa] = useState(false);
  const [isSendingWaAll, setIsSendingWaAll] = useState(false);
  const [waProgress, setWaProgress] = useState<{ sent: number; total: number } | null>(null);
  const [waStatus, setWaStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const billCardRef = useRef<HTMLDivElement | null>(null);
  // Off-screen refs + state used to rasterize each bill in the browser for bulk WhatsApp sending
  const captureRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [captureChunk, setCaptureChunk] = useState<BillRecord[] | null>(null);
  // Bills already sent on WhatsApp, keyed by customer + bill month
  const [waSent, setWaSent] = useState<Record<string, { sent_at: string; status: string; manual?: boolean }>>({});
  const [waCheckFailed, setWaCheckFailed] = useState(false);
  const [sendAllPrompt, setSendAllPrompt] = useState<{ newBills: BillRecord[]; sentBills: BillRecord[] } | null>(null);

  const monthsKey = Array.from(new Set((bills || []).map(billMonthKey))).join('|');

  useEffect(() => {
    if (!monthsKey) return;
    let cancelled = false;
    const params = new URLSearchParams();
    monthsKey.split('|').forEach(m => params.append('month', m));

    fetch(`/api/whatsapp/status?${params.toString()}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Status check failed');
        return data;
      })
      .then(data => {
        if (cancelled) return;
        const next: Record<string, { sent_at: string; status: string; manual?: boolean }> = {};
        (data.sent || []).forEach((s: any) => {
          next[`${s.customer_id}|${s.bill_month}`] = { sent_at: s.sent_at, status: s.status, manual: s.manual };
        });
        setWaSent(next);
        setWaCheckFailed(false);
      })
      .catch(err => {
        console.warn('Could not load WhatsApp sent status:', err);
        if (!cancelled) setWaCheckFailed(true);
      });

    return () => { cancelled = true; };
  }, [monthsKey]);

  if (!bills || bills.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500 font-mono text-xs">
        No bills available to display in Preview.
      </div>
    );
  }

  const currentBill = bills[currentIndex] || bills[0];
  const currentBillSent = waSent[waSentKey(currentBill)];
  const sentBillCount = bills.filter(b => waSent[waSentKey(b)]).length;

  const markBillsSent = (sentBills: BillRecord[]) => {
    const firstTimeSent = sentBills.filter(b => !waSent[waSentKey(b)]);
    if (firstTimeSent.length > 0) onBillsSent?.(firstTimeSent);
    const sentAt = new Date().toISOString();
    setWaSent(prev => {
      const next = { ...prev };
      sentBills.forEach(b => { next[waSentKey(b)] = { sent_at: sentAt, status: 'sent' }; });
      return next;
    });
  };

  const handlePrintAll = () => {
    printBillsThermal58mm(bills, title, printMode);
  };

  const handlePrintCurrent = () => {
    printBillsThermal58mm([currentBill], `Bill_${currentBill.customer_id}`, printMode);
  };

  const handleSendCurrentWhatsApp = async () => {
    const rawPhone = currentBill.phone;
    if (!rawPhone || rawPhone.trim() === '---') {
      setWaStatus({ type: 'error', message: 'Customer has no valid phone number saved.' });
      setTimeout(() => setWaStatus(null), 4000);
      return;
    }

    if (currentBillSent && !window.confirm(
      `This bill was already sent on WhatsApp${currentBillSent.manual ? '' : ` on ${formatSentTime(currentBillSent.sent_at)}`}.\n(यह बिल पहले ही भेजा जा चुका है।)\n\nDo you want to send it again?`
    )) return;

    setIsSendingWa(true);
    setWaStatus(null);

    try {
      // Capture the exact visible DOM bill card into a pixel-perfect PNG image
      let imageBase64: string | undefined = undefined;
      if (billCardRef.current) {
        try {
          imageBase64 = await toPng(billCardRef.current, {
            quality: 0.98,
            pixelRatio: 2,
            backgroundColor: '#ffffff'
          });
        } catch (imgErr) {
          console.warn('Could not rasterize DOM bill element:', imgErr);
        }
      }

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_phone: rawPhone,
          month: `${currentBill.month || ''} ${currentBill.year || ''}`.trim() || 'Oct 2026',
          bill_id: currentBill.bill_no || currentBill.customer_id,
          customer_id: currentBill.customer_id,
          customer_name: currentBill.customer_name,
          customer_hindi: getReliableHindiName(currentBill.customer_hindi || '', currentBill.customer_name),
          items: currentBill.items || [],
          delivery_charge: currentBill.delivery_charge || 0,
          paper_amount: currentBill.paper_amount || 0,
          current_bill: currentBill.current_bill,
          paid_amount: currentBill.paid_amount || 0,
          previous_due: currentBill.previous_due || 0,
          net_payable: currentBill.net_payable || 0,
          image_base64: imageBase64
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        markBillsSent([currentBill]);
        setWaStatus({ type: 'success', message: `WhatsApp bill sent successfully to ${rawPhone}!` });
      } else {
        setWaStatus({ type: 'error', message: data.error || data.errorCode || 'Failed to send WhatsApp bill.' });
      }
    } catch (err: any) {
      setWaStatus({ type: 'error', message: err?.message || 'Network error occurred.' });
    } finally {
      setIsSendingWa(false);
      setTimeout(() => setWaStatus(null), 5000);
    }
  };

  const handleSendAllWhatsApp = async () => {
    // Filter bills that have phone numbers
    const eligibleBills = bills.filter(b => b.phone && b.phone.trim() !== '' && b.phone.trim() !== '---');
    
    if (eligibleBills.length === 0) {
      setWaStatus({ type: 'error', message: 'No customers in this region have a valid mobile number.' });
      setTimeout(() => setWaStatus(null), 4000);
      return;
    }

    const sentBills = eligibleBills.filter(b => waSent[waSentKey(b)]);
    if (sentBills.length > 0) {
      setSendAllPrompt({ newBills: eligibleBills.filter(b => !waSent[waSentKey(b)]), sentBills });
      return;
    }

    const confirmSend = window.confirm(
      `Send WhatsApp bills to all ${eligibleBills.length} customer(s) with valid phone numbers in this region?\n(Total bills: ${bills.length})`
    );
    if (!confirmSend) return;

    await sendWhatsAppBatch(eligibleBills);
  };

  const sendWhatsAppBatch = async (eligibleBills: BillRecord[]) => {
    setSendAllPrompt(null);
    setIsSendingWaAll(true);
    setWaProgress({ sent: 0, total: eligibleBills.length });
    setWaStatus(null);

    try {
      // Send in batches of 15 to show progress smoothly and bound browser memory
      const chunkSize = 15;
      let totalSent = 0;
      let totalFailed = 0;
      let totalSkipped = 0;

      for (let i = 0; i < eligibleBills.length; i += chunkSize) {
        const chunkBills = eligibleBills.slice(i, i + chunkSize);

        // Render this chunk off-screen, then rasterize each bill card in the browser
        // (where Devanagari fonts exist) — exactly like the single-send path. This is
        // what prevents the tofu/blocks that the server-side SVG image produced.
        captureRefs.current.clear();
        await new Promise<void>((resolve) => {
          setCaptureChunk(chunkBills);
          setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())), 40);
        });
        try { await (document as any).fonts?.ready; } catch { /* fonts API unavailable */ }

        const chunkImages: (string | undefined)[] = [];
        for (let j = 0; j < chunkBills.length; j++) {
          const el = captureRefs.current.get(j);
          if (!el) { chunkImages[j] = undefined; continue; }
          try {
            chunkImages[j] = await toPng(el, {
              quality: 0.98,
              pixelRatio: 2,
              backgroundColor: '#ffffff'
            });
          } catch (imgErr) {
            console.warn('Could not rasterize bill for bulk WhatsApp send:', imgErr);
            chunkImages[j] = undefined;
          }
        }

        const chunkPayload = chunkBills.map((b, j) => ({
          bill_no: b.bill_no || b.customer_id,
          customer_id: b.customer_id,
          customer_name: b.customer_name,
          customer_hindi: getReliableHindiName(b.customer_hindi || '', b.customer_name),
          month: `${b.month || ''} ${b.year || ''}`.trim() || 'Oct 2026',
          region_name: b.region_name || b.region_id,
          phone: b.phone,
          items: b.items || [],
          paper_amount: b.paper_amount || 0,
          delivery_charge: b.delivery_charge || 0,
          current_bill: b.current_bill,
          paid_amount: b.paid_amount || 0,
          previous_due: b.previous_due || 0,
          net_payable: b.net_payable || 0,
          image_base64: chunkImages[j]
        }));

        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bills: chunkPayload,
            month: chunkPayload[0]?.month || 'Oct 2026'
          })
        });

        const data = await res.json();
        if (data.success) {
          totalSent += data.sent_count || 0;
          totalFailed += data.failed_count || 0;
          totalSkipped += data.skipped_count || 0;
          const sentIds = new Set((data.results || []).filter((r: any) => r.success).map((r: any) => String(r.customer_id)));
          markBillsSent(chunkBills.filter(b => sentIds.has(String(b.customer_id))));
          if (data.failed_count > 0 && Array.isArray(data.results)) {
            const firstFail = data.results.find((r: any) => !r.success && r.status !== 'skipped');
            if (firstFail) {
              console.error('[WhatsApp Send All Error Detail]:', firstFail);
            }
          }
        } else {
          totalFailed += chunkBills.length;
          console.error('[WhatsApp Batch API Error]:', data.error);
        }

        setWaProgress({ sent: Math.min(i + chunkBills.length, eligibleBills.length), total: eligibleBills.length });
      }

      setCaptureChunk(null);

      setWaStatus({
        type: totalSent > 0 ? 'success' : 'error',
        message: `WhatsApp batch completed: ${totalSent} delivered successfully${totalFailed > 0 ? `, ${totalFailed} failed` : ''}${totalSkipped > 0 ? `, ${totalSkipped} skipped` : ''}.`
      });
    } catch (err: any) {
      setCaptureChunk(null);
      setWaStatus({ type: 'error', message: err?.message || 'Network error occurred during batch send.' });
    } finally {
      setIsSendingWaAll(false);
      setWaProgress(null);
      setTimeout(() => setWaStatus(null), 8000);
    }
  };

  // Kept outside the bill card so it never appears on the image sent to the customer
  const renderSentBadge = (b: BillRecord) => {
    const sent = waSent[waSentKey(b)];
    if (!sent) return null;
    return (
      <div className="mb-2 px-3 py-1 bg-green-600 text-white text-[11px] font-bold rounded-full flex items-center gap-1.5 shadow-sm">
        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
        {sent.manual ? (
          <span>Marked as sent before</span>
        ) : (
          <span>Sent on WhatsApp{sent.status === 'read' ? ' (Read)' : sent.status === 'delivered' ? ' (Delivered)' : ''} · {formatSentTime(sent.sent_at)}</span>
        )}
      </div>
    );
  };

  const renderBill = (b: BillRecord, idx: number, forCapture = false) => {
    // Only show a Hindi name we can trust (real DB Hindi / legacy decode / known
    // phrase). Never the lossy phonetic guess — that produced wrong names before.
    let displayHindi = getReliableHindiName(b.customer_hindi || '', b.customer_name);
    const cleanEngName = (b.customer_name || '').replace(/\s+crd\b/i, '').trim();

    if (displayHindi) {
      displayHindi = displayHindi.replace(/\s+सीआरडी\b/i, '').replace(/\s+CRD\b/i, '').trim();
    }

    const items = b.items || [];
    const totalDelivery = b.delivery_charge || 0;

    let itemsElements: React.ReactNode = null;

    if (printMode === 'simple') {
      const pubConsolidatedMap = new Map<string, {
        pub_name: string;
        totalQty: number;
        paperAmount: number;
        deliveryAmount: number;
      }>();

      const hasItemDelivery = items.some(it => (it.delivery_amount || 0) > 0);

      items.forEach((it, pIdx) => {
        const pubDisplayName = getThermalPublicationDisplayName(it.pub_name);
        const pubKey = pubDisplayName.toLowerCase();
        const qty = Number(it.days !== undefined && it.days > 0 ? it.days : (it.qty || 1));
        
        let itemDelivery = 0;
        if (hasItemDelivery) {
          itemDelivery = it.delivery_amount || 0;
        } else if (totalDelivery > 0 && pIdx === 0) {
          itemDelivery = totalDelivery;
        }

        const existing = pubConsolidatedMap.get(pubKey);
        if (existing) {
          existing.totalQty += qty;
          existing.paperAmount += it.net_amount ?? it.amount;
          existing.deliveryAmount += itemDelivery;
        } else {
          pubConsolidatedMap.set(pubKey, {
            pub_name: pubDisplayName,
            totalQty: qty,
            paperAmount: it.net_amount ?? it.amount,
            deliveryAmount: itemDelivery
          });
        }
      });

      const displayItems = Array.from(pubConsolidatedMap.values()).map(entry => ({
        pub_name: entry.pub_name,
        totalQty: entry.totalQty,
        totalAmount: roundToFoxProRule(entry.paperAmount + entry.deliveryAmount)
      }));
      const monthBillAmount = roundToFoxProRule((b.paper_amount || 0) + (b.delivery_charge || 0));

      itemsElements = displayItems.length > 0 ? (
        displayItems.map((it, pIdx) => (
          <div key={pIdx} className="flex justify-between items-center text-[12px] font-semibold text-black">
            <span className="flex-[2] text-left">{it.pub_name}</span>
            <span className="flex-1 text-center font-bold">{it.totalQty}</span>
            <span className="flex-1 text-right font-bold">{formatMoney(it.totalAmount)}</span>
          </div>
        ))
      ) : (
        <div className="flex justify-between items-center text-[12px] font-semibold text-black">
          <span className="flex-[2] text-left">समाचार पत्र / मासिक</span>
          <span className="flex-1 text-center font-bold">30</span>
          <span className="flex-1 text-right font-bold">{formatMoney(monthBillAmount)}</span>
        </div>
      );
    } else {
      itemsElements = items.length > 0 ? (
        items.map((it, pIdx) => {
          const qtyOrDays = it.days !== undefined && it.days > 0 ? it.days : (it.qty || 1);
          const pubDisplayName = getThermalPublicationDisplayName(it.pub_name);
          return (
            <div key={pIdx} className="flex justify-between items-center text-[12px] font-semibold text-black">
              <span className="flex-[2] text-left">{pubDisplayName}</span>
              <span className="flex-1 text-center font-bold">{qtyOrDays}</span>
              <span className="flex-1 text-right font-bold">{formatMoney(roundToFoxProRule(it.amount))}</span>
            </div>
          );
        })
      ) : (
        <div className="flex justify-between items-center text-[12px] font-semibold text-black">
          <span className="flex-[2] text-left">समाचार पत्र / मासिक</span>
          <span className="flex-1 text-center font-bold">30</span>
          <span className="flex-1 text-right font-bold">{formatMoney(roundToFoxProRule(b.paper_amount || 0))}</span>
        </div>
      );
    }

    const paperAmount = roundToFoxProRule(b.paper_amount || 0);
    const deliveryCharge = roundToFoxProRule(b.delivery_charge || 0);
    const discountAmount = roundToFoxProRule(b.discount_amount || 0);
    const monthBillAmount = b.current_bill !== undefined && b.current_bill !== null
      ? roundToFoxProRule(b.current_bill)
      : roundToFoxProRule(Math.max(0, paperAmount + deliveryCharge - discountAmount));
    const previousDue = Number(b.previous_due || 0);
    const netPayable = b.net_payable !== undefined && b.net_payable !== null
      ? roundToFoxProRule(b.net_payable)
      : roundToFoxProRule(monthBillAmount + previousDue);
    const roundOff = billRoundOff(netPayable, monthBillAmount + previousDue - Number(b.paid_amount || 0));

    const monthYearDisplay = formatShortMonthYear(b.month, b.year);
    const formattedPhone = cleanPhone(b.phone);

    return (
      <div
        ref={(el) => {
          if (forCapture) {
            if (el) captureRefs.current.set(idx, el);
          } else if (idx === currentIndex) {
            billCardRef.current = el;
          }
        }}
        key={`${b.customer_id}-${idx}`}
        className="w-[360px] max-w-[360px] bg-white border border-slate-300 shadow-2xl p-6 font-sans text-[12px] leading-tight select-text text-black mb-8 rounded-sm text-center"
        style={{
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }}
      >
        {/* Festive Diwali Greeting Banner */}
        <div className="flex items-center justify-center gap-2 mb-2 py-1 px-3 border border-amber-300 bg-amber-50 rounded-sm text-amber-900">
          <svg width="20" height="17" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
            <path d="M10 1C10 1 6.5 5.5 7.5 8.5C8.2 10.7 10 11.2 10 11.2C10 11.2 11.8 10.7 12.5 8.5C13.5 5.5 10 1 10 1Z" fill="#F59E0B"/>
            <path d="M10 4C10 4 8.2 6.5 8.8 8.2C9.2 9.5 10 9.8 10 9.8C10 9.8 10.8 9.5 11.2 8.2C11.8 6.5 10 4 10 4Z" fill="#EF4444"/>
            <path d="M2 10C3 14.5 6.5 16.5 10 16.5C13.5 16.5 17 14.5 18 10C18 10 14 12 10 12C6 12 2 10 2 10Z" fill="#B45309"/>
            <path d="M1.5 10C1.5 10 5.5 11.5 10 11.5C14.5 11.5 18.5 10 18.5 10C18.5 10 14.5 11 10 11C5.5 11 1.5 10 1.5 10Z" fill="#D97706"/>
          </svg>
          <span className="font-extrabold text-[12px] tracking-wider text-amber-900">
            ॥ शुभ दीपावली ॥
          </span>
          <svg width="20" height="17" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
            <path d="M10 1C10 1 6.5 5.5 7.5 8.5C8.2 10.7 10 11.2 10 11.2C10 11.2 11.8 10.7 12.5 8.5C13.5 5.5 10 1 10 1Z" fill="#F59E0B"/>
            <path d="M10 4C10 4 8.2 6.5 8.8 8.2C9.2 9.5 10 9.8 10 9.8C10 9.8 10.8 9.5 11.2 8.2C11.8 6.5 10 4 10 4Z" fill="#EF4444"/>
            <path d="M2 10C3 14.5 6.5 16.5 10 16.5C13.5 16.5 17 14.5 18 10C18 10 14 12 10 12C6 12 2 10 2 10Z" fill="#B45309"/>
            <path d="M1.5 10C1.5 10 5.5 11.5 10 11.5C14.5 11.5 18.5 10 18.5 10C18.5 10 14.5 11 10 11C5.5 11 1.5 10 1.5 10Z" fill="#D97706"/>
          </svg>
        </div>

        {/* Agency Header (Centered without logo) */}
        <div className="flex flex-col items-center justify-center mb-2.5 text-center">
          <div className="font-black text-[15px] tracking-tight text-black uppercase leading-tight whitespace-nowrap">
            ARYAN NEWS AGENCY
          </div>
          <div className="font-bold text-[13px] text-slate-900 mt-0.5 leading-tight">
            आर्यन न्यूज़ एजेंसी
          </div>
          <div className="text-[9.5px] text-slate-800 mt-1 leading-snug">
            5(1), Old Bus Stand, Beawar (Raj.) 305901
          </div>
          <div className="text-[9.5px] text-slate-800 leading-snug">
            WhatsApp: 9462558949 | Ph: 9829058949
          </div>
          <div className="text-[9.5px] text-slate-800 leading-snug">
            www.aryannewsagency.com
          </div>
        </div>

        {/* Solid Top Rule */}
        <div className="w-full h-[1.8px] bg-black my-1.5"></div>

        {/* Meta Info Grid */}
        <div className="flex flex-col gap-0.5 text-[11px] mb-1.5">
          <div className="flex justify-between items-center">
            <div className="text-left"><span className="text-slate-700">Bill No:</span> <span className="font-extrabold text-black">{b.bill_no || b.customer_id}</span></div>
            <div className="text-right whitespace-nowrap"><span className="text-slate-700">Month:</span> <span className="font-extrabold text-black">{monthYearDisplay}</span></div>
          </div>
          <div className="flex justify-between items-center">
            <div className="text-left"><span className="text-slate-700">A/c No:</span> <span className="font-extrabold text-black">{b.customer_id}</span></div>
          </div>
        </div>

        {/* Dashed Divider */}
        <div className="w-full border-t border-dashed border-zinc-500 my-1.5"></div>

        {/* Customer Section */}
        <div className="text-left mb-1.5">
          <div className="font-black text-[13.5px] uppercase tracking-tight text-black">
            {cleanEngName}
          </div>
          {displayHindi && (
            <div className="font-bold text-[12.5px] text-black leading-tight mt-0.5">
              {displayHindi}
            </div>
          )}
          <div className="flex justify-between items-center text-[10.5px] font-semibold text-slate-700 mt-1 whitespace-nowrap">
            <span>Region: {b.region_name || b.region_id}</span>
            {formattedPhone && <span>Mob: {formattedPhone}</span>}
          </div>
        </div>

        {/* Dashed Divider */}
        <div className="w-full border-t border-dashed border-zinc-500 my-1.5"></div>

        {/* Items Header */}
        <div className="flex justify-between items-center text-[11.5px] font-extrabold text-black">
          <span className="flex-[2] text-left">विवरण / Particular</span>
          <span className="flex-1 text-center">Days</span>
          <span className="flex-1 text-right">Amount ₹</span>
        </div>

        <div className="w-full border-t border-dashed border-zinc-400 my-1.5"></div>

        {/* Line Items */}
        <div className="flex flex-col gap-1.5 my-1">
          {itemsElements}
        </div>

        {/* Dashed Divider */}
        <div className="w-full border-t border-dashed border-zinc-500 my-1.5"></div>

        {/* Summary Breakdown */}
        <div className="flex flex-col gap-1 text-[10.5px] mb-2">
          <div className="flex justify-between items-center font-semibold text-zinc-900">
            <span className="text-left">Current / इस माह</span>
            <span className="font-bold whitespace-nowrap ml-1">₹ {formatMoney(monthBillAmount)}</span>
          </div>
          <div className="flex justify-between items-center font-semibold text-zinc-900">
            <span className="text-left">Prev. Due / बकाया</span>
            <span className="font-bold whitespace-nowrap ml-1">₹ {formatMoney(previousDue)}</span>
          </div>
          {!!b.paid_amount && (
            <div className="flex justify-between items-center font-semibold text-zinc-900">
              <span className="text-left">Paid / जमा</span>
              <span className="font-bold whitespace-nowrap ml-1">- ₹ {formatMoney(b.paid_amount)}</span>
            </div>
          )}
          {roundOff !== 0 && (
            <div className="flex justify-between items-center font-semibold text-zinc-900">
              <span className="text-left">Round Off</span>
              <span className="font-bold whitespace-nowrap ml-1">{formatRoundOff(roundOff)}</span>
            </div>
          )}
        </div>

        {/* Total Banner Box */}
        <div className="border-[1.4px] border-black rounded-md px-2.5 py-1.5 flex justify-between items-center mb-2.5 bg-white whitespace-nowrap">
          <span className="font-black text-[12.5px] text-black whitespace-nowrap">
            {netPayable < 0 ? 'ADVANCE / अग्रिम जमा' : 'TOTAL / कुल देय'}
          </span>
          <span className="font-black text-[14.5px] text-black whitespace-nowrap">
            {netPayable < 0 ? `-₹ ${formatMoney(Math.abs(netPayable))}` : `₹ ${formatMoney(netPayable)}`}
          </span>
        </div>

        {/* QR Payment Section */}
        {netPayable > 0 ? (
          <div className="flex flex-col items-center justify-center mb-2">
            <div 
              className="w-28 h-28 flex items-center justify-center bg-white p-1 mb-1"
              dangerouslySetInnerHTML={{
                __html: generateDynamicUpiQrSvg(
                  netPayable,
                  b.bill_no || b.customer_id,
                  `${b.month || ''} ${b.year || ''}`.trim(),
                  110,
                  0
                )
              }}
            />
            <div className="font-extrabold text-[11px] text-black">
              Scan &amp; Pay ₹{Math.round(netPayable)} via any UPI app
            </div>
            <div className="font-medium text-[10px] text-slate-800 mt-0.5">
              किसी भी UPI ऐप से स्कैन कर भुगतान करें
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-2 px-3 my-1.5 border border-dashed border-emerald-600 rounded bg-emerald-50 text-emerald-800 text-center">
            <div className="font-extrabold text-[12px]">
              {netPayable < 0 ? `अग्रिम जमा राशि: ₹${formatMoney(Math.abs(netPayable))}` : 'बिल पूर्ण चुकता (Nil Balance)'}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              {netPayable < 0 ? 'कोई भुगतान देय नहीं है (No Payment Required)' : 'इस माह कोई राशि देय नहीं है'}
            </div>
          </div>
        )}

        {/* Dashed Divider */}
        <div className="w-full border-t border-dashed border-zinc-500 my-1.5"></div>

        {/* Footer Policy Notice */}
        <div className="flex flex-col items-center gap-0.5 text-[9.5px] text-slate-700 leading-normal">
          <div className="font-bold text-black">कृपया बिल की राशि 5 तारीख तक जमा करें।</div>
          <div className="font-semibold text-black text-[9px]">भुगतान के बाद स्क्रीनशॉट व्हाट्सएप पर भेजें।</div>
          <div className="font-medium text-slate-800">Queries: WhatsApp 9462558949</div>
          <div className="font-extrabold text-[12px] leading-snug text-red-600 text-center mt-1 mb-0.5 px-1.5 py-1 border-[1.5px] border-red-600 rounded-md bg-red-50">यदि यह बिल आपका नहीं है, तो कृपया इसे अनदेखा करें और व्हाट्सएप पर केवल "यह मेरा बिल नहीं है" लिखकर भेज दें।</div>
          <div className="font-black text-[11px] text-black mt-0.5">धन्यवाद!</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* 58MM / SLIP TOOLBAR */}
      <div className="w-full max-w-2xl bg-slate-800 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs mb-3 rounded-t-sm shadow-md print:hidden">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-300">Bill {currentIndex + 1} of {bills.length}</span>
          <button 
            disabled={currentIndex <= 0}
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            className="p-1 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 cursor-pointer"
            title="Previous Bill"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            disabled={currentIndex >= bills.length - 1}
            onClick={() => setCurrentIndex(prev => Math.min(bills.length - 1, prev + 1))}
            className="p-1 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 cursor-pointer"
            title="Next Bill"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selector: Simple vs Detail & View Mode */}
        <div className="flex items-center gap-2">
          {/* View Toggle: Single vs All Bills */}
          <div className="flex items-center bg-slate-900 px-1 py-0.5 rounded border border-slate-700">
            <button
              onClick={() => setViewAll(false)}
              className={`px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer ${
                !viewAll ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Show one bill at a time with Prev/Next buttons"
            >
              Single
            </button>
            <button
              onClick={() => setViewAll(true)}
              className={`px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer ${
                viewAll ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Show all bills in a continuous scrolling list"
            >
              All Bills ({bills.length})
            </button>
          </div>

          <div className="flex items-center bg-slate-900 px-1 py-0.5 rounded border border-slate-700">
            <button
              onClick={() => setPrintMode('simple')}
              className={`px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer ${
                printMode === 'simple' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Simple
            </button>
            <button
              onClick={() => setPrintMode('detail')}
              className={`px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer ${
                printMode === 'detail' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Detail
            </button>
          </div>

          <button
            onClick={handlePrintCurrent}
            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded flex items-center gap-1 cursor-pointer"
            title="Print Current Bill Only"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          <button
            onClick={handleSendCurrentWhatsApp}
            disabled={isSendingWa || isSendingWaAll}
            className={`px-2.5 py-1 text-white font-bold rounded flex items-center gap-1 cursor-pointer transition-colors shadow-sm ${
              currentBillSent
                ? 'bg-green-600 hover:bg-green-500 disabled:bg-green-800 ring-2 ring-green-300'
                : 'bg-slate-600 hover:bg-slate-500 disabled:bg-slate-800'
            }`}
            title={currentBillSent ? 'Already sent on WhatsApp. Click to send again.' : 'Send this Bill on WhatsApp to this customer'}
          >
            {isSendingWa ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : currentBillSent ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{isSendingWa ? 'Sending...' : currentBillSent ? 'Sent - Send Again' : 'WhatsApp Bill'}</span>
          </button>

          <button
            onClick={handleSendAllWhatsApp}
            disabled={isSendingWa || isSendingWaAll}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-bold rounded flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
            title="Send WhatsApp Bills to all customers with valid phone numbers in this region"
          >
            {isSendingWaAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>
              {isSendingWaAll 
                ? (waProgress ? `Sending (${waProgress.sent}/${waProgress.total})...` : 'Sending All...')
                : `WhatsApp Bill (All ${bills.filter(b => b.phone && b.phone !== '---').length})${sentBillCount > 0 ? ` · ${sentBillCount} sent` : ''}`}
            </span>
          </button>

          <button
            onClick={handlePrintAll}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded flex items-center gap-1 cursor-pointer"
            title="Print / Save All Bills"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print All ({bills.length})</span>
          </button>
        </div>
      </div>

      {/* WhatsApp Status Alert Toast */}
      {waStatus && (
        <div className={`w-full max-w-2xl px-3 py-2 mb-2 rounded flex items-center gap-2 text-xs font-semibold ${
          waStatus.type === 'success' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800 border border-red-300'
        }`}>
          {waStatus.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{waStatus.message}</span>
        </div>
      )}

      {waCheckFailed && (
        <div className="w-full max-w-2xl px-3 py-2 mb-2 rounded flex items-center gap-2 text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Could not check which bills were already sent on WhatsApp, so repeat sends will not be detected.</span>
        </div>
      )}

      {/* Bills already sent: choose whether to include them in this batch */}
      {sendAllPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="wa-send-all-title" className="w-full max-w-md bg-white rounded shadow-2xl p-4 space-y-3 text-sm text-slate-900">
            <h3 id="wa-send-all-title" className="font-bold text-base">Some bills were already sent</h3>
            <p>
              <span className="font-bold text-green-700">{sendAllPrompt.sentBills.length}</span> bill(s) already sent on WhatsApp,{' '}
              <span className="font-bold">{sendAllPrompt.newBills.length}</span> not sent yet.
              <br />
              <span className="text-slate-600">({sendAllPrompt.sentBills.length} बिल पहले ही भेजे जा चुके हैं।)</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSendAllPrompt(null)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 font-bold rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => sendWhatsAppBatch([...sendAllPrompt.newBills, ...sendAllPrompt.sentBills])}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded cursor-pointer"
              >
                Send All Again ({sendAllPrompt.newBills.length + sendAllPrompt.sentBills.length})
              </button>
              <button
                type="button"
                disabled={sendAllPrompt.newBills.length === 0}
                onClick={() => sendWhatsAppBatch(sendAllPrompt.newBills)}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-300 disabled:cursor-default text-white font-bold rounded cursor-pointer"
              >
                Send Only New ({sendAllPrompt.newBills.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Bill Preview Frame */}
      <div 
        className="w-full flex justify-center py-4 bg-slate-100 overflow-x-auto rounded-b-sm border border-slate-300"
        style={{
          transform: `scale(${zoomLevel / 100})`,
          transformOrigin: 'top center'
        }}
      >
        {viewAll ? (
          <div className="flex flex-col items-center gap-6 w-full max-h-[80vh] overflow-y-auto px-4 py-2">
            {bills.map((b, idx) => (
              <div key={`${b.customer_id}-${idx}`} className="flex flex-col items-center">
                {renderSentBadge(b)}
                {renderBill(b, idx)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {renderSentBadge(currentBill)}
            {renderBill(currentBill, currentIndex)}
          </div>
        )}
      </div>

      {/* Off-screen render surface used only during bulk WhatsApp sending.
          Each bill is rendered here and rasterized in the browser so Devanagari
          (Hindi) renders from the browser's fonts instead of tofu boxes. */}
      {captureChunk && (
        <div
          aria-hidden
          style={{ position: 'fixed', left: '-99999px', top: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}
        >
          {captureChunk.map((b, idx) => renderBill(b, idx, true))}
        </div>
      )}
    </div>
  );
};
