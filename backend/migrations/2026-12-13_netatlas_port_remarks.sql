-- =====================================================
-- NetAtlas — หมายเหตุ (remark) ของแต่ละพอร์ต
-- ใส่ได้โดยไม่ต้องมีอุปกรณ์เสียบอยู่ ลบอุปกรณ์แล้วหมายเหตุจะหายตาม
-- Created: 2026-12-13
-- =====================================================

IF OBJECT_ID(N'dbo.NetAtlas_PortRemarks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NetAtlas_PortRemarks (
        DeviceID  INT NOT NULL,
        PortNo    INT NOT NULL,
        Remark    NVARCHAR(200) NOT NULL,
        UpdatedBy NVARCHAR(100) NULL,
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_NetAtlas_PortRemarks_UpdatedAt DEFAULT SYSDATETIME(),
        CONSTRAINT PK_NetAtlas_PortRemarks PRIMARY KEY (DeviceID, PortNo),
        CONSTRAINT FK_NetAtlas_PortRemarks_Device FOREIGN KEY (DeviceID) REFERENCES dbo.NetAtlas_Devices (DeviceID) ON DELETE CASCADE,
        CONSTRAINT CK_NetAtlas_PortRemarks_PortNo CHECK (PortNo >= 1)
    );
    PRINT 'Created NetAtlas_PortRemarks';
END
GO
