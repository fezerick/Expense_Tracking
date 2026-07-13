import SwiftUI

// MARK: - Carte résumé (utilisée sur l'Accueil et le Sommaire)

struct SummaryCard: View {
    let title: String
    let value: String
    let color: Color
    var icon: String = "dollarsign.circle.fill"

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .foregroundStyle(color)
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2, reservesSpace: true)
            }
            Text(value)
                .font(.title3.bold())
                .foregroundStyle(color)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
    }
}

// MARK: - Champ montant ($) avec clavier décimal et format fr_CA

struct CurrencyField: View {
    let title: String
    @Binding var value: Double
    var readOnly: Bool = false

    var body: some View {
        HStack {
            Text(title)
                .font(.subheadline)
                .lineLimit(2)
            Spacer()
            if readOnly {
                Text(AppConfig.currency(value))
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            } else {
                TextField("0,00", value: $value, format: .number.precision(.fractionLength(0...2)))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 110)
                    .textFieldStyle(.roundedBorder)
                    .font(.subheadline.monospacedDigit())
            }
        }
    }
}

// MARK: - Champ numérique générique (km, nombre de courses…)

struct NumberField: View {
    let title: String
    @Binding var value: Double
    var unit: String = ""

    var body: some View {
        HStack {
            Text(title)
                .font(.subheadline)
                .lineLimit(2)
            Spacer()
            TextField("0", value: $value, format: .number.precision(.fractionLength(0...1)))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 100)
                .textFieldStyle(.roundedBorder)
                .font(.subheadline.monospacedDigit())
            if !unit.isEmpty {
                Text(unit)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Navigation mois précédent / suivant

struct MonthNavigator: View {
    @Binding var month: Int

    var body: some View {
        HStack {
            Button {
                month = (month + 11) % 12
            } label: {
                Image(systemName: "chevron.left.circle.fill")
                    .font(.title2)
            }
            Spacer()
            Text(AppConfig.monthNames[month])
                .font(.headline)
            Spacer()
            Button {
                month = (month + 1) % 12
            } label: {
                Image(systemName: "chevron.right.circle.fill")
                    .font(.title2)
            }
        }
        .foregroundStyle(AppConfig.Palette.blue)
        .padding(.vertical, 4)
        // Indispensable dans une List : sans .borderless, un tap sur la ligne
        // déclenche les DEUX chevrons à la fois (−1 puis +1 = aucun effet).
        .buttonStyle(.borderless)
    }
}

// MARK: - Ligne montant + total (sommaire, tableaux)

struct AmountRow: View {
    let label: String
    let amount: Double
    var bold: Bool = false
    var color: Color = .primary

    var body: some View {
        HStack {
            Text(label)
                .font(bold ? .subheadline.bold() : .subheadline)
            Spacer()
            Text(AppConfig.currency(amount))
                .font(bold ? .subheadline.bold().monospacedDigit() : .subheadline.monospacedDigit())
                .foregroundStyle(color)
        }
    }
}

// MARK: - Utilitaires de date

extension Date {
    static func currentMonthIndex() -> Int {
        Calendar.current.component(.month, from: Date()) - 1
    }
}
