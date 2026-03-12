import nodemailer from 'nodemailer';
import { sql, getPool } from '../config/db.js';

export const sendDailyReport = async () => {
    try {
        const pool = getPool();

        // 1. Low Stock Items
        const lowStockResult = await pool.request().query("SELECT ProductID, ProductName, CurrentStock, MinStock FROM dbo.Stock_Products WHERE CurrentStock <= MinStock AND MinStock >= 1 AND IsActive = 1");

        // 2. Pending POs
        const pendingPoResult = await pool.request().query(`
            SELECT 
                po.PO_ID, po.VendorName, po.RequestDate, po.DueDate, po.Status, po.PR_No, po.BudgetNo, po.DeliveryTo,
                (SELECT ISNULL(SUM(d.QtyOrdered), 0) FROM dbo.Stock_PODetails d WHERE d.PO_ID = po.PO_ID) as TotalOrdered,
                (SELECT ISNULL(SUM(d.QtyOrdered - d.QtyReceived), 0) FROM dbo.Stock_PODetails d WHERE d.PO_ID = po.PO_ID) as TotalRemaining
            FROM dbo.Stock_PurchaseOrders po 
            WHERE po.Status IN ('Open', 'Partial') 
            ORDER BY po.RequestDate
        `);

        // 2.1 Pending PO Details (Items)
        const pendingPoDetailsResult = await pool.request().query(`
            SELECT d.PO_ID, d.ItemName, d.QtyOrdered, ISNULL(d.QtyReceived, 0) as QtyReceived
            FROM dbo.Stock_PODetails d
            JOIN dbo.Stock_PurchaseOrders po ON d.PO_ID = po.PO_ID
            WHERE po.Status IN ('Open', 'Partial')
            ORDER BY d.PO_ID
        `);
        const poDetails = pendingPoDetailsResult.recordset;

        // 3. MA / Licenses
        const maResult = await pool.request().query(`
            SELECT m.ItemID, m.Category, m.SubType, m.ItemName, m.SerialNumber, m.EndDate, m.Status, v.VendorName
            FROM dbo.MA_Items m
            LEFT JOIN dbo.Stock_Vendors v ON m.VendorID = v.VendorID
            WHERE m.Status != 'Cancelled'
              AND m.EndDate IS NOT NULL
              AND DATEDIFF(day, GETDATE(), m.EndDate) <= 90
            ORDER BY m.EndDate ASC
        `);

        // --- กำหนดค่ากลางเพื่อให้ทั้งสองตารางเท่ากันพอดี ---
        const thStyle = `padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 13px; background-color: #f8fafc; color: #475569; white-space: nowrap;`;
        const tdStyle = `padding: 8px 12px; border: 1px solid #ddd; font-size: 13px;`;

        // Prepare Low Stock HTML
        let lowStockHtml = '';
        if (lowStockResult.recordset.length > 0) {
            const items = lowStockResult.recordset.map(item =>
                `<tr>
                    <td style="${tdStyle}">${item.ProductName}</td>
                    <td style="${tdStyle} text-align: center;">${item.CurrentStock}</td>
                    <td style="${tdStyle} text-align: center; color: red;">${item.MinStock}</td>
                 </tr>`
            ).join('');

            lowStockHtml = `
                <h3 style="color: #d9534f;">⚠️ Low Stock Alert</h3>
                <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px;">
                    <thead>
                        <tr style="background-color: #f8fafc; color: #475569;">
                            <th style="${thStyle}">Product</th> <th style="${thStyle} text-align: center; width: 80px;">Current</th>
                            <th style="${thStyle} text-align: center; width: 80px;">Min</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items}
                    </tbody>
                </table>
            `;
        }

        // Prepare Pending PO HTML (Card-based layout for better email rendering)
        let pendingPoHtml = '';
        if (pendingPoResult.recordset.length > 0) {
            const statusBadge = (status) => `<span style="background-color: ${status === 'Partial' ? '#fef3c7' : '#e0f2fe'}; color: ${status === 'Partial' ? '#d97706' : '#0284c7'}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${status}</span>`;

            const poCards = pendingPoResult.recordset.map(po => {
                const items = poDetails.filter(d => d.PO_ID === po.PO_ID);

                // Items table
                let itemsTableHtml = '';
                if (items.length > 0) {
                    const itemRows = items.map((i, idx) => `
                        <tr>
                            <td style="${tdStyle} text-align: center;">${idx + 1}</td>
                            <td style="${tdStyle}">${i.ItemName}</td>
                            <td style="${tdStyle} text-align: center;">${i.QtyOrdered}</td>
                            <td style="${tdStyle} text-align: center; color: ${i.QtyReceived < i.QtyOrdered ? '#d97706' : '#475569'}; font-weight: bold;">${i.QtyReceived}</td>
                            <td style="${tdStyle} text-align: center; color: ${(i.QtyOrdered - i.QtyReceived) > 0 ? 'red' : '#475569'}; font-weight: bold;">${i.QtyOrdered - i.QtyReceived}</td>
                        </tr>
                    `).join('');

                    itemsTableHtml = `
                        <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif;">
                            <thead>
                                <tr style="background-color: #f8fafc; color: #475569;">
                                    <th style="${thStyle} text-align: center; width: 30px;">#</th>
                                    <th style="${thStyle}">รายการสินค้า</th>
                                    <th style="${thStyle} text-align: center; width: 70px;">สั่งซื้อ</th>
                                    <th style="${thStyle} text-align: center; width: 70px;">รับแล้ว</th>
                                    <th style="${thStyle} text-align: center; width: 70px;">คงเหลือ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemRows}
                            </tbody>
                        </table>
                    `;
                }

                return `
                    <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 16px; border: 1px solid #ddd;">
                        <tr style="background-color: #f8fafc;">
                            <td style="padding: 10px 12px; border: 1px solid #ddd;" colspan="2">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="font-size: 13px; font-weight: bold; color: #475569;">
                                            📦 ${po.PO_ID} ${statusBadge(po.Status)}
                                        </td>
                                        <td style="text-align: right; font-size: 12px; color: #475569;">
                                            Due: ${po.DueDate ? new Date(po.DueDate).toLocaleDateString('th-TH') : '-'}
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; border: 1px solid #ddd;" colspan="2">
                                <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #475569;">
                                    <tr>
                                        <td style="padding: 2px 0;"><strong>Vendor:</strong> ${po.VendorName || '-'}</td>
                                        <td style="padding: 2px 0;"><strong>PR:</strong> ${po.PR_No || '-'}</td>
                                        <td style="padding: 2px 0;"><strong>Budget:</strong> ${po.BudgetNo || '-'}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 2px 0;"><strong>Delivery To:</strong> ${po.DeliveryTo || '-'}</td>
                                        <td style="padding: 2px 0;"><strong>สั่งทั้งหมด:</strong> ${po.TotalOrdered} ชิ้น</td>
                                        <td style="padding: 2px 0;"><strong>ค้างรับ:</strong> <span style="color: #d97706; font-weight: bold;">${po.TotalRemaining} ชิ้น</span></td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        ${items.length > 0 ? `
                        <tr>
                            <td style="padding: 8px 12px; border: 1px solid #ddd;" colspan="2">
                                ${itemsTableHtml}
                            </td>
                        </tr>
                        ` : ''}
                    </table>
                `;
            }).join('');

            pendingPoHtml = `
                <h3 style="color: #0284c7; margin-top: 20px;">📋 Pending Purchase Orders (${pendingPoResult.recordset.length} รายการ)</h3>
                ${poCards}
            `;
        }

        // Prepare MA/License HTML
        let maHtml = '';
        if (maResult.recordset.length > 0) {
            const maItems = maResult.recordset.map(ma => {
                const daysRemaining = Math.ceil((new Date(ma.EndDate) - new Date()) / (1000 * 60 * 60 * 24));
                const isExpired = daysRemaining <= 0;
                const statusColor = isExpired ? '#ef4444' : '#f59e0b'; // Red for expired, Amber for expiring
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

            maHtml = `
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
        }

        if (!lowStockHtml && !pendingPoHtml && !maHtml) {
            console.log('No updates to report.');
            return { success: true, message: 'No updates' };
        }

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.dci.daikin.co.jp',
            port: 25,
            secure: false,
            ignoreTLS: true,
            tls: { rejectUnauthorized: false }
        });

        // เปลี่ยน Subject เป็น Monthly Report และดึงเดือนปัจจุบัน
        const currentMonth = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

        const mailOptions = {
            from: '"IT INVENTORY" <it-inventory@dci.daikin.co.jp>',
            to: 'natthawut.y@dci.daikin.co.jp',
            subject: `IT Inventory Monthly Report - ${currentMonth}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 850px; margin: 0 auto;">
                    <h2 style="color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">IT Stock Monthly Report</h2>
                    ${lowStockHtml || '<p style="color: #666; font-style: italic;">No low stock items.</p>'}
                    ${pendingPoHtml || '<p style="color: #666; font-style: italic;">No pending POs.</p>'}
                    ${maHtml || '<p style="color: #666; font-style: italic;">No expiring MA/Licenses.</p>'}
                    <p style="margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
                        This is an automated message from IT Inventory Management System.
                    </p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error('Email Error Details:', error);
        return { success: false, error: error.message };
    }
};