# @author AVRG3
# Default image exposes tiny-context over stdio for local clients and directory inspection.
# tiny-runtime is a separate target, keeping the servers and their dependencies separate.
FROM node:22-bookworm-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/context/package.json ./packages/context/package.json
COPY packages/runtime/package.json ./packages/runtime/package.json
COPY bench/package.json ./bench/package.json
COPY evals/package.json ./evals/package.json

FROM manifests AS build
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages ./packages
RUN ./node_modules/.bin/tsc -b packages/shared packages/context packages/runtime

FROM manifests AS context-dependencies
RUN npm ci --omit=dev --workspace=packages/shared --workspace=packages/context --no-audit --no-fund

FROM manifests AS runtime-dependencies
RUN npm ci --omit=dev --workspace=packages/runtime --no-audit --no-fund

FROM node:22-bookworm-slim AS tiny-runtime
LABEL org.opencontainers.image.authors="AVRG3" \
      org.opencontainers.image.source="https://github.com/Warddamn/tiny-tools" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY LICENSE ./LICENSE
COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/packages/runtime/package.json ./packages/runtime/package.json
COPY --from=build /app/packages/runtime/dist ./packages/runtime/dist
RUN mkdir /data && chown node:node /data
USER node
WORKDIR /data
CMD ["node", "/app/packages/runtime/dist/mcp.js"]

FROM node:22-bookworm-slim AS tiny-context
LABEL org.opencontainers.image.authors="AVRG3" \
      org.opencontainers.image.source="https://github.com/Warddamn/tiny-tools" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY LICENSE ./LICENSE
COPY --from=context-dependencies /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/context/package.json ./packages/context/package.json
COPY --from=build /app/packages/context/dist ./packages/context/dist
RUN mkdir /data && chown node:node /data
USER node
WORKDIR /data
CMD ["node", "/app/packages/context/dist/mcp.js"]
