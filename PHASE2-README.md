# Phase 2 — Course & Curriculum Management

## What's included

- **Programs module** — categories like "Coaching Classes", "Test Prep" (`GET/POST/PATCH/DELETE /api/programs`)
- **Courses module** — full course CRUD with draft/publish workflow, teacher ownership enforced (`/api/courses`)
- **Curriculum module** — the Subject → Chapter → Lesson builder, fully nested, with drag-and-drop reorder endpoints (`/api/courses/:id/curriculum`, `/api/subjects/...`, `/api/chapters/...`, `/api/lessons/...`)
- **Media module** — signed upload URL endpoints for video (Bunny.net Stream) and files (S3-compatible), so uploads go straight from the browser to storage rather than through our API

## Access model (builds on Phase 1's RBAC)

| Action | Who |
|---|---|
| Browse published courses/programs | Public (no login) |
| Create/edit a course | ADMIN (any course) or TEACHER (only their own) |
| Publish a course | ADMIN or TEACHER (owner) — blocked if the course has zero subjects |
| Build curriculum (subjects/chapters/lessons) | ADMIN or TEACHER (owner only — enforced by walking lesson → chapter → subject → course → teacherId) |
| Delete a program or course | ADMIN only |

## How to run it

```bash
cd backend
pnpm install   # picks up no new deps — Phase 2 only adds first-party modules
pnpm start:dev
```

(Assumes your `.env` and database are already set up from Phase 1. No new migration needed — the `Program`, `Course`, `Subject`, `Chapter`, `Lesson` tables were already defined in the Phase 0 schema.)

## Test it (example curl commands)

```bash
# Login as the seeded admin (from Phase 1) to get an accessToken
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@youracademy.com","password":"ChangeMe123!"}' | jq -r .accessToken)

# Create a Program
curl -X POST http://localhost:4000/api/programs \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Coaching Classes","slug":"coaching-classes"}'
# → note the returned "id" as PROGRAM_ID

# Create a Course under that program
curl -X POST http://localhost:4000/api/courses \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"programId":"PROGRAM_ID","title":"9th Class Physics","pricingType":"MONTHLY","price":"2500"}'
# → note the returned "id" as COURSE_ID

# Add a Subject
curl -X POST http://localhost:4000/api/courses/COURSE_ID/subjects \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Mechanics"}'
# → note "id" as SUBJECT_ID

# Add a Chapter under that Subject
curl -X POST http://localhost:4000/api/subjects/SUBJECT_ID/chapters \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Newton'"'"'s Laws"}'
# → note "id" as CHAPTER_ID

# Add a Lesson (video type) under that Chapter
curl -X POST http://localhost:4000/api/chapters/CHAPTER_ID/lessons \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Introduction to Force","type":"VIDEO","videoUrl":"https://placeholder.mp4"}'

# View the full curriculum tree
curl http://localhost:4000/api/courses/COURSE_ID/curriculum \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Try to publish — should succeed now (has ≥1 subject)
curl -X PATCH http://localhost:4000/api/courses/COURSE_ID/publish \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Confirm it's now visible on the PUBLIC catalog (no auth header needed)
curl http://localhost:4000/api/courses
```

## What to verify before moving to Phase 3

- [ ] Admin can create a Program, then a Course under it
- [ ] Publishing a course with zero subjects fails with a clear error
- [ ] After adding a subject, publishing succeeds
- [ ] Published course appears on `GET /api/courses` with no auth header
- [ ] Unpublished course does NOT appear on the public endpoint
- [ ] A Teacher account can create/edit their own course, but gets 403 trying to edit another teacher's course
- [ ] Reorder endpoint correctly updates lesson/chapter/subject order in one transaction

## Known gaps to close later (intentional, flagged for future phases)

- **Media module is a placeholder** — `createVideoUploadUrl` and `createFileUploadUrl` return mock responses. Before real uploads work, wire in the actual Bunny.net Stream API call and AWS S3 (or Backblaze B2) presigned URL generation using the credentials already scaffolded in `.env.example` back in Phase 0.
- **Lesson content is not yet access-gated** — right now, `GET /api/courses/:id` (public) returns the full curriculum tree including `videoUrl`/`readingBody` for anyone. Phase 3 (Enrollment) will add the gating logic so only enrolled students see actual lesson content, while the public course page still shows the curriculum outline for marketing purposes.
- **No course thumbnail upload flow wired to a UI yet** — the `thumbnailUrl` field exists on `Course`, but attaching it to the media module's file upload isn't built until the frontend admin panel (Phase 8) is built.

## Next: Phase 3 — Enrollment & Access Control

We'll build the `Enrollment` model logic — students purchasing/enrolling in a course, content gating so only enrolled students see lesson content, the free-trial preview logic, and the program-transfer approval workflow (campus manager approves a student moving between courses).
