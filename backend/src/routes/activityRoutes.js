import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
    getAlbums, getHeroAlbums, getAlbumPhotos,
    createAlbum, updateAlbum, deleteAlbum, uploadActivityPhoto, deleteActivityPhoto, setFeaturedAlbum, setAlbumCover,
    getCategories, createCategory, updateCategory, deleteCategory,
    exportAlbumZip, exportAlbumPdf
} from '../controllers/activityController.js';

const router = express.Router();

// Categories (master data)
router.get('/activity-categories', getCategories);
router.post('/activity-categories', requirePerm('mgmt-activity-categories', 'create', { strict: true }), createCategory);
router.put('/activity-categories/:code', requirePerm('mgmt-activity-categories', 'edit', { strict: true }), updateCategory);
router.delete('/activity-categories/:code', requirePerm('mgmt-activity-categories', 'delete', { strict: true }), deleteCategory);

// Albums
router.get('/albums/hero', getHeroAlbums);
router.get('/albums', getAlbums);
router.get('/albums/:id/photos', getAlbumPhotos);
router.get('/albums/:id/export/zip', exportAlbumZip);
router.get('/albums/:id/export/pdf', exportAlbumPdf);
router.post('/albums', createAlbum);
router.put('/albums/:id', requirePerm('activity', 'edit', { strict: true }), updateAlbum);
router.delete('/albums/:id', requirePerm('activity', 'delete', { strict: true }), deleteAlbum);
router.patch('/albums/:id/feature', setFeaturedAlbum);
router.patch('/albums/:id/cover', requirePerm('activity', 'edit', { strict: true }), setAlbumCover);

// Photos
router.post('/photos/upload', uploadActivityPhoto);
router.delete('/photos/:id', requirePerm('activity', 'delete', { strict: true }), deleteActivityPhoto);

export default router;