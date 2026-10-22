import Foundation
import SwiftData

// Tous les modèles sont compatibles CloudKit :
// - aucune contrainte @Attribute(.unique)
// - toutes les propriétés ont une valeur par défaut
// - pas de relation non optionnelle
// Les données sont cloisonnées par année fiscale via la propriété `year`.

// MARK: - Année fiscale (réglages par année)

@Model
final class FiscalYear {
    var year: Int = AppConfig.defaultYear
    var kmRate: Double = AppConfig.defaultKmRate
    var vehicleTotalKm: Double = AppConfig.defaultVehicleTotalKm
    var vehicleModel: String = AppConfig.defaultVehicleModel
    var createdAt: Date = Date()

    // Champs hérités (avant les immeubles dynamiques) : conservés pour la
    // migration SwiftData et l'import des sauvegardes v1. Le % de propriété
    // vit désormais sur RentalProperty.ownershipPct.
    var ownershipPct1090: Double = 100
    var ownershipPct470: Double = 100
    var coOwner1090: String = ""
    var coOwner470: String = ""

    init(year: Int = AppConfig.defaultYear,
         kmRate: Double = AppConfig.defaultKmRate,
         vehicleTotalKm: Double = AppConfig.defaultVehicleTotalKm,
         vehicleModel: String = AppConfig.defaultVehicleModel) {
        self.year = year
        self.kmRate = kmRate
        self.vehicleTotalKm = vehicleTotalKm
        self.vehicleModel = vehicleModel
        self.createdAt = Date()
    }

}

// MARK: - Trajet (journal de déplacements)

@Model
final class Trip {
    var year: Int = AppConfig.defaultYear
    var date: Date = Date()
    /// propId d'un RentalProperty, ou "other" pour une destination personnalisée.
    var propertyId: String = "other"
    /// Libellé de la destination (nom de propriété ou adresse personnalisée).
    var destinationLabel: String = ""
    /// Kilométrage final du trajet (déjà doublé si aller-retour).
    var km: Double = 0
    var roundTrip: Bool = true
    var purpose: String = ""
    var createdAt: Date = Date()

    init(year: Int, date: Date, propertyId: String, destinationLabel: String,
         km: Double, roundTrip: Bool, purpose: String) {
        self.year = year
        self.date = date
        self.propertyId = propertyId
        self.destinationLabel = destinationLabel
        self.km = km
        self.roundTrip = roundTrip
        self.purpose = purpose
        self.createdAt = Date()
    }

    var month: Int {
        Calendar.current.component(.month, from: date) - 1
    }
}

// MARK: - Montant mensuel d'une propriété (revenus / déductibles / capital)

enum EntrySection: String {
    case revenue = "rev"
    case deductible = "ded"
    case capital = "cap"
}

@Model
final class EntryAmount {
    var year: Int = AppConfig.defaultYear
    var propertyId: String = ""
    /// "rev" | "ded" | "cap" (voir EntrySection)
    var section: String = EntrySection.revenue.rawValue
    var category: String = ""
    /// 0 = Janvier … 11 = Décembre
    var month: Int = 0
    var amount: Double = 0
    var note: String = ""
    @Attribute(.externalStorage) var receiptImage: Data?

    init(year: Int, propertyId: String, section: EntrySection, category: String, month: Int, amount: Double = 0) {
        self.year = year
        self.propertyId = propertyId
        self.section = section.rawValue
        self.category = category
        self.month = month
        self.amount = amount
        self.note = ""
        self.receiptImage = nil
    }
}

// MARK: - Uber (relevé annuel, une valeur par champ)

@Model
final class UberValue {
    var year: Int = AppConfig.defaultYear
    /// Clé du champ (voir AppConfig.uberGroups) + "km_on_trip" / "km_online".
    var key: String = ""
    var value: Double = 0

    init(year: Int, key: String, value: Double = 0) {
        self.year = year
        self.key = key
        self.value = value
    }
}

// MARK: - Lyft (saisie mensuelle)

@Model
final class LyftMonth {
    var year: Int = AppConfig.defaultYear
    /// 0 = Janvier … 11 = Décembre
    var month: Int = 0
    var taxable: Double = 0
    var bonuses: Double = 0
    var tips: Double = 0
    var fees: Double = 0
    var km: Double = 0
    var courses: Double = 0

    init(year: Int, month: Int) {
        self.year = year
        self.month = month
    }

    var net: Double { taxable + bonuses + tips - fees }
}

// MARK: - Dépense véhicule (annuelle, par catégorie)

@Model
final class VehicleExpense {
    var year: Int = AppConfig.defaultYear
    var category: String = ""
    var amount: Double = 0

    init(year: Int, category: String, amount: Double = 0) {
        self.year = year
        self.category = category
        self.amount = amount
    }
}

// MARK: - Item de checklist fiscale

@Model
final class ChecklistItem {
    var year: Int = AppConfig.defaultYear
    var label: String = ""
    var isDone: Bool = false
    var sortOrder: Int = 0

    init(year: Int, label: String, sortOrder: Int, isDone: Bool = false) {
        self.year = year
        self.label = label
        self.sortOrder = sortOrder
        self.isDone = isDone
    }
}

// MARK: - Impôt : ce que l'app ne peut pas déduire des données saisies

/// Les montants qui n'existent nulle part ailleurs dans l'app et sans lesquels
/// l'impôt estimé est faux : le salaire (c'est lui qui détermine la tranche dans
/// laquelle tombe le revenu locatif), les retenues à la source, les gains déjà
/// cotisés au RRQ par l'employeur, et les acomptes réellement versés.
///
/// Un enregistrement par année : les retenues de 2026 n'ont rien à voir avec
/// celles de 2025.
@Model
final class TaxInputs {
    var year: Int = AppConfig.defaultYear
    /// Salaire brut imposable — case A du relevé 1.
    var revenuT4: Double = 0
    var impotRetenuFed: Double = 0
    var impotRetenuQc: Double = 0
    /// Case 26 du T4. Sans ce montant, l'app recotiserait au RRQ sur une tranche
    /// de revenu déjà cotisée par l'employeur et surestimerait la facture.
    var gainsRRQCotises: Double = 0
    var autresRevenus: Double = 0
    var autresDeductions: Double = 0
    /// Quatre échéances (15 mars, 15 juin, 15 septembre, 15 décembre).
    var acomptesFed: [Double] = [0, 0, 0, 0]
    var acomptesQc: [Double] = [0, 0, 0, 0]

    init(year: Int) {
        self.year = year
    }

    /// Les tableaux viennent du stockage : une sauvegarde ancienne ou tronquée
    /// pourrait en rendre moins de quatre, et le noyau indexe par échéance.
    private static func quatre(_ v: [Double]) -> [Double] {
        v.count >= 4 ? Array(v.prefix(4)) : v + Array(repeating: 0, count: 4 - v.count)
    }

    func acompte(_ palier: PalierAcompte, _ i: Int) -> Double {
        guard (0..<4).contains(i) else { return 0 }
        return Self.quatre(palier == .fed ? acomptesFed : acomptesQc)[i]
    }

    func setAcompte(_ value: Double, _ palier: PalierAcompte, _ i: Int) {
        guard (0..<4).contains(i) else { return }
        var v = Self.quatre(palier == .fed ? acomptesFed : acomptesQc)
        v[i] = value
        if palier == .fed { acomptesFed = v } else { acomptesQc = v }
    }

    var acomptesFedNormalises: [Double] { Self.quatre(acomptesFed) }
    var acomptesQcNormalises: [Double] { Self.quatre(acomptesQc) }
}

enum PalierAcompte { case fed, qc }

// MARK: - Bien amortissable (registre de la DPA)

/// Un bien du registre, pour UNE année. Le registre est annuel comme dans la
/// PWA — `depenses_<année>` a ses propres `biens` — et c'est `assetId`, conservé
/// à l'identique d'une année à l'autre, qui relie les exercices et permet le
/// report automatique de la FNACC de clôture en ouverture de l'année suivante.
///
/// Transcrit en `BienAmortissable` (noyau) pour le calcul ; aucune règle
/// fiscale ne vit ici.
@Model
final class CapitalAsset {
    /// Identifiant stable du bien, le même dans toutes les années.
    var assetId: String = UUID().uuidString
    var year: Int = AppConfig.defaultYear
    /// propId d'un RentalProperty, ou CCAService.vehPseudoProp pour le véhicule
    /// et l'entreprise.
    var propId: String = CCAService.vehPseudoProp
    /// `description` est déjà pris par Swift sur un objet : d'où `label`.
    var label: String = ""
    /// Code de catégorie de Fiscalite.categoriesDPA ("1", "8", "10.1"…).
    var categorie: String = "1"
    /// « AAAA-MM-JJ » — même format que le noyau, qui compare les dates en texte.
    var dateAcquisition: String = ""
    var cout: Double = 0
    var coutTerrain: Double = 0
    /// Acquis d'une personne liée : l'incitatif à l'investissement accéléré ne
    /// s'applique pas, le demi-taux reprend.
    var lie: Bool = false
    /// Surcharge manuelle de la FNACC d'ouverture. `nil` = report automatique
    /// depuis l'année précédente ; c'est la distinction que le noyau lit.
    var fnaccOuverture: Double?
    var dispositionDate: String = ""
    var dispositionProduit: Double = 0
    /// DPA réclamée pour `year` — jamais plus que la DPA maximale de la catégorie.
    var dpaReclamee: Double = 0
    var createdAt: Date = Date()

    init(assetId: String = UUID().uuidString, year: Int, propId: String) {
        self.assetId = assetId
        self.year = year
        self.propId = propId
        self.createdAt = Date()
    }

    /// Le bien tel que le noyau le veut. `dpa` ne porte que l'année de cet
    /// enregistrement : c'est tout ce que le calcul de l'année lit, et le report
    /// relit l'enregistrement de l'année précédente.
    var bien: BienAmortissable {
        BienAmortissable(
            id: assetId, propId: propId, description: label, categorie: categorie,
            dateAcquisition: dateAcquisition, cout: cout, coutTerrain: coutTerrain,
            lie: lie, fnaccOuverture: fnaccOuverture,
            dpa: [year: dpaReclamee],
            dispositionDate: dispositionDate, dispositionProduit: dispositionProduit)
    }

    /// Coût amortissable : le terrain ne s'amortit jamais.
    var coutAmortissable: Double { max(0, cout - coutTerrain) }
}
