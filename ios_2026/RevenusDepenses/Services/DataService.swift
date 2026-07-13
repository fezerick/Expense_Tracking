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

    /// Km annuels de tous les trajets vers les 2 propriétés (pour la proration véhicule).
    func rentalKmTotal() -> Double {
        trips().filter { $0.propertyId == AppConfig.p1090.id || $0.propertyId == AppConfig.p470.id }
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
        guard let prop = AppConfig.property(id: propertyId) else { return 0 }
        let categories: [String]
        switch section {
        case .revenue: categories = prop.revenueCategories
        case .deductible: categories = prop.deductibleCategories
        case .capital: categories = prop.capitalCategories
        }
        return categories.reduce(0) { $0 + amount(propertyId: propertyId, section: section, category: $1, month: month) }
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
        AppConfig.properties.reduce(0) { $0 + sectionAnnualTotal(propertyId: $1.id, section: .revenue) }
    }

    func totalDeductibleAll() -> Double {
        AppConfig.properties.reduce(0) { $0 + sectionAnnualTotal(propertyId: $1.id, section: .deductible) }
    }

    func totalCapitalAll() -> Double {
        AppConfig.properties.reduce(0) { $0 + sectionAnnualTotal(propertyId: $1.id, section: .capital) }
    }

    /// benefice_locatif_net_global
    func rentalNetGlobal() -> Double {
        totalRevenueAll() - totalDeductibleAll()
    }

    /// benefice_global = bénéfice locatif − déduction véhicule Uber − déduction véhicule Lyft
    func globalNet() -> Double {
        rentalNetGlobal() - vehicleDeductionUber() - vehicleDeductionLyft()
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
        for (i, label) in AppConfig.defaultChecklist.enumerated() {
            context.insert(ChecklistItem(year: year, label: label, sortOrder: i))
        }
    }

    func resetChecklist() {
        checklist().forEach { context.delete($0) }
        for (i, label) in AppConfig.defaultChecklist.enumerated() {
            context.insert(ChecklistItem(year: year, label: label, sortOrder: i))
        }
    }

    // MARK: - Effacement de l'année

    func eraseYearData() {
        trips().forEach { context.delete($0) }
        AppConfig.properties.forEach { prop in
            entries(propertyId: prop.id).forEach { context.delete($0) }
        }
        uberValues().forEach { context.delete($0) }
        lyftMonths().forEach { context.delete($0) }
        vehicleExpenses().forEach { context.delete($0) }
        checklist().forEach { context.delete($0) }
        let fy = ensureFiscalYear()
        fy.kmRate = AppConfig.defaultKmRate
        fy.vehicleTotalKm = AppConfig.defaultVehicleTotalKm
        fy.vehicleModel = AppConfig.defaultVehicleModel
        fy.ownershipPct1090 = 100
        fy.ownershipPct470 = 100
        fy.coOwner1090 = ""
        fy.coOwner470 = ""
        seedChecklistIfEmpty()
    }
}
