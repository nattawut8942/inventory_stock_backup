-- รูปหน้างานที่ติดตั้งจริงของเครื่องพรินเตอร์ (แสดงเฉพาะในหน้ารายละเอียดเครื่อง)
IF COL_LENGTH(N'dbo.Printers', N'SitePhotoFile') IS NULL
BEGIN
    ALTER TABLE dbo.Printers ADD SitePhotoFile NVARCHAR(260) NULL;
END
