# Stage 9: Deployment & Environment Management (days 21–22)

**Goal:** run Prompt Lab on the internet: containerised, configured through the environment, migrated safely, observable, and updated without downtime.

**Key files:** `Dockerfile`, `.dockerignore`, `fly.toml`, `src/config/env.ts` (production checks), `src/middleware/security.ts`, `src/app.ts` (`trust proxy`)
**Tests:** `npm run test:stage9`

---

## Why this matters

Your laptop is not production. Production has different config, real traffic, proxies in front of you, several instances at once, and attackers. Most "it worked locally" incidents come from configuration (a missing or development secret), migrations (a schema change that breaks the running version), or networking (the wrong client IP, plain HTTP). Deploying early and often turns these from emergencies into routine.

## What was verified for this stage

The production build was run exactly as the Dockerfile would build it: `npm ci` → `npm run build` → `npm prune --omit=dev`. Then it went through the release command (`prisma migrate deploy`), the API and the worker with `NODE_ENV=production`. That run checked readiness, security headers, JSON logs, graceful shutdown on SIGTERM, and that a development `JWT_SECRET` is **refused** at startup. It also exposed a real issue: the login rate limiter keyed on the raw IP, which IPv6 clients can rotate past. It's fixed, and a regression test now guards it.

> `docker build` itself couldn't complete in the sandbox where this was written, because its network policy blocks `deb.debian.org`. Run `npm run docker:build` on your machine. Fly.io's builders have normal internet access.

## Concepts

### Containers: build once, run anywhere

The `Dockerfile` is **multi-stage**:
1. **build**: installs all dependencies, compiles TypeScript, then drops dev dependencies.
2. **runtime**: copies only `node_modules`, `dist`, and what migrations need, and runs as the **non-root** `node` user.

Dependency manifests are copied **before** the source code, so Docker's layer cache skips `npm ci` when only code changed. `.dockerignore` keeps `.env`, `.git` and tests out of the image. **Secrets never get baked into an image**: anyone who pulls it can read them.

### Configuration: the 12-factor way

Everything that differs between environments comes from **environment variables**:

| Where | What |
|---|---|
| `fly.toml` → `[env]` | non-secret settings: `NODE_ENV`, `LOG_FORMAT`, `TRUST_PROXY_HOPS`, model name |
| `fly secrets set` | secrets: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY` (encrypted, never in git) |

`loadEnv()` **fails fast** in production when `JWT_SECRET` is a development value or `DATABASE_URL` points at localhost. Crashing at deploy time is far better than running insecurely.

### Migrations in production

`release_command = 'npx prisma migrate deploy'` runs **once per deploy, before** new machines start. If it fails, the deploy stops and the old version keeps serving.

During a rolling deploy, old and new code run **at the same time** against the new schema. So migrations must be **backwards-compatible** with the previous release:

- Adding a nullable column or a new table is safe.
- Renaming or dropping a column takes several deploys: add the new column → write to both → backfill → switch reads → drop the old one later.
- `migrate dev` and `migrate reset` are for development only. Production only ever runs `migrate deploy`.

### Zero-downtime deploys

`strategy = 'rolling'` replaces machines one at a time. Fly sends traffic only to machines whose `/health/ready` passes. On shutdown, Fly sends SIGTERM, and `src/index.ts` stops accepting connections, finishes in-flight requests, then closes the queue and database. The worker finishes its current jobs.

### Behind a proxy

Fly's edge terminates TLS and forwards requests. Without `trust proxy`, `req.ip` is the proxy's address for every user, and the login rate limiter would block everyone at once. `TRUST_PROXY_HOPS=1` trusts exactly one hop. Trusting more lets clients spoof their IP with a fake `X-Forwarded-For`, and a test checks that this can't happen.

### Hardening included

- **helmet**: HSTS, `nosniff`, CSP and frame options, and `X-Powered-By` removed.
- **Login rate limit**: 10 attempts per IP and email per 15 minutes, then **429** (even for the right password).
- 100 KB body limit (413), graceful shutdown, non-root container.

## Runbook: first deploy to Fly.io

```bash
# 0. Install the CLI and log in:  https://fly.io/docs/flyctl/install/
fly auth login

# 1. Create the app from fly.toml (edit `app` to a unique name first)
fly launch --no-deploy --copy-config

# 2. Databases (check the Fly docs for current commands and plans):
#    Postgres: Fly Managed Postgres, or Neon/Supabase. You need a postgres:// URL.
#    Redis:    `fly redis create` (Upstash), or any Redis URL.

# 3. Secrets: encrypted, injected as env vars, never committed
fly secrets set \
  DATABASE_URL='postgresql://…' \
  REDIS_URL='rediss://…' \
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  ANTHROPIC_API_KEY='sk-ant-…'

# 4. Deploy: builds the image, runs migrations, rolls out app + worker
fly deploy

# 5. Verify
curl https://<your-app>.fly.dev/health/ready
fly logs                    # JSON logs from both process groups
fly status                  # machines and health checks

# Day-2 operations
fly scale count worker=2    # more workers for more jobs
fly releases                # deploy history
fly deploy --image <previous-image>   # roll back
```

Then point `http/stage5.http` at `https://<your-app>.fly.dev` and run through the whole flow against production.

## Common mistakes

- **Secrets in `fly.toml`, the Dockerfile, or git history.** If one leaks, rotate it. Deleting the commit isn't enough.
- **Running `migrate dev` or `migrate reset` in production.**
- **A destructive migration in the same deploy as the code that stops using the column.**
- **`trust proxy` set to `true`** (trusts every hop, so IPs can be spoofed), or not set at all (everyone shares one IP).
- **No readiness check**, so traffic reaches machines that can't reach the database.
- **Logging to files in a container**, or `NODE_ENV` not set to `production`.
- **Running as root** in the container.

## Debugging tips

- The deploy failed at the release command? `fly logs` shows the Prisma error. The old version is still serving.
- Machines keep restarting? Look for `Invalid environment variables` in the logs, usually a missing secret.
- `fly ssh console` gets you a shell inside a machine; `env | sort` shows what it actually sees.
- Locally: `docker run --env-file .env -p 3000:3000 prompt-lab` runs the production image.

## Extensions

- A **deploy workflow**: after CI passes on `main`, run `fly deploy` with a `FLY_API_TOKEN` secret.
- A **staging** app (`fly.staging.toml`) and promote to production after checks.
- Share rate-limit counters across instances with a Redis store.
- CORS configuration for when you build the React frontend.
- Automated Postgres backups, plus actually testing a restore.

## Checkpoint

- [ ] Walk through the Dockerfile stage by stage. Why multi-stage? Why non-root? Why copy `package.json` first?
- [ ] Where does each config value live in production, and why are secrets separate?
- [ ] What happens, step by step, during `fly deploy`? What if the migration fails?
- [ ] Why must a migration be compatible with the *previous* release?
- [ ] What does `trust proxy` change, and what goes wrong with too many or too few hops?
- [ ] Your production API returns 503 on `/health/ready`. What do you check first?
