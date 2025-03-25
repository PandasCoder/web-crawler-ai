// @ts-nocheck
import express from 'express';
import { promptController } from '../controllers/prompt-controller.js';

const router = express.Router();

// Rutas para procesamiento de prompts
router.post('/', promptController.processPrompt);
router.get('/templates', promptController.getPromptTemplates);

export default router; 