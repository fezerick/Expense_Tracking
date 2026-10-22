# Tests effectués — Mon Plex

Campagne du 18 octobre 2026, sur les deux applications : PWA (`pwa_2026/`) et iOS
(`ios_2026/`). Trois niveaux : suite d'assertions automatisée, parcours complet de
l'interface, et vérification à l'exécution des sorties remises au comptable (PDF, CSV,
sauvegardes).

**État au 22 octobre 2026, version 2.8.0** — trois suites et quatre vérifications de
fichiers, **toutes vertes**, exécutables **sans navigateur** par `npm test`, plus une
quatrième suite qui compare le noyau Swift à la PWA (`npm run parite`) :

| Suite | Portée | Résultat |
|---|---|---|
| `tests/run-headless.js` | concordance de la version aux six emplacements | **V1–V4** |
| `tests/pwa_suite.js` | socle `index.html` (écrans 1 à 5, exports, sauvegardes) | **111 / 111** |
| `tests/pwa_modules_suite.js` | les 20 fichiers de `pwa_2026/js/` (§ 2.8 de l'architecture) | **297 / 297** |
| `tests/pwa_sync_suite.js` | le raccordement à Firestore, contre un Firestore de pacotille (§ 2c) | **18 / 18** |
| `ios_2026/Tests/Parity/` | le noyau Swift rend les mêmes nombres **et les mêmes écritures** que la PWA (§ 4.5) | **94 / 94** |

Dix défauts ont été corrigés et revérifiés depuis la campagne initiale : BUG-1, BUG-7
(PWA + iOS), BUG-9, BUG-10, BUG-3, puis BUG-2 et les quatre défauts de la couche
modulaire décrits au § 2b. Les défauts encore ouverts sont listés dans
[AMELIORATIONS.md](AMELIORATIONS.md).

---

## 0. Exécution sans navigateur — `npm test`

Depuis la version 2.2.0, les suites tournent **hors navigateur**. C'est le mode
normal ; le mode console des § 2 et § 2b reste utile pour déboguer en regardant l'écran.

```bash
npm install     # une seule fois : jsdom, la seule dépendance, et seulement pour les tests
npm test        # les trois suites + les quatre vérifications de version
npm run test:socle      # une seule suite
npm run test:modules
npm run test:sync

npm run parite:export   # relève les valeurs de la PWA dans une référence JSON
npm run parite          # compile le noyau Swift et le confronte à cette référence
```

`tests/run-headless.js` monte `index.html` dans jsdom, retire les trois balises Firebase,
pose les prothèses que jsdom n'a pas (`matchMedia`, `URL.createObjectURL`,
`canvas.getContext`, un `firebase` factice), **inline chaque module** dans la page sous
`data-module-src` — ce qui préserve l'ordre d'exécution sans dépendre d'une API jsdom
instable — puis évalue chaque suite dans la page. Le code de sortie vaut 1 dès la
première assertion rouge, donc le script est utilisable en intégration continue.

Quatre vérifications portent sur les fichiers plutôt que sur le code exécuté :

| | Vérifie |
|---|---|
| V1 | `const CACHE` de `sw.js` porte la version courante |
| V2 | `manifest.json` porte la version courante |
| V3 | les 20 balises de module portent `?v=<version>` |
| V4 | `package.json` porte la version courante |

Deux garanties qui méritent d'être dites : le `localStorage` de jsdom est **en mémoire**,
donc une exécution ne peut pas toucher aux données réelles du navigateur ; et l'absence
de réseau est volontaire — aucune suite ne doit dépendre d'un CDN.

> L'application elle-même n'a **aucune dépendance** et aucune étape de compilation.
> `package.json` n'existe que pour les tests, et `node_modules/` est exclu du dépôt.

---

## 1. Environnement

| | |
|---|---|
| PWA servie par | `python3 -m http.server 8099` à la racine du dépôt |
| Navigateur | Chromium piloté par Playwright |
| iOS compilé avec | Xcode 27.0, SDK iOS 27.0 |
| Simulateur | iPhone 18 Pro, iOS 27.0 |
| Bundle id | `com.ericfezeu.revenusdepenses` |
| Extraction PDF | pdf.js 3.11.174 — la bibliothèque que l'app utilise elle-même |

> **Correction à la documentation existante** : `ios_2026/README.md` avertit que les
> runtimes installés sont en iOS 17.x et que la compilation échouerait. C'est périmé —
> les runtimes 17.0, 17.2, 26.5 et 27.0 sont présents et la compilation réussit.

---

## 2. Suite automatisée — `tests/pwa_suite.js`

50 assertions exécutées **dans la page** (l'app est un fichier unique sans modules :
`state`, `setup`, `propTotals()`, `getTripAmount()` vivent dans la portée globale). La
suite installe une fixture déterministe puis restaure l'état d'origine — aucune donnée
réelle n'est touchée.

```js
// dans la console de la page, ou via Playwright :
eval(await (await fetch('/tests/pwa_suite.js?cb=' + Date.now())).text())
```

> Le paramètre anti-cache est nécessaire : le service worker sert les ressources non-HTML
> en *cache-first* et renvoie sinon une version figée du fichier (constaté pendant cette
> campagne — une ancienne version de la suite a été exécutée par erreur).

### Campagne initiale (avant correctifs) : 44 réussis / 6 échecs sur 50

| Domaine | Tests | Résultat |
|---|---|---|
| Accès aux données (`rate`, `propsList`, `propById`, `getMonthlyVal`) | T01–T07 | 7/7 |
| Déplacements et dates (`getTripAmount`, `monthOf`, `yearOf`, km) | T08–T14 | 5/7 — **T08, T14 échouent** |
| Totaux par immeuble (`propTotals`, exclusion du capital, % ignoré) | T15–T21 | 7/7 |
| Véhicule et prorata (Uber, Lyft, division par zéro) | T22–T27 | 6/6 |
| Export CSV (colonnes) | T28–T30 | 1/3 — **T29, T30 échouent** |
| Aller-retour JSON et migration des réglages | T31–T33 | 2/3 — **T33 échoue** |
| `reconcilePropsFromState` | T34–T36 | 2/3 — **T36 échoue** |
| Montants récurrents | T37–T40 | 4/4 |
| Checklist | T41–T43 | 3/3 |
| Rendu des 6 onglets + état vierge | T44–T50 | 7/7 |

| Test | Attendu | Obtenu | Défaut |
|---|---|---|---|
| T08 `getTripAmount()` janvier = 100 km × taux | 72 | **216** | BUG-1 |
| T14 km de la déduction locative == km de la proration | 150 | **350** | BUG-1 |
| T29 toutes les lignes CSV ont le nombre de colonnes de l'entête | — | 1 ligne à **16** colonnes | BUG-2 |
| T30 la ligne Lyft a 15 colonnes | 15 | **16** | BUG-2 |
| T33 un réglage absent garde sa valeur par défaut | `syncAuto === true` | `undefined` | BUG-3 |
| T36 l'immeuble recréé conserve son % de propriété | 50 | **100** | BUG-9 |

Les 6 échecs étaient des défauts réels de l'application, pas des assertions fautives :
chacun a été reproduit ensuite dans l'interface réelle (§ 3).

### Après correctifs : 64 réussis / 64

La suite a été étendue (13 assertions de plus) pour couvrir le comportement corrigé :

| Nouveau test | Ce qu'il verrouille |
|---|---|
| T33b | le réglage présent dans le fichier est bien repris par `mergeState()` (pas écrasé par le défaut) |
| T36 (réinterprété) | sans configuration, l'immeuble recréé revient à 100 % — repli documenté, d'où la nécessité de T36b |
| T36a–T36c | la sauvegarde est une enveloppe v3 et emporte `setup`, `year`, le % et les copropriétaires |
| T36d–T36g | `restoreFromBackup()` rétablit le %, le libellé et l'année, sans reconstruction d'immeuble |
| T51–T55 | `uberNetIncome()`, puis les 3 cellules TOTAL du Sommaire (revenus, dépenses, bénéfice) et le signe du bénéfice |
| T44–T50 | inchangés (rendu des onglets, état vierge) |

**T29 et T30 passent désormais** : ils documentaient BUG-2 (ligne CSV `Lyft - Revenus`
à 16 colonnes), corrigé le 20 octobre 2026. Le montant est maintenant porté dans la
colonne du mois concerné, comme toutes les autres sections — une ligne qui ne remplissait
que la colonne Total ne s'additionnait de toute façon pas verticalement dans un tableur.

```
{"total":64,"pass":64,"fail":0,"echecs":[]}
```

### Lecture des relevés PDF — T56 à T73, ajoutés le 20 octobre 2026 (version 2.2.1)

L'import d'un relevé Lyft de juillet ne détectait **aucune** valeur. Trois causes
distinctes se cachaient derrière le même message, et rien ne permettait de les
distinguer depuis l'écran :

1. `extractPDFText()` ne lisait que la couche texte. Un relevé sans couche texte — scanné,
   ou exporté en image — produisait une chaîne vide, et l'app annonçait « aucune donnée
   détectée » comme si les libellés étaient en cause.
2. `findAmountNear()` n'examinait que la **première** occurrence du libellé. Un mot cité
   en prose dans un sommaire (« Pourboires, primes et frais ») captait la recherche, et
   la fenêtre de 500 caractères ramenait alors le montant d'une autre ligne.
3. Les libellés couverts étaient ceux d'un seul format de relevé.

Les assertions verrouillent le comportement corrigé sur du texte reproduisant ce que
pdf.js rend réellement — cellules à la file, séparées par des espaces :

| Test | Ce qu'il verrouille |
|---|---|
| T56–T61 | relevé Lyft français : gains, primes, pourboires, frais négatifs, km, courses |
| T62–T63, T65 | relevé Lyft anglais : séparateur de milliers `1,204.18`, pourboires, courses |
| **T64, T69** | **les milles sont convertis en kilomètres** (× 1,609344) |
| T66 | un PDF illisible rend six `null` — aucun chiffre n'est inventé |
| T67–T68 | relevé Uber : tarifs bruts et frais de service, signe compris |
| T70 | un libellé présent deux fois est lu à son occurrence **chiffrée**, pas à la première |
| T71–T73 | un pourcentage n'est pas un montant ; `(84,50)` vaut −84,50 ; `texteUtileLen()` |

T64 et T69 corrigent une erreur de déclaration, pas seulement d'affichage : `Online miles
742` était enregistré comme 742 km au lieu de 1 194, soit une déduction kilométrique
sous-estimée de 38 % sur tout relevé anglophone.

### Le vrai relevé Lyft — T74 à T87, ajoutés le 20 octobre 2026 (version 2.2.2)

Le relevé effectivement remis au chauffeur est le **« Sommaire fiscal mensuel »**
bilingue : page 1 en anglais, page 2 en français, donc les deux langues arrivent à la
suite dans le texte extrait. Son vocabulaire n'était celui d'aucun des formats déjà
couverts, et sa mise en forme portait trois pièges :

| Ce que contient le relevé | Ce que le code faisait |
|---|---|
| `Taxable Base` / `Base imposable` | aucun des 16 libellés de `taxable` ne correspondait → `null` |
| `Lyft & 3rd Party Fees` / `Lyft et les frais de tiers` | aucun des 13 libellés de `fees` ne correspondait → `null` |
| `Total Kilometres` / `Kilométrage total` | `Kilometers` (orthographe américaine) ne correspondait pas → `null` |
| `CA$527.60` | le code de devise collé au symbole passait, par chance |
| `(CA$88.42)` — négatif comptable | la parenthèse n'était plus reconnue à cause du `CA$` : **les frais revenaient positifs**, donc ajoutés au revenu |
| `512.473` — trois décimales | tronqué à `512.47` par la limite à deux décimales |

Mesure faite sur ce format avec le code de la 2.2.0 : **3 champs sur 6** (primes,
pourboires, courses). La capture envoyée en montrait **0** — le relevé n'avait donc pas
livré sa couche texte sur l'appareil, ce que le repli OCR de la 2.2.1 couvre. Les deux
correctifs étaient nécessaires : l'OCR pour obtenir le texte, les libellés pour en
tirer des chiffres.

| Test | Ce qu'il verrouille |
|---|---|
| T74–T79 | page anglaise : `Taxable Base`, `Bonuses`, `Tips`, frais, km à trois décimales, `Total Rides` |
| **T77, T83** | **les frais retenus sont les −88,42 de la ligne de frais, pas les −4,42 de la TPS *sur* ces frais** |
| T80–T85 | page française : `Base imposable`, `Primes`, `Pourboires`, `Lyft et les frais de tiers`, `Kilométrage total`, `Courses totales` |
| **T81** | **`Primes` reparaît dans « TPS perçue des primes » : c'est la ligne de gains qui gagne** |
| T86 | le PDF bilingue entier donne exactement le même résultat qu'une page seule |
| T87 | un montant préfixé du code de devise (`CA$1,234.56`) est lu |

Le libellé anglais `Lyft and 3rd party fees` est **volontairement absent** du code : la
même suite de mots figure dans `GST paid on Lyft and 3rd party fees`, dont le montant
aurait remplacé les frais réels. Seules les deux formes propres à la ligne de frais sont
acceptées — l'anglaise avec son esperluette, la française avec son « les ».

Les montants des jeux d'essai sont fictifs : seule la **forme** du relevé est reproduite,
aucune donnée personnelle n'entre dans le dépôt.

### Les lignes de TPS/TVQ de Lyft — T88 à T97 et M52a à M52f (version 2.3.0)

Le sommaire fiscal de Lyft comporte huit lignes de taxes que l'app ne lisait pas et
n'avait nulle part où ranger. Conséquence sur la déclaration : la ligne 101 du FPZ-500
comptait les fournitures taxables de Lyft (`lyftTaxableBase()`) **sans** la taxe perçue
dessus — taxe nette sous-évaluée — et les CTI/RTI sur les frais Lyft, que personne ne
réclame à la place du chauffeur, étaient simplement perdus.

| Test | Ce qu'il verrouille |
|---|---|
| T88–T89 | TPS et TVQ perçues des passagers, en anglais comme en français |
| T90–T91 | la taxe perçue **sur les primes**, distincte de celle des passagers |
| T92–T93 | la taxe payée sur les frais est un CTI/RTI, stocké en positif |
| T94–T95 | la taxe déjà versée par Lyft au nom du chauffeur |
| M52a | `lyftTaxTotals()` cumule bien les douze mois |
| M52b–M52c | taxe perçue = part Uber + part Lyft (passagers **et** primes) |
| M52d–M52e | le CTI comprend la TPS des frais Lyft ; le déjà-versé comprend la part de Lyft |
| M52f | le détail par plateforme liste les deux plateformes |

### La convention de signe des champs de coût — T96, T97 (version 2.3.0)

Défaut découvert en implémentant ce qui précède, et **rendu actif par la 2.2.2** : les
analyseurs de PDF rendaient les frais avec le signe du relevé (négatif), alors que tous
les totaux de l'app les **retranchent**. Un relevé importé faisait donc *additionner*
les frais au revenu.

| | Base | Primes | Pourboires | Frais | Net |
|---|---|---|---|---|---|
| Saisie manuelle (frais tapés en positif) | 527,60 | 34,48 | 13,40 | 88,42 | **487,06** |
| Import PDF avant correctif (frais à −88,42) | 527,60 | 34,48 | 13,40 | −88,42 | **663,90** |

L'écart vaut deux fois les frais. Il touchait aussi `service_fee`, `other_fees`,
`fee_discount`, `gst_paid_uber`, `qst_paid_uber` côté Uber, et le « déjà versé » des
deux plateformes, dont le solde de taxes doublait. Le correctif isole la règle dans
`cout()` : le signe du relevé sert à reconnaître la ligne, seule la magnitude est
stockée. T96 vérifie le net sur des valeurs importées, T97 qu'aucun champ de coût
n'arrive en négatif.

Trois assertions antérieures — T59, T68 et T86 — **attendaient le signe fautif** : elles
documentaient le défaut au lieu de le détecter. Elles ont été corrigées en même temps.

### Les péages encaissés — T98 à T102 et M52g à M52i (version 2.4.0)

Le relevé Lyft porte une ligne « Tolls » / « Péages », le plus souvent à zéro. C'est un
**encaissement** : Lyft refacture le péage au passager et le reverse au chauffeur. Deux
pièges, chacun verrouillé :

| Test | Ce qu'il verrouille |
|---|---|
| T98–T99 | `Tolls CA$0.00` est lu comme **zéro**, non comme « champ absent » — un zéro lu est une information |
| T100 | un péage non nul est stocké en positif : contrairement aux frais, il n'est pas un coût, donc il ne passe **pas** par `cout()` |
| T101–T102 | le péage s'ajoute au net du mois (499,56 au lieu de 487,06), et son absence ne change rien |
| M52g | `lyftMonthNet()` compte les péages |
| M52h | un péage n'entre **pas** dans les fournitures taxables du FPZ-500 — sans quoi la même fourniture serait comptée deux fois, Lyft calculant déjà la taxe perçue sur sa ligne « Base taxable » |
| M52i | il entre **en entier** dans le revenu net Lyft |

M52h et M52i disent ensemble la seule chose subtile du champ : revenu **oui**, fourniture
taxable **non**.

```
{"total":111,"pass":111,"fail":0,"echecs":[]}
```

### Le compteur de colonnes était faux — corrigé le 20 octobre 2026

En complétant l'export CSV (fiche E.1), **T29 est repassé au rouge : 16 colonnes au lieu
de 15.** Le CSV, lui, était valide. Le compteur du test découpait la ligne sur chaque
virgule, sans voir les guillemets — or les nouvelles cellules en contiennent :
`"Véhicule - Part d'affaires (annuel)"` et surtout la **virgule décimale française**
produite par `fmt()`, comme dans « 25,8 % ».

C'est le test qui avait tort, pas la donnée. T28, T29 et T30 comptent désormais les
champs en tenant compte des guillemets :

```js
const nbChamps = (ligne) => {
  let n = 1, dansGuillemets = false
  for (const ch of ligne) {
    if (ch === '"') dansGuillemets = !dansGuillemets
    else if (ch === ',' && !dansGuillemets) n++
  }
  return n
}
```

T30b a été ajouté dans la foulée pour vérifier qu'une cellule contenant une virgule
**reste** entre guillemets, et `exportCSV()` double désormais les guillemets internes.
Le commentaire au-dessus de T29 rappelle que ce test a attrapé BUG-2 et doit continuer
à le faire : l'assouplir au point de ne plus compter les colonnes le viderait de son
sens.

---

## 2b. Suite automatisée des modules — `tests/pwa_modules_suite.js`

**297 assertions, 297 réussies.** Elle couvre la couche `pwa_2026/js/` (§ 2.8 de
[ARCHITECTURE.md](ARCHITECTURE.md)), que la première suite ignore. Même principe :
exécution *dans* la page, fixture déterministe, restauration de l'état réel à la fin.

```bash
python3 -m http.server 8099        # à la RACINE du dépôt, pas dans pwa_2026/
```
```js
// dans la console de http://localhost:8099/pwa_2026/index.html?t=<horodatage>
eval(await (await fetch('/tests/pwa_modules_suite.js?cb=' + Date.now())).text())
```

Le serveur doit être lancé à la racine : la page vit sous `/pwa_2026/` mais les suites
sous `/tests/`. Et l'URL de la page doit porter un paramètre anti-cache **différent à
chaque correctif de module**, car les modules sont chargés avec leur propre `?v=N`
(voir § 2.7 de l'architecture) — un `?v=` non incrémenté fait tester l'ancien code.

La suite rend l'état réel **et ses à-côtés** : les données, la configuration, les dates
d'écriture par feuille (sans quoi l'appareil sur lequel on lance les tests gagnerait
ensuite toutes les fusions) et, depuis la 2.6.0, l'historique des modifications — que les
`save()` de la fixture remplissent de « Duplex A (test) », et que le `save()` final y
inscrirait une dernière fois en remettant les vraies données.

### Couverture

| Assertions | Module | Ce qui est verrouillé |
|---|---|---|
| M01–M09 | `app-modules` | `num()` (virgule décimale, espace insécable, notation comptable `(123,45)`, format anglais, milliers), `escH()`, `csvLigne()`, aller-retour `writeYear`/`readYear` |
| M10–M18 | `cloture` | stabilité et sensibilité de l'empreinte fiscale, exclusion des reçus, refus de saisie sur année clôturée, totaux figés |
| M19–M33 | `dpa` | taux par catégorie, terrain non amortissable, IIA 2024–2027, demi-taux rétabli en 2028, plafond 1100(11), classe distincte 1101(1ac), plafond de la classe 10.1, FNACC de clôture et son report |
| M34–M44 | `vehicule-methodes`, `kilometrage` | paliers de l'indemnité par km, méthode 1 vs méthode 2, parts par activité, contrôles de cohérence de l'odomètre |
| M45–M52 | `tps-tvq` | extraction TPS/TVQ d'un montant TTC (TVQ sur le prix **hors** TPS), CTI au prorata commercial, solde après la TPS déjà versée par Uber |
| M53–M63 | `impot` | assiettes locatif / entreprise, cotisations RRQ-RQAP-FSS, absence de NaN, taux marginal plausible, quatre acomptes provisionnels |
| M64–M67 | `coproprietaires` | part de chaque copropriétaire, somme des parts = total, détection de la propriété partagée |
| M68–M72 | `recus` | ajout en capital sans pièce signalé, exclusion des frais de déplacement, taux de couverture, effet du seuil |
| M73–M79 | `ventilation` | application d'une répartition, somme des parts, retrait qui restitue exactement les cellules d'origine, refus au-delà de 100 % |
| M80–M97 | `import-bancaire` | découpage CSV avec guillemets, dates `AAAA-MM-JJ` / `AAAAMMJJ` / `JJ-MM` vs ordre US, signe des retraits, empreinte anti-doublon, règle la plus spécifique gagnante |
| M98–M103 | `baux` | report d'un bail à l'année suivante, indexation, décalage des dates, nouvel identifiant, bail en vigueur au 31 décembre pour le RL-31 |
| M104–M121 | `simulateur` | taux mensuel canadien `(1+r/2)^(1/6)−1`, amortissement qui solde en 25 ans, droits de mutation par paliers, mise de fonds 20 %, RNO, flux de trésorerie, 1100(11) appliqué au scénario, test de résistance +2 points, scénario Uber |
| M122–M124 | `tableau-bord` | lecture d'une autre année, année absente, séries pluriannuelles |
| M126–M130 | `recommandations` | au moins une piste, structure complète (quoi/pourquoi/action/montant), horizon connu, tri décroissant, aucun montant NaN |
| M137 | socle | `exportCSV({retourner:true})` rend le CSV sans déclencher de téléchargement |
| M158–M166 | socle, export CSV | les 15 colonnes sur **chaque** ligne, présence des sections Uber et véhicule, montants annuels sans valeur dans les cellules de mois, trajet tombant dans le mois de sa date |
| M167–M177 | `impot` | échéances des acomptes, versement dû le jour même **non** en retard, manque à verser fédéral et québécois, total des retards, jours avant le prochain |
| M178–M190 | `vente` | la DPA ne réduit pas le PBR, inclusion du gain à 50 %, récupération égale à la DPA réclamée, perte finale sur prix bas, détention à 50 %, immeuble absent du registre de biens |
| M191–M197b | `import-bancaire` | `FITID` conservé, deux transactions jumelles aux `FITID` différents toutes deux importées, doublon de `FITID` rejeté, pas de collision entre une clé `FITID` et une empreinte |
| M198–M201 | socle, sauvegarde | aller-retour `backupPayload()` → `restoreFromBackup()` : les règles d'import survivent avec leur libellé et leur cible |
| M202–M204 | version | format *majeur.mineur.correctif*, `?v=` sur **chaque** balise de module, version affichée dans les Réglages |
| M210+ | tous | un panneau par module : chaque `render()` produit du contenu sans lever |
| M250–M251 | tous | **état vierge** : tous les calculs des modules tournent sur un `state` où aucune clé de module n'existe |
| J01–J30 | `journal` | **historique des modifications** (§ 2.10 de l'architecture) : la matière vient de `syncDater()` et `syncFusionner()` avec l'ancienne valeur, une case vide → vide ne laisse rien, repli des écritures rapprochées et effacement d'une correction annulée, plafond du journal, libellés lisibles (immeuble › section › catégorie › mois, Lyft par mois, configuration), filtres et regroupement par jour, **une valeur reçue mais écartée ne laisse aucune ligne**, ligne de synthèse au-delà de 40 valeurs, suppression décrite deux fois repliée, trace de ce qu'une suppression emporte, aller-retour de stockage, et « depuis la clôture » |
| M260–M304 | `sync` | **fusion entre appareils** : aplatissement de l'arbre, les trois formes de tableau (par `id`, par position, en ensemble), la valeur la plus récente gagne, une valeur qu'un seul côté possède est conservée, pierre tombale au plus court préfixe, règle d'effacement, idempotence, convergence des deux sens de fusion, départage d'égalité symétrique et point fixe de la fusion (M272a–M272d), une case qui naît vide n'est pas datée (M300–M304) |

### Défauts trouvés par cette suite — tous corrigés

| # | Gravité | Défaut | Correctif |
|---|---|---|---|
| BUG-11 | **ÉLEVÉ** | `cotisationFSS()` et `cotisationRQAP()` retournaient un nombre nu alors que `impot.js` lit `.montant`. Résultat : `undefined` propagé en **NaN** à travers tout le calcul — impôt estimé, acomptes provisionnels et provision d'accueil affichaient `NaN $` dès que le module était atteint. | [fiscal-data.js](../pwa_2026/js/fiscal-data.js) : les deux fonctions retournent un objet `{ montant, assiette, … }` comme `cotisationRRQ()`. Vérifié : `cotisationRQAP(50 000, 2026) → 382 $`, `cotisationFSS(60 000, 2026) → 150 $`. M56–M60 et M121 le verrouillent. |
| BUG-12 | MOYEN | `empreinteFiscale()` changeait sans qu'aucun chiffre change : ouvrir un écran crée des structures vides (`ensurePropBucket()` ajoute `state.recurring[id] = {}`), ce qui allongeait la chaîne canonique. Annuler une modification ne restituait donc pas l'empreinte, et l'app annonçait « les chiffres ne correspondent plus à la clôture » à tort. | [cloture.js](../pwa_2026/js/cloture.js) : la sérialisation **élague** récursivement `''`, `null`, `0` et les objets devenus vides. Les positions dans un tableau de 12 mois sont conservées. M13 le verrouille. Changer le format d'empreinte était sans risque : la clôture n'était pas encore déployée, donc aucune empreinte n'existait en base. |
| BUG-13 | MOYEN | Les lignes d'**ajout en capital** de la grille mensuelle n'avaient pas de bouton reçu, alors que ce sont précisément les montants qu'un vérificateur demande en premier. | [index.html:2428–2445](../pwa_2026/index.html#L2428) : même bouton 📷/🧾 que les lignes de dépenses. M68 le verrouille. |
| BUG-2 | MOYEN | Ligne CSV `Lyft - Revenus` à 16 colonnes (voir § 5). | Corrigé ; T29/T30. |

### Deux pertes de données que cette suite n'a PAS trouvées (version 2.5.0)

Les deux défauts les plus graves du moteur de fusion sont passés à travers 258
assertions vertes et n'ont été vus qu'en **navigateur**, en simulant deux appareils sur
la même page. Ils sont notés ici pour ce qu'ils disent de la limite de la méthode : la
fixture testait des arbres que j'avais écrits, pas ceux que l'application fabrique.

| # | Gravité | Défaut | Correctif |
|---|---|---|---|
| BUG-14 | **CRITIQUE** | Une feuille qui devient un conteneur était prise pour une feuille *disparue*. Saisir la première valeur d'une catégorie (`uber: {}` → `uber.rides_gross`) posait une pierre tombale sur `uber` et effaçait toute la catégorie sur l'autre appareil. | [sync.js](../pwa_2026/js/sync.js) : la passe des tombales ignore un chemin redevenu préfixe. M294–M297. |
| BUG-15 | **CRITIQUE** | Le symétrique : la coquille vide `uber: {}` envoyée par l'appareil qui n'avait jamais touché la catégorie n'existait pas dans la carte des feuilles d'en face, donc elle était écrite — et écrasait la catégorie remplie. | `syncFusionner` ignore une feuille distante qui est un préfixe local. M298–M299. |
| BUG-16 | **ÉLEVÉ** | Saisir avril dans une nouvelle catégorie crée onze cases vides du même geste. Datées, elles battaient les loyers de janvier à mars saisis sur l'autre appareil : trois mois perdus en créant une case. | Une case qui **naît** vide n'est pas datée ; vider une case qui portait un montant reste une écriture datée. M300–M304. |

Vérification finale en navigateur, deux appareils, horloges décalées de 30 s : les trois
loyers survivent, avril arrive, les deux trajets sont conservés, **zéro désaccord**, les
deux côtés portent la même empreinte, et la suppression d'un trajet sur l'un le retire
bien de l'autre.

### Quatre défauts de la suite elle-même

Quatre échecs initiaux étaient des erreurs de la fixture, pas de l'application. Ils sont
notés ici parce qu'un test faux est plus coûteux qu'un test absent : il fait « corriger »
du code juste.

| Test | Erreur de la fixture | Correction |
|---|---|---|
| M49 | les 10 000 $ de dépenses véhicule étaient logés dans `VEH_CATS[0]`, l'immatriculation — des droits de la SAAQ, non taxables. Le test attendait un CTI là où l'app avait raison de n'en accorder aucun. | montant porté sur « Frais de carburant » |
| M42 | lisait `state.km`, alors que `kilometrage.js` travaille sur `state.kmJournal` | fixture sur `state.kmJournal` |
| M32 | l'année source ne décrivait pas sa propre année (acquisition et DPA réclamée dans une autre année) : `calculDPA()` n'y voyait ni ajout ni réclamation, donc une FNACC de clôture nulle à reporter | acquisition et DPA de l'année source datées de cette année-là |
| M121 | aucun kilomètre supplémentaire saisi : `simulerUber()` retourne `null`, ce qui est le comportement attendu | M121a vérifie désormais le `null`, puis la fixture saisit 5 000 km et M121/M121b vérifient le scénario |

### Filet de sécurité : une suite interrompue ne doit pas écraser les vraies données

Risque constaté pendant la campagne : le `localStorage` du profil Playwright contenait la
**fixture** comme état persisté. Autrement dit, une exception au milieu de la suite
laissait les données de test enregistrées par-dessus les données réelles — et `save()`
pouvait les pousser vers Firestore.

Les deux suites enveloppent donc leur corps dans un `try / catch / finally` :

```js
const ANNEES_TEST = [2098, 2099, 2028]   // hors des années réelles
let erreurFatale = null
try {  /* … les tests … */ }
catch (e) { erreurFatale = (e && e.message) ? e.message : String(e) }
finally {
  state = backup.state; setup = backup.setup; activeYear = backup.activeYear
  ANNEES_TEST.forEach(an => { try { localStorage.removeItem(STORE_PREFIX + an) } catch (e) {} })
  save(); saveSetup(); try { refreshAll() } catch (e) {}
}
if (erreurFatale) results.push({ id: 'FATAL', statut: 'FAIL', obtenu: erreurFatale })
```

Deux pièges rencontrés :

1. **Portée.** Après enveloppement, le `finally` référençait `ANNEES_TEST`, devenu un
   `const` *à l'intérieur* du `try` — `node --check` ne détecte pas cette erreur, elle ne
   se manifeste qu'à l'exécution, et seulement dans le chemin d'erreur. Les constantes
   ont été remontées au-dessus du `try`.
2. **Années de test.** Elles sont volontairement 2098/2099/2028, loin des années réelles,
   et supprimées dans le `finally` même quand la suite s'interrompt.

Vérifié de bout en bout avec un état réel marqué d'une sentinelle : exécution normale
→ 263/263 et sentinelle intacte ; exécution avec une exception forcée → ligne `FATAL`,
sentinelle intacte, aucune clé `depenses_2098 / 2099 / 2028` résiduelle.

> **Note sur la synchronisation.** `save()` ne pousse vers Firestore qu'après 5 secondes
> et seulement si un utilisateur est connecté. Une suite synchrone ne peut donc
> programmer qu'un seul envoi : celui qui suit la restauration de l'état réel. Lancer les
> suites en étant connecté reste néanmoins déconseillé.

---

## 2c. Suite du raccordement Firestore — `tests/pwa_sync_suite.js`

**18 assertions, 18 réussies.** La suite des modules couvre le *moteur* de fusion
(`js/sync.js`, M260–M304) : du calcul pur. Celle-ci couvre le *raccordement*, où vivent
les erreurs qui coûtent des données — un envoi qui écrase au lieu de fusionner ne se voit
nulle part dans les tests du moteur.

Elle remplace Firestore par un **magasin en mémoire** qui respecte ce qui compte du vrai :
`runTransaction`, `onSnapshot` avec `docChanges()` sur la collection, et surtout
`metadata.hasPendingWrites` — le drapeau qui distingue notre propre écriture qui revient
de l'écriture d'un autre appareil. Rien ne part sur le réseau et aucun compte n'est requis.
C'est la seule suite **asynchrone** : chaque envoi est un aller-retour `await`, et
`tests/run-headless.js` attend la promesse avant de fermer la fenêtre jsdom.

| Assertions | Ce qui est verrouillé |
|---|---|
| F01–F04 | premier envoi d'un appareil qui porte déjà des données : le document de l'année est écrit, la saisie y est, **les dates par feuille voyagent avec**, et les photos de reçus n'y sont **pas** (une photo pèse des centaines de Ko, le document plafonne à 1 Mio) |
| F05–F06 | un trajet saisi sur l'autre appareil arrive ici, **sans écraser** la saisie locale |
| F07 | notre propre écriture qui revient ne défait pas la saisie en cours — sans quoi deux appareils se renverraient le même document sans fin |
| F08–F09 | la configuration part dans son propre document, et le **thème** reste propre à l'appareil |
| F10–F12 | la clé d'un reçu (`p1090:deductibles:Eau / Égouts:3`) donne un identifiant de document sans « / », la photo monte dans son propre document, et sa ligne entre dans l'index synchronisé |
| F13 | une photo annoncée par l'index et absente d'ici se télécharge |
| F14–F15 | retirer un reçu pose une tombale sur sa ligne d'index et retire la copie locale — sinon le reçu supprimé reviendrait au prochain passage |
| F16–F18 | **le cas réel de la mise à jour** : deux appareils dont aucun n'est daté et qui divergent retiennent la même valeur, le désaccord est signalé, et le document ne repart plus (point fixe) |

**Ce qu'elle ne prouve pas.** Un Firestore de pacotille ne reproduit ni les règles de
sécurité, ni la latence, ni un échec de transaction pour cause de conflit, ni le mode hors
ligne du vrai SDK. Elle prouve que *notre* code appelle le bon chemin avec le bon contenu
et réagit correctement aux événements ; le reste se vérifie en production, à deux appareils.

---

## 3. Parcours complet de l'interface PWA

Chaque étape exécutée dans le navigateur, sur l'application réelle.

| # | Scénario | Résultat |
|---|---|---|
| 1 | Assistant de configuration, 6 étapes dynamiques : modules, immeubles, catégories, % de propriété, copropriétaires, véhicule | **OK** — `pct: 50` et copropriétaire persistés dans `depenses_setup` ; le champ copropriétaire n'apparaît que si `pct < 100` |
| 2 | Ajout d'un déplacement par le formulaire (110,8 km A/R, 15 juin) | **OK** — montant 79,78 $, rattaché au bon immeuble et au bon mois |
| 3 | Saisie mensuelle d'un immeuble : revenus, déductibles, capital | **OK** — 1 950 $ / 545,28 $ ; le capital (5 000 $) est bien exclu du net courant |
| 4 | Notes et reçu photo sur une cellule mensuelle | **OK** — note et image base64 conservées, clé `p1090_ded_<cat>_<mois>` |
| 5 | Saisie Uber (32 000 $ courses, 8 000 $ frais, 14 000 km en ligne) | **OK** — persisté après le debounce de 600 ms |
| 6 | Saisie Lyft (octobre : 4 200 $ taxable, 2 600 km) | **OK en données** — mais la carte « Net reçu ce mois » reste à 0 jusqu'au changement d'onglet (§ 4, affichages figés) |
| 7 | Dépenses véhicule (4 800 + 1 800 + 400 = 7 000 $) | **OK en données** — mais le total et les deux cartes de répartition ne se rafraîchissent pas à la saisie |
| 8 | Montants récurrents appliqués sur les mois vides | **OK** — remplit les mois vides, n'écrase jamais un montant saisi |
| 9 | Sommaire | **FAUX** — voir BUG-7 |
| 10 | Export CSV | **1 ligne malformée** — voir BUG-2 |
| 11 | Rapport PDF comptable | 8 pages, structure et lignes fiscales correctes ; **2 libellés illisibles** (BUG-8) |
| 12 | Aller-retour sauvegarde JSON (export puis import) | **Perte** du % de propriété et des copropriétaires (BUG-9) |
| 13 | Import d'une sauvegarde iOS (Snapshot v2) | **OK parfait** — 3 immeubles dont un dynamique, montants, notes, reçu base64, dates de trajets exactes |
| 14 | Changement d'année fiscale (2026 ↔ 2027) | **OK** — isolation complète des données par clé `depenses_<année>` |
| 15 | Ajout d'un trajet daté 2027 depuis l'écran 2026 | **CRITIQUE** — voir BUG-1 |

---

## 4. Tests iOS

### 4.1 Compilation

`xcodebuild` sur le schéma `RevenusDepenses`, SDK iOS 27.0 : **BUILD SUCCEEDED, zéro
avertissement du compilateur**. Revérifié le 22 octobre 2026, avec le noyau `Core/` de la
vague 1 inclus, pour les deux SDK :

```bash
xcodebuild -project ios_2026/RevenusDepenses.xcodeproj -scheme RevenusDepenses \
  -sdk iphoneos -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios_2026/RevenusDepenses.xcodeproj -scheme RevenusDepenses \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build
```

Les deux rendent `** BUILD SUCCEEDED **`, zéro `warning:`. (Une note de `ios_2026/README.md`
annonçait un conflit entre le catalogue d'actifs et les runtimes simulateur installés ; il
n'existe plus, la note a été retirée.)

### 4.2 Import PWA → iOS, à l'exécution

Lancement du harnais intégré avec une sauvegarde PWA réelle (exportée à l'étape 12) :

```bash
SIMCTL_CHILD_PWA_IMPORT_JSON=<sauvegarde.json> \
  xcrun simctl launch <device> com.ericfezeu.revenusdepenses
```

Rapport écrit par l'app dans `Documents/pwa_import_test.txt` :

```
OK année 2026
immeubles: p1090=1090 Oscar-Benoît [appart/colocation] rev:3 pct:100.0 co: |
           p470=470 Rue Gélinas (Triplex) [plex/triplex] rev:3 pct:100.0 co:
trajets: 1
revenus: 1950.0  dépenses: 545.276  capital: 5000.0
uber rides_gross: 32000.0  km_online: 14000.0
lyft mois: 1  véhicule: 7000.0
checklist: 19
```

- **Correct** : montants mensuels, trajet, Uber, Lyft, véhicule (4 800 + 1 800 + 400 =
  7 000 $), checklist.
- **Perdu** : `pct` revient à 100 % (50 % dans la PWA) et `coOwners` est vide — la
  sauvegarde PWA ne contient pas la clé `setup`. L'année a dû être **devinée** à partir du
  seul trajet : un fichier sans trajet atterrirait dans la mauvaise année fiscale.

### 4.4 Revérification après correctif : import d'une enveloppe v3

Même harnais, avec une sauvegarde PWA au nouveau format (enveloppe `format`/`version`/
`year`/`setup`/`state`) exportée par la PWA corrigée :

```
avant:
OK année 2026
immeubles: pA=Duplex A (test) [plex/duplex] rev:2 pct:100.0 co: |
           pB=Triplex B (test) [plex/triplex] rev:1 pct:50.0 co:Copropriétaire Test
trajets: 3
revenus: 28800.0  dépenses: 6852.0  capital: 8000.0
uber rides_gross: 30000.0  km_online: 4000.0
lyft mois: 1  véhicule: 10000.0
checklist: 19
```

- `pct:50.0` et `co:Copropriétaire Test` **survivent** à l'aller-retour : BUG-9 corrigé.
- L'année vient de l'enveloppe, plus d'une déduction à partir des trajets : BUG-10 corrigé.
- Les immeubles configurés dans la PWA (`pA`, `pB`) sont recréés côté iOS avec leur
  libellé, leur type et leurs catégories — avant le correctif, seuls les deux immeubles
  historiques de `AppConfig.legacyProperties` pouvaient l'être.
- `dépenses: 6852.0` = 6 600 $ de dépenses saisies + 350 km × 0,72 $. À noter : l'import
  iOS verse **tous** les trajets du fichier dans l'année déclarée, y compris le trajet
  daté 2027 que la fixture contient exprès. Un fichier PWA réel ne contient qu'une année
  (clé `depenses_<année>`), donc le cas ne se produit pas en usage normal ; c'est noté
  dans les améliorations.

---

### 4.3 Rapport PDF iOS, à l'exécution

```bash
SIMCTL_CHILD_PDF_SMOKE_TEST=1 xcrun simctl launch <device> com.ericfezeu.revenusdepenses
```

**9 pages, intégralement correctes**, vérifiées par extraction pdf.js :

- Page 1 : le résumé inclut bien le **revenu net Uber (14 350,10 $)** et le **revenu Lyft
  (5 290,00 $)** — l'erreur de l'écran Sommaire (BUG-7) n'affecte pas le PDF.
- Pages 2–3 : T776 par immeuble, lignes 8141 / 8690 / 9180 / 9200 / 9220 / 9949 / 9369 / 9946.
- **Cohérence vérifiée** : ligne 9200 = 478,66 $ (1090) et 712,80 $ (470), exactement
  `km du journal × 0,72 $` — l'annexe A justifie la ligne au dollar près. iOS n'a pas
  l'incohérence BUG-1 de la PWA.
- Page 5 : répartition 9 800 km Uber (44,5 %), 3 280 km Lyft (14,9 %), 1 654,8 km locatif
  (7,5 %) = 664,8 + 990 km, cohérent avec l'annexe A.
- `−`, `→`, `×` et tous les accents s'affichent correctement : **BUG-8 est propre à la PWA**.

---

### 4.5 Parité du noyau Swift avec la PWA — `npm run parite`

**94 / 94 assertions**, en deux secondes, sans simulateur. C'est la vérification qui rend
le portage iOS tenable : les sept fichiers de `ios_2026/RevenusDepenses/Core/`
(`Socle`, `FiscalData`, `TaxService`, `CCAService`, `Valeur`, `SyncService`,
`JournalService`) ne dépendent que de Foundation, donc ils se compilent **pour macOS** et
s'exécutent comme un programme en ligne de commande.

Le point important est la provenance des nombres attendus. Ils ne sont **pas retapés** :

1. `tests/pwa_modules_suite.js` relève ses propres valeurs mesurées, **à l'endroit même où
   ses assertions les vérifient**, dans un champ `parite`.
2. `npm run parite:export` exécute cette suite sous jsdom et écrit
   `ios_2026/Tests/Parity/parite-vague1.json` — en **refusant d'écrire** si une seule des
   297 assertions est rouge.
3. `npm run parite` compile le noyau et rejoue ce fichier côté Swift.

Donc une divergence ne peut venir que d'un écart réel entre les deux implémentations, et
la référence ne peut pas vieillir en silence : elle se régénère à partir de la PWA. Elle
fait aujourd'hui 6 216 lignes (150,7 Ko) et porte 19 sections.

| Famille | Ids | Ce qui est comparé |
|---|---|---|
| Parité du calcul fiscal | `P01`–`P28` | ce que la PWA a réellement produit, au cent près |
| Parité de la fusion et du journal | `P29`–`P57` | ce que la PWA a réellement **écrit**, comparé en JSON canonique, clé par clé et dans l'ordre |
| Invariants | `M19`–`M33`, `M53`–`M63`, `M267`, `M281`, `M299`, `M303`, `J07`, `J09`, `J11`, `J25` | les invariants des suites JS, revérifiés en Swift sous le même identifiant |

`M06` (`escH`) et `M08`/`M09` (`readYear`/`writeYear`) sont **volontairement écartés** :
échappement HTML et accès au `localStorage` n'ont pas d'équivalent dans le noyau. De même
`J06` (le nom de l'appareil : un iPhone doit se nommer « iPhone », pas se faire reconnaître
à son `User-Agent`) et `J30` (le rendu de l'écran).

#### Les pièges de traduction, consignés parce qu'ils se reproduiront

- **`Infinity`** n'existe pas en JSON. Le dernier palier passe par `null` et redevient
  `.infinity` en Swift ; il est comparé **par égalité**, jamais par soustraction, puisque
  `∞ − ∞` vaut `NaN` et qu'une tolérance l'accepterait.
- **La fixture change en cours de suite.** Chaque scénario de DPA est donc relevé là où
  ses propres assertions le voient, pas à la fin.
- **`aujourd'hui` est figé dans la référence**, sinon `echue`, `jours` et `enRetard`
  changeraient de sens le lendemain d'une date d'échéance.
- **La fusion compare des écritures, pas des valeurs** (2.8.0). `sync.js` décide de
  l'identité de deux feuilles par `JSON.stringify(a) === JSON.stringify(b)`, et départage
  deux écritures à la même milliseconde par un `>` sur ces deux mêmes textes. L'ordre des
  clés, l'écriture d'un nombre (`1` et non `1.0`) et la différence entre une clé absente et
  une clé à `null` font donc partie du comportement vérifié — d'où `Valeur.swift` et son
  lecteur JSON écrit à la main, et d'où le fait que les sections `sync` et `journal` de la
  référence ne sont **pas** décodées en types `Decodable` : un `Decodable` perdrait
  exactement ces deux dernières distinctions. `ParityCodec.swift` fait la traduction.
- **Swift trie les chaînes autrement que JavaScript** (2.8.0). Swift compare par
  équivalence canonique, JS par unités de code UTF-16 : un emoji se trie avant un
  caractère d'usage privé du plan de base en JS, et après lui avec `sorted()`. `triJS` et
  `texteEstPlusGrandJS` comparent les unités UTF-16 ; `P42` le vérifie.

#### Le harnais est capable d'échouer, vérifié faute par faute

Une suite de parité toujours verte ne prouve rien. Pour chaque vague, le harnais est mis à
l'épreuve en injectant des défauts et en comptant ce qui rougit.

- **Vague 1** : 18 valeurs corrompues dans une copie du JSON → **40 / 57 avec 17 échecs
  distincts** et un code de sortie 1, chacun nommant le champ fautif.
- **Vague 1 bis** : **onze défauts injectés un par un** dans `SyncService` et
  `JournalService` — départage d'égalité inversé (6 rouges), arguments de
  `texteEstPlusGrandJS` échangés (6), `tsD >= tsL` au lieu de `>` (7, dont `M299`),
  tombales d'ancêtres oubliées (6), liste des clés ignorées vidée (2), longueur de
  troncature (2), tri des filtres renversé (2), regroupement du journal effondré (1),
  `triJS` remplacé par `sorted()` (1), largeur de l'aperçu d'une suppression (1), filtre
  de l'`id` dans cet aperçu (2).

Deux leçons, et ce sont elles qui justifient l'exercice :

1. **Un vert qui ne vérifie rien est pire qu'un rouge.** Le premier passage affichait
   93/93 alors qu'une section de la référence était mal nommée : l'assertion agrégée
   comparait zéro paire et passait en silence. Une liste de cas vide est désormais un
   échec — ce qui a immédiatement révélé la section manquante (93/94).
2. **Trois des onze défauts ne rougissaient rien au premier essai** : le tri des chemins,
   la largeur de l'aperçu d'une suppression, et les deux bornes du journal (plafond d'une
   valeur inscrite, fenêtre de regroupement d'une rafale). Trois cas ont été ajoutés à la
   référence pour les couvrir — des listes de chemins à emoji et caractères d'usage privé
   (`P42`), la suppression d'un trajet à trois valeurs et d'une catégorie de douze cases
   (`P31`, `P34`), et les valeurs juste en deçà, à la borne et juste au-delà
   (`P46`, `P52`).

`ios_2026/Tests/XCTest/CoreParityTests.swift` contient la même suite sous forme de test
XCTest, prête à être rattachée dès qu'une cible de tests existera dans Xcode — le projet
n'en a pas encore, et `ios_2026/Tests/` est volontairement **hors** du groupe synchronisé
`RevenusDepenses` pour que le `main.swift` du lanceur ne devienne pas un second point
d'entrée de l'application.

---

## 5. Défauts confirmés

Classés par gravité. « Reproduit » = observé dans l'application réelle, pas seulement en test.

### BUG-1 — CRITIQUE · PWA · un trajet d'une autre année gonfle la déduction — ✅ CORRIGÉ

`getTripAmount()` ([index.html:1783](../pwa_2026/index.html#L1783)) filtre sur l'immeuble
et le mois, **sans filtre d'année**, alors que `getRentalKmTotal()`
([index.html:2538](../pwa_2026/index.html#L2538)) filtre bien sur `activeYear` :

```js
function getTripAmount(propId, mi) {
  return state.trips
    .filter(t => t.property === propId && monthOf(t.date) === mi)   // ← pas de yearOf()
    .reduce((s, t) => s + (parseFloat(t.km) || 0) * rate(), 0)
}
```

**Reproduit** : un trajet daté juillet **2027**, saisi par le formulaire réel, a augmenté
la déduction de juillet **2026** de 216 $ — tout en restant invisible dans « Déplacements
récents ».

**Conséquence** : le PDF remis au comptable se contredit lui-même. Dans le rapport
produit (11 pages, 3 immeubles), page 4, ligne 9200 :
**277,20 $**. Page 7, annexe A — le registre censé justifier cette ligne : **140,98 $** au
total, dont **61,20 $** pour cet immeuble. C'est exactement le genre d'écart qu'une
vérification de l'ARC cherche.

iOS est immunisé : les requêtes SwiftData portent un prédicat d'année.

### BUG-7 — ÉLEVÉ · PWA **et** iOS · le bénéfice global affiché est faux — ✅ CORRIGÉ

Dans `renderSummary()` ([index.html:2606](../pwa_2026/index.html#L2606)), `uberNet` est
calculé puis **jamais utilisé**, alors que les déductions véhicule Uber et Lyft sont bien
soustraites. La colonne TOTAL des revenus ne somme même pas la ligne Lyft affichée
juste au-dessus.

**Reproduit** : net affiché **−3 877,09 $** là où le résultat réel est largement positif.

iOS a le même défaut, dans `DataService.globalNet()`
([DataService.swift:246](../ios_2026/RevenusDepenses/Services/DataService.swift#L246)) :

```swift
func globalNet() -> Double {
    rentalNetGlobal() - vehicleDeductionUber() - vehicleDeductionLyft()
}
```

`uberNetIncome()` (ligne 271) et `lyftNetTotal()` (ligne 301) existent mais ne sont pas
appelées ici. La valeur est affichée comme « Bénéfice global » dans
[SummaryView.swift:86](../ios_2026/RevenusDepenses/Views/SummaryView.swift#L86).

Les PDF des deux applications sont corrects : seuls les écrans mentent.

### BUG-9 — ÉLEVÉ · la sauvegarde JSON ne contient pas la configuration — ✅ CORRIGÉ

`exportJSON()` ([index.html:2738](../pwa_2026/index.html#L2738)) sérialise le `state`
seul. La clé `depenses_setup` — immeubles, adresses, % de propriété, copropriétaires —
n'y figure pas.

**Reproduit, deux fois** :
- restauration dans la PWA : `pct` 50 % → 100 %, copropriétaires perdus, et un immeuble
  créé par l'utilisateur revient en « Immeuble importé » sans adresse — les deux
  apparaissent tels quels sur le T776 ;
- restauration sur iOS (§ 4.2) : `pct: 100.0`, `coOwners` vide ; et `restorePWA` ne
  recrée que les immeubles historiques, donc les données d'un immeuble supplémentaire
  seraient perdues.

Le format iOS (Snapshot v2) transporte, lui, tout cela correctement.

### BUG-2 — MOYEN · PWA · une ligne CSV a une colonne de trop — ✅ CORRIGÉ

L'entête compte 15 colonnes (Section, Catégorie, 12 mois, Total) ; la ligne
`Lyft - Revenus` en produisait **16**. Reproduit sur un export réel.

Corrigé le 20 octobre 2026 ([index.html](../pwa_2026/index.html)) : le net mensuel Lyft
est écrit dans la colonne de son mois (`vals = Array(12).fill(0); vals[mi] = net`) et la
ligne compte 15 colonnes. Le défaut était double — une colonne de trop *et* un montant
qui n'apparaissait dans aucun mois, donc invisible à toute somme par colonne dans un
tableur. T29/T30 verrouillent les deux. L'omission d'Uber et des dépenses véhicule,
signalée ici comme une limite connue, a été corrigée depuis (fiche E.1, version 2.2.0).

### BUG-8 — MOYEN · PWA · deux libellés illisibles dans le PDF

jsPDF n'écrit correctement que le jeu WinAnsi. Les 4 chaînes contenant `−` (U+2212) ou
`→` (U+2192) basculent en UTF-16 brut. Extraction réelle de la page 1 :

```
\u0000R\u0000e\u0000v\u0000e\u0000n\u0000u\u0000 \u0000n\u0000e\u0000t\u0000 \u0000U\u0000b\u0000e\u0000r…
```

Lignes concernées : [3704](../pwa_2026/index.html#L3704) (résumé, page 1) et
[3839–3841](../pwa_2026/index.html#L3839) (répartition des km, page véhicule) — la flèche
y apparaît comme `!’`.

### BUG-3 — MOYEN · PWA · les nouveaux réglages arrivent `undefined` — ✅ CORRIGÉ

`handleImport()` ([index.html:2751](../pwa_2026/index.html#L2751)) fait
`Object.assign(defaultState(), data)`, qui remplace `settings` **en bloc**. Un réglage
ajouté après la sauvegarde de l'utilisateur devient `undefined` : `kmTotalAnnuel` absent
met silencieusement toute la proration véhicule à 0.

### Affichages figés — MOYEN · PWA

- Lyft : la carte « Net reçu ce mois » est figée dans le `innerHTML` de `renderLyft()`
  ([2379](../pwa_2026/index.html#L2379)) ; `saveLyftField()`
  ([2417](../pwa_2026/index.html#L2417)) ne rafraîchit que le total du mois.
- Véhicule : `saveVehDep()` ([2527](../pwa_2026/index.html#L2527)) n'appelle pas
  `refreshVehicleCalcs()` ([2875](../pwa_2026/index.html#L2875)) — le total et les deux
  cartes de répartition restent à 0.

L'utilisateur voit 0 après avoir saisi un montant et peut croire que la saisie a échoué.

### BUG-5 — MOYEN · PWA · date de trajet prise en UTC

`initTripForm()` ([index.html:1919](../pwa_2026/index.html#L1919)) préremplit la date avec
`new Date().toISOString().split('T')[0]`. Après 20 h heure du Québec, c'est **demain**.
Le 31 décembre au soir, cela franchit l'année fiscale et déclenche BUG-1 en silence.

### BUG-10 — FAIBLE/MOYEN · la sauvegarde PWA ne porte pas l'année — ✅ CORRIGÉ

Aucune clé `year` dans le fichier : iOS doit la déduire des trajets. Une sauvegarde sans
trajet atterrit dans la mauvaise année fiscale. Confirmé au § 4.2.

### Perte de données silencieuse — FAIBLE/MOYEN · PWA

`save()` ([index.html:1127](../pwa_2026/index.html#L1127)) : `catch(e) {}`. Avec des reçus
photo en base64 dans `localStorage`, le dépassement de quota est un scénario réaliste —
et l'utilisateur n'en est jamais informé.

### Divers

- Le **% de propriété n'est appliqué que dans le PDF** (les deux apps). Écrans et CSV
  montrent 100 %. iOS le signale au moins à l'utilisateur
  ([PropertyEditorView.swift:263](../ios_2026/RevenusDepenses/Views/PropertyEditorView.swift#L263)).
- `favicon.ico` → 404.
- `<meta name="apple-mobile-web-app-capable">` déprécié — seul avertissement console.
- Le service worker sert les ressources non-HTML en cache-first sans révision : un
  fichier modifié reste figé jusqu'au prochain `CACHE` incrémenté.

---

## 6. Ce qui fonctionne, vérifié

- Assistant de configuration : 6 étapes dynamiques, `pct` et copropriétaires persistés,
  champ copropriétaire conditionnel.
- Arithmétique mensuelle : totaux revenus/déductibles exacts, **capital correctement
  exclu** du revenu courant.
- Prorata véhicule : méthodes 1 et 2 exactes, aucune division par zéro quand les km
  annuels valent 0.
- Montants récurrents : remplissent les mois vides, n'écrasent jamais une saisie.
- Années fiscales : isolation complète, bascule 2026 ↔ 2027 sans fuite.
- Import iOS → PWA : parfait, y compris immeubles dynamiques, notes, reçus base64 et
  dates exactes.
- Rapport PDF : structure, lignes fiscales et annexes justificatives conformes dans les
  deux applications ; côté iOS, cohérence annexe A ↔ ligne 9200 vérifiée au dollar.
- Rendu des 6 onglets et d'un état vierge : aucune exception.
- Compilation iOS : succès, zéro avertissement.
