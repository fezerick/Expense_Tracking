//  ════════════════════════════════════════════════════════════════════════════
//  Valeur.swift — L'ARBRE DE DONNÉES, AVEC LA SÉMANTIQUE DE JAVASCRIPT
//
//  Vague 1 bis du portage (docs/PORTAGE_IOS.md § 5). SyncService et
//  JournalService fusionnent et décrivent un arbre JSON librement formé : des
//  objets dont les clés sont des noms de catégories saisis par l'utilisateur,
//  des tableaux de douze mois, des montants qui sont des CHAÎNES parce que la
//  PWA les stocke tels que tapés.
//
//  Pourquoi un type à part plutôt que `[String: Any]` ou JSONSerialization :
//
//  1. La fusion compare des valeurs par leur écriture JSON canonique, et
//     départage une égalité de dates en comparant deux de ces écritures. Un
//     écart d'un seul caractère entre Swift et JavaScript ferait divergier les
//     deux appareils — exactement le va-et-vient sans fin que la 2.5.1 a corrigé.
//     `jsonCanonique` reproduit donc `JSON.stringify` au caractère près.
//  2. `JSON.stringify` d'un objet suit l'ORDRE D'ÉCRITURE de ses clés.
//     Un dictionnaire Swift n'a pas d'ordre. D'où `Objet`, qui garde le sien.
//  3. `undefined` et `null` sont deux choses différentes en JavaScript, et la
//     fusion s'appuie sur la distinction (« absent ici » n'est pas « vidé
//     ici »). `Valeur?` porte cette distinction : `nil` est `undefined`.
//
//  Foundation seul, aucun état : voir l'en-tête de Socle.swift.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

// MARK: - Objet à clés ordonnées

/// Un objet JSON qui se souvient de l'ordre dans lequel ses clés ont été
/// écrites, parce que `JSON.stringify` s'en sert et que la fusion compare des
/// `JSON.stringify`.
struct Objet {
    private(set) var cles: [String] = []
    private var table: [String: Valeur] = [:]

    init() {}

    init(_ paires: [(String, Valeur)]) {
        for (k, v) in paires { self[k] = v }
    }

    subscript(cle: String) -> Valeur? {
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

    var estVide: Bool { cles.isEmpty }
}

// MARK: - La valeur

/// Une valeur JSON. `indirect` parce qu'un objet contient des valeurs qui
/// contiennent des objets.
indirect enum Valeur {
    case nul
    case booleen(Bool)
    case nombre(Double)
    case texte(String)
    case liste([Valeur])
    case objet(Objet)

    // MARK: Interrogation

    /// `syncEstScalaire` : null, chaîne, nombre, booléen.
    var estScalaire: Bool {
        switch self {
        case .nul, .texte, .nombre, .booleen: return true
        case .liste, .objet: return false
        }
    }

    var estObjet: Bool { if case .objet = self { return true }; return false }

    var commeListe: [Valeur]? { if case .liste(let a) = self { return a }; return nil }
    var commeObjet: Objet? { if case .objet(let o) = self { return o }; return nil }
    var commeTexte: String? { if case .texte(let s) = self { return s }; return nil }
    var commeNombre: Double? { if case .nombre(let d) = self { return d }; return nil }

    /// `syncEstVide` : aucune information. Une case vide ne défend pas sa place
    /// contre une valeur — voir la règle d'effacement de SyncService.
    var estVide: Bool {
        switch self {
        case .nul: return true
        case .texte(let s): return s.isEmpty
        case .objet(let o): return o.estVide
        case .liste(let a): return a.isEmpty
        case .nombre, .booleen: return false
        }
    }

    /// `String(valeur)` de JavaScript, pour les valeurs scalaires : c'est ce qui
    /// transforme un `id` ou un membre d'ensemble en segment de chemin.
    var texteJS: String {
        switch self {
        case .nul: return "null"
        case .booleen(let b): return b ? "true" : "false"
        case .nombre(let d): return Valeur.nombreJS(d)
        case .texte(let s): return s
        case .liste(let a): return a.map { $0.estVide && $0.commeListe == nil ? "" : $0.texteJS }.joined(separator: ",")
        case .objet: return "[object Object]"
        }
    }
}

// MARK: - Vide ou absent

extension Optional where Wrapped == Valeur {
    /// `syncEstVide(undefined)` vaut vrai : l'absence ne porte aucune
    /// information, exactement comme une case vide.
    var estVideOuAbsente: Bool {
        switch self {
        case .none: return true
        case .some(let v): return v.estVide
        }
    }
}

// MARK: - Écriture JSON canonique

extension Valeur {

    /// `JSON.stringify(v)`, au caractère près.
    ///
    /// C'est la fonction la plus sensible du portage : la fusion l'utilise pour
    /// décider si deux valeurs sont les mêmes, et pour départager une égalité
    /// de dates en comparant deux écritures. Toute divergence ici se traduit par
    /// deux appareils qui ne convergent pas.
    var jsonCanonique: String {
        switch self {
        case .nul: return "null"
        case .booleen(let b): return b ? "true" : "false"
        case .nombre(let d): return d.isFinite ? Valeur.nombreJS(d) : "null"   // stringify(NaN) === "null"
        case .texte(let s): return Valeur.chaineJSON(s)
        case .liste(let a): return "[" + a.map { $0.jsonCanonique }.joined(separator: ",") + "]"
        case .objet(let o):
            let corps = o.cles.compactMap { k -> String? in
                guard let v = o[k] else { return nil }
                return Valeur.chaineJSON(k) + ":" + v.jsonCanonique
            }
            return "{" + corps.joined(separator: ",") + "}"
        }
    }

    /// `JSON.stringify` d'une valeur qui peut être absente : `undefined` ne
    /// produit AUCUN texte en JavaScript, et la fusion compare parfois une
    /// valeur présente à une valeur absente. Rendre `nil` plutôt que `"null"`
    /// garde la distinction.
    static func jsonCanonique(_ v: Valeur?) -> String? { v?.jsonCanonique }

    /// Deux valeurs sont « la même » au sens de la fusion : `memeValeur` de
    /// sync.js, c'est-à-dire l'égalité de leurs écritures JSON — ordre des clés
    /// compris, comme en JavaScript.
    static func memeValeur(_ a: Valeur?, _ b: Valeur?) -> Bool {
        jsonCanonique(a) == jsonCanonique(b)
    }

    private static func chaineJSON(_ s: String) -> String {
        var out = "\""
        for u in s.unicodeScalars {
            switch u {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            default:
                if u.value < 0x20 {
                    out += String(format: "\\u%04x", u.value)
                } else {
                    out.unicodeScalars.append(u)
                }
            }
        }
        return out + "\""
    }
}

// MARK: - Nombre → chaîne, à la façon de JavaScript

extension Valeur {

    /// `String(nombre)` de JavaScript. Swift et JavaScript écrivent les mêmes
    /// doubles différemment — `5` contre `5.0`, `1e-7` contre `1e-07`,
    /// `0.000001` contre `1e-06` — et ces écritures entrent dans des
    /// comparaisons de la fusion. On applique donc la règle de la norme
    /// ECMAScript (Number::toString) aux chiffres les plus courts qui
    /// reconstituent le double.
    static func nombreJS(_ d: Double) -> String {
        if d.isNaN { return "NaN" }
        if d.isInfinite { return d > 0 ? "Infinity" : "-Infinity" }
        if d == 0 { return "0" }                       // String(-0) === "0"
        if d < 0 { return "-" + nombreJS(-d) }

        // Chiffres significatifs les plus courts qui relisent le même double :
        // c'est ce que donne la description de Swift, dont on ne garde que les
        // chiffres et l'exposant décimal.
        let (chiffres, n) = chiffresEtExposant(d)
        let k = chiffres.count

        if k <= n && n <= 21 {
            return chiffres + String(repeating: "0", count: n - k)
        }
        if 0 < n && n <= 21 {
            let i = chiffres.index(chiffres.startIndex, offsetBy: n)
            return String(chiffres[..<i]) + "." + String(chiffres[i...])
        }
        if -6 < n && n <= 0 {
            return "0." + String(repeating: "0", count: -n) + chiffres
        }
        let tete = String(chiffres.first!)
        let reste = String(chiffres.dropFirst())
        let exposant = n - 1
        let signe = exposant >= 0 ? "+" : "-"
        return tete + (reste.isEmpty ? "" : "." + reste) + "e" + signe + String(abs(exposant))
    }

    /// Rend (chiffres significatifs sans zéro de tête ni de queue, exposant `n`)
    /// tels que la valeur vaut `0.<chiffres> × 10^n`.
    private static func chiffresEtExposant(_ d: Double) -> (String, Int) {
        var s = "\(d)"              // description Swift : aller-retour le plus court
        var exposant = 0
        if let e = s.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            exposant = Int(s[s.index(after: e)...].replacingOccurrences(of: "+", with: "")) ?? 0
            s = String(s[..<e])
        }
        var entiere = s, fraction = ""
        if let p = s.firstIndex(of: ".") {
            entiere = String(s[..<p])
            fraction = String(s[s.index(after: p)...])
        }
        // 0.<chiffres> × 10^n : n part du nombre de chiffres entiers, puis on
        // retire les zéros de tête, qui déplacent la virgule sans rien signifier.
        var chiffres = entiere + fraction
        var n = entiere.count + exposant
        while chiffres.hasPrefix("0") { chiffres.removeFirst(); n -= 1 }
        while chiffres.hasSuffix("0") { chiffres.removeLast() }
        if chiffres.isEmpty { return ("0", 1) }
        return (chiffres, n)
    }
}

// MARK: - Comparaison de chaînes à la façon de JavaScript

extension Valeur {
    /// `a > b` de JavaScript sur deux chaînes : comparaison des unités de code
    /// UTF-16, pas l'ordre lexicographique d'Unicode que Swift applique.
    ///
    /// La différence est réelle ici : les noms de catégories sont accentués
    /// (« Électricité », « Eau / Égouts »), et c'est cette comparaison qui
    /// départage une égalité de dates. Si les deux appareils ne tranchent pas
    /// pareil, la fusion ne converge pas.
    static func texteEstPlusGrandJS(_ a: String, _ b: String) -> Bool {
        var ia = Array(a.utf16).makeIterator()
        var ib = Array(b.utf16).makeIterator()
        while true {
            switch (ia.next(), ib.next()) {
            case (nil, nil): return false        // égales
            case (nil, _): return false          // a est un préfixe de b
            case (_, nil): return true
            case (let x?, let y?):
                if x != y { return x > y }
            }
        }
    }
}

// MARK: - Lecture et écriture JSON

extension Valeur {

    /// Construit une `Valeur` depuis le JSON d'un document — en préservant
    /// l'ordre des clés, que `JSONSerialization` perd. On relit donc le texte
    /// directement.
    static func depuisJSON(_ texte: String) throws -> Valeur {
        var lecteur = LecteurJSON(texte)
        let v = try lecteur.valeur()
        lecteur.sauterBlancs()
        guard lecteur.fini else { throw ErreurValeur.jsonInvalide("texte après la valeur") }
        return v
    }

    static func depuisJSON(donnees: Data) throws -> Valeur {
        guard let s = String(data: donnees, encoding: .utf8) else {
            throw ErreurValeur.jsonInvalide("encodage non UTF-8")
        }
        return try depuisJSON(s)
    }
}

enum ErreurValeur: Error, CustomStringConvertible {
    case jsonInvalide(String)
    var description: String {
        switch self { case .jsonInvalide(let m): return "JSON invalide : \(m)" }
    }
}

/// Analyseur JSON minimal, écrit pour une seule raison : conserver l'ordre
/// d'écriture des clés. `JSONSerialization` rend un dictionnaire non ordonné, et
/// l'ordre des clés entre dans les comparaisons de la fusion (cf. `jsonCanonique`).
private struct LecteurJSON {
    private let u: [UInt8]
    private var i = 0

    init(_ s: String) { u = Array(s.utf8) }

    var fini: Bool { i >= u.count }

    mutating func sauterBlancs() {
        while i < u.count, u[i] == 0x20 || u[i] == 0x09 || u[i] == 0x0A || u[i] == 0x0D { i += 1 }
    }

    mutating func valeur() throws -> Valeur {
        sauterBlancs()
        guard i < u.count else { throw ErreurValeur.jsonInvalide("fin de texte inattendue") }
        switch u[i] {
        case UInt8(ascii: "{"): return try objet()
        case UInt8(ascii: "["): return try liste()
        case UInt8(ascii: "\""): return .texte(try chaine())
        case UInt8(ascii: "t"): try mot("true"); return .booleen(true)
        case UInt8(ascii: "f"): try mot("false"); return .booleen(false)
        case UInt8(ascii: "n"): try mot("null"); return .nul
        default: return .nombre(try nombre())
        }
    }

    private mutating func mot(_ m: String) throws {
        for c in m.utf8 {
            guard i < u.count, u[i] == c else { throw ErreurValeur.jsonInvalide("mot-clé attendu : \(m)") }
            i += 1
        }
    }

    private mutating func objet() throws -> Valeur {
        i += 1                                   // {
        var o = Objet()
        sauterBlancs()
        if i < u.count, u[i] == UInt8(ascii: "}") { i += 1; return .objet(o) }
        while true {
            sauterBlancs()
            let k = try chaine()
            sauterBlancs()
            guard i < u.count, u[i] == UInt8(ascii: ":") else { throw ErreurValeur.jsonInvalide("« : » attendu") }
            i += 1
            o[k] = try valeur()
            sauterBlancs()
            guard i < u.count else { throw ErreurValeur.jsonInvalide("objet non fermé") }
            if u[i] == UInt8(ascii: ",") { i += 1; continue }
            if u[i] == UInt8(ascii: "}") { i += 1; return .objet(o) }
            throw ErreurValeur.jsonInvalide("« , » ou « } » attendu")
        }
    }

    private mutating func liste() throws -> Valeur {
        i += 1                                   // [
        var a: [Valeur] = []
        sauterBlancs()
        if i < u.count, u[i] == UInt8(ascii: "]") { i += 1; return .liste(a) }
        while true {
            a.append(try valeur())
            sauterBlancs()
            guard i < u.count else { throw ErreurValeur.jsonInvalide("tableau non fermé") }
            if u[i] == UInt8(ascii: ",") { i += 1; continue }
            if u[i] == UInt8(ascii: "]") { i += 1; return .liste(a) }
            throw ErreurValeur.jsonInvalide("« , » ou « ] » attendu")
        }
    }

    private mutating func chaine() throws -> String {
        guard i < u.count, u[i] == UInt8(ascii: "\"") else { throw ErreurValeur.jsonInvalide("chaîne attendue") }
        i += 1
        var octets: [UInt8] = []
        var scalaires: [UInt16] = []
        func viderOctets() {
            if octets.isEmpty { return }
            scalaires.append(contentsOf: Array(String(decoding: octets, as: UTF8.self).utf16))
            octets.removeAll()
        }
        while i < u.count {
            let c = u[i]
            if c == UInt8(ascii: "\"") {
                i += 1
                viderOctets()
                return String(decoding: scalaires, as: UTF16.self)
            }
            if c == UInt8(ascii: "\\") {
                viderOctets()
                i += 1
                guard i < u.count else { break }
                switch u[i] {
                case UInt8(ascii: "\""): scalaires.append(0x22)
                case UInt8(ascii: "\\"): scalaires.append(0x5C)
                case UInt8(ascii: "/"):  scalaires.append(0x2F)
                case UInt8(ascii: "b"):  scalaires.append(0x08)
                case UInt8(ascii: "f"):  scalaires.append(0x0C)
                case UInt8(ascii: "n"):  scalaires.append(0x0A)
                case UInt8(ascii: "r"):  scalaires.append(0x0D)
                case UInt8(ascii: "t"):  scalaires.append(0x09)
                case UInt8(ascii: "u"):
                    guard i + 4 < u.count,
                          let n = UInt16(String(decoding: u[(i + 1)...(i + 4)], as: UTF8.self), radix: 16)
                    else { throw ErreurValeur.jsonInvalide("échappement \\u mal formé") }
                    scalaires.append(n)      // les paires de substitution se recollent à la fin
                    i += 4
                default: throw ErreurValeur.jsonInvalide("échappement inconnu")
                }
                i += 1
                continue
            }
            octets.append(c)
            i += 1
        }
        throw ErreurValeur.jsonInvalide("chaîne non fermée")
    }

    private mutating func nombre() throws -> Double {
        let debut = i
        while i < u.count, "+-0123456789.eE".utf8.contains(u[i]) { i += 1 }
        guard debut < i, let d = Double(String(decoding: u[debut..<i], as: UTF8.self)) else {
            throw ErreurValeur.jsonInvalide("nombre attendu")
        }
        return d
    }
}
