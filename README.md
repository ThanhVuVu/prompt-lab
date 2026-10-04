# Prompt Laboratory 🧪

A backend for AI developers to **version, test and optimise Claude prompts**: prompt versioning, background analysis by Claude, A/B experiments judged by Claude with statistical significance, cost tracking with budgets, and team access control.

It's a **learning project** built in 10 stages, from "what is an HTTP request?" to a deployed, observable, tested production API.

> **Branches**
> - `main`: the **exercise skeleton** for Stages 1–3 (`TODO(stageN)` markers, failing tests to make green).
> - `solutions` (this branch): **every stage completed**, one commit per stage. Read the stages one at a time with `git log --oneline` and `git show <commit>`, or compare with `git diff <stage-a> <stage-b>`.

**Stack:** Node.js 22 · TypeScript · Express 5 · PostgreSQL + Prisma 7 · Redis + BullMQ · Claude API (`@anthropic-ai/sdk`) · zod · winston · Prometheus metrics · Jest + Supertest · Docker · Fly.io

---

## Quick start

```bash
git clone https://github.com/ThanhVuVu/prompt-lab.git
cd prompt-lab
git checkout solutions

docker compose up -d        # Postgres (dev + test DBs) and Redis
cp .env.example .env        # add ANTHROPIC_API_KEY if you want real Claude calls
npm install                 # also generates the Prisma client
npm run db:migrate          # create the tables
npm run db:seed             # alice (admin) / bob (user), password: password123

npm run dev                 # terminal 1: the API on http://localhost:3000
npm run worker:dev          # terminal 2: the background worker (calls Claude)
npm test                    # 176 tests against the real Postgres + Redis
```

Then open the `http/*.http` files (VS Code REST Client extension) and send requests, starting with `http/stage5.http` to log in.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run worker:dev` | API / worker with auto-restart |
| `npm run build` then `npm start` / `npm run worker` | production-style run of the compiled JS |
| `npm test` · `npm run test:stageN` · `npm run test:coverage` | all tests · one stage · with coverage gates |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm run ci` | everything CI runs: lint → typecheck → tests with coverage → build |
| `npm run db:migrate` · `db:seed` · `db:studio` · `db:reset` | Prisma migrations, demo data, table browser, reset (dev only!) |
| `npm run stage1` | the single-file Stage 1 server |
| `npm run docker:build` | build the production image |

## Architecture

```
            ┌──────────── API process (src/index.ts) ────────────┐
client ───▶ │ requestId → logger → helmet → json → routes → errors │ ───▶ PostgreSQL
            │   routes → controllers → services → Prisma           │       ▲
            └───────────────┬──────────────────────────────────────┘       │
                            │ enqueue {jobId}                              │
                            ▼                                              │
                          Redis ◀── cache (prompts) ──┐                    │
                            │                         │                    │
            ┌───────────────▼── worker process (src/worker.ts) ──────┐     │
            │ jobRunner → analysisWorker / experimentWorker ──▶ Claude API │
            │   results + cost_logs written in one transaction ─────────────┘
            └─────────────────────────────────────────────────────────┘
```

```
src/
├── index.ts / worker.ts       process entry points (API, background worker)
├── app.ts                     builds the Express app; dependency injection via AppServices
├── config/                    env (validated), database, logger, metrics, pricing
├── routes/                    URL + method → middleware → controller
├── controllers/               HTTP ⇄ service: status codes, request parsing
├── services/                  business logic: prompts, auth, audit, jobs, Claude, costs, experiments, cache
├── workers/                   jobRunner (lifecycle + retries), analysis and experiment handlers
├── middleware/                auth, validation, request ids, logging, security, errors
├── schemas/                   zod validation schemas
├── queues/                    BullMQ queue
├── utils/                     typed errors, request context, template rendering, statistics
└── generated/                 Prisma client (generated, not committed)
prisma/                        schema.prisma, migrations/, seed.ts
tests/                         one file per stage + helpers (db reset, auth, fakes, factories)
docs/                          one guide per stage
```

## API

All `/api/*` routes except signup and login need `Authorization: Bearer <token>`. Errors always look like `{ "error": { "code", "message", "details?", "requestId?" } }`.

| Method & path | What | Notes |
|---|---|---|
| `GET /health` · `GET /health/ready` | liveness · readiness (DB + Redis) | 503 when a dependency is down |
| `GET /metrics` | Prometheus metrics | optional `METRICS_TOKEN` |
| `POST /api/auth/signup` · `login` · `logout` · `GET /api/auth/me` | accounts and JWTs | login is rate-limited (429) |
| `GET/POST /api/prompts` · `GET/PATCH/DELETE /api/prompts/:id` | prompt CRUD | own + public visible; owner edits |
| `GET /api/prompts/:id/versions` | content history | |
| `POST /api/prompts/:id/analyze` → `GET /api/jobs/:id` | Claude reviews a prompt (async, 202) | 402 over budget |
| `GET /api/prompts/:id/analyses` | past reviews with cost | |
| `POST /api/experiments` → `GET /api/experiments/:id` | A/B test with LLM judge + significance | async, 202 |
| `GET /api/usage/me` | my Claude spending + budget left | |
| `PATCH /api/users/:id` · `GET /api/audit-logs` · `GET /api/usage/users` | admin only | |

## The 10 stages

| # | Topic | Guide | Highlights |
|---|---|---|---|
| 1 | HTTP fundamentals | [docs/stage-1-http.md](docs/stage-1-http.md) | request/response anatomy, status codes, first endpoints |
| 2 | Structure & TypeScript | [docs/stage-2-structure.md](docs/stage-2-structure.md) | layers, dependency injection, validated env config |
| 3 | REST & validation | [docs/stage-3-rest-validation.md](docs/stage-3-rest-validation.md) | CRUD, zod, consistent errors, 404-before-403 |
| 4 | Databases | [docs/stage-4-database.md](docs/stage-4-database.md) | Postgres, Prisma, migrations, transactions, version history |
| 5 | Auth | [docs/stage-5-auth.md](docs/stage-5-auth.md) | bcrypt, JWT + revocation, roles, ownership, audit log |
| 6 | Async jobs | [docs/stage-6-async-jobs.md](docs/stage-6-async-jobs.md) | BullMQ, worker, retries, idempotency, Claude structured outputs |
| 7 | Observability | [docs/stage-7-observability.md](docs/stage-7-observability.md) | structured logs, request ids, metrics, health checks |
| 8 | Testing & CI | [docs/stage-8-testing.md](docs/stage-8-testing.md) | unit/integration/concurrency/regression tests, coverage, GitHub Actions |
| 9 | Deployment | [docs/stage-9-deployment.md](docs/stage-9-deployment.md) | Docker, Fly.io, safe migrations, hardening |
| 10 | Advanced | [docs/stage-10-advanced.md](docs/stage-10-advanced.md) | A/B experiments + statistics, cost ledger + budgets, caching |

Track your progress in [PROGRESS.md](PROGRESS.md).

## Getting help

Ask with what you expected, what happened, the exact error (with its `requestId` if it was a 500), the command you ran, and a link to your branch or commit.
