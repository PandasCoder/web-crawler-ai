FROM node:18-slim

# Configurar variables de entorno para Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV DEBIAN_FRONTEND=noninteractive

# Instalar dependencias de Playwright y preparar sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    libgconf-2-4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgtk-3-0 \
    libgbm-dev \
    libasound2 \
    fonts-liberation \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    ca-certificates \
    fonts-noto-color-emoji \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Crear directorios necesarios
WORKDIR /app

# Crear directorios para datos persistentes
RUN mkdir -p \
    logs \
    data \
    screenshots \
    profiles \
    temp

# Mejora: Copiar archivos de configuración de paquetes primero para aprovechar el caché
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias del proyecto
RUN npm ci --quiet

# Instalar Playwright globalmente y navegadores en una capa separada
RUN npm install -g playwright && \
    playwright install chromium --with-deps && \
    playwright install-deps chromium

# Copiar el código fuente
COPY . .

# Compilar el proyecto TypeScript
RUN npm run build

# Limpiar caché y archivos no necesarios para reducir tamaño de imagen
RUN npm cache clean --force && \
    rm -rf ~/.npm ~/.cache

# Configurar volúmenes para persistencia
VOLUME ["/app/logs", "/app/data", "/app/screenshots", "/app/profiles", "/app/temp"]

# Exponer el puerto para la API
EXPOSE 3000

# Comando para ejecutar la aplicación
CMD ["npm", "start"] 