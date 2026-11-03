'use client';

import React, { useState, useEffect } from 'react';
import { AppUser, UserPermissions } from '@/lib/auth';
import { Hawker } from '@/lib/types';

interface Props {
  isOpen?: boolean;
  onClose: () => void;
  hawkers?: Hawker[];
}

const PERMISSION_CONFIG: { key: keyof UserPermissions; label: string; hindi: string; desc: string }[] = [
  { 
    key: 'can_collect', 
    label: 'Payment Collection & Receipts', 
    hindi: 'भुगतान संग्रह एवं रसीद',
    desc: 'Allows entering receipts and collecting payments from customers.'
  },
  { 
    key: 'can_view_delivery', 
    label: 'Daily Delivery Sheet & Checklist', 
    hindi: 'दैनिक वितरण शीट एवं ग्राहक सूची',
    desc: 'Allows viewing active daily delivery newspapers and route checklist.'
  },
  { 
    key: 'can_mark_discontinue', 
    label: 'Customer Vacation Hold / Discontinue', 
    hindi: 'ग्राहक अवकाश एवं रोक प्रविष्टि',
    desc: 'Allows setting temporary vacation holds and restarts for customers.'
  },
  { 
    key: 'can_retail_sale', 
    label: 'Daily Retail Sale', 
    hindi: 'दैनिक फुटकर बिक्री',
    desc: 'Allows recording counter and retail newspaper sales.'
  },
  { 
    key: 'can_access_master', 
    label: 'Master Information (Publication, Rate, Customer)', 
    hindi: 'मास्टर डेटा (प्रकाशन, दरें, ग्राहक)',
    desc: 'Allows creating and editing publications, customers, and base rates.'
  },
  { 
    key: 'can_billing', 
    label: 'Monthly Billing Engine Process', 
    hindi: 'मासिक बिलिंग प्रक्रिया',
    desc: 'Allows executing monthly bill generation and calculation routines.'
  },
  { 
    key: 'can_reports', 
    label: 'Financial & Collection Reports', 
    hindi: 'वित्तीय एवं संग्रह रिपोर्ट',
    desc: 'Allows printing bills, ledger dues, and consolidated reports.'
  },
  { 
    key: 'can_manage_users', 
    label: 'User & Role Security Control', 
    hindi: 'उपयोगकर्ता एवं सुरक्षा प्रबंधन',
    desc: 'Allows creating new user accounts and managing permissions.'
  }
];

export default function UserPermissionsForm({ onClose, hawkers = [] }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [hawkerList, setHawkerList] = useState<Hawker[]>(hawkers);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [isNewMode, setIsNewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Form Fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'hawker' | 'operator' | 'billing'>('hawker');
  const [selectedHawkerId, setSelectedHawkerId] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [perms, setPerms] = useState<UserPermissions>({
    can_collect: true,
    can_view_delivery: true,
    can_mark_discontinue: true,
    can_retail_sale: true,
    can_access_master: false,
    can_billing: false,
    can_reports: false,
    can_manage_users: false
  });

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        const list: AppUser[] = data.users || [];
        setUsers(list);
        if (!selectedUser && list.length > 0) {
          loadUser(list[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    if (!hawkers || hawkers.length === 0) {
      fetch('/api/hawkers')
        .then(r => r.json())
        .then(d => { if (d.hawkers) setHawkerList(d.hawkers); })
        .catch(() => {});
    }
  }, []);

  const loadUser = (u: AppUser) => {
    setSelectedUser(u);
    setIsNewMode(false);
    setUsername(u.username);
    setPassword(''); // Leave blank unless changing
    setName(u.name || '');
    setRole(u.role || 'hawker');
    setSelectedHawkerId(u.hawker_id ? String(u.hawker_id) : '');
    setPhone(u.phone || '');
    setIsActive(u.is_active !== false);
    setPerms(u.permissions || {
      can_collect: true,
      can_view_delivery: true,
      can_mark_discontinue: true,
      can_retail_sale: true,
      can_access_master: false,
      can_billing: false,
      can_reports: false,
      can_manage_users: false
    });
    setStatusMsg(null);
  };

  const handleNew = () => {
    setIsNewMode(true);
    setSelectedUser(null);
    setUsername('');
    setPassword('');
    setName('');
    setRole('hawker');
    setSelectedHawkerId(hawkerList[0] ? String(hawkerList[0].hawker_id) : '');
    setPhone('');
    setIsActive(true);
    setPerms({
      can_collect: true,
      can_view_delivery: true,
      can_mark_discontinue: true,
      can_retail_sale: true,
      can_access_master: false,
      can_billing: false,
      can_reports: false,
      can_manage_users: false
    });
    setStatusMsg(null);
  };

  const handleRoleChange = (newRole: 'admin' | 'hawker' | 'operator' | 'billing') => {
    setRole(newRole);
    if (newRole === 'admin') {
      setPerms({
        can_collect: true,
        can_view_delivery: true,
        can_mark_discontinue: true,
        can_retail_sale: true,
        can_access_master: true,
        can_billing: true,
        can_reports: true,
        can_manage_users: true
      });
    } else if (newRole === 'hawker') {
      setPerms({
        can_collect: true,
        can_view_delivery: true,
        can_mark_discontinue: true,
        can_retail_sale: true,
        can_access_master: false,
        can_billing: false,
        can_reports: false,
        can_manage_users: false
      });
    } else if (newRole === 'operator') {
      setPerms({
        can_collect: true,
        can_view_delivery: true,
        can_mark_discontinue: true,
        can_retail_sale: true,
        can_access_master: true,
        can_billing: false,
        can_reports: true,
        can_manage_users: false
      });
    }
  };

  const handleTogglePerm = (key: keyof UserPermissions) => {
    setPerms(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    if (!username.trim()) {
      setStatusMsg({ text: 'कृपया यूजर आईडी (Username) दर्ज करें.', isError: true });
      return;
    }
    if (isNewMode && !password.trim()) {
      setStatusMsg({ text: 'नए यूजर के लिए पासवर्ड आवश्यक है.', isError: true });
      return;
    }

    try {
      const payload = {
        id: isNewMode ? undefined : selectedUser?.id,
        username: username.trim().toLowerCase(),
        password: password.trim() || undefined,
        name: name.trim() || username.trim(),
        role: role,
        hawker_id: role === 'hawker' && selectedHawkerId ? parseInt(selectedHawkerId, 10) : undefined,
        phone: phone.trim(),
        is_active: isActive,
        permissions: perms
      };

      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save user');

      setStatusMsg({ 
        text: `✓ यूजर "${payload.username}" सफलतापूर्वक सुरक्षित हुआ (${role === 'admin' ? 'Administrator' : role.toUpperCase()}).`, 
        isError: false 
      });

      setPassword('');
      setIsNewMode(false);
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({ text: `त्रुटि (Error): ${err.message}`, isError: true });
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    if (selectedUser.username === 'ananews') {
      alert('Main Administrator account "ananews" cannot be deleted.');
      return;
    }
    if (!confirm(`Are you sure you want to delete user account "${selectedUser.username}"?`)) return;

    try {
      const res = await fetch(`/api/auth/users?id=${selectedUser.id}&username=${selectedUser.username}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');

      setStatusMsg({ text: `✓ यूजर "${selectedUser.username}" हटा दिया गया.`, isError: false });
      setSelectedUser(null);
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({ text: `त्रुटि: ${err.message}`, isError: true });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="d2-window relative w-full max-w-[720px] max-h-[calc(100vh-60px)] sm:max-h-[calc(100vh-70px)] bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl flex flex-col font-tahoma select-none overflow-hidden text-xs my-auto shrink-0">
      
      {/* Titlebar */}
      <div className="d2-title bg-[#0A246A] text-white px-2 py-1 flex items-center justify-between font-bold shrink-0">
        <div className="flex items-center gap-1.5">
          <img 
            src="/legacy_images/paper.ico" 
            alt="ico" 
            className="w-4 h-4" 
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          <span className="text-xs tracking-wide">
            User Roles & Permission Control (उपयोगकर्ता एवं अधिकार प्रबंधन)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="w-5 h-4 bg-[#ECE9D8] border border-[#808080] text-black text-[10px] font-bold flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer">✕</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#ECE9D8] min-h-0">
        
        {/* Header Title */}
        <div className="text-center pb-1">
          <h1 
            className="text-xl font-black text-[#800000] tracking-wider uppercase font-serif"
          >
            USER ACCOUNTS & SECURITY PERMISSIONS
          </h1>
          <p className="text-[11px] text-slate-600">
            हॉकर, स्टाफ एवं ऑपरेटरों के लिए आईडी-पासवर्ड व अनुमतियाँ सेट करें (Admin creates credentials & restricts access)
          </p>
        </div>

        {/* 2-Column Split: Left User List, Right User Details & Permissions */}
        <div className="grid grid-cols-12 gap-2.5">
          
          {/* Left Column: User List */}
          <div className="col-span-4 bg-white border border-[#808080] shadow-inner p-1 flex flex-col justify-between h-[360px]">
            <div>
              <div className="bg-[#ECE9D8] px-2 py-1 font-bold text-xs text-[#000080] border-b border-[#808080] flex items-center justify-between">
                <span>Users ({users.length})</span>
                <button
                  type="button"
                  onClick={handleNew}
                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-xs cursor-pointer shadow-xs"
                >
                  + New User
                </button>
              </div>

              <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-100">
                {isLoading ? (
                  <div className="p-3 text-center text-slate-400 italic">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="p-3 text-center text-slate-400 italic">No users found.</div>
                ) : (
                  users.map((u) => {
                    const isSel = !isNewMode && selectedUser?.id === u.id;
                    return (
                      <div
                        key={u.id}
                        onClick={() => loadUser(u)}
                        className={`p-2 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                          isSel 
                            ? 'bg-[#0A246A] text-white font-bold' 
                            : 'hover:bg-blue-50 text-slate-800'
                        }`}
                      >
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span>{u.username === 'ananews' ? '👑' : u.role === 'hawker' ? '🚴' : '👤'}</span>
                            <span>{u.name || u.username}</span>
                          </div>
                          <div className={`text-[10px] font-mono ${isSel ? 'text-slate-200' : 'text-slate-500'}`}>
                            ID: @{u.username}
                          </div>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-xs font-bold uppercase ${
                          u.role === 'admin' 
                            ? (isSel ? 'bg-amber-400 text-black' : 'bg-amber-100 text-amber-900 border border-amber-300')
                            : u.role === 'hawker'
                            ? (isSel ? 'bg-blue-400 text-black' : 'bg-blue-100 text-blue-900 border border-blue-300')
                            : (isSel ? 'bg-slate-300 text-black' : 'bg-slate-100 text-slate-700 border border-slate-300')
                        }`}>
                          {u.role}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-1 bg-[#ECE9D8] text-[10px] text-slate-600 border-t border-[#808080] text-center font-bold">
              Admin: @ananews
            </div>
          </div>

          {/* Right Column: User Profile & Permissions Form */}
          <div className="col-span-8 space-y-2 bg-[#ECE9D8] h-[360px] flex flex-col justify-between overflow-y-auto pr-1">
            
            {/* User Details Fieldset */}
            <fieldset className="border border-[#808080] p-2 bg-white/60 relative space-y-1.5 shadow-xs">
              <legend className="px-1.5 font-bold text-[#800000] text-xs">
                {isNewMode ? '✨ Create New User Account' : `User Profile: @${username || ''}`}
              </legend>

              <div className="grid grid-cols-2 gap-2">
                {/* Username */}
                <div>
                  <label className="font-bold text-[#800000] block text-[11px]">User ID (लॉगिन आईडी) *</label>
                  <input 
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={!isNewMode && username === 'ananews'}
                    placeholder="e.g. ram_hawker, line1, cashier"
                    className="w-full px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner disabled:bg-slate-100"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="font-bold text-[#800000] block text-[11px]">
                    {isNewMode ? 'Password (पासवर्ड) *' : 'New Password (पासवर्ड बदलें)'}
                  </label>
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isNewMode ? 'Enter strong password' : 'Leave blank to keep unchanged'}
                    className="w-full px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner"
                  />
                </div>

                {/* Full Name */}
                <div>
                  <label className="font-bold text-slate-800 block text-[11px]">Full Name / नाम</label>
                  <input 
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ramprasad Hawker"
                    className="w-full px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner"
                  />
                </div>

                {/* System Role */}
                <div>
                  <label className="font-bold text-slate-800 block text-[11px]">Role (भूमिका)</label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as any)}
                    disabled={!isNewMode && username === 'ananews'}
                    className="w-full px-2 py-0.5 border border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white font-bold text-black outline-none shadow-inner disabled:bg-slate-100"
                  >
                    <option value="hawker">🚴 Hawker / Delivery Boy (हॉकर)</option>
                    <option value="operator">👤 Cashier / Operator (ऑपरेटर)</option>
                    <option value="billing">🧾 Billing Operator (बिलिंग स्टाफ)</option>
                    <option value="admin">👑 Full Administrator (एडमिन)</option>
                  </select>
                </div>

                {/* Linked Hawker Dropdown (when role is hawker) */}
                {role === 'hawker' && (
                  <div className="col-span-2 bg-blue-50 border border-blue-200 p-1.5 rounded-xs flex items-center gap-2">
                    <label className="font-bold text-blue-900 shrink-0 text-[11px]">
                      🚴 Link to Hawker (हॉकर चुनें):
                    </label>
                    <select
                      value={selectedHawkerId}
                      onChange={(e) => setSelectedHawkerId(e.target.value)}
                      className="flex-1 px-2 py-0.5 border border-slate-400 bg-white font-bold text-black text-xs outline-none"
                    >
                      <option value="">-- No specific hawker / General --</option>
                      {hawkerList.map((h) => (
                        <option key={h.hawker_id} value={h.hawker_id}>
                          #{h.hawker_id} - {h.name} {h.hindi_name ? `(${h.hindi_name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </fieldset>

            {/* Granular Permissions Checkboxes */}
            <fieldset className="border border-[#808080] p-2 bg-white/60 relative space-y-1 shadow-xs">
              <legend className="px-1.5 font-bold text-[#000080] text-xs">
                🔒 Allowed Features & Access Permissions (अनुमतियाँ)
              </legend>

              <div className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto p-1 bg-white border border-slate-200">
                {PERMISSION_CONFIG.map((cfg) => {
                  const checked = !!perms[cfg.key];
                  return (
                    <label 
                      key={cfg.key}
                      className={`flex items-start gap-1.5 p-1 rounded-xs cursor-pointer select-none text-[11px] border ${
                        checked 
                          ? 'bg-amber-50 border-amber-300 font-bold text-slate-900' 
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                      title={cfg.desc}
                    >
                      <input 
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleTogglePerm(cfg.key)}
                        disabled={role === 'admin'}
                        className="mt-0.5 cursor-pointer accent-blue-800"
                      />
                      <div className="leading-tight">
                        <div>{cfg.label}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{cfg.hindi}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Status Message */}
            {statusMsg && (
              <div className={`py-1 px-2 text-center text-xs font-bold border rounded-xs ${statusMsg.isError ? 'bg-red-50 text-red-900 border-red-300' : 'bg-emerald-50 text-emerald-900 border-emerald-300'}`}>
                {statusMsg.text}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons matching VB6 Bevel */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-1 pt-2 border-t border-[#808080] bg-[#ECE9D8] pb-1">
          <button 
            type="button"
            onClick={handleNew}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-amber-950 shadow-xs cursor-pointer text-center"
          >
            ➕ <u>N</u>ew User
          </button>

          <button 
            type="button"
            onClick={handleSave}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
          >
            💾 <u>S</u>ave / Update
          </button>

          <button 
            type="button"
            onClick={handleDelete}
            disabled={isNewMode || !selectedUser || selectedUser.username === 'ananews'}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center disabled:opacity-50"
          >
            🗑 <u>D</u>elete
          </button>

          <button 
            type="button"
            onClick={fetchUsers}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-black shadow-xs cursor-pointer text-center"
          >
            🔄 <u>R</u>efresh
          </button>

          <button 
            type="button"
            onClick={onClose}
            className="flex-1 py-1 px-2 bg-[#ECE9D8] hover:bg-[#F5F4EA] active:bg-[#D4D0C8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] active:border-t-[#404040] active:border-l-[#404040] active:border-r-white active:border-b-white text-xs font-bold text-red-800 shadow-xs cursor-pointer text-center"
          >
            🛑 <u>E</u>xit
          </button>
        </div>

      </div>

    </div>
  );
}
