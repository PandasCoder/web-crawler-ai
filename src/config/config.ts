import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config();

export interface ConfigInterface {
  ollama: {
    baseUrl: string;
    model: string;
  };
  debug: boolean;
}

const config: ConfigInterface = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'deepseek-r1:7b',
  },
  debug: process.env.DEBUG === 'true',
};

export default config; 