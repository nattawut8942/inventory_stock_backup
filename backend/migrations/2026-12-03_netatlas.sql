-- =====================================================
-- NetAtlas (Network Map) — ผังเครือข่ายและอุปกรณ์ (แยกจากผังอื่นทั้งหมด)
-- Layouts = ผัง/ชั้น/ห้อง (จัดการใน Management)
-- Devices = อุปกรณ์ L2/L1/AP แต่ละตัว วางบนผังและเชื่อม uplink กับ parent
-- อนาคต: เพิ่มการเชื่อมต่อ PC → Switch → Hub ได้ โดยไม่ต้องแก้โครงสร้างหลัก
-- Created: 2026-12-03
-- =====================================================

IF OBJECT_ID(N'dbo.NetAtlas_Layouts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NetAtlas_Layouts (
        LayoutID      INT IDENTITY(1,1) PRIMARY KEY,
        Name          NVARCHAR(120)  NOT NULL,
        FloorplanFile NVARCHAR(260)  NULL,      -- ชื่อไฟล์ใน backend/uploads/netatlas (ไม่เก็บ base64)
        SortOrder     INT            NOT NULL CONSTRAINT DF_NetAtlas_Layouts_Sort DEFAULT 0,
        CreatedBy     NVARCHAR(100)  NULL,
        CreatedAt     DATETIME2      NOT NULL CONSTRAINT DF_NetAtlas_Layouts_Created DEFAULT SYSDATETIME(),
        UpdatedBy     NVARCHAR(100)  NULL,
        UpdatedAt     DATETIME2      NULL
    );
    PRINT 'Created NetAtlas_Layouts';
END
GO

IF OBJECT_ID(N'dbo.NetAtlas_Devices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NetAtlas_Devices (
        DeviceID        INT IDENTITY(1,1) PRIMARY KEY,
        LayoutID        INT            NOT NULL CONSTRAINT FK_NetAtlas_Devices_Layout REFERENCES dbo.NetAtlas_Layouts(LayoutID),
        Name            NVARCHAR(120)  NOT NULL,
        DeviceType      VARCHAR(10)    NOT NULL CONSTRAINT CK_NetAtlas_Devices_Type CHECK (DeviceType IN ('L2','L1','AP')),
        Model           NVARCHAR(200)  NULL,
        IpAddress       NVARCHAR(45)   NOT NULL CONSTRAINT DF_NetAtlas_Devices_Ip DEFAULT 'N/A',
        Location        NVARCHAR(200)  NOT NULL,
        Note            NVARCHAR(500)  NULL,
        UplinkDeviceID  INT            NULL,   -- parent (อุปกรณ์ต้นทาง) ใน layout เดียวกัน; NULL = Core
        UplinkFromPort  NVARCHAR(50)   NULL,
        UplinkToPort    NVARCHAR(50)   NULL,
        PosX            DECIMAL(5,2)   NOT NULL CONSTRAINT DF_NetAtlas_Devices_X DEFAULT 50,   -- % ของความกว้างผัง
        PosY            DECIMAL(5,2)   NOT NULL CONSTRAINT DF_NetAtlas_Devices_Y DEFAULT 50,   -- % ของความสูงผัง
        CreatedBy       NVARCHAR(100)  NULL,
        CreatedAt       DATETIME2      NOT NULL CONSTRAINT DF_NetAtlas_Devices_Created DEFAULT SYSDATETIME(),
        UpdatedBy       NVARCHAR(100)  NULL,
        UpdatedAt       DATETIME2      NULL,
        -- ไม่ใช้ ON DELETE CASCADE ที่ FK ตัวเอง (SQL Server ไม่อนุญาต cycle) — ล้าง uplink ของลูกใน service แทน
        CONSTRAINT FK_NetAtlas_Devices_Uplink FOREIGN KEY (UplinkDeviceID) REFERENCES dbo.NetAtlas_Devices(DeviceID)
    );
    CREATE INDEX IX_NetAtlas_Devices_Layout ON dbo.NetAtlas_Devices(LayoutID);
    CREATE INDEX IX_NetAtlas_Devices_Uplink ON dbo.NetAtlas_Devices(UplinkDeviceID);
    PRINT 'Created NetAtlas_Devices';
END
GO
