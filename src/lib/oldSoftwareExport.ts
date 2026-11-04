import { fyLabel, fySuffix } from './financialYear';
import { monthCode } from './backupTables';
import { unicodeToSusha } from './sushaEncode';

// Writes this website's data as a MySQL file the old software (MySQL Administrator, MySQL 5.0)
// can restore. It is the reverse of oldSoftwareFile.ts, and follows the old software's own rules:
// - opening dues sit only on the 'Dues' bill row, and a bill's Balance is the due before that month
// - each customer's subscriptions are numbered 1, 2, 3 and bill lines point at that number
// - dates are dd/mm/yyyy where the old software keeps them as text
// - customer and hawker rows are updated in place, so the old software keeps what only it holds
//   (a customer's inactive mark, a hawker's region); every other table is replaced whole.

type Kind = 'n' | 's' | 'hindi' | 'dmy' | 'date';
type Column = [oldName: string, kind: Kind, value: (row: any) => any];

interface OldTableSpec {
  name: string;
  create: string;
  // 'update' keeps the old rows and columns this website does not hold
  mode: 'replace' | 'update';
  columns: Column[];
  rows: any[];
}

const FY_MONTHS = ['due', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];
const BATCH = 400;

// The website's column name is the old name in small letters, unless a table says otherwise
const pick = (row: any, name: string) => (row[name] !== undefined ? row[name] : row[name.toLowerCase()]);
const col = (oldName: string, kind: Kind = 'n', from?: string): Column => [oldName, kind, row => pick(row, from || oldName)];

function isoDate(value: any): string | null {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10) === '0000-00-00' ? null : text.slice(0, 10);
  const parts = text.split(/[/\-.]/);
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  return null;
}

// A date the old software typed wrongly ("03/07/201 ") goes back as it was
function dmy(value: any): string {
  const iso = isoDate(value);
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : String(value ?? '');
}

function sqlValue(value: any, kind: Kind): string {
  if (kind === 'dmy') return quote(dmy(value));
  if (kind === 'date') {
    const iso = isoDate(value);
    return iso ? quote(iso) : 'NULL';
  }
  if (value === null || value === undefined) return 'NULL';
  if (kind === 'n') {
    if (value === true) return '-1';
    if (value === false) return '0';
    if (String(value).trim() === '') return 'NULL';
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n * 10000) / 10000) : 'NULL';
  }
  return quote(kind === 'hindi' ? unicodeToSusha(String(value)) : String(value));
}

function quote(text: string): string {
  return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0') + "'";
}

const money = (v: any) => Number(v) || 0;
const round2 = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};

function remarksOf(r: any): any {
  try {
    return typeof r.remarks === 'string' && r.remarks.trim().startsWith('{') ? JSON.parse(r.remarks) : {};
  } catch {
    return {};
  }
}

// The first and last day of a bill month, from the year's starting year
function monthRange(code: string, startYear: number): [string, string] | null {
  const index = FY_MONTHS.indexOf(code);
  if (index < 1) return null;
  const month = ((index + 2) % 12) + 1;
  const year = index >= 10 ? startYear + 1 : startYear;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, '0')}`];
}

// Each customer's subscriptions numbered 1, 2, 3, and a way to find the one a bill line belongs to
function numberSubscriptions(details: any[], startYear: number) {
  const byCustomer = new Map<number, any[]>();
  for (const d of details) {
    const id = Number(pick(d, 'customer_id'));
    byCustomer.set(id, [...(byCustomer.get(id) || []), d]);
  }
  const numbered: { row: any; sno: number }[] = [];
  const lookup = new Map<string, { sno: number; start: string; end: string | null; hawker: any }[]>();
  for (const [customer, rows] of Array.from(byCustomer).sort((a, b) => a[0] - b[0])) {
    rows.sort((a, b) => (Number(pick(a, 'sno')) || 0) - (Number(pick(b, 'sno')) || 0) || String(isoDate(pick(a, 's_date'))).localeCompare(String(isoDate(pick(b, 's_date')))));
    rows.forEach((row, i) => {
      numbered.push({ row, sno: i + 1 });
      const key = `${customer}|${pick(row, 'publica_id')}`;
      lookup.set(key, [...(lookup.get(key) || []), { sno: i + 1, start: isoDate(pick(row, 's_date')) || '0000-00-00', end: isoDate(pick(row, 'c_date')), hawker: pick(row, 'hawker_id') }]);
    });
  }
  const subscriptionFor = (customer: any, publica: any, month: any) => {
    const list = lookup.get(`${Number(customer)}|${publica}`) || [];
    if (list.length === 0) return null;
    const range = monthRange(monthCode(month), startYear);
    const latest = (rows: typeof list) => rows.reduce((best, r) => (r.start >= best.start ? r : best));
    const active = range ? list.filter(r => r.start <= range[1] && (!r.end || r.end >= range[0])) : [];
    return latest(active.length ? active : list);
  };
  return { numbered, subscriptionFor, lookup };
}

// The due before each month's bill: opening dues + earlier months' bills - earlier months' receipts
function previousDues(headers: any[], lines: any[], deliveries: any[], receipts: any[]) {
  const charge = new Map<string, number>();
  const add = (customer: any, month: any, amount: number) => {
    const key = `${Number(customer)}|${FY_MONTHS.indexOf(monthCode(month))}`;
    charge.set(key, (charge.get(key) || 0) + amount);
  };
  const dues = new Map<number, number>();
  for (const h of headers) {
    if (monthCode(pick(h, 'month')) === 'due') dues.set(Number(pick(h, 'customer_id')), money(pick(h, 'due_amt')));
    else add(pick(h, 'customer_id'), pick(h, 'month'), -money(pick(h, 'dis_amt')));
  }
  for (const l of lines) add(pick(l, 'customer_id'), pick(l, 'month'), money(pick(l, 'total_amt')));
  for (const d of deliveries) add(pick(d, 'customer_id'), pick(d, 'month'), money(pick(d, 'dely')));
  for (const r of receipts) add(r.customer_id, r.month, -(money(r.mal_recp_amt) + money(r.less_amt)));

  // A bill made here stores the amount payable after the month (Balance = -(due before + this month)),
  // a bill from the old software the due before it. Either becomes the old meaning; a figure that
  // fits neither is the old software's own and is kept as it is.
  return (header: any) => {
    const id = Number(pick(header, 'customer_id'));
    const upTo = FY_MONTHS.indexOf(monthCode(pick(header, 'month')));
    let owed = dues.get(id) || 0;
    for (let m = 1; m < upTo; m++) owed += charge.get(`${id}|${m}`) || 0;
    // Receipts against the opening dues count from the first month
    owed += charge.get(`${id}|0`) || 0;
    const before = round2(-owed);
    const stored = pick(header, 'balance');
    if (stored === null || stored === undefined || stored === '') return before;
    const thisMonth = charge.get(`${id}|${upTo}`) || 0;
    const fits = (value: number) => Math.abs(Number(stored) - value) < 1;
    return fits(before) || fits(before - thisMonth) ? before : Number(stored);
  };
}

export function oldSoftwareSpecs(tables: Record<string, any[]>, suffix = fySuffix()): OldTableSpec[] {
  const startYear = Number(suffix.slice(0, 4));
  const get = (name: string) => tables[name] || [];
  const details = numberSubscriptions(get('customer_detail'), startYear);
  const headers = get(`billno${suffix}`);
  const lines = get(`bill${suffix}`);
  const deliveries = get(`billdel${suffix}`);
  const receipts = get(`receipt${suffix}`);
  const dueBefore = previousDues(headers, lines, deliveries, receipts);
  const lineSno = (row: any) => details.subscriptionFor(pick(row, 'customer_id'), pick(row, 'publica_id'), pick(row, 'month'))?.sno ?? pick(row, 'sno');
  const label = fyLabel(new Date(Date.UTC(startYear, 5, 1)));

  return [
    {
      name: 'customer',
      mode: 'update',
      create: "`Customer_id` int(11) NOT NULL auto_increment,\n  `name_eng` varchar(50) default NULL,\n  `Type_Cust` tinyint(1) default NULL,\n  `name_hindi` varchar(50) default NULL,\n  `add1` text,\n  `add2` text,\n  `phone` tinytext,\n  `Security_Deposit` int(11) default NULL,\n  `Type` tinytext,\n  `Priority` int(11) default NULL,\n  `Self_Agent` tinyint(1) default NULL,\n  `FontType` tinyint(1) default NULL,\n  `dueamount` float default NULL,\n  `Region_id` int(11) default NULL,\n  `Paid` text,\n  `Delivery` int(11) default NULL,\n  `Discount` int(11) default NULL,\n  `GovtSupply` tinyint(1) default NULL,\n  `Hindi_Add` text,\n  `Cbal` float default NULL,\n  `pmonth` text,\n  `pyear` text,\n  `is_inactive` tinyint(1) NOT NULL default '0',\n  PRIMARY KEY  (`Customer_id`),\n  KEY `idx_inactive_region` (`is_inactive`,`Region_id`)",
      columns: [
        col('Customer_id'), col('name_eng', 's'), col('Type_Cust'),
        ['name_hindi', 'hindi', r => (pick(r, 'name_hindi') || pick(r, 'name_hindi_unicode') || null)],
        col('add1', 's'), col('add2', 's'), col('phone', 's'), col('Security_Deposit'), col('Type', 's'), col('Priority'),
        col('Self_Agent'), col('FontType', 'n', 'font_type'), col('dueamount'), col('Region_id'), col('Paid', 's'), col('Delivery'),
        col('Discount'), col('GovtSupply', 'n', 'govt_supply'), col('Hindi_Add', 'hindi', 'hindi_add'), col('Cbal'), col('pmonth', 's'), col('pyear', 's')
      ],
      rows: get('customer')
    },
    {
      name: 'customer_detail',
      mode: 'replace',
      create: "`sno` int(11) default NULL,\n  `Customer_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `Hawker_id` int(11) default NULL,\n  `Qty` int(11) default NULL,\n  `Circulation` tinytext,\n  `S_Date` varchar(10) default NULL,\n  `C_Date` varchar(10) default NULL,\n  `From_Day` text,\n  `Hawk_Sub` tinyint(1) default NULL,\n  `Dis` text,\n  `Dely` int(11) default NULL,\n  KEY `idx_customerid` (`Customer_id`),\n  KEY `idx_hawkerid` (`Hawker_id`),\n  KEY `idx_publicaid` (`Publica_id`)",
      columns: [
        ['sno', 'n', r => r.sno], ...['Customer_id', 'Publica_id', 'Hawker_id', 'Qty'].map(n => [n, 'n', (r: any) => pick(r.row, n)] as Column),
        ['Circulation', 's', r => pick(r.row, 'circulation')], ['S_Date', 'dmy', r => pick(r.row, 's_date')], ['C_Date', 'dmy', r => pick(r.row, 'c_date')],
        ['From_Day', 's', r => pick(r.row, 'from_day')], ['Hawk_Sub', 'n', r => pick(r.row, 'hawk_sub')], ['Dis', 's', r => pick(r.row, 'dis') ?? ''], ['Dely', 'n', r => pick(r.row, 'dely')]
      ],
      rows: details.numbered
    },
    {
      name: 'hawker',
      mode: 'update',
      create: "`Hawker_id` int(11) NOT NULL auto_increment,\n  `name` varchar(50) default NULL,\n  `address` text,\n  `city` varchar(50) default NULL,\n  `phone` tinytext,\n  `mobile` tinytext,\n  `Region_id` int(11) default NULL,\n  PRIMARY KEY  (`Hawker_id`)",
      columns: [col('Hawker_id'), col('name', 's'), col('address', 's'), col('city', 's'), col('phone', 's'), col('mobile', 's')],
      rows: get('hawker')
    },
    {
      name: 'publication',
      mode: 'replace',
      create: "`Publica_id` int(11) NOT NULL auto_increment,\n  `Public_name` varchar(50) default NULL,\n  `TypeP` varchar(15) default NULL,\n  `Publish_id` int(11) default NULL,\n  `Abrv` varchar(5) default NULL,\n  `Circulation` varchar(15) default NULL,\n  `Duration` tinytext,\n  `MagzineDay` tinytext,\n  `MagzineMonth` tinytext,\n  `ChrDel` tinyint(1) default NULL,\n  `Pub_Hindi` text,\n  PRIMARY KEY  (`Publica_id`)",
      columns: [
        col('Publica_id'), col('Public_name', 's'), col('TypeP', 's', 'type_p'), col('Publish_id'), col('Abrv', 's'), col('Circulation', 's'),
        col('Duration', 's'), col('MagzineDay', 's', 'magzine_day'), col('MagzineMonth', 's', 'magzine_month'), col('ChrDel', 'n', 'chr_del'), col('Pub_Hindi', 'hindi')
      ],
      rows: get('publication')
    },
    {
      name: 'publisher',
      mode: 'replace',
      create: "`Publish_id` int(11) NOT NULL auto_increment,\n  `name` varchar(50) default NULL,\n  `address` text,\n  `city` varchar(50) default NULL,\n  `state` varchar(50) default NULL,\n  `pincode` tinytext,\n  `phone` tinytext,\n  `mobile` tinytext,\n  `fax` tinytext,\n  `email` text,\n  `Website` text,\n  `Category` tinytext,\n  `Type` tinytext,\n  PRIMARY KEY  (`Publish_id`)",
      columns: [col('Publish_id'), ...['name', 'address', 'city', 'state', 'pincode', 'phone', 'mobile', 'fax', 'email', 'Website', 'Category', 'Type'].map(n => col(n, 's'))],
      rows: get('publisher')
    },
    {
      name: 'regiond',
      mode: 'replace',
      create: "`Region_id` int(11) NOT NULL auto_increment,\n  `Region_name` varchar(50) default NULL,\n  PRIMARY KEY  (`Region_id`)",
      columns: [col('Region_id'), col('Region_name', 's')],
      rows: get('regiond')
    },
    {
      name: 'collect',
      mode: 'replace',
      create: "`Collect_id` int(11) NOT NULL auto_increment,\n  `name` varchar(50) default NULL,\n  `address` text,\n  `city` varchar(50) default NULL,\n  `phone` tinytext,\n  `mobile` tinytext,\n  PRIMARY KEY  (`Collect_id`)",
      columns: [col('Collect_id'), ...['name', 'address', 'city', 'phone', 'mobile'].map(n => col(n, 's'))],
      rows: get('collect')
    },
    {
      name: 'rate',
      mode: 'replace',
      create: "`Publica_id` int(11) default NULL,\n  `Rate` float default NULL,\n  `Dayofweek` int(11) default NULL",
      columns: [col('Publica_id'), col('Rate'), col('Dayofweek')],
      rows: get('rate')
    },
    {
      name: 'ratechange',
      mode: 'replace',
      create: "`Publica_id` int(11) default NULL,\n  `OldRate` float default NULL,\n  `NewRate` float default NULL,\n  `Dated` date default NULL,\n  `Dayofweek` int(11) default NULL",
      columns: [col('Publica_id'), col('OldRate'), col('NewRate'), ['Dated', 'date', r => pick(r, 'effective_date') ?? pick(r, 'dated')], col('Dayofweek')],
      rows: get('ratechange')
    },
    {
      name: 'holiday',
      mode: 'replace',
      create: "`Oc_Date` varchar(10) default NULL,\n  `Occasion` tinytext,\n  `Publica_id` int(11) default NULL",
      columns: [['Oc_Date', 'dmy', r => pick(r, 'oc_date') ?? pick(r, 'dated')], ['Occasion', 's', r => pick(r, 'occasion') ?? pick(r, 'remark') ?? ''], col('Publica_id')],
      rows: get('holiday')
    },
    {
      name: 'publicationdis',
      mode: 'replace',
      create: "`Publica_id` int(11) default NULL,\n  `FromDate` date default NULL,\n  `ToDate` date default NULL",
      columns: [col('Publica_id'), ['FromDate', 'date', r => pick(r, 'entry_date')], ['ToDate', 'date', r => pick(r, 'oc_date')]],
      rows: get('publicationdis')
    },
    {
      name: 'publicationsup',
      mode: 'replace',
      create: "`Publica_id` int(11) default NULL,\n  `PublicaSup_id` int(11) default NULL,\n  `Month` text,\n  `Year` text,\n  `Region_id` int(11) default NULL",
      columns: [col('Publica_id'), col('PublicaSup_id'), col('Month', 's'), col('Year', 's'), col('Region_id')],
      rows: get('publicationsup')
    },
    {
      name: `discontinue${suffix}`,
      mode: 'replace',
      create: "`Discontinue_id` int(11) NOT NULL auto_increment,\n  `SNo` int(11) default NULL,\n  `EntryDate` varchar(10) default NULL,\n  `Customer_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `Temp_Perma` varchar(1) default NULL,\n  `Temp_From` date default NULL,\n  `Temp_To` date default NULL,\n  `S_Date` varchar(10) default NULL,\n  `C_Date` varchar(10) default NULL,\n  `Hawker_id` int(11) default NULL,\n  PRIMARY KEY  (`Discontinue_id`)",
      columns: [
        col('Discontinue_id'), col('SNo', 'n', 'sno'), ['EntryDate', 'dmy', r => pick(r, 'entry_date')], col('Customer_id'), col('Publica_id'),
        ['Temp_Perma', 's', r => (/^p/i.test(String(pick(r, 'temp_perma') || '')) ? 'P' : 'T')],
        ['Temp_From', 'date', r => pick(r, 'temp_from')], ['Temp_To', 'date', r => pick(r, 'temp_to')],
        ['S_Date', 'dmy', r => pick(r, 's_date')], ['C_Date', 'dmy', r => pick(r, 'c_date')],
        ['Hawker_id', 'n', r => pick(r, 'hawker_id') ?? (details.lookup.get(`${Number(pick(r, 'customer_id'))}|${pick(r, 'publica_id')}`) || [])
          .find(s => s.start === isoDate(pick(r, 's_date')))?.hawker ?? null]
      ],
      rows: get('discontinue').filter(r => !r.financial_year || r.financial_year === label)
    },
    {
      name: `billno${suffix}`,
      mode: 'replace',
      create: "`Bill_id` int(11) NOT NULL auto_increment,\n  `Customer_id` int(11) default NULL,\n  `Region_id` int(11) default NULL,\n  `Due_Amt` float default NULL,\n  `Del_Amt` float default NULL,\n  `Dis_Amt` float default NULL,\n  `Month` text,\n  `year` text,\n  `Balance` float default NULL,\n  PRIMARY KEY  (`Bill_id`),\n  KEY `idx_custid_month` (`Customer_id`,`Month`(10))",
      columns: [
        col('Bill_id'), col('Customer_id'), col('Region_id'),
        ['Due_Amt', 'n', r => (monthCode(pick(r, 'month')) === 'due' ? pick(r, 'due_amt') : null)],
        col('Del_Amt'), col('Dis_Amt'), col('Month', 's'), col('year', 's'),
        ['Balance', 'n', r => (monthCode(pick(r, 'month')) === 'due' ? pick(r, 'balance') ?? null : dueBefore(r))]
      ],
      rows: headers
    },
    {
      name: `bill${suffix}`,
      mode: 'replace',
      create: "`Bill_id` int(11) default NULL,\n  `Customer_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `Region_id` int(11) default NULL,\n  `Qty` int(11) default NULL,\n  `Rate` float default NULL,\n  `D_Charges` float default NULL,\n  `TotalAmt` float default NULL,\n  `Month` text,\n  `year` text,\n  `sno` int(11) default NULL,\n  KEY `idx_custid_month` (`Customer_id`,`Month`(10))",
      columns: [
        col('Bill_id'), col('Customer_id'), col('Publica_id'), col('Region_id'), col('Qty'), col('Rate'), col('D_Charges'),
        col('TotalAmt', 'n', 'total_amt'), col('Month', 's'), col('year', 's'), ['sno', 'n', lineSno]
      ],
      rows: lines
    },
    {
      name: `billdel${suffix}`,
      mode: 'replace',
      create: "`Customer_id` int(11) default NULL,\n  `Region_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `month` text,\n  `year` text,\n  `Dely` int(11) default NULL,\n  `sno` int(11) default NULL,\n  KEY `idx_custid_month` (`Customer_id`,`month`(10))",
      columns: [col('Customer_id'), col('Region_id'), col('Publica_id'), col('month', 's'), col('year', 's'), col('Dely'), ['sno', 'n', lineSno]],
      rows: deliveries
    },
    {
      name: `receipt${suffix}`,
      mode: 'replace',
      create: "`Receipt_id` int(11) NOT NULL auto_increment,\n  `Bill_id` int(11) default NULL,\n  `ReceiptNo` int(11) default NULL,\n  `ManualRepNo` int(11) default NULL,\n  `BillDate` varchar(10) default NULL,\n  `BillAmt` float default NULL,\n  `MalRecpDt` varchar(10) default NULL,\n  `Month` tinytext,\n  `Year` tinytext,\n  `DueAmt` float default NULL,\n  `MalRecpAmt` float default NULL,\n  `Balance` float default NULL,\n  `LessAmt` float default NULL,\n  `RAmt` float default NULL,\n  `ChequeNo` tinytext,\n  `ChequeDate` varchar(10) default NULL,\n  `Debit` float default NULL,\n  `Credit` float default NULL,\n  `Cash_Chq` tinytext,\n  `Narr` text,\n  `customer_id` int(11) default NULL,\n  PRIMARY KEY  (`Receipt_id`),\n  KEY `idx_custid` (`customer_id`)",
      columns: [
        ['Receipt_id', 'n', r => r.id], ['Bill_id', 'n', r => remarksOf(r).bill_no], ['ReceiptNo', 'n', r => r.recp_no],
        ['ManualRepNo', 'n', r => remarksOf(r).manual_rep_no ?? remarksOf(r).mal_rep_no], ['BillDate', 'dmy', r => r.recp_date],
        ['BillAmt', 'n', r => r.bill_amt], ['MalRecpDt', 'dmy', r => remarksOf(r).mal_recp_dt || r.recp_date],
        ['Month', 's', r => r.month], ['Year', 's', r => r.year], ['DueAmt', 'n', () => null], ['MalRecpAmt', 'n', r => r.mal_recp_amt],
        ['Balance', 'n', r => remarksOf(r).balance ?? 0], ['LessAmt', 'n', r => r.less_amt ?? 0], ['RAmt', 'n', r => remarksOf(r).r_amt ?? r.mal_recp_amt],
        ['ChequeNo', 's', r => remarksOf(r).cheque_no || ''], ['ChequeDate', 's', r => (isoDate(remarksOf(r).cheque_date) ? dmy(remarksOf(r).cheque_date) : '__/__/____')],
        ['Debit', 'n', r => r.bill_amt], ['Credit', 'n', r => r.mal_recp_amt], ['Cash_Chq', 's', r => remarksOf(r).cash_chq || 'Cash'],
        ['Narr', 's', r => remarksOf(r).narr || ''], ['customer_id', 'n', r => r.customer_id]
      ],
      rows: receipts
    },
    {
      name: `retailsale${suffix}`,
      mode: 'replace',
      create: "`Retail_id` int(11) NOT NULL auto_increment,\n  `Vr_Date` date default NULL,\n  `Customer_id` int(11) default NULL,\n  `Publica_id` int(11) default NULL,\n  `Copies` int(11) default NULL,\n  `Rate` float default NULL,\n  `Amt` float default NULL,\n  `Narr` text,\n  PRIMARY KEY  (`Retail_id`)",
      columns: [col('Retail_id'), col('Vr_Date', 'date'), col('Customer_id'), col('Publica_id'), col('Copies'), col('Rate'), col('Amt'), col('Narr', 's')],
      rows: get(`retailsale${suffix}`)
    },
    {
      name: `receiptissue${suffix}`,
      mode: 'replace',
      create: "`sno` int(11) default NULL,\n  `Collect_id` int(11) default NULL,\n  `ReceiptFrom` text,\n  `ReceiptTo` text,\n  `IssueDate` date default NULL,\n  `RecDate` date default NULL",
      columns: [col('sno'), col('Collect_id'), col('ReceiptFrom', 's'), col('ReceiptTo', 's'), col('IssueDate', 'date'), col('RecDate', 'date')],
      rows: get(`receiptissue${suffix}`)
    }
  ];
}

// The tables the export reads from this website
export function oldSoftwareSourceTables(suffix = fySuffix()): string[] {
  return ['customer', 'customer_detail', 'hawker', 'publication', 'publisher', 'regiond', 'collect', 'rate', 'ratechange', 'holiday',
    'publicationdis', 'publicationsup', 'discontinue', `billno${suffix}`, `bill${suffix}`, `billdel${suffix}`, `receipt${suffix}`,
    `retailsale${suffix}`, `receiptissue${suffix}`];
}

interface TableBlock {
  name: string;
  mode: 'replace' | 'update';
  text: string[];
}

// Each table as the old dump writes it: structure, then its rows
export function oldSoftwareBlocks(tables: Record<string, any[]>, suffix = fySuffix()): TableBlock[] {
  return oldSoftwareSpecs(tables, suffix).map(spec => {
    const names = spec.columns.map(c => `\`${c[0]}\``).join(',');
    // An update follows the old file's own block of that table, so it must not start a second one
    const text = [
      spec.mode === 'replace'
        ? `--\n-- Table structure for table \`test\`.\`${spec.name}\`\n--\n\n`
        : `--\n-- Website changes for table \`test\`.\`${spec.name}\`\n--\n\n`,
      spec.mode === 'replace'
        ? `DROP TABLE IF EXISTS \`${spec.name}\`;\nCREATE TABLE \`${spec.name}\` (\n  ${spec.create}\n) ENGINE=MyISAM DEFAULT CHARSET=latin1;\n\n`
        : `CREATE TABLE IF NOT EXISTS \`${spec.name}\` (\n  ${spec.create}\n) ENGINE=MyISAM DEFAULT CHARSET=latin1;\n\n`,
      `--\n-- Dumping data for table \`test\`.\`${spec.name}\`\n--\n\n/*!40000 ALTER TABLE \`${spec.name}\` DISABLE KEYS */;\n`
    ];
    const update = spec.mode === 'update'
      ? ' ON DUPLICATE KEY UPDATE ' + spec.columns.slice(1).map(c => `\`${c[0]}\`=VALUES(\`${c[0]}\`)`).join(',')
      : '';
    for (let i = 0; i < spec.rows.length; i += BATCH) {
      const values = spec.rows.slice(i, i + BATCH).map(row => ' (' + spec.columns.map(([, kind, value]) => sqlValue(value(row), kind)).join(',') + ')');
      text.push(`INSERT INTO \`${spec.name}\` (${names}) VALUES \n${values.join(',\n')}${update};\n`);
    }
    text.push(`/*!40000 ALTER TABLE \`${spec.name}\` ENABLE KEYS */;\n\n\n`);
    return { name: spec.name, mode: spec.mode, text };
  });
}

const HEADER = [
  '/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;\n/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;\n/*!40101 SET NAMES utf8 */;\n\n',
  "/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;\n/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;\n/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;\n\n\n",
  '--\n-- Create schema test\n--\n\nCREATE DATABASE /*!32312 IF NOT EXISTS*/ test;\nUSE test;\n\n'
];
const FOOTER = '/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;\n/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;\n/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;\n/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;\n/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;\n/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;\n';

// Only the website's tables, laid out like a MySQL Administrator 1.4 dump of the old 'test' database
export function oldSoftwareSql(tables: Record<string, any[]>, suffix = fySuffix(), takenAt = new Date()): string[] {
  return [
    `-- MySQL Administrator dump 1.4\n--\n-- ------------------------------------------------------\n-- Made by the Aryan News Agency website on ${takenAt.toISOString()}\n-- Holds only the tables below; every other table of the old software is left as it is.\n\n\n`,
    ...HEADER,
    ...oldSoftwareBlocks(tables, suffix).flatMap(b => b.text),
    FOOTER
  ];
}

// Where each part of an old dump begins: a table, a view, a function or procedure
// The old software writes Windows line ends
const SECTION = /\r?\n--\r?\n-- (?:Table structure for table `[^`]*`\.`([^`]+)`|View structure for view|Temporary table structure|Function|Procedure|Definition of)/g;
const PIECE = 16 * 1024 * 1024;

function bytesToText(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 32768) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 32768) as unknown as number[]));
  return parts.join('');
}

/**
 * A complete old software backup: every table, view and function of the old file copied byte for
 * byte, except the website's own tables, which are written from the website in their place.
 * Customer and hawker keep the old block, with the website's rows applied after it.
 * Returns the tables taken from the website and those copied from the old file.
 */
export async function mergeIntoOldBackup(
  base: Blob,
  blocks: TableBlock[],
  write: (part: string | Uint8Array) => Promise<void>,
  onProgress: (percent: number) => void
): Promise<{ replaced: string[]; copied: number; added: string[] }> {
  const head = bytesToText(new Uint8Array(await base.slice(0, 200).arrayBuffer()));
  if (!head.startsWith('-- MySQL Administrator dump') && !head.startsWith('-- MySQL dump')) {
    throw new Error('यह पुराने सॉफ्टवेयर की बैकअप (.sql) फाइल नहीं है');
  }
  const byName = new Map(blocks.map(b => [b.name.toLowerCase(), b]));
  const done = new Set<string>();
  let copied = 0;
  let keep = true;
  let current = '';
  let reachedEnd = false;
  let sawCustomer = false;
  const added: string[] = [];

  // Website tables the old file does not have go in before its views and functions
  const writeMissing = async () => {
    if (reachedEnd) return;
    reachedEnd = true;
    for (const b of blocks) if (!done.has(b.name.toLowerCase())) { for (const t of b.text) await write(t); done.add(b.name.toLowerCase()); added.push(b.name); }
  };
  const startSection = async (table: string | undefined) => {
    if (current && byName.get(current)?.mode === 'update' && !done.has(current)) {
      for (const t of byName.get(current)!.text) await write(t);
      done.add(current);
    }
    current = (table || '').toLowerCase();
    if (!table) { await writeMissing(); keep = true; return; }
    if (current === 'customer') sawCustomer = true;
    const block = byName.get(current);
    keep = !block || block.mode === 'update';
    if (keep && !block) copied++;
    if (block && block.mode === 'replace') { for (const t of block.text) await write(t); done.add(current); }
  };

  let carry = new Uint8Array(0);
  for (let offset = 0; offset < base.size; offset += PIECE) {
    const piece = new Uint8Array(await base.slice(offset, offset + PIECE).arrayBuffer());
    const bytes = new Uint8Array(carry.length + piece.length);
    bytes.set(carry);
    bytes.set(piece, carry.length);
    const isLast = offset + PIECE >= base.size;
    const text = bytesToText(bytes);
    // A marker cut by the piece's end is found in the next round
    const limit = isLast ? text.length : Math.max(0, text.length - 200);
    let from = 0;
    SECTION.lastIndex = 0;
    for (let m = SECTION.exec(text); m; m = SECTION.exec(text)) {
      if (m.index >= limit) break;
      const start = m.index + m[0].indexOf('-');
      if (keep) await write(bytes.slice(from, start));
      from = start;
      await startSection(m[1]);
    }
    if (keep) await write(bytes.slice(from, limit));
    carry = bytes.slice(limit);
    onProgress(Math.min(100, Math.round(((offset + piece.length) / base.size) * 100)));
  }
  if (!sawCustomer) throw new Error('इस फाइल में customer टेबल नहीं मिली, यह पूरी बैकअप फाइल नहीं लगती');
  await startSection(undefined);
  return { replaced: blocks.map(b => b.name).filter(n => !added.includes(n)), copied, added };
}
