# Paramètres et règles fiscales de l'application

> Dernière vérification des valeurs : **20 octobre 2026**.
> Toutes les valeurs vivent dans [`pwa_2026/js/fiscal-data.js`](../pwa_2026/js/fiscal-data.js),
> indexées par année. **Aucun taux fiscal ne doit être écrit ailleurs dans le code.**

Ce fichier dit *où* chaque chiffre a été pris, *comment* chaque règle est codée, et
*ce qui reste à confirmer*. Il est destiné à être relu une fois par an, en janvier,
quand les paramètres de l'année sont publiés.

---

## 1. Comment ajouter une année

1. Dupliquer le bloc de l'année précédente dans `FISCAL` (`fiscal-data.js`).
2. Remplacer les valeurs **une par une**, en vérifiant chacune sur la source citée.
3. Mettre `verifie: 'AAAA-MM-JJ'` à la date de la vérification.
4. Lancer les deux suites de tests (voir [TESTS.md](TESTS.md)) : plusieurs d'entre
   elles lisent les paramètres au lieu de les coder en dur, elles suivront.

`fiscal(year)` retombe sur l'année connue la plus récente si l'année demandée
n'existe pas encore, et l'écran *Fiscal* affiche alors un avertissement : mieux
vaut un chiffre daté qu'un `undefined` silencieux.

---

## 2. Paramètres 2026

| Paramètre | Valeur retenue | Source | Statut |
|---|---|---|---|
| Taux kilométrique | **0,73 $** les 5 000 premiers km, **0,67 $** ensuite (+0,04 $ territoires) | Règl. de l'impôt, art. 7306 ; communiqué de Finances Canada du 14 janvier 2026 | vérifié |
| Paliers fédéraux | 14 % / 20,5 % / 26 % / 29 % / 33 % — seuils 58 523 / 117 045 / 181 440 / 258 482 $ | ARC, « Taux d'impôt et tranches » | vérifié |
| Montant personnel de base fédéral | 16 452 $ (min. 14 829 $, réduit entre 181 440 et 258 482 $) | ARC | vérifié |
| Abattement du Québec | 16,5 % de l'impôt fédéral | ARC, ligne 44000 | vérifié |
| Paliers Québec | 14 % / 19 % / 24 % / 25,75 % — seuils 54 345 / 108 680 / 132 245 $ | Revenu Québec, « Taux d'imposition » | vérifié |
| Montant personnel de base Québec | 18 952 $ | **calculé** : 18 571 $ (2025, officiel) × 1,0205 | **à confirmer sur le TP-1 2026** |
| RRQ travailleur autonome | MGA 74 600 $, MSGA 85 000 $, exemption 3 500 $, 12,60 % (base + 1re suppl., les deux parts), 8 % sur la 2e tranche | Revenu Québec / Retraite Québec, tableaux des taux | vérifié |
| RQAP travailleur autonome | 0,764 %, max 786,92 $, MGA 103 000 $ | Conseil de gestion de l'assurance parentale | vérifié |
| FSS (annexe F) | seuil 18 500 $, plancher 150 $, maximum 1 000 $, paliers 33 500 / 64 355 / 149 355 $ | Finances Québec, bulletin 2025-8 | vérifié (assiette : voir §4) |
| Plafond catégorie 10.1 | 39 000 $ **plus les taxes** | Finances Canada, 14 janvier 2026 | vérifié |
| Location / intérêts automobile | 1 100 $/mois et 350 $/mois | Finances Canada | vérifié |
| TPS / TVQ | 5 % et 9,975 % | Revenu Québec, « Taux de la TPS et de la TVQ » | vérifié |
| Acomptes provisionnels | seuil 1 800 $ (fédéral **et** Québec), échéances 15 mars / 15 juin / 15 sept. / 15 déc. | ARC « Qui doit payer » + Revenu Québec | vérifié |
| Relevé 31 | à produire au plus tard le **28 février**, pour tout bail en cours au 31 décembre | Revenu Québec, RL-31 | vérifié |
| Pénalité RL-31 | **25 $ par jour de retard**, minimum 100 $, maximum 2 500 $ | Revenu Québec | vérifié (corrigé : ce n'est pas 25 $ par relevé) |
| Droits de mutation | 0,5 % jusqu'à 62 900 $ · 1 % jusqu'à 315 000 $ · 1,5 % au-delà | Loi concernant les droits sur les mutations immobilières, seuils indexés publiés à la *Gazette officielle* | vérifié ; **estimation** au-delà de 500 000 $ (voir §4) |

---

## 3. Règles de calcul codées

Ces règles-là ne sont pas des taux : ce sont des mécanismes. Chacune est testée
(identifiants de test entre parenthèses, voir [TESTS.md](TESTS.md)).

**Déduction pour amortissement (DPA)**

- *Le terrain n'est jamais amortissable.* La base est le coût moins la part de
  terrain (M21).
- *Règle du demi-taux* — Règl. 1100(2) : la moitié des ajouts nets de l'année
  n'est pas amortissable l'année de l'acquisition (M26, M27).
- *Incitatif à l'investissement accéléré* : la règle du demi-taux est **suspendue
  pour les biens acquis de 2024 à 2027**, puis rétablie (M22, M23, M26). La
  catégorie 10.1 en reste exclue (M29).
- *Classe distincte par immeuble locatif de 50 000 $ et plus* — Règl. 1101(1ac) :
  chaque bâtiment a sa propre FNACC, sans mise en commun (M24).
- *La DPA ne peut créer ni augmenter une perte locative* — Règl. 1100(11), et le
  plafond s'applique à **l'ensemble** des immeubles, pas immeuble par immeuble
  (M25, M118).
- *Catégorie 10.1* : coût plafonné par la limite de l'année d'acquisition, **taxes
  incluses** ; pas de perte finale ni de récupération (M28, M29).
- *FNACC d'ouverture* : reportée automatiquement de la clôture de l'année
  précédente, récursivement, et marquée « reporté » à l'écran. Une saisie manuelle
  sur un bien l'emporte — c'est ce qui amorce la première année (M30, M32, M33).

**Revenus et cotisations**

- Le **loyer net est un revenu de biens** : ni RRQ, ni RQAP. Uber et Lyft sont un
  **revenu d'entreprise** : les deux s'appliquent (M56, et §4 pour le FSS).
- Le RRQ du travailleur autonome se paie en entier (part employé + part
  employeur) ; les gains d'emploi déjà cotisés consomment l'exemption et le
  plafond, sinon un salarié qui conduit pour Uber cotiserait deux fois sur la
  même tranche.
- La moitié de la cotisation de base au RRQ est déductible du revenu, l'autre
  moitié donne un crédit ; la cotisation supplémentaire est entièrement
  déductible.

**Taxes à la consommation**

- Depuis 2013, **la TVQ s'applique au prix hors TPS** : un montant toutes taxes
  comprises vaut `prix × 1,14975`, et non `× 1,05 × 1,09975` (M45 à M48).
- La TPS/TVQ payée **sur les frais de service d'Uber** est un CTI/RTI du
  chauffeur (M52).
- Les CTI/RTI sur les dépenses du véhicule sont pris **au prorata commercial**
  (M49). Les droits d'immatriculation de la SAAQ et les primes d'assurance ne
  portent pas de taxes : ils sont exclus d'office.

**Financement et achat**

- Les prêts hypothécaires canadiens sont **composés semestriellement** : le taux
  mensuel est `(1 + r/2)^(1/6) − 1`, et non `r/12`. L'écart se chiffre en
  milliers de dollars sur un amortissement de 25 ans (M112).
- Droits de mutation calculés par paliers, avec le crédit de premier acheteur
  en option (M116).

---

## 4. Ce qui reste à confirmer

Trois points sont signalés dans l'application elle-même, pour qu'ils ne soient
jamais pris pour des certitudes.

1. **Montant personnel de base du Québec 2026 (18 952 $)** — obtenu par
   indexation de la valeur officielle 2025 (18 571 $ × 1,0205). À remplacer par
   le chiffre du TP-1 2026 dès sa parution. Impact : quelques dizaines de dollars
   sur l'impôt estimé.
2. **Assiette de la cotisation au FSS** — l'application la calcule sur le revenu
   d'entreprise **plus** le revenu de biens (loyer net), le revenu d'emploi étant
   exclu. C'est la lecture retenue du bulletin 2025-8, mais la définition exacte
   du « revenu assujetti » doit être confirmée sur **l'annexe F du TP-1 de
   l'année**. Impact : jusqu'à 1 000 $.
3. **Droits de mutation au-delà de 500 000 $** — une municipalité peut fixer son
   propre taux, jusqu'à 3 % (Montréal a son propre barème, plus élevé). Le
   simulateur affiche donc une **estimation** et laisse corriger le montant à la
   main.

---

## 5. Sources

Officielles, à consulter pour l'année visée :

- ARC — Taux d'impôt et tranches : <https://www.canada.ca/fr/agence-revenu/services/impot/particuliers/foire-questions-particuliers/taux-impot-particuliers.html>
- ARC — T776, *État des loyers de biens immeubles* : <https://www.canada.ca/fr/agence-revenu/services/formulaires-publications/formulaires/t776.html>
- ARC — T2125, *État des résultats des activités d'une entreprise* : <https://www.canada.ca/fr/agence-revenu/services/formulaires-publications/formulaires/t2125.html>
- ARC — Acomptes provisionnels, qui doit payer : <https://www.canada.ca/fr/agence-revenu/services/impot/particuliers/sujets/acomptes-provisionnels.html>
- Finances Canada — plafonds automobiles et taux kilométriques (communiqué annuel de janvier)
- Revenu Québec — Taux d'imposition des particuliers : <https://www.revenuquebec.ca/fr/citoyens/declaration-de-revenus/produire-votre-declaration-de-revenus/comment-remplir-votre-declaration/aide-par-ligne/400-a-447-impot-et-cotisations/ligne-401/>
- Revenu Québec — TP-128, *Revenus de location* : <https://www.revenuquebec.ca/fr/services-en-ligne/formulaires-et-publications/details-courant/tp-128/>
- Revenu Québec — Relevé 31 : <https://www.revenuquebec.ca/fr/entreprises/releves/releve-31/>
- Revenu Québec — Taux de la TPS et de la TVQ : <https://www.revenuquebec.ca/fr/entreprises/taxes/tpstvh-et-tvq/perception-de-la-tps-et-de-la-tvq/calcul-des-taxes/>
- Légis Québec — Loi concernant les droits sur les mutations immobilières : <https://www.legisquebec.gouv.qc.ca/fr/document/lc/D-15.1>
- Finances Québec — bulletins d'information : <https://www.finances.gouv.qc.ca/documentation/publications/bulletins.asp>

Pour les règles de DPA : *Règlement de l'impôt sur le revenu*, art. 1100(2),
1100(11), 1101(1ac) et annexe II (catégories).
