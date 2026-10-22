//  ════════════════════════════════════════════════════════════════════════════
//  Socle.swift — UTILITAIRES PARTAGÉS, PORTÉS DE pwa_2026/js/app-modules.js
//
//  Vague 1 du portage (docs/PORTAGE_IOS.md § 5). Tout ce fichier est du calcul
//  pur sur Foundation : aucun import UIKit, aucun SwiftData, aucune dépendance
//  à l'état de l'application. C'est ce qui permet de le compiler pour macOS et
//  d'exécuter la suite de parité hors simulateur (scripts/ios-parity.sh).
//
//  La règle de parité : les fonctions ci-dessous doivent rendre EXACTEMENT ce
//  que rendent leurs homologues JavaScript sur les mêmes entrées. Les valeurs
//  attendues ne sont pas recopiées à la main — elles sont exportées depuis la
//  suite PWA (ios_2026/Tests/Parity/parite-vague1.json).
//
//  Ce qui ne se porte PAS et n'a donc pas d'équivalent ici : `escH`/`escJS`
//  (SwiftUI n'interpole pas de HTML), `dl` (partage natif), `loadScript`
//  (aucun CDN), `openSheet`/`card`/`table` (SwiftUI), `readYear`/`writeYear`
//  (c'est le rôle de DataService).
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

enum Socle {

    // MARK: - Nombres

    /// Lit un montant tapé ou copié d'un relevé : « 1 234,56 $ », « 1,234.56 »,
    /// « (123,45) » (négatif comptable), « 2,500 » (deux mille cinq cents).
    ///
    /// Reproduit `num()` de app-modules.js, y compris sa tolérance : une saisie
    /// illisible vaut 0 et ne lève jamais. C'est voulu — un champ de saisie ne
    /// doit pas pouvoir faire planter un calcul d'impôt.
    static func num(_ v: String?) -> Double {
        guard let brut = v?.trimmingCharacters(in: .whitespacesAndNewlines), !brut.isEmpty else { return 0 }

        // Négatif : signe moins en tête, ou parenthèses comptables autour du tout.
        let negatif = brut.hasPrefix("-") || (brut.hasPrefix("(") && brut.hasSuffix(")"))

        // Ne reste que les chiffres et les deux séparateurs possibles. Les
        // espaces (y compris insécables), le « $ » et les parenthèses sautent.
        var s = String(brut.unicodeScalars.filter { CharacterSet(charactersIn: "0123456789.,").contains($0) })

        let dernierPoint = s.lastIndex(of: ".")
        let derniereVirgule = s.lastIndex(of: ",")
        if let p = dernierPoint, let c = derniereVirgule {
            // Le séparateur décimal est le dernier des deux ; l'autre groupe les milliers.
            s = c > p ? s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
                      : s.replacingOccurrences(of: ",", with: "")
        } else if derniereVirgule != nil {
            // Une seule virgule : décimale si 1 ou 2 chiffres suivent, sinon millier.
            let apres = s.split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false).last ?? ""
            s = (apres.count == 1 || apres.count == 2) && apres.allSatisfy(\.isNumber)
                ? s.replacingOccurrences(of: ",", with: ".")
                : s.replacingOccurrences(of: ",", with: "")
        }

        guard let n = prefixeDouble(s), n.isFinite else { return 0 }
        return negatif ? -n : n
    }

    /// `parseFloat` de JavaScript lit le plus long préfixe valide et ignore la
    /// suite ; `Double(_:)` exige la chaîne entière. On retranche donc la queue
    /// jusqu'à obtenir un nombre, sans quoi « 12.3.4 » vaudrait 0 ici et 12,3
    /// côté PWA — un écart invisible qui ferait mentir un total.
    private static func prefixeDouble(_ s: String) -> Double? {
        if s.isEmpty { return nil }
        if let n = Double(s) { return n }
        var fin = s.endIndex
        while fin > s.startIndex {
            fin = s.index(before: fin)
            if let n = Double(s[s.startIndex..<fin]) { return n }
        }
        return nil
    }

    static let locale = Locale(identifier: "fr_CA")

    /// Format fr-CA à décimales fixes. Rend « - » sur une valeur absente, comme
    /// `fmt()` côté PWA : une cellule vide ne doit pas s'afficher « 0,00 ».
    static func fmt(_ n: Double?, _ dec: Int = 2) -> String {
        guard let n = n, n.isFinite else { return "-" }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = locale
        f.minimumFractionDigits = dec
        f.maximumFractionDigits = dec
        return f.string(from: NSNumber(value: n)) ?? "-"
    }

    static func money(_ n: Double?, _ dec: Int = 2) -> String { fmt(n, dec) + " $" }

    // MARK: - CSV

    /// Une cellule qui contient une virgule, un point-virgule, un guillemet ou
    /// un saut de ligne est entourée de guillemets, les guillemets doublés.
    static func csvCell(_ v: String?) -> String {
        let s = v ?? ""
        guard s.contains(where: { "\",;\n".contains($0) }) else { return s }
        return "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    static func csvLigne(_ cells: [String?]) -> String {
        cells.map(csvCell).joined(separator: ",")
    }

    // MARK: - Dates et libellés

    /// Année d'une date « AAAA-MM-JJ ». Rend 0 sur une chaîne vide ou illisible,
    /// comme `yearOf()` : le registre des biens compare cette valeur à l'année
    /// active, et un nil propagé en ferait un piège.
    static func anneeDe(_ dateStr: String?) -> Int {
        guard let d = dateStr, d.count >= 4, let an = Int(d.prefix(4)) else { return 0 }
        return an
    }

    /// Retire la parenthèse finale d'un libellé d'immeuble : « Duplex A (test) »
    /// devient « Duplex A ». Sert aux libellés de catégories de DPA.
    static func shortLabel(_ label: String) -> String {
        guard let r = label.range(of: #"\s*\(.*\)$"#, options: .regularExpression) else { return label }
        return String(label[label.startIndex..<r.lowerBound])
    }
}
