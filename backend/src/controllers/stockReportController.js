import { getPool, sql } from '../config/db.js';

// รายงาน Stock (Phase 1): ภาพรวมและมูลค่าคงคลัง
// หมายเหตุ: มูลค่าทั้งหมดคิดจาก LastPrice ปัจจุบัน (ตาราง Transactions ไม่เก็บราคาต่อรายการ)
// ค่าที่คำนวณอยู่ฝั่ง server เพื่อให้ตัวเลขตรงกันทุกที่

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;

// ลำดับความสำคัญ: ติดลบ > หมด > ต่ำกว่า Min > เกิน Max > ปกติ
// (ต่ำกว่า Min = คงเหลือ <= MinStock เหมือนหน้า Report เดิม)
const stockStatus = (cur, min, max) => {
    if (cur < 0) return 'negative';
    if (cur === 0) return 'out';
    if (min > 0 && cur <= min) return 'low';
    if (max > 0 && cur > max) return 'over';
    return 'ok';
};

const group = (rows, keyFn) => {
    const m = {};
    for (const r of rows) {
        const k = keyFn(r);
        m[k] = m[k] || { key: k, items: 0, qty: 0, value: 0 };
        m[k].items += 1;
        m[k].qty += r.qty;
        m[k].value += r.value;
    }
    return Object.values(m)
        .map((g) => ({ ...g, value: round2(g.value) }))
        .sort((a, b) => b.value - a.value);
};

export const getStockReport = async (req, res) => {
    try {
        const pool = getPool();
        const typeFilter = req.query.type ? String(req.query.type) : '';
        const locFilter = req.query.location ? String(req.query.location) : '';

        const result = await pool.request().query(`
            SELECT p.ProductID, p.ProductName, p.DeviceType, t.Label AS TypeLabel,
                   p.MinStock, p.MaxStock, p.CurrentStock, p.LastPrice,
                   p.UnitOfMeasure, p.Location
            FROM dbo.Stock_Products p
            LEFT JOIN dbo.Stock_DeviceTypes t ON t.TypeId = p.DeviceType
            WHERE p.IsActive = 1`);

        // ตัวเลือกตัวกรองมาจากข้อมูลทั้งหมด (ไม่ถูกกรองซ้ำ เพื่อให้เปลี่ยนตัวเลือกได้)
        const all = result.recordset.map((p) => {
            const cur = num(p.CurrentStock);
            const min = num(p.MinStock);
            const max = num(p.MaxStock);
            const price = num(p.LastPrice);
            const qty = Math.max(0, cur); // สต็อกติดลบไม่นับเป็นมูลค่า
            return {
                ProductID: p.ProductID,
                ProductName: p.ProductName,
                DeviceType: p.DeviceType || '',
                TypeLabel: p.TypeLabel || p.DeviceType || 'ไม่ระบุ',
                Location: String(p.Location || '').trim() || 'ไม่ระบุ',
                UnitOfMeasure: p.UnitOfMeasure || '',
                CurrentStock: cur,
                MinStock: min,
                MaxStock: max,
                LastPrice: price,
                qty,
                value: round2(qty * price),
                status: stockStatus(cur, min, max),
                noPrice: !(price > 0),
            };
        });

        const options = {
            types: [...new Map(all.map((r) => [r.DeviceType, r.TypeLabel])).entries()]
                .map(([id, label]) => ({ id, label }))
                .sort((a, b) => a.label.localeCompare(b.label, 'th')),
            locations: [...new Set(all.map((r) => r.Location))].sort((a, b) => a.localeCompare(b, 'th')),
        };

        const rows = all.filter((r) => (!typeFilter || r.DeviceType === typeFilter) && (!locFilter || r.Location === locFilter));

        const count = (st) => rows.filter((r) => r.status === st).length;
        const kpi = {
            items: rows.length,
            totalQty: rows.reduce((s, r) => s + r.qty, 0),
            totalValue: round2(rows.reduce((s, r) => s + r.value, 0)),
            low: count('low'),
            out: count('out'),
            over: count('over'),
            negative: count('negative'),
            noPrice: rows.filter((r) => r.noPrice).length,
        };

        res.json({
            generatedAt: new Date(),
            filters: { type: typeFilter || null, location: locFilter || null },
            options,
            kpi,
            byType: group(rows, (r) => r.TypeLabel),
            byLocation: group(rows, (r) => r.Location),
            items: rows.sort((a, b) => b.value - a.value),
            note: 'มูลค่าคิดจากราคาซื้อล่าสุด (LastPrice) ของแต่ละสินค้า × จำนวนคงเหลือ',
        });
    } catch (err) {
        console.error('Stock Report Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════
// Phase 2: การเคลื่อนไหว (IN/OUT)
// ════════════════════════════════════════════════════════════════

const DAY = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d) => d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
const parseDay = (s) => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
};

// เหมือน isCountedMovement ของหน้า Report เดิม: ไม่นับการยกเลิก Invoice และการปรับยอดจากการนับสต็อก
const isCounted = (ref) => !ref.includes('ยกเลิก Invoice') && !ref.includes('Stock Count Adjust');

// เหตุผลการเบิก = ข้อความก่อน ":" (รูปแบบ "เหตุผล: รายละเอียด") ตรงกับ Stock_WithdrawalReasons
const outReason = (ref) => {
    const r = String(ref || '').trim();
    if (!r) return 'ไม่ระบุ';
    if (/^IT Repair/i.test(r)) return 'IT Repair';
    return r.split(':')[0].trim().slice(0, 60) || 'ไม่ระบุ';
};
const inSource = (ref, returnOf) => {
    const r = String(ref || '');
    if (returnOf || r.startsWith('คืนของ')) return 'คืนของ';
    if (r.startsWith('Manual Import')) return 'Manual Import';
    if (r.startsWith('Invoice')) return 'รับตาม Invoice/PO';
    return 'อื่นๆ';
};

const totals = (rows) => {
    const inn = rows.filter((r) => r.type === 'IN');
    const out = rows.filter((r) => r.type === 'OUT');
    const s = (a, f) => a.reduce((t, r) => t + r[f], 0);
    return {
        inQty: s(inn, 'qty'), outQty: s(out, 'qty'),
        inValue: round2(s(inn, 'value')), outValue: round2(s(out, 'value')),
        inCount: inn.length, outCount: out.length,
    };
};
const topN = (rows, keyFn, n, extra = () => ({})) => {
    const m = {};
    for (const r of rows) {
        const k = keyFn(r);
        m[k] = m[k] || { key: k, qty: 0, value: 0, count: 0, ...extra(r) };
        m[k].qty += r.qty; m[k].value += r.value; m[k].count += 1;
    }
    return Object.values(m).map((g) => ({ ...g, value: round2(g.value) })).sort((a, b) => b.qty - a.qty || b.value - a.value).slice(0, n);
};

export const getStockMovementReport = async (req, res) => {
    try {
        const pool = getPool();
        const typeFilter = req.query.type ? String(req.query.type) : '';
        const locFilter = req.query.location ? String(req.query.location) : '';
        const today = startOfDay(new Date());

        let from = parseDay(req.query.from);
        let to = parseDay(req.query.to) || today; // รวมวันสุดท้าย
        if (from && to < from) [from, to] = [to, from];
        const toExcl = new Date(to.getTime() + DAY);

        // ช่วงก่อนหน้า (ยาวเท่ากัน) สำหรับเปรียบเทียบ ใช้ได้เมื่อระบุวันเริ่มต้น
        const days = from ? Math.round((toExcl - from) / DAY) : 0;
        const prevFrom = from ? new Date(from.getTime() - days * DAY) : null;

        const rq = pool.request();
        let where = 'WHERE 1=1';
        const lower = prevFrom || from;
        if (lower) { rq.input('lower', sql.DateTime, lower); where += ' AND t.TransDate >= @lower'; }
        rq.input('upper', sql.DateTime, toExcl); where += ' AND t.TransDate < @upper';

        const result = await rq.query(`
            SELECT t.TransID, t.ProductID, p.ProductName, p.DeviceType, t.TransType, t.Qty, t.RefInfo,
                   t.UserID, t.EmployeeName, t.EmployeeCode, t.CostCenter, t.TransDate, t.ReturnOf,
                   CASE WHEN t.SelfUse = 1 OR t.CostCenter = '7510' THEN 1 ELSE 0 END AS IsInternal,
                   p.LastPrice, p.Location, td.Label AS TypeLabel
            FROM dbo.Stock_Transactions t
            LEFT JOIN dbo.Stock_Products p ON p.ProductID = t.ProductID
            LEFT JOIN dbo.Stock_DeviceTypes td ON td.TypeId = p.DeviceType
            ${where}
            ORDER BY t.TransDate DESC`);

        const all = [];
        for (const t of result.recordset) {
            const ref = String(t.RefInfo || '');
            if (!isCounted(ref)) continue;
            const type = String(t.TransType || '').toUpperCase().trim();
            if (type !== 'IN' && type !== 'OUT') continue;
            const loc = String(t.Location || '').trim() || 'ไม่ระบุ';
            if (typeFilter && (t.DeviceType || '') !== typeFilter) continue;
            if (locFilter && loc !== locFilter) continue;
            const qty = Math.abs(num(t.Qty));
            all.push({
                TransID: t.TransID, ProductID: t.ProductID,
                ProductName: t.ProductName || `ID: ${t.ProductID}`,
                TypeLabel: t.TypeLabel || t.DeviceType || 'ไม่ระบุ',
                Location: loc, type, qty,
                value: round2(qty * num(t.LastPrice)),
                RefInfo: ref,
                reason: type === 'OUT' ? outReason(ref) : inSource(ref, t.ReturnOf),
                who: t.EmployeeName || t.UserID || 'ไม่ระบุ',
                internal: t.IsInternal === 1 || t.IsInternal === true,
                byUser: t.UserID || '',
                CostCenter: t.CostCenter || '',
                TransDate: t.TransDate,
                date: new Date(t.TransDate),
            });
        }

        const cur = all.filter((r) => !from || r.date >= from);
        const prev = prevFrom ? all.filter((r) => r.date >= prevFrom && r.date < from) : [];
        const curT = totals(cur);
        const prevT = prevFrom ? totals(prev) : null;

        // รายเดือน (สูงสุด 36 เดือนล่าสุดของช่วง)
        const firstDate = from || (cur.length ? startOfDay(cur[cur.length - 1].date) : to);
        let cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
        const lastMonth = new Date(to.getFullYear(), to.getMonth(), 1);
        const monthly = [];
        while (cursor <= lastMonth) {
            monthly.push({ key: monthKey(cursor), label: monthLabel(cursor), inQty: 0, outQty: 0, inValue: 0, outValue: 0 });
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        }
        const mIdx = Object.fromEntries(monthly.map((m) => [m.key, m]));
        for (const r of cur) {
            const m = mIdx[monthKey(r.date)];
            if (!m) continue;
            if (r.type === 'IN') { m.inQty += r.qty; m.inValue += r.value; } else { m.outQty += r.qty; m.outValue += r.value; }
        }
        const monthlyOut = monthly.slice(-36).map((m) => ({ ...m, inValue: round2(m.inValue), outValue: round2(m.outValue) }));

        const outs = cur.filter((r) => r.type === 'OUT');
        const ins = cur.filter((r) => r.type === 'IN');

        res.json({
            generatedAt: new Date(),
            range: { from: from ? from.toISOString() : null, to: to.toISOString(), days: from ? days : null },
            filters: { type: typeFilter || null, location: locFilter || null },
            kpi: { ...curT, netQty: curT.inQty - curT.outQty, netValue: round2(curT.inValue - curT.outValue) },
            previous: prevT,
            monthly: monthlyOut,
            outByReason: topN(outs, (r) => r.reason, 10),
            inBySource: topN(ins, (r) => r.reason, 10),
            usage: (() => {
                const agg = (arr) => ({ count: arr.length, qty: arr.reduce((s, r) => s + r.qty, 0), value: round2(arr.reduce((s, r) => s + r.value, 0)) });
                return { internal: agg(outs.filter((r) => r.internal)), user: agg(outs.filter((r) => !r.internal)) };
            })(),
            topItems: topN(outs, (r) => r.ProductName, 10, (r) => ({ TypeLabel: r.TypeLabel })),
            topRecipients: topN(outs, (r) => r.who, 10),
            transactions: cur.slice(0, 500).map(({ date, ...r }) => r),
            transactionTotal: cur.length,
            note: 'มูลค่าคิดจากราคาซื้อล่าสุด (LastPrice) × จำนวน ไม่รวมรายการ "ยกเลิก Invoice" และ "Stock Count Adjust"',
        });
    } catch (err) {
        console.error('Stock Movement Report Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════
// Phase 3: วิเคราะห์สินค้าและสั่งซื้อ
// ABC (มูลค่าเบิก 12 เดือน), Aging / Dead stock, Days of cover (อัตราเบิก 90 วัน),
// Turnover ตามประเภท, รายการที่ต้องสั่งซื้อ, Overstock
// กรอบเวลาคงที่ ไม่ขึ้นกับช่วงวันที่ ใช้ตัวกรองประเภท/สถานที่ได้
// ════════════════════════════════════════════════════════════════

const AGING_BUCKETS = [
    { key: '0-90', label: 'เบิกใน 90 วัน', test: (d) => d !== null && d <= 90 },
    { key: '91-180', label: '91–180 วัน', test: (d) => d !== null && d > 90 && d <= 180 },
    { key: '181-365', label: '181–365 วัน', test: (d) => d !== null && d > 180 && d <= 365 },
    { key: '365+', label: 'เกิน 1 ปี', test: (d) => d !== null && d > 365 },
    { key: 'never', label: 'ไม่เคยเบิก', test: (d) => d === null },
];

export const getStockAnalysisReport = async (req, res) => {
    try {
        const pool = getPool();
        const typeFilter = req.query.type ? String(req.query.type) : '';
        const locFilter = req.query.location ? String(req.query.location) : '';
        const now = Date.now();

        const prodRes = await pool.request().query(`
            SELECT p.ProductID, p.ProductName, p.DeviceType, td.Label AS TypeLabel, p.CurrentStock, p.MinStock, p.MaxStock,
                   p.LastPrice, p.UnitOfMeasure, p.Location, ISNULL(p.lead_time_days, 7) AS LeadTime,
                   ISNULL(v.VendorName, '-') AS VendorName
            FROM dbo.Stock_Products p
            LEFT JOIN dbo.Stock_DeviceTypes td ON td.TypeId = p.DeviceType
            LEFT JOIN dbo.Stock_Vendors v ON v.VendorID = p.VendorID
            WHERE p.IsActive = 1`);

        // รวมการเบิกต่อสินค้าใน SQL (ไม่นับ ยกเลิก Invoice / Stock Count Adjust)
        const usageRes = await pool.request()
            .input('d365', sql.DateTime, new Date(now - 365 * DAY))
            .input('d90', sql.DateTime, new Date(now - 90 * DAY))
            .query(`
                SELECT ProductID, MAX(TransDate) AS LastOut,
                       SUM(CASE WHEN TransDate >= @d365 THEN ABS(Qty) ELSE 0 END) AS Out12,
                       SUM(CASE WHEN TransDate >= @d90 THEN ABS(Qty) ELSE 0 END) AS Out3
                FROM dbo.Stock_Transactions
                WHERE UPPER(LTRIM(RTRIM(TransType))) = 'OUT'
                  AND ISNULL(RefInfo, '') NOT LIKE N'%ยกเลิก Invoice%'
                  AND ISNULL(RefInfo, '') NOT LIKE N'%Stock Count Adjust%'
                GROUP BY ProductID`);
        const usage = Object.fromEntries(usageRes.recordset.map((u) => [u.ProductID, u]));

        const all = prodRes.recordset.map((p) => {
            const u = usage[p.ProductID];
            const cur = num(p.CurrentStock);
            const price = num(p.LastPrice);
            return {
                ProductID: p.ProductID,
                ProductName: p.ProductName,
                DeviceType: p.DeviceType || '',
                TypeLabel: p.TypeLabel || p.DeviceType || 'ไม่ระบุ',
                Location: String(p.Location || '').trim() || 'ไม่ระบุ',
                UnitOfMeasure: p.UnitOfMeasure || '',
                VendorName: p.VendorName,
                LeadTime: num(p.LeadTime) || 7,
                cur, min: num(p.MinStock), max: num(p.MaxStock), price,
                stockValue: Math.max(0, cur) * price,
                out12: u ? num(u.Out12) : 0,
                out3: u ? num(u.Out3) : 0,
                lastOutDays: u && u.LastOut ? Math.floor((now - new Date(u.LastOut).getTime()) / DAY) : null,
            };
        });

        const options = {
            types: [...new Map(all.map((r) => [r.DeviceType, r.TypeLabel])).entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'th')),
            locations: [...new Set(all.map((r) => r.Location))].sort((a, b) => a.localeCompare(b, 'th')),
        };
        const rows = all.filter((r) => (!typeFilter || r.DeviceType === typeFilter) && (!locFilter || r.Location === locFilter));

        // ── ABC ──
        const abcBase = rows.filter((r) => r.out12 > 0).map((r) => ({ ...r, abcValue: r.out12 * r.price })).sort((a, b) => b.abcValue - a.abcValue);
        const abcTotal = abcBase.reduce((s, r) => s + r.abcValue, 0);
        let running = 0;
        const abcRows = abcBase.map((r) => {
            const before = abcTotal > 0 ? running / abcTotal : 0;
            running += r.abcValue;
            return { ProductID: r.ProductID, ProductName: r.ProductName, TypeLabel: r.TypeLabel, qty: r.out12, value: round2(r.abcValue), cumPct: abcTotal > 0 ? Math.round((running / abcTotal) * 1000) / 10 : 0, cls: before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C' };
        });
        const abcSummary = { A: { count: 0, value: 0 }, B: { count: 0, value: 0 }, C: { count: 0, value: 0 } };
        abcRows.forEach((r) => { abcSummary[r.cls].count += 1; abcSummary[r.cls].value += r.value; });
        ['A', 'B', 'C'].forEach((c) => {
            abcSummary[c].value = round2(abcSummary[c].value);
            abcSummary[c].share = abcTotal > 0 ? Math.round((abcSummary[c].value / abcTotal) * 100) : 0;
        });

        // ── Aging / Dead stock (เฉพาะที่ยังมีของ) ──
        const inStock = rows.filter((r) => r.cur > 0);
        const aging = AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: 0, value: 0 }));
        for (const r of inStock) {
            const idx = AGING_BUCKETS.findIndex((b) => b.test(r.lastOutDays));
            aging[idx].count += 1; aging[idx].value += r.stockValue;
        }
        const agingTotal = aging.reduce((s, b) => s + b.value, 0);
        aging.forEach((b) => { b.value = round2(b.value); b.share = agingTotal > 0 ? Math.round((b.value / agingTotal) * 100) : 0; });
        // Dead stock = ไม่มีการเบิกใน 90 วัน (นิยามเดียวกับหน้า Report เดิม)
        const dead = inStock.filter((r) => r.out3 === 0).sort((a, b) => b.stockValue - a.stockValue);
        const deadStock = {
            count: dead.length, value: round2(dead.reduce((s, r) => s + r.stockValue, 0)),
            items: dead.slice(0, 100).map((r) => ({ ProductID: r.ProductID, ProductName: r.ProductName, TypeLabel: r.TypeLabel, Location: r.Location, CurrentStock: r.cur, value: round2(r.stockValue), lastOutDays: r.lastOutDays })),
        };

        // ── Days of cover (อัตราเบิก 90 วัน) ──
        const cover = rows.filter((r) => r.out3 > 0).map((r) => {
            const daily = r.out3 / 90;
            const days = Math.max(0, r.cur) / daily;
            return { ProductID: r.ProductID, ProductName: r.ProductName, TypeLabel: r.TypeLabel, CurrentStock: r.cur, dailyUse: Math.round(daily * 100) / 100, days: Math.round(days), LeadTime: r.LeadTime, critical: days <= r.LeadTime };
        }).sort((a, b) => a.days - b.days);
        const daysOfCover = { criticalCount: cover.filter((c) => c.critical).length, items: cover.slice(0, 50) };

        // ── Turnover ตามประเภท (มูลค่าเบิก 12 เดือน ÷ มูลค่าคงคลังปัจจุบัน — ประมาณการ) ──
        const tm = {};
        for (const r of rows) {
            tm[r.TypeLabel] = tm[r.TypeLabel] || { key: r.TypeLabel, stockValue: 0, outValue: 0, items: 0 };
            tm[r.TypeLabel].stockValue += r.stockValue; tm[r.TypeLabel].outValue += r.out12 * r.price; tm[r.TypeLabel].items += 1;
        }
        const turnover = Object.values(tm).map((t) => ({
            ...t, stockValue: round2(t.stockValue), outValue: round2(t.outValue),
            turnover: t.stockValue > 0 ? Math.round((t.outValue / t.stockValue) * 100) / 100 : null,
            daysOfStock: t.outValue > 0 ? Math.round((t.stockValue / t.outValue) * 365) : null,
        })).sort((a, b) => b.outValue - a.outValue);

        // ── สั่งซื้อ (คงเหลือ ≤ Min และ Min > 0; สั่งเพิ่ม = Max − คงเหลือ, ไม่มี Max ใช้ Min) ──
        const reorderItems = rows.filter((r) => r.min > 0 && r.cur <= r.min).map((r) => {
            const target = r.max > 0 ? r.max : r.min;
            const qty = Math.max(0, target - Math.max(0, r.cur));
            const daily = r.out3 / 90;
            return {
                ProductID: r.ProductID, ProductName: r.ProductName, TypeLabel: r.TypeLabel, VendorName: r.VendorName, LeadTime: r.LeadTime,
                CurrentStock: r.cur, MinStock: r.min, MaxStock: r.max, suggestQty: qty, price: r.price, estCost: round2(qty * r.price),
                daysLeft: daily > 0 ? Math.round(Math.max(0, r.cur) / daily) : null,
            };
        }).sort((a, b) => b.estCost - a.estCost);
        const reorder = { count: reorderItems.length, totalCost: round2(reorderItems.reduce((s, r) => s + r.estCost, 0)), noPrice: reorderItems.filter((r) => !(r.price > 0)).length, items: reorderItems };

        // ── Overstock ──
        const over = rows.filter((r) => r.max > 0 && r.cur > r.max).map((r) => ({ ProductID: r.ProductID, ProductName: r.ProductName, TypeLabel: r.TypeLabel, CurrentStock: r.cur, MaxStock: r.max, excessQty: r.cur - r.max, excessValue: round2((r.cur - r.max) * r.price) })).sort((a, b) => b.excessValue - a.excessValue);
        const overstock = { count: over.length, value: round2(over.reduce((s, r) => s + r.excessValue, 0)), items: over.slice(0, 50) };

        res.json({
            generatedAt: new Date(),
            filters: { type: typeFilter || null, location: locFilter || null },
            options,
            abc: { total: round2(abcTotal), summary: abcSummary, items: abcRows.slice(0, 100), itemCount: abcRows.length },
            aging: { total: round2(agingTotal), buckets: aging },
            deadStock,
            daysOfCover,
            turnover,
            reorder,
            overstock,
            note: 'มูลค่าคิดจากราคาซื้อล่าสุด (LastPrice) • ABC ใช้มูลค่าเบิก 12 เดือน • Dead stock = ไม่มีการเบิกใน 90 วัน • Days of cover อิงอัตราเบิกเฉลี่ย 90 วัน',
        });
    } catch (err) {
        console.error('Stock Analysis Report Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════
// Phase 4: จัดซื้อและรับของ
// PO ตามสถานะ, ค้างรับ/เลยกำหนด, ยอดสั่งซื้อรายเดือน/Vendor/Budget, Invoice รับเข้า-ยกเลิก,
// และราคาต่อหน่วยที่เปลี่ยนระหว่าง PO ล่าสุดกับ PO ก่อนหน้า
// ช่วงวันที่: PO ใช้ RequestDate, Invoice ใช้ ReceiveDate (ไม่ใช้ตัวกรองประเภท/สถานที่)
// ════════════════════════════════════════════════════════════════

const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};
const avg1 = (arr) => (arr.length ? Math.round((arr.reduce((t, x) => t + x, 0) / arr.length) * 10) / 10 : null);

// รายงาน PO ใช้ข้อมูลและนิยามชุดเดียวกับรายงานจัดซื้อของ Stock
export const getPOReport = (req, res) => getStockProcurementReport(req, res);

export const getStockProcurementReport = async (req, res) => {
    try {
        const pool = getPool();
        const today = startOfDay(new Date());
        const from = parseDay(req.query.from);
        let to = parseDay(req.query.to) || today;
        if (from && to < from) to = from;
        const toExcl = new Date(to.getTime() + DAY);
        const inRange = (d) => {
            if (!d) return false;
            const t = new Date(d);
            return (!from || t >= from) && t < toExcl;
        };

        const poRes = await pool.request().query(`
            SELECT po.PO_ID, po.PR_No, po.VendorName, po.RequestDate, po.DueDate, po.RequestedBy, po.Status, po.BudgetNo,
                   ISNULL(d.Ordered, 0) AS Ordered, ISNULL(d.Received, 0) AS Received,
                   ISNULL(d.Items, 0) AS Items, ISNULL(d.OpenItems, 0) AS OpenItems
            FROM dbo.Stock_PurchaseOrders po
            LEFT JOIN (
                SELECT PO_ID, SUM(QtyOrdered * ISNULL(UnitCost, 0)) AS Ordered, SUM(QtyReceived * ISNULL(UnitCost, 0)) AS Received,
                       COUNT(*) AS Items, SUM(CASE WHEN QtyReceived < QtyOrdered THEN 1 ELSE 0 END) AS OpenItems
                FROM dbo.Stock_PODetails GROUP BY PO_ID
            ) d ON d.PO_ID = po.PO_ID`);
        const invRes = await pool.request().query(`
            SELECT i.InvoiceNo, i.PO_ID, i.ReceiveDate, i.ReceivedBy, ISNULL(i.Status, 'Active') AS Status, po.VendorName
            FROM dbo.Stock_Invoices i LEFT JOIN dbo.Stock_PurchaseOrders po ON po.PO_ID = i.PO_ID
            ORDER BY i.ReceiveDate DESC`);

        // ใบรับของแรกของแต่ละ PO (ไม่นับ Invoice ที่ยกเลิก) เพื่อคำนวณ lead time / ตรงกำหนด
        const firstRecv = {};
        for (const inv of invRes.recordset) {
            if (!inv.PO_ID || !inv.ReceiveDate || inv.Status === 'Cancelled') continue;
            const t = new Date(inv.ReceiveDate).getTime();
            if (firstRecv[inv.PO_ID] === undefined || t < firstRecv[inv.PO_ID]) firstRecv[inv.PO_ID] = t;
        }

        const pos = poRes.recordset.filter((p) => inRange(p.RequestDate)).map((p) => {
            const status = p.Status || 'Open';
            const open = status !== 'Completed' && status !== 'Cancelled';
            const req = new Date(p.RequestDate).getTime();
            const rec = firstRecv[p.PO_ID];
            const lead = rec !== undefined ? Math.max(0, Math.round((rec - req) / DAY)) : null;
            const due = p.DueDate ? startOfDay(p.DueDate) : null;
            return {
                PO_ID: p.PO_ID, PR_No: p.PR_No || '', VendorName: p.VendorName || 'ไม่ระบุ', BudgetNo: p.BudgetNo || 'ไม่ระบุ',
                RequestedBy: p.RequestedBy || '', Status: status, RequestDate: p.RequestDate, DueDate: p.DueDate,
                ordered: round2(num(p.Ordered)), received: round2(num(p.Received)), items: p.Items, openItems: p.OpenItems,
                open, ageDays: Math.max(0, Math.floor((Date.now() - req) / DAY)),
                overdue: open && !!due && due < today,
                lead,
                onTime: rec !== undefined && due ? startOfDay(new Date(rec)) <= due : null,
            };
        });

        const sum = (a, f) => a.reduce((t, x) => t + x[f], 0);
        const leads = pos.filter((p) => p.lead !== null).map((p) => p.lead);
        const onTimeBase = pos.filter((p) => p.onTime !== null);
        const kpi = {
            poCount: pos.length,
            openCount: pos.filter((p) => p.open).length,
            overdueCount: pos.filter((p) => p.overdue).length,
            ordered: round2(sum(pos, 'ordered')),
            received: round2(sum(pos, 'received')),
            outstanding: round2(sum(pos.filter((p) => p.Status !== 'Cancelled'), 'ordered') - sum(pos.filter((p) => p.Status !== 'Cancelled'), 'received')),
            receiveRate: sum(pos, 'ordered') > 0 ? Math.round((sum(pos, 'received') / sum(pos, 'ordered')) * 100) : null,
            avgLead: avg1(leads), medianLead: median(leads),
            onTimeRate: onTimeBase.length ? Math.round((onTimeBase.filter((p) => p.onTime).length / onTimeBase.length) * 100) : null,
        };

        const statusCount = {};
        for (const p of pos) statusCount[p.Status] = (statusCount[p.Status] || 0) + 1;

        // สั่งซื้อรายเดือน
        const mm = {};
        for (const p of pos) {
            const d = new Date(p.RequestDate);
            const k = monthKey(d);
            mm[k] = mm[k] || { key: k, label: monthLabel(d), count: 0, ordered: 0, received: 0 };
            mm[k].count += 1; mm[k].ordered += p.ordered; mm[k].received += p.received;
        }
        const monthly = Object.values(mm).sort((a, b) => a.key.localeCompare(b.key)).map((m) => ({ ...m, ordered: round2(m.ordered), received: round2(m.received) }));

        // ยอดแยกตาม BG No. ของแต่ละรายการ (PO 1 ใบอาจมีหลาย BG) — นับเฉพาะ PO ที่อยู่ในช่วงที่เลือก
        const inPeriod = new Set(pos.map((p) => p.PO_ID));
        const lineRes = await pool.request().query(`
            SELECT PO_ID, ISNULL(NULLIF(LTRIM(RTRIM(BG_No)), ''), 'ไม่ระบุ') AS BG,
                   QtyOrdered, ISNULL(QtyReceived, 0) AS QtyReceived, ISNULL(UnitCost, 0) AS UnitCost
            FROM dbo.Stock_PODetails`);
        const bgMap = {};
        for (const l of lineRes.recordset) {
            if (!inPeriod.has(l.PO_ID)) continue;
            const g = (bgMap[l.BG] = bgMap[l.BG] || { key: l.BG, pos: new Set(), ordered: 0, received: 0 });
            g.pos.add(l.PO_ID);
            g.ordered += num(l.QtyOrdered) * num(l.UnitCost);
            g.received += num(l.QtyReceived) * num(l.UnitCost);
        }
        const byBG = Object.values(bgMap).map((g) => ({
            key: g.key, count: g.pos.size, ordered: round2(g.ordered), received: round2(g.received), avgLead: null, onTimeRate: null,
        })).sort((a, b) => b.ordered - a.ordered);

        const groupPO = (keyFn) => {
            const m = {};
            for (const p of pos) {
                const k = keyFn(p);
                m[k] = m[k] || { key: k, count: 0, ordered: 0, received: 0, leads: [], onTimeBase: 0, onTimeHit: 0 };
                m[k].count += 1; m[k].ordered += p.ordered; m[k].received += p.received;
                if (p.lead !== null) m[k].leads.push(p.lead);
                if (p.onTime !== null) { m[k].onTimeBase += 1; if (p.onTime) m[k].onTimeHit += 1; }
            }
            return Object.values(m).map((g) => ({
                key: g.key, count: g.count, ordered: round2(g.ordered), received: round2(g.received),
                avgLead: avg1(g.leads), onTimeRate: g.onTimeBase ? Math.round((g.onTimeHit / g.onTimeBase) * 100) : null,
            })).sort((a, b) => b.ordered - a.ordered);
        };

        // ค้างรับ: PO ที่ยังเปิดอยู่ (เลยกำหนดขึ้นก่อน แล้วเรียงตามอายุ)
        const openPOs = pos.filter((p) => p.open)
            .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.ageDays - a.ageDays)
            .map((p) => ({ PO_ID: p.PO_ID, PR_No: p.PR_No, VendorName: p.VendorName, Status: p.Status, RequestDate: p.RequestDate, DueDate: p.DueDate, ageDays: p.ageDays, overdue: p.overdue, openItems: p.openItems, items: p.items, ordered: p.ordered, outstanding: round2(p.ordered - p.received) }));

        // Invoice ตามช่วงวันที่รับ
        const invs = invRes.recordset.filter((i) => inRange(i.ReceiveDate));
        const invMonth = {};
        for (const i of invs) {
            const d = new Date(i.ReceiveDate);
            const k = monthKey(d);
            invMonth[k] = invMonth[k] || { key: k, label: monthLabel(d), active: 0, cancelled: 0 };
            if (i.Status === 'Cancelled') invMonth[k].cancelled += 1; else invMonth[k].active += 1;
        }
        const invoices = {
            total: invs.length,
            active: invs.filter((i) => i.Status !== 'Cancelled').length,
            cancelled: invs.filter((i) => i.Status === 'Cancelled').length,
            monthly: Object.values(invMonth).sort((a, b) => a.key.localeCompare(b.key)),
            recent: invs.slice(0, 100).map((i) => ({ InvoiceNo: i.InvoiceNo, PO_ID: i.PO_ID, VendorName: i.VendorName || '-', ReceiveDate: i.ReceiveDate, ReceivedBy: i.ReceivedBy || '', Status: i.Status })),
        };

        // ราคาต่อหน่วยเปลี่ยน: เทียบบรรทัด PO ล่าสุดกับก่อนหน้า (ต่อสินค้า) จากประวัติทั้งหมด ไม่ขึ้นกับช่วงวันที่
        const priceRes = await pool.request().query(`
            SELECT d.ProductID, p.ProductName, p.LastPrice, d.UnitCost, po.RequestDate, po.PO_ID, po.VendorName
            FROM dbo.Stock_PODetails d
            JOIN dbo.Stock_PurchaseOrders po ON po.PO_ID = d.PO_ID
            JOIN dbo.Stock_Products p ON p.ProductID = d.ProductID
            WHERE d.ProductID IS NOT NULL AND d.UnitCost > 0 AND ISNULL(po.Status, '') <> 'Cancelled'
            ORDER BY d.ProductID, po.RequestDate DESC`);
        const byProd = {};
        for (const r of priceRes.recordset) (byProd[r.ProductID] = byProd[r.ProductID] || []).push(r);
        const priceChanges = [];
        for (const rows of Object.values(byProd)) {
            const latest = rows[0];
            const prevRow = rows.find((r) => num(r.UnitCost) !== num(latest.UnitCost));
            if (!prevRow) continue;
            const now = num(latest.UnitCost);
            const before = num(prevRow.UnitCost);
            priceChanges.push({
                ProductID: latest.ProductID, ProductName: latest.ProductName, previous: before, latest: now,
                diff: round2(now - before), pct: Math.round(((now - before) / before) * 1000) / 10,
                latestDate: latest.RequestDate, previousDate: prevRow.RequestDate, VendorName: latest.VendorName || '-',
            });
        }
        priceChanges.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

        res.json({
            generatedAt: new Date(),
            range: { from: from ? from.toISOString() : null, to: to.toISOString() },
            kpi, statusCount, monthly,
            byVendor: groupPO((p) => p.VendorName).slice(0, 15),
            byBudget: byBG.slice(0, 15),
            openPOs, invoices,
            priceChanges: priceChanges.slice(0, 50), priceChangeTotal: priceChanges.length,
            note: 'มูลค่า PO = จำนวน × ราคาต่อหน่วยในใบ PO • Lead time = วันรับของแรก − วันขอซื้อ (PO ที่บันทึกย้อนหลังจะได้ค่าใกล้ 0) • ราคาเปลี่ยน = เทียบ PO ล่าสุดกับ PO ก่อนหน้าที่ราคาต่างกัน',
        });
    } catch (err) {
        console.error('Stock Procurement Report Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════
// Phase 5: การนับสต็อกและคุณภาพข้อมูล
// ผลนับ (ตามวันที่นับ): สถานะ session, รายการที่มีส่วนต่าง, มูลค่าที่ปรับ, สินค้าที่ปรับบ่อย
// คุณภาพข้อมูล (ทั้งระบบ, ไม่ขึ้นกับช่วงวันที่): ไม่มีราคา, ไม่มี Location, สต็อกติดลบ, Min > Max
// ════════════════════════════════════════════════════════════════

export const getStockCountQualityReport = async (req, res) => {
    try {
        const pool = getPool();
        const today = startOfDay(new Date());
        const from = parseDay(req.query.from);
        let to = parseDay(req.query.to) || today;
        if (from && to < from) to = from;
        const toExcl = new Date(to.getTime() + DAY);

        const rq = pool.request().input('toExcl', sql.DateTime, toExcl);
        let where = 'WHERE s.CountDate < @toExcl';
        if (from) { rq.input('from', sql.DateTime, from); where += ' AND s.CountDate >= @from'; }

        const sessRes = await rq.query(`
            SELECT s.SessionID, s.SessionCode, s.CountDate, s.ConfirmedBy, s.TotalItems, s.Variances, s.Status, s.Note,
                   (SELECT COUNT(*) FROM dbo.Stock_StockCountItems i WHERE i.SessionID = s.SessionID AND i.DiffQty <> 0) AS DiffItems
            FROM dbo.Stock_StockCountSessions s
            ${where}
            ORDER BY s.CountDate DESC`);

        const sessions = sessRes.recordset;

        // รายการที่มีส่วนต่างของ session ที่ยืนยันแล้ว (Confirmed / Adjusted)
        const rq2 = pool.request().input('toExcl', sql.DateTime, toExcl);
        let w2 = 'WHERE s.CountDate < @toExcl AND i.DiffQty <> 0 AND s.Status IN (\'Confirmed\', \'Adjusted\')';
        if (from) { rq2.input('from', sql.DateTime, from); w2 += ' AND s.CountDate >= @from'; }
        const diffRes = await rq2.query(`
            SELECT i.ProductID, p.ProductName, td.Label AS TypeLabel, p.LastPrice, i.SystemQty, i.ActualQty, i.DiffQty,
                   s.SessionCode, s.CountDate, s.Status
            FROM dbo.Stock_StockCountItems i
            JOIN dbo.Stock_StockCountSessions s ON s.SessionID = i.SessionID
            LEFT JOIN dbo.Stock_Products p ON p.ProductID = i.ProductID
            LEFT JOIN dbo.Stock_DeviceTypes td ON td.TypeId = p.DeviceType
            ${w2}`);

        const diffs = diffRes.recordset.map((d) => {
            const price = num(d.LastPrice);
            const value = round2(num(d.DiffQty) * price);
            return { ...d, price, value, plus: num(d.DiffQty) > 0 };
        });
        const adjusted = diffs.filter((d) => d.Status === 'Adjusted');

        const sessionStatus = {};
        for (const s of sessions) sessionStatus[s.Status] = (sessionStatus[s.Status] || 0) + 1;

        // สินค้าที่ปรับบ่อย (จำนวนครั้งที่มี diff)
        const freq = {};
        for (const d of diffs) {
            const k = d.ProductName || `ID: ${d.ProductID}`;
            freq[k] = freq[k] || { key: k, TypeLabel: d.TypeLabel || '-', count: 0, netQty: 0, netValue: 0, absQty: 0 };
            freq[k].count += 1; freq[k].netQty += num(d.DiffQty); freq[k].netValue += d.value; freq[k].absQty += Math.abs(num(d.DiffQty));
        }
        const frequent = Object.values(freq)
            .map((f) => ({ ...f, netValue: round2(f.netValue) }))
            .sort((a, b) => b.count - a.count || b.absQty - a.absQty)
            .slice(0, 15);

        const diffItems = diffs.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

        // ── คุณภาพข้อมูล (สินค้า active ทั้งหมด) ──
        const prodRes = await pool.request().query(`
            SELECT p.ProductID, p.ProductName, td.Label AS TypeLabel, p.CurrentStock, p.MinStock, p.MaxStock, p.LastPrice, p.Location
            FROM dbo.Stock_Products p
            LEFT JOIN dbo.Stock_DeviceTypes td ON td.TypeId = p.DeviceType
            WHERE p.IsActive = 1`);
        const prods = prodRes.recordset.map((p) => ({
            ProductID: p.ProductID, ProductName: p.ProductName, TypeLabel: p.TypeLabel || '-',
            CurrentStock: num(p.CurrentStock), MinStock: num(p.MinStock), MaxStock: num(p.MaxStock), LastPrice: num(p.LastPrice),
            Location: String(p.Location || '').trim(),
        }));
        const pick = (arr) => arr.slice(0, 100).map((p) => ({ ProductID: p.ProductID, ProductName: p.ProductName, TypeLabel: p.TypeLabel, CurrentStock: p.CurrentStock, MinStock: p.MinStock, MaxStock: p.MaxStock, LastPrice: p.LastPrice, Location: p.Location || 'ไม่ระบุ' }));
        const quality = {
            noPrice: { count: prods.filter((p) => !(p.LastPrice > 0)).length, items: pick(prods.filter((p) => !(p.LastPrice > 0))) },
            noLocation: { count: prods.filter((p) => !p.Location).length, items: pick(prods.filter((p) => !p.Location)) },
            negative: { count: prods.filter((p) => p.CurrentStock < 0).length, items: pick(prods.filter((p) => p.CurrentStock < 0)) },
            minGtMax: { count: prods.filter((p) => p.MaxStock > 0 && p.MinStock > p.MaxStock).length, items: pick(prods.filter((p) => p.MaxStock > 0 && p.MinStock > p.MaxStock)) },
        };
        quality.total = prods.length;
        quality.issueItems = new Set([...quality.noPrice.items, ...quality.noLocation.items, ...quality.negative.items, ...quality.minGtMax.items].map((x) => x.ProductID)).size;

        res.json({
            generatedAt: new Date(),
            range: { from: from ? from.toISOString() : null, to: to.toISOString() },
            count: {
                sessions: sessions.length,
                sessionStatus,
                itemsCounted: sessions.reduce((s, x) => s + num(x.TotalItems), 0),
                diffItems: diffs.length,
                plusItems: diffs.filter((d) => d.plus).length,
                minusItems: diffs.filter((d) => !d.plus).length,
                adjustedValue: round2(adjusted.reduce((s, d) => s + d.value, 0)),
                pendingValue: round2(diffs.filter((d) => d.Status === 'Confirmed').reduce((s, d) => s + d.value, 0)),
                pendingCount: diffs.filter((d) => d.Status === 'Confirmed').length,
            },
            sessions: sessions.map((s) => ({ SessionCode: s.SessionCode, CountDate: s.CountDate, ConfirmedBy: s.ConfirmedBy || '', TotalItems: num(s.TotalItems), DiffItems: num(s.DiffItems), Status: s.Status, Note: s.Note || '' })),
            frequent,
            diffItems: diffItems.slice(0, 200).map((d) => ({ ProductName: d.ProductName, TypeLabel: d.TypeLabel || '-', SystemQty: d.SystemQty, ActualQty: d.ActualQty, DiffQty: d.DiffQty, price: d.price, value: d.value, SessionCode: d.SessionCode, CountDate: d.CountDate, Status: d.Status })),
            quality,
            note: 'มูลค่าส่วนต่างคิดจากราคาซื้อล่าสุด (LastPrice) × ส่วนต่าง • ผลนับตามวันที่นับ • คุณภาพข้อมูลนับจากสินค้าที่ยัง Active ทั้งหมด',
        });
    } catch (err) {
        console.error('Stock Count Quality Report Error:', err);
        res.status(500).json({ error: err.message });
    }
};
