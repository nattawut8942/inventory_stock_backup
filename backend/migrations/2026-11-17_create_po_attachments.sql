-- Migration: ไฟล์แนบของ PO (ใบสั่งซื้อ) - idempotent (รันซ้ำได้)
USE [dbInfrastructure];
GO

IF OBJECT_ID('dbo.Stock_PO_Attachments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stock_PO_Attachments (
        AttachmentID INT IDENTITY(1,1) PRIMARY KEY,
        PO_ID        NVARCHAR(50)  NOT NULL,
        FileName     NVARCHAR(255) NOT NULL,  -- ชื่อไฟล์ต้นฉบับ (แสดงให้ผู้ใช้)
        StoredName   NVARCHAR(255) NOT NULL,  -- ชื่อที่เก็บบนเซิร์ฟเวอร์ (สุ่มเอง ไม่ใช่ input ผู้ใช้)
        MimeType     NVARCHAR(100) NULL,
        FileSize     INT           NULL,
        UploadedBy   NVARCHAR(50)  NULL,
        UploadedAt   DATETIME      NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_Stock_PO_Attachments_PO ON dbo.Stock_PO_Attachments(PO_ID);
    PRINT 'Stock_PO_Attachments created.';
END
GO
