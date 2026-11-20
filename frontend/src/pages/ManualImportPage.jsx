import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Lock, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';
import AlertModal from '../components/AlertModal';
import { API_BASE } from '../config/api';
import { MANAGEMENT_TYPES, managementTypeInfo } from '../utils/stockManagement';

const EMPTY_FORM = {
    ProductName: '',
    DeviceType: '',
    LastPrice: '',
    Quantity: '',
    MinStock: '',
    MaxStock: '',
    ManagementType: '',   // '' = สินค้าใหม่ใช้ค่าเริ่มต้นของหมวด / สินค้าเดิมคงค่าเดิม
    Remark: ''
};

const MAX_NAME = 255;
const MAX_REMARK = 200;
const MAX_SUGGESTIONS = 30;

// Hide the browser spinner arrows on number inputs (they are easy to hit by accident).
const NO_SPIN = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

// Block mouse-wheel changes on number inputs (scrolling the page silently changes the value).
const noWheel = (e) => e.target.blur();

const toNumberOrNull = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const formatBaht = (n) =>
    `฿${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const findProductByName = (products, name) => {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    return products.find(p => String(p.ProductName || '').trim().toLowerCase() === key) || null;
};

const ManualImportPage = () => {
    const { deviceTypes, products, refreshData } = useData();
    const { user } = useAuth();
    const { ready: permReady, can } = usePermissions();
    const navigate = useNavigate();

    const canCreate = permReady && can('manual-import', 'create');

    const [formData, setFormData] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const submitLock = useRef(false); // synchronous guard against double-click
    const [resultModal, setResultModal] = useState({ isOpen: false, type: 'success', title: '', message: '', next: false });

    // Product-name combobox state
    const [nameOpen, setNameOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    // ProductID whose values are currently autofilled into the form (null = none).
    // Used to clear those values when the name stops matching an existing product.
    const [autofillId, setAutofillId] = useState(null);

    const typeLabel = useMemo(
        () => Object.fromEntries(deviceTypes.map(t => [String(t.TypeId), t.Label])),
        [deviceTypes]
    );
    const labelOf = (typeId) => (typeId ? (typeLabel[String(typeId)] || String(typeId)) : '-');

    const existingProduct = useMemo(
        () => findProductByName(products, formData.ProductName),
        [products, formData.ProductName]
    );

    // Suggestions: names starting with the query first, then names containing it.
    const suggestions = useMemo(() => {
        const q = formData.ProductName.trim().toLowerCase();
        if (!q) return products.slice(0, MAX_SUGGESTIONS);
        const starts = [];
        const contains = [];
        for (const p of products) {
            const n = String(p.ProductName || '').toLowerCase();
            if (n.startsWith(q)) starts.push(p);
            else if (n.includes(q)) contains.push(p);
        }
        return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
    }, [products, formData.ProductName]);

    const qtyNumber = toNumberOrNull(formData.Quantity);
    const qtyValid = Number.isInteger(qtyNumber) && qtyNumber > 0;
    const priceNumber = toNumberOrNull(formData.LastPrice);
    const minNumber = toNumberOrNull(formData.MinStock);
    const maxNumber = toNumberOrNull(formData.MaxStock);
    const currentStock = existingProduct ? Number(existingProduct.CurrentStock) || 0 : 0;

    // ---- Preview summary values ----
    const hasName = formData.ProductName.trim().length > 0;
    const showSummary = hasName && qtyValid;
    const afterStock = showSummary ? currentStock + qtyNumber : null;
    const totalValue = showSummary && priceNumber !== null ? qtyNumber * priceNumber : null;
    const categoryChanged = !!existingProduct && !!formData.DeviceType
        && String(existingProduct.DeviceType ?? '') !== formData.DeviceType;

    const warnings = [];
    if (afterStock !== null && minNumber !== null && afterStock < minNumber) {
        warnings.push(`หลังนำเข้ายังต่ำกว่าสต็อกขั้นต่ำ (${minNumber} ชิ้น)`);
    }
    if (afterStock !== null && maxNumber && maxNumber > 0) {
        if (currentStock > maxNumber) {
            warnings.push(`สต็อกปัจจุบัน ${currentStock} ชิ้น เกินสต็อกสูงสุด (${maxNumber} ชิ้น) อยู่แล้ว และการนำเข้าจะทำให้เพิ่มเป็น ${afterStock} ชิ้น`);
        } else if (afterStock > maxNumber) {
            warnings.push(`หลังนำเข้าจะเกินสต็อกสูงสุด (${maxNumber} ชิ้น)`);
        }
    }

    // Apply a product name. If it matches an existing product, autofill from it.
    // If it stops matching, clear the values that were autofilled earlier so they don't carry over.
    const applyProductName = (value) => {
        const match = findProductByName(products, value);
        if (match) {
            setAutofillId(match.ProductID);
            setFormData(prev => ({
                ...prev,
                ProductName: value,
                DeviceType: match.DeviceType ?? '',
                LastPrice: match.LastPrice ?? '',
                MinStock: match.MinStock ?? '',
                MaxStock: match.MaxStock ?? ''
            }));
            return;
        }
        setFormData(prev => (autofillId === null
            ? { ...prev, ProductName: value }
            : { ...prev, ProductName: value, DeviceType: '', LastPrice: '', MinStock: '', MaxStock: '' }
        ));
        setAutofillId(null);
    };

    const chooseSuggestion = (p) => {
        applyProductName(p.ProductName);
        setNameOpen(false);
        setActiveIdx(-1);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'ProductName') {
            applyProductName(value);
            setActiveIdx(-1);
            setNameOpen(true);
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleNameKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setNameOpen(true);
            setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            if (nameOpen && activeIdx >= 0 && suggestions[activeIdx]) {
                e.preventDefault();
                chooseSuggestion(suggestions[activeIdx]);
            }
        } else if (e.key === 'Escape') {
            setNameOpen(false);
            setActiveIdx(-1);
        }
    };

    const showError = (message, title = 'ไม่สามารถนำเข้าได้') =>
        setResultModal({ isOpen: true, type: 'error', title, message, next: false });

    // Client-side checks mirror the backend. Returns an error message, or null when valid.
    const validate = () => {
        if (!formData.ProductName.trim()) return 'กรุณาระบุชื่ออุปกรณ์';
        if (formData.ProductName.trim().length > MAX_NAME) return `ชื่ออุปกรณ์ยาวเกิน ${MAX_NAME} ตัวอักษร`;
        if (!formData.DeviceType) return 'กรุณาเลือกหมวดหมู่';
        if (!qtyValid) return 'จำนวนต้องเป็นจำนวนเต็มที่มากกว่า 0';
        if (priceNumber === null || priceNumber < 0) return 'ราคาต่อชิ้นต้องเป็นตัวเลขที่ไม่ติดลบ';
        if (minNumber === null || !Number.isInteger(minNumber) || minNumber < 0) return 'สต็อกขั้นต่ำต้องเป็นจำนวนเต็มที่ไม่ติดลบ';
        if (maxNumber !== null && (!Number.isInteger(maxNumber) || maxNumber < 0)) return 'สต็อกสูงสุดต้องเป็นจำนวนเต็มที่ไม่ติดลบ';
        if (maxNumber !== null && maxNumber > 0 && minNumber > maxNumber) return 'สต็อกขั้นต่ำต้องไม่มากกว่าสต็อกสูงสุด';
        if (formData.Remark.length > MAX_REMARK) return `หมายเหตุยาวเกิน ${MAX_REMARK} ตัวอักษร`;
        return null;
    };

    const resetForm = () => {
        setFormData(EMPTY_FORM);
        setAutofillId(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitLock.current) return;
        if (!canCreate) return showError('คุณไม่มีสิทธิ์นำเข้าอุปกรณ์ กรุณาติดต่อ Admin', 'ไม่มีสิทธิ์');

        const problem = validate();
        if (problem) return showError(problem, 'ข้อมูลไม่ถูกต้อง');

        submitLock.current = true;
        setSubmitting(true);
        try {
            const res = await fetch(`${API_BASE}/products/manual-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ProductName: formData.ProductName.trim(),
                    DeviceType: formData.DeviceType,
                    LastPrice: formData.LastPrice,
                    CurrentStock: formData.Quantity,
                    MinStock: formData.MinStock,
                    MaxStock: formData.MaxStock,
                    ...(formData.ManagementType ? { ManagementType: formData.ManagementType } : {}),
                    Remark: formData.Remark.trim(),
                    UserID: user?.username
                })
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 403) {
                return showError('คุณไม่มีสิทธิ์นำเข้าอุปกรณ์ กรุณาติดต่อ Admin', 'ไม่มีสิทธิ์');
            }
            if (!res.ok || !data.success) {
                return showError(data.error || 'ไม่สามารถนำเข้าอุปกรณ์ได้ กรุณาลองใหม่อีกครั้ง');
            }

            refreshData();
            const added = data.addedQty ?? qtyNumber;
            const lines = [
                data.action === 'updated' ? `เพิ่มเข้าสต็อกเดิม ${added} ชิ้น` : `เพิ่มอุปกรณ์ใหม่ ${added} ชิ้น`,
                `สต็อกคงเหลือ: ${data.newStock} ชิ้น`
            ];
            if (data.reactivated) lines.push('สินค้านี้เคยถูกปิดใช้งาน ระบบเปิดใช้งานอีกครั้งแล้ว');

            setResultModal({
                isOpen: true,
                type: 'success',
                title: 'นำเข้าสำเร็จ!',
                message: lines.join(' · '),
                next: true
            });
        } catch (err) {
            showError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'การเชื่อมต่อผิดพลาด');
        } finally {
            submitLock.current = false;
            setSubmitting(false);
        }
    };

    const handleCancel = () => {
        // Go back if there is history inside the app, otherwise go to Inventory (e.g. page opened directly).
        if (window.history.state && window.history.state.idx > 0) navigate(-1);
        else navigate('/inventory');
    };

    const handleCloseResult = () => {
        const wasSuccess = resultModal.type === 'success';
        setResultModal(prev => ({ ...prev, isOpen: false }));
        if (wasSuccess) resetForm();
    };

    const handleGoInventory = () => {
        setResultModal(prev => ({ ...prev, isOpen: false }));
        navigate('/inventory');
    };

    const inputBase = `w-full bg-white border border-slate-200 p-4 rounded-xl focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none text-slate-800 font-bold text-xl disabled:bg-slate-100 disabled:text-slate-400 ${NO_SPIN}`;
    const labelBase = 'text-xs font-bold text-slate-500 uppercase ml-1 mb-2 block tracking-wider';
    const listOpen = nameOpen && (suggestions.length > 0 || hasName);
    const activeOptionId = listOpen && activeIdx >= 0 && suggestions[activeIdx] ? `mi-opt-${activeIdx}` : undefined;

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in px-4 sm:px-0">
            <p className="text-slate-500 font-medium">เพิ่มอุปกรณ์เข้าระบบโดยไม่ต้องใช้ PO</p>

            {permReady && !canCreate && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
                    <Lock size={18} className="mt-0.5 shrink-0" />
                    <span>คุณสามารถดูหน้านี้ได้ แต่ไม่มีสิทธิ์นำเข้าอุปกรณ์ กรุณาติดต่อ Admin หากต้องการสิทธิ์เพิ่ม</span>
                </div>
            )}

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
            >
                <form onSubmit={handleSubmit} noValidate>
                    <fieldset disabled={!canCreate || submitting} className="contents">
                        <div className="flex flex-col lg:flex-row">
                            {/* LEFT: product info */}
                            <div className="flex-1 p-6 sm:p-8 space-y-6 border-b lg:border-b-0 lg:border-r border-slate-100">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                                    <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">1</span>
                                    ข้อมูลอุปกรณ์
                                </h3>

                                <div className="relative">
                                    <label htmlFor="mi-name" className={labelBase}>ชื่ออุปกรณ์ *</label>
                                    <input
                                        id="mi-name"
                                        role="combobox"
                                        aria-expanded={listOpen}
                                        aria-controls="mi-name-list"
                                        aria-autocomplete="list"
                                        aria-activedescendant={activeOptionId}
                                        name="ProductName"
                                        value={formData.ProductName}
                                        onChange={handleChange}
                                        onKeyDown={handleNameKeyDown}
                                        onFocus={() => setNameOpen(true)}
                                        onBlur={() => { setNameOpen(false); setActiveIdx(-1); }}
                                        required
                                        maxLength={MAX_NAME}
                                        className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl focus:ring-2 focus:ring-cyan-100 focus:border-cyan-500 outline-none transition-all text-slate-800 font-bold placeholder:text-slate-400 text-lg disabled:bg-slate-100"
                                        placeholder="ค้นหาหรือพิมพ์ชื่อใหม่"
                                        autoComplete="off"
                                    />

                                    {listOpen && (
                                        <ul
                                            id="mi-name-list"
                                            role="listbox"
                                            className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1"
                                        >
                                            {suggestions.map((p, idx) => {
                                                const active = idx === activeIdx;
                                                return (
                                                    <li
                                                        key={p.ProductID}
                                                        id={`mi-opt-${idx}`}
                                                        role="option"
                                                        aria-selected={active}
                                                        onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                                                        onMouseEnter={() => setActiveIdx(idx)}
                                                        onClick={() => chooseSuggestion(p)}
                                                        className={`px-4 py-2.5 cursor-pointer flex items-center justify-between gap-3 ${active ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-slate-800 truncate">{p.ProductName}</p>
                                                            <p className="text-xs text-slate-500 truncate">{labelOf(p.DeviceType)}</p>
                                                        </div>
                                                        <span className="shrink-0 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-2 py-1">
                                                            คงเหลือ {p.CurrentStock ?? 0}
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                            {suggestions.length === 0 && (
                                                <li className="px-4 py-3 text-sm text-slate-500">
                                                    ไม่พบอุปกรณ์นี้ ระบบจะเพิ่มเป็นอุปกรณ์ใหม่
                                                </li>
                                            )}
                                        </ul>
                                    )}
                                </div>

                                <div>
                                    <label htmlFor="mi-type" className={labelBase}>หมวดหมู่ *</label>
                                    <div className="relative">
                                        <select
                                            id="mi-type"
                                            name="DeviceType"
                                            value={formData.DeviceType}
                                            onChange={handleChange}
                                            required
                                            className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl focus:ring-2 focus:ring-cyan-100 focus:border-cyan-500 outline-none text-slate-800 font-medium appearance-none disabled:bg-slate-100"
                                        >
                                            <option value="">-- เลือกหมวดหมู่ --</option>
                                            {deviceTypes.map(t => <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>)}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="mi-mgmt" className={labelBase}>การจัดการสต็อก</label>
                                    <select
                                        id="mi-mgmt"
                                        name="ManagementType"
                                        value={formData.ManagementType}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl focus:ring-2 focus:ring-cyan-100 focus:border-cyan-500 outline-none text-slate-800 font-medium"
                                    >
                                        <option value="">
                                            {(() => {
                                                const existing = autofillId !== null && products.find(p => p.ProductID === autofillId);
                                                if (existing) return `คงค่าเดิม (${managementTypeInfo(existing).label})`;
                                                const type = deviceTypes.find(t => t.TypeId === formData.DeviceType);
                                                return type ? `ตามค่าเริ่มต้นของหมวด (${managementTypeInfo(type.DefaultManagementType || 'Rotating').label})` : 'ตามค่าเริ่มต้นของหมวด';
                                            })()}
                                        </option>
                                        {MANAGEMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                    <p className="mt-1 text-xs text-slate-400">หมุนเวียน: เตือน + คาดการณ์ · อุปกรณ์สำรอง: เตือนเมื่อต่ำกว่าขั้นต่ำ · เก็บในคลัง: ไม่เตือน ไม่สั่ง</p>
                                </div>

                                <div>
                                    <label htmlFor="mi-remark" className={labelBase}>หมายเหตุ / เลขอ้างอิง</label>
                                    <input
                                        id="mi-remark"
                                        name="Remark"
                                        value={formData.Remark}
                                        onChange={handleChange}
                                        maxLength={MAX_REMARK}
                                        className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl focus:ring-2 focus:ring-cyan-100 focus:border-cyan-500 outline-none text-slate-800 placeholder:text-slate-400"
                                        placeholder="เช่น ชื่อผู้ส่งมอบ, เลขใบส่งของ (ไม่บังคับ)"
                                    />
                                </div>
                            </div>

                            {/* RIGHT: stock & price */}
                            <div className="flex-1 p-6 sm:p-8 space-y-6 bg-slate-50/50">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                                    <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm">2</span>
                                    จำนวนและราคา
                                </h3>

                                <div className="grid grid-cols-2 gap-4 sm:gap-6">
                                    <div>
                                        <label htmlFor="mi-qty" className={labelBase}>จำนวน *</label>
                                        <input
                                            id="mi-qty"
                                            name="Quantity"
                                            type="number"
                                            inputMode="numeric"
                                            min="1"
                                            step="1"
                                            value={formData.Quantity}
                                            onChange={handleChange}
                                            onWheel={noWheel}
                                            required
                                            className={inputBase}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="mi-price" className={labelBase}>ราคาต่อชิ้น *</label>
                                        <input
                                            id="mi-price"
                                            name="LastPrice"
                                            type="number"
                                            inputMode="decimal"
                                            min="0"
                                            step="0.01"
                                            value={formData.LastPrice}
                                            onChange={handleChange}
                                            onWheel={noWheel}
                                            required
                                            className={inputBase}
                                            placeholder="0.00"
                                        />
                                        {priceNumber !== null && priceNumber >= 0 && (
                                            <p className="mt-1 ml-1 text-xs text-slate-500">{formatBaht(priceNumber)} / ชิ้น</p>
                                        )}
                                    </div>
                                </div>

                                {/* Preview summary sits right under the quantity and price it depends on */}
                                {showSummary && (
                                    <div className="p-5 rounded-2xl border border-slate-200 bg-white">
                                        <div className="flex flex-wrap items-center gap-2 mb-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${existingProduct ? 'bg-cyan-100 text-cyan-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                {existingProduct ? 'สินค้าเดิม · เพิ่มเข้าสต็อก' : 'สินค้าใหม่'}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-xs text-slate-500">{existingProduct ? 'สต็อกเดิม' : 'สต็อกเริ่มต้น'}</p>
                                                <p className="font-bold text-slate-800 text-lg">{currentStock.toLocaleString('th-TH')}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">นำเข้าครั้งนี้</p>
                                                <p className="font-bold text-emerald-700 text-lg">+{qtyNumber.toLocaleString('th-TH')}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">คงเหลือหลังนำเข้า</p>
                                                <p className="font-bold text-slate-800 text-lg">{afterStock.toLocaleString('th-TH')}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">มูลค่าที่นำเข้า</p>
                                                <p className="font-bold text-slate-800 text-lg">{totalValue !== null ? formatBaht(totalValue) : '-'}</p>
                                            </div>
                                        </div>

                                        {categoryChanged && (
                                            <p className="mt-4 text-sm text-slate-600">
                                                หมวดหมู่จะเปลี่ยนจาก <b>{labelOf(existingProduct.DeviceType)}</b> เป็น <b>{labelOf(formData.DeviceType)}</b>
                                            </p>
                                        )}

                                        {warnings.map(w => (
                                            <div key={w} className="mt-4 flex items-start gap-2 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                                                <span>{w}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 space-y-4">
                                    <h4 className="text-sm font-bold text-orange-800 uppercase tracking-wide">ขีดจำกัดสต็อก</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="mi-min" className="text-xs font-bold text-orange-600/80 uppercase mb-1 block">สต็อกขั้นต่ำ *</label>
                                            <input
                                                id="mi-min"
                                                name="MinStock"
                                                type="number"
                                                inputMode="numeric"
                                                min="0"
                                                step="1"
                                                value={formData.MinStock}
                                                onChange={handleChange}
                                                onWheel={noWheel}
                                                required
                                                className={`w-full bg-white border border-orange-200 p-3 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-500 outline-none text-slate-800 font-bold disabled:bg-slate-100 ${NO_SPIN}`}
                                                placeholder="Min"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="mi-max" className="text-xs font-bold text-orange-600/80 uppercase mb-1 block">สต็อกสูงสุด</label>
                                            <input
                                                id="mi-max"
                                                name="MaxStock"
                                                type="number"
                                                inputMode="numeric"
                                                min="0"
                                                step="1"
                                                value={formData.MaxStock}
                                                onChange={handleChange}
                                                onWheel={noWheel}
                                                className={`w-full bg-white border border-orange-200 p-3 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-500 outline-none text-slate-800 font-bold disabled:bg-slate-100 ${NO_SPIN}`}
                                                placeholder="ว่าง = ไม่กำหนด"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-orange-700/70">
                                        ถ้าเว้นสต็อกสูงสุดว่างไว้ สินค้าเดิมจะใช้ค่าเดิม ส่วนสินค้าใหม่จะไม่กำหนดค่า
                                    </p>
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    {/* Footer */}
                    <div className="px-6 sm:px-8 py-6 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4">
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={submitting}
                            className="px-8 py-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all disabled:opacity-50"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            disabled={!canCreate || submitting}
                            className="px-10 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:from-cyan-700 hover:to-blue-700 hover:shadow-cyan-200/50 transition-all flex items-center justify-center gap-2 transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            <Package size={20} />
                            {submitting ? 'กำลังบันทึก...' : 'ยืนยันการนำเข้า'}
                        </button>
                    </div>
                </form>
            </motion.div>

            <AlertModal
                isOpen={resultModal.isOpen}
                onConfirm={handleCloseResult}
                onCancel={resultModal.next ? handleGoInventory : undefined}
                type={resultModal.type}
                title={resultModal.title}
                message={resultModal.message}
                confirmText={resultModal.next ? 'นำเข้ารายการถัดไป' : 'ปิด'}
                cancelText="ไปหน้า Inventory"
            />
        </div>
    );
};

export default ManualImportPage;
