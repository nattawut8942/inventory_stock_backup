-- ITBorrow: สถานะเพิ่มเติม (สูญหาย/ชำรุด/ส่งซ่อม), จำนวนวันที่คืนช้า, ประวัติการแก้ไข — idempotent
IF COL_LENGTH('dbo.IT_Borrowings', 'LateDays') IS NULL
    ALTER TABLE dbo.IT_Borrowings ADD LateDays INT NULL;
IF COL_LENGTH('dbo.IT_Borrowings', 'UpdatedBy') IS NULL
    ALTER TABLE dbo.IT_Borrowings ADD UpdatedBy NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.IT_Borrowings', 'UpdatedAt') IS NULL
    ALTER TABLE dbo.IT_Borrowings ADD UpdatedAt DATETIME NULL;

IF OBJECT_ID('dbo.IT_Borrow_Audit', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.IT_Borrow_Audit (
        id         INT IDENTITY(1,1) PRIMARY KEY,
        brID       INT NOT NULL,
        action     VARCHAR(20) NOT NULL,      -- create | edit | extend | return | lost | damaged | repairing
        actor      NVARCHAR(100) NULL,
        detail     NVARCHAR(MAX) NULL,
        created_at DATETIME NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_IT_Borrow_Audit_brID ON dbo.IT_Borrow_Audit (brID, created_at);
END
