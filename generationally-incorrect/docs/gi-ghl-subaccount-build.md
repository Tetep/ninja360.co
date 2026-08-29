# GI Sub-Account Build — Click-Path Spec
### For execution inside GoHighLevel (app.ninja360.net) · not executable from this repo

> **Why this doc exists instead of being built automatically:** the coding session that
> maintains `public/gi/site/` has no GoHighLevel connector or API access — GHL sub-accounts,
> custom fields, forms, pipelines, workflows, user roles, and QR codes are not files this repo
> can touch. This is the exact click-path so whoever is at the GHL keyboard (Tim, or Erik/Gabe
> once logged in) can execute it section by section. Confirm each section before moving on,
> per the `ninja360-ghl-builder` skill's operating rules.
>
> **Sub-account status:** already created (per Tim, 2026-08-29) — Steps 2–4 below build inside it.

---

## SECTION 1 · Sub-Account Settings (verify, don't recreate)

Confirm the existing sub-account matches:

| Setting | Value |
|---|---|
| Name | Generationally Incorrect |
| Timezone | America/Chicago |
| Business email | hello@generationallyincorrect.com *(placeholder until domain is live)* |
| Snapshot | None loaded — clean account |

### CONFIRM ✓ before Section 2

---

## SECTION 2 · Custom Fields

### Click Path
Settings → Custom Fields → **+ Add Field** → new folder **GI Show** → Contact object.

### Field 1 — GI Generation
| | |
|---|---|
| Type | Dropdown (Single) |
| Options (plain hyphens, exact) | Silent Generation (1928-1945) · Baby Boomers (1946-1964) · Generation X (1965-1980) · Millennials (1981-1996) · Generation Z (1997-2012) · Generation Alpha (2013-2024) · Generation Beta (2025-2039) |

### Field 2 — GI Topic Choices
| | |
|---|---|
| Type | Checkbox (Multiple) |
| Options (31, exact order) | AI · Cancel Culture vs. Accountability · Censorship in Schools and Libraries · Climate Change Responsibility Across Generations · College: Necessary Investment or Overpriced Tradition? · Dating Apps and Modern Relationships · Drugs and Alcohol · Education · Family · Free Speech vs. Harmful Speech · Homeownership: Dream, Trap, or Impossible Goal? · Immigration and National Identity · Leadership · Marriage: Outdated Institution or Still Essential? · Medicine and Health Care · Mental Health Awareness vs. Overdiagnosis · Money · Political Corruption · Political Correctness · Racism · Religion · Remote Work vs. Returning to the Office · Should Children Have Smartphones? · Social Media · Student Loan Forgiveness · The Decline of Religion in Public Life · Traditional Masculinity and Femininity · Transgenderism · Trust in Government, Media, and Institutions · Women's Rights · Work Ethic: Hustle Culture vs. Work-Life Balance |

**This exact list is already live in code** at `public/gi/site/be-on-the-show/index.html` (`GI_TOPICS` array) — the on-site form and the GHL field will produce identical option strings once the webhook below is wired.

### CONFIRM ✓ before Section 3

---

## SECTION 3 · Tags

Lowercase, no `gi ` prefix (whole sub-account is GI).

| Tag |
|---|
| `generation: silent` |
| `generation: boomer` |
| `generation: gen x` |
| `generation: millennial` |
| `generation: gen z` |
| `generation: alpha` |
| `generation: beta` |
| `shortlisted` |
| `source: northland` |
| `source: chamber` |
| `source: aca` |
| `source: realtor` |
| `source: social` |
| `source: card` |

Let the workflow (Section 6) create these on first fire, or pre-create under Settings → Tags.

### CONFIRM ✓ before Section 4

---

## SECTION 4 · Form — "Contestant Signup V01"

### Click Path
Sites → Forms → Builder → **+ Add Form** → name `Contestant Signup V01`.

### Fields (in order, all required)
| Order | Field | Maps to |
|---|---|---|
| 1 | Full Name | Contact name |
| 2 | Phone | Contact phone |
| 3 | Email | Contact email |
| 4 | Select Your Generation | GI Generation |
| 5 | Topics you're comfortable discussing | GI Topic Choices |

### Style
Background `#efe4cd` · text `#17140f` · submit button `#b4231f`.

### After publishing
Grab the form's embed URL and either:
- **(a)** paste it as an iframe into `public/gi/site/be-on-the-show/index.html` in place of the custom `<form>`, or
- **(b)** grab the sub-account's inbound-webhook URL for the workflow below and paste it into `GI_CONTESTANT_WEBHOOK` at the top of that page's script — the existing branded page keeps working and posts straight into GHL.

Either wiring satisfies the spec. **(b) is the smaller change** since the branded page, its copy, and its topic list already exist.

### CONFIRM ✓ before Section 5

---

## SECTION 5 · Pipeline — "Contestants V01"

### Click Path
Opportunities → Pipelines → **+ Create Pipeline** → name `Contestants V01`.

### Stages (in order)
1. New Signup
2. Shortlisted
3. Invited
4. Booked
5. Appeared
6. Not a Fit

### CONFIRM ✓ before Section 6

---

## SECTION 6 · Workflow — "Signup Intake V01"

### Click Path
Automation → Workflows → **+ Create Workflow** → Start from Scratch → name `Signup Intake V01`.

### Trigger
Form Submitted → `Contestant Signup V01`

### Actions (in order)
1. **Tag from URL param:** read `?src=` on the submission page, map to `source: <value>` if it matches one of `northland / chamber / aca / realtor / social / card`.
2. **If/Else on GI Generation** → add the matching `generation: *` tag (7 branches).
3. **Create opportunity:** Contestants V01 → stage **New Signup** (name: contact name).
4. **Internal notification** → email/SMS to Erik + Tim: "New GI contestant: {{contact.name}} — {{contact.gi_generation}}".
5. **SMS to contact:** "Thanks for signing up for Generationally Incorrect! If you're picked for an upcoming episode, Erik will reach out personally. — The GI Crew"
6. **No contact-facing email step.** SPF/DKIM/DMARC isn't live on `generationallyincorrect.com` yet — see Flags below.

Save → **Publish** → submit one test signup and confirm: tags applied (including a source tag if you test with `?src=`), card in New Signup, notification received, SMS delivered.

### CONFIRM ✓ before Section 7

---

## SECTION 7 · Smart Lists

Contacts → Smart Lists → **+ New**, one filter each:

| List | Filter |
|---|---|
| All Signups | (no filter — everyone in the GI account) |
| Boomers | Tag = `generation: boomer` |
| Gen X | Tag = `generation: gen x` |
| Millennials | Tag = `generation: millennial` |
| Gen Z | Tag = `generation: gen z` |
| Shortlisted | Tag = `shortlisted` |
| Invited/release unsigned | Pipeline stage = Invited AND no signed release on file |

### CONFIRM ✓ before Section 8

---

## SECTION 8 · Users

Both assigned at agency level, restricted to the Generationally Incorrect sub-account only.

### Erik Juergensen — role: User
| Permissions ON | Permissions OFF |
|---|---|
| Contacts · Opportunities · Conversations · Calendars · Forms/Submissions · Workflows (view) | Settings · Billing · Payments · Reputation · Reporting · Websites/Funnels |

He picks contestants and messages them from his phone. Nothing else.

### Gabe Miller — role: User
| Permissions ON | Permissions OFF |
|---|---|
| Contacts (view) · Opportunities (view) · Calendars | Everything else |

Production scheduling visibility, no outreach.

### Tim Petet — Admin, full access.

Both log in at `app.ninja360.net` and land in the GI sub-account. Same credentials work in the LeadConnector mobile app for phone access.

### CONFIRM ✓ before Section 9

---

## SECTION 9 · QR Codes

Build as **GHL native (dynamic)** QR codes — not static images — so the destination URL can be repointed once the domain moves off the Dojo without reprinting anything.

One per source slug, each pointing at `https://dojo.ninja360.co/gi/site/?src=<slug>`:

| Slug | URL |
|---|---|
| northland | `https://dojo.ninja360.co/gi/site/?src=northland` |
| chamber | `https://dojo.ninja360.co/gi/site/?src=chamber` |
| aca | `https://dojo.ninja360.co/gi/site/?src=aca` |
| realtor | `https://dojo.ninja360.co/gi/site/?src=realtor` |
| social | `https://dojo.ninja360.co/gi/site/?src=social` |
| card | `https://dojo.ninja360.co/gi/site/?src=card` |

**The `?src=` passthrough is already live in code** on `be-on-the-show/index.html` — it reads the param client-side and tags submissions `source: <slug>` even before the GHL workflow's own param-tagging (Section 6, Action 1) is wired, so nothing is lost either way.

---

## Flags (not solved here — report timeline, don't attempt to fix)

- **New sub-account = new phone number + new A2P/SMS registration.** That's a carrier-side review, typically days not minutes. SMS actions in Section 6 (notify + confirm) won't fire until that clears — budget for it before promising Erik phone alerts on day one.
- **Email sending domain should be `generationallyincorrect.com`, not `ninja360.net`.** No SPF/DKIM/DMARC is live there yet, which is why Section 6 deliberately omits a contact-facing email step. Get those DNS records in place before any email campaign, including the eventual "welcome" send this spec has always parked behind that blocker.
