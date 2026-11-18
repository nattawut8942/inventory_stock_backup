import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
    Search, ScanLine, Trash2, ClipboardList, ArrowLeft, PlusCircle, Package,
    Edit3, Loader2, Check, CheckCircle2, AlertCircle, Plus, Minus, Target, Download, Printer, Eye, Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCan, useCanAct } from '../context/PermissionContext';
import AlertModal from '../components/AlertModal';
import { API_BASE, API_URL } from '../config/api';

// ── ตรวจนับสต็อก ──────────────────────────────────────────────────────
// 3 มุมมอง: รายการรอบนับ (list) → นับสต็อก (count, มีขั้นตอน) → รายงานรอบนับ (report)
const STEPS = ['เริ่มรอบ', 'เพิ่มสินค้า', 'กรอกจำนวนนับ', 'ตรวจสอบ', 'ยืนยัน'];

const fmtDate = (d) => (d ? new Date(d).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const diffOf = (item) => (item.ActualQty === null || item.ActualQty === undefined ? null : item.ActualQty - item.SystemQty);
const isCounted = (item) => item.ActualQty !== null && item.ActualQty !== undefined;
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
    const [rFilterLoc, setRFilterLoc] = useState('all');
    const [rFilterType, setRFilterType] = useState('all');
    const [rMinDiff, setRMinDiff] = useState(0);
    const [rSort, setRSort] = useState({ key: 'value', dir: 'desc' });
    const [rLimit, setRLimit] = useState(100);

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

    useEffect(() => { if (view === 'count' && activeSession) scanInputRef.current?.focus(); }, [view, activeSession]);

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
            setReportPrev({ code: prevS.SessionCode, date: prevS.CountDate, total: d.items.length, diff: df.length, net: df.reduce((s, i) => s + diffOf(i), 0) });
        } catch (err) { setReportPrev(null); }
    };

    const loadReport = async (sessionId) => {
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${sessionId}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            setReport(data);
            setAdjustPreview(false);
            setRFilterLoc('all'); setRFilterType('all'); setRMinDiff(0); setRLimit(100);
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

    const addProductToSession = async (product) => {
        if (!activeSession) return;
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}/items`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ProductID: product.ProductID })
            });
            const data = await res.json();
            if (res.ok) {
                setCountingList(prev => [data.item, ...prev]);
                setScanInput(''); setSearchResults([]); setShowDropdown(false);
                scanInputRef.current?.focus();
                showAlert('success', 'เพิ่มแล้ว', product.ProductName, 1000);
            } else if (data.duplicate) {
                showAlert('info', 'มีแล้ว', `${product.ProductName} อยู่ในรายการนับแล้ว`, 1500);
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

    const removeItem = (item) => {
        setAlertModal({
            isOpen: true, type: 'confirm', title: 'ลบรายการนับ?',
            message: `ลบ "${item.ProductName}" ออกจากรอบนับ?`,
            confirmText: 'ลบ', cancelText: 'ยกเลิก',
            onConfirm: async () => {
                setAlertModal(p => ({ ...p, isOpen: false }));
                try {
                    const res = await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}/items/${item.ItemID}`, { method: 'DELETE' });
                    if (res.ok) setCountingList(prev => prev.filter(i => i.ItemID !== item.ItemID));
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
        setAlertModal({
            isOpen: true, type: 'confirm', title: 'ยืนยันการนับสต็อก?',
            message: `บันทึกยอดนับ ${counts.total} รายการ มีส่วนต่าง ${counts.diff} รายการ (ยังไม่ปรับยอดสต็อกจริง)`,
            confirmText: 'ยืนยัน', cancelText: 'ยังไม่ยืนยัน',
            onConfirm: async () => {
                setAlertModal(p => ({ ...p, isOpen: false }));
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
                    } else {
                        const d = await res.json().catch(() => ({}));
                        showAlert('error', 'ผิดพลาด', d.error || 'ยืนยันไม่ได้');
                    }
                } catch (err) { showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
                setIsConfirming(false);
            },
            onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
        });
    };

    // ── รายงาน: ปรับยอด / แก้ไขจำนวนนับ ──
    const handleAdjust = () => {
        if (!report) return;
        const sid = report.session.SessionID;
        setAlertModal({
            isOpen: true, type: 'confirm', title: 'ปรับยอดสต็อกตามจริง?',
            message: `ปรับยอดสต็อกตามรายการที่นับได้ในเอกสาร ${report.session.SessionCode} (ทำแล้วย้อนกลับไม่ได้)`,
            confirmText: 'ปรับยอด', cancelText: 'ยกเลิก',
            onConfirm: async () => {
                setAlertModal(p => ({ ...p, isOpen: false }));
                setIsAdjusting(true);
                try {
                    const res = await fetch(`${API_BASE}/stock-count/sessions/${sid}/adjust`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ AdjustedBy: user?.username || user?.name })
                    });
                    if (res.ok) { showAlert('success', 'ปรับยอดแล้ว', 'ปรับยอดสต็อกเรียบร้อย'); loadReport(sid); fetchSessions(); }
                    else { const d = await res.json().catch(() => ({})); showAlert('error', 'ผิดพลาด', d.error || 'ปรับยอดไม่ได้'); }
                } catch (err) { showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
                setIsAdjusting(false);
            },
            onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
        });
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
                    {filteredSessions.map(s => {
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
        </div>
    );

    // ── 2) นับสต็อก (มีขั้นตอน) ──
    const renderCount = () => (
        <div className="space-y-5">
            {renderHeader('นับสต็อก', activeSession ? `รอบ ${activeSession.SessionCode}` : '', (
                <>
                    {activeSession && (
                        <button onClick={cancelDraft} className="px-3 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 bg-white hover:bg-red-50">ยกเลิกรอบ</button>
                    )}
                    <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"><Printer size={14} />พิมพ์ใบนับ</button>
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
            <Card className="p-4"><Stepper current={currentStep} /></Card>

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

                    <Card className="p-4 space-y-3">
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

                    <Card className="p-4">
                        <details>
                            <summary className="text-sm font-bold text-slate-700 cursor-pointer flex items-center justify-between">
                                ยังไม่ได้นับในระบบ <span className="text-xs font-normal text-slate-400">{uncountedProducts.length} รายการ</span>
                            </summary>
                            <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-100">
                                {uncountedProducts.length === 0 ? <p className="text-xs text-slate-400 py-2">ไม่มีรายการที่เหลือ</p> : uncountedProducts.slice(0, 200).map(p => (
                                    <button key={p.ProductID} disabled={!activeSession || !canCountSC} onClick={() => addProductToSession(p)}
                                        className="w-full text-left py-2 hover:bg-indigo-50 disabled:opacity-50">
                                        <div className="flex items-center gap-2"><Thumb src={p.ImageURL} size={26} /><span className="text-xs font-semibold text-slate-700 truncate">{p.ProductName}</span></div>
                                        <div className="text-[10px] text-slate-400">{p.Location || 'ไม่ระบุสถานที่'}</div>
                                    </button>
                                ))}
                            </div>
                        </details>
                    </Card>
                </div>

                {/* ขวา: ตารางนับ */}
                <div className="lg:col-span-2 space-y-3">
                    <Card className="p-4 space-y-3">
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
                                className="ml-auto h-8 px-3 rounded-lg border border-slate-200 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                        </div>
                    </Card>

                    <Card className="overflow-hidden">
                        {countingList.length === 0 ? (
                            <div className="py-16 text-center text-slate-400">
                                <ScanLine className="mx-auto mb-3 text-slate-200" size={44} />
                                <p className="font-medium">ยังไม่มีรายการนับ</p>
                                <p className="text-xs mt-1">สแกนหรือค้นหาสินค้าด้านซ้ายเพื่อเริ่มนับ</p>
                            </div>
                        ) : (
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
                                        {visibleCount.map(item => {
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
                        )}
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
        const shown = sorted.slice(0, rLimit);
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
                <style>{`
                    .only-print { display: none; }
                    @media print {
                        .no-print { display: none !important; }
                        .only-print { display: block !important; }
                        body { background: #fff !important; }
                        @page { size: A4; margin: 12mm; }
                    }
                `}</style>

                <div className="no-print">
                    {renderHeader(s.SessionCode, `${fmtDate(s.CountDate)}${s.ConfirmedBy ? ` · ยืนยันโดย ${s.ConfirmedBy}` : ''}`, (
                        <>
                            <StatusBadge status={s.Status} />
                            <button onClick={exportAll} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"><Download size={14} />Excel (หลาย sheet)</button>
                            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"><Printer size={14} />พิมพ์รายงาน</button>
                            {canEditReport && !editing && <button onClick={startEditing} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100"><Edit3 size={14} />แก้ไขจำนวนนับ</button>}
                            {editing && <>
                                <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white">ยกเลิก</button>
                                <button onClick={saveEdit} disabled={isSavingEdit} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">{isSavingEdit ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}</button>
                            </>}
                            {canAdjustReport && !editing && <button onClick={() => setAdjustPreview(true)} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700">ปรับยอดสต็อกตามจริง…</button>}
                        </>
                    ))}
                </div>

                {/* หัวรายงานสำหรับพิมพ์ */}
                <div className="only-print">
                    <h2 style={{ fontSize: 18, fontWeight: 700 }}>รายงานการนับสต็อก {s.SessionCode}</h2>
                    <p style={{ fontSize: 12 }}>วันที่นับ {fmtDate(s.CountDate)} · ผู้ยืนยัน {s.ConfirmedBy || '-'} · สถานะ {STATUS_META[s.Status]?.label || s.Status}</p>
                </div>

                {s.Status === 'Adjusted' && (
                    <div className="no-print px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 size={16} />ปรับยอดสต็อกตามรอบนี้แล้ว จึงแก้ไขจำนวนนับไม่ได้</div>
                )}

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

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <GroupTable title="ตามสถานที่ (เรียงตามมูลค่า)" rows={byLoc} label="สถานที่" />
                    <GroupTable title="ตามประเภทอุปกรณ์ (เรียงตามมูลค่า)" rows={byType} label="ประเภท" />
                </div>

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
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
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
                                        <tr key={i.ItemID} className="hover:bg-slate-50">
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2.5">
                                                    <Thumb src={i.ImageURL || productById.get(i.ProductID)?.ImageURL} size={32} />
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-slate-800 truncate max-w-[220px]" title={i.ProductName}>{i.ProductName}</div>
                                                        <a href={`${import.meta.env.BASE_URL}history?q=${encodeURIComponent(i.ProductName)}`} className="text-[11px] text-indigo-600 hover:underline no-print">ดูประวัติการเบิกรับ</a>
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
                    {sorted.length > rLimit && (
                        <div className="no-print flex items-center justify-between mt-3 text-xs text-slate-500">
                            <span>แสดง {shown.length} จาก {sorted.length} รายการ</span>
                            <button onClick={() => setRLimit(l => l + 100)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50">แสดงเพิ่ม 100 รายการ</button>
                        </div>
                    )}
                </Card>

                {/* ลงชื่อ (แสดงเฉพาะตอนพิมพ์) */}
                <div className="only-print" style={{ marginTop: 32, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>ลงชื่อ ____________________ ผู้นับ<br />วันที่ ____________</div>
                        <div style={{ flex: 1, textAlign: 'center' }}>ลงชื่อ ____________________ ผู้อนุมัติ<br />วันที่ ____________</div>
                    </div>
                </div>

                {/* ตรวจก่อนปรับยอด */}
                {adjustPreview && (
                    <div className="no-print fixed inset-0 z-[9980] bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setAdjustPreview(false)}>
                        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="px-6 py-4 border-b border-slate-100">
                                <h3 className="font-bold text-slate-800">ตรวจก่อนปรับยอดสต็อก</h3>
                                <p className="text-xs text-slate-500">สต็อกจะถูกเปลี่ยนตามตารางนี้ ทำแล้วย้อนกลับไม่ได้</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3 px-6 py-4">
                                <Kpi label="รายการที่จะเปลี่ยน" value={adjustRows.length} />
                                <Kpi label="เพิ่มขึ้น (ชิ้น)" value={`+${adjustPlusQty}`} tone="text-emerald-600" />
                                <Kpi label="ลดลง (ชิ้น)" value={adjustMinusQty} tone="text-red-600" />
                            </div>
                            <div className="overflow-y-auto px-6 pb-4 flex-1">
                                {adjustRows.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">ไม่มีรายการที่ต้องปรับ</p> : (
                                    <table className="w-full text-sm">
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
                            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
                                <div className="text-xs text-slate-500">มูลค่ารวม <span className="font-bold text-slate-800">{totalValue < 0 ? '−' : '+'}฿{Math.abs(Math.round(totalValue)).toLocaleString()}</span></div>
                                <div className="flex gap-2">
                                    <button onClick={() => setAdjustPreview(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white">ยกเลิก</button>
                                    <button onClick={() => { setAdjustPreview(false); handleAdjust(); }} disabled={adjustRows.length === 0 || isAdjusting || !canAdjustReport}
                                        className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40">ไปยืนยันการปรับยอด</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-10">
            {view === 'list' && renderList()}
            {view === 'count' && renderCount()}
            {view === 'report' && renderReport()}

            {/* ใบนับเปล่าสำหรับพิมพ์ (แสดงเฉพาะตอนพิมพ์) */}
            <style>{`
                #count-print { display: none; }
                @media print {
                    body * { visibility: hidden; }
                    #count-print, #count-print * { visibility: visible; }
                    #count-print { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
                    @page { size: A4; margin: 12mm; }
                }
            `}</style>
            <div id="count-print">
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
            </div>
            {toast && (
                <div role="status" className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9990] max-w-[90vw] px-4 py-3 rounded-xl shadow-2xl text-white text-sm font-semibold flex items-center gap-2
                    ${toast.type === 'error' ? 'bg-red-600' : toast.type === 'info' ? 'bg-slate-700' : 'bg-emerald-600'}`}>
                    {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                    <span>{toast.title}{toast.message ? ` · ${toast.message}` : ''}</span>
                </div>
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
