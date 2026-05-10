FROM node:20-alpine

WORKDIR /app

# Copy only the bot package — no monorepo complexity needed
COPY artifacts/coinmart-bot/package.json ./package.json
COPY artifacts/coinmart-bot/src ./src

# Install production dependencies only
RUN npm install --omit=dev

# Create data directory for SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data

CMD ["node", "--enable-source-maps", "src/index.js"]
