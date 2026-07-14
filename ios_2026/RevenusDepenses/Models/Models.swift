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
