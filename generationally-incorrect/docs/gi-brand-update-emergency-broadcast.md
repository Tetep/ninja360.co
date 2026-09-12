# GI Brand Update — Emergency Broadcast Direction
### Locked-in-progress · August 29, 2026 · supersedes the "Redaction" logo direction and old dark palette

> Filed into the repo 2026-08-29 as the visual source of truth for the `/gi/site/` build.
> Supersedes `gi-brand-build-spec.md` §1 (tokens), §2 (typography) and §3 (logo direction);
> that spec's §4–§10 (components, routes, SEO, funnel) still govern.

## The logo — DECIDED, Sep 12 2026 (supersedes the section below)
Tim delivered the official master art: a circle-slash "no mic" mark over bold
black GENERATIONALLY / red brushstroke Incorrect / "—PODCAST—" / tagline.
Tim's own framing — **"this [is] v02, I expect a v03"** — so treat it as
current, not final.

Actual delivered art differs from the placeholder spec below: opaque (cream
background baked in, not transparent) and native ~16:9 (3840×2160), not
960×818. `public/gi/site/assets/logo.png` holds it at 1600×900 for the site;
`favicon.png` is a square icon-only crop of just the circle+mic. Applied
sitewide — masthead, favicon, the be-on-the-show logo card, OG image — per
the swap-slot comments this doc originally planned for. The Emergency
Broadcast HTML/CSS test-pattern card described below is retired; it was
always a stand-in for master art that hadn't landed yet.

<details><summary>Superseded — the placeholder plan (kept for the record)</summary>

**"Emergency Broadcast" test pattern:** vintage TV test-pattern card on aged newsprint.
"EMERGENCY BROADCAST" bar up top · GENERATIONALLY in heavy black caps ·
INCORRECT in red brushstroke across it · "— PODCAST —" beneath. Fallout-poster energy.
Master art was assumed to be `logo.png` (960×818, transparent PNG) from the
intro-animation kit — the site rendered an HTML/CSS recreation with a
commented swap slot in each page until real art landed.

</details>

## The palette (NEW — replaces the old ink/bone/red tokens)
| Token | Old | **New** |
|---|---|---|
| Background / paper | #F2EDE1 bone | **#efe4cd aged paper** (paper is now the DEFAULT bg, not dark) |
| Ink / text | #111318 | **#17140f warm ink** |
| Red accent | #E23B2E | **#b4231f broadcast red** |
| Deep bg (video/intro) | — | **#0d0906** near-black brown |

Texture language: paper grain, double-rule ink borders, handwriting, red pen marks.

## Typography (from the intro kit)
- **Anton** — display caps (unchanged)
- **Special Elite** — typewriter face for labels/body accents (new)
- **Kalam** — handwritten face for questions/answers/marks (new)

## The intro animation (exists, built in Claude Design)
6 scenes, 1920×1080, ~30s loop: Broadcast (static + tone + logo slam) → What Generation Are You? →
What Would You Disagree About? → How Does the Panel Grade You? (red B−) → tagline flourish →
Outro (YouTube/Spotify + GenerationallyIncorrect.com + "sign up or be a contestant").
Assets: logo.png, paper.png, pen.png, broadcast.wav. Source: `Generationally Incorrect Intro.dc.html` + intro.jsx.

## Where it goes
1. **Site hero** — the intro loop (muted autoplay) or the logo card as the hero of generationallyincorrect.com. *(✅ logo card live on `/gi/site/` as of 2026-08-29; video slot commented in `public/gi/site/index.html`.)*
2. **Signup form header** — the logo card above the GHL contestant form (Section 3 of the build). *(✅ live on `/gi/site/be-on-the-show/`.)*
3. **Dashboard mockup** — restyle to this palette (paste-ready note below).
4. **Episode cold-opens** — the Broadcast scene doubles as the show's video intro sting.

## Paste into the Design Studio ("Podcast UI mockups") to update the mockups
> Brand update: new locked direction. Palette: paper #efe4cd is now the default background,
> ink #17140f, red #b4231f, deep #0d0906 for video surfaces. Fonts: Anton (display),
> Special Elite (labels), Kalam (handwritten accents). The logo is a vintage TV test-pattern
> card: "EMERGENCY BROADCAST" bar, GENERATIONALLY in black caps, INCORRECT in red brushstroke,
> "— PODCAST —" beneath. Restyle all dashboard screens: light aged-paper theme with ink text
> and red accents, paper-grain texture, double-rule ink borders instead of dark panels.

## Still open
- 2-of-3 vote on this logo direction (Erik ✓ implied by test video? confirm · Gabe · Tim) — log it in Creative Approvals.
- Test-video audio fix (mic distance/room, Gabe's lane) before more shorts go out.
