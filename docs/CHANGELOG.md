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
