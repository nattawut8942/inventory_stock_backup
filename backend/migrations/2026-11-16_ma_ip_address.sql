-- Migration: IP Address column for MA items (typed by the user, optional).
-- Idempotent - safe to run multiple times.

USE [dbInfrastructure];
GO

IF COL_LENGTH('dbo.MA_Items', 'IpAddress') IS NULL
BEGIN
    ALTER TABLE dbo.MA_Items ADD IpAddress NVARCHAR(45) NULL;
    PRINT 'MA_Items.IpAddress added.';
END
ELSE
    PRINT 'MA_Items.IpAddress already exists - skipping.';
GO
