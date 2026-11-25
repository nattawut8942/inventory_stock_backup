-- =====================================================
-- IT Asset Disposal - เพิ่มขั้นที่ 6 "ทำทิ้งแล้ว"
-- รอบที่ทำเป็นเสร็จสิ้นแล้ว (CompletedAt มีค่า) ย้ายไปขั้นที่ 6
-- Created: 2026-12-02
-- =====================================================

UPDATE dbo.Disposal_Runs
SET Stage = 6
WHERE CompletedAt IS NOT NULL AND Stage <> 6;
GO
