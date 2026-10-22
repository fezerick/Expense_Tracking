//  ════════════════════════════════════════════════════════════════════════════
//  ParityReference.swift — LIRE LA RÉFÉRENCE PRODUITE PAR LA PWA
//
//  `parite-vague1.json` n'est pas écrit à la main : il est relevé sur la suite
//  de modules de la PWA, en vol, par `npm run parite:export`. Ce fichier ne fait
//  donc que le décoder et le traduire dans les types du Core.
//
//  Deux traductions méritent une ligne d'explication :
//
//  • JSON ne connaît pas Infinity. Le dernier plafond d'un barème sort donc à
//    `null`, et redevient ici `.infinity` — exactement l'`Infinity` que le
//    tableau `FISCAL` de la PWA porte.
//  • Les montants des biens sont déjà des nombres dans le JSON, alors que
//    `state` les garde en chaînes côté PWA. C'est `num()` qui fait la
//    conversion des deux côtés : la frontière est au même endroit, et la parité
//    porte bien sur le calcul et non sur l'analyse syntaxique.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

// MARK: - Barèmes

/// `[[58523, 0.14], [null, 0.33]]` → `[(58523, 0.14), (.infinity, 0.33)]`.
func paliersDeRef(_ brut: [[Double?]]) -> [Palier] {
    brut.map { (plafond: $0.first.flatMap { $0 } ?? .infinity, taux: $0.count > 1 ? ($0[1] ?? 0) : 0) }
}

struct RefKm: Decodable { let paliers: [[Double?]]; let territoires: Double }

struct RefFed: Decodable {
    let paliers: [[Double?]]
    let bpa, bpaMin: Double
    let bpaSeuilReduction: [Double]
    let abattementQc, tauxCreditBase: Double
}

struct RefQc: Decodable { let paliers: [[Double?]]; let bpa, tauxCreditBase: Double }

struct RefRRQ: Decodable {
    let mga, msga, exemption, tauxAutonome, tauxAutonome2, maxBase, maxSupp: Double
}

struct RefRQAP: Decodable { let taux, max, mga: Double }

struct RefFSS: Decodable {
    let seuil, plafondPremierPalier, plancher: Double
    let seuilSecondPalier, plafondSecondPalier, max: Double
}

struct RefAuto: Decodable { let plafondCat101, loyerMensuelMax, interetMensuelMax, avantageKm: Double }
struct RefTaxes: Decodable { let tps, tvq: Double }
struct RefAcomptesParams: Decodable { let seuilFed, seuilQc: Double; let dates: [String] }

struct RefMutation: Decodable {
    let paliers: [[Double?]]
    let seuilMunicipal, tauxMaxMunicipal, creditPremierAcheteur: Double
}

struct RefParams: Decodable {
    let verifie: String
    let km: RefKm
    let fed: RefFed
    let qc: RefQc
    let rrq: RefRRQ
    let rqap: RefRQAP
    let fss: RefFSS
    let auto: RefAuto
    let taxes: RefTaxes
    let acomptes: RefAcomptesParams
    let tauxInclusionGainCapital: Double
    let mutation: RefMutation
}

// MARK: - Cas de fonctions pures

struct RefCategorie: Decodable { let code: String; let taux: Double; let batiment: Bool }
struct RefNum: Decodable { let entree: String; let attendu: Double }
struct RefCsv: Decodable { let cellules: [String]; let attendu: String }
struct RefKmCas: Decodable { let km, montant, tauxMoyen: Double; let tranches: Int }
struct RefPalierCas: Decodable {
    struct Resultat: Decodable { let impot, marginal: Double }
    let revenu: Double
    let fed, qc: Resultat
}
struct RefFssCas: Decodable { let revenu, montant: Double; let palier: String }
struct RefRrqCas: Decodable { let entreprise, emploi, base, supp, total, deductible, credit: Double }
struct RefRqapCas: Decodable { let revenu, montant, assiette: Double }
struct RefBpaCas: Decodable { let revenuNet, bpa: Double }

// MARK: - DPA

struct RefBien: Decodable {
    let id, propId, categorie, dateAcquisition: String
    let cout, coutTerrain: Double
    let lie: Bool
    let fnaccOuverture: Double?
    /// Les clés d'année sont des chaînes en JSON ; le Core les veut en `Int`.
    let dpa: [String: Double]
    let dispositionDate: String
    let dispositionProduit: Double

    var bien: BienAmortissable {
        BienAmortissable(
            id: id, propId: propId, categorie: categorie, dateAcquisition: dateAcquisition,
            cout: cout, coutTerrain: coutTerrain, lie: lie, fnaccOuverture: fnaccOuverture,
            dpa: dpa.reduce(into: [Int: Double]()) { acc, kv in
                if let an = Int(kv.key) { acc[an] = kv.value }
            },
            dispositionDate: dispositionDate, dispositionProduit: dispositionProduit)
    }
}

struct RefPool: Decodable {
    let cle, categorie: String
    let locatif: Bool
    let libelle, nomProp: String
    let ouverture: Double
    let reportee: Bool
    let ajouts, ajoutsAII, ajoutsDemi, dispositions, reduction: Double
    let base, taux, dpaMax, reclamee, fermeture: Double
    let distincte: Bool
}

struct RefDpa: Decodable {
    let year: Int
    let biens: [RefBien]
    let plafondLocatif: Double?
    let pools: [RefPool]
    let total, totalLocatif, maxLocatif: Double
    /// Présent pour le seul scénario de report : les biens tels que l'année
    /// précédente les connaissait, que le fournisseur restituera.
    let annee: Int?
    let biensAnneePrecedente: [RefBien]?
}

// MARK: - Impôt

struct RefEntrees: Decodable {
    let moduleProps, moduleRideshare: Bool
    let revenuLocatif, depensesLocatives, uberNet, lyftNet: Double
    let depensesVehicule, kmTotalAnnuel, kmUber, kmLyft: Double
    let dpaLocative, dpaEntreprise: Double
    let revenuT4, autresRevenus, autresDeductions, gainsRRQCotises: Double
    let impotRetenuFed, impotRetenuQc: Double
    let acomptesFed, acomptesQc: [Double]

    var entrees: EntreesImpot {
        EntreesImpot(
            moduleProps: moduleProps, moduleRideshare: moduleRideshare,
            revenuLocatif: revenuLocatif, depensesLocatives: depensesLocatives,
            uberNet: uberNet, lyftNet: lyftNet,
            depensesVehicule: depensesVehicule, kmTotalAnnuel: kmTotalAnnuel,
            kmUber: kmUber, kmLyft: kmLyft,
            dpaLocative: dpaLocative, dpaEntreprise: dpaEntreprise,
            revenuT4: revenuT4, autresRevenus: autresRevenus,
            autresDeductions: autresDeductions, gainsRRQCotises: gainsRRQCotises,
            impotRetenuFed: impotRetenuFed, impotRetenuQc: impotRetenuQc,
            acomptesFed: acomptesFed, acomptesQc: acomptesQc)
    }
}

struct RefVersement: Decodable {
    let date: String
    let echue: Bool
    let fed, qc, manqueFed, manqueQc: Double
    let jours: Int
    let enRetard: Bool
}

struct RefAcomptesAttendus: Decodable {
    let requisFed, requisQc: Bool
    let netFed, netQc, seuil, manqueTotal: Double
    let joursAvantProchain: Int?
    let versements: [RefVersement]
}

struct RefImpot: Decodable {
    let entrees: RefEntrees
    /// Comparées champ par champ par leur nom : la liste des clés est la même
    /// des deux côtés, et une clé oubliée fait échouer la parité.
    let assiettes: [String: Double]
    let calcul: [String: Double]
    let acomptes: RefAcomptesAttendus
    let tauxMarginalEstime: Double
}

// MARK: - La référence entière

struct Reference: Decodable {
    let annee: Int
    /// Date du jour au moment du relevé, réinjectée dans le calcul des acomptes
    /// pour que `echue`, `jours` et `enRetard` gardent leur sens une fois le
    /// 15 décembre franchi.
    let aujourdhui: String
    let params: [String: RefParams]
    let categoriesDPA: [RefCategorie]
    let num: [RefNum]
    let csv: [RefCsv]
    let immeubles: [String: String]
    let dpaHorsAII, dpaCourant, dpaReport: RefDpa
    let km: [RefKmCas]
    let paliers: [RefPalierCas]
    let fss: [RefFssCas]
    let rrq: [RefRrqCas]
    let rqap: [RefRqapCas]
    let bpaFed: [RefBpaCas]
    let impot: RefImpot

    /// Les sections `sync` et `journal` ne sont pas décodées en types fixes :
    /// ce sont des états, où l'ordre des clés et la différence entre une clé
    /// absente et une clé à `null` font partie de ce qui est vérifié. Elles sont
    /// relues par le lecteur du noyau, qui préserve l'un et l'autre — voir
    /// ParityCodec.swift.
    var brut: Valeur = .nul

    private enum CodingKeys: String, CodingKey {
        case annee, aujourdhui, params, categoriesDPA, num, csv, immeubles
        case dpaHorsAII, dpaCourant, dpaReport, km, paliers, fss, rrq, rqap, bpaFed, impot
    }

    static func charger(_ chemin: String) throws -> Reference {
        let data = try Data(contentsOf: URL(fileURLWithPath: chemin))
        var ref = try JSONDecoder().decode(Reference.self, from: data)
        ref.brut = try Valeur.depuisJSON(donnees: data)
        return ref
    }
}
