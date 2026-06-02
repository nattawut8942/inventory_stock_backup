// ============================================================
//  calendarRoutes.js
//  Mount in server.js: app.use('/ITinventory/api', calendarRoutes);
// ============================================================
import express from 'express';
import {
    getTasks,
    getTaskById,
    getTaskTypes,
    createTask,
    updateTask,
    deleteTask,
    getUpcoming,
} from '../controllers/calendarController.js';

const router = express.Router();

// Lookup
router.get('/calendar/task-types',  getTaskTypes);

// Upcoming sidebar
router.get('/calendar/upcoming',    getUpcoming);

// CRUD — ลำดับสำคัญ: specific routes ต้องอยู่ก่อน /:id
router.get('/calendar/tasks',       getTasks);
router.post('/calendar/tasks',      createTask);
router.get('/calendar/tasks/:id',   getTaskById);
router.put('/calendar/tasks/:id',   updateTask);
router.delete('/calendar/tasks/:id', deleteTask);

export default router;

// ============================================================
//  เพิ่มใน server.js:
//
//  import calendarRoutes from './src/routes/calendarRoutes.js';
//  app.use('/ITinventory/api', calendarRoutes);
// ============================================================