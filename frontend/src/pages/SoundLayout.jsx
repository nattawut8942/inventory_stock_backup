/**
 * SoundLayout.jsx
 * Layout: Canvas (TX←Switch→RX) + List (bottom)
 * StatCard: เหมือน IPManagementPage
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, CheckCircle2, XCircle,
  Network, X, Zap, RefreshCw, Plus, Edit2, Trash2, Wifi,
  Radio, Server, CheckCircle
} from 'lucide-react';
import { API_BASE } from '../config/api.js';
import Portal from '../components/Portal.jsx';
import AlertModal from '../components/AlertModal.jsx';

const API = `${API_BASE}/sound`;

// ─── STATUS CONFIG ─────────────────────────────────────────────
const getStatusConfig = (status) => {
  switch (status) {
    case 'Active':       return { color:'text-emerald-700', bg:'bg-emerald-100', border:'border-emerald-300', dot:'bg-emerald-500', dotAnim:'animate-pulse', icon:<CheckCircle2 className="w-4 h-4 text-emerald-600"/>, label:'Active' };
    case 'Online':       return { color:'text-green-600',   bg:'bg-green-50',    border:'border-green-200',   dot:'bg-green-400',   dotAnim:'',             icon:<Wifi         className="w-4 h-4 text-green-500"/>,   label:'Online' };
    case 'Device Error': return { color:'text-amber-600',   bg:'bg-amber-50',    border:'border-amber-200',   dot:'bg-amber-400',   dotAnim:'',             icon:<AlertCircle  className="w-4 h-4 text-amber-500"/>,  label:'Device Error' };
    case 'Offline':      return { color:'text-red-600',     bg:'bg-red-50',      border:'border-red-200',     dot:'bg-red-500',     dotAnim:'',             icon:<XCircle      className="w-4 h-4 text-red-500"/>,    label:'Offline' };
    default:             return { color:'text-slate-400',   bg:'bg-slate-100',   border:'border-slate-200',   dot:'bg-slate-300',   dotAnim:'',             icon:<Activity     className="w-4 h-4 text-slate-400"/>,  label:'Unknown' };
  }
};

// ─── STAT CARD (เหมือน IPManagementPage) ──────────────────────
const StatCard = ({ icon: Icon, title, value, color, onClick, isActive }) => (
  <div onClick={onClick}
    className={`bg-white rounded-2xl p-5 shadow-lg border transition-all
      ${onClick ? 'cursor-pointer hover:shadow-xl' : ''}
      ${isActive ? 'ring-2 ring-indigo-500 border-transparent scale-[1.02]' : 'border-slate-200'}`}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1">{title}</p>
        <h3 className="text-2xl font-black text-slate-900">{value}</h3>
      </div>
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
        <Icon className="w-5 h-5 text-white"/>
      </div>
    </div>
  </div>
);

// ─── DEVICE MODAL ─────────────────────────────────────────────
function DeviceModal({ device, switches, onClose, onSave }) {
  const isEdit = !!device;
  const [form, setForm] = useState({
    device_name:         device?.device_name         || '',
    ip_address:          device?.ip_address          || '',
    device_type:         device?.device_type         || 'NX-100',
    device_subtype:      device?.device_subtype      || '',
    location:            device?.location            || '',
    mac_address:         device?.mac_address         || '',
    connected_switch_id: device?.connected_switch_id || '',
    connected_tx_id:     device?.connected_tx_id     || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.device_name || !form.ip_address) return;
    setSaving(true);
    await onSave({
      ...form,
      connected_switch_id: form.connected_switch_id ? parseInt(form.connected_switch_id) : null,
      connected_tx_id:     form.connected_tx_id     ? parseInt(form.connected_tx_id)     : null,
    }, device?.id);
    setSaving(false);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white flex justify-between items-center">
            <h3 className="font-black text-lg">{isEdit ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่'}</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full"><X size={16}/></button>
          </div>
          <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
            {/* ชื่อ */}
            <div>
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">ชื่ออุปกรณ์ *</label>
              <input value={form.device_name} onChange={e => setForm(f=>({...f,device_name:e.target.value}))}
                placeholder="เช่น NX-100 อาคาร A"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"/>
            </div>
            {/* IP */}
            <div>
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">IP Address *</label>
              <input value={form.ip_address} onChange={e => setForm(f=>({...f,ip_address:e.target.value}))}
                placeholder="เช่น 10.194.121.237"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"/>
            </div>
            {/* MAC */}
            <div>
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">MAC Address</label>
              <input value={form.mac_address}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                  const formatted = raw.match(/.{1,2}/g)?.join(':').substring(0, 17) || '';
                  setForm(f => ({ ...f, mac_address: formatted }));
                }}
                placeholder="00:05:f9:11:68:30" maxLength={17}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"/>
              {form.mac_address?.length === 17 && (
                <p className="text-[11px] text-emerald-600 mt-1">✓ MAC Address ครบถ้วน</p>
              )}
            </div>
            {/* ประเภท */}
            <div>
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">ประเภท</label>
              <select value={form.device_type} onChange={e => setForm(f=>({...f,device_type:e.target.value,device_subtype:''}))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400">
                <option>NX-100</option>
                <option>Network Switch</option>
                <option>Other</option>
              </select>
            </div>
            {/* Subtype — เฉพาะ NX-100 */}
            {form.device_type === 'NX-100' && (
              <div>
                <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">ประเภทย่อย</label>
                <div className="flex gap-2">
                  {['Transmitter','Receiver'].map(sub => (
                    <button key={sub} type="button"
                      onClick={() => setForm(f=>({...f,device_subtype:f.device_subtype===sub?'':sub}))}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all
                        ${form.device_subtype===sub
                          ? sub==='Transmitter' ? 'bg-blue-600 text-white border-blue-600' : 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                      {sub==='Transmitter' ? '📡 Transmitter' : '🔊 Receiver'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Connected Switch — เฉพาะ TX */}
            {form.device_type === 'NX-100' && form.device_subtype === 'Transmitter' && (
              <div>
                <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">เชื่อมต่อกับ Switch</label>
                <select value={form.connected_switch_id} onChange={e => setForm(f=>({...f,connected_switch_id:e.target.value}))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400">
                  <option value="">— ยังไม่ได้เชื่อมต่อ —</option>
                  {switches.map(s => (
                    <option key={s.id} value={s.id}>{s.device_name} ({s.ip_address})</option>
                  ))}
                </select>
                {switches.length===0 && <p className="text-[11px] text-amber-500 mt-1">⚠ ยังไม่มี Network Switch</p>}
              </div>
            )}
            {/* Connected TX — เฉพาะ RX */}
            {form.device_type === 'NX-100' && form.device_subtype === 'Receiver' && (
              <div>
                <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">เชื่อมต่อกับ TX</label>
                <select value={form.connected_tx_id} onChange={e => setForm(f=>({...f,connected_tx_id:e.target.value}))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400">
                  <option value="">— ยังไม่ได้เชื่อมต่อ —</option>
                  {switches.filter(s => s.device_subtype === 'Transmitter').map(s => (
                    <option key={s.id} value={s.id}>{s.device_name} ({s.ip_address})</option>
                  ))}
                </select>
              </div>
            )}
            {/* สถานที่ */}
            <div>
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">สถานที่ติดตั้ง</label>
              <input value={form.location} onChange={e => setForm(f=>({...f,location:e.target.value}))}
                placeholder="เช่น ตู้ Rack ชั้น 2"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"/>
            </div>
          </div>
          <div className="flex gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
            <button onClick={onClose} className="flex-1 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">ยกเลิก</button>
            <button onClick={handleSave} disabled={saving||!form.device_name||!form.ip_address}
              className="flex-1 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
              {saving && <RefreshCw size={12} className="animate-spin"/>}
              {isEdit ? 'บันทึก' : 'เพิ่ม'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── DETAIL PANEL ─────────────────────────────────────────────
function DetailPanel({ device, devices, onClose, onPing, onCheckHttp, onEdit, onDelete }) {
  const [busy, setBusy] = useState(null);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"/>
            <div className="flex justify-between items-start relative z-10">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-0.5">Device Details</p>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-lg leading-tight">{device.device_name}</h3>
                  {device.device_subtype && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                      ${device.device_subtype==='Transmitter' ? 'bg-blue-500/30 text-white border-white/30' : 'bg-emerald-500/30 text-white border-white/30'}`}>
                      {device.device_subtype==='Transmitter' ? '📡 Transmitter' : '🔊 Receiver'}
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-white/80 mt-0.5">{device.ip_address}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onEdit(device)} className="p-1.5 hover:bg-white/20 rounded-full"><Edit2 size={14}/></button>
                <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full"><X size={16}/></button>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* 2 Status Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label:'Ping', status: device.ping_status||'Unknown' },
                { label:'HTTP', status: device.http_status||'Unknown' },
              ].map(({label, status}) => {
                const c = getStatusConfig(status);
                return (
                  <div key={label} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-medium text-sm ${c.bg} ${c.color} ${c.border}`}>
                    <div className={`w-2 h-2 rounded-full ${c.dot} ${c.dotAnim}`}/>
                    {label}: {status}
                  </div>
                );
              })}
            </div>
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Type</p>
                <p className="font-medium text-slate-700">{device.device_type}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Location</p>
                <p className="font-medium text-slate-700">{device.location||'-'}</p>
              </div>
            </div>
            {/* MAC */}
            {device.mac_address && (
              <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">MAC Address</p>
                <p className="font-mono text-sm text-slate-700">{device.mac_address}</p>
              </div>
            )}
            {/* Connected Switch */}
            {device.connected_switch_id && (() => {
              const sw = devices?.find(d => d.id === device.connected_switch_id);
              return sw ? (
                <div className="px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-0.5">Connected to Switch</p>
                  <p className="text-sm font-semibold text-blue-700">{sw.device_name}</p>
                  <p className="font-mono text-[11px] text-blue-500">{sw.ip_address}</p>
                </div>
              ) : null;
            })()}
            {/* Connected TX */}
            {device.connected_tx_id && (() => {
              const tx = devices?.find(d => d.id === device.connected_tx_id);
              return tx ? (
                <div className="px-3 py-2 bg-violet-50 rounded-lg border border-violet-100">
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-0.5">Connected to TX</p>
                  <p className="text-sm font-semibold text-violet-700">{tx.device_name}</p>
                  <p className="font-mono text-[11px] text-violet-500">{tx.ip_address}</p>
                </div>
              ) : null;
            })()}
            {/* Response Time */}
            {device.response_time_ms > 0 && (
              <p className="text-[12px] text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
                Response: <strong>{device.response_time_ms}ms</strong>
              </p>
            )}
            {/* Status legend */}
            <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-[11px] text-slate-500">
              {[
                {s:'Active',       desc:'Ping เจอ + HTTP ปกติ'},
                {s:'Online',       desc:'Ping เจอ แต่ยังไม่เทส HTTP'},
                {s:'Device Error', desc:'Ping เจอ แต่ HTTP ไม่ตอบ'},
                {s:'Offline',      desc:'Ping ไม่เจอ'},
              ].map(({s,desc}) => {
                const c = getStatusConfig(s);
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${c.dot}`}/>
                    <span className={`font-bold ${c.color}`}>{s}</span>
                    <span>— {desc}</span>
                  </div>
                );
              })}
            </div>
            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <button onClick={async()=>{setBusy('ping'); await onPing(device.id); setBusy(null);}}
                disabled={!!busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl disabled:opacity-50 hover:shadow-md transition-all shadow-sm">
                {busy==='ping'?<RefreshCw size={14} className="animate-spin"/>:<Zap size={14}/>} Ping Device
              </button>
              <button onClick={async()=>{setBusy('http'); await onCheckHttp(device.id); setBusy(null);}}
                disabled={!!busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl disabled:opacity-50 hover:shadow-md transition-all shadow-sm">
                {busy==='http'?<RefreshCw size={14} className="animate-spin"/>:<Network size={14}/>} Check HTTP
              </button>
              <button onClick={()=>{onDelete(device.id); onClose();}}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-xl transition-colors">
                <Trash2 size={14}/> ลบอุปกรณ์
              </button>
            </div>
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
            <button onClick={onClose} className="w-full py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Close</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── CANVAS VIEW ──────────────────────────────────────────────
// ─── CANVAS VIEW (Grid) ─────────────────────────────────────
// A2: TX Hub grouping — 1 TX แสดงรายการ RX ที่เชื่อมทั้งหมด
function CanvasView({ devices, onSelect, selectedId }) {
  const [collapsed, setCollapsed] = React.useState(new Set());

  const txList  = devices.filter(d => d.device_type === 'NX-100' && d.device_subtype === 'Transmitter');
  const rxList  = devices.filter(d => d.device_type === 'NX-100' && d.device_subtype === 'Receiver');
  const switches = devices.filter(d => d.device_type === 'Network Switch');
  const others  = devices.filter(d =>
    !(d.device_type === 'NX-100' && (d.device_subtype === 'Transmitter' || d.device_subtype === 'Receiver')) &&
    d.device_type !== 'Network Switch'
  );

  const switchById = Object.fromEntries(switches.map(s => [s.id, s]));

  const rxByTx = {};
  const unassignedRx = [];
  rxList.forEach(rx => {
    if (rx.connected_tx_id && txList.some(t => t.id === rx.connected_tx_id)) {
      (rxByTx[rx.connected_tx_id] = rxByTx[rx.connected_tx_id] || []).push(rx);
    } else {
      unassignedRx.push(rx);
    }
  });

  const toggle = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const StatusBadge = ({ status }) => {
    const c = getStatusConfig(status || 'Unknown');
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${c.bg} ${c.color} ${c.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${c.dotAnim}`} />
        {c.label}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-slate-700">TX Hubs — 1 TX เชื่อมได้หลาย RX</p>
        <p className="text-[11px] text-slate-400">{txList.length} TX · {rxList.length} RX</p>
      </div>

      {txList.map(tx => {
        const children = rxByTx[tx.id] || [];
        const sw = tx.connected_switch_id ? switchById[tx.connected_switch_id] : null;
        const isCollapsed = collapsed.has(tx.id);
        const hasOffline = children.some(rx => rx.ping_status === 'Offline' || rx.http_status === 'Offline');

        return (
          <div key={tx.id}
            className={`rounded-xl border overflow-hidden ${hasOffline ? 'border-red-200' : 'border-slate-200'}`}>
            <div
              onClick={() => toggle(tx.id)}
              className="flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none transition-colors">
              <span className="text-slate-400 text-xs w-3 text-center">{isCollapsed ? '▸' : '▾'}</span>
              <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">TX</span>
              <div className="min-w-0" onClick={(e) => { e.stopPropagation(); onSelect(tx.id); }}>
                <p className="font-bold text-sm text-slate-800 truncate hover:underline">{tx.device_name}</p>
                <p className="font-mono text-[11px] text-slate-400">
                  {tx.ip_address}{sw ? ` · via ${sw.device_name}` : ''}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={tx.http_status || tx.ping_status} />
                <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full ${hasOffline ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-violet-50 text-violet-600 border border-violet-200'}`}>
                  → {children.length} RX{hasOffline ? ' · มีปัญหา' : ''}
                </span>
              </div>
            </div>

            {!isCollapsed && (
              <div className="divide-y divide-slate-100">
                {children.length === 0 && (
                  <p className="px-4 py-3 text-[12px] text-slate-400 italic">ยังไม่มี RX เชื่อมต่อ</p>
                )}
                {children.map(rx => (
                  <div key={rx.id} onClick={() => onSelect(rx.id)}
                    className={`flex items-center gap-3 pl-10 pr-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors
                      ${selectedId === rx.id ? 'bg-indigo-50/60' : ''}`}>
                    <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">RX</span>
                    <p className="font-medium text-sm text-slate-700 min-w-[140px] truncate">{rx.device_name}</p>
                    <p className="font-mono text-[11px] text-slate-400 min-w-[120px]">{rx.ip_address}</p>
                    <div className="ml-auto flex items-center gap-1.5">
                      <StatusBadge status={rx.ping_status} />
                      <StatusBadge status={rx.http_status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {unassignedRx.length > 0 && (
        <div className="rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 text-[12px] font-bold text-amber-700">
            RX ที่ยังไม่ได้ผูกกับ TX ({unassignedRx.length})
          </div>
          <div className="divide-y divide-slate-100">
            {unassignedRx.map(rx => (
              <div key={rx.id} onClick={() => onSelect(rx.id)}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
                <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">RX</span>
                <p className="font-medium text-sm text-slate-700 min-w-[140px] truncate">{rx.device_name}</p>
                <p className="font-mono text-[11px] text-slate-400 min-w-[120px]">{rx.ip_address}</p>
                <div className="ml-auto flex items-center gap-1.5">
                  <StatusBadge status={rx.ping_status} />
                  <StatusBadge status={rx.http_status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div className="pt-2">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">อุปกรณ์อื่น ({others.length})</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {others.map(d => (
              <div key={d.id} onClick={() => onSelect(d.id)}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-slate-700 truncate">{d.device_name}</p>
                  <p className="font-mono text-[10px] text-slate-400">{d.ip_address}</p>
                </div>
                <StatusBadge status={d.ping_status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// ─── LIST VIEW ────────────────────────────────────────────────
function ListView({ devices, onSelect, selectedId }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <p className="text-sm font-bold text-slate-700">รายการอุปกรณ์ทั้งหมด</p>
        <p className="text-[11px] text-slate-400">{devices.length} เครื่อง</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">ชื่ออุปกรณ์</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3">MAC Address</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3">TX/RX</th>
              <th className="px-4 py-3">สถานที่</th>
              <th className="px-4 py-3">Ping</th>
              <th className="px-4 py-3">HTTP</th>
              <th className="px-4 py-3">Response</th>
              <th className="px-4 py-3">Last Checked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {devices.map(device => {
              const pingCfg = getStatusConfig(device.ping_status||'Unknown');
              const httpCfg = getStatusConfig(device.http_status||'Unknown');
              return (
                <tr key={device.id} onClick={()=>onSelect(device.id)}
                  className={`cursor-pointer hover:bg-slate-50 transition-colors
                    ${selectedId===device.id?'bg-indigo-50/50':''}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{device.device_name}</td>
                  <td className="px-4 py-3 font-mono text-slate-600 text-[12px]">{device.ip_address}</td>
                  <td className="px-4 py-3 font-mono text-slate-500 text-[11px]">{device.mac_address||'—'}</td>
                  <td className="px-4 py-3 text-slate-500">{device.device_type}</td>
                  <td className="px-4 py-3">
                    {device.device_subtype ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border
                        ${device.device_subtype==='Transmitter'
                          ? 'bg-blue-50 text-blue-600 border-blue-200'
                          : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                        {device.device_subtype==='Transmitter'?'📡 Transmitter':'🔊 Receiver'}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{device.location||'-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${pingCfg.bg} ${pingCfg.color} ${pingCfg.border}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${pingCfg.dot} ${pingCfg.dotAnim}`}/>
                      {device.ping_status||'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${httpCfg.bg} ${httpCfg.color} ${httpCfg.border}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${httpCfg.dot} ${httpCfg.dotAnim}`}/>
                      {device.http_status||'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                    {device.response_time_ms>0?`${device.response_time_ms}ms`:'—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-[11px]">
                    {device.last_checked ? new Date(device.last_checked).toLocaleString('th-TH') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function SoundLayout() {
  const [devices,    setDevices]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [selected,   setSelected]   = useState(null);
  const [search,     setSearch]     = useState('');
  const [toast,      setToast]      = useState(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [editDevice, setEditDevice] = useState(null);
  const [busyAll,    setBusyAll]    = useState(null);
  const [cardFilter, setCardFilter] = useState('all');
  const [editCanvas, setEditCanvas] = useState(false);
  const [alertModal, setAlertModal] = useState({ isOpen:false, type:'info', title:'', message:'' });

  const closeAlert = () => setAlertModal(prev=>({...prev,isOpen:false}));

  const showToast = (msg, type='success') => {
    setToast({ msg, type });
    setTimeout(()=>setToast(null), 3500);
  };

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/devices`);
      const data = await res.json();
      setDevices(data);
      setError(null);
    } catch { setError('Cannot connect to backend'); }
    setLoading(false);
  };

  const handleSaveDevice = async (form, id) => {
    try {
      const res  = await fetch(id ? `${API}/devices/${id}` : `${API}/devices`, {
        method: id?'PUT':'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAlertModal({ isOpen:true, type:'success', title:id?'แก้ไขสำเร็จ':'เพิ่มสำเร็จ',
        message: id ? `แก้ไข ${form.device_name} เรียบร้อย` : `เพิ่ม ${form.device_name} เรียบร้อย`,
        onConfirm: closeAlert });
      setShowAdd(false); setEditDevice(null);
      fetchDevices();
    } catch(err) { setAlertModal({ isOpen:true, type:'error', title:'เกิดข้อผิดพลาด', message:err.message, onConfirm:closeAlert }); }
  };

  const handleDelete = (id) => {
    const device = devices.find(d=>d.id===id);
    setAlertModal({
      isOpen:true, type:'danger',
      title:'ลบอุปกรณ์?',
      message:`ยืนยันลบ "${device?.device_name}"? ไม่สามารถย้อนกลับได้`,
      confirmText:'ลบ', cancelText:'ยกเลิก',
      onConfirm: async () => {
        try {
          await fetch(`${API}/devices/${id}`, {method:'DELETE'});
          closeAlert();
          setAlertModal({ isOpen:true, type:'success', title:'ลบเรียบร้อย',
            message:`ลบ "${device?.device_name}" สำเร็จ`, onConfirm:closeAlert });
          fetchDevices();
        } catch { setAlertModal({ isOpen:true, type:'error', title:'ลบไม่สำเร็จ', message:'เกิดข้อผิดพลาด', onConfirm:closeAlert }); }
      },
      onCancel: closeAlert,
    });
  };

  const handlePing = async (id) => {
    try {
      const res  = await fetch(`${API}/devices/${id}/ping`, {method:'POST'});
      const data = await res.json();
      setAlertModal({ isOpen:true, type:data.alive?'success':'error',
        title:data.alive?'Ping สำเร็จ':'Ping ไม่สำเร็จ', message:data.message, onConfirm:closeAlert });
      fetchDevices();
    } catch { setAlertModal({ isOpen:true, type:'error', title:'Ping Error', message:'ไม่สามารถ Ping ได้', onConfirm:closeAlert }); }
  };

  const handleCheckHttp = async (id) => {
    try {
      const res  = await fetch(`${API}/devices/${id}/check-http`, {method:'POST'});
      const data = await res.json();
      setAlertModal({ isOpen:true, type:data.success?'success':'error',
        title:data.success?'HTTP Active':'HTTP Error', message:data.message, onConfirm:closeAlert });
      fetchDevices();
    } catch { setAlertModal({ isOpen:true, type:'error', title:'HTTP Error', message:'ไม่สามารถเช็ค HTTP ได้', onConfirm:closeAlert }); }
  };

  const handlePingAll = async () => {
    setBusyAll('ping');
    showToast(`⏳ กำลัง Ping ${devices.length} เครื่อง...`, 'info');
    try {
      const res  = await fetch(`${API}/devices/ping-all`, {method:'POST'});
      const data = await res.json();
      setAlertModal({ isOpen:true, type:'success', title:'Ping All เสร็จสิ้น',
        message:`Online: ${data.online} | Offline: ${data.offline} | ทั้งหมด: ${data.total}`, onConfirm:closeAlert });
      fetchDevices();
    } catch { setAlertModal({ isOpen:true, type:'error', title:'Ping All ไม่สำเร็จ', message:'เกิดข้อผิดพลาด', onConfirm:closeAlert }); }
    setBusyAll(null);
  };

  const handleCheckAll = async () => {
    setBusyAll('http');
    showToast(`⏳ กำลัง Check HTTP ${devices.length} เครื่อง...`, 'info');
    try {
      const res  = await fetch(`${API}/devices/check-all`, {method:'POST'});
      const data = await res.json();
      setAlertModal({ isOpen:true, type:'success', title:'Check All เสร็จสิ้น',
        message:`Active: ${data.active} | Error: ${data.deviceError} | Offline: ${data.offline}`, onConfirm:closeAlert });
      fetchDevices();
    } catch { setAlertModal({ isOpen:true, type:'error', title:'Check All ไม่สำเร็จ', message:'เกิดข้อผิดพลาด', onConfirm:closeAlert }); }
    setBusyAll(null);
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = devices.filter(d => {
    const matchSearch = d.device_name.toLowerCase().includes(search.toLowerCase()) || d.ip_address.includes(search);
    const matchCard =
      cardFilter==='all' ||
      (cardFilter==='active'  && d.http_status==='Active') ||
      (cardFilter==='online'  && d.ping_status==='Online') ||
      (cardFilter==='offline' && (d.ping_status==='Offline' || d.http_status==='Offline')) ||
      (cardFilter==='error'   && d.http_status==='Device Error');
    return matchSearch && matchCard;
  });

  const selectedDevice = devices.find(d=>d.id===selected);
  const counts = {
    total:   devices.length,
    active:  devices.filter(d=>d.http_status==='Active').length,
    online:  devices.filter(d=>d.ping_status==='Online'&&d.http_status!=='Active').length,
    offline: devices.filter(d=>d.ping_status==='Offline').length,
    error:   devices.filter(d=>d.http_status==='Device Error').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-black text-slate-800">SOUND LAYOUT</h2>
        <p className="text-slate-500 font-medium text-sm">ติดตามสถานะและจัดการ TOA NX-100 Network Audio</p>
      </div>

      {/* Stat Cards — เหมือน IPManagementPage */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Server}        title="Total Devices" value={counts.total}   color="from-slate-600 to-slate-700"/>
        <StatCard icon={CheckCircle}   title="Active"        value={counts.active}  color="from-emerald-500 to-emerald-600"
          onClick={()=>setCardFilter(f=>f==='active'?'all':'active')}   isActive={cardFilter==='active'}/>
        <StatCard icon={Wifi}          title="Online"        value={counts.online}  color="from-green-400 to-green-500"
          onClick={()=>setCardFilter(f=>f==='online'?'all':'online')}   isActive={cardFilter==='online'}/>
        <StatCard icon={AlertCircle}   title="Device Error"  value={counts.error}   color={counts.error>0?'from-amber-500 to-amber-600':'from-slate-400 to-slate-500'}
          onClick={()=>setCardFilter(f=>f==='error'?'all':'error')}     isActive={cardFilter==='error'}/>
        <StatCard icon={XCircle}       title="Offline"       value={counts.offline} color={counts.offline>0?'from-red-500 to-red-600':'from-slate-400 to-slate-500'}
          onClick={()=>setCardFilter(f=>f==='offline'?'all':'offline')} isActive={cardFilter==='offline'}/>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="text" placeholder="ค้นหา ชื่อ หรือ IP..."
          value={search} onChange={e=>setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-4 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 shadow-sm"/>
        <button onClick={()=>setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white text-sm font-bold rounded-xl hover:shadow-md shadow-sm transition-all">
          <Plus size={14}/> เพิ่มอุปกรณ์
        </button>
        <button onClick={handlePingAll} disabled={!!busyAll||!devices.length}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold rounded-xl hover:shadow-md shadow-sm disabled:opacity-50 transition-all">
          {busyAll==='ping'?<RefreshCw size={14} className="animate-spin"/>:<Zap size={14}/>} Ping All
        </button>
        <button onClick={handleCheckAll} disabled={!!busyAll||!devices.length}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-md shadow-sm disabled:opacity-50 transition-all">
          {busyAll==='http'?<RefreshCw size={14} className="animate-spin"/>:<Network size={14}/>} Check HTTP All
        </button>
        <button onClick={fetchDevices} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm">
          <RefreshCw size={14} className={loading?'animate-spin':''}/> Refresh
        </button>

        <div className="w-px h-6 bg-slate-200"/>

        <button onClick={() => setEditCanvas(v => !v)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border transition-all shadow-sm
            ${editCanvas
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
          <Edit2 size={14}/> {editCanvas ? 'Done' : 'Edit Layout'}
        </button>
        {editCanvas && (
          <button onClick={() => setEditCanvas(false)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 text-sm font-bold rounded-xl hover:border-red-300 hover:text-red-500 transition-all shadow-sm"
            id="canvas-reset-btn">
            <RefreshCw size={14}/> Reset
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Canvas */}
      {!error && (
        loading && !devices.length ? (
          <div className="flex items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
            <motion.div animate={{rotate:360}} transition={{duration:1, repeat:Infinity, ease:'linear'}}
              className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full"/>
          </div>
        ) : (
          <CanvasView devices={filtered} onSelect={setSelected} selectedId={selected}
            editMode={editCanvas} onToggleEdit={() => setEditCanvas(v=>!v)}
            onReset={() => document.getElementById('canvas-reset-btn')?.click()}/>
        )
      )}

      {/* List */}
      {!error && filtered.length>0 && (
        <ListView devices={filtered} onSelect={setSelected} selectedId={selected}/>
      )}

      {/* Modals */}
      {(showAdd||editDevice) && (
        <DeviceModal
          device={editDevice}
          switches={[
            ...devices.filter(d=>d.device_type==='Network Switch'),
            ...devices.filter(d=>d.device_type==='NX-100'&&d.device_subtype==='Transmitter'),
          ]}
          onClose={()=>{setShowAdd(false); setEditDevice(null);}}
          onSave={handleSaveDevice}
        />
      )}
      {selectedDevice && !editDevice && (
        <DetailPanel
          device={selectedDevice}
          devices={devices}
          onClose={()=>setSelected(null)}
          onPing={handlePing}
          onCheckHttp={handleCheckHttp}
          onEdit={(d)=>{setSelected(null); setEditDevice(d);}}
          onDelete={handleDelete}
        />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div key="toast" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}
            className={`fixed bottom-5 right-5 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-bold text-white
              ${toast.type==='error'?'bg-red-500 shadow-red-200':toast.type==='info'?'bg-blue-500 shadow-blue-200':'bg-emerald-600 shadow-emerald-200'}`}>
            {toast.type==='error'?<X size={14}/>:<CheckCircle size={14}/>}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        confirmText={alertModal.confirmText||'ตกลง'}
        cancelText={alertModal.cancelText||'ยกเลิก'}
        onConfirm={alertModal.onConfirm||closeAlert}
        onCancel={alertModal.onCancel}
      />
    </div>
  );
}