-- =====================================================
-- IT Asset Disposal - ไฟล์แนบของรอบ (Disposal_Attachments)
-- เช่น ไฟล์ PDF ที่ บช. ดำเนินการทิ้งเสร็จแล้ว เป็นหลักฐาน
-- Created: 2026-11-25
-- =====================================================

IF OBJECT_ID(N'dbo.Disposal_Attachments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Disposal_Attachments (
        AttachmentID    INT IDENTITY(1,1) PRIMARY KEY,
        RunID           INT NOT NULL FOREIGN KEY REFERENCES dbo.Disposal_Runs(RunID),
        DocType         NVARCHAR(50)  NOT NULL,   -- ประเภทเอกสาร เช่น ACCOUNTING_DONE / APPROVAL / OTHER
        Title           NVARCHAR(200) NULL,       -- ชื่อ/คำอธิบายที่ผู้ใช้กรอก
        FileName        NVARCHAR(260) NOT NULL,   -- ชื่อไฟล์ตอนอัปโหลด (แสดงผล)
        StoredName      NVARCHAR(260) NOT NULL,   -- ชื่อไฟล์บนดิสก์ (ไม่ซ้ำ)
        FileSize        INT           NOT NULL,
        UploadedBy      NVARCHAR(100) NULL,
        UploadedByName  NVARCHAR(150) NULL,
        UploadedAt      DATETIME      NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Created table: Disposal_Attachments';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Disposal_Attachments_Run')
    CREATE INDEX IX_Disposal_Attachments_Run ON dbo.Disposal_Attachments(RunID, UploadedAt);
GO
