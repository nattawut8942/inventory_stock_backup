-- รูปเครื่องพรินเตอร์ (เก็บชื่อไฟล์ใน backend/uploads/printers)
IF COL_LENGTH(N'dbo.Printers', N'PhotoFile') IS NULL
BEGIN
    ALTER TABLE dbo.Printers ADD PhotoFile NVARCHAR(260) NULL;
END
