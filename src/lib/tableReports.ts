// The Reports menu's list reports (everything except bills, the Due List and the customer ledgers):
// each one reads the real tables and returns one shape the Reports screen draws the same way:
//   { title, subtitle, columns, groups: [{ title, rows, totals }], totals, note }
// Filters: from / to (dates, 2026-11-01), region, hawker, paper, publisher, collector.
import { supabaseAdmin as db } from './supabaseAdmin';
import { fySuffix } from './financialYear';
import { monthCode } from './backupTables';
import { isDue } from './dueRule';
import { hawkerKey, loadHawkerPriorities, priorityRank } from './hawkerPriority';
import { getReliableHindiName, storedHindiName, cleanOrTransliterateHindi, sushaToUnicode } from './transliteration';

export interface Column { key: string; label: string; align?: 'left' | 'right' | 'center'; type?: 'money' | 'int' | 'text'; light?: boolean }
export interface Group { title?: string; rows: Record<string, any>[]; totals?: Record<string, any> }
export interface TableReport { title: string; subtitle?: string; columns: Column[]; groups: Group[]; totals?: Record<string, any>; note?: string; layout?: 'table' | 'labels' | 'boxes' }
export interface Filters { from: string; to: string; region: number; hawker: number; hawkers?: number[]; pub: number; publisher: number; collector: number; bookFrom?: number; bookTo?: number; customer?: number; kind?: 'newspaper' | 'magazine' | 'all'; layout?: 'table' | 'boxes' }
// One hawker name can have several hawker numbers; choosing the name means all of them
const hawkerOk = (f: Filters, id: number) => !f.hawker || (f.hawkers?.length ? f.hawkers.includes(Number(id)) : Number(id) === f.hawker);

const round = (n: number) => Math.round(n * 100) / 100;

// --- Reading -----------------------------------------------------------------------------------

// Every row of a table (1,000 at a time, several pages at once)
async function all(table: string, columns = '*', filter?: (q: any) => any): Promise<any[]> {
  const base = () => (filter ? filter(db.from(table).select(columns)) : db.from(table).select(columns));
  const { count, error } = await (filter ? filter(db.from(table).select(columns, { count: 'exact', head: true })) : db.from(table).select(columns, { count: 'exact', head: true }));
  if (error) throw new Error(`Could not read ${table}: ${error.message}`);
  const pages = Math.ceil((count || 0) / 1000);
  const out: any[] = [];
  for (let i = 0; i < pages; i += 8) {
    const batch = await Promise.all(Array.from({ length: Math.min(8, pages - i) }, (_, k) =>
      base().range((i + k) * 1000, (i + k) * 1000 + 999).then(({ data, error: e }: any) => {
        if (e) throw new Error(`Could not read ${table}: ${e.message}`);
        return data || [];
      })));
    batch.forEach(b => out.push(...b));
  }
  return out;
}

// 2026-11-05, 05/11/2026, 5-11-2026 or a timestamp -> 2026-11-05
export function iso(value: unknown): string {
  const t = String(value ?? '').trim().split('T')[0].split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
export const dmy = (isoDate: string) => (isoDate ? isoDate.split('-').reverse().join('/') : '');
const inRange = (d: string, f: Filters) => !!d && (!f.from || d >= f.from) && (!f.to || d <= f.to);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
const HINDI_DAY = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
const dayName = (isoDate: string) => HINDI_DAY[new Date(`${isoDate}T00:00:00Z`).getUTCDay()] || '';

interface Masters {
  customers: Map<number, any>;
  regions: Map<number, string>;
  hawkers: Map<number, string>;
  pubs: Map<number, { name: string; english: string; short: string; publish_id: number; magazine: boolean }>;
  publishers: Map<number, string>;
  collectors: Map<number, string>;
}

let mastersCache: { at: number; value: Masters } | null = null;
async function masters(): Promise<Masters> {
  if (mastersCache && Date.now() - mastersCache.at < 60_000) return mastersCache.value;
  const [customers, regions, hawkers, pubs, publishers, collectors] = await Promise.all([
    all('customer', 'customer_id, name_eng, name_hindi, name_hindi_unicode, add1, add2, hindi_add, phone, priority, region_id'),
    all('regiond', 'region_id, region_name'),
    all('hawker', 'hawker_id, name'),
    all('publication', 'publica_id, public_name, pub_hindi, abrv, publish_id, type_p'),
    all('publisher', 'publish_id, name'),
    all('collect', 'Collect_id, name')
  ]);
  // Regions whose name starts with Z are left out of every report, with their customers
  const hidden = new Set(regions.filter(r => /^\s*z/i.test(String(r.region_name || ''))).map(r => Number(r.region_id)));
  const value: Masters = {
    customers: new Map(customers.filter(c => !hidden.has(Number(c.region_id))).map(c => [Number(c.customer_id), c])),
    regions: new Map(regions.filter(r => !hidden.has(Number(r.region_id))).map(r => [Number(r.region_id), String(r.region_name || `#${r.region_id}`).trim()])),
    hawkers: new Map(hawkers.map(h => [Number(h.hawker_id), String(h.name || `#${h.hawker_id}`).trim()])),
    pubs: new Map(pubs.map(p => {
      const english = String(p.public_name || `#${p.publica_id}`).trim();
      return [Number(p.publica_id), { english, name: p.pub_hindi ? cleanOrTransliterateHindi(p.pub_hindi, english) : english, short: String(p.abrv || '').trim() || english, publish_id: Number(p.publish_id) || 0, magazine: /mag|period/i.test(String(p.type_p || '')) }];
    })),
    publishers: new Map(publishers.map(p => [Number(p.publish_id), String(p.name || `#${p.publish_id}`).trim()])),
    collectors: new Map(collectors.map(c => [Number(c.Collect_id), String(c.name || `#${c.Collect_id}`).trim()]))
  };
  mastersCache = { at: Date.now(), value };
  return value;
}

const custName = (m: Masters, id: unknown) => {
  const c = m.customers.get(Number(id));
  if (!c) return `#${id}`;
  return getReliableHindiName(storedHindiName(c), c.name_eng) || String(c.name_eng || '').trim() || `#${id}`;
};
const custAddress = (m: Masters, id: unknown) => {
  const c = m.customers.get(Number(id));
  if (!c) return '';
  const raw = String(c.hindi_add || '').trim();
  const hindi = raw ? (/[ऀ-ॿ]/.test(raw) ? raw : sushaToUnicode(raw)) : '';
  return (hindi || [c.add1, c.add2].filter(Boolean).join(', ')).replace(/(?:\+?91[\s-]?)?[6-9]\d{9}/g, '').replace(/[,\s]+$/, '').trim();
};
const custPhone = (m: Masters, id: unknown) => {
  const c = m.customers.get(Number(id));
  const found = String([c?.phone, c?.add1, c?.add2].filter(Boolean).join(' ')).match(/[6-9]\d{9}/);
  return found ? found[0] : '';
};
const custRegion = (m: Masters, id: unknown) => Number(m.customers.get(Number(id))?.region_id || 0);
const regionName = (m: Masters, id: number) => m.regions.get(id) || (id ? `#${id}` : '-');
const pubName = (m: Masters, id: unknown) => m.pubs.get(Number(id))?.name || `#${id}`;

// This year's receipts with their book number, date received and collector
interface Receipt { id: number; customer_id: number; recp_no: number; manual: string; date: string; month: string; amount: number; less: number; bill_amt: number; mode: string; collector: number; agent: string; bookFrom: number; bookTo: number }
async function receipts(m: Masters): Promise<Receipt[]> {
  const suffix = fySuffix();
  const [rows, books] = await Promise.all([
    all(`receipt${suffix}`, 'id, recp_no, recp_date, customer_id, bill_amt, less_amt, mal_recp_amt, month, remarks'),
    all(`receiptissue${suffix}`, 'Collect_id, ReceiptFrom, ReceiptTo').catch(() => [] as any[])
  ]);
  const ranges = books.map(b => ({ c: Number(b.Collect_id), from: Number(b.ReceiptFrom), to: Number(b.ReceiptTo) })).filter(b => b.from && b.to);
  return rows.map(r => {
    let x: any = {};
    try { x = JSON.parse(r.remarks || '{}'); } catch { x = {}; }
    const manual = String(x.manual_rep_no ?? x.mal_rep_no ?? '').trim();
    const n = Number(manual);
    const book = n ? ranges.find(b => n >= b.from && n <= b.to) : undefined;
    const agentName = String(x.agent || '').trim();
    const byName = agentName ? Array.from(m.collectors.entries()).find(([, name]) => name.toLowerCase() === agentName.toLowerCase())?.[0] : undefined;
    return {
      id: Number(r.id), customer_id: Number(r.customer_id), recp_no: Number(r.recp_no) || 0, manual,
      date: iso(x.mal_recp_dt) || iso(r.recp_date), month: String(r.month || ''),
      amount: Number(r.mal_recp_amt || 0), less: Number(r.less_amt || 0), bill_amt: Number(r.bill_amt || 0),
      mode: String(x.cash_chq || 'Cash'), collector: book?.c || byName || 0, agent: agentName,
      bookFrom: book?.from || 0, bookTo: book?.to || 0
    };
  });
}

// Balance parts for every customer: the Due List's sum (opening dues + bills + delivery - receipts - less)
async function balanceParts(): Promise<Map<number, { opening: number; bills: number; received: number; less: number; balance: number }>> {
  const s = fySuffix();
  const [heads, lines, dels, recs] = await Promise.all([
    all(`billno${s}`, 'customer_id, month, due_amt, dis_amt'),
    all(`bill${s}`, 'customer_id, total_amt'),
    all(`billdel${s}`, 'customer_id, dely'),
    all(`receipt${s}`, 'customer_id, mal_recp_amt, less_amt')
  ]);
  const out = new Map<number, { opening: number; bills: number; received: number; less: number; balance: number }>();
  const get = (id: any) => {
    const k = Number(id);
    if (!out.has(k)) out.set(k, { opening: 0, bills: 0, received: 0, less: 0, balance: 0 });
    return out.get(k)!;
  };
  for (const h of heads) {
    if (monthCode(h.month) === 'due') get(h.customer_id).opening += Number(h.due_amt || 0);
    else get(h.customer_id).bills -= Number(h.dis_amt || 0);
  }
  for (const l of lines) get(l.customer_id).bills += Number(l.total_amt || 0);
  for (const d of dels) get(d.customer_id).bills += Number(d.dely || 0);
  for (const r of recs) { get(r.customer_id).received += Number(r.mal_recp_amt || 0); get(r.customer_id).less += Number(r.less_amt || 0); }
  out.forEach(p => {
    p.opening = round(p.opening); p.bills = round(p.bills); p.received = round(p.received); p.less = round(p.less);
    p.balance = round(p.opening + p.bills - p.received - p.less);
  });
  return out;
}

// Subscriptions with their dates as 2026-11-05, and every stop
// Subscriptions of customers that still exist (a deleted customer's papers are left out)
async function subscriptions(m?: Masters) {
  const rows = (await all('customer_detail', 'sno, customer_id, publica_id, hawker_id, qty, circulation, s_date, c_date'))
    .filter(r => !m || m.customers.has(Number(r.customer_id)));
  return rows.map(r => ({ ...r, customer_id: Number(r.customer_id), publica_id: Number(r.publica_id), hawker_id: Number(r.hawker_id), qty: Number(r.qty || 1), s: iso(r.s_date), c: iso(r.c_date) }));
}
async function stops(m?: Masters) {
  const [a, b] = await Promise.all([all('discontinue', '*'), all('customer_discontinue', '*').catch(() => [] as any[])]);
  return [...a, ...b].map(d => ({
    customer_id: Number(d.customer_id ?? d.Customer_id), publica_id: Number(d.publica_id ?? d.Publica_id ?? 0),
    permanent: String(d.temp_perma ?? d.Temp_Perma ?? '').toUpperCase().startsWith('P'),
    from: iso(d.temp_from ?? d.Temp_From), to: iso(d.temp_to ?? d.Temp_To), entered: iso(d.entry_date ?? d.Entry_Date)
  })).filter(d => d.customer_id && d.from && (!m || m.customers.has(d.customer_id)));
}
const runsOn = (s: { s: string; c: string }, day: string) => (!s.s || s.s <= day) && (!s.c || day < s.c);

// Papers that do not come on a day: closed or stopped from Publication Discontinue, or a holiday.
// A stop or holiday for all papers (paper 0) is for the daily papers only, as in billing.
async function papersOff(day: string, m: Masters): Promise<{ off: Set<number>; recent: Set<number> }> {
  const [dis, hol] = await Promise.all([all('publicationdis', '*').catch(() => [] as any[]), all('holiday', '*').catch(() => [] as any[])]);
  const off = new Set<number>();
  // Closed in the last 60 days, or a holiday: worth naming under the report
  const recent = new Set<number>();
  const since = new Date(Date.parse(`${day}T00:00:00Z`) - 60 * 86400000).toISOString().slice(0, 10);
  let allDailies = false;
  for (const d of dis) {
    const from = iso(d.entry_date ?? d.from_date ?? d.FromDate);
    const to = iso(d.oc_date ?? d.to_date ?? d.ToDate) || '2099-12-31';
    if ((from && day < from) || day > to) continue;
    const id = Number(d.publica_id ?? d.Publica_id ?? 0);
    if (id) { off.add(id); if (!from || from >= since) recent.add(id); } else allDailies = true;
  }
  for (const h of hol) {
    if (iso(h.oc_date ?? h.Oc_Date ?? h.dated) !== day) continue;
    const id = Number(h.publica_id ?? h.Publica_id ?? h.publication_id ?? 0);
    if (id) { off.add(id); recent.add(id); } else allDailies = true;
  }
  if (allDailies) m.pubs.forEach((p, id) => { if (!p.magazine) { off.add(id); recent.add(id); } });
  return { off, recent };
}

// Daily Quantity of Newspaper / Quantity of Magazine: copies each hawker takes on one day, paper by
// paper. Only papers that go out that day: running, not stopped by the customer, not closed or on holiday.
async function quantityByHawker(f: Filters, kind: 'newspaper' | 'magazine' | 'all'): Promise<TableReport> {
  const m = await masters();
  const day = f.from || new Date().toISOString().slice(0, 10);
  const [subs, list, { off, recent }, priorities] = await Promise.all([subscriptions(m), stops(m), papersOff(day, m), loadHawkerPriorities()]);
  const stopped = (s: any) => list.some(d => d.customer_id === s.customer_id && (!d.publica_id || d.publica_id === s.publica_id)
    && (d.permanent ? day >= d.from && !(s.s && s.s >= d.from) : day >= d.from && day <= (d.to || d.from)));
  // Delivery charges are kept as a 'paper' for billing, but are not copies to hand out
  const charge = (id: number) => /del\w*very\s*charge/i.test(m.pubs.get(id)?.english || '');
  const wanted = subs.filter(s => {
    const p = m.pubs.get(s.publica_id);
    return p && (kind === 'all' || p.magazine === (kind === 'magazine')) && !charge(s.publica_id) && runsOn(s, day) && !stopped(s)
      && hawkerOk(f, s.hawker_id) && (!f.region || custRegion(m, s.customer_id) === f.region);
  });
  // One line per hawker name (the same name is saved under several hawker numbers);
  // hawkers whose name starts with Z are not shown
  const hawkerName = (hid: number) => String(m.hawkers.get(Number(hid)) || (Number(hid) ? `#${hid}` : 'बिना हॉकर')).trim();
  // ... and a hawker name without a priority (Hawker Master) is not shown either
  const going = wanted.filter(s => !off.has(s.publica_id) && !/^z/i.test(hawkerName(s.hawker_id))
    && (!priorities || priorities.has(hawkerKey(hawkerName(s.hawker_id)))));
  // Navajyoti is counted in the NJ column (only in this report)
  const shortOf = (id: number) => String(m.pubs.get(id)?.short || '').trim().toLowerCase();
  const njId = Array.from(m.pubs.keys()).find(id => shortOf(id) === 'nj');
  const column = (id: number) => (njId && shortOf(id) === 'navajyoti' ? njId : id);
  // Newspapers in the office's order, then the rest (magazines) by name
  const ORDER = ['nj', 'rp', 'db', 'nafa', 'toi', 'thin', 'et', 'ie', 'ht', 'bl'];
  const place = (id: number) => { const i = ORDER.indexOf(shortOf(id)); return i < 0 ? ORDER.length : i; };
  // The box print shows every one of the office's newspapers, even with no copies, like the paper sheet
  const fixed = f.layout === 'boxes' && kind !== 'magazine'
    ? ORDER.map(k => Array.from(m.pubs.keys()).find(id => shortOf(id) === k)).filter((id): id is number => !!id) : [];
  const paperIds = Array.from(new Set([...fixed, ...going.map(s => column(s.publica_id))]))
    .sort((a, b) => place(a) - place(b) || (m.pubs.get(a)?.english || '').localeCompare(m.pubs.get(b)?.english || ''));
  const rows = groupBy(going, s => hawkerName(s.hawker_id).toLowerCase())
    .map(([, ss]) => {
      const p = priorities?.get(hawkerKey(hawkerName(ss[0].hawker_id)));
      // The hawker's Hindi name (Hawker Master); the English name only when there is none
      const row: Record<string, any> = { hawker: p?.hindi_name || hawkerName(ss[0].hawker_id), no: p ? p.priority : '', priority: priorityRank(p ? p.priority : null), total: sum(ss, 'qty') };
      for (const pid of paperIds) row[`p${pid}`] = sum(ss.filter(s => column(s.publica_id) === pid), 'qty');
      return row;
    })
    .sort((a, b) => a.priority - b.priority || String(a.hawker).localeCompare(String(b.hawker)));
  rows.forEach((r, i) => { r.sno = i + 1; });
  const keys = [...paperIds.map(pid => `p${pid}`), 'total'];
  // Only the closed / holiday papers that customers still have running are worth naming
  const closedNames = Array.from(new Set(wanted.filter(s => recent.has(s.publica_id)).map(s => s.publica_id))).map(id => m.pubs.get(id)?.short || `#${id}`);
  // Box print: the office sheet's Hindi names for the papers
  const BOX_LABEL: Record<string, string> = { nj: 'नवज्योति', rp: 'पत्रिका', db: 'भास्कर', nafa: 'नफा', thin: 'Hindu' };
  const label = (pid: number) => (f.layout === 'boxes' && BOX_LABEL[shortOf(pid)]) || m.pubs.get(pid)?.short || `#${pid}`;
  return {
    layout: f.layout === 'boxes' ? 'boxes' : 'table',
    title: kind === 'magazine' ? 'QUANTITY OF MAGAZINE' : kind === 'all' ? 'DAILY QUANTITY OF NEWSPAPER & MAGAZINE' : 'DAILY QUANTITY OF NEWSPAPER', subtitle: `${dmy(day)} ${dayName(day)}`,
    // Every column centred
    columns: [int('sno', 'क्र.'), text('hawker', 'हॉकर'), ...paperIds.map(pid => int(`p${pid}`, label(pid))), int('total', 'कुल')].map(c => ({ ...c, align: 'center' as const })),
    groups: [{ rows }], totals: totalsOf(rows, keys, { hawker: 'कुल कॉपी' }),
    note: closedNames.length ? `इस दिन बंद / छुट्टी (नहीं गिने): ${closedNames.join(', ')}` : undefined
  };
}

// The hawker who brings a customer a paper (or any of their papers)
function hawkerOf(subs: any[], customerId: number, publicaId = 0): number {
  const mine = subs.filter(s => s.customer_id === customerId && (!publicaId || s.publica_id === publicaId));
  const running = mine.find(s => !s.c) || mine[mine.length - 1];
  return running?.hawker_id || 0;
}

// --- The reports ----------------------------------------------------------------------------

const money = (key: string, label: string): Column => ({ key, label, align: 'right', type: 'money' });
const int = (key: string, label: string): Column => ({ key, label, align: 'right', type: 'int' });
const text = (key: string, label: string, align: Column['align'] = 'left'): Column => ({ key, label, align });
const sum = (rows: any[], key: string) => round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));
const totalsOf = (rows: any[], keys: string[], extra: Record<string, any> = {}) => ({ ...extra, ...Object.fromEntries(keys.map(k => [k, sum(rows, k)])) });
const period = (f: Filters) => (f.from || f.to ? `${dmy(f.from) || '...'} से ${dmy(f.to) || '...'} तक` : 'पूरा साल');
function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) { const k = key(it); if (!map.has(k)) map.set(k, []); map.get(k)!.push(it); }
  return Array.from(map.entries());
}

type Builder = (f: Filters) => Promise<TableReport>;

const receiptRow = (m: Masters, r: Receipt) => ({
  date: dmy(r.date), manual: r.manual || '-', recp_no: r.recp_no, customer: `${custName(m, r.customer_id)} #${r.customer_id}`,
  region: regionName(m, custRegion(m, r.customer_id)), month: r.month, mode: /online|upi|bank/i.test(r.mode) ? 'UPI / बैंक' : r.mode === 'Cheque' ? 'चेक' : 'नकद',
  amount: r.amount, less: r.less, collector: m.collectors.get(r.collector) || r.agent || '-'
});
const receiptFilter = (m: Masters, f: Filters) => (r: Receipt) => m.customers.has(r.customer_id) && inRange(r.date, f)
  && (!f.region || custRegion(m, r.customer_id) === f.region) && (!f.collector || r.collector === f.collector);

export const REPORTS: Record<string, Builder> = {
  async hawker_daily_qty(f) { return quantityByHawker(f, f.kind || 'newspaper'); },
  async hawker_magazine_qty(f) { return quantityByHawker(f, 'magazine'); },

  // Collection Datewise: every payment received, day by day, with the day's total
  async collection_datewise(f) {
    const m = await masters();
    const list = (await receipts(m)).filter(receiptFilter(m, f)).sort((a, b) => a.date.localeCompare(b.date) || a.recp_no - b.recp_no);
    const groups = groupBy(list, r => r.date).map(([d, rs]) => {
      const rows = rs.map(r => receiptRow(m, r));
      return { title: `${dmy(d)} ${dayName(d)} — ${rows.length} रसीद`, rows, totals: totalsOf(rows, ['amount', 'less'], { customer: 'दिन का कुल' }) };
    });
    const rows = list.map(r => receiptRow(m, r));
    const cash = sum(rows.filter(r => r.mode === 'नकद'), 'amount');
    return {
      title: 'COLLECTION DATEWISE', subtitle: period(f),
      columns: [text('manual', 'रसीद नं.'), text('recp_no', 'सि. नं.', 'right'), text('customer', 'ग्राहक'), text('region', 'क्षेत्र'), text('month', 'बिल माह'), text('mode', 'तरीका'), text('collector', 'कलेक्टर'), money('amount', 'राशि'), money('less', 'कटौती')],
      groups, totals: totalsOf(rows, ['amount', 'less'], { customer: `कुल ${rows.length} रसीद` }),
      note: `नकद ₹${cash.toLocaleString('en-IN')} · UPI / बैंक / चेक ₹${round(sum(rows, 'amount') - cash).toLocaleString('en-IN')}`
    };
  },

  // Collection Hawker Datewise: payments by the collector whose receipt book they came from, date by date
  async collection_hawker_datewise(f) {
    const m = await masters();
    const list = (await receipts(m)).filter(receiptFilter(m, f)).sort((a, b) => a.date.localeCompare(b.date) || a.recp_no - b.recp_no);
    const groups = groupBy(list, r => m.collectors.get(r.collector) || r.agent || 'बिना बुक / ऑफिस')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, rs]) => {
        const rows = rs.map(r => receiptRow(m, r));
        return { title: `${name} — ${rows.length} रसीद`, rows, totals: totalsOf(rows, ['amount', 'less'], { customer: `${name} का कुल` }) };
      });
    const rows = list.map(r => receiptRow(m, r));
    return {
      title: 'COLLECTION HAWKER DATEWISE', subtitle: period(f),
      columns: [text('date', 'तारीख'), text('manual', 'रसीद नं.'), text('customer', 'ग्राहक'), text('region', 'क्षेत्र'), text('month', 'बिल माह'), text('mode', 'तरीका'), money('amount', 'राशि'), money('less', 'कटौती')],
      groups, totals: totalsOf(rows, ['amount', 'less'], { customer: `कुल ${rows.length} रसीद` }),
      note: 'कलेक्टर: जिसकी रसीद बुक में वह रसीद नंबर है।'
    };
  },

  // Receipt report (Receipt Number Wise and Actual Amount, one report): receipts in receipt-number
  // order with what was received. One collector or one receipt book chosen -> shown in the heading.
  async receipt_nowise(f) {
    const m = await masters();
    const list = (await receipts(m)).filter(receiptFilter(m, f))
      .filter(r => !f.bookFrom || (Number(r.manual) >= f.bookFrom && Number(r.manual) <= (f.bookTo || 0)))
      .sort((a, b) => (Number(a.manual) || 9e12) - (Number(b.manual) || 9e12) || a.recp_no - b.recp_no);
    const rows = list.map(r => ({
      date: dmy(r.date), manual: r.manual || '-', amount: r.amount, customer: custName(m, r.customer_id),
      region: regionName(m, custRegion(m, r.customer_id)), less: r.less, bill_amt: r.bill_amt, diff: round(r.bill_amt - r.amount - r.less),
      book: r.bookFrom ? `${r.bookFrom}-${r.bookTo}` : '-', collector: m.collectors.get(r.collector) || r.agent || '-', id: r.customer_id
    }));
    const nums = list.map(r => Number(r.manual)).filter(n => n > 0);
    // Receipt numbers skipped inside a run (cancelled or not entered), written as 101, 105-107
    const missing: string[] = [];
    let gaps = 0;
    for (let i = 1; i < nums.length; i++) {
      const jump = nums[i] - nums[i - 1];
      if (jump > 1 && jump < 50) {
        gaps += jump - 1;
        missing.push(jump === 2 ? String(nums[i - 1] + 1) : `${nums[i - 1] + 1}-${nums[i] - 1}`);
      }
    }
    const light = (c: Column): Column => ({ ...c, light: true });
    const heading = [period(f)];
    if (f.collector) heading.push(`कलेक्टर: ${m.collectors.get(f.collector) || `#${f.collector}`}`);
    if (f.bookFrom) heading.push(`रसीद बुक: ${f.bookFrom}-${f.bookTo}`);
    return {
      title: 'RECEIPT REPORT', subtitle: heading.join(' · '),
      columns: [
        text('date', 'तारीख'), text('manual', 'रसीद नं.'), money('amount', 'प्राप्त'), text('customer', 'नाम'),
        light(text('region', 'क्षेत्र')), light(money('less', 'कटौती')), light(money('bill_amt', 'बिल राशि')), light(money('diff', 'बाकी')),
        ...(f.bookFrom ? [] : [light(text('book', 'बुक'))]),
        ...(f.collector ? [] : [light(text('collector', 'कलेक्टर'))]),
        light(text('id', 'ग्राहक नं.', 'right'))
      ],
      groups: [{ rows }], totals: totalsOf(rows, ['amount', 'less', 'bill_amt', 'diff'], { customer: `कुल ${rows.length} रसीद` }),
      note: [gaps ? `बीच में ${gaps} रसीद नंबर नहीं मिले (रद्द या बाकी): ${missing.slice(0, 200).join(', ')}${missing.length > 200 ? ' …' : ''}` : '', 'बाकी = बिल राशि − प्राप्त − कटौती (माइनस = बिल से ज़्यादा जमा)'].filter(Boolean).join(' · ')
    };
  },
  // The old "Actual Amount Receipt" menu item opens the same report
  async receipt_realamt(f) { return REPORTS.receipt_nowise(f); },

  // Customer Outstanding Dues Ledger: every customer's balance, region by region
  async dues_ledger(f) {
    const m = await masters();
    const parts = await balanceParts();
    const list = Array.from(m.customers.values())
      .filter(c => (!f.region || Number(c.region_id) === f.region))
      .map(c => ({ c, p: parts.get(Number(c.customer_id)) }))
      .filter(x => x.p && (isDue(x.p.balance) || x.p.balance < 0))
      .sort((a, b) => Number(a.c.region_id) - Number(b.c.region_id) || Number(a.c.priority) - Number(b.c.priority));
    const row = (x: any) => ({
      customer: `${custName(m, x.c.customer_id)} #${x.c.customer_id}`, address: custAddress(m, x.c.customer_id), phone: custPhone(m, x.c.customer_id),
      opening: x.p.opening, bills: x.p.bills, received: x.p.received, less: x.p.less,
      due: x.p.balance > 0 ? x.p.balance : 0, advance: x.p.balance < 0 ? -x.p.balance : 0
    });
    const groups = groupBy(list, x => regionName(m, Number(x.c.region_id))).map(([name, xs]) => {
      const rows = xs.map(row);
      return { title: `${name} — ${rows.length} ग्राहक`, rows, totals: totalsOf(rows, ['opening', 'bills', 'received', 'less', 'due', 'advance'], { customer: 'क्षेत्र का कुल' }) };
    });
    const rows = list.map(row);
    return {
      title: 'CUSTOMER OUTSTANDING DUES LEDGER', subtitle: `${fySuffix().slice(0, 4)}-${fySuffix().slice(6)} · आज तक`,
      columns: [text('customer', 'ग्राहक'), text('address', 'पता'), text('phone', 'फ़ोन'), money('opening', 'पिछला बकाया'), money('bills', 'इस साल के बिल'), money('received', 'जमा'), money('less', 'कटौती'), money('due', 'बकाया'), money('advance', 'एडवांस')],
      groups, totals: totalsOf(rows, ['opening', 'bills', 'received', 'less', 'due', 'advance'], { customer: `कुल ${rows.length} ग्राहक` })
    };
  },

  // Previous Dues Wise: customers who came into this year owing, and how much of that is still unpaid
  async previous_dues_wise(f) {
    const m = await masters();
    const parts = await balanceParts();
    const list = Array.from(m.customers.values())
      .filter(c => (!f.region || Number(c.region_id) === f.region))
      .map(c => ({ c, p: parts.get(Number(c.customer_id)) }))
      .filter(x => x.p && x.p.opening >= 1)
      .map(x => ({ ...x, still: round(Math.max(0, Math.min(x.p!.opening, x.p!.balance))) }))
      .sort((a, b) => b.still - a.still || b.p!.opening - a.p!.opening);
    const rows = list.map(x => ({
      customer: `${custName(m, x.c.customer_id)} #${x.c.customer_id}`, region: regionName(m, Number(x.c.region_id)), phone: custPhone(m, x.c.customer_id),
      opening: x.p!.opening, received: x.p!.received, balance: x.p!.balance, still: x.still
    }));
    return {
      title: 'PREVIOUS DUES WISE', subtitle: 'पिछले साल का बकाया और उसमें से अभी बाकी',
      columns: [text('customer', 'ग्राहक'), text('region', 'क्षेत्र'), text('phone', 'फ़ोन'), money('opening', 'पिछला बकाया'), money('received', 'इस साल जमा'), money('balance', 'कुल बकाया अभी'), money('still', 'पिछले में से बाकी')],
      groups: [{ rows }], totals: totalsOf(rows, ['opening', 'received', 'balance', 'still'], { customer: `कुल ${rows.length} ग्राहक` }),
      note: 'पिछले में से बाकी = पिछला बकाया या अभी का कुल बकाया, जो कम हो।'
    };
  },

  // Collection Agent Dues: each collector's receipt books, what was collected from them and what is left
  async collection_agent_dues(f) {
    const m = await masters();
    const [books, recs] = await Promise.all([all(`receiptissue${fySuffix()}`, '*').catch(() => [] as any[]), receipts(m)]);
    // With dates chosen, only the books that have receipts in those dates (or were given out in them)
    const dated = !!(f.from || f.to);
    const list = books.filter(b => !f.collector || Number(b.Collect_id) === f.collector)
      .map(b => {
        const from = Number(b.ReceiptFrom) || 0, to = Number(b.ReceiptTo) || 0;
        const inBook = recs.filter(r => { const n = Number(r.manual); return n >= from && n <= to; });
        const used = inBook.filter(r => inRange(r.date, f));
        const issuedOn = iso(b.IssueDate);
        return {
          collector: Number(b.Collect_id), book: `${from} - ${to}`, issued: dmy(issuedOn), returned: b.RecDate ? dmy(iso(b.RecDate)) : 'बाकी',
          receipts: new Set(used.map(r => r.manual)).size, amount: sum(used, 'amount'),
          unused: Math.max(0, to - from + 1 - new Set(inBook.map(r => r.manual)).size),
          show: !dated || used.length > 0 || inRange(issuedOn, f)
        };
      })
      .filter(b => b.show)
      .sort((a, b) => a.collector - b.collector || a.book.localeCompare(b.book, undefined, { numeric: true }));
    const groups = groupBy(list, b => m.collectors.get(b.collector) || `#${b.collector}`).map(([name, rows]) => ({
      title: `${name} — ${rows.length} बुक`, rows, totals: totalsOf(rows, ['receipts', 'amount', 'unused'], { book: 'कुल' })
    }));
    return {
      title: 'COLLECTION AGENT REPORT', subtitle: period(f) + (f.collector ? ` · ${m.collectors.get(f.collector) || ''}` : ''),
      columns: [text('book', 'रसीद बुक'), text('issued', 'दी गई'), text('returned', 'वापस आई'), int('receipts', 'कटी रसीद'), money('amount', 'वसूली राशि'), int('unused', 'बची रसीद')],
      groups, totals: totalsOf(list, ['receipts', 'amount', 'unused'], { book: `कुल ${list.length} बुक` }),
      note: 'चुनी तारीखों में जिन बुक से रसीद कटी (या जो बुक दी गई) वही दिख रही हैं। कटी रसीद / वसूली: इन्हीं तारीखों की। बची रसीद: पूरी बुक में अब तक। "बाकी" = बुक अभी वापस नहीं आई।'
    };
  },

  // Discontinue Date Wise: stops starting in the period, day by day
  async discontinue_datewise(f) {
    const m = await masters();
    const list = (await stops(m)).filter(d => inRange(d.from, f) && (!f.region || custRegion(m, d.customer_id) === f.region))
      .sort((a, b) => a.from.localeCompare(b.from) || a.customer_id - b.customer_id);
    const row = (d: any) => ({
      customer: `${custName(m, d.customer_id)} #${d.customer_id}`, region: regionName(m, custRegion(m, d.customer_id)), address: custAddress(m, d.customer_id),
      paper: d.publica_id ? pubName(m, d.publica_id) : 'सभी अखबार', type: d.permanent ? 'हमेशा के लिए' : 'छुट्टी',
      from: dmy(d.from), to: d.permanent ? '-' : dmy(d.to), days: d.permanent ? '' : daysBetween(d.from, d.to || d.from)
    });
    const groups = groupBy(list, d => d.from).map(([day, ds]) => ({ title: `${dmy(day)} ${dayName(day)} — ${ds.length}`, rows: ds.map(row) }));
    return {
      title: 'DISCONTINUE DATE WISE', subtitle: period(f),
      columns: [text('customer', 'ग्राहक'), text('region', 'क्षेत्र'), text('address', 'पता'), text('paper', 'अखबार'), text('type', 'किस तरह'), text('from', 'कब से'), text('to', 'कब तक'), int('days', 'दिन')],
      groups, totals: { customer: `कुल ${list.length} बंद` }
    };
  },

  // Discontinue Hawker Wise With Address: stops in force during the period, by the hawker who delivers
  async discontinue_hawkerwise(f) {
    const m = await masters();
    const [subs, list] = await Promise.all([subscriptions(m), stops(m)]);
    const from = f.from || '0000-01-01', to = f.to || '9999-12-31';
    const active = list.filter(d => (d.permanent ? d.from <= to && d.from >= from : d.from <= to && (d.to || d.from) >= from))
      .map(d => ({ ...d, hawker: hawkerOf(subs, d.customer_id, d.publica_id) }))
      .filter(d => hawkerOk(f, d.hawker) && (!f.region || custRegion(m, d.customer_id) === f.region))
      .sort((a, b) => a.hawker - b.hawker || Number(m.customers.get(a.customer_id)?.priority || 0) - Number(m.customers.get(b.customer_id)?.priority || 0));
    const groups = groupBy(active, d => m.hawkers.get(d.hawker) || 'हॉकर नहीं').map(([name, ds]) => ({
      title: `${name} — ${ds.length}`,
      rows: ds.map(d => ({
        priority: Number(m.customers.get(d.customer_id)?.priority || 0) || '', customer: `${custName(m, d.customer_id)} #${d.customer_id}`,
        address: custAddress(m, d.customer_id), phone: custPhone(m, d.customer_id), paper: d.publica_id ? pubName(m, d.publica_id) : 'सभी अखबार',
        type: d.permanent ? 'हमेशा के लिए' : 'छुट्टी', from: dmy(d.from), to: d.permanent ? '-' : dmy(d.to)
      }))
    }));
    return {
      title: 'DISCONTINUE HAWKER WISE WITH ADDRESS', subtitle: period(f),
      columns: [int('priority', 'क्रम'), text('customer', 'ग्राहक'), text('address', 'पता'), text('phone', 'फ़ोन'), text('paper', 'अखबार'), text('type', 'किस तरह'), text('from', 'कब से'), text('to', 'कब तक')],
      groups, totals: { customer: `कुल ${active.length} बंद` }
    };
  },

  // Purchase Date Wise: publishers' bills by the date they were received
  async purchase_datewise(f) {
    const m = await masters();
    const [bills, lines] = await Promise.all([all('purchase', '*'), all('purchasedetail', 'Purchase_id, Qty')]);
    const copies = new Map<number, number>();
    lines.forEach(l => copies.set(Number(l.Purchase_id), (copies.get(Number(l.Purchase_id)) || 0) + Number(l.Qty || 0)));
    const list = bills.map(b => ({ ...b, d: iso(b.R_Date) }))
      .filter(b => inRange(b.d, f) && (!f.publisher || Number(b.Publish_id) === f.publisher))
      .sort((a, b) => a.d.localeCompare(b.d) || Number(a.Purchase_id) - Number(b.Purchase_id));
    const row = (b: any) => ({
      publisher: m.publishers.get(Number(b.Publish_id)) || `#${b.Publish_id}`, bill_no: b.Bill_No, bill_date: dmy(iso(b.Bill_Date)), id: Number(b.Purchase_id),
      copies: copies.get(Number(b.Purchase_id)) || 0, total: Number(b.Total || 0), addless: Number(b.Addless || 0), net: Number(b.NetAmt || 0)
    });
    const groups = groupBy(list, b => b.d).map(([d, bs]) => {
      const rows = bs.map(row);
      return { title: `${dmy(d)} ${dayName(d)}`, rows, totals: totalsOf(rows, ['copies', 'total', 'addless', 'net'], { publisher: 'दिन का कुल' }) };
    });
    const rows = list.map(row);
    return {
      title: 'PURCHASE DATE WISE', subtitle: period(f),
      columns: [text('publisher', 'Publisher'), text('bill_no', 'बिल नं.'), text('bill_date', 'बिल तारीख'), int('copies', 'कॉपी'), money('total', 'राशि'), money('addless', 'जोड़ / घटा'), money('net', 'कुल (Net)')],
      groups, totals: totalsOf(rows, ['copies', 'total', 'addless', 'net'], { publisher: `कुल ${rows.length} बिल` })
    };
  },

  // Purchase Publisher Wise: each publisher's papers bought in the period (copies, rate, amount)
  async purchase_publisherwise(f) {
    const m = await masters();
    const [bills, lines] = await Promise.all([all('purchase', '*'), all('purchasedetail', '*')]);
    const billOf = new Map(bills.map(b => [Number(b.Purchase_id), { ...b, d: iso(b.R_Date) }]));
    const used = lines.map(l => ({ ...l, bill: billOf.get(Number(l.Purchase_id)) }))
      .filter(l => l.bill && inRange(l.bill.d, f) && (!f.publisher || Number(l.bill.Publish_id) === f.publisher) && (!f.pub || Number(l.Publica_id) === f.pub));
    const groups = groupBy(used, l => m.publishers.get(Number(l.bill.Publish_id)) || `#${l.bill.Publish_id}`).sort((a, b) => a[0].localeCompare(b[0])).map(([name, ls]) => {
      const rows = groupBy(ls, l => `${l.Publica_id}|${l.Day || ''}`).map(([, xs]) => {
        const qty = sum(xs, 'Qty'), amount = sum(xs, 'Amt');
        return { paper: pubName(m, xs[0].Publica_id), day: xs[0].Day || '', bills: new Set(xs.map(x => x.Purchase_id)).size, qty, rate: qty ? round(amount / qty) : 0, amount };
      }).sort((a, b) => a.paper.localeCompare(b.paper));
      return { title: name, rows, totals: totalsOf(rows, ['qty', 'amount'], { paper: `${name} का कुल` }) };
    });
    const rowsAll = groups.flatMap(g => g.rows);
    return {
      title: 'PURCHASE PUBLISHER WISE', subtitle: period(f),
      columns: [text('paper', 'पेपर'), text('day', 'दिन'), int('bills', 'बिल'), int('qty', 'कॉपी'), money('rate', 'औसत रेट'), money('amount', 'राशि')],
      groups, totals: totalsOf(rowsAll, ['qty', 'amount'], { paper: 'कुल' })
    };
  },

  // Counter Sale Date Wise
  async countersale_datewise(f) {
    const m = await masters();
    const list = (await all('countersale', '*')).map(s => ({ ...s, d: iso(s.vr_date ?? s.sale_date), qty: Number(s.copies ?? s.qty ?? 0), amt: Number(s.amt ?? s.Amt ?? 0) }))
      .filter(s => inRange(s.d, f) && (!f.pub || Number(s.publica_id) === f.pub)).sort((a, b) => a.d.localeCompare(b.d));
    const row = (s: any) => ({ paper: pubName(m, s.publica_id), qty: s.qty, rate: Number(s.rate || 0) || (s.qty ? round(s.amt / s.qty) : 0), amount: s.amt, remark: s.remark || '' });
    const groups = groupBy(list, s => s.d).map(([d, ss]) => {
      const rows = ss.map(row);
      return { title: `${dmy(d)} ${dayName(d)}`, rows, totals: totalsOf(rows, ['qty', 'amount'], { paper: 'दिन का कुल' }) };
    });
    const rows = list.map(row);
    return {
      title: 'COUNTER SALE DATE WISE', subtitle: period(f),
      columns: [text('paper', 'पेपर'), int('qty', 'कॉपी'), money('rate', 'रेट'), money('amount', 'राशि'), text('remark', 'नोट')],
      groups, totals: totalsOf(rows, ['qty', 'amount'], { paper: 'कुल' })
    };
  },

  // Counter Sale Publication Wise
  async countersale_pubwise(f) {
    const m = await masters();
    const list = (await all('countersale', '*')).map(s => ({ ...s, d: iso(s.vr_date ?? s.sale_date), qty: Number(s.copies ?? s.qty ?? 0), amt: Number(s.amt ?? s.Amt ?? 0) }))
      .filter(s => inRange(s.d, f) && (!f.pub || Number(s.publica_id) === f.pub));
    const rows = groupBy(list, s => String(s.publica_id)).map(([id, ss]) => ({
      paper: pubName(m, id), days: new Set(ss.map(s => s.d)).size, qty: sum(ss, 'qty'), amount: sum(ss, 'amt')
    })).sort((a, b) => b.amount - a.amount);
    return {
      title: 'COUNTER SALE PUBLICATION WISE', subtitle: period(f),
      columns: [text('paper', 'पेपर'), int('days', 'दिन'), int('qty', 'कॉपी'), money('amount', 'राशि')],
      groups: [{ rows }], totals: totalsOf(rows, ['qty', 'amount'], { paper: 'कुल' })
    };
  },

  // Retail Sale (to permanent customers) Region Date Wise
  async retailsale_region_datewise(f) {
    const m = await masters();
    const list = (await all(`retailsale${fySuffix()}`, '*')).map(s => ({ ...s, d: iso(s.vr_date ?? s.Vr_Date), cid: Number(s.customer_id ?? s.Customer_id) }))
      // One customer chosen -> only that customer (region is then not used)
      .filter(s => inRange(s.d, f) && (f.customer ? s.cid === f.customer : (!f.region || custRegion(m, s.cid) === f.region)) && (!f.pub || Number(s.publica_id) === f.pub))
      .sort((a, b) => custRegion(m, a.cid) - custRegion(m, b.cid) || a.d.localeCompare(b.d));
    const row = (s: any) => ({ date: dmy(s.d), customer: `${custName(m, s.cid)} #${s.cid}`, paper: pubName(m, s.publica_id), qty: Number(s.copies || 0), rate: Number(s.rate || 0), amount: Number(s.amt || 0), narr: s.narr || '' });
    const groups = groupBy(list, s => regionName(m, custRegion(m, s.cid))).map(([name, ss]) => {
      const rows = ss.map(row);
      return { title: name, rows, totals: totalsOf(rows, ['qty', 'amount'], { customer: 'क्षेत्र का कुल' }) };
    });
    const rows = list.map(row);
    return {
      title: 'RETAIL SALE REGION DATE WISE', subtitle: [period(f), f.customer ? `ग्राहक: ${custName(m, f.customer)} #${f.customer}` : ''].filter(Boolean).join(' · '),
      columns: [text('date', 'तारीख'), text('customer', 'ग्राहक'), text('paper', 'पेपर'), int('qty', 'कॉपी'), money('rate', 'रेट'), money('amount', 'राशि'), text('narr', 'नोट')],
      groups, totals: totalsOf(rows, ['qty', 'amount'], { customer: `कुल ${rows.length}` })
    };
  },

  // Consolidated Sale: each paper's sale in the period: customer bills, counter sale, retail sale
  async consolidated_sale(f) {
    const m = await masters();
    const s = fySuffix();
    const months = new Set<string>();
    if (f.from && f.to) {
      for (let d = new Date(`${f.from.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 7) <= f.to.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
        months.add(d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase());
      }
    }
    const [bills, counter, retail] = await Promise.all([
      all(`bill${s}`, 'publica_id, qty, total_amt, month'),
      all('countersale', '*'),
      all(`retailsale${s}`, '*')
    ]);
    const map = new Map<number, { bill: number; billQty: number; counter: number; retail: number }>();
    const get = (id: any) => { const k = Number(id); if (!map.has(k)) map.set(k, { bill: 0, billQty: 0, counter: 0, retail: 0 }); return map.get(k)!; };
    for (const b of bills) if (!months.size || months.has(monthCode(b.month))) { const g = get(b.publica_id); g.bill += Number(b.total_amt || 0); g.billQty += Number(b.qty || 0); }
    for (const c of counter) if (inRange(iso(c.vr_date ?? c.sale_date), f)) get(c.publica_id).counter += Number(c.amt ?? c.Amt ?? 0);
    for (const r of retail) if (inRange(iso(r.vr_date ?? r.Vr_Date), f)) get(r.publica_id).retail += Number(r.amt || 0);
    const rows = Array.from(map.entries()).filter(([id]) => !f.pub || id === f.pub).map(([id, g]) => ({
      paper: pubName(m, id), bill_qty: g.billQty, bill: round(g.bill), counter: round(g.counter), retail: round(g.retail), total: round(g.bill + g.counter + g.retail)
    })).filter(r => r.total).sort((a, b) => b.total - a.total);
    return {
      title: 'CONSOLIDATED SALE', subtitle: period(f),
      columns: [text('paper', 'पेपर'), int('bill_qty', 'बिल कॉपी'), money('bill', 'ग्राहक बिल'), money('counter', 'काउंटर सेल'), money('retail', 'रिटेल सेल'), money('total', 'कुल बिक्री')],
      groups: [{ rows }], totals: totalsOf(rows, ['bill_qty', 'bill', 'counter', 'retail', 'total'], { paper: 'कुल' }),
      note: 'ग्राहक बिल चुने महीनों के बने बिलों से (डिलीवरी चार्ज और छूट के बिना); काउंटर और रिटेल चुनी तारीखों से।'
    };
  },

  // Daily / Periodic Sale: day by day: counter sale, retail sale and money received
  async daily_sale(f) {
    const m = await masters();
    const [counter, retail, recs] = await Promise.all([all('countersale', '*'), all(`retailsale${fySuffix()}`, '*'), receipts(m)]);
    const days = new Map<string, { counter: number; retail: number; received: number; receipts: number }>();
    const get = (d: string) => { if (!days.has(d)) days.set(d, { counter: 0, retail: 0, received: 0, receipts: 0 }); return days.get(d)!; };
    for (const c of counter) { const d = iso(c.vr_date ?? c.sale_date); if (inRange(d, f)) get(d).counter += Number(c.amt ?? c.Amt ?? 0); }
    for (const r of retail) { const d = iso(r.vr_date ?? r.Vr_Date); if (inRange(d, f)) get(d).retail += Number(r.amt || 0); }
    for (const r of recs) if (inRange(r.date, f)) { get(r.date).received += r.amount; get(r.date).receipts++; }
    const rows = Array.from(days.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({
      date: `${dmy(d)} ${dayName(d)}`, counter: round(v.counter), retail: round(v.retail), sale: round(v.counter + v.retail), receipts: v.receipts, received: round(v.received)
    }));
    return {
      title: 'DAILY / PERIODIC SALE', subtitle: period(f),
      columns: [text('date', 'तारीख'), money('counter', 'काउंटर सेल'), money('retail', 'रिटेल सेल'), money('sale', 'कुल बिक्री'), int('receipts', 'रसीद'), money('received', 'वसूली')],
      groups: [{ rows }], totals: totalsOf(rows, ['counter', 'retail', 'sale', 'receipts', 'received'], { date: 'कुल' })
    };
  },

  // Region-Wise Start End: papers started and stopped in the period, region by region
  async region_start_end(f) {
    const m = await masters();
    const [subs, list] = await Promise.all([subscriptions(m), stops(m)]);
    const events: any[] = [];
    for (const s of subs) {
      if (inRange(s.s, f)) events.push({ cid: s.customer_id, pub: s.publica_id, qty: s.qty, kind: 'शुरू', d: s.s });
      if (s.c && inRange(s.c, f)) events.push({ cid: s.customer_id, pub: s.publica_id, qty: s.qty, kind: 'बंद', d: s.c });
    }
    // A permanent stop that did not close its subscription row is also an end
    for (const d of list) if (d.permanent && inRange(d.from, f) && !events.some(e => e.kind === 'बंद' && e.cid === d.customer_id && (!d.publica_id || e.pub === d.publica_id))) {
      events.push({ cid: d.customer_id, pub: d.publica_id, qty: '', kind: 'बंद', d: d.from });
    }
    const shown = events.filter(e => (!f.region || custRegion(m, e.cid) === f.region) && (!f.pub || e.pub === f.pub))
      .sort((a, b) => custRegion(m, a.cid) - custRegion(m, b.cid) || a.d.localeCompare(b.d));
    const groups = groupBy(shown, e => regionName(m, custRegion(m, e.cid))).map(([name, es]) => {
      const started = es.filter(e => e.kind === 'शुरू').length, ended = es.length - started;
      return {
        title: `${name} — शुरू ${started} · बंद ${ended}`,
        rows: es.map(e => ({ date: dmy(e.d), kind: e.kind, customer: `${custName(m, e.cid)} #${e.cid}`, paper: e.pub ? pubName(m, e.pub) : 'सभी अखबार', qty: e.qty })),
        totals: { customer: `शुरू ${started} · बंद ${ended} · फ़र्क ${started - ended}` }
      };
    });
    const started = shown.filter(e => e.kind === 'शुरू').length;
    return {
      title: 'REGION-WISE START END', subtitle: period(f),
      columns: [text('date', 'तारीख'), text('kind', 'शुरू / बंद', 'center'), text('customer', 'ग्राहक'), text('paper', 'अखबार'), int('qty', 'कॉपी')],
      groups, totals: { customer: `कुल शुरू ${started} · बंद ${shown.length - started} · फ़र्क ${started - (shown.length - started)}` }
    };
  },

  // Customer Publication Starting: papers started in the period
  async cust_pub_starting(f) {
    const m = await masters();
    const list = (await subscriptions(m)).filter(s => inRange(s.s, f) && (!f.pub || s.publica_id === f.pub) && hawkerOk(f, s.hawker_id) && (!f.region || custRegion(m, s.customer_id) === f.region))
      .sort((a, b) => a.s.localeCompare(b.s));
    const groups = groupBy(list, s => pubName(m, s.publica_id)).sort((a, b) => a[0].localeCompare(b[0])).map(([name, ss]) => ({
      title: `${name} — ${ss.length}`,
      rows: ss.map(s => ({ date: dmy(s.s), customer: `${custName(m, s.customer_id)} #${s.customer_id}`, region: regionName(m, custRegion(m, s.customer_id)), address: custAddress(m, s.customer_id), hawker: m.hawkers.get(s.hawker_id) || '-', qty: s.qty, status: s.c ? `बंद ${dmy(s.c)}` : 'चालू' })),
      totals: totalsOf(ss, ['qty'], { customer: `${ss.length} ग्राहक` })
    }));
    return {
      title: 'CUSTOMER PUBLICATION STARTING', subtitle: period(f),
      columns: [text('date', 'शुरू'), text('customer', 'ग्राहक'), text('region', 'क्षेत्र'), text('address', 'पता'), text('hawker', 'हॉकर'), int('qty', 'कॉपी'), text('status', 'अभी')],
      groups, totals: totalsOf(list, ['qty'], { customer: `कुल ${list.length}` })
    };
  },

  // Customer Wise Choose Publication: everyone taking the chosen paper now, region by region
  async cust_choose_pub(f) {
    const m = await masters();
    const today = new Date().toISOString().slice(0, 10);
    const list = (await subscriptions(m)).filter(s => runsOn(s, today) && (!f.pub || s.publica_id === f.pub) && hawkerOk(f, s.hawker_id) && (!f.region || custRegion(m, s.customer_id) === f.region))
      .sort((a, b) => custRegion(m, a.customer_id) - custRegion(m, b.customer_id) || Number(m.customers.get(a.customer_id)?.priority || 0) - Number(m.customers.get(b.customer_id)?.priority || 0));
    const groups = groupBy(list, s => regionName(m, custRegion(m, s.customer_id))).map(([name, ss]) => ({
      title: `${name} — ${ss.length}`,
      rows: ss.map(s => ({ customer: `${custName(m, s.customer_id)} #${s.customer_id}`, address: custAddress(m, s.customer_id), phone: custPhone(m, s.customer_id), paper: pubName(m, s.publica_id), hawker: m.hawkers.get(s.hawker_id) || '-', qty: s.qty, since: dmy(s.s) })),
      totals: totalsOf(ss, ['qty'], { customer: `${ss.length} ग्राहक` })
    }));
    return {
      title: f.pub ? `CUSTOMERS TAKING: ${m.pubs.get(f.pub)?.english || f.pub}` : 'CUSTOMER WISE PUBLICATION', subtitle: `आज (${dmy(today)}) चालू`,
      columns: [text('customer', 'ग्राहक'), text('address', 'पता'), text('phone', 'फ़ोन'), text('paper', 'अखबार'), text('hawker', 'हॉकर'), int('qty', 'कॉपी'), text('since', 'कब से')],
      groups, totals: totalsOf(list, ['qty'], { customer: `कुल ${list.length}` })
    };
  },

  // Circulation Type Publication: running copies of each paper, by circulation (Morning / Evening ...)
  async circ_type_pub(f) {
    const m = await masters();
    const today = new Date().toISOString().slice(0, 10);
    const list = (await subscriptions(m)).filter(s => runsOn(s, today) && (!f.pub || s.publica_id === f.pub) && (!f.region || custRegion(m, s.customer_id) === f.region));
    const groups = groupBy(list, s => String(s.circulation || 'Morning').trim() || 'Morning').map(([name, ss]) => {
      const rows = groupBy(ss, s => String(s.publica_id)).map(([id, xs]) => ({ paper: pubName(m, id), customers: new Set(xs.map(x => x.customer_id)).size, qty: sum(xs, 'qty') }))
        .sort((a, b) => b.qty - a.qty);
      return { title: name, rows, totals: totalsOf(rows, ['customers', 'qty'], { paper: `${name} का कुल` }) };
    });
    return {
      title: 'CIRCULATION TYPE PUBLICATION', subtitle: `आज (${dmy(today)}) चालू`,
      columns: [text('paper', 'अखबार'), int('customers', 'ग्राहक'), int('qty', 'कॉपी')],
      groups, totals: { paper: 'कुल', qty: sum(list, 'qty') }
    };
  },

  // Hawker's Customer Priority: a hawker's customers in delivery order with their papers
  async hawker_cust_priority(f) {
    const m = await masters();
    const today = new Date().toISOString().slice(0, 10);
    const running = (await subscriptions(m)).filter(s => runsOn(s, today) && hawkerOk(f, s.hawker_id) && (!f.region || custRegion(m, s.customer_id) === f.region));
    const groups = groupBy(running, s => String(s.hawker_id)).sort((a, b) => (m.hawkers.get(Number(a[0])) || '').localeCompare(m.hawkers.get(Number(b[0])) || '')).map(([hid, ss]) => {
      const rows = groupBy(ss, s => String(s.customer_id)).map(([cid, xs]) => ({
        priority: Number(m.customers.get(Number(cid))?.priority || 0), customer: `${custName(m, cid)} #${cid}`, address: custAddress(m, cid), phone: custPhone(m, cid),
        papers: xs.map(x => `${m.pubs.get(x.publica_id)?.short || x.publica_id}${x.qty > 1 ? ` ×${x.qty}` : ''}`).join(', '), qty: sum(xs, 'qty')
      })).sort((a, b) => a.priority - b.priority);
      return { title: `${m.hawkers.get(Number(hid)) || `#${hid}`} — ${rows.length} ग्राहक`, rows, totals: totalsOf(rows, ['qty'], { customer: `${rows.length} ग्राहक` }) };
    });
    return {
      title: "HAWKER'S CUSTOMER PRIORITY", subtitle: `आज (${dmy(today)}) चालू`,
      columns: [int('priority', 'क्रम'), text('customer', 'ग्राहक'), text('address', 'पता'), text('phone', 'फ़ोन'), text('papers', 'अखबार'), int('qty', 'कॉपी')],
      groups, totals: { customer: `कुल ${new Set(running.map(s => s.customer_id)).size} ग्राहक`, qty: sum(running, 'qty') }
    };
  },

  // Hawker Report Datewise: copies each hawker takes each day (running papers less stops), paper by paper
  async hawker_report_datewise(f) {
    const m = await masters();
    const from = f.from || new Date().toISOString().slice(0, 10);
    const to = f.to && f.to >= from ? f.to : from;
    const dayList: string[] = [];
    for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to && dayList.length < 31; d.setUTCDate(d.getUTCDate() + 1)) dayList.push(d.toISOString().slice(0, 10));
    const [subs, list] = await Promise.all([subscriptions(m), stops(m)]);
    const stopped = (s: any, day: string) => list.some(d => d.customer_id === s.customer_id && (!d.publica_id || d.publica_id === s.publica_id)
      && (d.permanent ? day >= d.from && !(s.s && s.s >= d.from) : day >= d.from && day <= (d.to || d.from)));
    const mine = subs.filter(s => hawkerOk(f, s.hawker_id) && (!f.region || custRegion(m, s.customer_id) === f.region) && (!f.pub || s.publica_id === f.pub));
    const groups = groupBy(mine, s => String(s.hawker_id)).sort((a, b) => (m.hawkers.get(Number(a[0])) || '').localeCompare(m.hawkers.get(Number(b[0])) || '')).map(([hid, ss]) => {
      const rows: any[] = [];
      for (const day of dayList) {
        const today = ss.filter(s => runsOn(s, day) && !stopped(s, day));
        for (const [pid, xs] of groupBy(today, s => String(s.publica_id))) rows.push({ date: `${dmy(day)} ${dayName(day)}`, paper: pubName(m, pid), customers: new Set(xs.map(x => x.customer_id)).size, qty: sum(xs, 'qty') });
      }
      return { title: m.hawkers.get(Number(hid)) || `#${hid}`, rows, totals: totalsOf(rows, ['qty'], { paper: 'कुल कॉपी' }) };
    }).filter(g => g.rows.length);
    return {
      title: 'HAWKER REPORT DATEWISE', subtitle: `${dmy(from)} से ${dmy(to)} तक${dayList.length === 31 ? ' (31 दिन तक)' : ''}`,
      columns: [text('date', 'तारीख'), text('paper', 'अखबार'), int('customers', 'ग्राहक'), int('qty', 'कॉपी')],
      groups, totals: { paper: 'कुल', qty: groups.reduce((s, g) => s + Number(g.totals?.qty || 0), 0) },
      note: 'चालू अखबार में से उस दिन की छुट्टी / बंद घटाकर। अखबार की छुट्टी (Holiday) यहाँ नहीं घटाई गई।'
    };
  },

  // Sticker Printing: address labels of customers with running papers, in delivery order
  async sticker_printing(f) {
    const m = await masters();
    const today = new Date().toISOString().slice(0, 10);
    const running = (await subscriptions(m)).filter(s => runsOn(s, today) && hawkerOk(f, s.hawker_id) && (!f.pub || s.publica_id === f.pub));
    const ids = Array.from(new Set(running.map(s => s.customer_id))).filter(id => !f.region || custRegion(m, id) === f.region)
      .sort((a, b) => custRegion(m, a) - custRegion(m, b) || Number(m.customers.get(a)?.priority || 0) - Number(m.customers.get(b)?.priority || 0));
    const rows = ids.map(id => ({
      name: custName(m, id), id, address: custAddress(m, id), phone: custPhone(m, id), region: regionName(m, custRegion(m, id)),
      priority: Number(m.customers.get(id)?.priority || 0),
      papers: running.filter(s => s.customer_id === id).map(s => `${m.pubs.get(s.publica_id)?.short || s.publica_id}${s.qty > 1 ? ` ×${s.qty}` : ''}`).join(', ')
    }));
    return {
      title: 'STICKER PRINTING', subtitle: `${rows.length} स्टिकर`, layout: 'labels',
      columns: [text('name', 'नाम'), text('address', 'पता'), text('papers', 'अखबार')],
      groups: [{ rows }]
    };
  }
};

export async function buildReport(type: string, f: Filters): Promise<TableReport | null> {
  const builder = REPORTS[type];
  return builder ? builder(f) : null;
}
