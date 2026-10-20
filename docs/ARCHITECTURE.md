# Architecture — Revenus & Dépenses 2026

Deux applications indépendantes couvrent le même domaine fiscal (revenus locatifs
québécois + travail autonome rideshare) et échangent leurs données par fichiers JSON :

| | PWA | iOS |
|---|---|---|
| Dossier | `pwa_2026/` | `ios_2026/` |
| Techno | HTML/CSS/JS, aucun build | SwiftUI + SwiftData, iOS 17+ |
| Taille | 9 661 lignes (`index.html` 4 435 + 17 modules `js/` 5 226) | 5 570 lignes Swift, 23 fichiers |
| Stockage | `localStorage` + Firestore | SwiftData (CloudKit ou local) |
| Hébergement | Firebase Hosting `suivi-depenses-7dc02` | Xcode / appareil |
| Sortie comptable | PDF jsPDF + CSV | PDF UIGraphics + CSV |

Un troisième projet, **Boussole Fiscale**, a été regroupé dans `Boussole/` et n'est pas
couvert ici (projet Firebase distinct : `boussole-fiscale`).

---

## 1. Domaine fiscal commun

Les deux applications produisent les mêmes lignes de formulaires :

- **T776 / TP-128** — revenus de location, par immeuble :
  `8141` loyers bruts · `8690` assurances · `8710` intérêts · `9180` impôts fonciers ·
  `9200` frais de déplacement · `9220` services publics · `9949` total des dépenses ·
  `9369` revenu net avant répartition · `9946` part du contribuable
- **T2125 / TP-80** — travail autonome (Uber, Lyft)
- **Annexe DPA** — dépenses en capital, jamais déduites du revenu courant
- **Journal de kilométrage** — registre exigé par l'ARC et Revenu Québec

Deux méthodes de dépenses véhicule sont présentées côte à côte, le comptable tranche :

- **Méthode 1** — dépenses réelles au prorata : `total véhicule × (km activité / km annuels)`
- **Méthode 2** — indemnité par kilomètre

La ligne 9200 des immeubles utilise toujours la méthode 2, calculée depuis le journal.

Deux taux cohabitent pour la méthode 2, et c'est voulu : le socle applique le taux
unique de `settings.mileageRate` (0,72 $/km par défaut, modifiable), tandis que le
module `js/vehicule-methodes.js` applique les **paliers officiels** — 0,73 $/km pour les
5 000 premiers kilomètres d'affaires, 0,67 $/km ensuite en 2026 (`kmIndemnite()`). Le
module est la référence fiscale ; le réglage du socle reste pour les années antérieures
et pour un taux imposé par ailleurs.

---

## 2. PWA (`pwa_2026/`)

### 2.1 Fichiers

```
pwa_2026/
├── index.html      4 435 lignes — HTML + CSS + JS du socle (écrans 1 à 5)
├── manifest.json   nom, couleurs #1F3864, icône SVG inline en data: URI
├── sw.js           43 lignes — service worker, cache 'depenses-2026-v6'
└── js/             17 modules, 5 226 lignes — couche fiscale (voir § 2.8)
```

Aucun bundler, aucun `node_modules`, aucune étape de compilation : le fichier servi est
le fichier source. Les modules de `js/` sont chargés comme **scripts classiques**
(`<script src="js/x.js?v=6">`), donc ils partagent la portée globale de la page :
une fonction déclarée dans un module est appelable depuis `index.html` et
réciproquement. C'est voulu — c'est ce qui permet d'ajouter une fonctionnalité
sans toucher au socle.

### 2.2 Dépendances externes (CDN, chargées à la demande)

| Usage | Source |
|---|---|
| Auth + Firestore | `gstatic.com/firebasejs/10.12.2/*-compat.js` (en `<head>`) |
| Génération PDF | `cdnjs/jspdf/2.5.1` — chargé au premier rapport (ligne 3548) |
| Lecture PDF (relevés) | `cdnjs/pdf.js/3.11.174` — chargé au premier import (ligne 2888) |
| Distances | `maps.googleapis.com` — seulement si une clé API est saisie (ligne 2037) |

### 2.3 Modèle de données

Le `state` est un objet unique, sérialisé en JSON dans `localStorage`.

**Clés `localStorage` :**

| Clé | Contenu | Synchronisé ? |
|---|---|---|
| `depenses_<année>` | tout le `state` de l'année (`depenses_2026`, `depenses_2027`…) | oui, vers Firestore |
| `depenses_setup` | configuration : immeubles, % de propriété, copropriétaires, modules | **non** — jamais envoyée à Firestore |
| `depenses_active_year` | année affichée | non |

`storeKey()` (ligne 1010) compose la clé ; la liste des années disponibles est déduite
en balayant `localStorage` à la recherche de `/^depenses_\d{4}$/` (ligne 1016).

**Forme du `state` :** les immeubles sont des **clés de premier niveau** (`p1090`, `p470`,
`pNEW1`…), pas un tableau imbriqué :

```js
{
  version: 2,
  p1090:   { revenus: {"Coloc 1 (Salon)": [12 montants]}, deductibles: {…}, capital: {…} },
  p470:    { … },
  trips:   [{ id, date, property, reason, km, roundTrip, customDest }],
  uber:    { rides_gross, service_fee, km_online, … },
  lyft:    { "2026-10": { taxable, primes, pourboires, frais, km } },
  vehicule:{ depenses: { "Frais de carburant (total annuel)": "4800", … } },
  notes:   { "p1090_ded_Électricité_9": "…" },
  receipts:{ "<même clé>": "data:image/jpeg;base64,…" },
  recurring: { … },
  checklist: { … },
  settings:{ mileageRate, kmTotalAnnuel, vehicleModel, googleMapsApiKey, syncAuto }
}
```

Chaque catégorie porte un tableau de 12 montants (index 0 = janvier). Les reçus
base64 restent **locaux** : ils ne partent pas vers Firestore.

### 2.4 Persistance et synchronisation

```
saisie → autoSave()  ── debounce 600 ms ──→ save()
                                             ├─ localStorage.setItem(storeKey(), …)
                                             └─ debounce 5 s ──→ syncPush(false)
```

`save()` (ligne 1127) avale silencieusement les exceptions `localStorage`.
`syncPush` / `syncPull` (lignes 3198 / 3223) écrivent dans
`users/<uid>/years/<année>` sur Firestore, après connexion Google (`signInWithGoogle`,
ligne 3167). La configuration (`depenses_setup`) reste volontairement hors synchronisation.

### 2.5 Écrans

**Six** onglets, pilotés par `showTab()` qui appelle le `render*` correspondant :

| Onglet | Fonction | Contenu |
|---|---|---|
| 🏠 Accueil | `renderHome` 1840 | 4 cartes de totaux + formulaire de déplacement + trajets récents |
| 🚗 Trajets | `renderTrips` 2069 | journal de kilométrage complet |
| 🏘 Logements | `renderProperty` 2146 | sous-onglets par immeuble, grille mensuelle (`renderPropertyMonthly` 2176) et vue annuelle (`renderPropertyAnnual` 2270) |
| 🚕 Rideshare | `renderRideshare` 2340 | Uber (2347), Lyft (2379), véhicule (`renderVehicle` 2464) |
| 📊 Sommaire | `renderSummary` 2606 | synthèse + exports + checklist (`renderChecklist` 3430) + état par copropriétaire |
| 📑 Fiscal | `showFiscalSub` 1979 | 10 sous-onglets, un par module (voir § 2.8) |

Feuilles modales : année (`showYearSheet` 1035), réglages (`showSettingsSheet` 3116),
montants récurrents (`showRecurringSheet` 3292), revue d'import PDF (`showPDFReview` 3011),
assistant de configuration (`startOnboarding` 1406 / `renderOnb` 1469, 6 étapes dynamiques).

### 2.6 Entrées / sorties

| Opération | Fonction | Format |
|---|---|---|
| Sauvegarde JSON | `backupPayload` / `exportJSON` | enveloppe v3 : `{ format: 'pwa-depenses', version: 3, year, setup, state }` |
| Restauration JSON | `restoreFromBackup` / `handleImport` | enveloppe v3 **ou** ancien `state` à plat ; `mergeState()` puis `reconcilePropsFromState()` 1263 |
| Import sauvegarde iOS | `importIOSBackup` 2779 | Snapshot v2, sections `rev`/`ded`/`cap` |
| Export CSV | — | grille mensuelle, en-tête de 15 colonnes |
| Rapport PDF | ~3548-3900 | 1 page par immeuble + annexes (voir § 4) |
| Import relevé PDF | `showPDFReview` 3011 | pdf.js, extraction des montants Uber/Lyft |

`reconcilePropsFromState()` recrée les immeubles absents de `setup` à partir des clés
`p*` trouvées dans le `state`, avec des valeurs par défaut
(`label: 'Immeuble importé'`, `pct: 100`, adresse vide). Depuis l'enveloppe v3, ce repli
ne sert plus qu'aux fichiers de l'ancien format : une sauvegarde v3 porte sa propre
configuration et n'a donc rien à reconstruire.

`mergeState()` fusionne le fichier lu avec `defaultState()` (y compris `settings` et
`vehicule.depenses`) au lieu de le remplacer, afin qu'un réglage ajouté dans une version
ultérieure ne revienne pas `undefined` chez un utilisateur existant. Il est appliqué aux
quatre points d'entrée de l'état : chargement initial, changement d'année, `syncPull()`
et restauration d'une sauvegarde.

### 2.7 Service worker

`sw.js` applique **network-first pour le HTML** (toujours la dernière version, repli sur
le cache hors ligne) et **cache-first pour le reste**. Le nom du cache
(`depenses-2026-v6`) doit être incrémenté manuellement à chaque déploiement, sinon les
anciens caches ne sont pas purgés — et une ressource non-HTML (dont `tests/pwa_suite.js`)
peut continuer à être servie figée. `firebase.json` envoie en plus `no-cache` sur `sw.js`
et sur tout `*.html`, et `max-age=0, must-revalidate` sur tout `*.js` — ce qui règle le
cache **HTTP**, mais pas celui du service worker, qui sert les ressources non-HTML en
cache-first.

⚠️ Les modules de `js/` sont référencés avec leur propre numéro de version
(`js/dpa.js?v=6`). Recharger `index.html` avec un paramètre anti-cache ne les
rafraîchit donc **pas** : il faut incrémenter ce `?v=` dans les 17 balises
`<script>` **et** le nom du cache du service worker. C'est la cause la plus
fréquente de « le correctif ne prend pas » pendant le développement.

### 2.8 Couche modulaire (`pwa_2026/js/`)

Les fonctionnalités fiscales ajoutées après la version monofichier vivent chacune
dans son fichier. `index.html` ne connaît aucun module : il appelle trois points
d'accroche de `app-modules.js`, et chaque module s'inscrit lui-même.

```js
const APP_MODULES = []
function registerModule(m)        // m = { id, label, icon, subtab?, init?, render?, onYearChange? }
function initModules()            // appelé par init()        — injecte la feuille modale, puis m.init()
function notifyModulesYearChange()// appelé par switchYear()   — puis m.onYearChange()
```

Les erreurs d'un module sont attrapées et journalisées (`console.error('[module <id>] init', e)`) :
un module cassé ne doit pas empêcher l'application de démarrer.

**Chargement.** 17 balises `<script src="js/<module>.js?v=6">` en fin de `<body>`,
donc des **scripts classiques** et non des modules ES. Conséquence structurante :
tout ce qui est déclaré au niveau supérieur d'un fichier (`function`, `const`, `let`)
vit dans la portée lexicale globale partagée. Un module appelle donc `state`, `setup`,
`activeYear`, `save()`, `money()` directement, sans import ni préfixe `window.`.
Corollaire à connaître : `APP_MODULES`, `state` ou `FISCAL_SUBS` étant des `const`/`let`
globaux-lexicaux, ils ne sont **pas** des propriétés de `window` — une console de
débogage doit les évaluer par leur nom nu.

| Fichier | Lignes | `id` du module | Rôle |
|---|---|---|---|
| `app-modules.js` | 228 | — (socle) | registre, feuille modale, utilitaires (`num`, `money`, `escH`, `dl`, `csvCell`, `loadScript`, `readYear`/`writeYear`), verrou `guardClosed()` |
| `fiscal-data.js` | 259 | — (données) | paramètres fiscaux par année (`fiscal(year)`), paliers d'impôt, RRQ / FSS / RQAP, taux de DPA |
| `recommandations.js` | 337 | `recommandations` | pistes de rentabilité classées par gain estimé + bandeau d'accueil |
| `impot.js` | 375 | `impot` | impôt estimé, acomptes provisionnels, provision à mettre de côté |
| `tps-tvq.js` | 250 | `taxes` | TPS/TVQ sur les revenus de transport, CTI/RTI au prorata d'affaires |
| `dpa.js` | 512 | `dpa` | biens amortissables, catégories, règle du demi-taux, 1100(11), report de FNACC |
| `baux.js` | 468 | `baux` | baux, loyers, indexation, Relevé 31 |
| `vehicule-methodes.js` | 130 | `vehicule-methodes` | méthode 1 (frais réels au prorata) vs méthode 2 (taux au km), comparées |
| `coproprietaires.js` | 156 | `coproprietaires` | état par copropriétaire à partir du `%` de détention de chaque immeuble |
| `ventilation.js` | 287 | `ventilation` | ventilation automatique d'une dépense entre immeubles / mois |
| `recus.js` | 273 | `recus` | audit des pièces manquantes (montant saisi sans reçu joint) |
| `kilometrage.js` | 265 | `kilometrage` | journal de kilométrage assisté, odomètre, rappel d'accueil |
| `import-bancaire.js` | 453 | `import-bancaire` | import CSV/relevé avec règles de classement, file de revue, anti-doublon |
| `simulateur.js` | 427 | `simulateur` | simulateur d'achat d'immeuble et de km Uber supplémentaires |
| `tableau-bord.js` | 283 | `tableau-bord` | tableau de bord pluriannuel (lit les autres années via `readYear`) |
| `cloture.js` | 216 | `cloture` | clôture d'année verrouillée + empreinte des chiffres déclarés |
| `dossier.js` | 307 | `dossier` | dossier comptable complet en un ZIP |

**Le 6ᵉ onglet.** `FISCAL_SUBS` (index.html:1963) décrit les 10 sous-onglets dans
leur ordre d'affichage ; `showFiscalSub(id)` les rend. Un `si: () => …` conditionne
l'affichage à un module activé dans `setup.modules` — l'onglet TPS/TVQ n'apparaît
pas sans activité de transport, Baux et Reçus n'apparaissent pas sans immeuble.

**Points d'accroche dans le socle.**

| Accroche | Appelé par | Effet |
|---|---|---|
| `initModules()` | `init()` | `m.init()` de chaque module |
| `notifyModulesYearChange()` | `switchYear()` | `m.onYearChange()` — invalide notamment le cache de DPA |
| `guardClosed()` | 7 points de saisie de `index.html` + ~20 dans les modules | refuse la saisie et le dit, si l'année est clôturée |
| `renderBandeauProvision()` / `renderRecoAccueil()` / `renderRappelKm()` | `renderHome()` | trois bandeaux d'accueil : impôt à provisionner, meilleure recommandation, relance de l'odomètre |
| `reporterElementsAnnee()` | `createNewYear()` | propose de reporter biens amortissables (FNACC de fermeture → ouverture) et baux (avec indexation) |

**Lecture d'une autre année.** `readYear(year)` / `writeYear(year, st)` lisent et
écrivent directement `localStorage` sous `depenses_<année>`, en passant par
`mergeState()`. C'est ce qui permet au tableau de bord pluriannuel et au report de
FNACC de travailler sur des années non actives sans changer l'année courante.

**Données ajoutées au `state`.** Chaque module crée paresseusement sa propre clé
(elles sont absentes de `defaultState()`, donc une sauvegarde antérieure reste
lisible) : `biens` (DPA), `baux`, `kmJournal`, `impot`, `taxes`, `ventilations`,
`simu`, `importQueue` / `importHashes`, `closed` / `closedHistory`. Côté
configuration, `setup.reglesImport` et `setup.importOrdreUS` restent dans
`depenses_setup`, donc hors synchronisation.

---

## 3. iOS (`ios_2026/`)

### 3.1 Structure

```
ios_2026/RevenusDepenses/
├── App/        RevenusDepensesApp.swift (52)   RootView.swift (133)
├── Models/     AppConfig.swift (306)  Models.swift (175)
│               RentalProperty.swift (167)  AppSetup.swift (102)
├── Services/   DataService.swift (411)        BackupService.swift (411)
│               PDFReportGenerator.swift (607) PDFStatementParser.swift (178)
│               CSVExportService.swift (80)    DistanceService.swift (53)
│               DebugPDFSmokeTest.swift (165)  ← harnais DEBUG
└── Views/      PropertiesView (499)  OnboardingView (384)  PropertyEditorView (350)
                HomeView (320)  RideshareView (316)  SummaryView (269)
                Components (203)  SettingsView (202)  TripsView (102)
                PDFImportReviewView (85)
```

### 3.2 Persistance

Huit entités `@Model` SwiftData : `FiscalYear`, `RentalProperty`, `Trip`, `EntryAmount`,
`UberValue`, `LyftMonth`, `VehicleExpense`, `ChecklistItem`.

Toutes sont **compatibles CloudKit** : valeurs par défaut partout, aucun
`@Attribute(.unique)`, aucune collection non supportée (les catégories d'un immeuble sont
une chaîne séparée par des retours à la ligne plutôt qu'un tableau).

`RevenusDepensesApp.swift` tente un `ModelContainer` CloudKit puis retombe sur un
container **strictement local** si la capability n'est pas disponible :

```swift
static let iCloudCapabilityEnabled = false   // AppConfig.swift:21
static let cloudKitContainerID = "iCloud.com.ericfezeu.revenusdepenses"
```

Le drapeau est à `false` : l'app fonctionne aujourd'hui en local, le code CloudKit est
prêt mais inactif tant qu'un compte développeur payant n'a pas réactivé la capability.

### 3.3 Configuration

`AppConfig.swift` centralise les constantes : identité du contribuable, véhicule par
défaut, taux `0,72 $/km`, 22 000 km annuels, noms de mois, catégories standard
(déductibles, véhicule, Uber), palette de couleurs et locale `fr_CA`.

`legacyProperties = [p1090, p470]` décrit les deux immeubles d'origine ; depuis la
refonte, les immeubles sont des entités `RentalProperty` créées librement par
l'assistant (`OnboardingView`) ou l'éditeur (`PropertyEditorView`).

### 3.4 Services

| Service | Rôle |
|---|---|
| `DataService` | tous les totaux et agrégats ; prédicats SwiftData filtrés par année |
| `BackupService` | Snapshot v2 (export/import), `restorePWA` pour les JSON de la PWA |
| `PDFReportGenerator` | rapport comptable 9 pages |
| `PDFStatementParser` | lecture des relevés Uber/Lyft en PDF |
| `CSVExportService` | export 4 colonnes séparées par `;` |
| `DistanceService` | distances domicile → immeuble |
| `DebugPDFSmokeTest` | harnais de test activé par variables d'environnement |

Le Snapshot v2 transporte `year`, les immeubles avec `ownershipPct` et `coOwners`, et les
reçus en base64. Depuis l'enveloppe v3, la sauvegarde PWA transporte elle aussi `year`,
le % et les copropriétaires ; seuls les reçus base64 restent propres au Snapshot iOS.

### 3.5 Harnais de test intégré

`DebugPDFSmokeTest.runIfRequested(context:)`, appelé depuis `RootView.swift:67` en
configuration DEBUG seulement :

| Variable | Effet |
|---|---|
| `PWA_IMPORT_JSON=<chemin>` | importe une sauvegarde PWA et écrit `Documents/pwa_import_test.txt` |
| `PDF_SMOKE_TEST=1` | génère un jeu de données 2026 et écrit `Documents/smoke_test_report.pdf` |

Utilisable sans interface :

```bash
SIMCTL_CHILD_PDF_SMOKE_TEST=1 xcrun simctl launch <device> com.ericfezeu.revenusdepenses
```

---

## 4. Rapport comptable

Même plan dans les deux applications (le nombre de pages dépend du nombre d'immeubles
et d'annexes) :

| Page | Contenu |
|---|---|
| 1 | Résumé global — revenus locatifs, dépenses, bénéfice net, capital, net Uber, Lyft, déductions véhicule |
| 2…n | Un immeuble par page — T776/TP-128 ligne par ligne, % de participation, part des copropriétaires, ajouts en capital |
| n+1 | Travail autonome — relevé Uber annuel + détail mensuel Lyft (T2125/TP-80) |
| n+2 | Véhicule — dépenses réelles, répartition des km, méthodes 1 et 2, sommaire TPS/TVQ |
| Annexe A | Journal de kilométrage, sous-totaux mensuels |
| Annexe B | Détail mensuel par immeuble (deux semestres de 6 mois) |
| Annexe C | Notes et reçus |

Mesuré : 8 pages côté PWA et 9 côté iOS pour deux immeubles — iOS consacre une page
entière à l'annexe B de chaque immeuble là où la PWA les enchaîne.

**Le % de propriété n'est appliqué que dans le PDF** (lignes 9369 / 9946 et « part des
copropriétaires »). Les écrans et le CSV affichent partout les montants à 100 %.

---

## 5. Interopérabilité PWA ↔ iOS

| Direction | Mécanisme | Ce qui passe | Ce qui est perdu |
|---|---|---|---|
| iOS → PWA | Snapshot v2 → `importIOSBackup` | immeubles dynamiques, montants, trajets, notes, reçus base64, % et copropriétaires | rien |
| PWA → iOS | enveloppe v3 → `restorePWA` | montants, trajets, Uber, Lyft, véhicule, checklist, **immeubles configurés avec % et copropriétaires**, année | les reçus en base64 (jamais exportés par la PWA) |
| PWA → iOS (ancien format) | `state` à plat → `restorePWA` | montants, trajets, Uber, Lyft, véhicule | % et copropriétaires (repli 100 %), année devinée à partir des trajets, immeubles non historiques |

L'asymétrie venait du format d'export de la PWA, qui ne sérialisait que le `state`, sans
la clé `depenses_setup` ni l'année courante (`TESTS.md`, BUG-9 et BUG-10). Elle est
corrigée depuis le 19 octobre 2026 : la PWA écrit une enveloppe v3 et les deux
applications savent lire les deux formes. `depenses_setup` est toujours **exclu de la
synchronisation Firestore** — il n'est partagé que par un fichier de sauvegarde, de façon
explicite.

---

## 6. Déploiement

**PWA** — `firebase.json` à la racine publie `pwa_2026/` sur
`suivi-depenses-7dc02`, avec réécriture SPA vers `/index.html`. Procédure :

1. incrémenter `CACHE` dans `pwa_2026/sw.js`
2. incrémenter le `?v=` des 17 balises `<script src="js/…">` de `index.html`
   (sinon les modules restent servis depuis le cache du navigateur — voir § 2.7)
3. `firebase deploy --only hosting`

Tout fichier ajouté sous `pwa_2026/` est publié : les fichiers internes doivent rester
hors de ce dossier (c'est pourquoi `tests/` et `docs/` sont à la racine) ou être ajoutés
à la liste `ignore` de `firebase.json`.

**iOS** — projet Xcode `ios_2026/RevenusDepenses.xcodeproj`, schéma `RevenusDepenses`.
Vérifié avec Xcode 27.0 / SDK iOS 27.0.

**Git** — `https://github.com/fezerick/Expense_Tracking.git`, branche `main`.
`.gitignore` exclut `Backup/`, `DerivedData/`, `xcuserdata/`, `*.xcuserstate`, `.DS_Store` :
**aucune donnée fiscale n'est versionnée**.

---

## 7. Contraintes et choix structurants

- **Aucun build côté PWA** : déploiement en une commande, mais ~9 700 lignes en portée
  globale et aucun test unitaire possible sans charger la page. C'est pourquoi les deux
  suites (`tests/pwa_suite.js`, `tests/pwa_modules_suite.js`) s'exécutent *dans* la page.
- **Les modules sont des scripts classiques, pas des modules ES** : portée partagée,
  donc pas d'import à écrire, mais aussi aucun cloisonnement — deux modules ne peuvent
  pas déclarer une fonction du même nom. Les noms sont donc préfixés par domaine
  (`renderDPA`, `calculDPA`, `renderBaux`, `reporterBaux`…).
- **Chaque module crée paresseusement sa clé dans le `state`** : une sauvegarde produite
  avant son existence reste lisible, et `defaultState()` n'a pas à être modifié.
- **CloudKit prêt mais désactivé** côté iOS (`iCloudCapabilityEnabled = false`).
- **Les reçus ne sont jamais synchronisés** : base64 local uniquement, dans les deux apps.
- **Le cache du service worker est versionné à la main** — un oubli laisse les anciens
  caches en place.
- **jsPDF n'écrit correctement que du WinAnsi** : tout caractère hors de ce jeu
  (`−` U+2212, `→` U+2192) bascule la chaîne en UTF-16 brut et s'affiche illisible.
