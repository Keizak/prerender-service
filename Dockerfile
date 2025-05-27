# Используем более конкретную версию node
FROM node:22.0-alpine3.19 AS development

WORKDIR /app

# Улучшаем кэширование слоев
COPY package*.json ./
COPY tsconfig*.json nest-cli.json ./
# Используем более строгие флаги для npm install
RUN npm ci

COPY ./src ./src
RUN npm run build

# Продакшн образ
FROM node:22.0-alpine3.19 AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV} \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Расширенный список необходимых пакетов
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    ttf-liberation \
    font-noto-emoji \
    wqy-zenhei \
    # Добавляем необходимые зависимости
    dbus \
    mesa-gl \
    pciutils-libs \
    libgcc \
    libstdc++ \
    at-spi2-core \
    libxcomposite \
    libxdamage \
    libxrandr \
    cups-libs \
    libdrm

# Создаем директории для Chrome
RUN mkdir -p /usr/share/fonts/local && \
    mkdir -p /data/chrome-userdir

WORKDIR /app

# Копируем только необходимые файлы
COPY package*.json ./
RUN npm ci

COPY --from=development /app/dist ./dist

# Настройка пользователя и безопасности
RUN addgroup -S pptruser && adduser -S -G pptruser pptruser \
    && mkdir -p /home/pptruser/Downloads /app \
    && chown -R pptruser:pptruser /home/pptruser /app \
    && chmod -R 755 /app

# Настройка Puppeteer
ENV PUPPETEER_ARGS="--no-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer"

USER pptruser

# Объявляем порт
EXPOSE 3000

CMD ["node", "dist/main"]