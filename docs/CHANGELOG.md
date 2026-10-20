# Journal des versions — Mon Plex

Format : [semver](https://semver.org/lang/fr/) — `MAJEUR.MINEUR.CORRECTIF`.
Ce que chaque rang signifie pour cette application est défini au § 2.9 de
[ARCHITECTURE.md](ARCHITECTURE.md) :

- **MAJEUR** — le format des données change et une sauvegarde ancienne ne se relit plus telle quelle ;
- **MINEUR** — nouvelle fonctionnalité, nouveau module, nouvel onglet ;
- **CORRECTIF** — correction, libellé, retouche de calcul sans nouvelle fonctionnalité.

La version est écrite aux six endroits par `scripts/version.sh`, seul outil autorisé
à les toucher. Elle s'affiche en bas de l'onglet **Réglages**.

> Les versions antérieures à 2.1.0 n'étaient pas numérotées : l'application ne portait
> alors aucun `APP_VERSION` et le cache du service worker s'appelait `depenses-v1`
> puis `depenses-v2`. Les entrées ci-dessous les reconstituent depuis l'historique git
> pour que le journal soit complet ; leurs numéros sont attribués après coup.

---

## 2.2.1 — 20 octobre 2026

### Corrigé
- **Import des relevés PDF Uber et Lyft : rien n'était détecté.** Trois causes
  distinctes, toutes réparées :
  - **Aucun OCR.** `extractPDFText()` ne lisait que la couche texte du PDF. Un relevé
    scanné, ou exporté en image, n'en a pas : pdf.js rendait une chaîne vide et la
    feuille annonçait « aucune donnée détectée » comme si les libellés étaient en cause.
    Elle bascule maintenant sur Tesseract — déjà embarqué pour les reçus — dès que la
    couche texte fait moins de 80 caractères utiles, avec l'avancement affiché.
  - **Une seule occurrence du libellé examinée.** `findAmountNear()` s'arrêtait à la
    première, souvent une mention en prose dans un sommaire, et ramenait le chiffre
    d'une autre ligne. C'est désormais l'occurrence dont le montant est le **plus
    proche** qui gagne, et la fenêtre de recherche passe de 500 à 160 caractères
    (élargie seulement si rien n'est trouvé).
  - **Libellés trop peu nombreux.** Lyft change de vocabulaire selon la langue du
    compte et le type de relevé. Chaque champ accepte maintenant de 6 à 16 variantes,
    françaises et anglaises.
- **Les milles étaient enregistrés comme des kilomètres.** Un relevé anglophone compte
  en milles ; `Online miles 742` devenait 742 km au lieu de 1 194. La déduction
  kilométrique était sous-estimée de 38 % sur tout relevé en anglais. La conversion est
  faite quand le libellé retenu parle de milles (Uber et Lyft).
- Les montants négatifs entre parenthèses — `(612,30)`, la convention comptable — sont
  lus comme négatifs, et un pourcentage n'est plus pris pour un montant.

### Ajouté
- **« 🔍 Voir le texte lu dans le PDF »** dans la feuille d'import : montre ce que
  l'application a réellement lu, le mode (texte ou OCR) et le nombre de caractères, avec
  copie en un geste. Un import qui ne trouve rien laisse désormais une prise.
- Couverture de tests T56–T73 : relevé Lyft français, relevé Lyft anglais en milles,
  relevé Uber, PDF illisible, libellé présent deux fois, négatif comptable, pourcentage.

---

## 2.2.0 — 20 octobre 2026

Identité de l'application, et les besoins repérés pendant l'implémentation de la couche
fiscale (§ E de [FEATURES.md](FEATURES.md)).

### Ajouté
- **Nom et icône.** L'application s'appelle **Mon Plex** (auparavant « Revenus &
  Dépenses 2026 »). Icône « Le plex » : un plex blanc sur fond bleu marine, dont une
  fenêtre porte un `$` vert. Source de vérité en SVG dans `pwa_2026/icons/`, PNG rendus
  par Chrome sans retouche à la main (192, 512, maskable 512, `apple-touch-icon` 180).
- **Version visible** en bas de l'onglet Réglages (`APP_VERSION` + `APP_BUILD`).
- **E.6 — Simulateur de vente** : nouveau module `js/vente.js` (18ᵉ fichier de `js/`).
  Récupération de la DPA imposée à 100 %, gain en capital à 50 %, et le rappel que la
  DPA demandée ne réduit **pas** le PBR.
- **E.5 — Rappels datés des acomptes provisionnels** : `calculAcomptes()` et un bandeau
  d'accueil aux quatre échéances (15 mars, 15 juin, 15 septembre, 15 décembre).
- **E.9 — Portage iOS** : [PORTAGE_IOS.md](PORTAGE_IOS.md) — table module par module des
  fonctions pures à porter, quatre vagues, sept pièges JS → Swift, parité des tests.
- **Journal des versions** : ce fichier.

### Corrigé
- **E.1 — Export CSV incomplet** : les revenus Uber et les dépenses du véhicule
  manquaient au CSV remis au comptable ; les montants annuels étaient portés en janvier
  et faussaient les totaux mensuels du tableur. Les deux sont réparés (T28–T30b,
  M158–M166).
- **E.7 — Import bancaire** : dédoublonnage par `FITID` lorsque le relevé OFX/QFX en
  fournit un, via la séparation `clesTx()` (enregistrement) / `cleMatch()` (comparaison).
- **E.8 — Règles d'import** : test de non-régression sur l'aller-retour des règles dans
  l'enveloppe de sauvegarde v3.
- Le compteur de colonnes de la suite socle comptait mal les guillemets : c'était le
  **compteur** qui était faux, pas le CSV (voir § 2 de [TESTS.md](TESTS.md)).

### Écarté
- **E.4 — Transmission électronique des RL-31.** Exige le XSD officiel de Revenu Québec
  et un numéro de préparateur ; en inventer un produit un fichier qui *paraît* conforme
  et se fait rejeter. Sous 51 relevés, la transmission en ligne suffit. Conditions de
  déblocage consignées dans [FEATURES.md](FEATURES.md) § E.4.

---

## 2.1.0 — 20 octobre 2026

Outillage : la version et les tests cessent de dépendre d'une manipulation manuelle.

### Ajouté
- **E.2 — `scripts/version.sh`** : incrémente la version aux six endroits d'un coup
  (`APP_VERSION`, `APP_BUILD`, les 18 balises `?v=`, `CACHE` du service worker,
  `version` du manifeste). Compte les balises réellement présentes au lieu de les figer,
  et refuse d'agir si les six endroits divergent déjà. `--deploy` enchaîne le
  déploiement.
- **E.3 — `npm test`** : `tests/run-headless.js` exécute les deux suites sous jsdom,
  sans navigateur, plus les vérifications de version V1–V4. L'application elle-même
  reste sans dépendance ; `package.json` ne sert qu'aux tests.

---

## 2.0.0 — 20 octobre 2026 · commit `07a6406`

La couche fiscale : 14 fiches livrées en 17 modules, et la section recommandations.

### Ajouté
- Baux et relevés 31, report de la DPA, TPS/TVQ sur le revenu Uber, impôt estimé et
  acomptes, méthode 1 vs méthode 2 du véhicule, import bancaire avec règles, état par
  copropriétaire, OCR des reçus et audit des pièces manquantes, journal de kilométrage
  assisté, clôture d'année verrouillée, dossier comptable en un ZIP, simulateur d'achat,
  tableau de bord pluriannuel, ventilation automatique d'une dépense.
- Section **recommandations** adossée aux biens réels.
- [FISCALITE.md](FISCALITE.md) — tous les paramètres 2026 avec leur source officielle ;
  [INCORPORATION.md](INCORPORATION.md) — verdict motivé : rester au personnel, en
  indivision ; [DEPLOIEMENT_IOS.md](DEPLOIEMENT_IOS.md) — mise en ligne sur l'App Store.

### Rang majeur
L'enveloppe de sauvegarde passe en **version 3** (`backupPayload()`), avec les clés des
nouveaux modules. Les clés d'état sont créées paresseusement : une sauvegarde v2 se
relit, mais une v3 n'est pas lisible par une version antérieure.

---

## 1.2.0 — 19 octobre 2026 · commits `134db5c`, `ffcfb0d`

### Corrigé
Cinq défauts de calcul et de sauvegarde (PWA et iOS), avec leurs assertions de test.

### Ajouté
Première suite de tests documentée, [ARCHITECTURE.md](ARCHITECTURE.md),
[TESTS.md](TESTS.md), [AMELIORATIONS.md](AMELIORATIONS.md), [FEATURES.md](FEATURES.md).

---

## 1.1.0 — 13 juillet 2026 · commit `18a0053`

### Ajouté
- Rapport PDF comptable complet dans la PWA — 9 pages, à parité avec iOS.
- Import des sauvegardes iOS.
- Cache du service worker porté à `depenses-v2` (`9eb5d19`).

---

## 1.0.0 — 13 juillet 2026 · commits `cbb35df` → `4323640`

### Ajouté
- Assistant de configuration par modules, thème clair/sombre (PWA et iOS).
- Immeubles dynamiques des deux côtés (`RentalProperty` sur iOS), reconstruction de
  l'état après import.
- Pourcentage de propriété modifiable, préservé à l'import (`4323640`).

`cbb35df` est le point de rollback de référence (voir § 6 de
[ARCHITECTURE.md](ARCHITECTURE.md)).
