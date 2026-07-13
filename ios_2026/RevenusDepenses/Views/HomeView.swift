import SwiftUI
import SwiftData

/// Onglet Accueil : cartes résumé, formulaire rapide d'ajout de trajet,
/// 5 derniers déplacements.
struct HomeView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    // Ces @Query déclenchent le rafraîchissement des cartes quand les données changent.
    @Query private var allTrips: [Trip]
    @Query private var allEntries: [EntryAmount]

    // Formulaire rapide
    @State private var tripDate = Date()
    @State private var destination = "p1090"          // p1090 | p470 | other
    @State private var km: Double = AppConfig.p1090.oneWayKm * 2
    @State private var roundTrip = true
    @State private var purpose = ""
    @State private var customOrigin = AppConfig.homeAddress
    @State private var customDestination = ""
    @State private var isCalculatingDistance = false
    @State private var distanceError: String?

    private var data: DataService { DataService(context: context, year: year) }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                summaryCards
                quickTripForm
                recentTrips
            }
            .padding()
        }
        .background(AppConfig.Palette.background)
        .navigationTitle("Accueil")
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: - Cartes résumé

    private var summaryCards: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                SummaryCard(title: "Revenus locatifs",
                            value: AppConfig.currency(data.totalRevenueAll()),
                            color: AppConfig.Palette.green,
                            icon: "arrow.down.circle.fill")
                SummaryCard(title: "Dépenses déductibles",
                            value: AppConfig.currency(data.totalDeductibleAll()),
                            color: AppConfig.Palette.orange,
                            icon: "arrow.up.circle.fill")
            }
            HStack(spacing: 10) {
                SummaryCard(title: "Bénéfice net",
                            value: AppConfig.currency(data.rentalNetGlobal()),
                            color: data.rentalNetGlobal() >= 0 ? AppConfig.Palette.green : .red,
                            icon: "chart.line.uptrend.xyaxis")
                SummaryCard(title: "Déplacements \(String(year))",
                            value: AppConfig.currency(data.totalTripsAmount()),
                            color: AppConfig.Palette.blue,
                            icon: "car.fill")
            }
        }
    }

    // MARK: - Formulaire rapide de trajet

    private var quickTripForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Ajouter un déplacement", systemImage: "plus.circle.fill")
                .font(.headline)
                .foregroundStyle(AppConfig.Palette.dark)

            DatePicker("Date", selection: $tripDate, displayedComponents: .date)
                .font(.subheadline)

            Picker("Destination", selection: $destination) {
                Text(AppConfig.p1090.name).tag("p1090")
                Text(AppConfig.p470.name).tag("p470")
                Text("Autre destination").tag("other")
            }
            .pickerStyle(.segmented)
            .onChange(of: destination) { applyPresetDistance() }

            if destination == "other" {
                VStack(spacing: 8) {
                    TextField("Adresse de départ", text: $customOrigin)
                        .textFieldStyle(.roundedBorder)
                        .font(.subheadline)
                    TextField("Adresse d'arrivée", text: $customDestination)
                        .textFieldStyle(.roundedBorder)
                        .font(.subheadline)
                    Button {
                        calculateDistance()
                    } label: {
                        if isCalculatingDistance {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("Calculer distance", systemImage: "map.fill")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(customDestination.isEmpty || isCalculatingDistance)
                    if let distanceError {
                        Text(distanceError)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }

            NumberField(title: "Kilométrage", value: $km, unit: "km")

            Toggle("Aller-retour", isOn: $roundTrip)
                .font(.subheadline)
                .onChange(of: roundTrip) { _, newValue in
                    // Double / divise le km en basculant.
                    km = newValue ? km * 2 : km / 2
                }

            TextField("Motif du déplacement (ex. collecte loyers, réparation…)", text: $purpose)
                .textFieldStyle(.roundedBorder)
                .font(.subheadline)

            HStack {
                Text("Montant estimé")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(AppConfig.currency(km * data.ensureFiscalYear().kmRate))
                    .font(.headline)
                    .foregroundStyle(AppConfig.Palette.green)
            }

            Button {
                saveTrip()
            } label: {
                Label("Enregistrer le trajet", systemImage: "checkmark.circle.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppConfig.Palette.blue)
            .disabled(km <= 0)
        }
        .padding()
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
    }

    // MARK: - Trajets récents

    private var recentTrips: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Déplacements récents", systemImage: "clock.fill")
                .font(.headline)
                .foregroundStyle(AppConfig.Palette.dark)

            let recents = Array(data.trips().prefix(5))
            if recents.isEmpty {
                Text("Aucun déplacement enregistré pour \(String(year)).")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            } else {
                ForEach(recents) { trip in
                    TripRow(trip: trip, amount: data.amount(for: trip)) {
                        data.delete(trip)
                    }
                    Divider()
                }
            }
        }
        .padding()
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
    }

    // MARK: - Actions

    private func applyPresetDistance() {
        distanceError = nil
        switch destination {
        case "p1090": km = AppConfig.p1090.oneWayKm * (roundTrip ? 2 : 1)
        case "p470": km = AppConfig.p470.oneWayKm * (roundTrip ? 2 : 1)
        default: km = 0
        }
    }

    private func calculateDistance() {
        distanceError = nil
        isCalculatingDistance = true
        let origin = customOrigin
        let dest = customDestination
        let isRoundTrip = roundTrip
        Task {
            do {
                let oneWay = try await DistanceService.drivingDistanceKm(from: origin, to: dest)
                km = (oneWay * (isRoundTrip ? 2 : 1) * 10).rounded() / 10
            } catch {
                distanceError = error.localizedDescription
            }
            isCalculatingDistance = false
        }
    }

    private func saveTrip() {
        let label: String
        switch destination {
        case "p1090": label = AppConfig.p1090.name
        case "p470": label = AppConfig.p470.name
        default: label = customDestination.isEmpty ? "Autre destination" : customDestination
        }
        data.addTrip(date: tripDate, propertyId: destination, destinationLabel: label,
                     km: km, roundTrip: roundTrip, purpose: purpose)
        purpose = ""
        tripDate = Date()
        applyPresetDistance()
    }
}

// MARK: - Ligne de trajet réutilisable

struct TripRow: View {
    let trip: Trip
    let amount: Double
    let onDelete: () -> Void

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = AppConfig.locale
        f.dateFormat = "d MMM yyyy"
        return f
    }()

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(trip.destinationLabel)
                    .font(.subheadline.bold())
                HStack(spacing: 6) {
                    Text(Self.dateFormatter.string(from: trip.date))
                    if !trip.purpose.isEmpty {
                        Text("• \(trip.purpose)")
                            .lineLimit(1)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(AppConfig.currency(amount))
                    .font(.subheadline.bold().monospacedDigit())
                    .foregroundStyle(AppConfig.Palette.green)
                Text(AppConfig.km(trip.km))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Button(role: .destructive, action: onDelete) {
                Image(systemName: "trash")
                    .font(.caption)
            }
            .buttonStyle(.borderless)
        }
        .padding(.vertical, 2)
    }
}
