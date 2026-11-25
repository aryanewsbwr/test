// Bills printed onto the shop's own pre-printed 4-in-1 A4 sheets (logo, boxes and the
// advertisement on the back are already on the paper). Only the values are printed, each at
// the place of its box on the sheet. Printers feed a little differently, so the whole print
// can be moved up/down/left/right from the print window and that is remembered.
import { getReliableHindiName } from '@/lib/transliteration';
import { billRoundOff, roundToFoxProRule } from '@/lib/billingEngine';
import type { BillRecord, BillPrintMode } from './bill4in1Export';

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

function oneBill(b: BillRecord, slot: number, serial: number, mode: BillPrintMode): string {
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
  <div class="bill" style="left:${left}mm;top:${top}mm">
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

export function preprintedBillsHtml(bills: BillRecord[], title: string, mode: BillPrintMode = 'simple'): string {
  const pages: string[] = [];
  for (let i = 0; i < bills.length; i += 4) {
    pages.push(`<div class="page">${bills.slice(i, i + 4).map((b, j) => oneBill(b, j, i + j + 1, mode)).join('')}</div>`);
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
  .tools { position: fixed; top: 8px; right: 8px; background: #fffbe6; border: 1px solid #c9a400; padding: 8px 10px; font: 12px Arial, sans-serif; z-index: 9; box-shadow: 0 2px 6px rgba(0,0,0,.2); max-width: 270px; }
  .tools b { display: block; margin-bottom: 4px; }
  .tools input { width: 52px; }
  .tools button { margin-top: 6px; padding: 4px 10px; font-weight: bold; cursor: pointer; }
  @media print { .tools { display: none; } }
</style></head><body>
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
  ox.value = off.x; oy.value = off.y; apply();
  function save() { off = { x: Number(ox.value) || 0, y: Number(oy.value) || 0 }; apply(); try { localStorage.setItem(key, JSON.stringify(off)); } catch (e) {} }
  ox.oninput = save; oy.oninput = save;
</script>
</body></html>`;
}

export function printBillsPreprinted(bills: BillRecord[], title = 'Aryan News Agency - Bills', mode: BillPrintMode = 'simple'): void {
  if (!bills || bills.length === 0) { alert('No bills available to print.'); return; }
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for this site to print bills.'); return; }
  w.document.open();
  w.document.write(preprintedBillsHtml(bills, title, mode));
  w.document.close();
}
