-- =====================================================
-- IT Asset Disposal - ขั้นตอนของรอบ (แสดงเป็น progress bar 5 ขั้น)
-- Stage: 1 บันทึก Fix + ถ่ายรูป | 2 ทำ Doc บัญชี | 3 ผู้บริหารเซ็น | 4 ส่งบัญชี | 5 รอทิ้งจริง
-- รอบเดิมที่เสร็จสิ้นแล้วตั้งเป็น 5, ที่ปิดรอบแล้วตั้งเป็น 2, ที่ยังเปิดอยู่ตั้งเป็น 1
-- Created: 2026-12-01
-- =====================================================

IF COL_LENGTH(N'dbo.Disposal_Runs', N'Stage') IS NULL
BEGIN
    ALTER TABLE dbo.Disposal_Runs ADD
        Stage INT NOT NULL CONSTRAINT DF_Disposal_Runs_Stage DEFAULT 1;
    PRINT 'Added Stage to Disposal_Runs';
END
GO

UPDATE dbo.Disposal_Runs
SET Stage = CASE WHEN CompletedAt IS NOT NULL THEN 5 WHEN Status <> 'Open' THEN 2 ELSE 1 END
WHERE Stage = 1 AND (CompletedAt IS NOT NULL OR Status <> 'Open');
GO
