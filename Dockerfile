# syntax=docker/dockerfile:1
# Imagen de staging/producción del ERP (apps/web). Monorepo pnpm + Turborepo.
# Los paquetes workspace (domain/db/validation/...) se consumen desde fuente,
# así que basta con compilar el build de Next.

FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN corepack enable

# ---- Dependencias (cacheadas por lockfile) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- Build ----
FROM deps AS build
COPY . .
RUN pnpm --filter @contract/web build

# ---- Runtime ----
FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    LOG_LEVEL=info
WORKDIR /app

# Playwright/Chromium se usa para generar PDF; en contenedor se instala el
# navegador del sistema. Descomenta si el runtime necesita generar PDFs:
#   RUN apk add --no-cache chromium && npx playwright install-deps chromium

# Node_modules y workspace compilado
COPY --from=build /app /app

EXPOSE 3000
# Healthcheck: endpoint de observabilidad (Fase 7)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health | grep -q ok || exit 1

CMD ["pnpm", "--filter", "@contract/web", "start"]
