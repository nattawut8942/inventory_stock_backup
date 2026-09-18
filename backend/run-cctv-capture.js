// run-cctv-capture.js
// รันด้วย: node run-cctv-capture.js
// (หรือดับเบิลคลิก run-cctv-capture.bat แทนก็ได้ ไม่ต้องพิมพ์ command เอง)
//
// Standalone runner — ใช้ทดสอบ capture + ส่งเมลด้วยตัวเองได้ทุกเมื่อ
// ไม่กระทบ cron ที่ตั้งไว้ใน server.js (แยกจากกันคนละ process)

import { runCctvCaptureJob } from './src/cctv/cctvCaptureJob.js';

console.log('════════════════════════════════════════');
console.log('  CCTV Capture — Manual Run');
console.log('════════════════════════════════════════\n');

runCctvCaptureJob()
    .then(result => {
        console.log('\n════════════════════════════════════════');
        console.log('✅ เสร็จสมบูรณ์');
        console.log(`   Run ID   : ${result.runId}`);
        console.log(`   ทั้งหมด  : ${result.total} ตัว`);
        console.log(`   Online   : ${result.online} ตัว`);
        console.log(`   Offline  : ${result.offline} ตัว`);
        console.log(`   Error    : ${result.error} ตัว`);
        console.log(`   ถอดออก  : ${result.removed} ตัว`);
        console.log('════════════════════════════════════════');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ เกิดข้อผิดพลาด:', err.message);
        console.error(err.stack);
        process.exit(1);
    });