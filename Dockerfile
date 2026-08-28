FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    TZ=Asia/Shanghai

RUN apk add --no-cache tini wget && \
    addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app backend/ ./

USER app
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
