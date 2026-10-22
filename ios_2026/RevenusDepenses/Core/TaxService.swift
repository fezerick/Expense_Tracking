//  ════════════════════════════════════════════════════════════════════════════
//  TaxService.swift — IMPÔT ESTIMÉ, COTISATIONS, ACOMPTES. PORTÉ DE js/impot.js
//
//  La seule question qui compte en cours d'année est : COMBIEN METTRE DE CÔTÉ.
//  Un revenu locatif et un revenu Uber ne font l'objet d'aucune retenue à la
//  source ; la facture arrive en avril, et Revenu Québec comme l'ARC exigent des
//  acomptes dès 1 800 $ d'impôt net.
//
//  Distinctions qui changent le résultat :
//
//  • Le loyer net est un REVENU DE BIENS : aucune cotisation au RRQ, aucun
//    RQAP. Uber et Lyft sont un REVENU D'ENTREPRISE : les trois s'appliquent.
//    Le FSS, lui, porte sur les deux.
//  • Le RRQ d'un travailleur autonome se paie en entier (part employé + part
//    employeur) : la moitié de la base est déductible, l'autre moitié donne un
//    crédit, la cotisation supplémentaire est entièrement déductible.
//  • Un résident du Québec bénéficie de l'abattement fédéral de 16,5 %.
//
//  Frontière avec le reste de l'app : ce service ne lit RIEN. Il reçoit des
//  agrégats déjà totalisés (`EntreesImpot`) et rend des nombres. C'est la vue
//  Impôt qui les assemble depuis SwiftData, et c'est ce qui permet d'exécuter la
//  suite de parité hors simulateur.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

/// Tout ce dont le calcul a besoin, déjà totalisé. Les quatre acomptes sont des
/// tableaux de quatre valeurs ; plus court, les versements manquants valent 0.
struct EntreesImpot {
    /// Immeubles locatifs activés dans l'assistant de configuration.
    var moduleProps: Bool = true
    /// Uber / Lyft activés.
    var moduleRideshare: Bool = true

    // ── Locatif, tous immeubles confondus ──
    var revenuLocatif: Double = 0
    var depensesLocatives: Double = 0

    // ── Entreprise (rideshare) ──
    var uberNet: Double = 0
    var lyftNet: Double = 0

    // ── Véhicule, pour le prorata d'affaires ──
    var depensesVehicule: Double = 0
    var kmTotalAnnuel: Double = 0
    var kmUber: Double = 0
    var kmLyft: Double = 0

    // ── DPA réclamée, séparée par usage : les deux ne jouent pas sur les
    //    mêmes assiettes (cf. CCAService).
    var dpaLocative: Double = 0
    var dpaEntreprise: Double = 0

    // ── Hors application ──
    var revenuT4: Double = 0
    var autresRevenus: Double = 0
    var autresDeductions: Double = 0
    /// Gains d'emploi déjà soumis au RRQ par un employeur.
    var gainsRRQCotises: Double = 0
    var impotRetenuFed: Double = 0
    var impotRetenuQc: Double = 0
    var acomptesFed: [Double] = [0, 0, 0, 0]
    var acomptesQc: [Double] = [0, 0, 0, 0]
}

struct ProrataVehicule {
    let uber: Double, lyft: Double, total: Double
}

struct Assiettes {
    let revLoc: Double, depLoc: Double
    let netLocAvantDPA: Double, netLoc: Double, dpaLoc: Double
    let revEnt: Double, depEnt: Double, netEnt: Double, dpaEnt: Double
    let veh: ProrataVehicule
    let t4: Double, autres: Double, gainsDejaCotises: Double
    let rrq: Fiscalite.CotisationRRQ
    let rqap: Fiscalite.CotisationRQAP
    let fss: Fiscalite.CotisationFSS
    let deductionsCotisations: Double
    let revenuTotal: Double, revenuNet: Double
}

struct ResultatImpot {
    let assiettes: Assiettes
    let year: Int

    let fedBrut: Fiscalite.ResultatPaliers
    let bpaFed: Double, creditsFed: Double
    let fedApresCredits: Double, abattement: Double, fedNet: Double

    let qcBrut: Fiscalite.ResultatPaliers
    let creditsQc: Double, qcNet: Double

    let cotisations: Double, retenues: Double, acomptesVerses: Double
    let totalAvantRetenues: Double, solde: Double
    /// Taux marginal combiné : fédéral après abattement + Québec.
    let marginal: Double
    /// Impôt attribuable aux seuls revenus non retenus à la source — la
    /// provision à constituer, ce que l'app peut dire d'utile en juin.
    let provision: Double
    let tauxEffectif: Double
}

struct Versement {
    let date: String
    let echue: Bool
    let fed: Double, qc: Double
    let verseFed: Double, verseQc: Double
    let manqueFed: Double, manqueQc: Double
    /// Jours avant l'échéance ; négatif si elle est passée.
    let jours: Int
    let enRetard: Bool
}

struct ResultatAcomptes {
    let requisFed: Bool, requisQc: Bool
    let netFed: Double, netQc: Double
    let versements: [Versement]
    let seuil: Double
    let prochain: Versement?
    let retards: [Versement]
    let manqueTotal: Double
    /// `nil` quand il n'y a plus d'échéance à venir (année passée, ou
    /// 15 décembre franchi).
    let joursAvantProchain: Int?
}

enum TaxService {

    // MARK: - Prorata du véhicule

    /// Part des dépenses du véhicule imputable à l'activité commerciale, au
    /// prorata des kilomètres. Sans kilométrage total déclaré, aucune dépense
    /// n'est imputée : un prorata sans dénominateur n'est pas une estimation
    /// prudente, c'est une invention.
    static func prorataVehicule(_ e: EntreesImpot) -> ProrataVehicule {
        guard e.kmTotalAnnuel > 0 else { return ProrataVehicule(uber: 0, lyft: 0, total: 0) }
        let uber = e.depensesVehicule * e.kmUber / e.kmTotalAnnuel
        let lyft = e.depensesVehicule * e.kmLyft / e.kmTotalAnnuel
        return ProrataVehicule(uber: uber, lyft: lyft, total: uber + lyft)
    }

    // MARK: - Assiettes

    static func assiettes(_ e: EntreesImpot, year: Int) -> Assiettes {
        let revLoc = e.moduleProps ? e.revenuLocatif : 0
        let depLoc = e.moduleProps ? e.depensesLocatives : 0
        let netLocAvantDPA = revLoc - depLoc
        let netLoc = netLocAvantDPA - e.dpaLocative

        let veh = prorataVehicule(e)
        let revEnt = e.moduleRideshare ? e.uberNet + e.lyftNet : 0
        let depEnt = e.moduleRideshare ? veh.total + e.dpaEntreprise : 0
        // Un revenu d'entreprise négatif ne cotise pas au RRQ ; il réduit en
        // revanche le revenu total imposable.
        let netEnt = revEnt - depEnt

        let rrq = Fiscalite.cotisationRRQ(max(0, netEnt), e.gainsRRQCotises, year)
        let rqap = Fiscalite.cotisationRQAP(max(0, netEnt), year)
        // Le FSS porte sur le revenu d'entreprise ET le revenu de placement
        // (dont le revenu de location) d'un particulier résidant au Québec.
        let fss = Fiscalite.cotisationFSS(max(0, netEnt) + max(0, netLoc), year)

        let deductionsCotisations = rrq.deductible + rqap.montant
        let revenuTotal = e.revenuT4 + netLoc + netEnt + e.autresRevenus
        let revenuNet = max(0, revenuTotal - deductionsCotisations - e.autresDeductions)

        return Assiettes(
            revLoc: revLoc, depLoc: depLoc,
            netLocAvantDPA: netLocAvantDPA, netLoc: netLoc, dpaLoc: e.dpaLocative,
            revEnt: revEnt, depEnt: depEnt, netEnt: netEnt, dpaEnt: e.dpaEntreprise,
            veh: veh,
            t4: e.revenuT4, autres: e.autresRevenus, gainsDejaCotises: e.gainsRRQCotises,
            rrq: rrq, rqap: rqap, fss: fss,
            deductionsCotisations: deductionsCotisations,
            revenuTotal: revenuTotal, revenuNet: revenuNet)
    }

    // MARK: - Impôt

    static func calculImpot(_ e: EntreesImpot, year: Int) -> ResultatImpot {
        let a = assiettes(e, year: year)
        let f = Fiscalite.params(year)

        // ── Fédéral ──
        let fedBrut = Fiscalite.impotParPaliers(a.revenuNet, f.fed.paliers)
        let bpaFed = Fiscalite.bpaFederal(a.revenuNet, year)
        // Crédits non remboursables au taux de la première tranche : montant
        // personnel de base + moitié de la cotisation de base au RRQ.
        let creditsFed = (bpaFed + a.rrq.credit) * f.fed.tauxCreditBase
        let fedApresCredits = max(0, fedBrut.impot - creditsFed)
        let abattement = fedApresCredits * f.fed.abattementQc
        let fedNet = fedApresCredits - abattement

        // ── Québec ──
        let qcBrut = Fiscalite.impotParPaliers(a.revenuNet, f.qc.paliers)
        let creditsQc = (f.qc.bpa + a.rrq.credit) * f.qc.tauxCreditBase
        let qcNet = max(0, qcBrut.impot - creditsQc)

        // ── Total à payer ──
        let cotisations = a.rrq.total + a.rqap.montant + a.fss.montant
        let retenues = e.impotRetenuFed + e.impotRetenuQc
        let totalAvantRetenues = fedNet + qcNet + cotisations
        let acomptesVerses = e.acomptesFed.reduce(0, +) + e.acomptesQc.reduce(0, +)

        let marginal = fedBrut.marginal * (1 - f.fed.abattementQc) + qcBrut.marginal

        // Impôt que l'utilisateur paierait SANS les revenus que l'app suit : la
        // différence est la provision à constituer.
        let sansRevenusApp: Double = {
            let base = max(0, e.revenuT4 + e.autresRevenus - e.autresDeductions)
            let fb = Fiscalite.impotParPaliers(base, f.fed.paliers)
            let qb = Fiscalite.impotParPaliers(base, f.qc.paliers)
            let cf = max(0, fb.impot - Fiscalite.bpaFederal(base, year) * f.fed.tauxCreditBase)
            let cq = max(0, qb.impot - f.qc.bpa * f.qc.tauxCreditBase)
            return cf * (1 - f.fed.abattementQc) + cq
        }()

        return ResultatImpot(
            assiettes: a, year: year,
            fedBrut: fedBrut, bpaFed: bpaFed, creditsFed: creditsFed,
            fedApresCredits: fedApresCredits, abattement: abattement, fedNet: fedNet,
            qcBrut: qcBrut, creditsQc: creditsQc, qcNet: qcNet,
            cotisations: cotisations, retenues: retenues, acomptesVerses: acomptesVerses,
            totalAvantRetenues: totalAvantRetenues,
            solde: totalAvantRetenues - retenues - acomptesVerses,
            marginal: marginal,
            provision: max(0, totalAvantRetenues - sansRevenusApp),
            tauxEffectif: a.revenuNet > 0 ? totalAvantRetenues / a.revenuNet : 0)
    }

    /// Utilisé par l'écran de DPA pour chiffrer l'arbitrage, et par le
    /// simulateur. La version JavaScript enveloppe l'appel dans un `try` et
    /// retombe sur 40 % — une précaution contre un `state` incomplet, qui n'a
    /// pas d'objet ici : `EntreesImpot` est totalement initialisé par son type.
    static func tauxMarginalEstime(_ e: EntreesImpot, year: Int) -> Double {
        calculImpot(e, year: year).marginal
    }

    // MARK: - Acomptes provisionnels

    /// Deux méthodes sont admises : sans calcul (montants envoyés par
    /// l'administration, fondés sur l'année précédente) ou méthode du « montant
    /// estimé » de l'année courante. C'est la seconde — la seule que l'app
    /// puisse calculer.
    ///
    /// - Parameter aujourdhui: date « AAAA-MM-JJ ». Injectée pour que la suite
    ///   de parité ne dépende pas du jour où elle tourne.
    static func calculAcomptes(_ e: EntreesImpot, year: Int, aujourdhui: String? = nil) -> ResultatAcomptes {
        let c = calculImpot(e, year: year)
        let f = Fiscalite.params(year)
        let auj = aujourdhui ?? isoDuJour()

        // Impôt net de l'année, hors retenues à la source.
        let netFed = max(0, c.fedNet - e.impotRetenuFed)
        let netQc = max(0, c.qcNet + c.cotisations - e.impotRetenuQc)

        let requisFed = netFed > f.acomptes.seuilFed
        let requisQc = netQc > f.acomptes.seuilQc

        let versements: [Versement] = f.acomptes.dates.enumerated().map { i, md in
            let date = "\(year)-\(md)"
            let fed = requisFed ? netFed / 4 : 0
            let qc = requisQc ? netQc / 4 : 0
            let verseFed = i < e.acomptesFed.count ? e.acomptesFed[i] : 0
            let verseQc = i < e.acomptesQc.count ? e.acomptesQc[i] : 0
            // Un versement du jour même n'est pas en retard : l'échéance court
            // jusqu'au soir, d'où le `<` et non `<=`.
            let echue = date < auj
            // Arrondi au cent : un écart de 0,004 $ dû à la division par quatre
            // ne doit pas déclencher une alerte de retard.
            let manqueFed = max(0, ((fed - verseFed) * 100).rounded() / 100)
            let manqueQc = max(0, ((qc - verseQc) * 100).rounded() / 100)
            return Versement(date: date, echue: echue, fed: fed, qc: qc,
                             verseFed: verseFed, verseQc: verseQc,
                             manqueFed: manqueFed, manqueQc: manqueQc,
                             jours: joursEntre(auj, date),
                             enRetard: echue && (manqueFed + manqueQc) > 0)
        }

        let prochain = versements.first { !$0.echue }
        let retards = versements.filter(\.enRetard)

        return ResultatAcomptes(
            requisFed: requisFed, requisQc: requisQc, netFed: netFed, netQc: netQc,
            versements: versements, seuil: f.acomptes.seuilFed,
            prochain: prochain, retards: retards,
            manqueTotal: retards.reduce(0) { $0 + $1.manqueFed + $1.manqueQc },
            joursAvantProchain: prochain?.jours)
    }

    // MARK: - Dates

    private static let calendrierUTC: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(secondsFromGMT: 0)!
        return c
    }()

    private static func isoDuJour() -> String {
        let f = DateFormatter()
        f.calendar = calendrierUTC
        f.timeZone = calendrierUTC.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    /// Différence en jours entre deux dates ISO, calculée à midi UTC pour que le
    /// changement d'heure d'été ne fasse pas basculer le résultat d'un jour.
    private static func joursEntre(_ depuis: String, _ vers: String) -> Int {
        guard let a = midiUTC(depuis), let b = midiUTC(vers) else { return 0 }
        return Int((b.timeIntervalSince(a) / 86400).rounded())
    }

    private static func midiUTC(_ iso: String) -> Date? {
        let p = iso.split(separator: "-")
        guard p.count == 3, let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]) else { return nil }
        return calendrierUTC.date(from: DateComponents(year: y, month: m, day: d, hour: 12))
    }
}
