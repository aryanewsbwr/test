import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSecureWhatsAppToken } from '@/lib/whatsappService';
import { saveIncoming, saveStatus } from '@/lib/whatsappInbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET Handler: Meta Webhook Verification
 * Meta sends hub.mode, hub.verify_token, and hub.challenge
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'aryan_news_agency_verify_token_2026';

  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verification successful!');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] Verification failed. Token mismatch.');
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * Validates Meta's HMAC-SHA256 signature
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WA_APP_SECRET;
  if (!appSecret) {
    // If secret is not yet configured, log warning but allow dev flow
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const signature = signatureHeader.substring(7);
  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedHash, 'hex'));
}

/**
 * Sends a free-form customer service text response within the 24-hour service window.
 */
async function sendAutoReply(toPhone: string, text: string) {
  const token = getSecureWhatsAppToken();
  const phoneId = process.env.WA_PHONE_NUMBER_ID || '867112479817671';
  const apiVersion = process.env.WA_API_VERSION || 'v25.0';

  if (!token) return;

  try {
    await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body: text }
      })
    });
  } catch (err) {
    console.error('[WhatsApp Webhook] Auto-reply error:', err);
  }
}

/**
 * POST Handler: Real-time Message Statuses & Inbound Quick Reply Events
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!verifySignature(rawBody, signature)) {
      console.warn('[WhatsApp Webhook] Invalid signature rejected');
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // Process entries asynchronously so Meta receives 200 OK immediately
    if (payload.object === 'whatsapp_business_account' && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (!value) continue;

          // 1. Handle Status Updates (sent / delivered / read / failed)
          const statuses = value.statuses || [];
          for (const s of statuses) {
            await saveStatus(s);
            const wamid = s.id;
            const newStatus = s.status; // 'sent' | 'delivered' | 'read' | 'failed'
            const timestamp = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();

            const updateData: any = {
              status: newStatus,
              updated_at: timestamp
            };

            if (newStatus === 'failed') {
              const errors = s.errors || [];
              if (errors.length > 0) {
                updateData.error_code = String(errors[0].code);
                updateData.error_json = errors[0];
              }
            }

            await supabaseAdmin
              .from('whatsapp_messages')
              .update(updateData)
              .eq('wamid', wamid);
          }

          // 2. Handle Inbound Customer Messages / Button Clicks ("भुगतान कर दिया")
          const messages = value.messages || [];
          for (const msg of messages) {
            await saveIncoming(msg, value.contacts);
            const fromPhone = msg.from; // e.g. 919887500875
            let isPaidClick = false;

            if (msg.type === 'button' && msg.button?.text?.includes('भुगतान')) {
              isPaidClick = true;
            } else if (msg.type === 'interactive' && msg.interactive?.button_reply?.title?.includes('भुगतान')) {
              isPaidClick = true;
            } else if (msg.type === 'text' && msg.text?.body?.toLowerCase().includes('paid')) {
              isPaidClick = true;
            }

            if (isPaidClick) {
              console.log(`[WhatsApp Webhook] Customer ${fromPhone} clicked "भुगतान कर दिया"`);

              // Mark latest message record for this customer
              await supabaseAdmin
                .from('whatsapp_messages')
                .update({
                  error_json: { payment_claimed: true, claimed_at: new Date().toISOString() },
                  updated_at: new Date().toISOString()
                })
                .eq('phone', fromPhone)
                .order('created_at', { ascending: false })
                .limit(1);

              // Auto-reply asking for payment screenshot
              const replyText = 'धन्यवाद! 🙏 कृपया भुगतान का स्क्रीनशॉट इसी चैट में भेजें, ताकि हम आपके खाते में भुगतान दर्ज कर सकें। — आर्यन न्यूज़ एजेंसी';
              await sendAutoReply(fromPhone, replyText);
            }
          }
        }
      }
    }

    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (err: any) {
    console.error('[WhatsApp Webhook Error]:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
