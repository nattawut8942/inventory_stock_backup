-- IP Management: serial number, MAC address, change history
-- Idempotent: รันซ้ำได้ปลอดภัย

IF COL_LENGTH('dbo.ip_management', 'serial_number') IS NULL
  ALTER TABLE dbo.ip_management ADD serial_number NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.ip_management', 'mac_address') IS NULL
  ALTER TABLE dbo.ip_management ADD mac_address VARCHAR(17) NULL;

IF OBJECT_ID('dbo.ip_management_history', 'U') IS NULL
  CREATE TABLE dbo.ip_management_history (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    ip_address     VARCHAR(45)   NOT NULL,
    action         VARCHAR(20)   NOT NULL,   -- 'update' | 'reserve' | 'release'
    changes        NVARCHAR(MAX) NOT NULL,   -- JSON: { field: { from, to } }
    changed_by     NVARCHAR(120) NULL,
    changed_at     VARCHAR(19)   NOT NULL
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ip_management_history_ip' AND object_id = OBJECT_ID('dbo.ip_management_history'))
  CREATE INDEX IX_ip_management_history_ip ON dbo.ip_management_history (ip_address, id DESC);
