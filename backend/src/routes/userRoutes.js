import express from 'express';
import { getAdminUsers, addAdminUser, updateAdminUser, deleteAdminUser } from '../controllers/userController.js';

const router = express.Router();

router.get('/admin-users', getAdminUsers);
router.post('/admin-users', addAdminUser);
router.put('/admin-users/:id', updateAdminUser);
router.delete('/admin-users/:username', deleteAdminUser);

export default router;
