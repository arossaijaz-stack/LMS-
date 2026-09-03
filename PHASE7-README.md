# Phase 7 — Payments & Commerce

## What's included

- **Checkout flow** — `POST /payments/checkout` creates a `PENDING` enrollment (or reuses an abandoned one), applies a coupon if provided, creates a `PENDING` payment, and returns a gateway checkout URL
- **Coupons** — percentage or fixed-amount discounts, usage caps, expiry dates, full admin CRUD
- **Webhook handling** — `POST /payments/webhook` (public — the gateway calls this), **idempotent** by design (a retried webhook for an already-processed payment is a safe no-op)
- **Manual/cash confirmation** — `PATCH /payments/:id/confirm` (Admin) for in-person cash payments, common for academies like KIPS alongside online payment
- **Refunds** — `PATCH /payments/:id/refund` revokes course access (enrollment → `EXPIRED`) and notifies the student
- **Invoices** — `GET /payments/:id/invoice` returns structured invoice data (not a PDF — see gaps)
- **This finally replaces Phase 3's stopgap** — `EnrollmentsService.updateStatus` (which already sends the "Enrollment activated" notification since Phase 6) is now called by real payment confirmation instead of being the only way to activate an enrollment

## Schema changes

- Added `Coupon` model
- Extended `Payment` with `courseId`, `enrollmentId`, `couponId` — it was previously a standalone record with no link to what was actually purchased, which was unusable for real commerce. Run a new migration.

## Design notes

- **`PaymentProviderService` is a placeholder**, same honest pattern as every external integration so far (Bunny/S3 in Phase 2, Zoom in Phase 5). `createCheckoutSession` returns a mock checkout URL shaped like a real one; wire the actual JazzCash/Easypaisa/Stripe API calls using the credentials already scaffolded in `.env.example` since Phase 0.
- **`verifyWebhookSignature` always returns `true` right now** — this is a real security gap, not just an incompleteness, and is flagged loudly here on purpose: **do not accept real webhook traffic until this is wired to real signature verification**, or anyone could POST a fake "payment succeeded" webhook and get free course access. JazzCash/Easypaisa use hash-based signatures over response fields; Stripe uses `stripe.webhooks.constructEvent`.
- **Coupon amount vs. percent is mutually exclusive by design** — `CouponsService.create` rejects a coupon with both fields set, or neither.
- **No cross-service database transaction wraps payment success** — updating the payment, incrementing coupon usage, and activating the enrollment happen as sequential awaited calls, not one atomic transaction. Acceptable at this scale (a partial failure mid-sequence is rare and recoverable by re-running `manualConfirm`), but worth knowing about — see gaps.

## How to run it

```bash
cd backend
pnpm install
pnpm prisma:migrate --name add_payments_and_coupons
pnpm start:dev
```

## Test it (example curl commands)

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@youracademy.com","password":"ChangeMe123!"}' | jq -r .accessToken)
STUDENT_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"ali@example.com","password":"password123"}' | jq -r .accessToken)

# Create a coupon
curl -X POST http://localhost:4000/api/coupons \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"code":"WELCOME20","discountPercent":20,"maxUses":100}'

# Student checks out with the coupon
curl -X POST http://localhost:4000/api/payments/checkout \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"courseId":"COURSE_ID","gateway":"jazzcash","couponCode":"WELCOME20"}'
# → note "paymentId" and the discounted "amount"; in a real flow the student would be
#   redirected to "checkoutUrl" to actually pay

# Simulate the gateway calling back (in reality this comes from JazzCash/Stripe, not you)
curl -X POST http://localhost:4000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"transactionRef":"<the providerRef from checkout, check DB or logs>","status":"SUCCESS"}'

# Confirm the student is now ACTIVE and got notified
curl http://localhost:4000/api/enrollments/mine -H "Authorization: Bearer $STUDENT_TOKEN"
curl http://localhost:4000/api/notifications/mine -H "Authorization: Bearer $STUDENT_TOKEN"

# Retry the SAME webhook — should be a safe no-op, not double-activate anything
curl -X POST http://localhost:4000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"transactionRef":"<same ref>","status":"SUCCESS"}'
# → expect {"alreadyProcessed": true}

# Admin manually confirms a cash payment for a different checkout
curl -X PATCH http://localhost:4000/api/payments/PAYMENT_ID/confirm -H "Authorization: Bearer $ADMIN_TOKEN"

# View an invoice
curl http://localhost:4000/api/payments/PAYMENT_ID/invoice -H "Authorization: Bearer $STUDENT_TOKEN"

# Admin issues a refund — access should be revoked
curl -X PATCH http://localhost:4000/api/payments/PAYMENT_ID/refund -H "Authorization: Bearer $ADMIN_TOKEN"
curl http://localhost:4000/api/enrollments/mine -H "Authorization: Bearer $STUDENT_TOKEN"
# → status should now be EXPIRED
```

## Automated tests — run for real, all passing

```
Test Suites: 14 passed, 14 total   (12 from Phases 1-6, 2 new this phase)
Tests:       122 passed, 122 total  (92 carried over + 30 new)
```

**New this phase (30 tests), all green on first run:**

| Suite | Covers |
|---|---|
| `coupons.service.spec.ts` — 14 tests | `applyCoupon` pure function: percentage math, fixed-amount math, the "never go below zero" cap, inactive/expired/usage-maxed rejection, boundary case (just under the cap still works), rounding correctness. Plus service-level: rejecting a coupon with neither or both discount types, duplicate code rejection, code uppercasing, case-insensitive lookup |
| `payments.service.spec.ts` — 16 tests | Checkout: free-trial rejection, already-active rejection, PENDING-enrollment reuse (no duplicate rows), coupon application producing the correct discounted amount, full-price checkout with no coupon. Webhook: signature rejection, successful activation + coupon increment, **idempotency on a retried webhook** (the highest-risk behavior in this phase — a payment gateway retrying a webhook must never double-activate or double-charge), failed payment handling, unknown transaction rejection. Manual confirm: rejects non-PENDING, activates correctly. Refund: rejects a never-successful payment, correctly revokes access + notifies. Invoice: ownership enforcement. |

Re-ran `npx tsc --noEmit` — zero non-Prisma-related compile errors across all 7 phases combined.

**Same limitation as every prior phase:** unit-level, mocked-Prisma — genuinely executed, not a live-DB run. This phase especially needs a real run before going anywhere near production, given the payment-security caveat above.

## What to verify before moving to Phase 8

- [ ] Checking out for a free-trial course is rejected with a clear message pointing to direct enrollment instead
- [ ] A coupon correctly reduces the charged amount, and its `usedCount` increments only once the webhook fires SUCCESS (not at checkout time)
- [ ] Retrying the same webhook payload twice does not double-activate the enrollment or double-increment the coupon
- [ ] A refund actually revokes access — `GET /courses/:id/learn` should show `locked: true` again after refund
- [ ] A student cannot view another student's invoice (403)
- [ ] `manualConfirm` on an already-SUCCESS payment is rejected, not silently re-processed

## Known gaps to close later — read this before going live

- **`verifyWebhookSignature` is a stub that always passes.** This is the single most important gap in the whole backend so far from a security standpoint. Do not point a real payment gateway at this webhook endpoint until real signature verification is implemented per-gateway.
- **`PaymentProviderService.createCheckoutSession` doesn't call any real gateway** — same placeholder pattern as prior phases' external integrations.
- **No cross-service atomic transaction** around payment success (payment update → coupon increment → enrollment activation are sequential, not wrapped in one DB transaction spanning services). Low risk at this scale; if it matters for your client's compliance requirements, this is the place to add a saga/outbox pattern later.
- **Invoices are JSON, not PDF.** If the client wants downloadable/printable PDF invoices, that's a good fit for the `pdf` skill on the frontend/document-generation side — the backend already returns everything needed to render one.
- **No partial refunds** — refund is all-or-nothing on the full payment amount.

## Next: Phase 8 — Admin Panel (Consolidation)

Most modules already have full admin CRUD by now — this phase ties everything into one cohesive dashboard: a central metrics view (enrollments, revenue, active students), consolidated user/content management screens, financial reports pulling from this phase's `Payment` data, and basic support/ticketing.
