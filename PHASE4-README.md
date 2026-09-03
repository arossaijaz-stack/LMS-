# Phase 4 — Quiz & Assessment Engine

## What's included

- **Quizzes module** — question bank (single-choice, multi-choice, open-ended), quiz builder with optional time limit + randomization, auto-grading for objective questions, attempt history
- **Assignments module** — file-based submission, resubmission-before-grading support, manual grading with numeric grade + feedback
- **Lesson attachment** — `PATCH /lessons/:id` (Phase 2's curriculum module) now also accepts `quizId`/`assignmentId` to link a quiz or assignment to a specific lesson
- **Shared access gating** — both quizzes and assignments reuse `EnrollmentsService.hasActiveAccess` (Phase 3) when they're attached to a lesson, so a student can't take a quiz or submit an assignment for a course they haven't paid for. Standalone/unattached quizzes (question-bank items not yet wired to a course) are open — treated as practice content.

## Design notes (read before building the frontend on top of this)

- **Quizzes/Assignments are shared resources, not per-teacher-owned** — unlike Courses, any Admin or Teacher can edit any quiz/assignment. This mirrors how question banks usually work in practice (reused across sections/batches). If your client wants strict per-teacher ownership here too, mirror the ownership-check pattern already used in `CoursesService`.
- **Auto-grading only covers objective questions.** `SINGLE_CHOICE` needs an exact match; `MULTI_CHOICE` needs an exact set match (no partial credit — flag this to your client, some academies expect partial credit for multi-select, which would need extra logic). `OPEN_ENDED` questions are never auto-scored — they're excluded from the score calculation entirely and need manual review via `GET /quizzes/:id/attempts` (staff can see the raw answer text in `QuizAttempt.answers`, but there's currently no dedicated "grade this open-ended answer" endpoint — see Known Gaps).
- **The answer key never reaches the student's browser** — `GET /quizzes/:id/take` strips `isCorrect` and `correctAnswer` from every question before returning it.

## How to run it

```bash
cd backend
pnpm install
pnpm start:dev
```

No new migration needed — `Quiz`, `Question`, `QuizAttempt`, `Assignment`, `AssignmentSubmission` were already in the Phase 0 schema.

## Test it (example curl commands)

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@youracademy.com","password":"ChangeMe123!"}' | jq -r .accessToken)

# Create a quiz with two questions
curl -X POST http://localhost:4000/api/quizzes \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "title": "Physics Quiz 1",
    "timeLimitMin": 10,
    "questions": [
      {"text":"Capital of France?","type":"SINGLE_CHOICE","options":[{"id":"a","text":"Paris","isCorrect":true},{"id":"b","text":"Rome","isCorrect":false}]},
      {"text":"Explain Newtons first law","type":"OPEN_ENDED"}
    ]
  }'
# → note "id" as QUIZ_ID

# Attach it to a Phase 2 lesson (optional — leave unattached for an open practice quiz)
curl -X PATCH http://localhost:4000/api/lessons/LESSON_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"quizId":"QUIZ_ID"}'

# Student takes the quiz — answer key should NOT appear in this response
STUDENT_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"ali@example.com","password":"password123"}' | jq -r .accessToken)
curl http://localhost:4000/api/quizzes/QUIZ_ID/take -H "Authorization: Bearer $STUDENT_TOKEN"

# Student submits an attempt
curl -X POST http://localhost:4000/api/quizzes/QUIZ_ID/attempts \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"answers":{"<question1Id>":"a","<question2Id>":"Newtons first law is about inertia..."}}'
# → expect a score based only on the single-choice question (open-ended excluded)

# Create + submit + grade an assignment
curl -X POST http://localhost:4000/api/assignments -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"title":"Essay 1","dueDate":"2026-09-01"}'
curl -X POST http://localhost:4000/api/assignments/ASSIGNMENT_ID/submissions -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" -d '{"fileUrl":"https://files.example.com/essay1.pdf"}'
curl -X PATCH http://localhost:4000/api/assignments/submissions/SUBMISSION_ID/grade -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"grade":85,"feedback":"Solid work"}'
```

## Automated tests — run for real, all passing

Continuing the practice started in Phase 3: wrote and ran a real Jest unit suite for this phase's business logic.

```
Test Suites: 6 passed, 6 total   (4 from Phase 1-3, 2 new this phase)
Tests:       53 passed, 53 total  (38 carried over + 15 new)
```

**New this phase (15 tests):**

| Suite | Covers |
|---|---|
| `quizzes.service.spec.ts` — 10 tests | `gradeQuizAttempt` pure function: single-choice correct/incorrect, multi-choice exact-set matching (including the "no partial credit" edge case and order-independence), open-ended questions always excluded from scoring, missing answers treated as incorrect not a crash, multi-question percentage calculation. Plus service-level: blocked when not enrolled, allowed when unattached (standalone practice quiz), and confirmed `isCorrect` never leaks to the student payload. |
| `assignments.service.spec.ts` — 5 tests | First submission creates a row; resubmission updates the existing row AND resets any prior grade/feedback to null; course-gated submission blocked for a non-enrolled student; Teacher/Admin bypass the gating check entirely (confirmed the lesson lookup isn't even called for staff); grading sets grade+feedback correctly. |

Also re-ran `npx tsc --noEmit` after adding this phase's code — found and fixed one real type issue (a test mock's return type didn't match its declared signature). After the fix: zero non-Prisma-related compile errors across the whole codebase, all 6 phases combined.

**Same limitation as before still applies:** this is unit-level, mocked-Prisma testing — genuinely executed and passing, but not a live-database run. Run the curl checklist above on your machine to confirm the full HTTP + DB path end-to-end.

## What to verify before moving to Phase 5

- [ ] A single-choice question grades correctly (right answer = 100, wrong = 0)
- [ ] A multi-choice question requires the exact correct set — partial selection scores as wrong
- [ ] An open-ended question never affects the numeric score
- [ ] The student-facing `/take` endpoint never includes `isCorrect` or `correctAnswer` anywhere in the response
- [ ] A non-enrolled student is blocked from both taking a course-attached quiz AND submitting a course-attached assignment
- [ ] Resubmitting an assignment overwrites the file and clears any previous grade
- [ ] `randomize: true` actually shuffles question order between two separate `/take` calls

## Known gaps to close later

- **No dedicated "grade this open-ended question" endpoint.** Staff can see raw answers via `GET /quizzes/:id/attempts`, but there's no structured way yet to attach a manual per-question score to an open-ended answer and have it factor into an updated overall score. Worth adding in Phase 8 (Admin Panel) if the client's quizzes will include essay-style questions regularly.
- **No partial credit for multi-choice.** Flag this to the client explicitly — some academies expect partial credit (e.g. 2 of 3 correct = 67%), which the current exact-match logic doesn't support.
- **No attempt limit / cooldown.** A student can currently call `/attempts` repeatedly with no restriction. Add a max-attempts-per-quiz rule if needed — straightforward to bolt on with a `prisma.quizAttempt.count()` check before creating a new attempt.
- **Time limit (`timeLimitMin`) is stored but not enforced server-side** — currently just informational for the frontend timer UI. A late submission past the time limit is still accepted. Add server-side enforcement (compare `submittedAt` against `startedAt + timeLimitMin`) if strict timing matters to your client.

## Next: Phase 5 — Live Classes Module

Batch model (grouping students for a course), live session scheduling (Zoom API integration), attendance tracking, and auto-importing recordings into the video library after a session ends — building on the `Batch`, `BatchStudent`, `LiveSession` models already in the schema.
