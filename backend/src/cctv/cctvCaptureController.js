import { sql, getPool } from '../config/db.js';
import { runCapture }    from './cctvCaptureService.js';
import { sendCaptureReport } from './cctvEmailService.js';
import path from 'path';
import fs   from 'fs';

// ── Settings (เก็บใน memory + file) ──────────────────────────────────────
const SETTINGS_PATH = path.join(process.cwd(), 'data', 'capture-settings.json');

function loadSettings() {
    const defaults = {
        ffmpeg_path:     'C:\\ffmpeg\\bin\\ffmpeg.exe',
        output_base_dir: 'C:\\CCTV_Captures',
        timeout_sec:     10,
        concurrency:     3,      // capture พร้อมกันสูงสุด 3 ตัว
        ping_delay_ms:   200,    // หน่วง 200ms ระหว่าง ping
        batch_delay_ms:  2000,   // หน่วง 2 วินาที ระหว่าง batch
        send_email:      true,
    };
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
        }
    } catch {}
    return defaults;
}

function saveSettings(settings) {
    const dir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// ── GET /cctv/capture/settings ────────────────────────────────────────────
export const getCaptureSettings = (req, res) => {
    res.json({ success: true, data: loadSettings() });
};

// ── PUT /cctv/capture/settings ────────────────────────────────────────────
export const updateCaptureSettings = (req, res) => {
    const current  = loadSettings();
    const updated  = { ...current, ...req.body };
    saveSettings(updated);
    res.json({ success: true, data: updated });
};

// ── POST /cctv/capture/run (manual trigger) ───────────────────────────────
export const triggerCapture = async (req, res) => {
    const settings = loadSettings();
    const logs     = [];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (msg) => {
        logs.push(msg);
        res.write(`data: ${JSON.stringify({ msg })}\n\n`);
    };

    try {
        send(`[Start] Run capture — ffmpeg: ${settings.ffmpeg_path}`);

        const { runId, outputDir, results } = await runCapture({
            ffmpegPath:    settings.ffmpeg_path,
            outputBaseDir: settings.output_base_dir,
            timeoutSec:    settings.timeout_sec    || 10,
            concurrency:   settings.concurrency    || 3,
            pingDelay:     settings.ping_delay_ms  || 200,
            batchDelay:    settings.batch_delay_ms || 2000,
            onProgress:    send,
        });

        // สรุปผล
        const ok      = results.filter(r => r.status === 'ok').length;
        const offline = results.filter(r => r.status === 'offline').length;
        const removed = results.filter(r => ['removed','retired'].includes(r.status)).length;
        const problem = results.filter(r => ['blur_heavy','blur_medium','black','error'].includes(r.status)).length;

        send(`[Done] Total:${results.length} OK:${ok} Offline:${offline} Problem:${problem} Removed:${removed}`);

        // ส่งเมล
        if (settings.send_email) {
            send('[Email] Sending...');
            await sendCaptureReport(runId, results, outputDir);
            send('[Email] Sent successfully');
        }

        res.write(`data: ${JSON.stringify({ done: true, runId, summary: { total: results.length, ok, offline, removed, problem } })}\n\n`);
    } catch (err) {
        send(`[Error] ${err.message}`);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    } finally {
        res.end();
    }
};

// ── GET /cctv/capture/logs ────────────────────────────────────────────────
export const getCaptureLogs = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT run_id, MIN(captured_at) AS started_at,
                COUNT(*) AS total,
                SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok,
                SUM(CASE WHEN status='offline' THEN 1 ELSE 0 END) AS offline,
                SUM(CASE WHEN status IN ('removed','retired') THEN 1 ELSE 0 END) AS removed,
                SUM(CASE WHEN status IN ('blur_heavy','blur_medium','black','error') THEN 1 ELSE 0 END) AS problem
            FROM dbo.cctv_capture_logs
            GROUP BY run_id
            ORDER BY MIN(captured_at) DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── GET /cctv/capture/logs/:run_id ────────────────────────────────────────
export const getCaptureLogDetail = async (req, res) => {
    try {
        const { run_id } = req.params;
        const pool = await getPool();
        const result = await pool.request()
            .input('run_id', sql.NVarChar(50), run_id)
            .query(`
                SELECT * FROM dbo.cctv_capture_logs
                WHERE run_id = @run_id
                ORDER BY factory_name, camera_name
            `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};