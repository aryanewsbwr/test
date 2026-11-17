// The firm's details printed on bills, reports and WhatsApp images (Master > Company), and the bill
// message (Master > Message). The values below are used until the saved ones are read, and when
// nothing is saved yet, so every print always has a heading.

export interface CompanyInfo {
  name: string;          // ARYAN NEWS AGENCY
  hindi_name: string;    // आर्यन न्यूज़ एजेंसी
  address: string;       // full address line
  short_address: string; // the short line on the 4-in-1 bill
  phone: string;
  whatsapp: string;
  email: string;
  proprietor: string;    // the name under the signature on the 4-in-1 bill
}

export const DEFAULT_COMPANY: CompanyInfo = {
  name: 'ARYAN NEWS AGENCY',
  hindi_name: 'आर्यन न्यूज़ एजेंसी',
  address: '5(1), Old Bus Stand, Beawar (Raj.) 305901',
  short_address: '5 Old Bus stand Beawar',
  phone: '9829058949',
  whatsapp: '9462558949',
  email: 'aryanewsbwr@gmail.com',
  proprietor: 'प्रो. मेहुल अग्रवाल'
};

// A saved row (old software's company table plus the website's extra columns) as CompanyInfo
export function companyFromRow(row: any): CompanyInfo {
  const pick = (v: unknown, d: string) => (String(v ?? '').trim() || d);
  return {
    name: pick(row?.name, DEFAULT_COMPANY.name),
    hindi_name: pick(row?.hindi_name, DEFAULT_COMPANY.hindi_name),
    address: pick(row?.address, DEFAULT_COMPANY.address),
    short_address: pick(row?.short_address, DEFAULT_COMPANY.short_address),
    phone: pick(row?.phone, DEFAULT_COMPANY.phone),
    whatsapp: pick(row?.mobile, DEFAULT_COMPANY.whatsapp),
    email: pick(row?.email, DEFAULT_COMPANY.email),
    proprietor: pick(row?.proprietor, DEFAULT_COMPANY.proprietor)
  };
}

// --- In the browser: read once, then every print uses it -----------------------------------------
let current: CompanyInfo = { ...DEFAULT_COMPANY };
let message = '';
let loading: Promise<void> | null = null;

export const company = () => current;
export const billMessage = () => message;

export function loadCompany(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = fetch('/api/company', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d) return;
      if (d.company) current = { ...DEFAULT_COMPANY, ...d.company };
      message = String(d.message || '').trim();
    })
    .catch(() => {});
  return loading;
}

// Text safe to put inside printed HTML
export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
