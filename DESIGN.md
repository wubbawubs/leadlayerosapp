# LeadLayer OS — Design System

Two surfaces, one brand. The operator app and the client portal share a font family and accent color. Everything else is audience-specific.

---

## Core Principles

1. **Opinion over average.** Every AI-generated UI converges to the statistical mean. LeadLayer's design decisions are explicit and rule-bound — that's what makes them look intentional.
2. **Accent under 10%.** The orange appears on focus rings, primary CTAs, active nav indicators, and live status dots. Nowhere else. When it appears, it means something.
3. **No drop shadows.** Elevation is expressed through the surface ladder — stepping up one level in the color stack, not by casting light.
4. **Deltas on every number.** A bare metric is a mockup. A metric with a delta (+2 vs last month) is a tool.
5. **Density where operators are, sparsity where clients are.** Operators live in this tool all day. Clients open it between jobs on a phone in the sun.

---

## OPERATOR SURFACE (Dark)

### Surface Ladder — 4 steps, no shadows

```
--canvas:           #0D0E10    base — the page background
--surface:          #161719    cards, panels
--surface-elevated: #1E1F22    hover states, active rows, input backgrounds
--surface-overlay:  #28292D    dropdowns, tooltips, modals
```

Never use `bg-card/60 backdrop-blur` as elevation. Use the next step in the ladder.

### Text Hierarchy — 3 opacity levels

```
--text-primary:   #F5F5F5               headings, numbers, active labels
--text-secondary: rgba(255,255,255,0.55) body copy, descriptions, metadata
--text-tertiary:  rgba(255,255,255,0.30) timestamps, placeholders, disabled
```

Don't change text color for hierarchy — change opacity. This keeps the palette clean.

### Accent (LeadLayer Orange)

```
--accent:       #E8913A    active nav bar, primary CTA, live dot, focus ring
--accent-hover: #F0A050    hover state only
--accent-muted: rgba(232,145,58,0.15)  background tint for accent-heavy zones
```

**Rule:** Orange appears on ≤10% of any viewport. If you're tempted to use it on a label, a badge, or a section header — don't.

### Status Colors

```
--status-green:  #27A644    healthy, on track, won
--status-amber:  #E8B94A    attention needed, pending review
--status-red:    #E54D4D    at risk, failed, urgent
```

Status tints (for card backgrounds):
```
--status-green-tint: rgba(39,166,68,0.08)
--status-amber-tint: rgba(232,185,74,0.08)
--status-red-tint:   rgba(229,77,77,0.08)
```

### Borders

```
1px solid rgba(255,255,255,0.06)   standard card border
1px solid rgba(255,255,255,0.10)   elevated surface border
```

### Border Radius

```
4px   inputs, badges, chips
6px   small cards, pills
8px   standard cards, panels
12px  large panels (reserved, use sparingly)
```

Never use `rounded-xl` (16px) or `rounded-2xl` (24px) in the operator app — this is the #1 "AI template" tell.

### Typography

```
Font:       Plus Jakarta Sans
Display:    font-display font-semibold tracking-tight   (headers, names)
Body:       font-sans font-normal                        (copy, descriptions)
Data:       font-mono text-xs uppercase tracking-widest  (section labels ONLY)
Numbers:    font-display font-bold                        (metrics, counts)
```

**Rule:** `font-mono uppercase tracking-widest` is reserved for section-level labels only (ACTION QUEUE, CLIENT HEALTH). Not action types, not badge text, not inline labels.

### Dashboard Layout Pattern

```
KPI strip (4 metrics, each with delta)
Action queue (dense rows, color-coded by action type)
Client health (compact cards with inline actions)
```

No decorative headlines. No atmospheric gradient glows. The data IS the headline.

### Action Type Color Coding

```
🟡 amber dot   review_brief, review_opt_brief    — needs your eyes
🔵 blue dot    create_draft, apply_optimization   — system can execute
🟠 orange dot  publish_draft, retry_delivery      — ready to ship
```

### Interaction Density

Every row in the operator app should have at least one inline action. The cursor should never be at a dead end. "OPEN →" alone is never enough.

---

## CLIENT SURFACE — "Paper" (v3, matches leadlayer.studio)

Different audience. Different rules entirely. The customer-facing surfaces
(landing, auth, client portal, public reports) mirror the marketing site:
warm paper, charcoal panels, amber accents, editorial typography.

**Context:** Tradespeople. Checked on a phone between jobs. Outdoor, bright sun. 30 seconds at most. The question they're asking: "Is this working?"

**Implementation:** wrap the page in `.paper` (pins every semantic token —
immune to the operator `.dark` theme). The `__root.tsx` inline script also
skips dark mode entirely on customer routes. Tokens live in `styles.css`.

### Portal architecture — "charcoal frame, paper sheet"

The client portal (`ClientShell`) frames every page in charcoal: masthead
(brand + inline nav + sign out) and a page **hero** slot — greeting, one huge
editorial number (count-up animated), status sentence, progress. The paper
sheet slides up over the frame (rounded top, hairline) and carries the
content: an editorial stat band (hairline-divided, not boxed), then a
two-column grid on desktop (main flow left, rail right with report /
numbered next steps / how-it-works). Mobile gets a charcoal bottom tab bar.
Never render the portal as a single centered column on desktop.

### Language

The portal and public reports speak the client's language: `tenant.geo`
NL → Dutch (informal "je"), US → English. All copy lives in
`src/lib/shared/clientPortal/portalCopy.ts` — never hardcode portal strings
in components. Server-generated labels (activity feed, period labels) are
localized in `clientPortal.functions.ts`. Currency follows geo (EUR/USD).

### Surface (Paper)

```
--paper-base:        #F5F0E8    page background — warm cream, never white/gray
--paper-raised:      #FBF7EE    cards, headers          (.paper-card)
--paper-subtle:      #EDE6D8    chips, icon wells, secondary fills
--paper-inset:       #E8DFD0    progress tracks, inputs wells
--paper-line:        #DDD4C2    hairline borders        (.rule-hair)
--paper-line-strong: #C4B89E    emphasized borders, inputs
```

### Charcoal panel (`.surface-charcoal`)

Dark editorial band for the hero moment (goal card, report masthead).
Flips `--ink`/`--paper-*` automatically, so `text-ink`, `bg-paper-inset`,
`label-mono` etc. just work inside it.

```
--charcoal: #2D2D2D   panel    --charcoal-soft: #353535   raised
--charcoal-deep: #1F1F1F inset --charcoal-line: #3D3D3D   borders
--ondark: #F5F0E8  --ondark-2: #B5AEA3  --ondark-3: #7A7670
```

### Text (ink scale)

```
--ink:   #1A1A1C    primary — readable in direct sunlight
--ink-2: #5A554E    secondary, metadata
--ink-3: #8C8884    tertiary, timestamps
```

Minimum body text size: **15–16px**. Metadata: **13–14px**. The one
exception is `.label-mono` (11px mono uppercase section kicker — the
editorial label from the studio site). The client is often 45+ reading
a phone.

### Accent + Status

```
--amber:        #D97706    primary accent, CTAs, active nav
--amber-bright: #F59E0B    numbers on charcoal
--amber-deep:   #B45309    links, icons on paper
--amber-signal: #E85D04    urgent, live
--paper-success: #1F7A36   won leads, revenue
--paper-danger:  #B23A3A   at risk
--paper-info:    #2F5A75   new leads
```

### Signature elements

- **`.cta-shear`** — the sheared-parallelogram CTA (brand mark shape).
  Charcoal, hover amber. Variants: `-amber`, `-success`, `-sm`.
  One per screen.
- **`.label-mono`** — 11px mono uppercase kicker above every section.
- **`.rule-hair`** — hairline rules instead of boxes where possible.
- **Numbered lists** (`01` `02` `03` in mono amber) for "coming next" /
  "next actions" — never bullet dots.
- **Radius: 4px.** Sharp and editorial. Chips 3px. Never rounded-full
  except progress bars and status dots.

### Layout Rules

- **Cards, not tables.** Every list is a stack of cards on mobile. Tables never.
- **One CTA per screen.** The client should never wonder what to tap.
- **Goal progress is the hero** — a charcoal panel, first thing they see.
- **3 big numbers with deltas** — Leads / Revenue / Pages Live. ROI proof.
- **Activity feed before "coming next"** — clients care what happened, not what's planned.
- **Bottom tab nav** (mobile) — not sidebar, not top nav.
- **Phone numbers are `tel:` links, emails are `mailto:`** — tap to call back.

### Anti-patterns for Client Surface

```
❌ Pure white or cool gray backgrounds (paper is warm)
❌ Gradient fills or glow effects
❌ rounded-full filter pills, rounded-xl cards (the AI-template tell)
❌ Charts that require explanation
❌ Small text (< 13px) except .label-mono
❌ Tables (use cards)
❌ Operator language ("execution artifacts", "masterplan items", "briefs")
❌ More than 4 tabs
❌ Feature-heavy sections the client didn't ask for
```

---

## Shared Rules

- **Fonts:** operator = Plus Jakarta Sans; paper surfaces = Hanken Grotesk
  (closest free match to the site's Neue Montreal), set automatically by `.paper`
- **The layered-parallelogram mark** is the brand thread — it recolors to
  amber inside `.paper` via the `--accent` override
- **No drop shadows** on either surface — structure through surface color and hairlines
- **Empty states always have a CTA** — never dead text alone

---

## AI Prompt Rules (for future AI-assisted development)

When generating any UI for LeadLayer, enforce:

1. No `rounded-xl` or `rounded-2xl` in operator app
2. No `backdrop-blur` or `glassmorphism` effects
3. No gradient fills on cards or headers
4. No atmospheric glow blobs behind page titles
5. No `uppercase tracking-widest` on anything except section labels
6. Accent color on ≤10% of any view
7. Every metric must have a delta or comparison
8. Every list row must have at least one inline action
9. Elevation = stepping to the next surface level, not `shadow-lg`
10. Text hierarchy = opacity levels, not different colors

Providing this file at the start of any AI session will prevent token drift and keep output consistent with the LeadLayer system.
