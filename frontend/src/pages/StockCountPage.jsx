import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
    Search, ScanLine, Trash2, ClipboardList, ArrowLeft, PlusCircle, Package,
    Edit3, Loader2, Check, CheckCircle2, AlertCircle, Plus, Minus, Target, Download, Printer, Eye, Clock, X, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCan, useCanAct } from '../context/PermissionContext';
import AlertModal from '../components/AlertModal';
import Portal from '../components/Portal';
import { PagerBar } from '../components/StockPager';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import { API_BASE, API_URL } from '../config/api';

// ── ตรวจนับสต็อก ──────────────────────────────────────────────────────
// 3 มุมมอง: รายการรอบนับ (list) → นับสต็อก (count, มีขั้นตอน) → รายงานรอบนับ (report)
const STEPS = ['เริ่มรอบ', 'เพิ่มสินค้า', 'กรอกจำนวนนับ', 'ตรวจสอบ', 'ยืนยัน'];

const fmtDate = (d) => (d ? new Date(d).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const diffOf = (item) => (item.ActualQty === null || item.ActualQty === undefined ? null : item.ActualQty - item.SystemQty);
const isCounted = (item) => item.ActualQty !== null && item.ActualQty !== undefined;
// แบ่งหน้า (ไม่ใช่ hook — ใช้ใน render function ได้) — หน้าเกินจะถูกบีบให้อยู่ในช่วง
const paginate = (rows, page, size) => {
    const totalPages = Math.max(1, Math.ceil(rows.length / size));
    const curPage = Math.min(Math.max(1, page), totalPages);
    const pageStart = (curPage - 1) * size;
    return { pageRows: rows.slice(pageStart, pageStart + size), curPage, totalPages, pageStart, pageSize: size, total: rows.length };
};
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null); // ทศนิยม 1 ตำแหน่ง
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const money = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}฿${Math.abs(Math.round(v)).toLocaleString()}`;
const imgUrl = (u) => (!u ? null : u.startsWith('http') ? u : `${API_URL}${u}`);

// รูปอุปกรณ์เล็ก ถ้าไม่มีรูปแสดงไอคอนแทน
const Thumb = ({ src, size = 32 }) => (
    src
        ? <img src={imgUrl(src)} alt="" loading="lazy" style={{ width: size, height: size }} className="rounded-md object-cover border border-slate-200 bg-white shrink-0" />
        : <div style={{ width: size, height: size }} className="rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 shrink-0"><Package size={Math.round(size * 0.5)} /></div>
);

const STATUS_META = {
    Draft: { label: 'ฉบับร่าง', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    Confirmed: { label: 'ยืนยันแล้ว', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    Adjusted: { label: 'ปรับยอดแล้ว', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};
const StatusBadge = ({ status }) => {
    const m = STATUS_META[status] || { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${m.cls}`}>{m.label}</span>;
};

// แถบขั้นตอน: บอกว่าตอนนี้อยู่ขั้นไหน
const Stepper = ({ current }) => (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
                <li key={s} className="flex items-center gap-1 shrink-0">
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition
                        ${done ? 'bg-emerald-50 text-emerald-700' : active ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30' : 'bg-slate-100 text-slate-400'}`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                            ${done ? 'bg-emerald-500 text-white' : active ? 'bg-white text-indigo-600' : 'bg-white text-slate-400'}`}>
                            {done ? <Check size={12} /> : i + 1}
                        </span>
                        {s}
                    </span>
                    {i < STEPS.length - 1 && <span className={`w-4 h-px ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                </li>
            );
        })}
    </ol>
);

const Card = ({ children, className = '' }) => (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

const Kpi = ({ label, value, tone = 'text-slate-800', sub }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="text-[11px] font-semibold text-slate-500">{label}</div>
        <div className={`text-2xl font-black tabular-nums mt-1 ${tone}`}>{value}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
);

const DiffChip = ({ diff }) => {
    if (diff === null) return <span className="text-xs text-slate-300">—</span>;
    if (diff === 0) return <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><Check size={12} />ตรง</span>;
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{diff > 0 ? `+${diff}` : diff}</span>;
};

const SaveStatus = ({ saveState: st }) => {
    const vals = Object.values(st);
    if (vals.includes('saving')) return <div className="text-[11px] text-amber-600">กำลังบันทึก…</div>;
    if (vals.includes('error')) return <div className="text-[11px] text-red-600 font-semibold">มีรายการบันทึกไม่สำเร็จ</div>;
    return <div className="text-[11px] text-emerald-600">บันทึกอัตโนมัติทุกครั้งที่แก้ไข</div>;
};

// หน้าต่างกรอกจำนวนนับ (ใช้บนมือถือ): ปุ่มใหญ่ กรอกง่าย กดบันทึก/บันทึกแล้วไปรายการถัดไป
const CountSheet = ({ item, imageUrl, hasNext, onSave, onClose }) => {
    const [val, setVal] = useState(item.ActualQty ?? '');
    const inputRef = useRef(null);
    useEffect(() => {
        setVal(item.ActualQty ?? '');
        const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select?.(); }, 60);
        return () => clearTimeout(t);
    }, [item.ItemID]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const num = val === '' ? null : Number(val);
    const d = num === null ? null : num - item.SystemQty;
    const bump = (delta) => setVal(v => String(Math.max(0, (Number(v) || 0) + delta)));
    const submit = (goNext) => { if (num !== null) onSave(num, goNext); };

    return (
        <Portal>
        <div className="fixed inset-0 z-[9980] bg-slate-900/50 flex items-start justify-center p-3 pt-6 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <form role="dialog" aria-label="กรอกจำนวนนับ" onSubmit={(e) => { e.preventDefault(); submit(hasNext); }}
                className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-4 space-y-4">
                <div className="flex items-start gap-3">
                    <Thumb src={imageUrl} size={56} />
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 leading-snug line-clamp-2">{item.ProductName}</div>
                        <div className="text-xs text-slate-400 truncate">{item.Location || 'ไม่ระบุสถานที่'}</div>
                        <div className="text-sm text-slate-600 mt-0.5">ในระบบ <b className="tabular-nums">{item.SystemQty}</b> {item.UnitOfMeasure || 'Pcs'}</div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="ปิด" className="p-2 -m-1 rounded-lg text-slate-400 hover:bg-slate-100"><X size={20} /></button>
                </div>

                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => bump(-1)} aria-label="ลด 1" className="w-16 h-16 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 active:bg-slate-200 flex items-center justify-center"><Minus size={24} /></button>
                    <input ref={inputRef} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint={hasNext ? 'next' : 'done'} aria-label="จำนวนที่นับได้"
                        value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))} onFocus={(e) => e.target.select()} placeholder="0"
                        className="flex-1 min-w-0 h-16 text-center text-4xl font-black tabular-nums rounded-2xl border-2 border-indigo-200 focus:border-indigo-500 focus:outline-none" />
                    <button type="button" onClick={() => bump(1)} aria-label="เพิ่ม 1" className="w-16 h-16 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 active:bg-slate-200 flex items-center justify-center"><Plus size={24} /></button>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setVal(String(item.SystemQty))} className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 text-sm font-semibold active:bg-indigo-100">= เท่ากับระบบ ({item.SystemQty})</button>
                    <div className="text-sm">ส่วนต่าง <DiffChip diff={d} /></div>
                </div>

                <div className={`grid gap-2 ${hasNext ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {hasNext && (
                        <button type="button" disabled={num === null} onClick={() => submit(false)} className="h-12 rounded-xl border border-slate-200 text-slate-700 font-bold disabled:opacity-40 active:bg-slate-100">บันทึก</button>
                    )}
                    <button type="submit" disabled={num === null} className="h-12 rounded-xl bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-600/30 disabled:opacity-40 active:bg-indigo-700 inline-flex items-center justify-center gap-1.5">
                        <Check size={18} />{hasNext ? 'บันทึก & ถัดไป' : 'บันทึก'}
                    </button>
                </div>
            </form>
        </div>
        </Portal>
    );
};

const StockCountPage = () => {
    const { user } = useAuth();
    const canEditSC = useCan('stock-count', 'edit');
    const canAdjustSC = useCan('stock-count', 'adjust');
    const canDeleteSC = useCan('stock-count', 'delete');
    const canCountSC = useCanAct('stock-count', 'count');

    const [view, setView] = useState('list'); // list | count | report
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
    // ข้อความสำเร็จ/แจ้งเล็กน้อย แสดงเป็น toast หายเอง ไม่บังคับให้กด OK ทุกครั้ง
    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);
    const showAlert = (type, title, message, autoClose = null) => {
        if (type === 'success' || autoClose) {
            setToast({ type, title, message });
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setToast(null), autoClose || 1500);
            return;
        }
        setAlertModal({ isOpen: true, type, title, message, autoClose });
    };

    // ── รายการรอบนับ ──
    const [sessions, setSessions] = useState([]);
    const [listStatus, setListStatus] = useState('all');
    const [listSearch, setListSearch] = useState('');
    const [loadingList, setLoadingList] = useState(false);

    // ── นับสต็อก ──
    const [allProducts, setAllProducts] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [countingList, setCountingList] = useState([]);
    const [scanInput, setScanInput] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [countFilter, setCountFilter] = useState('all'); // all | uncounted | diff | match
    const [countSearch, setCountSearch] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const [saveState, setSaveState] = useState({}); // ItemID -> saving | saved | error
    const scanInputRef = useRef(null);
    const dropdownRef = useRef(null);
    const searchTimeoutRef = useRef(null);
    const saveTimersRef = useRef({});
    const saveSeqRef = useRef({});
    const [uncountedOpen, setUncountedOpen] = useState(true); // รายการที่ยังไม่ได้นับ: เปิดไว้เป็นค่าเริ่มต้น
    const [uncountedQ, setUncountedQ] = useState('');
    const [mTab, setMTab] = useState('todo'); // มือถือ: todo | done
    const [mSearch, setMSearch] = useState('');
    const [mDoneFilter, setMDoneFilter] = useState('all'); // all | diff | match
    const [confirmReview, setConfirmReview] = useState(false); // หน้าต่างตรวจสอบก่อนยืนยันการนับ
    const [reviewChecked, setReviewChecked] = useState(false);
    const [sheetItemId, setSheetItemId] = useState(null); // รายการที่เปิดหน้าต่างกรอกจำนวน (มือถือ)
    const isNarrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;

    // ── รายงานรอบนับ ──
    const [report, setReport] = useState(null); // { session, items }
    const [reportSearch, setReportSearch] = useState('');
    const [reportFilter, setReportFilter] = useState('all');
    const [editing, setEditing] = useState(false);
    const [editItems, setEditItems] = useState([]);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isAdjusting, setIsAdjusting] = useState(false);
    const [reportPrev, setReportPrev] = useState(null); // สรุปรอบก่อนหน้าไว้เทียบ
    const [adjustPreview, setAdjustPreview] = useState(false);
    const [adjustAck, setAdjustAck] = useState(false); // ติ๊กยอมรับก่อนปรับยอด
    const [reportAdjustInfo, setReportAdjustInfo] = useState(null); // { date, user } จากรายการเคลื่อนไหว "Stock Count Adjust"
    const [moveItem, setMoveItem] = useState(null); // รายการที่เปิดดูการเคลื่อนไหว
    const [moveData, setMoveData] = useState({ loading: false, rows: [], error: '' });
    const [showGroupTables, setShowGroupTables] = useState(false);
    const [rFilterLoc, setRFilterLoc] = useState('all');
    const [rFilterType, setRFilterType] = useState('all');
    const [rMinDiff, setRMinDiff] = useState(0);
    const [rSort, setRSort] = useState({ key: 'value', dir: 'desc' });
    const [rPage, setRPage] = useState(1);       // รายงาน: หน้าตารางรายการ
    const [cPage, setCPage] = useState(1);       // นับ (จอคอม): หน้าตารางนับ
    const [mPage, setMPage] = useState(1);       // นับ (มือถือ): หน้าแท็บ
    const [uPage, setUPage] = useState(1);       // รายการยังไม่ได้นับ
    const [sPage, setSPage] = useState(1);       // รายการรอบนับ

    // เปลี่ยนตัวกรอง/ค้นหา → กลับหน้า 1
    useEffect(() => { setRPage(1); }, [report, rFilterLoc, rFilterType, rMinDiff, reportFilter, reportSearch, rSort]);
    useEffect(() => { setCPage(1); }, [activeSession, countFilter, countSearch]);
    useEffect(() => { setMPage(1); }, [activeSession, mTab, mSearch, mDoneFilter]);
    useEffect(() => { setUPage(1); }, [activeSession, uncountedQ]);
    useEffect(() => { setSPage(1); }, [listStatus, listSearch]);

    // ── โหลดข้อมูล ──
    const fetchSessions = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions`);
            if (res.ok) setSessions(await res.json());
        } catch (err) { console.error('Failed to fetch sessions:', err); }
        setLoadingList(false);
    }, []);

    const fetchAllProducts = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/products`);
            if (res.ok) setAllProducts(await res.json());
        } catch (err) { console.error('Failed to fetch products:', err); }
    }, []);

    useEffect(() => { fetchSessions(); fetchAllProducts(); }, [fetchSessions, fetchAllProducts]);

    // ปิด dropdown เมื่อคลิกนอกช่องค้นหา
    useEffect(() => {
        const onDown = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    // มือถือไม่โฟกัสช่องค้นหาอัตโนมัติ (คีย์บอร์ดจะเด้งบังจอ)
    useEffect(() => { if (view === 'count' && activeSession && !isNarrow()) scanInputRef.current?.focus(); }, [view, activeSession]);

    // ── รอบนับ: สร้าง/เปิด/ยกเลิก ──
    const handleCreateSession = async () => {
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Note: '' })
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); return showAlert('error', 'ผิดพลาด', d.error || 'สร้างรอบนับไม่ได้'); }
            const data = await res.json();
            setActiveSession(data.session);
            setCountingList([]);
            setSaveState({});
            setCountFilter('all');
            setCountSearch('');
            setView('count');
            fetchSessions();
        } catch (err) { showAlert('error', 'ผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
    };

    // เปิดรอบร่างเพื่อนับต่อ หรือเปิดรายงานของรอบที่ยืนยันแล้ว
    const openSession = async (session) => {
        if (session.Status === 'Draft') {
            try {
                const res = await fetch(`${API_BASE}/stock-count/sessions/${session.SessionID}`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                setActiveSession(data.session);
                setCountingList(data.items);
                setSaveState({});
                setCountFilter('all');
                setCountSearch('');
                setView('count');
            } catch (err) { showAlert('error', 'ผิดพลาด', 'เปิดรอบนับไม่ได้'); }
            return;
        }
        loadReport(session.SessionID);
    };

    // สรุปรอบก่อนหน้า (รอบที่ยืนยันหรือปรับแล้วล่าสุดก่อนรอบนี้) เพื่อเทียบ
    const loadPrev = async (session) => {
        const prevS = sessions
            .filter(x => x.SessionID !== session.SessionID && x.Status !== 'Draft' && new Date(x.CountDate) < new Date(session.CountDate))
            .sort((a, b) => new Date(b.CountDate) - new Date(a.CountDate))[0];
        if (!prevS) { setReportPrev(null); return; }
        try {
            const r = await fetch(`${API_BASE}/stock-count/sessions/${prevS.SessionID}`);
            if (!r.ok) { setReportPrev(null); return; }
            const d = await r.json();
            const c = d.items.filter(isCounted);
            const df = c.filter(i => diffOf(i) !== 0);
            setReportPrev({ code: prevS.SessionCode, date: prevS.CountDate, total: d.items.length, counted: c.length, diff: df.length, net: df.reduce((s, i) => s + diffOf(i), 0), accuracy: pct(c.length - df.length, c.length) });
        } catch (err) { setReportPrev(null); }
    };

    // เวลา/ผู้ปรับยอด: ไม่มีในตารางรอบนับ จึงดูจากรายการเคลื่อนไหวที่ระบบสร้างตอนปรับยอด
    const loadAdjustInfo = async (data) => {
        if (data?.session?.Status !== 'Adjusted') return;
        const probe = data.items.find(i => isCounted(i) && diffOf(i) !== 0);
        if (!probe) return;
        try {
            const r = await fetch(`${API_BASE}/transactions?productId=${probe.ProductID}&startDate=${ymd(data.session.CountDate)}`);
            if (!r.ok) return;
            const rows = await r.json();
            const list = Array.isArray(rows) ? rows : rows.data || [];
            const t = list.find(x => String(x.RefInfo || '') === `Stock Count Adjust: ${data.session.SessionCode}`);
            if (t) setReportAdjustInfo({ date: t.TransDate, user: t.UserID });
        } catch { /* ไม่มีข้อมูลก็แสดงแบบไม่มีเวลา */ }
    };

    // การเคลื่อนไหวของสินค้า ตั้งแต่รอบนับก่อน (หรือ 90 วันก่อนนับ) ถึงวันนี้
    const openMoves = async (item) => {
        setMoveItem(item);
        setMoveData({ loading: true, rows: [], error: '' });
        const countDate = new Date(report.session.CountDate);
        const from = reportPrev?.date ? new Date(reportPrev.date) : new Date(countDate.getTime() - 90 * 86400000);
        try {
            const r = await fetch(`${API_BASE}/transactions?productId=${item.ProductID}&startDate=${ymd(from)}`);
            if (!r.ok) throw new Error('โหลดไม่สำเร็จ');
            const rows = await r.json();
            setMoveData({ loading: false, rows: Array.isArray(rows) ? rows : rows.data || [], error: '', from });
        } catch (err) { setMoveData({ loading: false, rows: [], error: err.message || 'โหลดไม่สำเร็จ', from }); }
    };

    const loadReport = async (sessionId) => {
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${sessionId}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            setReport(data);
            setAdjustPreview(false);
            setReportAdjustInfo(null);
            loadAdjustInfo(data);
            setRFilterLoc('all'); setRFilterType('all'); setRMinDiff(0);
            loadPrev(data.session);
            setEditing(false);
            setReportSearch('');
            setReportFilter('all');
            setView('report');
        } catch (err) { showAlert('error', 'ผิดพลาด', 'โหลดรายงานไม่ได้'); }
    };

    // ยกเลิกรอบร่าง (ลบจากฐาน) ต้องยืนยันก่อน
    const cancelDraft = () => {
        setAlertModal({
            isOpen: true, type: 'confirm', title: 'ยกเลิกรอบนับนี้?',
            message: `รายการนับ ${countingList.length} รายการจะหายไปทั้งหมดและกู้คืนไม่ได้`,
            confirmText: 'ยกเลิกรอบ', cancelText: 'กลับไปนับ',
            onConfirm: async () => {
                setAlertModal(p => ({ ...p, isOpen: false }));
                try {
                    const res = await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}`, { method: 'DELETE' });
                    if (!res.ok) { const d = await res.json().catch(() => ({})); return showAlert('error', 'ยกเลิกไม่สำเร็จ', d.error || 'ลบรอบร่างไม่ได้'); }
                } catch (err) { return showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
                setActiveSession(null); setCountingList([]); setView('list'); fetchSessions();
            },
            onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
        });
    };

    // ลบรอบจากรายการ (ร่างลบได้ทุกคน รอบอื่นตามสิทธิ์ที่เซิร์ฟเวอร์กำหนด)
    const deleteSessionFromList = (session, e) => {
        e.stopPropagation();
        setAlertModal({
            isOpen: true, type: 'danger', title: 'ลบรอบนับ?',
            message: `ลบรอบ ${session.SessionCode} ? การลบไม่สามารถย้อนกลับได้`,
            confirmText: 'ลบ', cancelText: 'ยกเลิก',
            onConfirm: async () => {
                setAlertModal(p => ({ ...p, isOpen: false }));
                try {
                    const res = await fetch(`${API_BASE}/stock-count/sessions/${session.SessionID}`, { method: 'DELETE' });
                    if (!res.ok) { const d = await res.json().catch(() => ({})); return showAlert('error', 'ลบไม่ได้', d.error || 'ไม่สามารถลบได้'); }
                    showAlert('success', 'ลบแล้ว', `ลบรอบ ${session.SessionCode} เรียบร้อย`, 1500);
                    fetchSessions();
                } catch (err) { showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
            },
            onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
        });
    };

    // ── เพิ่มสินค้า ──
    const handleSearchInput = (value) => {
        setScanInput(value);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (!value.trim()) { setSearchResults([]); setShowDropdown(false); return; }
        searchTimeoutRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch(`${API_BASE}/stock-count/search?q=${encodeURIComponent(value.trim())}`);
                if (res.ok) { const data = await res.json(); setSearchResults(data); setShowDropdown(data.length > 0); }
            } catch (err) { console.error('Search error:', err); }
            setIsSearching(false);
        }, 300);
    };

    const addProductToSession = async (product, { quiet = false } = {}) => {
        if (!activeSession) return;
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}/items`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ProductID: product.ProductID })
            });
            const data = await res.json();
            if (res.ok) {
                setCountingList(prev => [data.item, ...prev]);
                setScanInput(''); setSearchResults([]); setShowDropdown(false);
                if (isNarrow()) setSheetItemId(data.item.ItemID); // มือถือ: เปิดช่องกรอกจำนวนทันที
                else scanInputRef.current?.focus();
                if (!quiet) showAlert('success', 'เพิ่มแล้ว', product.ProductName, 1000);
            } else if (data.duplicate) {
                const existing = countingList.find(i => i.ProductID === product.ProductID);
                if (existing && isNarrow()) setSheetItemId(existing.ItemID); // มือถือ: มีแล้ว → เปิดกรอกจำนวนเลย
                else showAlert('info', 'มีแล้ว', `${product.ProductName} อยู่ในรายการนับแล้ว`, 1500);
            } else {
                showAlert('error', 'ผิดพลาด', data.error || 'เพิ่มรายการไม่ได้');
            }
        } catch (err) { showAlert('error', 'ผิดพลาด', 'ไม่สามารถเพิ่มรายการได้'); }
        setScanInput(''); setShowDropdown(false);
    };

    // กด Enter: ใช้ผลค้นหาสดจากเซิร์ฟเวอร์เสมอ
    const handleScanSubmit = async (e) => {
        e.preventDefault();
        if (!scanInput.trim() || !activeSession) return;
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        setIsSearching(true);
        try {
            const res = await fetch(`${API_BASE}/stock-count/search?q=${encodeURIComponent(scanInput.trim())}`);
            if (res.ok) {
                const data = await res.json();
                if (data.length === 1) await addProductToSession(data[0]);
                else if (data.length > 1) { setSearchResults(data); setShowDropdown(true); }
                else showAlert('error', 'ไม่พบ', `ไม่พบรายการอุปกรณ์: ${scanInput}`, 2000);
            }
        } catch (err) { showAlert('error', 'ผิดพลาด', 'ไม่สามารถค้นหาได้'); }
        setIsSearching(false);
    };

    // ── จำนวนนับ: หน่วงเวลารายแถว + ลำดับคำขอ + แจ้งเมื่อไม่สำเร็จ ──
    const persistQty = async (sessionId, itemId, numVal) => {
        const seq = (saveSeqRef.current[itemId] || 0) + 1;
        saveSeqRef.current[itemId] = seq;
        setSaveState(prev => ({ ...prev, [itemId]: 'saving' }));
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${sessionId}/items/${itemId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ActualQty: numVal })
            });
            if (seq !== saveSeqRef.current[itemId]) return;
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'บันทึกไม่สำเร็จ'); }
            setSaveState(prev => ({ ...prev, [itemId]: 'saved' }));
        } catch (err) {
            if (seq !== saveSeqRef.current[itemId]) return;
            setSaveState(prev => ({ ...prev, [itemId]: 'error' }));
            showAlert('error', 'บันทึกจำนวนนับไม่สำเร็จ', err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
        }
    };

    const handleUpdateQty = (itemId, value) => {
        let numVal = null; // null = ยังไม่นับ
        if (value !== '' && value !== null && value !== undefined) {
            const n = typeof value === 'number' ? value : Number(String(value).trim());
            if (!Number.isInteger(n) || n < 0) { showAlert('error', 'จำนวนไม่ถูกต้อง', 'กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป', 1500); return; }
            numVal = n;
        }
        setCountingList(prev => prev.map(i => i.ItemID === itemId ? { ...i, ActualQty: numVal } : i));
        if (!activeSession) return;
        clearTimeout(saveTimersRef.current[itemId]);
        setSaveState(prev => ({ ...prev, [itemId]: 'saving' }));
        saveTimersRef.current[itemId] = setTimeout(() => {
            delete saveTimersRef.current[itemId];
            persistQty(activeSession.SessionID, itemId, numVal);
        }, 400);
    };

    // บันทึกทันที (จากหน้าต่างกรอกบนมือถือ) — ไม่หน่วงเวลา
    const saveQtyNow = (itemId, numVal) => {
        if (!Number.isInteger(numVal) || numVal < 0) { showAlert('error', 'จำนวนไม่ถูกต้อง', 'กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป', 1500); return false; }
        if (!activeSession) return false;
        setCountingList(prev => prev.map(i => i.ItemID === itemId ? { ...i, ActualQty: numVal } : i));
        clearTimeout(saveTimersRef.current[itemId]);
        delete saveTimersRef.current[itemId];
        persistQty(activeSession.SessionID, itemId, numVal);
        return true;
    };

    // แถบ "เลิกทำ" หลังลบรายการ — หายเองใน 8 วินาที
    const [undoBar, setUndoBar] = useState(null);
    const undoTimerRef = useRef(null);
    const showUndo = (label, run) => {
        clearTimeout(undoTimerRef.current);
        setUndoBar({ label, run, busy: false });
        undoTimerRef.current = setTimeout(() => setUndoBar(null), 8000);
    };
    const runUndo = async () => {
        if (!undoBar || undoBar.busy) return;
        clearTimeout(undoTimerRef.current);
        setUndoBar(b => ({ ...b, busy: true }));
        try { await undoBar.run(); setUndoBar(null); }
        catch (err) { setUndoBar(null); showAlert('error', 'เลิกทำไม่สำเร็จ', err.message || 'กรุณาลองใหม่'); }
    };

    const removeItem = (item) => {
        setAlertModal({
            isOpen: true, type: 'confirm', title: 'ลบรายการนับ?',
            message: `ลบ "${item.ProductName}" ออกจากรอบนับ?`,
            confirmText: 'ลบ', cancelText: 'ยกเลิก',
            onConfirm: async () => {
                setAlertModal(p => ({ ...p, isOpen: false }));
                try {
                    const sessionId = activeSession.SessionID;
                    const res = await fetch(`${API_BASE}/stock-count/sessions/${sessionId}/items/${item.ItemID}`, { method: 'DELETE' });
                    if (res.ok) {
                        setCountingList(prev => prev.filter(i => i.ItemID !== item.ItemID));
                        showUndo(`ลบ "${item.ProductName}" แล้ว`, async () => {
                            // เพิ่มกลับ แล้วคืนจำนวนที่นับไว้ (ถ้ามี)
                            const add = await fetch(`${API_BASE}/stock-count/sessions/${sessionId}/items`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ProductID: item.ProductID })
                            });
                            const addData = await add.json().catch(() => ({}));
                            if (!add.ok || !addData.item) throw new Error(addData.error || 'เพิ่มกลับไม่สำเร็จ');
                            let restored = addData.item;
                            if (item.ActualQty !== null && item.ActualQty !== undefined) {
                                const put = await fetch(`${API_BASE}/stock-count/sessions/${sessionId}/items/${restored.ItemID}`, {
                                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ActualQty: item.ActualQty })
                                });
                                if (put.ok) restored = { ...restored, ActualQty: item.ActualQty };
                            }
                            setCountingList(prev => [restored, ...prev]);
                        });
                    }
                    else { const d = await res.json().catch(() => ({})); showAlert('error', 'ลบไม่ได้', d.error || 'ลบรายการไม่ได้'); }
                } catch (err) { showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
            },
            onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
        });
    };

    // ── สรุปรอบนับที่กำลังนับ ──
    const counts = useMemo(() => {
        const counted = countingList.filter(isCounted);
        const diffs = counted.filter(i => diffOf(i) !== 0);
        return {
            total: countingList.length,
            counted: counted.length,
            uncounted: countingList.length - counted.length,
            diff: diffs.length,
            match: counted.length - diffs.length,
            plus: diffs.reduce((s, i) => s + Math.max(0, diffOf(i)), 0),
            minus: diffs.reduce((s, i) => s + Math.min(0, diffOf(i)), 0),
        };
    }, [countingList]);

    // ขั้นปัจจุบันของการนับ (0 เริ่มรอบ, 1 เพิ่มสินค้า, 2 กรอกจำนวน, 3 ตรวจสอบ)
    const currentStep = !activeSession ? 0 : countingList.length === 0 ? 1 : counts.uncounted > 0 ? 2 : 3;

    // ── ยืนยันรอบนับ ──
    const handleConfirm = () => {
        if (!activeSession) return;
        if (Object.values(saveState).includes('saving') || Object.values(saveTimersRef.current).some(Boolean)) {
            return showAlert('info', 'กำลังบันทึก', 'รอให้การบันทึกจำนวนนับเสร็จก่อนแล้วค่อยยืนยัน', 2000);
        }
        if (Object.values(saveState).includes('error')) {
            return showAlert('error', 'บันทึกไม่สำเร็จ', 'มีรายการที่บันทึกไม่สำเร็จ กรุณากรอกจำนวนนับใหม่ก่อนยืนยัน');
        }
        if (countingList.length === 0) return showAlert('error', 'ไม่มีรายการ', 'กรุณาเพิ่มสินค้าก่อนยืนยัน');
        if (counts.uncounted > 0) return showAlert('error', 'กรอกไม่ครบ', `ยังไม่ได้กรอกจำนวนนับ ${counts.uncounted} รายการ`);
        setReviewChecked(false);
        setConfirmReview(true);
    };

    // ยืนยันจริง (กดจากหน้าต่างตรวจสอบ)
    const doConfirm = async () => {
        if (!activeSession) return;
        setConfirmReview(false);
        setIsConfirming(true);
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}/confirm`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ConfirmedBy: user?.username || user?.name })
            });
            if (res.ok) {
                const sid = activeSession.SessionID;
                setActiveSession(null); setCountingList([]); setSaveState({});
                fetchSessions();
                loadReport(sid);
                showAlert('success', 'ยืนยันการนับแล้ว', 'รอปรับยอดสต็อก', 2000);
            } else {
                const d = await res.json().catch(() => ({}));
                showAlert('error', 'ผิดพลาด', d.error || 'ยืนยันไม่ได้');
            }
        } catch (err) { showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
        setIsConfirming(false);
    };

    // จากหน้าต่างตรวจสอบ → กลับไปแก้รายการนั้น
    const editFromReview = (item) => {
        setConfirmReview(false);
        if (isNarrow()) { setSheetItemId(item.ItemID); return; }
        setCountFilter('all'); setCountSearch(item.ProductName);
        setTimeout(() => {
            const el = document.querySelector(`input[data-qty="${item.ItemID}"]`);
            if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); el.select?.(); }
        }, 50);
    };

    // ── รายงาน: ปรับยอด / แก้ไขจำนวนนับ ──
    // ปรับยอดจริง — เรียกจากหน้าต่าง "ตรวจก่อนปรับยอด" (หน้าต่างนั้นคือการยืนยัน ต้องติ๊กยอมรับก่อน)
    const handleAdjust = async () => {
        if (!report) return;
        const sid = report.session.SessionID;
        setIsAdjusting(true);
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${sid}/adjust`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ AdjustedBy: user?.username || user?.name })
            });
            if (res.ok) { setAdjustPreview(false); showAlert('success', 'ปรับยอดแล้ว', 'ปรับยอดสต็อกเรียบร้อย'); loadReport(sid); fetchSessions(); }
            else { const d = await res.json().catch(() => ({})); showAlert('error', 'ผิดพลาด', d.error || 'ปรับยอดไม่ได้'); }
        } catch (err) { showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
        setIsAdjusting(false);
    };

    const startEditing = () => {
        setEditItems(report.items.map(i => ({ ...i, newActualQty: i.ActualQty })));
        setEditing(true);
    };

    const saveEdit = async () => {
        const changed = editItems.filter(i => i.newActualQty !== i.ActualQty).map(i => ({ ItemID: i.ItemID, ActualQty: i.newActualQty }));
        if (changed.length === 0) { setEditing(false); return; }
        if (changed.some(i => i.ActualQty !== null && (!Number.isInteger(i.ActualQty) || i.ActualQty < 0))) {
            return showAlert('error', 'จำนวนไม่ถูกต้อง', 'จำนวนนับต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
        }
        setIsSavingEdit(true);
        const sid = report.session.SessionID;
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${sid}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: changed, ConfirmedBy: user?.username || user?.name })
            });
            if (res.ok) { showAlert('success', 'บันทึกแล้ว', 'แก้ไขจำนวนนับเรียบร้อย', 1500); loadReport(sid); }
            else { const d = await res.json().catch(() => ({})); showAlert('error', 'ผิดพลาด', d.error || 'บันทึกไม่ได้'); }
        } catch (err) { showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
        setIsSavingEdit(false);
    };

    // ── กรองรายการ ──
    const filteredSessions = useMemo(() => sessions.filter(s =>
        (listStatus === 'all' || s.Status === listStatus) &&
        (!listSearch.trim() || String(s.SessionCode).toLowerCase().includes(listSearch.trim().toLowerCase()))
    ), [sessions, listStatus, listSearch]);

    const listKpi = useMemo(() => ({
        total: sessions.length,
        draft: sessions.filter(s => s.Status === 'Draft').length,
        confirmed: sessions.filter(s => s.Status === 'Confirmed').length,
        adjusted: sessions.filter(s => s.Status === 'Adjusted').length,
    }), [sessions]);

    const visibleCount = useMemo(() => countingList.filter(i => {
        if (countFilter === 'uncounted' && isCounted(i)) return false;
        if (countFilter === 'diff' && (!isCounted(i) || diffOf(i) === 0)) return false;
        if (countFilter === 'match' && (!isCounted(i) || diffOf(i) !== 0)) return false;
        const q = countSearch.trim().toLowerCase();
        return !q || String(i.ProductName).toLowerCase().includes(q) || String(i.Location || '').toLowerCase().includes(q);
    }).sort((a, b) => String(a.Location || '').localeCompare(String(b.Location || ''), 'th') || String(a.ProductName).localeCompare(String(b.ProductName), 'th')), [countingList, countFilter, countSearch]);

    // กด Enter ในช่องจำนวนนับ → ไปช่องที่ยังว่างถัดไป
    const focusNextQty = (currentId) => {
        const inputs = Array.from(document.querySelectorAll('input[data-qty]'));
        const idx = inputs.findIndex(el => el.dataset.qty === String(currentId));
        const next = inputs.slice(idx + 1).find(el => !el.value) || inputs.find(el => !el.value);
        if (next) { next.focus(); next.select?.(); }
    };

    // ── ความคืบหน้าทั้งระบบ ──
    const productById = useMemo(() => new Map(allProducts.map(p => [p.ProductID, p])), [allProducts]);
    const activeProducts = useMemo(() => allProducts
        .filter(p => p.IsActive !== 0 && p.IsActive !== false)
        .sort((a, b) => String(a.Location || '').localeCompare(String(b.Location || ''), 'th') || String(a.ProductName).localeCompare(String(b.ProductName), 'th')),
    [allProducts]);
    const priceOf = (item) => Number(productById.get(item.ProductID)?.LastPrice ?? item.LastPrice ?? 0) || 0;
    const overall = useMemo(() => {
        const total = activeProducts.length;
        const counted = countingList.filter(isCounted).length;
        return { total, counted, remaining: Math.max(0, total - counted) };
    }, [activeProducts, countingList]);
    // สินค้าที่ยังไม่ได้เพิ่มเข้ารอบ (เรียงตามสถานที่)
    const uncountedProducts = useMemo(() => {
        const inList = new Set(countingList.map(i => i.ProductID));
        return activeProducts.filter(p => !inList.has(p.ProductID));
    }, [activeProducts, countingList]);
    // มูลค่าส่วนต่างโดยประมาณ (บาท) = ส่วนต่าง × ราคาล่าสุด
    const valueDiff = useMemo(() => countingList.filter(i => isCounted(i) && diffOf(i) !== 0)
        .reduce((s, i) => s + diffOf(i) * priceOf(i), 0), [countingList, productById]);

    // ── มือถือ: แท็บ "ต้องนับ" / "นับแล้ว" ──
    // ต้องนับ = รายการในรอบที่ยังไม่กรอก + สินค้าที่ยังไม่ได้เพิ่มเข้ารอบ (เรียงตามสถานที่ → ชื่อ) — นับแล้วจะหายไป รายการจึงสั้นลงเรื่อยๆ
    const byLocName = (a, b) => String(a.loc || '').localeCompare(String(b.loc || ''), 'th') || String(a.name).localeCompare(String(b.name), 'th');
    const mMatch = (name, loc) => {
        const q = mSearch.trim().toLowerCase();
        return !q || String(name).toLowerCase().includes(q) || String(loc || '').toLowerCase().includes(q);
    };
    const todoList = useMemo(() => [
        ...countingList.filter(i => !isCounted(i)).map(i => ({
            key: `i${i.ItemID}`, kind: 'item', item: i, name: i.ProductName, loc: i.Location,
            img: i.ImageURL || productById.get(i.ProductID)?.ImageURL, sys: i.SystemQty,
        })),
        ...uncountedProducts.map(p => ({
            key: `p${p.ProductID}`, kind: 'product', product: p, name: p.ProductName, loc: p.Location,
            img: p.ImageURL, sys: p.CurrentStock,
        })),
    ].filter(e => mMatch(e.name, e.loc)).sort(byLocName), [countingList, uncountedProducts, productById, mSearch]); // eslint-disable-line react-hooks/exhaustive-deps
    const doneList = useMemo(() => countingList
        .filter(isCounted)
        .filter(i => mDoneFilter === 'all' || (mDoneFilter === 'diff' ? diffOf(i) !== 0 : diffOf(i) === 0))
        .filter(i => mMatch(i.ProductName, i.Location))
        .map(i => ({ ...i, name: i.ProductName, loc: i.Location }))
        .sort(byLocName), [countingList, mDoneFilter, mSearch]); // eslint-disable-line react-hooks/exhaustive-deps
    const doneTotal = countingList.filter(isCounted).length;
    const todoTotal = countingList.filter(i => !isCounted(i)).length + uncountedProducts.length;

    // หน้าต่างกรอก: "ถัดไป" = รายการถัดไปในแท็บต้องนับ (ถ้ายังไม่อยู่ในรอบ จะเพิ่มให้อัตโนมัติ)
    const sheetItem = sheetItemId == null ? null : countingList.find(i => i.ItemID === sheetItemId) || null;
    const sheetNext = useMemo(() => {
        if (sheetItemId == null) return null;
        const isCur = (e) => e.kind === 'item' && e.item.ItemID === sheetItemId;
        const idx = todoList.findIndex(isCur);
        const order = idx < 0 ? todoList : [...todoList.slice(idx + 1), ...todoList.slice(0, idx)];
        return order.find(e => !isCur(e)) || null;
    }, [sheetItemId, todoList]);
    const closeSheet = useCallback(() => setSheetItemId(null), []);
    const openTodo = (e) => {
        if (e.kind === 'item') setSheetItemId(e.item.ItemID);
        else addProductToSession(e.product, { quiet: true });
    };
    const handleSheetSave = (numVal, goNext) => {
        if (!sheetItem || !saveQtyNow(sheetItem.ItemID, numVal)) return;
        showAlert('success', 'บันทึกแล้ว', `${sheetItem.ProductName} = ${numVal}`, 900);
        const next = goNext ? sheetNext : null;
        setSheetItemId(null);
        if (next) openTodo(next);
    };

    // ── รายงาน: สรุป ──
    const rep = useMemo(() => {
        if (!report) return null;
        const items = report.items;
        const counted = items.filter(isCounted);
        const diffs = counted.filter(i => diffOf(i) !== 0);
        return {
            total: items.length,
            counted: counted.length,
            diff: diffs.length,
            match: counted.length - diffs.length,
            plus: diffs.reduce((s, i) => s + Math.max(0, diffOf(i)), 0),
            minus: diffs.reduce((s, i) => s + Math.min(0, diffOf(i)), 0),
            topDiffs: [...diffs].sort((a, b) => Math.abs(diffOf(b)) - Math.abs(diffOf(a))).slice(0, 8),
        };
    }, [report]);

    const visibleReport = useMemo(() => (report ? report.items : []).filter(i => {
        if (reportFilter === 'diff' && (!isCounted(i) || diffOf(i) === 0)) return false;
        if (reportFilter === 'match' && (!isCounted(i) || diffOf(i) !== 0)) return false;
        const q = reportSearch.trim().toLowerCase();
        return !q || String(i.ProductName).toLowerCase().includes(q) || String(i.Location || '').toLowerCase().includes(q);
    }), [report, reportFilter, reportSearch]);

    const exportReport = () => {
        if (!report) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.items.map(i => ({
            'สินค้า': i.ProductName, 'ประเภท': i.DeviceType || '', 'สถานที่': i.Location || '', 'หน่วย': i.UnitOfMeasure || 'Pcs',
            'ในระบบ': i.SystemQty, 'นับได้': i.ActualQty ?? '', 'ส่วนต่าง': diffOf(i) ?? '',
        }))), 'รายการนับ');
        XLSX.writeFile(wb, `${report.session.SessionCode}.xlsx`);
    };

    // ═════════════════════════════ RENDER ═════════════════════════════
    const renderHeader = (title, subtitle, actions) => (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                {view !== 'list' && (
                    <button onClick={() => { setView('list'); fetchSessions(); }}
                        className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500" title="กลับไปรายการรอบนับ">
                        <ArrowLeft size={18} />
                    </button>
                )}
                <div className="min-w-0">
                    <h1 className="text-xl font-black text-slate-800 truncate">{title}</h1>
                    {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
    );

    // ── 1) รายการรอบนับ ──
    const renderList = () => (
        <div className="space-y-5">
            {renderHeader('ตรวจนับสต็อก', 'รายการรอบนับทั้งหมด เลือกรอบเพื่อนับต่อหรือดูรายงาน', canCountSC && (
                <button onClick={handleCreateSession} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-sm shadow-indigo-600/30 hover:bg-indigo-700 transition">
                    <PlusCircle size={16} /> เริ่มรอบนับใหม่
                </button>
            ))}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="รอบนับทั้งหมด" value={listKpi.total} />
                <Kpi label="ฉบับร่าง (นับค้างอยู่)" value={listKpi.draft} tone="text-amber-600" />
                <Kpi label="ยืนยันแล้ว (ยังไม่ปรับ)" value={listKpi.confirmed} tone="text-indigo-600" />
                <Kpi label="ปรับยอดแล้ว" value={listKpi.adjusted} tone="text-emerald-600" />
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex flex-wrap gap-1.5">
                    {[['all', 'ทั้งหมด'], ['Draft', 'ฉบับร่าง'], ['Confirmed', 'ยืนยันแล้ว'], ['Adjusted', 'ปรับยอดแล้ว']].map(([v, l]) => (
                        <button key={v} onClick={() => setListStatus(v)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${listStatus === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>{l}</button>
                    ))}
                </div>
                <div className="relative md:ml-auto">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="ค้นหารหัสรอบ เช่น ITS-2026"
                        className="h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
            </div>

            {loadingList && sessions.length === 0 ? (
                <div className="py-16 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={22} />กำลังโหลด…</div>
            ) : filteredSessions.length === 0 ? (
                <Card className="py-16 text-center">
                    <ClipboardList className="mx-auto text-slate-200 mb-3" size={48} />
                    <p className="text-slate-500 font-medium">{sessions.length === 0 ? 'ยังไม่มีรอบนับ' : 'ไม่พบรอบนับที่ตรงกับตัวกรอง'}</p>
                    {canCountSC && sessions.length === 0 && <p className="text-xs text-slate-400 mt-1">กด "เริ่มรอบนับใหม่" เพื่อเริ่มนับ</p>}
                </Card>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {paginate(filteredSessions, sPage, 12).pageRows.map(s => {
                        const isDraft = s.Status === 'Draft';
                        return (
                            <Card key={s.SessionID} className="p-4 hover:border-indigo-300 hover:shadow-md transition cursor-pointer">
                                <div onClick={() => openSession(s)} className="space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{s.SessionCode}</span>
                                        <StatusBadge status={s.Status} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                                        <span className="flex items-center gap-1"><Clock size={12} />{fmtDate(s.CountDate)}</span>
                                        <span className="flex items-center gap-1"><ClipboardList size={12} />{s.TotalItems ?? 0} รายการ</span>
                                        <span className="flex items-center gap-1"><AlertCircle size={12} className={s.Variances > 0 ? 'text-red-500' : 'text-slate-300'} />ส่วนต่าง {s.Variances ?? 0}</span>
                                        <span className="truncate">{s.ConfirmedBy ? `โดย ${s.ConfirmedBy}` : '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between pt-1">
                                        <span className={`text-xs font-bold ${isDraft ? 'text-amber-600' : 'text-indigo-600'} flex items-center gap-1`}>
                                            {isDraft ? <><ScanLine size={13} />นับต่อ</> : <><Eye size={13} />ดูรายงาน</>}
                                        </span>
                                        {canDeleteSC && isDraft && (
                                            <button onClick={(e) => deleteSessionFromList(s, e)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50" title="ลบรอบร่าง"><Trash2 size={14} /></button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
            <PagerBar {...paginate(filteredSessions, sPage, 12)} setPage={setSPage} />
        </div>
    );

    // ตรวจสอบก่อนยืนยันการนับ (ขั้นที่ 4)
    const bigDiff = (i) => { const d = Math.abs(diffOf(i) || 0); return d >= 5 || (i.SystemQty > 0 && d / i.SystemQty >= 0.5) || (i.SystemQty === 0 && d > 0); };
    const renderConfirmReview = () => {
        if (!confirmReview || !activeSession) return null;
        const diffRows = countingList.filter(i => isCounted(i) && diffOf(i) !== 0)
            .sort((a, b) => Math.abs(diffOf(b) * priceOf(b)) - Math.abs(diffOf(a) * priceOf(a)) || Math.abs(diffOf(b)) - Math.abs(diffOf(a)));
        const bigCount = diffRows.filter(bigDiff).length;
        const needCheck = diffRows.length > 0;
        return (
            <Portal>
            <div className="fixed inset-0 z-[9980] bg-slate-900/50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) setConfirmReview(false); }}>
                <div role="dialog" aria-label="ตรวจสอบก่อนยืนยันการนับ" className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
                    <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start gap-3">
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-800">ตรวจสอบก่อนยืนยันการนับ</h3>
                            <p className="text-xs text-slate-500">รอบ {activeSession.SessionCode} · ยืนยันแล้วยังไม่เปลี่ยนสต็อกจริง ต้องกด "ปรับยอดสต็อก" อีกขั้นในหน้ารายงาน</p>
                        </div>
                        <button type="button" onClick={() => setConfirmReview(false)} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                    </div>
                    <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <Kpi label="นับในรอบนี้" value={counts.total} />
                            <Kpi label="ตรงกับระบบ" value={counts.match} tone="text-emerald-600" />
                            <Kpi label="มีส่วนต่าง" value={counts.diff} tone={counts.diff ? 'text-red-600' : 'text-slate-800'} sub={`+${counts.plus} / ${counts.minus} ชิ้น`} />
                            <Kpi label="มูลค่าส่วนต่าง" value={`${valueDiff < 0 ? '−' : ''}฿${Math.abs(Math.round(valueDiff)).toLocaleString()}`} tone={valueDiff < 0 ? 'text-red-600' : valueDiff > 0 ? 'text-emerald-600' : 'text-slate-800'} />
                        </div>

                        {uncountedProducts.length > 0 && (
                            <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex gap-2">
                                <AlertCircle size={16} className="shrink-0 mt-px" />
                                <span>ยังมีสินค้า <b>{uncountedProducts.length}</b> รายการที่ไม่ได้อยู่ในรอบนี้ — จะไม่ถูกนับ/ไม่ถูกปรับยอด ถ้าตั้งใจนับทั้งคลังให้กลับไปนับให้ครบก่อน</span>
                            </div>
                        )}
                        {bigCount > 0 && (
                            <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex gap-2">
                                <AlertCircle size={16} className="shrink-0 mt-px" />
                                <span>มี <b>{bigCount}</b> รายการที่ส่วนต่างมากผิดปกติ (⚠) ลองนับซ้ำก่อนยืนยัน</span>
                            </div>
                        )}

                        <div>
                            <div className="text-sm font-bold text-slate-700 mb-2">รายการที่มีส่วนต่าง ({diffRows.length})</div>
                            {diffRows.length === 0 ? (
                                <div className="py-6 text-center text-sm text-emerald-600 flex items-center justify-center gap-2"><CheckCircle2 size={18} />ทุกรายการตรงกับระบบ</div>
                            ) : (
                                <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
                                    {diffRows.map(i => {
                                        const d = diffOf(i);
                                        const v = d * priceOf(i);
                                        return (
                                            <div key={i.ItemID} className={`flex items-center gap-3 px-3 py-2.5 ${bigDiff(i) ? 'bg-red-50/50' : ''}`}>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-semibold text-slate-800 truncate">{bigDiff(i) && <span title="ส่วนต่างมาก">⚠ </span>}{i.ProductName}</div>
                                                    <div className="text-[11px] text-slate-400 truncate">{i.Location || 'ไม่ระบุสถานที่'} · ระบบ {i.SystemQty} → นับได้ <b className="text-slate-600">{i.ActualQty}</b>{v ? ` · ${v < 0 ? '−' : '+'}฿${Math.abs(Math.round(v)).toLocaleString()}` : ''}</div>
                                                </div>
                                                <DiffChip diff={d} />
                                                {canCountSC && <button type="button" onClick={() => editFromReview(i)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 shrink-0">แก้</button>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="px-4 sm:px-6 py-4 border-t border-slate-100 space-y-3">
                        {needCheck && (
                            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={reviewChecked} onChange={e => setReviewChecked(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
                                <span>ฉันตรวจสอบรายการที่มีส่วนต่าง {diffRows.length} รายการแล้ว</span>
                            </label>
                        )}
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                            <button type="button" onClick={() => setConfirmReview(false)} className="h-11 sm:h-10 px-4 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50">กลับไปแก้</button>
                            <button type="button" onClick={doConfirm} disabled={isConfirming || (needCheck && !reviewChecked)}
                                className="h-11 sm:h-10 px-5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                                {isConfirming ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}ยืนยันการนับ
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            </Portal>
        );
    };

    // มือถือ: 2 แท็บ — ต้องนับ (สั้นลงเรื่อยๆ) / นับแล้ว
    const renderMobileCount = () => {
        const rows = mTab === 'todo' ? todoList : doneList;
        const mPg = paginate(rows, mPage, 30);
        let lastLoc = null;
        const locHeader = (loc) => {
            const l = loc || 'ไม่ระบุสถานที่';
            if (l === lastLoc) return null;
            lastLoc = l;
            return <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-bold text-slate-500 border-y border-slate-100">{l}</div>;
        };
        return (
            <Card className="md:hidden overflow-hidden">
                <div className="p-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl" role="tablist">
                        {[['todo', 'ต้องนับ', todoTotal], ['done', 'นับแล้ว', doneTotal]].map(([v, l, n]) => (
                            <button key={v} type="button" role="tab" aria-selected={mTab === v} onClick={() => setMTab(v)}
                                className={`h-10 rounded-lg text-sm font-bold transition ${mTab === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
                                {l} <span className={`tabular-nums ${mTab === v ? (v === 'todo' ? 'text-amber-600' : 'text-emerald-600') : 'text-slate-400'}`}>({n})</span>
                            </button>
                        ))}
                    </div>
                    <input value={mSearch} onChange={e => setMSearch(e.target.value)} placeholder="ค้นหาชื่อ / สถานที่"
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                    {mTab === 'done' && (
                        <div className="flex gap-2">
                            {[['all', 'ทั้งหมด'], ['diff', 'มีส่วนต่าง'], ['match', 'ตรงแล้ว']].map(([v, l]) => (
                                <button key={v} type="button" onClick={() => setMDoneFilter(v)}
                                    className={`px-3 h-8 rounded-lg text-xs font-bold border ${mDoneFilter === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>{l}</button>
                            ))}
                        </div>
                    )}
                    <p className="text-[11px] text-slate-400">{mTab === 'todo' ? 'แตะรายการเพื่อกรอกจำนวน · นับแล้วจะย้ายไปแท็บ "นับแล้ว"' : 'แตะรายการเพื่อแก้จำนวน'}</p>
                </div>

                {rows.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-sm px-4">
                        {mSearch.trim() ? 'ไม่พบรายการที่ค้นหา'
                            : mTab === 'todo' ? <><CheckCircle2 className="mx-auto mb-2 text-emerald-400" size={36} />นับครบทุกรายการแล้ว · กด "ยืนยันการนับ" ด้านล่าง</>
                            : 'ยังไม่มีรายการที่นับแล้ว'}
                    </div>
                ) : (
                    <div>
                        {mPg.pageRows.map(e => {
                            if (mTab === 'todo') {
                                return (
                                    <React.Fragment key={e.key}>
                                        {locHeader(e.loc)}
                                        <button type="button" disabled={!activeSession || !canCountSC} onClick={() => openTodo(e)}
                                            className="w-full flex items-center gap-3 px-3 py-3 text-left border-b border-slate-100 active:bg-indigo-50 disabled:opacity-60">
                                            <Thumb src={e.img} size={40} />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{e.name}</div>
                                                <div className="text-[11px] text-slate-400">ในระบบ {e.sys}{e.kind === 'item' && <span className="ml-1.5 px-1.5 py-px rounded bg-amber-50 text-amber-700 font-semibold">อยู่ในรอบแล้ว</span>}</div>
                                            </div>
                                            <ChevronRight size={18} className="text-slate-300 shrink-0" />
                                        </button>
                                    </React.Fragment>
                                );
                            }
                            const d = diffOf(e);
                            const st = saveState[e.ItemID];
                            return (
                                <React.Fragment key={e.ItemID}>
                                    {locHeader(e.loc)}
                                    <div className={`flex items-center gap-1 pr-1 border-b border-slate-100 ${d !== 0 ? 'bg-red-50/40' : ''}`}>
                                        <button type="button" disabled={!canCountSC} onClick={() => setSheetItemId(e.ItemID)}
                                            className="flex-1 min-w-0 flex items-center gap-3 pl-3 py-3 text-left active:bg-indigo-50 disabled:opacity-60">
                                            <Thumb src={e.ImageURL || productById.get(e.ProductID)?.ImageURL} size={40} />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{e.ProductName}</div>
                                                <div className="text-[11px] text-slate-400">ในระบบ {e.SystemQty}</div>
                                                {st === 'saving' && <div className="text-[10px] text-amber-600">กำลังบันทึก</div>}
                                                {st === 'error' && <div className="text-[10px] text-red-600 font-semibold">บันทึกไม่สำเร็จ · แตะเพื่อลองใหม่</div>}
                                            </div>
                                            <div className="text-right shrink-0 min-w-[3rem]">
                                                <div className="text-2xl font-black tabular-nums leading-none text-slate-800">{e.ActualQty}</div>
                                                <div className="mt-1"><DiffChip diff={d} /></div>
                                            </div>
                                        </button>
                                        {canCountSC && <button onClick={() => removeItem(e)} className="p-2.5 rounded-lg text-slate-300 active:text-red-500 active:bg-red-50" aria-label="ลบรายการ"><Trash2 size={16} /></button>}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                        <div className="px-3 pb-3"><PagerBar {...mPg} setPage={(n) => { setMPage(n); document.querySelector('[role=tablist]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }} /></div>
                    </div>
                )}
            </Card>
        );
    };

    // สินค้าที่ยังไม่ได้เพิ่มเข้ารอบ (กดเพื่อเพิ่ม)
    const renderUncounted = () => {
        const q = uncountedQ.trim().toLowerCase();
        const list = q ? uncountedProducts.filter(p => String(p.ProductName).toLowerCase().includes(q) || String(p.Location || '').toLowerCase().includes(q)) : uncountedProducts;
        return (
            <Card className="p-4">
                <button type="button" onClick={() => setUncountedOpen(o => !o)} aria-expanded={uncountedOpen}
                    className="w-full text-sm font-bold text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><ChevronRight size={15} className={`text-slate-400 transition-transform ${uncountedOpen ? 'rotate-90' : ''}`} />ยังไม่ได้นับในระบบ</span>
                    <span className="text-xs font-normal text-slate-400">{uncountedProducts.length} รายการ</span>
                </button>
                {uncountedOpen && (<>
                    {uncountedProducts.length > 0 && (
                        <>
                            <p className="mt-1 text-[11px] text-slate-400">แตะรายการเพื่อเพิ่มเข้ารอบ<span className="md:hidden">และกรอกจำนวน</span></p>
                            <input value={uncountedQ} onChange={e => setUncountedQ(e.target.value)} placeholder="ค้นหาชื่อ / สถานที่"
                                className="mt-2 w-full h-9 md:h-8 px-3 rounded-lg border border-slate-200 text-sm md:text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                        </>
                    )}
                    <div className="mt-2 max-h-[60vh] md:max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {uncountedProducts.length === 0 ? <p className="text-xs text-slate-400 py-2">ไม่มีรายการที่เหลือ</p>
                            : list.length === 0 ? <p className="text-xs text-slate-400 py-2">ไม่พบรายการที่ค้นหา</p>
                            : paginate(list, uPage, 30).pageRows.map(p => (
                                <button key={p.ProductID} disabled={!activeSession || !canCountSC} onClick={() => addProductToSession(p)}
                                    className="w-full text-left py-2.5 md:py-2 flex items-center gap-2.5 hover:bg-indigo-50 active:bg-indigo-50 disabled:opacity-50">
                                    <Thumb src={p.ImageURL} size={30} />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm md:text-xs font-semibold text-slate-700 truncate">{p.ProductName}</div>
                                        <div className="text-[11px] md:text-[10px] text-slate-400 truncate">{p.Location || 'ไม่ระบุสถานที่'} · ในระบบ {p.CurrentStock}</div>
                                    </div>
                                    <Plus size={16} className="text-indigo-400 shrink-0" />
                                </button>
                            ))}
                        <PagerBar {...paginate(list, uPage, 30)} setPage={setUPage} />
                    </div>
                </>)}
            </Card>
        );
    };

    // ── 2) นับสต็อก (มีขั้นตอน) ──
    const cPg = paginate(visibleCount, cPage, 50);
    const renderCount = () => (
        <div className="space-y-5">
            {renderHeader('นับสต็อก', activeSession ? `รอบ ${activeSession.SessionCode}` : '', (
                <>
                    {activeSession && (
                        <button onClick={cancelDraft} className="px-3 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 bg-white hover:bg-red-50">ยกเลิกรอบ</button>
                    )}
                    <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"><Printer size={14} />พิมพ์ใบนับเปล่า</button>
                    <button onClick={() => { setView('list'); fetchSessions(); }} className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50">
                        พักไว้ กลับไปรายการ
                    </button>
                </>
            ))}

            <Card className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="text-sm font-bold text-slate-700 mr-auto">ความคืบหน้าทั้งระบบ</div>
                    <div className="text-center"><div className="text-xl font-black tabular-nums">{overall.total}</div><div className="text-[10px] text-slate-500">ทั้งหมด</div></div>
                    <div className="text-center"><div className="text-xl font-black tabular-nums text-emerald-600">{overall.counted}</div><div className="text-[10px] text-slate-500">นับแล้ว</div></div>
                    <div className="text-center"><div className="text-xl font-black tabular-nums text-amber-600">{overall.remaining}</div><div className="text-[10px] text-slate-500">เหลือ</div></div>
                    <div className="text-center"><div className={`text-xl font-black tabular-nums ${valueDiff < 0 ? 'text-red-600' : valueDiff > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{valueDiff < 0 ? '−' : ''}฿{Math.abs(Math.round(valueDiff)).toLocaleString()}</div><div className="text-[10px] text-slate-500">มูลค่าส่วนต่าง</div></div>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all" style={{ width: `${overall.total ? (overall.counted / overall.total) * 100 : 0}%` }} />
                </div>
                <div className="text-[11px] text-slate-400">
                    รอบนี้มี {countingList.length} รายการ · ยังไม่ได้เพิ่มเข้ารอบอีก {uncountedProducts.length} รายการ (ดูด้านซ้าย)
                </div>
            </Card>
            <Card className="p-4 hidden sm:block"><Stepper current={currentStep} /></Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* ซ้าย: เพิ่มสินค้า + ความคืบหน้า */}
                <div className="space-y-4">
                    <Card className="p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700"><ScanLine size={16} className="text-indigo-500" />ขั้นที่ 2: เพิ่มสินค้า</div>
                        <div ref={dropdownRef} className="relative">
                            <form onSubmit={handleScanSubmit}>
                                <div className="relative">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input ref={scanInputRef} value={scanInput} disabled={!activeSession || !canCountSC}
                                        onChange={e => handleSearchInput(e.target.value)} onFocus={() => searchResults.length && setShowDropdown(true)}
                                        placeholder="สแกนบาร์โค้ด หรือพิมพ์ชื่อ/รหัส แล้วกด Enter"
                                        className="w-full h-11 pl-9 pr-9 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50" />
                                    {isSearching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
                                </div>
                            </form>
                            {showDropdown && searchResults.length > 0 && (
                                <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-xl max-h-72 overflow-y-auto">
                                    {searchResults.map(p => (
                                        <button key={p.ProductID} onClick={() => addProductToSession(p)}
                                            className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 border-b border-slate-100 last:border-0">
                                            <div className="flex items-center gap-2.5"><Thumb src={p.ImageURL} size={34} /><span className="text-sm font-semibold text-slate-800 truncate">{p.ProductName}</span></div>
                                            <div className="text-[11px] text-slate-400">{p.Location || 'ไม่ระบุสถานที่'} · ในระบบ {p.CurrentStock}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {!activeSession && <p className="text-xs text-slate-400">กด "เริ่มรอบนับใหม่" จากหน้ารายการก่อน</p>}
                    </Card>

                    <Card className="p-4 space-y-3 hidden md:block">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-bold text-slate-700 flex items-center gap-2"><Target size={16} className="text-indigo-500" />ความคืบหน้า</div>
                            <span className="text-xs text-slate-500 tabular-nums">{counts.counted}/{counts.total}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${counts.total ? (counts.counted / counts.total) * 100 : 0}%` }} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl bg-slate-50 py-2"><div className="text-lg font-black tabular-nums">{counts.uncounted}</div><div className="text-[10px] text-slate-500">ยังไม่นับ</div></div>
                            <div className="rounded-xl bg-red-50 py-2"><div className="text-lg font-black tabular-nums text-red-600">{counts.diff}</div><div className="text-[10px] text-slate-500">มีส่วนต่าง</div></div>
                            <div className="rounded-xl bg-emerald-50 py-2"><div className="text-lg font-black tabular-nums text-emerald-600">{counts.match}</div><div className="text-[10px] text-slate-500">ตรงแล้ว</div></div>
                        </div>
                        <div className="text-xs flex items-center justify-between">
                            <span className="text-slate-500">ส่วนต่างสุทธิ (ชิ้น)</span>
                            <span className="font-bold tabular-nums">+{counts.plus} / {counts.minus}</span>
                        </div>
                        <SaveStatus saveState={saveState} />
                    </Card>

                    <div className="hidden md:block">{renderUncounted()}</div>
                </div>

                {/* ขวา: ตารางนับ */}
                <div className="lg:col-span-2 space-y-3">
                    {renderMobileCount()}
                    <Card className="p-4 space-y-3 hidden md:block">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="text-sm font-bold text-slate-700 flex items-center gap-2"><ClipboardList size={16} className="text-indigo-500" />ขั้นที่ 3: กรอกจำนวนนับ</div>
                            <span className="ml-auto text-xs text-slate-400">{visibleCount.length} จาก {countingList.length} แถว</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {[['all', 'ทั้งหมด'], ['uncounted', 'ยังไม่นับ'], ['diff', 'มีส่วนต่าง'], ['match', 'ตรงแล้ว']].map(([v, l]) => (
                                <button key={v} onClick={() => setCountFilter(v)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${countFilter === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>{l}</button>
                            ))}
                            <input value={countSearch} onChange={e => setCountSearch(e.target.value)} placeholder="ค้นหาในรายการนับ"
                                className="sm:ml-auto h-9 sm:h-8 px-3 rounded-lg border border-slate-200 text-sm sm:text-xs w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                        </div>
                    </Card>

                    <Card className="overflow-hidden hidden md:block">
                        {countingList.length === 0 ? (
                            <div className="py-16 text-center text-slate-400">
                                <ScanLine className="mx-auto mb-3 text-slate-200" size={44} />
                                <p className="font-medium">ยังไม่มีรายการนับ</p>
                                <p className="text-xs mt-1">สแกนหรือค้นหาสินค้า<span className="hidden lg:inline">ด้านซ้าย</span><span className="lg:hidden">ด้านบน หรือเลือกจาก "ยังไม่ได้นับในระบบ"</span> เพื่อเริ่มนับ</p>
                            </div>
                        ) : (<>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                                        <tr>
                                            <th className="px-4 py-2.5 text-left">สินค้า</th>
                                            <th className="px-3 py-2.5 text-right">ในระบบ</th>
                                            <th className="px-3 py-2.5 text-center">นับได้</th>
                                            <th className="px-3 py-2.5 text-center">ส่วนต่าง</th>
                                            <th className="px-2 py-2.5" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {cPg.pageRows.map(item => {
                                            const d = diffOf(item);
                                            const st = saveState[item.ItemID];
                                            return (
                                                <tr key={item.ItemID} className={`hover:bg-slate-50 ${d !== null && d !== 0 ? 'bg-red-50/30' : ''}`}>
                                                    <td className="px-4 py-2.5 min-w-[180px]">
                                                        <div className="flex items-center gap-2.5"><Thumb src={item.ImageURL || productById.get(item.ProductID)?.ImageURL} size={36} /><div className="font-semibold text-slate-800 truncate max-w-[220px]" title={item.ProductName}>{item.ProductName}</div></div>
                                                        <div className="text-[11px] text-slate-400">{item.Location || 'ไม่ระบุสถานที่'}</div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{item.SystemQty} <span className="text-[10px] text-slate-400">{item.UnitOfMeasure || 'Pcs'}</span></td>
                                                    <td className="px-3 py-2.5">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button disabled={!canCountSC} onClick={() => handleUpdateQty(item.ItemID, Math.max(0, (item.ActualQty || 0) - 1))}
                                                                className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center"><Minus size={13} /></button>
                                                            <input type="text" inputMode="numeric" disabled={!canCountSC} value={item.ActualQty ?? ''}
                                                                data-qty={item.ItemID}
                                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNextQty(item.ItemID); } }}
                                                                onChange={e => handleUpdateQty(item.ItemID, e.target.value)} placeholder="—"
                                                                className="w-20 h-8 text-center rounded-lg border border-slate-200 text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50" />
                                                            <button disabled={!canCountSC} onClick={() => handleUpdateQty(item.ItemID, (item.ActualQty || 0) + 1)}
                                                                className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center"><Plus size={13} /></button>
                                                        </div>
                                                        <div className="text-center mt-1">
                                                            <button disabled={!canCountSC} onClick={() => handleUpdateQty(item.ItemID, item.SystemQty)} className="text-[10px] font-semibold text-indigo-600 hover:underline disabled:opacity-40">= เท่ากับระบบ</button>
                                                            {st === 'saving' && <span className="ml-2 text-[10px] text-amber-600">กำลังบันทึก</span>}
                                                            {st === 'error' && <span className="ml-2 text-[10px] text-red-600 font-semibold">บันทึกไม่สำเร็จ</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center"><DiffChip diff={d} /></td>
                                                    <td className="px-2 py-2.5 text-center">
                                                        {canCountSC && <button onClick={() => removeItem(item)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50" title="ลบรายการ"><Trash2 size={14} /></button>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {visibleCount.length === 0 && (
                                            <tr><td colSpan={5} className="py-10 text-center text-slate-400 text-sm">ไม่มีแถวตามตัวกรองนี้</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 pb-3"><PagerBar {...cPg} setPage={setCPage} /></div>
                        </>)}
                    </Card>

                    {/* ขั้นที่ 4-5: ตรวจสอบและยืนยัน */}
                    <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 text-sm">
                            <div className="font-bold text-slate-700 flex items-center gap-2"><CheckCircle2 size={16} className="text-indigo-500" />ขั้นที่ 4–5: ตรวจสอบและยืนยัน</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                                {counts.total === 0 ? 'เพิ่มสินค้าก่อน' : counts.uncounted > 0 ? `ยังเหลืออีก ${counts.uncounted} รายการที่ต้องกรอกจำนวนนับ` : `พร้อมยืนยัน · มีส่วนต่าง ${counts.diff} รายการ`}
                            </div>
                        </div>
                        <button onClick={handleConfirm} disabled={!activeSession || isConfirming || !canCountSC || counts.total === 0}
                            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-sm shadow-indigo-600/30 hover:bg-indigo-700 disabled:opacity-40 disabled:shadow-none transition inline-flex items-center justify-center gap-2">
                            {isConfirming ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} ยืนยันการนับ
                        </button>
                    </Card>
                </div>
            </div>
        </div>
    );

    // ── 3) รายงานรอบนับ ──
    const renderReport = () => {
        if (!report || !rep) return <div className="py-16 text-center text-slate-400">ไม่มีข้อมูล</div>;
        const s = report.session;
        const canEditReport = canEditSC && s.Status === 'Confirmed';
        const canAdjustReport = canAdjustSC && s.Status === 'Confirmed';
        const valOf = (i) => (isCounted(i) ? diffOf(i) * priceOf(i) : 0);
        const locOf = (i) => i.Location || 'ไม่ระบุสถานที่';
        const typeOf = (i) => i.DeviceType || 'ไม่ระบุประเภท';

        const totalValue = report.items.reduce((sum, i) => sum + valOf(i), 0);
        const plusValue = report.items.reduce((sum, i) => sum + Math.max(0, valOf(i)), 0);
        const minusValue = report.items.reduce((sum, i) => sum + Math.min(0, valOf(i)), 0);

        // สรุปแยกกลุ่ม (เรียงตามมูลค่าที่กระทบมากที่สุด)
        const groupBy = (keyFn) => {
            const m = new Map();
            for (const i of report.items) {
                const k = keyFn(i);
                const g = m.get(k) || { key: k, total: 0, diff: 0, net: 0, value: 0 };
                g.total += 1;
                if (isCounted(i) && diffOf(i) !== 0) { g.diff += 1; g.net += diffOf(i); }
                g.value += valOf(i);
                m.set(k, g);
            }
            return [...m.values()].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        };
        const byLoc = groupBy(locOf);
        const byType = groupBy(typeOf);
        const locations = [...new Set(report.items.map(locOf))].sort((a, b) => a.localeCompare(b, 'th'));
        const types = [...new Set(report.items.map(typeOf))].sort((a, b) => a.localeCompare(b, 'th'));

        // กรอง
        const filtered = report.items.filter(i => {
            if (rFilterLoc !== 'all' && locOf(i) !== rFilterLoc) return false;
            if (rFilterType !== 'all' && typeOf(i) !== rFilterType) return false;
            if (reportFilter === 'diff' && (!isCounted(i) || diffOf(i) === 0)) return false;
            if (reportFilter === 'match' && (!isCounted(i) || diffOf(i) !== 0)) return false;
            if (rMinDiff > 0 && (!isCounted(i) || Math.abs(diffOf(i)) < rMinDiff)) return false;
            const q = reportSearch.trim().toLowerCase();
            return !q || String(i.ProductName).toLowerCase().includes(q) || String(i.Location || '').toLowerCase().includes(q);
        });

        // เรียง
        const sortVal = (i) => {
            switch (rSort.key) {
                case 'name': return String(i.ProductName);
                case 'loc': return locOf(i);
                case 'sys': return i.SystemQty;
                case 'act': return isCounted(i) ? i.ActualQty : -1;
                case 'diff': return isCounted(i) ? diffOf(i) : -1e9;
                default: return valOf(i);
            }
        };
        const sorted = [...filtered].sort((a, b) => {
            const x = sortVal(a), y = sortVal(b);
            const r = typeof x === 'string' ? x.localeCompare(y, 'th') : x - y;
            return rSort.dir === 'asc' ? r : -r;
        });
        const rPg = paginate(sorted, rPage, 25);
        const shown = rPg.pageRows;
        const toggleSort = (key) => setRSort(p => (p.key === key
            ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' }
            : { key, dir: key === 'name' || key === 'loc' ? 'asc' : 'desc' }));
        const SortTh = ({ k, label, right }) => (
            <th onClick={() => toggleSort(k)} className={`px-3 py-2 font-semibold cursor-pointer select-none hover:text-indigo-600 ${right ? 'text-right' : 'text-left'}`}>
                {label}{rSort.key === k ? (rSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
            </th>
        );

        // ตรวจก่อนปรับยอด
        const adjustRows = report.items.filter(i => isCounted(i) && diffOf(i) !== 0);
        const adjustPlusQty = adjustRows.filter(i => diffOf(i) > 0).reduce((t, i) => t + diffOf(i), 0);
        const adjustMinusQty = adjustRows.filter(i => diffOf(i) < 0).reduce((t, i) => t + diffOf(i), 0);

        // ส่งออก Excel หลาย sheet
        const exportAll = () => {
            const wb = XLSX.utils.book_new();
            const summary = [
                { 'หัวข้อ': 'รหัสรอบ', 'ค่า': s.SessionCode },
                { 'หัวข้อ': 'วันที่นับ', 'ค่า': fmtDate(s.CountDate) },
                { 'หัวข้อ': 'ผู้ยืนยัน', 'ค่า': s.ConfirmedBy || '' },
                { 'หัวข้อ': 'รายการทั้งหมด', 'ค่า': rep.total },
                { 'หัวข้อ': 'นับแล้ว', 'ค่า': rep.counted },
                { 'หัวข้อ': 'มีส่วนต่าง', 'ค่า': rep.diff },
                { 'หัวข้อ': 'ส่วนต่างสุทธิ (ชิ้น)', 'ค่า': rep.plus + rep.minus },
                { 'หัวข้อ': 'มูลค่าส่วนต่างสุทธิ (บาท)', 'ค่า': Math.round(totalValue) },
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'สรุป');
            const rowOf = (i) => ({
                'สินค้า': i.ProductName, 'ประเภท': typeOf(i), 'สถานที่': locOf(i), 'หน่วย': i.UnitOfMeasure || 'Pcs',
                'ในระบบ': i.SystemQty, 'นับได้': i.ActualQty ?? '', 'ส่วนต่าง': diffOf(i) ?? '',
                'ราคาล่าสุด': priceOf(i), 'มูลค่าส่วนต่าง (บาท)': Math.round(valOf(i)),
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.items.filter(i => isCounted(i) && diffOf(i) !== 0)
                .sort((a, b) => Math.abs(valOf(b)) - Math.abs(valOf(a))).map(rowOf)), 'ส่วนต่าง');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.items.map(rowOf)), 'ทั้งหมด');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byLoc.map(g => ({
                'สถานที่': g.key, 'รายการ': g.total, 'มีส่วนต่าง': g.diff, 'ส่วนต่างสุทธิ (ชิ้น)': g.net, 'มูลค่า (บาท)': Math.round(g.value),
            }))), 'ตามสถานที่');
            XLSX.writeFile(wb, `${s.SessionCode}_report.xlsx`);
        };

        const GroupTable = ({ title, rows, label }) => (
            <Card className="p-4">
                <div className="text-sm font-bold text-slate-700 mb-3">{title}</div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-white text-[11px] text-slate-500">
                            <tr><th className="text-left py-1.5">{label}</th><th className="text-right">รายการ</th><th className="text-right">มีส่วนต่าง</th><th className="text-right">ชิ้น</th><th className="text-right">มูลค่า ฿</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(g => (
                                <tr key={g.key} className="hover:bg-slate-50">
                                    <td className="py-1.5 pr-2 truncate max-w-[160px]" title={g.key}>{g.key}</td>
                                    <td className="text-right tabular-nums">{g.total}</td>
                                    <td className={`text-right tabular-nums ${g.diff ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{g.diff}</td>
                                    <td className={`text-right tabular-nums ${g.net > 0 ? 'text-emerald-600' : g.net < 0 ? 'text-red-600' : 'text-slate-400'}`}>{g.net > 0 ? `+${g.net}` : g.net}</td>
                                    <td className={`text-right tabular-nums font-semibold ${g.value > 0 ? 'text-emerald-600' : g.value < 0 ? 'text-red-600' : 'text-slate-400'}`}>{Math.round(g.value).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        );

        return (
            <div className="space-y-5">
                <div className="no-print">
                    {renderHeader(s.SessionCode, `${fmtDate(s.CountDate)}${s.ConfirmedBy ? ` · ยืนยันโดย ${s.ConfirmedBy}` : ''}`, (
                        <>
                            <StatusBadge status={s.Status} />
                            <button onClick={exportAll} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"><Download size={14} />Excel (หลาย sheet)</button>
                            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"><Printer size={14} />พิมพ์รายงาน{sorted.length < report.items.length ? ` (${sorted.length})` : ''}</button>
                            {canEditReport && !editing && <button onClick={startEditing} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100"><Edit3 size={14} />แก้ไขจำนวนนับ</button>}
                            {editing && <>
                                <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white">ยกเลิก</button>
                                <button onClick={saveEdit} disabled={isSavingEdit} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">{isSavingEdit ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}</button>
                            </>}
                        </>
                    ))}
                </div>

                {s.Status === 'Confirmed' && (
                    <div className="no-print px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 text-sm text-indigo-800 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 flex gap-2">
                            <Clock size={16} className="shrink-0 mt-0.5" />
                            <div>
                                <div className="font-bold">นับเสร็จแล้ว · รอปรับยอดสต็อก</div>
                                <div className="text-xs text-indigo-700/80">สต็อกในระบบยังเป็นยอดเดิม ตรวจรายการด้านล่าง{canEditReport ? ' แก้จำนวนนับได้ถ้าผิด' : ''} แล้วกดปรับยอดเมื่อพร้อม{adjustRows.length ? ` (จะเปลี่ยน ${adjustRows.length} รายการ)` : ' (ไม่มีรายการที่ต้องปรับ)'}</div>
                            </div>
                        </div>
                        {canAdjustReport && !editing && (
                            <button onClick={() => { setAdjustAck(false); setAdjustPreview(true); }} className="h-10 px-4 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 shrink-0">ปรับยอดสต็อกตามจริง…</button>
                        )}
                    </div>
                )}

                {s.Status === 'Adjusted' && (
                    <div className="no-print px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 size={16} />ปรับยอดสต็อกตามรอบนี้แล้ว จึงแก้ไขจำนวนนับไม่ได้</div>
                )}

                {(() => {
                    const acc = pct(rep.match, rep.counted);
                    const prevAcc = reportPrev?.accuracy ?? null;
                    const delta = acc !== null && prevAcc !== null ? Math.round((acc - prevAcc) * 10) / 10 : null;
                    const tone = acc === null ? 'text-slate-400' : acc >= 95 ? 'text-emerald-600' : acc >= 80 ? 'text-amber-600' : 'text-red-600';
                    const bar = acc === null ? 'bg-slate-200' : acc >= 95 ? 'bg-emerald-500' : acc >= 80 ? 'bg-amber-500' : 'bg-red-500';
                    const scans = report.items.map(i => i.ScannedAt).filter(Boolean).map(d => new Date(d)).sort((a, b) => a - b);
                    const steps = [
                        { label: 'เริ่มรอบ', done: true, when: fmtDate(s.CreatedAt || s.CountDate) },
                        { label: 'นับ', done: rep.counted > 0, when: scans.length ? `${rep.counted} รายการ · ล่าสุด ${fmtDate(scans[scans.length - 1])}` : '-' },
                        { label: 'ยืนยัน', done: s.Status !== 'Draft', when: s.ConfirmedBy ? `โดย ${s.ConfirmedBy}` : '-' },
                        { label: 'ปรับยอด', done: s.Status === 'Adjusted', when: s.Status === 'Adjusted' ? (reportAdjustInfo ? `${fmtDate(reportAdjustInfo.date)} · ${reportAdjustInfo.user || ''}` : 'ปรับแล้ว') : 'รอปรับยอด' },
                    ];
                    return (
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                            <Card className="p-5 lg:col-span-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-xs font-semibold text-slate-500">ความแม่นยำสต็อก</div>
                                        <div className={`text-4xl font-black tabular-nums mt-1 ${tone}`}>{acc === null ? '—' : `${acc}%`}</div>
                                        <div className="text-[11px] text-slate-400 mt-0.5">ตรงกับระบบ {rep.match} จากที่นับ {rep.counted} รายการ</div>
                                    </div>
                                    {delta !== null && (
                                        <div className={`text-right text-xs font-bold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                            {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta)}%
                                            <div className="text-[10px] font-normal text-slate-400">เทียบ {reportPrev.code} ({prevAcc}%)</div>
                                        </div>
                                    )}
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-3"><div className={`h-full ${bar}`} style={{ width: `${acc || 0}%` }} /></div>
                                <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>เป้าหมาย ≥ 95%</span><span>มูลค่าส่วนต่าง {money(totalValue)}</span></div>
                            </Card>
                            <Card className="p-5 lg:col-span-3">
                                <div className="text-xs font-semibold text-slate-500 mb-3">ขั้นตอนของรอบนี้</div>
                                <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {steps.map((st, idx) => (
                                        <li key={st.label} className="flex gap-2">
                                            <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${st.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 ring-2 ring-amber-300'}`}>
                                                {st.done ? <Check size={13} /> : idx + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <div className={`text-sm font-bold ${st.done ? 'text-slate-800' : 'text-amber-600'}`}>{st.label}</div>
                                                <div className="text-[11px] text-slate-400 leading-snug break-words">{st.when}</div>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </Card>
                        </div>
                    );
                })()}

                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                    <Kpi label="รายการทั้งหมด" value={rep.total} />
                    <Kpi label="นับแล้ว" value={`${rep.counted}/${rep.total}`} tone="text-indigo-600" />
                    <Kpi label="ตรงกับระบบ" value={rep.match} tone="text-emerald-600" />
                    <Kpi label="มีส่วนต่าง" value={rep.diff} tone={rep.diff ? 'text-red-600' : 'text-slate-800'}
                        sub={reportPrev ? `รอบก่อน (${reportPrev.code}) ${reportPrev.diff} รายการ` : undefined} />
                    <Kpi label="ส่วนต่างสุทธิ (ชิ้น)" value={`${rep.plus + rep.minus > 0 ? '+' : ''}${rep.plus + rep.minus}`}
                        sub={reportPrev ? `รอบก่อน ${reportPrev.net > 0 ? '+' : ''}${reportPrev.net}` : `เกิน +${rep.plus} · ขาด ${rep.minus}`} />
                    <Kpi label="มูลค่าส่วนต่างสุทธิ" value={`${totalValue < 0 ? '−' : ''}฿${Math.abs(Math.round(totalValue)).toLocaleString()}`}
                        tone={totalValue < 0 ? 'text-red-600' : totalValue > 0 ? 'text-emerald-600' : 'text-slate-800'}
                        sub={`เกิน ฿${Math.round(plusValue).toLocaleString()} · ขาด ฿${Math.abs(Math.round(minusValue)).toLocaleString()}`} />
                </div>

                {(() => {
                    const ChartCard = ({ title, rows }) => {
                        const data = rows.filter(g => Math.round(g.value) !== 0).slice(0, 8).map(g => ({ name: g.key.length > 18 ? `${g.key.slice(0, 17)}…` : g.key, full: g.key, value: Math.round(g.value), diff: g.diff }));
                        return (
                            <Card className="p-4">
                                <div className="text-sm font-bold text-slate-700 mb-1">{title}</div>
                                <div className="text-[11px] text-slate-400 mb-2">มูลค่าส่วนต่าง (บาท) · แดง = ขาด · เขียว = เกิน</div>
                                {data.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">ไม่มีส่วนต่าง</div> : (
                                    <div style={{ height: Math.max(140, data.length * 34) }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                                                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => (Math.abs(v) >= 1e6 ? `${Math.round(v / 1e5) / 10}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                                                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                                                <ReferenceLine x={0} stroke="#cbd5e1" />
                                                <Tooltip formatter={(v, _n, p) => [`${money(v)} · ${p.payload.diff} รายการ`, p.payload.full]} labelFormatter={() => ''} />
                                                <Bar dataKey="value" radius={4}>
                                                    {data.map(d => <Cell key={d.full} fill={d.value < 0 ? '#dc2626' : '#059669'} />)}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </Card>
                        );
                    };
                    const top = report.items.filter(i => isCounted(i) && diffOf(i) !== 0)
                        .sort((a, b) => Math.abs(valOf(b)) - Math.abs(valOf(a)) || Math.abs(diffOf(b)) - Math.abs(diffOf(a))).slice(0, 10);
                    return (
                        <>
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                                <ChartCard title="ตามสถานที่" rows={byLoc} />
                                <ChartCard title="ตามประเภทอุปกรณ์" rows={byType} />
                                <Card className="p-4">
                                    <div className="text-sm font-bold text-slate-700 mb-1">10 อันดับส่วนต่างสูงสุด</div>
                                    <div className="text-[11px] text-slate-400 mb-2">เรียงตามมูลค่า · แตะเพื่อดูการเคลื่อนไหว</div>
                                    {top.length === 0 ? <div className="py-10 text-center text-sm text-emerald-600">ทุกรายการตรงกับระบบ</div> : (
                                        <ol className="divide-y divide-slate-100">
                                            {top.map((i, idx) => (
                                                <li key={i.ItemID}>
                                                    <button type="button" onClick={() => openMoves(i)} className="w-full flex items-center gap-2 py-2 text-left hover:bg-slate-50 rounded-lg px-1">
                                                        <span className="w-5 text-[11px] font-bold text-slate-400 tabular-nums">{idx + 1}</span>
                                                        <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate" title={i.ProductName}>{i.ProductName}</span>
                                                        <DiffChip diff={diffOf(i)} />
                                                        <span className={`w-20 text-right text-xs font-bold tabular-nums ${valOf(i) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(valOf(i))}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                                </Card>
                            </div>
                            <div>
                                <button type="button" onClick={() => setShowGroupTables(v => !v)} className="text-xs font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1">
                                    <ChevronRight size={13} className={`transition-transform ${showGroupTables ? 'rotate-90' : ''}`} />{showGroupTables ? 'ซ่อนตารางสรุป' : 'ดูตารางสรุปตามสถานที่ / ประเภท'}
                                </button>
                                {showGroupTables && (
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-3">
                                        <GroupTable title="ตามสถานที่ (เรียงตามมูลค่า)" rows={byLoc} label="สถานที่" />
                                        <GroupTable title="ตามประเภทอุปกรณ์ (เรียงตามมูลค่า)" rows={byType} label="ประเภท" />
                                    </div>
                                )}
                            </div>
                        </>
                    );
                })()}

                <Card className="p-4">
                    <div className="no-print flex flex-wrap items-center gap-2 mb-3">
                        <div className="text-sm font-bold text-slate-700 mr-auto">รายการ ({sorted.length} จาก {report.items.length})</div>
                        <select value={rFilterLoc} onChange={e => setRFilterLoc(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white">
                            <option value="all">ทุกสถานที่</option>
                            {locations.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <select value={rFilterType} onChange={e => setRFilterType(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white">
                            <option value="all">ทุกประเภท</option>
                            {types.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-slate-500">
                            ส่วนต่างอย่างน้อย
                            <input type="number" min={0} value={rMinDiff} onChange={e => setRMinDiff(Math.max(0, Number(e.target.value) || 0))} className="w-16 h-8 px-2 rounded-lg border border-slate-200 text-xs" />
                            ชิ้น
                        </label>
                        {[['all', 'ทั้งหมด'], ['diff', 'มีส่วนต่าง'], ['match', 'ตรงแล้ว']].map(([v, l]) => (
                            <button key={v} onClick={() => setReportFilter(v)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${reportFilter === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>{l}</button>
                        ))}
                        <input value={reportSearch} onChange={e => setReportSearch(e.target.value)} placeholder="ค้นหา"
                            className="h-8 px-3 rounded-lg border border-slate-200 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    {/* มือถือ: การ์ด */}
                    <div className="md:hidden rounded-xl border border-slate-100 divide-y divide-slate-100 no-print">
                        {shown.map(i => {
                            const d = diffOf(i);
                            return (
                                <div key={i.ItemID} onClick={() => { if (!editing) openMoves(i); }} className={`flex items-center gap-3 px-3 py-2.5 ${editing ? '' : 'cursor-pointer active:bg-indigo-50'} ${isCounted(i) && d !== 0 ? 'bg-red-50/40' : ''}`}>
                                    <Thumb src={i.ImageURL || productById.get(i.ProductID)?.ImageURL} size={36} />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{i.ProductName}</div>
                                        <div className="text-[11px] text-slate-400 truncate">{locOf(i)} · ระบบ {i.SystemQty}{isCounted(i) && d !== 0 && valOf(i) ? ` · ${valOf(i) < 0 ? '−' : '+'}฿${Math.abs(Math.round(valOf(i))).toLocaleString()}` : ''}</div>
                                    </div>
                                    {editing ? (
                                        <input type="text" inputMode="numeric" aria-label={`จำนวนนับ ${i.ProductName}`}
                                            className="w-16 h-10 text-center rounded-lg border border-slate-200 text-base font-bold tabular-nums"
                                            value={editItems.find(e => e.ItemID === i.ItemID)?.newActualQty ?? ''}
                                            onChange={e => setEditItems(prev => prev.map(x => x.ItemID === i.ItemID ? { ...x, newActualQty: e.target.value === '' ? null : Number(e.target.value) } : x))} />
                                    ) : (
                                        <div className="text-right shrink-0 min-w-[3rem]">
                                            <div className="text-xl font-black tabular-nums leading-none">{i.ActualQty ?? <span className="text-slate-300">—</span>}</div>
                                            <div className="mt-1"><DiffChip diff={d} /></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {shown.length === 0 && <div className="py-8 text-center text-slate-400 text-sm">ไม่มีรายการตามตัวกรอง</div>}
                    </div>
                    <div className="hidden md:block print:block overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                                <tr>
                                    <SortTh k="name" label="สินค้า" />
                                    <SortTh k="loc" label="สถานที่" />
                                    <SortTh k="sys" label="ในระบบ" right />
                                    <SortTh k="act" label="นับได้" right />
                                    <SortTh k="diff" label="ส่วนต่าง" right />
                                    <SortTh k="value" label="มูลค่า ฿" right />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {shown.map(i => {
                                    const d = diffOf(i);
                                    return (
                                        <tr key={i.ItemID} onClick={() => { if (!editing) openMoves(i); }} className={`hover:bg-slate-50 ${editing ? '' : 'cursor-pointer'}`} title={editing ? undefined : 'ดูการเคลื่อนไหว'}>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2.5">
                                                    <Thumb src={i.ImageURL || productById.get(i.ProductID)?.ImageURL} size={32} />
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-slate-800 truncate max-w-[220px]" title={i.ProductName}>{i.ProductName}</div>
                                                        <span className="text-[11px] text-indigo-600">ดูการเคลื่อนไหว</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-slate-500 text-xs">{locOf(i)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{i.SystemQty}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {editing ? (
                                                    <input type="text" inputMode="numeric" className="w-20 h-7 text-right rounded-lg border border-slate-200 px-2 text-sm font-bold tabular-nums"
                                                        value={editItems.find(e => e.ItemID === i.ItemID)?.newActualQty ?? ''}
                                                        onChange={e => setEditItems(prev => prev.map(x => x.ItemID === i.ItemID ? { ...x, newActualQty: e.target.value === '' ? null : Number(e.target.value) } : x))} />
                                                ) : (i.ActualQty ?? <span className="text-slate-300">—</span>)}
                                            </td>
                                            <td className="px-3 py-2 text-right"><DiffChip diff={d} /></td>
                                            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${valOf(i) > 0 ? 'text-emerald-600' : valOf(i) < 0 ? 'text-red-600' : 'text-slate-300'}`}>
                                                {isCounted(i) && d !== 0 ? `${valOf(i) > 0 ? '+' : '−'}${Math.abs(Math.round(valOf(i))).toLocaleString()}` : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {shown.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">ไม่มีรายการตามตัวกรอง</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <PagerBar {...rPg} setPage={setRPage} />
                </Card>

                {/* รายงานสำหรับพิมพ์ (ปุ่ม "พิมพ์รายงาน") — ทุกแถวตามตัวกรองปัจจุบัน */}
                <Portal><div id="print-area">
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>รายงานการนับสต็อก {s.SessionCode}</h2>
                    <p style={{ fontSize: 11, margin: '2px 0 8px' }}>
                        วันที่นับ {fmtDate(s.CountDate)} · ผู้ยืนยัน {s.ConfirmedBy || '-'} · สถานะ {STATUS_META[s.Status]?.label || s.Status} · พิมพ์เมื่อ {fmtDate(new Date())}
                    </p>
                    <table style={{ marginBottom: 10 }}>
                        <tbody>
                            <tr>
                                <th>รายการทั้งหมด</th><td>{rep.total}</td>
                                <th>ตรงกับระบบ</th><td>{rep.match}</td>
                                <th>มีส่วนต่าง</th><td>{rep.diff}</td>
                            </tr>
                            <tr>
                                <th>เกิน (ชิ้น)</th><td>+{rep.plus}</td>
                                <th>ขาด (ชิ้น)</th><td>{rep.minus}</td>
                                <th>มูลค่าส่วนต่างสุทธิ</th><td>{totalValue < 0 ? '−' : ''}฿{Math.abs(Math.round(totalValue)).toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                    {(rFilterLoc !== 'all' || rFilterType !== 'all' || rMinDiff > 0 || reportFilter !== 'all' || reportSearch.trim()) && (
                        <p style={{ fontSize: 10.5, margin: '0 0 6px' }}>
                            ตัวกรอง: {[rFilterLoc !== 'all' && `สถานที่ ${rFilterLoc}`, rFilterType !== 'all' && `ประเภท ${rFilterType}`, rMinDiff > 0 && `ส่วนต่าง ≥ ${rMinDiff}`, reportFilter === 'diff' && 'เฉพาะมีส่วนต่าง', reportFilter === 'match' && 'เฉพาะตรงแล้ว', reportSearch.trim() && `ค้นหา "${reportSearch.trim()}"`].filter(Boolean).join(' · ')}
                        </p>
                    )}
                    <table>
                        <thead>
                            <tr><th>#</th><th>สินค้า</th><th>สถานที่</th><th style={{ textAlign: 'right' }}>ในระบบ</th><th style={{ textAlign: 'right' }}>นับได้</th><th style={{ textAlign: 'right' }}>ส่วนต่าง</th><th style={{ textAlign: 'right' }}>มูลค่า ฿</th></tr>
                        </thead>
                        <tbody>
                            {sorted.map((i, idx) => {
                                const d = diffOf(i);
                                return (
                                    <tr key={i.ItemID}>
                                        <td>{idx + 1}</td>
                                        <td>{i.ProductName}</td>
                                        <td>{locOf(i)}</td>
                                        <td style={{ textAlign: 'right' }}>{i.SystemQty}</td>
                                        <td style={{ textAlign: 'right' }}>{i.ActualQty ?? '-'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: d ? 700 : 400 }}>{d === null ? '-' : d > 0 ? `+${d}` : d}</td>
                                        <td style={{ textAlign: 'right' }}>{isCounted(i) && d !== 0 ? `${valOf(i) < 0 ? '−' : '+'}${Math.abs(Math.round(valOf(i))).toLocaleString()}` : ''}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 32, fontSize: 11 }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>ลงชื่อ ____________________ ผู้นับ<br />วันที่ ____________</div>
                        <div style={{ flex: 1, textAlign: 'center' }}>ลงชื่อ ____________________ ผู้ตรวจสอบ<br />วันที่ ____________</div>
                        <div style={{ flex: 1, textAlign: 'center' }}>ลงชื่อ ____________________ ผู้อนุมัติ<br />วันที่ ____________</div>
                    </div>
                </div></Portal>

                {/* การเคลื่อนไหวของสินค้า */}
                {moveItem && (() => {
                    const cd = new Date(s.CountDate);
                    const rows = [...moveData.rows].sort((a, b) => new Date(a.TransDate) - new Date(b.TransDate));
                    const isAdj = (t) => String(t.RefInfo || '').startsWith('Stock Count Adjust');
                    const signed = (t) => (t.TransType === 'IN' ? 1 : -1) * Math.abs(Number(t.Qty) || 0);
                    const before = rows.filter(t => new Date(t.TransDate) < cd && !isAdj(t));
                    const after = rows.filter(t => new Date(t.TransDate) >= cd && !isAdj(t));
                    const sum = (list, type) => list.filter(t => t.TransType === type).reduce((a, t) => a + Math.abs(Number(t.Qty) || 0), 0);
                    const d = diffOf(moveItem);
                    const Row = ({ t }) => (
                        <div className="flex items-start gap-3 py-2">
                            <span className={`mt-0.5 px-1.5 py-px rounded text-[10px] font-bold ${isAdj(t) ? 'bg-indigo-50 text-indigo-700' : t.TransType === 'IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{isAdj(t) ? 'ปรับยอด' : t.TransType === 'IN' ? 'รับเข้า' : 'เบิกออก'}</span>
                            <div className="min-w-0 flex-1">
                                <div className="text-xs text-slate-700 break-words">{t.RefInfo || '-'}{t.EmployeeName ? ` · ${t.EmployeeName}` : ''}</div>
                                <div className="text-[10px] text-slate-400">{fmtDate(t.TransDate)}{t.UserID ? ` · ${t.UserID}` : ''}</div>
                            </div>
                            <span className={`text-sm font-bold tabular-nums ${signed(t) > 0 ? 'text-emerald-600' : signed(t) < 0 ? 'text-red-600' : 'text-slate-400'}`}>{signed(t) > 0 ? '+' : ''}{signed(t) || 0}</span>
                        </div>
                    );
                    return (
                        <Portal>
                            <div className="no-print fixed inset-0 z-[9980] bg-slate-900/50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) setMoveItem(null); }}>
                                <div role="dialog" aria-label="การเคลื่อนไหวของสินค้า" className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">
                                    <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start gap-3">
                                        <Thumb src={moveItem.ImageURL || productById.get(moveItem.ProductID)?.ImageURL} size={44} />
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-bold text-slate-800 leading-snug">{moveItem.ProductName}</h3>
                                            <p className="text-xs text-slate-500">{locOf(moveItem)} · ตอนนับ: ระบบ {moveItem.SystemQty} → นับได้ {moveItem.ActualQty ?? '-'} <DiffChip diff={d} /></p>
                                        </div>
                                        <button type="button" onClick={() => setMoveItem(null)} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                                    </div>
                                    <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-4">
                                        {moveData.loading ? <div className="py-10 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" size={22} /></div>
                                            : moveData.error ? <div className="py-8 text-center text-sm text-red-600">{moveData.error}</div>
                                            : (<>
                                                <div className="grid grid-cols-3 gap-2 text-center">
                                                    <div className="rounded-xl bg-emerald-50 py-2"><div className="text-lg font-black text-emerald-600 tabular-nums">+{sum(before, 'IN')}</div><div className="text-[10px] text-slate-500">รับเข้า ก่อนนับ</div></div>
                                                    <div className="rounded-xl bg-red-50 py-2"><div className="text-lg font-black text-red-600 tabular-nums">−{sum(before, 'OUT')}</div><div className="text-[10px] text-slate-500">เบิกออก ก่อนนับ</div></div>
                                                    <div className="rounded-xl bg-slate-50 py-2"><div className="text-lg font-black text-slate-700 tabular-nums">{after.length}</div><div className="text-[10px] text-slate-500">รายการหลังนับ</div></div>
                                                </div>
                                                <p className="text-[11px] text-slate-400">ช่วงที่ดู: {fmtDate(moveData.from)} ({reportPrev?.date ? `รอบก่อน ${reportPrev.code}` : '90 วันก่อนนับ'}) ถึงวันนี้ · เส้นแบ่ง = วันนับ {fmtDate(s.CountDate)}</p>
                                                {rows.length === 0 ? <div className="py-6 text-center text-sm text-slate-400">ไม่มีการเคลื่อนไหวในช่วงนี้</div> : (
                                                    <div className="divide-y divide-slate-100">
                                                        {before.map(t => <Row key={t.TransID} t={t} />)}
                                                        <div className="py-2 text-[11px] font-bold text-indigo-600 flex items-center gap-2"><span className="flex-1 h-px bg-indigo-200" />วันนับ {fmtDate(s.CountDate)}<span className="flex-1 h-px bg-indigo-200" /></div>
                                                        {rows.filter(t => new Date(t.TransDate) >= cd).map(t => <Row key={t.TransID} t={t} />)}
                                                    </div>
                                                )}
                                                {d !== null && d !== 0 && (
                                                    <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                                                        ส่วนต่าง {d > 0 ? `+${d}` : d} อาจเกิดจาก: {d < 0 ? 'เบิกออกแล้วไม่ได้บันทึก, ของชำรุด/สูญหาย หรือนับไม่ครบ' : 'รับเข้าแล้วไม่ได้บันทึก, คืนของโดยไม่บันทึก หรือนับซ้ำ'} — ตรวจกับรายการด้านบน
                                                    </div>
                                                )}
                                            </>)}
                                    </div>
                                </div>
                            </div>
                        </Portal>
                    );
                })()}

                {/* ตรวจก่อนปรับยอด */}
                {adjustPreview && (
                    <Portal>
                    <div className="no-print fixed inset-0 z-[9980] bg-slate-900/50 flex items-center justify-center p-3 sm:p-4" onClick={() => { if (!isAdjusting) setAdjustPreview(false); }}>
                        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
                                <h3 className="font-bold text-slate-800">ตรวจก่อนปรับยอดสต็อก</h3>
                                <p className="text-xs text-slate-500">สต็อกจะถูกเปลี่ยนตามตารางนี้ ทำแล้วย้อนกลับไม่ได้</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 sm:gap-3 px-4 sm:px-6 py-4">
                                <Kpi label="รายการที่จะเปลี่ยน" value={adjustRows.length} />
                                <Kpi label="เพิ่มขึ้น (ชิ้น)" value={`+${adjustPlusQty}`} tone="text-emerald-600" />
                                <Kpi label="ลดลง (ชิ้น)" value={adjustMinusQty} tone="text-red-600" />
                            </div>
                            <div className="overflow-auto px-4 sm:px-6 pb-4 flex-1">
                                {adjustRows.length > 0 && (
                                    <div className="sm:hidden divide-y divide-slate-100 rounded-xl border border-slate-100">
                                        {adjustRows.map(i => (
                                            <div key={i.ItemID} className="flex items-center gap-2 px-3 py-2.5">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-semibold text-slate-800 truncate">{i.ProductName}</div>
                                                    <div className="text-[11px] text-slate-500">ยอดเดิม {i.SystemQty} → ยอดใหม่ <b className="text-slate-800">{i.ActualQty}</b> · <span className={valOf(i) < 0 ? 'text-red-600' : 'text-emerald-600'}>{valOf(i) < 0 ? '−' : '+'}฿{Math.abs(Math.round(valOf(i))).toLocaleString()}</span></div>
                                                </div>
                                                <DiffChip diff={diffOf(i)} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {adjustRows.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">ไม่มีรายการที่ต้องปรับ</p> : (
                                    <table className="hidden sm:table w-full text-sm">
                                        <thead className="sticky top-0 bg-white text-[11px] uppercase text-slate-500">
                                            <tr><th className="text-left py-2">สินค้า</th><th className="text-right">ยอดเดิม</th><th className="text-right">ยอดใหม่</th><th className="text-right">เปลี่ยน</th><th className="text-right">มูลค่า ฿</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {adjustRows.map(i => (
                                                <tr key={i.ItemID}>
                                                    <td className="py-2 pr-2 truncate max-w-[280px]">{i.ProductName}</td>
                                                    <td className="text-right tabular-nums">{i.SystemQty}</td>
                                                    <td className="text-right tabular-nums font-semibold">{i.ActualQty}</td>
                                                    <td className="text-right"><DiffChip diff={diffOf(i)} /></td>
                                                    <td className={`text-right tabular-nums ${valOf(i) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{valOf(i) < 0 ? '−' : '+'}{Math.abs(Math.round(valOf(i))).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                            <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-2">
                                    <div className="text-xs text-slate-500">มูลค่ารวม <span className="font-bold text-slate-800">{totalValue < 0 ? '−' : '+'}฿{Math.abs(Math.round(totalValue)).toLocaleString()}</span></div>
                                    {adjustRows.length > 0 && (
                                        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                                            <input type="checkbox" checked={adjustAck} onChange={e => setAdjustAck(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                                            <span>ฉันตรวจแล้ว ให้เปลี่ยนสต็อก {adjustRows.length} รายการตามตารางนี้ (ย้อนกลับไม่ได้)</span>
                                        </label>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:flex shrink-0">
                                    <button onClick={() => setAdjustPreview(false)} disabled={isAdjusting} className="h-10 px-4 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white">ยกเลิก</button>
                                    <button onClick={handleAdjust} disabled={adjustRows.length === 0 || !adjustAck || isAdjusting || !canAdjustReport}
                                        className="h-10 px-4 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                                        {isAdjusting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}ปรับยอดสต็อก ({adjustRows.length})
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    </Portal>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-10">
            {view === 'list' && renderList()}
            {view === 'count' && renderCount()}
            {view === 'report' && renderReport()}

            {/* พิมพ์: ซ่อนทั้งแอป แสดงเฉพาะ #print-area (วางที่ body ผ่าน Portal จึงไม่ถูกกล่องเลื่อน/แถบเมนูตัด) */}
            <style>{`
                #print-area { display: none; }
                @media print {
                    #app { display: none !important; }
                    #print-area { display: block !important; color: #000; font-family: 'Sarabun', sans-serif; }
                    #print-area table { width: 100%; border-collapse: collapse; }
                    #print-area th, #print-area td { border: 1px solid #999; padding: 3px 5px; font-size: 10.5px; vertical-align: top; }
                    #print-area th { background: #eee; text-align: left; }
                    #print-area tr { page-break-inside: avoid; }
                    #print-area thead { display: table-header-group; }
                    @page { size: A4; margin: 12mm; }
                }
            `}</style>
            {view === 'count' && (
                <Portal><div id="print-area">
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>ใบนับสต็อก {activeSession?.SessionCode || ''}</h2>
                <p style={{ fontSize: 11, marginBottom: 8 }}>วันที่ ______________ ผู้นับ ______________ จัดเรียงตามสถานที่</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                        <tr>
                            {['ลำดับ', 'สถานที่', 'สินค้า', 'ในระบบ', 'นับได้', 'หมายเหตุ'].map(h => (
                                <th key={h} style={{ border: '1px solid #999', padding: 4, background: '#eee', textAlign: 'left' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {activeProducts.map((p, idx) => (
                            <tr key={p.ProductID}>
                                <td style={{ border: '1px solid #999', padding: 4 }}>{idx + 1}</td>
                                <td style={{ border: '1px solid #999', padding: 4 }}>{p.Location || ''}</td>
                                <td style={{ border: '1px solid #999', padding: 4 }}>{p.ProductName}</td>
                                <td style={{ border: '1px solid #999', padding: 4, textAlign: 'right' }}>{p.CurrentStock}</td>
                                <td style={{ border: '1px solid #999', padding: 4, width: 70 }}>&nbsp;</td>
                                <td style={{ border: '1px solid #999', padding: 4, width: 120 }}>&nbsp;</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div></Portal>
            )}
            {view === 'count' && renderConfirmReview()}
            {view === 'count' && sheetItem && (
                <CountSheet item={sheetItem} imageUrl={sheetItem.ImageURL || productById.get(sheetItem.ProductID)?.ImageURL}
                    hasNext={sheetNext != null} onSave={handleSheetSave} onClose={closeSheet} />
            )}
            {undoBar && (
                <Portal><div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9991] max-w-[90vw] px-4 py-2.5 rounded-xl shadow-2xl bg-slate-800 text-white text-sm font-semibold flex items-center gap-3">
                    <span className="truncate">{undoBar.label}</span>
                    <button onClick={runUndo} disabled={undoBar.busy} className="px-3 py-1 rounded-lg bg-white text-slate-900 text-xs font-black hover:bg-slate-200 disabled:opacity-50">{undoBar.busy ? 'กำลังเลิกทำ…' : 'เลิกทำ'}</button>
                </div></Portal>
            )}
            {toast && (
                <Portal><div role="status" className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9990] max-w-[90vw] px-4 py-3 rounded-xl shadow-2xl text-white text-sm font-semibold flex items-center gap-2
                    ${toast.type === 'error' ? 'bg-red-600' : toast.type === 'info' ? 'bg-slate-700' : 'bg-emerald-600'}`}>
                    {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                    <span>{toast.title}{toast.message ? ` · ${toast.message}` : ''}</span>
                </div></Portal>
            )}
            <AlertModal
                isOpen={alertModal.isOpen}
                type={alertModal.type}
                title={alertModal.title}
                message={alertModal.message}
                confirmText={alertModal.confirmText}
                cancelText={alertModal.cancelText}
                onConfirm={alertModal.onConfirm || (() => setAlertModal(prev => ({ ...prev, isOpen: false })))}
                onCancel={alertModal.onCancel}
                onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
                autoClose={alertModal.autoClose}
            />
        </div>
    );
};

export default StockCountPage;
