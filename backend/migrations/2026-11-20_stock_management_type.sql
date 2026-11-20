-- ประเภทการจัดการสต็อก (แยกจากหมวด DeviceType)
--   Rotating = สต็อกหมุนเวียน (ใช้ประจำ ต้องสั่งเพิ่ม) — ค่าเริ่มต้น ทำงานเหมือนเดิมทุกอย่าง
--   Spare    = Spare part (สำรองไว้เผื่อเสีย เตือนเมื่อต่ำกว่า Min แต่ไม่คาดการณ์/ไม่นับ Dead stock)
--   Stored   = ของเก็บในคลัง (ไม่มีแผนสั่ง ไม่เตือน ไม่อยู่ในรายการสั่งซื้อ)
--
-- ปลอดภัยต่อการรันซ้ำ (เช็ค COL_LENGTH / constraint ก่อน)
-- สินค้าเดิมทุกชิ้นจะได้ค่า 'Rotating' จาก DEFAULT จึงไม่มีพฤติกรรมเปลี่ยนจนกว่าจะเปลี่ยนค่าเอง
--
-- ⚠️ DB นี้ใช้ร่วมกับ dciweb: การเพิ่มคอลัมน์ NOT NULL + DEFAULT ไม่กระทบ query ที่ระบุชื่อคอลัมน์
--    แต่ถ้ามีที่ไหนใช้ INSERT INTO dbo.Stock_Products VALUES (...) โดยไม่ระบุชื่อคอลัมน์ จะ error
--    ให้ตรวจฝั่ง dciweb ก่อนรัน

-- 1) สินค้า: ประเภทการจัดการรายชิ้น
IF COL_LENGTH('dbo.Stock_Products', 'ManagementType') IS NULL
    ALTER TABLE dbo.Stock_Products ADD ManagementType VARCHAR(20) NOT NULL
        CONSTRAINT DF_Stock_Products_ManagementType DEFAULT 'Rotating';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Stock_Products_ManagementType')
    ALTER TABLE dbo.Stock_Products ADD CONSTRAINT CK_Stock_Products_ManagementType
        CHECK (ManagementType IN ('Rotating', 'Spare', 'Stored'));
GO

-- 2) หมวด: ค่าเริ่มต้นของสินค้าใหม่ในหมวดนี้ (NULL = Rotating)
IF COL_LENGTH('dbo.Stock_DeviceTypes', 'DefaultManagementType') IS NULL
    ALTER TABLE dbo.Stock_DeviceTypes ADD DefaultManagementType VARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Stock_DeviceTypes_DefaultManagementType')
    ALTER TABLE dbo.Stock_DeviceTypes ADD CONSTRAINT CK_Stock_DeviceTypes_DefaultManagementType
        CHECK (DefaultManagementType IS NULL OR DefaultManagementType IN ('Rotating', 'Spare', 'Stored'));
GO

-- ย้อนกลับ (ถ้าจำเป็น):
-- ALTER TABLE dbo.Stock_Products DROP CONSTRAINT CK_Stock_Products_ManagementType;
-- ALTER TABLE dbo.Stock_Products DROP CONSTRAINT DF_Stock_Products_ManagementType;
-- ALTER TABLE dbo.Stock_Products DROP COLUMN ManagementType;
-- ALTER TABLE dbo.Stock_DeviceTypes DROP CONSTRAINT CK_Stock_DeviceTypes_DefaultManagementType;
-- ALTER TABLE dbo.Stock_DeviceTypes DROP COLUMN DefaultManagementType;
