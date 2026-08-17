import sql from 'mssql';

const config = {
    server: process.env.SOUND_DB_SERVER || process.env.DB_SERVER,
    database: process.env.SOUND_DB_NAME || process.env.DB_DATABASE,
    port: parseInt(process.env.SOUND_DB_PORT || process.env.DB_PORT) || 1433,
    connectionTimeout: 60000,
    requestTimeout: 90000,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        useUTC: false
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

if (process.env.SOUND_DB_TRUSTED_CONNECTION === 'true') {
    config.options.trustedConnection = true;
} else {
    config.user     = process.env.SOUND_DB_USER     || process.env.DB_USER;
    config.password = process.env.SOUND_DB_PASSWORD || process.env.DB_PASSWORD;
}

let pool = null;

export const connectSoundDB = async () => {
    try {
        if (pool) return pool;
        pool = await sql.connect(config);
        console.log('✅ Connected to Sound DB:', process.env.SOUND_DB_NAME);
        return pool;
    } catch (err) {
        console.error('❌ Sound DB connection failed:', err.message);
        throw err;
    }
};

export const getSoundPool = () => {
    if (!pool) throw new Error('Sound DB not connected. Call connectSoundDB() first.');
    return pool;
};

export { sql };