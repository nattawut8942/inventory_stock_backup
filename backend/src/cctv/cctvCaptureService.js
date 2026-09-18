import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { sql, getPool } from '../config/db.js';

const execAsync = promisify(exec);

// ── Credential Profiles (จาก CameraData.cs) ──────────────────────────────
const MOBOTIX_IPS = new Set([
    '192.168.66.17','192.168.66.18',
    '192.168.67.17','192.168.67.22','192.168.67.23','192.168.67.70',
    '192.168.66.231','192.168.66.232','192.168.66.20'
]);
const HIKVISION_IPS = new Set(['192.168.4.4','192.168.67.60']);
const ADVIDIA_IPS   = new Set([
    '192.168.66.2','192.168.66.3','192.168.66.16','192.168.66.35',
    '192.168.66.43','192.168.66.47','192.168.66.70','192.168.67.8'
]);

function encodeCredential(s) {
    if (!s) return s || '';
    return s.replace(/%/g,'%25').replace(/@/g,'%40').replace(/#/g,'%23')
            .replace(/:/g,'%3A').replace(/\?/g,'%3F').replace(/ /g,'%20');
}

function buildUrl(proto, ip, user, pass, urlPath) {
    const auth = user ? `${encodeCredential(user)}:${encodeCredential(pass)}@` : '';
    const p    = urlPath ? `/${urlPath}` : '';
    return proto === 'http'
        ? `http://${auth}${ip}${p}`
        : `rtsp://${auth}${ip}:554${p}`;
}

function getCredentials(ip) {
    const PAN_PATH = 'cam/realmonitor?channel=1&subtype=1';

    if (MOBOTIX_IPS.has(ip)) return [
        { user:'admin', pass:'meinsm', path:'record/current.jpg',              proto:'http' },
        { user:'admin', pass:'meinsm', path:'cgi-bin/faststream.jpg',          proto:'http' },
        { user:'admin', pass:'meinsm', path:'record/current.jpg?size=640x480', proto:'http' },
        { user:'',      pass:'',       path:'record/current.jpg',              proto:'http' },
    ];

    if (ip === '192.168.66.55') return [
        { user:'root', pass:'admin', path:'axis-media/media.amp', proto:'rtsp' },
        { user:'root', pass:'admin', path:'live/ch00_0',          proto:'rtsp' },
        { user:'root', pass:'admin', path:'stream1',              proto:'rtsp' },
    ];

    if (HIKVISION_IPS.has(ip)) return [
        { user:'admin', pass:'Admin12345', path:'Streaming/Channels/101', proto:'rtsp' },
        { user:'admin', pass:'Admin12345', path:'Streaming/Channels/102', proto:'rtsp' },
        { user:'admin', pass:'12345',      path:'Streaming/Channels/101', proto:'rtsp' },
    ];

    if (ip === '192.168.66.120') return [
        { user:'admin', pass:'Admin12345', path:'stream1', proto:'rtsp' },
        { user:'admin', pass:'Admin12345', path:'live',    proto:'rtsp' },
        { user:'admin', pass:'',           path:'stream1', proto:'rtsp' },
        { user:'admin', pass:'',           path:'',        proto:'rtsp' },
    ];

    if (ADVIDIA_IPS.has(ip)) return [
        { user:'admin', pass:'@dmin12345', path:PAN_PATH, proto:'rtsp' },
    ];

    // Panasonic / Default
    return [
        { user:'admin', pass:'12345',      path:PAN_PATH,                   proto:'rtsp' },
        { user:'admin', pass:'Admin12345', path:PAN_PATH,                   proto:'rtsp' },
        { user:'admin', pass:'@dmin12345', path:PAN_PATH,                   proto:'rtsp' },
        { user:'admin', pass:'meinsm',     path:PAN_PATH,                   proto:'rtsp' },
        { user:'admin', pass:'Admin12345', path:'Streaming/Channels/101',   proto:'rtsp' },
        { user:'root',  pass:'admin',      path:'axis-media/media.amp',     proto:'rtsp' },
        { user:'',      pass:'',           path:PAN_PATH,                   proto:'rtsp' },
    ];
}

// ── Ping ──────────────────────────────────────────────────────────────────
export async function pingHost(ip) {
    try {
        const isWin  = process.platform === 'win32';
        const args   = isWin ? `-n 1 -w 500 ${ip}` : `-c 1 -W 1 ${ip}`;
        const { stdout } = await execAsync(`ping ${args}`, { timeout: 3000 });
        return stdout.includes('TTL=') || stdout.includes('ttl=') || stdout.includes('bytes from');
    } catch { return false; }
}

// ── FFmpeg Capture ─────────────────────────────────────────────────────────
export async function ffmpegCapture(url, proto, ffmpegPath, timeoutSec = 10) {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
        return { imageBytes: null, reason: 'no_ffmpeg' };
    }

    const tmp = path.join(os.tmpdir(), `cctv_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
    const us  = timeoutSec * 1_000_000;

    const args = proto === 'http'
        ? ['-y','-timeout',String(us),'-reconnect','1','-reconnect_streamed','1',
           '-i', url, '-vframes','1','-q:v','2','-update','1', tmp]
        : ['-y','-rtsp_transport','tcp','-timeout',String(us),
           '-i', url, '-frames:v','1','-q:v','3','-update','1', tmp];

    return new Promise(resolve => {
        const proc = spawn(ffmpegPath, args, { stdio: ['ignore','pipe','pipe'] });
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve({ imageBytes: null, reason: 'timeout' });
        }, (timeoutSec + 2) * 1000);

        proc.on('close', code => {
            clearTimeout(timer);
            if (code === 0 && fs.existsSync(tmp)) {
                const buf = fs.readFileSync(tmp);
                fs.unlinkSync(tmp);
                if (buf.length > 500) {
                    resolve({ imageBytes: buf, reason: 'ok' });
                } else {
                    resolve({ imageBytes: null, reason: 'empty' });
                }
            } else {
                if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
                // ตรวจ error จาก stderr
                if (stderr.includes('401') || stderr.includes('Unauthorized')) {
                    resolve({ imageBytes: null, reason: 'auth_fail' });
                } else if (stderr.includes('Connection refused') || stderr.includes('timed out')) {
                    resolve({ imageBytes: null, reason: 'connection_fail' });
                } else {
                    resolve({ imageBytes: null, reason: 'ffmpeg_error' });
                }
            }
        });
    });
}

// ── Detect Blur / Black ────────────────────────────────────────────────────
// Simple blur detection: ถ้า variance ของ pixel น้อย = เบลอหรือจอดำ
// ใช้วิธีง่ายๆ เช็คขนาดไฟล์และ pattern
export function analyzeImage(imageBytes) {
    if (!imageBytes || imageBytes.length < 500) {
        return { status: 'black', blurPct: 100, variance: 0 };
    }

    // เช็คว่าเป็นรูปดำหรือเปล่าโดยดูจากขนาดไฟล์
    // JPEG ขนาดเล็กมาก (<2KB) มักเป็นจอดำ
    const sizeKB = imageBytes.length / 1024;
    if (sizeKB < 2) {
        return { status: 'black', blurPct: 100, variance: 0 };
    }

    // Simple analysis โดยดูจากขนาด JPEG
    // ภาพปกติมักมีขนาด > 5KB, เบลอมาก < 5KB
    if (sizeKB < 5) {
        return { status: 'blur_heavy', blurPct: 80, variance: sizeKB };
    } else if (sizeKB < 10) {
        return { status: 'blur_medium', blurPct: 40, variance: sizeKB };
    }

    return { status: 'ok', blurPct: 0, variance: sizeKB };
}

// ── Capture กล้องตัวเดียว ─────────────────────────────────────────────────
export async function captureCamera(cam, ffmpegPath, outputDir, timeoutSec = 10) {
    const result = {
        camera_id:    cam.id,
        camera_name:  cam.name,
        ip_address:   cam.ip_address,
        factory_name: cam.layout_name || '',
        status:       'offline',
        reason:       '',
        blur_pct:     null,
        image_path:   null,
    };

    // กล้องที่ถูกถอด
    if (cam.status === 'removed' || cam.status === 'retired') {
        result.status = cam.status;
        result.reason = cam.status === 'removed' ? 'ถอดออกแล้ว' : 'เลิกใช้งาน';
        return result;
    }

    // ไม่มี IP
    if (!cam.ip_address) {
        result.status = 'error';
        result.reason = 'no_ip';
        return result;
    }

    // Ping
    const alive = await pingHost(cam.ip_address);
    if (!alive) {
        result.status  = 'offline';
        result.reason  = 'ping_fail';
        return result;
    }

    // ลอง capture ด้วย credentials ต่างๆ
    const creds = getCredentials(cam.ip_address);
    let captured = false;

    for (const cred of creds) {
        const url = buildUrl(cred.proto, cam.ip_address, cred.user, cred.pass, cred.path);
        const { imageBytes, reason } = await ffmpegCapture(url, cred.proto, ffmpegPath, timeoutSec);

        if (imageBytes) {
            // วิเคราะห์รูป
            const analysis = analyzeImage(imageBytes);

            // บันทึกรูป
            const safeName = cam.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
            const imgPath  = path.join(outputDir, `${safeName}.jpg`);
            fs.writeFileSync(imgPath, imageBytes);

            result.status     = analysis.status;
            result.blur_pct   = analysis.blurPct;
            result.image_path = imgPath;
            result.reason     = reason;
            captured = true;
            break;
        }

        if (reason === 'no_ffmpeg') break;
    }

    if (!captured) {
        result.status = 'error';
        result.reason = 'capture_failed';
    }

    return result;
}

// ── Run ทั้งหมด ───────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function runCapture({
    ffmpegPath,
    outputBaseDir,
    timeoutSec   = 10,
    concurrency  = 3,    // capture พร้อมกันสูงสุด 3 ตัว
    pingDelay    = 200,  // หน่วง 200ms ระหว่าง ping แต่ละตัว
    batchDelay   = 2000, // หน่วง 2 วินาที ระหว่าง batch
    onProgress,
}) {
    const pool  = await getPool();
    const runId = new Date().toISOString().slice(0,16).replace('T','_');

    // สร้าง output dir
    const outputDir = path.join(outputBaseDir, runId);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // ดึงกล้องจาก DB
    const camResult = await pool.request().query(`
        SELECT c.id, c.name, c.ip_address, c.status,
               fl.name AS layout_name
        FROM dbo.cctv_cameras c
        LEFT JOIN dbo.factory_layouts fl ON fl.id = c.factory_layout_id
        ORDER BY fl.name, c.name
    `);
    const cameras = camResult.recordset;

    onProgress?.(`[Init] กล้องทั้งหมด ${cameras.length} ตัว | concurrency=${concurrency} | pingDelay=${pingDelay}ms`);

    const results = [];
    let done = 0;

    // ── Phase 1: Ping ทีละตัว sequential (ไม่กระทบ traffic) ─────────────
    onProgress?.('[Phase 1] Ping ทีละตัว...');
    const pingResults = new Map(); // ip → alive

    for (const cam of cameras) {
        if (!cam.ip_address || cam.status === 'removed' || cam.status === 'retired') {
            pingResults.set(cam.ip_address, false);
            continue;
        }
        const alive = await pingHost(cam.ip_address);
        pingResults.set(cam.ip_address, alive);
        if (!alive) onProgress?.(`  ✗ ${cam.name} (${cam.ip_address}) — offline`);
        await sleep(pingDelay); // หน่วง 200ms ระหว่าง ping
    }

    const aliveCount = [...pingResults.values()].filter(Boolean).length;
    onProgress?.(`[Phase 1] Done — Online: ${aliveCount}/${cameras.length}`);

    // ── Phase 2: Capture เฉพาะที่ ping ได้ concurrency 3 ตัว ─────────────
    onProgress?.(`[Phase 2] Capture ${aliveCount} ตัว (${concurrency} พร้อมกัน)...`);

    // แยกกล้องที่ต้อง capture กับไม่ต้อง
    const toCapture  = cameras.filter(c => pingResults.get(c.ip_address) === true);
    const skipList   = cameras.filter(c => pingResults.get(c.ip_address) !== true);

    // กล้องที่ไม่ต้อง capture
    for (const cam of skipList) {
        const isRemoved = cam.status === 'removed' || cam.status === 'retired';
        results.push({
            camera_id:    cam.id,
            camera_name:  cam.name,
            ip_address:   cam.ip_address,
            factory_name: cam.layout_name || '',
            status:       isRemoved ? cam.status : 'offline',
            reason:       isRemoved ? (cam.status === 'removed' ? 'ถอดออกแล้ว' : 'เลิกใช้งาน') : 'ping_fail',
            blur_pct:     null,
            image_path:   null,
        });
        done++;
    }

    // Capture แบบ controlled concurrency
    for (let i = 0; i < toCapture.length; i += concurrency) {
        const batch = toCapture.slice(i, i + concurrency);

        const batchResults = await Promise.all(
            batch.map(cam => captureCamera(cam, ffmpegPath, outputDir, timeoutSec))
        );

        for (const r of batchResults) {
            results.push(r);
            done++;
            onProgress?.(`[${done}/${cameras.length}] ${r.camera_name} → ${r.status}`);

            // บันทึกลง DB
            await pool.request()
                .input('run_id',       sql.NVarChar(50),      runId)
                .input('camera_id',    sql.Int,               r.camera_id)
                .input('camera_name',  sql.NVarChar(100),     r.camera_name)
                .input('ip_address',   sql.NVarChar(50),      r.ip_address)
                .input('factory_name', sql.NVarChar(200),     r.factory_name)
                .input('status',       sql.NVarChar(20),      r.status)
                .input('image_path',   sql.NVarChar(sql.MAX), r.image_path)
                .input('blur_score',   sql.Float,             r.blur_pct)
                .query(`
                    INSERT INTO dbo.cctv_capture_logs
                        (run_id, camera_id, camera_name, ip_address, factory_name, status, image_path, blur_score)
                    VALUES
                        (@run_id, @camera_id, @camera_name, @ip_address, @factory_name, @status, @image_path, @blur_score)
                `);
        }

        // หน่วงระหว่าง batch ให้ network พัก
        if (i + concurrency < toCapture.length) {
            await sleep(batchDelay);
        }
    }

    return { runId, outputDir, results };
}