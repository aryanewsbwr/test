// Prints just the report page from the Reports screen, on A4, in its own window: no window frame,
// grey background, scroll bars or buttons around it. The page keeps the screen's own styles.

// Shrinks the page when a wide table is wider than the paper, so nothing is cut off at the sides
const FIT = `function fit(d) {
    var s = d.querySelector('.report-sheet'); if (!s) return;
    s.style.zoom = '';
    var over = s.scrollWidth / s.clientWidth;
    if (over > 1.005) s.style.zoom = String(Math.floor(1000 / over) / 1000);
  }`;

export function printSheet(sheet: HTMLElement | null, title: string): void {
  if (!sheet) return;
  const copy = sheet.cloneNode(true) as HTMLElement;
  // Parts marked for the screen only (buttons, tick boxes, reminder status) are left off the paper
  copy.querySelectorAll('.print\\:hidden, [data-noprint]').forEach(el => el.remove());
  // Full A4 width, whatever the zoom on screen
  copy.removeAttribute('style');
  copy.className = 'report-sheet font-serif text-black bg-white';

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(el => {
      if (el instanceof HTMLLinkElement) return `<link rel="stylesheet" href="${el.href}">`;
      return el.outerHTML;
    })
    .join('\n');
  const safeTitle = title.replace(/[<>&"]/g, '');
  const html = `<!doctype html>
<html lang="hi"><head><meta charset="utf-8">
<title>${safeTitle}</title>
${styles}
<style>
  /* Wide side margins, and a little room inside them, so a printer that cannot print near the
     paper's edge does not cut off the left and right borders */
  @page { size: A4; margin: 10mm 14mm 12mm; }
  html, body { background: #fff !important; margin: 0; padding: 0; }
  *, *::before, *::after { box-sizing: border-box; }
  /* Exactly the printable width of A4 (210mm less the side margins); a table wider than this is
     shrunk to fit (see fit below) instead of running off the paper */
  .report-sheet { width: 182mm; max-width: 182mm; padding: 0 1.5mm; font-size: 12.5px; overflow: visible; }
  .report-sheet table { width: 100%; max-width: 100%; }
  /* Darker, bolder text so thin figures read clearly on paper */
  .report-sheet td, .report-sheet th { font-weight: 700; }
  .report-sheet .font-mono { font-weight: 700; }
  .report-sheet td, .report-sheet th, .report-sheet table { border-color: #444 !important; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head>
<body>${copy.outerHTML}
<script>
  ${FIT}
  window.onload = function () {
    var go = function () { fit(document); setTimeout(function () { window.focus(); window.print(); }, 250); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  };
</script>
</body></html>`;

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
    const s = doc.querySelector('.report-sheet') as HTMLElement | null;
    if (s && s.scrollWidth > s.clientWidth * 1.005) s.style.zoom = String(Math.floor(1000 * s.clientWidth / s.scrollWidth) / 1000);
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 2000);
  }, 800);
}
