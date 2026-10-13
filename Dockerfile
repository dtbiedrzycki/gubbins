# Production image (the dev image is .devcontainer/Dockerfile.dev).
FROM node:24.17-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 falls back to compiling when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/api-typegen/package.json packages/api-typegen/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24.17-bookworm-slim
# NODE_ENV only here, in the runtime layer: the build needs dev dependencies.
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/wishlist.db
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/shared-types/package.json packages/shared-types/
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/api/dist/presentation/server.js"]
