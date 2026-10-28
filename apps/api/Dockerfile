# API container for Fly.io or Railway. Build from the REPOSITORY ROOT:
#   docker build -f apps/api/Dockerfile -t favorite-hearts-api .

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/member/package.json apps/member/
COPY apps/website/package.json apps/website/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @fh/api
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @fh/api

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/member/package.json apps/member/
COPY apps/website/package.json apps/website/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @fh/api --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 8787
CMD ["node", "--enable-source-maps", "apps/api/dist/index.js"]
