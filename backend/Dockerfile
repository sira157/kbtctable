FROM oven/bun:1.4.4
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
# listen on all interfaces inside the container; Render sets PORT
ENV HOST=0.0.0.0 NODE_ENV=production
EXPOSE 3001
# create database / missing tables (safe to re-run), then start the API
CMD ["sh", "-c", "bun src/db/setup.ts && bun src/index.ts"]
