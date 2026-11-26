FROM node:22-bookworm-slim AS build

WORKDIR /workspace/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts frontend/postcss.config.js ./
COPY frontend/src ./src
COPY backend/src/application/assistant-math.ts /workspace/backend/src/application/assistant-math.ts
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/dist /usr/share/nginx/html
EXPOSE 80
