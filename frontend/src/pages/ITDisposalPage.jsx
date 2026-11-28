import React, { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import * as XLSX from 'xlsx-js-style';
import { Trash2, Search, Plus, Lock, FileSpreadsheet, Printer, Loader2, AlertTriangle, CheckCircle2, Circle, Coins, ArrowRight, FileSignature, Send, Archive, Image as ImageIcon, ArrowLeft, Camera, X, ClipboardList, Eye, Copy, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
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
  photo: (i) => (i.pic1Url ? 1 : 0) + (i.pic2Url ? 1 : 0),
  checked: (i) => (i.isChecked ? 1 : 0),
  keyed: (i) => (i.isKeyed ? 1 : 0),
  costCenter: (i) => i.costCenter,
  cost: (i) => Number(i.cost) || 0,
  accumDP: (i) => Number(i.accumDP) || 0,
  bkAmt: (i) => Number(i.bkAmt) || 0,
};
const ITEM_SORT_LABELS = [
  ['assetNo', 'ASSET NO'], ['assetDate', 'DATE'], ['assetName', 'ASSET NAME'], ['place', 'PLACE'],
  ['costCenter', 'CC'], ['cost', 'COST'], ['accumDP', 'ACCUMDP'], ['bkAmt', 'BKAMT'],
  ['photo', 'จำนวนรูปที่แนบ'], ['checked', 'ตรวจนับ'], ['keyed', 'ลงบัญชี'],
];
// ตัวกรองรายการในรอบ
const ITEM_FILTERS = [
  ['all', 'ทั้งหมด'], ['nophoto', 'ยังไม่ครบรูป'], ['fullphoto', 'รูปครบแล้ว'], ['unchecked', 'ยังไม่ตรวจนับ'], ['checked', 'ตรวจนับแล้ว'],
  ['unkeyed', 'ยังไม่ลงบัญชี'], ['keyed', 'ลงบัญชีแล้ว'],
];
const itemMatchesFilter = (f, i) => {
  switch (f) {
    case 'nophoto': return !i.pic1Url || !i.pic2Url;
    case 'fullphoto': return !!i.pic1Url && !!i.pic2Url;
    case 'unchecked': return !i.isChecked;
    case 'checked': return !!i.isChecked;
    case 'unkeyed': return !i.isKeyed;
    case 'keyed': return !!i.isKeyed;
    default: return true;
  }
};
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
  DOC: 'แก้เลขเอกสารบัญชี',
  REOPEN: 'เปิดรอบอีกครั้ง',
  CHECK: 'ตรวจนับ',
  UNCHECK: 'ยกเลิกตรวจนับ',
  KEYED: 'ลงบัญชีแล้ว',
  UNKEYED: 'ยกเลิกลงบัญชี',
  STAGE: 'เปลี่ยนขั้นตอน',
};

// ไอคอนประจำแต่ละขั้นของการ์ดความคืบหน้า (ตามลำดับขั้น 1-5)
const RUN_STAGE_ICONS = [Camera, FileText, FileSignature, Send, Archive, Trash2];

// ขั้นตอนของรอบ (progress bar 5 ขั้น) — ชื่อสั้นให้อ่านง่ายบนจอเล็ก
const RUN_STAGES = [
  { n: 1, label: 'บันทึกและถ่ายภาพ' },
  { n: 2, label: 'จัดทำเอกสารบัญชี' },
  { n: 3, label: 'ผู้บริหารอนุมัติ' },
  { n: 4, label: 'ส่งฝ่ายบัญชี' },
  { n: 5, label: 'รอจำหน่ายจริง' },
  { n: 6, label: 'ทำทิ้งแล้ว' },
];

// สถานะรอบ: เปิดอยู่ / ปิดแล้ว / เสร็จสิ้น (เสร็จสิ้น = ปิดรอบแล้วและ บช. ดำเนินการทิ้งครบ)
const runState = (r) => (r.status === 'Open' ? 'open' : r.completedAt ? 'completed' : 'closed');
const RUN_STATE_LABEL = { open: 'เปิดอยู่', closed: 'ปิดแล้ว', completed: 'เสร็จสิ้น' };

const DOC_TYPE_LABEL = {
  DOC_ACCOUNTING: 'เอกสารบัญชี (ขั้นที่ 2)',
  DOC_APPROVED: 'เอกสารที่ผู้บริหารอนุมัติ (ขั้นที่ 3)',
  DOC_SENT_ACCOUNTING: 'หลักฐานส่งฝ่ายบัญชี (ขั้นที่ 4)',
  DISPOSED_PHOTO: 'รูปหลักฐานการทิ้ง (ขั้นที่ 6, 3 รูป)',
  ACCOUNTING_DONE: 'บช. ดำเนินการทิ้งแล้ว',
  APPROVAL: 'หนังสืออนุมัติ',
  OTHER: 'อื่นๆ',
};
const isPhotoDocType = (t) => t === 'DISPOSED_PHOTO';

// เอกสารที่ใช้ผ่านเงื่อนไขขั้นแล้ว ลบไม่ได้ (ตรงกับ DOC_LOCK_STAGE ฝั่งเซิร์ฟเวอร์)
const DOC_LOCK_STAGE = { DOC_ACCOUNTING: 3, DOC_APPROVED: 4, DOC_SENT_ACCOUNTING: 5, DISPOSED_PHOTO: 6 };
const isDocLocked = (docType, stage) => !!DOC_LOCK_STAGE[docType] && stage >= DOC_LOCK_STAGE[docType];
// เลขเอกสารบัญชีแก้ไขได้เฉพาะก่อนขั้นที่ 3 (ตรงกับเซิร์ฟเวอร์)
const DOC_NO_LOCK_STAGE = 3;

// COSTCENTER ที่บันทึกรายการได้ (ตรงกับเซิร์ฟเวอร์)
const REQUIRED_COST_CENTER = '7510';

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
  const [docEditing, setDocEditing] = useState(false);
  const [detailTab, setDetailTab] = useState('items');
  const runDocRef = useRef(null);
  const scanRef = useRef(null);
  const [scanResult, setScanResult] = useState(null);
  const [checkFilter, setCheckFilter] = useState('pending');
  const [checkPage, setCheckPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [photoItem, setPhotoItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [dupes, setDupes] = useState([]);
  const [searchWarn, setSearchWarn] = useState('');
  const [itemSort, setItemSort] = useState({ key: null, dir: 'asc' });
  const [itemFilter, setItemFilter] = useState('all');
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
  const [ccWarning, setCcWarning] = useState(null); // COSTCENTER ที่ไม่ใช่ 7510 (เปิด modal เตือน)
  const [form, setForm] = useState(EMPTY_FORM);
  const [pics, setPics] = useState({ pic1: null, pic2: null });
  const [previews, setPreviews] = useState({ pic1: '', pic2: '' });
  const [saving, setSaving] = useState(false);

  const isOpen = run?.status === 'Open';
  // ตั้งแต่ขั้นที่ 3 "ผู้บริหารอนุมัติ" ห้ามเพิ่มรายการ (ตรงกับฝั่งเซิร์ฟเวอร์)
  const addLocked = (Number(run?.stage) || 1) >= 3;
  // รายการที่ COSTCENTER ไม่ใช่ 7510 บันทึกไม่ได้ (แสดงเตือนและปิดปุ่มบันทึก)
  const ccMismatch = found && String(form.costCenter ?? '').trim() !== REQUIRED_COST_CENTER;
  const ADD_LOCK_MSG = 'รอบอยู่ขั้นผู้บริหารอนุมัติแล้ว ไม่สามารถเพิ่มรายการได้';
  // ปิดรอบได้เฉพาะผู้เปิดรอบ (ตรงกับกฎฝั่ง backend)
  const isCreator = !!run && (run.createdBy || '').toUpperCase() === (user?.username || '').toUpperCase();
  // แบ่งหน้ารายการ (ถ้าข้อมูลหดจนเกินหน้า จะถูกปรับกลับไปหน้าสุดท้ายอัตโนมัติ)
  const filteredItems = items.filter((i) => itemMatchesFilter(itemFilter, i));
  const sortedItems = itemSort.key && ITEM_SORT_VALUE[itemSort.key]
    ? [...filteredItems].sort(compareBy(ITEM_SORT_VALUE[itemSort.key], itemSort.dir))
    : filteredItems;
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
  const [docType, setDocType] = useState('DOC_ACCOUNTING');
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
    const isImg = /\.(jpe?g|png)$/i.test(f.name);
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (isPhotoDocType(docType) ? !isImg : !(isPdf || isImg)) {
      setError(isPhotoDocType(docType) ? 'ประเภทนี้ต้องเป็นรูป JPG หรือ PNG' : 'รองรับเฉพาะไฟล์ PDF หรือรูป JPG/PNG');
      return;
    }
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
    message: `ยืนยันว่า ${run.runCode} ทำทิ้งแล้ว (ขั้นที่ 6)? เมื่อยืนยันแล้วจะเปลี่ยนสถานะเป็นเสร็จสิ้น`,
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
  // ─── ตรวจนับก่อนทิ้ง: สแกนป้าย (QR/Barcode) หรือพิมพ์รหัส แล้วระบบบันทึกว่าตรวจแล้ว ───
  const submitScan = async (raw) => {
    const code = String(raw ?? '').trim();
    if (!code || !selectedRunId) return;
    try {
      const d = await apiRequest(`/disposal/runs/${selectedRunId}/scan`, { method: 'POST', body: { code } });
      setScanResult({ status: d.status, code });
      if (d.status === 'checked') await loadRun(selectedRunId);
    } catch (err) {
      setScanResult({ status: 'error', code, message: err.message });
    }
    if (scanRef.current) { scanRef.current.value = ''; scanRef.current.focus(); }
  };

  // เปลี่ยนขั้นตอนของรอบ (progress bar) — ยืนยันก่อนทุกครั้ง
  const doSetStage = async (n) => {
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}/stage`, { method: 'PUT', body: { stage: n } });
      await loadRun(selectedRunId);
      setToast({ id: Date.now(), message: `เปลี่ยนขั้นตอนเป็น "${RUN_STAGES.find((s) => s.n === n)?.label}" แล้ว`, duration: 2500 });
    } catch (err) {
      setError(err.message);
    }
  };
  // เงื่อนไขก่อนเข้าแต่ละขั้น (ตรงกับฝั่งเซิร์ฟเวอร์) — คืนข้อความที่ยังขาด หรือ null ถ้าผ่าน
  const stageGateReason = (target) => {
    const photosOk = items.length > 0 && items.every((i) => i.pic1Url && i.pic2Url);
    const has = (t) => attachments.some((a) => a.docType === t);
    const photoCount = attachments.filter((a) => a.docType === 'DISPOSED_PHOTO').length;
    if (target >= 2 && !photosOk) return 'ต้องแนบรูปให้ครบ 2 รูปทุกรายการก่อน';
    if (target >= 3) {
      if (!run?.accountingDocNo) return 'ต้องกรอกเลขเอกสารบัญชีของรอบก่อน';
      if (!has('DOC_ACCOUNTING')) return 'ต้องแนบเอกสารบัญชีก่อน';
    }
    if (target >= 4 && !has('DOC_APPROVED')) return 'ต้องแนบเอกสารที่ผู้บริหารอนุมัติก่อน';
    if (target >= 5 && !has('DOC_SENT_ACCOUNTING')) return 'ต้องแนบหลักฐานส่งฝ่ายบัญชีก่อน';
    if (target >= 6 && photoCount < 3) return 'ต้องแนบรูปหลักฐานการทิ้งให้ครบ 3 รูปก่อน';
    return null;
  };

  const askSetStage = (s) => {
    const cur = Number(run?.stage) || 1;
    if (s.n === 6) {
      if (cur !== 5) { setError('ต้องทำขั้นที่ 1-5 ให้ครบตามลำดับก่อน'); return; }
      const reason = stageGateReason(6);
      if (reason) { setError(reason); return; }
      askComplete();
      return;
    }
    if (Math.abs(s.n - cur) !== 1) { setError('เปลี่ยนสถานะได้ทีละ 1 ขั้นเท่านั้น'); return; }
    if (s.n > cur) {
      const reason = stageGateReason(s.n);
      if (reason) { setError(reason); return; }
    }
    setConfirmState({
      type: 'confirm',
      title: 'เปลี่ยนขั้นตอนของรอบ',
      message: `เปลี่ยนขั้นตอนเป็น "${s.label}" (ขั้นที่ ${s.n})?`,
      confirmText: 'เปลี่ยนขั้นตอน',
      onConfirm: () => doSetStage(s.n),
    });
  };

  // ติ๊ก/ยกเลิก "ลงระบบบัญชีแล้ว" ทีละรายการหรือหลายรายการ
  const setKeyed = async (list, keyed) => {
    const ids = list.map((i) => i.itemId);
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      const d = await apiRequest(`/disposal/runs/${selectedRunId}/keyed`, { method: 'PUT', body: { itemIds: ids, keyed } });
      await loadRun(selectedRunId);
      const who = d?.data?.keyedByName ? ` · โดย ${d.data.keyedByName}` : '';
      const label = list.length === 1 ? list[0].assetNo : `${list.length} รายการ`;
      setToast({ id: Date.now(), message: keyed ? `ลงบัญชีแล้ว ${label}${who}` : `ยกเลิกลงบัญชี ${label}`, duration: 2500 });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleCheck = async (it) => {
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}/items/${it.itemId}/check`, { method: 'PUT', body: { checked: !it.isChecked } });
      await loadRun(selectedRunId);
    } catch (err) {
      setError(err.message);
    }
  };

  const renderCheck = () => {
    const CHECK_PAGE = 20;
    const checkedCount = items.filter((i) => i.isChecked).length;
    const total = items.length;
    const pct = total ? Math.round((checkedCount / total) * 100) : 0;
    const shownAll = items.filter((i) => checkFilter === 'all' || (checkFilter === 'checked' ? i.isChecked : !i.isChecked));
    const tp = Math.max(1, Math.ceil(shownAll.length / CHECK_PAGE));
    const cur = Math.min(checkPage, tp);
    const shown = shownAll.slice((cur - 1) * CHECK_PAGE, cur * CHECK_PAGE);
    const resultText = {
      checked: ['ok', `ตรวจแล้ว ${scanResult?.code}`],
      duplicate: ['warn', `${scanResult?.code} ตรวจไปแล้ว (สแกนซ้ำ)`],
      notfound: ['bad', `${scanResult?.code} ไม่อยู่ในรอบนี้`],
      error: ['bad', scanResult?.message || 'บันทึกไม่สำเร็จ'],
    }[scanResult?.status];
    const tone = { ok: 'bg-emerald-50 text-emerald-700 border-emerald-200', warn: 'bg-amber-50 text-amber-800 border-amber-200', bad: 'bg-rose-50 text-rose-700 border-rose-200' };
    return (
      <div className="space-y-4">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-slate-800">ตรวจนับก่อนทิ้ง</span>
            <span className="tabular-nums font-bold text-slate-700">{checkedCount} / {total} ({pct}%)</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-2 bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <label htmlFor="scan-input" className="text-xs font-bold text-slate-500 block">สแกน QR / Barcode หรือพิมพ์ ASSET NO แล้วกด Enter</label>
          <input
            id="scan-input"
            ref={scanRef}
            autoFocus
            autoComplete="off"
            disabled={!canEdit}
            placeholder={canEdit ? 'เช่น CO24-017-02' : 'ไม่มีสิทธิ์ตรวจนับ'}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitScan(e.currentTarget.value); } }}
            className="w-full max-w-md px-3 py-2.5 rounded-lg border border-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-100"
          />
          {resultText && (
            <div className={`text-sm rounded-lg border px-3 py-2 ${tone[resultText[0]]}`}>{resultText[1]}</div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-bold text-slate-800 text-sm">รายการ ({shownAll.length})</span>
            <select
              value={checkFilter}
              onChange={(e) => { setCheckFilter(e.target.value); setCheckPage(1); }}
              aria-label="กรองรายการตามสถานะตรวจนับ"
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="pending">ยังไม่ตรวจ</option>
              <option value="checked">ตรวจแล้ว</option>
              <option value="all">ทั้งหมด</option>
            </select>
          </div>
          <ul className="divide-y divide-slate-100">
            {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">ไม่มีรายการ</li>}
            {shown.map((it) => (
              <li key={it.itemId} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${it.isChecked ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 text-sm">{it.assetNo}</div>
                  <div className="text-xs text-slate-400 truncate">{it.assetName || '-'}</div>
                  {it.isChecked && (
                    <div className="text-[11px] text-emerald-700">ตรวจโดย {it.checkedByName || it.checkedBy || '-'} · {fmtDateTime(it.checkedAt)}</div>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => toggleCheck(it)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  >
                    {it.isChecked ? 'ยกเลิก' : 'ตรวจแล้ว'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {shownAll.length > CHECK_PAGE && (
            <Pagination currentPage={cur} totalPages={tp} onPageChange={setCheckPage} itemsPerPage={CHECK_PAGE} totalItems={shownAll.length} />
          )}
        </section>
      </div>
    );
  };

  const renderDocs = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {canEditRun && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">แนบเอกสาร</h3>
            <p className="text-[11px] text-slate-400">PDF หรือรูป JPG/PNG · ไฟล์ไม่เกิน 20 MB</p>
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
                <span className="text-sm text-slate-600">{isPhotoDocType(docType) ? 'ลากรูป JPG/PNG มาวางที่นี่' : 'ลากไฟล์ PDF หรือรูป JPG/PNG มาวางที่นี่'}</span>
                <span className="text-[11px] text-slate-400">หรือคลิกเพื่อเลือกไฟล์</span>
              </>
            )}
            <input
              type="file"
              accept={isPhotoDocType(docType) ? 'image/jpeg,image/png,.jpg,.jpeg,.png' : 'application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png'}
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
                {canEditRun && !isDocLocked(a.docType, Number(run?.stage) || 1) && (
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
  // ตรวจความพร้อมก่อนปิดรอบ: เลขเอกสารบัญชี, ตรวจนับ, รูปครบ, หลักฐาน บช. (ไม่บังคับ แค่แจ้งให้เห็น)
  const handleCloseRun = () => {
    if ((Number(run.stage) || 1) < 2) {
      setError('ยังปิดรอบไม่ได้ ต้องทำขั้นที่ 1 "บันทึกและถ่ายภาพ" ให้ครบก่อน');
      return;
    }
    const total = items.length;
    const checkedN = items.filter((i) => i.isChecked).length;
    const fullN = items.filter((i) => i.pic1Url && i.pic2Url).length;
    const hasDoc = !!run.accountingDocNo;
    const hasAccDoc = attachments.some((a) => a.docType === 'ACCOUNTING_DONE');
    const status = (ok, label, detail) => (
      <span className="flex items-start gap-2 text-left">
        <span className={`font-black ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>{ok ? '✓' : '!'}</span>
        <span className="text-slate-600"><b className="text-slate-800">{label}</b> {detail}</span>
      </span>
    );
    setConfirmState({
      type: 'danger',
      title: 'ปิดรอบ',
      message: (
        <span className="flex flex-col gap-2 mt-2">
          <span>ปิดรอบ {run.runCode}? เมื่อปิดแล้วจะเพิ่มหรือลบรายการไม่ได้ (แนบรูปเพิ่มได้)</span>
          <span className="flex flex-col gap-1.5 rounded-xl bg-slate-50 border border-slate-200 p-3">
            {status(hasDoc, 'เลขเอกสารบัญชี:', hasDoc ? `กรอกแล้ว (${run.accountingDocNo})` : 'ยังไม่ได้กรอก')}
            {status(total > 0 && checkedN === total, 'ตรวจนับ:', total ? `${checkedN}/${total} รายการ${checkedN < total ? ` · ยังไม่ตรวจ ${total - checkedN}` : ''}` : 'ไม่มีรายการ')}
            {status(total > 0 && fullN === total, 'รูปครบ 2 รูป:', total ? `${fullN}/${total} รายการ${fullN < total ? ` · ยังไม่ครบ ${total - fullN}` : ''}` : 'ไม่มีรายการ')}
            {status(hasAccDoc, 'หลักฐาน บช.:', hasAccDoc ? 'แนบแล้ว' : 'ยังไม่ได้แนบ')}
          </span>
        </span>
      ),
      confirmText: 'ปิดรอบ',
      onConfirm: () => doCloseRun(),
    });
  };

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
    // ยกเลิกคำสั่งลบรายการที่ค้างรออยู่ (รอบจะถูกลบทั้งหมดอยู่แล้ว กันไม่ให้ส่งลบรายการซ้ำหลังรอบหายไป)
    if (pendingDelRef.current) {
      clearTimeout(pendingDelRef.current.timer);
      pendingDelRef.current = null;
      setToast(null);
    }
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
      if (String(it.costCenter ?? '').trim() !== REQUIRED_COST_CENTER) {
        // เก็บข้อมูลไว้ให้ modal แสดง แล้วล้างฟอร์มทันที (กันค้างข้อมูลที่บันทึกไม่ได้)
        setCcWarning({ assetNo: it.assetNo, assetName: it.assetName, place: it.place, costCenter: it.costCenter || '-', cost: it.cost });
        resetForm();
      }
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
    if (String(form.costCenter ?? '').trim() !== REQUIRED_COST_CENTER) {
      setError(`บันทึกได้เฉพาะ COSTCENTER ${REQUIRED_COST_CENTER} เท่านั้น`);
      return;
    }
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

  // Export Excel — คอลัมน์ตามที่กำหนด: ASSET NO, ASSET DATE, ASSET NAME, PLACE, COSTCENTER, COST, ACCUMDP, BKAMT
  const handleExport = () => {
    if (!items.length || !run) return;
    const header = ['ASSET NO', 'ASSET DATE', 'ASSET NAME', 'PLACE', 'COSTCENTER', 'COST', 'ACCUMDP', 'BKAMT', 'ลงบัญชีแล้ว', 'ลงบัญชีโดย', 'วันที่ลงบัญชี'];
    const rows = items.map((i) => [
      i.assetNo,
      fmtDate(i.assetDate),
      i.assetName ?? '',
      i.place ?? '',
      i.costCenter ?? '',
      i.cost != null ? Number(i.cost) : '',
      i.accumDP != null ? Number(i.accumDP) : '',
      i.bkAmt != null ? Number(i.bkAmt) : '',
      i.isKeyed ? 'ลงแล้ว' : '',
      i.isKeyed ? (i.keyedByName || i.keyedBy || '') : '',
      i.isKeyed && i.keyedAt ? fmtDateTime(i.keyedAt) : '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [18, 12, 45, 45, 13, 14, 14, 14, 12, 18, 18].map((wch) => ({ wch }));

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

  // บันทึกเลขเอกสารบัญชีของทั้งรอบ (ว่าง = ล้างค่า)
  const saveRunDoc = async () => {
    if (!selectedRunId || !runDocRef.current) return;
    const value = runDocRef.current.value.trim();
    try {
      await apiRequest(`/disposal/runs/${selectedRunId}/doc`, { method: 'PUT', body: { accountingDocNo: value } });
      setNotice(value ? `บันทึกเลขเอกสารบัญชี ${value} แล้ว` : 'ล้างเลขเอกสารบัญชีแล้ว');
      setDocEditing(false);
      await loadRun(selectedRunId);
    } catch (err) {
      setError(err.message);
    }
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
        <td>${esc(i.place)} <b style="color:#dc2626">(DISPOSAL)</b></td>
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
  h2.sec { font-size: 13px; margin: 14px 0 6px; }
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

  // รายงานฉบับพิมพ์ (PDF): สรุปทุกขั้นตอน + สถานะเอกสาร + รูปหลักฐานการทิ้ง + ตารางรายการ + ลายเซ็น
  const handlePrintReport = async () => {
    if (!run) return;
    setError('');
    const esc = (v) => String(v ?? '-').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // รูปแนบต้องล็อกอินจึงโหลดเป็น blob แล้วฝังเป็น data URL (ไฟล์ PDF ใส่แค่รายการ)
    let docs;
    try {
      docs = await Promise.all(attachments.map(async (a) => {
        if (!/\.(jpe?g|png)$/i.test(a.fileName || '')) return { ...a, dataUrl: null };
        const res = await fetch(`${API_BASE}/disposal/attachments/${a.attachmentId}/file`, { headers: authHeaders() });
        if (!res.ok) return { ...a, dataUrl: null };
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        return { ...a, dataUrl };
      }));
    } catch (err) {
      setError(`โหลดเอกสารแนบไม่สำเร็จ: ${err.message}`);
      return;
    }

    const stageNum = Number(run.stage) || 1;
    const countType = (t) => docs.filter((a) => a.docType === t).length;
    const photosDone = items.filter((i) => i.pic1Url && i.pic2Url).length;
    const checkedCount = items.filter((i) => i.isChecked).length;
    const keyedCount = items.filter((i) => i.isKeyed).length;
    const evidence = [
      `รูปครบ ${photosDone}/${items.length} รายการ`,
      `${run.accountingDocNo ? `เลขเอกสาร ${run.accountingDocNo} · ` : ''}เอกสารบัญชี ${countType('DOC_ACCOUNTING')} ไฟล์`,
      `เอกสารที่ผู้บริหารอนุมัติ ${countType('DOC_APPROVED')} ไฟล์`,
      `หลักฐานส่งฝ่ายบัญชี ${countType('DOC_SENT_ACCOUNTING')} ไฟล์`,
      'รอจำหน่ายจริง',
      `รูปหลักฐานการทิ้ง ${countType('DISPOSED_PHOTO')}/3 รูป`,
    ];
    const stepsHtml = RUN_STAGES.map((s, idx) => {
      const done = s.n === 6 ? !!run.completedAt : stageNum > s.n;
      const current = !done && stageNum === s.n;
      const gap = !done && s.n === stageNum + 1 ? stageGateReason(s.n) : null;
      const cls = done ? 'done' : current ? 'current' : 'todo';
      const badge = done ? 'เสร็จแล้ว' : current ? 'กำลังดำเนินการ' : 'ยังไม่ถึง';
      return `<td class="step ${cls}">
        <div class="dot">${done ? '✓' : s.n}</div>
        <div class="sn">ขั้นที่ ${s.n}</div>
        <div class="sl">${esc(s.label)}</div>
        <div class="sb">${badge}</div>
        <div class="se">${esc(evidence[idx])}</div>
        ${gap ? `<div class="gap">ขาด: ${esc(gap)}</div>` : ''}
      </td>${idx < RUN_STAGES.length - 1 ? '<td class="arrow">▶</td>' : ''}`;
    }).join('');

    const DOC_ORDER = ['DOC_ACCOUNTING', 'DOC_APPROVED', 'DOC_SENT_ACCOUNTING', 'DISPOSED_PHOTO', 'ACCOUNTING_DONE', 'APPROVAL', 'OTHER'];
    const docsHtml = DOC_ORDER.map((t) => {
      const list = docs.filter((a) => a.docType === t);
      if (!list.length) {
        return `<div class="group"><div class="gh">${esc(DOC_TYPE_LABEL[t])}</div><div class="none">ยังไม่มีการแนบ</div></div>`;
      }
      const body = list.map((a) => (a.dataUrl
        ? `<figure><img src="${a.dataUrl}" /><figcaption>${esc(a.fileName)}<br>${esc(a.uploadedByName || '-')} · ${esc(fmtDateTime(a.uploadedAt))}</figcaption></figure>`
        : `<div class="file">📄 <b>${esc(a.fileName)}</b><span>${(a.fileSize / 1024).toFixed(0)} KB · ${esc(a.uploadedByName || '-')} · ${esc(fmtDateTime(a.uploadedAt))}</span></div>`)).join('');
      return `<div class="group"><div class="gh">${esc(DOC_TYPE_LABEL[t])} <span>· ${list.length} ไฟล์</span></div><div class="${t === 'DISPOSED_PHOTO' ? 'grid3' : 'grid2'}">${body}</div></div>`;
    }).join('');

    // รูป PIC 1 / PIC 2 ของแต่ละรายการ (ไฟล์ของรายการเป็นสาธารณะ จึงใส่ URL ตรงๆ ได้)
    const picCell = (url) => `<td class="pic">${url ? `<img src="${esc(imgUrl(url))}" />` : '<span class="none">-</span>'}</td>`;
    const rowsHtml = items.map((i, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td class="b">${esc(i.assetNo)}</td>
        <td>${esc(i.assetName)}</td>
        <td>${esc(i.place)} <b style="color:#dc2626">(DISPOSAL)</b></td>
        <td>${esc(i.costCenter)}</td>
        <td class="r">${esc(fmtMoney(i.cost))}</td>
        <td class="r">${esc(fmtMoney(i.bkAmt))}</td>
        <td class="c">${i.isChecked ? '✓' : '—'}</td>
        <td class="c">${i.isKeyed ? '✓' : '—'}</td>
        ${picCell(i.pic1Url)}
        ${picCell(i.pic2Url)}
      </tr>`).join('');

    // ส่วนเดียวกับหน้ารายงานบนเว็บ: วิเคราะห์มูลค่า, ตารางสรุป, รายการยังไม่มีรูป, ประวัติ
    const ps = computePriceStats(items);
    const sumTotal = report?.summary?.totalCost || 0;
    const dayRows = report?.byDay || [];
    const missRows = report?.missingPhotoItems || [];
    const tblHtml = (rows, labelHead) => (rows.length
      ? `<table class="items"><thead><tr><th>${esc(labelHead)}</th><th>จำนวน</th><th>COST</th><th>สัดส่วน</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.key)}</td><td class="c">${esc(r.count)}</td><td class="r">${esc(fmtMoney(r.cost))}</td><td class="r">${sumTotal > 0 ? ((r.cost / sumTotal) * 100).toFixed(1) : '0.0'}%</td></tr>`).join('')}</tbody></table>`
      : '<div class="none">ไม่มีข้อมูล</div>');
    const summaryHtml = report ? `<div class="sub strip">ASSET DATE: ${esc(fmtDate(report.summary.firstAssetDate))} – ${esc(fmtDate(report.summary.lastAssetDate))} · บันทึกแล้ว ${dayRows.length} วัน · COST เฉลี่ยต่อรายการ ${esc(fmtMoney(items.length ? sumTotal / items.length : 0))}</div>` : '';
    const priceHtml = items.length ? `
  <h2>วิเคราะห์มูลค่า (${items.length} รายการ)</h2>
  <div class="cards">
    <div class="card"><div class="k">มูลค่ารวม (COST)</div><div class="v">${esc(fmtMoney(ps.total))}</div></div>
    <div class="card"><div class="k">Book value คงเหลือ (COST − ค่าเสื่อมสะสม)</div><div class="v">${esc(fmtMoney(ps.nbv))}</div><div class="k">${ps.pct(ps.nbv)}% · BKAMT ${esc(fmtMoney(ps.bk))}</div></div>
    <div class="card"><div class="k">ค่าเสื่อมสะสม (ACCUMDP)</div><div class="v">${esc(fmtMoney(ps.accum))}</div><div class="k">${ps.pct(ps.accum)}% ของมูลค่ารวม</div></div>
    <div class="card"><div class="k">เฉลี่ยต่อชิ้น</div><div class="v">${esc(fmtMoney(ps.total / items.length))}</div><div class="k">${ps.avgAge !== null ? `อายุเฉลี่ย ${ps.avgAge.toFixed(1)} ปี` : '-'}</div></div>
  </div>
  <div class="note ${ps.mismatch.length ? 'warn' : 'ok'}">${ps.mismatch.length
    ? `<b>BKAMT ไม่ตรงกับ COST − ค่าเสื่อมสะสม ${ps.mismatch.length} รายการ:</b> ${esc(ps.mismatch.slice(0, 5).map((i) => `${i.assetNo} (คำนวณ ${fmtMoney(ps.nbvOf(i))} / บันทึก ${fmtMoney(i.bkAmt)})`).join(' · '))}`
    : 'ตรวจแล้ว: Book value (COST − ค่าเสื่อมสะสม) ตรงกับ BKAMT ที่บันทึกทุกรายการ'}</div>
  <div class="two">
    <div>
      <div class="gh">รายการมูลค่าสูงสุด 5 อันดับ</div>
      <table class="items"><thead><tr><th>#</th><th>ASSET NO</th><th>ASSET NAME</th><th>COST</th><th>สัดส่วน</th></tr></thead>
      <tbody>${ps.top.map((i, idx) => `<tr><td class="c">${idx + 1}</td><td class="b">${esc(i.assetNo)}</td><td>${esc(i.assetName)}</td><td class="r">${esc(fmtMoney(i.cost))}</td><td class="r">${ps.pct(ps.num(i.cost))}%</td></tr>`).join('')}</tbody></table>
      <div class="sub">5 รายการแรกคิดเป็น ${ps.topShare.toFixed(1)}% ของมูลค่ารวม</div>
    </div>
    <div>
      <div class="gh">กระจายตามช่วงราคา (COST)</div>
      ${ps.bands.map((b) => `<div class="band"><div class="bl"><span>${esc(b.l)}</span><span>${b.count} รายการ · ${esc(fmtMoney(b.sum))}</span></div><div class="bt"><div class="bf" style="width:${(b.count / ps.maxBand) * 100}%"></div></div></div>`).join('')}
    </div>
  </div>` : '';
    const reportTablesHtml = report ? `
  <div class="two">
    <div><div class="gh">สรุปตาม COSTCENTER</div>${tblHtml(report.byCostCenter || [], 'COSTCENTER')}</div>
    <div><div class="gh">สรุปตามผู้บันทึก</div>${tblHtml(report.byRecorder || [], 'ผู้บันทึก')}</div>
  </div>
  <h2>สรุปตามวันที่บันทึก</h2>
  ${tblHtml(dayRows, 'วันที่บันทึก')}` : '';
    const missingHtml = report ? `
  <h2>รายการที่ยังไม่มีรูปครบ (${missRows.length})</h2>
  ${missRows.length
    ? `<table class="items"><thead><tr><th>ASSET NO</th><th>ASSET NAME</th><th>PIC 1</th><th>PIC 2</th></tr></thead><tbody>${missRows.map((m) => `<tr><td class="b">${esc(m.assetNo)}</td><td>${esc(m.assetName)}</td><td class="c">${m.hasPic1 ? '✓' : '—'}</td><td class="c">${m.hasPic2 ? '✓' : '—'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="none">ทุกรายการมีรูปครบแล้ว</div>'}` : '';
    const statusText = run.completedAt ? `เสร็จสิ้นเมื่อ ${fmtDate(run.completedAt)}` : run.status === 'Open' ? 'เปิดอยู่' : 'ปิดแล้ว';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(run.runCode)} · รายงาน</title>
<style>
  @page { size: A4; margin: 12mm 12mm 16mm; }
  @page { @bottom-left { content: "${esc(run.runCode)} · พิมพ์ ${esc(fmtDateTime(new Date()))}"; font-size: 8px; color: #64748b; } }
  @page { @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font-size: 8px; color: #64748b; } }
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', Tahoma, sans-serif; color: #1e293b; font-size: 11px; margin: 0; }
  .sub { color: #64748b; font-size: 11px; margin-top: 2px; }
  .hero { background: linear-gradient(135deg,#fff1f2,#ffffff); border: 1px solid #fecdd3; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
  .code { font-size: 20px; font-weight: 800; color: #881337; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e2e8f0; font-weight: 700; font-size: 10px; }
  .cards { display: flex; gap: 8px; margin-bottom: 12px; }
  .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
  .card .k { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .03em; }
  .card .v { font-size: 14px; font-weight: 800; margin-top: 2px; }
  h2 { font-size: 12px; margin: 14px 0 6px; color: #9f1239; border-bottom: 2px solid #fecdd3; padding-bottom: 3px; }
  table.flow { width: 100%; border-collapse: separate; border-spacing: 0; }
  td.step { width: 15%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; vertical-align: top; text-align: center; }
  td.step.done { background: #ecfdf5; border-color: #6ee7b7; }
  td.step.current { background: #fff7ed; border-color: #fdba74; }
  td.step.todo { background: #f8fafc; color: #94a3b8; }
  td.arrow { width: 1.5%; text-align: center; color: #cbd5e1; font-size: 10px; }
  .dot { width: 22px; height: 22px; line-height: 22px; border-radius: 50%; margin: 0 auto 4px; font-weight: 800; background: #cbd5e1; color: #fff; }
  .done .dot { background: #10b981; }
  .current .dot { background: #f97316; }
  .sn { font-size: 8px; color: #64748b; }
  .sl { font-weight: 800; font-size: 10px; margin: 2px 0; }
  .sb { font-size: 8px; font-weight: 700; }
  .se { font-size: 8px; color: #475569; margin-top: 3px; }
  .gap { font-size: 8px; color: #be123c; margin-top: 3px; font-weight: 700; }
  .group { margin-bottom: 10px; break-inside: avoid; }
  .gh { font-weight: 800; font-size: 11px; margin-bottom: 4px; }
  .gh span { color: #64748b; font-weight: 600; }
  .none { color: #94a3b8; font-size: 10px; padding: 4px 0; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  figure { margin: 0; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px; break-inside: avoid; }
  figure img { width: 100%; height: 150px; object-fit: cover; background: #f8fafc; }
  figcaption { font-size: 8px; color: #64748b; margin-top: 3px; }
  .file { border: 1px dashed #cbd5e1; border-radius: 6px; padding: 6px 8px; font-size: 10px; }
  .file span { display: block; color: #64748b; font-size: 8px; margin-top: 2px; }
  table.items { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  table.items th, table.items td { border: 1px solid #cbd5e1; padding: 3px 4px; text-align: left; vertical-align: middle; }
  table.items th { background: #ffe4e6; text-align: center; font-weight: 700; }
  table.items td.r { text-align: right; white-space: nowrap; }
  table.items td.c { text-align: center; }
  table.items td.b { font-weight: 700; white-space: nowrap; }
  table.items thead { display: table-header-group; }
  table.items tr { page-break-inside: avoid; }
  table.items tfoot td { font-weight: 800; background: #f8fafc; }
  table.items td.pic { width: 24mm; padding: 2px; text-align: center; }
  table.items td.pic img { display: block; width: 22mm; height: 16mm; object-fit: cover; margin: 0 auto; }
  .sign { display: flex; gap: 12px; margin-top: 18px; break-inside: avoid; }
  .sign div { flex: 1; text-align: center; font-size: 10px; }
  .sign .line { border-bottom: 1px solid #334155; height: 28px; margin: 0 14px 4px; }
  .strip { margin: 0 0 8px; }
  .note { font-size: 10px; border-radius: 6px; padding: 5px 8px; margin: 0 0 8px; }
  .note.ok { background: #ecfdf5; color: #065f46; }
  .note.warn { background: #fffbeb; color: #92400e; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
  .band { margin-bottom: 6px; }
  .bl { display: flex; justify-content: space-between; font-size: 9.5px; color: #475569; margin-bottom: 2px; }
  .bt { height: 8px; border-radius: 4px; background: #f1f5f9; overflow: hidden; }
  .bf { height: 8px; background: #e11d48; }
</style></head><body>
  <div class="hero">
    <div class="sub">IT ASSET DISPOSAL · รายงานการทำลายครุภัณฑ์</div>
    <div class="code">${esc(run.runCode)}</div>
    <div class="sub">
      <span class="pill">${esc(statusText)}</span>
      &nbsp; ขั้นที่ ${stageNum}/${RUN_STAGES.length} · ${esc(RUN_STAGES[Math.min(stageNum, RUN_STAGES.length) - 1].label)}
      &nbsp; · ผู้บันทึก ${esc(run.createdByName || '-')} · เปิดรอบ ${esc(fmtDate(run.createdAt))}
      ${run.accountingDocNo ? `&nbsp; · เลขเอกสารบัญชี ${esc(run.accountingDocNo)}` : ''}
    </div>
  </div>

  <div class="cards">
    <div class="card"><div class="k">จำนวนรายการ</div><div class="v">${items.length}</div></div>
    <div class="card"><div class="k">ราคาทุนรวม (COST)</div><div class="v">${esc(fmtMoney(totals.cost))}</div></div>
    <div class="card"><div class="k">ค่าเสื่อมสะสม</div><div class="v">${esc(fmtMoney(totals.accum))}</div></div>
    <div class="card"><div class="k">มูลค่าคงเหลือ (BKAMT)</div><div class="v">${esc(fmtMoney(totals.bk))}</div></div>
    <div class="card"><div class="k">ตรวจนับแล้ว</div><div class="v">${checkedCount} / ${items.length}</div></div>
    <div class="card"><div class="k">ลงบัญชีแล้ว</div><div class="v">${keyedCount} / ${items.length}</div></div>
  </div>

  ${summaryHtml}
  <h2>ความคืบหน้าตามขั้นตอน</h2>
  <table class="flow"><tr>${stepsHtml}</tr></table>

  ${priceHtml}
  ${reportTablesHtml}
  ${missingHtml}

  <h2>เอกสารแนบและรูปหลักฐาน (${docs.length} ไฟล์)</h2>
  ${docsHtml}

  <h2>รายการครุภัณฑ์ (${items.length} รายการ)</h2>
  <table class="items">
    <thead><tr>
      <th>#</th><th>ASSET NO</th><th>ASSET NAME</th><th>PLACE</th><th>COSTCENTER</th><th>COST</th><th>BKAMT</th><th>ตรวจนับ</th><th>ลงบัญชี</th><th>PIC 1</th><th>PIC 2</th>
    </tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="11" class="c">ไม่มีรายการ</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="5" class="r">รวม</td>
      <td class="r">${esc(fmtMoney(totals.cost))}</td>
      <td class="r">${esc(fmtMoney(totals.bk))}</td>
      <td colspan="4"></td>
    </tr></tfoot>
  </table>

  <div class="sign">
    <div><div class="line"></div>ผู้บันทึกรายการ<br>วันที่ ____________</div>
    <div><div class="line"></div>ผู้ตรวจสอบ<br>วันที่ ____________</div>
    <div><div class="line"></div>ผู้อนุมัติ<br>วันที่ ____________</div>
  </div>
  <script>
    window.onload = () => {
      const imgs = Array.from(document.images);
      Promise.all(imgs.map((im) => im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; })))
        .then(() => setTimeout(() => window.print(), 200));
    };
  </script>
</body></html>`;
    printHtmlInFrame(html);
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
          onConfirm={() => { const fn = confirmState?.onConfirm; setConfirmState(null); fn?.(); }}
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
                {/* ความคืบหน้าตามขั้นตอนของรอบ (5 ขั้น) */}
                {(() => {
                  const st = Math.min(RUN_STAGES.length, Math.max(1, Number(r.stage) || 1));
                  const stageLabel = RUN_STAGES.find((s) => s.n === st)?.label || '';
                  return (
                    <div className="mt-4">
                      <div className="flex items-center gap-1" aria-label={`ขั้นที่ ${st} จาก 5`}>
                        {RUN_STAGES.map((s) => (
                          <span key={s.n} className={`h-1.5 flex-1 rounded-full ${s.n <= st ? (st === 5 ? 'bg-sky-500' : 'bg-emerald-500') : 'bg-slate-200'}`} />
                        ))}
                      </div>
                      <div className="mt-1.5 text-xs text-slate-500">ขั้นที่ {st}/{RUN_STAGES.length} ·<span className="font-semibold text-slate-700">{stageLabel}</span></div>
                    </div>
                  );
                })()}
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
          {canEditRun && isOpen && (isCreator || isAdmin) && (
            <button onClick={handleCloseRun} disabled={busy || (Number(run.stage) || 1) < 2} title={(Number(run.stage) || 1) < 2 ? 'ต้องทำขั้นที่ 1 "บันทึกและถ่ายภาพ" ให้ครบก่อน' : 'ปิดรอบ'} className="bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap">
              <Lock size={16} /> ปิดรอบ
            </button>
          )}
          <button onClick={() => setStickerOpen(true)} disabled={!items.length} className="bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap">
            <Printer size={16} /> พิมพ์ป้าย
          </button>
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
          <button onClick={handleExport} disabled={!items.length} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 whitespace-nowrap">
            <FileSpreadsheet size={18} /> Export Excel
          </button>
          {/* ลบรอบแยกไว้ท้ายสุด ห่างจากปุ่มพิมพ์ เพื่อกันกดผิด */}
          {canDeleteRun && (isCreator || isAdmin) && (
            <div className="ml-auto pl-3 border-l border-slate-200">
              <button onClick={handleDeleteRun} disabled={busy} className="bg-white hover:bg-rose-50 disabled:opacity-60 text-rose-600 border border-rose-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap">
                <Trash2 size={16} /> ลบรอบ
              </button>
            </div>
          )}
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
        const stage = Number(run.stage) || 1;
        const steps = RUN_STAGES.map((s) => ({ label: s.label, n: s.n, done: s.n < stage, current: s.n === stage }));
        const currentIdx = stage - 1;
        const doneDays = isCompleted && run.createdAt
          ? Math.max(0, Math.round((new Date(run.completedAt) - new Date(run.createdAt)) / 86400000))
          : null;
        return (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 mb-5 grid grid-cols-1 gap-5">
            <div>
              <div className="text-xs font-bold text-slate-500 mb-3">ความคืบหน้าของรอบ</div>
              {/* ขั้นตอนเป็นการ์ดไอคอน + ลูกศรเชื่อมระหว่างขั้น */}
              <div className="overflow-x-auto pb-1">
                <ol className="flex items-stretch gap-1 min-w-[640px]">
                  {steps.map((s, i) => {
                    const Icon = RUN_STAGE_ICONS[s.n - 1];
                    const arrowOn = i > 0 && steps[i - 1].done;
                    return (
                      <Fragment key={s.n}>
                        {i > 0 && (
                          <li aria-hidden="true" className={`flex shrink-0 items-center self-center ${arrowOn ? 'text-emerald-500' : 'text-slate-300'}`}>
                            <ArrowRight size={16} strokeWidth={2.5} />
                          </li>
                        )}
                        <li className="flex min-w-0 flex-1" aria-current={s.current ? 'step' : undefined}>
                          <button
                            type="button"
                            onClick={() => askSetStage(s)}
                            disabled={!canEditRun || isCompleted || Math.abs(s.n - (Number(run.stage) || 1)) !== 1}
                            title={canEditRun ? `ขั้นที่ ${s.n}: ${s.label}${s.current ? ' (ขั้นปัจจุบัน)' : ' — กดเพื่อเปลี่ยนมาขั้นนี้'}` : `ขั้นที่ ${s.n}: ${s.label}`}
                            className={`w-full min-h-[118px] flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-2.5 text-center transition disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                              s.current ? 'border-rose-500 bg-rose-50 shadow-md shadow-rose-100'
                                : s.done ? 'border-emerald-200 bg-emerald-50/60'
                                  : 'border-slate-200 bg-white'
                            }`}
                          >
                            <span className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              s.done ? 'bg-emerald-500 text-white'
                                : s.current ? 'bg-rose-600 text-white'
                                  : 'bg-slate-100 text-slate-400'
                            }`}>
                              {s.done ? <CheckCircle2 size={20} /> : <Icon size={18} />}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wide ${s.current ? 'text-rose-600' : s.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                              ขั้นที่ {s.n}
                            </span>
                            <span className={`text-xs leading-snug break-words ${s.current ? 'font-black text-rose-700' : s.done ? 'font-semibold text-slate-700' : 'font-medium text-slate-400'}`}>
                              {s.label}
                            </span>
                          </button>
                        </li>
                      </Fragment>
                    );
                  })}
                </ol>
              </div>
              <div className={`mt-2 text-xs ${canEditRun && !isCompleted && !stageGateReason((Number(run.stage) || 1) + 1) ? 'text-slate-500' : 'text-amber-700'}`}>
                {!canEditRun
                  ? 'ต้องมีสิทธิ์แก้ไขรอบจึงจะเปลี่ยนสถานะได้'
                  : isCompleted
                    ? 'รอบนี้เสร็จสิ้นแล้ว ต้องยกเลิกเสร็จสิ้นก่อนจึงจะเปลี่ยนขั้นได้'
                    : (Number(run.stage) || 1) >= 6
                      ? 'ทำทิ้งแล้ว'
                      : stageGateReason((Number(run.stage) || 1) + 1)
                        ? `ขั้นถัดไปยังไม่ได้: ${stageGateReason((Number(run.stage) || 1) + 1)}`
                        : 'กดที่ขั้นถัดไปเพื่อเปลี่ยนสถานะ (ไปได้ทีละขั้น และระบบจะถามยืนยันก่อน)'}
              </div>
              {doneDays !== null && (
                <div className="mt-3 text-xs text-slate-500">ใช้เวลาจากเปิดรอบถึงเสร็จสิ้น <b className="text-slate-800">{doneDays} วัน</b></div>
              )}
              {run.status === 'Closed' && !isCompleted && (
                <div className="mt-3 text-xs text-slate-500">ปิดมาแล้ว <b className="text-slate-800">{daysSince(run.closedAt)} วัน</b></div>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 border-t border-slate-100 pt-4">
              <MiniStat icon={Trash2} title="จำนวนรายการ" value={totals.count} color="from-rose-500 to-rose-600" />
              <MiniStat icon={Coins} title="รวม COST" value={fmtMoney(totals.cost)} color="from-slate-500 to-slate-700" />
              <MiniStat icon={Coins} title="รวม ACCUMDP" value={fmtMoney(totals.accum)} color="from-amber-400 to-amber-500" />
              <MiniStat icon={Coins} title="รวม BKAMT" value={fmtMoney(totals.bk)} color="from-emerald-400 to-emerald-600" />
            </div>
          </section>
        );
      })()}

      {run && (canEditRun || run.accountingDocNo) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <div className="text-xs font-bold text-slate-500">เลขเอกสารบัญชีของรอบ</div>
          {docEditing && canEditRun && (Number(run.stage) || 1) < DOC_NO_LOCK_STAGE ? (
            <>
              <input
                id="run-doc-input"
                key={`${selectedRunId}-${run.accountingDocNo || ''}`}
                ref={runDocRef}
                defaultValue={run.accountingDocNo || ''}
                maxLength={50}
                autoFocus
                placeholder="เช่น JV-2026-0001"
                onKeyDown={(e) => { if (e.key === 'Enter') saveRunDoc(); if (e.key === 'Escape') setDocEditing(false); }}
                className="min-w-0 w-full sm:w-72 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button type="button" onClick={saveRunDoc}
                className="px-3.5 py-1.5 rounded-lg text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400">
                บันทึก
              </button>
              <button type="button" onClick={() => setDocEditing(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400">
                ยกเลิก
              </button>
            </>
          ) : (
            <>
              <div className={`text-sm break-all ${run.accountingDocNo ? 'font-bold text-slate-800' : 'text-slate-400'}`}>
                {run.accountingDocNo || 'ยังไม่ได้กรอก'}
              </div>
              {canEditRun && (Number(run.stage) || 1) >= DOC_NO_LOCK_STAGE && (
                <span className="text-xs text-slate-500">ล็อกตั้งแต่ขั้นที่ {DOC_NO_LOCK_STAGE} (ย้อนขั้นตอนก่อนจึงแก้ได้)</span>
              )}
              {canEditRun && (Number(run.stage) || 1) < DOC_NO_LOCK_STAGE && (
                <button type="button" onClick={() => setDocEditing(true)}
                  className={`ml-auto px-3.5 py-1.5 rounded-lg text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                    run.accountingDocNo ? 'border border-slate-200 text-slate-700 hover:bg-slate-50' : 'text-white bg-rose-600 hover:bg-rose-700'
                  }`}>
                  {run.accountingDocNo ? 'แก้ไข' : 'เพิ่ม'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm mb-6">
        {[
          { k: 'items', label: 'รายการ' },
          { k: 'check', label: `ตรวจนับ${items.length ? ` (${items.filter((i) => i.isChecked).length}/${items.length})` : ''}` },
          { k: 'report', label: 'รายงาน' },
          { k: 'docs', label: `เอกสารแนบ${attachments.length ? ` (${attachments.length})` : ''}` },
        ].map((t) => (
          <button key={t.k} onClick={() => setDetailTab(t.k)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition ${detailTab === t.k ? 'bg-rose-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {detailTab === 'check' ? renderCheck() : detailTab === 'docs' ? renderDocs() : detailTab === 'report' ? (
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
            <button onClick={() => handlePrintReport()} disabled={!items.length}
              className="ml-auto inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow">
              <Printer size={14} /> พิมพ์รายงาน PDF
            </button>
            <button onClick={() => setDetailTab('docs')} className="text-xs font-bold text-rose-600 hover:underline">
              ไปที่เอกสารแนบ
            </button>
          </section>
          <PriceReport items={items} />
          <ReportView report={report} events={events} attachments={attachments} onOpenDoc={viewDoc} onAttachPhoto={(item) => setPhotoItem(item)} canEdit={canEdit} />
        </>
      ) : (
        <>
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
                    disabled={addLocked}
                    title={addLocked ? ADD_LOCK_MSG : undefined}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                <button type="submit" disabled={searching || !searchCode.trim() || addLocked} title={addLocked ? ADD_LOCK_MSG : undefined} className={`px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 ${addLocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white'}`}>
                  {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} ค้นหา Fixed Asset
                </button>
              </form>

              {searchWarn && (
                <div className="mb-3 -mt-2 flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-4 py-2.5 text-sm font-medium">
                  <AlertTriangle size={16} className="shrink-0" /> {searchWarn}
                </div>
              )}
              <AlertModal
                isOpen={ccWarning !== null}
                type="danger"
                title="บันทึกรายการไม่ได้"
                message={ccWarning && (
                  <span className="block text-left text-xs text-slate-700 bg-slate-50 rounded-lg px-3 py-2.5 space-y-1">
                    <span className="block text-sm text-rose-700 font-bold text-center mb-1.5">COSTCENTER {ccWarning.costCenter} ไม่ใช่ {REQUIRED_COST_CENTER}</span>
                    <span className="flex gap-2"><b className="w-16 shrink-0 text-slate-500">ASSET NO</b><span className="font-semibold">{ccWarning.assetNo || '-'}</span></span>
                    <span className="flex gap-2"><b className="w-16 shrink-0 text-slate-500">NAME</b><span className="min-w-0 break-words">{ccWarning.assetName || '-'}</span></span>
                    <span className="flex gap-2"><b className="w-16 shrink-0 text-slate-500">PLACE</b><span className="min-w-0 break-words">{ccWarning.place || '-'}</span></span>
                    <span className="flex gap-2"><b className="w-16 shrink-0 text-slate-500">COST</b><span>{fmtMoney(ccWarning.cost)}</span></span>
                  </span>
                )}
                confirmText="ตกลง"
                onConfirm={() => { setCcWarning(null); resetForm(); }}
              />
              {found && String(form.costCenter ?? '').trim() !== REQUIRED_COST_CENTER && (
                <div role="alert" className="mb-3 flex items-start gap-2 bg-rose-50 text-rose-700 border border-rose-300 rounded-xl px-4 py-2.5 text-sm font-semibold">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>COSTCENTER ของรายการนี้คือ {form.costCenter || '-'} ไม่ใช่ {REQUIRED_COST_CENTER} จึงบันทึกไม่ได้</div>
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
                    <button type="submit" disabled={saving || addLocked || ccMismatch} title={addLocked ? ADD_LOCK_MSG : ccMismatch ? `บันทึกได้เฉพาะ COSTCENTER ${REQUIRED_COST_CENTER}` : undefined} className={`px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 ${addLocked || ccMismatch ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white shadow-lg shadow-rose-200'}`}>
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
                    <div className="text-xs text-slate-400 break-words">{it.place || '-'} <span className="font-semibold text-red-600">(DISPOSAL)</span></div>
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
                      <button onClick={() => handleDelete(it)} disabled={addLocked} title={addLocked ? ADD_LOCK_MSG.replace('เพิ่มรายการ', 'ลบรายการ') : 'ลบรายการ'} className={`p-2 rounded-lg ${addLocked ? 'text-slate-300 cursor-not-allowed' : 'text-rose-500 hover:bg-rose-50'}`}>
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:hidden mt-3 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <Pagination currentPage={curPage} totalPages={totalPages} onPageChange={setPage} itemsPerPage={PAGE_SIZE} totalItems={sortedItems.length} />
          </div>

          {/* เรียงลำดับรายการ (เลือกจาก dropdown หรือกดหัวคอลัมน์ในตาราง) */}
          {items.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
              <span className="text-slate-400 font-bold">กรอง</span>
              <select
                value={itemFilter}
                onChange={(e) => { setItemFilter(e.target.value); setPage(1); }}
                aria-label="กรองรายการ"
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {ITEM_FILTERS.map(([k, l]) => (
                  <option key={k} value={k}>{l} ({items.filter((i) => itemMatchesFilter(k, i)).length})</option>
                ))}
              </select>
              <span className="text-slate-400 font-bold">เรียงตาม</span>
              <select
                value={itemSort.key || ''}
                onChange={(e) => { setItemSort(e.target.value ? { key: e.target.value, dir: 'asc' } : { key: null, dir: 'asc' }); setPage(1); }}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">ลำดับที่บันทึก</option>
                {ITEM_SORT_LABELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {canEdit && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const list = pagedItems.filter((i) => !i.isKeyed);
                      setConfirmState({
                        type: 'confirm',
                        title: 'ติ๊กลงบัญชีทั้งหน้า',
                        message: `ทำเครื่องหมายว่าลงบัญชีแล้ว ${list.length} รายการในหน้านี้? (ยกเลิกได้ภายหลัง)`,
                        confirmText: 'ติ๊กทั้งหน้า',
                        onConfirm: () => setKeyed(list, true),
                      });
                    }}
                    disabled={busy || !pagedItems.some((i) => !i.isKeyed)}
                    title="ทำเครื่องหมายว่าลงบัญชีแล้วทุกรายการในหน้านี้ที่ยังไม่ได้ติ๊ก"
                    className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    ติ๊กลงบัญชีทั้งหน้านี้
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const list = pagedItems.filter((i) => i.isKeyed);
                      setConfirmState({
                        type: 'confirm',
                        title: 'ยกเลิกลงบัญชีทั้งหน้า',
                        message: `ยกเลิกเครื่องหมายลงบัญชี ${list.length} รายการในหน้านี้?`,
                        confirmText: 'ยกเลิกทั้งหน้า',
                        onConfirm: () => setKeyed(list, false),
                      });
                    }}
                    disabled={busy || !pagedItems.some((i) => i.isKeyed)}
                    title="ยกเลิกเครื่องหมายลงบัญชีของทุกรายการในหน้านี้ที่ติ๊กไว้"
                    className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-bold hover:bg-rose-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  >
                    ยกเลิกลงบัญชีทั้งหน้านี้
                  </button>
                </div>
              )}
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
                  <col style={{ width: '2%' }} /><col style={{ width: '3%' }} /><col style={{ width: '8%' }} />
                  <col style={{ width: '6.5%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} />
                  <col style={{ width: '4%' }} /><col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                  <col style={{ width: '6%' }} /><col style={{ width: '3.5%' }} /><col style={{ width: '3.5%' }} />
                  <col style={{ width: '9.5%' }} /><col style={{ width: '6%' }} />
                </colgroup>
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-1 py-1.5 text-center whitespace-nowrap normal-case" title="ติ๊กเมื่อกรอกรายการนี้ลงระบบบัญชีแล้ว">ลงบัญชี</th>
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
                      <td colSpan={14} className="px-4 py-12 text-center text-slate-400">
                        <ImageIcon size={28} className="mx-auto mb-2 opacity-40" />
                        {isOpen ? 'ยังไม่มีรายการในรอบนี้ — ค้นหา ASSET NO เพื่อเพิ่มรายการ' : 'ไม่มีรายการในรอบนี้'}
                      </td>
                    </tr>
                  )}
                  {pagedItems.map((it, idx) => (
                    <tr key={it.itemId} className="hover:bg-slate-50/70">
                      <td className="px-2 py-1 text-slate-400">{(curPage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => setKeyed([it], !it.isKeyed)}
                          disabled={busy || !canEdit}
                          title={it.isKeyed ? `ลงบัญชีแล้ว (${it.keyedByName || it.keyedBy || ''}) — กดเพื่อยกเลิก` : 'ยังไม่ได้ลงบัญชี — กดเพื่อทำเครื่องหมายว่าลงแล้ว'}
                          aria-label={it.isKeyed ? 'ยกเลิกลงบัญชี' : 'ทำเครื่องหมายว่าลงบัญชีแล้ว'}
                          className={`p-0.5 rounded disabled:opacity-50 ${it.isKeyed ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'}`}
                        >
                          {it.isKeyed ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                        </button>
                      </td>
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
                      <td className="px-2 py-1 break-words" title={it.place || ''}>{it.place} <span className="font-semibold text-red-600">(DISPOSAL)</span></td>
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
                          <button onClick={() => handleDelete(it)} disabled={addLocked} title={addLocked ? ADD_LOCK_MSG.replace('เพิ่มรายการ', 'ลบรายการ') : 'ลบรายการ'} className={`p-1 rounded-lg ${addLocked ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}>
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
                      <td colSpan={7} className="px-2 py-1.5 text-right">รวม</td>
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
              totalItems={sortedItems.length}
            />
          </section>
        </>
      )}

      {detailItem && (
        <DetailModal
          item={detailItem}
          list={sortedItems}
          runCode={run?.runCode}
          runDocNo={run?.accountingDocNo}
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
        onConfirm={() => { const fn = confirmState?.onConfirm; setConfirmState(null); fn?.(); }}
        onCancel={() => setConfirmState(null)}
      />

      {stickerOpen && (
        <StickerSheetModal
          items={items}
          runCode={run?.runCode}
          runDocNo={run?.accountingDocNo}
          onClose={() => setStickerOpen(false)}
        />
      )}

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

// ─── พิมพ์ป้ายหลายรายการลงกระดาษ (ตัดเอง) ───────────────────────────────────────
// ขนาดกระดาษมาตรฐาน + กำหนดเอง, คำนวณจำนวนแถว/คอลัมน์ที่ใส่ได้ต่อหน้า แล้วพิมพ์เป็นหลายหน้าอัตโนมัติ
const STICKER_PAPERS = [
  { key: 'A3', label: 'A3 (297 × 420 มม.)', w: 297, h: 420 },
  { key: 'A4', label: 'A4 (210 × 297 มม.)', w: 210, h: 297 },
  { key: 'A5', label: 'A5 (148 × 210 มม.)', w: 148, h: 210 },
  { key: 'A6', label: 'A6 (105 × 148 มม.)', w: 105, h: 148 },
  { key: 'B5', label: 'B5 (176 × 250 มม.)', w: 176, h: 250 },
  { key: 'Letter', label: 'Letter (216 × 279 มม.)', w: 216, h: 279 },
  { key: 'Legal', label: 'Legal (216 × 356 มม.)', w: 216, h: 356 },
  { key: 'Slip', label: 'สลิป 3 × 2 นิ้ว (1 ป้าย/หน้า)', w: 76.2, h: 50.8 },
  { key: 'Custom', label: 'กำหนดเอง', w: 210, h: 297 },
];

const stickerEsc = (v) => String(v ?? '-').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Barcode Code 128 เป็น SVG (ใช้ได้เมื่อเครื่องสแกนอ่าน QR ไม่ได้)
// ปรับความกว้างแท่งให้เต็มความกว้างที่กำหนด (มม.) — ไม่ให้เหลือช่องว่างสองข้างแบบเดิม
const barcodeSvg = (text, widthMm) => {
  const make = (w) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, String(text), { format: 'CODE128', displayValue: false, margin: 0, height: 40, width: w });
    return svg;
  };
  // JsBarcode ใส่หน่วย px ต่อท้ายค่า width (เช่น "130px") จึงต้อง parseFloat ไม่ใช่ Number
  const naturalPx = parseFloat(make(1).getAttribute('width')) || 1;
  const targetPx = (widthMm * 96) / 25.4;
  // ไม่ปัดขึ้นเป็น 1 เด็ดขาด (ป้ายแคบจะทำให้แท่งบาร์โค้ดล้นและถูกตัดข้อมูล)
  const w = Math.max(0.05, Math.floor((targetPx / naturalPx) * 100) / 100);
  const svg = make(w);
  // viewBox ตามขนาดจริงของแท่ง ทำให้แท่งยืดตามกรอบเสมอ ไม่ถูกตัดเมื่อกรอบแคบกว่าความกว้างเดิม
  const vw = parseFloat(svg.getAttribute('width')) || naturalPx;
  const vh = parseFloat(svg.getAttribute('height')) || 40;
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  return svg.outerHTML;
};

// สร้าง HTML สำหรับพิมพ์ป้าย ใช้ร่วมกันทั้งพิมพ์หลายรายการและพิมพ์ป้ายเดี่ยว
// sheets = [[รายการหน้า 1], [รายการหน้า 2], ...] แต่ละหน้าจัดเป็น cols คอลัมน์
const buildStickerHtml = async ({ sheets, pw, ph, cols, rows, lw, lh, gap, margin, showGuide, showBoxes, slip, runCode, runDocNo }) => {
  const flat = sheets.flat();
  // ขนาดฐานอ้างอิงป้าย 70×40 มม. เมื่อป้ายใหญ่ขึ้น (ลดคอลัมน์/แถว) ตัวอักษรและ QR/บาร์โค้ดจะขยายตาม
  const sc = Math.max(0.2, Math.min(lw / 70, lh / 40));
  const z = (v) => +(v * sc).toFixed(2);
  // เส้นตัดแบ่งกลางช่องว่างระหว่างป้าย วิ่งตลอดแผ่น (ตัดตามเส้นได้โดยไม่ต้องตัดทีละกรอบ)
  let guideHtml = '';
  if (showGuide) {
    // รวมเส้นนอกสุดด้วย (ห่างจากป้ายนอกสุดเท่ากับครึ่งช่องว่าง) เพื่อให้ทุกป้ายมีขอบขาวเท่ากันเมื่อตัด
    for (let c = 0; c <= cols; c++) guideHtml += `<div class="gv" style="left:${margin + c * lw + (c - 0.5) * gap}mm"></div>`;
    for (let r = 0; r <= rows; r++) guideHtml += `<div class="gh" style="top:${margin + r * lh + (r - 0.5) * gap}mm"></div>`;
  }
  const media = await Promise.all(flat.map(async (i) => ({
    qr: await QRCode.toString(i.assetNo, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }),
    bc: barcodeSvg(i.assetNo, lw - 4),
  })));
  let n = 0;
  const sheetHtml = sheets.map((items) => `<section class="sheet">${items.map((i) => {
    const mm = media[n++];
    return `
      <div class="lb">
        <div class="top">
          <div class="txt">
            <div class="code">${stickerEsc(i.assetNo)}</div>
            <div class="name">${stickerEsc(i.assetName)}</div>
            <div class="place">${stickerEsc(i.place)}</div>
            <div class="meta">CC ${stickerEsc(i.costCenter)} · ${stickerEsc(fmtDate(i.assetDate))}</div>
            <div class="meta">${stickerEsc(runCode)}${slip ? '' : ` · รูปภาพ ${(i.pic1Url ? 1 : 0) + (i.pic2Url ? 1 : 0)}/2`}</div>
            <div class="doc">เอกสารบัญชี: ${stickerEsc(runDocNo)}</div>
            <div class="meta">ผู้บันทึก: ${stickerEsc(i.createdByName || i.createdBy)}</div>
          </div>
          <div class="qr">${mm.qr}</div>
        </div>
        <div class="bc">${mm.bc}</div>
      </div>`;
  }).join('')}${guideHtml}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>ป้ายครุภัณฑ์</title><style>
  @page { size: ${pw}mm ${ph}mm; margin: 0; }
  html, body { margin: 0; padding: 0; color: #000; font-family: 'Sarabun', Tahoma, sans-serif; }
  .sheet { position: relative; box-sizing: border-box; width: ${pw}mm; height: ${ph}mm; padding: ${margin}mm; display: grid; grid-template-columns: repeat(${cols}, ${lw}mm); grid-auto-rows: ${lh}mm; gap: ${gap}mm; align-content: start; justify-content: start; overflow: hidden; }
  .sheet + .sheet { break-before: page; page-break-before: always; }
  .lb { box-sizing: border-box; width: ${lw}mm; height: ${lh}mm; padding: ${z(2)}mm; overflow: hidden; display: flex; flex-direction: column; ${showBoxes ? 'border: 0.2mm dashed #94a3b8;' : ''} }
  .gv { position: absolute; top: 0; bottom: 0; width: 0; border-left: 0.2mm dashed #94a3b8; }
  .gh { position: absolute; left: 0; right: 0; height: 0; border-top: 0.2mm dashed #94a3b8; }
  .top { display: flex; align-items: flex-start; gap: ${z(2)}mm; flex: 1; min-height: 0; overflow: hidden; }
  .txt { flex: 1; min-width: 0; max-height: 100%; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start; }
  .qr { flex: 0 0 ${z(18)}mm; width: ${z(18)}mm; height: ${z(18)}mm; }
  .qr svg, .bc svg { display: block; width: 100%; height: 100%; }
  .bc { flex: 0 0 ${z(7)}mm; height: ${z(7)}mm; margin-top: ${z(1.5)}mm; }
  .code { font-size: 15pt; font-weight: 900; line-height: 1.05; word-break: break-all; }
  .name { font-size: ${z(6.5)}pt; line-height: 1.15; margin-top: ${z(0.6)}mm; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .place { font-size: ${z(6)}pt; line-height: 1.15; color: #222; margin-top: ${z(0.5)}mm; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { font-size: ${z(5.5)}pt; color: #333; margin-top: ${z(0.5)}mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .doc { font-size: ${z(7)}pt; font-weight: 700; margin-top: ${z(0.5)}mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head><body>${sheetHtml}
<script>window.onload = function () { setTimeout(function () { window.print(); }, 150); };</script>
</body></html>`;
};

// พิมพ์ HTML ผ่าน iframe ที่ซ่อนอยู่ (ไม่เปิดแท็บใหม่ และไม่โดนบล็อกป๊อปอัป)
const printHtmlInFrame = (html) => {
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

// คำนวณจำนวนป้ายที่ใส่ได้ในกระดาษ (หน่วยมม.) — ขอบกระดาษ margin, ระยะห่างระหว่างป้าย gap
const calcStickerGrid = ({ pw, ph, lw, lh, gap, margin }) => {
  const uw = pw - 2 * margin;
  const uh = ph - 2 * margin;
  const cols = lw > 0 && uw > 0 ? Math.floor((uw + gap) / (lw + gap)) : 0;
  const rows = lh > 0 && uh > 0 ? Math.floor((uh + gap) / (lh + gap)) : 0;
  const c = Math.max(0, cols);
  const r = Math.max(0, rows);
  return { cols: c, rows: r, perPage: c * r };
};

// ปุ่ม −/+ สำหรับจำนวนคอลัมน์หรือแถว (ขั้นต่ำ 1)
const CountStepper = ({ label, value, onChange }) => (
  <div>
    <span className="text-xs font-bold text-slate-500 block mb-1">{label}</span>
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} aria-label={`ลด${label}`} className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">−</button>
      <input
        type="number"
        min="1"
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        aria-label={label}
        className="w-16 h-9 text-center rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
      />
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`เพิ่ม${label}`} className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">+</button>
    </div>
  </div>
);

// หน้าตาป้าย 1 ใบสำหรับตัวอย่าง (ข้อมูลตรงกับที่พิมพ์) — ใช้หน่วย cqw เทียบกับ container ที่ครอบอยู่ จึงย่อขยายตามกรอบได้ทุกขนาดกระดาษ
const fillSvg = (s) => String(s || '').replace('<svg ', '<svg style="display:block;width:100%;height:100%" ');
const LabelFace = ({ item, qr, bc, w, h, runCode, runDocNo }) => (
  <div className="bg-white text-black overflow-hidden" style={{ width: '100%', aspectRatio: `${w} / ${h}`, padding: '3cqw', display: 'flex', flexDirection: 'column', fontFamily: "'Sarabun', Tahoma, sans-serif" }}>
    <div style={{ display: 'flex', gap: '2.5cqw', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ fontSize: '7cqw', fontWeight: 900, lineHeight: 1.05, wordBreak: 'break-all' }}>{item.assetNo}</div>
        <div style={{ fontSize: '3.4cqw', lineHeight: 1.15, marginTop: '1cqw', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.assetName || '-'}</div>
        <div style={{ fontSize: '3cqw', lineHeight: 1.15, marginTop: '1cqw', color: '#222', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.place || '-'}</div>
        <div style={{ fontSize: '2.8cqw', marginTop: '1cqw', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>CC {item.costCenter || '-'} · {fmtDate(item.assetDate)}</div>
        <div style={{ fontSize: '2.8cqw', marginTop: '0.5cqw', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{runCode}</div>
        <div style={{ fontSize: '3cqw', fontWeight: 700, marginTop: '0.5cqw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>เอกสารบัญชี: {runDocNo || '-'}</div>
        <div style={{ fontSize: '2.8cqw', marginTop: '0.5cqw', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ผู้บันทึก: {item.createdByName || item.createdBy || '-'}</div>
      </div>
      <div style={{ flex: '0 0 25.7cqw', width: '25.7cqw', height: '25.7cqw' }} dangerouslySetInnerHTML={{ __html: qr }} />
    </div>
    <div style={{ flex: '0 0 10cqw', height: '10cqw', marginTop: '1.5cqw' }} dangerouslySetInnerHTML={{ __html: bc }} />
  </div>
);

const StickerSheetModal = ({ items, runCode, runDocNo, onClose }) => {
  const [paper, setPaper] = useState('A4');
  const [orient, setOrient] = useState('landscape');
  const [custom, setCustom] = useState({ w: 210, h: 297 });
  const [label, setLabel] = useState({ w: 70, h: 40 });
  const [gap, setGap] = useState(2);
  const [margin, setMargin] = useState(5);
  const [showGuide, setShowGuide] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [fit, setFit] = useState(true);
  const [fitCols, setFitCols] = useState(3);
  const [fitRows, setFitRows] = useState(3);
  // เริ่มต้นยังไม่เลือกรายการใดเลย กันการพิมพ์ทั้งรอบโดยไม่ตั้งใจ
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const base = STICKER_PAPERS.find((p) => p.key === paper) || STICKER_PAPERS[1];
  // โหมดสลิป: กระดาษ = ขนาดป้ายเอง 1 ใบต่อ 1 ป้าย ไม่มีขอบ ช่องว่าง หรือเส้นตัด
  const isSlip = paper === 'Slip';
  const baseW = paper === 'Custom' ? Number(custom.w) : base.w;
  const baseH = paper === 'Custom' ? Number(custom.h) : base.h;
  const pw = isSlip ? base.w : orient === 'landscape' ? Math.max(baseW, baseH) : Math.min(baseW, baseH);
  const ph = isSlip ? base.h : orient === 'landscape' ? Math.min(baseW, baseH) : Math.max(baseW, baseH);
  const g = isSlip ? 0 : Number(gap);
  const m = isSlip ? 0 : Number(margin);
  // โหมดกำหนดแถว/คอลัมน์เอง: คำนวณขนาดป้ายให้พอดีกระดาษ (ปัดลง 0.1 มม.)
  const fitW = fitCols > 0 ? Math.max(0, Math.floor(((pw - 2 * m - (fitCols - 1) * g) / fitCols) * 10) / 10) : 0;
  const fitH = fitRows > 0 ? Math.max(0, Math.floor(((ph - 2 * m - (fitRows - 1) * g) / fitRows) * 10) / 10) : 0;
  const lw = isSlip ? base.w : fit ? fitW : Number(label.w);
  const lh = isSlip ? base.h : fit ? fitH : Number(label.h);
  const grid = calcStickerGrid({ pw, ph, lw, lh, gap: g, margin: m });
  const chosen = items.filter((i) => selected.has(i.itemId));
  const sample = chosen[0] || items[0];
  // ตัวอย่างในช่องพรีวิว: ใส่หน้าตาป้ายเมื่อจำนวนป้ายต่อหน้าไม่มาก (กันหน่วงจากการสร้าง QR หลายร้อยตัว)
  const showFaces = !!sample && grid.perPage > 0 && grid.perPage <= 60;
  const sampleNo = sample?.assetNo;
  const [sampleQr, setSampleQr] = useState('');
  useEffect(() => {
    if (!showFaces || !sampleNo) { setSampleQr(''); return; }
    let alive = true;
    QRCode.toString(String(sampleNo), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then((s) => { if (alive) setSampleQr(fillSvg(s)); });
    return () => { alive = false; };
  }, [showFaces, sampleNo]);
  const sampleBc = showFaces ? fillSvg(barcodeSvg(sampleNo, lw - 4)) : '';
  const pages = grid.perPage > 0 ? Math.ceil(chosen.length / grid.perPage) : 0;
  const canPrint = grid.perPage > 0 && chosen.length > 0;

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allOn = items.length > 0 && chosen.length === items.length;
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(items.map((i) => i.itemId)));

  const handlePrint = async () => {
    if (!canPrint) return;
    const sheets = [];
    for (let p = 0; p < pages; p++) sheets.push(chosen.slice(p * grid.perPage, (p + 1) * grid.perPage));
    printHtmlInFrame(await buildStickerHtml({ sheets, pw, ph, cols: grid.cols, rows: grid.rows, lw, lh, gap: g, margin: m, showGuide: showGuide && !isSlip, showBoxes: showBoxes && !isSlip, slip: isSlip, runCode, runDocNo }));
  };

  // ตัวอย่างตำแหน่งป้ายบนกระดาษ (หนึ่งหน้า)
  const previewCells = [];
  if (grid.perPage > 0 && grid.perPage <= 300) {
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        previewCells.push(
          <div
            key={`${r}-${c}`}
            className={`absolute ${showFaces ? '' : 'bg-sky-50 border border-sky-300'}`}
            style={{
              left: `${((m + c * (lw + g)) / pw) * 100}%`,
              top: `${((m + r * (lh + g)) / ph) * 100}%`,
              width: `${(lw / pw) * 100}%`,
              height: `${(lh / ph) * 100}%`,
              containerType: 'inline-size',
            }}
          >
            {showFaces && sampleQr && <LabelFace item={sample} qr={sampleQr} bc={sampleBc} w={lw} h={lh} runCode={runCode} runDocNo={runDocNo} />}
          </div>
        );
      }
    }
  }

  const inp = 'px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 w-full';
  const lbl = 'text-xs font-bold text-slate-500 block mb-1';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="พิมพ์ป้ายรายการ"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-800 text-lg">พิมพ์ป้ายหลายรายการ</h3>
            <p className="text-xs text-slate-400">เลือกกระดาษและขนาดป้าย ระบบจะคำนวณว่าใส่ได้กี่แถวกี่คอลัมน์</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div>
              <label className={lbl} htmlFor="stk-paper">ขนาดกระดาษ</label>
              <select id="stk-paper" value={paper} onChange={(e) => setPaper(e.target.value)} className={inp}>
                {STICKER_PAPERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>

            {paper === 'Custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl} htmlFor="stk-cw">กว้าง (มม.)</label>
                  <input id="stk-cw" type="number" min="10" value={custom.w} onChange={(e) => setCustom({ ...custom, w: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className={lbl} htmlFor="stk-ch">สูง (มม.)</label>
                  <input id="stk-ch" type="number" min="10" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} className={inp} />
                </div>
              </div>
            )}

            {!isSlip && (<>
            <div>
              <span className={lbl}>แนวกระดาษ</span>
              <div className="grid grid-cols-2 gap-2">
                {[['portrait', 'แนวตั้ง'], ['landscape', 'แนวนอน']].map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOrient(k)}
                    aria-pressed={orient === k}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${orient === k ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} className="rounded border-slate-300" />
              กำหนดแถวและคอลัมน์เอง (ขนาดป้ายปรับอัตโนมัติ)
            </label>
            {fit && (
              <div className="grid grid-cols-2 gap-2">
                <CountStepper label="คอลัมน์" value={fitCols} onChange={setFitCols} />
                <CountStepper label="แถว" value={fitRows} onChange={setFitRows} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl} htmlFor="stk-lw">ป้ายกว้าง (มม.)</label>
                <input id="stk-lw" type="number" min="5" value={fit ? fitW : label.w} disabled={fit} onChange={(e) => setLabel({ ...label, w: e.target.value })} className={`${inp} disabled:bg-slate-100 disabled:text-slate-500`} />
              </div>
              <div>
                <label className={lbl} htmlFor="stk-lh">ป้ายสูง (มม.)</label>
                <input id="stk-lh" type="number" min="5" value={fit ? fitH : label.h} disabled={fit} onChange={(e) => setLabel({ ...label, h: e.target.value })} className={`${inp} disabled:bg-slate-100 disabled:text-slate-500`} />
              </div>
              <div>
                <label className={lbl} htmlFor="stk-gap">ช่องว่างระหว่างป้าย (มม.)</label>
                <input id="stk-gap" type="number" min="0" value={gap} onChange={(e) => setGap(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl} htmlFor="stk-margin">ขอบกระดาษ (มม.)</label>
                <input id="stk-margin" type="number" min="0" value={margin} onChange={(e) => setMargin(e.target.value)} className={inp} />
              </div>
            </div>
            </>)}
            {isSlip && (
              <p className="text-sm text-slate-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
                โหมดสลิป: ขนาดป้าย 76.2 × 50.8 มม. (3 × 2 นิ้ว) พิมพ์ 1 ป้ายต่อ 1 ใบ ไม่มีขอบและเส้นตัด
                ตั้งค่าเครื่องพิมพ์ให้ใช้กระดาษขนาดนี้ และปิด Scale / Fit to page (ใช้ 100%)
              </p>
            )}

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} className="rounded border-slate-300" />
              พิมพ์เส้นประตัดป้าย (ตรงกลางช่องว่าง)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} className="rounded border-slate-300" />
              พิมพ์กรอบสี่เหลี่ยมรอบป้ายแต่ละใบ
            </label>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
              {grid.perPage > 0 ? (
                <>
                  <div className="font-bold text-slate-800">
                    {grid.cols} คอลัมน์ × {grid.rows} แถว = {grid.perPage} ป้ายต่อหน้า
                  </div>
                  <div className="text-slate-500">
                    เลือกไว้ {chosen.length} รายการ → {pages} หน้า
                  </div>
                </>
              ) : (
                <div className="text-rose-600 font-bold">ขนาดป้ายหรือขอบใหญ่เกินกระดาษ ปรับค่าก่อนพิมพ์</div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <span className={lbl}>ตัวอย่างหนึ่งหน้า ({pw} × {ph} มม.)</span>
            <div className="flex justify-center">
              <div
                className="relative bg-white border border-slate-300 shadow-sm"
                style={{ width: `min(100%, calc(40vh * ${pw} / ${ph}))`, aspectRatio: `${pw} / ${ph}` }}
              >
                {previewCells}
                {grid.perPage > 300 && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">ป้ายจำนวนมากเกินจะแสดงตัวอย่าง</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">เลือกรายการที่จะพิมพ์</span>
            <button type="button" onClick={toggleAll} className="text-xs font-bold text-rose-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded">
              {allOn ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {items.map((i) => (
              <label key={i.itemId} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(i.itemId)} onChange={() => toggle(i.itemId)} className="rounded border-slate-300" />
                <span className="font-bold text-slate-800 whitespace-nowrap">{i.assetNo}</span>
                <span className="text-slate-500 truncate">{i.assetName || '-'}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 max-w-md">
            ในหน้าต่างพิมพ์ ตั้ง Margins = None, Scale = 100% และปิด Headers and footers เพื่อให้ขนาดตรงกับที่ตั้งไว้
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">ปิด</button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!canPrint}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <Printer size={15} /> พิมพ์ป้าย
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── รายละเอียดรายการ + ดูรูปขนาดใหญ่ ──────────────────────────────────────────
// รายละเอียดรายการ: เลื่อนดูทีละรายการได้ (ปุ่มหรือลูกศรซ้าย-ขวา), คัดลอก/พิมพ์ป้าย, ประวัติของรายการ,
// ขยายรูป, Esc ปิด, โฟกัสอยู่ในกล่องตลอด (กด Tab วนในกล่อง)
const DetailModal = ({ item, list = [], canEdit, onClose, onAttach, onNavigate, runCode, runDocNo }) => {
  const dialogRef = useRef(null);
  const [zoom, setZoom] = useState('');
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);
  // รูปเดิมของครุภัณฑ์จากระบบ Fixed Asset (ดึงผ่าน lookup API ตามรหัส ASSET NO)
  const [legacy, setLegacy] = useState({ loading: true, urls: [] });

  useEffect(() => {
    let alive = true;
    setLegacy({ loading: true, urls: [] });
    apiRequest(`/disposal/lookup/${encodeURIComponent(item.assetNo)}`)
      .then((d) => { if (alive) setLegacy({ loading: false, urls: d.item?.legacyPicUrls || [] }); })
      .catch(() => { if (alive) setLegacy({ loading: false, urls: [] }); });
    return () => { alive = false; };
  }, [item.assetNo]);
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

  // พิมพ์ป้ายรายการเดียว — ใช้แบบเดียวกับการพิมพ์ป้ายหลายรายการ (ขนาด 70 x 40 มม. มี QR + Barcode)
  const printSticker = async () => {
    printHtmlInFrame(await buildStickerHtml({ sheets: [[item]], pw: 70, ph: 40, cols: 1, rows: 1, lw: 70, lh: 40, gap: 0, margin: 0, showGuide: false, showBoxes: false, runCode, runDocNo }));
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
      <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
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

          {/* รูปเดิมจากระบบ Fixed Asset — รูปเล็กด้านบน แยกจากรูปหน้างานที่อัปโหลดในรอบนี้ */}
          <section className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-slate-500">รูปเดิมจากระบบ Fixed Asset</span>
              {!legacy.loading && legacy.urls.length > 0 && <span className="text-[11px] text-slate-400">({legacy.urls.length} รูป)</span>}
            </div>
            {legacy.loading ? (
              <div className="text-xs text-slate-400">กำลังโหลด...</div>
            ) : legacy.urls.length === 0 ? (
              <div className="text-xs text-slate-400">ไม่มีรูปเดิมในระบบ Fixed Asset</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {legacy.urls.map((u, i) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setZoom(u)}
                    title={`รูปเดิม ${i + 1} — กดเพื่อขยาย`}
                    aria-label={`ขยายรูปเดิม ${i + 1} ของ ${item.assetNo}`}
                    className="block w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  >
                    <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="text-xs font-bold text-slate-500">รูปหน้างานจริง (ที่บันทึกในรอบนี้)</div>
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
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4">
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
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
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
const REPORT_PAGE_SIZE = 10;

// ตารางสรุปในหน้ารายงาน — แบ่งหน้าละ REPORT_PAGE_SIZE แถว
const ReportTable = ({ title, rows, labelHead, totalCost }) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / REPORT_PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const shown = rows.slice((cur - 1) * REPORT_PAGE_SIZE, cur * REPORT_PAGE_SIZE);
  return (
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
            {shown.map((r) => {
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
      {rows.length > REPORT_PAGE_SIZE && (
        <Pagination currentPage={cur} totalPages={totalPages} onPageChange={setPage} itemsPerPage={REPORT_PAGE_SIZE} totalItems={rows.length} />
      )}
    </section>
  );
};

const DOC_ORDER = ['DOC_ACCOUNTING', 'DOC_APPROVED', 'DOC_SENT_ACCOUNTING', 'DISPOSED_PHOTO', 'ACCOUNTING_DONE', 'APPROVAL', 'OTHER'];
const isImageFile = (name) => /\.(jpe?g|png)$/i.test(name || '');

// รูปแนบโหลดด้วย token จึงดึงเป็น blob แล้วแสดง (ปล่อย URL เมื่อออกจากหน้า)
const AttachmentThumb = ({ attachment }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    let url = null;
    fetch(`${API_BASE}/disposal/attachments/${attachment.attachmentId}/file`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b && alive) { url = URL.createObjectURL(b); setSrc(url); } })
      .catch(() => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [attachment.attachmentId]);
  return src
    ? <img src={src} alt={attachment.fileName} className="h-40 w-full object-cover rounded-lg bg-slate-50" />
    : <div className="h-40 flex items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">กำลังโหลดรูป...</div>;
};

const ReportView = ({ report, events = [], attachments = [], onOpenDoc, onAttachPhoto, canEdit }) => {
  const [missPage, setMissPage] = useState(1);
  const [evPage, setEvPage] = useState(1);
  if (!report) {
    return <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400"><Loader2 size={22} className="mx-auto animate-spin" /></div>;
  }
  const { summary, byCostCenter, byRecorder, byDay = [], missingPhotoItems } = report;
  const totalCost = summary.totalCost || 0;
  const missTotalPages = Math.max(1, Math.ceil(missingPhotoItems.length / REPORT_PAGE_SIZE));
  const missCur = Math.min(missPage, missTotalPages);
  const missShown = missingPhotoItems.slice((missCur - 1) * REPORT_PAGE_SIZE, missCur * REPORT_PAGE_SIZE);
  const evTotalPages = Math.max(1, Math.ceil(events.length / REPORT_PAGE_SIZE));
  const evCur = Math.min(evPage, evTotalPages);
  const evShown = events.slice((evCur - 1) * REPORT_PAGE_SIZE, evCur * REPORT_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MiniStat icon={ClipboardList} title="รายการทั้งหมด" value={summary.itemCount} color="from-rose-500 to-rose-600" />
        <MiniStat icon={CheckCircle2} title="มีรูปครบ 2 รูป" value={summary.withPhotos} subValue={`${summary.itemCount ? Math.round((summary.withPhotos / summary.itemCount) * 100) : 0}% ของรายการ`} color="from-emerald-400 to-emerald-600" />
        <MiniStat icon={ImageIcon} title="ยังไม่ครบรูป" value={summary.missingPhotos} subValue="แนบทีหลังได้" color="from-amber-400 to-amber-500" isAlert={summary.missingPhotos > 0} />
        <MiniStat icon={Coins} title="รวม COST" value={fmtMoney(summary.totalCost)} color="from-slate-500 to-slate-700" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ReportTable title="สรุปตาม COSTCENTER" rows={byCostCenter} labelHead="COSTCENTER" totalCost={totalCost} />
        <ReportTable title="สรุปตามผู้บันทึก" rows={byRecorder} labelHead="ผู้บันทึก" totalCost={totalCost} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 text-sm flex flex-wrap gap-x-8 gap-y-1 text-slate-600">
        <span>ASSET DATE: <b className="text-slate-800">{fmtDate(summary.firstAssetDate)} – {fmtDate(summary.lastAssetDate)}</b></span>
        <span>บันทึกแล้ว <b className="text-slate-800">{byDay.length}</b> วัน</span>
        <span>COST เฉลี่ยต่อรายการ <b className="text-slate-800">{fmtMoney(summary.itemCount ? summary.totalCost / summary.itemCount : 0)}</b></span>
      </div>

      <ReportTable title="สรุปตามวันที่บันทึก" rows={byDay} labelHead="วันที่บันทึก" totalCost={totalCost} />

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800">รายการที่ยังไม่มีรูปครบ ({missingPhotoItems.length})</div>
        {missingPhotoItems.length === 0 ? (
          <div className="px-5 py-6 text-center text-slate-400 text-sm">ทุกรายการมีรูปครบแล้ว</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {missShown.map((m) => (
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
        {missingPhotoItems.length > REPORT_PAGE_SIZE && (
          <Pagination currentPage={missCur} totalPages={missTotalPages} onPageChange={setMissPage} itemsPerPage={REPORT_PAGE_SIZE} totalItems={missingPhotoItems.length} />
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800">เอกสารแนบ ({attachments.length})</div>
        {attachments.length === 0 ? (
          <div className="px-5 py-6 text-center text-slate-400 text-sm">ยังไม่มีเอกสารแนบในรอบนี้</div>
        ) : (
          <div className="p-5 space-y-5">
            {DOC_ORDER.map((t) => {
              const list = attachments.filter((a) => a.docType === t);
              if (!list.length) return null;
              return (
                <div key={t}>
                  <div className="text-xs font-bold text-slate-500 mb-2">{DOC_TYPE_LABEL[t]} · {list.length} ไฟล์</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {list.map((a) => (isImageFile(a.fileName) ? (
                      <figure key={a.attachmentId} className="rounded-xl border border-slate-200 p-2 m-0">
                        <AttachmentThumb attachment={a} />
                        <figcaption className="mt-1.5 text-[11px] text-slate-500 break-words">
                          {a.fileName}<br />{a.uploadedByName || '-'} · {fmtDateTime(a.uploadedAt)}
                        </figcaption>
                      </figure>
                    ) : (
                      <button key={a.attachmentId} type="button" onClick={() => onOpenDoc && onOpenDoc(a)}
                        className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-left hover:bg-slate-50">
                        <FileText size={20} className="shrink-0 text-rose-500" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-700 break-words">{a.fileName}</span>
                          <span className="block text-[11px] text-slate-400">{(a.fileSize / 1024).toFixed(0)} KB · {a.uploadedByName || '-'} · {fmtDateTime(a.uploadedAt)} · กดเพื่อเปิด</span>
                        </span>
                      </button>
                    )))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800">ประวัติการดำเนินการ ({events.length})</div>
        {events.length === 0 ? (
          <div className="px-5 py-6 text-center text-slate-400 text-sm">ยังไม่มีประวัติ</div>
        ) : (
          <ol className="relative px-5 py-4 space-y-3 border-l-2 border-slate-100 ml-7">
            {evShown.map((ev) => (
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
        {events.length > REPORT_PAGE_SIZE && (
          <Pagination currentPage={evCur} totalPages={evTotalPages} onPageChange={setEvPage} itemsPerPage={REPORT_PAGE_SIZE} totalItems={events.length} />
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
  const camRef = useRef(null);

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
      <div className="flex flex-wrap gap-2 mb-1.5">
        {/* เปิดกล้องโดยตรงบนมือถือ/iPad (จอคอมจะเปิดหน้าต่างเลือกไฟล์แทน) */}
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          ถ่ายรูป
        </button>
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`เลือกรูปไฟล์ ${label}`}
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
// คำนวณตัวเลขวิเคราะห์มูลค่า ใช้ร่วมกันทั้งหน้ารายงานและไฟล์ PDF (ให้ตัวเลขตรงกัน)
const computePriceStats = (items) => {
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
  return { num, total, accum, bk, nbv, nbvOf, mismatch, top, topShare, bands, maxBand, avgAge, pct };
};

const PriceReport = ({ items }) => {
  if (!items.length) return null;
  const { num, total, accum, bk, nbv, nbvOf, mismatch, top, topShare, bands, maxBand, avgAge, pct } = computePriceStats(items);

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
