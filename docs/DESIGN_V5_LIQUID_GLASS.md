# LeadLayer OS — Design v5 Proposal: "Liquid OS"

**Status:** Proposal. Nothing in the live app changes until this is approved.
**See it live:** run the app and open **`/design-lab`** — every material, button and
motion pattern in this document exists there as working code, not a mockup.

This document has two parts:

1. **Audit** — an honest assessment of the current design system (v3, DESIGN.md)
2. **The new direction** — a liquid-glass material system that takes the app from
   "clean SaaS" to the tier where Apple, Linear and Arc live.

---

## PART 1 — AUDIT OF THE CURRENT DESIGN

### What is genuinely good (keep all of this)

| Strength                           | Why it matters                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Token discipline**               | Every color routes through CSS variables. `.paper` pins semantic tokens so surfaces can't drift. This is rarer than it sounds — most codebases at this stage are raw-hex soup. Migration to any new system is cheap because of this. |
| **Two-audience thinking**          | Operator (dense, dark, all-day) vs client (sparse, warm, 30-seconds-in-sunlight) is a real design decision, correctly reasoned from context of use.                                                                                  |
| **The copy system**                | `portalCopy.ts` with NL/EN per tenant — the portal _speaks the client's language_. This is a $100k detail already in place.                                                                                                          |
| **Editorial identity**             | Warm paper, hairlines-not-boxes, numbered lists, the sheared CTA. There IS an opinion here. Most AI-era dashboards have none.                                                                                                        |
| **Deltas on every number**         | "A bare metric is a mockup" is a great rule. Keep it forever.                                                                                                                                                                        |
| **The layered-parallelogram mark** | Distinctive, geometric, scales down well, and — importantly for v5 — the _stacked layers_ concept maps perfectly onto a depth-based material system.                                                                                 |

### Where it falls short of the tier you're aiming at

**1. The system has a flatness ceiling.**
v3's core rules — _no shadows, no blur, no gradients, elevation = next flat color_ —
were written to avoid the "AI template" look. They succeeded, but they also cap the
ceiling: the app can never feel _dimensional_. Apple-tier UI since 2025 (Liquid
Glass, visionOS) is built on the opposite premise: **light, depth and material are
the brand**. A flat surface ladder reads as "tasteful 2023 SaaS." It cannot read
as "next level" because the third dimension is banned by rule.

**2. There is no motion system — only entrance animations.**
What exists: `page-fade-up`, staggers, a progress fill, count-up. What's missing:
_interaction physics_. Buttons don't respond to touch with weight. Nothing springs,
squishes, or settles. Panels appear, but never _arrive_. At the top tier, motion is
where quality is felt most — a button that compresses under the finger communicates
more craft than any color token.

**3. The button story is incoherent.**
Three unrelated button systems coexist:

- `cta-shear` (branded, editorial — client surface)
- stock shadcn `Button` (generic `rounded-md bg-primary` — operator surface)
- ad-hoc `<button className="...">` with hand-rolled classes (shells, everywhere)

The operator app's primary control is literally the shadcn default — the single
most recognizable "template" component in existence. The most-touched element in
the product carries zero brand.

**4. Elevation-by-color quietly broke down.**
DESIGN.md says "no shadows," but `.panel` ships a two-layer box-shadow, `.card-lift`
adds a hover shadow, and the hero band uses a radial glow — because pure flat
_wasn't enough_ and exceptions crept in. The system is already drifting toward
depth without a theory of depth. v5 gives it one.

**5. Landing page and demo route don't sell.**
`/` is one static screen — no motion, no product shown, no atmosphere. The memory
notes already flag `/demo` as stale as a sales asset. For a product whose pitch is
"we build things that generate money while you sleep," the front door shows none
of that energy.

**6. Charts are default recharts.**
Default grid, default tooltip (square, cream box), default axis type. The data
surfaces — the _proof of ROI_, the whole reason clients open the portal — look like
documentation examples. (Tooltip radius is even 4px while panels are 14px —
concentricity is broken all over.)

**7. Radii have no relationship.**
4px chips, 6px nav, 8px cards, 10px paper-cards, 14px panels, arbitrary per file.
Apple's rule — child radius = parent radius − padding (concentric corners) — is
what makes their nesting look "machined." Currently nested corners collide visually.

**8. Focus/press states are an afterthought.**
`focus-visible:ring-1` on shadcn defaults; several hand-rolled buttons have no
focus treatment at all. Press states don't exist anywhere.

### Verdict

The current system is a disciplined **8/10 "tasteful flat SaaS"** with real brand
bones (mark, amber, editorial paper) — and a hard ceiling. To get to the tier
you're pointing at, we don't throw it away. We keep the bones (tokens, copy,
two audiences, deltas, the mark) and replace the **material system**: flat paint
becomes **liquid glass, light and physics**.

---

## PART 2 — THE NEW DIRECTION: "LIQUID OS"

> One sentence: **content stays ink-on-paper; everything you _touch_ becomes
> liquid glass.**

This is the same architectural insight as Apple's Liquid Glass (WWDC 2025): the
_content layer_ (text, numbers, charts) stays maximally crisp and opaque, while the
_control layer_ (nav, buttons, docks, toolbars, chips) becomes a translucent
material that floats above it, refracts it, and responds to touch like a physical
object. That split is what resolves the old worry in DESIGN.md — "clients read this
in direct sunlight" — because readability lives in the content layer, which never
gets glass.

### The three planes

```
PLANE 0 — CANVAS    Deep ambient field. No longer a flat hex — a living
                    background: near-black charcoal with slow-drifting amber
                    aurora (operator) or warm paper with soft grain (client).
                    Light exists here so glass has something to bend.

PLANE 1 — CONTENT   Ink on surface. Text, metrics, charts, tables. Opaque,
                    high-contrast, zero transparency. Sacred readability.

PLANE 2 — GLASS     Everything interactive floats here: nav rails, docks,
                    buttons, chips, segmented controls, dialogs, toasts.
                    Translucent, blurred backdrop, specular edge, physics.
```

The brand mark is three stacked layers. The app becomes three stacked planes.
**The architecture is the logo.**

### Material recipes (the exact CSS, shipped in /design-lab)

**Dark glass** (operator chrome, client charcoal frame):

```css
.glass {
  position: relative;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    /* top specular — light hits the rim */ inset 0 -1px 0 rgba(255, 255, 255, 0.04),
    0 1px 2px rgba(0, 0, 0, 0.3),
    0 16px 40px -12px rgba(0, 0, 0, 0.5); /* soft ambient drop */
}
/* Lensing ring — a 1px gradient border that reads as a polished edge */
.glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.45),
    rgba(255, 255, 255, 0.06) 38%,
    rgba(255, 255, 255, 0.02) 62%,
    rgba(255, 255, 255, 0.28)
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
```

**Paper glass** (client surface — glass over warm cream):

```css
.glass-paper {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.25));
  backdrop-filter: blur(20px) saturate(160%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 1px 2px rgba(26, 26, 28, 0.06),
    0 12px 32px -12px rgba(26, 26, 28, 0.18);
}
```

**Liquid amber** (the primary CTA — molten glass, not flat paint):

```css
.glass-amber {
  background: linear-gradient(135deg, rgba(240, 160, 70, 0.95), rgba(200, 105, 10, 0.85));
  backdrop-filter: blur(12px) saturate(160%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    /* hot specular rim */ inset 0 -2px 6px rgba(120, 55, 0, 0.35),
    /* molten underside */ 0 8px 28px -6px rgba(232, 145, 58, 0.45); /* amber light cast on canvas */
}
```

**True refraction** (progressive enhancement, Chromium): an SVG
`feDisplacementMap` on `backdrop-filter: url(#lens)` bends the content behind
edges of hero glass exactly like Apple's lensing. Safari/Firefox silently fall
back to the blur recipe. Used sparingly — hero panels only.

### Light is the new elevation

v3: elevation = next flat color. v5: **elevation = how much light an object
gathers.** Higher objects get: stronger top specular, deeper backdrop blur,
longer/softer ambient shadow, and (if amber) a wider light cast. The 4-step
ladder maps to 4 light levels — same mental model, third dimension added.

### Motion: physics, not transitions

| Token             | Value                                                    | Use                                                |
| ----------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `--ease-out`      | `cubic-bezier(0.22, 1, 0.36, 1)`                         | standard settle (panels, hovers)                   |
| `--spring`        | `cubic-bezier(0.34, 1.56, 0.64, 1)`                      | anything that _arrives_ — overshoots ~6% and lands |
| press             | `scale(0.965)` in 90ms, release via `--spring` 350ms     | every button, chip, dock icon                      |
| specular tracking | radial highlight follows the pointer across glass        | buttons, tiles                                     |
| reveal            | `opacity 0→1, translateY 24→0, blur 8→0`, staggered 60ms | section entrances                                  |

Rules: 60fps only — animate `transform`, `opacity`, `filter`; never layout.
Everything honors `prefers-reduced-motion: reduce` (motion collapses to opacity).

### Geometry: concentric corners

One formula, no more per-file radii: **inner radius = outer radius − gap.**
Capsules (radius = height/2) for all standalone controls: buttons, chips,
segmented controls, docks. A dock with 28px radius and 8px padding holds 20px
icons wells. This single rule is 30% of the "machined" Apple feel.

### What each surface becomes

**Operator (dark):**

- Canvas: `#08090B` with a barely-there amber aurora drifting behind the glass rail (light for the glass to bend — replaces `bg-blueprint-subtle`)
- Sidebar → floating **glass rail**, inset from the viewport edge, capsule active state
- Top bar → glass toolbar; command-K becomes a glass palette
- Action queue rows: content stays opaque ink; inline actions become glass chips that _press_
- KPI strip: glass tiles, count-up numbers, delta chips in tinted glass

**Client portal (paper):**

- Keeps warm paper + charcoal frame identity — content plane untouched, still sunlight-readable
- Mobile bottom tabs → **floating glass dock** (inset, capsule, safe-area aware) — the single highest-impact change; it's the surface the client touches every visit
- Hero stat: charcoal panel gains aurora depth + count-up stays
- CTA: `cta-shear` is retired in favor of the **liquid amber capsule**; the shear parallelogram lives on as the _mark and chip motif_, not the button shape (a clipped polygon can't carry glass materials or concentric nesting)

**Landing (`/`):**

- Aurora canvas, glass nav pill, liquid amber CTA, a floating glass "live dashboard" panel with counting numbers — the front door finally demos the product's energy

**Buttons — one system, four materials:**
`GlassButton` replaces all three current systems: `glass` (secondary), `glass-amber`
(the one primary per screen), `glass-danger`, `ghost` — all capsule, all with
specular tracking + press physics + visible `focus-visible` ring (2px amber, 2px offset).

### Accessibility & performance (non-negotiables)

- Content plane: WCAG AA minimum, unchanged from v3 (15–16px body on client)
- Text on glass: only for _labels of controls_, ≥ 4.5:1 against the blurred worst case; never body copy on glass
- `prefers-reduced-transparency` → glass falls back to near-opaque fills
- `prefers-reduced-motion` → springs/auroras collapse to fades
- Backdrop-filter budget: ≤ 6 live glass layers per viewport; glass never nests inside glass (flatten to one layer); `transform: translateZ(0)` isolation on scrolling glass
- Focus ring on every interactive element, no exceptions

### What replaces the v3 anti-pattern list

1. Glass is for the **control plane only** — never put body text or charts on glass
2. One liquid-amber primary per screen (the ≤10% amber rule survives intact)
3. Concentric corners always; capsules for standalone controls
4. Elevation = light (specular + blur + shadow), applied via the material classes only — no ad-hoc `shadow-*`
5. Every interactive element presses (`scale 0.965`) and springs back
6. Animate only `transform` / `opacity` / `filter`
7. Deltas on every number (unchanged)
8. Every list row keeps an inline action (unchanged)
9. Content plane readability rules unchanged from v3 (type sizes, ink contrast)
10. Aurora/light lives in the canvas plane only — never inside content cards

### Rollout plan

| Phase | Scope                                                                                                                                                 | Risk                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **0** | `/design-lab` (done — this proposal)                                                                                                                  | none                                                |
| **1** | Materials + motion tokens into `styles.css`; `GlassButton` component                                                                                  | low — additive                                      |
| **2** | Client portal chrome: glass dock (mobile tabs), liquid amber CTAs, hero aurora                                                                        | medium — client-facing, but content plane untouched |
| **3** | Operator chrome: glass rail, toolbar, KPI tiles, queue action chips                                                                                   | medium                                              |
| **4** | Landing + `/demo` rebuilt as the sales asset                                                                                                          | low                                                 |
| **5** | Chart polish (custom tooltip as glass, brand grid, animated draw-in) + delete `cta-shear`, shadcn button variants, `.card-glass`, `.glow-blob-accent` | low                                                 |

DESIGN.md gets rewritten at Phase 1 approval; until then it stays authoritative
for day-to-day work.
