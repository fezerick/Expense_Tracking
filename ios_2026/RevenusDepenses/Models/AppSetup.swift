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
        static func propertyEnabled(_ id: String) -> String { "setup.prop.\(id).enabled" }
        static func propertyName(_ id: String) -> String { "setup.prop.\(id).name" }
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

    // MARK: - Immeubles

    static func propertyEnabled(_ id: String) -> Bool {
        bool(Keys.propertyEnabled(id))
    }

    static func setPropertyEnabled(_ id: String, _ enabled: Bool) {
        defaults.set(enabled, forKey: Keys.propertyEnabled(id))
    }

    /// Immeubles suivis, dans l'ordre de référence. Si le module Logements est
    /// désactivé, la liste est vide (rien à afficher ni à exporter).
    static var activeProperties: [AppConfig.PropertyDef] {
        guard moduleProperties else { return [] }
        return AppConfig.properties.filter { propertyEnabled($0.id) }
    }

    /// Nom d'affichage : personnalisé si défini dans l'assistant, sinon le nom de référence.
    static func displayName(_ id: String) -> String {
        let custom = defaults.string(forKey: Keys.propertyName(id))?
            .trimmingCharacters(in: .whitespaces) ?? ""
        return custom.isEmpty ? (AppConfig.property(id: id)?.name ?? id) : custom
    }

    static func setDisplayName(_ id: String, _ name: String) {
        defaults.set(name.trimmingCharacters(in: .whitespaces), forKey: Keys.propertyName(id))
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
