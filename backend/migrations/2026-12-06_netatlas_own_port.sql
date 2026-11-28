-- =====================================================
-- NetAtlas — พอร์ตฝั่งอุปกรณ์เอง (OwnPortNo) สำหรับเส้นเชื่อมแบบสองฝั่ง
-- ParentPortNo = พอร์ตของ parent ที่เสียบ (เดิม)
-- OwnPortNo    = พอร์ตของอุปกรณ์นี้เองที่ใช้เชื่อมขึ้นไปหา parent (ใหม่)
-- พอร์ตหนึ่งของอุปกรณ์ใช้ได้ 1 เส้น จึงตรวจซ้ำกันในโค้ด (ทั้ง OwnPortNo และ ParentPortNo ของลูก)
-- Created: 2026-12-06
-- =====================================================

IF COL_LENGTH(N'dbo.NetAtlas_Devices', N'OwnPortNo') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD OwnPortNo INT NULL;
    PRINT 'Added OwnPortNo';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_NetAtlas_Devices_OwnPort')
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD CONSTRAINT CK_NetAtlas_Devices_OwnPort
        CHECK (OwnPortNo IS NULL OR OwnPortNo >= 1);
    PRINT 'Added CK_NetAtlas_Devices_OwnPort';
END
GO
