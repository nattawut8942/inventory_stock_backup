-- Migration: attachments belong to a renewal cycle (MA_RenewalHistory.RenewalID).
-- Idempotent - safe to run multiple times.

USE [dbInfrastructure];
GO

IF COL_LENGTH('dbo.MA_Attachments', 'RenewalID') IS NULL
BEGIN
    ALTER TABLE dbo.MA_Attachments ADD RenewalID INT NULL;
    PRINT 'MA_Attachments.RenewalID added.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MA_Attachments_Renewal' AND object_id = OBJECT_ID('dbo.MA_Attachments'))
BEGIN
    CREATE INDEX IX_MA_Attachments_Renewal ON dbo.MA_Attachments(RenewalID);
    PRINT 'IX_MA_Attachments_Renewal created.';
END
GO
