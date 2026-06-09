FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

COPY server.js db.js rag.js ./
COPY *.html ./

EXPOSE 3001
CMD ["node", "server.js"]
