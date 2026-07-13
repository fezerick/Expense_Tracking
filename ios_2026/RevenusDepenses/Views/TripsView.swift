import SwiftUI
import SwiftData

/// Onglet Trajets : journal complet, navigation mois par mois,
/// groupé par propriété avec totaux.
struct TripsView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Query private var allTrips: [Trip]   // déclenche le rafraîchissement
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

            // Tous les immeubles (même désactivés dans l'assistant) : un trajet déjà
            // saisi ne doit jamais disparaître ; le groupe est masqué seulement si vide.
            let groupColors = [AppConfig.Palette.blue, AppConfig.Palette.green]
            ForEach(Array(AppConfig.properties.enumerated()), id: \.element.id) { index, prop in
                tripGroup(title: AppSetup.displayName(prop.id), propertyId: prop.id,
                          color: groupColors[index % groupColors.count])
            }
            tripGroup(title: "Autres destinations", propertyId: "other", color: AppConfig.Palette.brown)

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
    private func tripGroup(title: String, propertyId: String, color: Color) -> some View {
        let trips = monthTrips.filter { $0.propertyId == propertyId }
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
