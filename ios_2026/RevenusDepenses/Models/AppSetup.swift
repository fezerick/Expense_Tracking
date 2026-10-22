import SwiftUI

/// Préférences de configuration de l'app, définies par l'assistant de démarrage :
/// modules affichés (trajets / logements / rideshare), immeubles suivis,
/// noms d'affichage personnalisés et apparence (clair / sombre).
///
/// Stockées dans UserDefaults — séparées des données fiscales SwiftData :
/// changer un module ou relancer l'assistant ne touche jamais aux montants saisis,
/// il ne fait que masquer/afficher des sections.
enum AppSetup {

    // MARK: - Clés UserDefaults (partagées avec les @AppStorage des vues)

    enum Keys {
        static let onboardingDone = "setup.onboardingDone"
        static let moduleTrips = "setup.module.trips"
        static let moduleProperties = "setup.module.properties"
        static let moduleRideshare = "setup.module.rideshare"
        static let appearance = "setup.appearance"
        static let verrouActif = "setup.verrou.actif"
        static let verrouDelaiMinutes = "setup.verrou.delaiMinutes"
    }

    private static var defaults: UserDefaults { .standard }

    /// Bool avec défaut à true : un utilisateur existant qui n'a pas encore
    /// répondu à l'assistant garde tous ses modules visibles.
    private static func bool(_ key: String) -> Bool {
        defaults.object(forKey: key) as? Bool ?? true
    }

    // MARK: - Modules

    static var onboardingDone: Bool {
        get { defaults.bool(forKey: Keys.onboardingDone) }
        set { defaults.set(newValue, forKey: Keys.onboardingDone) }
    }

    static var moduleTrips: Bool {
        get { bool(Keys.moduleTrips) }
        set { defaults.set(newValue, forKey: Keys.moduleTrips) }
    }

    static var moduleProperties: Bool {
        get { bool(Keys.moduleProperties) }
        set { defaults.set(newValue, forKey: Keys.moduleProperties) }
    }

    static var moduleRideshare: Bool {
        get { bool(Keys.moduleRideshare) }
        set { defaults.set(newValue, forKey: Keys.moduleRideshare) }
    }

    // MARK: - Verrou de l'application (chantier C.4)

    /// Défaut : faux. Contrairement aux modules, on ne devine pas qu'un
    /// utilisateur veut un verrou — et `bool(_:)` ci-dessus, qui vaut vrai par
    /// défaut, enfermerait dehors tout le monde à la mise à jour.
    static var verrouActif: Bool {
        get { defaults.bool(forKey: Keys.verrouActif) }
        set { defaults.set(newValue, forKey: Keys.verrouActif) }
    }

    /// Délai de grâce avant que le verrou se repose, en minutes. 0 = immédiat.
    static var verrouDelaiMinutes: Int {
        get { defaults.integer(forKey: Keys.verrouDelaiMinutes) }
        set { defaults.set(newValue, forKey: Keys.verrouDelaiMinutes) }
    }

    /// Le même délai en secondes, forme attendue par `BiometricLock`.
    static var verrouDelai: TimeInterval { TimeInterval(verrouDelaiMinutes * 60) }

    /// Les choix offerts dans les réglages, du plus strict au plus souple.
    static let verrouDelaisOfferts: [Int] = [0, 1, 5, 15, 60]

    static func verrouDelaiLabel(_ minutes: Int) -> String {
        switch minutes {
        case ..<1: "Immédiatement"
        case 1: "Après 1 minute"
        case 60: "Après 1 heure"
        default: "Après \(minutes) minutes"
        }
    }

    // MARK: - Apparence

    enum Appearance: String, CaseIterable, Identifiable {
        case system, light, dark

        var id: String { rawValue }

        var label: String {
            switch self {
            case .system: "Automatique"
            case .light: "Clair"
            case .dark: "Sombre"
            }
        }

        var icon: String {
            switch self {
            case .system: "circle.lefthalf.filled"
            case .light: "sun.max.fill"
            case .dark: "moon.fill"
            }
        }

        /// nil = suivre le réglage système.
        var colorScheme: ColorScheme? {
            switch self {
            case .system: nil
            case .light: .light
            case .dark: .dark
            }
        }
    }
}

/// Applique l'apparence choisie (clair / sombre / automatique) à une hiérarchie de vues.
/// À poser sur la racine ET sur chaque sheet/fullScreenCover (présentations séparées).
struct AppearanceModifier: ViewModifier {
    @AppStorage(AppSetup.Keys.appearance) private var appearanceRaw = AppSetup.Appearance.system.rawValue

    func body(content: Content) -> some View {
        content.preferredColorScheme(
            (AppSetup.Appearance(rawValue: appearanceRaw) ?? .system).colorScheme
        )
    }
}

extension View {
    func appliesAppearance() -> some View {
        modifier(AppearanceModifier())
    }
}
