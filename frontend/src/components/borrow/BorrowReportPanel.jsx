import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, Bell, Loader2, Printer, PackageOpen, ArrowLeftRight, Clock, AlertTriangle, Timer, CalendarClock, CheckCircle2 } from 'lucide-react';
import { API_BASE } from '../../config/api';

// ── รายงานยืม-คืน ─────────────────────────────────────────────────────
// ข้อมูลคำนวณฝั่ง backend (GET /borrowings/report?from&to)
const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_TH[m - 1]} ${String(y + 543).slice(2)}`; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };

const RANGES = [
  { id: '30', label: '30 วัน', from: () => daysAgo(30), to: () => '' },
  { id: '90', label: '90 วัน', from: () => daysAgo(90), to: () => '' },
  { id: 'year', label: 'ปีนี้', from: () => `${new Date().getFullYear()}-01-01`, to: () => '' },
  { id: 'all', label: 'ทั้งหมด', from: () => '', to: () => '' },
];

const STATUS_SEGMENTS = [
  { key: 'open', label: 'กำลังยืม', color: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { key: 'returned', label: 'คืนแล้ว', color: 'bg-slate-400', dot: 'bg-slate-400' },
  { key: 'repairing', label: 'ส่งซ่อม', color: 'bg-sky-500', dot: 'bg-sky-500' },
  { key: 'damaged', label: 'ชำรุด', color: 'bg-orange-500', dot: 'bg-orange-500' },
  { key: 'lost', label: 'สูญหาย', color: 'bg-rose-500', dot: 'bg-rose-500' },
];

// วงกลมแสดงอัตราคืนตรงเวลา
const Ring = ({ value }) => {
  const r = 52; const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = value == null ? '#cbd5e1' : pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#f43f5e';
  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray .6s ease' }} />
      <text x="60" y="58" textAnchor="middle" className="fill-slate-800" style={{ fontSize: 24, fontWeight: 800 }}>{value == null ? '-' : `${pct}%`}</text>
      <text x="60" y="76" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>คืนตรงเวลา</text>
    </svg>
  );
};

const Kpi = ({ icon: Icon, label, value, sub, tone = 'text-slate-800', accent = 'bg-slate-100 text-slate-500' }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-start gap-3">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}><Icon size={18} /></div>
    <div className="min-w-0">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`text-2xl font-black tabular-nums leading-tight ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</div>}
    </div>
  </div>
);

// รายการจัดอันดับแบบแถบ: ความยาวแถบ = จำนวนที่ยืมทั้งหมด
const BarList = ({ title, rows, limit = 8 }) => {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
        {rows.length > limit && (
          <button onClick={() => setAll((v) => !v)} className="text-xs font-semibold text-indigo-600 hover:underline no-print">{all ? 'ย่อ' : `ดูทั้งหมด (${rows.length})`}</button>
        )}
      </div>
      {rows.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">ไม่มีข้อมูล</p> : (
        <ul className="space-y-3">
          {shown.map((g) => (
            <li key={g.key}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-slate-700" title={g.key}>{g.key}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {g.overdue > 0 && <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 text-[10px] font-bold">เกิน {g.overdue}</span>}
                  {g.late > 0 && <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold">ช้า {g.late}</span>}
                  <b className="tabular-nums text-slate-800 w-6 text-right">{g.total}</b>
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden flex">
                <div className="h-full bg-emerald-500" style={{ width: `${(g.open / max) * 100}%` }} title={`กำลังยืม ${g.open}`} />
                <div className="h-full bg-slate-300" style={{ width: `${((g.total - g.open) / max) * 100}%` }} title={`ปิดแล้ว ${g.total - g.open}`} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default function BorrowReportPanel({ onClose, headers, inline = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notice, setNotice] = useState(null);
  const [sending, setSending] = useState(false);

  const load = async (f = from, t = to) => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from', f);
      if (t) qs.set('to', t);
      const res = await fetch(`${API_BASE}/borrowings/report?${qs.toString()}`, { headers });
      if (!res.ok) throw new Error('bad status');
      setData(await res.json());
    } catch (e) {
      setError('โหลดรายงานไม่สำเร็จ');
    }
    setLoading(false);
  };

  useEffect(() => { load('', ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (inline || !onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickRange = (r) => {
    setRange(r.id);
    const f = r.from(); const t = r.to();
    setFrom(f); setTo(t);
    load(f, t);
  };
  const applyCustom = () => { setRange('custom'); load(from, to); };

  const sendReminders = async () => {
    setSending(true); setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/borrowings/reminders/run`, { method: 'POST', headers });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'ส่งไม่สำเร็จ');
      if (d.sent) setNotice({ tone: 'ok', text: `ส่งแจ้งเตือนแล้ว ${d.count} รายการ (เกินกำหนด ${d.overdue})` });
      else setNotice({ tone: 'warn', text: d.reason === 'no-items' ? 'ไม่มีรายการที่ต้องแจ้งเตือน' : d.reason === 'BORROW_ALERT_TO not set' ? 'ยังไม่ได้ตั้งผู้รับอีเมล (BORROW_ALERT_TO ใน .env)' : `ไม่ได้ส่ง: ${d.reason}` });
    } catch (e) {
      setNotice({ tone: 'err', text: e.message || 'ส่งไม่สำเร็จ' });
    }
    setSending(false);
  };

  const exportXlsx = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const k = data.kpi;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { หัวข้อ: 'รายการทั้งหมด', ค่า: k.total }, { หัวข้อ: 'กำลังยืม', ค่า: k.open }, { หัวข้อ: 'เกินกำหนด', ค่า: k.overdue },
      { หัวข้อ: 'ใกล้ครบ (7 วัน)', ค่า: k.dueSoon }, { หัวข้อ: 'คืนแล้ว', ค่า: k.returned }, { หัวข้อ: 'สูญหาย', ค่า: k.lost },
      { หัวข้อ: 'ชำรุด', ค่า: k.damaged }, { หัวข้อ: 'ส่งซ่อม', ค่า: k.repairing }, { หัวข้อ: 'คืนตรงเวลา (%)', ค่า: k.onTimeRate ?? '' },
      { หัวข้อ: 'คืนช้าเฉลี่ย (วัน)', ค่า: k.avgLateDays ?? '' }, { หัวข้อ: 'ระยะเวลายืมเฉลี่ย (วัน)', ค่า: k.avgBorrowDays ?? '' },
    ]), 'สรุป');
    const map = (rows, name) => rows.map((g) => ({ [name]: g.key, ทั้งหมด: g.total, กำลังยืม: g.open, เกินกำหนด: g.overdue, คืนช้า: g.late }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(map(data.byDept, 'แผนก')), 'ตามแผนก');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(map(data.byCategory, 'หมวด')), 'ตามหมวด');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(map(data.byEmployee, 'ผู้ยืม')), 'ตามผู้ยืม');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.monthly.map((m) => ({ เดือน: monthLabel(m.month), ยืม: m.borrowed, คืน: m.returned }))), 'รายเดือน');
    XLSX.writeFile(wb, `Borrow_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const k = data ? data.kpi : null;
  const maxMonth = useMemo(() => (data ? Math.max(1, ...data.monthly.map((m) => Math.max(m.borrowed, m.returned))) : 1), [data]);
  const ticks = useMemo(() => {
    const step = Math.max(1, Math.ceil(maxMonth / 4));
    const top = step * 4;
    return { top, list: [4, 3, 2, 1, 0].map((i) => i * step) };
  }, [maxMonth]);
  const statusCounts = k ? { open: k.open - k.repairing, returned: k.returned, repairing: k.repairing, damaged: k.damaged, lost: k.lost } : null;
  const statusTotal = statusCounts ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className={inline ? '' : 'fixed inset-0 z-[60] bg-slate-100 overflow-y-auto'}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .fixed { position: static !important; }
          body { background: #fff !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* แถบบน (ติดบน) */}
      <div className={inline ? 'bg-white rounded-2xl border border-slate-200 shadow-sm' : 'sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200'}>
        <div className="max-w-6xl mx-auto px-5 py-3 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h2 className="text-lg font-black text-slate-800 leading-tight">รายงานยืม-คืนอุปกรณ์</h2>
            <p className="text-[11px] text-slate-400">ข้อมูล ณ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
          </div>
          <div className="no-print flex bg-slate-100 rounded-xl p-1">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => pickRange(r)}
                className={`px-3 h-8 rounded-lg text-xs font-bold transition ${range === r.id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
            ))}
          </div>
          <div className="no-print flex items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setRange('custom'); }} className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white" title="ตั้งแต่วันที่ยืม" />
            <span className="text-[11px] text-slate-400">ถึง</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setRange('custom'); }} className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white" title="ถึงวันที่ยืม" />
            {range === 'custom' && <button onClick={applyCustom} className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold">ดู</button>}
          </div>
          <div className="no-print flex items-center gap-2">
            <button onClick={exportXlsx} disabled={!data} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40"><Download size={14} />Excel</button>
            <button onClick={() => window.print()} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"><Printer size={14} />พิมพ์</button>
            <button onClick={sendReminders} disabled={sending} className="h-9 px-3 rounded-xl bg-amber-500 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-amber-600 disabled:opacity-50">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}แจ้งเตือนรายการค้าง
            </button>
            {!inline && <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-500 flex items-center justify-center" title="ปิด (Esc)"><X size={18} /></button>}
          </div>
        </div>
      </div>

      <div className={inline ? 'space-y-5 mt-5' : 'max-w-6xl mx-auto p-5 space-y-5'}>
        {notice && (
          <div className={`no-print text-sm px-4 py-2.5 rounded-xl border flex items-center justify-between gap-3 ${notice.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : notice.tone === 'err' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
        )}
        {loading && !data && <div className="py-24 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} />กำลังโหลดรายงาน…</div>}
        {error && <div className="py-10 text-center text-rose-600">{error}</div>}

        {k && (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {/* ภาพรวม: วงกลมอัตราคืนตรงเวลา + สัดส่วนสถานะ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-5">
                <Ring value={k.onTimeRate} />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-700">การคืนตรงเวลา</div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {k.returned === 0 ? 'ยังไม่มีรายการที่คืนแล้วในช่วงนี้' : `คืนแล้ว ${k.returned} รายการ${k.avgLateDays != null ? ` · ที่คืนช้าเฉลี่ย ${k.avgLateDays} วัน` : ' · ไม่มีรายการคืนช้า'}`}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-lg px-2 py-1"><Timer size={12} />ยืมเฉลี่ย {k.avgBorrowDays == null ? '-' : `${k.avgBorrowDays} วัน`}</div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-700">สถานะรายการทั้งหมด</h3>
                  <span className="text-xs text-slate-400">{k.total} รายการ</span>
                </div>
                <div className="h-4 rounded-full bg-slate-100 overflow-hidden flex">
                  {STATUS_SEGMENTS.map((s) => statusCounts[s.key] > 0 && (
                    <div key={s.key} className={`${s.color} h-full`} style={{ width: `${(statusCounts[s.key] / Math.max(1, statusTotal)) * 100}%` }} title={`${s.label} ${statusCounts[s.key]}`} />
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                  {STATUS_SEGMENTS.map((s) => (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                      <div>
                        <div className="text-lg font-black tabular-nums leading-none">{statusCounts[s.key]}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              <Kpi icon={PackageOpen} label="รายการทั้งหมด" value={k.total} accent="bg-slate-100 text-slate-600" />
              <Kpi icon={ArrowLeftRight} label="กำลังยืมอยู่" value={k.open} tone="text-emerald-600" accent="bg-emerald-50 text-emerald-600" />
              <Kpi icon={Clock} label="ใกล้ครบ ≤ 7 วัน" value={k.dueSoon} tone={k.dueSoon ? 'text-amber-600' : 'text-slate-800'} accent="bg-amber-50 text-amber-600" />
              <Kpi icon={AlertTriangle} label="เกินกำหนด" value={k.overdue} tone={k.overdue ? 'text-rose-600' : 'text-slate-800'} accent="bg-rose-50 text-rose-600" />
            </div>

            {/* แนวโน้ม */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mt-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-700">แนวโน้มรายเดือน (12 เดือนล่าสุด)</h3>
                <div className="flex gap-4 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-500" />ยืม</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" />คืน</span>
                </div>
              </div>
              <div className="relative h-44 pl-7">
                {ticks.list.map((t, i) => (
                  <div key={t} className="absolute left-0 right-0 flex items-center" style={{ top: `${(i / 4) * 100}%`, transform: 'translateY(-50%)' }}>
                    <span className="w-6 text-[10px] text-slate-400 text-right pr-1 tabular-nums">{t}</span>
                    <span className="flex-1 border-t border-dashed border-slate-100" />
                  </div>
                ))}
                <div className="absolute inset-0 pl-7 flex items-end gap-2">
                  {data.monthly.map((m) => (
                    <div key={m.month} className="flex-1 h-full flex items-end gap-0.5">
                      {[['borrowed', 'bg-indigo-500'], ['returned', 'bg-emerald-500']].map(([key, cls]) => (
                        <div key={key} className="flex-1 h-full flex flex-col justify-end items-center">
                          {m[key] > 0 && <span className="text-[10px] font-bold text-slate-600 mb-0.5 tabular-nums">{m[key]}</span>}
                          <div className={`${cls} w-full rounded-t`} style={{ height: `${(m[key] / ticks.top) * 100}%`, minHeight: m[key] > 0 ? 3 : 0, transition: 'height .5s ease' }} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pl-7 mt-2">
                {data.monthly.map((m) => <div key={m.month} className="flex-1 text-center text-[10px] text-slate-400 truncate">{monthLabel(m.month)}</div>)}
              </div>
            </div>

            {/* ต้องติดตาม */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><AlertTriangle size={15} className="text-rose-500" />เกินกำหนดแล้ว</h3>
                {data.openOverdue.length === 0 ? (
                  <div className="py-8 text-center text-sm text-emerald-600 flex flex-col items-center gap-1"><CheckCircle2 size={22} />ไม่มีรายการเกินกำหนด</div>
                ) : (
                  <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {data.openOverdue.map((o) => (
                      <li key={o.brID} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800 truncate">{o.brname}</div>
                          <div className="text-xs text-slate-500 truncate">{o.brEmpname}</div>
                        </div>
                        <span className="px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold whitespace-nowrap">เกิน {o.daysLate} วัน</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><CalendarClock size={15} className="text-amber-500" />ใกล้ครบกำหนดใน 7 วัน</h3>
                {(data.dueSoonList || []).length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">ไม่มีรายการที่ใกล้ครบกำหนด</div>
                ) : (
                  <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {data.dueSoonList.map((o) => (
                      <li key={o.brID} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800 truncate">{o.brname}</div>
                          <div className="text-xs text-slate-500 truncate">{o.brEmpname}</div>
                        </div>
                        <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold whitespace-nowrap">{o.daysLeft === 0 ? 'ครบวันนี้' : `อีก ${o.daysLeft} วัน`}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* แยกกลุ่ม */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
              <BarList title="ตามแผนก (รหัส Cost Center)" rows={data.byDept} />
              <BarList title="ตามหมวดอุปกรณ์" rows={data.byCategory} />
              <BarList title="ผู้ยืมบ่อยที่สุด" rows={data.byEmployee} />
            </div>
            <p className="text-[11px] text-slate-400 mt-3 flex flex-wrap gap-x-4">
              <span><span className="inline-block w-2 h-2 rounded bg-emerald-500 mr-1" />กำลังยืม</span>
              <span><span className="inline-block w-2 h-2 rounded bg-slate-300 mr-1" />ปิดแล้ว</span>
              <span>"เกิน" = เกินกำหนดตอนนี้ · "ช้า" = คืนช้ากว่ากำหนด</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
