-- Migration: Create Stock_LoginLog table (one row per login attempt)
-- Never stores passwords.
-- Note: Idempotent - safe to run multiple times

USE [dbInfrastructure];
GO

IF OBJECT_ID('dbo.Stock_LoginLog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stock_LoginLog (
        ID         INT IDENTITY(1,1) PRIMARY KEY,
        Username   NVARCHAR(50)  NULL,
        EmpCode    NVARCHAR(20)  NULL,
        Role       NVARCHAR(20)  NULL,
        Status     NVARCHAR(20)  NOT NULL,   -- SUCCESS / FAILED / DENIED / ERROR
        Reason     NVARCHAR(255) NULL,
        IpAddress  NVARCHAR(45)  NULL,
        UserAgent  NVARCHAR(255) NULL,
        LoginAt    DATETIME      NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_Stock_LoginLog_LoginAt ON dbo.Stock_LoginLog(LoginAt DESC);
    PRINT 'Stock_LoginLog created.';
END
ELSE
    PRINT 'Stock_LoginLog already exists - skipping.';
GO
