//  ════════════════════════════════════════════════════════════════════════════
//  CCAService.swift — DÉDUCTION POUR AMORTISSEMENT, PORTÉE DE js/dpa.js
//
//  C'était la seule donnée fiscale que l'application PERDAIT d'une année à
//  l'autre : la fraction non amortie du coût en capital devait être retapée, et
//  une erreur de saisie se propageait ensuite sur toutes les années suivantes
//  sans jamais être détectée.
//
//  Règles implémentées, avec leur source :
//
//  • Mise en commun par catégorie, et CLASSE DISTINCTE pour chaque immeuble
//    locatif dont le coût du bâtiment atteint 50 000 $ (Règl. de l'impôt sur le
//    revenu, art. 1101(1ac) ; guide T4036). Le terrain est exclu du test.
//  • La DPA ne peut ni créer ni augmenter une PERTE LOCATIVE, en tenant compte
//    de l'ensemble des immeubles (art. 1100(11)). Le solde non réclamé reste
//    dans la FNACC et n'est pas perdu.
//  • Règle du demi-taux l'année d'acquisition (art. 1100(2)) — SUSPENDUE pour
//    les biens admissibles à l'incitatif à l'investissement accéléré, acquis
//    après le 20 novembre 2018 et prêts à être mis en service avant 2028.
//  • Le TERRAIN n'est jamais amortissable.
//  • Catégorie 10.1 : coût plafonné, demi-taux maintenu.
//
//  Différence d'architecture avec la PWA, et c'est la seule : là où `dpa.js`
//  lit `localStorage` pour reporter la FNACC de l'année précédente, ce service
//  reçoit un FOURNISSEUR. Le calcul reste donc du Foundation pur — testable
//  hors simulateur, et indépendant de SwiftData.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

/// Un bien du registre. Volontairement une valeur et non un `@Model` : c'est
/// l'entrée d'un calcul, pas un objet persisté. `DataService` convertit.
struct BienAmortissable {
    var id: String
    /// Identifiant d'immeuble, ou `CCAService.vehPseudoProp` pour les biens du
    /// véhicule et de l'entreprise.
    var propId: String
    var description: String = ""
    var categorie: String
    /// « AAAA-MM-JJ ».
    var dateAcquisition: String
    var cout: Double = 0
    var coutTerrain: Double = 0
    /// Acquis d'une personne liée → pas d'incitatif à l'investissement accéléré.
    var lie: Bool = false
    /// Surcharge manuelle ; `nil` = FNACC reportée automatiquement de l'année
    /// précédente. Ne sert qu'à amorcer le registre sur un bien déjà amorti
    /// avant l'utilisation de l'application.
    var fnaccOuverture: Double? = nil
    /// DPA réclamée, par année.
    var dpa: [Int: Double] = [:]
    var dispositionDate: String = ""
    var dispositionProduit: Double = 0
}

/// Une catégorie mise en commun, telle que l'écran la présente : une ligne du
/// tableau de l'annexe de DPA.
struct PoolDPA {
    let cle: String
    let propId: String
    let categorie: String
    let biens: [BienAmortissable]
    let cat: CategorieDPA
    let libelle: String
    let nomProp: String
    /// `false` pour le véhicule et l'entreprise : les deux assiettes ne jouent
    /// pas sur les mêmes revenus.
    let locatif: Bool
    let ouverture: Double
    /// `true` si l'ouverture vient du report automatique et non d'une saisie.
    let reportee: Bool
    let ajouts: Double
    let ajoutsAII: Double
    let ajoutsDemi: Double
    let dispositions: Double
    let reduction: Double
    let base: Double
    let taux: Double
    let dpaMax: Double
    let reclamee: Double
    let fermeture: Double
    /// Classe distincte de l'art. 1101(1ac).
    let distincte: Bool
}

struct CalculDPA {
    let year: Int
    let pools: [PoolDPA]
    let total: Double
    let totalLocatif: Double
    let maxLocatif: Double
    /// Plafond de l'art. 1100(11), ou `nil` quand il n'est pas calculable pour
    /// cette année (le revenu locatif d'une autre année n'est pas chargé).
    let plafondLocatif: Double?
}

enum CCAService {

    /// Les biens du véhicule et de l'entreprise, qui n'appartiennent à aucun
    /// immeuble locatif.
    static let vehPseudoProp = "__veh"

    /// Art. 1101(1ac).
    static let seuilClasseDistincte: Double = 50000

    /// Catégories exclues de l'incitatif à l'investissement accéléré.
    static let catSansAII: Set<String> = ["43.1", "43.2", "53", "54", "55", "56"]

    /// Fournit les biens d'une année antérieure, ou `nil` si cette année n'a
    /// jamais été saisie — ce qui arrête le report : la plus ancienne année
    /// connue sert d'amorce, via la surcharge manuelle du bien.
    typealias FournisseurBiens = (Int) -> [BienAmortissable]?

    /// Nom lisible d'un immeuble, pour le libellé de la catégorie.
    typealias NomImmeuble = (String) -> String

    // MARK: - Mise en commun

    /// Clé de mise en commun : un immeuble locatif dont le bâtiment atteint
    /// 50 000 $ constitue sa propre catégorie ; sinon les biens de même
    /// catégorie et de même immeuble sont mis en commun.
    static func clePool(_ b: BienAmortissable) -> String {
        let cat = Fiscalite.categorieDPA(b.categorie)
        let amortissable = max(0, b.cout - b.coutTerrain)
        let distincte = (cat?.batiment ?? false)
            && b.propId != vehPseudoProp
            && amortissable >= seuilClasseDistincte
        return distincte ? "\(b.propId)|\(b.categorie)|\(b.id)" : "\(b.propId)|\(b.categorie)"
    }

    /// Admissibilité à l'incitatif à l'investissement accéléré : acquis après le
    /// 20 novembre 2018, prêt à être mis en service avant 2028, hors catégories
    /// exclues et hors acquisition auprès d'une personne liée.
    static func admissibleAII(_ b: BienAmortissable, year: Int) -> Bool {
        if b.lie { return false }
        if catSansAII.contains(b.categorie) { return false }
        if b.categorie == "10.1" { return false }        // demi-taux maintenu
        if b.dateAcquisition < "2018-11-21" { return false }
        return year < 2028
    }

    // MARK: - Calcul

    /// - Parameters:
    ///   - biens: les biens de `year` lui-même.
    ///   - plafondLocatif: revenu locatif net avant DPA, tous immeubles
    ///     confondus ; `nil` quand il n'est pas connu pour cette année.
    ///   - fournisseur: les biens des années antérieures, pour le report de la
    ///     FNACC. Par défaut aucun : la FNACC d'ouverture vaut alors 0 sauf
    ///     surcharge manuelle.
    static func calculer(year: Int,
                         biens: [BienAmortissable],
                         plafondLocatif: Double? = nil,
                         nomImmeuble: NomImmeuble = { $0 },
                         fournisseur: FournisseurBiens = { _ in nil }) -> CalculDPA {
        var memo: [Int: CalculDPA] = [:]
        return calculer(year: year, biens: biens, plafondLocatif: plafondLocatif,
                        nomImmeuble: nomImmeuble, fournisseur: fournisseur,
                        memo: &memo, profondeur: 0)
    }

    /// Garde-fou absent de la version JavaScript, où c'est le stockage qui borne
    /// la récursion : un fournisseur qui répondrait pour toute année boucherait
    /// indéfiniment. Cinquante ans de report dépassent largement la durée de vie
    /// d'un registre de biens.
    private static let profondeurMax = 50

    private static func calculer(year: Int,
                                 biens liste: [BienAmortissable],
                                 plafondLocatif: Double?,
                                 nomImmeuble: NomImmeuble,
                                 fournisseur: FournisseurBiens,
                                 memo: inout [Int: CalculDPA],
                                 profondeur: Int) -> CalculDPA {
        if let dejaFait = memo[year] { return dejaFait }

        // Mise en commun, dans l'ordre de première apparition : l'écran doit
        // présenter les catégories dans l'ordre où les biens ont été saisis.
        var ordre: [String] = []
        var groupes: [String: [BienAmortissable]] = [:]
        for b in liste {
            let cle = clePool(b)
            if groupes[cle] == nil { ordre.append(cle); groupes[cle] = [] }
            groupes[cle]?.append(b)
        }

        let pools: [PoolDPA] = ordre.map { cle in
            let membres = groupes[cle]!
            let premier = membres[0]
            let cat = Fiscalite.categorieDPA(premier.categorie)
                ?? CategorieDPA(code: premier.categorie, taux: 0, batiment: false, label: "?", aide: "")
            let nomProp = premier.propId == vehPseudoProp
                ? "Véhicule / entreprise"
                : Socle.shortLabel(nomImmeuble(premier.propId))

            // Ouverture : surcharge manuelle d'un des biens, sinon report.
            var ouverture: Double
            var reportee = false
            if let surcharge = membres.compactMap({ $0.fnaccOuverture }).first {
                ouverture = surcharge
            } else if profondeur < profondeurMax,
                      let precedents = fournisseur(year - 1) {
                let prec = calculer(year: year - 1, biens: precedents, plafondLocatif: nil,
                                    nomImmeuble: nomImmeuble, fournisseur: fournisseur,
                                    memo: &memo, profondeur: profondeur + 1)
                if let p = prec.pools.first(where: { $0.cle == cle }) {
                    ouverture = p.fermeture
                    reportee = true
                } else {
                    ouverture = 0
                }
            } else {
                ouverture = 0
            }

            // Ajouts et dispositions de l'année.
            var ajouts = 0.0, ajoutsAII = 0.0, ajoutsDemi = 0.0, dispositions = 0.0
            for b in membres {
                let amortissable = max(0, b.cout - b.coutTerrain)
                if Socle.anneeDe(b.dateAcquisition) == year && amortissable > 0 {
                    var base = amortissable
                    if b.categorie == "10.1" {
                        // Coût plafonné par la limite de l'année d'acquisition,
                        // taxes incluses.
                        let p = Fiscalite.params(year)
                        base = min(base, p.auto.plafondCat101 * (1 + p.taxes.tps + p.taxes.tvq))
                    }
                    ajouts += base
                    if admissibleAII(b, year: year) { ajoutsAII += base } else { ajoutsDemi += base }
                }
                if !b.dispositionDate.isEmpty && Socle.anneeDe(b.dispositionDate) == year {
                    // Le moindre du produit et du coût en capital réduit la catégorie.
                    dispositions += min(b.dispositionProduit, max(0, b.cout - b.coutTerrain))
                }
            }

            // Le demi-taux ne frappe que les ajouts NETS des dispositions
            // (art. 1100(2)) : des dispositions supérieures aux ajouts annulent
            // la réduction, elles ne la rendent pas négative.
            let ajoutsNetsDemi = max(0, ajoutsDemi - max(0, dispositions - ajoutsAII))
            let reduction = ajoutsNetsDemi * 0.5
            let base = max(0, ouverture + ajouts - dispositions - reduction)
            let reclamee = premier.dpa[year] ?? 0

            return PoolDPA(
                cle: cle, propId: premier.propId, categorie: premier.categorie, biens: membres,
                cat: cat,
                libelle: "\(nomProp) — cat. \(cat.code) (\(Socle.fmt(cat.taux * 100, 0)) %)",
                nomProp: nomProp, locatif: premier.propId != vehPseudoProp,
                ouverture: ouverture, reportee: reportee,
                ajouts: ajouts, ajoutsAII: ajoutsAII, ajoutsDemi: ajoutsDemi,
                dispositions: dispositions, reduction: reduction,
                base: base, taux: cat.taux, dpaMax: base * cat.taux,
                reclamee: reclamee,
                fermeture: max(0, ouverture + ajouts - dispositions - reclamee),
                distincte: cle.split(separator: "|").count == 3)
        }

        let res = CalculDPA(
            year: year, pools: pools,
            total: pools.reduce(0) { $0 + $1.reclamee },
            totalLocatif: pools.filter(\.locatif).reduce(0) { $0 + $1.reclamee },
            maxLocatif: pools.filter(\.locatif).reduce(0) { $0 + $1.dpaMax },
            plafondLocatif: plafondLocatif)
        memo[year] = res
        return res
    }

    // MARK: - Arbitrage

    /// Réclame la DPA maximale de l'année, en respectant le plafond de
    /// l'art. 1100(11). Les catégories au taux le plus élevé sont servies
    /// d'abord : à plafond égal, c'est ce qui laisse le moins de FNACC dormante.
    ///
    /// Modifie `biens` sur place, comme `reclamerMaxDPA()` écrit dans `state`.
    static func reclamerMax(biens: inout [BienAmortissable],
                            year: Int,
                            plafondLocatif: Double?,
                            nomImmeuble: NomImmeuble = { $0 },
                            fournisseur: FournisseurBiens = { _ in nil }) {
        let calc = calculer(year: year, biens: biens, plafondLocatif: plafondLocatif,
                            nomImmeuble: nomImmeuble, fournisseur: fournisseur)

        // Tri par taux décroissant, l'ordre de saisie tranchant les égalités :
        // sans cette seconde clé, deux catégories de même taux pourraient
        // échanger leur rang d'une exécution à l'autre, et le plafond ne serait
        // pas réparti de la même façon.
        let locatifs = calc.pools.enumerated()
            .filter { $0.element.locatif }
            .sorted { a, b in a.element.taux != b.element.taux ? a.element.taux > b.element.taux : a.offset < b.offset }
            .map(\.element)

        var reste = plafondLocatif ?? .infinity
        for p in locatifs {
            let m = min(p.dpaMax, max(0, reste))
            reste -= m
            inscrire(&biens, id: p.biens[0].id, year: year, montant: (m * 100).rounded() / 100)
        }
        for p in calc.pools where !p.locatif {
            inscrire(&biens, id: p.biens[0].id, year: year, montant: (p.dpaMax * 100).rounded() / 100)
        }
    }

    /// Renonce à toute DPA pour l'année : le solde reste dans la FNACC et sera
    /// amortissable plus tard, quand il y aura du revenu à réduire.
    static func renoncer(biens: inout [BienAmortissable], year: Int) {
        for i in biens.indices { biens[i].dpa[year] = nil }
    }

    private static func inscrire(_ biens: inout [BienAmortissable], id: String, year: Int, montant: Double) {
        guard let i = biens.firstIndex(where: { $0.id == id }) else { return }
        biens[i].dpa[year] = montant
    }
}
