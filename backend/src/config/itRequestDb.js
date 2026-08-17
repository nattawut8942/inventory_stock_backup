// src/config/itRequestDb.js
import sql from 'mssql';

const itRequestConfig = {
    server:   process.env.IT_REQUEST_DB_SERVER   || '192.168.226.86',
    database: process.env.IT_REQUEST_DB_DATABASE || 'dbORF',
    user:     process.env.IT_REQUEST_DB_USER     || 'sa',
    password: process.env.IT_REQUEST_DB_PASSWORD || 'decjapan',
    port:     parseInt(process.env.IT_REQUEST_DB_PORT) || 1433,
    connectionTimeout: 60000,
    requestTimeout:    60000,
    options: {
        encrypt:                false,
        trustServerCertificate: true,
        enableArithAbort:       true,
        useUTC:                 false,
    },
    pool: {
        max:               5,
        min:               0,
        idleTimeoutMillis: 30000,
    },
};

let itRequestPool = null;

export const connectItRequestDB = async () => {
    try {
        if (itRequestPool) return itRequestPool;
        itRequestPool = await new sql.ConnectionPool(itRequestConfig).connect();
        console.log('✅ Connected to IT Request SQL Server');
        return itRequestPool;
    } catch (err) {
        console.error('❌ IT Request Database connection failed:', err.message);
        console.warn('⚠️ IT Request module will be unavailable');
        return null;
    }
};

export const getItRequestPool = () => {
    if (!itRequestPool) {
        throw new Error('IT Request Database not connected. Call connectItRequestDB() first.');
    }
    return itRequestPool;
};

export const closeItRequestDB = async () => {
    if (itRequestPool) {
        await itRequestPool.close();
        itRequestPool = null;
        console.log('IT Request Database connection closed');
    }
};

export { sql };

export default { connectItRequestDB, getItRequestPool, closeItRequestDB };