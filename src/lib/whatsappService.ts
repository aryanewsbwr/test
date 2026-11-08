import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getReliableHindiName } from '@/lib/transliteration';
import { REMINDER_TEMPLATE_NAME } from '@/lib/paymentReminder';

/**
 * WhatsApp Cloud API Service Helper (Server-Side Only)
 * Official Meta Graph API v25.0
 * Aryan News Agency, Beawar
 */

/**
 * Securely retrieves the Meta Token from the encrypted vault (.wa_vault.enc)
 * or fallback env variable, so the raw token is never exposed in plain text.
 */
export function getSecureWhatsAppToken(): string | null {
  try {
    const vaultPath = path.join(process.cwd(), '.wa_vault.enc');
    if (fs.existsSync(vaultPath)) {
      const raw = fs.readFileSync(vaultPath, 'utf-8');
      const payload = JSON.parse(raw);
      const salt = Buffer.from(payload.salt, 'hex');
      const iv = Buffer.from(payload.iv, 'hex');
      const tag = Buffer.from(payload.tag, 'hex');
      const secretKey = crypto.scryptSync('aryan_news_agency_vault_2026', salt, 32);

      const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(payload.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
  } catch (err) {
    console.error('[Security Vault] Could not decrypt token:', err);
  }

  const rawEnv = process.env.WA_TOKEN;
  if (rawEnv && rawEnv !== 'ENCRYPTED_VAULT') {
    return rawEnv;
  }
  return null;
}

export interface WhatsAppSendResult {
  success: boolean;
  wamid?: string;
  mediaId?: string;
  errorCode?: string;
  errorJson?: any;
}

export interface WhatsAppBillTemplateParams {
  toPhone: string;
  customerName: string;
  month: string;
  billNo: string;
  accountNo: string;
  currentAmount: number | string;
  previousDue: number | string;
  totalPayable: number | string;
  billImageBuffer: Buffer;
  imageFileName?: string;
}

/**
 * Normalizes phone numbers strictly into Meta's required format:
 * '91' + 10-digit mobile number, digits only (no +, spaces, leading 0).
 * Returns null if the phone is missing or invalid.
 */
export function formatWhatsAppPhone(phone: string | number | undefined | null): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  
  if (digits.length === 10) {
    return `91${digits}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  return null;
}

/**
 * Uploads a bill PNG image buffer to Meta WhatsApp Cloud API Media endpoint.
 * Returns the Media ID string.
 */
export async function uploadWhatsAppMedia(
  imageBuffer: Buffer,
  fileName: string = 'bill.png'
): Promise<{ success: boolean; mediaId?: string; error?: any }> {
  const token = getSecureWhatsAppToken();
  const phoneId = process.env.WA_PHONE_NUMBER_ID || '867112479817671';
  const apiVersion = process.env.WA_API_VERSION || 'v25.0';

  if (!token) {
    return { success: false, error: 'WhatsApp API credentials could not be loaded securely' };
  }

  try {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', 'image/png');
    formData.append('file', new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }), fileName);

    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const data = await res.json();
    if (res.ok && data.id) {
      return { success: true, mediaId: data.id };
    } else {
      console.error('Meta Media Upload Error:', data);
      return { success: false, error: data };
    }
  } catch (err: any) {
    console.error('Network error uploading WhatsApp media:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Sends the approved 'monthly_bill_hi' template message with Image Header & 7 body parameters.
 */
export async function sendWhatsAppBillMessage(params: WhatsAppBillTemplateParams): Promise<WhatsAppSendResult> {
  const token = getSecureWhatsAppToken();
  const phoneId = process.env.WA_PHONE_NUMBER_ID || '867112479817671';
  const apiVersion = process.env.WA_API_VERSION || 'v25.0';
  const templateName = process.env.WA_TEMPLATE_NAME || 'monthly_bill_hi';

  if (!token) {
    return {
      success: false,
      errorCode: 'NO_TOKEN',
      errorJson: { message: 'WhatsApp API credentials could not be loaded securely' }
    };
  }

  const cleanPhone = formatWhatsAppPhone(params.toPhone);
  if (!cleanPhone) {
    return {
      success: false,
      errorCode: 'INVALID_PHONE',
      errorJson: { message: `Invalid phone format: ${params.toPhone}` }
    };
  }

  // 1. Upload the bill PNG first to obtain the Media ID
  const uploadResult = await uploadWhatsAppMedia(params.billImageBuffer, params.imageFileName || `Bill_${params.billNo}.png`);
  if (!uploadResult.success || !uploadResult.mediaId) {
    return {
      success: false,
      errorCode: 'MEDIA_UPLOAD_FAILED',
      errorJson: uploadResult.error
    };
  }

  const mediaId = uploadResult.mediaId;

  // 2. Format 7 body variables strictly as 2-decimal non-empty strings
  const fmtMoney = (val: number | string) => {
    const n = Number(val || 0);
    return isNaN(n) ? '0.00' : n.toFixed(2);
  };

  const p1 = (params.customerName || 'ग्राहक').trim();
  const p2 = (params.month || 'माह').trim();
  const p3 = String(params.billNo || '').trim() || '0';
  const p4 = String(params.accountNo || '').trim() || '0';
  const p5 = fmtMoney(params.currentAmount);
  const p6 = fmtMoney(params.previousDue);
  const p7 = fmtMoney(params.totalPayable);

  const payload = {
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'hi' },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: { id: mediaId }
            }
          ]
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: p1 },
            { type: 'text', text: p2 },
            { type: 'text', text: p3 },
            { type: 'text', text: p4 },
            { type: 'text', text: p5 },
            { type: 'text', text: p6 },
            { type: 'text', text: p7 }
          ]
        }
      ]
    }
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.messages && data.messages[0]?.id) {
      return {
        success: true,
        wamid: data.messages[0].id,
        mediaId
      };
    } else {
      console.error('Meta Send Message Error:', data);
      const errObj = data?.error || data;
      return {
        success: false,
        mediaId,
        errorCode: String(errObj?.code || 'SEND_FAILED'),
        errorJson: errObj
      };
    }
  } catch (err: any) {
    console.error('Network error sending WhatsApp message:', err);
    return {
      success: false,
      mediaId,
      errorCode: 'NETWORK_ERROR',
      errorJson: { message: err?.message || String(err) }
    };
  }
}

/**
 * Cleanly formats the customer's name for the approved WhatsApp template 'monthly_bill_hi'.
 * NOTE: The approved Meta template text is already:
 * "नमस्ते {{1}} जी,\nआर्यन न्यूज़ एजेंसी..."
 * So variable {{1}} MUST contain only the customer's clean name WITHOUT any "ji", "jee", or "जी".
 * That way, WhatsApp renders: "नमस्ते " + name + " जी," (never duplicate "जी जी").
 * 
 * E.g. "M A Rehmani ji" -> "M A Rehmani" (renders as "नमस्ते M A Rehmani जी,")
 *      "Lakshay ji Bhati" -> "Lakshay Bhati" (renders as "नमस्ते Lakshay Bhati जी,")
 *      "Ganpati Enterprises" -> "Ganpati Enterprises" (renders as "नमस्ते Ganpati Enterprises जी,")
 */
export function formatWhatsAppCustomerName(rawName: string | undefined | null): string {
  if (!rawName) return 'ग्राहक';
  let clean = String(rawName).trim().replace(/\s+crd\b/i, '').trim();
  // Strip trailing regional tags / numbers
  clean = clean.replace(/\s+(Df|3IMB|5AN|5dn|Hb|Scl|Mr1|Mr2|Sr2|Ag|NN|Gpr|Br)$/i, '').trim();
  clean = clean.replace(/\s+\d+$/i, '').trim();

  // Strip all occurrences of ji, jee, and जी (case-insensitive) anywhere in the name
  clean = clean.replace(/\b(ji|jee|ji\.|jee\.)\b/gi, ' ');
  clean = clean.replace(/(\s|^)जी(\s|$)/g, ' ');
  // Also strip if attached to word end
  clean = clean.replace(/(जी)+$/g, '');
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean || 'ग्राहक';
}

/**
 * Name used for the WhatsApp template variable {{1}} (chat text, rendered by Meta,
 * so Devanagari is safe here). Prefers a trustworthy Hindi name; falls back to the
 * clean English name when no reliable Hindi exists. The approved template already
 * appends " जी," so any trailing जी is stripped to avoid "जी जी".
 */
export function whatsAppDisplayName(rawName: string | undefined | null, rawHindi?: string | undefined | null): string {
  const hindi = getReliableHindiName(rawHindi || '', rawName || '');
  if (hindi) {
    // Legacy names carry route codes (सी38, 1.41, 201) and a जी mid-name (संजय जी गुप्ता)
    const stripped = hindi
      .replace(/\s+[ऀ-ॿ]{1,3}\d+\s*$/, '')
      .replace(/\s+\d[\d./]*\s*$/, '')
      .replace(/(^|\s)जी(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (stripped) return stripped;
  }
  return formatWhatsAppCustomerName(rawName);
}

/**
 * Sends the approved payment reminder template (see paymentReminder.ts): name, customer number,
 * date and amount due, with no image.
 */
export async function sendWhatsAppReminderMessage(params: {
  toPhone: string;
  customerName: string;
  customerId: string;
  date: string;
  amount: string;
}): Promise<WhatsAppSendResult> {
  const token = getSecureWhatsAppToken();
  const phoneId = process.env.WA_PHONE_NUMBER_ID || '867112479817671';
  const apiVersion = process.env.WA_API_VERSION || 'v25.0';
  const templateName = process.env.WA_REMINDER_TEMPLATE_NAME || REMINDER_TEMPLATE_NAME;

  if (!token) {
    return { success: false, errorCode: 'NO_TOKEN', errorJson: { message: 'WhatsApp API credentials could not be loaded securely' } };
  }
  const cleanPhone = formatWhatsAppPhone(params.toPhone);
  if (!cleanPhone) {
    return { success: false, errorCode: 'INVALID_PHONE', errorJson: { message: `Invalid phone format: ${params.toPhone}` } };
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'hi' },
      components: [{
        type: 'body',
        parameters: [params.customerName || 'ग्राहक', params.customerId, params.date, params.amount]
          .map(text => ({ type: 'text', text: String(text).trim() || '0' }))
      }]
    }
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.messages?.[0]?.id) return { success: true, wamid: data.messages[0].id };
    const errObj = data?.error || data;
    return { success: false, errorCode: String(errObj?.code || 'SEND_FAILED'), errorJson: errObj };
  } catch (err: any) {
    return { success: false, errorCode: 'NETWORK_ERROR', errorJson: { message: err?.message || String(err) } };
  }
}
