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

  // One box per hawker (like the office's paper sheet): number and name, then each paper's copies.
  // Two boxes side by side, small enough that about 26 hawkers fit one A4 page.
  if (data.layout === 'boxes') {
    const rows = data.groups.flatMap(g => g.rows);
    const papers = data.columns.filter(c => /^p\d+$/.test(c.key));
    const cell = 'border-r border-black px-0.5 text-center last:border-r-0';
    const count = (v: any) => fmt({ key: 'n', label: '', type: 'int' }, v);
    // Each paper's column is as wide as its name needs, the spare room shared out
    const grid = (n: number): React.CSSProperties => ({ gridTemplateColumns: `repeat(${n}, minmax(max-content, 1fr))` });
    return (
      <div className="font-sans">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="border-[1.5px] border-black break-inside-avoid" style={{ breakInside: 'avoid' }}>
              <div className="flex items-stretch border-b-[1.5px] border-black">
                <div className="w-7 shrink-0 border-r-[1.5px] border-black flex items-center justify-center font-black text-[13px]">{r.no}</div>
                <div className="flex-1 px-1.5 py-0.5 font-black text-[13px] text-center leading-tight">{r.hawker}</div>
                <div className="shrink-0 border-l-[1.5px] border-black px-1.5 flex items-center font-black text-[12px] font-mono">{count(r.total) || 0}</div>
              </div>
              <div className="grid border-b border-black text-[8px] font-bold leading-tight" style={grid(papers.length)}>
                {papers.map(c => <div key={c.key} className={`${cell} py-0.5 whitespace-nowrap`}>{c.label}</div>)}
              </div>
              <div className="grid text-[12px] font-black font-mono" style={grid(papers.length)}>
                {papers.map(c => <div key={c.key} className={`${cell} py-0.5 min-h-[20px]`}>{count(r[c.key])}</div>)}
              </div>
            </div>
          ))}
        </div>
        {data.totals && (
          <div className="mt-2 border-[1.5px] border-black break-inside-avoid" style={{ breakInside: 'avoid' }}>
            <div className="grid text-[8px] font-bold border-b border-black" style={grid(papers.length + 1)}>
              {papers.map(c => <div key={c.key} className={`${cell} py-0.5`}>{c.label}</div>)}<div className="px-0.5 text-center py-0.5">कुल</div>
            </div>
            <div className="grid text-[12px] font-black font-mono" style={grid(papers.length + 1)}>
              {papers.map(c => <div key={c.key} className={`${cell} py-0.5`}>{count(data.totals![c.key])}</div>)}<div className="px-0.5 text-center py-0.5">{count(data.totals.total)}</div>
            </div>
          </div>
        )}
        {data.note && <p className="mt-1 text-[10px] text-slate-700">{data.note}</p>}
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
