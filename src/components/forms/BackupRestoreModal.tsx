'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, Upload, Database, RefreshCw, FileText } from 'lucide-react';
import { applyRestore, downloadBackup, downloadOldSoftwareFile, oldHistoryInfo, OldHistoryInfo, planRestore, readJson, RestorePlan, saveOldHistory } from '@/lib/backupClient';
import { validDatabaseName } from '@/lib/oldSoftwareExport';

interface BackupRestoreModalProps {
  mode: 'backup_master' | 'backup_yearly' | 'restore' | 'balance_forward';
  onClose: () => void;
}

type Tab = 'restore' | 'backup' | 'balance_forward';

// Plain names for the old software restore, which staff run without knowing the tables
const PLAIN_NAMES: [RegExp, string][] = [
  [/^customer_detail/, 'सब्सक्रिप्शन (Subscriptions)'],
  [/^customer/, 'ग्राहक (Customers)'],
  [/^hawker/, 'हॉकर (Hawkers)'],
  [/^publication$/, 'पेपर (Papers)'],
  [/^discontinue/, 'बंद पेपर (Stops)'],
  [/^holiday/, 'छुट्टियाँ (Holidays)'],
  [/^billdel/, 'डिलीवरी का हिसाब (Delivery details)'],
  [/^billno/, 'बिल (Bills)'],
  [/^receiptissue/, 'रसीद बुक (Receipt books)'],
  [/^receipt/, 'रसीदें (Receipts)'],
  [/^retailsale/, 'रिटेल सेल (Retail sales)'],
  [/^rate/, 'रेट बदलाव (Rate changes)']
];

const plainName = (table: string) => PLAIN_NAMES.find(([pattern]) => pattern.test(table))?.[1] || 'अन्य (Other)';

export default function BackupRestoreModal({ mode, onClose }: BackupRestoreModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(mode === 'balance_forward' ? 'balance_forward' : mode === 'restore' ? 'restore' : 'backup');
  const [includeOlderYears, setIncludeOlderYears] = useState(false);
  const [historyInfo, setHistoryInfo] = useState<OldHistoryInfo | null>(null);
  // Write the old software file for another database (e.g. test_check), to restore next to the live one
  const [forCheck, setForCheck] = useState(false);
  const [checkName, setCheckName] = useState('test_check');
  const refreshHistory = () => oldHistoryInfo().then(setHistoryInfo).catch(() => setHistoryInfo(null));

  useEffect(() => {
    refreshHistory();
  }, []);

  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  // The kept history is older than the last old software file restored here
  const historyStale = !!historyInfo?.restored_at && (historyInfo.missing || new Date(historyInfo.restored_at) > new Date(historyInfo.saved_at || 0));

  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: 'working' | 'done' | 'error' } | null>(null);
  // The message (working / done / error) is brought into view inside the box, which scrolls
  const bodyRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (status) statusRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [status]);

  const working = (text: string) => setStatus({ text, kind: 'working' });

  const run = async (task: () => Promise<string>) => {
    setIsProcessing(true);
    try {
      setStatus({ text: await task(), kind: 'done' });
    } catch (err: any) {
      setStatus({ text: `Stopped: ${err.message}`, kind: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBackup = () => run(async () => {
    const rows = await downloadBackup(includeOlderYears, working);
    return `Backup downloaded: ${rows.toLocaleString()} rows, checked against the database. Keep the file safe.`;
  });

  // The old software's rules, checked on every new or changed row in the file
  const ruleSummary = (rules: { rule: string; ok: boolean; detail?: string }[]) => {
    if (!rules.length) return 'नियम जाँच: इस फाइल में कोई नई या बदली लाइन नहीं।';
    const bad = rules.filter(r => !r.ok);
    return bad.length
      ? `❌ नियम जाँच: ${bad.length} नियम टूटे — यह फाइल अभी पुराने सॉफ्टवेयर में न डालें:\n${bad.map(r => `❌ ${r.rule} — ${r.detail}`).join('\n')}\n✓ बाकी ${rules.length - bad.length} नियम ठीक`
      : `✓ नियम जाँच: सभी ${rules.length} नियम ठीक (MAX+1 नंबर, महीनों के नाम, Hawk_Sub, बंद की तारीखें, मोबाइल...)`;
  };

  const handleOldSoftwareFile = () => run(async () => {
    const database = forCheck ? checkName.trim() : 'test';
    if (!validDatabaseName(database)) throw new Error('डाटाबेस के नाम में सिर्फ अंग्रेज़ी अक्षर, अंक और _ हो सकते हैं');
    if (historyStale && !confirm('पुराना इतिहास आखिरी रिस्टोर की फाइल से पुराना है। इस बैकअप में पुराने सॉफ्टवेयर की अपनी टेबल (purchase, area, mobile...) पुरानी आएँगी।\n\nफिर भी बैकअप बनाएँ?')) return 'कुछ नहीं बना।';
    const done = await downloadOldSoftwareFile(working, database);
    return `पुराने सॉफ्टवेयर की पूरी बैकअप फाइल बन गई: वेबसाइट से ${done.filled.length} टेबल (${done.rows.toLocaleString()} रिकॉर्ड), पुराने इतिहास से ${done.copied.length} टेबल, खाली ${done.empty.length} टेबल।${done.history ? '' : ' पुराना इतिहास वेबसाइट पर नहीं है, इसलिए पुराने साल खाली हैं।'}${database === 'test' ? ' पहले किसी दूसरे कंप्यूटर पर आज़माएँ।' : ` यह फाइल "${database}" डाटाबेस में जाएगी, असली "test" नहीं बदलेगा।`}${done.notes?.length ? `

जाँच (वेबसाइट के डाटा में देखें): ${done.notes.join(' | ')}` : ' डाटा की जाँच: सब ठीक।'}

${ruleSummary(done.rules || [])}`;
  });

  const handleSaveHistory = (file: File) => run(async () => {
    const meta = await saveOldHistory(file, working);
    setHistoryInfo(meta);
    return `पुराना इतिहास वेबसाइट पर रख लिया गया (${meta.name})। अब "पुराने सॉफ्टवेयर के लिए बैकअप" पूरी बनेगी, फाइल दोबारा नहीं माँगेगी।`;
  });

  const handleChooseFile = (file: File) => {
    setPlan(null);
    run(async () => {
      const result = await planRestore(file, working);
      setPlan(result);
      return result.kind === 'old'
        ? 'अभी कुछ नहीं बदला है। नीचे देखें, फिर रिस्टोर बटन दबाएँ।'
        : 'Nothing has been changed yet. Check the list below, then press Apply.';
    });
  };

  const toggle = (index: number, field: 'useAdd' | 'useChange' | 'useRemove') => {
    if (!plan) return;
    setPlan({ ...plan, items: plan.items.map((item, i) => (i === index ? { ...item, [field]: !item[field] } : item)) });
  };

  const handleApply = () => {
    if (!plan) return;
    const totals = plan.items.reduce(
      (sum, i) => ({
        add: sum.add + (i.useAdd ? i.add.length : 0),
        change: sum.change + (i.useChange ? i.change.length : 0),
        remove: sum.remove + (i.useRemove ? i.remove.length : 0)
      }),
      { add: 0, change: 0, remove: 0 }
    );
    const billFixes = plan.billFixes?.length || 0;
    if (totals.add + totals.change + totals.remove + billFixes === 0) {
      setStatus({ text: 'Nothing is selected, so there is nothing to do.', kind: 'done' });
      return;
    }
    const question = plan.kind === 'old'
      ? `${totals.add + totals.change + billFixes} रिकॉर्ड जोड़े या अपडेट किए जाएँगे। पहले एक सेफ्टी कॉपी डाउनलोड होगी। बाद में यही फाइल पुराने इतिहास के रूप में रखी जाएगी (कुछ मिनट)। आगे बढ़ें?`
      : `यह डाटाबेस बदलेगा (This changes the live database):\n\nAdd: ${totals.add}\nChange: ${totals.change}\nRemove: ${totals.remove}\n\nA safety copy downloads first. Continue?`;
    if (!confirm(question)) return;

    run(async () => {
      try {
        const { saved, problems } = await applyRestore(plan, working);
        setPlan(null);
        refreshHistory();
        if (problems.length > 0) throw new Error(`${saved} rows saved, but: ${problems.join('; ')}`);
        return `रिस्टोर पूरा हुआ (Restore finished): ${saved.toLocaleString()} रिकॉर्ड सेव और जाँचे गए।`;
      } catch (err: any) {
        throw new Error(`${err.message}. जो सेव हो गया वह सुरक्षित है। वही फाइल दोबारा चुनकर रिस्टोर पूरा करें, कुछ भी दो बार नहीं जुड़ेगा।`);
      }
    });
  };

  // Shows what will be carried first, so nothing changes until staff agree
  const handleBalanceForward = () => run(async () => {
    working('हिसाब देखा जा रहा है...');
    const ask = await fetch('/api/balance-forward').then(readJson);
    const total = Number(ask.total).toLocaleString('en-IN');
    if (!confirm(`${ask.from_label} का हिसाब बंद होकर ${ask.to_label} शुरू होगा।

${Number(ask.customers).toLocaleString('en-IN')} ग्राहकों का बकाया आगे जाएगा, कुल ₹${total}।

आगे बढ़ें?`)) {
      return 'कुछ नहीं बदला।';
    }
    working('बैलेंस फॉरवर्ड हो रहा है...');
    const done = await fetch('/api/balance-forward', { method: 'POST' }).then(readJson);
    const carried = `बैलेंस फॉरवर्ड पूरा हुआ: ${done.to_label} शुरू हो गया। ${Number(done.customers).toLocaleString('en-IN')} ग्राहकों का बकाया आगे गया, कुल ₹${Number(done.total).toLocaleString('en-IN')}।`;
    // Then the year before the one just closed goes out of the database into files, so it never fills
    try {
      return `${carried}
${await moveOldYear(Number(String(done.from_label).slice(0, 4)) - 1)}`;
    } catch (err: any) {
      return `${carried}
पुराना साल फ़ाइल में नहीं गया (${err.message || err}) — नीचे "पुराना साल फ़ाइल में भेजें" दबाकर फिर करें।`;
    }
  });

  // A closed year's bills and receipts: saved as files (backups still read them), checked, then
  // removed from the database. Only years at least two years old.
  const moveOldYear = async (start: number) => {
    const fy = `${start}${start + 1}`;
    const name = `${start}-${String(start + 1).slice(2)}`;
    let total = 0;
    for (const kind of ['bill', 'billno', 'billdel', 'receipt']) {
      working(`${name} का ${kind} फ़ाइल में सेव हो रहा है...`);
      const r = await fetch('/api/closed-years/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fy, table: `${kind}${fy}` }) }).then(readJson);
      total += Number(r.rows || 0);
    }
    working(`${name} फ़ाइलें जाँच कर डेटाबेस से हटाया जा रहा है...`);
    const removed = await fetch('/api/closed-years/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fy, remove: true }) }).then(readJson);
    const n = (removed.dropped || []).length;
    return n
      ? `${name} के ${total.toLocaleString('en-IN')} रिकॉर्ड फ़ाइल में सुरक्षित, डेटाबेस से हटे (जगह खाली हुई)। बैकअप में वे अब भी आते हैं।`
      : `${name} पहले ही फ़ाइल में है, डेटाबेस में कुछ हटाने को नहीं था।`;
  };

  // Button: move the year before last again (if it did not finish after Balance Forward)
  const handleMoveOldYear = () => run(async () => {
    const now = new Date();
    const running = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const start = running - 2;
    if (!confirm(`${start}-${String(start + 1).slice(2)} के बिल और रसीदें फ़ाइल में सेव होकर डेटाबेस से हट जाएँगी (बैकअप में फिर भी मिलेंगी)। आगे बढ़ें?`)) return 'कुछ नहीं बदला।';
    return moveOldYear(start);
  });

  const tabButton = (tab: Tab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => { setActiveTab(tab); setStatus(null); }}
      className={`px-3 py-1 text-xs font-bold border-t border-l border-r rounded-t-sm cursor-pointer flex items-center gap-1.5 ${
        activeTab === tab ? 'bg-white border-slate-500 border-b-white text-blue-900' : 'bg-[#ECE9D8] border-transparent text-slate-700 hover:bg-slate-200'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const hasTick = (count: number, checked: boolean, onChange: () => void, disabled = false) =>
    count === 0 ? (
      <span className="text-slate-400">0</span>
    ) : (
      <label className="flex items-center justify-end gap-1 cursor-pointer">
        <span className={disabled ? 'text-slate-400' : 'font-bold'}>{count.toLocaleString()}</span>
        <input type="checkbox" checked={checked} disabled={disabled || isProcessing} onChange={onChange} />
      </label>
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="d2-window w-full max-w-2xl max-h-[calc(100vh-2rem)] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-black border-b-black shadow-2xl p-2.5 flex flex-col font-tahoma text-black">
        <div className="d2-title vb-titlebar-xp select-none mb-2 shrink-0">
          <div className="flex items-center gap-1.5 font-bold">
            <Database className="w-4 h-4 text-white" />
            <span>Backup & Restore (डाटा बैकअप एवं रिस्टोर)</span>
          </div>
          <button onClick={onClose} disabled={isProcessing} className="vb-win-btn vb-win-btn-close">✕</button>
        </div>

        <div className="flex gap-1 border-b border-slate-400 pb-0.5 mb-2 px-1 shrink-0">
          {tabButton('backup', 'बैकअप (VB6 में भेजें)', <Download className="w-3.5 h-3.5 text-emerald-700" />)}
          {tabButton('restore', 'रिस्टोर (VB6 से लाएँ)', <Upload className="w-3.5 h-3.5 text-blue-700" />)}
          {tabButton('balance_forward', 'Balance Forward', <RefreshCw className="w-3.5 h-3.5 text-amber-700" />)}
        </div>

        <div ref={bodyRef} className="bg-white p-4 vb-box-inset text-xs space-y-3 min-h-[260px] flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'backup' && (
            <div className="space-y-3">
              {/* The everyday job: the website's work into the old software */}
              <div className="border-2 border-blue-700 rounded p-3 space-y-2">
                <div className="font-bold text-blue-900 text-[13px]">पुराने सॉफ्टवेयर (VB6) में भेजें</div>
                <ol className="space-y-1.5 text-[12px] text-slate-800">
                  <li className="flex gap-2">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center">1</span>
                    <span>
                      पहले VB6 का ताज़ा बैकअप <b>रिस्टोर</b> टैब से वेबसाइट में डालें।
                      {historyInfo && !historyInfo.missing && historyInfo.restored_at && <> आखिरी बार डाला: <b>{when(historyInfo.restored_at)}</b> ({historyInfo.restored_name})</>}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center">2</span>
                    <span>नीचे का नीला बटन दबाएँ और फाइल सेव करें। कुछ मिनट लगते हैं, खिड़की बंद न करें।</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center">3</span>
                    <span>बनी हुई <b>.sql</b> फाइल VB6 वाले कंप्यूटर पर MySQL Administrator → Restore से चलाएँ।</span>
                  </li>
                </ol>
                {historyInfo?.missing && (
                  <div className="text-[11px] font-bold text-red-700">पहले स्टेप 1 करें: वेबसाइट पर अभी VB6 का कोई बैकअप नहीं डाला गया है।</div>
                )}
                {historyStale && (
                  <div className="border border-red-400 bg-red-50 text-red-800 p-2 rounded text-[11px] font-bold">
                    चेतावनी: आखिरी रिस्टोर की फाइल ({historyInfo?.restored_name}) वेबसाइट पर पूरी नहीं रखी गई। रिस्टोर टैब में वही फाइल दोबारा रिस्टोर करें, फिर यह बैकअप बनाएँ।
                  </div>
                )}
                <button
                  onClick={handleOldSoftwareFile}
                  disabled={isProcessing}
                  className="w-full vb-btn bg-blue-700 hover:bg-blue-800 text-white font-bold py-2.5 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isProcessing ? 'बन रहा है...' : forCheck ? `VB6 के लिए बैकअप बनाएँ (जाँच: ${checkName.trim()})` : 'VB6 के लिए बैकअप बनाएँ'}</span>
                </button>
                <details className="text-[11px] text-slate-600">
                  <summary className="cursor-pointer select-none">और विकल्प</summary>
                  <div className="pt-1.5 pl-3 space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={forCheck} disabled={isProcessing} onChange={e => setForCheck(e.target.checked)} />
                      <span>जाँच के लिए अलग डाटाबेस में बनाएँ (असली "test" नहीं बदलेगा)</span>
                    </label>
                    {forCheck && (
                      <div className="flex items-center gap-2 pl-5">
                        <span>डाटाबेस का नाम:</span>
                        <input value={checkName} disabled={isProcessing} onChange={e => setCheckName(e.target.value)} className="border border-slate-400 px-1.5 py-0.5 w-40 font-mono" />
                        {!validDatabaseName(checkName.trim()) && <span className="text-red-700">सिर्फ अंग्रेज़ी अक्षर, अंक और _</span>}
                      </div>
                    )}
                    <div>
                      फाइल में वेबसाइट का डाटा होता है, और जो वेबसाइट पर नहीं है (पुराने साल, VB6 की अपनी टेबल) वह आखिरी रिस्टोर की फाइल से आता है।
                      {historyInfo && !historyInfo.missing && <> अभी रखी फाइल: <b>{historyInfo.name}</b> ({when(historyInfo.saved_at)})।</>}
                    </div>
                  </div>
                </details>
              </div>

              {/* The website's own safety copy */}
              <div className="border border-slate-300 rounded p-3 space-y-2">
                <div className="font-bold text-emerald-800 text-[13px]">वेबसाइट की सेफ्टी कॉपी</div>
                <p className="text-[11px] text-slate-600">
                  सिर्फ इसी वेबसाइट में वापस डालने के लिए (VB6 में नहीं चलती)। हफ्ते में एक बार लेकर सुरक्षित रखें।
                </p>
                <button
                  onClick={handleBackup}
                  disabled={isProcessing}
                  className="w-full vb-btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isProcessing ? 'बन रहा है...' : 'सेफ्टी कॉपी डाउनलोड करें'}</span>
                </button>
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600">
                  <input type="checkbox" checked={includeOlderYears} disabled={isProcessing} onChange={e => setIncludeOlderYears(e.target.checked)} />
                  <span>पुराने सालों के बिल भी (ज़्यादा समय लगता है)</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'restore' && (
            <div className="space-y-3">
              <div className="font-bold text-blue-900 text-[13px]">VB6 का डाटा वेबसाइट में लाएँ</div>
              <ol className="space-y-1.5 text-[12px] text-slate-800">
                {[
                  <>VB6 में बैकअप लें (MySQL Administrator → Backup)। फाइल का नाम जैसे <b>New Project 20261117 1846.sql</b></>,
                  <>नीचे <b>फाइल चुनें</b> दबाकर वह फाइल चुनें। इससे अभी कुछ नहीं बदलता, सिर्फ लिस्ट दिखती है।</>,
                  <>लिस्ट देखें, फिर <b>रिस्टोर करें</b> दबाएँ। पहले एक सेफ्टी कॉपी अपने आप डाउनलोड होगी। "रिस्टोर पूरा हुआ" आने तक खिड़की बंद न करें।</>
                ].map((text, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center">{i + 1}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>

              <div className="border-2 border-dashed border-slate-300 rounded p-3 text-center bg-slate-50">
                <input
                  type="file"
                  id="restore-file"
                  className="hidden"
                  disabled={isProcessing}
                  onChange={e => {
                    if (e.target.files?.[0]) handleChooseFile(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
                <label htmlFor="restore-file" className="cursor-pointer flex flex-col items-center gap-1">
                  <FileText className="w-7 h-7 text-blue-600" />
                  <span className="font-bold text-blue-900">फाइल चुनें (Choose a backup .gz, or an old software .sql)</span>
                </label>
              </div>

              {plan?.kind === 'old' && (() => {
                const coming = plan.items.filter(i => (i.useAdd && i.add.length > 0) || (i.useChange && i.change.length > 0) || (i.useRemove && i.remove.length > 0));
                const billFixes = plan.billFixes?.length || 0;
                return (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-700">
                      वेबसाइट इस बैकअप जैसी कर दी जाएगी (पुराना सॉफ्टवेयर मुख्य है)। जो पहले से है वह दोबारा नहीं जुड़ेगा। ग्राहकों का बैलेंस (Cbal) फाइल जैसा ही रहेगा। वेबसाइट पर बनी नई एंट्री बनी रहेंगी।
                    </p>
                    {coming.length === 0 && billFixes === 0 ? (
                      <div className="p-2 border rounded bg-emerald-50 text-emerald-900 font-bold text-[11px]">सब कुछ पहले से मौजूद है। कुछ करने की ज़रूरत नहीं।</div>
                    ) : (
                      <>
                        <div className="border divide-y max-h-48 overflow-y-auto">
                          {coming.map(i => (
                            <div key={i.table.name} className="flex justify-between p-1.5 text-[11px]">
                              <span>{plainName(i.table.name)}</span>
                              <span className="font-bold">
                                {i.useAdd && i.add.length > 0 && `${i.add.length.toLocaleString()} नए`}
                                {i.useAdd && i.add.length > 0 && i.useChange && i.change.length > 0 && ', '}
                                {i.useChange && i.change.length > 0 && `${i.change.length.toLocaleString()} अपडेट`}
                                {i.useRemove && i.remove.length > 0 && `, ${i.remove.length.toLocaleString()} डुप्लिकेट हटेगी (वही भुगतान फाइल में है)`}
                              </span>
                            </div>
                          ))}
                          {billFixes > 0 && (
                            <div className="flex justify-between p-1.5 text-[11px]">
                              <span>बिल सुधार (Bill corrections)</span>
                              <span className="font-bold">{billFixes.toLocaleString()} अपडेट</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={handleApply}
                          disabled={isProcessing}
                          className="w-full vb-btn bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <Upload className="w-4 h-4" />
                          <span>{isProcessing ? 'Working...' : 'रिस्टोर करें (Restore)'}</span>
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}

              {plan?.kind === 'backup' && (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-700">
                    {`Backup from ${new Date(plan.takenAt || '').toLocaleString('en-IN')}. Applying makes these tables match the file exactly.`}
                  </div>
                  <div className="max-h-60 overflow-y-auto border">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="text-left p-1">Table</th>
                          <th className="text-right p-1">Same</th>
                          <th className="text-right p-1">Add</th>
                          <th className="text-right p-1">Change</th>
                          <th className="text-right p-1">Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.items.map((item, i) => (
                          <tr key={item.table.name} className="border-t">
                            <td className="p-1 font-mono">
                              {item.table.name}
                              {item.skipped > 0 && (
                                <span className="block font-sans text-[10px] text-slate-500">{item.skipped} skipped: already here</span>
                              )}
                            </td>
                            <td className="p-1 text-right">{item.same.toLocaleString()}</td>
                            <td className="p-1 text-right">{hasTick(item.add.length, item.useAdd, () => toggle(i, 'useAdd'))}</td>
                            <td className="p-1 text-right">{hasTick(item.change.length, item.useChange, () => toggle(i, 'useChange'))}</td>
                            <td className="p-1 text-right">{hasTick(item.remove.length, item.useRemove, () => toggle(i, 'useRemove'))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={handleApply}
                    disabled={isProcessing}
                    className="w-full vb-btn bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{isProcessing ? 'Working...' : 'Apply Ticked Changes (लागू करें)'}</span>
                  </button>
                </div>
              )}
              <details className="text-[11px] text-slate-600">
                <summary className="cursor-pointer select-none">और विकल्प</summary>
                <div className="pt-1.5">
                <div className="border border-blue-300 bg-blue-50 p-2 rounded text-[11px] space-y-1.5">
                  <div className="font-bold text-blue-900">पुराना इतिहास वेबसाइट पर रखें</div>
                  <div className="text-slate-700">
                    पुराने सॉफ्टवेयर की पूरी बैकअप फाइल (जैसे New Project 20261104 1222.sql) चुनें। इससे पुराने बंद साल और पुराने सॉफ्टवेयर की अपनी टेबल वेबसाइट पर रख ली जाती हैं, ताकि "पुराने सॉफ्टवेयर के लिए बैकअप" पूरी बने। वेबसाइट का कोई डाटा नहीं बदलता। नीचे से पुराने सॉफ्टवेयर की फाइल रिस्टोर करने पर यह अपने आप भी हो जाता है।
                    {historyInfo && !historyInfo.missing && <> अभी रखा है: <b>{historyInfo.name}</b> ({when(historyInfo.saved_at)})।</>}
                  </div>
                  <input type="file" disabled={isProcessing} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleSaveHistory(f); }} className="text-[11px]" />
                </div>
                </div>
              </details>
            </div>
          )}

          {activeTab === 'balance_forward' && (
            <div className="space-y-2 text-slate-700 leading-relaxed">
              <p className="font-bold text-amber-900">Financial Year Balance Forward (बैलेंस फॉरवर्ड)</p>
              <p>
                साल में एक बार, मार्च के बिल बनने के बाद। हर ग्राहक का बचा हुआ बकाया नए साल में चला जाता है और नए साल की सारी टेबल अपने आप बन जाती हैं। पहले कुल रकम दिखेगी, आपके हाँ कहने पर ही कुछ बदलेगा।
              </p>
              <button
                onClick={handleBalanceForward}
                disabled={isProcessing}
                className="vb-btn bg-amber-100 hover:bg-amber-200 px-4 py-1.5 text-xs font-bold cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isProcessing ? 'Working...' : 'बैलेंस फॉरवर्ड करें'}</span>
              </button>
              <p className="pt-1">
                बैलेंस फॉरवर्ड के बाद उससे पहले का साल अपने आप फ़ाइल में चला जाता है, ताकि फ्री डेटाबेस कभी न भरे। अगर वह बीच में रुक जाए तो यह दबाएँ:
              </p>
              <button
                onClick={handleMoveOldYear}
                disabled={isProcessing}
                className="vb-btn bg-slate-100 hover:bg-slate-200 px-3 py-1 text-xs font-bold cursor-pointer"
              >
                पुराना साल फ़ाइल में भेजें
              </button>
            </div>
          )}

          {status && (
            <div ref={statusRef} className={`p-2 border font-bold text-[11px] rounded whitespace-pre-line break-words ${
              status.kind === 'done' ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                : status.kind === 'error' ? 'bg-red-100 text-red-900 border-red-400'
                : 'bg-blue-100 text-blue-900 border-blue-400 animate-pulse'
            }`}>
              {status.text}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2.5 px-1 shrink-0">
          <div className="text-[10px] text-slate-500">Aryan News Agency • Database Management Utility</div>
          <button onClick={onClose} disabled={isProcessing} className="vb-btn bg-white hover:bg-slate-100 px-5 py-1 text-xs font-bold cursor-pointer">
            Close (बंद करें)
          </button>
        </div>
      </div>
    </div>
  );
}
