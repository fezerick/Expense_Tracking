# Journal des versions — Mon Plex

Format : [semver](https://semver.org/lang/fr/) — `MAJEUR.MINEUR.CORRECTIF`.
Ce que chaque rang signifie pour cette application est défini au § 2.9 de
[ARCHITECTURE.md](ARCHITECTURE.md) :

- **MAJEUR** — le format des données change et une sauvegarde ancienne ne se relit plus telle quelle ;
- **MINEUR** — nouvelle fonctionnalité, nouveau module, nouvel onglet ;
- **CORRECTIF** — correction, libellé, retouche de calcul sans nouvelle fonctionnalité.

La version est écrite aux six endroits par `scripts/version.sh`, seul outil autorisé
à les toucher. Elle s'affiche en bas de l'onglet **Réglages**.

> Les versions antérieures à 2.1.0 n'étaient pas numérotées : l'application ne portait
> alors aucun `APP_VERSION` et le cache du service worker s'appelait `depenses-v1`
> puis `depenses-v2`. Les entrées ci-dessous les reconstituent depuis l'historique git
> pour que le journal soit complet ; leurs numéros sont attribués après coup.

---

## 2.9.0 — 22 octobre 2026

**L'impôt et l'amortissement s'utilisent sur l'iPhone.** Les deux moteurs portés par la
2.7.0 avaient tout du calcul et rien de l'usage : aucun écran ne les appelait, et aucune
donnée saisie ne leur parvenait. Cette version livre les deux vues SwiftUI, les deux
modèles de persistance qui les alimentent, et leur place dans la sauvegarde. La vague 1 du
portage (voir [PORTAGE_IOS.md](PORTAGE_IOS.md) § 5) est close.

Rien ne change dans la PWA, dont le comportement est inchangé — seuls le numéro de version
et le nom du cache le sont.

### Ajouté
- **`Views/TaxView.swift`** (357 l.) — le portage de l'écran `impot.js` : la provision à
  constituer, le taux marginal, le détail du revenu net et de l'impôt, et les quatre
  échéances d'acomptes avec leur état (en retard, versé, échu, à venir). La vue ne calcule
  rien : elle appelle `Core/TaxService.swift` et ne collecte que les montants que
  l'application ne peut pas deviner — salaire, retenues à la source, gains déjà cotisés au
  RRQ, acomptes réellement versés.
- **`ProvisionBanner`** — le portage de `renderBandeauProvision()`, sur l'Accueil. C'est la
  seule donnée qu'on regrette de ne pas avoir vue avant le 15 mars : elle s'affiche en
  orange, en rouge dès qu'un acompte manque, et ouvre l'écran Impôt d'un toucher.
- **`Views/CCAView.swift`** (498 l.) — le portage de l'écran `dpa.js` : le tableau des
  catégories mises en commun (FNACC d'ouverture reportée, ajouts, demi-taux, DPA maximale,
  réclamée, clôture), le registre des biens, l'éditeur d'un bien, l'import du registre
  d'une année antérieure, et la feuille d'arbitrage **« Faut-il réclamer la DPA cette
  année ? »** — qui chiffre l'économie immédiate en face de la récupération imposable à
  100 % à la revente.
- **`TaxInputs` et `CapitalAsset`** (`Models/Models.swift`) — la persistance SwiftData des
  deux écrans, compatible CloudKit comme les autres. Le registre de DPA est annuel, comme
  `depenses_<année>.biens` dans la PWA, et c'est `assetId` — conservé à l'identique d'une
  année à l'autre — qui relie les exercices et permet le report automatique de la FNACC.
- **La section DPA de `DataService`** — `entreesImpot()`, `calculImpot()`,
  `calculAcomptes()`, `tauxMarginalEstime()`, `calculDPA()`, `reclamerDPA()`,
  `reclamerMaxDPA()`, `renoncerDPA()`, `importerRegistre(depuis:)`, `dpaCumulee()`. C'est
  tout le branchement : le noyau reçoit des valeurs, ne lit rien, et reste compilable hors
  simulateur.
- **L'impôt et le registre dans la sauvegarde** (`Services/BackupService.swift`) — exportés
  en v2.9, relus à l'import iOS, et **lus depuis une sauvegarde de la PWA** (`state.impot`,
  `state.biens`). Les deux champs sont optionnels : une sauvegarde antérieure se relit
  telle quelle.

### Corrigé
- **« Autres déductions » dans le détail du revenu net.** Le montant était déduit du revenu
  net par soustraction. Or `Assiettes.revenuNet` est borné à zéro : dès que les déductions
  dépassent le revenu, la soustraction rendait un montant faux. La ligne lit désormais la
  valeur saisie.

### Notes
- Les deux écrans ne sont pas un sixième onglet : la barre en compte déjà cinq, et UIKit
  replierait le sixième dans un menu « Plus ». Ils s'ouvrent depuis le **Sommaire fiscal**
  et, pour l'impôt, depuis le bandeau de l'Accueil — comme dans la PWA, où l'onglet fiscal
  les regroupe.
- Le noyau n'est pas touché : les **94 assertions de parité** restent vertes, et la suite
  PWA rend 426/426. La build iOS passe sans avertissement (Xcode 27, simulateur).

---

## 2.8.0 — 22 octobre 2026

**L'iPhone saura fusionner au lieu d'écraser.** La vague 1 bis du portage
(voir [PORTAGE_IOS.md](PORTAGE_IOS.md) § 5) est livrée : le moteur de fusion champ par
champ et le journal des modifications existent en Swift, et rendent exactement les mêmes
écritures que la PWA. Rien de visible dans la PWA, dont le comportement est inchangé —
seul le numéro de version et le nom du cache le sont.

C'est la condition posée à la fin de la 2.7.0 : sans cette vague, un iPhone qui écrirait
dans Firestore remplacerait le document au lieu de le fusionner, et ré-introduirait la
perte de données que la 2.5.0 avait éliminée côté PWA.

### Ajouté
- **`Core/SyncService.swift`** (689 l.) — le portage de `js/sync.js` : `aplatir()`,
  `dater()`, `fusionner()`, l'empreinte d'un état, la décision de renvoyer au cloud, les
  pierres tombales et leurs ancêtres, le départage de deux écritures à la même
  milliseconde.
- **`Core/JournalService.swift`** (458 l.) — le portage de `js/journal.js` : le nom de
  l'appareil, le libellé d'un chemin avec et sans lexique, les entrées, le regroupement
  d'une rafale de saisies, l'entrée de lot au-delà de 40 changements, les filtres de
  consultation, le groupement par jour et la phrase de chaque ligne.
- **`Core/Valeur.swift`** (439 l.) — l'arbre JSON du noyau, **qui préserve l'ordre des
  clés** et distingue une clé absente d'une clé à `null`. Voir ci-dessous : ce n'est pas
  un confort, c'est la condition de la fusion.
- **37 assertions de parité supplémentaires** (`P29`–`P57`) : la suite passe de **57 à
  94**. La référence relevée sur la PWA passe de 1 022 à 6 216 lignes de JSON
  (150,7 Ko, 19 sections).

### Interne
- **La fusion compare des *écritures*, pas des valeurs.** `sync.js` décide de l'identité
  de deux feuilles par `JSON.stringify(a) === JSON.stringify(b)`, et départage deux
  écritures à la même milliseconde par un `>` sur ces deux mêmes textes. Donc tout ce qui
  change la *façon d'écrire* un nombre ou un objet change le résultat de la fusion :
  `1` et `1.0`, `{a:1,b:2}` et `{b:2,a:1}` ne sont pas la même chose pour elle. Swift n'a
  rien d'équivalent — `JSONSerialization` réordonne les clés et `"\(1.0)"` rend `1.0` là
  où JS rend `1`. D'où `Valeur.swift`, avec son lecteur JSON écrit à la main, son
  `nombreJS`, son `texteEstPlusGrandJS` (comparaison par unités de code UTF-16) et son
  `triJS` (l'ordre de `Array.prototype.sort()`). Un dictionnaire Swift ordinaire aurait
  suffi à faire diverger deux appareils.
- **La parité ne se compare plus par nombres, mais par textes canoniques.** Les sections
  `sync` et `journal` de la référence ne sont **pas** décodées en types `Decodable` fixes :
  elles sont relues par le lecteur du noyau lui-même, et chaque résultat Swift est comparé
  au résultat PWA clé par clé, dans l'ordre, sous forme de JSON canonique
  (`ios_2026/Tests/Parity/ParityCodec.swift`). Un `Decodable` aurait perdu précisément les
  deux choses vérifiées : l'ordre des clés et la différence entre absent et `null`.
- **Une assertion agrégée sans aucun cas est désormais un échec.** Le premier passage
  affichait 93/93 en vert alors qu'une section de la référence était mal nommée et que la
  comparaison portait donc sur zéro paire. Une liste vide fait maintenant rougir
  l'assertion, ce qui a immédiatement révélé la section manquante (93/94).
- **Le harnais a été prouvé capable d'échouer, faute par faute.** Onze défauts ont été
  injectés un par un dans une copie du noyau (départage inversé, `tsD >= tsL` au lieu de
  `>`, tombales d'ancêtres oubliées, liste des clés ignorées vidée, largeur d'aperçu,
  fenêtre de regroupement du journal divisée par deux, tri des chemins remplacé par
  `sorted()`…) : chacun rougit au moins une assertion, de 1 à 7 selon le défaut.
  **Trois d'entre eux ne rougissaient rien au départ** — le tri des chemins, la largeur de
  l'aperçu d'une suppression et les deux bornes du journal. Trois cas ont donc été ajoutés
  à la référence pour les attraper : des listes de chemins à emoji et caractères d'usage
  privé (`P42`), la suppression d'un trajet à trois valeurs et d'une catégorie de douze
  cases (`P31`, `P34`), et les valeurs juste en deçà, à et au-delà du plafond
  (`P46`, `P52`).
- **Quatre invariants de la suite JS repris sous leur identifiant d'origine** : `M267`
  (fusionner deux fois ne change rien la seconde), `M281` (l'ordre des clés d'une méta),
  `M299` (deux appareils convergent vers la même empreinte), `M303` (les douze cases d'une
  catégorie naissante), plus `J07`, `J09`, `J11` et `J25` pour le journal.
- **`MetaSync` porte maintenant le numéro de schéma `v`.** Il voyage jusqu'à Firestore,
  où un appareil resté sur une version antérieure le lit : une méta écrite sans `v` ferait
  croire à la PWA qu'elle lit des données d'avant la 2.5.0.
- `scripts/ios-parity.sh` compile désormais **tous** les fichiers de `Tests/Parity/`
  (la suite était répartie en deux fichiers) et ne répète plus que `xcodebuild` échoue :
  il construit l'application, vérifié le 22 octobre 2026 pour l'appareil et le simulateur
  — il n'a simplement aucune cible de tests à exécuter.
- Suites : 111 + 297 + 18, plus **94** assertions de parité iOS.

---

## 2.7.0 — 22 octobre 2026

**L'application iOS commence à calculer, et elle calcule juste.** La vague 1 du portage
(voir [PORTAGE_IOS.md](PORTAGE_IOS.md) § 5) est livrée : les paramètres fiscaux, l'impôt,
les acomptes et la déduction pour amortissement existent en Swift. Rien de visible dans la
PWA, dont le comportement est inchangé — seul le numéro de version et le nom du cache le
sont.

### Ajouté
- **Un noyau de calcul Swift** (`ios_2026/RevenusDepenses/Core/`, 4 fichiers) : `Socle.swift`
  (`num`, `fmt`, `money`, `csvCell`/`csvLigne`, `anneeDe`, `shortLabel`), `FiscalData.swift`
  (les paramètres 2025 et 2026, les 13 catégories de DPA, l'indemnité kilométrique, RRQ,
  RQAP, FSS, le montant personnel de base fédéral), `CCAService.swift` (mise en commun,
  classe distincte de l'art. 1101(1ac), plafond du par. 1100(11), demi-taux suspendu par
  l'IIA, catégorie 10.1, réclamation du maximum, renonciation) et `TaxService.swift`
  (assiettes, impôt combiné, provision, quatre acomptes et leurs retards).
- **Une suite de parité** (`npm run parite`) : **57 assertions** qui comparent la sortie du
  noyau Swift à celle de la PWA, sur la fixture de `tests/pwa_modules_suite.js`.

### Interne
- **La référence de parité est relevée, pas retapée.** `npm run parite:export` exécute la
  vraie suite de modules sous jsdom et écrit ce qu'elle a mesuré au passage dans
  `ios_2026/Tests/Parity/parite-vague1.json`. Retaper les attendus dans une suite Swift
  aurait créé une troisième vérité, à corriger trois fois à chaque budget du Québec. La
  référence refuse d'être relevée si une seule des 297 assertions est en échec.
- **Deux familles d'identifiants dans la suite Swift.** `P01`–`P28` comparent au cent près
  ce que la PWA a réellement produit ; `M19`–`M33` et `M53`–`M63` reprennent, sous le même
  identifiant que la suite JavaScript, les invariants que le calcul doit respecter. Une
  discussion sur « M24 » désigne donc la même règle des deux côtés.
- **Deux différences d'architecture, assumées et documentées dans le code.** Là où `dpa.js`
  lit `localStorage` pour reporter la FNACC de l'année précédente, `CCAService` reçoit un
  *fournisseur* injecté — l'assertion P21 vérifie qu'en son absence rien n'est reporté. Là
  où `impot.js` lit `state`, `TaxService` reçoit des agrégats déjà totalisés (`EntreesImpot`)
  et ne lit rien : c'est ce qui permet d'exécuter la parité hors simulateur.
- **`aujourdhui` est épinglé dans la référence.** Les acomptes dépendent de la date du jour ;
  sans cela, `echue`, `jours` et `enRetard` auraient changé de sens au premier 15 décembre
  franchi, et la parité aurait échoué pour une raison étrangère au code.
- `tests/page-jsdom.js` (nouveau) : le montage de la page jsdom, extrait de
  `run-headless.js` dès qu'un second outil en a eu besoin. Deux copies des prothèses de
  navigateur auraient fini par décrire deux pages subtilement différentes.
- `scripts/ios-parity.sh` compile le noyau pour **macOS** avec `swiftc` et exécute la suite
  en deux secondes. C'est possible parce que le noyau ne dépend que de Foundation — ni
  UIKit, ni SwiftData, ni état d'application — et c'est pour cela qu'il en est ainsi.
  `ios_2026/Tests/XCTest/CoreParityTests.swift` appellera la même
  `ParitySuite.executer()` le jour où le projet aura une cible de tests.
- Suites : 111 + 297 + 18, plus 57 assertions de parité iOS.

---

## 2.6.0 — 20 octobre 2026

### Ajouté
- **Historique des modifications** (fiche C.3), dans l'onglet *Fiscal › Clôture*. Chaque
  montant modifié s'inscrit avec sa date, son heure, l'appareil, l'emplacement en clair
  (« 1090 › Dépenses › Électricité › mars »), l'ancienne valeur et la nouvelle. Répond à
  la question qui n'avait pas de réponse : *pourquoi le total n'est-il plus celui que j'ai
  envoyé au comptable ?*
- **Ce qui arrive d'un autre appareil est inscrit à l'arrivée**, marqué 📥 et nommé
  (« reçu de iPhone »). Le journal local explique donc la totalité des changements de
  l'état local, sans que le journal lui-même ait à se synchroniser.
- **Depuis la clôture.** Quand l'empreinte d'une année clôturée ne correspond plus, le
  bandeau d'alerte porte désormais un bouton qui liste les modifications inscrites
  *depuis la clôture* — au montant près, avant de dire quoi que ce soit au comptable.
- Filtres (tout / saisi ici / reçu), recherche sur le libellé lisible, regroupement par
  jour, **export CSV** de l'historique, et effacement manuel.
- Une suppression garde la trace de ce qu'elle a emporté
  (« Trajet › tB — retiré (6 cases : 2026-03-02, Rona, 18) ») : six mois plus tard, un
  identifiant interne ne dit rien.

### Interne
- `syncDater()` et `syncFusionner()` rendent désormais la liste `changements` — chemin,
  ancienne valeur, nouvelle valeur. Le calcul était déjà fait pour dater les feuilles ;
  seul le résultat était jeté. **Aucune des ~60 fonctions de saisie n'a été modifiée**, et
  aucune ne peut donc oublier de journaliser.
- `js/journal.js` (20ᵉ module) : repli des écritures rapprochées (trois hésitations sur
  un montant = une ligne ; une correction annulée = aucune ligne), plafond de 800 lignes
  par année, ligne de synthèse unique au-delà de 40 valeurs reçues d'un coup, et écriture
  qui ne peut jamais faire échouer une sauvegarde.
- 30 assertions ajoutées (J01–J30). Suites : 111 + 297 + 18.

---

## 2.5.1 — 20 octobre 2026

### Corrigé
- **Deux appareils pouvaient se renvoyer le même document sans fin.** Sur des données
  écrites avant la 2.5.0 — donc sans aucune date — deux appareils qui ne portaient pas la
  même valeur dans la même case gardaient chacun la sienne : chacun voyait le document de
  l'autre comme différent du résultat de sa fusion, chacun renvoyait le sien, toutes les
  deux secondes et demie, indéfiniment, avec un avertissement à chaque tour. C'est
  exactement la situation d'une première synchronisation entre un téléphone et un
  ordinateur contenant déjà des données. Deux causes, les deux corrigées :
  - à égalité de dates, le départage ne regarde plus *qui* est l'appareil local mais
    seulement les deux valeurs — la valeur non vide gagne, puis la plus grande des deux
    écritures. Arbitraire, mais **identique sur les deux appareils**, donc les deux
    convergent ; le désaccord est signalé comme avant ;
  - une date à `0` (c'est-à-dire *aucune* date) n'entre plus dans le journal, et une
    feuille absente du journal de l'autre appareil n'y est plus prise pour une version
    plus récente.
- Vérifié en navigateur sur deux appareils simulés dont aucun n'est daté et dont trois
  cases divergent : même état des deux côtés, trois désaccords signalés de chaque côté, et
  plus aucun envoi.

### Interne
- Assertions ajoutées : M272a–M272d (le départage est symétrique, et la fusion a un point
  fixe) et F16–F18 (le cas réel, au niveau du raccordement Firestore).

---

## 2.5.0 — 20 octobre 2026

### Ajouté
- **La synchronisation automatique entre appareils, champ par champ.** Les données
  saisies sur le téléphone apparaissent sur l'ordinateur, et l'inverse, sans rien
  demander : cinq secondes après la dernière frappe l'application envoie, et elle
  récupère en continu ce que l'autre appareil écrit. Toutes les années sont
  synchronisées, pas seulement celle qui est ouverte.
- **Rien ne s'écrase plus.** Jusqu'ici la synchronisation était un *remplacement* :
  le dernier appareil à écrire gagnait tout, et une soirée de saisie sur le téléphone
  disparaissait parce que l'ordinateur, resté ouvert sur des données plus vieilles,
  avait renvoyé sa version. Désormais **chaque valeur** — un montant de mois, un champ
  de relevé, un réglage — porte sa propre date de dernière écriture, et la fusion garde
  la plus récente des deux. Deux appareils qui saisissent le même soir, l'un les loyers
  de janvier et l'autre celui d'avril, retrouvent les deux.
- **Les désaccords sont dits, pas tranchés en silence.** Quand les deux appareils ont
  écrit la même case dans la même seconde, la pastille de synchronisation affiche
  « ⚠️ N désaccord(s) » au lieu de laisser croire que tout allait de soi.
- **Les réglages suivent aussi** — identité, taux, biens, baux, règles de catégorisation
  — à l'exception du **thème**, qui reste propre à chaque appareil : le mode sombre du
  téléphone le soir n'a aucune raison de s'imposer à l'ordinateur.
- **Les photos de reçus voyagent.** Chaque photo part dans son propre document, et
  l'appareil qui ne l'a pas encore la télécharge à l'ouverture. Supprimer un reçu le
  supprime partout.

### Corrigé
- **Deux pertes de données dans le moteur de fusion**, attrapées en navigateur et non
  par les tests : une catégorie qui recevait sa première valeur était prise pour une
  catégorie disparue et posait une pierre tombale qui l'effaçait sur l'autre appareil ;
  et la coquille vide envoyée par l'appareil qui n'avait jamais touché une catégorie
  écrasait la catégorie remplie d'en face.
- **Le piège des douze cases.** Saisir avril dans une nouvelle catégorie crée les onze
  autres cases vides d'un même geste. Datées, ces cases vides étaient plus récentes que
  les loyers de janvier à mars déjà saisis ailleurs, et la fusion les effaçait — trois
  mois de loyers perdus en créant une case. Une case qui **naît** vide ne porte plus de
  date ; vider une case qui **portait** un montant reste, elle, une écriture qui se
  défend.

### Interne
- `pwa_2026/js/sync.js` (19ᵉ module) : le moteur de fusion, sans Firebase et sans état,
  donc testable seul. Dates par feuille, pierres tombales au plus court préfixe
  entièrement disparu, tableaux indexés par `id` ou par position selon leur forme,
  empreinte canonique pour éviter que deux appareils se renvoient indéfiniment le même
  document.
- Chaque envoi passe par une **transaction** Firestore (lire, fusionner, écrire) : deux
  appareils qui envoient en même temps ne peuvent plus se perdre l'un l'autre.
- `firestore.rules` est maintenant dans le dépôt et se déploie avec l'application : un
  compte ne lit et n'écrit que ses propres données.
- Les reçus passent par des **documents** Firestore et non par Firebase Storage : le
  projet n'a pas de bucket et en créer un exige aujourd'hui le plan Blaze. Seules trois
  fonctions touchent au stockage, le jour où cela change.
- Suite modules : 263 assertions, dont la section « S. Fusion entre appareils ».
- Troisième suite, `tests/pwa_sync_suite.js` (`npm run test:sync`) : le raccordement à
  Firestore vérifié contre un **Firestore de pacotille** — transactions, écoute temps
  réel, écho de nos propres écritures, configuration sans le thème, cycle complet d'une
  photo de reçu. Sans réseau et sans compte.

---

## 2.4.0 — 20 octobre 2026

### Ajouté
- **Les péages du relevé Lyft.** Le sommaire fiscal porte une ligne « Tolls » /
  « Péages » que l'application n'avait nulle part où ranger : Lyft refacture le péage au
  passager puis le reverse au chauffeur, qui l'a payé de sa poche. Le montant reçu est
  un **revenu** — il entre dans le net du mois, dans le rapport PDF, dans le CSV du
  dossier, dans l'impôt estimé et dans le tableau pluriannuel — tandis que le péage payé
  se déduit du côté véhicule : les deux s'annulent, mais seulement si le reçu est
  déclaré. Lu automatiquement à l'import du PDF, dans les deux langues du relevé.
- Un péage n'entre **pas** dans les fournitures taxables de la ligne 101 du FPZ-500.
  Lyft calcule lui-même la TPS/TVQ perçue sur sa ligne « Base taxable » ; l'y ajouter
  compterait la même fourniture deux fois et gonflerait la taxe nette. La fiche le
  rappelle lorsqu'un péage est saisi.
- La colonne « Péages » du détail mensuel, dans le rapport PDF, n'apparaît que si un mois
  en porte : la plupart des relevés affichent « Tolls CA$0.00 », et une colonne de zéros
  volerait de la largeur aux six autres.

### Interne
- **Une seule définition du net mensuel de Lyft** : `lyftMonthNet()`, et son cumul
  annuel `lyftNetTotal(st)`. La formule était recopiée à **sept** endroits — le
  formulaire, son total de pied, le sommaire général, le CSV du dossier, le rapport PDF,
  `lyftNetIncome()` de l'impôt estimé et le tableau pluriannuel. Ajouter les péages
  aurait demandé sept modifications concordantes, et un oubli se serait vu comme un
  écart entre deux écrans de la même donnée. L'argument `st` sert au tableau
  pluriannuel, qui calcule sur une année archivée.
- La convention de signe de la 2.3.0 est précisée : elle ne vaut que pour les sorties
  d'argent. Le péage est positif sur le relevé **et** dans l'application sans passer par
  `cout()` — le critère n'est pas le signe imprimé, c'est le sens du flux.

### Tests
- **111/111** pour le socle (T98 à T102) et **218/218** pour les modules (M52g à M52i).
  M52h et M52i disent ensemble la seule chose subtile du champ : revenu oui, fourniture
  taxable non.

---

## 2.3.0 — 20 octobre 2026

### Ajouté
- **Les huit lignes de TPS/TVQ du relevé Lyft.** La fiche mensuelle Lyft n'avait que six
  champs ; son sommaire fiscal en détaille huit de plus, que l'app n'avait nulle part où
  ranger : TPS et TVQ perçues des passagers, TPS et TVQ perçues **sur les primes**, TPS
  et TVQ payées sur les frais Lyft, TPS et TVQ déjà versées par Lyft en votre nom. Elles
  sont lues automatiquement à l'import du PDF et saisissables à la main.
- **La déclaration FPZ-500 compte enfin la part de Lyft.** Elle ne voyait que celle
  d'Uber, alors que la ligne 101 comptait déjà les fournitures taxables de Lyft : la taxe
  nette sortait **trop basse**, et les CTI/RTI sur les frais Lyft — que personne ne
  réclame à la place du chauffeur — étaient perdus. L'onglet TPS/TVQ, le CSV du FPZ-500,
  le dossier comptable et le rapport PDF portent maintenant un **détail par plateforme**,
  pour qu'un écart avec le relevé papier se localise.
- La fiche Lyft rappelle, lorsqu'une taxe est saisie, que la taxe perçue **n'entre pas
  dans le net** : elle est encaissée pour le compte de Revenu Québec.

### Corrigé
- **Les frais importés d'un relevé PDF étaient ajoutés au revenu au lieu d'en être
  retranchés.** Défaut découvert en implémentant ce qui précède, et rendu **actif** par
  la 2.2.2 : tant que les frais Lyft n'étaient pas détectés, il ne se voyait pas. Les
  analyseurs rendaient le signe du relevé (négatif, parce qu'il décrit un décaissement)
  alors que tous les totaux de l'app retranchent les frais. Sur un mois à 88,42 $ de
  frais, le net annoncé était 663,90 $ au lieu de 487,06 $ — l'écart vaut deux fois les
  frais. Touchait aussi `service_fee`, `other_fees`, `fee_discount`, `gst_paid_uber` et
  `qst_paid_uber` côté Uber, ainsi que le « déjà versé » des deux plateformes, dont le
  solde de taxes doublait. La règle est désormais isolée dans `cout()` : le signe du
  relevé sert à reconnaître la ligne, seule la magnitude est stockée.
- **Trois assertions attendaient le signe fautif** (T59, T68, T86) : elles documentaient
  le défaut au lieu de le détecter. Corrigées.
- Le modèle de données de Lyft était décrit à tort dans ARCHITECTURE.md avec une clé
  `"2026-10"` et des noms de champs français ; les mois sont indexés de 0 à 11 et les
  champs portent des noms anglais.

### Interne
- `LYFT_FIELDS` déclare la fiche Lyft une seule fois, à la façon d'`UBER_FIELDS` : le
  formulaire mensuel, la feuille de révision du PDF et l'application des valeurs lues en
  découlent. Les six champs étaient jusqu'ici répétés aux trois endroits ; les huit
  nouveaux en auraient fait un quatrième.
- `lyftTaxTotals()` cumule les douze relevés mensuels : le sommaire fiscal de Lyft est
  mensuel, celui d'Uber annuel, et la déclaration de taxes est annuelle.
- `tpsVerseeUber` / `tvqVerseeUber` deviennent `tpsVerseePlateforme` /
  `tvqVerseePlateforme` — le montant n'est plus celui d'une seule plateforme.

### Tests
- **106/106** pour le socle (T88 à T97) et **215/215** pour les modules (M52a à M52f).

---

## 2.2.2 — 20 octobre 2026

### Corrigé
- **Le relevé Lyft réellement remis au chauffeur n'était pas reconnu.** Il s'agit du
  « Sommaire fiscal mensuel » bilingue — page 1 en anglais, page 2 en français — dont le
  vocabulaire n'était couvert par aucun des formats prévus en 2.2.1 :
  - `Taxable Base` / `Base imposable` pour la base taxable ;
  - `Lyft & 3rd Party Fees` / `Lyft et les frais de tiers` pour les frais ;
  - `Total Kilometres` / `Kilométrage total` pour la distance — l'orthographe
    américaine `Kilometers`, seule prévue, ne correspondait pas ;
  - `Total Rides` / `Courses totales` pour le nombre de courses.
- **Les frais Lyft étaient lus en positif, donc ajoutés au revenu.** Ce relevé note les
  montants négatifs à la façon comptable, parenthèses comprises, avec le code de devise
  **dans** la parenthèse : `(CA$88.42)`. Le `CA$` empêchait de rattacher la parenthèse
  ouvrante au nombre, et le signe était perdu. Un préfixe de devise collé au symbole est
  désormais reconnu, et le signe négatif accepté des deux côtés de ce préfixe.
- **Le kilométrage perdait sa troisième décimale.** Lyft écrit `512.473` ; la lecture
  s'arrêtait à deux décimales (`512.47`) et le champ de révision, à pas entier, refusait
  la valeur. Les montants acceptent maintenant un nombre quelconque de décimales et le
  champ « Kilomètres parcourus » un pas de 0,001.
- **Un libellé ne capte plus la ligne de taxe qui le cite.** `Primes` figure aussi dans
  « TPS perçue des primes », et `Lyft and 3rd party fees` dans « GST paid on Lyft and
  3rd party fees » : c'est la ligne de gains qui est retenue, pas la taxe calculée
  dessus. La variante anglaise sans esperluette est écartée exprès du code pour cela.

> Note sur le diagnostic : mesure faite sur ce format avec le code de la 2.2.0,
> **3 champs sur 6** étaient trouvés. La capture d'écran à l'origine du correctif en
> montrait **0**, ce qui signifie que le PDF n'avait pas livré sa couche texte sur
> l'appareil — le repli OCR ajouté en 2.2.1 couvre ce cas. Les deux correctifs étaient
> donc nécessaires : l'OCR pour obtenir le texte, les libellés pour en tirer des chiffres.

### Tests
- 14 assertions de plus (**T74 à T87**, socle à 96/96), construites sur la forme exacte
  du relevé — montants fictifs, aucune donnée personnelle dans le dépôt. Elles couvrent
  les deux pages séparément, le PDF bilingue entier, et les deux pièges de libellé.

---

## 2.2.1 — 20 octobre 2026

### Corrigé
- **Import des relevés PDF Uber et Lyft : rien n'était détecté.** Trois causes
  distinctes, toutes réparées :
  - **Aucun OCR.** `extractPDFText()` ne lisait que la couche texte du PDF. Un relevé
    scanné, ou exporté en image, n'en a pas : pdf.js rendait une chaîne vide et la
    feuille annonçait « aucune donnée détectée » comme si les libellés étaient en cause.
    Elle bascule maintenant sur Tesseract — déjà embarqué pour les reçus — dès que la
    couche texte fait moins de 80 caractères utiles, avec l'avancement affiché.
  - **Une seule occurrence du libellé examinée.** `findAmountNear()` s'arrêtait à la
    première, souvent une mention en prose dans un sommaire, et ramenait le chiffre
    d'une autre ligne. C'est désormais l'occurrence dont le montant est le **plus
    proche** qui gagne, et la fenêtre de recherche passe de 500 à 160 caractères
    (élargie seulement si rien n'est trouvé).
  - **Libellés trop peu nombreux.** Lyft change de vocabulaire selon la langue du
    compte et le type de relevé. Chaque champ accepte maintenant de 6 à 16 variantes,
    françaises et anglaises.
- **Les milles étaient enregistrés comme des kilomètres.** Un relevé anglophone compte
  en milles ; `Online miles 742` devenait 742 km au lieu de 1 194. La déduction
  kilométrique était sous-estimée de 38 % sur tout relevé en anglais. La conversion est
  faite quand le libellé retenu parle de milles (Uber et Lyft).
- Les montants négatifs entre parenthèses — `(612,30)`, la convention comptable — sont
  lus comme négatifs, et un pourcentage n'est plus pris pour un montant.

### Ajouté
- **« 🔍 Voir le texte lu dans le PDF »** dans la feuille d'import : montre ce que
  l'application a réellement lu, le mode (texte ou OCR) et le nombre de caractères, avec
  copie en un geste. Un import qui ne trouve rien laisse désormais une prise.
- Couverture de tests T56–T73 : relevé Lyft français, relevé Lyft anglais en milles,
  relevé Uber, PDF illisible, libellé présent deux fois, négatif comptable, pourcentage.

---

## 2.2.0 — 20 octobre 2026

Identité de l'application, et les besoins repérés pendant l'implémentation de la couche
fiscale (§ E de [FEATURES.md](FEATURES.md)).

### Ajouté
- **Nom et icône.** L'application s'appelle **Mon Plex** (auparavant « Revenus &
  Dépenses 2026 »). Icône « Le plex » : un plex blanc sur fond bleu marine, dont une
  fenêtre porte un `$` vert. Source de vérité en SVG dans `pwa_2026/icons/`, PNG rendus
  par Chrome sans retouche à la main (192, 512, maskable 512, `apple-touch-icon` 180).
- **Version visible** en bas de l'onglet Réglages (`APP_VERSION` + `APP_BUILD`).
- **E.6 — Simulateur de vente** : nouveau module `js/vente.js` (18ᵉ fichier de `js/`).
  Récupération de la DPA imposée à 100 %, gain en capital à 50 %, et le rappel que la
  DPA demandée ne réduit **pas** le PBR.
- **E.5 — Rappels datés des acomptes provisionnels** : `calculAcomptes()` et un bandeau
  d'accueil aux quatre échéances (15 mars, 15 juin, 15 septembre, 15 décembre).
- **E.9 — Portage iOS** : [PORTAGE_IOS.md](PORTAGE_IOS.md) — table module par module des
  fonctions pures à porter, quatre vagues, sept pièges JS → Swift, parité des tests.
- **Journal des versions** : ce fichier.

### Corrigé
- **E.1 — Export CSV incomplet** : les revenus Uber et les dépenses du véhicule
  manquaient au CSV remis au comptable ; les montants annuels étaient portés en janvier
  et faussaient les totaux mensuels du tableur. Les deux sont réparés (T28–T30b,
  M158–M166).
- **E.7 — Import bancaire** : dédoublonnage par `FITID` lorsque le relevé OFX/QFX en
  fournit un, via la séparation `clesTx()` (enregistrement) / `cleMatch()` (comparaison).
- **E.8 — Règles d'import** : test de non-régression sur l'aller-retour des règles dans
  l'enveloppe de sauvegarde v3.
- Le compteur de colonnes de la suite socle comptait mal les guillemets : c'était le
  **compteur** qui était faux, pas le CSV (voir § 2 de [TESTS.md](TESTS.md)).

### Écarté
- **E.4 — Transmission électronique des RL-31.** Exige le XSD officiel de Revenu Québec
  et un numéro de préparateur ; en inventer un produit un fichier qui *paraît* conforme
  et se fait rejeter. Sous 51 relevés, la transmission en ligne suffit. Conditions de
  déblocage consignées dans [FEATURES.md](FEATURES.md) § E.4.

---

## 2.1.0 — 20 octobre 2026

Outillage : la version et les tests cessent de dépendre d'une manipulation manuelle.

### Ajouté
- **E.2 — `scripts/version.sh`** : incrémente la version aux six endroits d'un coup
  (`APP_VERSION`, `APP_BUILD`, les 18 balises `?v=`, `CACHE` du service worker,
  `version` du manifeste). Compte les balises réellement présentes au lieu de les figer,
  et refuse d'agir si les six endroits divergent déjà. `--deploy` enchaîne le
  déploiement.
- **E.3 — `npm test`** : `tests/run-headless.js` exécute les deux suites sous jsdom,
  sans navigateur, plus les vérifications de version V1–V4. L'application elle-même
  reste sans dépendance ; `package.json` ne sert qu'aux tests.

---

## 2.0.0 — 20 octobre 2026 · commit `07a6406`

La couche fiscale : 14 fiches livrées en 17 modules, et la section recommandations.

### Ajouté
- Baux et relevés 31, report de la DPA, TPS/TVQ sur le revenu Uber, impôt estimé et
  acomptes, méthode 1 vs méthode 2 du véhicule, import bancaire avec règles, état par
  copropriétaire, OCR des reçus et audit des pièces manquantes, journal de kilométrage
  assisté, clôture d'année verrouillée, dossier comptable en un ZIP, simulateur d'achat,
  tableau de bord pluriannuel, ventilation automatique d'une dépense.
- Section **recommandations** adossée aux biens réels.
- [FISCALITE.md](FISCALITE.md) — tous les paramètres 2026 avec leur source officielle ;
  [INCORPORATION.md](INCORPORATION.md) — verdict motivé : rester au personnel, en
  indivision ; [DEPLOIEMENT_IOS.md](DEPLOIEMENT_IOS.md) — mise en ligne sur l'App Store.

### Rang majeur
L'enveloppe de sauvegarde passe en **version 3** (`backupPayload()`), avec les clés des
nouveaux modules. Les clés d'état sont créées paresseusement : une sauvegarde v2 se
relit, mais une v3 n'est pas lisible par une version antérieure.

---

## 1.2.0 — 19 octobre 2026 · commits `134db5c`, `ffcfb0d`

### Corrigé
Cinq défauts de calcul et de sauvegarde (PWA et iOS), avec leurs assertions de test.

### Ajouté
Première suite de tests documentée, [ARCHITECTURE.md](ARCHITECTURE.md),
[TESTS.md](TESTS.md), [AMELIORATIONS.md](AMELIORATIONS.md), [FEATURES.md](FEATURES.md).

---

## 1.1.0 — 13 juillet 2026 · commit `18a0053`

### Ajouté
- Rapport PDF comptable complet dans la PWA — 9 pages, à parité avec iOS.
- Import des sauvegardes iOS.
- Cache du service worker porté à `depenses-v2` (`9eb5d19`).

---

## 1.0.0 — 13 juillet 2026 · commits `cbb35df` → `4323640`

### Ajouté
- Assistant de configuration par modules, thème clair/sombre (PWA et iOS).
- Immeubles dynamiques des deux côtés (`RentalProperty` sur iOS), reconstruction de
  l'état après import.
- Pourcentage de propriété modifiable, préservé à l'import (`4323640`).

`cbb35df` est le point de rollback de référence (voir § 6 de
[ARCHITECTURE.md](ARCHITECTURE.md)).
