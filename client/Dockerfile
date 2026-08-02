FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci


FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG API_ORIGIN=http://api:8000
ARG NEXT_PUBLIC_API_ORIGIN=""

RUN test -n "${API_ORIGIN}" || { \
      echo "REFUSING: API_ORIGIN is empty - server-side calls would have nowhere to go"; \
      exit 1; }

ENV API_ORIGIN=${API_ORIGIN} \
    NEXT_PUBLIC_API_ORIGIN=${NEXT_PUBLIC_API_ORIGIN} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build


FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --home-dir /app app

WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts

USER app
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
