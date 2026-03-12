import React, { useState, useEffect } from 'react';
import { Users, Settings, Truck, Plus, Trash2, Edit2, Search, Check, X, Shield, AlertTriangle, Archive, MessageSquare, FileKey, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import Portal from '../components/Portal';
import AlertModal from '../components/AlertModal';
import { API_BASE } from '../config/api';
import { getBadgeStyle, getDeviceTypeColor, getChartColor } from '../utils/styleHelpers';

const ManagementPage = () => {
    const { user } = useAuth();
    const { deviceTypes, vendors, refreshData } = useData();
    const [activeTab, setActiveTab] = useState('admin'); // admin, types, vendors
    const [searchTerm, setSearchTerm] = useState('');

    // Admin Users State
    const [adminUsers, setAdminUsers] = useState([]);
    const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);
    const [newAdmin, setNewAdmin] = useState('');
    const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);

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
    // For handling multiple device types selection in budget form
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

    // Use AlertModal state instead of local alert
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

    // --- Admin Users Logic ---
    const fetchAdminUsers = async () => {
        setIsLoadingAdmins(true);
        try {
            const res = await fetch(`${API_BASE}/admin-users`);
            if (res.ok) {
                setAdminUsers(await res.json());
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingAdmins(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'admin') fetchAdminUsers();
        if (activeTab === 'locations') fetchLocations();
        if (activeTab === 'reasons') fetchReasons();
        if (activeTab === 'ma-types') fetchMATypes();
        if (activeTab === 'budgets') fetchBudgetCategories();
        setSearchTerm(''); // Clear search when tab changes
    }, [activeTab]);

    const handleAddAdmin = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE}/admin-users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newAdmin, createdBy: user?.username })
            });
            const data = await res.json();
            if (data.success) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ (Success)', message: 'เพิ่มผู้ดูแลระบบสำเร็จ (Admin added successfully)' });
                setNewAdmin('');
                setIsAddAdminOpen(false);
                fetchAdminUsers();
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: data.error || 'ไม่สามารถเพิ่มผู้ดูแลได้ (Failed to add admin)' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: err.message });
        }
    };

    const handleDeleteAdmin = (username) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ยืนยันการลบ ',
            message: `คุณแน่ใจหรือไม่ที่จะลบสิทธิ์ผู้ดูแลระบบของ ${username}? (Are you sure you want to remove admin access for ${username}?)`,
            confirmText: 'ลบผู้ดูแล ',
            cancelText: 'ยกเลิก ',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/admin-users/${username}`, { method: 'DELETE' });
                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ (Success)', message: 'ลบผู้ดูแลระบบสำเร็จ (Admin removed successfully)' });
                        fetchAdminUsers();
                    } else {
                        const data = await res.json();
                        setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: data.error || 'ไม่สามารถลบผู้ดูแลได้ (Failed to remove admin)' });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- Vendors Logic ---
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
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ (Success)', message: `บันทึกข้อมูลผู้จัดหาสำเร็จ (Vendor ${isEdit ? 'Updated' : 'Added'})` });
                setIsAddVendorOpen(false);
                setEditingVendor(null);
                setVendorForm({ VendorName: '', ContactInfo: '' });
                refreshData();
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: data.error });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: err.message });
        }
    };

    const handleDeleteVendor = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบผู้จัดหา ',
            message: 'คุณแน่ใจหรือไม่ที่จะลบผู้จัดหานี้? (Are you sure you want to delete this vendor?)',
            confirmText: 'ลบผู้จัดหา ',
            cancelText: 'ยกเลิก ',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/vendors/${id}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (data.success) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ (Success)', message: 'ลบผู้จัดหาสำเร็จ (Vendor deleted successfully)' });
                        refreshData();
                    } else {
                        setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: data.error });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- Locations Logic ---
    const fetchLocations = async () => {
        try {
            const res = await fetch(`${API_BASE}/locations`);
            if (res.ok) setLocations(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

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
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ (Success)', message: `บันทึกข้อมูลสถานที่สำเร็จ (Location ${isEdit ? 'Updated' : 'Added'})` });
                setIsAddLocationOpen(false);
                setEditingLocation(null);
                setLocationForm({ Name: '' });
                fetchLocations();
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: data.error });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: err.message });
        }
    };

    const handleDeleteLocation = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบสถานที่ ',
            message: 'คุณแน่ใจหรือไม่ที่จะลบสถานที่นี้? (Are you sure you want to delete this location?)',
            confirmText: 'ลบสถานที่ ',
            cancelText: 'ยกเลิก ',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/locations/${id}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (data.success) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ (Success)', message: 'ลบสถานที่สำเร็จ (Location deleted successfully)' });
                        fetchLocations();
                    } else {
                        setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: data.error });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- Reasons Logic ---
    const fetchReasons = async () => {
        try {
            const res = await fetch(`${API_BASE}/reasons`);
            if (res.ok) setReasons(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveReason = async (e) => {
        e.preventDefault();
        try {
            const isEdit = !!editingReason;
            const url = isEdit ? `${API_BASE}/reasons/${editingReason.ReasonID}` : `${API_BASE}/reasons`;
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label: reasonForm.Label,
                    typeId: reasonForm.TypeId || null
                })
            });

            const data = await res.json();
            if (res.ok) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ (Success)', message: `บันทึกข้อมูลเหตุผลสำเร็จ (Reason ${isEdit ? 'Updated' : 'Added'})` });
                setIsAddReasonOpen(false);
                setEditingReason(null);
                setReasonForm({ Label: '', TypeId: '' });
                fetchReasons();
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: data.error || 'Failed' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: err.message });
        }
    };

    const handleDeleteReason = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบเหตุผล ',
            message: 'คุณแน่ใจหรือไม่ที่จะลบเหตุผลนี้? (Are you sure you want to delete this reason?)',
            confirmText: 'ลบเหตุผล ',
            cancelText: 'ยกเลิก ',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/reasons/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ (Success)', message: 'ลบเหตุผลสำเร็จ (Reason deleted successfully)' });
                        fetchReasons();
                    } else {
                        const data = await res.json();
                        setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: data.error });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- MA Types Logic ---
    const MA_CATEGORIES = [
        { key: 'HARDWARE', label: 'Hardware MA' },
        { key: 'SOFTWARE', label: 'Software License' },
        { key: 'SERVICE', label: 'Services' },
        { key: 'RENTAL', label: 'Rental' },
    ];

    const fetchMATypes = async () => {
        try {
            const res = await fetch(`${API_BASE}/ma-types`);
            if (res.ok) setMaTypes(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

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
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: `บันทึกข้อมูลประเภท MA สำเร็จ` });
                setIsAddMATypeOpen(false);
                setEditingMAType(null);
                setMaTypeForm({ Category: 'HARDWARE', TypeName: '' });
                fetchMATypes();
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error || 'Failed' });
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
            message: 'คุณแน่ใจหรือไม่ที่จะลบประเภทนี้?',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/ma-types/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบประเภท MA สำเร็จ' });
                        fetchMATypes();
                    } else {
                        const data = await res.json();
                        setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // --- Budget Logic ---
    const fetchBudgetCategories = async () => {
        try {
            const res = await fetch(`${API_BASE}/budgets`);
            if (res.ok) {
                const data = await res.json();
                setBudgetCategories(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveBudget = async (e) => {
        e.preventDefault();
        try {
            const isEdit = !!editingBudget;
            const url = isEdit ? `${API_BASE}/budgets/${editingBudget.CategoryID}` : `${API_BASE}/budgets`;
            const method = isEdit ? 'PUT' : 'POST';

            const payload = {
                ...budgetForm,
                AllowedDeviceTypes: budgetForm.AllowedDeviceTypes || [] // Ensure array
            };

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success || res.ok) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: `บันทึกข้อมูลประเภทงบประมาณสำเร็จ` });
                setIsAddBudgetOpen(false);
                setEditingBudget(null);
                setBudgetForm({ CategoryCode: '', CategoryLabel: '', BudgetFormat: '', IsActive: true, AllowedDeviceTypes: [] });
                fetchBudgetCategories();
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error || 'Failed' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    const handleDeleteBudget = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบประเภทงบประมาณ',
            message: 'คุณแน่ใจหรือไม่ที่จะลบหมวดหมู่นี้?',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/budgets/${id}`, { method: 'DELETE' });
                    if (res.ok || (await res.json()).success) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบประเภทงบประมาณสำเร็จ' });
                        fetchBudgetCategories();
                    } else {
                        const data = await res.json();
                        setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error || 'เกิดข้อผิดพลาดในการลบ' });
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
                    <p className="text-slate-500 font-medium">จัดการผู้ใช้งาน หมวดหมู่อุปกรณ์ และผู้จัดหา </p>
                </div>

                {/* Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto custom-scrollbar w-full md:w-auto">
                    {[
                        { id: 'admin', label: 'Admin', icon: Users },
                        { id: 'vendors', label: 'Vendors', icon: Truck },
                        { id: 'locations', label: 'Locations', icon: Archive },
                        { id: 'reasons', label: 'Reasons', icon: MessageSquare },
                        { id: 'ma-types', label: 'MA Types', icon: FileKey },
                        { id: 'budgets', label: 'Budgets', icon: DollarSign }
                    ].map(tab => (
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

            {/* Global Search Bar for Active Tab */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder={`ค้นหาใน ${activeTab === 'admin' ? 'ผู้ดูแลระบบ (Admins)' : activeTab === 'vendors' ? 'ผู้จัดหา (Vendors)' : activeTab === 'locations' ? 'สถานที่ (Locations)' : activeTab === 'ma-types' ? 'ประเภท MA (MA Types)' : activeTab === 'budgets' ? 'งบประมาณ (Budgets)' : 'เหตุผล (Reasons)'}...`}
                    className="w-full bg-white border border-slate-200 pl-12 pr-4 py-3 rounded-xl shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-h-[400px]">
                {/* ADMIN TAB */}
                {activeTab === 'admin' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">SYSTEM ADMINISTRATORS</h3>
                                <p className="text-slate-500 text-xs">จัดการผู้ใช้งานที่มีสิทธิ์เข้าถึงเต็มรูปแบบ (Manage full access users)</p>
                            </div>
                            <button
                                onClick={() => setIsAddAdminOpen(true)}
                                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"
                            >
                                <Plus size={18} />
                                เพิ่ม Admin
                            </button>
                        </div>

                        {isLoadingAdmins ? (
                            <div className="text-center py-10 text-slate-400">Loading...</div>
                        ) : (
                            <>
                                <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[500px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                                <th className="p-4 font-bold">ID</th>
                                                <th className="p-4 font-bold">Username</th>
                                                <th className="p-4 font-bold">เพิ่มโดย (Created By)</th>
                                                <th className="p-4 font-bold text-right">จัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {adminUsers.filter(u => u.Username.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                                                adminUsers.filter(u => u.Username.toLowerCase().includes(searchTerm.toLowerCase())).map(admin => (
                                                    <tr key={admin.ID} className="hover:bg-slate-50 transition-colors group">
                                                        <td className="p-4 text-slate-400 font-mono text-sm">#{admin.ID}</td>
                                                        <td className="p-4 font-bold text-slate-700">
                                                            <div className="flex items-center gap-2">
                                                                <Shield size={16} className="text-indigo-600" />
                                                                {admin.Username}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-slate-600 text-sm">{admin.CreatedBy || 'System'}</td>
                                                        <td className="p-4 text-right">
                                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {admin.Username.toLowerCase() !== 'admin' && (
                                                                    <button
                                                                        onClick={() => handleDeleteAdmin(admin.Username)}
                                                                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="4" className="p-12 text-center">
                                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                                            <Shield className="w-12 h-12 mb-4 text-slate-200" />
                                                            <p className="font-medium text-lg text-slate-500">ไม่พบผู้ดูแลระบบ (No admins found)</p>
                                                            <p className="text-sm">ลองปรับคำค้นหาใหม่</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                )
                }

                {/* VENDORS TAB */}
                {
                    activeTab === 'vendors' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-2">VENDORS</h3>
                                    <p className="text-slate-500 text-xs">จัดการข้อมูลผู้จัดหาและข้อมูลติดต่อ (Manage Suppliers & Contact Info)</p>
                                </div>
                                <button
                                    onClick={() => { setEditingVendor(null); setVendorForm({ VendorName: '', ContactInfo: '' }); setIsAddVendorOpen(true); }}
                                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"
                                >
                                    <Plus size={18} />
                                    เพิ่ม Vendor
                                </button>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                                <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                            <th className="p-4 font-bold">ID</th>
                                            <th className="p-4 font-bold">ชื่อผู้จัดหา (Vendor Name)</th>
                                            <th className="p-4 font-bold">ข้อมูลติดต่อ (Contact Info)</th>
                                            <th className="p-4 font-bold text-right">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {vendors.filter(v => v.VendorName.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                                            vendors.filter(v => v.VendorName.toLowerCase().includes(searchTerm.toLowerCase())).map(vendor => (
                                                <tr key={vendor.VendorID} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="p-4 text-slate-400 font-mono text-sm">#{vendor.VendorID}</td>
                                                    <td className="p-4 font-bold text-slate-700">
                                                        <div className="flex items-center gap-2">
                                                            <Truck size={16} className="text-orange-500" />
                                                            {vendor.VendorName}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-slate-600 text-sm whitespace-pre-wrap max-w-xs">{vendor.ContactInfo || '-'}</td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => { setEditingVendor(vendor); setVendorForm(vendor); setIsAddVendorOpen(true); }}
                                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteVendor(vendor.VendorID)}
                                                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4" className="p-12 text-center">
                                                    <div className="flex flex-col items-center justify-center text-slate-400">
                                                        <Truck className="w-12 h-12 mb-4 text-slate-200" />
                                                        <p className="font-medium text-lg text-slate-500">ไม่พบผู้จัดหา (No vendors found)</p>
                                                        <p className="text-sm">ลองปรับคำค้นหาใหม่</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div >
                    )
                }
                {/* LOCATIONS TAB */}
                {activeTab === 'locations' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">MANAGE LOCATIONS</h3>
                                <p className="text-slate-500 text-xs">จัดการข้อมูลสถานที่เก็บอุปกรณ์ (Manage storage locations)</p>
                            </div>
                            <button
                                onClick={() => {
                                    setEditingLocation(null);
                                    setLocationForm({ Name: '' });
                                    setIsAddLocationOpen(true);
                                }}
                                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"
                            >
                                <Plus size={18} />
                                เพิ่มสถานที่
                            </button>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[500px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">ID</th>
                                        <th className="p-4 font-bold">ชื่อสถานที่ (Location Name)</th>
                                        <th className="p-4 font-bold text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {locations.filter(l => l.Name.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                                        locations.filter(l => l.Name.toLowerCase().includes(searchTerm.toLowerCase())).map(loc => (
                                            <tr key={loc.LocationID} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 text-slate-400 font-mono text-sm">#{loc.LocationID}</td>
                                                <td className="p-4 font-bold text-slate-700">
                                                    <div className="flex items-center gap-2">
                                                        <Archive size={16} className="text-teal-600" />
                                                        {loc.Name}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => {
                                                                setEditingLocation(loc);
                                                                setLocationForm({ Name: loc.Name });
                                                                setIsAddLocationOpen(true);
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteLocation(loc.LocationID)}
                                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="3" className="p-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-slate-400">
                                                    <Archive className="w-12 h-12 mb-4 text-slate-200" />
                                                    <p className="font-medium text-lg text-slate-500">ไม่พบสถานที่ (No locations found)</p>
                                                    <p className="text-sm">ลองปรับคำค้นหาใหม่</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                {/* REASONS TAB */}
                {activeTab === 'reasons' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">WITHDRAWAL REASONS</h3>
                                <p className="text-slate-500 text-xs">จัดการเหตุผลการเบิก (Manage Withdrawal Reasons)</p>
                            </div>
                            <div className="flex gap-2">
                                <select
                                    value={selectedReasonType}
                                    onChange={(e) => setSelectedReasonType(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 focus:outline-none focus:border-indigo-500 hover:border-indigo-300 transition-colors cursor-pointer"
                                >
                                    <option value="all">ทั้งหมด (All Types)</option>

                                    {deviceTypes.map(t => (
                                        <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => setIsAddReasonOpen(true)}
                                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"
                                >
                                    <Plus size={18} />
                                    เพิ่มเหตุผล
                                </button>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[500px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">ID</th>
                                        <th className="p-4 font-bold">เหตุผล (Reason)</th>
                                        <th className="p-4 font-bold">ใช้กับ (Type)</th>
                                        <th className="p-4 font-bold text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {reasons.filter(r =>
                                        r.Label.toLowerCase().includes(searchTerm.toLowerCase()) &&
                                        (selectedReasonType === 'all' || r.TypeId === selectedReasonType)
                                    ).length > 0 ? (
                                        reasons.filter(r =>
                                            r.Label.toLowerCase().includes(searchTerm.toLowerCase()) &&
                                            (selectedReasonType === 'all' || r.TypeId === selectedReasonType)
                                        ).map(reason => (
                                            <tr key={reason.ReasonID} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 text-slate-400 font-mono text-sm">#{reason.ReasonID}</td>
                                                <td className="p-4 font-bold text-slate-700">{reason.Label}</td>
                                                <td className="p-4">
                                                    {reason.TypeId && (
                                                        <span className="px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 text-white shadow-sm" style={{ backgroundColor: getChartColor(reason.TypeId) }}>
                                                            <Settings size={12} />
                                                            {reason.TypeId}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => {
                                                                setEditingReason(reason);
                                                                setReasonForm({ Label: reason.Label, TypeId: reason.TypeId || '' });
                                                                setIsAddReasonOpen(true);
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteReason(reason.ReasonID)}
                                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="p-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-slate-400">
                                                    <MessageSquare className="w-12 h-12 mb-4 text-slate-200" />
                                                    <p className="font-medium text-lg text-slate-500">ไม่พบข้อมูลเหตุผล</p>
                                                    <p className="text-sm">No reasons found</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* MA TYPES TAB */}
                {activeTab === 'ma-types' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">MA / LICENSE TYPES</h3>
                                <p className="text-slate-500 text-xs">จัดการประเภทย่อยของ MA, License, Services, Rental</p>
                            </div>
                            <div className="flex gap-2">
                                <select
                                    value={selectedMACategory}
                                    onChange={(e) => setSelectedMACategory(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 focus:outline-none focus:border-indigo-500 hover:border-indigo-300 transition-colors cursor-pointer"
                                >
                                    <option value="all">ทั้งหมด (All)</option>
                                    {MA_CATEGORIES.map(c => (
                                        <option key={c.key} value={c.key}>{c.label}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => { setEditingMAType(null); setMaTypeForm({ Category: 'HARDWARE', TypeName: '' }); setIsAddMATypeOpen(true); }}
                                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"
                                >
                                    <Plus size={18} />
                                    เพิ่มประเภท
                                </button>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[500px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">ID</th>
                                        <th className="p-4 font-bold">ชื่อประเภท (Type Name)</th>
                                        <th className="p-4 font-bold">หมวดหมู่ (Category)</th>
                                        <th className="p-4 font-bold text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {maTypes.filter(t =>
                                        t.TypeName.toLowerCase().includes(searchTerm.toLowerCase()) &&
                                        (selectedMACategory === 'all' || t.Category === selectedMACategory)
                                    ).length > 0 ? (
                                        maTypes.filter(t =>
                                            t.TypeName.toLowerCase().includes(searchTerm.toLowerCase()) &&
                                            (selectedMACategory === 'all' || t.Category === selectedMACategory)
                                        ).map(t => (
                                            <tr key={t.TypeID} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 text-slate-400 font-mono text-sm">#{t.TypeID}</td>
                                                <td className="p-4 font-bold text-slate-700">{t.TypeName}</td>
                                                <td className="p-4">
                                                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${t.Category === 'HARDWARE' ? 'bg-blue-100 text-blue-700' :
                                                        t.Category === 'SOFTWARE' ? 'bg-violet-100 text-violet-700' :
                                                            t.Category === 'SERVICE' ? 'bg-emerald-100 text-emerald-700' :
                                                                'bg-amber-100 text-amber-700'
                                                        }`}>
                                                        {MA_CATEGORIES.find(c => c.key === t.Category)?.label || t.Category}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => {
                                                                setEditingMAType(t);
                                                                setMaTypeForm({ Category: t.Category, TypeName: t.TypeName });
                                                                setIsAddMATypeOpen(true);
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteMAType(t.TypeID)}
                                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="p-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-slate-400">
                                                    <FileKey className="w-12 h-12 mb-4 text-slate-200" />
                                                    <p className="font-medium text-lg text-slate-500">ไม่พบข้อมูลประเภท</p>
                                                    <p className="text-sm">No MA types found</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* BUDGETS TAB */}
                {activeTab === 'budgets' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">BUDGET CATEGORIES</h3>
                                <p className="text-slate-500 text-xs">จัดการหมวดหมู่งบประมาณ (Manage Budget Categories)</p>
                            </div>
                            <button
                                onClick={() => { setEditingBudget(null); setBudgetForm({ CategoryCode: '', CategoryLabel: '', BudgetFormat: '', IsActive: true, AllowedDeviceTypes: [] }); setIsAddBudgetOpen(true); }}
                                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"
                            >
                                <Plus size={18} />
                                เพิ่มหมวดหมู่
                            </button>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">รหัส (Code)</th>
                                        <th className="p-4 font-bold">ชื่อหมวดหมู่ (Name)</th>
                                        <th className="p-4 font-bold">รูปแบบเลข (Format)</th>
                                        <th className="p-4 font-bold">ประเภทที่รองรับ (Allowed Types)</th>
                                        <th className="p-4 font-bold">สถานะ (Status)</th>
                                        <th className="p-4 font-bold text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {budgetCategories.filter(b =>
                                        b.CategoryLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        b.CategoryCode.toLowerCase().includes(searchTerm.toLowerCase())
                                    ).length > 0 ? (
                                        budgetCategories.filter(b =>
                                            b.CategoryLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            b.CategoryCode.toLowerCase().includes(searchTerm.toLowerCase())
                                        ).map(b => (
                                            <tr key={b.CategoryID} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 text-slate-400 font-mono font-bold text-sm">{b.CategoryCode}</td>
                                                <td className="p-4 font-bold text-slate-700">{b.CategoryLabel}</td>
                                                <td className="p-4 text-slate-600 text-sm font-mono">{b.BudgetFormat || '-'}</td>
                                                <td className="p-4">
                                                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                        {b.AllowedDeviceTypes && b.AllowedDeviceTypes.length > 0 ? (
                                                            b.AllowedDeviceTypes.map(type => (
                                                                <span key={type.ID || type.TypeId} className="px-2 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-600 truncate max-w-full">
                                                                    {type.Label || type.TypeId}
                                                                </span>
                                                            ))
                                                        ) : (
                                                            <span className="text-xs text-slate-400">-</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${b.IsActive === false ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                        {b.IsActive === false ? 'Inactive' : 'Active'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => {
                                                                setEditingBudget(b);
                                                                setBudgetForm({
                                                                    CategoryCode: b.CategoryCode,
                                                                    CategoryLabel: b.CategoryLabel,
                                                                    BudgetFormat: b.BudgetFormat || '',
                                                                    IsActive: b.IsActive !== false,
                                                                    AllowedDeviceTypes: (b.AllowedDeviceTypes || []).map(t => t.TypeId)
                                                                });
                                                                setIsAddBudgetOpen(true);
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteBudget(b.CategoryID)}
                                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="5" className="p-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-slate-400">
                                                    <DollarSign className="w-12 h-12 mb-4 text-slate-200" />
                                                    <p className="font-medium text-lg text-slate-500">ไม่พบข้อมูลหมวดหมู่งบประมาณ</p>
                                                    <p className="text-sm">No budget categories found</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* MODALS */}

            {/* Add Admin Modal */}
            <AnimatePresence>
                {isAddAdminOpen && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20"
                            >
                                <div className="p-4 md:p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 opacity-90">
                                                <Shield size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider">ผู้ดูแลระบบ (Admin)</span>
                                            </div>
                                            <h3 className="font-black text-xl md:text-2xl tracking-tight">เพิ่มผู้ดูแลใหม่</h3>
                                        </div>
                                        <button onClick={() => setIsAddAdminOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={handleAddAdmin} className="flex flex-col h-full">
                                    <div className="p-4 md:p-5 bg-slate-50/50 space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">ชื่อผู้ใช้งาน (Username)</label>
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="e.g. jdoe"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                                value={newAdmin}
                                                onChange={(e) => setNewAdmin(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddAdminOpen(false)}
                                            className="flex-1 bg-white border border-slate-200 text-slate-600 text-sm font-bold py-2.5 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!newAdmin}
                                            className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                                        >
                                            เพิ่ม Admin
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* Add/Edit Vendor Modal */}
            <AnimatePresence>
                {isAddVendorOpen && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20"
                            >
                                <div className="p-4 md:p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 opacity-90">
                                                <Truck size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider">ผู้จัดหา (Vendor)</span>
                                            </div>
                                            <h3 className="font-black text-xl md:text-2xl tracking-tight">{editingVendor ? 'แก้ไขผู้จัดหา' : 'เพิ่มผู้จัดหาใหม่'}</h3>
                                        </div>
                                        <button onClick={() => setIsAddVendorOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={handleSaveVendor} className="flex flex-col h-full">
                                    <div className="p-4 md:p-5 bg-slate-50/50 space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">ชื่อผู้จัดหา (Vendor Name)</label>
                                            <input
                                                type="text"
                                                placeholder="Company Name"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                                value={vendorForm.VendorName}
                                                onChange={(e) => setVendorForm({ ...vendorForm, VendorName: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">ข้อมูลติดต่อ (Contact Info)</label>
                                            <textarea
                                                rows={3}
                                                placeholder="ที่อยู่, เบอร์โทร, อีเมล... (Address, Phone, Email...)"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700 resize-none"
                                                value={vendorForm.ContactInfo}
                                                onChange={(e) => setVendorForm({ ...vendorForm, ContactInfo: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddVendorOpen(false)}
                                            className="flex-1 bg-white border border-slate-200 text-slate-600 text-sm font-bold py-2.5 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!vendorForm.VendorName}
                                            className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                                        >
                                            {editingVendor ? 'บันทึกการแก้ไข' : 'บันทึก'}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* LOCATIONS TAB */}


            {/* Add/Edit Location Modal */}
            <AnimatePresence>
                {isAddLocationOpen && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20"
                            >
                                <div className="p-4 md:p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 opacity-90">
                                                <Archive size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider">สถานที่ (Location)</span>
                                            </div>
                                            <h3 className="font-black text-xl md:text-2xl tracking-tight">{editingLocation ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่ใหม่'}</h3>
                                        </div>
                                        <button onClick={() => setIsAddLocationOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={handleSaveLocation} className="flex flex-col h-full">
                                    <div className="p-4 md:p-5 bg-slate-50/50 space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">ชื่อสถานที่ (Location Name)</label>
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="e.g. Server Room, Cabinet A"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                                value={locationForm.Name}
                                                onChange={(e) => setLocationForm({ ...locationForm, Name: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddLocationOpen(false)}
                                            className="flex-1 bg-white border border-slate-200 text-slate-600 text-sm font-bold py-2.5 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!locationForm.Name}
                                            className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                                        >
                                            {editingLocation ? 'บันทึกการแก้ไข' : 'บันทึก'}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>


            {/* Add/Edit Reason Modal */}
            <AnimatePresence>
                {isAddReasonOpen && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20"
                            >
                                <div className="p-4 md:p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 opacity-90">
                                                <MessageSquare size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider">เหตุผล (Reason)</span>
                                            </div>
                                            <h3 className="font-black text-xl md:text-2xl tracking-tight">{editingReason ? 'แก้ไขเหตุผล' : 'เพิ่มเหตุผลใหม่'}</h3>
                                        </div>
                                        <button onClick={() => setIsAddReasonOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={handleSaveReason} className="flex flex-col h-full">
                                    <div className="p-4 md:p-5 bg-slate-50/50 space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">ชื่อเหตุผล (Label)</label>
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="e.g. เบิกใหม่, ทดแทน"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                                value={reasonForm.Label}
                                                onChange={(e) => setReasonForm({ ...reasonForm, Label: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">ใช้กับประเภท (Type) - Optional</label>
                                            <select
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                                value={reasonForm.TypeId}
                                                onChange={(e) => setReasonForm({ ...reasonForm, TypeId: e.target.value })}
                                            >
                                                <option value="" disabled>-- เลือกประเภท (Select Type) --</option>
                                                {deviceTypes.map(type => (
                                                    <option key={type.TypeId} value={type.TypeId}>{type.Label}</option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-slate-500 mt-2">
                                                เลือกประเภทอุปกรณ์เพื่อแสดงเหตุผลนี้เฉพาะเมื่อเบิกอุปกรณ์ประเภทนั้นๆ
                                                <br />(Select a type to show this reason only when withdrawing that device type)
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddReasonOpen(false)}
                                            className="flex-1 bg-white border border-slate-200 text-slate-600 text-sm font-bold py-2.5 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!reasonForm.Label}
                                            className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                                        >
                                            {editingReason ? 'บันทึกการแก้ไข' : 'บันทึก'}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* Add/Edit MA Type Modal */}
            <AnimatePresence>
                {isAddMATypeOpen && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20"
                            >
                                <div className="p-4 md:p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 opacity-90">
                                                <FileKey size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider">ประเภท MA (MA Type)</span>
                                            </div>
                                            <h3 className="font-black text-xl md:text-2xl tracking-tight">{editingMAType ? 'แก้ไขประเภท' : 'เพิ่มประเภทใหม่'}</h3>
                                        </div>
                                        <button onClick={() => setIsAddMATypeOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={handleSaveMAType} className="flex flex-col h-full">
                                    <div className="p-4 md:p-5 bg-slate-50/50 space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">หมวดหมู่ (Category)</label>
                                            <select
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                                value={maTypeForm.Category}
                                                onChange={(e) => setMaTypeForm({ ...maTypeForm, Category: e.target.value })}
                                                disabled={!!editingMAType}
                                            >
                                                {MA_CATEGORIES.map(c => (
                                                    <option key={c.key} value={c.key}>{c.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">ชื่อประเภท (Type Name)</label>
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="e.g. Server, Antivirus, Printer Rental"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                                value={maTypeForm.TypeName}
                                                onChange={(e) => setMaTypeForm({ ...maTypeForm, TypeName: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddMATypeOpen(false)}
                                            className="flex-1 bg-white border border-slate-200 text-slate-600 text-sm font-bold py-2.5 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!maTypeForm.TypeName}
                                            className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                                        >
                                            {editingMAType ? 'บันทึกการแก้ไข' : 'บันทึก'}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* Add/Edit Budget Modal */}
            <AnimatePresence>
                {isAddBudgetOpen && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20 my-8"
                            >
                                <div className="p-4 md:p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 opacity-90">
                                                <DollarSign size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider">งบประมาณ (Budget)</span>
                                            </div>
                                            <h3 className="font-black text-xl md:text-2xl tracking-tight">{editingBudget ? 'แก้ไขหมวดหมู่งบประมาณ' : 'เพิ่มหมวดหมู่งบประมาณ'}</h3>
                                        </div>
                                        <button onClick={() => setIsAddBudgetOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={handleSaveBudget} className="flex flex-col max-h-[calc(100vh-8rem)]">
                                    <div className="p-4 md:p-5 bg-slate-50/50 space-y-4 overflow-y-auto">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">รหัสหมวดหมู่ (Category Code)</label>
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    placeholder="e.g. BDG2024"
                                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                                    value={budgetForm.CategoryCode}
                                                    onChange={(e) => setBudgetForm({ ...budgetForm, CategoryCode: e.target.value })}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">สถานะ (Status)</label>
                                                <label className="flex items-center gap-2 cursor-pointer mt-3">
                                                    <input
                                                        type="checkbox"
                                                        className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        checked={budgetForm.IsActive}
                                                        onChange={(e) => setBudgetForm({ ...budgetForm, IsActive: e.target.checked })}
                                                    />
                                                    <span className="font-bold text-slate-700">{budgetForm.IsActive ? 'ใช้งาน (Active)' : 'ระงับ (Inactive)'}</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">ชื่อหมวดหมู่ (Category Label)</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. งบประมาณกลาง (Central Budget)"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                                value={budgetForm.CategoryLabel}
                                                onChange={(e) => setBudgetForm({ ...budgetForm, CategoryLabel: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">รูปแบบเลข Budget (Budget Format)</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. BDG-{YYYY}-{0000}"
                                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700 font-mono"
                                                value={budgetForm.BudgetFormat}
                                                onChange={(e) => setBudgetForm({ ...budgetForm, BudgetFormat: e.target.value })}
                                            />
                                            <p className="text-xs text-slate-500 mt-1">เว้นว่างไว้เพื่อใช้รูปแบบอัตโนมัติ (Leave empty for default format)</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-3">ประเภทอุปกรณ์ที่รองรับ (Allowed Device Types)</label>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {deviceTypes.map(type => (
                                                    <label key={type.TypeId} className="flex items-center gap-2 bg-white border border-slate-200 p-2.5 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={budgetForm.AllowedDeviceTypes?.includes(type.TypeId)}
                                                            onChange={() => handleDeviceTypeSelect(type.TypeId)}
                                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <span className="text-sm font-medium text-slate-700 select-none overflow-hidden text-ellipsis whitespace-nowrap" title={type.Label}>
                                                            {type.Label}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 flex gap-3 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddBudgetOpen(false)}
                                            className="flex-1 bg-white border border-slate-200 text-slate-600 text-sm font-bold py-2.5 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!budgetForm.CategoryCode || !budgetForm.CategoryLabel}
                                            className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                                        >
                                            {editingBudget ? 'บันทึกการแก้ไข' : 'บันทึก'}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            <AlertModal
                isOpen={alertModal.isOpen}
                type={alertModal.type}
                title={alertModal.title}
                message={alertModal.message}
                onConfirm={alertModal.onConfirm || (() => setAlertModal(prev => ({ ...prev, isOpen: false })))}
                onCancel={alertModal.onCancel}
                confirmText={alertModal.confirmText || "ปิด "}
                cancelText={alertModal.cancelText || "ยกเลิก "}
            />
        </div >
    );
};

export default ManagementPage;
