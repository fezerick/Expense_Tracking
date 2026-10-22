# Suggestions de nouvelles fonctionnalités

Distinct de [AMELIORATIONS.md](AMELIORATIONS.md), qui liste les correctifs et la dette
technique. Ici : ce que les deux applications ne font pas encore et qui aurait de la
valeur, classé par rendement — d'abord ce qui fait gagner de l'argent ou évite une
pénalité, ensuite ce qui supprime de la saisie, enfin ce qui protège le dossier.

Chaque fiche indique où la fonctionnalité s'accrocherait dans le code existant et une
estimation d'effort (S = quelques heures, M = 1-3 jours, L = plus).

---

## État au 20 octobre 2026

**16 des 22 fiches sont livrées côté PWA**, dans la couche modulaire `pwa_2026/js/`
(§ 2.8 de [ARCHITECTURE.md](ARCHITECTURE.md)) et le 6ᵉ onglet 📑 Fiscal. Une
seizième fonctionnalité, non prévue par ce document, s'est ajoutée : la section
**Recommandations** (pistes de rentabilité classées par gain estimé).

La quinzième est **D.4**, livrée le 20 octobre 2026 dans la version 2.5.0 et livrée
au-delà de son énoncé : la fiche demandait d'avertir avant d'écraser, l'application
fusionne désormais champ par champ et n'avertit que des vrais désaccords. La seizième est
**C.3**, livrée le même jour dans la version 2.6.0 : la fusion champ par champ savait déjà
nommer chaque cellule touchée, il restait à en garder la trace lisible.

| Fiche | État | Où elle a atterri |
|---|---|---|
| A.1 Baux et Relevé 31 | ✅ livré | `js/baux.js` — onglet **Fiscal › Baux**, et non un onglet dans Logements comme proposé ci-dessous : les baux servent surtout au RL-31 et au report d'année, deux sujets fiscaux |
| A.2 Report de la DPA (FNACC) | ✅ livré | `js/dpa.js` — Fiscal › DPA |
| A.3 TPS/TVQ sur le revenu Uber | ✅ livré | `js/tps-tvq.js` — Fiscal › TPS/TVQ |
| A.4 Impôt estimé et acomptes | ✅ livré | `js/impot.js` — Fiscal › Impôt + bandeau d'accueil |
| A.5 Méthode 1 vs Méthode 2 | ✅ livré | `js/vehicule-methodes.js` — dans l'onglet Rideshare |
| A.6 État par copropriétaire | ✅ livré | `js/coproprietaires.js` — dans le Sommaire |
| B.1 Import bancaire avec règles | ✅ livré | `js/import-bancaire.js` — Fiscal › Import |
| B.2 OCR des reçus + pièces manquantes | ✅ livré | `js/recus.js` — Fiscal › Reçus (Tesseract.js chargé à la demande, tout reste dans le navigateur) |
| B.3 Journal de kilométrage assisté | ✅ livré (PWA) | `js/kilometrage.js` — odomètre + rappel d'accueil. La version iOS (détection automatique) reste à faire |
| B.4 Ventilation automatique | ✅ livré | `js/ventilation.js` |
| C.1 Clôture d'année verrouillée | ✅ livré | `js/cloture.js` — Fiscal › Clôture, avec empreinte des chiffres déclarés |
| C.2 Dossier comptable en un ZIP | ✅ livré | `js/dossier.js` |
| D.1 Tableau de bord pluriannuel | ✅ livré | `js/tableau-bord.js` — Fiscal › Évolution |
| D.3 Simulateur d'achat | ✅ livré | `js/simulateur.js` — Fiscal › Simulateur |
| — Recommandations | ✅ livré (hors liste) | `js/recommandations.js` — Fiscal › Recommandations |
| C.3 Historique des modifications | ✅ livré | `js/journal.js` — Fiscal › Clôture, sous l'état de clôture |
| C.4 Verrou biométrique | ✅ livré | `js/verrou.js` — Réglages › Code d'accès ; iOS : `Services/BiometricLock.swift` + `Views/LockView.swift` (2.10.0) |
| D.2 Widgets et raccourcis iOS | ⏳ à faire | iOS |
| D.4 Synchronisation : avertir au lieu d'écraser | ✅ livré *(dépassé)* | `js/sync.js` — 2.5.0 : au lieu d'avertir, l'app **fusionne champ par champ**, et n'avertit que des vrais désaccords |

Les fiches livrées sont conservées telles quelles ci-dessous : elles documentent
l'intention et les choix d'accroche. Là où l'implémentation a divergé de la proposition,
une note **Livré** le dit. Les fonctionnalités repérées *pendant* cette
implémentation sont en § E.

---

## A. Valeur fiscale directe

### A.1 Relevé 31 pour chaque locataire — **L'obligation la plus coûteuse à oublier** · M

Au Québec, un propriétaire doit remettre un **RL-31 à chaque locataire avant le
28 février** ; c'est ce document qui permet au locataire de demander le crédit d'impôt de
solidarité. La pénalité est de **25 $ par jour de retard, minimum 100 $, maximum
2 500 $** — et non 25 $ par relevé comme l'indiquait la première version de cette fiche
(correction du 20 octobre 2026, source citée dans [FISCALITE.md](FISCALITE.md)).

L'app connaît déjà les logements (`revenus: ['Logement 1', 'Logement 2']`) mais pas les
personnes. Il manque un modèle « bail » :

```js
bail: { propId, unite: 'Logement 1', locataires: [{ nom, prenom }],
        loyerMensuel, dateDebut, dateFin, nbChambres, depotGaranti }
```

Ce qui s'en déduit gratuitement :
- génération des RL-31 (PDF, un par logement) et du sommaire à transmettre ;
- **pré-remplissage des 12 mois de revenus** à partir du loyer au bail, au lieu de 12
  saisies par logement — c'est le gros de la saisie annuelle qui disparaît ;
- suivi des **retards de paiement** : un mois au montant inférieur au bail devient un
  écart visible, pas un trou silencieux ;
- indexation annuelle : à la création d'une nouvelle année (`createNewYear`), proposer
  les loyers reconduits.

Accroche : nouvel objet dans `setup.propsList[].unites[]` côté PWA, nouveau `@Model Lease`
côté iOS, et un onglet « Baux » dans `PropertiesView`.

> **Livré** dans `js/baux.js`, sous **Fiscal › Baux** plutôt que dans Logements : les
> baux alimentent le RL-31 et le report d'année, qui sont des sujets fiscaux. Les baux
> sont stockés dans `state.baux` (et non dans `setup`), car un bail appartient à une
> année déclarée. `reporterBaux()` les reconduit avec indexation à la création d'une
> nouvelle année ; `bauxRL31()` retient le bail en vigueur au 31 décembre.

### A.2 Report de la DPA d'une année sur l'autre (FNACC) — M

Le rapport PDF contient déjà une annexe DPA, mais chaque année vit dans une clé
`depenses_<année>` isolée : la **fraction non amortie du coût en capital** doit être
retapée à la main, et une erreur se propage sur toutes les années suivantes.

À ajouter : un registre de biens amortissables persistant hors année —

```js
biens: [{ id, propId, description, categorie: 1 | 8 | 10 | '10.1',
           dateAcquisition, cout, fnaccOuverture, dpaReclamee: { 2025: …, 2026: … } }]
```

avec la **règle du demi-taux** l'année d'acquisition, le calcul automatique de la DPA
maximale par catégorie, et le report de la FNACC de clôture en ouverture de l'année
suivante. Donne aussi la bonne réponse à la question « ai-je intérêt à réclamer la DPA
cette année ? » (la réclamer crée un gain récupérable à la vente — un arbitrage que
l'app peut montrer chiffré).

### A.3 Déclaration TPS/TVQ pour le revenu Uber — M

Un chauffeur Uber est inscrit aux fichiers de taxes. Les clés `gst*`/`qst*` existent déjà
dans `UBER_GROUPS`, mais rien ne produit la déclaration. Il manque :

- les **CTI/RTI** sur les dépenses véhicule et les dépenses d'immeuble, **prorata de
  l'usage commercial** (le prorata km est déjà calculé pour la déduction) ;
- l'écran de rapprochement par trimestre ou par année, aux lignes du formulaire FPZ-500 ;
- la distinction nette : le revenu locatif résidentiel est **exonéré**, l'Uber est
  **taxable** — c'est exactement le genre de mélange que l'app est bien placée pour
  empêcher.

### A.4 Impôt estimé et acomptes provisionnels — M

Aujourd'hui l'app s'arrête au bénéfice. Ce qui manque est la seule question qui compte en
cours d'année : **combien mettre de côté**. Avec les paliers fédéraux et québécois, le
RRQ/RPC sur le revenu de travail indépendant et la cotisation au FSS, on peut afficher en
continu :

- l'impôt estimé à ce jour et le taux marginal atteint ;
- les quatre **acomptes provisionnels** (15 mars / juin / septembre / décembre) avec
  rappel, puisque Revenu Québec et l'ARC les exigent dès 1 800 $ d'impôt net ;
- un bandeau « provision à constituer » sur l'accueil (`renderHome`).

Les taux doivent être des **données versionnées par année** (comme `mileageRate`), pas des
constantes dans le code.

### A.5 Méthode 1 contre Méthode 2 du véhicule, comparées — S

L'app détient déjà les deux jeux de données : frais réels + km (Méthode 1) et
l'indemnité par kilomètre (Méthode 2). Elle n'en calcule qu'un. Afficher les deux côte à
côte avec la différence en dollars et une recommandation (« Méthode 1 : +412 $ cette
année ») est presque gratuit — `refreshVehicleCalcs` a déjà tout en main.

> **Livré** dans `js/vehicule-methodes.js`. Correction de fond au passage : le taux n'est
> pas un 0,72 $/km uniforme comme l'écrivait cette fiche, mais **par paliers** —
> 0,73 $/km pour les 5 000 premiers kilomètres d'affaires, 0,67 $/km ensuite (taux 2026,
> voir [FISCALITE.md](FISCALITE.md)). `kmIndemnite()` applique les paliers ; M34–M38 le
> verrouillent.

### A.6 État par copropriétaire — S

`pct` et `coOwners` sont saisis et, depuis le correctif, voyagent bien entre les deux
apps — mais ne servent qu'aux lignes 9369/9946 du PDF. Produire **un état par
copropriétaire** (sa part des revenus, des dépenses, du bénéfice, de la DPA) donne à
chacun de quoi remplir sa propre déclaration, sans refaire le calcul à la main.

---

## B. Supprimer la saisie manuelle

### B.1 Import des relevés bancaires et de carte de crédit — L

`PDFStatementParser` et `parseUberPDF` montrent que l'infrastructure d'import existe. En
l'étendant aux relevés bancaires (CSV, OFX/QFX, et PDF en dernier recours) avec des
**règles de catégorisation apprises** (« HYDRO-QUEBEC → Électricité / 1090 »), la saisie
annuelle passe de centaines de cellules à une revue de transactions. C'est le changement
qui ferait le plus de différence à l'usage.

Écran attendu : une file d'attente de transactions à classer, avec « toujours classer
ainsi » et un bouton « ignorer » (dépenses personnelles).

### B.2 Reçus : lecture automatique et détection des pièces manquantes — M

Les reçus sont déjà stockés par cellule (`receipts['p1090_ded_Électricité_9']`). Deux
ajouts à fort rendement :

- **OCR** du montant et de la date à la photo — `VNRecognizeTextRequest` côté iOS (natif,
  hors ligne), `Tesseract.js` ou un appel serveur côté PWA — pour pré-remplir la cellule
  au lieu de la taper ;
- **audit des pièces justificatives** : lister les cellules qui portent un montant sans
  reçu attaché, triées par montant décroissant. C'est précisément la liste que réclame une
  vérification, et elle est produite en une boucle sur `state`.

### B.3 Journal de kilométrage assisté — M (iOS)

`DistanceService` calcule déjà domicile → immeuble. Manque le **déclenchement** :

- détection de trajet en arrière-plan (Core Location, `significant-change`) avec
  proposition « 42 km vers le Triplex B, hier 14 h — classer ? » ;
- **App Intent / Siri** : « note un trajet vers le triplex » ;
- rappel hebdomadaire si aucun trajet n'a été noté.

L'ARC exige un registre détaillé ; c'est la pièce la plus souvent reconstituée de mémoire,
donc la plus fragile en cas de vérification.

### B.4 Ventilation automatique d'une dépense — S

Une assurance qui couvre deux immeubles, un forfait téléphone à 30 % locatif et 70 % Uber :
aujourd'hui l'utilisateur fait la division à la calculatrice. Une dépense avec une clé de
répartition (`{ p1090: 60, p470: 40 }`) appliquée à la saisie règle le problème et rend la
ventilation **traçable** dans le PDF.

---

## C. Confiance dans le dossier

### C.1 Clôture d'année verrouillée — S

Une fois la déclaration produite, l'année devrait pouvoir être **verrouillée en lecture
seule**, avec la date de clôture et une empreinte des totaux. Aujourd'hui rien n'empêche
une modification après coup : les chiffres remis au comptable peuvent dériver
silencieusement et ne correspondent plus à ce qui a été déclaré. Un drapeau
`setup.closedYears` et un garde-fou dans `setMonthlyVal` suffisent.

### C.2 Dossier comptable en un fichier — S

Au lieu de remettre un PDF, un CSV et des photos séparément : un **ZIP** contenant le
rapport PDF, le CSV, les reçus nommés d'après leur cellule
(`1090_Électricité_09_142.30.jpg`) et un `index.csv` de correspondance. Côté PWA avec
`JSZip`, côté iOS avec `FileManager` + partage natif.

### C.3 Historique des modifications — M · ✅ livré

Un journal append-only (`qui, quand, quelle cellule, ancienne → nouvelle valeur`) répond à
la question « pourquoi le total a-t-il changé depuis la version que j'ai envoyée ? ».

**Livré en 2.6.0** — `js/journal.js`, sous l'état de clôture dans Fiscal › Clôture.
`syncDater()` et `syncFusionner()` rendaient déjà la liste des cellules touchées ; ils
rendent maintenant aussi l'ancienne valeur, et chaque écriture — saisie locale comme
fusion entrante — y laisse une ligne en français : *« Duplex A › Déductibles ›
Électricité › mars : 120.00 → 150.00 »*, avec l'heure, l'appareil d'origine et l'icône
qui distingue une saisie 📝 d'une arrivée 📥. Trois écarts avec l'énoncé, détaillés en
§ 2.10 de [ARCHITECTURE.md](ARCHITECTURE.md) :

- **le journal n'est pas synchronisé** : un tableau append-only sans identifiants perdrait
  des lignes à la fusion, et les identifiants qu'il faudrait pour l'éviter gonfleraient le
  document Firestore d'un mégaoctet. Chaque appareil garde donc son journal — et comme les
  changements reçus y sont inscrits à l'arrivée, le journal local explique quand même tout
  ce qui est arrivé aux chiffres locaux ;
- **les corrections successives d'une même cellule dans la minute sont regroupées** en une
  ligne, et une valeur revenue à son point de départ n'en laisse aucune : autrement, taper
  un montant au clavier en écrirait une par frappe ;
- **une fusion massive** (une première synchronisation, un import) est résumée en une
  ligne — *« 312 valeurs reçues de iPhone »* — au lieu de noyer le reste.

L'écran se consulte par jour, se filtre par origine et par texte, s'exporte en CSV, et
l'avertissement de dérive de la clôture y renvoie directement : *« Voir les 7
modification(s) inscrites depuis la clôture »*.

### C.4 Verrou biométrique — S — ✅ livré (2.10.0)

Face ID / Touch ID côté iOS, code d'accès côté PWA. Les deux apps contiennent revenus,
adresses, noms de copropriétaires et photos de factures, actuellement accessibles à
quiconque ouvre l'appareil déverrouillé.

**Livré** le 22 octobre 2026 dans la version 2.10.0, sur les deux plateformes.

- **iOS** — `Services/BiometricLock.swift` et `Views/LockView.swift`. La politique demandée
  est `.deviceOwnerAuthentication` et non la variante biométrique seule : elle retombe sur
  le code de l'appareil quand Face ID échoue, là où la seconde enfermerait dehors. Le verrou
  se pose dès que l'app devient *inactive*, pas seulement en arrière-plan, pour que la photo
  du sélecteur d'applications montre l'écran de verrouillage et non les montants. L'écran
  remplace la hiérarchie de vues au lieu de la recouvrir, sans quoi une feuille modale déjà
  ouverte (réglages, arbitrage DPA) resterait visible au-dessus.
- **PWA** — `js/verrou.js`, code de 4 à 8 chiffres, empreinte **PBKDF2-SHA-256 à 310 000
  itérations** avec sel aléatoire de 16 octets, comparaison à temps constant, échecs freinés
  par paliers (5 s, 15 s, 1 min, 5 min), et une sortie de secours qui ne contourne rien :
  « j'ai oublié mon code » ré-authentifie le compte Google enregistré à l'activation.
- **Le secret ne quitte pas l'appareil** : retiré de l'enveloppe de synchronisation comme le
  thème, et retiré en plus des sauvegardes de fichier — une sauvegarde se transmet.

**Ce que la fiche ne promet pas, et qu'il faut dire** : un verrou posé côté client est un
écran de confidentialité, pas un chiffrement. Les données restent en clair dans
`localStorage`, le sel et l'empreinte sont rangés juste à côté, et un code à quatre
chiffres tombe hors ligne en une seconde pour qui sait ouvrir la console du navigateur.
Chiffrer pour de vrai imposerait de faire connaître la clé à la synchronisation, au service
worker, aux exports et à la restauration — et un code oublié effacerait définitivement le
dossier fiscal. Le verrou protège contre le téléphone posé sur la table et l'onglet laissé
ouvert sur le portable, ce qui est précisément le risque que la fiche nommait. Il ne protège
pas contre un appareil volé et analysé ; sur iOS, c'est le chiffrement de l'appareil qui
s'en charge, comme avant.

---

## D. Confort et plateforme

### D.1 Tableau de bord pluriannuel — S

`getAvailableYears()` existe déjà. Un écran d'évolution (revenus, dépenses, bénéfice par
immeuble sur 3-5 ans, en graphique) met en évidence les anomalies — une dépense d'entretien
qui double, un logement vacant — et c'est le premier argument à présenter en cas de
question du fisc.

### D.2 Widgets et raccourcis iOS — S

Widget d'écran d'accueil « bénéfice net à ce jour », widget « ajouter un trajet », et
quelques App Intents. Peu de code, usage quotidien.

### D.3 Simulateur — M

« Si j'achète un quatrième immeuble à 450 000 $ » ou « si je roule 5 000 km de plus en
Uber » : projeter l'impôt et le flux de trésorerie. L'app détient déjà tout le modèle de
calcul ; il ne manque qu'un jeu d'hypothèses parallèle à l'année réelle.

### D.4 Synchronisation : avertir au lieu d'écraser — M

`syncPush`/`syncPull` fonctionnent en dernier-écrivain-gagne. Deux appareils modifiant le
même mois perdent une des deux saisies sans message. Un horodatage par cellule, ou au
minimum une détection de divergence avec choix explicite, éviterait une perte silencieuse.

**Livré en 2.5.0, et au-delà de l'énoncé.** La fiche proposait d'*avertir* ; l'application
**fusionne**. L'horodatage par cellule existe (`depenses_meta_<année>`), la fusion garde la
valeur la plus récente de chaque côté, et une valeur qu'un seul appareil possède est
conservée. Avertir reste le dernier recours : quand les deux appareils ont écrit la même
cellule dans la même seconde, la pastille affiche « ⚠️ N désaccord(s) ». Deux appareils
utilisés le même soir ne se recouvrent plus — ils s'additionnent. Voir § 2.4 de
[ARCHITECTURE.md](ARCHITECTURE.md) pour le mécanisme, et § 2b de [TESTS.md](TESTS.md) pour
les trois pertes de données que cette implémentation a elle-même produites avant d'être
juste.

---

## E. Repérées pendant l'implémentation des 14 fiches (20 octobre 2026)

Ces besoins ne sont apparus qu'en écrivant le code et les tests. **Huit des neuf sont
livrés** dans la version 2.2.0 du 20 octobre 2026 ; E.4 est écarté, avec sa raison.

| Fiche | État | Livré sous la forme de |
|---|---|---|
| E.1 Export CSV incomplet | ✅ livré | `exportCSV()` dans `index.html` — sections Uber et véhicule ajoutées |
| E.2 `?v=` automatisé | ✅ livré | `scripts/version.sh` |
| E.3 Tests sans navigateur | ✅ livré | `tests/run-headless.js`, `npm test` |
| E.4 Transmission XML des RL-31 | ⏸️ écarté | voir ci-dessous |
| E.5 Rappels datés des acomptes | ✅ livré | `calculAcomptes()` + bandeau d'accueil |
| E.6 Simulateur de vente | ✅ livré | `js/vente.js` (16ᵉ module) |
| E.7 Import OFX/QFX | ✅ livré *(énoncé corrigé)* | dédoublonnage par `FITID` |
| E.8 Règles d'import sauvegardées | ✅ livré *(énoncé corrigé)* | test de non-régression |
| E.9 Parité iOS | ✅ livré *(en document)* | [PORTAGE_IOS.md](PORTAGE_IOS.md) |

### E.1 L'export CSV ignore Uber et les dépenses véhicule — S · ✅ livré

Découvert en corrigeant BUG-2. L'export mensuel couvrait les immeubles et Lyft, mais ni
les revenus Uber ni les dépenses du véhicule : le CSV remis au comptable sous-estimait à
la fois les revenus et les déductions. Le PDF, lui, était complet.

**Livré.** `exportCSV()` est réécrit autour de deux fabriques de lignes — `ligneMois()`
pour un montant d'un mois donné, `ligneAnnuelle()` pour un montant annuel — plus un
échappement des guillemets. Les sections Uber (par groupe, via `uberNetIncome()`) et
véhicule (par catégorie, plus le total engagé et la part d'affaires) sont ajoutées. Les
montants annuels laissent les douze cellules de mois **vides** au lieu de tout porter en
janvier, ce qui faussait les totaux mensuels du tableur. Les déplacements sont
réétiquetés « détail, déjà inclus ci-dessus » et tombent dans le mois de leur date.
Couvert par T28–T30b (socle) et M158–M166 (modules).

### E.2 Automatiser le `?v=` des balises de module — S · ✅ livré

Chaque déploiement exigeait d'incrémenter à la main `CACHE` dans `sw.js` **et** le `?v=`
de chaque balise `<script>` : la cause la plus fréquente de « le correctif ne prend pas ».

**Livré.** `scripts/version.sh` est le seul outil autorisé à écrire la version, qui vit
à six endroits (`APP_VERSION`, `APP_BUILD`, les 18 balises `?v=`, `CACHE` dans `sw.js`,
`version` dans `manifest.json` et `package.json`). Il refuse d'agir si les six ne
concordent pas déjà, ne code en dur aucun nombre de modules, et accepte `patch` / `minor` / `major` /
`set X.Y.Z`, avec `--deploy` pour enchaîner sur Firebase. La version s'affiche en bas de
l'onglet Réglages.

### E.3 Les deux suites ne tournent pas sans navigateur — M · ✅ livré

Tout vit dans la portée globale de la page : les suites devaient être `eval()`ées *dans*
la page, donc aucune exécution en intégration continue.

**Livré.** `tests/run-headless.js` monte `index.html` dans jsdom, retire les balises
Firebase, pose les prothèses minimales (`matchMedia`, `URL.createObjectURL`,
`canvas.getContext`, un `firebase` factice), **inline chaque module** en
`data-module-src` — ce qui préserve l'ordre d'exécution et ne dépend d'aucune API jsdom
instable — puis évalue chaque suite. Il ajoute trois vérifications de fichiers (V1 le
cache du *service worker*, V2 le manifeste, V3 les balises `?v=`). `npm test` exécute le
tout ; le code de sortie vaut 1 à la première assertion rouge. Le stockage local de
jsdom est en mémoire : aucun risque pour les données réelles.

### E.4 Transmission électronique des RL-31 — M · ⏸️ écarté le 20 octobre 2026

`js/baux.js` produit les feuillets PDF pour les locataires et le sommaire CSV. Il
manquerait le **fichier XML de transmission** à Revenu Québec.

**Écarté, et pourquoi.** Produire ce fichier exige deux choses que le code ne peut pas
deviner : le **schéma XSD officiel** de l'année visée, et un **numéro d'identification de
préparateur** délivré par Revenu Québec. Inventer l'un ou l'autre produirait un fichier
qui *paraît* conforme et serait rejeté — le pire des résultats. Par ailleurs, sous le
seuil de 51 relevés, la saisie en ligne par Mon dossier reste ouverte et suffit au
portefeuille actuel.

**Pour le reprendre :** fournir le XSD de l'année et le numéro de préparateur, puis
valider la sortie contre le schéma avant toute transmission. Rien d'autre ne bloque : le
modèle de données des baux contient déjà tous les champs demandés.

### E.5 Rappels datés des acomptes provisionnels — S · ✅ livré

`js/impot.js` calculait les quatre versements sans rappeler les échéances (15 mars,
15 juin, 15 septembre, 15 décembre). Un intérêt sur acompte insuffisant n'est pas
déductible.

**Livré.** `calculAcomptes()` rend désormais, en plus des montants : `prochain`,
`retards`, `manqueTotal`, `joursAvantProchain`, et pour chaque versement `jours`,
`manqueFed`, `manqueQc`, `enRetard`. Un versement dû *le jour même* n'est pas compté en
retard. Le bandeau d'accueil passe au rouge avec « N acompte(s) en retard · il manque
X $ », ou annonce le prochain « dans N jours ». Couvert par M167–M177.

### E.6 Simulateur de vente (récupération de DPA et gain en capital) — M · ✅ livré

Le simulateur couvrait l'achat ; la question symétrique — que coûte la vente ? —
n'était pas outillée.

**Livré.** `js/vente.js` (16ᵉ module) s'affiche sous le simulateur d'achat, dans
Fiscal › Simulateur. Il chiffre le prix net de commission et de frais, le gain en
capital imposable à **50 %** (la hausse à 66,7 % ayant été annulée le 21 mars 2025,
voir `fiscal-data.js`), la **récupération de DPA imposée à 100 %**, la perte finale le
cas échéant (art. 13(21.1)), et l'impôt combiné qui en découle. Deux règles fiscales y
sont explicites parce qu'un portage « logique » les casserait : la DPA **ne réduit pas**
le PBR d'un immeuble, et la catégorie 10.1 est exclue de la récupération. Couvert par
M178–M190.

### E.7 Import bancaire : OFX/QFX au-delà du CSV — S · ✅ livré, énoncé corrigé

**L'énoncé d'origine était faux**, et il vaut mieux le dire que revendiquer un travail
qui n'a pas eu lieu : `parseOFX()` existait déjà et l'import acceptait déjà `.ofx` et
`.qfx`. Ce qui manquait réellement, c'est l'usage du `FITID` — l'identifiant de
transaction de la banque — comme anti-doublon.

**Livré.** `parseOFX()` conserve le `FITID` de chaque transaction, et l'anti-doublon
distingue maintenant deux notions qui étaient confondues : `clesTx()` donne les clés sous
lesquelles on **enregistre** une transaction (le `FITID` *et* l'empreinte heuristique),
`cleMatch()` la clé unique sous laquelle on **compare**. Sans cette distinction, deux
transactions jumelles du même jour et du même montant partageaient une empreinte
identique et la seconde était rejetée à tort, malgré des `FITID` différents. Couvert par
M191–M197b, dont une protection contre le mélange des formats.

### E.8 Les règles d'import ne sont pas sauvegardées — S · ✅ livré, énoncé corrigé

**Énoncé faux là aussi :** `setup.reglesImport` voyageait déjà dans l'export JSON, qui
emporte `setup` entier depuis l'enveloppe v3. Le vrai risque n'était pas l'absence de la
fonction mais l'absence de **test** : rien n'empêchait une refonte de l'export de la
faire disparaître sans bruit.

**Livré.** Un test d'aller-retour complet (`backupPayload()` → `restoreFromBackup()`)
vérifie que les règles d'import survivent, avec leur libellé et leur cible. C'est la
fonction qui compte, pas la ligne de code.

### E.9 Parité iOS de la couche fiscale — L · ✅ livré sous forme de document

Les 16 modules n'existent que dans la PWA. C'est un choix assumé — la PWA est la
priorité tant que le compte Apple Developer n'est pas ouvert — mais l'écart se creuse à
chaque module.

**Livré.** [PORTAGE_IOS.md](PORTAGE_IOS.md) fixe le contrat : pour chacun des 16
modules, sa clé d'état, les fonctions de **calcul pur** à reproduire au cent près, ce
qui relève du rendu et reste libre, la destination Swift suggérée et la vague de
portage. Le document rappelle que le pont existe déjà (`BackupService.restorePWA` lit
l'enveloppe v3), liste les sept pièges de traduction JavaScript → Swift, et explique
comment rejouer les assertions sous les mêmes identifiants en XCTest. Le code iOS, lui,
reste à écrire.

---

## Si je devais n'en retenir que trois

*Les 15 fiches d'octobre 2026 et huit des neuf fiches du § E sont livrées. Par rendement,
ce qui reste :*

1. **Le raccordement Firestore de l'iPhone.** La vague 1 du portage est close (2.7.0 à
   2.9.0) : `fiscal-data`, `impot`, `dpa`, `sync.js` et `journal.js` existent en Swift et
   rendent les mêmes écritures que la PWA, vérifié par 94 assertions de parité. Ce qui
   manque est le branchement : un `FirestoreSync` qui lit le document distant, appelle
   `fusionner`, écrit le résultat et inscrit les entrées de journal. Tant qu'il n'existe
   pas, l'iPhone reste le seul appareil qui ne participe pas à la fusion — et il ne doit
   pas écrire dans `users/<uid>/years/<année>` avant.
2. ~~**C.4 Verrou biométrique**~~ — livré en 2.10.0 sur les deux plateformes.
3. **D.2 Widgets et raccourcis iOS** — peu de code pour un usage quotidien, et son
   préalable est levé : la vague 1 est close, le calcul fiscal existe côté Swift, donc un
   widget « bénéfice net à ce jour » n'attend plus rien.
