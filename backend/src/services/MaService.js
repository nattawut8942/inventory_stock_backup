import nodemailer from 'nodemailer';
import { sql, getPool } from '../config/db.js';

export const sendMAReport = async () => {
    try {
        const pool = getPool();

        // 1. ดึงข้อมูลเฉพาะ MA / Licenses ที่ยังไม่ยกเลิก และจะหมดอายุภายใน 90 วัน
        const maResult = await pool.request().query(`
            SELECT m.ItemID, m.Category, m.SubType, m.ItemName, m.SerialNumber, m.EndDate, m.Status, v.VendorName
            FROM dbo.MA_Items m
            LEFT JOIN dbo.Stock_Vendors v ON m.VendorID = v.VendorID
            WHERE m.Status != 'Cancelled'
              AND m.EndDate IS NOT NULL
              AND DATEDIFF(day, GETDATE(), m.EndDate) <= 90
            ORDER BY m.EndDate ASC
        `);

        // --- กำหนด Style สำหรับตาราง ---
        const thStyle = `padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 13px; background-color: #f8fafc; color: #475569; white-space: nowrap;`;
        const tdStyle = `padding: 8px 12px; border: 1px solid #ddd; font-size: 13px;`;

        // 2. ตรวจสอบว่ามีข้อมูลหรือไม่
        if (maResult.recordset.length === 0) {
            console.log('No expiring MA/Licenses to report.');
            return { success: true, message: 'No updates' };
        }

        // 3. เตรียม HTML สำหรับตาราง MA
        const maItems = maResult.recordset.map(ma => {
            const daysRemaining = Math.ceil((new Date(ma.EndDate) - new Date()) / (1000 * 60 * 60 * 24));
            const isExpired = daysRemaining <= 0;
            const statusColor = isExpired ? '#ef4444' : '#f59e0b'; // แดงถ้าหมดแล้ว, ส้มถ้ากำลังจะหมด
            const statusText = isExpired ? 'Expired' : `${daysRemaining} Days`;

            return `<tr>
                <td style="${tdStyle}">${ma.Category}</td>
                <td style="${tdStyle}">${ma.VendorName || '-'}</td>
                <td style="${tdStyle}">${ma.ItemName}</td>
                <td style="${tdStyle}">${ma.SerialNumber || '-'}</td>
                <td style="${tdStyle} text-align: center;">${new Date(ma.EndDate).toLocaleDateString('th-TH')}</td>
                <td style="${tdStyle} text-align: center; color: ${statusColor}; font-weight: bold;">${statusText}</td>
             </tr>`;
        }).join('');

        const maHtml = `
            <h3 style="color: #f59e0b; margin-top: 20px;">⏳ MA & Contracts (Expiring Soon / Expired)</h3>
            <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px;">
                <thead>
                    <tr style="background-color: #f8fafc; color: #475569;">
                        <th style="${thStyle} width: 100px;">Category</th>
                        <th style="${thStyle}">Vendor</th>
                        <th style="${thStyle}">Item Name</th>
                        <th style="${thStyle} width: 120px;">S/N</th>
                        <th style="${thStyle} text-align: center; width: 100px;">End Date</th>
                        <th style="${thStyle} text-align: center; width: 80px;">Status</th>
                    </tr>
                </thead>
                <tbody>${maItems}</tbody>
            </table>
        `;

        // 4. ตั้งค่า Nodemailer
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.dci.daikin.co.jp',
            port: 25,
            secure: false,
            ignoreTLS: true,
            tls: { rejectUnauthorized: false }
        });

        const currentMonth = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

        const mailOptions = {
            from: '"IT INVENTORY" <it-inventory@dci.daikin.co.jp>',
            to: 'natthawut.y@dci.daikin.co.jp',
            subject: `IT MA & License Expiration Report - ${currentMonth}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 850px; margin: 0 auto;">
                    <h2 style="color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">IT Maintenance & License Report</h2>
                    <p style="font-size: 14px; color: #555;">รายการ MA และ License ที่กำลังจะหมดอายุภายใน 90 วัน:</p>
                    ${maHtml}
                    <p style="margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
                        This is an automated message from IT Inventory Management System.
                    </p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('MA Expiration Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error('MA Email Error Details:', error);
        return { success: false, error: error.message };
    }
};