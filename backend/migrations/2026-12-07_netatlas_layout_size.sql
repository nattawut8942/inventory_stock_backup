-- =====================================================
-- NetAtlas — ขนาดผังเป็น px (เหมือนแผนผังโรงงาน: width/height)
-- ค่าเริ่มต้นมาจากขนาดรูปที่อัปโหลด แก้ไขได้ใน Management
-- Created: 2026-12-07
-- =====================================================

IF COL_LENGTH(N'dbo.NetAtlas_Layouts', N'Width') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_Layouts ADD Width INT NULL;
    PRINT 'Added Width';
END
GO

IF COL_LENGTH(N'dbo.NetAtlas_Layouts', N'Height') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_Layouts ADD Height INT NULL;
    PRINT 'Added Height';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_NetAtlas_Layouts_Size')
BEGIN
    ALTER TABLE dbo.NetAtlas_Layouts ADD CONSTRAINT CK_NetAtlas_Layouts_Size
        CHECK ((Width IS NULL OR (Width BETWEEN 1 AND 10000)) AND (Height IS NULL OR (Height BETWEEN 1 AND 10000)));
    PRINT 'Added CK_NetAtlas_Layouts_Size';
END
GO
