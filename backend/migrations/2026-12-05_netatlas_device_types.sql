-- =====================================================
-- NetAtlas — ประเภทอุปกรณ์ (master) จัดการในหน้า Management
-- HasPorts   : ประเภทนี้มีพอร์ตให้เสียบอุปกรณ์ลูกหรือไม่ (ต้องกำหนดจำนวนพอร์ต)
-- CanBeParent: ประเภทนี้เป็นต้นทางให้อุปกรณ์อื่นต่อพ่วงได้หรือไม่
-- ColorKey / IconKey: ค่าที่ frontend แปลงเป็นสีและไอคอน (ค่าที่อนุญาตจำกัดไว้ในโค้ด)
-- Created: 2026-12-05
-- =====================================================

IF OBJECT_ID(N'dbo.NetAtlas_DeviceTypes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NetAtlas_DeviceTypes (
        Code        VARCHAR(10)    NOT NULL CONSTRAINT PK_NetAtlas_DeviceTypes PRIMARY KEY,
        Label       NVARCHAR(80)   NOT NULL,
        ShortLabel  NVARCHAR(10)   NOT NULL,
        ColorKey    VARCHAR(20)    NOT NULL,
        IconKey     VARCHAR(20)    NOT NULL,
        HasPorts    BIT            NOT NULL CONSTRAINT DF_NetAtlas_DT_HasPorts DEFAULT 0,
        CanBeParent BIT            NOT NULL CONSTRAINT DF_NetAtlas_DT_CanBeParent DEFAULT 0,
        SortOrder   INT            NOT NULL CONSTRAINT DF_NetAtlas_DT_Sort DEFAULT 0,
        IsActive    BIT            NOT NULL CONSTRAINT DF_NetAtlas_DT_Active DEFAULT 1,
        CreatedBy   NVARCHAR(100)  NULL,
        CreatedAt   DATETIME2      NOT NULL CONSTRAINT DF_NetAtlas_DT_Created DEFAULT SYSDATETIME(),
        UpdatedBy   NVARCHAR(100)  NULL,
        UpdatedAt   DATETIME2      NULL
    );
    PRINT 'Created NetAtlas_DeviceTypes';
END
GO

-- ข้อมูลเริ่มต้น (เพิ่มเฉพาะที่ยังไม่มี ไม่ทับค่าที่แก้ไขไว้แล้ว)
IF NOT EXISTS (SELECT 1 FROM dbo.NetAtlas_DeviceTypes WHERE Code = 'L2')
    INSERT INTO dbo.NetAtlas_DeviceTypes (Code, Label, ShortLabel, ColorKey, IconKey, HasPorts, CanBeParent, SortOrder)
    VALUES ('L2', N'Switch L2', N'L2', 'blue', 'server', 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NetAtlas_DeviceTypes WHERE Code = 'L1')
    INSERT INTO dbo.NetAtlas_DeviceTypes (Code, Label, ShortLabel, ColorKey, IconKey, HasPorts, CanBeParent, SortOrder)
    VALUES ('L1', N'Hub L1', N'L1', 'amber', 'share2', 1, 1, 2);
IF NOT EXISTS (SELECT 1 FROM dbo.NetAtlas_DeviceTypes WHERE Code = 'AP')
    INSERT INTO dbo.NetAtlas_DeviceTypes (Code, Label, ShortLabel, ColorKey, IconKey, HasPorts, CanBeParent, SortOrder)
    VALUES ('AP', N'Access Point', N'AP', 'purple', 'wifi', 0, 0, 3);
GO

-- เอาข้อจำกัดชนิดตายตัวออก ให้ค่าอ้างอิงตารางประเภทแทน
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_NetAtlas_Devices_Type')
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices DROP CONSTRAINT CK_NetAtlas_Devices_Type;
    PRINT 'Dropped CK_NetAtlas_Devices_Type';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_NetAtlas_Devices_DeviceType')
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD CONSTRAINT FK_NetAtlas_Devices_DeviceType
        FOREIGN KEY (DeviceType) REFERENCES dbo.NetAtlas_DeviceTypes(Code);
    PRINT 'Added FK_NetAtlas_Devices_DeviceType';
END
GO
