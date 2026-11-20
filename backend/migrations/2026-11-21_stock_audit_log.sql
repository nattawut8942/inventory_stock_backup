-- ประวัติการทำงาน (Audit log) ระดับ 1: บันทึกทุกคำขอที่เพิ่ม/แก้/ลบ ข้อมูล (POST/PUT/PATCH/DELETE) ที่มีผู้ใช้ login
-- ตารางใหม่ ไม่แตะตารางเดิม · รันซ้ำได้
-- รัน: node migrations/run-migration.mjs migrations/2026-11-21_stock_audit_log.sql

IF OBJECT_ID('dbo.Stock_AuditLog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stock_AuditLog (
        AuditID     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Stock_AuditLog PRIMARY KEY,
        CreatedAt   DATETIME2(0)   NOT NULL CONSTRAINT DF_Stock_AuditLog_CreatedAt DEFAULT (SYSDATETIME()),
        EmpCode     NVARCHAR(20)   NULL,
        Username    NVARCHAR(100)  NULL,
        DisplayName NVARCHAR(200)  NULL,
        Method      VARCHAR(10)    NOT NULL,      -- POST / PUT / PATCH / DELETE
        Action      VARCHAR(20)    NOT NULL,      -- create / update / delete / action
        Module      NVARCHAR(60)   NULL,          -- ส่วนแรกของ path หลัง /api เช่น products, vendors
        Path        NVARCHAR(400)  NOT NULL,
        RecordId    NVARCHAR(100)  NULL,
        Summary     NVARCHAR(400)  NULL,          -- ชื่อรายการที่อ่านได้จากข้อมูลที่ส่งมา (ถ้ามี)
        StatusCode  SMALLINT       NULL,
        Success     BIT            NOT NULL,
        DurationMs  INT            NULL,
        IpAddress   NVARCHAR(64)   NULL,
        Body        NVARCHAR(MAX)  NULL           -- ข้อมูลที่ส่งมา (ปิดบังรหัสผ่าน/token, ตัดข้อความยาว, ไฟล์เก็บแค่ชื่อ)
    );
    CREATE INDEX IX_Stock_AuditLog_CreatedAt ON dbo.Stock_AuditLog (CreatedAt DESC);
    CREATE INDEX IX_Stock_AuditLog_EmpCode   ON dbo.Stock_AuditLog (EmpCode, CreatedAt DESC);
    CREATE INDEX IX_Stock_AuditLog_Module    ON dbo.Stock_AuditLog (Module, CreatedAt DESC);
END
GO

-- Rollback:
-- DROP TABLE dbo.Stock_AuditLog;
