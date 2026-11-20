import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import Portal from './Portal';
import { API_BASE } from '../config/api';
import { getChartColor } from '../utils/styleHelpers';
import { MANAGEMENT_TYPES, managementTypeInfo, managementTypeOf } from '../utils/stockManagement';
import { MgmtSection, MgmtTable, RowActions } from './management/MgmtTable';
import ManagementTypeHelp from './ManagementTypeHelp';

// แท็บ Management > Device Types: ตั้งค่าเริ่มต้น "ประเภทการจัดการ" ของแต่ละหมวด
// - ค่าเริ่มต้นใช้กับอุปกรณ์ใหม่ที่สร้างในหมวดนี้
// - ติ๊ก "เปลี่ยนอุปกรณ์ที่มีอยู่" เพื่อจัดประเภทอุปกรณ์เดิมทั้งหมวดในครั้งเดียว (ปรับรายชิ้นต่อได้ในหน้าคลัง)
export default function DeviceTypeManagementTab({ deviceTypes, products, canEdit, searchTerm, onSearch, onSaved, onAlert }) {
    const [editing, setEditing] = useState(null);
    const [mgmt, setMgmt] = useState('Rotating');
    const [applyAll, setApplyAll] = useState(false);
    const [saving, setSaving] = useState(false);

    // จำนวนอุปกรณ์ในแต่ละหมวด แยกตามประเภทการจัดการ
    const counts = useMemo(() => {
        const m = {};
        for (const p of products || []) {
            const c = (m[p.DeviceType] = m[p.DeviceType] || { total: 0, Rotating: 0, Spare: 0, Stored: 0 });
            c.total += 1;
            c[managementTypeOf(p)] += 1;
        }
        return m;
    }, [products]);


    const openEdit = (t) => { setEditing(t); setMgmt(t.DefaultManagementType || 'Rotating'); setApplyAll(false); };

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/types/${encodeURIComponent(editing.TypeId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Label: editing.Label, DefaultManagementType: mgmt, ApplyToProducts: applyAll }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
            setEditing(null);
            await onSaved?.();
            onAlert?.({
                type: 'success', title: 'บันทึกแล้ว',
                message: applyAll ? `ตั้งค่าเริ่มต้นแล้ว และเปลี่ยนอุปกรณ์เดิม ${data.productsUpdated ?? 0} รายการ` : 'ตั้งค่าเริ่มต้นสำหรับอุปกรณ์ใหม่ในหมวดนี้แล้ว',
            });
        } catch (err) {
            onAlert?.({ type: 'error', title: 'ผิดพลาด', message: err.message });
        } finally {
            setSaving(false);
        }
    };

    const editCount = editing ? counts[editing.TypeId] : null;
    const willChange = editing && editCount ? editCount.total - (editCount[mgmt] || 0) : 0;

    return (
        <MgmtSection
            title="หมวดอุปกรณ์" count={(deviceTypes || []).length} titleExtra={<ManagementTypeHelp />}
            subtitle="ค่าเริ่มต้นการจัดการสต็อกของแต่ละหมวด ใช้กับอุปกรณ์ใหม่ในหมวด · กด ? เพื่อดูความหมายของแต่ละประเภท"
        >
            <MgmtTable
                search={searchTerm || ''} onSearch={onSearch}
                rows={deviceTypes || []} rowKey={(t) => t.TypeId} minWidth={640}
                searchText={(t) => `${t.TypeId} ${t.Label}`} searchPlaceholder="ค้นหาหมวดอุปกรณ์…" emptyText="ยังไม่มีหมวดอุปกรณ์"
                columns={[
                    { key: 'type', label: 'หมวด', primary: true, sortValue: (t) => t.Label, render: (t) => (
                        <span className="inline-flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold text-white" style={{ backgroundColor: getChartColor(t.TypeId) }}>{t.TypeId}</span>
                            <span className="font-bold text-slate-700">{t.Label}</span>
                        </span>
                    ) },
                    { key: 'mgmt', label: 'ค่าเริ่มต้นการจัดการ', sortValue: (t) => managementTypeInfo(t.DefaultManagementType || 'Rotating').label, render: (t) => {
                        const info = managementTypeInfo(t.DefaultManagementType || 'Rotating');
                        return <span className={`px-2.5 py-1 rounded-full border text-xs font-bold whitespace-nowrap ${info.cls}`}>{info.label}</span>;
                    } },
                    { key: 'count', label: 'อุปกรณ์ในหมวด', sortValue: (t) => (counts[t.TypeId] || {}).total || 0, render: (t) => {
                        const c = counts[t.TypeId] || { total: 0, Rotating: 0, Spare: 0, Stored: 0 };
                        return (
                            <span className="text-xs text-slate-500">
                                <b className="text-slate-700">{c.total}</b> รายการ
                                {c.total > 0 && <span className="ml-1">(หมุนเวียน {c.Rotating} · สำรอง {c.Spare} · เก็บ {c.Stored})</span>}
                            </span>
                        );
                    } },
                    { key: 'act', label: 'จัดการ', actions: true, render: (t) => <RowActions onEdit={canEdit ? () => openEdit(t) : undefined} editLabel={`แก้ไข ${t.Label}`} /> },
                ]}
            />

            {editing && (
                <Portal>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                            <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-start">
                                <div>
                                    <h3 className="font-black text-xl">การจัดการสต็อก</h3>
                                    <p className="text-white/80 text-xs mt-0.5">หมวด {editing.Label} ({editing.TypeId})</p>
                                </div>
                                <button onClick={() => setEditing(null)} aria-label="ปิด" className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
                            </div>
                            <form onSubmit={save} className="p-5 space-y-4">
                                <div className="space-y-2" role="radiogroup" aria-label="ค่าเริ่มต้นการจัดการ">
                                    {MANAGEMENT_TYPES.map((t) => (
                                        <label key={t.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${mgmt === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                            <input type="radio" name="mgmt" value={t.id} checked={mgmt === t.id} onChange={() => setMgmt(t.id)} className="mt-1 accent-indigo-600" />
                                            <span>
                                                <span className="block text-sm font-bold text-slate-800">{t.label}</span>
                                                <span className="block text-xs text-slate-500">{t.hint}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                                    <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="mt-1 accent-indigo-600" />
                                    <span>
                                        เปลี่ยนอุปกรณ์ที่มีอยู่ในหมวดนี้ทั้งหมดเป็นค่านี้ด้วย
                                        <span className="block text-xs text-slate-500">{willChange > 0 ? `จะเปลี่ยน ${willChange} รายการ (จากทั้งหมด ${editCount.total})` : 'ไม่มีรายการที่ต้องเปลี่ยน'} — ไม่ติ๊ก = ใช้กับอุปกรณ์ใหม่เท่านั้น</span>
                                    </span>
                                </label>
                                <div className="flex gap-3 pt-1">
                                    <button type="button" onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-lg border border-slate-200 font-bold text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                                    <button type="submit" disabled={saving} className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2.5 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                </Portal>
            )}
        </MgmtSection>
    );
}
