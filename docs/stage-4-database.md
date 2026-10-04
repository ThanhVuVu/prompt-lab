# Stage 4: Databases & Data Modelling (days 8–10)

**Goal:** replace the in-memory `Map` with PostgreSQL, so data survives restarts, relationships are enforced, and every content change is recorded.

**Key files:** `prisma/schema.prisma`, `prisma/migrations/`, `src/config/database.ts`, `src/services/promptService.ts`, `tests/helpers/db.ts`
**Tests:** `npm run test:stage4` (and Stage 3's tests, which now run against Postgres)

---

## Why this matters

A `Map` dies with the process. It can't be shared between two servers, and it can't stop you writing nonsense like a prompt owned by a user who doesn't exist. A relational database gives you **durability** (data survives crashes), **constraints** (the database itself refuses bad data, even if your code has a bug) and **transactions** (several writes succeed or fail together). Most production incidents involving "corrupted data" come from skipping one of these three.

## Setup

```bash
docker compose up -d          # Postgres + Redis (or use a locally installed Postgres)
cp .env.example .env          # contains DATABASE_URL and TEST_DATABASE_URL
npm install                   # also runs `prisma generate`
npm run db:migrate            # apply migrations to the dev database
npm run db:seed               # demo users alice/bob + 2 prompts
npm run db:studio             # browse the tables in your browser
```

## Concepts

### Tables, keys and relationships

```
users 1 ──< prompts 1 ──< prompt_versions
                │
                ├──< experiments (as prompt A or B) 1 ──< experiment_results
```

- **Primary key** (`id`): uniquely identifies a row.
- **Foreign key** (`prompts.created_by → users.id`): the database refuses a prompt whose owner doesn't exist. That's why `fakeAuth` now upserts a user row.
- **`ON DELETE CASCADE`**: delete a prompt and its versions go with it. Without it, the delete would fail while child rows still exist.
- **Unique constraint** (`prompt_versions(prompt_id, version)`): two "version 2"s for one prompt are impossible, even if two requests race.

### The ORM and migrations

`prisma/schema.prisma` describes the tables. `npm run db:migrate -- --name add_something` compares it with the database, writes the SQL into `prisma/migrations/<timestamp>_add_something/migration.sql`, and applies it. **Read that SQL**: the ORM is a convenience, not a replacement for understanding the tables.

Migrations are committed to git, so every developer and every environment (test, CI, production) builds exactly the same schema, in the same order.

### Transactions

```ts
await this.db.$transaction(async (tx) => {
  const prompt = await tx.prompt.create(...);
  await tx.promptVersion.create(...);   // if this fails, the prompt insert is rolled back
});
```

ACID in one sentence each:
- **Atomicity:** all or nothing.
- **Consistency:** constraints hold before and after.
- **Isolation:** concurrent transactions don't see each other's half-done work.
- **Durability:** once committed, it survives a crash.

### Indexes

`@@index([createdBy])` creates a B-tree on `prompts.created_by`. Without it, "show me alice's prompts" reads **every** row (a sequential scan). Check for yourself:

```sql
EXPLAIN ANALYZE SELECT * FROM prompts WHERE created_by = 'alice';
```

Indexes speed up reads but slow down writes slightly and use disk space, so add them for the queries you actually run.

### Things that changed from Stage 3

| Stage 3 (Map) | Stage 4 (Postgres) | Why |
|---|---|---|
| sync methods | `async` methods | the database is across the network |
| any string id | UUID; non-UUID → 404 | Postgres rejects `'abc'` for a UUID column, which would otherwise surface as a 500 |
| insertion order | explicit `ORDER BY created_at, id` | SQL guarantees **no** order without `ORDER BY` |
| copies via `clone()` | rows are copies already | every query returns fresh objects |
| new app = empty data | tests call `resetDatabase()` | the data outlives the app |

## Try it

```bash
npm run dev
curl -s -X POST localhost:3000/api/prompts -H 'Content-Type: application/json' -H 'x-user-id: alice' \
  -d '{"title":"Translate","content":"Translate to Vietnamese: {{text}}"}'
# restart the server (Ctrl+C, npm run dev). The prompt is still there:
curl -s localhost:3000/api/prompts
curl -s -X PATCH localhost:3000/api/prompts/<id> -H 'Content-Type: application/json' -H 'x-user-id: alice' \
  -d '{"content":"Translate to formal Vietnamese: {{text}}","changeReason":"More formal"}'
curl -s localhost:3000/api/prompts/<id>/versions
psql postgresql://postgres:postgres@localhost:5432/prompt_lab_dev -c 'SELECT version, change_reason FROM prompt_versions;'
```

## Common mistakes

- **Forgetting `await`.** You get a `Promise { <pending> }` in the response, or an error that escapes the request. TypeScript plus `async` handlers catch most of these.
- **Editing an applied migration.** Never do it. Create a new migration instead; others have already run the old one.
- **Running tests against the dev database.** The tests TRUNCATE every table. `TEST_DATABASE_URL` exists for exactly this reason.
- **Pagination without `ORDER BY`.** It works in dev with 3 rows, then shows duplicates in production.
- **N+1 queries.** Loading 50 prompts and then querying each one's owner separately makes 51 queries. Use `include` or a join.
- **Storing money as a float.** Use `Decimal`, as `experiment_results.cost_usd` does.

## Debugging tips

- `P1001: Can't reach database server`: Postgres isn't running (`docker compose ps`), or `DATABASE_URL` points somewhere wrong.
- `The table "public.prompts" does not exist`: run `npm run db:migrate`.
- `Cannot find module '../generated/prisma/client'`: run `npm run db:generate`. The client is generated code and isn't committed.
- To see the SQL Prisma runs, use `new PrismaClient({ adapter, log: ['query'] })`.
- `npm run db:reset` drops everything, re-applies all migrations and re-seeds. It's safe in dev, and **never** something to run in production.

## Extensions

- Add `GET /api/prompts?mine=true` that filters by `createdBy`, and check with `EXPLAIN` that it uses the index.
- Add `POST /api/prompts/:id/versions/:version/restore`.
- Switch list pagination to **cursor-based** (`?after=<id>`) and explain why it beats OFFSET on page 10,000.
- Add a `tags` GIN index and filter by tag: `where: { tags: { has: 'research' } }`.

## Checkpoint

- [ ] Draw the schema: tables, primary keys, foreign keys, and which side is "many".
- [ ] What does the transaction in `create()` protect against? Describe the failure without it.
- [ ] Why does a non-UUID id give 404 rather than 500, and where is that handled?
- [ ] What's the difference between `migrate dev` and `migrate deploy`? Which one runs in production?
- [ ] What does an index cost? When would you **not** add one?
- [ ] Why is `ORDER BY` required for pagination?
