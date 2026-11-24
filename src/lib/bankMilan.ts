// Bank Milan (बैंक जमा मिलान): reading the PNB and PhonePe statements, and the signals that tell
// which customer a UPI credit came from. Moved onto the website from Himanshu's own matching
// project (aryan_bank_milan, 27 Oct - 24 Nov 2026); the rules are his.

export interface BankCredit {
  key: string;            // UTR, or "<Txn No>_<amount>" when the line has none
  txn_no: string;
  credit_date: string;    // yyyy-mm-dd
  amount: number;
  narration: string;
  payer_name: string;
  payer_bank: string;
  payer_vpa: string;
  payer_mobile: string;
}

export interface PhonePeCredit { utr: string; name: string; amount: number }

// A small CSV reader (quoted fields, commas and new lines inside quotes)
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// The payer's 10-digit mobile number when the UPI ID starts with it (9414831572@axl, 919887500875@wa)
export function mobileFromVpa(vpa: string): string {
  const digits = String(vpa || '').match(/^\d+/)?.[0] || '';
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
}

// "UPI/CR/<UTR>/<name>/<bank>/<UPI ID>/<remark>" (other credits: NEFT, cheque...)
function readNarration(text: string) {
  const m = text.match(/^UPI\/(?:CR|DR)\/(\d+)\/([^/]*)\/([^/]*)\/([^/]*)/);
  if (m) {
    const vpa = m[4].trim();
    return { utr: m[1], name: m[2].replace(/\s+/g, ' ').trim(), bank: m[3].trim(), vpa, mobile: mobileFromVpa(vpa) };
  }
  const name = text.includes('NEFT') ? text.split('/').pop()!.trim() : text.replace(/^\d+\s+O\/W\s+\d+\s+/, '').trim();
  return { utr: '', name, bank: '', vpa: '', mobile: '' };
}

const isoFromDmy = (d: string) => {
  const m = d.trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const money = (s: string) => Number(String(s || '').replace(/,/g, '').trim()) || 0;

/**
 * A PNB statement CSV: the new ONE BIZ layout (Txn No, Txn Date dd/mm/yyyy, Description, Branch,
 * Cheque, Dr, Cr, Balance) or the older 15-column one (date dd-mm-yyyy in the 4th column). Credits only.
 */
export function parsePnbStatement(text: string): BankCredit[] {
  const out: BankCredit[] = [];
  for (const r of parseCsv(text.replace(/^﻿/, ''))) {
    let txn = '', date = '', desc = '', cr = 0;
    if (r.length >= 8 && /^\d{2}\/\d{2}\/\d{4}$/.test((r[1] || '').trim())) {
      txn = r[0]; date = isoFromDmy(r[1]); desc = r[2]; cr = money(r[6]);
    } else if (r.length >= 14 && /^\d{2}-\d{2}-\d{4}$/.test((r[3] || '').trim())) {
      txn = r[1]; date = isoFromDmy(r[3]); desc = r[5]; cr = money(r[12]);
    } else continue;
    if (!date || cr <= 0) continue;
    const n = readNarration(desc.trim());
    out.push({
      key: n.utr || `${txn.trim()}_${Math.round(cr)}`,
      txn_no: txn.trim(), credit_date: date, amount: Math.round(cr * 100) / 100, narration: desc.trim(),
      payer_name: n.name, payer_bank: n.bank, payer_vpa: n.vpa, payer_mobile: n.mobile
    });
  }
  return out;
}

// PhonePe business statement: "Received from <name>" with the UTR the PNB line carries too
export function parsePhonePeStatement(text: string): PhonePeCredit[] {
  return parseCsv(text.replace(/^﻿/, ''))
    .filter(r => r.length > 7 && r[5]?.trim() === 'CREDIT')
    .map(r => ({ utr: String(r[4] || '').trim().replace(/^0+/, ''), name: String(r[2] || '').replace(/^Received from\s+/i, '').trim(), amount: money(r[7]) }))
    .filter(r => r.utr);
}

// ---- name likeness (PhonePe name or the bank's short sender name against a customer's name)
const STOP = new Set(['ji', 'mr', 'mrs', 'dr', 'smt', 's', 'o', 'so', 'br', 'kumar', 'singh', 'sri', 'shri', 'the']);
export const nameWords = (s: string) => (String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []);
const coreWords = (s: string) => nameWords(s).filter(w => w.length >= 3 && !STOP.has(w) && !/\d/.test(w));
const sameWord = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** How many of the payer's name words are in the customer's name (0 when the first word is not) */
export function nameFit(payer: string, customerName: string): { fit: number; words: number } {
  const core = coreWords(payer);
  const theirs = nameWords(customerName);
  if (!core.length || !theirs.some(t => sameWord(core[0], t))) return { fit: 0, words: core.length };
  return { fit: core.filter(w => theirs.some(t => sameWord(w, t))).length, words: core.length };
}

// The hawker codes used in Himanshu's register
export const HAWKER_CODES: Record<string, string> = {
  sala: 'Salam', pawa: 'PawanKaluDada', kalu: 'PawanKaluDada', duka: 'दुकान (Office)', para: 'Paras',
  nemi: 'Nemi Nath Ji', jagd: 'Jagdish', swa: 'Swapnil'
};
