import SwiftUI

/// Résultat brut d'un import PDF, avant validation par l'utilisateur.
struct PDFImportResult: Identifiable {
    enum Kind { case uber, lyft }

    let id = UUID()
    let kind: Kind
    /// Champs détectés dans le PDF : [clé: valeur].
    let detected: [String: Double]
    /// Ordre d'affichage des champs.
    let fieldOrder: [String]
    /// Titres français par clé de champ.
    let titles: [String: String]
    /// Mois cible (Lyft seulement).
    let month: Int?
}

/// Écran de révision : les champs détectés sont pré-remplis et surlignés en bleu,
/// les autres restent vides et modifiables. Rien n'est enregistré avant « Appliquer ».
struct PDFImportReviewView: View {
    let result: PDFImportResult
    let onApply: ([String: Double]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var values: [String: Double] = [:]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if result.detected.isEmpty {
                        Label("Aucun montant détecté automatiquement. Saisissez les valeurs manuellement puis appliquez.",
                              systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(.orange)
                    } else {
                        Label("\(result.detected.count) champ(s) détecté(s) — vérifiez puis appliquez.",
                              systemImage: "doc.text.magnifyingglass")
                            .font(.subheadline)
                            .foregroundStyle(AppConfig.Palette.blue)
                    }
                    if let month = result.month {
                        Text("Mois cible : \(AppConfig.monthNames[month])")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Champs du relevé") {
                    ForEach(result.fieldOrder, id: \.self) { key in
                        let isDetected = result.detected[key] != nil
                        CurrencyField(
                            title: result.titles[key] ?? key,
                            value: Binding(
                                get: { values[key] ?? 0 },
                                set: { values[key] = $0 }
                            )
                        )
                        .listRowBackground(isDetected
                                           ? AppConfig.Palette.blue.opacity(0.12)
                                           : nil)
                    }
                }
            }
            .navigationTitle(result.kind == .uber ? "Relevé Uber" : "Relevé Lyft")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Appliquer") {
                        onApply(values.filter { $0.value != 0 })
                        dismiss()
                    }
                    .bold()
                }
            }
            .onAppear {
                if values.isEmpty { values = result.detected }
            }
        }
    }
}
