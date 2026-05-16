import { ChevronLeft, Download, RefreshCw, Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE, API_URL } from '../config/api'; // เพิ่ม API_URL ตรงนี้
import MOInventoryPage from './MOInventoryPage';
import LocationSelectorModal from './LocationSelectorModal';
import MapViewTab from './MapViewTab';
import Portal from '../components/Portal'; // ← ADD THIS

// ─── Debounce hook ────────────────────────────────────────────────────────────
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
  // ตรวจสอบว่า path มี / นำหน้าหรือไม่ ถ้าไม่มีให้เติม
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // ถ้าใน DB ไม่ได้เก็บคำว่า uploads มาด้วย ให้ใส่เพิ่มเข้าไป
  const finalPath = cleanPath.startsWith('/uploads') ? cleanPath : `/uploads${cleanPath}`;
  return `${API_URL}${finalPath}`;
};

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
  const debouncedSearch = useDebounce(searchQuery, 300); // ✅ FIX: debounce search
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
  const [softwareSortKey, setSoftwareSortKey] = useState('name');  // ✅ FIX: track sort key properly
  const [softwareSortAsc, setSoftwareSortAsc] = useState(true);
  const [softwarePage, setSoftwarePage] = useState(1);
  const softwarePageSize = 20;

  const [toastMsg, setToastMsg] = useState('');
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showBlModal, setShowBlModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [modalData, setModalData] = useState({});
  const [multiLoginData, setMultiLoginData] = useState({ data: [], allHostnames: [] });
  const [showMultiLoginModal, setShowMultiLoginModal] = useState(false);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [showUsbModal, setShowUsbModal] = useState(false);
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState([]);

  // ✅ NEW: sticky filter bar ref
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
 

  // ✅ FIX: debounced search effect — replaces inline onSearchInput API call
  const prevSearchRef = useRef('');
 useEffect(() => {
    if (debouncedSearch.length >= 2) {
      (async () => {
        try {
          // ✅ Build URL with searchFieldType
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
      const [invRes, sumRes, mlRes] = await Promise.all([
        fetch(`${API_BASE}/pc-inventory`).then(r => r.json()),
        fetch(`${API_BASE}/pc-inventory/summary`).then(r => r.json()),
        fetch(`${API_BASE}/pc-inventory/multi-login`).then(r => r.json()),
      ]);
      if (!invRes.success) throw new Error(invRes.error || 'Failed to fetch');

      // ถ้ามี searchQuery อยู่ ให้ search ใหม่แทน set ตรงๆ
      if (searchQuery.length >= 2) {
        const res = await fetch(
          `${API_BASE}/pc-inventory/search?q=${encodeURIComponent(searchQuery)}`
        ).then(r => r.json());
        if (res.success) setInvData(res.data || []);
      } else {
        setInvData(invRes.data || []);
      }

      setSumData(sumRes.success ? sumRes : null);
      if (mlRes.success) setMultiLoginData(mlRes);
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

  const getHostsForKey = (key) => {
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
    if (key.startsWith('os:')) return sumData.osVersionMap[key.slice(3)] || [];
    if (key.startsWith('build:')) return sumData.osBuildMap[key.slice(6)] || [];
    if (key.startsWith('type:')) return (sumData.computerTypeMap || {})[key.slice(5)] || [];
    if (key.startsWith('cs:')) return (sumData.crowdstrikeVerMap || {})[key.slice(3)] || [];
    if (key.startsWith('tanium:')) return (sumData.taniumVerMap || {})[key.slice(7)] || [];
    if (key === 'multiLogin') return multiLoginData.allHostnames || [];
    return [];
  };

  // ✅ FIX: search input only updates state (debounce handles API call)
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

  // ✅ FIX: software sort toggle — properly handle key change vs direction toggle
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

    // ✅ FIX 1: Add searchFieldType filter for 1 char search
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
    // ✅ FIX 2: Add searchFieldType to dependencies
  }, [invData, filterKeys, searchQuery, searchFieldType, sortKey, sortAsc, sumData]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentList = filteredData.slice((page - 1) * pageSize, page * pageSize);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const saveAsset = async () => {
    // ✅ FIX: validate fix_asset format before saving
    const asset = (modalData.assetInput || '').trim();
    if (asset && !/^[A-Za-z0-9\-_.]+$/.test(asset)) {
      alert('รูปแบบ Fix Asset ไม่ถูกต้อง กรุณาใช้ตัวอักษร ตัวเลข หรือ - _ . เท่านั้น');
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
    } catch (err) { alert(err.message); }
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
    } catch (err) { alert(err.message); }
  };

  const confirmDelete = async () => {
    try {
      const res = await fetch(`${API_BASE}/pc-inventory/${encodeURIComponent(modalData.hostname)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setShowDeleteModal(false); setView('list'); setHostname(null);
    } catch (err) { alert(err.message); }
  };

  // ✅ NEW: Export filtered list to XLSX
  const exportFilteredList = () => {
    try {
      if (filteredData.length === 0) { showToast('❌ ไม่มีข้อมูลที่จะ export'); return; }
      const wb = XLSX.utils.book_new();
      const headers = [
        'Hostname', 'IP Address', 'User', 'Fix Asset', 'Computer Type',
        'Serial Number', 'OS', 'OS Build', 'BitLocker',
        'CrowdStrike Ver', 'Tanium Ver', 'UEMS Ver', 'Last Updated',
      ];
      const rows = filteredData.map(d => [
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
        d.updated_at ? new Date(d.updated_at).toLocaleString('th-TH') : '',
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      // auto column width
      ws['!cols'] = headers.map((h, i) => ({
        wch: Math.max(h.length, ...rows.map(r => String(r[i] || '').length), 10),
      }));
      XLSX.utils.book_append_sheet(wb, ws, 'PC Inventory');
      const label = filterKeys.length > 0 ? `_${filterKeys.map(k => k.label).join('+')}` : '_all';
      const filename = `pc_inventory${label}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast(`✓ Export สำเร็จ: ${filename} (${filteredData.length} รายการ)`);
    } catch (err) {
      console.error('Export list error:', err);
      showToast(`❌ Export ล้มเหลว: ${err.message}`);
    }
  };

  const exportPCDetail = () => {
    try {
      if (!detailData.inv) { showToast('❌ ไม่มีข้อมูล PC ที่จะ export'); return; }
      const wb = XLSX.utils.book_new();

      // Sheet 1: PC Information
      const invFields = [
        ['Field', 'Value'],
        ['Hostname', detailData.inv.hostname],
        ['Computer Type', detailData.inv.computer_type],
        ['Manufacturer', detailData.inv.manufacturer],
        ['Model', detailData.inv.model],
        ['Serial Number', detailData.inv.serial_number],
        ['IP Address', detailData.inv.ip_address],
        ['MAC Address', detailData.inv.mac_address],
        ['Domain', detailData.inv.domain],
        ['Fix Asset', detailData.inv.fix_asset],
        ['Asset Tag', detailData.inv.asset_tag],
        ['Status', detailData.inv.status],
        ['Remark', detailData.inv.remark],
        ['CPU Name', detailData.inv.cpu_name],
        ['CPU Cores', detailData.inv.cpu_cores],
        ['CPU Threads', detailData.inv.cpu_threads],
        ['RAM (GB)', detailData.inv.ram_gb],
        ['GPU', detailData.inv.gpu],
        ['Resolution', detailData.inv.resolution],
        ['BIOS Version', detailData.inv.bios_version],
        ['OS Name', detailData.inv.os_name],
        ['OS Release', detailData.inv.os_release],
        ['OS Build', detailData.inv.os_build],
        ['OS Architecture', detailData.inv.os_arch],
        ['BitLocker Status', detailData.inv.bitlocker],
        ['Secure Boot', detailData.inv.secure_boot],
        ['TPM Present', detailData.inv.tpm_present],
        ['TPM Enabled', detailData.inv.tpm_enabled],
        ['TPM Version', detailData.inv.tpm_version],
        ['UAC Level', detailData.inv.uac_level],
        ['CrowdStrike Ver', detailData.inv.crowdstrike_ver],
        ['Tanium Ver', detailData.inv.tanium_ver],
        ['UEMS Ver', detailData.inv.uems_ver],
        ['Last Patch KB', detailData.inv.last_patch_kb],
        ['Last Patch Date', detailData.inv.last_patch_date],
        ['Net Gateway', detailData.inv.net_gateway],
        ['Net DNS', detailData.inv.net_dns],
        ['Net Subnet', detailData.inv.net_subnet],
        ['Net DHCP', detailData.inv.net_dhcp],
        ['Net Proxy', detailData.inv.net_proxy],
        ['Net Proxy Server', detailData.inv.net_proxy_server],
        ['Last Updated', detailData.inv.updated_at],
      ];
      if (isNotebookType(detailData.inv)) {
        invFields.push(['Battery Status', detailData.inv.battery_status]);
        invFields.push(['Battery Health', detailData.inv.battery_health]);
        invFields.push(['Battery Percent', detailData.inv.battery_percent]);
      }
      const ws1 = XLSX.utils.aoa_to_sheet(invFields);
      XLSX.utils.book_append_sheet(wb, ws1, 'PC Info');

      // Sheet 2: Active Users
      const usersData = [
        ['Username', 'Session Name', 'Session ID', 'State', 'Logon Time'],
        ...detailData.users.map(u => [
          u.username || '—', u.session_name || '—', u.session_id || '—',
          u.state || '—', u.logon_time || '—',
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(usersData), 'Active Users');

      // Sheet 3: Installed Software
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
    if (!d) return '—';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleString('th-TH');
    } catch { return d; }
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

  return (
    <div className="space-y-6">
      {/* Inventory Type Tabs */}
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 mb-3">
                    <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
                      <div className="text-xs font-medium text-gray-500 mb-2">ทั้งหมด</div>
                      <div className="text-2xl font-bold leading-none text-blue-600">{invData.length}</div>
                    </div>
                    <StatBox id="noEdr" label="No EDR" list={sumData?.noEdr} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="noTanium" label="No Tanium" list={sumData?.noTanium} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="noUems" label="No UEMS" list={sumData?.noUems} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="blDisabled" label="BitLocker Off" list={sumData?.blDisabled} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
                    <StatBox id="noAsset" label="No Fix Asset" list={sumData?.noAsset} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />

                    <StatBox id="noBlKeyNotebook" label="No BitLocker Key" list={sumData?.noBlKeyNotebook} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
                    <StatBox id="inactivePC" label="Inactive > 1 Month" list={sumData?.inactivePC} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
                    <StatBox id="lowBatteryHealth" label="Battery Health < 70%" list={sumData?.lowBatteryHealth} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
                    <StatBox id="lowDiskCSpace" label="Disk C Free < 20GB" list={sumData?.lowDiskCSpace} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="oldFixAssets" label="Old Fix Assets" list={sumData?.oldFixAssets} textClass="text-orange-600" bgClass="bg-orange-50" ringClass="ring-orange-500" />
                    <StatBox id="multiLogin" label="Multi-Login Users" list={multiLoginData.allHostnames} textClass="text-purple-600" bgClass="bg-purple-50" ringClass="ring-purple-500" onSecondaryClick={() => setShowMultiLoginModal(true)} />
                    <StatBox id="noLocation" label="No Location" list={sumData?.noLocation} textClass="text-purple-600" bgClass="bg-purple-50" ringClass="ring-purple-500" />
                  </div>

                  {sumData && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
                        <div className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-3">OS Version Distribution</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.keys(sumData.osVersionMap || {}).sort((a, b) => sumData.osVersionMap[b].length - sumData.osVersionMap[a].length).map(k => (
                            <SumTag key={`os:${k}`} id={`os:${k}`} label={k} list={sumData.osVersionMap[k]} btnClass="bg-[#eff4ff] text-[#2563eb] border-[#bfcfff]" />
                          ))}
                        </div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
                        <div className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-3">Computer Type</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.keys(sumData.computerTypeMap || {}).sort((a, b) => sumData.computerTypeMap[b].length - sumData.computerTypeMap[a].length).map(k => (
                            <SumTag key={`type:${k}`} id={`type:${k}`} label={k} list={sumData.computerTypeMap[k]} btnClass="bg-[#f5f3ff] text-[#7c3aed] border-[#ddd6fe]" />
                          ))}
                        </div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
                        <div className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-3">CrowdStrike Version</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.keys(sumData.crowdstrikeVerMap || {}).sort((a, b) => sumData.crowdstrikeVerMap[b].length - sumData.crowdstrikeVerMap[a].length).map(k => (
                            <SumTag key={`cs:${k}`} id={`cs:${k}`} label={k} list={sumData.crowdstrikeVerMap[k]} btnClass="bg-[#ecfeff] text-[#0891b2] border-[#a5f3fc]" />
                          ))}
                        </div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
                        <div className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-3">OS Build</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.keys(sumData.osBuildMap || {}).sort((a, b) => sumData.osBuildMap[b].length - sumData.osBuildMap[a].length).slice(0, 5).map(k => (
                            <SumTag key={`build:${k}`} id={`build:${k}`} label={k} list={sumData.osBuildMap[k]} btnClass="bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ✅ NEW: Sticky active-filter bar + Export list button */}
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

                    {/* ✅ NEW: Export list button — always visible in list view */}
                    <button
                      onClick={exportFilteredList}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 shadow-sm transition-all active:scale-95 whitespace-nowrap"
                    >
                      <Download size={14} />
                      Export {filterKeys.length > 0 ? `(${filteredData.length})` : 'All'}
                    </button>
                  </div>

                    <div className="relative mb-3 flex w-full gap-2">

                    {/* Search Input */}
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Search size={15} /></div>
                      <input
                        type="text"
                        placeholder={
                          searchFieldType === 'all'
                            ? "ค้นหาทุกฟิลด์: hostname, IP, Serial, CPU, Software ฯลฯ"
                            : searchFieldType === 'hostname'
                              ? "ค้นหา Hostname..."
                              : searchFieldType === 'ip_address'
                                ? "ค้นหา IP Address..."
                                : searchFieldType === 'active_usernames'
                                  ? "ค้นหา Username..."
                                  : searchFieldType === 'fix_asset'
                                    ? "ค้นหา Fix Asset..."
                                    : "ค้นหา Serial Number..."
                        }
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

                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('hostname')}>Hostname {sortKey === 'hostname' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('ip_address')}>IP Address {sortKey === 'ip_address' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('active_usernames')}>User {sortKey === 'active_usernames' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('fix_asset')}>Fix Asset {sortKey === 'fix_asset' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('computer_type')}>Computer Type {sortKey === 'computer_type' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('serial_number')}>Serial Number {sortKey === 'serial_number' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('os_name')}>OS {sortKey === 'os_name' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('logon_time')}>Logon Time {sortKey === 'logon_time' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort('bitlocker')}>BitLocker {sortKey === 'bitlocker' ? (sortAsc ? '▲' : '▼') : '↕'}</th>
                            <th className="py-2.5 px-3 font-semibold"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {loading ? (
                            <tr><td colSpan="10"><div className="text-center py-12 text-gray-500 flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div> กำลังโหลดข้อมูล...</div></td></tr>
                          ) : currentList.length === 0 ? (
                            <tr><td colSpan="10"><div className="text-center py-12 text-sm text-gray-400">🖥️ ไม่พบข้อมูล</div></td></tr>
                          ) : currentList.map(d => (
                            <tr key={d.hostname} className="hover:bg-[#eff4ff] cursor-pointer transition-colors group" onClick={() => { setHostname(d.hostname); setView('detail'); }}>
                              <td className="py-2 px-3 text-[13px] font-medium text-gray-900">{d.hostname || '—'}</td>
                              <td className="py-2 px-3 text-[13px] font-mono text-gray-900 font-medium">{d.ip_address || '—'}</td>
                              <td className="py-2 px-3 text-[13px] font-medium text-blue-600">
                                {(() => {
                                  const raw = d.active_usernames || '';
                                  if (!raw) return '—';
                                  const skip = /^(UMFD|DWM|NT AUTHORITY|NETWORK|LOCAL|SYSTEM|ANONYMOUS)/i;
                                  const found = raw.split(',').map(u => {
                                    return u.trim()
                                      .replace(/^[^\\]*\\/, '')  // ลบ domain prefix
                                      .replace(/\$$/, '')         // ลบ $ suffix
                                      .trim();
                                  }).find(u => {
                                    if (!u) return false;
                                    if (skip.test(u)) return false;
                                    // ✅ skip ถ้า clean username ตรงกับ hostname (machine account)
                                    if (u.toLowerCase() === (d.hostname || '').toLowerCase()) return false;
                                    // ✅ skip ถ้าดูเหมือน machine name (มี _ หรือ - และไม่มี .)
                                    if (/^[A-Z0-9]+-[A-Z0-9_-]+$/i.test(u) && !u.includes('.')) return false;
                                    return true;
                                  });
                                  return found || '—';
                                })()}
                              </td>
                              <td className="py-2 px-3 text-[13px] font-mono text-purple-600 font-medium">{d.fix_asset || '—'}</td>
                              <td className="py-2 px-3 text-[13px] text-gray-600">{d.computer_type || '—'}</td>
                              <td className="py-2 px-3 text-[13px] font-mono text-gray-600">{d.serial_number || '—'}</td>
                              <td className="py-2 px-3 text-[13px] text-gray-600">{d.os_name || '—'} {d.os_release || ''}</td>
                              <td className="py-2 px-3 text-[13px] text-gray-600">{fmtDate(d.logon_time)}</td>
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
                              // ถ้าโหลดรูป PC ไม่ขึ้น ให้โชว์ Icon แทน
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
                          <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.users.length} Sessions</span>
                          {detailData.inv.bitlocker === 'Enabled' && <span className="bg-green-50 border border-green-200 text-green-700 rounded-md px-2.5 py-1">BitLocker ON</span>}
                          {detailData.inv.bitlocker === 'Disabled' && <span className="bg-red-50 border border-red-200 text-red-700 rounded-md px-2.5 py-1">BitLocker OFF</span>}
                          {detailData.inv.fix_asset && <span className="bg-blue-50 border border-blue-200 text-blue-600 rounded-md px-2.5 py-1">Asset: {detailData.inv.fix_asset}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="bg-[#eff4ff] text-[#2563eb] border border-[#bfcfff] hover:bg-[#dbeafe] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors" onClick={() => { setModalData({ hostname, assetInput: detailData.inv.fix_asset }); setShowAssetModal(true); }}>Edit Asset</button>
                        {isNotebookType(detailData.inv) && (
                          <button className="bg-[#eff4ff] text-[#2563eb] border border-[#bfcfff] hover:bg-[#dbeafe] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors" onClick={() => { setModalData({ hostname, keyC: detailData.inv.bitlocker_key_c, keyD: detailData.inv.bitlocker_key_d, pin: detailData.inv.bitlocker_pin }); setShowBlModal(true); }}>BitLocker Key</button>
                        )}
                        {/* ✅ NEW: Edit Location button */}
                        <button
                          className="bg-[#eff4ff] text-[#2563eb] border border-[#bfcfff] hover:bg-[#dbeafe] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          onClick={() => setShowLocationModal(true)}
                        >
                          📍 Edit Location
                        </button>
                        <button className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5" onClick={exportPCDetail}><Download size={14} /> Export</button>
                        <button className="bg-red-50 text-red-600 border border-[#fca5a5] hover:bg-red-100 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors" onClick={() => { setModalData({ hostname }); setShowDeleteModal(true); }}>Delete</button>
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
                          {/* CURRENT SESSIONS */}
                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Sessions ปัจจุบัน</div>
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
                          </div>

                          {/* INFORMATION */}
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
                              {/* ✅ NEW: asset_tag, status, remark */}
                              <InfoCell label="Asset Tag" value={detailData.inv.asset_tag} textCol="text-blue-600" />
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

                          {/* HARDWARE */}
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
                              {/* ✅ PARSED: Disk SMART — each disk = its own InfoCell in the same grid */}
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

                              {/* ✅ PARSED: Monitor — each monitor = its own InfoCell in the same grid */}
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

                              {/* ✅ Printer — clickable InfoCell button */}
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

                              {/* ✅ USB Devices — clickable InfoCell button */}
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

                          {/* SYSTEMS */}
                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Systems</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
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
                              {/* ✅ Shutdown Events — clickable InfoCell button */}
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
                              {/* ✅ Timeline / History — clickable InfoCell button */}
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

                          {/* BATTERY / POWER */}
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

                          {/* SECURITY */}
                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Security</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                              <InfoCell label="BitLocker" value={detailData.inv.bitlocker} textCol={detailData.inv.bitlocker === 'Enabled' ? 'text-green-600' : detailData.inv.bitlocker === 'Disabled' ? 'text-red-600' : ''} />
                              <InfoCell label="CrowdStrike Ver" value={detailData.inv.crowdstrike_ver} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="Tanium Ver" value={detailData.inv.tanium_ver} fontCls="font-mono text-[12px] text-gray-500" />
                              <InfoCell label="UEMS Ver" value={detailData.inv.uems_ver} fontCls="font-mono text-[12px] text-gray-500" />
                              {/* ✅ NEW: Secure Boot, TPM, UAC */}
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

                          {/* ✅ NEW: NETWORK */}
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
                          {/* ✅ NEW: MAP VIEW TAB */}
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

                          {/* SOFTWARE */}
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
                                      {/* ✅ FIX: use toggleSoftwareSort for correct key tracking */}
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

      {/* --- MODALS --- */}
      {showAssetModal && (
        <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-7 w-full max-w-[440px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-[16px] font-bold mb-1">Edit Fix Asset</h3>
            <div className="text-[13px] text-gray-500 mb-5">Hostname: {modalData.hostname}</div>
            <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Fix Asset Number</label>
            <input type="text" value={modalData.assetInput || ''} onChange={e => setModalData({ ...modalData, assetInput: e.target.value })} placeholder="e.g. DCI-IT-00123" className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-600 outline-none transition-colors font-mono" />
            {/* ✅ inline validation hint */}
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

                  // สีจาก field + direction
                  let dotColor = 'bg-gray-300';
                  let badgeClass = 'bg-gray-100 text-gray-500';
                  let badgeLabel = 'Changed';
                  if (isAdded) { dotColor = 'bg-green-400'; badgeClass = 'bg-green-100 text-green-700'; badgeLabel = 'SW Added'; }
                  if (isRemoved) { dotColor = 'bg-red-400'; badgeClass = 'bg-red-100 text-red-700'; badgeLabel = 'SW Removed'; }
                  if (isField && isSecurity) {
                    const isWorse = ['Disabled', 'false', 'False', '0', 'Not Admin'].includes(h.new_value) ||
                      h.field_name === 'Local Admin' && h.new_value === 'Admin';
                    dotColor = isWorse ? 'bg-red-400' : 'bg-blue-400';
                    badgeClass = isWorse ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700';
                    badgeLabel = 'Security';
                  }
                  if (isField && ['OS Build', 'OS Release', 'Last Patch KB'].includes(h.field_name)) {
                    dotColor = 'bg-emerald-400'; badgeClass = 'bg-emerald-100 text-emerald-700'; badgeLabel = 'Update';
                  }

                  return (
                    <div key={h.id} className="flex items-start gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                      {/* dot */}
                      <div className="flex flex-col items-center pt-1 shrink-0">
                        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`}></div>
                        {i < historyData.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" style={{ minHeight: '24px' }}></div>}
                      </div>
                      {/* content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeClass}`}>{badgeLabel}</span>
                          <span className="text-[13px] font-medium text-gray-800">
                            {isField ? h.field_name : (isAdded ? h.new_value : h.old_value)}
                          </span>
                        </div>
                        {isField && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[12px] text-gray-400 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 max-w-[240px] truncate" title={h.old_value}>{h.old_value || '—'}</span>
                            <span className="text-[10px] text-gray-400">→</span>
                            <span className="text-[12px] text-gray-700 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 max-w-[240px] truncate" title={h.new_value}>{h.new_value || '—'}</span>
                          </div>
                        )}
                      </div>
                      {/* timestamp */}
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
      {/* ✅ NEW: Location Modal */}
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
      {toastMsg && (
        <div className="fixed bottom-5 left-5 bg-[#16a34a] text-white px-4 py-3 rounded-lg text-[13px] font-medium shadow-lg z-[9999] animate-in slide-in-from-bottom-5 duration-300">
          {toastMsg}
        </div>
      )}

      {inventoryType === 'mo' && <MOInventoryPage />}
    </div>
  );
};

export default PCInventoryPage;