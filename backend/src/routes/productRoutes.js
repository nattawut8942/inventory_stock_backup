import express from 'express';
import {
    getProducts, updateProduct, deleteProduct,
    manualImport, withdrawProduct,
    getDeviceTypes, createDeviceType, updateDeviceType, deleteDeviceType,
    getForecast, uploadImage, getVendors
} from '../controllers/productController.js';
import { upload } from '../config/multer.js';

const router = express.Router();

// Upload
router.post('/upload', upload.single('image'), uploadImage);
// Vendors
router.get('/vendors', getVendors);
// Products
router.get('/products', getProducts);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

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
