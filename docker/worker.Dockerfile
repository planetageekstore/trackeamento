# Worker always-on (WhatsApp via Baileys + envio de conversões).
# Usado por Railway/Render/Fly ou docker run. Monorepo pnpm: instala tudo,
# builda o @trk/shared e roda o worker com tsx.
FROM node:20-slim
RUN corepack enable
WORKDIR /app

# Copia o workspace inteiro (o worker importa @trk/shared)
COPY . .

RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @trk/shared build

ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "--filter", "whatsapp-worker", "start"]
