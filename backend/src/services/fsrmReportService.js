// ============================================================
//  fsrmReportService.js
//  ใช้ Worker Thread เพื่อไม่บล็อก main thread
//  FSRM Queue: ทีละ 1 job เท่านั้น
// ============================================================
import { Worker }      from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv            from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_FILE = join(__dirname, '../workers/fsrmWorker.js');

const FSRM_CONFIG = {
    FSRM_SERVER:   process.env.FSRM_SERVER      || '192.168.226.223',
    FSRM_USER:     process.env.FSRM_USER        || 'dci\\dciadmin',
    FSRM_PASS:     process.env.FSRM_PASS        || '',
    REPORT_PATH:   process.env.FSRM_REPORT_PATH || 'C:\\StorageReports\\Scheduled',
    REPORT_NAME:   process.env.FSRM_REPORT_NAME || 'File by Owner',
};

// ── FSRM Queue — 1 job at a time ─────────────────────────────
let fsrmLock = false;
const fsrmQueue = [];   // [{username, resolve, reject}]
const activeWorkers = {}; // { username: Worker }

const acquireLock = (username) => new Promise((resolve, reject) => {
    if (!fsrmLock) { fsrmLock = true; resolve(); }
    else fsrmQueue.push({ username, resolve, reject });
});

const releaseLock = () => {
    if (fsrmQueue.length > 0) {
        const next = fsrmQueue.shift();
        next.resolve();
    } else {
        fsrmLock = false;
    }
};

// ── Cancel ────────────────────────────────────────────────────
export const cancelJob = (username) => {
    // ถ้า worker กำลังรัน ส่ง cancel
    if (activeWorkers[username]) {
        activeWorkers[username].postMessage('cancel');
        activeWorkers[username].terminate().catch(() => {});
        delete activeWorkers[username];
        console.log(`[FSRM] Worker cancelled: ${username}`);
    }
    // ถ้าอยู่ใน queue ลบออก
    const idx = fsrmQueue.findIndex(q => q.username === username);
    if (idx !== -1) {
        const item = fsrmQueue.splice(idx, 1)[0];
        item.reject(new Error('CANCELLED'));
        console.log(`[FSRM] Queue cancelled: ${username}`);
    }
};

export const cancelAll = () => {
    Object.keys(activeWorkers).forEach(u => cancelJob(u));
    while (fsrmQueue.length > 0) {
        const item = fsrmQueue.shift();
        item.reject(new Error('CANCELLED'));
    }
    fsrmLock = false;
};

// ── Main: รัน Worker ──────────────────────────────────────────
export const getFilesFromLatestReport = async (username, onStep) => {
    const step = (msg) => { console.log(`[FSRM:${username}] ${msg}`); onStep?.(msg); };

    step('รอ FSRM ว่าง...');
    try {
        await acquireLock(username);
    } catch (err) {
        throw new Error('ยกเลิกโดยผู้ใช้');
    }

    return new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_FILE, {
            workerData: { username, fsrmConfig: FSRM_CONFIG },
        });

        activeWorkers[username] = worker;

        worker.on('message', (msg) => {
            if (msg.type === 'step') {
                step(msg.msg);
            } else if (msg.type === 'done') {
                delete activeWorkers[username];
                releaseLock();
                resolve({ files: msg.files, reportFile: msg.reportFile || '', htmlBase64: msg.htmlBase64 || null });
            } else if (msg.type === 'error') {
                delete activeWorkers[username];
                releaseLock();
                if (msg.error === 'CANCELLED') reject(new Error('ยกเลิกโดยผู้ใช้'));
                else reject(new Error(msg.error));
            }
        });

        worker.on('error', (err) => {
            delete activeWorkers[username];
            releaseLock();
            reject(err);
        });

        worker.on('exit', (code) => {
            if (code !== 0 && activeWorkers[username]) {
                delete activeWorkers[username];
                releaseLock();
                reject(new Error(`Worker exited: ${code}`));
            }
        });
    });
};

export const getFsrmQueueLength = () => fsrmQueue.length + (fsrmLock ? 1 : 0);
export const isFsrmBusy         = () => fsrmLock;
export const getActiveUsers     = () => Object.keys(activeWorkers);