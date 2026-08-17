import express from 'express';
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
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);
// Fixed Asset Code
router.get('/products/check-asset-code/:code', checkFixedAssetCode);
// Product Operations
router.post('/products/manual-import', manualImport);
router.post('/products/withdraw', withdrawProduct);

// Device Types
router.get('/types', getDeviceTypes);
router.post('/types', createDeviceType);
router.put('/types/:id', updateDeviceType);
router.delete('/types/:id', deleteDeviceType);

// Forecast
router.get('/forecast', getForecast);

export default router;
