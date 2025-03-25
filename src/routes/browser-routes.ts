// @ts-nocheck
import express from 'express';
import { browserController } from '../controllers/browser-controller.js';

const router = express.Router();

// Rutas para navegación web
router.post('/tasks', browserController.createWebTask);
router.post('/tasks/:taskId/action', browserController.executeBrowserAction);

export default router; 