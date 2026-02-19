FROM node:22-slim AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY addresses ./addresses
RUN npm install
RUN npm run test || true

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/addresses ./addresses
EXPOSE 3000
CMD ["npm", "exec", "tsx", "apps/api/src/server.ts"]
