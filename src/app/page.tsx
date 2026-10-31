'use client';

import React, { useState, useEffect } from 'react';
import VB6DesktopLayout from '@/components/VB6DesktopLayout';
import HawkerMobilePortal from '@/components/mobile/HawkerMobilePortal';
import LoginModal from '@/components/auth/LoginModal';
import { AppUser } from '@/lib/auth';

export default function HomePage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // The server decides who is logged in, so the screens only open once it agrees
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          localStorage.removeItem('news_auth_user');
          setUser(null);
          return;
        }
        const { user: savedUser }: { user: AppUser } = await res.json();
        localStorage.setItem('news_auth_user', JSON.stringify(savedUser));
        setUser(savedUser);

        // Smart device mode detection:
        // Hawkers ALWAYS default to mobile touch portal.
        // On phones/tablets (< 768px), default to mobile touch view.
        if (savedUser.role === 'hawker' || window.innerWidth < 768) {
          setViewMode('mobile');
        } else {
          setViewMode('desktop');
        }
      } catch (e) {
        console.error('Failed to check auth session:', e);
      } finally {
        setIsInitialized(true);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    if (!user) return;
    // Keeps a screen left open all week logged in, and closes it if the user was removed
    const timer = setInterval(async () => {
      const res = await fetch('/api/auth/me').catch(() => null);
      if (res?.status === 401) {
        localStorage.removeItem('news_auth_user');
        setUser(null);
      }
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user]);

  const handleLoginSuccess = (loggedInUser: AppUser) => {
    setUser(loggedInUser);
    if (loggedInUser.role === 'hawker' || (typeof window !== 'undefined' && window.innerWidth < 768)) {
      setViewMode('mobile');
    } else {
      setViewMode('desktop');
    }
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to log out? (क्या आप लॉगआउट करना चाहते हैं?)')) {
      try {
        localStorage.removeItem('news_auth_user');
      } catch (e) {}
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      setUser(null);
    }
  };

  // Prevent flash before checking local session
  if (!isInitialized) {
    return (
      <div className="h-screen w-full bg-[#3A6EA5] flex flex-col items-center justify-center text-white font-tahoma">
        <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/40 shadow-2xl flex items-center justify-center mb-3 animate-pulse">
          <span className="text-2xl font-black text-white font-serif">ANA</span>
        </div>
        <p className="text-sm font-bold text-yellow-200">Aryan News Agency System</p>
        <p className="text-xs text-white/75 mt-1 font-mono">Loading authentication session...</p>
      </div>
    );
  }

  // Not logged in -> Show secure login modal
  if (!user) {
    return (
      <div className="h-screen w-full bg-[#3A6EA5] relative overflow-hidden">
        <LoginModal 
          isOpen={true} 
          onLoginSuccess={handleLoginSuccess} 
        />
      </div>
    );
  }

  // Logged in as Hawker or switched to Mobile View
  if (viewMode === 'mobile' || user.role === 'hawker') {
    return (
      <HawkerMobilePortal 
        user={user} 
        onLogout={handleLogout} 
        onSwitchToDesktop={user.role !== 'hawker' ? () => setViewMode('desktop') : undefined}
      />
    );
  }

  // Desktop MDI View (for Admin / Staff / Operator)
  return (
    <VB6DesktopLayout 
      user={user}
      onLogout={handleLogout}
      onSwitchToMobile={() => setViewMode('mobile')}
    />
  );
}
