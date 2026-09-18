// cctvCaptureJob.js
// Module สำหรับ capture กล้อง CCTV ทั้งหมด + ส่ง email report
// ใช้ได้ทั้งจาก cron (server.js) และรัน standalone (run-cctv-capture.js)

import nodemailer from 'nodemailer';
import sharp      from 'sharp';
import ExcelJS    from 'exceljs';
import { exec, spawn } from 'child_process';
import { promisify }   from 'util';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { connectDB, getPool } from '../config/db.js';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

// ── Config ────────────────────────────────────────────────────────────────
const FFMPEG_PATH   = 'C:\\ffmpeg\\bin\\ffmpeg.exe'; // ← แก้ path ffmpeg
const OUTPUT_DIR    = path.join(os.tmpdir(), 'cctv_test_' + Date.now());
const THUMB_W       = 320;
const THUMB_H       = 240;
const GRID_COLS     = 7;
const TIMEOUT_SEC   = 10;

// ── Credential Profiles ────────────────────────────────────────────────────
const MOBOTIX_IPS   = new Set(['192.168.66.17','192.168.66.18','192.168.67.17','192.168.67.22','192.168.67.23','192.168.67.70','192.168.66.231','192.168.66.232','192.168.66.20','192.168.66.58','192.168.66.59','192.168.66.62','192.168.66.65','192.168.66.66']);
const HIKVISION_IPS = new Set(['192.168.4.4','192.168.67.60']);
const ADVIDIA_IPS   = new Set(['192.168.66.2','192.168.66.3','192.168.66.16','192.168.66.35','192.168.66.43','192.168.66.47','192.168.66.70','192.168.67.8','192.168.66.55']);
const PANASONIC_4X  = new Set(['192.168.4.1','192.168.4.2','192.168.4.3','192.168.4.5']);

function enc(s) {
    if (!s) return '';
    return s.replace(/%/g,'%25').replace(/@/g,'%40').replace(/#/g,'%23')
            .replace(/:/g,'%3A').replace(/\?/g,'%3F').replace(/ /g,'%20');
}

function buildUrl(proto, ip, user, pass, p) {
    const auth = user ? `${enc(user)}:${enc(pass)}@` : '';
    const urlp = p ? `/${p}` : '';
    return proto === 'http' ? `http://${auth}${ip}${urlp}` : `rtsp://${auth}${ip}:554${urlp}`;
}

function getCreds(ip) {
    const PAN = 'cam/realmonitor?channel=1&subtype=1';

    // ── ลองโดยไม่ใส่ user/pass ก่อนเสมอ ──────────────────────────────
    const noAuth = [
        {u:'', p:'', path:PAN,                      proto:'rtsp'},
        {u:'', p:'', path:'record/current.jpg',      proto:'http'},
        {u:'', p:'', path:'Streaming/Channels/101',  proto:'rtsp'},
    ];

    if (MOBOTIX_IPS.has(ip)) return [
        // faststream.jpg ได้ผลดีที่สุด — ลองก่อนเลย ไม่เสียเวลากับ RTSP ที่ Mobotix ไม่เปิด
        {u:'admin',p:'meinsm', path:'cgi-bin/faststream.jpg',          proto:'http', auth:'basic'},
        {u:'admin',p:'meinsm', path:'record/current.jpg',              proto:'http', auth:'basic'},
        {u:'admin',p:'meinsm', path:'control/userimage.html',          proto:'http', auth:'basic'},
        {u:'admin',p:'meinsm', path:'record/current.jpg?size=640x480', proto:'http', auth:'basic'},
        {u:'', p:'', path:'record/current.jpg', proto:'http'}, // เผื่อไม่ต้อง auth
    ];
    if (HIKVISION_IPS.has(ip)) return [
        ...noAuth,
        {u:'admin',p:'Admin12345',path:'Streaming/Channels/101',proto:'rtsp'},
        {u:'admin',p:'12345',     path:'Streaming/Channels/101',proto:'rtsp'},
    ];
    if (ip === '192.168.66.120') return [
        ...noAuth,
        {u:'admin',p:'Admin12345',path:'stream1',proto:'rtsp'},
        {u:'admin',p:'',          path:'stream1',proto:'rtsp'},
    ];
    if (ADVIDIA_IPS.has(ip)) return [
        ...noAuth,
        {u:'admin',p:'@dmin12345',path:PAN,proto:'rtsp'},
    ];

    // Panasonic 192.168.4.x — ใช้ Digest Auth
    if (PANASONIC_4X.has(ip)) return [
        {u:'', p:'', path:'cgi-bin/camera?resolution=640x480', proto:'http', auth:'digest'},
        {u:'admin',p:'12345',      path:'cgi-bin/camera?resolution=640x480', proto:'http', auth:'digest'},
        {u:'admin',p:'Admin12345', path:'cgi-bin/camera?resolution=640x480', proto:'http', auth:'digest'},
        {u:'admin',p:'@dmin12345', path:'cgi-bin/camera?resolution=640x480', proto:'http', auth:'digest'},
        {u:'admin',p:'12345',      path:'SnapshotJPEG?Resolution=640x480',   proto:'http', auth:'digest'},
        {u:'admin',p:'12345',      path:'jpg/image.jpg',                      proto:'http', auth:'digest'},
        {u:'admin',p:'12345',      path:PAN,                                  proto:'rtsp'},
    ];

    // Panasonic / Default
    return [
        ...noAuth,
        {u:'admin',p:'12345',      path:PAN,                       proto:'rtsp'},
        {u:'admin',p:'Admin12345', path:PAN,                       proto:'rtsp'},
        {u:'admin',p:'@dmin12345', path:PAN,                       proto:'rtsp'},
        {u:'admin',p:'meinsm',     path:PAN,                       proto:'rtsp'},
        {u:'admin',p:'Admin12345', path:'Streaming/Channels/101',  proto:'rtsp'},
        {u:'root', p:'admin',      path:'axis-media/media.amp',    proto:'rtsp'},
    ];
}

// ── Ping ──────────────────────────────────────────────────────────────────
async function ping(ip) {
    try {
        // -n 2 = ping 2 ครั้ง (กันหลุดครั้งแรก), -w 3000 = รอ 3 วินาทีต่อครั้ง
        const { stdout } = await execAsync(`ping -n 2 -w 3000 ${ip}`, { timeout: 8000 });
        return stdout.includes('TTL=');
    } catch { return false; }
}

// ── HTTP Digest Auth capture (ไม่ผ่าน FFmpeg) ─────────────────────────────
async function captureHttpDigest(ip, urlPath, user, pass) {
    const url = `http://${ip}/${urlPath}`;
    try {
        // ลอง Basic ก่อน
        let res = await fetch(url, {
            timeout: 10000,
            headers: user ? {
                Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
            } : {}
        });

        // ถ้า 401 → ลอง Digest
        if (res.status === 401) {
            const wwwAuth = res.headers.get('www-authenticate') || '';
            if (wwwAuth.toLowerCase().includes('digest')) {
                const nonce  = (wwwAuth.match(/nonce="([^"]+)"/)  || [])[1] || '';
                const realm  = (wwwAuth.match(/realm="([^"]+)"/)  || [])[1] || '';
                const qop    = (wwwAuth.match(/qop="([^"]+)"/)    || [])[1] || '';
                const nc     = '00000001';
                const cnonce = Math.random().toString(36).slice(2);
                const uri    = `/${urlPath}`;
                const { createHash } = await import('crypto');
                const ha1 = createHash('md5').update(`${user}:${realm}:${pass}`).digest('hex');
                const ha2 = createHash('md5').update(`GET:${uri}`).digest('hex');
                const response = qop
                    ? createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex')
                    : createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
                const authHeader = `Digest username="${user}",realm="${realm}",nonce="${nonce}",uri="${uri}",` +
                    (qop ? `cnonce="${cnonce}",nc=${nc},qop=${qop},` : '') +
                    `response="${response}",algorithm=MD5`;
                res = await fetch(url, {
                    timeout: 10000,
                    headers: { Authorization: authHeader }
                });
            }
        }

        if (!res.ok) return { buf: null, reason: `http_${res.status}` };
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length > 500 ? { buf, reason: 'ok' } : { buf: null, reason: 'empty_file' };
    } catch (err) {
        return { buf: null, reason: (err.type === 'request-timeout' || err.name === 'TimeoutError') ? 'timeout' : 'fetch_error' };
    }
}

async function captureVerbose(url, proto, timeoutSec, camName, authType='basic') {
    const tmp  = path.join(os.tmpdir(), `cam_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
    const us   = timeoutSec * 1_000_000;
    const args = proto === 'http'
        ? ['-y','-timeout',String(us),
           ...(authType==='digest' ? ['-auth_type','digest'] : []),
           '-reconnect','1','-reconnect_streamed','1',
           '-i',url,'-vframes','1','-q:v','2','-update','1',tmp]
        : ['-y','-rtsp_transport','tcp','-timeout',String(us),
           '-i',url,'-frames:v','1','-q:v','3','-update','1',tmp];

    return new Promise(resolve => {
        const proc = spawn(FFMPEG_PATH, args, { stdio:['ignore','pipe','pipe'] });
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve({ buf: null, reason: 'timeout' });
        }, (timeoutSec+2)*1000);

        proc.on('close', code => {
            clearTimeout(timer);
            if (code===0 && fs.existsSync(tmp)) {
                const buf = fs.readFileSync(tmp);
                fs.unlinkSync(tmp);
                if (buf.length > 500) resolve({ buf, reason: 'ok' });
                else resolve({ buf: null, reason: 'empty_file' });
            } else {
                if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
                let reason = 'ffmpeg_error';
                if (stderr.includes('401') || stderr.includes('Unauthorized')) reason = 'auth_fail';
                else if (stderr.includes('Connection refused'))                 reason = 'connection_refused';
                else if (stderr.includes('timed out'))                          reason = 'timeout';
                else if (stderr.includes('No route to host'))                   reason = 'no_route';
                else if (stderr.includes('Invalid data found'))                 reason = 'invalid_stream';
                resolve({ buf: null, reason });
            }
        });
    });
}
// ── FFmpeg Capture ─────────────────────────────────────────────────────────
async function capture(url, proto, timeoutSec) {
    const tmp  = path.join(os.tmpdir(), `cam_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
    const us   = timeoutSec * 1_000_000;
    const args = proto === 'http'
        ? ['-y','-timeout',String(us),'-reconnect','1','-reconnect_streamed','1','-i',url,'-vframes','1','-q:v','2','-update','1',tmp]
        : ['-y','-rtsp_transport','tcp','-timeout',String(us),'-i',url,'-frames:v','1','-q:v','3','-update','1',tmp];

    return new Promise(resolve => {
        const proc = spawn(FFMPEG_PATH, args, { stdio:['ignore','pipe','pipe'] });
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => { proc.kill('SIGKILL'); resolve(null); }, (timeoutSec+2)*1000);
        proc.on('close', code => {
            clearTimeout(timer);
            if (code===0 && fs.existsSync(tmp)) {
                const buf = fs.readFileSync(tmp);
                fs.unlinkSync(tmp);
                resolve(buf.length > 500 ? buf : null);
            } else {
                if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
                resolve(null);
            }
        });
    });
}

// ── Make thumbnail 320x240 with label ─────────────────────────────────────
async function makeThumbnail(imgBuf, label, status) {
    const statusColor = {
        ok:       { r:22,  g:163, b:74  },
        offline:  { r:220, g:38,  b:38  },
        removed:  { r:124, g:58,  b:237 },
        retired:  { r:107, g:114, b:128 },
        error:    { r:239, g:68,  b:68  },
        black:    { r:55,  g:65,  b:81  },
    };
    const col = statusColor[status] || statusColor.ok;

    // SVG overlay สำหรับ label + status bar
    const safeName = label.replace(/[<>&"]/g, '').slice(0, 30);
    const svg = `
        <svg width="${THUMB_W}" height="${THUMB_H}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="${THUMB_H-28}" width="${THUMB_W}" height="28"
                  fill="rgba(0,0,0,0.72)"/>
            <rect x="0" y="${THUMB_H-3}" width="${THUMB_W}" height="3"
                  fill="rgb(${col.r},${col.g},${col.b})"/>
            <text x="6" y="${THUMB_H-10}" font-family="Arial" font-size="11"
                  fill="white" font-weight="bold">${safeName}</text>
        </svg>`;

    try {
        let base = imgBuf
            ? await sharp(imgBuf).resize(THUMB_W, THUMB_H, { fit:'cover' }).jpeg({ quality:75 }).toBuffer()
            : await sharp({
                create: { width:THUMB_W, height:THUMB_H, channels:3,
                          background: status==='offline' ? {r:30,g:30,b:35} : {r:20,g:20,b:25} }
              }).jpeg().toBuffer();

        return await sharp(base)
            .composite([{ input: Buffer.from(svg), top:0, left:0 }])
            .jpeg({ quality: 75 })
            .toBuffer();
    } catch {
        // fallback: solid color
        return await sharp({
            create: { width:THUMB_W, height:THUMB_H, channels:3, background:{r:40,g:40,b:45} }
        }).jpeg().toBuffer();
    }
}

// ── Build Grid Image ────────────────────────────────────────────────────────
async function buildGrid(thumbs, groupName) {
    const cols    = Math.min(GRID_COLS, thumbs.length);
    const rows    = Math.ceil(thumbs.length / cols);
    const PAD     = 3;
    const HEADER  = 36;
    const W       = cols * (THUMB_W + PAD) + PAD;
    const H       = HEADER + rows * (THUMB_H + PAD) + PAD;

    // Header SVG
    const headerSvg = `
        <svg width="${W}" height="${HEADER}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${W}" height="${HEADER}" fill="#0f172a"/>
            <text x="12" y="24" font-family="Arial" font-size="14"
                  fill="white" font-weight="bold">${groupName} — ${thumbs.length} cameras</text>
        </svg>`;

    // สร้าง canvas
    const canvas = sharp({
        create: { width:W, height:H, channels:3, background:{r:18,g:24,b:32} }
    });

    const composites = [{ input: Buffer.from(headerSvg), top:0, left:0 }];

    thumbs.forEach((buf, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x   = PAD + col * (THUMB_W + PAD);
        const y   = HEADER + PAD + row * (THUMB_H + PAD);
        composites.push({ input: buf, top:y, left:x });
    });

    return canvas.composite(composites).jpeg({ quality:80 }).toBuffer();
}

// ── Main ───────────────────────────────────────────────────────────────────
export async function runCctvCaptureJob() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const runId = new Date().toISOString().slice(0,16).replace('T','_').replace(':','-');
    console.log(`Output dir: ${OUTPUT_DIR}`);

    await connectDB();
    const pool = await getPool();

    // ดึงกล้องจาก DB
    const { recordset: cameras } = await pool.request().query(`
        SELECT c.id, c.name, c.ip_address, c.status, c.model,
               fl.name AS layout_name,
               rs.name AS record_server_name
        FROM dbo.cctv_cameras c
        LEFT JOIN dbo.factory_layouts fl ON fl.id = c.factory_layout_id
        LEFT JOIN dbo.cctv_record_servers rs ON rs.id = c.server_record_id
        WHERE c.status NOT IN ('removed','retired')
        ORDER BY fl.name, c.name
    `);

    const removedCams = await pool.request().query(`
        SELECT c.name, c.ip_address, c.status, c.model, fl.name AS layout_name,
               rs.name AS record_server_name
        FROM dbo.cctv_cameras c
        LEFT JOIN dbo.factory_layouts fl ON fl.id = c.factory_layout_id
        LEFT JOIN dbo.cctv_record_servers rs ON rs.id = c.server_record_id
        WHERE c.status IN ('removed','retired')
        ORDER BY c.name
    `);

    console.log(`Cameras to process: ${cameras.length}`);

    // ── Phase 1: Ping ─────────────────────────────────────────────────────
    console.log('\n[Phase 1] Pinging...');
    const pingMap = new Map();
    for (const cam of cameras) {
        if (!cam.ip_address) { pingMap.set(cam.id, false); continue; }
        const alive = await ping(cam.ip_address);
        pingMap.set(cam.id, alive);
        process.stdout.write(alive ? '.' : 'x');
        await new Promise(r => setTimeout(r, 150));
    }
    const onlineCount  = [...pingMap.values()].filter(Boolean).length;
    const offlineCount = cameras.length - onlineCount;
    console.log(`\nOnline: ${onlineCount} / Offline: ${offlineCount}`);

    // ── Phase 2: Capture ───────────────────────────────────────────────────
    console.log('\n[Phase 2] Capturing online cameras...');
    const captureMap = new Map(); // id → { buf, status }

    const online = cameras.filter(c => pingMap.get(c.id));
    const BATCH  = 2; // ลดจาก 3 → 2 กันเบียด bandwidth ตอน batch ใหญ่

    // ── ฟังก์ชัน capture ตัวเดียว (ใช้ทั้งรอบแรกและรอบ retry) ─────────────
    async function captureOneCamera(cam) {
        const creds = getCreds(cam.ip_address);
        let buf = null;
        let successCred = null;
        const attempts = [];

        for (const cred of creds) {
            let res;
            let safeUrl;

            if (cred.proto === 'http' && cred.auth === 'digest') {
                safeUrl = `http://${cred.u ? cred.u+':***@' : ''}${cam.ip_address}/${cred.path}`;
                res = await captureHttpDigest(cam.ip_address, cred.path, cred.u, cred.p);
            } else {
                const url = buildUrl(cred.proto, cam.ip_address, cred.u, cred.p, cred.path);
                safeUrl = url.replace(/:[^:@/]+@/, ':***@');
                res = await captureVerbose(url, cred.proto, TIMEOUT_SEC, cam.name, cred.auth || 'basic');
            }

            attempts.push({ url: safeUrl, reason: res.reason });
            if (res.buf) { buf = res.buf; successCred = safeUrl; break; }
        }

        const sizeKB = buf ? buf.length / 1024 : 0;
        const status = !buf ? 'error' : sizeKB < 2 ? 'black' : 'ok';
        const lastReason = attempts[attempts.length-1]?.reason || 'unknown';
        return { buf, status, reason: lastReason, attempts };
    }

    // ── รอบแรก ────────────────────────────────────────────────────────────
    for (let i = 0; i < online.length; i += BATCH) {
        const batch = online.slice(i, i + BATCH);
        await Promise.all(batch.map(async cam => {
            const result = await captureOneCamera(cam);
            captureMap.set(cam.id, result);

            if (result.status === 'ok') {
                console.log(`  ✅ ${cam.name} (${cam.ip_address})`);
            } else if (result.status === 'black') {
                console.log(`  ⚫ [BLACK] ${cam.name} (${cam.ip_address})`);
            } else {
                console.log(`  ⚠️  [RETRY LATER] ${cam.name} (${cam.ip_address})`);
            }
        }));
        await new Promise(r => setTimeout(r, 2000)); // เพิ่มจาก 1500 → 2000ms พักระหว่าง batch
    }
    console.log('\nรอบแรกเสร็จ — เริ่ม retry ตัวที่ error...');

    // ── รอบ retry — เฉพาะตัวที่ error (ไม่รวม black เพราะ black คือ capture ได้จริง) ──
    const needRetry = online.filter(cam => captureMap.get(cam.id)?.status === 'error');
    if (needRetry.length > 0) {
        console.log(`[Retry] มี ${needRetry.length} ตัวที่ error รอบแรก — พัก 5 วินาทีก่อน retry`);
        await new Promise(r => setTimeout(r, 5000));

        for (let i = 0; i < needRetry.length; i += BATCH) {
            const batch = needRetry.slice(i, i + BATCH);
            await Promise.all(batch.map(async cam => {
                const result = await captureOneCamera(cam);
                captureMap.set(cam.id, result); // เขียนทับผลเดิม

                if (result.status === 'ok') {
                    console.log(`  ✅ [RETRY OK] ${cam.name} (${cam.ip_address})`);
                } else if (result.status === 'black') {
                    console.log(`  ⚫ [RETRY BLACK] ${cam.name} (${cam.ip_address})`);
                } else {
                    console.log(`  ❌ [RETRY FAILED] ${cam.name} (${cam.ip_address})`);
                    result.attempts.forEach(a => console.log(`     → ${a.url} : ${a.reason}`));
                }
            }));
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    console.log('\nCapture done (with retry).');

    // ── Phase 3: Build Grid per Factory ────────────────────────────────────
    console.log('\n[Phase 3] Building grid images...');
    const byFactory = {};
    for (const cam of cameras) {
        const fac = cam.layout_name || 'Other';
        if (!byFactory[fac]) byFactory[fac] = [];
        byFactory[fac].push(cam);
    }

    const gridImages = []; // { name, buf, stats }

    for (const [facName, cams] of Object.entries(byFactory)) {
        const thumbs = [];
        let ok=0, offline=0, err=0;

        for (const cam of cams) {
            const alive = pingMap.get(cam.id);
            if (!alive) {
                offline++;
                thumbs.push(await makeThumbnail(null, cam.name, 'offline'));
            } else {
                const cap = captureMap.get(cam.id);
                const st  = cap?.status || 'error';
                if (st === 'ok') ok++;
                else err++;
                thumbs.push(await makeThumbnail(cap?.buf || null, cam.name, st));
            }
        }

        const gridBuf = await buildGrid(thumbs, facName);
        const gridPath = path.join(OUTPUT_DIR, `SUMMARY_${facName.replace(/[^a-zA-Z0-9]/g,'_')}.jpg`);
        fs.writeFileSync(gridPath, gridBuf);
        gridImages.push({ name: facName, path: gridPath, buf: gridBuf, ok, offline, err, total: cams.length });
        console.log(`  ✓ ${facName}: ${cams.length} cams`);
    }

    // ── Phase 4: Generate Excel ────────────────────────────────────────────
    console.log('\n[Phase 4] Generating Excel...');
    const xlsxPath = path.join(OUTPUT_DIR, `CCTV_Report_${runId}.xlsx`);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CCTV Monitor';
    wb.created = new Date();

    const ws = wb.addWorksheet('Camera Status', {
        views: [{ state:'frozen', xSplit:0, ySplit:1 }]
    });

    ws.columns = [
        { header:'#',           key:'no',      width:6  },
        { header:'ชื่อกล้อง',   key:'name',    width:35 },
        { header:'IP Address',  key:'ip',      width:18 },
        { header:'Model',       key:'model',   width:25 },
        { header:'Factory',     key:'factory', width:35 },
        { header:'Record Server', key:'server', width:22 },
        { header:'สถานะ DB',    key:'dbStatus',width:14 },
        { header:'Ping',        key:'ping',    width:10 },
        { header:'Capture',     key:'capture', width:14 },
        { header:'หมายเหตุ',    key:'remark',  width:30 },
    ];

    // Header style
    ws.getRow(1).eachCell(cell => {
        cell.fill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF0F172A' } };
        cell.font   = { color:{ argb:'FFFFFFFF' }, bold:true, size:11 };
        cell.alignment = { vertical:'middle', horizontal:'center' };
        cell.border = { bottom:{ style:'thin', color:{ argb:'FF334155' } } };
    });
    ws.getRow(1).height = 22;

    const STATUS_COLOR_XLSX = {
        ok:       'FF16a34a',
        black:    'FF374151',
        error:    'FFdc2626',
        offline:  'FF9ca3af',
        removed:  'FF7c3aed',
        retired:  'FF6b7280',
        online:   'FF16a34a',
        unknown:  'FFd97706',
    };

    let rowNo = 1;
    for (const cam of [...cameras, ...removedCams.recordset]) {
        const pingOk   = pingMap.get(cam.id);
        const cap      = captureMap.get(cam.id);
        const isRemoved= ['removed','retired'].includes(cam.status);
        const capStatus = isRemoved ? cam.status : (pingOk === false ? 'offline' : (cap?.status || '—'));
        const pingTxt  = isRemoved ? 'N/A' : (pingOk ? '✓ OK' : '✗ FAIL');
        const remark   = cap?.reason && cap.reason !== 'ok' ? cap.reason : '';

        const row = ws.addRow({
            no:       rowNo++,
            name:     cam.name,
            ip:       cam.ip_address || '—',
            model:    cam.model      || '—',
            factory:  cam.layout_name || '—',
            server:   cam.record_server_name || '—',
            dbStatus: cam.status,
            ping:     pingTxt,
            capture:  capStatus,
            remark,
        });

        // Status cell color
        const captureCell = row.getCell('capture');
        const colHex = (STATUS_COLOR_XLSX[capStatus] || 'FF6b7280').replace('FF','');
        captureCell.font = { color:{ argb: 'FF'+colHex }, bold:true };
        captureCell.alignment = { horizontal:'center' };

        // Ping cell
        const pingCell = row.getCell('ping');
        pingCell.font = { color:{ argb: pingOk ? 'FF16a34a' : 'FFdc2626' }, bold:true };
        pingCell.alignment = { horizontal:'center' };

        // Alternating row bg
        if (rowNo % 2 === 0) {
            row.eachCell(cell => {
                if (!cell.fill?.fgColor) {
                    cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF8FAFC' } };
                }
            });
        }
    }

    // Summary sheet
    const wsSummary = wb.addWorksheet('Summary');
    wsSummary.columns = [
        { header:'Factory', key:'factory', width:35 },
        { header:'Total',   key:'total',   width:10 },
        { header:'Online',  key:'ok',      width:10 },
        { header:'Offline', key:'offline', width:10 },
        { header:'Error',   key:'err',     width:10 },
        { header:'Uptime%', key:'pct',     width:10 },
    ];
    wsSummary.getRow(1).eachCell(cell => {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF0F172A' } };
        cell.font = { color:{ argb:'FFFFFFFF' }, bold:true };
        cell.alignment = { horizontal:'center' };
    });
    gridImages.forEach(g => {
        wsSummary.addRow({
            factory: g.name,
            total:   g.total,
            ok:      g.ok,
            offline: g.offline,
            err:     g.err,
            pct:     `${Math.round(g.ok/g.total*100)}%`,
        });
    });

    // Server Summary sheet — สรุปกล้องแยกตาม Record Server
    const wsServer = wb.addWorksheet('Server Summary');
    wsServer.columns = [
        { header:'Record Server', key:'server',  width:30 },
        { header:'Total',         key:'total',   width:10 },
        { header:'Online',        key:'ok',      width:10 },
        { header:'Offline',       key:'offline', width:10 },
        { header:'Error/Black',   key:'err',     width:12 },
        { header:'Removed',       key:'removed', width:10 },
        { header:'Uptime%',       key:'pct',     width:10 },
    ];
    wsServer.getRow(1).eachCell(cell => {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF0F172A' } };
        cell.font = { color:{ argb:'FFFFFFFF' }, bold:true };
        cell.alignment = { horizontal:'center' };
    });

    // รวม cameras + removedCams เพื่อนับให้ครบทุกตัว
    const allCamsForServerSummary = [...cameras, ...removedCams.recordset];
    const byServer = {};
    for (const cam of allCamsForServerSummary) {
        const serverName = cam.record_server_name || 'ยังไม่ระบุ Server';
        if (!byServer[serverName]) byServer[serverName] = { total:0, ok:0, offline:0, err:0, removed:0 };
        byServer[serverName].total++;

        const isRemoved = ['removed','retired'].includes(cam.status);
        if (isRemoved) {
            byServer[serverName].removed++;
        } else {
            const alive = pingMap.get(cam.id);
            const cap   = captureMap.get(cam.id);
            if (alive === false) byServer[serverName].offline++;
            else if (cap?.status === 'ok') byServer[serverName].ok++;
            else byServer[serverName].err++;
        }
    }

    Object.entries(byServer)
        .sort((a,b) => b[1].total - a[1].total)
        .forEach(([serverName, stat]) => {
            const activeTotal = stat.total - stat.removed;
            const pct = activeTotal > 0 ? Math.round(stat.ok / activeTotal * 100) : 0;
            const row = wsServer.addRow({
                server:  serverName,
                total:   stat.total,
                ok:      stat.ok,
                offline: stat.offline,
                err:     stat.err,
                removed: stat.removed,
                pct:     `${pct}%`,
            });
            if (serverName === 'ยังไม่ระบุ Server') {
                row.getCell('server').font = { italic:true, color:{ argb:'FF9CA3AF' } };
            }
        });

    // แถวรวมทั้งหมด
    const totalRow = wsServer.addRow({
        server:  'รวมทั้งหมด',
        total:   allCamsForServerSummary.length,
        ok:      Object.values(byServer).reduce((s,v)=>s+v.ok,0),
        offline: Object.values(byServer).reduce((s,v)=>s+v.offline,0),
        err:     Object.values(byServer).reduce((s,v)=>s+v.err,0),
        removed: Object.values(byServer).reduce((s,v)=>s+v.removed,0),
        pct:     '',
    });
    totalRow.eachCell(cell => {
        cell.font = { bold:true };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF1F5F9' } };
        cell.border = { top:{ style:'thin', color:{ argb:'FF94A3B8' } } };
    });

    await wb.xlsx.writeFile(xlsxPath);
    console.log(`Excel: ${xlsxPath}`);

    // ── Phase 5: Send Email ────────────────────────────────────────────────
    console.log('\n[Phase 5] Sending email...');

    const ts      = new Date().toLocaleString('th-TH', { timeZone:'Asia/Bangkok' });
    const totalOk = gridImages.reduce((s,g) => s+g.ok, 0);
    const totalOf = gridImages.reduce((s,g) => s+g.offline, 0);
    const totalEr = gridImages.reduce((s,g) => s+g.err, 0);
    const totalRm = removedCams.recordset.length;
    const offlineCams = cameras.filter(c => !pingMap.get(c.id));

    // Summary cards — table-based (Outlook ไม่รองรับ flex)
    const cardData = [
        { label:'Online',      count:totalOk, color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0', icon:'&#9989;' },
        { label:'Offline',     count:totalOf, color:'#dc2626', bg:'#fef2f2', border:'#fecaca', icon:'&#128308;' },
        { label:'Error/Black', count:totalEr, color:'#d97706', bg:'#fffbeb', border:'#fde68a', icon:'&#9888;' },
        { label:'ถอดออก',     count:totalRm, color:'#7c3aed', bg:'#faf5ff', border:'#ddd6fe', icon:'&#128228;' },
    ];
    const cardCells = cardData.map(c => `
        <td width="150" valign="top" style="padding:6px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:${c.bg};border:1px solid ${c.border};border-radius:8px">
                <tr><td align="center" style="padding:14px 10px 2px;font-size:20px;line-height:1">${c.icon}</td></tr>
                <tr><td align="center" style="font-family:Arial,sans-serif;font-size:28px;font-weight:900;
                           color:${c.color};line-height:1.1;padding:2px 10px">${c.count}</td></tr>
                <tr><td align="center" style="font-family:Arial,sans-serif;font-size:11px;color:#6b7280;
                           font-weight:700;padding:4px 10px 14px">${c.label}</td></tr>
            </table>
        </td>`).join('');

    // Factory table rows (table-based progress bar)
    const facRows = gridImages.map((g, i) => {
        const pct = Math.round(g.ok/g.total*100);
        const barColor = pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626';
        return `
        <tr style="background:${i%2===0?'#ffffff':'#f9fafb'}">
            <td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;
                       color:#374151;border-bottom:1px solid #f1f5f9">${g.name}</td>
            <td align="center" style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;
                       color:#374151;border-bottom:1px solid #f1f5f9">${g.total}</td>
            <td align="center" style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;
                       font-weight:700;color:#16a34a;border-bottom:1px solid #f1f5f9">${g.ok}</td>
            <td align="center" style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;
                       font-weight:700;color:#dc2626;border-bottom:1px solid #f1f5f9">${g.offline}</td>
            <td align="center" style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;
                       font-weight:700;color:#d97706;border-bottom:1px solid #f1f5f9">${g.err}</td>
            <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;width:110px">
                <table width="90" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td style="background:#e5e7eb;border-radius:4px;font-size:0;line-height:0">
                        <table width="${pct}%" cellpadding="0" cellspacing="0" border="0"><tr>
                            <td style="background:${barColor};height:6px;border-radius:4px;font-size:0;line-height:0">&nbsp;</td>
                        </tr></table>
                    </td>
                </tr></table>
                <div style="font-family:Arial,sans-serif;font-size:10px;color:#6b7280;margin-top:3px">${pct}%</div>
            </td>
        </tr>`;
    }).join('');

    // Server rows — สรุปกล้องแยกตาม Record Server
    const allCamsForEmail = [...cameras, ...removedCams.recordset];
    const byServerEmail = {};
    for (const cam of allCamsForEmail) {
        const serverName = cam.record_server_name || 'ยังไม่ระบุ Server';
        if (!byServerEmail[serverName]) byServerEmail[serverName] = { total:0, ok:0, offline:0, err:0, removed:0 };
        byServerEmail[serverName].total++;
        const isRemoved = ['removed','retired'].includes(cam.status);
        if (isRemoved) {
            byServerEmail[serverName].removed++;
        } else {
            const alive = pingMap.get(cam.id);
            const cap   = captureMap.get(cam.id);
            if (alive === false) byServerEmail[serverName].offline++;
            else if (cap?.status === 'ok') byServerEmail[serverName].ok++;
            else byServerEmail[serverName].err++;
        }
    }

    const serverRows = Object.entries(byServerEmail)
        .sort((a,b) => b[1].total - a[1].total)
        .map(([serverName, stat], i) => {
            const activeTotal = stat.total - stat.removed;
            const pct = activeTotal > 0 ? Math.round(stat.ok / activeTotal * 100) : 0;
            const barColor = pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626';
            const isUnassigned = serverName === 'ยังไม่ระบุ Server';
            return `
        <tr style="background:${i%2===0?'#ffffff':'#f9fafb'}">
            <td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;
                       color:${isUnassigned?'#9ca3af':'#374151'};font-style:${isUnassigned?'italic':'normal'};border-bottom:1px solid #f1f5f9">${serverName}</td>
            <td align="center" style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;
                       color:#374151;border-bottom:1px solid #f1f5f9">${stat.total}</td>
            <td align="center" style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;
                       font-weight:700;color:#16a34a;border-bottom:1px solid #f1f5f9">${stat.ok}</td>
            <td align="center" style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;
                       font-weight:700;color:#dc2626;border-bottom:1px solid #f1f5f9">${stat.offline}</td>
            <td align="center" style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;
                       font-weight:700;color:#7c3aed;border-bottom:1px solid #f1f5f9">${stat.removed}</td>
            <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;width:110px">
                <table width="90" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td style="background:#e5e7eb;border-radius:4px;font-size:0;line-height:0">
                        <table width="${pct}%" cellpadding="0" cellspacing="0" border="0"><tr>
                            <td style="background:${barColor};height:6px;border-radius:4px;font-size:0;line-height:0">&nbsp;</td>
                        </tr></table>
                    </td>
                </tr></table>
                <div style="font-family:Arial,sans-serif;font-size:10px;color:#6b7280;margin-top:3px">${pct}%</div>
            </td>
        </tr>`;
        }).join('');
    const offlineRows = offlineCams.length > 0
        ? offlineCams.map((c,i) => `
            <tr style="background:${i%2===0?'#ffffff':'#fff5f5'}">
                <td style="padding:7px 12px;font-family:Arial,sans-serif;font-size:12px;font-weight:600;color:#dc2626;border-bottom:1px solid #fee2e2">${c.name}</td>
                <td style="padding:7px 12px;font-family:'Courier New',monospace;font-size:12px;color:#6b7280;border-bottom:1px solid #fee2e2">${c.ip_address||'—'}</td>
                <td style="padding:7px 12px;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;border-bottom:1px solid #fee2e2">${c.layout_name||'—'}</td>
            </tr>`).join('')
        : `<tr><td colspan="3" align="center" style="padding:16px;font-family:Arial,sans-serif;font-size:13px;color:#16a34a">&#9989; ทุกกล้อง Online</td></tr>`;

    const html = `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table {border-collapse:collapse;} td,th {font-family:Arial,sans-serif;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9">
<tr><td align="center" style="padding:24px 12px">

<table width="680" cellpadding="0" cellspacing="0" border="0"
       style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb">

    <!-- Header -->
    <tr>
        <td style="background:#0f172a;padding:26px 32px;border-radius:10px 10px 0 0">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td style="font-family:Arial,sans-serif;font-size:20px;font-weight:800;color:#ffffff">
                        &#128247;&nbsp; CCTV Weekly Report
                    </td>
                </tr>
                <tr>
                    <td style="padding-top:6px;font-family:Arial,sans-serif;font-size:12px;color:#94a3b8">
                        ${ts} &nbsp;|&nbsp; กล้องทั้งหมด ${cameras.length + totalRm} ตัว
                    </td>
                </tr>
            </table>
        </td>
    </tr>

    <!-- Body -->
    <tr><td style="padding:28px 32px">

        <!-- Summary Cards -->
        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
            <tr>
                <td style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#374151;
                           text-transform:uppercase;letter-spacing:0.5px;padding-bottom:12px">
                    &#128202; สรุปผล
                </td>
            </tr>
        </table>
        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:26px">
            <tr>${cardCells}</tr>
        </table>
    
        <!-- Divider -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:26px">
            <tr><td style="height:1px;background:#e5e7eb;font-size:0;line-height:0">&nbsp;</td></tr>
        </table>

        <!-- Factory Table -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
            <tr><td style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#374151;
                           text-transform:uppercase;letter-spacing:0.5px">&#128205; สถานะแยกตาม Factory</td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:26px">
            <tr style="background:#f8fafc">
                <th align="left"   style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;font-weight:700;border-bottom:2px solid #e5e7eb">FACTORY</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;font-weight:700;border-bottom:2px solid #e5e7eb">TOTAL</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#16a34a;font-weight:700;border-bottom:2px solid #e5e7eb">ONLINE</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#dc2626;font-weight:700;border-bottom:2px solid #e5e7eb">OFFLINE</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#d97706;font-weight:700;border-bottom:2px solid #e5e7eb">ERROR</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;font-weight:700;border-bottom:2px solid #e5e7eb">UPTIME</th>
            </tr>
            ${facRows}
        </table>

        <!-- Record Server Table -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
            <tr><td style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#374151;
                           text-transform:uppercase;letter-spacing:0.5px">&#128190; สถานะแยกตาม Record Server</td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:26px">
            <tr style="background:#f8fafc">
                <th align="left"   style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;font-weight:700;border-bottom:2px solid #e5e7eb">RECORD SERVER</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;font-weight:700;border-bottom:2px solid #e5e7eb">TOTAL</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#16a34a;font-weight:700;border-bottom:2px solid #e5e7eb">ONLINE</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#dc2626;font-weight:700;border-bottom:2px solid #e5e7eb">OFFLINE</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#7c3aed;font-weight:700;border-bottom:2px solid #e5e7eb">ถอดออก</th>
                <th align="center" style="padding:10px 14px;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;font-weight:700;border-bottom:2px solid #e5e7eb">UPTIME</th>
            </tr>
            ${serverRows}
        </table>

        <!-- Offline List -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
            <tr><td style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#dc2626;
                           text-transform:uppercase;letter-spacing:0.5px">&#128308; กล้อง Offline (${offlineCams.length} ตัว)</td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid #fecaca;border-radius:6px;margin-bottom:26px">
            <tr style="background:#fef2f2">
                <th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:11px;color:#dc2626;font-weight:700;border-bottom:1px solid #fecaca">ชื่อกล้อง</th>
                <th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:11px;color:#dc2626;font-weight:700;border-bottom:1px solid #fecaca">IP Address</th>
                <th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:11px;color:#dc2626;font-weight:700;border-bottom:1px solid #fecaca">Factory</th>
            </tr>
            ${offlineRows}
        </table>

        ${totalRm > 0 ? `
        <!-- Removed -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
            <tr><td style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#7c3aed;
                           text-transform:uppercase;letter-spacing:0.5px">&#128228; กล้องที่ถอดออก (${totalRm} ตัว)</td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid #ddd6fe;border-radius:6px;margin-bottom:26px">
            <tr style="background:#faf5ff">
                <th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:11px;color:#7c3aed;font-weight:700;border-bottom:1px solid #ddd6fe">ชื่อกล้อง</th>
                <th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:11px;color:#7c3aed;font-weight:700;border-bottom:1px solid #ddd6fe">IP Address</th>
                <th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:11px;color:#7c3aed;font-weight:700;border-bottom:1px solid #ddd6fe">สถานะ</th>
            </tr>
            ${removedCams.recordset.map((c,i) => `
            <tr style="background:${i%2===0?'#ffffff':'#faf5ff'}">
                <td style="padding:7px 12px;font-family:Arial,sans-serif;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #f3e8ff">${c.name}</td>
                <td style="padding:7px 12px;font-family:'Courier New',monospace;font-size:12px;color:#6b7280;border-bottom:1px solid #f3e8ff">${c.ip_address||'—'}</td>
                <td style="padding:7px 12px;border-bottom:1px solid #f3e8ff">
                    <table cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="background:${c.status==='removed'?'#ede9fe':'#f3f4f6'};
                                   color:${c.status==='removed'?'#7c3aed':'#6b7280'};
                                   padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;font-family:Arial,sans-serif">
                            ${c.status==='removed'?'&#128228; ถอดออก':'&#128683; เลิกใช้'}
                        </td>
                    </tr></table>
                </td>
            </tr>`).join('')}
        </table>` : ''}

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="height:1px;background:#f1f5f9;font-size:0;line-height:0">&nbsp;</td></tr>
            <tr><td align="center" style="padding-top:16px;font-family:Arial,sans-serif;font-size:11px;color:#94a3b8">
                รูป Summary Grid แต่ละ Factory และไฟล์ Excel แนบมาด้วย<br>
                CCTV Management System — IT Infrastructure
            </td></tr>
        </table>

    </td></tr>
</table>

</td></tr>
</table>
</body></html>`;

    // Attachments — grid images + Excel
    // Attachments — Excel + grid images ไม่เกิน 10MB รวม
    const MAX_ATTACH = 10 * 1024 * 1024; // 10MB
    const xlsxSize  = fs.existsSync(xlsxPath) ? fs.statSync(xlsxPath).size : 0;
    let usedSize     = xlsxSize;

    const gridAttachments = [];
    for (const g of gridImages) {
        if (!fs.existsSync(g.path)) continue;
        const size = fs.statSync(g.path).size;
        if (usedSize + size > MAX_ATTACH) {
            console.log(`⚠️  Skip ${g.name} (จะเกิน 10MB)`);
            continue;
        }
        usedSize += size;
        gridAttachments.push({
            filename: `SUMMARY_${g.name.replace(/[^a-zA-Z0-9]/g,'_')}.jpg`,
            path:     g.path,
        });
    }

    const attachments = [
        { filename: `CCTV_Report_${runId}.xlsx`, path: xlsxPath },
        ...gridAttachments,
    ];
    console.log(`Attachments: ${attachments.length} files (~${Math.round(usedSize/1024/1024*10)/10}MB)`);

    const transporter = nodemailer.createTransport({
        host:      'smtp.dci.daikin.co.jp',
        port:      25,
        secure:    false,
        ignoreTLS: true,
        tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
        from:        '"CCTV WEEKLY REPORT" <natthawut.y@dci.daikin.co.jp>',
        // to:          'natthawut.y@dci.daikin.co.jp',
        to:  ['natthawut.y@dci.daikin.co.jp', 'tanabut.t@dci.daikin.co.jp', 'phongsathon.w@dci.daikin.co.jp','withchapon.t@dci.daikin.co.jp','waraphong.a@dci.daikin.co.jp'].join(','),
        subject:     `[CCTV] Weekly Report — Online ${totalOk}/${cameras.length} — ${new Date().toLocaleDateString('th-TH')}`,
        html,
        attachments,
    });

    console.log(`\n✅ Email sent!`);
    console.log(`   Online:${totalOk} Offline:${totalOf} Error:${totalEr} Removed:${totalRm}`);
    console.log(`   Grid images: ${attachments.length} แนบมาด้วย`);
    console.log(`   Output: ${OUTPUT_DIR}`);

    // ลบไฟล์ชั่วคราวทั้งหมดทิ้ง (รูป + excel ไม่เก็บถาวร)
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    console.log(`🗑️  Cleaned up: ${OUTPUT_DIR}`);

    return { runId, total: cameras.length, online: totalOk, offline: totalOf, error: totalEr, removed: totalRm };
}