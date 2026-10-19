# Documentation — Revenus & Dépenses 2026

| Fichier | Contenu |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | architecture des deux applications (PWA + iOS), modèle de données, synchronisation, interopérabilité, déploiement |
| [TESTS.md](TESTS.md) | campagne de tests du 18 octobre 2026 et revérification du 19 : 63 assertions automatisées (61 passent), parcours d'interface complet, tests iOS à l'exécution, défauts confirmés avec preuves |
| [AMELIORATIONS.md](AMELIORATIONS.md) | correctifs et dette technique, classés par priorité (la priorité 1 est faite) |
| [FEATURES.md](FEATURES.md) | suggestions de nouvelles fonctionnalités, classées par rendement, avec l'accroche dans le code |

La suite de tests automatisée vit dans [`../tests/pwa_suite.js`](../tests/pwa_suite.js)
— volontairement hors de `pwa_2026/`, que Firebase Hosting publie intégralement.

Le projet **Boussole Fiscale** a été regroupé dans `../Boussole/`, laissé **hors du
dépôt** (entrée dans `.gitignore`), et n'est pas couvert par cette documentation.
