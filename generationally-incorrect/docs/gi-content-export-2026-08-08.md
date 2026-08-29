# Generationally Incorrect — Content Export

> **Filed into the repo 2026-08-29.** This is the **content source of truth** for the GI site build at
> `public/gi/site/`. Where site copy and this export disagree, this export wins — except on visual
> direction (see the staleness note below).
>
> **⚠️ §1 "Color tokens" and "Typography" in this export are STALE.** They record the pre-Emergency-Broadcast
> dark palette (ink/bone/#E23B2E, Anton/Oswald/Georgia). As of 2026-08-29 the locked direction is aged paper
> `#efe4cd` / warm ink `#17140f` / broadcast red `#b4231f`, with Anton / Special Elite / Kalam — see
> `gi-brand-update-emergency-broadcast.md`. Everything else in this export stands.
>
> **Q5 in §9 is now answered:** the interim GI site is hosted at `dojo.ninja360.co/gi/site/` (a path on the
> existing Dojo, not a new subdomain), deployed from this repo via Cloudflare Pages per D14.

---

> **What this is:** every GI fact currently recorded across the Ninja-360 Dojo, extracted into one
> structured package for the clean rebuild of the official Generationally Incorrect site.
> **Extracted:** 2026-08-08 · **Extracted by:** Claude Code
>
> **Rules this file follows:**
> - Nothing here is invented. Every line traces to a source page, cited inline.
> - Where pages disagree, the conflict is recorded — **not resolved**. See §8.
> - A decision is **DECIDED** only where a page explicitly records a lock, vote, or sign-off.
>   A recommendation, a lean, or a "planned" is **OPEN**.

**Sources crawled**

| Source | Path |
|---|---|
| GI Show Room | `public/gi/index.html` |
| GI · Master Plan | `public/scrolls/gi-master-plan/index.html` |
| GI · House Sponsor Spots | `public/scrolls/gi-sponsor-spots/index.html` |
| GI · Next Steps | `public/scrolls/gi-next-steps/index.html` |
| GI · The Ninja-360 Lane | `public/scrolls/gi-ninja-lane/index.html` |
| GI Brand & Build Spec | `generationally-incorrect/docs/gi-brand-build-spec.md` |
| Logo concept sheet | `public/assets/gi/logos/concept-sheet.html` |
| Podcast concepts (episode prompts) | `Gen_Incorrect+FoundinKC/ Erik and Gabe/Generational-Podcast-Concepts.md` *(external — not in this repo)* |

---

## 1 · Brand

### Name
**Generationally Incorrect.** Recorded as locked in the build spec decision log — which also notes the
show was previously **mis-titled "Generational Incorrect."** *(spec Appendix A)*

- Short brand / hashtag: **`#GenIncorrect`**
- Short domain: `genincorrect.com` → 301 to primary *(spec §3, §8)*

### Taglines
Both are in active use across every page — no page picks one as primary.

1. *"Every generation has something to fight about."*
2. *"Because the truth isn't always age-appropriate."*

### Positioning
> "The lane no one owns: between Diary-of-a-CEO production value, Jubilee's structured disagreement, and a
> late-night panel — organized around **age as the axis of conflict**." *(Master Plan §1)*

- **Premise (locked):** four generations contrast their bias on charged topics, with the explicit goal of
  finding common ground or changing a perspective. *(spec Appendix A)*
- **Editorial guardrail:** every episode ends on *"where did we actually agree?"* — the closing ritual is what
  keeps charged topics sponsor-safe. *(Master Plan §1)*
- **Audience:** share-the-clip 25–45s are primary, but the panel spans all four generations so every viewer
  sees someone who thinks like them **and** someone who infuriates them. That tension is the retention
  mechanic. *(Master Plan §1)*
- **Build tier:** "Brown Belt" — full pro operation, sponsor-ready, automation-run. *(spec Appendix A)*

### Voice
**Provocative but principled.** The edge lives in the questions; the warmth lives in the goal.
**Never punch down, never pretend there's one correct answer.** *(Master Plan §1)*

### Color tokens — ⚠️ SUPERSEDED 2026-08-29
Recorded here as the historical v1 palette. **Do not build from this section** — see
`gi-brand-update-emergency-broadcast.md`.

```css
:root {
  /* v1 — superseded */
  --gi-ink:     #111318;  --gi-bone:    #F2EDE1;  --gi-red:     #E23B2E;
  --gi-amber:   #EBA83A;  --gi-teal:    #2E9AA6;
  --gi-panel:   #171A21;  --gi-panel-2: #1D212A;
  --gi-line:    #2A2E37;  --gi-muted:   #8F8B7F;
  --gi-soft:    #C9C4B6;  --gi-green:   #57B66E;
  --gi-radius: 12px; --gi-radius-sm: 8px; --gi-space: 8px; --gi-maxw: 920px;
}
```

**Usage rules that still apply** *(spec §1)* — these carry forward to the new palette:
- Red is for accents, CTAs, and "signal" moments. **Never** large fill areas or body text.
- Green is availability/success UI only, never brand decoration.
- All text meets **WCAG AA** (4.5:1 body, 3:1 large).

### Typography — ⚠️ PARTIALLY SUPERSEDED 2026-08-29
Anton (display) carries forward. Oswald → **Special Elite**, Georgia italic → **Kalam**.

- **Display** (Anton) — uppercase, tight tracking (`0.01em`). Heavy, poster-like.
- **Body** — 15–16px, line-height 1.6.
- **Scale (rem, 16px base):** H1 2.75 · H2 1.5 · H3 1.0 · body 0.95 · small 0.8.
- System fallbacks so the brand never breaks if webfonts fail.

### Logo — ⚠️ SUPERSEDED 2026-08-29
Six v1 concept directions existed and **none was chosen** (Decision D1 below). The v2 "Emergency Broadcast"
test-pattern direction is now locked-in-progress pending the 2-of-3 vote. The v1 concepts remain on record:

| # | Concept | Note |
|---|---|---|
| 01 | **The Redaction** | "INCORRECT" inside a red censor bar. One-color capable. **Was the early lean.** |
| 02 | **The Versus Badge** | Circular GI emblem, lightning bolt splits the monogram. Merch/stamp use. |
| 03 | The Advisory Label | Riffs on the "Parental Advisory / Explicit" sticker. |
| 04 | The Broadcast | CRT set tuned to "GI"; channel range 1946–2012 = the span at the table. |
| 05 | The Spectrum | Mic under an arc of four dots, teal→black. |
| 06 | The Protest Stack | Heavy stacked type like a placard. |

**Hard requirements that carry forward** *(spec §3)*
- Primary lockup: horizontal wordmark, on-dark and on-light variants.
- **The acceptance test:** the mark must be legible inside a **48px circle**. Ship a simplified `GI` monogram
  for favicons and avatars.
- Deliverables: `logo-primary.svg`, `logo-mark.svg`, `favicon.svg` + `favicon.ico`, `og-image.png` (1200×630).
- Clear space: minimum padding = the height of the "G".

**The three tests** *(Show Room, Logo Call)*
1. **Avatar test** — legible tiny. 2. **Merch test** — works in one color.
3. **Stranger test** — says "generational argument" without reading the name.

---

## 2 · Format

### Episode spine
`Cold open → Opener → Topic → Steel-man → Common Ground → CTA` *(Show Room, "Format at a Glance")*

| Segment | Runtime | Job |
|---|---|---|
| **Cold open** | 0:30–1:00 | Sharpest 20 seconds of disagreement, cut in first. Hook before logo. |
| **The Opener** (signature) | 4–6 min | *"What's one belief your generation holds strongly that the others misunderstand?"* Sets positions. |
| **The Topic** | 25–40 min | One pillar question + 4–6 sub-questions. Host steers for contrast, not chaos. |
| **Steel-man round** | 5–8 min | Each generation argues the opposing side's best point. The "change your mind" engine — **most clippable segment**. |
| **Common Ground** | 3–5 min | *"Where did we actually agree?"* The mission delivered, and the warm share. |
| **Outro / CTA** | 0:30 | Sub, next-topic tease, Question-of-the-Week ask. |

**Total:** 45–70 min long-form, **video-first**. *(Master Plan §2)*

### The Four Seats
| Seat | Age range (Show Room) |
|---|---|
| Gen Z | approx. 18–27 |
| Millennial | approx. 28–43 |
| Gen X | approx. 44–59 |
| Boomer | approx. 60+ |

**Panel structure — OPEN.** Recommended (not adopted): fix one recognizable voice per generation as the
home team, rotate the fourth seat for guest draw. *(Master Plan §2, Next Steps decision 2, spec Appendix B)*
⚠️ See §8 conflict C-E — the Master Plan states the hybrid as if operative while the spec lists it as open.

### Content pillars
**Main feed:** The Big Questions · Work · Tech · Success & Money · Culture · Leadership · Family & Community.
Each pillar = a themed run of episodes; doubles as season taxonomy, SEO taxonomy, and sponsor packaging.

**Third Rail** *(handle with care)*: racism, gender, abortion, corruption, drugs. High-reach,
advertiser-sensitive — scheduled as **membership / YouTube-first "special" drops**, never main-feed by
default. *(Master Plan §3)*

### The asset math
**One episode → ~40 assets:** 1 long-form anchor · 8–15 captioned shorts · 3–5 quote cards ·
1 common-ground audiogram · 1 email · 1 SEO/transcript page. *(Master Plan §3)*

### Clip philosophy
> **"Which 20 seconds makes someone tag a family member?"**
> The entire editing and social brief in one sentence. Clip **recognition**, not the loudest argument.
> Heat gets views — recognition gets shares, and shares grow shows. *(Ninja Lane §3)*

| Type | Name | What it is |
|---|---|---|
| 1 | **The Gap** | Two generations genuinely can't understand each other on something small and relatable — tipping, phone calls, rent. |
| 2 | **The Turn** | Someone's actually persuaded or caught off guard. Vulnerability travels. |
| 3 | **The Line** | One sentence so sharp it works with zero context. |

**The handoff:** Tim flags candidate moments live during recording (timestamps); Lena/Lucid crafts the clips.
**"Tim spots, Lucid crafts."** *(Ninja Lane §3)*

### Publishing rhythm & platforms
- **Anchor drops first, clips drip after.** YouTube long-form + Spotify land together on release day. Then
  3–5 vertical clips over the following two weeks, spaced every 3–4 days, each ending with
  *"full episode on YouTube."*
- **Two content tracks:** episode-driven clips + always-on engagement (polls, generational questions,
  throwbacks) so the feed never goes silent between drops.
- **The Monday load-in:** one sitting, every week — pull the clips, schedule the sequence in GHL.

| Platform | Job |
|---|---|
| YouTube | Anchor + discovery. The tentpole. |
| Spotify | Audio home. |
| TikTok / IG | Clip-hunting for younger audience. |
| Facebook | Where Boomers and Gen X actually are — a feature for this show. |

*No GBP for a podcast. (Ninja Lane §5)*

### Episode-concept bank *(not yet scheduled)*
From `Generational-Podcast-Concepts.md` — five prompt concepts framed as **reveals, not debate topics**:
Loyalty vs. Truth · What do you value · What enrages you · Who do you find inspirational ·
Who do you find repulsive. Includes a full drafted episode, *"Same Question, Four Generations"*, with
round-by-round prompts. **Status: concept doc, no page records it as adopted.**

---

## 3 · People

> ⚠️ **Spelling conflict on Erik's surname — flagged, not resolved.** See §8, conflict C-A.

| Person | Company | Role (GI) | Dojo alias | Spelling status |
|---|---|---|---|---|
| **Erik Juergensen** *or* **Erik Jerguson** | **Lucky 13** | Creative / host. "Studio lane." | Podcast Ninja | ⚠️ **Two spellings in the repo** |
| **Gabe Miller** | **Lucid Cinematics** | Production. "Story lane." | Creative Ninja | ✅ Consistent everywhere |
| **Tim Petet** | **Ninja-360 Digital Media LLC** | Growth / distribution. "Visibility lane." | Head Ninja | ✅ Consistent everywhere |
| **Lena** | Lucid-side | Clip craft — "Lucid crafts" | — | Surname never recorded anywhere |

**Erik surname — exact occurrences as found:**
- `Erik Juergensen` — `public/gi/index.html` (×3), `public/scrolls/gi-ninja-lane/index.html`,
  `public/foundinkc/index.html` (×2), `public/roadmaps/erik/index.html` (×5),
  `src/content/partners/erik.md`, `src/content/rooms/alliance.md`, `src/pages/index.astro`
- `Erik Jerguson` — `generationally-incorrect/docs/gi-brand-build-spec.md` (×2),
  `public/assets/gi/logos/concept-sheet.html`
- Related: GI · Next Steps lists an open loop — *"Erik's emblem redo — corrected spelling; drop-in
  replacement updates every page."* This confirms a **known** spelling problem but **does not state which
  spelling is correct.**

### Partnership structure *(Ninja Lane §1)*
> Three co-producers, **equal thirds**. **Costs before profit, every time:** revenue comes in → each
> partner's company gets paid at pre-agreed, disclosed vendor rates (Lucid edits, Ninja-360 markets,
> Lucky 13 hosts) → what's left splits three ways. All time and hard costs tracked from day one, even while
> unpaid. Rates set once, upfront, in writing — **no per-project haggling, ever.**

- **Show strategy:** shared, three-way vote. *"Odd number, no deadlocks."* *(Ninja Lane §2)*
- **Ninja-360's lane:** full ownership of distribution & social, run through a **dedicated GHL sub-account**
  walled off from client accounts. Bills the show at the disclosed partner rate, transparent invoice, no
  hidden markup — the same rule Lucid follows for editing. Also owns sponsorship bundling (Ninja media
  packaged into sponsor deals; sell **association + content**, not audience numbers; warm local
  relationships first, founding-sponsor status, case studies before cash).

---

## 4 · Funnel

**The principle:** *"Views are rented, the list is owned."* *(Master Plan §5)*
**Primary conversion goal:** email/SMS signups. Everything else on the site supports that. *(spec §0)*

### Lead magnet — The Question of the Week
Subscribers get the big question **before** the episode drops, can answer, and the best answers are read
on air. Free, on-brand, participatory — the audience becomes part of the show.

### The path
`Clip CTA → landing page → one GHL form → weekly nurture → membership → live events → merch`

### Form fields — order matters *(spec §6)*
| # | Field | Type | Required | Note |
|---|---|---|---|---|
| 1 | First name | text | ✅ | |
| 2 | Email | email | ✅ | |
| 3 | **Which generation are you?** | select | ✅ | `Gen Z` · `Millennial` · `Gen X` · `Boomer` · `Other` — **the monetization key**; segments the entire list by cohort for sponsors |
| 4 | Phone | tel | ❌ | SMS opt-in with **explicit consent checkbox** |

> **"The money field."** One dropdown, disproportionate value — the generation field is the thing sponsors
> actually buy. *(Master Plan §5)*

*(Note: the separate **contestant** signup at `/be-on-the-show/` uses the seven-cohort GHL field per
`GI Contestant Signup — GHL Build Spec V01`, not this five-option list. Two different forms, two different
jobs — audience capture vs. casting.)*

### Behavior
- Submit posts to **GoHighLevel** — embedded GHL form/iframe **or** custom form → GHL inbound webhook/API.
- On success: inline confirmation + trigger GHL "welcome + current question" email and SMS opt-in confirm.
- **Honeypot + rate-limit** for spam. GDPR/CAN-SPAM compliant consent language near submit.
- **Preserve UTMs** through the entire funnel.

### Tag taxonomy — shared with the content system
| Prefix | Meaning | Examples |
|---|---|---|
| `src-*` | Acquisition source | `src-web`, `src-tiktok`, `src-youtube` — from UTM / `?src=` passthrough |
| `generation-*` | Cohort | `generation-gen-z`, `generation-millennial`, … (applied from field 3) |
| `topic-*` | Pillar interest | one per content pillar |

*Every contact inherits where + why they arrived.*

### GHL build checklist *(Next Steps, Weeks 3–4)*
Dedicated podcast sub-account · social planner · calendar custom values (pillar / episode # / topic /
status) · source + topic tags · **"Episode Launch" workflow**.

### SEO spec for episode pages *(spec §7)*
- **`<title>` and H1 = the literal episode question** — the exact string people type into Google *and* YouTube.
- **Slug** = kebab-case of the question → `/episodes/is-work-life-balance-a-myth`
- Above the fold: embedded YouTube video, audio player, one-paragraph summary, the four participants.
- **Full transcript rendered on-page** (collapsible), **server-rendered** for crawlability.
- Structured data: `PodcastEpisode` + `VideoObject` JSON-LD, `BreadcrumbList`, FAQ schema for sub-questions.
- Per-episode OG + Twitter cards with custom OG image (question + brand).
- Internal linking: each page → its pillar hub + 2–3 related-question episodes.
- **Keyword rule:** the domain does NOT carry keywords — **content does.**
- Targets: SSR/SSG, lazy-loaded video, Core Web Vitals green, **Lighthouse ≥ 90 all categories**.

### Planned routes *(spec §5)*
```
/                      Home — hero, latest episode, the format, four seats, signup, producer trio
/episodes              Episode index — filterable by pillar, newest first
/episodes/[slug]       Episode template — THE SEO PAGE
/about                 The show, the mission, the four seats, the three producers
/membership            Ad-free, extended "Third Rail" cuts, vote the topic/guest — pricing tiers
/question-of-the-week  Standalone opt-in landing page (also embedded site-wide)
/contact               hello@generationallyincorrect.com + sponsor inquiry
/sponsor               (Phase 2) sponsor one-pager + media kit download
```
*(Built additionally: `/be-on-the-show` — contestant casting, per the GHL intake spec.)*

### Domains & handles — verified 2026-07-21
| Asset | Handle | Status as recorded |
|---|---|---|
| **Domain (primary)** | `generationallyincorrect.com` | Available (RDAP) — register + redirects |
| Support domains | `.tv` · `.co` · `.net` | 301 → primary |
| Short domain | `genincorrect.com` | 301 → primary (bio links, merch, print) |
| Email | `hello@generationallyincorrect.com` | To be set up with the domain |
| **YouTube** | `@generationallyincorrect` | **Open** — the anchor channel |
| Spotify | Generationally Incorrect | Name clear |
| IG / TikTok / FB / X | `@generationallyincorrect` · `@GenIncorrect` | **Bot-blocked — verify by hand at signup.** Fallbacks: `@gen.incorrect`, `@genincorrectpod` |

> **Rule:** lock every handle **in one sitting** before the name leaks. *Consistency beats the perfect string.*
> Also verified: **no existing same-name podcast.** *(spec Appendix A)*

---

## 5 · Sponsor Spots

Three house reads for the partners' own companies on the first episodes — practice for real reads,
promotion for the alliance, and on-air proof the ad format works. **One 60-second read + one 30-second
cutdown each.**

### The two rules
1. **Nobody reads their own company.** *"He's too modest to say it, so I will"* lands warmer — and rehearses
   how the show will cross-promote real sponsors.
2. **We disclose.** *"Full disclosure, this one's ours"* on the first episodes **builds** the trust a paid
   read will later spend. **Drop the disclosure once outside sponsors arrive.**

**Delivery notes:** rotate the reader · end on **one** clean CTA + URL · **60s = mid-roll, 30s = pre/post-roll**
· read it like you're telling a friend about something you own — because you do.

**Full scripts live in `public/scrolls/gi-sponsor-spots/index.html`.**

**Bracket rollup: 13 outstanding items across 3 spots.**
- **Spot 1 · Lucky 13** (read by anyone but Erik) — 🔴 Erik owes: what Lucky 13 does · signature service ·
  who they help · one proof point · URL · CTA/offer **(6)**
- **Spot 2 · Lucid Cinematics** (read by anyone but Gabe) — 🔴 Gabe owes: what Lucid does · who they serve ·
  signature capability · URL · CTA/offer **(5)**
- **Spot 3 · Ninja-360** (read by anyone but Tim) — 🟢 record-ready except: phone number ·
  confirm the free-audit offer as lead CTA **(2)**

---

## 6 · Timeline

> ⚠️ **Two launch arcs exist and they do not match.** Both are recorded below. See §8, conflict C-C.

### 6a · The confirmed arc — 13 weeks to launch
**Source: Tim, 2026-08-08. Supersedes 6b for planning purposes.**

| Phase | Weeks | Scope |
|---|---|---|
| **Foundation / Decisions** | 1–2 | Lock the open decisions |
| **Build** | 3–6 | Site + GHL + studio look |
| **Pilots** | 7–10 | Pilot episodes |
| **Launch** | 11–13 | **Public launch: week of Nov 2–6, 2026** |

*Arithmetic note (flagged, not assumed): counting 13 weeks back from the week of Nov 2–6, 2026 places week 1
on the week of **Aug 3, 2026**. This has **not** been confirmed as the intended week-1 anchor — see §9, Q2.*

### 6b · The original 90-day arc — as recorded on the Master Plan
**Source: `gi-master-plan` §7, dated 2026-07-22. Left untouched; conflicts with 6a.**

| Window | Milestones |
|---|---|
| **W1–2 · Lock** | Logo direction · domain + all handles · entity + operating agreement · panel format |
| **W3–4 · Build** | GHL (calendar, form, tags, Episode-Launch workflow) · landing page + Question-of-the-Week live · studio look with Lucid · book pilot panel |
| **W5–6 · Pilot** | 2–3 pilot episodes · clip templates · sponsor one-pager |
| **W7–8 · Prime** | Batch-record 4–6 · pre-load the calendar · soft-launch to warm networks; start the list |
| **W9–12 · Launch** | Public drops on cadence · membership on · first sponsor conversations · review + iterate |

### The anchor metric *(unchanged, both arcs)*
> The scoreboard isn't episode count — it's **did we hit every date we promised.**
> **Twenty-six solid beats forty flaky.** *(Master Plan §7)*

### This Week *(Next Steps, as recorded)*
- [ ] Register the domain — `generationallyincorrect.com` (+ `.co` / `.tv` as redirects)
- [ ] Claim every handle in one sitting — YouTube, IG, TikTok, Facebook, X, Spotify
- [ ] Set up `hello@generationallyincorrect.com` with the domain
- [ ] Fill the sponsor-spot brackets — Erik, Gabe, Tim
- [ ] Book the pilot panel — lock the four seats for the first shoot

### Open loops *(Next Steps)*
- **Entity + operating agreement** — waits on the equity decision
- **Month-by-month financial model** — waits on equity + cadence
- **Third Rail episodes** — membership / YouTube-first "special" drops only
- **Erik's emblem redo** — corrected spelling; drop-in replacement updates every page

### Open items tracked in the shared partnership doc *(Ninja Lane §7)*
Vendor partner rates agreed and written · profit split confirmed · sponsorship sales + admin/finance owners
named · Lena hourly rate + hour tracking started · strategy coordinator named

---

## 7 · Decisions

**Status rule applied:** DECIDED only where a page explicitly records a lock, vote, or sign-off.

| # | Decision | Status | Evidence | Source |
|---|---|---|---|---|
| D1 | **Logo direction** | 🔴 OPEN | v1: "early lean, pending sign-off." **2026-08-29: v2 Emergency Broadcast is locked-in-progress, pending the 2-of-3 vote.** Still open. | spec App. B · Show Room · brand update |
| D2 | **Panel format** | 🔴 OPEN | *"recommended hybrid"* — a recommendation. ⚠️ Master Plan §2 states it as operative — see C-E. | spec App. B · Next Steps |
| D3 | **Equity & roles** | 🔴 OPEN | *"settle the split so entity + model can finalize."* | spec App. B · Next Steps |
| D4 | **Cadence (weekly vs bi-weekly)** | 🔴 OPEN | **Confirmed OPEN by Tim, 2026-08-08.** See C-B. | Tim 2026-08-08 · spec App. B |
| D5 | **Show name = "Generationally Incorrect"** | 🟢 DECIDED | *"Name locked."* No partner vote named. | spec App. A |
| D6 | **Premise / editorial mission** | 🟢 DECIDED | *"Premise locked."* No partner vote named. | spec App. A |
| D7 | **Producers & lanes** | 🟢 DECIDED | Erik (creative/host), Gabe (production), Tim (growth/distribution). ⚠️ Erik's surname unresolved — C-A. | spec App. A · Show Room |
| D8 | **Two taglines** | 🟢 DECIDED | *"Two taglines chosen."* Both in active use. | spec App. A |
| D9 | **Domain strategy — brand-first** | 🟢 DECIDED | Keywords live in content, not the URL. | spec App. A · §8 |
| D10 | **Third Rail handling** | 🟢 DECIDED | Membership / YouTube-first special drops, never main-feed. | Master Plan §3 |
| D11 | **House sponsor spots + the two rules** | 🟢 DECIDED | Format, rules, scripts recorded; only brackets remain. | Sponsor Spots |
| D12 | **Build tier = "Brown Belt"** | 🟢 DECIDED | Full pro operation, sponsor-ready, automation-run. | spec App. A |
| D13 | **Funnel = Question of the Week on GHL, generation field required** | 🟢 DECIDED | Field order + tag taxonomy specified. | spec §6 · Master Plan §5 |
| D14 | **Website architecture — custom build on Cloudflare Pages, Git-deployed, GHL embedded for forms/calendar/automations. GHL is the engine room, not the website.** | 🟢 DECIDED | ⚠️ Supersedes spec §9's Vercel/Netlify recommendation — C-D. | **Tim, 2026-08-08** |
| D15 | **Creative approvals — GHL "Creative Approvals" pipeline, 2-of-3 partner vote, 72-hour window. The pipeline is the decision log.** | 🟢 DECIDED | Replaces *"voting buttons come later."* | **Tim, 2026-08-08** |
| D16 | **Public launch target — week of Nov 2–6, 2026; Foundation 1–2 / Build 3–6 / Pilots 7–10 / Launch 11–13** | 🟢 DECIDED | ⚠️ Conflicts with the 90-day arc — C-C. | **Tim, 2026-08-08** |
| D17 | **Entity + operating agreement** | 🔴 OPEN | Waits on the equity decision. | Next Steps |
| D18 | **Month-by-month financial model** | 🔴 OPEN | Waits on equity + cadence. | Next Steps |
| D19 | **Vendor partner rates written** | 🔴 OPEN | Open item in shared doc. | Ninja Lane §7 |
| D20 | **Profit split confirmed** | 🔴 OPEN | Structure described, not confirmed. | Ninja Lane §1, §7 |
| D21 | **Sponsorship sales + admin/finance owners named** | 🔴 OPEN | Open item. | Ninja Lane §7 |
| D22 | **Lena hourly rate + hour tracking** | 🔴 OPEN | Open item. | Ninja Lane §7 |
| D23 | **Strategy coordinator named** | 🔴 OPEN | Open item. | Ninja Lane §7 |
| D24 | **Erik's surname spelling** | 🔴 OPEN | Two spellings live in the repo. | See C-A |

**Tally: 11 DECIDED · 13 OPEN.**

---

## 8 · Conflicts Between Sources

> These are recorded as found. **None has been resolved.**

### C-A · Erik's surname — two spellings
- **`Erik Juergensen`** — Show Room, Ninja Lane, Found in KC page, Erik's roadmap, partners content file,
  alliance room, Astro homepage. *(dominant by volume)*
- **`Erik Jerguson`** — the GI brand & build spec (×2) and the logo concept sheet.
- Next Steps records an open loop: *"Erik's emblem redo — corrected spelling."*
- **Not resolved.** Frequency is not evidence of correctness. **Erik must confirm.**

### C-B · Cadence — stated settled in four places, listed as open in two
Show Room decision 4, Next Steps decision 4, Master Plan §7 callout, and Ninja Lane §6 all state
*"twice a month, 3-month sprint, then reassess for weekly."* **Master Plan §8** and **spec Appendix B** list
cadence under open decisions. **No page records a partner vote.** Tim confirmed 2026-08-08 it remains an
**open vote**.

### C-C · Two launch arcs
- **Master Plan §7:** 90-day arc — Lock W1–2 · Build W3–4 · Pilot W5–6 · Prime W7–8 · Launch W9–12.
- **Confirmed 2026-08-08:** 13-week arc landing the week of Nov 2–6, 2026.
- Phases differ in length and count ("Prime" has no equivalent). **Not resolved.**

### C-D · Hosting / stack
- **spec §9:** recommends Vercel or Netlify — explicitly *"a recommendation, not a mandate."*
- **Confirmed 2026-08-08:** custom build, **Cloudflare Pages**, Git-deployed.
- Reads as **supersession rather than true conflict**, but spec §9 text still names Vercel/Netlify.

### C-E · Panel format — open or operative?
- **spec Appendix B** and **Next Steps decision 2** list it as an **open** gating decision.
- **Master Plan §2** states it as operative.
- **Not resolved.** Treated as OPEN because two sources explicitly call it pending.

### C-F · What the standalone site *is*
- **spec Appendix C** (2026-07-25) said the standalone site was *"not yet built"* and gated on Appendix B.
- The 2026-08-08 facts define **how** it gets built without those decisions being closed.
- **Not resolved** — it changes the gating assumption Appendix C was written under.
  *(Update 2026-08-29: the site is now built at `public/gi/site/`, still with D1–D4 open.)*

---

## 9 · Open Questions

| # | Question | Why it matters | Who |
|---|---|---|---|
| Q1 | **Which spelling of Erik's surname is correct — Juergensen or Jerguson?** | Blocks the emblem redo, every credit line, the site's About page, and any legal/entity paperwork. | Erik |
| Q2 | **Is the week of Aug 3, 2026 the intended week-1 anchor for the 13-week arc?** | Everything downstream is dated off it. | Tim |
| Q3 | **Does the cadence vote run through the new Creative Approvals pipeline?** | If the pipeline is the decision log, open decisions should be logged there. | All three |
| Q4 | **Do logo, panel format, and equity go into Creative Approvals too, or only creative assets?** | Determines whether the pipeline is *the* decision system or an asset queue. | Tim |
| Q5 | ~~What subdomain of `ninja360.co` hosts the interim GI site?~~ | **ANSWERED 2026-08-29:** `dojo.ninja360.co/gi/site/` — a path on the existing Dojo, Cloudflare Pages, from this repo. | ✅ |
| Q6 | **Has `generationallyincorrect.com` actually been registered?** | Availability verified 2026-07-21; registration still unchecked as of 2026-08-08. **Weeks of exposure on an unregistered brand name.** | Tim |
| Q7 | **Who is Lena, and what is her role in the GI clip lane?** | Named as clip craft but in no crew listing, unresolved rate. | Gabe |
| Q8 | **Is "Same Question, Four Generations" adopted as the pilot episode?** | A fully drafted episode sitting outside the Dojo, referenced by no page. | All three |
| Q9 | **Which tagline is primary?** | Both recorded as "chosen." A site needs one for `<title>` and OG description. | All three |
| Q10 | **Does the Master Plan's 90-day arc get rewritten to the 13-week arc, or retired?** | Two arcs live in the same shelf. | Tim |

---

## Appendix · Found in KC — separate show, captured for the next-project discussion

> Not part of the GI rebuild. **Sources:** `public/foundinkc/index.html`,
> `public/scrolls/found-kc-playbook/index.html`

- **What it is:** *Found KC — We Put You On The Map.* YouTube-first documentary series; one episode = one
  local KC business rescued from invisibility. **The flagship show.**
- **MAP = the Ninja-360 process: Make · Amplify · Promote.**
- **Closing tagline:** *"You can hire a web developer, a photographer, a videographer… or you can just hire a
  ninja."* Cut to black, every episode.
- **The three-job thesis:** every episode (1) markets the featured business, (2) markets Ninja-360 by
  demonstration — *"no pitch, just proof"*, (3) becomes a permanent case study.
- **StoryBrand rule:** the **owner is the hero**, Ninja-360 is the **guide**.
- **Three-act arc:** **I · The Ache** (cold open, no logo/music, the owner raw to camera; ~0:15 the turn —
  *"So I called somebody"*; title hits **after** the problem is felt) → **II · The Build** → **III · The
  Payoff** (hold on their face — *"that reaction is the most valuable footage in the episode"*).
- **The four rules:** hero is always the owner · Act One stays uncomfortable · every episode is a case study
  disguised as a story · the reveal reaction is sacred footage.
- **Crew lanes:** Tim — story, 360, drone, GBP, distribution · Gabe — cinematography, edit · Erik — studio
  segments only.
- **Status:** Pre-Production, **0 of 4** pre-production steps locked.
- **Three open gates:** studio vs. field split for Ep. 1 · **Gabe's terms ("Gate 0") — blocks his Creative
  Director role across every show** · Episode 1 subject not locked.

> **Note for the discussion:** Gabe's compensation ("Gate 0") blocks Found in KC *and* is adjacent to GI's
> open equity decision (D3). These may be one conversation, not two.

---

*Generationally Incorrect · Content Export · extracted 2026-08-08 from the Ninja-360 Dojo · filed 2026-08-29*
