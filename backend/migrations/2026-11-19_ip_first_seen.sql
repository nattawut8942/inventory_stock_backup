-- IP Management: บันทึกวันที่เห็น IP นี้ online ครั้งแรก (ใช้แจ้งเตือน "IP ใหม่โผล่บนเครือข่าย")
-- แถวที่เคย online มาก่อนรัน migration นี้ถูกตั้งเป็น 2000-01-01 (ไม่นับเป็น IP ใหม่)
IF COL_LENGTH('dbo.ip_management', 'first_seen_active') IS NULL
    ALTER TABLE dbo.ip_management ADD first_seen_active DATETIME NULL;
GO
UPDATE dbo.ip_management SET first_seen_active = '2000-01-01'
WHERE first_seen_active IS NULL AND last_seen_active IS NOT NULL;
GO
