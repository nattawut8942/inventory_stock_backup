import { ChevronLeft, Download, RefreshCw, Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE, API_URL } from '../config/api';
import MOInventoryPage from './MOInventoryPage';
import LocationSelectorModal from './LocationSelectorModal';
import MapViewTab from './MapViewTab';
import Portal from '../components/Portal';
import AlertModal from '../components/AlertModal';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
const getFullImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const finalPath = cleanPath.startsWith('/uploads') ? cleanPath : `/uploads${cleanPath}`;
  return `${API_URL}${finalPath}`;
};


const parseDate = (d) => {
  if (!d) return null;
  // รองรับ "15/09/2026 21:22" (dd/mm/yyyy) ที่ new Date() อ่านไม่ได้
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
};

// const fmtDate = (d) => {
//   const dt = parseDate(d);
//   if (!dt) return d || '—';
//   return dt.toLocaleString('en-GB', {
//     day: '2-digit', month: 'short', year: 'numeric',
//     hour: '2-digit', minute: '2-digit',
//   }); // → 15 Sep 2026, 21:22
// };

const timeAgo = (d) => {
  const dt = parseDate(d);
  if (!dt) return null;
  const min = Math.floor((Date.now() - dt.getTime()) / 60000);
  if (min < 0) return null;
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม. ที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} วันที่แล้ว`;
  return null; // เก่ากว่า 30 วัน ให้แสดงวันที่เต็มแทน
};

// ---------- Warranty helpers ----------
// warranty_expire_date มาจาก SQL DATE (yyyy-mm-dd) → คำนวณจำนวนวันเทียบกับวันนี้
const getWarranty = (dateStr) => {
  if (!dateStr) return { status: 'none', days: null };
  const exp = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (isNaN(exp.getTime())) return { status: 'none', days: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((exp - today) / 86400000);
  return { status: days < 0 ? 'expired' : 'active', days };
};

const fmtDateYMD = (s) => {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const warrantyLabel = (s) => {
  const w = getWarranty(s);
  if (w.status === 'none') return null;
  if (w.status === 'expired') return `${fmtDateYMD(s)} · หมดแล้ว`;
  return `${fmtDateYMD(s)} · เหลือ ${w.days} วัน`;
};

// disk_smart_info: แต่ละดิสก์คั่นด้วย " || " รูปแบบ "รุ่น|...|ขนาด|Health:xxx|SN:..."
const parseDiskSmart = (s) => {
  if (!s) return [];
  return s.split('||').map(part => part.trim()).filter(Boolean).map(part => {
    const fields = part.split('|').map(f => f.trim());
    const health = (fields.find(f => /^Health:/i.test(f)) || '').replace(/^Health:\s*/i, '') || '—';
    const sn = (fields.find(f => /^SN:/i.test(f)) || '').replace(/^SN:\s*/i, '');
    return { model: fields[0] || '—', size: fields.find(f => /GB|TB/i.test(f)) || '—', health, sn };
  });
};

// battery_health: "44871 mWh / 50015 mWh (89.7%)" → ใช้เฉพาะเปอร์เซ็นต์
const batteryPercentOf = (s) => {
  const m = String(s || '').match(/\((\d+(?:\.\d+)?)%\)/);
  return m ? `${m[1]}%` : (s || null);
};

// การ์ดรายการแบบโดนัท: แสดงสัดส่วนเป็นวงแหวนเล็กๆ + legend 5 รายการแรก กด "ดูเพิ่มเติม" เพื่อดูทั้งหมด
const RankedCard = ({ title, countLabel, items, expanded, onToggle, onTitleClick, titleOn, bare, palette, text, hover, active, isActive, onItemClick }) => {
  const total = items.reduce((s, it) => s + it.count, 0) || 1;
  const shown = expanded ? items : items.slice(0, 5);
  const R = 26;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const segments = items.map((it, i) => {
    const len = (it.count / total) * C;
    const seg = { ...it, len, off: acc, color: it.warn ? '#ef4444' : (palette[i] || '#e5e7eb') };
    acc += len;
    return seg;
  });
  return (
    <div className={bare ? '' : 'bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm'}>
      <div className="flex items-center justify-between mb-2">
        <div onClick={onTitleClick} className={`text-[12px] font-bold uppercase tracking-wider ${titleOn ? 'text-blue-600' : 'text-gray-400'} ${onTitleClick ? 'cursor-pointer' : ''}`}>{title} ({countLabel ?? items.length})</div>
        {items.length > 5 && (
          <button onClick={onToggle} className="text-[11px] font-semibold text-blue-600 hover:text-blue-800">
            {expanded ? 'ย่อ' : `ดูเพิ่มเติม (${items.length})`}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-[12px] text-gray-400 py-2">ไม่มีข้อมูล</div>
      ) : (
        <div className="flex items-start gap-3">
          <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" role="img" aria-label={`${title} สัดส่วน`}>
            <g transform="rotate(-90 32 32)">
              <circle cx="32" cy="32" r={R} fill="none" stroke="#f3f4f6" strokeWidth="8" />
              {segments.map(seg => (
                <circle
                  key={seg.id}
                  cx="32" cy="32" r={R} fill="none"
                  stroke={seg.color} strokeWidth="8"
                  strokeDasharray={`${seg.len} ${C - seg.len}`}
                  strokeDashoffset={-seg.off}
                  opacity={isActive(seg.id) ? 1 : 0.85}
                  className="cursor-pointer"
                  onClick={() => onItemClick(seg.id, seg.label)}
                >
                  <title>{seg.label}: {seg.count}</title>
                </circle>
              ))}
            </g>
            <text x="32" y="30" textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">{total}</text>
            <text x="32" y="41" textAnchor="middle" fontSize="7" fill="#9ca3af">รวม</text>
          </svg>
          <div className="flex-1 min-w-0 divide-y divide-gray-100">
            {shown.map((it, i) => (
              <div
                key={it.id}
                onClick={() => onItemClick(it.id, it.label)}
                title={it.label}
                className={`flex items-center gap-2 py-1 px-1.5 rounded-md cursor-pointer ${hover} transition-colors ${isActive(it.id) ? active : ''}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: it.warn ? '#ef4444' : (palette[i] || '#e5e7eb') }} />
                <span className={`flex-1 min-w-0 truncate text-[12px] ${it.warn ? 'text-red-600' : 'text-gray-700'}`}>{it.label}</span>
                <span className={`text-[12px] font-semibold tabular-nums ${text}`}>{it.count}</span>
                <span className="w-9 text-right text-[10px] text-gray-400 tabular-nums">{Math.round((it.count / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ชื่อรุ่นเต็มยาวและซ้ำยี่ห้อ เช่น "ASUSTeK COMPUTER INC. ASUS EXPERTBOOK" → "ASUS EXPERTBOOK"
const shortModelName = (s = '') => s
  .replace(/^ASUSTeK COMPUTER INC\.\s+/i, '')
  .replace(/^Dell Inc\.\s+/i, 'Dell ')
  .replace(/^Hewlett-Packard\s+/i, 'HP ')
  .replace(/^VMware, Inc\.\s+/i, 'VMware ')
  .replace(/^Panasonic Corporation\s+/i, 'Panasonic ')
  .replace(/^(\S+)\s+\1\b/i, '$1')
  .replace(/\s+/g, ' ')
  .trim();

// "Microsoft Windows 11 Pro" → "Win 11 Pro" (ใช้เฉพาะในตาราง ชื่อเต็มยังอยู่ใน tooltip)
const shortOsName = (name = '') => name.replace(/^Microsoft\s+/i, '').replace(/^Windows\b/i, 'Win').trim();

const toCellValue = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
};

// ---------- Session helpers ----------
const stripDomain = (name = '') => name.replace(/^.*\\/, '').trim();
const normalizeUser = (name = '') => stripDomain(name).toLowerCase();
const isSystemAccount = (name = '') => {
  const n = stripDomain(name);
  return !n || /\$$/.test(n) || /^(UMFD|DWM|SYSTEM|LOCAL SERVICE|NETWORK SERVICE|ANONYMOUS)/i.test(n);
};



const SEARCH_FIELD_OPTIONS = [
  { value: 'all', label: 'ทุกฟิลด์', placeholder: 'ค้นหาทุกฟิลด์: hostname, IP, Serial, CPU, Software ฯลฯ' },
  { value: 'hostname', label: 'Hostname', placeholder: 'ค้นหา Hostname...' },
  { value: 'ip_address', label: 'IP Address', placeholder: 'ค้นหา IP Address...' },
  { value: 'active_usernames', label: 'User', placeholder: 'ค้นหา Username...' },
  { value: 'model', label: 'Model', placeholder: 'ค้นหา Model...' },
  { value: 'manufacturer', label: 'Manufacturer', placeholder: 'ค้นหา Manufacturer...' },
  { value: 'serial_number', label: 'Serial Number', placeholder: 'ค้นหา Serial Number...' },
];

const PCInventoryPage = () => {

  const [inventoryType, setInventoryType] = useState('pc');
  const [view, setView] = useState('list');
  const [hostname, setHostname] = useState(null);

  const [invData, setInvData] = useState([]);
  const [sumData, setSumData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [factoryLayouts, setFactoryLayouts] = useState([]);
  const [locationData, setLocationData] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFieldType, setSearchFieldType] = useState('all');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [filterKeys, setFilterKeys] = useState(
    location.state?.filterKey
      ? [{ key: location.state.filterKey, label: location.state.filterLabel }]
      : []
  );
  const [sortKey, setSortKey] = useState('updated_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState({ inv: null, users: [], software: [] });

  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareSortKey, setSoftwareSortKey] = useState('name');
  const [softwareSortAsc, setSoftwareSortAsc] = useState(true);
  const [softwarePage, setSoftwarePage] = useState(1);
  const softwarePageSize = 20;

  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showBlModal, setShowBlModal] = useState(false);
  const [showWarrantyModal, setShowWarrantyModal] = useState(false);
  const [showBulkWarrantyModal, setShowBulkWarrantyModal] = useState(false);
  const [selectedHosts, setSelectedHosts] = useState(() => new Set());
  const [showAllNotebook, setShowAllNotebook] = useState(false);
  const [showAllDesktop, setShowAllDesktop] = useState(false);
  const [showAllOsVersion, setShowAllOsVersion] = useState(false);
  const [showAllOsBuild, setShowAllOsBuild] = useState(false);
  const [showAllCs, setShowAllCs] = useState(false);
  const [showAllTanium, setShowAllTanium] = useState(false);
  const [showAllPatch, setShowAllPatch] = useState(false);
  const [showAllLocation, setShowAllLocation] = useState(false);
  const [warrantyDays, setWarrantyDays] = useState(60);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [modalData, setModalData] = useState({});
  const [multiLoginData, setMultiLoginData] = useState({ data: [], allHostnames: [] });
  const [showMultiLoginModal, setShowMultiLoginModal] = useState(false);
  const [reincarnatedData, setReincarnatedData] = useState({ data: [], allHostnames: [] }); // ✅ เพิ่ม
  const [showReincarnatedModal, setShowReincarnatedModal] = useState(false); // ✅ เพิ่ม
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [showUsbModal, setShowUsbModal] = useState(false);
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState([]);
const [menuOpen, setMenuOpen] = useState(false);
const [showAllSessions, setShowAllSessions] = useState(false);

  const filterBarRef = useRef(null);

  useEffect(() => {
    if (view === 'list') {
      fetchData();
    } else if (view === 'detail' && hostname) {
      fetchDetail(hostname);
    }
  }, [view, hostname]);

  useEffect(() => {
    if (view === 'detail' && hostname) {
      fetchFactoryLayouts();
      fetchPCLocation(hostname);
    }
  }, [view, hostname]);

  const prevSearchRef = useRef('');
 useEffect(() => {
    if (debouncedSearch.length >= 2) {
      (async () => {
        try {
          let url = `${API_BASE}/pc-inventory/search?q=${encodeURIComponent(debouncedSearch)}`;
          if (searchFieldType !== 'all') {
            url += `&field=${encodeURIComponent(searchFieldType)}`;
          }

          const res = await fetch(url).then(r => r.json());
          if (res.success) { setInvData(res.data || []); setPage(1); }
        } catch (_) { }
      })();
    } else if (debouncedSearch.length === 0) {
      fetchData();
    }
  }, [debouncedSearch, searchFieldType]);

  const fetchData = async () => {
    setLoading(true); setError('');
    try {
      const [invRes, sumRes, mlRes, rcRes] = await Promise.all([
        fetch(`${API_BASE}/pc-inventory`).then(r => r.json()),
        fetch(`${API_BASE}/pc-inventory/summary`).then(r => r.json()),
        fetch(`${API_BASE}/pc-inventory/multi-login`).then(r => r.json()),
        fetch(`${API_BASE}/pc-inventory/reincarnated`).then(r => r.json()), // ✅ เพิ่ม
      ]);
      if (!invRes.success) throw new Error(invRes.error || 'Failed to fetch');

      if (searchQuery.length >= 2) {
        let url = `${API_BASE}/pc-inventory/search?q=${encodeURIComponent(searchQuery)}`;
        if (searchFieldType !== 'all') {
          url += `&field=${encodeURIComponent(searchFieldType)}`;
        }
        const res = await fetch(url).then(r => r.json());
        if (res.success) setInvData(res.data || []);
      } else {
        setInvData(invRes.data || []);
      }

      setSumData(sumRes.success ? sumRes : null);
      if (mlRes.success) setMultiLoginData(mlRes);
      if (rcRes.success) setReincarnatedData(rcRes); // ✅ เพิ่ม
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const fetchDetail = async (hn) => {
    setDetailLoading(true);
    setError('');
    try {
      const safeFetch = async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) { console.warn(`Fetch failed for ${url} with status ${r.status}`); return { success: false, data: null }; }
          return await r.json();
        } catch (e) { console.warn(`Network error for ${url}:`, e); return { success: false, data: null }; }
      };

      const [ir, ur, sr, hr] = await Promise.all([
        safeFetch(`${API_BASE}/pc-inventory/${encodeURIComponent(hn)}`),
        safeFetch(`${API_BASE}/pc-active-users/${encodeURIComponent(hn)}`),
        safeFetch(`${API_BASE}/pc-inventory/${encodeURIComponent(hn)}/software`),
        safeFetch(`${API_BASE}/pc-inventory/${encodeURIComponent(hn)}/history`),
      ]);

      if (!ir || !ir.success || !ir.data)
        throw new Error(`ไม่พบข้อมูลคอมพิวเตอร์นี้ในระบบ (Inventory Data Not Found)`);

      setDetailData({
        inv: ir.success ? ir.data : null,
        users: ur && ur.success ? ur.data : [],
        software: sr && sr.success ? sr.data : [],
      });
      setHistoryData(hr && hr.success ? hr.data : []);
      setSoftwarePage(1);
      setSoftwareSearch('');
    } catch (err) {
      console.error('fetchDetail error:', err);
      setError(err.message);
    }
    finally { setDetailLoading(false); }
  };
  const fetchFactoryLayouts = async () => {
    try {
      const res = await fetch(`${API_BASE}/factory-layouts`);
      const data = await res.json();
      if (data.success) {
        setFactoryLayouts(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching layouts:', err);
    }
  };
  const fetchPCLocation = async (hn) => {
    setLocationLoading(true);
    try {
      const res = await fetch(`${API_BASE}/pc-location/${encodeURIComponent(hn)}`);
      const data = await res.json();
      if (data.success) {
        setLocationData(data.data);
      }
    } catch (err) {
      console.error('Error fetching location:', err);
      setLocationData(null);
    } finally {
      setLocationLoading(false);
    }
  };

  // ประกัน: นับจาก invData (เครื่อง active เท่านั้น) — ช่วง "ใกล้หมด" ปรับได้ด้วย warrantyDays
  const warrantySummary = useMemo(() => {
    const expiring = [], expired = [], none = [], recorded = [];
    invData.forEach(d => {
      if (d.pc_status === 'Inactive') return;
      const w = getWarranty(d.warranty_expire_date);
      if (w.status === 'none') none.push(d.hostname);
      else {
        recorded.push(d.hostname);
        if (w.status === 'expired') expired.push(d.hostname);
        else if (w.days <= warrantyDays) expiring.push(d.hostname);
      }
    });
    return { expiring, expired, none, recorded };
  }, [invData, warrantyDays]);

  const getHostsForKey = (key) => {
    if (key === 'warrantyExpiring') return warrantySummary.expiring;
    if (key === 'warrantyExpired') return warrantySummary.expired;
    if (key === 'warrantyNone') return warrantySummary.none;
    if (key === 'warrantyRecorded') return warrantySummary.recorded;
    if (key === 'noRecentPatch') return sumData?.noRecentPatch || [];
    if (key === 'localAdmin') return sumData?.localAdmin || [];
    if (key === 'diskSmartWarn') return sumData?.diskSmartWarn || [];
    if (!sumData) return [];
    if (key === 'noEdr') return sumData.noEdr;
    if (key === 'noTanium') return sumData.noTanium;
    if (key === 'noUems') return sumData.noUems;
    if (key === 'blDisabled') return sumData.blDisabled;
    if (key === 'noAsset') return sumData.noAsset;
    if (key === 'noLocation') return sumData.noLocation;
    if (key === 'noBlKeyNotebook') return sumData.noBlKeyNotebook || [];
    if (key === 'inactivePC') return sumData.inactivePC || [];
    if (key === 'lowBatteryHealth') return sumData.lowBatteryHealth || [];
    if (key === 'lowDiskCSpace') return sumData.lowDiskCSpace || [];
    if (key === 'oldFixAssets') return sumData.oldFixAssets || [];
    if (key === 'longUptime') return sumData.longUptime || [];
    if (key.startsWith('os:')) return sumData.osVersionMap[key.slice(3)] || [];
    if (key.startsWith('build:')) return sumData.osBuildMap[key.slice(6)] || [];
    if (key.startsWith('type:')) return (sumData.computerTypeMap || {})[key.slice(5)] || [];
    if (key.startsWith('model:')) return (sumData.modelMap || {})[key.slice(6)] || [];
    if (key.startsWith('cs:')) return (sumData.crowdstrikeVerMap || {})[key.slice(3)] || [];
    if (key.startsWith('tanium:')) return (sumData.taniumVerMap || {})[key.slice(7)] || [];
    if (key === 'multiLogin') return multiLoginData.allHostnames || [];
    if (key === 'possiblyRenamed') return reincarnatedData.allHostnames || []; // ✅ เพิ่ม
    if (key.startsWith('patchkb:')) return (sumData.lastPatchKBMap || {})[key.slice(8)] || [];
    if (key.startsWith('location:')) return (sumData.locationMap || {})[key.slice(9)] || [];
    if (key === 'inactive') return sumData.inactive || [];

    return [];
  };

  const onSearchInput = (e) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };

  const toggleFilter = (key, label) => {
    setFilterKeys(prev => {
      if (prev.find(p => p.key === key)) return prev.filter(p => p.key !== key);
      return [...prev, { key, label }];
    });
    setPage(1);
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPage(1);
  };

  const toggleSoftwareSort = (key) => {
    if (softwareSortKey === key) setSoftwareSortAsc(prev => !prev);
    else { setSoftwareSortKey(key); setSoftwareSortAsc(true); }
    setSoftwarePage(1);
  };

  const filteredData = useMemo(() => {
    let result = [...invData];
    if (filterKeys.length > 0) {
      const allHostSets = filterKeys.map(fk => new Set(getHostsForKey(fk.key)));
      const intersection = allHostSets.reduce((acc, set) => new Set([...acc].filter(x => set.has(x))));
      result = result.filter(d => intersection.has(d.hostname));
    }

    if (searchQuery.length === 1) {
      const q = searchQuery.toLowerCase();
      if (searchFieldType === 'all') {
        result = result.filter(d => Object.values(d).join(' ').toLowerCase().includes(q));
      } else {
        result = result.filter(d => {
          const fieldValue = (d[searchFieldType] || '').toString().toLowerCase();
          return fieldValue.includes(q);
        });
      }
    }

    result.sort((a, b) => {
      const aVal = (a[sortKey] || '').toString().toLowerCase();
      const bVal = (b[sortKey] || '').toString().toLowerCase();
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
    return result;
  }, [invData, filterKeys, searchQuery, searchFieldType, sortKey, sortAsc, sumData]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentList = filteredData.slice((page - 1) * pageSize, page * pageSize);

const showToast = (msg) => {
  const isError = msg.startsWith('❌');
  const cleanMsg = msg.replace(/^(✓|❌)\s*/, '');
  setAlertModal({
    isOpen: true,
    type: isError ? 'error' : 'success',
    title: isError ? 'เกิดข้อผิดพลาด' : 'สำเร็จ',
    message: cleanMsg,
  });
};

const saveAsset = async () => {
    const asset = (modalData.assetInput || '').trim();
    if (asset && !/^[A-Za-z0-9\-_.]+$/.test(asset)) {
      // ข้อความ validation แสดงอยู่ใต้ input ในโมดัลอยู่แล้ว ไม่ต้อง alert ซ้ำ
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/pc-inventory/${encodeURIComponent(modalData.hostname)}/asset`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fix_asset: asset }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast('✓ บันทึกข้อมูล Fix Asset เรียบร้อย');
      setShowAssetModal(false); fetchDetail(modalData.hostname);
    } catch (err) {
      showToast(`❌ ${err.message}`);
    }
  };

const saveBl = async () => {
    try {
      const res = await fetch(`${API_BASE}/pc-inventory/${encodeURIComponent(modalData.hostname)}/bitlocker`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bitlocker_key_c: modalData.keyC, bitlocker_key_d: modalData.keyD, bitlocker_pin: modalData.pin }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast('✓ บันทึกข้อมูล BitLocker เรียบร้อย');
      setShowBlModal(false); fetchDetail(modalData.hostname);
    } catch (err) {
      showToast(`❌ ${err.message}`);
    }
  };

// ตั้งชื่อไฟล์ตอนบันทึก PDF เป็น "hostname_user ล่าสุด" (browser ใช้ document.title เป็นชื่อไฟล์)
const printDetail = () => {
  const prevTitle = document.title;
  const host = detailData.inv?.hostname || '';
  const user = sessionView[0]?.username || '';
  const name = [host, user].filter(Boolean).join('_').replace(/[\\/:*?"<>|]/g, '-');
  document.title = name || prevTitle;
  const restore = () => {
    document.title = prevTitle;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
};

const saveWarranty = async () => {
    try {
      const res = await fetch(`${API_BASE}/pc-inventory/${encodeURIComponent(modalData.hostname)}/warranty`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warranty_package: modalData.warrantyPkg, warranty_expire_date: modalData.warrantyDate }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast('✓ บันทึกข้อมูลประกันเรียบร้อย');
      setShowWarrantyModal(false); fetchDetail(modalData.hostname);
    } catch (err) {
      showToast(`❌ ${err.message}`);
    }
  };

const saveBulkWarranty = async () => {
    try {
      const res = await fetch(`${API_BASE}/pc-inventory-bulk/warranty`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostnames: [...selectedHosts],
          warranty_package: modalData.warrantyPkg,
          warranty_expire_date: modalData.warrantyDate,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast(`✓ ตั้งค่าประกันให้ ${data.updated} เครื่องเรียบร้อย`);
      setShowBulkWarrantyModal(false);
      setSelectedHosts(new Set());
      fetchData();
    } catch (err) {
      showToast(`❌ ${err.message}`);
    }
  };

  const toggleHost = (hn) => {
    setSelectedHosts(prev => {
      const next = new Set(prev);
      if (next.has(hn)) next.delete(hn);
      else next.add(hn);
      return next;
    });
  };

  // เลือก/ยกเลิกทั้งหน้าที่แสดงอยู่
  const togglePageHosts = () => {
    const pageHosts = currentList.map(d => d.hostname);
    const allOn = pageHosts.length > 0 && pageHosts.every(h => selectedHosts.has(h));
    setSelectedHosts(prev => {
      const next = new Set(prev);
      pageHosts.forEach(h => { if (allOn) next.delete(h); else next.add(h); });
      return next;
    });
  };

const confirmDelete = async () => {
    try {
      const res = await fetch(`${API_BASE}/pc-inventory/${encodeURIComponent(modalData.hostname)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setShowDeleteModal(false); setView('list'); setHostname(null);
      showToast('✓ ลบข้อมูลเรียบร้อย');
    } catch (err) {
      showToast(`❌ ${err.message}`);
    }
  };

  const togglePcStatus = async () => {
  const newStatus = detailData.inv.pc_status === 'Inactive' ? 'Active' : 'Inactive';
  try {
    const res = await fetch(`${API_BASE}/pc-inventory/${encodeURIComponent(hostname)}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pc_status: newStatus }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast(`✓ เปลี่ยนสถานะเป็น ${newStatus === 'Inactive' ? 'ไม่ได้ใช้งาน' : 'ใช้งานปกติ'}`);
    fetchDetail(hostname);
  } catch (err) { showToast(`❌ ${err.message}`); }
};


  const exportFilteredList = (source = filteredData, tag = null) => {
    try {
      if (source.length === 0) { showToast('❌ ไม่มีข้อมูลที่จะ export'); return; }
      const wb = XLSX.utils.book_new();
      const headers = [
        'Hostname', 'IP Address', 'User', 'Fix Asset', 'Computer Type',
        'Serial Number', 'OS', 'OS Build', 'BitLocker',
        'CrowdStrike Ver', 'Tanium Ver', 'UEMS Ver', 'Warranty Package', 'Warranty Expire', 'Last Updated',
      ];
      const rows = source.map(d => [
        d.hostname || '',
        d.ip_address || '',
        d.active_usernames || '',
        d.fix_asset || '',
        d.computer_type || '',
        d.serial_number || '',
        `${d.os_name || ''} ${d.os_release || ''}`.trim(),
        d.os_build || '',
        d.bitlocker || '',
        d.crowdstrike_ver || '',
        d.tanium_ver || '',
        d.uems_ver || '',
        d.warranty_package || '',
        fmtDateYMD(d.warranty_expire_date),
        d.updated_at ? new Date(d.updated_at).toLocaleString('th-TH') : '',
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = headers.map((h, i) => ({
        wch: Math.max(h.length, ...rows.map(r => String(r[i] || '').length), 10),
      }));
      XLSX.utils.book_append_sheet(wb, ws, 'PC Inventory');
      const label = tag || (filterKeys.length > 0 ? `_${filterKeys.map(k => k.label).join('+')}` : '_all');
      const filename = `pc_inventory${label}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast(`✓ Export สำเร็จ: ${filename} (${source.length} รายการ)`);
    } catch (err) {
      console.error('Export list error:', err);
      showToast(`❌ Export ล้มเหลว: ${err.message}`);
    }
  };

  const exportPCDetail = () => {
    try {
      if (!detailData.inv) { showToast('❌ ไม่มีข้อมูล PC ที่จะ export'); return; }
      const wb = XLSX.utils.book_new();

      // ส่งออกทุกฟิลด์ที่ API คืนมา (ไม่ตัดฟิลด์ใด ๆ ออก)
      const invFields = [
        ['Field', 'Value'],
        ...Object.entries(detailData.inv).map(([k, v]) => [k, toCellValue(v)]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invFields), 'PC Info');

      const historyRows = [
        ['Changed At', 'Change Type', 'Field', 'Old Value', 'New Value'],
        ...historyData.map(h => [
          h.changed_at || '', h.change_type || '', h.field_name || '',
          toCellValue(h.old_value), toCellValue(h.new_value),
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(historyRows), 'History');

      const usersData = [
        ['Username', 'Session Name', 'Session ID', 'State', 'Logon Time'],
        ...detailData.users.map(u => [
          u.username || '—', u.session_name || '—', u.session_id || '—',
          u.state || '—', u.logon_time || '—',
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(usersData), 'Active Users');

      const softData = [
        ['Name', 'Version', 'Publisher', 'Install Location', 'Size (MB)'],
        ...detailData.software.map(s => [
          s.name || '—', s.version || '—', s.publisher || '—',
          s.install_location || '—', s.size_mb || '—',
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(softData), 'Software');

      const filename = `${hostname}_inventory_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast(`✓ Export สำเร็จ: ${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      showToast(`❌ Export ล้มเหลว: ${err.message}`);
    }
  };

const fmtDate = (d) => {  
  const dt = parseDate(d);  
  if (!dt) return d || '—';  
  
  return dt.toLocaleString('th-TH', {    
    day: 'numeric', 
    month: 'numeric', 
    year: 'numeric',    
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
};

const fmtDateOnly = (d) => {
  const dt = parseDate(d);
  if (!dt) return d || '—';
  const date = dt.toLocaleDateString('th-TH');
  const time = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};


  const isNotebookType = (inv) => {
    const t = (inv?.computer_type || '').toLowerCase();
    return /notebook|laptop|portable|sub notebook|convertible|detachable/.test(t);
  };

  const StatBox = ({ id, label, list, bgClass, textClass, ringClass, onSecondaryClick }) => {
    const isOn = filterKeys.find(k => k.key === id);
    const count = list?.length || 0;
    const clickable = count > 0 || isOn;
    return (
      <div
        onClick={() => { if (clickable) toggleFilter(id, label); }}
        className={`bg-white border rounded-xl p-3 px-3.5 shadow-sm transition-all 
        ${clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : 'opacity-70'} 
        ${isOn ? `${ringClass} ring-2 ring-offset-2 scale-100 ${bgClass}` : 'border-gray-200'}`}
      >
        <div className="text-xs font-medium text-gray-500 mb-2 flex items-center justify-between">
          {label}
          {onSecondaryClick && count > 0 && (
            <span
              onClick={e => { e.stopPropagation(); onSecondaryClick(); }}
              className="text-[10px] text-purple-500 hover:text-purple-700 font-semibold bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5 transition-colors"
            >Detail</span>
          )}
        </div>
        <div className={`text-2xl font-bold leading-none ${textClass}`}>{count}</div>
        {clickable ? (
          <div className="text-[11px] text-gray-400 mt-1.5">{isOn ? '✕ คลิกซ้ำเพื่อล้าง' : '☞ คลิกเพื่อ filter'}</div>
        ) : (
          <div className="text-[11px] text-transparent mt-1.5 select-none">-</div>
        )}
      </div>
    );
  };

  const SumTag = ({ id, label, list, btnClass }) => {
    const isOn = filterKeys.find(k => k.key === id);
    const count = list?.length || 0;
    if (count === 0 && !isOn) return null;
    return (
      <div
        onClick={() => toggleFilter(id, label)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all border select-none 
        hover:-translate-y-[1px] shadow-sm
        ${btnClass} 
        ${isOn ? 'ring-2 ring-offset-1 border-transparent shadow-md filter contrast-125' : ''}`}
      >
        <span>{label}</span>
        <span className="bg-black/10 rounded-md px-1.5 py-[1px] text-[10px] tabular-nums">{count}</span>
      </div>
    );
  };

  const softwareFiltered = useMemo(() => {
    let result = detailData.software.filter(s => {
      if (!softwareSearch) return true;
      const q = softwareSearch.toLowerCase();
      return (s.name || '').toLowerCase().includes(q)
        || (s.version || '').toLowerCase().includes(q)
        || (s.publisher || '').toLowerCase().includes(q);
    });
    result.sort((a, b) => {
      const aVal = (a[softwareSortKey] || '').toString().toLowerCase();
      const bVal = (b[softwareSortKey] || '').toString().toLowerCase();
      if (aVal < bVal) return softwareSortAsc ? -1 : 1;
      if (aVal > bVal) return softwareSortAsc ? 1 : -1;
      return 0;
    });
    return result;
  }, [detailData.software, softwareSearch, softwareSortKey, softwareSortAsc]);


const sessionView = useMemo(() => {
  const score = (x) => (x.logon_time ? 2 : 0) + (x.state?.toUpperCase() === 'ACTIVE' ? 1 : 0);
  const map = new Map();
  (detailData.users || []).forEach(u => {
    if (isSystemAccount(u.username)) return;
    const key = normalizeUser(u.username);
    const prev = map.get(key);
    if (!prev || score(u) > score(prev)) map.set(key, u);
  });
  
  // ✅ เรียงลำดับให้คนที่ logon_time ล่าสุด (ใหม่สุด) ขึ้นมาอยู่บนสุดเสมอ
  return [...map.values()].sort((a, b) => {
    const timeA = parseDate(a.logon_time)?.getTime() || 0;
    const timeB = parseDate(b.logon_time)?.getTime() || 0;
    return timeB - timeA;
  });
}, [detailData.users]);


  const currentSearchPlaceholder = SEARCH_FIELD_OPTIONS.find(o => o.value === searchFieldType)?.placeholder
    || SEARCH_FIELD_OPTIONS[0].placeholder;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
        <button
          onClick={() => setInventoryType('pc')}
          className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${inventoryType === 'pc' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}
        >💻 PC INVENTORY</button>
        <button
          onClick={() => setInventoryType('mo')}
          className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${inventoryType === 'mo' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}
        >🖥️ MONITOR INVENTORY</button>
      </motion.div>

      {inventoryType === 'pc' && (
        <>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <h2 className="text-3xl font-black text-slate-800">PC INVENTORY</h2>
              <p className="text-slate-500 font-medium">ระบบบริหารจัดการและตรวจสอบสถานะคอมพิวเตอร์แบบเรียลไทม์</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-3 py-1.5 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Live Monitor
              </div>
              <button
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all bg-white border border-slate-200 text-slate-600 hover:border-indigo-500 hover:text-indigo-600 shadow-sm hover:shadow active:scale-95"
                onClick={view === 'list' ? fetchData : () => fetchDetail(hostname)}
              >
                <RefreshCw size={16} className={loading || detailLoading ? 'animate-spin text-indigo-500' : ''} /> Refresh
              </button>
            </div>
          </motion.div>

          <div className="animate-in fade-in duration-300">

            {view === 'list' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {error && <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-[13px] text-red-600 mb-4 font-semibold">⚠️ {error}</div>}

                <div className="animate-in fade-in">
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-3">
                    <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 mb-2">ทั้งหมด</div>
                      <div className="text-2xl font-bold leading-none text-blue-600">{invData.length}</div>
                    </div>
                    <StatBox id="inactive" label="ไม่ได้ใช้งาน" list={sumData?.inactive} textClass="text-gray-500" bgClass="bg-gray-100" ringClass="ring-gray-400" />
                    <StatBox id="multiLogin" label="Multi-Login Users" list={multiLoginData.allHostnames} textClass="text-purple-600" bgClass="bg-purple-50" ringClass="ring-purple-500" onSecondaryClick={() => setShowMultiLoginModal(true)} />
                    <StatBox id="possiblyRenamed" label="อาจถูกลงใหม่/เปลี่ยนชื่อ" list={reincarnatedData.allHostnames} textClass="text-orange-600" bgClass="bg-orange-50" ringClass="ring-orange-500" onSecondaryClick={() => setShowReincarnatedModal(true)} />
                    <StatBox id="inactivePC" label="Inactive > 1 Month" list={sumData?.inactivePC} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />

                    <StatBox id="noEdr" label="No EDR" list={sumData?.noEdr} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="noTanium" label="No Tanium" list={sumData?.noTanium} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="noUems" label="No UEMS" list={sumData?.noUems} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="blDisabled" label="BitLocker Off" list={sumData?.blDisabled} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
                    <StatBox id="noBlKeyNotebook" label="No BitLocker Key" list={sumData?.noBlKeyNotebook} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
                    <StatBox id="localAdmin" label="มี Local Admin" list={sumData?.localAdmin} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="noRecentPatch" label="Patch ค้างเกิน 30 วัน" list={sumData?.noRecentPatch} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />

                    <StatBox id="lowBatteryHealth" label="Battery Health < 70%" list={sumData?.lowBatteryHealth} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
                    <StatBox id="lowDiskCSpace" label="Disk C Free < 20GB" list={sumData?.lowDiskCSpace} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="diskSmartWarn" label="Disk SMART เตือน" list={sumData?.diskSmartWarn} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="longUptime" label="Uptime > 5 วัน" list={sumData?.longUptime} textClass="text-sky-600" bgClass="bg-sky-50" ringClass="ring-sky-500" />

                    <StatBox id="noAsset" label="No Fix Asset" list={sumData?.noAsset} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
                    <StatBox id="oldFixAssets" label="Old Fix Assets" list={sumData?.oldFixAssets} textClass="text-orange-600" bgClass="bg-orange-50" ringClass="ring-orange-500" />
                    <StatBox id="noLocation" label="No Location" list={sumData?.noLocation} textClass="text-purple-600" bgClass="bg-purple-50" ringClass="ring-purple-500" />
                    <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 mb-2 flex items-center justify-between gap-2">
                        <span>Warranty</span>
                        <div className="flex items-center gap-1.5">
                          {[
                            { id: 'warrantyRecorded', label: 'บันทึกแล้ว', list: warrantySummary.recorded, activeCls: 'bg-blue-50 border-blue-400 text-blue-700' },
                            { id: 'warrantyNone', label: 'ยังไม่บันทึก', list: warrantySummary.none, activeCls: 'bg-gray-100 border-gray-400 text-gray-700' },
                          ].map(item => (
                            <button
                              key={item.id}
                              onClick={() => toggleFilter(item.id, item.label)}
                              className={`text-[11px] border rounded px-1.5 py-0.5 transition-colors ${filterKeys.some(k => k.key === item.id) ? item.activeCls : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                            >
                              {item.label} ({item.list.length})
                            </button>
                          ))}
                          <select
                            value={warrantyDays}
                            onChange={e => setWarrantyDays(Number(e.target.value))}
                            className="text-[11px] border border-gray-200 rounded px-1 py-0.5 text-gray-600 bg-white outline-none"
                          >
                            {[30, 60, 90].map(n => <option key={n} value={n}>ใกล้หมด {n} วัน</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'warrantyExpiring', label: `ใกล้หมด ≤${warrantyDays} วัน`, list: warrantySummary.expiring, textCls: 'text-amber-600', ringCls: 'ring-amber-500', bgCls: 'bg-amber-50' },
                          { id: 'warrantyExpired', label: 'หมดประกันแล้ว', list: warrantySummary.expired, textCls: 'text-red-600', ringCls: 'ring-red-500', bgCls: 'bg-red-50' },
                          { id: 'warrantyNone', label: 'ไม่มีข้อมูลประกัน', list: warrantySummary.none, textCls: 'text-gray-500', ringCls: 'ring-gray-400', bgCls: 'bg-gray-100' },
                        ].map(item => {
                          const isOn = filterKeys.find(k => k.key === item.id);
                          return (
                            <div
                              key={item.id}
                              onClick={() => toggleFilter(item.id, item.label)}
                              className={`cursor-pointer rounded-lg p-2 border transition-all hover:-translate-y-0.5 ${isOn ? `${item.ringCls} ring-2 ${item.bgCls} border-transparent` : 'border-gray-200'}`}
                            >
                              <div className="text-[11px] text-gray-500 leading-tight">{item.label}</div>
                              <div className={`text-xl font-bold leading-none mt-1 ${item.textCls}`}>{item.list.length}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {sumData && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-4">
                      {(() => {
                        const verMap = sumData.osVersionMap || {};
                        const buildMap = sumData.osBuildMap || {};
                        const toItems = (map, prefix) => Object.keys(map)
                          .map(k => ({ id: `${prefix}:${k}`, label: k, count: map[k].length, warn: /unknown/i.test(k) }))
                          .sort((a, b) => b.count - a.count);
                        const total = (map) => Object.values(map).reduce((s, arr) => s + arr.length, 0);
                        return (
                          <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                            <RankedCard
                              bare
                              title="OS Version"
                              countLabel={`${total(verMap)} เครื่อง`}
                              items={toItems(verMap, 'os')}
                              expanded={showAllOsVersion}
                              onToggle={() => setShowAllOsVersion(v => !v)}
                              palette={['#6366f1', '#818cf8', '#a5b4fc', '#4f46e5', '#4338ca']} text="text-indigo-700" hover="hover:bg-indigo-50" active="bg-indigo-50 ring-1 ring-indigo-300"
                              isActive={id => filterKeys.some(f => f.key === id)}
                              onItemClick={(id, label) => toggleFilter(id, label)}
                            />
                            <RankedCard
                              bare
                              title="OS Build"
                              countLabel={`${total(buildMap)} เครื่อง`}
                              items={toItems(buildMap, 'build')}
                              expanded={showAllOsBuild}
                              onToggle={() => setShowAllOsBuild(v => !v)}
                              palette={['#8b5cf6', '#a78bfa', '#c4b5fd', '#7c3aed', '#6d28d9']} text="text-violet-700" hover="hover:bg-violet-50" active="bg-violet-50 ring-1 ring-violet-300"
                              isActive={id => filterKeys.some(f => f.key === id)}
                              onItemClick={(id, label) => toggleFilter(id, label)}
                            />
                          </div>
                        );
                      })()}
                      {(() => {
                        const csMap = sumData.crowdstrikeVerMap || {};
                        const taMap = sumData.taniumVerMap || {};
                        const toItems = (map, prefix) => Object.keys(map)
                          .map(k => ({ id: `${prefix}:${k}`, label: k, count: map[k].length, warn: /not installed|unknown/i.test(k) }))
                          .sort((a, b) => b.count - a.count);
                        const total = (map) => Object.values(map).reduce((s, arr) => s + arr.length, 0);
                        return (
                          <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                            <RankedCard
                              bare
                              title="CrowdStrike Version"
                              countLabel={`${total(csMap)} เครื่อง`}
                              items={toItems(csMap, 'cs')}
                              expanded={showAllCs}
                              onToggle={() => setShowAllCs(v => !v)}
                              palette={['#14b8a6', '#2dd4bf', '#5eead4', '#0d9488', '#0f766e']} text="text-teal-700" hover="hover:bg-teal-50" active="bg-teal-50 ring-1 ring-teal-300"
                              isActive={id => filterKeys.some(f => f.key === id)}
                              onItemClick={(id, label) => toggleFilter(id, label)}
                            />
                            <RankedCard
                              bare
                              title="Tanium Version"
                              countLabel={`${total(taMap)} เครื่อง`}
                              items={toItems(taMap, 'tanium')}
                              expanded={showAllTanium}
                              onToggle={() => setShowAllTanium(v => !v)}
                              palette={['#f97316', '#fb923c', '#fdba74', '#ea580c', '#c2410c']} text="text-orange-700" hover="hover:bg-orange-50" active="bg-orange-50 ring-1 ring-orange-300"
                              isActive={id => filterKeys.some(f => f.key === id)}
                              onItemClick={(id, label) => toggleFilter(id, label)}
                            />
                          </div>
                        );
                      })()}
                    </div>
                    
                  )}
                  {/* ✅ Last Patch KB, Location, Notebook, Desktop แถวเดียวกัน คลิกแถวเพื่อ filter */}
                  {sumData && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 mb-4">
                      <RankedCard
                        title="Last Patch KB"
                        items={Object.keys(sumData.lastPatchKBMap || {})
                          .map(k => ({ id: `patchkb:${k}`, label: k, count: sumData.lastPatchKBMap[k].length }))
                          .sort((a, b) => b.count - a.count)}
                        expanded={showAllPatch}
                        onToggle={() => setShowAllPatch(v => !v)}
                        palette={['#f59e0b', '#fbbf24', '#fcd34d', '#d97706', '#b45309']} text="text-amber-700" hover="hover:bg-amber-50" active="bg-amber-50 ring-1 ring-amber-300"
                        isActive={id => filterKeys.some(f => f.key === id)}
                        onItemClick={(id, label) => toggleFilter(id, label)}
                      />
                      <RankedCard
                        title="Location / โซน"
                        items={Object.keys(sumData.locationMap || {})
                          .map(k => ({ id: `location:${k}`, label: k, count: sumData.locationMap[k].length }))
                          .sort((a, b) => b.count - a.count)}
                        expanded={showAllLocation}
                        onToggle={() => setShowAllLocation(v => !v)}
                        palette={['#ec4899', '#f472b6', '#f9a8d4', '#db2777', '#be185d']} text="text-pink-700" hover="hover:bg-pink-50" active="bg-pink-50 ring-1 ring-pink-300"
                        isActive={id => filterKeys.some(f => f.key === id)}
                        onItemClick={(id, label) => toggleFilter(id, label)}
                      />
                      {[
                        { type: 'Notebook', palette: ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8'], text: 'text-blue-700', hover: 'hover:bg-blue-50', active: 'bg-blue-50 ring-1 ring-blue-300', expanded: showAllNotebook, onToggle: () => setShowAllNotebook(v => !v) },
                        { type: 'Desktop', palette: ['#10b981', '#34d399', '#6ee7b7', '#059669', '#047857'], text: 'text-emerald-700', hover: 'hover:bg-emerald-50', active: 'bg-emerald-50 ring-1 ring-emerald-300', expanded: showAllDesktop, onToggle: () => setShowAllDesktop(v => !v) },
                      ].map(c => {
                        const hosts = (sumData.computerTypeMap || {})[c.type] || [];
                        const models = (sumData.modelByType || {})[c.type] || {};
                        return (
                          <RankedCard
                            key={c.type}
                            title={c.type}
                            countLabel={`${hosts.length} เครื่อง`}
                            items={Object.keys(models)
                              .map(k => ({ id: `model:${k}`, label: shortModelName(k), count: models[k].length }))
                              .sort((a, b) => b.count - a.count)}
                            expanded={c.expanded}
                            onToggle={c.onToggle}
                            onTitleClick={() => toggleFilter(`type:${c.type}`, c.type)}
                            titleOn={filterKeys.some(f => f.key === `type:${c.type}`)}
                            palette={c.palette} text={c.text} hover={c.hover} active={c.active}
                            isActive={id => filterKeys.some(f => f.key === id)}
                            onItemClick={(id, label) => toggleFilter(id, label)}
                          />
                        );
                      })}
                    </div>
                  )}

                  <div
                    ref={filterBarRef}
                    className="flex flex-wrap items-center gap-2 mb-3"
                  >
                    {filterKeys.length > 0 && (
                      <div className="flex flex-1 items-center gap-2 bg-[#eff4ff] border border-[#bfcfff] rounded-xl px-3.5 py-2 text-[13px] font-medium text-[#2563eb] shadow-sm backdrop-blur-sm">
                        ☞ Filter: <b>{filterKeys.map(k => k.label).join(' + ')}</b>
                        <span className="text-gray-500 text-xs ml-1">({filteredData.length} เครื่อง)</span>
                        <button
                          onClick={() => setFilterKeys([])}
                          className="ml-auto bg-transparent border border-[#bfcfff] px-2 py-0.5 rounded flex items-center gap-1 text-xs hover:bg-[#bfcfff] transition-colors"
                        ><X size={12} /> ล้าง</button>
                      </div>
                    )}

                    <button
                      onClick={() => exportFilteredList()}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 shadow-sm transition-all active:scale-95 whitespace-nowrap"
                    >
                      <Download size={14} />
                      Export {filterKeys.length > 0 ? `(${filteredData.length})` : 'All'}
                    </button>
                  </div>

                    <div className="relative mb-3 flex w-full gap-2">

                    {/* ✅ NEW: Search field dropdown — driven by SEARCH_FIELD_OPTIONS */}
                    <select
                      value={searchFieldType}
                      onChange={(e) => { setSearchFieldType(e.target.value); setPage(1); }}
                      className="bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-[13px] font-medium text-gray-700 outline-none shadow-sm focus:border-blue-500 transition-colors shrink-0 cursor-pointer"
                    >
                      {SEARCH_FIELD_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>

                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Search size={15} /></div>
                      <input
                        type="text"
                        placeholder={currentSearchPlaceholder}
                        className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-9 pr-4 text-[13px] outline-none shadow-sm focus:border-blue-500 transition-colors"
                        value={searchQuery}
                        onChange={onSearchInput}
                      />
                      {searchQuery.length >= 2 && searchQuery !== debouncedSearch && (
                        <div className="absolute inset-y-0 right-8 flex items-center">
                          <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                        </div>
                      )}
                      {searchQuery && (
                        <button
                          onClick={() => onSearchInput({ target: { value: '' } })}
                          className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-red-500 transition-colors">
                          <X size={13} strokeWidth={3} />
                        </button>
                      )}
                    </div>
                  </div>

                  {selectedHosts.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 bg-[#eff4ff] border border-[#bfcfff] rounded-xl px-3.5 py-2 mb-3 text-[13px] font-medium text-[#2563eb] shadow-sm">
                      ☑ เลือกแล้ว <b>{selectedHosts.size}</b> เครื่อง
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => { setModalData({ warrantyPkg: '', warrantyDate: '' }); setShowBulkWarrantyModal(true); }}
                          className="bg-white border border-[#bfcfff] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#dbeafe] transition-colors"
                        >🛡️ ตั้งค่าประกัน</button>
                        <button
                          onClick={() => exportFilteredList(filteredData.filter(d => selectedHosts.has(d.hostname)), '_selected')}
                          className="bg-white border border-[#bfcfff] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#dbeafe] transition-colors flex items-center gap-1.5"
                        ><Download size={12} /> Export เฉพาะที่เลือก</button>
                        <button
                          onClick={() => setSelectedHosts(new Set())}
                          className="bg-transparent border border-[#bfcfff] px-2 py-1.5 rounded-lg text-xs hover:bg-[#bfcfff] transition-colors flex items-center gap-1"
                        ><X size={12} /> ล้างการเลือก</button>
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3 w-8">
                              <input
                                type="checkbox"
                                aria-label="เลือกทั้งหน้า"
                                className="cursor-pointer"
                                checked={currentList.length > 0 && currentList.every(d => selectedHosts.has(d.hostname))}
                                onChange={togglePageHosts}
                              />
                            </th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('hostname')}>Hostname {sortKey === 'hostname' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('ip_address')}>IP Address {sortKey === 'ip_address' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('active_usernames')}>User {sortKey === 'active_usernames' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('fix_asset')}>Fix Asset {sortKey === 'fix_asset' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('computer_type')}>Computer Type {sortKey === 'computer_type' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('serial_number')}>Serial Number {sortKey === 'serial_number' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('os_name')}>OS {sortKey === 'os_name' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('logon_time')}>Update At {sortKey === 'logon_time' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('warranty_expire_date')}>Warranty {sortKey === 'warranty_expire_date' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('bitlocker')}>BitLocker {sortKey === 'bitlocker' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {loading ? (
                            <tr><td colSpan="12"><div className="text-center py-12 text-gray-500 flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div> กำลังโหลดข้อมูล...</div></td></tr>
                          ) : currentList.length === 0 ? (
                            <tr><td colSpan="12"><div className="text-center py-12 text-sm text-gray-400">🖥️ ไม่พบข้อมูล</div></td></tr>
                          ) : currentList.map(d => (
                            <tr key={d.hostname}
  className={`hover:bg-[#eff4ff] cursor-pointer transition-colors group ${d.pc_status === 'Inactive' ? 'opacity-50' : ''}`}
  onClick={() => { setHostname(d.hostname); setView('detail'); }}>
                              <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  aria-label={`เลือก ${d.hostname}`}
                                  className="cursor-pointer"
                                  checked={selectedHosts.has(d.hostname)}
                                  onChange={() => toggleHost(d.hostname)}
                                />
                              </td>
                              <td className="py-2 px-3 text-[13px] font-medium text-gray-900">{d.hostname || '—'}</td>
                              <td className="py-2 px-3 text-[13px] font-mono text-gray-900 font-medium">{d.ip_address || '—'}</td>
                              <td className="py-2 px-3 text-[13px] font-medium text-blue-600">
                                {(() => {
                                  const raw = d.active_usernames || '';
                                  if (!raw) return '—';
                                  const skip = /^(UMFD|DWM|NT AUTHORITY|NETWORK|LOCAL|SYSTEM|ANONYMOUS)/i;
                                  const found = raw.split(',').map(u => {
                                    return u.trim()
                                      .replace(/^[^\\]*\\/, '')
                                      .replace(/\$$/, '')
                                      .trim();
                                  }).find(u => {
                                    if (!u) return false;
                                    if (skip.test(u)) return false;
                                    if (u.toLowerCase() === (d.hostname || '').toLowerCase()) return false;
                                    if (/^[A-Z0-9]+-[A-Z0-9_-]+$/i.test(u) && !u.includes('.')) return false;
                                    return true;
                                  });
                                  return found || '—';
                                })()}
                              </td>
                              <td className="py-2 px-3 text-[13px] font-mono text-purple-600 font-medium">{d.fix_asset || '—'}</td>
                              <td className="py-2 px-3 text-[13px] text-gray-600">{d.computer_type || '—'}</td>
                              <td className="py-2 px-3 text-[13px] font-mono text-gray-600">{d.serial_number || '—'}</td>
                              <td
                                className="py-2 px-3 text-[13px] text-gray-600"
                                title={`${d.os_name || ''} ${d.os_release || ''}${d.os_build ? ` (Build ${d.os_build})` : ''}`.trim()}
                              >{shortOsName(d.os_name) || '—'} {d.os_release || ''}</td>
                              <td className="py-2 px-3 text-[13px] text-gray-600">{fmtDateOnly(d.updated_at)}</td>
                              <td className="py-2 px-3">
                                {(() => {
                                  const w = getWarranty(d.warranty_expire_date);
                                  if (w.status === 'none') return <span className="text-[13px] text-gray-400">—</span>;
                                  const cls = w.status === 'expired'
                                    ? 'bg-red-100 text-red-700'
                                    : w.days <= warrantyDays ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
                                  return (
                                    <div>
                                      <div className="text-[11px] leading-tight text-gray-600">{d.warranty_package || '—'}</div>
                                      <span className={`inline-block mt-0.5 px-1.5 py-px rounded-full text-[9px] leading-tight font-bold ${cls}`}>{warrantyLabel(d.warranty_expire_date)}</span>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="py-2 px-3">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${d.bitlocker === 'Enabled' ? 'bg-green-100 text-green-700' : d.bitlocker === 'Disabled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${d.bitlocker === 'Enabled' ? 'bg-green-500' : d.bitlocker === 'Disabled' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                                  {d.bitlocker || '—'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right text-gray-400 font-bold group-hover:text-blue-500">›</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500 bg-white">
                      <span>{(page - 1) * pageSize + (filteredData.length ? 1 : 0)}–{Math.min(page * pageSize, filteredData.length)} จาก {filteredData.length} รายการ</span>
                      <div className="flex gap-1.5">
                        <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors" disabled={page <= 1} onClick={() => setPage(page - 1)}>← ก่อน</button>
                        <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>ถัดไป →</button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'detail' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="animate-in fade-in">
                <button
                  className="flex items-center gap-2 bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 mb-5 transition-all"
                  onClick={() => { setView('list'); setHostname(null); }}
                ><ChevronLeft size={16} /> กลับหน้ารายการ</button>

                {detailLoading ? (
                  <div className="flex justify-center items-center py-16 text-gray-500 text-sm gap-2">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div> กำลังโหลด {hostname}...
                  </div>
                ) : error ? (
                  <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-[13.5px] text-red-600 mb-4 font-semibold">⚠️ {error}</div>
                ) : detailData.inv ? (
                  <>
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-5 flex flex-wrap items-center gap-5">
                      <div className="w-14 h-14 rounded-[14px] bg-[#eff4ff] border border-[#bfcfff] flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                        {detailData.inv.image_url ? (
                          <img
                            src={getFullImageUrl(detailData.inv.image_url)}
                            alt={hostname}
                            className="w-full h-full object-cover rounded-[12px]"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              const span = document.createElement('span');
                              span.innerText = (detailData.inv.computer_type || '').toLowerCase().includes('notebook') ? '💻' : '🖥️';
                              span.className = "text-[26px]";
                              e.target.parentNode.appendChild(span);
                            }}
                          />
                        ) : (
                          <span className="text-[26px]">
                            {(detailData.inv.computer_type || '').toLowerCase().includes('notebook') ? '💻' : (detailData.inv.computer_type || '').toLowerCase().includes('tablet') ? '📱' : '🖥️'}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <div className="text-[20px] font-bold text-gray-900 mb-1">{hostname}</div>
                        <div className="text-[13px] text-gray-500 mb-2.5 tracking-tight">{detailData.inv.manufacturer || '—'} {detailData.inv.model || ''} &nbsp;·&nbsp; {detailData.inv.ip_address || '—'}</div>
                        <div className="flex flex-wrap gap-1.5 text-[12px] font-medium text-gray-600">
                          {detailData.inv.computer_type && <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.computer_type}</span>}
                          <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.os_name || '—'}</span>
                          <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.os_arch || '—'}</span>
                          {detailData.inv.ram_gb && <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">RAM {detailData.inv.ram_gb} GB</span>}
                          <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.cpu_cores || '?'} Cores</span>
                          <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{sessionView.length} Users</span>
                          {detailData.inv.bitlocker === 'Enabled' && <span className="bg-green-50 border border-green-200 text-green-700 rounded-md px-2.5 py-1">BitLocker ON</span>}
                          {detailData.inv.bitlocker === 'Disabled' && <span className="bg-red-50 border border-red-200 text-red-700 rounded-md px-2.5 py-1">BitLocker OFF</span>}
                          {detailData.inv.fix_asset && <span className="bg-blue-50 border border-blue-200 text-blue-600 rounded-md px-2.5 py-1">Asset: {detailData.inv.fix_asset}</span>}
                        </div>
                      </div>
                      
         <div className="flex items-center gap-2">
  <button
    className="bg-[#eff4ff] text-[#2563eb] border border-[#bfcfff] hover:bg-[#dbeafe] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors"
    onClick={() => { setModalData({ hostname, assetInput: detailData.inv.fix_asset }); setShowAssetModal(true); }}
  >Edit Asset</button>

  <button
    className="bg-[#eff4ff] text-[#2563eb] border border-[#bfcfff] hover:bg-[#dbeafe] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors"
    onClick={() => setShowLocationModal(true)}
  >📍 Edit Location</button>

  <button
    className="bg-[#eff4ff] text-[#2563eb] border border-[#bfcfff] hover:bg-[#dbeafe] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors"
    onClick={() => { setModalData({ hostname, warrantyPkg: detailData.inv.warranty_package || '', warrantyDate: detailData.inv.warranty_expire_date ? detailData.inv.warranty_expire_date.slice(0, 10) : '' }); setShowWarrantyModal(true); }}
  >🛡️ Edit Warranty</button>

  <button
    className="bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
    onClick={printDetail}
  >🖨️ Print</button>

  <button
    className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
    onClick={exportPCDetail}
  ><Download size={14} /> Export</button>

  {/* เมนู ⋯ */}
  <div className="relative">
    <button
      onClick={() => setMenuOpen(o => !o)}
      aria-label="เมนูเพิ่มเติม"
      className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 flex items-center justify-center text-lg leading-none transition-colors"
    >⋯</button>

    {menuOpen && (
      <>
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
        <div className="absolute right-0 mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 text-[13px] font-medium animate-in fade-in zoom-in-95 duration-150">
          <button
            className="w-full text-left px-3.5 py-2 text-gray-700 hover:bg-gray-50"
            onClick={() => { setMenuOpen(false); togglePcStatus(); }}
          >
            {detailData.inv.pc_status === 'Inactive' ? '✓ Reactivate' : '⏸ Mark Inactive'}
          </button>

          {isNotebookType(detailData.inv) && (
            <button
              className="w-full text-left px-3.5 py-2 text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setMenuOpen(false);
                setModalData({ hostname, keyC: detailData.inv.bitlocker_key_c, keyD: detailData.inv.bitlocker_key_d, pin: detailData.inv.bitlocker_pin });
                setShowBlModal(true);
              }}
            >🔐 BitLocker Key</button>
          )}

          <div className="my-1 border-t border-gray-100" />

          <button
            className="w-full text-left px-3.5 py-2 text-red-600 hover:bg-red-50"
            onClick={() => { setMenuOpen(false); setModalData({ hostname }); setShowDeleteModal(true); }}
          >🗑 Delete</button>
        </div>
      </>
    )}
  </div>
</div>
</div>


                    {(() => {
                      const InfoCell = ({ label, value, fontCls, textCol, wrapperClass }) => (
                        <div className={`bg-white p-3.5 px-4 ${wrapperClass || ''}`}>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
                          <div className={`text-[13.5px] font-medium ${fontCls || ''} ${(value === null || value === '' || value === undefined) ? 'text-gray-400 italic' : textCol ? textCol : 'text-gray-900'} ${fontCls?.includes('whitespace-') ? '' : 'whitespace-pre-wrap'}`}>
                            {(value === null || value === '' || value === undefined) ? '—' : value}
                          </div>
                        </div>
                      );

                      return (
                        <div className="space-y-6">

                          <div>
  <div className="flex items-center justify-between mb-3 ml-1">
    <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400">
      ผู้ใช้ปัจจุบัน ({sessionView.length})
    </div>
    {detailData.users.length > 0 && (
      <button
        onClick={() => setShowAllSessions(s => !s)}
        className="text-[11px] font-semibold text-gray-400 hover:text-blue-600 transition-colors"
      >
        {showAllSessions ? 'ซ่อนข้อมูลดิบ' : `ดู session ทั้งหมด (${detailData.users.length})`}
      </button>
    )}
  </div>

  {!showAllSessions ? (
    sessionView.length === 0 ? (
      <div className="bg-white border border-gray-200 rounded-xl py-8 text-center text-xs font-medium text-gray-400 shadow-sm">
        ไม่มีผู้ใช้ที่ login อยู่
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sessionView.map(u => {
          const name = stripDomain(u.username);
          const state = (u.state || '').toUpperCase();
          const ago = timeAgo(u.logon_time);
          const badge =
            state === 'ACTIVE' ? 'bg-green-100 text-green-700'
            : state === 'DISC' ? 'bg-red-100 text-red-700'
            : 'bg-amber-100 text-amber-700';
          return (
            <div
              key={u.id || normalizeUser(u.username)}
              title={`Session: ${u.session_name || '—'} · ID: ${u.session_id ?? '—'}`}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-3 hover:border-blue-200 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-[#eff4ff] border border-[#bfcfff] flex items-center justify-center text-[13px] font-bold text-[#2563eb] shrink-0">
                {name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-gray-900 truncate">{name}</div>
                <div className="text-[11.5px] text-gray-400 mt-0.5" title={u.logon_time ? fmtDate(u.logon_time) : ''}>
                  {u.logon_time ? `Login ${ago || fmtDate(u.logon_time)}` : 'ไม่ทราบเวลา login'}
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold shrink-0 ${badge}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                {u.state || '—'}
              </span>
            </div>
          );
        })}
      </div>
    )
  ) : (
    /* ตารางดิบเดิม สำหรับคนที่อยากดูทุก session */
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
            <tr><th className="py-2 px-3">Username</th><th className="py-2 px-3">Session Name</th><th className="py-2 px-3">Session ID</th><th className="py-2 px-3">State</th><th className="py-2 px-3">Logon Time</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {detailData.users.map(u => (
              <tr key={u.id}>
                <td className="py-2 px-3 font-medium text-blue-600">{u.username || '—'}</td>
                <td className="py-2 px-3 text-gray-600">{u.session_name || '—'}</td>
                <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{u.session_id || '—'}</td>
                <td className="py-2 px-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold ${u.state?.toUpperCase() === 'ACTIVE' ? 'bg-green-100 text-green-700' : u.state?.toUpperCase() === 'DISC' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-current"></div>{u.state}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-600">{fmtDate(u.logon_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )}
</div>

                          {/* <div> */}
                            {/* <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Sessions ปัจจุบัน</div>
                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-[13px]">
                                  <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
                                    <tr><th className="py-2 px-3">Username</th><th className="py-2 px-3">Session Name</th><th className="py-2 px-3">Session ID</th><th className="py-2 px-3">State</th><th className="py-2 px-3">Logon Time</th></tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {detailData.users.length === 0 ? (
                                      <tr><td colSpan="5" className="text-center py-8 text-gray-400 font-medium text-xs">ไม่มี session</td></tr>
                                    ) : detailData.users.map(u => (
                                      <tr key={u.id}>
                                        <td className="py-2 px-3 font-medium text-blue-600">{u.username || '—'}</td>
                                        <td className="py-2 px-3 text-gray-600">{u.session_name || '—'}</td>
                                        <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{u.session_id || '—'}</td>
                                        <td className="py-2 px-3">
                                          <span className={`inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold ${u.state?.toUpperCase() === 'ACTIVE' ? 'bg-green-100 text-green-700' : u.state?.toUpperCase() === 'DISC' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                            <div className="w-1.5 h-1.5 rounded-full bg-current"></div>{u.state}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-gray-600">{fmtDate(u.logon_time)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div> */}

                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Information</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                              <InfoCell label="Computer Type" value={detailData.inv.computer_type} />
                              <InfoCell label="Manufacturer" value={detailData.inv.manufacturer} />
                              <InfoCell label="Model" value={detailData.inv.model} />
                              <InfoCell label="Serial Number" value={detailData.inv.serial_number} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="IP Address" value={detailData.inv.ip_address} textCol="text-blue-600" />
                              <InfoCell label="MAC Address" value={detailData.inv.mac_address} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="Domain" value={detailData.inv.domain} />
                              <InfoCell label="Fix Asset" value={detailData.inv.fix_asset} textCol="text-blue-600" />
                              <InfoCell label="Asset Tag" value={detailData.inv.asset_tag} textCol="text-blue-600" />
                              <InfoCell label="Warranty Package" value={detailData.inv.warranty_package} />
                              <InfoCell label="Warranty Expire" value={warrantyLabel(detailData.inv.warranty_expire_date)} textCol={getWarranty(detailData.inv.warranty_expire_date).status === 'expired' ? 'text-red-600' : getWarranty(detailData.inv.warranty_expire_date).days <= warrantyDays ? 'text-amber-600' : ''} />
                              <InfoCell label="Status" value={detailData.inv.status} textCol={
                                detailData.inv.status === 'Active' ? 'text-emerald-600' :
                                  detailData.inv.status === 'Inactive' ? 'text-amber-600' :
                                    detailData.inv.status === 'Retired' ? 'text-red-600' : undefined
                              } />
                              <InfoCell label="Remark" value={detailData.inv.remark} wrapperClass="sm:col-span-2" />
                              <InfoCell label="PC Status" value={detailData.inv.pc_status} textCol={detailData.inv.pc_status === 'Active' ? 'text-emerald-600' : detailData.inv.pc_status === 'Inactive' ? 'text-amber-600' : 'text-gray-600'} />
                              <InfoCell label="User Count" value={detailData.inv.user_count} />
                              <InfoCell label="Local Admin Users" value={detailData.inv.local_admin_users} fontCls="font-mono text-[12px]" textCol={(detailData.inv.local_admin_users || '').toLowerCase() === 'not admin' ? 'text-green-600' : (detailData.inv.local_admin_users || '').toLowerCase().includes('admin') ? 'text-red-600' : 'text-green-600'} />
                              <InfoCell label="WiFi SSID" value={detailData.inv.wifi_ssid} textCol="text-blue-600" />
                              <InfoCell label="Adapter Type" value={detailData.inv.adapter_type} />
                              <InfoCell label="Data Collected" value={fmtDate(detailData.inv.collected_at)} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="Last Updated" value={fmtDate(detailData.inv.updated_at)} fontCls="font-mono text-[12px] text-gray-500" />
                            </div>
                          </div>

                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Hardware</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                              <InfoCell label="CPU" value={detailData.inv.cpu_name} />
                              <InfoCell label="Cores / Threads" value={detailData.inv.cpu_cores ? `${detailData.inv.cpu_cores} cores / ${detailData.inv.cpu_threads} threads` : null} />
                              <InfoCell label="RAM" value={detailData.inv.ram_info} textCol="text-green-600" />
                              {(detailData.inv.ram_detail || '').split(' | ').filter(e => e).map((r, i) => <InfoCell key={i} label={`RAM Slot ${i + 1}`} value={r} />)}
                              {(detailData.inv.disk_info || '').split(' | ').filter(e => e).map((d, i) => {
                                const letter = String.fromCharCode(67 + i);
                                const tm = d.match(/Total:([^\s]+)/), fm = d.match(/Free:([^\s]+)/);
                                return <InfoCell key={i} label={`Disk ${letter}`} value={`Total: ${tm ? tm[1] : ''}\nFree: ${fm ? fm[1] : ''}`} textCol="text-green-600" />;
                              })}
                              <InfoCell label="GPU" value={detailData.inv.gpu} />
                              <InfoCell label="Resolution" value={detailData.inv.resolution} />
                              <InfoCell label="BIOS Version" value={detailData.inv.bios_version} fontCls="font-mono text-[12px] text-gray-500" />
                              {(detailData.inv.disk_smart_info || '').split('||').map(s => s.trim()).filter(Boolean).map((disk, i) => {
                                const parts = disk.split('|');
                                const model = parts[0]?.trim() || '—';
                                const fields = {};
                                parts.slice(1).forEach(p => {
                                  const ci = p.indexOf(':');
                                  if (ci > -1) fields[p.slice(0, ci).trim()] = p.slice(ci + 1).trim();
                                  else fields[p.trim()] = '';
                                });
                                const health = fields['Health'] || '';
                                return (
                                  <div key={i} className="bg-white p-3.5 px-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Disk SMART {i + 1}</div>
                                    <div className="text-[13.5px] font-medium text-gray-900 font-mono mb-1.5">{model}</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {fields['Type'] && <span className="text-[11px] text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">{fields['Type']}</span>}
                                      {fields['Size'] && <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 font-mono">{fields['Size']}</span>}
                                      {health && <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${health === 'Healthy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{health}</span>}
                                      {fields['SN'] && <span className="text-[11px] text-gray-400 font-mono">SN: {fields['SN']}</span>}
                                    </div>
                                  </div>
                                );
                              })}

                              {(detailData.inv.monitor_info || '').split('||').map(s => s.trim()).filter(Boolean).map((m, i) => {
                                const parts = m.split('|');
                                const brand = parts[0]?.trim() || '—';
                                const sn = parts.find(p => p.trim().startsWith('SN:'))?.replace('SN:', '').trim();
                                const model = parts.slice(1).find(p => !p.trim().startsWith('SN:'))?.trim();
                                return (
                                  <div key={i} className="bg-white p-3.5 px-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Monitor {i + 1}</div>
                                    <div className="text-[13.5px] font-medium text-gray-900 mb-1">{brand}</div>
                                    {model && <div className="text-[12px] text-gray-600 font-mono mb-0.5">{model}</div>}
                                    {sn && <div className="text-[11px] text-gray-400 font-mono">SN: {sn}</div>}
                                  </div>
                                );
                              })}

                              {detailData.inv.printer_info && (() => {
                                const printers = detailData.inv.printer_info.split('||').map(s => s.trim()).filter(Boolean);
                                const def = printers.find(p => p.includes('[DEFAULT]'))?.replace(/\|Port:.+$/, '').replace('[DEFAULT]', '').trim();
                                return (
                                  <button onClick={() => setShowPrinterModal(true)} className="bg-white p-3.5 px-4 text-left hover:bg-[#eff4ff] transition-colors cursor-pointer group">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex items-center justify-between">
                                      Printer
                                      <span className="text-[10px] normal-case font-normal bg-gray-100 group-hover:bg-blue-100 group-hover:text-blue-600 text-gray-500 rounded px-1.5 py-0.5 transition-colors">{printers.length} เครื่อง ›</span>
                                    </div>
                                    <div className="text-[13.5px] font-medium text-gray-900 truncate">{def || printers[0]?.replace(/\|Port:.+$/, '').trim()}</div>
                                    {printers.length > 1 && <div className="text-[11px] text-gray-400 mt-0.5">+{printers.length - 1} เครื่องอื่น</div>}
                                  </button>
                                );
                              })()}

                              {detailData.inv.usb_info && (() => {
                                const usbs = detailData.inv.usb_info.split('||').map(s => s.trim()).filter(Boolean);
                                const preview = usbs.slice(0, 2).map(u => u.split('|')[0].trim()).join(', ');
                                return (
                                  <button onClick={() => setShowUsbModal(true)} className="bg-white p-3.5 px-4 text-left hover:bg-[#eff4ff] transition-colors cursor-pointer group">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex items-center justify-between">
                                      USB Devices
                                      <span className="text-[10px] normal-case font-normal bg-gray-100 group-hover:bg-blue-100 group-hover:text-blue-600 text-gray-500 rounded px-1.5 py-0.5 transition-colors">{usbs.length} อุปกรณ์ ›</span>
                                    </div>
                                    <div className="text-[13px] font-medium text-gray-700 truncate">{preview}</div>
                                    {usbs.length > 2 && <div className="text-[11px] text-gray-400 mt-0.5">+{usbs.length - 2} อื่นๆ</div>}
                                  </button>
                                );
                              })()}

                            </div>
                          </div>

                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Systems</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                              {(() => {
                                const renamedTo = reincarnatedData.data.find(r => r.old_hostname === hostname)?.new_hostname;
                                return renamedTo ? (
                                  <button
                                    onClick={() => { setHostname(renamedTo); setView('detail'); }}
                                    className="bg-orange-50 p-3.5 px-4 text-left hover:bg-orange-100 transition-colors cursor-pointer"
                                  >
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-500 mb-1">ชื่อใหม่ (New Name)</div>
                                    <div className="text-[13.5px] font-bold text-orange-700">{renamedTo} →</div>
                                  </button>
                                ) : null;
                              })()}
                              <InfoCell label="OS Name" value={detailData.inv.os_name} />
                              <InfoCell label="Release" value={detailData.inv.os_release} />
                              <InfoCell label="Build" value={detailData.inv.os_build} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="Full Version" value={detailData.inv.os_full_version} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="Architecture" value={detailData.inv.os_arch} />
                              <InfoCell label="Install Date" value={fmtDate(detailData.inv.os_install_date)} />
                              <InfoCell label="Last Boot" value={fmtDate(detailData.inv.last_boot)} />
                              <InfoCell label="Uptime" value={detailData.inv.uptime} />
                              <InfoCell label="Product ID" value={detailData.inv.os_product_id} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="Product Key" value={detailData.inv.os_product_key} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="Activation Status" value={detailData.inv.os_activation} />
                              {detailData.inv.last_patch_kb && <InfoCell label="Last Patch KB" value={detailData.inv.last_patch_kb} fontCls="font-mono text-[12px] text-gray-500" />}
                              {detailData.inv.last_patch_date && <InfoCell label="Last Patch Date" value={fmtDate(detailData.inv.last_patch_date)} fontCls="font-mono text-[12px] text-gray-500" />}
                              {detailData.inv.shutdown_events && (() => {
                                const events = detailData.inv.shutdown_events.split('||').map(s => s.trim()).filter(Boolean);
                                const latest = events[0]?.split('|');
                                const latestTime = latest?.[0]?.trim();
                                const latestType = latest?.find(p => !p.trim().startsWith('ID:') && p.trim() !== latestTime)?.trim();
                                const isStart = (latestType || '').toLowerCase().includes('start');
                                const isClean = (latestType || '').toLowerCase().includes('clean');
                                return (
                                  <button onClick={() => setShowShutdownModal(true)} className="bg-white p-3.5 px-4 text-left hover:bg-[#eff4ff] transition-colors cursor-pointer group">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex items-center justify-between">
                                      Shutdown Events
                                      <span className="text-[10px] normal-case font-normal bg-gray-100 group-hover:bg-blue-100 group-hover:text-blue-600 text-gray-500 rounded px-1.5 py-0.5 transition-colors">{events.length} รายการ ›</span>
                                    </div>
                                    <div className={`text-[13.5px] font-medium ${isStart ? 'text-green-700' : isClean ? 'text-blue-600' : 'text-amber-600'}`}>{latestType || '—'}</div>
                                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">{latestTime}</div>
                                  </button>
                                );
                              })()}
                              {historyData.length > 0 && (() => {
                                const latest = historyData[0];
                                const isAdded = latest.change_type === 'software_added';
                                const isRemoved = latest.change_type === 'software_removed';
                                const isSecurity = ['BitLocker', 'Secure Boot', 'TPM Enabled', 'Local Admin', 'CrowdStrike', 'Tanium', 'UEMS'].includes(latest.field_name);
                                const isWorse = isSecurity && ['Disabled', 'false', 'False', '0'].includes(latest.new_value);
                                const previewColor = isAdded ? 'text-green-700' : isRemoved ? 'text-red-600' : isWorse ? 'text-red-600' : 'text-blue-600';
                                const previewText = isAdded ? latest.new_value : isRemoved ? latest.old_value : latest.field_name;
                                return (
                                  <button onClick={() => setShowHistoryModal(true)} className="bg-white p-3.5 px-4 text-left hover:bg-[#eff4ff] transition-colors cursor-pointer group">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex items-center justify-between">
                                      Timeline / History
                                      <span className="text-[10px] normal-case font-normal bg-gray-100 group-hover:bg-blue-100 group-hover:text-blue-600 text-gray-500 rounded px-1.5 py-0.5 transition-colors">{historyData.length} รายการ ›</span>
                                    </div>
                                    <div className={`text-[13.5px] font-medium truncate ${previewColor}`}>{previewText || '—'}</div>
                                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">{fmtDate(latest.changed_at)}</div>
                                  </button>
                                );
                              })()}
                            </div>
                          </div>

                          {isNotebookType(detailData.inv) && (detailData.inv.battery_percent || detailData.inv.battery_health || detailData.inv.battery_status) && (
                            <div>
                              <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Battery / Power</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                                <InfoCell label="Battery Name" value={detailData.inv.battery_name} />
                                <InfoCell label="Status" value={detailData.inv.battery_status} />
                                <InfoCell label="Percentage" value={detailData.inv.battery_percent} textCol="text-blue-600" />
                                <InfoCell label="Health" value={detailData.inv.battery_health} />
                                <InfoCell label="Wear Level" value={detailData.inv.battery_wear} fontCls="font-mono text-[12px] text-gray-500" />
                                <InfoCell label="Cycle Count" value={detailData.inv.battery_cycle} fontCls="font-mono text-[12px] text-gray-500" />
                                <InfoCell label="Voltage" value={detailData.inv.battery_voltage} fontCls="font-mono text-[12px] text-gray-500" />
                                <InfoCell label="Charging" value={detailData.inv.battery_charging} />
                                <InfoCell label="Manufacturer" value={detailData.inv.battery_manufacturer} />
                                <InfoCell label="Battery Type" value={detailData.inv.battery_type} />
                              </div>
                            </div>
                          )}

                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Security</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                              <InfoCell label="BitLocker" value={detailData.inv.bitlocker} textCol={detailData.inv.bitlocker === 'Enabled' ? 'text-green-600' : detailData.inv.bitlocker === 'Disabled' ? 'text-red-600' : ''} />
                              <InfoCell label="CrowdStrike Ver" value={detailData.inv.crowdstrike_ver} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="Tanium Ver" value={detailData.inv.tanium_ver} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="UEMS Ver" value={detailData.inv.uems_ver} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="Secure Boot" value={detailData.inv.secure_boot} textCol={
                                (detailData.inv.secure_boot || '').toLowerCase() === 'enabled' ? 'text-green-600' :
                                  (detailData.inv.secure_boot || '').toLowerCase() === 'disabled' ? 'text-red-600' : undefined
                              } />
                              <InfoCell label="TPM Present" value={detailData.inv.tpm_present} textCol={
                                (detailData.inv.tpm_present || '').toLowerCase() === 'true' || detailData.inv.tpm_present === '1' ? 'text-green-600' :
                                  (detailData.inv.tpm_present || '').toLowerCase() === 'false' || detailData.inv.tpm_present === '0' ? 'text-red-600' : undefined
                              } />
                              <InfoCell label="TPM Enabled" value={detailData.inv.tpm_enabled} textCol={
                                (detailData.inv.tpm_enabled || '').toLowerCase() === 'true' || detailData.inv.tpm_enabled === '1' ? 'text-green-600' :
                                  (detailData.inv.tpm_enabled || '').toLowerCase() === 'false' || detailData.inv.tpm_enabled === '0' ? 'text-red-600' : undefined
                              } />
                              <InfoCell label="TPM Version" value={detailData.inv.tpm_version} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="UAC Level" value={detailData.inv.uac_level} />
                              {isNotebookType(detailData.inv) && (
                                <>
                                  <InfoCell label="BitLocker Key C:" value={detailData.inv.bitlocker_key_c} fontCls="font-mono text-[12px] text-blue-600 whitespace-nowrap overflow-x-auto custom-scrollbar tracking-tight" wrapperClass="sm:col-span-2 lg:col-span-2" />
                                  <InfoCell label="BitLocker Key D:" value={detailData.inv.bitlocker_key_d} fontCls="font-mono text-[12px] text-blue-600 whitespace-nowrap overflow-x-auto custom-scrollbar tracking-tight" wrapperClass="sm:col-span-2 lg:col-span-2" />
                                  <InfoCell label="BitLocker PIN" value={detailData.inv.bitlocker_pin} fontCls="font-mono text-[13px] text-purple-600 font-bold" />
                                </>
                              )}
                            </div>
                          </div>

                          {(detailData.inv.net_gateway || detailData.inv.net_dns || detailData.inv.net_subnet || detailData.inv.net_dhcp || detailData.inv.net_proxy) && (
                            <div>
                              <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Network</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                                <InfoCell label="Gateway" value={detailData.inv.net_gateway} fontCls="font-mono text-[12px]" textCol="text-blue-600" />
                                <InfoCell label="DNS" value={detailData.inv.net_dns} fontCls="font-mono text-[12px] text-gray-500" />
                                <InfoCell label="Subnet" value={detailData.inv.net_subnet} fontCls="font-mono text-[12px] text-gray-500" />
                                <InfoCell label="DHCP" value={detailData.inv.net_dhcp} textCol={
                                  (detailData.inv.net_dhcp || '').toLowerCase() === 'enabled' ? 'text-green-600' :
                                    (detailData.inv.net_dhcp || '').toLowerCase() === 'disabled' ? 'text-amber-600' : undefined
                                } />
                                <InfoCell label="Proxy" value={detailData.inv.net_proxy} textCol={
                                  (detailData.inv.net_proxy || '').toLowerCase() === 'enabled' || (detailData.inv.net_proxy || '').toLowerCase() === 'yes' ? 'text-amber-600' :
                                    (detailData.inv.net_proxy || '').toLowerCase() === 'disabled' || (detailData.inv.net_proxy || '').toLowerCase() === 'no' ? 'text-green-600' : undefined
                                } />
                                {detailData.inv.net_proxy_server && <InfoCell label="Proxy Server" value={detailData.inv.net_proxy_server} fontCls="font-mono text-[12px] text-gray-500" wrapperClass="sm:col-span-2 lg:col-span-3" />}
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">
                              Map View 📍
                            </div>

                            {locationLoading ? (
                              <div className="flex justify-center items-center py-8 text-gray-500">
                                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mr-2"></div>
                                Loading location data...
                              </div>
                            ) : (
                              <MapViewTab
                                hostname={hostname}
                                locationData={locationData}
                                detailData={detailData}
                                onEditLocation={() => setShowLocationModal(true)}
                                onSelectPC={(selectedHostname) => {
                                  setHostname(selectedHostname);
                                  fetchPCLocation(selectedHostname);
                                  fetchDetail(selectedHostname);
                                }}
                              />
                            )}
                          </div>

                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Software ({detailData.software.length})</div>
                            <div className="relative mb-3 flex w-full">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Search size={15} /></div>
                              <input type="text" placeholder="ค้นหา Software: ชื่อ, Version, Publisher" className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-9 pr-4 text-[13px] outline-none shadow-sm focus:border-blue-500" value={softwareSearch} onChange={(e) => { setSoftwareSearch(e.target.value); setSoftwarePage(1); }} />
                            </div>
                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-[14px] whitespace-nowrap">
                                  <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[11px] uppercase tracking-wider">
                                    <tr>
                                      <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => toggleSoftwareSort('name')}>Name {softwareSortKey === 'name' ? (softwareSortAsc ? '▲' : '▼') : '↕'}</th>
                                      <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => toggleSoftwareSort('version')}>Version {softwareSortKey === 'version' ? (softwareSortAsc ? '▲' : '▼') : '↕'}</th>
                                      <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => toggleSoftwareSort('publisher')}>Publisher {softwareSortKey === 'publisher' ? (softwareSortAsc ? '▲' : '▼') : '↕'}</th>
                                      <th className="py-2.5 px-3 font-semibold">Install Location</th>
                                      <th className="py-2.5 px-3 font-semibold">Size</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {softwareFiltered.slice((softwarePage - 1) * softwarePageSize, softwarePage * softwarePageSize).length === 0 ? (
                                      <tr><td colSpan="5" className="text-center py-8 text-gray-400">ไม่พบซอฟต์แวร์</td></tr>
                                    ) : softwareFiltered.slice((softwarePage - 1) * softwarePageSize, softwarePage * softwarePageSize).map(s => (
                                      <tr key={s.id} className="hover:bg-[#eff4ff]">
                                        <td className="py-2.5 px-3 text-[13px] font-medium text-gray-800">{s.name || '—'}</td>
                                        <td className="py-2.5 px-3 text-[13px] font-mono text-gray-500">{s.version || '—'}</td>
                                        <td className="py-2.5 px-3 text-[12px] text-gray-500">{s.publisher || '—'}</td>
                                        <td className="py-2.5 px-3 text-[12px] text-gray-600 truncate max-w-[200px]" title={s.install_location}>{s.install_location || '—'}</td>
                                        <td className="py-2.5 px-3 text-[12px] text-gray-600">{s.size_mb ? `${s.size_mb} MB` : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500 bg-white">
                                <span>{(softwarePage - 1) * softwarePageSize + (softwareFiltered.length ? 1 : 0)}–{Math.min(softwarePage * softwarePageSize, softwareFiltered.length)} จาก {softwareFiltered.length} รายการ</span>
                                <div className="flex gap-1.5">
                                  <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors" disabled={softwarePage <= 1} onClick={() => setSoftwarePage(softwarePage - 1)}>← ก่อน</button>
                                  <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors" disabled={softwarePage >= Math.ceil(softwareFiltered.length / softwarePageSize)} onClick={() => setSoftwarePage(softwarePage + 1)}>ถัดไป →</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-[13.5px] text-red-600 font-semibold">ไม่พบข้อมูล Inventory สำหรับ host นี้</div>
                )}
              </motion.div>
            )}
          </div>
        </>
      )}

      {/* --- PRINT FORM (แสดงเฉพาะตอนสั่งพิมพ์ 2 หน้า A4) --- */}
      {detailData.inv && (() => {
        const inv = detailData.inv;
        const users = sessionView.map(u => u.username).join(', ') || '—';
        const splitList = (s) => (s || '').split('||').map(x => x.trim()).filter(Boolean);
        const disks = parseDiskSmart(inv.disk_smart_info);
        const printers = splitList(inv.printer_info);
        const usbs = splitList(inv.usb_info);
        const shutdowns = splitList(inv.shutdown_events).slice(0, 5);
        const sw = detailData.software || [];
        const hist = (historyData || []).slice(0, 6);
        const location = locationData?.layout_name || locationData?.name || null;
        const battery = [
          ['Battery Health', batteryPercentOf(inv.battery_health)], ['Battery Wear', inv.battery_wear],
          ['Battery Cycle', inv.battery_cycle], ['Battery Status', inv.battery_status],
        ].filter(([, v]) => v);

        const h2 = { background: '#eff4ff', color: '#1e3a8a', fontWeight: 700, fontSize: 12, padding: '4px 8px', borderLeft: '4px solid #2563eb', marginBottom: 4 };
        const pageStyle = { pageBreakAfter: 'always', breakAfter: 'page' };

        const Header = ({ page }) => (
          <div style={{ borderBottom: '3px solid #1e3a8a', paddingBottom: 6, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1e3a8a' }}>PC / NOTEBOOK ASSET FORM</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>ทะเบียนข้อมูลคอมพิวเตอร์ · หน้า {page}/2</div>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right' }}>
              <div>Hostname: <b style={{ color: '#111827' }}>{inv.hostname}</b></div>
              <div>พิมพ์เมื่อ: {new Date().toLocaleString('th-TH')}</div>
            </div>
          </div>
        );

        const KV = ({ title, rows }) => (
          <div style={{ marginBottom: 10, breakInside: 'avoid' }}>
            <div style={h2}>{title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {Array.from({ length: Math.ceil(rows.length / 2) }).map((_, i) => (
                  <tr key={i}>
                    {[rows[i * 2], rows[i * 2 + 1]].map((pair, j) => (
                      pair ? (
                        <Fragment key={j}>
                          <td style={{ width: '16%', padding: '3px 6px', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{pair[0]}</td>
                          <td style={{ width: '34%', padding: '3px 6px', color: '#111827', fontWeight: 600, borderBottom: '1px solid #e5e7eb', wordBreak: 'break-word' }}>{pair[1] || '—'}</td>
                        </Fragment>
                      ) : (
                        <Fragment key={j}><td /><td /></Fragment>
                      )
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

        const ListBox = ({ title, items, cols = 1 }) => (
          <div style={{ marginBottom: 10, breakInside: 'avoid' }}>
            <div style={h2}>{title}</div>
            {items.length === 0 ? (
              <div style={{ fontSize: 11, color: '#9ca3af', padding: '3px 6px' }}>ไม่มีข้อมูล</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 10, color: '#111827', columnCount: cols, columnGap: 16 }}>
                {items.map((t, i) => <li key={i} style={{ wordBreak: 'break-word', breakInside: 'avoid' }}>{t}</li>)}
              </ul>
            )}
          </div>
        );

        const Sign = () => (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, fontSize: 12, color: '#374151' }}>
            {['ผู้ใช้งาน', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ'].map(role => (
              <div key={role} style={{ width: '28%', textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #374151', height: 40 }} />
                <div style={{ marginTop: 4 }}>({role})</div>
                <div style={{ marginTop: 2 }}>วันที่ ............................</div>
              </div>
            ))}
          </div>
        );

        return (
          <Portal>
          <div className="pc-print-area">
            <style>{`
              .pc-print-area { display: none; }
              @media print {
                @page { size: A4; margin: 12mm; }
                body > *:not(.pc-print-area) { display: none !important; }
                .pc-print-area { display: block !important; position: static; width: 100%; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              }
            `}</style>

            {/* หน้า 1: ข้อมูลเครื่อง เครือข่าย ฮาร์ดแวร์ แบตเตอรี่/ดิสก์ ประกัน ผู้ใช้งาน */}
            <div style={pageStyle}>
              <Header page={1} />
              <KV title="ข้อมูลเครื่อง" rows={[
                ['Hostname', inv.hostname], ['Computer Type', inv.computer_type],
                ['Manufacturer', inv.manufacturer], ['Model', inv.model],
                ['Serial Number', inv.serial_number], ['Fix Asset', inv.fix_asset],
                ['Asset Tag', inv.asset_tag], ['Status', inv.pc_status],
              ]} />
              <KV title="เครือข่าย" rows={[
                ['IP Address', inv.ip_address], ['MAC Address', inv.mac_address],
                ['Domain', inv.domain], ['WiFi SSID', inv.wifi_ssid],
                ['Gateway', inv.net_gateway], ['DNS', inv.net_dns],
              ]} />
              <KV title="Hardware" rows={[
                ['CPU', inv.cpu_name], ['RAM', inv.ram_info || (inv.ram_gb ? `${inv.ram_gb} GB` : null)],
                ['GPU', inv.gpu], ['Resolution', inv.resolution],
                ['BIOS Version', inv.bios_version], ['Disk', inv.disk_info],
              ]} />
              {battery.length > 0 && <KV title="Battery" rows={battery} />}
              {disks.length > 0 && (
                <div style={{ marginBottom: 10, breakInside: 'avoid' }}>
                  <div style={h2}>Disk SMART</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ color: '#6b7280', textAlign: 'left' }}>
                        <th style={{ padding: '3px 6px', borderBottom: '1px solid #d1d5db' }}>Model</th>
                        <th style={{ padding: '3px 6px', borderBottom: '1px solid #d1d5db' }}>Size</th>
                        <th style={{ padding: '3px 6px', borderBottom: '1px solid #d1d5db' }}>Health</th>
                        <th style={{ padding: '3px 6px', borderBottom: '1px solid #d1d5db' }}>Serial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {disks.map((disk, i) => (
                        <tr key={i}>
                          <td style={{ padding: '3px 6px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{disk.model}</td>
                          <td style={{ padding: '3px 6px', borderBottom: '1px solid #e5e7eb' }}>{disk.size}</td>
                          <td style={{ padding: '3px 6px', borderBottom: '1px solid #e5e7eb' }}>{disk.health}</td>
                          <td style={{ padding: '3px 6px', borderBottom: '1px solid #e5e7eb', fontFamily: 'monospace' }}>{disk.sn || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <KV title="ประกัน" rows={[
                ['Warranty Package', inv.warranty_package], ['Warranty Expire', warrantyLabel(inv.warranty_expire_date)],
              ]} />
              <KV title="ผู้ใช้งาน / ตำแหน่ง" rows={[
                ['Active Users', users], ['Location', location], ['Remark', inv.remark],
              ]} />
              <Sign />
            </div>

            {/* หน้า 2: OS / Security, อุปกรณ์ต่อ, ประวัติ, Software, ลายเซ็น */}
            <div>
              <Header page={2} />
              <KV title="ระบบปฏิบัติการ / Security" rows={[
                ['OS', `${inv.os_name || ''} ${inv.os_release || ''}`.trim()], ['OS Build', inv.os_build],
                ['Activation', inv.os_activation], ['BitLocker', inv.bitlocker],
                ['CrowdStrike', inv.crowdstrike_ver], ['Tanium', inv.tanium_ver], ['UEMS', inv.uems_ver],
                ['Last Patch KB', inv.last_patch_kb], ['Last Patch Date', inv.last_patch_date ? fmtDate(inv.last_patch_date) : null],
                ['Local Admin', inv.local_admin_users], ['OS Install Date', inv.os_install_date ? fmtDate(inv.os_install_date) : null],
              ]} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <ListBox title={`เครื่องพิมพ์ (${printers.length})`} items={printers} />
                <ListBox title={`USB (${usbs.length})`} items={usbs} />
              </div>
              <ListBox title="Shutdown events (ล่าสุด)" items={shutdowns} />
              <div style={{ marginBottom: 10, breakInside: 'avoid' }}>
                <div style={h2}>ประวัติการเปลี่ยนแปลง (ล่าสุด {hist.length})</div>
                {hist.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#9ca3af', padding: '3px 6px' }}>ไม่มีข้อมูล</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr style={{ color: '#6b7280', textAlign: 'left' }}>
                        <th style={{ padding: '2px 6px', borderBottom: '1px solid #d1d5db' }}>วันที่</th>
                        <th style={{ padding: '2px 6px', borderBottom: '1px solid #d1d5db' }}>Field</th>
                        <th style={{ padding: '2px 6px', borderBottom: '1px solid #d1d5db' }}>เดิม</th>
                        <th style={{ padding: '2px 6px', borderBottom: '1px solid #d1d5db' }}>ใหม่</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hist.map((h, i) => (
                        <tr key={i}>
                          <td style={{ padding: '2px 6px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{fmtDate(h.changed_at)}</td>
                          <td style={{ padding: '2px 6px', borderBottom: '1px solid #e5e7eb' }}>{h.field_name || h.change_type || '—'}</td>
                          <td style={{ padding: '2px 6px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', wordBreak: 'break-word' }}>{toCellValue(h.old_value) || '—'}</td>
                          <td style={{ padding: '2px 6px', borderBottom: '1px solid #e5e7eb', wordBreak: 'break-word' }}>{toCellValue(h.new_value) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <ListBox
                title={`Software (${sw.length}${sw.length > 30 ? ' · แสดง 30 รายการแรก' : ''})`}
                cols={2}
                items={sw.map(s => [s.name, s.version].filter(Boolean).join(' · ')).filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 30)}
              />
            </div>
          </div>
          </Portal>
        );
      })()}

      {/* --- MODALS --- */}
      {showAssetModal && (
        <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-7 w-full max-w-[440px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-[16px] font-bold mb-1">Edit Fix Asset</h3>
            <div className="text-[13px] text-gray-500 mb-5">Hostname: {modalData.hostname}</div>
            <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Fix Asset Number</label>
            <input type="text" value={modalData.assetInput || ''} onChange={e => setModalData({ ...modalData, assetInput: e.target.value })} placeholder="e.g. DCI-IT-00123" className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-600 outline-none transition-colors font-mono" />
            {modalData.assetInput && !/^[A-Za-z0-9\-_.]*$/.test(modalData.assetInput) && (
              <p className="text-[11px] text-red-500 mt-1.5">ใช้ได้เฉพาะ ตัวอักษร ตัวเลข - _ .</p>
            )}
            <div className="flex justify-end gap-2.5 mt-5">
              <button className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors" onClick={() => setShowAssetModal(false)}>Cancel</button>
              <button className="px-5 py-2.5 rounded-lg bg-[#2563eb] text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors" onClick={saveAsset}>Save</button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {showWarrantyModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-7 w-full max-w-[440px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <form onSubmit={e => { e.preventDefault(); saveWarranty(); }}>
              <h3 className="text-[16px] font-bold mb-1">🛡️ Edit Warranty</h3>
              <div className="text-[13px] text-gray-500 mb-5">Hostname: {modalData.hostname}</div>
              <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Warranty Package</label>
              <input type="text" value={modalData.warrantyPkg || ''} onChange={e => setModalData({ ...modalData, warrantyPkg: e.target.value })} placeholder="e.g. Onsite 3 ปี" className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-600 outline-none transition-colors mb-3" />
              <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Warranty Expire Date</label>
              <input type="date" value={modalData.warrantyDate || ''} onChange={e => setModalData({ ...modalData, warrantyDate: e.target.value })} className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-600 outline-none transition-colors" />
              <div className="flex justify-end gap-2.5 mt-5">
                <button type="button" className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors" onClick={() => setShowWarrantyModal(false)}>Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-lg bg-[#2563eb] text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors">Save</button>
              </div>
              </form>
            </div>
          </div>
        </Portal>
      )}

      {showBulkWarrantyModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-7 w-full max-w-[440px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-[16px] font-bold mb-1">🛡️ ตั้งค่าประกันหลายเครื่อง</h3>
              <div className="text-[13px] text-gray-500 mb-5">จำนวน {selectedHosts.size} เครื่องที่เลือก — จะเขียนทับค่าเดิมทั้งหมด</div>
              <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Warranty Package</label>
              <input type="text" value={modalData.warrantyPkg || ''} onChange={e => setModalData({ ...modalData, warrantyPkg: e.target.value })} placeholder="e.g. Onsite 3 ปี" className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-600 outline-none transition-colors mb-3" />
              <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Warranty Expire Date</label>
              <input type="date" value={modalData.warrantyDate || ''} onChange={e => setModalData({ ...modalData, warrantyDate: e.target.value })} className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-600 outline-none transition-colors" />
              <div className="flex justify-end gap-2.5 mt-5">
                <button className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors" onClick={() => setShowBulkWarrantyModal(false)}>Cancel</button>
                <button className="px-5 py-2.5 rounded-lg bg-[#2563eb] text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors" onClick={saveBulkWarranty}>Save</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {showBlModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-7 w-full max-w-[500px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-[16px] font-bold mb-1">🔐 BitLocker Recovery Key</h3>
              <div className="text-[13px] text-gray-500 mb-5">Hostname: {modalData.hostname}</div>
              <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Recovery Key C:</label>
              <input type="text" value={modalData.keyC || ''} onChange={e => setModalData({ ...modalData, keyC: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx..." className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-[13px] focus:border-blue-600 outline-none transition-colors font-mono mb-3" />
            <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Recovery Key D:</label>
            <input type="text" value={modalData.keyD || ''} onChange={e => setModalData({ ...modalData, keyD: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx..." className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-[13px] focus:border-blue-600 outline-none transition-colors font-mono mb-3" />
            <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">PIN:</label>
            <input type="text" value={modalData.pin || ''} onChange={e => setModalData({ ...modalData, pin: e.target.value })} placeholder="BitLocker PIN" className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-[13px] font-bold text-gray-700 focus:border-blue-600 outline-none transition-colors font-mono" />
            <div className="flex justify-end gap-2.5 mt-5">
              <button className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors" onClick={() => setShowBlModal(false)}>Cancel</button>
              <button className="px-5 py-2.5 rounded-lg bg-[#2563eb] text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors" onClick={saveBl}>Save</button>
            </div>
          </div>
        </div>
       </Portal>
      )}

      {showDeleteModal && (
        <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-7 w-full max-w-[400px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-[16px] font-bold mb-2">Delete PC Record</h3>
            <p className="text-[14px] text-gray-600 leading-relaxed mb-5">คุณต้องการลบ <b>{modalData.hostname}</b> และข้อมูลทั้งหมดออกจากระบบใช่หรือไม่?</p>
            <div className="flex justify-end gap-2.5 mt-5">
              <button className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="px-5 py-2.5 rounded-lg bg-[#dc2626] text-white text-[13px] font-semibold hover:bg-red-700 transition-colors" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {showMultiLoginModal && (
        <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-[760px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200">
            <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[10px] bg-[#f0effe] border border-[#d0cbf8] flex items-center justify-center text-[18px] shrink-0">👥</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-gray-900">Users ที่ Login หลายเครื่อง</span>
                    <span className="inline-flex items-center gap-1 bg-[#f0effe] border border-[#d0cbf8] text-[#534ab7] rounded-full px-2.5 py-0.5 text-[11px] font-semibold">{multiLoginData.data.length} users</span>
                  </div>
                  <div className="text-[12px] text-gray-400 mt-0.5">{multiLoginData.allHostnames.length} เครื่องที่เกี่ยวข้อง</div>
                </div>
              </div>
              <button onClick={() => setShowMultiLoginModal(false)} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
              {multiLoginData.data.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400">ไม่พบ user ที่ login หลายเครื่อง</div>
              ) : multiLoginData.data.map(u => {
                const initials = u.username.replace(/^[.\\/]+/, '').slice(0, 2).toUpperCase();
                const details = u.hostnameDetailList?.length
                  ? u.hostnameDetailList
                  : u.hostnameList.map(h => ({ hostname: h, state: '-', logon_time: '-' }));
                return (
                  <div key={u.username} className="bg-[#fafafa] border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-full bg-[#e1f5ee] border border-[#9fe1cb] flex items-center justify-center text-[11px] font-semibold text-[#0f6e56] shrink-0">{initials}</div>
                      <span className="text-[13px] font-bold text-gray-900">{u.username}</span>
                      <span className="bg-[#ede9ff] text-[#534ab7] border border-[#d0cbf8] rounded-full px-2 py-0.5 text-[11px] font-semibold">{u.machine_count} เครื่อง</span>
                      <span className="ml-auto text-[11px] text-gray-400 font-mono">{u.latest_logon ? fmtDate(u.latest_logon) : '—'}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {details.map(d => (
                        <button
                          key={d.hostname}
                          onClick={() => { setShowMultiLoginModal(false); setHostname(d.hostname); setView('detail'); }}
                          className="bg-white border border-gray-200 hover:border-[#a5b4fc] hover:bg-[#f5f3ff] rounded-lg px-2.5 py-2 text-left transition-all group"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-3.5 h-3.5 rounded-[3px] bg-[#dbeafe] flex items-center justify-center text-[8px] shrink-0">🖥</div>
                            <span className="text-[11px] font-semibold text-gray-800 truncate group-hover:text-[#4338ca]">{d.hostname}</span>
                          </div>
                          <div className="flex items-center gap-1 mb-0.5">
                            {d.state?.toUpperCase() === 'ACTIVE' ? (
                              <span className="inline-flex items-center gap-1 bg-[#dcfce7] text-[#16a34a] rounded-full px-1.5 py-[1px] text-[10px] font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] inline-block"></span>Active</span>
                            ) : d.state?.toUpperCase() === 'DISC' ? (
                              <span className="inline-flex items-center gap-1 bg-[#fee2e2] text-[#dc2626] rounded-full px-1.5 py-[1px] text-[10px] font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-[#dc2626] inline-block"></span>Disc</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 rounded-full px-1.5 py-[1px] text-[10px] font-semibold">—</span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">{d.logon_time && d.logon_time !== '-' ? fmtDate(d.logon_time) : '—'}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setShowMultiLoginModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ✅ [NEW] REINCARNATED MACHINES MODAL — เครื่องที่น่าจะถูกลง Windows ใหม่ + เปลี่ยนชื่อ */}
      {showReincarnatedModal && (
        <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-[700px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200">
            <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[10px] bg-orange-50 border border-orange-200 flex items-center justify-center text-[18px] shrink-0">🔄</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-gray-900">เครื่องที่น่าจะถูกลง Windows ใหม่</span>
                    <span className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-700 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">{reincarnatedData.data.length} คู่</span>
                  </div>
                  <div className="text-[12px] text-gray-400 mt-0.5">จับคู่จาก MAC/Serial ที่ตรงกันระหว่างเครื่องเก่ากับเครื่องใหม่</div>
                </div>
              </div>
              <button onClick={() => setShowReincarnatedModal(false)} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2.5">
              {reincarnatedData.data.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400">ไม่พบเครื่องที่น่าจะถูกเปลี่ยนชื่อ</div>
              ) : reincarnatedData.data.map((r, i) => (
                <div key={i} className="bg-[#fafafa] border border-gray-200 rounded-xl p-3.5 flex items-center gap-3">
                  <button
                    onClick={() => { setShowReincarnatedModal(false); setHostname(r.old_hostname); setView('detail'); }}
                    className="flex-1 text-left bg-white border border-gray-200 hover:border-orange-300 hover:bg-orange-50 rounded-lg px-3 py-2 transition-all group min-w-0"
                  >
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                      เครื่องเก่า
                      {r.old_pc_status === 'Inactive' && (
                        <span className="text-[9px] font-bold text-gray-500 bg-gray-200 rounded-full px-1.5 py-0.5 normal-case">Inactive แล้ว</span>
                      )}
                    </div>
                    <div className="text-[13px] font-semibold text-gray-800 truncate group-hover:text-orange-700">{r.old_hostname}</div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">{fmtDate(r.old_last_seen)}</div>
                  </button>
                  <span className="text-gray-300 shrink-0">→</span>
                  <button
                    onClick={() => { setShowReincarnatedModal(false); setHostname(r.new_hostname); setView('detail'); }}
                    className="flex-1 text-left bg-white border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 rounded-lg px-3 py-2 transition-all group min-w-0"
                  >
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">เครื่องใหม่</div>
                    <div className="text-[13px] font-semibold text-gray-800 truncate group-hover:text-emerald-700">{r.new_hostname}</div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">{fmtDate(r.new_last_seen)}</div>
                  </button>
                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-1 shrink-0 whitespace-nowrap">{r.match_reason}</span>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setShowReincarnatedModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* PRINTER MODAL */}
      {showPrinterModal && detailData.inv?.printer_info && (() => {
        const printers = detailData.inv.printer_info.split('||').map(s => s.trim()).filter(Boolean);
        return (
          <Portal>
          <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-[560px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col overflow-hidden border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <div className="text-[15px] font-bold text-gray-900">🖨️ Printer</div>
                  <div className="text-[12px] text-gray-400 mt-0.5">{hostname} · {printers.length} เครื่อง</div>
                </div>
                <button onClick={() => setShowPrinterModal(false)} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"><X size={14} /></button>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                {printers.map((p, i) => {
                  const portMatch = p.match(/\|Port:(.+)$/);
                  const port = portMatch ? portMatch[1].trim() : null;
                  const name = p.replace(/\|Port:.+$/, '').trim();
                  const isDefault = name.includes('[DEFAULT]');
                  const cleanName = name.replace('[DEFAULT]', '').trim();
                  return (
                    <div key={i} className="flex items-center gap-2.5 px-6 py-3">
                      {isDefault && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 shrink-0">DEFAULT</span>}
                      <span className="text-[13px] font-medium text-gray-800 flex-1">{cleanName}</span>
                      {port && <span className="text-[11px] text-gray-400 font-mono shrink-0">{port}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
                <button onClick={() => setShowPrinterModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
              </div>
            </div>
          </div>
          </Portal>
        );
      })()}

      {/* USB MODAL */}
      {showUsbModal && detailData.inv?.usb_info && (() => {
        const usbs = detailData.inv.usb_info.split('||').map(s => s.trim()).filter(Boolean);
        return (
          <Portal>
          <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-[560px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col overflow-hidden border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <div className="text-[15px] font-bold text-gray-900">🔌 USB Devices</div>
                  <div className="text-[12px] text-gray-400 mt-0.5">{hostname} · {usbs.length} อุปกรณ์</div>
                </div>
                <button onClick={() => setShowUsbModal(false)} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"><X size={14} /></button>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                {usbs.map((u, i) => {
                  const parts = u.split('|');
                  const name = parts[0]?.trim() || '—';
                  const vendor = parts[1]?.trim();
                  return (
                    <div key={i} className="flex items-center gap-3 px-6 py-3">
                      <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-[13px] shrink-0">🔌</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-gray-800 truncate">{name}</div>
                        {vendor && <div className="text-[11px] text-gray-400">{vendor}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
                <button onClick={() => setShowUsbModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
              </div>
            </div>
          </div>
          </Portal>
        );
      })()}

      {/* SHUTDOWN EVENTS MODAL */}
      {showShutdownModal && detailData.inv?.shutdown_events && (() => {
        const events = detailData.inv.shutdown_events.split('||').map(s => s.trim()).filter(Boolean);
        return (
          <Portal>
          <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-[560px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col overflow-hidden border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <div className="text-[15px] font-bold text-gray-900">⚡ Shutdown Events</div>
                  <div className="text-[12px] text-gray-400 mt-0.5">{hostname} · {events.length} รายการ</div>
                </div>
                <button onClick={() => setShowShutdownModal(false)} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"><X size={14} /></button>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                {events.map((ev, i) => {
                  const parts = ev.split('|');
                  const datetime = parts[0]?.trim();
                  const idPart = parts.find(p => p.trim().startsWith('ID:'))?.replace('ID:', '').trim();
                  const type = parts.find(p => !p.trim().startsWith('ID:') && p.trim() !== parts[0]?.trim())?.trim();
                  const isStart = (type || '').toLowerCase().includes('start');
                  const isClean = (type || '').toLowerCase().includes('clean');
                  return (
                    <div key={i} className="flex items-center gap-3 px-6 py-3">
                      <span className="text-[11px] text-gray-400 font-mono shrink-0 w-36">{datetime}</span>
                      {idPart && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 font-mono shrink-0">ID:{idPart}</span>}
                      <span className={`text-[13px] font-medium ${isStart ? 'text-green-700' : isClean ? 'text-blue-600' : 'text-amber-600'}`}>{type || '—'}</span>
                    </div>
                  );
                })}
              </div>
              <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
                <button onClick={() => setShowShutdownModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
              </div>
            </div>
          </div>
          </Portal>
        );
      })()}

      {/* HISTORY / TIMELINE MODAL */}
      {showHistoryModal && historyData.length > 0 && (
        <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-[680px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <div className="text-[15px] font-bold text-gray-900">📅 Timeline / History</div>
                <div className="text-[12px] text-gray-400 mt-0.5">{hostname} · {historyData.length} รายการ</div>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"><X size={14} /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              <div className="divide-y divide-gray-100">
                {historyData.map((h, i) => {
                  const isSecurity = ['BitLocker', 'Secure Boot', 'TPM Enabled', 'Local Admin', 'CrowdStrike', 'Tanium', 'UEMS'].includes(h.field_name);
                  const isRemoved = h.change_type === 'software_removed';
                  const isAdded = h.change_type === 'software_added';
                  const isField = h.change_type === 'field_changed';
                  const isRename = h.change_type === 'hostname_changed'; // ✅ เพิ่มดักจับการเปลี่ยนชื่อเครื่อง

                  let dotColor = 'bg-gray-300';
                  let badgeClass = 'bg-gray-100 text-gray-500';
                  let badgeLabel = 'Changed';
                  
                  if (isAdded) { dotColor = 'bg-green-400'; badgeClass = 'bg-green-100 text-green-700'; badgeLabel = 'SW Added'; }
                  if (isRemoved) { dotColor = 'bg-red-400'; badgeClass = 'bg-red-100 text-red-700'; badgeLabel = 'SW Removed'; }
                  if (isRename) { dotColor = 'bg-orange-400'; badgeClass = 'bg-orange-100 text-orange-700'; badgeLabel = 'Renamed'; } // ✅ ป้ายสีส้มตอนเปลี่ยนชื่อ

                  if (isField && isSecurity) {
                    const isWorse = ['Disabled', 'false', 'False', '0', 'Not Admin'].includes(h.new_value) ||
                      h.field_name === 'Local Admin' && h.new_value === 'Admin';
                    dotColor = isWorse ? 'bg-red-400' : 'bg-blue-400';
                    badgeClass = isWorse ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700';
                    badgeLabel = 'Security';
                  }
                  if (isField && ['OS Build', 'OS Release', 'Last Patch KB', 'OS Install Date'].includes(h.field_name)) { // ✅ เพิ่ม OS Install Date เข้าหมวด Update
                    dotColor = 'bg-emerald-400'; badgeClass = 'bg-emerald-100 text-emerald-700'; badgeLabel = 'Update';
                  }

                  return (
                    <div key={h.id} className="flex items-start gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex flex-col items-center pt-1 shrink-0">
                        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`}></div>
                        {i < historyData.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" style={{ minHeight: '24px' }}></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeClass}`}>{badgeLabel}</span>
                          <span className="text-[13px] font-medium text-gray-800">
                            {isRename ? 'Hostname' : (isField ? h.field_name : (isAdded ? h.new_value : h.old_value))}
                          </span>
                        </div>
                        {/* ✅ แสดงลูกศร เปลี่ยนจากอันเก่า -> อันใหม่ สำหรับ Field Changed และ Rename */}
                        {(isField || isRename) && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[12px] text-gray-400 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 max-w-[240px] truncate" title={h.old_value}>{h.old_value || '—'}</span>
                            <span className="text-[10px] text-gray-400">→</span>
                            <span className="text-[12px] text-gray-700 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 max-w-[240px] truncate" title={h.new_value}>{h.new_value || '—'}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono shrink-0 pt-0.5 whitespace-nowrap">{fmtDate(h.changed_at)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setShowHistoryModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
            </div>
          </div>
        </div>
        </Portal>
      )}
      {/* ✅ Location Modal */}
      {showLocationModal && (
        <Portal>
        <LocationSelectorModal
          hostname={hostname}
          initialLocation={locationData}
          layouts={factoryLayouts}
          onSave={() => {
            setShowLocationModal(false);
            fetchPCLocation(hostname);
          }}
          onClose={() => setShowLocationModal(false)}
        />
        </Portal>
      )}
      
  <AlertModal
  isOpen={alertModal.isOpen}
  type={alertModal.type}
  title={alertModal.title}
  message={alertModal.message}
  onConfirm={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
  confirmText="ตกลง"
/>


      {inventoryType === 'mo' && <MOInventoryPage />}
    </div>
  );
  
};

export default PCInventoryPage;