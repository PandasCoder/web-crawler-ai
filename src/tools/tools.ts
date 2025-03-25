// @ts-nocheck
import { DynamicTool } from 'langchain/tools';
import browserTool from './browser.js';

export interface Tool {
  name: string;
  description: string;
  func: (arg: string) => Promise<string>;
}

// Herramientas de navegación web
export const webTools: Tool[] = [
  {
    name: 'navigate',
    description: 'Navega a una URL específica. Recibe como parámetro la URL completa',
    func: async (url: string) => {
      await browserTool.navigate(url);
      return `Navegación a ${url} completada.`;
    },
  },
  {
    name: 'extract_text',
    description: 'Extrae todo el texto visible de la página actual',
    func: async () => {
      return await browserTool.extractText();
    },
  },
  {
    name: 'extract_links',
    description: 'Extrae todos los enlaces de la página actual',
    func: async () => {
      const links = await browserTool.extractLinks();
      return JSON.stringify(links, null, 2);
    },
  },
  {
    name: 'query_selector',
    description: 'Extrae texto de un elemento usando un selector CSS. Recibe como parámetro el selector CSS',
    func: async (selector: string) => {
      return await browserTool.querySelector(selector);
    },
  },
  {
    name: 'click',
    description: 'Hace clic en un elemento usando un selector CSS. Recibe como parámetro el selector CSS',
    func: async (selector: string) => {
      await browserTool.click(selector);
      return `Clic en ${selector} completado.`;
    },
  },
  {
    name: 'type',
    description: 'Escribe texto en un campo usando un selector CSS. Recibe como parámetro un JSON con el selector y el texto a escribir: {"selector": ".input", "text": "Hola mundo"}',
    func: async (args: string) => {
      const { selector, text } = JSON.parse(args);
      await browserTool.type(selector, text);
      return `Texto escrito en ${selector}.`;
    },
  },
  {
    name: 'screenshot',
    description: 'Toma una captura de pantalla de la página actual. Recibe como parámetro la ruta donde guardar la imagen',
    func: async (path: string) => {
      await browserTool.takeScreenshot(path);
      return `Captura de pantalla guardada en ${path}.`;
    },
  },
];

// Convertir herramientas a formato LangChain
export const getLangChainTools = () => {
  return webTools.map(
    (tool) =>
      new DynamicTool({
        name: tool.name,
        description: tool.description,
        func: tool.func,
      })
  );
};

export default webTools; 