import ldap from 'ldapjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// แก้ปัญหาเรื่อง Path สำหรับ ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ชี้ไปที่ไฟล์ .env ที่อยู่ถอยหลังขึ้นไป 2 ชั้น (จาก src/controllers ไปที่ Root)
dotenv.config({ path: path.join(__dirname, '../../.env') });

const AD_CONFIG = {
    url: process.env.AD_URL,
    bindDN: process.env.AD_BIND_DN,
    password: process.env.AD_BIND_PASSWORD,
    baseDN: process.env.AD_BASE_DN
};

// ตรวจสอบค่าก่อนเริ่ม
if (!AD_CONFIG.url) {
    console.error("❌ Error: AD_URL is undefined. .env file not found or empty!");
    process.exit(1);
}

console.log("--- AD Configuration Check ---");
console.log("Target URL:", AD_CONFIG.url);
console.log("Base DN:   ", AD_CONFIG.baseDN);
console.log("------------------------------");

const client = ldap.createClient({ 
    url: AD_CONFIG.url,
    connectTimeout: 5000,
    timeout: 5000
});

client.bind(AD_CONFIG.bindDN, AD_CONFIG.password, (err) => {
    if (err) {
        console.error("❌ Bind Failed! Error:", err.message);
        process.exit(1);
    }
    console.log("✅ Bind Successful!");

    const opts = {
        filter: '(sAMAccountName=saifon.c)', 
        scope: 'sub',
        attributes: ['mail', 'displayName', 'sAMAccountName']
    };

    client.search(AD_CONFIG.baseDN, opts, (err, res) => {
        if (err) {
            console.error("❌ Search Error:", err.message);
            process.exit(1);
        }

        let found = false;
        res.on('searchEntry', (entry) => {
            found = true;
            console.log("📧 [FOUND DATA ON SERVER]");
            
            // ✅ ใช้ entry.object เพื่อดูข้อมูลที่ AD ส่งกลับมาทั้งหมด
            console.log("Attributes found:");
            console.log(entry.object); 
            
            // ตรวจสอบชื่อ Field ที่ส่งมาจริงๆ
            console.log("----------------------------");
            console.log("Email value:", entry.object.mail || entry.object.Mail || "Not Found");
            console.log("Display Name:", entry.object.displayName || entry.object.displayname || "Not Found");
        });
    });
});