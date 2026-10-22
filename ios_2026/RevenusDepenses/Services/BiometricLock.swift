import Foundation
import LocalAuthentication

// ════════════════════════════════════════════════════════════════════════════
//  BiometricLock.swift — VERROU À L'OUVERTURE (chantier C.4)
//
//  Ce que ce verrou fait, et il faut le dire exactement : il empêche de LIRE
//  l'application sur un appareil déjà déverrouillé. Revenus, adresses, noms de
//  copropriétaires et photos de factures ne s'affichent plus parce qu'on a pris
//  le téléphone sur la table.
//
//  Ce qu'il ne fait pas : chiffrer. Les données restent dans le magasin
//  SwiftData de l'app, protégées par le chiffrement de l'appareil et par le bac
//  à sable iOS — ni plus, ni moins qu'avant. Un verrou applicatif qui
//  prétendrait chiffrer serait un mensonge : la clé devrait vivre quelque part,
//  et un code à six chiffres ne résiste pas à une attaque hors ligne.
//
//  Choix de politique : `.deviceOwnerAuthentication`, et non
//  `.deviceOwnerAuthenticationWithBiometrics`. La première retombe sur le code
//  de l'appareil quand Face ID échoue ou n'est pas configuré ; la seconde
//  enferme dehors, et le pire moment pour découvrir cela est la veille du
//  15 mars.
// ════════════════════════════════════════════════════════════════════════════

@MainActor
@Observable
final class BiometricLock {

    enum Etat {
        /// L'application est consultable.
        case ouvert
        /// Le verrou est posé : l'écran de déverrouillage couvre tout.
        case ferme
        /// Face ID / code de l'appareil en cours d'évaluation.
        case enCours
    }

    /// Ce que l'appareil sait faire, tel que l'écran de réglages doit le dire.
    enum Disponibilite: Equatable {
        case faceID
        case touchID
        case opticID
        /// Aucune biométrie configurée, mais un code d'appareil existe.
        case codeAppareil
        /// Ni biométrie ni code : le verrou ne peut pas être activé, et la
        /// raison doit être affichée plutôt que devinée.
        case aucune(String)

        var libelle: String {
            switch self {
            case .faceID: "Face ID"
            case .touchID: "Touch ID"
            case .opticID: "Optic ID"
            case .codeAppareil: "le code de l'appareil"
            case .aucune: "aucune authentification"
            }
        }

        var icone: String {
            switch self {
            case .faceID: "faceid"
            case .touchID: "touchid"
            case .opticID: "opticid"
            case .codeAppareil: "lock.fill"
            case .aucune: "exclamationmark.triangle.fill"
            }
        }

        var utilisable: Bool {
            if case .aucune = self { return false }
            return true
        }
    }

    private(set) var etat: Etat
    /// Message du dernier échec, affiché sur l'écran de déverrouillage.
    private(set) var dernierEchec: String?

    /// Date du dernier moment où l'application était au premier plan. `nil`
    /// avant le premier passage en arrière-plan.
    private var dernierActif: Date?

    init() {
        // Au démarrage, le verrou est posé s'il est actif : l'application ne
        // doit jamais s'ouvrir sur les données puis se couvrir après coup.
        etat = AppSetup.verrouActif ? .ferme : .ouvert
    }

    // MARK: - Ce que l'appareil sait faire

    static func disponibilite() -> Disponibilite {
        let contexte = LAContext()
        var erreur: NSError?
        guard contexte.canEvaluatePolicy(.deviceOwnerAuthentication, error: &erreur) else {
            return .aucune(messageIndisponible(erreur))
        }
        switch contexte.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        case .opticID: return .opticID
        default: return .codeAppareil
        }
    }

    private static func messageIndisponible(_ erreur: NSError?) -> String {
        guard let code = erreur.map({ LAError.Code(rawValue: $0.code) }) ?? nil else {
            return "Authentification indisponible sur cet appareil."
        }
        switch code {
        case .passcodeNotSet:
            return "Aucun code d'appareil n'est défini. Réglages → Face ID et code."
        case .biometryNotEnrolled:
            return "Aucune empreinte ni visage enregistré, et aucun code d'appareil."
        case .biometryNotAvailable:
            return "La biométrie est désactivée pour cette app. Réglages → Face ID et code."
        case .biometryLockout:
            return "Trop de tentatives : saisissez le code de l'appareil pour réactiver."
        default:
            return "Authentification indisponible sur cet appareil."
        }
    }

    // MARK: - Poser et lever le verrou

    /// Appelé au retour au premier plan. Le verrou se repose seulement si le
    /// délai choisi est écoulé — sans quoi répondre à un message rendrait
    /// l'application inutilisable.
    func revenuAuPremierPlan(maintenant: Date = Date()) {
        guard AppSetup.verrouActif else { etat = .ouvert; return }
        if Self.doitVerrouiller(dernierActif: dernierActif,
                                maintenant: maintenant,
                                delai: AppSetup.verrouDelai) {
            etat = .ferme
        }
        dernierActif = nil
    }

    /// Appelé dès que l'application quitte le premier plan, y compris pour
    /// `.inactive`. C'est volontaire : iOS photographie l'écran pour le
    /// sélecteur d'applications à ce moment-là, et la photo doit montrer
    /// l'écran de déverrouillage, pas les montants.
    ///
    /// L'exception `.enCours` est indispensable : la feuille Face ID rend
    /// elle-même l'application inactive. Sans cette garde, demander le
    /// déverrouillage reposerait le verrou, et l'app tournerait en rond.
    func quitteLePremierPlan(maintenant: Date = Date()) {
        guard AppSetup.verrouActif, etat != .enCours else { return }
        if dernierActif == nil { dernierActif = maintenant }
        if AppSetup.verrouDelai <= 0 { etat = .ferme }
    }

    /// Pose le verrou tout de suite, à la demande (bouton des réglages).
    func verrouiller() {
        guard AppSetup.verrouActif else { return }
        dernierActif = nil
        dernierEchec = nil
        etat = .ferme
    }

    /// Lève le verrou après authentification de l'utilisateur de l'appareil.
    func deverrouiller(raison: String = "Afficher vos revenus et dépenses") async {
        guard etat != .enCours else { return }
        // L'état d'avant, pour y revenir en cas d'échec : une authentification
        // annulée depuis les réglages ne doit pas fermer la porte derrière
        // quelqu'un qui était déjà entré.
        let avant = etat
        etat = .enCours
        dernierEchec = nil
        let contexte = LAContext()
        contexte.localizedCancelTitle = "Annuler"
        do {
            let ok = try await contexte.evaluatePolicy(.deviceOwnerAuthentication,
                                                       localizedReason: raison)
            etat = ok ? .ouvert : avant
            if !ok { dernierEchec = "Authentification refusée." }
        } catch {
            etat = avant
            dernierEchec = Self.messageEchec(error)
        }
    }

    /// Désactive le verrou — après authentification réussie seulement, sinon
    /// n'importe qui pourrait le retirer depuis les réglages.
    func desactiverApresAuthentification() async -> Bool {
        await deverrouiller(raison: "Désactiver le verrou de l'application")
        guard etat == .ouvert else { return false }
        AppSetup.verrouActif = false
        return true
    }

    private static func messageEchec(_ error: Error) -> String {
        guard let code = (error as? LAError)?.code else {
            return "Authentification impossible."
        }
        switch code {
        case .userCancel, .appCancel, .systemCancel:
            // Une annulation n'est pas un échec : rien à signaler.
            return ""
        case .userFallback:
            return ""
        case .authenticationFailed:
            return "Visage ou empreinte non reconnu."
        case .biometryLockout:
            return "Trop de tentatives. Saisissez le code de l'appareil."
        case .passcodeNotSet:
            return "Aucun code d'appareil n'est défini."
        default:
            return "Authentification impossible."
        }
    }

    // MARK: - La décision de reposer le verrou, isolée et testable

    /// Sans `LAContext` ni `UIApplication` : c'est la seule logique du verrou
    /// qui pourrait être fausse sans qu'on le voie, donc elle est à part.
    ///
    /// - `dernierActif == nil` : l'app n'a pas quitté le premier plan, rien à
    ///   reverrouiller.
    /// - `delai <= 0` : verrou immédiat, déjà posé au départ.
    static func doitVerrouiller(dernierActif: Date?,
                                maintenant: Date,
                                delai: TimeInterval) -> Bool {
        guard let dernierActif else { return false }
        if delai <= 0 { return true }
        return maintenant.timeIntervalSince(dernierActif) >= delai
    }
}
