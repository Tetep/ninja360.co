# Generationally Incorrect — Build & Design Spec
> **Purpose of this file:** A self-contained specification for a coding agent (Claude Code) to build the
> Generationally Incorrect brand site + capture funnel. Everything needed — design tokens, components,
> routes, SEO rules, and integrations — is defined here. No external context required.
>
> **Status:** Draft v1 · July 2026 · Source of truth for the web build.
---
## 0. Project Overview
**Generationally Incorrect** is a video-first debate podcast: four generations (Gen Z, Millennial, Gen X,
Boomer) discuss charged topics to contrast generational bias, with the explicit goal of finding common
ground or changing a perspective. Co-produced by Erik Jerguson (Lucky 13), Gabe Miller (Lucid Cinematics),
Tim Petet (Ninja 360 Digital Media).
**Taglines:** "Every generation has something to fight about." / "Because the truth isn't always age-appropriate."
**What we're building here:** the marketing site at `generationallyincorrect.com` whose jobs are, in priority order:
1. Convert borrowed attention (viral clips) into owned contacts via the **Question of the Week** opt-in.
2. Host every episode as an **SEO landing page** (question-as-title + transcript) for search/YouTube discovery.
3. Present the brand + sell membership/sponsorship.
**Primary conversion goal:** email/SMS signups. Everything else supports that.
---
## 1. Design Tokens
Implement as CSS custom properties (or the framework's theme equivalent). These are the canonical values.
```css
:root {
  /* Core palette */
  --gi-ink:        #111318; /* primary background / text-on-light */
  --gi-bone:       #F2EDE1; /* light background / text-on-dark */
  --gi-red:        #E23B2E; /* signal / accent / CTA — "danger + newsprint" */
  --gi-amber:      #EBA83A; /* secondary accent — retro/warmth */
  --gi-teal:       #2E9AA6; /* generational spectrum accent — use sparingly */
  /* Support neutrals */
  --gi-panel:      #171A21; /* raised surface on dark */
  --gi-panel-2:    #1D212A; /* secondary surface */
  --gi-line:       #2A2E37; /* hairline borders on dark */
  --gi-muted:      #8F8B7F; /* de-emphasized text */
  --gi-soft:       #C9C4B6; /* body text on dark */
  --gi-green:      #57B66E; /* success / "available" states only */
  /* Radius / spacing rhythm */
  --gi-radius:     12px;
  --gi-radius-sm:  8px;
  --gi-space:      8px;   /* base unit; use multiples */
  --gi-maxw:       920px; /* content column */
}
```
**Color usage rules**
- Black + white(bone) + red is the *core identity*. Amber and teal are **accents only** — never dominant.
- Red is reserved for accents, CTAs, and "signal" moments. Do not use red for large fill areas or body text.
- Default theme is **dark** (ink background). Support a light section variant using bone as background.
- `--gi-green` is for availability/success UI states only, never brand decoration.
**Contrast/accessibility:** all text must meet WCAG AA (4.5:1 body, 3:1 large). Bone-on-ink and ink-on-bone
pass; red-on-ink is for large/bold text and UI accents only, not small body copy.
---
## 2. Typography
```css
:root {
  --gi-font-display: Anton, Impact, "Arial Narrow Bold", sans-serif; /* masthead, H1, titles */
  --gi-font-cond:    Oswald, "Arial Narrow", Arial, sans-serif;       /* kickers, labels, buttons */
  --gi-font-serif:   Georgia, "Times New Roman", serif;               /* taglines, pull-quotes (italic) */
  --gi-font-body:    "Helvetica Neue", Arial, system-ui, sans-serif;  /* body, UI */
}
```
- **Display** (Anton/Impact): uppercase, tight letter-spacing (`0.01em`), used for the wordmark, H1, section
  headers. Heavy, poster-like.
- **Condensed** (Oswald): uppercase, wide tracking (`0.06em–0.34em`) for kickers ("EPISODE 04"), labels,
  button text.
- **Editorial serif** (Georgia italic): taglines and pull-quotes only. Adds the "newspaper op-ed" voice.
- **Body** (Helvetica/Arial): 15–16px, line-height 1.6, color `--gi-soft` on dark.
Load Anton + Oswald via self-hosted webfonts or Google Fonts. Impact/Arial Narrow are the system fallbacks
so the brand never breaks if fonts fail.
**Type scale (rem, 16px base):** H1 2.75 · H2 1.5 · H3 1.0 (uppercase amber) · body 0.95 · small 0.8.
---
## 3. Logo & Brand Assets
Six concept directions exist (see the logo experiment sheet artifact). The build should support a **final
logo delivered as SVG** with these hard requirements:
- **Primary lockup:** horizontal wordmark, on-dark and on-light variants.
- **Avatar/mark:** must be legible inside a **48px circle** (podcast/social avatar) — this is the acceptance
  test for any logo. Provide a simplified `GI` monogram version for favicons and avatars.
- **Formats to output:** `logo-primary.svg`, `logo-mark.svg`, `favicon.svg` + `favicon.ico`, `og-image.png` (1200×630).
- **Clear space:** minimum padding around the mark = height of the "G".
**Recommended direction (pending sign-off):** *The Redaction* — "GENERATIONALLY" over "INCORRECT" inside a
red censor bar. One-color capable, instantly readable, on-brand for "truth that got struck out."
Second choice for merch/stamp use: *The Versus Badge* (circular GI emblem).
**Hashtag / short brand:** `#GenIncorrect`. Short domain `genincorrect.com` redirects to primary.
---
## 4. Component Specs
Build these as reusable components. All are dark-theme by default with a light-section variant where noted.
| Component | Spec |
|---|---|
| **Masthead / nav** | Sticky top. Wordmark left; nav right (Episodes, About, Membership, Sign Up CTA). CTA button uses `--gi-red`. |
| **Hero** | H1 display wordmark, rotating tagline, primary CTA → Question of the Week form. Optional muted cold-open video loop background. |
| **Kicker** | Condensed uppercase, `--gi-amber`, wide tracking. Precedes section headers. |
| **Section header (H2)** | Display uppercase with a 5px `--gi-red` left border, `padding-left:14px`. |
| **Episode card** | Thumbnail (16:9), pillar tag pill, question title (display), generation-seat avatars, runtime, play/permalink. |
| **Pill / tag** | Rounded, 10.5px bold. Variants: `pillar` (amber), `available` (green), `sensitive` (red) for Third Rail. |
| **The Four Seats** | 4-card row: Gen Z / Millennial / Gen X / Boomer, each with age range + one-line role. |
| **Producer trio** | 3-card row: Erik/Lucky 13, Gabe/Lucid, Tim/Ninja 360 with roles. |
| **Pull-quote** | Georgia italic, large, `--gi-bone`, red vertical rule. For "common ground" moments. |
| **Signup form** | See §6. The single most important component. |
| **Footer** | Producer credits, social links, legal, secondary signup. |
**Interaction:** subtle only — 150ms ease transitions, hover states lift/brighten surfaces by ~6%. No heavy
animation. Respect `prefers-reduced-motion`.
---
## 5. Site Architecture / Routes
```
/                     Home — hero, latest episode, the format, four seats, signup, producer trio
/episodes             Episode index — filterable by pillar, newest first
/episodes/[slug]      Episode template — THE SEO PAGE (see §7). slug = kebab-case of the question
/about                The show, the mission (common ground), the four seats, the three producers
/membership           Ad-free, extended "Third Rail" cuts, vote the topic/guest — pricing tiers
/question-of-the-week Standalone opt-in landing page (also embedded on / and every episode page)
/contact              hello@generationallyincorrect.com + sponsor inquiry
/sponsor              (Phase 2) sponsor one-pager + media kit download, "reach N opted-in [generation]"
```
**Content pillars** (used as episode taxonomy + filters): The Big Questions · Work · Tech · Success & Money
· Culture · Leadership · Family & Community · Third Rail *(flagged advertiser-sensitive; membership/YouTube-first)*.
---
## 6. Signup Funnel — Integration Spec
The funnel converts attention → owned contact. Backend is **GoHighLevel (GHL)**.
**Lead magnet:** *The Question of the Week* — subscribers get the big question before the episode drops,
can answer, and best answers are read on air.
**Form fields** (order matters):
1. First name — text, required
2. Email — email, required
3. **Which generation are you?** — select, required. Options: `Gen Z`, `Millennial`, `Gen X`, `Boomer`, `Other`. **This field is the monetization key — it segments the entire list by cohort for sponsors.**
4. Phone — tel, optional (SMS opt-in with explicit consent checkbox)
**Behavior**
- Submit posts to GHL (embedded GHL form/iframe **or** custom form → GHL inbound webhook/API).
- On success: inline confirmation + trigger GHL "welcome + current question" email and SMS opt-in confirm.
- Apply GHL tags on submit: `src-web`, plus source param passthrough (`src-tiktok`, `src-youtube`, etc. from
  UTM/`?src=`) and `generation-[value]`. Preserve UTMs through the funnel.
- Honeypot + rate-limit for spam. GDPR/CAN-SPAM compliant consent language near submit.
**Tag taxonomy (shared with content system):** `src-*` (acquisition source), `generation-*` (cohort),
`topic-*` (pillar interest). Every contact inherits where + why they arrived.
---
## 7. SEO Spec (Episode Pages)
Each episode page is a discovery asset. Requirements:
- **`<title>` and H1 = the literal episode question** (e.g., "Is Work-Life Balance a Myth?"). This is the
  string people type into Google *and* YouTube.
- **Slug** = kebab-case of the question (`/episodes/is-work-life-balance-a-myth`).
- **Above the fold:** embedded video (YouTube), audio player, one-paragraph summary, the four participants.
- **Full transcript** rendered on-page (collapsible), server-rendered for crawlability.
- **Structured data:** `PodcastEpisode` + `VideoObject` JSON-LD; `BreadcrumbList`; FAQ schema for sub-questions.
- **Open Graph + Twitter cards** per episode (custom OG image with the question + brand).
- **Internal linking:** each page links to its pillar hub and 2–3 related-question episodes.
- **Performance:** SSR/SSG, lazy-load video, Core Web Vitals green. Target Lighthouse ≥ 90 all categories.
**Keyword rule:** the domain does NOT carry keywords — content does. Do not build keyword-stuffed pages;
build one clean question-page per episode and let long-tail search demand accrue there.
---
## 8. Domains
- **Primary:** `generationallyincorrect.com` (canonical, verified available July 2026).
- **Support/redirect:** `generationallyincorrect.tv`, `.co`, `.net` → 301 to primary.
- **Short:** `genincorrect.com` → 301 to primary (bio links, merch, print).
- **Email:** `hello@generationallyincorrect.com`.
- Enforce HTTPS, canonical tags to the `.com`, www→apex (or apex→www) consistently.
---
## 9. Recommended Tech Stack
Optimize for SEO (SSR/SSG), fast iteration, and easy GHL embedding.
- **Framework:** Next.js (App Router) or Astro — both give SSG/SSR + great Core Web Vitals. Astro is lighter
  if the site stays mostly content; Next.js if membership/interactive grows.
- **Styling:** Tailwind CSS with the §1 tokens mapped to theme, or plain CSS with the custom properties above.
- **Content:** MDX or a headless CMS (Sanity/Contentful) for episodes; each episode = one content entry with
  fields: question, slug, pillar, video ID, audio URL, summary, transcript, participants, publish date.
- **Forms/CRM:** GoHighLevel (embed or API). Do not build a custom email backend — GHL owns list + automation.
- **Hosting:** Vercel or Netlify. CI on push.
- **Analytics:** GA4 + the platform-native (YouTube/Spotify) dashboards; pass UTMs to GHL.
*(This is a recommendation, not a mandate — swap equivalents freely, but preserve the SEO/SSR and GHL-integration constraints.)*
---
## 10. Definition of Done (Phase 1)
- [ ] Design tokens (§1) + typography (§2) implemented as theme; dark default + light section variant.
- [ ] Final SVG logo (primary + mark + favicon + OG) wired in; passes the 48px avatar test.
- [ ] Home, /episodes, /episodes/[slug], /about, /question-of-the-week routes live.
- [ ] Episode template meets full SEO spec (§7) with JSON-LD, transcript, OG images.
- [ ] Signup form (§6) posts to GHL, applies tags, fires welcome automation; generation field required.
- [ ] Domains + redirects + HTTPS + canonicals configured (§8).
- [ ] Lighthouse ≥ 90 (Perf/SEO/A11y/Best-practices); WCAG AA contrast verified.
- [ ] Responsive 320px → desktop; `prefers-reduced-motion` respected.
---
## Appendix A — What we worked on (decision log)
- **Name locked:** Generationally Incorrect (was mis-titled "Generational Incorrect"). Two taglines chosen.
- **Premise locked:** 4 generations, contrast bias, goal = common ground / change a perspective. This is
  also the editorial guardrail that keeps it advertiser-safe.
- **Producers:** Erik Jerguson (Lucky 13, creative/host), Gabe Miller (Lucid Cinematics, production),
  Tim Petet (Ninja 360, growth/distribution). In-house full stack = margin story.
- **Availability verified (2026-07-21):** `.com` available, YouTube `@generationallyincorrect` open,
  no existing same-name podcast. IG/TikTok/FB/X to confirm at signup.
- **Format = "Brown Belt" build tier:** full pro operation, sponsor-ready, automation-run.
  Episode anatomy: cold open → signature Opener → topic → steel-man round → common-ground closer → CTA.
- **Content engine:** 1 episode → ~40 assets; pillars double as season/SEO taxonomy.
- **Funnel:** Question of the Week; GHL form with the generation-segmentation field as the key asset.
- **Domain strategy:** brand-first (exact `.com` + `.tv`/`.co`/short redirect); keywords live in content,
  not the URL.
## Appendix B — Open decisions (block final build)
1. Logo direction — pick 1–2 of the 6 concepts to finish.
2. Panel format — fixed core / all-rotating / hybrid (recommended: fix one voice per generation and rotate a 4th guest seat).
3. Equity split & roles → drives LLC + any member-area billing.
4. Cadence — weekly vs bi-weekly → drives episode volume + calendar.

---
## Appendix C — Relationship to the Ninja-360 Dojo `/gi` Show Room

This spec describes the **standalone marketing site** for `generationallyincorrect.com`.
The Dojo's `/gi` page (`public/gi/index.html` in this repo) is a separate, smaller thing: an **internal
mission-control page** for the three producers to track open decisions and react to the logo concepts. As of
2026-07-25, `/gi` has been re-themed to use this spec's §1 design tokens and §2 typography
(ink/bone/red/amber/teal, Anton/Oswald/Georgia) for its own content, while keeping the Dojo's shared
site-wide nav bar for wayfinding.

**As of 2026-08-11 the site build exists** at `public/gi/site/` in this repo, served at `/gi/site/` on the
Dojo (linked from the `/gi` shelf). It implements §1–§7 as a self-contained static build with relative
links, so the folder can be lifted verbatim to the `generationallyincorrect.com` root when domains (§8) get
wired. Launch state honestly reflects pre-episode reality: the episode index shows the in-production docket,
the SEO episode page lives at `episodes/_template/` (noindexed) awaiting the first real episode, and every
page ships `noindex` while mounted under the private Dojo — each head carries a LAUNCH CHECKLIST comment
listing the flips (robots, canonical, GHL webhook). The §6 form is live UI: it posts to the
`GI_GHL_WEBHOOK` constant in `assets/gi-site.js` once a GHL inbound-webhook URL is pasted there; until
then submits fall back to a prefilled email to `hello@generationallyincorrect.com` so no contact is lost.
Wordmark uses §3's recommended direction (The Redaction), pending final logo sign-off (Appendix B №1).

The six logo concepts referenced in §3 live at `public/assets/gi/logos/concept-sheet.html` in this repo
(the original, unstyled artifact) and are reproduced inline on `/gi`'s Logo Call section.
