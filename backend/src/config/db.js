import sql from 'mssql';

// Database Configuration from Environment Variables
const config = {
    server: process.env.DB_SERVER || '192.168.226.109',
    database: process.env.DB_DATABASE || 'dbInfrastructure',
    port: parseInt(process.env.DB_PORT) || 1433,
    connectionTimeout: 60000, // Increase timeout to 60s
    requestTimeout: 90000,
    options: {
        encrypt: false, // Set to true for Azure
        trustServerCertificate: true, // Allow self-signed certs
        enableArithAbort: true,
        useUTC: false // Treat DB dates as local time
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Add authentication based on config
if (process.env.DB_TRUSTED_CONNECTION === 'true') {
    // Windows Authentication
    config.options.trustedConnection = true;
} else {
    // SQL Authentication
    config.user = process.env.DB_USER || 'sa';
    config.password = process.env.DB_PASSWORD || 'B7m?M89h7Y';
}

let pool = null;

// Connect to Database
export const connectDB = async () => {
    try {
        if (pool) {
            return pool;
        }
        pool = await sql.connect(config);
        console.log('✅ Connected to MS SQL Server');
        return pool;
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        throw err;
    }
};

// Get connection pool
export const getPool = () => {
    if (!pool) {
        throw new Error('Database not connected. Call connectDB() first.');
    }
    return pool;
};

// Close connection
export const closeDB = async () => {
    if (pool) {
        await pool.close();
        pool = null;
        console.log('Database connection closed');
    }
};

export { sql };
export default { sql, connectDB, getPool, closeDB };
