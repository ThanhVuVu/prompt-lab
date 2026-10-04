# Stage 5: Authentication & Authorization (days 11–13)

**Goal:** replace the fake `x-user-id` header with real accounts: hashed passwords, JWTs, role and ownership checks, and an audit trail of who did what.

**Key files:** `src/services/authService.ts`, `src/middleware/auth.ts`, `src/schemas/authSchemas.ts`, `src/services/auditService.ts`, `src/controllers/promptController.ts`, `prisma/migrations/*_auth_and_audit_log/`
**Tests:** `npm run test:stage5`

---

## Why this matters

Authentication is the front gate. Most real breaches, though, happen one step later, at **authorization**: a logged-in user reading or changing data that isn't theirs, an endpoint that forgot its role check, or a 403 that confirms a secret exists. Audit logs are how you prove, after the fact, who did what. SOC 2 and GDPR audits ask for them, and you'll want them yourself the first time someone asks "who changed this prompt?".

## Concepts

### Authentication ≠ authorization

| | Question | Failure | Where |
|---|---|---|---|
| Authentication | *Who are you?* | **401** | `requireAuth` → `AuthService.verifyToken` |
| Authorization | *May you do this?* | **403** (or 404) | `requireRole`, and ownership checks in the controller |

### Passwords: hash, never store

```ts
const passwordHash = await bcrypt.hash(password, 12);  // "$2b$12$<salt><hash>"
await bcrypt.compare(attempt, passwordHash);            // true / false
```

- **Hash, not encrypt.** It's one-way: even we can't recover the password.
- **Salted.** The same password gives a different hash every time, so precomputed tables are useless.
- **Slow by design.** The cost factor (`BCRYPT_ROUNDS`) doubles the work per +1, which makes brute-forcing a stolen database expensive.

### JWT: a signed claim, not a secret

A JWT is `header.payload.signature`, each part base64url-encoded. **Anyone can read the payload** (paste a token into jwt.io), but only the holder of `JWT_SECRET` can produce a valid signature. Our payload is just `{ sub: userId, ver: tokenVersion, exp }`.

```
POST /api/auth/login  → { token }
GET  /api/prompts      Authorization: Bearer <token>
```

**Logging out a stateless token:** the server can't delete a JWT. Each user has a `tokenVersion` that goes inside the token. Logout increments it, so `verifyToken` rejects every older token. Because we look the user up on each request, role changes and deleted accounts also take effect immediately. The cost is one indexed query per request.

**Sessions vs JWTs:** with a session cookie, the server stores the state and logout is trivial. With a JWT, no lookup is needed (in theory) and it works well across services, but revocation is hard. We use a hybrid: JWT for transport, plus a DB check for revocation.

### Ownership and visibility rules

| Action | Who | Otherwise |
|---|---|---|
| read | owner, anyone if `isPublic`, admin | **404**: a 403 would reveal that the private prompt exists |
| create | role `user` or `admin` | 403 (viewers are read-only) |
| update | owner | 403 |
| delete | owner or admin | 403 |

The list endpoint filters **in SQL** (`WHERE is_public OR created_by = $me`). Fetching everything and filtering in JavaScript leaks data the moment someone forgets the filter, and it doesn't scale.

### Defensive details you'll find in the code

- The **role is never taken from the signup body**. Otherwise anyone could sign up as admin.
- Emails are lowercased: `Alice@x.com` and `alice@x.com` are the same account.
- A **duplicate email** is caught through the UNIQUE constraint (409), not by "check, then insert", which has a race window.
- **Login failures** return the same message and take the same time whether the email exists or not, so attackers can't enumerate accounts.
- `jwt.verify(..., { algorithms: ['HS256'] })` pins the algorithm, which blocks the classic `alg: none` attack.
- `toPublicUser()` **whitelists** fields, so `passwordHash` can never leak through a `...spread`.
- Audit rows are written **inside the same transaction** as the change they describe.

### The migration that touched existing data

Adding a `NOT NULL password_hash` column to a table that already has rows fails. `prisma/migrations/*_auth_and_audit_log/migration.sql` was hand-edited to add the column with a temporary default (`'!'`, which can never match a bcrypt hash, so old accounts can't log in), then drop the default. In production you'll often split this into separate deploys: add nullable → backfill → add NOT NULL.

## Try it

```bash
npm run db:migrate && npm run db:seed     # alice (admin) / bob (user), password: password123
npm run dev
# then open http/stage5.http, or:
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.local","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

Paste `$TOKEN` into https://jwt.io and look at the payload. What would happen if you changed `sub` there and sent the token back?

## Common mistakes

- **Storing passwords with SHA-256 or MD5.** Those are fast hashes, the opposite of what you want for passwords.
- **Putting secrets or PII in the JWT payload.** It's only encoded, not encrypted.
- **A JWT secret like `"secret"`.** It can be brute-forced offline from a single token. Use 32+ random bytes, different per environment.
- **Checking `role` from the token alone.** If you don't re-read it, a demoted admin stays admin until the token expires.
- **Returning 403 for private resources**, which leaks their existence.
- **Forgetting authorization on one new endpoint.** That's why `router.use(requireAuth(...))` sits at the top of the prompts router, not on each route.
- **Tokens in localStorage** (on the frontend). They're readable by any XSS. Prefer httpOnly cookies when you build the UI.

## Debugging tips

- 401 everywhere? Check that the header is exactly `Authorization: Bearer <token>`, with no quotes and no `<>`.
- 401 right after a server restart? Check whether `JWT_SECRET` changed (for example, a different `.env`).
- `JsonWebTokenError: invalid signature`: the token was signed with another secret.
- Use `GET /api/audit-logs?userId=...` (as admin) to see what happened and in what order.

## Extensions

- **Rate-limit `/api/auth/login`** (for example, 5 attempts per minute per IP and email) to stop brute force.
- Short-lived access tokens (15m) plus a **refresh token** stored in an httpOnly cookie.
- `POST /api/auth/change-password`, which should also bump `tokenVersion`.
- Share prompts with specific users (a `prompt_shares` table) instead of just public/private.

## Checkpoint

- [ ] Explain 401 vs 403 vs "404 for privacy", with an example of each from this API.
- [ ] Why bcrypt and not SHA-256? What does the salt protect against? The cost factor?
- [ ] What's inside our JWT? Who can read it? Who can forge it?
- [ ] How does logout work when JWTs are stateless? What does it cost?
- [ ] Why is the audit row written in the same transaction as the change?
- [ ] Why does a duplicate signup rely on the UNIQUE constraint instead of checking first?
