# Lute app image — runs the dashboard / MCP / watch runner. Reuses the Phase 1 engine
# unchanged; tsx executes the TypeScript directly.
FROM node:22-slim

WORKDIR /app

# install deps first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# app sources
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY bazantic ./bazantic
COPY integrity-packs ./integrity-packs
COPY lute.targets.example.json ./

EXPOSE 8788 8793

# default: the dashboard. Override the command to run the watch runner or MCP server:
#   docker compose run --rm lute node --import tsx src/cli.ts watch --config lute.targets.example.json
CMD ["node", "--import", "tsx", "src/server.ts"]
