import Foundation
import SwiftData

/// Accès centralisé aux données d'une année fiscale + toutes les formules de calcul.
/// Les vues passent leur `ModelContext` ; aucune logique de calcul n'est dupliquée dans l'UI.
struct DataService {

    let context: ModelContext
    let year: Int

    init(context: ModelContext, year: Int) {
        self.context = context
        self.year = year
    }

    // MARK: - Année fiscale

    /// Retourne les réglages de l'année, en les créant au besoin (avec la checklist par défaut).
    @discardableResult
    func ensureFiscalYear() -> FiscalYear {
        let y = year
        let descriptor = FetchDescriptor<FiscalYear>(predicate: #Predicate { $0.year == y })
        if let existing = try? context.fetch(descriptor).first {
            return existing
        }
        let fy = FiscalYear(year: y)
        context.insert(fy)
        seedChecklistIfEmpty()
        return fy
    }

    func allYears() -> [Int] {
        let descriptor = FetchDescriptor<FiscalYear>(sortBy: [SortDescriptor(\.year)])
        let years = (try? context.fetch(descriptor).map(\.year)) ?? []
        return years.isEmpty ? [AppConfig.defaultYear] : years
    }

    // MARK: - Immeubles (RentalProperty, communs à toutes les années)

    func properties() -> [RentalProperty] {
        let descriptor = FetchDescriptor<RentalProperty>(
            sortBy: [SortDescriptor(\.sortOrder), SortDescriptor(\.createdAt)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func property(id: String) -> RentalProperty? {
        properties().first { $0.propId == id }
    }

    /// Ids présents dans les montants de l'année sans immeuble configuré
    /// (ex. après un démarrage à zéro alors que des données existaient déjà).
    func orphanPropertyIds() -> [String] {
        let known = Set(properties().map(\.propId))
        let y = year
        let descriptor = FetchDescriptor<EntryAmount>(predicate: #Predicate { $0.year == y })
        let ids = Set(((try? context.fetch(descriptor)) ?? []).map(\.propertyId))
        return ids.subtracting(known).subtracting(["other", ""]).sorted()
    }

    /// Recrée un immeuble pour des données orphelines : définition historique si
    /// l'id est connu (p1090/p470), sinon reconstruction depuis les catégories trouvées.
    @discardableResult
    func restoreOrphanProperty(id: String) -> RentalProperty {
        if let existing = property(id: id) { return existing }
        let sortOrder = (properties().map(\.sortOrder).max() ?? -1) + 1
        if let legacy = AppConfig.legacyProperty(id: id) {
            let prop = RentalProperty(
                propId: legacy.id, name: legacy.name, address: legacy.address,
                kind: legacy.id == AppConfig.p470.id ? .plex : .appart,
                subtypeCode: legacy.id == AppConfig.p470.id ? "triplex" : "colocation",
                oneWayKm: legacy.oneWayKm,
                revenueCategories: legacy.revenueCategories,
                deductibleCategories: legacy.deductibleCategories,
                capitalCategories: legacy.capitalCategories,
                sortOrder: sortOrder
            )
            context.insert(prop)
            return prop
        }
        // Reconstruction générique : les catégories observées dans les données.
        let y = year
        let descriptor = FetchDescriptor<EntryAmount>(predicate: #Predicate { $0.year == y && $0.propertyId == id })
        let orphanEntries = (try? context.fetch(descriptor)) ?? []
        func cats(_ section: EntrySection) -> [String] {
            Array(Set(orphanEntries.filter { $0.section == section.rawValue }.map(\.category))).sorted()
        }
        let revenue = cats(.revenue)
        let prop = RentalProperty(
            propId: id, name: "Immeuble récupéré",
            kind: .plex, subtypeCode: "autre",
            revenueCategories: revenue.isEmpty ? ["Logement 1"] : revenue,
            deductibleCategories: Array(Set(AppConfig.standardDeductibleCategories + cats(.deductible))),
            capitalCategories: cats(.capital).isEmpty
                ? AppConfig.defaultCapitalCategories(unitNames: revenue)
                : cats(.capital),
            sortOrder: sortOrder
        )
        context.insert(prop)
        return prop
    }

    // MARK: - Trajets

    func trips() -> [Trip] {
        let y = year
        let descriptor = FetchDescriptor<Trip>(
            predicate: #Predicate { $0.year == y },
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func trips(month: Int) -> [Trip] {
        trips().filter { $0.month == month }
    }

    func trips(propertyId: String, month: Int) -> [Trip] {
        trips().filter { $0.propertyId == propertyId && $0.month == month }
    }

    func addTrip(date: Date, propertyId: String, destinationLabel: String,
                 km: Double, roundTrip: Bool, purpose: String) {
        let trip = Trip(year: year, date: date, propertyId: propertyId,
                        destinationLabel: destinationLabel, km: km,
                        roundTrip: roundTrip, purpose: purpose)
        context.insert(trip)
    }

    func delete(_ trip: Trip) {
        context.delete(trip)
    }

    /// montant_trajet = km × taux_km_annee
    func amount(for trip: Trip) -> Double {
        trip.km * ensureFiscalYear().kmRate
    }

    /// frais_deplacement_auto(propriete, mois) = Σ km des trajets du mois vers la propriété × taux
    func travelAutoAmount(propertyId: String, month: Int) -> Double {
        let km = trips(propertyId: propertyId, month: month).reduce(0) { $0 + $1.km }
        return km * ensureFiscalYear().kmRate
    }

    func travelAutoAmountAnnual(propertyId: String) -> Double {
        let km = trips().filter { $0.propertyId == propertyId }.reduce(0) { $0 + $1.km }
        return km * ensureFiscalYear().kmRate
    }

    /// Km annuels de tous les trajets vers des immeubles (pour la proration véhicule).
    /// "other" = destination personnalisée, exclue du locatif.
    func rentalKmTotal() -> Double {
        trips().filter { $0.propertyId != "other" }
            .reduce(0) { $0 + $1.km }
    }

    func totalTripsAmount() -> Double {
        trips().reduce(0) { $0 + $1.km } * ensureFiscalYear().kmRate
    }

    // MARK: - Montants mensuels des propriétés

    func entries(propertyId: String) -> [EntryAmount] {
        let y = year
        let pid = propertyId
        let descriptor = FetchDescriptor<EntryAmount>(
            predicate: #Predicate { $0.year == y && $0.propertyId == pid }
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func entry(propertyId: String, section: EntrySection, category: String, month: Int,
               createIfMissing: Bool = false) -> EntryAmount? {
        let existing = entries(propertyId: propertyId).first {
            $0.section == section.rawValue && $0.category == category && $0.month == month
        }
        if let existing { return existing }
        guard createIfMissing else { return nil }
        let e = EntryAmount(year: year, propertyId: propertyId, section: section,
                            category: category, month: month)
        context.insert(e)
        return e
    }

    func amount(propertyId: String, section: EntrySection, category: String, month: Int) -> Double {
        // "Frais de déplacement" est toujours calculé depuis le journal, jamais lu en base.
        if section == .deductible && category == AppConfig.travelExpenseCategory {
            return travelAutoAmount(propertyId: propertyId, month: month)
        }
        return entry(propertyId: propertyId, section: section, category: category, month: month)?.amount ?? 0
    }

    func setAmount(_ value: Double, propertyId: String, section: EntrySection, category: String, month: Int) {
        guard !(section == .deductible && category == AppConfig.travelExpenseCategory) else { return }
        entry(propertyId: propertyId, section: section, category: category,
              month: month, createIfMissing: true)?.amount = value
    }

    // MARK: - Totaux propriété

    func sectionTotal(propertyId: String, section: EntrySection, month: Int) -> Double {
        guard let prop = property(id: propertyId) else { return 0 }
        return prop.categories(section)
            .reduce(0) { $0 + amount(propertyId: propertyId, section: section, category: $1, month: month) }
    }

    func sectionAnnualTotal(propertyId: String, section: EntrySection) -> Double {
        (0..<12).reduce(0) { $0 + sectionTotal(propertyId: propertyId, section: section, month: $1) }
    }

    func categoryAnnualTotal(propertyId: String, section: EntrySection, category: String) -> Double {
        (0..<12).reduce(0) { $0 + amount(propertyId: propertyId, section: section, category: category, month: $1) }
    }

    /// net_mensuel = revenus − déductibles (le capital n'entre pas dans le net courant)
    func monthlyNet(propertyId: String, month: Int) -> Double {
        sectionTotal(propertyId: propertyId, section: .revenue, month: month)
            - sectionTotal(propertyId: propertyId, section: .deductible, month: month)
    }

    func annualNet(propertyId: String) -> Double {
        sectionAnnualTotal(propertyId: propertyId, section: .revenue)
            - sectionAnnualTotal(propertyId: propertyId, section: .deductible)
    }

    // MARK: - Totaux globaux locatifs

    func totalRevenueAll() -> Double {
        properties().reduce(0) { $0 + sectionAnnualTotal(propertyId: $1.propId, section: .revenue) }
    }

    func totalDeductibleAll() -> Double {
        properties().reduce(0) { $0 + sectionAnnualTotal(propertyId: $1.propId, section: .deductible) }
    }

    func totalCapitalAll() -> Double {
        properties().reduce(0) { $0 + sectionAnnualTotal(propertyId: $1.propId, section: .capital) }
    }

    /// benefice_locatif_net_global
    func rentalNetGlobal() -> Double {
        totalRevenueAll() - totalDeductibleAll()
    }

    /// benefice_global = bénéfice locatif + revenu net Uber + net Lyft
    ///                    − déduction véhicule Uber − déduction véhicule Lyft
    ///
    /// Les revenus rideshare entrent bien dans le total : les soustraire les déductions
    /// véhicule sans ajouter les revenus correspondants donnait un bénéfice global
    /// fortement négatif alors que le rapport PDF, lui, était correct.
    /// `includeRideshare` suit le module « Uber / Lyft » de l'assistant : module masqué,
    /// ni les revenus ni les déductions rideshare ne comptent.
    func globalNet(includeRideshare: Bool = true) -> Double {
        guard includeRideshare else { return rentalNetGlobal() }
        return rentalNetGlobal() + uberNetIncome() + lyftNetTotal()
             - vehicleDeductionUber() - vehicleDeductionLyft()
    }

    // MARK: - Uber

    func uberValues() -> [UberValue] {
        let y = year
        let descriptor = FetchDescriptor<UberValue>(predicate: #Predicate { $0.year == y })
        return (try? context.fetch(descriptor)) ?? []
    }

    func uberValue(_ key: String) -> Double {
        uberValues().first { $0.key == key }?.value ?? 0
    }

    func setUberValue(_ value: Double, key: String) {
        if let existing = uberValues().first(where: { $0.key == key }) {
            existing.value = value
        } else {
            context.insert(UberValue(year: year, key: key, value: value))
        }
    }

    /// Revenu net Uber = revenus courses + autres revenus − frais de service/autres frais + remise sur frais
    func uberNetIncome() -> Double {
        let revenue = AppConfig.uberRevenueKeys.reduce(0) { $0 + uberValue($1) }
        let other = AppConfig.uberOtherIncomeKeys.reduce(0) { $0 + uberValue($1) }
        let fees = AppConfig.uberFeeKeys.reduce(0) { $0 + uberValue($1) }
        return revenue + other - fees + uberValue("fee_discount")
    }

    // MARK: - Lyft

    func lyftMonths() -> [LyftMonth] {
        let y = year
        let descriptor = FetchDescriptor<LyftMonth>(
            predicate: #Predicate { $0.year == y },
            sortBy: [SortDescriptor(\.month)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func lyftMonth(_ month: Int, createIfMissing: Bool = false) -> LyftMonth? {
        if let existing = lyftMonths().first(where: { $0.month == month }) { return existing }
        guard createIfMissing else { return nil }
        let m = LyftMonth(year: year, month: month)
        context.insert(m)
        return m
    }

    func lyftKmTotal() -> Double {
        lyftMonths().reduce(0) { $0 + $1.km }
    }

    func lyftNetTotal() -> Double {
        lyftMonths().reduce(0) { $0 + $1.net }
    }

    func lyftTaxableTotal() -> Double {
        lyftMonths().reduce(0) { $0 + $1.taxable }
    }

    // MARK: - Véhicule (proration)

    func vehicleExpenses() -> [VehicleExpense] {
        let y = year
        let descriptor = FetchDescriptor<VehicleExpense>(predicate: #Predicate { $0.year == y })
        return (try? context.fetch(descriptor)) ?? []
    }

    func vehicleAmount(category: String) -> Double {
        vehicleExpenses().first { $0.category == category }?.amount ?? 0
    }

    func setVehicleAmount(_ value: Double, category: String) {
        if let existing = vehicleExpenses().first(where: { $0.category == category }) {
            existing.amount = value
        } else {
            context.insert(VehicleExpense(year: year, category: category, amount: value))
        }
    }

    func vehicleTotalExpenses() -> Double {
        AppConfig.vehicleCategories.reduce(0) { $0 + vehicleAmount(category: $1) }
    }

    /// pct = km plateforme / km total annuel du véhicule (0 si km total = 0)
    func uberKmOnline() -> Double { uberValue("km_online") }

    func pctUber() -> Double {
        let total = ensureFiscalYear().vehicleTotalKm
        guard total > 0 else { return 0 }
        return uberKmOnline() / total
    }

    func pctLyft() -> Double {
        let total = ensureFiscalYear().vehicleTotalKm
        guard total > 0 else { return 0 }
        return lyftKmTotal() / total
    }

    func pctRental() -> Double {
        let total = ensureFiscalYear().vehicleTotalKm
        guard total > 0 else { return 0 }
        return rentalKmTotal() / total
    }

    func vehicleDeductionUber() -> Double {
        vehicleTotalExpenses() * pctUber()
    }

    func vehicleDeductionLyft() -> Double {
        vehicleTotalExpenses() * pctLyft()
    }

    // MARK: - Impôt estimé (noyau : Core/TaxService.swift)

    /// Les montants saisis à la main pour l'année, créés au besoin.
    @discardableResult
    func ensureTaxInputs() -> TaxInputs {
        let y = year
        let descriptor = FetchDescriptor<TaxInputs>(predicate: #Predicate { $0.year == y })
        if let existing = try? context.fetch(descriptor).first { return existing }
        let t = TaxInputs(year: year)
        context.insert(t)
        return t
    }

    /// Assemble les entrées du noyau. C'est le pendant exact de ce que
    /// `assiettes()` va chercher dans `state` côté PWA : les totaux locatifs,
    /// les revenus rideshare, le véhicule, la DPA réclamée séparée par usage, et
    /// les montants saisis dans l'écran d'impôt.
    ///
    /// Aucune règle fiscale ici : les modules sont transmis tels quels et c'est
    /// `TaxService.assiettes` qui décide ce qu'un module masqué annule.
    func entreesImpot(moduleProps: Bool = AppSetup.moduleProperties,
                      moduleRideshare: Bool = AppSetup.moduleRideshare) -> EntreesImpot {
        let t = ensureTaxInputs()
        let fy = ensureFiscalYear()
        let dpa = dpaReclameeParUsage()
        return EntreesImpot(
            moduleProps: moduleProps,
            moduleRideshare: moduleRideshare,
            revenuLocatif: totalRevenueAll(),
            depensesLocatives: totalDeductibleAll(),
            uberNet: uberNetIncome(),
            lyftNet: lyftNetTotal(),
            depensesVehicule: vehicleTotalExpenses(),
            kmTotalAnnuel: fy.vehicleTotalKm,
            kmUber: uberKmOnline(),
            kmLyft: lyftKmTotal(),
            dpaLocative: dpa.locatif,
            dpaEntreprise: dpa.entreprise,
            revenuT4: t.revenuT4,
            autresRevenus: t.autresRevenus,
            autresDeductions: t.autresDeductions,
            gainsRRQCotises: t.gainsRRQCotises,
            impotRetenuFed: t.impotRetenuFed,
            impotRetenuQc: t.impotRetenuQc,
            acomptesFed: t.acomptesFedNormalises,
            acomptesQc: t.acomptesQcNormalises)
    }

    func calculImpot() -> ResultatImpot {
        TaxService.calculImpot(entreesImpot(), year: year)
    }

    func calculAcomptes() -> ResultatAcomptes {
        TaxService.calculAcomptes(entreesImpot(), year: year)
    }

    /// Taux marginal combiné, utilisé par l'arbitrage de la DPA.
    func tauxMarginalEstime() -> Double {
        TaxService.tauxMarginalEstime(entreesImpot(), year: year)
    }

    // MARK: - DPA : registre des biens (noyau : Core/CCAService.swift)

    func capitalAssets(year an: Int? = nil) -> [CapitalAsset] {
        let y = an ?? year
        let descriptor = FetchDescriptor<CapitalAsset>(
            predicate: #Predicate { $0.year == y },
            sortBy: [SortDescriptor(\.createdAt)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func capitalAsset(assetId: String) -> CapitalAsset? {
        capitalAssets().first { $0.assetId == assetId }
    }

    /// Plafond de l'art. 1100(11) : la DPA locative ne peut excéder le revenu
    /// net de location AVANT DPA, tous immeubles confondus. `nil` quand le
    /// module Logements est masqué — il n'y a alors pas de locatif à plafonner.
    func plafondLocatifDPA(moduleProps: Bool = AppSetup.moduleProperties) -> Double? {
        guard moduleProps else { return nil }
        return max(0, totalRevenueAll() - totalDeductibleAll())
    }

    func calculDPA() -> CalculDPA {
        CCAService.calculer(year: year,
                            biens: capitalAssets().map(\.bien),
                            plafondLocatif: plafondLocatifDPA(),
                            nomImmeuble: { [self] id in property(id: id)?.name ?? id },
                            fournisseur: fournisseurBiens)
    }

    /// Les biens d'une année antérieure, ou `nil` si cette année n'a jamais été
    /// saisie : c'est ce `nil` qui arrête le report et fait de la plus ancienne
    /// année connue l'amorce du registre.
    private var fournisseurBiens: CCAService.FournisseurBiens {
        { [self] an in
            let rows = capitalAssets(year: an)
            return rows.isEmpty ? nil : rows.map(\.bien)
        }
    }

    /// DPA réclamée, séparée entre le locatif et l'entreprise : les deux ne
    /// jouent pas sur les mêmes assiettes.
    func dpaReclameeParUsage() -> (locatif: Double, entreprise: Double) {
        let c = calculDPA()
        return (c.pools.filter(\.locatif).reduce(0) { $0 + $1.reclamee },
                c.pools.filter { !$0.locatif }.reduce(0) { $0 + $1.reclamee })
    }

    /// Inscrit la DPA d'une catégorie sur son premier bien, comme la PWA :
    /// la catégorie est mise en commun, un seul porteur suffit.
    func reclamerDPA(pool: PoolDPA, montant: Double) {
        guard let premier = pool.biens.first,
              let row = capitalAsset(assetId: premier.id) else { return }
        row.dpaReclamee = min(max(0, montant), (pool.dpaMax * 100).rounded() / 100)
    }

    /// Réclame le maximum admissible, plafond de l'art. 1100(11) compris.
    func reclamerMaxDPA() {
        var biens = capitalAssets().map(\.bien)
        CCAService.reclamerMax(biens: &biens, year: year,
                               plafondLocatif: plafondLocatifDPA(),
                               nomImmeuble: { [self] id in property(id: id)?.name ?? id },
                               fournisseur: fournisseurBiens)
        appliquer(biens)
    }

    /// Ne rien réclamer cette année : le solde reste dans la FNACC.
    func renoncerDPA() {
        var biens = capitalAssets().map(\.bien)
        CCAService.renoncer(biens: &biens, year: year)
        appliquer(biens)
    }

    /// Reporte dans le registre les montants que le noyau a inscrits sur les
    /// biens. Un bien dont la DPA a été effacée revient à 0 : le noyau retire
    /// la clé, l'enregistrement ne peut pas être absent.
    private func appliquer(_ biens: [BienAmortissable]) {
        let parId = Dictionary(biens.map { ($0.id, $0.dpa[year] ?? 0) },
                               uniquingKeysWith: { a, _ in a })
        for row in capitalAssets() {
            row.dpaReclamee = parId[row.assetId] ?? 0
        }
    }

    @discardableResult
    func nouveauBien() -> CapitalAsset {
        let asset = CapitalAsset(
            year: year,
            propId: properties().first?.propId ?? CCAService.vehPseudoProp)
        asset.dateAcquisition = "\(year)-01-01"
        context.insert(asset)
        return asset
    }

    func delete(_ asset: CapitalAsset) {
        context.delete(asset)
    }

    /// Reprend le registre d'une autre année, en CONSERVANT `assetId` : c'est
    /// lui qui relie le bien d'un exercice à l'autre et permet le report
    /// automatique de la FNACC. La DPA de l'année d'arrivée repart à zéro, et
    /// la surcharge manuelle de FNACC n'est pas reprise — l'ouverture vient
    /// désormais du report.
    @discardableResult
    func importerRegistre(depuis an: Int) -> Int {
        let existants = Set(capitalAssets().map(\.assetId))
        var n = 0
        for src in capitalAssets(year: an) where !existants.contains(src.assetId) {
            let copie = CapitalAsset(assetId: src.assetId, year: year, propId: src.propId)
            copie.label = src.label
            copie.categorie = src.categorie
            copie.dateAcquisition = src.dateAcquisition
            copie.cout = src.cout
            copie.coutTerrain = src.coutTerrain
            copie.lie = src.lie
            copie.dispositionDate = src.dispositionDate
            copie.dispositionProduit = src.dispositionProduit
            context.insert(copie)
            n += 1
        }
        return n
    }

    /// Années du registre autres que l'année courante, les plus récentes d'abord.
    func anneesRegistre() -> [Int] {
        let descriptor = FetchDescriptor<CapitalAsset>()
        let rows = (try? context.fetch(descriptor)) ?? []
        return Array(Set(rows.map(\.year))).filter { $0 != year }.sorted(by: >)
    }

    /// DPA réclamée sur ce bien, toutes années confondues : c'est le montant qui
    /// sera récupéré à la vente.
    func dpaCumulee(assetId: String) -> Double {
        let descriptor = FetchDescriptor<CapitalAsset>()
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.filter { $0.assetId == assetId }.reduce(0) { $0 + $1.dpaReclamee }
    }

    // MARK: - Checklist

    func checklist() -> [ChecklistItem] {
        let y = year
        let descriptor = FetchDescriptor<ChecklistItem>(
            predicate: #Predicate { $0.year == y },
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func seedChecklistIfEmpty() {
        guard checklist().isEmpty else { return }
        let labels = AppConfig.defaultChecklist(propertyNames: properties().map(\.name))
        for (i, label) in labels.enumerated() {
            context.insert(ChecklistItem(year: year, label: label, sortOrder: i))
        }
    }

    func resetChecklist() {
        checklist().forEach { context.delete($0) }
        let labels = AppConfig.defaultChecklist(propertyNames: properties().map(\.name))
        for (i, label) in labels.enumerated() {
            context.insert(ChecklistItem(year: year, label: label, sortOrder: i))
        }
    }

    // MARK: - Effacement de l'année

    /// Efface les DONNÉES de l'année (trajets, montants, relevés, checklist).
    /// La liste des immeubles (RentalProperty) est une configuration : conservée.
    func eraseYearData() {
        trips().forEach { context.delete($0) }
        let y = year
        let entryDescriptor = FetchDescriptor<EntryAmount>(predicate: #Predicate { $0.year == y })
        ((try? context.fetch(entryDescriptor)) ?? []).forEach { context.delete($0) }
        uberValues().forEach { context.delete($0) }
        lyftMonths().forEach { context.delete($0) }
        vehicleExpenses().forEach { context.delete($0) }
        checklist().forEach { context.delete($0) }
        capitalAssets().forEach { context.delete($0) }
        let taxDescriptor = FetchDescriptor<TaxInputs>(predicate: #Predicate { $0.year == y })
        ((try? context.fetch(taxDescriptor)) ?? []).forEach { context.delete($0) }
        // Concrétise les suppressions avant tout nouveau fetch : un fetch avec des
        // objets supprimés en attente fait planter l'évaluation des #Predicate.
        try? context.save()
        let fy = ensureFiscalYear()
        fy.kmRate = AppConfig.defaultKmRate
        fy.vehicleTotalKm = AppConfig.defaultVehicleTotalKm
        fy.vehicleModel = AppConfig.defaultVehicleModel
        seedChecklistIfEmpty()
    }
}
