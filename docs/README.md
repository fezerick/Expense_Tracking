# Documentation — Revenus & Dépenses 2026

## Référence technique

| Fichier | Contenu |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | architecture des deux applications (PWA + iOS), couche modulaire `pwa_2026/js/`, modèle de données, synchronisation, interopérabilité, déploiement |
| [TESTS.md](TESTS.md) | campagnes de tests : **63/63** pour le socle et **159/159** pour les modules, parcours d'interface complet, tests iOS à l'exécution, défauts confirmés avec preuves et correctifs |
| [AMELIORATIONS.md](AMELIORATIONS.md) | correctifs et dette technique, classés par priorité |
| [FEATURES.md](FEATURES.md) | fonctionnalités : 14 fiches livrées le 20 octobre 2026, 8 restantes, et celles repérées pendant l'implémentation (§ E) |

## Référence fiscale et décisions

| Fichier | Contenu |
|---|---|
| [FISCALITE.md](FISCALITE.md) | tous les paramètres fiscaux 2026 avec leur source officielle et leur statut de vérification, les règles codées (DPA, 1100(11), demi-taux, TPS/TVQ, droits de mutation…) renvoyant chacune à ses assertions de test, et ce qui reste à confirmer |
| [INCORPORATION.md](INCORPORATION.md) | Inc. ou personnel ? Verdict motivé — **rester au personnel, en indivision** — avec le détail de l'imposition d'une société de portefeuille sur du revenu locatif, les coûts de transfert, et les trois déclencheurs qui justifieraient de revoir la question |
| [DEPLOIEMENT_IOS.md](DEPLOIEMENT_IOS.md) | procédure détaillée de déploiement sur l'App Store : inscription au programme Apple Developer, préparation du projet, archivage, TestFlight, fiche de l'app, soumission, et les trois points bloquants actuels |

## Suites de tests

| Suite | Portée |
|---|---|
| [`../tests/pwa_suite.js`](../tests/pwa_suite.js) | socle `index.html` — 63 assertions |
| [`../tests/pwa_modules_suite.js`](../tests/pwa_modules_suite.js) | les 17 modules de `pwa_2026/js/` — 159 assertions |

Les deux vivent volontairement hors de `pwa_2026/`, que Firebase Hosting publie
intégralement. Elles s'exécutent *dans* la page ; la procédure est au § 2 et § 2b de
[TESTS.md](TESTS.md).

Le projet **Boussole Fiscale** a été regroupé dans `../Boussole/`, laissé **hors du
dépôt** (entrée dans `.gitignore`), et n'est pas couvert par cette documentation.
