# Development stage
FROM node:22.0-alpine3.19 AS development

WORKDIR /app

# Настраиваем npm для лучшей работы с сетью
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000

# Копируем файлы зависимостей первыми для лучшего кэширования
COPY package*.json ./
COPY tsconfig*.json nest-cli.json ./

# Очищаем кэш и устанавливаем зависимости
RUN npm cache clean --force && \
    npm ci --no-audit --prefer-offline

COPY ./src ./src
RUN npm run build

# Production stage
FROM node:22.0-alpine3.19 AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV} \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_OPTIONS="--max-old-space-size=4096 --dns-result-order=ipv4first"

# Устанавливаем Chromium и зависимости одним слоем
RUN apk add --no-cache --upgrade \
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
    libdrm \
    dumb-init

# Создаем пользователя и директории
RUN addgroup -S pptruser && adduser -S -G pptruser pptruser \
    && mkdir -p /usr/share/fonts/local /data/chrome-userdir /home/pptruser/Downloads

# Создаем рабочую директорию ПОСЛЕ создания пользователя
WORKDIR /app

# Настраиваем права доступа к рабочей директории
RUN chown -R pptruser:pptruser /app /home/pptruser \
    && chmod -R 755 /app

# Копируем зависимости
COPY package*.json ./

# Устанавливаем production зависимости
RUN npm config set registry https://registry.npmjs.org/ && \
    npm cache clean --force && \
    npm ci --only=production --no-audit --prefer-offline

# Копируем собранное приложение
COPY --from=development /app/dist ./dist

# Еще раз настраиваем права после копирования файлов
RUN chown -R pptruser:pptruser /app

# Настройки Puppeteer
ENV PUPPETEER_ARGS="--no-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer --single-process"

USER pptruser
EXPOSE 3000
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]