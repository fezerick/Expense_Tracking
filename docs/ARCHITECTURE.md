# Architecture — Mon Plex

*L'application s'appelait « Revenus & Dépenses 2026 » jusqu'à la version 2.2.0.*

Deux applications indépendantes couvrent le même domaine fiscal (revenus locatifs
québécois + travail autonome rideshare) et échangent leurs données par fichiers JSON :

| | PWA | iOS |
|---|---|---|
| Dossier | `pwa_2026/` | `ios_2026/` |
| Techno | HTML/CSS/JS, aucun build | SwiftUI + SwiftData, iOS 17+ |
| Taille | 12 188 lignes (`index.html` 5 340 + 20 fichiers `js/` 6 848) | 8 356 lignes Swift, 30 fichiers — dont un noyau de calcul de 7 fichiers (§ 3.6) |
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
├── index.html      5 325 lignes — HTML + CSS + JS du socle (écrans 1 à 5)
├── manifest.json   nom « Mon Plex », couleurs #1F3864, icônes de icons/
├── sw.js           45 lignes — service worker, cache 'depenses-<version>'
├── icons/          icône de l'application : source SVG + PNG rendus (voir § 2.9)
└── js/             20 fichiers, 6 848 lignes — couche fiscale (voir § 2.8)
```

Aucun bundler, aucun `node_modules`, aucune étape de compilation : le fichier servi est
le fichier source. Les modules de `js/` sont chargés comme **scripts classiques**
(`<script src="js/x.js?v=2.2.0">`), donc ils partagent la portée globale de la page :
une fonction déclarée dans un module est appelable depuis `index.html` et
réciproquement. C'est voulu — c'est ce qui permet d'ajouter une fonctionnalité
sans toucher au socle.

### 2.2 Dépendances externes (CDN, chargées à la demande)

| Usage | Source |
|---|---|
| Auth + Firestore | `gstatic.com/firebasejs/10.12.2/*-compat.js` (en `<head>`) |
| Génération PDF | `cdnjs/jspdf/2.5.1` — chargé au premier rapport (ligne 3919) |
| Lecture PDF (relevés) | `cdnjs/pdf.js/3.11.174` — chargé au premier import (ligne 3231) |
| Distances | `maps.googleapis.com` — seulement si une clé API est saisie (ligne 2237) |

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
  lyft:    { 0..11: { taxable, bonuses, tips, tolls, fees, km, courses,
                     gst_riders, qst_riders, gst_bonuses, qst_bonuses,
                     gst_fees, qst_fees, gst_remitted, qst_remitted } },
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
saisie → autoSave() ── debounce 600 ms ──→ save()        (index.html:1394)
                                            ├─ syncDater(…)  → depenses_meta_<année>
                                            ├─ localStorage.setItem(storeKey(), …)
                                            └─ debounce 5 s ──→ syncPush(false)   (index.html:4328)

Firestore  onSnapshot(users/<uid>/years)  ──→ syncFusionnerDoc(année, doc)
           onSnapshot(users/<uid>/config/setup) ──→ syncAppliquerSetup(…)
```

`save()` avale silencieusement les exceptions `localStorage` — un navigateur en
navigation privée ne doit pas casser la saisie.

**La fusion est champ par champ, et c'est tout le sujet.** Avant la 2.5.0, `syncPush`
remplaçait le document distant et `syncPull` remplaçait l'état local : le dernier
appareil à écrire gagnait tout. Depuis, `js/sync.js` (§ 2.8) tient un **journal de dates
par feuille** et la fusion garde, pour chaque valeur terminale, la plus récente des deux.

- **Les dates vivent à côté des données**, dans `localStorage`, sous
  `depenses_meta_<année>` et `depenses_setup_meta` — jamais dans l'état lui-même, qui
  reste exactement ce qu'il était (une sauvegarde 2.4 se relit telle quelle, et une
  sauvegarde 2.5 ne traîne aucune métadonnée dans le JSON exporté).
- **Un chemin est une liste de segments** jointe par `U+001F`, caractère qu'aucun nom de
  catégorie ne peut contenir — « Eau / Égouts » compris.
- **Une valeur disparue laisse une pierre tombale** (`meta.sup`) posée au plus court
  préfixe entièrement disparu, sinon supprimer une catégorie de douze mois demanderait
  douze tombales. Sans elle, la suppression serait annulée par l'appareil qui possède
  encore la valeur : en fusion, le biais est à l'**union**.
- **Une case qui naît vide n'est pas datée.** Saisir avril dans une nouvelle catégorie
  crée onze cases vides du même geste ; datées, elles battraient les loyers déjà saisis
  ailleurs. Vider une case qui portait un montant est au contraire une écriture, qui se
  date et qui gagne.
- **Les tableaux ne se fusionnent pas tous pareil** : par `id` s'ils en ont tous un
  (trajets, baux, biens, règles — deux appareils qui ajoutent chacun un trajet gardent
  les deux), par **position** pour les douze mois d'une catégorie (janvier reste
  janvier), en **ensemble** pour les empreintes d'import, et en bloc pour le reste.
- **Chaque envoi est une transaction** Firestore (lire, fusionner, écrire), puis
  `syncDoitRenvoyer()` compare une **empreinte canonique** de l'état : sans elle, deux
  appareils se renverraient le même document sans fin.
- **Égalité de dates : un départage symétrique, et un désaccord signalé.** Deux
  valeurs différentes à la même date — ou, le cas courant, sans date de part et d'autre
  parce qu'elles précèdent la 2.5.0 — sont tranchées par une règle qui ne regarde que les
  valeurs : la non vide gagne, puis la plus grande des deux écritures canoniques.
  Arbitraire, mais **identique sur les deux appareils**, et c'est tout l'intérêt :
  « garder le local » revenait à ce que chacun garde le sien et renvoie son document à
  l'autre toutes les deux secondes et demie, indéfiniment. La pastille affiche
  « ⚠️ N désaccord(s) » plutôt que de trancher en silence.
- **Une date à `0` n'est pas une date.** `syncMetaNormalisee()` écarte les dates nulles :
  inscrites au journal, elles faisaient passer une feuille que l'autre appareil ignore
  pour une version plus récente à renvoyer — l'autre moitié du même va-et-vient.
- **Le moteur existe aussi en Swift depuis la 2.8.0** (`Core/SyncService.swift`, § 3.6),
  à parité vérifiée — mais il n'est **pas encore branché** sur Firestore. Jusqu'à ce qu'un
  `FirestoreSync` lise le document distant, appelle `fusionner` et réécrive le résultat,
  l'app iOS n'écrit pas dans `users/<uid>/years/<année>` : elle s'en tient à
  l'import/export d'enveloppe. Un `syncPush` iOS écrit en remplacement ré-introduirait
  exactement la perte de données que la 2.5.0 a éliminée.

**Disposition Firestore** (tout sous `users/<uid>`, après connexion Google —
`signInWithGoogle`, index.html:3947) :

| Chemin | Contenu |
|---|---|
| `years/<année>` | `{ data, meta, year, updatedAt, device }` — une année de saisie |
| `config/setup` | la configuration, **thème exclu** (il reste propre à l'appareil) |
| `recus/<année>_<clé encodée>` | une photo de reçu par document |

Les **photos de reçus** passent par des documents et non par Firebase Storage : le
projet n'a pas de bucket et en créer un exige aujourd'hui le plan Blaze. Une photo
compressée pèse ~100 Ko pour une limite de 1 Mio par document. L'état porte un
`recusIndex` synchronisé (quelle photo existe, et sa taille) tandis que les octets
restent hors de l'état ; seules `recusEnvoyer` / `recusLire` / `recusEffacer` touchent au
stockage, le jour où un bucket existera.

Les règles d'accès sont dans **`firestore.rules`**, à la racine du dépôt, et se déploient
avec l'application (§ 6) : un compte ne lit et n'écrit que son propre sous-arbre.

### 2.5 Écrans

**Six** onglets, pilotés par `showTab()` qui appelle le `render*` correspondant :

| Onglet | Fonction | Contenu |
|---|---|---|
| 🏠 Accueil | `renderHome` 1840 | 4 cartes de totaux + formulaire de déplacement + trajets récents |
| 🚗 Trajets | `renderTrips` 2069 | journal de kilométrage complet |
| 🏘 Logements | `renderProperty` 2146 | sous-onglets par immeuble, grille mensuelle (`renderPropertyMonthly` 2176) et vue annuelle (`renderPropertyAnnual` 2270) |
| 🚕 Rideshare | `renderRideshare` 2340 | Uber (2347), Lyft (2379), véhicule (`renderVehicle` 2464) |

Les deux plateformes sont décrites par une liste de champs unique — `UBER_FIELDS` et
`LYFT_FIELDS` — lue par le formulaire, la feuille de révision du PDF importé et
l'application des valeurs lues. Un champ ajouté à la liste apparaît aux trois endroits
sans autre modification. Uber est saisi **une fois pour l'année** (son sommaire fiscal
est annuel), Lyft **mois par mois** (le sien est mensuel) : d'où `lyftTaxTotals()`, qui
cumule les douze relevés pour la déclaration de TPS/TVQ, annuelle elle aussi.

Le net d'un mois Lyft a une seule définition, `lyftMonthNet()`, et son cumul annuel
`lyftNetTotal(st)`. La formule `base + primes + pourboires + péages − frais` était
recopiée à **sept** endroits — le formulaire, son total de pied, le sommaire général, le
CSV du dossier, le rapport PDF, l'impôt estimé (`lyftNetIncome()`) et le tableau
pluriannuel. L'ajout des péages en 2.4.0 aurait demandé sept modifications
concordantes ; un oubli se serait vu comme un écart entre deux écrans de la même donnée.
L'argument `st` sert au tableau pluriannuel, qui calcule sur une année archivée plutôt
que sur l'année active.

**Les péages encaissés sont un revenu, pas une fourniture taxable de plus.** Lyft
refacture le péage au passager puis le reverse au chauffeur, qui l'a payé de sa poche :
le montant reçu entre dans le net, et le péage payé se déduit du côté véhicule — les
deux s'annulent, mais seulement si le reçu est déclaré. Il n'entre **pas** dans
`lyftTaxableBase()` : Lyft calcule lui-même la TPS/TVQ perçue sur sa ligne « Base
taxable », et ajouter le péage à la ligne 101 compterait la même fourniture deux fois.

**Convention de signe.** Les champs de sortie d'argent — frais de plateforme, taxes
payées à la plateforme, taxes qu'elle a déjà versées au nom du chauffeur — sont stockés
en **valeur absolue**, parce que tous les totaux les retranchent : `net = base + primes
+ pourboires − frais`, `uberNetIncome() = revenus − uberFeesTotal()`, `solde = taxe
nette − déjà versée`. Les relevés, eux, les présentent en négatif (`(CA$88.42)`,
`-$301.05`) puisqu'ils décrivent un décaissement. Le signe du relevé sert uniquement à
reconnaître la ligne ; `cout()` n'en garde que la magnitude. T96 et T97 le verrouillent.
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
| Export CSV | `exportCSV` | grille mensuelle, 15 colonnes : section, catégorie, 12 mois, total. Les montants annuels (Uber, véhicule) laissent les cellules de mois **vides** |
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
(`depenses-<version>`) doit changer à chaque déploiement, sinon les
anciens caches ne sont pas purgés — et une ressource non-HTML (dont `tests/pwa_suite.js`)
peut continuer à être servie figée. `firebase.json` envoie en plus `no-cache` sur `sw.js`
et sur tout `*.html`, et `max-age=0, must-revalidate` sur tout `*.js` — ce qui règle le
cache **HTTP**, mais pas celui du service worker, qui sert les ressources non-HTML en
cache-first.

⚠️ Les modules de `js/` sont référencés avec leur propre numéro de version
(`js/dpa.js?v=2.2.0`). Recharger `index.html` avec un paramètre anti-cache ne les
rafraîchit donc **pas** : il faut incrémenter ce `?v=` dans les 18 balises
`<script>` **et** le nom du cache du service worker. C'était la cause la plus
fréquente de « le correctif ne prend pas » ; depuis la version 2.1.0,
`scripts/version.sh` écrit les six emplacements d'un coup et les tests vérifient
qu'ils concordent (§ 2.9).

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

**Chargement.** 20 balises `<script src="js/<module>.js?v=<version>">` en fin de `<body>`,
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
| `sync.js` | 534 | — (moteur) | fusion champ par champ entre appareils : dates par feuille, pierres tombales, formes de tableaux (§ 2.4). Aucune dépendance — ni Firebase, ni `state` |
| `fiscal-data.js` | 269 | — (données) | paramètres fiscaux par année (`fiscal(year)`), paliers d'impôt, RRQ / FSS / RQAP, taux de DPA |
| `recommandations.js` | 337 | `recommandations` | pistes de rentabilité classées par gain estimé + bandeau d'accueil |
| `impot.js` | 447 | `impot` | impôt estimé, acomptes provisionnels avec retards et manque à verser, provision à mettre de côté |
| `tps-tvq.js` | 250 | `taxes` | TPS/TVQ sur les revenus de transport, CTI/RTI au prorata d'affaires |
| `dpa.js` | 512 | `dpa` | biens amortissables, catégories, règle du demi-taux, 1100(11), report de FNACC |
| `baux.js` | 468 | `baux` | baux, loyers, indexation, Relevé 31 |
| `vehicule-methodes.js` | 130 | `vehicule-methodes` | méthode 1 (frais réels au prorata) vs méthode 2 (taux au km), comparées |
| `coproprietaires.js` | 156 | `coproprietaires` | état par copropriétaire à partir du `%` de détention de chaque immeuble |
| `ventilation.js` | 287 | `ventilation` | ventilation automatique d'une dépense entre immeubles / mois |
| `recus.js` | 273 | `recus` | audit des pièces manquantes (montant saisi sans reçu joint) |
| `kilometrage.js` | 265 | `kilometrage` | journal de kilométrage assisté, odomètre, rappel d'accueil |
| `import-bancaire.js` | 488 | `import-bancaire` | import CSV / OFX / QFX avec règles de classement, file de revue, anti-doublon par `FITID` |
| `simulateur.js` | 427 | `simulateur` | simulateur d'achat d'immeuble et de km Uber supplémentaires |
| `vente.js` | 391 | `vente` | simulateur de vente : récupération de DPA (100 %), gain en capital (50 %), perte finale |
| `tableau-bord.js` | 283 | `tableau-bord` | tableau de bord pluriannuel (lit les autres années via `readYear`) |
| `cloture.js` | 221 | `cloture` | clôture d'année verrouillée + empreinte des chiffres déclarés |
| `journal.js` | 532 | `journal` | historique des modifications : qui, quand, quelle cellule, ancienne → nouvelle valeur (§ 2.10) |
| `dossier.js` | 307 | `dossier` | dossier comptable complet en un ZIP |

**Le 6ᵉ onglet.** `FISCAL_SUBS` (index.html:1994) décrit les 10 sous-onglets dans
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
`simu`, `vente`, `importQueue` / `importHashes`, `closed` / `closedHistory`. Côté
configuration, `setup.reglesImport` et `setup.importOrdreUS` restent dans
`depenses_setup`, donc hors synchronisation.

---

### 2.9 Version, identité et icônes

**La version est le mécanisme de mise à jour.** Sans build, un navigateur qui garde en
cache un module périmé sert de l'ancien code à côté du nouveau — la panne la plus
fréquente du projet. La version vit donc à **six endroits**, qui doivent concorder :

| Emplacement | Rôle |
|---|---|
| `const APP_VERSION` (`index.html`) | source de vérité, affichée en bas des Réglages |
| `const APP_BUILD` (`index.html`) | date du jour de l'incrément |
| `?v=<version>` sur les 18 balises de module | force le rechargement après un déploiement |
| `const CACHE` (`sw.js`) | renomme le cache, donc purge l'ancien à l'activation |
| `"version"` (`manifest.json`) | version déclarée de la PWA |
| `"version"` (`package.json`) | version affichée en en-tête de `npm test` |

`scripts/version.sh` est le **seul outil autorisé à les écrire**. Il refuse d'agir si
les six ne concordent pas déjà, ne code en dur aucun nombre de modules (il compte les
balises présentes), et accepte `patch`, `minor`, `major`, `set X.Y.Z`, avec `--deploy`
pour enchaîner sur Firebase. Les assertions V1–V4 de `tests/run-headless.js` et M202/M203
de la suite modules vérifient la même concordance à chaque exécution des tests.

Le numéro suit *majeur.mineur.correctif* : **mineur** pour une fonctionnalité,
**correctif** pour un défaut, **majeur** pour une rupture du format de données.
Chaque incrément est consigné dans [CHANGELOG.md](CHANGELOG.md).

**Identité.** L'application s'appelle **Mon Plex** depuis la version 2.2.0
(auparavant « Revenus & Dépenses 2026 »). Le nom vit dans `APP_NOM` (`index.html`), dans
`name` / `short_name` du manifeste, dans `<title>` et dans
`<meta name="apple-mobile-web-app-title">`.

**Icônes** (`pwa_2026/icons/`) — une façade de plex sur fond #1F3864, dont une fenêtre
verte porte un `$` :

| Fichier | Rôle |
|---|---|
| `mon-plex.svg` | **source de vérité**, coins arrondis, `viewBox` 0 0 512 512 |
| `mon-plex-carre.svg` | variante sans arrondi : iOS arrondit lui-même |
| `mon-plex-masquable.svg` | variante Android masquable, dessin à 70 % dans la zone sûre |
| `icon-192.png`, `icon-512.png` | rendus `purpose: any` du manifeste |
| `icon-maskable-512.png` | rendu `purpose: maskable` |
| `apple-touch-icon.png` | 180 px, carré, référencé par `<link rel="apple-touch-icon">` |

Les PNG sont **rendus** depuis les SVG par Chrome sans tête
(`--headless --screenshot --window-size=N,N`) ; ne les retouchez pas à la main : modifiez
le SVG et régénérez. Les quatre propositions soumises au choix (`A-plex`, `B-courbe`,
`C-flux`, `D-monogramme`) sont conservées dans le même dossier à titre d'archive.

### 2.10 Historique des modifications (`js/journal.js`)

Depuis la 2.6.0. Répond à « le total n'est plus celui que j'ai envoyé — qu'est-ce qui a
changé ? », question à laquelle la clôture d'année ne savait répondre que par
« les chiffres ne correspondent plus ».

Porté en Swift depuis la 2.8.0 (`Core/JournalService.swift`, § 3.6), à parité vérifiée.

**Le journal ne calcule rien.** Sa matière vient entièrement de la synchronisation, qui
la produisait déjà et la jetait :

| Source | Ce qu'elle rend | Inscrit comme |
|---|---|---|
| `syncDater(meta, avant, apres, ts)` | `changements: [{ chemin, avant, apres, genre }]` | ✏️ saisi ici |
| `syncFusionner(local, distant)` | les valeurs réellement prises à l'autre appareil | 📥 reçu de `<appareil>` |

C'est la propriété structurante : **aucune des ~60 fonctions de saisie de l'application
n'a été touchée**, donc aucune ne peut oublier de journaliser. Tout ce qui est daté est
inscrit, parce que c'est le même calcul qui date et qui raconte.

**Stockage.** Une clé `localStorage` par année — `depenses_journal_<année>` — à côté des
données et de la méta, jamais dedans : le JSON exporté ne contient pas d'historique.
Plafond de `JOURNAL_MAX = 800` lignes, les plus vieilles tombant en premier. L'écriture
est volontairement incapable de faire échouer une sauvegarde : les données sont déjà
écrites quand `journalConsigner()` est appelé, et si le stockage est plein le journal se
réduit de moitié puis renonce en silence.

**Ce qui n'est pas inscrit**, et c'est délibéré :

- une valeur **écartée** par un arbitrage de fusion — elle n'a rien changé ici, et la
  pastille de synchronisation la signale déjà ;
- une case qui passe de **vide à vide** : ouvrir un écran crée des structures vides ;
- trois hésitations sur un même montant à moins de deux minutes : elles se **replient**
  sur une ligne portant la valeur de départ et la valeur finale, et une correction
  annulée (142 → 150 → 142) ne laisse rien ;
- le détail d'une fusion de plus de 40 valeurs — le premier raccordement d'un appareil
  tient en **une ligne de synthèse**, sinon le bruit chasse l'historique utile.

**Pourquoi le journal ne se synchronise pas.** Un journal est un tableau en ajout seul, et
la fusion traite un tableau sans `id` comme une seule feuille : le synchroniser tel quel
perdrait des lignes. Lui donner des `id` le ferait grossir dans un document Firestore
déjà limité à un mégaoctet. Surtout, c'est inutile : ce qui arrive d'un autre appareil est
inscrit **à l'arrivée**, donc le journal local explique la totalité des changements de
l'état local. Ce qu'il n'est pas : un registre central et inviolable de qui a fait quoi —
cela demanderait un serveur qui refuse les écritures non journalisées, pas une app hors
ligne.

**Une suppression garde la trace de ce qu'elle emporte** (`apercu`, calculé par
`syncApercu()` au moment de la suppression) : `Trajet › tB — retiré (6 cases :
2026-03-02, Rona, 18)`. Après coup, l'identifiant interne du trajet ne dit plus rien,
et son libellé n'existe plus nulle part.

**Lecture.** `journalLabel(chemin, lexique)` traduit un chemin de fusion en mots de
l'application ; le lexique (libellés d'immeubles, champs Uber/Lyft, trajets) est
reconstruit à chaque affichage, de sorte qu'un immeuble renommé change de nom dans tout
l'historique — ce qu'on désigne est la cellule, pas le mot qui la nommait ce jour-là.

---

## 3. iOS (`ios_2026/`)

### 3.1 Structure

```
ios_2026/RevenusDepenses/
├── Core/       Socle.swift (121)       FiscalData.swift (360)
│               TaxService.swift (321)  CCAService.swift (314)   ← § 3.6
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

### 3.6 Noyau de calcul (`Core/`) et parité avec la PWA

Depuis la 2.7.0, étendu en 2.8.0. `Core/` est le portage Swift des modules de calcul de la
PWA — les **vagues 1 et 1 bis** de [PORTAGE_IOS.md](PORTAGE_IOS.md) :

| Fichier Swift | Vient de | Contenu | Vague |
|---|---|---|---|
| `Socle.swift` | `js/utils.js` | `num`, `fmt`, `shortLabel`, `csvLigne`… | 1 |
| `FiscalData.swift` | `js/fiscal-data.js` | paramètres fiscaux par année, catégories de DPA | 1 |
| `TaxService.swift` | `js/impot.js` | assiettes, impôt des deux paliers, acomptes | 1 |
| `CCAService.swift` | `js/dpa.js` | pools de DPA, demi-taux, 1100(11), FNACC reportée | 1 |
| `Valeur.swift` | *(aucun — propre à Swift)* | l'arbre JSON avec la sémantique de JavaScript : ordre des clés conservé, `undefined` ≠ `null`, écriture canonique au caractère près | 1 bis |
| `SyncService.swift` | `js/sync.js` | aplatissement en chemins, datage, fusion champ par champ, pierres tombales, empreinte d'un état | 1 bis |
| `JournalService.swift` | `js/journal.js` | libellé d'un chemin, entrées, regroupement d'une rafale, entrée de lot, filtres, phrase d'une ligne | 1 bis |

**`Valeur.swift` n'a pas d'équivalent dans la PWA, et c'est normal :** il reproduit ce que
JavaScript fait gratuitement. La fusion décide de l'identité de deux feuilles par
`JSON.stringify(a) === JSON.stringify(b)` et départage deux écritures de la même
milliseconde par un `>` sur ces deux textes — donc l'ordre des clés, l'écriture d'un
nombre (`1`, pas `1.0`) et la différence entre une clé absente et une clé à `null` font
partie du comportement, pas de la présentation. Un `[String: Any]` et `JSONSerialization`
auraient suffi à faire diverger deux appareils.

**Une règle, et c'est la seule qui compte ici : `Core/` n'importe que Foundation.** Ni
UIKit, ni SwiftUI, ni SwiftData, ni état d'application. Deux conséquences, l'une
architecturale et l'autre pratique :

- un calcul qui ne peut pas importer UIKit ne peut pas non plus aller chercher une donnée
  derrière le dos de son appelant : tout entre par les paramètres, tout sort par la valeur
  de retour. `CCAService.calculer` reçoit ainsi la FNACC de l'année précédente par une
  fermeture `fournisseur:` plutôt qu'en interrogeant SwiftData ;
- le noyau se compile **pour macOS**, donc se vérifie en deux secondes sans simulateur.

C'est ce que fait `npm run parite`. Les nombres attendus ne sont pas retapés : la suite JS
relève ses propres valeurs mesurées là où ses assertions les vérifient,
`npm run parite:export` les écrit dans `ios_2026/Tests/Parity/parite-vague1.json` — en
refusant d'écrire si une assertion est rouge — et `scripts/ios-parity.sh` compile le noyau
avec `swiftc` dans un répertoire temporaire pour rejouer ce fichier. **94 assertions**, le
détail est au § 4.5 de [TESTS.md](TESTS.md).

Le noyau de fusion est **porté mais pas branché** : aucune écriture iOS ne part vers
`users/<uid>/years/<année>` tant qu'un `FirestoreSync` n'appelle pas `fusionner` (§ 2.10 et
§ 5). C'était la condition à lever avant qu'un iPhone puisse écrire dans le document
partagé sans effacer le travail de la PWA.

`ios_2026/Tests/` vit **hors** du groupe `RevenusDepenses` : ce groupe est un
`PBXFileSystemSynchronizedRootGroup`, qui embarque automatiquement tout `.swift` placé
sous lui, et le `main.swift` du lanceur deviendrait un second point d'entrée de
l'application. La variante XCTest (`Tests/XCTest/CoreParityTests.swift`) attend qu'une
cible de tests existe dans le projet.

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

1. `npm test` — les suites doivent être vertes, V1–V4 comprises
2. `scripts/version.sh minor` (ou `patch`) — écrit la version aux six emplacements
3. `firebase deploy --only hosting`
4. `firebase deploy --only firestore:rules` — **uniquement si `firestore.rules` a changé**

Les étapes 2 et 3 s'enchaînent avec `scripts/version.sh minor --deploy`. La connexion
Firebase exige un terminal interactif ; sans TTY, `firebase login` échoue
(contournement : `script -q /dev/null firebase login`).

`firestore.rules` (racine, déclaré dans `firebase.json`) n'est **pas** servi avec le
site : il se déploie à part, vers la base de données. L'oublier laisse en place les
règles de la console Firebase, qui ne correspondent plus au code.

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
