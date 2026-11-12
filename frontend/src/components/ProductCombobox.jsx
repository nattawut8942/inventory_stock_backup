import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

/**
 * ProductCombobox - ช่องชื่ออุปกรณ์ในแถว PO
 * เลือกอุปกรณ์จาก ProductPickerPanel (ด้านซ้าย) หรือพิมพ์เป็นอุปกรณ์ใหม่ได้
 * @param {Object} value - { ProductID: number|null, ItemName: string }
 * @param {Function} onChange - เรียกด้วย { ProductID, ItemName }
 * @param {Function} onActivate - เรียกเมื่อโฟกัส เพื่อบอกว่าแถวนี้คือแถวที่กำลังเลือก
 * @param {boolean} isActive - แถวนี้ถูกเลือกอยู่หรือไม่ (ไฮไลต์)
 */
const ProductCombobox = ({ value = {}, onChange, onActivate, isActive = false }) => {
    const [text, setText] = useState(value.ItemName || '');

    // Sync เมื่อค่าถูกเปลี่ยนจากภายนอก (เลือกจาก panel / OCR)
    useEffect(() => {
        setText(value.ItemName || '');
    }, [value.ItemName]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setText(val);
        // พิมพ์เอง = อุปกรณ์ใหม่ (จนกว่าจะเลือกจาก Master)
        onChange({ ProductID: null, ItemName: val });
    };

    return (
        <div className="relative">
            <input
                type="text"
                value={text}
                onFocus={() => onActivate && onActivate()}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                    // กัน Enter ส่งฟอร์มโดยไม่ตั้งใจ
                    if (e.key === 'Enter') e.preventDefault();
                }}
                placeholder="เลือกจากรายการซ้าย หรือพิมพ์ชื่อใหม่..."
                className={`w-full bg-white border p-2.5 pr-8 rounded-lg text-sm outline-none transition-all ${value.ProductID
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 focus:border-indigo-500'
                    } ${isActive ? 'ring-2 ring-indigo-300' : ''}`}
            />
            {value.ProductID && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Check size={16} className="text-emerald-600" />
                </div>
            )}
        </div>
    );
};

export default ProductCombobox;
