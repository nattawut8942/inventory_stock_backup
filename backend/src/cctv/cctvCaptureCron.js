import cron from 'node-cron';
import { runCapture }        from './cctvCaptureService.js';
import { sendCaptureReport } from './cctvEmailService.js';
import fs   from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'capture-settings.json');

function loadSettings() {
    const defaults = {
        ffmpeg_path:     'C:\\ffmpeg\\bin\\ffmpeg.exe',
        output_base_dir: 'C:\\CCTV_Captures',
        timeout_sec:     10,
        send_email:      true,
    };
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
        }
    } catch {}
    return defaults;
}

export function startCaptureCron() {
    // ทุกวันจันทร์ เวลา 08:00
    // cron format: minute hour day month weekday
    // weekday 1 = จันทร์
    cron.schedule('0 8 * * 1', async () => {
        const settings = loadSettings();
        console.log(`[Capture Cron] Starting weekly capture — ${new Date().toLocaleString('th-TH')}`);

        try {
            const { runId, outputDir, results } = await runCapture({
                ffmpegPath:    settings.ffmpeg_path,
                outputBaseDir: settings.output_base_dir,
                timeoutSec:    settings.timeout_sec,
                onProgress:    (msg) => console.log(`[Capture] ${msg}`),
            });

            const ok      = results.filter(r => r.status === 'ok').length;
            const offline = results.filter(r => r.status === 'offline').length;
            const removed = results.filter(r => ['removed','retired'].includes(r.status)).length;

            console.log(`[Capture Cron] Done — Total:${results.length} OK:${ok} Offline:${offline} Removed:${removed}`);

            if (settings.send_email) {
                await sendCaptureReport(runId, results, outputDir);
                console.log('[Capture Cron] Email sent');
            }
        } catch (err) {
            console.error('[Capture Cron] Error:', err.message);
        }
    }, {
        timezone: 'Asia/Bangkok'
    });

    console.log('[Capture Cron] Scheduled: ทุกวันจันทร์ 08:00 (Asia/Bangkok)');
}