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
                i.[fix_asset],i.[bitlocker],i.[bitlocker_key_c],i.[crowdstrike_ver],i.[tanium_ver],i.[uems_ver],
                i.[factory_layout_id],i.[location_x],i.[location_y],i.[location_updated_at],
                i.[battery_status],i.[battery_percent],i.[battery_health],i.[battery_wear],
                i.[battery_charging],i.[battery_cycle],i.[battery_name],i.[battery_voltage],
                i.[battery_type],i.[battery_manufacturer],
                ISNULL(COUNT(DISTINCT au.[username]), 0) AS active_users,
                ISNULL(STRING_AGG(au.[username], ', ') WITHIN GROUP (ORDER BY au.[logon_time] DESC), '') AS active_usernames,
                ISNULL(
                    (SELECT TOP 1 au2.[logon_time]
                     FROM [dbo].[info_pc_active_users] au2
                     WHERE au2.[hostname] = i.[hostname]
                     ORDER BY au2.[logon_time] DESC),
                    NULL
                ) AS logon_time
            FROM [dbo].[info_pc_inventory] i
            LEFT JOIN [dbo].[info_pc_active_users] au ON i.[hostname] = au.[hostname]
            GROUP BY
                i.[id],i.[hostname],i.[domain],i.[ip_address],i.[mac_address],
                i.[computer_type],i.[manufacturer],i.[model],i.[serial_number],
                i.[cpu_name],i.[cpu_cores],i.[cpu_threads],i.[ram_gb],i.[disk_info],
                i.[os_name],i.[os_release],i.[os_build],i.[os_full_version],i.[os_arch],
                i.[os_install_date],i.[last_boot],i.[uptime],i.[bios_version],
                i.[gpu],i.[resolution],i.[user_count],i.[collected_at],i.[updated_at],
                i.[fix_asset],i.[bitlocker],i.[bitlocker_key_c],i.[crowdstrike_ver],i.[tanium_ver],i.[uems_ver],
                i.[factory_layout_id],i.[location_x],i.[location_y],i.[location_updated_at],
                i.[battery_status],i.[battery_percent],i.[battery_health],i.[battery_wear],
                i.[battery_charging],i.[battery_cycle],i.[battery_name],i.[battery_voltage],
                i.[battery_type],i.[battery_manufacturer]
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
        // ✅ FIX: validate fix_asset format on backend too
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

export const searchInventory = async (req, res) => {
    try {
        const q = req.query.q || '';
        const db = await getPool();
        const request = db.request();
        request.input('query', sql.NVarChar, '%' + q + '%');
        const result = await request.query(`
            WITH MatchedPC AS (
                SELECT DISTINCT i.[id],i.[hostname],i.[domain],i.[ip_address],i.[mac_address],i.[serial_number],
                    i.[cpu_name],i.[cpu_cores],i.[cpu_threads],i.[ram_gb],i.[gpu],i.[bios_version],
                    i.[fix_asset],i.[bitlocker],i.[bitlocker_key_c],i.[crowdstrike_ver],i.[tanium_ver],i.[uems_ver],
                    i.[computer_type],i.[manufacturer],i.[model],
                    i.[os_name],i.[os_release],i.[os_build],i.[os_full_version],i.[os_arch],
                    i.[collected_at],i.[updated_at]
                FROM [dbo].[info_pc_inventory] i
                WHERE i.[hostname] LIKE @query 
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
            )
            SELECT TOP (100)
                m.[id],m.[hostname],m.[domain],m.[ip_address],m.[mac_address],m.[serial_number],
                m.[cpu_name],m.[cpu_cores],m.[cpu_threads],m.[ram_gb],m.[gpu],m.[bios_version],
                m.[fix_asset],m.[bitlocker],m.[bitlocker_key_c],m.[crowdstrike_ver],m.[tanium_ver],m.[uems_ver],
                m.[computer_type],m.[manufacturer],m.[model],
                m.[os_name],m.[os_release],m.[os_build],m.[os_full_version],m.[os_arch],
                m.[collected_at],m.[updated_at],
                ISNULL(STRING_AGG(au.[username], ', ') WITHIN GROUP (ORDER BY au.[logon_time] DESC), '') AS active_usernames,
                ISNULL(
                    (SELECT TOP 1 au2.[logon_time]
                     FROM [dbo].[info_pc_active_users] au2
                     WHERE au2.[hostname] = m.[hostname]
                     ORDER BY au2.[logon_time] DESC),
                    NULL
                ) AS logon_time
            FROM MatchedPC m
            LEFT JOIN [dbo].[info_pc_active_users] au ON m.[hostname] = au.[hostname]
            GROUP BY
                m.[id],m.[hostname],m.[domain],m.[ip_address],m.[mac_address],m.[serial_number],
                m.[cpu_name],m.[cpu_cores],m.[cpu_threads],m.[ram_gb],m.[gpu],m.[bios_version],
                m.[fix_asset],m.[bitlocker],m.[bitlocker_key_c],m.[crowdstrike_ver],m.[tanium_ver],m.[uems_ver],
                m.[computer_type],m.[manufacturer],m.[model],
                m.[os_name],m.[os_release],m.[os_build],m.[os_full_version],m.[os_arch],
                m.[collected_at],m.[updated_at]
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

        // Base data for maps (lightweight — only needed columns)
        const baseResult = await db.request().query(`
    SELECT hostname, bitlocker, crowdstrike_ver, tanium_ver, uems_ver,
           os_release, os_build, computer_type, manufacturer, fix_asset,
           updated_at, bitlocker_key_c, battery_health, disk_info,
           factory_layout_id
    FROM dbo.info_pc_inventory
`);;
        const data = baseResult.recordset;

        // ✅ PERFORMANCE: compute flag lists in SQL for expensive date/disk/battery checks
        const [inactivePCRes, lowDiskRes, lowBatteryRes, oldFixAssetsRes] = await Promise.all([
            // Inactive > 1 month
            db.request().query(`
                SELECT hostname FROM dbo.info_pc_inventory
                WHERE updated_at < DATEADD(MONTH, -1, GETDATE())
            `),
            // Disk C free < 20 GB
            db.request().query(`
                SELECT hostname FROM dbo.info_pc_inventory
                WHERE disk_info LIKE '%C:%'
                  AND TRY_CAST(
                        SUBSTRING(
                            disk_info,
                            CHARINDEX('Free:', disk_info) + 5,
                            CHARINDEX('GB', disk_info, CHARINDEX('Free:', disk_info)) - CHARINDEX('Free:', disk_info) - 5
                        ) AS FLOAT
                      ) < 20
            `),
            // Battery health < 70%
            db.request().query(`
                SELECT hostname FROM dbo.info_pc_inventory
                WHERE battery_health LIKE '%(%)%'
                  AND TRY_CAST(
                        SUBSTRING(
                            battery_health,
                            CHARINDEX('(', battery_health) + 1,
                            CHARINDEX('%', battery_health, CHARINDEX('(', battery_health)) - CHARINDEX('(', battery_health) - 1
                        ) AS FLOAT
                      ) < 70
            `),
            // Old fix assets (notebook > 3yr, desktop > 5yr) — kept in JS since logic is complex
            Promise.resolve(null),
        ]);

        const notebookTypes = ['notebook', 'laptop', 'portable', 'sub notebook', 'convertible', 'detachable'];
        const isNotebook = (r) => notebookTypes.some(t => (r.computer_type || '').toLowerCase().includes(t));

        const noEdr = data.filter(r => !r.crowdstrike_ver || r.crowdstrike_ver === 'Not Installed').map(r => r.hostname);
        const noTanium = data.filter(r => !r.tanium_ver || r.tanium_ver === 'Not Installed').map(r => r.hostname);
        const noUems = data.filter(r => !r.uems_ver || r.uems_ver === 'Not Installed').map(r => r.hostname);
        const blDisabled = data.filter(r => isNotebook(r) && (r.bitlocker === 'Disabled' || r.bitlocker === 'Unknown')).map(r => r.hostname);
        const noAsset = data.filter(r => !r.fix_asset || r.fix_asset.trim() === '').map(r => r.hostname);
        const noLocation = data.filter(r => r.factory_layout_id === null || r.factory_layout_id === undefined || r.factory_layout_id === '').map(r => r.hostname);
        const noBlKeyNotebook = data.filter(r => isNotebook(r) && (!r.bitlocker_key_c || r.bitlocker_key_c.trim() === '')).map(r => r.hostname);

        // Use SQL results for performance-sensitive checks
        const inactivePC = inactivePCRes.recordset.map(r => r.hostname);
        const lowBatteryHealth = lowBatteryRes.recordset.map(r => r.hostname);
        const lowDiskCSpace = lowDiskRes.recordset.map(r => r.hostname);

        // Old fix assets — JS logic retained (complex regex + conditional by type)
        const currentYear = new Date().getFullYear();
        const oldFixAssets = data.filter(r => {
            if (!r.fix_asset || r.fix_asset.trim() === '') return false;
            const yearMatch = r.fix_asset.match(/CO(\d{2})/);
            if (!yearMatch) return false;
            const assetYear = parseInt(yearMatch[1]);
            const year = assetYear > 50 ? 1900 + assetYear : 2000 + assetYear;
            const age = currentYear - year;
            return isNotebook(r) ? age > 3 : age > 5;
        }).map(r => r.hostname);

        // Distribution maps
        const osVersionMap = {};
        const osBuildMap = {};
        const computerTypeMap = {};
        const crowdstrikeVerMap = {};
        const taniumVerMap = {};

        data.forEach(r => {
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
        });

        res.json({
            success: true,
            total: data.length,
            noEdr, noTanium, noUems, blDisabled, noAsset,
            noLocation, noBlKeyNotebook, inactivePC, lowBatteryHealth, lowDiskCSpace, oldFixAssets,
            osVersionMap, osBuildMap, computerTypeMap, crowdstrikeVerMap, taniumVerMap,
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
                STRING_AGG(au.[hostname], ', ') WITHIN GROUP (ORDER BY au.[hostname]) AS hostnames,
                STRING_AGG(
                    au.[hostname] + ' (' + ISNULL(au.[state], '-') + ', ' + 
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