// ============================================================
//  fsrmWorker.js — รันใน Worker Thread แยกจาก main process
// ============================================================
import { workerData, parentPort } from 'worker_threads';
import { spawn }                   from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir }                  from 'os';
import { join }                    from 'path';

const { username, fsrmConfig } = workerData;
const { FSRM_SERVER, FSRM_USER, FSRM_PASS, REPORT_PATH, REPORT_NAME } = fsrmConfig;

const step = (msg) => parentPort.postMessage({ type: 'step', msg });
const done = (files, reportFile) => parentPort.postMessage({ type: 'done', files, reportFile });
const fail = (err)  => parentPort.postMessage({ type: 'error', error: err });

let cancelled = false;
parentPort.on('message', (msg) => { if (msg === 'cancel') cancelled = true; });

const runPS = (lines, timeoutMs = 180000) => new Promise((resolve, reject) => {
    if (cancelled) return reject(new Error('CANCELLED'));
    const psFile = join(tmpdir(), `fsrm_${Date.now()}_${username}.ps1`);
    // เพิ่ม UTF-8 BOM + set output encoding ก่อนทุก script
    const header = [
        '$OutputEncoding = [System.Text.Encoding]::UTF8',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '[Console]::InputEncoding  = [System.Text.Encoding]::UTF8',
        '',
    ];
    writeFileSync(psFile, [...header, ...lines].join('\r\n'), 'utf8');
    const proc = spawn('powershell', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-NonInteractive', '-File', psFile
    ], { timeout: timeoutMs });
    let chunks = [];
    let stderr = '';
    proc.stdout.on('data', d => { chunks.push(d); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', (code) => {
        try { if (existsSync(psFile)) unlinkSync(psFile); } catch {}
        if (cancelled) return reject(new Error('CANCELLED'));
        const stdout = Buffer.concat(chunks).toString('utf8');
        if (code === 0 || stdout.length > 0) resolve(stdout);
        else reject(new Error(stderr.split('\n')[0] || `exit ${code}`));
    });
    proc.on('error', (err) => {
        try { if (existsSync(psFile)) unlinkSync(psFile); } catch {}
        reject(err);
    });
});

const run = async () => {
    try {
        step('กำลัง Set FSRM Owner...');
        const checkOut = await runPS([
            `$pass = ConvertTo-SecureString '${FSRM_PASS}' -AsPlainText -Force`,
            `$cred = New-Object System.Management.Automation.PSCredential('${FSRM_USER}', $pass)`,
            `Invoke-Command -ComputerName ${FSRM_SERVER} -Credential $cred -ScriptBlock {`,
            `    param($rname, $owner)`,
            `    $w = 0`,
            `    while (((Get-FsrmStorageReport -Name $rname).Status -eq 1 -or (Get-FsrmStorageReport -Name $rname).Status -eq 2) -and $w -lt 120) { Start-Sleep -Seconds 5; $w += 5 }`,
            `    Set-FsrmStorageReport -Name $rname -FileOwnerUser @($owner) -Confirm:$false`,
            `    Write-Output 'READY'`,
            `} -ArgumentList '${REPORT_NAME}','DCISERVER_\\${username}'`,
        ], 180000);
        if (!checkOut.includes('READY')) { fail('Set owner ไม่สำเร็จ'); return; }

        step('กำลัง run FSRM report...');
        const beforeFile = (await runPS([
            `$pass = ConvertTo-SecureString '${FSRM_PASS}' -AsPlainText -Force`,
            `$cred = New-Object System.Management.Automation.PSCredential('${FSRM_USER}', $pass)`,
            `Invoke-Command -ComputerName ${FSRM_SERVER} -Credential $cred -ScriptBlock {`,
            `    param($rpath)`,
            `    $f = Get-ChildItem $rpath -Filter 'FilesbyOwner*.html' | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
            `    if ($f) { $f.Name } else { 'NONE' }`,
            `} -ArgumentList '${REPORT_PATH}'`,
        ], 60000)).trim();

        const startOut = await runPS([
            `$ConfirmPreference = 'None'`,
            `$pass = ConvertTo-SecureString '${FSRM_PASS}' -AsPlainText -Force`,
            `$cred = New-Object System.Management.Automation.PSCredential('${FSRM_USER}', $pass)`,
            `Invoke-Command -ComputerName ${FSRM_SERVER} -Credential $cred -ScriptBlock {`,
            `    param($rname); $ConfirmPreference = 'None'`,
            `    Start-FsrmStorageReport -Name $rname -Queue -Confirm:$false`,
            `    Write-Output 'STARTED'`,
            `} -ArgumentList '${REPORT_NAME}'`,
        ], 60000);
        if (!startOut.includes('STARTED')) { fail('Start report ไม่สำเร็จ'); return; }

        step('รอ report เสร็จ...');
        let newFile = null;
        const isStillRunning = (s) => {
            if (!s) return false;
            const sv = String(s).trim().toLowerCase();
            // รองรับทั้ง string และตัวเลข: 1=Queued, 2=Running
            return sv === '1' || sv === '2' || sv === 'queued' || sv === 'running';
        };
        for (let w = 0; w < 600; w += 5) {  // max 10 นาที
            if (cancelled) throw new Error('CANCELLED');
            await new Promise(r => setTimeout(r, 5000));
            if (cancelled) throw new Error('CANCELLED');

            const pollOut = (await runPS([
                `$pass = ConvertTo-SecureString '${FSRM_PASS}' -AsPlainText -Force`,
                `$cred = New-Object System.Management.Automation.PSCredential('${FSRM_USER}', $pass)`,
                `Invoke-Command -ComputerName ${FSRM_SERVER} -Credential $cred -ScriptBlock {`,
                `    param($rname, $rpath, $prevFile)`,
                `    $r = Get-FsrmStorageReport -Name $rname`,
                `    $s = $r.Status`,
                `    $f = Get-ChildItem $rpath -Filter 'FilesbyOwner*.html' | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
                `    $isNew = ($f -and $f.Name -ne $prevFile)`,
                `    Write-Output "STATUS:$s|FILE:$($f.Name)|ISNEW:$isNew"`,
                `} -ArgumentList '${REPORT_NAME}','${REPORT_PATH}','${beforeFile}'`,
            ], 45000)).trim();

            const status = (pollOut.match(/STATUS:([^|]+)/) || [])[1]?.trim();
            const fname  = ((pollOut.match(/FILE:([^|]+)/) || [])[1] || '').trim();
            const isNew  = (pollOut.match(/ISNEW:(\w+)/) || [])[1] === 'True';

            step(`รอ report... [${w+5}s] status=${status}`);

            if (!isStillRunning(status)) {
                if (isNew && fname) { newFile = fname; break; }
                // รอเพิ่ม 10 วิ เผื่อไฟล์ write ไม่ทัน
                if (w >= 10) {
                    await new Promise(r => setTimeout(r, 10000));
                    break;
                }
            }
        }

        step('กำลังอ่านไฟล์ HTML...');
        // อ่านเป็น Base64 เพื่อรักษา encoding ภาษาไทยผ่าน WinRM
        const b64 = await runPS([
            `$pass = ConvertTo-SecureString '${FSRM_PASS}' -AsPlainText -Force`,
            `$cred = New-Object System.Management.Automation.PSCredential('${FSRM_USER}', $pass)`,
            `Invoke-Command -ComputerName ${FSRM_SERVER} -Credential $cred -ScriptBlock {`,
            `    param($rpath, $targetFile)`,
            `    $f = if ($targetFile -and $targetFile -ne 'NONE') { Get-Item (Join-Path $rpath $targetFile) -ErrorAction SilentlyContinue }`,
            `         else { Get-ChildItem $rpath -Filter 'FilesbyOwner*.html' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }`,
            `    if ($f) { [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f.FullName)) }`,
            `    else { '' }`,
            `} -ArgumentList '${REPORT_PATH}','${newFile || ''}'`,
        ], 120000);

        if (!b64 || b64.trim().length < 100) { done([]); return; }
        // decode Base64 → UTF-8 string
        const html = Buffer.from(b64.trim(), 'base64').toString('utf8');
        if (html.length < 500) { done([]); return; }

        step('กำลัง parse รายการไฟล์...');
        const files = parseFiles(html, username);
        step(`ได้ไฟล์ ${files.length} รายการ`);
        done(files, newFile || '');

    } catch (err) {
        if (err.message === 'CANCELLED') fail('CANCELLED');
        else fail(err.message.split('\n')[0]);
    }
};

const parseFiles = (html, uname) => {
    // หา ReportStatistics anchor ทั้งหมดก่อน
    // แต่ละ anchor คือ section ของ user คนนึง
    const allAnchors = [];
    const anchorRe = /name="ReportStatistics(\d+)"/gi;
    let am;
    while ((am = anchorRe.exec(html)) !== null) {
        allAnchors.push(am.index);
    }

    const candidates = [
        uname,
        `DCISERVER_\\${uname}`,
        uname.toUpperCase(),
        `DCISERVER_\\${uname.toUpperCase()}`,
    ];

    let sec = null;
    for (let ai = 0; ai < allAnchors.length; ai++) {
        const start = allAnchors[ai];
        const end   = allAnchors[ai + 1] || html.length;
        const chunk = html.slice(start, end);

        // เช็คว่า section นี้เป็นของ user ที่ต้องการไหม
        const headerMatch = chunk.match(/Statistics for files by ['"]?([^'"<\r\n]+)['"]?/i);
        if (!headerMatch) continue;

        const owner = headerMatch[1].trim();
        const matched = candidates.some(c => owner.toLowerCase().includes(c.toLowerCase()));
        if (matched) {
            sec = chunk;
            console.log(`[FSRM] Found section for: ${owner} (${sec.length} chars)`);
            break;
        }
    }

    if (!sec) {
        console.warn(`[FSRM] No section found for: ${uname}`);
        return [];
    }

    // FSRM HTML structure:
    // <TR>
    //   <TD rowSpan="2">FILENAME</TD>         ← ชื่อไฟล์
    //   <TD><a href='UNC' title='UNC'>PATH</a></TD>  ← path + link
    // </TR>
    // <TR>
    //   <TD>SIZE_ON_DISK</TD><TD>SIZE</TD>...  ← ขนาด
    // </TR>
    const files = [];
    // จับคู่ชื่อไฟล์ (rowSpan="2") กับ path จาก <a> ในแถวเดียวกัน
    const rowRe = /<TR>\s*<TD[^>]*rowSpan="2"[^>]*>([\s\S]*?)<\/TD>\s*<TD[^>]*>\s*<a\s+href=['"]([^'"]+)['"]\s+title=['"]([^'"]+)['"]\s*>([^<]+)<\/a>/gi;
    let m;
    while ((m = rowRe.exec(sec)) !== null) {
        const filename = cl(m[1]);
        const unc      = cl(m[2]); // UNC path (\\W2KADTH\...)
        const path     = cl(m[4]); // LOCAL path (E:\...)
        if (filename && path && path.includes('\\')) {
            // กรอง header row ออก
            if (filename && !filename.includes('File name') && !filename.includes('Folder')) {
                files.push({ filename: filename.split('\n')[0].trim(), path, unc: unc || path, size: '—' });
            }
        }
    }

    // ดึงขนาดไฟล์
    const sr = /<TD[^>]*>\s*([\d,.]+\s*(?:MB|GB|KB|TB|bytes))\s*<\/TD>/gi;
    const sz = []; let sm;
    while ((sm = sr.exec(sec)) !== null) sz.push(sm[1].trim());
    files.forEach((f, i) => { f.size = sz[i] || '—'; });

    console.log(`[FSRM] Parsed ${files.length} files for ${uname}`);
    return files
        .filter(f => f.path.length > 5)
        .sort((a, b) => toMB(b.size) - toMB(a.size))
        .slice(0, 20);
};
const cl = s => {
    if (!s) return '';
    // decode HTML entities รวมถึง &#xXXXX; สำหรับภาษาไทย
    return s
        .replace(/<[^>]+>/g, '')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .trim();
};
const toMB  = s=>{ if(!s||s==='—')return 0; const n=parseFloat(s.replace(/,/g,'')); if(isNaN(n))return 0; if(s.includes('GB'))return n*1024; if(s.includes('TB'))return n*1024*1024; if(s.includes('KB'))return n/1024; return n; };

run();