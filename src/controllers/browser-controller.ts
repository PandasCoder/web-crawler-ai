// @ts-nocheck
import { Request, Response } from 'express';
import browserAgentService from '../services/browser-agent-service.js';
import taskService from '../services/task-service.js';
import logger from '../utils/logger.js';

export const browserController = {
  // Ejecutar una acción en el navegador para una tarea existente
  executeBrowserAction: async (req: Request, res: Response) => {
    try {
      const taskId = req.params.taskId;
      const { action, params } = req.body;
      
      if (!taskId) {
        logger.warn('ID de tarea no proporcionado para acción de navegador');
        return res.status(400).json({ error: 'El ID de tarea es obligatorio' });
      }
      
      if (!action) {
        logger.warn('Acción no proporcionada para el navegador');
        return res.status(400).json({ error: 'La acción es obligatoria' });
      }
      
      logger.info(`Solicitud de acción de navegador: ${action} para tarea ${taskId}`);
      
      const result = await browserAgentService.executeBrowserAction(taskId, action, params || {});
      
      return res.status(200).json({ 
        taskId,
        action,
        result
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al ejecutar acción de navegador: ${errorMessage}`, { error });
      return res.status(500).json({ 
        error: 'Error al ejecutar acción de navegador', 
        details: errorMessage 
      });
    }
  },
  
  // Crear una nueva tarea específica de navegación web
  createWebTask: async (req: Request, res: Response) => {
    try {
      const { url, prompt } = req.body;
      
      if (!url && !prompt) {
        logger.warn('URL o prompt no proporcionados para tarea web');
        return res.status(400).json({ error: 'La URL o el prompt son obligatorios' });
      }
      
      const taskData = {
        query: url || prompt,
        description: prompt || `Navegar a ${url}`,
        priority: 5
      };
      
      logger.info(`Creando tarea web para: ${taskData.query}`);
      const task = taskService.createTask(taskData);
      
      // Iniciar tarea en background
      await taskService.startTask(task.id);
      
      return res.status(201).json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al crear tarea web: ${errorMessage}`, { error });
      return res.status(500).json({ 
        error: 'Error al crear tarea web', 
        details: errorMessage 
      });
    }
  }
}; 