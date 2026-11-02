import { fyLabel, fySuffix } from './financialYear';

// Reads the MySQL .sql file from the old software in the browser, a piece at a time.
const PIECE_SIZE = 16 * 1024 * 1024;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export interface SqlTable {
  columns: string[];
  rows: any[][];
}

function bytesToText(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 32768) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 32768) as unknown as number[]));
  }
  return parts.join('');
}

// The file is read byte by byte, so one value's special letters are still raw bytes. A dump can be
// UTF-8 or single-byte; either way the old font's ई byte must end up as š, as the database holds it.
export function textFromBytes(value: string): string {
  if (!/[\x80-\xff]/.test(value)) return value;
  const bytes = Uint8Array.from(value, ch => ch.charCodeAt(0));
  try {
    return UTF8.decode(bytes);
  } catch {
    return value.replace(/\x9a/g, 'š').replace(/\x8a/g, 'Š');
  }
}

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '0': '\0', Z: '\x1a' };

// One "(a,'b',NULL)" group starting at pos, or null if the text ends before it closes
function readRow(text: string, start: number): { values: any[]; next: number } | null {
  const values: any[] = [];
  let pos = start + 1;

  while (pos < text.length) {
    while (text[pos] === ' ') pos++;

    if (text[pos] === "'") {
      let value = '';
      let piece = ++pos;
      while (true) {
        if (pos >= text.length) return null;
        const ch = text[pos];
        if (ch === '\\') {
          if (pos + 1 >= text.length) return null;
          const escaped = text[pos + 1];
          value += text.slice(piece, pos) + (ESCAPES[escaped] ?? escaped);
          pos += 2;
          piece = pos;
        } else if (ch === "'") {
          if (pos + 1 >= text.length) return null;
          if (text[pos + 1] === "'") {
            value += text.slice(piece, pos) + "'";
            pos += 2;
            piece = pos;
          } else {
            value += text.slice(piece, pos);
            pos++;
            break;
          }
        } else {
          pos++;
        }
      }
      values.push(textFromBytes(value));
    } else {
      const begin = pos;
      while (pos < text.length && text[pos] !== ',' && text[pos] !== ')') pos++;
      if (pos >= text.length) return null;
      const raw = text.slice(begin, pos).trim();
      values.push(raw === 'NULL' ? null : Number.isNaN(Number(raw)) ? raw : Number(raw));
    }

    if (pos >= text.length) return null;
    if (text[pos] === ')') return { values, next: pos + 1 };
    pos++;
  }
  return null;
}

export async function readSqlFile(
  file: Blob,
  wanted: Set<string>,
  onProgress: (percent: number) => void
): Promise<Record<string, SqlTable>> {
  const tables: Record<string, SqlTable> = {};
  let current: SqlTable | null = null;
  let carry = '';

  for (let offset = 0; offset < file.size; offset += PIECE_SIZE) {
    const piece = await file.slice(offset, offset + PIECE_SIZE).arrayBuffer();
    const text = carry + bytesToText(new Uint8Array(piece));
    const isLast = offset + PIECE_SIZE >= file.size;
    carry = '';
    let pos = 0;

    while (true) {
      if (!current) {
        const start = text.indexOf('INSERT INTO `', pos);
        if (start < 0) {
          carry = text.slice(-300);
          break;
        }
        const open = text.indexOf('VALUES', start);
        if (open < 0) {
          carry = text.slice(start);
          break;
        }
        const header = text.slice(start, open);
        const name = (header.match(/^INSERT INTO `([^`]+)`/)?.[1] || '').toLowerCase();
        pos = open + 6;
        if (!wanted.has(name)) continue;

        const columns = [...header.slice(header.indexOf('(')).matchAll(/`([^`]+)`/g)].map(m => m[1].toLowerCase());
        tables[name] = tables[name] || { columns, rows: [] };
        current = tables[name];
      }

      // Move to the next "(" or the ";" that ends this statement
      while (pos < text.length && text[pos] !== '(' && text[pos] !== ';') pos++;
      if (pos >= text.length) break;
      if (text[pos] === ';') {
        current = null;
        continue;
      }

      const row = readRow(text, pos);
      if (!row) {
        if (isLast) throw new Error('The file ends in the middle of a row, so it is incomplete');
        carry = text.slice(pos);
        break;
      }
      current.rows.push(row.values);
      pos = row.next;
    }

    onProgress(Math.min(100, Math.round(((offset + piece.byteLength) / file.size) * 100)));
    await new Promise(resolve => setTimeout(resolve));
  }

  return tables;
}

export function toIsoDate(value: any): string | null {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text === '0000-00-00' ? null : text.slice(0, 10);
  const parts = text.split(/[/\-.]/);
  if (parts.length === 3 && parts[2].length === 4 && /^\d+$/.test(parts.join(''))) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return null;
}

function renamed(names: Record<string, string>) {
  return (row: any) => {
    const result: any = {};
    for (const [column, value] of Object.entries(row)) if (names[column] !== '') result[names[column] || column] = value;
    return result;
  };
}

function datesOf(columns: string[], map: (row: any) => any) {
  return (row: any) => {
    const result = map(row);
    for (const column of columns) result[column] = toIsoDate(result[column]);
    return result;
  };
}

const money = (value: any) => (value === null || value === undefined || value === '' ? null : Number(value));

function receiptFromOldRow(r: any) {
  const billDate = toIsoDate(r.billdate);
  const paidDate = toIsoDate(r.malrecpdt);
  return {
    id: r.receipt_id,
    recp_no: r.receiptno,
    recp_date: billDate || paidDate,
    customer_id: r.customer_id,
    bill_amt: money(r.billamt) ?? 0,
    less_amt: money(r.lessamt) ?? 0,
    mal_recp_amt: money(r.malrecpamt) ?? 0,
    month: r.month || '',
    year: String(r.year ?? ''),
    region_id: null,
    remarks: JSON.stringify({
      bill_no: r.bill_id,
      manual_rep_no: String(r.manualrepno ?? ''),
      mal_rep_no: String(r.manualrepno ?? ''),
      mal_recp_dt: paidDate,
      balance: money(r.balance) ?? 0,
      cash_chq: r.cash_chq || 'Cash',
      r_amt: money(r.ramt) ?? 0
    })
  };
}

function discontinueFromOldRow(r: any) {
  const permanent = ['P', 'PERMANENT'].includes(String(r.temp_perma ?? '').trim().toUpperCase());
  return {
    discontinue_id: r.discontinue_id,
    sno: r.sno,
    customer_id: r.customer_id,
    publica_id: r.publica_id,
    temp_perma: permanent ? 'Permanent' : 'Temporary',
    temp_from: toIsoDate(r.temp_from),
    temp_to: toIsoDate(r.temp_to),
    entry_date: toIsoDate(r.entrydate),
    // The subscription the stop was entered for; billing applies the stop to that one only
    s_date: toIsoDate(r.s_date),
    c_date: toIsoDate(r.c_date),
    financial_year: fyLabel()
  };
}

export interface OldTable {
  source: string;
  target: string;
  map: (row: any) => any;
}

export function oldSoftwareTables(): OldTable[] {
  const plain = (name: string, names: Record<string, string> = {}) => ({ source: name, target: name, map: renamed(names) });

  const suffix = fySuffix();

  return [
    plain('customer', { fonttype: 'font_type', govtsupply: 'govt_supply', is_inactive: '' }),
    // The database numbers subscriptions itself, so the old sno is not kept
    { source: 'customer_detail', target: 'customer_detail', map: datesOf(['s_date', 'c_date'], renamed({ sno: '' })) },
    plain('hawker', { region_id: '' }),
    plain('publication', { typep: 'type_p', magzineday: 'magzine_day', magzinemonth: 'magzine_month', chrdel: 'chr_del' }),
    plain('publisher'),
    plain('regiond'),
    { source: 'collect', target: 'collect', map: renamed({ collect_id: 'Collect_id' }) },
    plain('rate'),
    { source: 'ratechange', target: 'ratechange', map: datesOf(['effective_date'], renamed({ dated: 'effective_date' })) },
    {
      source: 'holiday',
      target: 'holiday',
      map: r => ({ oc_date: r.oc_date, dated: r.oc_date, publica_id: r.publica_id, remark: 'Press Holiday' })
    },
    {
      source: 'publicationdis',
      target: 'publicationdis',
      map: r => ({ publica_id: r.publica_id, entry_date: toIsoDate(r.fromdate), oc_date: toIsoDate(r.todate), dis_type: 'P', remark: 'Discontinued' })
    },
    plain('publicationsup'),
    { source: `discontinue${suffix}`, target: 'discontinue', map: discontinueFromOldRow },
    // Closed years stay as they are; only the running year comes in
    plain(`billno${suffix}`),
    plain(`bill${suffix}`, { totalamt: 'total_amt' }),
    plain(`billdel${suffix}`),
    { source: `receipt${suffix}`, target: `receipt${suffix}`, map: receiptFromOldRow },
    { source: `retailsale${suffix}`, target: `retailsale${suffix}`, map: datesOf(['vr_date'], renamed({})) },
    {
      source: `receiptissue${suffix}`,
      target: `receiptissue${suffix}`,
      map: datesOf(['IssueDate', 'RecDate'], renamed({ collect_id: 'Collect_id', receiptfrom: 'ReceiptFrom', receiptto: 'ReceiptTo', issuedate: 'IssueDate', recdate: 'RecDate' }))
    }
  ];
}

export function rowsOf(table: SqlTable, map: (row: any) => any): any[] {
  return table.rows.map(values => {
    const row: any = {};
    table.columns.forEach((column, i) => { row[column] = values[i]; });
    return map(row);
  });
}
