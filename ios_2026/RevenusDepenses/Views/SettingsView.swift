import SwiftUI
import SwiftData

/// Réglages de l'année fiscale active + statut iCloud + effacement des données.
struct SettingsView: View {
    let year: Int
    let cloudKitEnabled: Bool
    let lock: BiometricLock

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @AppStorage("iCloudSyncPreference") private var syncPreferred = true
    @AppStorage(AppSetup.Keys.appearance) private var appearanceRaw = AppSetup.Appearance.system.rawValue
    @AppStorage(AppSetup.Keys.moduleTrips) private var moduleTrips = true
    @AppStorage(AppSetup.Keys.moduleProperties) private var moduleProperties = true
    @AppStorage(AppSetup.Keys.moduleRideshare) private var moduleRideshare = true
    @AppStorage(AppSetup.Keys.onboardingDone) private var onboardingDone = false
    @AppStorage(AppSetup.Keys.verrouActif) private var verrouActif = false
    @AppStorage(AppSetup.Keys.verrouDelaiMinutes) private var verrouDelaiMinutes = 0

    @Query(sort: [SortDescriptor(\RentalProperty.sortOrder), SortDescriptor(\RentalProperty.createdAt)])
    private var allProperties: [RentalProperty]

    @State private var showEraseConfirmation = false
    @State private var eraseDone = false
    @State private var editingDraft: PropertyDraft?
    @State private var addingProperty = false
    @State private var verrouDispo = BiometricLock.disponibilite()
    @State private var verrouErreur: String?

    private var data: DataService { DataService(context: context, year: year) }

    // MARK: - Verrou de l'application (chantier C.4)

    private var sectionVerrou: some View {
        Section {
            Toggle(isOn: Binding(get: { verrouActif }, set: { basculerVerrou($0) })) {
                Label("Verrouiller l'application", systemImage: verrouDispo.icone)
            }
            .disabled(!verrouDispo.utilisable)

            if verrouActif {
                Picker("Reverrouiller", selection: $verrouDelaiMinutes) {
                    ForEach(AppSetup.verrouDelaisOfferts, id: \.self) { minutes in
                        Text(AppSetup.verrouDelaiLabel(minutes)).tag(minutes)
                    }
                }
                Button {
                    lock.verrouiller()
                    dismiss()
                } label: {
                    Label("Verrouiller maintenant", systemImage: "lock.fill")
                }
            }

            if case .aucune(let raison) = verrouDispo {
                Text(raison)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let verrouErreur {
                Text(verrouErreur)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        } header: {
            Text("Verrou")
        } footer: {
            // Ce que le verrou fait, et ce qu'il ne fait pas. L'écrire ici
            // plutôt que de laisser croire à un chiffrement.
            Text("\(verrouDispo.utilisable ? "Demande \(verrouDispo.libelle) à l'ouverture de l'app" : "Indisponible") — pour que revenus, adresses et copropriétaires ne s'affichent pas sur un téléphone déjà déverrouillé. Le verrou ne chiffre rien de plus : vos données restent protégées par le chiffrement de l'appareil, comme avant.")
        }
    }

    private func basculerVerrou(_ vouluActif: Bool) {
        verrouErreur = nil
        verrouDispo = BiometricLock.disponibilite()
        guard verrouDispo.utilisable else {
            if case .aucune(let raison) = verrouDispo { verrouErreur = raison }
            return
        }
        Task {
            let reussi: Bool
            if vouluActif {
                // On exige l'authentification AVANT d'activer : sinon on
                // découvrirait que Face ID ne marche pas au moment précis où
                // il garde la porte.
                await lock.deverrouiller(raison: "Activer le verrou de l'application")
                reussi = lock.etat == .ouvert
                if reussi { verrouActif = true }
            } else {
                reussi = await lock.desactiverApresAuthentification()
                if reussi { verrouActif = false }
            }
            if !reussi {
                let echec = lock.dernierEchec ?? ""
                verrouErreur = echec.isEmpty
                    ? "Authentification annulée : le réglage n'a pas changé."
                    : echec
            }
        }
    }

    private var iCloudAccountAvailable: Bool {
        FileManager.default.ubiquityIdentityToken != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Thème", selection: $appearanceRaw) {
                        ForEach(AppSetup.Appearance.allCases) { appearance in
                            Label(appearance.label, systemImage: appearance.icon)
                                .tag(appearance.rawValue)
                        }
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Apparence")
                } footer: {
                    Text("« Automatique » suit le réglage clair/sombre de l'iPhone.")
                }

                Section {
                    Toggle(isOn: $moduleTrips) {
                        Label("Déplacements (journal km)", systemImage: "car.fill")
                    }
                    Toggle(isOn: $moduleProperties) {
                        Label("Logements locatifs", systemImage: "building.2.fill")
                    }
                    Toggle(isOn: $moduleRideshare) {
                        Label("Uber / Lyft (travail autonome)", systemImage: "car.2.fill")
                    }
                    Button {
                        onboardingDone = false
                        dismiss()
                    } label: {
                        Label("Relancer l'assistant de configuration", systemImage: "wand.and.stars")
                    }
                } header: {
                    Text("Modules affichés")
                } footer: {
                    Text("Masquer un module cache ses onglets et l'exclut du rapport PDF/CSV, sans effacer les données déjà saisies.")
                }

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

                sectionVerrou

                if moduleProperties {
                    Section {
                        ForEach(allProperties) { prop in
                            Button {
                                editingDraft = PropertyDraft.from(prop)
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: prop.kind.icon)
                                        .foregroundStyle(AppConfig.Palette.blue)
                                        .frame(width: 24)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(prop.name)
                                            .font(.subheadline.bold())
                                            .foregroundStyle(.primary)
                                        Text("\(prop.kind.label) · \(prop.revenueCategories.count) unité(s) · \(AppConfig.percent(prop.ownershipPct / 100))"
                                             + (prop.coOwners.isEmpty ? "" : " avec \(prop.coOwners)"))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                        }
                        Button {
                            addingProperty = true
                        } label: {
                            Label("Ajouter un immeuble", systemImage: "plus.circle.fill")
                        }
                    } header: {
                        Text("Immeubles (T776)")
                    } footer: {
                        Text("Type, unités, adresse, % de propriété et copropriétaires : ces informations figurent sur le rapport PDF pour le formulaire T776 / TP-128.")
                    }
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
            .sheet(item: $editingDraft) { draft in
                PropertyEditorSheet(draft: draft, isExisting: true)
            }
            .sheet(isPresented: $addingProperty) {
                PropertyEditorSheet(draft: PropertyDraft(), isExisting: false)
            }
        }
    }

}
