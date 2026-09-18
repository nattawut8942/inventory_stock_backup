// test-single-camera.js
// รันด้วย: node test-single-camera.js <IP>
// เช่น: node test-single-camera.js 192.168.66.150
//
// ทดสอบ ping + capture กล้องตัวเดียว แสดง error ละเอียดทุก credential ที่ลอง

import { exec, spawn } from 'child_process';
import { promisify }   from 'util';
import fs   from 'fs';
import path from 'path';
import os   from 'os';

const execAsync = promisify(exec);
const FFMPEG_PATH = 'C:\\ffmpeg\\bin\\ffmpeg.exe'; // ← แก้ path ถ้าไม่ตรง
const TIMEOUT_SEC  = 10;

const ip = process.argv[2];
if (!ip) {
    console.log('วิธีใช้: node test-single-camera.js <IP>');
    console.log('ตัวอย่าง: node test-single-camera.js 192.168.66.150');
    process.exit(1);
}

// ── credential ทุกแบบที่มีในระบบ ลองให้หมดทีละอัน ──────────────────────
const PAN = 'cam/realmonitor?channel=1&subtype=1';
const ALL_CREDS = [
    { label:'No Auth (RTSP default path)',       u:'',      p:'',           path:PAN,                                proto:'rtsp' },
    { label:'No Auth (HTTP snapshot)',            u:'',      p:'',           path:'record/current.jpg',              proto:'http' },
    { label:'No Auth (Hikvision path)',           u:'',      p:'',           path:'Streaming/Channels/101',          proto:'rtsp' },
    { label:'admin/12345 (Panasonic default)',    u:'admin', p:'12345',      path:PAN,                                proto:'rtsp' },
    { label:'admin/Admin12345',                   u:'admin', p:'Admin12345', path:PAN,                                proto:'rtsp' },
    { label:'admin/@dmin12345 (Advidia)',         u:'admin', p:'@dmin12345', path:PAN,                                proto:'rtsp' },
    { label:'admin/meinsm (Mobotix)',             u:'admin', p:'meinsm',     path:'record/current.jpg',              proto:'http' },
    { label:'admin/meinsm (Mobotix faststream)',  u:'admin', p:'meinsm',     path:'cgi-bin/faststream.jpg',          proto:'http' },
    { label:'admin/meinsm (Mobotix userimage)',   u:'admin', p:'meinsm',     path:'control/userimage.html',          proto:'http' },
    { label:'admin/Admin12345 (Hikvision)',       u:'admin', p:'Admin12345', path:'Streaming/Channels/101',          proto:'rtsp' },
    { label:'admin/12345 (Hikvision)',            u:'admin', p:'12345',      path:'Streaming/Channels/101',          proto:'rtsp' },
    { label:'root/admin (Axis)',                  u:'root',  p:'admin',      path:'axis-media/media.amp',            proto:'rtsp' },
    { label:'admin/12345 (Panasonic Digest HTTP)',u:'admin', p:'12345',      path:'cgi-bin/camera?resolution=640x480',proto:'http', auth:'digest' },
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

// ── Ping ──────────────────────────────────────────────────────────────────
async function ping(ip) {
    try {
        console.log(`\n🔍 Pinging ${ip}...`);
        const { stdout } = await execAsync(`ping -n 2 -w 3000 ${ip}`, { timeout: 8000 });
        const alive = stdout.includes('TTL=');
        console.log(alive ? '✅ Ping OK' : '❌ Ping FAILED');
        if (!alive) console.log(stdout);
        return alive;
    } catch (e) {
        console.log('❌ Ping ERROR:', e.message);
        return false;
    }
}

// ── FFmpeg Capture with full stderr shown ──────────────────────────────────
async function captureAndShow(url, proto, authType, label) {
    const safeUrl = url.replace(/:[^:@/]+@/, ':***@');
    console.log(`\n──────────────────────────────────────────────`);
    console.log(`Trying: ${label}`);
    console.log(`URL: ${safeUrl}`);

    const tmp = path.join(os.tmpdir(), `test_${Date.now()}.jpg`);
    const us  = TIMEOUT_SEC * 1_000_000;
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
            console.log('❌ TIMEOUT (ไม่ตอบสนองภายในเวลาที่กำหนด)');
            resolve(false);
        }, (TIMEOUT_SEC+2)*1000);

        proc.on('close', code => {
            clearTimeout(timer);
            if (code===0 && fs.existsSync(tmp)) {
                const size = fs.statSync(tmp).size;
                fs.unlinkSync(tmp);
                if (size > 500) {
                    console.log(`✅ SUCCESS — ได้ภาพขนาด ${(size/1024).toFixed(1)} KB`);
                    resolve(true);
                } else {
                    console.log(`⚠️  ได้ไฟล์แต่เล็กเกินไป (${size} bytes) — อาจเป็นจอดำ`);
                    resolve(false);
                }
            } else {
                if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
                console.log('❌ FAILED');
                console.log('--- FFmpeg stderr (ดูบรรทัดสุดท้ายเพื่อหาสาเหตุ) ---');
                console.log(stderr.split('\n').slice(-8).join('\n'));
                resolve(false);
            }
        });
    });
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
    console.log(`═══════════════════════════════════════════════`);
    console.log(`  Testing Camera: ${ip}`);
    console.log(`═══════════════════════════════════════════════`);

    if (!fs.existsSync(FFMPEG_PATH)) {
        console.log(`❌ ไม่พบ FFmpeg ที่ ${FFMPEG_PATH} — แก้ path บรรทัด FFMPEG_PATH ในไฟล์นี้ก่อน`);
        process.exit(1);
    }

    const alive = await ping(ip);
    if (!alive) {
        console.log('\n⚠️  Ping ไม่ผ่าน แต่จะลอง capture ต่อเผื่อ ICMP ถูกบล็อกแต่ RTSP/HTTP ใช้ได้');
    }

    let success = false;
    for (const cred of ALL_CREDS) {
        const url = buildUrl(cred.proto, ip, cred.u, cred.p, cred.path);
        const ok  = await captureAndShow(url, cred.proto, cred.auth, cred.label);
        if (ok) { success = true; break; }
    }

    console.log(`\n═══════════════════════════════════════════════`);
    if (success) {
        console.log('✅ สรุป: Capture ได้สำเร็จ');
    } else {
        console.log('❌ สรุป: ลองทุก credential แล้วไม่สำเร็จ');
        console.log('\nแนะนำ:');
        console.log('  1. ลองเปิด VLC → Media → Open Network Stream → ใส่ RTSP URL ตรงๆ');
        console.log('  2. เช็ค username/password จริงจากป้ายที่ติดกล้อง หรือถามช่างที่ติดตั้ง');
        console.log('  3. ลอง curl -v http://' + ip + '/  เพื่อดู header ว่ากล้องยี่ห้ออะไร รุ่นอะไร');
        console.log('  4. ถ้ารุ่นเดียวกันกับตัวที่ได้ผล ลอง path เดียวกันแต่เปลี่ยนแค่ user/pass ดู');
    }
    console.log(`═══════════════════════════════════════════════`);
}

main();