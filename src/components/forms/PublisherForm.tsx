'use client';

import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Trash2, Search, X, LogOut, Check } from 'lucide-react';
import { Publisher } from '@/lib/types';

interface PublisherFormProps {
  onClose: () => void;
  publishers: Publisher[];
  onSave?: (pub: Publisher) => void;
}

export default function PublisherForm({ onClose, publishers = [], onSave }: PublisherFormProps) {
  const [selectedPub, setSelectedPub] = useState<Publisher>({
    publish_id: 0,
    name: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    mobile: '',
    fax: '',
    email: '',
    website: '',
    category: 'Newspaper',
    type: 'Publisher'
  });

  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [msg, setMsg] = useState('');

  const handleCancel = () => {
    setSelectedPub({
      publish_id: 0,
      name: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      mobile: '',
      fax: '',
      email: '',
      website: '',
      category: 'Newspaper',
      type: 'Publisher'
    });
    setMsg('');
    setSearchTerm('');
    setIsFindOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFindOpen) setIsFindOpen(false);
        else onClose();
      } else if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 's' || key === 'u') {
          e.preventDefault();
          handleSave();
        } else if (key === 'd') {
          e.preventDefault();
          handleDelete();
        } else if (key === 'f') {
          e.preventDefault();
          setIsFindOpen(true);
        } else if (key === 'c') {
          e.preventDefault();
          handleCancel();
        } else if (key === 'e') {
          e.preventDefault();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPub, isFindOpen]);

  const handleSave = async () => {
    if (!selectedPub.name.trim()) {
      setMsg('Error: Publisher Name cannot be empty');
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    try {
      const res = await fetch('/api/publishers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedPub)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.publisher?.publish_id && !selectedPub.publish_id) {
        setSelectedPub(data.publisher);
      }
      if (onSave) onSave(data.publisher || selectedPub);
      setMsg('Publisher details saved successfully in Supabase!');
    } catch (err: any) {
      setMsg(`Error saving publisher: ${err.message}`);
    }
    setTimeout(() => setMsg(''), 3000);
  };

  const handleDelete = async () => {
    if (!selectedPub.publish_id) {
      setMsg('Select an existing publisher to delete');
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    if (window.confirm(`Are you sure you want to delete Publisher "${selectedPub.name}"?`)) {
      try {
        const res = await fetch(`/api/publishers?id=${selectedPub.publish_id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setMsg(`Publisher "${selectedPub.name}" deleted.`);
        setSelectedPub({
          publish_id: 0,
          name: '',
          address: '',
          city: '',
          state: '',
          pincode: '',
          phone: '',
          mobile: '',
          fax: '',
          email: '',
          website: '',
          category: 'Newspaper',
          type: 'Publisher'
        });
      } catch (err: any) {
        setMsg(`Error deleting publisher: ${err.message}`);
      }
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const filtered = publishers.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.city && p.city.toLowerCase().includes(searchTerm.toLowerCase())) ||
    p.publish_id.toString().includes(searchTerm)
  );

  return (
    <div className="d2-window relative w-full max-w-[700px] max-h-[calc(100vh-60px)] sm:max-h-[calc(100vh-70px)] vb-window flex flex-col shadow-2xl overflow-hidden font-tahoma my-auto shrink-0">
      {/* Title Bar */}
      <div className="d2-title vb-titlebar-xp select-none shrink-0">
        <div className="flex items-center gap-1.5">
          <img src="/legacy_images/paper.ico" alt="ico" className="w-3.5 h-3.5" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span>Publisher Info</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="vb-win-btn vb-win-btn-close">✕</button>
        </div>
      </div>

      {/* Main Body with Background Texture Image */}
      <div 
        className="flex-1 overflow-y-auto relative p-3 sm:p-4 flex flex-col justify-between bg-cover bg-center min-h-0"
        style={{ backgroundImage: "url('/legacy_images/Publisher.jpg'), linear-gradient(135deg, #E6F0FA 0%, #FFFFFF 100%)" }}
      >
        {/* Header */}
        <div className="text-center pt-1">
          <h1 className="text-xl font-black text-[#8B0000] tracking-wider uppercase drop-shadow-xs">
            PUBLISHER
          </h1>
        </div>

        {/* Input Form Fields */}
        <div className="grid grid-cols-12 gap-y-2 gap-x-2 text-xs font-bold text-black items-center max-w-[580px] mx-auto w-full pt-1">
          
          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Name</label>
          <input 
            type="text" 
            value={selectedPub.name || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, name: e.target.value })}
            className="col-span-9 vb-input font-bold"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Address</label>
          <input 
            type="text" 
            value={selectedPub.address || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, address: e.target.value })}
            className="col-span-9 vb-input"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">City</label>
          <input 
            type="text" 
            value={selectedPub.city || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, city: e.target.value })}
            className="col-span-9 vb-input"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">State</label>
          <input 
            type="text" 
            value={selectedPub.state || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, state: e.target.value })}
            className="col-span-9 vb-input"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Pincode</label>
          <input 
            type="text" 
            value={selectedPub.pincode || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, pincode: e.target.value })}
            className="col-span-9 vb-input"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Phone</label>
          <input 
            type="text" 
            value={selectedPub.phone || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, phone: e.target.value })}
            className="col-span-9 vb-input"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Mobile</label>
          <input 
            type="text" 
            value={selectedPub.mobile || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, mobile: e.target.value })}
            className="col-span-9 vb-input"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Fax</label>
          <input 
            type="text" 
            value={selectedPub.fax || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, fax: e.target.value })}
            className="col-span-9 vb-input"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Email</label>
          <input 
            type="email" 
            value={selectedPub.email || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, email: e.target.value })}
            className="col-span-9 vb-input text-blue-900"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Website</label>
          <input 
            type="text" 
            value={selectedPub.website || ''} 
            onChange={(e) => setSelectedPub({ ...selectedPub, website: e.target.value })}
            className="col-span-9 vb-input text-blue-900"
          />

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Category</label>
          <select 
            value={selectedPub.category || 'Newspaper'} 
            onChange={(e) => setSelectedPub({ ...selectedPub, category: e.target.value })}
            className="col-span-9 vb-input bg-white"
          >
            <option value="Newspaper">Newspaper (समाचार पत्र)</option>
            <option value="Magzine">Magzine (पत्रिका)</option>
            <option value="Both">Both (दोनों - समाचार पत्र व पत्रिका)</option>
          </select>

          <label className="col-span-3 text-right pr-2 text-[#8B0000]">Type</label>
          <select 
            value={selectedPub.type || 'Publisher'} 
            onChange={(e) => setSelectedPub({ ...selectedPub, type: e.target.value })}
            className="col-span-9 vb-input bg-white"
          >
            <option value="Publisher">Publisher (प्रकाशक)</option>
            <option value="Dealer">Dealer (डीलर)</option>
          </select>
        </div>

        {/* Message Banner */}
        {msg && (
          <div className="text-center text-xs font-bold text-emerald-800 bg-emerald-100 py-0.5 border border-emerald-400">
            {msg}
          </div>
        )}

        {/* Bottom Trapezoidal 3D Button Bar matching screenshot_01.jpg */}
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-1.5 pt-2 border-t border-slate-300/80 bg-[#ECE9D8] pb-1">
          <button onClick={handleSave} className="vb-action-btn">
            <span>💾 Save</span>
          </button>
          <button onClick={handleSave} className="vb-action-btn">
            <span>🔄 Update</span>
          </button>
          <button onClick={handleDelete} className="vb-action-btn">
            <span>🗑️ Del</span>
          </button>
          <button onClick={() => setIsFindOpen(true)} className="vb-action-btn bg-yellow-50">
            <span>🔍 Find</span>
          </button>
          <button onClick={handleCancel} title="Alt+C: Cancel and clear fields to blank" className="vb-action-btn">
            <span>❌ Cancel</span>
          </button>
          <button onClick={onClose} className="vb-action-btn text-red-700">
            <span>🛑 Exit</span>
          </button>
        </div>
      </div>

      {/* Find Publisher Dialog */}
      {isFindOpen && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="d2-window w-[500px] h-[360px] bg-[#ECE9D8] vb-window flex flex-col">
            <div className="d2-title vb-titlebar-xp">
              <span>Find Publisher</span>
              <button onClick={() => setIsFindOpen(false)} className="vb-win-btn vb-win-btn-close">✕</button>
            </div>
            <div className="p-2 flex-1 flex flex-col gap-2 overflow-hidden text-xs">
              <input 
                type="text" 
                placeholder="Search publisher name or city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="vb-input w-full"
              />
              <div className="flex-1 bg-white vb-grid overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#ECE9D8]">
                    <tr>
                      <th className="p-1">ID</th>
                      <th className="p-1">Publisher Name</th>
                      <th className="p-1">City</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr 
                        key={p.publish_id}
                        onClick={() => { setSelectedPub(p); setIsFindOpen(false); }}
                        className="cursor-pointer hover:bg-[#316AC5] hover:text-white border-b"
                      >
                        <td className="p-1">#{p.publish_id}</td>
                        <td className="p-1 font-bold">{p.name}</td>
                        <td className="p-1">{p.city}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
