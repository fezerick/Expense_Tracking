import Foundation
import PDFKit

/// Extraction des montants depuis les relevés PDF Uber (annuel) et Lyft (mensuel),
/// en français ou en anglais. Même logique que la PWA d'origine :
/// pour chaque champ, on cherche un libellé connu puis le premier nombre
/// dans les ~500 caractères qui suivent.
struct PDFStatementParser {

    enum ParserError: LocalizedError {
        case unreadablePDF

        var errorDescription: String? {
            "Impossible de lire le texte de ce PDF. Vérifiez qu'il ne s'agit pas d'un scan (image)."
        }
    }

    // MARK: - Libellés bilingues par champ

    static let uberLabels: [String: [String]] = [
        "rides_gross": ["Gross fares", "Tarifs bruts", "Total fares", "Gross ride fares", "Tarif brut"],
        "green_surcharge": ["Green transportation levy", "Contribution verte", "Green surcharge", "Contribution au transport vert"],
        "booking_fee": ["Booking fee", "Frais de réservation"],
        "mtq_dues": ["MTQ dues", "Droits MTQ", "Contribution MTQ"],
        "airport_fee": ["Airport surcharge", "Supplément aéroport", "Airport fee", "Frais aéroport"],
        "tolls": ["Tolls", "Péages"],
        "tips_rides": ["Driver tips", "Tip amount", "Tips", "Pourboires"],
        "gst_riders": ["GST/HST collected from riders", "TPS/TVH collectée des passagers", "TPS collectée des passagers"],
        "qst_riders": ["QST collected from riders", "TVQ collectée des passagers"],
        "service_fee": ["Uber service fee", "Frais de service Uber", "Service fee"],
        "other_fees": ["Other fees", "Autres frais Uber", "Autres frais"],
        "fee_discount": ["Fee discount", "Remise sur frais", "Discount"],
        "gst_paid_uber": ["GST/HST paid to Uber", "TPS/TVH payée à Uber", "TPS payée à Uber"],
        "qst_paid_uber": ["QST paid to Uber", "TVQ payée à Uber"],
        "eats_gross": ["Uber Eats gross", "Tarif brut Uber Eats", "Eats fares"],
        "eats_tips": ["Eats tips", "Pourboires Eats"],
        "other_income": ["Other earnings", "Autres revenus", "Other income"],
        "gst_remitted": ["GST/HST remitted by Uber", "TPS versée par Uber"],
        "qst_remitted": ["QST remitted by Uber", "TVQ versée par Uber", "TVQ remise par Uber"],
        "km_on_trip": ["km on trip", "On-trip km", "Km en course", "Miles on trip"],
        "km_online": ["Total online km", "km online", "Online km", "Km en ligne", "Online miles"]
    ]

    /// Ordre d'affichage des champs Uber dans l'écran de révision.
    static let uberFieldOrder: [String] =
        AppConfig.uberGroups.flatMap { $0.fields.map(\.key) } + ["km_on_trip", "km_online"]

    static let lyftLabels: [String: [String]] = [
        "taxable": ["Base pay", "Rémunération de base", "Taxable earnings", "Ride earnings", "Gross earnings"],
        "bonuses": ["Bonuses", "Primes", "Incentives", "Streak bonus", "Challenge bonus"],
        "tips": ["Total tips", "Passenger tips", "Tip amount", "Tips", "Pourboires"],
        "fees": ["Lyft service fee", "Frais de service Lyft", "Lyft fee", "Service fee", "Commission"],
        "km": ["Kilometers", "km driven", "Distance (km)", "Total distance", "Miles driven", "Km parcourus"],
        "courses": ["Rides completed", "Total rides", "Courses complétées", "Trips completed", "Number of rides"]
    ]

    static let lyftFieldOrder = ["taxable", "bonuses", "tips", "fees", "km", "courses"]

    static let uberFieldTitles: [String: String] = {
        var titles: [String: String] = [:]
        for group in AppConfig.uberGroups {
            for field in group.fields { titles[field.key] = field.label }
        }
        titles["km_on_trip"] = "Km « En course » (On Trip)"
        titles["km_online"] = "Km « En ligne » (Online)"
        return titles
    }()

    static let lyftFieldTitles: [String: String] = [
        "taxable": "Base taxable ($)",
        "bonuses": "Primes ($)",
        "tips": "Pourboires ($)",
        "fees": "Frais Lyft ($)",
        "km": "Kilomètres parcourus",
        "courses": "Nombre de courses"
    ]

    // MARK: - Extraction

    static func extractText(from url: URL) throws -> String {
        guard let document = PDFDocument(url: url) else {
            throw ParserError.unreadablePDF
        }
        var text = ""
        for i in 0..<document.pageCount {
            if let pageText = document.page(at: i)?.string {
                text += pageText + "\n"
            }
        }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ParserError.unreadablePDF
        }
        return text
    }

    /// Résultat : [clé de champ: valeur détectée]. Les champs absents ne figurent pas dans le dictionnaire.
    static func parse(text: String, labels: [String: [String]]) -> [String: Double] {
        var result: [String: Double] = [:]
        for (key, candidates) in labels {
            for label in candidates {
                if let value = findAmount(near: label, in: text) {
                    result[key] = value
                    break
                }
            }
        }
        return result
    }

    static func parseUber(url: URL) throws -> [String: Double] {
        try parse(text: extractText(from: url), labels: uberLabels)
    }

    static func parseLyft(url: URL) throws -> [String: Double] {
        try parse(text: extractText(from: url), labels: lyftLabels)
    }

    // MARK: - Recherche d'un montant près d'un libellé

    /// Cherche `label` (insensible à la casse) puis le premier nombre dans les 500 caractères suivants.
    static func findAmount(near label: String, in text: String) -> Double? {
        guard let range = text.range(of: label, options: [.caseInsensitive, .diacriticInsensitive]) else {
            return nil
        }
        let start = range.upperBound
        let end = text.index(start, offsetBy: 500, limitedBy: text.endIndex) ?? text.endIndex
        let window = String(text[start..<end])

        // Nombre avec séparateurs de milliers/décimales, éventuellement précédé de $ ou −.
        let pattern = #"-?\$?\s*(\d{1,3}(?:[ ,\u{202F}\u{00A0}]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: window, range: NSRange(window.startIndex..., in: window)),
              let matchRange = Range(match.range(at: 1), in: window) else {
            return nil
        }
        let isNegative = window[..<matchRange.lowerBound].contains("-")
        guard let value = parseAmount(String(window[matchRange])) else { return nil }
        return isNegative ? -value : value
    }

    /// Convertit « 1 234,56 » (français) ou « 1,234.56 » (anglais) en Double.
    static func parseAmount(_ raw: String) -> Double? {
        var s = raw
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: "\u{202F}", with: " ")
            .replacingOccurrences(of: "\u{00A0}", with: " ")
            .trimmingCharacters(in: .whitespaces)

        let hasComma = s.contains(",")
        let hasDot = s.contains(".")

        if hasComma && hasDot {
            // Le dernier séparateur rencontré est la décimale.
            if let lastComma = s.range(of: ",", options: .backwards)?.lowerBound,
               let lastDot = s.range(of: ".", options: .backwards)?.lowerBound {
                if lastComma > lastDot {
                    // Format français : 1.234,56
                    s = s.replacingOccurrences(of: ".", with: "")
                        .replacingOccurrences(of: ",", with: ".")
                } else {
                    // Format anglais : 1,234.56
                    s = s.replacingOccurrences(of: ",", with: "")
                }
            }
        } else if hasComma {
            let parts = s.split(separator: ",")
            if parts.count == 2 && parts[1].count <= 2 {
                // Virgule décimale (français) : 1234,56
                s = s.replacingOccurrences(of: ",", with: ".")
            } else {
                // Virgule = séparateur de milliers : 1,234
                s = s.replacingOccurrences(of: ",", with: "")
            }
        }
        s = s.replacingOccurrences(of: " ", with: "")
        return Double(s)
    }
}
