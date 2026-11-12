-- Migration: Create Stock_Users table (auto-registered on login, role managed in DB)
-- Description: Every user who passes the CC 7510 check is recorded here on login.
--              New users get role 'Staff'. Role 'Admin' is granted manually (seeded for EmpCode 41329).
--              Stock_UserRole is kept untouched.
-- Note: Idempotent - safe to run multiple times

USE [dbInfrastructure];
GO

IF OBJECT_ID('dbo.Stock_Users', 'U') IS NULL
BEGIN
    PRINT 'Creating Stock_Users table...';
    CREATE TABLE dbo.Stock_Users (
        ID           INT IDENTITY(1,1) PRIMARY KEY,
        EmpCode      NVARCHAR(20)  NOT NULL UNIQUE,
        Username     NVARCHAR(50)  NULL,
        Name         NVARCHAR(100) NULL,
        Sect         NVARCHAR(100) NULL,
        CostCenter   NVARCHAR(20)  NULL,
        Role         NVARCHAR(20)  NOT NULL DEFAULT 'Staff',
        FirstLoginAt DATETIME      NOT NULL DEFAULT GETDATE(),
        LastLoginAt  DATETIME      NULL,
        CONSTRAINT CK_Stock_Users_Role CHECK (Role IN ('Staff', 'Admin'))
    );
    PRINT 'Stock_Users created.';
END
ELSE
BEGIN
    PRINT 'Stock_Users already exists - skipping.';
END
GO

-- Seed admin (EmpCode 41329)
IF NOT EXISTS (SELECT 1 FROM dbo.Stock_Users WHERE EmpCode = '41329')
BEGIN
    INSERT INTO dbo.Stock_Users (EmpCode, Role) VALUES ('41329', 'Admin');
    PRINT 'Admin 41329 seeded.';
END
ELSE
BEGIN
    UPDATE dbo.Stock_Users SET Role = 'Admin' WHERE EmpCode = '41329';
    PRINT 'Admin 41329 already exists - role set to Admin.';
END
GO
