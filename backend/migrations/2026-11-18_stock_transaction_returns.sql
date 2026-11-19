-- คืนของ (ยกเลิกการเบิกที่ผิด/คืนอุปกรณ์) — idempotent
-- ReturnedAt / ReturnedBy : บนแถว OUT ที่ถูกคืนแล้ว (กันคืนซ้ำ)
-- ReturnOf                : บนแถว IN ที่สร้างจากการคืน ชี้กลับไปยัง TransID ของแถว OUT เดิม
IF COL_LENGTH('dbo.Stock_Transactions', 'ReturnedAt') IS NULL
  ALTER TABLE dbo.Stock_Transactions ADD ReturnedAt DATETIME NULL;

IF COL_LENGTH('dbo.Stock_Transactions', 'ReturnedBy') IS NULL
  ALTER TABLE dbo.Stock_Transactions ADD ReturnedBy NVARCHAR(50) NULL;

IF COL_LENGTH('dbo.Stock_Transactions', 'ReturnOf') IS NULL
  ALTER TABLE dbo.Stock_Transactions ADD ReturnOf INT NULL;
