// @ts-nocheck
import express from 'express';
import { taskController } from '../controllers/task-controller.js';

const router = express.Router();

// Rutas para tareas
router.get('/', taskController.getAllTasks);
router.post('/', taskController.createTask);
router.get('/:id', taskController.getTaskById);
router.get('/:id/status', taskController.getTaskStatus);
router.get('/:id/result', taskController.getTaskResult);
router.post('/:id/start', taskController.startTask);
router.post('/:id/pause', taskController.pauseTask);
router.post('/:id/stop', taskController.stopTask);
router.post('/:id/resume', taskController.resumeTask);

// Añadir registros explícitos para depurar rutas
router.use((req, res, next) => {
  console.log(`[DEBUG] Ruta Task: ${req.method} ${req.url}`);
  next();
});

export default router; 