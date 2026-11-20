import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Settings, Truck, Plus, Trash2, Edit2, Search, Check, X, Shield, AlertTriangle, Archive, MessageSquare, FileKey, DollarSign, Map, Camera, Server, History, RefreshCw, KeyRound, ListChecks , ShieldCheck, ClipboardList, Crown, Activity, Moon, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';
import { useData } from '../context/DataContext';
import Portal from '../components/Portal';
import AlertModal from '../components/AlertModal';
import PermissionEditorModal, { PermissionLogModal, PermissionHoldersModal, loadCatalog } from '../components/PermissionEditorModal';
import { API_BASE, API_URL } from '../config/api';
import { getBadgeStyle, getDeviceTypeColor, getChartColor } from '../utils/styleHelpers';
import DeviceTypeManagementTab from '../components/DeviceTypeManagementTab';
import { MgmtSection, MgmtTable, RowActions, PrimaryButton, SecondaryButton } from '../components/management/MgmtTable';
import AuditLogTab from '../components/management/AuditLogTab';

// Employee photo: URL saved from AD at login, else the standard DCI picture path by EmpCode.
// Falls back to initials if the image can't load (no photo / off network).
const EMP_PIC_BASE = 'http://dcidmc.dci.daikin.co.jp/PICTURE';
const UserAvatar = ({ pic, empCode, name, size = 36 }) => {
    const src = pic || (empCode ? `${EMP_PIC_BASE}/${encodeURIComponent(empCode)}.jpg` : '');
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    const initials = String(name || empCode || '?').trim().slice(0, 2).toUpperCase();
    const style = { width: size, height: size };
    if (!src || failed) {
        return (
            <div style={style} className="shrink-0 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-[11px] font-black">
                {initials}
            </div>
        );
    }
    return (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} style={style}
            className="shrink-0 rounded-lg object-cover bg-slate-100 ring-1 ring-slate-200" />
    );
};

// ── ส่วนประกอบของแท็บ "ผู้ใช้" ──
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const msSince = (d) => { const t = d ? new Date(d).getTime() : NaN; return Number.isNaN(t) ? Infinity : Date.now() - t; };
const relTime = (d) => {
    const ms = msSince(d);
    if (ms === Infinity) return 'ยังไม่เคย';
    if (ms < MIN) return 'เมื่อสักครู่';
    if (ms < HOUR) return `${Math.floor(ms / MIN)} นาทีที่แล้ว`;
    if (ms < DAY) return `${Math.floor(ms / HOUR)} ชม.ที่แล้ว`;
    if (ms < 30 * DAY) return `${Math.floor(ms / DAY)} วันที่แล้ว`;
    if (ms < 365 * DAY) return `${Math.floor(ms / (30 * DAY))} เดือนที่แล้ว`;
    return `${Math.floor(ms / (365 * DAY))} ปีที่แล้ว`;
};
// สีจุดตามความสดของการเข้าระบบ
const recency = (d) => {
    const ms = msSince(d);
    if (ms < HOUR) return { dot: 'bg-emerald-500', ping: true, label: 'เพิ่งใช้งาน' };
    if (ms < DAY) return { dot: 'bg-emerald-400', label: 'เข้าวันนี้' };
    if (ms < 7 * DAY) return { dot: 'bg-amber-400', label: 'ภายใน 7 วัน' };
    return { dot: 'bg-slate-300', label: 'ไม่ได้เข้านาน' };
};
const SECT_COLORS = ['bg-sky-50 text-sky-700 ring-sky-100', 'bg-emerald-50 text-emerald-700 ring-emerald-100', 'bg-amber-50 text-amber-700 ring-amber-100',
    'bg-rose-50 text-rose-700 ring-rose-100', 'bg-teal-50 text-teal-700 ring-teal-100', 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100', 'bg-indigo-50 text-indigo-700 ring-indigo-100'];
const sectColor = (s = '') => SECT_COLORS[[...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % SECT_COLORS.length];

const USER_FILTERS = [
    { id: 'all', label: 'ผู้ใช้ทั้งหมด', icon: Users, tone: 'from-indigo-500 to-violet-500', test: () => true },
    { id: 'admin', label: 'Admin', icon: Crown, tone: 'from-violet-500 to-fuchsia-500', test: (u) => u.Role === 'Admin' },
    { id: 'today', label: 'เข้าใช้วันนี้', icon: Activity, tone: 'from-emerald-500 to-teal-500', test: (u) => msSince(u.LastLoginAt) < DAY },
    { id: 'idle', label: 'ไม่ได้เข้า 30 วัน+', icon: Moon, tone: 'from-slate-400 to-slate-500', test: (u) => msSince(u.LastLoginAt) >= 30 * DAY },
];

const UserStatCard = ({ f, count, total, active, onClick }) => (
    <motion.button type="button" onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} aria-pressed={active}
        className={`relative overflow-hidden text-left p-3.5 rounded-2xl border transition-colors ${active ? 'border-indigo-300 bg-indigo-50/60 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
        <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.tone} text-white flex items-center justify-center shadow-sm shrink-0`}>
                <f.icon size={18} />
            </div>
            <div className="min-w-0">
                <div className="text-2xl font-black text-slate-800 leading-none tabular-nums">{count}</div>
                <div className="text-[11px] font-bold text-slate-500 mt-1 truncate">{f.label}</div>
            </div>
        </div>
        {f.id !== 'all' && total > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
                <motion.div className={`h-full bg-gradient-to-r ${f.tone}`} initial={{ width: 0 }} animate={{ width: `${(count / total) * 100}%` }} transition={{ duration: 0.6 }} />
            </div>
        )}
    </motion.button>
);

// สลับบทบาท Staff / Admin แบบปุ่มคู่ (ยังถามยืนยันก่อนเปลี่ยนเหมือนเดิม)
const RoleToggle = ({ u, disabled, onChange }) => (
    <div className={`inline-flex p-0.5 rounded-xl bg-slate-100 ${disabled ? 'opacity-50' : ''}`} role="radiogroup" aria-label={`บทบาทของ ${u.Name || u.Username}`}>
        {['Staff', 'Admin'].map((r) => {
            const on = u.Role === r;
            return (
                <button key={r} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => !on && onChange(r)}
                    className={`relative px-2.5 h-7 rounded-lg text-xs font-bold transition-colors ${on ? (r === 'Admin' ? 'text-white' : 'text-slate-700') : 'text-slate-400 hover:text-slate-600'}`}>
                    {on && <motion.span layoutId={`role-${u.ID}`} transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                        className={`absolute inset-0 rounded-lg shadow-sm ${r === 'Admin' ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600' : 'bg-white'}`} />}
                    <span className="relative flex items-center gap-1">{r === 'Admin' && <Shield size={11} />}{r}</span>
                </button>
            );
        })}
    </div>
);

// กลุ่มของเมนูซ้าย (ลำดับในกลุ่ม = ลำดับที่แสดง)
const TAB_GROUPS = [
    { label: 'ผู้ใช้และความปลอดภัย', ids: ['admin', 'audit-log', 'login-logs'] },
    { label: 'ข้อมูลหลักสต็อก', ids: ['vendors', 'locations', 'reasons', 'device-types', 'budgets'] },
    { label: 'สัญญาและบริการ', ids: ['ma-types'] },
    { label: 'สถานที่และอุปกรณ์', ids: ['factory-layouts', 'record-servers'] },
    { label: 'อื่นๆ', ids: ['activity-categories'] },
];
const LAST_TAB_KEY = 'mgmt.lastTab';

const ManagementPage = () => {
    const { user, token } = useAuth();
    const { deviceTypes, vendors, products, refreshData } = useData();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(() => {
        const fromUrl = searchParams.get('tab');
        if (fromUrl) return fromUrl;
        try { return localStorage.getItem(LAST_TAB_KEY) || 'admin'; } catch { return 'admin'; }
    });
    // เปลี่ยนหัวข้อ: จำไว้ใน URL (แชร์ลิงก์ได้) และในเบราว์เซอร์
    const changeTab = (id) => {
        setActiveTab(id);
        setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', id); return n; }, { replace: true });
        try { localStorage.setItem(LAST_TAB_KEY, id); } catch { /* ignore */ }
    };
    const [searchTerm, setSearchTerm] = useState('');

    // Users State (Stock_Users — recorded automatically on login)
    const [stockUsers, setStockUsers] = useState([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [savingRoleId, setSavingRoleId] = useState(null);
    // Permission editor: undefined = closed, null = default permissions for new users, object = that user
    const [permTarget, setPermTarget] = useState(undefined);
    const [showPermLog, setShowPermLog] = useState(false);
    const [showHolders, setShowHolders] = useState(false);
    const [userFilter, setUserFilter] = useState('all');
    // memo: MgmtTable กลับไปหน้า 1 ทุกครั้งที่ rows เปลี่ยน identity
    const filteredStockUsers = useMemo(
        () => stockUsers.filter((USER_FILTERS.find((f) => f.id === userFilter) || USER_FILTERS[0]).test),
        [stockUsers, userFilter],
    );
    const [permTotal, setPermTotal] = useState(0); // จำนวนสิทธิ์ทั้งหมดในระบบ (ใช้วาดแถบความคืบหน้าในคอลัมน์ "สิทธิ์")
    useEffect(() => {
        loadCatalog().then((c) => setPermTotal(c.pages.reduce((n, p) => n + p.actions.length, 0))).catch(() => {});
    }, []);
    // Role and per-tab permissions come from the server (database); fall back to the token role only if
    // the permission lookup failed, so the page can still open (the backend decides every action anyway).
    const { ready: permReady, isAdmin: permIsAdmin, can } = usePermissions();
    const isAdminUser = permReady ? permIsAdmin : user?.role === 'Admin';
    const mgmtFlags = (page) => ({
        view: permReady ? can(page, 'view') : isAdminUser,
        create: permReady ? can(page, 'create') : isAdminUser,
        edit: permReady ? can(page, 'edit') : isAdminUser,
        del: permReady ? can(page, 'delete') : isAdminUser,
    });
    const pVendors = mgmtFlags('mgmt-vendors');
    const pLocations = mgmtFlags('mgmt-locations');
    const pReasons = mgmtFlags('mgmt-reasons');
    const pMATypes = mgmtFlags('mgmt-ma-types');
    const pBudgets = mgmtFlags('mgmt-budgets');
    const pFactoryLayouts = mgmtFlags('mgmt-factory-layouts');
    const pRecordServers = mgmtFlags('mgmt-record-servers');
    const pActivityCategories = mgmtFlags('mgmt-activity-categories');
    const pDeviceTypes = mgmtFlags('mgmt-device-types');
    // Users and Login Log can never be granted to anyone but Admin
    const visibleTabs = [
        isAdminUser && { id: 'admin', label: 'ผู้ใช้', icon: Users },
        pVendors.view && { id: 'vendors', label: 'ผู้จัดหา (Vendor)', icon: Truck },
        pLocations.view && { id: 'locations', label: 'สถานที่', icon: Archive },
        pReasons.view && { id: 'reasons', label: 'เหตุผลการเบิก', icon: MessageSquare },
        pDeviceTypes.view && { id: 'device-types', label: 'หมวดอุปกรณ์', icon: ListChecks },
        pMATypes.view && { id: 'ma-types', label: 'ประเภท MA', icon: FileKey },
        pBudgets.view && { id: 'budgets', label: 'หมวดงบประมาณ', icon: DollarSign },
        pFactoryLayouts.view && { id: 'factory-layouts', label: 'แผนผังโรงงาน', icon: Map },
        pRecordServers.view && { id: 'record-servers', label: 'Record Server', icon: Server },
        pActivityCategories.view && { id: 'activity-categories', label: 'หมวดกิจกรรม', icon: Camera },
        isAdminUser && { id: 'login-logs', label: 'ประวัติเข้าระบบ', icon: History },
        isAdminUser && { id: 'audit-log', label: 'ประวัติการทำงาน', icon: ClipboardList },
    ].filter(Boolean);
    const visibleTabKey = visibleTabs.map((t) => t.id).join(',');
    // land on the first tab this person may see
    useEffect(() => {
        if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) setActiveTab(visibleTabs[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleTabKey]);
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    // Login Log State (Admin only)
    const [loginLogs, setLoginLogs] = useState([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [logStatus, setLogStatus] = useState('');
    const [logDays, setLogDays] = useState(30);

    // Vendors State
    const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
    const [editingVendor, setEditingVendor] = useState(null);
    const [vendorForm, setVendorForm] = useState({ VendorName: '', ContactInfo: '' });

    // Locations State
    const [locations, setLocations] = useState([]);
    const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState(null);
    const [locationForm, setLocationForm] = useState({ Name: '' });

    // Reasons State
    const [reasons, setReasons] = useState([]);
    const [isAddReasonOpen, setIsAddReasonOpen] = useState(false);
    const [editingReason, setEditingReason] = useState(null);
    const [reasonForm, setReasonForm] = useState({ Label: '', TypeId: '' });
    const [selectedReasonType, setSelectedReasonType] = useState('all');

    // MA Types State
    const [maTypes, setMaTypes] = useState([]);
    const [isAddMATypeOpen, setIsAddMATypeOpen] = useState(false);
    const [editingMAType, setEditingMAType] = useState(null);
    const [maTypeForm, setMaTypeForm] = useState({ Category: 'HARDWARE', TypeName: '' });
    const [selectedMACategory, setSelectedMACategory] = useState('all');

    // Budgets State
    const [budgetCategories, setBudgetCategories] = useState([]);
    const [isAddBudgetOpen, setIsAddBudgetOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState(null);
    const [budgetForm, setBudgetForm] = useState({ CategoryCode: '', CategoryLabel: '', BudgetFormat: '', IsActive: true, AllowedDeviceTypes: [] });

    // Factory Layouts State
    const [factoryLayouts, setFactoryLayouts] = useState([]);
    const [isAddFactoryLayoutOpen, setIsAddFactoryLayoutOpen] = useState(false);
    const [editingFactoryLayout, setEditingFactoryLayout] = useState(null);
    const [factoryLayoutForm, setFactoryLayoutForm] = useState({ name: '', image_url: '', width: 1920, height: 1080 });
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploadingLayout, setIsUploadingLayout] = useState(false);
    const fileInputRef = useRef(null);

    // CCTV Record Servers State
    const [recordServers, setRecordServers] = useState([]);
    const [editingRecordServer, setEditingRecordServer] = useState(null);
    const [recordServerForm, setRecordServerForm] = useState({ name: '', ip_address: '' });
    const [isRecordServerFormOpen, setIsRecordServerFormOpen] = useState(false);

    // Alert Modal
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

    // Activity Categories State
    const [activityCategories, setActivityCategories] = useState([]);
    const [isAddActivityCategoryOpen, setIsAddActivityCategoryOpen] = useState(false);
    const [editingActivityCategory, setEditingActivityCategory] = useState(null);
    const [activityCategoryForm, setActivityCategoryForm] = useState({ CategoryCode: '', Label: '', ColorHex: '#64748B', SortOrder: 0 });

    // Handle device type selection for budgets
    const handleDeviceTypeSelect = (typeId) => {
        setBudgetForm(prev => {
            const current = prev.AllowedDeviceTypes || [];
            if (current.includes(typeId)) {
                return { ...prev, AllowedDeviceTypes: current.filter(id => id !== typeId) };
            } else {
                return { ...prev, AllowedDeviceTypes: [...current, typeId] };
            }
        });
    };

    // --- Fetch Functions ---
    const fetchLoginLogs = async () => {
        setIsLoadingLogs(true);
        try {
            const params = new URLSearchParams({ days: String(logDays) });
            if (logStatus) params.set('status', logStatus);
            const res = await fetch(`${API_BASE}/login-logs?${params}`, { headers: authHeaders });
            if (res.ok) setLoginLogs(await res.json());
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingLogs(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'login-logs') fetchLoginLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, logStatus, logDays]);

    const fetchStockUsers = async () => {
        setIsLoadingUsers(true);
        try {
            const res = await fetch(`${API_BASE}/stock-users`, { headers: authHeaders });
            if (res.ok) setStockUsers(await res.json());
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const fetchLocations = async () => {
        try {
            const res = await fetch(`${API_BASE}/locations`);
            if (res.ok) setLocations(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    // backend ส่ง IsActive เป็น boolean (true/false) — ต้องเช็คทั้ง false และ 0
    const isInactive = (r) => r.IsActive === false || r.IsActive === 0;

    const fetchReasons = async () => {
        try {
            const res = await fetch(`${API_BASE}/reasons`);
            if (res.ok) setReasons(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    const fetchMATypes = async () => {
        try {
            const res = await fetch(`${API_BASE}/ma-types`);
            if (res.ok) setMaTypes(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    const fetchBudgetCategories = async () => {
        try {
            const res = await fetch(`${API_BASE}/budgets`);
            if (res.ok) setBudgetCategories(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    const fetchFactoryLayouts = async () => {
        try {
            const res = await fetch(`${API_BASE}/factory-layouts`);
            if (res.ok) {
                const data = await res.json();
                setFactoryLayouts(data.data || []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchActivityCategories = async () => {
        try {
            const res = await fetch(`${API_BASE}/activity-categories`);
            if (res.ok) setActivityCategories(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    // --- CCTV Record Server Functions ---
    const fetchRecordServers = async () => {
        try {
            const res = await fetch(`${API_BASE}/cctv/record-servers`);
            if (res.ok) {
                const data = await res.json();
                setRecordServers(data.data || []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveRecordServer = async () => {
        if (!recordServerForm.name.trim()) return;
        const isEdit = !!editingRecordServer;
        const url = isEdit ? `${API_BASE}/cctv/record-servers/${editingRecordServer.id}` : `${API_BASE}/cctv/record-servers`;
        try {
            const res = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: recordServerForm.name.trim(), ip_address: recordServerForm.ip_address.trim(), created_by: user?.username || user?.name || '' })
            });
            if (res.ok) {
                setIsRecordServerFormOpen(false);
                setEditingRecordServer(null);
                setRecordServerForm({ name: '', ip_address: '' });
                fetchRecordServers();
            } else {
                const err = await res.json();
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.error || 'บันทึกไม่สำเร็จ' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    const handleDeleteRecordServer = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบ Record Server',
            message: 'คุณแน่ใจหรือไม่? ถ้ามีกล้องผูกอยู่จะไม่สามารถลบได้',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/cctv/record-servers/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบสำเร็จ' });
                        fetchRecordServers();
                    } else {
                        const err = await res.json();
                        setAlertModal({ isOpen: true, type: 'error', title: 'ไม่สามารถลบได้', message: err.error || 'เกิดข้อผิดพลาด' });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // โหลดรายการเล็กๆ ล่วงหน้า เพื่อแสดงจำนวนในเมนู (แท็บที่เปิดอยู่โหลดอีกครั้งด้านล่าง)
    useEffect(() => {
        const ids = new Set(visibleTabs.map((t) => t.id));
        if (ids.has('admin') && activeTab !== 'admin') fetchStockUsers();
        if (ids.has('locations') && activeTab !== 'locations') fetchLocations();
        if (ids.has('reasons') && activeTab !== 'reasons') fetchReasons();
        if (ids.has('ma-types') && activeTab !== 'ma-types') fetchMATypes();
        if (ids.has('budgets') && activeTab !== 'budgets') fetchBudgetCategories();
        if (ids.has('factory-layouts') && activeTab !== 'factory-layouts') fetchFactoryLayouts();
        if (ids.has('record-servers') && activeTab !== 'record-servers') fetchRecordServers();
        if (ids.has('activity-categories') && activeTab !== 'activity-categories') fetchActivityCategories();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleTabKey]);

    useEffect(() => {
        if (!visibleTabs.some((t) => t.id === activeTab)) return;
        if (activeTab === 'admin') fetchStockUsers();
        if (activeTab === 'locations') fetchLocations();
        if (activeTab === 'reasons') fetchReasons();
        if (activeTab === 'ma-types') fetchMATypes();
        if (activeTab === 'budgets') fetchBudgetCategories();
        if (activeTab === 'factory-layouts') fetchFactoryLayouts();
        if (activeTab === 'record-servers') fetchRecordServers();
        if (activeTab === 'activity-categories') fetchActivityCategories();
        setSearchTerm('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, visibleTabKey]);

    // --- User Role Functions ---
    const handleChangeRole = (target, newRole) => {
        if (newRole === target.Role) return;
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ยืนยันการเปลี่ยนสิทธิ์',
            message: `เปลี่ยนสิทธิ์ ${target.Name || target.Username || target.EmpCode} จาก ${target.Role} เป็น ${newRole}? (มีผลเมื่อผู้ใช้ login ครั้งถัดไป)`,
            confirmText: 'เปลี่ยน',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                setSavingRoleId(target.ID);
                try {
                    const res = await fetch(`${API_BASE}/stock-users/${target.ID}/role`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        body: JSON.stringify({ Role: newRole })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok && data.success) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: data.message || 'อัปเดตสิทธิ์สำเร็จ' });
                        fetchStockUsers();
                    } else {
                        setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error || data.message || `HTTP ${res.status}` });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                } finally {
                    setSavingRoleId(null);
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // DB uses useUTC:false, so JSON dates are real UTC instants — show them in local time
    const formatDbDate = (d) => {
        const t = d ? new Date(d) : null;
        if (!t || isNaN(t)) return '-';
        const p = (n) => String(n).padStart(2, '0');
        return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
    };


const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'ขนาดรูปต้องไม่เกิน 5MB' });
            return;
        }
        setSelectedFile(file);
    }
};



    // --- Vendor Functions ---
    const handleSaveVendor = async (e) => {
        e.preventDefault();
        try {
            const isEdit = !!editingVendor;
            const url = isEdit ? `${API_BASE}/vendors/${editingVendor.VendorID}` : `${API_BASE}/vendors`;
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vendorForm)
            });
            const data = await res.json();
            if (data.success) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'บันทึกข้อมูลผู้จัดหาสำเร็จ' });
                setIsAddVendorOpen(false);
                setEditingVendor(null);
                setVendorForm({ VendorName: '', ContactInfo: '' });
                refreshData();
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    const handleDeleteVendor = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบผู้จัดหา',
            message: 'คุณแน่ใจหรือไม่?',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/vendors/${id}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (data.success) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบสำเร็จ' });
                        refreshData();
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- Location Functions ---
    const handleSaveLocation = async (e) => {
        e.preventDefault();
        try {
            const isEdit = !!editingLocation;
            const url = isEdit ? `${API_BASE}/locations/${editingLocation.LocationID}` : `${API_BASE}/locations`;
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(locationForm)
            });
            const data = await res.json();
            if (data.success) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'บันทึกข้อมูลสถานที่สำเร็จ' });
                setIsAddLocationOpen(false);
                setEditingLocation(null);
                setLocationForm({ Name: '' });
                fetchLocations();
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    const handleDeleteLocation = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบสถานที่',
            message: 'คุณแน่ใจหรือไม่?',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/locations/${id}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (data.success) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบสำเร็จ' });
                        fetchLocations();
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- Reason Functions ---
    const handleSaveReason = async (e) => {
        e.preventDefault();
        try {
            const isEdit = !!editingReason;
            const url = isEdit ? `${API_BASE}/reasons/${editingReason.ReasonID}` : `${API_BASE}/reasons`;
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: reasonForm.Label, typeId: reasonForm.TypeId || null })
            });
            const data = await res.json();
            if (res.ok) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'บันทึกข้อมูลเหตุผลสำเร็จ' });
                setIsAddReasonOpen(false);
                setEditingReason(null);
                setReasonForm({ Label: '', TypeId: '' });
                fetchReasons();
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    const handleDeleteReason = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ปิดการใช้งานเหตุผล',
            message: 'เหตุผลนี้จะไม่แสดงในตัวเลือกการเบิก แต่ประวัติเดิมยังอยู่ และกดเปิดใช้งานคืนได้',
            confirmText: 'ปิดการใช้งาน',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/reasons/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ปิดการใช้งานแล้ว' });
                        fetchReasons();
                    } else {
                        const data = await res.json().catch(() => ({}));
                        setAlertModal({ isOpen: true, type: 'error', title: 'ปิดการใช้งานไม่สำเร็จ', message: data.error || `เซิร์ฟเวอร์ตอบกลับ ${res.status}` });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // เปิดใช้งานเหตุผลที่ปิดไว้แล้ว
    const handleRestoreReason = async (reason) => {
        try {
            const res = await fetch(`${API_BASE}/reasons/${reason.ReasonID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: reason.Label, typeId: reason.TypeId || null, isActive: true })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'เปิดใช้งานไม่สำเร็จ');
            fetchReasons();
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    // --- MA Type Functions ---
    const MA_CATEGORIES = [
        { key: 'HARDWARE', label: 'Hardware MA' },
        { key: 'SOFTWARE', label: 'Software License' },
        { key: 'SERVICE', label: 'Services' },
        { key: 'RENTAL', label: 'Rental' },
    ];

    const handleSaveMAType = async (e) => {
        e.preventDefault();
        try {
            const isEdit = !!editingMAType;
            const url = isEdit ? `${API_BASE}/ma-types/${editingMAType.TypeID}` : `${API_BASE}/ma-types`;
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(maTypeForm)
            });
            const data = await res.json();
            if (data.success || res.ok) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'บันทึกข้อมูลประเภท MA สำเร็จ' });
                setIsAddMATypeOpen(false);
                setEditingMAType(null);
                setMaTypeForm({ Category: 'HARDWARE', TypeName: '' });
                fetchMATypes();
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    const handleDeleteMAType = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบประเภท MA',
            message: 'คุณแน่ใจหรือไม่?',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/ma-types/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบสำเร็จ' });
                        fetchMATypes();
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- Budget Functions ---
    const handleSaveBudget = async (e) => {
        e.preventDefault();
        try {
            const isEdit = !!editingBudget;
            const url = isEdit ? `${API_BASE}/budgets/${editingBudget.CategoryID}` : `${API_BASE}/budgets`;
            const method = isEdit ? 'PUT' : 'POST';
            const payload = { ...budgetForm, AllowedDeviceTypes: budgetForm.AllowedDeviceTypes || [] };
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success || res.ok) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'บันทึกข้อมูลงบประมาณสำเร็จ' });
                setIsAddBudgetOpen(false);
                setEditingBudget(null);
                setBudgetForm({ CategoryCode: '', CategoryLabel: '', BudgetFormat: '', IsActive: true, AllowedDeviceTypes: [] });
                fetchBudgetCategories();
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    const handleDeleteBudget = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบงบประมาณ',
            message: 'คุณแน่ใจหรือไม่?',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/budgets/${id}`, { method: 'DELETE' });
                    if (res.ok || (await res.json()).success) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบสำเร็จ' });
                        fetchBudgetCategories();
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- Factory Layout Functions ---
    const dragIndexRef = useRef(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    const handleDragStart = (index) => { dragIndexRef.current = index; };
    const handleDragOver  = (e, index) => { e.preventDefault(); setDragOverIndex(index); };
    const handleDragLeave = () => setDragOverIndex(null);

    const handleDrop = async (dropIndex) => {
        setDragOverIndex(null);
        const dragIndex = dragIndexRef.current;
        console.log('drag:', dragIndex, 'drop:', dropIndex);
        if (dragIndex === null || dragIndex === dropIndex) return;

        const filtered = factoryLayouts.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()));
        const newLayouts = [...factoryLayouts];
        const dragId = filtered[dragIndex].id;
        const dropId = filtered[dropIndex].id;
        const idxA   = newLayouts.findIndex(l => l.id === dragId);
        const idxB   = newLayouts.findIndex(l => l.id === dropId);

        const [removed] = newLayouts.splice(idxA, 1);
        newLayouts.splice(idxB, 0, removed);

        const orders = newLayouts.map((l, i) => ({ id: l.id, sort_order: i + 1 }));
        setFactoryLayouts(newLayouts);
        dragIndexRef.current = null;

        try {
            await fetch(`${API_BASE}/cctv/layouts/reorder`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orders })
            });
        } catch (err) {
            console.error('Reorder failed:', err);
            fetchFactoryLayouts();
        }
    };

 const handleSaveFactoryLayout = async (e) => {
    e.preventDefault();
    setIsUploadingLayout(true);
    try {
        const formData = new FormData();
        formData.append('name', factoryLayoutForm.name);
        formData.append('width', factoryLayoutForm.width);
        formData.append('height', factoryLayoutForm.height);
        
        // ✅ CRITICAL: ต้องมี file!
        if (!selectedFile && !editingFactoryLayout) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'ต้องเลือกรูปไฟล์' });
            setIsUploadingLayout(false);
            return;
        }
        
        // ✅ ต้องมี 'image' field (ไม่ใช่ 'image_url')
        if (selectedFile) {
            formData.append('image', selectedFile);
        }

        const isEdit = !!editingFactoryLayout;
        const url = isEdit ? `${API_BASE}/factory-layouts/${editingFactoryLayout.id}` : `${API_BASE}/factory-layouts`;
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            body: formData  // ✅ ต้อง FormData ไม่ใช่ JSON!
        });

        const data = await res.json();
        console.log('reorder result:', data);
        if (data.success || res.ok) {
            setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'บันทึก Factory Layout สำเร็จ' });
            setIsAddFactoryLayoutOpen(false);
            setEditingFactoryLayout(null);
            setFactoryLayoutForm({ name: '', image_url: '', width: 1920, height: 1080 });
            setSelectedFile(null);
            fetchFactoryLayouts();
        } else {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error || 'Failed' });
        }
    } catch (err) {
        setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
    } finally {
        setIsUploadingLayout(false);
    }
};

    const handleDeleteFactoryLayout = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบ Factory Layout',
            message: 'คุณแน่ใจหรือไม่?',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/factory-layouts/${id}`, { method: 'DELETE' });                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบสำเร็จ' });
                        fetchFactoryLayouts();
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- Activity Category Functions ---
    const handleSaveActivityCategory = async (e) => {
        e.preventDefault();
        try {
            const isEdit = !!editingActivityCategory;
            const url = isEdit ? `${API_BASE}/activity-categories/${editingActivityCategory.CategoryCode}` : `${API_BASE}/activity-categories`;
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(activityCategoryForm)
            });
            const data = await res.json();
            if (res.ok) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'บันทึกหมวดหมู่สำเร็จ' });
                setIsAddActivityCategoryOpen(false);
                setEditingActivityCategory(null);
                setActivityCategoryForm({ CategoryCode: '', Label: '', ColorHex: '#64748B', SortOrder: 0 });
                fetchActivityCategories();
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error || 'บันทึกไม่สำเร็จ' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    const handleDeleteActivityCategory = (code) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบหมวดหมู่ Activity',
            message: 'คุณแน่ใจหรือไม่? (ถ้ามีอัลบัมใช้หมวดนี้อยู่จะลบไม่ได้)',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/activity-categories/${code}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบสำเร็จ' });
                        fetchActivityCategories();
                    } else {
                        setAlertModal({ isOpen: true, type: 'error', title: 'ลบไม่ได้', message: data.error || 'มีอัลบัมใช้งานอยู่' });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // ── เมนูแบ่งกลุ่ม (จอคอม: เมนูซ้าย · มือถือ/แท็บเล็ต: ตัวเลือก) ──
    const tabCount = {
        admin: stockUsers.length || null,
        vendors: vendors?.length ?? null,
        locations: locations.length || null,
        reasons: reasons.length || null,
        'device-types': deviceTypes?.length ?? null,
        'ma-types': maTypes.length || null,
        budgets: budgetCategories.length || null,
        'factory-layouts': factoryLayouts.length || null,
        'record-servers': recordServers.length || null,
        'activity-categories': activityCategories.length || null,
    };
    const navGroups = TAB_GROUPS
        .map((g) => ({ ...g, items: g.ids.map((id) => visibleTabs.find((t) => t.id === id)).filter(Boolean) }))
        .filter((g) => g.items.length > 0);
    const activeInfo = visibleTabs.find((t) => t.id === activeTab);
    const productCountByLocation = (() => {
        const m = {};
        for (const p of products || []) { const k = p.Location || ''; m[k] = (m[k] || 0) + 1; }
        return m;
    })();
    const searchProps = { search: searchTerm, onSearch: setSearchTerm };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-800">การจัดการระบบ</h2>
                <p className="text-slate-500 text-sm font-medium mt-1">ผู้ใช้ สิทธิ์ และข้อมูลหลักที่ใช้ร่วมกันทั้งระบบ</p>
            </div>

            {/* มือถือ/แท็บเล็ต: เลือกหัวข้อ */}
            <div className="lg:hidden">
                <label htmlFor="mgmt-section" className="block text-xs font-bold text-slate-500 mb-1">หัวข้อ</label>
                <div className="relative">
                    {activeInfo && <activeInfo.icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none" />}
                    <select id="mgmt-section" value={activeTab} onChange={(e) => changeTab(e.target.value)}
                        className="w-full h-11 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none">
                        {navGroups.map((g) => (
                            <optgroup key={g.label} label={g.label}>
                                {g.items.map((t) => <option key={t.id} value={t.id}>{t.label}{tabCount[t.id] ? ` (${tabCount[t.id]})` : ''}</option>)}
                            </optgroup>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[232px,minmax(0,1fr)] gap-6 items-start">
                {/* จอคอม: เมนูซ้ายแบ่งกลุ่ม */}
                <nav aria-label="หัวข้อการจัดการ" className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-sm p-3 lg:sticky lg:top-4">
                    {navGroups.map((g) => (
                        <div key={g.label} className="mb-3 last:mb-0">
                            <div className="px-2 pb-1 text-[11px] font-bold text-slate-400">{g.label}</div>
                            {g.items.map((t) => {
                                const on = t.id === activeTab;
                                return (
                                    <button key={t.id} type="button" onClick={() => changeTab(t.id)} aria-current={on ? 'page' : undefined}
                                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-bold transition-colors ${on ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                                        <t.icon size={16} className={on ? 'text-indigo-600' : 'text-slate-400'} />
                                        <span className="flex-1 text-left truncate">{t.label}</span>
                                        {tabCount[t.id] ? <span className={`text-[11px] tabular-nums ${on ? 'text-indigo-500' : 'text-slate-400'}`}>{tabCount[t.id]}</span> : null}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>

            {/* Content Area */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 min-h-[400px] min-w-0">
                {/* ผู้ใช้ */}
                {activeTab === 'admin' && isAdminUser && (
                    <MgmtSection
                        title="ผู้ใช้" count={stockUsers.length}
                        subtitle={`บันทึกอัตโนมัติเมื่อ login ครั้งแรก (ได้สิทธิ์ Staff) · Admin ${stockUsers.filter(u => u.Role === 'Admin').length} คน · เปลี่ยนบทบาทได้ในคอลัมน์ "บทบาท"`}
                        actions={<>
                            <SecondaryButton icon={KeyRound} onClick={() => setPermTarget(null)} title="สิทธิ์ที่ผู้ใช้ใหม่จะได้ตอน login ครั้งแรก">สิทธิ์ตั้งต้นผู้ใช้ใหม่</SecondaryButton>
                            <SecondaryButton icon={ListChecks} onClick={() => setShowPermLog(true)} title="ดูว่าถ้าเปิดบังคับสิทธิ์จริง จะมีอะไรถูกบล็อก">รายงานตรวจสิทธิ์</SecondaryButton>
                            <SecondaryButton icon={ShieldCheck} onClick={() => setShowHolders(true)} title="เลือกหน้าและสิทธิ์ เพื่อดูว่าใครมีสิทธิ์นั้นบ้าง">ใครมีสิทธิ์นี้</SecondaryButton>
                        </>}
                    >
                        {/* การ์ดสรุป = ตัวกรองไปด้วย */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {USER_FILTERS.map((f) => (
                                <UserStatCard key={f.id} f={f} count={stockUsers.filter(f.test).length} total={stockUsers.length}
                                    active={userFilter === f.id} onClick={() => setUserFilter(userFilter === f.id ? 'all' : f.id)} />
                            ))}
                        </div>
                        <MgmtTable
                            {...searchProps} loading={isLoadingUsers}
                            rows={filteredStockUsers}
                            rowKey={u => u.ID} minWidth={900}
                            defaultSort={{ key: 'last', dir: 'desc' }}
                            searchText={u => [u.EmpCode, u.Username, u.Name, u.Sect, u.Role].join(' ')}
                            searchPlaceholder="ค้นหาชื่อ, รหัสพนักงาน, username, แผนก…"
                            emptyText={userFilter === 'all' ? 'ยังไม่มีผู้ใช้' : 'ไม่มีผู้ใช้ในกลุ่มนี้'}
                            toolbar={userFilter !== 'all' && (
                                <button type="button" onClick={() => setUserFilter('all')}
                                    className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors">
                                    {USER_FILTERS.find((f) => f.id === userFilter)?.label} <X size={13} />
                                </button>
                            )}
                            columns={[
                                { key: 'name', label: 'ผู้ใช้', primary: true, sortValue: u => u.Name || u.Username, render: u => {
                                    const isSelf = String(u.EmpCode) === String(user?.empcode);
                                    const rc = recency(u.LastLoginAt);
                                    const isAdm = u.Role === 'Admin';
                                    return (
                                        <div className="flex items-center gap-3">
                                            <div className="relative shrink-0" title={rc.label}>
                                                <div className={`rounded-xl p-[2px] ${isAdm ? 'bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400' : 'bg-slate-100'}`}>
                                                    <div className="rounded-[10px] bg-white p-[1px]">
                                                        <UserAvatar pic={u.EmpPic} empCode={u.EmpCode} name={u.Name || u.Username} size={38} />
                                                    </div>
                                                </div>
                                                <span className="absolute -bottom-0.5 -right-0.5 flex w-3 h-3">
                                                    {rc.ping && <span className={`absolute inline-flex h-full w-full rounded-full ${rc.dot} opacity-60 animate-ping`} />}
                                                    <span className={`relative inline-flex w-3 h-3 rounded-full ring-2 ring-white ${rc.dot}`} />
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                                    {u.Name || '-'}
                                                    {isSelf && <span className="text-[10px] font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-500 px-1.5 py-0.5 rounded-md">คุณ</span>}
                                                </div>
                                                <div className="text-[11px] text-slate-400 font-medium">{u.Username || '-'}</div>
                                            </div>
                                        </div>
                                    );
                                } },
                                { key: 'emp', label: 'รหัสพนักงาน', sortValue: u => u.EmpCode, render: u => <span className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded-md">{u.EmpCode}</span> },
                                { key: 'sect', label: 'แผนก', sortValue: u => u.Sect, render: u => (u.Sect
                                    ? <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ring-1 ${sectColor(u.Sect)}`}>{u.Sect}</span>
                                    : <span className="text-slate-300">-</span>) },
                                { key: 'role', label: 'บทบาท', sortValue: u => u.Role, render: u => {
                                    const canEdit = isAdminUser && String(u.EmpCode) !== String(user?.empcode);
                                    return canEdit ? (
                                        <RoleToggle u={u} disabled={savingRoleId === u.ID} onChange={(r) => handleChangeRole(u, r)} />
                                    ) : (
                                        <span className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-xl text-xs font-bold ${u.Role === 'Admin' ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm shadow-violet-200' : 'bg-slate-100 text-slate-600'}`}>
                                            {u.Role === 'Admin' && <Shield size={12} />}{u.Role}
                                        </span>
                                    );
                                } },
                                { key: 'perm', label: 'สิทธิ์', sortValue: u => (u.Role === 'Admin' ? 1e9 : u.PermCount ?? 0), render: u => {
                                    if (u.Role === 'Admin') {
                                        return (
                                            <span className="inline-flex items-center gap-1 text-xs font-black bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                                                <Sparkles size={13} className="text-fuchsia-500" /> ทุกสิทธิ์
                                            </span>
                                        );
                                    }
                                    const n = u.PermCount ?? 0;
                                    const pct = permTotal ? Math.min(100, Math.round((n / permTotal) * 100)) : 0;
                                    const body = (
                                        <>
                                            <div className="flex items-center gap-1.5 text-xs font-bold">
                                                <KeyRound size={12} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                                                <span className="text-slate-700 tabular-nums">{n}</span>
                                                {permTotal > 0 && <span className="text-slate-300 tabular-nums">/ {permTotal}</span>}
                                                {isAdminUser && <span className="ml-auto text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">ตั้งสิทธิ์ →</span>}
                                            </div>
                                            {permTotal > 0 && (
                                                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                    <motion.div className={`h-full rounded-full bg-gradient-to-r ${n === 0 ? 'from-rose-400 to-rose-400' : 'from-indigo-500 to-violet-500'}`}
                                                        initial={{ width: 0 }} animate={{ width: `${Math.max(pct, n ? 4 : 0)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                                                </div>
                                            )}
                                        </>
                                    );
                                    return isAdminUser ? (
                                        <button type="button" onClick={() => setPermTarget(u)} title="คลิกเพื่อตั้งสิทธิ์"
                                            className="group w-36 text-left px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-sm transition-all">
                                            {body}
                                        </button>
                                    ) : <div className="w-36">{body}</div>;
                                } },
                                { key: 'last', label: 'เข้าระบบล่าสุด', sortValue: u => u.LastLoginAt || '', render: u => (
                                    <div className="whitespace-nowrap" title={formatDbDate(u.LastLoginAt)}>
                                        <div className="text-sm font-bold text-slate-700">{relTime(u.LastLoginAt)}</div>
                                        <div className="font-mono text-[11px] text-slate-400">{formatDbDate(u.LastLoginAt)}</div>
                                    </div>
                                ) },
                                { key: 'first', label: 'เข้าครั้งแรก', mobileHidden: true, sortValue: u => u.FirstLoginAt || '', render: u => (
                                    <span className="font-mono text-xs text-slate-400 whitespace-nowrap" title={relTime(u.FirstLoginAt)}>{formatDbDate(u.FirstLoginAt).slice(0, 10)}</span>
                                ) },
                            ]}
                        />
                    </MgmtSection>
                )}

                {/* ประวัติเข้าระบบ */}
                {activeTab === 'login-logs' && isAdminUser && (() => {
                    const count = (s) => loginLogs.filter(l => l.Status === s).length;
                    const statusStyle = { SUCCESS: 'bg-emerald-50 text-emerald-700', FAILED: 'bg-amber-50 text-amber-700', DENIED: 'bg-rose-50 text-rose-700', ERROR: 'bg-slate-200 text-slate-700' };
                    const statusTh = { SUCCESS: 'สำเร็จ', FAILED: 'ผิดรหัส', DENIED: 'ไม่มีสิทธิ์', ERROR: 'ขัดข้อง' };
                    const browserOf = (ua = '') => /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : (ua ? 'Other' : '-');
                    return (
                        <MgmtSection title="ประวัติเข้าระบบ" count={loginLogs.length}
                            subtitle={<>สำเร็จ <b className="text-emerald-600">{count('SUCCESS')}</b> · ผิดรหัส <b className="text-amber-600">{count('FAILED')}</b> · ไม่มีสิทธิ์ <b className="text-rose-600">{count('DENIED')}</b> · ระบบขัดข้อง <b className="text-slate-700">{count('ERROR')}</b></>}>
                            <MgmtTable
                                {...searchProps} loading={isLoadingLogs} rows={loginLogs} rowKey={l => l.ID} pageSize={25} minWidth={900}
                                searchText={l => [l.Username, l.EmpCode, l.Name, l.IpAddress, l.Reason, l.Status].join(' ')}
                                searchPlaceholder="ค้นหาผู้ใช้, IP, เหตุผล…" emptyText="ไม่พบประวัติการ login ในช่วงนี้"
                                toolbar={<>
                                    <select value={logStatus} onChange={(e) => setLogStatus(e.target.value)} aria-label="สถานะ" className="h-10 px-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 bg-white">
                                        <option value="">ทุกสถานะ</option>
                                        {Object.keys(statusTh).map(s => <option key={s} value={s}>{statusTh[s]}</option>)}
                                    </select>
                                    <select value={logDays} onChange={(e) => setLogDays(Number(e.target.value))} aria-label="ช่วงเวลา" className="h-10 px-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 bg-white">
                                        <option value={1}>24 ชม.</option><option value={7}>7 วัน</option><option value={30}>30 วัน</option><option value={90}>90 วัน</option><option value={365}>1 ปี</option>
                                    </select>
                                    <button type="button" onClick={fetchLoginLogs} title="รีเฟรช" aria-label="รีเฟรช" className="h-10 w-10 flex items-center justify-center border border-slate-200 rounded-xl bg-white text-slate-500 hover:text-indigo-600">
                                        <RefreshCw size={16} className={isLoadingLogs ? 'animate-spin' : ''} />
                                    </button>
                                </>}
                                columns={[
                                    { key: 'time', label: 'เวลา', sortValue: l => l.LoginAt, render: l => <span className="font-mono text-slate-600 whitespace-nowrap">{formatDbDate(l.LoginAt)}</span> },
                                    { key: 'status', label: 'สถานะ', sortValue: l => l.Status, render: l => <span className={`px-2 py-1 rounded-lg text-xs font-bold ${statusStyle[l.Status] || 'bg-slate-100 text-slate-600'}`}>{statusTh[l.Status] || l.Status}</span> },
                                    { key: 'user', label: 'ผู้ใช้', primary: true, sortValue: l => l.Name || l.Username, render: l => (
                                        <div className="flex items-center gap-2">
                                            {l.EmpCode ? <UserAvatar pic={l.EmpPic} empCode={l.EmpCode} name={l.Name || l.Username} size={28} /> : null}
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-700 truncate">{l.Name || l.Username || '-'}</div>
                                                <div className="text-[11px] text-slate-400 font-mono">{l.Username || '-'}{l.EmpCode ? ` · ${l.EmpCode}` : ''}</div>
                                            </div>
                                        </div>
                                    ) },
                                    { key: 'role', label: 'บทบาท', sortValue: l => l.Role, render: l => <span className="text-slate-600">{l.Role || '-'}</span> },
                                    { key: 'reason', label: 'เหตุผล', render: l => <span className="text-slate-500 block max-w-[240px] truncate" title={l.Reason || ''}>{l.Reason || '-'}</span> },
                                    { key: 'ip', label: 'IP', sortValue: l => l.IpAddress, render: l => <span className="font-mono text-slate-600">{l.IpAddress || '-'}</span> },
                                    { key: 'browser', label: 'เบราว์เซอร์', mobileHidden: true, render: l => <span className="text-slate-500" title={l.UserAgent || ''}>{browserOf(l.UserAgent || '')}</span> },
                                ]}
                            />
                        </MgmtSection>
                    );
                })()}

                {/* ประวัติการทำงาน (ทุกการเพิ่ม/แก้/ลบ) */}
                {activeTab === 'audit-log' && isAdminUser && <AuditLogTab UserAvatar={UserAvatar} authHeaders={authHeaders} />}

                {/* ผู้จัดหา */}
                {activeTab === 'vendors' && (
                    <MgmtSection title="ผู้จัดหา (Vendor)" count={vendors.length} subtitle="รายชื่อผู้ขาย/ผู้จัดหาที่ใช้ในใบสั่งซื้อและการรับของ"
                        actions={pVendors.create && <PrimaryButton icon={Plus} onClick={() => { setEditingVendor(null); setVendorForm({ VendorName: '', ContactInfo: '' }); setIsAddVendorOpen(true); }}>เพิ่มผู้จัดหา</PrimaryButton>}>
                        <MgmtTable
                            {...searchProps} rows={vendors} rowKey={v => v.VendorID} minWidth={560}
                            searchText={v => `${v.VendorName} ${v.ContactInfo || ''}`} searchPlaceholder="ค้นหาชื่อผู้จัดหา หรือข้อมูลติดต่อ…" emptyText="ยังไม่มีผู้จัดหา"
                            defaultSort={{ key: 'name', dir: 'asc' }}
                            columns={[
                                { key: 'name', label: 'ชื่อผู้จัดหา', primary: true, sortValue: v => v.VendorName, render: v => <span className="font-bold text-slate-700 flex items-center gap-2"><Truck size={16} className="text-orange-500 shrink-0" />{v.VendorName}</span> },
                                { key: 'contact', label: 'ข้อมูลติดต่อ', sortValue: v => v.ContactInfo, render: v => <span className="text-slate-600 block max-w-md truncate" title={v.ContactInfo || ''}>{v.ContactInfo || '-'}</span> },
                                { key: 'act', label: 'จัดการ', actions: true, render: v => <RowActions
                                    onEdit={pVendors.edit ? () => { setEditingVendor(v); setVendorForm(v); setIsAddVendorOpen(true); } : undefined}
                                    onDelete={pVendors.del ? () => handleDeleteVendor(v.VendorID) : undefined} /> },
                            ]}
                        />
                    </MgmtSection>
                )}

                {/* สถานที่ */}
                {activeTab === 'locations' && (
                    <MgmtSection title="สถานที่" count={locations.length} subtitle="สถานที่เก็บอุปกรณ์ · คอลัมน์ &quot;สินค้า&quot; คือจำนวนรายการในคลังที่ตั้งสถานที่นี้"
                        actions={pLocations.create && <PrimaryButton icon={Plus} onClick={() => { setEditingLocation(null); setLocationForm({ Name: '' }); setIsAddLocationOpen(true); }}>เพิ่มสถานที่</PrimaryButton>}>
                        <MgmtTable
                            {...searchProps} rows={locations} rowKey={l => l.LocationID} minWidth={480}
                            searchText={l => l.Name} searchPlaceholder="ค้นหาชื่อสถานที่…" emptyText="ยังไม่มีสถานที่"
                            defaultSort={{ key: 'name', dir: 'asc' }}
                            columns={[
                                { key: 'name', label: 'ชื่อสถานที่', primary: true, sortValue: l => l.Name, render: l => <span className="font-bold text-slate-700 flex items-center gap-2"><Archive size={16} className="text-teal-600 shrink-0" />{l.Name}</span> },
                                { key: 'products', label: 'สินค้า', align: 'right', sortValue: l => productCountByLocation[l.Name] || 0, render: l => {
                                    const n = productCountByLocation[l.Name] || 0;
                                    return <span className={`tabular-nums font-bold ${n ? 'text-slate-700' : 'text-slate-300'}`}>{n} รายการ</span>;
                                } },
                                { key: 'act', label: 'จัดการ', actions: true, render: l => <RowActions
                                    onEdit={pLocations.edit ? () => { setEditingLocation(l); setLocationForm({ Name: l.Name }); setIsAddLocationOpen(true); } : undefined}
                                    onDelete={pLocations.del ? () => handleDeleteLocation(l.LocationID) : undefined} /> },
                            ]}
                        />
                    </MgmtSection>
                )}

                {/* เหตุผลการเบิก */}
                {activeTab === 'reasons' && (
                    <MgmtSection title="เหตุผลการเบิก" count={reasons.length} subtitle="จัดกลุ่มตามประเภทอุปกรณ์ · ลบ = ปิดการใช้งาน (กู้คืนได้)"
                        actions={pReasons.create && <PrimaryButton icon={Plus} onClick={() => { setEditingReason(null); setReasonForm({ Label: '', TypeId: '' }); setIsAddReasonOpen(true); }}>เพิ่มเหตุผล</PrimaryButton>}>
                        <MgmtTable
                            {...searchProps} rows={reasons} rowKey={r => r.ReasonID} pageSize={50} minWidth={480}
                            searchText={r => `${r.Label} ${r.TypeId || ''}`} searchPlaceholder="ค้นหาเหตุผล…" emptyText="ยังไม่มีเหตุผลการเบิก"
                            groupBy={r => r.TypeId || ''}
                            renderGroup={(g, rs) => (
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-black text-indigo-700">{g || 'ไม่ระบุประเภท'} <span className="font-semibold text-indigo-400">· {rs.length} เหตุผล</span></span>
                                    {pReasons.create && g && (
                                        <button type="button" onClick={() => { setEditingReason(null); setReasonForm({ Label: '', TypeId: g }); setIsAddReasonOpen(true); }}
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-100">
                                            <Plus size={12} /> เพิ่มในประเภทนี้
                                        </button>
                                    )}
                                </div>
                            )}
                            rowClassName={r => (isInactive(r) ? 'opacity-50' : '')}
                            columns={[
                                { key: 'label', label: 'เหตุผล', primary: true, sortValue: r => r.Label, render: r => <span className="font-bold text-slate-700">{r.Label} {isInactive(r) && <span className="ml-1 px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-bold">ปิดใช้งาน</span>}</span> },
                                { key: 'type', label: 'ประเภท', render: r => <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600">{r.TypeId || '-'}</span> },
                                { key: 'act', label: 'จัดการ', actions: true, render: r => (
                                    <RowActions
                                        onEdit={pReasons.edit ? () => { setEditingReason(r); setReasonForm({ Label: r.Label, TypeId: r.TypeId || '' }); setIsAddReasonOpen(true); } : undefined}
                                        onDelete={pReasons.del && !isInactive(r) ? () => handleDeleteReason(r.ReasonID) : undefined} deleteLabel="ปิดการใช้งาน">
                                        {pReasons.edit && isInactive(r) && <button type="button" onClick={() => handleRestoreReason(r)} className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg">เปิดใช้งาน</button>}
                                    </RowActions>
                                ) },
                            ]}
                        />
                    </MgmtSection>
                )}

                {/* หมวดอุปกรณ์ — ค่าเริ่มต้นการจัดการสต็อกต่อหมวด */}
                {activeTab === 'device-types' && (
                    <DeviceTypeManagementTab
                        deviceTypes={deviceTypes}
                        products={products}
                        canEdit={pDeviceTypes.edit}
                        searchTerm={searchTerm}
                        onSearch={setSearchTerm}
                        onSaved={refreshData}
                        onAlert={(a) => setAlertModal({ isOpen: true, ...a })}
                    />
                )}

                {/* ประเภท MA */}
                {activeTab === 'ma-types' && (
                    <MgmtSection title="ประเภท MA" count={maTypes.length} subtitle="ประเภทสัญญา MA / License ที่ใช้ในหน้า MA / License"
                        actions={pMATypes.create && <PrimaryButton icon={Plus} onClick={() => { setEditingMAType(null); setMaTypeForm({ Category: 'HARDWARE', TypeName: '' }); setIsAddMATypeOpen(true); }}>เพิ่มประเภท</PrimaryButton>}>
                        <MgmtTable
                            {...searchProps} rows={maTypes} rowKey={t => t.TypeID} minWidth={480}
                            searchText={t => `${t.TypeName} ${t.Category}`} searchPlaceholder="ค้นหาประเภท MA…" emptyText="ยังไม่มีประเภท MA"
                            columns={[
                                { key: 'name', label: 'ชื่อประเภท', primary: true, sortValue: t => t.TypeName, render: t => <span className="font-bold text-slate-700">{t.TypeName}</span> },
                                { key: 'cat', label: 'หมวด', sortValue: t => t.Category, render: t => <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{t.Category}</span> },
                                { key: 'act', label: 'จัดการ', actions: true, render: t => <RowActions
                                    onEdit={pMATypes.edit ? () => { setEditingMAType(t); setMaTypeForm({ Category: t.Category, TypeName: t.TypeName }); setIsAddMATypeOpen(true); } : undefined}
                                    onDelete={pMATypes.del ? () => handleDeleteMAType(t.TypeID) : undefined} /> },
                            ]}
                        />
                    </MgmtSection>
                )}

                {/* งบประมาณ */}
                {activeTab === 'budgets' && (
                    <MgmtSection title="หมวดงบประมาณ" count={budgetCategories.length} subtitle="หมวดงบที่ใช้ในใบขอซื้อ และรูปแบบเลขงบ"
                        actions={pBudgets.create && <PrimaryButton icon={Plus} onClick={() => { setEditingBudget(null); setBudgetForm({ CategoryCode: '', CategoryLabel: '', BudgetFormat: '', IsActive: true, AllowedDeviceTypes: [] }); setIsAddBudgetOpen(true); }}>เพิ่มหมวดงบ</PrimaryButton>}>
                        <MgmtTable
                            {...searchProps} rows={budgetCategories} rowKey={b => b.CategoryID} minWidth={640}
                            searchText={b => `${b.CategoryLabel} ${b.CategoryCode} ${b.BudgetFormat || ''}`} searchPlaceholder="ค้นหาชื่อหรือรหัสหมวดงบ…" emptyText="ยังไม่มีหมวดงบประมาณ"
                            columns={[
                                { key: 'name', label: 'ชื่อหมวด', primary: true, sortValue: b => b.CategoryLabel, render: b => <span className="font-bold text-slate-700">{b.CategoryLabel}</span> },
                                { key: 'code', label: 'รหัส', sortValue: b => b.CategoryCode, render: b => <span className="font-mono font-bold text-slate-500">{b.CategoryCode}</span> },
                                { key: 'fmt', label: 'รูปแบบเลขงบ', render: b => <span className="font-mono text-slate-600">{b.BudgetFormat || '-'}</span> },
                                { key: 'status', label: 'สถานะ', sortValue: b => (b.IsActive === false ? 1 : 0), render: b => <span className={`px-2 py-1 rounded-full text-xs font-bold ${b.IsActive === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>{b.IsActive === false ? 'ปิดใช้งาน' : 'ใช้งาน'}</span> },
                                { key: 'act', label: 'จัดการ', actions: true, render: b => <RowActions
                                    onEdit={pBudgets.edit ? () => { setEditingBudget(b); setBudgetForm({ CategoryCode: b.CategoryCode, CategoryLabel: b.CategoryLabel, BudgetFormat: b.BudgetFormat || '', IsActive: b.IsActive !== false, AllowedDeviceTypes: (b.AllowedDeviceTypes || []).map(t => t.TypeId) }); setIsAddBudgetOpen(true); } : undefined}
                                    onDelete={pBudgets.del ? () => handleDeleteBudget(b.CategoryID) : undefined} /> },
                            ]}
                        />
                    </MgmtSection>
                )}

                {/* แผนผังโรงงาน — ลากเพื่อเรียงลำดับ (จึงไม่มีการเรียงคอลัมน์/แบ่งหน้า) */}
                {activeTab === 'factory-layouts' && (
                    <MgmtSection title="แผนผังโรงงาน" count={factoryLayouts.length} subtitle={pFactoryLayouts.edit ? 'ลากแถวเพื่อเรียงลำดับการแสดงผล (บนจอคอม)' : 'แผนผังที่ใช้ในหน้า Devices Layout และ CCTV'}
                        actions={pFactoryLayouts.create && <PrimaryButton icon={Plus} onClick={() => { setEditingFactoryLayout(null); setFactoryLayoutForm({ name: '', image_url: '', width: 1920, height: 1080 }); setSelectedFile(null); setIsAddFactoryLayoutOpen(true); }}>เพิ่มแผนผัง</PrimaryButton>}>
                        <MgmtTable
                            {...searchProps} rows={factoryLayouts} rowKey={l => l.id} sortable={false} pageSize={Infinity} minWidth={640}
                            searchText={l => l.name} searchPlaceholder="ค้นหาชื่อแผนผัง…" emptyText="ยังไม่มีแผนผัง"
                            rowProps={(layout, index) => ({
                                draggable: pFactoryLayouts.edit,
                                onDragStart: () => handleDragStart(index),
                                onDragOver: (e) => handleDragOver(e, index),
                                onDragLeave: handleDragLeave,
                                onDrop: () => handleDrop(index),
                            })}
                            rowClassName={(l, index) => `${pFactoryLayouts.edit ? 'cursor-grab active:cursor-grabbing' : ''} ${dragOverIndex === index ? 'bg-indigo-50 border-t-2 border-indigo-400' : ''}`}
                            columns={[
                                ...(pFactoryLayouts.edit ? [{ key: 'drag', label: '', mobileHidden: true, render: () => (
                                    <span className="flex items-center justify-center text-slate-300" aria-hidden="true">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/></svg>
                                    </span>
                                ) }] : []),
                                { key: 'name', label: 'ชื่อแผนผัง', primary: true, render: l => <span className="font-bold text-slate-700 flex items-center gap-2"><Map size={16} className="text-teal-600 shrink-0" />{l.name}</span> },
                                { key: 'img', label: 'ไฟล์ภาพ', render: l => <span className="text-slate-500 font-mono text-[11px] block max-w-xs truncate" title={l.image_url}>{l.image_url}</span> },
                                { key: 'size', label: 'ขนาด', render: l => <span className="font-mono text-slate-600">{l.width}×{l.height}</span> },
                                { key: 'act', label: 'จัดการ', actions: true, render: l => <RowActions
                                    onEdit={pFactoryLayouts.edit ? () => { setEditingFactoryLayout(l); setFactoryLayoutForm({ name: l.name, image_url: l.image_url, width: l.width || 1920, height: l.height || 1080 }); setSelectedFile(null); setIsAddFactoryLayoutOpen(true); } : undefined}
                                    onDelete={pFactoryLayouts.del ? () => handleDeleteFactoryLayout(l.id) : undefined} /> },
                            ]}
                        />
                    </MgmtSection>
                )}

                {/* Record Server (CCTV) */}
                {activeTab === 'record-servers' && (
                    <MgmtSection title="Record Server (CCTV)" count={recordServers.length} subtitle="Server ที่ใช้บันทึกภาพกล้อง สำหรับผูกกับกล้องแต่ละตัว · ลบได้เฉพาะ Server ที่ไม่มีกล้องผูกอยู่"
                        actions={pRecordServers.create && <PrimaryButton icon={Plus} onClick={() => { setEditingRecordServer(null); setRecordServerForm({ name: '', ip_address: '' }); setIsRecordServerFormOpen(true); }}>เพิ่ม Record Server</PrimaryButton>}>
                        <MgmtTable
                            {...searchProps} rows={recordServers} rowKey={s => s.id} minWidth={720}
                            searchText={s => `${s.name} ${s.ip_address || ''}`} searchPlaceholder="ค้นหาชื่อหรือ IP…" emptyText="ยังไม่มี Record Server"
                            columns={[
                                { key: 'name', label: 'ชื่อ Server', primary: true, sortValue: s => s.name, render: s => <span className="font-bold text-slate-700 flex items-center gap-2"><Server size={16} className="text-indigo-600 shrink-0" />{s.name}</span> },
                                { key: 'ip', label: 'IP Address', sortValue: s => s.ip_address, render: s => <span className="font-mono text-slate-600">{s.ip_address || '—'}</span> },
                                { key: 'cams', label: 'กล้อง', align: 'center', sortValue: s => s.camera_count || 0, render: s => (
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${s.camera_count > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>{s.camera_count || 0} ตัว</span>
                                ) },
                                { key: 'by', label: 'สร้างโดย', sortValue: s => s.created_by, render: s => <span className="text-slate-600">{s.created_by || '—'}</span> },
                                { key: 'at', label: 'วันที่สร้าง', mobileHidden: true, sortValue: s => s.created_at || '', render: s => <span className="text-slate-500">{s.created_at ? new Date(s.created_at).toLocaleDateString('th-TH') : '—'}</span> },
                                { key: 'act', label: 'จัดการ', actions: true, render: s => <RowActions
                                    onEdit={pRecordServers.edit ? () => { setEditingRecordServer(s); setRecordServerForm({ name: s.name, ip_address: s.ip_address || '' }); setIsRecordServerFormOpen(true); } : undefined}
                                    onDelete={pRecordServers.del ? () => handleDeleteRecordServer(s.id) : undefined} /> },
                            ]}
                        />
                    </MgmtSection>
                )}

                {/* หมวดกิจกรรม */}
                {activeTab === 'activity-categories' && (
                    <MgmtSection title="หมวดกิจกรรม" count={activityCategories.length} subtitle="หมวดหมู่ของ Activity Gallery (ใช้ในฟอร์มอัปโหลดรูปกิจกรรม)"
                        actions={pActivityCategories.create && <PrimaryButton icon={Plus} onClick={() => { setEditingActivityCategory(null); setActivityCategoryForm({ CategoryCode: '', Label: '', ColorHex: '#64748B', SortOrder: activityCategories.length + 1 }); setIsAddActivityCategoryOpen(true); }}>เพิ่มหมวด</PrimaryButton>}>
                        <MgmtTable
                            {...searchProps} rows={activityCategories} rowKey={c => c.CategoryCode} minWidth={520}
                            searchText={c => `${c.Label} ${c.CategoryCode}`} searchPlaceholder="ค้นหาหมวดกิจกรรม…" emptyText="ยังไม่มีหมวดกิจกรรม"
                            columns={[
                                { key: 'label', label: 'หมวด', primary: true, sortValue: c => c.Label, render: c => (
                                    <span className="font-bold text-slate-700 flex items-center gap-2">
                                        <span className="inline-block w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: c.ColorHex }} aria-hidden="true" />{c.Label}
                                    </span>
                                ) },
                                { key: 'code', label: 'รหัส', sortValue: c => c.CategoryCode, render: c => <span className="font-mono font-bold text-slate-500">{c.CategoryCode}</span> },
                                { key: 'order', label: 'ลำดับ', align: 'right', sortValue: c => Number(c.SortOrder) || 0, render: c => <span className="tabular-nums text-slate-500">{c.SortOrder}</span> },
                                { key: 'act', label: 'จัดการ', actions: true, render: c => <RowActions
                                    onEdit={pActivityCategories.edit ? () => { setEditingActivityCategory(c); setActivityCategoryForm({ CategoryCode: c.CategoryCode, Label: c.Label, ColorHex: c.ColorHex, SortOrder: c.SortOrder }); setIsAddActivityCategoryOpen(true); } : undefined}
                                    onDelete={pActivityCategories.del ? () => handleDeleteActivityCategory(c.CategoryCode) : undefined} /> },
                            ]}
                        />
                    </MgmtSection>
                )}
            </div>
            </div>


            {/* MODAL - Vendor */}
            <AnimatePresence>
                {isAddVendorOpen && (
                    <Portal>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-start">
                                    <h3 className="font-black text-xl">{editingVendor ? 'แก้ไขผู้จัดหา' : 'เพิ่มผู้จัดหาใหม่'}</h3>
                                    <button onClick={() => setIsAddVendorOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                                </div>
                                <form onSubmit={handleSaveVendor} className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Vendor Name</label>
                                        <input type="text" placeholder="Company Name" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={vendorForm.VendorName} onChange={(e) => setVendorForm({ ...vendorForm, VendorName: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Contact Info</label>
                                        <textarea rows={3} placeholder="Address, Phone, Email..." className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700 resize-none" value={vendorForm.ContactInfo} onChange={(e) => setVendorForm({ ...vendorForm, ContactInfo: e.target.value })} />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => setIsAddVendorOpen(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                                        <button type="submit" disabled={!vendorForm.VendorName} className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">บันทึก</button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* MODAL - Location */}
            <AnimatePresence>
                {isAddLocationOpen && (
                    <Portal>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-start">
                                    <h3 className="font-black text-xl">{editingLocation ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่ใหม่'}</h3>
                                    <button onClick={() => setIsAddLocationOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                                </div>
                                <form onSubmit={handleSaveLocation} className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Location Name</label>
                                        <input autoFocus type="text" placeholder="e.g. Server Room" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={locationForm.Name} onChange={(e) => setLocationForm({ ...locationForm, Name: e.target.value })} />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => setIsAddLocationOpen(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                                        <button type="submit" disabled={!locationForm.Name} className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">บันทึก</button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* MODAL - Reason */}
            <AnimatePresence>
                {isAddReasonOpen && (
                    <Portal>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-start">
                                    <h3 className="font-black text-xl">{editingReason ? 'แก้ไขเหตุผล' : 'เพิ่มเหตุผลใหม่'}</h3>
                                    <button onClick={() => setIsAddReasonOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                                </div>
                                <form onSubmit={handleSaveReason} className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Label</label>
                                        <input autoFocus type="text" placeholder="e.g. New Request" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={reasonForm.Label} onChange={(e) => setReasonForm({ ...reasonForm, Label: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Type (optional)</label>
                                        <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={reasonForm.TypeId} onChange={(e) => setReasonForm({ ...reasonForm, TypeId: e.target.value })}>
                                            <option value="">-- Select Type --</option>
                                            {deviceTypes.map(type => (<option key={type.TypeId} value={type.TypeId}>{type.Label}</option>))}
                                        </select>
                                    </div>
                                    {/* เหตุผลที่มีอยู่แล้วในประเภทนี้ (กันเพิ่มซ้ำ) */}
                                    {(() => {
                                        const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
                                        const sameType = reasons.filter(r => (r.TypeId || '') === (reasonForm.TypeId || '') && r.ReasonID !== editingReason?.ReasonID);
                                        const typed = norm(reasonForm.Label);
                                        const dup = typed && sameType.find(r => norm(r.Label) === typed);
                                        return (
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-sm font-bold text-slate-700">มีอยู่แล้วในประเภทนี้</label>
                                                    <span className="text-[11px] text-slate-400">{sameType.length} รายการ</span>
                                                </div>
                                                {dup && <p className="mb-2 text-[12px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">⚠ มี "{dup.Label}" อยู่แล้ว กรุณาเปลี่ยนชื่อ</p>}
                                                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-slate-50/60">
                                                    {sameType.length === 0 && <p className="px-3 py-3 text-[12px] text-slate-400">ยังไม่มีเหตุผลในประเภทนี้</p>}
                                                    {sameType.map(r => (
                                                        <div key={r.ReasonID} className="px-3 py-2 text-[13px] flex items-center justify-between gap-2">
                                                            <span className={`truncate ${isInactive(r) ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{r.Label}</span>
                                                            {isInactive(r) && <span className="text-[10px] font-bold text-slate-500 bg-slate-200 rounded px-1.5 py-0.5 shrink-0">ปิดใช้งาน</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => setIsAddReasonOpen(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                                        <button type="submit" disabled={!reasonForm.Label} className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">บันทึก</button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* MODAL - MA Type */}
            <AnimatePresence>
                {isAddMATypeOpen && (
                    <Portal>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-start">
                                    <h3 className="font-black text-xl">{editingMAType ? 'แก้ไขประเภท' : 'เพิ่มประเภทใหม่'}</h3>
                                    <button onClick={() => setIsAddMATypeOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                                </div>
                                <form onSubmit={handleSaveMAType} className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Category</label>
                                        <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={maTypeForm.Category} onChange={(e) => setMaTypeForm({ ...maTypeForm, Category: e.target.value })} disabled={!!editingMAType}>
                                            {MA_CATEGORIES.map(c => (<option key={c.key} value={c.key}>{c.label}</option>))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Type Name</label>
                                        <input autoFocus type="text" placeholder="e.g. Server" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={maTypeForm.TypeName} onChange={(e) => setMaTypeForm({ ...maTypeForm, TypeName: e.target.value })} />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => setIsAddMATypeOpen(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                                        <button type="submit" disabled={!maTypeForm.TypeName} className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">บันทึก</button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* MODAL - Budget */}
            <AnimatePresence>
                {isAddBudgetOpen && (
                    <Portal>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden my-8">
                                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-start">
                                    <h3 className="font-black text-xl">{editingBudget ? 'แก้ไขงบประมาณ' : 'เพิ่มงบประมาณใหม่'}</h3>
                                    <button onClick={() => setIsAddBudgetOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                                </div>
                                <form onSubmit={handleSaveBudget} className="p-5 space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Code</label>
                                            <input autoFocus type="text" placeholder="BDG2024" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={budgetForm.CategoryCode} onChange={(e) => setBudgetForm({ ...budgetForm, CategoryCode: e.target.value })} required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Status</label>
                                            <label className="flex items-center gap-2 cursor-pointer mt-3">
                                                <input type="checkbox" className="w-5 h-5 rounded text-indigo-600" checked={budgetForm.IsActive} onChange={(e) => setBudgetForm({ ...budgetForm, IsActive: e.target.checked })} />
                                                <span className="font-bold text-slate-700">{budgetForm.IsActive ? 'Active' : 'Inactive'}</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Label</label>
                                        <input type="text" placeholder="Central Budget" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={budgetForm.CategoryLabel} onChange={(e) => setBudgetForm({ ...budgetForm, CategoryLabel: e.target.value })} required />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Format</label>
                                        <input type="text" placeholder="BDG-{YYYY}-{0000}" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700 font-mono text-sm" value={budgetForm.BudgetFormat} onChange={(e) => setBudgetForm({ ...budgetForm, BudgetFormat: e.target.value })} />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => setIsAddBudgetOpen(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                                        <button type="submit" disabled={!budgetForm.CategoryCode || !budgetForm.CategoryLabel} className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">บันทึก</button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* MODAL - Factory Layout */}
           {/* MODAL - Factory Layout WITH FILE UPLOAD */}
<AnimatePresence>
    {isAddFactoryLayoutOpen && (
        <Portal>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-start">
                        <h3 className="font-black text-xl">{editingFactoryLayout ? 'แก้ไข Layout' : 'เพิ่ม Layout ใหม่'}</h3>
                        <button onClick={() => { setIsAddFactoryLayoutOpen(false); setFactoryLayoutForm({ name: '', image_url: '', width: 1920, height: 1080 }); setSelectedFile(null); }} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                    </div>
                    <form onSubmit={handleSaveFactoryLayout} className="p-5 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Name</label>
                            <input autoFocus type="text" placeholder="Floor Plan A" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={factoryLayoutForm.name} onChange={(e) => setFactoryLayoutForm({ ...factoryLayoutForm, name: e.target.value })} required />
                        </div>
                        
                        {/* FILE UPLOAD */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                {editingFactoryLayout ? 'เลือกรูปใหม่ (ถ้าต้องการเปลี่ยน)' : 'เลือกรูป (จำเป็น)'}
                            </label>
                            <div className="relative">
                                <input 
                                    ref={fileInputRef}
                                    type="file" 
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all text-slate-600 font-medium text-sm"
                                >
                                    📁 {selectedFile ? selectedFile.name : 'คลิกเพื่อเลือกรูป (JPG, PNG, GIF, WebP max 5MB)'}
                                </button>
                            </div>
                            {editingFactoryLayout && factoryLayoutForm.image_url && !selectedFile && (
                                <p className="text-xs text-slate-500 mt-2">✓ รูปปัจจุบัน: {factoryLayoutForm.image_url.split('/').pop()}</p>
                            )}
                        </div>
 
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Width (px)</label>
                                <input type="number" placeholder="1920" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={factoryLayoutForm.width} onChange={(e) => setFactoryLayoutForm({ ...factoryLayoutForm, width: parseInt(e.target.value) })} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Height (px)</label>
                                <input type="number" placeholder="1080" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={factoryLayoutForm.height} onChange={(e) => setFactoryLayoutForm({ ...factoryLayoutForm, height: parseInt(e.target.value) })} />
                            </div>
                        </div>
 
                        <div className="flex gap-3 pt-4">
                            <button 
                                type="button" 
                                onClick={() => { setIsAddFactoryLayoutOpen(false); setFactoryLayoutForm({ name: '', image_url: '', width: 1920, height: 1080 }); setSelectedFile(null); }} 
                                className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-50"
                            >
                                ยกเลิก
                            </button>
                            <button 
                                type="submit" 
                                disabled={!factoryLayoutForm.name || (!selectedFile && !editingFactoryLayout) || isUploadingLayout} 
                                className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isUploadingLayout ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        <span>กำลังบันทึก...</span>
                                    </>
                                ) : (
                                    'บันทึก'
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        </Portal>
    )}
</AnimatePresence>

            {/* MODAL - Activity Category */}
            <AnimatePresence>
                {isAddActivityCategoryOpen && (
                    <Portal>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-start">
                                    <h3 className="font-black text-xl">{editingActivityCategory ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}</h3>
                                    <button onClick={() => { setIsAddActivityCategoryOpen(false); setEditingActivityCategory(null); }} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                                </div>
                                <form onSubmit={handleSaveActivityCategory} className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Category Code</label>
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="เช่น Installation, Server"
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700 font-mono disabled:bg-slate-50 disabled:text-slate-400"
                                            value={activityCategoryForm.CategoryCode}
                                            onChange={(e) => setActivityCategoryForm({ ...activityCategoryForm, CategoryCode: e.target.value })}
                                            disabled={!!editingActivityCategory}
                                            required
                                        />
                                        {editingActivityCategory && (
                                            <p className="text-xs text-slate-400 mt-1">แก้ code ไม่ได้ เพราะผูกกับอัลบัมที่มีอยู่แล้ว ถ้าอยากเปลี่ยน code ให้สร้างหมวดใหม่แทน</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Label (ชื่อที่แสดงในหน้าเว็บ)</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น Installation"
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700"
                                            value={activityCategoryForm.Label}
                                            onChange={(e) => setActivityCategoryForm({ ...activityCategoryForm, Label: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">สี</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    className="w-11 h-11 rounded-lg border border-slate-200 cursor-pointer shrink-0"
                                                    value={activityCategoryForm.ColorHex}
                                                    onChange={(e) => setActivityCategoryForm({ ...activityCategoryForm, ColorHex: e.target.value })}
                                                />
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm text-slate-700"
                                                    value={activityCategoryForm.ColorHex}
                                                    onChange={(e) => setActivityCategoryForm({ ...activityCategoryForm, ColorHex: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">ลำดับ</label>
                                            <input
                                                type="number"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700"
                                                value={activityCategoryForm.SortOrder}
                                                onChange={(e) => setActivityCategoryForm({ ...activityCategoryForm, SortOrder: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => { setIsAddActivityCategoryOpen(false); setEditingActivityCategory(null); }} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                                        <button type="submit" disabled={!activityCategoryForm.CategoryCode || !activityCategoryForm.Label} className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">บันทึก</button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isRecordServerFormOpen && (
                    <Portal>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
                                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-start">
                                    <h3 className="font-black text-xl">{editingRecordServer ? 'แก้ไข Record Server' : 'เพิ่ม Record Server'}</h3>
                                    <button onClick={() => { setIsRecordServerFormOpen(false); setEditingRecordServer(null); setRecordServerForm({ name: '', ip_address: '' }); }} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">ชื่อ Server</label>
                                        <input
                                            type="text"
                                            autoFocus
                                            value={recordServerForm.name}
                                            onChange={(e) => setRecordServerForm(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="เช่น Server-Fac1, Server-Fac3"
                                            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none"
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRecordServer(); }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">IP Address</label>
                                        <input
                                            type="text"
                                            value={recordServerForm.ip_address}
                                            onChange={(e) => setRecordServerForm(prev => ({ ...prev, ip_address: e.target.value }))}
                                            placeholder="เช่น 192.168.1.10"
                                            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none"
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRecordServer(); }}
                                        />
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button onClick={() => { setIsRecordServerFormOpen(false); setEditingRecordServer(null); }} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                                        <button onClick={handleSaveRecordServer} disabled={!recordServerForm.name.trim()} className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">บันทึก</button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {permTarget !== undefined && isAdminUser && (
                <PermissionEditorModal
                    key={permTarget ? permTarget.EmpCode : 'defaults'}
                    target={permTarget}
                    users={stockUsers}
                    avatar={permTarget ? <UserAvatar pic={permTarget.EmpPic} empCode={permTarget.EmpCode} name={permTarget.Name || permTarget.Username} size={44} /> : null}
                    onClose={() => setPermTarget(undefined)}
                    onSaved={(message) => {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message });
                        fetchStockUsers();
                    }}
                />
            )}
            {showPermLog && isAdminUser && <PermissionLogModal onClose={() => setShowPermLog(false)} />}
            {showHolders && isAdminUser && <PermissionHoldersModal onClose={() => setShowHolders(false)} />}
            <AlertModal
                isOpen={alertModal.isOpen}
                type={alertModal.type}
                title={alertModal.title}
                message={alertModal.message}
                onConfirm={alertModal.onConfirm || (() => setAlertModal(prev => ({ ...prev, isOpen: false })))}
                onCancel={alertModal.onCancel}
                confirmText={alertModal.confirmText || "ปิด"}
                cancelText={alertModal.cancelText || "ยกเลิก"}
            />
        </div>
    );
};

export default ManagementPage;