# Phase 3 — Enrollment & Access Control

## What's included

- **Enrollments module** — students enroll in a course; free-trial courses activate instantly, paid courses start `PENDING` (Phase 7/Payments will flip them to `ACTIVE`; until then, Admin/Campus Manager can manually activate — useful for cash payments collected in person)
- **Content access gating** — `GET /api/courses/:id/learn` is the real "watch this course" endpoint. It returns full curriculum with actual `videoUrl`/`readingBody` ONLY if the requester is enrolled+active, the course is free-trial, or they're the owning Teacher/an Admin. Otherwise lessons come back with `locked: true` and no content.
- **Public course page fixed** — `GET /api/courses/:id` (no login) now only ever returns the curriculum *outline* (titles/structure), never lesson content — closes the gap flagged at the end of Phase 2.
- **Transfer request workflow** — a student can request to move to a different course; Campus Manager/Admin approves or rejects. Approval runs as a DB transaction: old enrollment → `TRANSFERRED`, new enrollment → `ACTIVE`, atomically.
- **Schema change**: added a `TransferRequest` model (wasn't in the original Phase 0 draft — flagging that schema evolves as real requirements surface, which is normal). Run a new migration for this.

## How to run it

```bash
cd backend
pnpm install

# New model was added — generate a fresh migration
pnpm prisma:migrate --name add_transfer_requests

pnpm start:dev
```

## Test it (example curl commands)

```bash
# Login as a student (register one first via /auth/register if needed)
STUDENT_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@example.com","password":"password123"}' | jq -r .accessToken)

ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@youracademy.com","password":"ChangeMe123!"}' | jq -r .accessToken)

# Student enrolls in a (paid) published course from Phase 2 — starts PENDING
curl -X POST http://localhost:4000/api/enrollments \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"courseId":"COURSE_ID"}'

# Student tries to access lesson content — should come back locked (still PENDING)
curl http://localhost:4000/api/courses/COURSE_ID/learn \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → expect "hasAccess": false and every lesson "locked": true, videoUrl: null

# Admin manually activates the enrollment (simulating a payment / cash receipt)
curl -X PATCH http://localhost:4000/api/enrollments/ENROLLMENT_ID/status \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}'

# Student retries — should now see real content
curl http://localhost:4000/api/courses/COURSE_ID/learn \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → expect "hasAccess": true, videoUrl populated

# Confirm the PUBLIC course page never showed content, even before activation
curl http://localhost:4000/api/courses/COURSE_ID
# → lessons should only ever have {id, title, type, order} — no videoUrl/readingBody

# Student requests a transfer to a different course
curl -X POST http://localhost:4000/api/enrollments/transfer-requests \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"requestedCourseId":"OTHER_COURSE_ID","reason":"Switching to a different batch timing"}'

# Admin reviews it
curl -X PATCH http://localhost:4000/api/enrollments/transfer-requests/REQUEST_ID/review \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"APPROVED"}'

# Confirm: old enrollment now TRANSFERRED, new one ACTIVE
curl http://localhost:4000/api/enrollments/mine \
  -H "Authorization: Bearer $STUDENT_TOKEN"
```

## What to verify before moving to Phase 4

- [ ] Enrolling in a free-trial course activates instantly (`status: ACTIVE`)
- [ ] Enrolling in a paid course starts `PENDING`
- [ ] `/courses/:id/learn` returns locked content for a PENDING/no enrollment
- [ ] `/courses/:id/learn` returns real content once status is `ACTIVE`
- [ ] Public `/courses/:id` NEVER leaks `videoUrl`/`readingBody`, regardless of enrollment state
- [ ] A second enroll attempt on the same course returns a 409 Conflict, not a duplicate row
- [ ] Transfer request → approval correctly leaves exactly one `ACTIVE` enrollment and one `TRANSFERRED` enrollment for that student
- [ ] A Teacher can preview their own course's `/learn` content without enrolling; a different Teacher cannot

## Testing notes — UPDATED: real automated tests now written and passing

**Update:** After the initial static-only review, I found a way to run genuine automated tests in this sandbox despite the Prisma engine download being blocked (see below for why that's still blocked). I wrote a real Jest unit test suite covering the highest-risk logic from Phases 1–3, and ran it for real.

### Why not a live database test?
I tried hard to get a real Postgres + Prisma e2e run working here first:
- `npm install` — works
- `prisma generate` — fails: needs to download its query engine binary from `binaries.prisma.sh`, which this sandbox's network policy blocks
- Checked if `prisma-engines` publishes the compiled binary as a GitHub release asset instead (GitHub domains ARE reachable here) — confirmed via GitHub's release page: **no**, only source code archives are attached to releases; compiled engines are only ever distributed via Prisma's own CDN
- Conclusion: a live DB run is not possible in this specific sandboxed environment, full stop — this is an infrastructure limitation, not something I can code around

### What I did instead
Wrote a proper Jest unit test suite (`*.spec.ts` files) with a hand-built mock of `@prisma/client` (`__mocks__/@prisma/client.ts` — real enum values copied from `schema.prisma`, dummy `PrismaClient` class) so business logic can be tested without a live DB or engine. **This is standard professional practice regardless** — unit tests should mock the database layer; only a smaller number of end-to-end tests should hit a real DB.

**38 tests, across 4 suites, all passing:**

| Suite | Tests | Covers |
|---|---|---|
| `auth.service.spec.ts` | 9 | register (success + duplicate email), login (success + wrong password + unknown email), forgot-password (no user-enumeration, dev-only token), reset-password (valid + invalid + single-use token) |
| `roles.guard.spec.ts` | 4 | RBAC: no-decorator passthrough, matching role allowed, non-matching role → 403, missing user → 403 |
| `enrollments.service.spec.ts` | 17 | enroll (free-trial instant activation, paid → PENDING, duplicate rejected, unpublished course rejected), `hasActiveAccess` (all 8 access-decision branches: admin, owning teacher, non-owning teacher, free-trial, active, pending, expired, no-enrollment), content gating (locked vs unlocked lesson output), transfer request review (approve creates+transfers correctly, reject touches nothing, double-review blocked) |
| `courses.service.spec.ts` | 8 | publish blocked with 0 subjects / allowed with ≥1, Teacher ownership enforcement (own course editable, others' blocked, Admin bypasses, teacherId reassignment blocked), course creation (teacherId forced to caller, always starts unpublished) |

**One real bug was caught and fixed during this process** (in the test itself, not the service — worth noting as evidence these tests actually exercise the code rather than rubber-stamping it): my mock config initially set `NODE_ENV: 'test'`, but `AuthService.forgotPassword` only returns its dev-mode debug token when `NODE_ENV === 'development'` specifically. The test failed correctly, which is exactly what a real test suite is supposed to do — I fixed the test's mock value, re-ran, all green.

### What's still NOT covered
- `curriculum.service.ts`, `programs.service.ts`, `users.service.ts`, `media.service.ts` — 0% test coverage. These are lower-risk (simpler CRUD, less branching logic) than the gating/ownership/RBAC logic prioritized above, but they haven't been verified at all yet, not even statically re-checked this session.
- No HTTP-level (controller) or full end-to-end tests — these confirm route wiring, guards actually being applied via decorators, and request/response shape, none of which unit tests catch.
- No test for the `PrismaService` connection lifecycle itself (untestable without a real DB anyway).

### Bottom line
Business logic — the part most likely to contain actual bugs (access control, ownership, status transitions) — has been verified by real, passing, executed tests. Route wiring and the full request pipeline still need a real run on your machine per the curl checklist above. Test files are included in the zip (`*.spec.ts`, `jest.config.js`, `__mocks__/`) — run `pnpm test` yourself anytime to re-verify, or extend the suite for the uncovered modules.

## Known gaps to close later

- Manual `PATCH /enrollments/:id/status` is a stopgap until Phase 7 (Payments) wires real payment-confirmation → auto-activation
- No enrollment expiry job yet (a cron/scheduled task to flip `ACTIVE` → `EXPIRED` when `expiresAt` passes) — add when building Phase 8's admin panel or a background jobs module
- Transfer requests don't currently refund/prorate anything — pure access-swap only; revisit once Payments exists

## Next: Phase 4 — Quiz & Assessment Engine

Question bank, quiz builder with time limits/randomization, auto-grading for objective questions, assignment submission + manual grading, and attempt history — building on the `Quiz`, `Question`, `QuizAttempt`, `Assignment`, `AssignmentSubmission` models already in the schema.
