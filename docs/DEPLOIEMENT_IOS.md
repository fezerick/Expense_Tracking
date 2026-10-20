# Déployer l'app iOS sur l'App Store — guide pas à pas

> Rédigé le 20 octobre 2026 pour `ios_2026/RevenusDepenses.xcodeproj`.
> Vous n'avez pas encore de compte Apple Developer : ce guide part de là.
> Les étapes 0 à 3 sont faisables **dès aujourd'hui, sans payer**.

---

## Où en est le projet

Ce qui est déjà en place dans le projet Xcode :

| Réglage | Valeur |
|---|---|
| Identifiant de l'app (bundle id) | `com.ericfezeu.revenusdepenses` |
| Équipe de développement | `ST3SMTP2L5` (déjà renseignée) |
| Cible minimale | iOS 17.0 |
| Appareils | iPhone **et iPad** (`TARGETED_DEVICE_FAMILY = 1,2`) |
| Version / build | `1.0` / `1` |
| Nom affiché | « Revenus & Dépenses » |
| Autorisations déclarées | appareil photo, photothèque (textes en français déjà écrits) |
| Synchronisation iCloud | **désactivée** (`AppConfig.iCloudCapabilityEnabled = false`) — stockage local uniquement |

Trois choses **bloqueront** la soumission si elles ne sont pas réglées d'abord.
Elles sont traitées à l'étape 4.

1. **L'icône de l'app est absente.** `Assets.xcassets/AppIcon.appiconset` déclare
   l'emplacement 1024 × 1024 mais ne contient aucune image. Une archive sans icône
   est refusée à la validation.
2. **L'app cible l'iPad** : Apple exigera donc aussi des captures d'écran d'iPad.
   Le plus simple est de limiter l'app à l'iPhone (voir 4.3).
3. **Une URL de politique de confidentialité est obligatoire**, même pour une app
   qui ne collecte rien.

---

## Étape 0 — Prérequis (gratuit)

- Un Mac avec **Xcode 16 ou plus récent** (le projet est en `objectVersion 77`).
- Un **identifiant Apple** avec l'**authentification à deux facteurs activée** :
  c'est obligatoire pour l'inscription.
- Un iPhone sous iOS 17 ou plus, pour tester.

**Sans payer un sou, vous pouvez déjà** installer l'app sur votre propre iPhone :
branchez-le, sélectionnez-le comme destination dans Xcode, et dans *Signing &
Capabilities* choisissez votre identifiant Apple personnel comme équipe. Xcode
génère un profil gratuit. Deux limites : l'app **expire au bout de 7 jours** (il
faut la réinstaller) et vous ne pouvez pas la distribuer. C'est néanmoins la façon
de valider l'app sur un vrai appareil avant de payer.

---

## Étape 1 — S'inscrire à l'Apple Developer Program

1. Aller sur <https://developer.apple.com/programs/enroll/>.
2. Choisir le type d'inscription :
   - **Particulier (individual)** — recommandé ici : immédiat, aucune pièce
     d'entreprise à fournir. L'app sera publiée **sous votre nom légal**, qui
     sera visible publiquement sur la fiche App Store.
   - **Organisation** — exige un **numéro D-U-N-S**, une entité légalement
     enregistrée et un délai supplémentaire. À ne choisir que si vous voulez que
     l'app paraisse sous un nom commercial.
3. Payer **99 USD par année** (environ 139 CAD, renouvellement automatique).
   *C'est une dépense d'entreprise déductible : conservez la facture Apple.*
4. Vérification d'identité : comptez de **24 à 48 heures**, parfois plus. Apple
   peut demander une pièce d'identité.

> Si vous visez une publication à une date précise, inscrivez-vous **au moins
> deux semaines avant** : l'inscription, puis la première revue, prennent chacune
> quelques jours.

---

## Étape 2 — Accepter les contrats et renseigner la fiscalité

Dans **App Store Connect** (<https://appstoreconnect.apple.com>) → *Entreprise*
(*Business*) :

1. Accepter le **Paid Applications Agreement** si vous pensez un jour vendre
   l'app ou proposer des achats intégrés. Pour une app **gratuite**, le contrat
   gratuit suffit et est déjà accepté par l'inscription.
2. Pour une app gratuite, aucun formulaire fiscal n'est requis. Si vous passez un
   jour au payant : formulaire **W-8BEN** (traité Canada–États-Unis) et
   coordonnées bancaires.

---

## Étape 3 — Enregistrer l'identifiant et créer la fiche

### 3.1 Identifiant d'app

<https://developer.apple.com/account/resources/identifiers/list> → **+** →
*App IDs* → *App* :

- Description : `Revenus et Depenses`
- Bundle ID : **Explicit** → `com.ericfezeu.revenusdepenses` (exactement la valeur
  du projet)
- Capabilities : **n'en cocher aucune**. L'app ne synchronise rien ; le fichier
  `RevenusDepenses.entitlements` est volontairement vide. Si vous activez un jour
  iCloud (voir annexe A), il faudra cocher *iCloud* ici **et** mettre
  `AppConfig.iCloudCapabilityEnabled = true`.

### 3.2 Fiche App Store Connect

<https://appstoreconnect.apple.com/apps> → **+** → *Nouvelle app* :

- Plateforme : **iOS**
- Nom : `Revenus & Dépenses` — **doit être unique dans tout l'App Store**. S'il
  est pris, essayez `Revenus & Dépenses 2026` ou `Loyers & Kilomètres`.
- Langue principale : **Français (Canada)**
- Bundle ID : celui créé en 3.1
- SKU : un code interne libre, par exemple `REVDEP-2026`
- Accès utilisateur : *Accès complet*

---

## Étape 4 — Préparer le projet (à faire avant d'archiver)

### 4.1 Créer l'icône — obligatoire

Il faut **un seul fichier PNG de 1024 × 1024**, sans transparence, sans coins
arrondis (Apple les arrondit lui-même), en sRGB.

1. Produire le PNG (n'importe quel outil graphique ; reprenez les couleurs de
   `pwa_2026/manifest.json` pour rester cohérent avec la PWA).
2. Dans Xcode : ouvrir `Assets.xcassets` → `AppIcon` → glisser le fichier dans
   l'emplacement **1024 pt**.
3. Vérifier qu'il apparaît bien dans `AppIcon.appiconset/` à côté de
   `Contents.json`, et que ce dernier contient maintenant un `"filename"`.

### 4.2 Version et numéro de build

- `MARKETING_VERSION` = `1.0` (ce que voit le public).
- `CURRENT_PROJECT_VERSION` = `1`, **à incrémenter à chaque envoi**. Un numéro de
  build déjà utilisé est refusé, même si l'envoi précédent a échoué.

### 4.3 iPhone seulement (recommandé)

Dans les réglages de la cible → *General* → *Supported Destinations*, retirer
**iPad**, ou mettre `TARGETED_DEVICE_FAMILY = 1`. Sinon Apple exige en plus des
captures d'écran d'iPad 13 pouces, et refusera la fiche sans elles.

### 4.4 Signature

Cible → *Signing & Capabilities* :

- **Automatically manage signing** : coché.
- *Team* : votre équipe (`ST3SMTP2L5`) une fois l'inscription validée.
- Vérifier qu'aucun avertissement de signature ne subsiste.

### 4.5 Chiffrement (déclaration d'export)

L'app n'utilise aucun chiffrement propre. Ajoutez la clé suivante aux réglages de
build pour ne plus avoir la question à chaque envoi :
`INFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO`.

### 4.6 Dernier test

- Lancer sur un **iPhone réel**, pas seulement le simulateur.
- Exercer les chemins qui touchent aux autorisations : photographier un reçu,
  choisir une photo, exporter un PDF, exporter un CSV, importer une sauvegarde.
- Passer `Product → Analyze` et corriger les avertissements.

---

## Étape 5 — Archiver et envoyer

### Par Xcode (le plus simple)

1. Destination : **Any iOS Device (arm64)** — pas un simulateur.
2. `Product → Archive`.
3. Dans l'*Organizer* qui s'ouvre : *Distribute App* → **App Store Connect** →
   *Upload* → laisser les options par défaut (*Upload your app's symbols* coché).
4. L'envoi dure quelques minutes. Le traitement côté Apple en prend 15 à 60 de
   plus ; vous recevez un courriel quand le build est prêt dans TestFlight.

### En ligne de commande (pour automatiser plus tard)

```bash
cd ios_2026
xcodebuild -scheme RevenusDepenses -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/RevenusDepenses.xcarchive archive

xcodebuild -exportArchive \
  -archivePath build/RevenusDepenses.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/export
```

`ExportOptions.plist` minimal :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>ST3SMTP2L5</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
```

Puis l'envoi, avec une **clé API App Store Connect** (créée dans *Utilisateurs et
accès → Intégrations → Clés*, rôle *App Manager*, fichier `.p8` à conserver : il
n'est téléchargeable qu'une fois) :

```bash
xcrun altool --upload-app -f build/export/RevenusDepenses.ipa -t ios \
  --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>
```

---

## Étape 6 — TestFlight (votre propre appareil, sans revue)

Dès que le build est traité : App Store Connect → *TestFlight* → *Tests internes*
→ créer un groupe → vous ajouter comme testeur. Installez **TestFlight** sur votre
iPhone et l'app arrive en quelques minutes.

- Les tests **internes** (jusqu'à 100 personnes de votre équipe) **ne passent pas
  en revue**. C'est la vraie façon d'utiliser l'app au quotidien sans attendre
  l'App Store.
- Les tests **externes** (jusqu'à 10 000 personnes) exigent une revue, plus légère
  que celle de l'App Store.
- Un build TestFlight expire au bout de **90 jours**.

> Si votre seul objectif est d'utiliser l'app vous-même, **vous pouvez vous
> arrêter ici** : TestFlight interne suffit, indéfiniment, en renvoyant un build
> tous les 90 jours.

---

## Étape 7 — Remplir la fiche App Store

Dans la fiche de l'app, section *Distribution* :

**Captures d'écran** — obligatoires, prises sur simulateur (`⌘S` dans le
simulateur) :

- iPhone 6,9 pouces (iPhone 16 Pro Max / 17 Pro Max) : 1320 × 2868
- iPhone 6,5 pouces (iPhone 11 Pro Max) : 1242 × 2688
- 3 à 10 captures par taille. Montrez l'accueil, un immeuble, le sommaire fiscal
  et le rapport PDF.

**Textes**

- *Promotional text* (170 caractères, modifiable sans nouvelle revue).
- *Description* : à quoi sert l'app, pour qui, ce qu'elle calcule. Évitez toute
  promesse de conformité fiscale.
- *Mots-clés* (100 caractères) : `impôt,locatif,loyer,kilométrage,Uber,dépenses,T776,Québec`
- *URL de support* : **obligatoire**. Une page simple suffit (la PWA est déjà
  hébergée sur Firebase Hosting : ajoutez-y une page `/support`).
- *URL de politique de confidentialité* : **obligatoire**. Même contenu minimal :
  « l'application conserve toutes les données sur l'appareil, n'envoie rien à un
  serveur, ne contient ni publicité ni outil de mesure d'audience ».

**Confidentialité de l'app** (questionnaire *App Privacy*)

L'app iOS stocke tout localement et ne contacte aucun serveur : répondez
**« Aucune donnée collectée »** (*Data Not Collected*). Attention : cette réponse
cesse d'être vraie le jour où vous activez iCloud ou une synchronisation.

**Divers**

- Catégorie principale : **Finance**
- Classement par âge : **4+**
- Droits de contenu : aucun contenu de tiers
- Prix : **Gratuit**
- Diffusion : *Publier automatiquement* ou *Publier manuellement*

---

## Étape 8 — Soumettre, puis répondre à la revue

1. Sélectionner le build, puis *Ajouter pour examen* → *Soumettre*.
2. Délai habituel : **24 à 48 heures**.
3. Les refus arrivent dans App Store Connect → *Résolution Center*. Répondez dans
   le fil ; corriger, renvoyer un build avec un numéro supérieur, et resoumettre.

Causes de refus les plus fréquentes pour une app de ce type :

| Règle | Ce qui la déclenche | Prévention |
|---|---|---|
| 2.1 — *App Completeness* | plantage à l'ouverture, écran vide, fonction inachevée | tester sur un appareil réel, pas seulement le simulateur |
| 4.2 — *Minimum Functionality* | app jugée trop proche d'un simple site web | mettre en avant ce qui est natif : appareil photo, PDF, partage de fichiers |
| 5.1.1 — *Data Collection and Storage* | autorisation demandée sans justification claire | les textes d'autorisation sont déjà explicites ; ne pas demander d'accès inutile |
| 2.3 — *Accurate Metadata* | captures qui ne correspondent pas à l'app | refaire les captures à chaque refonte visuelle |
| — | URL de confidentialité manquante ou inaccessible | publier la page **avant** de soumettre |

---

## Étape 9 — Après la publication

- Chaque mise à jour : incrémenter `CURRENT_PROJECT_VERSION`, archiver, envoyer,
  soumettre. Les mises à jour sont revues plus vite que la première version.
- *Phased release* : diffusion progressive sur 7 jours, avec possibilité de
  suspendre.
- L'inscription se **renouvelle chaque année** : si vous ne payez pas, l'app est
  retirée de l'App Store.
- Pensez à garder la PWA et l'app iOS cohérentes : la PWA reste la référence
  fonctionnelle (voir [ARCHITECTURE.md](ARCHITECTURE.md)).

---

## Annexe A — Activer la synchronisation iCloud (optionnel)

Le projet est prêt pour CloudKit mais la fonction est **éteinte** :

1. `AppConfig.iCloudCapabilityEnabled = true`
2. Xcode → *Signing & Capabilities* → **+ Capability** → *iCloud* → cocher
   **CloudKit** → conteneur `iCloud.com.ericfezeu.revenusdepenses` (le fichier
   `.entitlements`, vide aujourd'hui, se remplit tout seul).
3. Cocher *iCloud* sur l'App ID dans le portail développeur.
4. **Reprendre le questionnaire de confidentialité** : les données quittent
   désormais l'appareil, même si elles restent dans le compte iCloud de
   l'utilisateur.

Sans ces quatre étapes, `ModelContainer` échoue sur CloudKit et retombe
silencieusement en stockage local — c'est le comportement voulu, pas un bug.

## Annexe B — Récapitulatif

| | Étape | Bloquant ? |
|---|---|---|
| ☐ | Icône 1024 × 1024 ajoutée à `AppIcon` | **oui** |
| ☐ | iPad retiré des destinations (ou captures iPad prêtes) | **oui** |
| ☐ | Page de politique de confidentialité en ligne | **oui** |
| ☐ | Page de support en ligne | **oui** |
| ☐ | Inscription Apple Developer validée (99 USD/an) | **oui** |
| ☐ | App ID `com.ericfezeu.revenusdepenses` enregistré | **oui** |
| ☐ | Fiche créée dans App Store Connect | **oui** |
| ☐ | `ITSAppUsesNonExemptEncryption = NO` | non, mais évite une question |
| ☐ | Build envoyé et visible dans TestFlight | **oui** |
| ☐ | Captures 6,9" et 6,5" | **oui** |
| ☐ | Questionnaire de confidentialité : aucune donnée collectée | **oui** |
| ☐ | Soumis pour examen | — |
