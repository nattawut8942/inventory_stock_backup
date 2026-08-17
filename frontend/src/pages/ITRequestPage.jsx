// pages/ITRequestPage.jsx
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CheckCircle, Clock, Loader, LayoutDashboard } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { API_BASE } from '../config/api';
import Portal from '../components/Portal';

const EMP_PIC = (empCode) => `http://dcidmc.dci.daikin.co.jp/PICTURE/${empCode}.jpg`;

const formatDatetime = (val) => {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d)) return null;
    return d.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatDate = (val) => {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (val) => {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d)) return '—';
    return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STATUS_STYLE = {
    'Approved':   'bg-yellow-100  text-yellow-800  ring-yellow-300',
    'Inprogress': 'bg-sky-100     text-sky-800     ring-sky-300',
    'Completed':  'bg-green-100   text-green-800   ring-green-300',
    'Cancel':     'bg-slate-100   text-slate-500   ring-slate-200',
    'Rejected':   'bg-red-100     text-red-700     ring-red-200',
};
const STATUS_STYLE_TV = {
    'Approved':   'bg-yellow-200  text-yellow-800  border-yellow-400',
    'Inprogress': 'bg-sky-200     text-sky-800     border-sky-400',
    'Completed':  'bg-green-200   text-green-800   border-green-400',
    'Cancel':     'bg-slate-200   text-slate-600   border-slate-300',
    'Rejected':   'bg-red-200     text-red-700     border-red-300',
};
const statusStyle    = (s) => STATUS_STYLE[s]    || 'bg-slate-50 text-slate-600 ring-slate-200';
const statusStyleTV  = (s) => STATUS_STYLE_TV[s] || 'bg-slate-700 text-slate-300 border-slate-600';

// ── ACM checkbox groups ────────────────────────────────────────────────────
const ACM_GROUPS = [
    {
        label: 'Network / Communication Equipment Request For',
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        subgroups: [
            {
                label: 'Action',
                fields: [
                    { key: 'NET_SETTING',  label: 'Setting'  },
                    { key: 'NET_CHANGE',   label: 'Change'   },
                    { key: 'NET_TRANSFER', label: 'Transfer' },
                    { key: 'NET_CANCEL',   label: 'Cancel'   },
                ],
            },
            {
                label: 'Type',
                fields: [
                    { key: 'IP',        label: 'IP Address'     },
                    { key: 'SWITCH',    label: 'Network Switch' },
                    { key: 'HUB',       label: 'Network Hub'    },
                    { key: 'VPN',       label: 'VPN Account'    },
                    { key: 'NET_OTHER', label: 'Other'          },
                ],
            },
        ],
    },
    {
        label: 'Software Request For',
        color: 'text-purple-700',
        bg: 'bg-purple-50',
        subgroups: [
            {
                label: 'Action',
                fields: [
                    { key: 'SOFT_INSTALL',  label: 'Install'  },
                    { key: 'SOFT_CHANGE',   label: 'Change'   },
                    { key: 'SOFT_TRANSFER', label: 'Transfer' },
                    { key: 'SOFT_CANCEL',   label: 'Cancel'   },
                ],
            },
            {
                label: 'Type',
                fields: [
                    { key: 'ACM_QAD',     label: 'ALPHA (SAP/WMS)' },
                    { key: 'ACM_WINDOWS', label: 'MS Windows'       },
                    { key: 'PATCH',       label: 'Software Patch'   },
                    { key: 'OFFICE',      label: 'MS Office'        },
                    { key: 'SOFT_OTHER',  label: 'Other'            },
                ],
            },
        ],
    },
    {
        label: 'Computer / Notebook Request For',
        color: 'text-orange-700',
        bg: 'bg-orange-50',
        subgroups: [
            {
                label: 'Action',
                fields: [
                    { key: 'COM_INSTALL',  label: 'Setting'  },
                    { key: 'COM_CHANGE',   label: 'Change'   },
                    { key: 'COM_TRANSFER', label: 'Transfer' },
                    { key: 'COM_CANCEL',   label: 'Cancel'   },
                ],
            },
            {
                label: 'Type',
                fields: [
                    { key: 'DESKTOP',   label: 'PC Desktop' },
                    { key: 'NOTEBOOK',  label: 'Notebook'   },
                    { key: 'RAM',       label: 'RAM'        },
                    { key: 'HARDDISK',  label: 'Hard Disk'  },
                    { key: 'MONITOR',   label: 'Monitor'    },
                    { key: 'COM_OTHER', label: 'Other'      },
                ],
            },
        ],
    },
];

// UCM checkbox groups
const UCM_GROUPS = [
    {
        label: 'Change For',
        color: 'text-indigo-700',
        bg: 'bg-indigo-50',
        subgroups: [
            {
                label: 'System',
                fields: [
                    { key: 'UCM_QAD',       label: 'ALPHA (SAP/WMS)' },
                    { key: 'UCM_WINDOWS',   label: 'Windows'         },
                    { key: 'UCM_EMAIL_SYS', label: 'Email Address'   },
                ],
            },
        ],
    },
    {
        label: 'Employee Type',
        color: 'text-pink-700',
        bg: 'bg-pink-50',
        subgroups: [
            {
                label: 'Type',
                fields: [
                    { key: 'NEWEMP',  label: 'New Emp.'      },
                    { key: 'TRANFER', label: 'Transfer Emp.' },
                    { key: 'RESIGN',  label: 'Resign Emp.'   },
                ],
            },
        ],
    },
    {
        label: 'Type of Change',
        color: 'text-teal-700',
        bg: 'bg-teal-50',
        subgroups: [
            {
                label: 'Action',
                fields: [
                    { key: 'ADDNEW',     label: 'Add/New'       },
                    { key: 'UCM_CHANGE', label: 'Change/Modify' },
                    { key: 'REMOVE',     label: 'Remove/Delete' },
                ],
            },
            {
                label: 'Permission',
                fields: [
                    { key: 'USERNAME', label: 'Username'   },
                    { key: 'GROUPS',   label: 'Groups'     },
                    { key: 'PERMISSION', label: 'Permission' },
                    { key: 'PASSWORD', label: 'Password'   },
                ],
            },
        ],
    },
];

// ── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ empCode, name, size = 36 }) {
    const [err, setErr] = useState(false);
    const initials = (name || empCode || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    if (!empCode || err) {
        return (
            <div style={{ width: size, height: size }}
                className="rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {initials}
            </div>
        );
    }
    return (
        <img src={EMP_PIC(empCode)} alt={name} style={{ width: size, height: size }}
            className="rounded-full object-cover flex-shrink-0 border border-slate-200"
            onError={() => setErr(true)} />
    );
}

// ── isTicked helper ───────────────────────────────────────────────────────
const isTicked = (data, key) => {
    const v = data[key];
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'y';
};

// ── CheckboxItem — แสดงทั้ง checked และ unchecked ─────────────────────────
function CheckboxItem({ label, checked, otherText }) {
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border ${
            checked
                ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                : 'bg-white text-slate-400 border-slate-200 font-normal'
        }`}>
            <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${
                checked ? 'bg-white border-white' : 'border-slate-300'
            }`}>
                {checked && <span className="text-indigo-600 text-[10px] font-black leading-none">✓</span>}
            </span>
            {label}
            {checked && otherText && (
                <span className="text-indigo-100 font-normal">: {otherText}</span>
            )}
        </span>
    );
}

// ── CheckboxGroup — แสดงแบบ form จริง มี subgroups ───────────────────────
function CheckboxGroup({ group, data }) {
    // เช็คว่ามีอะไรติ๊กอยู่ไหม
    const allFields = group.subgroups.flatMap((sg) => sg.fields);
    const hasAnyTicked = allFields.some((f) => isTicked(data, f.key));
    if (!hasAnyTicked) return null;

    return (
        <div className={`rounded-xl border border-slate-200 overflow-hidden`}>
            {/* Group header */}
            <div className={`px-3 py-2 ${group.bg}`}>
                <p className={`text-xs font-bold ${group.color}`}>{group.label}</p>
            </div>
            {/* Subgroups */}
            <div className="px-3 py-2 space-y-2 bg-white">
                {group.subgroups.map((sg) => (
                    <div key={sg.label}>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">{sg.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {sg.fields.map((f) => (
                                <CheckboxItem
                                    key={f.key}
                                    label={f.label}
                                    checked={isTicked(data, f.key)}
                                    otherText={f.key.endsWith('_OTHER') ? data[`${f.key}_TEXT`] : undefined}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── FlowStep ───────────────────────────────────────────────────────────────
function FlowStep({ label, by, date }) {
    const done = !!by;
    return (
        <div className="flex flex-col items-center gap-1 min-w-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${done ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-slate-300 text-slate-300'}`}>
                {done ? '✓' : '·'}
            </div>
            <span className="text-[10px] text-slate-400 font-medium">{label}</span>
            {done && <span className="text-[11px] text-slate-600 font-medium truncate max-w-[90px]">{by}</span>}
            {done && <span className="text-[10px] text-slate-400">{formatDate(date)}</span>}
        </div>
    );
}
function FlowTrack({ row }) {
    return (
        <div className="flex items-start gap-2">
            <FlowStep label="Checked"  by={row.Checked}  date={row.Date_Checked} />
            <div className={`flex-1 h-px mt-3.5 ${row.Checked  ? 'bg-teal-400' : 'bg-slate-200'}`} />
            <FlowStep label="Approved" by={row.Approved} date={row.Date_Approved} />
            <div className={`flex-1 h-px mt-3.5 ${row.Approved ? 'bg-teal-400' : 'bg-slate-200'}`} />
            <FlowStep label="InCharge" by={row.InCharge} date={row.Date_InCharge} />
        </div>
    );
}

// ── FlowBox — กล่องแสดงแต่ละ step ─────────────────────────────────────────
function FlowBox({ label, by, status, date }) {
    const done = !!by;
    const statusColor = !done ? 'bg-slate-50 border-slate-200 text-slate-400'
        : status === 'Approved' || status === 'Completed' || status === 'Created'
            ? 'bg-green-50 border-green-300 text-green-800'
            : status === 'Rejected' || status === 'Cancel'
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'bg-yellow-50 border-yellow-300 text-yellow-800';

    return (
        <div className={`rounded-lg border p-2.5 flex flex-col gap-1 min-h-[70px] ${statusColor}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider border-b border-current/20 pb-1 opacity-70">{label}</p>
            {done ? (
                <>
                    <p className="text-xs font-semibold leading-snug">{by}</p>
                    <div className="flex items-center justify-between mt-auto">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/50">{status}</span>
                        {date && <span className="text-[10px] opacity-70">{formatDatetime(date)}</span>}
                    </div>
                </>
            ) : (
                <p className="text-xs opacity-40 mt-auto">รอดำเนินการ</p>
            )}
        </div>
    );
}

// ── MiniFlowStepper — แถบ stepper เล็กบอกขั้นปัจจุบัน (ใช้ทั้ง TVCard และ Modal) ──
// FM-IT-002 (ACM) และ FM-IT-004 (UCM) มี Flow_order ไม่เหมือนกัน ต้องแยก mapping:
//   FM-IT-002: 0,2,3(GM Approve — เสริม ไม่บังคับมีทุกเคส),4,5,6,7,9(IT ปิดงาน),10(Sup ปิดงาน),11(Mgr ปิดงาน),12(User ปิดงาน)
//   FM-IT-004: 0,2,4,5,6,7,8(IT ปิดงาน),9(Sup ปิดงาน),10(Mgr ปิดงาน),11(User ปิดงาน)
function getFlowSteps(row) {
    const isACM = row.Form_id === 'FM-IT-002'; // อาจมี step 3 (GM Approve), เลขปิดงานเลื่อนไป 1 (9-12)
    const isUCM = row.Form_id === 'FM-IT-004'; // ไม่มี step 3, เลขปิดงานเริ่มที่ 8-11

    const steps = [
        { key: 'Flow0_Requestor', label: 'Requestor',         by: row.Flow0_Requestor, status: 'Completed', side: 'user'      },
        { key: 'Flow2_Manager',   label: 'Manager Requester Approve', by: row.Flow2_Manager,   status: row.Flow2_Status , side: 'user'},
    ];

    // FM-IT-002: GM Requester Approve (Flow_order 3) — เป็น step เสริม ไม่ใช่ทุก request จะมี
    // (เคสอนุมัติเร่งด่วนข้ามขั้นนี้ได้) เช็คว่ามีข้อมูลจริงใน DB ไหม ถ้าไม่มีทั้งคนทำและสถานะ ให้ข้ามไปเลย ไม่นับเป็น step ที่ต้องรอ
    if (isACM && (row.Flow3_GMApprove || row.Flow3_Status)) {
        steps.push({ key: 'Flow3_GMApprove', label: 'GM Requester Approve', by: row.Flow3_GMApprove, status: row.Flow3_Status, side: 'user' });
    }

    steps.push(
        { key: 'Flow4_ITAssign',     label: 'IT Manager assign', by: row.Flow4_ITAssign,     status: row.Flow4_Status, side: 'it' },
        { key: 'Flow5_ITIncharge',   label: 'IT in-charge รับ',  by: row.Flow5_ITIncharge,   status: row.Flow5_Status, side: 'it' },
        { key: 'Flow6_ITSupervisor', label: 'IT supervisor Approve',     by: row.Flow6_ITSupervisor, status: row.Flow6_Status, side: 'it' },
        { key: 'Flow7_ITManager',    label: 'IT Manager Approve',  by: row.Flow7_ITManager,    status: row.Flow7_Status, side: 'it' },
    );

    // ขั้นปิดงาน — เลข Flow_order เลื่อนกันคนละ 1 ระหว่าง ACM กับ UCM
    if (isUCM) {
        // UCM: 8=IT ปิดงาน, 9=Supervisor ปิดงาน, 10=Manager ปิดงาน, 11=User ปิดงาน (สุดท้าย)
        steps.push(
            { key: 'Flow8_ITClose',       label: 'IT closed',        by: row.Flow8_ITClose,       status: row.Flow8_Status, side: 'it' },
            { key: 'Flow9_ITClose',       label: 'IT Supervisor Close', by: row.Flow9_ITClose,       status: row.Flow9_Status, side: 'it' },
            { key: 'Flow10_ITSupApprove', label: 'IT Manager Close',    by: row.Flow10_ITSupApprove, status: row.Flow10_Status, side: 'it' },
            { key: 'Flow11_ITMgrApprove', label: 'User Close',       by: row.Flow11_ITMgrApprove, status: row.Flow11_Status, side: 'user' },
        );
    } else {
        // ACM: 9=IT ปิดงาน, 10=Supervisor ปิดงาน, 11=Manager ปิดงาน, 12=User ปิดงาน (สุดท้าย)
        steps.push(
            { key: 'Flow9_ITClose',       label: 'IT closed',        by: row.Flow9_ITClose,       status: row.Flow9_Status, side: 'it' },
            { key: 'Flow10_ITSupApprove', label: 'IT Supervisor Close', by: row.Flow10_ITSupApprove, status: row.Flow10_Status, side: 'it' },
            { key: 'Flow11_ITMgrApprove', label: 'IT Manager Close',    by: row.Flow11_ITMgrApprove, status: row.Flow11_Status, side: 'it' },
            { key: 'Flow12_UserClose',    label: 'User Close',       by: row.Flow12_UserClose,    status: row.Flow12_Status, side: 'user' },
        );
    }

    return steps;
}
const isFlowDone = (s) => s === 'Completed' || s === 'Approved';

// ── getDisplayStatus — override สถานะที่แสดงผล (ไม่แก้ backend/DB) ────────
// ถ้า step สุดท้ายของ flow (User ปิดงาน) เสร็จแล้ว ให้แสดงเป็น "Completed" เสมอ
// แม้ Current_Status จาก backend จะยังเป็นค่าอื่น (เช่น Approved ค้างจากขั้นก่อนหน้า)
function getDisplayStatus(row) {
    const flowSteps = getFlowSteps(row);
    const lastStep = flowSteps[flowSteps.length - 1];
    if (lastStep && isFlowDone(lastStep.status)) return 'Completed';
    return row.Current_Status;
}

// ── getWaitingSide — บอกว่า step ปัจจุบันที่รออยู่เป็นฝั่ง User หรือ IT ──────
// คืนค่า 'user' | 'it' | null (null = ทุก step เสร็จแล้ว ไม่มีอะไรต้องรอ)
function getWaitingSide(row) {
    const flowSteps = getFlowSteps(row);
    let idx = flowSteps.findIndex((s) => s.status === 'Inprogress');
    if (idx === -1) idx = flowSteps.findIndex((s) => !isFlowDone(s.status));
    if (idx === -1) return null;
    return flowSteps[idx].side || null;
}

// ── WaitingSideBadge — badge เล็กบอกว่ารอฝั่ง User หรือ IT (ไม่แสดงถ้าเสร็จแล้ว) ──
function WaitingSideBadge({ row, className = '' }) {
    const side = getWaitingSide(row);
    if (!side) return null;
    return (
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
            side === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
        } ${className}`}>
            รอ: {side === 'user' ? 'User' : 'IT'}
        </span>
    );
}

function MiniFlowStepper({ row, dotSize = 18 }) {
    const flowSteps = getFlowSteps(row);
    const allDone = flowSteps.every((s) => isFlowDone(s.status));
    let currentIdx = flowSteps.findIndex((s) => s.status === 'Inprogress');
    if (currentIdx === -1) currentIdx = flowSteps.findIndex((s) => !isFlowDone(s.status));
    if (currentIdx === -1) currentIdx = flowSteps.length - 1;
    const currentStep = flowSteps[currentIdx];

    return (
        <div>
            <div className="flex items-center">
                {flowSteps.map((step, i) => {
                    const done = isFlowDone(step.status);
                    const isCurrent = i === currentIdx && !done;
                    return (
                        <div key={step.key} className="flex items-center flex-1 last:flex-none">
                            <div
                                title={`${step.label}: ${step.status || 'Pending'}`}
                                style={{ width: dotSize, height: dotSize }}
                                className={`rounded-full flex items-center justify-center flex-shrink-0 ${
                                    done ? 'bg-emerald-200' : isCurrent ? 'bg-sky-100' : 'bg-slate-100 border border-dashed border-slate-300'
                                }`}
                            >
                                {done && <span className="text-emerald-600 text-[18px] font-black">✓</span>}
                                {isCurrent && <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />}
                            </div>
                            {i < flowSteps.length - 1 && (
                                <div className={`flex-1 h-[2px] ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                            )}
                        </div>
                    );
                })}
            </div>
         {allDone ? (
    <p className="text-[10px] text-emerald-600 font-semibold mt-1">เสร็จสิ้น</p>
) : (
    <>
        <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                currentStep.side === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
            }`}>
                {currentStep.side === 'user' ? 'USER' : 'IT'}
            </span>
            <p className="text-[15px] text-slate-600 font-medium truncate">
                Waiting for : <span className="text-slate-800">{currentStep.label}</span>
            </p>
        </div>
        {currentStep.by && (
            <p className="text-[15px] text-slate-500 truncate">{currentStep.by}</p>
        )}
    </>
)}
        </div>
    );
}

// ── WorkflowBlocks — IT Side เท่านั้น ─────────────────────────────────────
function WorkflowBlocks({ row }) {
    const isUCM = row.Form_id === 'FM-IT-004';
    return (
        <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                <MiniFlowStepper row={row} dotSize={22} />
            </div>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">🔧 IT Department</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <FlowBox label="4 · IT Assignment"    by={row.Flow4_ITAssign}      status={row.Flow4_Status}  date={row.Flow4_Date} />
                <FlowBox label="5 · IT Incharge รับ"  by={row.Flow5_ITIncharge}    status={row.Flow5_Status}  date={row.Flow5_Date} />
                <FlowBox label="6 · IT Supervisor"    by={row.Flow6_ITSupervisor}  status={row.Flow6_Status}  date={row.Flow6_Date} />
                <FlowBox label="7 · IT Manager Check" by={row.Flow7_ITManager}     status={row.Flow7_Status}  date={row.Flow7_Date} />
                {isUCM ? (
                    <>
                        <FlowBox label="8 · IT ปิดงาน"         by={row.Flow8_ITClose}       status={row.Flow8_Status}  date={row.Flow8_Date} />
                        <FlowBox label="9 · Supervisor ปิดงาน" by={row.Flow9_ITClose}       status={row.Flow9_Status}  date={row.Flow9_Date} />
                        <FlowBox label="10 · Manager ปิดงาน"   by={row.Flow10_ITSupApprove} status={row.Flow10_Status} date={row.Flow10_Date} />
                    </>
                ) : (
                    <>
                        <FlowBox label="9 · IT ปิดงาน"         by={row.Flow9_ITClose}       status={row.Flow9_Status}  date={row.Flow9_Date} />
                        <FlowBox label="10 · Supervisor ปิดงาน" by={row.Flow10_ITSupApprove} status={row.Flow10_Status} date={row.Flow10_Date} />
                        <FlowBox label="11 · Manager ปิดงาน"   by={row.Flow11_ITMgrApprove} status={row.Flow11_Status} date={row.Flow11_Date} />
                    </>
                )}
            </div>
        </div>
    );
}

// ── Detail Modal ───────────────────────────────────────────────────────────
function DetailModal({ row, onClose }) {
    if (!row) return null;
    const isACM = row.Form_id === 'FM-IT-002';
    const isUCM = row.Form_id === 'FM-IT-004';
    // GM Approve เป็น step เสริม — มีแค่บางเคสของ ACM (ข้ามได้ถ้าเป็นเรื่องเร่งด่วน) เช็คจากข้อมูลจริง ไม่ใช้แค่ Form_id
    const hasGMApprove = isACM && !!(row.Flow3_GMApprove || row.Flow3_Status);
    const groups = isACM ? ACM_GROUPS : isUCM ? UCM_GROUPS : [];
    const hasChecked = groups.some((g) =>
        (g.subgroups || []).flatMap((sg) => sg.fields).some((f) => isTicked(row, f.key))
    );

    return (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">

                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-3 z-10">
                    <div>
                        <p className="text-lg text-slate-400 font-medium mb-1">
                            {row.Request_id} · {row.Form_id}
                            {row.STEP && <span className="ml-2 bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[11px]">Step {row.STEP}</span>}
                        </p>
                        <p className="text-base font-semibold text-slate-800 leading-snug">{row.Detail_Info || '(ไม่มีรายละเอียด)'}</p>
                        <div className="flex gap-2 mt-2 flex-wrap items-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${statusStyle(getDisplayStatus(row))}`}>
                                {getDisplayStatus(row)}
                            </span>
                            <WaitingSideBadge row={row} />
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0" aria-label="ปิด">✕</button>
                </div>

                <div className="px-6 py-5 space-y-5">

                    {/* ผู้ยื่นคำร้อง */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ผู้ยื่นคำร้อง</h3>
                        <div className="flex items-center gap-3">
                            <Avatar empCode={row.Info_Req_By} name={row.Request_by} size={64} />
                            <div>
                                <p className="text-sm font-semibold text-slate-800">{row.Request_by}</p>
                                <p className="text-xs text-slate-500">{row.Email}</p>
                                <div className="flex gap-3 mt-1 text-xs text-slate-400">
                                    <span>แผนก: <span className="text-slate-600">{row.Section_code || '—'}</span></span>
                                    <span>ต่อ: <span className="text-slate-600">{row.Extension_No || '—'}</span></span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* User Request Details — ข้อมูลพนักงานจากฟอร์ม */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">User Request Details</h3>
                        <div className="rounded-xl border border-slate-300 overflow-hidden">
                            {/* Header */}
                            <div className="bg-slate-700 px-4 py-2">
                                <p className="text-xs font-bold text-white uppercase tracking-wider">User Request Details</p>
                            </div>
                            {/* Row 1: Emp ID + Name */}
                            <div className="grid grid-cols-2 border-b border-slate-200">
                                <div className="px-4 py-3 border-r border-slate-200">
                                    <p className="text-[11px] text-red-500 font-semibold mb-1">Employee ID / รหัสพนักงาน:</p>
                                    <input readOnly value={row.Info_Req_By || ''} className="w-full border border-slate-300 rounded px-2 py-1 text-sm text-slate-700 bg-white" />
                                </div>
                                <div className="px-4 py-3">
                                    <p className="text-[11px] text-red-500 font-semibold mb-1">Name-Surname / ชื่อ-สกุล:</p>
                                    <input readOnly value={row.Emp_Name || '—'} className="w-full border border-slate-300 rounded px-2 py-1 text-sm text-slate-700 bg-white" />
                                </div>
                            </div>
                            {/* Row 2: Extension + Email */}
                            <div className="grid grid-cols-2 bg-white">
                                <div className="px-4 py-3 border-r border-slate-200">
                                    <p className="text-[11px] text-red-500 font-semibold mb-1">Extension No:</p>
                                    <input readOnly value={row.Extension_No || '—'} className="w-full border border-slate-300 rounded px-2 py-1 text-sm text-slate-700 bg-white" />
                                </div>
                                <div className="px-4 py-3">
                                    <p className="text-[11px] text-red-500 font-semibold mb-1">Email Address / อีเมล์:</p>
                                    <input readOnly value={row.Emp_Email || row.Email || '—'} className="w-full border border-slate-300 rounded px-2 py-1 text-sm text-slate-700 bg-white" />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* User / ต้นสังกัด Workflow */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Requestor Section</h3>
                        <div className={`grid gap-2 ${hasGMApprove ? 'grid-cols-4' : 'grid-cols-3'}`}>
                            <FlowBox label="0 · Requestor"       by={row.Flow0_Requestor}  status="Created"          date={row.Flow0_Date} />
                            <FlowBox label="2 · Manager Approve" by={row.Flow2_Manager}    status={row.Flow2_Status}  date={row.Flow2_Date} />
                            {hasGMApprove && (
                                <FlowBox label="3 · GM Approve"  by={row.Flow3_GMApprove}  status={row.Flow3_Status}  date={row.Flow3_Date} />
                            )}
                            {isUCM ? (
                                <FlowBox label="11 · Close Approve" by={row.Flow11_ITMgrApprove} status={row.Flow11_Status} date={row.Flow11_Date} />
                            ) : (
                                <FlowBox label="12 · Close Approve" by={row.Flow12_UserClose}    status={row.Flow12_Status} date={row.Flow12_Date} />
                            )}
                        </div>
                    </section>

                    {/* ประเภทงานที่ขอ (checkbox) */}
                    {hasChecked && (
                        <section>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ประเภทงานที่ขอ</h3>
                            <div className="space-y-2">
                                {groups.map((g) => <CheckboxGroup key={g.label} group={g} data={row} />)}
                            </div>
                            {/* UCM extra fields */}
                            {isUCM && (row.USERNAME || row.GROUPS || row.PERMISSION) && (
                                <div className="mt-2 bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs space-y-1">
                                    {row.USERNAME   && <p><span className="text-slate-400">Username:</span> <span className="font-medium text-slate-700">{row.USERNAME}</span></p>}
                                    {row.GROUPS     && <p><span className="text-slate-400">Groups:</span>   <span className="font-medium text-slate-700">{row.GROUPS}</span></p>}
                                    {row.PERMISSION && <p><span className="text-slate-400">Permission:</span><span className="font-medium text-slate-700">{row.PERMISSION}</span></p>}
                                </div>
                            )}
                        </section>
                    )}

                    {/* รายละเอียด / REASON */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">รายละเอียดคำร้อง</h3>
                        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap border border-slate-100">
                            {row.Detail_Info || '—'}
                        </div>
                    </section>

                    {/* Risk Assessment */}
                    {(row.RISK_ASSM || row.EFFECT || row.NOT_EFFECT || row.CORRECTIVE) && (
                        <section>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Risk Assessment</h3>
                            <div className="grid grid-cols-1 gap-2 text-sm">
                                {[
                                    ['ความเสี่ยง',      row.RISK_ASSM  ],
                                    ['ผลกระทบ',         row.EFFECT     ],
                                    ['ไม่กระทบ',        row.NOT_EFFECT ],
                                    ['แนวทางแก้ไข',     row.CORRECTIVE ],
                                ].filter(([, v]) => v).map(([label, val]) => (
                                    <div key={label} className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                                        <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">{label}</p>
                                        <p className="text-slate-700 text-xs leading-relaxed">{val}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Metadata */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ข้อมูลทั่วไป</h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            {[
                                ['Request ID', row.Request_id],
                                ['Form',       row.Form_id],
                                ['Step',       row.STEP || '—'],
                                ['Emp Code',   row.Info_Req_By || '—'],
                                ['วันที่ยื่น', formatDate(row.Request_date)],
                                ['Receive Date', formatDate(row.RECEIVE_DATE)],
                            ].map(([label, val]) => (
                                <div key={label}>
                                    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                                    <p className="font-medium text-slate-700">{val}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Workflow */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Workflow</h3>
                        <WorkflowBlocks row={row} />
                    </section>

                    {/* InCharge */}
                    {row.InCharge && (
                        <section>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ผู้รับผิดชอบ (InCharge)</h3>
                            <div className="flex items-center gap-3">
                                <Avatar empCode={row.CodeInCharge} name={row.InCharge} size={64} />
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">{row.InCharge}</p>
                                    <p className="text-xs text-slate-500">รหัสพนักงาน: {row.CodeInCharge || '—'}</p>
                                    {isFlowDone(row.Flow5_Status) ? (
    <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ รับเคสแล้วเมื่อ {formatDateTime(row.Flow5_Date)}</p>
) : (
    <p className="text-xs text-amber-600 font-medium mt-0.5">⏳ ยังไม่กดรับเคส</p>
)}
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-3 flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">ปิด</button>
                </div>
            </div>
        </div>
        </Portal>
    );
}

// ── RequestRow (List mode) ─────────────────────────────────────────────────
function RequestRow({ row, onClick }) {
    return (
        <div onClick={onClick} className="flex flex-col sm:grid sm:grid-cols-[1fr_8rem_2fr_7rem_9rem_2rem] sm:items-center gap-3 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors group last:border-b-0">
            <div className="flex items-center gap-3 min-w-0">
                <Avatar empCode={row.Info_Req_By} name={row.Request_by} size={64} />
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{row.Request_by}</p>
                    <p className="text-xs text-slate-400 truncate">{row.Email}</p>
                </div>
            </div>
            <div className="min-w-0">
                <p className="text-xs font-mono text-slate-600 truncate">{row.Request_id}</p>
            </div>
            <div className="min-w-0">
                <p className="text-sm text-slate-700 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">{row.Detail_Info || '(ไม่มีรายละเอียด)'}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-slate-400">{formatDate(row.Request_date)} · {row.Section_code}</p>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{row.Form_id}</span>
                    {row.STEP && <span className="text-[10px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded">Step {row.STEP}</span>}
                </div>
            </div>
            <div className="min-w-0 flex flex-col gap-1 items-start">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${statusStyle(getDisplayStatus(row))}`}>
                    {getDisplayStatus(row)}
                </span>
                <WaitingSideBadge row={row} />
            </div>
            <div className="min-w-0 flex items-center gap-2">
      {row.InCharge ? (
    <div className="flex items-center gap-2">
        <Avatar empCode={row.CodeInCharge} name={row.InCharge} size={40} />
        <div className="flex flex-col leading-tight">
            <p className="text-slate-700 text-xs font-medium">{row.InCharge}</p>
            {isFlowDone(row.Flow5_Status) ? (
                <p className="text-[11px] text-emerald-600 font-semibold">✓ รับเคสแล้ว {formatDateTime(row.Flow5_Date)}</p>
            ) : (
                <p className="text-[11px] text-amber-600 font-semibold">⏳ ยังไม่กดรับเคส</p>
            )}
        </div>
    </div>
) : (
    <span className="text-lg text-slate-400 border border-dashed border-slate-300 px-2 py-0.5 rounded-full">ยังไม่มี InCharge</span>
)}
            </div>
            <div className="hidden sm:block text-slate-300 group-hover:text-indigo-400 transition-colors text-lg">›</div>
        </div>
    );
}

// ── calcDuration: Request_date → Date_InCharge ────────────────────────────
function calcDuration(start, end) {
    if (!start || !end) return null;
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s) || isNaN(e) || e <= s) return null;
    const totalMin = Math.floor((e - s) / 60000);
    if (totalMin < 60)  return `${totalMin} นาที`;
    const hours = Math.floor(totalMin / 60);
    const mins  = totalMin % 60;
    if (hours < 24) return mins > 0 ? `${hours} ชม. ${mins} นาที` : `${hours} ชม.`;
    const days  = Math.floor(hours / 24);
    const remH  = hours % 24;
    return remH > 0 ? `${days} วัน ${remH} ชม.` : `${days} วัน`;
}
function durationColor(start, end) {
    if (!start || !end) return 'text-slate-500';
    const days = (new Date(end) - new Date(start)) / 86400000;
    if (days <= 1) return 'text-emerald-400';
    if (days <= 3) return 'text-yellow-400';
    return 'text-red-400';
}

// ── TV Card ────────────────────────────────────────────────────────────────
function TVCard({ row }) {
    const isACM = row.Form_id === 'FM-IT-002';
    const isUCM = row.Form_id === 'FM-IT-004';
    const groups = isACM ? ACM_GROUPS : isUCM ? UCM_GROUPS : [];

    const tickedAll = groups.flatMap((g) =>
        g.subgroups.flatMap((sg) =>
            sg.fields
                .filter((f) => isTicked(row, f.key))
                .map((f) => ({
                    label: f.label,
                    otherText: f.key.endsWith('_OTHER') ? row[`${f.key}_TEXT`] : undefined,
                }))
        )
    );

    const duration = calcDuration(row.Request_date, row.Date_InCharge);
    const durColor = durationColor(row.Request_date, row.Date_InCharge);
    const displayStatus = getDisplayStatus(row);

    const cardStyle = {
        'Completed':  'bg-green-100   border-green-400',
        'Approved':   'bg-amber-100/70  border-amber-400',
        'Inprogress': 'bg-sky-100     border-sky-400',
        'Cancel':     'bg-slate-100   border-slate-400 opacity-75',
        'Rejected':   'bg-red-100     border-red-400',
    }[displayStatus] || 'bg-white border-slate-200';

    return (
        <div className={`border rounded-2xl p-5 flex flex-col gap-3 min-h-[220px] ${cardStyle}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Avatar empCode={row.Info_Req_By} name={row.Request_by} size={88} />
                    <div className="min-w-0">
                        <p className="text-slate-800 font-bold text-[20px] truncate">{row.Request_by}</p>
                        <p className="text-slate-500 text-[15px] truncate">{row.Section_code} · ต่อ {row.Extension_No || '—'}</p>
                        <p className="text-slate-500 text-[15px] truncate font-mono">{row.Request_id}</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-lg font-bold px-3 py-1 rounded-full border ${statusStyleTV(displayStatus)}`}>
                        {displayStatus}
                    </span>
                    <WaitingSideBadge row={row} className="text-sm px-2 py-0.5" />
                    <span className="text-lg text-slate-500">{row.Form_id} | {row.STEP && <span className="text-lg text-indigo-400">Step {row.STEP}</span>}</span>
                    
                    
                </div>
            </div>
<div className="mt-1 grid gap-x-4 gap-y-0.5" style={{ gridTemplateColumns: 'auto 1fr' }}>

    <p className="text-[15px] text-slate-500">
        <span className="text-red-400">ID:</span> {row.Info_Req_By || '—'}
    </p>
    <p className="text-[15px] text-slate-600 font-medium">
        {row.Emp_Name || '—'}
    </p>
    <p className="text-[15px] text-slate-500">
        <span className="text-red-400">ต่อ:</span> {row.Extension_No || '—'}
    </p>
    <p className="text-[15px] text-slate-500">
        {row.Emp_Email || row.Email || '—'}
    </p>
</div>
            {/* Detail */}
            <p className="text-slate-700 text-2xl leading-relaxed line-clamp-2">{row.Detail_Info || '(ไม่มีรายละเอียด)'}</p>

            {/* Ticked items */}
            {tickedAll.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {tickedAll.map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[15px] bg-white text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 font-medium shadow-sm">
                            <span className="w-4 h-4 rounded-sm bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-indigo-600 text-[15px] font-black">✓</span>
                            </span>
                            {t.label}
                            {t.otherText && <span className="text-slate-400 font-normal">: {t.otherText}</span>}
                        </span>
                    ))}
                </div>
            )}

            {/* Mini Flow Tracker */}
            <div className="pt-1">
                <MiniFlowStepper row={row} dotSize={20} />
            </div>

            {/* Footer */}
<div className="flex items-center justify-between pt-1 border-t border-slate-200 gap-2 flex-wrap">
    <p className="text-slate-500 text-lg">Create: {formatDate(row.Request_date)}</p>
{row.InCharge ? (
    <div className="flex items-center gap-2">
        <Avatar empCode={row.CodeInCharge} name={row.InCharge} size={48} />
        <div className="flex flex-col leading-tight">
            <p className="text-slate-700 text-xs font-medium">{row.InCharge}</p>
            {isFlowDone(row.Flow5_Status) ? (
                <p className="text-[15px] text-emerald-600 font-semibold">✓ รับเคสแล้ว {formatDateTime(row.Flow5_Date)}</p>
            ) : (
                <p className="text-[15px] text-amber-600 font-semibold">⏳ ยังไม่กดรับเคส</p>
            )}
        </div>
    </div>
) : (
    <span className="text-lg text-slate-400 border border-dashed border-slate-300 px-2 py-0.5 rounded-full">ยังไม่มี InCharge</span>
)}
</div>
        </div>
    );
}
// ── TV View (auto-scroll loop) ────────────────────────────────────────────
// ── useAutoScroll — auto-scroll loop แยกอิสระต่อ container, หยุดเมื่อ hover ─
function useAutoScroll(deps) {
    const scrollRef = useRef(null);
    const pausedRef = useRef(false);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const posRef = { current: 0 };
        const speed  = 0.7;
        let raf;

        const tick = () => {
            if (!pausedRef.current) {
                posRef.current += speed;
                const maxScroll = el.scrollHeight - el.clientHeight;
                if (maxScroll > 0 && posRef.current >= maxScroll) {
                    posRef.current = 0;
                }
                el.scrollTop = posRef.current;
            }
            raf = requestAnimationFrame(tick);
        };

        const timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, 800);
        return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return {
        scrollRef,
        onMouseMove: () => { pausedRef.current = true; },
        onMouseLeave: () => { pausedRef.current = false; },
    };
}

// ── TVColumn — คอลัมน์เลื่อนอัตโนมัติอิสระ (ใช้แยกฝั่ง ACM/UCM) ──────────
function TVColumn({ title, badgeClass, items }) {
    const { scrollRef, onMouseMove, onMouseLeave } = useAutoScroll([items.length]);
    return (
        <div className="flex flex-col h-full min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${badgeClass}`}>{title}</span>
                <span className="text-xs text-slate-400">{items.length} รายการ</span>
            </div>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-scroll"
                style={{ scrollbarWidth: 'none' }}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
            >
                {items.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">ไม่มีรายการ</p>
                ) : (
                    <div className="grid grid-cols-2 gap-5">
                        {items.map((row, i) => <TVCard key={`${row.Request_id}-${i}`} row={row} />)}
                    </div>
                )}
                <div style={{ height: '50vh' }} />
            </div>
        </div>
    );
}

function TVView({ data, onBack }) {
    const [stats, setStats]       = useState({});
    const [statsYear, setStatsYear] = useState(new Date().getFullYear());

    const fetchStats = () => {
        fetch(`${API_BASE}/it-requests/stats`)
            .then((r) => r.json())
            .then((res) => { if (res.success) { setStats(res.data); setStatsYear(res.year); } })
            .catch(() => {});
    };

    useEffect(() => {
        fetchStats();
        const id = setInterval(fetchStats, 300000);
        return () => clearInterval(id);
    }, []);

    const currentYear = new Date().getFullYear();
    const yearData = data.filter((r) => r.Request_date && new Date(r.Request_date).getFullYear() === currentYear);
    const acmData = yearData.filter((r) => r.Form_id === 'FM-IT-002');
    const ucmData = yearData.filter((r) => r.Form_id === 'FM-IT-004');

    const statCards = [
        { s: 'Completed',  label: 'Completed',   color: 'text-green-700',  bg: 'bg-green-100',  border: 'border-green-300'  },
        { s: 'Approved',   label: 'Approved',    color: 'text-yellow-700', bg: 'bg-yellow-100', border: 'border-yellow-300' },
        { s: 'Inprogress', label: 'In Progress', color: 'text-sky-700',    bg: 'bg-sky-100',    border: 'border-sky-300'    },
        { s: 'Rejected',   label: 'Rejected',    color: 'text-red-700',    bg: 'bg-red-100',    border: 'border-red-300'    },
    ];

    return (
        <Portal>
        <div className="fixed inset-0 bg-slate-100 z-40 flex flex-col overflow-hidden">

            {/* TV Header */}
            <div className="flex items-center justify-between px-10 py-4 border-b border-slate-200 bg-white shadow-sm flex-shrink-0 gap-6">
                {/* Back button + Title */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors border border-slate-200 shadow-sm"
                    >
                        ← กลับ
                    </button>
                    <div>
                        <h1 className="text-slate-800 text-3xl font-black tracking-tight">IT ONLINE REQUEST DASHBOARD</h1>
                        <p className="text-slate-500 text-xs mt-0.5">FM-IT-002 · FM-IT-004 · ปี {statsYear} · แสดง {yearData.length} รายการ</p>
                    </div>
                </div>

                {/* Stat cards */}
                <div className="flex gap-3">
                    {statCards.map(({ s, label, color, bg, border }) => (
                        <div key={s} className={`flex flex-col items-center px-5 py-2.5 rounded-xl border ${bg} ${border}`}>
                            <p className={`text-2xl font-black ${color}`}>{stats[s] ?? 0}</p>
                            <p className="text-lg text-slate-400 mt-0.5">{label}</p>
                        </div>
                    ))}
                    <div className="flex flex-col items-center px-5 py-2.5 rounded-xl border bg-slate-700/50 border-slate-600">
                        <p className="text-2xl font-black text-slate-800">
                            {statCards.reduce((sum, { s }) => sum + (stats[s] ?? 0), 0)}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">รวม</p>
                    </div>
                </div>

                {/* Clock */}
                <div className="text-right flex-shrink-0">
                    <p className="text-slate-700 text-6xl font-mono" id="tv-clock">—</p>
                    <p className="text-slate-400 text-xs mt-0.5">Develop By : Natthawut.y</p>
                </div>
            </div>

            {/* สองคอลัมน์ เลื่อนอิสระจากกัน แยกซ้าย(FM-IT-002) / ขวา(FM-IT-004) */}
            <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden px-8 py-6">
                <div className="pr-5 border-r-2 border-slate-300 overflow-hidden">
                    <TVColumn title="FM-IT-002 · IT APPLICATION & EQUIPMENT CHANGE MANAGEMENT REQUEST FORM" badgeClass="text-blue-700 bg-blue-50 border-blue-200" items={acmData} />
                </div>
                <div className="pl-5 overflow-hidden">
                    <TVColumn title="FM-IT-004 · IT USERS CHANGE MANAGEMENT REQUEST FORM" badgeClass="text-indigo-700 bg-indigo-50 border-indigo-200" items={ucmData} />
                </div>
            </div>
        </div>
        </Portal>
    );
}
// ── Clock for TV ───────────────────────────────────────────────────────────
function useClock() {
    useEffect(() => {
        const tick = () => {
            const el = document.getElementById('tv-clock');
            if (el) el.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);
}

// ── Dashboard ──────────────────────────────────────────────────────────────
const PIE_COLORS = {
    Completed:  '#22c55e',
    Approved:   '#f59e0b',
    Inprogress: '#0ea5e9',
    Rejected:   '#ef4444',
    Cancel:     '#94a3b8',
};

const MONTH_LABELS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function DashboardCard({ title, children, className = '' }) {
    return (
        <div className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-sm ${className}`}>
            <h3 className="text-sm font-bold text-slate-700 mb-4">{title}</h3>
            {children}
        </div>
    );
}

const DATE_RANGE_OPTIONS = [
    { key: '7d',  label: '7 วันล่าสุด',   days: 7    },
    { key: '30d', label: '30 วันล่าสุด',  days: 30   },
    { key: '3m',  label: '3 เดือนล่าสุด', days: 90   },
    { key: '1y',  label: '1 ปีล่าสุด',    days: 365  },
    { key: 'all', label: 'ทั้งหมด',       days: null },
];

function Dashboard({ data, loading }) {
    const [dateRange, setDateRange] = useState('1y'); // default 1 ปี
    const [filterSide, setFilterSide] = useState(''); // '' | 'user' | 'it' — รอฝั่งไหน

    const yearData = useMemo(() => {
        const opt = DATE_RANGE_OPTIONS.find((o) => o.key === dateRange);
        let list;
        if (!opt || opt.days === null) {
            list = data.filter((r) => r.Request_date); // ทั้งหมด
        } else {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - opt.days);
            list = data.filter((r) => r.Request_date && new Date(r.Request_date) >= cutoff);
        }
        if (filterSide) list = list.filter((r) => getWaitingSide(r) === filterSide);
        return list;
    }, [data, dateRange, filterSide]);

    // จำนวนเคสที่รอแต่ละฝั่ง ในช่วงเวลาที่เลือก (ไม่กรองตาม filterSide เอง เพื่อให้เห็นตัวเลขทั้งคู่เสมอ)
    const sideCountsInRange = useMemo(() => {
        const opt = DATE_RANGE_OPTIONS.find((o) => o.key === dateRange);
        let list;
        if (!opt || opt.days === null) {
            list = data.filter((r) => r.Request_date);
        } else {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - opt.days);
            list = data.filter((r) => r.Request_date && new Date(r.Request_date) >= cutoff);
        }
        const acc = { user: 0, it: 0 };
        list.forEach((r) => {
            const side = getWaitingSide(r);
            if (side) acc[side] += 1;
        });
        return acc;
    }, [data, dateRange]);

    // สถานะ (ใช้ getDisplayStatus เพื่อให้ตรงกับที่แสดงในหน้า List/TV)
    const statusCounts = useMemo(() => {
        const acc = {};
        yearData.forEach((r) => {
            const s = getDisplayStatus(r);
            acc[s] = (acc[s] || 0) + 1;
        });
        return Object.entries(acc).map(([name, value]) => ({ name, value }));
    }, [yearData]);

    // Workload ต่อคน (เรียงมาก → น้อย)
    const workload = useMemo(() => {
        const acc = {};
        yearData.forEach((r) => {
            if (!r.InCharge) return;
            acc[r.InCharge] = (acc[r.InCharge] || 0) + 1;
        });
        return Object.entries(acc)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [yearData]);

    // Request ต่อช่วงเวลา แยก ACM / UCM — ใช้ bucket รายวันถ้าช่วงสั้น (7d/30d), รายเดือนถ้าช่วงยาว (3m/1y/all)
    const trendData = useMemo(() => {
        const useDailyBuckets = dateRange === '7d' || dateRange === '30d';

        if (useDailyBuckets) {
            const buckets = {};
            yearData.forEach((r) => {
                const d = new Date(r.Request_date);
                const key = d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' });
                if (!buckets[key]) buckets[key] = { label: key, sortKey: d.getTime(), ACM: 0, UCM: 0 };
                if (r.Form_id === 'FM-IT-002') buckets[key].ACM += 1;
                else if (r.Form_id === 'FM-IT-004') buckets[key].UCM += 1;
            });
            return Object.values(buckets).sort((a, b) => a.sortKey - b.sortKey);
        }

        // รายเดือน — รวม ปี-เดือน เป็น key เผื่อช่วง "ทั้งหมด" ครอบหลายปี
        const buckets = {};
        yearData.forEach((r) => {
            const d = new Date(r.Request_date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = `${MONTH_LABELS_TH[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
            if (!buckets[key]) buckets[key] = { label, sortKey: key, ACM: 0, UCM: 0 };
            if (r.Form_id === 'FM-IT-002') buckets[key].ACM += 1;
            else if (r.Form_id === 'FM-IT-004') buckets[key].UCM += 1;
        });
        return Object.values(buckets).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }, [yearData, dateRange]);

    // InCharge × สถานะทั้งหมด (รวม Completed ด้วย) — เก็บ list ของ request แต่ละ cell ไว้ดู drilldown ได้
    const ALL_STATUSES = ['Inprogress', 'Approved', 'Completed', 'Rejected', 'Cancel'];
    const inChargeStatusBreakdown = useMemo(() => {
        const byPerson = {}; // name -> { name, Inprogress: n, Approved: n, Completed: n, ..., _items: { status: [rows] } }
        yearData.forEach((r) => {
            if (!r.InCharge) return;
            const s = getDisplayStatus(r);
            if (!byPerson[r.InCharge]) {
                byPerson[r.InCharge] = { name: r.InCharge, _items: {} };
                ALL_STATUSES.forEach((st) => { byPerson[r.InCharge][st] = 0; byPerson[r.InCharge]._items[st] = []; });
            }
            if (byPerson[r.InCharge][s] === undefined) { byPerson[r.InCharge][s] = 0; byPerson[r.InCharge]._items[s] = []; }
            byPerson[r.InCharge][s] += 1;
            byPerson[r.InCharge]._items[s].push(r);
        });
        return Object.values(byPerson).sort((a, b) => {
            const totalA = ALL_STATUSES.reduce((sum, st) => sum + (a[st] || 0), 0);
            const totalB = ALL_STATUSES.reduce((sum, st) => sum + (b[st] || 0), 0);
            return totalB - totalA;
        });
    }, [yearData]);

    // Drilldown: คลิก segment ของ stacked bar แล้วดู list ของ request ที่ตรงกับ คน+สถานะนั้น
    const [drilldown, setDrilldown] = useState(null); // { name, status, items: [rows] }

    // Bottleneck — เฉลี่ยจำนวนวันที่ request ค้างอยู่ ณ step ปัจจุบัน (เฉพาะที่ยังไม่เสร็จ)
    const bottleneck = useMemo(() => {
        const acc = {}; // label -> { totalDays, count }
        yearData.forEach((r) => {
            const steps = getFlowSteps(r);
            const allDone = steps.every((s) => isFlowDone(s.status));
            if (allDone) return; // เคสที่เสร็จแล้วไม่นับ bottleneck
            let idx = steps.findIndex((s) => s.status === 'Inprogress');
            if (idx === -1) idx = steps.findIndex((s) => !isFlowDone(s.status));
            if (idx === -1) return;
            const step = steps[idx];
            // หาวันที่ step ก่อนหน้าเสร็จ ใช้เป็นจุดเริ่มนับค้าง (ถ้าไม่มีใช้ Request_date)
            // field วันที่ของแต่ละ step ตั้งชื่อแบบ Flow{N}_Date เสมอ ดึงเลข N จาก key (เช่น 'Flow4_ITAssign' -> 'Flow4_Date')
            const prevDoneStep = [...steps.slice(0, idx)].reverse().find((s) => s.by);
            const dateFieldOf = (s) => {
                const m = s.key.match(/^Flow(\d+)_/);
                return m ? `Flow${m[1]}_Date` : null;
            };
            const startDate = prevDoneStep ? r[dateFieldOf(prevDoneStep)] : r.Request_date;
            const start = startDate ? new Date(startDate) : new Date(r.Request_date);
            const now = new Date();
            const days = Math.max(0, (now - start) / 86400000);
            if (!acc[step.label]) acc[step.label] = { totalDays: 0, count: 0 };
            acc[step.label].totalDays += days;
            acc[step.label].count += 1;
        });
        return Object.entries(acc)
            .map(([label, { totalDays, count }]) => ({ label, avgDays: totalDays / count, count }))
            .sort((a, b) => b.avgDays - a.avgDays);
    }, [yearData]);

    const currentRangeLabel = DATE_RANGE_OPTIONS.find((o) => o.key === dateRange)?.label || '';

    const DateRangeSelect = () => (
        <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
            {DATE_RANGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
    );

    const SideFilterSelect = () => (
        <select
            value={filterSide}
            onChange={(e) => setFilterSide(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
            <option value="">รอฝั่ง: ทั้งหมด</option>
            <option value="user">รอฝั่ง: User ({sideCountsInRange.user})</option>
            <option value="it">รอฝั่ง: IT ({sideCountsInRange.it})</option>
        </select>
    );

    if (loading) {
        return <div className="py-20 text-center text-sm text-slate-400">กำลังโหลดข้อมูล Dashboard...</div>;
    }
    if (yearData.length === 0) {
        return (
            <div className="space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <p className="text-sm text-slate-400">ช่วงเวลา: {currentRangeLabel}</p>
                    <div className="flex items-center gap-2">
                        <SideFilterSelect />
                        <DateRangeSelect />
                    </div>
                </div>
                <div className="py-20 text-center text-sm text-slate-400">ไม่มีข้อมูลในช่วงเวลานี้</div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-slate-400">ช่วงเวลา: {currentRangeLabel} · ทั้งหมด {yearData.length} รายการ</p>
                <div className="flex items-center gap-2">
                    <SideFilterSelect />
                    <DateRangeSelect />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* สัดส่วนสถานะ */}
                <DashboardCard title="สัดส่วนสถานะ">
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie
                                data={statusCounts}
                                dataKey="value"
                                nameKey="name"
                                cx="50%" cy="50%"
                                innerRadius={60}
                                outerRadius={95}
                                paddingAngle={2}
                                label={({ name, value }) => `${name}: ${value}`}
                            >
                                {statusCounts.map((s) => (
                                    <Cell key={s.name} fill={PIE_COLORS[s.name] || '#cbd5e1'} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </DashboardCard>

                {/* Request ต่อช่วงเวลา */}
                <DashboardCard title={`จำนวน Request ต่อ${dateRange === '7d' || dateRange === '30d' ? 'วัน' : 'เดือน'}`}>
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="ACM" stroke="#3b82f6" strokeWidth={2} name="FM-IT-002 (ACM)" />
                            <Line type="monotone" dataKey="UCM" stroke="#6366f1" strokeWidth={2} name="FM-IT-004 (UCM)" />
                        </LineChart>
                    </ResponsiveContainer>
                </DashboardCard>

                {/* Workload ต่อคน */}
                <DashboardCard title="Workload ต่อ InCharge (จำนวนเคสที่ถือ)">
                    {workload.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-10">ยังไม่มีข้อมูล InCharge</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={Math.max(220, workload.length * 36)}>
                            <BarChart data={workload} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} name="จำนวนเคส" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </DashboardCard>

                {/* Bottleneck */}
                <DashboardCard title="Bottleneck — ค้างนานที่ขั้นไหน (เฉลี่ยวัน, เฉพาะเคสที่ยังไม่เสร็จ)">
                    {bottleneck.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-10">ไม่มีเคสที่ค้างอยู่ 🎉</p>
                    ) : (
                        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                            {bottleneck.map((b) => (
                                <div key={b.label} className="flex items-center gap-3">
                                    <p className="text-xs text-slate-600 w-40 flex-shrink-0 truncate">{b.label}</p>
                                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                                        <div
                                            className="h-full bg-amber-500 rounded-full"
                                            style={{ width: `${Math.min(100, (b.avgDays / (bottleneck[0]?.avgDays || 1)) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs font-semibold text-slate-700 w-24 flex-shrink-0 text-right">
                                        {b.avgDays.toFixed(1)} วัน ({b.count})
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </DashboardCard>

                {/* InCharge × สถานะที่ยังค้างอยู่ — คลิกแถบสีเพื่อดูรายการ Request ID */}
                <DashboardCard title="เคสของแต่ละ InCharge แยกตามสถานะ (ทุกสถานะ) — คลิกแถบเพื่อดูรายการ" className="lg:col-span-2">
                    {inChargeStatusBreakdown.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-10">ไม่มีเคสที่ค้างอยู่ 🎉</p>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={Math.max(240, inChargeStatusBreakdown.length * 40)}>
                                <BarChart data={inChargeStatusBreakdown} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Legend />
                                    {ALL_STATUSES.map((st) => (
                                        <Bar
                                            key={st}
                                            dataKey={st}
                                            stackId="status"
                                            fill={PIE_COLORS[st] || '#cbd5e1'}
                                            name={st}
                                            cursor="pointer"
                                            onClick={(barData) => {
                                                const items = barData?._items?.[st] || [];
                                                if (items.length > 0) setDrilldown({ name: barData.name, status: st, items });
                                            }}
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>

                            {/* Drilldown panel — แสดง Request ID ที่ค้างอยู่ของ คน+สถานะ ที่เลือก */}
                            {drilldown && (
                                <div className="mt-4 bg-slate-50 rounded-xl border border-slate-200 p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-semibold text-slate-700">
                                            {drilldown.name} · <span style={{ color: PIE_COLORS[drilldown.status] }}>{drilldown.status}</span> ({drilldown.items.length} รายการ)
                                        </p>
                                        <button onClick={() => setDrilldown(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕ ปิด</button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {drilldown.items.map((r) => (
                                            <span key={r.Request_id} className="inline-flex items-center gap-1 text-xs font-mono bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700">
                                                {r.Request_id}
                                                <span className="text-slate-400">· {r.Form_id}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </DashboardCard>
            </div>
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ITRequestPage() {
    const [data, setData]           = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [search, setSearch]       = useState('');
    const [filterStatus, setFilter] = useState('');
    const [filterForm, setFilterForm] = useState('');
    const [filterInCharge, setFilterInCharge] = useState('');
    const [filterSide, setFilterSide] = useState(''); // '' | 'user' | 'it' — รอฝั่งไหน
    const [selected, setSelected]   = useState(null);
    const [tvMode, setTvMode]       = useState(false);
    const [view, setView]           = useState('list'); // 'list' | 'dashboard'

    useClock();

    const fetchData = useCallback(() => {
        setLoading(true);
        fetch(`${API_BASE}/it-requests`)
            .then((r) => r.json())
            .then((res) => { if (res.success) setData(res.data); else setError(res.message); })
            .catch(() => setError('ไม่สามารถโหลดข้อมูลได้'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Auto-refresh ทุกนาที
    useEffect(() => {
        const id = setInterval(fetchData, 60000);
        return () => clearInterval(id);
    }, [fetchData]);

    const filtered = useMemo(() => {
        let list = data;
        if (filterStatus)   list = list.filter((r) => r.Current_Status === filterStatus);
        if (filterForm)     list = list.filter((r) => r.Form_id === filterForm);
        if (filterInCharge) list = list.filter((r) => r.InCharge === filterInCharge);
        if (filterSide)     list = list.filter((r) => getWaitingSide(r) === filterSide);
        if (search) {
            const q = search.toLowerCase();
            list = list.filter((r) =>
                r.Request_by?.toLowerCase().includes(q) ||
                r.Email?.toLowerCase().includes(q) ||
                r.Detail_Info?.toLowerCase().includes(q) ||
                r.Request_id?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [data, filterStatus, filterForm, filterInCharge, filterSide, search]);

    // Pagination — ปุ่มเลขหน้า
    const PAGE_SIZE = 25;
    const [page, setPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    // ถ้า filter เปลี่ยนแล้วหน้าปัจจุบันเกินจำนวนหน้าที่มี ให้รีเซ็ตกลับหน้า 1
    useEffect(() => { setPage(1); }, [filterStatus, filterForm, filterInCharge, filterSide, search]);
    const paginated = useMemo(
        () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [filtered, page]
    );

    const statuses = useMemo(() => [...new Set(data.map((r) => r.Current_Status))], [data]);
    const counts   = useMemo(() => statuses.reduce((acc, s) => { acc[s] = data.filter((r) => r.Current_Status === s).length; return acc; }, {}), [data, statuses]);
    // จำนวนเคสที่รอแต่ละฝั่ง (สำหรับโชว์ในตัวเลือก dropdown)
    const sideCounts = useMemo(() => {
        const acc = { user: 0, it: 0 };
        data.forEach((r) => {
            const side = getWaitingSide(r);
            if (side) acc[side] += 1;
        });
        return acc;
    }, [data]);
    // รายชื่อ InCharge ทั้งหมดที่เคยมี case (เรียงตามชื่อ)
    const inChargeList = useMemo(
        () => [...new Set(data.map((r) => r.InCharge).filter(Boolean))].sort(),
        [data]
    );

    if (tvMode) return <TVView data={data} onBack={() => setTvMode(false)} />;

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">IT Request</h1>
                    <p className="text-sm text-slate-400 mt-1">FM-IT-002 · FM-IT-004 (ไม่รวม Rejected / Cancel)</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Tab switch: List / Dashboard */}
                    <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
                        <button
                            onClick={() => setView('list')}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                                view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            📋 List
                        </button>
                        <button
                            onClick={() => setView('dashboard')}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                                view === 'dashboard' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            📊 Dashboard
                        </button>
                    </div>
                    <button
                        onClick={() => setTvMode(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                        <span>📺</span> TV Mode
                    </button>
                </div>
            </div>

            {view === 'list' && (
            <>
            {/* Summary cards */}
            {(() => {
                const cardDefs = [
                    { key: '',           label: 'ทั้งหมด',    icon: LayoutDashboard, iconBg: 'from-slate-500 to-slate-600', iconColor: 'text-white', val: data.length },
                    { key: 'Inprogress', label: 'In Progress',icon: Loader,          iconBg: 'from-sky-400 to-sky-500',    iconColor: 'text-white', val: counts['Inprogress'] || 0 },
                    { key: 'Approved',   label: 'Approved',   icon: Clock,           iconBg: 'bg-green-500',   iconColor: 'text-white', val: counts['Approved']   || 0 },
                    { key: 'Completed',  label: 'Completed',  icon: CheckCircle,     iconBg: 'bg-teal-500',    iconColor: 'text-white', val: counts['Completed']  || 0 },
                ];
                return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {cardDefs.map(({ key, label, icon: Icon, iconBg, iconColor, val }) => (
                            <div
                                key={key}
                                onClick={() => setFilter((prev) => (prev === key ? '' : key))}
                                className={`bg-white rounded-2xl border p-5 flex items-center justify-between shadow-sm cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md
                                    ${filterStatus === key && key !== '' ? 'border-indigo-300 ring-2 ring-indigo-100 scale-[1.02]' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                                    <p className="text-3xl font-black text-slate-800">{loading ? '—' : val}</p>
                                </div>
                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${iconBg} shadow-sm`}>
                                    <Icon className={`w-5 h-5 ${iconColor}`} />
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <input type="text" placeholder="ค้นหา Request ID, ชื่อ, รายละเอียด..."
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                <select value={filterStatus} onChange={(e) => setFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                    <option value="">สถานะทั้งหมด</option>
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filterForm} onChange={(e) => setFilterForm(e.target.value)}
                    className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                    <option value="">Form ทั้งหมด</option>
                    <option value="FM-IT-002">FM-IT-002 (ACM)</option>
                    <option value="FM-IT-004">FM-IT-004 (UCM)</option>
                </select>
                <select value={filterInCharge} onChange={(e) => setFilterInCharge(e.target.value)}
                    className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                    <option value="">InCharge ทั้งหมด</option>
                    {inChargeList.map((name) => {
                        const n = data.filter((r) => r.InCharge === name).length;
                        return <option key={name} value={name}>{name} ({n})</option>;
                    })}
                </select>
                <select value={filterSide} onChange={(e) => setFilterSide(e.target.value)}
                    className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                    <option value="">รอฝั่ง: ทั้งหมด</option>
                    <option value="user">รอฝั่ง: User ({sideCounts.user})</option>
                    <option value="it">รอฝั่ง: IT ({sideCounts.it})</option>
                </select>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="hidden sm:grid grid-cols-[1fr_8rem_2fr_7rem_9rem_2rem] gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50">
                    {['ผู้ขอ', 'Request ID', 'รายละเอียด', 'สถานะ', 'InCharge', ''].map((h) => (
                        <p key={h} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</p>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                        <svg className="animate-spin w-6 h-6 mr-3 text-indigo-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        <span className="text-sm font-medium">กำลังโหลด...</span>
                    </div>
                ) : error ? (
                    <div className="py-16 text-center text-sm text-red-500">{error}</div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center text-sm text-slate-400">ไม่พบรายการ</div>
                ) : (
                    paginated.map((row) => <RequestRow key={row.Request_id} row={row} onClick={() => setSelected(row)} />)
                )}
            </div>

            {/* Pagination — ปุ่มเลขหน้า */}
            {!loading && filtered.length > 0 && totalPages > 1 && (() => {
                // แสดงเลขหน้าแบบย่อ: หน้าแรก, หน้าสุดท้าย, และหน้ารอบๆ ปัจจุบัน (ใส่ ... เมื่อมีช่องว่าง)
                const pages = [];
                const pageWindow = 1; // จำนวนหน้าซ้าย-ขวาของหน้าปัจจุบันที่จะแสดงเต็ม
                for (let p = 1; p <= totalPages; p++) {
                    if (p === 1 || p === totalPages || (p >= page - pageWindow && p <= page + pageWindow)) {
                        pages.push(p);
                    } else if (pages[pages.length - 1] !== '...') {
                        pages.push('...');
                    }
                }
                return (
                    <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            ‹ ก่อนหน้า
                        </button>
                        {pages.map((p, i) =>
                            p === '...' ? (
                                <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-400">…</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`w-9 h-9 text-sm rounded-lg border transition-colors ${
                                        p === page
                                            ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {p}
                                </button>
                            )
                        )}
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            ถัดไป ›
                        </button>
                    </div>
                );
            })()}

            {!loading && (
                <p className="text-xs text-slate-400 mt-3 text-right">
                    แสดง {paginated.length ? (page - 1) * PAGE_SIZE + 1 : 0}-{(page - 1) * PAGE_SIZE + paginated.length} จาก {filtered.length} รายการ (ทั้งหมดในระบบ {data.length})
                </p>
            )}
            </>
            )}

            {view === 'dashboard' && <Dashboard data={data} loading={loading} />}

            {selected && <DetailModal row={selected} onClose={() => setSelected(null)} />}
        </div>
    );
}