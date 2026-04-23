import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';


// Config & Services
import { connectDB } from './src/config/db.js';
import { connectDciDB } from './src/config/dciDb.js';
import { sendDailyReport, sendMonthlyInventoryReport } from './src/services/emailService.js';

// Routes
import authRoutes from './src/routes/authRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import vendorRoutes from './src/routes/vendorRoutes.js';
import poRoutes from './src/routes/poRoutes.js';
import transactionRoutes from './src/routes/transactionRoutes.js';
import reportRoutes from './src/routes/reportRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import locationRoutes from './src/routes/locationRoutes.js';
import reasonRoutes from './src/routes/reasonRoutes.js';
import maRoutes from './src/routes/maRoutes.js';
import inkTonerRoutes from './src/routes/inkTonerRoutes.js';
import pcInventoryRoutes from './src/routes/pcInventoryRoutes.js'; // PC Inventory
import monitorInventoryRoutes from './src/routes/monitorInventoryRoutes.js'; // Monitor Inventory
import stockCountRoutes from './src/routes/stockCountRoutes.js';
import budgetRoutes from './src/routes/budgetRoutes.js'; // Added Budget Routes
import adRoutes from './src/routes/adRoutes.js';
import quotaRoutes from './src/routes/quotaRoutes.js';
// Setup Environment
import { cleanupStaleLogs } from './src/controllers/quotaController.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Static Files (Uploads)
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Database Connection & Init
const connectWithRetry = async (fn, name, retries = 5) => {
    for (let i = 0; i < retries; i++) {
        try {
            await fn();
            console.log(`[DB] ${name} connected`);
            return;
        } catch (err) {
            console.error(`[DB] ${name} failed (${i + 1}/${retries}):`, err.message);
            if (i < retries - 1) await new Promise(r => setTimeout(r, 5000));
        }
    }
    throw new Error(`${name} connection failed after ${retries} retries`);
};

const startServer = async () => {
    try {
        await connectWithRetry(connectDB, 'Main DB');
        await connectWithRetry(connectDciDB, 'DCI DB');

        // Routes
        app.use('/ITinventory/api', authRoutes);         // /api/authen
        app.use('/ITinventory/api', productRoutes);      // /api/products, /api/types, /api/forecast, /api/upload
        app.use('/ITinventory/api', vendorRoutes);       // /api/vendors
        app.use('/ITinventory/api', poRoutes);           // /api/pos
        app.use('/ITinventory/api', transactionRoutes);  // /api/transactions, /api/invoices, /api/receive
        app.use('/ITinventory/api', reportRoutes);       // /api/report/export, /api/test-email
        app.use('/ITinventory/api', userRoutes);         // /api/admin-users
        app.use('/ITinventory/api', locationRoutes);     // /api/locations
        app.use('/ITinventory/api', reasonRoutes);       // /api/reasons
        app.use('/ITinventory/api', maRoutes);            // /api/ma
        app.use('/ITinventory/api', inkTonerRoutes);      // /api/ink-toner
        app.use('/ITinventory/api', pcInventoryRoutes);   // /api/pc-inventory, etc.
        app.use('/ITinventory/api', monitorInventoryRoutes); // /api/mo-inventory, etc.
        app.use('/ITinventory/api', stockCountRoutes);    // /api/stock-count
        app.use('/ITinventory/api', budgetRoutes);        // /api/budget
        app.use('/ITinventory/api', adRoutes);
        app.use('/ITinventory/api', quotaRoutes);      // /api/quota

        cron.schedule('0 8 * * 1', async () => {
            console.log('Running Weekly report (Every Monday)...');
            await sendDailyReport();

            // ส่ง Quota Report
            try {
                const { buildList } = await import('./src/controllers/quotaController.js');
                const { sendQuotaReport } = await import('./src/services/quotaEmailService.js');
                const list = await buildList(false);
                const summary = {
                    total: list.length,
                    warning: list.filter(u => u.pctUsed >= 80 && u.pctUsed < 90).length,
                    critical: list.filter(u => u.pctUsed >= 90 && u.pctUsed < 100).length,
                    exceeded: list.filter(u => u.pctUsed >= 100).length,
                };
                await sendQuotaReport({ recipients: ['dci.is@dci.daikin.co.jp'], data: list, summary });
                console.log('[Cron] Quota report sent');
            } catch (err) {
                console.error('[Cron] Quota report failed:', err.message);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Bangkok"
        });

        // ส่งรายงานรายเดือน ทุกวันสิ้นเดือน เวลา 08:00 น
        cron.schedule('0 8 28-31 * *', async () => {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            // เช็คว่า "พรุ่งนี้" เป็นวันที่ 1 หรือไม่? 
            // ถ้าใช่ แสดงว่า "วันนี้" คือวันสุดท้ายของเดือน
            if (tomorrow.getDate() === 1) {
                console.log('Running monthly report (End of Month)...');
                await sendMonthlyInventoryReport();
            }
        }, {
            scheduled: true,
            timezone: "Asia/Bangkok"
        });

        cron.schedule('47 2 * * *', async () => {
            console.log('[Cron] Auto sync quota starting at 02:10 AM...');
            try {
                const { buildList } = await import('./src/controllers/quotaController.js');
                await buildList(true);
                console.log('[Cron] Quota sync done at:', new Date().toLocaleString());
            } catch (err) {
                console.error('[Cron] Quota sync failed:', err.message);
            }
        }, {
            scheduled: true,
            timezone: 'Asia/Bangkok'
        });

        // Error Handling Middleware
        app.use((err, req, res, next) => {
            console.error('Unhandled Error:', err.stack);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        });

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Uploads directory: ${uploadsDir}`);
        });

    } catch (err) {
        console.error('Failed to start server:', err);
    }
};
await cleanupStaleLogs();

startServer();
