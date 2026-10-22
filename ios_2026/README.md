# Revenus & Dépenses — App iOS native (SwiftUI)

Application iOS native (iOS 17+) de préparation de la déclaration de revenus : immeubles locatifs, journal kilométrique, revenus Uber/Lyft avec proration des dépenses véhicule, exports comptables. Réécriture native de la PWA `pwa_2026/`.

## Ouvrir et lancer

1. Ouvrir `RevenusDepenses.xcodeproj` dans Xcode 16 ou plus récent.
2. Sélectionner un simulateur iPhone (ou votre appareil) et lancer (⌘R).

Le projet compile tel quel : vérifié le 22 octobre 2026 avec le SDK iOS 27.0, pour l'appareil (`-sdk iphoneos`) comme pour le simulateur (`-sdk iphonesimulator`), **BUILD SUCCEEDED et zéro avertissement**. (Une note antérieure signalait ici un conflit entre le catalogue d'assets et les runtimes simulateur installés ; il n'existe plus.)

**Le noyau de calcul se vérifie sans Xcode.** `RevenusDepenses/Core/` ne dépend que de Foundation — ni UIKit, ni SwiftData, ni état d'application — et rend les mêmes nombres que la PWA, vérifié par 94 assertions :

```bash
cd ..               # à la racine du dépôt
npm run parite      # compile le noyau pour macOS et rejoue la référence de la PWA
```

Le détail du mécanisme est au § 7 de [`../docs/PORTAGE_IOS.md`](../docs/PORTAGE_IOS.md).

## Architecture

```
RevenusDepenses/
├── App/
│   ├── RevenusDepensesApp.swift   # Entrée ; container SwiftData (CloudKit → repli local)
│   └── RootView.swift             # TabView 5 onglets ou LockView, sélecteur d'année, réglages
├── Core/                          # Noyau de calcul porté de la PWA — Foundation SEUL
│   ├── Socle.swift                # num, fmt, money, csvCell/csvLigne, anneeDe, shortLabel
│   ├── FiscalData.swift           # Paramètres fiscaux par année, 13 catégories de DPA
│   ├── TaxService.swift           # Assiettes, impôt fédéral + Québec, acomptes
│   ├── CCAService.swift           # DPA : pools, demi-taux, 1100(11), FNACC reportée
│   ├── Valeur.swift               # Arbre JSON avec la sémantique JS (ordre des clés,
│   │                              # undefined ≠ null, écriture canonique)
│   ├── SyncService.swift          # Fusion champ par champ entre appareils (= js/sync.js)
│   └── JournalService.swift       # Historique des modifications (= js/journal.js)
├── Models/
│   ├── AppConfig.swift            # Config centrale : propriétés, catégories, taux, couleurs
│   ├── AppSetup.swift             # Modules activés, thème, verrou (UserDefaults, local)
│   └── Models.swift               # FiscalYear, Trip, EntryAmount, UberValue, LyftMonth,
│                                  # VehicleExpense, ChecklistItem, TaxInputs, CapitalAsset
│                                  # (SwiftData, compatibles CloudKit)
├── Services/
│   ├── DataService.swift          # Accès données + TOUTES les formules de calcul
│   ├── DistanceService.swift      # Distance routière via MapKit (MKDirections)
│   ├── PDFStatementParser.swift   # Import relevés PDF Uber/Lyft (bilingue FR/EN, PDFKit)
│   ├── PDFReportGenerator.swift   # Rapport PDF comptable (UIGraphicsPDFRenderer)
│   ├── CSVExportService.swift     # Export CSV du sommaire
│   ├── BackupService.swift        # Sauvegarde / restauration JSON complète
│   └── BiometricLock.swift        # Verrou Face ID / Touch ID / code de l'appareil
├── Views/
│   ├── HomeView.swift             # Accueil : cartes résumé + formulaire rapide de trajet
│   ├── TripsView.swift            # Journal complet, par mois, groupé par propriété
│   ├── PropertiesView.swift       # Logements : saisie mensuelle/annuelle, reçus, récurrents
│   ├── RideshareView.swift        # Uber | Lyft | Véhicule (proration au prorata des km)
│   ├── SummaryView.swift          # Sommaire, exports PDF/CSV/JSON, checklist, liens fiscaux
│   ├── TaxView.swift              # Impôt : provision, taux marginal, acomptes (= js/impot.js)
│   ├── CCAView.swift              # DPA : catégories, registre des biens, arbitrage (= js/dpa.js)
│   ├── SettingsView.swift         # Taux $/km, km annuel, véhicule, iCloud, verrou, effacement
│   ├── LockView.swift             # Écran de verrouillage — vide de données, par principe
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
- `NSFaceIDUsageDescription` — déverrouiller l'app à l'ouverture. Déclarée dans **les deux**
  configurations de build : une clé posée dans une seule donne une app qui marche en Debug
  et plante en Release.
- MapKit ne requiert aucune permission pour le calcul d'itinéraire entre deux adresses.

## Reste à faire manuellement

- [ ] Icône d'app 1024×1024 dans `Assets.xcassets/AppIcon`.
- [ ] Choisir l'équipe de signature (provisioning) pour installer sur iPhone réel.
- [ ] Activer les capabilities iCloud/CloudKit (voir ci-dessus) pour la synchro.
- [ ] Tester l'import PDF avec vos vrais relevés Uber/Lyft 2026 et ajuster les libellés dans `PDFStatementParser.swift` si un champ n'est pas détecté.
- [ ] Écran de lancement personnalisé (optionnel — généré automatiquement pour l'instant).
- [ ] Widgets d'écran d'accueil (provision d'impôt, bénéfice net) — chantier D.2.
      Son préalable est levé : le calcul fiscal est porté et branché (2.9.0).
- [ ] `FirestoreSync` : lire le document distant, appeler `SyncService.fusionner`, écrire le
      résultat et poser les entrées de journal. **Tant que ce n'est pas fait, l'app iOS
      n'écrit pas dans `users/<uid>/years/<année>`** — le moteur de fusion existe (2.8.0),
      il n'est pas branché.

## Données et calculs (fidèles à la PWA)

- 1090 Oscar-Benoît : 55,4 km aller ; 470 Gélinas : 165 km aller ; aller-retour = ×2.
- `montant_trajet = km × taux` (défaut 0,72 $/km, réglable par année).
- « Frais de déplacement » dans les dépenses locatives = auto-calculé du journal (lecture seule).
- Proration véhicule : `pct = km plateforme / km total annuel` (0 si km total = 0) ; déduction = total dépenses véhicule × pct. Km Uber = km « En ligne » (recommandation Revenu Québec).
- Lyft net mensuel = taxable + primes + pourboires − frais.
- Bénéfice global = bénéfice locatif net − déduction véhicule Uber − déduction véhicule Lyft.
- Multi-année : chaque année fiscale a ses trajets, montants, relevés, réglages et checklist propres.
- Verrou d'ouverture (2.10.0) : `BiometricLock` demande `.deviceOwnerAuthentication`, qui
  retombe sur le code de l'appareil quand Face ID échoue — la variante biométrique seule
  enfermerait dehors. Le verrou se pose dès que l'app devient *inactive*, pour que la photo
  du sélecteur d'applications montre l'écran de verrouillage et non les montants, et
  `RootView` **remplace** le TabView par `LockView` au lieu de le recouvrir, sinon une
  feuille modale déjà ouverte resterait visible au-dessus. Le réglage est local à
  l'appareil (`UserDefaults`), comme le thème, et n'est pas synchronisé.
- Impôt estimé et acomptes : calculés par `Core/TaxService.swift`, à parité vérifiée avec
  `js/impot.js`. L'écran Impôt ne collecte que ce que l'app ne peut pas deviner — salaire,
  retenues à la source, case 26 du T4, acomptes versés.
- DPA : calculée par `Core/CCAService.swift` (pools par catégorie, classe distincte au-delà
  de 50 000 $, demi-taux et son suspens par l'IIA, plafond de l'art. 1100(11)). Le registre
  est annuel ; `assetId` est conservé d'une année à l'autre et c'est lui qui permet le
  report automatique de la FNACC. Ne pas le régénérer.
