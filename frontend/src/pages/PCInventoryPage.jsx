import { ChevronLeft, Download, RefreshCw, Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE } from '../config/api';
import MOInventoryPage from './MOInventoryPage';


const PCInventoryPage = () => {
  const [inventoryType, setInventoryType] = useState('pc');
  const [view, setView] = useState('list');
  const [hostname, setHostname] = useState(null);
  
  const [invData, setInvData] = useState([]);
  const [sumData, setSumData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterKeys, setFilterKeys] = useState(location.state?.filterKey ? [{ key: location.state.filterKey, label: location.state.filterLabel }] : []);
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

  const [toastMsg, setToastMsg] = useState('');
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showBlModal, setShowBlModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [modalData, setModalData] = useState({});
  const [multiLoginData, setMultiLoginData] = useState({ data: [], allHostnames: [] });
  const [showMultiLoginModal, setShowMultiLoginModal] = useState(false);

  useEffect(() => {
    if (view === 'list') {
      fetchData();
    } else if (view === 'detail' && hostname) {
      fetchDetail(hostname);
    }
  }, [view, hostname]);

  const fetchData = async () => {
    setLoading(true); setError('');
    try {
      const [invRes, sumRes, mlRes] = await Promise.all([
        fetch(`${API_BASE}/pc-inventory`).then(r => r.json()),
        fetch(`${API_BASE}/pc-inventory/summary`).then(r => r.json()),  // ← เพิ่ม comma
        fetch(`${API_BASE}/pc-inventory/multi-login`).then(r => r.json())
      ]);
      if (!invRes.success) throw new Error(invRes.error || 'Failed to fetch');
      setInvData(invRes.data || []);
      setSumData(sumRes.success ? sumRes : null);
      if (mlRes.success) setMultiLoginData(mlRes);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const fetchDetail = async (hn) => {
    setDetailLoading(true);
    setError('');
    try {
      // Create helper to safely fetch and ignore 404s
      const safeFetch = async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) {
            console.warn(`Fetch failed for ${url} with status ${r.status}`);
            return { success: false, data: null };
          }
          return await r.json();
        } catch (e) {
          console.warn(`Network error for ${url}:`, e);
          return { success: false, data: null };
        }
      };

      const [ir, ur, sr] = await Promise.all([
        safeFetch(`${API_BASE}/pc-inventory/${encodeURIComponent(hn)}`),
        safeFetch(`${API_BASE}/pc-active-users/${encodeURIComponent(hn)}`),
        safeFetch(`${API_BASE}/pc-inventory/${encodeURIComponent(hn)}/software`)
      ]);

      console.log('=== PC Detail Data ===');
      console.log('Inventory Response:', ir);
      console.log('Users Response:', ur);
      console.log('Software Response:', sr);

      if (!ir || !ir.success || !ir.data) {
        throw new Error(`ไม่พบข้อมูลคอมพิวเตอร์นี้ในระบบ (Inventory Data Not Found)`);
      }

      const softwareData = sr && sr.success ? sr.data : [];
      console.log('Software data processed:', softwareData);

      setDetailData({
        inv: ir.success ? ir.data : null,
        users: ur && ur.success ? ur.data : [],
        software: softwareData
      });
      setSoftwarePage(1);
      setSoftwareSearch('');
    } catch (err) {
      console.error("fetchDetail error:", err);
      setError(err.message);
    }
    finally { setDetailLoading(false); }
  };

  const getHostsForKey = (key) => {
    if (!sumData) return [];
    if (key === 'noEdr') return sumData.noEdr;
    if (key === 'noTanium') return sumData.noTanium;
    if (key === 'noUems') return sumData.noUems;
    if (key === 'blDisabled') return sumData.blDisabled;
    if (key === 'noAsset') return sumData.noAsset;
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

  const onSearchInput = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length >= 2) {
      try {
        const res = await fetch(`${API_BASE}/pc-inventory/search?q=${encodeURIComponent(q)}`).then(r => r.json());
        if (res.success) { setInvData(res.data || []); setPage(1); }
      } catch (err) { }
    } else if (q.length === 0) {
      fetchData();
    }
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

  const filteredData = useMemo(() => {
    let result = [...invData];
    if (filterKeys.length > 0) {
      const allHostSets = filterKeys.map(fk => new Set(getHostsForKey(fk.key)));
      const intersection = allHostSets.reduce((acc, set) => new Set([...acc].filter(x => set.has(x))));
      result = result.filter(d => intersection.has(d.hostname));
    }
    if (searchQuery.length === 1) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => Object.values(d).join(' ').toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const aVal = (a[sortKey] || '').toString().toLowerCase();
      const bVal = (b[sortKey] || '').toString().toLowerCase();
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
    return result;
  }, [invData, filterKeys, searchQuery, sortKey, sortAsc, sumData]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentList = filteredData.slice((page - 1) * pageSize, page * pageSize);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const saveAsset = async () => {
    try {
      const res = await fetch(`${API_BASE}/pc-inventory/${encodeURIComponent(modalData.hostname)}/asset`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fix_asset: modalData.assetInput })
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
        body: JSON.stringify({ bitlocker_key_c: modalData.keyC, bitlocker_key_d: modalData.keyD, bitlocker_pin: modalData.pin })
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
            >
              Detail
            </span>
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
      return (s.name || '').toLowerCase().includes(q) || (s.version || '').toLowerCase().includes(q) || (s.publisher || '').toLowerCase().includes(q);
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

  const exportPCDetail = () => {
    try {
      if (!detailData.inv) {
        showToast('❌ ไม่มีข้อมูล PC ที่จะ export');
        return;
      }

      console.log('📊 EXPORT DEBUG INFO:');
      console.log('Hostname:', hostname);
      console.log('PC Info Fields:', {
        hostname: detailData.inv.hostname,
        computer_type: detailData.inv.computer_type,
        ip_address: detailData.inv.ip_address,
        os_name: detailData.inv.os_name,
        cpu_name: detailData.inv.cpu_name
      });
      console.log('Active Users Count:', detailData.users.length);
      console.log('Active Users:', detailData.users);
      console.log('Software Count:', detailData.software.length);
      console.log('Software Sample:', detailData.software.slice(0, 5));

      const wb = XLSX.utils.book_new();

      // Sheet 1: PC Information
      const invSheet = [[
        'Field', 'Value'
      ]];
      const invFields = [
        ['Hostname', detailData.inv.hostname],
        ['Computer Type', detailData.inv.computer_type],
        ['Manufacturer', detailData.inv.manufacturer],
        ['Model', detailData.inv.model],
        ['Serial Number', detailData.inv.serial_number],
        ['IP Address', detailData.inv.ip_address],
        ['MAC Address', detailData.inv.mac_address],
        ['Domain', detailData.inv.domain],
        ['Fix Asset', detailData.inv.fix_asset],
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
        ['CrowdStrike Ver', detailData.inv.crowdstrike_ver],
        ['Tanium Ver', detailData.inv.tanium_ver],
        ['UEMS Ver', detailData.inv.uems_ver],
        ['Last Updated', detailData.inv.updated_at],
      ];
      if (isNotebookType(detailData.inv)) {
        invFields.push(['Battery Status', detailData.inv.battery_status]);
        invFields.push(['Battery Health', detailData.inv.battery_health]);
        invFields.push(['Battery Percent', detailData.inv.battery_percent]);
      }
      const invData = [...invSheet, ...invFields];
      const ws1 = XLSX.utils.aoa_to_sheet(invData);
      XLSX.utils.book_append_sheet(wb, ws1, 'PC Info');

      // Sheet 2: Active Users
      const usersData = [
        ['Username', 'Session Name', 'Session ID', 'State', 'Logon Time'],
        ...detailData.users.map(u => [
          u.username || '—',
          u.session_name || '—',
          u.session_id || '—',
          u.state || '—',
          u.logon_time || '—'
        ])
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(usersData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Active Users');

      // Sheet 3: Installed Software
      const softData = [
        ['Name', 'Version', 'Publisher', 'Install Location', 'Size (MB)'],
        ...detailData.software.map(s => [
          s.name || '—',
          s.version || '—',
          s.publisher || '—',
          s.install_location || '—',
          s.size_mb || '—'
        ])
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(softData);
      XLSX.utils.book_append_sheet(wb, ws3, 'Software');

      console.log('✅ Export file created - Sheets:', [ws1, ws2, ws3].filter(s => s).length);

      const filename = `${hostname}_inventory_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast(`✓ Export สำเร็จ: ${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      showToast(`❌ Export ล้มเหลว: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Inventory Type Tabs */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
        <button
          onClick={() => setInventoryType('pc')}
          className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${inventoryType === 'pc'
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
            }`}
        >
          💻 PC INVENTORY
        </button>
        <button
          onClick={() => setInventoryType('mo')}
          className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${inventoryType === 'mo'
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
            }`}
        >
          🖥️ MONITOR INVENTORY
        </button>
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
                <RefreshCw size={16} className={loading || detailLoading ? "animate-spin text-indigo-500" : ""} /> Refresh
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
                    <StatBox id="lowDiskCSpace" label="Disk C > 80% Used" list={sumData?.lowDiskCSpace} textClass="text-red-600" bgClass="bg-red-50" ringClass="ring-red-500" />
                    <StatBox id="oldFixAssets" label="Old Fix Assets" list={sumData?.oldFixAssets} textClass="text-orange-600" bgClass="bg-orange-50" ringClass="ring-orange-500" />
                    <StatBox id="multiLogin" label="Multi-Login Users" list={multiLoginData.allHostnames} textClass="text-purple-600" bgClass="bg-purple-50" ringClass="ring-purple-500" onSecondaryClick={() => setShowMultiLoginModal(true)} />
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

                  {filterKeys.length > 0 && (
                    <div className="flex items-center gap-2 bg-[#eff4ff] border border-[#bfcfff] rounded-xl px-3.5 py-2 mb-3 text-[13px] font-medium text-[#2563eb]">
                      ☞ Filter: <b>{filterKeys.map(k => k.label).join(' + ')}</b>
                      <span className="text-gray-500 text-xs ml-1">({filteredData.length} เครื่อง)</span>
                      <button onClick={() => setFilterKeys([])} className="ml-auto bg-transparent border border-[#bfcfff] px-2 py-0.5 rounded flex items-center gap-1 text-xs hover:bg-[#bfcfff] transition-colors"><X size={12} /> ล้าง</button>
                    </div>
                  )}

                  <div className="relative mb-3 flex w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Search size={15} /></div>
                    <input type="text" placeholder="ค้นหาทุกฟิลด์: hostname, IP, Serial, CPU, Softwareฯลฯ" className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-9 pr-4 text-[13px] outline-none shadow-sm focus:border-blue-500 transition-colors" value={searchQuery} onChange={onSearchInput} />
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
                              <td className="py-2 px-3 text-[13px] font-medium text-blue-600">{(d.active_usernames || '—').split(',')[0]}</td>
                              <td className="py-2 px-3 text-[13px] font-mono text-purple-600 font-medium">{d.fix_asset || '—'}</td>
                              <td className="py-2 px-3 text-[13px] text-gray-600">{d.computer_type || '—'}</td>
                              <td className="py-2 px-3 text-[13px] font-mono text-gray-600">{d.serial_number || '—'}</td>
                              <td className="py-2 px-3 text-[13px] text-gray-600">{d.os_name || '—'} {d.os_release || ''}</td>
                              <td className="py-2 px-3 text-[13px] text-gray-600">{fmtDate(d.logon_time)}</td>
                              <td className="py-2 px-3">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${d.bitlocker === 'Enabled' ? 'bg-green-100 text-green-700' : d.bitlocker === 'Disabled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${d.bitlocker === 'Enabled' ? 'bg-green-500' : d.bitlocker === 'Disabled' ? 'bg-red-500' : 'bg-amber-500'}`}></div>{d.bitlocker || '—'}
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
                <button className="flex items-center gap-2 bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 mb-5 transition-all" onClick={() => { setView('list'); setHostname(null); }}>
                  <ChevronLeft size={16} /> กลับหน้ารายการ
                </button>

                {detailLoading ? (
                  <div className="flex justify-center items-center py-16 text-gray-500 text-sm gap-2">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div> กำลังโหลด {hostname}...
                  </div>
                ) : error ? (
                  <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-[13.5px] text-red-600 mb-4 font-semibold">⚠️ {error}</div>
                ) : detailData.inv ? (
                  <>
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-5 flex flex-wrap items-center gap-5">
                      <div className="w-14 h-14 rounded-[14px] bg-[#eff4ff] border border-[#bfcfff] flex items-center justify-center text-[26px] shrink-0">
                        {(detailData.inv.computer_type || '').toLowerCase().includes('notebook') ? '💻' : (detailData.inv.computer_type || '').toLowerCase().includes('tablet') ? '📱' : '🖥️'}
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
                        <button className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5" onClick={exportPCDetail}><Download size={14} /> Export</button>
                        <button className="bg-red-50 text-red-600 border border-[#fca5a5] hover:bg-red-100 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors" onClick={() => { setModalData({ hostname }); setShowDeleteModal(true); }}>Delete</button>
                      </div>
                    </div>

                    {/* OS & Battery Information Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
                      {/* OS Information - REMOVED, will merge into Systems section */}

                      {/* Battery Information - REMOVED, will merge into Battery/Power section */}
                    </div>

                    {/* Sections */}
                    {(() => {
                      const InfoCell = ({ label, value, fontCls, textCol, wrapperClass }) => (
                        <div className={`bg-white p-3.5 px-4 ${wrapperClass || ''}`}>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
                          <div className={`text-[13.5px] font-medium ${fontCls || ''} ${(value === null || value === '' || value === undefined) ? 'text-gray-400 italic' : textCol ? textCol : 'text-gray-900'} ${fontCls?.includes('whitespace-') ? '' : 'whitespace-pre-wrap'}`}>{(value === null || value === '' || value === undefined) ? '—' : value}</div>
                        </div>
                      );

                      return (
                        <div className="space-y-6">
                          {/* CURRENT SESSIONS */}
                          <div>
                            <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1 flex items-center">Sessions ปัจจุบัน</div>
                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-[13px]">
                                  <thead className="bg-[#f5f6f8] border-b border-gray-200 text-[#9ca3af] text-[10px] uppercase tracking-wider">
                                    <tr><th className="py-2 px-3">Username</th><th className="py-2 px-3">Session Name</th><th className="py-2 px-3">Session ID</th><th className="py-2 px-3">State</th><th className="py-2 px-3">Logon Time</th></tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {detailData.users.length === 0 ? <tr><td colSpan="5" className="text-center py-8 text-gray-400 font-medium text-xs">ไม่มี session</td></tr> : detailData.users.map(u => (
                                      <tr key={u.id}>
                                        <td className="py-2 px-3 font-medium text-blue-600">{u.username || '—'}</td>
                                        <td className="py-2 px-3 text-gray-600">{u.session_name || '—'}</td>
                                        <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{u.session_id || '—'}</td>
                                        <td className="py-2 px-3"><span className={`inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold ${u.state?.toUpperCase() === 'ACTIVE' ? 'bg-green-100 text-green-700' : u.state?.toUpperCase() === 'DISC' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}><div className="w-1.5 h-1.5 rounded-full bg-current"></div>{u.state}</span></td>
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
                                return <InfoCell key={i} label={`Disk ${letter}`} value={`Total: ${tm ? tm[1] : ''}\nFree: ${fm ? fm[1] : ''}`} textCol="text-green-600" />
                              })}
                              <InfoCell label="GPU" value={detailData.inv.gpu} />
                              <InfoCell label="Resolution" value={detailData.inv.resolution} />
                              <InfoCell label="BIOS Version" value={detailData.inv.bios_version} fontCls="font-mono text-[12px] text-gray-500" />
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
                              {isNotebookType(detailData.inv) && (
                                <>
                                  <InfoCell label="BitLocker Key C:" value={detailData.inv.bitlocker_key_c} fontCls="font-mono text-[12px] text-blue-600 whitespace-nowrap overflow-x-auto custom-scrollbar tracking-tight" wrapperClass="sm:col-span-2 lg:col-span-2" />
                                  <InfoCell label="BitLocker Key D:" value={detailData.inv.bitlocker_key_d} fontCls="font-mono text-[12px] text-blue-600 whitespace-nowrap overflow-x-auto custom-scrollbar tracking-tight" wrapperClass="sm:col-span-2 lg:col-span-2" />
                                  <InfoCell label="BitLocker PIN" value={detailData.inv.bitlocker_pin} fontCls="font-mono text-[13px] text-purple-600 font-bold" />
                                </>
                              )}
                            </div>
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
                                      <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => { setSoftwareSortKey('name'); setSoftwareSortAsc(!softwareSortAsc); }}>Name {softwareSortKey === 'name' ? (softwareSortAsc ? '▲' : '▼') : '↕'}</th>
                                      <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => { setSoftwareSortKey('version'); setSoftwareSortAsc(!softwareSortAsc); }}>Version {softwareSortKey === 'version' ? (softwareSortAsc ? '▲' : '▼') : '↕'}</th>
                                      <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => { setSoftwareSortKey('publisher'); setSoftwareSortAsc(!softwareSortAsc); }}>Publisher {softwareSortKey === 'publisher' ? (softwareSortAsc ? '▲' : '▼') : '↕'}</th>
                                      <th className="py-2.5 px-3 font-semibold">Install Location</th>
                                      <th className="py-2.5 px-3 font-semibold">Size</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {softwareFiltered.slice((softwarePage - 1) * softwarePageSize, softwarePage * softwarePageSize).length === 0 ? <tr><td colSpan="5" className="text-center py-8 text-gray-400">ไม่พบซอฟต์แวร์</td></tr> : softwareFiltered.slice((softwarePage - 1) * softwarePageSize, softwarePage * softwarePageSize).map(s => (
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
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-7 w-full max-w-[440px] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-[16px] font-bold mb-1 border-gray-800">Edit Fix Asset</h3>
            <div className="text-[13px] text-gray-500 mb-5">Hostname: {modalData.hostname}</div>
            <label className="block text-[12px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5">Fix Asset Number</label>
            <input type="text" value={modalData.assetInput || ''} onChange={e => setModalData({ ...modalData, assetInput: e.target.value })} placeholder="e.g. DCI-IT-00123" className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-600 outline-none transition-colors font-mono" />
            <div className="flex justify-end gap-2.5 mt-5">
              <button className="px-5 py-2.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors" onClick={() => setShowAssetModal(false)}>Cancel</button>
              <button className="px-5 py-2.5 rounded-lg bg-[#2563eb] text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors" onClick={saveAsset}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showBlModal && (
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
      )}

      {showDeleteModal && (
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
      )}

     {showMultiLoginModal && (
  <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl w-full max-w-[760px] shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200">
      
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[#f0effe] border border-[#d0cbf8] flex items-center justify-center text-[18px] shrink-0">👥</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-gray-900">Users ที่ Login หลายเครื่อง</span>
              <span className="inline-flex items-center gap-1 bg-[#f0effe] border border-[#d0cbf8] text-[#534ab7] rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                {multiLoginData.data.length} users
              </span>
            </div>
            <div className="text-[12px] text-gray-400 mt-0.5">{multiLoginData.allHostnames.length} เครื่องที่เกี่ยวข้อง</div>
          </div>
        </div>
        <button onClick={() => setShowMultiLoginModal(false)} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
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
              {/* User row */}
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full bg-[#e1f5ee] border border-[#9fe1cb] flex items-center justify-center text-[11px] font-semibold text-[#0f6e56] shrink-0">
                  {initials}
                </div>
                <span className="text-[13px] font-bold text-gray-900">{u.username}</span>
                <span className="bg-[#ede9ff] text-[#534ab7] border border-[#d0cbf8] rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {u.machine_count} เครื่อง
                </span>
                <span className="ml-auto text-[11px] text-gray-400 font-mono">
                  {u.latest_logon ? fmtDate(u.latest_logon) : '—'}
                </span>
              </div>

              {/* PC grid 4 columns */}
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
                        <span className="inline-flex items-center gap-1 bg-[#dcfce7] text-[#16a34a] rounded-full px-1.5 py-[1px] text-[10px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] inline-block"></span>Active
                        </span>
                      ) : d.state?.toUpperCase() === 'DISC' ? (
                        <span className="inline-flex items-center gap-1 bg-[#fee2e2] text-[#dc2626] rounded-full px-1.5 py-[1px] text-[10px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#dc2626] inline-block"></span>Disc
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 rounded-full px-1.5 py-[1px] text-[10px] font-semibold">—</span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">
                      {d.logon_time && d.logon_time !== '-' ? fmtDate(d.logon_time) : '—'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
        <button
          onClick={() => setShowMultiLoginModal(false)}
          className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ปิด
        </button>
      </div>
    </div>
  </div>
)}
      {toastMsg && (
        <div className="fixed bottom-5 left-5 bg-[#16a34a] text-white px-4 py-3 rounded-lg text-[13px] font-medium shadow-lg z-[9999] animate-in slide-in-from-bottom-5 duration-300">
          {toastMsg}
        </div>
      )}

      {inventoryType === 'mo' && (
        <MOInventoryPage />
      )}
    </div>
  );
};
export default PCInventoryPage;
