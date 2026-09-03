# Phase 5 — Live Classes Module

## What's included

- **Batches** — group students into cohorts per course (e.g. "Morning Batch", "Evening Batch"), with roster management gated by active enrollment (reuses `EnrollmentsService.hasActiveAccess` from Phase 3 — you can't add a student to a batch unless they're actually enrolled in that course)
- **Live session scheduling** — Admin/Teacher schedules a session against a batch; a meeting is created via `LiveClassProviderService` (Zoom placeholder — see gaps below) and the join link is stored
- **Attendance tracking** — per-student present/absent, stored as a JSON map on the session
- **Student calendar + join flow** — `GET /sessions/mine` aggregates every session across all of a student's batches; `GET /sessions/:id/join` returns the join link only if they're actually a batch member
- **Recording attachment** — staff can attach a recording URL to a session after it ends (manual for now — see gaps)

## Access model

| Action | Who |
|---|---|
| Create/edit/delete a batch, schedule a session | ADMIN or the course's owning TEACHER |
| Add/remove a student from a batch's roster | ADMIN, owning TEACHER, or **CAMPUS_MANAGER** (roster management is treated as an enrollment-administration task, same reasoning as their transfer-request approval power from Phase 3) |
| Mark attendance, attach a recording | ADMIN or owning TEACHER |
| View a batch's sessions / get a join link | Staff (as above) OR a student who is an actual member of that batch |
| View "my sessions" calendar | Any authenticated student |

## How to run it

```bash
cd backend
pnpm install
pnpm start:dev
```

No new migration — `Batch`, `BatchStudent`, `LiveSession` were already in the Phase 0 schema.

## Test it (example curl commands)

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@youracademy.com","password":"ChangeMe123!"}' | jq -r .accessToken)

# Create a batch for a published course
curl -X POST http://localhost:4000/api/courses/COURSE_ID/batches \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Morning Batch","startDate":"2026-09-01"}'
# → note "id" as BATCH_ID

# Add an enrolled student to the batch (must already have an ACTIVE enrollment from Phase 3)
curl -X POST http://localhost:4000/api/batches/BATCH_ID/students \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"userId":"STUDENT_USER_ID"}'

# Try adding a NON-enrolled student — should fail with 403
curl -X POST http://localhost:4000/api/batches/BATCH_ID/students \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"userId":"SOME_OTHER_USER_ID"}'

# Schedule a live session
curl -X POST http://localhost:4000/api/batches/BATCH_ID/sessions \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Week 1 Lecture","scheduledAt":"2026-09-03T10:00:00Z"}'
# → note "id" as SESSION_ID; zoomJoinUrl will be a placeholder link

# Student checks their calendar
STUDENT_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"ali@example.com","password":"password123"}' | jq -r .accessToken)
curl http://localhost:4000/api/sessions/mine -H "Authorization: Bearer $STUDENT_TOKEN"

# Student gets the join link (only works if they're actually a batch member)
curl http://localhost:4000/api/sessions/SESSION_ID/join -H "Authorization: Bearer $STUDENT_TOKEN"

# Admin marks the student present
curl -X PATCH http://localhost:4000/api/sessions/SESSION_ID/attendance/STUDENT_USER_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"present":true}'

# Admin attaches a recording after the session ends
curl -X PATCH http://localhost:4000/api/sessions/SESSION_ID/recording \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"recordingUrl":"https://cdn.example.com/recordings/week1.mp4"}'
```

## Automated tests — run for real, all passing

```
Test Suites: 8 passed, 8 total   (6 from Phases 1-4, 2 new this phase)
Tests:       68 passed, 68 total  (53 carried over + 15 new)
```

**New this phase (15 tests), all green on first run — no bugs needed fixing this time:**

| Suite | Covers |
|---|---|
| `batches.service.spec.ts` — 7 tests | Ownership enforcement (owning Teacher can create, non-owner blocked), Campus Manager roster access despite not being the course teacher, enrollment-gated `addStudent` (rejects non-enrolled students, rejects duplicates, succeeds for properly enrolled students), `removeStudent` 404 when not actually a member |
| `live-sessions.service.spec.ts` — 8 tests | `schedule` calls the provider and persists the returned join URL, ownership delegated correctly to `BatchesService`, `getJoinUrl` allows batch members / blocks non-members / 404s when no link is set yet, `markAttendance` correctly **merges** into the existing attendance map rather than overwriting other students' records (this was the highest-risk line in the phase — worth a dedicated test), attendance rejected for a non-batch-member, `setRecording` attaches correctly |

Re-ran `npx tsc --noEmit` after this phase too — zero non-Prisma-related compile errors across all 5 phases combined.

**Same limitation as every prior phase:** unit-level, mocked-Prisma — genuinely executed, not a live-DB run. Run the curl checklist above on your machine to confirm the full path end-to-end.

## What to verify before moving to Phase 6

- [ ] A student who isn't enrolled cannot be added to a batch (403)
- [ ] Adding the same student to a batch twice fails with a clear conflict error
- [ ] A Campus Manager (not the course's teacher) can still add/remove students from a batch
- [ ] A student NOT in a batch gets 403 trying to fetch that session's join link
- [ ] Marking one student's attendance doesn't erase another student's previously recorded attendance for the same session
- [ ] `/sessions/mine` correctly aggregates sessions across ALL of a student's batches, not just one

## Known gaps to close later

- **`LiveClassProviderService` is a placeholder**, same honest flag as Phase 2's Media module — `createMeeting()` returns a mock join URL shaped like a real Zoom link but doesn't actually call Zoom's API yet. Wire in the real `POST /v2/users/{userId}/meetings` call using the `ZOOM_API_KEY`/`ZOOM_API_SECRET`/`ZOOM_ACCOUNT_ID` credentials already scaffolded in `.env.example` back in Phase 0.
- **No automatic recording import.** `fetchRecordingUrl()` is a stub that always returns `null`. Real Zoom recordings arrive via a webhook (`recording.completed` event) some time after the session ends — building that webhook receiver + auto-calling `setRecording()` is the natural next step once real Zoom credentials exist. Until then, staff attach recordings manually via the endpoint that's already built.
- **No join-time window enforcement.** `getJoinUrl` returns the link any time, even far before or after the scheduled time. If your client wants "join button only enabled 10 minutes before class," add that check here — straightforward, the `scheduledAt` timestamp is already returned alongside the URL.
- **Attendance is a JSON blob, not a proper join table.** Fine at current scale; if Phase 8's admin panel needs cross-session attendance analytics/reporting at scale (e.g. "average attendance rate per batch over a semester"), consider migrating to a dedicated `Attendance` table with proper indexes at that point.

## Next: Phase 6 — Engagement Features

Notes & bookmarks (the `NoteBookmark` model already exists in the schema), per-course progress tracking, a leaderboard, global search across videos/readings/courses, and the notification system (`Notification` model) — the features that make the student dashboard feel alive day-to-day, per KIPS Virtual's own advertised feature list from the very first analysis.
