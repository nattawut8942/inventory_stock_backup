-- =====================================================
-- IT Asset Disposal - สถานะ "เสร็จสิ้น" ของรอบ (เพิ่มคอลัมน์ใน Disposal_Runs)
-- ใช้หลังปิดรอบแล้ว เมื่อ บช. ดำเนินการทิ้งครบ (ยืนยันด้วยเอกสารแนบ)
-- Created: 2026-11-26
-- =====================================================

IF COL_LENGTH(N'dbo.Disposal_Runs', N'CompletedAt') IS NULL
BEGIN
    ALTER TABLE dbo.Disposal_Runs ADD
        CompletedBy     NVARCHAR(100) NULL,
        CompletedByName NVARCHAR(150) NULL,
        CompletedAt     DATETIME      NULL;
    PRINT 'Added completion columns to Disposal_Runs';
END
GO
