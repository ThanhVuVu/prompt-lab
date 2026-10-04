# Stage 8: Testing & CI (days 19–20)

**Goal:** a test suite you trust enough to refactor and deploy on, run automatically on every push.

**Key files:** `jest.config.js`, `tests/globalSetup.ts`, `tests/helpers/` (db, auth, fakes, factories, logs), `tests/stage8.test.ts`, `eslint.config.mjs`, `.github/workflows/ci.yml`
**Commands:** `npm test` · `npm run test:coverage` · `npm run lint` · `npm run ci` (everything CI runs)

---

## Why this matters

Regressions, meaning features that used to work and quietly broke, are the most common cause of production incidents. Tests let you change code without fear. CI makes sure "it works on my machine" counts for nothing: every push is checked the same way, on a clean machine, against real Postgres and Redis. With several people on a codebase, CI is what keeps them from breaking each other's work.

This stage found a **real bug**: a request body over 100 KB returned **500** instead of **413**. The regression test that exposed it now guards it forever.

## What's in the suite (139 tests)

| Kind | Example | Speed | Catches |
|---|---|---|---|
| **Unit** | schema rules, `calculateCostUsd`, `isRetryable` | ~1 ms | logic errors in pure functions |
| **Integration** | supertest → app → Postgres for every endpoint | ~10–50 ms | wiring, SQL, status codes, auth rules |
| **Concurrency** | two PATCHes at once, two signups with one email | ~50 ms | race conditions, missing constraints |
| **End-to-end** | real BullMQ queue + worker through Redis | ~1 s | infrastructure glue |
| **Regression** | `?page=abc` → 400, oversized body → 413 | fast | the same bug returning |

**The testing pyramid:** many fast unit tests, a solid layer of integration tests, and a few slow end-to-end ones. For an API, integration tests through HTTP give the most confidence per test, because they check what clients actually see.

## Concepts

### Isolation: every test starts from a known state

- A **separate test database** (`TEST_DATABASE_URL`), migrated once per run (`globalSetup.ts`) and **TRUNCATEd before each test** (`resetDatabase()`).
- Test files run **serially** (`maxWorkers: 1`) because they share one database. The alternative is one schema or database per worker.
- Each test creates its own users through the real signup endpoint (`createUser`) and its own data through **factories** (`buildPrompt`, `createPromptAs`). No test depends on another test's leftovers, or on the order tests run in.

### Fakes, mocks and the real thing

| | What | Used for |
|---|---|---|
| **Fake** | a working lightweight implementation | `InMemoryJobQueue`, `FakeAnalyzer` |
| **Mock** | a stub that records calls so you can assert on them | the Anthropic client in `ClaudeService` tests (`jest.fn()`) |
| **Real** | the actual dependency | Postgres and Redis (in Docker locally, as CI services) |

The rule of thumb: **use the real thing when it's cheap and deterministic** (your own database), and **fake what is slow, costly or flaky** (a paid external API). Dependency injection (`createApp({ jobQueue })`, `new ClaudeService(client)`) is what makes swapping possible. That's the payoff from Stage 2.

### Coverage is a floor, not a goal

`npm run test:coverage` reports which lines ran (about 97% statements, 83% branches here). CI fails below the thresholds in `jest.config.js`. 100% coverage doesn't mean correct: a test that runs a line without asserting anything still counts. Use coverage to find **untested areas**, then write meaningful assertions for them.

### What a good test looks like

```ts
it('two simultaneous signups with the same email: exactly one wins, the other gets 409', async () => {
  const results = await Promise.all([signup(body), signup(body)]);        // arrange + act
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);        // assert behaviour
  expect(await prisma.user.count({ where: { email } })).toBe(1);           // assert state
});
```

- The name states the behaviour, so a failure message reads as a bug report.
- It tests **behaviour** (status codes, stored state), not implementation details.
- It asserts both the response **and** the side effect.

### CI (`.github/workflows/ci.yml`)

On every push and pull request: start Postgres and Redis as services → `npm ci` → lint → type-check → tests with coverage → build. The same sequence runs locally with `npm run ci`. It was checked from a clean checkout with no `.env`. That check found that `npm install` failed without `DATABASE_URL`, so `prisma.config.ts` was fixed.

### Linting

ESLint (`npm run lint`) catches what the compiler doesn't: unused variables, accidental `any`, stray `console.log`. It's cheap, automatic and consistent across the team.

## Common mistakes

- **Tests that depend on each other**, or on order or leftover data. They pass alone and fail together (or the reverse).
- **Hitting real paid APIs** in tests. That's slow, flaky and costs money.
- **Mocking everything**, including your own database, until the tests check the mocks instead of the system.
- **Asserting too little** (`expect(res.status).toBe(200)` only) or too much (exact timestamps, internal call counts).
- **`setTimeout` sleeps** instead of polling for a condition. That's how flaky tests are born.
- **Ignoring a flaky test.** It's usually a real race condition.

## Debugging tips

- Run one file or one test: `npx jest tests/stage5 -t "logout"`.
- *"Jest did not exit one second after the test run"* means an open handle (DB pool, Redis connection, timer). `npx jest --detectOpenHandles` finds it. Stage 6 hit this: BullMQ doesn't close connections you hand it.
- A test passes alone but fails in the suite? Look for shared state: data, module-level variables, env vars.
- CI-only failure? Run `npm run ci` locally from a clean checkout. Missing `.env` values are the usual cause.

## Extensions

- **Testcontainers**: start a fresh Postgres per test run from the test code itself.
- **Mutation testing** (Stryker) checks whether your tests catch deliberately injected bugs.
- **Contract tests** or an OpenAPI spec validated against responses.
- **Load testing** with k6: what p95 latency do you get at 100 requests/s?
- Run test files in parallel with one database schema per Jest worker.

## Checkpoint

- [ ] What makes these tests independent of each other? Point at the code.
- [ ] When do you fake a dependency, and when do you use the real one? Give one example of each from this repo.
- [ ] Explain the concurrency test for prompt versions. What would fail without the transaction and the unique constraint?
- [ ] What does coverage tell you? What doesn't it tell you?
- [ ] Walk through what CI does on a push, step by step.
- [ ] Write a regression test for a bug you hit yourself during Stages 1–7.
