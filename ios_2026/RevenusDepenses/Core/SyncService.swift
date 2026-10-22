//  ════════════════════════════════════════════════════════════════════════════
//  SyncService.swift — FUSION CHAMP PAR CHAMP ENTRE APPAREILS
//
//  Portage de pwa_2026/js/sync.js (vague 1 bis, docs/PORTAGE_IOS.md § 5). Les
//  commentaires du fichier JavaScript expliquent POURQUOI chaque règle existe —
//  ce fichier-ci ne répète que ce qui change en Swift.
//
//  Pourquoi ce fichier doit exister AVANT la moindre écriture iOS dans
//  Firestore : la PWA et l'application iOS écrivent dans le même document,
//  `users/<uid>/years/<année>`. Un iPhone qui y écrirait son état entier
//  effacerait le travail fait dans la PWA — c'est le défaut que la 2.5.0 a
//  corrigé, et le porter à moitié le ferait réapparaître par l'autre bout.
//
//  Les trois pièges de traduction, tous liés au fait que la fusion compare des
//  ÉCRITURES de valeurs et pas des valeurs :
//
//  1. L'ordre des clés d'un objet entre dans ces écritures → `Objet` le garde
//     (voir Valeur.swift).
//  2. `Array.prototype.sort()` de JavaScript trie par unités de code UTF-16,
//     pas selon l'ordre d'Unicode que Swift applique. L'empreinte d'état trie
//     des chemins qui contiennent « Électricité » : deux appareils qui trient
//     différemment ne reconnaissent pas le même état et se renvoient leurs
//     documents sans fin. D'où `triJS`.
//  3. `undefined` n'est pas `null` : « absent ici » n'est pas « vidé ici ».
//     `Valeur?` porte la distinction.
//
//  Divergence connue et assumée : écrire au-delà de la fin d'un tableau crée en
//  JavaScript des TROUS, que `forEach` saute ; ici, le tableau est comblé par
//  des `null`, qui sont des feuilles. Les douze cases d'une catégorie existent
//  toujours dans l'application, donc le cas ne se présente pas — mais s'il se
//  présentait, la suite de parité le dirait.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

// MARK: - Carte ordonnée

/// Un dictionnaire qui garde l'ordre d'insertion. Nécessaire parce que la
/// fusion parcourt ses feuilles et ses dates dans l'ordre où JavaScript les
/// parcourt, et que cet ordre se retrouve dans la liste des changements que lit
/// l'historique des modifications.
struct MapOrdonnee<V> {
    private(set) var cles: [String] = []
    private var table: [String: V] = [:]

    init() {}

    subscript(cle: String) -> V? {
        get { table[cle] }
        set {
            if let nouvelle = newValue {
                if table[cle] == nil { cles.append(cle) }
                table[cle] = nouvelle
            } else {
                retirer(cle)
            }
        }
    }

    mutating func retirer(_ cle: String) {
        guard table[cle] != nil else { return }
        table[cle] = nil
        cles.removeAll { $0 == cle }
    }

    func contient(_ cle: String) -> Bool { table[cle] != nil }
    var count: Int { cles.count }
}

typealias Feuilles = MapOrdonnee<Valeur>
typealias Dates = MapOrdonnee<Double>

// MARK: - Méta : dates d'écriture et pierres tombales

struct MetaSync {
    /// Le numéro de schéma écrit par `syncMetaVide()` : il voyage jusqu'à
    /// Firestore, où un appareil resté sur une version antérieure le lit. Le
    /// porter ici n'est pas décoratif — un iPhone qui écrirait une méta sans
    /// `v` ferait croire à la PWA qu'elle lit des données d'avant la 2.5.0.
    var v = 1
    var feuilles = Dates()
    var sup = Dates()

    static let vide = MetaSync()

    /// `syncMetaNormalisee` : une date à 0 n'est pas une date, c'est « aucune
    /// information » — ce que portent les données écrites avant la 2.5.0.
    var normalisee: MetaSync {
        var m = MetaSync()
        for k in feuilles.cles { if let t = feuilles[k], t > 0 { m.feuilles[k] = t } }
        for k in sup.cles { if let t = sup[k], t > 0 { m.sup[k] = t } }
        return m
    }
}

// MARK: - Ce que la fusion raconte

enum GenreChangement: String {
    case ajout, maj, suppression
}

struct Changement {
    var chemin: String
    var genre: GenreChangement
    var avant: Valeur?
    var apres: Valeur?
    /// Suppression seulement : les trois premières valeurs emportées.
    var apercu: [Valeur]?
    /// Suppression seulement : combien de cases ont disparu.
    var feuilles: Int?
}

struct Conflit {
    var chemin: String
    var garde: Valeur?
    var ecarte: Valeur?
    var origine: String        // "local" ou "distant"
}

struct StatsFusion {
    var prisDistant = 0
    var gardesLocal = 0
    var ajoutesDistant = 0
    var supprimes = 0
    var conflits = 0
}

struct ResultatDatage {
    var meta: MetaSync
    var modifiees: Int
    var supprimees: Int
    var changements: [Changement]
}

struct ResultatFusion {
    var state: Valeur
    var meta: MetaSync
    var conflits: [Conflit]
    var stats: StatsFusion
    var changements: [Changement]
}

// MARK: - Le service

enum SyncService {

    /// Séparateur de segments : U+001F, que l'utilisateur ne peut pas taper. Un
    /// nom de catégorie contient n'importe quoi, « Eau / Égouts » inclus.
    static let sep = "\u{1F}"

    /// Tableaux traités comme des ensembles : union, la position ne dit rien.
    static let ensembles = ["importHashes"]

    /// Hors fusion : les photos de reçus sont des `data:` de centaines de
    /// kilo-octets, et un document Firestore est limité à un mégaoctet.
    static let ignores = ["receipts"]

    // MARK: Chemins

    static func chemin(_ segments: [String]) -> String { segments.joined(separator: sep) }
    static func segments(_ chemin: String) -> [String] { chemin.components(separatedBy: sep) }
    /// Pour l'affichage d'un conflit : « p1090 › revenus › Coloc 1 › 3 ».
    static func cheminTexte(_ chemin: String) -> String { segments(chemin).joined(separator: " › ") }

    /// `Array.prototype.sort()` de JavaScript : unités de code UTF-16.
    static func triJS(_ cles: [String]) -> [String] {
        cles.sorted { Valeur.texteEstPlusGrandJS($1, $0) }
    }

    private static func estIndexNumerique(_ seg: String) -> Bool {
        !seg.isEmpty && seg.allSatisfy { $0.isASCII && $0.isNumber }
    }

    /// L'`id` d'un élément de tableau, tel que JavaScript l'écrirait en segment.
    /// `nil` quand l'élément n'en porte pas — le tableau n'est alors pas indexé.
    private static func idDe(_ v: Valeur) -> String? {
        guard let o = v.commeObjet, let id = o["id"] else { return nil }
        if case .nul = id { return nil }
        let s = id.texteJS
        return s.isEmpty ? nil : s
    }

    private static func tableauIndexe(_ a: [Valeur]) -> Bool {
        !a.isEmpty && a.allSatisfy { $0.estObjet && idDe($0) != nil }
    }

    private static func tableauScalaire(_ a: [Valeur]) -> Bool {
        a.allSatisfy { $0.estScalaire }
    }

    // MARK: Aplatissement

    /// `{ chemin → valeur }` pour les feuilles de l'arbre. La forme des tableaux
    /// décide de tout le reste de la fusion : voir l'en-tête de sync.js.
    static func aplatir(_ valeur: Valeur) -> Feuilles {
        var sortie = Feuilles()
        aplatir(valeur, [], &sortie)
        return sortie
    }

    private static func aplatir(_ valeur: Valeur, _ ch: [String], _ sortie: inout Feuilles) {
        if let premier = ch.first, ignores.contains(premier) { return }
        let nom = ch.last

        switch valeur {
        case .liste(let a):
            if let nom, ensembles.contains(nom) {
                // Un membre = une feuille, la valeur étant portée par le chemin.
                for v in a where v.estScalaire { sortie[chemin(ch + [v.texteJS])] = .booleen(true) }
                return
            }
            if tableauIndexe(a) {
                for item in a { aplatir(item, ch + [idDe(item)!], &sortie) }
                return
            }
            if tableauScalaire(a) {
                for (i, v) in a.enumerated() { sortie[chemin(ch + [String(i)])] = v }
                return
            }
            sortie[chemin(ch)] = valeur          // tableau opaque : une seule feuille

        case .objet(let o):
            if o.cles.isEmpty {
                if !ch.isEmpty { sortie[chemin(ch)] = .objet(Objet()) }   // objet vide : une feuille
                return
            }
            for k in o.cles { aplatir(o[k]!, ch + [k], &sortie) }

        default:
            if !ch.isEmpty { sortie[chemin(ch)] = valeur }
        }
    }

    /// Tous les chemins et sous-chemins présents dans un ensemble de feuilles.
    static func prefixes(_ feuilles: Feuilles) -> Set<String> {
        var out = Set<String>()
        for ch in feuilles.cles {
            let segs = segments(ch)
            for i in 1...segs.count { out.insert(chemin(Array(segs[0..<i]))) }
        }
        return out
    }

    // MARK: Lecture, écriture et suppression par chemin

    /// `syncValeurA` : la valeur à ce chemin, ou `nil`.
    static func valeurA(_ racine: Valeur, _ segs: [String]) -> Valeur? {
        var cur: Valeur? = racine
        for seg in segs {
            guard let courante = cur else { return nil }
            if let a = courante.commeListe {
                if estIndexNumerique(seg), tableauScalaire(a) {
                    let i = Int(seg)!
                    cur = i < a.count ? a[i] : nil
                } else {
                    cur = a.first { $0.estObjet && idDe($0) == seg }
                }
            } else if let o = courante.commeObjet {
                cur = o[seg]
            } else {
                return nil
            }
        }
        return cur
    }

    /// `syncEcrireA`. `modele` ne sert qu'à choisir la FORME d'un conteneur à
    /// créer : sans lui, un segment numérique serait ambigu — index de tableau
    /// ou clé d'objet ?
    static func ecrireA(_ cible: inout Valeur, _ ch: String, _ valeur: Valeur, _ modele: Valeur?) {
        let segs = segments(ch)
        ecrire(&cible, segs, 0, valeur, modele)
    }

    private static func ecrire(_ cur: inout Valeur, _ segs: [String], _ i: Int,
                               _ valeur: Valeur, _ modele: Valeur?) {
        let dernierNiveau = i == segs.count - 1
        let seg = segs[i]

        if dernierNiveau {
            ecrireFeuille(&cur, segs, valeur)
            return
        }

        switch cur {
        case .liste(var a):
            if i > 0, ensembles.contains(segs[i - 1]) { return }  // un membre d'ensemble n'a pas d'enfant
            if estIndexNumerique(seg), tableauScalaire(a) {
                // JavaScript s'assure que la case existe — `cur[+seg] = null` —
                // puis descend dedans, tombe sur un scalaire et abandonne,
                // faute de conteneur où écrire la suite du chemin. On reproduit
                // les deux : la trace laissée dans le tableau, et l'abandon.
                let i = Int(seg)!
                while a.count <= i { a.append(.nul) }
                cur = .liste(a)
                return
            }
            if let idx = a.firstIndex(where: { $0.estObjet && idDe($0) == seg }) {
                ecrire(&a[idx], segs, i + 1, valeur, modele)
            } else {
                var item = Valeur.objet(Objet([("id", .texte(seg))]))
                ecrire(&item, segs, i + 1, valeur, modele)
                a.append(item)
            }
            cur = .liste(a)

        case .objet(var o):
            let existante = o[seg]
            if existante == nil || existante!.estScalaire {
                // La forme vient du modèle : si le chemin existe chez celui qui
                // gagne, c'est sa forme qui fait foi.
                let ref = modele.flatMap { valeurA($0, Array(segs[0...i])) }
                o[seg] = ref?.commeListe != nil ? .liste([]) : .objet(Objet())
            }
            var enfant = o[seg]!
            ecrire(&enfant, segs, i + 1, valeur, modele)
            o[seg] = enfant
            cur = .objet(o)

        default:
            return
        }
    }

    private static func ecrireFeuille(_ cur: inout Valeur, _ segs: [String], _ valeur: Valeur) {
        let dernier = segs[segs.count - 1]
        let avantDernier = segs.count >= 2 ? segs[segs.count - 2] : nil

        switch cur {
        case .liste(var a):
            if let avantDernier, ensembles.contains(avantDernier) {
                if !a.contains(where: { $0.texteJS == dernier }) { a.append(.texte(dernier)) }
                cur = .liste(a)
                return
            }
            if estIndexNumerique(dernier), tableauScalaire(a) || a.isEmpty {
                let i = Int(dernier)!
                while a.count <= i { a.append(.nul) }     // JavaScript laisserait des trous
                a[i] = valeur
                cur = .liste(a)
                return
            }
            if let idx = a.firstIndex(where: { $0.estObjet && idDe($0) == dernier }) {
                if let apports = valeur.commeObjet, var o = a[idx].commeObjet {
                    for k in apports.cles { o[k] = apports[k] }   // Object.assign
                    a[idx] = .objet(o)
                }
            } else {
                var o = Objet([("id", .texte(dernier))])
                if let apports = valeur.commeObjet {
                    for k in apports.cles { o[k] = apports[k] }
                }
                a.append(.objet(o))
            }
            cur = .liste(a)

        case .objet(var o):
            o[dernier] = valeur
            cur = .objet(o)

        default:
            return
        }
    }

    /// `syncSupprimerA` : retire ce que le chemin désigne, sans laisser de
    /// coquille `{ id }` dans un tableau.
    static func supprimerA(_ cible: inout Valeur, _ ch: String) {
        let segs = segments(ch)
        supprimer(&cible, segs, 0)
    }

    private static func supprimer(_ cur: inout Valeur, _ segs: [String], _ i: Int) {
        let seg = segs[i]
        if i == segs.count - 1 {
            switch cur {
            case .liste(var a):
                if segs.count >= 2, ensembles.contains(segs[segs.count - 2]) {
                    if let idx = a.firstIndex(where: { $0.texteJS == seg }) { a.remove(at: idx) }
                    cur = .liste(a)
                    return
                }
                if let idx = a.firstIndex(where: { $0.estObjet && idDe($0) == seg }) { a.remove(at: idx) }
                cur = .liste(a)
            case .objet(var o):
                o.retirer(seg)
                cur = .objet(o)
            default:
                return
            }
            return
        }

        switch cur {
        case .liste(var a):
            if estIndexNumerique(seg), tableauScalaire(a) { return }
            guard let idx = a.firstIndex(where: { $0.estObjet && idDe($0) == seg }) else { return }
            supprimer(&a[idx], segs, i + 1)
            cur = .liste(a)
        case .objet(var o):
            guard var enfant = o[seg] else { return }
            supprimer(&enfant, segs, i + 1)
            o[seg] = enfant
            cur = .objet(o)
        default:
            return
        }
    }

    // MARK: Dates

    static func dateDe(_ meta: MetaSync, _ ch: String) -> Double {
        meta.normalisee.feuilles[ch] ?? 0
    }

    /// La date de suppression qui COUVRE ce chemin : supprimer un trajet laisse
    /// une tombale sur son préfixe, pas sur chacun de ses champs.
    static func dateSuppression(_ meta: MetaSync, _ ch: String) -> Double {
        let m = meta.normalisee
        var max = m.sup[ch] ?? 0
        let segs = segments(ch)
        if segs.count >= 2 {
            for i in 1..<segs.count {
                let prefixe = chemin(Array(segs[0..<i]))
                if let t = m.sup[prefixe], t > max { max = t }
            }
        }
        return max
    }

    /// Une valeur réécrite n'est plus une valeur supprimée — et la tombale peut
    /// porter sur un parent.
    private static func oublierTombale(_ meta: inout MetaSync, _ ch: String) {
        meta.sup.retirer(ch)
        let segs = segments(ch)
        if segs.count >= 2 {
            for i in 1..<segs.count { meta.sup.retirer(chemin(Array(segs[0..<i]))) }
        }
    }

    /// Aperçu de ce qu'une suppression emporte : les trois premières valeurs,
    /// sans le champ `id` — il répète le chemin et ne dit rien à qui relit le
    /// journal six mois plus tard.
    private static func apercu(_ chemins: [String], _ feuilles: Feuilles) -> [Valeur] {
        chemins.filter { segments($0).last != "id" }.prefix(3).compactMap { feuilles[$0] }
    }

    // MARK: Datage

    /// `syncDater` : compare deux états et date ce qui a changé. C'est ce qui
    /// donne à chaque feuille sa date sans demander aux fonctions de saisie de
    /// s'en occuper — et la matière de l'historique des modifications.
    static func dater(_ meta: MetaSync?, avant: Valeur, apres: Valeur, ts: Double) -> ResultatDatage {
        var m = (meta ?? .vide).normalisee
        let fa = aplatir(avant)
        let fb = aplatir(apres)
        var changements: [Changement] = []
        var modifiees = 0

        for ch in fb.cles {
            let nouvelle = !fa.contient(ch)
            // Une cellule qui APPARAÎT vide ne porte aucune information : saisir
            // un montant dans une nouvelle catégorie crée douze cases d'un coup,
            // dont onze vides. Les dater ferait gagner ces vides contre les
            // vrais montants de l'autre appareil.
            if nouvelle, fb[ch]!.estVide { continue }
            if nouvelle || !Valeur.memeValeur(fa[ch], fb[ch]) {
                m.feuilles[ch] = ts
                oublierTombale(&m, ch)
                changements.append(Changement(chemin: ch, genre: nouvelle ? .ajout : .maj,
                                              avant: fa[ch], apres: fb[ch],
                                              apercu: nil, feuilles: nil))
                modifiees += 1
            }
        }

        // La tombale se pose sur le PLUS COURT chemin entièrement disparu —
        // l'élément lui-même, pas chacun de ses champs.
        let prefixesApres = prefixes(fb)
        var racines: [String] = []
        for ch in fa.cles {
            if fb.contient(ch) { continue }
            // Une feuille devenue CONTENEUR n'est pas une suppression : `uber: {}`
            // est une feuille tant que l'objet est vide.
            if prefixesApres.contains(ch) { continue }
            let segs = segments(ch)
            var racine = ch
            if segs.count >= 2 {
                for i in 1..<segs.count {
                    let pre = chemin(Array(segs[0..<i]))
                    if !prefixesApres.contains(pre) { racine = pre; break }
                }
            }
            if !racines.contains(racine) { racines.append(racine) }
        }

        for r in racines {
            m.sup[r] = ts
            let prefixe = r + sep
            for ch in m.feuilles.cles where ch == r || ch.hasPrefix(prefixe) { m.feuilles.retirer(ch) }
            let sous = fa.cles.filter { $0 == r || $0.hasPrefix(prefixe) }
            changements.append(Changement(chemin: r, genre: .suppression,
                                          avant: sous.count == 1 ? fa[sous[0]] : nil,
                                          apres: nil,
                                          apercu: sous.count > 1 ? apercu(sous, fa) : nil,
                                          feuilles: sous.count))
        }

        return ResultatDatage(meta: m, modifiees: modifiees,
                              supprimees: racines.count, changements: changements)
    }

    // MARK: Départage d'une égalité

    /// Égalité de dates et valeurs différentes. Les deux appareils doivent en
    /// tirer la MÊME conclusion sans savoir lequel des deux est « ici », sinon
    /// la fusion ne converge pas — c'était le va-et-vient sans fin de la 2.5.0.
    /// Rend vrai si c'est la valeur distante qui gagne.
    static func trancherEgalite(_ local: Valeur?, _ distant: Valeur?) -> Bool {
        let vl = local.estVideOuAbsente, vd = distant.estVideOuAbsente
        if vl != vd { return vl }                       // une vraie valeur bat une case vide
        guard let jl = Valeur.jsonCanonique(local), let jd = Valeur.jsonCanonique(distant) else {
            return false                                 // `undefined > "x"` vaut faux en JavaScript
        }
        return Valeur.texteEstPlusGrandJS(jd, jl)
    }

    // MARK: La fusion

    static func fusionner(local: (state: Valeur, meta: MetaSync?),
                          distant: (state: Valeur, meta: MetaSync?)) -> ResultatFusion {
        let stLocal = local.state
        let stDist = distant.state
        let mLocal = (local.meta ?? .vide).normalisee
        let mDist = (distant.meta ?? .vide).normalisee

        var resultat = stLocal
        var meta = MetaSync(feuilles: mLocal.feuilles, sup: mLocal.sup)
        var conflits: [Conflit] = []
        var changements: [Changement] = []
        var stats = StatsFusion()

        let fLocal = aplatir(stLocal)
        let fDist = aplatir(stDist)
        let prefLocal = prefixes(fLocal)
        let prefDist = prefixes(fDist)

        // 1. Tout ce que le distant possède.
        for ch in fDist.cles {
            let tsD = dateDe(mDist, ch)
            let supLocale = dateSuppression(mLocal, ch)

            if !fLocal.contient(ch) {
                // Une catégorie VIDE chez l'autre appareil (`uber: {}`) est une
                // feuille, alors qu'ici le même chemin porte déjà des valeurs :
                // l'écrire écraserait la catégorie entière par un objet vide.
                if prefLocal.contains(ch) { continue }
                if supLocale > 0, supLocale >= tsD { stats.supprimes += 1; continue }
                ecrireA(&resultat, ch, fDist[ch]!, stDist)
                meta.feuilles[ch] = tsD
                changements.append(Changement(chemin: ch, genre: .ajout, avant: nil,
                                              apres: fDist[ch], apercu: nil, feuilles: nil))
                stats.ajoutesDistant += 1
                continue
            }

            if Valeur.memeValeur(fLocal[ch], fDist[ch]) {
                meta.feuilles[ch] = max(dateDe(mLocal, ch), tsD)
                continue
            }

            let tsL = dateDe(mLocal, ch)
            if tsD > tsL {
                ecrireA(&resultat, ch, fDist[ch]!, stDist)
                meta.feuilles[ch] = tsD
                changements.append(Changement(chemin: ch, genre: .maj, avant: fLocal[ch],
                                              apres: fDist[ch], apercu: nil, feuilles: nil))
                stats.prisDistant += 1
                if tsL > 0 {
                    conflits.append(Conflit(chemin: ch, garde: fDist[ch],
                                            ecarte: fLocal[ch], origine: "distant"))
                    stats.conflits += 1
                }
            } else if tsL == 0, fLocal[ch]!.estVide, !fDist[ch]!.estVide {
                // Règle d'effacement : une cellule vide SANS date ne porte aucune
                // information. Une cellule vidée volontairement, elle, porte une
                // date — l'effacement est une écriture — et se défend.
                ecrireA(&resultat, ch, fDist[ch]!, stDist)
                meta.feuilles[ch] = tsD
                changements.append(Changement(chemin: ch, genre: .maj, avant: fLocal[ch],
                                              apres: fDist[ch], apercu: nil, feuilles: nil))
                stats.prisDistant += 1
            } else if tsD == tsL {
                let gagneDistant = trancherEgalite(fLocal[ch], fDist[ch])
                if gagneDistant {
                    ecrireA(&resultat, ch, fDist[ch]!, stDist)
                    changements.append(Changement(chemin: ch, genre: .maj, avant: fLocal[ch],
                                                  apres: fDist[ch], apercu: nil, feuilles: nil))
                    stats.prisDistant += 1
                } else {
                    stats.gardesLocal += 1
                }
                conflits.append(Conflit(chemin: ch,
                                        garde: gagneDistant ? fDist[ch] : fLocal[ch],
                                        ecarte: gagneDistant ? fLocal[ch] : fDist[ch],
                                        origine: gagneDistant ? "distant" : "local"))
                stats.conflits += 1
            } else {
                stats.gardesLocal += 1
            }
        }

        // 2. Les suppressions venues de l'autre appareil, appliquées AU CHEMIN
        //    OÙ ELLES SONT POSÉES — l'élément, pas ses champs.
        for ch in mDist.sup.cles {
            if !prefLocal.contains(ch) || prefDist.contains(ch) { continue }
            let tsSup = mDist.sup[ch]!
            let prefixe = ch + sep
            var tsLocalMax: Double = 0
            for l in fLocal.cles where l == ch || l.hasPrefix(prefixe) {
                tsLocalMax = max(tsLocalMax, dateDe(mLocal, l))
            }
            if tsSup <= tsLocalMax { continue }
            supprimerA(&resultat, ch)
            for l in meta.feuilles.cles where l == ch || l.hasPrefix(prefixe) { meta.feuilles.retirer(l) }
            meta.sup[ch] = tsSup
            let emportees = fLocal.cles.filter { $0 == ch || $0.hasPrefix(prefixe) }
            changements.append(Changement(chemin: ch, genre: .suppression,
                                          avant: emportees.count == 1 ? fLocal[emportees[0]] : nil,
                                          apres: nil,
                                          apercu: emportees.count > 1 ? apercu(emportees, fLocal) : nil,
                                          feuilles: emportees.count))
            stats.supprimes += 1
        }

        // 3. Les tombales des deux côtés survivent : un appareil resté hors
        //    ligne ne doit pas ressusciter ce qu'un autre a supprimé.
        for ch in mDist.sup.cles {
            let tsD = mDist.sup[ch]!
            if !((meta.sup[ch] ?? 0) > tsD) { meta.sup[ch] = tsD }
        }

        return ResultatFusion(state: resultat, meta: meta, conflits: conflits,
                              stats: stats, changements: changements)
    }

    // MARK: Résumé

    /// Une phrase pour le bandeau de synchronisation.
    static func resume(_ stats: StatsFusion) -> String {
        var bouts: [String] = []
        if stats.ajoutesDistant > 0 {
            let p = stats.ajoutesDistant > 1 ? "s" : ""
            bouts.append("\(stats.ajoutesDistant) valeur\(p) reçue\(p)")
        }
        if stats.prisDistant > 0 {
            bouts.append("\(stats.prisDistant) mise\(stats.prisDistant > 1 ? "s" : "") à jour")
        }
        if stats.supprimes > 0 {
            bouts.append("\(stats.supprimes) supprimée\(stats.supprimes > 1 ? "s" : "")")
        }
        return bouts.isEmpty ? "déjà à jour" : bouts.joined(separator: ", ")
    }

    // MARK: Faut-il renvoyer le résultat au cloud ?

    /// Une empreinte CANONIQUE de l'état : les feuilles triées par chemin.
    /// Comparer deux `JSON.stringify` d'états ne marcherait pas — l'ordre des
    /// clés suit l'ordre d'écriture, donc deux appareils qui portent les mêmes
    /// données produisent deux textes différents, chacun conclut que l'autre est
    /// en retard, et ils se renvoient leurs documents pour l'éternité.
    static func empreinteEtat(_ st: Valeur?) -> String {
        let f = aplatir(st ?? .objet(Objet()))
        return triJS(f.cles).map { $0 + "=" + f[$0]!.jsonCanonique }.joined(separator: "\u{1E}")
    }

    static func doitRenvoyer(fusion: (state: Valeur, meta: MetaSync?),
                             distant: (state: Valeur, meta: MetaSync?)) -> Bool {
        if empreinteEtat(fusion.state) != empreinteEtat(distant.state) { return true }
        let a = (fusion.meta ?? .vide).normalisee
        let b = (distant.meta ?? .vide).normalisee
        // « Absente là-bas » ne veut pas dire « plus récente ici » : une feuille
        // sans date vaut 0 des deux côtés.
        func plusRecent(_ x: Dates, _ y: Dates) -> Bool {
            x.cles.contains { (x[$0] ?? 0) > (y[$0] ?? 0) }
        }
        return plusRecent(a.feuilles, b.feuilles) || plusRecent(a.sup, b.sup)
    }
}
