# Phase 8 — Admin Panel (Consolidation)

## What's included

Most CRUD already existed by Phase 7 (courses, curriculum, users, payments, etc.) — this phase adds the two genuinely missing pieces and ties reporting together:

- **Central dashboard** — `GET /admin/overview`: total students/teachers, active/pending enrollments, total revenue, pending payments, open support tickets — one call for the admin homepage
- **Financial reports** — `GET /admin/reports/revenue`: gross revenue, total refunded, net revenue, and a per-course revenue breakdown sorted highest-to-lowest
- **Teacher performance reports** — `GET /admin/reports/teachers`: per-teacher course count, active student count, average quiz score and average assignment grade across all their courses (or a single teacher via `?teacherId=`)
- **Content engagement analytics** — `GET /admin/reports/courses/:courseId/engagement`: most-watched lessons and drop-off lessons, based on `LessonProgress` completion rates against active enrollment count
- **Support/ticketing** — a full ticket system: any user can open a ticket, staff (`ADMIN` or `SUPPORT` role) can view/reply/reassign/change status, with threaded messages and an auto-transition (`OPEN` → `IN_PROGRESS`) the first time staff replies

## Schema change

Added `SupportTicket` and `TicketMessage` models — there was no support/ticketing data model at all before this phase, and the `SUPPORT` role (already in `UserRole` since Phase 0!) had nothing to actually do. Run a new migration.

## Design notes

- **All dashboard/report endpoints are Admin-only.** If your client wants Campus Managers to see a scoped version (e.g. their own campus's numbers), that's a filtering addition worth doing once real campus-scoping requirements are clearer — flagged as a gap below.
- **Content engagement completion rate is relative to *active* enrollments**, not total historical enrollments — a student who transferred out or expired shouldn't count against a lesson's "drop-off" number.
- **The auto status-transition on ticket reply is deliberately narrow**: only `OPEN` → `IN_PROGRESS`, and only triggered by a *staff* reply. A student replying never changes status (that's expected — them adding info doesn't mean staff picked it up), and a staff reply to an already `RESOLVED`/`CLOSED` ticket never silently reopens it — closing/resolving must stay an explicit staff action.

## How to run it

```bash
cd backend
pnpm install
pnpm prisma:migrate --name add_support_tickets
pnpm start:dev
```

## Test it (example curl commands)

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@youracademy.com","password":"ChangeMe123!"}' | jq -r .accessToken)
STUDENT_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"ali@example.com","password":"password123"}' | jq -r .accessToken)

# Dashboard overview
curl http://localhost:4000/api/admin/overview -H "Authorization: Bearer $ADMIN_TOKEN"

# Revenue report
curl http://localhost:4000/api/admin/reports/revenue -H "Authorization: Bearer $ADMIN_TOKEN"

# Teacher performance (all teachers, or add ?teacherId=... for one)
curl http://localhost:4000/api/admin/reports/teachers -H "Authorization: Bearer $ADMIN_TOKEN"

# Content engagement for a course
curl http://localhost:4000/api/admin/reports/courses/COURSE_ID/engagement -H "Authorization: Bearer $ADMIN_TOKEN"

# Student opens a support ticket
curl -X POST http://localhost:4000/api/tickets \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"subject":"Cant access my course","message":"Paid yesterday, still shows locked"}'
# → note "id" as TICKET_ID

# Admin views all open tickets
curl "http://localhost:4000/api/tickets?status=OPEN" -H "Authorization: Bearer $ADMIN_TOKEN"

# Admin replies — status should auto-flip to IN_PROGRESS
curl -X POST http://localhost:4000/api/tickets/TICKET_ID/messages \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"body":"Checking your payment now, one moment"}'

# View the full thread
curl http://localhost:4000/api/tickets/TICKET_ID -H "Authorization: Bearer $STUDENT_TOKEN"

# Admin resolves it
curl -X PATCH http://localhost:4000/api/tickets/TICKET_ID/status \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"RESOLVED"}'
```

## Automated tests — run for real, all passing (including 2 real bugs caught)

```
Test Suites: 16 passed, 16 total   (14 from Phases 1-7, 2 new this phase)
Tests:       141 passed, 141 total  (122 carried over + 19 new)
```

**New this phase (19 tests) — and this time the process caught two genuine bugs before you'd ever see them:**

1. **`TicketStatus` enum was missing from the test mock** (`__mocks__/@prisma/client.ts`). The moment `AdminDashboardService` and `SupportService` tried to reference `TicketStatus.OPEN`, every test relying on it crashed with `Cannot read properties of undefined`. Fixed by adding the enum to the mock — a 2-minute fix specifically *because* the test suite exists; without it, this would have surfaced as a confusing runtime crash much later.
2. **A real TypeScript type error** in `getContentEngagement`: a `Map` built from Prisma's `groupBy` results was inferred with a loose `string | number` value type, which then broke arithmetic (`completedCount / activeEnrollmentCount`). `tsc --noEmit` caught this — Jest's `isolatedModules` mode would NOT have caught it (it skips type-checking), which is exactly why this project runs both Jest and a separate `tsc --noEmit` pass every phase.

| Suite | Covers |
|---|---|
| `admin-dashboard.service.spec.ts` — 8 tests | `getOverview` null-sum handling (a brand-new academy with zero revenue shouldn't crash), Decimal-to-number conversion, `getRevenueReport` net-revenue math and correct sort/label mapping, `getTeacherPerformance` null-averages for a teacher with no courses (not zero, not a crash) and correct cross-course averaging with null-score filtering, `getContentEngagement` zero-enrollment safety and correct most-watched/drop-off identification |
| `support.service.spec.ts` — 11 tests | Ticket+first-message created together, ownership enforcement on both `getOne` and `reply` (a student can't view or reply to someone else's ticket), SUPPORT-role staff can view any ticket, **the three-way auto-status-transition logic**: staff reply on OPEN → IN_PROGRESS, student reply on OPEN → no change, staff reply on RESOLVED → no change (never silently reopens) |

Re-ran `npx tsc --noEmit` after the fix — zero non-Prisma-related compile errors across all 8 phases combined.

**Same limitation as every prior phase:** unit-level, mocked-Prisma — genuinely executed, not a live-DB run.

## What to verify before moving to Phase 9

- [ ] `/admin/overview` returns sensible zeros for a freshly-seeded database, not a crash
- [ ] Revenue report's `netRevenue` correctly subtracts refunds from gross
- [ ] A teacher with zero courses shows `null` averages, not `0` or an error
- [ ] Content engagement's most-watched and drop-off lists make sense against real `LessonProgress` data
- [ ] A student can open and view their own ticket, but gets 403 on someone else's
- [ ] Staff replying to an OPEN ticket flips it to IN_PROGRESS automatically; replying to a RESOLVED ticket does NOT reopen it

## Known gaps to close later

- **All admin/report endpoints are Admin-only** — no Campus-Manager-scoped view (e.g., "my campus's numbers only"). Add filtering by `campusId` here once the client confirms multi-campus reporting requirements.
- **No ticket categories/priority levels** — every ticket is flat, no "billing" vs "technical" vs "urgent" tagging. Easy to add (`category`/`priority` columns) if the client's support volume grows enough to need triage.
- **No email notification on ticket reply** — unlike assignment grading/enrollment activation (Phase 6), replying to a ticket doesn't fire a `NotificationsService.create()` call yet. Straightforward one-line addition once you decide whether both the ticket owner AND assigned staff should be notified on each new message.
- **Reports are point-in-time, not historical/trendable** — e.g. no "revenue this month vs last month" comparison yet. Fine for a v1 admin dashboard; add date-range filtering to `getRevenueReport` if the client wants trend charts.

## Next: Phase 9 — Theming & Configuration Engine

This is the client's core requirement from day one: an admin-editable branding system (logo, colors, fonts, hero text/images) using the `BrandSettings` model and design-token CSS variables already scaffolded back in Phase 0, plus a lightweight CMS for the landing page sections — the piece that finally lets your client change the frontend's look without touching code.
