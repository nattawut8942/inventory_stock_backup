import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion'; 
import Pagination from '../components/Pagination';
import { API_BASE } from '../config/api';
import {
    Users, Monitor, Shield, FolderTree, Search,
    RefreshCw, ArrowUpDown, ChevronUp, ChevronDown, ChevronRight, X,
    Wifi, WifiOff, Lock, Network, AlertCircle,
    ExternalLink, Info, Calendar, Eye, Building2,
    Hash, User, Cpu
} from 'lucide-react';

const ITEMS_PER_PAGE = 20;
const SESSION_KEY = 'ad_explorer_state';

// ========== SESSION HELPERS ==========
const saveSession = (state) => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch {}
};
const loadSession = () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {}; } catch { return {}; }
};

// ========== UTILS ==========
const useDebounce = (fn, delay) => {
    const timer = useRef(null);
    return useCallback((...args) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => fn(...args), delay);
    }, [fn, delay]);
};

// ========== BADGE ==========
const Badge = ({ label, color }) => {
    const colors = {
        green:  'bg-emerald-100 text-emerald-700 border-emerald-200',
        red:    'bg-red-100 text-red-700 border-red-200',
        blue:   'bg-indigo-100 text-indigo-700 border-indigo-200',
        purple: 'bg-purple-100 text-purple-700 border-purple-200',
        yellow: 'bg-amber-100 text-amber-700 border-amber-200',
        slate:  'bg-slate-100 text-slate-600 border-slate-200',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border ${colors[color] || colors.slate}`}>
            {label}
        </span>
    );
};

// ========== MODAL ==========
const Modal = ({ open, onClose, title, children }) => {
    useEffect(() => {
        const handler = (e) => e.key === 'Escape' && onClose();
        if (open) window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-4" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
                    <h3 className="text-base font-bold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </motion.div>
        </div>
    );
};

// ========== EMPTY STATE ==========
const EmptyState = ({ icon: Icon, message }) => (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Icon size={36} strokeWidth={1} className="mb-3 text-slate-300" />
        <p className="text-sm font-medium">{message}</p>
    </div>
);

// ========== LOADING ROW ==========
const LoadingRows = ({ cols }) => (
    <>
        {[...Array(6)].map((_, i) => (
            <tr key={i} className="border-b border-slate-100">
                {[...Array(cols)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} />
                    </td>
                ))}
            </tr>
        ))}
    </>
);

// ========== SEARCH INPUT ==========
const SearchInput = ({ value, onChange, placeholder }) => (
    <div className="relative w-full max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            // เพิ่ม pr-10 (padding-right) เพื่อเว้นที่ว่างให้ปุ่มกากบาท
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all shadow-sm"
        />
        {/* ปุ่มล้างคำค้นหา จะแสดงก็ต่อเมื่อมีข้อความ (value) อยู่ */}
        {value && (
            <button
                onClick={() => onChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 bg-slate-100 hover:bg-red-50 rounded-full p-1 transition-colors"
                title="ล้างคำค้นหา"
            >
                <X size={12} strokeWidth={3} />
            </button>
        )}
    </div>
);

// ========== TAB BUTTON ==========
const TabBtn = ({ active, onClick, icon: Icon, label, count }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
            active
                ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
        }`}
    >
        <Icon size={16} />
        <span className="hidden sm:inline">{label}</span>
        {count !== undefined && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {count}
            </span>
        )}
    </button>
);

// ========== STAT CARD ==========
const StatCard = ({ icon: Icon, label, value, color }) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        <div className="flex items-start justify-between">
            <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</p>
                <h3 className="text-2xl font-black text-slate-900">{value}</h3>
            </div>
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
        </div>
    </motion.div>
);

// ========== OU NODE ==========
const OUNode = ({ node, depth = 0, onSelect, selectedDN }) => {
    const [open, setOpen] = useState(depth === 0);
    const hasChildren = node.children?.length > 0;
    const isSelected = selectedDN === node.dn;

    return (
        <div>
            <div
                className={`flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer transition-colors group
                    ${isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'}`}
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
                onClick={() => {
                    if (hasChildren) setOpen(!open);
                    onSelect(node);
                }}
            >
                {hasChildren
                    ? open
                        ? <ChevronDown size={14} className="text-indigo-500 flex-shrink-0" />
                        : <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
                    : <span className="w-3.5" />
                }
                <FolderTree size={14} className={`flex-shrink-0 ${isSelected ? 'text-indigo-500' : open ? 'text-amber-500' : 'text-slate-400'}`} />
                <span className={`text-sm font-mono transition-colors break-words ${isSelected ? 'text-indigo-700 font-bold' : 'text-slate-700 group-hover:text-slate-900'}`}>
                    {node.name}
                </span>
                {node.description && (
                    <span className="text-xs text-slate-400 italic hidden group-hover:inline truncate max-w-[200px]">
                        // {node.description}
                    </span>
                )}
                {isSelected && (
                    <span className="ml-auto text-[10px] font-bold text-indigo-500 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        Selected
                    </span>
                )}
            </div>
            {open && hasChildren && (
                <div className="border-l border-slate-200 ml-5">
                    {node.children.map((child, i) => (
                        <OUNode key={i} node={child} depth={depth + 1} onSelect={onSelect} selectedDN={selectedDN} />
                    ))}
                </div>
            )}
        </div>
    );
};

// ========== OU MEMBER TABLE (MODIFIED) ==========
const OUMemberTable = ({ ouNode, onViewUser }) => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // State สำหรับเก็บค่าการ Sort (เริ่มแรกให้เรียงตาม Name แบบ A-Z)
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' }); 

    useEffect(() => {
        if (!ouNode?.dn) return;
        const fetchMembers = async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `${API_BASE}/ad/ou-members?dn=${encodeURIComponent(ouNode.dn)}&scope=sub`
                ).then(r => r.json());
                
                const combinedList = [
                    ...(res.users || []).map(u => ({ ...u, _type: 'User' })),
                    ...(res.computers || []).map(c => ({ ...c, _type: 'Computer' }))
                ];
                
                setMembers(combinedList);
            } catch { setMembers([]); }
            setLoading(false);
        };
        fetchMembers();
    }, [ouNode?.dn]);

    // ฟังก์ชันสำหรับคลิกเปลี่ยน Sort
    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // ตัวแปรข้อมูลที่ถูก Sort แล้ว (จะถูกเรียกใช้ตอน Render)
    const sortedMembers = useMemo(() => {
        let sortableItems = [...members];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue = '', bValue = '';
                
                switch (sortConfig.key) {
                    case 'type':
                        aValue = a._type; bValue = b._type; break;
                    case 'name':
                        aValue = (a._type === 'User' ? a.username : a.name) || '';
                        bValue = (b._type === 'User' ? b.username : b.name) || '';
                        break;
                    case 'displayName':
                        aValue = (a._type === 'User' ? a.displayName : a.hostname) || '';
                        bValue = (b._type === 'User' ? b.displayName : b.hostname) || '';
                        break;
                    case 'info':
                        aValue = (a._type === 'User' ? a.department : a.created) || '';
                        bValue = (b._type === 'User' ? b.department : b.created) || '';
                        break;
                    case 'status':
                        aValue = a._type === 'User' ? (a.enabled ? '1' : '0') : (a.os || '');
                        bValue = b._type === 'User' ? (b.enabled ? '1' : '0') : (b.os || '');
                        break;
                    default: break;
                }

                aValue = String(aValue).toLowerCase();
                bValue = String(bValue).toLowerCase();

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [members, sortConfig]);

    if (!ouNode) return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <FolderTree size={40} strokeWidth={1} className="mb-3 text-slate-200" />
            <p className="text-sm font-medium">เลือก OU เพื่อดูข้อมูลภายใน</p>
        </div>
    );

    const tableHeaders = [
        { label: 'Type', key: 'type' },
        { label: 'Name', key: 'name' },
        { label: 'Display Name / Hostname', key: 'displayName' },
        { label: 'Additional Info', key: 'info' },
        { label: 'Status', key: 'status' },
        { label: '', key: null }
    ];

    return (
        <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <FolderTree size={18} className="text-amber-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="font-bold text-amber-800 text-sm font-mono truncate">{ouNode.name}</div>
                    <div className="text-xs text-amber-600 font-mono truncate">{ouNode.dn}</div>
                </div>
                <div className="flex-shrink-0 text-center bg-white border border-amber-200 rounded-lg px-3 py-1">
                    <div className="text-lg font-black text-amber-700">{loading ? '...' : members.length}</div>
                    <div className="text-[10px] text-amber-600 font-bold uppercase">Objects</div>
                </div>
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : members.length === 0 ? (
                <EmptyState icon={Users} message="ไม่มี User หรือ Computer ใน OU นี้" />
            ) : (
                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                {tableHeaders.map((h, idx) => (
                                    <th key={idx} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                                        {h.key ? (
                                            <button
                                                onClick={() => requestSort(h.key)}
                                                className="flex items-center gap-1 hover:text-slate-800 transition-colors focus:outline-none"
                                            >
                                                {h.label}
                                                {sortConfig.key === h.key ? (
                                                    sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-indigo-500" /> : <ChevronDown size={12} className="text-indigo-500" />
                                                ) : (
                                                    <ArrowUpDown size={12} className="opacity-30" />
                                                )}
                                            </button>
                                        ) : (
                                            h.label
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 bg-white">
                            {sortedMembers.map((m, i) => (
                                <tr key={i} 
                                    onClick={() => m._type === 'User' && onViewUser(m.username)}
                                    className={`transition-colors group align-top ${m._type === 'User' ? 'hover:bg-indigo-50/50 cursor-pointer' : 'hover:bg-amber-50/50'}`}>
                                    
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {m._type === 'User' ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                                                <Users size={12} /> User
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
                                                <Monitor size={12} /> Computer
                                            </span>
                                        )}
                                    </td>

                                    <td className={`px-3 py-2 font-mono text-xs font-bold break-all ${m._type === 'User' ? 'text-indigo-600' : 'text-amber-600'}`}>
                                        {m._type === 'User' ? m.username : m.name}
                                    </td>

                                    <td className="px-3 py-2 text-slate-700 font-medium break-all text-xs">
                                        {m._type === 'User' ? (m.displayName || '—') : (m.hostname || '—')}
                                    </td>

                                    <td className="px-3 py-2 text-slate-500 text-xs break-words max-w-[150px]">
                                        {m._type === 'User' ? (m.department || '—') : (m.created || '—')}
                                    </td>

                                    <td className="px-3 py-2">
                                        {m._type === 'User' ? (
                                            <Badge label={m.enabled ? 'Enabled' : 'Disabled'} color={m.enabled ? 'green' : 'red'} />
                                        ) : (
                                            <Badge label={m.os || 'Unknown'} color="blue" />
                                        )}
                                    </td>

                                    <td className="px-3 py-2">
                                        {m._type === 'User' && (
                                            <ExternalLink size={14} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ========== MAIN COMPONENT ==========
const ADExplorer = () => {
    const navigate = useNavigate();

    // โหลด session เดิม
    const session = loadSession();

    const [tab, setTab]             = useState(session.tab || 'users');
    const [connStatus, setConnStatus] = useState('idle');

    // Users
    const [userQuery, setUserQuery] = useState(session.userQuery || '');
    const [users, setUsers]         = useState([]);
    const [userLoading, setUserLoading] = useState(false);
    const [userPage, setUserPage] = useState(1);
    const [userSort, setUserSort]   = useState({ key: 'username', direction: 'asc' });

    // Computers
    const [compQuery, setCompQuery] = useState(session.compQuery || '');
    const [computers, setComputers] = useState([]);
    const [compLoading, setCompLoading] = useState(false);
    const [selectedComp, setSelectedComp] = useState(null);
    const [compPage, setCompPage] = useState(1);
    const [compSort, setCompSort]   = useState({ key: 'name', direction: 'asc' });

    // Groups
    const [groupQuery, setGroupQuery] = useState(session.groupQuery || '');
    const [groups, setGroups]         = useState([]);
    const [groupLoading, setGroupLoading] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [groupPage, setGroupPage] = useState(1);
    const [groupSort, setGroupSort]   = useState({ key: 'name', direction: 'asc' });

    // OU
    const [ouData, setOuData]         = useState([]);
    const [ouLoading, setOuLoading]   = useState(false);
    const [selectedOU, setSelectedOU] = useState(null);

    useEffect(() => {
    saveSession({ tab, userQuery, compQuery, groupQuery });
    }, [tab, userQuery, compQuery, groupQuery]);

    useEffect(() => { checkConnection(); fetchUsers(userQuery); fetchComputers(compQuery); fetchGroups(groupQuery); }, []);

    const checkConnection = async () => {
        setConnStatus('checking');
        try {
            const res = await fetch(`${API_BASE}/ad/test`);
            const data = await res.json();
            setConnStatus(data.success ? 'ok' : 'error');
        } catch { setConnStatus('error'); }
    };

    const fetchUsers = useCallback(async (q = '') => {
        setUserLoading(true);
        try {
            const data = await fetch(`${API_BASE}/ad/users?q=${encodeURIComponent(q)}`).then(r => r.json());
            setUsers(data.data || []);
        } catch { setUsers([]); }
        setUserLoading(false);
    }, []);

    const fetchComputers = useCallback(async (q = '') => {
        setCompLoading(true);
        try {
            const data = await fetch(`${API_BASE}/ad/computers?q=${encodeURIComponent(q)}`).then(r => r.json());
            setComputers(data.data || []);
        } catch { setComputers([]); }
        setCompLoading(false);
    }, []);

    const fetchGroups = useCallback(async (q = '') => {
        setGroupLoading(true);
        try {
            const data = await fetch(`${API_BASE}/ad/groups?q=${encodeURIComponent(q)}`).then(r => r.json());
            setGroups(data.data || []);
        } catch { setGroups([]); }
        setGroupLoading(false);
    }, []);

    const fetchOU = useCallback(async () => {
        setOuLoading(true);
        try {
            const data = await fetch(`${API_BASE}/ad/ou-structure`).then(r => r.json());
            setOuData(data.data || []);
        } catch { setOuData([]); }
        setOuLoading(false);
    }, []);

    const debouncedUsers  = useDebounce(fetchUsers,     400);
    const debouncedComps  = useDebounce(fetchComputers, 400);
    const debouncedGroups = useDebounce(fetchGroups,    400);

    useEffect(() => { debouncedUsers(userQuery);    }, [userQuery]);
    useEffect(() => { debouncedComps(compQuery);    }, [compQuery]);
    useEffect(() => { debouncedGroups(groupQuery);  }, [groupQuery]);
    useEffect(() => { if (tab === 'ou') fetchOU(); }, [tab]);

    const sortedUsers = useMemo(() => {
        return [...users].sort((a, b) => {
            let aVal = String(a[userSort.key] || '').toLowerCase();
            let bVal = String(b[userSort.key] || '').toLowerCase();
            if (userSort.key === 'enabled') { aVal = a.enabled ? '1' : '0'; bVal = b.enabled ? '1' : '0'; }
            if (aVal < bVal) return userSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return userSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [users, userSort]);
    const pagedUsers = useMemo(() => sortedUsers.slice((userPage  - 1) * ITEMS_PER_PAGE, userPage  * ITEMS_PER_PAGE), [sortedUsers, userPage]);

    const sortedComputers = useMemo(() => {
        return [...computers].sort((a, b) => {
            let aVal = String(a[compSort.key] || '').toLowerCase();
            let bVal = String(b[compSort.key] || '').toLowerCase();
            if (aVal < bVal) return compSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return compSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [computers, compSort]);
    const pagedComputers = useMemo(() => sortedComputers.slice((compPage  - 1) * ITEMS_PER_PAGE, compPage  * ITEMS_PER_PAGE), [sortedComputers, compPage]);

    const sortedGroups = useMemo(() => {
        return [...groups].sort((a, b) => {
            if (groupSort.key === 'memberCount') {
                return groupSort.direction === 'asc' ? (a.memberCount || 0) - (b.memberCount || 0) : (b.memberCount || 0) - (a.memberCount || 0);
            }
            let aVal = String(a[groupSort.key] || '').toLowerCase();
            let bVal = String(b[groupSort.key] || '').toLowerCase();
            if (aVal < bVal) return groupSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return groupSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [groups, groupSort]);
    const pagedGroups = useMemo(() => sortedGroups.slice((groupPage - 1) * ITEMS_PER_PAGE, groupPage * ITEMS_PER_PAGE), [sortedGroups, groupPage]);

    const enabledUsers = useMemo(() => users.filter(u => u.enabled).length, [users]);

    const connBadge = {
        idle:     { icon: <Wifi size={14} />,                             label: 'Test Connection', cls: 'text-slate-500 border-slate-200 bg-white' },
        checking: { icon: <RefreshCw size={14} className="animate-spin" />, label: 'Connecting...',   cls: 'text-slate-500 border-slate-200 bg-white' },
        ok:       { icon: <Wifi size={14} className="text-emerald-500" />,  label: 'Connected',       cls: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
        error:    { icon: <WifiOff size={14} className="text-red-500" />,   label: 'Offline',         cls: 'text-red-700 border-red-200 bg-red-50' },
    }[connStatus];

    const SortableHeader = ({ label, sortKey, currentSort, setSort }) => (
        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {sortKey ? (
                <button
                    onClick={() => {
                        if (currentSort.key === sortKey) setSort({ key: sortKey, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' });
                        else setSort({ key: sortKey, direction: 'asc' });
                    }}
                    className="flex items-center gap-1 hover:text-slate-800 transition-colors focus:outline-none text-left"
                >
                    {label}
                    {currentSort.key === sortKey ? (
                        currentSort.direction === 'asc' ? <ChevronUp size={12} className="text-indigo-500 shrink-0" /> : <ChevronDown size={12} className="text-indigo-500 shrink-0" />
                    ) : (
                        <ArrowUpDown size={12} className="opacity-30 shrink-0" />
                    )}
                </button>
            ) : (
                label
            )}
        </th>
    );

    return (
        <div className="space-y-6">

            {/* HEADER */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-3xl font-black text-slate-800 flex items-center gap-2">
                            <Shield size={28} className="text-indigo-500" /> AD EXPLORER
                        </h2>
                        <p className="text-slate-500 font-medium">Active Directory — จัดการ User, Computer, Group และ OU</p>
                    </div>
                    <button onClick={checkConnection}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold shadow-sm transition-all ${connBadge.cls}`}>
                        {connBadge.icon} {connBadge.label}
                    </button>
                </div>
            </motion.div>

            {/* OFFLINE WARNING */}
            {connStatus === 'error' && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
                    <AlertCircle size={16} />
                    ไม่สามารถเชื่อมต่อ Active Directory ได้ — ตรวจสอบ AD_CONFIG ใน adController.js
                </div>
            )}

            {/* STAT CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Users}   label="Users ทั้งหมด" value={users.length}     color="from-indigo-500 to-indigo-600" />
                <StatCard icon={Shield}  label="Enabled"        value={enabledUsers}     color="from-emerald-500 to-emerald-600" />
                <StatCard icon={Monitor} label="Computers"      value={computers.length} color="from-amber-500 to-amber-600" />
                <StatCard icon={Lock}    label="Groups"         value={groups.length}    color="from-purple-500 to-purple-600" />
            </div>

            {/* TABS */}
            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit flex-wrap gap-1">
                <TabBtn active={tab==='users'}     onClick={() => setTab('users')}     icon={Users}      label="Users"        count={users.length} />
                <TabBtn active={tab==='computers'} onClick={() => setTab('computers')} icon={Monitor}    label="Computers"    count={computers.length} />
                <TabBtn active={tab==='groups'}    onClick={() => setTab('groups')}    icon={Lock}       label="Groups"       count={groups.length} />
                <TabBtn active={tab==='ou'}        onClick={() => setTab('ou')}        icon={FolderTree} label="OU Structure" />
            </div>

            {/* ===== USERS ===== */}
            {tab === 'users' && (
                <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 border-b border-slate-100 gap-3">
                        <SearchInput value={userQuery} onChange={(v) => { setUserQuery(v); setUserPage(1); }} placeholder="ค้นหา Username, ชื่อ, Email..." />
                        <div className="flex items-center gap-2">
                            {userQuery && <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1">"{userQuery}" — {users.length} รายการ</span>}
                            <button onClick={() => fetchUsers(userQuery)} className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 transition-all">
                                <RefreshCw size={16} className={userLoading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <table className="w-full text-sm table-auto">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <SortableHeader label="#" sortKey={null} currentSort={userSort} setSort={setUserSort} />
                                    <SortableHeader label="Username" sortKey="username" currentSort={userSort} setSort={setUserSort} />
                                    <SortableHeader label="Display Name" sortKey="displayName" currentSort={userSort} setSort={setUserSort} />
                                    <SortableHeader label="Email" sortKey="email" currentSort={userSort} setSort={setUserSort} />
                                    <SortableHeader label="Department" sortKey="department" currentSort={userSort} setSort={setUserSort} />
                                    <SortableHeader label="Title" sortKey="title" currentSort={userSort} setSort={setUserSort} />
                                    <SortableHeader label="Status" sortKey="enabled" currentSort={userSort} setSort={setUserSort} />
                                    <SortableHeader label="" sortKey={null} currentSort={userSort} setSort={setUserSort} />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {userLoading ? <LoadingRows cols={8} /> : users.length === 0 ? (
                                    <tr><td colSpan={8}><EmptyState icon={Users} message="ไม่พบข้อมูล User" /></td></tr>
                                ) : pagedUsers.map((u, i) => (
                                    <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                        onClick={() => navigate(`/ad-explorer/user/${u.username}`)}
                                        className="hover:bg-indigo-50/50 cursor-pointer transition-colors group align-top">
                                        <td className="px-3 py-2 text-slate-400 font-mono text-xs">{(userPage-1)*ITEMS_PER_PAGE+i+1}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-indigo-600 font-bold break-all">{u.username}</td>
                                        <td className="px-3 py-2 text-slate-800 font-semibold break-words text-xs min-w-[100px]">{u.displayName||'—'}</td>
                                        <td className="px-3 py-2 text-slate-500 break-all text-xs min-w-[120px]">{u.email||'—'}</td>
                                        <td className="px-3 py-2 text-slate-500 break-words text-xs">{u.department||'—'}</td>
                                        <td className="px-3 py-2 text-slate-500 break-words text-xs">{u.title||'—'}</td>
                                        <td className="px-3 py-2"><Badge label={u.enabled?'Enabled':'Disabled'} color={u.enabled?'green':'red'} /></td>
                                        <td className="px-3 py-2"><ExternalLink size={14} className="text-slate-300 group-hover:text-indigo-500 transition-colors" /></td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={userPage} totalPages={Math.ceil(users.length/ITEMS_PER_PAGE)} onPageChange={setUserPage} itemsPerPage={ITEMS_PER_PAGE} totalItems={users.length} />
                </motion.div>
            )}

            {/* ===== COMPUTERS ===== */}
            {tab === 'computers' && (
                <motion.div key="computers" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 border-b border-slate-100 gap-3">
                        <SearchInput value={compQuery} onChange={(v) => { setCompQuery(v); setCompPage(1); }} placeholder="ค้นหา Computer Name, Hostname, OS..." />
                        <div className="flex items-center gap-2">
                            {compQuery && <span className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">"{compQuery}" — {computers.length} รายการ</span>}
                            <button onClick={() => fetchComputers(compQuery)} className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 transition-all">
                                <RefreshCw size={16} className={compLoading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <table className="w-full text-sm table-auto">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <SortableHeader label="#" sortKey={null} currentSort={compSort} setSort={setCompSort} />
                                    <SortableHeader label="Name" sortKey="name" currentSort={compSort} setSort={setCompSort} />
                                    <SortableHeader label="Hostname" sortKey="hostname" currentSort={compSort} setSort={setCompSort} />
                                    <SortableHeader label="OS" sortKey="os" currentSort={compSort} setSort={setCompSort} />
                                    <SortableHeader label="OS Version" sortKey="osVersion" currentSort={compSort} setSort={setCompSort} />
                                    <SortableHeader label="Description" sortKey="description" currentSort={compSort} setSort={setCompSort} />
                                    <SortableHeader label="Created" sortKey="created" currentSort={compSort} setSort={setCompSort} />
                                    <SortableHeader label="" sortKey={null} currentSort={compSort} setSort={setCompSort} />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {compLoading ? <LoadingRows cols={8} /> : computers.length === 0 ? (
                                    <tr><td colSpan={8}><EmptyState icon={Monitor} message="ไม่พบข้อมูล Computer" /></td></tr>
                                ) : pagedComputers.map((c, i) => (
                                    <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                        onClick={() => setSelectedComp(c)}
                                        className="hover:bg-amber-50/50 cursor-pointer transition-colors group align-top">
                                        <td className="px-3 py-2 text-slate-400 font-mono text-xs">{(compPage-1)*ITEMS_PER_PAGE+i+1}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-amber-600 font-bold break-all">{c.name}</td>
                                        <td className="px-3 py-2 text-slate-700 font-medium break-all text-xs min-w-[120px]">{c.hostname||'—'}</td>
                                        <td className="px-3 py-2"><Badge label={c.os||'Unknown'} color="blue" /></td>
                                        <td className="px-3 py-2 font-mono text-xs text-slate-500 break-words">{c.osVersion||'—'}</td>
                                        <td className="px-3 py-2 text-slate-500 text-xs break-words">{c.description||'—'}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-slate-400 break-words">{c.created||'—'}</td>
                                        <td className="px-3 py-2"><Eye size={14} className="text-slate-300 group-hover:text-amber-500 transition-colors" /></td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={compPage} totalPages={Math.ceil(computers.length/ITEMS_PER_PAGE)} onPageChange={setCompPage} itemsPerPage={ITEMS_PER_PAGE} totalItems={computers.length} />
                </motion.div>
            )}

            {/* ===== GROUPS ===== */}
            {tab === 'groups' && (
                <motion.div key="groups" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 border-b border-slate-100 gap-3">
                        <SearchInput value={groupQuery} onChange={(v) => { setGroupQuery(v); setGroupPage(1); }} placeholder="ค้นหา Group Name..." />
                        <div className="flex items-center gap-2">
                            {groupQuery && <span className="text-xs text-purple-600 font-semibold bg-purple-50 border border-purple-200 rounded-full px-2.5 py-1">"{groupQuery}" — {groups.length} รายการ</span>}
                            <button onClick={() => fetchGroups(groupQuery)} className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 transition-all">
                                <RefreshCw size={16} className={groupLoading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <table className="w-full text-sm table-auto">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <SortableHeader label="#" sortKey={null} currentSort={groupSort} setSort={setGroupSort} />
                                    <SortableHeader label="Group Name" sortKey="name" currentSort={groupSort} setSort={setGroupSort} />
                                    <SortableHeader label="Type" sortKey="type" currentSort={groupSort} setSort={setGroupSort} />
                                    <SortableHeader label="Scope" sortKey="scope" currentSort={groupSort} setSort={setGroupSort} />
                                    <SortableHeader label="Members" sortKey="memberCount" currentSort={groupSort} setSort={setGroupSort} />
                                    <SortableHeader label="Description" sortKey="description" currentSort={groupSort} setSort={setGroupSort} />
                                    <SortableHeader label="Created" sortKey="created" currentSort={groupSort} setSort={setGroupSort} />
                                    <SortableHeader label="" sortKey={null} currentSort={groupSort} setSort={setGroupSort} />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {groupLoading ? <LoadingRows cols={8} /> : groups.length === 0 ? (
                                    <tr><td colSpan={8}><EmptyState icon={Lock} message="ไม่พบข้อมูล Group" /></td></tr>
                                ) : pagedGroups.map((g, i) => (
                                    <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                        onClick={() => setSelectedGroup(g)}
                                        className="hover:bg-purple-50/50 cursor-pointer transition-colors group align-top">
                                        <td className="px-3 py-2 text-slate-400 font-mono text-xs">{(groupPage-1)*ITEMS_PER_PAGE+i+1}</td>
                                        <td className="px-3 py-2 text-slate-800 font-bold break-all text-xs min-w-[120px]">{g.name}</td>
                                        <td className="px-3 py-2"><Badge label={g.type} color={g.type==='Security'?'red':'yellow'} /></td>
                                        <td className="px-3 py-2"><Badge label={g.scope} color="blue" /></td>
                                        <td className="px-3 py-2 font-mono text-xs text-slate-700 font-bold">{g.memberCount}</td>
                                        <td className="px-3 py-2 text-slate-500 text-xs break-words">{g.description||'—'}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-slate-400 break-words">{g.created||'—'}</td>
                                        <td className="px-3 py-2"><Eye size={14} className="text-slate-300 group-hover:text-purple-500 transition-colors" /></td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={groupPage} totalPages={Math.ceil(groups.length/ITEMS_PER_PAGE)} onPageChange={setGroupPage} itemsPerPage={ITEMS_PER_PAGE} totalItems={groups.length} />
                </motion.div>
            )}

            {/* ===== OU STRUCTURE ===== */}
            {tab === 'ou' && (
                <motion.div key="ou" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <FolderTree size={16} className="text-amber-500" /> Organizational Unit Structure
                        </div>
                        <button onClick={fetchOU} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 text-sm font-medium border border-slate-200 transition-all">
                            <RefreshCw size={14} className={ouLoading ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-slate-100">
                        {/* LEFT — OU Tree */}
                        <div className="p-4 max-h-[600px] overflow-y-auto">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 px-2">
                                Directory Tree — คลิกเพื่อดูข้อมูลใน OU
                            </p>
                            {ouLoading ? (
                                <div className="space-y-2">
                                    {[...Array(6)].map((_, i) => (
                                        <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" style={{ width: `${40+i*10}%`, marginLeft: `${i*12}px` }} />
                                    ))}
                                </div>
                            ) : ouData.length === 0 ? (
                                <EmptyState icon={FolderTree} message="ไม่พบข้อมูล OU" />
                            ) : (
                                ouData.map((node, i) => (
                                    <OUNode key={i} node={node} depth={0} onSelect={setSelectedOU} selectedDN={selectedOU?.dn} />
                                ))
                            )}
                        </div>

                        {/* RIGHT — OU Members */}
                        <div className="p-4 max-h-[600px] overflow-y-auto bg-slate-50/50">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                                {selectedOU ? `สมาชิกทั้งหมดในโครงสร้าง: ${selectedOU.name}` : 'เลือก OU เพื่อดูสมาชิก'}
                            </p>
                            <OUMemberTable
                                ouNode={selectedOU}
                                onViewUser={(username) => navigate(`/ad-explorer/user/${username}`)}
                            />
                        </div>
                    </div>
                </motion.div>
            )}

            {/* COMPUTER MODAL */}
            <Modal open={!!selectedComp} onClose={() => setSelectedComp(null)} title={`🖥️ ${selectedComp?.name}`}>
                {selectedComp && (
                    <div className="bg-slate-50 rounded-xl overflow-hidden divide-y divide-slate-100 border border-slate-100">
                        {[
                            { label: 'Name', value: <span className="font-mono text-amber-600 font-bold">{selectedComp.name}</span> },
                            { label: 'Hostname', value: selectedComp.hostname },
                            { label: 'Operating System', value: <Badge label={selectedComp.os||'Unknown'} color="blue" /> },
                            { label: 'OS Version', value: selectedComp.osVersion },
                            { label: 'Description', value: selectedComp.description },
                            { label: 'Created', value: selectedComp.created },
                            { label: 'Distinguished Name', value: selectedComp.dn, mono: true },
                        ].map(({ label, value, mono }) => (
                            <div key={label} className="flex flex-col sm:flex-row sm:items-start p-3 sm:px-4 gap-1 sm:gap-3">
                                <span className="text-xs text-slate-400 font-bold uppercase w-40 shrink-0 pt-0.5">{label}</span>
                                <span className={`text-sm text-slate-800 break-words ${mono ? 'font-mono text-xs text-slate-500' : ''}`}>{value || '—'}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>

            {/* GROUP MODAL */}
            <Modal open={!!selectedGroup} onClose={() => setSelectedGroup(null)} title={`👥 ${selectedGroup?.name}`}>
                {selectedGroup && (
                    <div className="space-y-4">
                        <div className="bg-slate-50 rounded-xl overflow-hidden divide-y divide-slate-100 border border-slate-100">
                            {[
                                { label: 'Group Name', value: selectedGroup.name },
                                { label: 'Type', value: <Badge label={selectedGroup.type} color={selectedGroup.type==='Security'?'red':'yellow'} /> },
                                { label: 'Scope', value: <Badge label={selectedGroup.scope} color="blue" /> },
                                { label: 'Member Count', value: <span className="font-mono font-bold">{selectedGroup.memberCount}</span> },
                                { label: 'Description', value: selectedGroup.description },
                                { label: 'Created', value: selectedGroup.created },
                                { label: 'Distinguished Name', value: selectedGroup.dn, mono: true },
                            ].map(({ label, value, mono }) => (
                                <div key={label} className="flex flex-col sm:flex-row sm:items-start p-3 sm:px-4 gap-1 sm:gap-3">
                                    <span className="text-xs text-slate-400 font-bold uppercase w-40 shrink-0 pt-0.5">{label}</span>
                                    <span className={`text-sm text-slate-800 break-words ${mono ? 'font-mono text-xs text-slate-500' : ''}`}>{value || '—'}</span>
                                </div>
                            ))}
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Members ({selectedGroup.memberCount})</p>
                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                                {selectedGroup.members?.length > 0
                                    ? selectedGroup.members.map((m, i) => <Badge key={i} label={m} color="purple" />)
                                    : <span className="text-xs text-slate-400">No members</span>
                                }
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ADExplorer;