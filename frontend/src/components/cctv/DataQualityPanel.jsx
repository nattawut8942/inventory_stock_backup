import { useState } from 'react';
import { ChevronDown, CheckCircle2, AlertTriangle, Server } from 'lucide-react';

// ── แผงข้อมูลที่ต้องแก้ + โหลดของ Record Server ─────────────────────────
// ไม่มี API ใหม่: คำนวณจากรายการกล้องที่โหลดอยู่แล้ว
const RECORD_LOAD_WARN = 50; // เกณฑ์เตือนจำนวนกล้องต่อเครื่อง (ตั้งเองเพราะระบบยังไม่มีค่าความจุ)

const TONE = {
    red:   { dot: 'bg-red-500',   text: 'text-red-700',   pill: 'bg-red-50 text-red-700' },
    amber: { dot: 'bg-amber-500', text: 'text-amber-700', pill: 'bg-amber-50 text-amber-700' },
    slate: { dot: 'bg-slate-400', text: 'text-slate-600', pill: 'bg-slate-100 text-slate-600' },
};

export function DataQualityPanel({ cameras, loadCameras, recordServers, label }) {
    const [open, setOpen] = useState(null);
    const [showDone, setShowDone] = useState(false);
    const active = cameras.filter(c => c.status !== 'removed' && c.status !== 'retired');
    const ipCount = {};
    cameras.forEach(c => { if (c.ip_address) ipCount[c.ip_address] = (ipCount[c.ip_address] || 0) + 1; });

    const issues = [
        { key: 'ip', label: 'ไม่มี IP', tone: 'red', list: cameras.filter(c => !c.ip_address) },
        { key: 'dup', label: 'IP ซ้ำกับกล้องอื่น', tone: 'red', list: cameras.filter(c => c.ip_address && ipCount[c.ip_address] > 1) },
        { key: 'loc', label: 'ยังไม่มีตำแหน่งบนแผนที่', tone: 'amber', list: cameras.filter(c => c.location_x == null) },
        { key: 'fov', label: 'ยังไม่ตั้งทิศทาง FOV', tone: 'amber', list: active.filter(c => c.location_x != null && !c.fov_direction) },
        { key: 'snap', label: 'ไม่มีภาพ snapshot', tone: 'amber', list: active.filter(c => !c.snapshot_url) },
        { key: 'asset', label: 'ไม่มี Fix Asset', tone: 'amber', list: active.filter(c => !c.fix_asset) },
        { key: 'rack', label: 'ยังไม่ได้ผูก Rack', tone: 'slate', list: active.filter(c => !c.rack_id) },
    ];
    const todo = issues.filter(i => i.list.length > 0);
    const done = issues.filter(i => i.list.length === 0);

    const loads = recordServers.map(s => ({
        id: s.id, name: s.name, ip: s.ip_address,
        count: loadCameras.filter(c => c.server_record_id === s.id && c.status !== 'removed' && c.status !== 'retired').length,
    }));
    const maxLoad = Math.max(RECORD_LOAD_WARN, ...loads.map(l => l.count));

    const renderIssue = (i) => {
        const t = TONE[i.tone];
        const isOpen = open === i.key;
        return (
            <div key={i.key} className="rounded-lg border border-slate-200 overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : i.key)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${t.dot}`} />
                    <span className={`flex-1 text-sm font-medium ${t.text}`}>{i.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${t.pill}`}>{i.list.length} ตัว</span>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 max-h-48 overflow-y-auto">
                        {i.list.slice(0, 100).map(c => (
                            <div key={c.id} className="flex justify-between gap-3 py-0.5 text-xs text-slate-600">
                                <span className="truncate">{c.name}</span>
                                {c.ip_address && <span className="text-slate-400 tabular-nums shrink-0">{c.ip_address}</span>}
                            </div>
                        ))}
                        {i.list.length > 100 && <div className="text-xs text-slate-400 pt-1">…และอีก {i.list.length - 100} ตัว</div>}
                    </div>
                )}
            </div>
        );
    };

    const doneCount = done.length;
    const total = issues.length;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h4 className="font-bold text-slate-800 flex items-center gap-2">
                            <AlertTriangle size={15} className="text-amber-500" /> ข้อมูลที่ต้องแก้
                        </h4>
                        <p className="text-xs text-slate-500">{label}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-bold text-slate-800 tabular-nums">{doneCount}<span className="text-slate-400 text-sm">/{total}</span></div>
                        <div className="text-[11px] text-slate-500">หัวข้อที่ครบแล้ว</div>
                    </div>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-4">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / total) * 100}%` }} />
                </div>

                <div className="space-y-2">
                    {todo.length === 0 && (
                        <div className="flex items-center gap-2 text-sm text-emerald-700 py-2">
                            <CheckCircle2 size={16} /> ครบทุกหัวข้อแล้ว
                        </div>
                    )}
                    {todo.map(renderIssue)}
                </div>

                {done.length > 0 && (
                    <div className="mt-3">
                        <button onClick={() => setShowDone(v => !v)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                            <CheckCircle2 size={13} className="text-emerald-500" />
                            ครบแล้ว {done.length} หัวข้อ {showDone ? '(ซ่อน)' : '(แสดง)'}
                        </button>
                        {showDone && (
                            <ul className="mt-2 space-y-1 text-xs text-slate-500">
                                {done.map(i => <li key={i.key} className="pl-5">✓ {i.label}</li>)}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            <div>
                <div className="mb-3">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <Server size={15} className="text-teal-600" /> โหลด Record Server
                    </h4>
                    <p className="text-xs text-slate-500">จำนวนกล้องต่อเครื่อง</p>
                </div>
                {loads.length === 0 && <div className="text-sm text-slate-400">ยังไม่มีข้อมูล Record Server</div>}
                <div className="space-y-4">
                    {loads.map(l => {
                        const pct = Math.round((l.count / maxLoad) * 100);
                        const hot = l.count >= RECORD_LOAD_WARN;
                        return (
                            <div key={l.id}>
                                <div className="flex items-baseline justify-between gap-2 mb-1">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-slate-800 truncate">{l.name}</div>
                                        {l.ip && <div className="text-[11px] text-slate-400 tabular-nums">{l.ip}</div>}
                                    </div>
                                    <div className={`text-sm font-bold tabular-nums shrink-0 ${hot ? 'text-amber-600' : 'text-slate-700'}`}>
                                        {l.count} {hot && <span title={`เกิน ${RECORD_LOAD_WARN} ตัว`}>⚠️</span>}
                                    </div>
                                </div>
                                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div className={`h-full rounded-full ${hot ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className="text-[11px] text-slate-400 mt-4">เตือนเมื่อมีกล้องตั้งแต่ {RECORD_LOAD_WARN} ตัวต่อเครื่อง (ค่าเกณฑ์ตั้งในโค้ด)</p>
            </div>
        </div>
    );
}
