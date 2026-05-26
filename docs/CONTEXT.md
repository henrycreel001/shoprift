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

- **Date:** 2026-05-27
- **Session topic:** End-to-end migration confirmed working. Verification fixed. Full flow live.
- **Branch:** main (up to date with remote, commit `c5ffaee`)

---

## CURRENT PHASE STATUS

| Group | Phase | Status | Notes |
|-------|-------|--------|-------|
| A — Engine | 0–10 | ✅ Passing | kiwiishop: 25 products, 5 collections, 63 images ✅ |
| B — CSV mapper | 11 | ✅ Complete | Shopify + generic preset shipped |
| C — Web app | T1–T6 | ✅ Complete | Full flow: URL → Verify → Preview → Extract → Review → Import → Done. 9 products + 3 collections confirmed live in Shopify. |
| C — Web app | T7 | ❌ Not started | Shopify Billing API — payment not wired. Users currently get free migrations. |
| D — Launch | 15 | ❌ Not started | Blocked on T7 + PRE_LAUNCH_CHECKLIST |

---

## LAST 5 ACTIONS (most recent first)

1. **End-to-end migration confirmed** — Full wizard tested: URL → Verify → Preview → Extract → Review → Import → Done. 9 products + 3 collections imported to `shoprift-dev.myshopify.com` from mmshop. Trial skip (5 already imported) worked correctly.
2. **Root cause found: wrong Railway URL** — `RAILWAY_WORKER_URL=http://localhost:3001` in Vercel. Worker never received verify/check calls. Fixed: updated to `https://shoprift-production.up.railway.app` in Vercel dashboard + `.env.local`.
3. **Verification confirmed working on Railway** — Direct curl to `POST /verify/check` returned `{ verified: true }`. The axios+httpsAgent fix (commit `c5ffaee`) was correct; only the URL was wrong.
4. **Two verification bugs fixed and committed** — (a) `method` column null violation fixed by passing it explicitly in INSERT (`f49337c`); (b) `/verify/check` on Railway replaced native fetch with axios+httpsAgent to bypass dm2buy expired TLS cert + added full pagination (`c5ffaee`).
5. **Railway worker deployed** — `railway up --detach` at commit `c5ffaee`. Worker online at `https://shoprift-production.up.railway.app`.

---

## ACTIVE BLOCKERS

| Blocker | Blocks | Notes |
|---------|--------|-------|
| T7 Billing API not implemented | Revenue | "Pay ₹599" calls `/api/import/start` directly — no charge. Shopify `AppPurchaseOneTime` not wired. **This is the next task.** |
| Verification product gets imported | UX | The dummy dm2buy product added for verification (e.g. "SHR-DDM2-TFNVNY" at ₹12) is extracted and imported to Shopify alongside real products. User should delete it from dm2buy after verification. Not blocking launch but should be fixed. |

---

## UNCOMMITTED CHANGES

None. All code changes pushed. `.env.local` updated locally (gitignored).

**One manual step still needed:** `RAILWAY_WORKER_URL` in Vercel production set to `https://shoprift-production.up.railway.app` — user confirmed done.

---

## NEXT TASKS (in priority order)

1. **T7 — Shopify Billing API** — Wire `AppPurchaseOneTime` before real users get access. Currently the "Pay ₹599" button imports for free. This is the revenue gate.

2. **Fix verification product import** — After verification passes, the dummy product is still in the seller's dm2buy store and gets extracted. Options:
   - Tell user to delete it before extraction (current: UI says this but no enforcement)
   - Filter out products whose name starts with `SHR-` during extraction (risky — seller might have real products with that name)
   - Smarter: after verification, store the code and filter it in the extractor

3. **PRE_LAUNCH_CHECKLIST** — Read `docs/PRE_LAUNCH_CHECKLIST.md` before any external users are onboarded.

---

## KNOWN DECISIONS / CONTEXT

- **Extraction: client-side** — seller's browser runs extraction against dm2buy API (CORS open). Server only handles Shopify Admin API import.
- **Shopify app embedded** — loads inside Shopify admin iframe. `shop` param arrives via URL query string (`?shop=shoprift-dev.myshopify.com`). CSP `frame-ancestors` set.
- **Trial detection architecture** — `is_trial` and `trial_product_urls` are top-level DB columns set at job INSERT time, never written by the Railway worker. Worker only writes `recon_data` (import results), `progress`, `status`, `error`.
- **Verification method** — Method B: dm2buy product injection. User adds a product named `SHR-XXXX-XXXXXX` to their dm2buy store. Railway worker checks via dm2buy public API (paginated, axios+httpsAgent for expired TLS cert bypass). One verified record per (shop, store_url) pair — stays verified permanently.
- **RAILWAY_WORKER_URL** — `https://shoprift-production.up.railway.app` (production + local .env.local). Must be set in Vercel env vars.
- **Railway domain** — `https://shoprift-production.up.railway.app` (generated 2026-05-27).
- **T7 billing bypassed intentionally** — "Pay ₹599" → `/api/import/start` directly. No charge. T7 is the next revenue-critical task.
- **Razorpay scaffolded but unused** — `/api/payment/create` exists. Shopify Billing API (`AppPurchaseOneTime`) is the actual payment path for the embedded app.
- **dm2buy TLS cert expired** — All server-side API calls to `api.dm2buy.com` MUST use `axios + httpsAgent` with `rejectUnauthorized: false`. Pattern lives in `src/api.js`. Never use native `fetch` for dm2buy API calls from Node.js.

---

## SESSION NOTES

> Dev setup: `cd web && npm run dev` (port 3000) + ngrok forwarding to 3000 + Railway worker on port 3001 (`node worker.js`).
> Test store: `https://kiwiishop.dm2buy.com` — 25 products, 5 collections, 63 images.
> Test Shopify store: `shoprift-dev.myshopify.com`.
> mmshop (`https://mmshop.dm2buy.com`) is Mayank's test dm2buy store — 13 real products + verification artifacts.
