import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, RefreshCw, ChevronLeft, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { API_BASE } from '../config/api';
import Portal from '../components/Portal';

const MOInventoryPage = () => {
  const [view, setView] = useState('list');
  const [hostname, setHostname] = useState(null);

  const [invData, setInvData] = useState([]);
  const [sumData, setSumData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const Portal = ({ children }) => createPortal(children, document.body);
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
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

  const [toastMsg, setToastMsg] = useState('');
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [modalData, setModalData] = useState({});

  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareSortKey, setSoftwareSortKey] = useState('name');
  const [softwareSortAsc, setSoftwareSortAsc] = useState(true);
  const [softwarePage, setSoftwarePage] = useState(1);
  const softwarePageSize = 20;

  // ─────────────────────────────────────────────
  //  Session Management
  // ─────────────────────────────────────────────
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    // Load session state on component mount
    const savedSession = sessionStorage.getItem('mo-inventory-session');
    if (savedSession) {
      try {
        const sessionData = JSON.parse(savedSession);
        setSearchQuery(sessionData.searchQuery || '');
        setFilterKeys(sessionData.filterKeys || []);
        setSortKey(sessionData.sortKey || 'updated_at');
        setSortAsc(sessionData.sortAsc || false);
        setPage(sessionData.page || 1);
        setSoftwareSearch(sessionData.softwareSearch || '');
        setSoftwareSortKey(sessionData.softwareSortKey || 'name');
        setSoftwareSortAsc(sessionData.softwareSortAsc !== undefined ? sessionData.softwareSortAsc : true);
        setSoftwarePage(sessionData.softwarePage || 1);
        setView(sessionData.view || 'list');
        setHostname(sessionData.hostname || null);
      } catch (err) {
        console.warn('Failed to load MO Inventory session:', err);
      }
    }
    setSessionLoaded(true);
  }, []);

  // Save session state whenever relevant state changes
  useEffect(() => {
    if (!sessionLoaded) return; // Don't save until session is loaded
    const sessionData = {
      searchQuery,
      filterKeys,
      sortKey,
      sortAsc,
      page,
      softwareSearch,
      softwareSortKey,
      softwareSortAsc,
      softwarePage,
      view,
      hostname
    };
    sessionStorage.setItem('mo-inventory-session', JSON.stringify(sessionData));
  }, [searchQuery, filterKeys, sortKey, sortAsc, page, softwareSearch, softwareSortKey, softwareSortAsc, softwarePage, view, hostname, sessionLoaded]);

  useEffect(() => {
    if (!sessionLoaded) return; // Wait for session to load before fetching data
    if (view === 'list') fetchData();
    else if (view === 'detail' && hostname) fetchDetail(hostname);
  }, [view, hostname, sessionLoaded]);

  // ─────────────────────────────────────────────
  //  Data fetching
  // ─────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [invRes, sumRes] = await Promise.all([
        fetch(`${API_BASE}/mo-inventory`).then(r => r.json()),
        fetch(`${API_BASE}/mo-inventory/summary`).then(r => r.json()),
      ]);
      if (!invRes.success) throw new Error(invRes.error || 'Failed to fetch');
      setInvData(invRes.data || []);
      setSumData(sumRes.success ? sumRes.data : null); // unwrap .data
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (hn) => {
    setDetailLoading(true);
    setError('');
    try {
      const safe = async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return { success: false, data: null };
          return r.json();
        } catch { return { success: false, data: null }; }
      };
      const [ir, ur, sr] = await Promise.all([
        safe(`${API_BASE}/mo-inventory/${encodeURIComponent(hn)}`),
        safe(`${API_BASE}/mo-active-users/${encodeURIComponent(hn)}`),
        safe(`${API_BASE}/mo-inventory/${encodeURIComponent(hn)}/software`),
      ]);
      if (!ir?.success || !ir.data)
        throw new Error('ไม่พบข้อมูลจอภาพนี้ในระบบ (Monitor Data Not Found)');
      setDetailData({
        inv: ir.data,
        users: ur?.success ? ur.data : [],
        software: sr?.success ? sr.data : [],
      });
      setSoftwarePage(1);
      setSoftwareSearch('');
    } catch (err) {
      console.error('fetchDetail error:', err);
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  // ─────────────────────────────────────────────
  //  Filter helpers
  // ─────────────────────────────────────────────
  const getHostsForKey = (key) => {
    if (!sumData) return [];
    if (key === 'noCrowdstrike')  return sumData.noCrowdstrike  || [];
    if (key === 'noTanium')       return sumData.noTanium       || [];
    if (key === 'noUems')         return sumData.noUems         || [];
    if (key === 'notActivated')   return sumData.notActivated   || [];
    if (key === 'noFixAsset')     return sumData.noFixAsset     || [];
    if (key === 'adminUsers')     return sumData.adminUsers     || [];
    if (key === 'notUpdated')     return sumData.notUpdated     || [];
    if (key === 'oldFixAssets')   return sumData.oldFixAssets   || [];
    if (key.startsWith('cs:'))      return (sumData.crowdstrikeVerMap || {})[key.slice(3)]  || [];
    if (key.startsWith('tanium:'))  return (sumData.taniumVerMap      || {})[key.slice(7)]  || [];
    if (key.startsWith('uems:'))    return (sumData.uemsVerMap        || {})[key.slice(5)]  || [];
    if (key.startsWith('mfr:'))     return (sumData.manufacturerMap   || {})[key.slice(4)]  || [];
    if (key.startsWith('model:'))   return (sumData.modelMap          || {})[key.slice(6)]  || [];
    if (key.startsWith('osname:'))  return (sumData.osNameMap         || {})[key.slice(7)]  || [];
    if (key.startsWith('osrel:'))   return (sumData.osReleaseMap      || {})[key.slice(6)]  || [];
    if (key.startsWith('osbuild:')) return (sumData.osBuildMap        || {})[key.slice(8)]  || [];
    if (key.startsWith('osarch:'))  return (sumData.osArchMap         || {})[key.slice(7)]  || [];
    if (key.startsWith('wifi:'))    return (sumData.wifiMap           || {})[key.slice(5)]  || [];
    if (key.startsWith('adapter:')) return (sumData.adapterMap        || {})[key.slice(8)]  || [];
    if (key.startsWith('subnet:'))  return (sumData.subnetMap         || {})[key.slice(7)]  || [];
    return [];
  };

  const toggleFilter = (key, label) => {
    setFilterKeys(prev =>
      prev.find(p => p.key === key)
        ? prev.filter(p => p.key !== key)
        : [...prev, { key, label }]
    );
    setPage(1);
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPage(1);
  };

  const onSearchInput = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length >= 2) {
      try {
        const res = await fetch(`${API_BASE}/mo-inventory/search?q=${encodeURIComponent(q)}`).then(r => r.json());
        if (res.success) { setInvData(res.data || []); setPage(1); }
      } catch {}
    } else if (q.length === 0) {
      fetchData();
    }
  };

  const filteredData = useMemo(() => {
    let result = [...invData];
    if (filterKeys.length > 0 && sumData) {
      const resolve = (key) => {
        if (key === 'noCrowdstrike')  return sumData.noCrowdstrike  || [];
        if (key === 'noTanium')       return sumData.noTanium       || [];
        if (key === 'noUems')         return sumData.noUems         || [];
        if (key === 'notActivated')   return sumData.notActivated   || [];
        if (key === 'noFixAsset')     return sumData.noFixAsset     || [];
        if (key === 'adminUsers')     return sumData.adminUsers     || [];
        if (key === 'notUpdated')     return sumData.notUpdated     || [];
        if (key === 'oldFixAssets')   return sumData.oldFixAssets   || [];
        if (key.startsWith('cs:'))      return (sumData.crowdstrikeVerMap || {})[key.slice(3)]  || [];
        if (key.startsWith('tanium:'))  return (sumData.taniumVerMap      || {})[key.slice(7)]  || [];
        if (key.startsWith('uems:'))    return (sumData.uemsVerMap        || {})[key.slice(5)]  || [];
        if (key.startsWith('mfr:'))     return (sumData.manufacturerMap   || {})[key.slice(4)]  || [];
        if (key.startsWith('model:'))   return (sumData.modelMap          || {})[key.slice(6)]  || [];
        if (key.startsWith('osname:'))  return (sumData.osNameMap         || {})[key.slice(7)]  || [];
        if (key.startsWith('osrel:'))   return (sumData.osReleaseMap      || {})[key.slice(6)]  || [];
        if (key.startsWith('osbuild:')) return (sumData.osBuildMap        || {})[key.slice(8)]  || [];
        if (key.startsWith('osarch:'))  return (sumData.osArchMap         || {})[key.slice(7)]  || [];
        if (key.startsWith('wifi:'))    return (sumData.wifiMap           || {})[key.slice(5)]  || [];
        if (key.startsWith('adapter:')) return (sumData.adapterMap        || {})[key.slice(8)]  || [];
        if (key.startsWith('subnet:'))  return (sumData.subnetMap         || {})[key.slice(7)]  || [];
        return [];
      };
      const sets = filterKeys.map(fk => new Set(resolve(fk.key)));
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

  const totalPages  = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentList = filteredData.slice((page - 1) * pageSize, page * pageSize);

  const softwareFiltered = useMemo(() => {
    let r = detailData.software.filter(s => {
      if (!softwareSearch) return true;
      const q = softwareSearch.toLowerCase();
      return (s.name||'').toLowerCase().includes(q)
          || (s.version||'').toLowerCase().includes(q)
          || (s.publisher||'').toLowerCase().includes(q);
    });
    r.sort((a, b) => {
      const av = (a[softwareSortKey]||'').toString().toLowerCase();
      const bv = (b[softwareSortKey]||'').toString().toLowerCase();
      return softwareSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return r;
  }, [detailData.software, softwareSearch, softwareSortKey, softwareSortAsc]);

  // ─────────────────────────────────────────────
  //  Actions
  // ─────────────────────────────────────────────
  const showToast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  const clearSession = () => {
    sessionStorage.removeItem('mo-inventory-session');
    // Reset all states to defaults
    setSearchQuery('');
    setFilterKeys([]);
    setSortKey('updated_at');
    setSortAsc(false);
    setPage(1);
    setSoftwareSearch('');
    setSoftwareSortKey('name');
    setSoftwareSortAsc(true);
    setSoftwarePage(1);
    setView('list');
    setHostname(null);
    showToast('Session cleared - เริ่มใหม่ทั้งหมด');
  };

  // Fix #6 — PUT /mo-inventory/:hostname/asset
  const saveAsset = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/mo-inventory/${encodeURIComponent(modalData.hostname)}/asset`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix_asset: modalData.assetInput }) }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast('✓ บันทึกข้อมูล Fix Asset เรียบร้อย');
      setShowAssetModal(false);
      fetchDetail(modalData.hostname);
    } catch (err) { alert(err.message); }
  };

  const confirmDelete = async () => {
    try {
      const res = await fetch(`${API_BASE}/mo-inventory/${encodeURIComponent(modalData.hostname)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setShowDeleteModal(false);
      setView('list');
      setHostname(null);
    } catch (err) { alert(err.message); }
  };

  // Fix #5 — Export 3 sheets (40 fields + users + software)
  const exportMODetail = () => {
    try {
      if (!detailData.inv) { showToast('❌ ไม่มีข้อมูล Monitor ที่จะ export'); return; }
      const wb = XLSX.utils.book_new();
      const inv = detailData.inv;

      const ws1 = XLSX.utils.aoa_to_sheet([
        ['Field', 'Value'],
        ['Hostname',          inv.hostname],
        ['IP Address',        inv.ip_address],
        ['MAC Address',       inv.mac_address],
        ['Fix Asset',         inv.fix_asset],
        ['Domain',            inv.domain],
        ['Manufacturer',      inv.manufacturer],
        ['Model',             inv.model],
        ['Serial Number',     inv.serial_number],
        ['WiFi SSID',         inv.wifi_ssid],
        ['Adapter Type',      inv.adapter_type],
        ['Local Admin Users', inv.local_admin_users],
        ['User Count',        inv.user_count],
        ['PC Status',         inv.pc_status],
        ['OS Name',           inv.os_name],
        ['OS Release',        inv.os_release],
        ['OS Build',          inv.os_build],
        ['OS Full Version',   inv.os_full_version],
        ['Architecture',      inv.os_arch],
        ['Product Key',       inv.os_product_key],
        ['Product ID',        inv.os_product_id],
        ['Activation Status', inv.os_activation],
        ['Install Date',      inv.os_install_date],
        ['Last Boot',         inv.last_boot],
        ['Uptime',            inv.uptime],
        ['CPU Name',          inv.cpu_name],
        ['CPU Cores',         inv.cpu_cores],
        ['CPU Threads',       inv.cpu_threads],
        ['RAM Info',          inv.ram_info],
        ['RAM Detail',        inv.ram_detail],
        ['Disk Info',         inv.disk_info],
        ['GPU',               inv.gpu],
        ['Resolution',        inv.resolution],
        ['BIOS Version',      inv.bios_version],
        ['BitLocker',         inv.bitlocker],
        ['CrowdStrike Ver',   inv.crowdstrike_ver],
        ['Tanium Ver',        inv.tanium_ver],
        ['UEMS Ver',          inv.uems_ver],
        ['Data Collected',    inv.collected_at],
        ['Last Updated',      inv.updated_at],
      ]);
      XLSX.utils.book_append_sheet(wb, ws1, 'Monitor Info');

      const ws2 = XLSX.utils.aoa_to_sheet([
        ['Username', 'Session Name', 'Session ID', 'State', 'Logon Time'],
        ...detailData.users.map(u => [u.username||'—', u.session_name||'—', u.session_id||'—', u.state||'—', u.logon_time||'—']),
      ]);
      XLSX.utils.book_append_sheet(wb, ws2, 'Active Users');

      const ws3 = XLSX.utils.aoa_to_sheet([
        ['Name', 'Version', 'Publisher', 'Install Location', 'Size (MB)'],
        ...detailData.software.map(s => [s.name||'—', s.version||'—', s.publisher||'—', s.install_location||'—', s.size_mb||'—']),
      ]);
      XLSX.utils.book_append_sheet(wb, ws3, 'Software');

      const filename = `${hostname}_monitor_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast(`✓ Export สำเร็จ: ${filename}`);
    } catch (err) {
      showToast(`❌ Export ล้มเหลว: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────
  //  Sub-components
  // ─────────────────────────────────────────────
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

  // Fix #4 — "not admin" = green, has admin = red
  const isRealAdmin = (val) => {
    const v = (val || '').toLowerCase().trim();
    return v.includes('admin') && v !== 'not admin';
  };

  // Distribution card rows — ตรงตาม layout ที่ต้องการ
  const distRows = sumData ? [
      [
      { key: 'cs',      label: 'CrowdStrike',    map: sumData.crowdstrikeVerMap, prefix: 'cs:',      btnClass: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
      { key: 'tan',     label: 'Tanium',          map: sumData.taniumVerMap,      prefix: 'tanium:',  btnClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    ],
    // Group 2: Infrastructure & Source (Royal Blue & Deep Red)
    [
        { key: 'subnet',  label: 'IP Subnet',       map: sumData.subnetMap,         prefix: 'subnet:',  btnClass: 'bg-blue-50 text-blue-700 border-blue-200' },
        { key: 'mfr',     label: 'Manufacturer',    map: sumData.manufacturerMap,   prefix: 'mfr:',     btnClass: 'bg-rose-50 text-rose-700 border-rose-200' },
    ],
    // Group 3: Hardware & Build (Purple & Warm Orange)
    [
      { key: 'model',   label: 'Model',           map: sumData.modelMap,          prefix: 'model:',   btnClass: 'bg-violet-50 text-violet-700 border-violet-200', limit: 6 },
      { key: 'osbuild', label: 'OS Build',        map: sumData.osBuildMap,        prefix: 'osbuild:', btnClass: 'bg-orange-50 text-orange-700 border-orange-200', limit: 4 },
    ],
    // Group 4: Software OS (Slate & Indigo)
    [
      { key: 'osrel',   label: 'OS Release',      map: sumData.osReleaseMap,      prefix: 'osrel:',   btnClass: 'bg-slate-100 text-slate-700 border-slate-300', limit: 4 },
      { key: 'osname',  label: 'OS Name',         map: sumData.osNameMap,         prefix: 'osname:',  btnClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    ],
    // Group 5: Connectivity (Golden Amber & Deep Teal)
    [
      { key: 'adapter', label: 'Adapter Type',    map: sumData.adapterMap,        prefix: 'adapter:', btnClass: 'bg-amber-50 text-amber-800 border-amber-200' },
      { key: 'wifi',    label: 'WiFi SSID',       map: sumData.wifiMap,           prefix: 'wifi:',    btnClass: 'bg-teal-50 text-teal-700 border-teal-200', limit: 5 },
    ],
  ] : [];

  // ─────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────
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

        {/* ════════════════ LIST VIEW ════════════════ */}
        {view === 'list' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {error && <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-[13px] text-red-600 mb-4 font-semibold">⚠️ {error}</div>}

            {/* StatBoxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-3">
              <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
                <div className="text-xs font-medium text-gray-500 mb-2">ทั้งหมด</div>
                <div className="text-2xl font-bold leading-none text-blue-600">{invData.length}</div>
              </div>
              <StatBox id="noCrowdstrike" label="No CrowdStrike"    list={sumData?.noCrowdstrike} textClass="text-red-600"    bgClass="bg-red-50"    ringClass="ring-red-500" />
              <StatBox id="noTanium"      label="No Tanium"         list={sumData?.noTanium}      textClass="text-red-600"    bgClass="bg-red-50"    ringClass="ring-red-500" />
              <StatBox id="noUems"        label="No UEMS"           list={sumData?.noUems}        textClass="text-red-600"    bgClass="bg-red-50"    ringClass="ring-red-500" />
              <StatBox id="notActivated"  label="OS Not Activated"  list={sumData?.notActivated}  textClass="text-amber-600"  bgClass="bg-amber-50"  ringClass="ring-amber-500" />
              <StatBox id="noFixAsset"    label="No Fix Asset"      list={sumData?.noFixAsset}    textClass="text-amber-600"  bgClass="bg-amber-50"  ringClass="ring-amber-500" />
              <StatBox id="adminUsers"    label="With Admin Users"  list={sumData?.adminUsers}    textClass="text-orange-600" bgClass="bg-orange-50" ringClass="ring-orange-500" />
              {/* Fix #1 — 30-day window */}
              <StatBox id="notUpdated"    label="Not Updated > 30d" list={sumData?.notUpdated}    textClass="text-red-600"    bgClass="bg-red-50"    ringClass="ring-red-500" />
              {/* Fix #2 — old fix assets */}
              <StatBox id="oldFixAssets"  label="Fix Asset > 5 ปี"  list={sumData?.oldFixAssets}  textClass="text-orange-600" bgClass="bg-orange-50" ringClass="ring-orange-500" />
            </div>

            {/* Distribution cards */}
            {sumData && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
                {distRows.map((row, rowIdx, rows) => (
                  <div
                    key={rowIdx}
                    className={`grid grid-cols-2 ${rowIdx < rows.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    {row.map((col, colIdx) => {
                      if (!col) return <div key="empty" />;
                      const { key, label, map, prefix, btnClass, limit } = col;
                      const entries = Object.keys(map || {})
                        .filter(k => (map[k] || []).length > 0)
                        .sort((a, b) => (map[b] || []).length - (map[a] || []).length)
                        .slice(0, limit);
                      if (entries.length === 0) return <div key={key} />;
                      return (
                        <div
                          key={key}
                          className={`px-4 py-2.5 ${colIdx === 0 ? 'border-r border-gray-100' : ''}`}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                            {label}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {entries.map(k => (
                              <SumTag
                                key={`${prefix}${k}`}
                                id={`${prefix}${k}`}
                                label={k}
                                list={map[k]}
                                btnClass={btnClass}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Active filter bar */}
            {filterKeys.length > 0 && (
              <div className="flex items-center gap-2 bg-[#eff4ff] border border-[#bfcfff] rounded-xl px-3.5 py-2 mb-3 text-[13px] font-medium text-[#2563eb]">
                ☞ Filter: <b>{filterKeys.map(k => k.label).join(' + ')}</b>
                <span className="text-gray-500 text-xs ml-1">({filteredData.length} เครื่อง)</span>
                <button onClick={() => setFilterKeys([])}
                  className="ml-auto bg-transparent border border-[#bfcfff] px-2 py-0.5 rounded flex items-center gap-1 text-xs hover:bg-[#bfcfff] transition-colors">
                  <X size={12} /> ล้าง
                </button>
              </div>
            )}

            {/* Search box */}
            <div className="relative mb-3">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Search size={15} /></div>
              <input type="text"
                placeholder="ค้นหาทุกฟิลด์: hostname, IP, Serial, Manufacturer ฯลฯ"
                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-9 pr-4 text-[13px] outline-none shadow-sm focus:border-blue-500 transition-colors"
                value={searchQuery} onChange={onSearchInput} />
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
                    <tr>
                      {[['hostname','Hostname'],['ip_address','IP Address'],['active_usernames','User'],
                        ['fix_asset','Fix Asset'],['local_admin_users','Local Admin'],['serial_number','Serial Number'],
                        ['os_name','OS'],['os_activation','Activation'],['logon_time','Logon Time']].map(([k, lbl]) => (
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
                      <tr key={d.hostname} className="hover:bg-[#eff4ff] cursor-pointer transition-colors group"
                        onClick={() => { setHostname(d.hostname); setView('detail'); }}>
                        <td className="py-2 px-3 text-[13px] font-medium text-gray-900">{d.hostname || '—'}</td>
                        <td className="py-2 px-3 text-[13px] font-mono font-medium">{d.ip_address || '—'}</td>
                        <td className="py-2 px-3 text-[13px] font-medium text-blue-600">{(d.active_usernames || '—').split(',')[0]}</td>
                        <td className="py-2 px-3 text-[13px] font-mono text-purple-600 font-medium">{d.fix_asset || '—'}</td>
                        {/* Fix #4 */}
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold
                            ${isRealAdmin(d.local_admin_users) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full mr-1 ${isRealAdmin(d.local_admin_users) ? 'bg-red-500' : 'bg-green-500'}`} />
                            {d.local_admin_users
                              ? d.local_admin_users.charAt(0).toUpperCase() + d.local_admin_users.slice(1)
                              : '—'}
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
                <span>{(page-1)*pageSize+(filteredData.length?1:0)}–{Math.min(page*pageSize,filteredData.length)} จาก {filteredData.length} รายการ</span>
                <div className="flex gap-1.5">
                  <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors"
                    disabled={page<=1} onClick={()=>setPage(page-1)}>← ก่อน</button>
                  <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors"
                    disabled={page>=totalPages} onClick={()=>setPage(page+1)}>ถัดไป →</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ════════════════ DETAIL VIEW ════════════════ */}
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
                    <div className="text-[13px] text-gray-500 mb-2.5">{detailData.inv.manufacturer||'—'} {detailData.inv.model||''} · {detailData.inv.ip_address||'—'}</div>
                    <div className="flex flex-wrap gap-1.5 text-[12px] font-medium">
                      {detailData.inv.manufacturer && <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.manufacturer}</span>}
                      <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.os_name||'—'}</span>
                      <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.inv.os_arch||'—'}</span>
                      <span className="bg-[#f5f6f8] border border-gray-200 rounded-md px-2.5 py-1">{detailData.users.length} Sessions</span>
                      {detailData.inv.os_activation === 'Activated'
                        ? <span className="bg-green-50 border border-green-200 text-green-700 rounded-md px-2.5 py-1">OS Activated</span>
                        : <span className="bg-amber-50 border border-amber-200 text-amber-700 rounded-md px-2.5 py-1">OS Not Activated</span>}
                      {detailData.inv.fix_asset && <span className="bg-blue-50 border border-blue-200 text-blue-600 rounded-md px-2.5 py-1">Asset: {detailData.inv.fix_asset}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => { setModalData({ hostname, assetInput: detailData.inv.fix_asset }); setShowAssetModal(true); }}
                      className="bg-[#eff4ff] text-[#2563eb] border border-[#bfcfff] hover:bg-[#dbeafe] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                      Edit Asset
                    </button>
                    <button onClick={exportMODetail}
                      className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5">
                      <Download size={14} /> Export
                    </button>
                    <button onClick={() => { setModalData({ hostname }); setShowDeleteModal(true); }}
                      className="bg-red-50 text-red-600 border border-[#fca5a5] hover:bg-red-100 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                      Delete
                    </button>
                  </div>
                </div>

                {/* Sections */}
                {(() => {
                  const inv = detailData.inv;
                  const InfoCell = ({ label, value, fontCls, textCol }) => (
                    <div className="bg-white p-3.5 px-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
                      <div className={`text-[13.5px] font-medium ${fontCls||''} ${
                        value==null||value==='' ? 'text-gray-400 italic' : textCol||'text-gray-900'
                      }`}>{value==null||value===''?'—':value}</div>
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
                                    <td className="py-2 px-3 font-medium text-blue-600">{u.username||'—'}</td>
                                    <td className="py-2 px-3 text-gray-600">{u.session_name||'—'}</td>
                                    <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{u.session_id||'—'}</td>
                                    <td className="py-2 px-3">
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold
                                        ${u.state?.toUpperCase()==='ACTIVE'?'bg-green-100 text-green-700':u.state?.toUpperCase()==='DISC'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>
                                        <div className="w-1.5 h-1.5 rounded-full bg-current"/>{u.state}
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
                          <InfoCell label="Manufacturer"      value={inv.manufacturer} />
                          <InfoCell label="Model"             value={inv.model} />
                          <InfoCell label="Serial Number"     value={inv.serial_number}   fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Fix Asset"         value={inv.fix_asset}        textCol="text-blue-600" />
                          <InfoCell label="IP Address"        value={inv.ip_address}       textCol="text-blue-600" />
                          <InfoCell label="MAC Address"       value={inv.mac_address}      fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="WiFi SSID"         value={inv.wifi_ssid}        textCol="text-blue-600" />
                          <InfoCell label="Adapter Type"      value={inv.adapter_type} />
                          <InfoCell label="Domain"            value={inv.domain} />
                          {/* Fix #4 */}
                          <InfoCell label="Local Admin Users" value={inv.local_admin_users} fontCls="font-mono text-[12px]"
                            textCol={isRealAdmin(inv.local_admin_users) ? 'text-red-600' : 'text-green-600'} />
                          <InfoCell label="User Count"        value={inv.user_count} />
                          <InfoCell label="PC Status"         value={inv.pc_status}
                            textCol={inv.pc_status==='Active'?'text-emerald-600':inv.pc_status==='Inactive'?'text-amber-600':'text-gray-600'} />
                          <InfoCell label="Data Collected"    value={fmtDate(inv.collected_at)} fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Last Updated"      value={fmtDate(inv.updated_at)}   fontCls="font-mono text-[12px] text-gray-500" />
                        </div>
                      </div>

                      {/* Systems */}
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Systems</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                          <InfoCell label="OS Name"           value={inv.os_name} />
                          <InfoCell label="OS Release"        value={inv.os_release} />
                          <InfoCell label="OS Build"          value={inv.os_build}         fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Full Version"      value={inv.os_full_version}  fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Architecture"      value={inv.os_arch} />
                          <InfoCell label="Product Key"       value={inv.os_product_key}   fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Product ID"        value={inv.os_product_id}    fontCls="font-mono text-[12px] text-gray-500" />
                          <InfoCell label="Activation Status" value={inv.os_activation}
                            textCol={inv.os_activation==='Activated'?'text-green-600':'text-amber-600'} />
                          <InfoCell label="Install Date"      value={fmtDate(inv.os_install_date)} />
                          <InfoCell label="Last Boot"         value={fmtDate(inv.last_boot)} />
                          <InfoCell label="Uptime"            value={inv.uptime} />
                        </div>
                      </div>

                      {/* Security */}
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Security</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-[1px] bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                          <InfoCell label="CrowdStrike Ver" value={inv.crowdstrike_ver} fontCls="font-mono text-[12px]"
                            textCol={!inv.crowdstrike_ver||inv.crowdstrike_ver.toLowerCase()==='not installed'?'text-red-600':'text-green-600'} />
                          <InfoCell label="Tanium Ver"      value={inv.tanium_ver}      fontCls="font-mono text-[12px]"
                            textCol={!inv.tanium_ver||inv.tanium_ver.toLowerCase()==='not installed'?'text-red-600':'text-green-600'} />
                          <InfoCell label="UEMS Ver"        value={inv.uems_ver}        fontCls="font-mono text-[12px]"
                            textCol={!inv.uems_ver||inv.uems_ver.toLowerCase()==='not installed'?'text-red-600':'text-green-600'} />
                        </div>
                      </div>

                      {/* Software */}
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">Software ({detailData.software.length})</div>
                        <div className="relative mb-3">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Search size={15}/></div>
                          <input type="text" placeholder="Search software by name, version, publisher..."
                            className="w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-9 pr-4 text-[13px] outline-none shadow-sm focus:border-blue-500 transition-colors"
                            value={softwareSearch} onChange={e => setSoftwareSearch(e.target.value)} />
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse whitespace-nowrap text-[12px]">
                              <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
                                <tr>
                                  {[['name','Name'],['version','Version'],['publisher','Publisher'],['install_location','Install Location'],['size_mb','Size (MB)']].map(([k,lbl])=>(
                                    <th key={k} className={`py-2.5 px-3 font-semibold cursor-pointer ${k==='size_mb'?'text-right':''}`}
                                      onClick={()=>{setSoftwareSortKey(k);setSoftwareSortAsc(softwareSortKey===k?!softwareSortAsc:true);}}>
                                      {lbl} {softwareSortKey===k?(softwareSortAsc?'▲':'▼'):'↕'}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {softwareFiltered.length===0
                                  ?<tr><td colSpan="5" className="text-center py-6 text-gray-400 text-xs">ไม่มีข้อมูล Software</td></tr>
                                  :softwareFiltered.slice((softwarePage-1)*softwarePageSize,softwarePage*softwarePageSize).map((s,i)=>(
                                    <tr key={i} className="hover:bg-[#eff4ff] transition-colors">
                                      <td className="py-2 px-3 font-medium text-gray-900">{s.name||'—'}</td>
                                      <td className="py-2 px-3 text-gray-600 font-mono text-[11px]">{s.version||'—'}</td>
                                      <td className="py-2 px-3 text-gray-600">{s.publisher||'—'}</td>
                                      <td className="py-2 px-3 text-gray-500 font-mono text-[11px]">{s.install_location||'—'}</td>
                                      <td className="py-2 px-3 text-right text-gray-600 font-medium">{s.size_mb?s.size_mb.toLocaleString():'—'}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                          {softwareFiltered.length>0&&(
                            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500 bg-white">
                              <span>{(softwarePage-1)*softwarePageSize+(softwareFiltered.length?1:0)}–{Math.min(softwarePage*softwarePageSize,softwareFiltered.length)} จาก {softwareFiltered.length} รายการ</span>
                              <div className="flex gap-1.5">
                                <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors"
                                  disabled={softwarePage<=1} onClick={()=>setSoftwarePage(softwarePage-1)}>← ก่อน</button>
                                <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium transition-colors"
                                  disabled={softwarePage>=Math.ceil(softwareFiltered.length/softwarePageSize)} onClick={()=>setSoftwarePage(softwarePage+1)}>ถัดไป →</button>
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

      {/* ── Modals ── */}
      {showAssetModal && (
        <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-7 w-full max-w-[440px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-[16px] font-bold mb-1">Edit Fix Asset</h3>
            <div className="text-[13px] text-gray-500 mb-5">Hostname: {modalData.hostname}</div>
            <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Fix Asset Number</label>
            <input type="text" value={modalData.assetInput||''} onChange={e=>setModalData({...modalData,assetInput:e.target.value})}
              placeholder="e.g. DCI-IT-00123"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-600 outline-none transition-colors font-mono" />
            <div className="flex justify-end gap-2.5 mt-5">
              <button className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                onClick={()=>setShowAssetModal(false)}>Cancel</button>
              <button className="px-5 py-2.5 rounded-lg bg-[#2563eb] text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors"
                onClick={saveAsset}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-7 w-full max-w-[400px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-[16px] font-bold mb-2">Delete Monitor Record</h3>
            <p className="text-[14px] text-gray-600 leading-relaxed mb-5">คุณต้องการลบ <b>{modalData.hostname}</b> และข้อมูลทั้งหมดออกจากระบบใช่หรือไม่?</p>
            <div className="flex justify-end gap-2.5 mt-5">
              <button className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                onClick={()=>setShowDeleteModal(false)}>Cancel</button>
              <button className="px-5 py-2.5 rounded-lg bg-[#dc2626] text-white text-[13px] font-semibold hover:bg-red-700 transition-colors"
                onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-5 left-5 bg-[#16a34a] text-white px-4 py-3 rounded-lg text-[13px] font-medium shadow-lg z-[9999] animate-in slide-in-from-bottom-5 duration-300">
          {toastMsg}
        </div>
      )}

    </div>
  );
};

export default MOInventoryPage;