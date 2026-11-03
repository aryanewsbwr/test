'use client';

import React, { useState } from 'react';
import { AppUser } from '@/lib/auth';

interface Props {
  isOpen: boolean;
  onLoginSuccess: (user: AppUser) => void;
  onCancel?: () => void;
}

export default function LoginModal({ isOpen, onLoginSuccess }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('कृपया यूजर आईडी और पासवर्ड दर्ज करें (Enter Username and Password)');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      // Save user to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('news_auth_user', JSON.stringify(data.user));
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setErrorMsg(err.message || 'लॉगिन असफल रहा. कृपया पुनः प्रयास करें.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-100 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 select-none">
      <div className="d2-window w-full max-w-sm bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl font-tahoma text-xs overflow-hidden flex flex-col">
        
        {/* Titlebar */}
        <div className="d2-title bg-[#0A246A] text-white px-2.5 py-1.5 flex items-center justify-between font-bold">
          <div className="flex items-center gap-1.5">
            <img 
              src="/legacy_images/paper.ico" 
              alt="ico" 
              className="w-4 h-4" 
              onError={(e) => (e.currentTarget.style.display = 'none')} 
            />
            <span className="tracking-wide text-xs">
              Aryan News Management - System Login
            </span>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3 bg-[#ECE9D8]">
          
          <div className="text-center pb-1 border-b border-[#CCA000]/40">
            <h1 className="text-base font-black text-[#800000] tracking-wider uppercase font-serif">
              ARYAN NEWSPAPER AGENCY
            </h1>
            <p className="text-[11px] text-slate-700 font-bold">
              सुरक्षित लॉगिन प्रणाली (Secure System Access)
            </p>
          </div>

          <div className="space-y-2.5 pt-1">
            {/* Username Input */}
            <div>
              <label className="font-bold text-[#800000] block text-[11px] mb-0.5">
                User ID / यूजर आईडी:
              </label>
              <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-2 py-1 shadow-inner">
                <input 
                  type="text"
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. ananews or hawker ID"
                  className="w-full bg-transparent font-bold text-black outline-none text-xs"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="font-bold text-[#800000] block text-[11px] mb-0.5">
                Password / पासवर्ड:
              </label>
              <div className="border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white px-2 py-1 shadow-inner">
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-transparent font-bold text-black outline-none text-xs"
                />
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-1.5 bg-red-100 border border-red-400 text-red-800 text-[11px] font-bold text-center rounded-xs">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-2 border-t border-[#808080]">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-1.5 px-3 bg-[#ECE9D8] hover:bg-white active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white font-bold text-xs text-blue-900 shadow-xs cursor-pointer flex items-center justify-center gap-1"
            >
              <span>🔑</span>
              <span>{isLoading ? 'Verifying...' : 'Login (लॉगिन)'}</span>
            </button>
          </div>

          <div className="text-[10px] text-center text-slate-500 pt-1">
            Admin / Hawker / Operator Portal • Version 2.0
          </div>
        </form>

      </div>
    </div>
  );
}
