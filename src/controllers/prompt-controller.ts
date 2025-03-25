// @ts-nocheck
import { Request, Response } from 'express';
import promptService from '../services/prompt-service.js';
import taskService from '../services/task-service.js';
import { TaskStatus } from '../models/task.js';
import logger from '../utils/logger.js';
import browserAgentService from '../services/browser-agent-service.js';

export const promptController = {
  /**
   * Procesa un prompt de navegación web y ejecuta acciones en el navegador
   * @param req Request con el prompt en el body
   * @param res Response con el resultado de la operación
   */
  async processPrompt(req, res) {
    try {
      const { prompt } = req.body;
      
      if (!prompt) {
        logger.warn('Intento de procesar prompt sin texto');
        return res.status(400).json({
          success: false,
          message: 'Se requiere un prompt en el cuerpo de la solicitud'
        });
      }
      
      logger.info(`Procesando prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

      // Crear una nueva tarea para este prompt
      const task = await taskService.createTask({
        type: 'web_navigation',
        prompt: prompt,
        status: 'pending'
      });
      
      // Iniciar procesamiento en segundo plano
      executeTaskInBackground(task, prompt);
      
      // Responder con el ID de la tarea para que el cliente pueda consultar el estado
      return res.status(202).json({
        success: true,
        message: 'Tarea iniciada, consulte el estado para obtener resultados',
        taskId: task.id
      });
    } catch (error) {
      logger.error(`Error al procesar prompt: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: `Error al procesar la solicitud: ${error.message}`
      });
    }
  },

  // Obtener templates predefinidos de prompts
  getPromptTemplates: (req: Request, res: Response) => {
    try {
      const templates = promptService.getPromptTemplates();
      return res.status(200).json(templates);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al obtener templates de prompts: ${errorMessage}`);
      return res.status(500).json({ 
        error: 'Error al obtener templates de prompts', 
        details: errorMessage 
      });
    }
  }
}; 

/**
 * Ejecuta la tarea en segundo plano
 * @param task Tarea a ejecutar
 * @param prompt Prompt a procesar
 */
async function executeTaskInBackground(task, prompt) {
  try {
    // Ejecutar la tarea de navegación web con el agente
    await browserAgentService.executeWebPrompt(task, prompt);
  } catch (error) {
    logger.error(`Error en ejecución de tarea en segundo plano: ${error.message}`);
    // El error ya se maneja dentro del servicio del agente
  }
} 