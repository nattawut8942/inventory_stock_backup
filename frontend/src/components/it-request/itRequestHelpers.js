// src/components/it-request/itRequestHelpers.js

export const MONTH_LABELS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export const MONTH_FULL_TH = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export const STATUS_STYLE = {
    'Approved':   'bg-yellow-100  text-yellow-800  ring-yellow-300',
    'Inprogress': 'bg-sky-100     text-sky-800     ring-sky-300',
    'Completed':  'bg-green-100   text-green-800   ring-green-300',
    'Cancel':     'bg-slate-100   text-slate-500   ring-slate-200',
    'Rejected':   'bg-red-100     text-red-700     ring-red-200',
};

export const STATUS_STYLE_TV = {
    'Approved':   'bg-yellow-200  text-yellow-800  border-yellow-400',
    'Inprogress': 'bg-sky-200     text-sky-800     border-sky-400',
    'Completed':  'bg-green-200   text-green-800   border-green-400',
    'Cancel':     'bg-slate-200   text-slate-600   border-slate-300',
    'Rejected':   'bg-red-200     text-red-700     border-red-300',
};

export const statusStyle = (s) => STATUS_STYLE[s] || 'bg-slate-50 text-slate-600 ring-slate-200';
export const statusStyleTV = (s) => STATUS_STYLE_TV[s] || 'bg-slate-700 text-slate-300 border-slate-600';

export const PIE_COLORS = {
    Completed:  '#22c55e',
    Approved:   '#f59e0b',
    Inprogress: '#0ea5e9',
    Rejected:   '#ef4444',
    Cancel:     '#94a3b8',
};

// ── ACM checkbox groups ────────────────────────────────────────────────────
export const ACM_GROUPS = [
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

// ── UCM checkbox groups ────────────────────────────────────────────────────
export const UCM_GROUPS = [
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

// ── Problem Category Definitions ───────────────────────────────────────────
export const CATEGORY_DEFINITIONS = {
    HARDWARE: {
        id: 'HARDWARE',
        label: 'คอมพิวเตอร์ / ฮาร์ดแวร์',
        shortLabel: 'Hardware',
        color: '#f97316', // Orange
        lightColor: '#ffedd5',
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        border: 'border-orange-200',
        badge: 'bg-orange-100 text-orange-800 ring-orange-300',
    },
    SOFTWARE: {
        id: 'SOFTWARE',
        label: 'ซอฟต์แวร์ / ระบบโปรแกรม',
        shortLabel: 'Software',
        color: '#8b5cf6', // Purple
        lightColor: '#f3e8ff',
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        badge: 'bg-purple-100 text-purple-800 ring-purple-300',
    },
    NETWORK: {
        id: 'NETWORK',
        label: 'เน็ตเวิร์ก / อุปกรณ์เครือข่าย',
        shortLabel: 'Network',
        color: '#3b82f6', // Blue
        lightColor: '#dbeafe',
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        badge: 'bg-blue-100 text-blue-800 ring-blue-300',
    },
    UCM: {
        id: 'UCM',
        label: 'สิทธิ์และบัญชีผู้ใช้งาน (UCM)',
        shortLabel: 'User Account',
        color: '#06b6d4', // Cyan
        lightColor: '#cffafe',
        bg: 'bg-cyan-50',
        text: 'text-cyan-700',
        border: 'border-cyan-200',
        badge: 'bg-cyan-100 text-cyan-800 ring-cyan-300',
    },
    GENERAL: {
        id: 'GENERAL',
        label: 'คำร้องทั่วไป / อื่นๆ',
        shortLabel: 'General/Other',
        color: '#64748b', // Slate
        lightColor: '#f1f5f9',
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        border: 'border-slate-200',
        badge: 'bg-slate-100 text-slate-700 ring-slate-300',
    },
};

export const isTicked = (data, key) => {
    if (!data) return false;
    const v = data[key];
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'y';
};

// ── Flow Step Utilities ───────────────────────────────────────────────────
export function getFlowSteps(row) {
    if (!row) return [];
    const isACM = row.Form_id === 'FM-IT-002';
    const isUCM = row.Form_id === 'FM-IT-004';

    const steps = [
        { key: 'Flow0_Requestor', label: 'Requestor', by: row.Flow0_Requestor, status: 'Completed', side: 'user' },
        { key: 'Flow2_Manager', label: 'Manager Requester Approve', by: row.Flow2_Manager, status: row.Flow2_Status, side: 'user' },
    ];

    if (isACM && (row.Flow3_GMApprove || row.Flow3_Status)) {
        steps.push({ key: 'Flow3_GMApprove', label: 'GM Requester Approve', by: row.Flow3_GMApprove, status: row.Flow3_Status, side: 'user' });
    }

    steps.push(
        { key: 'Flow4_ITAssign', label: 'IT Manager assign', by: row.Flow4_ITAssign, status: row.Flow4_Status, side: 'it' },
        { key: 'Flow5_ITIncharge', label: 'IT in-charge รับ', by: row.Flow5_ITIncharge, status: row.Flow5_Status, side: 'it' },
        { key: 'Flow6_ITSupervisor', label: 'IT supervisor Approve', by: row.Flow6_ITSupervisor, status: row.Flow6_Status, side: 'it' },
        { key: 'Flow7_ITManager', label: 'IT Manager Approve', by: row.Flow7_ITManager, status: row.Flow7_Status, side: 'it' },
    );

    if (isUCM) {
        steps.push(
            { key: 'Flow8_ITClose', label: 'IT closed', by: row.Flow8_ITClose, status: row.Flow8_Status, side: 'it' },
            { key: 'Flow9_ITClose', label: 'IT Supervisor Close', by: row.Flow9_ITClose, status: row.Flow9_Status, side: 'it' },
            { key: 'Flow10_ITSupApprove', label: 'IT Manager Close', by: row.Flow10_ITSupApprove, status: row.Flow10_Status, side: 'it' },
            { key: 'Flow11_ITMgrApprove', label: 'User Close', by: row.Flow11_ITMgrApprove, status: row.Flow11_Status, side: 'user' },
        );
    } else {
        steps.push(
            { key: 'Flow9_ITClose', label: 'IT closed', by: row.Flow9_ITClose, status: row.Flow9_Status, side: 'it' },
            { key: 'Flow10_ITSupApprove', label: 'IT Supervisor Close', by: row.Flow10_ITSupApprove, status: row.Flow10_Status, side: 'it' },
            { key: 'Flow11_ITMgrApprove', label: 'IT Manager Close', by: row.Flow11_ITMgrApprove, status: row.Flow11_Status, side: 'it' },
            { key: 'Flow12_UserClose', label: 'User Close', by: row.Flow12_UserClose, status: row.Flow12_Status, side: 'user' },
        );
    }

    return steps;
}

export const isFlowDone = (s) => s === 'Completed' || s === 'Approved';

export function getDisplayStatus(row) {
    if (!row) return '—';
    const flowSteps = getFlowSteps(row);
    const lastStep = flowSteps[flowSteps.length - 1];
    if (lastStep && isFlowDone(lastStep.status)) return 'Completed';
    return row.Current_Status || '—';
}

export function getWaitingSide(row) {
    if (!row) return null;
    const flowSteps = getFlowSteps(row);
    let idx = flowSteps.findIndex((s) => s.status === 'Inprogress');
    if (idx === -1) idx = flowSteps.findIndex((s) => !isFlowDone(s.status));
    if (idx === -1) return null;
    return flowSteps[idx].side || null;
}

// ── Incomplete Step Tracker ──────────────────────────────────────────────
export function getIncompleteStepInfo(row) {
    if (!row) return null;
    const displayStatus = getDisplayStatus(row);
    if (displayStatus === 'Completed' || displayStatus === 'Cancel' || displayStatus === 'Rejected') {
        return null;
    }

    const flowSteps = getFlowSteps(row);
    let idx = flowSteps.findIndex((s) => s.status === 'Inprogress');
    if (idx === -1) idx = flowSteps.findIndex((s) => !isFlowDone(s.status));
    if (idx === -1) idx = flowSteps.length - 1;

    const currentStep = flowSteps[idx];
    const side = currentStep.side || (currentStep.key.includes('IT') ? 'it' : 'user');

    // Date & aging calculation
    const start = row.Request_date ? new Date(row.Request_date) : new Date();
    const now = new Date();
    const daysOpen = Math.max(0, Math.floor((now - start) / 86400000));

    return {
        stepKey: currentStep.key,
        stepLabel: currentStep.label,
        side, // 'user' | 'it'
        waitingFor: currentStep.by || (side === 'user' ? (row.Request_by || 'User / ผู้ยื่น') : (row.InCharge || 'IT Manager / Assigned IT')),
        status: currentStep.status || 'Pending',
        stepIndex: idx + 1,
        totalSteps: flowSteps.length,
        daysOpen,
        row
    };
}

// ── Extract All Problems & Categories from a Request ───────────────────────
export function extractRowProblems(row) {
    if (!row) return { primaryCategory: 'GENERAL', allCategories: ['GENERAL'], tickedItems: [] };

    const isACM = row.Form_id === 'FM-IT-002';
    const isUCM = row.Form_id === 'FM-IT-004';
    const tickedItems = [];
    const matchedCategories = new Set();

    if (isACM) {
        // Group 0: Network
        ACM_GROUPS[0].subgroups.forEach((sg) => {
            sg.fields.forEach((f) => {
                if (isTicked(row, f.key)) {
                    matchedCategories.add('NETWORK');
                    const otherText = f.key.endsWith('_OTHER') && row[`${f.key}_TEXT`] ? `: ${row[`${f.key}_TEXT`]}` : '';
                    tickedItems.push({
                        category: 'NETWORK',
                        key: f.key,
                        label: `${f.label}${otherText}`,
                        type: sg.label,
                        categoryLabel: CATEGORY_DEFINITIONS.NETWORK.label,
                    });
                }
            });
        });

        // Group 1: Software
        ACM_GROUPS[1].subgroups.forEach((sg) => {
            sg.fields.forEach((f) => {
                if (isTicked(row, f.key)) {
                    matchedCategories.add('SOFTWARE');
                    const otherText = f.key.endsWith('_OTHER') && row[`${f.key}_TEXT`] ? `: ${row[`${f.key}_TEXT`]}` : '';
                    tickedItems.push({
                        category: 'SOFTWARE',
                        key: f.key,
                        label: `${f.label}${otherText}`,
                        type: sg.label,
                        categoryLabel: CATEGORY_DEFINITIONS.SOFTWARE.label,
                    });
                }
            });
        });

        // Group 2: Hardware
        ACM_GROUPS[2].subgroups.forEach((sg) => {
            sg.fields.forEach((f) => {
                if (isTicked(row, f.key)) {
                    matchedCategories.add('HARDWARE');
                    const otherText = f.key.endsWith('_OTHER') && row[`${f.key}_TEXT`] ? `: ${row[`${f.key}_TEXT`]}` : '';
                    tickedItems.push({
                        category: 'HARDWARE',
                        key: f.key,
                        label: `${f.label}${otherText}`,
                        type: sg.label,
                        categoryLabel: CATEGORY_DEFINITIONS.HARDWARE.label,
                    });
                }
            });
        });
    } else if (isUCM) {
        matchedCategories.add('UCM');
        UCM_GROUPS.forEach((g) => {
            g.subgroups.forEach((sg) => {
                sg.fields.forEach((f) => {
                    if (isTicked(row, f.key)) {
                        tickedItems.push({
                            category: 'UCM',
                            key: f.key,
                            label: f.label,
                            type: sg.label,
                            categoryLabel: CATEGORY_DEFINITIONS.UCM.label,
                        });
                    }
                });
            });
        });
    }

    // Determine primary category
    let primaryCategory = 'GENERAL';
    if (matchedCategories.has('HARDWARE')) primaryCategory = 'HARDWARE';
    else if (matchedCategories.has('SOFTWARE')) primaryCategory = 'SOFTWARE';
    else if (matchedCategories.has('NETWORK')) primaryCategory = 'NETWORK';
    else if (matchedCategories.has('UCM')) primaryCategory = 'UCM';

    if (tickedItems.length === 0) {
        if (isUCM) {
            tickedItems.push({
                category: 'UCM',
                key: 'UCM_GENERAL',
                label: 'จัดการสิทธิ์ผู้ใช้งานทั่วไป',
                type: 'System',
                categoryLabel: CATEGORY_DEFINITIONS.UCM.label,
            });
        } else {
            tickedItems.push({
                category: 'GENERAL',
                key: 'GENERAL_REQ',
                label: 'คำร้องขอเปลี่ยนแปลงอุปกรณ์/ระบบทั่วไป',
                type: 'General',
                categoryLabel: CATEGORY_DEFINITIONS.GENERAL.label,
            });
        }
    }

    return {
        primaryCategory,
        allCategories: Array.from(matchedCategories).length > 0 ? Array.from(matchedCategories) : [primaryCategory],
        tickedItems,
    };
}

// ── Month Utilities ────────────────────────────────────────────────────────
export function getMonthKey(dateVal) {
    if (!dateVal) return null;
    const d = new Date(dateVal);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthKey) {
    if (!monthKey || !monthKey.includes('-')) return '—';
    const [yearStr, monthStr] = monthKey.split('-');
    const m = parseInt(monthStr, 10) - 1;
    const y = parseInt(yearStr, 10);
    return `${MONTH_LABELS_TH[m]} ${String(y).slice(-2)}`;
}

export function formatMonthLong(monthKey) {
    if (!monthKey || !monthKey.includes('-')) return '—';
    const [yearStr, monthStr] = monthKey.split('-');
    const m = parseInt(monthStr, 10) - 1;
    const y = parseInt(yearStr, 10);
    return `${MONTH_FULL_TH[m]} ${y}`;
}

// Extract all distinct months from data, sorted descending
export function getAvailableMonths(data) {
    const set = new Set();
    data.forEach((r) => {
        const k = getMonthKey(r.Request_date);
        if (k) set.add(k);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
}

// Calculate the last 6 months keys ending at a given month key (or current month)
export function getLast6MonthKeys(refMonthKey = null) {
    let baseDate;
    if (refMonthKey && refMonthKey.includes('-')) {
        const [y, m] = refMonthKey.split('-');
        baseDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    } else {
        baseDate = new Date();
    }

    const keys = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        keys.push(k);
    }
    return keys;
}

// ── Duration formatting ───────────────────────────────────────────────────
export function calcDuration(start, end) {
    if (!start || !end) return null;
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s) || isNaN(e) || e <= s) return null;
    const totalMin = Math.floor((e - s) / 60000);
    if (totalMin < 60) return `${totalMin} นาที`;
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours < 24) return mins > 0 ? `${hours} ชม. ${mins} นาที` : `${hours} ชม.`;
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return remH > 0 ? `${days} วัน ${remH} ชม.` : `${days} วัน`;
}

export function durationColor(start, end) {
    if (!start || !end) return 'text-slate-500';
    const days = (new Date(end) - new Date(start)) / 86400000;
    if (days <= 1) return 'text-emerald-500';
    if (days <= 3) return 'text-yellow-500';
    return 'text-red-500';
}
