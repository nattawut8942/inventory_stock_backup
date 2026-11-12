-- IP Management: คอลัมน์ device (ประเภทอุปกรณ์) — idempotent
IF COL_LENGTH('dbo.ip_management', 'device') IS NULL
  ALTER TABLE dbo.ip_management ADD device NVARCHAR(50) NULL;
