# DESIGN.md — Shoprift Visual Design & Brand System

> Single source of truth for brand identity, visual design, and production assets.
> Read before: building any carousel, card, reel visual, or brand asset.
> Update after: any new design profile built, new asset added, or brand token changed.
> **Agent rule:** When using `/shoprift-content` to produce visual assets, read this file first. Update CHANGELOG before ending the session.
> **Strategy and distribution live in:** `MARKETING.md` — content cadence, posting rules, platform strategy, voice. This file governs what things look like. MARKETING.md governs where they go and when.

---

## BRAND IDENTITY

### Colors

| Token | Hex | Use |
|-------|-----|-----|
| Void | `#0A0B0F` | All backgrounds — non-negotiable on every profile |
| Deeper void | `#060608` | Editorial Serif (Profile 03) only |
| Surface | `#11131A` | Elevated cards, inner containers |
| Mint | `#00E5A0` | Primary accent — appears in EVERY post, minimum one element |
| Blue | `#6B8AFF` | Gradient secondary only |
| Text mute | `rgba(255,255,255,0.45)` | Secondary labels, metadata, counters |
| Red pain | `#FF4444` | Pain Hook Card (Profile 08) only — never elsewhere |
| Gradient | `135deg, #00E5A0 → #6B8AFF` | Key headlines, hero logos — never overused |

Dark background on every post is the non-negotiable brand anchor. No light backgrounds. No white slides. No exceptions.

### Typography

| Font | Weight | Use |
|------|--------|-----|
| Geist | 800–900 | Headlines and bold statements — all profiles except Editorial Serif |
| Geist | 400–500 | Body copy in Editorial Serif (Profile 03) only |
| Instrument Serif | italic | Emotional moments, quotes, milestone headlines |
| JetBrains Mono | any | Tags (`// label`), terminal output, data receipt rows, code |

**Font discipline:**
- JetBrains Mono replaces Geist only in Terminal/CLI (Profile 04) — nowhere else
- Instrument Serif is a dramatic accent — never used for body copy
- Mixing fonts outside their assigned profile is a brand violation
- Letter-spacing on Geist 900 headlines: `−0.045em` (tight)

### Logo

| Variant | Use | Size |
|---------|-----|------|
| S-mark mint mono (solid `#00E5A0`) | Meta-bars, slide headers, small instances | 26–28px |
| S-mark gradient (unique gradient ID per instance) | Hero slides, CTA slides — large only | 32–48px |
| "shoprift" wordmark (Geist 900) | Always alongside S-mark — never wordmark alone | Matched to S-mark height |

**SVG source:** `.claude/skills/shoprift-content/assets/logo-snippets.html`

**Gradient ID rule:** Every gradient SVG instance needs a unique `id` attribute (`g-h1`, `g-h8`, `g-v2cta`, `g-v3cta`, etc.). Shared IDs cause the last-defined gradient to override all earlier instances in the DOM.

**Never:** A dot (·) before "shoprift". Always the S-mark SVG.
**Never:** Gradient on small meta-bar instances — gradient at small sizes renders poorly. Use mint mono (`#00E5A0` solid) for all sub-32px instances.

### Slide Dimensions

All Instagram carousels and single posts: **1080 × 1350px** (portrait 4:5).
Download buttons output: **2160 × 2700px** (2× scale via html2canvas — Instagram-quality).
Stories: 1080 × 1920px — use Gradient Mesh (Profile 02) only.

---

## DESIGN PROFILES

Full reference with hierarchy, grid rules, and when-to-use mapping:
→ `.claude/skills/shoprift-content/references/design-profiles.md`

### Status Board

| # | Profile | Status | File(s) |
|---|---------|--------|---------|
| 01 | Carousel: Dark Terminal | ✅ Built | `output/content/carousel-01-v1-terminal.html` |
| 02 | Carousel: Gradient Mesh | ✅ Built | `output/content/carousel-01-v2-gradient.html` |
| 03 | Carousel: Editorial Serif | ✅ Built | `output/content/carousel-01-v3-editorial.html` |
| 04 | Terminal / CLI Card | ⬜ Not built | Build on demand |
| 05 | Relatable Text Card | ⬜ Not built | Build on demand |
| 06 | Data Receipt | ⬜ Not built | Build on demand |
| 07 | Before/After Split | ⬜ Not built | Build on demand |
| 08 | Pain Hook Card | ⬜ Not built | Build on demand |
| 09 | Testimonial / Quote Card | 🔒 Locked | Build only when a real customer grants permission |

**Build priority:** 08 Pain Hook → 05 Relatable Text → 06 Data Receipt → 07 Before/After → 04 Terminal/CLI → 09 Testimonial (when earned)

### Grid Coherence Rules

1. All backgrounds dark (`#0A0B0F` or `#060608`) — no exceptions
2. Mint (`#00E5A0`) appears in every post — minimum one element
3. S-mark logo appears in every @shoprift_ post
4. No two consecutive posts from the same profile on the same account
5. Gradient Mesh (02) and Editorial Serif (03) never in the same week — they pull in opposite directions aesthetically
6. Terminal/CLI (04) is the only profile where JetBrains Mono replaces Geist entirely
7. Data Receipt (06) is the only format that can be a raw Supabase screenshot without redesign

### Per-Profile Visual Specs

**Profile 01 — Dark Terminal**
Background `#0A0B0F` + 60px grid overlay (25% opacity white). Tags `// LABEL` in JetBrains Mono mint. Headlines Geist 900 tight. Cards at `#11131A` with 1px line borders. Glow orbs: 7–9% opacity mint + blue radials.

**Profile 02 — Gradient Mesh**
Background `#0A0B0F` base. Large radial blobs: mint 18% + blue 18%, 700–900px radius. No grid overlay. Cards: `rgba(255,255,255,0.03)` background, `rgba(255,255,255,0.07)` border — no `backdrop-filter` (breaks html2canvas). Gradient text on key headline words. Lowercase copy allowed.

**Profile 03 — Editorial Serif**
Background `#060608` — darker than void. No grid. No glow orbs. Instrument Serif italic at 88–120px for headlines. Geist 400–500 for body (not 900). Thin 1px horizontal rules `rgba(255,255,255,0.07)`. Large decorative page numbers: 240px Instrument Serif, 2% opacity. Mint used maximum once per slide.

**Profile 04 — Terminal / CLI Card**
Background `#000000` or `#0A0B0F`. JetBrains Mono only — no Geist, no Instrument Serif. Green (`#00E5A0`) text on black. Content mimics real CLI output. Optional blinking cursor.

**Profile 05 — Relatable Text Card**
Background `#0A0B0F` — no decoration, no grid, no orbs. Geist 900, centered, 90–140px. One or two sentences maximum. No tags. No logo in card body (logo in meta-bar only). Mint on one word or phrase maximum.

**Profile 06 — Data Receipt**
Background `#0A0B0F` or `#11131A`. JetBrains Mono throughout. Two-column layout: label left (text-mute), value right. Thin 1px row dividers. Header: `[shoprift migration report]` or `// JOB COMPLETE`. Mint on totals row only.

**Profile 07 — Before/After Split**
Two columns, 1px vertical divider `rgba(255,255,255,0.10)`. Left (BEFORE): `#11131A` bg, `#FF4444` accent. Right (AFTER): `#0A0B0F` bg with subtle mint glow, `#00E5A0` accent. Column headers in JetBrains Mono.

**Profile 08 — Pain Hook Card**
Background `#0A0B0F`, no decoration. Geist 800, 80–100px. Red `#FF4444` on the painful word or number. No CTA, no logo prominence. Optional `→ swipe` prompt in text-mute at bottom.

**Profile 09 — Testimonial / Quote Card**
Background `#0A0B0F` with 5% mint glow. Instrument Serif italic, 48–72px for the quote. Large mint quotation marks. Attribution in JetBrains Mono text-mute. Only with a real customer quote — never fabricated.

---

## VISUAL ASSET INVENTORY

### Carousels (HTML — open in browser, export via ↓ PNG buttons)

| ID | File | Profile | Status | Topic |
|----|------|---------|--------|-------|
| C01-V1 | `output/content/carousel-01-v1-terminal.html` | 01 Dark Terminal | ✅ Ready | Brand launch / how it works |
| C01-V2 | `output/content/carousel-01-v2-gradient.html` | 02 Gradient Mesh | ✅ Ready | Brand launch / awareness |
| C01-V3 | `output/content/carousel-01-v3-editorial.html` | 03 Editorial Serif | ✅ Ready | Milestone / Product Hunt |
| C01-BRAND | `output/content/carousel-01-brand-launch.html` | — | 📋 Review before use | Legacy — evaluate before posting |
| C02 | `output/content/carousel-02-why-migrate.html` | 01 Dark Terminal | ✅ Ready | Why migrate from dm2buy |
| C03 | `output/content/carousel-03-how-it-works.html` | 01 Dark Terminal | ✅ Ready | How it works step-by-step |
| APP-ICON | `output/content/app-icon.html` | — | ✅ Ready | Shopify App Store icon · 1200×1200px |
| APP-PREV | `output/content/app-store-previews.html` | — | ✅ Ready | 5× App Store preview images · 1600×900px · Dark theme |
| APP-PREV-L | `output/content/app-store-previews-light.html` | — | ✅ Ready | 5× App Store preview images · 1600×900px · Light theme (matches actual app UI) |

**All carousels have:**
- Per-slide ↓ PNG download at 2× scale (2160×2700px, Instagram-quality)
- ↓ Download All as ZIP via JSZip
- Download buttons disabled until fonts load (prevents mis-rendering)
- S-mark SVG logo in every meta-bar (no dot)

**To export:** Open the HTML file in a browser → click ↓ PNG per slide or ↓ Download All for ZIP.

### Card Templates Not Yet Built

Profiles 04–09 are built on demand. When building a new card type, use the visual specs in the Per-Profile section above and the full profile reference at `.claude/skills/shoprift-content/references/design-profiles.md`. Save output to `output/content/` with descriptive filename. Add to this inventory table after building.

---

## CHANGELOG

| Date | Change | File(s) affected |
|------|--------|-----------------|
| 2026-06-03 | Created carousel-01-v1 (Dark Terminal), v2 (Gradient Mesh), v3 (Editorial Serif) | `output/content/carousel-01-v*.html` |
| 2026-06-03 | Added per-slide PNG + ZIP download buttons to all 5 carousels | `output/content/carousel-0*.html` |
| 2026-06-03 | Replaced dot with S-mark SVG in carousel-02 and carousel-03 | `output/content/carousel-02/03.html` |
| 2026-06-03 | Created 9 design profiles reference | `.claude/skills/shoprift-content/references/design-profiles.md` |
| 2026-06-03 | Created DESIGN.md initial version | `DESIGN.md` |
| 2026-06-03 | Refactored DESIGN.md — removed marketing content (moved to MARKETING.md), expanded visual specs per profile, added asset inventory | `DESIGN.md` |
| 2026-06-03 | Built app icon (1200×1200px, S-mark gradient on void, html2canvas download) | `output/content/app-icon.html` |
| 2026-06-03 | Built 5 App Store preview images (1600×900px each, download per-image + ZIP) — Scan, Verify, Migrate, Complete, Shopify admin mockup | `output/content/app-store-previews.html` |
| 2026-06-03 | Built light-theme App Store previews (5 × 1600×900px) matching actual app UI — URL, Verify, Plan, Payment, Import progress screens | `output/content/app-store-previews-light.html` |

---

*File: DESIGN.md | Maintained by: /shoprift-content skill + manual updates*
*Cross-reference: MARKETING.md (distribution strategy) → CLAUDE.md (engineering) → `.claude/skills/shoprift-content/references/design-profiles.md` (full profile reference)*
