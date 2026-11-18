import type { Metadata } from 'next';

// Public page (no login): the privacy policy, terms and data deletion steps Meta asks for before the
// WhatsApp app can go live. Linked from Meta App settings > Basic.

export const metadata: Metadata = { title: 'Privacy Policy — Aryan News Agency' };

const FIRM = 'Aryan News Agency (आर्यन न्यूज़ एजेंसी)';
const ADDRESS = '5(1), Old Bus Stand, Beawar (Raj.) 305901';
const PHONE = '9829058949';
const WHATSAPP = '9462558949';
const EMAIL = 'aryanewsbwr@gmail.com';

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 48px', fontFamily: 'Inter, "Noto Sans Devanagari", sans-serif', lineHeight: 1.6, color: '#1e293b', background: '#fff' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Privacy Policy &amp; Terms</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>{FIRM} · {ADDRESS} · Updated 18 November 2026</p>

      <h2 id="privacy" style={{ fontSize: 18, marginTop: 24 }}>1. Who we are</h2>
      <p>{FIRM} delivers newspapers and magazines to homes and shops in Beawar. We use WhatsApp to send our customers their monthly bills and payment reminders, and to receive their replies.</p>

      <h2 style={{ fontSize: 18 }}>2. What information we keep</h2>
      <ul>
        <li>Your name, address, mobile number and the papers you take (to deliver and bill you).</li>
        <li>Your bills and payments (to keep your account).</li>
        <li>Messages, photos (such as payment screenshots) and voice notes you send to our WhatsApp number, with the time they were sent.</li>
        <li>Whether our WhatsApp messages reached you (sent, delivered, read).</li>
      </ul>

      <h2 style={{ fontSize: 18 }}>3. How we use it</h2>
      <p>Only to deliver your papers, make and send your bills, record your payments and answer your messages. We do not sell or share your information with anyone for advertising. It is kept on secure servers (Supabase and Vercel) that only our office can open, and WhatsApp messages pass through Meta&apos;s WhatsApp Business service.</p>

      <h2 style={{ fontSize: 18 }}>4. How long we keep it</h2>
      <p>Account and payment records are kept as long as you are our customer and as long as the law requires for accounts. WhatsApp messages and photos are kept only as long as needed to record your payment or answer you.</p>

      <h2 id="delete" style={{ fontSize: 18 }}>5. Deleting your data</h2>
      <p>To stop WhatsApp messages from us, or to have your messages, photos or other information deleted, send a WhatsApp message to <b>{WHATSAPP}</b>, call <b>{PHONE}</b> or email <b>{EMAIL}</b> with your name and mobile number. We delete it within 30 days, except records the law requires us to keep for accounts.</p>

      <h2 id="terms" style={{ fontSize: 18 }}>6. Terms</h2>
      <p>Bills sent on WhatsApp are for your newspaper and magazine account with us. Please check them and contact us if anything is wrong. Online payments are counted once our office records the receipt.</p>

      <h2 style={{ fontSize: 18 }}>7. Contact</h2>
      <p>{FIRM}, {ADDRESS}<br />Phone {PHONE} · WhatsApp {WHATSAPP} · {EMAIL}</p>

      <hr style={{ margin: '32px 0', border: 0, borderTop: '1px solid #e2e8f0' }} />

      <h2 style={{ fontSize: 18 }}>गोपनीयता नीति (हिंदी में)</h2>
      <p>आर्यन न्यूज़ एजेंसी आपका नाम, पता, मोबाइल नंबर, आपके पेपर, बिल और भुगतान, और हमारे WhatsApp नंबर पर भेजे आपके मैसेज व फोटो (जैसे पेमेंट का स्क्रीनशॉट) सिर्फ पेपर पहुँचाने, बिल बनाने-भेजने और भुगतान दर्ज करने के लिए रखती है। यह जानकारी किसी को बेची या विज्ञापन के लिए नहीं दी जाती।</p>
      <p>मैसेज बंद करवाने या अपना डाटा हटवाने के लिए WhatsApp <b>{WHATSAPP}</b>, फोन <b>{PHONE}</b> या ईमेल <b>{EMAIL}</b> पर अपना नाम और मोबाइल नंबर भेजें। 30 दिन में हटा दिया जाएगा (हिसाब-किताब के कानूनी रिकॉर्ड को छोड़कर)।</p>
    </main>
  );
}
