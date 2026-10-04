# Progress Tracker

Tick items off as you go. A stage is **done** when its tests pass, you've tried every endpoint by hand, **and** you can answer its checkpoint questions out loud without notes. Then request a review.

## Week 1 — Foundations

### Stage 1: HTTP & Web Fundamentals · [guide](docs/stage-1-http.md)
- [ ] 1.0 curl against JSONPlaceholder (GET, POST, 404) and noted status codes and headers
- [ ] 1.1 Logged and inspected the request object (method, url, headers, query, body)
- [ ] 1.2 `POST /echo` implemented — `npm run test:stage1` green
- [ ] 1.3 Designed and built `GET /time`, with requests in `http/stage1.http`
- [ ] Checkpoint questions answered
- [ ] Reviewed ✅

### Stage 2: Project Structure & TypeScript · [guide](docs/stage-2-structure.md)
- [ ] 2.1 Traced `GET /health` through every layer (drawn on paper)
- [ ] 2.2 `/echo` refactored into service + controller
- [ ] 2.3 `LOG_REQUESTS` boolean bug reproduced, then fixed
- [ ] 2.4 Request logger prints `METHOD path status duration`
- [ ] 2.5 `GET /version` added by following the pattern, with a test
- [ ] `npm run test:stage2` green · `npm run typecheck` clean · `.env` not committed
- [ ] Checkpoint questions answered
- [ ] Reviewed ✅

### Stage 3: REST APIs & Validation · [guide](docs/stage-3-rest-validation.md)
- [ ] 3.1 Read the whole spec (`tests/stage3.test.ts`)
- [ ] 3.2 Schemas: create, update, list query
- [ ] 3.3 `validateBody` middleware
- [ ] 3.4 `PromptService` (in-memory CRUD + pagination + versioning)
- [ ] 3.5 `PromptController` (status codes, 404 → 403 order)
- [ ] 3.6 Every endpoint exercised by hand (`http/stage3.http`)
- [ ] `npm run test:stage3` green
- [ ] At least one extension done
- [ ] Checkpoint questions answered
- [ ] Reviewed ✅

## Week 2 — Core Features

### Stage 4: Databases & Data Modelling · [guide](docs/stage-4-database.md)
- [ ] Postgres running (`docker compose up -d`), migrations applied, seed loaded
- [ ] Read every SQL file in `prisma/migrations/`
- [ ] Explained the transaction in `PromptService.create()`
- [ ] `EXPLAIN ANALYZE` on a query that uses an index
- [ ] `npm run test:stage4` green · checkpoint answered · reviewed ✅

### Stage 5: Authentication & Authorization · [guide](docs/stage-5-auth.md)
- [ ] Signup → login → token → `/api/auth/me` by hand; decoded a JWT on jwt.io
- [ ] Logout invalidates the token (and you can explain how)
- [ ] 401 vs 403 vs 404-for-privacy, each demonstrated
- [ ] Read the audit log as admin
- [ ] `npm run test:stage5` green · checkpoint answered · reviewed ✅

## Week 3 — Async & Scaling

### Stage 6: Async Jobs & Queues · [guide](docs/stage-6-async-jobs.md)
- [ ] API + worker + Redis running; analysed a real prompt with Claude
- [ ] Watched a job go pending → processing → completed
- [ ] Explained retryable vs non-retryable errors, and idempotency
- [ ] `npm run test:stage6` green · checkpoint answered · reviewed ✅

### Stage 7: Observability · [guide](docs/stage-7-observability.md)
- [ ] Traced one request through the logs by its `X-Request-Id`
- [ ] Read `/metrics` and found the latency histogram for one route
- [ ] Made `/health/ready` fail by stopping Redis
- [ ] `npm run test:stage7` green · checkpoint answered · reviewed ✅

## Week 4 — Production-Ready

### Stage 8: Testing & CI · [guide](docs/stage-8-testing.md)
- [ ] `npm run ci` green locally; CI green on GitHub
- [ ] Wrote one new regression test for a bug you hit yourself
- [ ] `npm run test:stage8` green · checkpoint answered · reviewed ✅

### Stage 9: Deployment · [guide](docs/stage-9-deployment.md)
- [ ] `npm run docker:build` and ran the image locally
- [ ] Deployed to Fly.io; `/health/ready` is green in production
- [ ] Ran the full auth + analysis flow against production
- [ ] `npm run test:stage9` green · checkpoint answered · reviewed ✅

### Stage 10: Advanced Patterns · [guide](docs/stage-10-advanced.md)
- [ ] Ran a real A/B experiment and interpreted its p-value
- [ ] Checked your spending at `/api/usage/me`
- [ ] Watched cache hits rise in `/metrics`
- [ ] Built one extension (semantic search, rubric judging, budget alerts…)
- [ ] `npm run test:stage10` green · checkpoint answered · reviewed ✅

## Learning log
Write one or two lines per day: what clicked, what confused you, what you want to ask.

| Date | Stage | Notes |
|---|---|---|
| | | |
