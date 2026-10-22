//  ════════════════════════════════════════════════════════════════════════════
//  ParitySuiteSync.swift — PARITÉ DE LA VAGUE 1 BIS : FUSION ET JOURNAL
//
//  La vague 1 comparait des NOMBRES : deux applications doivent déclarer les
//  mêmes montants. Ici on compare des DÉCISIONS, et l'enjeu est différent.
//
//  `sync.js` ne compare pas des valeurs, il compare des ÉCRITURES : deux
//  appareils tranchent une égalité de dates en comparant `JSON.stringify` de
//  part et d'autre. Si l'iPhone et le navigateur ne tranchent pas pareil, ils ne
//  convergent pas : chacun garde sa version, les renvoie à l'autre, et la
//  boucle ne s'arrête jamais. La parité n'est donc pas un confort — c'est la
//  condition pour qu'un iPhone ait le droit d'écrire dans Firestore.
//
//  D'où la méthode : chaque scénario porte ses ENTRÉES et le résultat MESURÉ sur
//  la PWA, et la comparaison se fait sur l'écriture canonique du résultat, clé
//  par clé, dans l'ordre. Une différence d'ordre de clés n'est pas un détail
//  cosmétique ici : c'est précisément ce que la PWA compare.
//
//  Identifiants : `P##` comme ailleurs (comparaison à la PWA), et quelques
//  `M##`/`J##` qui redisent en Swift un invariant de la suite JavaScript, sous
//  le même identifiant.
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

extension ParitySuite {

    // ══ S. SYNCHRONISATION (SyncService.swift ↔ js/sync.js) ══════════════════

    static func synchronisation(_ r: Rapport, _ ref: Reference) {
        guard let sync = ref.brut["sync"] else {
            r.check("P29", "La référence porte une section « sync »",
                    attendu: "présente", obtenu: "absente",
                    false)
            return
        }

        r.textes("P29", "Les conventions de la fusion sont les mêmes des deux côtés", [
            ("séparateur", sync["separateur"]?.chaine ?? "", SyncService.sep),
            ("ensembles", (sync["ensembles"]?.tableau.map(\.chaine) ?? []).joined(separator: ","),
             SyncService.ensembles.joined(separator: ",")),
            ("hors fusion", (sync["ignores"]?.tableau.map(\.chaine) ?? []).joined(separator: ","),
             SyncService.ignores.joined(separator: ","))
        ])

        // M260 à M264, M290 : la forme des tableaux décide du reste. Un trajet
        // indexé par position au lieu de son id, et deux appareils qui en
        // suppriment chacun un se retrouvent avec les champs mélangés.
        r.textes("P30", "aplatir() rend les mêmes feuilles, dans le même ordre",
                 (sync["aplatir"]?.tableau ?? []).map { cas in
                     let f = SyncService.aplatir(cas["entree"] ?? .nul)
                     var o = Objet()
                     for k in f.cles { o[k] = f[k] }
                     return (cas["nom"]?.chaine ?? "?", canon(cas["attendu"]), Valeur.objet(o).jsonCanonique)
                 })

        // M284 à M286, M291, M294, M295, M297, M300, M301 : le datage, qui donne
        // à chaque case la date dont dépendra tout arbitrage ultérieur.
        r.textes("P31", "dater() date les mêmes cases et raconte les mêmes changements",
                 (sync["datages"]?.tableau ?? []).map { cas in
                     let d = SyncService.dater(MetaSync.depuis(cas["meta"]),
                                               avant: cas["avant"] ?? .nul,
                                               apres: cas["apres"] ?? .nul,
                                               ts: cas["ts"]?.reel ?? 0)
                     let obtenu = Valeur.objet(Objet([
                         ("meta", d.meta.versValeur),
                         ("modifiees", .nombre(Double(d.modifiees))),
                         ("supprimees", .nombre(Double(d.supprimees))),
                         ("changements", listeValeur(d.changements) { $0.versValeur })
                     ]))
                     return (cas["nom"]?.chaine ?? "?", canon(cas["attendu"]), obtenu.jsonCanonique)
                 })

        // M265 à M283, M292, M296, M298, M299, M302 à M304 : la fusion elle-même,
        // vue sous six angles. Six assertions plutôt qu'une : un écart de
        // statistiques et un écart d'état ne veulent pas dire la même chose.
        var etats: [(String, String, String)] = []
        var metas: [(String, String, String)] = []
        var changements: [(String, String, String)] = []
        var conflits: [(String, String, String)] = []
        var statistiques: [(String, String, String)] = []
        var renvois: [(String, String, String)] = []

        for cas in sync["fusions"]?.tableau ?? [] {
            let nom = cas["nom"]?.chaine ?? "?"
            let local = (state: cas["local"]?["state"] ?? .nul, meta: MetaSync.depuis(cas["local"]?["meta"]))
            let distant = (state: cas["distant"]?["state"] ?? .nul, meta: MetaSync.depuis(cas["distant"]?["meta"]))
            let f = SyncService.fusionner(local: local, distant: distant)
            let a = cas["attendu"]

            etats.append((nom, canon(a?["etat"]), f.state.jsonCanonique))
            metas.append((nom, canon(a?["meta"]), f.meta.versValeur.jsonCanonique))
            changements.append((nom, canon(a?["changements"]),
                                listeValeur(f.changements) { $0.versValeur }.jsonCanonique))
            conflits.append((nom, canon(a?["conflits"]),
                             listeValeur(f.conflits) { $0.versValeur }.jsonCanonique))
            statistiques.append((nom,
                                 canon(a?["stats"]) + " · " + (a?["resume"]?.chaine ?? ""),
                                 f.stats.versValeur.jsonCanonique + " · " + SyncService.resume(f.stats)))
            let renvoi = SyncService.doitRenvoyer(fusion: (state: f.state, meta: f.meta), distant: distant)
            renvois.append((nom,
                            (a?["empreinte"]?.chaine ?? "") + " · \(a?["doitRenvoyer"]?.vrai ?? false)",
                            SyncService.empreinteEtat(f.state) + " · \(renvoi)"))
        }

        r.textes("P32", "La fusion rend le même état", etats)
        r.textes("P33", "La fusion rend la même méta (dates et tombales)", metas)
        r.textes("P34", "La fusion raconte les mêmes changements", changements)
        r.textes("P35", "La fusion signale les mêmes désaccords", conflits)
        r.textes("P36", "La fusion compte pareil, et le résume avec les mêmes mots", statistiques)
        r.textes("P37", "Même empreinte, et même décision de renvoyer ou non", renvois)

        // M281 à M283 : l'empreinte, qui empêche l'aller-retour sans fin.
        r.textes("P38", "L'empreinte d'un état est la même",
                 (sync["empreintes"]?.tableau ?? []).map {
                     ($0["nom"]?.chaine ?? "?", $0["attendu"]?.chaine ?? "",
                      SyncService.empreinteEtat($0["entree"]))
                 })
        r.textes("P39", "La décision de renvoyer au cloud est la même",
                 (sync["renvois"]?.tableau ?? []).map { cas in
                     let fusion = (state: cas["fusion"]?["state"] ?? .nul,
                                   meta: MetaSync.depuis(cas["fusion"]?["meta"]))
                     let distant = (state: cas["distant"]?["state"] ?? .nul,
                                    meta: MetaSync.depuis(cas["distant"]?["meta"]))
                     return (cas["nom"]?.chaine ?? "?", "\(cas["attendu"]?.vrai ?? false)",
                             "\(SyncService.doitRenvoyer(fusion: fusion, distant: distant))")
                 })

        // M286, M291, M295, M297 : lire la date d'une case, et la tombale qui la
        // couvre — y compris celle posée sur un ancêtre.
        r.textes("P40", "La date d'écriture et la date de suppression sont les mêmes",
                 (sync["dates"]?.tableau ?? []).flatMap { cas -> [(String, String, String)] in
                     let m = MetaSync.depuis(cas["meta"]) ?? .vide
                     let ch = cas["chemin"]?.chaine ?? ""
                     let nom = cas["nom"]?.chaine ?? "?"
                     return [(nom + " (écriture)", "\(cas["attenduEcriture"]?.reel ?? 0)",
                              "\(SyncService.dateDe(m, ch))"),
                             (nom + " (tombale)", "\(cas["attenduSuppression"]?.reel ?? 0)",
                              "\(SyncService.dateSuppression(m, ch))")]
                 })

        // La règle la plus discrète, et la plus importante : à dates égales, les
        // deux appareils doivent trancher PAREIL. Sinon chacun garde sa version
        // et se la renvoie indéfiniment.
        r.textes("P41", "À dates égales, le départage est identique",
                 (sync["egalites"]?.tableau ?? []).map { cas in
                     let l = cas["local"]?.chaine ?? "", d = cas["distant"]?.chaine ?? ""
                     return ("« \(l) » vs « \(d) »", "\(cas["attendu"]?.vrai ?? false)",
                             "\(SyncService.trancherEgalite(.texte(l), .texte(d)))")
                 })
        // Le tri de l'empreinte : `Array.prototype.sort()`, donc des unités de
        // code UTF-16. Swift, lui, compare des caractères — et les deux ordres ne
        // concordent pas pour les émojis. Un appareil qui trie autrement calcule
        // une autre empreinte du MÊME état, et renvoie son document sans fin.
        r.textes("P42", "Les chemins se trient comme `Array.prototype.sort()`",
                 (sync["tris"]?.tableau ?? []).map { cas in
                     let entree = cas["entree"]?.tableau.map(\.chaine) ?? []
                     return (entree.joined(separator: "|"),
                             (cas["attendu"]?.tableau.map(\.chaine) ?? []).joined(separator: "|"),
                             SyncService.triJS(entree).joined(separator: "|"))
                 })
        r.textes("P43", "Un chemin se relit en texte de la même façon",
                 (sync["cheminsTexte"]?.tableau ?? []).map {
                     ($0["chemin"]?.chaine ?? "", $0["attendu"]?.chaine ?? "",
                      SyncService.cheminTexte($0["chemin"]?.chaine ?? ""))
                 })

        // ── Les invariants de la suite JS, redits en Swift ──
        if let premiere = (sync["fusions"]?.tableau ?? []).first {
            let local = (state: premiere["local"]?["state"] ?? .nul, meta: MetaSync.depuis(premiere["local"]?["meta"]))
            let distant = (state: premiere["distant"]?["state"] ?? .nul, meta: MetaSync.depuis(premiere["distant"]?["meta"]))
            let f1 = SyncService.fusionner(local: local, distant: distant)
            let f2 = SyncService.fusionner(local: (state: f1.state, meta: f1.meta), distant: distant)
            r.eq("M267", "Refusionner ne change plus rien (idempotence)",
                 SyncService.empreinteEtat(f1.state), SyncService.empreinteEtat(f2.state))
        }
        let ordreA = Valeur.objet(Objet([("uber", .objet(Objet([("a", .texte("1")), ("b", .texte("2"))])))]))
        let ordreB = Valeur.objet(Objet([("uber", .objet(Objet([("b", .texte("2")), ("a", .texte("1"))])))]))
        r.eq("M281", "Deux états identiques écrits dans un ordre différent ont la même empreinte",
             SyncService.empreinteEtat(ordreA), SyncService.empreinteEtat(ordreB))
        if let un = fusionNommee(sync, "sans dates, union"),
           let autre = fusionNommee(sync, "sans dates, union, vue de l'autre appareil") {
            r.eq("M299", "Après l'échange, les deux appareils portent la même empreinte",
                 SyncService.empreinteEtat(un.state), SyncService.empreinteEtat(autre.state))
        }
        if let tel = fusionNommee(sync, "douze cases, vu du téléphone"),
           let port = fusionNommee(sync, "douze cases, vu du portable") {
            r.eq("M303", "Les deux appareils convergent sur les douze mêmes cases",
                 SyncService.empreinteEtat(tel.state), SyncService.empreinteEtat(port.state))
        }
    }

    /// Rejoue un scénario de fusion désigné par son nom : les invariants en ont
    /// besoin pour comparer deux scénarios entre eux, et non à la PWA.
    private static func fusionNommee(_ sync: Valeur, _ nom: String) -> ResultatFusion? {
        guard let cas = (sync["fusions"]?.tableau ?? []).first(where: { $0["nom"]?.chaine == nom })
        else { return nil }
        return SyncService.fusionner(
            local: (state: cas["local"]?["state"] ?? .nul, meta: MetaSync.depuis(cas["local"]?["meta"])),
            distant: (state: cas["distant"]?["state"] ?? .nul, meta: MetaSync.depuis(cas["distant"]?["meta"])))
    }

    // ══ J. HISTORIQUE (JournalService.swift ↔ js/journal.js) ═════════════════

    static func journal(_ r: Rapport, _ ref: Reference) {
        guard let jr = ref.brut["journal"] else {
            r.check("P44", "La référence porte une section « journal »",
                    attendu: "présente", obtenu: "absente", false)
            return
        }
        let lex = LexiqueJournal.depuis(jr["lexique"])

        r.textes("P44", "Les réglages du journal sont les mêmes", [
            ("plafond", "\(jr["constantes"]?["max"]?.entier ?? 0)", "\(JournalService.max)"),
            ("fenêtre de repli", "\(jr["constantes"]?["fenetre"]?.reel ?? 0)", "\(JournalService.fenetreFusion)"),
            ("longueur d'une valeur", "\(jr["constantes"]?["valMax"]?.entier ?? 0)", "\(JournalService.valMax)"),
            ("seuil du lot", "\(jr["constantes"]?["seuilLot"]?.entier ?? 0)", "\(JournalService.seuilLot)"),
            ("mois", (jr["mois"]?.tableau.map(\.chaine) ?? []).joined(separator: ","),
             JournalService.mois.joined(separator: ","))
        ])

        // J06 : une ligne qui ne dit pas d'où elle vient ne sert à rien.
        r.textes("P45", "L'appareil est nommé de la même façon",
                 (jr["appareils"]?.tableau ?? []).map {
                     let ua = $0["ua"]?.chaine ?? ""
                     return (ua.isEmpty ? "(vide)" : String(ua.prefix(40)),
                             $0["attendu"]?.chaine ?? "", JournalService.appareil(ua))
                 })

        // J04, J05 : ce qu'on inscrit à la place d'une valeur. La coupure se fait
        // en unités UTF-16, comme `slice()` : un accent compte pour un.
        r.textes("P46", "Une valeur s'inscrit de la même façon",
                 (jr["valeurs"]?.tableau ?? []).enumerated().map { (i, cas) in
                     let entree: Valeur? = (cas["absente"]?.vrai ?? false) ? nil : cas["entree"]
                     return ("cas \(i + 1)", cas["attendu"]?.chaine ?? "", JournalService.valeur(entree))
                 })
        r.textes("P47", "Un segment de mois se lit pareil",
                 (jr["moisDe"]?.tableau ?? []).map { cas in
                     let seg = cas["segment"]?.chaine ?? ""
                     let obtenu = JournalService.moisDe(seg)
                     return ("« \(seg) »", canon(cas["attendu"]),
                             obtenu.map { Valeur.texte($0).jsonCanonique } ?? "null")
                 })

        // J12 à J14, J26 : un chemin de fusion devient un libellé lisible — une
        // branche par forme de chemin, et c'est là que le portage dérape.
        var avecLex: [(String, String, String)] = []
        var sansLex: [(String, String, String)] = []
        for cas in jr["labels"]?.tableau ?? [] {
            let ch = cas["chemin"]?.chaine ?? ""
            let nom = SyncService.cheminTexte(ch)
            avecLex.append((nom, cas["avecLexique"]?.chaine ?? "", JournalService.label(ch, lex)))
            sansLex.append((nom, cas["sansLexique"]?.chaine ?? "", JournalService.label(ch)))
        }
        r.textes("P48", "Un chemin devient le même libellé (avec le lexique)", avecLex)
        r.textes("P49", "Et le même libellé de repli quand le lexique manque", sansLex)

        // J01 à J05, J20 à J22 : les lignes construites sur ce que la
        // synchronisation a mesuré.
        r.textes("P50", "Les mêmes changements donnent les mêmes lignes",
                 (jr["entrees"]?.tableau ?? []).map { cas in
                     let ch = (cas["changements"]?.tableau ?? []).map { Changement.depuis($0) }
                     let obtenu = JournalService.entrees(ch, ts: cas["ts"]?.reel ?? 0,
                                                         origine: cas["origine"]?.chaine ?? "",
                                                         appareil: cas["appareil"]?.chaine ?? "",
                                                         prefixe: cas["prefixe"]?.commeTexte)
                     return (cas["nom"]?.chaine ?? "?", canon(cas["attendu"]),
                             listeValeur(obtenu) { $0.versValeur }.jsonCanonique)
                 })

        // J23, J24 : le premier raccordement d'un appareil tient en une ligne.
        r.textes("P51", "La ligne de synthèse d'une fusion massive est la même",
                 (jr["lots"]?.tableau ?? []).map { cas in
                     let ch = (cas["changements"]?.tableau ?? []).map { Changement.depuis($0) }
                     let obtenu = JournalService.entreeLot(ch, ts: cas["ts"]?.reel ?? 0,
                                                           appareil: cas["appareil"]?.chaine ?? "",
                                                           seuil: cas["seuil"]?.entier)
                     return (cas["nom"]?.chaine ?? "?", canon(cas["attendu"]),
                             obtenu.map { $0.versValeur.jsonCanonique } ?? "null")
                 })

        // J07 à J11, J25 : le repli des écritures rapprochées, et le plafond.
        r.textes("P52", "Le repli et le plafond donnent le même journal",
                 (jr["ajouts"]?.tableau ?? []).map { cas in
                     let journal = (cas["journal"]?.tableau ?? []).map { EntreeJournal.depuis($0) }
                     let nouvelles = (cas["nouvelles"]?.tableau ?? []).map { EntreeJournal.depuis($0) }
                     let obtenu = JournalService.ajouter(journal, nouvelles,
                                                         max: cas["max"]?.entier,
                                                         fenetre: cas["fenetre"]?.commeNombre)
                     return (cas["nom"]?.chaine ?? "?", canon(cas["attendu"]),
                             listeValeur(obtenu) { $0.versValeur }.jsonCanonique)
                 })

        // J16 à J19 : la consultation — le plus récent d'abord, filtré, groupé.
        let consult = (jr["consultation"]?.tableau ?? []).map { EntreeJournal.depuis($0) }
        r.textes("P53", "Les filtres de consultation retiennent les mêmes lignes",
                 (jr["filtres"]?.tableau ?? []).map { cas in
                     let f = cas["filtre"]
                     let filtre = FiltreJournal(depuis: f?["depuis"]?.commeNombre,
                                                jusqua: f?["jusqua"]?.commeNombre,
                                                origine: f?["origine"]?.commeTexte,
                                                texte: f?["texte"]?.chaine ?? "",
                                                lexique: (f?["avecLexique"]?.vrai ?? false) ? lex : LexiqueJournal())
                     return (cas["nom"]?.chaine ?? "?", canon(cas["attendu"]),
                             listeValeur(JournalService.filtrer(consult, filtre)) { $0.versValeur }.jsonCanonique)
                 })
        r.textes("P54", "Les lignes sont groupées par les mêmes jours",
                 zip(jr["groupes"]?.tableau ?? [],
                     JournalService.grouper(JournalService.filtrer(consult))).map { (attendu, obtenu) in
                     (attendu["jour"]?.chaine ?? "?",
                      (attendu["jour"]?.chaine ?? "") + " : "
                        + (attendu["ts"]?.tableau.map { Valeur.nombreJS($0.reel) } ?? []).joined(separator: ","),
                      obtenu.jour + " : " + obtenu.entrees.map { Valeur.nombreJS($0.ts) }.joined(separator: ","))
                 } + [("nombre de groupes", "\((jr["groupes"]?.tableau ?? []).count)",
                       "\(JournalService.grouper(JournalService.filtrer(consult)).count)")])
        r.textes("P55", "Aujourd'hui, hier et les autres jours se nomment pareil",
                 (jr["jours"]?.tableau ?? []).map { cas in
                     let jour = cas["jour"]?.chaine ?? ""
                     return (jour, cas["attendu"]?.chaine ?? "",
                             JournalService.jourLibelle(jour, aujourdhui: cas["aujourdhui"]?.reel))
                 })

        // J15, J26 : une ligne se lit d'une phrase.
        var phrasesLex: [(String, String, String)] = []
        var phrasesNues: [(String, String, String)] = []
        for cas in jr["phrases"]?.tableau ?? [] {
            let e = EntreeJournal.depuis(cas["entree"] ?? .nul)
            let nom = e.genre.rawValue + " " + SyncService.cheminTexte(e.chemin)
            phrasesLex.append((nom, cas["avecLexique"]?.chaine ?? "", JournalService.phrase(e, lex)))
            phrasesNues.append((nom, cas["sansLexique"]?.chaine ?? "", JournalService.phrase(e)))
        }
        r.textes("P56", "Chaque ligne se lit de la même phrase", phrasesLex)
        r.textes("P57", "Et de la même phrase sans lexique", phrasesNues)

        // ── Les invariants de la suite JS, redits en Swift ──
        let cellule = SyncService.chemin(["pA", "deductibles", "Électricité", "2"])
        func saisie(_ avant: String, _ apres: String, _ ts: Double) -> [EntreeJournal] {
            JournalService.entrees([Changement(chemin: cellule, genre: .maj,
                                               avant: .texte(avant), apres: .texte(apres),
                                               apercu: nil, feuilles: nil)],
                                   ts: ts, origine: "saisie", appareil: "Mac")
        }
        let replie = JournalService.ajouter(
            JournalService.ajouter(JournalService.ajouter([], saisie("", "142", 1000)),
                                   saisie("142", "1420", 2000)),
            saisie("1420", "142.30", 3000))
        r.eq("J07", "Trois corrections rapprochées tiennent sur une seule ligne", 1, Double(replie.count))
        r.eq("J09", "Une correction annulée ne laisse rien du tout", 0,
             Double(JournalService.ajouter(replie, saisie("142.30", "", 4000)).count))
        let dix = (0..<10).map { i in
            EntreeJournal(ts: 1000 + Double(i), chemin: "c\(i)", genre: .ajout,
                          origine: "saisie", appareil: "Mac", avant: "", apres: "v")
        }
        r.eq("J11", "Le journal est plafonné : les plus vieilles lignes tombent",
             "c8,c9", JournalService.ajouter([], dix, max: 2).map(\.chemin).joined(separator: ","))
        func suppression(_ ts: Double) -> [EntreeJournal] {
            JournalService.entrees([Changement(chemin: SyncService.chemin(["trips", "t9"]),
                                               genre: .suppression, avant: nil, apres: nil,
                                               apercu: nil, feuilles: 3)],
                                   ts: ts, origine: "distant", appareil: "iPhone")
        }
        r.eq("J25", "La même suppression décrite deux fois ne fait qu'une ligne", 1,
             Double(JournalService.ajouter(JournalService.ajouter([], suppression(1000)),
                                           suppression(1200)).count))
    }
}
