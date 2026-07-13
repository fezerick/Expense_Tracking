import SwiftUI
import SwiftData
import UniformTypeIdentifiers

/// Onglet Rideshare : sous-onglets Uber | Lyft | Véhicule.
struct RideshareView: View {
    let year: Int

    @State private var tab = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("Plateforme", selection: $tab) {
                Text("Uber").tag(0)
                Text("Lyft").tag(1)
                Text("Véhicule").tag(2)
            }
            .pickerStyle(.segmented)
            .padding()

            switch tab {
            case 0: UberFormView(year: year)
            case 1: LyftFormView(year: year)
            default: VehicleFormView(year: year)
            }
        }
        .background(AppConfig.Palette.background)
        .navigationTitle("Rideshare")
    }
}

// MARK: - Uber (saisie annuelle + import PDF)

struct UberFormView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Query private var allUberValues: [UberValue]   // rafraîchissement

    @State private var showImporter = false
    @State private var importResult: PDFImportResult?
    @State private var importError: String?

    private var data: DataService { DataService(context: context, year: year) }

    var body: some View {
        List {
            Section {
                Button {
                    showImporter = true
                } label: {
                    Label("Importer le relevé annuel PDF Uber", systemImage: "square.and.arrow.down.fill")
                        .foregroundStyle(AppConfig.Palette.orange)
                }
                if let importError {
                    Text(importError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            ForEach(AppConfig.uberGroups) { group in
                Section(group.title) {
                    ForEach(group.fields) { field in
                        CurrencyField(title: field.label, value: uberBinding(field.key))
                    }
                }
            }

            Section("Kilométrage Uber") {
                NumberField(title: "Km « En course » (On Trip)", value: uberBinding("km_on_trip"), unit: "km")
                NumberField(title: "Km « En ligne » (Online)", value: uberBinding("km_online"), unit: "km")
                Text("Le km « En ligne » sert au calcul de la déduction (recommandation Revenu Québec).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section {
                AmountRow(label: "Revenu net Uber (revenus − frais)",
                          amount: data.uberNetIncome(), bold: true,
                          color: AppConfig.Palette.orange)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.pdf]) { result in
            handleImport(result: result, labels: PDFStatementParser.uberLabels,
                         fieldOrder: PDFStatementParser.uberFieldOrder,
                         titles: PDFStatementParser.uberFieldTitles,
                         kind: .uber)
        }
        .sheet(item: $importResult) { result in
            PDFImportReviewView(result: result) { validated in
                for (key, value) in validated {
                    data.setUberValue(value, key: key)
                }
            }
        }
    }

    private func uberBinding(_ key: String) -> Binding<Double> {
        Binding(
            get: { data.uberValue(key) },
            set: { data.setUberValue($0, key: key) }
        )
    }

    private func handleImport(result: Result<URL, Error>, labels: [String: [String]],
                              fieldOrder: [String], titles: [String: String],
                              kind: PDFImportResult.Kind) {
        importError = nil
        switch result {
        case .success(let url):
            let accessing = url.startAccessingSecurityScopedResource()
            defer { if accessing { url.stopAccessingSecurityScopedResource() } }
            do {
                let text = try PDFStatementParser.extractText(from: url)
                let detected = PDFStatementParser.parse(text: text, labels: labels)
                importResult = PDFImportResult(kind: kind, detected: detected,
                                               fieldOrder: fieldOrder, titles: titles, month: nil)
            } catch {
                importError = error.localizedDescription
            }
        case .failure(let error):
            importError = error.localizedDescription
        }
    }
}

// MARK: - Lyft (saisie mensuelle + import PDF)

struct LyftFormView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Query private var allLyftMonths: [LyftMonth]   // rafraîchissement

    @State private var month = Date.currentMonthIndex()
    @State private var showImporter = false
    @State private var importResult: PDFImportResult?
    @State private var importError: String?

    private var data: DataService { DataService(context: context, year: year) }

    var body: some View {
        List {
            Section {
                MonthNavigator(month: $month)
                Button {
                    showImporter = true
                } label: {
                    Label("Importer le relevé mensuel PDF Lyft", systemImage: "square.and.arrow.down.fill")
                        .foregroundStyle(AppConfig.Palette.pink)
                }
                if let importError {
                    Text(importError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            Section("Saisie — \(AppConfig.monthNames[month]) \(String(year))") {
                CurrencyField(title: "Base taxable", value: lyftBinding(\.taxable))
                CurrencyField(title: "Primes", value: lyftBinding(\.bonuses))
                CurrencyField(title: "Pourboires", value: lyftBinding(\.tips))
                CurrencyField(title: "Frais Lyft", value: lyftBinding(\.fees))
                NumberField(title: "Kilomètres parcourus", value: lyftBinding(\.km), unit: "km")
                NumberField(title: "Nombre de courses", value: lyftBinding(\.courses))
            }

            Section {
                let net = data.lyftMonth(month)?.net ?? 0
                AmountRow(label: "Net reçu ce mois (taxable + primes + pourboires − frais)",
                          amount: net, bold: true, color: AppConfig.Palette.pink)
            }

            Section("Totaux annuels \(String(year))") {
                AmountRow(label: "Net total", amount: data.lyftNetTotal(), bold: true,
                          color: AppConfig.Palette.pink)
                AmountRow(label: "Base taxable totale", amount: data.lyftTaxableTotal())
                AmountRow(label: "Primes totales",
                          amount: data.lyftMonths().reduce(0) { $0 + $1.bonuses })
                AmountRow(label: "Frais totaux",
                          amount: data.lyftMonths().reduce(0) { $0 + $1.fees })
                HStack {
                    Text("Km total")
                        .font(.subheadline)
                    Spacer()
                    Text(AppConfig.km(data.lyftKmTotal()))
                        .font(.subheadline.monospacedDigit())
                }
                HStack {
                    Text("Nombre de courses")
                        .font(.subheadline)
                    Spacer()
                    Text("\(Int(data.lyftMonths().reduce(0) { $0 + $1.courses }))")
                        .font(.subheadline.monospacedDigit())
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.pdf]) { result in
            importError = nil
            switch result {
            case .success(let url):
                let accessing = url.startAccessingSecurityScopedResource()
                defer { if accessing { url.stopAccessingSecurityScopedResource() } }
                do {
                    let text = try PDFStatementParser.extractText(from: url)
                    let detected = PDFStatementParser.parse(text: text, labels: PDFStatementParser.lyftLabels)
                    importResult = PDFImportResult(kind: .lyft, detected: detected,
                                                   fieldOrder: PDFStatementParser.lyftFieldOrder,
                                                   titles: PDFStatementParser.lyftFieldTitles,
                                                   month: month)
                } catch {
                    importError = error.localizedDescription
                }
            case .failure(let error):
                importError = error.localizedDescription
            }
        }
        .sheet(item: $importResult) { result in
            PDFImportReviewView(result: result) { validated in
                guard let m = data.lyftMonth(result.month ?? month, createIfMissing: true) else { return }
                if let v = validated["taxable"] { m.taxable = v }
                if let v = validated["bonuses"] { m.bonuses = v }
                if let v = validated["tips"] { m.tips = v }
                if let v = validated["fees"] { m.fees = v }
                if let v = validated["km"] { m.km = v }
                if let v = validated["courses"] { m.courses = v }
            }
        }
    }

    private func lyftBinding(_ keyPath: ReferenceWritableKeyPath<LyftMonth, Double>) -> Binding<Double> {
        Binding(
            get: { data.lyftMonth(month)?[keyPath: keyPath] ?? 0 },
            set: { data.lyftMonth(month, createIfMissing: true)?[keyPath: keyPath] = $0 }
        )
    }
}

// MARK: - Véhicule (dépenses annuelles + proration)

struct VehicleFormView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Query private var allVehicleExpenses: [VehicleExpense]   // rafraîchissement
    @Query private var allFiscalYears: [FiscalYear]
    @Query private var allTrips: [Trip]
    @Query private var allLyftMonths: [LyftMonth]
    @Query private var allUberValues: [UberValue]

    private var data: DataService { DataService(context: context, year: year) }

    var body: some View {
        List {
            Section("Kilométrage annuel du véhicule") {
                NumberField(title: "Km total annuel (odomètre)",
                            value: Binding(
                                get: { data.ensureFiscalYear().vehicleTotalKm },
                                set: { data.ensureFiscalYear().vehicleTotalKm = $0 }
                            ),
                            unit: "km")
            }

            Section("Répartition des km") {
                kmRow(label: "Km Uber (En ligne)", km: data.uberKmOnline(),
                      pct: data.pctUber(), color: AppConfig.Palette.orange)
                kmRow(label: "Km Lyft", km: data.lyftKmTotal(),
                      pct: data.pctLyft(), color: AppConfig.Palette.pink)
                kmRow(label: "Km Logements (trajets)", km: data.rentalKmTotal(),
                      pct: data.pctRental(), color: AppConfig.Palette.blue)
            }

            Section("Dépenses véhicule (annuel)") {
                ForEach(AppConfig.vehicleCategories, id: \.self) { category in
                    CurrencyField(
                        title: category,
                        value: Binding(
                            get: { data.vehicleAmount(category: category) },
                            set: { data.setVehicleAmount($0, category: category) }
                        )
                    )
                }
                AmountRow(label: "Total dépenses véhicule",
                          amount: data.vehicleTotalExpenses(), bold: true,
                          color: AppConfig.Palette.dark)
            }

            Section("Répartition Uber / Lyft") {
                AmountRow(label: "Déduction véhicule — Uber (\(AppConfig.percent(data.pctUber())))",
                          amount: data.vehicleDeductionUber(), bold: true,
                          color: AppConfig.Palette.orange)
                AmountRow(label: "Déduction véhicule — Lyft (\(AppConfig.percent(data.pctLyft())))",
                          amount: data.vehicleDeductionLyft(), bold: true,
                          color: AppConfig.Palette.pink)
            }
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func kmRow(label: String, km: Double, pct: Double, color: Color) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
            Spacer()
            Text(AppConfig.km(km))
                .font(.subheadline.monospacedDigit())
            Text(AppConfig.percent(pct))
                .font(.caption.bold())
                .foregroundStyle(color)
                .frame(width: 60, alignment: .trailing)
        }
    }
}
