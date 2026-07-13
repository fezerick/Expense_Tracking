import SwiftUI
import SwiftData

/// Assistant de configuration au premier lancement (relançable depuis Réglages).
/// Pose les questions dont le comptable a besoin (véhicule, immeubles, % de propriété…)
/// et n'affiche ensuite que les modules dont l'utilisateur a besoin.
/// Ne touche jamais aux montants déjà saisis : il masque/affiche des sections.
struct OnboardingView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    private var data: DataService { DataService(context: context, year: year) }

    // MARK: - Réponses

    @State private var wantsTrips = true
    @State private var wantsProperties = true
    @State private var wantsRideshare = true

    @State private var vehicleModel = AppConfig.defaultVehicleModel
    @State private var kmRate = AppConfig.defaultKmRate
    @State private var vehicleKm = AppConfig.defaultVehicleTotalKm

    @State private var propEnabled: [String: Bool] = [:]
    @State private var propNames: [String: String] = [:]
    @State private var propPcts: [String: Double] = [:]
    @State private var propCoOwners: [String: String] = [:]

    @State private var appearanceRaw = AppSetup.Appearance.system.rawValue

    @State private var stepIndex = 0
    @State private var loaded = false

    // MARK: - Étapes

    private enum Step {
        case modules, vehicle, properties, final
    }

    private var steps: [Step] {
        var list: [Step] = [.modules]
        if wantsTrips || wantsRideshare { list.append(.vehicle) }
        if wantsProperties { list.append(.properties) }
        list.append(.final)
        return list
    }

    private var step: Step { steps[min(stepIndex, steps.count - 1)] }
    private var isLastStep: Bool { stepIndex >= steps.count - 1 }

    var body: some View {
        NavigationStack {
            Form {
                switch step {
                case .modules: modulesStep
                case .vehicle: vehicleStep
                case .properties: propertiesStep
                case .final: finalStep
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if stepIndex > 0 {
                        Button("Précédent") { stepIndex -= 1 }
                    } else {
                        Button("Plus tard") {
                            // Ferme sans rien changer : tout reste comme avant.
                            AppSetup.onboardingDone = true
                            dismiss()
                        }
                    }
                }
            }
            .safeAreaInset(edge: .bottom) { footer }
        }
        .interactiveDismissDisabled()
        .onAppear(perform: prefill)
    }

    private var title: String {
        switch step {
        case .modules: "Configuration"
        case .vehicle: "Votre véhicule"
        case .properties: "Vos immeubles"
        case .final: "Apparence et résumé"
        }
    }

    // MARK: - Étape 1 : modules

    private var modulesStep: some View {
        Group {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Bienvenue 👋")
                        .font(.title2.bold())
                    Text("Quelques questions pour préparer ce que votre comptable aura besoin et n'afficher que les modules utiles. Vous pourrez changer ces réponses à tout moment dans Réglages.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section {
                moduleToggle(isOn: $wantsTrips, icon: "car.fill",
                             title: "Déplacements en véhicule",
                             detail: "Journal de kilométrage avec montant automatique ($/km) — registre exigé par l'ARC et Revenu Québec.")
                moduleToggle(isOn: $wantsProperties, icon: "building.2.fill",
                             title: "Logements locatifs",
                             detail: "Revenus et dépenses par immeuble pour le formulaire T776 / TP-128.")
                moduleToggle(isOn: $wantsRideshare, icon: "car.2.fill",
                             title: "Travail autonome Uber / Lyft",
                             detail: "Relevés Uber/Lyft, dépenses du véhicule et TPS/TVQ pour le T2125 / TP-80.")
            } header: {
                Text("Que souhaitez-vous suivre ?")
            } footer: {
                Text("Seuls les onglets des modules choisis seront affichés. Les données déjà saisies sont conservées même si un module est masqué.")
            }
        }
    }

    private func moduleToggle(isOn: Binding<Bool>, icon: String, title: String, detail: String) -> some View {
        Toggle(isOn: isOn) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .foregroundStyle(AppConfig.Palette.blue)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.bold())
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Étape 2 : véhicule

    private var vehicleStep: some View {
        Group {
            Section {
                HStack {
                    Text("Marque et modèle").font(.subheadline)
                    Spacer()
                    TextField("Ex. Mitsubishi Outlander 2025", text: $vehicleModel)
                        .multilineTextAlignment(.trailing)
                        .font(.subheadline)
                }
                CurrencyField(title: "Taux kilométrique ($/km)", value: $kmRate)
                NumberField(title: "Km total estimé pour l'année", value: $vehicleKm, unit: "km")
            } header: {
                Text("Véhicule utilisé")
            } footer: {
                Text("Le taux prescrit 2026 est de \(AppConfig.currency(AppConfig.defaultKmRate))/km. Le km annuel sert à répartir les dépenses du véhicule entre Uber, Lyft et le locatif.")
            }
        }
    }

    // MARK: - Étape 3 : immeubles

    private var propertiesStep: some View {
        ForEach(AppConfig.properties) { prop in
            Section {
                Toggle("Suivre cet immeuble", isOn: enabledBinding(prop.id))
                if propEnabled[prop.id] ?? true {
                    HStack {
                        Text("Nom affiché").font(.subheadline)
                        Spacer()
                        TextField(prop.name, text: nameBinding(prop.id, default: prop.name))
                            .multilineTextAlignment(.trailing)
                            .font(.subheadline)
                    }
                    NumberField(title: "Votre % de propriété",
                                value: Binding(
                                    get: { propPcts[prop.id] ?? 100 },
                                    set: { propPcts[prop.id] = min(100, max(0, $0)) }
                                ),
                                unit: "%")
                    HStack {
                        Text("Copropriétaire").font(.subheadline)
                        Spacer()
                        TextField("Nom (vide si aucun)", text: coOwnerBinding(prop.id))
                            .multilineTextAlignment(.trailing)
                            .font(.subheadline)
                    }
                }
            } header: {
                Text(prop.name)
            } footer: {
                Text("Unités : \(prop.revenueCategories.joined(separator: ", ")). Le % de propriété et le copropriétaire figurent sur le T776 / TP-128.")
            }
        }
    }

    private func enabledBinding(_ id: String) -> Binding<Bool> {
        Binding(get: { propEnabled[id] ?? true }, set: { propEnabled[id] = $0 })
    }

    private func nameBinding(_ id: String, default def: String) -> Binding<String> {
        Binding(get: { propNames[id] ?? def }, set: { propNames[id] = $0 })
    }

    private func coOwnerBinding(_ id: String) -> Binding<String> {
        Binding(get: { propCoOwners[id] ?? "" }, set: { propCoOwners[id] = $0 })
    }

    // MARK: - Étape 4 : apparence + résumé

    private var finalStep: some View {
        Group {
            Section("Apparence") {
                Picker("Thème", selection: $appearanceRaw) {
                    ForEach(AppSetup.Appearance.allCases) { appearance in
                        Label(appearance.label, systemImage: appearance.icon)
                            .tag(appearance.rawValue)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            Section("Résumé de votre configuration") {
                summaryRow(icon: "car.fill", label: "Déplacements",
                           value: wantsTrips ? "Activé" : "Masqué")
                summaryRow(icon: "building.2.fill", label: "Logements locatifs",
                           value: activePropertySummary)
                summaryRow(icon: "car.2.fill", label: "Uber / Lyft",
                           value: wantsRideshare ? "Activé" : "Masqué")
                if wantsTrips || wantsRideshare {
                    summaryRow(icon: "gauge.with.needle", label: "Véhicule",
                               value: "\(vehicleModel) — \(AppConfig.currency(kmRate))/km")
                }
            }
        }
    }

    private var activePropertySummary: String {
        guard wantsProperties else { return "Masqué" }
        let names = AppConfig.properties
            .filter { propEnabled[$0.id] ?? true }
            .map { propNames[$0.id]?.isEmpty == false ? propNames[$0.id]! : $0.name }
        return names.isEmpty ? "Aucun immeuble" : names.joined(separator: " • ")
    }

    private func summaryRow(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .top) {
            Label(label, systemImage: icon)
                .font(.subheadline)
            Spacer()
            Text(value)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }

    // MARK: - Pied de page (progression + bouton)

    private var footer: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                ForEach(0..<steps.count, id: \.self) { i in
                    Circle()
                        .fill(i == stepIndex ? AppConfig.Palette.blue : Color.secondary.opacity(0.3))
                        .frame(width: 7, height: 7)
                }
            }
            Button {
                if isLastStep {
                    finish()
                } else {
                    stepIndex += 1
                }
            } label: {
                Text(isLastStep ? "Commencer" : "Continuer")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppConfig.Palette.blue)
        }
        .padding()
        .background(.bar)
    }

    // MARK: - Chargement / sauvegarde

    /// Pré-remplit avec la configuration actuelle (utilisateur existant).
    private func prefill() {
        guard !loaded else { return }
        loaded = true
        wantsTrips = AppSetup.moduleTrips
        wantsProperties = AppSetup.moduleProperties
        wantsRideshare = AppSetup.moduleRideshare
        appearanceRaw = UserDefaults.standard.string(forKey: AppSetup.Keys.appearance)
            ?? AppSetup.Appearance.system.rawValue

        let fy = data.ensureFiscalYear()
        vehicleModel = fy.vehicleModel
        kmRate = fy.kmRate
        vehicleKm = fy.vehicleTotalKm
        for prop in AppConfig.properties {
            propEnabled[prop.id] = AppSetup.propertyEnabled(prop.id)
            propNames[prop.id] = AppSetup.displayName(prop.id)
            propPcts[prop.id] = fy.ownershipPct(propertyId: prop.id)
            propCoOwners[prop.id] = fy.coOwner(propertyId: prop.id)
        }
    }

    private func finish() {
        AppSetup.moduleTrips = wantsTrips
        AppSetup.moduleProperties = wantsProperties
        AppSetup.moduleRideshare = wantsRideshare
        UserDefaults.standard.set(appearanceRaw, forKey: AppSetup.Keys.appearance)

        let fy = data.ensureFiscalYear()
        if wantsTrips || wantsRideshare {
            fy.vehicleModel = vehicleModel
            fy.kmRate = kmRate
            fy.vehicleTotalKm = vehicleKm
        }
        for prop in AppConfig.properties {
            AppSetup.setPropertyEnabled(prop.id, propEnabled[prop.id] ?? true)
            let name = propNames[prop.id] ?? ""
            AppSetup.setDisplayName(prop.id, name == prop.name ? "" : name)
            let pct = propPcts[prop.id] ?? 100
            let coOwner = propCoOwners[prop.id] ?? ""
            if prop.id == AppConfig.p470.id {
                fy.ownershipPct470 = pct
                fy.coOwner470 = coOwner
            } else {
                fy.ownershipPct1090 = pct
                fy.coOwner1090 = coOwner
            }
        }

        AppSetup.onboardingDone = true
        dismiss()
    }
}
