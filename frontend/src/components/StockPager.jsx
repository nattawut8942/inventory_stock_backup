import { useEffect, useMemo, useState } from 'react';

// แบ่งหน้าตารางฝั่ง client จากข้อมูลที่โหลดมาแล้ว
// เมื่อ rows เปลี่ยน (เช่น เปลี่ยนตัวกรอง) จะกลับไปหน้า 1
export function usePager(rows, pageSize = 20) {
    const [page, setPage] = useState(1);
    useEffect(() => { setPage(1); }, [rows]);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const curPage = Math.min(page, totalPages);
    const pageStart = (curPage - 1) * pageSize;
    const pageRows = useMemo(() => rows.slice(pageStart, pageStart + pageSize), [rows, pageStart, pageSize]);
    return { pageRows, pageStart, curPage, totalPages, setPage, pageSize, total: rows.length };
}

// แถบเลือกหน้า — แสดงเมื่อมีมากกว่า 1 หน้า
export function PagerBar({ curPage, totalPages, setPage, pageStart, pageSize, total }) {
    if (totalPages <= 1) return null;
    // หน้าแรก, หน้าสุดท้าย และรอบหน้าปัจจุบัน ที่เหลือเป็น "…"
    const pageNumbers = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - curPage) <= 1) pageNumbers.push(i);
        else if (pageNumbers[pageNumbers.length - 1] !== '…') pageNumbers.push('…');
    }
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <p className="text-xs text-slate-500">แสดง {pageStart + 1}–{Math.min(pageStart + pageSize, total)} จาก {total.toLocaleString()} รายการ · หน้า {curPage} จาก {totalPages}</p>
            <div className="flex items-center gap-1">
                <button onClick={() => setPage(curPage - 1)} disabled={curPage === 1}
                    className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">ก่อนหน้า</button>
                {pageNumbers.map((n, i) => n === '…' ? (
                    <span key={`e${i}`} className="px-2 text-xs text-slate-400">…</span>
                ) : (
                    <button key={n} onClick={() => setPage(n)}
                        className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold border transition-all ${n === curPage ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{n}</button>
                ))}
                <button onClick={() => setPage(curPage + 1)} disabled={curPage === totalPages}
                    className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">ถัดไป</button>
            </div>
        </div>
    );
}
