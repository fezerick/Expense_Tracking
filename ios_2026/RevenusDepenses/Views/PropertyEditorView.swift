import SwiftUI
import SwiftData

// MARK: - Brouillon d'immeuble (assistant + réglages)

/// Représentation éditable d'un RentalProperty avant application.
struct PropertyDraft: Identifiable {
    let id = UUID()
    /// propId du RentalProperty existant, nil pour un nouvel immeuble.
    var propId: String?
    var kind: PropertyKind = .maison
    var subtypeCode: String = "unifamiliale"
    var unitNames: [String] = ["Loyer"]
    var name: String = ""
    var address: String = ""
    var oneWayKm: Double = 0
    var ownershipPct: Double = 100
    var coOwners: String = ""

    /// Le sous-type laisse-t-il le nombre d'unités au choix de l'utilisateur ?
    var hasVariableUnitCount: Bool {
        kind.subtype(code: subtypeCode)?.unitCount == nil
    }

    var displayName: String {
        name.trimmingCharacters(in: .whitespaces)
    }

    mutating func setKind(_ newKind: PropertyKind) {
        guard newKind != kind else { return }
        kind = newKind
        subtypeCode = newKind.subtypes[0].code
        unitNames = newKind.defaultUnitNames(count: newKind.subtypes[0].unitCount ?? 2)
    }

    mutating func setSubtype(_ code: String) {
        subtypeCode = code
        if let fixed = kind.subtype(code: code)?.unitCount {
            resizeUnits(to: fixed)
        } else if unitNames.count < 2 {
            resizeUnits(to: 2)
        }
    }

    mutating func resizeUnits(to count: Int) {
        let target = max(1, min(12, count))
        if unitNames.count > target {
            unitNames.removeLast(unitNames.count - target)
        }
        let defaults = kind.defaultUnitNames(count: target)
        while unitNames.count < target {
            let idx = unitNames.count
            unitNames.append(idx < defaults.count ? defaults[idx] : "Unité \(idx + 1)")
        }
    }

    static func from(_ p: RentalProperty) -> PropertyDraft {
        var d = PropertyDraft()
        d.propId = p.propId
        d.kind = p.kind
        d.subtypeCode = p.subtypeCode
        d.unitNames = p.revenueCategories
        d.name = p.name
        d.address = p.address
        d.oneWayKm = p.oneWayKm
        d.ownershipPct = p.ownershipPct
        d.coOwners = p.coOwners
        return d
    }
}

// MARK: - Application des brouillons

enum PropertyStore {

    /// Applique la liste complète (assistant) : crée / met à jour / retire.
    /// Un immeuble retiré est supprimé de la configuration, mais ses montants
    /// restent en base (récupérables via « données orphelines » dans Logements).
    static func apply(drafts: [PropertyDraft], context: ModelContext) {
        let all = (try? context.fetch(FetchDescriptor<RentalProperty>())) ?? []
        var keptIds = Set<String>()
        for (i, draft) in drafts.enumerated() {
            if let pid = draft.propId, let existing = all.first(where: { $0.propId == pid }) {
                update(existing, from: draft, context: context)
                existing.sortOrder = i
                keptIds.insert(pid)
            } else {
                let created = create(from: draft, sortOrder: i, context: context)
                keptIds.insert(created.propId)
            }
        }
        for p in all where !keptIds.contains(p.propId) {
            context.delete(p)
        }
    }

    @discardableResult
    static func create(from draft: PropertyDraft, sortOrder: Int, context: ModelContext) -> RentalProperty {
        let p = RentalProperty(
            name: draft.displayName.isEmpty ? "Immeuble \(sortOrder + 1)" : draft.displayName,
            address: draft.address,
            kind: draft.kind,
            subtypeCode: draft.subtypeCode,
            oneWayKm: draft.oneWayKm,
            ownershipPct: draft.ownershipPct,
            coOwners: draft.coOwners,
            revenueCategories: draft.unitNames,
            deductibleCategories: AppConfig.standardDeductibleCategories,
            capitalCategories: AppConfig.defaultCapitalCategories(unitNames: draft.unitNames),
            sortOrder: sortOrder
        )
        context.insert(p)
        return p
    }

    /// Mise à jour : si une unité est renommée, les montants déjà saisis suivent
    /// (catégorie de revenu ET catégorie capital « Rénovation — <unité> »).
    static func update(_ p: RentalProperty, from draft: PropertyDraft, context: ModelContext) {
        p.name = draft.displayName.isEmpty ? p.name : draft.displayName
        p.address = draft.address
        p.kindCode = draft.kind.rawValue
        p.subtypeCode = draft.subtypeCode
        p.oneWayKm = draft.oneWayKm
        p.ownershipPct = min(100, max(0, draft.ownershipPct))
        p.coOwners = draft.coOwners

        let old = p.revenueCategories
        let new = draft.unitNames
        guard old != new else { return }

        var capital = p.capitalCategories
        for (o, n) in zip(old, new) where o != n {
            renameEntries(propId: p.propId, from: o, to: n, context: context)
            let oldCap = "Rénovation / Amélioration — \(o)"
            let newCap = "Rénovation / Amélioration — \(n)"
            renameEntries(propId: p.propId, from: oldCap, to: newCap, context: context)
            capital = capital.map { $0 == oldCap ? newCap : $0 }
        }
        if new.count > old.count {
            let added = new.suffix(new.count - old.count).map { "Rénovation / Amélioration — \($0)" }
            let insertAt = capital.firstIndex { $0.hasPrefix("Remplacement équipements") } ?? capital.count
            capital.insert(contentsOf: added, at: insertAt)
        }
        // Unités retirées : leurs catégories capital restent (des montants peuvent exister).
        p.revenueCategories = new
        p.capitalCategories = capital
    }

    /// Renomme une catégorie dans toutes les années (les montants suivent le nouveau nom).
    private static func renameEntries(propId: String, from old: String, to new: String, context: ModelContext) {
        let descriptor = FetchDescriptor<EntryAmount>(
            predicate: #Predicate { $0.propertyId == propId && $0.category == old }
        )
        ((try? context.fetch(descriptor)) ?? []).forEach { $0.category = new }
    }
}

// MARK: - Formulaire d'édition (sections à insérer dans un Form)

struct PropertyEditorForm: View {
    @Binding var draft: PropertyDraft

    @State private var isCalculatingDistance = false
    @State private var distanceError: String?

    var body: some View {
        Section("Type de logement") {
            Picker("Type", selection: Binding(
                get: { draft.kind },
                set: { draft.setKind($0) }
            )) {
                ForEach(PropertyKind.allCases) { kind in
                    Text(kind.label).tag(kind)
                }
            }
            .pickerStyle(.segmented)

            Picker("Sous-type", selection: Binding(
                get: { draft.subtypeCode },
                set: { draft.setSubtype($0) }
            )) {
                ForEach(draft.kind.subtypes) { sub in
                    Text(sub.label).tag(sub.code)
                }
            }

            if draft.hasVariableUnitCount {
                Stepper("Nombre de \(draft.kind.unitNoun) : \(draft.unitNames.count)",
                        value: Binding(
                            get: { draft.unitNames.count },
                            set: { draft.resizeUnits(to: $0) }
                        ), in: 1...12)
            }
        }

        Section {
            ForEach(draft.unitNames.indices, id: \.self) { i in
                HStack {
                    Image(systemName: draft.kind == .appart ? "person.fill" : "door.left.hand.closed")
                        .foregroundStyle(AppConfig.Palette.blue)
                        .frame(width: 22)
                    TextField("Unité \(i + 1)", text: Binding(
                        get: { draft.unitNames.indices.contains(i) ? draft.unitNames[i] : "" },
                        set: { if draft.unitNames.indices.contains(i) { draft.unitNames[i] = $0 } }
                    ))
                }
            }
        } header: {
            Text(draft.kind == .appart ? "Colocataires / unités" : "Logements")
        } footer: {
            Text("Ces noms deviennent les catégories de revenus — personnalisez-les librement (ex. nom du locataire).")
        }

        Section("Immeuble") {
            HStack {
                Text("Nom affiché").font(.subheadline)
                Spacer()
                TextField("Ex. 470 Rue Gélinas", text: $draft.name)
                    .multilineTextAlignment(.trailing)
                    .font(.subheadline)
            }
            TextField("Adresse complète (figure sur le T776)", text: $draft.address, axis: .vertical)
                .font(.subheadline)
            NumberField(title: "Distance depuis le domicile (aller simple)",
                        value: $draft.oneWayKm, unit: "km")
            Button {
                calculateDistance()
            } label: {
                if isCalculatingDistance {
                    ProgressView()
                } else {
                    Label("Calculer la distance depuis l'adresse", systemImage: "map.fill")
                }
            }
            .disabled(draft.address.trimmingCharacters(in: .whitespaces).isEmpty || isCalculatingDistance)
            if let distanceError {
                Text(distanceError)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }

        Section {
            NumberField(title: "Votre % de propriété",
                        value: Binding(
                            get: { draft.ownershipPct },
                            set: { draft.ownershipPct = min(100, max(0, $0)) }
                        ),
                        unit: "%")
            if draft.ownershipPct < 100 {
                HStack {
                    Text("Copropriétaire(s)").font(.subheadline)
                    Spacer()
                    TextField("Nom(s)", text: $draft.coOwners)
                        .multilineTextAlignment(.trailing)
                        .font(.subheadline)
                }
            }
        } header: {
            Text("Propriété (T776 / TP-128)")
        } footer: {
            Text(draft.ownershipPct < 100
                 ? "Le rapport PDF calcule votre part (\(AppConfig.percent(draft.ownershipPct / 100))) et celle des copropriétaires."
                 : "100 % : vous êtes l'unique propriétaire.")
        }
    }

    private func calculateDistance() {
        distanceError = nil
        isCalculatingDistance = true
        let destination = draft.address
        Task {
            do {
                let km = try await DistanceService.drivingDistanceKm(from: AppConfig.homeAddress, to: destination)
                draft.oneWayKm = (km * 10).rounded() / 10
            } catch {
                distanceError = error.localizedDescription
            }
            isCalculatingDistance = false
        }
    }
}

// MARK: - Éditeur en sheet (Réglages)

struct PropertyEditorSheet: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State var draft: PropertyDraft
    /// Vrai si l'immeuble existe déjà (permet la suppression).
    let isExisting: Bool

    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            Form {
                PropertyEditorForm(draft: $draft)

                if isExisting {
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label("Retirer cet immeuble", systemImage: "trash")
                        }
                    } footer: {
                        Text("Les montants déjà saisis restent en base et pourront être récupérés via « données orphelines » dans l'onglet Logements.")
                    }
                }
            }
            .navigationTitle(isExisting ? "Modifier l'immeuble" : "Nouvel immeuble")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { saveAndClose() }
                }
            }
            .confirmationDialog("Retirer cet immeuble de la configuration ?",
                                isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Retirer", role: .destructive) { deleteAndClose() }
                Button("Annuler", role: .cancel) {}
            }
        }
        .appliesAppearance()
    }

    private func saveAndClose() {
        let all = (try? context.fetch(FetchDescriptor<RentalProperty>())) ?? []
        if let pid = draft.propId, let existing = all.first(where: { $0.propId == pid }) {
            PropertyStore.update(existing, from: draft, context: context)
        } else {
            let order = (all.map(\.sortOrder).max() ?? -1) + 1
            PropertyStore.create(from: draft, sortOrder: order, context: context)
        }
        dismiss()
    }

    private func deleteAndClose() {
        if let pid = draft.propId,
           let existing = try? context.fetch(FetchDescriptor<RentalProperty>()).first(where: { $0.propId == pid }) {
            context.delete(existing)
        }
        dismiss()
    }
}
