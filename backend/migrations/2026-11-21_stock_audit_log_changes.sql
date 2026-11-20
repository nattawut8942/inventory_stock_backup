-- ประวัติการทำงาน ระดับ 2: เก็บ "ค่าเดิม → ค่าใหม่" แยกเป็นคอลัมน์ Changes (JSON)
-- เพิ่มคอลัมน์ในตารางที่สร้างจาก 2026-11-21_stock_audit_log.sql · รันซ้ำได้
-- ถ้ายังไม่ได้รัน ระบบจะเก็บการเปลี่ยนแปลงไว้ใน Body (ช่อง __changes) แทน
-- รัน: node migrations/run-migration.mjs migrations/2026-11-21_stock_audit_log_changes.sql

IF OBJECT_ID('dbo.Stock_AuditLog', 'U') IS NOT NULL AND COL_LENGTH('dbo.Stock_AuditLog', 'Changes') IS NULL
    ALTER TABLE dbo.Stock_AuditLog ADD Changes NVARCHAR(MAX) NULL;
GO

-- Rollback:
-- ALTER TABLE dbo.Stock_AuditLog DROP COLUMN Changes;
