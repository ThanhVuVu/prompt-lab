# Stage 2: Project Structure & TypeScript (days 3–4)

**Goal:** move from "one file" to a structure that still makes sense at 50,000 lines, and handle configuration properly.

**You'll work in:** `src/services/echoService.ts`, `src/controllers/echoController.ts`, `src/config/env.ts`, `src/middleware/logging.ts`
**Done when:** `npm run test:stage2` is green, `npm run typecheck` shows no errors, and `npm run dev` logs every request.

---

## Why this matters

Your Stage 1 file was fine at 80 lines. At work you'll join codebases where dozens of engineers touch the same API. Without clear layers, every change risks breaking something unrelated, and nobody can find where anything lives. A predictable structure makes onboarding, code review and testing work. It also lets you swap parts out later: in Stage 4 we replace in-memory storage with PostgreSQL by changing **only the service**.

## Concepts

### The layers (and the one rule for each)

| Layer | Folder | Its job | Must NOT |
|---|---|---|---|
| Routes | `src/routes/` | map `METHOD /path` → middleware → controller | contain logic |
| Controllers | `src/controllers/` | read `req`, call a service, choose the status code, write `res` | contain business rules |
| Services | `src/services/` | business logic: data in → data out | know about `req`, `res` or status codes |
| Middleware | `src/middleware/` | cross-cutting concerns that run for many routes | |
| Config | `src/config/` | read and validate the environment, once | |

A useful test: *could this service be called from a CLI script or a background job (Stage 6) without changes?* If it touches `req` or `res`, it couldn't.

### `app.ts` vs `index.ts`

`createApp()` **builds** the app; `index.ts` **starts** it on a port. Tests import `createApp()` and send requests in memory with supertest, with no port, no conflicts and no leftover servers.

### Dependency injection (a fancy name for "pass things in")

```ts
// Hard-wired, so it can't be swapped in tests:
class EchoController { private service = new EchoService(); }

// Injected, so tests or Stage 4 can pass a different implementation:
class EchoController { constructor(private readonly echoService: EchoService) {} }
```

`buildEcho(message, now = new Date())` uses the same idea for time. A test passes a fixed date and gets a predictable result.

### TypeScript: types are compile-time only

```ts
interface EchoRequest { message: string }
const body = req.body as EchoRequest; // ← a PROMISE to the compiler, not a CHECK
```

If the client sends `{ "message": 42 }`, TypeScript won't stop it at runtime. Types describe what you **expect**; you still need to **check** what you **get**. That's Stage 3's zod.

### Environment variables

- Config that changes between environments (port, database URL, API keys) goes in **environment variables**, never in code.
- `.env` holds your local values and is **git-ignored**. `.env.example` documents which variables exist, with fake values, and **is** committed.
- Env vars are **always strings**. `"false"` is truthy, and `"3000" + 1 === "30001"`.
- Validate them **once at startup** (`src/config/env.ts`) and crash immediately if something is wrong.

---

## Exercises

### 2.1 Read before you write (30 min)

Trace `GET /health` from `src/index.ts` → `app.ts` → `routes/index.ts` → `routes/health.ts` → `controllers/healthController.ts`. Draw it on paper. Compare it with `GET /health` in `stage1/hello-server.ts`: what did the extra files buy us?

### 2.2 Refactor `/echo` into layers

1. `src/services/echoService.ts`: implement `buildEcho` (pure logic, no HTTP).
2. `src/controllers/echoController.ts`: validate, call the service, respond. Throw `ValidationError` instead of writing a 400 yourself, and see how `middleware/errorHandler.ts` turns it into JSON.
3. The route is already wired in `src/routes/echo.ts`. Read it.

```bash
npm run dev
curl -i -X POST http://localhost:3000/echo -H "Content-Type: application/json" -d '{"message":"layers"}'
```

### 2.3 Fix the `LOG_REQUESTS` bug

Read the TODO in `src/config/env.ts`. Before fixing it, **prove the bug exists**: set `LOG_REQUESTS=false` in `.env` and notice the logger still thinks logging is on. Then fix it and run `npm run test:stage2`.

### 2.4 Request logger

Implement `src/middleware/logging.ts` so every request prints a line like:

```
POST /echo 200 2ms
GET /nope 404 0ms
```

Then answer the question in the file: why must you log inside `res.on('finish')`?

### 2.5 Add an endpoint by following the pattern

Add `GET /version` returning `{ name, version }` read from `package.json`, with its own route, controller and test. Don't copy-paste blindly: create each file and know why it exists. (Hint: `resolveJsonModule` is enabled in `tsconfig.json`.)

---

## Common mistakes

- **Putting `res.status(...)` inside a service.** Services return data or throw typed errors. Controllers decide HTTP.
- **`this` is undefined in a controller.** You used a normal method and passed it as `router.post('/', controller.echo)`. That's why our controllers use arrow-function properties.
- **Reading `process.env` all over the code.** Import `env` from `config/env.ts` instead.
- **Committing `.env`.** Run `git status` before every commit. If a secret ever gets pushed, rotating the secret is the only fix; deleting the commit isn't enough.
- **Fighting TypeScript with `any` and `as`.** Every `as` is a spot where you told the compiler to stop checking.

## Debugging tips

- `npm run typecheck` gives you all type errors at once, which is often clearer than the editor.
- *"Cannot find module '../services/echoService'"*: check the relative path and the file name's casing (Linux is case-sensitive, macOS isn't).
- If `npm run dev` doesn't restart, check whether the file you saved is under `src/`.
- *"Invalid environment variables"* at startup means `config/env.ts` is doing its job. Read which variable it names.

## Extensions

- Add `HOST` to the env schema and use it in `app.listen`.
- Write a unit test for `requestLogger` using `jest.spyOn(console, 'log')`.
- Read the [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) sections on everyday types and narrowing.
- Look at how `tsconfig.json` and `tsconfig.build.json` differ, and explain why there are two.

## Checkpoint

- [ ] Explain the job of routes, controllers and services. Where does a 404 decision belong?
- [ ] Why is `createApp()` separate from `app.listen()`?
- [ ] Why does TypeScript not protect you from bad JSON at runtime?
- [ ] What goes in `.env` vs `.env.example`, and which one is committed?
- [ ] Why is `"false"` truthy, and how did you fix it?
- [ ] Add a new endpoint without looking at an existing one first.
