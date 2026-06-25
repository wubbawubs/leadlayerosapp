# Audit — /client (klantportaal)

## Wat er nu staat

**Shell** (`ClientShell.tsx`)

- Linker charcoal sidebar (brand + 4 tabs + sign out) + paper content area.
- Charcoal hero band met radiale amber glow.
- Mobile: charcoal topbar + bottom tab bar.

**Home** (`/client`)

- Hero: greeting, goal titel, animated count-up `{actual} / {target}`, status chip, goal ring (SVG, 9 sec ease).
- Stat band: 4 KPI cards (Leads MTD met delta, Conversie %, Visitors, Revenue).
- Hoofdkolom: Traffic trend (area + bar, recharts), CTA performance funnel, Newest leads, Activity timeline.
- Side rail: Source breakdown, latest report link, "Coming next", "How it works".

Backend dekt het: `getMyClientDashboard` + `getMyClientAnalytics`.

## Wat er goed werkt

- Sterke merkidentiteit (paper + charcoal + amber, mono labels).
- Hero is editorial en emotioneel (count-up + ring).
- Real-data wiring, geen fake placeholders.
- i18n via `portalCopy` (en/nl).

## Wat het tegenhoudt om "next level" te zijn

1. **Hero is statisch na 1 sec.** Count-up speelt één keer, ring animeert één keer, daarna dood frame. Geen ambient leven, geen sub-headline die context geeft ("3 leads boven pace deze week", "€8.4k binnengehaald sinds maandag").
2. **KPI band is veilig 4-up.** Vier identieke kaarten — geen hiërarchie, geen "this is the one number that matters". Conversion en Visitors zijn cosmetisch zonder klikbare drill-down.
3. **Side rail is een dumping ground.** Source breakdown, latest report, coming next, how it works — vier ongerelateerde blokjes onder elkaar zonder hiërarchie. "How it works" hoort op een onboarding/empty state, niet permanent in de rail.
4. **Trend chart is generieke recharts.** Werkt, maar leest als een SaaS template — geen annotations (publish events, optimization moments, lead spikes), geen "this is why" verhaal.
5. **CTA funnel toont nummers, geen inzicht.** Geen baseline, geen "vs vorige periode", geen winner/loser framing.
6. **Activity timeline = chronologische lijst.** Mist grouping per week, mist visuele weight (een page-publish hoort dikker te lezen dan een micro-event).
7. **Geen "thank you" / "celebrate" momenten.** Bij een goal-hit, een nieuwe won lead of een gepubliceerde pagina is er geen visuele beloning — de klant ziet alleen cijfers schuiven.
8. **Side rail verdwijnt op mobile.** Source breakdown en latest report worden afgeknipt onder lg breakpoint, niet herverdeeld.

## Audit-conclusie

Het portaal is op het niveau van een goede SaaS dashboard (Linear/Stripe-achtig). "Next level" is het tillen naar editorial/narrative dashboard — minder grid van widgets, meer "deze maand bij {Business}: hier zijn de drie dingen die ertoe doen, en hier is het bewijs". Stripe Atlas reports, Linear's changelog en Vercel's project overview zijn betere noord-sterren dan een generieke analytics tool.

---

# Upgrade plan

**Phase 1 — Hero: van snapshot naar narratief** (≈ 1 file)

- Sub-headline onder de count-up met live insight: "+3 leads boven pace deze week" / "Nog 5 leads nodig om je goal te halen" / "Best presterende dag: 12 jun, 4 leads".
- Tweede ring of mini-spark naast de goal ring → leads-per-week trend (4 weken).
- Hero CTA: één primaire actie (b.v. "Bekijk leads" of "Lees laatste rapport") in plaats van passieve status chips alleen.

**Phase 2 — KPI band: hiërarchie + drill-down** (≈ 1 file)

- 1 hero-KPI (leads MTD, groot, met sparkline) + 3 secundaire compacte stats.
- Elke KPI wordt klikbaar → relevante tab (leads → /client/leads, revenue → leads filtered won).
- Delta krijgt context ("+3 vs mei" → "+3 vs mei · best maand in 2026").

**Phase 3 — "Story" sectie ipv losse panels** (≈ 1 nieuwe component + dashboard.tsx tweak)

- Eén nieuwe sectie bovenaan hoofdkolom: **"Deze maand bij {Business}"** — 3 bullets gegenereerd uit data (top source, top CTA, biggest win), genummerd zoals "Coming next" al doet. Geeft narratief, niet alleen widgets.

**Phase 4 — Chart upgrade** (≈ 1 file)

- Annotations op trend: publish-events als amber tick, optimization als sparkle, eerste won lead per week als groene dot.
- Hover state met "context": "12 jun · 4 leads · publication 'AC repair Dallas' ging live".
- Comparison line: vorige periode in dunne dashed lijn.

**Phase 5 — Side rail opschonen** (≈ 1 file)

- "How it works" alleen tonen als `recentActivity.length < 3` (echte empty state).
- Side rail wordt: Top source compact + Latest report card (groter, met period preview) + Coming next.
- Op mobile: source breakdown herverschijnt onder de funnel ipv verdwijnt.

**Phase 6 — Microcopy + celebrate moments** (≈ 2 files)

- Bij `goal.status === "complete"` of `"ahead"`: hero krijgt een subtiele confetti-ish amber pulse + andere status copy ("🎯 Goal gehaald — laten we doorpakken").
- Bij nieuwe won lead in afgelopen 24u: top-of-page banner "Net binnen: {name} · €{amount}".

**Phase 7 — Empty/early states** (≈ 1 file)

- Eerste 14 dagen / weinig data → vervang charts door een "we're collecting" state met what-to-expect timeline. Voorkomt dat early clients een leeg dashboard zien.

## Technische details

- Geen nieuwe backend nodig voor Phase 1–3,5,6,7. Alle data zit al in `getMyClientDashboard` / `getMyClientAnalytics`.
- Phase 4 annotations vereist activity-data te joinen met trend dates → kan client-side uit `portal.recentActivity` (al beschikbaar).
- Geen nieuwe deps. Recharts, lucide, tailwind blijven volstaan.
- Bestaande paper/charcoal/amber tokens hergebruiken — geen nieuwe kleuren.

## Volgorde

Phase 1 + 2 + 3 in één pass = grootste visuele winst. Daarna 4, 5, 6, 7 los te leveren.

## Buiten scope

- Geen shell redesign (sidebar/nav blijft).
- Geen nieuwe routes.
- Geen i18n-uitbreiding behalve nieuwe copy keys in `portalCopy`.

## Wat ik nog niet kon doen

Live screenshot van /client kon ik niet maken — de geïnjecteerde sessie is een operator/owner en `/client` redirect operators naar `/dashboard`. Audit is daarom puur source-driven. Als je wilt dat ik visuele design-richtingen render (3 prototypes naast elkaar om uit te kiezen) voordat ik bouw, zeg het en ik genereer ze op basis van de huidige code + jouw kleur/typo voorkeuren.