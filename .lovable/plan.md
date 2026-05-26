## Plan: View linked proposals echt werkend maken

Ik ga dit gericht oplossen als route/rendering-bug, geen nieuwe feature.

### 1. Routebreuk corrigeren
De linked-proposals file bestaat, maar de huidige route is als child van `/growth/masterplan` geregistreerd. Daardoor kan de parent `growth.masterplan.tsx` de child-route blokkeren/overschaduwen omdat die geen `<Outlet />` rendert.

Ik pas de proposals-route aan naar dezelfde flat-route stijl als audit proposals:

```text
src/routes/_authenticated/growth.masterplan.$itemId_.proposals.tsx
→ /growth/masterplan/$itemId/proposals
```

Dus niet als nested child onder `/growth/masterplan`, maar als zelfstandige sibling route.

### 2. Link target aanpassen
In `growth.masterplan.tsx` blijft de link inhoudelijk hetzelfde:

```text
/growth/masterplan/$itemId/proposals
```

maar hij moet verwijzen naar de nieuwe flat route die daadwerkelijk rendert.

### 3. Route-tree niet handmatig editen
`routeTree.gen.ts` wordt automatisch gegenereerd. Ik ga die niet handmatig aanpassen. Na het hernoemen van de routefile pakt TanStack Router dit zelf opnieuw op.

### 4. Pagina robuuster maken
Ik voeg op de proposals-pagina een duidelijke fallback toe zodat je nooit meer “er gebeurt niks” krijgt:

- loading state voor tenants;
- loading state voor proposals;
- error state zichtbaar op de pagina;
- lege state met teruglink naar Masterplan;
- duidelijke titel met item-id context.

### 5. Verificatie
Na implementatie controleer ik:

- de route `/growth/masterplan/5d65904f-5e9b-48a9-997b-6e618fbaf09d/proposals` rendert een echte pagina;
- klikken op “View linked proposals” navigeert zichtbaar;
- console/network geven geen route- of renderfout;
- als er geen proposals zijn, zie je expliciet waarom, niet een lege pagina.