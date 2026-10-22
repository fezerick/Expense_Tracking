//  ════════════════════════════════════════════════════════════════════════════
//  ParityCodec.swift — TRADUIRE LA RÉFÉRENCE DE LA VAGUE 1 BIS
//
//  Les sections `sync` et `journal` de parite-vague1.json ne se décodent pas
//  comme le reste : ce ne sont pas des nombres nommés, ce sont des ÉTATS —
//  arbitraires, imbriqués, avec des clés absentes qui veulent dire quelque
//  chose. Un jeu de `Decodable` les aurait aplatis en types fixes, et aurait
//  perdu les deux propriétés dont dépend toute la fusion :
//
//  • l'ORDRE des clés, parce que la PWA compare des écritures (`JSON.stringify`)
//    et non des valeurs, et que `{a:1,b:2}` et `{b:2,a:1}` ne s'écrivent pas
//    pareil ;
//  • la différence entre une clé ABSENTE (`undefined`) et une clé à `null`, qui
//    est exactement la différence entre « je ne sais pas » et « c'est vide ».
//
//  Alors la référence est relue avec le lecteur JSON du noyau (`Valeur`), qui
//  préserve les deux, et la comparaison se fait sur l'écriture canonique des
//  deux côtés. Ce fichier ne contient donc que des traductions : Valeur → types
//  du noyau pour les entrées, types du noyau → Valeur pour les sorties, dans
//  l'ordre de clés où JavaScript les a créées.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

// MARK: - Lecture confortable d'un arbre Valeur

extension Valeur {
    /// Un champ d'objet. Rend `nil` pour une clé absente comme pour un non-objet
    /// — un accès sur une forme inattendue fait échouer l'assertion, pas le
    /// programme.
    subscript(cle: String) -> Valeur? { commeObjet?[cle] }

    subscript(indice: Int) -> Valeur? {
        guard let a = commeListe, indice >= 0, indice < a.count else { return nil }
        return a[indice]
    }

    var tableau: [Valeur] { commeListe ?? [] }
    var chaine: String { commeTexte ?? "" }
    var reel: Double { commeNombre ?? 0 }
    var entier: Int? { commeNombre.map { Int($0) } }
    var vrai: Bool { if case .booleen(let b) = self { return b }; return false }
}

/// Écriture canonique d'une valeur, ou `"∅"` pour une clé absente : c'est ce que
/// les assertions comparent, des deux côtés.
func canon(_ v: Valeur?) -> String { v?.jsonCanonique ?? "∅" }

// MARK: - Méta de synchronisation

extension MetaSync {
    static func depuis(_ source: Valeur?) -> MetaSync? {
        guard let o = source?.commeObjet else { return nil }
        var m = MetaSync()
        m.v = o["v"]?.entier ?? 1
        if let f = o["feuilles"]?.commeObjet { for k in f.cles { m.feuilles[k] = f[k]?.reel ?? 0 } }
        if let s = o["sup"]?.commeObjet { for k in s.cles { m.sup[k] = s[k]?.reel ?? 0 } }
        return m
    }

    /// `{ v, feuilles, sup }` — l'ordre de `syncMetaVide()`.
    var versValeur: Valeur {
        var f = Objet(); for k in feuilles.cles { f[k] = .nombre(feuilles[k]!) }
        var s = Objet(); for k in sup.cles { s[k] = .nombre(sup[k]!) }
        return .objet(Objet([("v", .nombre(Double(v))), ("feuilles", .objet(f)), ("sup", .objet(s))]))
    }
}

// MARK: - Ce que la fusion raconte

extension Changement {
    static func depuis(_ source: Valeur) -> Changement {
        Changement(chemin: source["chemin"]?.chaine ?? "",
                   genre: GenreChangement(rawValue: source["genre"]?.chaine ?? "") ?? .maj,
                   avant: source["avant"],
                   apres: source["apres"],
                   apercu: source["apercu"]?.commeListe,
                   feuilles: source["feuilles"]?.entier)
    }

    /// L'ordre de création des clés côté JavaScript, qui n'est pas le même selon
    /// le genre : une suppression décrit ce qu'elle emporte, une modification
    /// décrit un avant et un après.
    var versValeur: Valeur {
        var o = Objet()
        o["chemin"] = .texte(chemin)
        if genre == .suppression {
            o["genre"] = .texte(genre.rawValue)
            if let avant { o["avant"] = avant }
            if let apercu { o["apercu"] = .liste(apercu) }
            if let feuilles { o["feuilles"] = .nombre(Double(feuilles)) }
        } else {
            if let avant { o["avant"] = avant }
            if let apres { o["apres"] = apres }
            o["genre"] = .texte(genre.rawValue)
        }
        return .objet(o)
    }
}

extension Conflit {
    var versValeur: Valeur {
        var o = Objet()
        o["chemin"] = .texte(chemin)
        if let garde { o["garde"] = garde }
        if let ecarte { o["ecarte"] = ecarte }
        o["origine"] = .texte(origine)
        return .objet(o)
    }
}

extension StatsFusion {
    var versValeur: Valeur {
        .objet(Objet([("prisDistant", .nombre(Double(prisDistant))),
                      ("gardesLocal", .nombre(Double(gardesLocal))),
                      ("ajoutesDistant", .nombre(Double(ajoutesDistant))),
                      ("supprimes", .nombre(Double(supprimes))),
                      ("conflits", .nombre(Double(conflits)))]))
    }
}

// MARK: - Journal

extension EntreeJournal {
    static func depuis(_ source: Valeur) -> EntreeJournal {
        EntreeJournal(ts: source["ts"]?.reel ?? 0,
                      chemin: source["chemin"]?.chaine ?? "",
                      genre: GenreEntree(rawValue: source["genre"]?.chaine ?? "") ?? .maj,
                      origine: source["origine"]?.chaine ?? "",
                      appareil: source["appareil"]?.chaine ?? "",
                      avant: source["avant"]?.chaine ?? "",
                      apres: source["apres"]?.chaine ?? "",
                      feuilles: source["feuilles"]?.entier,
                      nb: source["nb"]?.entier,
                      supprimes: source["supprimes"]?.entier)
    }

    var versValeur: Valeur {
        var o = Objet()
        o["ts"] = .nombre(ts)
        o["chemin"] = .texte(chemin)
        o["genre"] = .texte(genre.rawValue)
        o["origine"] = .texte(origine)
        o["appareil"] = .texte(appareil)
        o["avant"] = .texte(avant)
        o["apres"] = .texte(apres)
        if let feuilles { o["feuilles"] = .nombre(Double(feuilles)) }
        if let nb { o["nb"] = .nombre(Double(nb)) }
        if let supprimes { o["supprimes"] = .nombre(Double(supprimes)) }
        return .objet(o)
    }
}

extension LexiqueJournal {
    static func depuis(_ source: Valeur?) -> LexiqueJournal {
        func table(_ cle: String) -> [String: String] {
            guard let o = source?[cle]?.commeObjet else { return [:] }
            return o.cles.reduce(into: [String: String]()) { acc, k in acc[k] = o[k]?.chaine ?? "" }
        }
        return LexiqueJournal(props: table("props"), champs: table("champs"), trajets: table("trajets"))
    }
}

/// Une liste d'éléments traduits, puis réécrite : `[Changement]`, `[Conflit]`,
/// `[EntreeJournal]` passent toutes par là.
func listeValeur<T>(_ items: [T], _ vers: (T) -> Valeur) -> Valeur { .liste(items.map(vers)) }
