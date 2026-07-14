import SwiftUI
import SwiftData

/// Assistant de configuration au premier lancement (relançable depuis Réglages).
/// Étapes dynamiques : un module désactivé à l'étape 1 fait disparaître ses
/// questions. Pour les logements : nombre de propriétés, puis une page par
/// immeuble (type, unités/colocataires éditables, adresse, distance, % propriété).
/// Le résumé final est cliquable pour revenir corriger une section.
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

    @State private var drafts: [PropertyDraft] = []

    @State private var appearanceRaw = AppSetup.Appearance.system.rawValue

    @State private var stepIndex = 0
    @State private var loaded = false

    // MARK: - Étapes dynamiques

    private enum Step: Equatable {
        case modules
        case vehicle
        case propertyCount
        case property(Int)
        case final
    }

    private var steps: [Step] {
        var list: [Step] = [.modules]
        if wantsTrips || wantsRideshare { list.append(.vehicle) }
        if wantsProperties {
            list.append(.propertyCount)
            for i in drafts.indices { list.append(.property(i)) }
        }
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
                case .propertyCount: propertyCountStep
                case .property(let i): propertyStep(i)
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
        case .propertyCount: "Vos propriétés"
        case .property(let i): drafts.indices.contains(i) && !drafts[i].displayName.isEmpty
            ? drafts[i].displayName : "Propriété \(i + 1)"
        case .final: "Apparence et résumé"
        }
    }

    // MARK: - Étape : modules

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
                Text("Un module désactivé ne posera aucune question et ses onglets seront masqués. Les données déjà saisies sont conservées.")
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

    // MARK: - Étape : véhicule

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

    // MARK: - Étape : nombre de propriétés

    private var propertyCountStep: some View {
        Group {
            Section {
                Stepper(value: Binding(
                    get: { drafts.count },
                    set: { resizeDrafts(to: $0) }
                ), in: 1...10) {
                    HStack {
                        Text("Nombre de propriétés")
                            .font(.subheadline)
                        Spacer()
                        Text("\(drafts.count)")
                            .font(.title3.bold())
                            .foregroundStyle(AppConfig.Palette.blue)
                    }
                }
            } header: {
                Text("Combien de propriétés locatives possédez-vous ?")
            } footer: {
                Text("Une page de configuration s'affichera pour chaque propriété : type (maison, plex, appartement), unités, adresse, % de propriété.")
            }

            Section("Aperçu") {
                ForEach(drafts.indices, id: \.self) { i in
                    HStack(spacing: 10) {
                        Image(systemName: drafts[i].kind.icon)
                            .foregroundStyle(AppConfig.Palette.blue)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(drafts[i].displayName.isEmpty ? "Propriété \(i + 1)" : drafts[i].displayName)
                                .font(.subheadline.bold())
                            Text("\(drafts[i].kind.label) — \(drafts[i].unitNames.count) unité(s)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func resizeDrafts(to count: Int) {
        let target = max(1, min(10, count))
        if drafts.count > target {
            drafts.removeLast(drafts.count - target)
        }
        while drafts.count < target {
            drafts.append(PropertyDraft())
        }
    }

    // MARK: - Étape : une propriété

    @ViewBuilder
    private func propertyStep(_ i: Int) -> some View {
        if drafts.indices.contains(i) {
            Section {
                Text("Propriété \(i + 1) sur \(drafts.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            PropertyEditorForm(draft: $drafts[i])
        }
    }

    // MARK: - Étape : apparence + résumé cliquable

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

            Section {
                summaryRow(icon: "car.fill", label: "Déplacements",
                           value: wantsTrips ? "Activé" : "Masqué",
                           target: .modules)
                summaryRow(icon: "car.2.fill", label: "Uber / Lyft",
                           value: wantsRideshare ? "Activé" : "Masqué",
                           target: .modules)
                if wantsTrips || wantsRideshare {
                    summaryRow(icon: "gauge.with.needle", label: "Véhicule",
                               value: "\(vehicleModel) — \(AppConfig.currency(kmRate))/km",
                               target: .vehicle)
                }
                if wantsProperties {
                    ForEach(drafts.indices, id: \.self) { i in
                        summaryRow(icon: drafts[i].kind.icon,
                                   label: drafts[i].displayName.isEmpty ? "Propriété \(i + 1)" : drafts[i].displayName,
                                   value: propertySummary(drafts[i]),
                                   target: .property(i))
                    }
                } else {
                    summaryRow(icon: "building.2.fill", label: "Logements locatifs",
                               value: "Masqué", target: .modules)
                }
            } header: {
                Text("Résumé de votre configuration")
            } footer: {
                Text("Touchez une ligne pour revenir la modifier.")
            }
        }
    }

    private func propertySummary(_ d: PropertyDraft) -> String {
        var parts = ["\(d.kind.label) · \(d.unitNames.count) unité(s)"]
        if d.ownershipPct < 100 {
            parts.append("\(AppConfig.percent(d.ownershipPct / 100))"
                         + (d.coOwners.isEmpty ? "" : " avec \(d.coOwners)"))
        }
        return parts.joined(separator: " · ")
    }

    /// Ligne de résumé cliquable : ramène à l'étape concernée.
    private func summaryRow(icon: String, label: String, value: String, target: Step) -> some View {
        Button {
            if let idx = steps.firstIndex(of: target) {
                stepIndex = idx
            }
        } label: {
            HStack(alignment: .top) {
                Label(label, systemImage: icon)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                Spacer()
                Text(value)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
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

        let existing = data.properties()
        drafts = existing.isEmpty ? [PropertyDraft()] : existing.map(PropertyDraft.from)
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
        if wantsProperties {
            PropertyStore.apply(drafts: drafts, context: context)
        }

        AppSetup.onboardingDone = true
        dismiss()
    }
}
