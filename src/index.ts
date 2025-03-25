import { WebAgent } from './agents/web-agent.js';
import config from './config/config.js';
import logger from './utils/logger.js';

// Importar API
import './api/server.js';

async function runDirectAgent() {
  logger.info('Iniciando Agente de Extracción Web directamente...');
  logger.info(`Usando Ollama en: ${config.ollama.baseUrl}`);
  logger.info(`Modelo: ${config.ollama.model}`);
  
  const agent = new WebAgent();
  
  try {
    // Ejemplo de consulta para el agente
    const query = process.argv[2] || 'Navega a https://www.example.com y extrae todo el texto de la página';
    logger.info(`\nProcesando consulta: "${query}"`);
    
    const result = await agent.run(query);
    logger.info('\nResultado:');
    console.log(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error durante la ejecución: ${errorMessage}`, { error });
  } finally {
    await agent.close();
    logger.info('Agente cerrado correctamente.');
  }
}

// Si se pasa un argumento de línea de comandos, ejecutar el agente directamente
// En caso contrario, la API ya se habrá iniciado
if (process.argv.length > 2) {
  runDirectAgent().catch(error => {
    logger.error('Error fatal:', error);
    process.exit(1);
  });
} 