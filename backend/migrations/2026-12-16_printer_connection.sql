-- ประเภทการเชื่อมต่อของเครื่องพรินเตอร์: ethernet (ค่าเริ่มต้น) หรือ usb
-- UsbHost = ชื่อคอมพิวเตอร์ที่เครื่องพรินเตอร์ต่อ USB อยู่ (ใช้เมื่อ ConnectionType = 'usb')
IF COL_LENGTH(N'dbo.Printers', N'ConnectionType') IS NULL
BEGIN
    ALTER TABLE dbo.Printers ADD ConnectionType NVARCHAR(10) NOT NULL
        CONSTRAINT DF_Printers_ConnectionType DEFAULT 'ethernet';
END

IF COL_LENGTH(N'dbo.Printers', N'UsbHost') IS NULL
BEGIN
    ALTER TABLE dbo.Printers ADD UsbHost NVARCHAR(100) NULL;
END
