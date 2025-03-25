// @ts-nocheck
import { Request, Response } from 'express';
import taskService from '../services/task-service.js';
import { CreateTaskDTO } from '../models/task.js';
import logger from '../utils/logger.js';

// Controlador para las rutas de la API
export const taskController = {
  // Listar todas las tareas
  getAllTasks: (req: Request, res: Response) => {
    try {
      logger.info('Solicitud para listar todas las tareas');
      const tasks = taskService.getAllTasks();
      return res.status(200).json(tasks);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al listar tareas: ${errorMessage}`);
      return res.status(500).json({ error: 'Error al obtener las tareas', details: errorMessage });
    }
  },

  // Obtener tarea por ID
  getTaskById: (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      logger.info(`Solicitud para obtener tarea con ID: ${taskId}`);
      
      const task = taskService.getTaskById(taskId);
      if (!task) {
        logger.warn(`Tarea con ID ${taskId} no encontrada`);
        return res.status(404).json({ error: 'Tarea no encontrada' });
      }
      
      return res.status(200).json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al obtener tarea: ${errorMessage}`);
      return res.status(500).json({ error: 'Error al obtener la tarea', details: errorMessage });
    }
  },

  // Obtener solo el estado de una tarea
  getTaskStatus: (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      logger.info(`Solicitud para obtener estado de tarea con ID: ${taskId}`);
      
      const task = taskService.getTaskById(taskId);
      if (!task) {
        logger.warn(`Tarea con ID ${taskId} no encontrada`);
        return res.status(404).json({ error: 'Tarea no encontrada' });
      }
      
      return res.status(200).json({
        id: task.id,
        status: task.status,
        progress: task.progress,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al obtener estado de tarea: ${errorMessage}`);
      return res.status(500).json({ error: 'Error al obtener el estado de la tarea', details: errorMessage });
    }
  },

  // Obtener resultado de una tarea
  getTaskResult: (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      console.log(`[DEBUG] Solicitud de resultado para tarea: ${taskId}`);
      logger.info(`Solicitud para obtener resultado de tarea con ID: ${taskId}`);
      
      const task = taskService.getTaskById(taskId);
      if (!task) {
        console.log(`[DEBUG] Tarea no encontrada: ${taskId}`);
        logger.warn(`Tarea con ID ${taskId} no encontrada`);
        return res.status(404).json({ error: 'Tarea no encontrada' });
      }
      
      console.log(`[DEBUG] Estado de la tarea: ${task.status}`);
      console.log(`[DEBUG] ¿Tiene resultado?: ${task.result ? 'Sí' : 'No'}`);
      
      if (!task.result && task.status !== 'completed') {
        console.log(`[DEBUG] Resultado no disponible para tarea: ${taskId}`);
        return res.status(400).json({ 
          error: 'Resultado no disponible', 
          details: `La tarea está en estado ${task.status} y no tiene resultado disponible`
        });
      }
      
      console.log(`[DEBUG] Devolviendo resultado para tarea: ${taskId}`);
      return res.status(200).json({
        id: task.id,
        status: task.status,
        result: task.result,
        completedAt: task.completedAt
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`[DEBUG] Error al obtener resultado: ${errorMessage}`);
      logger.error(`Error al obtener resultado de tarea: ${errorMessage}`);
      return res.status(500).json({ error: 'Error al obtener el resultado de la tarea', details: errorMessage });
    }
  },

  // Crear una nueva tarea
  createTask: (req: Request, res: Response) => {
    try {
      const taskData: CreateTaskDTO = req.body;
      
      if (!taskData.query) {
        logger.warn('Intento de crear tarea sin consulta');
        return res.status(400).json({ error: 'La consulta es obligatoria' });
      }
      
      logger.info(`Solicitud para crear tarea con consulta: ${taskData.query}`);
      const task = taskService.createTask(taskData);
      
      return res.status(201).json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al crear tarea: ${errorMessage}`);
      return res.status(500).json({ error: 'Error al crear la tarea', details: errorMessage });
    }
  },

  // Iniciar una tarea
  startTask: async (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      logger.info(`Solicitud para iniciar tarea con ID: ${taskId}`);
      
      const task = await taskService.startTask(taskId);
      if (!task) {
        logger.warn(`Tarea con ID ${taskId} no encontrada`);
        return res.status(404).json({ error: 'Tarea no encontrada' });
      }
      
      return res.status(200).json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al iniciar tarea: ${errorMessage}`);
      return res.status(500).json({ error: 'Error al iniciar la tarea', details: errorMessage });
    }
  },

  // Pausar una tarea
  pauseTask: (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      logger.info(`Solicitud para pausar tarea con ID: ${taskId}`);
      
      const task = taskService.pauseTask(taskId);
      if (!task) {
        logger.warn(`Tarea con ID ${taskId} no encontrada`);
        return res.status(404).json({ error: 'Tarea no encontrada' });
      }
      
      return res.status(200).json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al pausar tarea: ${errorMessage}`);
      return res.status(500).json({ error: 'Error al pausar la tarea', details: errorMessage });
    }
  },

  // Detener una tarea
  stopTask: (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      logger.info(`Solicitud para detener tarea con ID: ${taskId}`);
      
      const task = taskService.stopTask(taskId);
      if (!task) {
        logger.warn(`Tarea con ID ${taskId} no encontrada`);
        return res.status(404).json({ error: 'Tarea no encontrada' });
      }
      
      return res.status(200).json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al detener tarea: ${errorMessage}`);
      return res.status(500).json({ error: 'Error al detener la tarea', details: errorMessage });
    }
  },

  // Continuar una tarea pausada
  resumeTask: (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      logger.info(`Solicitud para continuar tarea con ID: ${taskId}`);
      
      const task = taskService.resumeTask(taskId);
      if (!task) {
        logger.warn(`Tarea con ID ${taskId} no encontrada`);
        return res.status(404).json({ error: 'Tarea no encontrada' });
      }
      
      return res.status(200).json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al continuar tarea: ${errorMessage}`);
      return res.status(500).json({ error: 'Error al continuar la tarea', details: errorMessage });
    }
  }
}; 