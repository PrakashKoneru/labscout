# labscout

An empty shell where the frontend, backend, and database are already connected. There is no domain
model yet — just enough code to prove every wire works, so feature work can start immediately.

## Stack

| Layer      | Choice                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| Frontend   | Next.js 16 App Router, React 19, TypeScript, plain CSS Modules            |
| Backend    | Route handlers under `src/app/api/*`                                      |
| Database   | Lakebase Postgres on Neon, via Drizzle ORM over `node-postgres`           |
| LLM        | Anthropic SDK (`claude-sonnet-4-6`)                                       |
| Deploy     | Vercel                                                                    |

The Neon project is linked through the gitignored `.neon` file, and `neon.ts` declares which Neon
services each branch should have.

## Getting started

```bash
npm install
neon env pull      # writes DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_BRANCH into .env.local
npm run dev
```

`.env.local` also needs `ANTHROPIC_API_KEY`, which Neon does not manage.

Open the home page and use its two buttons: one writes a row to Postgres and reads it back, the
other sends a prompt to Claude. Both go through route handlers, so a green result means the whole
path is connected.

## Database

`DATABASE_URL` is the pooled (PgBouncer) connection used for application queries.
`DATABASE_URL_UNPOOLED` is the direct connection, which is what `drizzle.config.ts` uses because
migrations cannot run through the pooler.

```bash
npm run db:generate   # write a migration from src/db/schema.ts
npm run db:migrate    # apply migrations to the linked branch
```

Create a Neon branch whenever you would create a git branch, so schema changes are isolated:

```bash
neon checkout dev-my-feature --create
```

## What to delete when real work starts

The `pings` table (`src/db/schema.ts`), `src/app/api/pings/route.ts`, and
`src/app/components/WiringCheck.tsx` exist only as proof of life. `src/app/api/health/route.ts` is
worth keeping. Everything in `src/db/index.ts`, `src/lib/env.ts`, and `src/lib/anthropic.ts` is real
plumbing meant to stay.
