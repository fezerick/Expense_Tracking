import SwiftUI
import SwiftData

/// Vue racine : TabView à 5 onglets + sélecteur d'année fiscale + accès aux réglages.
struct RootView: View {
    let cloudKitEnabled: Bool

    @Environment(\.modelContext) private var context
    @AppStorage("selectedYear") private var selectedYear = AppConfig.defaultYear
    @State private var showSettings = false
    @State private var showNewYearAlert = false
    @State private var newYearText = ""

    @Query(sort: \FiscalYear.year) private var fiscalYears: [FiscalYear]

    var body: some View {
        TabView {
            tabWrapper { HomeView(year: selectedYear) }
                .tabItem { Label("Accueil", systemImage: "house.fill") }

            tabWrapper { TripsView(year: selectedYear) }
                .tabItem { Label("Trajets", systemImage: "car.fill") }

            tabWrapper { PropertiesView(year: selectedYear) }
                .tabItem { Label("Logements", systemImage: "building.2.fill") }

            tabWrapper { RideshareView(year: selectedYear) }
                .tabItem { Label("Rideshare", systemImage: "car.2.fill") }

            tabWrapper { SummaryView(year: selectedYear) }
                .tabItem { Label("Sommaire", systemImage: "chart.bar.fill") }
        }
        .tint(AppConfig.Palette.blue)
        .sheet(isPresented: $showSettings) {
            SettingsView(year: selectedYear, cloudKitEnabled: cloudKitEnabled)
        }
        .alert("Nouvelle année fiscale", isPresented: $showNewYearAlert) {
            TextField("Année (ex. 2027)", text: $newYearText)
                .keyboardType(.numberPad)
            Button("Créer") { createYear() }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("L'année démarre vide, avec la structure de catégories et la checklist par défaut.")
        }
        .onAppear {
            DataService(context: context, year: selectedYear).ensureFiscalYear()
            #if DEBUG
            DebugPDFSmokeTest.runIfRequested(context: context)
            #endif
        }
    }

    private func tabWrapper<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        NavigationStack {
            content()
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { yearMenu }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape.fill")
                        }
                    }
                }
                .toolbarBackground(AppConfig.Palette.dark, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }

    private var yearMenu: some View {
        Menu {
            ForEach(availableYears, id: \.self) { year in
                Button {
                    selectedYear = year
                    DataService(context: context, year: year).ensureFiscalYear()
                } label: {
                    if year == selectedYear {
                        Label(String(year), systemImage: "checkmark")
                    } else {
                        Text(String(year))
                    }
                }
            }
            Divider()
            Button {
                newYearText = String((availableYears.max() ?? AppConfig.defaultYear) + 1)
                showNewYearAlert = true
            } label: {
                Label("Nouvelle année…", systemImage: "plus")
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "calendar")
                Text(String(selectedYear))
                    .bold()
            }
            .foregroundStyle(.white)
        }
    }

    private var availableYears: [Int] {
        let years = Set(fiscalYears.map(\.year) + [selectedYear])
        return years.sorted()
    }

    private func createYear() {
        guard let year = Int(newYearText), (2000...2100).contains(year) else { return }
        DataService(context: context, year: year).ensureFiscalYear()
        selectedYear = year
    }
}
