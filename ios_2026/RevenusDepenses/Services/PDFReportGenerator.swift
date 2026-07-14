import Foundation
import UIKit

/// Génère le rapport PDF destiné au comptable (UIGraphicsPDFRenderer, sans lib tierce).
///
/// Structure alignée sur les formulaires fiscaux :
/// 1. Page titre + résumé global
/// 2. Revenus locatifs par immeuble — lignes T776 / TP-128 (loyers bruts 8141,
///    dépenses par ligne officielle, part du copropriétaire, revenu net 9946)
/// 3. Travail autonome (T2125 / TP-80) — Uber (relevé annuel) et Lyft (mensuel)
/// 4. Dépenses véhicule — deux méthodes (réelles au prorata des km / taux fixe $ par km)
/// 5. Sommaire TPS/TVQ (chauffeur inscrit obligatoirement)
/// Annexe A — Journal de kilométrage détaillé (exigé en cas de vérification)
/// Annexe B — Détail mensuel par immeuble (2 semestres)
/// Annexe C — Notes et reçus photo
struct PDFReportGenerator {

    private static let pageWidth: CGFloat = 612   // Lettre US 8,5 × 11 po
    private static let pageHeight: CGFloat = 792
    private static let margin: CGFloat = 48
    private static var contentWidth: CGFloat { pageWidth - 2 * margin }

    // Couleurs de la charte
    private static let navy = UIColor(red: 0x1F / 255, green: 0x38 / 255, blue: 0x64 / 255, alpha: 1)
    private static let blue = UIColor(red: 0x00 / 255, green: 0x70 / 255, blue: 0xC0 / 255, alpha: 1)
    private static let green = UIColor(red: 0x37 / 255, green: 0x56 / 255, blue: 0x23 / 255, alpha: 1)
    private static let brown = UIColor(red: 0x7B / 255, green: 0x3F / 255, blue: 0x00 / 255, alpha: 1)
    private static let orange = UIColor(red: 0xE6 / 255, green: 0x51 / 255, blue: 0x00 / 255, alpha: 1)

    /// Correspondance catégorie de l'app → ligne officielle du T776.
    /// L'ordre suit celui du formulaire ; les catégories absentes tombent en 9270 Autres.
    private static let t776Lines: [(code: String, label: String, match: (String) -> Bool)] = [
        ("8521", "Publicité", { $0.contains("Publicité") }),
        ("8690", "Assurances", { $0.contains("Assurance") }),
        ("8710", "Intérêts et frais bancaires", { $0.contains("Intérêts") }),
        ("8810", "Frais de bureau", { $0.contains("Frais de bureau") }),
        ("8860", "Honoraires professionnels", { $0.contains("Honoraires") }),
        ("8871", "Frais de gestion et d'administration", { $0.contains("Frais de gestion") }),
        ("8960", "Entretien et réparations", { $0.contains("Entretien") }),
        ("9180", "Impôts fonciers", { $0.contains("Taxes municipales") || $0.contains("Taxe scolaire") }),
        ("9200", "Frais de déplacement", { $0 == AppConfig.travelExpenseCategory }),
        ("9220", "Services publics", { $0.contains("Électricité") || $0.contains("Chauffage") })
    ]

    static func generate(data: DataService) -> Data {
        let format = UIGraphicsPDFRendererFormat()
        let renderer = UIGraphicsPDFRenderer(
            bounds: CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight),
            format: format
        )

        let fy = data.ensureFiscalYear()
        var pageNumber = 0

        return renderer.pdfData { ctx in
            var y: CGFloat = 0

            // MARK: Primitives de dessin

            func newPage() {
                pageNumber += 1
                ctx.beginPage()
                y = margin
                let text = "\(AppConfig.ownerName) — Année fiscale \(fy.year)   •   Page \(pageNumber)"
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 9),
                    .foregroundColor: UIColor.gray
                ]
                let size = (text as NSString).size(withAttributes: attrs)
                (text as NSString).draw(
                    at: CGPoint(x: (pageWidth - size.width) / 2, y: pageHeight - margin + 16),
                    withAttributes: attrs
                )
            }

            func ensureSpace(_ needed: CGFloat) {
                if y + needed > pageHeight - margin - 24 {
                    newPage()
                }
            }

            func drawText(_ text: String, font: UIFont, color: UIColor = .black,
                          x: CGFloat = margin, spacing: CGFloat = 6, maxWidth: CGFloat? = nil) {
                let width = maxWidth ?? (pageWidth - margin - x)
                let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
                let bounding = (text as NSString).boundingRect(
                    with: CGSize(width: width, height: .greatestFiniteMagnitude),
                    options: [.usesLineFragmentOrigin], attributes: attrs, context: nil
                )
                ensureSpace(bounding.height + spacing)
                (text as NSString).draw(
                    in: CGRect(x: x, y: y, width: width, height: bounding.height),
                    withAttributes: attrs
                )
                y += bounding.height + spacing
            }

            func drawLine(label: String, amount: Double, bold: Bool = false,
                          color: UIColor = .black, indent: CGFloat = 8, fontSize: CGFloat = 10.5) {
                let font = bold ? UIFont.boldSystemFont(ofSize: fontSize) : UIFont.systemFont(ofSize: fontSize)
                ensureSpace(font.lineHeight + 5)
                (label as NSString).draw(
                    at: CGPoint(x: margin + indent, y: y),
                    withAttributes: [.font: font, .foregroundColor: color]
                )
                let amountText = AppConfig.currency(amount)
                let size = (amountText as NSString).size(withAttributes: [.font: font])
                (amountText as NSString).draw(
                    at: CGPoint(x: pageWidth - margin - size.width, y: y),
                    withAttributes: [.font: font, .foregroundColor: color]
                )
                y += font.lineHeight + 5
            }

            func drawSeparator() {
                ensureSpace(10)
                let path = UIBezierPath()
                path.move(to: CGPoint(x: margin, y: y + 2))
                path.addLine(to: CGPoint(x: pageWidth - margin, y: y + 2))
                UIColor.lightGray.setStroke()
                path.lineWidth = 0.5
                path.stroke()
                y += 8
            }

            func drawSectionTitle(_ title: String, color: UIColor = navy) {
                ensureSpace(30)
                y += 6
                drawText(title, font: .boldSystemFont(ofSize: 13), color: color)
                drawSeparator()
            }

            func drawNote(_ text: String) {
                drawText(text, font: .italicSystemFont(ofSize: 8.5), color: .darkGray, spacing: 8)
            }

            /// Ligne d'un tableau : colonnes (texte, largeur, alignement à droite ?).
            func drawTableRow(_ cells: [(text: String, width: CGFloat, alignRight: Bool)],
                              bold: Bool = false, fontSize: CGFloat = 8.5,
                              color: UIColor = .black, background: UIColor? = nil) {
                let font = bold ? UIFont.boldSystemFont(ofSize: fontSize) : UIFont.systemFont(ofSize: fontSize)
                let rowHeight = font.lineHeight + 4
                ensureSpace(rowHeight)
                if let background {
                    background.setFill()
                    UIBezierPath(rect: CGRect(x: margin, y: y - 1, width: contentWidth, height: rowHeight)).fill()
                }
                var x = margin
                for cell in cells {
                    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
                    var drawX = x + 2
                    if cell.alignRight {
                        let size = (cell.text as NSString).size(withAttributes: attrs)
                        drawX = x + cell.width - size.width - 2
                    }
                    (cell.text as NSString).draw(
                        in: CGRect(x: drawX, y: y + 1, width: cell.width - 4, height: font.lineHeight),
                        withAttributes: attrs
                    )
                    x += cell.width
                }
                y += rowHeight
            }

            let df = DateFormatter()
            df.locale = AppConfig.locale
            df.dateStyle = .long
            let dfShort = DateFormatter()
            dfShort.locale = AppConfig.locale
            dfShort.dateFormat = "d MMM"

            /// Montant compact pour les tableaux serrés (sans symbole $).
            let nf: NumberFormatter = {
                let f = NumberFormatter()
                f.numberStyle = .decimal
                f.locale = AppConfig.locale
                f.minimumFractionDigits = 2
                f.maximumFractionDigits = 2
                return f
            }()
            func compact(_ v: Double) -> String {
                v == 0 ? "—" : (nf.string(from: NSNumber(value: v)) ?? "0,00")
            }

            // ============================================================
            // 1. PAGE TITRE + RÉSUMÉ GLOBAL
            // ============================================================
            // Modules retenus dans l'assistant de configuration : le rapport
            // n'inclut que les sections des activités suivies.
            let rentalProps = AppSetup.moduleProperties ? data.properties() : []
            let includeRideshare = AppSetup.moduleRideshare
            let includeTrips = AppSetup.moduleTrips

            newPage()
            drawText("Dossier fiscal \(fy.year)", font: .boldSystemFont(ofSize: 22), color: navy, spacing: 2)
            var scopeParts: [String] = []
            if !rentalProps.isEmpty { scopeParts.append("Revenus locatifs (T776 / TP-128)") }
            if includeRideshare { scopeParts.append("travail autonome (T2125 / TP-80)") }
            if scopeParts.isEmpty { scopeParts.append("Journal de kilométrage") }
            drawText(scopeParts.joined(separator: " et "),
                     font: .systemFont(ofSize: 11), color: .darkGray, spacing: 12)

            drawText("Contribuable : \(AppConfig.ownerName)", font: .systemFont(ofSize: 10.5), spacing: 3)
            drawText("Adresse : \(AppConfig.homeAddress)", font: .systemFont(ofSize: 10.5), spacing: 3)
            if includeTrips || includeRideshare {
                drawText("Véhicule : \(fy.vehicleModel) — \(AppConfig.km(fy.vehicleTotalKm)) parcourus dans l'année",
                         font: .systemFont(ofSize: 10.5), spacing: 3)
            }
            drawText("Rapport généré le \(df.string(from: Date())) — montants en dollars canadiens",
                     font: .systemFont(ofSize: 9), color: .gray, spacing: 12)

            drawSectionTitle("Résumé global")
            if !rentalProps.isEmpty {
                let label = rentalProps.count > 1
                    ? "Revenus locatifs bruts (\(rentalProps.count) immeubles)"
                    : "Revenus locatifs bruts"
                drawLine(label: label, amount: data.totalRevenueAll())
                drawLine(label: "Dépenses locatives déductibles", amount: data.totalDeductibleAll())
                drawLine(label: "Bénéfice locatif net (avant part des copropriétaires)",
                         amount: data.rentalNetGlobal(), bold: true, color: green)
                drawLine(label: "Dépenses en capital (DPA à évaluer par le comptable)",
                         amount: data.totalCapitalAll(), color: brown)
                y += 4
            }
            if includeTrips && rentalProps.isEmpty {
                drawLine(label: "Frais de déplacement (journal de kilométrage, annexe A)",
                         amount: data.totalTripsAmount(), bold: true, color: green)
                y += 4
            }
            if includeRideshare {
                drawLine(label: "Revenu net Uber (revenus − frais Uber)", amount: data.uberNetIncome())
                drawLine(label: "Revenu taxable Lyft", amount: data.lyftTaxableTotal())
                drawLine(label: "Déduction véhicule Uber (méthode dépenses réelles)",
                         amount: -data.vehicleDeductionUber())
                drawLine(label: "Déduction véhicule Lyft (méthode dépenses réelles)",
                         amount: -data.vehicleDeductionLyft())
            }
            y += 6
            drawNote("Les sections suivantes reprennent les lignes des formulaires fiscaux pour transcription directe. "
                     + "Les annexes fournissent les pièces justificatives (journal de kilométrage, détail mensuel, notes et reçus).")

            // ============================================================
            // 2. IMMEUBLES LOCATIFS — T776 / TP-128
            // ============================================================
            for prop in rentalProps {
                newPage()
                let pct = prop.ownershipPct
                let coOwner = prop.coOwners

                drawText("Revenus de location — \(prop.name)",
                         font: .boldSystemFont(ofSize: 16), color: blue, spacing: 2)
                drawText("Formulaire T776 (fédéral) / TP-128 (Québec)", font: .systemFont(ofSize: 9), color: .gray, spacing: 8)

                drawText("Adresse : \(prop.address)", font: .systemFont(ofSize: 10), spacing: 3)
                drawText("Nombre d'unités : \(prop.revenueCategories.count)", font: .systemFont(ofSize: 10), spacing: 3)
                let coOwnerText = coOwner.isEmpty ? "" : " — copropriétaire : \(coOwner) (\(AppConfig.percent((100 - pct) / 100)))"
                drawText("Participation du contribuable : \(AppConfig.percent(pct / 100))\(coOwnerText)",
                         font: .systemFont(ofSize: 10), spacing: 10)

                // --- Revenus bruts (8141) ---
                drawSectionTitle("Revenus bruts de location — ligne 8141", color: green)
                for cat in prop.revenueCategories {
                    let total = data.categoryAnnualTotal(propertyId: prop.propId, section: .revenue, category: cat)
                    if total != 0 { drawLine(label: cat, amount: total, indent: 16, fontSize: 9.5) }
                }
                drawLine(label: "Loyers bruts (ligne 8141)",
                         amount: data.sectionAnnualTotal(propertyId: prop.propId, section: .revenue), bold: true)

                // --- Dépenses par ligne T776 ---
                drawSectionTitle(pct < 100
                    ? "Dépenses d'exploitation (montants à 100 % — votre part de \(AppConfig.percent(pct / 100)) appliquée au revenu net)"
                    : "Dépenses d'exploitation (part 100 %)", color: orange)
                var mapped = Set<String>()
                for line in t776Lines {
                    let cats = prop.deductibleCategories.filter(line.match)
                    guard !cats.isEmpty else { continue }
                    mapped.formUnion(cats)
                    let total = cats.reduce(0) {
                        $0 + data.categoryAnnualTotal(propertyId: prop.propId, section: .deductible, category: $1)
                    }
                    guard total != 0 else { continue }
                    drawLine(label: "\(line.code) — \(line.label)", amount: total, bold: true, fontSize: 10)
                    if cats.count > 1 {
                        for cat in cats {
                            let t = data.categoryAnnualTotal(propertyId: prop.propId, section: .deductible, category: cat)
                            if t != 0 { drawLine(label: cat, amount: t, color: .darkGray, indent: 24, fontSize: 9) }
                        }
                    }
                }
                // 9270 Autres dépenses : tout ce qui n'a pas été mappé.
                let otherCats = prop.deductibleCategories.filter { !mapped.contains($0) }
                let otherTotal = otherCats.reduce(0) {
                    $0 + data.categoryAnnualTotal(propertyId: prop.propId, section: .deductible, category: $1)
                }
                if otherTotal != 0 {
                    drawLine(label: "9270 — Autres dépenses", amount: otherTotal, bold: true, fontSize: 10)
                    for cat in otherCats {
                        let t = data.categoryAnnualTotal(propertyId: prop.propId, section: .deductible, category: cat)
                        if t != 0 { drawLine(label: cat, amount: t, color: .darkGray, indent: 24, fontSize: 9) }
                    }
                }
                y += 4
                let totalExpenses = data.sectionAnnualTotal(propertyId: prop.propId, section: .deductible)
                drawLine(label: "Total des dépenses (ligne 9949)", amount: totalExpenses, bold: true)
                drawNote("La ligne 9200 « Frais de déplacement » est calculée automatiquement depuis le journal de kilométrage "
                         + "(annexe A) au taux de \(AppConfig.currency(fy.kmRate))/km. Le comptable peut préférer la méthode "
                         + "des dépenses réelles au prorata — voir la section Véhicule.")

                // --- Net et part du copropriétaire ---
                drawSectionTitle("Revenu net", color: green)
                let net = data.annualNet(propertyId: prop.propId)
                drawLine(label: "Revenu net avant répartition (ligne 9369)", amount: net, bold: true)
                if pct < 100 {
                    drawLine(label: "Part des copropriétaires (\(AppConfig.percent((100 - pct) / 100)))",
                             amount: net * (100 - pct) / 100, color: .darkGray)
                    drawLine(label: "Votre part du revenu net (ligne 9946) — \(AppConfig.percent(pct / 100))",
                             amount: net * pct / 100, bold: true, color: green)
                } else {
                    drawLine(label: "Votre part du revenu net (ligne 9946) — 100 %", amount: net, bold: true, color: green)
                }

                // --- Dépenses en capital ---
                let capTotal = data.sectionAnnualTotal(propertyId: prop.propId, section: .capital)
                if capTotal != 0 {
                    drawSectionTitle("Dépenses en capital — ajouts de l'année (DPA, annexe du T776)", color: brown)
                    for cat in prop.capitalCategories {
                        let total = data.categoryAnnualTotal(propertyId: prop.propId, section: .capital, category: cat)
                        if total != 0 { drawLine(label: cat, amount: total, indent: 16, fontSize: 9.5) }
                    }
                    drawLine(label: "Total des ajouts en capital", amount: capTotal, bold: true, color: brown)
                    drawNote("Ces montants ne sont pas déduits du revenu courant : le comptable détermine la catégorie de DPA "
                             + "et l'amortissement admissible.")
                }
            }

            // ============================================================
            // 3. TRAVAIL AUTONOME — T2125 / TP-80 (module Rideshare)
            // 4. VÉHICULE + 5. TPS/TVQ — mêmes activités, même condition
            // ============================================================
            if includeRideshare {
            newPage()
            drawText("Travail autonome — transport rémunéré de personnes", font: .boldSystemFont(ofSize: 16), color: orange, spacing: 2)
            drawText("Formulaire T2125 (fédéral) / TP-80 (Québec)", font: .systemFont(ofSize: 9), color: .gray, spacing: 10)

            // --- Uber ---
            drawSectionTitle("Uber — relevé fiscal annuel", color: orange)
            for group in AppConfig.uberGroups where group.title != "Pour déclaration TPS/TVQ" {
                var groupHasValues = false
                for field in group.fields where data.uberValue(field.key) != 0 {
                    if !groupHasValues {
                        drawText(group.title, font: .boldSystemFont(ofSize: 10), color: .darkGray, spacing: 4)
                        groupHasValues = true
                    }
                    drawLine(label: field.label, amount: data.uberValue(field.key), indent: 16, fontSize: 9.5)
                }
            }
            y += 4
            let uberRevenue = AppConfig.uberRevenueKeys.reduce(0) { $0 + data.uberValue($1) }
                + AppConfig.uberOtherIncomeKeys.reduce(0) { $0 + data.uberValue($1) }
            let uberFees = AppConfig.uberFeeKeys.reduce(0) { $0 + data.uberValue($1) } - data.uberValue("fee_discount")
            drawLine(label: "Revenus bruts Uber (courses + autres revenus)", amount: uberRevenue, bold: true)
            drawLine(label: "Frais de service Uber (dépense déductible)", amount: uberFees, bold: true)
            drawLine(label: "Revenu net Uber avant dépenses véhicule", amount: data.uberNetIncome(), bold: true, color: green)
            if data.uberKmOnline() != 0 || data.uberValue("km_on_trip") != 0 {
                drawText("Kilométrage Uber : \(AppConfig.km(data.uberValue("km_on_trip"))) en course — "
                         + "\(AppConfig.km(data.uberKmOnline())) en ligne (base retenue, recommandation Revenu Québec)",
                         font: .systemFont(ofSize: 9), color: .darkGray, spacing: 8)
            }

            // --- Lyft (tableau mensuel) ---
            drawSectionTitle("Lyft — détail mensuel", color: UIColor(red: 0xAD / 255, green: 0x14 / 255, blue: 0x57 / 255, alpha: 1))
            let lyftMonths = data.lyftMonths().filter {
                $0.taxable != 0 || $0.bonuses != 0 || $0.tips != 0 || $0.fees != 0 || $0.km != 0
            }
            if lyftMonths.isEmpty {
                drawText("Aucune donnée Lyft saisie pour \(fy.year).", font: .systemFont(ofSize: 9.5), color: .gray, spacing: 8)
            } else {
                let w = contentWidth
                let cols: [CGFloat] = [w * 0.16, w * 0.15, w * 0.13, w * 0.14, w * 0.13, w * 0.15, w * 0.14]
                func lyftRow(_ label: String, _ values: [String], bold: Bool = false, bg: UIColor? = nil) {
                    var cells: [(text: String, width: CGFloat, alignRight: Bool)] = [(label, cols[0], false)]
                    for (value, width) in zip(values, cols.dropFirst()) {
                        cells.append((value, width, true))
                    }
                    drawTableRow(cells, bold: bold, background: bg)
                }
                lyftRow("Mois", ["Taxable", "Primes", "Pourboires", "Frais", "Net", "Km"],
                        bold: true, bg: UIColor(white: 0.92, alpha: 1))
                for m in lyftMonths {
                    lyftRow(AppConfig.monthNames[m.month],
                            [compact(m.taxable), compact(m.bonuses), compact(m.tips),
                             compact(m.fees), compact(m.net), compact(m.km)])
                }
                let totals = lyftMonths.reduce(into: (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)) {
                    $0.0 += $1.taxable; $0.1 += $1.bonuses; $0.2 += $1.tips
                    $0.3 += $1.fees; $0.4 += $1.net; $0.5 += $1.km
                }
                lyftRow("TOTAL", [compact(totals.0), compact(totals.1), compact(totals.2),
                                  compact(totals.3), compact(totals.4), compact(totals.5)],
                        bold: true, bg: UIColor(white: 0.92, alpha: 1))
            }

            // ============================================================
            // 4. VÉHICULE — deux méthodes de déduction
            // ============================================================
            newPage()
            drawText("Dépenses véhicule — \(fy.vehicleModel)", font: .boldSystemFont(ofSize: 16), color: navy, spacing: 10)

            drawSectionTitle("Dépenses réelles de l'année (100 %)")
            for cat in AppConfig.vehicleCategories {
                let amount = data.vehicleAmount(category: cat)
                if amount != 0 { drawLine(label: cat, amount: amount, indent: 16, fontSize: 9.5) }
            }
            drawLine(label: "Total des dépenses véhicule", amount: data.vehicleTotalExpenses(), bold: true)

            drawSectionTitle("Répartition du kilométrage annuel")
            drawText("Km total du véhicule dans l'année : \(AppConfig.km(fy.vehicleTotalKm))",
                     font: .boldSystemFont(ofSize: 10.5), x: margin + 8, spacing: 5)
            drawText("Uber (en ligne) : \(AppConfig.km(data.uberKmOnline())) → \(AppConfig.percent(data.pctUber()))",
                     font: .systemFont(ofSize: 9.5), x: margin + 16, spacing: 3)
            drawText("Lyft : \(AppConfig.km(data.lyftKmTotal())) → \(AppConfig.percent(data.pctLyft()))",
                     font: .systemFont(ofSize: 9.5), x: margin + 16, spacing: 3)
            drawText("Immeubles locatifs : \(AppConfig.km(data.rentalKmTotal())) → \(AppConfig.percent(data.pctRental()))",
                     font: .systemFont(ofSize: 9.5), x: margin + 16, spacing: 8)

            drawSectionTitle("Méthode 1 — dépenses réelles au prorata des km")
            drawLine(label: "Déduction Uber (total × \(AppConfig.percent(data.pctUber())))",
                     amount: data.vehicleDeductionUber())
            drawLine(label: "Déduction Lyft (total × \(AppConfig.percent(data.pctLyft())))",
                     amount: data.vehicleDeductionLyft())
            drawLine(label: "Portion locative (total × \(AppConfig.percent(data.pctRental())))",
                     amount: data.vehicleTotalExpenses() * data.pctRental())

            drawSectionTitle("Méthode 2 — taux fixe \(AppConfig.currency(fy.kmRate)) / km")
            drawLine(label: "Uber (\(AppConfig.km(data.uberKmOnline())))", amount: data.uberKmOnline() * fy.kmRate)
            drawLine(label: "Lyft (\(AppConfig.km(data.lyftKmTotal())))", amount: data.lyftKmTotal() * fy.kmRate)
            drawLine(label: "Immeubles locatifs (\(AppConfig.km(data.rentalKmTotal())))",
                     amount: data.rentalKmTotal() * fy.kmRate)
            drawNote("Une seule méthode doit être retenue par activité — le comptable choisit la plus avantageuse. "
                     + "La ligne « Frais de déplacement » des immeubles (T776, ligne 9200) utilise déjà la méthode 2 ; "
                     + "si la méthode 1 est retenue pour le locatif, remplacer la ligne 9200 par la portion locative ci-dessus.")

            // ============================================================
            // 5. TPS / TVQ
            // ============================================================
            drawSectionTitle("Sommaire TPS / TVQ — activité rideshare", color: blue)
            drawLine(label: "TPS perçue des passagers", amount: data.uberValue("gst_riders"))
            drawLine(label: "TVQ perçue des passagers", amount: data.uberValue("qst_riders"))
            drawLine(label: "TPS payée à Uber (CTI potentiel)", amount: data.uberValue("gst_paid_uber"))
            drawLine(label: "TVQ payée à Uber (RTI potentiel)", amount: data.uberValue("qst_paid_uber"))
            drawLine(label: "TPS déjà versée par Uber en votre nom", amount: data.uberValue("gst_remitted"))
            drawLine(label: "TVQ déjà versée par Uber en votre nom", amount: data.uberValue("qst_remitted"))
            drawNote("Les chauffeurs de transport rémunéré doivent être inscrits aux fichiers TPS/TVQ dès le premier dollar. "
                     + "Uber verse généralement les taxes perçues directement à Revenu Québec — les montants « versés en votre nom » "
                     + "doivent apparaître dans la déclaration de taxes annuelle.")
            } // fin module Rideshare

            // ============================================================
            // ANNEXE A — JOURNAL DE KILOMÉTRAGE (module Déplacements)
            // ============================================================
            if includeTrips {
            newPage()
            drawText("Annexe A — Journal de kilométrage \(fy.year)", font: .boldSystemFont(ofSize: 16), color: navy, spacing: 2)
            drawText("Taux appliqué : \(AppConfig.currency(fy.kmRate))/km — registre exigé par l'ARC et Revenu Québec en cas de vérification",
                     font: .systemFont(ofSize: 9), color: .gray, spacing: 10)

            let allTrips = data.trips().sorted { $0.date < $1.date }
            if allTrips.isEmpty {
                drawText("Aucun trajet enregistré pour \(fy.year).", font: .systemFont(ofSize: 9.5), color: .gray)
            } else {
                let w = contentWidth
                let tripCols: [CGFloat] = [w * 0.11, w * 0.30, w * 0.33, w * 0.11, w * 0.15]
                drawTableRow([("Date", tripCols[0], false), ("Destination", tripCols[1], false),
                              ("Motif", tripCols[2], false), ("Km", tripCols[3], true),
                              ("Montant", tripCols[4], true)],
                             bold: true, background: UIColor(white: 0.92, alpha: 1))
                var currentMonth = -1
                var monthKm = 0.0
                func flushMonthSubtotal() {
                    guard currentMonth >= 0 else { return }
                    drawTableRow([("Sous-total \(AppConfig.monthNames[currentMonth])", tripCols[0] + tripCols[1] + tripCols[2], false),
                                  (compact(monthKm), tripCols[3], true),
                                  (compact(monthKm * fy.kmRate), tripCols[4], true)],
                                 bold: true, background: UIColor(white: 0.96, alpha: 1))
                }
                for trip in allTrips {
                    if trip.month != currentMonth {
                        flushMonthSubtotal()
                        currentMonth = trip.month
                        monthKm = 0
                    }
                    monthKm += trip.km
                    let destination = trip.destinationLabel.isEmpty
                        ? (data.property(id: trip.propertyId)?.name ?? trip.propertyId)
                        : trip.destinationLabel
                    let purpose = trip.purpose.isEmpty
                        ? (trip.roundTrip ? "Aller-retour" : "Aller simple")
                        : trip.purpose
                    drawTableRow([(dfShort.string(from: trip.date), tripCols[0], false),
                                  (destination, tripCols[1], false),
                                  (purpose, tripCols[2], false),
                                  (compact(trip.km), tripCols[3], true),
                                  (compact(trip.km * fy.kmRate), tripCols[4], true)])
                }
                flushMonthSubtotal()
                let totalTripKm = allTrips.reduce(0) { $0 + $1.km }
                drawTableRow([("TOTAL ANNUEL — \(allTrips.count) trajets", tripCols[0] + tripCols[1] + tripCols[2], false),
                              (compact(totalTripKm), tripCols[3], true),
                              (compact(totalTripKm * fy.kmRate), tripCols[4], true)],
                             bold: true, background: UIColor(white: 0.92, alpha: 1))
            }
            } // fin module Déplacements

            // ============================================================
            // ANNEXE B — DÉTAIL MENSUEL PAR IMMEUBLE
            // ============================================================
            for prop in rentalProps {
                newPage()
                drawText("Annexe B — Détail mensuel \(fy.year) : \(prop.name)",
                         font: .boldSystemFont(ofSize: 15), color: blue, spacing: 10)

                let w = contentWidth
                let labelW = w * 0.28
                let monthW = (w - labelW) / 7  // 6 mois + total semestre

                func monthlyTable(section: EntrySection, title: String, color: UIColor, categories: [String]) {
                    // Seules les catégories avec au moins un montant dans l'année.
                    let active = categories.filter {
                        data.categoryAnnualTotal(propertyId: prop.propId, section: section, category: $0) != 0
                    }
                    guard !active.isEmpty else { return }
                    drawSectionTitle(title, color: color)
                    for semester in 0..<2 {
                        let months = Array((semester * 6)..<(semester * 6 + 6))
                        var header: [(String, CGFloat, Bool)] = [("Catégorie", labelW, false)]
                        header += months.map { (AppConfig.monthShortNames[$0], monthW, true) }
                        header.append(("Total", monthW, true))
                        drawTableRow(header, bold: true, fontSize: 7.5, background: UIColor(white: 0.92, alpha: 1))
                        for cat in active {
                            var row: [(String, CGFloat, Bool)] = [(cat, labelW, false)]
                            var semTotal = 0.0
                            for m in months {
                                let v = data.amount(propertyId: prop.propId, section: section, category: cat, month: m)
                                semTotal += v
                                row.append((compact(v), monthW, true))
                            }
                            row.append((compact(semTotal), monthW, true))
                            drawTableRow(row, fontSize: 7.5)
                        }
                        var totalRow: [(String, CGFloat, Bool)] = [("Total", labelW, false)]
                        var semGrand = 0.0
                        for m in months {
                            let v = data.sectionTotal(propertyId: prop.propId, section: section, month: m)
                            semGrand += v
                            totalRow.append((compact(v), monthW, true))
                        }
                        totalRow.append((compact(semGrand), monthW, true))
                        drawTableRow(totalRow, bold: true, fontSize: 7.5, background: UIColor(white: 0.96, alpha: 1))
                        y += 6
                    }
                }

                monthlyTable(section: .revenue, title: "Revenus de location", color: green,
                             categories: prop.revenueCategories)
                monthlyTable(section: .deductible, title: "Dépenses déductibles", color: orange,
                             categories: prop.deductibleCategories)
                monthlyTable(section: .capital, title: "Dépenses en capital", color: brown,
                             categories: prop.capitalCategories)
            }

            // ============================================================
            // ANNEXE C — NOTES ET REÇUS
            // ============================================================
            var annexCStarted = false
            for prop in rentalProps {
                let annotated = data.entries(propertyId: prop.propId)
                    .filter { !$0.note.isEmpty || $0.receiptImage != nil }
                    .sorted { ($0.month, $0.category) < ($1.month, $1.category) }
                guard !annotated.isEmpty else { continue }
                if !annexCStarted {
                    newPage()
                    drawText("Annexe C — Notes et reçus", font: .boldSystemFont(ofSize: 16), color: navy, spacing: 10)
                    annexCStarted = true
                }
                drawSectionTitle(prop.name, color: blue)
                for entry in annotated {
                    ensureSpace(40)
                    drawText("\(AppConfig.monthNames[entry.month]) — \(entry.category) : \(AppConfig.currency(entry.amount))",
                             font: .boldSystemFont(ofSize: 10), spacing: 2)
                    if !entry.note.isEmpty {
                        drawText("Note : \(entry.note)", font: .systemFont(ofSize: 9.5), color: .darkGray,
                                 x: margin + 12, spacing: 4)
                    }
                    if let imgData = entry.receiptImage, let image = UIImage(data: imgData) {
                        let maxH: CGFloat = 180
                        let scale = min(maxH / image.size.height, (contentWidth * 0.6) / image.size.width, 1)
                        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                        ensureSpace(size.height + 10)
                        image.draw(in: CGRect(x: margin + 12, y: y, width: size.width, height: size.height))
                        y += size.height + 8
                    }
                    y += 4
                }
            }
        }
    }
}
