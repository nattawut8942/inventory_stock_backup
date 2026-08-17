import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, RefreshCw, ChevronLeft, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { API_BASE } from '../config/api';
import Portal from '../components/Portal';
import LocationSelectorModal from './LocationSelectorModal';
import MapViewTab from './MapViewTab';
import AlertModal from '../components/AlertModal';


// ─── Debounce hook ────────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Shared key→hostname resolver ────────────────────────────────────────────
function resolveFilterKey(key, sumData) {
  if (!sumData) return [];
const direct = {
  noCrowdstrike: sumData.noCrowdstrike,
  noTanium: sumData.noTanium,
  noUems: sumData.noUems,
  notActivated: sumData.notActivated,
  noFixAsset: sumData.noFixAsset,
  adminUsers: sumData.adminUsers,
  notUpdated: sumData.notUpdated,
  oldFixAssets: sumData.oldFixAssets,
  notDomainJoined: sumData.notDomainJoined,
  noLocation: sumData.noLocation,
  longUptime: sumData.longUptime,
  inactive: sumData.inactive,   // ✅ เพิ่ม
};
  if (key in direct) return direct[key] || [];
  const prefix = [
    ['cs:', sumData.crowdstrikeVerMap],
    ['tanium:', sumData.taniumVerMap],
    ['uems:', sumData.uemsVerMap],
    ['mfr:', sumData.manufacturerMap],
    ['model:', sumData.modelMap],
    ['osname:', sumData.osNameMap],
    ['osrel:', sumData.osReleaseMap],
    ['osbuild:', sumData.osBuildMap],
    ['osarch:', sumData.osArchMap],
    ['wifi:', sumData.wifiMap],
    ['adapter:', sumData.adapterMap],
    ['subnet:', sumData.subnetMap],
  ];
  for (const [p, map] of prefix) {
    if (key.startsWith(p)) return (map || {})[key.slice(p.length)] || [];
  }
  return [];
}

const MOInventoryPage = () => {
  const [view, setView] = useState('list');
  const [hostname, setHostname] = useState(null);

  const [invData, setInvData] = useState([]);
  const [sumData, setSumData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [modalData, setModalData] = useState({});

  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareSortKey, setSoftwareSortKey] = useState('name');
  const [softwareSortAsc, setSoftwareSortAsc] = useState(true);
  const [softwarePage, setSoftwarePage] = useState(1);
  const softwarePageSize = 20;

  const [factoryLayouts, setFactoryLayouts] = useState([]);
  const [locationData, setLocationData] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  // ── NEW: History & Shutdown Events ───────────────────────────────────────
  const [historyData, setHistoryData] = useState([]);          // field_changed + software_*
  const [shutdownData, setShutdownData] = useState([]);        // system_event
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showShutdownModal, setShowShutdownModal] = useState(false);

  // ─── Session Management ───────────────────────────────────────────────────
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    if (sessionLoaded) return;
    const saved = sessionStorage.getItem('mo-inventory-session');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setSearchQuery(s.searchQuery || '');
        setFilterKeys(s.filterKeys || []);
        setSortKey(s.sortKey || 'updated_at');
        setSortAsc(s.sortAsc || false);
        setPage(s.page || 1);
        setSoftwareSearch(s.softwareSearch || '');
        setSoftwareSortKey(s.softwareSortKey || 'name');
        setSoftwareSortAsc(s.softwareSortAsc !== undefined ? s.softwareSortAsc : true);
        setSoftwarePage(s.softwarePage || 1);
        setView(s.view || 'list');
        setHostname(s.hostname || null);
      } catch (err) {
        console.warn('Failed to load MO session:', err);
      }
    }
    setSessionLoaded(true);
  }, []);

  useEffect(() => {
    if (!sessionLoaded) return;
    sessionStorage.setItem('mo-inventory-session', JSON.stringify({
      searchQuery, filterKeys, sortKey, sortAsc, page,
      softwareSearch, softwareSortKey, softwareSortAsc, softwarePage,
      view, hostname,
    }));
  }, [searchQuery, filterKeys, sortKey, sortAsc, page,
    softwareSearch, softwareSortKey, softwareSortAsc, softwarePage,
    view, hostname, sessionLoaded]);

  useEffect(() => {
    if (!sessionLoaded) return;
    if (view === 'list') fetchData();
    else if (view === 'detail' && hostname) fetchDetail(hostname);
  }, [view, hostname, sessionLoaded]);

  useEffect(() => {
    if (view === 'detail' && hostname) {
      fetchFactoryLayouts();
      fetchMOLocation(hostname);
    }
  }, [view, hostname]);

  // ─── Debounced search ─────────────────────────────────────────────────────
  const prevSearchRef = useRef('');
  useEffect(() => {
    const prev = prevSearchRef.current;
    prevSearchRef.current = debouncedSearch;
    if (debouncedSearch.length >= 2) {
      (async () => {
        try {
          let url = `${API_BASE}/mo-inventory/search?q=${encodeURIComponent(debouncedSearch)}`;
          if (searchFieldType !== 'all') url += `&field=${encodeURIComponent(searchFieldType)}`;
          const res = await fetch(url).then(r => r.json());
          if (res.success) { setInvData(res.data || []); setPage(1); }
        } catch (_) { }
      })();
    } else if (debouncedSearch.length === 0 && prev.length > 0) {
      fetchData();
    }
  }, [debouncedSearch, searchFieldType]);

  // ─── Data fetching ────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true); setError('');
    try {
      const [invRes, sumRes] = await Promise.all([
        fetch(`${API_BASE}/mo-inventory`).then(r => r.json()),
        fetch(`${API_BASE}/mo-inventory/summary`).then(r => r.json()),
      ]);
      if (!invRes.success) throw new Error(invRes.error || 'Failed');
      if (searchQuery.length >= 2) {
        const res = await fetch(
          `${API_BASE}/mo-inventory/search?q=${encodeURIComponent(searchQuery)}`
        ).then(r => r.json());
        if (res.success) setInvData(res.data || []);
      } else {
        setInvData(invRes.data || []);
      }
      setSumData(sumRes.success ? sumRes.data : null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const fetchFactoryLayouts = async () => {
    try {
      const res = await fetch(`${API_BASE}/factory-layouts`).then(r => r.json());
      if (res.success) setFactoryLayouts(res.data || []);
    } catch (err) { console.error(err); }
  };

  const fetchMOLocation = async (hn) => {
    setLocationLoading(true);
    try {
      const res = await fetch(`${API_BASE}/mo-location/${encodeURIComponent(hn)}`).then(r => r.json());
      if (res.success) setLocationData(res.data);
    } catch (err) { setLocationData(null); }
    finally { setLocationLoading(false); }
  };

  const fetchDetail = async (hn) => {
    setDetailLoading(true);
    setError('');
    // ✅ reset ก่อน fetch ป้องกัน stale data ค้างระหว่าง loading
    setHistoryData([]);
    setShutdownData([]);
    setDetailData({ inv: null, users: [], software: [] });
    try {
      const safe = async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return { success: false, data: null };
          return r.json();
        } catch { return { success: false, data: null }; }
      };

      // ── fetch ทุกอย่างพร้อมกัน รวม history ด้วย ──
      const [ir, ur, sr, hr] = await Promise.all([
        safe(`${API_BASE}/mo-inventory/${encodeURIComponent(hn)}`),
        safe(`${API_BASE}/mo-active-users/${encodeURIComponent(hn)}`),
        safe(`${API_BASE}/mo-inventory/${encodeURIComponent(hn)}/software`),
        safe(`${API_BASE}/mo-inventory/${encodeURIComponent(hn)}/history`),
      ]);

      if (!ir?.success || !ir.data)
        throw new Error('ไม่พบข้อมูลจอภาพนี้ในระบบ (Monitor Data Not Found)');

      setDetailData({
        inv: ir.data,
        users: ur?.success ? ur.data : [],
        software: sr?.success ? sr.data : [],
      });

      // ── แยก history ออกเป็น 2 กลุ่ม ──
      const allHistory = hr?.success ? hr.data : [];
      setHistoryData(allHistory.filter(h => h.change_type !== 'system_event'));
      setShutdownData(allHistory.filter(h => h.change_type === 'system_event'));

      setSoftwarePage(1);
      setSoftwareSearch('');
    } catch (err) {
      console.error('fetchDetail error:', err);
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  // ─── Filter / Sort ────────────────────────────────────────────────────────
  const toggleFilter = (key, label) => {
    setFilterKeys(prev =>
      prev.find(p => p.key === key) ? prev.filter(p => p.key !== key) : [...prev, { key, label }]
    );
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

  const onSearchInput = (e) => { setSearchQuery(e.target.value); setPage(1); };

  const filteredData = useMemo(() => {
    let result = [...invData];
    if (filterKeys.length > 0 && sumData) {
      const sets = filterKeys.map(fk => new Set(resolveFilterKey(fk.key, sumData)));
      const intersection = sets.reduce((acc, s) => new Set([...acc].filter(x => s.has(x))));
      result = result.filter(d => intersection.has(d.hostname));
    }
    if (searchQuery.length === 1) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => Object.values(d).join(' ').toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const av = (a[sortKey] || '').toString().toLowerCase();
      const bv = (b[sortKey] || '').toString().toLowerCase();
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return result;
  }, [invData, filterKeys, searchQuery, sortKey, sortAsc, sumData]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentList = filteredData.slice((page - 1) * pageSize, page * pageSize);

  const softwareFiltered = useMemo(() => {
    let r = detailData.software.filter(s => {
      if (!softwareSearch) return true;
      const q = softwareSearch.toLowerCase();
      return (s.name || '').toLowerCase().includes(q)
        || (s.version || '').toLowerCase().includes(q)
        || (s.publisher || '').toLowerCase().includes(q);
    });
    r.sort((a, b) => {
      const av = (a[softwareSortKey] || '').toString().toLowerCase();
      const bv = (b[softwareSortKey] || '').toString().toLowerCase();
      return softwareSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return r;
  }, [detailData.software, softwareSearch, softwareSortKey, softwareSortAsc]);

  // ─── Actions ──────────────────────────────────────────────────────────────
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

  const clearSession = () => {
    sessionStorage.removeItem('mo-inventory-session');
    setSearchQuery(''); setFilterKeys([]); setSortKey('updated_at'); setSortAsc(false);
    setPage(1); setSoftwareSearch(''); setSoftwareSortKey('name'); setSoftwareSortAsc(true);
    setSoftwarePage(1); setView('list'); setHostname(null);
    showToast('Session cleared');
    fetchData();
  };

  const saveAsset = async () => {
    const asset = (modalData.assetInput || '').trim();
    if (asset && !/^[A-Za-z0-9\-_.]+$/.test(asset)) {
      // ข้อความ validation แสดงอยู่ใต้ input ในโมดัลอยู่แล้ว ไม่ต้อง alert ซ้ำ
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/mo-inventory/${encodeURIComponent(modalData.hostname)}/asset`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix_asset: asset }) }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast('✓ บันทึกข้อมูล Fix Asset เรียบร้อย');
      setShowAssetModal(false);
      fetchDetail(modalData.hostname);
    } catch (err) { showToast(`❌ ${err.message}`); }
  };

const confirmDelete = async () => {
    try {
      const res = await fetch(`${API_BASE}/mo-inventory/${encodeURIComponent(modalData.hostname)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setShowDeleteModal(false);
      setView('list');
      setHostname(null);
      showToast('✓ ลบข้อมูลเรียบร้อย');
    } catch (err) { showToast(`❌ ${err.message}`); }
  };

  const exportFilteredList = () => {
    try {
      if (filteredData.length === 0) { showToast('❌ ไม่มีข้อมูลที่จะ export'); return; }
      const wb = XLSX.utils.book_new();
      const headers = [
        'Hostname', 'IP Address', 'User', 'Fix Asset', 'Local Admin',
        'Serial Number', 'OS', 'OS Build', 'Activation',
        'CrowdStrike Ver', 'Tanium Ver', 'UEMS Ver',
        'Domain', 'Manufacturer', 'Model', 'Last Updated',
      ];
      const rows = filteredData.map(d => [
        d.hostname || '', d.ip_address || '', d.active_usernames || '',
        d.fix_asset || '', d.local_admin_users || '', d.serial_number || '',
        `${d.os_name || ''} ${d.os_release || ''}`.trim(), d.os_build || '',
        d.os_activation || '', d.crowdstrike_ver || '', d.tanium_ver || '',
        d.uems_ver || '', d.domain || '', d.manufacturer || '', d.model || '',
        d.updated_at ? new Date(d.updated_at).toLocaleString('th-TH') : '',
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = headers.map((h, i) => ({
        wch: Math.max(h.length, ...rows.map(r => String(r[i] || '').length), 10),
      }));
      XLSX.utils.book_append_sheet(wb, ws, 'Monitor Inventory');
      const label = filterKeys.length > 0 ? `_${filterKeys.map(k => k.label).join('+')}` : '_all';
      const filename = `mo_inventory${label}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast(`✓ Export สำเร็จ: ${filename} (${filteredData.length} รายการ)`);
    } catch (err) {
      showToast(`❌ Export ล้มเหลว: ${err.message}`);
    }
  };

  const exportMODetail = () => {
    try {
      if (!detailData.inv) { showToast('❌ ไม่มีข้อมูล Monitor ที่จะ export'); return; }
      const wb = XLSX.utils.book_new();
      const inv = detailData.inv;
      const ws1 = XLSX.utils.aoa_to_sheet([
        ['Field', 'Value'],
        ['Hostname', inv.hostname], ['IP Address', inv.ip_address], ['MAC Address', inv.mac_address],
        ['Fix Asset', inv.fix_asset], ['Domain', inv.domain], ['Manufacturer', inv.manufacturer],
        ['Model', inv.model], ['Serial Number', inv.serial_number], ['WiFi SSID', inv.wifi_ssid],
        ['Adapter Type', inv.adapter_type], ['Local Admin Users', inv.local_admin_users],
        ['User Count', inv.user_count], ['PC Status', inv.pc_status],
        ['OS Name', inv.os_name], ['OS Release', inv.os_release], ['OS Build', inv.os_build],
        ['OS Full Version', inv.os_full_version], ['Architecture', inv.os_arch],
        ['Product Key', inv.os_product_key], ['Product ID', inv.os_product_id],
        ['Activation Status', inv.os_activation], ['Install Date', inv.os_install_date],
        ['Last Boot', inv.last_boot], ['Uptime', inv.uptime],
        ['CPU Name', inv.cpu_name], ['CPU Cores', inv.cpu_cores], ['CPU Threads', inv.cpu_threads],
        ['RAM Info', inv.ram_info], ['RAM Detail', inv.ram_detail], ['Disk Info', inv.disk_info],
        ['GPU', inv.gpu], ['Resolution', inv.resolution], ['BIOS Version', inv.bios_version],
        ['BitLocker', inv.bitlocker], ['CrowdStrike Ver', inv.crowdstrike_ver],
        ['Tanium Ver', inv.tanium_ver], ['UEMS Ver', inv.uems_ver],
        ['Last Patch KB', inv.last_patch_kb], ['Last Patch Date', inv.last_patch_date],
        ['Data Collected', inv.collected_at], ['Last Updated', inv.updated_at],
      ]);
      XLSX.utils.book_append_sheet(wb, ws1, 'Monitor Info');
      const ws2 = XLSX.utils.aoa_to_sheet([
        ['Username', 'Session Name', 'Session ID', 'State', 'Logon Time'],
        ...detailData.users.map(u => [u.username || '—', u.session_name || '—', u.session_id || '—', u.state || '—', u.logon_time || '—']),
      ]);
      XLSX.utils.book_append_sheet(wb, ws2, 'Active Users');
      const ws3 = XLSX.utils.aoa_to_sheet([
        ['Name', 'Version', 'Publisher', 'Install Location', 'Size (MB)'],
        ...detailData.software.map(s => [s.name || '—', s.version || '—', s.publisher || '—', s.install_location || '—', s.size_mb || '—']),
      ]);
      XLSX.utils.book_append_sheet(wb, ws3, 'Software');
      // ── Sheet 4: History ──
      if (historyData.length > 0) {
        const ws4 = XLSX.utils.aoa_to_sheet([
          ['Type', 'Field', 'Old Value', 'New Value', 'Changed At'],
          ...historyData.map(h => [h.change_type, h.field_name, h.old_value || '', h.new_value || '', h.changed_at]),
        ]);
        XLSX.utils.book_append_sheet(wb, ws4, 'History');
      }
      // ── Sheet 5: Shutdown Events ──
      if (shutdownData.length > 0) {
        const ws5 = XLSX.utils.aoa_to_sheet([
          ['Event Type', 'Event Info', 'Time'],
          ...shutdownData.map(h => [h.field_name, h.new_value || '', h.changed_at]),
        ]);
        XLSX.utils.book_append_sheet(wb, ws5, 'Shutdown Events');
      }
      const filename = `${hostname}_monitor_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast(`✓ Export สำเร็จ: ${filename}`);
    } catch (err) {
      showToast(`❌ Export ล้มเหลว: ${err.message}`);
    }
  };

  // ─── Sub-components ───────────────────────────────────────────────────────
  const StatBox = ({ id, label, list, bgClass, textClass, ringClass }) => {
    const isOn = filterKeys.find(k => k.key === id);
    const count = list?.length || 0;
    const clickable = count > 0 || isOn;
    return (
      <div onClick={() => { if (clickable) toggleFilter(id, label); }}
        className={`bg-white border rounded-xl p-3 px-3.5 shadow-sm transition-all
          ${clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : 'opacity-70'}
          ${isOn ? `${ringClass} ring-2 ring-offset-2 ${bgClass}` : 'border-gray-200'}`}>
        <div className="text-xs font-medium text-gray-500 mb-2">{label}</div>
        <div className={`text-2xl font-bold leading-none ${textClass}`}>{count}</div>
        {clickable
          ? <div className="text-[11px] text-gray-400 mt-1.5">{isOn ? '✕ คลิกซ้ำเพื่อล้าง' : '☞ คลิกเพื่อ filter'}</div>
          : <div className="text-[11px] text-transparent mt-1.5 select-none">-</div>}
      </div>
    );
  };

  const SumTag = ({ id, label, list, btnClass }) => {
    const isOn = filterKeys.find(k => k.key === id);
    const count = list?.length || 0;
    if (count === 0 && !isOn) return null;
    return (
      <div onClick={() => toggleFilter(id, label)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
          cursor-pointer transition-all border select-none hover:-translate-y-[1px] shadow-sm
          ${btnClass} ${isOn ? 'ring-2 ring-offset-1 border-transparent shadow-md filter contrast-125' : ''}`}>
        <span>{label}</span>
        <span className="bg-black/10 rounded-md px-1.5 py-[1px] text-[10px] tabular-nums">{count}</span>
      </div>
    );
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleString('th-TH'); }
    catch { return d; }
  };

  const isRealAdmin = (val) => {
    const v = (val || '').toLowerCase().trim();
    return v.includes('admin') && v !== 'not admin';
  };

  const distRows = sumData ? [
    [
      { key: 'cs', label: 'CrowdStrike', map: sumData.crowdstrikeVerMap, prefix: 'cs:', btnClass: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
      { key: 'tan', label: 'Tanium', map: sumData.taniumVerMap, prefix: 'tanium:', btnClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    ],
    [
      { key: 'subnet', label: 'IP Subnet', map: sumData.subnetMap, prefix: 'subnet:', btnClass: 'bg-blue-50 text-blue-700 border-blue-200' },
      { key: 'mfr', label: 'Manufacturer', map: sumData.manufacturerMap, prefix: 'mfr:', btnClass: 'bg-rose-50 text-rose-700 border-rose-200' },
    ],
    [
      { key: 'model', label: 'Model', map: sumData.modelMap, prefix: 'model:', btnClass: 'bg-violet-50 text-violet-700 border-violet-200', limit: 6 },
      { key: 'osbuild', label: 'OS Build', map: sumData.osBuildMap, prefix: 'osbuild:', btnClass: 'bg-orange-50 text-orange-700 border-orange-200', limit: 4 },
    ],
    [
      { key: 'osrel', label: 'OS Release', map: sumData.osReleaseMap, prefix: 'osrel:', btnClass: 'bg-slate-100 text-slate-700 border-slate-300', limit: 4 },
      { key: 'osname', label: 'OS Name', map: sumData.osNameMap, prefix: 'osname:', btnClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    ],
    [
      { key: 'adapter', label: 'Adapter Type', map: sumData.adapterMap, prefix: 'adapter:', btnClass: 'bg-amber-50 text-amber-800 border-amber-200' },
      { key: 'wifi', label: 'WiFi SSID', map: sumData.wifiMap, prefix: 'wifi:', btnClass: 'bg-teal-50 text-teal-700 border-teal-200', limit: 5 },
    ],
  ] : [];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800">MONITOR INVENTORY</h2>
          <p className="text-slate-500 font-medium">ระบบบริหารจัดการและตรวจสอบสถานะจอภาพแบบเรียลไทม์</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-3 py-1.5 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Monitor
          </div>
          <button onClick={view === 'list' ? fetchData : () => fetchDetail(hostname)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all bg-white border border-slate-200 text-slate-600 hover:border-indigo-500 hover:text-indigo-600 shadow-sm hover:shadow active:scale-95">
            <RefreshCw size={16} className={loading || detailLoading ? 'animate-spin text-indigo-500' : ''} /> Refresh
          </button>
        </div>
      </motion.div>

      <div className="animate-in fade-in duration-300">

        {/* ════════════ LIST VIEW ════════════ */}
        {view === 'list' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {error && <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-[13px] text-red-600 mb-4 font-semibold">⚠️ {error}</div>}

            {/* StatBoxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-3">
              <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
                <div className="text-xs font-medium text-gray-500 mb-2">ทั้งหมด</div>
                <div className="text-2xl font-bold leading-none text-blue-600">{invData.length}</div>
              </div>
              <StatBox id="noCrowdstrike" label="No CrowdStrike" list={sumData?.noCrowdstrike} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
              <StatBox id="noTanium" label="No Tanium" list={sumData?.noTanium} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
              <StatBox id="noUems" label="No UEMS" list={sumData?.noUems} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
              <StatBox id="notActivated" label="OS Not Activated" list={sumData?.notActivated} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
              <StatBox id="noFixAsset" label="No Fix Asset" list={sumData?.noFixAsset} textClass="text-amber-600" bgClass="bg-amber-50" ringClass="ring-amber-500" />
              <StatBox id="adminUsers" label="With Admin Users" list={sumData?.adminUsers} textClass="text-orange-600" bgClass="bg-orange-50" ringClass="ring-orange-500" />
              <StatBox id="notUpdated" label="Not Updated > 30d" list={sumData?.notUpdated} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
              <StatBox id="oldFixAssets" label="Fix Asset > 5 ปี" list={sumData?.oldFixAssets} textClass="text-orange-600" bgClass="bg-orange-50" ringClass="ring-orange-500" />
              <StatBox id="notDomainJoined" label="Not Domain Joined" list={sumData?.notDomainJoined} textClass="text-purple-600" bgClass="bg-purple-50" ringClass="ring-purple-500" />
              <StatBox id="noLocation" label="No Location" list={sumData?.noLocation} textClass="text-purple-600" bgClass="bg-purple-50" ringClass="ring-purple-500" />
              <StatBox id="longUptime" label="Uptime > 10 วัน" list={sumData?.longUptime} textClass="text-sky-600" bgClass="bg-sky-50" ringClass="ring-sky-500" />
              <StatBox id="inactive" label="ไม่ได้ใช้งาน" list={sumData?.inactive}
  textClass="text-gray-500" bgClass="bg-gray-100" ringClass="ring-gray-400" />
            </div>

            {/* Distribution cards */}
            {sumData && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
                {distRows.map((row, rowIdx, rows) => (
                  <div key={rowIdx} className={`grid grid-cols-2 ${rowIdx < rows.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    {row.map((col, colIdx) => {
                      if (!col) return <div key="empty" />;
                      const { key, label, map, prefix, btnClass, limit } = col;
                      const entries = Object.keys(map || {})
                        .filter(k => (map[k] || []).length > 0)
                        .sort((a, b) => (map[b] || []).length - (map[a] || []).length)
                        .slice(0, limit);
                      if (entries.length === 0) return <div key={key} />;
                      return (
                        <div key={key} className={`px-4 py-2.5 ${colIdx === 0 ? 'border-r border-gray-100' : ''}`}>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {entries.map(k => (
                              <SumTag key={`${prefix}${k}`} id={`${prefix}${k}`} label={k} list={map[k]} btnClass={btnClass} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Filter bar + Export */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {filterKeys.length > 0 && (
                <div className="flex flex-1 items-center gap-2 bg-[#eff4ff] border border-[#bfcfff] rounded-xl px-3.5 py-2 text-[13px] font-medium text-[#2563eb] shadow-sm">
                  ☞ Filter: <b>{filterKeys.map(k => k.label).join(' + ')}</b>
                  <span className="text-gray-500 text-xs ml-1">({filteredData.length} เครื่อง)</span>
                  <button onClick={() => setFilterKeys([])}
                    className="ml-auto bg-transparent border border-[#bfcfff] px-2 py-0.5 rounded flex items-center gap-1 text-xs hover:bg-[#bfcfff] transition-colors">
                    <X size={12} /> ล้าง
                  </button>
                </div>
              )}
              <button onClick={exportFilteredList}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 shadow-sm transition-all active:scale-95 whitespace-nowrap">
                <Download size={14} />
                Export {filterKeys.length > 0 ? `(${filteredData.length})` : 'All'}
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-3 flex w-full gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Search size={15} /></div>
                <input type="text"
                  placeholder="ค้นหาทุกฟิลด์: hostname, IP, Serial, Manufacturer ฯลฯ"
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-9 pr-4 text-[13px] outline-none shadow-sm focus:border-blue-500 transition-colors"
                  value={searchQuery} onChange={onSearchInput} />
                {searchQuery.length >= 2 && searchQuery !== debouncedSearch && (
                  <div className="absolute inset-y-0 right-3 flex items-center">
                    <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
                    <tr>
                      {[['hostname', 'Hostname'], ['ip_address', 'IP Address'], ['active_usernames', 'User'],
                        ['fix_asset', 'Fix Asset'], ['local_admin_users', 'Local Admin'], ['serial_number', 'Serial Number'],
                        ['os_name', 'OS'], ['os_activation', 'Activation'], ['logon_time', 'Logon Time']].map(([k, lbl]) => (
                        <th key={k} className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort(k)}>
                          {lbl} {sortKey === k ? (sortAsc ? '▲' : '▼') : '↕'}
                        </th>
                      ))}
                      <th className="py-2.5 px-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr><td colSpan="10"><div className="text-center py-12 text-gray-500 flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" /> กำลังโหลดข้อมูล...
                      </div></td></tr>
                    ) : currentList.length === 0 ? (
                      <tr><td colSpan="10"><div className="text-center py-12 text-sm text-gray-400">🖥️ ไม่พบข้อมูล</div></td></tr>
                    ) : currentList.map(d => (
                       <tr key={d.hostname}
    className={`hover:bg-[#eff4ff] cursor-pointer transition-colors group ${d.pc_status === 'Inactive' ? 'opacity-50' : ''}`}
    onClick={() => { setHostname(d.hostname); setView('detail'); }}>
                        <td className="py-2 px-3 text-[13px] font-medium text-gray-900">{d.hostname || '—'}</td>
                        <td className="py-2 px-3 text-[13px] font-mono font-medium">{d.ip_address || '—'}</td>
                        <td className="py-2 px-3 text-[13px] font-medium text-blue-600">{(d.active_usernames || '—').split(',')[0]}</td>
                        <td className="py-2 px-3 text-[13px] font-mono text-purple-600 font-medium">{d.fix_asset || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold
                            ${isRealAdmin(d.local_admin_users) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full mr-1 ${isRealAdmin(d.local_admin_users) ? 'bg-red-500' : 'bg-green-500'}`} />
                            {d.local_admin_users ? d.local_admin_users.charAt(0).toUpperCase() + d.local_admin_users.slice(1) : '—'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[13px] font-mono text-gray-600">{d.serial_number || '—'}</td>
                        <td className="py-2 px-3 text-[13px] text-gray-600">{d.os_name || '—'} {d.os_release || ''}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold
                            ${d.os_activation === 'Activated' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${d.os_activation === 'Activated' ? 'bg-green-500' : 'bg-amber-500'}`} />
                            {d.os_activation || '—'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[13px] text-gray-600">{fmtDate(d.logon_time)}</td>
                        <td className="py-2 px-3 text-right text-gray-400 font-bold group-hover:text-blue-500">›</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500 bg-white">
                <span>{(page - 1) * pageSize + (filteredData.length ? 1 : 0)}–{Math.min(page * pageSize, filteredData.length)} จาก {filteredData.length} รายการ</span>
                <div className="flex gap-1.5">
                  <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors"
                    disabled={page <= 1} onClick={() => setPage(page - 1)}>← ก่อน</button>
                  <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors"
                    disabled={page >= totalPages} onClick={() => setPage(page + 1)}>ถัดไป →</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ════════════ DETAIL VIEW ════════════ */}
        {view === 'detail' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <button onClick={() => { setView('list'); setHostname(null); }}
              className="flex items-center gap-2 bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 mb-5 transition-all">
              <ChevronLeft size={16} /> กลับหน้ารายการ
            </button>

            {detailLoading ? (
              <div className="flex justify-center items-center py-16 text-gray-500 text-sm gap-2">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" /> กำลังโหลด {hostname}...
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-[13.5px] text-red-600 mb-4 font-semibold">⚠️ {error}</div>
            ) : detailData.inv ? (
              <>
                {/* Hero */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-5 flex flex-wrap items-center gap-5">
                  <div className="w-14 h-14 rounded-[14px] bg-[#eff4ff] border border-[#bfcfff] flex items-center justify-center text-[26px] shrink-0">🖥️</div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-[20px] font-bold text-gray-900 mb-1">{hostname}</div>
                    <div className="text-[13px] text-gray-500 mb-2.5">{detailData.inv.manufacturer || '—'} {detailData.inv.model || ''} · {detailData.inv.ip_address || '—'}</div>
                    <div className="flex flex-wrap gap-1.5 text-[12px] font-medium">
                      {detailData.inv.manufacturer && <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.manufacturer}</span>}
                      <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.os_name || '—'}</span>
                      <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.os_arch || '—'}</span>
                      <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.users.length} Sessions</span>
                      {detailData.inv.os_activation === 'Activated'
                        ? <span className="bg-green-50 border border-green-200 text-green-700 rounded-md px-2.5 py-1">OS Activated</span>
                        : <span className="bg-amber-50 border border-amber-200 text-amber-700 rounded-md px-2.5 py-1">OS Not Activated</span>}
                      {detailData.inv.fix_asset && <span className="bg-blue-50 border border-blue-200 text-blue-600 rounded-md px-2.5 py-1">Asset: {detailData.inv.fix_asset}</span>}
                      {/* ── history badge ── */}
                      {historyData.length > 0 && (
                        <span className="bg-violet-50 border border-violet-200 text-violet-700 rounded-md px-2.5 py-1">
                          {historyData.length} History
                        </span>
                      )}
                      {shutdownData.length > 0 && (
                        <span className="bg-amber-50 border border-amber-200 text-amber-700 rounded-md px-2.5 py-1">
                          {shutdownData.length} Events
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => { setModalData({ hostname, assetInput: detailData.inv.fix_asset }); setShowAssetModal(true); }}
                      className="bg-[#eff4ff] text-[#2563eb] border border-[#bfcfff] hover:bg-[#dbeafe] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                      Edit Asset
                    </button>
                    <button className="bg-[#eff4ff] text-[#2563eb] border border-[#bfcfff] hover:bg-[#dbeafe] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      onClick={() => setShowLocationModal(true)}>
                      📍 Edit Location
                    </button>
                    <button onClick={exportMODetail}
                      className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5">
                      <Download size={14} /> Export
                    </button>
                    <button onClick={() => { setModalData({ hostname }); setShowDeleteModal(true); }}
                      className="bg-red-50 text-red-600 border border-[#fca5a5] hover:bg-red-100 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                      Delete
                    </button>
                    <button
onClick={async () => {
    const newStatus = detailData.inv.pc_status === 'Inactive' ? 'Active' : 'Inactive';
    try {
      const res = await fetch(`${API_BASE}/mo-inventory/${encodeURIComponent(hostname)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pc_status: newStatus }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast(`✓ เปลี่ยนสถานะเป็น ${newStatus === 'Inactive' ? 'ไม่ได้ใช้งาน' : 'ใช้งานปกติ'}`);
      fetchDetail(hostname);
    } catch (err) { showToast(`❌ ${err.message}`); }
  }}
  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
    detailData.inv.pc_status === 'Inactive'
      ? 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
      : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
  }`}>
  {detailData.inv.pc_status === 'Inactive' ? '✓ Reactivate' : '⏸ Mark Inactive'}
</button>
                  </div>
                </div>

                {/* Sections */}
                {(() => {
                  const inv = detailData.inv;
                  const InfoCell = ({ label, value, fontCls, textCol }) => (
                    <div className="bg-white p-3.5 px-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
                      <div className={`text-[13.5px] font-medium ${fontCls || ''} ${value == null || value === '' ? 'text-gray-400 italic' : textCol || 'text-gray-900'}`}>
                        {value == null || value === '' ? '—' : value}
                      </div>
                    </div>
                  );

                  return (
                    <div className="space-y-6">

                      {/* Sessions */}
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Sessions ปัจจุบัน</div>
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-[13px]">
                            <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
                              <tr>
                                <th className="py-2 px-3">Username</th><th className="py-2 px-3">Session Name</th>
                                <th className="py-2 px-3">Session ID</th><th className="py-2 px-3">State</th>
                                <th className="py-2 px-3">Logon Time</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {detailData.users.length === 0
                                ? <tr><td colSpan="5" className="text-center py-8 text-gray-400 text-xs">ไม่มี session</td></tr>
                                : detailData.users.map(u => (
                                  <tr key={u.id}>
                                    <td className="py-2 px-3 font-medium text-blue-600">{u.username || '—'}</td>
                                    <td className="py-2 px-3 text-gray-600">{u.session_name || '—'}</td>
                                    <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{u.session_id || '—'}</td>
                                    <td className="py-2 px-3">
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold
                                        ${u.state?.toUpperCase() === 'ACTIVE' ? 'bg-green-100 text-green-700' : u.state?.toUpperCase() === 'DISC' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                        <div className="w-1.5 h-1.5 rounded-full bg-current" />{u.state}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-gray-600">{fmtDate(u.logon_time)}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Information */}
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Information</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                          <InfoCell label="Manufacturer" value={inv.manufacturer} />
                          <InfoCell label="Model" value={inv.model} />
                          <InfoCell label="Serial Number" value={inv.serial_number} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Fix Asset" value={inv.fix_asset} textCol="text-blue-600" />
                          <InfoCell label="IP Address" value={inv.ip_address} textCol="text-blue-600" />
                          <InfoCell label="MAC Address" value={inv.mac_address} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="WiFi SSID" value={inv.wifi_ssid} textCol="text-blue-600" />
                          <InfoCell label="Adapter Type" value={inv.adapter_type} />
                          <InfoCell label="Domain" value={inv.domain} />
                          <InfoCell label="Local Admin Users" value={inv.local_admin_users} fontCls="font-mono text-[12px]"
                            textCol={isRealAdmin(inv.local_admin_users) ? 'text-red-600' : 'text-green-600'} />
                          <InfoCell label="User Count" value={inv.user_count} />
                          <InfoCell label="PC Status" value={inv.pc_status}
                            textCol={inv.pc_status === 'Active' ? 'text-emerald-600' : inv.pc_status === 'Inactive' ? 'text-amber-600' : 'text-gray-600'} />
                          <InfoCell label="Last Patch KB" value={inv.last_patch_kb} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Last Patch Date" value={fmtDate(inv.last_patch_date)} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Data Collected" value={fmtDate(inv.collected_at)} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Last Updated" value={fmtDate(inv.updated_at)} fontCls="font-mono text-[12px] text-gray-500" />
                        </div>
                      </div>

                      {/* Systems */}
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Systems</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                          <InfoCell label="OS Name" value={inv.os_name} />
                          <InfoCell label="OS Release" value={inv.os_release} />
                          <InfoCell label="OS Build" value={inv.os_build} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Full Version" value={inv.os_full_version} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Architecture" value={inv.os_arch} />
                          <InfoCell label="Product Key" value={inv.os_product_key} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Product ID" value={inv.os_product_id} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Activation Status" value={inv.os_activation}
                            textCol={inv.os_activation === 'Activated' ? 'text-green-600' : 'text-amber-600'} />
                          <InfoCell label="Install Date" value={fmtDate(inv.os_install_date)} />
                          <InfoCell label="Last Boot" value={fmtDate(inv.last_boot)} />
                          <InfoCell label="Uptime" value={inv.uptime} />

                          {/* ── Shutdown Events — clickable cell ── */}
                          {shutdownData.length > 0 && (() => {
                            const latest = shutdownData[0];
                            const isStart = (latest.field_name || '').toLowerCase().includes('start');
                            const isClean = (latest.field_name || '').toLowerCase().includes('clean');
                            // แยก event_time ออกจาก new_value "EventID:6005|2026-05-01 08:30:00"
                            const timePart = (latest.new_value || '').split('|')[1] || '';
                            return (
                              <button onClick={() => setShowShutdownModal(true)}
                                className="bg-white p-3.5 px-4 text-left hover:bg-[#eff4ff] transition-colors cursor-pointer group">
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex items-center justify-between">
                                  Shutdown Events
                                  <span className="text-[10px] normal-case font-normal bg-gray-100 group-hover:bg-blue-100 group-hover:text-blue-600 text-gray-500 rounded px-1.5 py-0.5 transition-colors">
                                    {shutdownData.length} รายการ ›
                                  </span>
                                </div>
                                <div className={`text-[13.5px] font-medium ${isStart ? 'text-green-700' : isClean ? 'text-blue-600' : 'text-amber-600'}`}>
                                  {latest.field_name || '—'}
                                </div>
                                <div className="text-[11px] text-gray-400 font-mono mt-0.5">{timePart || fmtDate(latest.changed_at)}</div>
                              </button>
                            );
                          })()}

                          {/* ── History / Timeline — clickable cell ── */}
                          {historyData.length > 0 && (() => {
                            const latest = historyData[0];
                            const isAdded = latest.change_type === 'software_added';
                            const isRemoved = latest.change_type === 'software_removed';
                            const isSecurity = ['BitLocker', 'CrowdStrike', 'Tanium', 'UEMS', 'Local Admin', 'OS Activation'].includes(latest.field_name);
                            const isWorse = isSecurity && ['Disabled', 'false', 'False', '0', 'Not Installed'].includes(latest.new_value);
                            const previewColor = isAdded ? 'text-green-700' : isRemoved ? 'text-red-600' : isWorse ? 'text-red-600' : 'text-blue-600';
                            const previewText = isAdded ? latest.new_value : isRemoved ? latest.old_value : latest.field_name;
                            return (
                              <button onClick={() => setShowHistoryModal(true)}
                                className="bg-white p-3.5 px-4 text-left hover:bg-[#eff4ff] transition-colors cursor-pointer group">
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex items-center justify-between">
                                  Timeline / History
                                  <span className="text-[10px] normal-case font-normal bg-gray-100 group-hover:bg-blue-100 group-hover:text-blue-600 text-gray-500 rounded px-1.5 py-0.5 transition-colors">
                                    {historyData.length} รายการ ›
                                  </span>
                                </div>
                                <div className={`text-[13.5px] font-medium truncate ${previewColor}`}>{previewText || '—'}</div>
                                <div className="text-[11px] text-gray-400 font-mono mt-0.5">{fmtDate(latest.changed_at)}</div>
                              </button>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Security */}
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Security</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                          <InfoCell label="CrowdStrike Ver" value={inv.crowdstrike_ver} fontCls="font-mono text-[12px]"
                            textCol={!inv.crowdstrike_ver || inv.crowdstrike_ver.toLowerCase() === 'not installed' ? 'text-red-600' : 'text-green-600'} />
                          <InfoCell label="Tanium Ver" value={inv.tanium_ver} fontCls="font-mono text-[12px]"
                            textCol={!inv.tanium_ver || inv.tanium_ver.toLowerCase() === 'not installed' ? 'text-red-600' : 'text-green-600'} />
                          <InfoCell label="UEMS Ver" value={inv.uems_ver} fontCls="font-mono text-[12px]"
                            textCol={!inv.uems_ver || inv.uems_ver.toLowerCase() === 'not installed' ? 'text-red-600' : 'text-green-600'} />
                        </div>
                      </div>

                      {/* Map View */}
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Map View 📍</div>
                        {locationLoading ? (
                          <div className="flex justify-center items-center py-8 text-gray-500">
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mr-2" />
                            Loading location data...
                          </div>
                        ) : (
                          <MapViewTab
                            hostname={hostname}
                            locationData={locationData}
                            onEditLocation={() => setShowLocationModal(true)}
                            onSelectPC={(hn) => { setHostname(hn); fetchMOLocation(hn); fetchDetail(hn); }}
                            locationApiBase="mo-location"
                            labelMode="hostname"
                          />
                        )}
                      </div>

                      {/* Software */}
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Software ({detailData.software.length})</div>
                        <div className="relative mb-3">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Search size={15} /></div>
                          <input type="text" placeholder="Search software by name, version, publisher..."
                            className="w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-9 pr-4 text-[13px] outline-none shadow-sm focus:border-blue-500 transition-colors"
                            value={softwareSearch} onChange={e => { setSoftwareSearch(e.target.value); setSoftwarePage(1); }} />
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse whitespace-nowrap text-[12px]">
                              <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
                                <tr>
                                  {[['name', 'Name'], ['version', 'Version'], ['publisher', 'Publisher'], ['install_location', 'Install Location'], ['size_mb', 'Size (MB)']].map(([k, lbl]) => (
                                    <th key={k} className={`py-2.5 px-3 font-semibold cursor-pointer ${k === 'size_mb' ? 'text-right' : ''}`}
                                      onClick={() => toggleSoftwareSort(k)}>
                                      {lbl} {softwareSortKey === k ? (softwareSortAsc ? '▲' : '▼') : '↕'}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {softwareFiltered.length === 0
                                  ? <tr><td colSpan="5" className="text-center py-6 text-gray-400 text-xs">ไม่มีข้อมูล Software</td></tr>
                                  : softwareFiltered.slice((softwarePage - 1) * softwarePageSize, softwarePage * softwarePageSize).map((s, i) => (
                                    <tr key={i} className="hover:bg-[#eff4ff] transition-colors">
                                      <td className="py-2 px-3 font-medium text-gray-900">{s.name || '—'}</td>
                                      <td className="py-2 px-3 text-gray-600 font-mono text-[11px]">{s.version || '—'}</td>
                                      <td className="py-2 px-3 text-gray-600">{s.publisher || '—'}</td>
                                      <td className="py-2 px-3 text-gray-500 font-mono text-[11px]">{s.install_location || '—'}</td>
                                      <td className="py-2 px-3 text-right text-gray-600 font-medium">{s.size_mb ? s.size_mb.toLocaleString() : '—'}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                          {softwareFiltered.length > 0 && (
                            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500 bg-white">
                              <span>{(softwarePage - 1) * softwarePageSize + (softwareFiltered.length ? 1 : 0)}–{Math.min(softwarePage * softwarePageSize, softwareFiltered.length)} จาก {softwareFiltered.length} รายการ</span>
                              <div className="flex gap-1.5">
                                <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors"
                                  disabled={softwarePage <= 1} onClick={() => setSoftwarePage(softwarePage - 1)}>← ก่อน</button>
                                <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors"
                                  disabled={softwarePage >= Math.ceil(softwareFiltered.length / softwarePageSize)} onClick={() => setSoftwarePage(softwarePage + 1)}>ถัดไป →</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-[13.5px] text-red-600 font-semibold">ไม่พบข้อมูล Monitor Inventory สำหรับ host นี้</div>
            )}
          </motion.div>
        )}
      </div>

      {/* ══════════════════════════════════════
          MODALS
      ══════════════════════════════════════ */}

      {/* Asset Modal */}
      {showAssetModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-7 w-full max-w-[440px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-[16px] font-bold mb-1">Edit Fix Asset</h3>
              <div className="text-[13px] text-gray-500 mb-5">Hostname: {modalData.hostname}</div>
              <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Fix Asset Number</label>
              <input type="text" value={modalData.assetInput || ''} onChange={e => setModalData({ ...modalData, assetInput: e.target.value })}
                placeholder="e.g. DCI-IT-00123"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-600 outline-none transition-colors font-mono" />
              {modalData.assetInput && !/^[A-Za-z0-9\-_.]*$/.test(modalData.assetInput) && (
                <p className="text-[11px] text-red-500 mt-1.5">ใช้ได้เฉพาะ ตัวอักษร ตัวเลข - _ .</p>
              )}
              <div className="flex justify-end gap-2.5 mt-5">
                <button className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  onClick={() => setShowAssetModal(false)}>Cancel</button>
                <button className="px-5 py-2.5 rounded-lg bg-[#2563eb] text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors"
                  onClick={saveAsset}>Save</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-7 w-full max-w-[400px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-[16px] font-bold mb-2">Delete Monitor Record</h3>
              <p className="text-[14px] text-gray-600 leading-relaxed mb-5">คุณต้องการลบ <b>{modalData.hostname}</b> และข้อมูลทั้งหมดออกจากระบบใช่หรือไม่?</p>
              <div className="flex justify-end gap-2.5 mt-5">
                <button className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  onClick={() => setShowDeleteModal(false)}>Cancel</button>
                <button className="px-5 py-2.5 rounded-lg bg-[#dc2626] text-white text-[13px] font-semibold hover:bg-red-700 transition-colors"
                  onClick={confirmDelete}>Delete</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Location Modal */}
      {showLocationModal && (
        <Portal>
          <LocationSelectorModal
            hostname={hostname}
            initialLocation={locationData}
            layouts={factoryLayouts}
            saveApiBase="mo-location"
            onSave={() => { setShowLocationModal(false); fetchMOLocation(hostname); }}
            onClose={() => setShowLocationModal(false)}
          />
        </Portal>
      )}

      {/* ── Shutdown Events Modal ── */}
      {showShutdownModal && shutdownData.length > 0 && (
        <Portal>
          <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-[580px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col overflow-hidden border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <div className="text-[15px] font-bold text-gray-900">⚡ Shutdown / Restart Events</div>
                  <div className="text-[12px] text-gray-400 mt-0.5">{hostname} · {shutdownData.length} รายการ</div>
                </div>
                <button onClick={() => setShowShutdownModal(false)}
                  className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                {shutdownData.map((ev, i) => {
                  // new_value format: "EventID:6005|2026-05-01 08:30:00"
                  const parts = (ev.new_value || '').split('|');
                  const eventIdPart = parts[0]?.replace('EventID:', '').trim();
                  const timePart = parts[1]?.trim();
                  const isStart = (ev.field_name || '').toLowerCase().includes('start');
                  const isClean = (ev.field_name || '').toLowerCase().includes('clean shutdown');
                  const isUnexpected = (ev.field_name || '').toLowerCase().includes('unexpected');
                  return (
                    <div key={i} className="flex items-center gap-3 px-6 py-3">
                      {/* event type icon */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] shrink-0
                        ${isStart ? 'bg-green-100' : isClean ? 'bg-blue-100' : isUnexpected ? 'bg-red-100' : 'bg-amber-100'}`}>
                        {isStart ? '▶' : isClean ? '⏹' : isUnexpected ? '⚠' : '↺'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-semibold
                          ${isStart ? 'text-green-700' : isClean ? 'text-blue-600' : isUnexpected ? 'text-red-600' : 'text-amber-600'}`}>
                          {ev.field_name || '—'}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                          {timePart || fmtDate(ev.changed_at)}
                          {eventIdPart && <span className="ml-2 bg-gray-100 rounded px-1.5 py-0.5">ID:{eventIdPart}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
                <button onClick={() => setShowShutdownModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── Timeline / History Modal ── */}
      {showHistoryModal && historyData.length > 0 && (
        <Portal>
          <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-[680px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <div className="text-[15px] font-bold text-gray-900">📅 Timeline / History</div>
                  <div className="text-[12px] text-gray-400 mt-0.5">{hostname} · {historyData.length} รายการ</div>
                </div>
                <button onClick={() => setShowHistoryModal(false)}
                  className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                <div className="divide-y divide-gray-100">
                  {historyData.map((h, i) => {
                    const isSecurity = ['BitLocker', 'CrowdStrike', 'Tanium', 'UEMS', 'Local Admin', 'OS Activation', 'MAC Address'].includes(h.field_name);
                    const isRemoved = h.change_type === 'software_removed';
                    const isAdded = h.change_type === 'software_added';
                    const isField = h.change_type === 'field_changed';

                    let dotColor = 'bg-gray-300';
                    let badgeClass = 'bg-gray-100 text-gray-500';
                    let badgeLabel = 'Changed';

                    if (isAdded) {
                      dotColor = 'bg-green-400';
                      badgeClass = 'bg-green-100 text-green-700';
                      badgeLabel = 'SW Added';
                    } else if (isRemoved) {
                      dotColor = 'bg-red-400';
                      badgeClass = 'bg-red-100 text-red-700';
                      badgeLabel = 'SW Removed';
                    } else if (isField && isSecurity) {
                      const isWorse = ['Disabled', 'false', 'False', '0', 'Not Installed', 'Not Admin'].includes(h.new_value)
                        || (h.field_name === 'Local Admin' && h.new_value === 'Admin');
                      dotColor = isWorse ? 'bg-red-400' : 'bg-blue-400';
                      badgeClass = isWorse ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700';
                      badgeLabel = 'Security';
                    } else if (isField && ['OS Build', 'OS Release', 'Last Patch KB', 'Last Patch Date'].includes(h.field_name)) {
                      dotColor = 'bg-emerald-400';
                      badgeClass = 'bg-emerald-100 text-emerald-700';
                      badgeLabel = 'Update';
                    } else if (isField) {
                      dotColor = 'bg-blue-300';
                      badgeClass = 'bg-blue-50 text-blue-600';
                      badgeLabel = 'Field';
                    }

                    return (
                      <div key={h.id || i} className="flex items-start gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                        {/* timeline dot + line */}
                        <div className="flex flex-col items-center pt-1 shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                          {i < historyData.length - 1 && (
                            <div className="w-px flex-1 bg-gray-200 mt-1" style={{ minHeight: '24px' }} />
                          )}
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
                              <span className="text-[12px] text-gray-400 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 max-w-[240px] truncate" title={h.old_value}>
                                {h.old_value || '—'}
                              </span>
                              <span className="text-[10px] text-gray-400">→</span>
                              <span className="text-[12px] text-gray-700 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 max-w-[240px] truncate" title={h.new_value}>
                                {h.new_value || '—'}
                              </span>
                            </div>
                          )}
                        </div>
                        {/* timestamp */}
                        <span className="text-[11px] text-gray-400 font-mono shrink-0 pt-0.5 whitespace-nowrap">
                          {fmtDate(h.changed_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
                <button onClick={() => setShowHistoryModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Toast */}
<AlertModal
  isOpen={alertModal.isOpen}
  type={alertModal.type}
  title={alertModal.title}
  message={alertModal.message}
  onConfirm={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
  confirmText="ตกลง"
/>
    </div>
  );
};

export default MOInventoryPage;