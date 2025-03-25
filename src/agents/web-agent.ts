// @ts-nocheck
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { DynamicTool } from 'langchain/tools';
import { PromptTemplate } from '@langchain/core/prompts';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BufferMemory } from 'langchain/memory';
import { getLangChainTools } from '../tools/tools.js';
import browserTool from '../tools/browser.js';
import config from '../config/config.js';

const SYSTEM_TEMPLATE = `Eres un agente inteligente diseñado para extraer información de páginas web.
Puedes navegar por Internet, hacer clic en enlaces, rellenar formularios y extraer datos de las páginas.

Debes seguir estos pasos para cualquier tarea:
1. Planificar tu enfoque
2. Ejecutar las acciones necesarias
3. Verificar si has completado la tarea
4. Si es necesario, realizar acciones adicionales

Tienes las siguientes herramientas disponibles:
{tools}

Debes responder en el formato siguiente:
Pensamiento: Aquí explico mi proceso de razonamiento paso a paso.
Acción: nombre_de_la_herramienta
Entrada de acción: parámetros para la herramienta
Observación: resultado de la acción

Ejemplo:
Pensamiento: Necesito navegar a la página de Google para buscar información.
Acción: navigate
Entrada de acción: https://www.google.com
Observación: Navegación a https://www.google.com completada.

Pensamiento: Ahora debo buscar "clima en Madrid".
Acción: type
Entrada de acción: {"selector": "input[name='q']", "text": "clima en Madrid"}
Observación: Texto escrito en input[name='q'].

Cuando hayas completado la tarea, responde con:
RESPUESTA FINAL: La información final recopilada.`;

export class WebAgent {
  private model: any;
  private tools: any[];
  private executor: any = null;
  private messageHistory: any;

  constructor() {
    this.model = new ChatOllama({
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.model,
      temperature: 0.7,
    });
    
    this.tools = getLangChainTools();
    this.messageHistory = new BufferMemory();
  }

  async initialize(): Promise<void> {
    const promptTemplate = PromptTemplate.fromTemplate(SYSTEM_TEMPLATE);
    const prompt = await promptTemplate.format({
      tools: this.tools.map(tool => `${tool.name}: ${tool.description}`).join('\n'),
    });

    const messages = [
      new SystemMessage(prompt),
    ];

    // Simplificamos la creación del agente para evitar errores de API
    try {
      // @ts-ignore - ignorar errores de tipo en la creación del agente
      const agent = await createOpenAIFunctionsAgent({
        llm: this.model,
        tools: this.tools,
        prompt: messages,
      });

      // @ts-ignore - ignorar errores de tipo
      this.executor = AgentExecutor.fromAgentAndTools({
        agent,
        tools: this.tools,
        verbose: config.debug,
        maxIterations: 10,
      });
    } catch (error) {
      console.error("Error al crear el agente:", error);
      throw error;
    }
  }

  async run(query: string): Promise<string> {
    if (!this.executor) {
      await this.initialize();
    }

    try {
      // Ejecutar el agente con manejo simplificado para evitar errores de tipo
      if (!this.executor) throw new Error('El agente no está inicializado');
      
      // @ts-ignore - ignoramos errores de tipo en la invocación
      const result = await this.executor.invoke({ input: query });
      
      return result.output;
    } catch (error) {
      console.error('Error al ejecutar el agente:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await browserTool.close();
  }
}

export default WebAgent; 