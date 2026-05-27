# Shopify Docs Audit Prompt — For Claude Chrome Extension

> **How to use:**
> 1. Open Chrome → navigate to `https://shopify.dev/docs/apps/build`
> 2. Open the Claude Chrome extension
> 3. Copy the entire prompt below and paste it in
> 4. Let Claude browse and read every page
> 5. Paste the output back into the Shoprift Claude Code session

---

## PROMPT (copy everything below this line)

---

You are auditing the Shopify developer documentation to produce a gap analysis for a specific app. Read every page listed below in full. Do not summarize early — read the complete content of each page before moving on. After reading all pages, produce a structured checklist.

---

## THE APP: SHOPRIFT

Shoprift is an **embedded Shopify app** (loads inside Shopify Admin iframe). Here is the exact tech stack and current implementation state:

**Stack:**
- Next.js 15 (App Router) on Vercel
- `@shopify/shopify-api` v13 (Node.js SDK)
- `@shopify/polaris` v13 (UI components — Polaris only, no App Bridge package installed)
- Supabase — session storage (`shopify_sessions` table), job tracking, verification records
- Railway worker (Node.js) — runs the actual product migration
- TypeScript on frontend, JavaScript on Railway worker

**Authentication:**
- OAuth Authorization Code Grant flow — NOT Token Exchange
- Offline tokens (not online) — `isOnline: false` in `shopify.auth.begin()`
- Session stored in Supabase `shopify_sessions` table with `refresh_token` + `refresh_token_expires_at` columns
- Token refresh implemented: `shopify.auth.refreshToken()` called when token within 5 minutes of expiry
- `shop` domain read from URL search params (`useSearchParams().get('shop')`) in the frontend

**Billing:**
- `AppPurchaseOneTime` (one-time charge, NOT subscription)
- `isTest = process.env.NODE_ENV !== 'production'`
- Billing create: uses GraphQL `appPurchaseOneTimeCreate` mutation
- Billing callback: uses REST `application_charges/{chargeId}.json` to verify charge status
- API version hardcoded as `2026-04` in 3 places

**Webhooks implemented:**
- `POST /api/webhooks/app-uninstalled` — deletes sessions from Supabase, marks jobs failed
- NO other webhooks exist

**Scopes:**
- `write_products, read_products, write_product_listings`

**shopify.app.toml webhooks section:**
```toml
[webhooks]
api_version = "2026-04"
```
No `[[webhooks.subscriptions]]` entries declared.

**What is NOT implemented (known gaps already in our checklist):**
- GDPR/privacy compliance webhooks (customers/data_request, customers/redact, shop/redact)
- Session token validation on API routes (all routes accept `shop` from request body with no JWT check)
- `@shopify/app-bridge` not installed — no `shopify.idToken()` call anywhere
- No rate limiting
- No Sentry / error monitoring
- No analytics event tracking
- No in-app help/support link
- Backend job ownership check missing on `/api/import/status/[jobId]`

**Distribution status:**
- App created in Shopify Partners dashboard — type unknown (custom vs public/unlisted)
- Not yet listed on Shopify App Store
- Currently installed on one development store for testing

---

## YOUR TASK

Visit and read EVERY page listed below. For each page:
- Read the complete content — do not skip sections
- Note every **requirement**, **restriction**, or **best practice** that applies to Shoprift
- Flag whether Shoprift currently has it (based on the stack description above), is missing it, or it's unclear

After reading all pages, produce a single structured output with:
1. A **Gap Table** — one row per gap found, with: gap name, severity (CRITICAL / HIGH / MEDIUM / LOW), which doc page it came from, and a one-line fix description
2. A **Shopify requirement details section** — for the CRITICAL and HIGH gaps only, give exact implementation guidance (what endpoint, what header, what validation logic)
3. A **"Shoprift already has this" confirmation list** — things Shopify requires that Shoprift correctly implements, so we know what NOT to re-implement

---

## PAGES TO READ (visit each URL, read full content)

### Core build docs
1. `https://shopify.dev/docs/apps/build`
2. `https://shopify.dev/docs/apps/build/authentication-authorization`
3. `https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens`
4. `https://shopify.dev/docs/apps/build/authentication-authorization/access-token-types/offline-access-tokens`
5. `https://shopify.dev/docs/apps/build/authentication-authorization/get-access-tokens/authorization-code-grant`

### Embedded app requirements
6. `https://shopify.dev/docs/apps/build/embedded-app-home`
7. `https://shopify.dev/docs/api/app-bridge`
8. `https://shopify.dev/docs/apps/build/admin/embedded-app-home`

### Webhooks
9. `https://shopify.dev/docs/apps/build/webhooks`
10. `https://shopify.dev/docs/apps/build/privacy-law-compliance`
11. `https://shopify.dev/docs/apps/build/privacy-law-compliance/gdpr`

### Billing
12. `https://shopify.dev/docs/apps/launch/billing`
13. `https://shopify.dev/docs/apps/launch/billing/purchase-one-time`

### API usage
14. `https://shopify.dev/docs/api/usage/versioning`
15. `https://shopify.dev/docs/api/usage/rate-limits`
16. `https://shopify.dev/docs/api/usage/access-scopes`

### Launch and distribution
17. `https://shopify.dev/docs/apps/launch/distribution`
18. `https://shopify.dev/docs/apps/launch/app-requirements-checklist`
19. `https://shopify.dev/docs/apps/launch/built-for-shopify`
20. `https://shopify.dev/docs/apps/launch/app-store/add-app-info`

### Security
21. `https://shopify.dev/docs/apps/build/security`
22. `https://shopify.dev/docs/apps/build/security/csrf-protection`

---

## OUTPUT FORMAT

After reading all pages, produce the output in this exact structure:

```
## SHOPRIFT SHOPIFY GAP ANALYSIS
Date: [today's date]
Pages read: [list any that 404'd or failed to load]

---

## CRITICAL GAPS (will block App Store listing or billing)

### [Gap Name]
- **Shopify requirement:** [exact quote or paraphrase from the doc, with page URL]
- **Current state in Shoprift:** [what exists or doesn't exist]
- **Fix:** [specific implementation steps]

[repeat for each critical gap]

---

## HIGH GAPS (required before charging real merchants)

[same format]

---

## MEDIUM GAPS (required before App Store submission)

[same format]

---

## LOW / NICE TO HAVE

[one-liner per item]

---

## SHOPRIFT ALREADY HAS THIS (confirmed compliant)

- [item]: [why it's compliant]
[repeat]

---

## PAGES THAT FAILED TO LOAD

- [URL]: [error]
[repeat — be honest about which pages you couldn't read]
```

---

**Important:** If any page fails to load (404, Cloudflare block, timeout), list it explicitly in "Pages That Failed To Load" and do NOT make up content for it. Only report what you actually read.
