FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun --bun next build

FROM oven/bun:1.4.4
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
# APP_PASSWORD, BACKEND_URL, BACKEND_TOKEN are read at runtime (set them in Render)
CMD ["sh", "-c", "bun --bun next start -H 0.0.0.0 -p ${PORT:-3000}"]
