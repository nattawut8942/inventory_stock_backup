import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const SMTP_HOST = 'smtp.dci.daikin.co.jp';
const SMTP_PORT = 25;
const FROM      = 'cctv-monitor@dci.daikin.co.jp';
const TO        = ['natthawut.y@dci.daikin.co.jp'];

const STATUS_LABEL = {
    ok:           { label: '✅ ปกติ',        color: '#16a34a' },
    blur_medium:  { label: '🟡 เบลอ (ปาน)', color: '#d97706' },
    blur_heavy:   { label: '🔴 เบลอ (มาก)', color: '#dc2626' },
    black:        { label: '⚫ จอดำ',        color: '#374151' },
    offline:      { label: '📵 Offline',     color: '#6b7280' },
    removed:      { label: '📤 ถอดออกแล้ว', color: '#7c3aed' },
    retired:      { label: '🚫 เลิกใช้',    color: '#9ca3af' },
    error:        { label: '❌ Error',        color: '#ef4444' },
};

export async function sendCaptureReport(runId, results, outputDir) {
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: false,
        tls: { rejectUnauthorized: false },
    });

    // สรุปตัวเลข
    const summary = {};
    for (const r of results) {
        summary[r.status] = (summary[r.status] || 0) + 1;
    }

    // จัดกลุ่มตาม factory
    const byFactory = {};
    for (const r of results) {
        const fac = r.factory_name || 'ไม่ระบุ';
        if (!byFactory[fac]) byFactory[fac] = [];
        byFactory[fac].push(r);
    }

    // Summary rows HTML
    const summaryRows = Object.entries(STATUS_LABEL).map(([key, { label, color }]) => {
        const count = summary[key] || 0;
        if (count === 0) return '';
        return `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${label}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:bold;color:${color}">${count}</td>
        </tr>`;
    }).join('');

    // Factory rows HTML
    const factoryRows = Object.entries(byFactory).map(([fac, cams]) => {
        const online  = cams.filter(c => ['ok','blur_medium','blur_heavy','black'].includes(c.status)).length;
        const total   = cams.length;
        const offline = cams.filter(c => c.status === 'offline').length;
        const removed = cams.filter(c => ['removed','retired'].includes(c.status)).length;
        return `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${fac}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center">${total}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#16a34a"><b>${online}</b></td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#6b7280">${offline}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#7c3aed">${removed}</td>
        </tr>`;
    }).join('');

    // Offline list
    const offlineCams = results.filter(r => r.status === 'offline');
    const offlineList = offlineCams.map(r =>
        `<li style="margin:2px 0">${r.camera_name} — <code style="color:#6b7280">${r.ip_address}</code></li>`
    ).join('');

    // Removed list
    const removedCams = results.filter(r => ['removed','retired'].includes(r.status));
    const removedList = removedCams.map(r =>
        `<li style="margin:2px 0">${r.camera_name} — <span style="color:#7c3aed">${STATUS_LABEL[r.status]?.label}</span></li>`
    ).join('');

    const ts = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    const html = `
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1f2937;padding:20px;max-width:800px">
<h2 style="color:#0f172a;border-bottom:2px solid #e5e7eb;padding-bottom:8px">
    📷 CCTV Weekly Capture Report
</h2>
<p style="color:#6b7280">Run ID: <b>${runId}</b> &nbsp;|&nbsp; Generated: ${ts}</p>

<h3 style="color:#374151;margin-top:24px">📊 สรุปผลรวม</h3>
<table style="border-collapse:collapse;margin-bottom:20px">
    <tr style="background:#f3f4f6">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">สถานะ</th>
        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">จำนวน</th>
    </tr>
    ${summaryRows}
    <tr style="background:#f9fafb;font-weight:bold">
        <td style="padding:8px 12px">รวมทั้งหมด</td>
        <td style="padding:8px 12px;text-align:center">${results.length}</td>
    </tr>
</table>

<h3 style="color:#374151;margin-top:24px">📍 แยกตาม Factory</h3>
<table style="border-collapse:collapse;width:100%;margin-bottom:20px">
    <tr style="background:#f3f4f6">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Factory</th>
        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">ทั้งหมด</th>
        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Online</th>
        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Offline</th>
        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">ถอดออก</th>
    </tr>
    ${factoryRows}
</table>

${offlineCams.length > 0 ? `
<h3 style="color:#dc2626;margin-top:24px">📵 กล้อง Offline (${offlineCams.length} ตัว)</h3>
<ul style="color:#374151;line-height:1.8">${offlineList}</ul>
` : ''}

${removedCams.length > 0 ? `
<h3 style="color:#7c3aed;margin-top:24px">📤 กล้องที่ถอดออก (${removedCams.length} ตัว)</h3>
<ul style="color:#374151;line-height:1.8">${removedList}</ul>
` : ''}

<p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #f3f4f6;padding-top:12px">
    CCTV Management System — IT Infrastructure
</p>
</body></html>`;

    // Attachments — แนบรูปกล้องที่ capture ได้ (เฉพาะ blur/black ที่ต้องตรวจ)
    const attachments = [];
    const problemCams = results.filter(r =>
        ['blur_heavy','blur_medium','black'].includes(r.status) && r.image_path && fs.existsSync(r.image_path)
    );

    // แนบรูปปัญหา (จำกัด 10MB รวม)
    let totalSize = 0;
    for (const r of problemCams) {
        const size = fs.statSync(r.image_path).size;
        if (totalSize + size > 10 * 1024 * 1024) break;
        attachments.push({
            filename: path.basename(r.image_path),
            path:     r.image_path,
        });
        totalSize += size;
    }

    await transporter.sendMail({
        from:        `"CCTV Monitor" <${FROM}>`,
        to:          TO.join(','),
        subject:     `[CCTV Report] Weekly Capture — ${runId}`,
        html,
        attachments,
    });

    console.log(`[Email] Sent to ${TO.join(', ')} with ${attachments.length} attachments`);
}