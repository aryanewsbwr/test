import { cleanOrTransliterateHindi } from '@/lib/transliteration';
import { isDue, dueTotal, byPriority, byRegionThenPriority } from '@/lib/dueRule';

// The due list as it is printed for a region: one line per customer who owes (Amt, Customer, Address), in priority
// order, so the collector can walk the route. Opened in its own window so only the list prints,
// not the screen around it.

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
  // All regions: region by region, each in priority order; one region: priority order
  const due = rows.filter(c => isDue(c.final_balance)).sort(opts.showRegion ? byRegionThenPriority : byPriority);
  const date = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const line = (c: any) => {
    const english = String(c.name || '').trim();
    const hindi = c.name_hindi ? cleanOrTransliterateHindi(c.name_hindi, english) : '';
    // The last word of the English name (2III, NN, Automobiles) helps tell similar names apart
    const tag = hindi ? english.split(/\s+/).pop() || '' : '';
    const address = cleanOrTransliterateHindi(c.address || '', '');
    return `<tr>
      <td class="amt">${Math.round(Number(c.final_balance))}</td>
      <td class="name">${esc(hindi || english)}${tag ? ` <span class="tag">${esc(tag)}</span>` : ''}</td>
      <td class="addr">${esc(address)}</td>
    </tr>`;
  };

  // Each region is its own block, starting on a new page, with its own header and total
  const groups: { name: string; rows: any[] }[] = [];
  for (const c of due) {
    const name = opts.showRegion ? String(c.region_name || '-') : opts.regionName;
    if (!groups.length || groups[groups.length - 1].name !== name) groups.push({ name, rows: [] });
    groups[groups.length - 1].rows.push(c);
  }
  if (!groups.length) groups.push({ name: opts.regionName, rows: [] });
  const block = (g: { name: string; rows: any[] }) => `
  <table class="region-block">
    <thead>
      <tr><th colspan="3" class="headcell">
        <div class="head">
          <div class="when">${date}</div>
          <div class="mid"><div class="region">${esc(g.name)}</div></div>
          <div class="meta">ग्राहक: ${g.rows.length}</div>
        </div>
      </th></tr>
      <tr><th class="amt">Amt.</th><th>Customer</th><th>Address</th></tr>
    </thead>
    <tbody>${g.rows.map(line).join('') || '<tr><td colspan="3" style="text-align:center">कोई बकाया नहीं</td></tr>'}
      <tr class="total"><td class="amt">${dueTotal(g.rows.map(c => c.final_balance))}</td><td colspan="2">कुल बकाया (${g.rows.length} ग्राहक)</td></tr>
    </tbody>
  </table>`;
  const grand = groups.length > 1
    ? `<div class="grand">सभी क्षेत्र: ${groups.length} क्षेत्र, ${due.length} ग्राहक, कुल बकाया ${dueTotal(due.map(c => c.final_balance))}</div>`
    : '';

  return `<!doctype html>
<html lang="hi"><head><meta charset="utf-8">
<title>बकाया सूची - ${esc(opts.regionName)} - ${date.replace(/\//g, '-')}</title>
<style>
  /* The page number sits at the bottom right, so the header stays one line */
  @page { size: A4; margin: 8mm 10mm 10mm; @bottom-right { content: "पेज " counter(page) " / " counter(pages); font-family: 'Mangal', 'Nirmala UI', Arial, sans-serif; font-size: 11px; font-weight: 700; } }
  body { font-family: 'Mangal', 'Nirmala UI', 'Noto Sans Devanagari', Arial, sans-serif; color: #000; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 3px; }
  .when { flex: 1; text-align: left; font-size: 13px; font-weight: 700; }
  .mid { text-align: center; }
  .mid .region { font-size: 30px; font-weight: 900; line-height: 1; }
  .meta { flex: 1; text-align: right; font-size: 13px; font-weight: 700; white-space: nowrap; }
  th.headcell { padding: 0 0 2px; border-bottom: none; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead th { font-size: 13px; text-align: left; border-bottom: 1.5px solid #000; padding: 4px 6px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  td { border-bottom: 1px solid #999; padding: 5px 6px; font-size: 14px; vertical-align: top; }
  .name { font-weight: 600; }
  .tag { font-size: 10px; font-weight: 400; }
  .addr { font-size: 12.5px; width: 42%; }
  .amt { width: 70px; text-align: right; font-weight: 800; font-size: 15px; }
  th.amt { text-align: right; }
  /* The total once, after the last customer, not repeated on every page */
  tr.total td { border-top: 2px solid #000; border-bottom: none; font-weight: 800; font-size: 15px; }
  /* A new region always starts on a new page */
  table.region-block + table.region-block { break-before: page; page-break-before: always; }
  .grand { font-size: 16px; font-weight: 800; padding: 6px; border: 2px solid #000; }
</style></head>
<body>
${groups.map(block).join('')}
  ${grand}
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
