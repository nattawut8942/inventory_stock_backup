-- IP Management: ประเภท IP (Static/DHCP), ตารางสแนปชอตรายวันต่อ subnet — idempotent
IF COL_LENGTH('dbo.ip_management', 'ip_type') IS NULL
  ALTER TABLE dbo.ip_management ADD ip_type NVARCHAR(10) NULL;

IF OBJECT_ID('dbo.ip_subnet_snapshot', 'U') IS NULL
  CREATE TABLE dbo.ip_subnet_snapshot (
    id        INT IDENTITY(1,1) PRIMARY KEY,
    subnet    VARCHAR(20) NOT NULL,
    taken_at  VARCHAR(19) NOT NULL,
    total     INT NOT NULL,
    online    INT NOT NULL,
    reserved  INT NOT NULL,
    inactive  INT NOT NULL
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ip_subnet_snapshot_subnet' AND object_id = OBJECT_ID('dbo.ip_subnet_snapshot'))
  CREATE INDEX IX_ip_subnet_snapshot_subnet ON dbo.ip_subnet_snapshot (subnet, taken_at);
