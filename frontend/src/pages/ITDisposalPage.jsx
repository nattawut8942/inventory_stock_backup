import React, { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import * as XLSX from 'xlsx-js-style';
import { Trash2, Search, Plus, Lock, FileSpreadsheet, Printer, Loader2, AlertTriangle, CheckCircle2, Coins, Image as ImageIcon, ArrowLeft, Camera, X, ClipboardList, Eye, Copy, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCan } from '../context/PermissionContext';
import { getAuthToken, useAuth } from '../context/AuthContext';
import { API_BASE, API_URL } from '../config/api';
import StatCard from '../components/StatCard';
import Pagination from '../components/Pagination';
import AlertModal from '../components/AlertModal';

const PAGE_SIZE = 20;

// กติกาจากคู่มือ UI: โฟกัสด้วยคีย์บอร์ดต้องเห็นชัด, คลิกได้ต้องเป็นรูปมือ, เคารพการลดการเคลื่อนไหว
const ITD_CSS = `
.itd button:focus-visible, .itd a:focus-visible, .itd select:focus-visible,
.itd input:focus-visible, .itd textarea:focus-visible, .itd [tabindex="0"]:focus-visible {
  outline: 2px solid #e11d48; outline-offset: 2px;
}
.itd button, .itd select, .itd label[for], .itd [role="button"] { cursor: pointer; }
.itd button:disabled { cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) {
  .itd *:not(.animate-spin) { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
`;

// ─── การเรียงลำดับ ───────────────────────────────────────────────────────────
const ITEM_SORT_VALUE = {
  assetNo: (i) => i.assetNo,
  assetDate: (i) => i.assetDate,
  assetName: (i) => i.assetName,
  place: (i) => i.place,
  costCenter: (i) => i.costCenter,
  cost: (i) => Number(i.cost) || 0,
  accumDP: (i) => Number(i.accumDP) || 0,
  bkAmt: (i) => Number(i.bkAmt) || 0,
};
const ITEM_SORT_LABELS = [
  ['assetNo', 'ASSET NO'], ['assetDate', 'DATE'], ['assetName', 'ASSET NAME'], ['place', 'PLACE'],
  ['costCenter', 'CC'], ['cost', 'COST'], ['accumDP', 'ACCUMDP'], ['bkAmt', 'BKAMT'],
];
const RUN_SORT_VALUE = {
  createdAt: (r) => new Date(r.createdAt).getTime() || 0,
  runCode: (r) => r.runCode,
  itemCount: (r) => Number(r.itemCount) || 0,
  totalCost: (r) => Number(r.totalCost) || 0,
};
const RUN_SORT_LABELS = [['createdAt', 'วันที่เปิด'], ['runCode', 'รหัสรอบ'], ['itemCount', 'จำนวนรายการ'], ['totalCost', 'รวม COST']];

// จำนวนวันนับจากวันที่ระบุถึงตอนนี้
const daysSince = (v) => (v ? Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 86400000)) : 0);

const compareBy = (get, dir) => (a, b) => {
  const va = get(a);
  const vb = get(b);
  const r = typeof va === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'th', { numeric: true });
  return dir === 'asc' ? r : -r;
};

// คัดลอกข้อความ (ใช้ execCommand เป็นทางสำรองเมื่อไม่ใช่ HTTPS/localhost)
const copyText = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* ใช้ทางสำรองด้านล่าง */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
};

const authHeaders = () => {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// เรียก API — ถ้า body เป็น FormData ปล่อยให้ browser ตั้ง Content-Type (multipart) เอง
const apiRequest = async (path, { method = 'GET', body } = {}) => {
  const opts = { method, headers: { ...authHeaders() } };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

const fmtMoney = (n) => (n == null || n === '' ? '-' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const fmtDateTime = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return `${fmtDate(v)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const imgUrl = (p) => (p ? `${API_URL}${p}` : '');

// ย่อรูปก่อนอัปโหลด (ด้านยาวสุด 1600px, JPEG 80%) — ช่วยให้รูปจาก iPad/มือถือเล็กลงมาก
// ถ้าอ่านรูปไม่ได้ (เช่น HEIC) จะส่งไฟล์เดิมไปแทน
const compressImage = (file, maxSide = 1280, quality = 0.65) => new Promise((resolve) => {
  if (!file || !file.type.startsWith('image/')) return resolve(file);
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      URL.revokeObjectURL(url);
      if (!blob || (scale === 1 && blob.size >= file.size)) return resolve(file);
      resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', quality);
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
  img.src = url;
});

const EVENT_LABEL = {
  OPEN: 'เปิดรอบ',
  ADD_ITEM: 'เพิ่มรายการ',
  DELETE_ITEM: 'ลบรายการ',
  PHOTO: 'แนบรูป',
  CLOSE: 'ปิดรอบ',
  ATTACH: 'แนบเอกสาร',
  ATTACH_DELETE: 'ลบเอกสารแนบ',
  COMPLETE: 'ทำเป็นเสร็จสิ้น',
  UNCOMPLETE: 'ยกเลิกเสร็จสิ้น',
};

// สถานะรอบ: เปิดอยู่ / ปิดแล้ว / เสร็จสิ้น (เสร็จสิ้น = ปิดรอบแล้วและ บช. ดำเนินการทิ้งครบ)
const runState = (r) => (r.status === 'Open' ? 'open' : r.completedAt ? 'completed' : 'closed');
const RUN_STATE_LABEL = { open: 'เปิดอยู่', closed: 'ปิดแล้ว', completed: 'เสร็จสิ้น' };

const DOC_TYPE_LABEL = { ACCOUNTING_DONE: 'บช. ดำเนินการทิ้งแล้ว', APPROVAL: 'หนังสืออนุมัติ', OTHER: 'อื่นๆ' };

const EMPTY_FORM = { assetNo: '', assetDate: '', assetName: '', place: '', costCenter: '', cost: '', accumDP: '', bkAmt: '' };

// ─── จัดรูปแบบ ASSET NO อัตโนมัติ: CO24-017-02 / OF24-017-02 ──────────────────
// พิมพ์ "C" → "CO", พิมพ์ "O" ตัวแรก → "OF", พิมพ์เลขแล้วใส่ "-" ให้เอง
const buildAssetCode = (prefix, digits) => {
  if (!prefix) return digits;
  let out = prefix + digits.slice(0, 2);
  if (digits.length > 2) out += '-' + digits.slice(2, 5);
  if (digits.length > 5) out += '-' + digits.slice(5, 7);
  return out;
};

const formatAssetCode = (raw, prev = '') => {
  const up = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const shrinking = String(raw || '').length < prev.length;

  let prefix = '';
  let rest = up;
  if (/^(CO|OF)/.test(up)) { prefix = up.slice(0, 2); rest = up.slice(2); }
  else if (up[0] === 'C') { prefix = 'CO'; rest = up.slice(1); }
  else if (up[0] === 'O') { prefix = 'OF'; rest = up.slice(1); }

  let digits = rest.replace(/\D/g, '').slice(0, 7);

  // ลบ prefix ออกจนหมดเลข → คืนแค่ตัวอักษรที่เหลือ ไม่เติมให้ซ้ำ
  if (shrinking && prefix && digits === '') return up.replace(/\d/g, '').slice(0, 1);

  let result = buildAssetCode(prefix, digits);
  // ลบขีดแล้วผลลัพธ์เหมือนเดิม → ให้ลบเลขท้ายหนึ่งตัวแทน (กันติดขีดลบไม่ออก)
  if (shrinking && result === prev && digits.length > 0) {
    result = buildAssetCode(prefix, digits.slice(0, -1));
  }
  return result;
};

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 focus:outline-none';

const ITDisposalPage = () => {
  const canCreate = useCan('it-disposal', 'create');
  const canOpen = useCan('it-disposal', 'open');
  const canEdit = useCan('it-disposal', 'edit');
  const canEditRun = useCan('it-disposal', 'edit-run');
  const canDelete = useCan('it-disposal', 'delete');
  const canDeleteRun = useCan('it-disposal', 'delete-run');
  const [yearly, setYearly] = useState([]);
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  // selectedRunId = null → หน้าแรกแสดงรายการรอบ, มีค่า → เข้าไปดูรายการในรอบนั้น
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [items, setItems] = useState([]);
  const [report, setReport] = useState(null);
  const [detailTab, setDetailTab] = useState('items');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [photoItem, setPhotoItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [page, setPage] = useState(1);
  const [dupes, setDupes] = useState([]);
  const [searchWarn, setSearchWarn] = useState('');
  const [itemSort, setItemSort] = useState({ key: null, dir: 'asc' });
  const [runSort, setRunSort] = useState({ key: null, dir: 'desc' });
  const [events, setEvents] = useState([]);
  const [assetQuery, setAssetQuery] = useState('');
  const [assetResults, setAssetResults] = useState(null);
  const [assetSearching, setAssetSearching] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);
  // ลบรายการแบบรอ 5 วินาที (กด "เลิกทำ" ได้) — เก็บรายการที่รอลบอยู่
  const pendingDelRef = useRef(null);
  const flushRef = useRef(null);
  const selectedRunIdRef = useRef(null);
  selectedRunIdRef.current = selectedRunId;

  // ฟอร์มเพิ่มรายการ
  const [searchCode, setSearchCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pics, setPics] = useState({ pic1: null, pic2: null });
  const [previews, setPreviews] = useState({ pic1: '', pic2: '' });
  const [saving, setSaving] = useState(false);

  const isOpen = run?.status === 'Open';
  // ปิดรอบได้เฉพาะผู้เปิดรอบ (ตรงกับกฎฝั่ง backend)
  const isCreator = !!run && (run.createdBy || '').toUpperCase() === (user?.username || '').toUpperCase();
  // แบ่งหน้ารายการ (ถ้าข้อมูลหดจนเกินหน้า จะถูกปรับกลับไปหน้าสุดท้ายอัตโนมัติ)
  const sortedItems = itemSort.key && ITEM_SORT_VALUE[itemSort.key]
    ? [...items].sort(compareBy(ITEM_SORT_VALUE[itemSort.key], itemSort.dir))
    : items;
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pagedItems = sortedItems.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const toggleItemSort = (key) => {
    setItemSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(1);
  };
  const sortMark = (k) => (itemSort.key === k ? (itemSort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  // ─── เอกสารแนบของรอบ (PDF หลักฐาน) ────────────────────────────────────────────
  const [attachments, setAttachments] = useState([]);
  const [docType, setDocType] = useState('ACCOUNTING_DONE');
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  const [dragDoc, setDragDoc] = useState(false);

  const loadAttachments = useCallback(async (id) => {
    const d = await apiRequest(`/disposal/runs/${id}/attachments`);
    setAttachments(d.data || []);
  }, []);

  useEffect(() => {
    if (!selectedRunId) { setAttachments([]); return; }
    loadAttachments(selectedRunId).catch(() => setAttachments([]));
  }, [selectedRunId, loadAttachments]);

  const pickDocFile = (f) => {
    if (!f) return;
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (!isPdf) { setError('รองรับเฉพาะไฟล์ PDF'); return; }
    setDocFile(f);
  };

  const uploadDoc = async () => {
    if (!docFile || !selectedRunId) return;
    const fd = new FormData();
    fd.append('file', docFile);
    fd.append('docType', docType);
    fd.append('title', docTitle.trim());
    setDocUploading(true); setError('');
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}/attachments`, { method: 'POST', body: fd });
      setDocFile(null); setDocTitle('');
      setNotice('แนบเอกสารแล้ว');
      await loadAttachments(selectedRunId);
    } catch (err) {
      setError(err.message);
    } finally {
      setDocUploading(false);
    }
  };

  // เปิดไฟล์ผ่าน API ที่ต้องล็อกอิน: เปิดแท็บก่อนแล้วค่อยใส่ URL ของ blob (กัน popup blocker)
  const viewDoc = async (a) => {
    const w = window.open('', '_blank');
    try {
      const res = await fetch(`${API_BASE}/disposal/attachments/${a.attachmentId}/file`, { headers: authHeaders() });
      if (!res.ok) throw new Error('เปิดไฟล์ไม่สำเร็จ');
      const url = URL.createObjectURL(await res.blob());
      if (w) w.location.href = url; else window.open(url, '_blank');
    } catch (err) {
      if (w) w.close();
      setError(err.message);
    }
  };

  const deleteDoc = (a) => setConfirmState({
    type: 'danger',
    title: 'ลบเอกสารแนบ',
    message: `ลบ "${a.fileName}" ออกจากรอบ? ไฟล์จะถูกลบถาวร`,
    confirmText: 'ลบ',
    onConfirm: () => doDeleteDoc(a),
  });

  const doDeleteDoc = async (a) => {
    setConfirmState(null); setError('');
    try {
      await apiRequest(`/disposal/attachments/${a.attachmentId}`, { method: 'DELETE' });
      setNotice('ลบเอกสารแนบแล้ว');
      await loadAttachments(selectedRunId);
    } catch (err) {
      setError(err.message);
    }
  };

  // ─── สถานะ "เสร็จสิ้น" ───────────────────────────────────────────────────────
  const isCompleted = !!run?.completedAt;
  const hasAccountingDoc = attachments.some((a) => a.docType === 'ACCOUNTING_DONE');

  const askComplete = () => setConfirmState({
    type: 'confirm',
    title: 'ทำเป็นเสร็จสิ้น',
    message: hasAccountingDoc
      ? `ยืนยันว่า ${run.runCode} เสร็จสิ้นแล้ว? (มีเอกสาร บช. แนบอยู่แล้ว)`
      : `ยังไม่มีเอกสาร "บช. ดำเนินการทิ้งแล้ว" แนบในรอบนี้ ยืนยันว่า ${run.runCode} เสร็จสิ้นแล้วหรือไม่?`,
    confirmText: 'ยืนยันเสร็จสิ้น',
    onConfirm: () => doComplete(),
  });

  const doComplete = async () => {
    setConfirmState(null); setBusy(true); setError('');
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}/complete`, { method: 'PUT' });
      setNotice(`${run.runCode} เสร็จสิ้นแล้ว`);
      await Promise.all([loadRun(selectedRunId), loadRuns()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const askUncomplete = () => setConfirmState({
    type: 'confirm',
    title: 'ยกเลิกเสร็จสิ้น',
    message: `ยกเลิกสถานะเสร็จสิ้นของ ${run.runCode}? รอบจะกลับเป็นปิดแล้ว`,
    confirmText: 'ยกเลิกเสร็จสิ้น',
    onConfirm: () => doUncomplete(),
  });

  const doUncomplete = async () => {
    setConfirmState(null); setBusy(true); setError('');
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}/uncomplete`, { method: 'PUT' });
      setNotice(`ยกเลิกสถานะเสร็จสิ้นของ ${run.runCode} แล้ว`);
      await Promise.all([loadRun(selectedRunId), loadRuns()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // เอกสารแนบ: ฟอร์มอัปโหลดแคบอยู่ด้านซ้าย รายการอยู่ด้านขวา (จอแคบเรียงลงมา)
  const renderDocs = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {canEditRun && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">แนบเอกสาร PDF</h3>
            <p className="text-[11px] text-slate-400">ไฟล์ไม่เกิน 20 MB</p>
          </div>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragDoc(true); }}
            onDragLeave={() => setDragDoc(false)}
            onDrop={(e) => { e.preventDefault(); setDragDoc(false); pickDocFile(e.dataTransfer.files?.[0]); }}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-5 text-center cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-rose-500 ${
              dragDoc ? 'border-rose-400 bg-rose-50'
                : docFile ? 'border-emerald-300 bg-emerald-50/60'
                  : 'border-slate-300 hover:bg-slate-50'
            }`}
          >
            <FileText size={20} className={docFile ? 'text-emerald-600' : 'text-slate-400'} />
            {docFile ? (
              <>
                <span className="max-w-full truncate text-sm font-semibold text-slate-800">{docFile.name}</span>
                <span className="text-[11px] text-slate-400">{(docFile.size / 1024).toFixed(0)} KB · คลิกเพื่อเปลี่ยนไฟล์</span>
              </>
            ) : (
              <>
                <span className="text-sm text-slate-600">ลากไฟล์ PDF มาวางที่นี่</span>
                <span className="text-[11px] text-slate-400">หรือคลิกเพื่อเลือกไฟล์</span>
              </>
            )}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => { pickDocFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </label>

          <div className="grid grid-cols-1 gap-2">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              aria-label="ประเภทเอกสาร"
              className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              {Object.entries(DOC_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              maxLength={200}
              aria-label="ชื่อหรือคำอธิบายเอกสาร"
              placeholder="คำอธิบาย (ไม่บังคับ)"
              className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
          <button
            onClick={uploadDoc}
            disabled={!docFile || docUploading}
            className="w-full min-h-[40px] bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            {docUploading && <Loader2 size={15} className="animate-spin" />} อัปโหลดเอกสาร
          </button>
        </section>
      )}

      <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${canEditRun ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="font-bold text-slate-800 text-sm">เอกสารแนบ</span>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5">{attachments.length} ไฟล์</span>
        </div>
        {attachments.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <FileText size={22} className="text-slate-300" />
            <span className="text-sm text-slate-500">ยังไม่มีเอกสารแนบในรอบนี้</span>
            {canEditRun && <span className="text-[11px] text-slate-400">แนบเอกสารจากด้านซ้ายได้เลย</span>}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attachments.map((a) => (
              <li key={a.attachmentId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70">
                <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => viewDoc(a)}
                    className="block max-w-full truncate text-left text-sm font-semibold text-slate-800 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
                  >
                    {a.fileName}
                  </button>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                    <span className={`font-semibold ${a.docType === 'ACCOUNTING_DONE' ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {DOC_TYPE_LABEL[a.docType] || a.docType}
                    </span>
                    {a.title && <span className="truncate max-w-[220px] text-slate-500">· {a.title}</span>}
                    <span>· {(a.fileSize / 1024).toFixed(0)} KB</span>
                    <span>· {a.uploadedByName || '-'} · {fmtDateTime(a.uploadedAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() => viewDoc(a)}
                  title="เปิดดู"
                  aria-label={`เปิดดู ${a.fileName}`}
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <Eye size={16} />
                </button>
                {canEditRun && (
                  <button
                    onClick={() => deleteDoc(a)}
                    title="ลบเอกสาร"
                    aria-label={`ลบ ${a.fileName}`}
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-rose-500 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const loadRuns = useCallback(async () => {
    const data = await apiRequest('/disposal/runs');
    setRuns(data.data);
    return data.data;
  }, []);

  const loadRun = useCallback(async (id) => {
    const data = await apiRequest(`/disposal/runs/${id}/items`);
    setRun(data.run);
    setItems(data.items);
  }, []);

  const loadReport = useCallback(async (id) => {
    const data = await apiRequest(`/disposal/runs/${id}/report`);
    setReport(data);
  }, []);

  // เปิดหน้า: โหลดรายการรอบ (ยังไม่เข้ารอบใด)
  useEffect(() => {
    (async () => {
      try {
        await loadRuns();
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRuns]);

  // เข้าไปในรอบ → โหลดรายการ (และรายงานเมื่ออยู่แท็บรายงาน)
  useEffect(() => {
    if (!selectedRunId) return;
    loadRun(selectedRunId).catch((e) => setError(e.message));
  }, [selectedRunId, loadRun]);

  useEffect(() => {
    apiRequest('/disposal/summary/yearly').then((d) => setYearly(d.data)).catch(() => setYearly([]));
  }, [runs.length]);

  useEffect(() => {
    if (!selectedRunId || detailTab !== 'report') return;
    loadReport(selectedRunId).catch((e) => setError(e.message));
    apiRequest(`/disposal/runs/${selectedRunId}/events`).then((d) => setEvents(d.data)).catch(() => setEvents([]));
  }, [selectedRunId, detailTab, loadReport, items]);

  // preview รูปที่เลือก (revoke URL เดิมทุกครั้งที่เปลี่ยน)
  useEffect(() => {
    const u1 = pics.pic1 ? URL.createObjectURL(pics.pic1) : '';
    const u2 = pics.pic2 ? URL.createObjectURL(pics.pic2) : '';
    setPreviews({ pic1: u1, pic2: u2 });
    return () => {
      if (u1) URL.revokeObjectURL(u1);
      if (u2) URL.revokeObjectURL(u2);
    };
  }, [pics]);

  // ข้อความสำเร็จ → แสดงเป็น toast (ไม่ค้างบนหน้า)
  useEffect(() => {
    if (!notice) return;
    setToast({ id: Date.now(), message: notice });
    setNotice('');
  }, [notice]);

  // Ctrl+V นอกช่องกรอกข้อความ → วางรูปลงช่อง PIC ที่ว่างอยู่ก่อน (PicPicker จัดการการวางในกรอบเอง)
  useEffect(() => {
    if (!(found && isOpen && canCreate)) return;
    const onPaste = async (e) => {
      if (e.defaultPrevented) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const img = Array.from(e.clipboardData?.items || []).find((i) => i.kind === 'file' && IMAGE_TYPES.includes(i.type));
      if (!img) return;
      e.preventDefault();
      const f = await compressImage(img.getAsFile());
      setPics((p) => {
        if (!p.pic1) return { ...p, pic1: f };
        if (!p.pic2) return { ...p, pic2: f };
        return p;
      });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [found, isOpen, canCreate]);

  const resetForm = () => {
    setDupes([]);
    setSearchCode('');
    setForm(EMPTY_FORM);
    setFound(false);
    setPics({ pic1: null, pic2: null });
  };

  const openRun = (id) => {
    flushRef.current?.();
    setError(''); setNotice(''); setPage(1);
    resetForm();
    setDetailTab('items');
    setReport(null);
    setRun(null);
    setItems([]);
    setSelectedRunId(id);
  };

  const backToList = () => {
    flushRef.current?.();
    setSelectedRunId(null);
    setRun(null);
    setItems([]);
    setReport(null);
    setError(''); setNotice('');
    resetForm();
    loadRuns().catch((e) => setError(e.message));
  };

  // ยืนยันก่อนเปิดรอบใหม่ (modal)
  const askCreateRun = () => setConfirmState({
    type: 'confirm',
    title: 'เปิดรอบใหม่',
    message: 'ต้องการเปิดรอบ Disposal ใหม่ใช่หรือไม่?',
    confirmText: 'เปิดรอบ',
    onConfirm: () => handleCreateRun(),
  });

  const handleCreateRun = async () => {
    setConfirmState(null);
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await apiRequest('/disposal/runs', { method: 'POST' });
      await loadRuns();
      openRun(data.data.runId);
      setNotice(`เปิดรอบ ${data.data.runCode} แล้ว`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ยืนยันด้วย modal (AlertModal)
  const handleCloseRun = () => setConfirmState({
    type: 'danger',
    title: 'ปิดรอบ',
    message: `ปิดรอบ ${run.runCode}? เมื่อปิดแล้วจะเพิ่มหรือลบรายการไม่ได้ (แนบรูปเพิ่มได้)`,
    confirmText: 'ปิดรอบ',
    onConfirm: () => doCloseRun(),
  });

  // ลบรอบ (เฉพาะผู้เปิดรอบ + มีสิทธิ์ลบ) — ยืนยันด้วย modal
  const handleDeleteRun = () => setConfirmState({
    type: 'danger',
    title: 'ลบรอบ',
    message: `ลบรอบ ${run.runCode} พร้อมรายการทั้งหมดและรูปภาพ? การลบไม่สามารถย้อนกลับได้`,
    confirmText: 'ลบรอบ',
    onConfirm: () => doDeleteRun(),
  });

  const doReopenRun = async () => {
    setConfirmState(null);
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}/reopen`, { method: 'PUT' });
      await Promise.all([loadRuns(), loadRun(selectedRunId), apiRequest(`/disposal/runs/${selectedRunId}/events`).then((d) => setEvents(d.data))]);
      setNotice(`เปิด ${run.runCode} อีกครั้งแล้ว`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doDeleteRun = async () => {
    setConfirmState(null);
    const code = run?.runCode;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}`, { method: 'DELETE' });
      backToList();
      setNotice(`ลบรอบ ${code} แล้ว`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doCloseRun = async () => {
    setConfirmState(null);
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}/close`, { method: 'PUT' });
      await Promise.all([loadRuns(), loadRun(selectedRunId)]);
      setNotice(`ปิดรอบ ${run.runCode} แล้ว`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    const code = searchCode.trim().toUpperCase();
    if (!code) return;
    setSearching(true); setError(''); setNotice(''); setSearchWarn('');
    try {
      const data = await apiRequest(`/disposal/lookup/${encodeURIComponent(code)}`);
      const it = data.item;
      if (items.some((x) => x.assetNo === it.assetNo)) {
        setFound(false);
        setSearchWarn(`ASSET NO ${it.assetNo} มีอยู่ในรอบนี้แล้ว`);
        return;
      }
      setForm({
        assetNo: it.assetNo ?? code,
        assetDate: it.assetDate ?? '',
        assetName: it.assetName ?? '',
        place: it.place ?? '',
        costCenter: it.costCenter ?? '',
        cost: it.cost ?? '',
        accumDP: it.accumDP ?? '',
        bkAmt: it.bkAmt ?? '',
      });
      setPics({ pic1: null, pic2: null });
      setFound(true);
      // เตือนถ้า ASSET NO นี้เคยถูกบันทึกในรอบอื่นแล้ว
      apiRequest(`/disposal/search?assetNo=${encodeURIComponent(it.assetNo)}`)
        .then((d) => setDupes((d.data || []).filter((x) => x.assetNo === it.assetNo && x.runId !== selectedRunId)))
        .catch(() => setDupes([]));
    } catch (err) {
      setFound(false);
      setForm(EMPTY_FORM);
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  // รูปไม่บังคับ — ถ้าไม่แนบ สามารถแนบเพิ่มทีหลังจากปุ่มแนบรูปในตาราง
  const handleSave = async (e) => {
    e.preventDefault();
    if (!found) return;
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
    if (pics.pic1) fd.append('pic1', pics.pic1);
    if (pics.pic2) fd.append('pic2', pics.pic2);

    setSaving(true); setError(''); setNotice('');
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}/items`, { method: 'POST', body: fd });
      setNotice(`บันทึก ${form.assetNo} แล้ว`);
      resetForm();
      await Promise.all([loadRuns(), loadRun(selectedRunId)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => setConfirmState({
    type: 'danger',
    title: 'ลบรายการ',
    message: `ลบ ${item.assetNo} ออกจากรอบ ${run.runCode}?`,
    confirmText: 'ลบ',
    onConfirm: () => doDelete(item),
  });

  // ส่งคำสั่งลบจริงไปที่ server (เรียกเมื่อหมดเวลารอ / เปลี่ยนหน้า / ลบรายการอื่นต่อ)
  const flushPendingDelete = async () => {
    const p = pendingDelRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingDelRef.current = null;
    setToast(null);
    try {
      await apiRequest(`/disposal/items/${p.item.itemId}`, { method: 'DELETE' });
      await loadRuns();
      if (p.runId === selectedRunIdRef.current) await loadRun(p.runId);
    } catch (err) {
      setError(err.message);
      if (p.runId === selectedRunIdRef.current) loadRun(p.runId).catch(() => {});
    }
  };
  flushRef.current = flushPendingDelete;

  // เลิกทำการลบ: ยกเลิกคำสั่งที่รออยู่ แล้วโหลดรายการจาก server ใหม่ (รายการยังอยู่ครบ)
  const undoDelete = () => {
    const p = pendingDelRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingDelRef.current = null;
    setToast(null);
    loadRun(p.runId).catch((e) => setError(e.message));
  };

  useEffect(() => () => { flushRef.current?.(); }, []);

  const doDelete = (item) => {
    setConfirmState(null);
    setError('');
    flushPendingDelete();
    const runId = selectedRunId;
    setItems((prev) => prev.filter((i) => i.itemId !== item.itemId));
    // ปรับยอดรวมในหัวการ์ดทันที (ตัวเลขจริงจะโหลดจาก server อีกครั้งตอนยืนยันการลบ)
    setRun((r) => r ? {
      ...r,
      itemCount: Math.max(0, (Number(r.itemCount) || 0) - 1),
      totalCost: (Number(r.totalCost) || 0) - (Number(item.cost) || 0),
      totalAccumDP: (Number(r.totalAccumDP) || 0) - (Number(item.accumDP) || 0),
      totalBkAmt: (Number(r.totalBkAmt) || 0) - (Number(item.bkAmt) || 0),
    } : r);
    const timer = setTimeout(() => flushPendingDelete(), 5000);
    pendingDelRef.current = { item, timer, runId };
    setToast({ id: Date.now(), message: `ลบ ${item.assetNo} แล้ว`, duration: 5000, action: { label: 'เลิกทำ', onClick: undoDelete } });
  };

  // Export Excel — คอลัมน์ตามที่กำหนด: ASSET NO, ASSET DATE, ASSET NAME, PLACE, COSTCENTER, COST, ACCUMDP, BKAMT, PIC 1, PIC 2
  const handleExport = () => {
    if (!items.length || !run) return;
    const header = ['ASSET NO', 'ASSET DATE', 'ASSET NAME', 'PLACE', 'COSTCENTER', 'COST', 'ACCUMDP', 'BKAMT', 'PIC 1', 'PIC 2'];
    const rows = items.map((i) => [
      i.assetNo,
      fmtDate(i.assetDate),
      i.assetName ?? '',
      i.place ?? '',
      i.costCenter ?? '',
      i.cost != null ? Number(i.cost) : '',
      i.accumDP != null ? Number(i.accumDP) : '',
      i.bkAmt != null ? Number(i.bkAmt) : '',
      imgUrl(i.pic1Url),
      imgUrl(i.pic2Url),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [18, 12, 45, 45, 13, 14, 14, 14, 60, 60].map((wch) => ({ wch }));

    const thin = { style: 'thin', color: { rgb: 'CBD5E1' } };
    const border = { top: thin, bottom: thin, left: thin, right: thin };
    header.forEach((_, c) => {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FFE4E6' } }, alignment: { horizontal: 'center', vertical: 'center' }, border };
    });
    rows.forEach((_, r) => {
      [5, 6, 7].forEach((c) => {
        const ref = XLSX.utils.encode_cell({ r: r + 1, c });
        if (ws[ref]) ws[ref].z = '#,##0.00';
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, run.runCode.slice(0, 31));
    XLSX.writeFile(wb, `${run.runCode}.xlsx`);
  };

  // พิมพ์ / บันทึกเป็น PDF — เปิดหน้าตารางแยก (มีคอลัมน์รูป PIC 1 / PIC 2) แล้วสั่ง print ของ browser
  const handlePrintPdf = () => {
    if (!items.length || !run) return;
    const esc = (v) => String(v ?? '-').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pic = (url) => (url ? `<img src="${esc(imgUrl(url))}" />` : '<span class="none">-</span>');
    const rowsHtml = items.map((i, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td class="b">${esc(i.assetNo)}</td>
        <td>${esc(fmtDate(i.assetDate))}</td>
        <td>${esc(i.assetName)}</td>
        <td>${esc(i.place)}</td>
        <td>${esc(i.costCenter)}</td>
        <td class="r">${esc(fmtMoney(i.cost))}</td>
        <td class="r">${esc(fmtMoney(i.accumDP))}</td>
        <td class="r">${esc(fmtMoney(i.bkAmt))}</td>
        <td class="pic">${pic(i.pic1Url)}</td>
        <td class="pic">${pic(i.pic2Url)}</td>
      </tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(run.runCode)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm 10mm 14mm; }
  @page { @bottom-left { content: "${esc(run.runCode)} · พิมพ์ ${esc(fmtDateTime(new Date()))}"; font-size: 8px; color: #64748b; } }
  @page { @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font-size: 8px; color: #64748b; } }
  thead { display: table-header-group; }
  body { font-family: 'Sarabun', Tahoma, sans-serif; color: #1e293b; font-size: 11px; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .meta { color: #64748b; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 5px; vertical-align: middle; text-align: left; }
  th { background: #ffe4e6; font-weight: 700; text-align: center; }
  td.r { text-align: right; white-space: nowrap; }
  td.b { font-weight: 700; white-space: nowrap; }
  td.pic { text-align: center; width: 110px; }
  td.pic img { width: 100px; height: 75px; object-fit: contain; }
  .none { color: #94a3b8; }
  tfoot td { font-weight: 700; background: #f8fafc; }
  tr { page-break-inside: avoid; }
</style></head><body>
  <h1>IT ASSET DISPOSAL — ${esc(run.runCode)}</h1>
  <div class="meta">สถานะ: ${run.status === 'Open' ? 'เปิดอยู่' : 'ปิดแล้ว'} · จำนวน ${items.length} รายการ · พิมพ์เมื่อ ${esc(fmtDateTime(new Date()))}</div>
  <table>
    <thead><tr>
      <th>#</th><th>ASSET NO</th><th>ASSET DATE</th><th>ASSET NAME</th><th>PLACE</th><th>COSTCENTER</th>
      <th>COST</th><th>ACCUMDP</th><th>BKAMT</th><th>PIC 1</th><th>PIC 2</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr>
      <td colspan="6" class="r">รวม</td>
      <td class="r">${esc(fmtMoney(totals.cost))}</td>
      <td class="r">${esc(fmtMoney(totals.accum))}</td>
      <td class="r">${esc(fmtMoney(totals.bk))}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>
  <script>
    // รอให้รูปโหลดครบแล้วค่อยเปิดหน้าต่างพิมพ์ (เลือก "Save as PDF" ได้ในหน้าพิมพ์)
    window.onload = () => {
      const imgs = Array.from(document.images);
      Promise.all(imgs.map((im) => im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; })))
        .then(() => setTimeout(() => window.print(), 200));
    };
  </script>
</body></html>`;
    // พิมพ์ผ่าน iframe ที่ซ่อนอยู่ในหน้าเดิม — ไม่เปิดแท็บใหม่ และไม่โดนบล็อกป๊อปอัป
    // สคริปต์ในเอกสารจะรอรูปโหลดครบแล้วสั่งพิมพ์เอง (เลือก "บันทึกเป็น PDF" ได้ในหน้าต่างพิมพ์)
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => setTimeout(() => frame.remove(), 500);
    frame.contentWindow.addEventListener('afterprint', cleanup);
    setTimeout(() => { if (frame.isConnected) frame.remove(); }, 10 * 60 * 1000);
  };

  const totals = run
    ? { count: run.itemCount, cost: run.totalCost, accum: run.totalAccumDP, bk: run.totalBkAmt }
    : { count: 0, cost: 0, accum: 0, bk: 0 };

  // ─── หน้าแรก: รายการรอบ (กรองตามปี / สถานะ / รหัส + แบ่งหน้า) ─────────────────
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [runQuery, setRunQuery] = useState('');
  const [runPage, setRunPage] = useState(1);
  const [recorderFilter, setRecorderFilter] = useState('all');
  const RUN_PAGE_SIZE = 12;
  const yearOf = (r) => new Date(r.createdAt).getFullYear();
  const years = [...new Set(runs.map(yearOf).filter(Number.isFinite))].sort((a, b) => b - a);
  const recorders = [...new Set(runs.map((r) => r.createdByName).filter(Boolean))].sort();
  // รอบค้าง = ปิดแล้วแต่ยังไม่เสร็จสิ้น (เรียงจากปิดนานที่สุดก่อน)
  const outstandingRuns = runs
    .filter((r) => r.status === 'Closed' && !r.completedAt)
    .sort((a, b) => new Date(a.closedAt || 0) - new Date(b.closedAt || 0));
  // สรุปหน้าแรก: จำนวนตามสถานะ และสิ่งที่ต้องทำต่อ
  const stateCount = { open: 0, closed: 0, completed: 0 };
  runs.forEach((r) => { stateCount[runState(r)] += 1; });
  const closedNoDoc = runs.filter((r) => r.status === 'Closed' && !r.completedAt && !(r.accountingDocCount > 0));
  const missingPhotoRuns = runs.filter((r) => (r.itemCount || 0) > (r.fullPhotoCount || 0));
  const overdueRuns = outstandingRuns.filter((r) => daysSince(r.closedAt) > 30);
  const todoCount = closedNoDoc.length + missingPhotoRuns.length + overdueRuns.length;
  // กราฟ COST รายเดือน: ใช้ปีที่เลือกอยู่ (ถ้าเลือก "ทั้งหมด" ใช้ปีล่าสุด)
  const chartYear = yearFilter !== 'all' ? Number(yearFilter) : (years[0] ?? new Date().getFullYear());
  const monthlyCost = Array.from({ length: 12 }, (_, m) =>
    runs
      .filter((r) => yearOf(r) === chartYear && new Date(r.createdAt).getMonth() === m)
      .reduce((s, r) => s + Number(r.totalCost || 0), 0)
  );
  const maxMonthlyCost = Math.max(1, ...monthlyCost);
  const filteredRuns = runs.filter((r) =>
    (recorderFilter === 'all' || r.createdByName === recorderFilter) &&
    (yearFilter === 'all' || String(yearOf(r)) === yearFilter) &&
    (statusFilter === 'all' || runState(r) === statusFilter) &&
    (!runQuery || r.runCode.toLowerCase().includes(runQuery.trim().toLowerCase()))
  );
  const runTotalPages = Math.max(1, Math.ceil(filteredRuns.length / RUN_PAGE_SIZE));
  const curRunPage = Math.min(runPage, runTotalPages);
  const sortedRuns = runSort.key && RUN_SORT_VALUE[runSort.key]
    ? [...filteredRuns].sort(compareBy(RUN_SORT_VALUE[runSort.key], runSort.dir))
    : filteredRuns;
  const pagedRuns = sortedRuns.slice((curRunPage - 1) * RUN_PAGE_SIZE, curRunPage * RUN_PAGE_SIZE);
  const chip = (active) => `px-3 py-1.5 rounded-lg text-xs font-bold transition ${active ? 'bg-rose-600 text-white shadow' : 'bg-white text-slate-500 border border-slate-200 hover:text-slate-700'}`;
  const resetRunPage = () => setRunPage(1);

  if (!selectedRunId) {
    return (
      <div className="itd p-6 bg-slate-50 min-h-screen"><style>{ITD_CSS}</style>
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-rose-600 text-white p-2.5 rounded-xl shadow-lg shadow-rose-200">
              <Trash2 size={22} />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800 flex items-center gap-3 flex-wrap">
                IT ASSET DISPOSAL
                {runs.some((r) => r.status === 'Open') && (
                  <span className="text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    เปิดอยู่ {runs.filter((r) => r.status === 'Open').length} รอบ
                  </span>
                )}
              </h2>
              <p className="text-sm text-slate-400 font-medium">แสดง {filteredRuns.length} จาก {runs.length} รอบ</p>
            </div>
          </div>
          {canOpen && (
            <button onClick={askCreateRun} disabled={busy} className="bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-rose-200 whitespace-nowrap">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} เปิดรอบใหม่
            </button>
          )}
        </header>

        {error && (
          <div className="mb-4 flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-4 py-3 text-sm font-medium">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        <Toast toast={toast} onClose={() => setToast(null)} />

        <AlertModal
          isOpen={!!confirmState}
          type={confirmState?.type || 'confirm'}
          title={confirmState?.title}
          message={confirmState?.message}
          confirmText={confirmState?.confirmText || 'ยืนยัน'}
          cancelText="ยกเลิก"
          onConfirm={() => confirmState?.onConfirm()}
          onCancel={() => setConfirmState(null)}
        />

        {/* สรุปหน้าแรก: กดตัวเลขเพื่อกรองรายการ + สิ่งที่ต้องทำต่อ */}
        {runs.length > 0 && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {[
                { l: 'เปิดอยู่', v: stateCount.open, f: 'open', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { l: 'ปิดแล้ว', v: stateCount.closed, f: 'closed', tone: 'text-slate-700 bg-white border-slate-200' },
                { l: 'เสร็จสิ้น', v: stateCount.completed, f: 'completed', tone: 'text-sky-700 bg-sky-50 border-sky-200' },
                { l: 'รอบค้าง', v: outstandingRuns.length, f: 'closed', tone: 'text-amber-700 bg-amber-50 border-amber-200' },
              ].map((t) => (
                <button
                  key={t.l}
                  onClick={() => { setStatusFilter(t.f); resetRunPage(); }}
                  className={`text-left rounded-2xl border p-3 shadow-sm hover:shadow transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${t.tone}`}
                >
                  <div className="text-xs font-semibold opacity-80">{t.l}</div>
                  <div className="text-2xl font-black tabular-nums">{t.v}</div>
                </button>
              ))}
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-slate-800">ต้องทำต่อ</div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${todoCount ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                  {todoCount ? `${todoCount} เรื่อง` : 'ไม่มีเรื่องค้าง'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { l: 'ปิดแล้วแต่ยังไม่มีหลักฐาน บช.', list: closedNoDoc },
                  { l: 'รายการที่รูปไม่ครบ', list: missingPhotoRuns },
                  { l: 'รอบค้างเกิน 30 วัน', list: overdueRuns },
                ].map((g) => (
                  <div key={g.l} className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                      <span>{g.l}</span>
                      <span className="tabular-nums text-slate-800">{g.list.length}</span>
                    </div>
                    {g.list.length === 0 ? (
                      <div className="text-[11px] text-slate-400 mt-1">ไม่มี</div>
                    ) : (
                      <ul className="mt-1.5 space-y-1">
                        {g.list.slice(0, 3).map((r) => (
                          <li key={r.runId}>
                            <button onClick={() => openRun(r.runId)} className="w-full text-left text-xs font-semibold text-rose-700 hover:underline truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded">
                              {r.runCode}
                            </button>
                          </li>
                        ))}
                        {g.list.length > 3 && <li className="text-[11px] text-slate-400">และอีก {g.list.length - 3} รอบ</li>}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* รอบค้าง: ปิดแล้วแต่ยังไม่เสร็จสิ้น — เตือนให้ตามเรื่อง บช. */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="font-bold text-slate-800">รอบค้าง <span className="text-xs font-normal text-slate-400">(ปิดแล้ว แต่ยังไม่เสร็จสิ้น)</span></div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${outstandingRuns.length ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {outstandingRuns.length ? `${outstandingRuns.length} รอบ` : 'ไม่มีรอบค้าง'}
            </span>
          </div>
          {outstandingRuns.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {outstandingRuns.slice(0, 5).map((r) => (
                <li key={r.runId}>
                  <button onClick={() => openRun(r.runId)} className="w-full flex items-center justify-between gap-3 py-2 text-left text-sm hover:text-rose-600">
                    <span className="font-semibold text-slate-800">{r.runCode}</span>
                    <span className={`text-xs font-semibold ${daysSince(r.closedAt) > 30 ? 'text-rose-600' : 'text-amber-700'}`}>
                      ปิดมาแล้ว {daysSince(r.closedAt)} วัน
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {outstandingRuns.length > 5 && (
            <div className="text-xs text-slate-400 mt-2">และอีก {outstandingRuns.length - 5} รอบ (กรองสถานะ "ปิดแล้ว" เพื่อดูทั้งหมด)</div>
          )}
        </section>

        {/* สรุปรายปี (ตามปีที่เปิดรอบ) */}
        {yearly.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800">สรุปรายปี <span className="text-xs font-normal text-slate-400">(ตามปีที่เปิดรอบ)</span></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">ปี</th>
                    <th className="px-4 py-2 text-right">รอบ</th>
                    <th className="px-4 py-2 text-right">รายการ</th>
                    <th className="px-4 py-2 text-right">COST</th>
                    <th className="hidden sm:table-cell px-4 py-2 text-right">ACCUMDP</th>
                    <th className="hidden sm:table-cell px-4 py-2 text-right">BKAMT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {yearly.map((y) => (
                    <tr key={y.year}>
                      <td className="px-4 py-2 font-bold text-slate-800">{y.year}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{y.runs}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{y.items}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(y.totalCost)}</td>
                      <td className="hidden sm:table-cell px-4 py-2 text-right tabular-nums">{fmtMoney(y.totalAccumDP)}</td>
                      <td className="hidden sm:table-cell px-4 py-2 text-right tabular-nums">{fmtMoney(y.totalBkAmt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4 border-t border-slate-100">
              <div className="text-xs text-slate-400 mb-2">COST รายเดือน ปี {chartYear} <span className="text-slate-300">(วันที่เปิดรอบ · วางเมาส์เพื่อดูตัวเลข)</span></div>
              <div className="flex items-end gap-1.5 h-24">
                {monthlyCost.map((v, m) => (
                  <div key={m} className="flex-1 h-full flex flex-col items-center justify-end" title={`เดือน ${m + 1}: ${fmtMoney(v)}`}>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-rose-500 to-rose-300 hover:from-rose-600 transition-all duration-500"
                      style={{ height: `${(v / maxMonthlyCost) * 100}%`, minHeight: v > 0 ? '4px' : '0px' }}
                    />
                    <span className="text-[10px] text-slate-400 mt-1 tabular-nums">{m + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ค้นหา ASSET NO ข้ามทุกรอบ */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const q = assetQuery.trim().toUpperCase();
              if (q.length < 3) return;
              setAssetSearching(true);
              try {
                const d = await apiRequest(`/disposal/search?assetNo=${encodeURIComponent(q)}`);
                setAssetResults(d.data);
              } catch (err) {
                setError(err.message);
              } finally {
                setAssetSearching(false);
              }
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={assetQuery}
                onChange={(e) => { setAssetQuery(e.target.value.toUpperCase()); setAssetResults(null); }}
                placeholder="ค้นหา ASSET NO ข้ามทุกรอบ (พิมพ์อย่างน้อย 3 ตัว)"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <button type="submit" disabled={assetSearching || assetQuery.trim().length < 3} className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold">
              {assetSearching ? 'กำลังค้นหา...' : 'ค้นหา'}
            </button>
          </form>
          {assetResults && (
            <div className="mt-3 divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
              {assetResults.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">ไม่พบ ASSET NO นี้ในทุกรอบ</div>}
              {assetResults.map((r) => (
                <button key={r.itemId} onClick={() => openRun(r.runId)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-bold text-slate-800">{r.assetNo}</span>
                  <span className="text-slate-500 truncate max-w-[40%]">{r.assetName}</span>
                  <span className="text-rose-600 font-semibold">{r.runCode}</span>
                  <span className="text-xs text-slate-400">{r.runStatus === 'Open' ? 'เปิดอยู่' : 'ปิดแล้ว'} · {r.createdByName || '-'} · {fmtDateTime(r.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {!loading && runs.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
            ยังไม่มีรอบ Disposal {canOpen && '— กด "เปิดรอบใหม่" เพื่อเริ่ม'}
          </div>
        )}

        {runs.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-bold text-slate-400 w-14">ปี</span>
              <button className={chip(yearFilter === 'all')} onClick={() => { setYearFilter('all'); resetRunPage(); }}>ทั้งหมด ({runs.length})</button>
              {years.map((y) => (
                <button key={y} className={chip(yearFilter === String(y))} onClick={() => { setYearFilter(String(y)); resetRunPage(); }}>
                  {y} ({runs.filter((r) => yearOf(r) === y).length})
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-bold text-slate-400 w-14">สถานะ</span>
              {[{ k: 'all', l: 'ทั้งหมด' }, { k: 'open', l: 'เปิดอยู่' }, { k: 'closed', l: 'ปิดแล้ว' }, { k: 'completed', l: 'เสร็จสิ้น' }].map((s) => (
                <button key={s.k} className={chip(statusFilter === s.k)} onClick={() => { setStatusFilter(s.k); resetRunPage(); }}>{s.l}</button>
              ))}
              <select
                value={runSort.key || ''}
                onChange={(e) => setRunSort(e.target.value ? { key: e.target.value, dir: e.target.value === 'runCode' ? 'asc' : 'desc' } : { key: null, dir: 'desc' })}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                title="เรียงลำดับรอบ"
              >
                <option value="">เรียงตาม: ล่าสุด</option>
                {RUN_SORT_LABELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {runSort.key && (
                <button
                  onClick={() => setRunSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50"
                >
                  {runSort.dir === 'asc' ? '▲' : '▼'}
                </button>
              )}
              <div className="relative ml-auto w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={runQuery}
                  onChange={(e) => { setRunQuery(e.target.value); resetRunPage(); }}
                  placeholder="ค้นหารหัสรอบ"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>
            {recorders.length > 1 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold text-slate-400 w-14">ผู้เปิด</span>
                <button className={chip(recorderFilter === 'all')} onClick={() => { setRecorderFilter('all'); resetRunPage(); }}>ทุกคน</button>
                {recorders.map((name) => (
                  <button key={name} className={chip(recorderFilter === name)} onClick={() => { setRecorderFilter(name); resetRunPage(); }}>
                    {name} ({runs.filter((r) => r.createdByName === name).length})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {runs.length > 0 && filteredRuns.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm">ไม่พบรอบตามตัวกรอง</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {loading && runs.length === 0 && [0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
              <div className="h-5 w-40 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-56 bg-slate-100 rounded mb-5" />
              <div className="grid grid-cols-3 gap-3">
                <div className="h-8 bg-slate-100 rounded" />
                <div className="h-8 bg-slate-100 rounded" />
                <div className="h-8 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
          {pagedRuns.map((r) => {
            const open = r.status === 'Open';
            return (
              <button
                key={r.runId}
                onClick={() => openRun(r.runId)}
                className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-rose-300 transition-all p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-black text-slate-800 text-lg break-all">{r.runCode}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      เปิดเมื่อ {fmtDateTime(r.createdAt)}{r.createdByName ? ` · ${r.createdByName}` : ''}
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    runState(r) === 'open' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : runState(r) === 'completed' ? 'bg-sky-50 text-sky-700 border-sky-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {runState(r) === 'completed' && <CheckCircle2 size={12} />}
                    {RUN_STATE_LABEL[runState(r)]}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-400">รายการ</div>
                    <div className="font-bold text-slate-800 text-lg">{r.itemCount}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">รวม COST</div>
                    <div className="font-bold text-slate-800 tabular-nums">{fmtMoney(r.totalCost)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">รวม BKAMT</div>
                    <div className="font-bold text-slate-800 tabular-nums">{fmtMoney(r.totalBkAmt)}</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <ProgressRing pct={r.itemCount ? Math.round(((r.fullPhotoCount ?? 0) / r.itemCount) * 100) : 0} />
                  <div className="text-xs text-slate-500 leading-snug">
                    <div>รูปครบ 2 รูป</div>
                    <div className="font-semibold text-slate-700">{r.fullPhotoCount ?? 0} / {r.itemCount} รายการ</div>
                  </div>
                </div>
                {!open && r.closedAt && (
                  <div className="text-xs text-slate-400 mt-3">ปิดเมื่อ {fmtDateTime(r.closedAt)}{r.closedBy ? ` · ${r.closedBy}` : ''}</div>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-4 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <Pagination
            currentPage={curRunPage}
            totalPages={runTotalPages}
            onPageChange={setRunPage}
            itemsPerPage={RUN_PAGE_SIZE}
            totalItems={filteredRuns.length}
          />
        </div>
      </div>
    );
  }

  // ─── ภายในรอบ: รายการ / รายงาน ─────────────────────────────────────────────
  return (
    <div className="itd p-6 bg-slate-50 min-h-screen"><style>{ITD_CSS}</style>
      <header className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={backToList} className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100" title="กลับไปหน้ารายการรอบ">
            <ArrowLeft size={18} />
          </button>
          <div className="bg-rose-600 text-white p-2.5 rounded-xl shadow-lg shadow-rose-200">
            <Trash2 size={22} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl xl:text-3xl font-black text-slate-800 whitespace-nowrap">{run?.runCode ?? '...'}</h2>
            <p className="text-sm text-slate-400 font-medium">
              {run ? `${isOpen ? 'เปิดอยู่' : isCompleted ? 'เสร็จสิ้น' : 'ปิดแล้ว'}${run.createdByName ? ` · เปิดโดย ${run.createdByName}` : ''}` : 'กำลังโหลด...'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canEditRun && isOpen && isCreator && (
            <button onClick={handleCloseRun} disabled={busy} className="bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap">
              <Lock size={16} /> ปิดรอบ
            </button>
          )}
          <button onClick={handlePrintPdf} disabled={!items.length} className="bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap">
            <Printer size={16} /> พิมพ์ / PDF
          </button>
          {canEditRun && run?.status === 'Closed' && !isCompleted && (
            <button onClick={askComplete} disabled={busy} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap shadow-lg shadow-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} ทำเป็นเสร็จสิ้น
            </button>
          )}
          {canEditRun && isCompleted && (
            <button onClick={askUncomplete} disabled={busy} className="bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-600 border border-slate-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              ยกเลิกเสร็จสิ้น
            </button>
          )}
          {isAdmin && run?.status === 'Closed' && (
            <button onClick={() => setConfirmState({
              type: 'confirm',
              title: 'เปิดรอบอีกครั้ง',
              message: `เปิด ${run.runCode} ให้แก้ไขอีกครั้ง? (เฉพาะ Admin)`,
              confirmText: 'เปิดรอบอีกครั้ง',
              onConfirm: () => doReopenRun(),
            })} disabled={busy} className="bg-white hover:bg-amber-50 disabled:opacity-60 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap">
              <Lock size={16} /> เปิดรอบอีกครั้ง
            </button>
          )}
          {canDeleteRun && isCreator && (
            <button onClick={handleDeleteRun} disabled={busy} className="bg-white hover:bg-rose-50 disabled:opacity-60 text-rose-600 border border-rose-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap">
              <Trash2 size={16} /> ลบรอบ
            </button>
          )}
          <button onClick={handleExport} disabled={!items.length} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 whitespace-nowrap">
            <FileSpreadsheet size={18} /> Export Excel
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-4 py-3 text-sm font-medium">
          <AlertTriangle size={16} /> {error}
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* ความคืบหน้าของรอบ + สิ่งที่ต้องทำต่อ */}
      {run && (() => {
        const accountingDoc = attachments.find((a) => a.docType === 'ACCOUNTING_DONE');
        const steps = [
          { label: 'เปิดรอบ', done: true, at: run.createdAt, by: run.createdByName || run.createdBy },
          { label: 'ปิดรอบ', done: run.status !== 'Open', at: run.status !== 'Open' ? run.closedAt : null, by: run.status !== 'Open' ? run.closedBy : null },
          { label: 'มีหลักฐาน บช.', done: hasAccountingDoc, at: accountingDoc?.uploadedAt ?? null, by: accountingDoc?.uploadedByName ?? null },
          { label: 'เสร็จสิ้น', done: isCompleted, at: isCompleted ? run.completedAt : null, by: isCompleted ? (run.completedByName || run.completedBy) : null },
        ];
        const currentIdx = steps.findIndex((s) => !s.done);
        const missingPhotos = items.filter((i) => !i.pic1Url || !i.pic2Url);
        const doneDays = isCompleted && run.createdAt
          ? Math.max(0, Math.round((new Date(run.completedAt) - new Date(run.createdAt)) / 86400000))
          : null;
        return (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5 grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <div className="text-xs font-bold text-slate-500 mb-3">ความคืบหน้าของรอบ</div>
              <ol className="flex items-start">
                {steps.map((s, i) => (
                  <Fragment key={s.label}>
                    {i > 0 && <li aria-hidden="true" className={`flex-1 h-0.5 mt-3.5 mx-1 rounded ${steps[i - 1].done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                    <li className="flex flex-col items-center text-center w-24 shrink-0" aria-current={i === currentIdx ? 'step' : undefined}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        s.done ? 'bg-emerald-500 text-white'
                          : i === currentIdx ? 'bg-white text-rose-600 ring-2 ring-rose-500'
                            : 'bg-slate-100 text-slate-400'
                      }`}>
                        {s.done ? <CheckCircle2 size={14} /> : i + 1}
                      </span>
                      <span className={`mt-1.5 text-[11px] font-semibold leading-tight ${s.done || i === currentIdx ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
                      {s.at && <span className="text-[10px] text-slate-500 leading-tight mt-0.5">{fmtDateTime(s.at)}</span>}
                      {s.by && <span className="text-[10px] text-slate-400 leading-tight truncate max-w-full">{s.by}</span>}
                    </li>
                  </Fragment>
                ))}
              </ol>
              {doneDays !== null && (
                <div className="mt-3 text-xs text-slate-500">ใช้เวลาจากเปิดรอบถึงเสร็จสิ้น <b className="text-slate-800">{doneDays} วัน</b></div>
              )}
              {run.status === 'Closed' && !isCompleted && (
                <div className="mt-3 text-xs text-slate-500">ปิดมาแล้ว <b className="text-slate-800">{daysSince(run.closedAt)} วัน</b></div>
              )}
            </div>

            <div className="lg:col-span-2 space-y-2">
              <div className="text-xs font-bold text-slate-500">สิ่งที่ต้องทำต่อ</div>
              {run.status === 'Open' && (
                <div className="text-sm text-slate-600 rounded-lg bg-slate-50 px-3 py-2">ปิดรอบเมื่อบันทึกรายการครบแล้ว</div>
              )}
              {run.status === 'Closed' && !hasAccountingDoc && !isCompleted && (
                <button onClick={() => setDetailTab('docs')} className="w-full text-left text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                  แนบหลักฐาน บช. ว่าทิ้งแล้ว →
                </button>
              )}
              {run.status === 'Closed' && hasAccountingDoc && !isCompleted && canEditRun && (
                <button onClick={askComplete} className="w-full text-left text-sm rounded-lg bg-sky-50 text-sky-800 px-3 py-2 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                  มีหลักฐาน บช. แล้ว ทำเป็นเสร็จสิ้น →
                </button>
              )}
              {missingPhotos.length > 0 && (
                <div className="rounded-lg bg-amber-50 px-3 py-2">
                  <div className="text-sm text-amber-800 font-semibold">รายการที่รูปไม่ครบ {missingPhotos.length} รายการ</div>
                  <ul className="mt-1 space-y-1">
                    {missingPhotos.slice(0, 3).map((it) => (
                      <li key={it.itemId} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700 truncate">{it.assetNo}</span>
                        {canEdit && (
                          <button onClick={() => setPhotoItem(it)} className="shrink-0 font-bold text-rose-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded">แนบรูป</button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {missingPhotos.length > 3 && <div className="text-[11px] text-slate-500 mt-1">และอีก {missingPhotos.length - 3} รายการ</div>}
                </div>
              )}
              {missingPhotos.length === 0 && run.status !== 'Open' && hasAccountingDoc && isCompleted && (
                <div className="text-sm text-emerald-700 rounded-lg bg-emerald-50 px-3 py-2">ครบทุกขั้นตอนแล้ว</div>
              )}
            </div>
          </section>
        );
      })()}

      <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm mb-6">
        {[
          { k: 'items', label: 'รายการ' },
          { k: 'report', label: 'รายงาน' },
          { k: 'docs', label: `เอกสารแนบ${attachments.length ? ` (${attachments.length})` : ''}` },
        ].map((t) => (
          <button key={t.k} onClick={() => setDetailTab(t.k)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition ${detailTab === t.k ? 'bg-rose-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {detailTab === 'docs' ? renderDocs() : detailTab === 'report' ? (
        <>
          {/* สถานะเอกสารและการเสร็จสิ้นของรอบ */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center gap-2">
            <FileText size={18} className="text-rose-500" />
            <span className="font-bold text-slate-800 mr-1">เอกสารแนบ {attachments.length} ไฟล์</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
              attachments.some((a) => a.docType === 'ACCOUNTING_DONE')
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {attachments.some((a) => a.docType === 'ACCOUNTING_DONE') ? 'มีหลักฐาน บช. แล้ว' : 'ยังไม่มีหลักฐาน บช.'}
            </span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
              isCompleted ? 'bg-sky-50 text-sky-700 border-sky-200'
                : isOpen ? 'bg-slate-100 text-slate-600 border-slate-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {isCompleted ? `เสร็จสิ้นเมื่อ ${fmtDate(run.completedAt)}` : isOpen ? 'ยังเปิดอยู่' : 'ยังไม่เสร็จสิ้น'}
            </span>
            <button onClick={() => setDetailTab('docs')} className="ml-auto text-xs font-bold text-rose-600 hover:underline">
              ไปที่เอกสารแนบ
            </button>
          </section>
          <PriceReport items={items} />
          <ReportView report={report} events={events} onAttachPhoto={(item) => setPhotoItem(item)} canEdit={canEdit} />
        </>
      ) : (
        <>
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 ${run ? '' : 'animate-pulse opacity-50'}`}>
            <MiniStat icon={Trash2} title="จำนวนรายการ" value={totals.count} color="from-rose-500 to-rose-600" />
            <MiniStat icon={Coins} title="รวม COST" value={fmtMoney(totals.cost)} color="from-slate-500 to-slate-700" />
            <MiniStat icon={Coins} title="รวม ACCUMDP" value={fmtMoney(totals.accum)} color="from-amber-400 to-amber-500" />
            <MiniStat icon={Coins} title="รวม BKAMT" value={fmtMoney(totals.bk)} color="from-emerald-400 to-emerald-600" />
          </div>

          {/* ฟอร์มเพิ่มรายการ — แสดงเฉพาะรอบที่เปิดอยู่ */}
          {isOpen && canCreate && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
              <h3 className="font-bold text-slate-800 mb-3">
                เพิ่มรายการ
                {found && <span className="ml-2 text-xs font-normal text-slate-400">กด Ctrl+V เพื่อวางรูปลงช่องว่างถัดไป</span>}
              </h3>
              <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1 max-w-md">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchCode}
                    onChange={(e) => { setSearchCode(formatAssetCode(e.target.value, searchCode)); setSearchWarn(''); }}
                    placeholder="ค้นหา ASSET NO เช่น CO24-017-02"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <button type="submit" disabled={searching || !searchCode.trim()} className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2">
                  {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} ค้นหา Fixed Asset
                </button>
              </form>

              {searchWarn && (
                <div className="mb-3 -mt-2 flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-4 py-2.5 text-sm font-medium">
                  <AlertTriangle size={16} className="shrink-0" /> {searchWarn}
                </div>
              )}
              {found && dupes.length > 0 && (
                <div className="mb-3 flex items-start gap-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-4 py-2.5 text-sm">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    ASSET NO นี้เคยถูกบันทึกในรอบอื่นแล้ว: {dupes.map((d) => d.runCode).join(', ')}
                  </div>
                </div>
              )}
              {found && (
                <form onSubmit={handleSave} className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2">
                    <Field label="ASSET NO" value={form.assetNo} />
                    <Field label="ASSET DATE" value={fmtDate(form.assetDate)} />
                    <Field label="ASSET NAME" value={form.assetName} className="col-span-2" />
                    <Field label="PLACE" value={form.place} className="col-span-2" />
                    <Field label="COSTCENTER" value={form.costCenter} />
                    <Field label="COST" value={fmtMoney(form.cost)} />
                    <Field label="ACCUMDP" value={fmtMoney(form.accumDP)} />
                    <Field label="BKAMT" value={fmtMoney(form.bkAmt)} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PicPicker label="PIC 1 (ไม่บังคับ)" file={pics.pic1} preview={previews.pic1}
                      onChange={(f) => setPics((p) => ({ ...p, pic1: f }))} />
                    <PicPicker label="PIC 2 (ไม่บังคับ)" file={pics.pic2} preview={previews.pic2}
                      onChange={(f) => setPics((p) => ({ ...p, pic2: f }))} />
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" disabled={saving} className="bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-rose-200">
                      {saving && <Loader2 size={16} className="animate-spin" />} บันทึกรายการ
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}

          {/* รายการแบบการ์ด — มือถือและ iPad แนวตั้ง (จอต่ำกว่า lg) */}
          <div className="xl:hidden space-y-2">
            {items.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
                {isOpen ? 'ยังไม่มีรายการ — ค้นหา ASSET NO เพื่อเพิ่ม' : 'ไม่มีรายการในรอบนี้'}
              </div>
            )}
            {pagedItems.map((it, idx) => (
              <div key={it.itemId} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-slate-800 break-all">{it.assetNo}</span>
                      <button
                        type="button"
                        title="คัดลอก ASSET NO"
                        aria-label={`คัดลอก ${it.assetNo}`}
                        onClick={async () => {
                          const ok = await copyText(it.assetNo);
                          setToast({ id: Date.now(), message: ok ? `คัดลอก ${it.assetNo} แล้ว` : 'คัดลอกไม่สำเร็จ', duration: 1500 });
                        }}
                        className="shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <div className="text-sm text-slate-700 break-words">{it.assetName || '-'}</div>
                    <div className="text-xs text-slate-400 break-words">{it.place || '-'}</div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0">#{(curPage - 1) * PAGE_SIZE + idx + 1}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div><div className="text-slate-400">COST</div><div className="font-bold text-slate-800 tabular-nums">{fmtMoney(it.cost)}</div></div>
                  <div><div className="text-slate-400">ACCUMDP</div><div className="font-bold text-slate-800 tabular-nums">{fmtMoney(it.accumDP)}</div></div>
                  <div><div className="text-slate-400">BKAMT</div><div className="font-bold text-slate-800 tabular-nums">{fmtMoney(it.bkAmt)}</div></div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-500 space-y-1 min-w-0">
                    <div className="flex gap-3">
                      <span>PIC 1 <PicStatus attached={!!it.pic1Url} /></span>
                      <span>PIC 2 <PicStatus attached={!!it.pic2Url} /></span>
                    </div>
                    <div className="truncate">{it.createdByName || it.createdBy || '-'} · {fmtDateTime(it.createdAt)}</div>
                  </div>
                  <div className="flex items-center shrink-0">
                    <button onClick={() => setDetailItem(it)} title="ดูรายละเอียด / รูป" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
                      <Eye size={18} />
                    </button>
                    {canEdit && (!it.pic1Url || !it.pic2Url) && (
                      <button onClick={() => setPhotoItem(it)} title="แนบรูป" className="p-2 rounded-lg text-sky-600 hover:bg-sky-50">
                        <Camera size={18} />
                      </button>
                    )}
                    {isOpen && canDelete && (
                      <button onClick={() => handleDelete(it)} title="ลบรายการ" className="p-2 rounded-lg text-rose-500 hover:bg-rose-50">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:hidden mt-3 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <Pagination currentPage={curPage} totalPages={totalPages} onPageChange={setPage} itemsPerPage={PAGE_SIZE} totalItems={items.length} />
          </div>

          {/* เรียงลำดับรายการ (เลือกจาก dropdown หรือกดหัวคอลัมน์ในตาราง) */}
          {items.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
              <span className="text-slate-400 font-bold">เรียงตาม</span>
              <select
                value={itemSort.key || ''}
                onChange={(e) => { setItemSort(e.target.value ? { key: e.target.value, dir: 'asc' } : { key: null, dir: 'asc' }); setPage(1); }}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">ลำดับที่บันทึก</option>
                {ITEM_SORT_LABELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {itemSort.key && (
                <button
                  onClick={() => setItemSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                >
                  {itemSort.dir === 'asc' ? 'น้อย → มาก ▲' : 'มาก → น้อย ▼'}
                </button>
              )}
            </div>
          )}

          {/* ตารางรายการ (จอ lg ขึ้นไป) */}
          <section className="hidden xl:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div>
              <table className="w-full text-[11px] table-fixed">
                <colgroup>
                  <col style={{ width: '2%' }} /><col style={{ width: '8%' }} /><col style={{ width: '6.5%' }} />
                  <col style={{ width: '19%' }} /><col style={{ width: '19%' }} /><col style={{ width: '4%' }} />
                  <col style={{ width: '6%' }} /><col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                  <col style={{ width: '3.5%' }} /><col style={{ width: '3.5%' }} /><col style={{ width: '9.5%' }} />
                  <col style={{ width: '7%' }} />
                </colgroup>
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th onClick={() => toggleItemSort('assetNo')} className="px-2 py-1.5 text-left cursor-pointer select-none hover:text-slate-800 whitespace-nowrap">ASSET NO{sortMark('assetNo')}</th>
                    <th onClick={() => toggleItemSort('assetDate')} className="px-2 py-1.5 text-left cursor-pointer select-none hover:text-slate-800 whitespace-nowrap">DATE{sortMark('assetDate')}</th>
                    <th onClick={() => toggleItemSort('assetName')} className="px-2 py-1.5 text-left cursor-pointer select-none hover:text-slate-800">ASSET NAME{sortMark('assetName')}</th>
                    <th onClick={() => toggleItemSort('place')} className="px-2 py-1.5 text-left cursor-pointer select-none hover:text-slate-800">PLACE{sortMark('place')}</th>
                    <th onClick={() => toggleItemSort('costCenter')} className="px-2 py-1.5 text-left cursor-pointer select-none hover:text-slate-800">CC{sortMark('costCenter')}</th>
                    <th onClick={() => toggleItemSort('cost')} className="px-2 py-1.5 text-right cursor-pointer select-none hover:text-slate-800">COST{sortMark('cost')}</th>
                    <th onClick={() => toggleItemSort('accumDP')} className="px-2 py-1.5 text-right cursor-pointer select-none hover:text-slate-800">ACCUMDP{sortMark('accumDP')}</th>
                    <th onClick={() => toggleItemSort('bkAmt')} className="px-2 py-1.5 text-right cursor-pointer select-none hover:text-slate-800">BKAMT{sortMark('bkAmt')}</th>
                    <th className="px-2 py-1.5 text-center">PIC 1</th>
                    <th className="px-2 py-1.5 text-center">PIC 2</th>
                    <th className="px-2 py-1.5 text-left">ผู้บันทึก / วันที่</th>
                    <th className="px-2 py-1.5 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-4 py-12 text-center text-slate-400">
                        <ImageIcon size={28} className="mx-auto mb-2 opacity-40" />
                        {isOpen ? 'ยังไม่มีรายการในรอบนี้ — ค้นหา ASSET NO เพื่อเพิ่มรายการ' : 'ไม่มีรายการในรอบนี้'}
                      </td>
                    </tr>
                  )}
                  {pagedItems.map((it, idx) => (
                    <tr key={it.itemId} className="hover:bg-slate-50/70">
                      <td className="px-2 py-1 text-slate-400">{(curPage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-2 py-1 font-bold text-slate-800 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {it.assetNo}
                          <button
                            type="button"
                            title="คัดลอก ASSET NO"
                            aria-label={`คัดลอก ${it.assetNo}`}
                            onClick={async () => {
                              const ok = await copyText(it.assetNo);
                              setToast({ id: Date.now(), message: ok ? `คัดลอก ${it.assetNo} แล้ว` : 'คัดลอกไม่สำเร็จ', duration: 1500 });
                            }}
                            className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                          >
                            <Copy size={12} />
                          </button>
                        </span>
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">{fmtDate(it.assetDate)}</td>
                      <td className="px-2 py-1 break-words" title={it.assetName || ''}>{it.assetName}</td>
                      <td className="px-2 py-1 break-words" title={it.place || ''}>{it.place}</td>
                      <td className="px-2 py-1 truncate">{it.costCenter}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(it.cost)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(it.accumDP)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(it.bkAmt)}</td>
                      <td className="px-2 py-1 text-center"><PicStatus attached={!!it.pic1Url} /></td>
                      <td className="px-2 py-1 text-center"><PicStatus attached={!!it.pic2Url} /></td>
                      <td className="px-2 py-1 truncate">
                        <div className="break-words" title={it.createdByName || it.createdBy || ''}>{it.createdByName || it.createdBy || '-'}</div>
                        <div className="text-[10px] text-slate-400 truncate">{fmtDateTime(it.createdAt)}</div>
                      </td>
                      <td className="px-2 py-1 text-center whitespace-nowrap">
                        <button onClick={() => setDetailItem(it)} title="ดูรายละเอียด / รูป" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                          <Eye size={15} />
                        </button>
                        {canEdit && (!it.pic1Url || !it.pic2Url) && (
                          <button onClick={() => setPhotoItem(it)} title="แนบรูป" className="p-1 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50">
                            <Camera size={16} />
                          </button>
                        )}
                        {isOpen && canDelete && (
                          <button onClick={() => handleDelete(it)} title="ลบรายการ" className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {items.length > 0 && (
                  <tfoot className="bg-slate-50 font-bold text-slate-700">
                    <tr>
                      <td colSpan={6} className="px-2 py-1.5 text-right">รวม</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(totals.cost)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(totals.accum)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(totals.bk)}</td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <Pagination
              currentPage={curPage}
              totalPages={totalPages}
              onPageChange={setPage}
              itemsPerPage={PAGE_SIZE}
              totalItems={items.length}
            />
          </section>
        </>
      )}

      {detailItem && (
        <DetailModal
          item={detailItem}
          list={sortedItems}
          runCode={run?.runCode}
          canEdit={canEdit}
          onNavigate={setDetailItem}
          onClose={() => setDetailItem(null)}
          onAttach={() => { setPhotoItem(detailItem); setDetailItem(null); }}
        />
      )}

      <AlertModal
        isOpen={!!confirmState}
        type={confirmState?.type || 'confirm'}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmText={confirmState?.confirmText || 'ยืนยัน'}
        cancelText="ยกเลิก"
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />

      {photoItem && (
        <PhotoModal
          runId={selectedRunId}
          item={photoItem}
          onClose={() => setPhotoItem(null)}
          onSaved={async () => {
            setPhotoItem(null);
            setNotice(`แนบรูปของ ${photoItem.assetNo} แล้ว`);
            await Promise.all([loadRun(selectedRunId), detailTab === 'report' ? loadReport(selectedRunId) : null]);
          }}
        />
      )}
    </div>
  );
};

// ─── รายละเอียดรายการ + ดูรูปขนาดใหญ่ ──────────────────────────────────────────
// รายละเอียดรายการ: เลื่อนดูทีละรายการได้ (ปุ่มหรือลูกศรซ้าย-ขวา), คัดลอก/พิมพ์ป้าย, ประวัติของรายการ,
// ขยายรูป, Esc ปิด, โฟกัสอยู่ในกล่องตลอด (กด Tab วนในกล่อง)
const DetailModal = ({ item, list = [], canEdit, onClose, onAttach, onNavigate, runCode }) => {
  const dialogRef = useRef(null);
  const [zoom, setZoom] = useState('');
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);
  const idx = list.findIndex((x) => x.itemId === item.itemId);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  // เมื่อเปลี่ยนรายการ ให้โฟกัสกลับที่กล่องและล้างสถานะคัดลอก
  useEffect(() => {
    dialogRef.current?.focus();
    setCopied(false);
  }, [item.itemId]);

  // ประวัติของรายการนี้ (จากประวัติของรอบ: ADD_ITEM ใช้ ASSET NO, PHOTO / DELETE_ITEM ใช้ ItemID)
  useEffect(() => {
    let alive = true;
    setHistory([]);
    apiRequest(`/disposal/runs/${item.runId}/events`)
      .then((d) => {
        if (!alive) return;
        setHistory((d.data || []).filter((ev) => ev.detail === item.assetNo || String(ev.detail || '').startsWith(`ItemID ${item.itemId}`)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [item.itemId, item.runId, item.assetNo]);

  useEffect(() => {
    const onKey = (e) => {
      if (zoom) {
        if (e.key === 'Escape') { e.preventDefault(); setZoom(''); }
        return;
      }
      if (e.key === 'Escape') { onClose(); return; }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      if (e.key === 'ArrowLeft' && prev) { onNavigate(prev); return; }
      if (e.key === 'ArrowRight' && next) { onNavigate(next); return; }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = [...dialogRef.current.querySelectorAll('button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]')];
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, prev, next, onClose, onNavigate]);

  const copyNo = async () => {
    const ok = await copyText(item.assetNo);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  };

  // พิมพ์ป้ายรายการเดียว (ขนาดป้ายประมาณ 70 x 40 มม.)
  const printSticker = () => {
    const esc = (v) => String(v ?? '-').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(item.assetNo)}</title><style>
      @page { size: 70mm 40mm; margin: 3mm; }
      body { font-family: sans-serif; margin: 0; color: #000; }
      .code { font-size: 18pt; font-weight: 900; letter-spacing: .5px; }
      .name { font-size: 8.5pt; margin-top: 1.5mm; line-height: 1.25; }
      .meta { font-size: 7.5pt; color: #333; margin-top: 1mm; }
    </style></head><body>
      <div class="code">${esc(item.assetNo)}</div>
      <div class="name">${esc(item.assetName)}</div>
      <div class="meta">${esc(item.place)} · CC ${esc(item.costCenter)}</div>
      <div class="meta">${esc(runCode)} · ${esc(fmtDate(item.assetDate))}</div>
      <script>window.onload = function () { window.print(); };</script>
    </body></html>`);
    w.document.close();
  };

  const rows = [
    ['ASSET NO', item.assetNo],
    ['ASSET DATE', fmtDate(item.assetDate)],
    ['ASSET NAME', item.assetName],
    ['PLACE', item.place],
    ['COSTCENTER', item.costCenter],
    ['COST', fmtMoney(item.cost)],
    ['ACCUMDP', fmtMoney(item.accumDP)],
    ['BKAMT', fmtMoney(item.bkAmt)],
    ['ผู้บันทึก', item.createdByName || item.createdBy || '-'],
    ['วันที่บันทึก', fmtDateTime(item.createdAt)],
  ];

  const Photo = ({ label, url }) => (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-bold text-slate-500 mb-1">{label}</div>
      {url ? (
        <button
          type="button"
          onClick={() => setZoom(imgUrl(url))}
          title="กดเพื่อขยาย"
          className="w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <img src={imgUrl(url)} alt={`${label} ของ ${item.assetNo}`} className="w-full max-h-[52vh] object-contain rounded-xl bg-slate-100" />
        </button>
      ) : (
        <div className="h-40 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-sm text-slate-400">ยังไม่ได้แนบรูป</div>
      )}
    </div>
  );

  const navBtn = 'p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`รายละเอียด ${item.assetNo}`}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6 space-y-5 focus:outline-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
                <button type="button" onClick={() => prev && onNavigate(prev)} disabled={!prev} aria-label="รายการก่อนหน้า" className={navBtn}>
                  <ChevronLeft size={16} />
                </button>
                <span className="tabular-nums px-1">{idx + 1} / {list.length}</span>
                <button type="button" onClick={() => next && onNavigate(next)} disabled={!next} aria-label="รายการถัดไป" className={navBtn}>
                  <ChevronRight size={16} />
                </button>
                <span className="hidden sm:inline ml-2 text-slate-300">← → เลื่อน · Esc ปิด</span>
              </div>
              <h3 className="font-black text-slate-800 text-lg break-all">{item.assetNo}</h3>
              <p className="text-sm text-slate-400 break-words">{item.assetName}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิด" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyNo} className="px-3 py-2 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              <Copy size={14} /> {copied ? 'คัดลอกแล้ว' : 'คัดลอก ASSET NO'}
            </button>
            <button type="button" onClick={printSticker} className="px-3 py-2 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              <Printer size={14} /> พิมพ์ป้าย
            </button>
          </div>

          <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] font-bold text-slate-400 uppercase">{k}</dt>
                <dd className="text-slate-800 break-words">{v || '-'}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col md:flex-row gap-4">
            <Photo label="PIC 1" url={item.pic1Url} />
            <Photo label="PIC 2" url={item.pic2Url} />
          </div>

          <section>
            <div className="text-xs font-bold text-slate-500 mb-2">ประวัติของรายการนี้</div>
            {history.length === 0 ? (
              <div className="text-sm text-slate-400">ยังไม่มีประวัติ</div>
            ) : (
              <ol className="space-y-1.5 border-l-2 border-slate-100 pl-4">
                {history.map((ev, i) => (
                  <li key={`${ev.type}-${ev.at}-${i}`} className="text-sm">
                    <span className="font-semibold text-slate-800">{EVENT_LABEL[ev.type] || ev.type}</span>{' '}
                    <span className="text-xs text-slate-400">{fmtDateTime(ev.at)} · {ev.actorName || ev.actor || '-'}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="flex justify-end gap-3">
            {canEdit && (!item.pic1Url || !item.pic2Url) && (
              <button onClick={onAttach} className="px-5 py-2.5 rounded-xl font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                <Camera size={16} /> แนบรูป
              </button>
            )}
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">ปิด</button>
          </div>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setZoom('')}>
          <img src={zoom} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
          <button type="button" onClick={() => setZoom('')} aria-label="ปิดรูป" className="absolute top-4 right-4 p-2 rounded-lg bg-white/90 text-slate-700">
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
};

// ─── แนบ/เปลี่ยนรูปของรายการที่มีอยู่แล้ว ──────────────────────────────────────
const PhotoModal = ({ runId, item, onClose, onSaved }) => {
  const [pics, setPics] = useState({ pic1: null, pic2: null });
  const [previews, setPreviews] = useState({ pic1: '', pic2: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const u1 = pics.pic1 ? URL.createObjectURL(pics.pic1) : '';
    const u2 = pics.pic2 ? URL.createObjectURL(pics.pic2) : '';
    setPreviews({ pic1: u1, pic2: u2 });
    return () => {
      if (u1) URL.revokeObjectURL(u1);
      if (u2) URL.revokeObjectURL(u2);
    };
  }, [pics]);

  const submit = async (e) => {
    e.preventDefault();
    if (!pics.pic1 && !pics.pic2) { setErr('กรุณาเลือกรูปอย่างน้อย 1 รูป'); return; }
    const fd = new FormData();
    if (pics.pic1) fd.append('pic1', pics.pic1);
    if (pics.pic2) fd.append('pic2', pics.pic2);
    setSaving(true); setErr('');
    try {
      await apiRequest(`/disposal/runs/${runId}/items/${item.itemId}/photos`, { method: 'PUT', body: fd });
      await onSaved();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-800 text-lg">แนบรูป — {item.assetNo}</h3>
            <p className="text-sm text-slate-400">{item.assetName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {err && (
          <div className="flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-4 py-2.5 text-sm font-medium">
            <AlertTriangle size={16} /> {err}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PicPicker label={`PIC 1${item.pic1Url ? ' (มีรูปแล้ว จะถูกแทนที่)' : ''}`} file={pics.pic1} preview={previews.pic1}
            onChange={(f) => setPics((p) => ({ ...p, pic1: f }))} />
          <PicPicker label={`PIC 2${item.pic2Url ? ' (มีรูปแล้ว จะถูกแทนที่)' : ''}`} file={pics.pic2} preview={previews.pic2}
            onChange={(f) => setPics((p) => ({ ...p, pic2: f }))} />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button type="submit" disabled={saving} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />} บันทึกรูป
          </button>
        </div>
      </form>
    </div>
  );
};

// ─── รายงานของรอบ ───────────────────────────────────────────────────────────
const ReportView = ({ report, events = [], onAttachPhoto, canEdit }) => {
  if (!report) {
    return <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400"><Loader2 size={22} className="mx-auto animate-spin" /></div>;
  }
  const { summary, byCostCenter, byRecorder, byDay = [], missingPhotoItems } = report;
  const totalCost = summary.totalCost || 0;
  const Table = ({ title, rows, labelHead }) => (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800">{title}</div>
      <div>
        <table className="w-full text-[11px] table-fixed">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left">{labelHead}</th>
              <th className="px-4 py-2.5 text-right w-16">จำนวน</th>
              <th className="px-4 py-2.5 text-right w-32">COST</th>
              <th className="px-4 py-2.5 text-right w-24">สัดส่วน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">ไม่มีข้อมูล</td></tr>}
            {rows.map((r) => {
              const pct = totalCost > 0 ? (r.cost / totalCost) * 100 : 0;
              return (
                <tr key={r.key}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-slate-700 truncate" title={r.key}>{r.key}</div>
                    <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-1 rounded-full bg-rose-400" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(r.cost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MiniStat icon={ClipboardList} title="รายการทั้งหมด" value={summary.itemCount} color="from-rose-500 to-rose-600" />
        <MiniStat icon={CheckCircle2} title="มีรูปครบ 2 รูป" value={summary.withPhotos} subValue={`${summary.itemCount ? Math.round((summary.withPhotos / summary.itemCount) * 100) : 0}% ของรายการ`} color="from-emerald-400 to-emerald-600" />
        <MiniStat icon={ImageIcon} title="ยังไม่ครบรูป" value={summary.missingPhotos} subValue="แนบทีหลังได้" color="from-amber-400 to-amber-500" isAlert={summary.missingPhotos > 0} />
        <MiniStat icon={Coins} title="รวม COST" value={fmtMoney(summary.totalCost)} color="from-slate-500 to-slate-700" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Table title="สรุปตาม COSTCENTER" rows={byCostCenter} labelHead="COSTCENTER" />
        <Table title="สรุปตามผู้บันทึก" rows={byRecorder} labelHead="ผู้บันทึก" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 text-sm flex flex-wrap gap-x-8 gap-y-1 text-slate-600">
        <span>ASSET DATE: <b className="text-slate-800">{fmtDate(summary.firstAssetDate)} – {fmtDate(summary.lastAssetDate)}</b></span>
        <span>บันทึกแล้ว <b className="text-slate-800">{byDay.length}</b> วัน</span>
        <span>COST เฉลี่ยต่อรายการ <b className="text-slate-800">{fmtMoney(summary.itemCount ? summary.totalCost / summary.itemCount : 0)}</b></span>
      </div>

      <Table title="สรุปตามวันที่บันทึก" rows={byDay} labelHead="วันที่บันทึก" />

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800">รายการที่ยังไม่มีรูปครบ ({missingPhotoItems.length})</div>
        {missingPhotoItems.length === 0 ? (
          <div className="px-5 py-6 text-center text-slate-400 text-sm">ทุกรายการมีรูปครบแล้ว</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {missingPhotoItems.map((m) => (
              <li key={m.itemId} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-800">{m.assetNo}</div>
                  <div className="text-xs text-slate-400">{m.assetName}</div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={m.hasPic1 ? 'text-emerald-600' : 'text-rose-500'}>PIC 1 {m.hasPic1 ? '✓' : '—'}</span>
                  <span className={m.hasPic2 ? 'text-emerald-600' : 'text-rose-500'}>PIC 2 {m.hasPic2 ? '✓' : '—'}</span>
                  {canEdit && (
                    <button onClick={() => onAttachPhoto({ itemId: m.itemId, assetNo: m.assetNo, assetName: m.assetName, pic1Url: m.hasPic1 ? 'x' : null, pic2Url: m.hasPic2 ? 'x' : null })}
                      className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 font-bold hover:bg-sky-100 flex items-center gap-1">
                      <Camera size={14} /> แนบรูป
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800">ประวัติการดำเนินการ ({events.length})</div>
        {events.length === 0 ? (
          <div className="px-5 py-6 text-center text-slate-400 text-sm">ยังไม่มีประวัติ</div>
        ) : (
          <ol className="relative px-5 py-4 space-y-3 border-l-2 border-slate-100 ml-7">
            {events.map((ev) => (
              <li key={ev.eventId} className="relative pl-4 text-sm">
                <span className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-rose-500 ring-4 ring-white" />
                <div className="font-semibold text-slate-800">
                  {EVENT_LABEL[ev.type] || ev.type} {ev.detail && <span className="font-normal text-slate-500">· {ev.detail}</span>}
                </div>
                <div className="text-xs text-slate-400">{fmtDateTime(ev.at)} · {ev.actorName || ev.actor || '-'}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};

// ตัวเลขสรุปแบบกะทัดรัด — ใช้แทน StatCard เพื่อไม่ให้ตัวเลขล้นบนมือถือ
const MiniStat = ({ icon: Icon, title, value, isAlert }) => (
  <div className={`bg-white rounded-2xl border p-3 sm:p-4 shadow-sm min-w-0 ${isAlert ? 'border-amber-300' : 'border-slate-200'}`}>
    <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
      {Icon && <Icon size={14} className="shrink-0 text-slate-400" />}
      <span className="truncate">{title}</span>
    </div>
    <div className="mt-1 text-base sm:text-xl font-black text-slate-800 tabular-nums truncate">{value}</div>
  </div>
);

const Field = ({ label, value, className = '' }) => (
  <div className={`min-w-0 ${className}`}>
    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{label}</label>
    <div className="px-2.5 py-1.5 min-h-[32px] rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 break-words">{value || '-'}</div>
  </div>
);

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// รับรูป 3 วิธี: เลือกไฟล์ / ลากไฟล์มาวาง / คลิกกรอบแล้ว Ctrl+V (วางจากคลิปบอร์ด)
const PicPicker = ({ label, file, preview, onChange }) => {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async (f) => {
    if (!f || !IMAGE_TYPES.includes(f.type)) return;
    setBusy(true);
    try {
      onChange(await compressImage(f));
    } finally {
      setBusy(false);
    }
  };

  const onPaste = (e) => {
    const img = Array.from(e.clipboardData?.items || []).find(
      (i) => i.kind === 'file' && IMAGE_TYPES.includes(i.type)
    );
    if (!img) return;
    e.preventDefault();
    accept(img.getAsFile());
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    accept(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      tabIndex={0}
      onPaste={onPaste}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`rounded-xl border border-dashed p-2.5 outline-none transition-colors focus:ring-2 focus:ring-rose-300 ${
        dragOver ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
      }`}
    >
      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = '';
        }}
        className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-rose-50 file:text-rose-700 file:font-semibold hover:file:bg-rose-100"
      />
      <p className="mt-1 text-[11px] text-slate-400">
        {busy ? 'กำลังบีบอัดรูป...' : dragOver ? 'วางรูปที่นี่' : 'ลากรูปมาวาง หรือคลิกกรอบแล้วกด Ctrl+V'}
      </p>
      {file && preview && (
        <div className="relative mt-2">
          <img src={preview} alt={label} className="h-24 w-full object-contain rounded-lg bg-slate-100" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-1 right-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 shadow hover:bg-white"
          >
            ลบรูป
          </button>
        </div>
      )}
    </div>
  );
};

// รายงานราคา: มูลค่ารวม, มูลค่าทางบัญชีคงเหลือ (BKAMT), ค่าเสื่อมสะสม, รายการมูลค่าสูงสุด, ช่วงราคา, อายุเฉลี่ย
const PriceReport = ({ items }) => {
  if (!items.length) return null;
  const num = (v) => Number(v) || 0;
  const total = items.reduce((s, i) => s + num(i.cost), 0);
  const accum = items.reduce((s, i) => s + num(i.accumDP), 0);
  const bk = items.reduce((s, i) => s + num(i.bkAmt), 0);
  // Book value คงเหลือ = COST − ค่าเสื่อมสะสม (คำนวณเอง) เทียบกับ BKAMT ที่บันทึกไว้
  const nbvOf = (i) => num(i.cost) - num(i.accumDP);
  const nbv = items.reduce((s, i) => s + nbvOf(i), 0);
  const mismatch = items.filter((i) => Math.abs(nbvOf(i) - num(i.bkAmt)) > 1);
  const top = [...items].sort((a, b) => num(b.cost) - num(a.cost)).slice(0, 5);
  const topShare = total ? (top.reduce((s, i) => s + num(i.cost), 0) / total) * 100 : 0;
  const bands = [
    { l: 'ต่ำกว่า 10,000', min: 0, max: 10000 },
    { l: '10,000 – 49,999', min: 10000, max: 50000 },
    { l: '50,000 – 99,999', min: 50000, max: 100000 },
    { l: '100,000 ขึ้นไป', min: 100000, max: Infinity },
  ].map((b) => {
    const list = items.filter((i) => num(i.cost) >= b.min && num(i.cost) < b.max);
    return { ...b, count: list.length, sum: list.reduce((s, i) => s + num(i.cost), 0) };
  });
  const maxBand = Math.max(1, ...bands.map((b) => b.count));
  const ages = items.filter((i) => i.assetDate && i.createdAt)
    .map((i) => (new Date(i.createdAt) - new Date(i.assetDate)) / (365.25 * 86400000))
    .filter((y) => y >= 0);
  const avgAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
  const pct = (v) => (total ? ((v / total) * 100).toFixed(1) : '0.0');

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-slate-800">วิเคราะห์มูลค่า</h3>
        <span className="text-xs text-slate-400">{items.length} รายการ</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-400">มูลค่ารวม (COST)</div>
          <div className="text-lg font-black text-slate-800 tabular-nums">{fmtMoney(total)}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700">Book value คงเหลือ (COST − ค่าเสื่อมสะสม)</div>
          <div className="text-lg font-black text-emerald-800 tabular-nums">{fmtMoney(nbv)}</div>
          <div className="text-[11px] text-emerald-700">{pct(nbv)}% ของมูลค่ารวม · BKAMT ตามบันทึก {fmtMoney(bk)}</div>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <div className="text-xs text-amber-700">ค่าเสื่อมสะสม (ACCUMDP)</div>
          <div className="text-lg font-black text-amber-800 tabular-nums">{fmtMoney(accum)}</div>
          <div className="text-[11px] text-amber-700">{pct(accum)}% ของมูลค่ารวม</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-400">เฉลี่ยต่อชิ้น · อายุเฉลี่ย</div>
          <div className="text-lg font-black text-slate-800 tabular-nums">{fmtMoney(total / items.length)}</div>
          <div className="text-[11px] text-slate-500">{avgAge !== null ? `อายุเฉลี่ย ${avgAge.toFixed(1)} ปี (ได้มา → วันบันทึก)` : '-'}</div>
        </div>
      </div>

      {mismatch.length === 0 ? (
        <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
          ตรวจแล้ว: Book value (COST − ค่าเสื่อมสะสม) ตรงกับ BKAMT ที่บันทึกทุกรายการ
        </div>
      ) : (
        <div className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
          <b>BKAMT ไม่ตรงกับ COST − ค่าเสื่อมสะสม {mismatch.length} รายการ:</b>{' '}
          {mismatch.slice(0, 5).map((i) => `${i.assetNo} (คำนวณ ${fmtMoney(nbvOf(i))} / บันทึก ${fmtMoney(i.bkAmt)})`).join(' · ')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="text-xs font-bold text-slate-500 mb-2">รายการมูลค่าสูงสุด 5 อันดับ</div>
          <table className="w-full text-[11px]">
            <thead className="text-slate-400 uppercase">
              <tr>
                <th className="text-left py-1">#</th>
                <th className="text-left py-1">ASSET NO</th>
                <th className="text-left py-1">ASSET NAME</th>
                <th className="text-right py-1">COST</th>
                <th className="text-right py-1">สัดส่วน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {top.map((i, idx) => (
                <tr key={i.itemId}>
                  <td className="py-1.5 text-slate-400">{idx + 1}</td>
                  <td className="py-1.5 font-bold text-slate-800 whitespace-nowrap">{i.assetNo}</td>
                  <td className="py-1.5 text-slate-600 break-words">{i.assetName}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtMoney(i.cost)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">{pct(num(i.cost))}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[11px] text-slate-500 mt-2">
            5 รายการแรกคิดเป็น <b className="text-slate-800">{topShare.toFixed(1)}%</b> ของมูลค่ารวม
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-slate-500 mb-2">กระจายตามช่วงราคา (COST)</div>
          <div className="space-y-2">
            {bands.map((b) => (
              <div key={b.l}>
                <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                  <span>{b.l}</span>
                  <span className="tabular-nums">{b.count} รายการ · {fmtMoney(b.sum)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-rose-400 to-rose-600 transition-all duration-500"
                    style={{ width: `${(b.count / maxBand) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// แจ้งผลสั้นๆ มุมล่าง (หายเองตามเวลา, ปุ่มเลิกทำได้ถ้ามี action)
const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.duration || 3000);
    return () => clearTimeout(t);
  }, [toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 text-sm font-medium max-w-[92vw]">
      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
      <span className="break-words">{toast.message}</span>
      {toast.action && (
        <button onClick={toast.action.onClick} className="font-bold text-rose-300 hover:text-rose-200 underline underline-offset-2 whitespace-nowrap">
          {toast.action.label}
        </button>
      )}
      <button onClick={onClose} className="text-slate-400 hover:text-white shrink-0" title="ปิด">
        <X size={14} />
      </button>
    </div>
  );
};

// วงกลมแสดงความคืบหน้าการแนบรูปของรอบ
const ProgressRing = ({ pct, size = 44 }) => {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-100" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className="stroke-emerald-500 transition-all duration-700"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700 tabular-nums">{pct}%</span>
    </div>
  );
};

// แสดงแค่ว่าแนบรูปแล้วหรือยัง (ไม่แสดงภาพในตาราง)
const PicStatus = ({ attached }) =>
  attached
    ? <CheckCircle2 size={15} className="inline text-emerald-500" />
    : <span className="text-slate-300">-</span>;

export default ITDisposalPage;
