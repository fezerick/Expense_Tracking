# Documentation — Mon Plex

Application de suivi des revenus et dépenses d'immeubles locatifs et de revenu de
covoiturage, et de l'impôt qui en découle (Québec et fédéral). Deux implémentations :
une PWA (`pwa_2026/`, déployée en prod) et une application iOS (`ios_2026/`).
Version courante : **2.7.0** — journal au fichier [CHANGELOG.md](CHANGELOG.md).

L'application s'appelait « Revenus & Dépenses 2026 » jusqu'à la version 2.2.0.

## Référence technique

| Fichier | Contenu |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | architecture des deux applications (PWA + iOS), couche modulaire `pwa_2026/js/`, modèle de données, **fusion champ par champ entre appareils** (§ 2.4), interopérabilité, version et icônes (§ 2.9), déploiement |
| [TESTS.md](TESTS.md) | campagnes de tests : `npm test` sans navigateur (§ 0), **111/111** pour le socle, **297/297** pour les modules et **18/18** pour la synchronisation, **57/57** pour la parité du noyau Swift (§ 4.5), parcours d'interface complet, tests iOS à l'exécution, défauts confirmés avec preuves et correctifs |
| [CHANGELOG.md](CHANGELOG.md) | journal des versions, de 1.0.0 à 2.7.0, et ce que chaque rang de semver signifie ici |
| [AMELIORATIONS.md](AMELIORATIONS.md) | correctifs et dette technique, classés par priorité |
| [FEATURES.md](FEATURES.md) | fonctionnalités : 16 fiches livrées le 20 octobre 2026 (D.4 dépassée par la fusion de la 2.5.0, C.3 livrée avec la 2.6.0), 6 restantes, et les neuf repérées pendant l'implémentation (§ E — huit livrées, E.4 écarté) |
| [PORTAGE_IOS.md](PORTAGE_IOS.md) | porter sur iOS tout ce qui a été fait dans la PWA : table module par module des fonctions pures et de leur destination Swift, quatre vagues (**la vague 1 est livrée** — `Core/` et ses 57 assertions de parité), pièges de traduction JS → Swift, parité des tests |

## Référence fiscale et décisions

| Fichier | Contenu |
|---|---|
| [FISCALITE.md](FISCALITE.md) | tous les paramètres fiscaux 2026 avec leur source officielle et leur statut de vérification, les règles codées (DPA, 1100(11), demi-taux, TPS/TVQ, droits de mutation…) renvoyant chacune à ses assertions de test, et ce qui reste à confirmer |
| [INCORPORATION.md](INCORPORATION.md) | Inc. ou personnel ? Verdict motivé — **rester au personnel, en indivision** — avec le détail de l'imposition d'une société de portefeuille sur du revenu locatif, les coûts de transfert, et les trois déclencheurs qui justifieraient de revoir la question |
| [DEPLOIEMENT_IOS.md](DEPLOIEMENT_IOS.md) | procédure détaillée de déploiement sur l'App Store : inscription au programme Apple Developer, préparation du projet, archivage, TestFlight, fiche de l'app, soumission, et les trois points bloquants actuels |

## Suites de tests

```bash
npm install     # jsdom, une seule fois — l'application elle-même n'a aucune dépendance
npm test        # vérifications de version + les trois suites, sans navigateur
npm run parite  # le noyau Swift de l'app iOS, confronté aux valeurs de la PWA
```

| Suite | Portée |
|---|---|
| [`../tests/run-headless.js`](../tests/run-headless.js) | exécute les trois suites sous jsdom, plus V1–V4 : cohérence de la version entre le service worker, le manifeste, `package.json` et les 20 balises de module |
| [`../tests/pwa_suite.js`](../tests/pwa_suite.js) | socle `index.html` — 111 assertions |
| [`../tests/pwa_modules_suite.js`](../tests/pwa_modules_suite.js) | les 20 fichiers de `pwa_2026/js/` — 297 assertions |
| [`../tests/pwa_sync_suite.js`](../tests/pwa_sync_suite.js) | le raccordement à Firestore, contre un Firestore de pacotille — 18 assertions |
| [`../ios_2026/Tests/Parity/`](../ios_2026/Tests/Parity/) | le noyau Swift (`ios_2026/RevenusDepenses/Core/`) rend les mêmes nombres que la PWA — 57 assertions, sans simulateur |

Les suites vivent volontairement hors de `pwa_2026/`, que Firebase Hosting publie
intégralement. Elles s'exécutent aussi *dans* la page ; la procédure est au § 0, § 2 et
§ 2b de [TESTS.md](TESTS.md).

Le projet **Boussole Fiscale** a été regroupé dans `../Boussole/`, laissé **hors du
dépôt** (entrée dans `.gitignore`), et n'est pas couvert par cette documentation.
