// ดึง % หมึกจากพรินเตอร์ Ricoh: ลอง SNMP ก่อน (แม่นกว่า) -> ถ้าไม่ได้ผล fallback ไป HTTP scrape
// ต้อง: npm install net-snmp   (ใน backend project)

import snmp from "net-snmp";
import http from "http";

const SNMP_BASE_OID = "1.3.6.1.2.1.43.11.1.1"; // Printer-MIB มาตรฐาน
const SNMP_COMMUNITY = "public";
const TIMEOUT_MS = 4000;
const COLORS = ["Black", "Cyan", "Magenta", "Yellow"];
const COLOR_CODE = { Black: "K", Cyan: "C", Magenta: "M", Yellow: "Y" };
const HTTP_BAR_FULL_WIDTH = 160;

// ดึงหน้าเว็บด้วย Node's http module ตรงๆ แทน fetch()
// เพราะ fetch เป็น built-in ของ Node 18+ เท่านั้น เซิร์ฟเวอร์บางเครื่องใช้ Node เก่ากว่านั้นผ่าน pm2
function httpGetText(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: timeoutMs }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume(); // ทิ้ง response ไม่ให้ค้าง memory
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => resolve(body));
        });

        req.on("timeout", () => {
            req.destroy(new Error("Request timeout"));
        });
        req.on("error", (err) => reject(err));
    });
}

function emptyToner() {
    return { Black: null, Cyan: null, Magenta: null, Yellow: null };
}

function getTonerBySnmp(ip) {
    return new Promise((resolve) => {
        const session = snmp.createSession(ip, SNMP_COMMUNITY, {
            timeout: TIMEOUT_MS,
            version: snmp.Version2c,
        });

        const toners = [];

        session.subtree(
            SNMP_BASE_OID,
            (varbinds) => {
                for (const vb of varbinds) {
                    if (snmp.isVarbindError(vb)) continue;
                    const oid = vb.oid;
                    if (!oid.startsWith(SNMP_BASE_OID + ".6.1.")) continue;
                    const description = vb.value.toString();
                    if (!/toner/i.test(description)) continue;
                    if (/waste/i.test(description)) continue;
                    const index = oid.split(".").pop();
                    toners.push({ index, name: description, max: -1, level: -1 });
                }
            },
            (error) => {
                if (error || toners.length === 0) {
                    session.close();
                    return resolve(null);
                }

                const oids = [];
                for (const t of toners) {
                    oids.push(`${SNMP_BASE_OID}.8.1.${t.index}`);
                    oids.push(`${SNMP_BASE_OID}.9.1.${t.index}`);
                }

                session.get(oids, (err2, varbinds2) => {
                    session.close();
                    if (err2) return resolve(null);

                    varbinds2.forEach((vb, i) => {
                        const toner = toners[Math.floor(i / 2)];
                        const value = snmp.isVarbindError(vb) ? -1 : Number(vb.value);
                        if (i % 2 === 0) toner.max = value;
                        else toner.level = value;
                    });

                    const result = emptyToner();
                    for (const color of COLORS) {
                        const toner = toners.find((t) =>
                            t.name.toLowerCase().includes(color.toLowerCase())
                        );
                        if (toner && toner.max > 0 && toner.level >= 0) {
                            const pct = Math.round((toner.level * 100) / toner.max);
                            result[color] = Math.min(100, Math.max(0, pct));
                        }
                    }
                    resolve({ method: "SNMP", ...result });
                });
            }
        );

        session.on("error", () => resolve(null));
    });
}

async function getTonerByHttp(ip) {
    const url = `http://${ip}/web/guest/en/websys/webArch/getStatus.cgi`;
    const html = await httpGetText(url, TIMEOUT_MS);
    if (!html) return null;

    const result = emptyToner();
    let found = false;

    for (const color of COLORS) {
        const code = COLOR_CODE[color];
        const imageName = `deviceStTnBar${code}.gif`;
        const pattern = new RegExp(`<img\\b(?=[^>]*${imageName})[^>]*>`, "i");
        const match = html.match(pattern);
        if (!match) continue;

        const widthMatch = match[0].match(/width\s*=\s*["'](\d+)["']/i);
        if (!widthMatch) continue;

        const width = parseInt(widthMatch[1], 10);
        result[color] = Math.min(100, Math.max(0, Math.round((width * 100) / HTTP_BAR_FULL_WIDTH)));
        found = true;
    }

    return found ? { method: "HTTP", ...result } : null;
}

// ดึงข้อความสถานะเป็นคำของแต่ละสี (จาก img alt) — ใช้เป็นแหล่งข้อมูล error
// เพราะ HTML โซน Alert เต็มประโยคไม่เคยถูกยืนยัน แต่โซนนี้ยืนยันแล้วจาก HTML จริง
async function getTonerAlerts(ip) {
    const url = `http://${ip}/web/guest/en/websys/webArch/getStatus.cgi`;
    const html = await httpGetText(url, TIMEOUT_MS);
    if (!html) return [];

    const alerts = [];
    for (const color of COLORS) {
        const code = COLOR_CODE[color];
        const imageName = `deviceStTnBar${code}.gif`;
        const pattern = new RegExp(`<img\\b(?=[^>]*${imageName})[^>]*>`, "i");
        const match = html.match(pattern);
        if (!match) continue;

        const altMatch = match[0].match(/alt\s*=\s*["']([^"']+)["']/i);
        const status = altMatch ? altMatch[1] : null;
        if (!status) continue;

        if (!/status ok/i.test(status)) {
            alerts.push({ color, code: `TONER_${color.toUpperCase()}`, message: `${color}: ${status}` });
        }
    }
    return alerts;
}
// ยิง request เบาๆ ไปที่หน้าแรกของพรินเตอร์ เพื่อ "ปลุก" เครื่องที่อยู่โหมด
// Energy Saver / Sleep ให้ตื่นก่อน (เหมือนตอนเปิดเว็บพรินเตอร์ด้วยเบราว์เซอร์)
// ไม่สนใจผลลัพธ์ว่าสำเร็จไหม แค่ยิงให้เครื่องเริ่มตื่นตัว
async function wakePrinter(ip) {
    try {
        await httpGetText(`http://${ip}/`, 8000); // ให้เวลานานหน่อย เผื่อกำลังตื่นจาก sleep
    } catch (_) {
        // ไม่ต้อง handle error เพราะแค่ต้องการ "กระตุ้น" เครื่อง ไม่ได้ต้องการ response จริง
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// เช็ครอบเดียว: SNMP ก่อน -> fallback HTTP -> offline (ไม่มี retry ในนี้)
async function checkPrinterOnce(ip) {
    try {
        const snmpResult = await getTonerBySnmp(ip);
        if (snmpResult && COLORS.some((c) => snmpResult[c] !== null)) {
            return { online: true, ...snmpResult };
        }
    } catch (_) { /* ตกไป HTTP ต่อ */ }

    try {
        const httpResult = await getTonerByHttp(ip);
        if (httpResult) {
            return { online: true, ...httpResult };
        }
    } catch (_) { /* ไม่มีทางไหนได้ผล */ }

    return { online: false, method: null, ...emptyToner() };
}

// เช็คพรินเตอร์เครื่องเดียว พร้อม auto-retry แบบ "ปลุกเครื่องก่อน"
// เผื่อกรณีเครื่องอยู่โหมด Energy Saver/Sleep ทำให้รอบแรก timeout
// (พฤติกรรมเดียวกับที่ต้องเปิดเว็บพรินเตอร์ด้วยมือก่อน 1 ครั้งถึงจะดึงติด)
async function checkPrinter(ip) {
    const firstTry = await checkPrinterOnce(ip);
    if (firstTry.online) return firstTry;

    // รอบแรกไม่ติด -> ลองปลุกเครื่องแล้วเช็คซ้ำอีกรอบ
    await wakePrinter(ip);
    await sleep(2000); // ให้เวลาเครื่องตื่นเต็มที่ก่อนยิงรอบ 2

    return checkPrinterOnce(ip);
}

export { checkPrinter, getTonerAlerts };