FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && chown -R node:node /app
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate:prod && exec npm start"]
