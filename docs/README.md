# Documentation — Mon Plex

Application de suivi des revenus et dépenses d'immeubles locatifs et de revenu de
covoiturage, et de l'impôt qui en découle (Québec et fédéral). Deux implémentations :
une PWA (`pwa_2026/`, déployée en prod) et une application iOS (`ios_2026/`).
Version courante : **2.2.2** — journal au fichier [CHANGELOG.md](CHANGELOG.md).

L'application s'appelait « Revenus & Dépenses 2026 » jusqu'à la version 2.2.0.

## Référence technique

| Fichier | Contenu |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | architecture des deux applications (PWA + iOS), couche modulaire `pwa_2026/js/`, modèle de données, synchronisation, interopérabilité, version et icônes (§ 2.9), déploiement |
| [TESTS.md](TESTS.md) | campagnes de tests : `npm test` sans navigateur (§ 0), **96/96** pour le socle et **209/209** pour les modules, parcours d'interface complet, tests iOS à l'exécution, défauts confirmés avec preuves et correctifs |
| [CHANGELOG.md](CHANGELOG.md) | journal des versions, de 1.0.0 à 2.2.2, et ce que chaque rang de semver signifie ici |
| [AMELIORATIONS.md](AMELIORATIONS.md) | correctifs et dette technique, classés par priorité |
| [FEATURES.md](FEATURES.md) | fonctionnalités : 14 fiches livrées le 20 octobre 2026, 8 restantes, et les neuf repérées pendant l'implémentation (§ E — huit livrées, E.4 écarté) |
| [PORTAGE_IOS.md](PORTAGE_IOS.md) | porter sur iOS tout ce qui a été fait dans la PWA : table module par module des fonctions pures et de leur destination Swift, quatre vagues, pièges de traduction JS → Swift, parité des tests |

## Référence fiscale et décisions

| Fichier | Contenu |
|---|---|
| [FISCALITE.md](FISCALITE.md) | tous les paramètres fiscaux 2026 avec leur source officielle et leur statut de vérification, les règles codées (DPA, 1100(11), demi-taux, TPS/TVQ, droits de mutation…) renvoyant chacune à ses assertions de test, et ce qui reste à confirmer |
| [INCORPORATION.md](INCORPORATION.md) | Inc. ou personnel ? Verdict motivé — **rester au personnel, en indivision** — avec le détail de l'imposition d'une société de portefeuille sur du revenu locatif, les coûts de transfert, et les trois déclencheurs qui justifieraient de revoir la question |
| [DEPLOIEMENT_IOS.md](DEPLOIEMENT_IOS.md) | procédure détaillée de déploiement sur l'App Store : inscription au programme Apple Developer, préparation du projet, archivage, TestFlight, fiche de l'app, soumission, et les trois points bloquants actuels |

## Suites de tests

```bash
npm install     # jsdom, une seule fois — l'application elle-même n'a aucune dépendance
npm test        # vérifications de version + les deux suites, sans navigateur
```

| Suite | Portée |
|---|---|
| [`../tests/run-headless.js`](../tests/run-headless.js) | exécute les deux suites sous jsdom, plus V1–V4 : cohérence de la version entre le service worker, le manifeste, `package.json` et les 18 balises de module |
| [`../tests/pwa_suite.js`](../tests/pwa_suite.js) | socle `index.html` — 96 assertions |
| [`../tests/pwa_modules_suite.js`](../tests/pwa_modules_suite.js) | les 18 fichiers de `pwa_2026/js/` — 209 assertions |

Les deux suites vivent volontairement hors de `pwa_2026/`, que Firebase Hosting publie
intégralement. Elles s'exécutent aussi *dans* la page ; la procédure est au § 0, § 2 et
§ 2b de [TESTS.md](TESTS.md).

Le projet **Boussole Fiscale** a été regroupé dans `../Boussole/`, laissé **hors du
dépôt** (entrée dans `.gitignore`), et n'est pas couvert par cette documentation.
