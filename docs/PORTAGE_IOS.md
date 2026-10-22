# Portage iOS — le contrat de chaque module

**Pour qui :** la personne qui écrira la version iOS des 16 modules livrés dans la PWA.
Ce document ne raconte pas ce que fait l'application ; il dit, module par module, *ce qui
doit être réécrit à l'identique*, *ce qui peut être repensé*, et *ce qui ne se porte pas*.

**État au 22 octobre 2026** — PWA `pwa_2026/` : version 2.7.0, 20 fichiers dans `js/`,
dont 17 modules enregistrés. iOS `ios_2026/` : 23 fichiers Swift d'interface et de
persistance, **plus un noyau de calcul de 4 fichiers** (`RevenusDepenses/Core/`) qui porte
la vague 1 — le socle, les paramètres fiscaux, l'impôt et la DPA. Vérifié par 57 assertions
de parité contre la PWA (`npm run parite`). L'écart restant porte sur les vagues 1 bis à 4.

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

> **Décision prise à la vague 1 (2.7.0) : les paramètres sont dupliqués en Swift, et la
> duplication est verrouillée par un test.** `Core/FiscalData.swift` porte les mêmes
> blocs 2025 et 2026 que `FISCAL`, et les assertions **P01–P04** comparent les deux
> tableaux champ par champ — paliers, seuils, taux, dates d'échéance, date de vérification.
> Une coquille sur un seuil ne déplace donc pas silencieusement chaque montant déclaré :
> elle fait échouer `npm run parite`.
>
> Pourquoi ne pas avoir extrait un `fiscal.json` lu par les deux applications : il aurait
> fallu que la PWA le charge au démarrage — une requête de plus avant le premier calcul,
> et un mode hors-ligne à gérer pour un fichier qui change deux fois l'an. Le test rend le
> même service que le fichier partagé, sans ajouter de dépendance au démarrage. Ce qui
> reste vrai dans les deux cas : `docs/FISCALITE.md` donne la source officielle de chaque
> chiffre, et c'est elle qui fait foi, pas le code.

---

## 4. Module par module

Vague = ordre de portage conseillé (§5). « Calcul » liste les fonctions **pures** à
reproduire au cent près ; le reste du fichier est du rendu.

| Module (`id`) | Fichier | Clé d'état | Calcul à porter | Destination iOS | Vague |
|---|---|---|---|---|---|
| `impot` | `impot.js` (447 l.) | `impot` | `assiettes()`, `calculImpot()`, `tauxMarginalEstime()`, `calculAcomptes()`, `dpaReclameeParUsage()`, `vehiculeProrataAffaires()`, `lyftNetIncome()` (délègue à `lyftNetTotal()`) | **✅ `Core/TaxService.swift`** ; vue Impôt à écrire | 1 |
| `dpa` | `dpa.js` (512 l.) | `biens` | `clePool()`, `calculDPA(year)`, `admissibleAII()`, `fnaccReportee()`, `reclamerMaxDPA()`, `renoncerDPA()` | **✅ `Core/CCAService.swift`** ; vue DPA à écrire | 1 |
| `baux` | `baux.js` (468 l.) | `baux` | `moisCouvertsParBail()`, `totalSaisiUnite()`, `ecartsLoyers()`, `bauxRL31()`, `reporterBaux()`, `decalerAnnee()` | `Models/Lease.swift` + vue Baux | 2 |
| `taxes` | `tps-tvq.js` (276 l.) | `taxes` | `contenuTaxes()`, `calculTaxes()`, `lyftTaxableBase()`, `lyftTaxTotals()` | `Services/SalesTaxService.swift` | 2 |
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
| `cloture` | `cloture.js` (221 l.) | `closed`, `closedHistory` | `empreinteFiscale()`, `totauxCloture()`, `auditAvantCloture()` | `Services/YearLockService.swift` | 4 |
| `journal` | `journal.js` (532 l.) | *(clé propre `depenses_journal_<année>`, hors `state`)* | `journalAppareil()`, `journalValeur()`, `journalLabel()`, `journalEntrees()`, `journalEntreeLot()`, `journalAjouter()` (regroupement), `journalFiltrer()`, `journalGrouper()`, `journalPhrase()` | `Services/ChangeLogService.swift` + vue Historique | 1 bis |

---

## 5. L'ordre de portage

**Vague 1 — le socle fiscal. ✅ Calcul livré le 22 octobre 2026 (2.7.0).**
`app-modules` (utilitaires), `fiscal-data`, `impot`, `dpa`. Rien d'autre ne tient debout
sans eux : la DPA alimente l'impôt, l'impôt alimente les acomptes, le tout alimente les
recommandations.

Les quatre fichiers de `RevenusDepenses/Core/` rendent **les mêmes nombres que la PWA**,
vérifié par 57 assertions (§ 7). Ce qui reste de la vague 1 est de l'interface : les vues
Impôt et DPA, et le branchement de `DataService` sur `EntreesImpot` et
`[BienAmortissable]`. Le calcul, lui, est fini et ne lit rien — c'est ce qui rend le reste
mécanique.

> **Le noyau ne dépend que de Foundation** : ni UIKit, ni SwiftData, ni état d'application.
> Ce n'est pas un purisme. C'est ce qui permet de le compiler pour macOS et d'exécuter la
> parité en deux secondes sans simulateur, et c'est aussi ce qui garantit qu'un calcul ne
> peut pas aller chercher une donnée derrière le dos de son appelant. `AppConfig.swift`
> importe UIKit : le noyau ne doit jamais en dépendre.

**Vague 1 bis — la fusion et sa trace, dès que la saisie iOS compte.** `sync.js` est du
calcul pur sur un arbre (`[String: Any]` en Swift, ou le `JSONValue` que vous préférez) :
aucune dépendance à Firebase, aucune à `state`. Tant qu'il n'est pas porté, l'iPhone reste
le seul appareil qui ne participe pas à la fusion — et un `syncPush` iOS écrit en
remplacement **ré-introduirait** la perte de données que la 2.5.0 a éliminée côté PWA.
Si le portage tarde, l'app iOS doit s'en tenir à l'import/export d'enveloppe (§ 2) et ne
jamais écrire dans `users/<uid>/years/<année>`.

`journal.js` se porte dans la même vague, et pour la même raison : c'est `syncDater()` et
`syncFusionner()` qui produisent la matière du journal (`{chemin, avant, après, genre}`),
alors un iPhone qui fusionne sans journaliser serait le seul appareil incapable de dire
*pourquoi* un total a changé. Le fichier est volontairement autonome — il porte ses propres
noms de mois et ne lit `state` que pour reconstituer le lexique à l'affichage — et son
journal n'est **pas** synchronisé : chaque appareil garde le sien (§ 2.10 de
[ARCHITECTURE.md](ARCHITECTURE.md)), donc rien à négocier côté Firestore.

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
2. **L'arrondi.** Le code JS arrondit par `Math.round(x * 100) / 100` ; écrivez
   `(x * 100).rounded() / 100` et rien d'autre. **Les deux ne sont pourtant pas
   équivalents sur les demis négatifs** : `Math.round(-0.5)` vaut `-0` (JavaScript arrondit
   vers +∞), là où `.rounded()` vaut `-1` (`.toNearestOrAwayFromZero`). La vague 1 n'en
   souffre pas — les deux seuls arrondis de la PWA portent sur un montant ensuite borné par
   `max(0, …)`, et les délais en jours sont des entiers exacts — mais un montant négatif
   arrondi au cent exigera `.rounded(.toNearestOrAwayFromZero)` d'un côté ou l'autre, à
   décider explicitement.
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
7. **Le signe des champs de coût.** Les frais de plateforme, les taxes payées à la
   plateforme et celles qu'elle a déjà versées au nom du chauffeur sont stockés en
   **valeur absolue** : tous les totaux les retranchent. Les relevés les présentent en
   négatif ; `cout()` n'en garde que la magnitude. Un portage qui lirait le relevé
   « fidèlement » ferait additionner les frais au revenu — c'est exactement le défaut
   corrigé en 2.3.0, verrouillé par T96 et T97. La règle ne vaut **que** pour les
   sorties d'argent : les péages encaissés figurent eux aussi en positif sur le relevé
   et sont un revenu — ils ne passent pas par `cout()`. Le critère n'est pas le signe
   imprimé, c'est le sens du flux.
8. **Une feuille qui devient un conteneur n'est pas une feuille disparue.** Dans
   `sync.js`, l'arbre est aplati en chemins ; saisir la première valeur d'une catégorie
   fait passer `uber` de feuille (`{}`) à conteneur (`uber.rides_gross`). Traité comme une
   disparition, ce changement pose une pierre tombale qui efface la catégorie entière sur
   l'autre appareil. Le symétrique compte autant : la coquille vide `uber: {}` reçue d'un
   appareil qui n'a jamais touché la catégorie ne doit pas écraser la catégorie remplie
   d'ici. Les deux ont été de vraies pertes de données, et aucune des deux n'a été vue par
   les tests — seulement en navigateur, deux appareils côte à côte. M294–M299.
9. **Une case qui naît vide ne se date pas.** Saisir avril dans une nouvelle catégorie
   crée les onze autres cases d'un même geste. Datées, ces cases vides sont plus récentes
   que les loyers déjà saisis ailleurs, et la fusion les efface. Vider une case qui
   **portait** un montant est, à l'inverse, une écriture : elle se date et elle gagne. La
   distinction est locale et ne tient qu'à une chose — la valeur existait-elle avant ?
   M300–M304.
10. **La DPA ne réduit pas le PBR.** C'est une règle fiscale, pas un détail
   d'implémentation : `calculVente()` en dépend, et un portage « logique » la casserait.
   De même, la récupération de DPA est imposée à **100 %** tandis que le gain en capital
   l'est à **50 %**.
11. **`parseFloat` lit le plus long préfixe valide ; `Double(_:)` exige la chaîne
   entière.** `num('12.3.4')` rend `12.3` côté PWA, parce que `parseFloat` s'arrête au
   second point. `Double("12.3.4")` rend `nil`, et un portage « raisonnable » rendrait
   donc `0` — soit un montant saisi qui disparaît en silence. `Socle.num` imite
   explicitement le préfixe le plus long (P08 le vérifie sur douze chaînes, dont les
   espaces insécables du clavier québécois et les parenthèses comptables `(123,45)` qui
   valent un montant négatif).
12. **`Array.prototype.sort` est stable depuis ES2019 ; `sorted(by:)` ne l'est pas.** Dès
   qu'un tri sert à départager des éléments de même rang, l'ordre d'insertion n'est pas
   conservé en Swift. `reclamerMaxDPA()` trie les catégories par taux décroissant pour
   réclamer d'abord les plus rapides : deux catégories de même taux sortaient dans un ordre
   arbitraire, donc avec des montants réclamés différents d'une exécution à l'autre.
   Comparez explicitement l'index d'origine en second critère.

---

## 7. La parité des tests

`tests/pwa_modules_suite.js` contient 297 assertions, dont la moitié porte sur du calcul
pur — donc portable. Les 45 assertions de fusion (M260–M304) sont intégralement portables :
`sync.js` ne touche à rien d'autre qu'un arbre et des dates. Les 30 assertions du journal
(J01–J30) le sont presque toutes : seules celles qui nomment l'appareil (J06) et celles qui
rendent l'écran (J30) demandent un attendu propre à la plateforme — un iPhone doit s'y
nommer « iPhone », pas se faire reconnaître à son `User-Agent`.

### 7.1 Le mécanisme, livré avec la vague 1

```bash
npm test                 # les trois suites de la PWA, sans navigateur
npm run parite:export    # relève la référence sur la suite de modules
npm run parite           # compile le noyau Swift et rejoue la référence
```

**La référence est relevée, pas retapée.** C'est le point qui mérite d'être compris avant
de porter la vague suivante. `tests/pwa_modules_suite.js` recueille, *au moment même où ses
assertions les vérifient*, les valeurs qu'elle mesure (champ `parite` de son résultat).
`tests/export-parite.js` exécute cette suite sous jsdom et écrit ce qu'elle a relevé dans
`ios_2026/Tests/Parity/parite-vague1.json`. La suite Swift rejoue ce fichier.

Ce que compare donc la parité n'est pas « Swift contre des nombres écrits à la main », mais
« Swift contre ce que la PWA produit vraiment ». Retaper les attendus aurait créé une
troisième vérité : à chaque budget du Québec, trois endroits à corriger, et deux occasions
de se tromper. L'export refuse de relever la référence si une seule des 297 assertions est
en échec — une référence prise sur une suite rouge figerait le défaut dans le JSON, et la
parité le reproduirait fidèlement.

Trois précautions, chacune apprise en écrivant la vague 1 :

- **Le moment du relevé compte.** La fixture évolue en cours de suite : la section C donne
  5 000 $ de DPA réclamée au bâtiment puis ajoute une automobile de catégorie 10.1 avant
  que la section F ne calcule l'impôt. Chaque scénario est donc capturé là où ses
  assertions le voient, et non à la fin.
- **`Infinity` n'existe pas en JSON.** Le dernier plafond d'un barème sort à `null` et
  redevient `.infinity` au décodage (`paliersDeRef`). Comparer deux `.infinity` par
  soustraction donne `NaN` : les sentinelles se comparent par égalité, jamais par écart.
- **La date du jour est épinglée dans la référence.** Les acomptes en dépendent ;
  `calculAcomptes` accepte un `aujourdhui` injecté précisément pour cela. Sans quoi la
  parité aurait échoué au premier 15 décembre franchi, pour une raison étrangère au code.

### 7.2 Deux familles d'identifiants

| Famille | Ce qu'elle vérifie | Exemple |
|---|---|---|
| `P01`–`P28` | **Parité.** La sortie Swift contre ce que la PWA a produit, au cent près. C'est le contrat : un écart ici veut dire que les deux applications déclareraient des montants différents pour un même dossier. | `P23` — `calculImpot()` : les 19 montants du calcul |
| `M##` | **Invariants** de la suite JavaScript, repris **sous le même identifiant** et vérifiés sur la sortie Swift. Ils ne comparent rien à la PWA ; ils redisent en Swift la règle que le calcul doit respecter. | `M24` — classe distincte pour un bâtiment locatif ≥ 50 000 $ |

Les identifiants d'assertion sont faits pour ça : une discussion sur « M24 » doit désigner
la même règle des deux côtés. La vague 1 reprend ainsi `M19`–`M33` (DPA) et `M53`–`M63`
(impôt et acomptes).

**Trois assertions de la suite JS n'ont volontairement pas d'équivalent Swift**, et la
raison est écrite dans l'en-tête de `ParitySuite.swift` pour qu'on ne les cherche pas :
`M06` (`escH`) porte sur l'échappement HTML, dont SwiftUI se charge par construction ;
`M08`/`M09` (`readYear`/`writeYear`) portent sur `localStorage`, qui est le métier de
`DataService`. De même, les assertions d'état vierge (M250, M251) et de cohérence de
version (V1–V4, M202, M203) n'ont pas d'équivalent iOS : la version y est portée par le
bundle.

### 7.3 Pourquoi `swiftc` et pas `xcodebuild`

`scripts/ios-parity.sh` compile le noyau **pour macOS**, avec `swiftc`, et exécute la suite
en deux secondes. Deux raisons :

1. Le projet n'a **pas encore de cible de tests**. `xcodebuild` sait construire
   l'application — vérifié le 22 octobre 2026 pour l'appareil et pour le simulateur, zéro
   avertissement, noyau compris — mais il n'a aucun test à exécuter, et en créer une cible
   demande Xcode, pas une ligne de commande.
2. Le noyau ne dépend que de Foundation, et c'est une contrainte d'architecture, pas une
   commodité : un calcul qui ne peut pas importer UIKit ne peut pas non plus aller chercher
   une donnée derrière le dos de son appelant. Quatre fichiers compilés pour macOS, aucun
   simulateur à démarrer, aucune application à lancer — la boucle de vérification tient
   dans le temps qu'il faut pour relire le diff.

`ios_2026/Tests/XCTest/CoreParityTests.swift` est déjà écrit et appelle la **même**
`ParitySuite.executer()`. Le jour où une cible de tests existera, la parité n'aura pas à
être réécrite — et surtout pas réécrite différemment. Son en-tête donne les quatre étapes
d'activation dans Xcode ; `main.swift` doit rester hors de la cible, un second `main` ne
compilant pas.

> `ios_2026/Tests/` vit **hors** de `ios_2026/RevenusDepenses/`, et ce n'est pas un détail :
> le projet utilise un `PBXFileSystemSynchronizedRootGroup`, donc tout fichier `.swift`
> placé sous `RevenusDepenses/` entre automatiquement dans la cible de l'application. Le
> lanceur en ligne de commande y aurait introduit un second point d'entrée.

### 7.4 Ce qu'il faudra relancer

`npm run parite:export` puis `npm run parite`, dans cet ordre, dès que l'un de ces trois
éléments change : un paramètre de `fiscal-data.js`, la fixture de la suite de modules, ou
le comportement d'une fonction portée. Le JSON est versionné dans git — c'est ce qui permet
de voir, dans un diff, qu'un barème a bougé.

---

## 8. Ce qui ne se porte pas, et par quoi le remplacer

| PWA | iOS |
|---|---|
| Tesseract.js (OCR des reçus) | **Vision** (`VNRecognizeTextRequest`) — plus précis, hors ligne, gratuit |
| JSZip (dossier comptable) | `Archive` / `NSFileCoordinator`, ou le partage d'un dossier |
| `jsPDF` (rapport comptable) | `PDFReportGenerator.swift` — **existe déjà, à parité** |
| Firebase compat par CDN | SDK Firebase natif, ou iCloud/CloudKit — mais le **moteur de fusion** (`sync.js`) se porte tel quel, et doit l'être avant toute écriture dans Firestore |
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
- [ ] La référence de parité couvre le module : la suite de modules relève ses valeurs
      (champ `parite`), et `npm run parite` les rejoue à l'identique.
- [ ] Les invariants correspondants de `pwa_modules_suite.js` sont repris dans
      `ParitySuite.swift`, **avec les mêmes identifiants**.
- [ ] Ce que le portage fait différemment est écrit dans l'en-tête du fichier Swift, et
      vérifié par une assertion (modèle : `CCAService` reçoit un fournisseur là où `dpa.js`
      lit `localStorage` — P21).
- [ ] Une année clôturée refuse l'écriture (`guardClosed`).
- [ ] Les montants s'affichent en fr-CA, et les fichiers exportés portent le même
      séparateur et le même échappement qu'en PWA.
