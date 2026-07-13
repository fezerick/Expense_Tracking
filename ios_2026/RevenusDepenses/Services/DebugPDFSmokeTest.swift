import Foundation
import SwiftData
import UIKit

#if DEBUG
/// Outil de développement : lancé avec la variable d'environnement PDF_SMOKE_TEST=1
/// (préfixe SIMCTL_CHILD_ via simctl), sème des données d'exemple dans l'année 2026
/// puis écrit le rapport PDF dans Documents/smoke_test_report.pdf pour inspection.
/// Jamais exécuté dans un build Release ni sans la variable d'environnement.
enum DebugPDFSmokeTest {

    static func runIfRequested(context: ModelContext) {
        guard ProcessInfo.processInfo.environment["PDF_SMOKE_TEST"] == "1" else { return }

        let data = DataService(context: context, year: 2026)
        data.eraseYearData()
        seed(data: data, context: context)

        let pdf = PDFReportGenerator.generate(data: data)
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("smoke_test_report.pdf")
        try? pdf.write(to: url)
        print("PDF_SMOKE_TEST: rapport écrit → \(url.path)")
    }

    private static func seed(data: DataService, context: ModelContext) {
        let fy = data.ensureFiscalYear()
        fy.ownershipPct1090 = 50
        fy.coOwner1090 = "Conjointe Exemple"

        var comps = DateComponents(year: 2026, month: 1, day: 12)
        let cal = Calendar.current
        for m in 1...6 {
            comps.month = m
            comps.day = 10 + m
            data.addTrip(date: cal.date(from: comps)!, propertyId: "p1090",
                         destinationLabel: AppConfig.p1090.name, km: 110.8,
                         roundTrip: true, purpose: "Collecte des loyers")
            if m % 2 == 0 {
                comps.day = 20
                data.addTrip(date: cal.date(from: comps)!, propertyId: "p470",
                             destinationLabel: AppConfig.p470.name, km: 330,
                             roundTrip: true, purpose: "Réparation plomberie")
            }
        }

        for m in 0..<6 {
            for cat in AppConfig.p1090.revenueCategories {
                data.setAmount(750, propertyId: "p1090", section: .revenue, category: cat, month: m)
            }
            data.setAmount(310, propertyId: "p1090", section: .deductible,
                           category: "Taxes municipales", month: m)
            data.setAmount(95, propertyId: "p1090", section: .deductible,
                           category: "Électricité", month: m)
            data.setAmount(72, propertyId: "p1090", section: .deductible,
                           category: "Assurance habitation", month: m)
            for cat in AppConfig.p470.revenueCategories {
                data.setAmount(980, propertyId: "p470", section: .revenue, category: cat, month: m)
            }
            data.setAmount(410, propertyId: "p470", section: .deductible,
                           category: "Taxes municipales", month: m)
            data.setAmount(650, propertyId: "p470", section: .deductible,
                           category: "Intérêts sur hypothèque / frais bancaires", month: m)
        }
        data.setAmount(4800, propertyId: "p470", section: .capital,
                       category: "Rénovation / Amélioration — Logement 2", month: 3)

        if let entry = data.entry(propertyId: "p470", section: .capital,
                                  category: "Rénovation / Amélioration — Logement 2",
                                  month: 3, createIfMissing: true) {
            entry.note = "Facture Rona no 4521 — rénovation salle de bain"
            entry.receiptImage = sampleReceiptImage()
        }

        data.setUberValue(18450.30, key: "rides_gross")
        data.setUberValue(512.40, key: "tips_rides")
        data.setUberValue(922.50, key: "gst_riders")
        data.setUberValue(1840.20, key: "qst_riders")
        data.setUberValue(4612.60, key: "service_fee")
        data.setUberValue(230.60, key: "gst_paid_uber")
        data.setUberValue(460.10, key: "qst_paid_uber")
        data.setUberValue(922.50, key: "gst_remitted")
        data.setUberValue(1840.20, key: "qst_remitted")
        data.setUberValue(9800, key: "km_online")
        data.setUberValue(7400, key: "km_on_trip")

        for m in 0..<4 {
            guard let lm = data.lyftMonth(m, createIfMissing: true) else { continue }
            lm.taxable = 1240 + Double(m) * 55
            lm.bonuses = 80
            lm.tips = 62.50
            lm.fees = 310
            lm.km = 820
            lm.courses = 96
        }

        data.setVehicleAmount(2450, category: "Frais de carburant (total annuel)")
        data.setVehicleAmount(1620, category: "Frais d'assurance")
        data.setVehicleAmount(289, category: "Changement d'huile")
        data.setVehicleAmount(1180, category: "Achat et changement de pneus")
        data.setVehicleAmount(540, category: "Forfait annuel téléphone")
    }

    private static func sampleReceiptImage() -> Data? {
        let size = CGSize(width: 400, height: 240)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { ctx in
            UIColor(white: 0.95, alpha: 1).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            let text = "REÇU EXEMPLE\nRona — 4 521\nTotal : 4 800,00 $"
            (text as NSString).draw(
                in: CGRect(x: 24, y: 24, width: 352, height: 192),
                withAttributes: [.font: UIFont.boldSystemFont(ofSize: 24),
                                 .foregroundColor: UIColor.darkGray]
            )
        }
        return image.jpegData(compressionQuality: 0.8)
    }
}
#endif
