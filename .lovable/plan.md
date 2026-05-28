# Client Journey & OS Architecture + WordPress Integration Sprint

Strategic reset. Two canonical product docs. Zero feature code, zero migrations, zero UI refactor.

## Scope

**In**
- Create `docs/CLIENT_JOURNEY_AND_OS_ARCHITECTURE.md` — canonical product architecture
- Create `docs/WORDPRESS_INTEGRATION_ARCHITECTURE.md` — staged WP delivery design
- Read-only audit of `src/routes/_authenticated/*` and `src/lib/**` so the "keep / fold / demote" classification is grounded in what actually exists today
- Add short cross-link pointers at the top of `docs/ROADMAP_V4.md` and `docs/LEAD_ENGINE_BLUEPRINT_ROADMAP.md` so future tickets reference these docs

**Out**
- Execution Task Engine
- Growth Intelligence Snapshot builder (next sprint, defined here only as a spec)
- WordPress connection code, schema, or UI (existing WPCOM OAuth helper untouched)
- Navigation refactor
- Any migration, any new server function, any UI change

## Doc 1 — `docs/CLIENT_JOURNEY_AND_OS_ARCHITECTURE.md`

Canonical product architecture source. Sections:

- **A. Product North Star** — Goal → Intelligence → Blueprint → Masterplan → Execution → Delivery → Tracking → Monthly Loop
- **B. Actors** — Client, Operator, Software, each with explicit "does NOT do" lists
- **C. Client Journey** — signup → website added → goal confirmed → assumptions confirmed → intelligence generated → operator review → blueprint delivered → client approval → execution → monthly loop, with what the client sees at each stage
- **D. Operator Journey** — intake queue → intelligence review → blueprint review → masterplan approval → artifact review → publishing approval → monthly review
- **E. Automation Flow** — what runs on website-added trigger (crawl, audit, page intel, BP draft, tone draft, market scan, competitor scan, GBP request, snapshot, blueprint draft, masterplan draft) vs what gates on human review (BP approval, tone approval, GBP assumptions, blueprint, masterplan, artifacts, publishing bundle)
- **F. System Layers** — Intelligence / Blueprint / Masterplan / Execution / WordPress-Delivery / Tracking-Monthly-Loop
- **G. Growth Intelligence Snapshot spec** — central normalized truth object (fields, sources, refresh triggers); flagged as next-sprint build target
- **H. Two Blueprint Modes** — operator view (confidence, partials, warnings) vs client view (cleaned but honest)
- **I. WordPress Direction (summary)** — core delivery layer, deep connection + inventory + mapping + draft creation, no live auto-publish in V1; full design lives in Doc 2
- **J. Navigation Proposal** — Growth (Goal / Intelligence / Blueprint / Masterplan / Execution), Website (Sites / Audits / WordPress Connection), Settings (Business Profile / Tone Profile); GBP folded under Growth → Intelligence
- **K. Legacy / Cleanup** — audit of current modules (from `src/routes/_authenticated/*` and `src/lib/**`) classified Keep / Fold / Demote. Concretely:
  - Keep: Goal, Blueprint, Masterplan, Intelligence modules (market, competitive, GBP, page), Sites/Audits/Page Intelligence, Business Profile, Tone Profile
  - Fold: old Proposals (`proposalsV2`) into future Execution Artifacts; QA Compare into Artifact Review; Execution Board V1 (`growth.execution.tsx`) into future Execution Engine
  - Legacy / parked: V1 `proposals`, `leads`, `raw_events`, `change_groups` (already noted in ROADMAP_V4)
- **L. State Machine** — `onboarding → collecting_intelligence → operator_review → client_review → approved → in_execution → publishing_ready → draft_published → live → monthly_review`
- **M. Open Decisions** — client approval gates per tier; automatic scan cost ceilings; WP draft vs toplayer for existing pages; publishing safety model; tracking source; monthly loop cadence; what to do when new intelligence contradicts an approved masterplan

## Doc 2 — `docs/WORDPRESS_INTEGRATION_ARCHITECTURE.md`

Staged integration design. Sections:

- **A. Product Purpose** — WordPress is the delivery surface for approved execution artifacts; designed before Execution so artifacts know their target
- **B. Integration Stages** — Connection → Capability Check → Inventory → Page Mapping → Draft Creation → Existing-Page Update Bundle → Publishing Gate → (future) Safe Auto-Publish
- **C. Auth Model** — WordPress Application Passwords for self-hosted; existing WPCOM OAuth (`src/lib/shared/wpcom/`) reused for .com; HTTPS required, encrypted storage (`ENCRYPTION_KEY` already in use), revocable, operator-assisted in V1
- **D. Data Model Proposal** (table sketches, NOT migrations) — `wordpress_connections`, `wordpress_site_inventory`, `wordpress_page_mappings`, `wordpress_drafts`, `publishing_bundles`
- **E. Field Specs** — connection / inventory / mapping fields fully enumerated (tenant_id, site_id, base_url, rest_base_url, username, encrypted_application_password, status, capabilities, last_checked_at, error_message; wp_post_id, type, status, title, slug, link, parent, template, modified, content_hash, mapped_page_role)
- **F. Page Mapping Logic** — how WP pages map to `page_intelligence` rows, masterplan items, service/location targets; existing vs new; prevents duplicate-page generation
- **G. Draft Strategy** — new pages → WP draft; existing pages → LeadLayer update bundle first, no live overwrite in V1
- **H. Content Format** — V1 generates Gutenberg-compatible structured blocks (title, slug, intro, sections, FAQ, CTA, JSON-LD schema); meta stored in artifact; no Elementor/Divi support in V1
- **I. Safety Model** — no live publish, operator approval gate, artifact versioning, write audit log, rollback as future work
- **J. How This Connects to Execution** — approved artifact → publishing bundle → WP draft; artifact approval is the only path that touches WP
- **K. Client/Operator Journey** — operator-assisted connection in V1, client self-service later
- **L. Open Questions** — encryption mechanism (reuse `ENCRYPTION_KEY` vs new), Gutenberg vs raw HTML edge cases, media upload, Yoast/RankMath meta plumbing, revisions/rollback, client approval gates for publish

## Cross-links

- Top of `docs/ROADMAP_V4.md`: pointer noting both new docs supersede ad-hoc next-ticket selection and revise the sprint order (Journey → WP Architecture → Snapshot → Nav cleanup → Execution → WP Draft Publishing → Publish Gate → Tracking)
- Bottom of `docs/LEAD_ENGINE_BLUEPRINT_ROADMAP.md`: "Next layer" pointer to the Journey doc

## Acceptance

- Both docs exist and are self-contained.
- Journey doc classifies every current module under Keep / Fold / Legacy with file references.
- WP doc defines staged integration with no live-write path in V1 and explains how artifacts become bundles.
- Only code-adjacent change is two short cross-link pointers in existing roadmap docs.
- Build untouched, typecheck untouched.

## Implied next order (not in this sprint)

1. Growth Intelligence Snapshot builder
2. WordPress Connection + Inventory (schema + server functions)
3. Navigation cleanup
4. Execution Task Engine + Artifacts (targeting WP draft bundles)
5. WordPress Draft Publishing
6. Publishing Gate / QA
7. Tracking + Monthly Loop
