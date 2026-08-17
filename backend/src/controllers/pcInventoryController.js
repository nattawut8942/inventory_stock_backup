import { getPool, sql } from '../config/db.js';

// PUT: Update BitLocker Info
export const updateBitlocker = async (req, res) => {
    try {
        const db = await getPool();
        const request = db.request();
        request.input('hostname', sql.NVarChar, req.params.hostname);
        request.input('bitlocker_key_c', sql.NVarChar, req.body.bitlocker_key_c || '');
        request.input('bitlocker_key_d', sql.NVarChar, req.body.bitlocker_key_d || '');
        request.input('bitlocker_pin', sql.NVarChar, req.body.bitlocker_pin || '');
        await request.query(`
            UPDATE dbo.info_pc_inventory
            SET bitlocker_key_c = @bitlocker_key_c,
                bitlocker_key_d = @bitlocker_key_d,
                bitlocker_pin   = @bitlocker_pin
            WHERE hostname = @hostname
        `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getActiveUsers = async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request().query(`
            SELECT TOP (1000)
                au.[id],au.[hostname],au.[username],au.[session_name],
                au.[session_id],au.[state],au.[logon_time],au.[recorded_at]
            FROM [dbo].[info_pc_active_users] au
            ORDER BY au.[recorded_at] DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getActiveUsersByHostname = async (req, res) => {
    try {
        const db = await getPool();
        const request = db.request();
        request.input('hostname', sql.NVarChar, req.params.hostname);
        const result = await request.query(`
            SELECT TOP (100)
                [id],[hostname],[username],[session_name],
                [session_id],[state],[logon_time],[recorded_at]
            FROM [dbo].[info_pc_active_users]
            WHERE [hostname] = @hostname
            ORDER BY [recorded_at] DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getInventory = async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request().query(`
            SELECT TOP (1000)
                i.[id],i.[hostname],i.[domain],i.[ip_address],i.[mac_address],
                i.[computer_type],i.[manufacturer],i.[model],i.[serial_number],
                i.[cpu_name],i.[cpu_cores],i.[cpu_threads],i.[ram_gb],i.[disk_info],
                i.[os_name],i.[os_release],i.[os_build],i.[os_full_version],i.[os_arch],
                i.[os_install_date],i.[last_boot],i.[uptime],i.[bios_version],
                i.[gpu],i.[resolution],i.[user_count],i.[collected_at],i.[updated_at],
                i.[fix_asset],i.[bitlocker],i.[bitlocker_key_c],i.[crowdstrike_ver],i.[tanium_ver],i.[uems_ver],i.[pc_status],
                i.[factory_layout_id],i.[location_x],i.[location_y],i.[location_updated_at],
                i.[battery_status],i.[battery_percent],i.[battery_health],i.[battery_wear],
                i.[battery_charging],i.[battery_cycle],i.[battery_name],i.[battery_voltage],
                i.[battery_type],i.[battery_manufacturer],
                (SELECT COUNT(DISTINCT au2.[username])
                 FROM [dbo].[info_pc_active_users] au2
                 WHERE au2.[hostname] = i.[hostname]) AS active_users,
                (SELECT TOP 1 au2.[username]
                 FROM [dbo].[info_pc_active_users] au2
                 WHERE au2.[hostname] = i.[hostname]
                 ORDER BY TRY_CONVERT(datetime, au2.[logon_time], 103) DESC) AS active_usernames,
                (SELECT TOP 1 au2.[logon_time]
                 FROM [dbo].[info_pc_active_users] au2
                 WHERE au2.[hostname] = i.[hostname]
                 ORDER BY TRY_CONVERT(datetime, au2.[logon_time], 103) DESC) AS logon_time
            FROM [dbo].[info_pc_inventory] i
            ORDER BY i.[updated_at] DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getInventoryByHostname = async (req, res) => {
    try {
        const db = await getPool();
        const request = db.request();
        request.input('hostname', sql.NVarChar, req.params.hostname);
        const result = await request.query(`
            SELECT 
                [id],[hostname],[domain],[ip_address],[mac_address],
                [computer_type],[manufacturer],[model],[serial_number],
                [cpu_name],[cpu_cores],[cpu_threads],[ram_gb],[ram_info],[ram_detail],[disk_info],
                [os_name],[os_release],[os_build],[os_full_version],[os_arch],
                [os_install_date],[os_product_id],[os_product_key],[os_activation],
                [last_boot],[uptime],[bios_version],
                [gpu],[resolution],[user_count],[local_admin_users],
                [collected_at],[updated_at],
                [fix_asset],[bitlocker],[bitlocker_key_c],[bitlocker_key_d],[bitlocker_pin],
                [crowdstrike_ver],[tanium_ver],[uems_ver],
                [pc_status],[wifi_ssid],[adapter_type],
                [battery_status],[battery_percent],[battery_health],[battery_wear],
                [battery_charging],[battery_cycle],[battery_name],[battery_voltage],[battery_type],[battery_manufacturer],
                -- ✅ NEW: added columns
                [asset_tag],[status],[remark],
                [secure_boot],[tpm_present],[tpm_enabled],[tpm_version],[uac_level],
                [last_patch_kb],[last_patch_date],[shutdown_events],
                [disk_smart_info],[monitor_info],[printer_info],[usb_info],
                [net_gateway],[net_dns],[net_subnet],[net_dhcp],[net_proxy],[net_proxy_server]
            FROM [dbo].[info_pc_inventory]
            WHERE [hostname] = @hostname
        `);
        if (result.recordset.length === 0)
            return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
export const updateAsset = async (req, res) => {
    try {
        // ✅ validate fix_asset format on backend too
        const fixAsset = (req.body.fix_asset || '').trim();
        if (fixAsset && !/^[A-Za-z0-9\-_.]+$/.test(fixAsset)) {
            return res.status(400).json({ success: false, error: 'รูปแบบ Fix Asset ไม่ถูกต้อง' });
        }

        const db = await getPool();
        const request = db.request();
        request.input('hostname', sql.NVarChar, req.params.hostname);
        request.input('fix_asset', sql.NVarChar, fixAsset);
        await request.query(`UPDATE dbo.info_pc_inventory SET fix_asset=@fix_asset WHERE hostname=@hostname`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
export const updateStatus = async (req, res) => {
    try {
        const { pc_status } = req.body;
        if (!['Active', 'Inactive'].includes(pc_status)) {
            return res.status(400).json({ success: false, error: 'pc_status ไม่ถูกต้อง (ต้องเป็น Active หรือ Inactive)' });
        }
        const db = await getPool();
        const request = db.request();
        request.input('hostname', sql.NVarChar, req.params.hostname);
        request.input('pc_status', sql.NVarChar, pc_status);
        await request.query(`UPDATE dbo.info_pc_inventory SET pc_status=@pc_status WHERE hostname=@hostname`);
        res.json({ success: true, message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getSoftwareByHostname = async (req, res) => {
    try {
        const db = await getPool();
        const request = db.request();
        request.input('hostname', sql.NVarChar, req.params.hostname);
        const result = await request.query(`
            SELECT TOP (500)
                [id],[hostname],[name],[version],[publisher],
                [install_date],[install_location],[size_mb],[source],[collected_at]
            FROM [dbo].[info_pc_software]
            WHERE [hostname] = @hostname
            ORDER BY [name] ASC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ✅ FIX: also delete software records when deleting a PC
export const deleteInventory = async (req, res) => {
    try {
        const db = await getPool();
        const request = db.request();
        request.input('hostname', sql.NVarChar, req.params.hostname);
        await request.query(`DELETE FROM dbo.info_pc_software WHERE hostname=@hostname`);
        await request.query(`DELETE FROM dbo.info_pc_active_users WHERE hostname=@hostname`);
        await request.query(`DELETE FROM dbo.info_pc_inventory WHERE hostname=@hostname`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ✅ UPDATED: support `field` query param to scope search to a single column
// Supported field values: hostname, ip_address, active_usernames, fix_asset,
// serial_number, model, manufacturer. Falls back to searching all fields ("all").
export const searchInventory = async (req, res) => {
    try {
        const q = req.query.q || '';
        const field = (req.query.field || 'all').trim();
        const db = await getPool();
        const request = db.request();
        request.input('query', sql.NVarChar, '%' + q + '%');

        // ✅ Map of allowed single-field searches → SQL WHERE clause fragment
        const fieldMap = {
            hostname: `i.[hostname] LIKE @query`,
            ip_address: `i.[ip_address] LIKE @query`,
            fix_asset: `i.[fix_asset] LIKE @query`,
            serial_number: `i.[serial_number] LIKE @query`,
            model: `i.[model] LIKE @query`,
            manufacturer: `i.[manufacturer] LIKE @query`,
            // active_usernames isn't a column on info_pc_inventory — it lives in
            // info_pc_active_users, so it needs the EXISTS-based clause below.
            active_usernames: `i.[hostname] IN (SELECT DISTINCT [hostname] FROM [dbo].[info_pc_active_users] WHERE [username] LIKE @query)`,
        };

        const whereClause = field !== 'all' && fieldMap[field]
            ? fieldMap[field]
            : `
                i.[hostname] LIKE @query 
                 OR i.[domain] LIKE @query
                 OR i.[ip_address] LIKE @query 
                 OR i.[mac_address] LIKE @query
                 OR i.[serial_number] LIKE @query
                 OR i.[cpu_name] LIKE @query
                 OR i.[fix_asset] LIKE @query
                 OR i.[gpu] LIKE @query
                 OR i.[bios_version] LIKE @query
                 OR i.[os_name] LIKE @query
                 OR i.[os_release] LIKE @query
                 OR i.[os_build] LIKE @query
                 OR i.[os_full_version] LIKE @query
                 OR i.[os_arch] LIKE @query
                 OR i.[computer_type] LIKE @query
                 OR i.[manufacturer] LIKE @query
                 OR i.[model] LIKE @query
                 OR i.[crowdstrike_ver] LIKE @query
                 OR i.[tanium_ver] LIKE @query
                 OR i.[uems_ver] LIKE @query
                 OR CAST(i.[cpu_cores] AS VARCHAR) LIKE @query
                 OR CAST(i.[cpu_threads] AS VARCHAR) LIKE @query
                 OR CAST(i.[ram_gb] AS VARCHAR) LIKE @query
                 OR i.[hostname] IN (SELECT DISTINCT [hostname] FROM [dbo].[info_pc_software] WHERE [name] LIKE @query OR [version] LIKE @query OR [publisher] LIKE @query)
                 OR i.[hostname] IN (SELECT DISTINCT [hostname] FROM [dbo].[info_pc_active_users] WHERE [username] LIKE @query)
            `;

        const result = await request.query(`
            WITH MatchedPC AS (
                SELECT DISTINCT i.[id],i.[hostname],i.[domain],i.[ip_address],i.[mac_address],i.[serial_number],
                    i.[cpu_name],i.[cpu_cores],i.[cpu_threads],i.[ram_gb],i.[gpu],i.[bios_version],i.[pc_status],
                    i.[fix_asset],i.[bitlocker],i.[bitlocker_key_c],i.[crowdstrike_ver],i.[tanium_ver],i.[uems_ver],
                    i.[computer_type],i.[manufacturer],i.[model],
                    i.[os_name],i.[os_release],i.[os_build],i.[os_full_version],i.[os_arch],
                    i.[collected_at],i.[updated_at]
                FROM [dbo].[info_pc_inventory] i
                WHERE ${whereClause}
            )
            SELECT TOP (100)
                m.[id],m.[hostname],m.[domain],m.[ip_address],m.[mac_address],m.[serial_number],
                m.[cpu_name],m.[cpu_cores],m.[cpu_threads],m.[ram_gb],m.[gpu],m.[bios_version],m.[pc_status], 
                m.[fix_asset],m.[bitlocker],m.[bitlocker_key_c],m.[crowdstrike_ver],m.[tanium_ver],m.[uems_ver],
                m.[computer_type],m.[manufacturer],m.[model],
                m.[os_name],m.[os_release],m.[os_build],m.[os_full_version],m.[os_arch],
                m.[collected_at],m.[updated_at],
                (SELECT TOP 1 au2.[username]
                 FROM [dbo].[info_pc_active_users] au2
                 WHERE au2.[hostname] = m.[hostname]
                 ORDER BY TRY_CONVERT(datetime, au2.[logon_time], 103) DESC) AS active_usernames,
                (SELECT TOP 1 au2.[logon_time]
                 FROM [dbo].[info_pc_active_users] au2
                 WHERE au2.[hostname] = m.[hostname]
                 ORDER BY TRY_CONVERT(datetime, au2.[logon_time], 103) DESC) AS logon_time
            FROM MatchedPC m
            ORDER BY m.[updated_at] DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ✅ PERFORMANCE: move heavy filtering to SQL instead of pulling all rows to JS
export const getSummary = async (req, res) => {
    try {
        const db = await getPool();

        const baseResult = await db.request().query(`
    SELECT i.hostname, i.bitlocker, i.crowdstrike_ver, i.tanium_ver, i.uems_ver,
           i.os_release, i.os_build, i.computer_type, i.manufacturer, i.fix_asset,
           i.updated_at, i.bitlocker_key_c, i.battery_health, i.disk_info,
           i.factory_layout_id, i.uptime, i.last_patch_kb, i.pc_status,
           fl.name AS location_name
    FROM dbo.info_pc_inventory i
    LEFT JOIN dbo.factory_layouts fl ON i.factory_layout_id = fl.id
`);
        const data = baseResult.recordset;

        // ✅ เครื่องที่ยัง active อยู่ ใช้กรอง stat "ปัญหา" ทั้งหมด (ไม่รวม inactive)
        const activeOnly = data.filter(r => r.pc_status !== 'Inactive');

        const [inactivePCRes, lowDiskRes, lowBatteryRes] = await Promise.all([
            db.request().query(`
                SELECT hostname FROM dbo.info_pc_inventory
                WHERE updated_at < DATEADD(MONTH, -1, GETDATE())
                  AND (pc_status IS NULL OR pc_status != 'Inactive')
            `),
            db.request().query(`
                SELECT hostname FROM dbo.info_pc_inventory
                WHERE disk_info LIKE '%C:%'
                  AND (pc_status IS NULL OR pc_status != 'Inactive')
                  AND TRY_CAST(
                        SUBSTRING(
                            disk_info,
                            CHARINDEX('Free:', disk_info) + 5,
                            CHARINDEX('GB', disk_info, CHARINDEX('Free:', disk_info)) - CHARINDEX('Free:', disk_info) - 5
                        ) AS FLOAT
                      ) < 20
            `),
            db.request().query(`
                SELECT hostname FROM dbo.info_pc_inventory
                WHERE battery_health LIKE '%(%)%'
                  AND (pc_status IS NULL OR pc_status != 'Inactive')
                  AND TRY_CAST(
                        SUBSTRING(
                            battery_health,
                            CHARINDEX('(', battery_health) + 1,
                            CHARINDEX('%', battery_health, CHARINDEX('(', battery_health)) - CHARINDEX('(', battery_health) - 1
                        ) AS FLOAT
                      ) < 70
            `),
        ]);

        const notebookTypes = ['notebook', 'laptop', 'portable', 'sub notebook', 'convertible', 'detachable'];
        const isNotebook = (r) => notebookTypes.some(t => (r.computer_type || '').toLowerCase().includes(t));

        // ✅ เปลี่ยนทุกตัวจาก data → activeOnly
        const noEdr = activeOnly.filter(r => !r.crowdstrike_ver || r.crowdstrike_ver === 'Not Installed').map(r => r.hostname);
        const noTanium = activeOnly.filter(r => !r.tanium_ver || r.tanium_ver === 'Not Installed').map(r => r.hostname);
        const noUems = activeOnly.filter(r => !r.uems_ver || r.uems_ver === 'Not Installed').map(r => r.hostname);
        const blDisabled = activeOnly.filter(r => isNotebook(r) && (r.bitlocker === 'Disabled' || r.bitlocker === 'Unknown')).map(r => r.hostname);
        const noAsset = activeOnly.filter(r => !r.fix_asset || r.fix_asset.trim() === '').map(r => r.hostname);
        const noLocation = activeOnly.filter(r => r.factory_layout_id === null || r.factory_layout_id === undefined || r.factory_layout_id === '').map(r => r.hostname);
        const noBlKeyNotebook = activeOnly.filter(r => isNotebook(r) && (!r.bitlocker_key_c || r.bitlocker_key_c.trim() === '')).map(r => r.hostname);

        // ✅ เพิ่ม stat ใหม่
        const inactive = data.filter(r => r.pc_status === 'Inactive').map(r => r.hostname);

        const inactivePC = inactivePCRes.recordset.map(r => r.hostname);
        const lowBatteryHealth = lowBatteryRes.recordset.map(r => r.hostname);
        const lowDiskCSpace = lowDiskRes.recordset.map(r => r.hostname);

        const currentYear = new Date().getFullYear();
        const oldFixAssets = activeOnly.filter(r => {
            if (!r.fix_asset || r.fix_asset.trim() === '') return false;
            const yearMatch = r.fix_asset.match(/CO(\d{2})/);
            if (!yearMatch) return false;
            const assetYear = parseInt(yearMatch[1]);
            const year = assetYear > 50 ? 1900 + assetYear : 2000 + assetYear;
            const age = currentYear - year;
            return isNotebook(r) ? age > 3 : age > 5;
        }).map(r => r.hostname);

        const longUptime = activeOnly
            .filter(d => {
                if (!d.uptime) return false;
                const match = d.uptime.match(/^(\d+)d/);
                return match ? parseInt(match[1], 10) > 5 : false;
            })
            .map(d => d.hostname);

        const osVersionMap = {};
        const osBuildMap = {};
        const computerTypeMap = {};
        const crowdstrikeVerMap = {};
        const taniumVerMap = {};
        const lastPatchKBMap = {};
        const locationMap = {};

        // ✅ distribution map ก็ใช้ activeOnly เหมือนกัน จะได้ไม่เอาเครื่อง inactive มาปน
        activeOnly.forEach(r => {
            const v = r.os_release || 'Unknown';
            if (!osVersionMap[v]) osVersionMap[v] = [];
            osVersionMap[v].push(r.hostname);

            const b = r.os_build || 'Unknown';
            if (!osBuildMap[b]) osBuildMap[b] = [];
            osBuildMap[b].push(r.hostname);

            const t = r.computer_type || 'Unknown';
            if (!computerTypeMap[t]) computerTypeMap[t] = [];
            computerTypeMap[t].push(r.hostname);

            const cs = r.crowdstrike_ver || 'Not Installed';
            if (!crowdstrikeVerMap[cs]) crowdstrikeVerMap[cs] = [];
            crowdstrikeVerMap[cs].push(r.hostname);

            const ta = r.tanium_ver || 'Not Installed';
            if (!taniumVerMap[ta]) taniumVerMap[ta] = [];
            taniumVerMap[ta].push(r.hostname);

            const kb = r.last_patch_kb || 'Unknown';
            if (!lastPatchKBMap[kb]) lastPatchKBMap[kb] = [];
            lastPatchKBMap[kb].push(r.hostname);

            if (r.factory_layout_id !== null && r.factory_layout_id !== undefined && r.factory_layout_id !== '') {
                const loc = r.location_name || `Layout #${r.factory_layout_id}`;
                if (!locationMap[loc]) locationMap[loc] = [];
                locationMap[loc].push(r.hostname);
            }
        });

        res.json({
            success: true,
            total: data.length,   // ✅ ยังนับรวมทุกเครื่อง (รวม inactive)
            inactive,              // ✅ เพิ่มเข้ามา
            noEdr, noTanium, noUems, blDisabled, noAsset,
            noLocation, noBlKeyNotebook, inactivePC, lowBatteryHealth, lowDiskCSpace, oldFixAssets, longUptime,
            osVersionMap, osBuildMap, computerTypeMap, crowdstrikeVerMap, taniumVerMap, lastPatchKBMap,
            locationMap,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMultiLoginUsers = async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request().query(`
            SELECT 
                au.[username],
                COUNT(au.[username]) AS machine_count,
                STRING_AGG(CAST(au.[hostname] AS NVARCHAR(MAX)), ', ') WITHIN GROUP (ORDER BY au.[hostname]) AS hostnames,
                STRING_AGG(
                    CAST(au.[hostname] AS NVARCHAR(MAX)) + ' (' + ISNULL(au.[state], '-') + ', ' + 
                    ISNULL(CONVERT(VARCHAR, au.[logon_time], 120), '-') + ')',
                    ' | '
                ) WITHIN GROUP (ORDER BY au.[hostname]) AS hostname_details,
                MAX(au.[logon_time]) AS latest_logon
            FROM [dbo].[info_pc_active_users] au
            WHERE au.[username] IS NOT NULL 
              AND au.[username] != ''
              AND au.[username] NOT LIKE '%ANONYMOUS%'
            GROUP BY au.[username]
            HAVING COUNT(au.[username]) > 1
            ORDER BY machine_count DESC
        `);
        const users = result.recordset.map(r => ({
            ...r,
            hostnameList: r.hostnames ? r.hostnames.split(', ') : [],
            hostnameDetailList: r.hostname_details
                ? r.hostname_details.split(' | ').map(d => {
                    const match = d.match(/^(.+?)\s\((.+?),\s(.+?)\)$/);
                    return match
                        ? { hostname: match[1], state: match[2], logon_time: match[3] }
                        : { hostname: d, state: '-', logon_time: '-' };
                })
                : [],
        }));
        const allHostnames = [...new Set(users.flatMap(u => u.hostnameList))];
        res.json({ success: true, data: users, allHostnames });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getInventoryByFixAsset = async (req, res) => {
    try {
        const code = (req.params.code || '').trim();
        if (!code) {
            return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสครุภัณฑ์' });
        }
 
        const db = await getPool();
        const request = db.request();
        request.input('fixAsset', sql.NVarChar, code);
        const result = await request.query(`
            SELECT TOP (1)
                [hostname], [serial_number], [fix_asset], [model], [manufacturer], [computer_type]
            FROM [dbo].[info_pc_inventory]
            WHERE [fix_asset] = @fixAsset
        `);
 
        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'ไม่พบรหัสครุภัณฑ์นี้ในระบบ PC Inventory' });
        }
 
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getHistory = async (req, res) => {
    try {
        const db = await getPool();
        const request = db.request();
        request.input('hostname', sql.NVarChar, req.params.hostname);
        const result = await request.query(`
            SELECT TOP (200)
                [id],[hostname],[changed_at],[change_type],[field_name],[old_value],[new_value]
            FROM [dbo].[info_pc_inventory_history]
            WHERE [hostname] = @hostname
            ORDER BY [changed_at] DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};