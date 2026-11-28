-- Ink & Toner <-> Printer compatibility (many-to-many)
-- Prt_Code  = รหัสหมึกจาก DCI (SP_PartSock) เก็บเป็นข้อความ ไม่ทำ FK ข้ามฐาน
-- PrinterId = dbo.Printers (ฐานนี้เอง)
-- หมึกหนึ่งสเปคใช้ได้หลายเครื่อง และเครื่องหนึ่งใช้หมึกได้หลายสเปค
-- Remark    = เงื่อนไขการใช้งานของคู่นี้ (ไม่บังคับ) เช่น "ใช้ได้เฉพาะรุ่น DN" / "ต้องใช้ร่วมกับ drum X"

IF OBJECT_ID(N'dbo.Stock_InkTonerCompat', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stock_InkTonerCompat (
        Prt_Code   NVARCHAR(50)   NOT NULL,
        PrinterId  INT            NOT NULL,
        Remark     NVARCHAR(200)  NULL,
        CreatedAt  DATETIME       NOT NULL CONSTRAINT DF_InkTonerCompat_CreatedAt DEFAULT GETDATE(),
        CreatedBy  NVARCHAR(100)  NULL,
        CONSTRAINT PK_Stock_InkTonerCompat PRIMARY KEY (Prt_Code, PrinterId),
        CONSTRAINT FK_InkTonerCompat_Printer FOREIGN KEY (PrinterId)
            REFERENCES dbo.Printers (PrinterId) ON DELETE CASCADE
    );

    CREATE INDEX IX_InkTonerCompat_Printer ON dbo.Stock_InkTonerCompat (PrinterId);
END
GO
