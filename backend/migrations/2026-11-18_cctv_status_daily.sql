-- CCTV: สรุปผล ping รายวันต่อกล้อง (ใช้คำนวณ uptime % และกราฟ 14 วัน) — idempotent
-- 1 แถว = 1 กล้อง 1 วัน: online_count = จำนวนครั้งที่ตอบสนอง, total_count = จำนวนครั้งที่ ping ทั้งหมด
IF OBJECT_ID('dbo.cctv_status_daily', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.cctv_status_daily (
        camera_id    INT  NOT NULL,
        [day]        DATE NOT NULL,
        online_count INT  NOT NULL DEFAULT 0,
        total_count  INT  NOT NULL DEFAULT 0,
        CONSTRAINT PK_cctv_status_daily PRIMARY KEY (camera_id, [day])
    );
END
