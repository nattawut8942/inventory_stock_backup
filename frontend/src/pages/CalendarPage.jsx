// ============================================================
//  CalendarPage.jsx  —  redesigned to match Dashboard style
//  Updated: เพิ่ม datetime-local input สำหรับ start/end
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin     from '@fullcalendar/daygrid';
import timeGridPlugin    from '@fullcalendar/timegrid';
import listPlugin        from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { motion, AnimatePresence } from 'motion/react';
import {
    Plus, X, Trash2, RefreshCw, Calendar,
    CalendarDays, Clock, Zap, Wrench, FolderKanban, CheckCircle2,
    ChevronRight, Send, User,
} from 'lucide-react';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';
import Portal from '../components/Portal';

// ─── Type config ───────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
    routine:     { bg: '#10b981', text: '#fff', light: '#f0fdf4', border: '#a7f3d0', icon: CheckCircle2,   label: 'งานประจำ',              gradient: 'from-emerald-500 to-teal-500'    },
    setup:       { bg: '#3b82f6', text: '#fff', light: '#eff6ff', border: '#bfdbfe', icon: Wrench,         label: 'ติดตั้ง/เตรียมเครื่อง', gradient: 'from-blue-500 to-indigo-500'     },
    maintenance: { bg: '#f59e0b', text: '#fff', light: '#fffbeb', border: '#fde68a', icon: Clock,           label: 'บำรุงรักษา (PM)',        gradient: 'from-amber-500 to-orange-500'    },
    urgent:      { bg: '#ef4444', text: '#fff', light: '#fef2f2', border: '#fecaca', icon: Zap,             label: 'งานด่วน',               gradient: 'from-red-500 to-rose-500'        },
    project:     { bg: '#8b5cf6', text: '#fff', light: '#f5f3ff', border: '#ddd6fe', icon: FolderKanban,   label: 'โปรเจค',               gradient: 'from-violet-500 to-purple-500'   },
};

const DAY_LABELS = [
    { key: 'mon', label: 'จ.' }, { key: 'tue', label: 'อ.' },
    { key: 'wed', label: 'พ.' }, { key: 'thu', label: 'พฤ.' },
    { key: 'fri', label: 'ศ.' }, { key: 'sat', label: 'ส.' },
    { key: 'sun', label: 'อา.' },
];

// ── Helper: วันนี้ + เวลาปัจจุบัน format "YYYY-MM-DDTHH:mm" ─────────────────
const nowDTLocal = () => {
    const d   = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ── Helper: แปลง date string (YYYY-MM-DD) → datetime-local (YYYY-MM-DDTHH:mm)
const dateToDateTime = (str) => {
    if (!str) return '';
    // ถ้ามีเวลาอยู่แล้ว ส่งกลับเลย
    if (str.includes('T')) return str.slice(0, 16);
    return `${str}T00:00`;
};

// ── Helper: format datetime สำหรับแสดงใน sidebar ──────────────────────────────
const fmtDateTimeShort = (str) => {
    if (!str) return '—';
    try {
        const d = new Date(str);
        if (isNaN(d.getTime())) return str;
        const pad = n => String(n).padStart(2, '0');
        const hasTime = str.includes('T') && !str.endsWith('T00:00');
        if (hasTime) {
            return `${d.getDate()}/${d.getMonth()+1} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        return `${d.getDate()}/${d.getMonth()+1}`;
    } catch { return str; }
};

const EMPTY_FORM = {
    task_id: null, task_title: '', start_date: '', end_date: '',
    task_type: 'routine', description: '', is_recurring: false,
    recur_days: [], range_days: 28, created_by: '',
};

// ─── Sub-components ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, gradient, title, action, onAction }) => (
    <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
                <Icon className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-bold text-slate-700 text-sm">{title}</h3>
        </div>
        {action && (
            <button onClick={onAction} className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 group">
                {action} <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
        )}
    </div>
);

// ─── CalendarPage ──────────────────────────────────────────────────────────────
export default function CalendarPage() {
    const { user }   = useAuth();
    const calRef     = useRef(null);

    const [taskTypes,     setTaskTypes]     = useState([]);
    const [upcoming,      setUpcoming]      = useState([]);
    const [activeFilters, setActiveFilters] = useState(Object.keys(TYPE_CONFIG));
    const [modal,         setModal]         = useState(false);
    const [form,          setForm]          = useState(EMPTY_FORM);
    const [saving,        setSaving]        = useState(false);
    const [confirmDel,    setConfirmDel]    = useState(false);
    const [toast,         setToast]         = useState(null);

    useEffect(() => { fetchTaskTypes(); fetchUpcoming(); }, []);

    const fetchTaskTypes = async () => {
        try {
            const r = await fetch(`${API_BASE}/calendar/task-types`);
            const d = await r.json();
            if (d.success) setTaskTypes(d.data);
        } catch (e) { console.error(e); }
    };

    const fetchUpcoming = async () => {
        try {
            const r = await fetch(`${API_BASE}/calendar/upcoming`);
            const d = await r.json();
            if (d.success) setUpcoming(d.data);
        } catch (e) { console.error(e); }
    };

    const fcEvents = useCallback(async (info, onSuccess, onFailure) => {
        try {
            const start = info.startStr.split('T')[0];
            const end   = info.endStr.split('T')[0];
            const r = await fetch(`${API_BASE}/calendar/tasks?start=${start}&end=${end}`);
            const d = await r.json();
            if (!d.success) return onFailure('fetch error');

            onSuccess(d.data
                .filter(t => activeFilters.includes(t.task_type))
                .map(t => {
                    const cfg = TYPE_CONFIG[t.task_type] || { bg: '#6b7280', text: '#fff' };

                    // ── ถ้ามีเวลา ให้ใช้ timed event, ถ้าไม่มีให้เป็น allDay ──
                    const startStr = t.start_date || '';
                    const hasTime  = startStr.includes('T') && !startStr.endsWith('T00:00');

                    let fcEnd = null;
                    if (t.end_date) {
                        const endStr    = t.end_date;
                        const hasEndTime = endStr.includes('T') && !endStr.endsWith('T00:00');
                        if (!hasEndTime && !hasTime) {
                            // allDay event: end ต้อง +1 วัน
                            const ed = new Date(endStr);
                            ed.setDate(ed.getDate() + 1);
                            fcEnd = ed.toISOString().split('T')[0];
                        } else {
                            fcEnd = endStr;
                        }
                    }

                    return {
                        id:              String(t.task_id),
                        title:           t.task_title,
                        start:           startStr,
                        end:             fcEnd,
                        allDay:          !hasTime,
                        backgroundColor: cfg.bg,
                        borderColor:     cfg.bg,
                        textColor:       cfg.text,
                        extendedProps: {
                            type:        t.task_type,
                            type_label:  t.type_label,
                            description: t.description,
                        },
                    };
                })
            );
        } catch (e) { onFailure(e.message); }
    }, [activeFilters]);

    useEffect(() => { calRef.current?.getApi().refetchEvents(); }, [activeFilters]);

    // ── เปิด modal เพิ่มงานใหม่ ───────────────────────────────────────────────
    const openAdd = (startStr = '', endStr = '') => {
        // FullCalendar ส่ง startStr มาเป็น "YYYY-MM-DD" หรือ "YYYY-MM-DDTHH:mm:ss"
        let start = startStr ? dateToDateTime(startStr.split('+')[0]) : nowDTLocal();
        let end   = '';
        if (endStr) {
            // allDay select: endStr เป็นวันถัดไป ต้องลบ 1 วัน
            const ed = new Date(endStr);
            if (!endStr.includes('T') || endStr.endsWith('T00:00:00')) {
                ed.setDate(ed.getDate() - 1);
            }
            const s = dateToDateTime(ed.toISOString());
            if (s.slice(0,10) !== start.slice(0,10)) end = s;
        }
        setForm({ ...EMPTY_FORM, start_date: start, end_date: end });
        setModal(true);
    };

    // ── เปิด modal แก้ไขงาน ──────────────────────────────────────────────────
const openEdit = async (id) => {
    try {
        console.log('fetching:', `${API_BASE}/calendar/tasks/${id}`);
        const r = await fetch(`${API_BASE}/calendar/tasks/${id}`);
        console.log('response status:', r.status);
        const d = await r.json();
        console.log('data:', d);
        if (!d.success) return;
        const t = d.data;
        console.log('t.start_date:', t.start_date);
console.log('dateToDateTime:', dateToDateTime(t.start_date || ''));
        setForm({
            task_id:      t.task_id,
            task_title:   t.task_title,
            start_date:   dateToDateTime(t.start_date || ''),
            end_date:     dateToDateTime(t.end_date   || ''),
            task_type:    t.task_type,
            description:  t.description || '',
            is_recurring: false,
            recur_days:   [],
            range_days:   28,
            created_by:   t.created_by || '',
        });
        
        setModal(true);
    } catch (e) { console.error(e); }
    
};

    const closeModal = () => { setModal(false); setConfirmDel(false); setForm(EMPTY_FORM); };

    const saveTask = async () => {
        if (!form.task_title.trim())  return showToast('กรุณาระบุชื่องาน', false);
        if (!form.start_date)         return showToast('กรุณาระบุวันที่/เวลาเริ่มต้น', false);
        if (form.end_date && form.end_date < form.start_date)
            return showToast('วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น', false);
        if (form.is_recurring && form.recur_days.length === 0)
            return showToast('กรุณาเลือกวันที่งานจะเกิดซ้ำ', false);

        setSaving(true);
        try {
            const isEdit = !!form.task_id;
            const r = await fetch(
                isEdit ? `${API_BASE}/calendar/tasks/${form.task_id}` : `${API_BASE}/calendar/tasks`,
                {
                    method:  isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        task_title:   form.task_title.trim(),
                        start_date:   form.start_date,
                        end_date:     form.end_date || null,
                        task_type:    form.task_type,
                        description:  form.description,
                        is_recurring: form.is_recurring,
                        recur_days:   form.recur_days,
                        range_days:   form.range_days,
                        ...(!isEdit && { created_by: user?.username || user?.name || 'system' }),
                    }),
                }
            );
            const data = await r.json();
            if (!data.success) throw new Error(data.error);
            showToast(data.message || (isEdit ? 'อัปเดตสำเร็จ' : 'สร้างงานสำเร็จ'), true);
            closeModal();
            calRef.current?.getApi().refetchEvents();
            fetchUpcoming();
        } catch (e) { showToast(e.message, false); }
        finally     { setSaving(false); }
    };

    const deleteTask = async () => {
        try {
            const r = await fetch(`${API_BASE}/calendar/tasks/${form.task_id}`, { method: 'DELETE' });
            const d = await r.json();
            if (!d.success) throw new Error(d.error);
            showToast('ลบงานสำเร็จ', true);
            closeModal();
            calRef.current?.getApi().refetchEvents();
            fetchUpcoming();
        } catch (e) { showToast(e.message, false); }
    };

    const handleEventDrop = async (info) => {
        const { event } = info;
        // FullCalendar ส่ง start/end เป็น Date object
        const pad  = n => String(n).padStart(2, '0');
        const toLocalDT = (d) => {
            if (!d) return null;
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        const start = toLocalDT(event.start);
        let   end   = null;
        if (event.end) {
            const ed = new Date(event.end);
            if (event.allDay) ed.setDate(ed.getDate() - 1);
            end = toLocalDT(ed);
        }

        try {
            const r = await fetch(`${API_BASE}/calendar/tasks/${event.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task_title:  event.title,
                    start_date:  start,
                    end_date:    end,
                    task_type:   event.extendedProps.type,
                    description: event.extendedProps.description,
                }),
            });
            const d = await r.json();
            if (!d.success) { info.revert(); showToast(d.error, false); }
            else fetchUpcoming();
        } catch (e) { info.revert(); }
    };

    const showToast = (msg, ok) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    const toggleFilter = (key) => setActiveFilters(prev =>
        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );

    // ── DateTimeInput component ────────────────────────────────────────────────
    const DateTimeInput = ({ label, value, onChange, disabled, required }) => (
        <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {label} {required && <span className="text-red-400">*</span>}
                {!required && <span className="text-slate-300">(ถ้ามี)</span>}
            </label>
            <input
                type="datetime-local"
                value={value}
                onChange={e => onChange(e.target.value)}
                disabled={disabled}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 disabled:opacity-40 transition-all"
            />
        </div>
    );

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">

            {/* Page Header */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-end justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                            <CalendarDays className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 tracking-tight">IT CALENDAR</h2>
                    </div>
                    <p className="text-slate-500 font-medium pl-[52px]">วางแผนและติดตามงาน IT ประจำวัน</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => openAdd()}
                    className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-200 transition-all"
                >
                    <Plus className="w-4 h-4" /> สร้างงานใหม่
                </motion.button>
            </motion.div>

            {/* Main Layout */}
            <div className="flex gap-6 -mx-4 sm:-mx-6 lg:-mx-8 px-0">

                {/* Sidebar */}
                <motion.aside initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                    className="w-64 shrink-0 flex flex-col gap-5 pl-4 sm:pl-6 lg:pl-8"
                    style={{ minHeight: 'calc(100vh - 180px)' }}>

                    {/* Filter card */}
                    <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100">
                        <SectionHeader icon={CalendarDays} gradient="from-indigo-500 to-violet-500" title="ประเภทงาน" />
                        <div className="space-y-2">
                            {taskTypes.map(t => {
                                const cfg    = TYPE_CONFIG[t.type_key] || { bg: '#6b7280', light: '#f9fafb', border: '#e5e7eb', icon: CalendarDays };
                                const active = activeFilters.includes(t.type_key);
                                const Icon   = cfg.icon;
                                return (
                                    <motion.label key={t.type_key} whileHover={{ x: 2 }}
                                        className="flex items-center gap-3 cursor-pointer select-none p-2 rounded-xl hover:bg-slate-50 transition-all">
                                        <input type="checkbox" checked={active}
                                            onChange={() => toggleFilter(t.type_key)} className="sr-only" />
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                            style={{ background: active ? cfg.bg : '#f1f5f9' }}>
                                            <Icon className="w-3.5 h-3.5" style={{ color: active ? '#fff' : '#94a3b8' }} />
                                        </div>
                                        <span className={`text-sm font-medium transition-colors ${active ? 'text-slate-700' : 'text-slate-400'}`}>
                                            {t.type_label}
                                        </span>
                                        {active && (
                                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                                                className="ml-auto w-2 h-2 rounded-full"
                                                style={{ background: cfg.bg }} />
                                        )}
                                    </motion.label>
                                );
                            })}
                        </div>
                    </div>

                    {/* Upcoming card */}
                    <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 flex-1 relative">
                        <SectionHeader icon={Clock} gradient="from-amber-500 to-orange-500" title="งานที่กำลังจะมาถึง" />
                        <div className="flex items-center justify-end -mt-8 mb-3">
                            <button onClick={fetchUpcoming} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-all">
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="space-y-2">
                            {upcoming.length === 0
                                ? <p className="text-xs text-slate-400 italic text-center py-6">ไม่มีงานในเร็วๆ นี้</p>
                                : upcoming.map((t, idx) => {
                                    const cfg = TYPE_CONFIG[t.task_type] || { bg: '#6b7280', light: '#f9fafb', border: '#e5e7eb' };
                                    return (
                                        <motion.div key={t.task_id}
                                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            whileHover={{ x: 3 }}
                                            onClick={() => openEdit(t.task_id)}
                                            className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md"
                                            style={{ background: cfg.light, borderColor: cfg.border }}
                                        >
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.bg }} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold text-slate-700 truncate">{t.task_title}</p>
                                                {/* ✅ แสดงทั้งวันและเวลา */}
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    📅 {fmtDateTimeShort(t.start_date)}
                                                </p>
                                            </div>
                                            <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                                        </motion.div>
                                    );
                                })
                            }
                        </div>
                    </div>
                </motion.aside>

                {/* Calendar */}
               
                <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                    className="flex-1 pr-4 sm:pr-6 lg:pr-8 min-w-0">
                    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5 hover:shadow-xl transition-shadow duration-300">
                        <style>{`
                            .fc .fc-toolbar { margin-bottom: 16px; }
                            .fc .fc-toolbar-title { font-size: 1.1rem; font-weight: 800; color: #1e293b; }
                            .fc .fc-button { background: #f1f5f9 !important; border: 1px solid #e2e8f0 !important; color: #475569 !important; font-size: 12px !important; font-weight: 600 !important; border-radius: 8px !important; padding: 6px 12px !important; box-shadow: none !important; }
                            .fc .fc-button:hover { background: #e2e8f0 !important; }
                            .fc .fc-button-active, .fc .fc-button-primary:not(:disabled).fc-button-active { background: linear-gradient(135deg,#6366f1,#8b5cf6) !important; color: #fff !important; border-color: transparent !important; }
                            .fc .fc-today-button { background: linear-gradient(135deg,#6366f1,#8b5cf6) !important; color: #fff !important; border-color: transparent !important; }
                            .fc-theme-standard th { background: #f8fafc; color: #64748b; font-size: 12px; font-weight: 700; padding: 10px 0; border-color: #f1f5f9; }
                            .fc-theme-standard td { border-color: #f1f5f9; }
                            .fc .fc-day-today { background: #eef2ff !important; }
                            .fc .fc-daygrid-day-number { font-size: 12px; font-weight: 600; color: #64748b; padding: 6px 8px; }
                            .fc .fc-day-today .fc-daygrid-day-number { color: #6366f1; font-weight: 800; }
                            .fc-event { border-radius: 6px !important; font-size: 11px !important; font-weight: 600 !important; padding: 2px 6px !important; cursor: pointer !important; border: none !important; }
                            .fc-event:hover { opacity: 0.9; transform: translateY(-1px); transition: all .15s ease; }
                            .fc .fc-daygrid-day-frame { min-height: 110px; }
                            .fc .fc-list-event:hover td { background: #f8fafc; }
                            /* timed event */
                            .fc-timegrid-event .fc-event-title { font-size: 11px !important; }
                        `}</style>
                        <FullCalendar
                            ref={calRef}
                            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                            initialView="dayGridMonth"
                            locale="th"
                            titleFormat={{ year: 'numeric', month: 'long' }}
                            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' }}
                            buttonText={{ today: 'วันนี้', month: 'เดือน', week: 'สัปดาห์', list: 'รายการ' }}
                            events={fcEvents}
                            editable selectable selectMirror dayMaxEvents
                            height="auto"
                            select={info => openAdd(info.startStr, info.endStr)}
                            eventClick={info => {
    console.log('clicked event id:', info.event.id);
    openEdit(info.event.id);
}}
                            eventDrop={handleEventDrop}
                            eventResize={handleEventDrop}
                            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                        />
                    </div>
                </motion.main>
               
            </div>

            {/* Modal */}
            <Portal>
                <AnimatePresence>
                {modal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeModal} />
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', damping: 25 }}
                        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                                        <Calendar className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-white">
                                            {form.task_id ? 'แก้ไขงาน' : 'สร้างงานใหม่'}
                                        </h2>
                                        <p className="text-indigo-200 text-xs">IT Task Calendar</p>
                                    </div>
                                </div>
                                <button onClick={closeModal} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                                    <X className="w-4 h-4 text-white" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">

                            {/* Title */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                    ชื่องาน <span className="text-red-400">*</span>
                                </label>
                                <input type="text" value={form.task_title}
                                    onChange={e => setForm(f => ({ ...f, task_title: e.target.value }))}
                                    placeholder="เช่น Backup Tape, Set up PC ใหม่"
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                                />
                            </div>

                            {/* ✅ DateTime inputs */}
                            <div className="grid grid-cols-2 gap-3">
                                <DateTimeInput
                                    label="เริ่มต้น"
                                    value={form.start_date}
                                    onChange={v => setForm(f => ({ ...f, start_date: v }))}
                                    required
                                />
                                <DateTimeInput
                                    label="สิ้นสุด"
                                    value={form.end_date}
                                    onChange={v => setForm(f => ({ ...f, end_date: v }))}
                                    disabled={form.is_recurring}
                                />
                            </div>

                            {/* Task Type */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ประเภทงาน</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
                                        const Icon   = cfg.icon;
                                        const active = form.task_type === key;
                                        return (
                                            <button key={key} type="button"
                                                onClick={() => setForm(f => ({ ...f, task_type: key }))}
                                                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all text-center"
                                                style={{ borderColor: active ? cfg.bg : '#e2e8f0', background: active ? cfg.light : '#fff' }}>
                                                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                                                    style={{ background: active ? cfg.bg : '#f1f5f9' }}>
                                                    <Icon className="w-3.5 h-3.5" style={{ color: active ? '#fff' : '#94a3b8' }} />
                                                </div>
                                                <span className="text-[10px] font-bold leading-tight"
                                                    style={{ color: active ? cfg.bg : '#94a3b8' }}>
                                                    {cfg.label.split('/')[0]}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Recurring */}
                            {!form.task_id && (
                                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50">
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
                                        <input type="checkbox" checked={form.is_recurring}
                                            onChange={e => setForm(f => ({
                                                ...f, is_recurring: e.target.checked,
                                                end_date: e.target.checked ? '' : f.end_date,
                                            }))}
                                            className="w-4 h-4 accent-indigo-600 rounded"
                                        />
                                        <span className="text-sm font-semibold text-slate-600">ตั้งเป็นงานเกิดซ้ำ (Recurring)</span>
                                    </label>
                                    {form.is_recurring && (
                                        <div className="pl-6 space-y-3">
                                            <div className="flex flex-wrap gap-1.5">
                                                {DAY_LABELS.map(({ key, label }) => {
                                                    const active = form.recur_days.includes(key);
                                                    return (
                                                        <button key={key} type="button"
                                                            onClick={() => setForm(f => ({
                                                                ...f,
                                                                recur_days: active
                                                                    ? f.recur_days.filter(d => d !== key)
                                                                    : [...f.recur_days, key],
                                                            }))}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                                                                active
                                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'
                                                            }`}
                                                        >{label}</button>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-500 font-medium">สร้างล่วงหน้า</span>
                                                <select value={form.range_days}
                                                    onChange={e => setForm(f => ({ ...f, range_days: +e.target.value }))}
                                                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none">
                                                    {[7,14,28,60,90].map(v => <option key={v} value={v}>{v} วัน</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">รายละเอียด</label>
                                <textarea rows={3} value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="รายละเอียดเครื่อง, ผู้ติดต่อ, หรือ Note อื่นๆ"
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-slate-700 transition-all"
                                />
                            </div>

                            {/* Created by */}
                            {form.task_id && form.created_by && (
                                <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                                        <User className="w-3.5 h-3.5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">บันทึกโดย</p>
                                        <p className="text-sm font-bold text-indigo-700">{form.created_by}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100">
                            <div>
                                {form.task_id && !confirmDel && (
                                    <button onClick={() => setConfirmDel(true)}
                                        className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium transition-colors">
                                        <Trash2 className="w-4 h-4" /> ลบงาน
                                    </button>
                                )}
                                {form.task_id && confirmDel && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-red-600 font-bold">ยืนยันลบ?</span>
                                        <button onClick={deleteTask} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 transition-colors">ลบ</button>
                                        <button onClick={() => setConfirmDel(false)} className="text-xs text-slate-500 hover:text-slate-700 font-medium">ยกเลิก</button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={closeModal}
                                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-white transition-all">
                                    ยกเลิก
                                </button>
                                <motion.button onClick={saveTask} disabled={saving}
                                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-xl shadow-lg shadow-indigo-200 disabled:opacity-50 transition-all">
                                    <Send className="w-3.5 h-3.5" />
                                    {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
                </AnimatePresence>
            </Portal>

            {/* Toast */}
            <Portal>
                <AnimatePresence>
                {toast && (
                    <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold text-white ${toast.ok ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-red-500 to-rose-500'}`}>
                    {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    {toast.msg}
                </motion.div>
            )}
                </AnimatePresence>
            </Portal>
        </div>
    );
}