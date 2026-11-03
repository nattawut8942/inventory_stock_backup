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
        
        const migrations = [
            { file: '005_add_network_columns_to_pc_inventory.sql', label: 'Migration 005: Add network columns to PC Inventory' },
            { file: '007_add_location_to_ma_items.sql', label: 'Migration 007: Add factory layout position to MA_Items' },
            { file: '008_add_soft_delete_to_ma_items.sql', label: 'Migration 008: Add soft delete to MA_Items' },
            { file: '009_add_location_to_printers.sql', label: 'Migration 009: Add factory layout position to Printers' },
            { file: '010_create_plug_check_tables.sql', label: 'Migration 010: Create Plug Check tables' },
            { file: '011_add_image_to_plug_points.sql', label: 'Migration 011: Add image to Plug Check points' },
        ];

        for (const { file, label } of migrations) {
            const migrationPath = path.join(__dirname, 'migrations', file);

            if (!fs.existsSync(migrationPath)) {
                console.error(`❌ Migration file not found: ${migrationPath}`);
                await closeDB();
                process.exit(1);
            }

            const sql = fs.readFileSync(migrationPath, 'utf8');
            console.log(`📝 Running ${label}...`);

            // Execute as one batch (don't split by semicolon); only split on standalone GO lines
            try {
                const batches = sql.split(/^\s*GO\s*$/im).filter(b => b.trim());
                for (const batch of batches) {
                    await pool.request().query(batch);
                }
                console.log(`✅ ${label} completed successfully\n`);
            } catch (err) {
                console.warn(`⚠️  ${label}: ${err.message.substring(0, 150)}`);
                console.log('ℹ️  This may be normal if columns already exist\n');
            }
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
