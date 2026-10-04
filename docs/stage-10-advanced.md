# Stage 10: Advanced Patterns (days 23–24+)

Three of the four suggested features were built:

| Feature | Endpoints | Key files |
|---|---|---|
| **A. A/B experiments with an LLM judge** | `POST/GET /api/experiments`, `GET /api/experiments/:id` | `services/experimentService.ts`, `workers/experimentWorker.ts`, `utils/stats.ts`, `utils/template.ts` |
| **B. Caching** | (transparent: `GET /api/prompts/:id`) | `services/cache.ts`, `services/promptService.ts` |
| **D. Cost tracking & budgets** | `GET /api/usage/me`, `GET /api/usage/users` (admin), `PATCH /api/users/:id { monthlyBudgetUsd }` | `services/costService.ts`, the `cost_logs` table |

**Tests:** `npm run test:stage10` · **Try it:** `http/stage10.http`

**Why not C (semantic search)?** It needs **embeddings** (a vector per prompt), and the Claude API doesn't offer an embeddings endpoint. Anthropic points to dedicated embedding providers such as Voyage AI. The design would be: on create/update, queue a job that embeds the prompt; store the vector in a `pgvector` column with an HNSW index; search with `ORDER BY embedding <=> $query LIMIT 10`. It's a good next project, and it reuses the queue from Stage 6.

---

## A. A/B experiments

### Why this matters

"Is prompt B better than prompt A?" is the central question of prompt engineering, and gut feeling on two examples is how teams fool themselves. This feature brings in the ideas behind real evaluation systems: **the same inputs** for both variants, **blind and randomised** comparison, **cost and latency** alongside quality, and **statistics** before declaring a winner.

### The flow

```
POST /api/experiments { promptAId, promptBId, inputs: [{ticket: "…"}, …] }
  → validate: both prompts visible, every {{variable}} provided, budget left
  → INSERT experiment (with SNAPSHOTS of both prompts) + job → queue → 202
worker:
  for each input i:   render A, render B → Claude → experiment_results (+ cost_logs)
  for each input i:   judge(A_i vs B_i, random order) → experiment_judgments (+ cost_logs)
  → summary: wins, ties, sign-test p-value, median latency, cost per variant
GET /api/experiments/:id → everything + summary
```

### Ideas worth understanding

- **Snapshots.** The experiment copies both prompts' text when it's created. Editing a prompt later must not silently change an experiment's meaning. Results are historical records.
- **Fail before paying.** Missing template variables are rejected with 400 at creation, before a single paid call.
- **Resumable, idempotent work.** Each (input, variant) result and each judgment is saved as soon as it's computed, and `UNIQUE(experiment_id, input_index, prompt_version)` guarantees it can't be duplicated. A retry after call 37 of 60 starts at call 37. A test proves no call is paid for twice.
- **LLM-as-judge and position bias.** Judges tend to favour whichever answer they read first. The worker **randomises the order** per input (and records it), and the judge sees "Response 1/2", never "A/B". The judge also writes its reasoning **before** its verdict, and the outputs are delimited as data (prompt-injection hygiene).
- **Statistics: the sign test.** If A and B were equally good, each non-tied verdict would be a coin flip. `p = P(a split at least this lopsided | fair coin)`. With 5 inputs, even **5–0 gives p = 0.0625, which is not significant**; 6–0 gives p = 0.031. The summary only names a winner when p < 0.05. Otherwise it says to add more inputs. This is the most important lesson of the stage: small samples lie.
- **Medians for latency.** One slow request skews a mean, so the median is reported.

## B. Caching (cache-aside)

```
read:   cache.get(key) → hit? return : (db read → cache.set(key, row, TTL) → return)
write:  db write (commit) → cache.del(key)
```

- **Invalidate after the commit**, not inside the transaction. Otherwise a concurrent reader can re-cache the old row between your `del` and the commit.
- **TTL as a safety net.** If an invalidation is ever missed (a direct SQL edit, a crash between commit and `del`), stale data lives at most `CACHE_TTL_SECONDS`. A test demonstrates exactly this staleness.
- **Authorization still runs on cached data.** The cache stores the row, not the permission decision.
- **JSON loses types.** Dates come back as strings, hence `reviveDates()`.
- **Measure it:** `cache_requests_total{result="hit"|"miss"}`. A cache with a 5% hit rate is just complexity.
- `CACHE_DRIVER=redis` is shared across instances (an invalidation reaches all of them); `memory` is per process (tests).

## D. Cost tracking & budgets

- **One ledger table, `cost_logs`.** Every Claude call writes exactly one row (user, operation, model, tokens, `DECIMAL` cost), **in the same transaction** as the result it paid for. Every report is an aggregation over this one source of truth.
- **Aggregate in SQL.** `groupBy` by model and operation, `date_trunc('day', …)` for the daily series, with a raw tagged-template query whose parameters are bound (no SQL injection). Never load rows into JavaScript to sum them.
- **Budgets.** Before queueing paid work, `assertWithinBudget` compares month-to-date spend (an indexed `(user_id, created_at)` query) with the user's budget, or `DEFAULT_MONTHLY_BUDGET_USD`, and returns **402 Payment Required** when it's used up. It's a *soft* limit: jobs already queued can overshoot slightly, because a call's cost is only known after it runs. Admins adjust budgets per user, and the change is audit-logged.
- **Months are UTC.** Budgets reset on the 1st at 00:00 UTC. Time zones in billing are a classic source of bugs.

## Common mistakes

- Declaring a winner from a handful of examples (check the p-value).
- Letting experiments read live prompts instead of snapshots.
- Re-running finished work on retry, which means paying twice.
- Caching without invalidation, or invalidating before the commit.
- Caching per-user authorization decisions under a shared key.
- Summing money as floats, or in JavaScript over thousands of rows.

## Extensions

- **Semantic search** (the design above, with Voyage embeddings + pgvector).
- **Rubric-based judging:** let the experiment specify criteria, and score each on a 1–5 scale.
- **Run generations concurrently** (for example, 4 at a time), within your rate limits.
- **Batch API** for big experiments: 50% cheaper, asynchronous by nature.
- **Prompt caching** in the worker: the judge's system prompt is identical every time.
- **Budget alerts** at 80% via email or webhook, and a hard stop inside the worker as well.
- **Per-hop cost** when a refusal fallback model served part of a request (`usage.iterations`).

## Checkpoint

- [ ] Why snapshot the prompts? What would go wrong without it?
- [ ] Explain position bias and how the worker neutralises it.
- [ ] Why is 5–0 "not significant" but 6–0 is? What does the p-value mean in plain words?
- [ ] Walk through a retry after a failure at call 37 of 60. Which rows exist, and what runs again?
- [ ] Cache-aside: why invalidate after the commit? What does the TTL protect against?
- [ ] Why is the budget check a *soft* limit? How would you make it hard, and what would that cost?
