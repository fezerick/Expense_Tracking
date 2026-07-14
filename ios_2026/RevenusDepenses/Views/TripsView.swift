import SwiftUI
import SwiftData

/// Onglet Trajets : journal complet, navigation mois par mois,
/// groupé par propriété avec totaux.
struct TripsView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Query private var allTrips: [Trip]   // déclenche le rafraîchissement
    @Query(sort: [SortDescriptor(\RentalProperty.sortOrder), SortDescriptor(\RentalProperty.createdAt)])
    private var allProperties: [RentalProperty]
    @State private var month = Date.currentMonthIndex()

    private var data: DataService { DataService(context: context, year: year) }

    private var monthTrips: [Trip] {
        data.trips(month: month)
    }

    var body: some View {
        List {
            Section {
                MonthNavigator(month: $month)
                monthTotals
            }

            // Un groupe par immeuble configuré ; « Autres destinations » regroupe les
            // trajets personnalisés ET ceux vers des immeubles retirés (jamais masqués).
            let groupColors = [AppConfig.Palette.blue, AppConfig.Palette.green,
                               AppConfig.Palette.orange, AppConfig.Palette.pink]
            ForEach(Array(allProperties.enumerated()), id: \.element.propId) { index, prop in
                tripGroup(title: prop.name,
                          trips: monthTrips.filter { $0.propertyId == prop.propId },
                          color: groupColors[index % groupColors.count])
            }
            let knownIds = Set(allProperties.map(\.propId))
            tripGroup(title: "Autres destinations",
                      trips: monthTrips.filter { !knownIds.contains($0.propertyId) },
                      color: AppConfig.Palette.brown)

            if monthTrips.isEmpty {
                Section {
                    Text("Aucun trajet en \(AppConfig.monthNames[month]) \(String(year)).")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Journal des trajets")
        .background(AppConfig.Palette.background)
    }

    private var monthTotals: some View {
        let kmTotal = monthTrips.reduce(0) { $0 + $1.km }
        let amount = kmTotal * data.ensureFiscalYear().kmRate
        return HStack {
            statBlock(value: "\(monthTrips.count)", label: "trajets")
            Divider()
            statBlock(value: AppConfig.km(kmTotal), label: "distance")
            Divider()
            statBlock(value: AppConfig.currency(amount), label: "montant")
        }
        .frame(maxWidth: .infinity)
    }

    private func statBlock(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.subheadline.bold())
                .foregroundStyle(AppConfig.Palette.dark)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func tripGroup(title: String, trips: [Trip], color: Color) -> some View {
        if !trips.isEmpty {
            let kmTotal = trips.reduce(0) { $0 + $1.km }
            let amount = kmTotal * data.ensureFiscalYear().kmRate
            Section {
                ForEach(trips) { trip in
                    TripRow(trip: trip, amount: data.amount(for: trip)) {
                        data.delete(trip)
                    }
                }
            } header: {
                HStack {
                    Text(title)
                        .foregroundStyle(color)
                    Spacer()
                    Text("\(AppConfig.km(kmTotal)) • \(AppConfig.currency(amount))")
                        .font(.caption.monospacedDigit())
                }
            }
        }
    }
}
