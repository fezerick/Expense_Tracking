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
        /// v2.9 : saisie d'impôt et registre de DPA. Absents des sauvegardes
        /// antérieures — optionnels pour qu'elles restent lisibles.
        var impot: TaxInputsDTO? = nil
        var biens: [CapitalAssetDTO]? = nil
    }

    struct TaxInputsDTO: Codable {
        var revenuT4: Double
        var impotRetenuFed: Double
        var impotRetenuQc: Double
        var gainsRRQCotises: Double
        var autresRevenus: Double
        var autresDeductions: Double
        var acomptesFed: [Double]
        var acomptesQc: [Double]
    }

    struct CapitalAssetDTO: Codable {
        /// Conservé : c'est lui qui relie le bien d'une année à l'autre et qui
        /// fait tenir le report de la FNACC.
        var assetId: String
        var propId: String
        var label: String
        var categorie: String
        var dateAcquisition: String
        var cout: Double
        var coutTerrain: Double
        var lie: Bool
        var fnaccOuverture: Double?
        var dispositionDate: String
        var dispositionProduit: Double
        var dpaReclamee: Double
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
            },
            impot: {
                let t = data.ensureTaxInputs()
                return TaxInputsDTO(
                    revenuT4: t.revenuT4, impotRetenuFed: t.impotRetenuFed,
                    impotRetenuQc: t.impotRetenuQc, gainsRRQCotises: t.gainsRRQCotises,
                    autresRevenus: t.autresRevenus, autresDeductions: t.autresDeductions,
                    acomptesFed: t.acomptesFedNormalises, acomptesQc: t.acomptesQcNormalises)
            }(),
            biens: data.capitalAssets().map {
                CapitalAssetDTO(
                    assetId: $0.assetId, propId: $0.propId, label: $0.label,
                    categorie: $0.categorie, dateAcquisition: $0.dateAcquisition,
                    cout: $0.cout, coutTerrain: $0.coutTerrain, lie: $0.lie,
                    fnaccOuverture: $0.fnaccOuverture,
                    dispositionDate: $0.dispositionDate,
                    dispositionProduit: $0.dispositionProduit,
                    dpaReclamee: $0.dpaReclamee)
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
        if let object = (try? JSONSerialization.jsonObject(with: jsonData)) as? [String: Any] {
            // Enveloppe v3 de la webapp : la configuration (immeubles, % de propriété,
            // copropriétaires) et l'année fiscale accompagnent les données.
            if object["format"] as? String == "pwa-depenses",
               let state = object["state"] as? [String: Any] {
                return try restorePWA(state,
                                      setup: object["setup"] as? [String: Any],
                                      declaredYear: double(object["year"]).map { Int($0) },
                                      context: context, fallbackYear: fallbackYear)
            }
            // Ancien format : le `state` à plat, sans configuration ni année.
            if object["settings"] is [String: Any], object["appVersion"] == nil {
                return try restorePWA(object, setup: nil, declaredYear: nil,
                                      context: context, fallbackYear: fallbackYear)
            }
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
        if let i = snapshot.impot {
            let t = data.ensureTaxInputs()
            t.revenuT4 = i.revenuT4
            t.impotRetenuFed = i.impotRetenuFed
            t.impotRetenuQc = i.impotRetenuQc
            t.gainsRRQCotises = i.gainsRRQCotises
            t.autresRevenus = i.autresRevenus
            t.autresDeductions = i.autresDeductions
            t.acomptesFed = i.acomptesFed
            t.acomptesQc = i.acomptesQc
        }
        for b in snapshot.biens ?? [] {
            insererBien(b, year: snapshot.year, context: context)
        }
        try? context.save()
        return snapshot.year
    }

    /// pct/coOwners nil = information absente du fichier : un immeuble déjà
    /// configuré garde son % de propriété (la sauvegarde webapp ne contient
    /// pas ce champ — il ne doit pas être remis à 100 % à chaque restauration).
    private static func ensureLegacyProperty(_ def: AppConfig.PropertyDef, kind: PropertyKind,
                                             subtype: String, pct: Double?, coOwners: String?,
                                             context: ModelContext, data: DataService) {
        if let existing = data.property(id: def.id) {
            if let pct { existing.ownershipPct = pct }
            if let coOwners { existing.coOwners = coOwners }
            return
        }
        let sortOrder = (data.properties().map(\.sortOrder).max() ?? -1) + 1
        context.insert(RentalProperty(
            propId: def.id, name: def.name, address: def.address,
            kind: kind, subtypeCode: subtype, oneWayKm: def.oneWayKm,
            ownershipPct: pct ?? 100, coOwners: coOwners ?? "",
            revenueCategories: def.revenueCategories,
            deductibleCategories: def.deductibleCategories,
            capitalCategories: def.capitalCategories,
            sortOrder: sortOrder
        ))
    }

    // MARK: - Format webapp (state JSON de la PWA)

    private static func restorePWA(_ state: [String: Any], setup: [String: Any]?,
                                   declaredYear: Int?, context: ModelContext,
                                   fallbackYear: Int) throws -> Int {
        // L'enveloppe v3 porte l'année ; l'ancien format ne l'a pas et on la déduit des
        // trajets — un fichier sans trajet atterrissait alors dans la mauvaise année.
        let tripDicts = (state["trips"] as? [[String: Any]]) ?? []
        let year = declaredYear ?? inferYear(tripDicts: tripDicts) ?? fallbackYear

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

        // D'abord les immeubles décrits par la configuration (enveloppe v3) : nom,
        // adresse, % de propriété et copropriétaires sont alors préservés, et les
        // immeubles créés par l'utilisateur ne sont plus perdus.
        var propertyIds: [String] = []
        for (i, dto) in ((setup?["propsList"] as? [[String: Any]]) ?? []).enumerated() {
            guard let propId = dto["id"] as? String else { continue }
            propertyIds.append(propId)
            ensurePWAProperty(dto, sortOrder: i, context: context, data: data)
        }
        // Puis tout immeuble présent dans les données mais absent de la configuration
        // (ancien format sans `setup`) : recréé depuis les immeubles historiques.
        for def in AppConfig.legacyProperties
        where state[def.id] != nil && !propertyIds.contains(def.id) {
            propertyIds.append(def.id)
            ensureLegacyProperty(def, kind: def.id == AppConfig.p470.id ? .plex : .appart,
                                 subtype: def.id == AppConfig.p470.id ? "triplex" : "colocation",
                                 pct: nil, coOwners: nil, context: context, data: data)
        }
        try? context.save()

        for propId in propertyIds {
            guard let bucket = state[propId] as? [String: Any] else { continue }
            for (pwaSection, section) in sectionMap {
                guard let cats = bucket[pwaSection] as? [String: Any] else { continue }
                for (category, rawValues) in cats {
                    guard category != AppConfig.travelExpenseCategory,
                          let values = rawValues as? [Any] else { continue }
                    for (month, raw) in values.prefix(12).enumerated() {
                        let amount = double(raw) ?? 0
                        let noteKey = "\(propId)_\(pwaSection)_\(category)_\(month)"
                        let note = notes[noteKey] as? String ?? ""
                        let receipt = dataURLImage(receipts[noteKey])
                        guard amount != 0 || !note.isEmpty || receipt != nil else { continue }
                        let entry = EntryAmount(year: year, propertyId: propId, section: section,
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
            let label = data.property(id: propertyId)?.name
                ?? AppConfig.legacyProperty(id: propertyId)?.name
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

        // Impôt : mêmes noms de champs que dans `state.impot` de la PWA.
        if let i = state["impot"] as? [String: Any] {
            let t = data.ensureTaxInputs()
            t.revenuT4 = double(i["revenuT4"]) ?? 0
            t.impotRetenuFed = double(i["impotRetenuFed"]) ?? 0
            t.impotRetenuQc = double(i["impotRetenuQc"]) ?? 0
            t.gainsRRQCotises = double(i["gainsRRQCotises"]) ?? 0
            t.autresRevenus = double(i["autresRevenus"]) ?? 0
            t.autresDeductions = double(i["autresDeductions"]) ?? 0
            t.acomptesFed = acomptes(i["acomptesFed"])
            t.acomptesQc = acomptes(i["acomptesQc"])
        }

        // Registre de DPA : `state.biens`, où `dpa` est un dictionnaire
        // année → montant. Seule l'année restaurée est reprise ; les autres
        // appartiennent aux sauvegardes de ces années-là.
        for raw in (state["biens"] as? [[String: Any]]) ?? [] {
            let dpa = (raw["dpa"] as? [String: Any]) ?? [:]
            let dto = CapitalAssetDTO(
                assetId: (raw["id"] as? String) ?? UUID().uuidString,
                propId: (raw["propId"] as? String) ?? CCAService.vehPseudoProp,
                label: (raw["description"] as? String) ?? "",
                categorie: (raw["categorie"] as? String) ?? "1",
                dateAcquisition: (raw["dateAcquisition"] as? String) ?? "",
                cout: double(raw["cout"]) ?? 0,
                coutTerrain: double(raw["coutTerrain"]) ?? 0,
                lie: (raw["lie"] as? Bool) ?? false,
                // Chaîne vide côté PWA = pas de surcharge, et non zéro.
                fnaccOuverture: double(raw["fnaccOuverture"]),
                dispositionDate: (raw["dispositionDate"] as? String) ?? "",
                dispositionProduit: double(raw["dispositionProduit"]) ?? 0,
                dpaReclamee: double(dpa[String(year)]) ?? 0)
            insererBien(dto, year: year, context: context)
        }
        try? context.save()

        return year
    }

    /// Quatre échéances, quoi que contienne le fichier : le noyau indexe par
    /// échéance et un tableau plus court ferait sortir l'écran de ses bornes.
    private static func acomptes(_ raw: Any?) -> [Double] {
        let brut = (raw as? [Any]) ?? []
        let v = brut.map { double($0) ?? 0 }
        return v.count >= 4 ? Array(v.prefix(4)) : v + Array(repeating: 0, count: 4 - v.count)
    }

    private static func insererBien(_ b: CapitalAssetDTO, year: Int, context: ModelContext) {
        let asset = CapitalAsset(assetId: b.assetId, year: year, propId: b.propId)
        asset.label = b.label
        asset.categorie = b.categorie
        asset.dateAcquisition = b.dateAcquisition
        asset.cout = b.cout
        asset.coutTerrain = b.coutTerrain
        asset.lie = b.lie
        asset.fnaccOuverture = b.fnaccOuverture
        asset.dispositionDate = b.dispositionDate
        asset.dispositionProduit = b.dispositionProduit
        asset.dpaReclamee = b.dpaReclamee
        context.insert(asset)
    }

    /// Immeuble décrit par la configuration webapp (`setup.propsList`) :
    /// { id, label, kind, subtype, revenus[], deductibles[], capital[],
    ///   address, distanceKm, pct, coOwners }
    private static func ensurePWAProperty(_ dto: [String: Any], sortOrder: Int,
                                          context: ModelContext, data: DataService) {
        guard let propId = dto["id"] as? String else { return }
        let pct = double(dto["pct"]) ?? 100
        let coOwners = (dto["coOwners"] as? String) ?? ""
        if let existing = data.property(id: propId) {
            existing.ownershipPct = pct
            existing.coOwners = coOwners
            if let name = dto["label"] as? String, !name.isEmpty { existing.name = name }
            if let address = dto["address"] as? String, !address.isEmpty { existing.address = address }
            return
        }
        let strings: (Any?) -> [String] = { ($0 as? [Any] ?? []).compactMap { $0 as? String } }
        context.insert(RentalProperty(
            propId: propId,
            name: (dto["label"] as? String) ?? propId,
            address: (dto["address"] as? String) ?? "",
            kind: PropertyKind(rawValue: (dto["kind"] as? String) ?? "") ?? .plex,
            subtypeCode: (dto["subtype"] as? String) ?? "autre",
            oneWayKm: double(dto["distanceKm"]) ?? 0,
            ownershipPct: pct,
            coOwners: coOwners,
            revenueCategories: strings(dto["revenus"]),
            deductibleCategories: strings(dto["deductibles"]),
            capitalCategories: strings(dto["capital"]),
            sortOrder: sortOrder
        ))
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
