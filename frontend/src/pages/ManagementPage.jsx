import React, { useState, useEffect, useRef } from 'react';
import { Users, Settings, Truck, Plus, Trash2, Edit2, Search, Check, X, Shield, AlertTriangle, Archive, MessageSquare, FileKey, DollarSign, Map } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import Portal from '../components/Portal';
import AlertModal from '../components/AlertModal';
import { API_BASE, API_URL } from '../config/api';
import { getBadgeStyle, getDeviceTypeColor, getChartColor } from '../utils/styleHelpers';

const ManagementPage = () => {
    const { user } = useAuth();
    const { deviceTypes, vendors, refreshData } = useData();
    const [activeTab, setActiveTab] = useState('admin');
    const [searchTerm, setSearchTerm] = useState('');

    // Admin Users State
    const [adminUsers, setAdminUsers] = useState([]);
    const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);
    const [newAdmin, setNewAdmin] = useState('');
    const [newAdminEmpCode, setNewAdminEmpCode] = useState('');
    const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
    const [editingAdmin, setEditingAdmin] = useState(null);
    const [editAdminForm, setEditAdminForm] = useState({ Username: '', EmpCode: '' });

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

    // Alert Modal
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

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
    const fetchAdminUsers = async () => {
        setIsLoadingAdmins(true);
        try {
            const res = await fetch(`${API_BASE}/admin-users`);
            if (res.ok) setAdminUsers(await res.json());
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingAdmins(false);
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

    useEffect(() => {
        if (activeTab === 'admin') fetchAdminUsers();
        if (activeTab === 'locations') fetchLocations();
        if (activeTab === 'reasons') fetchReasons();
        if (activeTab === 'ma-types') fetchMATypes();
        if (activeTab === 'budgets') fetchBudgetCategories();
        if (activeTab === 'factory-layouts') fetchFactoryLayouts(); 
        setSearchTerm('');
    }, [activeTab]);

    // --- Admin Functions ---
    const handleAddAdmin = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE}/admin-users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newAdmin, empCode: newAdminEmpCode, createdBy: user?.username })
            });
            const data = await res.json();
            if (data.success) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'เพิ่มผู้ดูแลระบบสำเร็จ' });
                setNewAdmin('');
                setNewAdminEmpCode('');
                setIsAddAdminOpen(false);
                fetchAdminUsers();
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error || 'Failed' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
        }
    };

    const handleDeleteAdmin = (username) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ยืนยันการลบ',
            message: `คุณแน่ใจหรือไม่ที่จะลบ ${username}?`,
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/admin-users/${username}`, { method: 'DELETE' });
                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบผู้ดูแลระบบสำเร็จ' });
                        fetchAdminUsers();
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
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


    const handleEditAdmin = (admin) => {
        setEditingAdmin(admin);
        setEditAdminForm({ Username: admin.Username, EmpCode: admin.EmpCode || '' });
        setIsAddAdminOpen(true);
    };

    const handleSaveEditAdmin = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE}/admin-users/${editingAdmin.ID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editAdminForm)
            });
            const data = await res.json();
            if (data.success) {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'อัปเดตสำเร็จ' });
                setEditingAdmin(null);
                setEditAdminForm({ Username: '', EmpCode: '' });
                setIsAddAdminOpen(false);
                fetchAdminUsers();
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
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
            title: 'ลบเหตุผล',
            message: 'คุณแน่ใจหรือไม่?',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/reasons/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'ลบสำเร็จ' });
                        fetchReasons();
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.message });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
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
                    const res = await fetch(`${API_BASE}/upload/factory-layouts/${id}`, { method: 'DELETE' });
                    if (res.ok) {
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
                    {[
                        { id: 'admin', label: 'Admin', icon: Users },
                        { id: 'vendors', label: 'Vendors', icon: Truck },
                        { id: 'locations', label: 'Locations', icon: Archive },
                        { id: 'reasons', label: 'Reasons', icon: MessageSquare },
                        { id: 'ma-types', label: 'MA Types', icon: FileKey },
                        { id: 'budgets', label: 'Budgets', icon: DollarSign },
                        { id: 'factory-layouts', label: 'Maps', icon: Map }
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
                {activeTab === 'admin' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">SYSTEM ADMINISTRATORS</h3>
                                <p className="text-slate-500 text-xs">จัดการสิทธิผู้ดูแลระบบ</p>
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
                            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                                <table className="w-full text-left border-collapse whitespace-nowrap min-w-[500px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                            <th className="p-4 font-bold">ID</th>
                                            <th className="p-4 font-bold">Username</th>
                                            <th className="p-4 font-bold">EmpCode</th>
                                            <th className="p-4 font-bold">Created By</th>
                                            <th className="p-4 font-bold text-right">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {adminUsers.filter(u => u.Username.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                                            adminUsers.filter(u => u.Username.toLowerCase().includes(searchTerm.toLowerCase())).map(admin => (
                                                <tr key={admin.ID} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="p-4 text-slate-400 font-mono text-sm">#{admin.ID}</td>
                                                    <td className="p-4 font-bold text-slate-700 flex items-center gap-2"><Shield size={16} className="text-indigo-600" />{admin.Username}</td>
                                                    <td className="p-4 text-slate-600 text-sm">{admin.EmpCode || '-'}</td>
                                                    <td className="p-4 text-slate-600 text-sm">{admin.CreatedBy || 'System'}</td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleEditAdmin(admin)}
                                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
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
                                                <td colSpan="5" className="p-12 text-center text-slate-400">No admins found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* VENDORS TAB */}
                {activeTab === 'vendors' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">VENDORS</h3>
                                <p className="text-slate-500 text-xs">จัดการข้อมูลผู้จัดหา</p>
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
                            <button
                                onClick={() => { setEditingLocation(null); setLocationForm({ Name: '' }); setIsAddLocationOpen(true); }}
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
                                                        <button onClick={() => { setEditingLocation(loc); setLocationForm({ Name: loc.Name }); setIsAddLocationOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                                                        <button onClick={() => handleDeleteLocation(loc.LocationID)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
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
                                <p className="text-slate-500 text-xs">จัดการเหตุผลการเบิก</p>
                            </div>
                            <button onClick={() => setIsAddReasonOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"><Plus size={18} />เพิ่มเหตุผล</button>
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
                                        reasons.filter(r => r.Label.toLowerCase().includes(searchTerm.toLowerCase())).map(reason => (
                                            <tr key={reason.ReasonID} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 text-slate-400 font-mono text-sm">#{reason.ReasonID}</td>
                                                <td className="p-4 font-bold text-slate-700">{reason.Label}</td>
                                                <td className="p-4"><span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600">{reason.TypeId || '-'}</span></td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => { setEditingReason(reason); setReasonForm({ Label: reason.Label, TypeId: reason.TypeId || '' }); setIsAddReasonOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                                                        <button onClick={() => handleDeleteReason(reason.ReasonID)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            </tr>
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
                            <button onClick={() => { setEditingMAType(null); setMaTypeForm({ Category: 'HARDWARE', TypeName: '' }); setIsAddMATypeOpen(true); }} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"><Plus size={18} />เพิ่มประเภท</button>
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
                                                        <button onClick={() => { setEditingMAType(t); setMaTypeForm({ Category: t.Category, TypeName: t.TypeName }); setIsAddMATypeOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                                                        <button onClick={() => handleDeleteMAType(t.TypeID)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
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
                            <button onClick={() => { setEditingBudget(null); setBudgetForm({ CategoryCode: '', CategoryLabel: '', BudgetFormat: '', IsActive: true, AllowedDeviceTypes: [] }); setIsAddBudgetOpen(true); }} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"><Plus size={18} />เพิ่มหมวดหมู่</button>
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
                                                        <button onClick={() => { setEditingBudget(b); setBudgetForm({ CategoryCode: b.CategoryCode, CategoryLabel: b.CategoryLabel, BudgetFormat: b.BudgetFormat || '', IsActive: b.IsActive !== false, AllowedDeviceTypes: (b.AllowedDeviceTypes || []).map(t => t.TypeId) }); setIsAddBudgetOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                                                        <button onClick={() => handleDeleteBudget(b.CategoryID)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
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
            <button onClick={() => { setEditingFactoryLayout(null); setFactoryLayoutForm({ name: '', image_url: '', width: 1920, height: 1080 }); setSelectedFile(null); setIsAddFactoryLayoutOpen(true); }} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:scale-105"><Plus size={18} />เพิ่ม Layout</button>
        </div>
 
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="p-4 font-bold">ID</th>
                        <th className="p-4 font-bold">Name</th>
                        <th className="p-4 font-bold">Image</th>
                        <th className="p-4 font-bold">Size</th>
                        <th className="p-4 font-bold text-right">จัดการ</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {factoryLayouts.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                        factoryLayouts.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase())).map(layout => (
                            <tr key={layout.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="p-4 text-slate-400 font-mono text-sm">#{layout.id}</td>
                                <td className="p-4 font-bold text-slate-700 flex items-center gap-2"><Map size={16} className="text-teal-600" />{layout.name}</td>
                                <td className="p-4 text-slate-600 text-sm max-w-xs truncate font-mono text-[11px]">{layout.image_url}</td>
                                <td className="p-4 text-slate-600 text-sm font-mono">{layout.width}x{layout.height}</td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => { setEditingFactoryLayout(layout); setFactoryLayoutForm({ name: layout.name, image_url: layout.image_url, width: layout.width || 1920, height: layout.height || 1080 }); setSelectedFile(null); setIsAddFactoryLayoutOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDeleteFactoryLayout(layout.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="5" className="p-12 text-center text-slate-400">No layouts found</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
)}
            </div>

            {/* MODALS - Admin */}
            <AnimatePresence>
                {isAddAdminOpen && (
                    <Portal>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20">
                                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-black text-xl tracking-tight">{editingAdmin ? 'แก้ไขผู้ดูแล' : 'เพิ่มผู้ดูแลใหม่'}</h3>
                                        </div>
                                        <button onClick={() => { setIsAddAdminOpen(false); setEditingAdmin(null); setNewAdmin(''); setNewAdminEmpCode(''); }} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                                    </div>
                                </div>
                                <form onSubmit={editingAdmin ? handleSaveEditAdmin : handleAddAdmin} className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Username</label>
                                        <input autoFocus type="text" placeholder="jdoe" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700" value={editingAdmin ? editAdminForm.Username : newAdmin} onChange={(e) => editingAdmin ? setEditAdminForm({...editAdminForm, Username: e.target.value}) : setNewAdmin(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">EmpCode (optional)</label>
                                        <input type="text" placeholder="E12345" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700 font-mono" value={editingAdmin ? editAdminForm.EmpCode : newAdminEmpCode} onChange={(e) => editingAdmin ? setEditAdminForm({...editAdminForm, EmpCode: e.target.value}) : setNewAdminEmpCode(e.target.value)} />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => { setIsAddAdminOpen(false); setEditingAdmin(null); setNewAdmin(''); setNewAdminEmpCode(''); }} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                                        <button type="submit" disabled={editingAdmin ? !editAdminForm.Username : !newAdmin} className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">บันทึก</button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

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