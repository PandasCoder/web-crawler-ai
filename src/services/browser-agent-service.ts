// @ts-nocheck
import browserAgent from '../tools/browser-agent.js';
import taskService from './task-service.js';
import llmService from './llm-service.js';
import { TaskStatus } from '../models/task.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

class BrowserAgentService {
  // Procesar una solicitud de prompt para navegación web
  async executeWebPrompt(task, prompt): Promise<void> {
    if (!task || !prompt) {
      throw new Error('Se requiere una tarea y un prompt para ejecutar');
    }
    
    try {
      // Mensaje de inicio de tarea
      task.addLog(`Ejecutando prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
      
      // Inicializar el navegador
      await browserAgent.init();
      
      // 1. Planificar la navegación
      task.setState('status', 'planning');
      const plan = await this.createTaskPlan(prompt, task);
      
      task.addLog(`Plan generado con ${plan.steps.length} pasos`);
      task.setState('plan', plan);
      
      // 2. Ejecutar los pasos del plan
      task.setState('status', 'executing');
      
      // Memoria para almacenar información entre pasos
      const memory = {
        currentUrl: null,
        previousSteps: []
      };
      
      let lastStepResult = null;
      let i = 0;
      
      for (const step of plan.steps) {
        // Actualizar estado de la tarea
        task.setState('currentStep', i);
        task.setState('currentStepDescription', step.description);
        task.addLog(`Ejecutando paso ${i+1}/${plan.steps.length}: ${step.description}`);
        
        try {
          // Ejecutar el paso actual
          const stepResult = await this.executeStep(step, task, memory);
          lastStepResult = stepResult;
          
          // Guardar resultado en la memoria
          memory[`step_${i}_result`] = stepResult;
          
          // Si el paso indicó terminar la ejecución, salimos del bucle
          if (stepResult && stepResult.shouldTerminate) {
            task.addLog('Finalizando ejecución temprana según indicación del paso actual');
            break;
          }
          
          i++;
        } catch (stepError) {
          task.addLog(`Error al ejecutar paso ${i+1}: ${stepError.message}`);
          
          // Intentar recuperarse del error si es posible
          if (i < plan.steps.length - 1) {
            task.addLog('Intentando continuar con el siguiente paso...');
            i++;
          } else {
            throw stepError; // Re-lanzar el error si es el último paso
          }
        }
      }
      
      // 3. Extraer contenido final para generar respuesta
      task.setState('status', 'processing_results');
      
      let finalContent = "No se encontró contenido relevante";
      
      if (lastStepResult && lastStepResult.content) {
        finalContent = lastStepResult.content;
      } else if (memory.currentUrl) {
        task.addLog('Extrayendo contenido de la página final para análisis');
        finalContent = await this.extractContent(task);
      }
      
      // 4. Procesar el contenido y generar respuesta final
      task.setState('status', 'generating_response');
      task.addLog('Generando respuesta final basada en la información recopilada');
      
      // Obtener información sobre la URL actual
      const currentUrl = await browserAgent.getUrl();
      const pageTitle = await browserAgent.page.title();
      
      // Pasar el prompt original directamente al modelo LLM para respetar las instrucciones exactas del usuario
      const processedResponse = await llmService.processContent(finalContent, prompt);
      
      // Definir el resultado final - mantener la estructura original de la respuesta
      const finalResult = processedResponse;
      
      // Solo agregar metadatos si la respuesta es un objeto y no tiene ya metadatos
      if (typeof finalResult === 'object' && finalResult !== null && !finalResult.metadata) {
        // Añadir metadatos mínimos sin alterar la estructura principal
        finalResult.metadata = {
          url: currentUrl,
          title: pageTitle,
          timestamp: new Date().toISOString(),
          steps_executed: i
        };
      }
      
      // Guardar resultado y marcar como completado
      task.setState('result', finalResult);
      
      // Determinar satisfacción si es posible
      const satisfactionScore = 
        (typeof finalResult === 'object' && finalResult !== null && 'satisfaccion' in finalResult) 
          ? finalResult.satisfaccion 
          : 10;
      
      task.setState('satisfactionScore', satisfactionScore);
      task.setState('status', 'completed');
      
      // Actualizar el estado de la tarea usando los métodos correctos
      task.setResult(typeof finalResult === 'object' ? JSON.stringify(finalResult) : finalResult);
      task.updateStatus(TaskStatus.COMPLETED);
      
      // Finalmente, evaluar la calidad del resultado
      const evaluation = await llmService.evaluateProgress(task, prompt, {
        content: finalContent,
        url: currentUrl
      });
      
      task.setState('evaluation', evaluation);
      
      // Mensaje explícito de finalización
      logger.info(`Tarea completada con éxito: ${task.id} - Satisfacción: ${satisfactionScore}/10`);
      task.addLog('Tarea completada con éxito');
      
    } catch (error) {
      task.addLog(`Error al ejecutar prompt: ${error.message}`);
      task.setState('error', error.message);
      task.setState('status', 'error');
      throw error;
    } finally {
      // Cerrar el navegador si no estamos en modo debug
      if (!config.debug) {
        try {
          logger.info('Cerrando navegador...');
          await browserAgent.close();
          logger.info('Navegador cerrado correctamente');
        } catch (closeError) {
          logger.error(`Error al cerrar navegador: ${closeError.message}`);
        }
      }
    }
  }
  
  /**
   * Crea un plan de tareas a partir del prompt basado en patrones
   * Método de respaldo en caso de que falle el LLM
   */
  async createTaskPlan(prompt, task): Promise<any> {
    // Implementar una lógica simple de planificación basada en patrones comunes
    // Este método sirve como respaldo cuando LLM no está disponible
    
    const plan = {
      originalPrompt: prompt,
      goal: prompt,
      steps: []
    };
    
    // Buscar URLs en el prompt - intentar extraer una URL completa
    // Búsqueda mejorada para detectar URLs en textos complejos (incluso en búsquedas de Google)
    let extractedUrl = null;
    
    // 1. Primero intentar encontrar una URL completa directamente en el prompt
    const directUrlMatch = prompt.match(/(https?:\/\/[^\s]+)/);
    
    // 2. Si hay una URL dentro de una búsqueda de Google, extraerla
    const googleSearchMatch = prompt.match(/google.com\/search\?.*q=([^&\s]+)/);
    
    if (directUrlMatch) {
      // URL directa encontrada en el prompt
      extractedUrl = directUrlMatch[1];
      
      // Si la URL está dentro de una búsqueda de Google, intentar decodificarla
      if (extractedUrl.includes('google.com/search') && googleSearchMatch) {
        try {
          // Decodificar la consulta para ver si contiene una URL
          const decodedQuery = decodeURIComponent(googleSearchMatch[1]);
          const urlInQueryMatch = decodedQuery.match(/(https?:\/\/[^\s]+)/);
          
          if (urlInQueryMatch) {
            extractedUrl = urlInQueryMatch[1];
            task.addLog(`URL extraída de la consulta de Google: ${extractedUrl}`);
          }
        } catch (e) {
          task.addLog(`Error al decodificar URL de búsqueda: ${e.message}`);
        }
      }
      
      // Limpiar la URL (eliminar caracteres que no deberían estar al final)
      extractedUrl = extractedUrl.replace(/[.,;:"\)]+$/, '');
      
      task.addLog(`URL detectada en el prompt: ${extractedUrl}`);
    }
    
    // Detectar posibles acciones en el prompt
    const hasSearchIntent = /busca|encuentra|buscar|encontrar|información sobre|datos de/i.test(prompt);
    const hasNavigationIntent = /visita|navega|ir a|abre|abrir|ve a|url|go to/i.test(prompt);
    const hasExtractionIntent = /extrae|obtén|recupera|obtener|extraer|contenido|datos|take|extract/i.test(prompt);
    const hasClickIntent = /haz clic|presiona|pulsa|click|botón/i.test(prompt);
    const hasFormIntent = /formulario|llena|completa|escribe|ingresa|datos/i.test(prompt);
    
    // Construir el plan basado en las intenciones detectadas
    if (extractedUrl) {
      // Si encontramos una URL, navegar directamente a ella
      plan.steps.push({
        type: 'navigate',
        description: `Navegar directamente a ${extractedUrl}`,
        params: { url: extractedUrl }
      });
    } else if (hasNavigationIntent && directUrlMatch) {
      // Caso 1: Navegar a una URL específica (caso original)
      plan.steps.push({
        type: 'navigate',
        description: `Navegar a ${directUrlMatch[1]}`,
        params: { url: directUrlMatch[1] }
      });
    } else if (hasSearchIntent) {
      // Caso 2: Realizar una búsqueda
      let searchTerm = prompt;
      if (hasNavigationIntent) {
        // Extraer el término de búsqueda después de patrones como "buscar"
        const match = prompt.match(/(?:busca|encuentra|información sobre|datos de)\s+(.+?)(?:\.|\?|$)/i);
        if (match && match[1]) {
          searchTerm = match[1].trim();
        }
      }
      
      plan.steps.push({
        type: 'search',
        description: `Buscar información sobre "${searchTerm}"`,
        params: { query: searchTerm }
      });
    } else {
      // Caso por defecto: Navegar directamente a Google con el prompt como consulta
      plan.steps.push({
        type: 'search',
        description: `Buscar información sobre "${prompt}"`,
        params: { query: prompt }
      });
    }
    
    // Añadir pasos adicionales según las intenciones
    if (hasExtractionIntent) {
      plan.steps.push({
        type: 'extract',
        description: 'Extraer contenido principal de la página',
        params: { selectors: ['main', '#content', '.content', 'article'] }
      });
    }
    
    if (hasClickIntent) {
      // Intentar identificar qué botón o enlace se debe hacer clic
      const clickMatch = prompt.match(/(?:haz clic|presiona|pulsa|click)(?:\sen\s|\sel\s|\sla\s|\s)([^\.]+)/i);
      const target = clickMatch ? clickMatch[1].trim() : 'enlaces relevantes';
      
      plan.steps.push({
        type: 'click',
        description: `Hacer clic en ${target}`,
        params: { target: target }
      });
    }
    
    if (hasFormIntent) {
      plan.steps.push({
        type: 'form',
        description: 'Completar formulario con datos relevantes',
        params: { formData: 'auto' }
      });
    }
    
    // Si no se detectaron intenciones específicas, añadir un paso de extracción por defecto
    if (plan.steps.length === 1) {
      plan.steps.push({
        type: 'extract',
        description: 'Extraer contenido principal de la página',
        params: { selectors: ['main', '#content', '.content', 'article'] }
      });
    }
    
    return plan;
  }
  
  /**
   * Extrae contenido de la página actual utilizando múltiples selectores
   */
  async extractContent(task): Promise<string> {
    // Intentar extraer contenido principal basado en selectores comunes
    const mainSelectors = [
      'main', 
      '#content', 
      '.content', 
      'article', 
      '.article',
      '.main-content',
      // Añadimos más selectores comunes que podrían contener el contenido principal
      '#main',
      '#main-content',
      '.container',
      '.page-content',
      '.post-content',
      '.entry-content'
    ];
    
    // Primero intentamos obtener el contenido del body para tener algo como respaldo
    let bodyContent = '';
    try {
      bodyContent = await browserAgent.extractText();
      task.addLog(`Contenido extraído del body completo (${bodyContent.length} caracteres)`);
    } catch (err) {
      task.addLog(`Error al extraer contenido del body: ${err.message}`);
      bodyContent = 'No se pudo extraer el contenido de la página.';
    }
    
    // Extraemos información de la página para mejor contexto
    const url = await browserAgent.getUrl();
    const title = await browserAgent.page.title();
    task.addLog(`Intentando extraer contenido de ${title} (${url})`);
    
    // Extraer URLs de imágenes relevantes
    let imageUrls = [];
    try {
      imageUrls = await browserAgent.extractImages();
      if (imageUrls && imageUrls.length > 0) {
        task.addLog(`Extraídas ${imageUrls.length} imágenes relevantes`);
        
        // Guardar las URLs de imágenes en el estado de la tarea para uso posterior
        task.setState('imageUrls', imageUrls);
      } else {
        task.addLog('No se encontraron imágenes relevantes');
      }
    } catch (imgErr) {
      task.addLog(`Error al extraer imágenes: ${imgErr.message}`);
    }
    
    // Intentamos primero estrategias comunes para contenido
    try {
      // 1. ESTRATEGIA: Extraer con solo selectores más probables primero
      const prioritySelectors = ['main', 'article', '#content', '.content'];
      for (const selector of prioritySelectors) {
        try {
          const content = await browserAgent.extractText(selector);
          if (content && !content.startsWith('No se pudo extraer') && content.length > 200) {
            task.addLog(`Contenido extraído de selector prioritario: ${selector} (${content.length} caracteres)`);
            
            // Añadir información sobre imágenes al contenido extraído si hay imágenes disponibles
            if (imageUrls.length > 0) {
              const imagesInfo = `\n\nIMAGES_DATA: ${JSON.stringify(imageUrls)}\n\n`;
              return content + imagesInfo;
            }
            
            return content;
          }
        } catch (err) {
          // Continuar con el siguiente selector prioritario
        }
      }
      
      // 2. ESTRATEGIA: Procesamos los selectores en paralelo para los restantes
      const contentPromises = mainSelectors
        .filter(sel => !prioritySelectors.includes(sel))
        .map(async (selector) => {
          try {
            const content = await browserAgent.extractText(selector);
            // Si el mensaje comienza con "No se pudo extraer" o es muy corto, no es útil
            if (content && !content.startsWith('No se pudo extraer') && content.length > 150) {
              return { selector, content, length: content.length };
            }
            return null;
          } catch (err) {
            return null;
          }
      });
      
      // Esperamos todas las promesas y filtramos resultados nulos
      const contentResults = (await Promise.all(contentPromises)).filter(Boolean);
      
      // Filtramos los resultados nulos y ordenamos por longitud de contenido (de mayor a menor)
      const validResults = contentResults
        .filter(result => result !== null)
        .sort((a, b) => b.length - a.length);
      
      if (validResults.length > 0) {
        // Tomamos el resultado con más contenido
        const extractedContent = validResults[0].content;
        task.addLog(`Contenido extraído de: ${validResults[0].selector} (${extractedContent.length} caracteres)`);
        
        // Añadir información sobre imágenes al contenido extraído si hay imágenes disponibles
        if (imageUrls.length > 0) {
          const imagesInfo = `\n\nIMAGES_DATA: ${JSON.stringify(imageUrls)}\n\n`;
          return extractedContent + imagesInfo;
        }
        
        return extractedContent;
      }
      
      // 3. ESTRATEGIA: Si no encontramos contenido con selectores específicos, 
      // intentamos extraer elementos comunes de información
      task.addLog('No se encontró contenido con selectores específicos, intentando extraer párrafos');
      
      // Extraer todos los párrafos de la página que tengan contenido significativo
      const paragraphs = await browserAgent.page.evaluate(() => {
        const paragraphElements = Array.from(document.querySelectorAll('p'));
        return paragraphElements
          .map(p => p.innerText.trim())
          .filter(text => text.length > 30) // Solo párrafos con contenido significativo
          .join('\n\n');
      });
      
      if (paragraphs && paragraphs.length > 200) {
        task.addLog(`Contenido extraído de párrafos (${paragraphs.length} caracteres)`);
        
        // Añadir información sobre imágenes al contenido extraído si hay imágenes disponibles
        if (imageUrls.length > 0) {
          const imagesInfo = `\n\nIMAGES_DATA: ${JSON.stringify(imageUrls)}\n\n`;
          return paragraphs + imagesInfo;
        }
        
        return paragraphs;
      }
      
      // 4. ESTRATEGIA: Intentar extraer texto de elementos con mucho contenido textual
      task.addLog('Intentando identificar elementos con mayor densidad de texto');
      
      const denseTextContent = await browserAgent.page.evaluate(() => {
        // Función para calcular la densidad de texto de un elemento
        function getTextDensity(element) {
          const text = element.innerText || '';
          const childNodes = element.childNodes.length || 1;
          return text.length / childNodes;
        }
        
        // Obtener elementos con alta densidad de texto (excluyendo elementos muy pequeños)
        const allElements = Array.from(document.querySelectorAll('div, section, main, article'));
        const textDensities = allElements
          .filter(el => (el.innerText || '').length > 100)
          .map(el => ({
            element: el,
            text: el.innerText,
            density: getTextDensity(el)
          }))
          .sort((a, b) => b.density - a.density)
          .slice(0, 3); // Tomar los 3 elementos con mayor densidad
        
        return textDensities.map(item => item.text).join('\n\n');
      });
      
      if (denseTextContent && denseTextContent.length > 150) {
        task.addLog(`Contenido extraído por densidad de texto (${denseTextContent.length} caracteres)`);
        
        // Añadir información sobre imágenes al contenido extraído si hay imágenes disponibles
        if (imageUrls.length > 0) {
          const imagesInfo = `\n\nIMAGES_DATA: ${JSON.stringify(imageUrls)}\n\n`;
          return denseTextContent + imagesInfo;
        }
        
        return denseTextContent;
      }
    } catch (err) {
      task.addLog(`Error durante la extracción de contenido: ${err.message}`);
    }
    
    // Si todo falla, devolvemos el contenido del body que extrajimos al principio
    task.addLog(`Usando contenido del body como respaldo (${bodyContent.length} caracteres)`);
    
    // Añadir información sobre imágenes al contenido del body si hay imágenes disponibles
    if (imageUrls.length > 0) {
      const imagesInfo = `\n\nIMAGES_DATA: ${JSON.stringify(imageUrls)}\n\n`;
      return bodyContent + imagesInfo;
    }
    
    return bodyContent;
  }
  
  /**
   * Ejecuta un paso específico del plan
   */
  async executeStep(step, task, memory): Promise<any> {
    const startTime = Date.now();
    let result = '';
    
    // Asegurar que el navegador esté inicializado antes de ejecutar cualquier acción
    try {
      if (!browserAgent.page) {
        task.addLog('Inicializando navegador antes de ejecutar paso');
        await browserAgent.init();
        
        // Verificar nuevamente para asegurarse que se inicializó correctamente
        if (!browserAgent.page) {
          throw new Error('No se pudo inicializar el navegador');
        }
      }
    } catch (initError) {
      task.addLog(`Error al inicializar navegador: ${initError.message}`);
      throw new Error(`Error al inicializar navegador: ${initError.message}`);
    }
    
    switch (step.type) {
      case 'navigate':
        // Validar que la URL sea correcta y no sea undefined
        const url = step.params?.url;
        if (!url || typeof url !== 'string') {
          const errorMsg = `URL inválida o indefinida: ${url}`;
          task.addLog(`Error: ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        task.addLog(`Navegando a: ${url}`);
        await browserAgent.navigate(url);
        
        // Guardar URL en la memoria
        memory.currentUrl = url;
        
        // Esperar a que la página cargue completamente
        await browserAgent.page.waitForLoadState('networkidle').catch(() => {});
        result = `Navegación completada a ${url}`;
        break;
        
      case 'search':
        const query = step.params?.query;
        if (!query) {
          const errorMsg = 'Consulta de búsqueda no especificada';
          task.addLog(`Error: ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        task.addLog(`Buscando: "${query}"`);
        
        // Si ya estamos en Google, usamos el campo de búsqueda
        const currentUrl = await browserAgent.getUrl();
        if (currentUrl.includes('google.com')) {
          try {
            // Limpiar campo de búsqueda existente
            await browserAgent.page.fill('input[name="q"]', '');
            await browserAgent.typeText('input[name="q"]', query);
            await browserAgent.page.keyboard.press('Enter');
            await browserAgent.page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
          } catch (e) {
            // Si hay error, navegar directamente a la URL de búsqueda
            await browserAgent.navigate(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
          }
        } else {
          // Si no estamos en Google, navegar directamente a la URL de búsqueda
          await browserAgent.navigate(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
        }
        
        // Esperar a que los resultados se carguen
        await browserAgent.page.waitForLoadState('networkidle').catch(() => {});
        result = `Búsqueda completada para: "${query}"`;
        break;
        
      case 'extract':
        task.addLog('Extrayendo contenido de la página');
        const content = await this.extractContent(task);
        result = `Contenido extraído (${content.length} caracteres)`;
        break;
        
      case 'click':
        const target = step.params?.target;
        if (!target) {
          const errorMsg = 'Objetivo de clic no especificado';
          task.addLog(`Error: ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        task.addLog(`Intentando hacer clic en: ${target}`);
        
        let clicked = false;
        
        // ESTRATEGIA 1: Mejorada - Implementación robusta para encontrar elementos clicables
        try {
          // Primero, identificar elementos visibles que coincidan con el texto del objetivo
          const visibleClickableElements = await browserAgent.page.evaluate((targetText) => {
            const allElements = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"], [onclick]'));
            
            // Filtrar solo elementos visibles con texto que coincida
            return allElements
              .filter(el => {
                // Verificar visibilidad
                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0 && 
                                  window.getComputedStyle(el).visibility !== 'hidden' &&
                                  window.getComputedStyle(el).display !== 'none';
                
                if (!isVisible) return false;
                
                // Obtener texto del elemento
                const text = el.innerText || el.textContent || el.value || '';
                
                // Verificar si el texto coincide
                return text.toLowerCase().includes(targetText.toLowerCase());
              })
              .map(el => {
                // Construir un selector único para este elemento
                const tag = el.tagName.toLowerCase();
                const id = el.id ? `#${el.id}` : '';
                const classes = el.className && typeof el.className === 'string' ? 
                  `.${el.className.split(' ').filter(c => c).join('.')}` : '';
                
                // Obtener coordenadas para clic directo si es necesario
                const rect = el.getBoundingClientRect();
                
                return {
                  selector: id || (classes && tag + classes) || tag,
                  text: (el.innerText || el.textContent || el.value || '').trim(),
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                  visible: true
                };
              });
          }, target);
          
          // Si encontramos elementos visibles que coinciden con el objetivo
          if (visibleClickableElements && visibleClickableElements.length > 0) {
            // Intentar hacer clic usando su selector
            try {
              const bestMatch = visibleClickableElements[0];
              task.addLog(`Elemento coincidente encontrado: "${bestMatch.text}" (${bestMatch.selector})`);
              
              // Primero intentar hacer clic usando el selector
              await browserAgent.page.click(bestMatch.selector, { timeout: 3000 });
              clicked = true;
              task.addLog(`Clic exitoso en elemento "${bestMatch.text}"`);
            } catch (selectorError) {
              // Si falla el clic por selector, intentar clic por coordenadas
              task.addLog(`Clic por selector falló, intentando clic por coordenadas`);
              const bestMatch = visibleClickableElements[0];
              await browserAgent.page.mouse.click(bestMatch.x, bestMatch.y);
              clicked = true;
              task.addLog(`Clic exitoso por coordenadas en "${bestMatch.text}"`);
            }
          }
        } catch (evalError) {
          task.addLog(`Error al evaluar elementos visibles: ${evalError.message}`);
          // Continuar con otras estrategias
        }
        
        // ESTRATEGIA 2: Si no pudimos hacer clic por coincidencia de texto, intentar con selectores específicos
        if (!clicked) {
          try {
            // Crear selectores específicos basados en el texto del objetivo
            const selectors = [
              `a:text("${target}")`,
              `button:text("${target}")`,
              `[role="button"]:text("${target}")`,
              `a:text-matches("${target}", "i")`,
              `button:text-matches("${target}", "i")`,
              `[role="button"]:text-matches("${target}", "i")`,
              `a[title*="${target}" i]`,
              `a[aria-label*="${target}" i]`,
              `button[aria-label*="${target}" i]`
            ];
            
            // Intentar con cada selector
            for (const selector of selectors) {
              try {
                // Comprobar si el elemento existe y es visible
                const isVisible = await browserAgent.page.evaluate((sel) => {
                  const el = document.querySelector(sel);
                  if (!el) return false;
                  
                  const rect = el.getBoundingClientRect();
                  return rect.width > 0 && rect.height > 0 && 
                         window.getComputedStyle(el).visibility !== 'hidden' &&
                         window.getComputedStyle(el).display !== 'none';
                }, selector);
                
                if (isVisible) {
                  await browserAgent.page.click(selector, { timeout: 3000 });
                  task.addLog(`Clic exitoso en elemento "${target}" usando selector: ${selector}`);
                  clicked = true;
                  break;
                }
              } catch (e) {
                // Intentar con el siguiente selector
              }
            }
          } catch (e) {
            // Continuar con otras estrategias
          }
        }
        
        // ESTRATEGIA 3: Si el target menciona "primer" resultado o enlace
        if (!clicked && (target.includes('primer') || target.includes('1') || target.includes('primero'))) {
          try {
            // Si estamos en una página de resultados de Google
            if ((await browserAgent.getUrl()).includes('google.com/search')) {
              // Usar evaluación para encontrar el primer resultado visible
              const firstVisibleResult = await browserAgent.page.evaluate(() => {
                const results = Array.from(document.querySelectorAll('a h3')).map(h3 => h3.closest('a'));
                
                for (const link of results) {
                  if (!link) continue;
                  
                  const rect = link.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    return {
                      text: link.innerText || '',
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2
                    };
                  }
                }
                return null;
              });
              
              if (firstVisibleResult) {
                await browserAgent.page.mouse.click(firstVisibleResult.x, firstVisibleResult.y);
                task.addLog(`Clic en el primer resultado de búsqueda: "${firstVisibleResult.text.substring(0, 30)}..."`);
                clicked = true;
              } else {
                // Intento alternativo en Google
                await browserAgent.page.click('h3', { timeout: 3000 });
                task.addLog('Clic en el primer resultado de búsqueda de Google (h3)');
                clicked = true;
              }
            } else {
              // En otras páginas, intentar encontrar el primer enlace visible
              const firstVisibleLink = await browserAgent.page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                
                for (const link of links) {
                  const rect = link.getBoundingClientRect();
                  const computedStyle = window.getComputedStyle(link);
                  
                  // Verificar que el enlace es visible, tiene contenido y está en el viewport
                  if (rect.width > 0 && rect.height > 0 && 
                      computedStyle.visibility !== 'hidden' && 
                      computedStyle.display !== 'none' &&
                      rect.top >= 0 && rect.top < window.innerHeight) {
                    
                    // Verificar que tiene texto o algún contenido útil
                    const text = link.innerText || link.textContent || '';
                    const hasImage = link.querySelector('img') !== null;
                    
                    if (text.trim().length > 0 || hasImage) {
                      return {
                        text: text.trim().substring(0, 50),
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2
                      };
                    }
                  }
                }
                return null;
              });
              
              if (firstVisibleLink) {
                await browserAgent.page.mouse.click(firstVisibleLink.x, firstVisibleLink.y);
                task.addLog(`Clic en el primer enlace visible: "${firstVisibleLink.text}"`);
                clicked = true;
              }
            }
          } catch (e) {
            task.addLog(`Error al intentar clic en primer enlace: ${e.message}`);
            // Continuar con otras estrategias
          }
        }
        
        // ESTRATEGIA 4: Si todo lo demás falla, buscar cualquier elemento clicable visible 
        if (!clicked) {
          try {
            // Obtener todos los elementos clicables visibles
            const visibleElements = await browserAgent.page.evaluate(() => {
              const elements = Array.from(document.querySelectorAll('a, button, [role="button"]'));
              return elements
                .filter(el => {
                  const rect = el.getBoundingClientRect();
                  const style = window.getComputedStyle(el);
                  return rect.width > 0 && rect.height > 0 && 
                         style.visibility !== 'hidden' && 
                         style.display !== 'none' &&
                         rect.top >= 0 && rect.top < window.innerHeight;
                })
                .slice(0, 5) // Limitamos a los 5 primeros para no sobrecarga
                .map(el => ({
                  text: (el.innerText || el.textContent || '').trim().substring(0, 30),
                  tag: el.tagName.toLowerCase(),
                  x: el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2,
                  y: el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2
                }));
            });
            
            if (visibleElements && visibleElements.length > 0) {
              // Hacer clic en el primer elemento visible
              const element = visibleElements[0];
              await browserAgent.page.mouse.click(element.x, element.y);
              task.addLog(`Clic fallback en elemento visible: ${element.tag} "${element.text}"`);
              clicked = true;
            } else {
              throw new Error('No se encontraron elementos visibles para hacer clic');
            }
          } catch (e) {
            throw new Error(`No se pudo hacer clic en ningún elemento relacionado con "${target}": ${e.message}`);
          }
        }
        
        // Esperar a que la página cargue después del clic
        await browserAgent.page.waitForLoadState('networkidle').catch(() => {});
        result = `Clic realizado en elemento relacionado con "${target}"`;
        break;
        
      case 'form':
        task.addLog('Completando formulario');
        
        // Implementación mejorada para formularios
        try {
          // Detectar todos los campos de formulario
          const formFields = await browserAgent.page.$$('input:visible:not([type="hidden"]):not([type="submit"]), textarea:visible, select:visible');
          let filledFields = 0;
          
          for (const field of formFields) {
            // Obtener atributos del campo
            const type = await field.getAttribute('type') || '';
            const name = await field.getAttribute('name') || '';
            const id = await field.getAttribute('id') || '';
            const placeholder = await field.getAttribute('placeholder') || '';
            const label = await field.getAttribute('aria-label') || '';
            
            // Recopilar pistas sobre el tipo de campo
            const fieldInfo = [type, name, id, placeholder, label].map(s => s.toLowerCase());
            const fieldText = fieldInfo.join(' ');
            
            // Determinar qué datos ingresar según el tipo de campo
            let valueToEnter = '';
            
            if (type === 'checkbox' || type === 'radio') {
              // Marcar la primera opción si parece relevante
              if (Math.random() > 0.5) { // Simplemente alternar algunos checkboxes
                await field.check();
                filledFields++;
                task.addLog(`Marcado: ${name || id || 'checkbox'}`);
              }
              continue;
            } else if (type === 'email' || fieldText.includes('email') || fieldText.includes('correo')) {
              valueToEnter = 'usuario.prueba@example.com';
            } else if (fieldText.includes('nombre') || fieldText.includes('name')) {
              valueToEnter = 'Usuario Prueba';
            } else if (fieldText.includes('apellido') || fieldText.includes('last')) {
              valueToEnter = 'Apellido Prueba';
            } else if (fieldText.includes('telefono') || fieldText.includes('phone') || fieldText.includes('tel')) {
              valueToEnter = '123456789';
            } else if (fieldText.includes('mensaje') || fieldText.includes('message') || fieldText.includes('comment')) {
              valueToEnter = 'Este es un mensaje de prueba generado automáticamente.';
            } else if (fieldText.includes('direccion') || fieldText.includes('address')) {
              valueToEnter = 'Calle de Prueba 123';
            } else if (fieldText.includes('ciudad') || fieldText.includes('city')) {
              valueToEnter = 'Ciudad de Prueba';
            } else if (fieldText.includes('pais') || fieldText.includes('country')) {
              valueToEnter = 'España';
            } else if (fieldText.includes('codigo') || fieldText.includes('postal') || fieldText.includes('zip')) {
              valueToEnter = '28001';
            } else if (fieldText.includes('contraseña') || fieldText.includes('password')) {
              valueToEnter = 'Contraseña123!';
            } else if (type === 'text') {
              valueToEnter = 'Texto de prueba';
            } else {
              valueToEnter = 'Datos de prueba';
            }
            
            // Rellenar el campo
            try {
              await field.fill(valueToEnter);
              filledFields++;
              task.addLog(`Campo completado: ${name || id || placeholder || 'campo'} = "${valueToEnter}"`);
            } catch (fieldError) {
              task.addLog(`No se pudo completar el campo: ${fieldError.message}`);
            }
          }
          
          // Si rellenamos algún campo, intentar enviar el formulario
          if (filledFields > 0) {
            // Buscar botón de envío en este orden de prioridad
            const submitSelectors = [
              'button[type="submit"]',
              'input[type="submit"]',
              'button:has-text("Enviar")',
              'button:has-text("Submit")',
              'button:has-text("Continuar")',
              'button:has-text("Continue")',
              '.btn-primary',
              '.submit-button'
            ];
            
            for (const selector of submitSelectors) {
              try {
                const visible = await browserAgent.page.isVisible(selector);
                if (visible) {
                  await browserAgent.clickElement(selector);
                  task.addLog('Formulario enviado');
                  
                  // Esperar a que la página se actualice
                  await browserAgent.page.waitForLoadState('networkidle').catch(() => {});
                  break;
                }
              } catch (e) {
                // Probar con el siguiente selector
              }
            }
          }
          
          result = `Formulario completado con ${filledFields} campos`;
        } catch (formError) {
          task.addLog(`Error general al completar formulario: ${formError.message}`);
          throw formError;
        }
        break;
        
      case 'scroll':
        const direction = step.params.direction || 'down';
        const amount = step.params.amount || 0.7; // Por defecto 70% de la página
        
        task.addLog(`Desplazando la página hacia ${direction}`);
        
        if (direction === 'down') {
          await browserAgent.page.evaluate((scrollAmount) => {
            window.scrollBy(0, window.innerHeight * scrollAmount);
          }, amount);
        } else if (direction === 'up') {
          await browserAgent.page.evaluate((scrollAmount) => {
            window.scrollBy(0, -window.innerHeight * scrollAmount);
          }, amount);
        } else if (direction === 'top') {
          await browserAgent.page.evaluate(() => {
            window.scrollTo(0, 0);
          });
        } else if (direction === 'bottom') {
          await browserAgent.page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
        }
        
        // Esperar un momento para que carguen elementos después del scroll
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = `Página desplazada hacia ${direction}`;
        break;
        
      case 'wait':
        const waitTime = step.params.time || 3;
        task.addLog(`Esperando ${waitTime} segundos`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        result = `Espera de ${waitTime} segundos completada`;
        break;
        
      default:
        throw new Error(`Tipo de paso no reconocido: ${step.type}`);
    }
    
    // Calcular el tiempo que tomó ejecutar el paso
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    return { result, elapsedTime: `${elapsedTime}s` };
  }
  
  // Ejecutar una acción específica en el navegador (API de acciones directas)
  async executeBrowserAction(taskId: string, action: string, params: any): Promise<string> {
    const task = taskService.getTaskById(taskId);
    if (!task) {
      throw new Error(`Tarea no encontrada: ${taskId}`);
    }
    
    await browserAgent.init();
    let result = '';
    
    try {
      switch (action) {
        case 'navigate':
          result = await browserAgent.navigate(params.url);
          break;
        case 'click':
          result = await browserAgent.clickElement(params.selector);
          break;
        case 'type':
          result = await browserAgent.typeText(params.selector, params.text);
          break;
        case 'extract':
          result = await browserAgent.extractText(params.selector);
          break;
        case 'select':
          result = await browserAgent.selectOption(params.selector, params.option);
          break;
        case 'find':
          result = await browserAgent.findElements(params.selector);
          break;
        case 'screenshot':
          result = await browserAgent.takeScreenshot(params.path || `screenshot-${taskId}.png`);
          break;
        case 'diagnose':
          result = await this.diagnosePage(task);
          break;
        default:
          throw new Error(`Acción no soportada: ${action}`);
      }
      
      task.addLog(`Acción '${action}' ejecutada: ${result.substring(0, 100)}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      task.addLog(`Error en acción '${action}': ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Diagnostica el estado actual de la página y proporciona información detallada
   * sobre el DOM, recursos cargados, y posibles problemas
   */
  async diagnosePage(task): Promise<string> {
    try {
      if (!browserAgent.page) {
        await browserAgent.init();
      }
      
      const page = browserAgent.page;
      
      task.addLog(`Ejecutando diagnóstico de página...`);
      
      // Recolectar información básica
      const url = await page.url();
      const title = await page.title();
      
      // Analizar la estructura de la página
      const pageStructure = await page.evaluate(() => {
        // Información de la estructura del DOM
        const domStats = {
          totalElements: document.querySelectorAll('*').length,
          headings: {
            h1: document.querySelectorAll('h1').length,
            h2: document.querySelectorAll('h2').length,
            h3: document.querySelectorAll('h3').length,
          },
          paragraphs: document.querySelectorAll('p').length,
          links: document.querySelectorAll('a').length,
          images: document.querySelectorAll('img').length,
          forms: document.querySelectorAll('form').length,
          inputs: document.querySelectorAll('input').length,
          buttons: document.querySelectorAll('button').length,
          scripts: document.querySelectorAll('script').length,
          iframes: document.querySelectorAll('iframe').length,
        };
        
        // Detectar problemas comunes
        const potentialIssues = [];
        
        // Problema: Sin contenido principal
        if (document.querySelectorAll('main, article, #content, .content').length === 0) {
          potentialIssues.push('No se detectaron contenedores principales (main, article, #content, .content)');
        }
        
        // Problema: Página muy pequeña
        if (document.body.innerText.length < 100) {
          potentialIssues.push('La página tiene muy poco texto (menos de 100 caracteres)');
        }
        
        // Problema: Posible página de error
        if (
          document.title.toLowerCase().includes('error') || 
          document.title.toLowerCase().includes('not found') ||
          document.body.innerText.toLowerCase().includes('404') ||
          document.body.innerText.toLowerCase().includes('not found') ||
          document.body.innerText.toLowerCase().includes('error')
        ) {
          potentialIssues.push('La página posiblemente muestra un error (404, not found, etc.)');
        }
        
        // Problema: Detección de overlays o modales
        const modals = document.querySelectorAll('.modal, [class*="modal"], [id*="modal"], dialog[open]');
        if (modals.length > 0) {
          potentialIssues.push(`Se detectaron ${modals.length} posibles ventanas modales o diálogos`);
        }
        
        // Problema: Cookies o banners de privacidad
        const cookieBanners = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.innerText || '';
          const id = (el.id || '').toLowerCase();
          const className = (el.className || '').toLowerCase();
          
          return (
            (text.includes('cookie') || text.includes('privacy') || text.includes('gdpr')) &&
            (id.includes('banner') || id.includes('consent') || id.includes('cookie') || 
             className.includes('banner') || className.includes('consent') || className.includes('cookie'))
          );
        });
        
        if (cookieBanners.length > 0) {
          potentialIssues.push('Se detectaron posibles banners de cookies o consentimiento GDPR');
        }
        
        // Elementos interactivos principales
        const mainInteractiveElements = [];
        document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]').forEach(el => {
          const text = el.innerText || el.value || '';
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && text.trim().length > 0) {
            mainInteractiveElements.push({
              type: el.tagName.toLowerCase(),
              text: text.substring(0, 50),
              isVisible: rect.top >= 0 && rect.left >= 0 && 
                         rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
            });
            
            // Limitamos a 15 elementos
            if (mainInteractiveElements.length >= 15) return;
          }
        });
        
        // Detectar frameworks web
        const frameworks = [];
        if (window['React'] || document.querySelector('[data-reactroot]')) frameworks.push('React');
        if (window['angular'] || document.querySelector('[ng-app]')) frameworks.push('Angular');
        if (window['Vue']) frameworks.push('Vue.js');
        if (document.querySelector('.ember-view')) frameworks.push('Ember.js');
        if (window['jQuery'] || window['$']) frameworks.push('jQuery');
        
        return {
          domStats,
          potentialIssues,
          mainInteractiveElements,
          frameworks,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
        };
      });
      
      // Obtener información de recursos
      const resourcesInfo = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        const stats = {
          total: resources.length,
          byType: {},
          slow: []
        };
        
        resources.forEach(resource => {
          // Categorizar por tipo
          const type = resource.initiatorType || 'other';
          if (!stats.byType[type]) stats.byType[type] = 0;
          stats.byType[type]++;
          
          // Detectar recursos lentos (>1s)
          if (resource.duration > 1000) {
            stats.slow.push({
              name: resource.name,
              duration: Math.round(resource.duration),
              type: type
            });
          }
        });
        
        // Limitamos la cantidad de recursos lentos reportados
        stats.slow = stats.slow.slice(0, 10);
        
        return stats;
      });
      
      // Comprobar si la página está completamente cargada
      const loadState = await page.evaluate(() => {
        return {
          readyState: document.readyState,
          domContentLoaded: performance.timing.domContentLoadedEventEnd > 0,
          loaded: performance.timing.loadEventEnd > 0,
          timeToInteractive: performance.timing.domInteractive - performance.timing.navigationStart,
          timeToLoad: performance.timing.loadEventEnd - performance.timing.navigationStart
        };
      });
      
      // Comprobar errores en la consola
      const consoleMessages = [];
      page.on('console', msg => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
          consoleMessages.push({
            type: type,
            text: msg.text().substring(0, 150)
          });
        }
      });
      
      // Simular un breve tiempo para capturar mensajes de consola
      await page.waitForTimeout(500);
      
      // Preparar el informe diagnóstico completo
      const diagnostic = {
        basicInfo: {
          url: url,
          title: title,
          timestamp: new Date().toISOString()
        },
        loadState: loadState,
        pageStructure: pageStructure,
        resourcesInfo: resourcesInfo,
        consoleErrors: consoleMessages.slice(0, 10) // Limitar a 10 errores
      };
      
      // Formatear el resultado para mostrarlo
      const report = [
        `=== DIAGNÓSTICO DE PÁGINA ===`,
        `URL: ${url}`,
        `Título: ${title}`,
        `Estado: ${loadState.readyState}`,
        `Tiempo de carga: ${loadState.timeToLoad}ms`,
        ``,
        `--- ESTRUCTURA DOM ---`,
        `Elementos totales: ${pageStructure.domStats.totalElements}`,
        `Encabezados: H1: ${pageStructure.domStats.headings.h1}, H2: ${pageStructure.domStats.headings.h2}, H3: ${pageStructure.domStats.headings.h3}`,
        `Párrafos: ${pageStructure.domStats.paragraphs}`,
        `Enlaces: ${pageStructure.domStats.links}`,
        `Imágenes: ${pageStructure.domStats.images}`,
        `Formularios: ${pageStructure.domStats.forms}`,
        `Botones: ${pageStructure.domStats.buttons}`,
        `Marcos (iframes): ${pageStructure.domStats.iframes}`,
        ``,
        `--- RECURSOS ---`,
        `Recursos totales: ${resourcesInfo.total}`,
        `Por tipo: ${Object.entries(resourcesInfo.byType).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
        `Recursos lentos (>1s): ${resourcesInfo.slow.length}`,
        resourcesInfo.slow.map(r => `  - ${r.name} (${r.duration}ms)`).join('\n'),
        ``,
        `--- PROBLEMAS DETECTADOS ---`,
        pageStructure.potentialIssues.length > 0 
          ? pageStructure.potentialIssues.map(issue => `- ${issue}`).join('\n')
          : '- No se detectaron problemas específicos',
        ``,
        `--- ELEMENTOS INTERACTIVOS PRINCIPALES ---`,
        pageStructure.mainInteractiveElements.map(el => 
          `- ${el.type}: "${el.text}" ${el.isVisible ? '(visible)' : '(fuera de vista)'}`
        ).join('\n'),
        ``,
        `--- TECNOLOGÍAS DETECTADAS ---`,
        `Frameworks: ${pageStructure.frameworks.length > 0 ? pageStructure.frameworks.join(', ') : 'Ninguno detectado'}`,
        ``,
        `--- ERRORES DE CONSOLA ---`,
        consoleMessages.length > 0
          ? consoleMessages.map(msg => `- [${msg.type}] ${msg.text}`).join('\n')
          : '- No se detectaron errores en consola',
      ].join('\n');
      
      // Guardar diagnóstico completo en el estado de la tarea
      task.setState('pageDiagnostic', diagnostic);
      task.addLog('Diagnóstico de página completado');
      
      return report;
    } catch (error) {
      logger.error(`Error durante el diagnóstico de página: ${error.message}`, { taskId: task.id });
      return `Error al diagnosticar página: ${error.message}`;
    }
  }
}

export default new BrowserAgentService(); 