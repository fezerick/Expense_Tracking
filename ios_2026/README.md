# Revenus & Dépenses — App iOS native (SwiftUI)

Application iOS native (iOS 17+) de préparation de la déclaration de revenus : immeubles locatifs, journal kilométrique, revenus Uber/Lyft avec proration des dépenses véhicule, exports comptables. Réécriture native de la PWA `pwa_2026/`.

## Ouvrir et lancer

1. Ouvrir `RevenusDepenses.xcodeproj` dans Xcode 16 ou plus récent.
2. Sélectionner un simulateur iPhone (ou votre appareil) et lancer (⌘R).

Le projet compile tel quel. **Note pour cette machine** : les runtimes simulateur installés datent d'iOS 17.x alors que Xcode 26 attend son runtime iOS 26 pour compiler le catalogue d'assets (icône). Installer le runtime via *Xcode → Settings → Components* (ou brancher un iPhone réel) et tout passera ; le code Swift lui-même compile sans erreur.

## Architecture

```
RevenusDepenses/
├── App/
│   ├── RevenusDepensesApp.swift   # Entrée ; container SwiftData (CloudKit → repli local)
│   └── RootView.swift             # TabView 5 onglets, sélecteur d'année, réglages
├── Models/
│   ├── AppConfig.swift            # Config centrale : propriétés, catégories, taux, couleurs
│   └── Models.swift               # FiscalYear, Trip, EntryAmount, UberValue, LyftMonth,
│                                  # VehicleExpense, ChecklistItem (SwiftData, compatibles CloudKit)
├── Services/
│   ├── DataService.swift          # Accès données + TOUTES les formules de calcul
│   ├── DistanceService.swift      # Distance routière via MapKit (MKDirections)
│   ├── PDFStatementParser.swift   # Import relevés PDF Uber/Lyft (bilingue FR/EN, PDFKit)
│   ├── PDFReportGenerator.swift   # Rapport PDF comptable (UIGraphicsPDFRenderer)
│   ├── CSVExportService.swift     # Export CSV du sommaire
│   └── BackupService.swift        # Sauvegarde / restauration JSON complète
├── Views/
│   ├── HomeView.swift             # Accueil : cartes résumé + formulaire rapide de trajet
│   ├── TripsView.swift            # Journal complet, par mois, groupé par propriété
│   ├── PropertiesView.swift       # Logements : saisie mensuelle/annuelle, reçus, récurrents
│   ├── RideshareView.swift        # Uber | Lyft | Véhicule (proration au prorata des km)
│   ├── SummaryView.swift          # Sommaire, exports PDF/CSV/JSON, checklist
│   ├── SettingsView.swift         # Taux $/km, km annuel, véhicule, iCloud, effacement
│   ├── PDFImportReviewView.swift  # Écran de révision avant application d'un import PDF
│   └── Components.swift           # Cartes, champs montant, navigateur de mois…
├── Resources/Assets.xcassets
└── RevenusDepenses.entitlements   # iCloud/CloudKit
```

## Synchronisation iCloud (CloudKit)

L'app fonctionne **sans compte** (stockage local). Pour activer la synchro multi-appareils :

1. Dans Xcode, cible *RevenusDepenses* → *Signing & Capabilities* : choisir votre équipe de développement.
2. Ajouter la capability **iCloud** → cocher **CloudKit** → conteneur `iCloud.com.ericfezeu.revenusdepenses` (déjà dans l'entitlements ; adapter si votre bundle id change).
3. Ajouter la capability **Background Modes → Remote notifications** (poussées CloudKit).

Au démarrage, l'app tente CloudKit et se replie automatiquement sur le stockage local si indisponible.

## Permissions (déjà configurées dans les build settings)

- `NSCameraUsageDescription` — photographier les reçus.
- `NSPhotoLibraryUsageDescription` — joindre des reçus depuis la photothèque.
- MapKit ne requiert aucune permission pour le calcul d'itinéraire entre deux adresses.

## Reste à faire manuellement

- [ ] Icône d'app 1024×1024 dans `Assets.xcassets/AppIcon`.
- [ ] Choisir l'équipe de signature (provisioning) pour installer sur iPhone réel.
- [ ] Activer les capabilities iCloud/CloudKit (voir ci-dessus) pour la synchro.
- [ ] Tester l'import PDF avec vos vrais relevés Uber/Lyft 2026 et ajuster les libellés dans `PDFStatementParser.swift` si un champ n'est pas détecté.
- [ ] Écran de lancement personnalisé (optionnel — généré automatiquement pour l'instant).

## Données et calculs (fidèles à la PWA)

- 1090 Oscar-Benoît : 55,4 km aller ; 470 Gélinas : 165 km aller ; aller-retour = ×2.
- `montant_trajet = km × taux` (défaut 0,72 $/km, réglable par année).
- « Frais de déplacement » dans les dépenses locatives = auto-calculé du journal (lecture seule).
- Proration véhicule : `pct = km plateforme / km total annuel` (0 si km total = 0) ; déduction = total dépenses véhicule × pct. Km Uber = km « En ligne » (recommandation Revenu Québec).
- Lyft net mensuel = taxable + primes + pourboires − frais.
- Bénéfice global = bénéfice locatif net − déduction véhicule Uber − déduction véhicule Lyft.
- Multi-année : chaque année fiscale a ses trajets, montants, relevés, réglages et checklist propres.
