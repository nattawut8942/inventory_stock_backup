import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, X, Eye, Search, Calendar, Filter, Check, Building2, Upload, FileText, Loader2, RefreshCw, AlertTriangle, Phone, Trash2, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Portal from './Portal';
import ProductCombobox from './ProductCombobox';
import VendorCombobox from './VendorCombobox';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import AlertModal from './AlertModal';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Initialize PDF.js worker safely
try {
    if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
    }
} catch (e) {
    console.error('Failed to initialize PDF.js worker:', e);
}

const POFormModal = ({ isOpen, onClose, initialData, isEditMode, products, vendors, user, onSuccess }) => {
    const [activeTab, setActiveTab] = useState('manual');
    const [ocrFile, setOcrFile] = useState(null);
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrProgress, setOcrProgress] = useState({ step: '', percent: 0 });
    const [ocrDebugText, setOcrDebugText] = useState('');
    const [extractedFormData, setExtractedFormData] = useState(null);
    const lastProgressRef = useRef(0);

    const [newPO, setNewPO] = useState({
        PO_ID: '',
        VendorName: '',
        DueDate: '',
        RequestedBy: user?.name || '',
        Section: '',
        Remark: '',
        BudgetNo: '',
        PR_No: '',
        DeliveryTo: ''
    });
    const [poItems, setPoItems] = useState([{ ProductID: null, ItemName: '', QtyOrdered: 1, UnitCost: 0 }]);
    const [selectedVendor, setSelectedVendor] = useState({ VendorID: null, VendorName: '' });

    const sectionRef = useRef(null);

    // Internal Alert Modal State
    const [resultModal, setResultModal] = useState({
        isOpen: false,
        type: 'success',
        title: '',
        message: ''
    });

    useEffect(() => {
        if (isOpen) {
            if (isEditMode && initialData) {
                setNewPO({
                    PO_ID: initialData.PO_ID,
                    VendorName: initialData.VendorName,
                    DueDate: initialData.DueDate ? initialData.DueDate.split('T')[0] : '',
                    RequestedBy: initialData.RequestedBy,
                    Section: initialData.Section,
                    Remark: initialData.Remark,
                    BudgetNo: initialData.BudgetNo,
                    PR_No: initialData.PR_No || '',
                    DeliveryTo: initialData.DeliveryTo || ''
                });

                // Map items
                const items = initialData.Items.map(item => ({
                    ProductID: item.ProductID,
                    ItemName: item.ItemName,
                    QtyOrdered: item.QtyOrdered,
                    UnitCost: item.UnitCost
                }));
                setPoItems(items);

                // Set Vendor
                const foundVendor = vendors.find(v => v.VendorName === initialData.VendorName);
                if (foundVendor) {
                    setSelectedVendor(foundVendor);
                } else {
                    setSelectedVendor({ VendorID: null, VendorName: initialData.VendorName });
                }
                setActiveTab('manual');
            } else {
                // Create Mode
                setNewPO({
                    PO_ID: generatePONumber(),
                    VendorName: '',
                    DueDate: '',
                    RequestedBy: user?.name || '',
                    Section: '',
                    Remark: '',
                    BudgetNo: '',
                    PR_No: '',
                    DeliveryTo: ''
                });
                setPoItems([{ ProductID: null, ItemName: '', QtyOrdered: 1, UnitCost: 0 }]);
                setSelectedVendor({ VendorID: null, VendorName: '' });
                setActiveTab('manual');
                setOcrFile(null);
                setOcrProgress({ step: '', percent: 0 });
                setOcrDebugText('');
            }
        }
    }, [isOpen, isEditMode, initialData, user, vendors]);

    // Effect to populate form when switching to manual tab with extracted data
    useEffect(() => {
        if (activeTab === 'manual' && extractedFormData) {
            setNewPO(prev => ({
                ...prev,
                PO_ID: extractedFormData.poNum || prev.PO_ID,
                PR_No: extractedFormData.prNum || prev.PR_No,
                BudgetNo: extractedFormData.bgNum || prev.BudgetNo,
                Section: extractedFormData.section || prev.Section,
                DueDate: extractedFormData.dueDate || prev.DueDate,
                DeliveryTo: extractedFormData.deliveryTo || prev.DeliveryTo
            }));
            setExtractedFormData(null);
        }
    }, [activeTab, extractedFormData]);


    const generatePONumber = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `PO-${year}${month}-${rand}`;
    };

    const addItem = () => {
        setPoItems([...poItems, { ProductID: null, ItemName: '', QtyOrdered: 1, UnitCost: 0 }]);
    };

    const removeItem = (index) => {
        setPoItems(poItems.filter((_, i) => i !== index));
    };

    const updateItem = (index, field, value) => {
        const updated = [...poItems];
        updated[index][field] = value;
        setPoItems(updated);
    };

    const getTotalAmount = () => {
        return poItems.reduce((sum, item) => sum + (item.QtyOrdered * item.UnitCost), 0);
    };

    const pdfToImage = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const scale = 2.8;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        return canvas.toDataURL('image/png');
    };

    const fileToDataUrl = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    };

    const parseDaikinPO = (text) => {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const findWithRegex = (regex) => {
            const match = text.match(regex);
            return match ? match[1].trim() : "";
        };

        // 1. PO Number
        const poNum = findWithRegex(/[Pp][Oo]\s*[:\s]*\s*([A-Z0-9]+)/);

        // 2. Vendor Name
        let vendorName = "";

        // ค้นหาตำแหน่งบรรทัดที่มีคำว่า SUPPLIER หรือ VENDOR ก่อน
        const supplierLineIndex = lines.findIndex(l => l.toUpperCase().includes('SUPPLIER') || l.toUpperCase().includes('VENDOR'));

        if (supplierLineIndex !== -1) {
            // สำรวจจากบรรทัดถัดจาก SUPPLIER ลงมา (ดูสัก 5 บรรทัด)
            for (let i = 1; i <= 5; i++) {
                let currentLine = lines[supplierLineIndex + i];
                if (!currentLine) break;

                // ถ้าเจอบรรทัดที่มีคำว่า CO.,LTD หรือคล้ายๆ กัน ให้หยิบมาแล้วหยุดเลย
                const matchSuffix = currentLine.match(/(.*?)(CO\.,\s*LTD\.?|COMPANY LIMITED|LTD\.?|CORPORATION)/i);
                if (matchSuffix) {
                    // matchSuffix[1] คือข้อความข้างหน้า (เช่น SAMAPHAN TECHNOLOGIES )
                    // matchSuffix[2] คือคำลงท้าย (เช่น CO.,LTD.)
                    vendorName = (matchSuffix[1] + matchSuffix[2]).trim();
                    break;
                }
            }

            // Fallback กรณีใน 5 บรรทัดนั้นไม่มีคำว่า CO.,LTD เลย ให้ดึงจากบรรทัดที่ 2 รองจากบรรทัด SUPPLIER มาใช้งาน
            if (!vendorName) {
                let line2 = lines[supplierLineIndex + 2] || "";
                let line1 = lines[supplierLineIndex + 1] || "";

                if (line2 && !line2.toUpperCase().includes('ISSUE')) {
                    vendorName = line2.split(/Issue Date|Print Date|PO:/i)[0].trim();
                } else if (line1) {
                    vendorName = line1.split(/Issue Date|Print Date|PO:/i)[0].trim();
                }
            }
        }

        // 3. PR and BG
        let prNum = "";
        let bgNum = "";
        const itemRegex = /(\d+)\s+(.+?)\s+(\d{2}[/.-]\d{2}[/.-]\d{2,4})\s+([\d,.]+)\s+(\w+)\s+([\d,.]+)\s+([\d,.]+)$/;

        let lastItemIndex = -1;
        const newItems = [];
        let firstDueDate = "";

        lines.forEach((line, index) => {
            const match = line.match(itemRegex);
            if (match) {
                // Convert DD/MM/YYYY to YYYY-MM-DD for firstDueDate
                if (!firstDueDate && match[3]) {
                    const parts = match[3].split(/[/.-]/);
                    if (parts.length === 3) {
                        const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
                        firstDueDate = `${y}-${parts[1]}-${parts[0]}`;
                    }
                }

                // Fix Qty Parsing: Remove commas, then parse float, then round to integer
                const qtyRaw = match[4].replace(/,/g, '');
                const qty = Math.round(parseFloat(qtyRaw)) || 1;

                // Fix Price Parsing: Remove commas, keep decimals
                const priceRaw = match[6].replace(/,/g, '');
                const price = parseFloat(priceRaw) || 0;

                newItems.push({
                    ProductID: null,
                    ItemName: match[2].trim(),
                    QtyOrdered: qty,
                    UnitCost: price
                });
                lastItemIndex = index;
            }
        });

        if (lastItemIndex !== -1) {
            for (let i = 1; i <= 10; i++) {
                const searchLine = lines[lastItemIndex + i] || "";
                if (!prNum) {
                    const prMatch = searchLine.match(/PR\s*[:\s]*\s*([A-Z0-9]+)/i);
                    if (prMatch) prNum = prMatch[1];
                }
                if (!bgNum) {
                    const bgMatch = searchLine.match(/B\/G\s?NO\s*[:\s]*\s*([A-Z0-9]+)/i);
                    if (bgMatch) {
                        let rawBg = bgMatch[1].trim();

                        // Fix BudgetNo Logic: 
                        // If length is 7 and matches NNDDNNN roughly, force chars at index 2,3 to be letters
                        if (rawBg.length === 7 && /^\d{2}.{2}\d{3}$/.test(rawBg)) {
                            const chars = rawBg.split('');
                            const numToChar = {
                                '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A',
                                '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'P'
                            };

                            // Fix index 2 (3rd char)
                            if (/[0-9]/.test(chars[2])) chars[2] = numToChar[chars[2]] || chars[2];

                            // Fix index 3 (4th char)
                            if (/[0-9]/.test(chars[3])) chars[3] = numToChar[chars[3]] || chars[3];

                            bgNum = chars.join('').toUpperCase();
                        } else {
                            bgNum = rawBg;
                        }
                    }
                }
            }
        }

        // 4. Section (Who)
        let section = "";

        // Find line starting with "Who:" or "Who " (case insensitive)
        const whoIndex = lines.findIndex(l => l.match(/^[Ww]ho\s*[:]/i));

        if (whoIndex !== -1) {
            // Check current line for value
            const line = lines[whoIndex];
            const match = line.match(/^[Ww]ho\s*[:]\s*(.+)/i);
            if (match && match[1].trim().length > 1) {
                section = match[1].trim();
            } else if (lines[whoIndex + 1]) {
                // If value empty, take next line
                section = lines[whoIndex + 1];
            }
        }

        // 5. Delivery To (PR Opener) - English only, format: firstname.x or similar
        let deliveryTo = "";
        // Try strict format first: "Delivery To: natthawut.t"
        const deliveryMatch = text.match(/Delivery\s*To\s*[:\s]*\s*([a-zA-Z]+(?:\.[a-zA-Z]+)?)/i);
        if (deliveryMatch) {
            deliveryTo = deliveryMatch[1].trim().toUpperCase();
        }

        console.log('Parsed Section (Strict Who):', section);
        console.log('Parsed DeliveryTo:', deliveryTo);

        return { poNum, vendorName, prNum, bgNum, section, firstDueDate, deliveryTo, items: newItems };
    };

    const handleOCRExtract = async () => {
        if (!ocrFile) return;
        setOcrLoading(true);
        setOcrProgress({ step: 'Initializing...', percent: 0 });
        lastProgressRef.current = 0;
        setOcrDebugText('');

        try {
            let imgSource;
            if (ocrFile.type === 'application/pdf') {
                setOcrProgress({ step: 'Rendering PDF...', percent: 10 });
                imgSource = await pdfToImage(ocrFile);
            } else {
                imgSource = await fileToDataUrl(ocrFile);
            }

            setOcrProgress({ step: 'Loading OCR engine...', percent: 25 });
            const worker = await Tesseract.createWorker('eng', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const p = 30 + (m.progress * 60);
                        if (p - lastProgressRef.current >= 10 || p >= 90) { // Throttle: Update only every 10%
                            lastProgressRef.current = p;
                            setOcrProgress({ step: 'Recognizing text...', percent: p });
                        }
                    }
                }
            });

            const { data: { text } } = await worker.recognize(imgSource);
            setOcrDebugText(text);

            setOcrProgress({ step: 'Parsing data...', percent: 95 });

            // Parse and set state
            console.log('OCR Raw Text:', text);
            const result = parseDaikinPO(text);
            console.log('OCR Parsed Result:', result);

            if (result.vendorName) {
                const foundVendor = vendors.find(v => v.VendorName.toLowerCase().includes(result.vendorName.toLowerCase()));
                setSelectedVendor({
                    VendorID: foundVendor?.VendorID || null,
                    VendorName: result.vendorName
                });
            }

            if (result.items.length > 0) {
                // Try to auto-link items with Master Products
                const linkedItems = result.items.map(item => {
                    const found = products.find(p =>
                        p.ProductName.toLowerCase().trim() === item.ItemName.toLowerCase().trim()
                    );
                    if (found) {
                        return {
                            ...item,
                            ProductID: found.ProductID,
                            ItemName: found.ProductName, // Standardize name to Master
                            UnitCost: item.UnitCost || found.UnitCost || 0 // Prefer PO cost, fallback to Master
                        };
                    }
                    return item;
                });
                setPoItems(linkedItems);
            }

            // Store form data for the Effect to pick up
            setExtractedFormData({
                poNum: result.poNum,
                prNum: result.prNum,
                bgNum: result.bgNum,
                section: result.section,
                dueDate: result.firstDueDate,
                deliveryTo: result.deliveryTo
            });

            setOcrProgress({ step: 'Complete!', percent: 100 });
            await worker.terminate();

            // Switch to manual tab
            setTimeout(() => {
                setActiveTab('manual');
                setOcrLoading(false);
            }, 500);

        } catch (err) {
            console.error(err);
            setOcrDebugText(`Error: ${err.message}`);
            setOcrLoading(false);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        // Validation - Require PO, Vendor, Budget, and PR No
        if (!newPO.PO_ID || !selectedVendor.VendorName || !newPO.BudgetNo) {
            setResultModal({
                isOpen: true,
                type: 'error',
                title: 'ข้อมูลไม่ครบถ้วน',
                message: 'กรุณาระบุ PO Number, Vendor และ Budget No. ให้ครบถ้วน'
            });
            return;
        }

        // Validate Items
        if (poItems.length === 0) {
            setResultModal({
                isOpen: true,
                type: 'error',
                title: 'ไม่พบรายการสินค้า',
                message: 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ'
            });
            return;
        }

        // Validate Vendor - Must match a valid vendor from list
        const validVendor = vendors.find(v => v.VendorName === newPO.VendorName);
        if (!validVendor && newPO.VendorName.trim() !== '') {
            setResultModal({
                isOpen: true,
                type: 'error',
                title: 'ข้อมูลผู้ขายไม่ถูกต้อง',
                message: 'กรุณาเลือกผู้ขายจากรายการที่มีอยู่ หรือเพิ่มผู้ขายใหม่ในหน้า Management'
            });
            return;
        }

        await onSuccess({ ...newPO, VendorName: selectedVendor.VendorName, Items: poItems });
    };

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm">
                <div className="flex min-h-[100dvh] items-center justify-center p-2 md:p-4">
                    <div className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all animate-in zoom-in-95 my-8">
                        <div className="bg-slate-50 rounded-t-2xl border-b border-slate-200">
                            <div className="p-4 md:p-5 flex justify-between items-center">
                                <h3 className="font-bold text-base text-slate-800">{isEditMode ? 'แก้ไขใบสั่งซื้อ' : 'สร้างใบสั่งซื้อ'}</h3>
                                <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>

                            {/* Tabs - Hide in Edit Mode */}
                            {!isEditMode && (
                                <div className="flex px-6 gap-4">
                                    <button
                                        onClick={() => setActiveTab('manual')}
                                        className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'manual' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <span className="flex items-center gap-2"><FileText size={16} /> กรอกข้อมูลเอง</span>
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('scan')}
                                        className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'scan' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <span className="flex items-center gap-2"><Upload size={16} /> สแกนเอกสาร (OCR)</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {activeTab === 'scan' ? (
                            <div className="p-8 min-h-[400px]">
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:bg-slate-50 transition-colors relative group">
                                    <input
                                        type="file"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        accept="application/pdf,image/*"
                                        onChange={(e) => setOcrFile(e.target.files[0])}
                                    />
                                    <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Upload size={32} />
                                    </div>
                                    <h4 className="font-bold text-slate-700 mb-1">
                                        {ocrFile ? ocrFile.name : 'คลิกหรือลาไฟล์มาวางที่นี่'}
                                    </h4>
                                    <p className="text-xs text-slate-400">รองรับไฟล์ PDF, JPG, PNG จากระบบ Daikin</p>
                                </div>

                                {ocrLoading && (
                                    <div className="mt-8 space-y-2">
                                        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
                                            <span>{ocrProgress.step}</span>
                                            <span>{Math.round(ocrProgress.percent)}%</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                                                style={{ width: `${ocrProgress.percent}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )}

                                <div className="mt-8 flex gap-3">
                                    <button
                                        onClick={handleOCRExtract}
                                        disabled={!ocrFile || ocrLoading}
                                        className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {ocrLoading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                                        เริ่มสแกนและสร้าง PO
                                    </button>
                                    <button
                                        onClick={() => {
                                            setOcrFile(null);
                                            setOcrDebugText('');
                                        }}
                                        className="px-4 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"
                                    >
                                        <RefreshCw size={20} />
                                    </button>
                                </div>

                                {ocrDebugText && (
                                    <div className="mt-6 p-4 bg-slate-900 rounded-xl overflow-hidden">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">OCR Debug Output</p>
                                        <div className="h-32 overflow-y-auto text-[10px] font-mono text-emerald-400 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-slate-700">
                                            {ocrDebugText}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <form onSubmit={handleFormSubmit} className="p-4 md:p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block tracking-wider">PO Number</label>
                                        <input
                                            name="PO_ID"
                                            value={newPO.PO_ID}
                                            onChange={(e) => setNewPO({ ...newPO, PO_ID: e.target.value })}
                                            disabled={isEditMode}
                                            className={`w-full border border-slate-200 p-2 md:p-2.5 text-sm rounded-lg outline-none focus:border-indigo-500 font-mono ${isEditMode ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block tracking-wider">Vendor Name</label>
                                        <VendorCombobox
                                            vendors={vendors}
                                            value={selectedVendor}
                                            onChange={(v) => {
                                                setSelectedVendor(v);
                                                setNewPO({ ...newPO, VendorName: v?.VendorName || '' });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block tracking-wider">Section</label>
                                        <input
                                            name="Section"
                                            value={newPO.Section}
                                            onChange={(e) => setNewPO({ ...newPO, Section: e.target.value })}
                                            ref={sectionRef}
                                            className="w-full bg-slate-50 border border-slate-200 p-2 md:p-2.5 text-sm rounded-lg outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block tracking-wider">Budget No.</label>
                                        <input
                                            name="BudgetNo"
                                            value={newPO.BudgetNo}
                                            onChange={(e) => setNewPO({ ...newPO, BudgetNo: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 p-2 md:p-2.5 text-sm rounded-lg outline-none focus:border-indigo-500"
                                            placeholder="ระบุเลขงบประมาณ"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block tracking-wider">PR No.</label>
                                        <input
                                            name="PR_No"
                                            value={newPO.PR_No}
                                            onChange={(e) => setNewPO({ ...newPO, PR_No: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 p-2 md:p-2.5 text-sm rounded-lg outline-none focus:border-indigo-500"
                                            placeholder="ระบุเลข PR"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block tracking-wider">Due Date</label>
                                        <input
                                            name="DueDate"
                                            type="date"
                                            value={newPO.DueDate}
                                            onChange={(e) => setNewPO({ ...newPO, DueDate: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 p-2 md:p-2.5 text-sm rounded-lg outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block tracking-wider">Requested By</label>
                                        <input
                                            name="RequestedBy"
                                            value={newPO.RequestedBy}
                                            onChange={(e) => setNewPO({ ...newPO, RequestedBy: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 p-2 md:p-2.5 text-sm rounded-lg outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block tracking-wider">คนเปิด PR (Delivery To)</label>
                                        <input
                                            name="DeliveryTo"
                                            value={newPO.DeliveryTo}
                                            onChange={(e) => setNewPO({ ...newPO, DeliveryTo: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 p-2 md:p-2.5 text-sm rounded-lg outline-none focus:border-indigo-500"
                                            placeholder="เช่น natthawut.t"
                                        />
                                    </div>
                                </div>


                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">รายการอุปกรณ์</label>
                                        <button type="button" onClick={addItem} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-xs font-bold px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors">
                                            <Plus size={14} /> เพิ่มรายการ
                                        </button>
                                    </div>
                                    {/* Header Row */}
                                    <div className="hidden sm:flex gap-2 items-center px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        <div className="flex-1">ชื่ออุปกรณ์</div>
                                        <div className="w-16 text-center">จำนวน</div>
                                        <div className="w-24 text-right">ราคา/หน่วย</div>
                                        <div className="w-6"></div>
                                    </div>
                                    <div className="space-y-2 relative z-[100]">
                                        {poItems.map((item, index) => (
                                            <div key={index} className="flex flex-col sm:flex-row gap-2 sm:items-center bg-slate-50/50 p-2 rounded-lg border border-slate-200 relative">
                                                <div className="flex-1 w-full">
                                                    <div className="sm:hidden text-[10px] font-bold text-slate-400 mb-1 uppercase">ชื่ออุปกรณ์</div>
                                                    <ProductCombobox
                                                        products={products}
                                                        value={{ ProductID: item.ProductID, ItemName: item.ItemName }}
                                                        onChange={({ ProductID, ItemName, LastPrice }) => {
                                                            const updated = [...poItems];
                                                            updated[index].ProductID = ProductID;
                                                            updated[index].ItemName = ItemName;
                                                            // Auto-fill price from master (only if coming from master)
                                                            if (ProductID && LastPrice !== undefined) {
                                                                updated[index].UnitCost = LastPrice;
                                                            }
                                                            setPoItems(updated);
                                                        }}
                                                    />
                                                    {/* New Item Warning */}
                                                    {item.ItemName && !item.ProductID && (
                                                        <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-md border border-amber-100 animate-in fade-in slide-in-from-top-1">
                                                            <AlertTriangle size={12} />
                                                            <span>อุปกรณ์ใหม่ (ไม่อยู่ในระบบ)</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 items-end sm:items-center w-full sm:w-auto">
                                                    <div className="flex-1 sm:flex-none">
                                                        <div className="sm:hidden text-[10px] font-bold text-slate-400 mb-1 uppercase">จำนวน</div>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={item.QtyOrdered}
                                                            onChange={(e) => updateItem(index, 'QtyOrdered', parseInt(e.target.value) || 1)}
                                                            className="w-full sm:w-20 bg-white border border-slate-200 p-2 rounded-lg text-sm text-center outline-none focus:border-indigo-500"
                                                        />
                                                    </div>
                                                    <div className="flex-1 sm:flex-none">
                                                        <div className="sm:hidden text-[10px] font-bold text-slate-400 mb-1 uppercase">ราคา</div>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            placeholder="ราคา"
                                                            value={item.UnitCost}
                                                            onChange={(e) => updateItem(index, 'UnitCost', parseFloat(e.target.value) || 0)}
                                                            className="w-full sm:w-24 bg-white border border-slate-200 p-2 rounded-lg text-sm text-right outline-none focus:border-indigo-500"
                                                        />
                                                    </div>
                                                    {poItems.length > 1 && (
                                                        <button type="button" onClick={() => removeItem(index)} className="sm:ml-1 text-red-400 hover:text-red-500 p-2 sm:p-1 bg-red-50 sm:bg-transparent rounded-lg sm:rounded-none h-[38px] w-[38px] sm:h-auto sm:w-auto flex items-center justify-center">
                                                            <X size={18} className="sm:w-4 sm:h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-right text-sm font-bold text-indigo-600 mt-2">ยอดรวม: ฿{getTotalAmount().toLocaleString()}</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block tracking-wider">Remark</label>
                                    <textarea
                                        name="Remark"
                                        rows="2"
                                        value={newPO.Remark}
                                        onChange={(e) => setNewPO({ ...newPO, Remark: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 p-2 md:p-2.5 text-sm rounded-lg outline-none focus:border-indigo-500 resize-none min-h-[60px]"
                                        placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                                    ></textarea>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-200 transition-all">
                                        ยกเลิก
                                    </button>
                                    <button type="submit" className="flex-[2] bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200">
                                        {isEditMode ? 'บันทึกการแก้ไข' : 'สร้างใบสั่งซื้อ'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
            <AlertModal
                isOpen={resultModal.isOpen}
                onConfirm={() => {
                    if (resultModal.onConfirm) {
                        resultModal.onConfirm();
                    } else {
                        setResultModal({ ...resultModal, isOpen: false });
                    }
                }}
                onCancel={resultModal.type === 'danger' || resultModal.type === 'confirm' ? () => setResultModal({ ...resultModal, isOpen: false }) : undefined}
                type={resultModal.type}
                title={resultModal.title}
                message={resultModal.message}
                confirmText={resultModal.confirmText || "ตกลง "}
                cancelText={resultModal.cancelText || "ยกเลิก"}
            />
        </Portal>
    );
};

export default POFormModal;
