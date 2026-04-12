import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import { sql, getPool } from '../config/db.js';

// ==========================================================
// 1. ฟังก์ชันเดิม (Daily) - ห้ามปรับตารางและข้อมูลเดิม
// ==========================================================
export const sendDailyReport = async () => {
    try {
        const pool = getPool();

        // 1. Low Stock Items
        const lowStockResult = await pool.request().query(`
            SELECT ProductID, ProductName, CurrentStock, MinStock, MaxStock, 
                LastPrice, lead_time_days
            FROM dbo.Stock_Products 
            WHERE CurrentStock <= MinStock AND MinStock >= 1 AND IsActive = 1
        `);

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
            SELECT m.ItemID, m.Category, m.SubType, m.ItemName, m.SerialNumber, 
                m.ServiceNumber, m.StartDate, m.EndDate, m.Price, m.Status, 
                v.VendorName
            FROM dbo.MA_Items m
            LEFT JOIN dbo.Stock_Vendors v ON m.VendorID = v.VendorID
            WHERE m.Status != 'Cancelled'
            AND m.EndDate IS NOT NULL
            AND DATEDIFF(day, GETDATE(), m.EndDate) <= 60
            ORDER BY m.EndDate ASC
        `);

        const thStyle = `padding: 3px 14px; border: 1px solid #ddd; text-align: left; font-size: 12px; background-color: #f8fafc; color: #475569; white-space: nowrap;`;
        const tdStyle = `padding: 3px 14px; border: 1px solid #ddd; font-size: 12px;`;

        // Prepare Low Stock HTML
        let lowStockHtml = '';
        if (lowStockResult.recordset.length > 0) {
            const items = lowStockResult.recordset.map(item => {
                const reorderQty = Math.max((item.MaxStock || 0) - (item.CurrentStock || 0), 0);
                const price = item.LastPrice || 0;
                const total = reorderQty * price;
                const fmtPrice = price ? price.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-';
                const fmtTotal = total ? total.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-';
                const leadTime = item.lead_time_days ? `${item.lead_time_days} days` : '-';

                return `<tr>
                <td style="${tdStyle}">${item.ProductName}</td>
                <td style="${tdStyle} text-align: center;">${item.CurrentStock}</td>
                <td style="${tdStyle} text-align: center; color: red;">${item.MinStock}</td>
                <td style="${tdStyle} text-align: center; color: #d97706; font-weight: bold;">${reorderQty > 0 ? '+' + reorderQty : '-'}</td>
                <td style="${tdStyle} text-align: center;">${leadTime}</td>
                <td style="${tdStyle} text-align: right;">${fmtPrice}</td>
                <td style="${tdStyle} text-align: right; font-weight: bold; color: #0284c7;">${fmtTotal}</td>
            </tr>`;
            }).join('');

            const grandTotal = lowStockResult.recordset.reduce((sum, item) => {
                const reorderQty = Math.max((item.MaxStock || 0) - (item.CurrentStock || 0), 0);
                return sum + (reorderQty * (item.LastPrice || 0));
            }, 0);

            lowStockHtml = `
            <h3 style="color: #d9534f; font-size: 13px; margin-bottom: 6px;">⚠️ Low Stock Alert</h3>
            <table style="width: auto; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 4px;">
                <thead>
                    <tr>
                        <th style="${thStyle} min-width: 150px;">Product</th>
                        <th style="${thStyle} text-align: center; width: 55px;">Current</th>
                        <th style="${thStyle} text-align: center; width: 45px;">Min</th>
                        <th style="${thStyle} text-align: center; width: 80px;">To Order</th>
                        <th style="${thStyle} text-align: center; width: 90px;">Lead Time</th>
                        <th style="${thStyle} text-align: right; width: 90px;">Unit Price</th>
                        <th style="${thStyle} text-align: right; width: 80px;">Total</th>
                    </tr>
                </thead>
                <tbody>${items}</tbody>
                <tfoot>
                    <tr style="background-color: #f1f5f9;">
                        <td colspan="6" style="${tdStyle} text-align: right; font-size: 13px; font-weight: bold;">Total Amount to Order</td>
                        <td style="${tdStyle} text-align: right; font-weight: bold; color: #d9534f;">
                            ${grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                    </tr>
                </tfoot>
            </table>`;
        }

        // Prepare Pending PO HTML
        let pendingPoHtml = '';
        if (pendingPoResult.recordset.length > 0) {
            const statusBadge = (status) => `<span style="background-color: ${status === 'Partial' ? '#fef3c7' : '#e0f2fe'}; color: ${status === 'Partial' ? '#d97706' : '#0284c7'}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${status}</span>`;

            const poCards = pendingPoResult.recordset.map(po => {
                const items = poDetails.filter(d => d.PO_ID === po.PO_ID);
                let itemsTableHtml = '';
                if (items.length > 0) {
                    const itemRows = items.map((i, idx) => `
                        <tr>
                            <td style="${tdStyle} text-align: center;">${idx + 1}</td>
                            <td style="${tdStyle}">${i.ItemName}</td>
                            <td style="${tdStyle} text-align: center;">${i.QtyOrdered}</td>
                            <td style="${tdStyle} text-align: center; color: ${i.QtyReceived < i.QtyOrdered ? '#d97706' : '#475569'}; font-weight: bold;">${i.QtyReceived}</td>
                            <td style="${tdStyle} text-align: center; color: ${(i.QtyOrdered - i.QtyReceived) > 0 ? 'red' : '#475569'}; font-weight: bold;">${i.QtyOrdered - i.QtyReceived}</td>
                        </tr>`).join('');

                    itemsTableHtml = `
                        <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif;">
                            <thead>
                                <tr style="background-color: #f8fafc; color: #475569;">
                                    <th style="${thStyle} text-align: center; width: 30px;">#</th>
                                    <th style="${thStyle}">Item Name</th>
                                    <th style="${thStyle} text-align: center; width: 70px;">To Order</th>
                                    <th style="${thStyle} text-align: center; width: 70px;">Received</th>
                                    <th style="${thStyle} text-align: center; width: 70px;">Remaining</th>
                                </tr>
                            </thead>
                            <tbody>${itemRows}</tbody>
                        </table>`;
                }

                return `
                    <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 16px; border: 1px solid #ddd;">
                        <tr style="background-color: #f8fafc;">
                            <td style="padding: 10px 12px; border: 1px solid #ddd;" colspan="2">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="font-size: 13px; font-weight: bold; color: #475569;">📦 ${po.PO_ID} ${statusBadge(po.Status)}</td>
                                        <td style="text-align: right; font-size: 12px; color: #475569;">Due: ${po.DueDate ? new Date(po.DueDate).toLocaleDateString('th-TH') : '-'}</td>
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
                                        <td style="padding: 2px 0;"><strong>Total Ordered:</strong> ${po.TotalOrdered} units</td>
                                        <td style="padding: 2px 0;"><strong>Pending Receipt:</strong> <span style="color: #d97706; font-weight: bold;">${po.TotalRemaining} units</span></td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        ${items.length > 0 ? `<tr><td style="padding: 8px 12px; border: 1px solid #ddd;" colspan="2">${itemsTableHtml}</td></tr>` : ''}
                    </table>`;
            }).join('');

            pendingPoHtml = `<h3 style="color: #0284c7; margin-top: 20px;">📋 Pending Purchase Orders (${pendingPoResult.recordset.length} รายการ)</h3>${poCards}`;
        }

        // Prepare MA/License HTML
        let maHtml = '';
        if (maResult.recordset.length > 0) {
            const maItems = maResult.recordset.map(ma => {
                const daysRemaining = Math.ceil((new Date(ma.EndDate) - new Date()) / (1000 * 60 * 60 * 24));
                const isExpired = daysRemaining <= 0;
                const statusColor = isExpired ? '#ef4444' : '#f59e0b';
                const statusText = isExpired ? 'Expired' : `${daysRemaining} Days`;
                const price = ma.Price ? ma.Price.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-';

                return `<tr>
                    <td style="${tdStyle}">${ma.Category}</td>
                    <td style="${tdStyle}">${ma.SubType || '-'}</td>
                    <td style="${tdStyle}">${ma.VendorName || '-'}</td>
                    <td style="${tdStyle}">${ma.ItemName}</td>
                    <td style="${tdStyle}">${ma.SerialNumber || '-'}</td>
                    <td style="${tdStyle} text-align: center;">${ma.StartDate ? new Date(ma.StartDate).toLocaleDateString('th-TH') : '-'}</td>
                    <td style="${tdStyle} text-align: center;">${new Date(ma.EndDate).toLocaleDateString('th-TH')}</td>
                    <td style="${tdStyle} text-align: center; color: ${statusColor}; font-weight: bold;">${statusText}</td>
                    <td style="${tdStyle} text-align: right; font-weight: bold;">${price}</td>
                </tr>`;
            }).join('');

            maHtml = `
                <h3 style="color: #f59e0b; margin-top: 20px; font-size: 13px;">⏳ MA & Contracts (Expiring Soon / Expired)</h3>
                <table style="width: auto; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px;">
                    <thead>
                        <tr>
                            <th style="${thStyle} width: 80px;">Category</th>
                            <th style="${thStyle} width: 90px;">SubType</th>
                            <th style="${thStyle} width: 120px;">Vendor</th>
                            <th style="${thStyle} min-width: 140px;">Item Name</th>
                            <th style="${thStyle} width: 100px;">S/N</th>
                            <th style="${thStyle} text-align: center; width: 90px;">Start Date</th>
                            <th style="${thStyle} text-align: center; width: 90px;">End Date</th>
                            <th style="${thStyle} text-align: center; width: 80px;">Status</th>
                            <th style="${thStyle} text-align: right; width: 100px;">Total Value</th>
                        </tr>
                    </thead>
                    <tbody>${maItems}</tbody>
                </table>`;
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

        const currentMonth = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

        const mailOptions = {
            from: '"IT INVENTORY" <it-inventory@dci.daikin.co.jp>',
            to: 'dci.is@dci.daikin.co.jp',
            subject: `IT Inventory Weekly Report - ${currentMonth}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 850px; margin: 0 auto;">
                    <h2 style="color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">📦IT Stock Weekly Report</h2>
                    ${lowStockHtml || '<p style="color: #666; font-style: italic;">No low stock items.</p>'}
                    ${pendingPoHtml || '<p style="color: #666; font-style: italic;">No pending POs.</p>'}
                    ${maHtml || '<p style="color: #666; font-style: italic;">No expiring MA/Licenses.</p>'}
                    <p style="margin-top: 30px; font-size: 15px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
                        This is an automated message from IT Inventory Management System.<br/>
                        🔗 ดูข้อมูลเพิ่มเติม: <a href="http://dciweb.dci.daikin.co.jp/ITinventory/" style="color: #0284c7; text-decoration: none; font-weight: bold;">IT Inventory Management System</a>
                    </p>
                </div>`
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Daily Email sent successfully:', info.messageId);
        return { success: true };

    } catch (error) {
        console.error('Daily Email Error:', error);
        return { success: false, error: error.message };
    }
};

// ==========================================================
// 2. ฟังก์ชันใหม่ (Monthly) - เพิ่มรายการสรุป และไฟล์ Excel
// ==========================================================
export const sendMonthlyInventoryReport = async () => {
    try {
        const pool = getPool();
        const monthName = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

        // Query ข้อมูลสต็อกทั้งหมด
        const result = await pool.request().query(`
            SELECT 
                ProductID, ProductName, DeviceType, MinStock, MaxStock, 
                CurrentStock, LastPrice, UnitOfMeasure, Location, 
                business_priority, lead_time_days, priority_label,
                (CurrentStock * LastPrice) as TotalValue,
                CASE 
                    WHEN CurrentStock <= MinStock THEN (MaxStock - CurrentStock)
                    ELSE 0 
                END as ToOrderQty
            FROM [dbInfrastructure].[dbo].[Stock_Products]
            WHERE IsActive = 1
            ORDER BY business_priority ASC, DeviceType ASC, ProductName ASC
        `);
        const allStock = result.recordset;

        // คำนวณสรุป
        const lowStockItems = allStock.filter(item => item.CurrentStock <= item.MinStock && item.MinStock > 0);
        const totalValueAll = allStock.reduce((sum, item) => sum + (item.TotalValue || 0), 0);
        const totalToOrderValue = lowStockItems.reduce((sum, item) => sum + (item.ToOrderQty * (item.LastPrice || 0)), 0);

        // --- สร้างไฟล์ Excel (เหมือนเดิม) ---
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Inventory Full Report');
        worksheet.columns = [
            { header: 'Priority', key: 'priority', width: 12 },
            { header: 'Category', key: 'type', width: 15 },
            { header: 'Product Name', key: 'name', width: 35 },
            { header: 'Location', key: 'loc', width: 15 },
            { header: 'Current', key: 'current', width: 10 },
            { header: 'Min', key: 'min', width: 10 },
            { header: 'To Order', key: 'order', width: 10 },
            { header: 'Unit', key: 'unit', width: 10 },
            { header: 'Price', key: 'price', width: 12 },
            { header: 'Total Value', key: 'total', width: 15 },
            { header: 'Lead Time (Days)', key: 'lt', width: 15 }
        ];
        allStock.forEach(item => {
            const row = worksheet.addRow({
                priority: item.priority_label, type: item.DeviceType, name: item.ProductName, loc: item.Location,
                current: item.CurrentStock, min: item.MinStock, order: item.ToOrderQty, unit: item.UnitOfMeasure,
                price: item.LastPrice, total: item.TotalValue, lt: item.lead_time_days
            });
            if (item.CurrentStock <= item.MinStock) {
                row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } }; });
                row.getCell('current').font = { color: { argb: 'FFFF0000' }, bold: true };
            }
        });
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        const excelBuffer = await workbook.xlsx.writeBuffer();

        // --- เตรียมตาราง HTML (ปรับ Style ให้เหมือน Daily เป๊ะๆ) ---
        const thStyle = `padding: 4px 14px; border: 1px solid #ddd; text-align: left; font-size: 12px; background-color: #f8fafc; color: #475569; white-space: nowrap;`;
        const tdStyle = `padding: 4px 14px; border: 1px solid #ddd; font-size: 12px;`;

        const lowStockRows = lowStockItems.map(item => {
            const price = item.LastPrice || 0;
            const total = item.ToOrderQty * price;
            const fmtPrice = price ? price.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-';
            const fmtTotal = total ? total.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-';
            const leadTime = item.lead_time_days ? `${item.lead_time_days} days` : '-';

            return `<tr>
                <td style="${tdStyle}">${item.ProductName}</td>
                <td style="${tdStyle} text-align: center;">${item.CurrentStock}</td>
                <td style="${tdStyle} text-align: center; color: red;">${item.MinStock}</td>
                <td style="${tdStyle} text-align: center; color: #d97706; font-weight: bold;">${item.ToOrderQty > 0 ? '+' + item.ToOrderQty : '-'}</td>
                <td style="${tdStyle} text-align: center;">${leadTime}</td>
                <td style="${tdStyle} text-align: right;">${fmtPrice}</td>
                <td style="${tdStyle} text-align: right; font-weight: bold; color: #0284c7;">${fmtTotal}</td>
            </tr>`;
        }).join('');

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.dci.daikin.co.jp',
            port: 25,
            secure: false,
            ignoreTLS: true,
            tls: { rejectUnauthorized: false }
        });

        await transporter.sendMail({
            from: '"IT INVENTORY" <it-inventory@dci.daikin.co.jp>',
            to: 'dci.is@dci.daikin.co.jp',
            subject: `📊 IT Monthly Inventory & Reorder Report - ${monthName}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 950px; margin: 0 auto; color: #1e293b; line-height: 1.5;">
                    <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;"> 
                        <h2 style="color: #0f172a; border-bottom: 3px solid #3b82f6; padding-bottom: 12px;">📦 IT Stock Monthly Summary</h2>
                        
                        <p style="font-size: 20px; margin-bottom: 18px; margin-top: 10px; ">สรุปรายการสินค้าที่ต้องสั่งซื้อและสถานะสต็อกประจำเดือน <strong>${monthName}</strong> รายละเอียดตามตารางด้านล่างนี้:</p>

                        <h3 style="color: #dc2626; font-size: 16px; margin-bottom: 10px; display: flex; align-items: center;">⚠️ Low Stock Alert (สินค้าที่ต้องรีบสั่งซื้อ)</h3>
                    <table style="width: auto; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 4px;">
                        <thead>
                            <tr>
                                <th style="${thStyle} min-width: 150px;">Product</th>
                                <th style="${thStyle} text-align: center; width: 55px;">Current</th>
                                <th style="${thStyle} text-align: center; width: 45px;">Min</th>
                                <th style="${thStyle} text-align: center; width: 80px;">To Order</th>
                                <th style="${thStyle} text-align: center; width: 90px;">Lead Time</th>
                                <th style="${thStyle} text-align: right; width: 90px;">Unit Price</th>
                                <th style="${thStyle} text-align: right; width: 80px;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lowStockRows || '<tr><td colspan="7" style="text-align:center; padding:10px;">No low stock items this month.</td></tr>'}
                        </tbody>
                        <tfoot>
                            <tr style="background-color: #f1f5f9;">
                                <td colspan="6" style="${tdStyle} text-align: right; font-size: 13px; font-weight: bold;">Total Amount to Order</td>
                                <td style="${tdStyle} text-align: right; font-weight: bold; color: #d9534f;">
                                    ${totalToOrderValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                    <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
                        <table style="border-collapse: collapse; font-family: Arial, sans-serif;">
                            <tr style="background-color: #f1f5f9;">
                                <td style="${tdStyle} text-align: right; font-size: 15px; font-weight: bold;">📦 มูลค่าสต็อคทั้งหมด (All Stock Value)</td>
                                <td style="${tdStyle} text-align: right; font-weight: bold; color: #0284c7; min-width: 120px;">
                                    ${totalValueAll.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                                </td>
                            </tr>
                            <tr style="background-color: #fef2f2;">
                                <td style="${tdStyle} text-align: right; font-size: 15px; font-weight: bold;">🛒 มูลค่าที่ต้องสั่งซื้อ (Total to Order)</td>
                                <td style="${tdStyle} text-align: right; font-weight: bold; color: #d9534f; min-width: 120px;">
                                    ${totalToOrderValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                                </td>
                            </tr>
                        </table>
                    </div>
                    <div style="margin-top: 20px; background: #eff6ff; padding: 12px; border-radius: 4px; border-left: 4px solid #3b82f6;">
                        <p style="margin: 0; font-size: 18px; color: #1e40af;">
                            <strong>หมายเหตุ:</strong> ข้อมูลสต็อกทั้งหมด (รวมสินค้าที่มีสถานะปกติ) ได้ถูกแนบมาในไฟล์ Excel พร้อมรายงานฉบับนี้แล้ว
                        </p>
                    </div>

                    <p style="margin-top: 30px; font-size: 15px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
                        This is an automated monthly report from IT Inventory Management System.<br/>
                        🔗 ดูข้อมูลเพิ่มเติม: <a href="http://dciweb.dci.daikin.co.jp/ITinventory/" style="color: #0284c7; text-decoration: none; font-weight: bold;">IT Inventory Management System</a>
                    </p>
                </div>`,
            attachments: [
                {
                    filename: `IT_Inventory_Monthly_Report_${new Date().toISOString().split('T')[0]}.xlsx`,
                    content: excelBuffer
                }
            ]
        });

        console.log('Monthly Email sent successfully with Excel and Daily Style table');
        return { success: true };
    } catch (error) {
        console.error('Monthly Email Error:', error);
        return { success: false, error: error.message };
    }
};