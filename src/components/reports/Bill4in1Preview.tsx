import { printBillsPreprinted, preprintedBillsHtml } from '@/lib/billPreprintedExport';
import React, { useState, useEffect } from 'react';
import { company } from '@/lib/companyInfo';
import { createPortal } from 'react-dom';
import { Printer, ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { 
  BillRecord, 
  BillPrintMode,
  BOY_LOGO_B64, 
  SIGNATURE_GLYPH_B64, 
  printBills4in1 
} from '@/lib/bill4in1Export';
import { getReliableHindiName } from '@/lib/transliteration';
import { billRoundOff, formatRoundOff, roundToFoxProRule } from '@/lib/billingEngine';

interface Bill4in1PreviewProps {
  bills: BillRecord[];
  title?: string;
  zoomLevel?: number;
  initialPrintMode?: BillPrintMode;
  // When given, the page and print buttons sit in the report's own toolbar instead of above the pages
  toolbarSlot?: HTMLElement | null;
  // Print only the values onto the shop's own pre-printed sheets
  preprinted?: boolean;
}

function formatMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '0.00';
  return Number(n).toFixed(2);
}

export const Bill4in1Preview: React.FC<Bill4in1PreviewProps> = ({
  bills,
  title = 'Region Wise Bill Printing (4 in 1 A4)',
  zoomLevel = 100,
  initialPrintMode = 'simple',
  toolbarSlot,
  preprinted = false
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'single_sheet' | 'all_sheets'>('single_sheet');
  const [printMode, setPrintMode] = useState<BillPrintMode>(initialPrintMode);

  // Sync printMode whenever parent initialPrintMode changes
  useEffect(() => {
    if (initialPrintMode) {
      setPrintMode(initialPrintMode);
    }
  }, [initialPrintMode]);

  // Chunk bills into groups of 4 (each group = 1 A4 page with 2x2 quadrants: [0=TL, 1=TR, 2=BL, 3=BR])
  const a4Pages: BillRecord[][] = [];
  for (let i = 0; i < bills.length; i += 4) {
    a4Pages.push(bills.slice(i, i + 4));
  }

  const totalPages = Math.max(1, a4Pages.length);
  const displayedPages = viewMode === 'single_sheet' 
    ? [a4Pages[currentPage - 1] || []]
    : a4Pages;

  const handlePrint = () => {
    if (preprinted) printBillsPreprinted(bills, title, printMode);
    else printBills4in1(bills, title, printMode);
  };

  const inToolbar = (bar: React.ReactElement) => (toolbarSlot ? createPortal(<div className="bill-bar-light contents">{bar}</div>, toolbarSlot) : bar);

  return (
    <div className="flex flex-col items-center w-full">
      {/* 4-IN-1 TOOLBAR, in the report toolbar when there is one */}
      {inToolbar(
      <div className="w-full max-w-4xl bg-slate-800 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs mb-3 rounded-t-sm shadow-md print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <span className="font-bold">4-in-1 A4 Format:</span>
          <span className="text-slate-300">
            {bills.length} bills across {totalPages} A4 page{totalPages > 1 ? 's' : ''}
          </span>
        </div>

        {/* Print Mode Selector: Simple (Delivery merged) vs Detail (Delivery separate) */}
        <div className="bill-bar-format flex items-center bg-slate-900/90 p-0.5 rounded border border-slate-700">
          <button
            onClick={() => setPrintMode('simple')}
            className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
              printMode === 'simple'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title="Simple Print: Delivery is merged directly into publication prices (e.g. ₹100 + ₹10 = ₹110)"
          >
            📄 Simple Print (सरल)
          </button>
          <button
            onClick={() => setPrintMode('detail')}
            className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
              printMode === 'detail'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title="Detail Print: Delivery charge is shown separately in the summary box"
          >
            📑 Detail Print (विस्तृत)
          </button>
        </div>

        {/* Page Nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(v => v === 'single_sheet' ? 'all_sheets' : 'single_sheet')}
            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px] font-medium border border-slate-600 cursor-pointer"
          >
            {viewMode === 'single_sheet' ? 'Show All Pages' : 'Show Single Page'}
          </button>

          {viewMode === 'single_sheet' && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded cursor-pointer"
                title="Previous A4 Sheet"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-xs px-1">
                Sheet {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded cursor-pointer"
                title="Next A4 Sheet"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Direct Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Open Dedicated 4-in-1 Print & PDF Export Window"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{preprinted ? 'Print Pre-printed' : 'Print 4-in-1 / Save PDF'} ({printMode === 'simple' ? 'Simple' : 'Detail'})</span>
          </button>
        </div>
      </div>
      )}

      {/* A4 PAGES CONTAINER */}
      <div 
        className="flex flex-col items-center gap-8 w-full print:gap-0"
        style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
      >
        {displayedPages.map((pageBills, pageIdx) => {
          const actualPageNum = viewMode === 'single_sheet' ? currentPage : pageIdx + 1;
          // The same sheet that prints, so the preview is exactly the paper
          return (
            <iframe
              key={`${actualPageNum}-${printMode}`}
              title={`Sheet ${actualPageNum}`}
              srcDoc={preprintedBillsHtml(pageBills, title, printMode, { sheet: true, preview: true, firstSerial: (actualPageNum - 1) * 4 + 1 })}
              className="bg-white border border-slate-300 shadow-2xl"
              style={{ width: '210mm', height: '297mm' }}
            />
          );
        })}
      </div>
    </div>
  );
};
