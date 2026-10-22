//  ════════════════════════════════════════════════════════════════════════════
//  ParitySuite.swift — LE PORTAGE SWIFT DOIT RENDRE LES MÊMES NOMBRES
//
//  Deux familles d'assertions, et la distinction compte :
//
//  • `P##` — PARITÉ. On compare la sortie du Core Swift à ce que la PWA a
//    réellement produit sur la même fixture (ios_2026/Tests/Parity/
//    parite-vague1.json, relevé par `npm run parite:export`). C'est le contrat :
//    un écart ici veut dire que les deux applications déclareraient des montants
//    différents pour un même dossier.
//
//  • `M##` — les INVARIANTS de la suite JavaScript, repris sous le même
//    identifiant, vérifiés sur la sortie Swift (docs/PORTAGE_IOS.md § 7). Ils ne
//    comparent rien à la PWA ; ils redisent en Swift ce que le calcul est censé
//    respecter. Un même identifiant désigne donc la même règle des deux côtés.
//
//  Trois assertions de la suite JS n'ont pas d'équivalent ici, volontairement :
//  M06 (`escH`) et M08/M09 (`readYear`/`writeYear`) portent sur de l'échappement
//  HTML et sur localStorage, qui ne sont pas portés — SwiftUI échappe par
//  construction, et la persistance est le métier de `DataService`.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

// MARK: - Rapport

struct Assertion {
    let id: String
    let titre: String
    let ok: Bool
    let attendu: String
    let obtenu: String
}

final class Rapport {
    private(set) var assertions: [Assertion] = []

    /// Tolérance par défaut : les deux côtés font la même arithmétique sur les
    /// mêmes doubles, donc l'écart attendu est nul. Un demi-millième laisse
    /// passer un ordre d'opérations différent, jamais une formule différente.
    static let tol = 0.0005

    func ajouter(_ id: String, _ titre: String, ok: Bool, attendu: String, obtenu: String) {
        assertions.append(Assertion(id: id, titre: titre, ok: ok, attendu: attendu, obtenu: obtenu))
    }

    func eq(_ id: String, _ titre: String, _ attendu: Double, _ obtenu: Double,
            _ tol: Double = Rapport.tol) {
        ajouter(id, titre, ok: abs(attendu - obtenu) <= tol,
                attendu: nombre(attendu), obtenu: nombre(obtenu))
    }

    func eq(_ id: String, _ titre: String, _ attendu: String, _ obtenu: String) {
        ajouter(id, titre, ok: attendu == obtenu, attendu: attendu, obtenu: obtenu)
    }

    func check(_ id: String, _ titre: String, attendu: String, obtenu: String, _ ok: Bool) {
        ajouter(id, titre, ok: ok, attendu: attendu, obtenu: obtenu)
    }

    /// Une assertion pour un bloc entier de champs nommés. Le message d'échec
    /// nomme chaque champ qui diverge : plus lisible que soixante assertions
    /// dont cinquante-neuf passent.
    func champs(_ id: String, _ titre: String, _ paires: [(String, Double, Double)],
                _ tol: Double = Rapport.tol) {
        let ecarts = paires.filter { abs($0.1 - $0.2) > tol }
                           .map { "\($0.0) : attendu \(nombre($0.1)), obtenu \(nombre($0.2))" }
        ajouter(id, titre, ok: ecarts.isEmpty,
                attendu: "\(paires.count) champs identiques",
                obtenu: ecarts.isEmpty ? "\(paires.count) champs identiques" : ecarts.joined(separator: " · "))
    }

    /// Même principe, pour des champs non numériques.
    func textes(_ id: String, _ titre: String, _ paires: [(String, String, String)]) {
        let ecarts = paires.filter { $0.1 != $0.2 }.map { "\($0.0) : attendu « \($0.1) », obtenu « \($0.2) »" }
        ajouter(id, titre, ok: ecarts.isEmpty,
                attendu: "\(paires.count) champs identiques",
                obtenu: ecarts.isEmpty ? "\(paires.count) champs identiques" : ecarts.joined(separator: " · "))
    }

    /// Assez de chiffres pour qu'un écart d'un cent se voie dans le rapport :
    /// un message qui arrondit les deux côtés au même nombre est pire qu'inutile.
    private func nombre(_ d: Double) -> String {
        if !d.isFinite { return d > 0 ? "∞" : (d < 0 ? "-∞" : "NaN") }
        if d == d.rounded() && abs(d) < 1e15 { return String(Int(d)) }
        return String(format: "%.12g", d)
    }
}

// MARK: - La suite

enum ParitySuite {

    static func executer(_ ref: Reference) -> Rapport {
        let r = Rapport()
        let an = ref.annee

        baremes(r, ref)
        socle(r, ref)
        fonctionsABaremes(r, ref, an)
        amortissement(r, ref)
        impot(r, ref, an)

        return r
    }

    // ══ A. BARÈMES (FiscalData.swift ↔ js/fiscal-data.js) ════════════════════

    private static func baremes(_ r: Rapport, _ ref: Reference) {
        for (cle, attendu) in ref.params.sorted(by: { $0.key < $1.key }) {
            guard let annee = Int(cle) else { continue }
            let p = Fiscalite.params(annee)
            let suffixe = annee == ref.annee ? "P01" : "P02"

            r.textes(suffixe, "Paramètres \(annee) : les libellés et les dates sont ceux de la PWA",
                     [("verifie", attendu.verifie, p.verifie),
                      ("acomptes.dates", attendu.acomptes.dates.joined(separator: ","),
                       p.acomptes.dates.joined(separator: ","))])

            var paires: [(String, Double, Double)] = [
                ("km.territoires", attendu.km.territoires, p.km.territoires),
                ("fed.bpa", attendu.fed.bpa, p.fed.bpa),
                ("fed.bpaMin", attendu.fed.bpaMin, p.fed.bpaMin),
                ("fed.bpaSeuilReduction.bas", attendu.fed.bpaSeuilReduction[0], p.fed.bpaSeuilReduction.bas),
                ("fed.bpaSeuilReduction.haut", attendu.fed.bpaSeuilReduction[1], p.fed.bpaSeuilReduction.haut),
                ("fed.abattementQc", attendu.fed.abattementQc, p.fed.abattementQc),
                ("fed.tauxCreditBase", attendu.fed.tauxCreditBase, p.fed.tauxCreditBase),
                ("qc.bpa", attendu.qc.bpa, p.qc.bpa),
                ("qc.tauxCreditBase", attendu.qc.tauxCreditBase, p.qc.tauxCreditBase),
                ("rrq.mga", attendu.rrq.mga, p.rrq.mga),
                ("rrq.msga", attendu.rrq.msga, p.rrq.msga),
                ("rrq.exemption", attendu.rrq.exemption, p.rrq.exemption),
                ("rrq.tauxAutonome", attendu.rrq.tauxAutonome, p.rrq.tauxAutonome),
                ("rrq.tauxAutonome2", attendu.rrq.tauxAutonome2, p.rrq.tauxAutonome2),
                ("rrq.maxBase", attendu.rrq.maxBase, p.rrq.maxBase),
                ("rrq.maxSupp", attendu.rrq.maxSupp, p.rrq.maxSupp),
                ("rqap.taux", attendu.rqap.taux, p.rqap.taux),
                ("rqap.max", attendu.rqap.max, p.rqap.max),
                ("rqap.mga", attendu.rqap.mga, p.rqap.mga),
                ("fss.seuil", attendu.fss.seuil, p.fss.seuil),
                ("fss.plafondPremierPalier", attendu.fss.plafondPremierPalier, p.fss.plafondPremierPalier),
                ("fss.plancher", attendu.fss.plancher, p.fss.plancher),
                ("fss.seuilSecondPalier", attendu.fss.seuilSecondPalier, p.fss.seuilSecondPalier),
                ("fss.plafondSecondPalier", attendu.fss.plafondSecondPalier, p.fss.plafondSecondPalier),
                ("fss.max", attendu.fss.max, p.fss.max),
                ("auto.plafondCat101", attendu.auto.plafondCat101, p.auto.plafondCat101),
                ("auto.loyerMensuelMax", attendu.auto.loyerMensuelMax, p.auto.loyerMensuelMax),
                ("auto.interetMensuelMax", attendu.auto.interetMensuelMax, p.auto.interetMensuelMax),
                ("auto.avantageKm", attendu.auto.avantageKm, p.auto.avantageKm),
                ("taxes.tps", attendu.taxes.tps, p.taxes.tps),
                ("taxes.tvq", attendu.taxes.tvq, p.taxes.tvq),
                ("acomptes.seuilFed", attendu.acomptes.seuilFed, p.acomptes.seuilFed),
                ("acomptes.seuilQc", attendu.acomptes.seuilQc, p.acomptes.seuilQc),
                ("tauxInclusionGainCapital", attendu.tauxInclusionGainCapital, p.tauxInclusionGainCapital),
                ("mutation.seuilMunicipal", attendu.mutation.seuilMunicipal, p.mutation.seuilMunicipal),
                ("mutation.tauxMaxMunicipal", attendu.mutation.tauxMaxMunicipal, p.mutation.tauxMaxMunicipal),
                ("mutation.creditPremierAcheteur", attendu.mutation.creditPremierAcheteur,
                 p.mutation.creditPremierAcheteur)
            ]
            paires += comparerPaliers("km", paliersDeRef(attendu.km.paliers), p.km.paliers)
            paires += comparerPaliers("fed", paliersDeRef(attendu.fed.paliers), p.fed.paliers)
            paires += comparerPaliers("qc", paliersDeRef(attendu.qc.paliers), p.qc.paliers)
            paires += comparerPaliers("mutation", paliersDeRef(attendu.mutation.paliers), p.mutation.paliers)

            r.champs(suffixe == "P01" ? "P03" : "P04",
                     "Paramètres \(annee) : seuils, taux et paliers identiques à ceux de la PWA", paires)
        }

        // Les catégories : un taux faux ici déplace toute l'annexe de DPA.
        let attenduesCat = ref.categoriesDPA
        let obtenues = Fiscalite.categoriesDPA
        r.check("P05", "Les \(attenduesCat.count) catégories de DPA sont présentes, dans le même ordre",
                attendu: attenduesCat.map(\.code).joined(separator: " "),
                obtenu: obtenues.map(\.code).joined(separator: " "),
                attenduesCat.map(\.code) == obtenues.map(\.code))
        if attenduesCat.map(\.code) == obtenues.map(\.code) {
            r.champs("P06", "Chaque catégorie de DPA porte le taux de la PWA",
                     zip(attenduesCat, obtenues).map { ("cat. \($0.code) taux", $0.taux, $1.taux) })
            r.textes("P07", "Chaque catégorie de DPA est marquée « bâtiment » comme dans la PWA",
                     zip(attenduesCat, obtenues).map { ("cat. \($0.code) batiment", String($0.batiment), String($1.batiment)) })
        }

        // M19/M20 : les deux catégories que la suite JS nomme explicitement.
        r.eq("M19", "Catégorie 1 : taux de 4 %", 0.04, Fiscalite.categorieDPA("1")?.taux ?? -1, 0.0001)
        r.eq("M20", "Catégorie 8 : taux de 20 %", 0.20, Fiscalite.categorieDPA("8")?.taux ?? -1, 0.0001)
    }

    /// Un palier manquant ne doit pas passer pour un palier identique : la
    /// longueur est comparée avant les valeurs, et `.infinity` se compare bien.
    private static func comparerPaliers(_ nom: String, _ attendus: [Palier],
                                        _ obtenus: [Palier]) -> [(String, Double, Double)] {
        var paires: [(String, Double, Double)] = [
            ("\(nom).paliers.count", Double(attendus.count), Double(obtenus.count))
        ]
        for (i, a) in attendus.enumerated() where i < obtenus.count {
            // `.infinity - .infinity` est NaN : on compare les sentinelles à part.
            let plafondOk = a.plafond == obtenus[i].plafond
            paires.append(("\(nom).paliers[\(i)].plafond",
                           plafondOk ? 0 : a.plafond, plafondOk ? 0 : obtenus[i].plafond))
            paires.append(("\(nom).paliers[\(i)].taux", a.taux, obtenus[i].taux))
        }
        return paires
    }

    // ══ B. SOCLE (Socle.swift ↔ js/app-modules.js) ═══════════════════════════

    private static func socle(_ r: Rapport, _ ref: Reference) {
        // M01–M05 côté JS : les chaînes que l'utilisateur tape vraiment —
        // espaces insécables du clavier québécois, parenthèses comptables,
        // séparateurs des deux conventions.
        r.champs("P08", "num() rend les mêmes nombres que la PWA sur \(ref.num.count) chaînes",
                 ref.num.map { (($0.entree.isEmpty ? "«»" : "« \($0.entree) »"), $0.attendu,
                                Socle.num($0.entree)) }, 0.000001)

        // M07 côté JS : une cellule qui contient une virgule doit sortir citée,
        // sans quoi toute la ligne se décale dans le tableur.
        r.textes("P09", "csvLigne() produit les mêmes lignes que la PWA",
                 ref.csv.map { ("[\($0.cellules.joined(separator: " | "))]", $0.attendu,
                                Socle.csvLigne($0.cellules.map { Optional($0) })) })

        r.textes("P10", "shortLabel() retire la parenthèse finale comme la PWA",
                 ref.immeubles.sorted { $0.key < $1.key }.map { id, label in
                     // Le nom court de l'immeuble sert de libellé de catégorie :
                     // la référence le contient, via `nomProp` des pools.
                     (id, nomCourtAttendu(ref, propId: id) ?? Socle.shortLabel(label),
                      Socle.shortLabel(label))
                 })
    }

    /// `nomProp` tel que la PWA l'a écrit pour cet immeuble, s'il apparaît dans
    /// l'un des scénarios de DPA.
    private static func nomCourtAttendu(_ ref: Reference, propId: String) -> String? {
        for scenario in [ref.dpaCourant, ref.dpaHorsAII, ref.dpaReport] {
            for p in scenario.pools where p.cle.hasPrefix(propId + "|") { return p.nomProp }
        }
        return nil
    }

    // ══ C. FONCTIONS À BARÈME ════════════════════════════════════════════════

    private static func fonctionsABaremes(_ r: Rapport, _ ref: Reference, _ an: Int) {
        r.champs("P11", "kmIndemnite() : mêmes montants et mêmes taux moyens que la PWA",
                 ref.km.flatMap { cas -> [(String, Double, Double)] in
                     let i = Fiscalite.kmIndemnite(cas.km, an)
                     return [("\(Int(cas.km)) km → montant", cas.montant, i.montant),
                             ("\(Int(cas.km)) km → taux moyen", cas.tauxMoyen, i.tauxMoyen),
                             ("\(Int(cas.km)) km → tranches", Double(cas.tranches), Double(i.detail.count))]
                 })

        r.champs("P12", "impotParPaliers() : mêmes impôts et mêmes taux marginaux que la PWA",
                 ref.paliers.flatMap { cas -> [(String, Double, Double)] in
                     let f = Fiscalite.impotParPaliers(cas.revenu, Fiscalite.params(an).fed.paliers)
                     let q = Fiscalite.impotParPaliers(cas.revenu, Fiscalite.params(an).qc.paliers)
                     return [("\(Int(cas.revenu)) $ → fed", cas.fed.impot, f.impot),
                             ("\(Int(cas.revenu)) $ → fed marginal", cas.fed.marginal, f.marginal),
                             ("\(Int(cas.revenu)) $ → qc", cas.qc.impot, q.impot),
                             ("\(Int(cas.revenu)) $ → qc marginal", cas.qc.marginal, q.marginal)]
                 })

        r.champs("P13", "cotisationFSS() : mêmes montants que la PWA aux quatre paliers",
                 ref.fss.map { ("\(Int($0.revenu)) $", $0.montant, Fiscalite.cotisationFSS($0.revenu, an).montant) })
        // Le palier retenu s'affiche à l'écran : une divergence de libellé est
        // une divergence de calcul qui ne s'est pas encore vue sur le montant.
        r.textes("P14", "cotisationFSS() nomme le même palier que la PWA",
                 ref.fss.map { ("\(Int($0.revenu)) $", $0.palier, Fiscalite.cotisationFSS($0.revenu, an).palier) })

        r.champs("P15", "cotisationRRQ() : base, supplémentaire, déductible et crédit identiques",
                 ref.rrq.flatMap { cas -> [(String, Double, Double)] in
                     let c = Fiscalite.cotisationRRQ(cas.entreprise, cas.emploi, an)
                     let nom = "ent \(Int(cas.entreprise)) / emploi \(Int(cas.emploi))"
                     return [("\(nom) → base", cas.base, c.base),
                             ("\(nom) → supp", cas.supp, c.supp),
                             ("\(nom) → total", cas.total, c.total),
                             ("\(nom) → déductible", cas.deductible, c.deductible),
                             ("\(nom) → crédit", cas.credit, c.credit)]
                 })

        r.champs("P16", "cotisationRQAP() : même montant et même assiette plafonnée",
                 ref.rqap.flatMap { cas -> [(String, Double, Double)] in
                     let c = Fiscalite.cotisationRQAP(cas.revenu, an)
                     return [("\(Int(cas.revenu)) $ → montant", cas.montant, c.montant),
                             ("\(Int(cas.revenu)) $ → assiette", cas.assiette, c.assiette)]
                 })

        r.champs("P17", "bpaFederal() : même réduction linéaire entre les deux seuils",
                 ref.bpaFed.map { ("\(Int($0.revenuNet)) $", $0.bpa, Fiscalite.bpaFederal($0.revenuNet, an)) })
    }

    // ══ D. AMORTISSEMENT (CCAService.swift ↔ js/dpa.js) ══════════════════════

    private static func amortissement(_ r: Rapport, _ ref: Reference) {
        let horsAII = calculer(ref.dpaHorsAII, ref)
        let courant = calculer(ref.dpaCourant, ref)
        let report = calculer(ref.dpaReport, ref)

        comparerCalcul(r, "P18", "L'année courante (IIA en vigueur)", ref.dpaCourant, courant)
        comparerCalcul(r, "P19", "Une acquisition hors IIA : le demi-taux revient", ref.dpaHorsAII, horsAII)
        comparerCalcul(r, "P20", "La FNACC reportée de l'année précédente", ref.dpaReport, report)

        // ── Les invariants de la suite JS, redits en Swift ──
        let bat = courant.pools.first { $0.categorie == "1" }
        r.eq("M21", "Le terrain n'est pas amortissable : base = 400 000 − 100 000",
             300000, bat?.ajouts ?? -1)
        r.eq("M22", "IIA \(ref.annee) : la règle du demi-taux est suspendue (réduction = 0)",
             0, bat?.reduction ?? -1)
        r.eq("M23", "DPA maximale = 300 000 $ × 4 % (plein taux grâce à l'IIA)",
             12000, bat?.dpaMax ?? -1)
        r.check("M24", "Classe distincte pour un bâtiment locatif ≥ 50 000 $ (art. 1101(1ac))",
                attendu: "true", obtenu: String(bat?.distincte ?? false), bat?.distincte == true)
        r.eq("M25", "Plafond 1100(11) = revenu locatif net avant DPA, tous immeubles confondus",
             max(0, ref.impot.entrees.revenuLocatif - ref.impot.entrees.depensesLocatives),
             courant.plafondLocatif ?? -1)

        let bat2028 = horsAII.pools.first { $0.categorie == "1" }
        r.eq("M26", "Hors IIA (\(ref.dpaHorsAII.year)) : demi-taux rétabli → réduction = 50 % des ajouts",
             150000, bat2028?.reduction ?? -1)
        r.eq("M27", "Hors IIA (\(ref.dpaHorsAII.year)) : DPA max = (300 000 − 150 000) × 4 %",
             6000, bat2028?.dpaMax ?? -1)

        let f = Fiscalite.params(ref.annee)
        let plafond101 = f.auto.plafondCat101 * (1 + f.taxes.tps + f.taxes.tvq)
        let pool101 = courant.pools.first { $0.categorie == "10.1" }
        r.eq("M28", "Catégorie 10.1 : le coût est plafonné par la limite de l'année (taxes incluses)",
             plafond101, pool101?.ajouts ?? -1, 0.5)
        r.eq("M29", "Catégorie 10.1 : le demi-taux demeure (exclue de l'IIA)",
             plafond101 * 0.5, pool101?.reduction ?? -1, 0.5)

        r.eq("M30", "FNACC de clôture = ouverture + ajouts − dispositions − DPA réclamée",
             0 + 300000 - 0 - 5000, bat?.fermeture ?? -1)
        r.eq("M31", "La DPA réclamée est reprise dans le total locatif", 5000, courant.totalLocatif)

        // L'invariant du report se vérifie sans la référence : on calcule
        // l'année précédente pour de vrai, et sa FNACC de clôture doit être
        // l'ouverture de l'année suivante.
        let suiv = report.pools.first { $0.categorie == "1" }
        let precedente = CCAService.calculer(
            year: ref.dpaReport.year - 1,
            biens: (ref.dpaReport.biensAnneePrecedente ?? []).map(\.bien),
            nomImmeuble: { ref.immeubles[$0] ?? $0 })
        r.eq("M32", "FNACC d'ouverture reportée automatiquement de l'année précédente",
             precedente.pools.first { $0.categorie == "1" }?.fermeture ?? -1,
             suiv?.ouverture ?? -2)
        r.check("M33", "Le report de FNACC est signalé comme tel (et non saisi à la main)",
                attendu: "true", obtenu: String(suiv?.reportee ?? false), suiv?.reportee == true)

        // Ce que la suite JS ne peut pas vérifier et que le portage doit garantir :
        // le report passe par un FOURNISSEUR injecté, là où dpa.js lit
        // localStorage. Sans fournisseur, aucune ouverture ne doit apparaître.
        let sansFournisseur = CCAService.calculer(year: ref.dpaReport.year,
                                                 biens: ref.dpaReport.biens.map(\.bien))
        r.check("P21", "Sans fournisseur d'années antérieures, aucune FNACC n'est reportée",
                attendu: "ouvertures nulles",
                obtenu: sansFournisseur.pools.map { Socle.fmt($0.ouverture, 0) }.joined(separator: "/"),
                sansFournisseur.pools.allSatisfy { $0.ouverture == 0 && !$0.reportee })
    }

    /// Rejoue un scénario de DPA avec les mêmes entrées que la PWA. Le
    /// fournisseur ne répond que pour l'année précédente décrite par la
    /// référence : toute autre année est inconnue, comme un `localStorage` vide.
    private static func calculer(_ s: RefDpa, _ ref: Reference) -> CalculDPA {
        let precedente = s.biensAnneePrecedente?.map(\.bien)
        let anneePrecedente = s.year - 1
        return CCAService.calculer(
            year: s.year,
            biens: s.biens.map(\.bien),
            plafondLocatif: s.plafondLocatif,
            nomImmeuble: { ref.immeubles[$0] ?? $0 },
            fournisseur: { $0 == anneePrecedente ? precedente : nil })
    }

    private static func comparerCalcul(_ r: Rapport, _ id: String, _ titre: String,
                                       _ attendu: RefDpa, _ obtenu: CalculDPA) {
        let clesA = attendu.pools.map(\.cle), clesO = obtenu.pools.map(\.cle)
        guard clesA == clesO else {
            r.check(id, "\(titre) : mêmes catégories mises en commun, dans le même ordre",
                    attendu: clesA.joined(separator: " "), obtenu: clesO.joined(separator: " "), false)
            return
        }
        var paires: [(String, Double, Double)] = [
            ("total", attendu.total, obtenu.total),
            ("totalLocatif", attendu.totalLocatif, obtenu.totalLocatif),
            ("maxLocatif", attendu.maxLocatif, obtenu.maxLocatif),
            // `nil` des deux côtés = plafond inconnu pour cette année.
            ("plafondLocatif", attendu.plafondLocatif ?? -1, obtenu.plafondLocatif ?? -1)
        ]
        var textes: [(String, String, String)] = []
        for (a, o) in zip(attendu.pools, obtenu.pools) {
            let n = a.cle
            paires += [
                ("\(n).ouverture", a.ouverture, o.ouverture),
                ("\(n).ajouts", a.ajouts, o.ajouts),
                ("\(n).ajoutsAII", a.ajoutsAII, o.ajoutsAII),
                ("\(n).ajoutsDemi", a.ajoutsDemi, o.ajoutsDemi),
                ("\(n).dispositions", a.dispositions, o.dispositions),
                ("\(n).reduction", a.reduction, o.reduction),
                ("\(n).base", a.base, o.base),
                ("\(n).taux", a.taux, o.taux),
                ("\(n).dpaMax", a.dpaMax, o.dpaMax),
                ("\(n).reclamee", a.reclamee, o.reclamee),
                ("\(n).fermeture", a.fermeture, o.fermeture)
            ]
            textes += [
                ("\(n).categorie", a.categorie, o.categorie),
                ("\(n).libelle", a.libelle, o.libelle),
                ("\(n).nomProp", a.nomProp, o.nomProp),
                ("\(n).locatif", String(a.locatif), String(o.locatif)),
                ("\(n).reportee", String(a.reportee), String(o.reportee)),
                ("\(n).distincte", String(a.distincte), String(o.distincte))
            ]
        }
        r.champs(id, "\(titre) : mêmes montants que la PWA", paires)
        r.textes(id + "b", "\(titre) : mêmes libellés et mêmes drapeaux que la PWA", textes)
    }

    // ══ E. IMPÔT ET ACOMPTES (TaxService.swift ↔ js/impot.js) ════════════════

    private static func impot(_ r: Rapport, _ ref: Reference, _ an: Int) {
        let e = ref.impot.entrees.entrees
        let a = TaxService.assiettes(e, year: an)
        let ci = TaxService.calculImpot(e, year: an)
        // La date du relevé, et non celle du jour : sinon la référence cesserait
        // d'avoir un sens dès le lendemain d'une échéance.
        let ac = TaxService.calculAcomptes(e, year: an, aujourdhui: ref.aujourdhui)

        let obtenuesAssiettes: [String: Double] = [
            "revLoc": a.revLoc, "depLoc": a.depLoc, "netLocAvantDPA": a.netLocAvantDPA,
            "netLoc": a.netLoc, "dpaLoc": a.dpaLoc, "revEnt": a.revEnt, "depEnt": a.depEnt,
            "netEnt": a.netEnt, "dpaEnt": a.dpaEnt, "vehUber": a.veh.uber, "vehLyft": a.veh.lyft,
            "vehTotal": a.veh.total, "t4": a.t4, "autres": a.autres, "rrqTotal": a.rrq.total,
            "rrqDeductible": a.rrq.deductible, "rrqCredit": a.rrq.credit, "rqap": a.rqap.montant,
            "fss": a.fss.montant, "deductionsCotisations": a.deductionsCotisations,
            "revenuTotal": a.revenuTotal, "revenuNet": a.revenuNet
        ]
        comparerDictionnaire(r, "P22", "assiettes() : mêmes assiettes que la PWA",
                             ref.impot.assiettes, obtenuesAssiettes)

        let obtenuCalcul: [String: Double] = [
            "fedBrut": ci.fedBrut.impot, "fedMarginal": ci.fedBrut.marginal, "bpaFed": ci.bpaFed,
            "creditsFed": ci.creditsFed, "fedApresCredits": ci.fedApresCredits,
            "abattement": ci.abattement, "fedNet": ci.fedNet,
            "qcBrut": ci.qcBrut.impot, "qcMarginal": ci.qcBrut.marginal, "creditsQc": ci.creditsQc,
            "qcNet": ci.qcNet, "cotisations": ci.cotisations, "retenues": ci.retenues,
            "acomptesVerses": ci.acomptesVerses, "totalAvantRetenues": ci.totalAvantRetenues,
            "solde": ci.solde, "marginal": ci.marginal, "provision": ci.provision,
            "tauxEffectif": ci.tauxEffectif
        ]
        comparerDictionnaire(r, "P23", "calculImpot() : mêmes montants que la PWA",
                             ref.impot.calcul, obtenuCalcul)

        let refAc = ref.impot.acomptes
        r.champs("P24", "calculAcomptes() : mêmes montants nets, même seuil, même manque",
                 [("netFed", refAc.netFed, ac.netFed),
                  ("netQc", refAc.netQc, ac.netQc),
                  ("seuil", refAc.seuil, ac.seuil),
                  ("manqueTotal", refAc.manqueTotal, ac.manqueTotal),
                  ("joursAvantProchain", Double(refAc.joursAvantProchain ?? -9999),
                   Double(ac.joursAvantProchain ?? -9999)),
                  ("versements.count", Double(refAc.versements.count), Double(ac.versements.count))])
        r.textes("P25", "calculAcomptes() : mêmes obligations qu'au Québec et au fédéral",
                 [("requisFed", String(refAc.requisFed), String(ac.requisFed)),
                  ("requisQc", String(refAc.requisQc), String(ac.requisQc))])

        if refAc.versements.count == ac.versements.count {
            var paires: [(String, Double, Double)] = []
            var textes: [(String, String, String)] = []
            for (av, ov) in zip(refAc.versements, ac.versements) {
                paires += [("\(av.date).fed", av.fed, ov.fed),
                           ("\(av.date).qc", av.qc, ov.qc),
                           ("\(av.date).manqueFed", av.manqueFed, ov.manqueFed),
                           ("\(av.date).manqueQc", av.manqueQc, ov.manqueQc),
                           ("\(av.date).jours", Double(av.jours), Double(ov.jours))]
                textes += [("\(av.date).date", av.date, ov.date),
                           ("\(av.date).echue", String(av.echue), String(ov.echue)),
                           ("\(av.date).enRetard", String(av.enRetard), String(ov.enRetard))]
            }
            r.champs("P26", "Les quatre versements portent les mêmes montants et les mêmes délais", paires)
            r.textes("P27", "Les quatre versements portent les mêmes dates et les mêmes états", textes)
        }

        r.eq("P28", "tauxMarginalEstime() rend le taux marginal de la PWA",
             ref.impot.tauxMarginalEstime, TaxService.tauxMarginalEstime(e, year: an))

        // ── Les invariants de la suite JS, redits en Swift ──
        r.eq("M53", "Net locatif = revenus − dépenses − DPA locative réclamée",
             a.revLoc - a.depLoc - a.dpaLoc, a.netLoc)
        r.eq("M54", "Net d'entreprise = net Uber + net Lyft − part véhicule − DPA entreprise",
             a.revEnt - a.depEnt, a.netEnt)
        r.eq("M55", "Revenu total = T4 + net locatif + net d'entreprise + autres",
             a.t4 + a.netLoc + a.netEnt + a.autres, a.revenuTotal)
        r.check("M56", "Les cotisations RRQ/RQAP/FSS sont calculées sans NaN",
                attendu: "nombres finis",
                obtenu: [a.rrq.total, a.rqap.montant, a.fss.montant].map { Socle.fmt($0) }.joined(separator: "/"),
                [a.rrq.total, a.rqap.montant, a.fss.montant].allSatisfy { $0.isFinite })

        let champsImpot: [(String, Double)] = [
            ("fedNet", ci.fedNet), ("qcNet", ci.qcNet), ("cotisations", ci.cotisations),
            ("totalAvantRetenues", ci.totalAvantRetenues), ("solde", ci.solde),
            ("marginal", ci.marginal), ("provision", ci.provision)
        ]
        let infinis = champsImpot.filter { !$0.1.isFinite }.map(\.0)
        r.check("M57", "calculImpot() ne produit aucun NaN",
                attendu: "tous finis",
                obtenu: infinis.isEmpty ? "tous finis" : infinis.joined(separator: ","),
                infinis.isEmpty)
        r.check("M58", "Le taux marginal combiné est plausible (entre 10 % et 55 %)",
                attendu: "0,10 — 0,55", obtenu: Socle.fmt(ci.marginal, 4),
                ci.marginal > 0.10 && ci.marginal < 0.55)
        r.eq("M59", "L'abattement du Québec s'applique à l'impôt fédéral après crédits",
             ci.fedApresCredits * Fiscalite.params(an).fed.abattementQc, ci.abattement, 0.5)
        r.eq("M60", "Total avant retenues = fédéral + Québec + cotisations",
             ci.fedNet + ci.qcNet + ci.cotisations, ci.totalAvantRetenues, 0.5)
        r.eq("M61", "Quatre versements d'acomptes sont proposés", 4, Double(ac.versements.count))
        r.eq("M62", "Chaque versement fédéral vaut le quart de l'impôt net fédéral",
             ac.requisFed ? ac.netFed / 4 : 0, ac.versements.first?.fed ?? -1, 0.5)
        r.check("M63", "L'obligation d'acomptes suit le seuil de l'année (et non un seuil codé en dur)",
                attendu: "requis ssi net > seuil",
                obtenu: "\(ac.requisFed)/\(ac.netFed > Fiscalite.params(an).acomptes.seuilFed)",
                ac.requisFed == (ac.netFed > Fiscalite.params(an).acomptes.seuilFed))
    }

    /// Compare deux dictionnaires nommés. Une clé présente d'un seul côté est un
    /// échec à part entière : c'est ainsi qu'un champ oublié dans le portage se
    /// signale, au lieu de passer pour « rien à comparer ».
    private static func comparerDictionnaire(_ r: Rapport, _ id: String, _ titre: String,
                                             _ attendu: [String: Double],
                                             _ obtenu: [String: Double]) {
        let manquantes = attendu.keys.filter { obtenu[$0] == nil }.sorted()
        let enTrop = obtenu.keys.filter { attendu[$0] == nil }.sorted()
        guard manquantes.isEmpty && enTrop.isEmpty else {
            r.check(id, "\(titre) — les mêmes champs de part et d'autre",
                    attendu: "\(attendu.count) champs",
                    obtenu: "manquants : \(manquantes.joined(separator: ",")) · en trop : \(enTrop.joined(separator: ","))",
                    false)
            return
        }
        r.champs(id, titre, attendu.keys.sorted().map { ($0, attendu[$0]!, obtenu[$0]!) })
    }
}
