'use client';

import React, { useState } from 'react';
import { Building2, Save, X, CheckCircle2, Phone, Mail, MapPin } from 'lucide-react';

interface CompanyFormProps {
  onClose: () => void;
}

export default function CompanyForm({ onClose }: CompanyFormProps) {
  const [agencyName, setAgencyName] = useState('ARYAN NEWS AGENCY');
  const [hindiName, setHindiName] = useState('आर्यन न्यूज एजेंसी');
  const [proprietor, setProprietor] = useState('Himanshu Agarwal');
  const [address, setAddress] = useState('Main Market, Near Clock Tower, Beawar (Raj.) - 305901');
  const [phone, setPhone] = useState('01462-254123, 98290XXXXX');
  const [email, setEmail] = useState('aryanewsbwr@gmail.com');
  const [tagline, setTagline] = useState('Complete Newspaper & Periodical Distributors');
  const [billingTerms, setBillingTerms] = useState('1. Please pay your monthly bill before the 10th of every month.\n2. Please mention your Customer ID on all payment receipts.\n3. Inform in advance for vacation/temporary stops.');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="d2-window relative w-[720px] h-[520px] vb-window flex flex-col shadow-2xl overflow-hidden font-tahoma">
      {/* Title Bar */}
      <div className="d2-title vb-titlebar-xp select-none">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          <span>Company & Agency Profile Setup (फर्म विवरण एवं बिलिंग नियम)</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="vb-win-btn vb-win-btn-close">✕</button>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSave} className="flex-1 p-3 bg-[#ECE9D8] flex flex-col justify-between overflow-hidden">
        
        {/* Header */}
        <div className="text-center pb-1">
          <h1 className="text-base font-black text-[#8B0000] tracking-wider uppercase">
            AGENCY MASTER PROFILE & BILL INVOICE HEADER
          </h1>
          <p className="text-[11px] text-slate-700 font-bold">
            These details appear on all printed monthly bills, delivery slips, and payment receipts.
          </p>
        </div>

        {/* Fields Box */}
        <div className="bg-white p-3 vb-box-inset flex-1 overflow-auto space-y-2 text-xs">
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#8B0000] mb-0.5">Agency Name (English):</label>
              <input 
                type="text" 
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                required
                className="vb-input w-full font-bold uppercase"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-0.5">फर्म का नाम (हिंदी):</label>
              <input 
                type="text" 
                value={hindiName}
                onChange={(e) => setHindiName(e.target.value)}
                className="vb-input w-full font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-0.5">Proprietor / Contact Person:</label>
              <input 
                type="text" 
                value={proprietor}
                onChange={(e) => setProprietor(e.target.value)}
                className="vb-input w-full"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-0.5">Phone / Mobile:</label>
              <input 
                type="text" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="vb-input w-full font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-0.5">Agency Office Address:</label>
            <input 
              type="text" 
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="vb-input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-0.5">Email Address:</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="vb-input w-full"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-0.5">Agency Tagline / Slogan:</label>
              <input 
                type="text" 
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="vb-input w-full text-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-0.5">Bill Invoice Terms & Conditions (बिल शर्तें):</label>
            <textarea 
              rows={3}
              value={billingTerms}
              onChange={(e) => setBillingTerms(e.target.value)}
              className="vb-input w-full text-[11px] font-mono leading-relaxed"
            />
          </div>

          {isSaved && (
            <div className="p-1.5 bg-emerald-100 border border-emerald-400 text-emerald-900 font-bold text-[11px] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Agency profile configuration updated and saved successfully!</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-[#ECE9D8] pt-2 border-t border-slate-300 flex items-center justify-between text-xs font-bold">
          <span className="text-slate-500 font-mono text-[10px]">Config: AryanNews.cfg</span>
          <div className="flex items-center gap-2">
            <button 
              type="submit"
              className="vb-btn bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer px-3 py-1"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Profile</span>
            </button>
            <button 
              type="button"
              onClick={onClose} 
              className="vb-btn bg-white hover:bg-red-50 text-red-800 flex items-center gap-1 cursor-pointer px-3 py-1"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
              <span>Close</span>
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
