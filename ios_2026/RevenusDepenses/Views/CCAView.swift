import SwiftUI
import SwiftData

// ════════════════════════════════════════════════════════════════════════════
//  CCAView.swift — DÉDUCTION POUR AMORTISSEMENT (DPA)
//
//  Portage de l'écran `dpa.js` de la PWA. Le calcul — mise en commun par
//  catégorie, classe distincte au-delà de 50 000 $, demi-taux et son suspens
//  par l'incitatif à l'investissement accéléré, plafond de l'art. 1100(11),
//  report de la FNACC — est dans Core/CCAService.swift, à parité vérifiée.
//
//  Le registre est annuel comme dans la PWA, et c'est `assetId` qui relie un
//  bien d'un exercice au suivant : sans lui, la fraction non amortie du coût en
//  capital devrait être retapée chaque année, et une faute de saisie se
//  propagerait sans jamais être détectée.
// ════════════════════════════════════════════════════════════════════════════

struct CCAView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Query private var allAssets: [CapitalAsset]
    @Query private var allEntries: [EntryAmount]
    @Query(sort: [SortDescriptor(\RentalProperty.sortOrder), SortDescriptor(\RentalProperty.createdAt)])
    private var allProperties: [RentalProperty]

    @State private var showArbitrage = false
    @State private var importMessage: String?

    private var data: DataService { DataService(context: context, year: year) }
    private var assets: [CapitalAsset] { allAssets.filter { $0.year == year }.sorted { $0.createdAt < $1.createdAt } }

    var body: some View {
        let calc = data.calculDPA()
        return List {
            if calc.pools.isEmpty {
                vide
            } else {
                resume(calc)
                categories(calc)
                actions(calc)
            }
            registre
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Amortissement \(String(year))")
        .sheet(isPresented: $showArbitrage) {
            NavigationStack { ArbitrageDPAView(year: year) }
                .appliesAppearance()
        }
    }

    // MARK: - Registre vide

    private var vide: some View {
        Section("Déduction pour amortissement \(String(year))") {
            NoteBox("Aucun bien amortissable au registre. Inscrivez-y le **bâtiment** de chaque "
                    + "immeuble (catégorie 1, 4 %), les électroménagers et le mobilier "
                    + "(catégorie 8, 20 %), et le véhicule s'il sert à l'entreprise "
                    + "(catégorie 10 ou 10.1, 30 %).")
            NoteBox("Réclamer la DPA sur un bâtiment réduit l'impôt aujourd'hui mais crée une "
                    + "**récupération imposable à 100 %** à la revente, en plus du gain en capital. "
                    + "Sur un immeuble qui prend de la valeur, c'est souvent un report d'impôt, pas "
                    + "une économie. Ce registre sert aussi à décider de **ne pas** la réclamer en "
                    + "connaissance de cause.",
                    kind: .warning)
        }
    }

    // MARK: - Résumé

    @ViewBuilder
    private func resume(_ calc: CalculDPA) -> some View {
        let maxTotal = calc.pools.reduce(0) { $0 + $1.dpaMax }
        let depasse = calc.plafondLocatif.map { calc.totalLocatif > $0 + 0.005 } ?? false
        let bride = calc.plafondLocatif.map { calc.maxLocatif > $0 + 0.005 } ?? false
        Section {
            SummaryPair(
                left: SummaryCard(title: "DPA réclamée",
                                  value: AppConfig.currency(calc.total),
                                  color: calc.total > 0 ? AppConfig.Palette.green : .secondary,
                                  icon: "arrow.down.circle.fill"),
                right: SummaryCard(title: "Plafond locatif — art. 1100(11)",
                                   value: calc.plafondLocatif.map(AppConfig.currency) ?? "—",
                                   color: depasse ? .red : AppConfig.Palette.blue,
                                   icon: "lock.fill"))
            NoteBox("Maximum amortissable cette année : \(AppConfig.currency(maxTotal)).", kind: .source)
            if depasse, let plafond = calc.plafondLocatif {
                NoteBox("La DPA locative réclamée (\(AppConfig.currency(calc.totalLocatif))) "
                        + "**dépasse** le revenu net de location avant DPA "
                        + "(\(AppConfig.currency(plafond))). L'art. 1100(11) l'interdit : la DPA ne "
                        + "peut ni créer ni augmenter une perte locative. Réduisez la réclamation — "
                        + "le solde reste dans la FNACC et servira plus tard.",
                        kind: .warning)
            } else if bride, let plafond = calc.plafondLocatif {
                NoteBox("Vous pourriez amortir jusqu'à \(AppConfig.currency(calc.maxLocatif)) au "
                        + "total, mais l'art. 1100(11) limite la DPA locative à "
                        + "\(AppConfig.currency(plafond)) cette année. Le reste n'est pas perdu : il "
                        + "demeure dans la FNACC.")
            }
        } header: {
            Text("Déduction pour amortissement \(String(year))")
        }
    }

    // MARK: - Catégories

    @ViewBuilder
    private func categories(_ calc: CalculDPA) -> some View {
        ForEach(calc.pools, id: \.cle) { pool in
            Section {
                AmountRow(label: pool.reportee ? "FNACC d'ouverture — reportée" : "FNACC d'ouverture",
                          amount: pool.ouverture,
                          color: pool.reportee ? AppConfig.Palette.green : .primary)
                if pool.ajouts != 0 {
                    AmountRow(label: "Ajouts de l'année", amount: pool.ajouts)
                }
                if pool.dispositions != 0 {
                    AmountRow(label: "Dispositions", amount: -pool.dispositions, color: .red)
                }
                if pool.reduction != 0 {
                    AmountRow(label: "Règle du demi-taux", amount: -pool.reduction, color: .red)
                }
                AmountRow(label: "DPA maximale (\(Socle.fmt(pool.taux * 100, 0)) %)", amount: pool.dpaMax)
                CurrencyField(title: "DPA réclamée", value: reclamation(pool))
                AmountRow(label: "FNACC de clôture", amount: pool.fermeture, bold: true)
            } header: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(pool.nomProp)
                    Text("cat. \(pool.cat.code) · \(Socle.fmt(pool.taux * 100, 0)) %"
                         + (pool.distincte ? " · classe distincte" : "")
                         + (pool.locatif ? "" : " · entreprise"))
                        .font(.caption2)
                        .textCase(nil)
                }
            }
        }
    }

    // MARK: - Actions

    @ViewBuilder
    private func actions(_ calc: CalculDPA) -> some View {
        Section {
            Button {
                data.reclamerMaxDPA()
            } label: {
                Label("Réclamer le maximum", systemImage: "arrow.up.circle.fill")
            }
            Button {
                data.renoncerDPA()
            } label: {
                Label("Ne rien réclamer cette année", systemImage: "arrow.uturn.left")
                    .foregroundStyle(.secondary)
            }
            Button {
                showArbitrage = true
            } label: {
                Label("Faut-il réclamer la DPA cette année ?", systemImage: "scalemass.fill")
            }
            NoteBox("Demi-taux l'année d'acquisition (art. 1100(2)) **suspendu** pour les biens "
                    + "admissibles à l'incitatif à l'investissement accéléré, prêts à être mis en "
                    + "service avant 2028 : "
                    + "\(AppConfig.currency(calc.pools.reduce(0) { $0 + $1.ajoutsAII })) d'ajouts au "
                    + "taux plein, "
                    + "\(AppConfig.currency(calc.pools.reduce(0) { $0 + $1.ajoutsDemi })) au "
                    + "demi-taux.",
                    kind: .source)
        }
    }

    // MARK: - Registre des biens

    private var registre: some View {
        Section("Biens au registre — \(assets.count)") {
            ForEach(assets) { asset in
                NavigationLink {
                    AssetEditorView(year: year, assetId: asset.assetId)
                } label: {
                    ligneBien(asset)
                }
            }
            .onDelete { offsets in
                offsets.map { assets[$0] }.forEach { data.delete($0) }
            }
            Button {
                data.nouveauBien()
            } label: {
                Label("Ajouter un bien", systemImage: "plus.circle.fill")
            }
            ForEach(data.anneesRegistre(), id: \.self) { an in
                Button {
                    let n = data.importerRegistre(depuis: an)
                    importMessage = n > 0
                        ? "\(n) bien\(n > 1 ? "s" : "") importé\(n > 1 ? "s" : "") de \(String(an))"
                        : "Aucun bien à importer de \(String(an))"
                } label: {
                    Label("Importer le registre de \(String(an))", systemImage: "square.and.arrow.down")
                        .foregroundStyle(.secondary)
                }
            }
            if let importMessage {
                Text(importMessage)
                    .font(.caption)
                    .foregroundStyle(AppConfig.Palette.green)
            }
            if !assets.isEmpty {
                NoteBox("Supprimer un bien modifie le report de FNACC des années suivantes.",
                        kind: .source)
            }
        }
    }

    private func ligneBien(_ asset: CapitalAsset) -> some View {
        let cumul = data.dpaCumulee(assetId: asset.assetId)
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(asset.label.isEmpty ? "(sans description)" : asset.label)
                    .font(.subheadline)
                Text("cat. \(asset.categorie) · acquis \(asset.dateAcquisition.isEmpty ? "?" : asset.dateAcquisition)"
                     + (asset.dispositionDate.isEmpty ? "" : " · vendu \(asset.dispositionDate)"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(AppConfig.currency(asset.coutAmortissable))
                    .font(.subheadline.monospacedDigit())
                Text(cumul > 0 ? "amorti \(AppConfig.currency(cumul))" : "jamais amorti")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Liaison de saisie

    /// La réclamation est inscrite sur le premier bien de la catégorie, comme
    /// dans la PWA : la catégorie est mise en commun, un seul porteur suffit.
    private func reclamation(_ pool: PoolDPA) -> Binding<Double> {
        Binding(
            get: { pool.reclamee },
            set: { data.reclamerDPA(pool: pool, montant: $0) }
        )
    }
}

// MARK: - Éditeur d'un bien

struct AssetEditorView: View {
    let year: Int
    let assetId: String

    @Environment(\.modelContext) private var context
    @Query private var allAssets: [CapitalAsset]
    @Query(sort: [SortDescriptor(\RentalProperty.sortOrder), SortDescriptor(\RentalProperty.createdAt)])
    private var allProperties: [RentalProperty]
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete = false

    private var data: DataService { DataService(context: context, year: year) }
    private var asset: CapitalAsset? {
        allAssets.first { $0.year == year && $0.assetId == assetId }
    }

    var body: some View {
        Group {
            if let asset {
                formulaire(asset)
            } else {
                Text("Bien supprimé.")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Bien amortissable")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func formulaire(_ asset: CapitalAsset) -> some View {
        let cat = Fiscalite.categorieDPA(asset.categorie)
        let pool = data.calculDPA().pools.first { $0.biens.contains { $0.id == asset.assetId } }
        List {
            Section("Identification") {
                TextField("Description (ex. Bâtiment — 1090 Oscar-Benoît)",
                          text: Binding(get: { asset.label }, set: { asset.label = $0 }))
                Picker("Rattaché à", selection: Binding(get: { asset.propId },
                                                        set: { asset.propId = $0 })) {
                    ForEach(allProperties) { prop in
                        Text(Socle.shortLabel(prop.name)).tag(prop.propId)
                    }
                    Text("Véhicule / entreprise").tag(CCAService.vehPseudoProp)
                }
                Picker("Catégorie", selection: Binding(get: { asset.categorie },
                                                        set: { asset.categorie = $0 })) {
                    ForEach(Fiscalite.categoriesDPA, id: \.code) { c in
                        Text("\(c.code) — \(Socle.fmt(c.taux * 100, 0)) %").tag(c.code)
                    }
                }
                if let cat, !cat.aide.isEmpty {
                    NoteBox("**\(cat.label)** — \(cat.aide)", kind: .source)
                }
            }

            Section("Coût") {
                CurrencyField(title: "Coût total payé",
                              value: Binding(get: { asset.cout }, set: { asset.cout = $0 }))
                CurrencyField(title: "Dont terrain",
                              value: Binding(get: { asset.coutTerrain }, set: { asset.coutTerrain = $0 }))
                if cat?.batiment == true {
                    NoteBox("Coût amortissable (bâtiment seul) : "
                            + "**\(AppConfig.currency(asset.coutAmortissable))**. Le terrain ne "
                            + "s'amortit jamais. À défaut d'une répartition au contrat, le rôle "
                            + "d'évaluation municipale est la référence admise par l'ARC.")
                }
                DatePicker("Date d'acquisition",
                           selection: dateBinding(get: { asset.dateAcquisition },
                                                  set: { asset.dateAcquisition = $0 }),
                           displayedComponents: .date)
                Toggle("Acquis d'une personne liée",
                       isOn: Binding(get: { asset.lie }, set: { asset.lie = $0 }))
                NoteBox("Conjoint, société contrôlée, roulement : l'incitatif à l'investissement "
                        + "accéléré ne s'applique pas et le demi-taux reprend.",
                        kind: .source)
            }

            Section("Disposition (vente)") {
                Toggle("Vendu", isOn: Binding(
                    get: { !asset.dispositionDate.isEmpty },
                    set: { asset.dispositionDate = $0 ? Self.iso(Date()) : "" }))
                if !asset.dispositionDate.isEmpty {
                    DatePicker("Date de la vente",
                               selection: dateBinding(get: { asset.dispositionDate },
                                                      set: { asset.dispositionDate = $0 }),
                               displayedComponents: .date)
                    CurrencyField(title: "Produit de disposition",
                                  value: Binding(get: { asset.dispositionProduit },
                                                 set: { asset.dispositionProduit = $0 }))
                }
                NoteBox("À la disposition, le produit entre dans la catégorie à hauteur du "
                        + "**moindre du produit et du coût en capital**. L'excédent sur le coût est "
                        + "un gain en capital distinct ; la DPA déjà réclamée devient une "
                        + "**récupération** imposable à 100 %.",
                        kind: .source)
            }

            Section("FNACC d'ouverture \(String(year))") {
                Toggle("Surcharge manuelle", isOn: Binding(
                    get: { asset.fnaccOuverture != nil },
                    set: { asset.fnaccOuverture = $0 ? (pool?.ouverture ?? 0) : nil }))
                if asset.fnaccOuverture != nil {
                    CurrencyField(title: "FNACC d'ouverture",
                                  value: Binding(get: { asset.fnaccOuverture ?? 0 },
                                                 set: { asset.fnaccOuverture = $0 }))
                }
                NoteBox("Laissez la surcharge désactivée : la FNACC est reportée automatiquement "
                        + "depuis \(String(year - 1)). Ne l'activez que pour amorcer le registre sur "
                        + "un bien déjà amorti avant l'utilisation de l'app.",
                        kind: .source)
                if let pool {
                    NoteBox("Ce bien est dans la catégorie **\(pool.libelle)** — FNACC d'ouverture "
                            + "\(AppConfig.currency(pool.ouverture)), DPA maximale "
                            + "\(AppConfig.currency(pool.dpaMax)).",
                            kind: .source)
                }
            }

            Section {
                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label("Supprimer ce bien", systemImage: "trash")
                }
            }
        }
        .alert("Supprimer ce bien du registre ?", isPresented: $confirmDelete) {
            Button("Supprimer", role: .destructive) {
                data.delete(asset)
                dismiss()
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Le report de FNACC des années suivantes en sera affecté.")
        }
    }

    // MARK: - Dates en texte

    /// Le noyau garde les dates en « AAAA-MM-JJ » parce qu'il les compare en
    /// texte, exactement comme la PWA ; le sélecteur, lui, veut une `Date`.
    private func dateBinding(get lire: @escaping () -> String,
                             set ecrire: @escaping (String) -> Void) -> Binding<Date> {
        Binding(
            get: { Self.date(lire()) ?? Date() },
            set: { ecrire(Self.iso($0)) }
        )
    }

    static func iso(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    static func date(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: iso)
    }
}

// MARK: - Arbitrage : réclamer ou pas

/// Chiffre l'arbitrage « déduire maintenant contre récupérer à la vente ». La
/// DPA est un report d'impôt, pas une exemption : l'écran doit le dire avant que
/// le bouton « Réclamer le maximum » ne soit pressé.
struct ArbitrageDPAView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var allAssets: [CapitalAsset]

    private var data: DataService { DataService(context: context, year: year) }

    var body: some View {
        let calc = data.calculDPA()
        let dispo = min(calc.maxLocatif, calc.plafondLocatif ?? calc.maxLocatif)
        let marginal = data.tauxMarginalEstime()
        let cumulBatiments = allAssets
            .filter { Fiscalite.categorieDPA($0.categorie)?.batiment == true }
            .reduce(0) { $0 + $1.dpaReclamee }
        return List {
            Section {
                SummaryPair(
                    left: SummaryCard(title: "DPA disponible",
                                      value: AppConfig.currency(dispo),
                                      color: AppConfig.Palette.blue,
                                      icon: "arrow.down.circle.fill"),
                    right: SummaryCard(title: "Économie d'impôt immédiate",
                                       value: AppConfig.currency(dispo * marginal),
                                       color: AppConfig.Palette.green,
                                       icon: "banknote.fill"))
                NoteBox("Au taux marginal estimé de \(AppConfig.percent(marginal)).", kind: .source)
                NoteBox("**Ce que la DPA est vraiment** : un report d'impôt, pas une exemption. "
                        + "Chaque dollar déduit aujourd'hui revient comme **récupération "
                        + "d'amortissement imposable à 100 %** l'année de la vente — au taux "
                        + "marginal d'alors, qui sera celui d'une année où vous encaissez aussi un "
                        + "gain en capital.")
                if cumulBatiments > 0 {
                    NoteBox("DPA déjà réclamée sur les bâtiments, toutes années confondues : "
                            + "**\(AppConfig.currency(cumulBatiments))**. C'est le montant qui sera "
                            + "récupéré à la vente.",
                            kind: .warning)
                }
            }

            Section("Quand la réclamer") {
                ForEach(Self.situations, id: \.0) { situation, reponse in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(situation)
                            .font(.subheadline)
                        Text(.init(reponse))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                NoteBox("Sur un immeuble locatif, beaucoup de propriétaires choisissent "
                        + "délibérément de ne pas réclamer la DPA sur le bâtiment et de la réclamer "
                        + "sur le mobilier (cat. 8) et les équipements, qui se déprécient "
                        + "réellement.",
                        kind: .source)
            }
        }
        .navigationTitle("Réclamer la DPA ?")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Fermer") { dismiss() }
            }
        }
    }

    static let situations: [(String, String)] = [
        ("Revenu élevé cette année, revenu plus faible prévu à la vente",
         "**Oui** — l'écart de taux marginal est un gain réel"),
        ("Immeuble conservé très longtemps",
         "**Plutôt oui** — le report a une valeur de trésorerie"),
        ("Vente prévue à court terme",
         "**Non** — récupération quasi immédiate, sans gain de taux"),
        ("Revenu locatif déjà en perte",
         "**Impossible** — art. 1100(11)"),
        ("Résidence devenue locative",
         "**Prudence** — la DPA peut faire perdre l'exemption pour résidence principale sur la période")
    ]
}
