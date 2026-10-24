<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Wiring conventions

- Query the database through `getDb()` from `@/db`, never by constructing a client inline.
- `DATABASE_URL` is pooled and is for application queries. Migrations, dumps, and anything needing
  session state use `DATABASE_URL_UNPOOLED`, which `drizzle.config.ts` already does.
- Schema lives in `src/db/schema.ts` and changes ship as Drizzle migrations (`npm run db:generate`,
  then `npm run db:migrate`). Do not run ad hoc DDL against the branch.
- Neon services are declared in `neon.ts`; apply changes with `neon deploy`. Consult the Neon agent
  skills before changing drivers or adding a Neon service.
