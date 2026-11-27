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
    <div class="s-lbl" style="left:19mm;top:24mm">S. No.</div>
    <div class="s-lbl" style="left:19mm;top:29mm">Region</div>
    <div class="s-lbl" style="left:69mm;top:24mm">Bill No.</div>
    <div class="s-lbl" style="left:69mm;top:29mm">Month</div>
    <div class="s-h" style="left:5mm;top:44.3mm;width:92mm"></div>
    <div class="s-h" style="left:5mm;top:50.2mm;width:92mm"></div>
    <div class="s-head" style="left:5mm;width:46mm">PARTICULARS</div>
    <div class="s-head" style="left:51mm;width:12mm">QTY.</div>
    <div class="s-head" style="left:63mm;width:13mm">RATE</div>
    <div class="s-head" style="left:76mm;width:21mm">AMOUNT</div>
    <div class="s-v" style="left:51mm;top:44.3mm;height:77.5mm"></div>
    <div class="s-v" style="left:63mm;top:44.3mm;height:52.4mm"></div>
    <div class="s-v" style="left:76mm;top:44.3mm;height:77.5mm"></div>
    <div class="s-h" style="left:51mm;top:96.7mm;width:46mm"></div>
    <div class="s-h" style="left:51mm;top:103.1mm;width:25mm"></div>
    <div class="s-h" style="left:51mm;top:109.3mm;width:25mm"></div>
    <div class="s-h" style="left:51mm;top:115.5mm;width:25mm"></div>
    <div class="s-h" style="left:5mm;top:121.8mm;width:92mm"></div>
    <div class="s-sum" style="top:96.7mm">Total</div>
    <div class="s-sum" style="top:103.1mm">Delivery Charge</div>
    <div class="s-sum" style="top:109.3mm">Previous Balance</div>
    <div class="s-sum" style="top:115.5mm">Grand Total</div>
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

const OFFSET_KEY = 'preprintedBillOffset3';
const DEVELOPER = 'Software Developer - Rahul Agarwal (9461203345)';

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

// Where each of the 4 bills' boxes really are on the shop's sheet (whole-page mm, measured from a
// scan): they are not equal quarters. dy/dx are how far this printer moves the print there.
// ys/yr: S. No./Region line, yh: under the PARTICULARS heading, yt: Total row, pitch: box rows,
// xs/xb: end of the S. No./Bill No. label, l/q/r/a/e: table left, QTY, RATE, AMOUNT and right lines.
// Corrections measured on the flat scan of 29 Nov 2026 (mm, + moves down), each part of each bill
// against its own box. head: S. No., Region, Bill No., Month and the name; body: paper lines;
// sum: the four totals. The total rows also print a little closer than the boxes (ROW_GAP).
const NUDGE = [
  { head: 0.9, body: 1.5, sum: 1.7 },
  { head: 0.65, body: 0.7, sum: 0.9 },
  { head: 1.4, body: 1.5, sum: 1.7 },
  { head: 1.0, body: 0.4, sum: 1.05 }
];
const ROW_GAP = 0.25;
// The shop's sheets sit about 0.25° turned anticlockwise against the print (same scan): each bill
// is turned the same way, so its lines run along the boxes. The Tilt box adds to this.
const SHEET_TILT = -0.25;

const PLACES = [
  { ys: 29.7, yr: 34.6, yh: 54.2, yt: 104.0, pitch: 6.23, xs: 32.7, xb: 82.9, l: 9.5, q: 56.1, r: 67.3, a: 80.2, e: 101.0, dy: 4.3, dx: 4.0 },
  { ys: 29.0, yr: 34.0, yh: 53.8, yt: 103.5, pitch: 6.23, xs: 136.3, xb: 186.8, l: 113.3, q: 160.1, r: 171.2, a: 183.8, e: 204.6, dy: 5.3, dx: 1.0 },
  { ys: 178.2, yr: 183.1, yh: 202.7, yt: 252.6, pitch: 6.23, xs: 33.4, xb: 83.5, l: 10.1, q: 56.6, r: 67.9, a: 80.6, e: 101.4, dy: 2.6, dx: 2.5 },
  { ys: 177.5, yr: 182.5, yh: 202.3, yt: 251.7, pitch: 6.23, xs: 136.9, xb: 186.1, l: 113.8, q: 160.4, r: 171.7, a: 184.1, e: 204.9, dy: 4.4, dx: 0.1 }
];

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
  const shown = lines.slice(0, 11);
  // Plain A4 draws all four bills the same way; the shop's sheet has each bill at its own place
  const g = sheet ? PLACES[0] : PLACES[slot];
  const n = sheet ? { head: 0, body: 0, sum: 0 } : NUDGE[slot];
  const Y = (v: number, half = 2.12) => `${(v - (sheet ? 0 : top) - g.dy - half).toFixed(1)}mm`;
  const X = (v: number) => (v - (sheet ? 0 : left) - g.dx);
  const mm = (v: number) => `${v.toFixed(1)}mm`;
  const amtRight = mm(105 - (X(g.e) - 2));
  const rowY = (i: number) => Y(g.yh + 3.2 + n.body + i * 3.9);
  const sumY = (k: number, half = 2.12) => Y(g.yt - 0.8 + n.sum + k * (g.pitch + (sheet ? 0 : ROW_GAP)), half);

  return `
  <div class="bill" style="left:${left}mm;top:${top}mm">${sheet ? SHEET : ''}
    <div class="v" style="left:${mm(X(g.xs) + 3.5)};top:${Y(n.head + g.ys - 0.9)}">${esc(b.priority || serial)}</div>
    <div class="v" style="left:${mm(X(g.xs) + 3.5)};top:${Y(n.head + g.yr - 0.9)}">${esc(b.region_name || b.region_id)}</div>
    <div class="v" style="left:${mm(X(g.xb) + 1.5)};top:${Y(n.head + g.ys - 1.7)}">${esc(b.bill_no || '')}</div>
    <div class="v" style="left:${mm(X(g.xb) + 1.5)};top:${Y(n.head + g.yr - 1.3)}">${esc(monthText(b))}</div>
    <div class="name-h" style="left:${mm(X(g.l))};width:${mm(g.e - g.l)};top:${Y(n.head + g.yr + 5.5, 3.15)}">${esc(hindi)}</div>
    <div class="name-e" style="left:${mm(X(g.l))};width:${mm(g.e - g.l)};top:${Y(n.head + g.yr + 10, 1.85)}">${esc(b.customer_name)}</div>
    ${shown.map((l, i) => `
    <div class="v paper" style="left:${mm(X(g.l) + 2)};width:${mm(g.q - g.l - 3)};top:${rowY(i)}">${esc(l.name)}</div>
    <div class="v qty" style="left:${mm(X(g.q))};width:${mm(g.r - g.q)};top:${rowY(i)}">${esc(l.qty)}</div>
    <div class="v rate" style="left:${mm(X(g.r))};width:${mm(g.a - g.r)};top:${rowY(i)}">${esc(l.rate)}</div>
    <div class="v amt" style="right:${amtRight};top:${rowY(i)}">${money(l.amount)}</div>`).join('')}
    <div class="v amt" style="right:${amtRight};top:${sumY(0)}">${money(total)}</div>
    <div class="v amt" style="right:${amtRight};top:${sumY(1)}">${delivery ? money(delivery) : ''}</div>
    <div class="v amt" style="right:${amtRight};top:${sumY(2)}">${previous ? money(previous) : ''}</div>
    <div class="v amt grand" style="right:${amtRight};top:${sumY(3, 2.28)}">${money(grand)}</div>
    <!-- Bottom-left corner, under the notes. The lower two bills sit a little higher than before, so the
         printer's bottom edge does not cut the line off -->
    <div class="dev" style="left:${mm(X(g.l))};top:${Y(g.yt + (sheet ? 34.5 : slot === 2 ? 38.5 : 37.5), 1.38)}">${DEVELOPER}</div>
    ${sheet ? '' : `
    <!-- Test lines: where this print expects the sheet's box lines; shown only for the alignment test -->
    <div class="guide" style="left:${mm(X(g.l))};width:${mm(g.e - g.l)};top:${Y(g.yh + n.body, 0)};height:0.25mm"></div>
    <div class="guide" style="left:${mm(X(g.q))};width:${mm(g.e - g.q)};top:${Y(g.yt - 0.8 + n.sum - g.pitch / 2, 0)};height:0.25mm"></div>
    <div class="guide" style="left:${mm(X(g.q))};width:${mm(g.e - g.q)};top:${Y(g.yt - 0.8 + n.sum + 3.5 * (g.pitch + ROW_GAP), 0)};height:0.25mm"></div>
    ${[g.q, g.r, g.a].map(x => `<div class="guide" style="left:${mm(X(x))};width:0.25mm;top:${Y(g.yh + n.body, 0)};height:${mm(g.yt - g.pitch / 2 - g.yh)}"></div>`).join('')}`}
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
  .page { position: relative; width: 210mm; height: 296.5mm; overflow: hidden; page-break-after: always; break-after: page; transform: scale(var(--s, 1)); transform-origin: 50% 50%; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .bill { position: absolute; width: 105mm; height: 148.5mm; margin: var(--y, 0mm) 0 0 var(--x, 0mm); transform: rotate(calc(var(--r, 0deg) + ${SHEET_TILT}deg)); transform-origin: 50% 50%; }
  .v { position: absolute; font-size: 8pt; font-weight: bold; white-space: nowrap; line-height: 1.5; }
  .name-h { position: absolute; text-align: center; font-size: 10.5pt; font-weight: 500; font-family: 'Nirmala UI', Mangal, 'Noto Sans Devanagari', Arial, sans-serif; white-space: nowrap; overflow: hidden; line-height: 1.7; }
  .name-e { position: absolute; text-align: center; font-size: 7.5pt; font-weight: bold; white-space: nowrap; overflow: hidden; line-height: 1.4; }
  .paper { overflow: hidden; font-size: 8pt; font-weight: 500; font-family: 'Nirmala UI', Mangal, 'Noto Sans Devanagari', Arial, sans-serif; }
  .qty { text-align: center; }
  .rate { text-align: center; font-size: 7.5pt; }
  .amt { text-align: right; }
  .grand { font-size: 8.6pt; }
  .guide { display: none; position: absolute; background: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body.guides .guide { display: block; }
  body.guides .v, body.guides .name-h, body.guides .name-e, body.guides .dev { display: none; }
  .dev { position: absolute; font-size: 7.5pt; line-height: 1.2; font-weight: 900; letter-spacing: 0.15px; white-space: nowrap; background: #000; color: #fff; padding: 0.15mm 1.2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .with-sheet .bill { margin: 0; transform: none; }
  .cut-v { position: absolute; left: 105mm; top: 0; height: 297mm; border-left: 1px dashed #999; }
  .cut-h { position: absolute; top: 148.5mm; left: 0; width: 210mm; border-top: 1px dashed #999; }
  .s-logo { position: absolute; left: 6mm; top: 5mm; width: 10mm; height: 17mm; object-fit: contain; }
  .s-firm { position: absolute; left: 17mm; top: 8.5mm; font: 900 17pt 'Arial Narrow', Arial, sans-serif; color: #1d3f8f; white-space: nowrap; }
  .s-firm sup { font-size: 8pt; }
  .s-addr { position: absolute; left: 28mm; top: 17.3mm; font: bold 8pt Arial, sans-serif; color: #1d3f8f; }
  .s-ph { position: absolute; left: 41mm; top: 20.7mm; font: bold 8pt Arial, sans-serif; color: #1d3f8f; }
  .s-lbl { position: absolute; font: bold 8pt Arial, sans-serif; color: #1d3f8f; }
  .s-h { position: absolute; border-top: 1.3px solid #1d3f8f; }
  .s-v { position: absolute; border-left: 1.3px solid #1d3f8f; }
  .s-head { position: absolute; top: 45.6mm; text-align: center; font: bold 9pt Arial, sans-serif; color: #1d3f8f; }
  .s-sum { position: absolute; left: 51mm; width: 25mm; height: 6.3mm; text-align: center; font: 8pt/6.3mm Arial, sans-serif; color: #1d3f8f; }
  .s-upi { position: absolute; left: 5mm; top: 94mm; width: 45mm; text-align: center; color: #1d3f8f; font-family: Arial, sans-serif; line-height: 1.15; }
  .s-upi .u1 { font: italic 900 14pt Arial, sans-serif; }
  .s-upi .u2 { font-size: 6.5pt; font-weight: bold; }
  .s-upi .u3 { font: 900 9.5pt Arial, sans-serif; }
  .s-upi .u4 { font-size: 10pt; font-weight: 900; }
  .s-upi .u5 { font-size: 6.8pt; font-weight: bold; }
  .s-note { position: absolute; left: 5mm; top: 123mm; font: bold 6.3pt 'Nirmala UI', Mangal, Arial, sans-serif; color: #1d3f8f; line-height: 1.35; }
  .s-sign { position: absolute; left: 82mm; top: 123mm; width: 7mm; }
  .s-prop { position: absolute; left: 74mm; top: 127.5mm; width: 23mm; text-align: center; font: bold 7pt 'Nirmala UI', Mangal, Arial, sans-serif; color: #1d3f8f; line-height: 1.3; }
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
  <label><input id="tl" type="checkbox"> Alignment test (lines only)</label><br>
  <small>Print it on one sheet: the black lines must sit on the blue box lines. If they run at an angle, change Tilt; if they are above or below, change Up/Down.</small><br>
  Move print (mm). Minus = up / left.<br>
  Up/Down <input id="oy" type="number" step="0.5"> Left/Right <input id="ox" type="number" step="0.5"><br>
  Tilt <input id="or" type="number" step="0.1"> &deg; <small>(+ turns clockwise)</small><br>
  Size <input id="os" type="number" step="0.1"> % <small>(a computer that prints too big: smaller number)</small><br>
  <small>Printer settings: Margins <b>None</b>, Scale <b>100%</b>.</small><br>
  <button onclick="window.print()">Print</button>
</div>
<div class="sheet" id="sheet">${pages.join('')}</div>
<script>
  var key = ${JSON.stringify(OFFSET_KEY)}, off = { x: 0, y: 0, r: 0, s: 100 };
  try { off = Object.assign(off, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) {}
  var ox = document.getElementById('ox'), oy = document.getElementById('oy'), orr = document.getElementById('or'), os = document.getElementById('os'), sheet = document.documentElement;
  function apply() {
    sheet.style.setProperty('--x', (Number(off.x) || 0) + 'mm');
    sheet.style.setProperty('--y', (Number(off.y) || 0) + 'mm');
    sheet.style.setProperty('--r', (Number(off.r) || 0) + 'deg');
    sheet.style.setProperty('--s', String((Number(off.s) || 100) / 100));
  }
  ox.value = off.x; oy.value = off.y; orr.value = off.r || 0; os.value = off.s || 100; if (!document.querySelector('.with-sheet')) apply();
  function save() { off = { x: Number(ox.value) || 0, y: Number(oy.value) || 0, r: Number(orr.value) || 0, s: Number(os.value) || 100 }; apply(); try { localStorage.setItem(key, JSON.stringify(off)); } catch (e) {} }
  ox.oninput = save; oy.oninput = save; orr.oninput = save; os.oninput = save;
  var tl = document.getElementById('tl');
  if (tl) tl.onchange = function () { document.body.classList.toggle('guides', tl.checked); };
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
