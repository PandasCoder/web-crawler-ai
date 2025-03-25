// @ts-nocheck
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import config from '../config/config.js';

export class OllamaClient {
  private model: ChatOllama;

  constructor() {
    this.model = new ChatOllama({
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.model,
      temperature: 0.7,
    });
  }

  async call(
    system: string,
    prompt: string,
    history: BaseMessage[] = []
  ): Promise<string> {
    const messages: BaseMessage[] = [
      new SystemMessage(system),
      ...history,
      new HumanMessage(prompt),
    ];

    try {
      // Usamos @ts-ignore para evitar el error de tipado
      // @ts-ignore
      const response = await this.model.invoke(messages);
      return response.content.toString();
    } catch (error) {
      console.error('Error al llamar al modelo Ollama:', error);
      throw error;
    }
  }
}

export default new OllamaClient(); 