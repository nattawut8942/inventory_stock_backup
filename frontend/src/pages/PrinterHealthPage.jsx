import { Link } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { useCanAct } from '../context/PermissionContext';
import { Printer, AlertTriangle, Wifi, WifiOff, RefreshCw, Droplet, Plus, X, History, Clock, Pencil, Factory as FactoryIcon, LayoutGrid, List as ListIcon, Search, Usb, Network } from 'lucide-react';
import { motion } from 'framer-motion';
import { API_BASE, API_URL } from '../config/api';
import Portal from '../components/Portal';
import PhotoSlot from '../components/PhotoSlot';
import ConnectionBadge from '../components/ConnectionBadge';
import PrinterThumb from '../components/PrinterThumb';
import CopyButton from '../components/CopyButton';
import StatusBadge from '../components/StatusBadge';
import { PageSkeleton } from '../components/Skeleton';
import { toast } from '../components/Toast';
import { confirmDialog } from '../components/ConfirmDialog';
import { getTonerType, tonerGradient, tonerIconColor } from '../utils/tonerColor';
import { formatThaiDate } from '../utils/formatDate';

// backend เก็บเวลาเป็น UTC (SYSUTCDATETIME) แต่บางจุด driver คืนมาเป็น string ดิบ
// (เช่น "2026-08-20 02:37:02.6892740" ไม่มี T, ไม่มี Z, เศษวินาทีเกิน 3 หลัก)
// ฟังก์ชันนี้ normalize ให้เป็น ISO ที่ถูกต้องก่อนส่งเข้า formatThaiDate
const toUtcIso = (raw) => {
    if (!raw) return raw;
    if (raw instanceof Date) return raw.toISOString();
    if (typeof raw === 'string' && !raw.includes('Z') && !raw.includes('+')) {
        let iso = raw.replace(' ', 'T');
        iso = iso.replace(/(\.\d{3})\d+/, '$1');
        if (!iso.includes('.')) iso += '.000';
        return iso + 'Z';
    }
    return raw;
};

const AddPrinterModal = ({ printer, onClose, onSaved }) => {
    const isEdit = Boolean(printer);
    const [form, setForm] = useState({
        IpAddress: printer?.IpAddress || '',
        Name: printer?.Name || '',
        Model: printer?.Model || '',
        Location: printer?.Location || '',
        Factory: printer?.Factory || '',
        ConnectionType: printer?.ConnectionType === 'usb' ? 'usb' : 'ethernet',
        UsbHost: printer?.UsbHost || '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [factories, setFactories] = useState([]);

    useEffect(() => {
        fetch(`${API_BASE}/printer-health/meta/factories`)
            .then(res => res.ok ? res.json() : [])
            .then(setFactories)
            .catch(() => setFactories([]));
    }, []);

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!form.IpAddress.trim() || !form.Name.trim()) {
            setError('กรุณากรอก IP และชื่อเครื่อง');
            return;
        }
        if (form.ConnectionType === 'usb' && !form.UsbHost.trim()) {
            setError('เลือก USB ต้องระบุชื่อคอมพิวเตอร์ที่เครื่องพรินเตอร์ต่ออยู่');
            return;
        }

        setSaving(true);
        try {
            const url = isEdit ? `${API_BASE}/printer-health/${printer.PrinterId}` : `${API_BASE}/printer-health`;
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'บันทึกไม่สำเร็จ');
            }
            toast.success(isEdit ? 'บันทึกการแก้ไขข้อมูลเครื่องแล้ว' : 'เพิ่มเครื่องพรินเตอร์แล้ว');
            onSaved();
        } catch (err) {
            toast.error(err.message); // ข้อผิดพลาดจากเซิร์ฟเวอร์แสดงเป็น toast (ข้อผิดพลาดของฟิลด์ยังแสดงในฟอร์ม)
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-lg text-slate-800">{isEdit ? 'แก้ไขเครื่องพรินเตอร์' : 'เพิ่มเครื่องพรินเตอร์'}</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-slate-600 block mb-1">IP Address *</label>
                            <input
                                name="IpAddress" value={form.IpAddress} onChange={handleChange}
                                placeholder="10.194.164.202"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 block mb-1">ชื่อเครื่อง *</label>
                            <input
                                name="Name" value={form.Name} onChange={handleChange}
                                placeholder="IMC8000_EN"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 block mb-1">รุ่น</label>
                            <input
                                name="Model" value={form.Model} onChange={handleChange}
                                placeholder="IM C8000"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">ตำแหน่ง</label>
                                <input
                                    name="Location" value={form.Location} onChange={handleChange}
                                    placeholder="OFFICE Flr.2"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">โรงงาน</label>
                                <select
                                    name="Factory" value={form.Factory} onChange={handleChange}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 bg-white"
                                >
                                    <option value="">-- เลือกโรงงาน --</option>
                                    {factories.map((f) => (
                                        <option key={f.LocationID} value={f.Name}>{f.Name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-600 block mb-1">การเชื่อมต่อ</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: 'ethernet', label: 'Ethernet (LAN)' },
                                    { value: 'usb', label: 'USB' },
                                ].map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setForm({ ...form, ConnectionType: opt.value })}
                                        className={`rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
                                            form.ConnectionType === opt.value
                                                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            {form.ConnectionType === 'usb' && (
                                <div className="mt-2">
                                    <label className="text-xs font-bold text-slate-600 block mb-1">ต่อ USB กับคอมพิวเตอร์</label>
                                    <input
                                        name="UsbHost" value={form.UsbHost} onChange={handleChange}
                                        placeholder="เช่น DCI-PC-1234"
                                        maxLength={100}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                                    />
                                </div>
                            )}
                        </div>

                        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose}
                                className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors">
                                ยกเลิก
                            </button>
                            <button type="submit" disabled={saving}
                                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                                {saving ? 'กำลังบันทึก...' : (isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มเครื่อง')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
};

const inkBarColor = {
    Black: '#1e293b',
    Cyan: '#06b6d4',
    Magenta: '#d946ef',
    Yellow: '#eab308',
};

const LOG_PAGE_SIZE = 7;

// แถวหนึ่งใน log สถานะ: วันที่ · วิธี · ออนไลน์/ออฟไลน์ · % หมึกแต่ละสี (ตัวเลข + แท่ง)
const HistoryRow = ({ reading }) => {
    const date = formatThaiDate(toUtcIso(reading.CheckedAt));
    const colors = [
        ['Black', reading.BlackPct], ['Cyan', reading.CyanPct],
        ['Magenta', reading.MagentaPct], ['Yellow', reading.YellowPct],
    ].filter(([, pct]) => pct != null);
    return (
        <div className="py-2.5 border-b border-slate-100 last:border-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] text-slate-600 font-medium">{date}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] font-bold text-slate-400">{reading.Method || '-'}</span>
                    {reading.Online === false || reading.Online === 0
                        ? <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">ออฟไลน์</span>
                        : <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">ออนไลน์</span>}
                </div>
            </div>
            {colors.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                    {colors.map(([name, pct]) => (
                        <div key={name}>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                                <span>{name}</span>
                                <span className="font-bold text-slate-700">{pct ?? 0}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: inkBarColor[name] }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const PrinterDetailModal = ({ printer, onClose, inkLinks = [], canEdit = false, onChanged }) => {
    const [history, setHistory] = useState([]);
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [logPage, setLogPage] = useState(1);
    // Spect ของหมึกแต่ละรหัส (ใช้เลือกสีไอคอน)
    const [inkSpect, setInkSpect] = useState({});

    useEffect(() => {
        fetch(`${API_BASE}/ink-toner`)
            .then(res => (res.ok ? res.json() : []))
            .then(rows => {
                const map = {};
                rows.forEach(r => { map[r.Prt_Code] = r.Spect; });
                setInkSpect(map);
            })
            .catch(() => setInkSpect({}));
    }, []);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [historyRes, errorsRes] = await Promise.all([
                    fetch(`${API_BASE}/printer-health/${printer.PrinterId}/history?days=14`),
                    fetch(`${API_BASE}/printer-health/${printer.PrinterId}/errors`),
                ]);
                setHistory(historyRes.ok ? await historyRes.json() : []);
                setErrors(errorsRes.ok ? await errorsRes.json() : []);
            } catch (err) {
                console.error('Error loading printer detail:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [printer.PrinterId]);

    const orderedHistory = history.slice().reverse();
    const logPages = Math.max(1, Math.ceil(orderedHistory.length / LOG_PAGE_SIZE));
    const safeLogPage = Math.min(logPage, logPages);
    const logRows = orderedHistory.slice((safeLogPage - 1) * LOG_PAGE_SIZE, safeLogPage * LOG_PAGE_SIZE);

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-black text-lg text-slate-800">{printer.Name}</h3>
                            {printer.Model && <p className="text-sm font-semibold text-indigo-600">{printer.Model}</p>}
                            <p className="text-xs text-slate-400">{printer.IpAddress} · {printer.Location}</p>
                            <div className="mt-1.5"><ConnectionBadge type={printer.ConnectionType} host={printer.UsbHost} /></div>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
                            <X size={20} />
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-10">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full"
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div>
                            <PhotoSlot printer={printer} field="PhotoUrl" endpoint="photo" label="รูปเครื่อง" canEdit={canEdit} onChanged={onChanged} enablePaste />
                            <div className="mt-4">
                                <PhotoSlot printer={printer} field="SitePhotoUrl" endpoint="site-photo" label="รูปหน้างานที่ติดตั้ง" canEdit={canEdit} onChanged={onChanged} />
                            </div>

                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <Droplet size={14} className="text-cyan-600" />
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">หมึกที่ใช้ได้ ({inkLinks.length})</h4>
                                </div>
                                {inkLinks.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-3 text-center">ยังไม่ได้ผูกหมึกกับเครื่องนี้ (ตั้งค่าได้ที่หน้า Ink & Toner)</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {inkLinks.map(l => {
                                            const type = getTonerType(inkSpect[l.Prt_Code]);
                                            return (
                                                <Link
                                                    key={l.Prt_Code}
                                                    to={`/ink-toner?q=${encodeURIComponent(l.Prt_Code)}`}
                                                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-sm px-3 py-2.5 transition-all"
                                                >
                                                    <span className={`w-9 h-9 rounded-full bg-gradient-to-br ${tonerGradient(type)} flex items-center justify-center shrink-0 shadow-sm ring-2 ring-white`}>
                                                        <Droplet size={14} className={tonerIconColor(type)} />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center gap-1">
                                                            <span className="font-mono text-xs font-bold text-slate-800">{l.Prt_Code}</span>
                                                            <CopyButton text={l.Prt_Code} title="คัดลอกรหัส" />
                                                        </span>
                                                        <span className="block text-[11px] text-slate-500 truncate">{inkSpect[l.Prt_Code] || '-'}</span>
                                                        {l.Remark && <span className="block text-[10px] text-amber-700 mt-0.5">เงื่อนไข: {l.Remark}</span>}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-indigo-600 shrink-0">ดูหมึก →</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                        </div>
                        <div>
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <History size={14} className="text-indigo-500" />
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Log สถานะ 14 วันล่าสุด ({history.length})</h4>
                                </div>
                                {history.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-4 text-center">ยังไม่มีข้อมูลย้อนหลัง</p>
                                ) : (
                                    <>
                                        <div className="bg-slate-50 rounded-xl px-3 py-1">
                                            {logRows.map((r, i) => <HistoryRow key={`${safeLogPage}-${i}`} reading={r} />)}
                                        </div>
                                        {logPages > 1 && (
                                            <div className="flex items-center justify-between mt-2 text-xs">
                                                <button
                                                    type="button"
                                                    disabled={safeLogPage <= 1}
                                                    onClick={() => setLogPage(safeLogPage - 1)}
                                                    className="px-3 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    ก่อนหน้า
                                                </button>
                                                <span className="text-slate-400">หน้า {safeLogPage} / {logPages}</span>
                                                <button
                                                    type="button"
                                                    disabled={safeLogPage >= logPages}
                                                    onClick={() => setLogPage(safeLogPage + 1)}
                                                    className="px-3 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    ถัดไป
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Clock size={14} className="text-red-500" />
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">ประวัติ error</h4>
                                </div>
                                {errors.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-4 text-center">ยังไม่มีข้อมูล error</p>
                                ) : (
                                    <div className="space-y-2">
                                        {errors.map((e) => (
                                            <div key={e.ErrorLogId} className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${e.Status === 'Open' ? 'bg-red-50' : 'bg-slate-50'}`}>
                                                <AlertTriangle size={13} className={e.Status === 'Open' ? 'text-red-500 mt-0.5' : 'text-slate-400 mt-0.5'} />
                                                <div className="flex-1">
                                                    <p className="font-bold text-slate-700">{e.ErrorMessage}</p>
                                                    <p className="text-[10px] text-slate-400">
                                                        {e.ErrorCode && `${e.ErrorCode} · `}
                                                        {formatThaiDate(toUtcIso(e.ScrapedAt))}
                                                    </p>
                                                </div>
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${e.Status === 'Open' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                    {e.Status === 'Open' ? 'ยังไม่แก้' : 'แก้แล้ว'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        </div>
                    )}
                </div>
            </div>
        </Portal>
    );
};

// ป้ายรหัสหมึกที่เครื่องนี้ใช้ได้ คลิกแล้วไปหน้า Ink & Toner ค้นหารหัสนั้นทันที
const InkChips = ({ links, max = 2 }) => {
    if (!links || links.length === 0) {
        return <span className="text-[10px] text-slate-300">ยังไม่ผูกหมึก</span>;
    }
    const shown = links.slice(0, max);
    const rest = links.length - shown.length;
    return (
        <div className="flex flex-wrap items-center gap-1" title={links.map(l => l.Prt_Code).join('\n')}>
            <Droplet size={10} className="text-cyan-600 shrink-0" />
            {shown.map(l => (
                <Link
                    key={l.Prt_Code}
                    to={`/ink-toner?q=${encodeURIComponent(l.Prt_Code)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-[10px] font-bold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-1.5 py-0.5 rounded"
                >
                    {l.Prt_Code}
                </Link>
            ))}
            {rest > 0 && <span className="text-[10px] font-bold text-slate-500">+{rest}</span>}
        </div>
    );
};

const PrinterListRow = ({ printer, onOpen, onEdit, onScan, scanning, inkLinks, canScan = true }) => (
    <div
        role="button"
        tabIndex={0}
        aria-label={`ดูรายละเอียด ${printer.Name}`}
        onClick={() => onOpen(printer)}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(printer); } }}
        className={`flex items-center gap-4 bg-white border-b border-slate-100 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-inset ${!printer.Online ? 'bg-red-50/40' : ''}`}
    >
        <PrinterThumb
            src={printer.PhotoUrl ? `${API_URL}${printer.PhotoUrl}` : null}
            name={printer.Name}
            caption={`${printer.Name} · ${printer.IpAddress}`}
        />

        <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-sm truncate">
                {printer.Name}
                {printer.Model && <span className="ml-2 text-xs font-semibold text-indigo-600">{printer.Model}</span>}
            </p>
            <p className="text-xs text-slate-400 truncate">
                {printer.IpAddress}{printer.Location ? ` · ${printer.Location}` : ''}{printer.Factory ? ` · ${printer.Factory}` : ''}
            </p>
            <div className="mt-1"><ConnectionBadge type={printer.ConnectionType} host={printer.UsbHost} /></div>
        </div>

        <div className="hidden md:flex items-center gap-4 shrink-0">
            {(printer.IsColor === false
                ? [['Black', printer.BlackPct]]
                : [['Black', printer.BlackPct], ['Cyan', printer.CyanPct], ['Magenta', printer.MagentaPct], ['Yellow', printer.YellowPct]]
            ).map(([name, pct]) => (
                <div key={name} className="flex items-center gap-1 text-xs text-slate-600 w-12">
                    <Droplet size={11} fill={inkBarColor[name]} color={inkBarColor[name]} />
                    <span className="font-bold">{pct ?? '-'}%</span>
                </div>
            ))}
        </div>

        <div className="hidden lg:block shrink-0 max-w-[220px]">
            <InkChips links={inkLinks} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
            {printer.OpenErrorCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">
                    <AlertTriangle size={10} /> {printer.OpenErrorCount}
                </span>
            )}
            <StatusBadge tone={printer.Online ? 'emerald' : 'rose'} title={`สแกนล่าสุด ${scanAgeLabel(scannedAt(printer))}`}>
                {printer.Online ? 'ออนไลน์' : 'ออฟไลน์'}
            </StatusBadge>
            <span className={`hidden xl:inline text-[10px] whitespace-nowrap ${isScanStale(scannedAt(printer)) ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                {scanAgeLabel(scannedAt(printer))}
            </span>

            <button
                onClick={(e) => { e.stopPropagation(); onEdit(printer); }}
                className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-md transition-colors"
                title="แก้ไขข้อมูลเครื่อง"
            >
                <Pencil size={13} />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onScan(printer.PrinterId); }}
                disabled={scanning || !canScan}
                title={canScan ? 'ดึงข้อมูลเครื่องนี้' : 'ไม่มีสิทธิ์ดึงข้อมูลจากเครื่อง'}
                className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-colors"
            >
                <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
                {scanning ? 'กำลังดึง...' : 'ดึงข้อมูล'}
            </button>
        </div>
    </div>
);

const StatCard = ({ icon: Icon, title, value, color }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200"
    >
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm text-slate-600 mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
            </div>
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                <Icon className="w-7 h-7 text-white" />
            </div>
        </div>
    </motion.div>
);

// สีของแท่ง % ตามระดับ (เขียว/เหลือง/แดง)
const tonerColor = (pct) => {
    if (pct === null || pct === undefined) return 'bg-slate-200';
    if (pct <= 10) return 'bg-red-500';
    if (pct <= 20) return 'bg-amber-400';
    return 'bg-emerald-500';
};

// คำอธิบายสีแท่งหมึกและเกณฑ์ (ตรงกับ tonerColor และป้ายแจ้งเตือนในเมนู: หมึกต่ำกว่าหรือเท่ากับ 20%)
const TonerLegend = () => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="font-bold text-slate-600">ระดับหมึก:</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-emerald-500" />มากกว่า 20% ปกติ</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-amber-400" />11–20% ใกล้หมด</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-red-500" />10% หรือต่ำกว่า เร่งเปลี่ยน</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-slate-200" />ไม่มีข้อมูล</span>
    </div>
);

// เวลาสแกนล่าสุด: ข้อความแบบ "15 นาทีที่แล้ว" และเตือนถ้าเก่าเกิน 24 ชั่วโมง
const scannedAt = (p) => (p.CheckedAt ? new Date(toUtcIso(p.CheckedAt)) : null);
const scanAgeLabel = (d) => {
    if (!d || Number.isNaN(d.getTime())) return 'ยังไม่เคยสแกน';
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'เมื่อสักครู่';
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} ชม.ที่แล้ว`;
    return `${Math.round(hours / 24)} วันที่แล้ว`;
};
const isScanStale = (d) => !d || Number.isNaN(d.getTime()) || Date.now() - d.getTime() > 24 * 3600 * 1000;

// หมึกที่เหลือน้อยที่สุดของเครื่อง (ใช้เรียงลำดับ) — ไม่มีข้อมูลเลยให้ไปอยู่ท้ายสุด
const lowestToner = (p) => {
    const vals = [p.BlackPct, p.CyanPct, p.MagentaPct, p.YellowPct].filter((v) => v !== null && v !== undefined);
    return vals.length ? Math.min(...vals) : Infinity;
};

// สีไอคอนตามสีหมึกจริง (ไม่ใช่ตามระดับ %)
const inkIconColor = {
    Black: '#1e293b',
    Cyan: '#06b6d4',
    Magenta: '#d946ef',
    Yellow: '#eab308',
};

const TonerBar = ({ label, pct }) => (
    <div className="flex-1">
        <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
            <Droplet size={13} fill={inkIconColor[label]} color={inkIconColor[label]} />
            <span className="flex-1">{label}</span>
            <span className="font-bold text-slate-700">{pct ?? '-'}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${tonerColor(pct)}`} style={{ width: `${pct ?? 0}%` }} />
        </div>
    </div>
);

const PrinterHealthPage = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [scanningId, setScanningId] = useState(null); // PrinterId ที่กำลังกดดึงข้อมูลอยู่
    const [modalMode, setModalMode] = useState(null); // null=ปิด, 'add', หรือ printer object (แก้ไข)
    const canCreatePrinter = useCanAct('printer-health', 'create');
    const canEditPrinter = useCanAct('printer-health', 'edit');
    const canScanPrinter = useCanAct('printer-health', 'scan');
    const [selectedPrinter, setSelectedPrinter] = useState(null);
    const [selectedFactory, setSelectedFactory] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [compatByPrinter, setCompatByPrinter] = useState({}); // { [PrinterId]: [{ Prt_Code, Remark }] }
    const [connFilter, setConnFilter] = useState('all'); // 'all' | 'ethernet' | 'usb'
    const [usbHostFilter, setUsbHostFilter] = useState(''); // ชื่อคอมพิวเตอร์ที่ต่อ USB
    const [colorFilter, setColorFilter] = useState('all'); // 'all' | 'color' | 'mono' (ใช้ IsColor จากการสแกน; ยังไม่เคยสแกนจะอยู่เฉพาะตอน 'all')
    const [sortKey, setSortKey] = useState('default'); // 'default' | 'toner' | 'scan'
    const [groupByHost, setGroupByHost] = useState(false); // จัดกลุ่มรายการ (list) ตาม Ethernet / ชื่อคอมพิวเตอร์ USB
    const [scanningAll, setScanningAll] = useState(false);

    // หมึกที่ผูกกับแต่ละเครื่อง (ดึงจากตารางความสัมพันธ์ ไม่ต้องรอ fetch ของเครื่องแต่ละตัว)
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/ink-toner/compat`);
                if (!res.ok) return;
                const json = await res.json();
                const map = {};
                (json.data || []).forEach(row => {
                    (map[row.PrinterId] ||= []).push({ Prt_Code: row.Prt_Code, Remark: row.Remark });
                });
                if (alive) setCompatByPrinter(map);
            } catch (err) {
                console.error('Error fetching ink-toner compat:', err);
            }
        })();
        return () => { alive = false; };
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/printer-health`);
            if (!res.ok) throw new Error('Failed to fetch data');
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Error fetching printer health:', err);
            setError('ไม่สามารถดึงข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const scanPrinter = async (printerId) => {
        setScanningId(printerId);
        try {
            const res = await fetch(`${API_BASE}/printer-health/${printerId}/scan`, { method: 'POST' });
            if (!res.ok) throw new Error('Scan failed');
            toast.success('ดึงข้อมูลเครื่องนี้แล้ว');
            await fetchData(); // ดึงข้อมูลล่าสุดมาแสดงหลังสแกนเสร็จ
        } catch (err) {
            console.error('Error scanning printer:', err);
            toast.error('ดึงข้อมูลเครื่องนี้ไม่สำเร็จ ลองใหม่อีกครั้ง');
        } finally {
            setScanningId(null);
        }
    };

    // ดึงข้อมูลทุกเครื่องพร้อมกัน (ฝั่งเซิร์ฟเวอร์ทีละ 4 เครื่อง) — ยืนยันก่อนเพราะใช้เวลานาน
    const scanAll = async () => {
        const ok = await confirmDialog({
            title: 'ดึงข้อมูลทุกเครื่อง',
            message: `จะดึงข้อมูล ${data.length} เครื่อง อาจใช้เวลาหลายนาที ระหว่างนี้ยังใช้หน้านี้ได้`,
            confirmText: 'ดึงข้อมูลทั้งหมด',
        });
        if (!ok) return;
        setScanningAll(true);
        try {
            const res = await fetch(`${API_BASE}/printer-health/scan-all`, { method: 'POST' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || 'ดึงข้อมูลทุกเครื่องไม่สำเร็จ');
            const okCount = json.total - json.failed;
            const skippedNote = json.skipped ? ` · ข้าม ${json.skipped} เครื่องที่ไม่มี IP (เช่น USB)` : '';
            if (json.failed) toast.error(`ดึงข้อมูลแล้ว ${okCount}/${json.total} เครื่อง · ล้มเหลว ${json.failed} เครื่อง${skippedNote}`, 6000);
            else toast.success(`ดึงข้อมูลครบทั้ง ${json.total} เครื่อง${skippedNote}`);
            await fetchData();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setScanningAll(false);
        }
    };

    const totalPrinters = data.length;
    const onlineCount = data.filter(p => p.Online).length;
    const offlineCount = totalPrinters - onlineCount;
    const openErrorCount = data.reduce((sum, p) => sum + (p.OpenErrorCount || 0), 0);
    const uniqueFactoryCount = new Set(data.map(p => p.Factory).filter(Boolean)).size;
    const uniqueFactoryNames = [...new Set(data.map(p => p.Factory).filter(Boolean))].sort();
    const filteredData = data
        .filter(p => !selectedFactory || p.Factory === selectedFactory)
        .filter(p => connFilter === 'all' || (connFilter === 'usb' ? p.ConnectionType === 'usb' : p.ConnectionType !== 'usb'))
        .filter(p => !usbHostFilter || (p.ConnectionType === 'usb' && p.UsbHost === usbHostFilter))
        .filter(p => colorFilter === 'all' || (colorFilter === 'color' ? p.IsColor === true : p.IsColor === false))
        .filter(p => {
            if (!searchTerm.trim()) return true;
            const q = searchTerm.trim().toLowerCase();
            return (
                p.Name?.toLowerCase().includes(q) ||
                p.IpAddress?.toLowerCase().includes(q) ||
                p.Location?.toLowerCase().includes(q) ||
                p.Model?.toLowerCase().includes(q) ||
                (compatByPrinter[p.PrinterId] || []).some(c => c.Prt_Code?.toLowerCase().includes(q))
            );
        });
    const usbHostNames = [...new Set(data.filter(p => p.ConnectionType === 'usb' && p.UsbHost).map(p => p.UsbHost))].sort();
    const hostKey = (p) => (p.ConnectionType === 'usb' ? `USB · ${p.UsbHost || 'ไม่ระบุเครื่อง'}` : 'Ethernet');
    // เรียงตามที่เลือก: หมึกต่ำสุดก่อน / สแกนเก่าสุดก่อน (ออฟไลน์ขึ้นก่อนเสมอในโหมดสแกนเก่า) / ค่าเริ่มต้น = ชื่อ
    const sortedData = [...filteredData].sort((a, b) => {
        if (groupByHost) {
            const ka = hostKey(a), kb = hostKey(b);
            if (ka !== kb) return ka.localeCompare(kb, 'th');
        }
        if (sortKey === 'toner') return lowestToner(a) - lowestToner(b) || (a.Name || '').localeCompare(b.Name || '', 'th');
        if (sortKey === 'scan') {
            if (a.Online !== b.Online) return a.Online ? 1 : -1;
            const ta = scannedAt(a)?.getTime() ?? 0, tb = scannedAt(b)?.getTime() ?? 0;
            return ta - tb;
        }
        return (a.Name || '').localeCompare(b.Name || '', 'th');
    });
    const totalPages = Math.max(1, Math.ceil(sortedData.length / ITEMS_PER_PAGE));
    const paginatedData = sortedData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

        useEffect(() => { setCurrentPage(1); }, [selectedFactory, searchTerm, connFilter, usbHostFilter, colorFilter, sortKey, groupByHost]);
    useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages, currentPage]);

    // โหลดครั้งแรกแสดงโครงหน้า (skeleton) — ตอนรีเฟรชให้คงของเดิมไว้
    if (loading && data.length === 0) {
        return <PageSkeleton variant="grid" cards={10} />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">เกิดข้อผิดพลาด</h3>
                <p className="text-slate-500">{error}</p>
                <button onClick={fetchData} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                    ลองใหม่อีกครั้ง
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                <StatCard icon={Printer} title="พรินเตอร์ทั้งหมด" value={totalPrinters} color="from-blue-500 to-blue-600" />
                <StatCard icon={Wifi} title="ออนไลน์" value={onlineCount} color="from-emerald-500 to-emerald-600" />
                <StatCard icon={WifiOff} title="ออฟไลน์" value={offlineCount} color="from-slate-500 to-slate-600" />
                <StatCard icon={AlertTriangle} title="Error ที่ยังไม่แก้" value={openErrorCount} color="from-red-500 to-red-600" />
                <StatCard icon={FactoryIcon} title="โรงงาน" value={uniqueFactoryCount} color="from-purple-500 to-purple-600" />
            </div>

            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black mb-1 text-slate-800">PRINTER HEALTH</h2>
                    <p className="text-slate-500 font-medium">สถานะหมึกและ error จากตัวเครื่องพรินเตอร์ (SNMP / HTTP)</p>
                </div>
                <div className="flex items-center gap-3">
                          <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="ค้นหาชื่อ, IP, ตำแหน่ง..."
                            className="border border-slate-200 rounded-xl pl-9 pr-8 h-[42px] text-sm text-slate-600 bg-white w-56 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 h-[42px] shrink-0">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                            title="มุมมองการ์ด"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                            title="มุมมองรายการ"
                        >
                            <ListIcon size={16} />
                        </button>
                    </div>
                    <select
                        value={selectedFactory}
                        onChange={(e) => setSelectedFactory(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3 h-[42px] text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                    >
                        <option value="">ทุกโรงงาน</option>
                        {uniqueFactoryNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    {canCreatePrinter && <button onClick={() => setModalMode('add')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2 h-[42px]">
                        <Plus size={16} />
                        <span className="text-sm">เพิ่มเครื่อง</span>
                    </button>}
                    <button onClick={fetchData} className="bg-white hover:bg-indigo-50 text-indigo-600 border border-slate-200 font-bold px-3 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2 h-[42px]">
                        <RefreshCw size={16} />
                        <span className="text-sm">รีเฟรช</span>
                    </button>
                </div>
            </div>

            {/* แถบตัวกรอง/เรียง + คำอธิบายระดับหมึก + ดึงข้อมูลทั้งหมด */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <div role="group" aria-label="ประเภทการเชื่อมต่อ" className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                        {[['all', 'ทั้งหมด'], ['ethernet', 'Ethernet'], ['usb', 'USB']].map(([key, label]) => (
                            <button key={key} type="button" aria-pressed={connFilter === key}
                                onClick={() => { setConnFilter(key); if (key !== 'usb') setUsbHostFilter(''); }}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${connFilter === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {connFilter === 'usb' && (
                        <select value={usbHostFilter} onChange={(e) => setUsbHostFilter(e.target.value)} aria-label="เลือกคอมพิวเตอร์ที่ต่อ USB"
                            className="border border-slate-200 rounded-xl px-3 h-[34px] text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100">
                            <option value="">ทุกคอมพิวเตอร์</option>
                            {usbHostNames.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                    )}
                    <select value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} aria-label="กรองตามประเภทสี"
                        className="border border-slate-200 rounded-xl px-3 h-[34px] text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100">
                        <option value="all">ทุกประเภทสี</option>
                        <option value="mono">ขาวดำ (Black/White)</option>
                        <option value="color">สี (Color)</option>
                    </select>
                    <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} aria-label="เรียงลำดับ"
                        className="border border-slate-200 rounded-xl px-3 h-[34px] text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100">
                        <option value="default">เรียงตามชื่อ</option>
                        <option value="toner">หมึกต่ำสุดก่อน</option>
                        <option value="scan">ออฟไลน์/สแกนเก่าสุดก่อน</option>
                    </select>
                    {viewMode === 'list' && (
                        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={groupByHost} onChange={(e) => setGroupByHost(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
                            จัดกลุ่มตาม Ethernet / USB
                        </label>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        <button type="button" onClick={scanAll} disabled={scanningAll || data.length === 0 || !canScanPrinter}
                            title={canScanPrinter ? 'ดึงข้อมูลทุกเครื่อง' : 'ไม่มีสิทธิ์ดึงข้อมูลจากเครื่อง'}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-xl shadow-sm">
                            <RefreshCw size={13} className={scanningAll ? 'animate-spin' : ''} />
                            {scanningAll ? 'กำลังดึงข้อมูลทุกเครื่อง...' : 'ดึงข้อมูลทั้งหมด'}
                        </button>
                    </div>
                </div>
                <TonerLegend />
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {paginatedData.map((printer) => (
                        <motion.div
                            key={printer.PrinterId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            role="button"
                            tabIndex={0}
                            aria-label={`ดูรายละเอียด ${printer.Name}`}
                            onClick={() => setSelectedPrinter(printer)}
                            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedPrinter(printer); } }}
                            className={`bg-white rounded-3xl border p-4 shadow-sm cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${printer.Online ? 'border-slate-100' : 'border-red-200 bg-red-50'}`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                                        <Printer size={16} className="text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-800 text-sm">{printer.Name}</p>
                                        {printer.Model && <p className="text-[11px] font-semibold text-indigo-600 truncate">{printer.Model}</p>}
                                        <p className="text-xs text-slate-400">{printer.IpAddress} · {printer.Location}</p>
                                        <div className="mt-1"><ConnectionBadge type={printer.ConnectionType} host={printer.UsbHost} /></div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <StatusBadge tone={printer.Online ? 'emerald' : 'rose'} title={`สแกนล่าสุด ${scanAgeLabel(scannedAt(printer))}`}>
                                        {printer.Online ? 'ออนไลน์' : 'ออฟไลน์'}
                                    </StatusBadge>
                                    {canEditPrinter && <button
                                        onClick={(e) => { e.stopPropagation(); setModalMode(printer); }}
                                        className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1 rounded-md transition-colors"
                                        title="แก้ไขข้อมูลเครื่อง"
                                    >
                                        <Pencil size={13} />
                                    </button>}
                                </div>
                            </div>

                            {printer.PhotoUrl && (
                                <img
                                    src={`${API_URL}${printer.PhotoUrl}`}
                                    alt={printer.Name}
                                    loading="lazy"
                                    className="w-full h-24 object-contain rounded-2xl bg-white border border-slate-100 p-1.5 mb-2.5 shadow-inner"
                                />
                            )}

                            <div className={printer.IsColor === false ? 'mb-2' : 'grid grid-cols-2 gap-x-4 gap-y-2 mb-2'}>
                                <TonerBar label="Black" pct={printer.BlackPct} />
                                {printer.IsColor !== false && (
                                    <>
                                        <TonerBar label="Cyan" pct={printer.CyanPct} />
                                        <TonerBar label="Magenta" pct={printer.MagentaPct} />
                                        <TonerBar label="Yellow" pct={printer.YellowPct} />
                                    </>
                                )}
                            </div>
                            {printer.IsColor === false && (
                                <p className="text-[10px] text-slate-400 -mt-1 mb-2">เครื่องขาวดำ</p>
                            )}

                            <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                                <InkChips links={compatByPrinter[printer.PrinterId]} />
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <div className="text-xs text-slate-400">
                                    <span>วิธี: {printer.Method || '-'}</span>
                                    <span className={`block text-[10px] mt-0.5 ${isScanStale(scannedAt(printer)) ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                                        สแกน {scanAgeLabel(scannedAt(printer))}
                                    </span>
                                    {printer.OpenErrorCount > 0 && (
                                        <span className="flex items-center gap-1 text-red-500 font-bold mt-0.5">
                                            <AlertTriangle size={11} /> {printer.OpenErrorCount} error
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); scanPrinter(printer.PrinterId); }}
                                    disabled={!canScanPrinter || scanningId === printer.PrinterId}
                                    title={canScanPrinter ? 'ดึงข้อมูลเครื่องนี้' : 'ไม่มีสิทธิ์ดึงข้อมูลจากเครื่อง'}
                                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                    <RefreshCw size={12} className={scanningId === printer.PrinterId ? 'animate-spin' : ''} />
                                    {scanningId === printer.PrinterId ? 'กำลังดึง...' : 'ดึงข้อมูล'}
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
                    {paginatedData.map((printer, idx) => {
                        const key = hostKey(printer);
                        const showHeader = groupByHost && (idx === 0 || hostKey(paginatedData[idx - 1]) !== key);
                        return (
                            <React.Fragment key={printer.PrinterId}>
                                {showHeader && (
                                    <div className="px-4 py-2 bg-slate-50 text-[11px] font-bold text-slate-500 border-b border-slate-100">{key}</div>
                                )}
                                <PrinterListRow
                                    printer={printer}
                                    onOpen={setSelectedPrinter}
                                    onEdit={setModalMode}
                                    onScan={scanPrinter}
                                    scanning={scanningId === printer.PrinterId}
                                    inkLinks={compatByPrinter[printer.PrinterId]}
                                    canScan={canScanPrinter}
                                />
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {filteredData.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-xs">
                    {selectedFactory ? 'ไม่มีเครื่องในโรงงานนี้' : 'ยังไม่มีข้อมูล — รอรอบตรวจถัดไป'}
                </div>
            )}

            {filteredData.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-slate-400">
                        แสดง {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} จาก {filteredData.length} เครื่อง
                    </p>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            ก่อนหน้า
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`w-8 h-8 text-xs font-bold rounded-lg transition-colors ${page === currentPage ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50 border border-slate-200'}`}
                            >
                                {page}
                            </button>
                        ))}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            ถัดไป
                        </button>
                    </div>
                </div>
            )}

            {modalMode && (
                <AddPrinterModal
                    printer={modalMode === 'add' ? null : modalMode}
                    onClose={() => setModalMode(null)}
                    onSaved={() => { setModalMode(null); fetchData(); }}
                />
            )}

            {selectedPrinter && (
                <PrinterDetailModal
                    printer={selectedPrinter}
                    inkLinks={compatByPrinter[selectedPrinter.PrinterId] || []}
                    canEdit={canEditPrinter}
                    onChanged={fetchData}
                    onClose={() => setSelectedPrinter(null)}
                />
            )}
        </div>
    );
};

export default PrinterHealthPage;
