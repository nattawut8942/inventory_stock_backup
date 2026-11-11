-- =====================================================
-- Migration: Renewal / procurement tracking for MA_Items
-- แยกสถานะการต่ออายุ (จัดซื้อ) ออกจาก Status ของสัญญา
--   RenewalStatus: NULL = ยังไม่ดำเนินการ
--                  QUOTATION | PR_CREATED | WAITING_PO | PO_ISSUED
--   PRNumber:      เลขที่ PR ของรอบต่ออายุ
--   NewPONumber:   เลขที่ PO ใหม่ของรอบต่ออายุ (PONumber เดิมยังเป็นของสัญญาปัจจุบัน)
-- =====================================================

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_Items' AND COLUMN_NAME = 'RenewalStatus')
BEGIN
    ALTER TABLE dbo.MA_Items ADD RenewalStatus NVARCHAR(30) NULL;
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_Items' AND COLUMN_NAME = 'PRNumber')
BEGIN
    ALTER TABLE dbo.MA_Items ADD PRNumber NVARCHAR(100) NULL;
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_Items' AND COLUMN_NAME = 'NewPONumber')
BEGIN
    ALTER TABLE dbo.MA_Items ADD NewPONumber NVARCHAR(100) NULL;
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_Items' AND COLUMN_NAME = 'RenewalUpdatedAt')
BEGIN
    ALTER TABLE dbo.MA_Items ADD RenewalUpdatedAt DATETIME2 NULL;
END;

-- ผู้ที่เปลี่ยนสถานะต่ออายุล่าสุด
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_Items' AND COLUMN_NAME = 'RenewalUpdatedBy')
BEGIN
    ALTER TABLE dbo.MA_Items ADD RenewalUpdatedBy NVARCHAR(100) NULL;
END;

-- การต่ออายุครั้งล่าสุด (ปุ่ม "ต่ออายุเสร็จ")
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_Items' AND COLUMN_NAME = 'LastRenewedAt')
BEGIN
    ALTER TABLE dbo.MA_Items ADD LastRenewedAt DATETIME2 NULL;
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_Items' AND COLUMN_NAME = 'LastRenewedBy')
BEGIN
    ALTER TABLE dbo.MA_Items ADD LastRenewedBy NVARCHAR(100) NULL;
END;
