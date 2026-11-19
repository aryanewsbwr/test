'use client';

import React from 'react';

// Draws a list report from /api/reports/table: a heading, then group by group (a heading row,
// the rows, the group's total), the grand total and a note. Sticker Printing draws labels instead.

interface Column { key: string; label: string; align?: 'left' | 'right' | 'center'; type?: 'money' | 'int' | 'text'; light?: boolean }
interface Group { title?: string; rows: Record<string, any>[]; totals?: Record<string, any> }
export interface TableReportData { kind: 'table'; type: string; title: string; subtitle?: string; columns: Column[]; groups: Group[]; totals?: Record<string, any>; note?: string; layout?: 'table' | 'labels' | 'boxes' }

const fmt = (c: Column, v: any) => {
  if (v === null || v === undefined || v === '') return '';
  if (c.type === 'money') { const n = Number(v); return n ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; }
  if (c.type === 'int') { const n = Number(v); return n ? n.toLocaleString('en-IN') : ''; }
  return String(v);
};
// The customer's name gets room; a long address is kept narrow and small
const widthOf = (c: Column): React.CSSProperties | undefined =>
  c.key === 'customer' || c.key === 'name' ? { minWidth: 150 } : c.key === 'address' ? { maxWidth: 150, fontSize: 10 } : undefined;
// A 'light' column (the details after the name) is printed in normal, not bold, letters
const cellStyle = (c: Column): React.CSSProperties | undefined => (c.light ? { ...widthOf(c), fontWeight: 400 } : widthOf(c));
const alignOf = (c: Column) => (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left');

export const tableRowCount = (d: TableReportData) => d.groups.reduce((s, g) => s + g.rows.length, 0);

// Rows for the CSV export: one line per row, with the group name in front
export function tableReportCsv(d: TableReportData): string[][] {
  const head = ['समूह', ...d.columns.map(c => c.label)];
  const lines: string[][] = [head];
  for (const g of d.groups) {
    for (const r of g.rows) lines.push([g.title || '', ...d.columns.map(c => String(r[c.key] ?? ''))]);
    if (g.totals) lines.push([`${g.title || ''} कुल`, ...d.columns.map(c => String(g.totals?.[c.key] ?? ''))]);
  }
  if (d.totals) lines.push(['कुल', ...d.columns.map(c => String(d.totals?.[c.key] ?? ''))]);
  return lines;
}

export default function TableReportView({ data }: { data: TableReportData }) {
  const count = tableRowCount(data);
  // The page heading above already shows the title and the dates
  const header = null;

  if (count === 0) {
    return <div>{header}<div className="p-12 text-center text-slate-500 font-sans">चुनी तारीखों / फ़िल्टर में कोई रिकॉर्ड नहीं मिला।</div></div>;
  }

  if (data.layout === 'labels') {
    const rows = data.groups.flatMap(g => g.rows);
    return (
      <div className="font-sans">
        {header}
        <div className="grid grid-cols-3 gap-0 border-l border-t border-black">
          {rows.map((r, i) => (
            <div key={i} className="border-r border-b border-black p-2 min-h-[96px] break-inside-avoid" style={{ breakInside: 'avoid' }}>
              <div className="flex justify-between gap-2 text-[10px] font-bold text-slate-700"><span>#{r.id}</span><span>{r.region}{r.priority ? ` · ${r.priority}` : ''}</span></div>
              <div className="text-[14px] font-black leading-tight mt-0.5">{r.name}</div>
              {r.address && <div className="text-[11px] leading-snug">{r.address}</div>}
              {r.phone && <div className="text-[11px] font-mono">{r.phone}</div>}
              {r.papers && <div className="text-[10px] font-bold mt-0.5">{r.papers}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // One box per hawker (like the office's paper sheet), each across the full width of the page:
  // the name and total, each paper's copies, and an empty line to write a note. In priority order,
  // over two A4 pages. Above them a box to write the copies that came in (आवक), below them the total
  // of each paper.
  if (data.layout === 'boxes') {
    const rows = data.groups.flatMap(g => g.rows);
    const papers = data.columns.filter(c => /^p\d+$/.test(c.key));
    const cell = 'border-r border-black px-0.5 text-center last:border-r-0';
    const count = (v: any) => fmt({ key: 'n', label: '', type: 'int' }, v);
    // Every box has the same, equal columns, so the lines run straight down the page
    const grid = (n: number): React.CSSProperties => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` });
    // In the incoming and total boxes नवज्योति, पत्रिका and भास्कर (the big papers) get four times the room of the others
    const BIG = ['नवज्योति', 'पत्रिका', 'भास्कर'];
    const wide: React.CSSProperties = { gridTemplateColumns: [...papers.map(c => (BIG.includes(c.label) ? 'minmax(0, 4fr)' : 'minmax(0, 1fr)')), 'minmax(0, 1fr)'].join(' ') };
    // Heights in mm so that 25 hawkers fill two A4 pages; fewer hawkers get bigger boxes (up to half as big again)
    const k = Math.max(1, Math.min(1.5, 25 / Math.max(rows.length, 1)));
    const line = `${(5 * k).toFixed(2)}mm`;   // a line of copies, and the note line under it
    const head = `${(5.2 * k).toFixed(2)}mm`;
    const names = '3.2mm';
    const strip = (title: string, values: Record<string, any> | null, height: string) => (
      <div className="flex border-[1.5px] border-black break-inside-avoid" style={{ breakInside: 'avoid' }}>
        <div className="w-14 shrink-0 border-r-[1.5px] border-black flex items-center justify-center font-black text-[13px]">{title}</div>
        <div className="flex-1">
          <div className="grid text-[9px] font-bold border-b border-black items-center" style={{ ...wide, height: names }}>
            {papers.map(c => <div key={c.key} className={`${cell} whitespace-nowrap`}>{c.label}</div>)}<div className="px-0.5 text-center">कुल</div>
          </div>
          <div className="grid text-[14px] font-black font-mono" style={{ ...wide, height }}>
            {papers.map(c => <div key={c.key} className={`${cell} flex items-center justify-center`}>{values ? count(values[c.key]) : ''}</div>)}
            <div className="px-0.5 flex items-center justify-center">{values ? count(values.total) : ''}</div>
          </div>
        </div>
      </div>
    );
    // Pages: the first holds the heading, the incoming box and 12 hawkers, the others 13 (the last
    // also the total); fewer, bigger boxes when there are fewer hawkers. Each page is as tall as
    // A4's printable height and its boxes are spread evenly down it, so no paper is left empty.
    const first = Math.max(1, Math.floor(12 / k));
    const rest = Math.max(1, Math.floor(13 / k));
    const pages: Record<string, any>[][] = [rows.slice(0, first)];
    for (let i = first; i < rows.length; i += rest) pages.push(rows.slice(i, i + rest));
    const box = (r: Record<string, any>, i: number) => (
            <div key={i} className="border-[1.5px] border-black flex flex-col overflow-hidden break-inside-avoid" style={{ breakInside: 'avoid' }}>
              <div className="flex items-stretch border-b-[1.5px] border-black" style={{ height: head }}>
                <div className="flex-1 px-1.5 font-black text-[16px] text-center leading-none flex items-center justify-center">{r.hawker}</div>
                <div className="shrink-0 w-16 border-l-[1.5px] border-black px-1.5 flex items-center justify-center font-black text-[15px] font-mono">{count(r.total) || 0}</div>
              </div>
              <div className="grid border-b border-black text-[10px] font-bold items-center" style={{ ...grid(papers.length), height: names }}>
                {papers.map(c => <div key={c.key} className={`${cell} whitespace-nowrap`}>{c.label}</div>)}
              </div>
              <div className="grid border-b-[1.5px] border-black text-[15px] font-black font-mono" style={{ ...grid(papers.length), height: line }}>
                {papers.map(c => <div key={c.key} className={`${cell} flex items-center justify-center`}>{count(r[c.key])}</div>)}
              </div>
              {/* Empty, as tall as the copies line: for a note written by hand */}
              <div style={{ height: line }} />
            </div>
    );
    return (
      <div className="font-sans">
        {pages.map((list, pi) => {
          const last = pi === pages.length - 1;
          return (
            <div key={pi} className="flex flex-col justify-between"
              style={{ height: pi === 0 ? '257mm' : '270mm', breakAfter: last ? 'auto' : 'page', pageBreakAfter: last ? 'auto' : 'always' }}>
              {/* One tall empty line to write the copies that came in */}
              {pi === 0 && strip('आवक', null, '13mm')}
              {list.map((r, i) => box(r, i))}
              {last && data.totals && strip('कुल', data.totals, '6mm')}
              {last && data.note && <p className="text-[10px] text-slate-700">{data.note}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  const cols = data.columns;
  const totalRow = (t: Record<string, any>, strong: boolean, key: string) => (
    <tr key={key} className={strong ? 'border-t-2 border-black bg-slate-200 font-black' : 'border-t border-slate-500 bg-slate-50 font-bold'}>
      {cols.map(c => <td key={c.key} className={`px-1.5 py-1 ${alignOf(c)} ${c.type ? 'font-mono' : ''}`}>{fmt(c, t[c.key])}</td>)}
    </tr>
  );

  return (
    <div className="font-sans">
      {header}
      <table className="w-full border-collapse text-[11px] border border-black">
        <thead>
          <tr className="bg-slate-100 border-b-2 border-black">
            {cols.map(c => <th key={c.key} style={widthOf(c)} className={`px-1.5 py-1 font-bold border-r border-slate-400 ${alignOf(c)}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.groups.map((g, gi) => (
            <React.Fragment key={gi}>
              {g.title && (
                <tr className="bg-[#FFF8E1] border-t border-black">
                  <td colSpan={cols.length} className="px-1.5 py-1 font-black text-[12px]">{g.title}</td>
                </tr>
              )}
              {g.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-black">
                  {cols.map(c => <td key={c.key} style={cellStyle(c)} className={`px-1.5 py-0.5 border-r border-slate-200 ${alignOf(c)} ${c.type ? 'font-mono whitespace-nowrap' : ''}`}>{fmt(c, r[c.key])}</td>)}
                </tr>
              ))}
              {g.totals && data.groups.length > 1 && totalRow(g.totals, false, `t${gi}`)}
            </React.Fragment>
          ))}
          {data.totals && totalRow(data.totals, true, 'grand')}
        </tbody>
      </table>
      {data.note && <p className="mt-2 text-[11px] text-slate-700">{data.note}</p>}
    </div>
  );
}
