#!/usr/bin/env node

/**
 * Database Migration Runner
 * Run migrations that add missing columns
 */

import { connectDB, getPool, closeDB } from './src/config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runMigrations = async () => {
    // Connect to database first
    await connectDB();
    const pool = getPool();
    
    try {
        console.log('🚀 Starting database migrations...\n');
        
        // Read and execute migration 005
        const migrationPath = path.join(__dirname, 'migrations', '005_add_network_columns_to_pc_inventory.sql');
        
        if (fs.existsSync(migrationPath)) {
            const sql = fs.readFileSync(migrationPath, 'utf8');
            
            console.log('📝 Running Migration 005: Add network columns to PC Inventory...');
            
            // Execute the entire SQL as one batch (don't split by semicolon)
            try {
                await pool.request().query(sql);
                console.log('✅ Migration 005 completed successfully\n');
            } catch (err) {
                console.warn(`⚠️  Migration 005: ${err.message.substring(0, 150)}`);
                console.log('ℹ️  This may be normal if columns already exist\n');
            }
        } else {
            console.error(`❌ Migration file not found: ${migrationPath}`);
            await closeDB();
            process.exit(1);
        }
        
        console.log('✨ All migrations processed!');
        await closeDB();
        process.exit(0);
        
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        console.error('Stack:', err.stack);
        await closeDB();
        process.exit(1);
    }
};

runMigrations();
