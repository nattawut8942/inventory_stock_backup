-- Migration: MAC Address column for MA items (typed by the user, optional).
-- Idempotent - safe to run multiple times.

USE [dbInfrastructure];
GO

IF COL_LENGTH('dbo.MA_Items', 'MacAddress') IS NULL
BEGIN
    ALTER TABLE dbo.MA_Items ADD MacAddress NVARCHAR(17) NULL;
    PRINT 'MA_Items.MacAddress added.';
END
ELSE
    PRINT 'MA_Items.MacAddress already exists - skipping.';
GO
