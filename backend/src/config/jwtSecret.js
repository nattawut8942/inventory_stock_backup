/**
 * jwtSecret.js
 * ศูนย์กลางการอ่าน JWT secret — ไม่มีค่า fallback ในโค้ด
 * อ่าน env ตอนเรียกใช้ (ไม่ใช่ตอน import) เพราะ server.js เรียก dotenv.config() หลัง import
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET ไม่ได้ตั้งค่า หรือสั้นเกินไป (ต้องอย่างน้อย 32 ตัวอักษร)');
  }
  return secret;
}
