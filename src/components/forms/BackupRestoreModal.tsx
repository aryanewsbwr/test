'use client';

import React, { useState } from 'react';
import { Download, Upload, Database, RefreshCw, FileText, ShieldCheck } from 'lucide-react';
import { applyRestore, downloadBackup, downloadOldSoftwareFile, planRestore, readJson, RestorePlan } from '@/lib/backupClient';

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
  const [oldBase, setOldBase] = useState<File | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: 'working' | 'done' | 'error' } | null>(null);

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

  const handleOldSoftwareFile = () => {
    if (!oldBase) {
      setStatus({ text: 'पहले पुराने सॉफ्टवेयर की आखिरी पूरी बैकअप फाइल चुनें।', kind: 'error' });
      return;
    }
    run(async () => {
      const done = await downloadOldSoftwareFile(oldBase, working);
      return `पूरी बैकअप फाइल बन गई: वेबसाइट की ${done.replaced.length + done.added.length} टेबल (${done.rows.toLocaleString()} रिकॉर्ड) नई, बाकी ${done.copied} टेबल पुरानी फाइल से वैसी ही। पहले किसी दूसरे कंप्यूटर पर आज़माएँ।`;
    });
  };

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
      ? `${totals.add + totals.change + billFixes} रिकॉर्ड जोड़े या अपडेट किए जाएँगे। पहले एक सेफ्टी कॉपी डाउनलोड होगी। आगे बढ़ें?`
      : `यह डाटाबेस बदलेगा (This changes the live database):\n\nAdd: ${totals.add}\nChange: ${totals.change}\nRemove: ${totals.remove}\n\nA safety copy downloads first. Continue?`;
    if (!confirm(question)) return;

    run(async () => {
      try {
        const { saved, problems } = await applyRestore(plan, working);
        setPlan(null);
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
    return `बैलेंस फॉरवर्ड पूरा हुआ: ${done.to_label} शुरू हो गया। ${Number(done.customers).toLocaleString('en-IN')} ग्राहकों का बकाया आगे गया, कुल ₹${Number(done.total).toLocaleString('en-IN')}।`;
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
      <div className="d2-window w-full max-w-2xl bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-black border-b-black shadow-2xl p-2.5 flex flex-col font-tahoma text-black">
        <div className="d2-title vb-titlebar-xp select-none mb-2">
          <div className="flex items-center gap-1.5 font-bold">
            <Database className="w-4 h-4 text-white" />
            <span>Backup & Restore (डाटा बैकअप एवं रिस्टोर)</span>
          </div>
          <button onClick={onClose} disabled={isProcessing} className="vb-win-btn vb-win-btn-close">✕</button>
        </div>

        <div className="flex gap-1 border-b border-slate-400 pb-0.5 mb-2 px-1">
          {tabButton('backup', 'बैकअप (Backup)', <Download className="w-3.5 h-3.5 text-emerald-700" />)}
          {tabButton('restore', 'रिस्टोर (Restore)', <Upload className="w-3.5 h-3.5 text-blue-700" />)}
          {tabButton('balance_forward', 'Balance Forward', <RefreshCw className="w-3.5 h-3.5 text-amber-700" />)}
        </div>

        <div className="bg-white p-4 vb-box-inset text-xs space-y-3 min-h-[260px]">
          {activeTab === 'backup' && (
            <div className="space-y-3">
              <p className="text-slate-700 leading-relaxed">
                यह लाइव डाटाबेस का बैकअप लेता है: ग्राहक, सब्सक्रिप्शन, पेपर, दरें, हॉकर, बिल, रसीदें और रिटेल सेल। हर टेबल की गिनती जाँची जाती है।
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeOlderYears} disabled={isProcessing} onChange={e => setIncludeOlderYears(e.target.checked)} />
                <span>पुराने सालों के बिल भी शामिल करें (All older years, takes several minutes)</span>
              </label>
              <button
                onClick={handleBackup}
                disabled={isProcessing}
                className="w-full vb-btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{isProcessing ? 'Working...' : 'Download Backup (बैकअप डाउनलोड करें)'}</span>
              </button>
              <p className="text-[10px] text-slate-500">
                This file restores into this software only, not into the old software. Login accounts are not included.
              </p>
              <div className="border-t border-slate-300 pt-3 space-y-2">
                <div className="font-bold text-blue-900">पुराने सॉफ्टवेयर के लिए पूरी बैकअप (Complete backup for old software)</div>
                <label className="block">
                  <span className="block mb-1">1. पुराने सॉफ्टवेयर की आखिरी पूरी बैकअप फाइल चुनें (जैसे 01112026):</span>
                  <input type="file" disabled={isProcessing} onChange={e => setOldBase(e.target.files?.[0] || null)} className="text-[11px]" />
                </label>
                <span className="block">2. बटन दबाएँ, फिर नई फाइल सेव करने की जगह चुनें:</span>
                <button
                  onClick={handleOldSoftwareFile}
                  disabled={isProcessing}
                  className="w-full vb-btn bg-white hover:bg-slate-50 text-blue-900 border border-blue-800 font-bold py-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isProcessing ? 'Working...' : 'पूरी बैकअप फाइल बनाएँ (Make complete backup .sql)'}</span>
                </button>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  नई फाइल में पुरानी फाइल की हर टेबल, view और function वैसे ही रहते हैं (पुराने साल भी)। सिर्फ ग्राहक, सब्सक्रिप्शन, पेपर, दरें, हॉकर और इस साल के बिल, रसीदें वगैरह वेबसाइट से आते हैं। ग्राहक का inactive निशान और हॉकर का region पुरानी फाइल जैसा रहता है। पुराने सॉफ्टवेयर के Restore से चलाएँ।
                </p>
              </div>
            </div>
          )}

          {activeTab === 'restore' && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-300 p-2 rounded text-[11px] text-amber-950 flex items-start gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                <span>फाइल चुनने से कुछ नहीं बदलता। पहले अंतर दिखेगा, फिर आप तय करेंगे। बदलने से पहले सेफ्टी कॉपी अपने आप डाउनलोड होगी।</span>
              </div>

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
                const coming = plan.items.filter(i => (i.useAdd && i.add.length > 0) || (i.useChange && i.change.length > 0));
                const billFixes = plan.billFixes?.length || 0;
                return (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-700">
                      वेबसाइट इस बैकअप जैसी कर दी जाएगी। जो पहले से है वह दोबारा नहीं जुड़ेगा। ग्राहकों का बैलेंस आखिर में बिल और रसीदों से जाँचा जाएगा।
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
            </div>
          )}

          {status && (
            <div className={`p-2 border font-bold text-[11px] rounded ${
              status.kind === 'done' ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                : status.kind === 'error' ? 'bg-red-100 text-red-900 border-red-400'
                : 'bg-blue-100 text-blue-900 border-blue-400 animate-pulse'
            }`}>
              {status.text}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2.5 px-1">
          <div className="text-[10px] text-slate-500">Aryan News Agency • Database Management Utility</div>
          <button onClick={onClose} disabled={isProcessing} className="vb-btn bg-white hover:bg-slate-100 px-5 py-1 text-xs font-bold cursor-pointer">
            Close (बंद करें)
          </button>
        </div>
      </div>
    </div>
  );
}
