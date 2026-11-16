import { sql, getPool } from '../config/db.js';

// Fields compared for the change log. Any change to these is written to MA_History.
export const TRACKED_FIELDS = [
    'Category', 'SubType', 'ItemName', 'Brand', 'SerialNumber', 'ServiceType', 'ServiceNumber',
    'IpAddress', 'MacAddress', 'LicenseQty', 'PONumber', 'LocationName', 'Price', 'VendorID', 'StartDate', 'EndDate',
    'ContractEndDate', 'POCycle', 'RenewalStatus', 'PRNumber', 'NewPONumber', 'Status', 'Remark'
];

const pad = (n) => String(n).padStart(2, '0');

// Store values as text. Dates as local YYYY-MM-DD (DB dates are read as local, useUTC=false).
const fmtVal = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    return String(v);
};

// [{ field, old, new }] for every tracked field whose value differs.
export const diffRows = (before, after, fields = TRACKED_FIELDS) =>
    fields
        .filter((f) => fmtVal(before?.[f]) !== fmtVal(after?.[f]))
        .map((f) => ({ field: f, old: fmtVal(before?.[f]), new: fmtVal(after?.[f]) }));

// Who did it: the verified JWT user first, then the body value the old API used.
export const getActor = (req) => req.user?.username || req.body?.UpdatedBy || req.body?.CreatedBy || null;

// Run fn inside one SQL transaction so the data change and its history row succeed or fail together.
export const withTx = async (fn) => {
    const tx = new sql.Transaction(getPool());
    await tx.begin();
    try {
        const result = await fn(tx);
        await tx.commit();
        return result;
    } catch (err) {
        await tx.rollback().catch(() => {});
        throw err;
    }
};

export const loadItem = async (tx, itemId) => {
    const r = await new sql.Request(tx)
        .input('ItemID', sql.Int, itemId)
        .query('SELECT * FROM dbo.MA_Items WHERE ItemID = @ItemID AND IsDeleted = 0');
    return r.recordset[0] || null;
};

// One row in MA_History. changes = array from diffRows (stored as JSON).
export const writeHistory = async (tx, { itemId, eventType, changes = null, note = null, actor = null, client }) => {
    await new sql.Request(tx)
        .input('ItemID', sql.Int, itemId)
        .input('EventType', sql.NVarChar(30), eventType)
        .input('Changes', sql.NVarChar(sql.MAX), changes && changes.length ? JSON.stringify(changes) : null)
        .input('Note', sql.NVarChar(500), note ? String(note).slice(0, 500) : null)
        .input('ActorUser', sql.NVarChar(50), actor ? String(actor).slice(0, 50) : null)
        .input('ClientIP', sql.NVarChar(45), client?.ip || null)
        .input('ClientMAC', sql.NVarChar(17), client?.mac || null)
        .query(`INSERT INTO dbo.MA_History (ItemID, EventType, Changes, Note, ActorUser, ClientIP, ClientMAC)
                VALUES (@ItemID, @EventType, @Changes, @Note, @ActorUser, @ClientIP, @ClientMAC)`);
};
