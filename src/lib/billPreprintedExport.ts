// Bills printed onto the shop's own pre-printed 4-in-1 A4 sheets (logo, boxes and the
// advertisement on the back are already on the paper). Only the values are printed, each at
// the place of its box on the sheet. Printers feed a little differently, so the whole print
// can be moved up/down/left/right from the print window and that is remembered.
import { getReliableHindiName } from '@/lib/transliteration';
import { billRoundOff, roundToFoxProRule } from '@/lib/billingEngine';
import type { BillRecord, BillPrintMode } from './bill4in1Export';
import { SIGNATURE_GLYPH_B64 } from './bill4in1Export';
import { BOY_LOGO_B64 } from './logoBase64';

export interface SheetOptions {
  // Draw the sheet itself too (logo, boxes, labels, notes), for plain A4 paper
  sheet?: boolean;
  // Shown inside the bill preview: no print tools
  preview?: boolean;
  // S. No. of the first bill, when only some pages are drawn
  firstSerial?: number;
}

// The printed sheet's own lines, labels and notes, measured from the shop's pre-printed paper (mm)
const SHEET = `
    <img class="s-logo" src="${BOY_LOGO_B64}" alt="">
    <div class="s-firm">ARYAN NEWS AGENCY<sup>&reg;</sup></div>
    <div class="s-addr">Netaji Subhash Marg, BEAWAR (Raj.)</div>
    <div class="s-ph">Ph.: (01462) 258949</div>
    <div class="s-lbl" style="left:19mm;top:26mm">S. No.</div>
    <div class="s-lbl" style="left:19mm;top:32mm">Region</div>
    <div class="s-lbl" style="left:69mm;top:26.5mm">Bill No.</div>
    <div class="s-lbl" style="left:69mm;top:32mm">Month</div>
    <div class="s-h" style="left:5mm;top:48mm;width:92mm"></div>
    <div class="s-h" style="left:5mm;top:54mm;width:92mm"></div>
    <div class="s-head" style="left:5mm;width:46mm">PARTICULARS</div>
    <div class="s-head" style="left:51mm;width:12mm">QTY.</div>
    <div class="s-head" style="left:63mm;width:13mm">RATE</div>
    <div class="s-head" style="left:76mm;width:21mm">AMOUNT</div>
    <div class="s-v" style="left:51mm;top:48mm;height:78.5mm"></div>
    <div class="s-v" style="left:63mm;top:48mm;height:53mm"></div>
    <div class="s-v" style="left:76mm;top:48mm;height:78.5mm"></div>
    <div class="s-h" style="left:51mm;top:101mm;width:46mm"></div>
    <div class="s-h" style="left:51mm;top:107.5mm;width:25mm"></div>
    <div class="s-h" style="left:51mm;top:113.8mm;width:25mm"></div>
    <div class="s-h" style="left:51mm;top:120.1mm;width:25mm"></div>
    <div class="s-h" style="left:5mm;top:126.5mm;width:92mm"></div>
    <div class="s-sum" style="top:101mm">Total</div>
    <div class="s-sum" style="top:107.5mm">Delivery Charge</div>
    <div class="s-sum" style="top:113.8mm">Previous Balance</div>
    <div class="s-sum" style="top:120.1mm">Grand Total</div>
    <div class="s-upi">
      <div class="u1">UPI</div>
      <div class="u2">Google Pay | PhonePe</div>
      <div class="u3">paytm</div>
      <div class="u4">&#10132; 94625 58949 &#8592;</div>
      <div class="u5">कृपया भुगतान के बाद ऊपर दिये गये<br>नम्बर पर व्हाट्सएप्प द्वारा सूचित करें।</div>
    </div>
    <div class="s-note">नोट: 1. बिल का भुगतान कर फर्म की रसीद प्राप्त करना आवश्यक है।<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2. बिल का भुगतान 5 तारीख तक करना आवश्यक है।<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3. सभी विवादों का न्याय क्षेत्र ब्यावर रहेगा।</div>
    <img class="s-sign" src="${SIGNATURE_GLYPH_B64}" alt="">
    <div class="s-prop">प्रो. मेहुल अग्रवाल<br><span>E.&amp;O.E.</span></div>`;

const OFFSET_KEY = 'preprintedBillOffset';
const DEVELOPER = 'Software Developer - Rahul Agarwal';

const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const money = (n: any) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '0.00');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Oct 2026", with the calendar year (Jan-Mar fall in the second year of a financial year)
function monthText(b: BillRecord): string {
  const code = String(b.month || '').trim().slice(0, 3).toLowerCase();
  const m = MONTHS.indexOf(code);
  let year = Number(String(b.year || '').slice(0, 4)) || new Date().getFullYear();
  if (String(b.year || '').length === 8 && m >= 0 && m <= 2) year += 1;
  const name = m >= 0 ? code[0].toUpperCase() + code.slice(1) : String(b.month || '');
  return `${name} ${year}`;
}

interface Line { name: string; qty: string; rate: string; amount: number }

function billLines(b: BillRecord, mode: BillPrintMode): { lines: Line[]; total: number; delivery: number } {
  const items = b.items || [];
  const discount = roundToFoxProRule(b.discount_amount || 0);
  const deliveryTotal = b.delivery_charge || 0;
  if (mode === 'detail') {
    return {
      lines: items.map(it => ({
        name: `${it.pub_name.trim()}${it.supplement ? ' (PS)' : ''}`,
        qty: String(it.days && it.days > 0 ? it.days : it.qty || 1),
        rate: money(it.rate),
        amount: roundToFoxProRule(it.net_amount ?? it.amount)
      })),
      total: roundToFoxProRule(Math.max(0, b.paper_amount - discount)),
      delivery: roundToFoxProRule(deliveryTotal)
    };
  }
  // Simple: one line per paper, delivery inside the paper amount (same as the 4-in-1 simple bill)
  const hasItemDelivery = items.some(it => (it.delivery_amount || 0) > 0);
  const byPaper = new Map<string, { name: string; qty: number; amount: number }>();
  items.forEach((it, i) => {
    const name = it.pub_name.trim();
    const key = name.toLowerCase();
    const qty = Number(it.days && it.days > 0 ? it.days : it.qty || 1);
    const delivery = hasItemDelivery ? it.delivery_amount || 0 : i === 0 ? deliveryTotal : 0;
    const amount = (it.net_amount ?? it.amount) + delivery;
    const row = byPaper.get(key);
    if (row) { row.qty += qty; row.amount += amount; } else byPaper.set(key, { name, qty, amount });
  });
  return {
    lines: Array.from(byPaper.values()).map(r => ({ name: r.name, qty: String(r.qty), rate: '', amount: roundToFoxProRule(r.amount) })),
    total: roundToFoxProRule(Math.max(0, b.paper_amount + deliveryTotal - discount)),
    delivery: 0
  };
}

function oneBill(b: BillRecord, slot: number, serial: number, mode: BillPrintMode, sheet = false): string {
  const { lines, total, delivery } = billLines(b, mode);
  const grand = roundToFoxProRule(b.net_payable);
  // The sheet has only four boxes, so this month's payment and the round off are inside Previous
  // Balance, and Total + Delivery + Previous Balance is always the Grand Total
  const roundOff = billRoundOff(grand, total + delivery + b.previous_due - (b.paid_amount || 0));
  const previous = roundToFoxProRule(b.previous_due - (b.paid_amount || 0) + roundOff);
  const hindi = getReliableHindiName(b.customer_hindi || '', b.customer_name);
  const left = slot % 2 === 0 ? 0 : 105;
  const top = slot < 2 ? 0 : 148.5;
  const shown = lines.slice(0, 9);

  return `
  <div class="bill" style="left:${left}mm;top:${top}mm">${sheet ? SHEET : ''}
    <div class="v" style="left:31mm;top:25.5mm">${esc(b.priority || serial)}</div>
    <div class="v" style="left:31mm;top:31.5mm">${esc(b.region_name || b.region_id)}</div>
    <div class="v" style="left:81mm;top:25.5mm">${esc(b.bill_no || '')}</div>
    <div class="v" style="left:81mm;top:31.5mm">${esc(monthText(b))}</div>
    <div class="name-h">${esc(hindi)}</div>
    <div class="name-e">${esc(b.customer_name)}</div>
    ${shown.map((l, i) => `
    <div class="v paper" style="top:${57 + i * 4.6}mm">${esc(l.name)}</div>
    <div class="v qty" style="top:${57 + i * 4.6}mm">${esc(l.qty)}</div>
    <div class="v rate" style="top:${57 + i * 4.6}mm">${esc(l.rate)}</div>
    <div class="v amt" style="top:${57 + i * 4.6}mm">${money(l.amount)}</div>`).join('')}
    <div class="v amt" style="top:102.6mm">${money(total)}</div>
    <div class="v amt" style="top:109mm">${delivery ? money(delivery) : ''}</div>
    <div class="v amt" style="top:115.4mm">${previous ? money(previous) : ''}</div>
    <div class="v amt grand" style="top:121.6mm">${money(grand)}</div>
    <div class="dev">${DEVELOPER}</div>
  </div>`;
}

export function preprintedBillsHtml(bills: BillRecord[], title: string, mode: BillPrintMode = 'simple', opts: SheetOptions = {}): string {
  const first = opts.firstSerial || 1;
  const pages: string[] = [];
  for (let i = 0; i < bills.length; i += 4) {
    pages.push(`<div class="page${opts.sheet ? ' with-sheet' : ''}">${opts.sheet ? '<div class="cut-v"></div><div class="cut-h"></div>' : ''}${bills.slice(i, i + 4).map((b, j) => oneBill(b, j, first + i + j, mode, !!opts.sheet)).join('')}</div>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, 'Nirmala UI', Mangal, sans-serif; }
  .page { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .bill { position: absolute; width: 105mm; height: 148.5mm; margin: var(--y, 0mm) 0 0 var(--x, 0mm); }
  .v { position: absolute; font-size: 10pt; font-weight: bold; white-space: nowrap; line-height: 1.2; }
  .name-h { position: absolute; left: 5mm; width: 92mm; top: 36mm; text-align: center; font-size: 14pt; font-weight: bold; white-space: nowrap; overflow: hidden; }
  .name-e { position: absolute; left: 5mm; width: 92mm; top: 42.5mm; text-align: center; font-size: 8.5pt; font-weight: bold; white-space: nowrap; overflow: hidden; }
  .paper { left: 7mm; width: 43mm; overflow: hidden; font-size: 10pt; }
  .qty { left: 51mm; width: 12mm; text-align: center; }
  .rate { left: 63mm; width: 13mm; text-align: center; font-size: 9pt; }
  .amt { right: 9mm; text-align: right; }
  .grand { font-size: 11pt; }
  .dev { position: absolute; left: 5mm; top: 142.5mm; font-size: 6pt; }
  .with-sheet .bill { margin: 0; }
  .cut-v { position: absolute; left: 105mm; top: 0; height: 297mm; border-left: 1px dashed #999; }
  .cut-h { position: absolute; top: 148.5mm; left: 0; width: 210mm; border-top: 1px dashed #999; }
  .s-logo { position: absolute; left: 6mm; top: 7mm; width: 10mm; height: 17mm; object-fit: contain; }
  .s-firm { position: absolute; left: 17mm; top: 9.5mm; font: 900 17pt 'Arial Narrow', Arial, sans-serif; color: #1d3f8f; white-space: nowrap; }
  .s-firm sup { font-size: 8pt; }
  .s-addr { position: absolute; left: 28mm; top: 18.5mm; font: bold 8pt Arial, sans-serif; color: #1d3f8f; }
  .s-ph { position: absolute; left: 41mm; top: 22.3mm; font: bold 8pt Arial, sans-serif; color: #1d3f8f; }
  .s-lbl { position: absolute; font: bold 8pt Arial, sans-serif; color: #1d3f8f; }
  .s-h { position: absolute; border-top: 1.3px solid #1d3f8f; }
  .s-v { position: absolute; border-left: 1.3px solid #1d3f8f; }
  .s-head { position: absolute; top: 49.4mm; text-align: center; font: bold 9pt Arial, sans-serif; color: #1d3f8f; }
  .s-sum { position: absolute; left: 51mm; width: 25mm; height: 6.3mm; line-height: 6.3mm; text-align: center; font: 8pt Arial, sans-serif; color: #1d3f8f; }
  .s-upi { position: absolute; left: 5mm; top: 98mm; width: 45mm; text-align: center; color: #1d3f8f; font-family: Arial, sans-serif; line-height: 1.15; }
  .s-upi .u1 { font: italic 900 14pt Arial, sans-serif; }
  .s-upi .u2 { font-size: 6.5pt; font-weight: bold; }
  .s-upi .u3 { font: 900 9.5pt Arial, sans-serif; }
  .s-upi .u4 { font-size: 10pt; font-weight: 900; }
  .s-upi .u5 { font-size: 6.8pt; font-weight: bold; }
  .s-note { position: absolute; left: 5mm; top: 127.5mm; font: bold 6.3pt 'Nirmala UI', Mangal, Arial, sans-serif; color: #1d3f8f; line-height: 1.35; }
  .s-sign { position: absolute; left: 82mm; top: 127.5mm; width: 7mm; }
  .s-prop { position: absolute; left: 74mm; top: 132mm; width: 23mm; text-align: center; font: bold 7pt 'Nirmala UI', Mangal, Arial, sans-serif; color: #1d3f8f; line-height: 1.3; }
  .s-prop span { font: 6pt Arial, sans-serif; }
  .preview .tools { display: none; }
  .tools { position: fixed; top: 8px; right: 8px; background: #fffbe6; border: 1px solid #c9a400; padding: 8px 10px; font: 12px Arial, sans-serif; z-index: 9; box-shadow: 0 2px 6px rgba(0,0,0,.2); max-width: 270px; }
  .tools b { display: block; margin-bottom: 4px; }
  .tools input { width: 52px; }
  .tools button { margin-top: 6px; padding: 4px 10px; font-weight: bold; cursor: pointer; }
  @media print { .tools { display: none; } }
</style></head><body class="${opts.preview ? 'preview' : ''}">
<div class="tools">
  <b>Pre-printed sheet</b>
  Move print (mm). Minus = up / left.<br>
  Up/Down <input id="oy" type="number" step="0.5"> Left/Right <input id="ox" type="number" step="0.5"><br>
  <small>Printer settings: Margins <b>None</b>, Scale <b>100%</b>.</small><br>
  <button onclick="window.print()">Print</button>
</div>
<div class="sheet" id="sheet">${pages.join('')}</div>
<script>
  var key = ${JSON.stringify(OFFSET_KEY)}, off = { x: 0, y: 0 };
  try { off = Object.assign(off, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) {}
  var ox = document.getElementById('ox'), oy = document.getElementById('oy'), sheet = document.documentElement;
  function apply() {
    sheet.style.setProperty('--x', (Number(off.x) || 0) + 'mm');
    sheet.style.setProperty('--y', (Number(off.y) || 0) + 'mm');
  }
  ox.value = off.x; oy.value = off.y; if (!document.querySelector('.with-sheet')) apply();
  function save() { off = { x: Number(ox.value) || 0, y: Number(oy.value) || 0 }; apply(); try { localStorage.setItem(key, JSON.stringify(off)); } catch (e) {} }
  ox.oninput = save; oy.oninput = save;
  if (document.querySelector('.with-sheet')) document.querySelector('.tools').innerHTML = '<button onclick="window.print()">Print</button> <small>Margins None, Scale 100%</small>';
</script>
</body></html>`;
}

export function printBillsPreprinted(bills: BillRecord[], title = 'Aryan News Agency - Bills', mode: BillPrintMode = 'simple', opts: SheetOptions = {}): void {
  if (!bills || bills.length === 0) { alert('No bills available to print.'); return; }
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for this site to print bills.'); return; }
  w.document.open();
  w.document.write(preprintedBillsHtml(bills, title, mode, opts));
  w.document.close();
}
