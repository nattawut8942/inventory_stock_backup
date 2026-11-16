import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
    getProducts, updateProduct, deleteProduct,
    manualImport, withdrawProduct,
    getDeviceTypes, createDeviceType, updateDeviceType, deleteDeviceType,
    getForecast, uploadImage, getVendors ,checkFixedAssetCode
} from '../controllers/productController.js';
import { getEmployeeByCode } from '../controllers/employeeController.js';
import { upload } from '../config/multer.js';

const router = express.Router();

// Upload
router.post('/upload', uploadImage);
// Vendors
router.get('/vendors', getVendors);
router.get('/employees/:code', getEmployeeByCode);
// Products
router.get('/products', getProducts);
router.put('/products/:id', requirePerm('inventory', 'edit', { strict: true }), updateProduct);
router.delete('/products/:id', requirePerm('inventory', 'delete', { strict: true }), deleteProduct);
// Fixed Asset Code
router.get('/products/check-asset-code/:code', checkFixedAssetCode);
// Product Operations
router.post('/products/manual-import', requirePerm('manual-import', 'create', { strict: true }), manualImport);
router.post('/products/withdraw', withdrawProduct);

// Device Types
router.get('/types', getDeviceTypes);
router.post('/types', requirePerm('mgmt-device-types', 'create', { strict: true }), createDeviceType);
router.put('/types/:id', requirePerm('mgmt-device-types', 'edit', { strict: true }), updateDeviceType);
router.delete('/types/:id', requirePerm('mgmt-device-types', 'delete', { strict: true }), deleteDeviceType);

// Forecast
router.get('/forecast', getForecast);

export default router;
