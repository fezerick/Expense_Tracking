//  ════════════════════════════════════════════════════════════════════════════
//  JournalService.swift — HISTORIQUE DES MODIFICATIONS
//
//  Portage de pwa_2026/js/journal.js (vague 1 bis, docs/PORTAGE_IOS.md § 5).
//  La question à laquelle ce fichier répond est dans l'en-tête du fichier
//  JavaScript : « le total n'est plus celui que j'ai envoyé au comptable —
//  qu'est-ce qui a changé ? »
//
//  Le journal ne calcule rien. Il habille ce que `SyncService.dater` et
//  `SyncService.fusionner` savaient déjà : c'est pour cela qu'aucune fonction
//  de saisie n'a à penser à journaliser, et qu'aucune ne peut l'oublier.
//
//  Ce qui ne se porte PAS ici, parce que ce n'est pas du calcul : la lecture et
//  l'écriture dans `localStorage` (côté iOS, c'est le rôle de DataService) et
//  l'écran de consultation (SwiftUI). `journalConsigner` se reconstitue en
//  trois lignes au-dessus de `entrees` + `entreeLot` + `ajouter`.
//
//  Deux pièges de traduction, tous deux attrapés par la suite de parité :
//
//  1. `Array.prototype.sort` est STABLE depuis ES2019 ; `sorted(by:)` ne l'est
//     pas. Deux lignes de la même milliseconde garderaient ici un ordre
//     arbitraire, et le journal afficherait une correction avant la valeur
//     qu'elle corrige. D'où le tri par (date, rang d'origine).
//  2. `slice(0, 60)` de JavaScript coupe des UNITÉS DE CODE UTF-16, pas des
//     caractères Swift. Sur « Électricité » le compte est le même, sur un
//     émoji non.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

// MARK: - Une ligne du journal

enum GenreEntree: String {
    case ajout, maj, suppression, lot
}

struct EntreeJournal {
    var ts: Double
    var chemin: String
    var genre: GenreEntree
    var origine: String          // "saisie" (ici) ou "distant" (reçu)
    var appareil: String
    var avant: String
    var apres: String
    /// Suppression : combien de cases la ligne emporte.
    var feuilles: Int?
    /// Ligne de synthèse : combien de valeurs, et combien de suppressions.
    var nb: Int?
    var supprimes: Int?

    init(ts: Double, chemin: String, genre: GenreEntree, origine: String, appareil: String,
         avant: String = "", apres: String = "", feuilles: Int? = nil,
         nb: Int? = nil, supprimes: Int? = nil) {
        self.ts = ts; self.chemin = chemin; self.genre = genre; self.origine = origine
        self.appareil = appareil; self.avant = avant; self.apres = apres
        self.feuilles = feuilles; self.nb = nb; self.supprimes = supprimes
    }
}

/// Traduit les segments de chemin en mots de l'application. Reconstruit à
/// chaque affichage : un immeuble renommé doit changer de nom dans TOUT
/// l'historique, y compris dans les lignes écrites avant le changement de nom —
/// ce qu'on désigne, c'est la cellule, pas le mot qui la nommait ce jour-là.
struct LexiqueJournal {
    var props: [String: String] = [:]
    var champs: [String: String] = [:]
    var trajets: [String: String] = [:]

    init(props: [String: String] = [:], champs: [String: String] = [:], trajets: [String: String] = [:]) {
        self.props = props; self.champs = champs; self.trajets = trajets
    }
}

struct GroupeJournal {
    var jour: String             // AAAA-MM-JJ
    var entrees: [EntreeJournal]
}

struct FiltreJournal {
    var depuis: Double?
    var jusqua: Double?
    var origine: String?         // nil ou "tout" : tout
    var texte: String = ""
    var lexique = LexiqueJournal()

    init(depuis: Double? = nil, jusqua: Double? = nil, origine: String? = nil,
         texte: String = "", lexique: LexiqueJournal = LexiqueJournal()) {
        self.depuis = depuis; self.jusqua = jusqua; self.origine = origine
        self.texte = texte; self.lexique = lexique
    }
}

// MARK: - Le service

enum JournalService {

    /// 800 lignes tiennent dans ~120 Ko et couvrent plusieurs saisons de saisie.
    /// Le journal est la donnée la MOINS précieuse de l'application : il doit
    /// céder la place, jamais la prendre.
    static let max = 800

    /// Deux écritures dans la même cellule à moins de deux minutes sont la même
    /// correction. Sans ce repli, hésiter sur un montant (« 142 », « 1420 »,
    /// « 142,30 ») laissait trois lignes pour une seule décision.
    static let fenetreFusion: Double = 120_000

    /// Une valeur au journal est un repère, pas une pièce jointe.
    static let valMax = 60

    /// Au-delà, une fusion s'inscrit en UNE ligne de synthèse : le premier
    /// raccordement d'un appareil reçoit des centaines de valeurs, et les
    /// détailler chasserait du journal tout l'historique utile.
    static let seuilLot = 40

    /// Noms de mois propres au fichier, pour qu'il reste autonome.
    static let mois = ["janvier", "février", "mars", "avril", "mai", "juin",
                       "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

    static let sections = ["revenus": "Revenus", "deductibles": "Dépenses", "capital": "Capital"]

    // MARK: Nom de l'appareil

    /// « Qui » a modifié, à l'échelle d'une application personnelle : quel
    /// appareil. Pas de nom d'utilisateur à inventer, pas d'identifiant à
    /// stocker — distinguer le téléphone de l'ordinateur suffit.
    ///
    /// Sur iOS, l'appelant passe plutôt `UIDevice.current.model` ; la forme
    /// « agent utilisateur » est conservée pour que les journaux écrits par la
    /// PWA et par l'application se lisent de la même façon.
    static func appareil(_ ua: String?) -> String {
        let s = ua ?? ""
        func a(_ motif: String) -> Bool { s.range(of: motif, options: .caseInsensitive) != nil }
        if a("iPhone") { return "iPhone" }
        if a("iPad") { return "iPad" }
        if a("Android") { return "Android" }
        if a("Macintosh") || a("Mac OS X") { return "Mac" }
        if a("Windows") { return "Windows" }
        if a("Linux") { return "Linux" }
        return "cet appareil"
    }

    // MARK: Valeurs

    /// Ce qu'on inscrit à la place d'une valeur. `null`, `''` et l'absence
    /// décrivent tous la même chose au journal : une case vide.
    static func valeur(_ v: Valeur?) -> String {
        guard let v else { return "" }
        switch v {
        case .nul: return ""
        case .texte(let s):
            if s.isEmpty { return "" }
            return couper(s.trimmingCharacters(in: .whitespacesAndNewlines))
        case .booleen(let b): return b ? "oui" : "non"
        case .nombre(let d): return Valeur.nombreJS(d)
        case .liste, .objet: return couper(v.jsonCanonique)
        }
    }

    /// `slice(0, 60) + '…'` de JavaScript : des unités de code UTF-16.
    private static func couper(_ s: String) -> String {
        let u = Array(s.utf16)
        guard u.count > valMax else { return s }
        return String(decoding: u[0..<valMax], as: UTF16.self) + "…"
    }

    // MARK: Libellé d'un emplacement

    /// `Number(chaîne)` de JavaScript : une chaîne vide vaut 0, pas « invalide ».
    /// `journalMois('')` rend donc « janvier » — fidèle au JavaScript.
    private static func nombreDepuisTexteJS(_ s: String) -> Double? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return 0 }
        return Double(t)
    }

    static func moisDe(_ seg: String?) -> String? {
        guard let seg, let n = nombreDepuisTexteJS(seg),
              n == n.rounded(), n >= 0, n <= 11 else { return nil }
        return mois[Int(n)]
    }

    /// Un chemin de fusion (`p1090␟deductibles␟Électricité␟2`) ne veut rien dire
    /// pour qui consulte le journal. On le traduit en « 1090 › Dépenses ›
    /// Électricité › mars ». Le lexique vient de l'appelant, pour que cette
    /// fonction reste pure et testable.
    static func label(_ chemin: String, _ lexique: LexiqueJournal = LexiqueJournal()) -> String {
        let segs = SyncService.segments(chemin)
        var bouts: [String] = []
        func pousser(_ s: String?) {
            if let s, !s.isEmpty { bouts.append(s) }
        }
        func seg(_ i: Int) -> String? { i < segs.count ? segs[i] : nil }
        func champ(_ i: Int) -> String? {
            guard let s = seg(i) else { return nil }
            return lexique.champs[s] ?? s
        }

        switch segs.first ?? "" {
        case "config":
            pousser("Configuration")
            for i in 1..<Swift.max(segs.count, 1) { pousser(champ(i)) }
        case "uber":
            pousser("Uber")
            pousser(champ(1))
        case "lyft":
            // Lyft est saisi mois par mois : `lyft␟<mois>␟<champ>`.
            pousser("Lyft")
            pousser(moisDe(seg(1)) ?? seg(1))
            pousser(champ(2))
        case "trips":
            pousser("Trajet")
            pousser(seg(1).flatMap { lexique.trajets[$0] } ?? seg(1))
            if let s = seg(2), !s.isEmpty { pousser(lexique.champs[s] ?? s) }
        case "vehicule":
            pousser("Véhicule")
            if segs.count > 2 { for i in 2..<segs.count { pousser(segs[i]) } }
        case "settings":
            pousser("Réglages")
            pousser(champ(1))
        case "recurring":
            pousser("Montant récurrent")
            pousser(seg(1).flatMap { lexique.props[$0] } ?? seg(1))
            if segs.count > 2 { for i in 2..<segs.count { pousser(moisDe(segs[i]) ?? segs[i]) } }
        case "recusIndex":
            pousser("Reçu")
            pousser(segs.dropFirst().joined(separator: " "))
        case "notes":
            pousser("Note")
            if segs.count > 1 { for i in 1..<segs.count { pousser(segs[i]) } }
        case "closed", "closedHistory":
            pousser("Clôture de l'année")
        default:
            if let nom = segs.first.flatMap({ lexique.props[$0] }) {
                // Un immeuble : `p1090␟deductibles␟Électricité␟2`.
                pousser(nom)
                pousser(seg(1).flatMap { sections[$0] } ?? seg(1))
                pousser(seg(2))
                if let s = seg(3) { pousser(moisDe(s) ?? s) }
            } else {
                for s in segs { pousser(moisDe(s) ?? s) }
            }
        }
        return bouts.joined(separator: " › ")
    }

    // MARK: Construction des lignes

    /// `changements` est ce que rendent `SyncService.dater` et
    /// `SyncService.fusionner`. `origine` dit d'où vient le changement.
    static func entrees(_ changements: [Changement], ts: Double, origine: String,
                        appareil: String, prefixe: String? = nil) -> [EntreeJournal] {
        var out: [EntreeJournal] = []
        for c in changements {
            let chemin = prefixe.map { $0 + SyncService.sep + c.chemin } ?? c.chemin

            if c.genre == .suppression {
                // Ce qui a disparu est inscrit MAINTENANT : après coup, un trajet
                // supprimé n'a plus de libellé, et son `id` seul ne dit rien.
                let texte: String
                if let apercu = c.apercu {
                    texte = apercu.map { valeur($0) }.filter { !$0.isEmpty }.joined(separator: ", ")
                } else {
                    texte = valeur(c.avant)
                }
                out.append(EntreeJournal(ts: ts, chemin: chemin, genre: .suppression,
                                         origine: origine, appareil: appareil,
                                         avant: valeur(.texte(texte)), apres: "",
                                         feuilles: (c.feuilles ?? 0) == 0 ? 1 : c.feuilles))
                continue
            }

            let avant = valeur(c.avant)
            let apres = valeur(c.apres)
            // Vide → vide : ouvrir un écran crée des structures vides, et une
            // case qui n'a jamais rien contenu n'a rien à raconter.
            if avant == apres { continue }
            out.append(EntreeJournal(ts: ts, chemin: chemin,
                                     genre: avant.isEmpty ? .ajout : .maj,
                                     origine: origine, appareil: appareil,
                                     avant: avant, apres: apres))
        }
        return out
    }

    /// Une fusion qui apporte des centaines de valeurs tient en une ligne.
    static func entreeLot(_ changements: [Changement], ts: Double, appareil: String,
                          seuil: Int? = nil) -> EntreeJournal? {
        let n = changements.count
        if n <= (seuil ?? seuilLot) { return nil }
        let sup = changements.filter { $0.genre == .suppression }.count
        return EntreeJournal(ts: ts, chemin: "", genre: .lot, origine: "distant",
                             appareil: appareil, avant: "", apres: "",
                             nb: n - sup, supprimes: sup)
    }

    // MARK: Ajout au journal

    /// Rend un NOUVEAU journal : il est en ajout seul, mais deux écritures
    /// rapprochées dans la même cellule se replient l'une sur l'autre, et une
    /// correction annulée (142 → 150 → 142) disparaît au lieu de laisser deux
    /// lignes qui, mises bout à bout, ne disent rien.
    static func ajouter(_ journal: [EntreeJournal], _ nouvelles: [EntreeJournal],
                        max plafond: Int? = nil, fenetre: Double? = nil) -> [EntreeJournal] {
        var j = journal
        let limite = plafond ?? max
        let f = fenetre ?? fenetreFusion

        for e in nouvelles {
            var fusionnee = false

            if e.genre == .suppression {
                // La même suppression peut être décrite deux fois : une fusion
                // arrive en deux temps (transaction, puis refusion par-dessus la
                // saisie en cours). Deux lignes ne diraient pas deux suppressions.
                for i in stride(from: j.count - 1, through: 0, by: -1) {
                    let p = j[i]
                    if p.chemin != e.chemin { continue }
                    if p.genre == .suppression, e.ts - p.ts <= f { fusionnee = true }
                    break
                }
            }

            if e.genre == .maj || e.genre == .ajout {
                for i in stride(from: j.count - 1, through: 0, by: -1) {
                    let p = j[i]
                    if p.chemin != e.chemin { continue }
                    if p.genre != .maj && p.genre != .ajout { break }
                    if p.origine != e.origine || p.appareil != e.appareil { break }
                    if e.ts - p.ts > f { break }
                    if e.apres == p.avant {
                        j.remove(at: i)            // revenu au point de départ
                    } else {
                        var fondue = p
                        fondue.apres = e.apres
                        fondue.ts = e.ts
                        j[i] = fondue
                    }
                    fusionnee = true
                    break
                }
            }

            if !fusionnee { j.append(e) }
        }

        j = triStable(j) { $0.ts < $1.ts }
        return j.count > limite ? Array(j.suffix(limite)) : j
    }

    /// `Array.prototype.sort` est stable depuis ES2019 ; `sorted(by:)` ne l'est
    /// pas. Deux lignes de la même milliseconde doivent garder leur ordre.
    private static func triStable(_ entrees: [EntreeJournal],
                                  _ avant: (EntreeJournal, EntreeJournal) -> Bool) -> [EntreeJournal] {
        entrees.enumerated()
            .sorted { g, d in
                if avant(g.element, d.element) { return true }
                if avant(d.element, g.element) { return false }
                return g.offset < d.offset
            }
            .map(\.element)
    }

    // MARK: Consultation

    /// Le plus récent d'abord : c'est l'ordre dans lequel on consulte un
    /// historique.
    static func filtrer(_ journal: [EntreeJournal], _ filtre: FiltreJournal = FiltreJournal()) -> [EntreeJournal] {
        let texte = filtre.texte.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let gardees = journal.filter { e in
            if let d = filtre.depuis, e.ts < d { return false }
            if let j = filtre.jusqua, e.ts > j { return false }
            if let o = filtre.origine, o != "tout", !o.isEmpty, e.origine != o { return false }
            if !texte.isEmpty {
                let foin = (label(e.chemin, filtre.lexique) + " " + e.avant + " "
                            + e.apres + " " + e.appareil).lowercased()
                if foin.range(of: texte) == nil { return false }
            }
            return true
        }
        return triStable(gardees) { $0.ts > $1.ts }
    }

    /// Regroupement par jour, pour que l'écran n'affiche pas 300 dates
    /// identiques.
    static func grouper(_ entrees: [EntreeJournal]) -> [GroupeJournal] {
        var groupes: [GroupeJournal] = []
        for e in entrees {
            let jour = jourDe(e.ts)
            if let dernier = groupes.last, dernier.jour == jour {
                groupes[groupes.count - 1].entrees.append(e)
            } else {
                groupes.append(GroupeJournal(jour: jour, entrees: [e]))
            }
        }
        return groupes
    }

    /// `new Date(ts).toLocaleDateString('fr-CA')` : AAAA-MM-JJ, dans le fuseau
    /// de l'appareil.
    static func jourDe(_ ts: Double) -> String {
        formatteurJour.string(from: Date(timeIntervalSince1970: ts / 1000))
    }

    private static let formatteurJour: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func jourLibelle(_ jour: String, aujourdhui: Double? = nil) -> String {
        let ref = aujourdhui ?? Date().timeIntervalSince1970 * 1000
        if jour == jourDe(ref) { return "Aujourd'hui" }
        if jour == jourDe(ref - 86_400_000) { return "Hier" }
        let p = jour.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3, p[1] >= 1, p[1] <= 12 else { return jour }
        return "\(p[2]) \(mois[p[1] - 1]) \(p[0])"
    }

    /// Une ligne en une phrase : « Électricité › mars : 142,30 → 150,00 ».
    static func phrase(_ e: EntreeJournal, _ lexique: LexiqueJournal = LexiqueJournal()) -> String {
        if e.genre == .lot {
            let n = e.nb ?? 0
            let p = n > 1 ? "s" : ""
            var s = "\(n) valeur\(p) reçue\(p) de \(e.appareil)"
            if let sup = e.supprimes, sup > 0 {
                s += " · \(sup) suppression\(sup > 1 ? "s" : "")"
            }
            return s
        }
        let ou = label(e.chemin, lexique)
        if e.genre == .suppression {
            let quoi = (e.feuilles ?? 0) > 1 ? "\(e.feuilles!) cases" : ""
            let valeur = e.avant.isEmpty ? "" : (quoi.isEmpty ? " " : " : ") + e.avant
            let detail = quoi.isEmpty && valeur.isEmpty ? "" : " (" + quoi + valeur + ")"
            return ou + " — retiré" + detail
        }
        if e.genre == .ajout { return ou + " : " + e.apres }
        return ou + " : " + (e.avant.isEmpty ? "(vide)" : e.avant)
             + " → " + (e.apres.isEmpty ? "(vide)" : e.apres)
    }

    /// Point d'entrée unique, l'équivalent de `journalConsigner` sans le
    /// stockage : l'appelant fournit le journal courant et range le résultat.
    /// Volontairement incapable de lever — une erreur de journalisation ne doit
    /// pas empêcher une saisie.
    static func consigner(_ journal: [EntreeJournal], changements: [Changement],
                          origine: String, ts: Double, appareil: String,
                          prefixe: String? = nil, seuil: Int? = nil,
                          max plafond: Int? = nil, fenetre: Double? = nil) -> [EntreeJournal] {
        if changements.isEmpty { return journal }
        let lot = origine == "distant" ? entreeLot(changements, ts: ts, appareil: appareil, seuil: seuil) : nil
        let lignes = lot.map { [$0] } ?? entrees(changements, ts: ts, origine: origine,
                                                 appareil: appareil, prefixe: prefixe)
        if lignes.isEmpty { return journal }
        return ajouter(journal, lignes, max: plafond, fenetre: fenetre)
    }
}
