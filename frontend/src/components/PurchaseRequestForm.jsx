import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShoppingCart, Printer, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const PurchaseRequestForm = () => {
    const { products } = useData();
    const { user } = useAuth();
    const [budgetCategories, setBudgetCategories] = useState([]);

    // Low Stock Logic
    const [showLowStock, setShowLowStock] = useState(false);
    // Include items where current stock is less than or equal to min stock (even if min stock is 0)
    const lowStockItems = products ? products.filter(p => p.CurrentStock != null && p.MinStock != null && Number(p.CurrentStock) <= Number(p.MinStock)) : [];

    // Form State
    const [form, setForm] = useState({
        reqDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        delPlace: '',
        reqBy: user?.name || '',
        sect: user?.sect || '',
        tel: '',
        remark: '',

        // Checkboxes
        oneSupplier: false,
        compIT: false,
        compPur: false,
        compMA: false,
        compTo: '',

        // 5 Items max
        items: Array.from({ length: 5 }, () => ({
            name: '', qty: '', um: '', cost: '', bg: '', prog: '', asset: '', remark: ''
        })),

        // Certificates
        certRoHS: false, certTCO: false, certEnergy: false, certCE1: false, certCE2: false,

        // 5W
        who: '', what: '', where: '', when: '', why: '',

        // Signatures
        prNo: '', prSign: '', prDate: '',
        invNo: '', invSign: '', invDate: ''
    });

    const [budgetWarnings, setBudgetWarnings] = useState({});

    useEffect(() => {
        fetchBudgets();
    }, []);

    const fetchBudgets = async () => {
        try {
            const res = await fetch(`${API_BASE}/budgets`);
            if (res.ok) {
                const data = await res.json();
                setBudgetCategories(data);
            }
        } catch (err) {
            console.error('Failed to fetch budgets:', err);
        }
    };

    // Print Handler
    const handlePrint = () => {
        window.print();
    };

    // Handle Input Changes
    const updateForm = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const updateItem = (index, field, value) => {
        const newItems = [...form.items];
        newItems[index][field] = value;
        setForm(prev => ({ ...prev, items: newItems }));
    };

    useEffect(() => {
        validateAllItems(form.items);
    }, [form.items, budgetCategories, products]);

    const validateAllItems = (items) => {
        let warnings = {};

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.name || !item.bg) continue;

            const product = products.find(p => p.ProductName.toLowerCase() === item.name.toLowerCase());
            if (!product) continue;
            // Find all categories that this product's DeviceType is ALLOWED to be in
            const validCategories = budgetCategories.filter(cat =>
                cat.AllowedDeviceTypes && cat.AllowedDeviceTypes.some(t => t.TypeId === product.DeviceType)
            );

            const validFormatsText = validCategories.length > 0
                ? validCategories.map(c => c.BudgetFormat).join(' หรือ ')
                : 'ไม่มี Budget รองรับ DeviceType นี้';

            let matchedCategory = null;

            for (const cat of budgetCategories) {
                if (!cat.BudgetFormat) continue;

                try {
                    const sanitized = cat.BudgetFormat.trim();
                    let regexPattern = sanitized.replace(/x/gi, '.');
                    const regex = new RegExp(`^${regexPattern}$`, 'i');

                    if (item.bg === sanitized || regex.test(item.bg) || item.bg.toUpperCase().includes(sanitized.toUpperCase())) {
                        matchedCategory = cat;
                        break;
                    }
                } catch (err) { }
            }

            if (matchedCategory) {
                const allowedTypes = matchedCategory.AllowedDeviceTypes.map(t => t.TypeId);
                if (!allowedTypes.includes(product.DeviceType)) {
                    warnings[i] = `หมวดนี้ไม่ถูกต้องสำหรับ "${item.name}" (โปรดใช้รูปแบบ: ${validFormatsText})`;
                }
            } else {
                warnings[i] = `B/G No ไม่ถูกต้องสำหรับ "${item.name}" (โปรดใช้รูปแบบ: ${validFormatsText})`;
            }
        }

        setBudgetWarnings(warnings);
    };

    return (
        <div className="flex h-[800px] w-full bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner">

            {/* LEFT: Input Form */}
            <div className="w-[450px] bg-white border-r border-slate-200 flex flex-col h-full z-10 print:hidden overflow-y-auto custom-scrollbar">
                <div className="p-4 bg-indigo-600 text-white flex justify-between items-center sticky top-0 z-20 shadow-md">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2"><ShoppingCart size={18} /> ข้อมูลใบขอซื้อ (PR)</h2>
                        <p className="text-xs text-indigo-200">ระบบกรอกข้อมูลออกใบ PR A5</p>
                    </div>
                    <div className="flex items-center gap-2 relative">
                        {/* Min Stock Alert Button */}
                        <div className="relative">
                            <button
                                onClick={() => setShowLowStock(!showLowStock)}
                                className={`px-3 py-1.5 rounded-lg font-bold shadow transition-all flex items-center gap-2 text-sm
                                    ${lowStockItems.length > 0 ? 'bg-orange-500 hover:bg-orange-600 text-white animate-pulse' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}
                                `}
                            >
                                <AlertTriangle size={16} />
                                {lowStockItems.length > 0 ? `รีบสั่ง (${lowStockItems.length})` : 'ปกติ (0)'}
                            </button>

                            {showLowStock && (
                                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden">
                                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                                        <span className="font-bold text-slate-800 text-sm">สินค้าต่ำกว่าจุดสั่งซื้อ</span>
                                        <button onClick={() => setShowLowStock(false)} className="text-slate-400 hover:text-slate-600">
                                            <X size={16} />
                                        </button>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto p-2 pointer-events-auto custom-scrollbar">
                                        {lowStockItems.length > 0 ? (
                                            lowStockItems.map(item => {
                                                const isAdded = form.items.some(i => i.name === item.ProductName);
                                                return (
                                                    <div
                                                        key={item.ProductID}
                                                        className={`p-2 border-b last:border-0 rounded cursor-pointer transition-colors ${isAdded ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-100' : 'hover:bg-slate-50'
                                                            }`}
                                                        onClick={() => {
                                                            if (isAdded) {
                                                                setShowLowStock(false); // Just close if already added
                                                                return;
                                                            }
                                                            const emptyIndex = form.items.findIndex(i => !i.name);
                                                            if (emptyIndex !== -1) {
                                                                updateItem(emptyIndex, 'name', item.ProductName);
                                                                setShowLowStock(false);
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div className={`text-sm font-bold truncate ${isAdded ? 'text-emerald-700' : 'text-slate-800'}`} title={item.ProductName}>
                                                                {item.ProductName}
                                                            </div>
                                                            {isAdded && <CheckCircle2 size={16} className="text-emerald-500 shrink-0 ml-2" />}
                                                        </div>
                                                        <div className="flex justify-between text-xs mt-1">
                                                            <span className={`${isAdded ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                เหลือ: <span className={`font-bold ${isAdded ? 'text-emerald-700' : 'text-red-600'}`}>
                                                                    {item.CurrentStock} {item.UnitOfMeasure || item.UM}
                                                                </span>
                                                            </span>
                                                            <span className={`${isAdded ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                                ขั้นต่ำ: {item.MinStock}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="text-center p-4 text-sm text-slate-500">
                                                ไม่มีสินค้าที่ต้องสั่งซื้อด่วน
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <button onClick={handlePrint} className="bg-white text-indigo-600 px-4 py-1.5 rounded-lg font-bold shadow hover:bg-slate-50 transition-all flex items-center gap-2 text-sm">
                            <Printer size={16} /> พิมพ์ A5
                        </button>
                    </div>
                </div>



                <div className="p-5 space-y-6">
                    {/* General Info */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-slate-700 border-b pb-2 text-sm">1. ข้อมูลทั่วไป</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Request Date</label>
                                <input type="date" value={form.reqDate} onChange={e => updateForm('reqDate', e.target.value)} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Due Date</label>
                                <input type="date" value={form.dueDate} onChange={e => updateForm('dueDate', e.target.value)} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Del Place</label>
                            <input type="text" value={form.delPlace} onChange={e => updateForm('delPlace', e.target.value)} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-500 mb-1">Request by</label>
                                <input type="text" value={form.reqBy} onChange={e => updateForm('reqBy', e.target.value)} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="w-24">
                                <label className="block text-xs font-bold text-slate-500 mb-1">Sect</label>
                                <input type="text" value={form.sect} onChange={e => updateForm('sect', e.target.value)} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="w-28">
                                <label className="block text-xs font-bold text-slate-500 mb-1">Tel</label>
                                <input type="text" value={form.tel} onChange={e => updateForm('tel', e.target.value)} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Remark</label>
                            <input type="text" value={form.remark} onChange={e => updateForm('remark', e.target.value)} className="w-full border rounded-lg p-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                        </div>

                        <div className="pt-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" checked={form.oneSupplier} onChange={e => updateForm('oneSupplier', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
                                <span className="text-sm font-bold text-slate-700">One Supplier</span>
                            </label>
                        </div>

                        <div className="pt-2">
                            <label className="block text-xs font-bold text-slate-500 mb-2">Compare Supplier by:</label>
                            <div className="flex gap-4 mb-2">
                                <label className="flex items-center space-x-1 cursor-pointer"><input type="checkbox" checked={form.compIT} onChange={e => updateForm('compIT', e.target.checked)} className="rounded" /> <span className="text-sm">IT</span></label>
                                <label className="flex items-center space-x-1 cursor-pointer"><input type="checkbox" checked={form.compPur} onChange={e => updateForm('compPur', e.target.checked)} className="rounded" /> <span className="text-sm">Purchase</span></label>
                                <label className="flex items-center space-x-1 cursor-pointer"><input type="checkbox" checked={form.compMA} onChange={e => updateForm('compMA', e.target.checked)} className="rounded" /> <span className="text-sm">M/A</span></label>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-500">To:</span>
                                <input type="text" value={form.compTo} onChange={e => updateForm('compTo', e.target.value)} className="flex-1 border rounded-lg p-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                        </div>
                    </div>

                    {/* Items */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-slate-700 border-b pb-2 text-sm flex justify-between">
                            <span>2. รายการสินค้า (สูงสุด 5)</span>
                        </h3>
                        {form.items.map((item, index) => (
                            <div key={index} className="p-3 bg-slate-50 border border-slate-200 rounded-xl relative space-y-2">
                                <div className="absolute top-0 right-0 bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-bl-lg font-bold">#{index + 1}</div>

                                <input type="text" value={item.name} onChange={e => updateItem(index, 'name', e.target.value)} placeholder="ชื่อสินค้า (Name) พิมพ์เพื่อเช็ค DeviceType" className="w-full border rounded-lg p-2 text-sm outline-none focus:border-indigo-500 bg-white" list={`pr-products-${index}`} />
                                <datalist id={`pr-products-${index}`}>
                                    {products.map(p => <option key={p.ProductID} value={p.ProductName} />)}
                                </datalist>

                                <div className="grid grid-cols-4 gap-2">
                                    <input type="text" value={item.qty} onChange={e => updateItem(index, 'qty', e.target.value)} placeholder="Q'ty" className="border rounded-lg p-2 text-sm text-center outline-none bg-white" />
                                    <input type="text" value={item.um} onChange={e => updateItem(index, 'um', e.target.value)} placeholder="UM" className="border rounded-lg p-2 text-sm text-center outline-none bg-white" />
                                    <input type="text" value={item.cost} onChange={e => updateItem(index, 'cost', e.target.value)} placeholder="Unit Cost" className="col-span-2 border rounded-lg p-2 text-sm outline-none bg-white" />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <input type="text" value={item.bg} onChange={e => updateItem(index, 'bg', e.target.value)} placeholder="B/G No." className={`border rounded-lg p-2 text-sm text-center outline-none bg-white ${budgetWarnings[index] ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500' : 'focus:border-indigo-500'}`} />
                                    <input type="text" value={item.prog} onChange={e => updateItem(index, 'prog', e.target.value)} placeholder="Prog(Y/N)" className="border rounded-lg p-2 text-sm text-center outline-none bg-white" />
                                    <input type="text" value={item.asset} onChange={e => updateItem(index, 'asset', e.target.value)} placeholder="Asset Place" className="border rounded-lg p-2 text-sm outline-none bg-white" />
                                </div>
                                <input type="text" value={item.remark} onChange={e => updateItem(index, 'remark', e.target.value)} placeholder="Remark" className="w-full border rounded-lg p-2 text-sm outline-none bg-white" />

                                {budgetWarnings[index] && (
                                    <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-[11px] leading-tight flex gap-1.5 items-start">
                                        <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-500" />
                                        <span>{budgetWarnings[index]}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Certs */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-slate-700 border-b pb-2 text-sm">3. Certificates (IT Only)</h3>
                        <div className="text-sm">
                            <span className="font-bold block mb-2 text-slate-600">Computer / Notebook</span>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center cursor-pointer"><input type="checkbox" checked={form.certRoHS} onChange={e => updateForm('certRoHS', e.target.checked)} className="mr-1.5 rounded" /> RoHS</label>
                                <label className="flex items-center cursor-pointer"><input type="checkbox" checked={form.certTCO} onChange={e => updateForm('certTCO', e.target.checked)} className="mr-1.5 rounded" /> TCO</label>
                                <label className="flex items-center cursor-pointer"><input type="checkbox" checked={form.certEnergy} onChange={e => updateForm('certEnergy', e.target.checked)} className="mr-1.5 rounded" /> Energy Star</label>
                                <label className="flex items-center cursor-pointer"><input type="checkbox" checked={form.certCE1} onChange={e => updateForm('certCE1', e.target.checked)} className="mr-1.5 rounded" /> CE</label>
                            </div>
                        </div>
                        <div className="text-sm mt-3 pt-3 border-t border-slate-100">
                            <span className="font-bold block mb-2 text-slate-600">Network / Printer / CCTV</span>
                            <label className="flex items-center cursor-pointer"><input type="checkbox" checked={form.certCE2} onChange={e => updateForm('certCE2', e.target.checked)} className="mr-1.5 rounded" /> CE</label>
                        </div>
                    </div>

                    {/* 5W */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-slate-700 border-b pb-2 text-sm">4. เหตุผลการสั่งซื้อ (5W)</h3>
                        <div className="space-y-2">
                            {['who', 'what', 'where', 'when', 'why'].map(w => (
                                <div key={w} className="flex items-center gap-2">
                                    <span className="w-12 text-sm font-bold text-slate-500 capitalize">{w}:</span>
                                    <input type="text" value={form[w]} onChange={e => updateForm(w, e.target.value)} className="flex-1 border border-slate-200 rounded-lg p-1.5 text-sm outline-none focus:border-indigo-500" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-slate-700 border-b pb-2 text-sm">5. Signatures (Optional Text)</h3>
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <input type="text" value={form.prNo} onChange={e => updateForm('prNo', e.target.value)} placeholder="PR No." className="w-1/3 border rounded-lg p-1.5 text-sm outline-none" />
                                <input type="text" value={form.prSign} onChange={e => updateForm('prSign', e.target.value)} placeholder="Sign" className="w-1/3 border rounded-lg p-1.5 text-sm outline-none" />
                                <input type="text" value={form.prDate} onChange={e => updateForm('prDate', e.target.value)} placeholder="Date" className="w-1/3 border rounded-lg p-1.5 text-sm outline-none" />
                            </div>
                            <div className="flex gap-2">
                                <input type="text" value={form.invNo} onChange={e => updateForm('invNo', e.target.value)} placeholder="Invoice No." className="w-1/3 border rounded-lg p-1.5 text-sm outline-none" />
                                <input type="text" value={form.invSign} onChange={e => updateForm('invSign', e.target.value)} placeholder="Sign" className="w-1/3 border rounded-lg p-1.5 text-sm outline-none" />
                                <input type="text" value={form.invDate} onChange={e => updateForm('invDate', e.target.value)} placeholder="Date" className="w-1/3 border rounded-lg p-1.5 text-sm outline-none" />
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* RIGHT: Live A5 Preview for Printing */}
            <div className="flex-1 bg-slate-200 overflow-y-auto p-10 flex justify-center items-start print:p-0 print:bg-white custom-scrollbar">

                {/* A5 Container CSS Classes */}
                <style>{`
                    @media print {
                        @page { size: A5 landscape; margin: 5mm; }
                        body { margin: 0; padding: 0; background: white; }
                        body * { visibility: hidden; }
                        .print-area, .print-area * { visibility: visible; }
                        .print-area { 
                            position: absolute; 
                            left: 0; 
                            top: 0; 
                            width: 100%; 
                            height: 100%;
                            box-shadow: none !important; 
                            margin: 0 !important; 
                            border: none !important;
                            page-break-after: avoid;
                        }
                        .print\\:hidden { display: none !important; }
                    }
                `}</style>

                {/* A5 Print Canvas */}
                <div className="print-area w-[210mm] h-[148.5mm] bg-white shadow-2xl relative box-border flex flex-col font-['Sarabun'] text-[13px] text-black border print:border-none print:w-[100%] print:h-[100%] mx-auto scale-[0.95] print:scale-100 origin-top">

                    <div className="border-2 border-black m-1 flex flex-col flex-1 overflow-hidden print:m-0 print:mb-1">
                        {/* Header Section */}
                        <div className="flex px-3 py-1 border-b-2 border-black relative items-center justify-center shrink-0">
                            <div className="text-center font-bold">
                                <h1 className="text-[14px] tracking-wide leading-none mb-0.5">PURCHASE REQUEST SHEET / ใบขอซื้อวัสดุ-อุปกรณ์</h1>
                                <h2 className="text-[12px] leading-none">INFORMATION TECHNOLOGY SECT</h2>
                            </div>
                            <div className="absolute top-1 right-2 font-bold text-[11px]">
                                B/G DEPT: T7510
                            </div>
                        </div>

                        {/* General Info Section */}
                        <div className="px-2 py-1 flex flex-col justify-between text-[13px] h-[65px] border-b-2 border-black shrink-0">
                            {/* Row 1 */}
                            <div className="flex items-end whitespace-nowrap leading-tight">
                                <span className="mr-2 w-[75px] shrink-0">Request Date :</span>
                                <span className="border-b border-black flex-1 min-w-[100px] px-1 pb-[1px]">{form.reqDate}</span>

                                <span className="ml-4 mr-2 shrink-0">[ <span className="w-3 inline-block text-center font-bold text-blue-700">{form.oneSupplier ? '✔' : ''}</span> ] One Supplier</span>

                                <span className="ml-4 mr-2 shrink-0">Del Place :</span>
                                <span className="border-b border-black flex-1 min-w-[50px] px-1 pb-[1px]">{form.delPlace}</span>
                            </div>

                            {/* Row 2 */}
                            <div className="flex items-end whitespace-nowrap leading-tight">
                                <span className="mr-2 w-[75px] shrink-0">Due Date :</span>
                                <span className="border-b border-black flex-1 min-w-[100px] px-1 pb-[1px]">{form.dueDate}</span>

                                <span className="ml-4 mr-1 shrink-0">[ &nbsp; ] Compare Supplier by</span>
                                <span className="mr-1 shrink-0">[ <span className="w-3 inline-block text-center font-bold text-blue-700">{form.compIT ? '✔' : ''}</span> ] IT</span>
                                <span className="mr-1 shrink-0">[ <span className="w-3 inline-block text-center font-bold text-blue-700">{form.compPur ? '✔' : ''}</span> ] Puchase</span>
                                <span className="mr-1 shrink-0">[ <span className="w-3 inline-block text-center font-bold text-blue-700">{form.compMA ? '✔' : ''}</span> ] M/A</span>

                                <span className="mx-1 shrink-0 px-1 border-b border-black min-w-[40px] flex-1 text-center text-blue-700 pb-[1px]">{form.compTo}</span>
                                <span className="shrink-0">To</span>
                                <span className="border-b border-black min-w-[40px] flex-1 ml-1 pb-[1px]"></span>
                            </div>

                            {/* Row 3 */}
                            <div className="flex items-end whitespace-nowrap leading-tight">
                                <span className="mr-2 w-[75px] shrink-0">Request by :</span>
                                <span className="border-b border-black flex-1 min-w-[100px] px-1 pb-[1px] text-black-700">{form.reqBy}</span>

                                <span className="mr-2 shrink-0 ml-4">Sect :</span>
                                <span className="border-b border-black w-24 shrink-0 px-1 pb-[1px] text-black-700">{form.sect}</span>

                                <span className="mr-2 shrink-0 ml-4">Tel:</span>
                                <span className="border-b border-black w-16 shrink-0 px-1 pb-[1px] text-black-700">{form.tel}</span>

                                <span className="mr-2 shrink-0 ml-4">Remark:</span>
                                <span className="border-b border-black flex-1 min-w-[50px] px-1 pb-[1px] text-black-700">{form.remark}</span>
                            </div>
                        </div>

                        {/* Table Section */}
                        <div className="flex-1 flex flex-col min-h-[100px]">
                            <table className="w-full text-center border-collapse border-b-2 border-black table-fixed h-full">
                                <thead>
                                    <tr className="font-bold text-[12px] bg-white leading-tight">
                                        <th className="border-r border-black border-b border-black py-0 w-[5%] font-normal">Item</th>
                                        <th className="border-r border-black border-b border-black py-0 w-[70%] font-normal">Name</th>
                                        <th className="border-r border-black border-b border-black py-0 w-[6%] font-normal">Q'ty</th>
                                        <th className="border-r border-black border-b border-black py-0 w-[7%] font-normal">UM</th>
                                        <th className="border-r border-black border-b border-black py-0 w-[10%] font-normal">Unit Cost<br />[THB]</th>
                                        <th className="border-r border-black border-b border-black py-0 w-[20%] font-normal">B/G No</th>
                                        <th className="border-r border-black border-b border-black py-0 w-[9%] font-normal">Progress Bit<br />[Y/N]</th>
                                        <th className="border-r border-black border-b border-black py-0 w-[14%] font-normal">Asset Place</th>
                                        <th className="border-b border-black py-0 w-[15%] font-normal">Remark</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.items.map((item, index) => (
                                        <tr key={index} className="text-[13px] leading-tight h-[13px]">
                                            <td className="border-r border-b border-black align-bottom pb-0.5">{item.name ? index + 1 : ''}</td>
                                            <td className="border-r border-b border-black text-left px-1 align-bottom pb-0.5 truncate text-black-800">{item.name}</td>
                                            <td className="border-r border-b border-black align-bottom pb-0.5 text-black-800">{item.qty}</td>
                                            <td className="border-r border-b border-black align-bottom pb-0.5 text-black-800">{item.um}</td>
                                            <td className="border-r border-b border-black text-center px-1 align-bottom pb-0.5 text-black-800">{item.cost}</td>
                                            <td className="border-r border-b border-black align-bottom pb-0.5 text-black-800">{item.bg}</td>
                                            <td className="border-r border-b border-black align-bottom pb-0.5 text-black-800">{item.prog}</td>
                                            <td className="border-r border-b border-black align-bottom pb-0.5 text-black-800">{item.asset}</td>
                                            <td className="border-b border-black text-left px-1 text-center align-bottom pb-0.5 truncate text-black-800">{item.remark}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Certificates */}
                            <div className="border-b-2 border-black flex flex-col text-[11px] h-[55px] shrink-0">
                                <div className="px-2 py-[2px] border-b border-black text-red-600 font-bold text-[12px]">
                                    กรณีที่ซื้อสินค้าประเภทคอมพิวเตอร์ โน้ตบุ๊ค เครื่อง Printer อุปกรณ์เครือข่าย และ CCTV ต้องตรวจสอบว่ามี Certificated หรือไม่
                                </div>
                                <div className="flex w-full flex-1 items-center">
                                    <div className="flex-1 flex items-center px-2 border-r border-black h-full">
                                        <span className="text-red-600 mr-4 font-bold text-[10px]">COMPUTER/NOTEBOOK</span>
                                        <div className="flex items-center space-x-3">
                                            <label className="flex items-center"><span className="w-5 inline-block font-bold text-blue-700">[{form.certRoHS ? '✔' : ' '}]</span> RoHS</label>
                                            <label className="flex items-center"><span className="w-5 inline-block font-bold text-blue-700">[{form.certTCO ? '✔' : ' '}]</span> TCO</label>
                                            <label className="flex items-center"><span className="w-5 inline-block font-bold text-blue-700">[{form.certEnergy ? '✔' : ' '}]</span> Energy Star</label>
                                            <label className="flex items-center"><span className="w-5 inline-block font-bold text-blue-700">[{form.certCE1 ? '✔' : ' '}]</span> CE</label>
                                        </div>
                                    </div>
                                    <div className="w-[35%] flex items-center px-2 h-full">
                                        <span className="text-red-600 mr-2 font-bold text-[10px]">อุปกรณ์เครือข่าย/Printer/CCTV</span>
                                        <label className="flex items-center"><span className="w-5 inline-block font-bold text-blue-700">[{form.certCE2 ? '✔' : ' '}]</span> CE</label>
                                    </div>
                                </div>
                            </div>

                            {/* 5W Section */}
                            <div className="px-3 py-1 border-b-2 border-black flex flex-col justify-between text-[11px] flex-1 min-h-[110px]">
                                {['who', 'what', 'where', 'when', 'why'].map((w, i) => (
                                    <div key={w} className="flex relative items-end">
                                        <span className="underline mr-2 w-10 text-black capitalize shrink-0 leading-none">{w}:</span>
                                        <div className="flex-1 border-b-[1.5px] border-dotted border-black relative pb-[1px]">
                                            <span className="text-black-700 absolute bottom-0 left-2 truncate w-full h-[14px] leading-tight">{form[w]}</span>
                                        </div>
                                        {w === 'why' && (
                                            <div className="border border-red-500 text-red-600 text-[9px] px-1 py-0 ml-2 whitespace-nowrap bg-white absolute right-0 bottom-1 font-bold">
                                                **** ซื้อ TV ใช้ B/G NO {'>'} OF เท่านั้น!!
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Footer Signatures */}
                            <table className="w-full text-left border-collapse text-[10px] h-[45px] shrink-0 table-fixed">
                                <tbody>
                                    <tr>
                                        <td rowSpan="2" className="border-r border-black font-bold text-center w-[12%] align-middle leading-tight p-0">
                                            Purchase<br />Receiving
                                        </td>
                                        <td className="border-r border-b border-black px-1 w-[16%] align-bottom pb-0.5">
                                            <span className="mr-1 inline-block w-8">PR No.</span><span className="text-blue-700">{form.prNo}</span>
                                        </td>
                                        <td className="border-r border-b border-black px-1 w-[12%] align-bottom pb-0.5">
                                            <span className="mr-1">Sign:</span><span className="text-blue-700">{form.prSign}</span>
                                        </td>
                                        <td className="border-r border-b border-black px-1 w-[12%] align-bottom pb-0.5">
                                            <span className="mr-1">Date:</span><span className="text-blue-700">{form.prDate}</span>
                                        </td>
                                        <td rowSpan="2" className="px-2 py-0 text-[8px] leading-tight w-[48%] align-middle">
                                            <p>Y = ซื้อสินค้าเพื่องานโปรเจ็คประเภท Construction in progress</p>
                                            <p>N = ซื้อสินค้าที่มีมูลค่ามากกว่า 4,000 บาท และสามารถใช้งานได้ทันทีเป็น Fixed Asset</p>
                                            <p>*** ซื้อสินค้าโดยใช้เงินลงทุนต้องใส่ Progress Bit Y/N และ Asset Place เสมอ ***</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="border-r border-black px-1 align-bottom pb-0.5">
                                            <span className="mr-1 inline-block w-12 text-[9px]">Invoice No.</span><span className="text-blue-700">{form.invNo}</span>
                                        </td>
                                        <td className="border-r border-black px-1 align-bottom pb-0.5">
                                            <span className="mr-1">Sign:</span><span className="text-blue-700">{form.invSign}</span>
                                        </td>
                                        <td className="border-r border-black px-1 align-bottom pb-0.5">
                                            <span className="mr-1">Date:</span><span className="text-blue-700">{form.invDate}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Document ID (Outside Form) */}
                    <div className="mt-0 ml-1 text-[9px] font-bold text-slate-500 text-left">
                        FM-IT-011-04 (20/10/2022)
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseRequestForm;
