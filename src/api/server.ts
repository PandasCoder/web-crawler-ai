import app from './app.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

// Puerto por defecto para la API
const DEFAULT_PORT = 3000;
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;

// Iniciar el servidor
app.listen(port, () => {
  logger.info(`Servidor API iniciado en http://localhost:${port}`);
  logger.info(`Estado de depuración: ${config.debug ? 'activado' : 'desactivado'}`);
  logger.info(`Usando modelo LLM: ${config.ollama.model}`);
}); 