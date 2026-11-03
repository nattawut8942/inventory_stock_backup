-- =====================================================
-- Plug Check: optional small plug photo per check point
-- (falls back to the standard's image when empty)
-- =====================================================

IF COL_LENGTH('dbo.Stock_PlugPoints', 'ImageUrl') IS NULL
BEGIN
    ALTER TABLE dbo.Stock_PlugPoints ADD ImageUrl NVARCHAR(500) NULL;
    PRINT 'Added Stock_PlugPoints.ImageUrl';
END
GO

IF COL_LENGTH('dbo.Stock_PlugSheetPoints', 'ImageUrl') IS NULL
BEGIN
    ALTER TABLE dbo.Stock_PlugSheetPoints ADD ImageUrl NVARCHAR(500) NULL;
    PRINT 'Added Stock_PlugSheetPoints.ImageUrl';
END
GO
