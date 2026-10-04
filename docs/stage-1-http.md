# Stage 1: HTTP & Web Fundamentals (days 1–2)

**Goal:** understand exactly what travels over the wire between a client and a server, and build your first endpoints.

**You'll work in:** `stage1/hello-server.ts` (one file, on purpose)
**Done when:** `npm run test:stage1` is green, and you can answer the checkpoint questions without notes.

---

## Why this matters

Every backend bug you will ever debug starts with "what request came in, and what response went out?" CORS errors, a missing `Authorization` header, a `200` that should have been a `400`, a client that forgot `Content-Type: application/json`: you'll see these weekly at work. If HTTP is solid, debugging them takes minutes instead of hours. Microservices are also just programs sending each other HTTP requests, so this foundation carries through everything that follows.

## Concepts

### 1. An HTTP request is just text

```
POST /echo?debug=true HTTP/1.1          ← method, path, query string, version
Host: localhost:3000                    ← headers (key: value)
Content-Type: application/json          ←   "the body is JSON"
Content-Length: 19
                                        ← blank line
{"message":"hello"}                     ← body
```

| Part | In Express | Example |
|---|---|---|
| Method | `req.method` | `POST` |
| Path | `req.path` | `/echo` |
| Query string | `req.query` | `{ debug: 'true' }` (always strings!) |
| Route params | `req.params` | `/prompts/:id` → `{ id: '42' }` |
| Headers | `req.headers`, `req.header('x')` | `content-type` (lowercased) |
| Body | `req.body` | `{ message: 'hello' }` (only after `express.json()`) |

### 2. And so is the response

```
HTTP/1.1 200 OK                         ← status line
Content-Type: application/json; charset=utf-8
Content-Length: 58

{"received":"hello","timestamp":"2026-10-04T09:30:00.000Z"}
```

### 3. Methods describe intent

| Method | Meaning | Body? | Safe (no change)? | Idempotent (repeat = same result)? |
|---|---|---|---|---|
| GET | read | no | ✅ | ✅ |
| POST | create / process | yes | ❌ | ❌ (2 calls = 2 records) |
| PUT | replace entirely | yes | ❌ | ✅ |
| PATCH | change some fields | yes | ❌ | usually |
| DELETE | remove | no | ❌ | ✅ |

### 4. Status codes are a contract

| Code | Meaning | Use when |
|---|---|---|
| 200 OK | success, here's the data | GET, PATCH, most POSTs that don't create |
| 201 Created | a new resource was created | POST that creates |
| 204 No Content | success, nothing to return | DELETE |
| 400 Bad Request | **the client** sent something invalid | validation failed, bad JSON |
| 401 Unauthorized | we don't know who you are | missing or invalid token (Stage 5) |
| 403 Forbidden | we know who you are, and the answer is no | not the owner |
| 404 Not Found | it doesn't exist | unknown id or route |
| 500 Internal Server Error | **we** have a bug | unexpected exception |

Rule of thumb: **4xx = the client should change something; 5xx = we should fix something.**

---

## Exercises

### 1.0 Talk HTTP to a real API with curl (30 min)

```bash
# -i shows the status line and response headers
curl -i https://jsonplaceholder.typicode.com/posts/1

# -v shows the REQUEST too (lines starting with >)
curl -v https://jsonplaceholder.typicode.com/posts/1

# POST JSON: -X sets the method, -H adds a header, -d is the body
curl -i -X POST https://jsonplaceholder.typicode.com/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"hi","body":"there","userId":1}'

# A resource that doesn't exist: what status?
curl -i https://jsonplaceholder.typicode.com/posts/999999
```

For each request, write down: the method, the status code, the `Content-Type` of the response, and one other header you hadn't seen before (then look up what it does).

### 1.1 See the request object

Start the server with `npm run stage1`. In `stage1/hello-server.ts`, uncomment the `console.log` lines in the first middleware and send:

```bash
curl -i http://localhost:3000/health
curl -i "http://localhost:3000/health?foo=bar&n=1"
curl -i -X POST http://localhost:3000/health -H "Content-Type: application/json" -d '{"a":1}'
```

Read the terminal output. Where did `foo` end up? What type is `n`? Why does the POST to `/health` return 404?

### 1.2 Implement `POST /echo`

Follow the TODOs in `stage1/hello-server.ts`. Then:

```bash
npm run test:stage1
curl -i -X POST http://localhost:3000/echo -H "Content-Type: application/json" -d '{"message":"hello"}'
curl -i -X POST http://localhost:3000/echo -H "Content-Type: application/json" -d '{}'
```

Experiment: send the JSON **without** the `Content-Type` header. What does `req.body` contain now, and why?

### 1.3 Design your own: `GET /time`

There's no test for this one. Decide the behaviour yourself (the file has a suggestion), implement it, and add the curl or REST Client requests that prove it works to `http/stage1.http`.

---

## Common mistakes

- **Sending two responses.** `res.status(400).json(...)` without a `return` keeps running, and the next `res.json` throws *"Cannot set headers after they are sent"*.
- **Forgetting `express.json()`.** `req.body` will be `undefined`.
- **Forgetting the `Content-Type: application/json` header in curl.** Same symptom: the server doesn't know the body is JSON.
- **Returning 200 with `{ error: ... }`.** Clients, monitoring and retries all key off the status code. An error must have an error status.
- **Using 401 for "not allowed".** 401 means "who are you?"; 403 means "I know who you are, and no".
- **Middleware that never calls `next()`.** The request hangs until the client times out.

## Debugging tips

- `curl -v` shows exactly what was sent and received. When in doubt, look at the raw HTTP.
- *"EADDRINUSE: address already in use :::3000"*: another server is still running. Stop it (Ctrl+C), or run `PORT=3001 npm run stage1`.
- If a test fails, read the **expected vs received** diff Jest prints. It usually tells you exactly what's wrong.
- `console.log(req.body)` at the top of your handler is a perfectly good first debugging step.

## Extensions (if you finish early)

- Add `GET /echo/:word` that returns the route parameter. What's the difference between params and query?
- Return a custom response header (`X-Powered-By-Student: yes`) and see it with `curl -i`.
- Send a 2 MB body to `/echo`. What happens? (Hint: look up the `limit` option of `express.json`.)
- Read MDN's [Overview of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview).

## Checkpoint (be ready to explain these out loud)

- [ ] What are the parts of an HTTP request? Where does each show up in Express?
- [ ] Write from memory a curl command that POSTs JSON, and interpret the response.
- [ ] Why `POST` to create, `GET` to fetch, `PATCH` to update?
- [ ] 400 vs 401 vs 403 vs 404 vs 500: give a Prompt Lab example of each.
- [ ] What does "idempotent" mean, and why would a payment API care?
- [ ] What does `next()` do in middleware?
