-- CCTV: ประวัติการเปลี่ยนสถานะกล้อง (บันทึกเฉพาะตอนสถานะเปลี่ยน ไม่ใช่ทุกครั้งที่ ping) — idempotent
IF OBJECT_ID('dbo.cctv_status_events', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.cctv_status_events (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        camera_id   INT           NOT NULL,
        status      NVARCHAR(20)  NOT NULL,
        prev_status NVARCHAR(20)  NULL,
        source      NVARCHAR(20)  NOT NULL DEFAULT 'ping',   -- 'ping' | 'manual'
        changed_at  DATETIME      NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_cctv_status_events_cam ON dbo.cctv_status_events (camera_id, changed_at);
END
