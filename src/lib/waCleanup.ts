import { supabaseAdmin } from '@/lib/supabaseAdmin';

// WhatsApp messages, their photos and the delivery ticks are kept for 2 months only, so the
// free database (500 MB) and file storage (1 GB) never fill up. Bills, receipts and the list of
// bills sent (whatsapp_messages) are never touched. Runs at most every few hours, when staff
// open the online payments screen.
export const KEEP_DAYS = 60;
let lastRun = 0;

export async function cleanOldWhatsApp() {
  if (Date.now() - lastRun < 6 * 3600 * 1000) return;
  lastRun = Date.now();
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400 * 1000).toISOString();
  try {
    for (let round = 0; round < 10; round++) {
      const { data, error } = await supabaseAdmin.from('wa_incoming').select('id, media_path').lt('msg_time', cutoff).limit(500);
      if (error || !data?.length) break;
      const paths = data.map(r => r.media_path).filter(Boolean) as string[];
      if (paths.length) {
        const { error: removeError } = await supabaseAdmin.storage.from('wa-media').remove(paths);
        // A photo that could not be removed keeps its message, so it is tried again next time
        if (removeError) { console.error('[WhatsApp cleanup] photos not removed:', removeError.message); break; }
      }
      await supabaseAdmin.from('wa_incoming').delete().in('id', data.map(r => r.id));
    }
    await supabaseAdmin.from('wa_status').delete().lt('status_time', cutoff);
  } catch (err) {
    console.error('[WhatsApp cleanup] failed:', err);
  }
}
