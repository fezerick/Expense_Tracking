import Foundation

/// Export CSV du sommaire fiscal (compatible Excel / Numbers, séparateur point-virgule
/// pour la locale française canadienne).
struct CSVExportService {

    static func summaryCSV(data: DataService) -> String {
        var lines: [String] = []
        let fy = data.ensureFiscalYear()
        lines.append("Sommaire fiscal \(fy.year);;;")
        lines.append("Source;Revenus;Dépenses déductibles;Bénéfice")

        // Seuls les modules suivis (assistant de configuration) sont exportés.
        let props = AppSetup.moduleProperties ? data.properties() : []
        for prop in props {
            let rev = data.sectionAnnualTotal(propertyId: prop.propId, section: .revenue)
            let ded = data.sectionAnnualTotal(propertyId: prop.propId, section: .deductible)
            lines.append("\(escape(prop.name));\(number(rev));\(number(ded));\(number(rev - ded))")
        }

        let uberDed = data.vehicleDeductionUber()
        let lyftDed = data.vehicleDeductionLyft()
        let uberRev = data.uberNetIncome()
        let lyftRev = data.lyftNetTotal()
        if AppSetup.moduleRideshare {
            lines.append("Uber (net des frais Uber);\(number(uberRev));\(number(uberDed));\(number(uberRev - uberDed))")
            lines.append("Lyft (net des frais Lyft);\(number(lyftRev));\(number(lyftDed));\(number(lyftRev - lyftDed))")
        }

        let totalRev = data.totalRevenueAll() + (AppSetup.moduleRideshare ? uberRev + lyftRev : 0)
        let totalDed = data.totalDeductibleAll() + (AppSetup.moduleRideshare ? uberDed + lyftDed : 0)
        lines.append("TOTAL;\(number(totalRev));\(number(totalDed));\(number(data.globalNet(includeRideshare: AppSetup.moduleRideshare)))")

        lines.append(";;;")
        lines.append("Détail par propriété et catégorie;;;")
        lines.append("Propriété;Section;Catégorie;Total annuel")
        for prop in props {
            for (section, cats) in [(EntrySection.revenue, prop.revenueCategories),
                                    (.deductible, prop.deductibleCategories),
                                    (.capital, prop.capitalCategories)] {
                for cat in cats {
                    let total = data.categoryAnnualTotal(propertyId: prop.propId, section: section, category: cat)
                    if total != 0 {
                        lines.append("\(escape(prop.name));\(sectionName(section));\(escape(cat));\(number(total))")
                    }
                }
            }
        }

        if AppSetup.moduleTrips {
            lines.append(";;;")
            lines.append("Journal des trajets;;;")
            lines.append("Date;Destination;Motif;Km")
            let df = DateFormatter()
            df.locale = AppConfig.locale
            df.dateFormat = "yyyy-MM-dd"
            for trip in data.trips().sorted(by: { $0.date < $1.date }) {
                lines.append("\(df.string(from: trip.date));\(escape(trip.destinationLabel));\(escape(trip.purpose));\(number(trip.km))")
            }
        }

        return lines.joined(separator: "\n")
    }

    private static func sectionName(_ section: EntrySection) -> String {
        switch section {
        case .revenue: return "Revenus"
        case .deductible: return "Dépenses déductibles"
        case .capital: return "Dépenses en capital"
        }
    }

    private static func number(_ value: Double) -> String {
        String(format: "%.2f", value).replacingOccurrences(of: ".", with: ",")
    }

    private static func escape(_ text: String) -> String {
        text.contains(";") || text.contains("\"")
            ? "\"" + text.replacingOccurrences(of: "\"", with: "\"\"") + "\""
            : text
    }
}
