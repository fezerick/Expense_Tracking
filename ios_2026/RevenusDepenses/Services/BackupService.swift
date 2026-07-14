import Foundation
import SwiftData

/// Sauvegarde et restauration complètes d'une année fiscale au format JSON.
///
/// Import : trois formats reconnus automatiquement —
/// 1. sauvegarde iOS v2 (avec la liste des immeubles),
/// 2. sauvegarde iOS v1 (les immeubles historiques 1090/470 sont recréés),
/// 3. **sauvegarde JSON de la webapp** (`Depenses_<année>_backup.json`) : les deux
///    immeubles, montants, trajets, Uber/Lyft, véhicule, notes, reçus et checklist
///    sont convertis et les immeubles recréés comme propriétés dynamiques.
struct BackupService {

    struct PropertyDTO: Codable {
        var propId: String
        var name: String
        var address: String
        var kindCode: String
        var subtypeCode: String
        var oneWayKm: Double
        var ownershipPct: Double
        var coOwners: String
        var revenueCategories: [String]
        var deductibleCategories: [String]
        var capitalCategories: [String]
        var sortOrder: Int
    }

    struct Snapshot: Codable {
        var appVersion: Int = 2
        var year: Int
        var kmRate: Double
        var vehicleTotalKm: Double
        var vehicleModel: String
        /// v2 : liste des immeubles. Absente des sauvegardes v1.
        var properties: [PropertyDTO]?
        // Champs v1 (immeubles codés en dur) : lus pour compatibilité.
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
            "Fichier de sauvegarde invalide ou illisible (formats acceptés : sauvegarde iOS ou sauvegarde JSON de la webapp)."
        }
    }

    // MARK: - Export (v2)

    static func exportJSON(data: DataService) throws -> Data {
        let fy = data.ensureFiscalYear()
        var entries: [EntryDTO] = []
        for prop in data.properties() {
            for e in data.entries(propertyId: prop.propId) {
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
            properties: data.properties().map {
                PropertyDTO(propId: $0.propId, name: $0.name, address: $0.address,
                            kindCode: $0.kindCode, subtypeCode: $0.subtypeCode,
                            oneWayKm: $0.oneWayKm, ownershipPct: $0.ownershipPct,
                            coOwners: $0.coOwners,
                            revenueCategories: $0.revenueCategories,
                            deductibleCategories: $0.deductibleCategories,
                            capitalCategories: $0.capitalCategories,
                            sortOrder: $0.sortOrder)
            },
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

    // MARK: - Import (remplace les données de l'année du fichier)

    static func restore(from jsonData: Data, context: ModelContext, fallbackYear: Int) throws -> Int {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let snapshot = try? decoder.decode(Snapshot.self, from: jsonData) {
            return restoreIOS(snapshot, context: context)
        }
        if let object = (try? JSONSerialization.jsonObject(with: jsonData)) as? [String: Any],
           object["settings"] is [String: Any],
           object["appVersion"] == nil {
            return try restorePWA(object, context: context, fallbackYear: fallbackYear)
        }
        throw BackupError.invalidFile
    }

    // MARK: - Format iOS (v1 et v2)

    private static func restoreIOS(_ snapshot: Snapshot, context: ModelContext) -> Int {
        let data = DataService(context: context, year: snapshot.year)
        data.eraseYearData()
        // eraseYearData a re-semé la checklist par défaut ; on la remplace par celle du fichier.
        data.checklist().forEach { context.delete($0) }
        try? context.save()

        let fy = data.ensureFiscalYear()
        fy.kmRate = snapshot.kmRate
        fy.vehicleTotalKm = snapshot.vehicleTotalKm
        fy.vehicleModel = snapshot.vehicleModel

        if let props = snapshot.properties {
            // v2 : recrée les immeubles du fichier (fusion par propId).
            for dto in props where data.property(id: dto.propId) == nil {
                context.insert(RentalProperty(
                    propId: dto.propId, name: dto.name, address: dto.address,
                    kind: PropertyKind(rawValue: dto.kindCode) ?? .plex,
                    subtypeCode: dto.subtypeCode, oneWayKm: dto.oneWayKm,
                    ownershipPct: dto.ownershipPct, coOwners: dto.coOwners,
                    revenueCategories: dto.revenueCategories,
                    deductibleCategories: dto.deductibleCategories,
                    capitalCategories: dto.capitalCategories,
                    sortOrder: dto.sortOrder
                ))
            }
        } else {
            // v1 : immeubles historiques, avec le % de propriété du fichier.
            ensureLegacyProperty(AppConfig.p1090, kind: .appart, subtype: "colocation",
                                 pct: snapshot.ownershipPct1090 ?? 100,
                                 coOwners: snapshot.coOwner1090 ?? "", context: context, data: data)
            ensureLegacyProperty(AppConfig.p470, kind: .plex, subtype: "triplex",
                                 pct: snapshot.ownershipPct470 ?? 100,
                                 coOwners: snapshot.coOwner470 ?? "", context: context, data: data)
        }

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
        try? context.save()
        return snapshot.year
    }

    private static func ensureLegacyProperty(_ def: AppConfig.PropertyDef, kind: PropertyKind,
                                             subtype: String, pct: Double, coOwners: String,
                                             context: ModelContext, data: DataService) {
        if let existing = data.property(id: def.id) {
            existing.ownershipPct = pct
            existing.coOwners = coOwners
            return
        }
        let sortOrder = (data.properties().map(\.sortOrder).max() ?? -1) + 1
        context.insert(RentalProperty(
            propId: def.id, name: def.name, address: def.address,
            kind: kind, subtypeCode: subtype, oneWayKm: def.oneWayKm,
            ownershipPct: pct, coOwners: coOwners,
            revenueCategories: def.revenueCategories,
            deductibleCategories: def.deductibleCategories,
            capitalCategories: def.capitalCategories,
            sortOrder: sortOrder
        ))
    }

    // MARK: - Format webapp (state JSON de la PWA)

    private static func restorePWA(_ state: [String: Any], context: ModelContext,
                                   fallbackYear: Int) throws -> Int {
        // L'export webapp ne contient pas l'année : on la déduit des trajets.
        let tripDicts = (state["trips"] as? [[String: Any]]) ?? []
        let year = inferYear(tripDicts: tripDicts) ?? fallbackYear

        let data = DataService(context: context, year: year)
        data.eraseYearData()
        data.checklist().forEach { context.delete($0) }
        try? context.save()

        let fy = data.ensureFiscalYear()
        if let settings = state["settings"] as? [String: Any] {
            fy.kmRate = double(settings["mileageRate"]) ?? AppConfig.defaultKmRate
            fy.vehicleTotalKm = double(settings["kmTotalAnnuel"]) ?? AppConfig.defaultVehicleTotalKm
            if let model = settings["vehicleModel"] as? String, !model.isEmpty {
                fy.vehicleModel = model
            }
        }

        // Immeubles : recréés dès qu'un bucket p1090/p470 existe dans le fichier.
        let notes = (state["notes"] as? [String: Any]) ?? [:]
        let receipts = (state["receipts"] as? [String: Any]) ?? [:]
        let sectionMap: [(pwa: String, ios: EntrySection)] = [
            ("revenus", .revenue), ("deductibles", .deductible), ("capital", .capital)
        ]

        for def in AppConfig.legacyProperties {
            guard let bucket = state[def.id] as? [String: Any] else { continue }
            ensureLegacyProperty(def, kind: def.id == AppConfig.p470.id ? .plex : .appart,
                                 subtype: def.id == AppConfig.p470.id ? "triplex" : "colocation",
                                 pct: 100, coOwners: "", context: context, data: data)

            for (pwaSection, section) in sectionMap {
                guard let cats = bucket[pwaSection] as? [String: Any] else { continue }
                for (category, rawValues) in cats {
                    guard category != AppConfig.travelExpenseCategory,
                          let values = rawValues as? [Any] else { continue }
                    for (month, raw) in values.prefix(12).enumerated() {
                        let amount = double(raw) ?? 0
                        let noteKey = "\(def.id)_\(pwaSection)_\(category)_\(month)"
                        let note = notes[noteKey] as? String ?? ""
                        let receipt = dataURLImage(receipts[noteKey])
                        guard amount != 0 || !note.isEmpty || receipt != nil else { continue }
                        let entry = EntryAmount(year: year, propertyId: def.id, section: section,
                                                category: category, month: month, amount: amount)
                        entry.note = note
                        entry.receiptImage = receipt
                        context.insert(entry)
                    }
                }
            }
        }

        // Trajets.
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone.current
        for t in tripDicts {
            guard let dateStr = t["date"] as? String, let date = df.date(from: dateStr) else { continue }
            let propertyId = (t["property"] as? String) ?? "other"
            let custom = (t["customDest"] as? String) ?? ""
            let label = AppConfig.legacyProperty(id: propertyId)?.name
                ?? (custom.isEmpty ? "Autre destination" : custom)
            context.insert(Trip(year: year, date: date, propertyId: propertyId,
                                destinationLabel: label, km: double(t["km"]) ?? 0,
                                roundTrip: (t["roundTrip"] as? Bool) ?? true,
                                purpose: (t["reason"] as? String) ?? ""))
        }

        // Uber (mêmes clés que la webapp).
        if let uber = state["uber"] as? [String: Any] {
            for (key, raw) in uber {
                if let value = double(raw), value != 0 {
                    context.insert(UberValue(year: year, key: key, value: value))
                }
            }
        }

        // Lyft : objet indexé par mois ("0"…"11").
        if let lyft = state["lyft"] as? [String: Any] {
            for (key, raw) in lyft {
                guard let month = Int(key), (0..<12).contains(month),
                      let values = raw as? [String: Any] else { continue }
                let m = LyftMonth(year: year, month: month)
                m.taxable = double(values["taxable"]) ?? 0
                m.bonuses = double(values["bonuses"]) ?? 0
                m.tips = double(values["tips"]) ?? 0
                m.fees = double(values["fees"]) ?? 0
                m.km = double(values["km"]) ?? 0
                m.courses = double(values["courses"]) ?? 0
                context.insert(m)
            }
        }

        // Véhicule.
        if let vehicule = state["vehicule"] as? [String: Any],
           let depenses = vehicule["depenses"] as? [String: Any] {
            for (cat, raw) in depenses {
                if let value = double(raw), value != 0 {
                    context.insert(VehicleExpense(year: year, category: cat, amount: value))
                }
            }
        }

        // Checklist.
        if let checklist = state["checklist"] as? [[String: Any]], !checklist.isEmpty {
            for (i, item) in checklist.enumerated() {
                guard let label = item["label"] as? String else { continue }
                context.insert(ChecklistItem(year: year, label: label, sortOrder: i,
                                             isDone: (item["checked"] as? Bool) ?? false))
            }
        } else {
            data.seedChecklistIfEmpty()
        }
        try? context.save()

        return year
    }

    /// Année la plus fréquente parmi les dates des trajets ("YYYY-MM-DD").
    private static func inferYear(tripDicts: [[String: Any]]) -> Int? {
        let years = tripDicts.compactMap { ($0["date"] as? String)?.prefix(4) }.compactMap { Int($0) }
        guard !years.isEmpty else { return nil }
        let counts = Dictionary(grouping: years, by: { $0 }).mapValues(\.count)
        return counts.max { $0.value < $1.value }?.key
    }

    /// Nombre depuis Double / Int / String ("1 234,56" accepté).
    private static func double(_ raw: Any?) -> Double? {
        switch raw {
        case let d as Double: return d
        case let i as Int: return Double(i)
        case let s as String:
            let cleaned = s.replacingOccurrences(of: " ", with: "")
                .replacingOccurrences(of: "\u{00A0}", with: "")
                .replacingOccurrences(of: ",", with: ".")
            return Double(cleaned)
        default: return nil
        }
    }

    /// Image depuis une data URL webapp ("data:image/jpeg;base64,…").
    private static func dataURLImage(_ raw: Any?) -> Data? {
        guard let s = raw as? String, let range = s.range(of: "base64,") else { return nil }
        return Data(base64Encoded: String(s[range.upperBound...]))
    }
}
