-- =====================================================
-- Plug Check Module - Migration Script
-- Monthly plug inspection sheets (per area, per fiscal year Apr-Mar)
-- =====================================================

-- 1. Factory master
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_PlugFactories') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_PlugFactories (
        FactoryID INT IDENTITY(1,1) PRIMARY KEY,
        FactoryName NVARCHAR(100) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Created table: Stock_PlugFactories';
END
GO

-- 2. Area (room) master - one area = one check sheet per fiscal year
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_PlugAreas') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_PlugAreas (
        AreaID INT IDENTITY(1,1) PRIMARY KEY,
        FactoryID INT NOT NULL FOREIGN KEY REFERENCES dbo.Stock_PlugFactories(FactoryID),
        AreaName NVARCHAR(150) NOT NULL,              -- e.g. OFFICE Factory 2
        DeptName NVARCHAR(200) NULL,                  -- e.g. MC/ IOT INNOVATION & SYSTEM DEVELOPMENT
        LayoutCaption NVARCHAR(300) NULL,             -- text printed on top of the layout
        LayoutImage NVARCHAR(500) NULL,               -- /uploads/plug-check/xxx.png
        Panel1Title NVARCHAR(200) NULL,
        Panel1Image NVARCHAR(500) NULL,
        Panel1Caption NVARCHAR(MAX) NULL,
        Panel2Title NVARCHAR(200) NULL,
        Panel2Image NVARCHAR(500) NULL,
        Panel2Caption NVARCHAR(MAX) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Created table: Stock_PlugAreas';
END
GO

-- 3. Plug standard master (A, B, C, D ...) shared by every area
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_PlugStandards') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_PlugStandards (
        StdID INT IDENTITY(1,1) PRIMARY KEY,
        Code NVARCHAR(10) NOT NULL UNIQUE,            -- A, B, C, D ...
        Name NVARCHAR(300) NULL,                      -- brand / model / TIS
        Shape NVARCHAR(20) NOT NULL DEFAULT 'circle', -- circle | trap | shield | diamond | square
        ImageUrl NVARCHAR(500) NULL,
        SortOrder INT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1
    );
    PRINT 'Created table: Stock_PlugStandards';
END
GO

-- 4. Check points master (one row = one plug in an area)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_PlugPoints') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_PlugPoints (
        PointID INT IDENTITY(1,1) PRIMARY KEY,
        AreaID INT NOT NULL FOREIGN KEY REFERENCES dbo.Stock_PlugAreas(AreaID),
        PointNo INT NOT NULL,
        PointName NVARCHAR(150) NOT NULL,             -- e.g. ปลั๊กไฟ 5 เต้ารับ
        StdCode NVARCHAR(10) NULL,
        PosX DECIMAL(6,3) NULL,                       -- % of layout width
        PosY DECIMAL(6,3) NULL,                       -- % of layout height
        Method1 NVARCHAR(150) NOT NULL DEFAULT N'1.เช็คด้วยสายตา',
        Method2 NVARCHAR(150) NULL DEFAULT N'2.เช็คกระแสไฟฟ้า',
        Tool1 NVARCHAR(100) NULL DEFAULT N'มือ,ตา',
        Tool2 NVARCHAR(100) NULL DEFAULT N'Test Lamp',
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Created table: Stock_PlugPoints';
END
GO

-- 5. Sheet (one per area per fiscal year). SnapshotJson keeps header/standards/panels as of creation
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_PlugSheets') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_PlugSheets (
        SheetID INT IDENTITY(1,1) PRIMARY KEY,
        AreaID INT NOT NULL FOREIGN KEY REFERENCES dbo.Stock_PlugAreas(AreaID),
        FiscalYear INT NOT NULL,                      -- 2026 = Apr 2026 .. Mar 2027
        SnapshotJson NVARCHAR(MAX) NOT NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedBy NVARCHAR(100) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_PlugSheet UNIQUE (AreaID, FiscalYear)
    );
    PRINT 'Created table: Stock_PlugSheets';
END
GO

-- 6. Points inside a sheet (copied from master when the sheet is created)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_PlugSheetPoints') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_PlugSheetPoints (
        SheetPointID INT IDENTITY(1,1) PRIMARY KEY,
        SheetID INT NOT NULL FOREIGN KEY REFERENCES dbo.Stock_PlugSheets(SheetID),
        PointID INT NULL,
        PointNo INT NOT NULL,
        PointName NVARCHAR(150) NOT NULL,
        StdCode NVARCHAR(10) NULL,
        PosX DECIMAL(6,3) NULL,
        PosY DECIMAL(6,3) NULL,
        Method1 NVARCHAR(150) NULL,
        Method2 NVARCHAR(150) NULL,
        Tool1 NVARCHAR(100) NULL,
        Tool2 NVARCHAR(100) NULL,
        StartMonth INT NOT NULL DEFAULT 0             -- 0 = Apr ... 11 = Mar (point added mid-year)
    );
    PRINT 'Created table: Stock_PlugSheetPoints';
END
GO

-- 7. Monthly result per point
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_PlugResults') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_PlugResults (
        ResultID INT IDENTITY(1,1) PRIMARY KEY,
        SheetPointID INT NOT NULL FOREIGN KEY REFERENCES dbo.Stock_PlugSheetPoints(SheetPointID),
        MonthIdx INT NOT NULL,                        -- 0 = Apr ... 11 = Mar
        Result NVARCHAR(10) NULL,                     -- ok | bad | use | fix
        Note NVARCHAR(500) NULL,
        PhotoUrl NVARCHAR(500) NULL,
        CheckedBy NVARCHAR(100) NULL,
        CheckedAt DATETIME NULL,
        CONSTRAINT UQ_PlugResult UNIQUE (SheetPointID, MonthIdx)
    );
    PRINT 'Created table: Stock_PlugResults';
END
GO

-- 8. Sign-off per month (TOP = responsible TE/EN, BOT = acknowledged SE/S.EN/EN)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_PlugSigns') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_PlugSigns (
        SignID INT IDENTITY(1,1) PRIMARY KEY,
        SheetID INT NOT NULL FOREIGN KEY REFERENCES dbo.Stock_PlugSheets(SheetID),
        MonthIdx INT NOT NULL,
        Slot NVARCHAR(3) NOT NULL,                    -- TOP | BOT
        SignedBy NVARCHAR(100) NOT NULL,
        EmpCode NVARCHAR(20) NULL,
        Position NVARCHAR(20) NULL,
        SignedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_PlugSign UNIQUE (SheetID, MonthIdx, Slot)
    );
    PRINT 'Created table: Stock_PlugSigns';
END
GO

-- 9. Audit log (unlock / sheet changes)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_PlugLog') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_PlugLog (
        LogID INT IDENTITY(1,1) PRIMARY KEY,
        SheetID INT NULL,
        MonthIdx INT NULL,
        Action NVARCHAR(30) NOT NULL,
        Detail NVARCHAR(500) NULL,
        ByUser NVARCHAR(100) NULL,
        At DATETIME NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Created table: Stock_PlugLog';
END
GO

-- Seed the four standards from the original form
IF NOT EXISTS (SELECT 1 FROM dbo.Stock_PlugStandards)
BEGIN
    INSERT INTO dbo.Stock_PlugStandards (Code, Name, Shape, SortOrder) VALUES
    (N'A', N'Panasonic WCHG-28352' + CHAR(10) + N'มอก.2432-2555', 'circle', 1),
    (N'B', N'Toshino ET-916 6 ช่อง' + CHAR(10) + N'มอก.2432-2555', 'trap', 2),
    (N'C', N'Toshino ET-913 3 ช่อง + USB' + CHAR(10) + N'มอก.2432-2555', 'shield', 3),
    (N'D', N'Panasonic เต้ารับ 2 ช่อง', 'diamond', 4);
    PRINT 'Seeded plug standards A-D';
END
GO
