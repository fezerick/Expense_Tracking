import Foundation
import SwiftData

// MARK: - Type de logement

/// Types proposés par l'assistant de configuration.
enum PropertyKind: String, CaseIterable, Identifiable {
    case maison, plex, appart

    var id: String { rawValue }

    var label: String {
        switch self {
        case .maison: "Maison"
        case .plex: "Plex"
        case .appart: "Appartement / Condo"
        }
    }

    var icon: String {
        switch self {
        case .maison: "house.fill"
        case .plex: "building.2.fill"
        case .appart: "building.fill"
        }
    }

    struct Subtype: Identifiable, Hashable {
        let code: String
        let label: String
        /// Nombre d'unités imposé par le sous-type, nil = demandé à l'utilisateur.
        let unitCount: Int?
        var id: String { code }
    }

    var subtypes: [Subtype] {
        switch self {
        case .maison:
            return [Subtype(code: "unifamiliale", label: "Unifamiliale", unitCount: 1),
                    Subtype(code: "jumelee", label: "Jumelée", unitCount: 1),
                    Subtype(code: "rangee", label: "En rangée", unitCount: 1)]
        case .plex:
            return [Subtype(code: "duplex", label: "Duplex", unitCount: 2),
                    Subtype(code: "triplex", label: "Triplex", unitCount: 3),
                    Subtype(code: "quadruplex", label: "Quadruplex", unitCount: 4),
                    Subtype(code: "autre", label: "Autre", unitCount: nil)]
        case .appart:
            return [Subtype(code: "entier", label: "Loué en entier", unitCount: 1),
                    Subtype(code: "colocation", label: "Colocation", unitCount: nil)]
        }
    }

    func subtype(code: String) -> Subtype? {
        subtypes.first { $0.code == code }
    }

    /// Nom des unités générées par défaut (éditables ensuite).
    func defaultUnitNames(count: Int) -> [String] {
        switch self {
        case .maison:
            return ["Loyer"]
        case .plex:
            return count <= 1 ? ["Logement 1"] : (1...count).map { "Logement \($0)" }
        case .appart:
            return count <= 1 ? ["Loyer"] : (1...count).map { "Coloc \($0)" }
        }
    }

    /// "logements", "colocataires"… pour les libellés de l'assistant.
    var unitNoun: String {
        switch self {
        case .maison: "unité"
        case .plex: "logements"
        case .appart: "colocataires"
        }
    }
}

// MARK: - Immeuble locatif configurable

/// Immeuble créé par l'assistant de configuration ou les Réglages.
/// Remplace les deux immeubles codés en dur : le nombre de propriétés est libre,
/// les unités (logements / colocataires) sont des catégories éditables.
/// Compatible CloudKit : valeurs par défaut partout, pas de @Attribute(.unique).
@Model
final class RentalProperty {
    /// Identifiant stable référencé par EntryAmount.propertyId et Trip.propertyId.
    /// Vaut "p1090" / "p470" pour les immeubles recréés depuis d'anciennes sauvegardes.
    var propId: String = UUID().uuidString
    var name: String = ""
    var address: String = ""
    /// Voir PropertyKind ("maison" | "plex" | "appart").
    var kindCode: String = PropertyKind.maison.rawValue
    var subtypeCode: String = "unifamiliale"
    /// Distance aller simple depuis le domicile, en km (pré-remplit le journal de trajets).
    var oneWayKm: Double = 0
    var ownershipPct: Double = 100
    /// Nom(s) du/des copropriétaire(s), vide si propriétaire unique.
    var coOwners: String = ""
    /// Catégories séparées par des retours à la ligne (pas de tableau : CloudKit-safe).
    var revenueCategoriesRaw: String = ""
    var deductibleCategoriesRaw: String = ""
    var capitalCategoriesRaw: String = ""
    var sortOrder: Int = 0
    var createdAt: Date = Date()

    init(propId: String = UUID().uuidString,
         name: String = "",
         address: String = "",
         kind: PropertyKind = .maison,
         subtypeCode: String = "unifamiliale",
         oneWayKm: Double = 0,
         ownershipPct: Double = 100,
         coOwners: String = "",
         revenueCategories: [String] = [],
         deductibleCategories: [String] = [],
         capitalCategories: [String] = [],
         sortOrder: Int = 0) {
        self.propId = propId
        self.name = name
        self.address = address
        self.kindCode = kind.rawValue
        self.subtypeCode = subtypeCode
        self.oneWayKm = oneWayKm
        self.ownershipPct = ownershipPct
        self.coOwners = coOwners
        self.revenueCategoriesRaw = revenueCategories.joined(separator: "\n")
        self.deductibleCategoriesRaw = deductibleCategories.joined(separator: "\n")
        self.capitalCategoriesRaw = capitalCategories.joined(separator: "\n")
        self.sortOrder = sortOrder
        self.createdAt = Date()
    }

    var kind: PropertyKind { PropertyKind(rawValue: kindCode) ?? .maison }

    var revenueCategories: [String] {
        get { Self.split(revenueCategoriesRaw) }
        set { revenueCategoriesRaw = newValue.joined(separator: "\n") }
    }

    var deductibleCategories: [String] {
        get { Self.split(deductibleCategoriesRaw) }
        set { deductibleCategoriesRaw = newValue.joined(separator: "\n") }
    }

    var capitalCategories: [String] {
        get { Self.split(capitalCategoriesRaw) }
        set { capitalCategoriesRaw = newValue.joined(separator: "\n") }
    }

    func categories(_ section: EntrySection) -> [String] {
        switch section {
        case .revenue: revenueCategories
        case .deductible: deductibleCategories
        case .capital: capitalCategories
        }
    }

    /// Libellé compact pour les sélecteurs segmentés (sans parenthèse descriptive).
    var shortName: String {
        name.replacingOccurrences(of: #"\s*\(.*\)$"#, with: "", options: .regularExpression)
    }

    private static func split(_ raw: String) -> [String] {
        raw.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
    }
}
