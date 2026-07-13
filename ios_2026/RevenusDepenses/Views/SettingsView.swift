import SwiftUI
import SwiftData

/// Réglages de l'année fiscale active + statut iCloud + effacement des données.
struct SettingsView: View {
    let year: Int
    let cloudKitEnabled: Bool

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @AppStorage("iCloudSyncPreference") private var syncPreferred = true

    @State private var showEraseConfirmation = false
    @State private var eraseDone = false

    private var data: DataService { DataService(context: context, year: year) }

    private var iCloudAccountAvailable: Bool {
        FileManager.default.ubiquityIdentityToken != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Année fiscale \(String(year))") {
                    CurrencyField(title: "Taux kilométrique ($/km)",
                                  value: Binding(
                                      get: { data.ensureFiscalYear().kmRate },
                                      set: { data.ensureFiscalYear().kmRate = $0 }
                                  ))
                    NumberField(title: "Km total annuel du véhicule",
                                value: Binding(
                                    get: { data.ensureFiscalYear().vehicleTotalKm },
                                    set: { data.ensureFiscalYear().vehicleTotalKm = $0 }
                                ),
                                unit: "km")
                    HStack {
                        Text("Modèle du véhicule")
                            .font(.subheadline)
                        Spacer()
                        TextField("Modèle", text: Binding(
                            get: { data.ensureFiscalYear().vehicleModel },
                            set: { data.ensureFiscalYear().vehicleModel = $0 }
                        ))
                        .multilineTextAlignment(.trailing)
                        .font(.subheadline)
                    }
                }

                Section("Synchronisation iCloud") {
                    HStack {
                        Image(systemName: cloudKitEnabled && iCloudAccountAvailable
                              ? "icloud.fill" : "icloud.slash.fill")
                            .foregroundStyle(cloudKitEnabled && iCloudAccountAvailable
                                             ? AppConfig.Palette.blue : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(cloudKitEnabled && iCloudAccountAvailable
                                 ? "Connecté — synchronisation active"
                                 : "Non connecté — données locales seulement")
                                .font(.subheadline)
                            Text(cloudKitEnabled
                                 ? "Les données se synchronisent automatiquement entre vos appareils via votre compte iCloud."
                                 : "Connectez-vous à iCloud dans Réglages iOS et activez la capability CloudKit pour synchroniser.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Toggle("Synchronisation automatique", isOn: $syncPreferred)
                        .disabled(!cloudKitEnabled)
                }

                Section {
                    ownershipRows(title: AppConfig.p1090.name,
                                  pct: Binding(
                                      get: { data.ensureFiscalYear().ownershipPct1090 },
                                      set: { data.ensureFiscalYear().ownershipPct1090 = min(100, max(0, $0)) }
                                  ),
                                  coOwner: Binding(
                                      get: { data.ensureFiscalYear().coOwner1090 },
                                      set: { data.ensureFiscalYear().coOwner1090 = $0 }
                                  ))
                    ownershipRows(title: AppConfig.p470.name,
                                  pct: Binding(
                                      get: { data.ensureFiscalYear().ownershipPct470 },
                                      set: { data.ensureFiscalYear().ownershipPct470 = min(100, max(0, $0)) }
                                  ),
                                  coOwner: Binding(
                                      get: { data.ensureFiscalYear().coOwner470 },
                                      set: { data.ensureFiscalYear().coOwner470 = $0 }
                                  ))
                } header: {
                    Text("Propriété des immeubles (T776)")
                } footer: {
                    Text("Votre pourcentage de participation et le nom du copropriétaire figurent sur le rapport PDF ; le comptable en a besoin pour le formulaire T776 / TP-128.")
                }

                Section("Profil") {
                    LabeledContent("Propriétaire", value: AppConfig.ownerName)
                    LabeledContent("Domicile", value: AppConfig.homeAddress)
                        .font(.subheadline)
                }

                Section {
                    Button(role: .destructive) {
                        showEraseConfirmation = true
                    } label: {
                        Label("Effacer toutes les données de \(String(year))", systemImage: "trash.fill")
                    }
                    if eraseDone {
                        Label("Données de \(String(year)) effacées.", systemImage: "checkmark.circle")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
            .confirmationDialog(
                "Effacer toutes les données de \(String(year)) ? Cette action est irréversible.",
                isPresented: $showEraseConfirmation,
                titleVisibility: .visible
            ) {
                Button("Effacer définitivement", role: .destructive) {
                    data.eraseYearData()
                    eraseDone = true
                }
                Button("Annuler", role: .cancel) {}
            }
        }
    }

    @ViewBuilder
    private func ownershipRows(title: String, pct: Binding<Double>, coOwner: Binding<String>) -> some View {
        NumberField(title: "\(title) — % de propriété", value: pct, unit: "%")
        HStack {
            Text("Copropriétaire")
                .font(.subheadline)
            Spacer()
            TextField("Nom (vide si aucun)", text: coOwner)
                .multilineTextAlignment(.trailing)
                .font(.subheadline)
        }
    }
}
