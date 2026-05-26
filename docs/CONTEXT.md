# CONTEXT.md — Session Handoff File

> Claude reads this at the start of every new session.
> Claude updates this whenever a phase completes, a blocker hits, or user says **"update context"**.
> Do not use this for architecture decisions — those live in CLAUDE.md / ARCHITECTURE.md.

---

## HOW TO USE

**Starting a new session:** Read this file. You now know where things stand.
**Ending / compacting a session:** User says "update context" → rewrite the sections below with current state.
**Multiple parallel sessions:** Each session should note its topic in the Last Worked On section.

---

## LAST UPDATED

- **Date:** 2026-05-26
- **Session topic:** T5.9 integration test pass, T6 Polaris wizard built, Internal Server Error debugged, trial import feature planned
- **Branch:** main

---

## CURRENT PHASE STATUS

| Group | Phase | Status | Notes |
|-------|-------|--------|-------|
| A — Engine | 0–10 | ✅ Passing | kiwiishop: 25 products, 5 collections ✅ |
| B — CSV mapper | 11 | ✅ Complete | Shopify + generic preset shipped |
| C — Web app | T5 ✅ T6 ✅ | 🟡 In progress | Shopify import working; T7 billing + trial import next |
| D — Launch | 15 | ❌ Not started | Blocked on C |

---

## LAST 5 ACTIONS (most recent first)

1. **T6 complete** — Polaris 6-step migration wizard built at `/migrate`. AppProvider, Suspense, client-side extraction, progress bars, billing gate (bypassed), import polling. Build clean. Loads inside Shopify admin.
2. **T5.9 passed** — kiwiishop integration test: 25/25 products, 0 failures, 5 collections via Shopify Admin API. CSV export confirmed correct (variant mapping, CDN images, collections via collects API).
3. **Debugged Internal Server Error** — stale Next.js process on port 3000 (PID 39421). Kill + restart fixed it. Fresh server works. Added `allowedDevOrigins` to next.config.ts for ngrok cross-origin warning.
4. **Shopify app confirmed loading** — ngrok URL + Shopify admin both load. Session params (hmac, id_token, shop) confirmed arriving at root page.
5. **Trial import plan written** — see plan file at `/Users/mayankmalik/.claude/plans/virtual-herding-perlis.md`

---

## ACTIVE BLOCKERS

| Blocker | Blocks | Notes |
|---------|--------|-------|
| Shop param lost on CTA click | Full import working | page.tsx "Migrate my store" link has no ?shop=xxx — fix is in the plan |
| T7 Billing API not implemented | Paid import | Billing step currently bypasses payment — calls import/start directly |
| Trial import not built | Trust-building UX | Full plan written, not yet implemented |

---

## UNCOMMITTED CHANGES (as of last update)

- `CLAUDE.md` — modified
- `package.json` / `package-lock.json` — modified (Polaris, shopify-api added)
- `web/next.config.ts` — modified (transpilePackages, allowedDevOrigins, CSP)
- `web/src/app/layout.tsx` — modified (Polaris CSS import)
- `web/src/app/migrate/page.tsx` — complete rewrite (T6 Polaris wizard)
- `web/src/app/api/payment/create/route.ts` — modified
- `worker.js` — modified
- `src/server.js` — new, untracked
- `src/shopify-importer.js` — new, untracked (Shopify Admin API import engine)
- `.claude/settings.json` — new, untracked
- `tests/shopify-import.test.js` — new (T5.9 integration test)
- `docs/LAUNCH_PLAN.md` — new

---

## NEXT TASKS (in priority order)

Next session: implement the plan at `/Users/mayankmalik/.claude/plans/virtual-herding-perlis.md` in full.

1. **Content update** — Remove "shutting down" urgency copy from `page.tsx` + `layout.tsx`. New headline: "Move your dm2buy store to Shopify"
2. **Fix shop param bug** — `page.tsx`: add `searchParams` prop, pass `?shop=xxx` to CTA link
3. **Trial import** — 5 products free, one-time per store. Full plan in plan file.
4. **Merge landing context** — compact hero above URL input on step 1 of wizard
5. **T7** — Shopify Billing API (`AppPurchaseOneTime`) — gates paid import behind confirmed Shopify charge

---

## KNOWN DECISIONS / CONTEXT

- Verification skipped in V1 (concierge mode) — `verifier.js` kept for V2.
- Collections → Tags column in Shopify CSV. Do not change without updating all emitters.
- **Extraction architecture: client-side** — seller's browser runs extraction JS against dm2buy API (CORS open). Server handles Shopify Admin API import only. No proxy needed.
- **Shopify app embedded** — loads inside Shopify admin iframe. CSP `frame-ancestors` set. Session params (hmac, host, id_token, shop) arrive via URL query string.
- **T6.5 billing bypassed** — the "Pay and import" button in the wizard calls `/api/import/start` directly without Shopify billing. T7 wires real `AppPurchaseOneTime`.
- **Trial import plan**: 5 free products, one-time per shop+store_url. Stored in `import_jobs.recon_data` with `is_trial: true` and `trial_product_urls: []`. Full import filters those URLs out to avoid duplicates.
- **Railway worker running** — `RAILWAY_WORKER_URL` in `.env.local` points to `http://localhost:3001` for local dev. Worker serves POST /import via `src/server.js`.
- **Razorpay scaffolded but unused** — `/api/payment/create` exists but Shopify Billing API is the payment path for the embedded app.
- **dm2buy is NOT shutting down** — remove all urgency/fear copy. New positioning: scale your business by migrating from dm2buy to Shopify.

---

## SESSION NOTES

> T5.9 kiwiishop test: 25/25 products, 0 failures, 5 collections. CSV export verified.
> T6 Polaris wizard fully working inside Shopify admin. Build clean, TypeScript 0 errors.
> Bug found: page.tsx "Migrate my store" loses ?shop param → "Invalid shop" error on import.
> Full plan for next session: trial import + content update + shop param fix → plan file above.
> Dev setup: `cd web && npm run dev` (port 3000) + ngrok forwarding to 3000 + Railway worker on 3001.
