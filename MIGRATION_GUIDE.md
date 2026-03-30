# 🔧 Database Migration Instructions

## Issue Fixed: Export Function "Workbook is empty" Error

### Root Cause
- Export queries referenced table columns that don't exist in the current database schema
- Table name mismatch: `PC_Inventory` vs actual `info_pc_inventory`
- Missing columns: `wifi_ssid`, `adapter_type`, `category`, `brand`, `asset_tag`, `status`, `location`, `user`, `remark`, `purchase_date`

### Solution Applied
1. ✅ Fixed table name from `PC_Inventory` to `info_pc_inventory` in reportController.js
2. ✅ Fixed column names to match actual database schema (lowercase with underscores)
3. ✅ Added error logging to help debug any remaining issues
4. ⏳ **NEXT STEP**: Add missing columns to the database

---

## How to Apply Database Schema Changes

### Option 1: Run Node.js Migration Script (RECOMMENDED)

1. Open Terminal and navigate to backend folder:
```bash
cd backend
```

2. Run the migration script:
```bash
node run-migrations.js
```

**Expected Output:**
```
🚀 Starting database migrations...
📝 Running Migration 005: Add network columns to PC Inventory...
✅ Migration 005 completed - XX statements executed

✨ All migrations completed successfully!
```

### Option 2: Manual SQL Execution (via SQL Server Management Studio)

1. Open SQL Server Management Studio
2. Connect to your database
3. Open the file: `backend/migrations/005_add_network_columns_to_pc_inventory.sql`
4. Execute the script

---

## What Was Added

The migration adds these columns to `info_pc_inventory` table:
- `wifi_ssid` (NVARCHAR(255)) - WiFi network name
- `adapter_type` (NVARCHAR(100)) - Network adapter type
- `category` (NVARCHAR(100)) - Device category
- `brand` (NVARCHAR(100)) - Device brand/manufacturer
- `asset_tag` (NVARCHAR(50)) - Asset tag for inventory tracking
- `status` (NVARCHAR(50)) - Device status (Active/Inactive/Retired)
- `location` (NVARCHAR(255)) - Physical location of device
- `user` (NVARCHAR(255)) - Primary user of device
- `remark` (NVARCHAR(MAX)) - Notes/remarks
- `purchase_date` (DATETIME) - Purchase/acquisition date

---

## Verify Migration Success

After running the migration, test the export function:

1. Go to **Reports > Export**
2. Select **"💻 PC Inventory ทั้งหมด"**
3. Click **"Export"**
4. Expected result:
   - ✅ Excel file downloads successfully (even if empty `ไม่พบข้อมูล...`)
   - ❌ No error message in console

---

## If You Still Get Errors

Check the server console logs:
- `📋 Fetching PC Inventory data...` - means query started
- `✅ PC Inventory Query Result: X rows found` - shows how many records
- `❌ Error processing pcinventory:` - shows specific error

### Common Issues:
| Error | Solution |
|-------|----------|
| "Invalid column name" | Migration not applied. Run `node run-migrations.js` |
| "Invalid object name" | Table doesn't exist. Check database name in config |
| "Timeout" | Database connection issue. Check server logs |
| "0 rows found" | No PC inventory data yet. This is normal. |

---

## Restart Server

After migration:
```bash
npm start
# or
npm run dev
```

Then test the export again!
