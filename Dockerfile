# Development stage
FROM node:22.0-alpine3.19 AS development

# Устанавливаем yarn (более надежный, чем npm)
RUN npm install -g yarn

WORKDIR /app

# Настраиваем npm/yarn для лучшей работы с сетью
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000

# Копируем файлы зависимостей первыми для лучшего кэширования
COPY package*.json ./
COPY tsconfig*.json nest-cli.json ./
COPY yarn.lock ./

# Очищаем кэш и устанавливаем зависимости с таймаутом
RUN npm cache clean --force && \
    yarn install --frozen-lockfile --network-timeout 300000

COPY ./src ./src
RUN yarn build

# Production stage
FROM node:22.0-alpine3.19 AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV} \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    # Увеличиваем таймауты Node.js
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
    # Дополнительные зависимости для стабильности
    dumb-init \
    && rm -rf /var/cache/apk/*

# Создаем директории и настраиваем пользователя
RUN mkdir -p /usr/share/fonts/local /data/chrome-userdir /home/pptruser/Downloads \
    && addgroup -S pptruser && adduser -S -G pptruser pptruser \
    && chown -R pptruser:pptruser /home/pptruser /app \
    && chmod -R 755 /app

WORKDIR /app

# Копируем package.json отдельно для лучшего кэширования
COPY package*.json ./
COPY yarn.lock ./

# Устанавливаем production зависимости
RUN npm config set registry https://registry.npmjs.org/ && \
    npm cache clean --force && \
    yarn install --frozen-lockfile --production --network-timeout 300000

# Копируем собранное приложение
COPY --from=development /app/dist ./dist

# Настройки Puppeteer
ENV PUPPETEER_ARGS="--no-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer --single-process"

# Запускаем через dumb-init для корректной обработки сигналов
USER pptruser
EXPOSE 3000
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]