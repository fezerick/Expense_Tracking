//  ════════════════════════════════════════════════════════════════════════════
//  CoreParityTests.swift — LA MÊME SUITE DE PARITÉ, DANS XCODE
//
//  Ce fichier n'est PAS compilé aujourd'hui : le projet n'a pas encore de cible
//  de tests (voir ios_2026/README.md). Il est écrit maintenant pour une raison
//  simple — le jour où la cible existera, la parité ne devra pas être réécrite,
//  et surtout pas réécrite DIFFÉREMMENT. Il appelle donc la même
//  `ParitySuite.executer()` que `scripts/ios-parity.sh`.
//
//  Pour l'activer, dans Xcode :
//    1. File ▸ New ▸ Target ▸ Unit Testing Bundle, nommée « CoreTests ».
//    2. Y ajouter TOUS les fichiers de ios_2026/Tests/Parity/ — ParityReference,
//       ParityCodec, ParitySuite, ParitySuiteSync — mais PAS main.swift : un
//       `main` dans une cible de tests ne compile pas.
//    3. Y ajouter parite-vague1.json comme ressource (Copy Bundle Resources).
//    4. Les fichiers du Core sont déjà dans la cible de l'app via le groupe
//       synchronisé ; cocher « CoreTests » dans leur appartenance de cible.
//
//  Le JSON est cherché d'abord dans le bundle de tests, puis à côté de ce
//  fichier source : un `swift test` lancé hors Xcode trouve ainsi la référence
//  sans qu'on ait à la copier.
//  ════════════════════════════════════════════════════════════════════════════

#if canImport(XCTest)
import XCTest

final class CoreParityTests: XCTestCase {

    /// La référence relevée sur la PWA. Son absence est un échec et non un test
    /// ignoré : une parité qu'on ne peut pas vérifier ne doit pas passer pour
    /// vérifiée.
    private func chargerReference() throws -> Reference {
        if let url = Bundle(for: Self.self).url(forResource: "parite-vague1", withExtension: "json") {
            return try Reference.charger(url.path)
        }
        let voisin = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()      // XCTest/
            .deletingLastPathComponent()      // Tests/
            .appendingPathComponent("Parity/parite-vague1.json")
        if FileManager.default.fileExists(atPath: voisin.path) {
            return try Reference.charger(voisin.path)
        }
        XCTFail("Référence de parité absente. Relevez-la sur la PWA : npm run parite:export")
        throw CocoaError(.fileNoSuchFile)
    }

    /// Une méthode de test par assertion serait plus joli dans le rapport
    /// d'Xcode, mais la liste des assertions est décidée à l'exécution par la
    /// référence : on signale donc chaque écart individuellement, puis on
    /// résume. Un seul écart fait échouer le test.
    func testCoreRendLesMemesNombresQueLaPWA() throws {
        let reference = try chargerReference()
        let rapport = ParitySuite.executer(reference)

        for a in rapport.assertions where !a.ok {
            XCTFail("""
                \(a.id) — \(a.titre)
                  attendu (PWA)  : \(a.attendu)
                  obtenu (Swift) : \(a.obtenu)
                """)
        }

        let echecs = rapport.assertions.filter { !$0.ok }.count
        XCTAssertEqual(echecs, 0,
                       "\(echecs) écart(s) sur \(rapport.assertions.count) assertions de parité")
        XCTAssertGreaterThan(rapport.assertions.count, 90,
                             "La suite de parité s'est arrêtée trop tôt : la référence est-elle tronquée ?")
    }
}
#endif
