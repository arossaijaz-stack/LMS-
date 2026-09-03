# Phase 1 — Authentication & User Management

## What's included

- **Signup/Login** with email + password (`POST /api/auth/register`, `POST /api/auth/login`)
- **JWT auth** — short-lived access token (15 min default) + long-lived refresh token (7 days default), separate secrets for each
- **Password reset flow** (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`) — token store is in-memory for now, swap for a DB table before production (see comment in `auth.service.ts`)
- **RBAC** — `@Roles()` decorator + `RolesGuard`, works alongside a **global** `JwtAuthGuard` (every route requires auth by default; opt out with `@Public()`)
- **Profile management** — `GET /api/users/me`, `PATCH /api/users/me`
- **Admin user management foundation** — `GET /api/users` (list/search/filter), `GET /api/users/:id`, `PATCH /api/users/:id` (admin-only, role/campus changes)
- **Multi-campus support** baked into the `User` model (`campusId`) per the Phase 0 schema

## How to run it

```bash
cd backend
pnpm install

# 1. Start Postgres locally (or point DATABASE_URL at a hosted instance)
docker run --name lms-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lms_dev -p 5432:5432 -d postgres:16

# 2. Copy env file and fill in secrets
cp .env.example .env
# at minimum, set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to random strings

# 3. Run the migration (creates all tables from schema.prisma)
pnpm prisma:migrate --name init

# 4. Seed the first Admin account
pnpm prisma:seed

# 5. Start the API
pnpm start:dev
```

API will be live at `http://localhost:4000/api`.

## Test it (example curl commands)

```bash
# Register a student
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Ali Khan","email":"ali@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@example.com","password":"password123"}'
# → returns { accessToken, refreshToken, user }

# Get my profile (use the accessToken from above)
curl http://localhost:4000/api/users/me \
  -H "Authorization: Bearer <accessToken>"

# Try an admin-only route as a student (should fail with 403)
curl http://localhost:4000/api/users \
  -H "Authorization: Bearer <student_accessToken>"

# Login as the seeded admin, then the same route should succeed
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@youracademy.com","password":"ChangeMe123!"}'
```

## What to verify before moving to Phase 2

- [ ] Student can register and log in
- [ ] Admin (seeded) can log in
- [ ] `/users/me` returns correct profile for whoever is logged in
- [ ] A STUDENT token gets a 403 on `/users` (admin-only route) — confirms RolesGuard works
- [ ] An ADMIN token succeeds on `/users` — confirms role check passes correctly
- [ ] Refresh token flow returns a new access token
- [ ] Forgot-password → reset-password flow works end-to-end (check `devOnlyToken` in the response while `NODE_ENV=development`)

## Known gaps to close later (flagged intentionally, not forgotten)

- Password reset tokens are in-memory — move to a DB table (or Redis) before production, and wire real email sending in Phase 6 (Notifications)
- No rate-limiting yet on login/register — add `@nestjs/throttler` before production to prevent brute-force attempts
- No account lockout after repeated failed logins — consider for production hardening
- `isActive`/suspension flag not yet on the `User` model — add when building the Phase 8 "suspend student" admin feature
- Email verification on signup not included — add if your client wants verified emails before granting access

## Next: Phase 2 — Course & Curriculum Management

Once everything above is verified working, we'll build on this same `AppModule` and add a `ProgramsModule` / `CoursesModule` that uses the `Program`, `Course`, `Subject`, `Chapter`, `Lesson` models already defined in the Phase 0 schema.
