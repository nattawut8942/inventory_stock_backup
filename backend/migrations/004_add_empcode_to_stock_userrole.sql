-- Migration: Add EmpCode column to Stock_UserRole table (Safe Version)
-- Description: Change from username-based admin check to empCode-based (more stable identifier)
-- Date: 2026-03-21
-- Note: Idempotent - safe to run multiple times

USE [dbInfrastructure];
GO

-- Check if column exists - simple check
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'dbo' 
    AND TABLE_NAME = 'Stock_UserRole' 
    AND COLUMN_NAME = 'EmpCode'
)
BEGIN
    PRINT 'Adding EmpCode column...';
    ALTER TABLE [dbo].[Stock_UserRole]
    ADD [EmpCode] NVARCHAR(20) NULL;
    PRINT 'Column [EmpCode] added successfully.';
END
ELSE
BEGIN
    PRINT 'Column [EmpCode] already exists - skipping column creation.';
END
GO

-- Add UNIQUE constraint if not exists
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
    WHERE TABLE_SCHEMA = 'dbo' 
    AND TABLE_NAME = 'Stock_UserRole' 
    AND CONSTRAINT_NAME = 'UQ_Stock_UserRole_EmpCode'
)
BEGIN
    PRINT 'Adding UNIQUE constraint...';
    ALTER TABLE [dbo].[Stock_UserRole]
    ADD CONSTRAINT UQ_Stock_UserRole_EmpCode UNIQUE ([EmpCode]);
    PRINT 'UNIQUE constraint added.';
END
ELSE
BEGIN
    PRINT 'UNIQUE constraint already exists - skipping.';
END
GO

-- Verification
PRINT '--- Final Table Structure ---';
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Stock_UserRole'
ORDER BY ORDINAL_POSITION;
