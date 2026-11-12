-- Migration: Add EmpPic (photo URL from AD) to Stock_Users
-- Note: Idempotent - safe to run multiple times

USE [dbInfrastructure];
GO

IF COL_LENGTH('dbo.Stock_Users', 'EmpPic') IS NULL
BEGIN
    ALTER TABLE dbo.Stock_Users ADD EmpPic NVARCHAR(255) NULL;
    PRINT 'Column EmpPic added.';
END
ELSE
    PRINT 'Column EmpPic already exists - skipping.';
GO
