/**
 * pcReportController.js
 * รายงาน PC / Monitor Inventory (ใช้ตัว build เดียวกัน ต่างกันที่ตาราง)
 * ความปลอดภัยและคุณภาพข้อมูลเต็มรูปแบบอยู่ที่ /summary เดิมจึงไม่ซ้ำที่นี่
 */

import { getPool } from '../config/db.js';

const DAY = 86400000;
const WARRANTY_SOON_DAYS = 90;
const ymd = (d) => (d ? new Date(d) : null);

// ตารางที่มีคอลัมน์ประกัน/วันซื้อ/ผู้ใช้ (PC) กับตารางที่ไม่มี (MO)
const SOURCES = {
  pc: { table: 'info_pc_inventory', warranty: true },
  mo: { table: 'info_mo_inventory', warranty: false },
};

const buildReport = async (kind) => {
  const src = SOURCES[kind];
  const extra = src.warranty
    ? 'i.purchase_date, i.warranty_expire_date, i.[user],'
    : 'CAST(NULL AS DATETIME) AS purchase_date, CAST(NULL AS DATE) AS warranty_expire_date, CAST(NULL AS NVARCHAR(100)) AS [user],';
  const rows = (await getPool().request().query(`
    SELECT i.hostname, i.manufacturer, i.model, i.computer_type, i.pc_status, i.fix_asset,
           ${extra} i.os_install_date, i.updated_at, i.disposal_status, i.os_name, i.ram_gb,
           fl.name AS location_name
    FROM dbo.${src.table} i
    LEFT JOIN dbo.factory_layouts fl ON i.factory_layout_id = fl.id
  `)).recordset;

  const now = new Date();
  const isDisposed = (r) => r.disposal_status === 'Disposed';
  const isInactive = (r) => (r.pc_status || '').toLowerCase() === 'inactive';
  const disposedRows = rows.filter(isDisposed);
  const inactiveRows = rows.filter(r => !isDisposed(r) && isInactive(r));
  const active = rows.filter(r => !isDisposed(r) && !isInactive(r));
  const staleCutoff = now.getTime() - 30 * DAY;
  const staleCount = active.filter(r => r.updated_at && new Date(r.updated_at).getTime() < staleCutoff).length;
  const byStatus = { Active: active.length, Inactive: inactiveRows.length, Disposed: disposedRows.length };

  // ประกัน (เฉพาะ PC)
  const warranty = { expired: 0, soon: 0, valid: 0, unknown: 0 };
  const warrantyList = [];
  const yearMap = new Map();
  if (src.warranty) {
    for (const r of active) {
      const exp = ymd(r.warranty_expire_date);
      if (!exp || isNaN(exp)) { warranty.unknown++; continue; }
      const days = Math.round((exp - now) / DAY);
      if (days < 0) warranty.expired++;
      else if (days <= WARRANTY_SOON_DAYS) warranty.soon++;
      else warranty.valid++;
      const y = String(exp.getFullYear());
      yearMap.set(y, (yearMap.get(y) || 0) + 1);
      if (days <= WARRANTY_SOON_DAYS) {
        warrantyList.push({ hostname: r.hostname, fix_asset: r.fix_asset || '', manufacturer: r.manufacturer || '', model: r.model || '', location: r.location_name || '', user: r.user || '', warranty_expire_date: exp.toISOString().slice(0, 10), days });
      }
    }
    warrantyList.sort((a, b) => a.days - b.days);
  }
  const warrantyByYear = [...yearMap.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name));

  // อายุเครื่อง (จากวันซื้อ) เฉพาะ PC
  const age = { lt3: 0, y3to5: 0, gt5: 0, unknown: 0 };
  let ageTotal = 0, ageN = 0;
  if (src.warranty) {
    for (const r of active) {
      const p = ymd(r.purchase_date);
      if (!p || isNaN(p)) { age.unknown++; continue; }
      const years = (now - p) / (DAY * 365.25);
      ageTotal += years; ageN++;
      if (years < 3) age.lt3++;
      else if (years <= 5) age.y3to5++;
      else age.gt5++;
    }
  } else {
    age.unknown = active.length;
  }

  const countBy = (list, keyFn) => {
    const m = new Map();
    for (const r of list) {
      const k = keyFn(r) || '(ไม่ระบุ)';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  };

  const kpi = {
    total: rows.length,
    active: active.length,
    inactive: inactiveRows.length,
    disposed: disposedRows.length,
    warrantyExpired: warranty.expired,
    warrantySoon: warranty.soon,
    avgAgeYears: ageN ? Math.round((ageTotal / ageN) * 10) / 10 : null,
    over5Years: age.gt5,
    noFixAsset: active.filter(r => !r.fix_asset || !String(r.fix_asset).trim()).length,
    noPurchaseDate: age.unknown,
    stale30: staleCount,
  };

  return {
    generatedAt: now.toISOString(),
    hasWarranty: src.warranty,
    kpi,
    byStatus,
    warranty,
    age,
    warrantyByYear,
    warrantyList: warrantyList.slice(0, 200),
    byManufacturer: countBy(active, r => (r.manufacturer || '').trim()).slice(0, 10),
    byType: countBy(active, r => (r.computer_type || '').trim()),
    byLocation: countBy(active, r => (r.location_name || '').trim()).slice(0, 12),
    byOs: countBy(active, r => (r.os_name || '').replace(/^Microsoft\s+/i, '').trim()).slice(0, 8),
    byRam: countBy(active, r => (r.ram_gb == null ? '' : `${Math.round(Number(r.ram_gb))} GB`)),
  };
};

const handler = (kind) => async (req, res) => {
  try {
    res.json(await buildReport(kind));
  } catch (err) {
    console.error(`[${kind.toUpperCase()}Report] error:`, err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /pc-inventory/report
export const getPCReport = handler('pc');
// GET /mo-inventory/report
export const getMOReport = handler('mo');
