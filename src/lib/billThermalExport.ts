import { BillRecord, BillPrintMode, BOY_LOGO_B64 } from './bill4in1Export';
import { getReliableHindiName } from './transliteration';
import { billRoundOff, formatRoundOff, roundToFoxProRule } from './billingEngine';
import { generateDynamicUpiQrSvg } from './upiQrHelper';
import hindiPubDisplayMapJson from '@/data/hindiPubDisplayMap.json';
import englishPubSetJson from '@/data/englishPubSet.json';

const HINDI_PUB_DISPLAY_MAP: Record<string, string> = hindiPubDisplayMapJson;
const ENGLISH_PUB_SET: Set<string> = new Set(englishPubSetJson);

export function getThermalPublicationDisplayName(rawName: string | undefined | null): string {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();

  // 1. If it's a known English publication, keep it in English!
  if (ENGLISH_PUB_SET.has(lower)) {
    return trimmed;
  }

  // 2. If it's in our Hindi publication display map, return the authentic Hindi name
  if (HINDI_PUB_DISPLAY_MAP[lower]) {
    return HINDI_PUB_DISPLAY_MAP[lower];
  }

  // 3. If it already contains Devanagari Hindi characters, keep it as is
  if (/[\u0900-\u097F]/.test(trimmed)) {
    return trimmed;
  }

  // 4. Default: keep English name intact so English papers don't get wrongly transliterated
  return trimmed;
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

function cleanPhone(p: string | undefined | null): string {
  if (!p || p === '---') return '';
  const digits = String(p).replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return String(p).trim();
}

/**
 * Renders HTML for a single modern professional Thermal Bill receipt
 * Exactly matching the layout, typography, borders, and QR payment card shown in the reference bill.
 */
export function renderSingleThermalBillHtml(b: BillRecord, printMode: BillPrintMode = 'simple'): string {
  let displayHindi = getReliableHindiName(b.customer_hindi || '', b.customer_name);
  const cleanEngName = (b.customer_name || '').replace(/\s+crd\b/i, '').trim();

  // If Hindi contains "CRD" or suffix, clean it up cleanly
  if (displayHindi) {
    displayHindi = displayHindi.replace(/\s+सीआरडी\b/i, '').replace(/\s+CRD\b/i, '').trim();
  }

  const items = b.items || [];
  const totalDelivery = b.delivery_charge || 0;

  let itemsRowsHtml = '';

  if (printMode === 'simple') {
    const pubConsolidatedMap = new Map<string, {
      pub_name: string;
      totalQty: number;
      paperAmount: number;
      deliveryAmount: number;
    }>();

    const hasItemDelivery = items.some(it => (it.delivery_amount || 0) > 0);

    items.forEach((it, idx) => {
      const pubDisplayName = getThermalPublicationDisplayName(it.pub_name);
      const pubKey = pubDisplayName.toLowerCase();
      const qty = Number(it.days !== undefined && it.days > 0 ? it.days : (it.qty || 1));
      
      let itemDelivery = 0;
      if (hasItemDelivery) {
        itemDelivery = it.delivery_amount || 0;
      } else if (totalDelivery > 0 && idx === 0) {
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

    itemsRowsHtml = displayItems.length > 0
      ? displayItems.map(it => `
          <div class="line-item-row">
            <span class="col-part">${it.pub_name}</span>
            <span class="col-days">${it.totalQty}</span>
            <span class="col-amt">${formatMoney(it.totalAmount)}</span>
          </div>
        `).join('')
      : `
          <div class="line-item-row">
            <span class="col-part">समाचार पत्र / मासिक</span>
            <span class="col-days">30</span>
            <span class="col-amt">${formatMoney(monthBillAmount)}</span>
          </div>
        `;
  } else {
    itemsRowsHtml = items.length > 0
      ? items.map(it => {
          const qtyOrDays = it.days !== undefined && it.days > 0 ? it.days : (it.qty || 1);
          const pubDisplayName = getThermalPublicationDisplayName(it.pub_name);
          return `
            <div class="line-item-row">
              <span class="col-part">${pubDisplayName}</span>
              <span class="col-days">${qtyOrDays}</span>
              <span class="col-amt">${formatMoney(roundToFoxProRule(it.amount))}</span>
            </div>
          `;
        }).join('')
      : `
          <div class="line-item-row">
            <span class="col-part">समाचार पत्र / मासिक</span>
            <span class="col-days">30</span>
            <span class="col-amt">${formatMoney(roundToFoxProRule(b.paper_amount || 0))}</span>
          </div>
        `;
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

  const rawQrSvg = generateDynamicUpiQrSvg(netPayable, b.bill_no || b.customer_id, `${b.month || ''} ${b.year || ''}`.trim(), 120, 0);

  return `
    <div class="bill-card">
      
      <!-- Agency Header -->
      <div class="agency-header">
        <div class="agency-name-en">ARYAN NEWS AGENCY</div>
        <div class="agency-name-hi">आर्यन न्यूज़ एजेंसी</div>
        <div class="agency-address">5(1), Old Bus Stand, Beawar (Raj.) 305901</div>
        <div class="agency-contact">WhatsApp: 9462558949 | Ph: 9829058949</div>
        <div class="agency-web">www.aryannewsagency.com</div>
      </div>

      <!-- Solid Top Rule -->
      <div class="solid-rule-thick"></div>

      <!-- Meta Info Grid (Bill No, Month, A/c No) -->
      <div class="meta-grid">
        <div class="meta-row">
          <div class="meta-cell"><span class="meta-label">Bill No:</span> <span class="meta-val">${b.bill_no || b.customer_id}</span></div>
          <div class="meta-cell text-right"><span class="meta-label">Month:</span> <span class="meta-val">${monthYearDisplay}</span></div>
        </div>
        <div class="meta-row">
          <div class="meta-cell"><span class="meta-label">A/c No:</span> <span class="meta-val">${b.customer_id}</span></div>
        </div>
      </div>

      <!-- Dashed Divider -->
      <div class="dashed-divider"></div>

      <!-- Customer Details Section -->
      <div class="customer-section">
        <div class="customer-name-en">${cleanEngName}</div>
        ${displayHindi ? `<div class="customer-name-hi">${displayHindi}</div>` : ''}
        <div class="customer-sub-row">
          <span>Region: ${b.region_name || b.region_id}</span>
          ${formattedPhone ? `<span>Mob: ${formattedPhone}</span>` : ''}
        </div>
      </div>

      <!-- Dashed Divider -->
      <div class="dashed-divider"></div>

      <!-- Particulars Table Header -->
      <div class="items-header-row">
        <span class="col-part">विवरण / Particular</span>
        <span class="col-days">Days</span>
        <span class="col-amt">Amount ₹</span>
      </div>

      <!-- Dashed Divider -->
      <div class="dashed-divider" style="margin-top: 3px; margin-bottom: 5px;"></div>

      <!-- Publication Line Items -->
      <div class="items-container">
        ${itemsRowsHtml}
      </div>

      <!-- Dashed Divider -->
      <div class="dashed-divider"></div>

      <!-- Summary Breakdown (Current Month / Previous Due) -->
      <div class="summary-section">
        <div class="summary-row">
          <span class="summary-label">Current / इस माह</span>
          <span class="summary-value">₹ ${formatMoney(monthBillAmount)}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Prev. Due / बकाया</span>
          <span class="summary-value">₹ ${formatMoney(previousDue)}</span>
        </div>
        ${b.paid_amount ? `
        <div class="summary-row">
          <span class="summary-label">Paid / जमा</span>
          <span class="summary-value">- ₹ ${formatMoney(b.paid_amount)}</span>
        </div>` : ''}
        ${roundOff !== 0 ? `
        <div class="summary-row">
          <span class="summary-label">Round Off</span>
          <span class="summary-value">${formatRoundOff(roundOff)}</span>
        </div>` : ''}
      </div>

      <!-- Boxed TOTAL / कुल देय Banner -->
      <div class="total-banner-box">
        <div class="total-label-left">${netPayable < 0 ? 'ADVANCE / अग्रिम जमा' : 'TOTAL / कुल देय'}</div>
        <div class="total-amount-right">${netPayable < 0 ? `-₹ ${formatMoney(Math.abs(netPayable))}` : `₹ ${formatMoney(netPayable)}`}</div>
      </div>

      <!-- Dynamic UPI QR Payment Section -->
      ${netPayable > 0 ? `
      <div class="qr-payment-section">
        <div class="qr-code-wrapper">
          ${rawQrSvg}
        </div>
        <div class="qr-title-en">Scan &amp; Pay ₹${Math.round(netPayable)} via any UPI app</div>
        <div class="qr-subtitle-hi">किसी भी UPI ऐप से स्कैन कर भुगतान करें</div>
      </div>
      ` : `
      <div class="qr-payment-section" style="padding: 8px 4px; border: 1px dashed #059669; border-radius: 4px; margin: 6px 0; background-color: #f0fdf4; text-align: center;">
        <div style="font-size: 11px; font-weight: 800; color: #065f46;">
          ${netPayable < 0 ? `अग्रिम जमा राशि: ₹${formatMoney(Math.abs(netPayable))}` : 'बिल पूर्ण चुकता (Nil Balance)'}
        </div>
        <div style="font-size: 9.5px; color: #475569; margin-top: 3px;">
          ${netPayable < 0 ? 'कोई भुगतान देय नहीं है (No Payment Required)' : 'इस माह कोई राशि देय नहीं है'}
        </div>
      </div>
      `}

      <!-- Dashed Divider -->
      <div class="dashed-divider"></div>

      <!-- Footer Policy & Thank You Notice -->
      <div class="footer-notice">
        <div class="footer-due-line">कृपया बिल की राशि 5 तारीख तक जमा करें।</div>
        <div class="footer-ss-line">भुगतान के बाद स्क्रीनशॉट व्हाट्सएप पर भेजें।</div>
        <div class="footer-query-line">Queries: WhatsApp 9462558949</div>
        <div class="footer-wrong-number-line">यदि यह बिल आपका नहीं है, तो कृपया इसे अनदेखा करें और व्हाट्सएप पर केवल "यह मेरा बिल नहीं है" लिखकर भेज दें।</div>
        <div class="footer-thanks-line">धन्यवाद!</div>
      </div>

    </div>
  `;
}

// The 58mm slip design, shared by the monthly bills and the due reminder slips
export const THERMAL_58MM_CSS = `
    @charset "utf-8";

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans Devanagari", sans-serif;
      color: #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 0;
    }

    /* Print toolbar */
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      width: 100%;
      max-width: 440px;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 16px;
      margin-bottom: 18px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .btn-action {
      font-family: inherit;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      border: none;
      transition: background-color 0.15s ease;
    }

    .btn-print {
      background: #2563eb;
      color: #fff;
    }
    .btn-print:hover { background: #1d4ed8; }

    .btn-close {
      background: #475569;
      color: #fff;
      margin-left: 8px;
    }
    .btn-close:hover { background: #334155; }

    .receipts-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }

    /* Main Bill Card: strictly sized for 58mm POS thermal printers (printable printable width 48mm, total roll 58mm) */
    .bill-card {
      width: 48mm;
      max-width: 48mm;
      background: #ffffff;
      padding: 2mm 1mm;
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      border: 1px solid #e2e8f0;
      box-sizing: border-box;
      page-break-inside: avoid;
      color: #000000;
      text-align: center;
      margin: 0 auto;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Festive Diwali Banner */
    .diwali-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-bottom: 6px;
      padding: 3px 6px;
      border: 1px solid #f59e0b;
      background-color: #fffbeb;
      border-radius: 3px;
    }

    .diwali-text {
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.5px;
      color: #92400e;
    }

    .diwali-diya {
      vertical-align: middle;
      flex-shrink: 0;
    }

    /* Header Section */
    .agency-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      text-align: center;
      width: 100%;
    }

    .agency-name-en {
      font-size: 13.5px;
      font-weight: 900;
      letter-spacing: 0.3px;
      color: #000;
      line-height: 1.15;
      white-space: nowrap;
    }

    .agency-name-hi {
      font-size: 12px;
      font-weight: 800;
      color: #000;
      margin-top: 1px;
      line-height: 1.15;
    }

    .agency-address {
      font-size: 8.5px;
      font-weight: 700;
      color: #000;
      margin-top: 2px;
      line-height: 1.2;
    }

    .agency-contact {
      font-size: 8.5px;
      font-weight: 700;
      color: #000;
      margin-top: 1px;
      line-height: 1.2;
    }

    .agency-web {
      font-size: 8.5px;
      font-weight: 700;
      color: #000;
      margin-top: 1px;
      line-height: 1.2;
    }

    .solid-rule-thick {
      width: 100%;
      height: 1.8px;
      background: #000000;
      margin: 6px 0 6px 0;
    }

    /* Pill Badge */
    .pill-badge-container {
      display: flex;
      justify-content: center;
      margin-bottom: 4px;
    }

    .pill-badge {
      display: inline-block;
      padding: 2.5px 12px;
      border: 1.2px solid #000000;
      border-radius: 9999px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.3px;
      color: #000;
      background: #ffffff;
    }

    /* Meta Grid */
    .meta-grid {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 4px;
      margin-bottom: 6px;
      font-size: 10.5px;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }

    .meta-cell {
      text-align: left;
      white-space: nowrap;
    }

    .text-right {
      text-align: right;
      white-space: nowrap;
    }

    .meta-label {
      font-weight: 700;
      color: #000;
    }

    .meta-val {
      font-weight: 900;
      color: #000;
    }

    /* Dashed Divider */
    .dashed-divider {
      width: 100%;
      border-top: 1.2px dashed #000000;
      margin: 8px 0;
    }

    /* Customer Section */
    .customer-section {
      text-align: left;
      margin-bottom: 8px;
    }

    .customer-name-en {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.3px;
      color: #000;
      text-transform: uppercase;
      line-height: 1.2;
    }

    .customer-name-hi {
      font-size: 12.5px;
      font-weight: 800;
      color: #000;
      margin-top: 2px;
      line-height: 1.2;
    }

    .customer-sub-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 700;
      color: #000;
      margin-top: 3px;
    }

    /* Items Table */
    .items-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 800;
      color: #000;
    }

    .items-container {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .line-item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 600;
      color: #000;
    }

    .col-part {
      flex: 2;
      text-align: left;
    }

    .col-days {
      flex: 1;
      text-align: center;
    }

    .col-amt {
      flex: 1;
      text-align: right;
      font-weight: 700;
    }

    /* Summary Section */
    .summary-section {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 10px;
      margin-bottom: 8px;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      color: #222;
      width: 100%;
    }

    .summary-label {
      text-align: left;
      font-size: 10px;
      line-height: 1.2;
    }

    .summary-value {
      text-align: right;
      font-weight: 800;
      color: #000;
      white-space: nowrap;
      font-size: 10.5px;
      margin-left: 4px;
    }

    /* Total Banner Box */
    .total-banner-box {
      border: 1.4px solid #000000;
      border-radius: 6px;
      padding: 5px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      background: #ffffff;
      white-space: nowrap;
    }

    .total-label-left {
      font-size: 12px;
      font-weight: 900;
      color: #000;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }

    .total-amount-right {
      font-size: 14px;
      font-weight: 900;
      color: #000;
      white-space: nowrap;
    }

    /* QR Payment Section */
    .qr-payment-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 12px;
    }

    .qr-code-wrapper {
      width: 105px;
      height: 105px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 6px;
    }

    .qr-code-wrapper svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .qr-title-en {
      font-size: 11px;
      font-weight: 800;
      color: #000;
      line-height: 1.3;
    }

    .qr-subtitle-hi {
      font-size: 10px;
      font-weight: 600;
      color: #333;
      margin-top: 1.5px;
      line-height: 1.3;
    }

    /* Footer Notice */
    .footer-notice {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2.5px;
      font-size: 9.5px;
      color: #000;
      line-height: 1.4;
    }

    .footer-due-line {
      font-weight: 800;
      color: #000;
    }

    .footer-ss-line {
      font-weight: 700;
      color: #000;
      font-size: 9px;
    }

    .footer-query-line {
      font-weight: 700;
      color: #000;
    }

    .footer-wrong-number-line {
      color: #dc2626;
      font-weight: 800;
      font-size: 12px;
      line-height: 1.4;
      text-align: center;
      margin: 4px 0 2px;
      padding: 4px 6px;
      border: 1.5px solid #dc2626;
      border-radius: 6px;
      background: #fef2f2;
    }

    .footer-thanks-line {
      font-weight: 900;
      font-size: 11px;
      color: #000;
      margin-top: 2px;
    }

    /* Print Rules */
    @media print {
      body {
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
        width: 100% !important;
        display: block !important;
      }

      .no-print, .print-toolbar {
        display: none !important;
      }

      .receipts-container {
        gap: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
        width: 100% !important;
      }

      .bill-card {
        box-shadow: none !important;
        border: none !important;
        padding: 1mm 0.5mm !important;
        margin: 0 !important;
        width: 48mm !important;
        max-width: 48mm !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: always;
        break-after: page;
      }

      .page-break {
        page-break-after: always;
        break-after: page;
        height: 0;
        margin: 0;
        padding: 0;
      }

      @page {
        size: 58mm auto;
        margin: 0mm;
      }
    }
`;

/**
 * Full HTML page for printing continuous roll or exporting PDF
 */
export function generateThermal58mmFullHtml(
  bills: BillRecord[],
  title: string = 'Aryan News Agency - Monthly Bills',
  printMode: BillPrintMode = 'simple'
): string {
  const receiptsHtml = bills.map((b) => renderSingleThermalBillHtml(b, printMode)).join('\n<div class="page-break"></div>\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
${THERMAL_58MM_CSS}
  </style>
</head>
<body>

  <!-- Top Action Toolbar -->
  <div class="print-toolbar no-print">
    <div>
      <div style="font-weight: bold; font-size: 13px;">🧾 Aryan News Agency - Bill Print</div>
      <div style="font-size: 11px; opacity: 0.85;">Total ${bills.length} Bill${bills.length > 1 ? 's' : ''}</div>
    </div>
    <div>
      <button class="btn-action btn-print" onclick="window.print()">Print / Save PDF</button>
      <button class="btn-action btn-close" onclick="window.close()">Close</button>
    </div>
  </div>

  <div class="receipts-container">
    ${receiptsHtml}
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 400);
    });
  </script>

</body>
</html>`;
}

/**
 * Triggers printing of thermal bills in new professional format
 */
export function printBillsThermal58mm(
  bills: BillRecord[],
  title: string = 'Aryan News Agency - Monthly Bills',
  printMode: BillPrintMode = 'simple'
): void {
  if (!bills || bills.length === 0) {
    alert('No bills available to print.');
    return;
  }

  const html = generateThermal58mmFullHtml(bills, title, printMode);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '96mm';
    iframe.style.height = '150mm';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 500);
    }
  }
}


// ---------------------------------------------------------------------------------------------
// Due reminder slips: the payment reminder each customer gets on WhatsApp, drawn as a 58mm slip
// in the same design as the monthly bill, for the due list screen and for printing.

export interface ReminderSlip {
  customerId: number;
  priority?: number | string;
  name: string;
  nameHindi?: string;
  region?: string;
  phone?: string;
  date: string;
  balance: number;
  lastBillMonth?: string;
  papers: { name: string; amount: number }[];
  // Screen only: the reminder status line and whether it can be sent now
  status?: string;
  statusColor?: string;
  canSend?: boolean;
  note?: string;
}

function slipEsc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderThermalReminderHtml(r: ReminderSlip): string {
  const papers = r.papers.filter(p => Math.abs(p.amount) >= 0.005);
  const papersTotal = Math.round(papers.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const rest = Math.round((r.balance - papersTotal) * 100) / 100;
  const lines = papers.map(p => `
          <div class="line-item-row">
            <span class="col-part">${slipEsc(getThermalPublicationDisplayName(p.name))}</span>
            <span class="col-amt">${formatMoney(p.amount)}</span>
          </div>`).join('');
  const restLine = Math.abs(rest) < 0.005 ? '' : rest > 0
    ? `<div class="summary-row"><span class="summary-label">${papers.length ? 'पिछला बकाया' : 'बकाया'}</span><span class="summary-value">₹ ${formatMoney(rest)}</span></div>`
    : `<div class="summary-row"><span class="summary-label">जमा राशि (Paid)</span><span class="summary-value">- ₹ ${formatMoney(-rest)}</span></div>`;
  const qr = r.balance > 0 ? generateDynamicUpiQrSvg(r.balance, r.customerId, '', 120, 0) : '';

  return `
    <div class="bill-card">
      <div class="agency-header">
        <div class="agency-name-en">ARYAN NEWS AGENCY</div>
        <div class="agency-name-hi">आर्यन न्यूज़ एजेंसी</div>
        <div class="agency-address">5(1), Old Bus Stand, Beawar (Raj.) 305901</div>
        <div class="agency-contact">WhatsApp: 9462558949 | Ph: 9829058949</div>
      </div>
      <div class="solid-rule-thick"></div>
      <div class="pill-badge-container"><span class="pill-badge">पेमेंट रिमाइंडर</span></div>
      <div class="meta-grid">
        <div class="meta-row">
          <div class="meta-cell"><span class="meta-label">A/c No:</span> <span class="meta-val">${r.customerId}</span></div>
          <div class="meta-cell text-right"><span class="meta-label">Date:</span> <span class="meta-val">${slipEsc(r.date)}</span></div>
        </div>
      </div>
      <div class="dashed-divider"></div>
      <div class="customer-section">
        ${r.nameHindi ? `<div class="customer-name-hi">${slipEsc(r.nameHindi)}</div>` : ''}
        <div class="customer-name-en">${slipEsc(r.name.toUpperCase())}</div>
        <div class="customer-sub-row">
          <span>Region: ${slipEsc(r.region || '')}</span>
          ${r.phone ? `<span>Mob: ${slipEsc(r.phone)}</span>` : ''}
        </div>
      </div>
      <div class="dashed-divider"></div>
      <div class="items-header-row">
        <span class="col-part">अखबार${r.lastBillMonth && papers.length ? ` (${slipEsc(r.lastBillMonth)})` : ''}</span>
        <span class="col-amt">Amount ₹</span>
      </div>
      <div class="dashed-divider" style="margin-top: 3px; margin-bottom: 5px;"></div>
      <div class="items-container">${lines}</div>
      ${restLine ? `<div class="dashed-divider"></div><div class="summary-section">${restLine}</div>` : ''}
      <div class="total-banner-box">
        <div class="total-label-left">${r.balance < 0 ? 'ADVANCE / अग्रिम जमा' : 'कुल बकाया / DUE'}</div>
        <div class="total-amount-right">₹ ${formatMoney(Math.abs(r.balance))}</div>
      </div>
      ${qr ? `
      <div class="qr-payment-section">
        <div class="qr-code-wrapper">${qr}</div>
        <div class="qr-title-en">Scan &amp; Pay ₹${Math.round(r.balance)} via any UPI app</div>
        <div class="qr-subtitle-hi">किसी भी UPI ऐप से स्कैन कर भुगतान करें</div>
      </div>` : ''}
      <div class="dashed-divider"></div>
      <div class="footer-notice">
        <div class="footer-due-line">कृपया शीघ्र भुगतान करें। भुगतान के बाद स्क्रीनशॉट भेजें।</div>
        <div style="margin: 5px 0; padding: 4px 3px; border: 1.5px solid #B91C1C; border-radius: 3px; background: #FEF2F2; color: #B91C1C; font-weight: 900; font-size: 10.5px; line-height: 1.3;">यदि भुगतान कर चुके हैं तो कृपया ध्यान न दें।</div>
        <div class="footer-thanks-line">धन्यवाद!</div>
      </div>
    </div>`;
}

/**
 * The reminder slips as a page. For the screen (print false) the slips sit side by side, each
 * with its reminder status and Reminder / Paid buttons, which tell the screen around it what
 * was pressed. For printing they run one under another on the 58mm roll.
 */
export function reminderSlipsPageHtml(slips: ReminderSlip[], forPrint: boolean): string {
  const cards = slips.map(r => forPrint ? renderThermalReminderHtml(r) : `
    <div class="slip-wrap">
      <div class="slip-top">${r.priority ? `<b>${slipEsc(r.priority)}</b> · ` : ''}#${r.customerId}</div>
      ${renderThermalReminderHtml(r)}
      ${r.note ? `<div class="slip-note">${slipEsc(r.note)}</div>` : ''}
      <div class="slip-actions">
        <button class="sa-remind" data-act="remind" data-id="${r.customerId}" ${r.canSend ? '' : 'disabled'}>रिमाइंडर</button>
        <button class="sa-paid" data-act="paid" data-id="${r.customerId}">Paid</button>
      </div>
      ${r.status ? `<div class="slip-status" style="color:${slipEsc(r.statusColor || '#475569')}">${slipEsc(r.status)}</div>` : ''}
    </div>`).join(forPrint ? '\n<div class="page-break"></div>\n' : '');

  const screenCss = `
    body { padding: 8px 0 !important; }
    .receipts-container { flex-direction: row !important; flex-wrap: wrap; justify-content: center; align-items: flex-start; gap: 14px !important; }
    .slip-wrap { display: flex; flex-direction: column; align-items: center; }
    .slip-wrap .bill-card { width: 62mm; max-width: 62mm; }
    .slip-top { font-size: 11px; color: #334155; margin-bottom: 3px; }
    .slip-note { font-size: 10px; color: #92400e; margin-top: 4px; max-width: 62mm; text-align: center; }
    .slip-actions { display: flex; gap: 6px; margin-top: 5px; }
    .slip-actions button { font: 700 11px sans-serif; padding: 3px 10px; cursor: pointer; color: #fff; }
    .sa-remind { background: #25D366; border: 1px solid #128C7E; }
    .sa-remind:disabled { opacity: .4; cursor: default; }
    .sa-paid { background: #0A246A; border: 1px solid #000; }
    .slip-status { font-size: 10px; font-weight: 700; margin-top: 3px; }`;

  return `<!DOCTYPE html>
<html lang="hi"><head><meta charset="UTF-8"><title>पेमेंट रिमाइंडर</title>
<style>
${THERMAL_58MM_CSS}
${forPrint ? '' : screenCss}
</style></head>
<body>
  <div class="receipts-container">${cards || '<div style="padding:24px;font:14px sans-serif">कोई बकाया नहीं</div>'}</div>
  <script>
    ${forPrint
      ? "window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });"
      : `document.addEventListener('click', function (e) {
          var b = e.target.closest('button[data-act]');
          if (b && !b.disabled) parent.postMessage({ dueSlip: b.getAttribute('data-act'), id: Number(b.getAttribute('data-id')) }, '*');
        });
        // The slips' own height, not the page's: the page is never shorter than the frame, so it would never shrink
        function size() { var c = document.querySelector('.receipts-container'); parent.postMessage({ dueSlipHeight: Math.ceil(c ? c.getBoundingClientRect().bottom : document.body.scrollHeight) + 8 }, '*'); }
        window.addEventListener('load', size); window.addEventListener('resize', size); setTimeout(size, 300);`}
  </script>
</body></html>`;
}

export function printReminderSlips(slips: ReminderSlip[]): void {
  if (!slips.length) { alert('कोई बकाया नहीं।'); return; }
  const html = reminderSlipsPageHtml(slips, true);
  const win = window.open('', '_blank');
  if (!win) { alert('प्रिंट विंडो नहीं खुली। ब्राउज़र में पॉप-अप की अनुमति दें।'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
