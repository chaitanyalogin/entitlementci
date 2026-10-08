FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY . .
RUN npm ci && npm run db:generate && npm run build
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
CMD ["node","apps/api/dist/server.js"]

FROM nginx:alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
