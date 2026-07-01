# Build do serviço always-on (whatsapp-worker) no monorepo pnpm.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# Instala dependências do workspace (shared + worker)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/whatsapp-worker/package.json services/whatsapp-worker/package.json
RUN pnpm install --frozen-lockfile || pnpm install

# Copia o código e builda
COPY . .
RUN pnpm --filter @trk/shared build && pnpm --filter whatsapp-worker build

EXPOSE 8080
CMD ["node", "services/whatsapp-worker/dist/server.js"]
