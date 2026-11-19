import React, { useEffect, useState } from 'react';
import { X, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import Portal from '../Portal';
import AlertModal from '../AlertModal';

// เติมข้อมูล IP จาก PC / MO Inventory — แสดงผลก่อนแล้วค่อยยืนยัน (เติมเฉพาะช่องว่าง)
const FIELD_LABEL = {
  mac_address: 'MAC', device: 'อุปกรณ์', serial_number: 'Serial', asset_tag: 'Fix Asset',
  location: 'สถานที่', contact: 'ผู้รับผิดชอบ', hostname: 'ชื่อเครื่อง',
};

export default function PCMOSyncModal({ api, authHeaders, onClose, onDone, showToast }) {
    const [plan, setPlan] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState('fills');

    const load = async () => {
        setLoading(true); setErr('');
        try {
            const r = await fetch(`${api}/sync/preview`, { headers: authHeaders() });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
            setPlan(await r.json());
        } catch (e) { setErr(e.message); }
        setLoading(false);
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const [askApply, setAskApply] = useState(false);
    const apply = () => { if (plan) setAskApply(true); };

    const doApply = async () => {
        setAskApply(false);
        setBusy(true);
        try {
            const r = await fetch(`${api}/sync/apply`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({}) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.success) throw new Error(d.error || `HTTP ${r.status}`);
            showToast?.(`✓ เติมข้อมูล ${d.applied} IP (${d.fieldChanges} ช่อง)`, 'success');
            onDone?.();
            onClose();
        } catch (e) {
            showToast?.(`❌ ${e.message}`, 'error');
        }
        setBusy(false);
    };

    const TabBtn = ({ id, label, n, tone }) => (
        <button onClick={() => setTab(id)} className={`px-3 h-8 rounded-lg text-xs font-bold border ${tab === id ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            {label} <span className={`ml-1 px-1.5 rounded ${tone}`}>{n}</span>
        </button>
    );

    return (
        <Portal>
        <AlertModal
          isOpen={askApply}
          type="confirm"
          title={plan ? `เติมข้อมูลให้ ${plan.counts.fills} IP?` : ''}
          message={plan ? `${plan.counts.fieldChanges} ช่อง · เติมช่องที่ว่าง และเปลี่ยนชื่อเครื่องให้ตรงกับ PC/MO (ค่า MAC ที่ขัดกันจะไม่ถูกแก้) ทุกการเปลี่ยนจะบันทึกลงประวัติ` : ''}
          confirmText="เติมข้อมูล"
          cancelText="ยกเลิก"
          onConfirm={doApply}
          onCancel={() => setAskApply(false)}
        />
        <div className="fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4" onClick={busy ? undefined : onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Layers size={17} /></span>
                        <div>
                            <h3 className="font-black text-slate-800">เติมข้อมูล IP จาก PC / MO</h3>
                            <p className="text-xs text-slate-500">จับคู่ด้วย IP · เติมช่องที่ว่าง · ชื่อเครื่องยึดตาม PC/MO (realtime)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={load} disabled={loading || busy} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400" title="โหลดใหม่"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
                        <button onClick={onClose} disabled={busy} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
                    </div>
                </div>

                <div className="p-5 overflow-y-auto space-y-4">
                    {loading && !plan && <div className="py-16 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={22} />กำลังคำนวณ…</div>}
                    {err && <p className="text-sm text-red-600">{err}</p>}

                    {plan && (<>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-[11px] text-emerald-700 font-semibold">จะเติม</div><div className="text-2xl font-black text-emerald-700 tabular-nums">{plan.counts.fills}</div><div className="text-[11px] text-emerald-600">IP · {plan.counts.fieldChanges} ช่อง</div></div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="text-[11px] text-amber-700 font-semibold">ค่าขัดกัน</div><div className="text-2xl font-black text-amber-700 tabular-nums">{plan.counts.conflicts}</div><div className="text-[11px] text-amber-600">ต้องตรวจเอง ไม่แตะ</div></div>
                            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3"><div className="text-[11px] text-orange-700 font-semibold">IP ซ้ำหลายเครื่อง</div><div className="text-2xl font-black text-orange-700 tabular-nums">{plan.counts.duplicateIps}</div><div className="text-[11px] text-orange-600">ข้ามทั้งหมด</div></div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] text-slate-600 font-semibold">ไม่พบใน IP Management</div><div className="text-2xl font-black text-slate-700 tabular-nums">{plan.counts.notInIpm}</div><div className="text-[11px] text-slate-500">ข้าม · ไม่รวมวง 10.49.24 / 10.49.25 ({plan.counts.excluded} IP)</div></div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <TabBtn id="fills" label="รายการที่จะเติม" n={plan.counts.fills} tone="bg-emerald-100 text-emerald-700" />
                            <TabBtn id="conflicts" label="ค่าขัดกัน" n={plan.counts.conflicts} tone="bg-amber-100 text-amber-700" />
                            <TabBtn id="dups" label="IP ซ้ำ" n={plan.counts.duplicateIps} tone="bg-orange-100 text-orange-700" />
                        </div>

                        {tab === 'fills' && (
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="max-h-80 overflow-auto">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-slate-50"><tr className="text-left text-slate-500"><th className="p-2.5">IP</th><th className="p-2.5">เครื่อง</th><th className="p-2.5">ช่องที่จะเติม</th></tr></thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {plan.fills.map(f => (
                                                <tr key={f.ip} className="hover:bg-slate-50 align-top">
                                                    <td className="p-2.5 font-mono font-bold text-indigo-600 whitespace-nowrap">{f.ip}</td>
                                                    <td className="p-2.5 whitespace-nowrap"><span className="font-mono">{f.hostname}</span> <span className="text-[10px] text-slate-400">{f.source}</span></td>
                                                    <td className="p-2.5">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {Object.entries(f.changes).map(([k, v]) => (
                                                                <span key={k} className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700"><b>{FIELD_LABEL[k] || k}:</b> {v.to}</span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {plan.fills.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-slate-400">ไม่มีข้อมูลที่ต้องเติม</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                                {plan.counts.fills > plan.fills.length && <p className="p-2 text-[11px] text-slate-400 bg-slate-50">แสดง {plan.fills.length} จาก {plan.counts.fills} รายการ (ทั้งหมดจะถูกเติมเมื่อยืนยัน)</p>}
                            </div>
                        )}

                        {tab === 'conflicts' && (
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="max-h-80 overflow-auto">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-slate-50"><tr className="text-left text-slate-500"><th className="p-2.5">IP</th><th className="p-2.5">ช่อง</th><th className="p-2.5">ใน IP Management</th><th className="p-2.5">จาก PC/MO</th><th className="p-2.5">เครื่อง</th></tr></thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {plan.conflicts.map((c, i) => (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="p-2.5 font-mono">{c.ip}</td>
                                                    <td className="p-2.5">{FIELD_LABEL[c.field] || c.field}</td>
                                                    <td className="p-2.5 font-mono text-slate-600">{c.current}</td>
                                                    <td className="p-2.5 font-mono text-amber-700">{c.incoming}</td>
                                                    <td className="p-2.5 font-mono">{c.hostname} <span className="text-[10px] text-slate-400">{c.source}</span></td>
                                                </tr>
                                            ))}
                                            {plan.conflicts.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400 flex-col"><CheckCircle2 className="mx-auto text-emerald-500 mb-1" size={18} />ไม่มีค่าขัดกัน</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="p-2 text-[11px] text-slate-400 bg-slate-50 flex items-center gap-1"><AlertTriangle size={12} />MAC ที่ขัดกันจะไม่ถูกเปลี่ยนโดยการเติม ต้องตรวจเอง</p>
                            </div>
                        )}

                        {tab === 'dups' && (
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="max-h-80 overflow-auto">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-slate-50"><tr className="text-left text-slate-500"><th className="p-2.5">IP</th><th className="p-2.5">เครื่องที่ใช้ IP นี้</th></tr></thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {plan.duplicates.map(d => (
                                                <tr key={d.ip} className="hover:bg-slate-50">
                                                    <td className="p-2.5 font-mono font-bold text-orange-700 whitespace-nowrap">{d.ip}</td>
                                                    <td className="p-2.5">{d.machines.join(' · ')}</td>
                                                </tr>
                                            ))}
                                            {plan.duplicates.length === 0 && <tr><td colSpan={2} className="p-6 text-center text-slate-400">ไม่มี IP ซ้ำ</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>)}
                </div>

                <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">{plan ? `ข้อมูล PC/MO ${plan.totals.sourceRows} แถว · ${plan.totals.distinctIps} IP` : ''}</span>
                    <div className="flex gap-2">
                        <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50">ปิด</button>
                        <button onClick={apply} disabled={busy || !plan || plan.counts.fills === 0}
                            className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-2">
                            {busy && <Loader2 className="animate-spin" size={14} />}เติมข้อมูล {plan ? plan.counts.fills : ''} IP
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </Portal>
    );
}
