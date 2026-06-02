// ============================================================
//  calendarController.js
//  Controller : dbo.cal_tasks + dbo.cal_recurrence
//  Updated: เพิ่ม DATETIME2 support สำหรับ start_date / end_date
// ============================================================
import { getPool, sql } from '../config/db.js';

// ─── Helper: แปลง datetime-local string → JS Date ────────────────────────────
// datetime-local ส่งมาในรูป "2026-05-29T14:30" หรือ "2026-05-29"
const parseDateTime = (str) => {
    if (!str) return null;
    // ถ้าเป็นแค่ date (ไม่มีเวลา) ให้ต่อ T00:00:00
    return str.length === 10 ? new Date(`${str}T00:00:00`) : new Date(str);
};

// ─── Helper: format DATETIME2 → "YYYY-MM-DDTHH:mm" สำหรับส่งกลับ frontend ──
const fmtDT = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

// ─── GET /calendar/tasks ─────────────────────────────────────────────────────
export const getTasks = async (req, res) => {
    try {
        const { start, end, type } = req.query;
        const pool = getPool();
        const request = pool.request();

        let where = 'WHERE 1=1';
        if (start) {
            request.input('start', sql.DateTime2, parseDateTime(start));
            where += ' AND t.start_date >= @start';
        }
        if (end) {
            request.input('end', sql.DateTime2, parseDateTime(end));
            where += ' AND t.start_date <= @end';
        }
        if (type) {
            request.input('type', sql.VarChar(20), type);
            where += ' AND t.task_type = @type';
        }

        const result = await request.query(`
            SELECT
                t.task_id,
                t.task_title,
                CONVERT(VARCHAR(19), t.start_date, 120) AS start_date,
                CONVERT(VARCHAR(19), t.end_date,   120) AS end_date,
                t.task_type,
                lk.type_label,
                lk.color_class,
                t.description,
                t.is_recurring,
                t.recurrence_id,
                t.created_by,
                CONVERT(VARCHAR(19), t.created_at, 120) AS created_at,
                CONVERT(VARCHAR(19), t.updated_at, 120) AS updated_at
            FROM  [dbo].[cal_tasks]         t
            JOIN  [dbo].[lkp_cal_task_type] lk ON t.task_type = lk.type_key
            ${where}
            ORDER BY t.start_date ASC
        `);

        // แปลง start_date / end_date → "YYYY-MM-DDTHH:mm"
        const data = result.recordset.map(r => ({
            ...r,
            start_date: fmtDT(r.start_date),
            end_date:   fmtDT(r.end_date),
        }));

        res.json({ success: true, data });
    } catch (err) {
        console.error('[calendarController] getTasks:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /calendar/tasks/:id ──────────────────────────────────────────────────
export const getTaskById = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT
                    t.task_id,
                    t.task_title,
                    CONVERT(VARCHAR(19), t.start_date, 120) AS start_date,
                    CONVERT(VARCHAR(19), t.end_date,   120) AS end_date,
                    t.task_type,
                    t.description,
                    t.is_recurring,
                    t.recurrence_id,
                    t.created_by,
                    CONVERT(VARCHAR(19), t.created_at, 120) AS created_at,
                    CONVERT(VARCHAR(19), t.updated_at, 120) AS updated_at,
                    lk.type_label,
                    lk.color_class,
                    r.mon, r.tue, r.wed, r.thu, r.fri, r.sat, r.sun,
                    r.range_days
                FROM  [dbo].[cal_tasks]         t
                JOIN  [dbo].[lkp_cal_task_type] lk ON t.task_type = lk.type_key
                LEFT JOIN [dbo].[cal_recurrence] r  ON t.recurrence_id = r.recurrence_id
                WHERE t.task_id = @id
            `);

        if (!result.recordset.length)
            return res.status(404).json({ success: false, error: 'Task not found' });

        const r = result.recordset[0];
        res.json({
            success: true,
            data: {
                ...r,
                start_date: fmtDT(r.start_date),
                end_date:   fmtDT(r.end_date),
            }
        });
    } catch (err) {
        console.error('[calendarController] getTaskById:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /calendar/task-types ─────────────────────────────────────────────────
export const getTaskTypes = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT type_key, type_label, color_class
            FROM   [dbo].[lkp_cal_task_type]
            ORDER  BY sort_order
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('[calendarController] getTaskTypes:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── POST /calendar/tasks ─────────────────────────────────────────────────────
export const createTask = async (req, res) => {
    try {
        const {
            task_title, start_date, end_date, task_type,
            description, is_recurring, recur_days, range_days,
            created_by
        } = req.body;

        if (!task_title || !start_date || !task_type)
            return res.status(400).json({ success: false, error: 'task_title, start_date, task_type are required' });

        const pool = getPool();
        const startDT = parseDateTime(start_date);
        const endDT   = end_date ? parseDateTime(end_date) : null;

        // ── Recurring: insert recurrence pattern ────────────────────────────
        let recurrenceId = null;
        if (is_recurring && Array.isArray(recur_days) && recur_days.length > 0) {
            const days = ['mon','tue','wed','thu','fri','sat','sun'];
            const recReq = pool.request();
            days.forEach(d => recReq.input(d, sql.Bit, recur_days.includes(d) ? 1 : 0));
            recReq.input('range_days', sql.Int, range_days || 28);
            const recResult = await recReq.query(`
                INSERT INTO [dbo].[cal_recurrence]
                    (mon, tue, wed, thu, fri, sat, sun, range_days)
                OUTPUT INSERTED.recurrence_id
                VALUES (@mon, @tue, @wed, @thu, @fri, @sat, @sun, @range_days)
            `);
            recurrenceId = recResult.recordset[0].recurrence_id;
        }

        // ── สร้าง list วันที่จะ insert ──────────────────────────────────────
        let datesToInsert = [];

        if (is_recurring && recurrenceId) {
            const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
            const targetDays = (recur_days || []).map(d => dayMap[d]).filter(n => n !== undefined);
            const rd  = range_days || 28;
            // recurring ใช้ DATE part เท่านั้น (เวลาจาก startDT)
            const hr  = startDT.getHours();
            const min = startDT.getMinutes();
            let cur = new Date(startDT);
            const maxDate = new Date(startDT);
            maxDate.setDate(maxDate.getDate() + rd);

            while (cur <= maxDate) {
                if (targetDays.includes(cur.getDay())) {
                    // เก็บเวลาเดิมไว้ทุกวัน
                    const d = new Date(cur);
                    d.setHours(hr, min, 0, 0);
                    datesToInsert.push(d);
                }
                cur.setDate(cur.getDate() + 1);
            }
        } else {
            datesToInsert = [startDT];
        }

        if (!datesToInsert.length)
            return res.status(400).json({ success: false, error: 'No valid dates generated' });

        // ── Insert tasks ─────────────────────────────────────────────────────
        const insertedIds = [];
        for (const dt of datesToInsert) {
            const r = pool.request();
            r.input('task_title',    sql.NVarChar(200),     task_title);
            r.input('start_date',    sql.DateTime2,         dt);
            r.input('end_date',      sql.DateTime2,         (!is_recurring && endDT) ? endDT : null);
            r.input('task_type',     sql.VarChar(20),       task_type);
            r.input('description',   sql.NVarChar(sql.MAX), description || null);
            r.input('is_recurring',  sql.Bit,               is_recurring ? 1 : 0);
            r.input('recurrence_id', sql.Int,               recurrenceId);
            r.input('created_by',    sql.VarChar(100),      created_by || 'system');

            const ins = await r.query(`
                INSERT INTO [dbo].[cal_tasks]
                    (task_title, start_date, end_date, task_type, description,
                     is_recurring, recurrence_id, created_by)
                OUTPUT INSERTED.task_id
                VALUES
                    (@task_title, @start_date, @end_date, @task_type, @description,
                     @is_recurring, @recurrence_id, @created_by)
            `);
            insertedIds.push(ins.recordset[0].task_id);
        }

        res.json({
            success: true,
            message: `Created ${insertedIds.length} task(s)`,
            data: { count: insertedIds.length, ids: insertedIds }
        });
    } catch (err) {
        console.error('[calendarController] createTask:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── PUT /calendar/tasks/:id ──────────────────────────────────────────────────
export const updateTask = async (req, res) => {
    try {
        const { task_title, start_date, end_date, task_type, description } = req.body;
        const pool = getPool();

        await pool.request()
            .input('id',          sql.Int,                 req.params.id)
            .input('task_title',  sql.NVarChar(200),       task_title)
            .input('start_date',  sql.DateTime2,           parseDateTime(start_date))
            .input('end_date',    sql.DateTime2,           end_date ? parseDateTime(end_date) : null)
            .input('task_type',   sql.VarChar(20),         task_type)
            .input('description', sql.NVarChar(sql.MAX),   description || null)
            .query(`
                UPDATE [dbo].[cal_tasks]
                SET  task_title  = @task_title,
                     start_date  = @start_date,
                     end_date    = @end_date,
                     task_type   = @task_type,
                     description = @description
                WHERE task_id = @id
            `);

        res.json({ success: true, message: 'Task updated' });
    } catch (err) {
        console.error('[calendarController] updateTask:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── DELETE /calendar/tasks/:id ───────────────────────────────────────────────
export const deleteTask = async (req, res) => {
    try {
        const pool = getPool();
        const chk = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT recurrence_id FROM [dbo].[cal_tasks] WHERE task_id = @id`);

        if (!chk.recordset.length)
            return res.status(404).json({ success: false, error: 'Task not found' });

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`DELETE FROM [dbo].[cal_tasks] WHERE task_id = @id`);

        res.json({ success: true, message: 'Task deleted' });
    } catch (err) {
        console.error('[calendarController] deleteTask:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /calendar/upcoming ───────────────────────────────────────────────────
export const getUpcoming = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT TOP 5
                t.task_id,
                t.task_title,
                CONVERT(VARCHAR(19), t.start_date, 120) AS start_date,
                t.task_type,
                lk.type_label,
                lk.color_class
            FROM  [dbo].[cal_tasks]         t
            JOIN  [dbo].[lkp_cal_task_type] lk ON t.task_type = lk.type_key
            WHERE t.start_date >= GETDATE()
            ORDER BY t.start_date ASC
        `);

        const data = result.recordset.map(r => ({
            ...r,
            start_date: fmtDT(r.start_date),
        }));

        res.json({ success: true, data });
    } catch (err) {
        console.error('[calendarController] getUpcoming:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};