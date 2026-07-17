# The Ninja-360 Dojo

Private strategy portal for Tim Petet and the Ninja-360 crew (Gabe, Pavan, Erik).
StoryBrand SB7 arc through seven numbered rooms. Home = a dojo wall under a torii,
lined with doors. Each door leads to one part of the plan.

**Framework:** Astro 4 (content collections + View Transitions) · vanilla-JS islands · no framework dependency.
**Deploys to:** Cloudflare Pages at `ninja360.co` (private / noindex).
**Design lock:** orange dominant. No red. No gold. Wordmark only.

---

## Getting started

```powershell
# Install once
npm install

# Local dev at http://localhost:4321
npm run dev

# Build static site into ./dist
npm run build

# Preview the build locally
npm run preview
```

Requires Node 18.14+ (Astro 4 minimum).

---

## Editing content (no-dev workflow)

**All room copy lives in `src/content/rooms/*.md`.** One file per room. Frontmatter
holds the structural fields; the body is the room's content. A non-dev can edit
the words without touching a single component.

Frontmatter schema (enforced by `src/content/config.ts`):

| Field | Type | Purpose |
|---|---|---|
| `doorNum` | string | "01"…"07" — shown in the door lintel |
| `doorLabel` | string | "The Gate", "War Room", etc. |
| `title` | string | Big H2 at top of the room |
| `subtitle` | string | Small text below the door name on the wall |
| `order` | number | Position on the wall (1–7) |
| `guide` | enum | `sensei` / `creative` / `architect` / `ally` — which lil-ninja leads |
| `accent` | enum | `orange` (default) or `deep` — door lintel color |
| `variant` | enum | `content` (default) / `crew` / `floor` — page template |
| `cta` | string? | Bold-italic action line at bottom. Supports `**bold**`. |
| `ref` | string? | Small "Full detail: …" reference note at the bottom. |
| `parked` | bool | (reserved for Someday tiles) |

Bodies are Markdown with inline HTML allowed — so the reference layout
(stat rows, grid boxes, pills) drops in without invention.

**The Crew and Floor rooms** have dedicated Astro pages (`src/pages/crew.astro`,
`src/pages/floor.astro`) because their layouts diverge from the standard content
template. Their markdown files still hold the intro copy and metadata.

### Editing the Crew page (Gabe / Pavan / Erik)

Each partner doorcard is its own markdown file in `src/content/partners/`.
Edit the file — the page redraws with no code touches.

```
src/content/partners/
├─ gabe.md
├─ pavan.md
└─ erik.md
```

Frontmatter schema (from `src/content/config.ts`):

| Field | Type | Purpose |
|---|---|---|
| `name` | string | "Gabe" |
| `role` | string | "Creative Director" |
| `avatar` | enum | `sensei` / `creative` / `architect` / `ally` — which lil-ninja chip renders on the card |
| `order` | number | Display order on the Crew page |
| `pitch` | string | One-line framing (renders above the quote) |
| `say` | string | The italic quote in the orange box |

Add a new person? Drop a fourth file with a new `order` value.

---

## Architecture

```
src/
├─ content/
│  ├─ config.ts              schema for the rooms collection
│  └─ rooms/*.md             one file per room (edit these)
├─ layouts/
│  └─ DojoLayout.astro       html shell · fonts · top bar · footer
├─ pages/
│  ├─ index.astro            the dojo wall (home)
│  ├─ [room].astro           dynamic route — vision · money · assets · forge · alliance
│  ├─ crew.astro             three-doors layout
│  └─ floor.astro            calendar + mission board (with localStorage)
├─ components/
│  ├─ TopBar.astro           sticky nav with all room links
│  ├─ Footer.astro
│  ├─ Torii.astro            SVG torii for the home page
│  ├─ Door.astro             wall door (variants: default / floor / parked)
│  ├─ RoomHead.astro         back link + kicker + h2 + guide chip
│  ├─ Guide.astro            dispatcher — renders the right lil-ninja
│  └─ avatars/
│     ├─ Sensei.astro        Tim (drone / master belt)
│     ├─ Creative.astro      Gabe (camera / clapperboard)
│     ├─ Architect.astro     Pavan (gears / wrench-katana)
│     └─ Ally.astro          Erik (headphones / mic — allied silhouette)
└─ styles/
   ├─ tokens.css             brand tokens as CSS variables
   └─ base.css               reset + typography + component classes
```

### Islands (interactive components)

`floor.astro` includes two vanilla-JS islands with **localStorage persistence**:

1. **Calendar** — 7-day weekly view. Mon and Fri highlighted. Every cell is
   `contenteditable`; state saved to `localStorage['dojo:cal:v1']`.
2. **Mission Board** — editable table. Status chip cycles Queued →
   In Motion → Shipped ★ on click. Live "stars shipped" counter.
   State saved to `localStorage['dojo:board:v1']`. **+ Add mission** appends
   a blank row.

**Later:** swap the `load()` / `save()` helpers in `floor.astro`'s inline script
for a Google Calendar sync (Calendar) and a Google Doc / GHL board mirror
(Mission Board). The data layer is deliberately kept behind those two functions.

---

## Deploying to Cloudflare Pages

The simplest path:

1. Push this repo to GitHub (private).
2. In Cloudflare Pages: **Create a project → Connect to GitHub → pick this repo**.
3. Build settings:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** 20 (Environment variable `NODE_VERSION=20`)
4. Add the custom domain `ninja360.co` under Pages → Custom domains.
5. Under Cloudflare **Access** (Zero Trust), gate the site to the crew's emails
   only — it's private per the brief.

Since `robots.txt`-level indexing isn't the security boundary, the page also
carries `<meta name="robots" content="noindex, nofollow">`.

---

## Design tokens (LOCKED)

Defined in `src/styles/tokens.css` — do not deviate:

| Token | Value | Use |
|---|---|---|
| `--orange` | `#F47920` | primary — headbands, CTAs, dominant accent |
| `--deep` | `#E05F00` | hover / active / kicker text |
| `--charcoal` | `#3D3D3D` | body copy, hoods, bar background |
| `--gray` | `#404040` | secondary text |
| `--warm` | `#F9F7F5` | subtle surface fills |
| `--line` | `#E0DCD8` | hairlines |
| `--white` | `#FFFFFF` | base background |

Role accents (four guides):

| Guide | Color var | Meaning |
|---|---|---|
| Sensei (Tim) | `--role-sensei` (`#F47920`) | full orange — the leader |
| Creative (Gabe) | `--role-creative` (`#C74A1F`) | deeper amber — his belt on his ninja |
| Architect (Pavan) | `--role-architect` (`#7A5A2E`) | bronze — systems |
| Ally (Erik) | `--role-ally` (`#3D3D3D`) | charcoal — partner, cooler tone |

Fonts loaded via Google Fonts in `DojoLayout.astro`:

- **Display:** Barlow Condensed (600/700/800)
- **Body:** Source Sans 3 (400/600/700 + italic 400)

---

## Not built (intentional, per brief)

- **Strategic copy authoring** — placeholder copy is drawn from the reference file.
  A separate author fills the slots. Update `src/content/rooms/*.md` to change words.
- **Analytics / tracking** — none.
- **Logo image** — wordmark only.
- **Backend / real-time sync** — the mission board is local-only for now. The
  data layer is designed to swap in later.
