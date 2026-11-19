/**
 * ipSyncController.js
 * เติมข้อมูล IP Management จากตาราง PC / MO Inventory (ด้วย ip_address)
 * กฎ: เติมเฉพาะช่องที่ว่างใน IP Management, ไม่เขียนทับค่าเดิม,
 *      ค่าที่ขัดกัน (ชื่อเครื่อง, MAC) แสดงเป็น conflict ให้ตรวจเอง, IP ที่ซ้ำหลายเครื่องข้ามทั้งหมด
 */

import { getPool, sql } from '../config/db.js';

const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const ACTOR = 'sync PC/MO';
// วงที่ไม่เติมอัตโนมัติ: ผสม DHCP และ Static ทำให้จับคู่ IP กับเครื่องไม่แน่นอน
const EXCLUDED_PREFIXES = ['10.49.24.', '10.49.25.'];
const isExcluded = (ip) => EXCLUDED_PREFIXES.some(p => ip.startsWith(p));
const nowBKK = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
const blank = (v) => v == null || String(v).trim() === '' || String(v).trim() === '-';
const clean = (v) => (blank(v) ? null : String(v).trim());
const normMac = (v) => {
  const s = clean(v);
  if (!s) return null;
  const n = s.toUpperCase().replace(/-/g, ':');
  return MAC_RE.test(n) ? n : null;
};

// ค่าที่จะเติม: [ปลายทางใน ip_management, ค่าจาก source, ความยาวสูงสุด]
const FIELD_MAP = [
  { field: 'mac_address', max: 17, pick: (r) => normMac(r.mac_address) },
  { field: 'device', max: 50, pick: (r) => clean(r.model) },
  { field: 'serial_number', max: 100, pick: (r) => clean(r.serial_number) },
  { field: 'asset_tag', max: 50, pick: (r) => clean(r.fix_asset) },
  { field: 'location', max: 150, pick: (r) => clean(r.location_name) },
  { field: 'contact', max: 120, pick: (r) => clean(r.user) },
];

async function loadSources(pool) {
  const pc = (await pool.request().query(`
    SELECT 'PC' AS source, i.hostname, i.ip_address, i.mac_address, i.model, i.serial_number, i.fix_asset,
           i.[user] AS [user], fl.name AS location_name
    FROM dbo.info_pc_inventory i LEFT JOIN dbo.factory_layouts fl ON i.factory_layout_id = fl.id
    WHERE i.ip_address IS NOT NULL AND i.ip_address <> ''`)).recordset;
  const mo = (await pool.request().query(`
    SELECT 'MO' AS source, i.hostname, i.ip_address, i.mac_address, i.model, i.serial_number, i.fix_asset,
           CAST(NULL AS NVARCHAR(100)) AS [user], fl.name AS location_name
    FROM dbo.info_mo_inventory i LEFT JOIN dbo.factory_layouts fl ON i.factory_layout_id = fl.id
    WHERE i.ip_address IS NOT NULL AND i.ip_address <> ''`)).recordset;
  return [...pc, ...mo];
}

// คำนวณผลการเติม (ยังไม่เขียน DB)
export async function computeSync(pool) {
  const sources = await loadSources(pool);
  const byIp = new Map();
  for (const r of sources) {
    const ip = String(r.ip_address).trim();
    if (!byIp.has(ip)) byIp.set(ip, []);
    byIp.get(ip).push(r);
  }

  const ipRows = (await pool.request().query(`
    SELECT ip_address, hostname, mac_address, device, serial_number, asset_tag, location, contact
    FROM dbo.ip_management`)).recordset;
  const ipMap = new Map(ipRows.map(r => [String(r.ip_address).trim(), r]));

  const fills = [];       // { ip, source, hostname, changes: { field: {from, to} } }
  const conflicts = [];   // { ip, field, current, incoming, source, hostname }
  const duplicates = [];  // IP ที่มีมากกว่า 1 เครื่อง
  let notInIpm = 0, noChange = 0, excluded = 0;

  for (const [ip, list] of byIp) {
    if (isExcluded(ip)) { excluded++; continue; }
    const cur = ipMap.get(ip);
    if (!cur) { notInIpm++; continue; }
    if (list.length > 1) {
      duplicates.push({ ip, machines: list.map(l => `${l.hostname} (${l.source})`) });
      continue;
    }
    const src = list[0];
    const changes = {};
    for (const f of FIELD_MAP) {
      const incoming = f.pick(src);
      if (!incoming || incoming.length > f.max) continue;
      const current = cur[f.field];
      if (blank(current)) {
        changes[f.field] = { from: null, to: incoming };
      } else if (String(current).trim().toLowerCase() !== incoming.toLowerCase()) {
        conflicts.push({ ip, field: f.field, current: String(current).trim(), incoming, source: src.source, hostname: src.hostname });
      }
    }
    // ชื่อเครื่อง: ใช้ค่าจาก PC/MO เสมอ (เป็นข้อมูล realtime) ถ้าไม่ตรงกับ IP Management
    const curHost = clean(cur.hostname);
    const incomingHost = clean(src.hostname);
    if (incomingHost && incomingHost.length <= 253 && (!curHost || curHost.toLowerCase() !== incomingHost.toLowerCase())) {
      changes.hostname = { from: curHost, to: incomingHost };
    }
    if (Object.keys(changes).length) fills.push({ ip, source: src.source, hostname: src.hostname, changes });
    else noChange++;
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: { sourceRows: sources.length, distinctIps: byIp.size },
    counts: {
      fills: fills.length,
      fieldChanges: fills.reduce((s, f) => s + Object.keys(f.changes).length, 0),
      conflicts: conflicts.length,
      duplicateIps: duplicates.length,
      notInIpm,
      noChange,
      excluded,
    },
    fills,
    conflicts,
    duplicates,
  };
}

// ─── GET /ip-scan/sync/preview ───────────────────────────────────────────────
export const previewSync = async (req, res) => {
  try {
    const plan = await computeSync(getPool());
    res.json({
      ...plan,
      fills: plan.fills.slice(0, 500),
      conflicts: plan.conflicts.slice(0, 500),
      duplicates: plan.duplicates.slice(0, 200),
    });
  } catch (err) {
    console.error('[IPSync] preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /ip-scan/sync/apply ────────────────────────────────────────────────
// body: { ips?: string[] } — ถ้าไม่ส่ง = ทุก IP ที่มีค่าเติม
export const applySync = async (req, res) => {
  try {
    const pool = getPool();
    // คำนวณใหม่ฝั่ง server ทุกครั้ง (ไม่เชื่อค่าจาก client) แล้วกรองเฉพาะ IP ที่เลือกถ้ามี
    const only = Array.isArray(req.body?.ips) ? new Set(req.body.ips.map(String)) : null;
    const fullFills = (await computeSync(pool)).fills.filter(f => !only || only.has(f.ip));
    if (!fullFills.length) return res.json({ success: true, applied: 0, fieldChanges: 0 });

    const tx = pool.transaction();
    await tx.begin();
    let applied = 0, fieldChanges = 0;
    try {
      for (const f of fullFills) {
        const cols = Object.keys(f.changes);
        const r = tx.request().input('ip', sql.VarChar(45), f.ip);
        const sets = [];
        for (const c of cols) {
          if (c === 'hostname') {
            // ชื่อเครื่องเขียนทับได้ (ยึดค่า PC/MO)
            r.input('hostname', sql.VarChar(253), f.changes.hostname.to);
            sets.push('hostname = @hostname');
            continue;
          }
          const meta = FIELD_MAP.find(m => m.field === c);
          r.input(c, sql.NVarChar(meta.max), f.changes[c].to);
          sets.push(`${c} = CASE WHEN ${c} IS NULL OR LTRIM(RTRIM(${c})) = '' THEN @${c} ELSE ${c} END`);
        }
        r.input('updated_at', sql.VarChar(19), nowBKK());
        r.input('updated_by', sql.NVarChar(120), ACTOR);
        sets.push('updated_at = @updated_at', 'updated_by = @updated_by');
        await r.query(`UPDATE dbo.ip_management SET ${sets.join(', ')} WHERE ip_address = @ip`);

        // ประวัติ: เฉพาะค่าที่เปลี่ยนจริง
        const changes = {};
        for (const c of cols) changes[c] = f.changes[c];
        await tx.request()
          .input('ip', sql.VarChar(45), f.ip)
          .input('changes', sql.NVarChar(sql.MAX), JSON.stringify(changes))
          .input('by', sql.NVarChar(120), ACTOR)
          .input('at', sql.VarChar(19), nowBKK())
          .query(`INSERT INTO dbo.ip_management_history (ip_address, action, changes, changed_by, changed_at)
                  VALUES (@ip, 'update', @changes, @by, @at)`);
        applied++;
        fieldChanges += cols.length;
      }
      await tx.commit();
    } catch (err) {
      try { await tx.rollback(); } catch { /* ignore */ }
      throw err;
    }
    res.json({ success: true, applied, fieldChanges });
  } catch (err) {
    console.error('[IPSync] apply error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
