import SwiftUI
import SwiftData
import UniformTypeIdentifiers

/// Onglet Sommaire : résumé global, tableau par source, exports (PDF, CSV, JSON),
/// restauration JSON et checklist de fin d'année.
struct SummaryView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    // Modules choisis dans l'assistant de configuration.
    @AppStorage(AppSetup.Keys.moduleTrips) private var moduleTrips = true
    @AppStorage(AppSetup.Keys.moduleProperties) private var moduleProperties = true
    @AppStorage(AppSetup.Keys.moduleRideshare) private var moduleRideshare = true
    // Rafraîchissement automatique quand une donnée change.
    @Query private var allEntries: [EntryAmount]
    @Query private var allTrips: [Trip]
    @Query private var allUberValues: [UberValue]
    @Query private var allLyftMonths: [LyftMonth]
    @Query private var allVehicleExpenses: [VehicleExpense]
    @Query(sort: \ChecklistItem.sortOrder) private var allChecklistItems: [ChecklistItem]

    @State private var showRestoreImporter = false
    @State private var restoreMessage: String?
    @State private var newItemLabel = ""
    @State private var editingItem: ChecklistItem?
    @State private var editingLabel = ""

    private var data: DataService { DataService(context: context, year: year) }
    private var checklist: [ChecklistItem] { allChecklistItems.filter { $0.year == year } }

    var body: some View {
        List {
            globalSummary
            sourceTable
            exportSection
            checklistSection
        }
        .navigationTitle("Sommaire fiscal \(String(year))")
        .onAppear {
            data.ensureFiscalYear()
            data.seedChecklistIfEmpty()
        }
        .fileImporter(isPresented: $showRestoreImporter, allowedContentTypes: [.json]) { result in
            restoreBackup(result: result)
        }
        .alert("Modifier l'item", isPresented: Binding(
            get: { editingItem != nil },
            set: { if !$0 { editingItem = nil } }
        )) {
            TextField("Libellé", text: $editingLabel)
            Button("Enregistrer") {
                editingItem?.label = editingLabel
                editingItem = nil
            }
            Button("Annuler", role: .cancel) { editingItem = nil }
        }
    }

    // MARK: - Résumé global

    private var globalSummary: some View {
        Section("Résumé global") {
            if moduleProperties {
                AmountRow(label: "Revenus locatifs totaux", amount: data.totalRevenueAll(),
                          color: AppConfig.Palette.green)
                AmountRow(label: "Dépenses déductibles", amount: data.totalDeductibleAll(),
                          color: AppConfig.Palette.orange)
                AmountRow(label: "Dépenses en capital", amount: data.totalCapitalAll(),
                          color: AppConfig.Palette.brown)
                AmountRow(label: "Bénéfice locatif net", amount: data.rentalNetGlobal(), bold: true,
                          color: data.rentalNetGlobal() >= 0 ? AppConfig.Palette.green : .red)
            }
            if moduleTrips && !moduleProperties {
                AmountRow(label: "Déplacements (journal km)", amount: data.totalTripsAmount(),
                          color: AppConfig.Palette.blue)
            }
            if moduleRideshare {
                AmountRow(label: "Déduction véhicule — Uber", amount: data.vehicleDeductionUber(),
                          color: AppConfig.Palette.orange)
                AmountRow(label: "Déduction véhicule — Lyft", amount: data.vehicleDeductionLyft(),
                          color: AppConfig.Palette.pink)
            }
            AmountRow(label: "Bénéfice global", amount: data.globalNet(), bold: true,
                      color: data.globalNet() >= 0 ? AppConfig.Palette.green : .red)
        }
    }

    // MARK: - Tableau par source

    private var sourceTable: some View {
        Section("Détail par source") {
            ForEach(AppSetup.activeProperties) { prop in
                sourceRow(name: AppSetup.displayName(prop.id),
                          revenue: data.sectionAnnualTotal(propertyId: prop.id, section: .revenue),
                          expenses: data.sectionAnnualTotal(propertyId: prop.id, section: .deductible))
            }
            if moduleRideshare {
                sourceRow(name: "Uber — véhicule", revenue: 0, expenses: data.vehicleDeductionUber())
                sourceRow(name: "Lyft — véhicule", revenue: 0, expenses: data.vehicleDeductionLyft())
            }
            sourceRow(name: "TOTAL",
                      revenue: data.totalRevenueAll(),
                      expenses: data.totalDeductibleAll()
                          + (moduleRideshare ? data.vehicleDeductionUber() + data.vehicleDeductionLyft() : 0),
                      bold: true)
        }
    }

    private func sourceRow(name: String, revenue: Double, expenses: Double, bold: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(name)
                .font(bold ? .subheadline.bold() : .subheadline)
            HStack {
                Text("Rev. \(AppConfig.currency(revenue))")
                    .foregroundStyle(AppConfig.Palette.green)
                Spacer()
                Text("Dép. \(AppConfig.currency(expenses))")
                    .foregroundStyle(AppConfig.Palette.orange)
                Spacer()
                Text("Bén. \(AppConfig.currency(revenue - expenses))")
                    .foregroundStyle(revenue - expenses >= 0 ? AppConfig.Palette.green : .red)
                    .bold(bold)
            }
            .font(.caption.monospacedDigit())
        }
    }

    // MARK: - Exports

    private var exportSection: some View {
        Section("Exports et sauvegarde") {
            ShareLink(item: pdfReportURL()) {
                Label("Rapport PDF comptable", systemImage: "doc.richtext.fill")
            }
            ShareLink(item: csvURL()) {
                Label("Export CSV", systemImage: "tablecells.fill")
            }
            ShareLink(item: jsonBackupURL()) {
                Label("Sauvegarder JSON (backup complet)", systemImage: "externaldrive.fill.badge.icloud")
            }
            Button {
                showRestoreImporter = true
            } label: {
                Label("Restaurer depuis JSON", systemImage: "arrow.counterclockwise.circle.fill")
            }
            if let restoreMessage {
                Text(restoreMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func exportURL(fileName: String, contents: Data) -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        try? contents.write(to: url)
        return url
    }

    private func pdfReportURL() -> URL {
        exportURL(fileName: "Sommaire_fiscal_\(year).pdf",
                  contents: PDFReportGenerator.generate(data: data))
    }

    private func csvURL() -> URL {
        let csv = CSVExportService.summaryCSV(data: data)
        // BOM UTF-8 pour qu'Excel reconnaisse les accents.
        var contents = Data([0xEF, 0xBB, 0xBF])
        contents.append(csv.data(using: .utf8) ?? Data())
        return exportURL(fileName: "Sommaire_fiscal_\(year).csv", contents: contents)
    }

    private func jsonBackupURL() -> URL {
        let json = (try? BackupService.exportJSON(data: data)) ?? Data()
        return exportURL(fileName: "Backup_\(year).json", contents: json)
    }

    private func restoreBackup(result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            let accessing = url.startAccessingSecurityScopedResource()
            defer { if accessing { url.stopAccessingSecurityScopedResource() } }
            do {
                let jsonData = try Data(contentsOf: url)
                let restoredYear = try BackupService.restore(from: jsonData, context: context)
                restoreMessage = "Restauration réussie pour l'année \(restoredYear)."
            } catch {
                restoreMessage = "Échec : \(error.localizedDescription)"
            }
        case .failure(let error):
            restoreMessage = "Échec : \(error.localizedDescription)"
        }
    }

    // MARK: - Checklist

    private var checklistSection: some View {
        Section {
            let done = checklist.filter(\.isDone).count
            let progress = checklist.isEmpty ? 0 : Double(done) / Double(checklist.count)
            VStack(alignment: .leading, spacing: 6) {
                ProgressView(value: progress)
                    .tint(AppConfig.Palette.green)
                Text("\(done) / \(checklist.count) documents réunis (\(AppConfig.percent(progress)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(checklist) { item in
                HStack {
                    Button {
                        item.isDone.toggle()
                    } label: {
                        Image(systemName: item.isDone ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(item.isDone ? AppConfig.Palette.green : .secondary)
                    }
                    .buttonStyle(.borderless)
                    Text(item.label)
                        .font(.subheadline)
                        .strikethrough(item.isDone, color: .secondary)
                        .foregroundStyle(item.isDone ? .secondary : .primary)
                    Spacer()
                    Button {
                        editingLabel = item.label
                        editingItem = item
                    } label: {
                        Image(systemName: "pencil")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.borderless)
                }
                .swipeActions {
                    Button(role: .destructive) {
                        context.delete(item)
                    } label: {
                        Label("Supprimer", systemImage: "trash")
                    }
                }
            }

            HStack {
                TextField("Ajouter un item…", text: $newItemLabel)
                Button {
                    let order = (checklist.map(\.sortOrder).max() ?? -1) + 1
                    context.insert(ChecklistItem(year: year, label: newItemLabel, sortOrder: order))
                    newItemLabel = ""
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
                .disabled(newItemLabel.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            Button(role: .destructive) {
                data.resetChecklist()
            } label: {
                Label("Réinitialiser la liste par défaut", systemImage: "arrow.counterclockwise")
            }
        } header: {
            Text("Checklist de fin d'année")
        }
    }
}
