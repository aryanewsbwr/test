'use client';

import React, { useState, useEffect } from 'react';
import { Truck, Plus, Save, Trash2, X, Printer, Calendar, DollarSign } from 'lucide-react';
import { Publisher, Publication } from '@/lib/types';

interface PurchaseItem {
  id: number;
  publica_id: number;
  pub_name: string;
  bundles: number;
  received_copies: number;
  return_copies: number;
  net_copies: number;
  buying_rate: number;
  total_amount: number;
}

interface PurchaseFormProps {
  onClose: () => void;
  publishers?: Publisher[];
  publications?: Publication[];
}

export default function PurchaseForm({ onClose, publishers = [], publications = [] }: PurchaseFormProps) {
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedPublisher, setSelectedPublisher] = useState<string>(
    publishers.length > 0 ? ((publishers[0] as any)?.publisher_id ?? (publishers[0] as any)?.publish_id ?? '').toString() : ''
  );
  const [invoiceNo, setInvoiceNo] = useState('');
  const [freightCharges, setFreightCharges] = useState(0);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [isSaved, setIsSaved] = useState(false);

  const handleCancel = () => {
    setItems([]);
    setInvoiceNo('');
    setFreightCharges(0);
    setIsSaved(false);
  };

  const addItem = () => {
    const pub = publications[0] || { publica_id: 1, public_name: 'New Publication', b_rate: 3.5 };
    const newItem: PurchaseItem = {
      id: Date.now(),
      publica_id: pub.publica_id,
      pub_name: pub.public_name,
      bundles: 1,
      received_copies: 100,
      return_copies: 0,
      net_copies: 100,
      buying_rate: (pub as any).b_rate || 3.5,
      total_amount: 100 * ((pub as any).b_rate || 3.5)
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: number, field: keyof PurchaseItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'publica_id') {
          const foundPub = publications.find(p => p.publica_id === parseInt(value, 10));
          if (foundPub) {
            updated.pub_name = foundPub.public_name;
            updated.buying_rate = (foundPub as any).b_rate || item.buying_rate;
          }
        }
        const net = Math.max(0, (updated.received_copies || 0) - (updated.return_copies || 0));
        updated.net_copies = net;
        updated.total_amount = Math.round(net * updated.buying_rate * 100) / 100;
        return updated;
      }
      return item;
    }));
  };

  const removeItem = (id: number) => {
    setItems(items.filter(item => item.id !== id));
  };

  const totalCopies = items.reduce((sum, i) => sum + i.net_copies, 0);
  const totalPaperAmount = items.reduce((sum, i) => sum + i.total_amount, 0);
  const grandTotal = totalPaperAmount + (parseFloat(freightCharges as any) || 0);

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="d2-window relative w-[880px] h-[580px] vb-window flex flex-col shadow-2xl overflow-hidden font-tahoma">
      {/* Title Bar */}
      <div className="d2-title vb-titlebar-xp select-none">
        <div className="flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" />
          <span>Publisher Newspaper Purchase & Supply Invoice (अखबार खरीद / आवक प्रविष्टि)</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="vb-win-btn">_</button>
          <button className="vb-win-btn">□</button>
          <button onClick={onClose} className="vb-win-btn vb-win-btn-close">✕</button>
        </div>
      </div>

      {/* Main Form */}
      <div className="flex-1 p-3 bg-[#ECE9D8] flex flex-col justify-between overflow-hidden">
        
        {/* Header */}
        <div className="text-center pb-1">
          <h1 className="text-base font-black text-[#8B0000] tracking-wider uppercase">
            PUBLISHER MORNING SUPPLY INVOICE & PURCHASE ENTRY
          </h1>
          <p className="text-[11px] text-slate-700 font-bold">
            Entry of daily wholesale newspaper stock received from printing presses with bundle counts & return credits
          </p>
        </div>

        {/* Invoice Meta Controls */}
        <div className="bg-white p-2.5 vb-box-inset my-1 text-xs font-bold grid grid-cols-4 max-md:grid-cols-2 gap-3 items-center">
          <div>
            <label className="block text-[#8B0000] mb-0.5">Supply Date:</label>
            <input 
              type="date" 
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="vb-input w-full font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-700 mb-0.5">Publisher:</label>
            <select 
              value={selectedPublisher}
              onChange={(e) => setSelectedPublisher(e.target.value)}
              className="vb-input w-full bg-white font-bold"
            >
              {publishers.map((p, pIdx) => {
                const pid = (p as any).publisher_id ?? (p as any).publish_id ?? pIdx;
                return <option key={pid} value={pid}>{p.name}</option>;
              })}
            </select>
          </div>

          <div>
            <label className="block text-slate-700 mb-0.5">Challan / Invoice No:</label>
            <input 
              type="text" 
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="e.g. INV-8492"
              className="vb-input w-full font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-700 mb-0.5">Transport / Freight (₹):</label>
            <input 
              type="number" 
              value={freightCharges}
              onChange={(e) => setFreightCharges(parseFloat(e.target.value) || 0)}
              className="vb-input w-full font-mono text-right font-bold"
            />
          </div>
        </div>

        {/* Items Grid */}
        <div className="flex-1 bg-white vb-grid overflow-auto my-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#ECE9D8]">
              <tr>
                <th className="p-1.5 border text-left">Publication / Newspaper</th>
                <th className="p-1.5 border text-center w-16">Bundles</th>
                <th className="p-1.5 border text-right w-20">Received</th>
                <th className="p-1.5 border text-right w-16">Return</th>
                <th className="p-1.5 border text-right w-20">Net Copies</th>
                <th className="p-1.5 border text-right w-20">Buying Rate</th>
                <th className="p-1.5 border text-right w-24">Amount (₹)</th>
                <th className="p-1.5 border text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b hover:bg-blue-50 text-[11px]">
                  <td className="p-1 border-r">
                    <select 
                      value={item.publica_id}
                      onChange={(e) => updateItem(item.id, 'publica_id', e.target.value)}
                      className="w-full bg-transparent font-bold outline-none"
                    >
                      {publications.map(p => (
                        <option key={p.publica_id} value={p.publica_id}>{p.public_name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1 border-r text-center">
                    <input 
                      type="number" 
                      value={item.bundles}
                      onChange={(e) => updateItem(item.id, 'bundles', parseInt(e.target.value, 10) || 0)}
                      className="w-12 text-center font-mono outline-none border border-slate-300"
                    />
                  </td>
                  <td className="p-1 border-r text-right">
                    <input 
                      type="number" 
                      value={item.received_copies}
                      onChange={(e) => updateItem(item.id, 'received_copies', parseInt(e.target.value, 10) || 0)}
                      className="w-16 text-right font-mono outline-none border border-slate-300 font-bold"
                    />
                  </td>
                  <td className="p-1 border-r text-right">
                    <input 
                      type="number" 
                      value={item.return_copies}
                      onChange={(e) => updateItem(item.id, 'return_copies', parseInt(e.target.value, 10) || 0)}
                      className="w-14 text-right font-mono outline-none border border-red-300 text-red-700"
                    />
                  </td>
                  <td className="p-1 border-r text-right font-mono font-bold text-blue-900 bg-blue-50/50">
                    {item.net_copies}
                  </td>
                  <td className="p-1 border-r text-right">
                    <input 
                      type="number" 
                      step="0.05"
                      value={item.buying_rate}
                      onChange={(e) => updateItem(item.id, 'buying_rate', parseFloat(e.target.value) || 0)}
                      className="w-16 text-right font-mono outline-none border border-slate-300"
                    />
                  </td>
                  <td className="p-1 border-r text-right font-mono font-bold text-slate-900">
                    ₹{item.total_amount.toFixed(2)}
                  </td>
                  <td className="p-1 text-center">
                    <button 
                      onClick={() => removeItem(item.id)}
                      className="text-red-600 hover:text-red-800 p-0.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary & Actions Bar */}
        <div className="bg-[#ECE9D8] pt-2 border-t border-slate-300 flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-2">
            <button 
              onClick={addItem}
              className="vb-btn bg-white hover:bg-slate-100 flex items-center gap-1 cursor-pointer px-2.5 py-1"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Add Publication</span>
            </button>
            <span>Total Copies: <strong className="text-blue-900">{totalCopies}</strong></span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[10px] text-slate-600 uppercase block">Total Invoice Payable</span>
              <span className="text-sm font-black font-mono text-[#8B0000]">₹{grandTotal.toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button 
                onClick={handleSave}
                disabled={items.length === 0}
                className="vb-btn bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-1 cursor-pointer px-3 py-1"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Invoice</span>
              </button>
              <button 
                onClick={handleCancel}
                disabled={items.length === 0 && !invoiceNo}
                className="vb-btn bg-white hover:bg-slate-100 disabled:opacity-50 text-black flex items-center gap-1 cursor-pointer px-3 py-1"
              >
                <span>✖ Cancel</span>
              </button>
              <button 
                onClick={onClose} 
                className="vb-btn bg-white hover:bg-red-50 text-red-800 flex items-center gap-1 cursor-pointer px-3 py-1"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
