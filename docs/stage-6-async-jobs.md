# Stage 6: Async Jobs, Queues & the Claude API (days 14–16)

**Goal:** let users ask Claude to review a prompt *without* the HTTP request waiting for Claude. The API records a job and answers `202 Accepted` in milliseconds. A separate worker process calls Claude, stores the result and its cost, and retries transient failures.

**Key files:** `src/services/claudeService.ts`, `src/config/pricing.ts`, `src/queues/analysisQueue.ts`, `src/services/jobService.ts`, `src/workers/analysisWorker.ts`, `src/worker.ts`
**Tests:** `npm run test:stage6` (Redis must be running for the end-to-end test)

---

## Why this matters

A Claude call takes seconds to tens of seconds. Inside a request handler, that means hanging clients, proxies timing out at 30–60 s, and API processes tied up waiting, so the whole service slows down when Claude is busy. Queues **decouple** "accept the work" from "do the work". Each side scales on its own (add workers, not API servers), a crash doesn't lose the work, and retries become routine. Sending email, generating reports, processing payments, transcoding video: every real backend has this pattern somewhere.

## Run it

```bash
docker compose up -d                 # Postgres + Redis
npm run db:migrate && npm run db:seed
# put your key in .env:  ANTHROPIC_API_KEY=sk-ant-...
npm run dev                          # terminal 1: the API
npm run worker:dev                   # terminal 2: the worker
# then use http/stage6.http
```

## The flow

```
client ──POST /api/prompts/:id/analyze──▶ API ── INSERT jobs (pending) ──▶ Postgres
   ◀── 202 { jobId, statusUrl } ───────── API ── queue.add({ jobId }) ────▶ Redis
                                                                              │
                         worker ◀────────────── picks up { jobId } ───────────┘
                           ├─ UPDATE jobs SET status = 'processing'
                           ├─ Claude API  (seconds…)
                           └─ INSERT prompt_analyses + UPDATE jobs SET status = 'completed'   (one transaction)
client ──GET /api/jobs/:id (poll)──▶ API ──▶ { status: 'completed', result }
```

- **Postgres is the source of truth** for job status. Redis only carries the message "please process job X". If Redis loses it, the row still says what happened.
- **`202 Accepted`** means "I've taken this on, but it isn't done". The `Location` header points at the job.
- The worker is **a separate process** (`src/worker.ts`). In production you run N of them.

## Concepts

### Retries, backoff and what NOT to retry

`attempts: 3, backoff: { type: 'exponential', delay: 2000 }` means try, wait 2 s, try, wait 4 s, try, then give up. Exponential backoff gives an overloaded service room to recover instead of hammering it.

But **only retry what can succeed next time** (`isRetryable()` in the worker):

| Error | Retry? | Why |
|---|---|---|
| 429 rate limit, 529 overloaded, 5xx, timeouts, network | ✅ | transient |
| 400 bad request, 401 bad key, 403 | ❌ | will fail identically every time |
| `stop_reason: "refusal"` | ❌ | the model declined this content |
| prompt deleted meanwhile | ❌ | nothing left to analyse |

Non-retryable errors throw BullMQ's `UnrecoverableError`, which marks the job failed immediately.

### Idempotency: "at-least-once" delivery

Queues guarantee a message is delivered **at least** once, not **exactly** once. If a worker finishes but crashes before acknowledging, the job runs again. So the worker returns early when the job is already `completed`, and `prompt_analyses.job_id` is UNIQUE, so a duplicate insert fails instead of silently creating two analyses (and two charges).

### The dual-write problem

`enqueueAnalysis` writes to Postgres, then to Redis. Two systems, no shared transaction. If Redis is down after the row is committed, we mark the job `failed` and return **503**, so it isn't stuck "pending" forever. The fully robust fix is the **transactional outbox**: write the job **and** an "outbox" row in one DB transaction, and let a relay process push outbox rows to the queue. Worth knowing by name.

### Calling Claude well (`ClaudeService`)

```ts
await client.beta.messages.parse({
  model: env.CLAUDE_MODEL,                       // config, not code
  max_tokens: 16000,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: `<prompt_to_review>…</prompt_to_review>` }],
  output_config: { effort: env.CLAUDE_EFFORT, format: betaZodOutputFormat(analysisSchema) },
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
});
```

- **Structured outputs** (`format`): the response is guaranteed to match the zod schema and arrives parsed in `parsed_output`. No regex over free text.
- **Effort** controls how hard the model thinks, which also sets how many tokens it spends. `low` is enough for a short review. Raise it only if quality measurably improves.
- **Refusal handling:** check `stop_reason === 'refusal'` before reading content. `fallbacks: 'default'` asks the API to re-run a declined request on a recommended fallback model inside the same call.
- **The prompt under review is data, not instructions.** It's wrapped in tags, and the system prompt says never to follow it. That's a basic **prompt-injection** defence: users control that text.
- **Cost** = tokens × price (`src/config/pricing.ts`), stored as `DECIMAL` per analysis. Stage 10 builds spending reports on top of it.
- The SDK already retries 429/5xx twice; BullMQ retries on top of that.

### Testing without calling Claude

The worker depends on the `PromptAnalyzer` **interface**, and tests pass a `FakeAnalyzer`. The API depends on a `JobQueue` interface, and tests pass an `InMemoryJobQueue`. Real API calls in tests would be slow and flaky, and would cost money on every run. One test still runs the real BullMQ queue and worker through Redis, so the wiring itself is covered.

## Common mistakes

- **Awaiting the slow work in the request handler.** That defeats the point.
- **Retrying everything**, including 400s and bad keys. You burn three attempts (and money) to fail the same way.
- **Storing results only in Redis.** It's a cache and a message broker, not your database.
- **Non-idempotent workers.** Duplicate rows, duplicate charges, duplicate emails.
- **Hard-coding the model name or prices** in several places.
- **Putting the API key in code, or in the API process when only the worker needs it.**
- **Interpolating user text into instructions** without delimiting it (prompt injection).

## Debugging tips

- Job stuck `pending`? Check that the worker is running (`npm run worker:dev`) and that both processes use the same `REDIS_URL`.
- `Could not resolve authentication method`: `ANTHROPIC_API_KEY` is empty in the worker's environment.
- `redis-cli` → `KEYS bull:prompt-analysis:*` shows what BullMQ stores.
- `SELECT status, attempts, error FROM jobs ORDER BY created_at DESC LIMIT 5;` usually tells you the rest.

## Extensions

- **Server-Sent Events** (`GET /api/jobs/:id/events`) instead of polling.
- A **dead-letter view**: `GET /api/jobs?status=failed` for admins, plus `POST /api/jobs/:id/retry`.
- Price per hop using `usage.iterations` when a fallback model served the answer.
- Use the **Message Batches API** (50% cheaper) for bulk, non-urgent analyses.
- Implement the transactional outbox.

## Checkpoint

- [ ] Why 202 and not 200 or 201?
- [ ] Draw the flow: which process writes which row, and when?
- [ ] Which errors are retried, and why not the others?
- [ ] What makes the worker idempotent? Why does it need to be?
- [ ] What goes wrong if Redis is down when a user clicks "analyze"? What does the user see?
- [ ] How do the tests avoid calling the real Claude API?
