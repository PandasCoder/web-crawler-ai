// @ts-nocheck
import express from 'express';
import cors from 'cors';
import taskRoutes from '../routes/task-routes.js';
import promptRoutes from '../routes/prompt-routes.js';
import browserRoutes from '../routes/browser-routes.js';
import logger from '../utils/logger.js';

// Crear la aplicación Express
const app = express();

// Aplicar middlewares
app.use(cors());
app.use(express.json());

// Middleware para logging de solicitudes
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Middleware para depuración de rutas
app.use((req, res, next) => {
  console.log(`[DEBUG] Recibida solicitud: ${req.method} ${req.originalUrl}`);
  next();
});

// Rutas de la API
app.use('/api/tasks', taskRoutes);
app.use('/api/prompt', promptRoutes);
app.use('/api/browser', browserRoutes);

// Ruta de status para verificar que la API está funcionando
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  logger.warn(`Ruta no encontrada: ${req.method} ${req.url}`);
  console.log(`[DEBUG] Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejo de errores generales
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(`Error en servidor: ${err.message}`, { error: err });
  console.log(`[DEBUG] Error en servidor: ${err.message}`);
  res.status(500).json({ error: 'Error interno del servidor', details: err.message });
});

export default app; 