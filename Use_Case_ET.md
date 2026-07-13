Besoin: 
Créé moi une application mobile (iOS) pour gérer mes dépenses en vue de préparer ma déclaration d'impôts 2026. 
J'ai un fichier excel "Calcul Deplacement.xls" qui me permet de faire le calcul de mes déplacements à mes différents logements locatifs (468 Rue Gélinas et 1090 Oscar-benoit). 
J'ai un autre fichier "Outil_Saisie_2025.html" que j'avais utilisé pour documenter les dépenses locatifs et de travail autonome (Uber et Lyft) en utilisant un seul véhicule (Outlander 2025)
Je veux pouvoir:  
- saisir mes dépenses de déplacement, la date et lieu du déplacement. Le calcul doit s'effectuer automatiquement basé sur les informations de calcul du fichier excel puis l'information stockée. 
- importer les rapports de fin d'année pdf de Uber et Lyft pour que les champs appropriés soient remplis (s'inspirer du fichier html)

Instructions: 
Toujours poser des questions pour clarifier le besoin et faire des suggestions. 
Toujours mettre à jour ce fichier avec les features implémentés et toute autre information pertinente au projet.

---

## Informations du projet

**Propriétaire:** Eric FEZEU  
**Domicile:** 505 rue du Muscat, Sainte-Marthe-sur-le-Lac, QC  
**Véhicule:** Mitsubishi Outlander 2025  
**Année fiscale cible:** 2026 (déclaration 2027)

### Propriétés locatives
- **1090 Oscar-Benoît**, Pointe-aux-Trembles, QC — Appartement, 3 colocataires (Salon / Ch.Princ / Ch.Bur)  
  Distance depuis domicile: **55,4 km** (aller simple)
- **468-470 Rue Gélinas**, Trois-Rivières, QC — Triplex (Logements 470 / 468 / 468A)  
  Distance depuis domicile: **165 km** (aller simple)

### Revenus rideshare
- **Uber** — relevé annuel PDF (totaux annuels uniquement)
- **Lyft** — relevés mensuels PDF (juillet à décembre 2025, à recommencer en 2026)

---

## Fichiers du projet

| Fichier | Rôle |
|---|---|
| `Outil_Saisie_2025.html` | Outil web de saisie pour l'année 2025 (référence) |
| `Calcul Deplacement.xlsx` | Feuille mensuelle de kilométrage (template Excel) |
| `build_2025.py` | Script Python qui génère le classeur Excel 2025 |
| `build_vehicles.py` | Script Python qui ajoute les onglets Uber/Lyft/Véhicule |
| `pwa_2026/index.html` | **PWA principale 2026** (application mobile iOS/Android) |
| `pwa_2026/manifest.json` | Manifest PWA (installable sur iPhone via Safari) |
| `pwa_2026/sw.js` | Service Worker (fonctionnement hors-ligne) |
| `FABLE5_iOS_PROMPT.md` | Spécification complète utilisée pour générer l'app iOS native |
| `ios_2026/` | **App iOS native (SwiftUI)** — projet Xcode complet et compilable |

---

## Features implémentées — PWA 2026 (`pwa_2026/`)

### ✅ Architecture PWA
- Progressive Web App installable sur iPhone via Safari (Ajouter à l'écran d'accueil)
- Fonctionne hors-ligne grâce au Service Worker
- Sauvegarde automatique dans le localStorage du navigateur
- Export/import JSON pour sauvegardes

### ✅ Journal de déplacements
- Formulaire rapide sur l'écran d'accueil: date, propriété, km, motif, aller-retour
- Distances pré-configurées:
  - 1090 Oscar Benoît = **55,4 km** (aller) → 110,8 km aller-retour
  - 470 Rue Gélinas = **165 km** (aller) → 330 km aller-retour
- Bascule aller-retour (double la distance automatiquement)
- Calcul automatique du montant ($) au taux configuré (défaut: 0,72 $/km pour 2026)
- Vue mensuelle des trajets avec filtrage par mois et par propriété
- Suppression de trajets
- La ligne "Frais de déplacement" dans les dépenses locatives est **auto-calculée** depuis le journal

### ✅ Logements (onglet Logements)
- Sub-onglets: 1090 Oscar Benoît | 470 Rue Gélinas
- Navigation mois par mois (Janvier à Décembre)
- Vue mensuelle: saisie par catégorie pour le mois sélectionné
- Vue annuelle: tableau récapitulatif avec totaux par catégorie
- Sections: Revenus / Dépenses déductibles / Dépenses en capital
- Net mensuel affiché en temps réel

### ✅ Rideshare (onglet Rideshare)
- **Uber**: saisie de tous les champs du relevé annuel PDF (tarifs, frais, TPS/TVQ, km)
- **Lyft**: saisie mensuelle (base taxable, primes, pourboires, frais, km, courses)
- **Véhicule (Commun)**: 10 catégories de dépenses, répartition automatique Uber/Lyft au prorata des km

### ✅ Sommaire fiscal (onglet Sommaire)
- Résumé global: revenus, dépenses, bénéfice net
- Tableau détaillé par source (1090, 470, Uber, Lyft)
- Export CSV
- Export/Import JSON (sauvegarde/restauration complète)

### ✅ Réglages
- Taux kilométrique configurable (défaut 0,72 $/km)
- Km total annuel du véhicule
- Modèle du véhicule
- **Clé API Google Maps** (optionnel): permet le calcul de distance pour des destinations personnalisées

### ✅ Intégration Google Maps
- Distances pré-configurées pour les 2 propriétés (sans clé API)
- Si clé API configurée: calcul de distance en temps réel pour toute adresse personnalisée
- Appel via l'API Distance Matrix JavaScript de Google

---

## Comment installer la PWA sur iPhone

1. Ouvrir `pwa_2026/index.html` via un serveur local ou Safari
2. Appuyer sur le bouton Partager ↑
3. Sélectionner "Ajouter à l'écran d'accueil"
4. L'app apparaît comme une app native

**Pour servir localement:** `cd pwa_2026 && python3 -m http.server 8080` puis ouvrir `http://localhost:8080` sur Safari.

---

### ✅ Import PDF Uber / Lyft
- Bouton **"📥 Importer le relevé annuel PDF Uber"** dans l'onglet Rideshare → Uber
- Bouton **"📥 Importer le relevé mensuel PDF Lyft"** dans l'onglet Rideshare → Lyft
- Extraction automatique du texte via **PDF.js** (chargé depuis CDN, nécessite internet)
- Détection des montants dans les deux formats (anglais `1,234.56` et français `1 234,56`)
- Feuille de révision : champs détectés surlignés en bleu, modifiables avant application
- Patterns reconnus pour les deux langues (EN/FR) des PDFs Uber et Lyft Canada
- Fallback : si aucune donnée détectée, saisie manuelle dans la feuille avant d'appliquer

---

## Features implémentées — App iOS native (`ios_2026/`) — 2026-07-12

### ✅ Application iOS native SwiftUI (remplace à terme la PWA)
- Projet Xcode complet (`ios_2026/RevenusDepenses.xcodeproj`), iOS 17+, **compilation vérifiée sans erreur** (simulateur iPhone 15 Pro)
- **SwiftData** pour la persistance locale + **CloudKit** (synchro iCloud optionnelle, repli local automatique sans compte)
- 5 onglets : Accueil (cartes résumé + ajout rapide de trajet), Trajets (journal mensuel groupé par propriété), Logements (saisie mensuelle/annuelle, 3 sections, frais de déplacement auto en lecture seule, notes + reçus photo compressés, montants récurrents), Rideshare (Uber annuel / Lyft mensuel / Véhicule avec proration km), Sommaire (résumé global, tableau par source, checklist 19 items avec progression)
- **MapKit** (MKDirections) pour le calcul de distance des destinations personnalisées — plus de clé Google Maps
- **Import PDF Uber/Lyft** via PDFKit : libellés bilingues FR/EN, formats numériques `1 234,56` et `1,234.56`, écran de révision (champs détectés surlignés) avant application
- **Exports** : rapport PDF comptable (UIGraphicsPDFRenderer), CSV (BOM UTF-8, séparateur `;`), sauvegarde/restauration JSON complète
- Multi-année fiscale : sélecteur dans le header, chaque année isolée (trajets, montants, relevés, réglages, checklist)
- Réglages : taux $/km, km annuel véhicule, modèle, statut iCloud, effacement de l'année avec confirmation
- Toutes les formules reprises à l'identique de la PWA (proration `km plateforme / km total`, net Lyft, bénéfice global)
- Voir `ios_2026/README.md` pour l'ouverture dans Xcode, l'activation CloudKit et les étapes manuelles restantes (icône, signature)

### ✅ Rapport PDF comptable restructuré (2026-07-13)
- **Aligné sur les formulaires fiscaux** : T776/TP-128 (locatif) et T2125/TP-80 (travail autonome), avec numéros de ligne officiels (8141 loyers bruts, 8690 assurances, 9180 impôts fonciers, 9949 total dépenses, 9369/9946 revenu net…)
- **Copropriété** : % de participation et nom du copropriétaire par immeuble (nouveaux réglages, par année fiscale) ; le rapport calcule la part des copropriétaires et « votre part » (ligne 9946)
- **Véhicule** : les deux méthodes présentées (dépenses réelles au prorata des km ET taux fixe $/km) pour que le comptable choisisse la plus avantageuse
- **Sommaire TPS/TVQ** rideshare : perçues des passagers, payées à Uber (CTI/RTI), versées par Uber au nom du chauffeur
- **Annexe A** — journal de kilométrage détaillé (chaque trajet + sous-totaux mensuels), registre exigé en cas de vérification
- **Annexe B** — détail mensuel par immeuble (tableaux 6 mois × catégories, 2 semestres)
- **Annexe C** — notes et photos de reçus intégrées au PDF
- Outil de dev : `DebugPDFSmokeTest.swift` (DEBUG + variable d'env `PDF_SMOKE_TEST=1`) sème des données d'exemple et écrit le PDF dans Documents pour inspection

### ✅ Correctifs UI (2026-07-13)
- Sélecteur de mois (◀ ▶) réparé dans Logements/Trajets/Rideshare : les deux chevrons se déclenchaient ensemble dans les List (ajout `.buttonStyle(.borderless)`)
- Bouton « Montants récurrents » déplacé de la barre du bas (masquée par la barre d'onglets) vers la liste, sous le sélecteur de mois

### ✅ Assistant de configuration + modules + mode sombre — iOS **et** PWA (2026-07-13)
- **Assistant au premier lancement** (relançable depuis Réglages) : questions pour le comptable —
  modules à suivre (déplacements / logements / Uber-Lyft), véhicule (marque-modèle, taux $/km, km annuel),
  immeubles (suivi oui/non, nom affiché, % de propriété, copropriétaire), thème. Bouton « Plus tard » = aucun changement.
- **Modules** : seuls les onglets choisis sont affichés (ex. journal km seul → Accueil + Trajets + Sommaire).
  Masquer un module cache ses onglets/cartes/sections et l'exclut des exports PDF/CSV **sans effacer les données**.
- **Mode clair / sombre / automatique** dans Réglages (iOS : `preferredColorScheme` ; PWA : classe `theme-dark` + variables CSS).
- iOS : `Models/AppSetup.swift` (UserDefaults, séparé des données SwiftData) + `Views/OnboardingView.swift` ;
  PWA : clé localStorage `depenses_setup`, **jamais synchronisée vers Firestore** → aucun risque pour les données Firebase.
- **Rollback** : dépôt git initialisé à la racine du projet. Revenir à l'état d'avant ces changements :
  `git checkout cbb35df -- ios_2026 pwa_2026` (ou `git revert` des commits suivants). Les données (localStorage, Firestore, SwiftData) ne sont pas dans git et ne sont jamais touchées par un rollback de code.

---

## À faire / prochaines étapes

- [ ] iOS : icône d'app 1024×1024 + équipe de signature + activation capability iCloud/CloudKit dans Xcode
- [ ] iOS : tester l'import PDF avec les vrais relevés Uber/Lyft 2026 (ajuster les libellés du parser au besoin)
- [ ] Icônes PNG natives pour la PWA (192×192 et 512×512)
- [ ] Notifications/rappels pour saisie mensuelle
- [ ] Partage de données entre desktop (HTML 2025) et PWA (migration des données 2025→2026)