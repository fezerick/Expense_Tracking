//  ════════════════════════════════════════════════════════════════════════════
//  main.swift — LANCEUR EN LIGNE DE COMMANDE DE LA SUITE DE PARITÉ
//
//  Pourquoi un exécutable plutôt qu'un XCTestCase : le projet iOS n'a pas encore
//  de cible de tests, et `xcodebuild` échoue sur cette machine pour une raison
//  étrangère au code Swift (le catalogue d'actifs demande un runtime iOS 26,
//  voir ios_2026/README.md). Le Core, lui, ne dépend que de Foundation — ni
//  UIKit, ni SwiftData, ni état d'application. Il compile donc pour macOS, et la
//  parité se vérifie en deux secondes avec `scripts/ios-parity.sh`.
//
//  Le jour où une cible de tests existera, CoreParityTests.swift appellera la
//  MÊME `ParitySuite.executer()` : rien à réécrire, et aucune chance que les
//  deux chemins divergent.
//
//  Usage :
//    swift ... && ./parite [chemin/vers/parite-vague1.json]
//    scripts/ios-parity.sh        → compile, exécute, et rend un code de sortie
//  ════════════════════════════════════════════════════════════════════════════

import Foundation

/// Les écarts partent sur la sortie d'erreur : un script d'intégration peut
/// garder le rapport et ne remonter que ce qui a cassé.
func erreur(_ texte: String) {
    FileHandle.standardError.write((texte + "\n").data(using: .utf8)!)
}

let argv = Array(CommandLine.arguments.dropFirst())
let cheminDefaut = FileManager.default.currentDirectoryPath
    + "/ios_2026/Tests/Parity/parite-vague1.json"
let chemin = argv.first ?? cheminDefaut

guard FileManager.default.fileExists(atPath: chemin) else {
    erreur("""
        ✖ Référence absente : \(chemin)
          Relevez-la sur la PWA :  npm run parite:export
        """)
    exit(2)
}

let reference: Reference
do { reference = try Reference.charger(chemin) }
catch {
    erreur("✖ Référence illisible : \(error)")
    exit(2)
}

let rapport = ParitySuite.executer(reference)
let echecs = rapport.assertions.filter { !$0.ok }

print("")
print("── Parité Swift ↔ PWA · référence du \(reference.aujourdhui) · année \(reference.annee) "
      + String(repeating: "─", count: 8))
print("  \(rapport.assertions.count - echecs.count)/\(rapport.assertions.count) assertions")

for e in echecs {
    print("  ✖ \(e.id)  \(e.titre)")
    print("       attendu (PWA) : \(e.attendu)")
    print("       obtenu (Swift) : \(e.obtenu)")
}

print("")
if echecs.isEmpty {
    print("✔ Le Core Swift rend les mêmes nombres que la PWA.")
    exit(0)
}
print("✖ \(echecs.count) écart(s) de parité.")
exit(1)
