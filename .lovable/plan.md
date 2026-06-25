
# Client Dashboard — Magazine Layout & Section Contrast

## Probleem

Het dashboard is technisch correct, maar visueel leest het als één doorlopend cream vel met hairlines erin. Geen ritme, geen "ik ben in een nieuwe sectie" gevoel, geen beeld. Voor een klantportaal dat als een **maandelijks rapport** moet aanvoelen, is dat te plat.

## Richting (gekozen door jou)

- **Scheidingsstijl:** beeld & kleurcontrast tussen secties
- **Sfeer:** rapport / magazine (editorial, warm, ruimte voor verhaal)

De charcoal hero blijft. Daaronder krijgt elke logische sectie z'n eigen "band" met een eigen achtergrondtint, zodat de pagina leest als opeenvolgende hoofdstukken in een gedrukt rapport.

## Sectie-ritme (van boven naar beneden)

```text
┌──────────────────────────────────────────────────┐
│  CHARCOAL HERO  (greeting + goal + ring)         │  donker
├──────────────────────────────────────────────────┤
│  ░ Won banner (optioneel, groen wash)            │  groen accent
├──────────────────────────────────────────────────┤
│  ▓▓ KPI BAND — diepe cream + amber wash          │  warm accent
│     omzet groot, conversie/bezoekers secundair   │
├──────────────────────────────────────────────────┤
│  PAPER — Story highlights (editorial copy)       │  licht cream
│  + drop cap, pull quote, kolombreedte ~640px     │
├──────────────────────────────────────────────────┤
│  ▓▓ TREND BAND — wit met fijne grid              │  wit
│     traffic chart + publish annotaties           │
├──────────────────────────────────────────────────┤
│  PAPER — Recent leads (cards met avatar-initial) │  licht cream
├──────────────────────────────────────────────────┤
│  ░░ TIMELINE BAND — donkere cream / sage         │  koel accent
│     "Wat we deden" als magazine-lijst            │
├──────────────────────────────────────────────────┤
│  PAPER — side rail content (report / next up)    │  licht cream
└──────────────────────────────────────────────────┘
```

Elke band is **full-bleed** (loopt van rand tot rand binnen de main column) met een eigen achtergrond. Inhoud blijft gecentreerd in dezelfde max-width. Dat is de magazine-move: de "papierkleur" verandert, de typografie-as blijft staan.

## Wat ik concreet doe

### 1. Section primitives (`src/components/client/sections.tsx`, nieuw)
- `<DashboardBand tone="paper|cream|white|sage|amber|charcoal">` — full-bleed wrapper met de juiste achtergrond + verticale padding (py-12 lg:py-16) + binnen-content op `max-w-[1600px]`.
- `<MagazineSection eyebrow title kicker>` — editorial section-header: kleine eyebrow (amber, niet mono), grote display-titel (serif accent of Hanken bold display), optionele kicker-zin. Vervangt de huidige `SectionLabel`-only headers.

### 2. ClientShell aanpassen
- `<main>` raakt z'n eigen `px/py` kwijt → bands beheren hun eigen padding. Dit is de enige manier om écht full-bleed kleurvlakken te krijgen zonder de side-margins te breken.
- `children` worden niet meer in één `max-w` div gepropt; pagina's renderen direct `<DashboardBand>`'s.

### 3. `src/routes/client/index.tsx` herstructureren
Huidige one-column-met-aside structuur omgooien naar opeenvolgende bands:
- **Band 1 — KPI** (cream-deep + radial amber wash, lijkt op de hero maar lichter): omzet als hero-KPI, conversie/bezoekers ernaast in glas-kaarten i.p.v. paper-cards.
- **Band 2 — Story** (paper, editorial): `StoryHighlights` krijgt eyebrow "Hoogtepunten" + grote serif titel + smalle leeskolom (max-w-2xl).
- **Band 3 — Trend** (wit, fijne dotgrid): chart + bron-verdeling **naast elkaar** (de side-rail verdwijnt; alles wordt verticaal ritme i.p.v. links/rechts).
- **Band 4 — Leads** (paper): cards met een kleine gekleurde avatar-cirkel (initial in amber/sage/blauw afhankelijk van bron) → meteen visueel verschil per rij.
- **Band 5 — Wat we deden** (sage/koel cream wash): timeline als magazine-list met grote nummering 01–06 in amber.
- **Band 6 — Volgende editie + rapport** (paper): laatste rapport als grote "cover card" met FileText-icoon op amber vlak (mini-magazine-cover), "coming next" ernaast als genummerde lijst.

### 4. Tokens in `src/styles.css`
Twee nieuwe achtergrond-tokens toevoegen zodat bands semantisch blijven:
- `--paper-deep` (een tint donkerder dan `--paper-subtle`, voor KPI-band)
- `--paper-sage` (heel zacht koelgroen-cream, voor timeline-band)
- Utility `.band-grid` (subtiele dot/line grid voor de trend-band).

Bestaande tokens (`--paper`, `--paper-subtle`, `--amber`, `--charcoal`) blijven, geen breaking changes elders.

### 5. Editorial typografie-tweaks
- Section-titels: groter (`text-2xl lg:text-3xl`, font-display, tracking-tight) i.p.v. de kleine SectionLabel.
- Eyebrows: amber, kleine caps, **niet** mono (de mono-feel hebben we al verworpen).
- Eén pull-quote per pagina in de Story-band (groot, serif-achtig via display font in italic) — geeft het "rapport" gevoel.

### 6. Beeld / iconografie
Geen stockfoto's (past niet bij operator-tool), maar wél meer visuele rust per band:
- KPI-band: grote getallen in amber, dunne hairline-divider tussen cellen i.p.v. losse cards.
- Trend-band: chart krijgt een lichte gradient-fill onder de lijn.
- Leads-band: gekleurde initial-avatars per bron (telefoon/formulier/walk-in elk een eigen tint).
- Report-card: grote vlakke amber "cover" met document-glyph — leest als magazine-cover.

## Wat ik **niet** doe

- Geen donker thema, geen nieuw kleurenpalet — we blijven binnen paper/cream/charcoal/amber.
- Geen wijzigingen aan data-functies of server-fns.
- `/client/leads`, `/client/pages`, `/client/reports` blijven deze ronde ongemoeid; eerst de home goed, daarna kunnen we hetzelfde band-systeem doortrekken.
- Geen nieuwe dependencies.

## Bestanden die ik raak

- `src/styles.css` (3 tokens + 1 utility)
- `src/components/app/ClientShell.tsx` (main wrapper padding weg, bands nemen over)
- `src/components/client/sections.tsx` (nieuw — `DashboardBand`, `MagazineSection`)
- `src/routes/client/index.tsx` (herstructureren naar bands, side-rail opheffen)
- `src/components/client/dashboard.tsx` (lichte aanpassingen: `StoryHighlights` + `TrafficTrend` headers gebruiken `MagazineSection`)

## Verwacht resultaat

Je scrolt door duidelijk verschillende "hoofdstukken": donkere hero → warm KPI-vlak → wit leesblok → wit chartblok → cream leadsblok → koel timeline-blok. Het cream is niet weg, maar het is niet meer het hele vel — het wisselt af met witter, warmer en koeler, precies zoals een gedrukt maandrapport leest.
