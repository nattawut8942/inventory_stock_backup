import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, ArrowLeftRight, Search, Laptop, X, Loader2, AlertTriangle, PackageOpen, Minus, CheckCircle2, Info, Edit2, CalendarPlus, Clock } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth, getAuthToken } from '../context/AuthContext';
import { useCan, useCanAct } from '../context/PermissionContext';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config/api';

// ✅ JWT จาก AuthContext — backend ของ Borrowing ใช้ verifyToken ทุก endpoint จึงต้องแนบทุกครั้ง
const authHeaders = (extra = {}) => {
  const headers = { ...extra };
  const t = getAuthToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
};

// ✅ รูปแบบรหัสครุภัณฑ์บังคับ: (CO|OF) + ตัวเลขล้วน เช่น CO24-017-02 — เอามาจาก InventoryPage.jsx เพื่อให้ format ตรงกัน
const FIXED_ASSET_CODE_REGEX = /^(CO|OF)\d{2}-\d{3}-\d{2}$/;
const isValidFixedAssetCode = (code) => FIXED_ASSET_CODE_REGEX.test((code || '').trim());

const extractPrefixAndDigits = (str) => {
  let v = (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let prefix = '';
  if (v.startsWith('CO')) { prefix = 'CO'; v = v.slice(2); }
  else if (v.startsWith('OF')) { prefix = 'OF'; v = v.slice(2); }
  else if (v[0] === 'C') { prefix = 'CO'; v = v.slice(1); }
  else if (v[0] === 'O') { prefix = 'OF'; v = v.slice(1); }
  const digits = v.replace(/\D/g, '').slice(0, 7);
  return { prefix, digits };
};

const buildFixedAssetCode = (prefix, digits) => {
  if (!prefix) return '';
  let out = prefix;
  if (digits.length > 0) out += digits.slice(0, 2);
  if (digits.length > 2) out += '-' + digits.slice(2, 5);
  if (digits.length > 5) out += '-' + digits.slice(5, 7);
  return out;
};

const nextFixedAssetCode = (newRaw, prevFormatted) => {
  const isShrinking = newRaw.length < (prevFormatted || '').length;
  const { digits: probeDigits } = extractPrefixAndDigits(newRaw);

  if (isShrinking && probeDigits.length === 0) {
    return newRaw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  }

  const { prefix: newPrefix, digits: newDigits } = extractPrefixAndDigits(newRaw);
  const { digits: prevDigits } = extractPrefixAndDigits(prevFormatted);

  if (isShrinking && newDigits.length === prevDigits.length && newDigits.length > 0) {
    return buildFixedAssetCode(newPrefix, newDigits.slice(0, -1));
  }
  return buildFixedAssetCode(newPrefix, newDigits);
};

const emptyForm = {
  brname: '',
  Category: '',
  brfixasset: '',
  brserial: '',
  brqty: 1,
  brEmpCode: '',
  brEmpname: '',
  brEmpDept: '',
  brReason: '',
  StartDate: new Date().toISOString().slice(0, 10),
  EndDate: '',
};

// ── วันที่ (ใช้เวลาท้องถิ่น, ตัดเวลาออกเทียบเฉพาะวัน) ──────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 7; // ถือว่า "ใกล้ครบกำหนด" เมื่อเหลือไม่เกินกี่วัน
const toDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
// จำนวนวันจากวันนี้ถึงวันกำหนดคืน (ค่าลบ = เลยกำหนดแล้ว)
const daysUntil = (dateValue) => Math.round((toDay(dateValue) - toDay(new Date())) / DAY_MS);
// แปลง Date เป็น 'YYYY-MM-DD' ตามเวลาท้องถิ่น (ไม่ใช้ toISOString เพราะจะเลื่อนวันตาม UTC)
const toInputDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
// วันที่จาก API (ISO) → 'YYYY-MM-DD' ตามวันท้องถิ่น — ห้ามใช้ slice(0,10) เพราะ ISO เป็น UTC
// ทำให้วันเลื่อนไป 1 วันเมื่อเวลาไทยเที่ยงคืนถูกเก็บเป็น UTC วันก่อนหน้า
const dateOnly = (v) => (v ? toInputDate(new Date(v)) : '');
// บวกจำนวนวันให้สตริง 'YYYY-MM-DD'
const addDaysToInput = (isoDate, n) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return toInputDate(new Date(y, m - 1, d + n));
};
const isReturned = (b) => b.brStatus === 'returned';
// เกินกำหนดเมื่อวันกำหนดคืนอยู่ก่อนวันนี้ (เทียบที่เที่ยงคืน จึงไม่ขึ้นเกินกำหนดตั้งแต่เช้าของวันครบกำหนด)
const isOverdue = (b) => !isReturned(b) && !!b.EndDate && daysUntil(b.EndDate) < 0;
const isDueSoon = (b) => {
  if (isReturned(b) || !b.EndDate) return false;
  const n = daysUntil(b.EndDate);
  return n >= 0 && n <= DUE_SOON_DAYS;
};

// ─── StatCard — สไตล์เดียวกับหน้าอื่น (InventoryPage / SoundLayout) ────────
// เลขลำดับขั้นตอนกำกับหน้าแต่ละ label ในฟอร์มบันทึกการยืม เพื่อบอกลำดับการกรอก
const StepBadge = ({ n }) => (
  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold mr-1.5 shrink-0">
    {n}
  </span>
);

const StatCard = ({ icon: Icon, title, value, color, alert = false }) => (
  <div className="relative bg-white rounded-2xl p-5 shadow-lg border border-slate-200 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-xl">
    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${color}`} />
    {alert && (
      <span className="absolute top-3.5 right-3.5 flex h-2.5 w-2.5" title="มีรายการเกินกำหนด">
        <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
      </span>
    )}
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1">{title}</p>
        <h3 className="text-2xl font-black text-slate-900">{value}</h3>
      </div>
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  </div>
);

const ITBorrowSystem = () => {
  const { deviceTypes = [], products = [], refreshData } = useData();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // token หมดอายุ (อายุ 1 ชม.) หรือใช้ไม่ได้ → ออกจากระบบแล้วพาไปหน้า login แทนการแสดง error ทั่วไป
  const handleUnauthorized = (res) => {
    if (res.status !== 401) return false;
    logout?.();
    navigate('/login', { replace: true });
    return true;
  };
  const isAdmin = useCan('borrowings', 'edit'); // ✅ [validation #7] จำกัดสิทธิ์แก้ไข/เปลี่ยนสถานะเฉพาะ staff เหมือน InventoryPage
  const canCreateBorrow = useCanAct('borrowings', 'create');
  const canReturnBorrow = useCanAct('borrowings', 'return');

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'borrowed' | 'due-soon' | 'overdue' | 'returned' — เลือกจาก segmented control
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [manualDeviceName, setManualDeviceName] = useState(false); // true = พิมพ์ชื่ออุปกรณ์เอง แทนเลือกจากรายการ Stock_Products
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [returningId, setReturningId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [confirmReturnItem, setConfirmReturnItem] = useState(null);

  const [editItem, setEditItem] = useState(null); // borrowing record being edited (null = closed)
  const [editForm, setEditForm] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const [toast, setToast] = useState(null); // { message, tone: 'success' | 'error' }
  const toastTimer = useRef(null);

  // employee code lookup (mirrors InventoryPage: GET /employees/:code against HRM)
  const [empCode, setEmpCode] = useState('');
  const [empData, setEmpData] = useState(null);
  const [empError, setEmpError] = useState('');
  const [empLoading, setEmpLoading] = useState(false);

  const lookupEmployee = async () => {
    const trimmed = empCode.trim();
    if (!trimmed) return;
    setEmpLoading(true);
    setEmpError('');
    try {
      const res = await fetch(`${API_BASE}/employees/${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        setEmpData(data);
        setForm((f) => ({
          ...f,
          brEmpCode: data.EmployeeCode,
          brEmpname: data.FormattedName || `${data.FirstName || ''} ${data.LastName || ''}`.trim(),
          brEmpDept: data.CostCenter || '',
        }));
      } else {
        const data = await res.json().catch(() => ({}));
        setEmpData(null);
        setEmpError(data.error || 'ไม่พบรหัสพนักงาน');
      }
    } catch (err) {
      setEmpData(null);
      setEmpError('ไม่สามารถเชื่อมต่อระบบ HR ได้');
    }
    setEmpLoading(false);
  };

  const resetEmpLookup = () => {
    setEmpCode('');
    setEmpData(null);
    setEmpError('');
    setForm((f) => ({ ...f, brEmpCode: '', brEmpname: '', brEmpDept: '' }));
  };

  // fixed-asset lookup by asset code (proxied server-side to DCI's FXALOCATE_API,
  // since that's an internal Daikin intranet endpoint the browser likely can't reach directly)
  const [assetInfo, setAssetInfo] = useState(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState('');

  // เช็ค S/N จาก PC Inventory ก่อน ถ้าไม่เจอค่อย fallback ไป Monitor Inventory — ไม่เจอทั้งคู่ก็เว้นว่างไว้เฉยๆ
  const lookupSerialFromInventories = async (code) => {
    try {
      const pcRes = await fetch(`${API_BASE}/pc-inventory/by-fix-asset/${encodeURIComponent(code)}`);
      if (pcRes.ok) {
        const pcData = await pcRes.json();
        if (pcData?.success && pcData.data?.serial_number) return pcData.data.serial_number;
      }
    } catch (err) {
      // เงียบไว้ — ไปลอง Monitor Inventory ต่อ
    }

    try {
      const moRes = await fetch(`${API_BASE}/mo-inventory/by-fix-asset/${encodeURIComponent(code)}`);
      if (moRes.ok) {
        const moData = await moRes.json();
        if (moData?.success && moData.data?.serial_number) return moData.data.serial_number;
      }
    } catch (err) {
      // ไม่เจอทั้งสองที่ — ปล่อยว่างไว้
    }

    return null;
  };

  const lookupAsset = async () => {
    const code = form.brfixasset.trim();
    if (!code) return;
    setAssetLoading(true);
    setAssetError('');
    try {
      const [assetRes, serialNumber] = await Promise.all([
        fetch(`${API_BASE}/borrowings/assets/${encodeURIComponent(code)}`, { headers: authHeaders() }),
        lookupSerialFromInventories(code),
      ]);

      if (assetRes.ok) {
        const data = await assetRes.json();
        setAssetInfo(data);
        // ชื่ออุปกรณ์จากการค้นหา Fix Asset ให้เติมตรงๆ เป็น free text เลย (สลับไปโหมดพิมพ์เอง)
        // แทนที่จะพยายามจับคู่กับ dropdown จาก Stock_Products ซึ่งส่วนใหญ่ชื่อจะไม่ตรงกันเป๊ะ
        if (data.AssetName) {
          setManualDeviceName(true);
          setForm((f) => ({ ...f, brname: data.AssetName }));
        }
      } else {
        const data = await assetRes.json().catch(() => ({}));
        setAssetInfo(null);
        setAssetError(data.error || 'ไม่พบรหัสครุภัณฑ์นี้ในระบบ Fixed Asset');
      }

      // เจอจาก PC Inventory หรือ Monitor Inventory (อย่างใดอย่างหนึ่ง) → auto-fill S/N
      // ไม่ทับถ้าผู้ใช้พิมพ์เองไว้ก่อนแล้ว, ถ้าไม่เจอทั้งคู่ก็เว้นว่างไว้ตามเดิม
      if (serialNumber) {
        setForm((f) => ({ ...f, brserial: f.brserial || serialNumber }));
      }
    } catch (err) {
      setAssetInfo(null);
      setAssetError('ไม่สามารถเชื่อมต่อระบบ Fixed Asset ได้');
    }
    setAssetLoading(false);

  };

  const resetAssetLookup = () => {
    setAssetInfo(null);
    setAssetError('');
    setForm((f) => ({ ...f, brfixasset: '' }));
  };

  const showToast = (message, tone = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const fetchBorrowings = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/borrowings`, { headers: authHeaders() });
      if (handleUnauthorized(res)) return;
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('ไม่สามารถโหลดรายการยืม-คืนได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBorrowings();
  }, []);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((b) => {
      const matchesSearch =
        !q ||
        [b.brname, b.brEmpname, b.brEmpDept, b.brserial, b.brfixasset]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'returned' && isReturned(b)) ||
        (statusFilter === 'borrowed' && !isReturned(b)) ||
        (statusFilter === 'overdue' && isOverdue(b)) ||
        (statusFilter === 'due-soon' && isDueSoon(b));
      return matchesSearch && matchesStatus;
    });
  }, [list, search, statusFilter]);

  // ── Pagination: ล็อกไว้ที่ 20 รายการต่อหน้า ──────────────────────
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedList = useMemo(
    () => filteredList.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filteredList, pageSafe]
  );
  // รีเซ็ตกลับหน้า 1 ทุกครั้งที่ค้นหา/filter เปลี่ยน เพื่อไม่ให้ค้างอยู่หน้าที่ไม่มีข้อมูลแล้ว
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  // จำนวนวันที่ยืม: วันที่เริ่มยืม → วันที่รับคืนจริง (ถ้าคืนแล้ว) หรือ → วันนี้ (ถ้ายังไม่คืน)
  const borrowDurationDays = (b) => {
    if (!b.StartDate) return null;
    const start = new Date(b.StartDate);
    const end = b.brStatus === 'returned' && b.ActualReturnDate ? new Date(b.ActualReturnDate) : new Date();
    const diffDays = Math.floor((end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
  };
  // จำนวนวันทั้งหมดของการยืม (วันที่ยืม → กำหนดคืน) ใช้วาดแถบความคืบหน้า
  const borrowTotalDays = (b) => {
    if (!b.StartDate || !b.EndDate) return 1;
    return Math.max(1, Math.round((toDay(b.EndDate) - toDay(b.StartDate)) / DAY_MS));
  };
  const isAssetCategory = form.Category === 'Asset'; // ✅ บังคับ S/N + Fix Asset เฉพาะประเภทครุภัณฑ์ (Asset) เท่านั้น
  const matchingProducts = form.Category ? products.filter((p) => p.DeviceType === form.Category) : [];
  // รายการที่ยังขาดก่อนกดบันทึกได้ — แสดงข้างปุ่ม เพราะปุ่มถูก disable และผู้ใช้ต้องรู้ว่าต้องกรอกอะไร
  const missingFields = [
    !form.brname && 'ชื่ออุปกรณ์',
    isAssetCategory && !form.brfixasset && 'Fix Asset No.',
    isAssetCategory && !form.brserial && 'S/N',
    !empData && 'ค้นหารหัสพนักงานผู้ยืม',
    !form.brReason.trim() && 'เหตุผลการยืม',
    !form.StartDate && 'วันที่ยืม',
    !form.EndDate && 'กำหนดคืน',
  ].filter(Boolean);

  const stats = useMemo(() => {
    const total = list.length;
    const borrowed = list.filter((b) => !isReturned(b)).length;
    const returned = list.filter(isReturned).length;
    const overdue = list.filter(isOverdue).length;
    const dueSoon = list.filter(isDueSoon).length;
    return { total, borrowed, returned, overdue, dueSoon };
  }, [list]);

  const handleOpenModal = () => {
    setForm(emptyForm);
    setFormError('');
    resetEmpLookup();
    resetAssetLookup();
    setManualDeviceName(false);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.brname || !form.StartDate || !form.EndDate) {
      setFormError('กรุณากรอกชื่ออุปกรณ์และวันที่ให้ครบถ้วน');
      return;
    }
    if (!empData) {
      setFormError('กรุณากรอกและค้นหารหัสพนักงานผู้ยืมก่อน');
      return;
    }
    if (isAssetCategory && !form.brserial) {
      setFormError('อุปกรณ์ประเภทครุภัณฑ์ (Asset) ต้องระบุหมายเลข Serial (S/N)');
      return;
    }
    if (isAssetCategory && !form.brfixasset) {
      setFormError('อุปกรณ์ประเภทครุภัณฑ์ (Asset) ต้องระบุรหัสครุภัณฑ์ (Fix Asset No.)');
      return;
    }
    if (!form.brReason.trim()) {
      setFormError('กรุณาระบุเหตุผลการยืม');
      return;
    }
    if (new Date(form.EndDate) < new Date(form.StartDate)) {
      setFormError('กำหนดคืนต้องไม่มาก่อนวันที่ยืม');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/borrowings`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          brname: form.brname,
          Category: form.Category,
          brfixasset: form.brfixasset || null,
          brserial: form.brserial || null,
          brqty: isAssetCategory ? 1 : (Number(form.brqty) || 1),
          brEmpCode: form.brEmpCode,
          brEmpname: form.brEmpname,
          brEmpDept: form.brEmpDept,
          brReason: form.brReason,
          StartDate: form.StartDate,
          EndDate: form.EndDate,
          recorded_by: (user?.username || '').toUpperCase(),
        }),
      });
      if (handleUnauthorized(res)) return;
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

      setShowModal(false);
      setForm(emptyForm);
      resetEmpLookup();
      resetAssetLookup();
      showToast('บันทึกสำเร็จ');
      if (data.warning) {
        setTimeout(() => showToast(data.warning, 'error'), 3200);
      }
      await fetchBorrowings();
      refreshData?.();
    } catch (err) {
      setFormError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async (id) => {
    setReturningId(id);
    const now = new Date().toISOString();
    try {
      const res = await fetch(`${API_BASE}/borrowings/${id}/return`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ received_by: (user?.username || '').toUpperCase() }), 
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) throw new Error('รับคืนไม่สำเร็จ');
      // ✅ อัปเดตสถานะในแถวเดิมแทนการลบทิ้ง เพื่อให้ยังเห็นข้อมูลรายการนี้เหมือนเดิม (แค่สถานะเปลี่ยนเป็นคืนแล้ว)
      setList((prev) =>
        prev.map((l) =>
          l.brID === id
            ? { ...l, brStatus: 'returned', received_by: (user?.username || '').toUpperCase(), ActualReturnDate: now } 
            : l
        )
      );
      showToast('รับคืนอุปกรณ์สำเร็จ');
      refreshData?.();
    } catch (err) {
      setError('รับคืนอุปกรณ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setReturningId(null);
    }
  };

  // เปิด modal ยืนยันก่อนรับคืนจริง — กัน handleReturn ถูกยิงตรงจากการกดพลาด
  const requestReturn = (b) => setConfirmReturnItem(b);
  const confirmReturn = async () => {
    if (!confirmReturnItem) return;
    const id = confirmReturnItem.brID;
    setConfirmReturnItem(null);
    await handleReturn(id);
  };

  // ── ยืดเวลาคืน (Staff) — ส่ง PUT ชุดเดิมพร้อมวันกำหนดคืนใหม่ ─────
  const [extendItem, setExtendItem] = useState(null);
  const [extendDate, setExtendDate] = useState('');
  const [extendBase, setExtendBase] = useState('');
  const [extendSubmitting, setExtendSubmitting] = useState(false);
  const [extendError, setExtendError] = useState('');

  const openExtend = (b) => {
    if (!isAdmin) return;
    // ฐานการนับ: กำหนดคืนเดิม (ถ้ายังไม่เกิน) หรือวันนี้ (ถ้าเลยกำหนดแล้ว)
    const base = !b.EndDate || isOverdue(b) ? toInputDate(new Date()) : dateOnly(b.EndDate);
    setExtendBase(base);
    setExtendDate(base);
    setExtendError('');
    setExtendItem(b);
  };

  const closeExtend = () => {
    if (extendSubmitting) return;
    setExtendItem(null);
    setExtendError('');
  };

  const handleExtend = async () => {
    if (!extendItem || !extendDate) return;
    const currentEnd = dateOnly(extendItem.EndDate);
    if (currentEnd && extendDate <= currentEnd) {
      setExtendError('วันกำหนดคืนใหม่ต้องอยู่หลังกำหนดคืนเดิม');
      return;
    }
    const startStr = dateOnly(extendItem.StartDate) || extendDate;

    setExtendSubmitting(true);
    setExtendError('');
    try {
      const res = await fetch(`${API_BASE}/borrowings/${extendItem.brID}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          brname: extendItem.brname,
          Category: extendItem.Category || '',
          brfixasset: extendItem.brfixasset || '',
          brserial: extendItem.brserial || '',
          brqty: extendItem.brqty || 1,
          brEmpCode: extendItem.brEmpCode,
          brEmpname: extendItem.brEmpname,
          brEmpDept: extendItem.brEmpDept || '',
          brReason: extendItem.brReason || '',
          StartDate: startStr,
          EndDate: extendDate,
          brStatus: 'borrowed',
          received_by: null,
        }),
      });
      if (handleUnauthorized(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || data.message || 'ยืดเวลาไม่สำเร็จ');

      const newEnd = extendDate;
      setList((prev) => prev.map((l) => (l.brID === extendItem.brID ? { ...l, EndDate: newEnd } : l)));
      setExtendItem(null);
      showToast(`ยืดเวลาคืนถึง ${new Date(newEnd).toLocaleDateString('th-TH')} แล้ว`);
      refreshData?.();
    } catch (err) {
      setExtendError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setExtendSubmitting(false);
    }
  };

  // ── แก้ไขรายการ (เผื่อบันทึกผิด) ──────────────────────────────
  const openEditModal = (b) => {
    // กันเบื้องต้นฝั่ง frontend — ตัวป้องกันจริงอยู่ที่ backend (PUT /borrowings/:id ใช้ requireRole('Admin'))
    if (!isAdmin) return;
    setEditForm({
      brname: b.brname || '',
      Category: b.Category || '',
      brfixasset: b.brfixasset || '',
      brserial: b.brserial || '',
      brqty: b.brqty || 1,
      brEmpCode: b.brEmpCode || '',
      brEmpname: b.brEmpname || '',
      brEmpDept: b.brEmpDept || '',
      brReason: b.brReason || '',
      StartDate: dateOnly(b.StartDate),
      EndDate: dateOnly(b.EndDate),
      brStatus: b.brStatus || 'borrowed',
      received_by: b.received_by || '',
    });
    setEditError('');
    setEditItem(b);
  };

  const closeEditModal = () => {
    setEditItem(null);
    setEditForm(null);
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError('');

    if (!editForm.brname || !editForm.brEmpname || !editForm.brEmpCode || !editForm.StartDate || !editForm.EndDate) {
      setEditError('กรุณากรอกอุปกรณ์ ผู้ยืม รหัสพนักงาน และวันที่ให้ครบถ้วน');
      return;
    }
    if (editForm.Category === 'Asset' && !editForm.brserial) {
      setEditError('อุปกรณ์ประเภทครุภัณฑ์ (Asset) ต้องระบุหมายเลข Serial (S/N)');
      return;
    }
    if (editForm.Category === 'Asset' && !editForm.brfixasset) {
      setEditError('อุปกรณ์ประเภทครุภัณฑ์ (Asset) ต้องระบุรหัสครุภัณฑ์ (Fix Asset No.)');
      return;
    }
    if (!editForm.brReason.trim()) {
      setEditError('กรุณาระบุเหตุผลการยืม');
      return;
    }
    if (new Date(editForm.EndDate) < new Date(editForm.StartDate)) {
      setEditError('กำหนดคืนต้องไม่มาก่อนวันที่ยืม');
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/borrowings/${editItem.brID}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...editForm,
          brqty: editForm.Category === 'Asset' ? 1 : (Number(editForm.brqty) || 1),
          received_by: editForm.brStatus === 'returned' ? (editForm.received_by || user?.username || '').toUpperCase() : null,
        }),
      });
      if (handleUnauthorized(res)) return;
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'แก้ไขไม่สำเร็จ');

      showToast('แก้ไขข้อมูลสำเร็จ');
      closeEditModal();
      await fetchBorrowings();
      refreshData?.();
    } catch (err) {
      setEditError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-200">
            <Laptop size={22} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800">BORROWING SYSTEM</h2>
            <p className="text-sm text-slate-400 font-medium">
              ทั้งหมด {stats.total} รายการ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
          <div className="relative flex-1 sm:flex-none min-w-0">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาอุปกรณ์, ผู้ยืม, แผนก..."
              className="w-full sm:w-64 pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          {canCreateBorrow && <button
            onClick={handleOpenModal}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-4 sm:px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-200 whitespace-nowrap"
          >
            <Plus size={18} /> บันทึกการยืม
          </button>}
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard icon={PackageOpen} title="ทั้งหมด" value={stats.total} color="from-slate-500 to-slate-700" />
        <StatCard icon={ArrowLeftRight} title="กำลังยืมอยู่" value={stats.borrowed} color="from-emerald-400 to-emerald-600" />
        <StatCard icon={Clock} title={`ใกล้ครบ ≤ ${DUE_SOON_DAYS} วัน`} value={stats.dueSoon} color="from-amber-400 to-amber-500" />
        <StatCard icon={AlertTriangle} title="เกินกำหนด" value={stats.overdue} color="from-rose-500 to-rose-600" alert={stats.overdue > 0} />
        <StatCard icon={CheckCircle2} title="คืนแล้ว" value={stats.returned} color="from-slate-400 to-slate-500" />
      </div>

      {/* Segmented filter — เลือกมุมมองรายการ พร้อมจำนวนในแต่ละกลุ่ม */}
      <div className="mb-4 overflow-x-auto">
        <div className="inline-flex min-w-full sm:min-w-0 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {[
            { key: 'all', label: 'ทั้งหมด', count: stats.total },
            { key: 'borrowed', label: 'กำลังยืม', count: stats.borrowed },
            { key: 'due-soon', label: 'ใกล้ครบกำหนด', count: stats.dueSoon },
            { key: 'overdue', label: 'เกินกำหนด', count: stats.overdue },
            { key: 'returned', label: 'คืนแล้ว', count: stats.returned },
          ].map((opt) => {
            const active = statusFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                aria-pressed={active}
                className={`flex-1 sm:flex-none whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  active
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {opt.label}
                <span className={`px-1.5 rounded-md text-[10px] leading-4 ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-4 py-3 text-sm font-medium">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* ตารางเต็มรูปแบบบนจอกว้าง (lg ขึ้นไป) — ต่ำกว่านั้นใช้ card list ด้านล่าง */}
        <div className="hidden lg:block overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm table-fixed">
          <thead className="bg-slate-100 text-slate-500 uppercase font-bold text-xs">
            <tr>
              <th className="px-4 py-2.5 text-left" style={{ width: '15%' }}>ชื่ออุปกรณ์</th>
              <th className="px-4 py-2.5 text-left" style={{ width: '8%' }}>ประเภท</th>
              <th className="px-4 py-2.5 text-left" style={{ width: '9%' }}>Fix Asset</th>
              <th className="px-4 py-2.5 text-left" style={{ width: '8%' }}>S/N</th>
              <th className="px-4 py-2.5 text-left" style={{ width: '13%' }}>เหตุผล</th>
              <th className="px-4 py-2.5 text-left" style={{ width: '12%' }}>ผู้ยืม</th>
              <th className="px-4 py-2.5 text-left" style={{ width: '9%' }}>วันที่คืน</th>
              <th className="px-4 py-2.5 text-center" style={{ width: '8%' }}>สถานะ</th>
              <th className="px-4 py-2.5 text-left" style={{ width: '7%' }}>คนรับคืน</th>
              <th className="px-4 py-2.5 text-center" style={{ width: '9%' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-t border-slate-100">
                  {Array.from({ length: 10 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: `${40 + ((i * 7 + j * 13) % 50)}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : pagedList.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-400">
                  <PackageOpen size={28} className="mx-auto mb-2 text-slate-300" />
                  {search ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายการยืมอุปกรณ์'}
                </td>
              </tr>
            ) : (
              pagedList.map((b) => {
                const overdue = isOverdue(b);
                const categoryLabel = deviceTypes.find((t) => t.TypeId === b.Category)?.Label || b.Category;
                const dueSoon = isDueSoon(b);
                const returned = isReturned(b);
                // สีแถบซ้าย: แดง = เกินกำหนด, เหลือง = ใกล้ครบ, เขียว = กำลังยืมปกติ, ไม่มีสี = คืนแล้ว
                const accent = overdue ? '#f43f5e' : dueSoon ? '#f59e0b' : returned ? 'transparent' : '#10b981';
                const barColor = overdue ? 'bg-rose-500' : dueSoon ? 'bg-amber-400' : returned ? 'bg-slate-300' : 'bg-emerald-500';
                const total = borrowTotalDays(b);
                const used = borrowDurationDays(b) ?? 0;
                const progress = Math.min(100, Math.round((used / total) * 100));
                return (
                  <tr key={b.brID} className={`border-t border-slate-100 hover:bg-slate-50/60 transition-colors text-[13px] ${returned ? 'opacity-70 hover:opacity-100' : ''}`}>
                    <td className="px-4 py-2 font-bold text-slate-700 break-words leading-snug" style={{ boxShadow: `inset 4px 0 0 ${accent}` }}>{b.brname}</td>
                    <td className="px-4 py-2 text-slate-600 break-words leading-snug">{categoryLabel || '-'}</td>
                    <td className="px-4 py-2 text-slate-500 font-mono break-words leading-snug">{b.brfixasset || '-'}</td>
                    <td className="px-4 py-2 text-slate-500 font-mono break-words leading-snug">{b.brserial || '-'}</td>
                    <td className="px-4 py-2 text-slate-500 break-words leading-snug" title={b.brReason || ''}>{b.brReason || '-'}</td>
                    <td className="px-4 py-2 break-words leading-tight">
                      <div className="font-medium text-slate-700">{b.brEmpname}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{b.brEmpCode || '-'}</div>
                      <div className="text-[11px] text-slate-400">{b.brEmpDept || '-'}</div>
                    </td>
                    <td className="px-4 py-2 text-slate-600 leading-snug">
                      {b.EndDate ? new Date(b.EndDate).toLocaleDateString('th-TH') : '-'}
                      {(overdue || dueSoon) && (
                        <div className={`text-[11px] font-bold ${overdue ? 'text-rose-600' : 'text-amber-600'}`}>
                          {overdue
                            ? `เลยมา ${-daysUntil(b.EndDate)} วัน`
                            : daysUntil(b.EndDate) === 0
                              ? 'ครบวันนี้'
                              : `อีก ${daysUntil(b.EndDate)} วัน`}
                        </div>
                      )}
                      {borrowDurationDays(b) !== null && (
                        <>
                          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden" title={`ใช้ไป ${used} จาก ${total} วัน${used > total ? ' (เกินกำหนด)' : ''}`}>
                            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${progress}%` }} />
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {returned ? `ยืม ${used} วัน` : `ยืมมาแล้ว ${used} วัน`}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {b.brStatus === 'returned' ? (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-xs font-bold px-2.5 py-0.5 rounded-full">
                          คืนแล้ว
                        </span>
                      ) : overdue ? (
                        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 text-xs font-bold px-2.5 py-0.5 rounded-full">
                          เกินกำหนด
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-0.5 rounded-full">
                          กำลังยืม
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500 break-words leading-snug uppercase">
  {(b.received_by || '-').toUpperCase()}
</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => setDetailItem(b)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors"
                          title="ดูรายละเอียด"
                        >
                          <Info size={16} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => openEditModal(b)}
                            className="text-slate-400 hover:text-amber-600 transition-colors"
                            title="แก้ไขข้อมูล"
                          >
                            <Edit2 size={15} />
                          </button>
                        )}
                        {isAdmin && !returned && (
                          <button
                            onClick={() => openExtend(b)}
                            className="text-slate-400 hover:text-indigo-600 transition-colors"
                            title="ยืดเวลาคืน"
                            aria-label="ยืดเวลาคืน"
                          >
                            <CalendarPlus size={16} />
                          </button>
                        )}
                        {b.brStatus !== 'returned' && (
                          canReturnBorrow && <button
                            onClick={() => requestReturn(b)}
                            disabled={returningId === b.brID}
                            className="text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50"
                            title="รับคืน"
                          >
                            {returningId === b.brID ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <ArrowLeftRight size={16} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        {/* card list บนจอเล็ก/แท็บเล็ต */}
        <div className="lg:hidden divide-y divide-slate-100">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`msk-${i}`} className="p-4 space-y-3">
                <div className="h-4 w-2/3 rounded bg-slate-100 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
                <div className="h-1.5 w-full rounded bg-slate-100 animate-pulse" />
              </div>
            ))
          ) : pagedList.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <PackageOpen size={28} className="mx-auto mb-2 text-slate-300" />
              {search || statusFilter !== 'all' ? 'ไม่พบรายการที่ค้นหา / กรอง' : 'ยังไม่มีรายการยืมอุปกรณ์'}
            </div>
          ) : (
            pagedList.map((b) => {
              const overdue = isOverdue(b);
              const dueSoon = isDueSoon(b);
              const returned = isReturned(b);
              const accent = overdue ? '#f43f5e' : dueSoon ? '#f59e0b' : returned ? 'transparent' : '#10b981';
              const barColor = overdue ? 'bg-rose-500' : dueSoon ? 'bg-amber-400' : returned ? 'bg-slate-300' : 'bg-emerald-500';
              const total = borrowTotalDays(b);
              const used = borrowDurationDays(b) ?? 0;
              const progress = Math.min(100, Math.round((used / total) * 100));
              const categoryLabel = deviceTypes.find((t) => t.TypeId === b.Category)?.Label || b.Category;
              const codes = [b.brfixasset, b.brserial].filter(Boolean).join(' · ');
              return (
                <div
                  key={b.brID}
                  className={`p-4 ${returned ? 'opacity-70' : ''}`}
                  style={{ boxShadow: `inset 4px 0 0 ${accent}` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 break-words leading-snug">{b.brname}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{categoryLabel || '-'}</p>
                      {codes && <p className="text-[11px] text-slate-400 font-mono break-all">{codes}</p>}
                    </div>
                    {returned ? (
                      <span className="shrink-0 bg-slate-100 text-slate-500 text-xs font-bold px-2.5 py-0.5 rounded-full">คืนแล้ว</span>
                    ) : overdue ? (
                      <span className="shrink-0 bg-rose-50 text-rose-600 text-xs font-bold px-2.5 py-0.5 rounded-full">เกินกำหนด</span>
                    ) : dueSoon ? (
                      <span className="shrink-0 bg-amber-50 text-amber-600 text-xs font-bold px-2.5 py-0.5 rounded-full">ใกล้ครบ</span>
                    ) : (
                      <span className="shrink-0 bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-0.5 rounded-full">กำลังยืม</span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 text-xs font-black flex items-center justify-center shrink-0">
                      {(b.brEmpname || '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{b.brEmpname || '-'}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{[b.brEmpCode, b.brEmpDept].filter(Boolean).join(' · ') || '-'}</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>ยืม {b.StartDate ? new Date(b.StartDate).toLocaleDateString('th-TH') : '-'}</span>
                      <span>คืน {b.EndDate ? new Date(b.EndDate).toLocaleDateString('th-TH') : '-'}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${progress}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] font-bold">
                      {overdue && <span className="text-rose-600">เลยมา {-daysUntil(b.EndDate)} วัน</span>}
                      {dueSoon && !overdue && (
                        <span className="text-amber-600">{daysUntil(b.EndDate) === 0 ? 'ครบวันนี้' : `อีก ${daysUntil(b.EndDate)} วัน`}</span>
                      )}
                      {!overdue && !dueSoon && (
                        <span className="text-slate-400 font-normal">{returned ? `ยืม ${used} วัน` : `ยืมมาแล้ว ${used} วัน`}</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
                    <button onClick={() => setDetailItem(b)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-50" aria-label="ดูรายละเอียด">
                      <Info size={18} />
                    </button>
                    {isAdmin && (
                      <button onClick={() => openEditModal(b)} className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-50" aria-label="แก้ไขข้อมูล">
                        <Edit2 size={17} />
                      </button>
                    )}
                    {isAdmin && !returned && (
                      <button onClick={() => openExtend(b)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-50" aria-label="ยืดเวลาคืน">
                        <CalendarPlus size={18} />
                      </button>
                    )}
                    {!returned && (
                      canReturnBorrow && <button
                        onClick={() => requestReturn(b)}
                        disabled={returningId === b.brID}
                        className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {returningId === b.brID ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
                        รับคืน
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!loading && filteredList.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              แสดง {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, filteredList.length)} จาก {filteredList.length} รายการ
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ก่อนหน้า
              </button>
              <span className="text-xs font-bold text-slate-600 px-2">
                หน้า {pageSafe} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800">บันทึกการยืมอุปกรณ์</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {formError && (
                <div className="mx-5 mt-5 flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-4 py-2.5 text-sm font-medium">
                  <AlertTriangle size={15} /> {formError}
                </div>
              )}

              <div className="flex flex-col md:flex-row">
                {/* ── คอลัมน์ซ้าย: ข้อมูลอุปกรณ์ ── */}
                <div className="flex-1 p-6 space-y-4 md:border-r border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">ข้อมูลอุปกรณ์</span>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5"><StepBadge n={1} />ประเภท (Category)</label>
                    <select
                      value={form.Category}
                      onChange={(e) => {
                        // ล้างข้อมูลครุภัณฑ์ (Fix Asset / S/N / ผลค้นหา) ทุกครั้งที่เปลี่ยนประเภท
                        // กันค่าเก่าค้างแล้วถูกส่งไปบันทึกกับอุปกรณ์ทั่วไปโดยไม่ตั้งใจ
                        setForm((f) => ({
                          ...f,
                          Category: e.target.value,
                          brname: '',
                          brfixasset: '',
                          brserial: '',
                          brqty: e.target.value === 'Asset' ? 1 : f.brqty,
                        }));
                        setAssetInfo(null);
                        setAssetError('');
                        setManualDeviceName(false);
                      }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- เลือก --</option>
                      {deviceTypes.map((t) => (
                        <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>
                      ))}
                    </select>
                    {!isAssetCategory && form.Category && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        อุปกรณ์ทั่วไปไม่บังคับกรอก S/N และรหัสครุภัณฑ์
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-500"><StepBadge n={2} />ชื่ออุปกรณ์</label>
                      {matchingProducts.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setManualDeviceName((v) => !v); setForm((f) => ({ ...f, brname: '' })); }}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                        >
                          {manualDeviceName ? 'เลือกจากรายการอุปกรณ์' : 'พิมพ์ชื่อเอง'}
                        </button>
                      )}
                    </div>

                    {matchingProducts.length > 0 && !manualDeviceName ? (
                      <select
                        value={form.brname}
                        onChange={(e) => setForm((f) => ({ ...f, brname: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- เลือกอุปกรณ์ --</option>
                        {matchingProducts.map((p) => (
                          <option key={p.ProductID} value={p.ProductName}>{p.ProductName}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={form.brname}
                        onChange={(e) => setForm((f) => ({ ...f, brname: e.target.value }))}
                        placeholder={form.Category ? 'พิมพ์ชื่ออุปกรณ์...' : 'เลือกประเภทก่อน หรือพิมพ์ชื่ออุปกรณ์เอง'}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    {!form.Category && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        เลือกประเภทก่อน เพื่อดูรายชื่ออุปกรณ์ที่มีอยู่ในสต็อก
                      </p>
                    )}
                  </div>

                  {isAssetCategory && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">
                      <StepBadge n={3} />Fix Asset No. {isAssetCategory && <span className="text-rose-500">*</span>}
                    </label>
                    {!assetInfo ? (
                      <>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <input
                              type="text"
                              value={form.brfixasset}
                              onChange={(e) => {
                                setForm((f) => ({ ...f, brfixasset: nextFixedAssetCode(e.target.value, f.brfixasset) }));
                                setAssetError('');
                              }}
                              placeholder="เช่น CO24-017-02 (ถ้ามี)"
                              maxLength={11}
                              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 ${
                                form.brfixasset && !isValidFixedAssetCode(form.brfixasset) ? 'border-rose-300' : 'border-slate-200 focus:border-indigo-500'
                              }`}
                            />
                            <p className={`text-[11px] mt-1 ${form.brfixasset && !isValidFixedAssetCode(form.brfixasset) ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                              รูปแบบ: (CO|OF)XX-XXX-XX เช่น CO24-017-02
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={lookupAsset}
                            disabled={!isValidFixedAssetCode(form.brfixasset) || assetLoading}
                            className="px-4 py-2.5 h-fit rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
                          >
                            {assetLoading && <Loader2 size={14} className="animate-spin" />}
                            {assetLoading ? 'กำลังค้นหา...' : 'ค้นหา'}
                          </button>
                        </div>
                        {assetError && (
                          <p className="text-rose-500 font-bold mt-2 flex items-center gap-1.5 text-xs">
                            <AlertTriangle size={13} /> {assetError}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="relative border border-slate-200 bg-slate-50 rounded-xl px-3.5 py-3 space-y-2.5">
                        <button
                          type="button"
                          onClick={resetAssetLookup}
                          title="ค้นหาใหม่"
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          <X size={16} />
                        </button>
                        <div>
                          <p className="text-[11px] text-slate-400 font-bold uppercase">ชื่ออุปกรณ์</p>
                          <p className="text-sm font-bold text-slate-700">{assetInfo.AssetName || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400 font-bold uppercase">มูลค่า</p>
                          <p className="text-sm font-medium text-slate-700">
                            {assetInfo.Cost != null ? `฿${Number(assetInfo.Cost).toLocaleString()}` : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400 font-bold uppercase">มูลค่าคงเหลือ</p>
                          <p className="text-sm font-medium text-slate-700">
                            {assetInfo.RemainingValue != null ? `฿${Number(assetInfo.RemainingValue).toLocaleString()}` : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400 font-bold uppercase">สถานที่ / หมายเหตุ</p>
                          <p className="text-sm font-medium text-slate-700">{assetInfo.Place || '-'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {isAssetCategory && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">
                        <StepBadge n={4} />S/N <span className="text-rose-500">*</span>
                        <span className="text-slate-400 font-normal normal-case ml-1">(auto-fill ถ้าเจอจาก Fix Asset ไม่งั้นเติมเอง)</span>
                      </label>
                      <input
                        type="text"
                        value={form.brserial}
                        onChange={(e) => setForm((f) => ({ ...f, brserial: e.target.value }))}
                        placeholder="บังคับกรอกสำหรับครุภัณฑ์ (Asset)"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">
                      <StepBadge n={5} />จำนวน
                      {isAssetCategory && (
                        <span className="text-slate-400 font-normal normal-case ml-1">(ครุภัณฑ์ยืมได้ครั้งละ 1 ชิ้น)</span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isAssetCategory}
                        onClick={() => setForm((f) => ({ ...f, brqty: Math.max(1, Number(f.brqty) - 1) }))}
                        className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        disabled={isAssetCategory}
                        value={isAssetCategory ? 1 : form.brqty}
                        onChange={(e) => setForm((f) => ({ ...f, brqty: Math.max(1, Number(e.target.value) || 1) }))}
                        className="w-16 text-center border border-slate-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <button
                        type="button"
                        disabled={isAssetCategory}
                        onClick={() => setForm((f) => ({ ...f, brqty: Number(f.brqty) + 1 }))}
                        className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── คอลัมน์ขวา: ผู้ยืม + เหตุผล + วันที่ ── */}
                <div className="flex-1 p-6 space-y-4">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">ผู้ยืมและเหตุผล</span>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">
                      <StepBadge n={6} />รหัสพนักงานผู้ยืม <span className="text-rose-500">*</span>
                    </label>
                    {!empData ? (
                      <>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={empCode}
                            onChange={(e) => { setEmpCode(e.target.value); setEmpError(''); }}
                            placeholder="รหัสพนักงาน..."
                            className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={lookupEmployee}
                            disabled={!empCode.trim() || empLoading}
                            className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
                          >
                            {empLoading && <Loader2 size={14} className="animate-spin" />}
                            {empLoading ? 'กำลังค้นหา...' : 'ค้นหา'}
                          </button>
                        </div>
                        {empError && (
                          <p className="text-rose-500 font-bold mt-2 flex items-center gap-1.5 text-xs">
                            <AlertTriangle size={13} /> {empError}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="relative border border-slate-200 bg-slate-50 rounded-xl px-3.5 py-3 space-y-2.5">
                        <button
                          type="button"
                          onClick={resetEmpLookup}
                          title="ค้นหาใหม่"
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          <X size={16} />
                        </button>
                        <div>
                          <p className="text-[11px] text-slate-400 font-bold uppercase">ชื่อ</p>
                          <p className="text-sm font-bold text-slate-700">{form.brEmpname}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400 font-bold uppercase">Cost Center</p>
                          <p className="text-sm font-medium text-slate-700">{form.brEmpDept || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400 font-bold uppercase">รหัสพนักงาน</p>
                          <p className="text-sm font-mono font-medium text-slate-700">{empData.EmployeeCode}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">
                      <StepBadge n={7} />เหตุผลการยืม <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      value={form.brReason}
                      onChange={(e) => setForm((f) => ({ ...f, brReason: e.target.value }))}
                      placeholder="เช่น ใช้งานนอกสถานที่, เครื่องเดิมส่งซ่อม, งานโปรเจกต์ ABC..."
                      rows={4}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5"><StepBadge n={8} />วันที่ยืม</label>
                      <input
                        type="date"
                        value={form.StartDate}
                        onChange={(e) => setForm((f) => ({ ...f, StartDate: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5"><StepBadge n={9} />กำหนดคืน</label>
                      <input
                        type="date"
                        value={form.EndDate}
                        onChange={(e) => setForm((f) => ({ ...f, EndDate: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="flex gap-1.5 mt-2">
                        {[1, 3, 7, 30].map((n) => {
                          const target = form.StartDate ? addDaysToInput(form.StartDate, n) : '';
                          const active = !!target && form.EndDate === target;
                          return (
                            <button
                              key={n}
                              type="button"
                              disabled={!form.StartDate}
                              onClick={() => setForm((f) => ({ ...f, EndDate: addDaysToInput(f.StartDate, n) }))}
                              className={`flex-1 py-1 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                              }`}
                            >
                              {n} วัน
                            </button>
                          );
                        })}
                      </div>
                      {form.EndDate && new Date(form.EndDate) < new Date(new Date().toDateString()) && (
                        <p className="text-[11px] text-amber-600 font-bold mt-1 flex items-center gap-1">
                          <AlertTriangle size={12} /> วันที่นี้ผ่านมาแล้ว — ตรวจสอบว่าถูกต้อง (ยังบันทึกได้ตามปกติ)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100">
                {missingFields.length > 0 && (
                  <p className="mr-auto text-xs text-slate-400">
                    <span className="font-bold text-amber-600">ยังขาด:</span> {missingFields.join(' · ')}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting || !empData || !form.brReason.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailItem && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden rounded-t-2xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1 opacity-90">
                    <Laptop size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">รายละเอียดการยืม</span>
                  </div>
                  <h3 className="font-black text-lg tracking-tight">{detailItem.brname}</h3>
                  <p className="text-indigo-100 text-xs font-medium mt-1 font-mono opacity-80">รหัสรายการ: {detailItem.brID}</p>
                </div>
                <button onClick={() => setDetailItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row">
              {/* ── ซ้าย: Timeline ── */}
              <div className="md:w-52 shrink-0 bg-slate-50/60 border-b md:border-b-0 md:border-r border-slate-100 p-5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">ไทม์ไลน์</span>
                <div className="mt-4">
                  {(() => {
                    const returned = detailItem.brStatus === 'returned';
                    const overdue = isOverdue(detailItem);
                    const steps = [
                      {
                        label: 'ยืมออก',
                        date: detailItem.StartDate ? new Date(detailItem.StartDate).toLocaleDateString('th-TH') : '-',
                        sub: detailItem.brEmpname,
                        dot: 'bg-indigo-600',
                        done: true,
                      },
                      {
                        label: 'กำหนดคืน',
                        date: detailItem.EndDate ? new Date(detailItem.EndDate).toLocaleDateString('th-TH') : '-',
                        sub: returned ? null : overdue ? 'เกินกำหนดแล้ว' : 'ยังไม่ถึงกำหนด',
                        dot: overdue && !returned ? 'bg-rose-500' : 'bg-amber-400',
                        done: true,
                      },
                      {
                        label: 'รับคืน',
                        date: detailItem.ActualReturnDate ? new Date(detailItem.ActualReturnDate).toLocaleDateString('th-TH') : 'ยังไม่คืน',
                        sub: returned ? (detailItem.received_by || '').toUpperCase() : null,
                        dot: returned ? 'bg-emerald-500' : 'bg-slate-300',
                        done: returned,
                      },
                    ];
                    return steps.map((s, i) => (
                      <div key={s.label} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
                          {i < steps.length - 1 && (
                            <div className={`w-px flex-1 my-1 ${s.done ? 'bg-slate-300' : 'bg-slate-200'}`} style={{ minHeight: 28 }} />
                          )}
                        </div>
                        <div className="pb-5">
                          <p className={`text-xs font-bold ${s.done ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{s.date}</p>
                          {s.sub && <p className="text-[11px] text-slate-400 mt-0.5">{s.sub}</p>}
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                <div className="mt-1">
                  {detailItem.brStatus === 'returned' ? (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-[11px] font-bold px-2.5 py-1 rounded-full">คืนแล้ว</span>
                  ) : isOverdue(detailItem) ? (
                    <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 text-[11px] font-bold px-2.5 py-1 rounded-full">เกินกำหนด</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-[11px] font-bold px-2.5 py-1 rounded-full">กำลังยืม</span>
                  )}
                  {borrowDurationDays(detailItem) !== null && (
                    <p className="text-[11px] text-slate-400 mt-2">
                      {detailItem.brStatus === 'returned'
                        ? `ยืมทั้งหมด ${borrowDurationDays(detailItem)} วัน`
                        : `ยืมมาแล้ว ${borrowDurationDays(detailItem)} วัน`}
                    </p>
                  )}
                </div>
              </div>

              {/* ── ขวา: รายละเอียด ── */}
              <div className="flex-1 min-w-0">
                <div className="px-4 pt-3 pb-0.5"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">ข้อมูลอุปกรณ์</span></div>
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {[
                    { label: 'ชื่ออุปกรณ์', value: detailItem.brname },
                    { label: 'ประเภท', value: deviceTypes.find((t) => t.TypeId === detailItem.Category)?.Label || detailItem.Category || '-' },
                    { label: 'S/N', value: detailItem.brserial || '-', mono: true },
                    { label: 'รหัสครุภัณฑ์', value: detailItem.brfixasset || '-', mono: true },
                    { label: 'จำนวน', value: detailItem.brqty ?? '-' },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex items-center px-4 py-2">
                      <span className="text-[12px] text-slate-400 w-28 shrink-0">{label}</span>
                      <span className={`text-[12px] font-medium text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
                    </div>
                  ))}
                </div>

                <div className="px-4 pt-2 pb-0.5"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">ผู้ยืม</span></div>
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {[
                    { label: 'รหัสพนักงาน', value: detailItem.brEmpCode || '-', mono: true },
                    { label: 'ชื่อ', value: detailItem.brEmpname || '-' },
                    { label: 'Cost Center', value: detailItem.brEmpDept || '-' },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex items-center px-4 py-2">
                      <span className="text-[12px] text-slate-400 w-28 shrink-0">{label}</span>
                      <span className={`text-[12px] font-medium text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
                    </div>
                  ))}
                </div>

                <div className="px-4 pt-2 pb-0.5"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">เหตุผล & บันทึกโดย</span></div>
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  <div className="flex items-start px-4 py-2">
                    <span className="text-[12px] text-slate-400 w-28 shrink-0 pt-0.5">เหตุผลการยืม</span>
                    <span className="text-[12px] font-medium text-slate-800 whitespace-pre-wrap">{detailItem.brReason || '-'}</span>
                  </div>
                  {[
                    { label: 'บันทึกโดย', value: (detailItem.recorded_by || '-').toUpperCase() },
                    { label: 'รับคืนโดย', value: (detailItem.received_by || '-').toUpperCase() },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center px-4 py-2">
                      <span className="text-[12px] text-slate-400 w-28 shrink-0">{label}</span>
                      <span className="text-[12px] font-medium text-slate-800">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-4 pb-4 pt-3 border-t border-slate-100">
              <button
                onClick={() => setDetailItem(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-sm py-2.5 rounded-xl transition-colors"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmReturnItem && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <ArrowLeftRight size={22} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-1">ยืนยันรับคืนอุปกรณ์?</h3>
            <p className="text-sm text-slate-500 mb-6">
              <span className="font-bold text-slate-700">{confirmReturnItem.brname}</span>
              <br />
              ผู้ยืม: {confirmReturnItem.brEmpname}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReturnItem(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmReturn}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
                ยืนยันรับคืน
              </button>
            </div>
          </div>
        </div>
      )}

      {editItem && editForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800">แก้ไขข้อมูลการยืม</h3>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              {editError && (
                <div className="flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-4 py-2.5 text-sm font-medium">
                  <AlertTriangle size={15} /> {editError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">ชื่ออุปกรณ์</label>
                  <input
                    type="text"
                    value={editForm.brname}
                    onChange={(e) => setEditForm((f) => ({ ...f, brname: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">ประเภท (Category)</label>
                  <select
                    value={editForm.Category}
                    onChange={(e) => setEditForm((f) => ({ ...f, Category: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- เลือก --</option>
                    {deviceTypes.map((t) => (
                      <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">
                    S/N {editForm.Category === 'Asset' && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={editForm.brserial}
                    onChange={(e) => setEditForm((f) => ({ ...f, brserial: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">
                    Fix Asset No. {editForm.Category === 'Asset' && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={editForm.brfixasset}
                    onChange={(e) => setEditForm((f) => ({ ...f, brfixasset: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">จำนวน</label>
                  <input
                    type="number"
                    min={1}
                    disabled={editForm.Category === 'Asset'}
                    value={editForm.Category === 'Asset' ? 1 : editForm.brqty}
                    onChange={(e) => setEditForm((f) => ({ ...f, brqty: Math.max(1, Number(e.target.value) || 1) }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">
                    รหัสพนักงานผู้ยืม <span className="text-slate-400 font-normal normal-case">(แก้แล้วระบบจะดึงชื่อ/แผนกจาก HR ให้ใหม่)</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.brEmpCode}
                    onChange={(e) => setEditForm((f) => ({ ...f, brEmpCode: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">ชื่อผู้ยืม</label>
                  <input
                    type="text"
                    value={editForm.brEmpname}
                    disabled
                    title="ดึงจากระบบ HR อัตโนมัติตามรหัสพนักงาน แก้ตรงนี้ไม่ได้"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Cost Center</label>
                  <input
                    type="text"
                    value={editForm.brEmpDept}
                    disabled
                    title="ดึงจากระบบ HR อัตโนมัติตามรหัสพนักงาน แก้ตรงนี้ไม่ได้"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 -mt-2">
                ⚠️ ชื่อและ Cost Center ที่แสดงเป็นค่าล่าสุดตอนเปิดฟอร์มนี้ — ถ้าแก้รหัสพนักงานแล้วกด "บันทึกการแก้ไข" ระบบจะไปตรวจสอบกับ HR ใหม่และอัปเดตให้อัตโนมัติ
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">เหตุผลการยืม</label>
                <textarea
                  value={editForm.brReason}
                  onChange={(e) => setEditForm((f) => ({ ...f, brReason: e.target.value }))}
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">วันที่ยืม</label>
                  <input
                    type="date"
                    value={editForm.StartDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, StartDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">กำหนดคืน</label>
                  <input
                    type="date"
                    value={editForm.EndDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, EndDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  สถานะ <span className="text-slate-400 font-normal normal-case">(แก้ไขได้กรณีบันทึกผิด)</span>
                </label>
                <div className="flex gap-2">
                  {[
                    { value: 'borrowed', label: 'กำลังยืม' },
                    { value: 'returned', label: 'คืนแล้ว' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, brStatus: opt.value }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                        editForm.brStatus === opt.value
                          ? opt.value === 'returned'
                            ? 'bg-slate-700 text-white border-slate-700'
                            : 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {editForm.brStatus === 'returned' && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">คนรับคืน</label>
                    <input
                      type="text"
                      value={editForm.received_by}
                      onChange={(e) => setEditForm((f) => ({ ...f, received_by: e.target.value.toUpperCase() }))}
                      placeholder={(user?.username || '').toUpperCase()}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 disabled:opacity-60"
                >
                  {editSubmitting && <Loader2 size={16} className="animate-spin" />}
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {extendItem && (
        <div
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50"
          onClick={closeExtend}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 mb-4 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CalendarPlus size={22} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-1">ยืดเวลาคืนอุปกรณ์</h3>
            <p className="text-sm text-slate-500 mb-4">
              <span className="font-bold text-slate-700">{extendItem.brname}</span>
              <br />
              กำหนดคืนเดิม: {extendItem.EndDate ? new Date(extendItem.EndDate).toLocaleDateString('th-TH') : '-'}
            </p>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {[7, 14, 30].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setExtendDate(addDaysToInput(extendBase, n))}
                  className="py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  +{n} วัน
                </button>
              ))}
            </div>
            <input
              type="date"
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {extendError && (
              <p className="text-rose-500 font-bold mt-2 flex items-center gap-1.5 text-xs">
                <AlertTriangle size={13} /> {extendError}
              </p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={closeExtend}
                disabled={extendSubmitting}
                className="flex-1 py-2.5 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExtend}
                disabled={extendSubmitting || !extendDate}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {extendSubmitting && <Loader2 size={16} className="animate-spin" />}
                ยืนยันยืดเวลา
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-bold text-white z-50 ${
            toast.tone === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          <CheckCircle2 size={16} />
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default ITBorrowSystem;