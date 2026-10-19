# Tests effectués — Revenus & Dépenses 2026

Campagne du 18 octobre 2026, sur les deux applications : PWA (`pwa_2026/`) et iOS
(`ios_2026/`). Trois niveaux : suite d'assertions automatisée, parcours complet de
l'interface, et vérification à l'exécution des sorties remises au comptable (PDF, CSV,
sauvegardes).

**État au 19 octobre 2026** — cinq défauts ont été corrigés et revérifiés après la
campagne : BUG-1, BUG-7 (PWA + iOS), BUG-9 et BUG-10 (les deux côtés) et BUG-3. La suite
passe à **61/63**, les 2 échecs restants étant les assertions qui documentent BUG-2, non
corrigé volontairement (hors du lot approuvé). Les défauts encore ouverts sont listés
dans [AMELIORATIONS.md](AMELIORATIONS.md).

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

### Après correctifs : 61 réussis / 2 échecs sur 63

La suite a été étendue (13 assertions de plus) pour couvrir le comportement corrigé :

| Nouveau test | Ce qu'il verrouille |
|---|---|
| T33b | le réglage présent dans le fichier est bien repris par `mergeState()` (pas écrasé par le défaut) |
| T36 (réinterprété) | sans configuration, l'immeuble recréé revient à 100 % — repli documenté, d'où la nécessité de T36b |
| T36a–T36c | la sauvegarde est une enveloppe v3 et emporte `setup`, `year`, le % et les copropriétaires |
| T36d–T36g | `restoreFromBackup()` rétablit le %, le libellé et l'année, sans reconstruction d'immeuble |
| T51–T55 | `uberNetIncome()`, puis les 3 cellules TOTAL du Sommaire (revenus, dépenses, bénéfice) et le signe du bénéfice |
| T44–T50 | inchangés (rendu des onglets, état vierge) |

Les **2 échecs restants sont T29 et T30** : ils documentent BUG-2 (ligne CSV
`Lyft - Revenus` à 16 colonnes), qui n'était pas dans le lot de correctifs approuvé et
reste donc ouvert volontairement. Aucun autre test n'échoue.

```
{"total":63,"pass":61,"fail":2,
 "echecs":[{"id":"T29", ... "obtenu":[{"n":15,"cols":16,"extrait":"\"Lyft - Revenus\",\"Janvier\",,,…"}]},
           {"id":"T30","attendu":15,"obtenu":16}]}
```

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
avertissement du compilateur**.

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

### BUG-2 — MOYEN · PWA · une ligne CSV a une colonne de trop

L'entête compte 15 colonnes (Section, Catégorie, 12 mois, Total) ; la ligne
`Lyft - Revenus` en produit **16**. Reproduit sur un export réel. Le CSV omet par
ailleurs complètement Uber (32 000 $) et les dépenses véhicule (7 000 $).

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
