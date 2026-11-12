import { cleanOrTransliterateHindi } from '@/lib/transliteration';

// The due list as it is printed for a region: one line per customer who owes, in priority
// order, so the collector can walk the route. Opened in its own window so only the list prints,
// not the screen around it.

const HINDI_MONTHS = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितम्बर', 'अक्टूबर', 'नवम्बर', 'दिसम्बर'];

function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface DueListOptions {
  regionName: string;
  regionId?: string | number;
  // Region shown on each line when the list covers all regions
  showRegion?: boolean;
}

export function dueListHtml(rows: any[], opts: DueListOptions, today = new Date()): string {
  const due = rows
    .filter(c => Number(c.final_balance) > 0)
    .sort((a, b) => (Number(a.priority) || 99999) - (Number(b.priority) || 99999) || Number(a.customer_id) - Number(b.customer_id));
  const total = due.reduce((sum, c) => sum + Math.round(Number(c.final_balance)), 0);
  const date = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const lines = due.map(c => {
    const english = String(c.name || '').trim();
    const hindi = c.name_hindi ? cleanOrTransliterateHindi(c.name_hindi, english) : '';
    // The last word of the English name (2III, NN, Automobiles) helps tell similar names apart
    const tag = hindi ? english.split(/\s+/).pop() || '' : '';
    const address = cleanOrTransliterateHindi(c.address || '', '');
    return `<tr>
      <td class="pr">${esc(c.priority || '')}</td>
      <td class="name">${esc(hindi || english)}${tag ? ` <span class="tag">${esc(tag)}</span>` : ''}${opts.showRegion && c.region_name ? ` <span class="tag">(${esc(c.region_name)})</span>` : ''}</td>
      <td class="addr">${esc(address)}</td>
      <td class="amt">${Math.round(Number(c.final_balance))}</td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="hi"><head><meta charset="utf-8">
<title>बकाया सूची - ${esc(opts.regionName)}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  body { font-family: 'Mangal', 'Nirmala UI', 'Noto Sans Devanagari', Arial, sans-serif; color: #000; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 4px; }
  .firm b { font-size: 17px; letter-spacing: .3px; }
  .firm div { font-size: 12px; }
  .mid { text-align: center; }
  .mid .region { font-size: 30px; font-weight: 800; line-height: 1; }
  .mid .title { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .meta { text-align: right; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead th { font-size: 13px; text-align: left; border-bottom: 1.5px solid #000; padding: 4px 6px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  td { border-bottom: 1px solid #999; padding: 5px 6px; font-size: 14px; vertical-align: top; }
  .pr { width: 52px; text-align: right; font-weight: 700; }
  .name { font-weight: 600; }
  .tag { font-size: 10px; font-weight: 400; }
  .addr { font-size: 12.5px; width: 42%; }
  .amt { width: 70px; text-align: right; font-weight: 800; font-size: 15px; }
  th.pr, th.amt { text-align: right; }
  tfoot td { border-top: 2px solid #000; border-bottom: none; font-weight: 800; font-size: 15px; }
</style></head>
<body>
  <div class="head">
    <div class="firm">
      <b>ARYAN NEWS AGENCY</b>
      <div>5(1), Old Bus Stand, BEAWAR (Raj.)</div>
      <div>Mob. 9829058949, WhatsApp 9462558949</div>
    </div>
    <div class="mid">
      <div class="region">${esc(opts.regionName)}</div>
      <div class="title">${HINDI_MONTHS[today.getMonth()]} ${today.getFullYear()} — बकाया सूची</div>
    </div>
    <div class="meta">
      ${opts.regionId !== undefined && opts.regionId !== '' ? `<div>Region: ${esc(opts.regionId)}</div>` : ''}
      <div>दिनांक: ${date}</div>
      <div>ग्राहक: ${due.length}</div>
    </div>
  </div>
  <table>
    <thead><tr><th class="pr">Priority</th><th>Customer</th><th>Address</th><th class="amt">Amt.</th></tr></thead>
    <tbody>${lines || '<tr><td colspan="4" style="text-align:center">कोई बकाया नहीं</td></tr>'}</tbody>
    <tfoot><tr><td></td><td colspan="2">कुल बकाया (${due.length} ग्राहक)</td><td class="amt">${total}</td></tr></tfoot>
  </table>
  <script>window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 300); };</script>
</body></html>`;
}

// Opens the list in its own window and prints it
export function printDueList(rows: any[], opts: DueListOptions): void {
  const html = dueListHtml(rows, opts);
  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }
  // A blocked pop-up: print from a hidden frame instead
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm';
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html.replace(/<script>[\s\S]*?<\/script>/, ''));
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 2000);
  }, 500);
}
