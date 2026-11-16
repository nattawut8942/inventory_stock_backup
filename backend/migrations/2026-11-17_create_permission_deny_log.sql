-- Migration: persistent "would be denied" report for PERMISSIONS_MODE=log
-- One row per (user, page, action, reason) with a running count, so the review period survives
-- backend restarts. Written in batches (every ~30 s), not per request.
-- Note: Idempotent - safe to run multiple times.

USE [dbInfrastructure];
GO

IF OBJECT_ID('dbo.Stock_PermissionDenyLog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stock_PermissionDenyLog (
        EmpCode  NVARCHAR(20) NOT NULL,   -- '-' = request without a valid token
        PageKey  NVARCHAR(50) NOT NULL,
        Action   NVARCHAR(30) NOT NULL,
        Reason   NVARCHAR(30) NOT NULL,   -- no-permission / no-token / user-not-found / lookup-failed
        Hits     INT          NOT NULL DEFAULT 0,
        FirstAt  DATETIME     NOT NULL DEFAULT GETDATE(),
        LastAt   DATETIME     NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_Stock_PermissionDenyLog PRIMARY KEY (EmpCode, PageKey, Action, Reason)
    );
    PRINT 'Stock_PermissionDenyLog created.';
END
ELSE
    PRINT 'Stock_PermissionDenyLog already exists - skipping.';
GO
