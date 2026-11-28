// NetAtlas — ค่าคงที่และฟังก์ชันช่วย (ใช้ร่วมกันทุก component ใน netatlas/)
// ประเภทอุปกรณ์มาจาก master (API /netatlas/device-types) — ไฟล์นี้แค่แปลง colorKey/iconKey เป็นสีและไอคอน
import { Server, Share2, Wifi, Monitor, Printer, Router, HardDrive, Box, Phone, Camera, ImageOff } from 'lucide-react';
import { API_BASE, API_URL } from '../../config/api';

export const NETATLAS_API = `${API_BASE}/netatlas`;

// backend ส่ง path สัมพัทธ์ของรูปแปลน (/ITinventory/uploads/netatlas/...) — ต้องต่อกับโดเมนของ API ไม่ใช่โดเมนหน้าเว็บ
export const floorplanSrc = (path) => (path ? `${API_URL}${path}` : null);

// สี: คลาสต้องเขียนเต็มไว้ตรงนี้ (Tailwind ต้องเห็นชื่อคลาสครบในซอร์ส)
export const COLOR_CLASSES = {
    blue: { dot: 'bg-blue-500', text: 'text-blue-700', soft: 'bg-blue-50', border: 'border-blue-200' },
    amber: { dot: 'bg-amber-500', text: 'text-amber-700', soft: 'bg-amber-50', border: 'border-amber-200' },
    purple: { dot: 'bg-purple-500', text: 'text-purple-700', soft: 'bg-purple-50', border: 'border-purple-200' },
    emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700', soft: 'bg-emerald-50', border: 'border-emerald-200' },
    rose: { dot: 'bg-rose-500', text: 'text-rose-700', soft: 'bg-rose-50', border: 'border-rose-200' },
    cyan: { dot: 'bg-cyan-500', text: 'text-cyan-700', soft: 'bg-cyan-50', border: 'border-cyan-200' },
    indigo: { dot: 'bg-indigo-500', text: 'text-indigo-700', soft: 'bg-indigo-50', border: 'border-indigo-200' },
    slate: { dot: 'bg-slate-500', text: 'text-slate-700', soft: 'bg-slate-50', border: 'border-slate-200' },
};
export const COLOR_KEYS = Object.keys(COLOR_CLASSES);

// ไอคอน: key จาก master → component
export const ICON_MAP = { server: Server, share2: Share2, wifi: Wifi, monitor: Monitor, printer: Printer, router: Router, hardDrive: HardDrive, box: Box, phone: Phone, camera: Camera };
export const ICON_KEYS = Object.keys(ICON_MAP);

const FALLBACK = { ...COLOR_CLASSES.slate, Icon: ImageOff };

// รวมข้อมูลประเภทจาก master เข้ากับสี/ไอคอน ใช้แสดงผลทุกที่
export const styleOf = (type, code) => {
    const t = type || null;
    const c = t ? (COLOR_CLASSES[t.colorKey] || COLOR_CLASSES.slate) : FALLBACK;
    return {
        code: t?.code || code || '?',
        label: t?.label || code || 'ไม่ทราบประเภท',
        short: t?.shortLabel || code || '?',
        hasPorts: !!t?.hasPorts,
        canBeParent: !!t?.canBeParent,
        isActive: t ? t.isActive : false,
        dot: c.dot, text: c.text, soft: c.soft, border: c.border,
        Icon: t ? (ICON_MAP[t.iconKey] || Box) : ImageOff,
    };
};

export const findType = (types, code) => types.find((t) => t.code === code) || null;

export const BTN_PRIMARY = 'flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-sm disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
export const BTN_SECONDARY = 'flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-sm disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
export const BTN_DANGER = 'flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-xl hover:bg-rose-700 shadow-sm disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400';
export const INPUT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400';

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

// ตรวจฟอร์มฝั่ง client (server ตรวจซ้ำอีกครั้ง)
export const validateDeviceForm = (f, type) => {
    const errors = {};
    if (!f.name.trim()) errors.name = 'กรุณาระบุชื่ออุปกรณ์';
    if (!type) errors.type = 'เลือกประเภทอุปกรณ์';
    if (!f.location.trim()) errors.location = 'กรุณาระบุจุดติดตั้ง / ห้อง';
    const ip = f.ip.trim() || 'N/A';
    if (ip !== 'N/A' && !IPV4.test(ip)) errors.ip = 'IP ต้องเป็นรูปแบบ IPv4 เช่น 192.168.1.10 หรือ N/A';
    // จำนวนพอร์ตไม่บังคับ: ถ้ากรอกต้องอยู่ระหว่าง 1–96
    if (type?.hasPorts && String(f.portCount).trim() !== '') {
        const n = Number(f.portCount);
        if (!Number.isInteger(n) || n < 1 || n > 96) errors.portCount = 'จำนวนพอร์ตต้องเป็นตัวเลข 1–96';
    }
    return errors;
};

// อุปกรณ์ที่เป็นลูกหลาน (ทั้งทางตรงและทางอ้อม) ของ id — ใช้กันการเลือก parent ที่ทำให้วนลูป
export const descendantIds = (devices, id) => {
    const out = new Set();
    const queue = [id];
    while (queue.length) {
        const cur = queue.shift();
        for (const d of devices) {
            if (d.uplinkDeviceId === cur && !out.has(d.id)) { out.add(d.id); queue.push(d.id); }
        }
    }
    return out;
};

// เส้นทางขึ้นไปหา Core: [ตัวเอง, parent, grandparent, ...]
export const uplinkChain = (devices, id) => {
    const byId = new Map(devices.map((d) => [d.id, d]));
    const chain = [];
    let cur = byId.get(id);
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
        chain.push(cur);
        seen.add(cur.id);
        cur = cur.uplinkDeviceId != null ? byId.get(cur.uplinkDeviceId) : null;
    }
    return chain;
};

// อุปกรณ์ลูกที่เสียบอยู่ที่พอร์ตของ parent (ใช้กับผังพอร์ตและตัวเลือกพอร์ต)
export const childrenOf = (devices, parentId) => devices.filter((d) => d.uplinkDeviceId === parentId);

export const matchesSearch = (d, q) => {
    if (!q) return true;
    const s = q.toLowerCase();
    // รวมหมายเหตุของพอร์ตด้วย เช่น พิมพ์ "CCTV" แล้วเจอ Switch ที่พอร์ต 5 มีหมายเหตุนี้
    const remarks = (d.portRemarks || []).map((x) => x.remark);
    return [d.name, d.model, d.ip, d.location, ...remarks].some((v) => String(v || '').toLowerCase().includes(s));
};

// ชื่อพอร์ตจริง เช่น Gi1/0/23 = รูปแบบชื่อ (portPrefix) + หมายเลขพอร์ต; ไม่กำหนดรูปแบบ → P23
export const portName = (dev, n) => {
    if (n == null) return '';
    const p = dev?.portPrefix;
    return p ? `${p}${n}` : `P${n}`;
};
// ปลายสองด้านของเส้น (แบบ Packet Tracer): ปลาย parent = พอร์ตที่เสียบบน parent, ปลายอุปกรณ์ลูก = พอร์ตที่ใช้เชื่อมของตัวเอง
// ชื่อพอร์ตที่พิมพ์ไว้ใช้ก่อน ถ้าไม่มีจึงใช้หมายเลขพอร์ต
export const parentEnd = (child, parent) => child.uplinkFromPort || (child.parentPortNo != null ? portName(parent, child.parentPortNo) : '');
export const childEnd = (child) => child.uplinkToPort || (child.ownPortNo != null ? portName(child, child.ownPortNo) : '');
// ป้ายสรุปของเส้น เช่น "Gi1/0/23 ↔ Gi1/0/24"
export const linkLabel = (child, parent) => {
    const a = parentEnd(child, parent);
    const b = childEnd(child);
    if (!a && !b) return '';
    return `${a || '?'} ↔ ${b || '?'}`;
};

// เรียก API แล้วคืน { ok, data, error } — ไม่ throw เพื่อให้ UI แสดงข้อความไทยได้เสมอ
export const apiCall = async (path, options = {}) => {
    try {
        const res = await fetch(`${NETATLAS_API}${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            return { ok: false, error: json.error || `เกิดข้อผิดพลาด (${res.status})`, status: res.status, code: json.code, body: json };
        }
        return { ok: true, data: json.data, body: json };
    } catch {
        return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' };
    }
};
