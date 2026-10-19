# Suggestions de nouvelles fonctionnalités

Distinct de [AMELIORATIONS.md](AMELIORATIONS.md), qui liste les correctifs et la dette
technique. Ici : ce que les deux applications ne font pas encore et qui aurait de la
valeur, classé par rendement — d'abord ce qui fait gagner de l'argent ou évite une
pénalité, ensuite ce qui supprime de la saisie, enfin ce qui protège le dossier.

Chaque fiche indique où la fonctionnalité s'accrocherait dans le code existant et une
estimation d'effort (S = quelques heures, M = 1-3 jours, L = plus).

---

## A. Valeur fiscale directe

### A.1 Relevé 31 pour chaque locataire — **L'obligation la plus coûteuse à oublier** · M

Au Québec, un propriétaire doit remettre un **RL-31 à chaque locataire avant le
28 février** : 25 $ de pénalité par relevé manqué, et c'est ce document qui permet au
locataire de demander le crédit d'impôt de solidarité.

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

L'app détient déjà les deux jeux de données : frais réels + km (Méthode 1) et le taux de
0,72 $/km (Méthode 2). Elle n'en calcule qu'un. Afficher les deux côte à côte avec la
différence en dollars et une recommandation (« Méthode 1 : +412 $ cette année ») est
presque gratuit — `refreshVehicleCalcs` a déjà tout en main.

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

## Si je devais n'en retenir que trois

1. **A.1 Baux et RL-31** — une obligation légale avec pénalité, et le pré-remplissage des
   loyers supprime la majeure partie de la saisie annuelle.
2. **B.1 Import bancaire avec règles** — c'est ce qui change le temps passé dans l'app, de
   quelques soirées à une heure.
3. **A.2 Report de la DPA** — la seule donnée fiscale que l'app perd actuellement d'une
   année à l'autre, et celle dont l'erreur se propage le plus longtemps.
