// controllers/itRequestController.js
import { sql, getItRequestPool as getPool } from '../config/itRequestDb.js';

const COMMON_ACM_UCM_SELECT = `
    R.Request_id,
    R.Form_id,
    R.Current_Status,
    COALESCE(ACM.[REQ_BY],       UCM.[REQ_BY],       SDR.[Emp_Code])  AS Info_Req_By,
                    COALESCE(ACM.[EMP_NAME],  UCM.[EMP_NAME])          AS Emp_Name,
                    COALESCE(ACM.[EMP_EMAIL], UCM.[EMP_EMAIL], R.Email)  AS Emp_Email,
    R.Request_by,
    R.Email,
    R.Section_code,
    COALESCE(ACM.[EXTENSION],    UCM.[EXTENSION],    SDR.[Ext])       AS Extension_No,
    COALESCE(
        CAST(ACM.[REASON]      AS NVARCHAR(MAX)),
        CAST(UCM.[REASON]      AS NVARCHAR(MAX)),
        CAST(SDR.[Descrpition] AS NVARCHAR(MAX))
    )                                                                   AS Detail_Info,
    R.Request_date,
    COALESCE(ACM.[STEP], UCM.[STEP])                                   AS STEP,
    COALESCE(
        TRY_CAST(CAST(ACM.[RECEIVE_DATE] AS NVARCHAR(50)) AS DATETIME),
        TRY_CAST(CAST(UCM.[RECEIVE_DATE] AS NVARCHAR(50)) AS DATETIME)
    )                                                                   AS RECEIVE_DATE,

    -- Risk Assessment (shared)
    COALESCE(CAST(ACM.[RISK_ASSM]  AS NVARCHAR(MAX)), CAST(UCM.[RISK_ASSM]  AS NVARCHAR(MAX))) AS RISK_ASSM,
    COALESCE(CAST(ACM.[EFFECT]     AS NVARCHAR(MAX)), CAST(UCM.[EFFECT]     AS NVARCHAR(MAX))) AS EFFECT,
    COALESCE(CAST(ACM.[NOT_EFFECT] AS NVARCHAR(MAX)), CAST(UCM.[NOT_EFFECT] AS NVARCHAR(MAX))) AS NOT_EFFECT,
    COALESCE(CAST(ACM.[CORRECTIVE] AS NVARCHAR(MAX)), CAST(UCM.[CORRECTIVE] AS NVARCHAR(MAX))) AS CORRECTIVE,

    -- ACM: Network
    ACM.[NET_SETTING], ACM.[NET_CHANGE], ACM.[NET_TRANSFER], ACM.[NET_CANCEL],
    ACM.[IP], ACM.[SWITCH], ACM.[HUB], ACM.[VPN],
    ACM.[NET_OTHER], CAST(ACM.[NET_OTHER_TEXT] AS NVARCHAR(MAX)) AS NET_OTHER_TEXT,

    -- ACM: Software
    ACM.[SOFT_INSTALL], ACM.[SOFT_CHANGE], ACM.[SOFT_TRANSFER], ACM.[SOFT_CANCEL],
    ACM.[WINDOWS] AS ACM_WINDOWS, ACM.[QAD] AS ACM_QAD,
    ACM.[PATCH], ACM.[OFFICE],
    ACM.[SOFT_OTHER], CAST(ACM.[SOFT_OTHER_TEXT] AS NVARCHAR(MAX)) AS SOFT_OTHER_TEXT,

    -- ACM: Computer
    ACM.[COM_INSTALL], ACM.[COM_CHANGE], ACM.[COM_TRANSFER], ACM.[COM_CANCEL],
    ACM.[DESKTOP], ACM.[NOTEBOOK], ACM.[RAM], ACM.[HARDDISK], ACM.[MONITOR],
    ACM.[COM_OTHER], CAST(ACM.[COM_OTHER_TEXT] AS NVARCHAR(MAX)) AS COM_OTHER_TEXT,

    -- UCM: System
    UCM.[QAD] AS UCM_QAD, UCM.[WINDOWS] AS UCM_WINDOWS, UCM.[EMAIL] AS UCM_EMAIL_SYS,

    -- UCM: Change type
    UCM.[ADDNEW], UCM.[CHANGE] AS UCM_CHANGE, UCM.[REMOVE],
    UCM.[NEWEMP], UCM.[TRANFER], UCM.[RESIGN],

    -- UCM: Account
    UCM.[USERNAME], UCM.[GROUPS], UCM.[PERMISSION], UCM.[PASSWORD],

    -- Flow: User Side
    MAX(CASE WHEN F.Flow_order = 0  THEN F.Flow_By      END) AS Flow0_Requestor,
    MAX(CASE WHEN F.Flow_order = 0  THEN F.[Date]        END) AS Flow0_Date,
    MAX(CASE WHEN F.Flow_order = 2  THEN F.Flow_By      END) AS Flow2_Manager,
    MAX(CASE WHEN F.Flow_order = 2  THEN F.Flow_Status   END) AS Flow2_Status,
    MAX(CASE WHEN F.Flow_order = 2  THEN F.[Date]        END) AS Flow2_Date,
    -- Flow_order 3 = GM Requester Approve (เฉพาะ FM-IT-002 / ACM)
    MAX(CASE WHEN F.Flow_order = 3  THEN F.Flow_By      END) AS Flow3_GMApprove,
    MAX(CASE WHEN F.Flow_order = 3  THEN F.Flow_Status   END) AS Flow3_Status,
    MAX(CASE WHEN F.Flow_order = 3  THEN F.[Date]        END) AS Flow3_Date,
    MAX(CASE WHEN F.Flow_order = 12 THEN F.Flow_By      END) AS Flow12_UserClose,
    MAX(CASE WHEN F.Flow_order = 12 THEN F.Flow_Status   END) AS Flow12_Status,
    MAX(CASE WHEN F.Flow_order = 12 THEN F.[Date]        END) AS Flow12_Date,
    -- Flow: IT Side
    MAX(CASE WHEN F.Flow_order = 4  THEN F.Flow_By      END) AS Flow4_ITAssign,
    MAX(CASE WHEN F.Flow_order = 4  THEN F.Flow_Status   END) AS Flow4_Status,
    MAX(CASE WHEN F.Flow_order = 4  THEN F.[Date]        END) AS Flow4_Date,
    MAX(CASE WHEN F.Flow_order = 5  THEN F.Flow_By      END) AS Flow5_ITIncharge,
    MAX(CASE WHEN F.Flow_order = 5  THEN F.Flow_Status   END) AS Flow5_Status,
    MAX(CASE WHEN F.Flow_order = 5  THEN F.[Date]        END) AS Flow5_Date,
    MAX(CASE WHEN F.Flow_order = 6  THEN F.Flow_By      END) AS Flow6_ITSupervisor,
    MAX(CASE WHEN F.Flow_order = 6  THEN F.Flow_Status   END) AS Flow6_Status,
    MAX(CASE WHEN F.Flow_order = 6  THEN F.[Date]        END) AS Flow6_Date,
    MAX(CASE WHEN F.Flow_order = 7  THEN F.Flow_By      END) AS Flow7_ITManager,
    MAX(CASE WHEN F.Flow_order = 7  THEN F.Flow_Status   END) AS Flow7_Status,
    MAX(CASE WHEN F.Flow_order = 7  THEN F.[Date]        END) AS Flow7_Date,
    -- Flow_order 8 = IT In charge ปิดงาน (เฉพาะ FM-IT-004 / UCM — ใน ACM ไม่มี order 8)
    MAX(CASE WHEN F.Flow_order = 8  THEN F.Flow_By      END) AS Flow8_ITClose,
    MAX(CASE WHEN F.Flow_order = 8  THEN F.Flow_Status   END) AS Flow8_Status,
    MAX(CASE WHEN F.Flow_order = 8  THEN F.[Date]        END) AS Flow8_Date,
    MAX(CASE WHEN F.Flow_order = 9  THEN F.Flow_By      END) AS Flow9_ITClose,
    MAX(CASE WHEN F.Flow_order = 9  THEN F.Flow_Status   END) AS Flow9_Status,
    MAX(CASE WHEN F.Flow_order = 9  THEN F.[Date]        END) AS Flow9_Date,
    MAX(CASE WHEN F.Flow_order = 10 THEN F.Flow_By      END) AS Flow10_ITSupApprove,
    MAX(CASE WHEN F.Flow_order = 10 THEN F.Flow_Status   END) AS Flow10_Status,
    MAX(CASE WHEN F.Flow_order = 10 THEN F.[Date]        END) AS Flow10_Date,
    MAX(CASE WHEN F.Flow_order = 11 THEN F.Flow_By      END) AS Flow11_ITMgrApprove,
    MAX(CASE WHEN F.Flow_order = 11 THEN F.Flow_Status   END) AS Flow11_Status,
    MAX(CASE WHEN F.Flow_order = 11 THEN F.[Date]        END) AS Flow11_Date,
    -- Legacy aliases (ใช้ต่อใน frontend เดิม)
    MAX(CASE WHEN F.Flow_order = 6  THEN F.Flow_By      END) AS Checked,
    MAX(CASE WHEN F.Flow_order = 6  THEN F.[Date]        END) AS Date_Checked,
    MAX(CASE WHEN F.Flow_order = 7  THEN F.Flow_By       END) AS Approved,
    MAX(CASE WHEN F.Flow_order = 7  THEN F.[Date]        END) AS Date_Approved,
    -- InCharge = Flow_order 5 (IT in-charge รับเคส) ตาม mapping ที่ยืนยันแล้ว
    MAX(CASE WHEN F.Flow_order = 5  THEN F.Flow_By_code  END) AS CodeInCharge,
    MAX(CASE WHEN F.Flow_order = 5  THEN F.Flow_By       END) AS InCharge,
    MAX(CASE WHEN F.Flow_order = 5  THEN F.[Date]        END) AS Date_InCharge
`;

const COMMON_FROM = `
    FROM Sys_RequestInfo R
    LEFT JOIN [dbORF].[dbo].[IT_UCM] UCM ON R.Request_id = UCM.[REQ_ID]
    LEFT JOIN [dbORF].[dbo].[IT_ACM] ACM ON R.Request_id = ACM.[REQ_ID]
    LEFT JOIN [dbORF].[dbo].[IT_SDR] SDR ON R.Request_id = SDR.[Req_Id]
    LEFT JOIN [dbORF].[dbo].[Sys_FormFlow] F ON R.Request_id = F.Request_id
`;

const COMMON_GROUP_BY = `
    GROUP BY
        R.Request_id, R.Form_id, R.Current_Status,
        R.Request_by, R.Email, R.Section_code, R.Request_date,
        COALESCE(ACM.[REQ_BY],        UCM.[REQ_BY],        SDR.[Emp_Code]),
                    COALESCE(ACM.[EMP_NAME],      UCM.[EMP_NAME]),
                    COALESCE(ACM.[EMP_EMAIL],     UCM.[EMP_EMAIL],     R.Email),
        COALESCE(ACM.[EXTENSION],     UCM.[EXTENSION],     SDR.[Ext]),
        COALESCE(CAST(ACM.[REASON] AS NVARCHAR(MAX)), CAST(UCM.[REASON] AS NVARCHAR(MAX)), CAST(SDR.[Descrpition] AS NVARCHAR(MAX))),
        COALESCE(ACM.[STEP], UCM.[STEP]),
        TRY_CAST(CAST(ACM.[RECEIVE_DATE] AS NVARCHAR(50)) AS DATETIME),
        TRY_CAST(CAST(UCM.[RECEIVE_DATE] AS NVARCHAR(50)) AS DATETIME),
        COALESCE(CAST(ACM.[RISK_ASSM]  AS NVARCHAR(MAX)), CAST(UCM.[RISK_ASSM]  AS NVARCHAR(MAX))),
        COALESCE(CAST(ACM.[EFFECT]     AS NVARCHAR(MAX)), CAST(UCM.[EFFECT]     AS NVARCHAR(MAX))),
        COALESCE(CAST(ACM.[NOT_EFFECT] AS NVARCHAR(MAX)), CAST(UCM.[NOT_EFFECT] AS NVARCHAR(MAX))),
        COALESCE(CAST(ACM.[CORRECTIVE] AS NVARCHAR(MAX)), CAST(UCM.[CORRECTIVE] AS NVARCHAR(MAX))),
        ACM.[NET_SETTING], ACM.[NET_CHANGE], ACM.[NET_TRANSFER], ACM.[NET_CANCEL],
        ACM.[IP], ACM.[SWITCH], ACM.[HUB], ACM.[VPN],
        ACM.[NET_OTHER], CAST(ACM.[NET_OTHER_TEXT] AS NVARCHAR(MAX)),
        ACM.[SOFT_INSTALL], ACM.[SOFT_CHANGE], ACM.[SOFT_TRANSFER], ACM.[SOFT_CANCEL],
        ACM.[WINDOWS], ACM.[QAD], ACM.[PATCH], ACM.[OFFICE],
        ACM.[SOFT_OTHER], CAST(ACM.[SOFT_OTHER_TEXT] AS NVARCHAR(MAX)),
        ACM.[COM_INSTALL], ACM.[COM_CHANGE], ACM.[COM_TRANSFER], ACM.[COM_CANCEL],
        ACM.[DESKTOP], ACM.[NOTEBOOK], ACM.[RAM], ACM.[HARDDISK], ACM.[MONITOR],
        ACM.[COM_OTHER], CAST(ACM.[COM_OTHER_TEXT] AS NVARCHAR(MAX)),
        UCM.[QAD], UCM.[WINDOWS], UCM.[EMAIL],
        UCM.[ADDNEW], UCM.[CHANGE], UCM.[REMOVE], UCM.[NEWEMP], UCM.[TRANFER], UCM.[RESIGN],
        UCM.[USERNAME], UCM.[GROUPS], UCM.[PERMISSION], UCM.[PASSWORD]
`;

/**
 * GET all IT Requests (FM-IT-002, FM-IT-004) — deduplicated
 */
export const getITRequests = async (req, res) => {
    try {
        const pool = getPool();
const result = await pool.request().query(`
    SELECT ${COMMON_ACM_UCM_SELECT}
    ${COMMON_FROM}
    WHERE
        R.Form_id IN ('FM-IT-002', 'FM-IT-004')
        AND R.Current_Status NOT IN ('Rejected', 'Cancel')
    ${COMMON_GROUP_BY}
    ORDER BY R.Request_date DESC
`);

        // map ACM_WINDOWS → WINDOWS, UCM_QAD → QAD ให้ frontend ใช้ key เดิม
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error('getITRequests error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch IT requests' });
    }
};

/**
 * GET single IT Request by Request_id
 */
export const getITRequestById = async (req, res) => {
    try {
        const { requestId } = req.params;
        const pool = getPool();
        const result = await pool.request()
            .input('requestId', sql.NVarChar, requestId)
            .query(`
                SELECT ${COMMON_ACM_UCM_SELECT}
                ${COMMON_FROM}
                WHERE R.Request_id = @requestId
                ${COMMON_GROUP_BY}
            `);

        if (result.recordset.length === 0)
            return res.status(404).json({ success: false, message: 'Request not found' });

        res.json({ success: true, data: result.recordset[0] });
    } catch (error) {
        console.error('getITRequestById error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch IT request' });
    }
};

/**
 * GET IT Request stats — count ตรงจาก DB ปีปัจจุบัน ไม่ dedup
 */
export const getITRequestStats = async (req, res) => {
    try {
        const pool = getPool();
        const year = new Date().getFullYear();
        const result = await pool.request()
            .input('year', sql.Int, year)
            .query(`
                SELECT
                    Current_Status,
                    COUNT(*) AS cnt
                FROM Sys_RequestInfo
                WHERE Form_id IN ('FM-IT-002', 'FM-IT-004')
                    AND Current_Status NOT IN ('Rejected', 'Cancel')
                    AND YEAR(Request_date) = @year
                GROUP BY Current_Status
            `);

        // แปลงเป็น object { Approved: 163, Completed: 5, ... }
        const stats = {};
        result.recordset.forEach((r) => { stats[r.Current_Status] = r.cnt; });
        res.json({ success: true, data: stats, year });
    } catch (error) {
        console.error('getITRequestStats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
};