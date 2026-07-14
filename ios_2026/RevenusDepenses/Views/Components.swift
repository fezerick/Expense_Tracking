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

// MARK: - Saisie numérique validée à CHAQUE frappe
// TextField(value:format:) ne pousse la valeur dans le binding qu'à la perte de
// focus — avec le clavier décimal (sans touche Retour), taper « 50 » puis
// appuyer sur « Enregistrer »/« Continuer » sauvegardait l'ancienne valeur.
// DecimalTextField s'appuie sur une String et met le binding à jour en direct.

private struct DecimalTextField: View {
    let placeholder: String
    @Binding var value: Double
    let maxFractionDigits: Int
    let width: CGFloat

    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .frame(width: width)
            .textFieldStyle(.roundedBorder)
            .font(.subheadline.monospacedDigit())
            .focused($focused)
            .onAppear { text = Self.format(value, maxFractionDigits) }
            .onChange(of: text) { _, newText in
                guard focused else { return }
                value = Self.parse(newText) ?? 0
            }
            .onChange(of: value) { _, newValue in
                // Mise à jour externe (ex. clamp min/max, calcul auto) :
                // ne réécrit pas le texte pendant la frappe sauf si divergent.
                if !focused {
                    text = Self.format(newValue, maxFractionDigits)
                } else if Self.parse(text) ?? 0 != newValue {
                    text = Self.format(newValue, maxFractionDigits)
                }
            }
            .onChange(of: focused) { _, isFocused in
                if !isFocused { text = Self.format(value, maxFractionDigits) }
            }
    }

    /// Accepte la virgule (clavier fr) et le point.
    private static func parse(_ s: String) -> Double? {
        let cleaned = s.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\u{00A0}", with: "")
            .replacingOccurrences(of: ",", with: ".")
        return Double(cleaned)
    }

    private static func format(_ v: Double, _ maxFraction: Int) -> String {
        guard v != 0 else { return "" }
        let f = NumberFormatter()
        f.locale = AppConfig.locale
        f.numberStyle = .decimal
        f.usesGroupingSeparator = false
        f.maximumFractionDigits = maxFraction
        return f.string(from: NSNumber(value: v)) ?? ""
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
                DecimalTextField(placeholder: "0,00", value: $value,
                                 maxFractionDigits: 2, width: 110)
            }
        }
    }
}

// MARK: - Champ numérique générique (km, %, nombre de courses…)

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
            DecimalTextField(placeholder: "0", value: $value,
                             maxFractionDigits: 1, width: 100)
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
