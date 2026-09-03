# Phase 9 — Theming & Configuration Engine

**This is the client's headline requirement** — the ability to change the frontend's look without touching code. Everything in this phase exists to make that real.

## What's included

- **Brand settings** (`GET/PATCH /brand-settings`) — academy name, logo, primary/secondary colors, font family, hero title/subtitle/image. Backed by the `BrandSettings` model that's existed since Phase 0's schema draft, finally wired up.
- **Theme preview** (`POST /brand-settings/preview`) — computes what settings would look like after proposed changes, WITHOUT saving, so an admin UI can show a live preview before committing
- **CMS-lite content blocks** (`/content-blocks`) — admin-editable sections for the marketing site (features, testimonials, FAQs, etc.) with per-section ordering and a soft-hide (`isActive`) toggle instead of forcing deletion
- **A real frontend reference file** — `frontend/theme/applyBrandSettings.ts`, showing exactly how the eventual Next.js app fetches `BrandSettings` and injects it as CSS variables at runtime, deriving hover-state shades from the two colors an admin picks (so they never have to pick 4 colors, just 2)

## Schema changes

- Added `ContentBlock` model (tenant-scoped, flexible `metadata` JSON field so new section types don't need schema changes later)
- `Tenant.contentBlocks` back-relation added

## Design notes — read these, they explain real tradeoffs

- **Single-academy "default tenant" pattern.** `BrandSettingsService` transparently works against one implicit tenant (subdomain `"default"`), auto-created the first time an admin saves settings. This means the frontend never needs to know a tenant ID today — but the whole schema is still shaped for multi-tenancy (from Phase 0's future-proofing), so if your client ever wants to resell this platform to other academies, the data model doesn't need to change, only the tenant-resolution logic in this one service.
- **Theme "preview" is v1-simple, not a draft/published state machine.** `preview()` merges proposed changes onto current saved settings and returns the result — no database write. This is enough for "show me what this would look like before I commit," which is what the roadmap asked for. It is NOT a full versioned-drafts system (no "save as draft, come back later, publish when ready" across sessions) — flagged as a gap below if your client wants that.
- **Colors are validated as real hex values** (`@IsHexColor`) — a typo like `"blue"` instead of `"#0000FF"` fails loudly at the API layer instead of silently breaking every page's styling.
- **Hover-state colors are derived, not stored.** An admin picks ONE primary color and ONE secondary color; `applyBrandSettings.ts` computes the `-hover` shade at runtime. This keeps the admin UI simple (2 color pickers, not 4) at the cost of the hover shade always being an algorithmic darken rather than a hand-picked color — fine for almost all cases, flagged in case the client wants pixel-perfect control over hover states too.

## How to run it

```bash
cd backend
pnpm install
pnpm prisma:migrate --name add_content_blocks
pnpm start:dev
```

## Test it (example curl commands)

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@youracademy.com","password":"ChangeMe123!"}' | jq -r .accessToken)

# Fresh install — should return sensible defaults, no auth needed
curl http://localhost:4000/api/brand-settings

# Preview a color change without saving
curl -X POST http://localhost:4000/api/brand-settings/preview \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"primaryColor":"#8B5CF6"}'

# Confirm the preview did NOT persist
curl http://localhost:4000/api/brand-settings
# → primaryColor should still be the default, not #8B5CF6

# Now actually save it
curl -X PATCH http://localhost:4000/api/brand-settings \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"academyName":"KIPS Test Academy","primaryColor":"#8B5CF6","logoUrl":"https://cdn.example.com/logo.png"}'

# Confirm it's now live on the public endpoint
curl http://localhost:4000/api/brand-settings

# Reject an invalid color format
curl -X PATCH http://localhost:4000/api/brand-settings \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"primaryColor":"blue"}'
# → expect a 400 validation error

# Add an FAQ content block
curl -X POST http://localhost:4000/api/content-blocks \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"section":"faq","title":"How do I enroll?","body":"Click any course and hit Enroll."}'

# Public: fetch all FAQ blocks for the marketing site
curl "http://localhost:4000/api/content-blocks?section=faq"

# Soft-hide it instead of deleting
curl -X PATCH http://localhost:4000/api/content-blocks/BLOCK_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"isActive":false}'
curl "http://localhost:4000/api/content-blocks?section=faq"
# → should no longer include it
```

## Automated tests — run for real, all passing

```
Test Suites: 18 passed, 18 total   (16 from Phases 1-8, 2 new this phase)
Tests:       151 passed, 151 total  (141 carried over + 10 new)
```

**New this phase (10 tests), all green on first run:**

| Suite | Covers |
|---|---|
| `brand-settings.service.spec.ts` — 5 tests | Fresh-install defaults returned WITHOUT a database write (a GET must never have side effects), saved settings correctly returned once they exist, default tenant created exactly once (never duplicated on repeat saves), and — the most important test in this phase — **`preview()` merges changes correctly and provably never calls `upsert` or `tenant.create`**, proving the "no side effects" guarantee that makes preview-before-publish trustworthy |
| `content-blocks.service.spec.ts` — 5 tests | Public endpoint only ever queries `isActive: true` blocks, new blocks get the next order number scoped to their OWN section (not a global counter — a new FAQ shouldn't jump to position 47 just because there are 47 testimonials), 404 on updating a nonexistent block, soft-deactivation via `isActive` rather than deletion, reorder batches through a single transaction |

Re-ran `npx tsc --noEmit` — zero non-Prisma-related compile errors across all 9 phases combined.

**Same limitation as every prior phase:** unit-level, mocked-Prisma — genuinely executed, not a live-DB run.

## What to verify before moving to Phase 10

- [ ] A fresh database (no `BrandSettings` row) returns coherent defaults on `GET /brand-settings`, not an error
- [ ] `POST /brand-settings/preview` never changes what `GET /brand-settings` returns afterward
- [ ] An invalid hex color (`"blue"`, `"#zzz"`, missing `#`) is rejected with a 400, not silently accepted
- [ ] Saving brand settings twice never creates a second `Tenant` row
- [ ] A deactivated content block disappears from the public section endpoint but still exists (findable via the admin endpoint)
- [ ] Reordering content blocks within one section doesn't affect another section's ordering

## Known gaps to close later

- **No versioned draft/publish history** — `preview()` is stateless (compute-and-return, no save). If the client wants "save multiple draft themes, compare them, publish one later," that's a real feature addition: a `BrandSettingsDraft` table with its own CRUD, distinct from the live `BrandSettings` row.
- **No image upload wired here specifically** — `logoUrl`/`heroImageUrl` are plain string fields; actual image upload goes through Phase 2's `MediaService` (still a placeholder for real S3/Bunny calls, as flagged since Phase 2) and the resulting URL gets passed into `PATCH /brand-settings`.
- **No accessibility/contrast validation** — an admin could pick a primary color with poor contrast against white text and nothing would stop them. Consider adding a WCAG contrast-ratio check as a warning (not a hard block) in the preview response if this matters to your client.
- **Content block `metadata` is untyped JSON** — flexible by design, but means the API can't validate section-specific fields (e.g. a testimonial's `authorName` inside `metadata`). Fine for a small number of section types managed by trusted admins; if this grows, consider per-section DTOs.

## Next: Phase 10 — Testing, Optimization & Deployment

The final phase: end-to-end testing of the critical flows (signup → enroll → pay → learn → quiz), performance optimization, a security review (this is where `PaymentsService`'s webhook signature stub from Phase 7 finally needs to get fixed for real), mobile responsiveness (frontend-side), CI/CD pipeline setup, and backup/monitoring configuration — turning nine phases of built features into something actually ready to put in front of real students and their money.
