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

// Setup Environment
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Static Files (Uploads)
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Database Connection & Init
const startServer = async () => {
    try {
        await connectDB();
        await connectDciDB();

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

        // Cron Job (Daily Low Stock Report at 07:00 AM)
        cron.schedule('0 8 * * 1', async () => {
            console.log('Running Weekly report (Every Monday)...');
            await sendDailyReport();
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

startServer();
