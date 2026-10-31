import { getReliableHindiName } from '@/lib/transliteration';
import { roundToFoxProRule } from '@/lib/billingEngine';
import { BOY_LOGO_B64 } from './logoBase64';

export { BOY_LOGO_B64 };

export const SIGNATURE_GLYPH_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAATCAYAAAD1Yd/KAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAEOklEQVR4nM2Wa0ybZRTH/0/7ti+9cJPrBlNEWmSwAh23MYiMAmOggCBhsH1gmOgHZzT6wS8m+smYuH0yhsRkxmSOTDAMcTDG/SKjdGNjRJgMWhjj2gJtZV1LafsYXmLd0mh0YOL59p7zf8/55Tznfc9DKKX4PxjzT0Q9N+/R4aFBzD3QwWp5DJeTID4uHjFxMTihSiV7AUL+riON3SO0s6sbOq0WxOVCjDwS4fvDsG4ww2g0wbC6jleyj+KdmjLyn3Xkk3MX6JBmFLNzDxAaEoCUZCXOffzuUwXf/+hL2tOnhsjbh9aU55I9BWntGqHXuwZwra0TDCtGVKQcByJCIGAZXGhspW+WFnAF66+O0A2rFRMTOlBeH7yEXrSqOJPsGciAWg39yiqkUikSE5QoqyhFwdEo0qK+Q8fHf8EX31yi1CXAjG4e/sGB8A8MgFY7g8H+QVQVZz4rB3hPPnz46efUBSeSUuMhiwpHQX4mB7EdK0xLJNtdaWz+Ed0/9yM2MR7pGWmIiAyH6lg6eMSFi3VX6K5Bvr54md65OwplshISsQCpKQqUFRx5qtUiiQ+cRIhDCck4W64ik9P3IJUKUFiYC7nsBYyNjWLXIB0dXQjdH4aKvAwyMzuNfaEBHuKpyUVIRaGQy+LRMDBF5xfmcCQ9CdkpchIY4A2tVotdzch331+hBoMBH9S8xTk3zEZUlhR6DN5tzTicfBazMw+xuDCLmKgDqC7e+VocDgesVuvuQGa0OkTL5CjKSiaN7TeokBF4CFt6J+ia3ozlVSN4FIiNfRFJh5XuuH5lHWKJ7+5ALJYNKOMTOIft0QZ+M5k9hIVZB8lnUjE1mUyQRYahtDgf2QkR7q7N6BYRe1DxrwHaOzuo3W7fAWFZFiIxywX8fMVwOWweLzT8pKb+3iwOF6lQVJoLlfJPiPqmG/T+1EMUvprj1rf1DFOb5RFW1/QwGo3csTm3HHA6nSCEghHwIRKy8BIxkEgkOyASkQhmo4lLUKDKJFebm+m3lxto9clyrlhdUztt7+yHzW5GUrICOUnRbojrA7dob/8Afr0/CUkfD/qVObq5aQPD8MBnCCwWCwR8Hvdf8vPzQVBQEE5XvuExfxxIzMuHoNFo3M6cvAJs75ju3iEaEBwERsDCsLaMLecm2trbobl1m7q2HFjRL2F5cYkrUH2mAkmJcfBi+chTZZBnXnrnz39FI2VReL3oOJeka3CMzi8swfc5X5TkpJGm7iG6vKyHUCCGzUoxPHwTGvUwIl96HqerylBZcmxXu8YNUnepng4NqxElj8Z7Z9/+y6Q/tPbTsbsT0E7PIjgwCPkncnE8S0H29BpQW1tLtbpZUMpDUMg+8Bkh7Fs22J12OBxbsFgew+kgYPgsFIoEnDn12p7cRTxA/rCWlmt01bAOy/akOx1wERdYVgBvb2+cqji5Z8WftN8BEKm5grAeqA0AAAAASUVORK5CYII=';

export type BillPrintMode = 'detail' | 'simple';

export interface BillItem {
  sno: number;
  pub_name: string;
  circulation?: string;
  qty: number;
  days?: number;
  rate: number;
  amount: number;
  net_amount?: number;
  delivery_amount?: number;
}

export interface BillRecord {
  bill_no: string | number;
  bill_date?: string;
  customer_id: number;
  priority?: number;
  customer_name: string;

  customer_hindi?: string;
  address?: string;
  phone?: string;
  region_id: number;
  region_name: string;
  month: string;
  year: number | string;
  items: BillItem[];
  paper_amount: number;
  delivery_charge: number;
  discount_amount?: number;
  current_bill?: number;
  previous_due: number;
  paid_amount?: number;
  advance?: number;
  net_payable: number;
}

function formatMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '0.00';
  return Number(n).toFixed(2);
}

/**
 * Generates the HTML for one single bill quadrant (1/4 of A4)
 * Exactly matching media_1790483652507.jpg
 * In 'simple' mode: Delivery charge is merged directly into publication item prices, delivery row is 0.00
 * In 'detail' mode: Paper prices are pure and delivery charge is shown separately in the summary box
 */
export function renderSingleBillHtml(b: BillRecord, qIndex: number, printMode: BillPrintMode = 'simple'): string {
  const displayHindi = getReliableHindiName(b.customer_hindi || '', b.customer_name);
  
  // Format items: display actual rows, and pad with empty rows up to 4 items so layout stays 100% aligned
  const minRows = 4;
  const items = b.items || [];
  const rowsHtml: string[] = [];

  let displayItems: Array<{
    pub_name: string;
    qtyOrDays: number | string;
    rate: number | null;
    amount: number;
  }> = [];

  if (printMode === 'simple') {
    // Consolidate rows for the same publication into 1 line, sum quantities & amounts, and omit rate
    const pubConsolidatedMap = new Map<string, {
      pub_name: string;
      totalQty: number;
      paperAmount: number;
      deliveryAmount: number;
    }>();

    const hasItemDelivery = items.some(it => (it.delivery_amount || 0) > 0);
    const totalDelivery = b.delivery_charge || 0;

    items.forEach((it, idx) => {
      const cleanPub = it.pub_name.trim();
      const pubKey = cleanPub.toLowerCase();
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
          pub_name: cleanPub,
          totalQty: qty,
          paperAmount: it.net_amount ?? it.amount,
          deliveryAmount: itemDelivery
        });
      }
    });

    displayItems = Array.from(pubConsolidatedMap.values()).map(entry => ({
      pub_name: entry.pub_name,
      qtyOrDays: entry.totalQty,
      rate: null, // Omit rate in simple mode
      amount: roundToFoxProRule(entry.paperAmount + entry.deliveryAmount)
    }));
  } else {
    // Detail Mode: keep separate rate lines with pure paper rate & amounts
    displayItems = items.map(it => {
      const qtyOrDays = it.days !== undefined && it.days > 0 ? it.days : (it.qty || 1);
      return {
        pub_name: it.pub_name,
        qtyOrDays,
        rate: it.rate,
        amount: roundToFoxProRule(it.amount)
      };
    });
  }

  for (let i = 0; i < Math.max(displayItems.length, minRows); i++) {
    if (i < displayItems.length) {
      const it = displayItems[i];
      rowsHtml.push(`
        <tr class="item-row">
          <td class="col-part">${it.pub_name}</td>
          <td class="col-qty">${it.qtyOrDays}</td>
          <td class="col-rate">${it.rate !== null && it.rate !== undefined ? formatMoney(it.rate) : '&nbsp;'}</td>
          <td class="col-amt">${formatMoney(it.amount)}</td>
        </tr>
      `);
    } else {
      // Empty filler row
      rowsHtml.push(`
        <tr class="item-row empty-row">
          <td class="col-part">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-rate">&nbsp;</td>
          <td class="col-amt">&nbsp;</td>
        </tr>
      `);
    }
  }

  // Quadrant cut guideline classes
  const isLeft = qIndex % 2 === 0;
  const isTop = qIndex < 2;
  const quadrantClass = `bill-quadrant ${isLeft ? 'quad-left' : 'quad-right'} ${isTop ? 'quad-top' : 'quad-bottom'}`;

  const discountAmount = roundToFoxProRule(b.discount_amount || 0);
  const summaryPaperTotal = printMode === 'simple'
    ? roundToFoxProRule(Math.max(0, b.paper_amount + (b.delivery_charge || 0) - discountAmount))
    : roundToFoxProRule(Math.max(0, b.paper_amount - discountAmount));

  const summaryDelivery = printMode === 'simple'
    ? 0
    : roundToFoxProRule(b.delivery_charge || 0);

  return `
    <div class="${quadrantClass}">
      <!-- TOP HEADER -->
      <div class="bill-header">
        <div class="logo-box">
          <img src="${BOY_LOGO_B64}" class="agency-logo" alt="logo" />
        </div>
        <div class="agency-info">
          <div class="agency-title">
            ARYAN NEWS AGENCY<span class="reg-mark">®</span>
          </div>
          <div class="agency-sub">5 Old Bus stand Beawar</div>
          <div class="agency-sub">Ph: 9462558949, 9829058949</div>
        </div>
      </div>

      <!-- S.NO / BILL NO / AC.NO / REGION / MONTH BAR -->
      <div class="bill-meta">
        <div class="meta-row">
          <div class="meta-left">
            <span class="meta-lbl">Bill No:</span>
            <span class="meta-val"><b>${b.bill_no || b.customer_id}</b></span>
          </div>
          <div class="meta-right">
            <span class="meta-lbl">Month:</span>
            <span class="meta-val"><b>${b.month} ${b.year}</b></span>
          </div>
        </div>

        <div class="meta-row">
          <div class="meta-left">
            <span class="meta-lbl">Ac.no.:</span>
            <span class="meta-val"><b>${b.customer_id}</b></span>
          </div>
          <div class="meta-right">
            <span class="meta-lbl">Region:</span>
            <span class="meta-val"><b>${b.region_name}</b></span>
          </div>
        </div>

        <div class="meta-row" style="margin-top: 1px;">
          <div class="meta-left" style="max-width: 100%;">
            <span class="meta-lbl">Customer:</span>
            <span class="meta-val"><b>${b.customer_name}</b> ${displayHindi ? `<span class="hindi-name">(${displayHindi})</span>` : ''} ${b.priority ? `| Pr: ${b.priority}` : ''}</span>
          </div>
        </div>
      </div>

      <!-- PARTICULARS TABLE -->
      <div class="table-wrap">
        <table class="bill-table">
          <thead>
            <tr>
              <th class="col-part">PARTICULARS</th>
              <th class="col-qty">QTY.</th>
              <th class="col-rate">RATE</th>
              <th class="col-amt">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml.join('')}
          </tbody>
        </table>
      </div>

      <!-- BOTTOM SECTION: UPI + NOTES (LEFT) & SUMMARY BOX (RIGHT) -->
      <div class="bottom-section">
        <!-- LEFT: UPI & INSTRUCTIONS & SIGNATURE -->
        <div class="bottom-left">
          <!-- UPI PAYMENT BOX -->
          <div class="upi-box">
            <div class="upi-logos">
              <span class="upi-text">UPI</span>
              <span class="pay-apps">Google Pay | PhonePe</span>
              <span class="paytm-badge">paytm</span>
            </div>
            <div class="upi-phone">
              <span class="arrow">&#10145;</span> 94625 58949 <span class="arrow">&#11013;</span>
            </div>
            <div class="upi-notice">
              कृपया भुगतान के बाद ऊपर दिये गये नम्बर पर व्हाट्सएप द्वारा सूचित करें।
            </div>
          </div>

          <!-- DIVIDER LINE -->
          <div class="bottom-inner-line"></div>

          <!-- NOTES + SIGNATURE -->
          <div class="notes-and-sig">
            <div class="notes-box">
              <div>नोट: 1. बिल का भुगतान कर फर्म की रसीद प्राप्त करना आवश्यक है।</div>
              <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2. बिल का भुगतान 5 तारीख तक करना आवश्यक है।</div>
              <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3. सभी विवादों का न्याय क्षेत्र ब्यावर रहेगा।</div>
            </div>
            <div class="sig-box">
              <img src="${SIGNATURE_GLYPH_B64}" class="sig-glyph" alt="sig" />
              <div class="sig-name">प्रो. मेहुल अग्रवाल</div>
              <div class="sig-eoe">E.&O.E.</div>
            </div>
          </div>
        </div>

        <!-- RIGHT: FINANCIAL SUMMARY BOX -->
        <div class="bottom-right">
          <table class="summary-table">
            <tbody>
              <tr>
                <td class="sum-lbl">Total</td>
                <td class="sum-val">${formatMoney(summaryPaperTotal)}</td>
              </tr>
              <tr>
                <td class="sum-lbl">Delivery Charge</td>
                <td class="sum-val">${formatMoney(summaryDelivery)}</td>
              </tr>
              <tr>
                <td class="sum-lbl">Previous Balance</td>
                <td class="sum-val">${formatMoney(b.previous_due)}</td>
              </tr>
              ${b.paid_amount ? `
              <tr>
                <td class="sum-lbl">Paid This Month</td>
                <td class="sum-val">-${formatMoney(b.paid_amount)}</td>
              </tr>` : ''}
              <tr class="grand-total-row">
                <td class="sum-lbl font-bold">Grand Total</td>
                <td class="sum-val font-bold">${formatMoney(roundToFoxProRule(b.net_payable))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

/**
 * Generates an A4 sheet containing up to 4 bills in a 2x2 grid
 */
export function renderA4Page(fourBills: BillRecord[], printMode: BillPrintMode = 'simple'): string {
  const quadrantsHtml = fourBills.map((b, idx) => renderSingleBillHtml(b, idx, printMode)).join('');
  return `
    <div class="a4-sheet">
      ${quadrantsHtml}
    </div>
  `;
}

/**
 * Returns complete, self-contained HTML for printing or saving as PDF
 */
export function generateFullPrintHtml(bills: BillRecord[], title: string = 'Aryan News Agency - Bills', printMode: BillPrintMode = 'simple'): string {
  // Chunk bills into groups of 4 (each group = 1 A4 page with 2x2 quadrants: [0=TL, 1=TR, 2=BL, 3=BR])
  const pages: BillRecord[][] = [];
  for (let i = 0; i < bills.length; i += 4) {
    pages.push(bills.slice(i, i + 4));
  }

  const pagesHtml = pages.map(p => renderA4Page(p, printMode)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    /* CSS RESET & EXACT PRINT SPECS */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: #525659;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* TOP NON-PRINTABLE TOOLBAR */
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 9999;
      background: #1e293b;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
      font-size: 13px;
    }
    .toolbar-title {
      font-weight: bold;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn-action {
      cursor: pointer;
      font-weight: bold;
      padding: 6px 14px;
      border-radius: 4px;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      transition: background 0.15s;
    }
    .btn-print {
      background: #2563eb;
      color: #fff;
    }
    .btn-print:hover { background: #1d4ed8; }
    .btn-close {
      background: #475569;
      color: #fff;
    }
    .btn-close:hover { background: #334155; }

    /* A4 PAGE SHEET CONTAINER */
    .pages-wrapper {
      padding: 20px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }

    .a4-sheet {
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      background: #fff;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
      position: relative;
    }

    /* INDIVIDUAL BILL QUADRANT (1/4 of A4) */
    .bill-quadrant {
      width: 105mm;
      height: 148.5mm;
      max-height: 148.5mm;
      padding: 4mm 6mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      background: #fff;
      position: relative;
    }

    /* CUT GUIDELINES (DOTTED CROSS IN THE CENTER OF A4 SHEET) */
    .quad-left {
      border-right: 1px dashed #999;
    }
    .quad-top {
      border-bottom: 1px dashed #999;
    }

    /* HEADER */
    .bill-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 2px;
      position: relative;
    }
    .logo-box {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 28px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .agency-logo {
      height: 38px;
      width: auto;
      object-fit: contain;
      display: block;
    }
    .agency-info {
      width: 100%;
      text-align: center;
      padding: 0 32px;
    }
    .agency-title {
      font-size: 15px;
      font-weight: 900;
      color: #004B87;
      letter-spacing: 0.5px;
      line-height: 1.1;
      font-family: "Times New Roman", Times, Georgia, serif;
    }
    .reg-mark {
      font-size: 10px;
      vertical-align: super;
      margin-left: 2px;
    }
    .agency-sub {
      font-size: 8.5px;
      color: #111;
      line-height: 1.25;
      font-weight: 500;
    }

    /* S.NO & BILL INFO */
    .bill-meta {
      border-top: 1px solid #333;
      padding-top: 2px;
      margin-bottom: 3px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 8.5px;
      line-height: 1.35;
    }
    .meta-left {
      display: flex;
      gap: 4px;
      max-width: 65%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .meta-right {
      display: flex;
      gap: 4px;
      text-align: right;
    }
    .meta-lbl {
      color: #000;
      font-weight: bold;
    }
    .meta-val {
      color: #000;
    }
    .hindi-name {
      color: #333;
      font-size: 8px;
    }

    /* PARTICULARS TABLE */
    .table-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .bill-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5px;
    }
    .bill-table thead tr {
      border-top: 1.5px solid #000;
      border-bottom: 1.5px solid #000;
    }
    .bill-table th {
      padding: 2px 3px;
      font-weight: 800;
      font-size: 8.5px;
      letter-spacing: 0.2px;
    }
    .col-part {
      width: 50%;
      text-align: left;
      border-right: 1px solid #000;
      padding-left: 2px;
      font-weight: bold;
    }
    .col-qty {
      width: 13%;
      text-align: center;
      border-right: 1px solid #000;
    }
    .col-rate {
      width: 16%;
      text-align: right;
      padding-right: 3px;
      border-right: 1px solid #000;
    }
    .col-amt {
      width: 21%;
      text-align: right;
      padding-right: 3px;
      font-weight: bold;
    }
    .item-row td {
      padding: 1.5px 2px;
      height: 13px;
      line-height: 1.1;
    }
    .empty-row td {
      height: 13px;
    }

    /* BOTTOM SPLIT SECTION (UPI/NOTES on Left, SUMMARY on Right) */
    .bottom-section {
      display: flex;
      border-top: 1.5px solid #000;
      height: 48mm;
      max-height: 48mm;
    }
    .bottom-left {
      width: 63%;
      border-right: 1px solid #000;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding-right: 3px;
    }
    .bottom-right {
      width: 37%;
      display: flex;
      flex-direction: column;
    }

    /* UPI BOX */
    .upi-box {
      padding: 2px 1px;
      text-align: center;
    }
    .upi-logos {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 7.5px;
      font-weight: bold;
    }
    .upi-text {
      color: #0079C1;
      font-size: 10px;
      font-style: italic;
      font-weight: 900;
    }
    .pay-apps {
      color: #333;
    }
    .paytm-badge {
      color: #00b9f5;
      font-weight: 900;
    }
    .upi-phone {
      font-size: 11.5px;
      font-weight: 900;
      color: #004B87;
      letter-spacing: 0.5px;
      margin: 1px 0;
    }
    .arrow {
      color: #004B87;
    }
    .upi-notice {
      font-size: 7px;
      font-weight: 600;
      color: #222;
      line-height: 1.15;
    }

    .bottom-inner-line {
      border-top: 1px solid #000;
      margin: 1px 0;
    }

    /* NOTES & SIGNATURE */
    .notes-and-sig {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 1px;
    }
    .notes-box {
      font-size: 6.5px;
      line-height: 1.25;
      color: #111;
      font-weight: 500;
      max-width: 65%;
    }
    .sig-box {
      text-align: center;
      min-width: 55px;
    }
    .sig-glyph {
      height: 14px;
      width: auto;
      object-fit: contain;
      display: block;
      margin: 0 auto 1px auto;
    }
    .sig-name {
      font-size: 7.5px;
      font-weight: bold;
      color: #000;
      line-height: 1.1;
    }
    .sig-eoe {
      font-size: 7px;
      font-style: italic;
      color: #444;
      line-height: 1.1;
    }

    /* FINANCIAL SUMMARY TABLE (RIGHT) */
    .summary-table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      font-size: 8px;
    }
    .summary-table tr {
      border-bottom: 1px solid #000;
    }
    .summary-table tr:last-child {
      border-bottom: none;
    }
    .sum-lbl {
      padding: 2px 3px;
      text-align: left;
      font-size: 7.5px;
      border-right: 1px solid #000;
      color: #111;
      width: 58%;
    }
    .sum-val {
      padding: 2px 3px;
      text-align: right;
      font-size: 8.5px;
      font-family: "Courier New", Courier, monospace;
      font-weight: bold;
      width: 42%;
    }
    .grand-total-row {
      background: #f8fafc;
    }
    .grand-total-row .sum-lbl {
      font-weight: 900;
      font-size: 8.5px;
      text-transform: uppercase;
    }
    .grand-total-row .sum-val {
      font-size: 9.5px;
      font-weight: 900;
      color: #000;
    }

    /* PRINT MEDIA RULES */
    @media print {
      body {
        background: #fff !important;
      }
      .no-print, .print-toolbar {
        display: none !important;
      }
      .pages-wrapper {
        padding: 0 !important;
        gap: 0 !important;
      }
      .a4-sheet {
        box-shadow: none !important;
        margin: 0 !important;
        width: 210mm !important;
        height: 297mm !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      @page {
        size: A4 portrait;
        margin: 0;
      }
    }
  </style>
</head>
<body>

  <!-- Non-printable top action toolbar -->
  <div class="print-toolbar no-print">
    <div class="toolbar-title">
      <span>🖨️ Aryan News Agency - 4 in 1 A4 Bill Print Preview</span>
      <span style="opacity: 0.8; font-weight: normal; background: #334155; padding: 2px 8px; border-radius: 4px; font-size: 11px;">
        ${printMode === 'simple' ? '📄 Simple Print (सरल - Delivery Merged)' : '📑 Detail Print (विस्तृत - Delivery Separate)'}
      </span>
      <span style="opacity: 0.7; font-weight: normal;">(${bills.length} bills / ${pages.length} A4 pages)</span>
    </div>
    <div class="toolbar-actions">
      <button class="btn-action btn-print" onclick="window.print()">
        <span>Print All A4 Sheets / Save PDF</span>
      </button>
      <button class="btn-action btn-close" onclick="window.close()">
        <span>Close Window</span>
      </button>
    </div>
  </div>

  <!-- A4 Sheets Container -->
  <div class="pages-wrapper">
    ${pagesHtml}
  </div>

  <script>
    // Automatically trigger print dialog on window load
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 350);
    });
  </script>

</body>
</html>`;
}

/**
 * Triggers a clean print window with 4-in-1 A4 sheets
 */
export function printBills4in1(bills: BillRecord[], title: string = 'Aryan News Agency - Bills', printMode: BillPrintMode = 'simple'): void {
  if (!bills || bills.length === 0) {
    alert('No bills available to print.');
    return;
  }

  const html = generateFullPrintHtml(bills, title, printMode);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    // If popup blocker intervened, fallback to iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
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
