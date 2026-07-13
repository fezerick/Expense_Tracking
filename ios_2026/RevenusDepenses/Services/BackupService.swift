import Foundation
import SwiftData

/// Sauvegarde et restauration complètes d'une année fiscale au format JSON
/// (équivalent de l'export/import JSON de la PWA).
struct BackupService {

    struct Snapshot: Codable {
        var appVersion: Int = 1
        var year: Int
        var kmRate: Double
        var vehicleTotalKm: Double
        var vehicleModel: String
        // Optionnels : absents des sauvegardes créées avant l'ajout des champs T776.
        var ownershipPct1090: Double?
        var ownershipPct470: Double?
        var coOwner1090: String?
        var coOwner470: String?
        var trips: [TripDTO]
        var entries: [EntryDTO]
        var uber: [String: Double]
        var lyft: [LyftDTO]
        var vehicle: [String: Double]
        var checklist: [ChecklistDTO]
    }

    struct TripDTO: Codable {
        var date: Date
        var propertyId: String
        var destinationLabel: String
        var km: Double
        var roundTrip: Bool
        var purpose: String
    }

    struct EntryDTO: Codable {
        var propertyId: String
        var section: String
        var category: String
        var month: Int
        var amount: Double
        var note: String
        var receiptBase64: String?
    }

    struct LyftDTO: Codable {
        var month: Int
        var taxable: Double
        var bonuses: Double
        var tips: Double
        var fees: Double
        var km: Double
        var courses: Double
    }

    struct ChecklistDTO: Codable {
        var label: String
        var isDone: Bool
        var sortOrder: Int
    }

    enum BackupError: LocalizedError {
        case invalidFile

        var errorDescription: String? {
            "Fichier de sauvegarde invalide ou illisible."
        }
    }

    // MARK: - Export

    static func exportJSON(data: DataService) throws -> Data {
        let fy = data.ensureFiscalYear()
        var entries: [EntryDTO] = []
        for prop in AppConfig.properties {
            for e in data.entries(propertyId: prop.id) {
                entries.append(EntryDTO(
                    propertyId: e.propertyId, section: e.section, category: e.category,
                    month: e.month, amount: e.amount, note: e.note,
                    receiptBase64: e.receiptImage?.base64EncodedString()
                ))
            }
        }
        let snapshot = Snapshot(
            year: fy.year,
            kmRate: fy.kmRate,
            vehicleTotalKm: fy.vehicleTotalKm,
            vehicleModel: fy.vehicleModel,
            ownershipPct1090: fy.ownershipPct1090,
            ownershipPct470: fy.ownershipPct470,
            coOwner1090: fy.coOwner1090,
            coOwner470: fy.coOwner470,
            trips: data.trips().map {
                TripDTO(date: $0.date, propertyId: $0.propertyId,
                        destinationLabel: $0.destinationLabel, km: $0.km,
                        roundTrip: $0.roundTrip, purpose: $0.purpose)
            },
            entries: entries,
            uber: Dictionary(uniqueKeysWithValues: data.uberValues().map { ($0.key, $0.value) }),
            lyft: data.lyftMonths().map {
                LyftDTO(month: $0.month, taxable: $0.taxable, bonuses: $0.bonuses,
                        tips: $0.tips, fees: $0.fees, km: $0.km, courses: $0.courses)
            },
            vehicle: Dictionary(uniqueKeysWithValues: data.vehicleExpenses().map { ($0.category, $0.amount) }),
            checklist: data.checklist().map {
                ChecklistDTO(label: $0.label, isDone: $0.isDone, sortOrder: $0.sortOrder)
            }
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(snapshot)
    }

    // MARK: - Import (remplace toutes les données de l'année du fichier)

    static func restore(from jsonData: Data, context: ModelContext) throws -> Int {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let snapshot = try? decoder.decode(Snapshot.self, from: jsonData) else {
            throw BackupError.invalidFile
        }

        let data = DataService(context: context, year: snapshot.year)
        data.eraseYearData()
        // eraseYearData a re-semé la checklist par défaut ; on la remplace par celle du fichier.
        data.checklist().forEach { context.delete($0) }

        let fy = data.ensureFiscalYear()
        fy.kmRate = snapshot.kmRate
        fy.vehicleTotalKm = snapshot.vehicleTotalKm
        fy.vehicleModel = snapshot.vehicleModel
        fy.ownershipPct1090 = snapshot.ownershipPct1090 ?? 100
        fy.ownershipPct470 = snapshot.ownershipPct470 ?? 100
        fy.coOwner1090 = snapshot.coOwner1090 ?? ""
        fy.coOwner470 = snapshot.coOwner470 ?? ""

        for t in snapshot.trips {
            context.insert(Trip(year: snapshot.year, date: t.date, propertyId: t.propertyId,
                                destinationLabel: t.destinationLabel, km: t.km,
                                roundTrip: t.roundTrip, purpose: t.purpose))
        }
        for e in snapshot.entries {
            let section = EntrySection(rawValue: e.section) ?? .deductible
            let entry = EntryAmount(year: snapshot.year, propertyId: e.propertyId,
                                    section: section, category: e.category,
                                    month: e.month, amount: e.amount)
            entry.note = e.note
            if let b64 = e.receiptBase64 {
                entry.receiptImage = Data(base64Encoded: b64)
            }
            context.insert(entry)
        }
        for (key, value) in snapshot.uber {
            context.insert(UberValue(year: snapshot.year, key: key, value: value))
        }
        for l in snapshot.lyft {
            let m = LyftMonth(year: snapshot.year, month: l.month)
            m.taxable = l.taxable
            m.bonuses = l.bonuses
            m.tips = l.tips
            m.fees = l.fees
            m.km = l.km
            m.courses = l.courses
            context.insert(m)
        }
        for (cat, amount) in snapshot.vehicle {
            context.insert(VehicleExpense(year: snapshot.year, category: cat, amount: amount))
        }
        for c in snapshot.checklist {
            context.insert(ChecklistItem(year: snapshot.year, label: c.label,
                                         sortOrder: c.sortOrder, isDone: c.isDone))
        }
        return snapshot.year
    }
}
