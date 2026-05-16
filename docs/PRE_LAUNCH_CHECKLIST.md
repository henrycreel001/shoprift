# PRE_LAUNCH_CHECKLIST.md — Things That Must Be Done Before Web App Launch

> Captured from founder review session on 2026-05-15.
> These are non-negotiable gaps identified before Shoprift goes public.
> Cross-reference: ARCHITECTURE.md (technical), WEB_APP.md (web app spec), docs/legal/ (legal docs)

---

## 1 — Anti-Detection (do before web app launch)

dm2buy can detect our API calls. These fixes make us indistinguishable from a real Chrome browser.
Without these, Railway server IP gets flagged and blocked once web app scales.

- [x] **Fix TLS fingerprint** — route API calls through `page.evaluate(fetch)` inside Playwright instead of Axios. Node.js/Axios TLS handshake is different from Chrome's and detectable by Cloudflare. This is the single biggest giveaway.
- [x] **Full browser header set** — add all headers a real Chrome browser sends: `Sec-Fetch-*`, `Accept-Language`, `Origin`, `Referer`, `Sec-CH-UA`, `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform`, `Connection`. Currently we send ~5 headers; Chrome sends 15-20.
- [x] **Randomize delays** — replace fixed 800ms delay with random 600–2100ms range. Fixed interval is a machine signature.
- [x] **Add occasional long pauses** — with ~20% probability, pause 3–5 seconds between product fetches. Mimics human reading time.
- [x] **Visit storefront first** — use Playwright to load `{store}.dm2buy.com` before hitting the API. Builds real session cookies and referrer history. Currently we skip straight to the API.
- [x] **Build Playwright DOM scraping fallback** — for when dm2buy adds API authentication or the API goes offline. DOM scraping is slower and fragile but works when API doesn't. This is the insurance policy.

---

## 2 — Scaling Infrastructure (do before web app launch)

Concierge mode = your laptop IP. Changes per session. Fine.
Web app on Railway = one fixed datacenter IP making hundreds of jobs/day. Gets blocked fast.

- [x] **Implement job queue** — one extraction job at a time, max ~10-15 jobs/hour, queue everything else. Zero cost. Protects Railway IP from looking like a scraping farm. This is the V1 solution.
- [ ] **Plan proxy rotation** — research Bright Data / Oxylabs / Smartproxy pricing. Budget ~$15-50/month into web app pricing tiers before scaling past early users. Needed when queue times become unacceptable.
- [ ] **Decide: server-side vs. client-side extraction** — two architectures:
  - **Server-side** (current plan): Railway server runs Playwright, needs proxy rotation at scale
  - **Client-side**: user's browser makes API calls, results sent back to server — every job comes from seller's own home IP, infinitely scalable, free, but user must keep tab open
  - Decision must be made before building the web app extraction flow.

---

## 3 — Legal Documents (do before any money changes hands)

Shoprift touches seller data and charges money. Legal docs are not optional.
DPDP Act fines start at ₹50 lakh. Consumer Protection Act requires visible refund terms before payment.

- [x] **Migration Consent document** — most critical document. Seller signs before extraction runs. Must include:
  - Seller authorizes Shoprift as their agent for extraction
  - Seller represents they own the content being migrated
  - Seller acknowledges responsibility for reviewing their own dm2buy ToS
  - Seller indemnifies Shoprift against claims from dm2buy or content ownership disputes
  - Shoprift's liability limited if extraction fails or produces wrong data
  - See `docs/legal/migration-consent.md` when drafted
- [x] **Terms of Service** — seller-facing contract. Must include indemnity clause from seller to Shoprift for their content claims and customer disputes.
- [x] **Privacy Policy** — DPDP Act 2023 compliant. Purpose-specific consent, withdrawable, plain language.
- [x] **Grievance Officer notice** — mandatory under IT Rules 2021. Name, email, address, response timeline (24hr acknowledgement, 15 days resolution).
- [ ] **Refund & Cancellation Policy** — required by Consumer Protection (E-Commerce) Rules 2020. Must be visible before payment is taken.
- [x] **Lawyer review** — one pass by Indian tech lawyer before publishing any of the above. Budget ₹20–30k. Non-negotiable before web app goes live.
- [x] **Maintain consent records** — every extraction job must have a signed/accepted consent on file. If dm2buy ever sends a legal notice, these records kill the case before it starts.

---

## Legal posture summary (for Claude's reference)

Calling dm2buy's unauthenticated public API is **not criminal** under Indian IT Act (no access control bypassed).
It is **legally gray** because dm2buy's ToS likely prohibits automated access — but that is a civil matter between the seller and dm2buy, not Shoprift.
Shoprift's defense is **seller agency** — we act on behalf of the data owner, not as an unauthorized third party.
The Migration Consent document is what makes this defense hold up. Without it, exposure is real.

---

## Priority order

```
Anti-detection fixes  →  Legal documents  →  Scaling infrastructure
     (engine work)          (before launch)        (before scale)
```

Do not launch the web app without all three groups addressed.

---

*Added: 2026-05-15 | Owner: Mayank Malik | Next review: before Phase 12 (web app) begins*
