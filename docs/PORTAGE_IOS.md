# Portage iOS — le contrat de chaque module

**Pour qui :** la personne qui écrira la version iOS des 16 modules livrés dans la PWA.
Ce document ne raconte pas ce que fait l'application ; il dit, module par module, *ce qui
doit être réécrit à l'identique*, *ce qui peut être repensé*, et *ce qui ne se porte pas*.

**État au 20 octobre 2026** — PWA `pwa_2026/` : version 2.2.0, 18 fichiers dans `js/`,
dont 16 modules enregistrés. iOS `ios_2026/` : 23 fichiers Swift, aucun des 16 modules.
L'écart porte entièrement sur la couche fiscale.

---

## 1. Le principe directeur

Les deux applications ne partagent pas de code, elles partagent **un état**. Tout le
portage tient dans cette phrase : si un calcul iOS part du même `state` et rend le même
nombre que son homologue JavaScript, il est porté ; sinon il ne l'est pas, quelle que
soit la ressemblance de l'interface.

Chaque module se décompose en trois couches, et une seule est contraignante :

| Couche | Exemple | Règle de portage |
|---|---|---|
| **Données** | `state.baux`, `state.biens` | **Identique, au nom de clé près.** C'est le format d'échange. |
| **Calcul** | `calculDPA()`, `calculAcomptes()` | **Identique au cent près.** Toute divergence est un défaut. |
| **Présentation** | `renderDPA()` | **Libre.** SwiftUI n'a pas à imiter le HTML. |

La couche calcul est petite : sur ~4 700 lignes de modules, le calcul pur en représente
moins du quart. Le reste est du rendu, qui se réécrit naturellement en SwiftUI.

---

## 2. Le pont existe déjà

`ios_2026/RevenusDepenses/Services/BackupService.swift` sait **déjà** lire une sauvegarde
de la PWA : `restorePWA(_ state:setup:)` ingère l'enveloppe produite par
`backupPayload()` :

```js
{ format: 'pwa-depenses', version: 3, year: activeYear, setup, state }
```

Conséquence pratique : **n'inventez pas de format d'échange**. Le portage d'un module
commence par étendre `restorePWA` à la clé d'état de ce module, et se termine par un
aller-retour PWA → iOS → PWA qui rend le fichier identique. Tant que cet aller-retour
n'est pas vérifié, le module n'est pas porté.

Deux choses ne traversent jamais ce pont, par conception :

- **`depenses_setup`** — la configuration locale (modules activés, thème, immeubles
  déclarés). Elle vit dans une clé `localStorage` distincte et **n'est jamais envoyée à
  Firestore**. iOS a son équivalent dans `AppSetup.swift` ; gardez-les séparés.
- **Les clés d'état créées paresseusement.** `defaultState()` ne déclare que
  `settings`, `p1090`, `p470`, `vehicule`, `uber`, `lyft`, `trips`, `recurring`,
  `checklist`, `receipts`, `notes`. Toutes les autres (`baux`, `biens`, `impot`,
  `taxes`, `simu`, `vente`, `ventilations`, `kmJournal`, `importQueue`,
  `importHashes`, `closed`, `closedHistory`) sont créées **au premier usage** par leur
  module. Un état vierge est donc un état où ces clés sont absentes, pas vides : côté
  Swift, ce sont des optionnels, et chaque calcul doit rendre un résultat neutre quand
  la clé manque. Les assertions M250/M251 de `tests/pwa_modules_suite.js` verrouillent
  exactement ce comportement ; portez-les en premier.

---

## 3. Le socle à porter avant tout module

`pwa_2026/js/app-modules.js` et `fiscal-data.js` ne sont pas des fonctionnalités : ce
sont les fondations dont les 16 autres dépendent.

**`app-modules.js`** — le registre (`APP_MODULES`, `registerModule`, `initModules`) n'a
pas d'équivalent utile en SwiftUI, où la composition de vues joue ce rôle. Ce qui doit
être porté, ce sont les utilitaires, parce que *tous* les calculs les traversent :

| Fonction JS | Rôle | Équivalent Swift |
|---|---|---|
| `num(v)` | tolère `"1 234,56"`, `"1,234.56"`, `null` → `Double` | à écrire, et à tester sur les mêmes cas |
| `fmt(n, dec)` / `money(n)` | format fr-CA, espace insécable, `$` suffixe | `NumberFormatter` locale `fr_CA` |
| `readYear(y)` / `writeYear(y, st)` | lit/écrit l'état d'une autre année | `DataService` |
| `yearClosed(y)` / `guardClosed()` | refuse toute écriture sur une année clôturée | **à porter tel quel** : c'est une garde d'intégrité |
| `csvCell` / `csvLigne` | échappement CSV (guillemets doublés) | `CSVExportService` |
| `escH` / `escJS` | échappement HTML/JS | sans objet en SwiftUI |

**`fiscal-data.js`** — l'objet `FISCAL` porte tous les paramètres 2025 et 2026 (paliers,
BPA, RRQ, RQAP, FSS, taux d'inclusion du gain en capital, indemnité kilométrique, taux
de TPS/TVQ, catégories de DPA). `fiscal(year)` applique un **repli** sur l'année connue
la plus proche et le signale par `_repli`, que l'interface affiche.

> **Décision à prendre tôt :** dupliquer ces paramètres en Swift, ou les extraire dans un
> `fiscal.json` lu par les deux applications. La duplication est plus simple ; elle se
> paiera chaque année au budget du Québec, en deux fois. Recommandation : extraire le
> JSON au moment du portage de la vague 1, pendant que les deux versions sont fraîches.
> `docs/FISCALITE.md` donne la source officielle de chaque chiffre : c'est la référence
> qui fait foi, pas le code.

---

## 4. Module par module

Vague = ordre de portage conseillé (§5). « Calcul » liste les fonctions **pures** à
reproduire au cent près ; le reste du fichier est du rendu.

| Module (`id`) | Fichier | Clé d'état | Calcul à porter | Destination iOS | Vague |
|---|---|---|---|---|---|
| `impot` | `impot.js` (447 l.) | `impot` | `assiettes()`, `calculImpot()`, `tauxMarginalEstime()`, `calculAcomptes()`, `dpaReclameeParUsage()`, `vehiculeProrataAffaires()`, `lyftNetIncome()` | `Services/TaxService.swift` + vue Impôt | 1 |
| `dpa` | `dpa.js` (512 l.) | `biens` | `clePool()`, `calculDPA(year)`, `admissibleAII()`, `fnaccReportee()`, `reclamerMaxDPA()`, `renoncerDPA()` | `Services/CCAService.swift` | 1 |
| `baux` | `baux.js` (468 l.) | `baux` | `moisCouvertsParBail()`, `totalSaisiUnite()`, `ecartsLoyers()`, `bauxRL31()`, `reporterBaux()`, `decalerAnnee()` | `Models/Lease.swift` + vue Baux | 2 |
| `taxes` | `tps-tvq.js` (250 l.) | `taxes` | `contenuTaxes()`, `calculTaxes()`, `lyftTaxableBase()` | `Services/SalesTaxService.swift` | 2 |
| `vehicule-methodes` | `vehicule-methodes.js` (130 l.) | *(lecture seule)* | `vehDepensesTotal()`, `comparerMethodesVehicule()` | vue Véhicule | 2 |
| `kilometrage` | `kilometrage.js` (265 l.) | `kmJournal` | `coherenceKm()`, `distanceTrace()`, `haversineKm()`, `joursDepuisDernierTrajet()` | `DistanceService` (existe) + CoreLocation | 2 |
| `ventilation` | `ventilation.js` (287 l.) | `ventilations` | `ciblesVentilation()`, `totalPctVentilation()` | `Services/SplitService.swift` | 2 |
| `import-bancaire` | `import-bancaire.js` (488 l.) | `importQueue`, `importHashes` | `parseCSVBancaire()`, `parseOFX()`, `parseDateBancaire()`, `normaliserLibelle()`, `regleCorrespondante()`, `empreinteTx()`, **`clesTx()` / `cleMatch()`** | étendre `PDFStatementParser` | 2 |
| `simulateur` | `simulateur.js` (427 l.) | `simu` | `tauxMensuelCanadien()`, `paiementHypothecaire()`, `premiereAnnee()`, `droitsMutationEstimes()`, `miseDeFondsSuffisante()`, `simuler()`, `simulerUber()` | `Services/PurchaseSimulator.swift` | 3 |
| `vente` | `vente.js` (391 l.) | `vente` | `venteProp()`, `impotCombineSur()`, `calculVente()` | `Services/SaleSimulator.swift` | 3 |
| `tableau-bord` | `tableau-bord.js` (283 l.) | *(lecture pluriannuelle)* | `totauxAnnee()`, `seriesPluriannuelles()`, `anomaliesPluriannuelles()` | Swift Charts | 3 |
| `coproprietaires` | `coproprietaires.js` (156 l.) | *(lecture seule)* | `partsImmeuble()`, `etatParCoproprietaire()` | vue Copropriétaires | 3 |
| `recommandations` | `recommandations.js` (337 l.) | *(lecture seule)* | `recommandations()` — un seul générateur de règles | `Services/AdviceEngine.swift` | 3 |
| `recus` | `recus.js` (273 l.) | `receipts` | `cleRecu()`, `parseCleRecu()`, `auditRecus()`, `extraireMontants()`, `extraireDate()` | **Vision** à la place de Tesseract | 4 |
| `dossier` | `dossier.js` (307 l.) | `receipts`, `notes` | les six générateurs CSV (`registreKmCSV`, `rl31CSV`, `dpaCSV`, `coproCSV`, `impotCSV`, `taxesCSV`) | `CSVExportService` + `Archive` | 4 |
| `cloture` | `cloture.js` (216 l.) | `closed`, `closedHistory` | `empreinteFiscale()`, `totauxCloture()`, `auditAvantCloture()` | `Services/YearLockService.swift` | 4 |

---

## 5. L'ordre de portage

**Vague 1 — le socle fiscal.** `app-modules` (utilitaires), `fiscal-data`, `impot`,
`dpa`. Rien d'autre ne tient debout sans eux : la DPA alimente l'impôt, l'impôt alimente
les acomptes, le tout alimente les recommandations. Fin de vague : l'app iOS affiche le
même impôt estimé que la PWA sur le même jeu de données.

**Vague 2 — la saisie courante.** `baux`, `taxes`, `vehicule-methodes`, `kilometrage`,
`ventilation`, `import-bancaire`. C'est ce qu'on utilise plusieurs fois par mois, donc
ce qui justifie l'app mobile. Fin de vague : une année entière peut être saisie sur iOS
sans toucher à la PWA.

**Vague 3 — l'analyse.** `simulateur`, `vente`, `tableau-bord`, `coproprietaires`,
`recommandations`. Aucune de ces fonctions n'écrit dans la déclaration ; elles peuvent
attendre, et elles profiteront de Swift Charts.

**Vague 4 — la sortie et la clôture.** `recus`, `dossier`, `cloture`. Ce sont les plus
dépendantes de la plateforme (OCR, ZIP, PDF) et les moins urgentes : la PWA les fait
déjà très bien depuis un ordinateur, au moment de la déclaration.

---

## 6. Les pièges de traduction JavaScript → Swift

Chacun a déjà produit un défaut réel dans ce projet ou en produirait un :

1. **`Double` partout, comme en JS.** Ne passez pas à `Decimal` par réflexe de
   comptabilité : les tests de parité comparent au cent près avec des résultats produits
   par des `Double`. Un `Decimal` donnerait des écarts d'un cent *et aurait raison*, ce
   qui est pire — vous ne sauriez plus quelle version est le défaut. Si vous voulez
   `Decimal`, changez les deux côtés le même jour.
2. **L'arrondi.** Le code JS arrondit par `Math.round(x * 100) / 100`. Swift arrondit
   `.5` différemment selon la fonction employée ; utilisez `(x * 100).rounded() / 100`
   (`.toNearestOrAwayFromZero`, le défaut) et rien d'autre.
3. **Les dates.** Tout est en ISO `AAAA-MM-JJ`, et les comparaisons se font **en
   chaînes**, jamais en objets `Date`. `calculAcomptes()` convertit en midi UTC
   (`Date.parse(iso + 'T12:00:00Z')`) précisément pour éviter le décalage de fuseau qui
   faisait basculer un versement d'un jour. Reproduisez ce midi UTC.
4. **Les clés d'objet comme index de mois.** `state.uber['2026-03']`, `receipts` indexé
   par `propId_section_cat_mois`. En Swift ce sont des `[String: …]`, pas des tableaux :
   l'ordre d'itération d'un dictionnaire n'est pas garanti, triez explicitement partout
   où la sortie est un fichier.
5. **Le point-virgule des CSV.** `detecterSeparateur()` choisit entre `,` et `;` selon
   le fichier ; Excel en français exporte en `;`. Et la virgule décimale française
   apparaît *dans* les cellules : l'échappement par guillemets doublés de `csvCell()`
   n'est pas décoratif. Un test l'a appris à ses dépens (T29).
6. **Les pourcentages.** Certains champs sont des pourcentages (`commissionPct`,
   `partTerrainPct`, `pctPropriete`), d'autres des fractions (`tauxInclusion: 0.5`).
   Respectez l'unité de chaque champ du `state` ; ne normalisez pas.
7. **La DPA ne réduit pas le PBR.** C'est une règle fiscale, pas un détail
   d'implémentation : `calculVente()` en dépend, et un portage « logique » la casserait.
   De même, la récupération de DPA est imposée à **100 %** tandis que le gain en capital
   l'est à **50 %**.

---

## 7. La parité des tests

`tests/pwa_modules_suite.js` contient 209 assertions, dont la moitié porte sur du calcul
pur — donc portable. Le chemin le plus court :

1. Côté PWA, `npm test` exécute tout sans navigateur (`tests/run-headless.js`, jsdom).
2. Pour chaque module porté, reprenez **les mêmes jeux d'entrée et les mêmes attendus**
   dans un `XCTestCase` du même nom (`M158`, `M159`…). Les identifiants d'assertion sont
   faits pour ça : une discussion sur « M174 » doit désigner le même calcul des deux
   côtés.
3. Les assertions d'état vierge (M250, M251) et de cohérence de version (V1–V4, M202,
   M203) n'ont pas d'équivalent iOS : la version y est portée par le bundle.

---

## 8. Ce qui ne se porte pas, et par quoi le remplacer

| PWA | iOS |
|---|---|
| Tesseract.js (OCR des reçus) | **Vision** (`VNRecognizeTextRequest`) — plus précis, hors ligne, gratuit |
| JSZip (dossier comptable) | `Archive` / `NSFileCoordinator`, ou le partage d'un dossier |
| `jsPDF` (rapport comptable) | `PDFReportGenerator.swift` — **existe déjà, à parité** |
| Firebase compat par CDN | SDK Firebase natif, ou iCloud/CloudKit |
| `navigator.geolocation` | CoreLocation — `DistanceService.swift` existe déjà |
| `localStorage` par année | SwiftData, déjà en place (`DataService`) |
| Service worker / cache busting | sans objet : l'App Store versionne le bundle |

**Rappel de déploiement :** `docs/DEPLOIEMENT_IOS.md` couvre l'inscription au programme
Apple Developer, l'archivage et la soumission. Ce document-ci ne traite que du code.

---

## 9. Checklist, par module porté

- [ ] La clé d'état est lue et écrite par `restorePWA`, et l'aller-retour PWA → iOS → PWA
      rend un fichier identique.
- [ ] Un état où la clé est **absente** rend un résultat neutre, sans plantage.
- [ ] Les fonctions de calcul listées au §4 existent, avec les mêmes noms.
- [ ] Les assertions correspondantes de `pwa_modules_suite.js` sont reprises en XCTest,
      avec les mêmes identifiants.
- [ ] Une année clôturée refuse l'écriture (`guardClosed`).
- [ ] Les montants s'affichent en fr-CA, et les fichiers exportés portent le même
      séparateur et le même échappement qu'en PWA.
