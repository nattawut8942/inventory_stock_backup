import React, { useState, useEffect } from 'react';
import { Printer, AlertTriangle, Wifi, WifiOff, RefreshCw, Droplet, Plus, X, History, Clock, Pencil, Factory as FactoryIcon, LayoutGrid, List as ListIcon, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { API_BASE } from '../config/api';
import Portal from '../components/Portal';
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
            onSaved();
        } catch (err) {
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

// แถวเดียวใน history: วันที่ + แท่ง % ของทั้ง 4 สี เรียงกัน (แบบ sparkline row)
const HistoryRow = ({ reading }) => {
    const date = formatThaiDate(toUtcIso(reading.CheckedAt));
    const colors = [
        ['Black', reading.BlackPct], ['Cyan', reading.CyanPct],
        ['Magenta', reading.MagentaPct], ['Yellow', reading.YellowPct],
    ];
    return (
        <div className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
            <span className="text-[10px] text-slate-400 w-24 shrink-0">{date}</span>
            <span className="text-[9px] font-bold text-slate-400 w-10 shrink-0">{reading.Method || '-'}</span>
            <div className="flex-1 flex items-center gap-2">
                {colors.map(([name, pct]) => (
                    <div key={name} className="flex-1">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: inkBarColor[name] }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const PrinterDetailModal = ({ printer, onClose }) => {
    const [history, setHistory] = useState([]);
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(true);

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

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-black text-lg text-slate-800">{printer.Name}</h3>
                            <p className="text-xs text-slate-400">{printer.IpAddress} · {printer.Location}</p>
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
                        <>
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <History size={14} className="text-indigo-500" />
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">เทรนด์ 14 วันล่าสุด</h4>
                                </div>
                                {history.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-4 text-center">ยังไม่มีข้อมูลย้อนหลัง</p>
                                ) : (
                                    <div className="bg-slate-50 rounded-xl px-3 py-1">
                                        {history.slice().reverse().map((r, i) => <HistoryRow key={i} reading={r} />)}
                                    </div>
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
                        </>
                    )}
                </div>
            </div>
        </Portal>
    );
};

const PrinterListRow = ({ printer, onOpen, onEdit, onScan, scanning }) => (
    <div
        onClick={() => onOpen(printer)}
        className={`flex items-center gap-4 bg-white border-b border-slate-100 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors ${!printer.Online ? 'bg-red-50/40' : ''}`}
    >
        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Printer size={16} className="text-indigo-600" />
        </div>

        <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-sm truncate">{printer.Name}</p>
            <p className="text-xs text-slate-400 truncate">
                {printer.IpAddress}{printer.Location ? ` · ${printer.Location}` : ''}{printer.Factory ? ` · ${printer.Factory}` : ''}
            </p>
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

        <div className="flex items-center gap-2 shrink-0">
            {printer.OpenErrorCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">
                    <AlertTriangle size={10} /> {printer.OpenErrorCount}
                </span>
            )}
            {printer.Online
                ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">ออนไลน์</span>
                : <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">ออฟไลน์</span>}

            <button
                onClick={(e) => { e.stopPropagation(); onEdit(printer); }}
                className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-md transition-colors"
                title="แก้ไขข้อมูลเครื่อง"
            >
                <Pencil size={13} />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onScan(printer.PrinterId); }}
                disabled={scanning}
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
    const [selectedPrinter, setSelectedPrinter] = useState(null);
    const [selectedFactory, setSelectedFactory] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

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
            await fetchData(); // ดึงข้อมูลล่าสุดมาแสดงหลังสแกนเสร็จ
        } catch (err) {
            console.error('Error scanning printer:', err);
            alert('ดึงข้อมูลเครื่องนี้ไม่สำเร็จ ลองใหม่อีกครั้ง');
        } finally {
            setScanningId(null);
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
        .filter(p => {
            if (!searchTerm.trim()) return true;
            const q = searchTerm.trim().toLowerCase();
            return (
                p.Name?.toLowerCase().includes(q) ||
                p.IpAddress?.toLowerCase().includes(q) ||
                p.Location?.toLowerCase().includes(q) ||
                p.Model?.toLowerCase().includes(q)
            );
        });
    const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE));
    const paginatedData = filteredData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

        useEffect(() => { setCurrentPage(1); }, [selectedFactory, searchTerm]);
    useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages, currentPage]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full"
                />
            </div>
        );
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
                    <button onClick={() => setModalMode('add')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2 h-[42px]">
                        <Plus size={16} />
                        <span className="text-sm">เพิ่มเครื่อง</span>
                    </button>
                    <button onClick={fetchData} className="bg-white hover:bg-indigo-50 text-indigo-600 border border-slate-200 font-bold px-3 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2 h-[42px]">
                        <RefreshCw size={16} />
                        <span className="text-sm">รีเฟรช</span>
                    </button>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {paginatedData.map((printer) => (
                        <motion.div
                            key={printer.PrinterId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => setSelectedPrinter(printer)}
                            className={`bg-white rounded-2xl border p-4 shadow-md cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all ${printer.Online ? 'border-slate-100' : 'border-red-200 bg-red-50'}`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                                        <Printer size={16} className="text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-800 text-sm">{printer.Name}</p>
                                        <p className="text-xs text-slate-400">{printer.IpAddress} · {printer.Location}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {printer.Online
                                        ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">ออนไลน์</span>
                                        : <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">ออฟไลน์</span>}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setModalMode(printer); }}
                                        className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1 rounded-md transition-colors"
                                        title="แก้ไขข้อมูลเครื่อง"
                                    >
                                        <Pencil size={13} />
                                    </button>
                                </div>
                            </div>

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

                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <div className="text-xs text-slate-400">
                                    <span>วิธี: {printer.Method || '-'}</span>
                                    {printer.OpenErrorCount > 0 && (
                                        <span className="flex items-center gap-1 text-red-500 font-bold mt-0.5">
                                            <AlertTriangle size={11} /> {printer.OpenErrorCount} error
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); scanPrinter(printer.PrinterId); }}
                                    disabled={scanningId === printer.PrinterId}
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
                    {paginatedData.map((printer) => (
                        <PrinterListRow
                            key={printer.PrinterId}
                            printer={printer}
                            onOpen={setSelectedPrinter}
                            onEdit={setModalMode}
                            onScan={scanPrinter}
                            scanning={scanningId === printer.PrinterId}
                        />
                    ))}
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
                    onClose={() => setSelectedPrinter(null)}
                />
            )}
        </div>
    );
};

export default PrinterHealthPage;