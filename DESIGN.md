# LeadLayer OS — Design System v5 "Liquid OS"

> **One sentence:** content stays ink on paper; everything you **touch** becomes
> liquid glass.
>
> Full rationale + audit of v3: `docs/DESIGN_V5_LIQUID_GLASS.md`.
> Living specimen of every material and control: **`/design-lab`**.

**Rollout status (2026-07-02):**

| Surface                                              | Status                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| Foundation (materials, motion, GlassButton)          | ✅ live in `styles.css` + `src/components/ui/glass-button.tsx` |
| Client portal chrome (glass dock, aurora hero, CTAs) | ✅ live                                                        |
| Auth pages (GlassButton CTAs)                        | ✅ live                                                        |
| Landing `/` (night canvas + glass)                   | ✅ live                                                        |
| Operator chrome (glass rail/toolbar/tiles)           | ⏳ Phase 3 — **v3 rules below still apply there**              |
| Charts polish, `/demo` rebuild                       | ⏳ Phase 5                                                     |

---

## Core Principles

1. **Three planes, like the mark.**
   - _Plane 0 — canvas:_ a living background. Night surfaces get a drifting
     aurora (`.night` + `.aurora-night`); paper keeps warm cream + grain.
   - _Plane 1 — content:_ ink on surface. Text, metrics, charts. Opaque,
     high-contrast, **never glass**. Readability rules are non-negotiable.
   - _Plane 2 — glass:_ everything interactive — nav, docks, buttons, chips,
     dialogs. Translucent, lit from above, responds to touch.
2. **Elevation is light, not paint.** Higher objects gather more light:
   stronger specular rim, deeper backdrop blur, longer/softer shadow. Use the
   material classes; never ad-hoc `shadow-*`.
3. **Physics, not transitions.** Every interactive element compresses under
   the pointer (`scale 0.965`, 90 ms) and springs back (`--spring`, ~6%
   overshoot). Things _arrive_, they don't appear.
4. **Accent under 10%.** Unchanged from v3. One liquid-amber primary per
   screen. When amber appears, it means something.
5. **Deltas on every number.** Unchanged. A bare metric is a mockup.
6. **Density where operators are, sparsity where clients are.** Unchanged.

---

## Materials (in `styles.css`)

| Class                                               | What                                        | Where                                        |
| --------------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| `.glass`                                            | Dark glass + lensing ring                   | chrome on night/charcoal contexts            |
| `.glass-paper`                                      | Light glass + warm ring                     | chrome on the paper surface                  |
| `.glass-dock` / `.glass-dock-item` (+ `.is-active`) | Floating charcoal-glass tab dock            | client portal mobile nav                     |
| `.night`                                            | Night canvas scope (bg + text + brand vars) | landing, operator (Phase 3)                  |
| `.aurora-night` (+ `i.an-1/2/3`)                    | Fixed drifting aurora layer                 | first child of `.night` pages                |
| `.aurora-charcoal`                                  | Static aurora wash                          | charcoal hero bands on paper                 |
| `.noise`                                            | Film grain data-URI                         | fixed overlay on night pages                 |
| `.enter-liquid`                                     | Entrance (rise + blur-clear, 0.9 s)         | page/section mounts, pairs with `.stagger-N` |

Rules:

- Glass is the **control plane only** — never put body copy or charts on glass.
- Glass never nests inside glass; flatten to one layer.
- ≤ 6 live `backdrop-filter` layers per viewport.
- Fallbacks for `prefers-reduced-transparency` and `prefers-reduced-motion`
  are built into the classes — don't bypass them.

## Motion tokens

```
--spring:      cubic-bezier(0.34, 1.56, 0.64, 1)   arrives with overshoot
--ease-liquid: cubic-bezier(0.22, 1, 0.36, 1)      standard settle
```

Animate only `transform`, `opacity`, `filter`. Never layout properties.

## Geometry — concentric corners

**Inner radius = outer radius − gap.** No more per-file radius invention.
Standalone controls are capsules (radius = height/2): buttons, chips, docks,
segmented controls. Example: dock 28px radius, 6px padding → 22px item wells.

---

## Buttons — `<GlassButton>` (the one system)

`src/components/ui/glass-button.tsx`. Supports `asChild` for `<Link>`/`<a>`.

| Variant   | Material                                          | Use                              |
| --------- | ------------------------------------------------- | -------------------------------- |
| `amber`   | Liquid amber, sheen sweep on hover                | THE primary — one per screen     |
| `success` | Liquid green                                      | won-lead / revenue confirmations |
| `glass`   | Adaptive glass (dark ↔ paper ↔ charcoal-in-paper) | secondary (default)              |
| `ghost`   | Hairline capsule                                  | tertiary                         |
| `danger`  | Red-tinted glass                                  | destructive                      |

Sizes: default (48px) and `sm` (38px). All get press physics, pointer
specular, and a visible `focus-visible` ring for free.

**Deprecated:** `cta-shear` (all variants) and shadcn `Button` on customer
surfaces. Don't add new usages. The sheared parallelogram lives on as the
brand _mark_, not the button shape.

---

## CLIENT SURFACE — paper + liquid chrome

Content plane — unchanged from v3, still the law:

- Warm paper (`--paper-*`), ink scale (`--ink*`), charcoal frame
  (`.surface-charcoal`) — tokens in `styles.css`
- Body text ≥ 15–16px, metadata ≥ 13–14px. Client is often 45+, on a phone,
  in the sun.
- Cards not tables. One CTA per screen. Goal progress is the hero.
  3 big numbers with deltas. `tel:`/`mailto:` links tap-to-act.
- All copy from `src/lib/shared/clientPortal/portalCopy.ts` (NL/EN by
  `tenant.geo`) — never hardcode portal strings.

Chrome plane — v5:

- **Mobile nav = floating glass dock** (`.glass-dock`, safe-area aware,
  centered, inset from edges). Never a full-width bar glued to the bottom.
- Hero band: `.surface-charcoal.aurora-charcoal` — atmosphere, not dead grey.
- Desktop sidebar: charcoal, active item = glass pill (white/10 + inset rim).
- Primary actions: `GlassButton variant="amber"`; won-confirms `success`.

## LANDING (`/`)

Night canvas (`.night` + `.aurora-night` + `.noise`), floating `.glass` nav
capsule, one liquid-amber CTA, glass tiles for the three layers. It's the
front door — it must feel like the product's energy.

## OPERATOR SURFACE — still v3 until Phase 3

The dark operator app keeps the v3 rules for now: 4-step surface ladder
(`#0D0E10 → #161719 → #1E1F22 → #28292D`), text hierarchy by opacity
(1 / 0.55 / 0.30), hairline borders, radius 4/6/8px, `Plus Jakarta Sans`,
mono-uppercase for section labels only, action-dot color coding
(amber=review, blue=create, orange=publish), every row has an inline action.

Phase 3 will move its _chrome_ (sidebar → glass rail, toolbar, KPI tiles,
queue action chips) onto the v5 materials. Its _content_ rules stay.

---

## Status Colors

Unchanged from v3 — `--status-green/amber/red/info` + soft tints (dark), and
`--paper-success/danger/info` (paper). See `styles.css`.

---

## Anti-patterns (v5)

```
❌ Glass under body copy, charts, or any content-plane element
❌ Glass nested inside glass
❌ Ad-hoc shadow-* / blur — elevation comes from the material classes only
❌ New cta-shear or shadcn Button usages on customer surfaces
❌ Non-concentric nested corners; non-capsule standalone controls
❌ Animating width/height/top/left (layout) — transform/opacity/filter only
❌ Amber on >10% of a viewport; two amber primaries on one screen
❌ Metrics without deltas; empty states without a CTA
❌ Hardcoded portal copy (bypassing portalCopy.ts)
❌ Pure white/cool-gray page backgrounds on client surfaces (paper is warm)
```

## AI Prompt Rules

When generating any UI for LeadLayer:

1. Interactive chrome = the v5 material classes (`.glass`, `.glass-paper`,
   `GlassButton`, `.glass-dock`) — never hand-rolled glass or shadows
2. Content = opaque ink on surface, v3 readability rules
3. Concentric corners; capsules for standalone controls
4. Press physics on everything interactive (the classes provide it)
5. One `variant="amber"` primary per screen
6. Every metric has a delta; every list row has an inline action
7. Respect the reduced-motion/transparency fallbacks (don't strip them)
8. Operator app content areas: keep v3 rules until Phase 3
