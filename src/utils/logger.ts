import winston from 'winston';
import path from 'path';

// Configuración de formatos para los logs
const formats = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Crear logger con configuración personalizada
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: formats,
  defaultMeta: { service: 'web-crawler' },
  transports: [
    // Escribir todos los logs en consola
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          (info: any) => `${info.timestamp} ${info.level}: ${info.message}`
        )
      ),
    }),
    // Escribir logs en archivos
    new winston.transports.File({ 
      filename: path.join(process.cwd(), 'logs', 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(process.cwd(), 'logs', 'combined.log') 
    }),
  ],
});

export default logger; 