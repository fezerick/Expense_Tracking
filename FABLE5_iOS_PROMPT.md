# Prompt pour Fable 5 — Génération de l'app iOS "Revenus & Dépenses 2026"

Copie-colle tout ce qui suit dans Fable 5.

---

## Contexte

Je veux que tu génères la structure complète d'un **projet Xcode natif iOS** (SwiftUI, iOS 17+) qui reproduit fidèlement une application existante — actuellement une PWA (HTML/CSS/JS) — utilisée pour préparer ma déclaration de revenus 2026 (déclaration produite en 2027).

Cette app me sert à :
1. Suivre mes déplacements en voiture entre mon domicile et mes 2 immeubles locatifs, avec calcul automatique du montant déductible.
2. Suivre les revenus et dépenses (courantes + capital) de ces 2 immeubles, mois par mois.
3. Suivre mes revenus de chauffeur (Uber + Lyft) et répartir les dépenses de mon véhicule au prorata entre Uber, Lyft et les visites locatives.
4. Produire un sommaire fiscal annuel exportable (CSV, JSON, PDF) et une checklist de documents à fournir au comptable.

Je veux une app **entièrement fonctionnelle et compilable**, pas juste un squelette : modèles de données réels, écrans SwiftUI complets, logique de calcul implémentée, pas de TODO sur les fonctionnalités principales décrites ci-dessous.

## Choix techniques imposés

- **UI** : SwiftUI, cible iOS 17+.
- **Persistance locale** : SwiftData (pas Core Data brut).
- **Synchronisation multi-appareils** : iCloud / CloudKit, liée à l'Apple ID de l'utilisateur (via l'intégration CloudKit native de SwiftData — `ModelConfiguration` avec `cloudKitDatabase`). Pas de backend tiers, pas de Firebase.
- **Calcul de distance** pour les destinations personnalisées : MapKit (`MKDirections` / `MKLocalSearch` + `CLGeocoder`) — pas de clé API Google Maps. Les 2 distances vers mes propriétés restent des valeurs pré-configurées en dur (voir plus bas), pas besoin d'appel réseau pour celles-là.
- **Import PDF Uber/Lyft** : utiliser `PDFKit` (`PDFDocument.string` pour extraire le texte de chaque page) pour parser les relevés annuels/mensuels — voir logique de parsing détaillée plus bas.
- **Génération du rapport PDF comptable** : `PDFKit` (`UIGraphicsPDFRenderer` ou équivalent) en dessinant directement les sections (pas de lib tierce).
- **Devise / locale** : `fr_CA`, dollars canadiens, formats de date `fr-CA`.
- **Pas de compte requis pour utiliser l'app en local** — le compte iCloud sert uniquement à la synchro, optionnelle.

## Profil utilisateur (données fixes à coder en dur comme valeurs par défaut)

- Propriétaire : Eric Fezeu
- Domicile : 505 rue du Muscat, Sainte-Marthe-sur-le-Lac, QC
- Véhicule : Mitsubishi Outlander 2025
- Année fiscale par défaut à l'ouverture : 2026 (l'app doit supporter plusieurs années fiscales en parallèle, avec sélecteur d'année et création de nouvelle année)
- Taux kilométrique par défaut : 0,72 $/km (configurable dans les réglages, par année fiscale)
- Km total annuel du véhicule : valeur par défaut 22000 (configurable)

### Propriétés locatives (à coder en dur comme structure de référence, pas éditable par l'utilisateur)

**Propriété 1 — id `p1090`**
- Nom : 1090 Oscar-Benoît
- Adresse : 1090 Oscar-Benoît, Pointe-aux-Trembles, Montréal, QC
- Distance depuis le domicile : **55,4 km** (aller simple)
- Type : Appartement, 3 colocataires
- Catégories de **revenus** : `Coloc 1 (Salon)`, `Coloc 2 (Ch.Princ)`, `Coloc 3 (Ch. Bur)`
- Catégories de **dépenses déductibles** : `Taxes municipales`, `Taxe scolaire`, `Électricité`, `Chauffage (mazout / plan entretien)`, `Frais de condo`, `Internet`, `Assurance habitation`, `Système d'alarme`, `Frais de déplacement` (⚠️ calculé automatiquement, voir plus bas — champ lecture seule), `Entretien / Réparations courantes`, `Honoraires professionnels (comptable, notaire)`, `Frais de gestion`, `Frais de bureau (papeterie, clés)`, `Publicité`, `Outils / Matériel`, `Intérêts sur hypothèque / frais bancaires`, `Autres dépenses déductibles`
- Catégories de **dépenses en capital** : `Rénovation / Amélioration majeure`, `Remplacement équipements (chauffe-eau, fournaise)`, `Autres travaux majeurs`

**Propriété 2 — id `p470`**
- Nom : 470 Rue Gélinas (Triplex)
- Adresse : 470 Rue Gélinas, Trois-Rivières, QC
- Distance depuis le domicile : **165 km** (aller simple)
- Type : Triplex (3 logements : 470 / 468 / 468A)
- Catégories de **revenus** : `Logement 470`, `Logement 468`, `Logement 468 A`
- Catégories de **dépenses déductibles** : `Taxes municipales`, `Taxe scolaire`, `Électricité (parties communes)`, `Chauffage (mazout / plan entretien)`, `Frais de déneigement`, `Assurance habitation`, `Système d'alarme`, `Frais de déplacement` (auto, lecture seule), `Entretien / Réparations courantes (parties communes)`, `Honoraires professionnels (comptable, notaire)`, `Frais de gestion`, `Frais de bureau (papeterie, clés)`, `Publicité`, `Outils / Matériel`, `Intérêts sur hypothèque / frais bancaires`, `Autres dépenses déductibles`
- Catégories de **dépenses en capital** : `Rénovation / Amélioration — Logement 1`, `Rénovation / Amélioration — Logement 2`, `Rénovation / Amélioration — Logement 3`, `Rénovation / Amélioration — Parties communes`, `Remplacement équipements (chauffe-eau, fournaise)`, `Autres travaux majeurs`

Chaque catégorie ci-dessus se saisit **mois par mois** (12 valeurs, Janvier à Décembre) pour chaque année fiscale.

### Catégories de dépenses véhicule (communes Uber/Lyft/locatif, saisie annuelle unique)

`Frais de plaque / immatriculation`, `Frais de carburant (total annuel)`, `Frais d'assurance`, `Frais de permis de conduire`, `Changement d'huile`, `Achat et changement de pneus`, `Frais de réparation`, `Autres réparations / accessoires`, `Forfait annuel téléphone`, `Autres dépenses véhicule`

### Champs du relevé annuel Uber (saisie annuelle, pas mensuelle)

Groupe "Revenus" : `rides_gross` (Tarifs bruts courses), `green_surcharge` (Surtaxe verte), `booking_fee` (Frais de réservation), `mtq_dues` (Droits MTQ), `airport_fee` (Frais d'aéroport), `tolls` (Péages), `tips_rides` (Pourboires courses), `gst_riders` (TPS collectée des passagers), `qst_riders` (TVQ collectée des passagers).

Groupe "Frais payés à Uber" : `service_fee` (Frais de service Uber), `other_fees` (Autres frais Uber), `fee_discount` (Remise sur frais), `gst_paid_uber` (TPS payée à Uber), `qst_paid_uber` (TVQ payée à Uber).

Groupe "Autres revenus" : `eats_gross` (Tarif brut Uber Eats), `eats_tips` (Pourboires Uber Eats), `other_income` (Autres revenus).

Groupe "Pour déclaration TPS/TVQ" : `gst_remitted` (TPS versée par Uber en votre nom), `qst_remitted` (TVQ versée par Uber en votre nom).

Kilométrage Uber (saisie annuelle séparée) : `km_on_trip` (Km "En course"/On Trip), `km_online` (Km "En ligne"/Online — **c'est ce chiffre qui sert au calcul de la déduction**, Revenu Québec recommande le km Online).

### Champs Lyft (saisie mensuelle, 12 mois)

`taxable` (Base taxable $), `bonuses` (Primes $), `tips` (Pourboires $), `fees` (Frais Lyft $), `km` (Kilomètres parcourus), `courses` (Nombre de courses).

## Écrans requis (navigation par TabView à 5 onglets, comme une app native)

### 1. Accueil
- 4 cartes résumé : Revenus locatifs totaux, Dépenses déductibles, Bénéfice net, Déplacements de l'année (montant $).
- Formulaire rapide d'ajout de déplacement : date, sélection de propriété (1090 / 470 / Autre destination), kilométrage (pré-rempli selon la distance de la propriété), toggle aller-retour (double automatiquement le km), motif du déplacement (texte libre), aperçu en temps réel du montant estimé (km × taux).
  - Si "Autre destination" : champs adresse de départ (pré-rempli avec le domicile) et adresse d'arrivée, bouton "Calculer distance" via MapKit.
- Liste des 5 déplacements les plus récents avec date, propriété, motif, km, montant, bouton supprimer.

### 2. Trajets (journal complet)
- Navigation mois par mois (précédent/suivant) avec total du mois (nb trajets, km, $).
- Liste des trajets groupés par propriété (1090, 470, Autres) avec total par groupe.
- Suppression d'un trajet.

### 3. Logements
- Sous-onglets : 1090 Oscar Benoît | 470 Gélinas.
- Navigation mois par mois.
- Vue mensuelle : 3 sections (Revenus de location / Dépenses déductibles / Dépenses en capital), une ligne par catégorie avec champ montant, total par section, net du mois affiché en continu.
  - La ligne "Frais de déplacement" est **en lecture seule**, calculée automatiquement = somme des trajets de ce mois pour cette propriété × taux kilométrique.
  - Chaque ligne de dépense déductible doit permettre d'attacher une **note texte** et une **photo de reçu** (voir section Reçus/Notes plus bas).
- Vue annuelle (bascule) : tableau récapitulatif par catégorie avec total annuel, pour les 3 sections, + bénéfice net annuel.
- Bouton "Montants récurrents" : permet de définir un montant fixe par catégorie et de l'appliquer soit au mois courant, soit à tous les mois de l'année en une fois (ex: loyer d'un coloc identique chaque mois).

### 4. Rideshare
- Sous-onglets : Uber | Lyft | Véhicule.
- **Uber** : formulaire avec tous les champs listés plus haut (saisie annuelle), + section kilométrage (On Trip / Online), + bouton "Importer le relevé annuel PDF Uber" (voir Import PDF plus bas).
- **Lyft** : navigation mois par mois, formulaire des 6 champs mensuels, carte "Net reçu ce mois" = taxable + bonuses + tips − fees, + bouton "Importer le relevé mensuel PDF Lyft", + tableau des totaux annuels agrégés (net total, base taxable, primes, frais, km total, nb courses).
- **Véhicule** : champ km total annuel (odomètre), cartes affichant km Uber / km Lyft / km Logements et leurs % du total, formulaire des 10 catégories de dépenses véhicule (saisie unique annuelle) avec total, puis carte "Répartition Uber/Lyft" montrant le montant déductible pour chaque plateforme.

### 5. Sommaire
- Carte résumé global : revenus locatifs totaux, dépenses déductibles, dépenses en capital, bénéfice locatif net, déduction véhicule Uber, déduction véhicule Lyft.
- Tableau détaillé par source (1090, 470, Uber — véhicule, Lyft — véhicule) avec revenus / dépenses déductibles / bénéfice, + ligne total.
- Boutons d'export : Rapport PDF comptable, Export CSV, Sauvegarder JSON (backup complet), Restaurer depuis JSON.
- Checklist de fin d'année : liste d'items à cocher (documents à réunir pour le comptable), éditable (ajouter/modifier/supprimer un item, réinitialiser à la liste par défaut), barre de progression %.

### Réglages (accessible depuis un bouton engrenage dans le header)
- Taux kilométrique de l'année active ($/km).
- Km total annuel du véhicule.
- Modèle du véhicule.
- Statut de synchronisation iCloud (connecté / synchro auto on-off / dernière synchro).
- Bouton "Effacer toutes les données" (avec confirmation) pour l'année active.

## Calculs exacts à implémenter

```
montant_trajet(trip) = trip.km × taux_km_annee

frais_deplacement_auto(propriete, mois) =
    somme des trip.km pour tous les trajets de cette propriété ce mois-là × taux_km_annee

net_mensuel(propriete, mois) = somme(revenus, mois) − somme(deductibles, mois)
    // "Frais de déplacement" dans deductibles = frais_deplacement_auto()

net_annuel(propriete) = somme(revenus, 12 mois) − somme(deductibles, 12 mois)

lyft_net_mensuel(mois) = taxable[mois] + bonuses[mois] + tips[mois] − fees[mois]

km_lyft_total_annuel = somme(lyft[mois].km pour mois 0..11)
km_locatif_total_annuel = somme des km de tous les trajets vers p1090/p470 sur l'année

pct_uber = km_uber_online / km_total_annuel_vehicule
pct_lyft = km_lyft_total_annuel / km_total_annuel_vehicule

total_depenses_vehicule = somme des 10 catégories de dépenses véhicule

deduction_vehicule_uber = total_depenses_vehicule × pct_uber
deduction_vehicule_lyft = total_depenses_vehicule × pct_lyft

benefice_locatif_net_global = (revenus p1090 + revenus p470) − (dépenses p1090 + dépenses p470)
benefice_global = benefice_locatif_net_global − deduction_vehicule_uber − deduction_vehicule_lyft
```

Si `km_total_annuel_vehicule` est 0, les pourcentages et déductions véhicule doivent être 0 (éviter la division par zéro).

## Import PDF Uber / Lyft

L'utilisateur reçoit un PDF (relevé annuel Uber ou mensuel Lyft) en français ou en anglais. L'app doit :
1. Extraire tout le texte du PDF via PDFKit.
2. Chercher, pour chaque champ, une liste de libellés possibles (bilingue) dans le texte, puis capturer le premier nombre trouvé dans les ~500 caractères suivant le libellé.
3. Gérer les deux formats numériques : `1 234,56` (français, virgule = décimale) et `1,234.56` (anglais, virgule = séparateur de milliers).
4. Afficher un écran de révision : chaque champ détecté est pré-rempli et visuellement mis en évidence (ex. fond bleu clair), chaque champ non détecté reste vide et modifiable manuellement. L'utilisateur doit valider ("Appliquer") avant que les données soient réellement enregistrées.

Libellés à rechercher par champ (liste non-exhaustive, garder la même logique bilingue) :
- `rides_gross` : "Gross fares", "Tarifs bruts", "Total fares", "Gross ride fares", "Tarif brut"
- `green_surcharge` : "Green transportation levy", "Contribution verte", "Green surcharge", "Contribution au transport vert"
- `booking_fee` : "Booking fee", "Frais de réservation"
- `mtq_dues` : "MTQ dues", "Droits MTQ", "Contribution MTQ"
- `airport_fee` : "Airport surcharge", "Supplément aéroport", "Airport fee", "Frais aéroport"
- `tolls` : "Tolls", "Péages"
- `tips_rides` : "Tips", "Pourboires", "Driver tips", "Tip amount"
- `gst_riders` : "GST/HST collected from riders", "TPS/TVH collectée des passagers", "TPS collectée des passagers"
- `qst_riders` : "QST collected from riders", "TVQ collectée des passagers"
- `service_fee` : "Uber service fee", "Frais de service Uber", "Service fee"
- `other_fees` : "Other fees", "Autres frais Uber", "Autres frais"
- `fee_discount` : "Fee discount", "Remise sur frais", "Discount"
- `gst_paid_uber` : "GST/HST paid to Uber", "TPS/TVH payée à Uber", "TPS payée à Uber"
- `qst_paid_uber` : "QST paid to Uber", "TVQ payée à Uber"
- `eats_gross` : "Uber Eats gross", "Tarif brut Uber Eats", "Eats fares"
- `eats_tips` : "Eats tips", "Pourboires Eats"
- `other_income` : "Other earnings", "Autres revenus", "Other income"
- `gst_remitted` : "GST/HST remitted by Uber", "TPS versée par Uber"
- `qst_remitted` : "QST remitted by Uber", "TVQ versée par Uber", "TVQ remise par Uber"
- `km_on_trip` : "km on trip", "On-trip km", "Km en course", "Miles on trip"
- `km_online` : "km online", "Online km", "Km en ligne", "Total online km", "Online miles"
- Lyft `taxable` : "Base pay", "Rémunération de base", "Taxable earnings", "Ride earnings", "Gross earnings"
- Lyft `bonuses` : "Bonuses", "Primes", "Incentives", "Streak bonus", "Challenge bonus"
- Lyft `tips` : "Tips", "Pourboires", "Tip amount", "Total tips", "Passenger tips"
- Lyft `fees` : "Lyft fee", "Frais de service Lyft", "Service fee", "Lyft service fee", "Commission"
- Lyft `km` : "Kilometers", "km driven", "Distance (km)", "Total distance", "Miles driven", "Km parcourus"
- Lyft `courses` : "Rides completed", "Total rides", "Courses complétées", "Trips completed", "Number of rides"

## Reçus photo et notes

- Pour chaque cellule de dépense déductible (par propriété/catégorie/mois), permettre :
  - D'attacher une photo (caméra ou photothèque via `PhotosPicker`), compressée avant stockage local (fichier lié au SwiftData record).
  - De la visualiser en plein écran, la télécharger/partager, la supprimer.
  - D'ajouter/éditer/supprimer une note texte libre.
- Indicateur visuel discret sur la ligne si une note ou un reçu existe déjà.

## Checklist par défaut (à créer automatiquement pour chaque nouvelle année fiscale)

1. Feuillets T4 / Relevé 1 (revenus d'emploi)
2. Rapport annuel Uber (PDF)
3. Relevés mensuels Lyft (jan–déc)
4. Acomptes provisionnels versés — ARC
5. Acomptes provisionnels versés — Revenu Québec
6. Formulaire T776 — État des loyers de biens immeubles
7. Avis d'imposition municipale — 1090 Oscar Benoît
8. Avis d'imposition municipale — 470 Gélinas
9. Taxe scolaire — 1090 Oscar Benoît
10. Taxe scolaire — 470 Gélinas
11. Relevé annuel hypothèque (intérêts) — 1090
12. Relevé annuel hypothèque (intérêts) — 470
13. Relevés assurance habitation (2 propriétés)
14. Reçus réparations / entretien
15. Journal kilométrique (trajets logements)
16. Reçus dépenses véhicule (carburant, assurance, entretien)
17. Rapport préparé par comptable
18. Déclaration fédérale T1 soumise à l'ARC
19. Déclaration provinciale TP-1 soumise à Revenu Québec

L'utilisateur peut cocher/décocher, éditer le libellé, ajouter ses propres items, en supprimer, ou réinitialiser à cette liste par défaut.

## Rapport PDF comptable (contenu attendu)

Un PDF avec, dans l'ordre : en-tête (titre + date de génération + modèle du véhicule) → pour chaque propriété (1090 puis 470) : revenus détaillés par catégorie + total, dépenses déductibles détaillées + total, dépenses capital détaillées + total, bénéfice net → section Rideshare (revenu net Uber, revenu taxable total Lyft, total) → section Véhicule (détail des 8 premières catégories de dépenses véhicule + total) → pied de page avec numérotation et nom du propriétaire. N'afficher que les catégories avec un montant non nul.

## Multi-année

- L'app doit gérer plusieurs années fiscales indépendantes (chaque année a son propre jeu de données : trajets, propriétés, uber, lyft, véhicule, réglages, checklist).
- Sélecteur d'année dans le header, avec possibilité de créer une nouvelle année (qui repart avec des données vides mais garde la structure de catégories).

## Charte visuelle (à adapter en SwiftUI, garder l'esprit)

- Couleur principale foncée (header/nav) : `#1F3864`
- Bleu accent : `#0070C0`
- Vert (revenus/positif) : `#375623`
- Brun (capital) : `#7B3F00`
- Orange (Uber) : `#E65100`
- Rose (Lyft) : `#AD1457`
- Cartes avec coins arrondis, ombre légère, fond blanc sur fond gris clair.
- Navigation par TabBar en bas (5 onglets : Accueil, Trajets, Logements, Rideshare, Sommaire), avec icônes SF Symbols cohérentes (maison, voiture, bâtiment, taxi, graphique).

## Livrables attendus

1. **Arborescence complète du projet Xcode** (dossiers : `Models/`, `Views/`, `ViewModels/`, `Services/`, `Resources/`, etc.), avec le nom de chaque fichier Swift.
2. **Code Swift complet** pour chaque fichier (modèles SwiftData, vues SwiftUI, view models, services : `DistanceService` (MapKit), `PDFStatementParser` (Uber/Lyft), `PDFReportGenerator`, `CloudKitSyncService`, `CSVExportService`), prêt à être copié directement dans Xcode et à compiler.
3. Instructions de configuration : capability iCloud/CloudKit à activer, identifiant de conteneur CloudKit suggéré, permissions Info.plist nécessaires (caméra, photothèque, localisation si utilisée par MapKit).
4. Une courte liste de ce qu'il reste à faire manuellement après génération (icônes App Store, écran de lancement, provisioning profile, tests sur appareil réel).

## Contraintes à respecter absolument

- Ne pas inventer de nouvelles catégories fiscales ou de nouveaux champs Uber/Lyft en dehors de ceux listés ci-dessus.
- Ne pas simplifier ou modifier les formules de calcul (proration véhicule, calcul auto des frais de déplacement, etc.).
- Garder tous les libellés d'interface en français (Canada), pas de traduction anglaise.
- Le taux kilométrique, les distances des 2 propriétés, et les catégories de dépenses doivent être les valeurs par défaut mais rester modifiables/extensibles dans le code (pas des chaînes magiques éparpillées partout — centraliser dans une structure de configuration).
- Si un point n'est pas clair, pose-moi la question avant de faire une supposition plutôt que d'improviser une fonctionnalité non demandée.
