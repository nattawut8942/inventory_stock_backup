-- =====================================================
-- Stock Count Module - Migration Script
-- Created: 2026-02-27
-- =====================================================

-- 1. Stock Count Sessions (Header)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_StockCountSessions') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_StockCountSessions (
        SessionID INT IDENTITY(1,1) PRIMARY KEY,
        SessionCode NVARCHAR(50) NOT NULL UNIQUE,     -- STK-YYYYMMDD-XXX
        CountDate DATETIME DEFAULT GETDATE(),          -- วันที่นับ
        ConfirmedBy NVARCHAR(100),                     -- AD Username ผู้ยืนยัน
        TotalItems INT DEFAULT 0,
        Variances INT DEFAULT 0,                       -- จำนวนรายการที่มี diff
        Status NVARCHAR(20) DEFAULT 'Draft',           -- Draft / Confirmed
        Note NVARCHAR(MAX),
        CreatedAt DATETIME DEFAULT GETDATE()
    );
    PRINT 'Created table: Stock_StockCountSessions';
END
GO

-- 2. Stock Count Items (Detail)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Stock_StockCountItems') AND type = 'U')
BEGIN
    CREATE TABLE dbo.Stock_StockCountItems (
        ItemID INT IDENTITY(1,1) PRIMARY KEY,
        SessionID INT FOREIGN KEY REFERENCES dbo.Stock_StockCountSessions(SessionID),
        ProductID INT FOREIGN KEY REFERENCES dbo.Stock_Products(ProductID),
        SystemQty INT NOT NULL,                        -- ค่าในระบบ ณ ตอนสแกน
        ActualQty INT,                                 -- จำนวนนับจริง
        DiffQty AS (ISNULL(ActualQty, 0) - SystemQty) PERSISTED,  -- computed column
        ScannedAt DATETIME DEFAULT GETDATE()
    );
    PRINT 'Created table: Stock_StockCountItems';
END
GO

-- 3. Indexes for Performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockCountItems_SessionID')
    CREATE INDEX IX_StockCountItems_SessionID ON dbo.Stock_StockCountItems(SessionID);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockCountItems_ProductID')
    CREATE INDEX IX_StockCountItems_ProductID ON dbo.Stock_StockCountItems(ProductID);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockCountSessions_CountDate')
    CREATE INDEX IX_StockCountSessions_CountDate ON dbo.Stock_StockCountSessions(CountDate DESC);
GO
