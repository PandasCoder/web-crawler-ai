// @ts-nocheck
import { Browser, BrowserContext, Page, chromium, ElementHandle } from 'playwright';
import config from '../config/config.js';
import logger from '../utils/logger.js';

export class BrowserAgent {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private state: any = {};
  private history: Array<{ action: string, params: any, result: any }> = [];

  async init(): Promise<void> {
    if (!this.browser) {
      logger.info('Inicializando navegador para BrowserAgent');
      this.browser = await chromium.launch({
        headless: !config.debug,
      });
      
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'es,pt-BR;q=0.9,pt;q=0.8,en-US;q=0.7,en;q=0.6',
          'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'upgrade-insecure-requests': '1'
        }
      });
      
      this.page = await this.context.newPage();
      await this.page.setDefaultTimeout(10000);
    }
  }

  // Registrar acciones para memoria del agente
  private logAction(action: string, params: any, result: any): void {
    this.history.push({ action, params, result });
    logger.debug(`Acción ejecutada: ${action}`, { params });
  }

  // Obtener estado simplificado del DOM para el LLM
  async getDOMState(): Promise<string> {
    if (!this.page) throw new Error('El navegador no está inicializado');
    
    return await this.page.evaluate(() => {
      // Función para simplificar el DOM y hacerlo más pequeño para el LLM
      function summarizeElement(el, depth = 0, maxDepth = 3) {
        if (depth > maxDepth) return { tag: '...', truncated: true };
        
        // Obtener atributos relevantes
        const id = el.id ? el.id : null;
        const className = el.className && typeof el.className === 'string' ? el.className : null;
        const role = el.getAttribute('role');
        const ariaLabel = el.getAttribute('aria-label');
        const type = el.getAttribute('type');
        const href = el.getAttribute('href');
        const src = el.getAttribute('src');
        const alt = el.getAttribute('alt');
        const placeholder = el.getAttribute('placeholder');
        
        // Obtener texto visible (truncado)
        let text = null;
        if (el.tagName === 'INPUT' && el.value) {
          text = el.value.substring(0, 100);
        } else if (el.innerText) {
          text = el.innerText.substring(0, 100).trim();
          if (text && el.innerText.length > 100) text += '...';
        }
        
        // Crear representación del elemento
        const elem: any = {
          tag: el.tagName.toLowerCase(),
        };
        
        if (id) elem.id = id;
        if (className) elem.class = className;
        if (role) elem.role = role;
        if (ariaLabel) elem.ariaLabel = ariaLabel;
        if (type) elem.type = type;
        if (href) elem.href = href;
        if (src) elem.src = src;
        if (alt) elem.alt = alt;
        if (placeholder) elem.placeholder = placeholder;
        if (text) elem.text = text;
        
        // Posición en la pantalla
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          elem.position = {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible: true
          };
        } else {
          elem.position = { visible: false };
        }
        
        // Verificar si es interactuable
        elem.interactive = (
          el.tagName === 'A' || 
          el.tagName === 'BUTTON' || 
          el.tagName === 'INPUT' || 
          el.tagName === 'SELECT' || 
          el.tagName === 'TEXTAREA' || 
          el.onclick != null || 
          el.getAttribute('role') === 'button'
        );
        
        // Procesar solo elementos importantes para los hijos
        if (depth < maxDepth) {
          const importantChildren = Array.from(el.children).filter(child => {
            // Filtrar elementos no visibles o muy pequeños
            const childRect = child.getBoundingClientRect();
            return (
              child.tagName !== 'SCRIPT' &&
              child.tagName !== 'STYLE' &&
              child.tagName !== 'META' &&
              childRect.width > 5 && 
              childRect.height > 5
            );
          });
          
          if (importantChildren.length > 0) {
            // Limitar cantidad de hijos procesados
            const childrenToProcess = importantChildren.slice(0, 10);
            elem.children = childrenToProcess.map(child => 
              summarizeElement(child, depth + 1, maxDepth)
            );
            
            if (importantChildren.length > 10) {
              elem.children.push({ tag: '...', moreChildren: importantChildren.length - 10 });
            }
          }
        }
        
        return elem;
      }
      
      // Empezar con el body y resumir elementos importantes
      const importantElements = [];
      const mainNavigation = document.querySelector('nav') || document.querySelector('header');
      const mainContent = document.querySelector('main') || document.querySelector('#content') || document.querySelector('.content');
      const forms = Array.from(document.querySelectorAll('form'));
      
      if (mainNavigation) importantElements.push(summarizeElement(mainNavigation));
      if (mainContent) importantElements.push(summarizeElement(mainContent));
      forms.forEach(form => importantElements.push(summarizeElement(form)));
      
      // Si no hay elementos identificables claros, tomar elementos visibles principales
      if (importantElements.length === 0) {
        const allElements = Array.from(document.querySelectorAll('body > *'));
        const visibleElements = allElements.filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 10 && rect.height > 10;
        });
        
        visibleElements.slice(0, 5).forEach(el => {
          importantElements.push(summarizeElement(el));
        });
      }
      
      return {
        title: document.title,
        url: window.location.href,
        elements: importantElements
      };
    });
  }

  // Métodos principales para interactuar con el navegador
  async navigate(url: string): Promise<string> {
    try {
      await this.init();
      if (!this.page) throw new Error('El navegador no está inicializado');
      
      logger.info(`Navegando a: ${url}`);
      const response = await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await this.page.waitForLoadState('networkidle').catch(() => {
        logger.warn('Timeout esperando networkidle, continuando...');
      });
      
      const status = response?.status() || 0;
      const content = await this.page.content();
      const title = await this.page.title();
      
      this.logAction('navigate', { url }, { status, title });
      
      return `Navegación a ${url} completada. Título: "${title}". Estado: ${status}`;
    } catch (error) {
      logger.error(`Error al navegar a ${url}:`, error);
      throw error;
    }
  }

  async clickElement(selector: string): Promise<string> {
    try {
      if (!this.page) throw new Error('El navegador no está inicializado');
      
      logger.info(`Haciendo clic en elemento: ${selector}`);
      await this.page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
      
      // Desplazar hacia el elemento y hacer clic
      const element = await this.page.$(selector);
      if (!element) throw new Error(`Elemento no encontrado: ${selector}`);
      
      await element.scrollIntoViewIfNeeded();
      await element.click();
      
      // Esperar a que se estabilice la página
      await this.page.waitForLoadState('networkidle').catch(() => {
        logger.warn('Timeout esperando networkidle después del clic, continuando...');
      });
      
      this.logAction('click', { selector }, { success: true });
      
      return `Clic en elemento "${selector}" realizado con éxito`;
    } catch (error) {
      logger.error(`Error al hacer clic en ${selector}:`, error);
      throw error;
    }
  }

  async typeText(selector: string, text: string): Promise<string> {
    try {
      if (!this.page) throw new Error('El navegador no está inicializado');
      
      logger.info(`Escribiendo texto en: ${selector}`);
      await this.page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
      
      // Limpiar campo de texto y escribir
      await this.page.click(selector);
      await this.page.fill(selector, text);
      
      this.logAction('type', { selector, text }, { success: true });
      
      return `Texto "${text}" escrito en "${selector}" con éxito`;
    } catch (error) {
      logger.error(`Error al escribir en ${selector}:`, error);
      throw error;
    }
  }

  async extractText(selector?: string): Promise<string> {
    try {
      if (!this.page) throw new Error('El navegador no está inicializado');
      
      // Si no se proporciona selector, extraemos el texto relevante de la página completa usando técnicas avanzadas
      if (!selector) {
        logger.info('Extrayendo texto relevante de la página completa');
        
        // Utilizamos técnicas de extracción avanzadas inspiradas en readability
        const extractedText = await this.page.evaluate(() => {
          // Función para encontrar el contenedor principal del contenido
          function findMainContentContainer() {
            // 1. Función para calcular la densidad de texto (texto/nodos)
            function getTextDensity(element) {
              if (!element) return 0;
              const text = element.innerText || '';
              // Usamos childNodes como divisor para evitar elementos con muchos pequeños nodos
              const childNodes = element.childNodes.length || 1;
              return text.length / childNodes;
            }
            
            // 2. Función para calcular densidad de etiquetas (proporción de etiquetas significativas)
            function getTagDensity(element) {
              if (!element) return 0;
              const allTags = element.getElementsByTagName('*').length || 1;
              const significantTags = [
                ...element.getElementsByTagName('p'),
                ...element.getElementsByTagName('h1'),
                ...element.getElementsByTagName('h2'),
                ...element.getElementsByTagName('h3'),
                ...element.getElementsByTagName('h4'),
                ...element.getElementsByTagName('li'),
                ...element.getElementsByTagName('blockquote')
              ].length;
              
              return significantTags / allTags;
            }
            
            // 3. Función para evaluar la calidad del contenido de un elemento
            function getContentScore(element) {
              if (!element) return 0;
              const text = element.innerText || '';
              if (text.length < 100) return 0;
              
              // Factores positivos
              let score = 0;
              score += getTextDensity(element) * 10;
              score += getTagDensity(element) * 20;
              score += (text.length / 100) * 1; // Más largo es mejor
              
              // Bonos por elementos contenedores comunes
              const tagName = element.tagName.toLowerCase();
              const id = (element.id || '').toLowerCase();
              const className = (element.className || '').toLowerCase();
              
              // Bonos por nombres comunes de contenedores de contenido
              if (tagName === 'article' || tagName === 'main') score += 30;
              if (id.includes('content') || id.includes('main') || id.includes('article')) score += 25;
              if (className.includes('content') || className.includes('main') || className.includes('article')) score += 25;
              if (id.includes('post') || className.includes('post')) score += 20;
              
              // Descuento por áreas que probablemente no sean contenido principal
              if (id.includes('sidebar') || className.includes('sidebar')) score -= 50;
              if (id.includes('comment') || className.includes('comment')) score -= 30;
              if (id.includes('menu') || className.includes('menu')) score -= 50;
              if (id.includes('header') || className.includes('header')) score -= 40;
              if (id.includes('footer') || className.includes('footer')) score -= 50;
              if (id.includes('nav') || className.includes('nav')) score -= 50;
              
              return score;
            }
            
            // 4. Seleccionamos candidatos a contenedores principales
            const candidates = [
              document.querySelector('article'),
              document.querySelector('main'),
              document.querySelector('#content'),
              document.querySelector('.content'),
              document.querySelector('.post-content'),
              document.querySelector('.article'),
              document.querySelector('.main-content'),
              document.querySelector('#main'),
              document.querySelector('#main-content'),
              document.body // Fallback
            ].filter(Boolean); // Eliminar nulos
            
            // Agregar elementos con alta densidad de texto
            const allElements = Array.from(document.querySelectorAll('div, section, article, main'));
            const denseElements = allElements
              .filter(el => (el.innerText || '').length > 1000)
              .filter(el => getTextDensity(el) > 10);
            
            candidates.push(...denseElements);
            
            // 5. Evaluar cada candidato y seleccionar el mejor
            let bestCandidate = null;
            let bestScore = -1;
            
            for (const candidate of candidates) {
              const score = getContentScore(candidate);
              if (score > bestScore) {
                bestCandidate = candidate;
                bestScore = score;
              }
            }
            
            return bestCandidate || document.body;
          }
          
          // Encontrar y extraer el texto del mejor contenedor de contenido
          const mainContainer = findMainContentContainer();
          
          // Si hay un contenedor principal, obtener su texto
          if (mainContainer !== document.body) {
            return mainContainer.innerText || mainContainer.textContent || '';
          }
          
          // Si no encontramos un contenedor principal, recopilar párrafos importantes
          const paragraphs = Array.from(document.querySelectorAll('p'))
            .filter(p => {
              const text = p.innerText || '';
              return text.length > 30 && text.split(' ').length > 5;
            })
            .map(p => p.innerText || p.textContent)
            .join('\n\n');
          
          if (paragraphs.length > 500) {
            return paragraphs;
          }
          
          // Si todo falla, devolver el texto del body pero eliminar menús y elementos no relevantes
          const bodyText = document.body.innerText || document.body.textContent || '';
          return bodyText;
        });
        
        // Limitamos el texto a 50000 caracteres para evitar respuestas demasiado grandes
        const limitedText = extractedText.substring(0, 50000);
        this.logAction('extractText', { method: 'advanced' }, { textLength: limitedText.length });
        
        return limitedText;
      }
      
      // Si se proporciona un selector específico, intentamos extraer su texto de forma robusta
      logger.info(`Extrayendo texto de: ${selector}`);
      
      // Usamos un enfoque sin esperas que evalúa directamente en la página para evitar timeouts
      const extractResult = await this.page.evaluate((sel) => {
        // Función interna para obtener texto de un elemento y sus descendientes
        function getElementText(element) {
          if (!element) return null;
          
          // Intentar varias propiedades de texto en orden de preferencia
          let text = element.innerText || element.textContent || '';
          
          // Limpieza básica del texto
          text = text.trim();
          
          // Reemplazar múltiples espacios/saltos de línea con uno solo
          text = text.replace(/\s+/g, ' ');
          
          return text;
        }
        
        // 1. Intentar selector exacto
        const element = document.querySelector(sel);
        if (element) {
          const text = getElementText(element);
          if (text && text.length > 0) {
            return { 
              found: true, 
              text,
              method: 'exact-match'
            };
          }
        }
        
        // 2. Intentar variantes del selector para mayor robustez
        // Por ejemplo, si el selector es ".content", probar variantes como ".main-content"
        const baseSelector = sel.replace(/^[#.]/, '');
        const variantSelectors = [
          `[class*="${baseSelector}"]`,
          `[id*="${baseSelector}"]`,
          `[data-testid*="${baseSelector}"]`
        ];
        
        for (const variantSel of variantSelectors) {
          try {
            const elements = document.querySelectorAll(variantSel);
            if (elements.length > 0) {
              // Ordenar por cantidad de texto
              const elementArray = Array.from(elements);
              elementArray.sort((a, b) => {
                const textA = getElementText(a) || '';
                const textB = getElementText(b) || '';
                return textB.length - textA.length;
              });
              
              // Tomar el elemento con más texto
              const bestElement = elementArray[0];
              const text = getElementText(bestElement);
              
              if (text && text.length > 0) {
                return { 
                  found: true, 
                  text,
                  method: 'variant-match',
                  matchedSelector: variantSel
                };
              }
            }
          } catch (e) {
            // Continuar con la siguiente variante
          }
        }
        
        // 3. No se encontró ningún elemento que coincida
        return { 
          found: false, 
          text: `No se pudo extraer texto de ${sel}`,
          method: 'not-found'
        };
      }, selector);
      
      this.logAction('extractText', { selector, method: extractResult.method }, { 
        found: extractResult.found,
        textLength: extractResult.text.length 
      });
      
      return extractResult.text;
    } catch (error) {
      logger.error(`Error al extraer texto:`, error);
      // En caso de error general, devolvemos un mensaje de error, pero no interrumpimos la ejecución
      return `Error al extraer texto: ${error.message}`;
    }
  }

  async extractHtml(selector?: string): Promise<string> {
    try {
      if (!this.page) throw new Error('El navegador no está inicializado');
      
      if (selector) {
        logger.info(`Extrayendo HTML de: ${selector}`);
        await this.page.waitForSelector(selector, { timeout: 5000 });
        const html = await this.page.$eval(selector, el => el.outerHTML);
        
        this.logAction('extractHtml', { selector }, { htmlLength: html.length });
        
        return html;
      } else {
        logger.info('Extrayendo HTML de toda la página');
        const html = await this.page.content();
        
        this.logAction('extractHtml', { fullPage: true }, { htmlLength: html.length });
        
        return html;
      }
    } catch (error) {
      logger.error(`Error al extraer HTML${selector ? ` de ${selector}` : ''}:`, error);
      throw error;
    }
  }

  async wait(ms: number): Promise<string> {
    logger.info(`Esperando ${ms}ms`);
    await new Promise(resolve => setTimeout(resolve, ms));
    
    this.logAction('wait', { ms }, { success: true });
    
    return `Esperó ${ms}ms con éxito`;
  }

  async selectOption(selector: string, option: string): Promise<string> {
    try {
      if (!this.page) throw new Error('El navegador no está inicializado');
      
      logger.info(`Seleccionando opción en: ${selector}`);
      await this.page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
      await this.page.selectOption(selector, option);
      
      this.logAction('select', { selector, option }, { success: true });
      
      return `Opción "${option}" seleccionada en "${selector}" con éxito`;
    } catch (error) {
      logger.error(`Error al seleccionar opción en ${selector}:`, error);
      throw error;
    }
  }

  async findElements(selector: string): Promise<string> {
    try {
      if (!this.page) throw new Error('El navegador no está inicializado');
      
      logger.info(`Buscando elementos: ${selector}`);
      const elements = await this.page.$$(selector);
      
      const result = await Promise.all(elements.slice(0, 10).map(async (element, index) => {
        const text = await element.evaluate(el => el.innerText?.trim() || '');
        const tag = await element.evaluate(el => el.tagName.toLowerCase());
        const id = await element.evaluate(el => el.id || '');
        const classes = await element.evaluate(el => el.className || '');
        
        return {
          index,
          tag,
          id: id ? `#${id}` : '',
          classes: classes ? `.${classes.split(' ').join('.')}` : '',
          text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        };
      }));
      
      const moreElements = elements.length > 10 ? `... y ${elements.length - 10} más` : '';
      this.logAction('findElements', { selector }, { count: elements.length, elements: result });
      
      const formattedResult = result.map(e => 
        `${e.index}. <${e.tag}${e.id}${e.classes}> ${e.text}`
      ).join('\n');
      
      return `Encontrados ${elements.length} elementos para selector "${selector}":\n${formattedResult}\n${moreElements}`;
    } catch (error) {
      logger.error(`Error al buscar elementos ${selector}:`, error);
      throw error;
    }
  }

  async getUrl(): Promise<string> {
    if (!this.page) throw new Error('El navegador no está inicializado');
    return this.page.url();
  }

  async takeScreenshot(path: string): Promise<string> {
    try {
      if (!this.page) throw new Error('El navegador no está inicializado');
      
      logger.info(`Tomando captura de pantalla: ${path}`);
      await this.page.screenshot({ path });
      
      this.logAction('screenshot', { path }, { success: true });
      
      return `Captura de pantalla guardada en: ${path}`;
    } catch (error) {
      logger.error(`Error al tomar captura de pantalla:`, error);
      throw error;
    }
  }

  // Métodos para la gestión de estado
  getMemory(): any {
    return {
      history: this.history,
      state: this.state
    };
  }

  setState(key: string, value: any): void {
    this.state[key] = value;
  }

  getState(key: string): any {
    return this.state[key];
  }

  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close().catch(err => logger.warn(`Error al cerrar página: ${err.message}`));
        this.page = null;
      }
      
      if (this.context) {
        await this.context.close().catch(err => logger.warn(`Error al cerrar contexto: ${err.message}`));
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close().catch(err => logger.warn(`Error al cerrar navegador: ${err.message}`));
        this.browser = null;
      }
      
      logger.info('Navegador cerrado correctamente');
    } catch (error) {
      logger.error(`Error al cerrar navegador: ${error.message}`);
      // Intentar forzar el cierre si falló el cierre normal
      try {
        if (this.browser) {
          this.browser = null;
        }
      } catch (e) {
        logger.error(`Error adicional al forzar cierre: ${e.message}`);
      }
    }
  }

  /**
   * Extrae URLs de imágenes relevantes de la página actual
   * @param selector Selector CSS opcional para limitar la búsqueda a un contenedor específico
   * @returns Array de URLs de imágenes encontradas, convertidas a URLs absolutas
   */
  async extractImages(selector = 'body'): Promise<string[]> {
    try {
      // Verificar que el navegador y la página estén inicializados
      if (!this.page) {
        logger.warn('Intentando extraer imágenes sin navegador inicializado, inicializando ahora');
        await this.init();
        
        // Si después de intentar inicializar sigue siendo null, lanzar error
        if (!this.page) {
          throw new Error('No se pudo inicializar el navegador para extraer imágenes');
        }
      }
      
      // Asegurarnos de que hay una página cargada
      const currentUrl = await this.getUrl();
      if (!currentUrl || currentUrl === 'about:blank') {
        logger.warn('No hay página cargada para extraer imágenes');
        return [];
      }
      
      // Función para determinar si una imagen es relevante basada en su tamaño y atributos
      const isRelevantImage = (width, height, alt, src) => {
        // Filtrar imágenes muy pequeñas que probablemente son iconos
        if (width < 100 || height < 100) return false;
        
        // Filtrar imágenes que tienen 'icon', 'logo', 'banner' en la URL
        const lowerSrc = src.toLowerCase();
        if (lowerSrc.includes('icon') || lowerSrc.includes('logo') || 
            lowerSrc.includes('banner') || lowerSrc.includes('background')) {
          return false;
        }
        
        // Si tiene un texto alternativo descriptivo, es más probable que sea relevante
        if (alt && alt.length > 5 && !alt.toLowerCase().includes('icon') && 
            !alt.toLowerCase().includes('logo')) {
          return true;
        }
        
        // Dar preferencia a imágenes de mayor tamaño
        return (width >= 200 && height >= 200);
      };
      
      // Primero buscamos imágenes en contenedores de productos
      const productSelectors = [
        '.product', '#product', '[data-product]', '.item-product', 
        '.product-container', '.product-detail', '.product-image',
        '#product-image', '.item-image', '.main-image',
        // Selectores específicos para tiendas online
        '.product-gallery', '.product-photo', '.product-media',
        '.woocommerce-product-gallery', '.product-images'
      ];
      
      let images = [];
      // Intentar primero con selectores de productos
      for (const productSelector of productSelectors) {
        try {
          const productImages = await this.page.$$eval(`${productSelector} img`, (imgs) => {
            return imgs.map(img => {
              return {
                src: img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'),
                alt: img.alt,
                width: img.width || parseInt(img.getAttribute('width') || '0'),
                height: img.height || parseInt(img.getAttribute('height') || '0'),
              };
            }).filter(img => img.src);
          });
          
          if (productImages && productImages.length > 0) {
            const relevantImages = productImages.filter(img => 
              isRelevantImage(img.width, img.height, img.alt, img.src)
            ).map(img => img.src);
            
            if (relevantImages.length > 0) {
              images = relevantImages;
              console.log(`Encontradas ${images.length} imágenes relevantes en selector ${productSelector}`);
              break;
            }
          }
        } catch (err) {
          // Continuar al siguiente selector si hay error
        }
      }
      
      // Si no encontramos imágenes en selectores de productos, buscar en toda la página o en el selector dado
      if (images.length === 0) {
        images = await this.page.$$eval(`${selector} img`, (imgs) => {
          return imgs.map(img => {
            return {
              src: img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'),
              alt: img.alt,
              width: img.width || parseInt(img.getAttribute('width') || '0'),
              height: img.height || parseInt(img.getAttribute('height') || '0'),
            };
          }).filter(img => img.src);
        }).then(allImages => {
          return allImages
            .filter(img => isRelevantImage(img.width, img.height, img.alt, img.src))
            .map(img => img.src);
        });
        
        console.log(`Encontradas ${images.length} imágenes relevantes en el selector general ${selector}`);
      }
      
      // Limitar a 10 imágenes máximo para evitar sobrecarga
      if (images.length > 10) {
        images = images.slice(0, 10);
      }
      
      // Convertir URLs relativas a absolutas
      const absoluteImages = images.map(imgUrl => {
        if (imgUrl.startsWith('http')) {
          return imgUrl;
        } else if (imgUrl.startsWith('//')) {
          return 'https:' + imgUrl;
        } else if (imgUrl.startsWith('/')) {
          const urlObj = new URL(currentUrl);
          return urlObj.origin + imgUrl;
        } else {
          // Para URLs relativas sin slash inicial
          const urlObj = new URL(currentUrl);
          // Obtener el directorio base
          const basePath = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
          return urlObj.origin + basePath + imgUrl;
        }
      });
      
      return absoluteImages;
    } catch (err) {
      logger.error(`Error al extraer imágenes: ${err.message}`);
      return [];
    }
  }
}

export default new BrowserAgent(); 