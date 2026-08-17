import express from 'express';
import {
    getAlbums, getHeroAlbums, getAlbumPhotos,
    createAlbum, updateAlbum, deleteAlbum, uploadActivityPhoto, deleteActivityPhoto, setFeaturedAlbum, setAlbumCover,
    getCategories, createCategory, updateCategory, deleteCategory,
    exportAlbumZip, exportAlbumPdf
} from '../controllers/activityController.js';

const router = express.Router();

// Categories (master data)
router.get('/activity-categories', getCategories);
router.post('/activity-categories', createCategory);
router.put('/activity-categories/:code', updateCategory);
router.delete('/activity-categories/:code', deleteCategory);

// Albums
router.get('/albums/hero', getHeroAlbums);
router.get('/albums', getAlbums);
router.get('/albums/:id/photos', getAlbumPhotos);
router.get('/albums/:id/export/zip', exportAlbumZip);
router.get('/albums/:id/export/pdf', exportAlbumPdf);
router.post('/albums', createAlbum);
router.put('/albums/:id', updateAlbum);
router.delete('/albums/:id', deleteAlbum);
router.patch('/albums/:id/feature', setFeaturedAlbum);
router.patch('/albums/:id/cover', setAlbumCover);

// Photos
router.post('/photos/upload', uploadActivityPhoto);
router.delete('/photos/:id', deleteActivityPhoto);

export default router;