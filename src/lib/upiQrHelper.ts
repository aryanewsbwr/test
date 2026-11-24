import QRCode from 'qrcode';

export const UPI_VPA = '9462558949m@pnb';
export const UPI_PAYEE_NAME = 'ARYAN NEWS AGENCY';

/**
 * Builds the standard UPI payment URL
 * If amount is provided (> 0), it sets 'am' as suggestion, but leaves it editable,
 * or allows customer to enter amount freely (some apps lock amount if 'am' is present).
 * If omitAmount is true or amount <= 0, no 'am' param is included so user enters any amount.
 */
// The merchant settings from the agency's own PNB QR: some UPI apps need them to accept a set amount
const UPI_MERCHANT = '&mc=5111&mode=02';

// "Nov-2026" from "November 2026", "Nov 2026" or ("Nov", 2026)
function upiMonth(month?: string): string {
  const text = String(month || '').trim();
  const word = text.match(/[A-Za-z]{3,}/)?.[0];
  const year = text.match(/\b(20\d{2})\b/)?.[1];
  if (!word) return '';
  const mon = word.charAt(0).toUpperCase() + word.slice(1, 3).toLowerCase();
  return year ? `${mon}-${year}` : mon;
}

/**
 * The UPI payment link in every QR (WhatsApp bill, dues reminder, printed bills), as Himanshu set it
 * out (24 Nov 2026): the amount is the rounded amount printed on the bill (ROUND(x + 0.001)), and the
 * note "AC<customer number> <Mon-YYYY>" shows in the bank statement which customer paid.
 */
export function buildUpiPaymentUri(amount?: number | null, customerId?: string | number, month?: string): string {
  const rounded = Math.max(0, Math.round(Number(amount || 0) + 0.001));
  const pn = encodeURIComponent(UPI_PAYEE_NAME);
  const note = customerId ? [`AC${customerId}`, upiMonth(month)].filter(Boolean).join(' ') : '';
  return `upi://pay?pa=${UPI_VPA}&pn=${pn}&am=${rounded.toFixed(2)}&cu=INR${note ? `&tn=${encodeURIComponent(note)}` : ''}${UPI_MERCHANT}`;
}

/**
 * Generates an SVG string or DataURL for the dynamic QR code
 */
export async function generateDynamicUpiQrDataUrl(
  amount: number, 
  billNoOrCustId: string | number, 
  month?: string,
  width: number = 140
): Promise<string> {
  const uri = buildUpiPaymentUri(amount, billNoOrCustId, month);
  try {
    return await QRCode.toDataURL(uri, {
      width,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('Failed to generate dynamic UPI QR code:', err);
    return '';
  }
}

/**
 * Synchronous SVG string generator for fast HTML templates without async overhead
 */
export function generateDynamicUpiQrSvg(
  amount: number,
  billNoOrCustId: string | number,
  month?: string,
  size: number = 110,
  margin: number = 0
): string {
  const uri = buildUpiPaymentUri(amount, billNoOrCustId, month);
  let svgString = '';
  // QRCode.toString in svg mode returns SVG synchronously if callback is omitted or via sync
  QRCode.toString(uri, { type: 'svg', width: size, margin: margin, errorCorrectionLevel: 'M' }, (err, svg) => {
    if (!err && svg) {
      svgString = svg;
    }
  });
  return svgString;
}
