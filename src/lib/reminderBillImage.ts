import sharp from 'sharp';
import { MANGAL_FONT_BASE64 } from '@/assets/fonts/mangalBase64';
import { generateDynamicUpiQrSvg } from '@/lib/upiQrHelper';

// What a customer owes this year, as the Due Region Wise Summary works it out
export interface ReminderStatement {
  customerId: number;
  name: string;
  nameHindi?: string;
  region?: string;
  phone?: string;
  date: string;
  // The financial year the account is for, 2026-27
  year: string;
  yearEndDues: number;
  bills: number;
  delivery: number;
  received: number;
  less: number;
  balance: number;
  lastBillMonth?: string;
  lastBillAmount?: number;
}

function xml(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const money = (n: number) => Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The reminder bill: a slip the same width as the WhatsApp bill, marked as a payment reminder,
 * with the year's account (dues brought forward, bills, delivery, received, less), the balance
 * due and a UPI code for that amount.
 */
export async function reminderBillPng(s: ReminderStatement): Promise<Buffer> {
  const font = `'Mangal', Arial, sans-serif`;
  const lines: { label: string; hindi: string; amount: number; minus?: boolean }[] = [
    { label: 'Previous Year Dues', hindi: 'पिछला बकाया', amount: s.yearEndDues },
    { label: 'Newspaper Bills', hindi: 'अखबार बिल', amount: s.bills + s.delivery },
    { label: 'Received', hindi: 'जमा राशि', amount: s.received, minus: true },
    { label: 'Less / Discount', hindi: 'छूट', amount: s.less, minus: true }
  ].filter(l => Math.abs(l.amount) >= 0.005);

  let y = 318;
  const rows = lines.map(l => {
    const row = `
      <text x="16" y="${y}" font-size="13" class="r">${xml(l.hindi)} <tspan font-size="11" fill="#444">(${xml(l.label)})</tspan></text>
      <text x="384" y="${y}" font-size="14" class="b" text-anchor="end" fill="${l.minus ? '#166534' : '#000'}">${l.minus ? '- ' : ''}Rs. ${money(l.amount)}</text>`;
    y += 26;
    return row;
  }).join('');

  const boxY = y + 2;
  const lastY = boxY + 66;
  const hasLast = !!s.lastBillMonth && Number(s.lastBillAmount) > 0;
  const qrY = (hasLast ? lastY + 18 : boxY + 60);
  // The code is drawn in its own small units (one per square), so it is scaled up to 132 px
  const raw = generateDynamicUpiQrSvg(s.balance, s.customerId, '', 140, 0).trim();
  const units = Number(raw.match(/viewBox="0 0 (\d+(?:\.\d+)?)/)?.[1]) || 132;
  const qr = `<g transform="translate(4,4) scale(${132 / units})">${raw.replace(/^<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '')}</g>`;
  const footY = qrY + 160;
  const height = footY + 110;
  const title = s.nameHindi || s.name;

  const svg = `
  <svg width="400" height="${height}" viewBox="0 0 400 ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>
      @font-face { font-family: 'Mangal'; src: url('data:font/truetype;charset=utf-8;base64,${MANGAL_FONT_BASE64}') format('truetype'); }
      .b { font-family: ${font}; font-weight: 800; }
      .m { font-family: ${font}; font-weight: 600; }
      .r { font-family: ${font}; font-weight: normal; }
    </style></defs>
    <rect width="400" height="${height}" fill="#ffffff"/>
    <rect x="0" y="0" width="400" height="8" fill="#B91C1C"/>

    <text x="200" y="40" font-size="19" class="b" text-anchor="middle" letter-spacing="0.5">ARYAN NEWS AGENCY</text>
    <text x="200" y="62" font-size="12" class="m" fill="#222" text-anchor="middle">5(1), Old Bus Stand, Beawar (Raj.) 305901</text>
    <text x="200" y="81" font-size="12" class="r" fill="#222" text-anchor="middle">WhatsApp: 9462558949 | Ph: 9829058949</text>

    <rect x="16" y="94" width="368" height="44" rx="6" fill="#FEF2F2" stroke="#B91C1C" stroke-width="2"/>
    <text x="200" y="114" font-size="16" class="b" fill="#B91C1C" text-anchor="middle">पेमेंट रिमाइंडर</text>
    <text x="200" y="131" font-size="11.5" class="b" fill="#B91C1C" text-anchor="middle" letter-spacing="2">PAYMENT REMINDER</text>

    <text x="16" y="164" font-size="14" class="b">A/c No: ${xml(s.customerId)}</text>
    <text x="384" y="164" font-size="14" class="b" text-anchor="end">Date: ${xml(s.date)}</text>
    <line x1="16" y1="178" x2="384" y2="178" stroke="#000" stroke-width="1.2" stroke-dasharray="5,3"/>

    <text x="16" y="204" font-size="16" class="b">${xml(title)}</text>
    ${s.nameHindi ? `<text x="16" y="224" font-size="12" class="r" fill="#333">${xml(s.name.toUpperCase())}</text>` : ''}
    <text x="16" y="246" font-size="12" class="r">Region: ${xml(s.region || '')}</text>
    <text x="384" y="246" font-size="12" class="r" text-anchor="end">${s.phone ? `Mob: ${xml(s.phone)}` : ''}</text>
    <line x1="16" y1="262" x2="384" y2="262" stroke="#000" stroke-width="1.2" stroke-dasharray="5,3"/>

    <text x="16" y="286" font-size="13" class="b">खाता विवरण (Account ${xml(s.year)})</text>
    <text x="384" y="286" font-size="13" class="b" text-anchor="end">Amount</text>
    <line x1="16" y1="296" x2="384" y2="296" stroke="#000" stroke-width="1" stroke-dasharray="4,2"/>
    ${rows}

    <rect x="16" y="${boxY}" width="368" height="46" rx="6" fill="#B91C1C"/>
    <text x="32" y="${boxY + 21}" font-size="14" class="b" fill="#fff">कुल बकाया</text>
    <text x="32" y="${boxY + 37}" font-size="10.5" class="b" fill="#FECACA" letter-spacing="1">BALANCE DUE</text>
    <text x="368" y="${boxY + 31}" font-size="20" class="b" fill="#fff" text-anchor="end">Rs. ${money(s.balance)}</text>
    ${hasLast ? `<text x="200" y="${lastY}" font-size="12" class="r" fill="#333" text-anchor="middle">अंतिम बिल ${xml(s.lastBillMonth)}: Rs. ${money(Number(s.lastBillAmount))}</text>` : ''}

    <g transform="translate(130, ${qrY})">
      <rect width="140" height="140" fill="#fff" stroke="#e2e8f0" rx="4"/>
      ${qr}
    </g>
    <text x="200" y="${footY - 2}" font-size="13" class="b" text-anchor="middle">Scan &amp; Pay Rs. ${Math.round(s.balance)} via any UPI app</text>
    <text x="200" y="${footY + 15}" font-size="11.5" class="r" fill="#333" text-anchor="middle">GooglePay / PhonePe / Paytm / BHIM</text>
    <line x1="16" y1="${footY + 30}" x2="384" y2="${footY + 30}" stroke="#000" stroke-width="1.2" stroke-dasharray="5,3"/>
    <text x="200" y="${footY + 52}" font-size="12.5" class="b" text-anchor="middle">कृपया शीघ्र भुगतान करें। भुगतान के बाद स्क्रीनशॉट भेजें।</text>
    <text x="200" y="${footY + 71}" font-size="11.5" class="b" fill="#B91C1C" text-anchor="middle">यदि भुगतान कर चुके हैं तो कृपया ध्यान न दें।</text>
    <text x="200" y="${footY + 94}" font-size="13" class="b" text-anchor="middle">धन्यवाद! Thank You!</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
