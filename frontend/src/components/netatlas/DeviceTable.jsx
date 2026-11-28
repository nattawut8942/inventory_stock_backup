// NetAtlas — ตารางรายการอุปกรณ์ทั้งหมด (แท็บ "รายการอุปกรณ์")
import React from 'react';
import { Map as MapIcon, Pencil, Trash2 } from 'lucide-react';
import { styleOf, findType, linkLabel } from './netAtlasConfig';

const DeviceTable = ({ devices, allDevices, types, selectedId, canEdit, canDelete, onSelect, onLocate, onEdit, onDelete }) => {
    const nameOf = (id) => allDevices.find((d) => d.id === id)?.name || '-';

    if (devices.length === 0) {
        return <div className="py-12 text-center text-sm text-slate-400">ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                        <th className="px-4 py-2.5">ชื่ออุปกรณ์</th>
                        <th className="px-4 py-2.5">ประเภท</th>
                        <th className="px-4 py-2.5">IP</th>
                        <th className="px-4 py-2.5">รุ่น</th>
                        <th className="px-4 py-2.5">จุดติดตั้ง</th>
                        <th className="px-4 py-2.5">MAC Address</th>
                        <th className="px-4 py-2.5">Fix Asset</th>
                        <th className="px-4 py-2.5">Uplink</th>
                        <th className="px-4 py-2.5 text-right">การทำงาน</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {devices.map((d) => {
                        const meta = styleOf(findType(types, d.type), d.type);
                        const selected = selectedId === d.id;
                        const port = linkLabel(d, allDevices.find((x) => x.id === d.uplinkDeviceId));
                        return (
                            <tr key={d.id}
                                onClick={() => onSelect(d.id)}
                                className={`cursor-pointer transition-colors ${selected ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                                <td className="px-4 py-2.5 font-semibold text-slate-800">
                                    <span className="inline-flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                                        {d.name}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5">
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${meta.soft} ${meta.text}`}>{meta.short}</span>
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{d.ip || 'N/A'}</td>
                                <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[180px] truncate">{d.model || '-'}</td>
                                <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[200px] truncate">{d.location}</td>
                                <td className="px-4 py-2.5 text-xs font-mono text-slate-600 whitespace-nowrap">{d.macAddress || '-'}</td>
                                <td className="px-4 py-2.5 text-xs font-mono text-slate-600 whitespace-nowrap">{d.fixAsset || '-'}</td>
                                <td className="px-4 py-2.5 text-xs text-slate-600">
                                    {d.uplinkDeviceId != null
                                        ? <span>{nameOf(d.uplinkDeviceId)}{port && <span className="ml-1.5 font-mono text-[10px] text-slate-400">{port}</span>}</span>
                                        : <span className="text-slate-400">Core / ต้นทาง</span>}
                                </td>
                                <td className="px-4 py-2.5">
                                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                        <button type="button" onClick={() => onLocate(d.id)} title="ดูบนผัง" aria-label={`ดู ${d.name} บนผัง`}
                                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                                            <MapIcon className="w-4 h-4" />
                                        </button>
                                        {canEdit && (
                                            <button type="button" onClick={() => onEdit(d)} title="แก้ไข" aria-label={`แก้ไข ${d.name}`}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button type="button" onClick={() => onDelete(d)} title="ลบ" aria-label={`ลบ ${d.name}`}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default DeviceTable;
