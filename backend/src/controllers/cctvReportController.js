import sql from 'mssql';
import { getPool } from '../config/db.js';

// รายงาน CCTV รายช่วงเวลา — คำนวณฝั่ง backend จาก cctv_status_daily (uptime รายวัน),
// cctv_status_events (การเปลี่ยนสถานะ) และ cctv_maintenance_logs (การซ่อม/ถอด)
// หมายเหตุ: นับเฉพาะเหตุการณ์ที่เกิดในช่วงที่เลือก ถ้ากล้องออฟไลน์ก่อนช่วงนั้นจะนับเวลาดาวน์ตั้งแต่ต้นช่วง
const UPTIME_TARGET = 95;   // % เป้าหมาย uptime ต่อกล้อง
const MAX_EVENTS = 200;     // จำนวนเหตุการณ์ล่าสุดที่ส่งให้ตาราง

// ช่วงเวลา: รับ from/to (YYYY-MM-DD) หรือ days (ย้อนหลังจากวันนี้) — ค่าเริ่มต้น 30 วัน
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseRange = (q) => {
    const today = new Date();
    let to = isYmd(q.to) ? q.to : ymd(today);
    let from;
    if (isYmd(q.from)) from = q.from;
    else {
        const n = Math.min(3650, Math.max(1, parseInt(q.days, 10) || 30));
        const d = new Date(today);
        d.setDate(d.getDate() - (n - 1));
        from = ymd(d);
    }
    if (from > to) [from, to] = [to, from];
    const fromDt = new Date(`${from}T00:00:00`);
    const toEnd = new Date(`${to}T00:00:00`);
    toEnd.setDate(toEnd.getDate() + 1); // ขอบบนแบบไม่รวม (ถึงสิ้นวัน to)
    const days = Math.round((new Date(`${to}T00:00:00`) - fromDt) / 86400000) + 1;
    return { from, to, fromDt, toEnd, days };
};

const pct = (online, total) => (total ? Math.round((online / total) * 1000) / 10 : null);

const dayKey = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const getCctvReport = async (req, res) => {
    try {
        const range = parseRange(req.query);
        const { from, to, fromDt, toEnd } = range;
        const pool = await getPool();

        const cams = (await pool.request().query(`
            SELECT c.id, c.name, c.ip_address, c.status, c.last_ping,
                   fl.name AS layout_name, r.name AS rack_name
            FROM dbo.cctv_cameras c
            LEFT JOIN dbo.factory_layouts fl ON fl.id = c.factory_layout_id
            LEFT JOIN dbo.cctv_racks r       ON r.id  = c.rack_id
        `)).recordset;

        const daily = (await pool.request().input('from', sql.VarChar(10), from).input('to', sql.VarChar(10), to)
            .input('fromDt', sql.DateTime, fromDt).input('toEnd', sql.DateTime, toEnd).query(`
            SELECT camera_id, [day], online_count, total_count
            FROM dbo.cctv_status_daily
            WHERE [day] >= CAST(@from AS DATE) AND [day] <= CAST(@to AS DATE)
        `)).recordset;

        const events = (await pool.request().input('from', sql.VarChar(10), from).input('to', sql.VarChar(10), to)
            .input('fromDt', sql.DateTime, fromDt).input('toEnd', sql.DateTime, toEnd).query(`
            SELECT id, camera_id, status, prev_status, source, changed_at
            FROM dbo.cctv_status_events
            WHERE changed_at >= @fromDt AND changed_at < @toEnd
            ORDER BY camera_id, changed_at
        `)).recordset;

        const maint = (await pool.request().input('from', sql.VarChar(10), from).input('to', sql.VarChar(10), to)
            .input('fromDt', sql.DateTime, fromDt).input('toEnd', sql.DateTime, toEnd).query(`
            SELECT camera_id, log_type, COUNT(*) AS cnt
            FROM dbo.cctv_maintenance_logs
            WHERE reported_at >= @fromDt AND reported_at < @toEnd AND camera_id IS NOT NULL
            GROUP BY camera_id, log_type
        `)).recordset;

        // ── รวมต่อกล้อง ─────────────────────────────────────────────
        const logs = (await pool.request().input('from', sql.VarChar(10), from).input('to', sql.VarChar(10), to)
            .input('fromDt', sql.DateTime, fromDt).input('toEnd', sql.DateTime, toEnd).query(`
            SELECT m.id, m.log_type, m.camera_id, m.camera_name, m.issue_type, m.reason, m.status,
                   m.factory_name, m.new_location, m.assigned_to, m.reported_by,
                   m.reported_at, m.resolved_at, m.reinstalled_at, m.description, m.solution
            FROM dbo.cctv_maintenance_logs m
            WHERE m.reported_at >= @fromDt AND m.reported_at < @toEnd
            ORDER BY m.reported_at DESC
        `)).recordset;

        const perCam = new Map(cams.map((c) => [c.id, {
            id: c.id, name: c.name, ip: c.ip_address, layout: c.layout_name || '-', rack: c.rack_name || '-',
            status: c.status, lastPing: c.last_ping,
            online: 0, total: 0, offlineCount: 0, downtimeMs: 0, lastOfflineAt: null, repairCount: 0, removalCount: 0,
        }]));

        for (const d of daily) {
            const o = perCam.get(d.camera_id);
            if (!o) continue;
            o.online += d.online_count;
            o.total += d.total_count;
        }

        // จับคู่เหตุการณ์ offline กับ online ถัดไปของกล้องเดียวกัน เพื่อรวมเวลาดาวน์
        const openOffline = new Map();
        for (const e of events) {
            const o = perCam.get(e.camera_id);
            if (!o) continue;
            const t = new Date(e.changed_at).getTime();
            if (e.status === 'offline') {
                o.offlineCount += 1;
                o.lastOfflineAt = e.changed_at;
                if (!openOffline.has(e.camera_id)) openOffline.set(e.camera_id, t);
            } else if (openOffline.has(e.camera_id)) {
                o.downtimeMs += t - openOffline.get(e.camera_id);
                openOffline.delete(e.camera_id);
            }
        }
        const now = Date.now();
        for (const [id, t] of openOffline) perCam.get(id).downtimeMs += now - t; // ยังออฟไลน์อยู่จนถึงตอนนี้

        for (const m of maint) {
            const o = perCam.get(m.camera_id);
            if (!o) continue;
            if (m.log_type === 'repair') o.repairCount += m.cnt;
            if (m.log_type === 'removal') o.removalCount += m.cnt;
        }

        // สถานะจาก cctv_cameras: online / offline / removed / retired (ถอดออก/เลิกใช้ = ไม่อยู่ในระบบ ping)
        const OUT_OF_SERVICE = ['removed', 'retired'];
        const cameras = [...perCam.values()].map((o) => ({
            id: o.id, name: o.name, ip: o.ip, layout: o.layout, rack: o.rack,
            status: o.status, lastPing: o.lastPing,
            inService: !OUT_OF_SERVICE.includes(o.status),
            uptimePct: pct(o.online, o.total), samples: o.total,
            offlineCount: o.offlineCount,
            downtimeMin: Math.round(o.downtimeMs / 60000),
            lastOfflineAt: o.lastOfflineAt,
            repairCount: o.repairCount, removalCount: o.removalCount,
        }));

        // ── Trend รายวัน (รวมทุกกล้อง) ────────────────────────────────
        const byDay = new Map();
        for (const d of daily) {
            const k = dayKey(d.day);
            const x = byDay.get(k) || { day: k, online: 0, total: 0 };
            x.online += d.online_count;
            x.total += d.total_count;
            byDay.set(k, x);
        }
        const dailyOut = [...byDay.values()]
            .sort((a, b) => a.day.localeCompare(b.day))
            .map((x) => ({ day: x.day, uptimePct: pct(x.online, x.total), online: x.online, total: x.total }));

        // ── KPI ────────────────────────────────────────────────────────
        // uptime และจำนวนออนไลน์/ออฟไลน์ นับเฉพาะกล้องที่ยังอยู่ในระบบ (ไม่รวมถอดออก/เลิกใช้)
        const active = cameras.filter((c) => c.inService);
        const totalOnline = active.reduce((s, c) => s + (perCam.get(c.id)?.online || 0), 0);
        const totalSamples = active.reduce((s, c) => s + (perCam.get(c.id)?.total || 0), 0);
        const measured = active.filter((c) => c.uptimePct !== null);
        const kpi = {
            cameras: cameras.length,
            inService: active.length,
            onlineNow: active.filter((c) => c.status === 'online').length,
            offlineNow: active.filter((c) => c.status === 'offline').length,
            removedNow: cameras.filter((c) => c.status === 'removed').length,
            retiredNow: cameras.filter((c) => c.status === 'retired').length,
            avgUptimePct: pct(totalOnline, totalSamples),
            belowTarget: measured.filter((c) => c.uptimePct < UPTIME_TARGET).length,
            offlineEvents: cameras.reduce((s, c) => s + c.offlineCount, 0),
            downtimeMin: cameras.reduce((s, c) => s + c.downtimeMin, 0),
            repairCount: cameras.reduce((s, c) => s + c.repairCount, 0),
            removalCount: cameras.reduce((s, c) => s + c.removalCount, 0),
            target: UPTIME_TARGET,
        };

        // ── เหตุการณ์ล่าสุด (ใหม่สุดก่อน) ─────────────────────────────
        const camName = new Map(cams.map((c) => [c.id, c.name]));
        const eventsOut = [...events]
            .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
            .slice(0, MAX_EVENTS)
            .map((e) => ({
                id: e.id, cameraId: e.camera_id, cameraName: camName.get(e.camera_id) || `#${e.camera_id}`,
                status: e.status, prevStatus: e.prev_status, source: e.source, changedAt: e.changed_at,
            }));

        // ── งานซ่อม / ถอด ───────────────────────────────────────────────
        // สถานะตาม MaintenanceLogModal: ซ่อม = pending/in_progress/waiting_parts (เปิด), resolved (ปิด)
        //                              ถอด = removed/repairing (ยังไม่กลับ), reinstalled/retired (ปิด)
        const REPAIR_OPEN = ['pending', 'in_progress', 'waiting_parts'];
        const REMOVAL_OUT = ['removed', 'repairing'];
        const hoursBetween = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 3600000 : null);
        const countBy = (arr, key) => {
            const m = new Map();
            for (const x of arr) { const k = x[key] || '-'; m.set(k, (m.get(k) || 0) + 1); }
            return [...m].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
        };
        const repairs = logs.filter((l) => l.log_type === 'repair');
        const removals = logs.filter((l) => l.log_type === 'removal');
        const openRepairs = repairs.filter((l) => REPAIR_OPEN.includes(l.status));
        // วันที่แก้เสร็จบางรายการถูกกรอกย้อนหลังก่อนวันที่แจ้ง ระบบจึงไม่นับรายการที่ผลต่างเป็นลบ
        const repairDurations = repairs
            .filter((l) => l.status === 'resolved' && l.resolved_at)
            .map((l) => hoursBetween(l.reported_at, l.resolved_at) / 24)
            .filter((d) => d >= 0);
        const mttrDays = repairDurations.length
            ? Math.round((repairDurations.reduce((s, d) => s + d, 0) / repairDurations.length) * 10) / 10
            : null;
        const mttrExcluded = repairs.filter((l) => l.status === 'resolved' && l.resolved_at).length - repairDurations.length;
        const installs = logs.filter((l) => l.log_type === 'install');
        const outRemovals = removals.filter((l) => REMOVAL_OUT.includes(l.status));
        const nowMs = Date.now();
        const maintenance = {
            repair: {
                total: repairs.length, open: openRepairs.length, resolved: repairs.filter((l) => l.status === 'resolved').length,
                mttrDays, mttrSample: repairDurations.length, mttrExcluded,
                byIssue: countBy(repairs, 'issue_type').slice(0, 10),
                byReason: countBy(repairs, 'reason').slice(0, 10),
                // ชื่อผู้รับผิดชอบพิมพ์ไม่สม่ำเสมอ (natthawut.y / NATTHAWUT.Y) จึงรวมเป็นตัวพิมพ์เล็กก่อนนับ
                byAssignee: countBy(openRepairs.map((l) => ({ ...l, assigned_to: l.assigned_to ? String(l.assigned_to).trim().toLowerCase() : null })), 'assigned_to').slice(0, 10),
            },
            removal: {
                total: removals.length, out: outRemovals.length,
                reinstalled: removals.filter((l) => l.status === 'reinstalled').length,
                retired: removals.filter((l) => l.status === 'retired').length,
                byReason: countBy(removals, 'reason').slice(0, 10),
                outList: outRemovals.map((l) => ({
                    id: l.id, cameraName: l.camera_name, reason: l.reason, status: l.status, reportedAt: l.reported_at,
                    daysOut: Math.round((nowMs - new Date(l.reported_at).getTime()) / 86400000 * 10) / 10,
                })),
            },
        };
        maintenance.install = {
            total: installs.length,
            byAssignee: countBy(installs.map((l) => ({ ...l, assigned_to: l.assigned_to ? String(l.assigned_to).trim().toLowerCase() : null })), 'assigned_to').slice(0, 10),
        };
        const logsOut = logs.slice(0, 300).map((l) => ({
            id: l.id, logType: l.log_type, cameraName: l.camera_name || '-', issueType: l.issue_type, reason: l.reason,
            status: l.status, factory: l.factory_name, newLocation: l.new_location,
            assignedTo: l.assigned_to ? String(l.assigned_to).trim().toLowerCase() : null,
            reportedBy: l.reported_by, reportedAt: l.reported_at, resolvedAt: l.resolved_at, reinstalledAt: l.reinstalled_at,
            description: l.description, solution: l.solution,
        }));

        res.json({
            success: true, days: range.days, range: { from, to, days: range.days }, kpi, daily: dailyOut, cameras, events: eventsOut, eventsTotal: events.length,
            maintenance, logs: logsOut, logsTotal: logs.length,
        });
    } catch (err) {
        console.error('[CCTV report]', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
