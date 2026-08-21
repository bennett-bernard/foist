FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system foist && useradd --system --gid foist --home-dir /app foist
COPY --from=build --chown=foist:foist /app/package.json /app/package-lock.json ./
COPY --from=build --chown=foist:foist /app/node_modules ./node_modules
COPY --from=build --chown=foist:foist /app/dist ./dist
RUN mkdir -p /app/.data && chown foist:foist /app/.data
USER foist
CMD ["node", "dist/src/index.js"]
