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
- [ ] Stage 4: Databases & Data Modelling (PostgreSQL + Prisma)
- [ ] Stage 5: Authentication & Authorization (JWT, ownership, audit log)

## Week 3 — Async & Scaling
- [ ] Stage 6: Async Jobs & Queues (Bull + Claude API)
- [ ] Stage 7: Observability & Logging

## Week 4 — Production-Ready
- [ ] Stage 8: Testing (test DB, CI)
- [ ] Stage 9: Deployment (Docker + Fly.io)
- [ ] Stage 10: Advanced Patterns (pick 2–3)

## Learning log
Write one or two lines per day: what clicked, what confused you, what you want to ask.

| Date | Stage | Notes |
|---|---|---|
| | | |
