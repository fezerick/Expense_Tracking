# Suggestions d'amélioration

Issues de la campagne de tests du 18 octobre 2026 (voir `TESTS.md`). Classées par
priorité : d'abord ce qui met de mauvais chiffres devant le comptable, ensuite le confort
d'usage, enfin la pérennité du code.

---

## Priorité 1 — ✅ FAIT le 19 octobre 2026

Ces quatre points produisaient des chiffres faux ou perdaient des données. **Ils sont
corrigés, déployés et couverts par la suite de tests** (61/63, voir `TESTS.md` § 2) ;
le texte est conservé ci-dessous comme trace de ce qui a été changé et pourquoi.

### 1.1 Filtrer `getTripAmount()` par année — PWA · ✅ fait

```js
function getTripAmount(propId, mi) {
  return state.trips
    .filter(t => t.property === propId
              && yearOf(t.date) === activeYear      // ← la ligne manquante
              && monthOf(t.date) === mi)
    .reduce((s, t) => s + (parseFloat(t.km) || 0) * rate(), 0)
}
```

Une ligne. Elle supprime l'incohérence entre la ligne 9200 du T776 et le journal de
kilométrage de l'annexe A — exactement l'écart qu'une vérification cherche.

Fait tel quel. **Reste ouvert** : le garde-fou côté saisie — refuser (ou signaler)
l'ajout d'un trajet dont l'année ne correspond pas à l'année fiscale affichée. Le trajet
hors année n'est plus compté dans les déductions, mais il reste stockable en silence.

### 1.2 Inclure les revenus Uber et Lyft dans le bénéfice global — PWA et iOS · ✅ fait

Les deux applications soustraient les déductions véhicule Uber/Lyft sans ajouter les
revenus correspondants. Côté PWA, `uberNet` est déjà calculé dans `renderSummary()` : il
suffit de l'utiliser. Côté iOS :

```swift
func globalNet() -> Double {
    rentalNetGlobal() + uberNetIncome() + lyftNetTotal()
      - vehicleDeductionUber() - vehicleDeductionLyft()
}
```

Corriger aussi la colonne TOTAL des revenus du sommaire PWA, qui ne somme pas la ligne
Lyft affichée juste au-dessus. Les PDF sont déjà corrects : l'écart écran ↔ PDF est en
soi une source de confusion à supprimer.

### 1.3 Mettre la configuration et l'année dans la sauvegarde JSON — PWA · ✅ fait

```js
function exportJSON() {
  const payload = { format: 'pwa-2026', version: 3, year: activeYear, setup, state }
  // …
}
```

À l'import, accepter les deux formes : si `payload.state` existe, lire `setup` et `year`
de l'enveloppe ; sinon traiter le fichier comme l'ancien format (`state` à plat) et
continuer d'appeler `reconcilePropsFromState()`.

Cela supprime d'un coup : la perte du % de propriété, la perte des copropriétaires, les
immeubles qui reviennent en « Immeuble importé », l'année devinée côté iOS, et la perte
des immeubles non historiques dans `restorePWA`.

Fait côté iOS également : `BackupService.restore()` détecte l'enveloppe, lit `setup` et
`year`, et recrée les immeubles du fichier via un nouvel `ensurePWAProperty()` au lieu
des seuls `legacyProperties`.

Implémentation retenue, légèrement différente de l'esquisse : `format: 'pwa-depenses'`
(valeur déjà écrite par les versions précédentes, donc rétrocompatible) et deux fonctions
extraites, `backupPayload()` et `restoreFromBackup()`, pour que la suite de tests puisse
exercer l'aller-retour sans passer par un `<input type="file">`.

**Reste ouvert** : l'import iOS verse tous les trajets du fichier dans l'année déclarée
(voir `TESTS.md` § 4.4) — sans effet sur un fichier PWA réel, qui ne porte qu'une année.

### 1.4 Fusionner les réglages au lieu de les remplacer — PWA · ✅ fait

```js
const data = JSON.parse(txt)
const def = defaultState()
state = Object.assign(def, data, { settings: Object.assign(def.settings, data.settings || {}) })
```

Sans cela, chaque nouveau réglage arrive `undefined` chez les utilisateurs existants —
et un `kmTotalAnnuel` absent met toute la proration véhicule à 0 en silence.

---

> **Non corrigé volontairement** : BUG-2 (ligne CSV `Lyft - Revenus` à 16 colonnes) est
> resté hors du lot approuvé. C'est le seul défaut encore rouge dans la suite (T29, T30).
> Il est traité en 2.1 ci-dessous.

## Priorité 2 — qualité des sorties remises au comptable

### 2.1 Réparer la ligne CSV `Lyft - Revenus` (16 colonnes au lieu de 15)

Et surtout : **ajouter Uber et les dépenses véhicule au CSV**. Aujourd'hui l'export omet
32 000 $ de revenus Uber et 7 000 $ de dépenses véhicule — un comptable qui travaille à
partir du CSV seul passe à côté de l'essentiel du dossier.

### 2.2 Remplacer `−` et `→` dans les libellés PDF — PWA

jsPDF n'écrit correctement que le jeu WinAnsi ; tout caractère hors de ce jeu bascule la
chaîne en UTF-16 brut, illisible. Quatre chaînes sont concernées (lignes 3704 et
3839-3841). Le plus simple : `-` et `->`, ou `moins` et `:`. Alternative plus lourde :
embarquer une police Unicode dans jsPDF.

Protection durable : une fonction `pdfSafe(s)` qui translittère les caractères hors
WinAnsi, appliquée à tous les libellés générés.

### 2.3 Appliquer le % de propriété partout, ou le dire clairement — PWA et iOS

Le % n'est appliqué que dans le PDF (lignes 9369/9946). Les écrans et le CSV affichent
100 % sans le signaler, ce qui donne un bénéfice affiché deux fois trop élevé pour un
immeuble détenu à 50 %.

Deux options défendables :
- afficher les deux montants (« 1 404,72 $ — votre part : 702,36 $ ») ;
- garder 100 % partout mais l'écrire sur l'écran de l'immeuble, comme iOS le fait déjà
  dans son éditeur.

Le choix importe moins que la cohérence entre les deux applications.

### 2.4 Aligner le format CSV des deux applications

La PWA exporte une grille mensuelle de 15 colonnes séparées par des virgules ; iOS
exporte 4 colonnes séparées par des points-virgules, sans grille mensuelle. Deux
fichiers d'un même dossier n'ont pas la même forme. Le format PWA (grille mensuelle) est
le plus utile au comptable : c'est celui à retenir.

---

## Priorité 3 — confort et fiabilité d'usage

### 3.1 Rafraîchir les écrans Lyft et Véhicule à la saisie — PWA

`saveLyftField()` doit rafraîchir la carte « Net reçu ce mois » ; `saveVehDep()` doit
appeler `refreshVehicleCalcs()`. Aujourd'hui l'utilisateur saisit 4 800 $ et continue de
lire 0 $ : il peut légitimement croire que la saisie n'a pas été prise.

### 3.2 Préremplir la date du trajet en heure locale — PWA

```js
const today = new Date().toLocaleDateString('en-CA')   // → "2026-10-18"
```

`toISOString()` renvoie la date UTC : après 20 h au Québec, le formulaire propose
**demain**. Le 31 décembre au soir, il propose l'année suivante — et déclenche BUG-1.

### 3.3 Signaler l'échec d'écriture au lieu de l'avaler — PWA

```js
function save() {
  try { localStorage.setItem(storeKey(), JSON.stringify(state)) }
  catch (e) { toast('⚠️ Sauvegarde impossible (espace saturé). Exportez vos données.') }
  // …
}
```

Avec des reçus photo en base64 dans `localStorage`, le dépassement de quota est un
scénario réaliste. Aujourd'hui, il est totalement silencieux.

Dans la foulée : afficher quelque part le poids des données stockées, et proposer de
compresser les reçus (redimensionnement canvas avant encodage base64) — c'est de loin le
premier poste de consommation.

### 3.4 Détails

- Ajouter un `favicon.ico` (404 actuellement).
- Ajouter `<meta name="mobile-web-app-capable" content="yes">` à côté de la version
  Apple dépréciée — c'est le seul avertissement console restant.
- Afficher la date du dernier `syncPush` réussi : l'utilisateur n'a aujourd'hui aucun
  moyen de savoir si la synchronisation fonctionne.

---

## Priorité 4 — pérennité

### 4.1 Faire tourner la suite de tests à chaque modification

`tests/pwa_suite.js` couvre 50 assertions et a détecté 6 défauts réels. Elle s'exécute en
une ligne dans la console de la page :

```js
eval(await (await fetch('/tests/pwa_suite.js?cb=' + Date.now())).text())
```

Prochains ajouts utiles : un test par défaut corrigé ci-dessus (pour éviter les
régressions), et une assertion de cohérence « ligne 9200 du PDF == total de l'annexe A »,
qui aurait attrapé BUG-1 seule.

### 4.2 Étendre le harnais iOS

`DebugPDFSmokeTest` (variables `PWA_IMPORT_JSON`, `PDF_SMOKE_TEST`) s'est révélé le moyen
le plus efficace de tester iOS sans interface. L'étendre à l'export Snapshot v2 et au
calcul des totaux donnerait une couverture comparable à celle de la PWA, à coût très
faible.

### 4.3 Automatiser le bump du cache du service worker

Le nom `depenses-2026-v3` est incrémenté à la main : un oubli laisse les anciens caches
en place. Un script de déploiement qui incrémente `CACHE` puis lance
`firebase deploy --only hosting` supprime la classe entière d'incidents.

Noter aussi que le service worker sert les ressources non-HTML en *cache-first* sans
révision : pendant cette campagne, une ancienne version du fichier de tests a été servie
depuis le cache. Une stratégie *stale-while-revalidate* pour les ressources non-HTML
éviterait ce piège.

### 4.4 Découper `index.html` — à peser

4 155 lignes et 164 fonctions dans une seule portée globale. Le monofichier a de vraies
vertus (déploiement en une commande, aucune chaîne de build à maintenir, lisible
intégralement) et la taille reste gérable. Un découpage en modules ES, sans bundler,
resterait déployable tel quel et permettrait de tester les fonctions de calcul hors
navigateur — mais ce n'est à entreprendre que si le fichier continue de grossir.

### 4.5 Mettre à jour `ios_2026/README.md`

Son avertissement sur l'impossibilité de compiler (runtimes iOS 17.x seulement) est
périmé : Xcode 27.0 / SDK iOS 27.0 compile sans avertissement.
