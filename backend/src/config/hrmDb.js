// src/config/hrmDb.js
import sql from 'mssql';

const config = {
    server: process.env.HRM_DB_SERVER || '192.168.226.86',
    database: process.env.HRM_DB_DATABASE || 'dbHRM',
    port: parseInt(process.env.HRM_DB_PORT) || 1433,
    connectionTimeout: 60000,
    requestTimeout: 90000,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        useUTC: false
    },
    pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

if (process.env.HRM_DB_TRUSTED_CONNECTION === 'true') {
    config.options.trustedConnection = true;
} else {
    config.user = process.env.HRM_DB_USER || 'sa';
    config.password = process.env.HRM_DB_PASSWORD || 'decjapan';
}

let hrmPool = null;

export const connectHrmDB = async () => {
    if (hrmPool) return hrmPool;
    hrmPool = await new sql.ConnectionPool(config).connect();
    hrmPool.on('error', err => console.error('❌ HRM Pool Error:', err.message));
    return hrmPool;
};

export const getHrmPool = () => {
    if (!hrmPool) {
        throw new Error('HRM Database not connected. Call connectHrmDB() first.');
    }
    return hrmPool;
};

export const closeHrmDB = async () => {
    if (hrmPool) {
        await hrmPool.close();
        hrmPool = null;
    }
};

export { sql };