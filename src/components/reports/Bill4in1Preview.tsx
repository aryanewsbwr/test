import React, { useState, useEffect } from 'react';
import { Printer, ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { 
  BillRecord, 
  BillPrintMode,
  BOY_LOGO_B64, 
  SIGNATURE_GLYPH_B64, 
  printBills4in1 
} from '@/lib/bill4in1Export';
import { getReliableHindiName } from '@/lib/transliteration';
import { roundToFoxProRule } from '@/lib/billingEngine';

interface Bill4in1PreviewProps {
  bills: BillRecord[];
  title?: string;
  zoomLevel?: number;
  initialPrintMode?: BillPrintMode;
}

function formatMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '0.00';
  return Number(n).toFixed(2);
}

export const Bill4in1Preview: React.FC<Bill4in1PreviewProps> = ({
  bills,
  title = 'Region Wise Bill Printing (4 in 1 A4)',
  zoomLevel = 100,
  initialPrintMode = 'simple'
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
    printBills4in1(bills, title, printMode);
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* 4-IN-1 TOOLBAR */}
      <div className="w-full max-w-4xl bg-slate-800 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs mb-3 rounded-t-sm shadow-md print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <span className="font-bold">4-in-1 A4 Format:</span>
          <span className="text-slate-300">
            {bills.length} bills across {totalPages} A4 page{totalPages > 1 ? 's' : ''}
          </span>
        </div>

        {/* Print Mode Selector: Simple (Delivery merged) vs Detail (Delivery separate) */}
        <div className="flex items-center bg-slate-900/90 p-0.5 rounded border border-slate-700">
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
            <span>Print 4-in-1 / Save PDF ({printMode === 'simple' ? 'Simple' : 'Detail'})</span>
          </button>
        </div>
      </div>

      {/* A4 PAGES CONTAINER */}
      <div 
        className="flex flex-col items-center gap-8 w-full print:gap-0"
        style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
      >
        {displayedPages.map((pageBills, pageIdx) => {
          const actualPageNum = viewMode === 'single_sheet' ? currentPage : pageIdx + 1;
          return (
            <div 
              key={pageIdx}
              className="w-[210mm] h-[297mm] max-h-[297mm] bg-white border border-slate-300 shadow-2xl print:border-none print:shadow-none grid grid-cols-2 grid-rows-2 box-border page-break-after-always overflow-hidden"
              style={{ pageBreakAfter: 'always', breakAfter: 'page' }}
            >
              {pageBills.map((b, qIdx) => {
                const isLeft = qIdx % 2 === 0;
                const isTop = qIdx < 2;
                const displayHindi = getReliableHindiName(b.customer_hindi || '', b.customer_name);
                
                const minRows = 4;
                const items = b.items || [];

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
                    rate: null, // Rate is omitted in simple mode
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

                const rowCount = Math.max(displayItems.length, minRows);

                const discountAmount = roundToFoxProRule(b.discount_amount || 0);
                const summaryPaperTotal = printMode === 'simple'
                  ? roundToFoxProRule(Math.max(0, b.paper_amount + (b.delivery_charge || 0) - discountAmount))
                  : roundToFoxProRule(Math.max(0, b.paper_amount - discountAmount));

                const summaryDelivery = printMode === 'simple'
                  ? 0
                  : roundToFoxProRule(b.delivery_charge || 0);

                return (
                  <div 
                    key={b.customer_id || qIdx}
                    className={`p-3 box-border flex flex-col justify-between overflow-hidden bg-white text-black font-sans text-xs ${
                      isLeft ? 'border-r border-dashed border-slate-400' : ''
                    } ${isTop ? 'border-b border-dashed border-slate-400' : ''}`}
                    style={{ height: '148.5mm', maxHeight: '148.5mm' }}
                  >
                    {/* TOP HEADER */}
                    <div className="relative flex items-center justify-center mb-1">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-7 shrink-0 flex items-center justify-center">
                        <img src={BOY_LOGO_B64} alt="logo" className="h-9 w-auto object-contain block" />
                      </div>
                      <div className="w-full text-center px-8">
                        <div className="text-sm font-black text-[#004B87] uppercase tracking-wider font-serif leading-tight">
                          ARYAN NEWS AGENCY<sup className="text-[9px]">®</sup>
                        </div>
                        <div className="text-[9px] text-slate-900 leading-tight font-medium">
                          5 Old Bus stand Beawar
                        </div>
                        <div className="text-[9px] text-slate-900 leading-tight font-medium">
                          Ph: 9462558949, 9829058949
                        </div>
                      </div>
                    </div>

                    {/* BILL NO / MONTH / AC.NO / REGION / CUSTOMER */}
                    <div className="border-t border-black pt-1 mb-1 text-[9px] space-y-0.5">
                      <div className="flex justify-between items-baseline">
                        <div>
                          <span className="font-bold">Bill No: </span>
                          <span className="font-mono"><b>{b.bill_no || b.customer_id}</b></span>
                        </div>
                        <div>
                          <span className="font-bold">Month: </span>
                          <span><b>{b.month} {b.year}</b></span>
                        </div>
                      </div>

                      <div className="flex justify-between items-baseline">
                        <div>
                          <span className="font-bold">Ac.no.: </span>
                          <span className="font-mono"><b>{b.customer_id}</b></span>
                        </div>
                        <div>
                          <span className="font-bold">Region: </span>
                          <span><b>{b.region_name}</b></span>
                        </div>
                      </div>

                      <div className="flex items-baseline truncate">
                        <span className="font-bold mr-1">Customer: </span>
                        <span className="font-bold text-slate-900 truncate">
                          {b.customer_name} {displayHindi && <span className="text-[8px] text-slate-600 font-normal ml-1">({displayHindi})</span>} {b.priority ? `| Pr: ${b.priority}` : ''}
                        </span>
                      </div>
                    </div>

                    {/* PARTICULARS TABLE */}
                    <div className="flex-1 flex flex-col justify-start">
                      <table className="w-full border-collapse text-[9px]">
                        <thead>
                          <tr className="border-y-2 border-black font-extrabold">
                            <th className="py-0.5 px-1 text-left w-[50%] border-r border-black font-black">PARTICULARS</th>
                            <th className="py-0.5 px-0.5 text-center w-[13%] border-r border-black font-black">QTY.</th>
                            <th className="py-0.5 px-1 text-right w-[16%] border-r border-black font-black">RATE</th>
                            <th className="py-0.5 px-1 text-right w-[21%] font-black">AMOUNT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: rowCount }).map((_, rIdx) => {
                            if (rIdx < displayItems.length) {
                              const it = displayItems[rIdx];
                              return (
                                <tr key={rIdx} className="h-4 leading-none">
                                  <td className="py-0.5 px-1 border-r border-black truncate font-medium">{it.pub_name}</td>
                                  <td className="py-0.5 px-0.5 border-r border-black text-center font-mono">{it.qtyOrDays}</td>
                                  <td className="py-0.5 px-1 border-r border-black text-right font-mono">{it.rate !== null && it.rate !== undefined ? formatMoney(it.rate) : ''}</td>
                                  <td className="py-0.5 px-1 text-right font-mono font-bold">{formatMoney(it.amount)}</td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={rIdx} className="h-4 leading-none">
                                <td className="py-0.5 px-1 border-r border-black">&nbsp;</td>
                                <td className="py-0.5 px-0.5 border-r border-black">&nbsp;</td>
                                <td className="py-0.5 px-1 border-r border-black">&nbsp;</td>
                                <td className="py-0.5 px-1">&nbsp;</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* BOTTOM SECTION: UPI + NOTES (LEFT) & SUMMARY (RIGHT) */}
                    <div className="border-t-2 border-black flex h-[48mm] max-h-[48mm]">
                      {/* LEFT: UPI & NOTES */}
                      <div className="w-[63%] border-r border-black pr-1.5 flex flex-col justify-between py-0.5">
                        {/* UPI */}
                        <div className="text-center space-y-0.5">
                          <div className="flex items-center justify-center gap-1.5 text-[8px] font-bold">
                            <span className="text-[#0079C1] font-black italic text-[9px]">UPI</span>
                            <span className="text-slate-700">Google Pay | PhonePe</span>
                            <span className="text-[#00b9f5] font-black">paytm</span>
                          </div>
                          <div className="text-[11px] font-black text-[#004B87] tracking-wider leading-none">
                            &#10145; 94625 58949 &#11013;
                          </div>
                          <div className="text-[7px] font-semibold text-slate-800 leading-tight">
                            कृपया भुगतान के बाद ऊपर दिये गये नम्बर पर व्हाट्सएप द्वारा सूचित करें।
                          </div>
                        </div>

                        <div className="border-t border-black my-0.5"></div>

                        {/* NOTES & SIGNATURE */}
                        <div className="flex items-end justify-between">
                          <div className="text-[6.5px] leading-tight text-slate-900 font-medium space-y-0.5">
                            <div>नोट: 1. बिल का भुगतान कर फर्म की रसीद प्राप्त करना आवश्यक है।</div>
                            <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2. बिल का भुगतान 5 तारीख तक करना आवश्यक है।</div>
                            <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3. सभी विवादों का न्याय क्षेत्र ब्यावर रहेगा।</div>
                          </div>
                          <div className="text-center shrink-0 min-w-[50px]">
                            <img src={SIGNATURE_GLYPH_B64} alt="sig" className="h-3.5 w-auto mx-auto object-contain" />
                            <div className="text-[7.5px] font-bold text-black leading-none mt-0.5">प्रो. मेहुल अग्रवाल</div>
                            <div className="text-[6.5px] italic text-slate-600 leading-none">E.&O.E.</div>
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: SUMMARY BOX */}
                      <div className="w-[37%] flex flex-col justify-between text-[8px]">
                        <div className="flex justify-between items-center py-1 px-1.5 border-b border-black">
                          <span className="text-slate-800">Total</span>
                          <span className="font-mono font-bold text-[9px]">{formatMoney(summaryPaperTotal)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 px-1.5 border-b border-black">
                          <span className="text-slate-800">Delivery Charge</span>
                          <span className="font-mono font-bold text-[9px]">{formatMoney(summaryDelivery)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 px-1.5 border-b border-black">
                          <span className="text-slate-800">Previous Balance</span>
                          <span className="font-mono font-bold text-[9px]">{formatMoney(b.previous_due)}</span>
                        </div>
                        {!!b.paid_amount && (
                          <div className="flex justify-between items-center py-1 px-1.5 border-b border-black">
                            <span className="text-slate-800">Paid This Month</span>
                            <span className="font-mono font-bold text-[9px]">-{formatMoney(b.paid_amount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center py-1.5 px-1.5 bg-slate-50 font-black">
                          <span className="uppercase text-[8.5px]">Grand Total</span>
                          <span className="font-mono text-[10px]">{formatMoney(roundToFoxProRule(b.net_payable))}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
