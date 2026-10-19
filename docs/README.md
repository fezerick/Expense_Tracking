# Documentation — Revenus & Dépenses 2026

| Fichier | Contenu |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | architecture des deux applications (PWA + iOS), modèle de données, synchronisation, interopérabilité, déploiement |
| [TESTS.md](TESTS.md) | campagne de tests du 18 octobre 2026 : 50 assertions automatisées, parcours d'interface complet, tests iOS à l'exécution, défauts confirmés avec preuves |
| [AMELIORATIONS.md](AMELIORATIONS.md) | suggestions classées par priorité, avec le correctif proposé pour chacune |

La suite de tests automatisée vit dans [`../tests/pwa_suite.js`](../tests/pwa_suite.js)
— volontairement hors de `pwa_2026/`, que Firebase Hosting publie intégralement.

Le projet **Boussole Fiscale** a été regroupé dans [`../Boussole/`](../Boussole/) et n'est
pas couvert par cette documentation.
