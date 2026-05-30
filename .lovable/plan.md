
# LeadLayer Operator Dashboard Rebuild — Phase 1 + 2

Frontend-only rebuild. No backend changes, no migrations, no new server functions, no legacy route removals. Legacy `/growth/*`, `/audits/*`, `/onboarding/*`, `/settings/*`, `/sites/*`, `/r/:shareToken` stay reachable by URL but disappear from primary nav.

## Brand direction (from leadlayer.studio)

Calm, premium, operational. Not loud. Extracted feel only — no marketing copy reused.

- **Surface**: warm sand/cream `oklch(0.96 0.012 80)` for app background, soft off-white `oklch(0.985 0.005 80)` for cards.
- **Ink**: near-black `oklch(0.18 0.01 80)` for primary text, muted ink `oklch(0.45 0.01 80)` for secondary.
- **Accent**: LeadLayer orange `oklch(0.72 0.16 55)` (≈ `#E89A2C`) reserved for primary actions, active state, and the brand mark. Used sparingly.
- **Border**: hairline `oklch(0.88 0.008 80)`.
- **Radius**: restrained (`--radius: 0.5rem`).
- **Type**: existing sans for body/headings; mono (`ui-monospace`) reserved for small caption/eyebrow labels (`§ 02 · The Cost` feel) — uppercase, tracked, muted.
- **Logo**: recreate the stacked trapezoid mark as an inline SVG in `src/components/brand/Logo.tsx` (already exists — update if needed) using the accent + ink tokens. No raster scrape needed; the mark is 3 trapezoids — top filled accent, middle outline accent, bottom filled darker accent.

Status palette:
- `--status-green` — live/done/healthy
- `--status-amber` — needs attention/pending
- `--status-red` — failed/blocker
- `--status-info` — review/approved (indigo/blue, distinct from brand orange)
- `--status-neutral` — planned/draft (gray)

All updates in `src/styles.css`. No hex in JSX.

## Scope

**In scope**: app shell, `/dashboard`, `/clients`, `/clients/:tenantId/*`, Execution review panels, token cleanup.

**Out of scope**: client portal, demo, sales view, mobile-first operator UI, new server functions, DB migrations, redesigning legacy routes, inline settings forms.

## Phase 1 — Shell + command center

### Routes (new files)
```
src/routes/_authenticated/
  dashboard.tsx                      -> /dashboard
  clients.index.tsx                  -> /clients
  clients.$tenantId.tsx              -> layout w/ <Outlet/>
  clients.$tenantId.index.tsx        -> redirect to ./overview
  clients.$tenantId.overview.tsx
  clients.$tenantId.execution.tsx
  clients.$tenantId.pages.tsx
  clients.$tenantId.leads.tsx
  clients.$tenantId.reports.tsx
  clients.$tenantId.settings.tsx
```
Root `/` (already redirects via existing index route) — if authenticated and a membership exists, redirect to `/dashboard` instead of legacy `/growth/*`. `app.tsx` and all `/growth/*` routes stay untouched.

### App shell — `src/components/app/OperatorShell.tsx`
Rendered from `_authenticated.tsx` wrapping `<Outlet/>`. Uses shadcn `Sidebar` (`collapsible="icon"`).
- Sidebar header: brand mark + wordmark.
- Primary nav: Dashboard, Clients. Account menu pinned bottom.
- Top bar: `SidebarTrigger`, breadcrumb, `TenantSwitcher` only when inside `/clients/:tenantId/*`.
- Active route via `useRouterState`.
- Legacy `/growth/*` not surfaced.

### `/dashboard`
Phase 1 shell only. Sections:
- **Needs attention** — wired only if a cross-tenant queue function already exists and is easy to call; otherwise an empty state card with copy *"Action queue will connect in Phase 5."* No fake data.
- **Client health** — loops `listMyTenants` and renders small status chips. Skip per-tenant queries here.
- **Reports due** — placeholder card; wires in Phase 5.

### `/clients`
- Loads `listMyTenants` (existing GET server fn).
- Try `getClientHealthSummaries` defensively — if the import is missing or it throws, fall back silently to name + Open button.
- `ClientCard` shows only present fields: name, geo, vertical, health dot, leads-this-month, pending actions count, Open → `/clients/:tenantId`.

### `/clients/:tenantId` command center
Two new components under `src/components/clients/`:
- **`ClientCommandHeader.tsx`** — back link, name, geo, vertical, health dot, goal progress bar, single status line. All fields optional.
- **`ClientTabs.tsx`** — shadcn `Tabs` driven by router `Link`s; active via `useRouterState`. Tabs: Overview, Execution, Pages, Leads, Reports, Settings.

Tab files in Phase 1:
- **Overview, Pages, Leads, Reports, Settings** → clean placeholder card explaining what will live there. No queries.
- **Execution** → real (see Phase 2).

`clients.$tenantId.index.tsx` does `throw redirect({ to: '/clients/$tenantId/overview', params })`.

## Phase 2 — Execution review workflow

Route: `/clients/:tenantId/execution`. Uses existing `getExecutionBoard({ tenantId })` exactly as today (no extra fetches, no new functions). All action mutations are **lifted as-is** from `src/routes/_authenticated/growth.execution.tsx` — same server-function calls, same payload shapes, same invalidation keys.

### Components under `src/components/execution/`

- **`ExecutionBoard.tsx`** — loads board via `useSuspenseQuery`, groups items by phase/status, renders cards. Simple filter chips (All / Needs review / In delivery / Done).
- **`ExecutionItemCard.tsx`** — title, type badge, `StatusPill`, next-action chip from `item.nextAction`, primary action button(s), chevron toggle for review panel. Review panel sits directly **above** the action row.
- **`PageBriefReviewPanel.tsx`** — collapsible. Fields: `artifactPrimaryKeyword`, `artifactKeywordVolume`, `artifactH1`, `artifactMetaTitle`, `artifactMetaDescription`, `artifactIntroPreview`, `artifactSectionCount`, `artifactFaqCount`, `artifactOperatorNotes`, `artifactRiskFlags`, `artifactMissingContext`.
- **`OptimizationReviewPanel.tsx`** — collapsible. Fields: `optimizationArtifactUpdateMode`, `optimizationArtifactRecommendedTitle`, `optimizationArtifactMetaTitle`, `optimizationArtifactMetaDescription`, `optimizationArtifactRiskFlags`, `optimizationArtifactMissingContext`, `optimizationArtifactOperatorChecklist`.
- **`RiskFlags.tsx`** — red border-left + warning icon, prominent. Empty array → hide. Null → "Review details unavailable".
- **`MissingContext.tsx`** — amber callout. Same empty/null rules.
- **`StatusPill.tsx`** — maps status → token color.

### Status → action mapping (visual states)
| State | Action(s) |
|---|---|
| planned | Generate brief |
| in_review | Review brief (toggle) · Approve · Reject |
| approved | Create WordPress draft |
| draft_created | Preview · Edit · Publish from LeadLayer |
| published | Open live URL |
| optimization_brief_ready | Review optimization · Approve |
| optimization_approved | Apply optimization |
| failed | Retry · show error |

All handlers reuse the existing server functions referenced from `growth.execution.tsx` (no signatures change). Approving when `riskFlags` is non-empty opens a client-side confirm dialog — no backend change.

## Technical notes

- Data: follow existing convention — `queryOptions` + `useSuspenseQuery` in components, `ensureQueryData` in loaders where helpful.
- Render `<Outlet/>` in `_authenticated.tsx` (inside `OperatorShell`) and in `clients.$tenantId.tsx`.
- `__root.tsx` keeps its `<Outlet/>`.
- `routeTree.gen.ts` regenerates automatically.
- All colors via tokens; no hex in JSX.
- Build/typecheck must stay clean.

## Acceptance

- `/dashboard`, `/clients`, `/clients/:tenantId/*` load with the new shell.
- Tab switching works via router links.
- `/clients/:tenantId/execution` renders live `getExecutionBoard` data.
- Page brief + optimization review panels render every listed field with graceful fallbacks.
- Risk flags + missing context are visually prominent (red / amber).
- Approve / Reject / Create draft / Publish / Apply optimization still call the existing server functions and still work.
- No backend, schema, or server-function changes.

## Post-implementation summary I'll deliver

1. Routes created/changed
2. Components created
3. Existing backend functions used (names + call sites)
4. Any missing fields or degraded fallbacks
5. Build/typecheck status
6. Proposed Phase 3 (likely: wire Pages tab to WordPress Delivery V2 inventory + drafts, and Leads tab to lead inbox)
