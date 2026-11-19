import { sql, getPool } from '../config/db.js';

// รายงาน MA: สรุปตัวเลข, กราฟ, รายการเสี่ยง, ประวัติต่ออายุ และพยากรณ์ค่าใช้จ่ายรายเดือน
// หมายเหตุ: ค่าที่คำนวณทั้งหมดอยู่ฝั่ง server เพื่อให้ตัวเลขตรงกันทุกที่

const DAY = 86400000;
const ALERT_DAYS = 60;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const monthsBetween = (a, b) => Math.round((b - a) / (DAY * 30.44));
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d) => d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;

const daysLeft = (endDate, today) => Math.ceil((startOfDay(endDate) - today) / DAY);

// เหมือน getEffectiveStatus ฝั่ง frontend
const effStatus = (it, today) => {
    if (it.Status === 'Cancelled' || it.Status === 'Pending') return it.Status;
    if (!it.EndDate) return 'Active';
    const d = daysLeft(it.EndDate, today);
    if (d <= 0) return 'Expired';
    if (d <= ALERT_DAYS) return 'Expiring';
    return 'Active';
};

// พยากรณ์: ทุกรายการที่ยังใช้งาน จะมีรอบต่ออายุทุก "ระยะรอบ" (เดือน) และแต่ละรอบเสียเงินเท่ากับราคา
// ระยะรอบ = ระยะเวลาระหว่างวันเริ่มกับวันหมด (ไม่มีให้ใช้ 12 เดือน), Rental รอบเดือนใช้ 1 เดือน
const buildForecast = (items, today, months, growth) => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const buckets = {};
    for (let i = 0; i < months; i++) {
        const d = addMonths(first, i);
        buckets[monthKey(d)] = { key: monthKey(d), label: monthLabel(d), total: 0, count: 0, items: [], cats: {} };
    }
    const horizonEnd = addMonths(first, months);
    const byCategory = {};
    const assumptions = [];

    for (const it of items) {
        if (it.Status === 'Cancelled' || it.Status === 'Pending') continue;
        const price = num(it.Price);
        if (!price || !it.EndDate) continue;
        const period = (it.Category === 'RENTAL' && it.POCycle === 'monthly')
            ? 1
            : (it.StartDate ? Math.max(1, monthsBetween(new Date(it.StartDate), new Date(it.EndDate))) : 12);
        let next = addDays(new Date(it.EndDate), 1);
        if (next < today) next = new Date(today); // หมดแล้วยังไม่ต่อ → คาดว่าต้องจ่ายทันที
        let guard = 0;
        while (next < horizonEnd && guard++ < 500) {
            const b = buckets[monthKey(next)];
            if (b) {
                const yrs = Math.floor((next - today) / (DAY * 365.25));
                const amount = price * Math.pow(1 + growth, yrs);
                b.total += amount;
                b.count += 1;
                b.cats[it.Category] = (b.cats[it.Category] || 0) + amount;
                b.items.push({ ItemID: it.ItemID, ItemName: it.ItemName, Category: it.Category, amount: round2(amount), date: next });
                byCategory[it.Category] = (byCategory[it.Category] || 0) + amount;
            }
            next = addMonths(next, period);
        }
    }

    const list = Object.values(buckets).map((b) => {
        b.items.sort((x, y) => y.amount - x.amount);
        const cats = Object.fromEntries(Object.entries(b.cats).map(([k, v]) => [k, round2(v)]));
        return { ...b, total: round2(b.total), cats, items: b.items.slice(0, 50) };
    });
    const total = round2(list.reduce((s, b) => s + b.total, 0));
    assumptions.push('คาดการณ์จากราคาในรายการ และระยะรอบจาก วันเริ่ม–วันหมดอายุ (Rental รอบเดือนคิดเป็นรายเดือน)');
    assumptions.push('รายการที่หมดอายุแล้วแต่ยังไม่ต่ออายุ จะถูกคิดให้จ่ายในวันนี้');
    assumptions.push('รายการสถานะ Cancelled และ Pending ไม่นับ');
    if (growth) assumptions.push(`ปรับราคาขึ้นปีละ ${(growth * 100).toFixed(1)}% (ทบต้น)`);
    return {
        months,
        growth,
        total,
        buckets: list,
        byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, round2(v)])),
        assumptions,
    };
};

export const getMAReport = async (req, res) => {
    try {
        const pool = getPool();
        const today = startOfDay(new Date());
        const from = req.query.from ? new Date(req.query.from) : null;
        const to = req.query.to ? new Date(req.query.to) : null;
        const months = Math.min(36, Math.max(1, parseInt(req.query.months, 10) || 12));
        const growth = Math.min(1, Math.max(0, (parseFloat(req.query.growth) || 0) / 100));

        const itemsRes = await pool.request().query(`
            SELECT m.ItemID, m.Category, m.SubType, m.ItemName, m.SerialNumber, m.IpAddress, m.MacAddress,
                   m.Price, m.StartDate, m.EndDate, m.Status, m.RenewalStatus, m.POCycle, m.VendorID,
                   v.VendorName
            FROM dbo.MA_Items m
            LEFT JOIN dbo.Stock_Vendors v ON m.VendorID = v.VendorID
            WHERE m.IsDeleted = 0`);
        const items = itemsRes.recordset;

        const rq = pool.request();
        let rWhere = 'WHERE 1=1';
        if (from) { rq.input('from', sql.DateTime, from); rWhere += ' AND r.CompletedAt >= @from'; }
        if (to) { rq.input('to', sql.DateTime, to); rWhere += ' AND r.CompletedAt < @to'; }
        const renewalsRes = await rq.query(`
            SELECT r.RenewalID, r.ItemID, r.OldStartDate, r.OldEndDate, r.NewStartDate, r.NewEndDate,
                   r.OldPrice, r.NewPrice, r.OldPONumber, r.NewPONumber, r.PRNumber, r.CompletedBy, r.CompletedAt,
                   m.ItemName, m.Category
            FROM dbo.MA_RenewalHistory r
            JOIN dbo.MA_Items m ON m.ItemID = r.ItemID
            ${rWhere}
            ORDER BY r.CompletedAt DESC`);
        const renewals = renewalsRes.recordset;

        const fileRes = await pool.request().query(`
            SELECT RenewalID, COUNT(*) AS Files FROM dbo.MA_Attachments
            WHERE RenewalID IS NOT NULL AND IsDeleted = 0 GROUP BY RenewalID`);
        const fileCount = Object.fromEntries(fileRes.recordset.map((r) => [r.RenewalID, r.Files]));

        // ── KPI ──
        const live = items.filter((i) => i.Status !== 'Cancelled' && i.Status !== 'Pending');
        const withStatus = items.map((i) => ({ ...i, eff: effStatus(i, today) }));
        const kpi = {
            total: items.length,
            active: withStatus.filter((i) => i.eff === 'Active').length,
            expiring: withStatus.filter((i) => i.eff === 'Expiring').length,
            expired: withStatus.filter((i) => i.eff === 'Expired').length,
            pending: withStatus.filter((i) => i.Status === 'Pending').length,
            cancelled: withStatus.filter((i) => i.Status === 'Cancelled').length,
            totalValue: round2(live.reduce((s, i) => s + num(i.Price), 0)),
            inRenewal: live.filter((i) => i.RenewalStatus).length,
            renewedInRange: renewals.length,
            renewalSpendInRange: round2(renewals.reduce((s, r) => s + num(r.NewPrice), 0)),
            renewalChangeInRange: round2(renewals.reduce((s, r) => s + (num(r.NewPrice) - num(r.OldPrice)), 0)),
        };

        // ── breakdowns ──
        const group = (arr, keyFn) => {
            const m = {};
            for (const i of arr) {
                const k = keyFn(i);
                m[k] = m[k] || { key: k, count: 0, value: 0 };
                m[k].count += 1;
                m[k].value += num(i.Price);
            }
            return Object.values(m).map((g) => ({ ...g, value: round2(g.value) }));
        };
        const byCategory = group(live, (i) => i.Category || '-');
        const byStatus = group(withStatus, (i) => i.eff);
        const funnelSteps = ['QUOTATION', 'PR_CREATED', 'WAITING_PO', 'PO_ISSUED'];
        const funnel = [
            { key: null, label: 'ยังไม่ดำเนินการ', count: live.filter((i) => !i.RenewalStatus).length },
            ...funnelSteps.map((s) => ({ key: s, count: live.filter((i) => i.RenewalStatus === s).length })),
        ];
        const byVendor = group(live, (i) => i.VendorName || 'ไม่ระบุ').sort((a, b) => b.value - a.value).slice(0, 10);

        // ── รายการใกล้หมด (≤ 90 วัน รวมที่หมดแล้ว) ──
        const liveIds = new Set(live.map((i) => i.ItemID));
        const expiring = withStatus
            .filter((i) => i.EndDate && liveIds.has(i.ItemID) && daysLeft(i.EndDate, today) <= 90)
            .map((i) => ({ ItemID: i.ItemID, ItemName: i.ItemName, Category: i.Category, VendorName: i.VendorName, EndDate: i.EndDate, Price: num(i.Price), daysLeft: daysLeft(i.EndDate, today), RenewalStatus: i.RenewalStatus }))
            .sort((a, b) => a.daysLeft - b.daysLeft);

        // ── คุณภาพข้อมูล ──
        const pick = (arr) => arr.slice(0, 100).map((i) => ({ ItemID: i.ItemID, ItemName: i.ItemName, Category: i.Category }));
        const quality = {
            noEndDate: pick(live.filter((i) => !i.EndDate)),
            noPrice: pick(live.filter((i) => !num(i.Price))),
            noVendor: pick(live.filter((i) => !i.VendorID)),
            hwNoSerial: pick(live.filter((i) => i.Category === 'HARDWARE' && !i.SerialNumber)),
        };

        const forecast = buildForecast(live, today, months, growth);

        // ค่าต่ออายุที่จ่ายจริงจากประวัติ 12 เดือนย้อนหลัง (ประวัติเริ่มบันทึกหลังมีระบบนี้)
        const lastYearRes = await pool.request().query(`
            SELECT COUNT(*) AS Cnt, ISNULL(SUM(NewPrice), 0) AS Total
            FROM dbo.MA_RenewalHistory
            WHERE CompletedAt >= DATEADD(month, -12, GETDATE())`);
        const actualLast12 = {
            total: round2(num(lastYearRes.recordset[0].Total)),
            count: lastYearRes.recordset[0].Cnt || 0,
        };

        res.json({
            generatedAt: new Date(),
            range: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
            kpi,
            byCategory,
            byStatus,
            funnel,
            byVendor,
            expiring,
            quality,
            renewals: renewals.map((r) => ({ ...r, files: fileCount[r.RenewalID] || 0 })),
            forecast,
            actualLast12,
        });
    } catch (err) {
        console.error('MA Report Error:', err);
        res.status(500).json({ error: err.message });
    }
};
