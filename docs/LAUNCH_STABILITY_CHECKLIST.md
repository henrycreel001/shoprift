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

- [x] **Analytics set up** — `posthog-js` installed. `web/src/lib/analytics.ts` wrapper (memory persistence, no cookies, no autocapture). 10 events instrumented in `migrate/page.tsx`. Requires `NEXT_PUBLIC_POSTHOG_KEY` env var in Vercel. ✅ Phase 5
- [ ] **Payment flow tested on production** — T7 confirmed on dev/ngrok. Must repeat on Vercel/Railway prod URL with real Shopify store before opening to users.
- [x] **Shopify OAuth works on production** — tested on `shoprift.app`. Install + callback confirmed. ✅ Phase 0
- [x] **Backend authorization enforced** — JWT HS256 session token verification in `web/src/lib/auth.ts` applied to all API routes. `account_id` guard on every job select. ✅ Phase 1/2
- [x] **Rate limiting on API routes** — `/api/verify/start`: max 3 per shop per hour (DB query, works across serverless). One active job per shop enforced at import/start. ✅ Phase 2
- [x] **Error monitoring (Sentry)** — `@sentry/nextjs` v10 on web + `@sentry/node` on Railway worker. DSNs set in Vercel + Railway env vars. ✅ Phase 3
- [x] **Privacy Policy + Terms of Service linked in app UI** — footer in `migrate/page.tsx` links Terms · Privacy · Refund Policy · Grievance Officer. ✅ Phase 4
- [x] **Refund Policy linked at checkout** — link to `/refund-policy` shown before billing button, per Consumer Protection Rules 2020. ✅ Phase 4
- [x] **Support contact visible in app** — "Email support" mailto link in error banner (shown on any job failure or payment issue). ✅ 2026-05-28

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
- [x] Consistent naming: `noun_verb` pattern (above)
- [x] Include `shop`, `product_count`, `plan` on payment events
- [x] No PII in event properties (no store owner names, no email addresses)
- [ ] Build a simple funnel dashboard: recon → verify → payment → complete. Drop-off at each step is your product signal. (PostHog UI — do after first real users)

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

- [x] **Job ownership check** — `.eq('account_id', shop)` added to every job select in status route. Shop derived from verified JWT. ✅ Phase 1/2
- [x] **Verify routes check shop** — `/api/verify/check` confirms `attemptId` belongs to verified `shop` from JWT. ✅ Phase 1/2
- [x] **Test unauthenticated API calls** — all 5 JWT-protected routes return `401 {"error":"Unauthorized"}`. No stack traces, no DB data leaked. ✅ 2026-05-28

---

## 5 — Security & Secrets

- [ ] **No secrets in git** — `.env.local` is gitignored. Verify `.env.example` has no real values (it doesn't currently — confirm before each commit).
- [ ] **NEXT_PUBLIC_ vars are client-exposed** — `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally public (Supabase anon key is designed to be). Confirm no service role key is accidentally prefixed `NEXT_PUBLIC_`.
- [x] **Error responses don't leak internals** — all API routes hardened: generic messages in response body, full detail in `console.error({ phase, shop, error })` only. ✅ Phase 2
- [ ] **Check browser console on prod** — before launch, open DevTools on the live app and confirm no stack traces, no API keys, no debug logs visible.
- [ ] **SQL injection not a risk** — Supabase JS client uses parameterized queries. Not a manual SQL injection risk. Confirm no raw SQL strings are being built anywhere.

---

## 6 — Reliability & Observability

- [x] **Sentry on Next.js** — `@sentry/nextjs` v10 wired: `sentry.{client,server,edge}.config.ts`, `instrumentation.ts` with `onRequestError`, `global-error.tsx`, `withSentryConfig` in `next.config.ts`. ✅ Phase 3
- [x] **Sentry on Railway worker** — `@sentry/node` init in `worker.js` before worker starts. ✅ Phase 3
- [x] **Alert on payment failures** — Sentry alert rules created for both `shoprift-web` and `shoprift-worker` projects. Trigger: new issue created. Action: Notify Team #shoprift + Notify Suggested Assignees. Throttle: 24hrs. Test notification confirmed delivered to `001henrycreel@gmail.com`. ✅ 2026-05-28
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

> **Note on legal pages (2026-05-28):** `/terms`, `/privacy`, `/refund-policy` currently live on the Vercel app URL (`shoprift.app`). These are temporary. When the Shoprift website is built, migrate these pages there and update all footer links in `web/src/app/migrate/page.tsx`.

Shoprift needs a public landing page outside the Shopify admin (for search traffic, social sharing, app listing links).
**Scope: post-App Store launch. Do not build until app is generating revenue.**

- [ ] **Full Shoprift marketing website** — modern, interactive, aesthetic landing page at root domain. Showcases the migration flow, social proof, pricing.
- [ ] **`docs.` subdomain** — documentation pages with step-by-step guides, screenshots, FAQ, and troubleshooting. Separate from app.
- [ ] **Demo screenshots and video** embedded on landing page — show URL input → recon → verify → pay → products in Shopify.
- [ ] **Legal pages migrated** — move `/terms`, `/privacy`, `/refund-policy`, AUP, DMCA, Grievance Officer from Vercel app URL to the marketing website. Update all footer links in the app.
- [ ] HTTPS (handled by host)
- [ ] Open Graph tags: `og:title`, `og:description`, `og:image`, `og:url`
- [ ] Favicon
- [ ] `sitemap.xml`
- [ ] `robots.txt`
- [ ] Google Search Console connected + sitemap submitted
- [ ] Meta title + description set
- [ ] Support / contact link visible

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
| Acceptable Use Policy | ✅ Drafted | `docs/legal/acceptable-use.md` v1.0 — IT Act §79 aligned, 9 prohibited conduct categories |
| Cookie Policy | ⏸ Deferred | Wire when analytics (PostHog) added |
| DMCA / Takedown | ✅ Drafted | `docs/legal/dmca.md` v1.0 — IT Act §79 + voluntary DMCA §512 |
| Lawyer review pass | ❌ Not done | Budget ₹20–30k. Required before money changes hands with real users. |
| Domain + professional email | ❌ Not done | 17 occurrences of `001henrycreel@gmail.com` in 5 legal files (tracked in PRE_LAUNCH_CHECKLIST.md). Also update legal page URLs from `shoprift.app` to final domain. |

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

- [x] **GDPR compliance webhooks** — `customers/data_request`, `customers/redact`, `shop/redact` subscribed in `shopify.app.toml`. Handler at `/api/webhooks/compliance` verifies HMAC, `shop/redact` deletes all Supabase rows for shop. ✅ Phase 1

- [x] **Session token (JWT) authentication on all API routes** — `web/src/lib/auth.ts` verifies HS256 JWT (`exp`, `aud`, `iss`/`dest`, signature). Applied to all 5 API routes. Shop always sourced from verified `dest`, never from request body. ✅ Phase 1

- [x] **App Bridge installed** — `@shopify/app-bridge` v3 installed. `<meta name="shopify-api-key">` in `layout.tsx`. `createApp` + `getSessionToken` in `migrate/page.tsx` — token passed as `Authorization: Bearer` before every API call. ✅ Phase 1 — **Note:** Web Components App Bridge required for Built for Shopify (post-launch target — see Section 11).

- [x] **Billing callback uses GraphQL** — `billing/callback` route replaced REST `application_charges/{id}.json` with `AppPurchaseOneTime` GraphQL query via `shopify.clients.Graphql`. ✅ Phase 1

- [x] **iframe CSP dynamic per shop** — `web/src/middleware.ts` reads `shop` query param per request, sets `frame-ancestors https://{shop}.myshopify.com https://admin.shopify.com`. Falls back to broad allowlist for direct browser hits. ✅ Phase 1

### HIGH — required before charging real merchants

- [ ] **Distribution type must be "public"** — Shopify Billing API (`AppPurchaseOneTime`) only works for apps with public distribution. Custom apps cannot charge merchants. Verify in Partner Dashboard → App setup → Distribution. If "custom", change to "public (unlisted)" before any real merchant payment flows. **Critical caveat: distribution method is irreversible once set.** If you have separate dev and production apps in Partner Dashboard, set distribution on the **production app**, not the dev app. Dev app can remain custom. Double-check before selecting.

- [x] **APP_PURCHASES_ONE_TIME_UPDATE webhook** — subscribed in `shopify.app.toml`. Handler at `/api/webhooks/billing-update` verifies HMAC, deduplicates via `webhook_idempotency` table, marks job failed on DECLINED/CANCELLED. `charge_id` stored at billing/create time (migration 005). ✅ Phase 5

- [ ] **Webhook HMAC verification** — review existing `app-uninstalled` handler to confirm it calls `shopify.webhooks.validate({ rawBody, headers })` before processing. All future webhook handlers (compliance, billing update) must also verify. Pattern: return 401 immediately on invalid HMAC, return 200 on valid (process asynchronously).

- [ ] **Railway worker: no GraphQL rate limit backoff** — bulk product imports hit Shopify GraphQL leaky bucket (100 points/sec). No retry logic in worker. Large stores will start returning `THROTTLED` errors mid-migration. Add: after each mutation response, check `extensions.cost.throttleStatus.currentlyAvailable`; if `< 50`, `await sleep(1000)` before next batch.

- [ ] **Offline token 90-day expiry UX** — Shopify refresh tokens expire after 90 days of inactivity. When `shopify.auth.refreshToken()` throws, the current error path is unhandled. Add: catch refresh errors specifically and redirect to OAuth reinstall URL (`/api/auth?shop={shop}`) with a clear message, instead of a generic 500.

### MEDIUM — required before App Store submission

- [ ] **Emergency developer contact** — Shopify requires an emergency contact email in Partner Dashboard before submission. Set once professional domain email is ready. Do not leave as `001henrycreel@gmail.com`.

- [ ] **Demo screencast** — Shopify reviewers require a video showing full app flow (not optional). Must be in English. Minimum content: URL input → recon → ownership verify → payment → migration complete screen. Record after production Vercel deploy.

- [ ] **Test credentials for reviewers** — Reviewers need a working dm2buy test store they can use to test migration. Prepare: `mmshop.dm2buy.com` (or a dedicated reviewer store) + written instructions. Required for submission package.

- [ ] **Listing language: ownership constraint (rule 1.1.13)** — Shopify App Store rule 1.1.13 prohibits "import from any store" framing. All listing copy (title, short description, long description) must make clear the seller is migrating their own dm2buy store. Phrase like "migrate your dm2buy store to Shopify" — not "import any store."

- [ ] **Reconciliation job** — Shopify does not guarantee webhook delivery. Before App Store submission, add a daily background job querying `currentAppInstallation` to confirm app is still installed and billing is current. Prevents stale state accumulating as merchant volume grows.

- [x] **Webhook deduplication** — `webhook_idempotency` table (migration 005). All 3 webhook handlers (`app-uninstalled`, `compliance`, `billing-update`) check `X-Shopify-Webhook-Id` before processing. ✅ Phase 5

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
