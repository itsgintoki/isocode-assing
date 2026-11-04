FROM node:22-bookworm-slim

WORKDIR /app

# better-sqlite3 ships a native addon; keep the toolchain available at build time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
RUN npm ci \
  && npm --prefix backend ci \
  && npm --prefix frontend ci

COPY . .
RUN npm run build \
  && npm --prefix backend prune --omit=dev \
  && rm -rf frontend/node_modules node_modules

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=./data/screening.db

EXPOSE 4000
CMD ["node", "backend/dist/server.js"]
