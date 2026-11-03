import React from 'react';
import { API_URL } from '../config/api';

// Shared bits for the Plug Check sheet and its mobile checklist view
export const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

export const RESULT_INFO = {
    ok: { cls: 'pcs-ok', label: 'ในมาตรฐาน' },
    bad: { cls: 'pcs-bad', label: 'ต้องซ่อมด่วน' },
    use: { cls: 'pcs-use', label: 'ไม่ได้มาตรฐาน แต่ใช้งานได้' },
    fix: { cls: 'pcs-fix', label: 'ปรับแก้แล้ว อยู่ในมาตรฐาน' }
};

export const SIGN_LEVELS = { TOP: ['TE', 'EN'], BOT: ['SE', 'S.EN', 'EN'] };

export const normPos = (p) => String(p || '').toUpperCase().replace(/\s+/g, '').replace(/^SEN$/, 'S.EN');
export const fyLabel = (fy) => `${fy}/${String((fy + 1) % 100).padStart(2, '0')}`;
export const currentFiscal = () => {
    const now = new Date();
    return { fiscalYear: now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, monthIdx: (now.getMonth() + 9) % 12 };
};
export const imgUrl = (u) => (u ? (u.startsWith('http') ? u : `${API_URL}${u}`) : '');

export const Sym = ({ r, size = 20 }) => {
    const p = { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (r === 'ok') return <svg {...p}><circle cx="10" cy="10" r="7.5" /></svg>;
    if (r === 'bad') return <svg {...p}><path d="M3 3L17 17M17 3L3 17" /></svg>;
    if (r === 'use') return <svg {...p}><path d="M3 3H17L3 17H17ZM3 3L17 17" /></svg>;
    if (r === 'fix') return <svg {...p}><circle cx="10" cy="10" r="7.5" /><path d="M5 5L15 15M15 5L5 15" /></svg>;
    if (r === 'fixSq') return <svg {...p}><rect x="3" y="3" width="14" height="14" /><path d="M3 3L17 17M17 3L3 17" /></svg>;
    return null;
};
