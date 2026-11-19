import React, { useState, useEffect, useRef } from 'react';
import { Users, Settings, Truck, Plus, Trash2, Edit2, Search, Check, X, Shield, AlertTriangle, Archive, MessageSquare, FileKey, DollarSign, Map, Camera, Server, History, RefreshCw, KeyRound, ListChecks , ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';
import { useData } from '../context/DataContext';
import Portal from '../components/Portal';
import AlertModal from '../components/AlertModal';
import PermissionEditorModal, { PermissionLogModal, PermissionHoldersModal } from '../components/PermissionEditorModal';
import { API_BASE, API_URL } from '../config/api';
import { getBadgeStyle, getDeviceTypeColor, getChartColor } from '../utils/styleHelpers';

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

const ManagementPage = () => {
    const { user, token } = useAuth();
    const { deviceTypes, vendors, refreshData } = useData();
    const [activeTab, setActiveTab] = useState('admin');
    const [searchTerm, setSearchTerm] = useState('');

    // Users State (Stock_Users — recorded automatically on login)
    const [stockUsers, setStockUsers] = useState([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [savingRoleId, setSavingRoleId] = useState(null);
    // Permission editor: undefined = closed, null = default permissions for new users, object = that user
    const [permTarget, setPermTarget] = useState(undefined);
    const [showPermLog, setShowPermLog] = useState(false);
    const [showHolders, setShowHolders] = useState(false);
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
    // Users and Login Log can never be granted to anyone but Admin
    const visibleTabs = [
        isAdminUser && { id: 'admin', label: 'Users', icon: Users },
        pVendors.view && { id: 'vendors', label: 'Vendors', icon: Truck },
        pLocations.view && { id: 'locations', label: 'Locations', icon: Archive },
        pReasons.view && { id: 'reasons', label: 'Reasons', icon: MessageSquare },
        pMATypes.view && { id: 'ma-types', label: 'MA Types', icon: FileKey },
        pBudgets.view && { id: 'budgets', label: 'Budgets', icon: DollarSign },
        pFactoryLayouts.view && { id: 'factory-layouts', label: 'Maps', icon: Map },
        pRecordServers.view && { id: 'record-servers', label: 'Record Servers', icon: Server },
        pActivityCategories.view && { id: 'activity-categories', label: 'Activity Categories', icon: Camera },
        isAdminUser && { id: 'login-logs', label: 'Login Log', icon: History },
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

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 mb-2">MANAGEMENT</h2>
                    <p className="text-slate-500 font-medium">จัดการระบบ อุปกรณ์ และข้อมูลต่างๆ</p>
                </div>

                {/* Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto custom-scrollbar w-full md:w-auto">
                    {visibleTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder="ค้นหา..."
                    className="w-full bg-white border border-slate-200 pl-12 pr-4 py-3 rounded-xl shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-h-[400px]">
                {/* ADMIN TAB */}
                {activeTab === 'admin' && isAdminUser && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">USERS</h3>
                                <p className="text-slate-500 text-xs">
                                    ผู้ใช้ถูกบันทึกอัตโนมัติเมื่อ login ครั้งแรก (ได้สิทธิ์ Staff) · {isAdminUser ? 'คุณเปลี่ยนสิทธิ์ได้ในคอลัมน์ Role' : 'เฉพาะ Admin เท่านั้นที่เปลี่ยนสิทธิ์ได้'}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                {isAdminUser && (
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setPermTarget(null)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50" title="สิทธิ์ที่ผู้ใช้ใหม่จะได้ตอน login ครั้งแรก">
                                            <KeyRound size={14} /> สิทธิ์ตั้งต้นผู้ใช้ใหม่
                                        </button>
                                        <button onClick={() => setShowPermLog(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50" title="ดูว่าถ้าเปิดบังคับสิทธิ์จริง จะมีอะไรถูกบล็อก">
                                            <ListChecks size={14} /> รายงานตรวจสิทธิ์
                                        </button>
                                        <button onClick={() => setShowHolders(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50" title="เลือกหน้าและสิทธิ์ เพื่อดูว่าใครมีสิทธิ์นั้นบ้าง">
                                            <ShieldCheck size={14} /> ใครมีสิทธิ์นี้
                                        </button>
                                    </div>
                                )}
                                <div className="text-right text-xs text-slate-500">
                                    <div><span className="font-bold text-slate-700">{stockUsers.length}</span> users</div>
                                    <div><span className="font-bold text-violet-600">{stockUsers.filter(u => u.Role === 'Admin').length}</span> admins</div>
                                </div>
                            </div>
                        </div>

                        {isLoadingUsers ? (
                            <div className="text-center py-10 text-slate-400">Loading...</div>
                        ) : (() => {
                            const q = searchTerm.toLowerCase();
                            const rows = stockUsers.filter(u =>
                                [u.EmpCode, u.Username, u.Name, u.Sect, u.Role].some(v => String(v || '').toLowerCase().includes(q))
                            );
                            return (
                                <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[860px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                                <th className="p-4 font-bold">EmpCode</th>
                                                <th className="p-4 font-bold">Name</th>
                                                <th className="p-4 font-bold">Username</th>
                                                <th className="p-4 font-bold">Sect</th>
                                                <th className="p-4 font-bold">Role</th>
                                                <th className="p-4 font-bold">Permissions</th>
                                                <th className="p-4 font-bold">Last Login</th>
                                                <th className="p-4 font-bold">First Login</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {rows.length > 0 ? rows.map(u => {
                                                const isSelf = String(u.EmpCode) === String(user?.empcode);
                                                const canEdit = isAdminUser && !isSelf;
                                                return (
                                                    <tr key={u.ID} className="hover:bg-slate-50 transition-colors">
                                                        <td className="p-4 text-slate-600 font-mono text-sm">{u.EmpCode}</td>
                                                        <td className="p-4 font-bold text-slate-700">
                                                            <div className="flex items-center gap-3">
                                                                <UserAvatar pic={u.EmpPic} empCode={u.EmpCode} name={u.Name || u.Username} size={40} />
                                                                <span>{u.Name || '-'}</span>
                                                                {isSelf && <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">คุณ</span>}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-slate-600 text-sm">{u.Username || '-'}</td>
                                                        <td className="p-4 text-slate-600 text-sm">{u.Sect || '-'}</td>
                                                        <td className="p-4">
                                                            {canEdit ? (
                                                                <select
                                                                    value={u.Role}
                                                                    disabled={savingRoleId === u.ID}
                                                                    onChange={(e) => handleChangeRole(u, e.target.value)}
                                                                    className="px-2 py-1 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                                                                >
                                                                    <option value="Staff">Staff</option>
                                                                    <option value="Admin">Admin</option>
                                                                </select>
                                                            ) : (
                                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${u.Role === 'Admin' ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                                                                    {u.Role === 'Admin' && <Shield size={12} />}
                                                                    {u.Role}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-4">
                                                            {u.Role === 'Admin' ? (
                                                                <span className="text-xs font-bold text-violet-600">ทุกสิทธิ์</span>
                                                            ) : isAdminUser ? (
                                                                <button onClick={() => setPermTarget(u)} className="flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                                                    <KeyRound size={12} /> ตั้งสิทธิ์ <span className="text-slate-400 font-medium">({u.PermCount ?? 0})</span>
                                                                </button>
                                                            ) : (
                                                                <span className="text-xs text-slate-500">{u.PermCount ?? 0} สิทธิ์</span>
                                                            )}
                                                        </td>
                                                        <td className="p-4 text-slate-600 text-sm font-mono">{formatDbDate(u.LastLoginAt)}</td>
                                                        <td className="p-4 text-slate-400 text-sm font-mono">{formatDbDate(u.FirstLoginAt)}</td>
                                                    </tr>
                                                );
                                            }) : (
                                                <tr>
                                                    <td colSpan="8" className="p-12 text-center text-slate-400">ไม่พบผู้ใช้</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* LOGIN LOG TAB (Admin only) */}
                {activeTab === 'login-logs' && isAdminUser && (() => {
                    const q = searchTerm.toLowerCase();
                    const rows = loginLogs.filter(l =>
                        [l.Username, l.EmpCode, l.Name, l.IpAddress, l.Reason, l.Status].some(v => String(v || '').toLowerCase().includes(q))
                    );
                    const count = (s) => loginLogs.filter(l => l.Status === s).length;
                    const statusStyle = {
                        SUCCESS: 'bg-emerald-50 text-emerald-700',
                        FAILED: 'bg-amber-50 text-amber-700',
                        DENIED: 'bg-rose-50 text-rose-700',
                        ERROR: 'bg-slate-200 text-slate-700'
                    };
                    const browserOf = (ua = '') =>
                        /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : (ua ? 'Other' : '-');
                    return (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-2">LOGIN LOG</h3>
                                    <p className="text-slate-500 text-xs">
                                        ประวัติการ login ทุกครั้ง · สำเร็จ <b className="text-emerald-600">{count('SUCCESS')}</b> · ผิดรหัส <b className="text-amber-600">{count('FAILED')}</b> · ไม่มีสิทธิ์ <b className="text-rose-600">{count('DENIED')}</b> · ระบบขัดข้อง <b className="text-slate-700">{count('ERROR')}</b>
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select value={logStatus} onChange={(e) => setLogStatus(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white">
                                        <option value="">ทุกสถานะ</option>
                                        <option value="SUCCESS">SUCCESS</option>
                                        <option value="FAILED">FAILED</option>
                                        <option value="DENIED">DENIED</option>
                                        <option value="ERROR">ERROR</option>
                                    </select>
                                    <select value={logDays} onChange={(e) => setLogDays(Number(e.target.value))} className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white">
                                        <option value={1}>24 ชม.</option>
                                        <option value={7}>7 วัน</option>
                                        <option value={30}>30 วัน</option>
                                        <option value={90}>90 วัน</option>
                                        <option value={365}>1 ปี</option>
                                    </select>
                                    <button onClick={fetchLoginLogs} title="รีเฟรช" className="p-2 border border-slate-200 rounded-lg bg-white text-slate-500 hover:text-indigo-600">
                                        <RefreshCw size={16} className={isLoadingLogs ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            </div>

                            {isLoadingLogs && loginLogs.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">Loading...</div>
                            ) : (
                                <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[860px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                                <th className="p-4 font-bold">Time</th>
                                                <th className="p-4 font-bold">Status</th>
                                                <th className="p-4 font-bold">Username</th>
                                                <th className="p-4 font-bold">EmpCode</th>
                                                <th className="p-4 font-bold">Name</th>
                                                <th className="p-4 font-bold">Role</th>
                                                <th className="p-4 font-bold">Reason</th>
                                                <th className="p-4 font-bold">IP</th>
                                                <th className="p-4 font-bold">Browser</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {rows.length > 0 ? rows.map(l => (
                                                <tr key={l.ID} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 text-slate-600 text-sm font-mono">{formatDbDate(l.LoginAt)}</td>
                                                    <td className="p-4"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${statusStyle[l.Status] || 'bg-slate-100 text-slate-600'}`}>{l.Status}</span></td>
                                                    <td className="p-4 font-bold text-slate-700 text-sm">{l.Username || '-'}</td>
                                                    <td className="p-4 text-slate-600 text-sm font-mono">{l.EmpCode || '-'}</td>
                                                    <td className="p-4 text-slate-600 text-sm">
                                                        <div className="flex items-center gap-2">
                                                            {l.EmpCode ? <UserAvatar pic={l.EmpPic} empCode={l.EmpCode} name={l.Name || l.Username} size={28} /> : null}
                                                            <span>{l.Name || '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-slate-600 text-sm">{l.Role || '-'}</td>
                                                    <td className="p-4 text-slate-500 text-sm max-w-[240px] truncate" title={l.Reason || ''}>{l.Reason || '-'}</td>
                                                    <td className="p-4 text-slate-600 text-sm font-mono">{l.IpAddress || '-'}</td>
                                                    <td className="p-4 text-slate-500 text-sm" title={l.UserAgent || ''}>{browserOf(l.UserAgent || '')}</td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan="9" className="p-12 text-center text-slate-400">ไม่พบประวัติการ login</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* VENDORS TAB */}
                {activeTab === 'vendors' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">VENDORS</h3>
                                <p className="text-slate-500 text-xs">จัดการข้อมูลผู้จัดหา</p>
                            </div>
                            {pVendors.create && <button
                                onClick={() => { setEditingVendor(null); setVendorForm({ VendorName: '', ContactInfo: '' }); setIsAddVendorOpen(true); }}
                                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"
                            >
                                <Plus size={18} />
                                เพิ่ม Vendor
                            </button>}
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">ID</th>
                                        <th className="p-4 font-bold">Vendor Name</th>
                                        <th className="p-4 font-bold">Contact Info</th>
                                        <th className="p-4 font-bold text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {vendors.filter(v => v.VendorName.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                                        vendors.filter(v => v.VendorName.toLowerCase().includes(searchTerm.toLowerCase())).map(vendor => (
                                            <tr key={vendor.VendorID} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 text-slate-400 font-mono text-sm">#{vendor.VendorID}</td>
                                                <td className="p-4 font-bold text-slate-700 flex items-center gap-2"><Truck size={16} className="text-orange-500" />{vendor.VendorName}</td>
                                                <td className="p-4 text-slate-600 text-sm max-w-xs truncate">{vendor.ContactInfo || '-'}</td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {pVendors.edit && <button
                                                            onClick={() => { setEditingVendor(vendor); setVendorForm(vendor); setIsAddVendorOpen(true); }}
                                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>}
                                                        {pVendors.del && <button
                                                            onClick={() => handleDeleteVendor(vendor.VendorID)}
                                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="p-12 text-center text-slate-400">No vendors found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* LOCATIONS TAB */}
                {activeTab === 'locations' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">LOCATIONS</h3>
                                <p className="text-slate-500 text-xs">จัดการสถานที่เก็บอุปกรณ์</p>
                            </div>
                            {pLocations.create && <button
                                onClick={() => { setEditingLocation(null); setLocationForm({ Name: '' }); setIsAddLocationOpen(true); }}
                                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"
                            >
                                <Plus size={18} />
                                เพิ่มสถานที่
                            </button>}
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[500px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">ID</th>
                                        <th className="p-4 font-bold">Location Name</th>
                                        <th className="p-4 font-bold text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {locations.filter(l => l.Name.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                                        locations.filter(l => l.Name.toLowerCase().includes(searchTerm.toLowerCase())).map(loc => (
                                            <tr key={loc.LocationID} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 text-slate-400 font-mono text-sm">#{loc.LocationID}</td>
                                                <td className="p-4 font-bold text-slate-700 flex items-center gap-2"><Archive size={16} className="text-teal-600" />{loc.Name}</td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {pLocations.edit && <button onClick={() => { setEditingLocation(loc); setLocationForm({ Name: loc.Name }); setIsAddLocationOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>}
                                                        {pLocations.del && <button onClick={() => handleDeleteLocation(loc.LocationID)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="3" className="p-12 text-center text-slate-400">No locations found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* REASONS TAB */}
                {activeTab === 'reasons' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">WITHDRAWAL REASONS</h3>
                                <p className="text-slate-500 text-xs">จัดการเหตุผลการเบิก · ทั้งหมด {reasons.length} รายการ · จัดกลุ่มตามประเภท</p>
                            </div>
                            {pReasons.create && <button onClick={() => setIsAddReasonOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"><Plus size={18} />เพิ่มเหตุผล</button>}
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[500px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">ID</th>
                                        <th className="p-4 font-bold">Reason</th>
                                        <th className="p-4 font-bold">Type</th>
                                        <th className="p-4 font-bold text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {reasons.filter(r => r.Label.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                                        reasons.filter(r => r.Label.toLowerCase().includes(searchTerm.toLowerCase())).map((reason, i, arr) => (
                                          <React.Fragment key={reason.ReasonID}>
                                            {(i === 0 || arr[i - 1].TypeId !== reason.TypeId) && (
                                                <tr className="bg-indigo-50/60">
                                                    <td colSpan="4" className="px-4 py-2">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700">
                                                                {reason.TypeId || 'ไม่ระบุประเภท'} <span className="font-semibold text-indigo-400">· {arr.filter(x => x.TypeId === reason.TypeId).length} เหตุผล</span>
                                                            </span>
                                                            {pReasons.create && reason.TypeId && (
                                                                <button type="button" onClick={() => { setEditingReason(null); setReasonForm({ Label: '', TypeId: reason.TypeId }); setIsAddReasonOpen(true); }}
                                                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-100 transition-all">
                                                                    <Plus size={12} /> เพิ่มในประเภทนี้
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr className={`hover:bg-slate-50 transition-colors group ${isInactive(reason) ? 'opacity-50' : ''}`}>
                                                <td className="p-4 text-slate-400 font-mono text-sm">#{reason.ReasonID}</td>
                                                <td className="p-4 font-bold text-slate-700">{reason.Label} {isInactive(reason) && <span className="ml-2 px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-bold">ปิดใช้งาน</span>}</td>
                                                <td className="p-4"><span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600">{reason.TypeId || '-'}</span></td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {pReasons.edit &&<button onClick={() => { setEditingReason(reason); setReasonForm({ Label: reason.Label, TypeId: reason.TypeId || '' }); setIsAddReasonOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>}
                                                        {pReasons.edit && isInactive(reason) && <button onClick={() => handleRestoreReason(reason)} className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all">เปิดใช้งาน</button>}
                                                        {pReasons.del && !isInactive(reason) && <button onClick={() => handleDeleteReason(reason.ReasonID)} title="ปิดการใช้งาน" className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>}
                                                    </div>
                                                </td>
                                            </tr>
                                          </React.Fragment>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="p-12 text-center text-slate-400">No reasons found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* MA TYPES TAB */}
                {activeTab === 'ma-types' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">MA TYPES</h3>
                                <p className="text-slate-500 text-xs">จัดการประเภท MA</p>
                            </div>
                            {pMATypes.create && <button onClick={() => { setEditingMAType(null); setMaTypeForm({ Category: 'HARDWARE', TypeName: '' }); setIsAddMATypeOpen(true); }} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"><Plus size={18} />เพิ่มประเภท</button>}
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[500px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">ID</th>
                                        <th className="p-4 font-bold">Type Name</th>
                                        <th className="p-4 font-bold">Category</th>
                                        <th className="p-4 font-bold text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {maTypes.filter(t => t.TypeName.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                                        maTypes.filter(t => t.TypeName.toLowerCase().includes(searchTerm.toLowerCase())).map(t => (
                                            <tr key={t.TypeID} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 text-slate-400 font-mono text-sm">#{t.TypeID}</td>
                                                <td className="p-4 font-bold text-slate-700">{t.TypeName}</td>
                                                <td className="p-4"><span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{t.Category}</span></td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {pMATypes.edit && <button onClick={() => { setEditingMAType(t); setMaTypeForm({ Category: t.Category, TypeName: t.TypeName }); setIsAddMATypeOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>}
                                                        {pMATypes.del && <button onClick={() => handleDeleteMAType(t.TypeID)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="p-12 text-center text-slate-400">No MA types found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* BUDGETS TAB */}
                {activeTab === 'budgets' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">BUDGETS</h3>
                                <p className="text-slate-500 text-xs">จัดการหมวดหมู่งบประมาณ</p>
                            </div>
                            {pBudgets.create && <button onClick={() => { setEditingBudget(null); setBudgetForm({ CategoryCode: '', CategoryLabel: '', BudgetFormat: '', IsActive: true, AllowedDeviceTypes: [] }); setIsAddBudgetOpen(true); }} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"><Plus size={18} />เพิ่มหมวดหมู่</button>}
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">Code</th>
                                        <th className="p-4 font-bold">Name</th>
                                        <th className="p-4 font-bold">Format</th>
                                        <th className="p-4 font-bold">Status</th>
                                        <th className="p-4 font-bold text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {budgetCategories.filter(b => b.CategoryLabel.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                                        budgetCategories.filter(b => b.CategoryLabel.toLowerCase().includes(searchTerm.toLowerCase())).map(b => (
                                            <tr key={b.CategoryID} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 text-slate-400 font-mono text-sm font-bold">{b.CategoryCode}</td>
                                                <td className="p-4 font-bold text-slate-700">{b.CategoryLabel}</td>
                                                <td className="p-4 text-slate-600 text-sm font-mono">{b.BudgetFormat || '-'}</td>
                                                <td className="p-4"><span className={`px-2 py-1 rounded-full text-xs font-bold ${b.IsActive === false ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>{b.IsActive === false ? 'Inactive' : 'Active'}</span></td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {pBudgets.edit && <button onClick={() => { setEditingBudget(b); setBudgetForm({ CategoryCode: b.CategoryCode, CategoryLabel: b.CategoryLabel, BudgetFormat: b.BudgetFormat || '', IsActive: b.IsActive !== false, AllowedDeviceTypes: (b.AllowedDeviceTypes || []).map(t => t.TypeId) }); setIsAddBudgetOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>}
                                                        {pBudgets.del && <button onClick={() => handleDeleteBudget(b.CategoryID)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="5" className="p-12 text-center text-slate-400">No budgets found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

{/* FACTORY LAYOUTS TAB */}
{activeTab === 'factory-layouts' && (
    <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">FACTORY LAYOUTS</h3>
                <p className="text-slate-500 text-xs">จัดการแผนที่โรงงาน</p>
            </div>
            {pFactoryLayouts.create && <button onClick={() => { setEditingFactoryLayout(null); setFactoryLayoutForm({ name: '', image_url: '', width: 1920, height: 1080 }); setSelectedFile(null); setIsAddFactoryLayoutOpen(true); }} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"><Plus size={18} />เพิ่ม Layout</button>}
        </div>
 
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="p-4 font-bold w-16">ลำดับ</th>
                        <th className="p-4 font-bold">ID</th>
                        <th className="p-4 font-bold">Name</th>
                        <th className="p-4 font-bold">Image</th>
                        <th className="p-4 font-bold">Size</th>
                        <th className="p-4 font-bold text-right">จัดการ</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {factoryLayouts.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                        factoryLayouts.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase())).map((layout, index, arr) => (
                            <tr key={layout.id}
                                draggable={pFactoryLayouts.edit}
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragLeave={handleDragLeave}
                                onDrop={() => handleDrop(index)}
                                className={`transition-colors group cursor-grab active:cursor-grabbing
                                    ${dragOverIndex === index ? 'bg-indigo-50 border-t-2 border-indigo-400' : 'hover:bg-slate-50'}`}>
                                <td className="p-4">
                                    <div className="flex items-center justify-center text-slate-300 hover:text-slate-500">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                            <circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/>
                                            <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
                                            <circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/>
                                        </svg>
                                    </div>
                                </td>
                                <td className="p-4 text-slate-400 font-mono text-sm">#{layout.id}</td>
                                <td className="p-4 font-bold text-slate-700 flex items-center gap-2"><Map size={16} className="text-teal-600" />{layout.name}</td>
                                <td className="p-4 text-slate-600 text-sm max-w-xs truncate font-mono text-[11px]">{layout.image_url}</td>
                                <td className="p-4 text-slate-600 text-sm font-mono">{layout.width}x{layout.height}</td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {pFactoryLayouts.edit && <button onClick={() => { setEditingFactoryLayout(layout); setFactoryLayoutForm({ name: layout.name, image_url: layout.image_url, width: layout.width || 1920, height: layout.height || 1080 }); setSelectedFile(null); setIsAddFactoryLayoutOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>}
                                        {pFactoryLayouts.del && <button onClick={() => handleDeleteFactoryLayout(layout.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>}
                                    </div>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="6" className="p-12 text-center text-slate-400">No layouts found</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
)}

{/* CCTV RECORD SERVERS TAB */}
{activeTab === 'record-servers' && (
    <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
                <h3 className="font-black text-lg text-slate-800">CCTV Record Servers</h3>
                <p className="text-sm text-slate-500">รายชื่อ Server ที่ใช้บันทึกภาพกล้อง (สำหรับผูกกับกล้องแต่ละตัว)</p>
            </div>
            {pRecordServers.create && <button
                onClick={() => { setEditingRecordServer(null); setRecordServerForm({ name: '', ip_address: '' }); setIsRecordServerFormOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all"
            >
                <Plus size={16} /> เพิ่ม Record Server
            </button>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="p-4 font-bold">ID</th>
                        <th className="p-4 font-bold">ชื่อ Server</th>
                        <th className="p-4 font-bold">IP Address</th>
                        <th className="p-4 font-bold text-center">จำนวนกล้อง</th>
                        <th className="p-4 font-bold">สร้างโดย</th>
                        <th className="p-4 font-bold">วันที่สร้าง</th>
                        <th className="p-4 font-bold text-right">จัดการ</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {recordServers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                        recordServers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(server => (
                            <tr key={server.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="p-4 text-slate-400 font-mono text-sm">#{server.id}</td>
                                <td className="p-4 font-bold text-slate-700 flex items-center gap-2"><Server size={16} className="text-indigo-600" />{server.name}</td>
                                <td className="p-4 text-slate-600 text-sm font-mono">{server.ip_address || '—'}</td>
                                <td className="p-4 text-center">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${server.camera_count > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                        {server.camera_count || 0} ตัว
                                    </span>
                                </td>
                                <td className="p-4 text-slate-600 text-sm">{server.created_by || '—'}</td>
                                <td className="p-4 text-slate-500 text-sm">{server.created_at ? new Date(server.created_at).toLocaleDateString('th-TH') : '—'}</td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {pRecordServers.edit && <button onClick={() => { setEditingRecordServer(server); setRecordServerForm({ name: server.name, ip_address: server.ip_address || '' }); setIsRecordServerFormOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>}
                                        {pRecordServers.del && <button onClick={() => handleDeleteRecordServer(server.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>}
                                    </div>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="7" className="p-12 text-center text-slate-400">ยังไม่มี Record Server</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
)}

{/* ACTIVITY CATEGORIES TAB */}
{activeTab === 'activity-categories' && (
    <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">ACTIVITY CATEGORIES</h3>
                <p className="text-slate-500 text-xs">จัดการหมวดหมู่สำหรับ Activity Gallery (ใช้ในฟอร์มอัปโหลดรูปกิจกรรม)</p>
            </div>
            {pActivityCategories.create && <button
                onClick={() => { setEditingActivityCategory(null); setActivityCategoryForm({ CategoryCode: '', Label: '', ColorHex: '#64748B', SortOrder: activityCategories.length + 1 }); setIsAddActivityCategoryOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"
            >
                <Plus size={18} />
                เพิ่มหมวดหมู่
            </button>}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="p-4 font-bold">สี</th>
                        <th className="p-4 font-bold">Code</th>
                        <th className="p-4 font-bold">Label</th>
                        <th className="p-4 font-bold">ลำดับ</th>
                        <th className="p-4 font-bold text-right">จัดการ</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {activityCategories.filter(c => c.Label.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                        activityCategories.filter(c => c.Label.toLowerCase().includes(searchTerm.toLowerCase())).map(cat => (
                            <tr key={cat.CategoryCode} className="hover:bg-slate-50 transition-colors group">
                                <td className="p-4">
                                    <span className="inline-block w-6 h-6 rounded-full border border-slate-200" style={{ backgroundColor: cat.ColorHex }}></span>
                                </td>
                                <td className="p-4 text-slate-400 font-mono text-sm font-bold">{cat.CategoryCode}</td>
                                <td className="p-4 font-bold text-slate-700">{cat.Label}</td>
                                <td className="p-4 text-slate-500 text-sm">{cat.SortOrder}</td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {pActivityCategories.edit && <button
                                            onClick={() => { setEditingActivityCategory(cat); setActivityCategoryForm({ CategoryCode: cat.CategoryCode, Label: cat.Label, ColorHex: cat.ColorHex, SortOrder: cat.SortOrder }); setIsAddActivityCategoryOpen(true); }}
                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                        >
                                            <Edit2 size={16} />
                                        </button>}
                                        {pActivityCategories.del && <button
                                            onClick={() => handleDeleteActivityCategory(cat.CategoryCode)}
                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>}
                                    </div>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="5" className="p-12 text-center text-slate-400">No categories found</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
)}
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