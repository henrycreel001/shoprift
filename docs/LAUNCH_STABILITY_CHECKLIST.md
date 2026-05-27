# LAUNCH_STABILITY_CHECKLIST.md — Shoprift Launch & Stability

> Distilled from "App Launch & Stability Checklist" (collected from 100+ developer reels/posts).
> Filtered for Shoprift's actual context: embedded Shopify app, no traditional auth (Shopify OAuth handles identity), one-time Shopify Billing, solo founder, B2B sellers.
> Items that don't apply to this architecture (email verification, password reset, iOS App Store, load balancers, CDN caching) are excluded.
> Source document: available in founder's notes.

---

## SKIP LIST — why certain standard items don't apply

| Standard item | Why skipped |
|--------------|-------------|
| Signup / login flow | Shopify OAuth is the auth layer. Shoprift never handles credentials. |
| Email verification | Shopify handles seller identity. No email verification step in Shoprift. |
| Password reset | Same — Shopify's concern, not ours. |
| Subscription upgrades/downgrades | AppPurchaseOneTime — one-time charge, no subscriptions. |
| iOS/Android App Store checklist | Not a mobile app. Shopify App Store listing applies (see Section 7). |
| Load balancers / horizontal scaling | Premature at solo-founder launch volume. |
| Thundering herd / hot key caching | Same — address when job volume requires it. |
| Cookie consent banner | Embedded app in Shopify Admin iframe. No third-party tracking cookies at launch. Revisit when analytics added. |
| Mobile responsive | Shopify Admin is used on desktop. Embedded app doesn't need separate mobile optimization. |

---

## 1 — Quick Launch Readiness

- [ ] **Analytics set up** — nothing tracked currently. Posthog or Mixpanel free tier. Minimum: page views + `migration_started`, `payment_initiated`, `migration_complete` events.
- [ ] **Payment flow tested on production** — T7 confirmed on dev/ngrok. Must repeat on Vercel/Railway prod URL with real Shopify store before opening to users.
- [ ] **Shopify OAuth works on production** — test full reinstall flow on prod URL (not just ngrok).
- [ ] **Backend authorization enforced** — API routes validate `shop` param but do not verify the requesting shop *owns* the job. A shop could poll another shop's `jobId`. Needs a `WHERE account_id = shop` guard on every job fetch.
- [ ] **Rate limiting on API routes** — no per-shop limits exist. At minimum: one active job per shop enforced at DB insert (intent exists in CLAUDE.md — verify it's actually in the insert logic). `/api/payment/billing/create` and `/api/verify/start` need per-shop rate guards.
- [ ] **Error monitoring (Sentry)** — no observability. Add before real users. Free tier is sufficient. Wire to both Next.js and Railway worker.
- [ ] **Privacy Policy + Terms of Service linked in app UI** — documents exist in `docs/legal/` but are not linked anywhere in the seller-facing UI.
- [ ] **Refund Policy linked at checkout** — Consumer Protection (E-Commerce) Rules 2020 requires it to be visible *before* payment. Currently not linked from the billing step.
- [ ] **Support contact visible in app** — sellers need somewhere to go when a job fails. Email address or a "Contact support" link on the error state.

---

## 2 — Product Analytics & Event Tracking

Implement before real users. You need to know where people drop off.

**Minimum event set for Shoprift:**

| Event | When |
|-------|------|
| `recon_started` | Seller submits store URL |
| `recon_complete` | Recon returns product count |
| `verification_started` | Verification step shown |
| `verification_complete` | Ownership confirmed |
| `trial_import_started` | Trial import begins |
| `trial_import_complete` | Trial 5 products appear in Shopify |
| `payment_initiated` | Billing create called |
| `payment_complete` | Billing callback — charge active |
| `migration_complete` | Worker finishes, results shown |
| `migration_failed` | Worker returns error |

**Rules:**
- [ ] Consistent naming: `noun_verb` pattern (above)
- [ ] Include `shop`, `product_count`, `plan` on payment events
- [ ] No PII in event properties (no store owner names, no email addresses)
- [ ] Build a simple funnel dashboard: recon → verify → payment → complete. Drop-off at each step is your product signal.

---

## 3 — Payments (edge cases)

Happy path (T7) is confirmed. These are the gaps:

- [ ] **Billing callback fires twice** — Shopify can retry redirects. If `charge_id` is already `active` and job is already `pending`, the callback should be idempotent (check current status before re-triggering worker). Currently it will double-trigger the import.
- [ ] **Charge declined / cancelled** — seller clicks "Decline" on payment page. Shopify redirects back with `charge_id` but status = `declined`. Callback handles `charge.status !== 'active'` → sets job to `failed` and redirects with `billing_error=charge_not_active`. Confirm this is visible to the seller as a clear message (not just a generic error).
- [ ] **Refund mechanism in code** — refund policy is written, but there is no admin tooling to issue a refund. You do it manually via Shopify Partner dashboard. Fine for V1 — note it in CONTEXT.md so you don't forget when volume grows.
- [ ] **No double-charge protection** — if seller hits "Start Import" twice before redirect, two billing charges could be created. Add a loading/disabled state after first click (already done via `setBillingLoading(true)` — verify it actually disables the button in the UI).

---

## 4 — Backend Authorization

This is the gap that matters most before real users.

- [ ] **Job ownership check** — `/api/import/status/[jobId]` fetches job by ID only. Any shop can poll any job ID if they know it. Fix: add `.eq('account_id', shop)` to every job select that takes a `jobId` param.
- [ ] **Verify routes check shop** — `/api/verify/check` should confirm `attemptId` belongs to the `shop` in the request. Currently trusts the client to pass the right pair.
- [ ] **Test unauthenticated API calls** — hit every `/api/*` route directly (curl, no Shopify session). Confirm they fail safely with 401/400, not 500 or leaked data.

---

## 5 — Security & Secrets

- [ ] **No secrets in git** — `.env.local` is gitignored. Verify `.env.example` has no real values (it doesn't currently — confirm before each commit).
- [ ] **NEXT_PUBLIC_ vars are client-exposed** — `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally public (Supabase anon key is designed to be). Confirm no service role key is accidentally prefixed `NEXT_PUBLIC_`.
- [ ] **Error responses don't leak internals** — some API routes return raw `error.message` from Supabase or Shopify API. Replace with generic messages for user-facing errors; log full detail to server console / Sentry only.
- [ ] **Check browser console on prod** — before launch, open DevTools on the live app and confirm no stack traces, no API keys, no debug logs visible.
- [ ] **SQL injection not a risk** — Supabase JS client uses parameterized queries. Not a manual SQL injection risk. Confirm no raw SQL strings are being built anywhere.

---

## 6 — Reliability & Observability

- [ ] **Sentry on Next.js** — `@sentry/nextjs` package, 10 minutes to wire. Catches unhandled errors in API routes and client components. Free tier: 5k errors/month.
- [ ] **Sentry on Railway worker** — `@sentry/node` in `worker.js`. Same free tier.
- [ ] **Alert on payment failures** — Sentry can alert on `billing_error` events. Set up one alert: any job that reaches `status = failed` after a charge should notify you immediately.
- [ ] **Logs include job ID** — every `console.error` in API routes should include `jobId` when available so you can trace a seller's problem through Railway logs.

---

## 7 — Shopify App Store Listing

When ready to list publicly on the Shopify App Store (not required for direct installs, but required for organic discovery):

- [ ] App name includes keywords ("migration", "import", "dm2buy")
- [ ] Short description hooks in first 2 lines — lead with the outcome (products in Shopify, not the process)
- [ ] Long description: structured, keyword-rich, answers "why switch from dm2buy"
- [ ] Screenshots show the outcome (products in Shopify) not the tool UI
- [ ] App preview video (optional but increases conversion significantly)
- [ ] Privacy policy URL pointing to hosted version
- [ ] Support URL or email
- [ ] Category: "Store management" or "Migration"
- [ ] Age rating completed

---

## 8 — Landing Page & Discoverability

Shoprift needs a public landing page outside the Shopify admin (for search traffic, social sharing, app listing links):

- [ ] Landing page live at root domain
- [ ] HTTPS (handled by host)
- [ ] Open Graph tags: `og:title`, `og:description`, `og:image`, `og:url`
- [ ] Favicon
- [ ] `sitemap.xml`
- [ ] `robots.txt`
- [ ] Google Search Console connected + sitemap submitted
- [ ] Meta title + description set
- [ ] Support / contact link visible
- [ ] Privacy Policy + ToS linked in footer

**Marketing assets (prepare before launch):**
- [ ] High-quality screenshots of the migration wizard
- [ ] Short demo video showing URL → Shopify products (30–60 seconds)
- [ ] Launch post drafted (@shoprift IG + @mayankmalikx + Reddit r/shopify / r/Entrepreneur)

---

## 9 — Legal (status)

| Document | Status | Gap |
|----------|--------|-----|
| Terms of Service | ✅ Drafted | Needs lawyer review + UI link |
| Privacy Policy | ✅ Drafted | Needs lawyer review + UI link |
| Migration Consent | ✅ Drafted | Needs lawyer review |
| Grievance Officer | ✅ Drafted | Needs UI link |
| Refund Policy | ✅ Drafted | **Needs UI link at checkout** — Consumer Protection Rules 2020 |
| Acceptable Use Policy | ❌ Not drafted | **Action:** Run `/shoprift-legal` to draft. Required for IT Act §79 safe-harbour. |
| Cookie Policy | ⏸ Deferred | Wire when analytics added |
| DMCA / Takedown | ❌ Not drafted | **Action:** Run `/shoprift-legal` to draft. Required for IT Act §79 safe-harbour before App Store submission. |
| Lawyer review pass | ❌ Not done | Budget ₹20–30k. Required before money changes hands with real users. |
| Domain + professional email | ❌ Not done | 17 occurrences of personal email in legal docs (tracked in PRE_LAUNCH_CHECKLIST.md) |

---

## Priority order for Shoprift

```
# App Store listing blockers (must fix before submission)
1. GDPR compliance webhooks (S10 CRITICAL)         ← mandatory for every App Store app
2. JWT session token auth on all API routes (S10 CRITICAL) ← App Store listing requirement since 2024
3. App Bridge installed + session token frontend (S10 CRITICAL) ← required for embedded app
4. Billing callback → GraphQL (S10 CRITICAL)       ← violates rule 2.2.4, rejection risk
5. iframe CSP dynamic per shop (S10 CRITICAL)      ← clickjacking risk + rejection trigger

# Security gaps before real users
6. Backend authorization (job ownership checks)    ← any shop can poll any job ID
7. Rate limiting (one job per shop enforced)       ← prevent abuse
8. Sentry error monitoring                         ← required for payment-taking app

# Legal / compliance
9. Legal docs linked in UI + refund policy at checkout
10. AUP + DMCA drafted and linked

# Pre-submission
11. Confirm distribution = "public" on production app (irreversible)
12. Production payment flow test (Vercel + real Shopify store)
13. Analytics event tracking

# Listing / discoverability
14. Shopify App Store listing assets (screenshots, copy, demo video)
15. Landing page + marketing assets
```

---

## 10 — Shopify Platform Requirements

*Compiled 2026-05-27 from live Shopify developer docs: privacy-law-compliance, session-tokens, set-up-session-tokens, app-requirements-checklist, billing, iframe-protection, app-store requirements (1.1.x), and supplementary native assistant output.*

### CRITICAL — blocks App Store listing

- [ ] **GDPR compliance webhooks** — `customers/data_request`, `customers/redact`, `shop/redact` not subscribed anywhere. Mandatory for every app distributed through the App Store. Add to `shopify.app.toml`:
  ```toml
  [[webhooks.subscriptions]]
  compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
  uri = "https://shoprift.vercel.app/api/webhooks/compliance"
  ```
  Create handler at `/api/webhooks/compliance`. Verify HMAC; return 401 on invalid header. Respond 200 immediately; complete data action within 30 days. Shoprift processes no customer order data, so `customers/data_request` and `customers/redact` handlers can respond 200 + no-op with a comment. `shop/redact` must delete all Supabase rows for that `shop_id` (sessions, jobs, verification_attempts).

- [ ] **Session token (JWT) authentication on all API routes** — every `/api/*` route trusts `shop` from request body/query string with no cryptographic check. App Bridge sends a session token (HS256 JWT, 1-minute TTL) as `Authorization: Bearer <token>`. Backend must decode and verify: `exp` in future, `nbf` in past, `iss`/`dest` top-level domains match, `aud` == `SHOPIFY_API_KEY`, HS256 signature using `SHOPIFY_API_SECRET`. Use `shopify.session.decodeSessionToken(token)` from `@shopify/shopify-api` v13. Extract `dest` as the verified shop domain — never trust `shop` from the request body again.

- [ ] **App Bridge not installed** — `@shopify/app-bridge` absent from `web/package.json`. Required for session token flow and any admin-embedded feature. Install: `npm install @shopify/app-bridge`. Add `<meta name="shopify-api-key" content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY}>` to app root layout. Frontend must call `getSessionToken(app)` before every API call and pass token as `Authorization: Bearer`. This has been required for App Store listing since March 13, 2024. **Note on versions:** Current approach (npm package + meta tag) uses App Bridge v3. Shopify's newer Web Components App Bridge uses `<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js">` in `<head>` and is required for Built for Shopify status. For initial App Store listing, v3 is acceptable. Plan migration to Web Components App Bridge post-launch when targeting BFS.

- [ ] **Billing callback uses REST — violates rule 2.2.4** — `GET /api/payment/billing/callback` calls REST `application_charges/{chargeId}.json`. As of April 1, 2025 all new public apps must use GraphQL exclusively. Replace with:
  ```graphql
  query { node(id: "gid://shopify/AppPurchaseOneTime/{chargeId}") {
    ... on AppPurchaseOneTime { status }
  }}
  ```
  Use `shopify.clients.Graphql` from `@shopify/shopify-api`.

- [ ] **iframe CSP must be dynamic per shop** — static or wildcard `*.myshopify.com` in `Content-Security-Policy: frame-ancestors` is a clickjacking risk and App Store rejection trigger. Must be set per-request: `frame-ancestors https://{shop}.myshopify.com https://admin.shopify.com`. After JWT auth is wired, the verified `dest` field provides the correct shop domain for each request. Shopify SDK sets this correctly if using standard middleware — verify no static CSP middleware is overriding it.

### HIGH — required before charging real merchants

- [ ] **Distribution type must be "public"** — Shopify Billing API (`AppPurchaseOneTime`) only works for apps with public distribution. Custom apps cannot charge merchants. Verify in Partner Dashboard → App setup → Distribution. If "custom", change to "public (unlisted)" before any real merchant payment flows. **Critical caveat: distribution method is irreversible once set.** If you have separate dev and production apps in Partner Dashboard, set distribution on the **production app**, not the dev app. Dev app can remain custom. Double-check before selecting.

- [ ] **APP_PURCHASES_ONE_TIME_UPDATE webhook missing** — Shopify sends billing state changes (pending → active, cancelled, declined) via this webhook. Currently not subscribed. Without it, cancellation/decline states are only caught at callback time and a server restart could miss them. Add handler and subscribe in `shopify.app.toml`.

- [ ] **Webhook HMAC verification** — review existing `app-uninstalled` handler to confirm it calls `shopify.webhooks.validate({ rawBody, headers })` before processing. All future webhook handlers (compliance, billing update) must also verify. Pattern: return 401 immediately on invalid HMAC, return 200 on valid (process asynchronously).

- [ ] **Railway worker: no GraphQL rate limit backoff** — bulk product imports hit Shopify GraphQL leaky bucket (100 points/sec). No retry logic in worker. Large stores will start returning `THROTTLED` errors mid-migration. Add: after each mutation response, check `extensions.cost.throttleStatus.currentlyAvailable`; if `< 50`, `await sleep(1000)` before next batch.

- [ ] **Offline token 90-day expiry UX** — Shopify refresh tokens expire after 90 days of inactivity. When `shopify.auth.refreshToken()` throws, the current error path is unhandled. Add: catch refresh errors specifically and redirect to OAuth reinstall URL (`/api/auth?shop={shop}`) with a clear message, instead of a generic 500.

### MEDIUM — required before App Store submission

- [ ] **Emergency developer contact** — Shopify requires an emergency contact email in Partner Dashboard before submission. Set once professional domain email is ready. Do not leave as `001henrycreel@gmail.com`.

- [ ] **Demo screencast** — Shopify reviewers require a video showing full app flow (not optional). Must be in English. Minimum content: URL input → recon → ownership verify → payment → migration complete screen. Record after production Vercel deploy.

- [ ] **Test credentials for reviewers** — Reviewers need a working dm2buy test store they can use to test migration. Prepare: `mmshop.dm2buy.com` (or a dedicated reviewer store) + written instructions. Required for submission package.

- [ ] **Listing language: ownership constraint (rule 1.1.13)** — Shopify App Store rule 1.1.13 prohibits "import from any store" framing. All listing copy (title, short description, long description) must make clear the seller is migrating their own dm2buy store. Phrase like "migrate your dm2buy store to Shopify" — not "import any store."

- [ ] **Reconciliation job** — Shopify does not guarantee webhook delivery. Before App Store submission, add a daily background job querying `currentAppInstallation` to confirm app is still installed and billing is current. Prevents stale state accumulating as merchant volume grows.

- [ ] **Webhook deduplication** — Shopify can retry webhooks with the same `X-Shopify-Webhook-Id`. Handlers must check this header against a short-lived processed set (e.g. a Supabase table or Redis key with 24hr TTL) before executing. Prevents double-import-triggers and double-deletion on retry.

### LOW / nice-to-have

- [ ] GraphQL mutation batching: verify Railway worker splits product lists into ≤ 250-item chunks (Shopify's max array input size).
- [ ] Move `shopify.app.toml` `api_version` from `2026-04` to `2025-01` (current stable). Not blocking; prevents version deprecation warnings.
- [ ] Use `shopify CLI webhook trigger` command to manually test compliance webhook handlers before submission.

---

### Shoprift already has this (confirmed compliant — do not re-implement)

- **OAuth Authorization Code Grant**: `shopify.auth.begin()` + callback correctly implemented
- **Offline access tokens**: `isOnline: false` — correct for background job app
- **Session storage in Supabase**: `shopify_sessions` table wired to Shopify SDK storage adapter
- **Token refresh**: `shopify.auth.refreshToken()` called within 5-minute expiry window
- **app/uninstalled webhook**: subscribed, deletes sessions, marks jobs failed
- **AppPurchaseOneTime charge type**: correct for one-time payment; `isTest` correctly gated to `NODE_ENV !== 'production'`
- **Required scopes**: `write_products, read_products, write_product_listings` — appropriate for product import tool

---

*Source: Shopify developer docs live audit via Chrome Extension + native docs assistant (2026-05-27). Pages: privacy-law-compliance, session-tokens, set-up-session-tokens, app-requirements-checklist, billing/purchase-one-time, set-up-iframe-protection, app-store listing requirements, app-home, distribution, select-distribution-method, built-for-shopify, built-for-shopify/requirements.*
*Added: 2026-05-27 | Owner: Mayank Malik*

---

## 11 — Built for Shopify (post-launch, aspirational)

**Not required for App Store listing.** BFS requires 50+ net installs + 5+ reviews first. Address after Shoprift has real merchant traction.

| Requirement | What's needed |
|-------------|--------------|
| Migrate to Web Components App Bridge | Replace npm `@shopify/app-bridge` + meta tag with `<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js">` in `<head>`. Required for BFS 3.1.1. |
| Homepage metrics (BFS 4.2.3) | App home must show useful metrics — e.g. migration history, last job status, products migrated count. Static wizard-only UI will fail BFS review. |
| Mobile-friendly (BFS 4.1.2) | Verify wizard renders cleanly on mobile. Shopify admin used on mobile by many merchants. |
| Nav menu (BFS 4.1.4) | Use `s-app-nav` App Bridge web component if Shoprift adds multiple pages. Single-wizard app may be exempt. |
| App name concise (BFS 4.1.3) | "Shoprift" is short — confirm it doesn't truncate in Shopify nav when pinned. |
| No auto-appearing modals (BFS 4.3.3) | Verify no popovers appear on page load. Error states should be inline, not modal. |
| Performance — LCP ≤ 2.5s at p75 (BFS 2.1.1) | Measure after production deploy. Next.js on Vercel should be fine. |

*Source: built-for-shopify/requirements.md (2026-05-27). BFS is opt-in; apply from Partner Dashboard after threshold installs.*

---

*Source: "App Launch & Stability Checklist" — compiled from 100+ developer posts/reels. Filtered and adapted for Shoprift's embedded Shopify app architecture.*
*Added: 2026-05-27 | Owner: Mayank Malik*
