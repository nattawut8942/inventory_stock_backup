-- =====================================================
-- IT Asset Disposal - ประวัติเหตุการณ์ของรอบ (Disposal_Events)
-- Created: 2026-11-24
-- =====================================================

IF OBJECT_ID(N'dbo.Disposal_Events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Disposal_Events (
        EventID    INT IDENTITY(1,1) PRIMARY KEY,
        RunID      INT NOT NULL FOREIGN KEY REFERENCES dbo.Disposal_Runs(RunID),
        EventType  NVARCHAR(30)  NOT NULL,   -- OPEN / ADD_ITEM / DELETE_ITEM / PHOTO / CLOSE
        Actor      NVARCHAR(100) NULL,       -- username
        ActorName  NVARCHAR(150) NULL,
        Detail     NVARCHAR(300) NULL,       -- เช่น ASSET NO
        At         DATETIME      NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Created table: Disposal_Events';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Disposal_Events_Run')
    CREATE INDEX IX_Disposal_Events_Run ON dbo.Disposal_Events(RunID, At);
GO
