//  ════════════════════════════════════════════════════════════════════════════
//  FiscalData.swift — PARAMÈTRES FISCAUX VERSIONNÉS, PORTÉS DE js/fiscal-data.js
//
//  Même règle que côté PWA : AUCUN taux fiscal ailleurs dans l'application iOS.
//  Tout vit ici, indexé par année, avec la source officielle en commentaire.
//  Une nouvelle année = un nouveau bloc, rien d'autre à changer.
//
//  Les valeurs ne sont pas retapées « à l'œil » : la suite de parité compare
//  champ par champ ce fichier au tableau `FISCAL` de la PWA (assertions P01–P04).
//  Une coquille sur un seuil ou un taux fait échouer la suite au lieu de
//  déplacer silencieusement chaque montant déclaré.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

// MARK: - Structures de paramètres

/// Un palier : `(plafond, taux)`. Le dernier plafond vaut `.infinity`, comme
/// l'`Infinity` du tableau JavaScript.
typealias Palier = (plafond: Double, taux: Double)

struct ParamsKm {
    let paliers: [Palier]
    let territoires: Double
}

struct ParamsFed {
    let paliers: [Palier]
    let bpa: Double
    let bpaMin: Double
    let bpaSeuilReduction: (bas: Double, haut: Double)
    let abattementQc: Double
    let tauxCreditBase: Double
}

struct ParamsQc {
    let paliers: [Palier]
    let bpa: Double
    let tauxCreditBase: Double
}

struct ParamsRRQ {
    let mga: Double, msga: Double, exemption: Double
    let tauxAutonome: Double, tauxAutonome2: Double
    let maxBase: Double, maxSupp: Double
}

struct ParamsRQAP {
    let taux: Double, max: Double, mga: Double
}

struct ParamsFSS {
    let seuil: Double, plafondPremierPalier: Double, plancher: Double
    let seuilSecondPalier: Double, plafondSecondPalier: Double, max: Double
}

struct ParamsAuto {
    let plafondCat101: Double, loyerMensuelMax: Double
    let interetMensuelMax: Double, avantageKm: Double
}

struct ParamsTaxes {
    let tps: Double, tvq: Double
}

struct ParamsAcomptes {
    let seuilFed: Double, seuilQc: Double
    /// « MM-JJ », l'année est ajoutée au calcul.
    let dates: [String]
}

struct ParamsMutation {
    let paliers: [Palier]
    let seuilMunicipal: Double, tauxMaxMunicipal: Double
    let creditPremierAcheteur: Double
}

struct ParamsFiscaux {
    let verifie: String
    let km: ParamsKm
    let fed: ParamsFed
    let qc: ParamsQc
    let rrq: ParamsRRQ
    let rqap: ParamsRQAP
    let fss: ParamsFSS
    let auto: ParamsAuto
    let taxes: ParamsTaxes
    let acomptes: ParamsAcomptes
    let tauxInclusionGainCapital: Double
    let mutation: ParamsMutation
    /// Année effectivement utilisée lorsque celle demandée n'existe pas encore.
    /// `nil` = les paramètres sont bien ceux de l'année demandée.
    var repli: Int?
}

// MARK: - Catégories de DPA

/// `batiment` marque les catégories visées par la restriction du par. 1100(11)
/// (la DPA ne peut créer ni augmenter une perte locative) et par la classe
/// distincte de l'art. 1101(1ac).
struct CategorieDPA {
    let code: String
    let taux: Double
    let batiment: Bool
    let label: String
    let aide: String
}

// MARK: - Le tableau

enum Fiscalite {

    /// Les années connues. Ajouter une année = ajouter une entrée ici.
    static let annees: [Int: ParamsFiscaux] = [

        2026: ParamsFiscaux(
            verifie: "2026-10-20",
            // Taux kilométrique « allocation raisonnable » (Règl. impôt art. 7306) —
            // Finances Canada, 14 janvier 2026. Taux PAR PALIER, et non taux unique.
            km: ParamsKm(paliers: [(5000, 0.73), (.infinity, 0.67)], territoires: 0.04),
            // ARC, « Taux d'impôt et tranches ». Indexation 2026 : 2,0 %.
            // Le premier taux est passé de 15 % à 14 %.
            fed: ParamsFed(
                paliers: [(58523, 0.14), (117045, 0.205), (181440, 0.26), (258482, 0.29), (.infinity, 0.33)],
                bpa: 16452, bpaMin: 14829, bpaSeuilReduction: (181440, 258482),
                abattementQc: 0.165, tauxCreditBase: 0.14),
            // Revenu Québec, « Taux d'imposition ». Le BPA 2026 est indexé
            // (18 571 $ × 1,0205) et reste à confirmer au TP-1 2026.
            qc: ParamsQc(
                paliers: [(54345, 0.14), (108680, 0.19), (132245, 0.24), (.infinity, 0.2575)],
                bpa: 18952, tauxCreditBase: 0.14),
            // RRQ du travailleur autonome : il paie les deux parts (6,30 % × 2).
            // N'est dû QUE sur le revenu d'entreprise, jamais sur le loyer net.
            rrq: ParamsRRQ(mga: 74600, msga: 85000, exemption: 3500,
                           tauxAutonome: 0.126, tauxAutonome2: 0.08,
                           maxBase: 8958.60, maxSupp: 832.00),
            rqap: ParamsRQAP(taux: 0.00764, max: 786.92, mga: 103000),
            // Cotisation au FSS (annexe F) — Finances Québec, bulletin 2025-8.
            // Assiette : entreprise, biens, retraite, gains en capital. Le revenu
            // d'EMPLOI est exclu, et c'est ce qui la rend pertinente ici.
            fss: ParamsFSS(seuil: 18500, plafondPremierPalier: 33500, plancher: 150,
                           seuilSecondPalier: 64355, plafondSecondPalier: 149355, max: 1000),
            auto: ParamsAuto(plafondCat101: 39000, loyerMensuelMax: 1100,
                             interetMensuelMax: 350, avantageKm: 0.34),
            taxes: ParamsTaxes(tps: 0.05, tvq: 0.09975),
            // Résident du Québec : seuil fédéral abaissé à 1 800 $ par l'abattement.
            acomptes: ParamsAcomptes(seuilFed: 1800, seuilQc: 1800,
                                     dates: ["03-15", "06-15", "09-15", "12-15"]),
            // Taux d'inclusion de LA MOITIÉ : la hausse aux deux tiers annoncée au
            // budget 2024 a été annulée le 21 mars 2025, et Québec s'est harmonisé.
            tauxInclusionGainCapital: 0.5,
            mutation: ParamsMutation(paliers: [(62900, 0.005), (315000, 0.01), (.infinity, 0.015)],
                                     seuilMunicipal: 500000, tauxMaxMunicipal: 0.03,
                                     creditPremierAcheteur: 5000),
            repli: nil),

        2025: ParamsFiscaux(
            verifie: "2026-10-20",
            km: ParamsKm(paliers: [(5000, 0.72), (.infinity, 0.66)], territoires: 0.04),
            fed: ParamsFed(
                paliers: [(57375, 0.15), (114750, 0.205), (177882, 0.26), (253414, 0.29), (.infinity, 0.33)],
                bpa: 16129, bpaMin: 14538, bpaSeuilReduction: (177882, 253414),
                abattementQc: 0.165, tauxCreditBase: 0.15),
            qc: ParamsQc(
                paliers: [(53255, 0.14), (106495, 0.19), (129590, 0.24), (.infinity, 0.2575)],
                bpa: 18571, tauxCreditBase: 0.14),
            rrq: ParamsRRQ(mga: 71300, msga: 81200, exemption: 3500,
                           tauxAutonome: 0.128, tauxAutonome2: 0.08,
                           maxBase: 8678.40, maxSupp: 792.00),
            rqap: ParamsRQAP(taux: 0.00878, max: 1012.00, mga: 115300),
            fss: ParamsFSS(seuil: 18130, plafondPremierPalier: 33130, plancher: 150,
                           seuilSecondPalier: 63060, plafondSecondPalier: 148060, max: 1000),
            auto: ParamsAuto(plafondCat101: 38000, loyerMensuelMax: 1100,
                             interetMensuelMax: 350, avantageKm: 0.34),
            taxes: ParamsTaxes(tps: 0.05, tvq: 0.09975),
            acomptes: ParamsAcomptes(seuilFed: 1800, seuilQc: 1800,
                                     dates: ["03-15", "06-15", "09-15", "12-15"]),
            tauxInclusionGainCapital: 0.5,
            mutation: ParamsMutation(paliers: [(61500, 0.005), (307800, 0.01), (.infinity, 0.015)],
                                     seuilMunicipal: 500000, tauxMaxMunicipal: 0.03,
                                     creditPremierAcheteur: 5000),
            repli: nil)
    ]

    /// Paramètres d'une année, avec repli sur la plus récente connue. Évite un
    /// `nil` silencieux si l'utilisateur ouvre 2027 avant que les paramètres
    /// soient publiés : les calculs restent possibles, et `repli` permet à
    /// l'écran de dire que ce sont des ordres de grandeur.
    static func params(_ year: Int) -> ParamsFiscaux {
        if let p = annees[year] { return p }
        let plusRecente = annees.keys.sorted(by: >)[0]
        var p = annees[plusRecente]!
        p.repli = plusRecente
        return p
    }

    static func estRepli(_ year: Int) -> Bool { params(year).repli != nil }

    // MARK: - Impôt par paliers

    struct ResultatPaliers {
        let impot: Double
        /// Taux de la dernière tranche atteinte — le taux marginal.
        let marginal: Double
    }

    static func impotParPaliers(_ revenu: Double, _ paliers: [Palier]) -> ResultatPaliers {
        var reste = max(0, revenu), bas = 0.0, impot = 0.0, marginal = 0.0
        for (plafond, taux) in paliers {
            if reste <= 0 { break }
            let tranche = min(reste, plafond - bas)
            impot += tranche * taux
            marginal = taux
            reste -= tranche
            bas = plafond
        }
        return ResultatPaliers(impot: impot, marginal: marginal)
    }

    // MARK: - Indemnité kilométrique

    struct TrancheKm {
        let km: Double, taux: Double, montant: Double
    }

    struct Indemnite {
        let montant: Double
        /// Inférieur au taux du premier palier dès qu'on dépasse le seuil : c'est
        /// tout l'intérêt de ne pas appliquer un taux unique.
        let tauxMoyen: Double
        let detail: [TrancheKm]
    }

    static func kmIndemnite(_ km: Double, _ year: Int) -> Indemnite {
        let paliers = params(year).km.paliers
        var reste = max(0, km), bas = 0.0, montant = 0.0
        var detail: [TrancheKm] = []
        for (plafond, taux) in paliers {
            if reste <= 0 { break }
            let tranche = min(reste, plafond - bas)
            if tranche > 0 {
                montant += tranche * taux
                detail.append(TrancheKm(km: tranche, taux: taux, montant: tranche * taux))
            }
            reste -= tranche
            bas = plafond
        }
        return Indemnite(montant: montant,
                         tauxMoyen: km > 0 ? montant / km : 0,
                         detail: detail)
    }

    // MARK: - Cotisations

    struct CotisationFSS {
        let montant: Double, assiette: Double, palier: String
    }

    /// Barème du FSS à quatre paliers. Rend un objet et non un nombre nu, pour
    /// que l'écran puisse afficher l'assiette et le palier retenu.
    static func cotisationFSS(_ revenuAssujetti: Double, _ year: Int) -> CotisationFSS {
        let f = params(year).fss
        let r = max(0, revenuAssujetti)
        func res(_ montant: Double, _ palier: String) -> CotisationFSS {
            CotisationFSS(montant: montant, assiette: r, palier: palier)
        }
        if r <= f.seuil { return res(0, "sous le seuil") }
        if r <= f.plafondPremierPalier { return res(min(f.plancher, (r - f.seuil) * 0.01), "1 % du revenu excedant le seuil") }
        if r <= f.seuilSecondPalier { return res(f.plancher, "cotisation plancher") }
        if r <= f.plafondSecondPalier { return res(min(f.max, f.plancher + (r - f.seuilSecondPalier) * 0.01), "plancher + 1 % de l\u{2019}excedent") }
        return res(f.max, "cotisation maximale")
    }

    struct CotisationRRQ {
        let base: Double, supp: Double, total: Double
        /// Déduite du revenu (ligne 22200 au fédéral) : la moitié de la base, plus
        /// la totalité de la cotisation supplémentaire.
        let deductible: Double
        /// L'autre moitié de la base, qui donne un crédit non remboursable.
        let credit: Double
    }

    /// `revenuEntreprise` : revenu net d'entreprise SEUL, jamais le loyer net.
    /// `gainsDejaCotises` : gains d'emploi déjà soumis au RRQ par l'employeur,
    /// qui consomment l'exemption et le plafond — sans quoi un salarié qui
    /// conduit pour Uber se verrait facturer deux fois la même tranche.
    static func cotisationRRQ(_ revenuEntreprise: Double, _ gainsDejaCotises: Double, _ year: Int) -> CotisationRRQ {
        let r = params(year).rrq
        let ent = max(0, revenuEntreprise)
        let emploi = max(0, gainsDejaCotises)
        if ent <= 0 { return CotisationRRQ(base: 0, supp: 0, total: 0, deductible: 0, credit: 0) }

        let exemptionRestante = max(0, r.exemption - emploi)
        let plafondRestant = max(0, r.mga - max(emploi, r.exemption))
        let cotisableBase = min(max(0, ent - exemptionRestante), plafondRestant)
        let base = cotisableBase * r.tauxAutonome

        let totalGains = emploi + ent
        let cotisableSupp = max(0, min(totalGains, r.msga) - max(emploi, r.mga))
        let supp = max(0, cotisableSupp) * r.tauxAutonome2

        return CotisationRRQ(base: base, supp: supp, total: base + supp,
                             deductible: base / 2 + supp, credit: base / 2)
    }

    struct CotisationRQAP {
        let montant: Double, assiette: Double, taux: Double
    }

    static func cotisationRQAP(_ revenuEntreprise: Double, _ year: Int) -> CotisationRQAP {
        let q = params(year).rqap
        let assiette = min(max(0, revenuEntreprise), q.mga)
        return CotisationRQAP(montant: min(assiette * q.taux, q.max), assiette: assiette, taux: q.taux)
    }

    /// Montant personnel de base fédéral, réduit linéairement aux revenus élevés.
    static func bpaFederal(_ revenuNet: Double, _ year: Int) -> Double {
        let f = params(year).fed
        let (bas, haut) = f.bpaSeuilReduction
        if revenuNet <= bas { return f.bpa }
        if revenuNet >= haut { return f.bpaMin }
        let ratio = (revenuNet - bas) / (haut - bas)
        return f.bpa - (f.bpa - f.bpaMin) * ratio
    }

    // MARK: - Catégories de DPA (ARC T4036 et T2125)

    static let categoriesDPA: [CategorieDPA] = [
        CategorieDPA(code: "1", taux: 0.04, batiment: true, label: "Catégorie 1 — Bâtiment (4 %)",
            aide: "Immeuble acquis après 1987, et ses composantes intégrées (électricité, chauffage, ascenseur). Le TERRAIN n'est jamais amortissable."),
        CategorieDPA(code: "1-6", taux: 0.06, batiment: true, label: "Catégorie 1 — Non résidentiel + 2 % (6 %)",
            aide: "Bâtiment non résidentiel acquis après le 18 mars 2007, catégorie distincte produite."),
        CategorieDPA(code: "1-10", taux: 0.10, batiment: true, label: "Catégorie 1 — Fabrication + 6 % (10 %)",
            aide: "Bâtiment utilisé à ≥ 90 % pour la fabrication, catégorie distincte produite."),
        CategorieDPA(code: "3", taux: 0.05, batiment: true, label: "Catégorie 3 — Bâtiment avant 1988 (5 %)",
            aide: "Immeuble acquis avant 1988 (ou avant 1990 sous conditions)."),
        CategorieDPA(code: "6", taux: 0.10, batiment: true, label: "Catégorie 6 — Charpente de bois, etc. (10 %)",
            aide: "Bâtiment en bois, pièce sur pièce, tôle ou terre, sans semelle sous le niveau du sol."),
        CategorieDPA(code: "8", taux: 0.20, batiment: false, label: "Catégorie 8 — Mobilier et électroménagers (20 %)",
            aide: "Réfrigérateur, cuisinière, laveuse, mobilier, climatiseur non intégré, enseigne, outils de 500 $ et plus."),
        CategorieDPA(code: "10", taux: 0.30, batiment: false, label: "Catégorie 10 — Véhicule et informatique (30 %)",
            aide: "Voiture de tourisme dont le coût ne dépasse pas le plafond, camionnette, matériel informatique."),
        CategorieDPA(code: "10.1", taux: 0.30, batiment: false, label: "Catégorie 10.1 — Voiture de luxe (30 %)",
            aide: "Voiture de tourisme au-dessus du plafond de l'année d'acquisition. Une catégorie distincte PAR véhicule, pas de perte finale ni de récupération."),
        CategorieDPA(code: "12", taux: 1.00, batiment: false, label: "Catégorie 12 — Petits outils, logiciels (100 %)",
            aide: "Outils de moins de 500 $, vaisselle, ustensiles, logiciel d'application. Souvent sans règle du demi-taux."),
        CategorieDPA(code: "13", taux: 0, batiment: false, label: "Catégorie 13 — Tenure à bail (linéaire)",
            aide: "Améliorations locatives : amorties linéairement sur la durée du bail. Saisir la DPA manuellement."),
        CategorieDPA(code: "14.1", taux: 0.05, batiment: false, label: "Catégorie 14.1 — Immobilisation incorporelle (5 %)",
            aide: "Achalandage, permis de durée indéterminée."),
        CategorieDPA(code: "43", taux: 0.30, batiment: false, label: "Catégorie 43 — Matériel de fabrication (30 %)",
            aide: "Machinerie et matériel de fabrication et de transformation."),
        CategorieDPA(code: "50", taux: 0.55, batiment: false, label: "Catégorie 50 — Matériel informatique (55 %)",
            aide: "Matériel de traitement de l'information acquis après le 18 mars 2007.")
    ]

    static func categorieDPA(_ code: String) -> CategorieDPA? {
        categoriesDPA.first { $0.code == code }
    }
}
