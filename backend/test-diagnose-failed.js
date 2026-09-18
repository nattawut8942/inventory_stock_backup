// test-diagnose-failed.js
// รันด้วย: node test-diagnose-failed.js
// ทดสอบกล้องที่ error ทั้งหมดจาก DB (status offline/error หรือระบุ IP list เอง)
// แสดงสาเหตุที่แท้จริงของแต่ละตัว ไม่เดา

import { exec, spawn } from 'child_process';
import { promisify }   from 'util';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { connectDB, getPool } from './src/config/db.js';

const execAsync    = promisify(exec);
const FFMPEG_PATH  = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
const TIMEOUT_SEC  = 10;

// ── ระบุ IP ที่จะทดสอบตรงนี้ (จาก log ที่ fail) ──────────────────────────
// ถ้าปล่อยว่าง จะดึงจาก DB อัตโนมัติ (กล้องที่ status offline/error)
const MANUAL_IPS = [];

const PAN = 'cam/realmonitor?channel=1&subtype=1';
const ALL_CREDS = [
    { label:'No-Auth RTSP',          u:'',      p:'',           path:PAN,                       proto:'rtsp' },
    { label:'No-Auth HTTP snapshot', u:'',      p:'',           path:'record/current.jpg',      proto:'http' },
    { label:'No-Auth Hikvision',     u:'',      p:'',           path:'Streaming/Channels/101',  proto:'rtsp' },
    { label:'admin/12345',           u:'admin', p:'12345',      path:PAN,                       proto:'rtsp' },
    { label:'admin/Admin12345',      u:'admin', p:'Admin12345', path:PAN,                       proto:'rtsp' },
    { label:'admin/@dmin12345',      u:'admin', p:'@dmin12345', path:PAN,                       proto:'rtsp' },
    { label:'Mobotix faststream',    u:'admin', p:'meinsm',     path:'cgi-bin/faststream.jpg',  proto:'http' },
    { label:'Mobotix current.jpg',   u:'admin', p:'meinsm',     path:'record/current.jpg',      proto:'http' },
    { label:'Mobotix userimage',     u:'admin', p:'meinsm',     path:'control/userimage.html',  proto:'http' },
    { label:'Hikvision creds',       u:'admin', p:'Admin12345', path:'Streaming/Channels/101',  proto:'rtsp' },
    { label:'Axis root/admin',       u:'root',  p:'admin',      path:'axis-media/media.amp',    proto:'rtsp' },
];

function enc(s) {
    if (!s) return '';
    return s.replace(/%/g,'%25').replace(/@/g,'%40').replace(/#/g,'%23')
            .replace(/:/g,'%3A').replace(/\?/g,'%3F').replace(/ /g,'%20');
}
function buildUrl(proto, ip, user, pass, p) {
    const auth = user ? `${enc(user)}:${enc(pass)}@` : '';
    return proto === 'http' ? `http://${auth}${ip}/${p}` : `rtsp://${auth}${ip}:554/${p}`;
}

async function ping(ip) {
    try {
        const { stdout } = await execAsync(`ping -n 2 -w 3000 ${ip}`, { timeout: 8000 });
        return stdout.includes('TTL=');
    } catch { return false; }
}

// ── Capture แบบเก็บ error สั้นกระชับ (ไม่ dump stderr เต็ม) ─────────────
async function tryCapture(url, proto, timeoutSec) {
    const tmp = path.join(os.tmpdir(), `diag_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
    const us  = timeoutSec * 1_000_000;
    const args = proto === 'http'
        ? ['-y','-timeout',String(us),'-reconnect','1','-reconnect_streamed','1','-i',url,'-vframes','1','-q:v','2','-update','1',tmp]
        : ['-y','-rtsp_transport','tcp','-timeout',String(us),'-i',url,'-frames:v','1','-q:v','3','-update','1',tmp];

    return new Promise(resolve => {
        const proc = spawn(FFMPEG_PATH, args, { stdio:['ignore','pipe','pipe'] });
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve({ ok:false, reason:'timeout', detail:'ไม่ตอบสนองภายในเวลาที่กำหนด' });
        }, (timeoutSec+2)*1000);

        proc.on('close', code => {
            clearTimeout(timer);
            if (code===0 && fs.existsSync(tmp)) {
                const size = fs.statSync(tmp).size;
                fs.unlinkSync(tmp);
                if (size > 2000) resolve({ ok:true, reason:'ok', detail:`${(size/1024).toFixed(1)}KB` });
                else resolve({ ok:false, reason:'black_or_tiny', detail:`ไฟล์เล็กผิดปกติ ${size} bytes (อาจจอดำ)` });
            } else {
                if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
                // แยกสาเหตุจาก stderr แบบละเอียด
                let reason='unknown', detail=stderr.split('\n').filter(Boolean).pop() || '';
                if (stderr.includes('-138') || stderr.includes('Connection refused'))
                    { reason='port_closed'; detail='Port ปิด/ไม่เปิด RTSP service (Connection refused)'; }
                else if (stderr.includes('401') || stderr.includes('Unauthorized'))
                    { reason='auth_fail'; detail='Username/Password ผิด'; }
                else if (stderr.includes('No route to host'))
                    { reason='no_route'; detail='ไม่มีเส้นทางเครือข่ายไปถึง (VLAN/Routing ปัญหา)'; }
                else if (stderr.includes('Unexpected offset') || stderr.includes('Will reconnect'))
                    { reason='unstable_stream'; detail='Stream ไม่เสถียร ต้อง reconnect หลายรอบ (ใกล้สำเร็จ ลอง timeout นานขึ้น)'; }
                else if (stderr.includes('Invalid data found'))
                    { reason='invalid_stream'; detail='URL/path ผิด ไม่ใช่ video stream'; }
                else if (stderr.includes('404'))
                    { reason='not_found'; detail='URL path ไม่มีอยู่จริง (404)'; }
                else if (stderr.includes('timed out') || stderr.includes('Operation now in progress'))
                    { reason='network_timeout'; detail='เชื่อมต่อได้แต่ไม่ตอบสนอง (firewall/slow network)'; }
                resolve({ ok:false, reason, detail });
            }
        });
    });
}

async function testCamera(ip) {
    console.log(`\n╔════════════════════════════════════════════╗`);
    console.log(`║  ${ip.padEnd(44)}║`);
    console.log(`╚════════════════════════════════════════════╝`);

    const alive = await ping(ip);
    console.log(`Ping: ${alive ? '✅ OK' : '❌ FAIL (ICMP blocked หรือกล้องดับจริง)'}`);

    const results = [];
    for (const cred of ALL_CREDS) {
        const url = buildUrl(cred.proto, ip, cred.u, cred.p, cred.path);
        const res = await tryCapture(url, cred.proto, TIMEOUT_SEC);
        results.push({ label: cred.label, ...res });
        const icon = res.ok ? '✅' : '❌';
        console.log(`  ${icon} ${cred.label.padEnd(25)} → ${res.reason.padEnd(16)} ${res.detail}`);
        if (res.ok) break; // เจอแล้วหยุด
    }

    const success = results.find(r => r.ok);
    return { ip, alive, success: !!success, results };
}

async function main() {
    let ips = MANUAL_IPS;

    if (ips.length === 0) {
        console.log('ไม่ได้ระบุ IP — ดึงจาก DB (status offline/error)...');
        await connectDB();
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT ip_address FROM dbo.cctv_cameras
            WHERE status IN ('offline','error') AND ip_address IS NOT NULL
        `);
        ips = r.recordset.map(x => x.ip_address);
    }

    console.log(`\nจะทดสอบทั้งหมด ${ips.length} ตัว...\n`);

    const summary = [];
    for (const ip of ips) {
        const result = await testCamera(ip);
        summary.push(result);
        await new Promise(r => setTimeout(r, 1000));
    }

    // ── สรุปผลรวม จัดกลุ่มตามสาเหตุ ──────────────────────────────────────
    console.log(`\n\n═══════════════════════════════════════════════`);
    console.log(`  สรุปผลทั้งหมด (${summary.length} ตัว)`);
    console.log(`═══════════════════════════════════════════════`);

    const success = summary.filter(s => s.success);
    const failed  = summary.filter(s => !s.success);

    console.log(`\n✅ สำเร็จ: ${success.length} ตัว`);
    success.forEach(s => console.log(`   ${s.ip}`));

    console.log(`\n❌ ล้มเหลว: ${failed.length} ตัว — จัดกลุ่มตามสาเหตุหลัก:`);

    const byReason = {};
    for (const s of failed) {
        const lastReason = s.results[s.results.length-1]?.reason || 'unknown';
        if (!byReason[lastReason]) byReason[lastReason] = [];
        byReason[lastReason].push(s.ip);
    }

    for (const [reason, ipList] of Object.entries(byReason)) {
        console.log(`\n   [${reason}] (${ipList.length} ตัว)`);
        ipList.forEach(ip => console.log(`     - ${ip}`));
    }

    console.log(`\n═══════════════════════════════════════════════`);
    console.log('คำแนะนำตามสาเหตุ:');
    console.log('  port_closed      → กล้องไม่เปิด RTSP, ต้องหา path HTTP snapshot แทน');
    console.log('  auth_fail        → ต้องถามช่างหา username/password จริง');
    console.log('  unstable_stream  → เพิ่ม TIMEOUT_SEC หรือลด concurrency ลงอีก');
    console.log('  no_route         → เช็ค VLAN/network routing, อาจต้องคุย IT network');
    console.log('  network_timeout  → เช็ค firewall ระหว่าง server กับกล้อง');
    console.log(`═══════════════════════════════════════════════`);
}

main();