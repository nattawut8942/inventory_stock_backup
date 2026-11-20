-- Sound Engineering: สถานะการใช้งานของอุปกรณ์ (แยกจาก ping/http)
-- active = ใช้งานอยู่, removed = ถอดชั่วคราว, repair = ส่งซ่อม, retired = ยกเลิกใช้งาน
-- อุปกรณ์ที่ไม่ใช่ active จะไม่ถูก ping อัตโนมัติ และไม่นับใน badge Offline ของ Sidebar
-- หมายเหตุ: ตารางอยู่ใน Sound DB (SOUND_DB_NAME) — server สร้างคอลัมน์ให้เองตอนเริ่ม (ensureSoundSchema)
IF COL_LENGTH('dbo.sound_devices', 'usage_status') IS NULL
    ALTER TABLE dbo.sound_devices ADD usage_status NVARCHAR(20) NOT NULL CONSTRAINT DF_sound_devices_usage_status DEFAULT 'active';
GO
IF COL_LENGTH('dbo.sound_devices', 'usage_note') IS NULL
    ALTER TABLE dbo.sound_devices ADD usage_note NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.sound_devices', 'usage_changed_at') IS NULL
    ALTER TABLE dbo.sound_devices ADD usage_changed_at DATETIME NULL;
GO
