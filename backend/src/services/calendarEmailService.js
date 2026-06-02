// ============================================================
//  calendarEmailService.js
//  ส่งแจ้งเตือนงาน IT Task ประจำวันทาง Email (Outlook)
//  ใช้ SMTP เดียวกับ emailService.js เดิม
// ============================================================
import nodemailer from 'nodemailer';
import { getPool } from '../config/db.js';

// ─── SMTP (เดียวกับ emailService.js เดิม) ────────────────────────────────────
const createTransporter = () => nodemailer.createTransport({
    host:      process.env.EMAIL_HOST || 'smtp.dci.daikin.co.jp',
    port:      25,
    secure:    false,
    ignoreTLS: true,
    tls:       { rejectUnauthorized: false },
});

// ─── Styles (เดียวกับ emailService.js เดิม) ──────────────────────────────────
const thStyle = `padding:6px 14px;border:1px solid #ddd;text-align:left;font-size:12px;background-color:transparent;color:#475569;white-space:nowrap;`;
const tdStyle = `padding:6px 14px;border:1px solid #ddd;font-size:13px;`;

// ─── Task type config ─────────────────────────────────────────────────────────
const TYPE_CONFIG = {
    routine:     { emoji: '🟢', label: 'งานประจำ',              color: '#10b981', bg: '#f0fdf4' },
    setup:       { emoji: '🔵', label: 'ติดตั้ง/เตรียมเครื่อง', color: '#3b82f6', bg: '#eff6ff' },
    maintenance: { emoji: '🟡', label: 'บำรุงรักษา (PM)',        color: '#f59e0b', bg: '#fffbeb' },
    urgent:      { emoji: '🔴', label: 'งานด่วน/แก้ไขปัญหา',   color: '#ef4444', bg: '#fef2f2' },
    project:     { emoji: '🟣', label: 'โปรเจค',               color: '#8b5cf6', bg: '#f5f3ff' },
};

// ─── ดึงงานวันนี้ ──────────────────────────────────────────────────────────────
const getTodayTasks = async () => {
    const pool   = getPool();
    const result = await pool.request().query(`
        SELECT
            t.task_id,
            t.task_title,
            t.task_type,
            lk.type_label,
            t.description,
            t.created_by,
            CONVERT(VARCHAR(10), t.start_date, 120) AS start_date,
            CONVERT(VARCHAR(10), t.end_date,   120) AS end_date
        FROM  [dbo].[cal_tasks]         t
        JOIN  [dbo].[lkp_cal_task_type] lk ON t.task_type = lk.type_key
        WHERE t.start_date = CAST(GETDATE() AS DATE)
        ORDER BY
            CASE t.task_type
                WHEN 'urgent'      THEN 1
                WHEN 'maintenance' THEN 2
                WHEN 'setup'       THEN 3
                WHEN 'project'     THEN 4
                ELSE 5
            END
    `);
    return result.recordset;
};

// ─── ดึงงานพรุ่งนี้ ────────────────────────────────────────────────────────────
const getTomorrowTasks = async () => {
    const pool   = getPool();
    const result = await pool.request().query(`
        SELECT
            t.task_title,
            t.task_type,
            lk.type_label
        FROM  [dbo].[cal_tasks]         t
        JOIN  [dbo].[lkp_cal_task_type] lk ON t.task_type = lk.type_key
        WHERE t.start_date = CAST(DATEADD(DAY, 1, GETDATE()) AS DATE)
        ORDER BY t.task_type
    `);
    return result.recordset;
};

// ─── สร้าง HTML Email ─────────────────────────────────────────────────────────
const buildEmailHtml = (todayTasks, tomorrowTasks) => {
    const now     = new Date();
    const dateStr = now.toLocaleDateString('th-TH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    const urgentTasks = todayTasks.filter(t => t.task_type === 'urgent');

    // ── task cards (แทน table rows) ──────────────────────────────────────────
    const taskCards = todayTasks.length === 0
        ? `<div style="text-align:center;padding:40px 20px;color:#9ca3af;">
               <div style="font-size:40px;margin-bottom:12px;">✅</div>
               <p style="margin:0;font-size:16px;font-weight:600;color:#6b7280;">ไม่มีงานที่กำหนดไว้วันนี้</p>
           </div>`
        : todayTasks.map(t => {
            const cfg     = TYPE_CONFIG[t.task_type] || { emoji: '⚪', label: t.type_label, color: '#6b7280', bg: '#f9fafb' };
            const endDate = t.end_date && t.end_date !== t.start_date ? ` → ${t.end_date}` : '';
            const isUrgent = t.task_type === 'urgent';
            return `
            <div style="
                border:1px solid ${isUrgent ? '#fca5a5' : '#e5e7eb'};
                border-left:5px solid ${cfg.color};
                border-radius:8px;
                padding:16px 20px;
                margin-bottom:12px;
                background:${isUrgent ? '#fff5f5' : '#ffffff'};
            ">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="vertical-align:top;width:36px;">
                            <span style="font-size:24px;line-height:1;">${cfg.emoji}</span>
                        </td>
                        <td style="vertical-align:top;padding-left:12px;">
                            <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:4px;">
                                ${t.task_title}
                            </div>
                            ${t.description
                                ? `<div style="font-size:13px;color:#6b7280;margin-bottom:8px;line-height:1.5;">${t.description}</div>`
                                : ''}
                            <div style="display:inline-block;">
                                <span style="
                                    background:${cfg.bg};
                                    color:${cfg.color};
                                    border:1px solid ${cfg.color}55;
                                    padding:3px 12px;
                                    border-radius:20px;
                                    font-size:12px;
                                    font-weight:700;
                                ">${cfg.label}</span>
                            </div>
                        </td>
                        <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:16px;min-width:130px;">
                            <div style="font-size:13px;font-weight:600;color:#374151;">
                                📅 ${t.start_date}${endDate}
                            </div>
                            ${t.created_by
                                ? `<div style="font-size:12px;color:#9ca3af;margin-top:4px;">👤 ${t.created_by}</div>`
                                : ''}
                        </td>
                    </tr>
                </table>
            </div>`;
        }).join('');

    // ── summary badges ────────────────────────────────────────────────────────
    const typeSummary = Object.entries(
        todayTasks.reduce((acc, t) => {
            acc[t.task_type] = (acc[t.task_type] || 0) + 1;
            return acc;
        }, {})
    ).map(([type, count]) => {
        const cfg = TYPE_CONFIG[type] || { emoji: '⚪', label: type, color: '#6b7280', bg: '#f9fafb' };
        return `<span style="
            background:${cfg.bg};color:${cfg.color};
            border:1px solid ${cfg.color}55;
            padding:4px 12px;border-radius:20px;
            font-size:12px;font-weight:700;margin:3px;display:inline-block;
        ">${cfg.emoji} ${cfg.label} (${count})</span>`;
    }).join('');

    // ── tomorrow section ──────────────────────────────────────────────────────
    const tomorrowSection = tomorrowTasks.length > 0 ? `
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-top:8px;">
            <div style="font-size:13px;font-weight:700;color:#6b7280;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em;">
                📋 งานพรุ่งนี้
            </div>
            ${tomorrowTasks.map(t => {
                const cfg = TYPE_CONFIG[t.task_type] || { emoji: '⚪', label: t.type_label, color: '#6b7280' };
                return `<div style="font-size:14px;color:#374151;padding:4px 0;border-bottom:1px solid #f3f4f6;">
                    ${cfg.emoji} <strong>${t.task_title}</strong>
                    <span style="color:${cfg.color};font-size:12px;margin-left:8px;">${cfg.label}</span>
                </div>`;
            }).join('')}
        </div>` : '';

    // ── urgent banner ─────────────────────────────────────────────────────────
    const urgentBanner = urgentTasks.length > 0 ? `
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px 20px;margin-bottom:20px;">
            <div style="font-size:15px;font-weight:700;color:#dc2626;">
                ⚠️ มีงานด่วน ${urgentTasks.length} รายการ — กรุณาดำเนินการโดยเร็ว
            </div>
            ${urgentTasks.map(t =>
                `<div style="font-size:13px;color:#ef4444;margin-top:6px;">• ${t.task_title}</div>`
            ).join('')}
        </div>` : '';

    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<div style="max-width:680px;margin:24px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:28px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
                <td>
                    <div style="font-size:13px;color:#a5b4fc;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;">IT TASK REMINDER</div>
                    <div style="font-size:22px;font-weight:800;color:#ffffff;margin-bottom:4px;">📅 ${dateStr}</div>
                    <div style="font-size:13px;color:#c7d2fe;">ส่งเมื่อเวลา ${timeStr} น.</div>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                    <div style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50px;padding:10px 20px;display:inline-block;">
                        <div style="font-size:28px;font-weight:800;color:#ffffff;line-height:1;">${todayTasks.length}</div>
                        <div style="font-size:11px;color:#c7d2fe;font-weight:600;">งานวันนี้</div>
                    </div>
                </td>
            </tr>
        </table>
    </div>

    <!-- Summary Bar -->
    ${todayTasks.length > 0 ? `
    <div style="background:#f8fafc;padding:12px 32px;border-bottom:1px solid #e2e8f0;">
        ${typeSummary}
    </div>` : ''}

    <!-- Body -->
    <div style="background:#ffffff;padding:28px 32px;">
        ${urgentBanner}

        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px;">
            งานประจำวันนี้
        </div>

        ${taskCards}

        ${tomorrowTasks.length > 0 ? `
        <div style="margin-top:24px;">
            <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:12px;">
                งานพรุ่งนี้
            </div>
            ${tomorrowSection}
        </div>` : ''}
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.8;">
            <strong style="color:#6b7280;">IT Inventory Management System</strong><br>
            ส่งอัตโนมัติทุกวันจันทร์–ศุกร์ เวลา 08:00 น. &nbsp;·&nbsp; หากต้องการแก้ไขผู้รับ กรุณาติดต่อทีม IT
        </p>
    </div>

</div>
</body>
</html>`;
};

// ─── Main: ส่งอีเมลแจ้งเตือน ─────────────────────────────────────────────────
export const sendCalendarReminder = async () => {
    const recipients = process.env.CALENDAR_NOTIFY_EMAILS;
    if (!recipients) {
        console.warn('[CalendarEmail] CALENDAR_NOTIFY_EMAILS not set, skipping.');
        return { success: false, reason: 'No recipients configured' };
    }

    try {
        const [todayTasks, tomorrowTasks] = await Promise.all([
    getTodayTasks(),
    getTomorrowTasks(),
    
]);
if (todayTasks.length === 0) {
    console.log('[CalendarEmail] No tasks today, skipping email.');
    return { success: false, reason: 'No tasks today' };
}


        const now         = new Date();
        const dateShort   = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
        const hasUrgent   = todayTasks.some(t => t.task_type === 'urgent');
        const subject     = hasUrgent
            ? `⚠️ [IT Task] มีงานด่วน! — ${dateShort} (${todayTasks.length} งาน)`
            : `📅 [IT Task Reminder] — ${dateShort} (${todayTasks.length} งาน)`;

        const transporter = createTransporter();
        await transporter.sendMail({
            from:    `"IT CALENDAR" <${process.env.EMAIL_FROM || 'it-calendar@dci.daikin.co.jp'}>`,
            to:      recipients,   // คั่นด้วย comma เช่น "a@dci...,b@dci..."
            subject,
            html:    buildEmailHtml(todayTasks, tomorrowTasks),
        });

        console.log(`[CalendarEmail] Sent to ${recipients} — ${todayTasks.length} task(s)`);
        return { success: true, count: todayTasks.length, to: recipients };
    } catch (err) {
        console.error('[CalendarEmail] Error:', err.message);
        return { success: false, error: err.message };
    }
};