-- Migration: MA history (audit log, renewal history), attachments, and client IP / MAC on every record.
-- Idempotent - safe to run multiple times.
-- Run: node migrations/run-migration.mjs migrations/2026-11-16_ma_history_attachments.sql

USE [dbInfrastructure];
GO

-- 1) Who deleted an MA item (soft delete already stores DeletedAt)
IF COL_LENGTH('dbo.MA_Items', 'DeletedBy') IS NULL
BEGIN
    ALTER TABLE dbo.MA_Items ADD DeletedBy NVARCHAR(50) NULL;
    PRINT 'MA_Items.DeletedBy added.';
END
GO

-- 2) Event log: one row per action (CREATE / UPDATE / STATUS / RENEW_STEP / RENEW_COMPLETE / DELETE / ATTACH / DETACH)
--    Changes = JSON array of { "field", "old", "new" } for the fields that changed.
IF OBJECT_ID('dbo.MA_History', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MA_History (
        HistoryID   INT IDENTITY(1,1) PRIMARY KEY,
        ItemID      INT           NOT NULL,
        EventType   NVARCHAR(30)  NOT NULL,
        Changes     NVARCHAR(MAX) NULL,
        Note        NVARCHAR(500) NULL,
        ActorUser   NVARCHAR(50)  NULL,
        ClientIP    NVARCHAR(45)  NULL,
        ClientMAC   NVARCHAR(17)  NULL,
        CreatedAt   DATETIME      NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_MA_History_Item ON dbo.MA_History(ItemID, CreatedAt DESC);
    PRINT 'MA_History created.';
END
GO

-- 3) One row per completed renewal cycle, keeping the before / after values
IF OBJECT_ID('dbo.MA_RenewalHistory', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MA_RenewalHistory (
        RenewalID     INT IDENTITY(1,1) PRIMARY KEY,
        ItemID        INT           NOT NULL,
        OldStartDate  DATE          NULL,
        OldEndDate    DATE          NULL,
        NewStartDate  DATE          NULL,
        NewEndDate    DATE          NULL,
        OldPrice      DECIMAL(18,2) NULL,
        NewPrice      DECIMAL(18,2) NULL,
        OldPONumber   NVARCHAR(100) NULL,
        NewPONumber   NVARCHAR(100) NULL,
        PRNumber      NVARCHAR(100) NULL,
        CompletedBy   NVARCHAR(50)  NULL,
        ClientIP      NVARCHAR(45)  NULL,
        ClientMAC     NVARCHAR(17)  NULL,
        CompletedAt   DATETIME      NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_MA_RenewalHistory_Item ON dbo.MA_RenewalHistory(ItemID, CompletedAt DESC);
    PRINT 'MA_RenewalHistory created.';
END
GO

-- 4) Optional file attachments (quotation, PR, PO, receipts, ...). Never required.
IF OBJECT_ID('dbo.MA_Attachments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MA_Attachments (
        AttachmentID INT IDENTITY(1,1) PRIMARY KEY,
        ItemID       INT           NOT NULL,
        Kind         NVARCHAR(20)  NULL,      -- QT / PR / PO / RECEIPT / OTHER
        FileName     NVARCHAR(255) NOT NULL,  -- original name shown to users
        StoredName   NVARCHAR(255) NOT NULL,  -- name on disk (never user input)
        MimeType     NVARCHAR(100) NULL,
        FileSize     INT           NULL,
        Note         NVARCHAR(500) NULL,
        UploadedBy   NVARCHAR(50)  NULL,
        ClientIP     NVARCHAR(45)  NULL,
        ClientMAC    NVARCHAR(17)  NULL,
        UploadedAt   DATETIME      NOT NULL DEFAULT GETDATE(),
        IsDeleted    BIT           NOT NULL DEFAULT 0,
        DeletedBy    NVARCHAR(50)  NULL,
        DeletedAt    DATETIME      NULL
    );
    CREATE INDEX IX_MA_Attachments_Item ON dbo.MA_Attachments(ItemID, IsDeleted);
    PRINT 'MA_Attachments created.';
END
GO
