// @ts-nocheck
import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

// Cargar variables de entorno
dotenv.config();

// Configuración de Ollama
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.codea.plus';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:7b';
const OLLAMA_MAX_TOKENS = parseInt(process.env.OLLAMA_MAX_TOKENS || '2000');
const OLLAMA_TEMPERATURE = parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7');

// Comprobamos que la URL de Ollama esté configurada
if (!OLLAMA_BASE_URL) {
  logger.warn('OLLAMA_BASE_URL no está configurada. El servicio LLM no funcionará correctamente.');
}

class LLMService {
  private baseUrl: string;
  private model: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor() {
    this.baseUrl = OLLAMA_BASE_URL;
    this.model = OLLAMA_MODEL;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Envía una solicitud a la API de Ollama
   * @param messages - Lista de mensajes para la conversación
   * @param options - Opciones adicionales (temperature, max_tokens, etc.)
   * @returns Respuesta de la API
   */
  async sendRequest(messages: any[], options: any = {}): Promise<string> {
    if (!this.baseUrl) {
      logger.error('OLLAMA_BASE_URL no está configurada. No se puede procesar la solicitud.');
      return 'Error: URL de Ollama no configurada';
    }

    const requestOptions = {
      model: options.model || this.model,
      messages: messages,
      temperature: options.temperature || OLLAMA_TEMPERATURE,
      max_tokens: options.max_tokens || OLLAMA_MAX_TOKENS,
      stream: false,
    };

    logger.debug(`Enviando solicitud a Ollama: ${JSON.stringify({
      model: requestOptions.model,
      messages: requestOptions.messages.map(m => ({ role: m.role, content_length: m.content.length })),
      temperature: requestOptions.temperature,
      max_tokens: requestOptions.max_tokens
    })}`);

    let attempts = 0;
    while (attempts < this.maxRetries) {
      try {
        const response = await axios.post(
          `${this.baseUrl}/api/chat`,
          requestOptions,
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        const result = response.data.message.content;
        logger.debug(`Respuesta recibida de Ollama (${result.length} caracteres)`);
        return result;
      } catch (error) {
        attempts++;
        const statusCode = error.response?.status;
        const errorMessage = error.response?.data?.error || error.message;
        
        logger.error(`Error al llamar a Ollama (intento ${attempts}/${this.maxRetries}): ${errorMessage}`);
        
        // Si es un error de rate limit o servidor ocupado, esperamos antes de reintentar
        if ((statusCode === 429 || statusCode === 503) && attempts < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempts - 1); // Backoff exponencial
          logger.info(`Esperando ${delay}ms antes de reintentar...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (attempts >= this.maxRetries) {
          throw new Error(`No se pudo completar la solicitud después de ${this.maxRetries} intentos: ${errorMessage}`);
        }
      }
    }

    throw new Error('No se pudo completar la solicitud a Ollama');
  }

  /**
   * Genera un plan basado en un prompt de usuario
   * @param prompt - El prompt del usuario
   * @param task - La tarea asociada (para logs)
   * @returns Un plan estructurado con pasos a seguir
   */
  async generatePlan(prompt: string, task: any): Promise<any> {
    const taskId = task?.id || 'unknown';
    logger.info(`Generando plan para prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`, { taskId });
    
    // Sistema de ejemplos para ayudar al modelo a generar planes adecuados
    const examplePlan = {
      goal: "Buscar información sobre inteligencia artificial y visitar el primer resultado",
      steps: [
        {
          type: "search",
          description: "Buscar información sobre inteligencia artificial",
          params: { query: "inteligencia artificial últimos avances" }
        },
        {
          type: "click",
          description: "Hacer clic en el primer resultado relevante",
          params: { target: "primer enlace relevante" }
        },
        {
          type: "extract",
          description: "Extraer contenido principal de la página",
          params: { selectors: ["main", "#content", ".content", "article"] }
        }
      ]
    };

    // Construir el mensaje para el LLM
    const messages = [
      {
        role: "system",
        content: `Eres un asistente especializado en crear planes para navegación web. 
        Tu tarea es analizar un prompt del usuario y convertirlo en un plan estructurado con pasos claros que un agente web pueda seguir.
        
        Los tipos de pasos disponibles son:
        - 'navigate': Navegar a una URL específica
        - 'search': Realizar una búsqueda (generalmente en Google)
        - 'click': Hacer clic en un elemento de la página
        - 'extract': Extraer contenido de la página
        - 'form': Completar y enviar un formulario
        - 'scroll': Desplazarse hacia abajo o arriba en la página
        - 'wait': Esperar a que la página cargue o se actualice
        
        Devuelve SOLO un objeto JSON con la siguiente estructura:
        {
          "goal": "Descripción clara del objetivo",
          "steps": [
            {
              "type": "tipoDeAcción",
              "description": "Descripción detallada de la acción",
              "params": { ... parámetros necesarios ... }
            },
            ...más pasos...
          ]
        }
        
        No incluyas comentarios ni explicaciones fuera del JSON. El JSON debe ser válido y estar correctamente formateado.`
      },
      {
        role: "user",
        content: `Crea un plan para: "Buscar información sobre inteligencia artificial y visitar el primer resultado"`
      },
      {
        role: "assistant",
        content: JSON.stringify(examplePlan, null, 2)
      },
      {
        role: "user",
        content: `Crea un plan para: "${prompt}"`
      }
    ];

    try {
      // Enviar solicitud al LLM
      const response = await this.sendRequest(messages, {
        temperature: 0.4, // Temperatura más baja para respuestas más consistentes
        max_tokens: 2000  // Suficiente para planes complejos
      });

      // Parsear la respuesta como JSON
      try {
        // Intentar encontrar el JSON en la respuesta, por si el modelo añade texto adicional
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : response;
        
        const plan = JSON.parse(jsonStr);
        
        // Validar que el plan tiene la estructura correcta
        if (!plan.goal || !Array.isArray(plan.steps) || plan.steps.length === 0) {
          logger.error('El plan generado no tiene la estructura correcta', { taskId, plan });
          return this.createFallbackPlan(prompt);
        }

        logger.info(`Plan generado con ${plan.steps.length} pasos`, { taskId });
        return plan;
      } catch (parseError) {
        logger.error(`Error al parsear respuesta como JSON: ${parseError.message}`, { taskId });
        logger.debug(`Respuesta que no se pudo parsear: ${response}`);
        return this.createFallbackPlan(prompt);
      }
    } catch (error) {
      logger.error(`Error al generar plan: ${error.message}`, { taskId });
      return this.createFallbackPlan(prompt);
    }
  }

  /**
   * Interpreta el contenido de una página web para determinar acciones
   * @param pageContent - El contenido de la página
   * @param url - La URL actual
   * @param prompt - El prompt original
   * @param task - La tarea
   * @returns Próxima acción a realizar
   */
  async interpretPageContent(pageContent: string, url: string, prompt: string, task: any): Promise<any> {
    const taskId = task?.id || 'unknown';
    // Limitar el tamaño del contenido para no exceder los límites de tokens
    const contentPreview = pageContent.substring(0, 2000) + (pageContent.length > 2000 ? '...' : '');
    
    logger.info(`Interpretando contenido de página en ${url}`, { taskId });
    
    const messages = [
      {
        role: "system",
        content: `Eres un asistente especializado en analizar páginas web y determinar las mejores acciones para cumplir un objetivo.
        Se te proporcionará el contenido de una página web y el objetivo del usuario.
        Tu tarea es analizar el contenido y recomendar la siguiente acción que se debe tomar para avanzar hacia el objetivo.
        
        Posibles tipos de acciones:
        - 'click': Hacer clic en un enlace o botón (especifica cuál exactamente)
        - 'form': Completar un formulario (especifica qué campos y valores)
        - 'extract': Extraer información específica (especifica qué información)
        - 'scroll': Desplazarse para ver más contenido
        - 'navigate': Navegar a otra URL
        - 'back': Regresar a la página anterior
        - 'done': Si ya se ha cumplido el objetivo, indica que la tarea está completa
        
        Devuelve SOLO un objeto JSON con la siguiente estructura:
        {
          "analysisResult": "Breve explicación de lo que has encontrado en la página",
          "nextAction": {
            "type": "tipoDeAcción",
            "description": "Descripción detallada",
            "params": { ... parámetros necesarios ... }
          },
          "relevance": 0-10 (qué tan relevante es este contenido para el objetivo)
        }`
      },
      {
        role: "user",
        content: `Objetivo: "${prompt}"
        URL actual: ${url}
        Contenido de la página:
        ${contentPreview}`
      }
    ];

    try {
      const response = await this.sendRequest(messages, {
        temperature: 0.5,
        max_tokens: 1500
      });

      try {
        // Buscar un objeto JSON en la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : response;
        
        const interpretation = JSON.parse(jsonStr);
        logger.info(`Contenido interpretado: ${interpretation.analysisResult.substring(0, 100)}...`, { taskId });
        return interpretation;
      } catch (parseError) {
        logger.error(`Error al parsear interpretación: ${parseError.message}`, { taskId });
        return {
          analysisResult: "No se pudo analizar el contenido correctamente",
          nextAction: { type: "extract", description: "Extraer contenido principal" },
          relevance: 3
        };
      }
    } catch (error) {
      logger.error(`Error al interpretar contenido: ${error.message}`, { taskId });
      return {
        analysisResult: "Error al procesar la página",
        nextAction: { type: "extract", description: "Extraer contenido principal" },
        relevance: 2
      };
    }
  }

  /**
   * Procesa el contenido extraído y lo formatea para una mejor presentación al usuario
   */
  async processContent(content: string, question: string): Promise<any> {
    try {
      // Crear un prompt que enfatiza seguir exactamente las instrucciones del usuario
      const prompt = `
Eres un asistente especializado en extraer información de páginas web.

INSTRUCCIÓN ORIGINAL DEL USUARIO:
"${question}"

CONTENIDO WEB:
${content}

REGLAS ESTRICTAS:
1. Debes seguir EXACTAMENTE las instrucciones del usuario, sin añadir campos no solicitados
2. Si el usuario pide un formato JSON, responde SOLAMENTE con un objeto JSON válido
3. No incluyas texto explicativo antes o después del resultado solicitado
4. No agregues campos de metadatos a menos que sean solicitados explícitamente
5. Mantén los símbolos de moneda en los precios y URLs completas en los enlaces
6. Usa valores booleanos (true/false) para indicar disponibilidad cuando sea apropiado

IMPORTANTE: Tu respuesta debe ser EXCLUSIVAMENTE lo que el usuario solicita, sin añadidos ni explicaciones.
`;

      console.log('Enviando contenido al modelo para procesamiento');
      
      // Tokenizar y truncar el contenido si es necesario
      const maxTokens = 8000;
      let truncatedContent = content;
      
      if (content.length > maxTokens * 4) {
        truncatedContent = content.substring(0, maxTokens * 4);
        console.log(`Contenido truncado de ${content.length} a ${truncatedContent.length} caracteres`);
      }

      let response = null;

      // Extraer URLs de imágenes si están presentes
      let imageUrls = [];
      const imagesDataMatch = content.match(/IMAGES_DATA: (\[.*?\])/s);
      if (imagesDataMatch && imagesDataMatch[1]) {
        try {
          imageUrls = JSON.parse(imagesDataMatch[1]);
          console.log(`Extraídas ${imageUrls.length} URLs de imágenes`);
          truncatedContent = truncatedContent.replace(/\n\nIMAGES_DATA: \[.*?\]\n\n/s, '\n\n');
        } catch (err) {
          console.error('Error al procesar datos de imágenes:', err);
        }
      }

      // Construir prompt final con imágenes si están disponibles
      let finalPrompt = prompt;
      if (imageUrls.length > 0) {
        finalPrompt = `
Eres un asistente especializado en extraer información de páginas web.

INSTRUCCIÓN ORIGINAL DEL USUARIO:
"${question}"

CONTENIDO WEB:
${truncatedContent}

IMÁGENES ENCONTRADAS:
${JSON.stringify(imageUrls)}

REGLAS ESTRICTAS:
1. Debes seguir EXACTAMENTE las instrucciones del usuario, sin añadir campos no solicitados
2. Si el usuario pide un formato JSON, responde SOLAMENTE con un objeto JSON válido
3. No incluyas texto explicativo antes o después del resultado solicitado
4. No agregues campos de metadatos a menos que sean solicitados explícitamente
5. Mantén los símbolos de moneda en los precios y URLs completas en los enlaces
6. Usa valores booleanos (true/false) para indicar disponibilidad cuando sea apropiado

IMPORTANTE: Tu respuesta debe ser EXCLUSIVAMENTE lo que el usuario solicita, sin añadidos ni explicaciones.
`;
      }

      // Usando Ollama con temperatura más baja para respuestas más precisas
      const url = `${this.baseUrl}/api/generate`;
      const data = {
        model: this.model,
        prompt: finalPrompt,
        stream: false,
        options: {
          temperature: 0.2, // Temperatura muy baja para mayor precisión
          num_predict: OLLAMA_MAX_TOKENS
        }
      };
      
      const axiosResponse = await axios.post(url, data);
      response = axiosResponse.data.response;
      
      if (!response) {
        console.error('No se recibió respuesta del modelo');
        return {
          error: 'No se pudo procesar el contenido con el modelo',
          success: false
        };
      }
      
      // Intentar extraer el JSON de la respuesta
      try {
        // Buscar y extraer SOLO el objeto JSON completo más cercano
        const jsonPattern = /(\{[\s\S]*?\})/;
        const match = response.match(jsonPattern);
        let jsonResponse = '';
        
        if (match && match[1]) {
          // Encontrar el cierre de llave correspondiente para asegurar un JSON completo
          let jsonCandidate = match[1];
          let openBraces = 0;
          let validJson = '';
          
          // Recorrer carácter por carácter para encontrar un objeto JSON válido
          for (let i = 0; i < jsonCandidate.length; i++) {
            const char = jsonCandidate[i];
            validJson += char;
            
            if (char === '{') openBraces++;
            if (char === '}') openBraces--;
            
            // Cuando lleguemos a 0, tenemos un JSON potencialmente válido
            if (openBraces === 0 && validJson.trim().startsWith('{') && validJson.trim().endsWith('}')) {
              jsonResponse = validJson;
              break;
            }
          }
        } else {
          jsonResponse = response;
        }
        
        // Verificar que realmente tenemos un JSON antes de parsearlo
        if (!jsonResponse || !jsonResponse.trim().startsWith('{') || !jsonResponse.trim().endsWith('}')) {
          throw new Error('No se encontró un objeto JSON válido en la respuesta');
        }
        
        console.log('JSON extraído para parseo:', jsonResponse.substring(0, 100) + '...');
        
        // Intentar parsear el JSON
        const parsedResponse = JSON.parse(jsonResponse);
        
        // Determinar si debemos añadir satisfacción
        // Solo agregamos el campo de satisfacción si se solicita JSON pero no está ya incluido
        if (question.toLowerCase().includes('json') && typeof parsedResponse.satisfaccion === 'undefined') {
          parsedResponse.satisfaccion = 10;
        }
        
        return parsedResponse;
      } catch (err) {
        console.error('Error al parsear respuesta JSON:', err);
        
        // Si no podemos parsear, intentar limpiar y extraer solo la parte válida del JSON
        try {
          const startIndex = response.indexOf('{');
          if (startIndex !== -1) {
            let openBraces = 0;
            let endIndex = -1;
            
            for (let i = startIndex; i < response.length; i++) {
              if (response[i] === '{') openBraces++;
              if (response[i] === '}') openBraces--;
              
              if (openBraces === 0) {
                endIndex = i + 1;
                break;
              }
            }
            
            if (endIndex !== -1) {
              const cleanedJson = response.substring(startIndex, endIndex);
              console.log('Intento de rescate de JSON:', cleanedJson.substring(0, 100) + '...');
              
              // Intentar parsear el JSON rescatado
              const rescuedJson = JSON.parse(cleanedJson);
              
              // Determinar si debemos añadir satisfacción al JSON rescatado
              if (question.toLowerCase().includes('json') && typeof rescuedJson.satisfaccion === 'undefined') {
                rescuedJson.satisfaccion = 10;
              }
              
              return rescuedJson;
            }
          }
        } catch (secondError) {
          console.error('Segundo intento de parseo falló:', secondError);
        }
        
        // Si se solicita JSON pero todo falló, crear un objeto básico
        if (question.toLowerCase().includes('json')) {
          return {
            respuesta: response.substring(0, 1000),
            satisfaccion: 5
          };
        }
        
        // Si no se solicita JSON, devolver el texto como está
        return response;
      }
    } catch (err) {
      console.error('Error en processContent:', err);
      return {
        error: `Error al procesar el contenido: ${err.message}`,
        success: false
      };
    }
  }

  /**
   * Evaluar el resultado de los pasos ejecutados y determinar si se ha completado el objetivo
   * @param task - La tarea
   * @param prompt - El prompt original
   * @param result - El resultado actual
   * @returns Evaluación del progreso y próximos pasos
   */
  async evaluateProgress(task: any, prompt: string, result: any): Promise<any> {
    const taskId = task?.id || 'unknown';
    logger.info(`Evaluando progreso de la tarea`, { taskId });
    
    // Preparar un resumen de los pasos ejecutados hasta ahora
    const stepsExecuted = task.logs
      .filter(log => log.message && log.message.includes('completado con éxito'))
      .map(log => log.message)
      .join('\n');
    
    const currentContent = result.content ? result.content.substring(0, 2000) : 'No hay contenido disponible';
    
    const messages = [
      {
        role: "system",
        content: `Eres un asistente especializado en evaluar si una tarea de navegación web se ha completado satisfactoriamente.
        Debes analizar el objetivo inicial, los pasos realizados y el contenido actual para determinar:
        1. Si el objetivo se ha cumplido
        2. Cuál es la calidad del resultado
        3. Si se necesitan pasos adicionales
        
        IMPORTANTE: Cuando evalúes la calidad o el nivel de satisfacción, debes ser preciso y justo.
        - Si la página contiene información relevante al objetivo, incluso si no es perfecta, debe recibir una puntuación mínima de 6.
        - Si se encontró exactamente lo que se buscaba, la puntuación debe ser 8 o superior.
        - Solo asigna puntuaciones por debajo de 4 si la página no tiene absolutamente ninguna relevancia con el objetivo.
        
        Devuelve SOLO un objeto JSON con la siguiente estructura:
        {
          "isCompleted": true/false,
          "completionPercentage": 0-100,
          "evaluation": "Explicación detallada de tu evaluación",
          "suggestionForNextStep": "Sugerencia específica si la tarea no está completa",
          "satisfactionScore": 0-10
        }`
      },
      {
        role: "user",
        content: `Objetivo inicial: "${prompt}"
        
        Pasos ejecutados:
        ${stepsExecuted || "No hay pasos registrados"}
        
        Contenido actual:
        ${currentContent}
        
        URL actual: ${result.url || "Desconocida"}
        
        ¿Se ha completado satisfactoriamente el objetivo? Proporciona una evaluación detallada.`
      }
    ];

    try {
      const response = await this.sendRequest(messages, {
        temperature: 0.3,
        max_tokens: 1500
      });

      try {
        // Buscar un objeto JSON en la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : response;
        
        const evaluation = JSON.parse(jsonStr);
        
        // Asegurar que la puntuación de satisfacción no sea demasiado baja para contenido relevante
        if (evaluation.isCompleted && evaluation.satisfactionScore < 5) {
          evaluation.satisfactionScore = Math.max(5, evaluation.satisfactionScore);
        }
        
        logger.info(`Evaluación del progreso: ${evaluation.completionPercentage}% completo, puntuación: ${evaluation.satisfactionScore}/10`, { taskId });
        return evaluation;
      } catch (parseError) {
        logger.error(`Error al parsear evaluación: ${parseError.message}`, { taskId });
        return {
          isCompleted: false,
          completionPercentage: 50,
          evaluation: "No se pudo evaluar correctamente el progreso",
          suggestionForNextStep: "Continuar con la extracción de contenido",
          satisfactionScore: 5
        };
      }
    } catch (error) {
      logger.error(`Error al evaluar progreso: ${error.message}`, { taskId });
      return {
        isCompleted: false,
        completionPercentage: 40,
        evaluation: "Error al evaluar progreso",
        suggestionForNextStep: "Intentar extraer más información",
        satisfactionScore: 5
      };
    }
  }

  /**
   * Crea un plan de respaldo simple basado en el prompt
   * @param prompt - El prompt original
   * @returns Un plan básico
   */
  private createFallbackPlan(prompt: string): any {
    logger.info(`Creando plan de respaldo para: ${prompt}`);
    
    // Detectar URLs en el prompt
    const urlMatch = prompt.match(/(https?:\/\/[^\s]+)/);
    
    const plan = {
      goal: prompt,
      steps: []
    };
    
    if (urlMatch) {
      // Si hay una URL, navegar a ella y extraer contenido
      plan.steps = [
        {
          type: "navigate",
          description: `Navegar a ${urlMatch[1]}`,
          params: { url: urlMatch[1] }
        },
        {
          type: "extract",
          description: "Extraer contenido principal de la página",
          params: { selectors: ["main", "#content", ".content", "article"] }
        }
      ];
    } else {
      // Si no hay URL, hacer una búsqueda y extraer resultados
      plan.steps = [
        {
          type: "search",
          description: `Buscar información sobre: ${prompt}`,
          params: { query: prompt }
        },
        {
          type: "extract",
          description: "Extraer resultados de búsqueda",
          params: { selectors: ["#search", "#main", "#center_col"] }
        }
      ];
    }
    
    return plan;
  }
}

export default new LLMService(); 