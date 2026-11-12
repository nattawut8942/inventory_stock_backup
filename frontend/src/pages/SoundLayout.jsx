/**
 * SoundLayout.jsx — SOUND ENGINEERING
 * ติดตามสถานะอุปกรณ์ TOA NX-100 (TX / RX) และ Network Switch
 * - Topology: Switch → TX → RX
 * - List: ตารางอุปกรณ์ทั้งหมด
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, CheckCircle2, XCircle,
  Network, X, Zap, RefreshCw, Plus, Edit2, Trash2, Wifi,
  Server, CheckCircle
} from 'lucide-react';
import { API_BASE } from '../config/api.js';
import Portal from '../components/Portal.jsx';
import AlertModal from '../components/AlertModal.jsx';

const API = `${API_BASE}/sound`;

// ─── BUTTON SYSTEM ────────────────────────────────────────────
// primary = การกระทำหลัก, secondary = การกระทำรอง, danger = การลบ
const BTN_PRIMARY   = 'flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-sm disabled:opacity-50 transition-colors';
const BTN_SECONDARY = 'flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-sm disabled:opacity-50 transition-colors';

// ─── STATUS CONFIG ─────────────────────────────────────────────
const getStatusConfig = (status) => {
  switch (status) {
    case 'Active':       return { color:'text-emerald-700', bg:'bg-emerald-100', border:'border-emerald-300', dot:'bg-emerald-500', dotAnim:'animate-pulse', icon:<CheckCircle2 className="w-4 h-4 text-emerald-600"/>, label:'Active' };
    case 'Online':       return { color:'text-sky-700',     bg:'bg-sky-50',      border:'border-sky-200',     dot:'bg-sky-400',     dotAnim:'',             icon:<Wifi         className="w-4 h-4 text-sky-500"/>,     label:'Online' };
    case 'Device Error': return { color:'text-amber-600',   bg:'bg-amber-50',    border:'border-amber-200',   dot:'bg-amber-400',   dotAnim:'',             icon:<AlertCircle  className="w-4 h-4 text-amber-500"/>,  label:'Device Error' };
    case 'Offline':      return { color:'text-red-600',     bg:'bg-red-50',      border:'border-red-200',     dot:'bg-red-500',     dotAnim:'',             icon:<XCircle      className="w-4 h-4 text-red-500"/>,    label:'Offline' };
    default:             return { color:'text-slate-400',   bg:'bg-slate-100',   border:'border-slate-200',   dot:'bg-slate-300',   dotAnim:'',             icon:<Activity     className="w-4 h-4 text-slate-400"/>,  label:'Unknown' };
  }
};

const StatusBadge = ({ status }) => {
  const c = getStatusConfig(status || 'Unknown');
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${c.bg} ${c.color} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${c.dotAnim}`} />
      {c.label}
    </span>
  );
};

const ROLE_STYLE = {
  SW: 'bg-slate-100 text-slate-600 border-slate-300',
  TX: 'bg-blue-50 text-blue-600 border-blue-200',
  RX: 'bg-emerald-50 text-emerald-600 border-emerald-200',
};

// ─── STAT CARD ────────────────────────────────────────────────
const StatCard = ({ icon: Icon, title, value, color, onClick, isActive }) => (
  <div onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }) : undefined}
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
            <div>
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">ชื่ออุปกรณ์ *</label>
              <input value={form.device_name} onChange={e => setForm(f=>({...f,device_name:e.target.value}))}
                placeholder="เช่น NX-100 อาคาร A"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"/>
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">IP Address *</label>
              <input value={form.ip_address} onChange={e => setForm(f=>({...f,ip_address:e.target.value}))}
                placeholder="เช่น 10.194.121.237"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"/>
            </div>
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
            <div>
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">ประเภท</label>
              <select value={form.device_type} onChange={e => setForm(f=>({...f,device_type:e.target.value,device_subtype:''}))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400">
                <option>NX-100</option>
                <option>Network Switch</option>
                <option>Other</option>
              </select>
            </div>
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
            <div>
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">สถานที่ติดตั้ง</label>
              <input value={form.location} onChange={e => setForm(f=>({...f,location:e.target.value}))}
                placeholder="เช่น ตู้ Rack ชั้น 2"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"/>
            </div>
          </div>
          <div className="flex gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
            <button onClick={onClose} className={`flex-1 ${BTN_SECONDARY}`}>ยกเลิก</button>
            <button onClick={handleSave} disabled={saving||!form.device_name||!form.ip_address}
              className={`flex-1 ${BTN_PRIMARY}`}>
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
  const sw = device.connected_switch_id ? devices?.find(d => d.id === device.connected_switch_id) : null;
  const tx = device.connected_tx_id     ? devices?.find(d => d.id === device.connected_tx_id)     : null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"/>
            <div className="flex justify-between items-start relative z-10">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-0.5">รายละเอียดอุปกรณ์</p>
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
                <button onClick={() => onEdit(device)} aria-label="แก้ไข" className="p-1.5 hover:bg-white/20 rounded-full"><Edit2 size={14}/></button>
                <button onClick={onClose} aria-label="ปิด" className="p-1.5 hover:bg-white/20 rounded-full"><X size={16}/></button>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-4">
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
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">ประเภท</p>
                <p className="font-medium text-slate-700">{device.device_type}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">สถานที่</p>
                <p className="font-medium text-slate-700">{device.location||'-'}</p>
              </div>
            </div>
            {device.mac_address && (
              <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">MAC Address</p>
                <p className="font-mono text-sm text-slate-700">{device.mac_address}</p>
              </div>
            )}
            {sw && (
              <div className="px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-0.5">เชื่อมต่อกับ Switch</p>
                <p className="text-sm font-semibold text-blue-700">{sw.device_name}</p>
                <p className="font-mono text-[11px] text-blue-500">{sw.ip_address}</p>
              </div>
            )}
            {tx && (
              <div className="px-3 py-2 bg-violet-50 rounded-lg border border-violet-100">
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-0.5">เชื่อมต่อกับ TX</p>
                <p className="text-sm font-semibold text-violet-700">{tx.device_name}</p>
                <p className="font-mono text-[11px] text-violet-500">{tx.ip_address}</p>
              </div>
            )}
            {device.response_time_ms > 0 && (
              <p className="text-[12px] text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
                ตอบสนอง: <strong>{device.response_time_ms}ms</strong>
              </p>
            )}
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
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <button onClick={async()=>{setBusy('ping'); await onPing(device.id); setBusy(null);}}
                disabled={!!busy} className={`w-full py-2.5 ${BTN_SECONDARY}`}>
                {busy==='ping'?<RefreshCw size={14} className="animate-spin"/>:<Zap size={14}/>} Ping อุปกรณ์
              </button>
              <button onClick={async()=>{setBusy('http'); await onCheckHttp(device.id); setBusy(null);}}
                disabled={!!busy} className={`w-full py-2.5 ${BTN_SECONDARY}`}>
                {busy==='http'?<RefreshCw size={14} className="animate-spin"/>:<Network size={14}/>} ตรวจ HTTP
              </button>
              <button onClick={()=>{onDelete(device.id); onClose();}}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-xl transition-colors">
                <Trash2 size={14}/> ลบอุปกรณ์
              </button>
            </div>
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
            <button onClick={onClose} className={`w-full ${BTN_SECONDARY}`}>ปิด</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── DEVICE NODE (การ์ดในแผนผัง) ───────────────────────────────
function DeviceNode({ device, role, selected, onSelect }) {
  const issue = device.ping_status === 'Offline' || device.http_status === 'Offline' || device.http_status === 'Device Error';
  return (
    <button type="button" onClick={() => onSelect(device.id)}
      className={`text-left w-full min-w-0 rounded-xl border bg-white px-3 py-2.5 shadow-sm transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
        ${selected ? 'ring-2 ring-indigo-400 border-indigo-300' : issue ? 'border-red-200' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ROLE_STYLE[role]}`}>{role}</span>
        <StatusBadge status={device.ping_status} />
      </div>
      <p className="font-semibold text-sm text-slate-800 truncate">{device.device_name}</p>
      <p className="font-mono text-[11px] text-slate-400 truncate">{device.ip_address}</p>
      <div className="mt-1.5"><StatusBadge status={device.http_status} /></div>
    </button>
  );
}

// ─── TOPOLOGY VIEW (Switch → TX → RX) ─────────────────────────
function TopologyView({ devices, onSelect, selectedId }) {
  const isTx = d => d.device_type === 'NX-100' && d.device_subtype === 'Transmitter';
  const isRx = d => d.device_type === 'NX-100' && d.device_subtype === 'Receiver';
  const isSw = d => d.device_type === 'Network Switch';

  const txList   = devices.filter(isTx);
  const rxList   = devices.filter(isRx);
  const switches = devices.filter(isSw);
  const others   = devices.filter(d => !isTx(d) && !isRx(d) && !isSw(d));

  const rxByTx = {};
  const unassignedRx = [];
  rxList.forEach(rx => {
    if (rx.connected_tx_id && txList.some(t => t.id === rx.connected_tx_id)) {
      if (!rxByTx[rx.connected_tx_id]) rxByTx[rx.connected_tx_id] = [];
      rxByTx[rx.connected_tx_id].push(rx);
    } else {
      unassignedRx.push(rx);
    }
  });

  const groups = switches.map(sw => ({
    sw,
    txs: txList.filter(t => t.connected_switch_id === sw.id),
  }));
  const orphanTx = txList.filter(t => !switches.some(s => s.id === t.connected_switch_id));

  const TxBranch = ({ tx }) => {
    const children = rxByTx[tx.id] || [];
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="w-full sm:w-56 flex-shrink-0">
          <DeviceNode device={tx} role="TX" selected={selectedId === tx.id} onSelect={onSelect} />
        </div>
        <div className="hidden sm:block w-8 h-px bg-slate-300 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex flex-wrap gap-2">
          {children.length === 0 && (
            <p className="text-[12px] text-slate-400 italic self-center">ยังไม่มี RX เชื่อมต่อ</p>
          )}
          {children.map(rx => (
            <div key={rx.id} className="w-full sm:w-56">
              <DeviceNode device={rx} role="RX" selected={selectedId === rx.id} onSelect={onSelect} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hasAny = txList.length + rxList.length + switches.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-700">แผนผังการเชื่อมต่อ · Switch → TX → RX</p>
        <p className="text-[11px] text-slate-400">{switches.length} Switch · {txList.length} TX · {rxList.length} RX</p>
      </div>

      {!hasAny && (
        <p className="text-sm text-slate-400 text-center py-6">ยังไม่มีอุปกรณ์ที่แสดงในแผนผัง</p>
      )}

      {groups.map(({ sw, txs }) => (
        <div key={sw.id} className="rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="w-full sm:w-56">
            <DeviceNode device={sw} role="SW" selected={selectedId === sw.id} onSelect={onSelect} />
          </div>
          <div className="pl-4 ml-4 border-l-2 border-dashed border-slate-300 space-y-4">
            {txs.length === 0 && (
              <p className="text-[12px] text-slate-400 italic">ยังไม่มี TX เชื่อมต่อกับ Switch นี้</p>
            )}
            {txs.map(tx => <TxBranch key={tx.id} tx={tx} />)}
          </div>
        </div>
      ))}

      {orphanTx.length > 0 && (
        <div className="rounded-xl border border-amber-200 p-4 space-y-4">
          <p className="text-[12px] font-bold text-amber-700">TX ที่ยังไม่ได้เชื่อมกับ Switch ({orphanTx.length})</p>
          {orphanTx.map(tx => <TxBranch key={tx.id} tx={tx} />)}
        </div>
      )}

      {unassignedRx.length > 0 && (
        <div className="rounded-xl border border-amber-200 p-4 space-y-3">
          <p className="text-[12px] font-bold text-amber-700">RX ที่ยังไม่ได้ผูกกับ TX ({unassignedRx.length})</p>
          <div className="flex flex-wrap gap-2">
            {unassignedRx.map(rx => (
              <div key={rx.id} className="w-full sm:w-56">
                <DeviceNode device={rx} role="RX" selected={selectedId === rx.id} onSelect={onSelect} />
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
              <button type="button" key={d.id} onClick={() => onSelect(d.id)}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 text-left hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-slate-700 truncate">{d.device_name}</p>
                  <p className="font-mono text-[10px] text-slate-400">{d.ip_address}</p>
                </div>
                <StatusBadge status={d.ping_status} />
              </button>
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
              <th className="px-4 py-3 hidden md:table-cell">MAC Address</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3">บทบาท</th>
              <th className="px-4 py-3">สถานที่</th>
              <th className="px-4 py-3">Ping</th>
              <th className="px-4 py-3">HTTP</th>
              <th className="px-4 py-3 hidden md:table-cell">ตอบสนอง</th>
              <th className="px-4 py-3">ตรวจล่าสุด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {devices.map(device => (
              <tr key={device.id} onClick={()=>onSelect(device.id)} tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onSelect(device.id); }}
                className={`cursor-pointer hover:bg-slate-50 transition-colors focus:outline-none focus-visible:bg-indigo-50
                  ${selectedId===device.id?'bg-indigo-50/50':''}`}>
                <td className="px-4 py-3 font-medium text-slate-900">{device.device_name}</td>
                <td className="px-4 py-3 font-mono text-slate-600 text-[12px]">{device.ip_address}</td>
                <td className="px-4 py-3 font-mono text-slate-500 text-[11px] hidden md:table-cell">{device.mac_address||'—'}</td>
                <td className="px-4 py-3 text-slate-500">{device.device_type}</td>
                <td className="px-4 py-3">
                  {device.device_subtype ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border
                      ${device.device_subtype==='Transmitter' ? ROLE_STYLE.TX : ROLE_STYLE.RX}`}>
                      {device.device_subtype==='Transmitter'?'📡 Transmitter':'🔊 Receiver'}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{device.location||'-'}</td>
                <td className="px-4 py-3"><StatusBadge status={device.ping_status} /></td>
                <td className="px-4 py-3"><StatusBadge status={device.http_status} /></td>
                <td className="px-4 py-3 text-slate-500 font-mono text-[11px] hidden md:table-cell">
                  {device.response_time_ms>0?`${device.response_time_ms}ms`:'—'}
                </td>
                <td className="px-4 py-3 text-slate-400 text-[11px]">
                  {device.last_checked ? new Date(device.last_checked).toLocaleString('th-TH') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SkeletonBlock = ({ className }) => (
  <div className={`bg-slate-200/70 animate-pulse rounded-xl ${className}`} />
);

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function SoundLayout() {
  const [devices,    setDevices]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [selected,   setSelected]   = useState(null);
  const [search,     setSearch]     = useState('');
  const [toast,      setToast]      = useState(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [editDevice, setEditDevice] = useState(null);
  const [busyAll,    setBusyAll]    = useState(null);
  const [cardFilter, setCardFilter] = useState('all');
  const [alertModal, setAlertModal] = useState({ isOpen:false, type:'info', title:'', message:'' });
  const [lastUpdated, setLastUpdated] = useState(null);

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
      setLastUpdated(new Date());
      setError(null);
    } catch { setError('ไม่สามารถเชื่อมต่อ backend ได้'); }
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
    } catch { setAlertModal({ isOpen:true, type:'error', title:'Ping ไม่สำเร็จ', message:'ไม่สามารถ Ping ได้', onConfirm:closeAlert }); }
  };

  const handleCheckHttp = async (id) => {
    try {
      const res  = await fetch(`${API}/devices/${id}/check-http`, {method:'POST'});
      const data = await res.json();
      setAlertModal({ isOpen:true, type:data.success?'success':'error',
        title:data.success?'HTTP ปกติ':'HTTP ไม่ตอบสนอง', message:data.message, onConfirm:closeAlert });
      fetchDevices();
    } catch { setAlertModal({ isOpen:true, type:'error', title:'ตรวจ HTTP ไม่สำเร็จ', message:'ไม่สามารถเช็ค HTTP ได้', onConfirm:closeAlert }); }
  };

  const handlePingAll = async () => {
    setBusyAll('ping');
    showToast(`กำลัง Ping ${devices.length} เครื่อง...`, 'info');
    try {
      const res  = await fetch(`${API}/devices/ping-all`, {method:'POST'});
      const data = await res.json();
      showToast(`Ping ทั้งหมดเสร็จ — Online: ${data.online} | Offline: ${data.offline} | ทั้งหมด: ${data.total}`, 'success');
      fetchDevices();
    } catch { showToast('Ping ทั้งหมดไม่สำเร็จ', 'error'); }
    setBusyAll(null);
  };

  const handleCheckAll = async () => {
    setBusyAll('http');
    showToast(`กำลังตรวจ HTTP ${devices.length} เครื่อง...`, 'info');
    try {
      const res  = await fetch(`${API}/devices/check-all`, {method:'POST'});
      const data = await res.json();
      showToast(`ตรวจ HTTP ทั้งหมดเสร็จ — Active: ${data.active} | Error: ${data.deviceError} | Offline: ${data.offline}`, 'success');
      fetchDevices();
    } catch { showToast('ตรวจ HTTP ทั้งหมดไม่สำเร็จ', 'error'); }
    setBusyAll(null);
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = devices.filter(d => {
    const matchSearch = (d.device_name||'').toLowerCase().includes(search.toLowerCase()) || (d.ip_address||'').includes(search);
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
  const FILTER_LABEL = { active:'Active', online:'Online', offline:'Offline', error:'Device Error' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-black text-slate-800">SOUND ENGINEERING</h2>
        <p className="text-slate-500 font-medium text-sm">
          ติดตามสถานะและจัดการ TOA NX-100 Network Audio
          {lastUpdated && <span className="ml-2 text-slate-400">· อัปเดตล่าสุด {lastUpdated.toLocaleTimeString('th-TH')}</span>}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Server}        title="อุปกรณ์ทั้งหมด" value={counts.total}   color="from-slate-600 to-slate-700"/>
        <StatCard icon={CheckCircle}   title="Active"        value={counts.active}  color="from-emerald-500 to-emerald-600"
          onClick={()=>setCardFilter(f=>f==='active'?'all':'active')}   isActive={cardFilter==='active'}/>
        <StatCard icon={Wifi}          title="Online"        value={counts.online}  color="from-sky-400 to-sky-500"
          onClick={()=>setCardFilter(f=>f==='online'?'all':'online')}   isActive={cardFilter==='online'}/>
        <StatCard icon={AlertCircle}   title="Device Error"  value={counts.error}   color={counts.error>0?'from-amber-500 to-amber-600':'from-slate-400 to-slate-500'}
          onClick={()=>setCardFilter(f=>f==='error'?'all':'error')}     isActive={cardFilter==='error'}/>
        <StatCard icon={XCircle}       title="Offline"       value={counts.offline} color={counts.offline>0?'from-red-500 to-red-600':'from-slate-400 to-slate-500'}
          onClick={()=>setCardFilter(f=>f==='offline'?'all':'offline')} isActive={cardFilter==='offline'}/>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="text" placeholder="ค้นหาชื่อหรือ IP..."
          value={search} onChange={e=>setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-4 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 shadow-sm"/>
        <button onClick={()=>setShowAdd(true)} className={BTN_PRIMARY}>
          <Plus size={14}/> เพิ่มอุปกรณ์
        </button>
        <button onClick={handlePingAll} disabled={!!busyAll||!devices.length} className={BTN_SECONDARY}>
          {busyAll==='ping'?<RefreshCw size={14} className="animate-spin"/>:<Zap size={14}/>} Ping ทั้งหมด
        </button>
        <button onClick={handleCheckAll} disabled={!!busyAll||!devices.length} className={BTN_SECONDARY}>
          {busyAll==='http'?<RefreshCw size={14} className="animate-spin"/>:<Network size={14}/>} ตรวจ HTTP ทั้งหมด
        </button>
        <button onClick={fetchDevices} disabled={loading} className={BTN_SECONDARY}>
          <RefreshCw size={14} className={loading?'animate-spin':''}/> รีเฟรช
        </button>
      </div>

      {/* Active filter chip */}
      {cardFilter !== 'all' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">กำลังกรอง:</span>
          <button onClick={() => setCardFilter('all')}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-xs hover:bg-indigo-100">
            {FILTER_LABEL[cardFilter]}
            <X size={12}/> ล้างตัวกรอง
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          <strong>เกิดข้อผิดพลาด:</strong> {error}
        </div>
      )}

      {!error && (
        loading && devices.length === 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0,1,2].map(i => <SkeletonBlock key={i} className="h-40 rounded-2xl"/>)}
            </div>
            <SkeletonBlock className="h-64 rounded-2xl"/>
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
            <Server className="w-10 h-10 text-slate-300 mb-3"/>
            <p className="font-bold text-slate-700">ยังไม่มีอุปกรณ์ในระบบ</p>
            <p className="text-sm text-slate-400 mb-4">เพิ่ม TOA NX-100 และ Network Switch เพื่อเริ่มติดตามสถานะ</p>
            <button onClick={()=>setShowAdd(true)} className={BTN_PRIMARY}>
              <Plus size={14}/> เพิ่มอุปกรณ์แรก
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center text-center py-12 bg-white rounded-2xl border border-slate-200">
            <p className="font-bold text-slate-700">ไม่พบอุปกรณ์ที่ตรงกับการค้นหาหรือตัวกรอง</p>
            <button onClick={()=>{setSearch(''); setCardFilter('all');}} className="mt-3 text-sm font-bold text-indigo-600 hover:underline">
              ล้างการค้นหาและตัวกรอง
            </button>
          </div>
        ) : (
          <TopologyView devices={filtered} onSelect={setSelected} selectedId={selected}/>
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
