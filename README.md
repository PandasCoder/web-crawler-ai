# Web Crawler AI

Un agente de navegación web automatizado que utiliza IA para extraer información de páginas web basado en instrucciones en lenguaje natural.

## Características

- 🤖 Automatización del navegador usando Playwright
- 🧠 Procesamiento de instrucciones en lenguaje natural
- 📊 Extracción de información estructurada
- 🌐 Navegación y búsqueda automática
- 📱 API REST para integración con otros servicios

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/web-crawler-ai.git
cd web-crawler-ai

# Instalar dependencias
npm install

# Compilar el proyecto
npm run build
```

## Configuración

Crea un archivo `.env` con las siguientes variables:

```
PORT=3000
DEBUG=false
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=qwen:7b
OLLAMA_TEMPERATURE=0.7
```

## Uso

Inicia el servidor:

```bash
npm start
```

### API Endpoints

- `POST /api/prompt`: Envía una instrucción para que el agente la ejecute
- `GET /api/tasks/:id`: Obtiene el estado de una tarea
- `GET /api/tasks/:id/result`: Obtiene el resultado de una tarea

## Ejemplos

```bash
# Ejemplo de solicitud con curl
curl -X POST http://localhost:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"visita amazon.com y extrae los productos destacados"}'
```

## Tecnologías

- TypeScript
- Node.js
- Playwright
- Ollama
- Express

## Licencia

Este proyecto está bajo una Licencia de Uso Dual:

- **Licencia Comunitaria**: Gratuita para uso personal, educativo y no comercial.
- **Licencia Comercial**: Requiere adquisición para cualquier uso comercial o con fines de lucro.

Para más detalles, consulte el archivo [LICENSE](LICENSE) o contacte con los autores para información sobre licencias comerciales. 