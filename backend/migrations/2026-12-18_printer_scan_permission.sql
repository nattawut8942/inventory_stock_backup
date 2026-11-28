-- สิทธิ์ใหม่: printer-health:scan (ดึงข้อมูลจากเครื่อง รายเครื่องและทั้งหมด)
-- ให้ผู้ที่มีสิทธิ์ดู Printer Health (view) ได้สิทธิ์สแกนด้วย เพื่อไม่ให้การใช้งานเดิมหาย
-- ผู้ดูแล (Admin) ได้สิทธิ์ทั้งหมดอยู่แล้วจากโค้ด จึงไม่ต้องเพิ่มที่นี่

IF OBJECT_ID(N'dbo.Stock_PagePermissions', N'U') IS NOT NULL
BEGIN
    INSERT INTO dbo.Stock_PagePermissions (EmpCode, PageKey, Action, GrantedBy)
    SELECT p.EmpCode, 'printer-health', 'scan', 'migration 2026-12-18'
    FROM dbo.Stock_PagePermissions p
    WHERE p.PageKey = 'printer-health' AND p.Action = 'view'
      AND NOT EXISTS (
          SELECT 1 FROM dbo.Stock_PagePermissions x
          WHERE x.EmpCode = p.EmpCode AND x.PageKey = 'printer-health' AND x.Action = 'scan'
      );
END

IF OBJECT_ID(N'dbo.Stock_PermissionDefaults', N'U') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.Stock_PermissionDefaults WHERE PageKey = 'printer-health' AND Action = 'view')
   AND NOT EXISTS (SELECT 1 FROM dbo.Stock_PermissionDefaults WHERE PageKey = 'printer-health' AND Action = 'scan')
BEGIN
    INSERT INTO dbo.Stock_PermissionDefaults (PageKey, Action) VALUES ('printer-health', 'scan');
END
