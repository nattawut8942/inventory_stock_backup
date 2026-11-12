-- IP Management: asset tag, location, contact person, purpose — idempotent
IF COL_LENGTH('dbo.ip_management', 'asset_tag') IS NULL
  ALTER TABLE dbo.ip_management ADD asset_tag NVARCHAR(50) NULL;
IF COL_LENGTH('dbo.ip_management', 'location') IS NULL
  ALTER TABLE dbo.ip_management ADD location NVARCHAR(150) NULL;
IF COL_LENGTH('dbo.ip_management', 'contact') IS NULL
  ALTER TABLE dbo.ip_management ADD contact NVARCHAR(120) NULL;
IF COL_LENGTH('dbo.ip_management', 'purpose') IS NULL
  ALTER TABLE dbo.ip_management ADD purpose NVARCHAR(50) NULL;
