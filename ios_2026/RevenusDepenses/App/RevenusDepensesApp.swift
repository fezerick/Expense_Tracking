import SwiftUI
import SwiftData

@main
struct RevenusDepensesApp: App {

    let container: ModelContainer
    /// Vrai si le container a pu être créé avec la synchronisation CloudKit.
    let cloudKitEnabled: Bool

    init() {
        let schema = Schema([
            FiscalYear.self,
            Trip.self,
            EntryAmount.self,
            UberValue.self,
            LyftMonth.self,
            VehicleExpense.self,
            ChecklistItem.self
        ])

        // 1) Essai avec CloudKit, seulement si AppConfig.iCloudCapabilityEnabled est activé
        //    (à mettre à true une fois la capability iCloud réactivée dans Xcode avec un
        //    compte développeur payant). Évite les tentatives/erreurs bruyantes sans compte.
        // 2) Repli sur un stockage local seul : l'app reste 100 % fonctionnelle sans compte.
        if AppConfig.iCloudCapabilityEnabled,
           let cloudContainer = try? ModelContainer(
               for: schema,
               configurations: [ModelConfiguration(schema: schema, cloudKitDatabase: .private(AppConfig.cloudKitContainerID))]
           ) {
            container = cloudContainer
            cloudKitEnabled = true
        } else {
            let localConfig = ModelConfiguration(schema: schema, cloudKitDatabase: .none)
            do {
                container = try ModelContainer(for: schema, configurations: [localConfig])
            } catch {
                fatalError("Impossible d'initialiser la base de données locale : \(error)")
            }
            cloudKitEnabled = false
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView(cloudKitEnabled: cloudKitEnabled)
                .environment(\.locale, AppConfig.locale)
        }
        .modelContainer(container)
    }
}
