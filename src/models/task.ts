import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

// Posibles estados de una tarea
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STOPPED = 'stopped'
}

export enum TaskType {
  ANALYSIS = 'analysis',
  EXTRACTION = 'extraction',
  CUSTOMIZATION = 'customization'
}

// Interfaz para la interpretación del prompt
export interface PromptInterpretation {
  action: string;
  target: string;
  confidence: number;
  originalPrompt: string;
}

// Interfaz para crear una nueva tarea
export interface CreateTaskDTO {
  query: string;
  description?: string;
  priority?: number;
  type?: TaskType;
  prompt?: string;
  interpretation?: any;
}

// Modelo completo de una tarea
export class Task {
  id: string;
  query: string;
  description: string;
  priority: number;
  type: TaskType;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  progress: number;
  logs: Array<{timestamp: Date, message: string}>;
  error: string | null;
  result: string | null;
  prompt: string | null;
  interpretation: any | null;
  isWebTask: boolean;
  state: Map<string, any>;

  constructor(data: CreateTaskDTO) {
    this.id = uuidv4();
    this.query = data.query;
    this.description = data.description || data.query;
    this.priority = data.priority || 5;
    this.type = data.type || TaskType.EXTRACTION;
    this.status = TaskStatus.PENDING;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.progress = 0;
    this.logs = [];
    this.error = null;
    this.result = null;
    this.prompt = data.prompt || null;
    this.interpretation = data.interpretation || null;
    this.isWebTask = false;
    this.state = new Map();
    
    this.addLog(`Tarea creada: ${this.description}`);
    logger.info(`Tarea creada: ${this.id} - ${this.description}`);
  }

  // Método para agregar entradas al log de la tarea
  addLog(message: string): void {
    const logEntry = { timestamp: new Date(), message };
    this.logs.push(logEntry);
    logger.debug(`[Tarea ${this.id}] ${message}`);
  }

  // Método para actualizar el estado de la tarea
  updateStatus(status: TaskStatus): void {
    this.status = status;
    this.updatedAt = new Date();
    this.addLog(`Estado actualizado a: ${status}`);
  }

  // Método para actualizar el progreso
  updateProgress(progress: number): void {
    // Limitar el progreso entre 0 y 100
    this.progress = Math.max(0, Math.min(100, progress));
    this.updatedAt = new Date();
  }

  // Método para establecer el resultado
  setResult(result: string): void {
    this.result = result;
    this.updatedAt = new Date();
    this.addLog('Resultado establecido');
  }

  // Método para establecer un error
  setError(error: string): void {
    this.error = error;
    this.updatedAt = new Date();
    this.addLog(`Error: ${error}`);
    logger.error(`Error en tarea ${this.id}: ${error}`);
  }

  // Guardar estado en la tarea
  setState(key: string, value: any): void {
    this.state.set(key, value);
    this.updatedAt = new Date();
    this.addLog(`Estado '${key}' actualizado`);
  }
  
  // Obtener estado de la tarea
  getState(key: string): any {
    return this.state.get(key);
  }
  
  // Verificar si existe una clave de estado
  hasState(key: string): boolean {
    return this.state.has(key);
  }
  
  // Obtener todos los estados
  getAllStates(): Record<string, any> {
    const result = {};
    this.state.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  // Serializar la tarea para API o almacenamiento
  serialize(): any {
    return {
      id: this.id,
      query: this.query,
      description: this.description,
      priority: this.priority,
      type: this.type,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      progress: this.progress,
      logs: this.logs,
      error: this.error,
      result: this.result,
      isWebTask: this.isWebTask,
      state: Object.fromEntries(this.state)
    };
  }
} 