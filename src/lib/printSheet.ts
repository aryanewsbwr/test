// Prints just the report page from the Reports screen, on A4, in its own window: no window frame,
// grey background, scroll bars or buttons around it. The page keeps the screen's own styles.

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
  @page { size: A4; margin: 10mm; }
  html, body { background: #fff !important; margin: 0; padding: 0; }
  .report-sheet { width: 100%; padding: 0; font-size: 11px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head>
<body>${copy.outerHTML}
<script>
  window.onload = function () {
    var go = function () { setTimeout(function () { window.focus(); window.print(); }, 250); };
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
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 2000);
  }, 800);
}
