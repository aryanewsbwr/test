import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSecureWhatsAppToken } from '@/lib/whatsappService';

// Keeps a copy of everything WhatsApp tells the webhook (supabase/whatsapp_replies.sql):
// every customer message in wa_incoming, with photos and voice notes in the wa-media bucket,
// and every delivery status in wa_status. Nothing here may stop the webhook's own work,
// so each step only logs its errors.

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'];
const asTime = (seconds: any) => (seconds ? new Date(Number(seconds) * 1000).toISOString() : new Date().toISOString());

export async function saveStatus(s: any) {
  try {
    const error = s.errors?.[0];
    const { error: dbError } = await supabaseAdmin.from('wa_status').upsert({
      wamid: s.id,
      status: s.status,
      recipient: s.recipient_id || null,
      status_time: asTime(s.timestamp),
      error_code: error?.code != null ? Number(error.code) : null,
      error_title: error?.title || error?.message || null,
      pricing_category: s.pricing?.category || null,
      billable: s.pricing?.billable ?? null
    }, { onConflict: 'wamid,status', ignoreDuplicates: true });
    if (dbError) console.error('[WhatsApp Inbox] status not saved:', dbError.message);
  } catch (err) {
    console.error('[WhatsApp Inbox] status not saved:', err);
  }
}

function textOf(msg: any): string | null {
  if (msg.type === 'text') return msg.text?.body ?? null;
  if (msg.type === 'button') return msg.button?.text ?? null;
  if (msg.type === 'interactive') return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null;
  if (msg.type === 'reaction') return msg.reaction?.emoji ?? null;
  return msg[msg.type]?.caption ?? null;
}

export async function saveIncoming(msg: any, contacts: any[] = []) {
  try {
    const media = MEDIA_TYPES.includes(msg.type) ? msg[msg.type] : null;
    const { data, error } = await supabaseAdmin.from('wa_incoming').upsert({
      wamid: msg.id,
      from_number: msg.from,
      profile_name: contacts.find(c => c.wa_id === msg.from)?.profile?.name || null,
      msg_type: msg.type,
      body: textOf(msg),
      button_payload: msg.button?.payload ?? msg.interactive?.button_reply?.id ?? null,
      reply_to_wamid: msg.context?.id || null,
      media_id: media?.id || null,
      media_mime: media?.mime_type || null,
      msg_time: asTime(msg.timestamp),
      raw: msg
    }, { onConflict: 'wamid', ignoreDuplicates: true }).select('id');
    if (error) return console.error('[WhatsApp Inbox] message not saved:', error.message);

    // WhatsApp sends a message again when we answer slowly; only the first time fetches the file
    if (media?.id && data?.length) {
      const path = await keepMedia(media.id, msg.from, msg.id);
      if (path) await supabaseAdmin.from('wa_incoming').update({ media_path: path }).eq('wamid', msg.id);
    }
  } catch (err) {
    console.error('[WhatsApp Inbox] message not saved:', err);
  }
}

// WhatsApp keeps a customer's photo or voice note only for a while, so it is copied into Storage
async function keepMedia(mediaId: string, from: string, wamid: string): Promise<string | null> {
  const token = getSecureWhatsAppToken();
  if (!token) return null;
  const apiVersion = process.env.WA_API_VERSION || 'v25.0';
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const info = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, { headers: auth }).then(r => r.json());
    if (!info?.url) return null;
    const file = await fetch(info.url, { headers: auth });
    if (!file.ok) return null;
    const mime = String(info.mime_type || 'application/octet-stream').split(';')[0];
    const ext = mime.split('/')[1]?.replace('jpeg', 'jpg').replace('mpeg', 'mp3') || 'bin';
    const path = `${from}/${wamid.replace(/[^\w.-]/g, '_')}.${ext}`;
    const { error } = await supabaseAdmin.storage.from('wa-media')
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: mime, upsert: true });
    if (error) {
      console.error('[WhatsApp Inbox] media not stored:', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error('[WhatsApp Inbox] media not stored:', err);
    return null;
  }
}
