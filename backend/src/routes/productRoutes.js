import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
    getProducts, updateProduct, deleteProduct,
    manualImport, withdrawProduct, returnWithdrawal,
    getDeviceTypes, createDeviceType, updateDeviceType, deleteDeviceType,
    getForecast, uploadImage, getVendors ,checkFixedAssetCode, adjustProductStock } from '../controllers/productController.js';
import { getStockReport, getStockMovementReport, getStockAnalysisReport, getStockProcurementReport, getStockCountQualityReport } from '../controllers/stockReportController.js';
import { getEmployeeByCode } from '../controllers/employeeController.js';
import { upload } from '../config/multer.js';

const router = express.Router();

// Upload
router.post('/upload', requirePerm('inventory', 'edit'), uploadImage);
// Vendors
router.get('/vendors', getVendors);
router.get('/employees/:code', getEmployeeByCode);
// Products
router.get('/products', getProducts);
router.put('/products/:id', requirePerm('inventory', 'edit', { strict: true }), updateProduct);
router.delete('/products/:id', requirePerm('inventory', 'delete', { strict: true }), deleteProduct);
// Fixed Asset Code
router.get('/products/check-asset-code/:code', checkFixedAssetCode);
// Stock Report (Phase 1: ภาพรวมและมูลค่าคงคลัง)
router.get('/stock/report', requirePerm('inventory', 'view'), getStockReport);
router.get('/stock/report/movement', requirePerm('inventory', 'view'), getStockMovementReport);
router.get('/stock/report/analysis', requirePerm('inventory', 'view'), getStockAnalysisReport);
router.get('/stock/report/procurement', requirePerm('inventory', 'view'), getStockProcurementReport);
router.get('/stock/report/count-quality', requirePerm('inventory', 'view'), getStockCountQualityReport);
// Product Operations
router.post('/products/manual-import', requirePerm('manual-import', 'create', { strict: true }), manualImport);
router.post('/products/withdraw', requirePerm('inventory', 'withdraw'), withdrawProduct);
router.post('/products/:id/adjust', requirePerm('stock-count', 'adjust'), adjustProductStock);
router.post('/products/return', requirePerm('inventory', 'return'), returnWithdrawal);

// Device Types
router.get('/types', getDeviceTypes);
router.post('/types', requirePerm('mgmt-device-types', 'create', { strict: true }), createDeviceType);
router.put('/types/:id', requirePerm('mgmt-device-types', 'edit', { strict: true }), updateDeviceType);
router.delete('/types/:id', requirePerm('mgmt-device-types', 'delete', { strict: true }), deleteDeviceType);

// Forecast
router.get('/forecast', getForecast);

export default router;
