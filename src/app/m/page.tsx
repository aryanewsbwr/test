'use client';

// The staff mobile app: one task per screen, big buttons, everything in Hindi.
// Login (name + PIN) -> Home -> Search / Customer / पैसे जमा -> जाँच -> हो गया, बकाया सूची, बोलकर काम.
// Nothing is saved without the जाँच (confirm) screen, and nothing is deleted from here.

import React, { useCallback, useEffect, useRef, useState } from 'react';

type View = 'loading' | 'login' | 'home' | 'search' | 'customer' | 'pay' | 'confirm' | 'done' | 'dues' | 'voice' | 'later'
  | 'stop' | 'start' | 'extra' | 'change-confirm' | 'change-done';
// What a home tile was pressed for: after the customer is picked, that screen opens
type Intent = 'pay' | 'stop' | 'start' | 'extra' | null;

interface Me { id: string; name: string; can_collect: boolean; can_stop: boolean; lines: { region_id: number; name: string }[]; today: { amount: number; count: number } }
interface Card { customer_id: number; name: string; name_eng: string; region: string; region_id: number }
interface Customer extends Card {
  address: string; phones: string[]; balance: number;
  papers: { sno: number; publica_id: number; name: string; english?: string; how: string; hold: string }[];
  last_payment: { date: string; amount: number; receipt_no: string; by: string } | null;
  bill: { bill_id: number; month: string; month_hindi: string; year: string; amount: number } | null;
  receipt_book: { book: string; next: string } | null;
  can_collect: boolean;
}
interface Payment { amount: string; mode: 'cash' | 'upi'; receiptNo: string; requestId: string }
interface Saved { amount: number; receipt_no: string; recp_no: number; balance: number }
// A paper change waiting for its जाँच screen: stop (छुट्टी / हमेशा), start, or one day's extra copy
interface Change {
  kind: 'stop' | 'start' | 'extra';
  publica_id: number; paper: string;
  permanent: boolean; from: string; to: string; qty: number; reason: string;
}
interface Paper { publica_id: number; name: string; english: string }
const isoDay = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const showDate = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

const C = { navy: '#13315c', green: '#1a7340', orange: '#c2410c', red: '#9f1d1d', cream: '#f8f5ef', line: '#e7e1d6', ink: '#1f2328', grey: '#5f6670' };
const rupees = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const wa = (phone: string, text: string) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;

async function api<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'इंटरनेट नहीं चल रहा। फिर कोशिश करें।' } as any };
  }
}


// --- Language: Hindi (default) or English, chosen at the top right of the home page -----------
// Texts are written in Hindi; T() gives the English when English is chosen. Customer and paper
// names switch to their English names too. Messages sent to customers stay in Hindi.
let LANG: 'hi' | 'en' = 'hi';
const EN: Record<string, string> = {
  '"कब तक" की तारीख "कब से" के बाद की हो': '"Till" date must be after the "From" date',
  '4 अंकों का पिन': '4-digit PIN',
  'UPI / बैंक': 'UPI / Bank',
  'WhatsApp पर रसीद भेजें': 'Send receipt on WhatsApp',
  'अखबार': 'Paper',
  'अखबार की सूची नहीं आई': 'Could not load the paper list',
  'अखबार चालू': 'Start paper',
  'अखबार चालू करें': 'Start a paper',
  'अखबार चालू: ग्राहक चुनें': 'Start paper: pick customer',
  'अखबार चुनें': 'Choose a paper',
  'अखबार बंद': 'Stop paper',
  'अखबार बंद करें': 'Stop a paper',
  'अखबार बंद: ग्राहक चुनें': 'Stop paper: pick customer',
  'अगला ग्राहक': 'Next customer',
  'अतिरिक्त अखबार': 'Extra paper',
  'अतिरिक्त अखबार (एक दिन)': 'Extra paper (one day)',
  'अतिरिक्त अखबार: ग्राहक चुनें': 'Extra paper: pick customer',
  'आगे बढ़ें': 'Continue',
  'आगे: जाँचें': 'Next: Check',
  'आज मेरी जमा': 'My collection today',
  'आपका नाम': 'Your name',
  'आपने कहा': 'You said',
  'आर्यन न्यूज़ एजेंसी': 'Aryan News Agency',
  'इस फ़ोन में बोलकर काम नहीं चलता। Chrome में खोलें।': 'Voice does not work on this phone. Open in Chrome.',
  'इस फ़ोन में बोलकर खोजना नहीं चलता': 'Voice search does not work on this phone',
  'इस फ़ोन में बोलकर राशि नहीं डल सकती': 'Voice amount does not work on this phone',
  'इस फ़ोन में बोलकर लिखना नहीं चलता': 'Voice typing does not work on this phone',
  'इस महीने का': 'This month\'s',
  'एक दिन वाला': 'For one day',
  'एक नाम के कई ग्राहक हैं, आप चुनें': 'Several customers have this name, pick one',
  'एक पल…': 'One moment…',
  'एक बार जाँच लें': 'Check once',
  'एडमिन लॉगिन (यूज़र नेम / पासवर्ड)': 'Admin login (username / password)',
  'एडवांस': 'Advance',
  'कब तक': 'Till',
  'कब तक?': 'For how long?',
  'कब से': 'From',
  'कम': 'Less',
  'काम': 'Task',
  'काम:': 'Task:',
  'कारण': 'Reason',
  'कारण (बोलकर भी)': 'Reason (can speak too)',
  'कितनी कॉपी?': 'How many copies?',
  'किस दिन': 'Which day',
  'कुछ गड़बड़ हुई': 'Something went wrong',
  'कुछ दिन (छुट्टी)': 'Few days (holiday)',
  'कॉपी': 'Copies',
  'कोई अखबार चालू नहीं': 'No paper running',
  'कोई अखबार नहीं मिला': 'No paper found',
  'कोई ग्राहक नहीं मिला': 'No customer found',
  'कौन सा अखबार बंद करना है, चुनें': 'Choose which paper to stop',
  'कौन सा अखबार?': 'Which paper?',
  'खुल रहा है…': 'Opening…',
  'खोजें': 'Search',
  'खोलें': 'Open',
  'गलत यूज़र नेम या पासवर्ड': 'Wrong username or password',
  'ग्राहक': 'Customer',
  'ग्राहक खोजें': 'Find customer',
  'ग्राहक नहीं खुला': 'Could not open the customer',
  'ग्राहक पर वापस': 'Back to customer',
  'ग्राहक:': 'Customer:',
  'चालू अखबार': 'Running papers',
  'चुने दिन से रोज़ आएगा, जब तक बंद न करें।': 'Comes every day from the chosen date until stopped.',
  'छुट्टी (कुछ दिन बंद)': 'Holiday (stopped for a few days)',
  'छुट्टी या हमेशा': 'Holiday or for good',
  'जमा (एडवांस)': 'Advance',
  'जल्द आ रहा है': 'Coming soon',
  'ज़्यादा': 'More',
  'जैसे: बाहर जा रहे हैं': 'e.g. going out of town',
  'ढूँढ रहे हैं…': 'Searching…',
  'तरीका': 'Mode',
  'तारीख': 'Date',
  'तारीख भरें': 'Fill in the date',
  'नकद': 'Cash',
  'नया या और': 'New or more',
  'नहीं मिला, फिर बोलें': 'Not found, speak again',
  'नाम / नंबर': 'Name / number',
  'नाम चुनें और 4 अंकों का पिन डालें': 'Choose your name and enter the 4-digit PIN',
  'नाम नहीं आए': 'Could not load names',
  'नाम लिखें (हिंदी या English)': 'Type a name (Hindi or English)',
  'नाम, ग्राहक नं. या मोबाइल': 'Name, customer no. or mobile',
  'नीचे से चुनें': 'Pick from below',
  'पासवर्ड': 'Password',
  'पिन से लॉगिन': 'Login with PIN',
  'पीछे': 'Back',
  'पूरा बकाया': 'Full due',
  'पैसे जमा': 'Collect payment',
  'पैसे जमा करें': 'Collect payment',
  'पैसे जमा: ग्राहक चुनें': 'Collect: pick customer',
  'फ़ोन': 'Call',
  'फिर बोलें': 'Speak again',
  'फिर भी सेव करें?': 'Save anyway?',
  'बकाया': 'Due',
  'बकाया सूची': 'Due list',
  'बदलें': 'Change',
  'बाहर निकलें': 'Log out',
  'बिल भेजें': 'Send bill',
  'बोलकर काम करें': 'Work by voice',
  'बोलकर कारण': 'Speak the reason',
  'बोलकर खोजें': 'Search by voice',
  'बोलकर भी कर सकते हैं: “राम जी 350 जमा”': 'You can also speak: “Ram ji 350 jama”',
  'बोलकर राशि': 'Speak the amount',
  'बोलने के लिए दबाएँ': 'Tap to speak',
  'बोलें': 'Speak',
  'ब्यावर': 'Beawar',
  'मिटाएँ': 'Delete',
  'यह काम अगले अपडेट में आएगा। तब तक इसे कंप्यूटर पर करें।': 'This comes in the next update. Until then, do it on the computer.',
  'याद दिलाएँ': 'Remind',
  'यूज़र नेम': 'Username',
  'यूज़र नेम और पासवर्ड डालें': 'Enter username and password',
  'रसीद काटें': 'Cut a receipt',
  'रसीद नं.': 'Receipt no.',
  'रसीद नं. डालें': 'Enter the receipt no.',
  'राशि': 'Amount',
  'राशि डालें': 'Enter the amount',
  'राशि:': 'Amount:',
  'लाइन / हॉकर': 'Line / hawker',
  'लाइन के हिसाब से': 'Line wise',
  'लॉगिन नहीं हुआ': 'Login failed',
  'समझ नहीं आई': 'Not understood',
  'सही है, सेव करें': 'Correct, save',
  'सिर्फ़ एक दिन के लिए (जैसे किसी दिन एक और कॉपी)। अगले दिन से अपने-आप बंद।': 'For one day only (e.g. one more copy on a day). Stops by itself the next day.',
  'सुन रहे हैं…': 'Listening…',
  'सूची आ रही है…': 'Loading the list…',
  'सूची नहीं आई': 'Could not load the list',
  'सेव नहीं हुआ': 'Not saved',
  'सेव हो गया': 'Saved',
  'सेव हो रहा है…': 'Saving…',
  'सेव होने पर ग्राहक को WhatsApp पर रसीद जा सकती है।': 'After saving, the receipt can be sent to the customer on WhatsApp.',
  'हम समझे': 'We understood',
  'हमेशा के लिए': 'For good',
  'हमेशा के लिए बंद': 'Stopped for good',
  'हमेशा के लिए बंद करने पर यह अखबार इस तारीख से बिल में नहीं जुड़ेगा।': 'Once stopped for good, this paper is not billed from this date.',
  'होम': 'Home',
  'होम पर जाएँ': 'Go home',
  '— चुनें —': '— choose —',
  '— लाइन चुनें —': '— choose line —'
};
const T = (hi: string) => (LANG === 'en' ? EN[hi] ?? hi : hi);
const en = () => LANG === 'en';
const nm = (c: { name: string; name_eng?: string }) => (en() && c.name_eng ? c.name_eng : c.name);

// --- Voice --------------------------------------------------------------------------------
const NUM_WORDS: Record<string, number> = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
  पंद्रह: 15, बीस: 20, पच्चीस: 25, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90
};
// "350", "३५०" or "तीन सौ पचास" -> 350
function spokenAmount(text: string): number {
  const western = text.replace(/[०-९]/g, d => String('०१२३४५६७८९'.indexOf(d)));
  const digits = western.replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (digits) return Number(digits[digits.length - 1]);
  let total = 0, current = 0, seen = false;
  for (const w of western.split(/\s+/)) {
    if (NUM_WORDS[w] !== undefined) { current += NUM_WORDS[w]; seen = true; }
    else if (w === 'सौ') { current = (current || 1) * 100; seen = true; }
    else if (w === 'हजार' || w === 'हज़ार') { total += (current || 1) * 1000; current = 0; seen = true; }
  }
  return seen ? total + current : 0;
}
// "श्याम जी शर्मा, तीन सौ पचास जमा" -> name part "श्याम जी शर्मा"
function spokenName(text: string): string {
  return text.replace(/[०-९\d,.]+/g, ' ')
    .split(/\s+/)
    .filter(w => w && NUM_WORDS[w] === undefined && !['सौ', 'हजार', 'हज़ार', 'जमा', 'रुपये', 'रुपए', 'रूपये', 'का', 'के', 'की', 'ने', 'दिए', 'दिये'].includes(w))
    .join(' ').trim();
}
function listen(onText: (t: string) => void, onEnd: () => void): (() => void) | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'hi-IN';
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.onresult = (e: any) => onText(Array.from(e.results).map((x: any) => x[0].transcript).join(' '));
  r.onend = onEnd;
  r.onerror = onEnd;
  r.start();
  return () => { try { r.stop(); } catch { /* already stopped */ } };
}

// --- Small pieces -------------------------------------------------------------------------
function Icon({ name, size = 26, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  const p: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    rupee: <><path d="M6 4h12M6 9h12M6 4h3a5 5 0 0 1 0 10H6l9 7" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    stop: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
    paper: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    home: <path d="M4 11 12 4l8 7v9H4z" />,
    back: <path d="m15 5-7 7 7 7" />,
    phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
    chat: <path d="M4 20l1.5-4A8 8 0 1 1 9 19z" />,
    bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
    check: <path d="m5 12 5 5 9-10" />
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p[name]}</svg>;
}

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div style={{ background: C.navy }} className="sticky top-0 z-10 flex items-center gap-3 px-4 h-[68px] text-white">
      {onBack && <button onClick={onBack} aria-label={T('पीछे')} className="w-11 h-11 -ml-2 flex items-center justify-center"><Icon name="back" size={28} /></button>}
      <h1 className="text-[24px] font-bold">{title}</h1>
    </div>
  );
}

function BigButton({ children, onClick, color = C.green, outline = false, disabled = false }: { children: React.ReactNode; onClick?: () => void; color?: string; outline?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={outline ? { borderColor: color, color } : { background: color }}
      className={`w-full min-h-[64px] rounded-2xl text-[22px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${outline ? 'border-2 bg-white' : 'text-white'}`}>
      {children}
    </button>
  );
}

function Keypad({ onKey, extra }: { onKey: (k: string) => void; extra: string }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'मिटाएँ', '0', extra];
  return (
    <div className="grid grid-cols-3 gap-3 [.tablet_&]:max-w-[440px] [.tablet_&]:mx-auto">
      {keys.map(k => (
        <button key={k} onClick={() => onKey(k)}
          className={`min-h-[60px] rounded-2xl text-[28px] font-semibold ${k === 'मिटाएँ' ? 'text-[20px] text-[#5f6670]' : 'bg-white border'}`}
          style={k === 'मिटाएँ' ? undefined : { borderColor: C.line }}>
          {T(k)}
        </button>
      ))}
    </div>
  );
}

function BottomNav({ view, go }: { view: View; go: (v: View) => void }) {
  const items: [View, string, string][] = [['home', 'home', T('होम')], ['search', 'search', T('खोजें')], ['voice', 'mic', T('बोलें')], ['dues', 'list', T('बकाया')]];
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t grid grid-cols-4 h-[72px] z-20 [.tablet_&]:top-0 [.tablet_&]:right-auto [.tablet_&]:w-[112px] [.tablet_&]:h-auto [.tablet_&]:grid-cols-1 [.tablet_&]:auto-rows-[104px] [.tablet_&]:content-center [.tablet_&]:border-t-0 [.tablet_&]:border-r [.tablet_&]:shadow-sm" style={{ borderColor: C.line }}>
      {items.map(([v, icon, label]) => (
        <button key={v} onClick={() => go(v)} className="flex flex-col items-center justify-center gap-0.5" style={{ color: view === v ? C.navy : C.grey }}>
          <Icon name={icon} size={26} />
          <span className={`text-[16px] ${view === v ? 'font-bold' : ''}`}>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Notice({ text, error }: { text: string; error?: boolean }) {
  if (!text) return null;
  return <div className="rounded-xl px-4 py-3 text-[18px]" style={{ background: error ? '#fdeaea' : '#e8f1ea', color: error ? C.red : C.green }}>{text}</div>;
}

// --- The app ------------------------------------------------------------------------------
export default function MobileApp() {
  const [view, setView] = useState<View>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [payment, setPayment] = useState<Payment>({ amount: '', mode: 'cash', receiptNo: '', requestId: '' });
  const [saved, setSaved] = useState<Saved | null>(null);
  const [intent, setIntent] = useState<Intent>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [changeDone, setChangeDone] = useState<{ by: string; at: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>({ text: '' });
  const [busy, setBusy] = useState(false);
  const history = useRef<View[]>([]);
  const [lang, setLang] = useState<'hi' | 'en'>(() => { try { return localStorage.getItem('m_lang') === 'en' ? 'en' : 'hi'; } catch { return 'hi'; } });
  LANG = lang;
  const switchLang = (l: 'hi' | 'en') => { LANG = l; setLang(l); try { localStorage.setItem('m_lang', l); } catch { /* private mode */ } };

  const go = useCallback((next: View, remember = true) => {
    setMessage({ text: '' });
    setView(prev => { if (remember && prev !== next && prev !== 'loading') history.current.push(prev); return next; });
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback(() => { setMessage({ text: '' }); setView(history.current.pop() || 'home'); }, []);

  const loadMe = useCallback(async () => {
    const r = await api<Me>('/api/m/me');
    if (r.status === 401) { setView('login'); return; }
    if (r.ok) { setMe(r.data); setView(v => (v === 'loading' || v === 'login' ? 'home' : v)); }
    else { setMessage({ text: r.data.error || T('कुछ गड़बड़ हुई'), error: true }); setView('login'); }
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);

  // The phone's back button goes one screen back inside the app
  useEffect(() => {
    const onPop = () => { if (history.current.length) { back(); window.history.pushState(null, ''); } };
    window.history.pushState(null, '');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [back]);

  const openCustomer = useCallback(async (id: number, then: View = 'customer', amount?: number) => {
    setBusy(true);
    const r = await api<Customer>(`/api/m/customer?id=${id}`);
    setBusy(false);
    if (!r.ok) { setMessage({ text: r.data.error || T('ग्राहक नहीं खुला'), error: true }); return; }
    setCustomer(r.data);
    setPayment({ amount: amount ? String(amount) : '', mode: 'cash', receiptNo: r.data.receipt_book?.next || '', requestId: newId() });
    go(then);
  }, [go]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setMe(null); history.current = []; setView('login');
  };

  const shell = (body: React.ReactNode, nav = false) => (
    <div className="fixed inset-0 overflow-y-auto" style={{ background: C.cream, color: C.ink, fontFamily: "'Mukta', 'Noto Sans Devanagari', sans-serif", userSelect: 'text' }}>
      <div className={`max-w-[520px] [.tablet_&]:max-w-none min-h-full mx-auto ${nav ? 'pb-[92px] [.tablet_&]:pb-6 [.tablet_&]:pl-[112px]' : 'pb-6'}`}><div className="[.tablet_&]:max-w-[1040px] [.tablet_&]:mx-auto [.tablet_&]:px-4">{body}</div></div>
      {nav && <BottomNav view={view} go={v => (v === 'home' ? (history.current = [], setView('home')) : go(v))} />}
      {busy && <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/20"><div className="bg-white rounded-2xl px-6 py-4 text-[20px] font-semibold">{T('एक पल…')}</div></div>}
    </div>
  );

  if (view === 'loading') return shell(<div className="pt-40 text-center text-[22px]" style={{ color: C.grey }}>{T('खुल रहा है…')}</div>);
  if (view === 'login') return shell(<Login onDone={() => { history.current = []; loadMe(); }} />);
  if (!me) return shell(null);

  switch (view) {
    case 'home':
      return shell(<Home me={me} go={go} logout={logout} refresh={loadMe} lang={lang} setLang={switchLang} pick={i => { setIntent(i); go('search'); }} />, true);
    case 'search': {
      const titles: Record<string, string> = { pay: T('पैसे जमा: ग्राहक चुनें'), stop: T('अखबार बंद: ग्राहक चुनें'), start: T('अखबार चालू: ग्राहक चुनें'), extra: T('अतिरिक्त अखबार: ग्राहक चुनें') };
      return shell(<><Header title={(intent && titles[intent]) || T('ग्राहक खोजें')} onBack={() => { setIntent(null); back(); }} /><div className="p-4"><Notice {...message} />
        <Search onPick={c => { const then: View = intent || 'customer'; setIntent(null); setChange(null); openCustomer(c.customer_id, then); }} /></div></>, true);
    }
    case 'customer':
      return shell(customer && <CustomerPage c={customer} canStop={me.can_stop} back={back} go={v => { setChange(null); go(v); }} />);
    case 'stop':
      return shell(customer && <StopForm c={customer} initial={change?.kind === 'stop' ? change : null} back={() => { setChange(null); back(); }} next={ch => { setChange(ch); go('change-confirm'); }} />);
    case 'start':
    case 'extra':
      return shell(customer && <StartForm key={view} kind={view} c={customer} initial={change?.kind === view ? change : null} back={() => { setChange(null); back(); }} next={ch => { setChange(ch); go('change-confirm'); }} />);
    case 'change-confirm':
      return shell(customer && change && (
        <ChangeConfirm c={customer} ch={change} back={back} message={message}
          save={async () => {
            setBusy(true);
            const r = change.kind === 'stop'
              ? await api('/api/m/stop', { method: 'POST', body: JSON.stringify({ customer_id: customer.customer_id, publica_id: change.publica_id, kind: change.permanent ? 'permanent' : 'temporary', from: change.from, to: change.to, reason: change.reason }) })
              : await api('/api/m/start', { method: 'POST', body: JSON.stringify({ customer_id: customer.customer_id, publica_id: change.publica_id, qty: change.qty, date: change.from, kind: change.kind }) });
            setBusy(false);
            if (!r.ok) { setMessage({ text: r.data.error || T('सेव नहीं हुआ'), error: true }); return; }
            setChangeDone({ by: r.data.by, at: r.data.at });
            history.current = []; go('change-done', false);
          }} />
      ));
    case 'change-done':
      return shell(customer && change && changeDone && (
        <ChangeDone c={customer} ch={change} done={changeDone}
          toCustomer={() => { history.current = ['home']; openCustomer(customer.customer_id, 'customer'); }}
          home={() => { history.current = []; setView('home'); }} />
      ));
    case 'pay':
      return shell(customer && <Pay c={customer} payment={payment} setPayment={setPayment} back={back} next={() => go('confirm')} />);
    case 'confirm':
      return shell(customer && (
        <Confirm c={customer} payment={payment} back={back} message={message}
          save={async (outsideBook = false) => {
            setBusy(true);
            const r = await api<Saved & { outside_book?: boolean }>('/api/m/pay', {
              method: 'POST',
              body: JSON.stringify({ customer_id: customer.customer_id, amount: Number(payment.amount), mode: payment.mode, receipt_no: payment.receiptNo, request_id: payment.requestId, outside_book: outsideBook })
            });
            setBusy(false);
            if (r.ok) { setSaved(r.data); history.current = []; go('done', false); loadMe(); return; }
            if (r.data.outside_book && confirm(`${r.data.error}\n\n${T('फिर भी सेव करें?')}`)) return 'again';
            setMessage({ text: r.data.error || T('सेव नहीं हुआ'), error: true });
          }} />
      ));
    case 'done':
      return shell(customer && saved && <Done c={customer} saved={saved} next={() => { history.current = ['home']; setView('search'); }} home={() => { history.current = []; setView('home'); }} />);
    case 'dues':
      return shell(<Dues me={me} back={back} open={id => openCustomer(id)} />, true);
    case 'voice':
      return shell(<Voice back={back} onDo={(c, amount) => openCustomer(c.customer_id, 'confirm', amount)} />, true);
    case 'later':
      return shell(<><Header title={T('जल्द आ रहा है')} onBack={back} /><div className="p-6 text-[20px] leading-8">{T('यह काम अगले अपडेट में आएगा। तब तक इसे कंप्यूटर पर करें।')}</div></>, true);
  }
  return shell(null);
}

// --- Screens ------------------------------------------------------------------------------

function Login({ onDone }: { onDone: () => void }) {
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [who, setWho] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ staff: { id: string; name: string }[] }>('/api/m/staff').then(r => {
      if (!r.ok) { setError(r.data.error || T('नाम नहीं आए')); return; }
      setStaff(r.data.staff || []);
      let last = ''; try { last = localStorage.getItem('m_last_user') || ''; } catch { /* private mode */ }
      if (r.data.staff?.some(s => s.id === last)) setWho(last);
    });
  }, []);
  // The admin (or anyone with a website login) can open the app with username and password
  const [adminMode, setAdminMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const adminLogin = async () => {
    if (!username.trim() || !password) { setError(T('यूज़र नेम और पासवर्ड डालें')); return; }
    setBusy(true);
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) });
    setBusy(false);
    if (!r.ok) { setError(r.data.error === 'Invalid username or password' ? T('गलत यूज़र नेम या पासवर्ड') : (r.data.error || T('लॉगिन नहीं हुआ'))); setPassword(''); return; }
    onDone();
  };
  const submit = async () => {
    if (!who || pin.length !== 4) { setError(T('नाम चुनें और 4 अंकों का पिन डालें')); return; }
    setBusy(true);
    const r = await api('/api/m/login', { method: 'POST', body: JSON.stringify({ user_id: who, pin }) });
    setBusy(false);
    if (!r.ok) { setError(r.data.error || T('लॉगिन नहीं हुआ')); setPin(''); return; }
    try { localStorage.setItem('m_last_user', who); } catch { /* private mode */ }
    onDone();
  };
  return (
    <div className="px-6 pt-12">
      <div className="mx-auto w-[88px] h-[88px] rounded-[24px] flex items-center justify-center" style={{ background: C.navy }}><Icon name="paper" size={48} color="#fff" /></div>
      <h1 className="text-center text-[34px] font-extrabold mt-5" style={{ color: C.navy }}>{T('आर्यन न्यूज़ एजेंसी')}</h1>
      <p className="text-center text-[20px]" style={{ color: C.grey }}>{T('ब्यावर')}</p>
      {adminMode ? (
        <div className="mt-8 space-y-4">
          <label className="block">
            <span className="block text-[20px] font-bold mb-2">{T('यूज़र नेम')}</span>
            <input value={username} onChange={e => { setUsername(e.target.value); setError(''); }} autoCapitalize="none" autoComplete="username"
              className="w-full h-[64px] rounded-2xl border-2 bg-white px-4 text-[22px]" style={{ borderColor: C.navy }} />
          </label>
          <label className="block">
            <span className="block text-[20px] font-bold mb-2">{T('पासवर्ड')}</span>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} autoComplete="current-password"
              onKeyDown={e => { if (e.key === 'Enter') adminLogin(); }}
              className="w-full h-[64px] rounded-2xl border-2 bg-white px-4 text-[22px]" style={{ borderColor: C.navy }} />
          </label>
          {error && <Notice text={error} error />}
          <BigButton color={C.navy} onClick={adminLogin} disabled={busy}>{T('खोलें')}</BigButton>
          <button onClick={() => { setAdminMode(false); setError(''); }} className="w-full min-h-[54px] text-[19px] underline" style={{ color: C.grey }}>{T('पिन से लॉगिन')}</button>
        </div>
      ) : (<>
      <label className="block text-[20px] font-bold mt-8 mb-2">{T('आपका नाम')}</label>
      <select value={who} onChange={e => { setWho(e.target.value); setError(''); }} className="w-full h-[64px] rounded-2xl border-2 bg-white px-4 text-[22px]" style={{ borderColor: C.navy }}>
        <option value="">{T('— चुनें —')}</option>
        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <label className="block text-[20px] font-bold mt-6 mb-3">{T('4 अंकों का पिन')}</label>
      <div className="flex justify-center gap-4 mb-5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="w-[64px] h-[72px] rounded-2xl border-2 bg-white flex items-center justify-center text-[30px]" style={{ borderColor: i < pin.length ? C.navy : C.line }}>{i < pin.length ? '•' : ''}</div>
        ))}
      </div>
      {error && <div className="mb-4"><Notice text={error} error /></div>}
      <div className="grid grid-cols-3 gap-3 [.tablet_&]:max-w-[440px] [.tablet_&]:mx-auto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'मिटाएँ', '0', 'खोलें'].map(k => (
          <button key={k} disabled={busy}
            onClick={() => { setError(''); if (k === 'मिटाएँ') setPin(p => p.slice(0, -1)); else if (k === 'खोलें') submit(); else setPin(p => (p.length < 4 ? p + k : p)); }}
            className={`min-h-[64px] rounded-2xl text-[28px] font-semibold ${k === 'खोलें' ? 'text-white text-[24px] font-bold' : k === 'मिटाएँ' ? 'text-[20px]' : 'bg-white border'}`}
            style={k === 'खोलें' ? { background: C.navy } : k === 'मिटाएँ' ? { color: C.grey } : { borderColor: C.line }}>
            {T(k)}
          </button>
        ))}
      </div>
      <button onClick={() => { setAdminMode(true); setError(''); }} className="w-full min-h-[54px] mt-4 text-[18px] underline" style={{ color: C.grey }}>{T('एडमिन लॉगिन (यूज़र नेम / पासवर्ड)')}</button>
      </>)}
    </div>
  );
}

function Home({ me, go, logout, refresh, pick, lang, setLang }: { me: Me; go: (v: View) => void; logout: () => void; refresh: () => void; pick: (i: Intent) => void; lang: 'hi' | 'en'; setLang: (l: 'hi' | 'en') => void }) {
  useEffect(() => { refresh(); }, [refresh]);
  const tiles: { icon: string; color: string; title: string; sub: string; open: () => void; show: boolean }[] = [
    { icon: 'rupee', color: C.green, title: T('पैसे जमा'), sub: T('रसीद काटें'), open: () => pick('pay'), show: me.can_collect },
    { icon: 'search', color: C.navy, title: T('ग्राहक खोजें'), sub: T('नाम / नंबर'), open: () => pick(null), show: true },
    { icon: 'plus', color: C.navy, title: T('अखबार चालू'), sub: T('नया या और'), open: () => pick('start'), show: me.can_stop },
    { icon: 'stop', color: C.orange, title: T('अखबार बंद'), sub: T('छुट्टी या हमेशा'), open: () => pick('stop'), show: me.can_stop },
    { icon: 'list', color: C.navy, title: T('बकाया सूची'), sub: T('लाइन के हिसाब से'), open: () => go('dues'), show: true },
    { icon: 'paper', color: C.navy, title: T('अतिरिक्त अखबार'), sub: T('एक दिन वाला'), open: () => pick('extra'), show: me.can_stop }
  ];
  return (
    <>
      <div style={{ background: C.navy }} className="px-5 pt-6 pb-7 text-white">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[20px] opacity-90 min-w-0 truncate">{en() ? 'Hello' : 'नमस्ते'}, {me.name}</p>
          <div className="flex shrink-0 rounded-full bg-white/15 p-1" role="group" aria-label="Language / भाषा">
            {(['hi', 'en'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
                className="min-h-[40px] px-3.5 rounded-full text-[17px] font-bold"
                style={lang === l ? { background: '#fff', color: C.navy } : { color: '#fff' }}>
                {l === 'hi' ? 'हिंदी' : 'English'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end justify-between gap-3 mt-1">
          <h1 className="text-[32px] font-extrabold leading-tight">{T('आर्यन न्यूज़ एजेंसी')}</h1>
          <button onClick={logout} className="text-[16px] underline opacity-80 min-h-[44px] shrink-0">{T('बाहर निकलें')}</button>
        </div>
      </div>
      <div className="p-4">
        <div className="flex gap-3">
          <button onClick={() => pick(null)} className="flex-1 h-[64px] rounded-2xl border-2 bg-white flex items-center gap-3 px-4 text-left text-[19px]" style={{ borderColor: C.navy, color: C.grey }}>
            <Icon name="search" /> {T('नाम, ग्राहक नं. या मोबाइल')}
          </button>
          <button onClick={() => go('voice')} aria-label={T('बोलें')} className="w-[64px] h-[64px] rounded-full flex items-center justify-center" style={{ background: C.orange }}><Icon name="mic" color="#fff" /></button>
        </div>
        <p className="text-[16px] mt-2" style={{ color: C.grey }}>{T('बोलकर भी कर सकते हैं: “राम जी 350 जमा”')}</p>
        <div className="grid grid-cols-2 [.tablet_&]:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
          {tiles.filter(t => t.show).map(t => (
            <button key={t.title} onClick={t.open} className="rounded-2xl bg-white border p-4 text-left min-h-[150px]" style={{ borderColor: C.line }}>
              <span className="w-[56px] h-[56px] rounded-xl flex items-center justify-center" style={{ background: t.color }}><Icon name={t.icon} size={30} color="#fff" /></span>
              <span className="block text-[23px] font-bold mt-3 leading-tight">{t.title}</span>
              <span className="block text-[17px]" style={{ color: C.grey }}>{t.sub}</span>
            </button>
          ))}
        </div>
        <div className="rounded-2xl mt-4 px-5 py-4 flex items-center justify-between" style={{ background: '#e8f1ea' }}>
          <span className="text-[18px]">{T('आज मेरी जमा')}</span>
          <span className="text-[22px] font-bold" style={{ color: C.green }}>{rupees(me.today.amount)} · {me.today.count} {en() ? 'receipts' : 'रसीद'}</span>
        </div>
      </div>
    </>
  );
}

function Search({ onPick, initial = '' }: { onPick: (c: Card) => void; initial?: string }) {
  const [q, setQ] = useState(initial);
  const [list, setList] = useState<Card[]>([]);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setList([]); setState('idle'); return; }
    setState('busy');
    const t = setTimeout(async () => {
      const r = await api<{ customers: Card[] }>(`/api/m/search?q=${encodeURIComponent(q)}`);
      setList(r.data.customers || []); setState('done');
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const speak = () => {
    const stop = listen(t => setQ(spokenName(t) || t), () => setListening(false));
    if (stop) setListening(true); else alert(T('इस फ़ोन में बोलकर खोजना नहीं चलता'));
  };
  return (
    <>
      <div className="flex gap-3">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={T('नाम, ग्राहक नं. या मोबाइल')} inputMode="search"
          className="flex-1 min-w-0 h-[64px] rounded-2xl border-2 bg-white px-4 text-[21px] outline-none" style={{ borderColor: C.navy }} />
        <button onClick={speak} aria-label={T('बोलकर खोजें')} className="w-[64px] h-[64px] rounded-full flex items-center justify-center shrink-0" style={{ background: listening ? C.red : C.orange }}><Icon name="mic" color="#fff" /></button>
      </div>
      {listening && <p className="mt-2 text-[18px] font-semibold" style={{ color: C.orange }}>{T('सुन रहे हैं…')}</p>}
      <div className="mt-4 space-y-3 [.tablet_&]:space-y-0 [.tablet_&]:grid [.tablet_&]:grid-cols-2 [.tablet_&]:gap-3 [.tablet_&>p]:col-span-2">
        {state === 'busy' && <p className="text-[18px]" style={{ color: C.grey }}>{T('ढूँढ रहे हैं…')}</p>}
        {state === 'done' && list.length === 0 && <p className="text-[19px]" style={{ color: C.grey }}>{T('कोई ग्राहक नहीं मिला')}</p>}
        {list.map(c => (
          <button key={c.customer_id} onClick={() => onPick(c)} className="w-full rounded-2xl bg-white border px-4 py-3 text-left min-h-[72px]" style={{ borderColor: C.line }}>
            <span className="block text-[22px] font-bold leading-snug">{nm(c)} {c.region && <span className="text-[17px] font-semibold" style={{ color: C.navy }}>· {c.region}</span>}</span>
            <span className="block text-[16px]" style={{ color: C.grey }}>#{c.customer_id}{c.name_eng && c.name_eng !== c.name ? ` · ${en() ? c.name : c.name_eng}` : ''}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function BalanceBox({ balance }: { balance: number }) {
  const owes = balance > 1;
  const advance = balance < 0;
  return (
    <div className="rounded-2xl px-5 py-5 flex items-center justify-between" style={{ background: owes ? '#fdeaea' : '#e8f1ea' }}>
      <span className="text-[21px] font-bold">{advance ? T('जमा (एडवांस)') : T('बकाया')}</span>
      <span className="text-[32px] font-extrabold" style={{ color: owes ? C.red : C.green }}>{rupees(balance)}</span>
    </div>
  );
}

function CustomerPage({ c, canStop, back, go }: { c: Customer; canStop: boolean; back: () => void; go: (v: View) => void }) {
  const phone = c.phones[0];
  const billText = `नमस्ते ${c.name} जी,\nआर्यन न्यूज़ एजेंसी, ब्यावर\nग्राहक नं. ${c.customer_id}\n${c.balance > 1 ? `आपका बकाया ${rupees(c.balance)} है` : c.balance < 0 ? `आपके ${rupees(c.balance)} जमा (एडवांस) हैं` : 'आपका कोई बकाया नहीं है'}${c.bill ? ` (${c.bill.month_hindi} ${c.bill.year} तक का बिल)` : ''}।\nधन्यवाद।`;
  return (
    <>
      <Header title={T('ग्राहक')} onBack={back} />
      <div className="p-4 space-y-4 [.tablet_&]:space-y-0 [.tablet_&]:grid [.tablet_&]:grid-cols-2 [.tablet_&]:gap-5 [.tablet_&]:items-start">
        <div className="rounded-2xl bg-white border p-5 [.tablet_&]:col-start-1 [.tablet_&]:row-start-1" style={{ borderColor: C.line }}>
          <p className="text-[16px]" style={{ color: C.grey }}>{en() ? 'Customer no.' : 'ग्राहक नं.'} {c.customer_id}{c.region ? ` · ${en() ? 'Line' : 'लाइन'} ${c.region}` : ''}</p>
          <h2 className="text-[30px] font-extrabold leading-tight mt-1" style={{ color: C.navy }}>{nm(c)}</h2>
          {c.name_eng && c.name_eng !== c.name && <p className="text-[18px]" style={{ color: C.grey }}>{en() ? c.name : c.name_eng}</p>}
          {c.address && <p className="text-[19px] mt-2">{c.address}</p>}
          {phone && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <a href={`tel:${phone}`} className="min-h-[56px] rounded-xl text-white text-[20px] font-bold flex items-center justify-center gap-2" style={{ background: C.navy }}><Icon name="phone" size={22} /> {T('फ़ोन')}</a>
              <a href={wa(phone, '')} className="min-h-[56px] rounded-xl text-white text-[20px] font-bold flex items-center justify-center gap-2" style={{ background: C.green }}><Icon name="chat" size={22} /> WhatsApp</a>
            </div>
          )}
        </div>
        <div className="[.tablet_&]:col-start-2 [.tablet_&]:row-start-1"><BalanceBox balance={c.balance} /></div>
        <div className="rounded-2xl bg-white border px-5 py-4 [.tablet_&]:col-start-1 [.tablet_&]:row-start-2" style={{ borderColor: C.line }}>
          <p className="text-[20px] font-bold pb-2 border-b" style={{ borderColor: C.line }}>{T('चालू अखबार')}</p>
          {c.papers.length === 0 && <p className="py-3 text-[18px]" style={{ color: C.grey }}>{T('कोई अखबार चालू नहीं')}</p>}
          {c.papers.map(p => (
            <div key={`${p.sno}-${p.publica_id}`} className="flex justify-between gap-3 py-3 border-b last:border-0 text-[20px]" style={{ borderColor: C.line }}>
              <span>{en() && p.english ? p.english : p.name}{p.hold && <span className="block text-[15px]" style={{ color: C.orange }}>{en() ? p.hold.replace('छुट्टी', 'Holiday') : p.hold}</span>}</span>
              <span className="shrink-0" style={{ color: C.grey }}>{en() ? p.how.replace('रोज़', 'Daily').replace('हफ़्ते में', 'Weekly').replace('15 दिन में', 'Fortnightly').replace('3 महीने में', 'Quarterly').replace('महीने में', 'Monthly').replace('खास अंक', 'Special') : p.how}</span>
            </div>
          ))}
        </div>
        <div className="space-y-4 [.tablet_&]:col-start-2 [.tablet_&]:row-start-2">
        {c.last_payment && <p className="text-[17px]" style={{ color: C.grey }}>{en() ? 'Last payment' : 'आखिरी जमा'}: {c.last_payment.date} · {rupees(c.last_payment.amount)}{c.last_payment.receipt_no ? ` · ${en() ? 'Receipt' : 'रसीद'} ${c.last_payment.receipt_no}` : ''}</p>}
        {c.can_collect && <BigButton onClick={() => go('pay')}><Icon name="rupee" /> {T('पैसे जमा करें')}</BigButton>}
        {canStop && (
          <div className="grid grid-cols-2 gap-3">
            <BigButton outline color={C.orange} onClick={() => go('stop')} disabled={c.papers.length === 0}>{T('अखबार बंद')}</BigButton>
            <BigButton outline color={C.navy} onClick={() => go('start')}>{T('अखबार चालू')}</BigButton>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {canStop && <BigButton outline color={C.navy} onClick={() => go('extra')}>{T('अतिरिक्त अखबार')}</BigButton>}
          {phone
            ? <a href={wa(phone, billText)} className="w-full min-h-[64px] rounded-2xl text-[22px] font-bold flex items-center justify-center border-2 bg-white" style={{ borderColor: C.navy, color: C.navy }}>{T('बिल भेजें')}</a>
            : <BigButton outline color={C.navy} disabled>{T('बिल भेजें')}</BigButton>}
        </div>
        </div>
      </div>
    </>
  );
}

function Pay({ c, payment, setPayment, back, next }: { c: Customer; payment: Payment; setPayment: React.Dispatch<React.SetStateAction<Payment>>; back: () => void; next: () => void }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const set = (p: Partial<Payment>) => { setError(''); setPayment(x => ({ ...x, ...p })); };
  const key = (k: string) => {
    const a = payment.amount;
    if (k === 'मिटाएँ') set({ amount: a.slice(0, -1) });
    else if (a.length < 6) set({ amount: (a + k).replace(/^0+/, '') });
  };
  const speak = () => {
    const stop = listen(t => { const n = spokenAmount(t); if (n) set({ amount: String(Math.round(n)) }); }, () => setListening(false));
    if (stop) setListening(true); else alert(T('इस फ़ोन में बोलकर राशि नहीं डल सकती'));
  };
  const goNext = () => {
    if (!(Number(payment.amount) > 0)) { setError(T('राशि डालें')); return; }
    if (c.receipt_book && !payment.receiptNo.trim()) { setError(T('रसीद नं. डालें')); return; }
    next();
  };
  return (
    <>
      <Header title={T('पैसे जमा')} onBack={back} />
      <div className="p-4 space-y-3">
        <div className="rounded-2xl bg-white border px-5 py-4" style={{ borderColor: C.line }}>
          <p className="text-[23px] font-bold" style={{ color: C.navy }}>{nm(c)} · #{c.customer_id}</p>
          <p className="text-[17px]" style={{ color: C.grey }}>{c.balance > 1 ? `${T('बकाया')} ${rupees(c.balance)}` : c.balance < 0 ? `${T('एडवांस')} ${rupees(c.balance)}` : (en() ? 'No due' : 'कोई बकाया नहीं')}{c.bill ? (en() ? ` · billed till ${c.bill.month}` : ` · ${c.bill.month_hindi} तक का बिल`) : ''}</p>
        </div>
        <div className="rounded-2xl bg-white border-2 px-5 py-3 flex items-center gap-3" style={{ borderColor: C.green }}>
          <span className="text-[18px]" style={{ color: C.grey }}>{T('राशि')}</span>
          <span className="flex-1 text-center text-[44px] font-extrabold" style={{ color: C.green }}>₹{payment.amount || '0'}</span>
          <button onClick={speak} aria-label={T('बोलकर राशि')} className="w-[60px] h-[60px] rounded-full flex items-center justify-center" style={{ background: listening ? C.red : C.orange }}><Icon name="mic" color="#fff" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button disabled={!(c.balance > 1)} onClick={() => set({ amount: String(Math.round(c.balance)) })} className="min-h-[54px] rounded-full bg-white border text-[19px] font-bold disabled:opacity-40" style={{ borderColor: C.line }}>{T('पूरा बकाया')}</button>
          <button disabled={!(c.bill && c.bill.amount > 0 && c.balance > 1)} onClick={() => c.bill && set({ amount: String(Math.round(Math.min(c.bill.amount, c.balance))) })} className="min-h-[54px] rounded-full bg-white border text-[19px] font-bold disabled:opacity-40" style={{ borderColor: C.line }}>{T('इस महीने का')}</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['cash', 'upi'] as const).map(m => (
            <button key={m} onClick={() => set({ mode: m })} className="min-h-[56px] rounded-xl border-2 text-[20px] font-bold"
              style={payment.mode === m ? { background: C.navy, borderColor: C.navy, color: '#fff' } : { borderColor: C.navy, color: C.navy, background: '#fff' }}>
              {m === 'cash' ? T('नकद') : T('UPI / बैंक')}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[16px]" style={{ color: C.grey }}>{T('रसीद नं.')}{c.receipt_book ? ` (${en() ? 'book' : 'बुक'} ${c.receipt_book.book})` : ''}</span>
            <input value={payment.receiptNo} onChange={e => set({ receiptNo: e.target.value.replace(/\D/g, '').slice(0, 9) })} inputMode="numeric"
              className="w-full h-[56px] rounded-xl border bg-white px-3 text-[20px]" style={{ borderColor: C.line }} />
          </label>
          <label className="block">
            <span className="text-[16px]" style={{ color: C.grey }}>{T('तारीख')}</span>
            <div className="w-full h-[56px] rounded-xl border bg-white px-3 text-[20px] flex items-center" style={{ borderColor: C.line }}>{today()}</div>
          </label>
        </div>
        {error && <Notice text={error} error />}
        <Keypad onKey={key} extra="00" />
        <BigButton onClick={goNext}>{T('आगे: जाँचें')}</BigButton>
      </div>
    </>
  );
}

function Confirm({ c, payment, back, save, message }: { c: Customer; payment: Payment; back: () => void; save: (outsideBook?: boolean) => Promise<'again' | void>; message: { text: string; error?: boolean } }) {
  const amount = Number(payment.amount) || 0;
  const after = c.balance - amount;
  const [saving, setSaving] = useState(false);
  const run = async () => {
    if (saving) return;
    setSaving(true);
    const again = await save(false);
    if (again === 'again') await save(true);
    setSaving(false);
  };
  const rows: [string, React.ReactNode][] = [
    [T('ग्राहक'), `${nm(c)} · #${c.customer_id}`],
    [T('राशि'), <span key="a" className="text-[32px] font-extrabold" style={{ color: C.green }}>{rupees(amount)}</span>],
    [T('तरीका'), payment.mode === 'cash' ? T('नकद') : T('UPI / बैंक')],
    [T('रसीद नं.'), payment.receiptNo || '—'],
    [T('तारीख'), today()]
  ];
  return (
    <>
      <Header title={T('एक बार जाँच लें')} onBack={back} />
      <div className="p-4 space-y-4">
        <div className="rounded-2xl bg-white border px-5 py-2" style={{ borderColor: C.line }}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between items-center gap-4 py-3 text-[20px]"><span style={{ color: C.grey }}>{k}</span><span className="font-bold text-right">{v}</span></div>
          ))}
          <div className="flex justify-between items-center gap-4 py-4 border-t text-[20px]" style={{ borderColor: C.line }}>
            <span style={{ color: C.grey }}>इसके बाद {after < 0 ? T('एडवांस') : T('बकाया')}</span><span className="font-bold">{rupees(after)}</span>
          </div>
        </div>
        <p className="text-[17px]" style={{ color: C.grey }}>{T('सेव होने पर ग्राहक को WhatsApp पर रसीद जा सकती है।')}</p>
        <Notice {...message} />
        <div className="pt-6 space-y-3">
          <BigButton onClick={run} disabled={saving || amount <= 0}><Icon name="check" /> {saving ? T('सेव हो रहा है…') : T('सही है, सेव करें')}</BigButton>
          <BigButton outline color={C.navy} onClick={back} disabled={saving}>{T('बदलें')}</BigButton>
        </div>
      </div>
    </>
  );
}

function Done({ c, saved, next, home }: { c: Customer; saved: Saved; next: () => void; home: () => void }) {
  const phone = c.phones[0];
  const text = `आर्यन न्यूज़ एजेंसी, ब्यावर\nरसीद${saved.receipt_no ? ` नं. ${saved.receipt_no}` : ''} · ${today()}\nग्राहक: ${c.name} (#${c.customer_id})\nजमा राशि: ${rupees(saved.amount)}\n${saved.balance > 1 ? `बाकी बकाया: ${rupees(saved.balance)}` : saved.balance < 0 ? `एडवांस: ${rupees(saved.balance)}` : 'कोई बकाया नहीं'}\nधन्यवाद।`;
  return (
    <div className="px-5 pt-16 text-center">
      <div className="mx-auto w-[120px] h-[120px] rounded-full flex items-center justify-center" style={{ background: C.green }}><Icon name="check" size={64} color="#fff" /></div>
      <h2 className="text-[32px] font-extrabold mt-6" style={{ color: C.green }}>{rupees(saved.amount)} {en() ? 'collected' : 'जमा हो गए'}</h2>
      <p className="text-[21px] mt-3">{nm(c)}{saved.receipt_no ? ` · ${en() ? 'Receipt' : 'रसीद'} ${saved.receipt_no}` : ''}</p>
      <p className="text-[19px] mt-2" style={{ color: C.grey }}>अब {saved.balance < 0 ? T('एडवांस') : T('बकाया')} {rupees(saved.balance)}</p>
      <div className="mt-14 space-y-3">
        {phone && <a href={wa(phone, text)} className="w-full min-h-[64px] rounded-2xl text-white text-[22px] font-bold flex items-center justify-center gap-2" style={{ background: C.green }}><Icon name="chat" /> {T('WhatsApp पर रसीद भेजें')}</a>}
        <BigButton outline color={C.navy} onClick={next}>{T('अगला ग्राहक')}</BigButton>
        <button onClick={home} className="w-full min-h-[54px] text-[19px]" style={{ color: C.grey }}>{T('होम पर जाएँ')}</button>
      </div>
    </div>
  );
}

function Dues({ me, back, open }: { me: Me; back: () => void; open: (id: number) => void }) {
  const [region, setRegion] = useState<number>(() => { try { return Number(localStorage.getItem('m_due_line')) || 0; } catch { return 0; } });
  const [data, setData] = useState<{ count: number; total: number; customers: (Card & { balance: number; phones: string[] })[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!region) { setData(null); return; }
    if (!me.lines.some(l => l.region_id === region)) { setRegion(0); return; }
    try { localStorage.setItem('m_due_line', String(region)); } catch { /* private mode */ }
    setData(null); setError('');
    api(`/api/m/dues?region_id=${region}`).then(r => (r.ok ? setData(r.data) : setError(r.data.error || T('सूची नहीं आई'))));
  }, [region, me.lines]);
  return (
    <>
      <Header title={T('बकाया सूची')} onBack={back} />
      <div className="p-4">
        <label className="block text-[17px] mb-2" style={{ color: C.grey }}>{T('लाइन / हॉकर')}</label>
        <select value={region || ''} onChange={e => setRegion(Number(e.target.value))} className="w-full h-[60px] rounded-2xl border-2 bg-white px-4 text-[21px]" style={{ borderColor: C.navy }}>
          <option value="">{T('— लाइन चुनें —')}</option>
          {me.lines.map(l => <option key={l.region_id} value={l.region_id}>{l.name}</option>)}
        </select>
        {error && <div className="mt-3"><Notice text={error} error /></div>}
        {region > 0 && !data && !error && <p className="mt-4 text-[18px]" style={{ color: C.grey }}>{T('सूची आ रही है…')}</p>}
        {data && (
          <>
            <div className="flex justify-between mt-4 mb-3 text-[19px]"><span>{data.count} {en() ? 'customers' : 'ग्राहक'}</span><span className="font-bold" style={{ color: C.red }}>{en() ? 'Total' : 'कुल'} {rupees(data.total)}</span></div>
            <div className="space-y-3">
              {data.customers.map(c => (
                <div key={c.customer_id} className="rounded-2xl bg-white border px-4 py-3 flex items-center gap-3" style={{ borderColor: C.line }}>
                  <button onClick={() => open(c.customer_id)} className="flex-1 min-w-0 text-left min-h-[56px]">
                    <span className="block text-[21px] font-bold leading-snug">{nm(c)}</span>
                    <span className="block text-[16px]" style={{ color: C.grey }}>#{c.customer_id}</span>
                  </button>
                  <span className="text-[21px] font-bold shrink-0" style={{ color: C.red }}>{rupees(c.balance)}</span>
                  {c.phones[0] && <a href={`tel:${c.phones[0]}`} aria-label={T('फ़ोन')} className="w-[54px] h-[54px] rounded-xl flex items-center justify-center shrink-0" style={{ background: C.navy }}><Icon name="phone" size={22} color="#fff" /></a>}
                  {c.phones[0] && <a href={wa(c.phones[0], `नमस्ते ${c.name} जी,\nआर्यन न्यूज़ एजेंसी, ब्यावर\nआपका अखबार का बकाया ${rupees(c.balance)} है। कृपया जमा करा दें।\nधन्यवाद।`)} aria-label={T('याद दिलाएँ')} className="w-[54px] h-[54px] rounded-xl flex items-center justify-center shrink-0" style={{ background: C.green }}><Icon name="bell" size={22} color="#fff" /></a>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Voice({ back, onDo }: { back: () => void; onDo: (c: Card, amount: number) => void }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [matches, setMatches] = useState<Card[] | null>(null);
  const [picked, setPicked] = useState<Card | null>(null);
  const [error, setError] = useState('');
  const stopRef = useRef<(() => void) | null>(null);
  const amount = spokenAmount(text);
  const name = spokenName(text);

  const start = () => {
    setText(''); setMatches(null); setPicked(null); setError('');
    const stop = listen(t => setText(t), () => setListening(false));
    if (!stop) { setError(T('इस फ़ोन में बोलकर काम नहीं चलता। Chrome में खोलें।')); return; }
    stopRef.current = stop; setListening(true);
  };
  useEffect(() => { start(); return () => stopRef.current?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once speaking stops, find the customer by the name heard
  useEffect(() => {
    if (listening || !name) return;
    api<{ customers: Card[] }>(`/api/m/search?q=${encodeURIComponent(name)}`).then(r => {
      const list = r.data.customers || [];
      setMatches(list);
      if (list.length === 1) setPicked(list[0]);
    });
  }, [listening, name]);

  return (
    <>
      <Header title={T('बोलकर काम करें')} onBack={back} />
      <div className="p-5">
        <button onClick={listening ? () => stopRef.current?.() : start} aria-label={T('बोलें')} className="mx-auto mt-4 w-[176px] h-[176px] rounded-full flex items-center justify-center" style={{ background: '#fde5da' }}>
          <span className="w-[128px] h-[128px] rounded-full flex items-center justify-center" style={{ background: C.orange }}><Icon name="mic" size={56} color="#fff" /></span>
        </button>
        <p className="text-center text-[24px] font-bold mt-4" style={{ color: C.orange }}>{listening ? T('सुन रहे हैं…') : T('बोलने के लिए दबाएँ')}</p>
        {error && <div className="mt-4"><Notice text={error} error /></div>}
        {text && (
          <div className="rounded-2xl bg-white border px-5 py-4 mt-5" style={{ borderColor: C.line }}>
            <p className="text-[16px]" style={{ color: C.grey }}>{T('आपने कहा')}</p>
            <p className="text-[24px] font-bold">“{text}”</p>
          </div>
        )}
        {!listening && text && (
          <div className="rounded-2xl border-2 px-5 py-4 mt-4" style={{ borderColor: C.green, background: '#e8f1ea' }}>
            <p className="text-[16px]" style={{ color: C.grey }}>{T('हम समझे')}</p>
            <p className="text-[20px] mt-1"><b>{T('काम:')}</b> {T('पैसे जमा')}</p>
            <p className="text-[20px] mt-1"><b>{T('ग्राहक:')}</b> {picked ? `${nm(picked)} · #${picked.customer_id}${picked.region ? ` · ${picked.region}` : ''}` : matches && matches.length > 1 ? T('नीचे से चुनें') : matches ? T('नहीं मिला, फिर बोलें') : '…'}</p>
            <p className="text-[20px] mt-1"><b>{T('राशि:')}</b> {amount ? rupees(amount) : T('समझ नहीं आई')}</p>
          </div>
        )}
        {!listening && matches && matches.length > 1 && !picked && (
          <>
            <p className="text-[17px] text-center mt-3" style={{ color: C.grey }}>{T('एक नाम के कई ग्राहक हैं, आप चुनें')}</p>
            <div className="space-y-2 mt-2">
              {matches.slice(0, 8).map(m => (
                <button key={m.customer_id} onClick={() => setPicked(m)} className="w-full rounded-2xl bg-white border px-4 py-3 text-left min-h-[64px]" style={{ borderColor: C.line }}>
                  <span className="text-[20px] font-bold">{nm(m)}</span> <span className="text-[16px]" style={{ color: C.grey }}>#{m.customer_id}{m.region ? ` · ${m.region}` : ''}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3 mt-8">
          <BigButton outline color={C.navy} onClick={start}>{T('फिर बोलें')}</BigButton>
          <BigButton disabled={!picked || !amount} onClick={() => picked && onDo(picked, Math.round(amount))}>{T('आगे बढ़ें')}</BigButton>
        </div>
      </div>
    </>
  );
}

// --- Paper changes: अखबार बंद, अखबार चालू, अतिरिक्त अखबार -------------------------------------

function DateField({ label, value, onChange, min }: { label: string; value: string; onChange: (v: string) => void; min?: string }) {
  return (
    <label className="block">
      <span className="text-[17px]" style={{ color: C.grey }}>{label}</span>
      <input type="date" value={value} min={min} onChange={e => onChange(e.target.value)}
        className="w-full h-[60px] rounded-xl border bg-white px-3 text-[20px]" style={{ borderColor: C.line }} />
    </label>
  );
}

function StopForm({ c, initial, back, next }: { c: Customer; initial: Change | null; back: () => void; next: (ch: Change) => void }) {
  const [paperId, setPaperId] = useState<number>(initial?.publica_id || (c.papers.length === 1 ? c.papers[0].publica_id : 0));
  const [permanent, setPermanent] = useState(initial?.permanent || false);
  const [from, setFrom] = useState(initial?.from || isoDay(1));
  const [to, setTo] = useState(initial && !initial.permanent ? initial.to : isoDay(7));
  const [reason, setReason] = useState(initial?.reason || '');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const speak = () => {
    const stop = listen(t => setReason(t), () => setListening(false));
    if (stop) setListening(true); else alert(T('इस फ़ोन में बोलकर लिखना नहीं चलता'));
  };
  const goNext = () => {
    const paper = c.papers.find(p => p.publica_id === paperId);
    if (!paper) { setError(T('कौन सा अखबार बंद करना है, चुनें')); return; }
    if (!from || (!permanent && !to)) { setError(T('तारीख भरें')); return; }
    if (!permanent && to < from) { setError(T('"कब तक" की तारीख "कब से" के बाद की हो')); return; }
    next({ kind: 'stop', publica_id: paper.publica_id, paper: en() && paper.english ? paper.english : paper.name, permanent, from, to: permanent ? from : to, qty: 0, reason: reason.trim() });
  };
  return (
    <>
      <Header title={T('अखबार बंद करें')} onBack={back} />
      <div className="p-4 space-y-4">
        <p className="text-[23px] font-bold" style={{ color: C.navy }}>{nm(c)} · #{c.customer_id}</p>
        <div>
          <p className="text-[20px] font-bold mb-2">{T('कौन सा अखबार?')}</p>
          <div className="space-y-3">
            {c.papers.map(p => {
              const on = p.publica_id === paperId;
              return (
                <button key={`${p.sno}-${p.publica_id}`} onClick={() => { setPaperId(p.publica_id); setError(''); }}
                  className="w-full min-h-[64px] rounded-2xl border-2 px-4 text-left text-[22px] font-bold"
                  style={on ? { borderColor: C.orange, background: '#fde5da', color: '#7c2d12' } : { borderColor: C.line, background: '#fff' }}>
                  {on ? '✓ ' : ''}{en() && p.english ? p.english : p.name}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-[20px] font-bold mb-2">{T('कब तक?')}</p>
          <div className="grid grid-cols-2 gap-3">
            {[false, true].map(perm => (
              <button key={String(perm)} onClick={() => setPermanent(perm)} className="min-h-[60px] rounded-xl border-2 text-[20px] font-bold"
                style={permanent === perm ? { background: C.navy, borderColor: C.navy, color: '#fff' } : { borderColor: C.navy, color: C.navy, background: '#fff' }}>
                {perm ? T('हमेशा के लिए') : T('कुछ दिन (छुट्टी)')}
              </button>
            ))}
          </div>
        </div>
        <div className={permanent ? '' : 'grid grid-cols-2 gap-3'}>
          <DateField label={T('कब से')} value={from} onChange={v => { setFrom(v); setError(''); }} min={isoDay(0).slice(0, 8) + '01'} />
          {!permanent && <DateField label={T('कब तक')} value={to} onChange={v => { setTo(v); setError(''); }} min={from} />}
        </div>
        <label className="block">
          <span className="text-[17px]" style={{ color: C.grey }}>{T('कारण (बोलकर भी)')}</span>
          <div className="flex gap-3">
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder={T('जैसे: बाहर जा रहे हैं')}
              className="flex-1 min-w-0 h-[60px] rounded-xl border bg-white px-3 text-[20px]" style={{ borderColor: C.line }} />
            <button onClick={speak} aria-label={T('बोलकर कारण')} className="w-[60px] h-[60px] rounded-full flex items-center justify-center shrink-0" style={{ background: listening ? C.red : C.orange }}><Icon name="mic" color="#fff" /></button>
          </div>
        </label>
        {error && <Notice text={error} error />}
        <BigButton color={C.orange} onClick={goNext}>{T('आगे: जाँचें')}</BigButton>
      </div>
    </>
  );
}

let paperCache: Paper[] | null = null;

function StartForm({ kind, c, initial, back, next }: { kind: 'start' | 'extra'; c: Customer; initial: Change | null; back: () => void; next: (ch: Change) => void }) {
  const [papers, setPapers] = useState<Paper[]>(paperCache || []);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Paper | null>(initial ? { publica_id: initial.publica_id, name: initial.paper, english: '' } : null);
  const [qty, setQty] = useState(initial?.qty || 1);
  const [date, setDate] = useState(initial?.from || (kind === 'extra' ? isoDay(0) : isoDay(1)));
  const [error, setError] = useState('');
  useEffect(() => {
    if (paperCache) return;
    api<{ papers: Paper[] }>('/api/m/papers').then(r => {
      if (!r.ok) { setError(r.data.error || T('अखबार की सूची नहीं आई')); return; }
      paperCache = r.data.papers || []; setPapers(paperCache);
    });
  }, []);
  const needle = q.trim().toLowerCase();
  const shown = needle ? papers.filter(p => p.name.toLowerCase().includes(needle) || p.english.toLowerCase().includes(needle)).slice(0, 30) : [];
  const running = picked && c.papers.some(p => p.publica_id === picked.publica_id);
  const goNext = () => {
    if (!picked) { setError(T('अखबार चुनें')); return; }
    if (!date) { setError(T('तारीख भरें')); return; }
    next({ kind, publica_id: picked.publica_id, paper: en() && picked.english ? picked.english : picked.name, permanent: false, from: date, to: date, qty, reason: '' });
  };
  return (
    <>
      <Header title={kind === 'extra' ? T('अतिरिक्त अखबार') : T('अखबार चालू करें')} onBack={back} />
      <div className="p-4 space-y-4">
        <p className="text-[23px] font-bold" style={{ color: C.navy }}>{nm(c)} · #{c.customer_id}</p>
        <p className="text-[18px]" style={{ color: C.grey }}>{kind === 'extra' ? T('सिर्फ़ एक दिन के लिए (जैसे किसी दिन एक और कॉपी)। अगले दिन से अपने-आप बंद।') : T('चुने दिन से रोज़ आएगा, जब तक बंद न करें।')}</p>
        {picked ? (
          <div className="rounded-2xl border-2 px-4 py-3 flex items-center justify-between gap-3" style={{ borderColor: C.green, background: '#e8f1ea' }}>
            <span className="text-[22px] font-bold">✓ {en() && picked.english ? picked.english : picked.name}</span>
            <button onClick={() => { setPicked(null); setQ(''); }} className="text-[18px] underline min-h-[44px]" style={{ color: C.navy }}>{T('बदलें')}</button>
          </div>
        ) : (
          <div>
            <p className="text-[20px] font-bold mb-2">{T('कौन सा अखबार?')}</p>
            <input autoFocus value={q} onChange={e => { setQ(e.target.value); setError(''); }} placeholder={T('नाम लिखें (हिंदी या English)')}
              className="w-full h-[60px] rounded-2xl border-2 bg-white px-4 text-[20px]" style={{ borderColor: C.navy }} />
            <div className="mt-3 space-y-2 [.tablet_&]:space-y-0 [.tablet_&]:grid [.tablet_&]:grid-cols-2 [.tablet_&]:gap-2 [.tablet_&>p]:col-span-2">
              {needle && shown.length === 0 && <p className="text-[18px]" style={{ color: C.grey }}>{papers.length ? T('कोई अखबार नहीं मिला') : T('सूची आ रही है…')}</p>}
              {shown.map(p => (
                <button key={p.publica_id} onClick={() => { setPicked(p); setError(''); }} className="w-full min-h-[60px] rounded-2xl bg-white border px-4 text-left" style={{ borderColor: C.line }}>
                  <span className="text-[21px] font-bold">{en() ? p.english : p.name}</span>{!en() && p.english !== p.name && <span className="text-[16px] ml-2" style={{ color: C.grey }}>{p.english}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {running && kind === 'start' && <Notice text={en() ? 'This paper is already running for this customer. Adding it again brings one more copy.' : 'यह अखबार इस ग्राहक का पहले से चालू है। फिर भी जोड़ेंगे तो एक और कॉपी आएगी।'} error />}
        <div>
          <p className="text-[20px] font-bold mb-2">{T('कितनी कॉपी?')}</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setQty(n => Math.max(1, n - 1))} aria-label={T('कम')} className="w-[64px] h-[64px] rounded-2xl bg-white border text-[32px] font-bold" style={{ borderColor: C.line }}>−</button>
            <span className="text-[34px] font-extrabold w-[60px] text-center">{qty}</span>
            <button onClick={() => setQty(n => Math.min(50, n + 1))} aria-label={T('ज़्यादा')} className="w-[64px] h-[64px] rounded-2xl bg-white border text-[32px] font-bold" style={{ borderColor: C.line }}>+</button>
          </div>
        </div>
        <DateField label={kind === 'extra' ? T('किस दिन') : T('कब से')} value={date} onChange={v => { setDate(v); setError(''); }} min={isoDay(0).slice(0, 8) + '01'} />
        {error && <Notice text={error} error />}
        <BigButton onClick={goNext}>{T('आगे: जाँचें')}</BigButton>
      </div>
    </>
  );
}

const changeTitle = (ch: Change) => (ch.kind === 'stop' ? (ch.permanent ? T('हमेशा के लिए बंद') : T('छुट्टी (कुछ दिन बंद)')) : ch.kind === 'start' ? T('अखबार चालू') : T('अतिरिक्त अखबार (एक दिन)'));

function ChangeConfirm({ c, ch, back, save, message }: { c: Customer; ch: Change; back: () => void; save: () => Promise<void>; message: { text: string; error?: boolean } }) {
  const [saving, setSaving] = useState(false);
  const run = async () => { if (saving) return; setSaving(true); await save(); setSaving(false); };
  const rows: [string, string][] = [
    [T('ग्राहक'), `${nm(c)} · #${c.customer_id}`],
    [T('काम'), changeTitle(ch)],
    [T('अखबार'), ch.paper],
    ...(ch.kind === 'stop'
      ? (ch.permanent ? [[T('कब से'), showDate(ch.from)]] : [[T('कब से'), showDate(ch.from)], [T('कब तक'), showDate(ch.to)]]) as [string, string][]
      : [[T('कॉपी'), String(ch.qty)], [ch.kind === 'extra' ? T('किस दिन') : T('कब से'), showDate(ch.from)]] as [string, string][]),
    ...(ch.reason ? [[T('कारण'), ch.reason]] as [string, string][] : [])
  ];
  return (
    <>
      <Header title={T('एक बार जाँच लें')} onBack={back} />
      <div className="p-4 space-y-4">
        <div className="rounded-2xl bg-white border px-5 py-2" style={{ borderColor: C.line }}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between items-center gap-4 py-3 text-[20px]"><span style={{ color: C.grey }}>{k}</span><span className="font-bold text-right">{v}</span></div>
          ))}
        </div>
        {ch.kind === 'stop' && ch.permanent && <p className="text-[17px]" style={{ color: C.red }}>{T('हमेशा के लिए बंद करने पर यह अखबार इस तारीख से बिल में नहीं जुड़ेगा।')}</p>}
        <Notice {...message} />
        <div className="pt-6 space-y-3">
          <BigButton color={ch.kind === 'stop' ? C.orange : C.green} onClick={run} disabled={saving}><Icon name="check" /> {saving ? T('सेव हो रहा है…') : T('सही है, सेव करें')}</BigButton>
          <BigButton outline color={C.navy} onClick={back} disabled={saving}>{T('बदलें')}</BigButton>
        </div>
      </div>
    </>
  );
}

function ChangeDone({ c, ch, done, toCustomer, home }: { c: Customer; ch: Change; done: { by: string; at: string }; toCustomer: () => void; home: () => void }) {
  const at = new Date(done.at);
  const when = `${String(at.getDate()).padStart(2, '0')}/${String(at.getMonth() + 1).padStart(2, '0')}/${at.getFullYear()} ${at.toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' })}`;
  const what = ch.kind === 'stop'
    ? (ch.permanent
      ? (en() ? `${ch.paper} stopped for good from ${showDate(ch.from)}` : `${ch.paper} ${showDate(ch.from)} से हमेशा के लिए बंद`)
      : (en() ? `${ch.paper} stopped ${showDate(ch.from)} to ${showDate(ch.to)}` : `${ch.paper} ${showDate(ch.from)} से ${showDate(ch.to)} तक बंद`))
    : ch.kind === 'start'
      ? (en() ? `${ch.paper} (${ch.qty}) starts ${showDate(ch.from)}` : `${ch.paper} (${ch.qty}) ${showDate(ch.from)} से चालू`)
      : (en() ? `${ch.paper} (${ch.qty}) on ${showDate(ch.from)} only` : `${ch.paper} (${ch.qty}) ${showDate(ch.from)} को एक दिन`);
  return (
    <div className="px-5 pt-16 text-center">
      <div className="mx-auto w-[120px] h-[120px] rounded-full flex items-center justify-center" style={{ background: C.green }}><Icon name="check" size={64} color="#fff" /></div>
      <h2 className="text-[30px] font-extrabold mt-6" style={{ color: C.green }}>{T('सेव हो गया')}</h2>
      <p className="text-[21px] mt-3">{nm(c)} · #{c.customer_id}</p>
      <p className="text-[20px] mt-2 font-semibold">{what}</p>
      <p className="text-[17px] mt-3" style={{ color: C.grey }}>{done.by} · {when}</p>
      <div className="mt-14 space-y-3">
        <BigButton outline color={C.navy} onClick={toCustomer}>{T('ग्राहक पर वापस')}</BigButton>
        <button onClick={home} className="w-full min-h-[54px] text-[19px]" style={{ color: C.grey }}>{T('होम पर जाएँ')}</button>
      </div>
    </div>
  );
}
