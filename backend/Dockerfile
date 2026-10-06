# Bun + Elysia API — REST + /ws/reader + /ws/admin.
#
# Deployed as ONE long-lived process on purpose: the two WebSocket channels and the single-reader
# assumption (`docs/api-contract.md` §1) both want a persistent instance, not serverless. The database
# is external (Supabase), so this image holds no state — restarting it loses nothing that matters.
FROM oven/bun:1-alpine

WORKDIR /app

# Dependencies first, so editing source does not reinstall them.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

ENV NODE_ENV=production
# Informational: the platform decides the real port and passes it as PORT (config.ts reads it).
EXPOSE 3000

# Migrations are deliberately NOT run on boot: they need DATABASE_URL and should be applied once,
# on purpose, with `bun run migrate` (locally, against the same database).
CMD ["bun", "src/server.ts"]
