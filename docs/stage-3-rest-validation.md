# Stage 3: REST APIs & Validation (days 5–7)

**Goal:** build the first real feature of Prompt Lab: full CRUD for prompts, with strict validation and correct status codes.

**You'll work in:** `src/schemas/promptSchemas.ts`, `src/middleware/validation.ts`, `src/services/promptService.ts`, `src/controllers/promptController.ts`
**Done when:** `npm run test:stage3` is green, and you've exercised every endpoint by hand with `http/stage3.http` or curl.

---

## Why this matters

Expose an API to 100 engineers and some of them **will** send `{"title": 42}`, forget required fields, send 5 MB strings, or try to edit someone else's data. Most API bugs and many security incidents come from validating the wrong thing, or not validating at all. Good APIs reject bad input **at the edge**, with a clear message that says which field is wrong, so the rest of the code can trust its data.

## Concepts

### REST: URLs are nouns, methods are verbs

```
GET    /api/prompts           list (paginated)       → 200
POST   /api/prompts           create                 → 201
GET    /api/prompts/:id       read one               → 200 | 404
PATCH  /api/prompts/:id       partial update         → 200 | 400 | 403 | 404
DELETE /api/prompts/:id       delete                 → 204 | 403 | 404
```

❌ `POST /api/createPrompt`, `GET /api/deletePrompt?id=1`
✅ `POST /api/prompts`, `DELETE /api/prompts/1`

### Validate at the edge, with a schema

```ts
// src/schemas/promptSchemas.ts
export const createPromptSchema = z.object({
  title: z.string().trim().min(3).max(100),
  // ...
});

// src/routes/prompts.ts
router.post('/', validateBody(createPromptSchema), controller.create);
```

Validation also **shapes** the data. Defaults are filled in (`tags: []`) and unknown fields are stripped, so a client can't sneak in `"createdBy": "admin"` or `"version": 99`. This protection has a name, *mass-assignment protection*, and a test checks for it.

### Errors: throw, don't hand-write

```ts
const prompt = this.promptService.getById(id);
if (!prompt) throw new NotFoundError(`Prompt ${id} not found`);
```

`middleware/errorHandler.ts` turns every typed error into the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request body",
             "details": [{ "path": "title", "message": "Too small: expected string to have >=3 characters" }] } }
```

One consistent format means client developers write their error handling once.

### Ownership: 404 before 403

When a user tries to update a prompt, check in this order:
1. Does it exist? If not, **404**.
2. Is the caller the owner? If not, **403**.
3. Do the update, then return **200**.

Until Stage 5, the caller's identity comes from the `x-user-id` header (`middleware/fakeAuth.ts`).

### Pagination

`GET /api/prompts?page=2&limit=10` returns `{ data: [...], total: 23, page: 2, limit: 10 }`. Never return an unbounded list: at 1 million prompts that's an outage. Cap `limit` (here, 100).

### Idempotency

`DELETE` twice → the second call gets a 404, but the **state** is the same (the prompt is gone), so DELETE is idempotent. `POST` twice → two prompts. That's why payment APIs use idempotency keys: a retried "charge card" request must not charge twice.

---

## Exercises (in this order)

### 3.1 Read the spec (30 min)

Read `tests/stage3.test.ts` from top to bottom. For every test, predict which file you'll need to change to make it pass.

### 3.2 Schemas: `src/schemas/promptSchemas.ts`

Complete `createPromptSchema`, `updatePromptSchema` and `listPromptsQuerySchema`. You can try a schema out without the server:

```bash
npx tsx -e "import { createPromptSchema } from './src/schemas/promptSchemas'; console.log(createPromptSchema.safeParse({ title: 'hi' }).error?.issues)"
```

### 3.3 Validation middleware: `src/middleware/validation.ts`

Implement `validateBody`. After this, the 400 tests start passing (the 201 ones still need the controller).

### 3.4 Service: `src/services/promptService.ts`

Implement `create`, `getById`, `list`, `update` and `delete` on the in-memory `Map`. Watch for these:
- `update` must **not** let `id`, `createdBy`, `createdAt` or `version` be overwritten.
- `version` goes up only when `content` changes.

### 3.5 Controller: `src/controllers/promptController.ts`

Wire it all together. Run `npm run test:stage3` after each method.

### 3.6 Try it by hand

```bash
npm run dev
# then use http/stage3.http in VS Code, or:
curl -i -X POST http://localhost:3000/api/prompts \
  -H "Content-Type: application/json" -H "x-user-id: alice" \
  -d '{"title":"Summarise","content":"Summarise this text in 3 bullets: {{text}}","tags":["summary"]}'

curl -i "http://localhost:3000/api/prompts?page=1&limit=5"
curl -i -X PATCH http://localhost:3000/api/prompts/<id> -H "Content-Type: application/json" -H "x-user-id: bob" -d '{"title":"Hacked"}'
```

---

## Common mistakes

- **201 vs 200.** Creating returns **201**. Most tests that fail on "expected 201, received 200" have this cause.
- **Sending a body with 204.** Use `res.status(204).send()`, not `.json(...)`.
- **`update` wipes fields.** `{...existing, ...data}` is right *only if* `data` contains just the fields the client sent. Watch out for `.partial()` keeping defaults like `tags: []`.
- **Trusting `req.query`.** `?page=abc` gives you the string `"abc"`, and `Number("abc")` is `NaN`, which slices out an empty page with no error. Validate it.
- **Returning the internal object.** Mutating a returned prompt object changes what's stored in the Map. Think about whether that matters (it will in tests you write later).
- **Checking 403 before 404.** If you check ownership first, an attacker can tell which ids exist from the 403s.

## Debugging tips

- A test failing with `501 NOT_IMPLEMENTED`? The message names the exact file still holding a TODO.
- Run one test by name: `npx jest tests/stage3 -t "paginates"`.
- Print the body when a status is unexpected: `console.log(res.status, res.body)` inside the test.
- *"Cannot set headers after they are sent"*: you responded twice. Look for a missing `return` or a `throw` after `res.json`.
- `req.params.id` is always a string.

## Extensions

- Add a `Location: /api/prompts/<id>` header to the 201 response.
- Add `?tag=summary` filtering to the list endpoint.
- Add `?search=` (substring match on title). In Stage 10 you'll compare this with semantic search.
- Add `POST /api/prompts/:id/duplicate`, which creates a copy owned by the caller (a nice ownership puzzle with public prompts).
- Rewrite `/echo` validation with a zod schema and `validateBody`.
- Make `GET /api/prompts/:id` return 404 for **other users' private** prompts. Why 404 and not 403?

## Checkpoint

- [ ] Why `PATCH` and not `PUT` for updates here?
- [ ] Where does validation happen, and why there, rather than in the service?
- [ ] What happens if a client sends `"createdBy": "someone-else"` on create? Show the test that proves it.
- [ ] Why is `limit` capped at 100?
- [ ] Which endpoints are idempotent? Prove it with two curl calls.
- [ ] Why 404 before 403 in the ownership check?
- [ ] What will need to change in Stage 4 when the Map becomes PostgreSQL, and what won't?
