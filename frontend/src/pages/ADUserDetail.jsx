import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { API_BASE } from '../config/api';
import {
    ArrowLeft, User, Mail, Phone, Building2,
    Shield, Network, Calendar, CheckCircle2, XCircle,
    ChevronRight, Copy, Check, RefreshCw,
    Users, Lock, FolderTree, AlertCircle, Layers, Hash
} from 'lucide-react';

// ========== PARSE DN ==========
const parseDN = (dn = '') =>
    dn.split(',').map(part => {
        const [key, val] = part.split('=');
        return { key: key?.trim(), val: val?.trim() };
    });

// ========== DN BREADCRUMB ==========
const DNBreadcrumb = ({ dn }) => {
    const parts = parseDN(dn).reverse();
    return (
        <div className="flex flex-wrap items-center gap-1 text-xs font-mono">
            {parts.map((p, i) => (
                <React.Fragment key={i}>
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                        p.key === 'DC' ? 'bg-indigo-100 text-indigo-700' :
                        p.key === 'OU' ? 'bg-amber-100 text-amber-700' :
                        p.key === 'CN' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-slate-100 text-slate-500'
                    }`}>
                        <span className="opacity-50">{p.key}=</span>{p.val}
                    </span>
                    {i < parts.length - 1 && <ChevronRight size={10} className="text-slate-300 flex-shrink-0" />}
                </React.Fragment>
            ))}
        </div>
    );
};

// ========== COPY BUTTON ==========
const CopyBtn = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handle = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button onClick={handle} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        </button>
    );
};

// ========== SECTION CARD ==========
const SectionCard = ({ icon: Icon, title, iconColor = 'text-indigo-500', children }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <Icon size={15} className={iconColor} />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</span>
        </div>
        <div className="p-5">{children}</div>
    </div>
);

// ========== INFO ROW ==========
const InfoRow = ({ label, value, mono = false, copyable = false }) => (
    <div className="flex flex-col gap-1 py-2.5 border-b border-slate-100 last:border-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <div className="flex items-center gap-2">
            <span className={`text-sm text-slate-700 break-all leading-relaxed ${mono ? 'font-mono text-xs text-slate-500 bg-slate-50 rounded px-1' : ''}`}>
                {value || <span className="text-slate-300 italic">—</span>}
            </span>
            {copyable && value && <CopyBtn text={value} />}
        </div>
    </div>
);

// ========== GROUP DN CARD ==========
const GroupDNCard = ({ dn }) => {
    const [expanded, setExpanded] = useState(false);
    const cn = parseDN(dn).find(p => p.key === 'CN')?.val || dn;
    return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-indigo-50 transition-colors group"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-purple-100 border border-purple-200 flex items-center justify-center flex-shrink-0">
                        <Users size={11} className="text-purple-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700 truncate group-hover:text-indigo-700">{cn}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <CopyBtn text={dn} />
                    <ChevronRight size={14} className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
                </div>
            </button>
            {expanded && (
                <div className="px-4 pb-3 pt-1 border-t border-slate-200 bg-white">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Full DN Path</div>
                    <DNBreadcrumb dn={dn} />
                    <div className="mt-2 font-mono text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 break-all leading-relaxed">
                        {dn}
                    </div>
                </div>
            )}
        </div>
    );
};

// ========== SKELETON ==========
const Skeleton = ({ className }) => <div className={`bg-slate-100 rounded animate-pulse ${className}`} />;
const PageSkeleton = () => (
    <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            <div className="lg:col-span-2 space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        </div>
    </div>
);

// ========== MAIN PAGE ==========
const ADUserDetail = () => {
    const { username } = useParams();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchUser = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/ad/users?q=${encodeURIComponent(username)}`);
            const data = await res.json();
            const found = (data.data || []).find(u => u.username === username);
            if (!found) throw new Error('ไม่พบ User นี้ใน Active Directory');
            setUser(found);
        } catch (err) { setError(err.message); }
        setLoading(false);
    };

    useEffect(() => { fetchUser(); }, [username]);

    const ouPath = user
        ? parseDN(user.dn).filter(p => p.key === 'OU' || p.key === 'DC').reverse()
        : [];

    return (
        <div className="space-y-6">

            {/* TOPBAR */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/ad-explorer')}
                    className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 text-sm font-semibold transition-colors group"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                    กลับ AD Explorer
                </button>
                <button onClick={fetchUser}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </motion.div>

            {/* ERROR */}
            {error && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
                    <AlertCircle size={16} />{error}
                </div>
            )}

            {loading ? <PageSkeleton /> : user && (
                <>
                    {/* HERO CARD */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-5">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                {/* Avatar */}
                                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl font-black text-white shadow-lg flex-shrink-0">
                                    {user.displayName?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <h1 className="text-xl font-black text-white">{user.displayName || user.username}</h1>
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                                            user.enabled ? 'bg-white/20 text-white' : 'bg-red-400/30 text-white'
                                        }`}>
                                            {user.enabled ? <><CheckCircle2 size={11} /> Enabled</> : <><XCircle size={11} /> Disabled</>}
                                        </span>
                                    </div>
                                    <p className="text-indigo-100 text-sm">{[user.title, user.department].filter(Boolean).join(' · ')}</p>
                                    <p className="text-indigo-200 text-xs font-mono mt-0.5">{user.username}</p>
                                </div>
                                <div className="text-center flex-shrink-0 bg-white/10 rounded-xl px-4 py-2">
                                    <div className="text-2xl font-black text-white">{user.groups?.length || 0}</div>
                                    <div className="text-[10px] text-indigo-200 uppercase tracking-wide font-bold">Groups</div>
                                </div>
                            </div>
                        </div>
                        {/* OU Path */}
                        {ouPath.length > 0 && (
                            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
                                <FolderTree size={12} className="text-amber-500 flex-shrink-0" />
                                {ouPath.map((p, i) => (
                                    <React.Fragment key={i}>
                                        <span className={`text-xs font-mono font-semibold ${p.key === 'DC' ? 'text-indigo-600' : 'text-amber-600'}`}>{p.val}</span>
                                        {i < ouPath.length - 1 && <ChevronRight size={10} className="text-slate-300" />}
                                    </React.Fragment>
                                ))}
                            </div>
                        )}
                    </motion.div>

                    {/* CONTENT GRID */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* LEFT */}
                        <div className="lg:col-span-1 space-y-6">
                            <SectionCard icon={User} title="Account Info">
                                <InfoRow label="Username (sAMAccount)" value={user.username} mono copyable />
                                <InfoRow label="Account Status" value={
                                    <span className={`font-bold ${user.enabled ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {user.enabled ? '✓ Enabled' : '✗ Disabled'}
                                    </span>
                                } />
                                <InfoRow label="Created" value={user.created} mono />
                            </SectionCard>

                            <SectionCard icon={Building2} title="Contact & Organization" iconColor="text-amber-500">
                                <InfoRow label="Email"       value={user.email}      copyable />
                                <InfoRow label="Phone"       value={user.phone} />
                                <InfoRow label="Department"  value={user.department} />
                                <InfoRow label="Title"       value={user.title} />
                                <InfoRow label="Description" value={user.description} />
                            </SectionCard>

                            <SectionCard icon={Network} title="Directory Path" iconColor="text-slate-400">
                                <div className="space-y-3">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Distinguished Name</div>
                                        <DNBreadcrumb dn={user.dn} />
                                    </div>
                                    <div className="font-mono text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 break-all leading-relaxed flex items-start gap-2">
                                        <span className="flex-1">{user.dn}</span>
                                        <CopyBtn text={user.dn} />
                                    </div>
                                </div>
                            </SectionCard>
                        </div>

                        {/* RIGHT */}
                        <div className="lg:col-span-2 space-y-6">
                            <SectionCard icon={Shield} title={`Group Memberships (${user.groups?.length || 0})`} iconColor="text-purple-500">
                                {!user.groups?.length ? (
                                    <div className="flex flex-col items-center py-10 text-slate-400">
                                        <Users size={32} strokeWidth={1} className="mb-2 text-slate-300" />
                                        <p className="text-sm">ไม่อยู่ใน Group ใดๆ</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {/* Summary chips */}
                                        <div className="flex flex-wrap gap-1.5 pb-4 border-b border-slate-100">
                                            {user.groups.map((dn, i) => {
                                                const cn = parseDN(dn).find(p => p.key === 'CN')?.val || dn;
                                                return (
                                                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
                                                        <Lock size={9} /> {cn}
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {/* Full DN expandable list */}
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                            <Layers size={10} /> Full DN — คลิกเพื่อดูรายละเอียด
                                        </div>
                                        <div className="space-y-2">
                                            {user.groups.map((dn, i) => <GroupDNCard key={i} dn={dn} />)}
                                        </div>
                                    </div>
                                )}
                            </SectionCard>

                            {/* memberOf Raw */}
                            <SectionCard icon={Hash} title="memberOf Attribute (Raw)" iconColor="text-slate-400">
                                <div className="space-y-1.5">
                                    {!user.groups?.length ? (
                                        <p className="text-xs text-slate-400 italic">— (empty)</p>
                                    ) : user.groups.map((dn, i) => (
                                        <div key={i} className="flex items-center justify-between gap-2 font-mono text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 hover:bg-indigo-50 hover:border-indigo-100 transition-colors group">
                                            <span className="break-all leading-relaxed flex-1">{dn}</span>
                                            <CopyBtn text={dn} />
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ADUserDetail;