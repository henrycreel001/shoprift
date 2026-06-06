# Shoprift — Design Profiles Reference
> Read this before generating any carousel, single post, or visual asset.
> Each profile defines: what it looks like, when to use it, which account it belongs to, and what content it CANNOT carry.

---

## PROFILE HIERARCHY — @tryshoprift / @shoprift (brand account)

Priority order for the grid. Higher number = rarer, more impactful when it appears.

```
Tier 1 (weekly): Carousel Dark Terminal, Data Receipt, Pain Hook
Tier 2 (2×/month): Carousel Gradient Mesh, Before/After Split
Tier 3 (monthly): Carousel Editorial Serif, Relatable Text Card
Tier 4 (as earned): Testimonial/Quote Card (only with real customer data)
```

**Grid rule:** No two consecutive posts from the same profile. Dark Terminal and Gradient Mesh cannot appear back-to-back.

---

## PROFILE HIERARCHY — @mayankmalikx (founder account)

```
Tier 1 (daily/near-daily): Relatable Text Card, Terminal/CLI Card, Data Receipt
Tier 2 (2×/week): Pain Hook Card, Behind-the-scenes screenshot
Tier 3 (weekly): Carousel (any variant), Before/After Split
Tier 4 (as earned): Testimonial/Quote Card
```

---

## THE 9 DESIGN PROFILES

---

### 01 — CAROUSEL: DARK TERMINAL
**File:** `carousel-01-v1-terminal.html` and all future carousels matching this system

**Visual signature:**
- Background: `#0A0B0F` with subtle 60px grid overlay (25% opacity white)
- Logo: S-mark (mint mono) + "shoprift" Geist 900 in top-left meta-bar
- Slide counter: JetBrains Mono, text-mute, top-right
- Tags: `// label` format, JetBrains Mono, mint, all-caps
- Headlines: Geist 800–900, large, tight letter-spacing (-0.045em)
- Accent: Instrument Serif italic for emotional/poetic moments only
- Cards: `#11131A` elevated background, 1px line borders
- Glow orbs: 7–9% opacity mint and blue radials

**When to use:**
- Primary educational content (how it works, what moves, steps)
- Product feature explanation
- First carousel on any new topic
- Lead post for a new content series

**Account:** @shoprift primarily. @mayankmalikx only for founder-voice carousels.

**Content it carries well:**
- Step-by-step flows
- Feature grids (2×2 cards)
- Stat cards with context
- Comparison tables (manual vs. Shoprift)
- Pricing explanation

**Content it CANNOT carry:**
- Memes or humor (grid kills the tone)
- Casual/lowercase founder voice
- Pure emotional hooks with no data
- Testimonials (use Profile 09 instead)

---

### 02 — CAROUSEL: GRADIENT MESH
**File:** `carousel-01-v2-gradient.html` and variants matching this system

**Visual signature:**
- Background: `#0A0B0F` base with large radial gradient blobs (mint 18% + blue 18%, 700–900px radius)
- Logo: same S-mark mint mono + "shoprift"
- Cards: `rgba(255,255,255,0.03)` glass — dark but slightly elevated
- Tags: plain uppercase, Geist medium (not JetBrains Mono — more casual)
- Headlines: Geist 900, gradient text (`#00E5A0 → #6B8AFF`) on key words
- Copy: lowercase OK, shorter sentences, more casual register
- No grid overlay — the blobs provide the texture

**When to use:**
- Awareness and discovery content (someone seeing Shoprift for the first time)
- Hook-first carousels where the visual grabs before the copy
- Reposts of existing terminal carousels (use as the second pass, different vibe)
- Instagram Reels cover image (the gradient reads better as thumbnail)
- Stories

**Account:** @shoprift secondary feed. Good for Stories. Works on @mayankmalikx for big announcements.

**Content it carries well:**
- "Are you stuck on dm2buy?" awareness hooks
- Speed stats (the gradient makes numbers pop)
- Simple before/after
- Launch announcements

**Content it CANNOT carry:**
- Dense technical explanation (too many blobs = hard to read long copy)
- Multiple data tables
- Anything that needs to look authoritative/serious (editorial v3 instead)

---

### 03 — CAROUSEL: EDITORIAL SERIF
**File:** `carousel-01-v3-editorial.html` and variants matching this system

**Visual signature:**
- Background: `#060608` — darker than brand void. No grid. No glow orbs. Clean darkness.
- Primary display: Instrument Serif italic, large (88–120px for headlines)
- Body: Geist 400/500 (NOT 900 — restraint is the point)
- Structure: thin 1px horizontal rules (`rgba(255,255,255,0.07)`) as dividers
- Decorative: large faded page numbers (240px, 2% opacity Instrument Serif)
- Mint: used ONCE per slide maximum — one word, one line, one number. Never fill.
- No gradient text except the final CTA mark

**When to use:**
- Product Hunt gallery images
- LinkedIn posts (if ever used)
- Brand announcement moments (submission day, launch day)
- Premium/partnership-adjacent content
- When content is poetic, emotional, or milestone-based

**Account:** @shoprift milestone posts. Product Hunt exclusively. Not for regular feed cadence.

**Content it carries well:**
- Brand statements ("The rift between storefronts.")
- Milestone announcements
- Single powerful stats with narrative
- Testimonial quotes (Instrument Serif is ideal for quotes)
- Pricing when framed as a commitment, not a transaction

**Content it CANNOT carry:**
- How-to / technical flows (use Terminal instead)
- Casual Gen-Z content (whiplash against the aesthetic)
- Dense feature grids
- Anything that needs urgency

---

### 04 — TERMINAL / CLI CARD
**Not yet built. Build on demand.**

**Visual signature:**
- Background: pure `#000000` or `#0A0B0F`
- Font: JetBrains Mono exclusively — NO Geist, NO Instrument Serif
- Color: green (`#00E5A0` or `#00FF88`) text on black — monochrome
- Content looks like a real command-line output or log stream
- Optional: blinking cursor `_` or `█` at end
- Fake but plausible: `[✓] scanning products... 25 found`, `[→] downloading images... 63/63`, `[✓] migration complete. 2m 31s`

**When to use:**
- Developer/indie-hacker audience content
- Building-in-public technical updates
- "Here's what Shoprift actually does under the hood" posts
- Reddit screenshots repurposed for Instagram
- Saturday/Sunday when dev audience is online

**Account:** @mayankmalikx primarily. @shoprift occasionally for "behind the product" content.

**Content it carries well:**
- Migration log output (fake but accurate)
- Technical "how it works" without graphics
- Stats formatted as terminal output
- Building-in-public code snippets (aesthetic, not functional)

**Content it CANNOT carry:**
- Anything that needs to be readable to non-technical people
- Marketing copy or CTAs (breaks the aesthetic)
- Pricing (feels wrong in terminal format)

---

### 05 — RELATABLE TEXT CARD
**Not yet built. Build on demand.**

**Visual signature:**
- Background: `#0A0B0F` — pure, no decoration, no grid, no orbs
- Text: Geist 900, centered, very large (90–140px)
- One or two sentences maximum — the text IS the entire post
- No tags, no logo in card body (logo only in tiny meta-bar)
- Mint used on one word or phrase maximum
- Optional thin accent line (1px, full width) above or below text

**Example content:**
- "dm2buy has no export button."
- "You built 200 products. They're not exportable."
- "your competitors moved to shopify 6 months ago."
- "one url. your entire store. other side. done."

**When to use:**
- Hook posts that start a series (slide 1 of a future carousel)
- High-reach organic content (simple = shareable = saves)
- When the point is so clear it needs no design
- Response to a DM or comment trend ("this is the question I keep getting")
- Late-night/casual posting slot

**Account:** @mayankmalikx primarily (lowercase, founder voice). @shoprift only when the statement is brand-aligned and sentence-case.

**Content it carries well:**
- Pain point one-liners
- Bold product claims backed by numbers
- Founder observations
- Building-in-public revelations

**Content it CANNOT carry:**
- More than 2 sentences (breaks the format)
- Anything requiring context (standalone only)
- Technical explanations

---

### 06 — DATA RECEIPT
**Not yet built. Build on demand.**

**Visual signature:**
- Background: `#0A0B0F` or `#11131A`
- Looks like a structured receipt, terminal output, or Supabase table screenshot
- JetBrains Mono throughout — columns aligned, monospaced precision
- Two-column layout: label left (text-mute), value right (text or accent)
- Thin 1px rules between rows
- Header: `[shoprift migration report]` or `// JOB COMPLETE`
- Mint accent on the totals row only

**Example content:**
```
// migration report — kiwiishop
---
store url         kiwiishop.dm2buy.com
products          25
collections       5
images            63
image failures    0
migration time    2m 31s
status            [✓] complete
---
charge            one-time
subscription      none
```

**When to use:**
- Result posts after real migrations
- "Week 1 numbers" posts
- After any milestone (100 products migrated, 10 stores done, etc.)
- When building trust with skeptical buyers ("show your work")

**Account:** Both. @shoprift for the polished version. @mayankmalikx for raw Supabase screenshot versions.

**Content it carries well:**
- Real migration stats
- Install/usage numbers (blur sensitive data)
- Pricing breakdown formatted as line items
- Before/after time comparison as table

**Content it CANNOT carry:**
- Emotional hooks (format is clinical, not emotional)
- Brand awareness content (requires prior Shoprift knowledge)

---

### 07 — BEFORE/AFTER SPLIT
**Not yet built. Build on demand.**

**Visual signature:**
- Two columns, hard vertical divider (1px, rgba 10%)
- Left (BEFORE): `#11131A` bg, red `#FF4444` accent, all the pain listed
- Right (AFTER): `#0A0B0F` bg with subtle mint glow, green `#00E5A0` accent, the resolution
- Column headers: `// by hand` vs `// shoprift` in JetBrains Mono
- Same line items in both columns — parallel structure, different outcomes
- Time/cost at bottom of each column — big, gradient vs red

**When to use:**
- Conversion-focused content (people close to buying)
- Carousel slide as a comparison slide (not standalone)
- Ad creative if ever running paid (most scannable format)
- When someone asks "why not just do it manually?" publicly — screenshot-worthy response

**Account:** @shoprift for the polished version. @mayankmalikx for the founder explanation version.

**Content it carries well:**
- Manual migration vs. Shoprift migration
- dm2buy limitations vs. Shopify capabilities
- Cost of time comparison
- Any binary choice where one option is clearly better

**Content it CANNOT carry:**
- Nuanced topics where there's no clear winner
- Anything requiring more than 6 line items per column

---

### 08 — PAIN HOOK CARD
**Not yet built. Build on demand.**

**Visual signature:**
- Background: `#0A0B0F`, no decoration
- Single large statement — Geist 800, 80–100px, takes most of slide
- Red `#FF4444` used strategically on the painful word or number
- No CTA, no logo prominence — the pain speaks first
- Optional: small `→ swipe` prompt in text-mute at bottom

**The hook formula:**
- State the specific situation: "You're on dm2buy."
- Name the specific pain: "You have 200 products."
- Expose the trap: "There's no export button."
- Nothing else. End there. Let them swipe.

**When to use:**
- First slide of any carousel (bait the swipe)
- Standalone post designed to get comments ("is this you?")
- Start of a two-part series (pain today, solution tomorrow)
- When a specific pain point is trending in DMs or comments

**Account:** Both. @shoprift uses sentence case. @mayankmalikx can use lowercase for more personal delivery.

**Content it carries well:**
- The 5 core Shoprift pain points (no export, ceiling hit, image fragility, payment limits, international block)
- Any situation where the audience will see themselves
- Questions framed as statements

**Content it CANNOT carry:**
- Solutions (save that for the next post)
- Pricing or CTAs (kills the tension)
- More than 3 sentences

---

### 09 — TESTIMONIAL / QUOTE CARD
**Not yet built. Only use when real customer data exists.**

**Visual signature:**
- Background: `#0A0B0F` with subtle mint glow (very faint, 5%)
- Instrument Serif italic for the quote itself (48–72px)
- Quotation marks: large, mint, Instrument Serif
- Attribution: JetBrains Mono, text-mute, below quote — store name (with permission) or "early user"
- Stats if available: migration time, product count — in mint, small, below attribution

**When to use:**
- ONLY when a real customer gives permission to share their result
- After install #1, #5, #10 — each milestone deserves one
- Pinned post potential — strongest trust signal

**Account:** @shoprift for polished format. @mayankmalikx for raw DM screenshot approach.

**Content it carries well:**
- Customer quotes about the migration experience
- Specific outcomes ("saved me 3 days of work")
- Before/after framed through a real person's words

**Content it CANNOT carry:**
- Fabricated or paraphrased testimonials — never
- Generic praise without specifics — too vague to build trust

---

## FORMAT × ACCOUNT MATRIX

| Profile | @shoprift | @mayankmalikx | Frequency |
|---------|-----------|---------------|-----------|
| 01 Dark Terminal | Primary | Occasional | Weekly |
| 02 Gradient Mesh | Secondary | Launch/announcements | 2×/month |
| 03 Editorial Serif | Milestones only | Almost never | Monthly |
| 04 Terminal/CLI | Rare (behind-the-scenes) | Primary | Weekly |
| 05 Relatable Text | Sentence case | Lowercase primary | Weekly |
| 06 Data Receipt | Polished version | Raw screenshot version | Weekly (post-launch) |
| 07 Before/After | Yes | Yes | 2×/month |
| 08 Pain Hook | Yes | Yes | Weekly |
| 09 Testimonial | Yes | Yes | As earned |

---

## GRID COHERENCE RULES

1. All profiles use dark background — this is the non-negotiable anchor
2. Mint (`#00E5A0`) appears in every post — at minimum as one element
3. S-mark logo appears in every @shoprift post
4. No two consecutive posts from the same profile on the same account
5. Gradient Mesh (02) and Editorial Serif (03) never appear in the same week — they pull in opposite directions
6. Terminal/CLI (04) is the only profile that can break the Geist/Instrument Serif font rule (JetBrains Mono only)
7. Data Receipt (06) is the only format that can be screenshot-raw from Supabase without redesign

---

## CONTENT MOMENT → PROFILE MAP

| Situation | Profile to use |
|-----------|---------------|
| New follower first impression | 01 Dark Terminal or 02 Gradient Mesh |
| Announcing submission to App Store | 03 Editorial Serif + 05 Relatable Text (pair) |
| Launch day | 02 Gradient Mesh (energy) + 06 Data Receipt (proof) |
| Technical audience (devs, indie hackers) | 04 Terminal/CLI |
| Someone asking "what is this?" | 01 Dark Terminal (how it works carousel) |
| Someone asking "should I trust this?" | 06 Data Receipt + 09 Testimonial |
| Pain point awareness content | 08 Pain Hook (hooks) → 01 Dark Terminal (explanation) |
| Competitor comparison | 07 Before/After |
| Viral/broad reach attempt | 05 Relatable Text |
| Product Hunt gallery | 03 Editorial Serif |
| Instagram Reels cover | 02 Gradient Mesh |
| Stories | 02 Gradient Mesh (color reads at small size) |
| Real customer result | 09 Testimonial + 06 Data Receipt |
| Week 1/Month 1 update | 06 Data Receipt (@shoprift) + 05 Relatable Text (@mayankmalikx) |

---

*File: .claude/skills/shoprift-content/references/design-profiles.md | Last updated: 2026-06-03*
*This file is read by the shoprift-content skill. Update when new design profiles are created or existing ones evolve.*
