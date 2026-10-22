import SwiftUI

/// L'écran qui couvre l'application quand le verrou est posé.
///
/// Il est volontairement vide de données : c'est aussi lui qu'iOS photographie
/// pour le sélecteur d'applications. Aucun montant, aucun nom, aucune adresse.
struct LockView: View {

    let lock: BiometricLock

    /// Ce que l'appareil sait faire, relu à chaque affichage : l'utilisateur
    /// peut avoir retiré Face ID dans les Réglages système entre-temps.
    @State private var disponibilite = BiometricLock.disponibilite()

    var body: some View {
        ZStack {
            AppConfig.Palette.background.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Image(systemName: disponibilite.utilisable ? "lock.fill" : disponibilite.icone)
                    .font(.system(size: 56))
                    .foregroundStyle(AppConfig.Palette.dark)

                VStack(spacing: 6) {
                    Text("Revenus et dépenses")
                        .font(.title2.weight(.semibold))
                    Text("Verrouillé")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                if let echec = lock.dernierEchec, !echec.isEmpty {
                    Text(echec)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                if case .aucune(let raison) = disponibilite {
                    // Cas du verrou devenu impossible : ni biométrie ni code
                    // d'appareil. Laisser l'écran sans issue serait enfermer
                    // l'utilisateur hors de ses propres données.
                    VStack(spacing: 12) {
                        Text(raison)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                        Button("Désactiver le verrou et continuer") {
                            AppSetup.verrouActif = false
                            lock.revenuAuPremierPlan()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(.horizontal, 32)
                } else {
                    Button {
                        Task { await lock.deverrouiller() }
                    } label: {
                        Label(libelleBouton, systemImage: disponibilite.icone)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(lock.etat == .enCours)
                    .padding(.horizontal, 48)
                }

                Spacer()
                Spacer()
            }
        }
        .task {
            disponibilite = BiometricLock.disponibilite()
            // Demander tout de suite : un verrou qui exige d'abord un appui
            // sur un bouton ajoute un geste sans ajouter de sécurité.
            if disponibilite.utilisable, lock.etat == .ferme {
                await lock.deverrouiller()
            }
        }
    }

    private var libelleBouton: String {
        switch disponibilite {
        case .faceID, .touchID, .opticID: "Déverrouiller avec \(disponibilite.libelle)"
        default: "Déverrouiller"
        }
    }
}
