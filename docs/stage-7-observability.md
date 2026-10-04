# Stage 7: Observability & Logging (days 17–18)

**Goal:** when something breaks in production at 3am, be able to answer *what happened, to whom, and why*, without attaching a debugger.

**Key files:** `src/config/logger.ts`, `src/utils/requestContext.ts`, `src/middleware/requestId.ts`, `src/middleware/logging.ts`, `src/middleware/errorHandler.ts`, `src/config/metrics.ts`, `src/controllers/healthController.ts`
**Tests:** `npm run test:stage7`

---

## Why this matters

You can't attach a debugger to production. All you have is what your code chose to record. Bugs that never show up locally (one user's data, a slow query under load, a dependency timing out) are found through logs and metrics, or not found at all. Compliance also needs evidence. And alerting ("error rate above 1%") is how you hear about an outage before your users tweet about it.

## The three pillars

| | Answers | Here |
|---|---|---|
| **Logs** | What happened to *this* request? | winston, one JSON object per line, stamped with `requestId` and `userId` |
| **Metrics** | How is the *system* doing? (rates, latencies, totals) | Prometheus format at `GET /metrics` (worker: `:9100/metrics`) |
| **Traces** | Where did the time go, across services? | the `X-Request-Id` header, propagated (full tracing: OpenTelemetry, an extension) |

## Concepts

### Structured logs

```
❌ console.log(`User ${id} created prompt ${pid} in ${ms}ms`)
✅ logger.info('request completed', { method, route, status, durationMs, requestId, userId })
```

A sentence can only be grepped. An object can be filtered (`status >= 500`), grouped (`by route`), and aggregated (`p95(durationMs)`). Set `LOG_FORMAT=json` to see what production emits; `pretty` is for humans during development.

**Levels:** `error` means someone must act; `warn` means unusual but handled (4xx, a retried job); `info` covers normal events; `debug` is for development detail. Production usually runs at `info`.

### Request ids and AsyncLocalStorage

`requestId` middleware gives each request an id, or reuses a valid incoming `X-Request-Id` from a proxy or another service, and returns it as a response header. `AsyncLocalStorage` makes that id (and the user id, once authenticated) available to **every** log call made while handling the request, through every `await`, without passing it as a parameter. 500 responses include the `requestId`, so a user's bug report leads you straight to the log line with the stack trace.

### What never goes in logs

Passwords, tokens, `Authorization` headers, full request bodies, API keys. Logs are copied to many systems, read by many people and kept for months. The tests assert that a login attempt's password and the user's token never appear in any log entry.

### Metrics and cardinality

`http_request_duration_seconds{method, route, status}` is a **histogram**: from it you get request rate, error rate (`status=~"5.."`) and latency percentiles. The `route` label is the **pattern** (`/api/prompts/:id`), never the real path. One time series per prompt id would mean millions of series and a dead monitoring system. This is the *cardinality* problem. The worker also counts `jobs_processed_total{outcome}` and `claude_cost_usd_total{model}`.

### Liveness vs readiness

| Endpoint | Checks | On failure the platform… |
|---|---|---|
| `GET /health` | nothing (the process answers) | **restarts** the container |
| `GET /health/ready` | DB `SELECT 1` + Redis `PING`, each with a 2 s timeout | **stops routing traffic** to it |

If the database is down, restarting the API won't help. That's why the two checks are kept separate.

## Try it

```bash
LOG_FORMAT=json npm run dev
curl -i localhost:3000/health/ready
curl -s localhost:3000/metrics | grep http_request_duration_seconds_count
# trace one request: copy X-Request-Id from a response, then
npm run dev 2>&1 | grep <request-id>
```

## Common mistakes

- **`console.log` everywhere:** no levels, no structure, no request id.
- **Logging too much** (every DB row) or **too little** (errors without context).
- **Leaking stack traces to clients** in 500 responses.
- **High-cardinality metric labels** (user ids, raw URLs, error messages).
- **A health check that hangs** when a dependency hangs. Always use timeouts.
- **Writing log files inside containers.** Log to stdout and let the platform collect it.

## Debugging tips

- One user's problem: find their request id (response header, or the error body for 500s), then filter logs by it.
- "It's slow": look at `durationMs` by `route` in the logs, or the histogram, before guessing.
- `LOG_LEVEL=debug` locally for more detail. Don't leave it on in production.

## Extensions

- **OpenTelemetry** tracing: spans for HTTP, Prisma and Redis, viewed in Jaeger.
- Send errors to **Sentry** with the `requestId` attached.
- A Grafana dashboard: requests/s, p95 latency per route, 5xx rate, Claude spend per day.
- Alert rules: `rate(5xx) / rate(all) > 0.01 for 5m`, readiness failing, queue backlog growing.
- Log slow Prisma queries (over 200 ms) at `warn`.

## Checkpoint

- [ ] Why structured logs instead of text? Show a query you could run on them.
- [ ] How does every log line know the `requestId` without it being passed around?
- [ ] What must never be logged, and why?
- [ ] Why is the metric label `/api/prompts/:id` and not `/api/prompts/<uuid>`?
- [ ] Liveness vs readiness: what does each failure trigger, and why does that difference matter?
- [ ] A user says "I got an error at 10:42". Walk through how you find out what happened.
