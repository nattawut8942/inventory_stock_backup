import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import fs from 'fs';
import { pingAll, checkAll } from './src/controllers/soundDeviceController.js';

// Config & Services
import { connectDB } from './src/config/db.js';
import { connectDciDB } from './src/config/dciDb.js'
import { connectHrmDB } from './src/config/hrmDb.js';;

import { connectItRequestDB } from './src/config/itRequestDb.js';
import { sendDailyReport, sendMonthlyInventoryReport } from './src/services/emailService.js';
import { sendCalendarReminder } from './src/services/calendarEmailService.js';

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
import pcInventoryRoutes from './src/routes/pcInventoryRoutes.js';
import monitorInventoryRoutes from './src/routes/monitorInventoryRoutes.js';
import stockCountRoutes from './src/routes/stockCountRoutes.js';
import budgetRoutes from './src/routes/budgetRoutes.js';
import adRoutes from './src/routes/adRoutes.js';
import quotaRoutes from './src/routes/quotaRoutes.js';
import { cleanupStaleLogs } from './src/controllers/quotaController.js';
import pcLocationRoutes from './src/routes/pcLocationRoutes.js';
import cctvRoutes from './src/routes/cctvRoutes.js';
import calendarRoutes from './src/routes/calendarRoutes.js';
import ipScanRoutes from './src/routes/ipScanRoutes.js';
import { runAllSubnets } from './auto_scan.js';
import itRequestRoutes from './src/routes/itRequestRoute.js';
import soundRoutes from './src/routes/soundRoutes.js';
import { connectSoundDB } from './src/config/soundDb.js';
import BorrowRoute from './src/routes/BorrowRoute.js';
import kbRoutes from './src/routes/kbRoutes.js';
import activityRoutes from './src/routes/activityRoutes.js';
import fileUpload from 'express-fileupload';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// ── Flag: Prevent duplicate monthly report ──────────────────────────────
let monthlyReportSent = false;

// ── สร้าง upload folders ถ้ายังไม่มี ────────────────────────────────────
const folders = [
    'uploads',
    'uploads/factory-layouts',
    'uploads/pc-images',
    'uploads/cctv-icons',
    'public',
    'public/kb-pdfs',
];
folders.forEach(f => {
    const dir = path.join(__dirname, f);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Server] Created missing directory: ${f}`);
    }
});

// ════════════════════════════════════════════════════════════════
// ✅ MIDDLEWARE - MUST BE BEFORE ROUTES!
// ════════════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ✅ FILE UPLOAD - CRITICAL! BEFORE ROUTES!
app.use(fileUpload({ 
    limits: { fileSize: 50 * 1024 * 1024 },
    useTempFiles: false,
    createParentPath: true,
    abortOnLimit: true,          // ← เพิ่ม
    responseOnLimit: 'ไฟล์ใหญ่เกินขนาดที่กำหนด (50MB)',   // ← เพิ่ม
}));

console.log('[Server] fileUpload middleware loaded ✓');

// ════════════════════════════════════════════════════════════════
// ✅ STATIC FILES
// ════════════════════════════════════════════════════════════════

const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

const publicDir = path.join(__dirname, 'public');
app.use('/public', express.static(publicDir));

// ✅ KB PDFs
// ✅ Serve ทั้ง 2 path
app.use('/kb-pdfs', express.static(path.join(__dirname, 'public/kb-pdfs')));
app.use('/ITinventory/kb-pdfs', express.static(path.join(__dirname, 'public/kb-pdfs')));
// ✅ Activity photos — เก็บบน network share
const activityUploadDir = process.env.ACTIVITY_UPLOAD_DIR
    || '\\\\W2kadth\\is\\Internal Use Only\\ActivityWorking';
app.use('/uploads/activity', express.static(activityUploadDir));
app.use('/ITinventory/uploads/activity', express.static(activityUploadDir));

// ── DB connection with retry ──────────────────────────────────────────────
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
        await connectWithRetry(connectItRequestDB, 'IT Request DB');
        await connectWithRetry(connectHrmDB, 'HRM DB');
        await connectWithRetry(connectSoundDB, 'Sound DB');

        // ════════════════════════════════════════════════════════════════
        // ✅ ROUTES (AFTER MIDDLEWARE!)
        // ════════════════════════════════════════════════════════════════
        
        app.use('/ITinventory/api', authRoutes);
        app.use('/ITinventory/api', productRoutes);
        app.use('/ITinventory/api', vendorRoutes);
        app.use('/ITinventory/api', poRoutes);
        app.use('/ITinventory/api', transactionRoutes);
        app.use('/ITinventory/api', reportRoutes);
        app.use('/ITinventory/api', userRoutes);
        app.use('/ITinventory/api', locationRoutes);
        app.use('/ITinventory/api', reasonRoutes);
        app.use('/ITinventory/api', maRoutes);
        app.use('/ITinventory/api', inkTonerRoutes);
        app.use('/ITinventory/api', pcInventoryRoutes);
        app.use('/ITinventory/api', monitorInventoryRoutes);
        app.use('/ITinventory/api', stockCountRoutes);
        app.use('/ITinventory/api', budgetRoutes);
        app.use('/ITinventory/api', adRoutes);
        app.use('/ITinventory/api', quotaRoutes);
        app.use('/ITinventory/api', pcLocationRoutes);
        app.use('/ITinventory/api', cctvRoutes);
        app.use('/ITinventory/api', calendarRoutes);
        app.use('/ITinventory/api', ipScanRoutes);
        app.use('/ITinventory/api', itRequestRoutes);
        app.use('/ITinventory/api/sound', soundRoutes);
        app.use('/ITinventory/api/borrowings', BorrowRoute);
        app.use('/api/pc-inventory', pcInventoryRoutes);
        app.use('/ITinventory/api/knowledge-base', kbRoutes);
        app.use('/ITinventory/api', activityRoutes); 

        // ── Cron: Weekly report (Monday 8 AM) ────────────────────────────
        cron.schedule('0 8 * * 1', async () => {
            console.log('Running Weekly report (Every Monday)...');
            await sendDailyReport();
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
        }, { scheduled: true, timezone: 'Asia/Bangkok' });

        // ── Cron: Monthly report (last day of month 8 AM) ────────────────
        cron.schedule('0 8 * * *', async () => {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            if (tomorrow.getDate() === 1 && !monthlyReportSent) {
                console.log('[Cron] Running monthly report (End of Month)...');
                try {
                    await sendMonthlyInventoryReport();
                    monthlyReportSent = true;  // ← Flag ปิด
                    console.log('[Cron] Monthly report sent successfully');
                } catch (err) {
                    console.error('[Cron] Monthly report failed:', err.message);
                }
            }

            // Reset flag ทุกวันที่ 1
            if (today.getDate() === 1) {
                monthlyReportSent = false;
            }
        }, { scheduled: true, timezone: 'Asia/Bangkok' });

        // ── Cron: Daily quota sync (9 AM) ────────────────────────────────
        cron.schedule('0 9 * * *', async () => {
            console.log('[Cron] Auto sync quota starting at 09:00 AM...');
            try {
                const { buildList } = await import('./src/controllers/quotaController.js');
                await buildList(true);
                console.log('[Cron] Quota sync done at:', new Date().toLocaleString());
            } catch (err) {
                console.error('[Cron] Quota sync failed:', err.message);
            }
        }, { scheduled: true, timezone: 'Asia/Bangkok' });

        // ── Cron: CCTV ping all (ทุก 15 นาที) ───────────────────────────
        cron.schedule('*/15 * * * *', async () => {
            try {
                const { pingAllCameras } = await import('./src/controllers/cctvController.js');
                await pingAllCameras({ body: {} }, { json: () => { } });
                console.log('[Cron] CCTV ping done at:', new Date().toLocaleString());
            } catch (err) {
                console.error('[Cron] CCTV ping failed:', err.message);
            }
        }, { scheduled: true, timezone: 'Asia/Bangkok' });

        cron.schedule('0 8 * * 1-5', async () => {
            console.log('[Cron] Sending calendar email reminder...');
            try {
                const result = await sendCalendarReminder();
                console.log('[Cron] Calendar reminder:', result);
            } catch (err) {
                console.error('[Cron] Calendar reminder failed:', err.message);
            }
        }, { scheduled: true, timezone: 'Asia/Bangkok' });

        cron.schedule('0 8,20 * * *', async () => {
            console.log('[Cron] IP Auto Scan starting...');
            try {
                await runAllSubnets();
            } catch (err) {
                console.error('[Cron] IP Scan failed:', err.message);
            }
        }, { scheduled: true, timezone: 'Asia/Bangkok' });

        // Error Handler
        app.use((err, req, res, next) => {
            console.error('Unhandled Error:', err.stack);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        });

        // ── Test Endpoints ────────────────────────────────────────────────

        app.post('/ITinventory/api/calendar/notify/test-email', async (req, res) => {
            try {
                const result = await sendCalendarReminder();
                res.json(result);
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        // ── Test: Send Daily Stock Report ─────────────────────────────────
        app.post('/ITinventory/api/test/send-daily-report', async (req, res) => {
            try {
                console.log('[Test] Sending Daily Stock Report...');
                await sendDailyReport();
                res.json({ success: true, message: 'Daily report sent successfully' });
            } catch (err) {
                console.error('[Test] Daily report failed:', err);
                res.status(500).json({ success: false, error: err.message });
            }
        });

        // ── Test: Send Monthly Inventory Report ───────────────────────────
        app.post('/ITinventory/api/test/send-monthly-report', async (req, res) => {
            try {
                console.log('[Test] Sending Monthly Inventory Report...');
                await sendMonthlyInventoryReport();
                res.json({ success: true, message: 'Monthly report sent successfully' });
            } catch (err) {
                console.error('[Test] Monthly report failed:', err);
                res.status(500).json({ success: false, error: err.message });
            }
        });

        app.listen(PORT, () => {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ Server is running on port ${PORT}`);
            console.log(`📁 Uploads directory: ${uploadsDir}`);
            console.log(`📁 KB PDFs directory: ${path.join(__dirname, 'public/kb-pdfs')}`);
            console.log(`${'='.repeat(60)}\n`);
        });

    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

// ─── Sound Layout Health Check (08:00 และ 14:00) ──────────────
cron.schedule('0 8,14 * * *', async () => {
    console.log(`[Sound Cron] Health check started: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
    try {
        const mockRes = (label) => ({
            json: (d) => console.log(`[Sound Cron] ${label}:`, JSON.stringify(d))
        });

        await pingAll({}, mockRes('Ping'));
        await checkAll({}, mockRes('HTTP'));

        console.log('[Sound Cron] Done ✓');
    } catch (err) {
        console.error('[Sound Cron] Error:', err.message);
    }
}, { timezone: 'Asia/Bangkok' });

await cleanupStaleLogs();
startServer();
