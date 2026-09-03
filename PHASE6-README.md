# Phase 6 — Engagement Features

## What's included

- **Notes & bookmarks** — per-lesson notes and bookmarks, gated by the same course-access check used everywhere else, owner-only edit/delete
- **Progress tracking** — mark a lesson complete/incomplete, get a course's completion percentage, and a "my stats" dashboard (active enrollments, lessons completed, average quiz score, average assignment grade)
- **Leaderboard** — per-course ranking by average quiz score, with a careful edge case: students with zero quiz attempts rank below everyone who has attempted, never treated as a score of 0
- **Global search** — searches published course titles/descriptions and lesson **titles only** (never content), public/no-login-required, same as the course catalog
- **Notifications** — in-app notification system (`Notification` model), plus **real hooks wired into Phase 3 and Phase 4**: a student now gets notified when their enrollment activates, when a transfer request is approved/rejected, and when an assignment is graded

## Schema change

Added a `LessonProgress` model — this wasn't in any prior phase's schema, and its absence was actually a real gap: there was no way to track "has this student watched/read this lesson" at all (quiz/assignment completion existed via `QuizAttempt`/`AssignmentSubmission`, but plain video/reading lessons had nothing). Run a new migration for this.

```prisma
model LessonProgress {
  id          String    @id @default(uuid())
  userId      String
  lessonId    String
  completed   Boolean   @default(false)
  completedAt DateTime?
  updatedAt   DateTime  @updatedAt
  @@unique([userId, lessonId])
}
```

## Design notes

- **Leaderboard ranking is v1 and intentionally simple** (average quiz score only). Flag this to your client explicitly — a real academy will likely want a configurable formula (progress % + quiz average + attendance, weighted differently per program). That configurability naturally belongs in Phase 9's theming/config engine; this phase ships a working default in the meantime.
- **`NotificationsService.create()` is the single choke point for all in-app notifications.** It's currently just a DB insert — no actual email/SMS/WhatsApp delivery yet (that was always slated for this phase in the original roadmap, using a provider like Resend). Because every module already calls this one method rather than reaching for an email library directly, wiring real delivery later means changing **one file**, not every module that sends a notification.
- **Search never returns lesson content**, only titles — protects paid material from being indexed/exposed to anonymous search.

## How to run it

```bash
cd backend
pnpm install
pnpm prisma:migrate --name add_lesson_progress
pnpm start:dev
```

## Test it (example curl commands)

```bash
STUDENT_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"ali@example.com","password":"password123"}' | jq -r .accessToken)

# Take a note on a lesson (must be enrolled/have access)
curl -X POST http://localhost:4000/api/notes \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"lessonId":"LESSON_ID","type":"note","content":"Remember: F=ma"}'

# Bookmark a lesson
curl -X POST http://localhost:4000/api/notes \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"lessonId":"LESSON_ID","type":"bookmark"}'

# Mark a lesson complete
curl -X POST http://localhost:4000/api/progress/lessons/LESSON_ID/complete \
  -H "Authorization: Bearer $STUDENT_TOKEN"

# Check course progress
curl http://localhost:4000/api/progress/courses/COURSE_ID -H "Authorization: Bearer $STUDENT_TOKEN"

# My stats dashboard
curl http://localhost:4000/api/progress/stats/mine -H "Authorization: Bearer $STUDENT_TOKEN"

# Course leaderboard
curl http://localhost:4000/api/leaderboard/courses/COURSE_ID -H "Authorization: Bearer $STUDENT_TOKEN"

# Public search — no auth needed
curl "http://localhost:4000/api/search?q=physics"

# Check notifications (should already have one from a Phase 3/4 action, e.g. enrollment activation)
curl http://localhost:4000/api/notifications/mine -H "Authorization: Bearer $STUDENT_TOKEN"
curl -X PATCH http://localhost:4000/api/notifications/read-all -H "Authorization: Bearer $STUDENT_TOKEN"
```

## Automated tests — run for real, all passing

```
Test Suites: 12 passed, 12 total   (8 from Phases 1-5, 4 new this phase)
Tests:       92 passed, 92 total    (68 carried over + 24 new)
```

**New this phase (24 tests):**

| Suite | Covers |
|---|---|
| `notes.service.spec.ts` — 5 tests | Access-gated note creation, ownership enforcement on edit/delete, 404 on a nonexistent note |
| `progress.service.spec.ts` — 6 tests | Access-gated completion marking, zero-lessons edge case (no divide-by-zero), correct percentage math, stats aggregation with and without data, null-score filtering (an attempt with only open-ended questions correctly excluded from the average) |
| `leaderboard.service.spec.ts` — 5 tests | Non-enrolled student blocked, staff bypass the enrollment check, correct descending rank order, **the null-score edge case** (a student with zero attempts must never outrank — or be conflated with — a student who scored low but actually tried), multi-attempt averaging |
| `notifications.service.spec.ts` — 4 tests | Row creation, ownership check on mark-as-read (can't mark someone else's notification read), mark-all-read only touches unread rows |

**Also updated 2 existing test files** to account for the new notification hooks: `enrollments.service.spec.ts` gained 3 tests confirming a notification fires exactly once on PENDING→ACTIVE (and not again if already active, and not on other transitions), `assignments.service.spec.ts` gained 1 test confirming grading fires a notification. Re-ran the FULL suite after these changes — all 92 green, no regressions from the constructor signature changes needed to inject `NotificationsService`.

Re-ran `npx tsc --noEmit` — zero non-Prisma-related compile errors across all 6 phases combined.

**Same limitation as every prior phase:** unit-level, mocked-Prisma — genuinely executed, not a live-DB run.

## What to verify before moving to Phase 7

- [ ] A student cannot take notes on a lesson from a course they're not enrolled in
- [ ] Marking a lesson complete then checking course progress reflects the updated percentage
- [ ] A student with no quiz attempts appears at the BOTTOM of the leaderboard, not tied with 0-scorers
- [ ] Search returns matching published courses AND matching lesson titles, but never returns `videoUrl`/`readingBody`
- [ ] Enrolling a student and then activating them (Phase 3's `PATCH /enrollments/:id/status`) produces a real row in `GET /notifications/mine`
- [ ] Grading an assignment submission produces a notification for that student

## Known gaps to close later

- **No actual email/push/WhatsApp delivery** — notifications are in-app only for now. `NotificationsService.create()` is the one place to wire a real provider (Resend was the Phase 0 recommendation) when ready.
- **Leaderboard formula is quiz-score-only** — no progress % or attendance weighting yet. Revisit if the client wants a richer ranking (this pairs naturally with Phase 9's configuration engine).
- **No live-class attendance hook into notifications** — e.g. "you missed a live class" reminders aren't wired yet; straightforward to add by calling `NotificationsService.create()` from `LiveSessionsService` once the client confirms they want that specific reminder.
- **Search is a simple `contains` query**, not full-text/fuzzy search. Fine for a single-academy catalog size; if the course library grows very large, consider Postgres full-text search (`tsvector`) or a dedicated search service.

## Next: Phase 7 — Payments & Commerce

Cart/checkout flow, JazzCash/Easypaisa + Stripe integration, coupon codes, invoice generation, and refund handling — this is also where Phase 3's manual `PATCH /enrollments/:id/status` stopgap finally gets replaced by real payment-confirmation-driven activation.
