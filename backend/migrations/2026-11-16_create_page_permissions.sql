-- Migration: Page-level permissions (view / create / edit / delete / special actions per page)
-- Admin always has every permission and is not stored here.
-- Day-one state: every existing user gets "view" on every page that is not Admin-only
-- (the same 22 pages as permissions.config.js -> defaultPermissionKeys()).
-- Note: Idempotent - safe to run multiple times.

USE [dbInfrastructure];
GO

-- Who has which permission. A row = granted, no row = not granted.
IF OBJECT_ID('dbo.Stock_PagePermissions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stock_PagePermissions (
        EmpCode   NVARCHAR(20) NOT NULL,
        PageKey   NVARCHAR(50) NOT NULL,
        Action    NVARCHAR(30) NOT NULL,
        GrantedBy NVARCHAR(50) NULL,
        GrantedAt DATETIME     NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_Stock_PagePermissions PRIMARY KEY (EmpCode, PageKey, Action)
    );
    PRINT 'Stock_PagePermissions created.';
END
GO

-- What a brand-new user receives on first login (editable by Admin).
IF OBJECT_ID('dbo.Stock_PermissionDefaults', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stock_PermissionDefaults (
        PageKey NVARCHAR(50) NOT NULL,
        Action  NVARCHAR(30) NOT NULL,
        CONSTRAINT PK_Stock_PermissionDefaults PRIMARY KEY (PageKey, Action)
    );
    PRINT 'Stock_PermissionDefaults created.';
END
GO

-- Who changed what, and when. EmpCode '(DEFAULT)' = change to the default set.
IF OBJECT_ID('dbo.Stock_PermissionAudit', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stock_PermissionAudit (
        ID        INT IDENTITY(1,1) PRIMARY KEY,
        EmpCode   NVARCHAR(20) NOT NULL,
        PageKey   NVARCHAR(50) NOT NULL,
        Action    NVARCHAR(30) NOT NULL,
        Change    NVARCHAR(10) NOT NULL,      -- GRANT / REVOKE
        ChangedBy NVARCHAR(50) NULL,
        ChangedAt DATETIME     NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_Stock_PermissionAudit_EmpCode ON dbo.Stock_PermissionAudit(EmpCode, ChangedAt DESC);
    PRINT 'Stock_PermissionAudit created.';
END
GO

-- Marks users whose starting permissions have been copied from the defaults.
IF COL_LENGTH('dbo.Stock_Users', 'PermInitAt') IS NULL
BEGIN
    ALTER TABLE dbo.Stock_Users ADD PermInitAt DATETIME NULL;
    PRINT 'Column Stock_Users.PermInitAt added.';
END
GO

-- Seed the defaults once (only when the table is empty): view on every non-Admin-only page.
IF NOT EXISTS (SELECT 1 FROM dbo.Stock_PermissionDefaults)
BEGIN
    INSERT INTO dbo.Stock_PermissionDefaults (PageKey, Action)
    SELECT v.PageKey, 'view'
    FROM (VALUES
        ('dashboard'), ('activity'), ('inventory'), ('stock-count'), ('ink-toner'),
        ('printer-health'), ('purchase-orders'), ('receive'), ('borrowings'),
        ('pc-inventory'), ('devices-layout'), ('cctv'), ('ma-license'),
        ('ip-management'), ('ad-explorer'), ('quota-manager'), ('calendar'),
        ('sound-layout'), ('it-request'), ('history'), ('reports'), ('knowledge-base')
    ) AS v(PageKey);
    PRINT 'Stock_PermissionDefaults seeded (22 pages, view only).';
END
GO

-- Backfill every existing user that has not been initialised yet (Admins too, so a later
-- demotion keeps a sane starting point). Re-running never duplicates or overwrites anything.
INSERT INTO dbo.Stock_PagePermissions (EmpCode, PageKey, Action, GrantedBy)
SELECT u.EmpCode, d.PageKey, d.Action, 'SYSTEM'
FROM dbo.Stock_Users u
CROSS JOIN dbo.Stock_PermissionDefaults d
WHERE u.PermInitAt IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Stock_PagePermissions p
      WHERE p.EmpCode = u.EmpCode AND p.PageKey = d.PageKey AND p.Action = d.Action
  );
UPDATE dbo.Stock_Users SET PermInitAt = GETDATE() WHERE PermInitAt IS NULL;
GO
