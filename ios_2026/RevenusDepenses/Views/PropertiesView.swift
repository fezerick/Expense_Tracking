import SwiftUI
import SwiftData
import PhotosUI

/// Onglet Logements : saisie mensuelle par catégorie (revenus / déductibles / capital),
/// vue annuelle, notes + reçus photo, montants récurrents.
struct PropertiesView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Query private var allEntries: [EntryAmount]   // déclenche le rafraîchissement
    @Query private var allTrips: [Trip]            // pour "Frais de déplacement" auto

    @State private var propertyId = "p1090"
    @State private var month = Date.currentMonthIndex()
    @State private var showAnnual = false
    @State private var showRecurring = false
    @State private var detailEntry: EntryAmount?

    private var data: DataService { DataService(context: context, year: year) }
    private var property: AppConfig.PropertyDef { AppConfig.property(id: propertyId) ?? AppConfig.p1090 }

    var body: some View {
        List {
            Section {
                Picker("Propriété", selection: $propertyId) {
                    Text(AppConfig.p1090.shortName + " Oscar Benoît").tag("p1090")
                    Text(AppConfig.p470.shortName + " Gélinas").tag("p470")
                }
                .pickerStyle(.segmented)

                Picker("Vue", selection: $showAnnual) {
                    Text("Vue mensuelle").tag(false)
                    Text("Vue annuelle").tag(true)
                }
                .pickerStyle(.segmented)

                if !showAnnual {
                    MonthNavigator(month: $month)
                }
            }

            if !showAnnual {
                Section {
                    Button {
                        showRecurring = true
                    } label: {
                        Label("Montants récurrents", systemImage: "arrow.triangle.2.circlepath")
                    }
                }
            }

            if showAnnual {
                annualSections
            } else {
                monthlySections
            }
        }
        .navigationTitle(property.name)
        .sheet(isPresented: $showRecurring) {
            RecurringAmountsSheet(year: year, propertyId: propertyId, currentMonth: month)
        }
        .sheet(item: $detailEntry) { entry in
            EntryDetailSheet(entry: entry)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: - Vue mensuelle

    @ViewBuilder
    private var monthlySections: some View {
        entrySection(title: "Revenus de location", section: .revenue,
                     categories: property.revenueCategories, color: AppConfig.Palette.green)
        entrySection(title: "Dépenses déductibles", section: .deductible,
                     categories: property.deductibleCategories, color: AppConfig.Palette.orange)
        entrySection(title: "Dépenses en capital", section: .capital,
                     categories: property.capitalCategories, color: AppConfig.Palette.brown)

        Section {
            AmountRow(label: "Net du mois (\(AppConfig.monthNames[month]))",
                      amount: data.monthlyNet(propertyId: propertyId, month: month),
                      bold: true,
                      color: data.monthlyNet(propertyId: propertyId, month: month) >= 0
                          ? AppConfig.Palette.green : .red)
        }
    }

    private func entrySection(title: String, section: EntrySection,
                              categories: [String], color: Color) -> some View {
        Section {
            ForEach(categories, id: \.self) { category in
                entryRow(section: section, category: category)
            }
            AmountRow(label: "Total",
                      amount: data.sectionTotal(propertyId: propertyId, section: section, month: month),
                      bold: true, color: color)
        } header: {
            Text(title).foregroundStyle(color)
        }
    }

    @ViewBuilder
    private func entryRow(section: EntrySection, category: String) -> some View {
        let isAutoTravel = section == .deductible && category == AppConfig.travelExpenseCategory
        HStack(spacing: 6) {
            if isAutoTravel {
                CurrencyField(
                    title: "\(category) (auto)",
                    value: .constant(data.travelAutoAmount(propertyId: propertyId, month: month)),
                    readOnly: true
                )
            } else {
                CurrencyField(
                    title: category,
                    value: Binding(
                        get: { data.amount(propertyId: propertyId, section: section,
                                           category: category, month: month) },
                        set: { data.setAmount($0, propertyId: propertyId, section: section,
                                              category: category, month: month) }
                    )
                )
                let entry = data.entry(propertyId: propertyId, section: section,
                                       category: category, month: month)
                let hasExtras = entry.map { !$0.note.isEmpty || $0.receiptImage != nil } ?? false
                Button {
                    detailEntry = data.entry(propertyId: propertyId, section: section,
                                             category: category, month: month, createIfMissing: true)
                } label: {
                    Image(systemName: hasExtras ? "paperclip.circle.fill" : "paperclip.circle")
                        .foregroundStyle(hasExtras ? AppConfig.Palette.blue : Color.secondary)
                }
                .buttonStyle(.borderless)
            }
        }
    }

    // MARK: - Vue annuelle

    @ViewBuilder
    private var annualSections: some View {
        annualSection(title: "Revenus de location", section: .revenue,
                      categories: property.revenueCategories, color: AppConfig.Palette.green)
        annualSection(title: "Dépenses déductibles", section: .deductible,
                      categories: property.deductibleCategories, color: AppConfig.Palette.orange)
        annualSection(title: "Dépenses en capital", section: .capital,
                      categories: property.capitalCategories, color: AppConfig.Palette.brown)

        Section {
            AmountRow(label: "Bénéfice net annuel",
                      amount: data.annualNet(propertyId: propertyId),
                      bold: true,
                      color: data.annualNet(propertyId: propertyId) >= 0
                          ? AppConfig.Palette.green : .red)
        }
    }

    private func annualSection(title: String, section: EntrySection,
                               categories: [String], color: Color) -> some View {
        Section {
            ForEach(categories, id: \.self) { category in
                AmountRow(label: category,
                          amount: data.categoryAnnualTotal(propertyId: propertyId,
                                                           section: section, category: category))
            }
            AmountRow(label: "Total annuel",
                      amount: data.sectionAnnualTotal(propertyId: propertyId, section: section),
                      bold: true, color: color)
        } header: {
            Text(title).foregroundStyle(color)
        }
    }
}

// MARK: - Feuille note + reçu photo

struct EntryDetailSheet: View {
    @Bindable var entry: EntryAmount
    @Environment(\.dismiss) private var dismiss

    @State private var photoItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var showFullScreen = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Catégorie") {
                    Text("\(entry.category) — \(AppConfig.monthNames[entry.month])")
                        .font(.subheadline)
                    AmountRow(label: "Montant", amount: entry.amount)
                }

                Section("Note") {
                    TextField("Note libre (fournisseur, no de facture…)",
                              text: $entry.note, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section("Reçu (photo)") {
                    if let imageData = entry.receiptImage, let uiImage = UIImage(data: imageData) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 220)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .onTapGesture { showFullScreen = true }

                        ShareLink(item: Image(uiImage: uiImage),
                                  preview: SharePreview("Reçu — \(entry.category)",
                                                        image: Image(uiImage: uiImage))) {
                            Label("Partager / télécharger", systemImage: "square.and.arrow.up")
                        }
                        Button(role: .destructive) {
                            entry.receiptImage = nil
                        } label: {
                            Label("Supprimer le reçu", systemImage: "trash")
                        }
                    } else {
                        PhotosPicker(selection: $photoItem, matching: .images) {
                            Label("Choisir dans la photothèque", systemImage: "photo.on.rectangle")
                        }
                        Button {
                            showCamera = true
                        } label: {
                            Label("Prendre une photo", systemImage: "camera.fill")
                        }
                    }
                }
            }
            .navigationTitle("Note et reçu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                }
            }
            .onChange(of: photoItem) { _, newItem in
                guard let newItem else { return }
                Task {
                    if let rawData = try? await newItem.loadTransferable(type: Data.self),
                       let image = UIImage(data: rawData) {
                        entry.receiptImage = compress(image)
                    }
                    photoItem = nil
                }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { image in
                    entry.receiptImage = compress(image)
                }
                .ignoresSafeArea()
            }
            .fullScreenCover(isPresented: $showFullScreen) {
                if let imageData = entry.receiptImage, let uiImage = UIImage(data: imageData) {
                    ZStack(alignment: .topTrailing) {
                        Color.black.ignoresSafeArea()
                        Image(uiImage: uiImage)
                            .resizable()
                            .scaledToFit()
                        Button {
                            showFullScreen = false
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.largeTitle)
                                .foregroundStyle(.white)
                                .padding()
                        }
                    }
                }
            }
        }
    }

    /// Compresse la photo avant stockage (max ~1600 px, JPEG 70 %).
    private func compress(_ image: UIImage) -> Data? {
        let maxDimension: CGFloat = 1600
        let scale = min(1, maxDimension / max(image.size.width, image.size.height))
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
        return resized.jpegData(compressionQuality: 0.7)
    }
}

// MARK: - Caméra (UIImagePickerController)

struct CameraPicker: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            picker.sourceType = .camera
        }
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.onCapture(image)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

// MARK: - Feuille montants récurrents

struct RecurringAmountsSheet: View {
    let year: Int
    let propertyId: String
    let currentMonth: Int

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var sectionChoice: EntrySection = .revenue
    @State private var category = ""
    @State private var amount: Double = 0
    @State private var confirmation: String?

    private var data: DataService { DataService(context: context, year: year) }
    private var property: AppConfig.PropertyDef { AppConfig.property(id: propertyId) ?? AppConfig.p1090 }

    private var categories: [String] {
        switch sectionChoice {
        case .revenue: return property.revenueCategories
        case .deductible: return property.deductibleCategories.filter { $0 != AppConfig.travelExpenseCategory }
        case .capital: return property.capitalCategories
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Montant récurrent — \(property.name)") {
                    Picker("Section", selection: $sectionChoice) {
                        Text("Revenus").tag(EntrySection.revenue)
                        Text("Dépenses déductibles").tag(EntrySection.deductible)
                        Text("Dépenses en capital").tag(EntrySection.capital)
                    }
                    Picker("Catégorie", selection: $category) {
                        ForEach(categories, id: \.self) { Text($0).tag($0) }
                    }
                    CurrencyField(title: "Montant mensuel", value: $amount)
                }

                Section {
                    Button {
                        apply(months: [currentMonth])
                        confirmation = "Appliqué à \(AppConfig.monthNames[currentMonth])."
                    } label: {
                        Label("Appliquer au mois courant (\(AppConfig.monthNames[currentMonth]))",
                              systemImage: "calendar.badge.checkmark")
                    }
                    Button {
                        apply(months: Array(0..<12))
                        confirmation = "Appliqué aux 12 mois de \(String(year))."
                    } label: {
                        Label("Appliquer à tous les mois de l'année",
                              systemImage: "calendar")
                    }
                }
                .disabled(category.isEmpty || amount == 0)

                if let confirmation {
                    Section {
                        Label(confirmation, systemImage: "checkmark.circle.fill")
                            .foregroundStyle(AppConfig.Palette.green)
                    }
                }
            }
            .navigationTitle("Montants récurrents")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
            .onAppear {
                if category.isEmpty { category = categories.first ?? "" }
            }
            .onChange(of: sectionChoice) {
                category = categories.first ?? ""
            }
        }
    }

    private func apply(months: [Int]) {
        for month in months {
            data.setAmount(amount, propertyId: propertyId, section: sectionChoice,
                           category: category, month: month)
        }
    }
}
