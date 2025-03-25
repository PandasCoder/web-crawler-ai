// @ts-nocheck
import logger from '../utils/logger.js';

class PromptService {
  // Predefined prompt templates
  private promptTemplates = [
    {
      id: 'search',
      name: 'Búsqueda Web',
      template: 'Busca información sobre {topic}',
      description: 'Realiza una búsqueda general sobre un tema'
    },
    {
      id: 'visit',
      name: 'Visitar URL',
      template: 'Visita {url} y extrae su contenido principal',
      description: 'Navega a una URL específica y extrae información'
    },
    {
      id: 'analyze',
      name: 'Analizar Tema',
      template: 'Realiza un análisis detallado sobre {topic}',
      description: 'Investiga y analiza un tema en profundidad'
    }
  ];

  // Interpretar un prompt en lenguaje natural
  interpretPrompt(prompt: string): any {
    logger.info(`Interpretando prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
    
    // Normalizar texto: minúsculas, sin acentos, etc.
    const normalizedPrompt = prompt.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Patrones para detectar intenciones
    const patterns = [
      { 
        regex: /busca|encuentra|extrae|informaci[oó]n|contenido|datos|sobre|acerca de|qu[eé] es/i,
        action: 'extract',
        confidence: 0.8
      },
      { 
        regex: /visita|navega|abre|ve a|ir a|la p[aá]gina|el sitio|la web/i,
        action: 'visit',
        confidence: 0.7
      },
      { 
        regex: /analiza|analizar|resumen|resume|resumir|sintetiza|sintetizar/i,
        action: 'analyze',
        confidence: 0.6
      }
    ];
    
    // Detectar URLs en el texto
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = prompt.match(urlRegex) || [];
    
    // Extraer posibles términos de búsqueda después de patrones comunes
    let searchTerms = [];
    const searchPatterns = [
      /(?:sobre|acerca de|información de|datos de|busca|encuentra|qué es|que es)\s+(.+?)(?:\.|\?|$)/i,
      /(?:visita|navega|abre|ve a|ir a)\s+(.+?)(?:\.|\?|$)/i
    ];
    
    for (const pattern of searchPatterns) {
      const match = normalizedPrompt.match(pattern);
      if (match && match[1] && match[1].trim().length > 2) {
        searchTerms.push(match[1].trim());
      }
    }
    
    // Detectar la intención principal
    let bestAction = null;
    let highestConfidence = 0;
    
    for (const pattern of patterns) {
      if (pattern.regex.test(normalizedPrompt)) {
        if (pattern.confidence > highestConfidence) {
          bestAction = pattern.action;
          highestConfidence = pattern.confidence;
        }
      }
    }
    
    // Si no detectamos una acción clara, pero hay URLs, asumimos extracción
    if (!bestAction && urls.length > 0) {
      bestAction = 'extract';
      highestConfidence = 0.6;
    }
    
    // Si aún no tenemos acción pero hay términos de búsqueda, asumimos búsqueda
    if (!bestAction && searchTerms.length > 0) {
      bestAction = 'analyze';
      highestConfidence = 0.5;
    }
    
    // Determinar el objetivo de la acción (URL o término de búsqueda)
    let target = '';
    
    if (urls.length > 0) {
      // Priorizar URLs si existen
      target = urls[0];
    } else if (searchTerms.length > 0) {
      // Usar el término de búsqueda más largo como más probable
      target = searchTerms.reduce((a, b) => a.length > b.length ? a : b);
    } else {
      // Si no hay URL ni término explícito, usar todo el prompt como consulta
      target = prompt;
    }
    
    const interpretation = {
      action: bestAction || 'analyze', // Default a analyze si no detectamos nada
      target: target,
      confidence: highestConfidence,
      originalPrompt: prompt
    };
    
    logger.debug(`Prompt interpretado como: ${JSON.stringify(interpretation)}`);
    
    return interpretation;
  }

  // Ejecutar una acción basada en la interpretación del prompt
  async executePromptAction(interpretation: any): Promise<string> {
    const { action, target } = interpretation;
    logger.info(`Ejecutando acción: ${action} para objetivo: ${target}`);
    
    // Todas las acciones por ahora crean una tarea de extracción web
    // pero podríamos diferenciar el comportamiento en el futuro
    if (action === 'extract' || action === 'visit') {
      // Si el target ya es una URL, usarla directamente
      if (target.match(/^https?:\/\//)) {
        return target;
      } else {
        // Si no es URL, convertir a una búsqueda en Google
        return `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      }
    } else if (action === 'analyze') {
      // Para análisis, si no es URL, buscamos en Google
      if (!target.match(/^https?:\/\//)) {
        return `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      }
      return target;
    }
    
    // Por defecto, devolver el target
    return target;
  }

  // Obtener templates predefinidos
  getPromptTemplates() {
    return this.promptTemplates;
  }

  // Determinar si se debe utilizar el agente de navegación
  shouldUseWebAgent(prompt: string): boolean {
    const webPatterns = [
      /navega|visita|abre|ir a|web|página|sitio/i,
      /extrae|extraer|obtener|encontrar|buscar/i,
      /clic|click|pincha|presiona|botón/i,
      /formulario|llena|completa|escribe/i,
      /https?:\/\//i,
      /google|search|buscar en/i
    ];
    
    return webPatterns.some(pattern => pattern.test(prompt));
  }
}

export default new PromptService(); 