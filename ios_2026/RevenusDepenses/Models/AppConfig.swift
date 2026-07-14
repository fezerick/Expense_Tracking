import SwiftUI

/// Configuration centrale de l'application.
/// Toutes les valeurs de référence (propriétés, catégories, taux par défaut)
/// sont regroupées ici — aucune chaîne magique éparpillée dans les vues.
enum AppConfig {

    // MARK: - Profil par défaut

    static let ownerName = "Eric Fezeu"
    static let homeAddress = "505 rue du Muscat, Sainte-Marthe-sur-le-Lac, QC"
    static let defaultVehicleModel = "Mitsubishi Outlander 2025"
    static let defaultYear = 2026
    static let defaultKmRate = 0.72
    static let defaultVehicleTotalKm = 22000.0

    static let cloudKitContainerID = "iCloud.com.ericfezeu.revenusdepenses"

    /// À activer une fois la capability iCloud (CloudKit) réactivée dans Xcode
    /// Signing & Capabilities avec un compte développeur Apple payant.
    static let iCloudCapabilityEnabled = false

    // MARK: - Mois

    static let monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                             "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

    static let monthShortNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
                                  "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]

    // MARK: - Propriétés locatives

    struct PropertyDef: Identifiable, Hashable {
        let id: String
        let name: String
        let shortName: String
        let address: String
        /// Distance aller simple depuis le domicile, en km.
        let oneWayKm: Double
        let revenueCategories: [String]
        let deductibleCategories: [String]
        let capitalCategories: [String]
    }

    /// Libellé exact de la ligne de dépense calculée automatiquement depuis le journal de trajets.
    static let travelExpenseCategory = "Frais de déplacement"

    static let p1090 = PropertyDef(
        id: "p1090",
        name: "1090 Oscar-Benoît",
        shortName: "1090",
        address: "1090 Oscar-Benoît, Pointe-aux-Trembles, Montréal, QC",
        oneWayKm: 55.4,
        revenueCategories: [
            "Coloc 1 (Salon)",
            "Coloc 2 (Ch.Princ)",
            "Coloc 3 (Ch. Bur)"
        ],
        deductibleCategories: [
            "Taxes municipales",
            "Taxe scolaire",
            "Électricité",
            "Chauffage (mazout / plan entretien)",
            "Frais de condo",
            "Internet",
            "Assurance habitation",
            "Système d'alarme",
            travelExpenseCategory,
            "Entretien / Réparations courantes",
            "Honoraires professionnels (comptable, notaire)",
            "Frais de gestion",
            "Frais de bureau (papeterie, clés)",
            "Publicité",
            "Outils / Matériel",
            "Intérêts sur hypothèque / frais bancaires",
            "Autres dépenses déductibles"
        ],
        capitalCategories: [
            "Rénovation / Amélioration majeure",
            "Remplacement équipements (chauffe-eau, fournaise)",
            "Autres travaux majeurs"
        ]
    )

    static let p470 = PropertyDef(
        id: "p470",
        name: "470 Rue Gélinas (Triplex)",
        shortName: "470",
        address: "470 Rue Gélinas, Trois-Rivières, QC",
        oneWayKm: 165,
        revenueCategories: [
            "Logement 470",
            "Logement 468",
            "Logement 468 A"
        ],
        deductibleCategories: [
            "Taxes municipales",
            "Taxe scolaire",
            "Électricité (parties communes)",
            "Chauffage (mazout / plan entretien)",
            "Frais de déneigement",
            "Assurance habitation",
            "Système d'alarme",
            travelExpenseCategory,
            "Entretien / Réparations courantes (parties communes)",
            "Honoraires professionnels (comptable, notaire)",
            "Frais de gestion",
            "Frais de bureau (papeterie, clés)",
            "Publicité",
            "Outils / Matériel",
            "Intérêts sur hypothèque / frais bancaires",
            "Autres dépenses déductibles"
        ],
        capitalCategories: [
            "Rénovation / Amélioration — Logement 1",
            "Rénovation / Amélioration — Logement 2",
            "Rénovation / Amélioration — Logement 3",
            "Rénovation / Amélioration — Parties communes",
            "Remplacement équipements (chauffe-eau, fournaise)",
            "Autres travaux majeurs"
        ]
    )

    /// Anciennes définitions codées en dur — servent uniquement à l'import des
    /// sauvegardes (iOS v1 et webapp) et à la récupération de données orphelines.
    /// Le reste de l'app utilise les RentalProperty créés par l'assistant.
    static let legacyProperties: [PropertyDef] = [p1090, p470]

    static func legacyProperty(id: String) -> PropertyDef? {
        legacyProperties.first { $0.id == id }
    }

    // MARK: - Catégories standards des immeubles dynamiques

    /// Liste unique de dépenses déductibles proposée à tout nouvel immeuble
    /// (union des listes historiques 1090/470, libellés génériques).
    static let standardDeductibleCategories: [String] = [
        "Taxes municipales",
        "Taxe scolaire",
        "Électricité",
        "Chauffage (mazout / plan entretien)",
        "Frais de condo",
        "Frais de déneigement",
        "Internet",
        "Assurance habitation",
        "Système d'alarme",
        travelExpenseCategory,
        "Entretien / Réparations courantes",
        "Honoraires professionnels (comptable, notaire)",
        "Frais de gestion",
        "Frais de bureau (papeterie, clés)",
        "Publicité",
        "Outils / Matériel",
        "Intérêts sur hypothèque / frais bancaires",
        "Autres dépenses déductibles"
    ]

    /// Catégories de dépenses en capital générées d'après les unités de l'immeuble.
    static func defaultCapitalCategories(unitNames: [String]) -> [String] {
        var cats: [String]
        if unitNames.count > 1 {
            cats = unitNames.map { "Rénovation / Amélioration — \($0)" }
            cats.append("Rénovation / Amélioration — Parties communes")
        } else {
            cats = ["Rénovation / Amélioration majeure"]
        }
        cats.append("Remplacement équipements (chauffe-eau, fournaise)")
        cats.append("Autres travaux majeurs")
        return cats
    }

    // MARK: - Dépenses véhicule (annuelles, communes Uber/Lyft/locatif)

    static let vehicleCategories: [String] = [
        "Frais de plaque / immatriculation",
        "Frais de carburant (total annuel)",
        "Frais d'assurance",
        "Frais de permis de conduire",
        "Changement d'huile",
        "Achat et changement de pneus",
        "Frais de réparation",
        "Autres réparations / accessoires",
        "Forfait annuel téléphone",
        "Autres dépenses véhicule"
    ]

    // MARK: - Champs Uber (relevé annuel)

    struct UberFieldDef: Identifiable, Hashable {
        let key: String
        let label: String
        var id: String { key }
    }

    struct UberGroupDef: Identifiable, Hashable {
        let title: String
        let fields: [UberFieldDef]
        var id: String { title }
    }

    static let uberGroups: [UberGroupDef] = [
        UberGroupDef(title: "Revenus", fields: [
            UberFieldDef(key: "rides_gross", label: "Tarifs bruts courses"),
            UberFieldDef(key: "green_surcharge", label: "Surtaxe verte"),
            UberFieldDef(key: "booking_fee", label: "Frais de réservation"),
            UberFieldDef(key: "mtq_dues", label: "Droits MTQ"),
            UberFieldDef(key: "airport_fee", label: "Frais d'aéroport"),
            UberFieldDef(key: "tolls", label: "Péages"),
            UberFieldDef(key: "tips_rides", label: "Pourboires courses"),
            UberFieldDef(key: "gst_riders", label: "TPS collectée des passagers"),
            UberFieldDef(key: "qst_riders", label: "TVQ collectée des passagers")
        ]),
        UberGroupDef(title: "Frais payés à Uber", fields: [
            UberFieldDef(key: "service_fee", label: "Frais de service Uber"),
            UberFieldDef(key: "other_fees", label: "Autres frais Uber"),
            UberFieldDef(key: "fee_discount", label: "Remise sur frais"),
            UberFieldDef(key: "gst_paid_uber", label: "TPS payée à Uber"),
            UberFieldDef(key: "qst_paid_uber", label: "TVQ payée à Uber")
        ]),
        UberGroupDef(title: "Autres revenus", fields: [
            UberFieldDef(key: "eats_gross", label: "Tarif brut Uber Eats"),
            UberFieldDef(key: "eats_tips", label: "Pourboires Uber Eats"),
            UberFieldDef(key: "other_income", label: "Autres revenus")
        ]),
        UberGroupDef(title: "Pour déclaration TPS/TVQ", fields: [
            UberFieldDef(key: "gst_remitted", label: "TPS versée par Uber en votre nom"),
            UberFieldDef(key: "qst_remitted", label: "TVQ versée par Uber en votre nom")
        ])
    ]

    static let uberRevenueKeys = ["rides_gross", "green_surcharge", "booking_fee", "mtq_dues",
                                  "airport_fee", "tolls", "tips_rides"]
    static let uberFeeKeys = ["service_fee", "other_fees"]
    static let uberOtherIncomeKeys = ["eats_gross", "eats_tips", "other_income"]

    // MARK: - Checklist par défaut (générée selon les immeubles configurés)

    static func defaultChecklist(propertyNames: [String]) -> [String] {
        var items = [
            "Feuillets T4 / Relevé 1 (revenus d'emploi)",
            "Rapport annuel Uber (PDF)",
            "Relevés mensuels Lyft (jan–déc)",
            "Acomptes provisionnels versés — ARC",
            "Acomptes provisionnels versés — Revenu Québec"
        ]
        if !propertyNames.isEmpty {
            items.append("Formulaire T776 — État des loyers de biens immeubles")
            for name in propertyNames {
                items.append("Avis d'imposition municipale — \(name)")
                items.append("Taxe scolaire — \(name)")
                items.append("Relevé annuel hypothèque (intérêts) — \(name)")
            }
            items.append("Relevés assurance habitation")
            items.append("Reçus réparations / entretien")
        }
        items += [
            "Journal kilométrique (trajets)",
            "Reçus dépenses véhicule (carburant, assurance, entretien)",
            "Rapport préparé par comptable",
            "Déclaration fédérale T1 soumise à l'ARC",
            "Déclaration provinciale TP-1 soumise à Revenu Québec"
        ]
        return items
    }

    // MARK: - Charte visuelle

    enum Palette {
        static let dark = Color(red: 0x1F / 255, green: 0x38 / 255, blue: 0x64 / 255)      // #1F3864
        static let blue = Color(red: 0x00 / 255, green: 0x70 / 255, blue: 0xC0 / 255)      // #0070C0
        static let green = Color(red: 0x37 / 255, green: 0x56 / 255, blue: 0x23 / 255)     // #375623
        static let brown = Color(red: 0x7B / 255, green: 0x3F / 255, blue: 0x00 / 255)     // #7B3F00
        static let orange = Color(red: 0xE6 / 255, green: 0x51 / 255, blue: 0x00 / 255)    // #E65100 (Uber)
        static let pink = Color(red: 0xAD / 255, green: 0x14 / 255, blue: 0x57 / 255)      // #AD1457 (Lyft)
        static let background = Color(uiColor: .systemGroupedBackground)
    }

    // MARK: - Formatage fr_CA

    static let locale = Locale(identifier: "fr_CA")

    static func currency(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = locale
        f.maximumFractionDigits = 2
        f.minimumFractionDigits = 2
        return f.string(from: NSNumber(value: value)) ?? "0,00 $"
    }

    static func km(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = locale
        f.maximumFractionDigits = 1
        return (f.string(from: NSNumber(value: value)) ?? "0") + " km"
    }

    static func percent(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .percent
        f.locale = locale
        f.maximumFractionDigits = 1
        return f.string(from: NSNumber(value: value)) ?? "0 %"
    }
}
