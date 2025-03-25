# Guía de Contribución

¡Gracias por tu interés en contribuir a Web Crawler AI! Este documento proporciona directrices para contribuir al proyecto.

## Proceso de Contribución

1. Haz un fork del repositorio
2. Crea una rama específica para tu contribución (`git checkout -b feature/nueva-funcionalidad`)
3. Realiza tus cambios con commits descriptivos
4. Asegúrate de que todos los tests pasen
5. Envía un Pull Request a la rama `main`

## Configuración del Entorno de Desarrollo

1. Clona tu fork del repositorio
   ```bash
   git clone https://github.com/tu-usuario/web-crawler-ai.git
   cd web-crawler-ai
   ```

2. Instala las dependencias
   ```bash
   npm install
   ```

3. Realiza la configuración inicial
   ```bash
   cp .env.example .env
   # Edita .env con tus configuraciones
   ```

4. Ejecuta el servicio en modo desarrollo
   ```bash
   npm run dev
   ```

## Convenciones de Código

- Sigue el estilo de código existente
- Usa TypeScript para todas las nuevas características
- Agrega tests para tus nuevas funcionalidades
- Documenta tu código con comentarios JSDoc cuando sea necesario

## Informar Bugs

Si encuentras un bug, crea un issue incluyendo:

- Descripción clara del problema
- Pasos para reproducirlo
- Comportamiento esperado vs actual
- Capturas de pantalla (si aplica)
- Información de tu entorno (sistema operativo, navegador, etc.)

## Proponer Nuevas Características

Para proponer nuevas funcionalidades:

1. Crea un issue describiendo la función que te gustaría añadir
2. Explica el valor que aportaría al proyecto
3. Discute con los mantenedores sobre la implementación
4. Si hay consenso, procede con un Pull Request

## Tests

Ejecuta los tests antes de enviar tu contribución:

```bash
npm test
```

## Licencia

Al contribuir, aceptas que tus contribuciones estarán bajo la licencia de uso dual que cubre el proyecto. Esto significa que tus contribuciones estarán disponibles bajo la licencia comunitaria para usos no comerciales, pero requerirán la adquisición de una licencia comercial para usos comerciales. 