import express from 'express';
import { login } from '../controllers/authController.js';


const router = express.Router();

// Allow both POST (App) and GET (Browser test)
router.all('/authen', login);

export default router;
