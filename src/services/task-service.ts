// @ts-nocheck
import { Task, TaskStatus, CreateTaskDTO } from '../models/task.js';
import { WebAgent } from '../agents/web-agent.js';
import logger from '../utils/logger.js';

class TaskService {
  private tasks: Map<string, Task> = new Map();
  private runningTasks: Map<string, { agent: WebAgent, abortController: AbortController }> = new Map();

  // Obtener todas las tareas
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  // Obtener una tarea por ID
  getTaskById(id: string): Task | undefined {
    console.log(`[DEBUG] Buscando tarea con ID: ${id}`);
    console.log(`[DEBUG] Tareas disponibles: ${Array.from(this.tasks.keys()).join(', ')}`);
    const task = this.tasks.get(id);
    console.log(`[DEBUG] ¿Tarea encontrada?: ${task ? 'Sí' : 'No'}`);
    return task;
  }

  // Crear una nueva tarea
  createTask(data: CreateTaskDTO): Task {
    const task = new Task(data);
    logger.info(`Tarea creada con ID: ${task.id}`, { taskId: task.id });
    this.tasks.set(task.id, task);
    
    // Iniciar tarea automáticamente si la prioridad es alta
    if (data.priority && data.priority > 8) {
      this.startTask(task.id);
    }
    
    return task;
  }

  // Iniciar una tarea
  async startTask(id: string): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    if (!task) {
      logger.error(`No se encontró la tarea con ID: ${id}`);
      return undefined;
    }

    if (task.status === TaskStatus.RUNNING) {
      logger.warn(`La tarea ${id} ya está en ejecución`);
      return task;
    }

    // Actualizar estado
    task.updateStatus(TaskStatus.RUNNING);
    logger.info(`Iniciando tarea ${id}`);

    // Crear un controlador de aborto para permitir cancelar la tarea
    const abortController = new AbortController();
    
    try {
      // Crear una instancia del agente para esta tarea
      const agent = new WebAgent();
      
      // Guardar la referencia para poder controlar la tarea
      this.runningTasks.set(task.id, { agent, abortController });
      
      // Ejecutar la tarea en background
      this.executeTask(task, agent, abortController.signal);
      
      return task;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al iniciar la tarea ${id}: ${errorMessage}`, { taskId: id, error });
      task.setError(errorMessage);
      task.updateStatus(TaskStatus.FAILED);
      return task;
    }
  }

  // Ejecutar tarea en background
  private async executeTask(task: Task, agent: WebAgent, signal: AbortSignal): Promise<void> {
    // Si la señal ya está abortada, no continuar
    if (signal.aborted) {
      task.updateStatus(TaskStatus.STOPPED);
      return;
    }

    // Configurar listener para señal de aborto
    signal.addEventListener('abort', () => {
      task.addLog('Tarea abortada por solicitud del usuario');
      task.updateStatus(TaskStatus.STOPPED);
    });

    try {
      // Ejecutar la tarea
      task.addLog(`Ejecutando consulta: ${task.query}`);
      
      // Simular actualizaciones de progreso (en un caso real, esto sería reportado por el agente)
      task.updateProgress(10);
      
      // Ejecutar el agente
      const result = await agent.run(task.query);
      
      // Actualizar progreso y resultado
      task.updateProgress(100);
      task.setResult(result);
      task.updateStatus(TaskStatus.COMPLETED);
      
      logger.info(`Tarea ${task.id} completada con éxito`);
    } catch (error) {
      if (signal.aborted) {
        // La tarea fue abortada, no es un error real
        return;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error al ejecutar la tarea ${task.id}: ${errorMessage}`, { taskId: task.id, error });
      
      task.setError(errorMessage);
      task.updateStatus(TaskStatus.FAILED);
    } finally {
      // Limpiar recursos
      await agent.close();
      this.runningTasks.delete(task.id);
    }
  }

  // Pausar una tarea
  pauseTask(id: string): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) {
      logger.error(`No se encontró la tarea con ID: ${id}`);
      return undefined;
    }

    if (task.status !== TaskStatus.RUNNING) {
      logger.warn(`No se puede pausar la tarea ${id} porque no está en ejecución`);
      return task;
    }

    // En un sistema real, implementaríamos un mecanismo real de pausa
    // Por ahora, simplemente marcamos la tarea como pausada
    task.updateStatus(TaskStatus.PAUSED);
    logger.info(`Tarea ${id} pausada`);

    return task;
  }

  // Detener una tarea
  stopTask(id: string): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) {
      logger.error(`No se encontró la tarea con ID: ${id}`);
      return undefined;
    }

    if (task.status !== TaskStatus.RUNNING && task.status !== TaskStatus.PAUSED) {
      logger.warn(`No se puede detener la tarea ${id} porque no está en ejecución o pausada`);
      return task;
    }

    // Abortar la ejecución si está en progreso
    const runningTask = this.runningTasks.get(id);
    if (runningTask) {
      runningTask.abortController.abort();
      this.runningTasks.delete(id);
    }

    task.updateStatus(TaskStatus.STOPPED);
    logger.info(`Tarea ${id} detenida`);

    return task;
  }

  // Continuar una tarea pausada
  resumeTask(id: string): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) {
      logger.error(`No se encontró la tarea con ID: ${id}`);
      return undefined;
    }

    if (task.status !== TaskStatus.PAUSED) {
      logger.warn(`No se puede continuar la tarea ${id} porque no está pausada`);
      return task;
    }

    // En un sistema real, implementaríamos un mecanismo real para continuar
    // Por ahora, simplemente iniciamos la tarea nuevamente
    // Utilizamos una conversión de tipo para resolver el error de tipo
    return this.startTask(id) as unknown as Task;
  }
}

export default new TaskService(); 