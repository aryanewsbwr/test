'use client';

import React, { useState, useEffect } from 'react';
import { Users, Plus, Save, Trash2, X, BookOpen, Calendar, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface Agent {
  collect_id: number;
  name: string;
  phone?: string;
  area?: string;
  active: boolean;
}

interface BookAllocation {
  sno: number;
  collect_id: number;
  agent_name: string;
  receipt_from: number;
  receipt_to: number;
  issue_date: string;
  rec_date: string;
  status: 'Issued' | 'Returned' | 'In Use';
}

export default function CollectionAgentsForm({ isOpen, onClose }: Props) {
  const [agents, setAgents] = useState<Agent[]>([
    { collect_id: 1, name: 'Suresh Kumar Sharma', phone: '9829012345', area: 'Station Road & Main Market', active: true },
    { collect_id: 2, name: 'Rameshwar Lal Gurjar', phone: '9414054321', area: 'Chang Gate & Mewari Gate', active: true },
    { collect_id: 3, name: 'Kailash Chand Verma', phone: '9784011223', area: 'Subhash Nagar & Housing Board', active: true },
    { collect_id: 4, name: 'Mahesh Sharma (Office Counter)', phone: '01462-250000', area: 'Main Agency Counter', active: true },
  ]);

  const [allocations, setAllocations] = useState<BookAllocation[]>([
    { sno: 1, collect_id: 1, agent_name: 'Suresh Kumar Sharma', receipt_from: 1001, receipt_to: 1100, issue_date: '2026-07-01', rec_date: '2026-07-31', status: 'Returned' },
    { sno: 2, collect_id: 2, agent_name: 'Rameshwar Lal Gurjar', receipt_from: 1101, receipt_to: 1200, issue_date: '2026-07-01', rec_date: '2026-07-31', status: 'Returned' },
    { sno: 3, collect_id: 1, agent_name: 'Suresh Kumar Sharma', receipt_from: 1201, receipt_to: 1300, issue_date: '2026-08-01', rec_date: '', status: 'In Use' },
    { sno: 4, collect_id: 3, agent_name: 'Kailash Chand Verma', receipt_from: 1301, receipt_to: 1400, issue_date: '2026-08-01', rec_date: '', status: 'In Use' },
  ]);

  const [activeTab, setActiveTab] = useState<'agents' | 'books'>('agents');
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentPhone, setNewAgentPhone] = useState('');
  const [newAgentArea, setNewAgentArea] = useState('');

  const [allocAgentId, setAllocAgentId] = useState<number>(1);
  const [allocFrom, setAllocFrom] = useState<number>(1401);
  const [allocTo, setAllocTo] = useState<number>(1500);
  const [allocDate, setAllocDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [status, setStatus] = useState('');

  if (!isOpen) return null;

  const handleAddAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    const newId = agents.length > 0 ? Math.max(...agents.map(a => a.collect_id)) + 1 : 1;
    const newAgent: Agent = {
      collect_id: newId,
      name: newAgentName.trim(),
      phone: newAgentPhone.trim(),
      area: newAgentArea.trim(),
      active: true
    };
    setAgents([...agents, newAgent]);
    setNewAgentName('');
    setNewAgentPhone('');
    setNewAgentArea('');
    setStatus(`Agent "${newAgent.name}" registered successfully.`);
    setTimeout(() => setStatus(''), 3000);
  };

  const handleAddAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    const ag = agents.find(a => a.collect_id === Number(allocAgentId));
    if (!ag) return;
    const newAlloc: BookAllocation = {
      sno: allocations.length + 1,
      collect_id: ag.collect_id,
      agent_name: ag.name,
      receipt_from: Number(allocFrom),
      receipt_to: Number(allocTo),
      issue_date: allocDate,
      rec_date: '',
      status: 'In Use'
    };
    setAllocations([...allocations, newAlloc]);
    setAllocFrom(Number(allocTo) + 1);
    setAllocTo(Number(allocTo) + 100);
    setStatus(`Receipt book (${newAlloc.receipt_from} - ${newAlloc.receipt_to}) allotted to ${ag.name}.`);
    setTimeout(() => setStatus(''), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="d2-window w-full max-w-4xl bg-[#ECE9D8] border-2 border-t-white border-l-white border-r-[#404040] border-b-[#404040] shadow-2xl font-tahoma flex flex-col max-h-[90vh]">
        {/* Titlebar */}
        <div className="d2-title bg-linear-to-r from-[#0A246A] to-[#A6CAF0] text-white px-3 py-1 flex items-center justify-between font-bold text-xs select-none">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-yellow-300" />
            <span>Collection Agent & Receipt Book Allotment Master (बिल संग्रहकर्ता एवं रसीद बुक आवंटन)</span>
          </div>
          <button onClick={onClose} className="w-4 h-4 bg-[#ECE9D8] text-black font-bold text-[10px] flex items-center justify-center border border-black hover:bg-red-600 hover:text-white">✕</button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-[#ECE9D8] border-b border-[#808080] px-3 pt-2 flex gap-1 text-xs">
          <button 
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-1.5 border-t border-l border-r border-black font-bold rounded-t-xs ${activeTab === 'agents' ? 'bg-white text-blue-900 border-b-white' : 'bg-[#D4D0C8] text-slate-700'}`}
          >
            1. Collection Agents List (संग्रहकर्ता सूची)
          </button>
          <button 
            onClick={() => setActiveTab('books')}
            className={`px-4 py-1.5 border-t border-l border-r border-black font-bold rounded-t-xs ${activeTab === 'books' ? 'bg-white text-blue-900 border-b-white' : 'bg-[#D4D0C8] text-slate-700'}`}
          >
            2. Receipt Book Allotment Tracker (रसीद बुक फ्रॉम-टू आवंटन)
          </button>
        </div>

        <div className="p-4 flex-1 overflow-auto space-y-4 text-xs bg-white">
          {activeTab === 'agents' ? (
            <div className="space-y-4">
              {/* Add New Agent Form */}
              <form onSubmit={handleAddAgent} className="p-3 bg-slate-50 border border-slate-300 rounded-xs space-y-3">
                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-700" />
                  Register New Collection Agent (नया बिल संग्रहकर्ता जोड़ें):
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Agent Name (नाम): *</label>
                    <input 
                      type="text" 
                      required
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      placeholder="e.g. Suresh Kumar"
                      className="w-full px-2 py-1 border border-slate-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Mobile / Phone (फोन):</label>
                    <input 
                      type="text" 
                      value={newAgentPhone}
                      onChange={(e) => setNewAgentPhone(e.target.value)}
                      placeholder="e.g. 9829012345"
                      className="w-full px-2 py-1 border border-slate-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Assigned Collection Area (क्षेत्र):</label>
                    <input 
                      type="text" 
                      value={newAgentArea}
                      onChange={(e) => setNewAgentArea(e.target.value)}
                      placeholder="e.g. Station Road"
                      className="w-full px-2 py-1 border border-slate-400 bg-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="px-4 py-1 bg-blue-700 text-white font-bold border border-black shadow-xs hover:bg-blue-800 flex items-center gap-1">
                    <Save className="w-3.5 h-3.5" /> Save Agent (सुरक्षित करें)
                  </button>
                </div>
              </form>

              {/* Agent Grid */}
              <div className="border border-slate-300 overflow-auto max-h-60">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#ECE9D8] text-slate-800 font-bold border-b sticky top-0">
                    <tr>
                      <th className="p-2 border-r">Agent ID</th>
                      <th className="p-2 border-r">Agent Name</th>
                      <th className="p-2 border-r">Phone</th>
                      <th className="p-2 border-r">Assigned Area</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((ag) => (
                      <tr key={ag.collect_id} className="border-b hover:bg-amber-50">
                        <td className="p-2 border-r font-mono text-blue-900 font-bold">{ag.collect_id}</td>
                        <td className="p-2 border-r font-bold text-slate-800">{ag.name}</td>
                        <td className="p-2 border-r font-mono text-slate-600">{ag.phone || '-'}</td>
                        <td className="p-2 border-r text-slate-700">{ag.area || '-'}</td>
                        <td className="p-2">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-xs border border-emerald-300">
                            Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Add Book Allotment Form */}
              <form onSubmit={handleAddAllocation} className="p-3 bg-slate-50 border border-slate-300 rounded-xs space-y-3">
                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-700" />
                  Allot Receipt Book to Agent (रसीद बुक आवंटन करें):
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Select Agent: *</label>
                    <select 
                      value={allocAgentId}
                      onChange={(e) => setAllocAgentId(Number(e.target.value))}
                      className="w-full px-2 py-1 border border-slate-400 bg-white font-bold text-blue-900"
                    >
                      {agents.map(a => (
                        <option key={a.collect_id} value={a.collect_id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Receipt From (प्रारंभ): *</label>
                    <input 
                      type="number" 
                      required
                      value={allocFrom}
                      onChange={(e) => setAllocFrom(Number(e.target.value))}
                      className="w-full px-2 py-1 border border-slate-400 bg-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Receipt To (अंतिम): *</label>
                    <input 
                      type="number" 
                      required
                      value={allocTo}
                      onChange={(e) => setAllocTo(Number(e.target.value))}
                      className="w-full px-2 py-1 border border-slate-400 bg-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Issue Date (दिनांक): *</label>
                    <input 
                      type="date" 
                      required
                      value={allocDate}
                      onChange={(e) => setAllocDate(e.target.value)}
                      className="w-full px-2 py-1 border border-slate-400 bg-white font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="px-4 py-1 bg-emerald-700 text-white font-bold border border-black shadow-xs hover:bg-emerald-800 flex items-center gap-1">
                    <Save className="w-3.5 h-3.5" /> Allot Book (बुक आवंटित करें)
                  </button>
                </div>
              </form>

              {/* Allotment Grid */}
              <div className="border border-slate-300 overflow-auto max-h-60">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#ECE9D8] text-slate-800 font-bold border-b sticky top-0">
                    <tr>
                      <th className="p-2 border-r">S.No</th>
                      <th className="p-2 border-r">Agent Name</th>
                      <th className="p-2 border-r">Receipt From</th>
                      <th className="p-2 border-r">Receipt To</th>
                      <th className="p-2 border-r">Issue Date</th>
                      <th className="p-2 border-r">Return Date</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((al) => (
                      <tr key={al.sno} className="border-b hover:bg-amber-50">
                        <td className="p-2 border-r font-mono">{al.sno}</td>
                        <td className="p-2 border-r font-bold text-blue-900">{al.agent_name}</td>
                        <td className="p-2 border-r font-mono font-bold text-emerald-800">{al.receipt_from}</td>
                        <td className="p-2 border-r font-mono font-bold text-emerald-800">{al.receipt_to}</td>
                        <td className="p-2 border-r font-mono text-slate-600">{al.issue_date}</td>
                        <td className="p-2 border-r font-mono text-slate-600">{al.rec_date || '-'}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-xs border ${al.status === 'In Use' ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-slate-100 text-slate-700 border-slate-300'}`}>
                            {al.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {status && (
            <div className="bg-emerald-100 text-emerald-800 p-2 border border-emerald-400 rounded-xs font-bold text-center">
              {status}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#ECE9D8] border-t border-[#808080] px-4 py-2 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-1 bg-[#ECE9D8] border border-black shadow-xs hover:bg-slate-200 font-bold text-xs"
          >
            Close (बंद करें)
          </button>
        </div>
      </div>
    </div>
  );
}
