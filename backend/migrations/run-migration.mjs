// รัน migration: node migrations/run-migration.mjs <ไฟล์.sql>
// อ่าน DB config จาก .env เหมือน server (ไม่พิมพ์ค่า credential)
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { connectDB, getPool } from '../src/config/db.js';

const file = process.argv[2];
if (!file) { console.error('usage: node migrations/run-migration.mjs <file.sql>'); process.exit(1); }
const sqlText = fs.readFileSync(path.resolve(file), 'utf8');
// แยก batch ด้วย GO (รูปแบบ SSMS)
const batches = sqlText.split(/^\s*GO\s*$/mi).length > 1
  ? sqlText.split(/^\s*GO\s*$/mi)
  : [sqlText];

await connectDB();
const pool = getPool();
for (const b of batches) {
  if (!b.trim()) continue;
  await pool.request().batch(b);
}
console.log('migration applied:', path.basename(file));
process.exit(0);
