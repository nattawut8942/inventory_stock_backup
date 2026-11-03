import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Printer, PlusCircle, RefreshCw, Lock, Unlock, CheckSquare, Square, Camera, X, FilePlus2, Plug } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE, API_URL } from '../config/api';
import PhotoPicker from '../components/CameraCapture';

// ───────────────────────── constants ─────────────────────────
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const RESULT_INFO = {
    ok: { cls: 'pcs-ok', label: 'ในมาตรฐาน' },
    bad: { cls: 'pcs-bad', label: 'ต้องซ่อมด่วน' },
    use: { cls: 'pcs-use', label: 'ไม่ได้มาตรฐาน แต่ใช้งานได้' },
    fix: { cls: 'pcs-fix', label: 'ปรับแก้แล้ว อยู่ในมาตรฐาน' }
};
const SIGN_LEVELS = { TOP: ['TE', 'EN'], BOT: ['SE', 'S.EN', 'EN'] };
const ROWS_PER_PAGE = 30;

const normPos = (p) => String(p || '').toUpperCase().replace(/\s+/g, '').replace(/^SEN$/, 'S.EN');
const fyLabel = (fy) => `${fy}/${String((fy + 1) % 100).padStart(2, '0')}`;
const currentFiscal = () => {
    const now = new Date();
    return { fiscalYear: now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, monthIdx: (now.getMonth() + 9) % 12 };
};
const imgUrl = (u) => (u ? (u.startsWith('http') ? u : `${API_URL}${u}`) : '');

// ───────────────────────── svg bits ─────────────────────────
const Sym = ({ r, size = 20 }) => {
    const p = { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (r === 'ok') return <svg {...p}><circle cx="10" cy="10" r="7.5" /></svg>;
    if (r === 'bad') return <svg {...p}><path d="M3 3L17 17M17 3L3 17" /></svg>;
    if (r === 'use') return <svg {...p}><path d="M3 3H17L3 17H17ZM3 3L17 17" /></svg>;
    if (r === 'fix') return <svg {...p}><circle cx="10" cy="10" r="7.5" /><path d="M5 5L15 15M15 5L5 15" /></svg>;
    if (r === 'fixSq') return <svg {...p}><rect x="3" y="3" width="14" height="14" /><path d="M3 3L17 17M17 3L3 17" /></svg>;
    return null;
};

const ShapeSvg = ({ shape, color = '#2b64b8' }) => {
    const p = { viewBox: '0 0 30 30' };
    switch (shape) {
        case 'circle': return <svg {...p}><circle cx="15" cy="15" r="14" fill={color} /></svg>;
        case 'trap': return <svg {...p}><path d="M4 3h22l-4 24H8z" fill={color} /></svg>;
        case 'shield': return <svg {...p}><path d="M2 4h26v16l-13 8-13-8z" fill={color} /></svg>;
        case 'diamond': return <svg {...p}><path d="M15 1l14 14-14 14L1 15z" fill={color} /></svg>;
        default: return <svg {...p}><rect x="2" y="2" width="26" height="26" rx="3" fill={color} /></svg>;
    }
};

// ───────────────────────── sheet CSS (same proportions as the original A3 form: 1800 x 1270) ─────────────────────────
const SHEET_CSS = `
.pcs-page{width:1800px;height:1270px;background:#fff;color:#000;position:relative;font-family:"Times New Roman","Leelawadee UI",Tahoma,serif;font-size:12px;border:1px solid #999;overflow:hidden;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pcs-page *{box-sizing:border-box}
.pcs-ab{position:absolute}
.pcs-sym{display:flex;align-items:center;justify-content:center;height:100%}
.pcs-ok{color:#2a7a45}.pcs-bad{color:#d33}.pcs-use{color:#c2410c}.pcs-fix{color:#6d28d9}
.pcs-hdrL .r{position:absolute;left:0;right:0;display:flex}
.pcs-hdrL .r>div{display:flex;align-items:center;justify-content:center;border:1px solid #000;font-weight:700;text-align:center}
.pcs-title{border:1px solid #000;border-left:0;text-align:center}
.pcs-title .t1{position:absolute;left:0;right:0;top:0;font-size:21px;font-weight:700;line-height:24px}
.pcs-title .t2{position:absolute;left:0;right:0;top:44px;font-size:14px;font-weight:700}
.pcs-title .t3{position:absolute;left:0;right:0;top:94px;font-size:15px}
.pcs-legend{border-collapse:collapse;table-layout:fixed;font-size:10.5px}
.pcs-legend td,.pcs-legend th{border:1px solid #000;padding:0 3px;white-space:nowrap;overflow:hidden;font-weight:400}
.pcs-legend th{height:28px;font-size:11px}.pcs-legend td{height:21px}.pcs-legend td.sy{padding:0}
.pcs-strip{border:1px solid #000}
.pcs-layout{border:1px solid #000;border-top:0;overflow:hidden}
.pcs-layout .cap{position:absolute;left:3px;top:9px;font-size:17px;line-height:17px;z-index:1;pointer-events:none;white-space:pre-line}
.pcs-layout img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.pcs-pin{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));z-index:2}
.pcs-pinimg{position:absolute;right:30px;top:50%;transform:translateY(-50%);max-height:46px;max-width:40px;object-fit:contain;filter:none}
.pcs-pin svg{position:absolute;inset:0;width:100%;height:100%}.pcs-pin span{position:relative;color:#fff;font:700 12px Arial,sans-serif}
.pcs-tbl{border-collapse:collapse;table-layout:fixed;font-size:11px;border:2px solid #000}
.pcs-tbl th,.pcs-tbl td{border:1px solid #000;padding:0;text-align:center;white-space:nowrap;overflow:hidden}
.pcs-tbl th{height:36px;font-weight:400;font-size:10.5px;line-height:1.05;white-space:normal}
.pcs-tbl th.mo{font-weight:700;font-size:10.5px}
.pcs-tbl th.cur{background:#cfe3fb}
.pcs-tbl th.sel{background:#fde68a}
.pcs-tbl td{height:var(--rh,31px)}
.pcs-tbl td.tp{vertical-align:top;text-align:left;padding:1px 2px;line-height:14px}
.pcs-tbl td.tp.c{text-align:center}
.pcs-tbl td.sub{vertical-align:top}
.pcs-tbl td.sub div{height:calc((var(--rh,31px) - 3px) / 2);line-height:calc((var(--rh,31px) - 3px) / 2);text-align:left;padding-left:1px;overflow:hidden}
.pcs-tbl td.sub div+div{border-top:1px solid #000}
.pcs-tbl.dense{font-size:9px}.pcs-tbl.dense td.tp{line-height:10px}
.pcs-tbl td.m{position:relative}
.pcs-tbl td.m.act{cursor:pointer}.pcs-tbl td.m.act:hover{background:rgba(11,107,203,.12)}
.pcs-tbl td.m.locked{background:#f6f6f6}
.pcs-tbl td.m.na{background:repeating-linear-gradient(45deg,#eee 0 4px,#fff 4px 8px)}
.pcs-tbl tr.rowsel td{background:#fff7d6}
.pcs-num{display:flex;margin:0 auto;width:32px;height:min(26px,calc(var(--rh,31px) - 4px));border:1px solid #000;border-radius:50%;align-items:flex-end;justify-content:center;font:10px Arial,sans-serif;padding-bottom:2px}
.pcs-act .pcs-num{cursor:pointer}
.pcs-cam{position:absolute;right:2px;bottom:2px;width:5px;height:5px;border-radius:50%;background:#2563eb}
.pcs-tbl tr.sig td{height:38px;line-height:1}
.pcs-tbl tr.sig td.lb{font-weight:700;font-size:13px}
.pcs-sigcell{font-family:"Segoe Script","Brush Script MT",cursive;font-size:10px;color:#1d4ed8;line-height:1.05;white-space:normal;max-height:36px;overflow:hidden}
.pcs-sigcell small{display:block;font:7px "Segoe UI",sans-serif;color:#555}
.pcs-sigbtn{display:block;margin:0 auto;font:10px "Segoe UI",sans-serif;padding:1px 5px;border:1px solid #9aa4b5;border-radius:4px;background:#fff;cursor:pointer}
.pcs-sigbtn:hover{background:#eef2ff}
.pcs-stdbox{border:1px solid #000;overflow:hidden}
.pcs-stdgrid{display:grid;grid-template-columns:1fr 1fr;height:100%;grid-auto-rows:minmax(86px,1fr)}
.pcs-sc{padding:8px 6px 4px 8px;overflow:hidden}
.pcs-sc h4{margin:0 0 4px;font-size:15px;font-weight:700;white-space:nowrap}
.pcs-sc .row{display:flex;gap:6px}
.pcs-sc .img{width:48px;height:100px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none}
.pcs-sc .img img{width:100%;height:100%;object-fit:contain}
.pcs-sc .txt{font-size:12px;line-height:22px;white-space:pre-line;min-height:44px}
.pcs-sc .shp{width:30px;height:30px;margin-left:auto}
.pcs-pn{border:1px solid #000;overflow:hidden}
.pcs-pn h4{margin:8px 0 0;font-size:16px;text-align:center;font-weight:400}
.pcs-pn .imgslot{margin:6px 10px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.pcs-pn .imgslot img{width:100%;height:100%;object-fit:contain}
.pcs-pn .cap{margin:0 10px;font-size:12.5px;line-height:18px;white-space:pre-line}
.pcs-notes{position:absolute}
.pcs-notes .ln{height:16px;border-bottom:1px solid #aaa}
.pcs-notes textarea{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;font:13px/16px "Times New Roman","Leelawadee UI",serif;resize:none;padding:0 6px;overflow:hidden;outline:none}
.pcs-foot{border:2px solid #000;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center}
.pc-print-root{display:none}
@media print{
 @page{size:A3 landscape;margin:6mm}
 html,body{margin:0!important;background:#fff!important}
 #app{display:none!important}
 .pc-print-root{display:block!important}
 .pc-print-root .pcs-page{zoom:.82;border:0;margin:0;break-inside:avoid;page-break-after:always}
 .pc-print-root .pcs-page:last-child{page-break-after:auto}
}
`;

// ───────────────────────── one printable page ─────────────────────────
const SheetPage = ({
    sheet, points, isFirst, isLast, interactive, results, signs, lockedMonths,
    selectedRows, bulkMonth, notes, onNotes, onNotesBlur,
    onCellClick, onToggleRow, onMonthClick, onSign
}) => {
    const snap = sheet.snapshot;
    const fy = sheet.fiscalYear;
    const cur = currentFiscal();
    const n = points.length;
    const blanks = isLast && n < 20 ? 20 - n : 0;
    const totalRows = n + blanks;
    const rh = totalRows <= 20 ? 31 : Math.max(16, Math.floor(612 / totalRows));
    const stdByCode = useMemo(() => Object.fromEntries((snap.standards || []).map(s => [s.code, s])), [snap]);
    const usedStds = useMemo(() => {
        const used = new Set(sheet.points.map(p => p.StdCode).filter(Boolean));
        return (snap.standards || []).filter(s => used.has(s.code));
    }, [sheet.points, snap]);
    const cols = [40, 98, 91, 83, 90, 58, ...Array(12).fill(41.25)];

    return (
        <div className={`pcs-page ${interactive ? 'pcs-act' : ''}`}>
            <div className="pcs-ab pcs-hdrL" style={{ left: 20, top: 2, width: 373, height: 128 }}>
                <div className="r" style={{ top: 0, height: 63 }}><div style={{ width: 93, fontSize: 12 }}>ฝ่าย / แผนก</div><div style={{ flex: 1, fontSize: 11 }}>{snap.deptName}</div></div>
                <div className="r" style={{ top: 62, height: 66 }}><div style={{ width: 93, fontSize: 12 }}>พื้นที่</div><div style={{ flex: 1, fontSize: 11 }}>{snap.areaName}</div></div>
            </div>
            <div className="pcs-ab pcs-title" style={{ left: 393, top: 2, width: 747, height: 128 }}>
                <div className="t1">รายการตรวจเช็คปลั๊กไฟประจำเดือน</div>
                <div className="t2">(Monthly&nbsp; Check&nbsp; Sheet )</div>
                <div className="t3">ปีงบประมาณ <u style={{ display: 'inline-block', minWidth: 80 }}>{fyLabel(fy)}</u></div>
            </div>
            <table className="pcs-ab pcs-legend" style={{ left: 1140, top: 2, width: 640 }}>
                <colgroup><col style={{ width: 145 }} /><col style={{ width: 288 }} /><col /></colgroup>
                <tbody>
                    <tr><th>สัญลักษณ์การตรวจสอบ</th><th>ความหมายของสัญลักษณ์</th><th>ผู้ตรวจสอบ</th></tr>
                    <tr><td className="sy"><div className="pcs-sym pcs-ok"><Sym r="ok" size={22} /></div></td><td>อยู่ในมาตรฐาน</td><td>TN , TE , EN</td></tr>
                    <tr><td className="sy"><div className="pcs-sym pcs-bad"><Sym r="bad" size={22} /></div></td><td>ไม่อยู่ในมาตรฐานต้องตรวจซ่อมด่วน</td><td>TN , TE , EN</td></tr>
                    <tr><td className="sy"><div className="pcs-sym pcs-use"><Sym r="use" size={22} /></div></td><td>SE , S.EN , EN ตรวจสอบแล้วไม่อยู่ในมาตรฐาน แต่สามารถใช้งานได้</td><td>TN , TE , EN</td></tr>
                    <tr><td className="sy"><div className="pcs-sym pcs-fix" style={{ gap: 8 }}><Sym r="fix" size={22} /><span style={{ fontSize: 12, color: '#000' }}>หรือ</span><Sym r="fixSq" size={22} /></div></td><td>SE , S.EN , EN ตรวจสอบหรือปรับแก้แล้วให้อยู่ในมาตรฐาน</td><td>TN , TE , EN</td></tr>
                </tbody>
            </table>

            <div className="pcs-ab pcs-strip" style={{ left: 20, top: 131, width: 805, height: 35 }} />
            <div className="pcs-ab pcs-layout" style={{ left: 20, top: 165, width: 805, height: 703 }}>
                {isFirst && (
                    <>
                        <div className="cap">{snap.layoutCaption || `Lay out Area ${snap.deptName || ''}\n(${snap.areaName})`}</div>
                        {snap.layoutImage && <img className="bg" src={imgUrl(snap.layoutImage)} alt="" />}
                        {sheet.points.filter(p => p.PosX != null && p.PosY != null).map(p => (
                            <div key={p.SheetPointID} className="pcs-pin" style={{ left: `${p.PosX}%`, top: `${p.PosY}%` }} title={p.PointName}>
                                {(p.ImageUrl || stdByCode[p.StdCode]?.imageUrl) && <img className="pcs-pinimg" src={imgUrl(p.ImageUrl || stdByCode[p.StdCode].imageUrl)} alt="" />}
                                <ShapeSvg shape={stdByCode[p.StdCode]?.shape} />
                                <span>{p.PointNo}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>

            <table className={`pcs-ab pcs-tbl ${rh < 24 ? 'dense' : ''}`} style={{ left: 825, top: 131, width: 955, '--rh': `${rh}px` }}>
                <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <tbody>
                    <tr>
                        <th>เลขที่</th><th>จุดตรวจสอบ</th><th>มาตรฐาน</th><th>วิธีการ</th><th>เครื่องมือ</th><th>ความถี่ใน<br />การตรวจสอบ</th>
                        {MONTHS.map((m, i) => (
                            <th key={m} className={`mo ${interactive && i === cur.monthIdx && fy === cur.fiscalYear ? 'cur' : ''} ${interactive && i === bulkMonth ? 'sel' : ''}`}
                                style={interactive ? { cursor: 'pointer' } : undefined}
                                onClick={interactive ? () => onMonthClick(i) : undefined}>
                                {m}'{String((i < 9 ? fy : fy + 1) % 100).padStart(2, '0')}
                            </th>
                        ))}
                    </tr>
                    {points.map(p => (
                        <tr key={p.SheetPointID} className={interactive && selectedRows.has(p.SheetPointID) ? 'rowsel' : ''}>
                            <td onClick={interactive ? () => onToggleRow(p.SheetPointID) : undefined} title={interactive ? 'คลิกเพื่อเลือกแถว (ใช้กับ bulk)' : undefined}><span className="pcs-num">{p.PointNo}</span></td>
                            <td className="tp">{p.PointName}</td>
                            <td className="tp">{p.StdCode ? `แบบ ${p.StdCode}` : ''}</td>
                            <td className="sub"><div>{p.Method1}</div><div>{p.Method2}</div></td>
                            <td className="sub"><div>{p.Tool1}</div><div>{p.Tool2}</div></td>
                            <td className="tp c">1 ครั้ง/เดือน</td>
                            {MONTHS.map((_, m) => {
                                const na = m < p.StartMonth;
                                const r = results[`${p.SheetPointID}|${m}`];
                                const locked = lockedMonths.has(m);
                                return (
                                    <td key={m}
                                        className={`m ${interactive && !na ? 'act' : ''} ${locked ? 'locked' : ''} ${na ? 'na' : ''}`}
                                        onClick={interactive && !na ? () => onCellClick(p, m) : undefined}>
                                        {r?.Result && RESULT_INFO[r.Result] && <div className={`pcs-sym ${RESULT_INFO[r.Result].cls}`}><Sym r={r.Result} /></div>}
                                        {(r?.PhotoUrl || r?.Note) && <i className="pcs-cam" />}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    {Array.from({ length: blanks }).map((_, i) => (
                        <tr key={`blank-${i}`}>
                            <td><span className="pcs-num" style={{ visibility: 'hidden' }}>0</span></td>
                            <td /><td />
                            <td className="sub"><div /><div /></td>
                            <td className="sub"><div /><div /></td>
                            <td />
                            {MONTHS.map((_, m) => <td key={m} />)}
                        </tr>
                    ))}
                    {isLast && [['TOP', 'TN , TE , EN ผู้รับผิดชอบ'], ['BOT', 'SE , S.EN , EN ผู้รับทราบ']].map(([slot, label]) => (
                        <tr key={slot} className="sig">
                            <td colSpan={6} className="lb">{label}</td>
                            {MONTHS.map((_, m) => {
                                const s = signs[`${m}|${slot}`];
                                return (
                                    <td key={m}>
                                        {s ? (
                                            <div className="pcs-sigcell">{s.SignedBy}<small>{s.Position} · {new Date(s.SignedAt).getDate()}/{new Date(s.SignedAt).getMonth() + 1}</small></div>
                                        ) : interactive ? (
                                            <button className="pcs-sigbtn" onClick={() => onSign(slot, m)}>เซ็น</button>
                                        ) : null}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="pcs-ab pcs-stdbox" style={{ left: 20, top: 868, width: 420, height: 347 }}>
                {isFirst && (
                    <div className="pcs-stdgrid">
                        {usedStds.map(s => {
                            const [l1, ...rest] = String(s.name || '').split('\n');
                            return (
                                <div key={s.code} className="pcs-sc">
                                    <h4>มาตรฐานเต้ารับ แบบ {s.code}</h4>
                                    <div className="row">
                                        <div className="img">{s.imageUrl && <img src={imgUrl(s.imageUrl)} alt="" />}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="txt">{[l1, ...rest].join('\n')}</div>
                                            <div className="shp"><ShapeSvg shape={s.shape} /></div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {[0, 1].map(i => {
                const p = snap.panels?.[i] || {};
                const w = i === 0 ? 355 : 265;
                const capH = i === 0 ? 70 : 86;
                return (
                    <div key={i} className="pcs-ab pcs-pn" style={{ left: i === 0 ? 440 : 795, top: 868, width: w, height: 347, [i === 0 ? 'borderRight' : 'borderLeft']: 0 }}>
                        {isFirst && (
                            <>
                                <h4>{p.title}</h4>
                                <div className="imgslot" style={{ height: 347 - capH - 62 }}>{p.imageUrl && <img src={imgUrl(p.imageUrl)} alt="" />}</div>
                                <div className="cap" style={{ height: capH, overflow: 'hidden' }}>{p.caption}</div>
                            </>
                        )}
                    </div>
                );
            })}
            <div className="pcs-ab pcs-notes" style={{ left: 1060, top: 868, width: 720, height: 347 }}>
                {Array.from({ length: 22 }).map((_, i) => <div key={i} className="ln" />)}
                {isLast && (
                    <textarea value={notes} readOnly={!interactive} title="หมายเหตุ"
                        onChange={interactive ? (e) => onNotes(e.target.value) : undefined}
                        onBlur={interactive ? onNotesBlur : undefined} />
                )}
            </div>
            <div className="pcs-ab pcs-foot" style={{ left: 20, top: 1229, width: 1760, height: 33 }}>DAIKIN COMPRESSOR INDUSTRIES LTD.</div>
        </div>
    );
};

// ───────────────────────── main page ─────────────────────────
const PlugCheckPage = () => {
    const { user } = useAuth();
    const position = normPos(user?.position);

    const [factories, setFactories] = useState([]);
    const [areas, setAreas] = useState([]);
    const [factoryId, setFactoryId] = useState('');
    const [areaId, setAreaId] = useState('');
    const [sheetList, setSheetList] = useState([]);
    const [fiscalYear, setFiscalYear] = useState(currentFiscal().fiscalYear);
    const [sheet, setSheet] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);

    const [selectedRows, setSelectedRows] = useState(new Set());
    const [bulkMonth, setBulkMonth] = useState(currentFiscal().monthIdx);
    const [overwrite, setOverwrite] = useState(false);
    const [notes, setNotes] = useState('');

    const [cell, setCell] = useState(null); // { point, month, result, note }
    const [unlockReason, setUnlockReason] = useState('');
    const [showUnlock, setShowUnlock] = useState(false);

    const wrapRef = useRef(null);
    const [zoom, setZoom] = useState(1);

    const showToast = useCallback((msg, type = 'info') => {
        setToast({ msg, type });
        window.clearTimeout(showToast._t);
        showToast._t = window.setTimeout(() => setToast(null), 3500);
    }, []);

    const authFetch = useCallback(async (path, opts = {}) => {
        const headers = { ...(opts.headers || {}) };
        if (user?.token) headers.Authorization = `Bearer ${user.token}`;
        const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
        let data = null;
        try { data = await res.json(); } catch { /* non-JSON */ }
        if (res.status === 401 || res.status === 403 && !data?.error) {
            throw new Error('เซสชันหมดอายุหรือไม่มีสิทธิ์ กรุณา Login ใหม่');
        }
        if (!res.ok || data?.success === false) throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
        return data;
    }, [user?.token]);

    // ── data loading ──
    useEffect(() => {
        fetch(`${API_BASE}/plug/factories`).then(r => r.json()).then(d => {
            const list = d.data || [];
            setFactories(list);
            if (list.length) setFactoryId(String(list[0].FactoryID));
        }).catch(() => showToast('โหลดรายการโรงงานไม่สำเร็จ', 'error'));
    }, [showToast]);

    useEffect(() => {
        if (!factoryId) { setAreas([]); return; }
        fetch(`${API_BASE}/plug/areas?factoryId=${factoryId}`).then(r => r.json()).then(d => {
            const list = d.data || [];
            setAreas(list);
            setAreaId(list.length ? String(list[0].AreaID) : '');
        }).catch(() => showToast('โหลดรายการพื้นที่ไม่สำเร็จ', 'error'));
    }, [factoryId, showToast]);

    const loadSheetList = useCallback(async (keepFy) => {
        if (!areaId) { setSheetList([]); setSheet(null); return; }
        const d = await (await fetch(`${API_BASE}/plug/sheets?areaId=${areaId}`)).json();
        const list = d.data || [];
        setSheetList(list);
        if (!keepFy) {
            const cur = currentFiscal().fiscalYear;
            setFiscalYear(list.some(s => s.FiscalYear === cur) || !list.length ? cur : list[0].FiscalYear);
        }
    }, [areaId]);

    useEffect(() => { loadSheetList(false).catch(() => showToast('โหลดใบตรวจไม่สำเร็จ', 'error')); }, [loadSheetList, showToast]);

    const loadSheet = useCallback(async (sheetId) => {
        setLoading(true);
        try {
            const d = await (await fetch(`${API_BASE}/plug/sheets/${sheetId}`)).json();
            if (!d.success) throw new Error(d.error);
            setSheet(d.data);
            setNotes(d.data.notes || '');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    const currentSheetRow = sheetList.find(s => s.FiscalYear === fiscalYear);
    useEffect(() => {
        setSelectedRows(new Set());
        if (currentSheetRow) loadSheet(currentSheetRow.SheetID);
        else setSheet(null);
    }, [currentSheetRow?.SheetID, loadSheet]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── scale the 1800px canvas to the available width ──
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setZoom(Math.min(1, (el.clientWidth - 8) / 1800)));
        ro.observe(el);
        return () => ro.disconnect();
    }, [sheet]);

    // ── derived maps ──
    const resultMap = useMemo(() => {
        const m = {};
        (sheet?.results || []).forEach(r => { m[`${r.SheetPointID}|${r.MonthIdx}`] = r; });
        return m;
    }, [sheet]);
    const signMap = useMemo(() => {
        const m = {};
        (sheet?.signs || []).forEach(s => { m[`${s.MonthIdx}|${s.Slot}`] = s; });
        return m;
    }, [sheet]);
    const lockedMonths = useMemo(() => new Set((sheet?.signs || []).filter(s => s.Slot === 'TOP').map(s => s.MonthIdx)), [sheet]);
    const pages = useMemo(() => {
        const pts = sheet?.points || [];
        const chunks = [];
        for (let i = 0; i < pts.length; i += ROWS_PER_PAGE) chunks.push(pts.slice(i, i + ROWS_PER_PAGE));
        return chunks.length ? chunks : [[]];
    }, [sheet]);

    // ── actions ──
    const createSheet = async () => {
        try {
            const d = await authFetch('/plug/sheets', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ areaId: Number(areaId), fiscalYear })
            });
            await loadSheetList(true);
            showToast('สร้างใบตรวจสำเร็จ', 'success');
            return d;
        } catch (e) { showToast(e.message, 'error'); }
    };

    const syncPoints = async () => {
        try {
            const d = await authFetch(`/plug/sheets/${sheet.sheetId}/sync`, { method: 'POST' });
            showToast(d.data.added ? `เพิ่ม ${d.data.added} จุดเข้าใบนี้แล้ว` : 'ไม่มีจุดใหม่ให้เพิ่ม', d.data.added ? 'success' : 'info');
            if (d.data.added) loadSheet(sheet.sheetId);
        } catch (e) { showToast(e.message, 'error'); }
    };

    const saveResults = async (monthIdx, items, ow = true) => {
        const d = await authFetch(`/plug/sheets/${sheet.sheetId}/results`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monthIdx, items, overwrite: ow })
        });
        await loadSheet(sheet.sheetId);
        return d.data.changed;
    };

    const onCellClick = (point, month) => {
        if (lockedMonths.has(month)) { showToast('เดือนนี้ถูกเซ็นรับรองแล้ว ต้องปลดล็อกก่อนแก้ไข', 'error'); return; }
        const r = resultMap[`${point.SheetPointID}|${month}`];
        setCell({ point, month, result: r?.Result || '', note: r?.Note || '', photo: r?.PhotoUrl || '' });
    };

    const applyCell = async (result) => {
        try {
            await saveResults(cell.month, [{ sheetPointId: cell.point.SheetPointID, result, note: cell.note }], true);
            setCell(null);
        } catch (e) { showToast(e.message, 'error'); }
    };

    const uploadPhoto = async (file) => {
        if (!file || !cell) return;
        try {
            const fd = new FormData();
            fd.append('image', file);
            fd.append('sheetPointId', cell.point.SheetPointID);
            fd.append('monthIdx', cell.month);
            const d = await authFetch(`/plug/sheets/${sheet.sheetId}/photo`, { method: 'POST', body: fd });
            setCell(c => ({ ...c, photo: d.data.url }));
            await loadSheet(sheet.sheetId);
        } catch (e) { showToast(e.message, 'error'); }
    };

    const toggleRow = (id) => setSelectedRows(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });

    const selectByStd = (code) => {
        setSelectedRows(new Set((sheet?.points || []).filter(p => p.StdCode === code).map(p => p.SheetPointID)));
    };

    const applyBulk = async (result) => {
        if (lockedMonths.has(bulkMonth)) { showToast('เดือนนี้ถูกเซ็นรับรองแล้ว ต้องปลดล็อกก่อนแก้ไข', 'error'); return; }
        const targets = (sheet.points || []).filter(p => (selectedRows.size === 0 || selectedRows.has(p.SheetPointID)) && bulkMonth >= p.StartMonth);
        if (!targets.length) { showToast('ไม่มีจุดที่ตรวจได้ในเดือนนี้', 'error'); return; }
        const label = `${RESULT_INFO[result].label} ให้ ${targets.length} จุด เดือน ${MONTHS[bulkMonth]}${overwrite ? ' (ทับผลเดิม)' : ' (เฉพาะช่องว่าง)'}`;
        if (!window.confirm(`ตั้งผล "${label}" ใช่หรือไม่?`)) return;
        try {
            const changed = await saveResults(bulkMonth, targets.map(p => ({ sheetPointId: p.SheetPointID, result })), overwrite);
            showToast(`บันทึก ${changed} ช่อง`, 'success');
        } catch (e) { showToast(e.message, 'error'); }
    };

    const onSign = async (slot, month) => {
        try {
            await authFetch(`/plug/sheets/${sheet.sheetId}/sign`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthIdx: month, slot })
            });
            await loadSheet(sheet.sheetId);
            showToast(`เซ็นเดือน ${MONTHS[month]} สำเร็จ`, 'success');
        } catch (e) { showToast(e.message, 'error'); }
    };

    const doUnlock = async () => {
        try {
            await authFetch(`/plug/sheets/${sheet.sheetId}/unlock`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthIdx: bulkMonth, reason: unlockReason })
            });
            setShowUnlock(false); setUnlockReason('');
            await loadSheet(sheet.sheetId);
            showToast(`ปลดล็อกเดือน ${MONTHS[bulkMonth]} แล้ว`, 'success');
        } catch (e) { showToast(e.message, 'error'); }
    };

    const saveNotes = async () => {
        if (!sheet || notes === (sheet.notes || '')) return;
        try {
            await authFetch(`/plug/sheets/${sheet.sheetId}/notes`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes })
            });
            setSheet(s => ({ ...s, notes }));
        } catch (e) { showToast(e.message, 'error'); }
    };

    const fyOptions = useMemo(() => {
        const set = new Set(sheetList.map(s => s.FiscalYear));
        set.add(currentFiscal().fiscalYear);
        return [...set].sort((a, b) => b - a);
    }, [sheetList]);

    const stdCodes = useMemo(() => [...new Set((sheet?.points || []).map(p => p.StdCode).filter(Boolean))].sort(), [sheet]);
    const canUnlock = position === 'EN';
    const bulkLocked = lockedMonths.has(bulkMonth);

    const pageProps = (chunk, idx) => ({
        sheet, points: chunk, isFirst: idx === 0, isLast: idx === pages.length - 1,
        results: resultMap, signs: signMap, lockedMonths, selectedRows, bulkMonth, notes
    });

    return (
        <div className="space-y-5 animate-in fade-in duration-500">
            <style>{SHEET_CSS}</style>

            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 mb-1 flex items-center gap-3"><Plug className="text-indigo-600" size={30} /> PLUG CHECK</h2>
                    <p className="text-slate-500 font-medium">ตรวจเช็คปลั๊กไฟประจำเดือน · ตรวจ → เซ็นรับรอง → พิมพ์ย้อนหลังได้</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <select value={factoryId} onChange={e => setFactoryId(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-500">
                        {!factories.length && <option value="">ยังไม่มีโรงงาน</option>}
                        {factories.map(f => <option key={f.FactoryID} value={f.FactoryID}>{f.FactoryName}</option>)}
                    </select>
                    <select value={areaId} onChange={e => setAreaId(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-500">
                        {!areas.length && <option value="">ยังไม่มีพื้นที่</option>}
                        {areas.map(a => <option key={a.AreaID} value={a.AreaID}>{a.AreaName}</option>)}
                    </select>
                    <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-500">
                        {fyOptions.map(y => <option key={y} value={y}>ปีงบ {fyLabel(y)}{sheetList.some(s => s.FiscalYear === y) ? '' : ' (ยังไม่สร้าง)'}{y < currentFiscal().fiscalYear ? ' · ย้อนหลัง' : ''}</option>)}
                    </select>
                    {sheet && (
                        <>
                            <button onClick={syncPoints} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-bold hover:border-indigo-400" title="เพิ่มจุดตรวจใหม่จาก Plug Master เข้าใบนี้">
                                <RefreshCw size={16} /> เพิ่มจุดใหม่เข้าใบ
                            </button>
                            <button onClick={() => window.print()} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700">
                                <Printer size={16} /> พิมพ์ A3
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Empty / create states */}
            {!areaId && (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
                    ยังไม่มีพื้นที่ตรวจ — ให้ผู้ดูแลเพิ่มโรงงาน พื้นที่ และจุดตรวจที่ <b>Management → Plug Master</b>
                </div>
            )}
            {areaId && !currentSheetRow && !loading && (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4">
                    <FilePlus2 className="mx-auto text-indigo-400" size={42} />
                    <p className="text-slate-600 font-medium">ยังไม่มีใบตรวจปีงบ {fyLabel(fiscalYear)} ของพื้นที่นี้</p>
                    <button onClick={createSheet} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700">
                        <PlusCircle size={18} /> สร้างใบตรวจปีงบ {fyLabel(fiscalYear)}
                    </button>
                    <p className="text-xs text-slate-400">ระบบคัดลอกจุดตรวจ ผัง และมาตรฐานเต้ารับ ณ ปัจจุบันมาเป็นใบของปีนี้</p>
                </div>
            )}

            {/* Bulk toolbar */}
            {sheet && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-black text-slate-700">ติ๊กทีเดียวทั้งเดือน</span>
                        <select value={bulkMonth} onChange={e => setBulkMonth(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none">
                            {MONTHS.map((m, i) => <option key={m} value={i}>{m}'{String((i < 9 ? sheet.fiscalYear : sheet.fiscalYear + 1) % 100).padStart(2, '0')}{lockedMonths.has(i) ? ' 🔒' : ''}</option>)}
                        </select>
                        <span className="text-xs text-slate-500">
                            {selectedRows.size ? `เลือก ${selectedRows.size} จุด` : `ทุกจุด (${sheet.points.length})`}
                        </span>
                        <button onClick={() => setSelectedRows(new Set(sheet.points.map(p => p.SheetPointID)))} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"><CheckSquare size={14} /> เลือกทั้งหมด</button>
                        <button onClick={() => setSelectedRows(new Set())} className="text-xs font-bold text-slate-500 flex items-center gap-1 hover:underline"><Square size={14} /> ล้างการเลือก</button>
                        {stdCodes.map(c => (
                            <button key={c} onClick={() => selectByStd(c)} className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-100">เลือกแบบ {c}</button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {Object.entries(RESULT_INFO).map(([k, v]) => (
                            <button key={k} disabled={bulkLocked} onClick={() => applyBulk(k)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-bold hover:bg-slate-50 disabled:opacity-40 ${v.cls}`}>
                                <Sym r={k} /> <span className="text-slate-700">{v.label}</span>
                            </button>
                        ))}
                        <label className="flex items-center gap-2 text-xs text-slate-600 ml-2">
                            <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} /> ทับผลเดิม (ปกติเติมเฉพาะช่องว่าง)
                        </label>
                        {bulkLocked && (
                            <span className="flex items-center gap-2 text-xs font-bold text-amber-600 ml-auto"><Lock size={14} /> เดือนนี้ถูกล็อก
                                {canUnlock && <button onClick={() => setShowUnlock(true)} className="flex items-center gap-1 px-2 py-1 bg-amber-100 rounded-lg hover:bg-amber-200"><Unlock size={14} /> ปลดล็อก</button>}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-400">คลิกเลขที่ (วงกลม) เพื่อเลือกแถว · คลิกหัวเดือนเพื่อเลือกเดือนสำหรับติ๊กทีเดียว · คลิกช่องเพื่อบันทึกผล/แนบรูป · เซ็น: ช่องบน TE, EN / ช่องล่าง SE, S.EN, EN (ตำแหน่งของคุณ: <b>{position || 'ไม่ระบุ'}</b>)</p>
                </div>
            )}

            {/* Sheet (screen) */}
            {sheet && (
                <div ref={wrapRef} className="bg-slate-200/60 rounded-2xl p-2 overflow-hidden">
                    {pages.map((chunk, idx) => (
                        <div key={idx} style={{ marginBottom: idx < pages.length - 1 ? 12 : 0 }}>
                            <div style={{ zoom }}>
                                <SheetPage {...pageProps(chunk, idx)} interactive
                                    onNotes={setNotes} onNotesBlur={saveNotes}
                                    onCellClick={onCellClick} onToggleRow={toggleRow} onMonthClick={setBulkMonth} onSign={onSign} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Print-only copy (rendered into body so the rest of the app can be hidden) */}
            {sheet && createPortal(
                <div className="pc-print-root">
                    {pages.map((chunk, idx) => (
                        <SheetPage key={idx} {...pageProps(chunk, idx)} interactive={false} />
                    ))}
                </div>,
                document.body
            )}

            {/* Cell modal */}
            {cell && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setCell(null)}>
                    <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-black text-slate-800">จุดที่ {cell.point.PointNo} · {cell.point.PointName}</h3>
                                <p className="text-xs text-slate-500">เดือน {MONTHS[cell.month]}'{String((cell.month < 9 ? sheet.fiscalYear : sheet.fiscalYear + 1) % 100).padStart(2, '0')} · {cell.point.StdCode ? `แบบ ${cell.point.StdCode}` : ''}</p>
                            </div>
                            <button onClick={() => setCell(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(RESULT_INFO).map(([k, v]) => (
                                <button key={k} onClick={() => applyCell(k)}
                                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold ${cell.result === k ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'} ${v.cls}`}>
                                    <Sym r={k} /> <span className="text-slate-700 text-left leading-tight">{v.label}</span>
                                </button>
                            ))}
                        </div>
                        <input type="text" value={cell.note} onChange={e => setCell(c => ({ ...c, note: e.target.value }))} placeholder="หมายเหตุ (ถ้ามี)"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                        <div className="flex items-center gap-3">
                            <PhotoPicker onFile={uploadPhoto} />
                            {cell.photo && <a href={imgUrl(cell.photo)} target="_blank" rel="noreferrer"><img src={imgUrl(cell.photo)} alt="" className="h-12 rounded-lg border border-slate-200" /></a>}
                        </div>
                        <div className="flex justify-between pt-1">
                            <button onClick={() => applyCell('')} className="text-sm font-bold text-slate-500 hover:text-red-500">ล้างผล</button>
                            <button onClick={() => (cell.result ? applyCell(cell.result) : setCell(null))} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">บันทึกหมายเหตุ / ปิด</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Unlock modal */}
            {showUnlock && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowUnlock(false)}>
                    <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Unlock size={18} /> ปลดล็อกเดือน {MONTHS[bulkMonth]}</h3>
                        <p className="text-xs text-slate-500">ลายเซ็นของเดือนนี้จะถูกลบ และต้องเซ็นใหม่หลังแก้ไข ระบบบันทึกเหตุผลไว้ใน Log</p>
                        <input autoFocus type="text" value={unlockReason} onChange={e => setUnlockReason(e.target.value)} placeholder="เหตุผล (จำเป็น)"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowUnlock(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">ยกเลิก</button>
                            <button disabled={!unlockReason.trim()} onClick={doUnlock} className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-40">ปลดล็อก</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {toast && createPortal(
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2.5 rounded-xl text-sm font-bold shadow-2xl text-white ${toast.type === 'error' ? 'bg-red-600' : toast.type === 'success' ? 'bg-emerald-600' : 'bg-slate-800'}`}>
                    {toast.msg}
                </div>,
                document.body
            )}
        </div>
    );
};

export default PlugCheckPage;
