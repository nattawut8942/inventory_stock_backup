-- =====================================================
-- IT Asset Disposal Module - Migration Script
-- Created: 2026-11-23
-- =====================================================

-- 1. Disposal rounds (รอบ Disposal) — RunCode เช่น disposal23112026001
IF OBJECT_ID(N'dbo.Disposal_Runs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Disposal_Runs (
        RunID         INT IDENTITY(1,1) PRIMARY KEY,
        RunCode       NVARCHAR(50)  NOT NULL UNIQUE,      -- disposal + ddmmyyyy + run 3 หลัก
        Status        NVARCHAR(20)  NOT NULL DEFAULT 'Open', -- Open / Closed
        CreatedBy     NVARCHAR(100) NULL,
        CreatedByName NVARCHAR(150) NULL,
        CreatedAt     DATETIME      NOT NULL DEFAULT GETDATE(),
        ClosedBy      NVARCHAR(100) NULL,
        ClosedAt      DATETIME      NULL
    );
    PRINT 'Created table: Disposal_Runs';
END
GO

-- 2. Disposal items (รายการอุปกรณ์ในแต่ละรอบ)
IF OBJECT_ID(N'dbo.Disposal_Items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Disposal_Items (
        ItemID        INT IDENTITY(1,1) PRIMARY KEY,
        RunID         INT NOT NULL FOREIGN KEY REFERENCES dbo.Disposal_Runs(RunID),
        AssetNo       NVARCHAR(50)  NOT NULL,             -- ASSET NO เช่น CO24-017-02
        AssetDate     DATETIME      NULL,                 -- ASSET DATE
        AssetName     NVARCHAR(300) NULL,                 -- ASSET NAME
        Place         NVARCHAR(300) NULL,                 -- PLACE
        CostCenter    NVARCHAR(50)  NULL,                 -- COSTCENTER
        Cost          DECIMAL(18,2) NULL,                 -- COST
        AccumDP       DECIMAL(18,2) NULL,                 -- ACCUMDP
        BkAmt         DECIMAL(18,2) NULL,                 -- BKAMT
        Pic1Path      NVARCHAR(300) NULL,                 -- รูปที่ 1 (URL path)
        Pic2Path      NVARCHAR(300) NULL,                 -- รูปที่ 2 (URL path)
        CreatedBy     NVARCHAR(100) NULL,                 -- ผู้บันทึก (username)
        CreatedByName NVARCHAR(150) NULL,                 -- ผู้บันทึก (ชื่อ)
        CreatedAt     DATETIME      NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Created table: Disposal_Items';
END
GO

-- 3. กันไม่ให้ asset เดียวกันซ้ำในรอบเดียวกัน
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UX_Disposal_Items_Run_Asset')
    CREATE UNIQUE INDEX UX_Disposal_Items_Run_Asset ON dbo.Disposal_Items(RunID, AssetNo);
GO
