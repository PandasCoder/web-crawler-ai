// @ts-nocheck
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import config from '../config/config.js';

export class BrowserTool {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async init(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: !config.debug,
      });
      
      this.context = await this.browser.newContext({
        extraHTTPHeaders: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,/;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'es,pt-BR;q=0.9,pt;q=0.8,en-US;q=0.7,en;q=0.6',
          'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'upgrade-insecure-requests': '1'
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      });
      
      this.page = await this.context.newPage();
    }
  }

  async navigate(url: string): Promise<string> {
    try {
      await this.init();
      if (!this.page) throw new Error('El navegador no está inicializado');
      
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      return await this.page.content();
    } catch (error) {
      console.error(`Error al navegar a ${url}:`, error);
      throw error;
    }
  }

  async extractText(): Promise<string> {
    if (!this.page) throw new Error('El navegador no está inicializado');
    
    return await this.page.evaluate(() => {
      return document.body.innerText;
    });
  }

  async extractLinks(): Promise<Array<{ url: string, text: string }>> {
    if (!this.page) throw new Error('El navegador no está inicializado');
    
    return await this.page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.map(link => ({
        url: link.href,
        text: link.innerText.trim()
      }));
    });
  }

  async querySelector(selector: string): Promise<string> {
    if (!this.page) throw new Error('El navegador no está inicializado');
    
    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      const element = await this.page.$(selector);
      if (!element) return '';
      return await element.innerText();
    } catch (error) {
      console.error(`Error al buscar el selector ${selector}:`, error);
      return '';
    }
  }

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('El navegador no está inicializado');
    
    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await this.page.click(selector);
    } catch (error) {
      console.error(`Error al hacer clic en ${selector}:`, error);
      throw error;
    }
  }

  async type(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('El navegador no está inicializado');
    
    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await this.page.fill(selector, text);
    } catch (error) {
      console.error(`Error al escribir en ${selector}:`, error);
      throw error;
    }
  }

  async takeScreenshot(path: string): Promise<void> {
    if (!this.page) throw new Error('El navegador no está inicializado');
    
    await this.page.screenshot({ path });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}

export default new BrowserTool(); 