// ============================================================
//  quotaEmailService.js — Outlook Classic Compatible
//  ใช้ table-based layout ทั้งหมด (Outlook ไม่รองรับ flexbox)
// ============================================================
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const createTransporter = () => nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.dci.daikin.co.jp',
    port: Number(process.env.SMTP_PORT || 25),
    secure: false,
    ignoreTLS: true,
    tls: { rejectUnauthorized: false },
});

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const statusConfig = pct => {
    if (pct >= 100) return { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', badge: '#dc2626', label: 'เต็มความจุ' };
    if (pct >= 90) return { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', badge: '#ea580c', label: 'วิกฤต' };
    if (pct >= 80) return { color: '#d97706', bg: '#fffbeb', border: '#fde68a', badge: '#d97706', label: 'เตือน' };
    return { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', badge: '#16a34a', label: 'ปกติ' };
};

// ── Warning Email ─────────────────────────────────────────
export const sendQuotaWarning = async (u, files = []) => {
    const s = statusConfig(u.pctUsed);
    const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
    const barW = Math.min(u.pctUsed || 0, 100);

    // ── File list rows ──
    const fileRows = files.slice(0, 20).map((f, i) => `
        <tr bgcolor="${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
            <td width="30" align="center" style="padding:7px 10px; font-size:11px; color:#94a3b8; border-bottom:1px solid #f1f5f9;">${i + 1}</td>
            <td style="padding:7px 10px; font-size:14px; font-weight:bold; color:#1e293b; border-bottom:1px solid #f1f5f9;">${esc(f.filename)}</td>
            <td width="80" align="right" style="padding:7px 10px; font-size:12px; font-weight:bold; color:#d97706; border-bottom:1px solid #f1f5f9; white-space:nowrap;">${esc(f.size)}</td>
            <td style="padding:7px 10px; font-size:11px; color:#64748b; font-family:Consolas,monospace; border-bottom:1px solid #f1f5f9; word-break:break-all; min-width:300px;">${esc(f.unc || f.path)}</td>
        </tr>`).join('');

    const fileSection = files.length === 0 ? '' : `
        <!--[if true]><table width="100%" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px; border-collapse:collapse;">
            <tr>
                <td style="padding:0 0 10px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="padding:10px 14px; background:#f59e0b; border-radius:6px 6px 0 0;">
                                <span style="font-size:15px; font-weight:bold; color:#ffffff;">📁 รายการไฟล์ขนาดใหญ่ที่สุด ( ${files.length} ไฟล์)</span>
                            </td>
                        </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0; border-top:none; border-radius:0 0 6px 6px;">
                        <tr bgcolor="#f8fafc">
                            <td width="30" align="center" style="padding:8px 10px; font-size:12px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">#</td>
                            <td style="padding:8px 10px; font-size:12px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">ชื่อไฟล์</td>
                            <td width="80" align="right" style="padding:8px 10px; font-size:12px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">ขนาด</td>
                            <td style="padding:8px 10px; font-size:12px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">Path</td>
                        </tr>
                        ${fileRows}
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
                        <tr>
                            <td style="padding:12px 16px; background:#eff6ff; border-left:4px solid #3b82f6; border-radius:0 6px 6px 0;">
                                <span style="font-size:17px; color:#1e40af; line-height:1.6;">
                                    💡 <strong>คำแนะนำ:</strong> กรุณาตรวจสอบและลบไฟล์ที่ไม่จำเป็นในรายการข้างต้น เพื่อเพิ่มพื้นที่ว่าง
                                </span>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        <!--[if true]></td></tr></table><![endif]-->`;

    const html = `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!--[if gte mso 9]>
<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:#f1f5f9; font-family:'Segoe UI',Tahoma,Arial,sans-serif; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
</style>
</head>
<body bgcolor="#f1f5f9" style="margin:0; padding:0;">

<!-- Wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9">
<tr><td align="center" style="padding:24px 8px;">

  <!-- Main Card -->
  <table width="900" cellpadding="0" cellspacing="0" style="max-width:900px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;">

    <!-- Header Banner -->
    <tr>
      <td bgcolor="#1e3a8a" style="padding:28px 32px; background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <div style="font-size:11px; color:#93c5fd; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">DCI — Share Center</div>
              <div style="font-size:22px; font-weight:800; color:#ffffff; line-height:1.2;">⚠️ แจ้งเตือนพื้นที่จัดเก็บ</div>
            </td>
            <td align="right" valign="middle">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${s.badge}; padding:8px 18px; border-radius:99px;">
                    <span style="font-size:13px; font-weight:bold; color:#ffffff;">${s.label}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Status Bar -->
    <tr>
      <td bgcolor="${s.bg}" style="padding:16px 32px; border-bottom:3px solid ${s.color};">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <span style="font-size:15px; color:#475569; font-weight:600;">การใช้งานปัจจุบัน</span>
            </td>
            <td align="right">
              <span style="font-size:32px; font-weight:900; color:${s.color}; font-family:Consolas,monospace;">${u.pctUsed}%</span>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top:10px;">
              <!-- Progress Bar (Outlook VML) -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#e2e8f0" style="border-radius:99px; height:10px; overflow:hidden;">
                    <!--[if gte mso 9]>
                    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fillcolor="${s.color}" stroked="false" style="width:${barW}%;height:10px;"></v:rect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <table width="${barW}%" cellpadding="0" cellspacing="0">
                      <tr><td bgcolor="${s.color}" style="height:10px; border-radius:99px; font-size:0; line-height:0;">&nbsp;</td></tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:28px 32px;">

        <!-- Greeting -->
        <p style="margin:0 0 20px; font-size:17px; color:#1e293b; line-height:1.7;">
          สวัสดีคุณ <strong>${esc(u.name || u.username)}</strong>,<br>
          พื้นที่จัดเก็บไฟล์บน Share Center ของคุณถูกใช้งานไปแล้ว
          <strong style="color:${s.color};">${u.pctUsed}%</strong>
          กรุณาตรวจสอบและลบไฟล์ที่ไม่จำเป็นออก
        </p>

        <!-- Usage Stats Box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; font-family: sans-serif;">
            <tr bgcolor="#f8fafc">
                <td style="padding:10px 16px; font-size:17px; font-weight:800; color:#1e293b; text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid #e2e8f0;" colspan="2">สรุปการใช้งาน</td>
            </tr>
            <tr>
                <td style="padding:12px 16px; font-size:17px; color:#1e293b; border-bottom:1px solid #f1f5f9; width:50%;">📊 พื้นที่ที่ใช้ไป</td>
                <td style="padding:12px 16px; font-size:17px; font-weight:800; color:#1e293b; border-bottom:1px solid #f1f5f9; text-align:right;">${esc(u.sizeUsedFmt || '—')}</td>
            </tr>
            <tr bgcolor="#f8fafc">
                <td style="padding:12px 16px; font-size:17px; color:#1e293b; border-bottom:1px solid #f1f5f9;">📦 โควต้าทั้งหมด</td>
                <td style="padding:12px 16px; font-size:17px; font-weight:800; color:#1e293b; border-bottom:1px solid #f1f5f9; text-align:right;">${esc(u.sizeLimitFmt || '—')}</td>
            </tr>
            <tr>
                <td style="padding:12px 16px; font-size:17px; color:#1e293b;">📈 การใช้งาน</td>
                <td style="padding:12px 16px; font-size:17px; font-weight:900; color:#000000; text-align:right; font-family:Consolas,monospace;">${u.pctUsed}%</td>
            </tr>
            </table>

        ${fileSection}

        <!-- Footer Info -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px; border-top:1px solid #f1f5f9; padding-top:16px;">
          <tr>
            <td style="padding-top:14px; font-size:15px; color:#94a3b8; line-height:1.8;">
              👤 <strong style="color:#64748b;">Username:</strong> <span style="font-family:Consolas,monospace;">${esc(u.username)}</span>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              📧 <strong style="color:#64748b;">Email:</strong> ${esc(u.email || '—')}
              &nbsp;&nbsp;|&nbsp;&nbsp;
              🕐 <strong style="color:#64748b;">เวลา:</strong> ${now}
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- Email Footer -->
    <tr>
      <td bgcolor="#f8fafc" style="padding:16px 32px; border-top:1px solid #e2e8f0; text-align:center;">
        <p style="margin:0; font-size:15px; color:#94a3b8; line-height:1.6;">
          อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ Share Center Resource Manager<br>
          <strong style="color:#64748b;">ฝ่าย IT — Daikin Compressor Industries</strong>
        </p>
      </td>
    </tr>

  </table>
  <!-- /Main Card -->

</td></tr>
</table>
<!-- /Wrapper -->

</body>
</html>`;

    const transporter = createTransporter();
    const info = await transporter.sendMail({
        from: '"REPORT FILE SHARE CENTER" <it-file_share@dci.daikin.co.jp>',
        to: u.email,
        cc: process.env.EMAIL_CC || '',
        subject: `=?UTF-8?B?${Buffer.from(`⚠️ [${s.label}] พื้นที่ใช้งาน ${u.pctUsed}% — ${u.name || u.username}`).toString('base64')}?=`,
        html,
        encoding: 'utf8',
    });
    console.log(`✉️  Warning sent → ${u.email} (${u.pctUsed}%)`);
    return info;
};

// ── สร้าง Excel buffer ────────────────────────────────────
const createQuotaExcel = async (warningList) => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Quota Report');

    ws.columns = [
        { header: 'Username',    key: 'username',    width: 20 },
        { header: 'ชื่อ',        key: 'name',        width: 30 },
        { header: 'Email',       key: 'email',       width: 35 },
        { header: 'ใช้ไป',       key: 'sizeUsedFmt', width: 15 },
        { header: 'โควต้า',      key: 'sizeLimitFmt',width: 15 },
        { header: '% การใช้งาน', key: 'pctUsed',     width: 15 },
        { header: 'สถานะ',       key: 'status',      width: 15 },
    ];

    ws.getRow(1).eachCell(cell => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border    = { bottom: { style: 'medium', color: { argb: 'FF3B82F6' } } };
    });
    ws.getRow(1).height = 28;

    warningList.forEach((u, i) => {
        const row = ws.addRow({
            username:    u.username,
            name:        u.name        || '—',
            email:       u.email       || '—',
            sizeUsedFmt: u.sizeUsedFmt || '—',
            sizeLimitFmt:u.sizeLimitFmt|| '—',
            pctUsed:     u.pctUsed,
            status:      u.pctUsed >= 100 ? 'เต็มความจุ' :
                         u.pctUsed >= 90  ? 'วิกฤต' :
                         u.pctUsed >= 80  ? 'เตือน' : 'ปกติ',
        });
        const bg = i % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
        row.eachCell(cell => {
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.alignment = { vertical: 'middle' };
        });
        const color = u.pctUsed >= 100 ? 'FFDC2626' :
                      u.pctUsed >= 90  ? 'FFEA580C' :
                      u.pctUsed >= 80  ? 'FFD97706' : 'FF16A34A';
        row.getCell('pctUsed').font      = { bold: true, color: { argb: color } };
        row.getCell('pctUsed').alignment = { horizontal: 'right' };
        row.getCell('status').font       = { bold: true, color: { argb: color } };
    });

    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return wb.xlsx.writeBuffer();
};

// ── Admin Report Email ────────────────────────────────────
export const sendQuotaReport = async ({ recipients, data = [], summary = {} }) => {
    const monthName = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const warningList = [...data].filter(u => u.pctUsed >= 80).sort((a, b) => b.pctUsed - a.pctUsed);

    const detailRows = warningList.slice(0, 60).map((u, i) => {
        const s = statusConfig(u.pctUsed);
        return `<tr bgcolor="${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
            <td style="padding:9px 12px; font-size:11px; font-family:Consolas,monospace; font-weight:bold; color:#4f46e5; border-bottom:1px solid #f1f5f9;">${esc(u.username)}</td>
            <td style="padding:9px 12px; font-size:12px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${esc(u.name || '—')}</td>
            <td style="padding:9px 12px; font-size:11px; color:#64748b; border-bottom:1px solid #f1f5f9;">${esc(u.email || '—')}</td>
            <td align="right" style="padding:9px 12px; font-size:12px; font-weight:bold; color:#1e293b; border-bottom:1px solid #f1f5f9; white-space:nowrap;">${esc(u.sizeUsedFmt || '—')}</td>
            <td align="right" style="padding:9px 12px; font-size:12px; color:#94a3b8; border-bottom:1px solid #f1f5f9; white-space:nowrap;">${esc(u.sizeLimitFmt || '—')}</td>
            <td align="center" style="padding:9px 12px; font-size:13px; font-weight:900; color:${s.color}; border-bottom:1px solid #f1f5f9; font-family:Consolas,monospace;">${u.pctUsed}%</td>
            <td align="center" style="padding:9px 12px; border-bottom:1px solid #f1f5f9;">
                <span style="background:${s.bg}; color:${s.color}; border:1px solid ${s.border}; font-size:13px; font-weight:bold; padding:3px 10px; border-radius:99px;">${s.label}</span>
            </td>
        </tr>`;
    }).join('');
    

    const statCards = [
        { label: 'ผู้ใช้ทั้งหมด', value: summary.total ?? data.length, color: '#1e293b', bg: '#f8fafc', border: '#e2e8f0' },
        { label: 'ใกล้เต็ม (≥80%)', value: summary.warning ?? 0, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
        { label: 'วิกฤต (≥90%)', value: summary.critical ?? 0, color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
        { label: 'เต็มแล้ว (100%)', value: summary.exceeded ?? 0, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    ].map(c => `
        <td width="25%" style="padding:0 6px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${c.border}; border-radius:8px; overflow:hidden;">
                <tr bgcolor="${c.bg}">
                    <td align="center" style="padding:14px 10px;">
                        <div style="font-size:18px; color:${c.color}; font-weight:bold; margin-bottom:6px; text-transform:uppercase;">${c.label}</div>
                        <div style="font-size:26px; font-weight:900; color:${c.color}; font-family:Consolas,monospace;">${c.value}</div>
                    </td>
                </tr>
            </table>
        </td>`).join('');

    const html = `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<style>
  body { margin:0; padding:0; background-color:#f1f5f9; font-family:'Segoe UI',Tahoma,Arial,sans-serif; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
</style>
</head>
<body bgcolor="#f1f5f9">

<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9">
<tr><td align="center" style="padding:24px 8px;">

  <table width="1000" cellpadding="0" cellspacing="0" style="max-width:1000px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;">

    <!-- Header -->
    <tr>
      <td bgcolor="#0f172a" style="padding:28px 32px; border-bottom:4px solid #3b82f6;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <div style="font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">DAIKIN COMPRESSOR INDUSRIES — IT Share Center</div>
              <div style="font-size:22px; font-weight:800; color:#ffffff;">📊 Quota Usage Report</div>
              <div style="font-size:15px; color:#94a3b8; margin-top:4px;">ประจำเดือน ${monthName} · ${warningList.length} รายการต้องดำเนินการ</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:24px 32px;">

        <!-- Stat Cards -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>${statCards}</tr>
        </table>

        <!-- Table Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
          <tr>
            <td style="padding:10px 14px; background:#1e293b; border-radius:6px 6px 0 0;">
              <span style="font-size:15px; font-weight:bold; color:#ffffff;">⚠️ รายชื่อที่ต้องดำเนินการ (${warningList.length} คน)</span>
            </td>
          </tr>
        </table>

        <!-- Detail Table -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0; border-radius:0 0 6px 6px; overflow:hidden;">
          <tr bgcolor="#f8fafc">
            <td style="padding:9px 12px; font-size:10px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">Username</td>
            <td style="padding:9px 12px; font-size:13px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">ชื่อ</td>
            <td style="padding:9px 12px; font-size:10px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">Email</td>
            <td align="right" style="padding:9px 12px; font-size:15px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">ใช้ไป</td>
            <td align="right" style="padding:9px 12px; font-size:13px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">โควต้า</td>
            <td align="center" style="padding:9px 12px; font-size:13px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">%</td>
            <td align="center" style="padding:9px 12px; font-size:15px; font-weight:bold; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">สถานะ</td>
          </tr>
          ${detailRows || `<tr><td colspan="7" align="center" style="padding:24px; color:#94a3b8; font-size:15px;">ไม่มีผู้ใช้ที่ใกล้เต็ม</td></tr>`}
        </table>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td bgcolor="#f8fafc" style="padding:16px 32px; border-top:1px solid #e2e8f0; text-align:center;">
        <strong style="color:#3b82f6;">แนบไฟล์ Excel รายการทั้งหมดมาพร้อมอีเมลฉบับนี้แล้ว</strong><br><br>

          อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ Share Center Resource Manager<br>
          <strong style="color:#64748b;">ฝ่าย IT — Daikin Compressor Industries</strong>
        </p>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

    const transporter = createTransporter();
    const excelBuffer = await createQuotaExcel(warningList);
    const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');

const info = await transporter.sendMail({
    from: '"FILE SHARE CENTER" <it-file_share@dci.daikin.co.jp>',
    to: recipients.join(', '),
    subject: `=?UTF-8?B?${Buffer.from(`📋 Quota Report — ${monthName} (${warningList.length} รายการต้องดูแล)`).toString('base64')}?=`,
    html,
    encoding: 'utf8',
    attachments: [{
        filename: `QuotaReport_${dateStr}.xlsx`,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
});



   console.log(`📋 Report sent → ${recipients.join(', ')}`);
    return info;
};