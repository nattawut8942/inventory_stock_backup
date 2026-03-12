import sql from 'mssql';

// DCI Database Configuration (External SQL Server for Ink & Toner Stock)
const dciConfig = {
    server: process.env.DCI_DB_SERVER || '192.168.226.145',
    database: process.env.DCI_DB_DATABASE || 'dbDCI',
    user: process.env.DCI_DB_USER || 'sa',
    password: process.env.DCI_DB_PASSWORD || 'decjapan',
    port: parseInt(process.env.DCI_DB_PORT) || 1433,
    connectionTimeout: 60000,
    requestTimeout: 60000,
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

let dciPool = null;

// Connect to DCI Database
export const connectDciDB = async () => {
    try {
        if (dciPool) {
            return dciPool;
        }
        dciPool = await new sql.ConnectionPool(dciConfig).connect();
        console.log('✅ Connected to DCI SQL Server (Ink & Toner)');
        return dciPool;
    } catch (err) {
        console.error('❌ DCI Database connection failed:', err.message);
        // Don't throw - allow main server to continue even if DCI is unavailable
        console.warn('⚠️ Ink & Toner Stock module will be unavailable');
        return null;
    }
};

// Get DCI connection pool
export const getDciPool = () => {
    if (!dciPool) {
        throw new Error('DCI Database not connected. Call connectDciDB() first.');
    }
    return dciPool;
};

// Close DCI connection
export const closeDciDB = async () => {
    if (dciPool) {
        await dciPool.close();
        dciPool = null;
        console.log('DCI Database connection closed');
    }
};

export default { connectDciDB, getDciPool, closeDciDB };
