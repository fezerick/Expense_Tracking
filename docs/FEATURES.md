# Suggestions de nouvelles fonctionnalités

Distinct de [AMELIORATIONS.md](AMELIORATIONS.md), qui liste les correctifs et la dette
technique. Ici : ce que les deux applications ne font pas encore et qui aurait de la
valeur, classé par rendement — d'abord ce qui fait gagner de l'argent ou évite une
pénalité, ensuite ce qui supprime de la saisie, enfin ce qui protège le dossier.

Chaque fiche indique où la fonctionnalité s'accrocherait dans le code existant et une
estimation d'effort (S = quelques heures, M = 1-3 jours, L = plus).

---

## État au 20 octobre 2026

**14 des 22 fiches sont livrées côté PWA**, dans la couche modulaire `pwa_2026/js/`
(§ 2.8 de [ARCHITECTURE.md](ARCHITECTURE.md)) et le 6ᵉ onglet 📑 Fiscal. Une
quinzième fonctionnalité, non prévue par ce document, s'est ajoutée : la section
**Recommandations** (pistes de rentabilité classées par gain estimé).

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
| C.3 Historique des modifications | ⏳ à faire | partiellement couvert : la clôture conserve `closedHistory` |
| C.4 Verrou biométrique | ⏳ à faire | |
| D.2 Widgets et raccourcis iOS | ⏳ à faire | iOS |
| D.4 Synchronisation : avertir au lieu d'écraser | ⏳ à faire | le risque reste entier |

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

### C.3 Historique des modifications — M

Un journal append-only (`qui, quand, quelle cellule, ancienne → nouvelle valeur`) répond à
la question « pourquoi le total a-t-il changé depuis la version que j'ai envoyée ? ». Utile
aussi pour diagnostiquer une synchronisation Firestore qui écrase (le `syncPush` actuel est
en dernier-écrivain-gagne).

### C.4 Verrou biométrique — S

Face ID / Touch ID côté iOS, code d'accès côté PWA. Les deux apps contiennent revenus,
adresses, noms de copropriétaires et photos de factures, actuellement accessibles à
quiconque ouvre l'appareil déverrouillé.

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

---

## E. Repérées pendant l'implémentation des 14 fiches (20 octobre 2026)

Ces besoins ne sont apparus qu'en écrivant le code et les tests. Rien ici n'est bloquant.

### E.1 L'export CSV ignore Uber et les dépenses véhicule — S

Découvert en corrigeant BUG-2. L'export mensuel couvre les immeubles et Lyft, mais pas
les revenus Uber ni les dépenses du véhicule : un CSV remis au comptable sous-estime
donc à la fois les revenus et les déductions. Le PDF, lui, est complet. Accroche :
`exportCSV()` dans `index.html` — deux sections à ajouter sur le modèle de la boucle
Lyft, et deux assertions de plus dans `tests/pwa_suite.js`.

### E.2 Automatiser le `?v=` des 17 balises de module — S

Chaque déploiement exige d'incrémenter à la main `CACHE` dans `sw.js` **et** le `?v=` de
17 balises `<script>`. C'est la cause la plus fréquente de « le correctif ne prend pas »
(constaté plusieurs fois pendant cette implémentation). Un script de 20 lignes —
`scripts/bump.sh` — qui lit le numéro, l'incrémente partout et l'écrit dans `sw.js`
supprimerait une classe entière d'erreurs. Pas un *build* : juste un `sed` discipliné.

### E.3 Les deux suites ne tournent pas sans navigateur — M

Tout vit dans la portée globale de la page, donc les tests doivent être `eval()`és
*dans* la page. Conséquence : aucune exécution en intégration continue, et un correctif
peut partir en production sans que les 222 assertions aient tourné. Piste réaliste :
un harnais jsdom qui charge `index.html`, laisse les modules s'enregistrer et exécute
les deux suites. Les modules étant des scripts classiques à portée partagée, c'est
faisable sans les réécrire.

### E.4 Transmission électronique des RL-31 — M

`js/baux.js` produit les feuillets PDF pour les locataires et le sommaire CSV. Il manque
le **fichier XML de transmission** à Revenu Québec, obligatoire au-delà de 50 relevés et
de toute façon plus sûr que la saisie en ligne. Le schéma est publié ; le modèle de
données des baux contient déjà tout ce qu'il demande.

### E.5 Rappels datés des acomptes provisionnels — S

`js/impot.js` calcule les quatre versements mais ne rappelle pas les échéances
(15 mars, 15 juin, 15 septembre, 15 décembre). Un intérêt sur acompte insuffisant n'est
pas déductible. Accroche : le bandeau d'accueil existe déjà
(`renderBandeauProvision()`) — il suffit d'y comparer la date du jour à l'échéance
suivante. Côté iOS, une notification locale.

### E.6 Simulateur de **vente** (récupération de DPA et gain en capital) — M

Le simulateur couvre l'achat. La question symétrique n'est pas outillée : que coûte la
vente ? Il faut la récupération de l'amortissement réclamé (pleinement imposable, et
`state.biens` en tient le registre année par année), le gain en capital imposable à
50 %, et l'arbitrage que la fiche A.2 évoquait sans le chiffrer — réclamer la DPA cette
année contre l'impôt de récupération à la sortie.

### E.7 Import bancaire : OFX/QFX au-delà du CSV — S

`parseDateBancaire()` lit déjà le format de date OFX (`AAAAMMJJ`), mais l'import n'avale
que du CSV. Les institutions québécoises offrent toutes le QFX, qui porte un identifiant
de transaction — meilleur anti-doublon que l'empreinte calculée actuellement.

### E.8 Les règles d'import ne sont pas sauvegardées — S

`setup.reglesImport` vit dans `depenses_setup`, volontairement hors synchronisation
(c'est le bon choix pour la configuration). Mais les règles sont du travail accumulé :
les perdre en changeant d'appareil fait recommencer le classement à la main. Elles
devraient au moins figurer dans l'export JSON de sauvegarde.

### E.9 Parité iOS de la couche fiscale — L

Les 15 modules n'existent que dans la PWA. C'est un choix assumé — la PWA est la
priorité tant que le compte Apple Developer n'est pas ouvert (voir
[DEPLOIEMENT_IOS.md](DEPLOIEMENT_IOS.md)) — mais l'écart se creuse à chaque module. Le
plus rentable à porter d'abord : DPA (report de FNACC) et clôture d'année, parce que ce
sont les deux seuls dont l'absence corrompt des données plutôt que de manquer un confort.

---

## Si je devais n'en retenir que trois

*Les trois retenues en octobre 2026 — A.1 Baux et RL-31, B.1 Import bancaire, A.2 Report
de la DPA — sont livrées, avec les onze autres. Les trois suivantes, par rendement :*

1. **E.1 L'export CSV ignore Uber et les dépenses véhicule** — un défaut de sortie, pas
   une fonctionnalité manquante : le fichier remis au comptable est faux aujourd'hui.
   Quelques heures.
2. **E.2 Automatiser le `?v=` des modules** — supprime la cause la plus fréquente de
   correctif qui ne prend pas en production. Vingt lignes de script.
3. **D.4 Synchronisation : avertir au lieu d'écraser** — le seul risque restant de perte
   de données silencieuse, maintenant que la clôture protège les années déclarées.
