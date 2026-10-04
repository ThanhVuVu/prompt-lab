# Prompt Laboratory 🧪

A backend for AI developers to **version, test and optimise Claude prompts**, with A/B experiments, cost tracking and team collaboration.

This is a **learning project**. You build it stage by stage, going from "what is an HTTP request?" to a deployed, tested production API. The code here is a **skeleton**: infrastructure is provided, and the parts you learn from are marked `TODO(stageN)`.

> **Reference solutions:** the [`solutions`](https://github.com/ThanhVuVu/prompt-lab/tree/solutions) branch has all 10 stages completed, one commit per stage. Try each stage yourself first, then compare.

> **Stack:** Node.js 22 · TypeScript · Express 5 · zod · Jest + Supertest
> **Later stages:** PostgreSQL + Prisma · JWT · Bull/Redis · Claude API · Fly.io

---

## Quick start

```bash
git clone https://github.com/ThanhVuVu/prompt-lab.git
cd prompt-lab
npm install
cp .env.example .env

npm run stage1        # Stage 1 playground on http://localhost:3000
npm test              # run every test (most fail until you complete the TODOs, as expected)
```

Requirements: **Node.js 20+** (22 recommended, see `.nvmrc`), **git**, and either `curl` or a REST client (VS Code [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client), Postman or Insomnia).

## Scripts

| Command | What it does |
|---|---|
| `npm run stage1` | Runs the single-file Stage 1 server (`stage1/hello-server.ts`) with auto-restart |
| `npm run dev` | Runs the real app (`src/index.ts`) with auto-restart |
| `npm test` | Runs all tests |
| `npm run test:stage1` / `test:stage2` / `test:stage3` | Runs one stage's tests |
| `npm run typecheck` | Type-checks everything without running anything |
| `npm run build` then `npm start` | Compiles to `dist/` and runs it the way production would |

## How to work through this repo

1. **Read the stage guide** in `docs/` before you touch code.
2. **Read the stage's tests** (`tests/stageN.test.ts`). They are the specification.
3. Search for your TODOs: `grep -rn "TODO(stage1)" src stage1`.
4. Make the tests green: `npm run test:stageN`. Also try every endpoint by hand with curl or `http/*.http`.
5. Answer the **checkpoint questions** at the end of the guide in your own words.
6. Commit, push and ask for a review (see below). Tick the stage off in [`PROGRESS.md`](PROGRESS.md).

**Unimplemented code returns `501 Not Implemented`**, with a message that names the file to open:

```json
{ "error": { "code": "NOT_IMPLEMENTED", "message": "TODO: stage3: PromptController.list() in src/controllers/promptController.ts" } }
```

### Git workflow (one branch per stage)

```bash
git checkout -b stage-1
# ...work, commit often...
git push -u origin stage-1
# open a Pull Request → ask for review → merge into main → start stage-2 from main
```

## Project structure

```
prompt-lab/
├── stage1/
│   └── hello-server.ts        # Stage 1: everything in one file, on purpose
├── src/
│   ├── index.ts               # entry point: load config, start listening
│   ├── app.ts                 # builds the Express app (middleware order lives here)
│   ├── config/env.ts          # the ONLY place that reads process.env
│   ├── routes/                # URL + method → middleware → controller (no logic)
│   ├── controllers/           # HTTP ⇄ service: read req, pick status code, write res
│   ├── services/              # business logic, knows nothing about HTTP
│   ├── schemas/               # zod runtime validation schemas
│   ├── middleware/            # validation, logging, fake auth, error handling
│   ├── types/                 # TypeScript interfaces
│   └── utils/errors.ts        # typed errors: ValidationError, NotFoundError, …
├── tests/                     # Jest + Supertest, one file per stage
├── http/                      # ready-made requests (VS Code REST Client format)
├── docs/                      # stage guides
├── .env.example               # copy to .env (never commit .env)
├── tsconfig.json              # editor/tests/typecheck config
└── tsconfig.build.json        # production build: src/ → dist/
```

How a request flows through the layers:

```
HTTP request
  → express.json()      parse body
  → requestLogger       log it
  → fakeAuth            who is calling? (sets req.userId)
  → router              which handler? (routes/)
  → validateBody        is the input valid? (middleware/validation.ts + schemas/)
  → controller          translate HTTP → service call (controllers/)
  → service             do the actual work (services/)
  ← controller          pick status code, send JSON
  ← errorHandler        if anything threw: format a consistent error response
```

## API (at the end of Stage 3)

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/health` | 200 | |
| POST | `/echo` | 200 | 400 |
| GET | `/api/prompts?page=1&limit=10` | 200 `{ data, total, page, limit }` | 400 |
| POST | `/api/prompts` | 201 prompt | 400 |
| GET | `/api/prompts/:id` | 200 prompt | 404 |
| PATCH | `/api/prompts/:id` | 200 prompt | 400, 403, 404 |
| DELETE | `/api/prompts/:id` | 204 (empty) | 403, 404 |

Every error has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request body", "details": [{ "path": "title", "message": "..." }] } }
```

Until Stage 5 adds real login, "who you are" comes from the `x-user-id` header (default: `demo-user`). It is **not secure**: anyone can claim to be anyone. That's the point of Stage 5.

## Roadmap

| Stage | Topic | Guide | Status |
|---|---|---|---|
| 1 | HTTP & web fundamentals | [docs/stage-1-http.md](docs/stage-1-http.md) | ✅ skeleton ready |
| 2 | Project structure & TypeScript | [docs/stage-2-structure.md](docs/stage-2-structure.md) | ✅ skeleton ready |
| 3 | REST APIs & validation | [docs/stage-3-rest-validation.md](docs/stage-3-rest-validation.md) | ✅ skeleton ready |
| 4 | Databases & data modelling (PostgreSQL + Prisma) | on the `solutions` branch | ✅ solution ready |
| 5 | Authentication & authorization (JWT, ownership, audit log) | on the `solutions` branch | ✅ solution ready |
| 6 | Async jobs & queues (Bull + Claude API) | on the `solutions` branch | ✅ solution ready |
| 7 | Observability & logging | on the `solutions` branch | ✅ solution ready |
| 8 | Testing (test DB, CI) | on the `solutions` branch | ✅ solution ready |
| 9 | Deployment (Docker + Fly.io) | on the `solutions` branch | ✅ solution ready |
| 10 | Advanced: A/B tests, caching, semantic search, cost tracking | on the `solutions` branch | ✅ solution ready |

Stages 4–10 are on the `solutions` branch, with a guide for each in its `docs/` folder.

## Getting help

If you're stuck, ask with:

1. **What you expected** vs **what happened**
2. The **exact error** (copy the whole thing, including the stack trace)
3. The **command** you ran (`curl ...`, `npm test ...`)
4. A link to your branch or commit

"It doesn't work" can't be debugged. A failing test name plus its output can usually be fixed in minutes.
