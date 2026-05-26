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

- **Date:** 2026-05-21
- **Session topic:** Engine validation + pre-launch review planning
- **Branch:** main

---

## CURRENT PHASE STATUS

| Group | Phase | Status | Notes |
|-------|-------|--------|-------|
| A — Engine | 0–10 | ✅ Passing | mmshop e2e confirmed — 5 products, 5 images, zip, 21s |
| B — CSV mapper | 11 | ✅ Complete | Shopify + generic preset shipped, delivery zip working |
| C — Web app | 12–14 | 🟡 Scaffolded | API routes exist; blocked on PRE_LAUNCH_CHECKLIST + architecture decision |
| D — Launch | 15 | ❌ Not started | Blocked on C |

---

## LAST 5 ACTIONS (most recent first)

1. Ran mmshop.dm2buy.com e2e — PASSED (5 products, 5 images, Shopify CSV, 1.7MB zip, 21s)
2. Fixed SUPABASE_SERVICE_KEY missing from .env (mapped anon key as temp workaround)
3. Added CONTEXT.md session handoff system + CLAUDE.md update rule
4. Fixed Railway worker — start command, TLS redis, playwright install
5. Pre-launch build — anti-detection, legal docs, web app scaffold

---

## ACTIVE BLOCKERS

| Blocker | Blocks | Notes |
|---------|--------|-------|
| kiwiishop e2e not run with current code | Full engine sign-off | Run `echo y \| node src/index.js https://kiwiishop.dm2buy.com` — expect 4 products, 2 collections, 18 images |
| PRE_LAUNCH_CHECKLIST: 3 items open | Web app ship | Refund policy, proxy plan, server-side vs client-side decision |
| Architecture decision made this session | Web app design | **Client-side extraction chosen** — see decisions below |

---

## UNCOMMITTED CHANGES (as of last update)

- `CLAUDE.md` — modified
- `package.json` / `package-lock.json` — modified
- `web/next.config.ts` — modified
- `web/src/app/api/payment/create/route.ts` — modified
- `worker.js` — modified
- `src/server.js` — new, untracked
- `.claude/settings.json` — new, untracked
- `prototype/` — new directory, untracked
- `.env` — SUPABASE_SERVICE_KEY added (gitignored, safe)

---

## NEXT TASKS (in priority order)

Follow `docs/LAUNCH_PLAN.md` track by track. Current track: **T1 — Engine Sign-Off**.

1. **T1.1** — `echo y | node src/index.js https://kiwiishop.dm2buy.com` — 4 products, 2 collections, 18 images
2. **T1.2** — Code audit via `/caveman` reviewer on extractor.js, recon.js, formatter.js
3. **T1.3** — Edge case tests: invalid URL, 0-product store, network timeout
4. **T1.4** — Commit all uncommitted changes
5. **T2.1** — Refund & Cancellation Policy via `/shoprift-legal`

---

## KNOWN DECISIONS / CONTEXT

- Verification skipped in V1 (concierge mode) — ownership confirmed via DM. `verifier.js` kept for V2.
- Instagram story polling (Method A) does not work — Instagram doesn't expose story HTML. V2 problem.
- Railway deployment exists — worker process runs via `worker.js` + BullMQ.
- Razorpay payment route scaffolded but not live — blocked on PRE_LAUNCH_CHECKLIST.
- Collections map to Tags column in Shopify CSV (convention — do not change without updating all emitters).
- **[NEW] Target product: Shopify App Store app** — embedded in Shopify admin, uses Shopify Admin API for direct import.
- **[NEW] Extraction architecture: client-side** — seller's browser runs extraction JS against dm2buy API. Server handles Shopify API import only. No proxy needed. Playwright stays in CLI/concierge only.
- **[NEW] Web app UX:** "Don't close tab" banner during extraction (~5–10s). Tab switching is fine (JS keeps running). Images uploaded to Shopify directly from dm2buy CDN URLs via Admin API.

---

## SESSION NOTES

> Full launch plan written → `docs/LAUNCH_PLAN.md`. 14-day roadmap to Shopify App Store submission.
> CORS confirmed open on api.dm2buy.com (`access-control-allow-origin: *`) — client-side extraction viable, no proxy needed.
> Concierge mode is live. Take CLI jobs anytime while app builds.
> Next session: T1.1 kiwiishop e2e test.

