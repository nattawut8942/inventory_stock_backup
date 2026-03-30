#!/usr/bin/env node

/**
 * Debug Database - Check PC Inventory Data
 */

import { connectDB, getPool, closeDB } from './src/config/db.js';

const debug = async () => {
    try {
        await connectDB();
        const pool = getPool();
        
        console.log('📋 Checking info_pc_inventory table...\n');
        
        // Check columns
        console.log('1️⃣ Checking table structure:');
        const colResult = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'info_pc_inventory'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log(`Found ${colResult.recordset.length} columns:`);
        colResult.recordset.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}) [${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}]`);
        });
        
        // Check data count
        console.log('\n2️⃣ Checking data count:');
        const countResult = await pool.request().query(`
            SELECT COUNT(*) as total FROM dbo.info_pc_inventory
        `);
        console.log(`  Total records: ${countResult.recordset[0].total}`);
        
        // Get sample data
        console.log('\n3️⃣ Sample data (first 5 records):');
        const sampleResult = await pool.request().query(`
            SELECT TOP 5 
                id, hostname, serial_number, computer_type, manufacturer,
                os_name, os_release, cpu_cores, ram_gb, bitlocker
            FROM dbo.info_pc_inventory
        `);
        
        if (sampleResult.recordset.length > 0) {
            console.log('Data found:');
            sampleResult.recordset.forEach((row, idx) => {
                console.log(`\n  Record ${idx + 1}:`);
                Object.entries(row).forEach(([key, val]) => {
                    console.log(`    ${key}: ${val || '(null)'}`);
                });
            });
        } else {
            console.log('  ❌ No data found in table');
        }
        
        // Test the export query
        console.log('\n4️⃣ Testing PC Inventory export query:');
        const exportResult = await pool.request().query(`
            SELECT p.id, p.hostname, p.serial_number, p.fix_asset,
                   p.manufacturer, p.model, p.cpu_name, p.ram_gb, p.disk_info, p.resolution,
                   p.os_name, p.os_release, p.bitlocker, p.crowdstrike_ver,
                   p.ip_address, p.mac_address, p.computer_type, p.os_arch
            FROM dbo.info_pc_inventory p
            ORDER BY p.hostname
        `);
        
        console.log(`  Query returned: ${exportResult.recordset.length} rows`);
        if (exportResult.recordset.length > 0) {
            console.log('  ✅ Data available for export!');
            console.log('\n  First record:');
            const first = exportResult.recordset[0];
            Object.entries(first).forEach(([key, val]) => {
                console.log(`    ${key}: ${val || '(null)'}`);
            });
        } else {
            console.log('  ❌ Query returned 0 rows');
        }
        
        await closeDB();
        console.log('\n✨ Debug complete!');
        process.exit(0);
        
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error('Stack:', err.stack);
        process.exit(1);
    }
};

debug();
