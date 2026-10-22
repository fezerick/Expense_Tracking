import SwiftUI
import SwiftData

// ════════════════════════════════════════════════════════════════════════════
//  TaxView.swift — IMPÔT ESTIMÉ, COTISATIONS ET ACOMPTES PROVISIONNELS
//
//  Portage de l'écran `impot.js` de la PWA. Tout le calcul vient de
//  Core/TaxService.swift, vérifié contre la PWA par la suite de parité : cette
//  vue ne fait que saisir les quatre montants que l'app ne peut pas deviner
//  (salaire, retenues, gains déjà cotisés, acomptes versés) et présenter le
//  résultat.
//
//  La seule question qui compte en cours d'année est COMBIEN METTRE DE CÔTÉ :
//  c'est la carte « À provisionner » qui y répond, et elle est la première.
// ════════════════════════════════════════════════════════════════════════════

struct TaxView: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @AppStorage(AppSetup.Keys.moduleProperties) private var moduleProperties = true
    @AppStorage(AppSetup.Keys.moduleRideshare) private var moduleRideshare = true
    // Ces @Query déclenchent le recalcul dès qu'une donnée de l'année change.
    @Query private var allTaxInputs: [TaxInputs]
    @Query private var allEntries: [EntryAmount]
    @Query private var allUberValues: [UberValue]
    @Query private var allLyftMonths: [LyftMonth]
    @Query private var allVehicleExpenses: [VehicleExpense]
    @Query private var allAssets: [CapitalAsset]

    private var data: DataService { DataService(context: context, year: year) }

    var body: some View {
        let c = data.calculImpot()
        let ac = data.calculAcomptes()
        return List {
            cartes(c)
            saisie
            detailRevenuNet(c)
            detailImpot(c)
            acomptes(ac)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Impôt \(String(year))")
        .onAppear { data.ensureTaxInputs() }
    }

    // MARK: - Cartes du haut

    @ViewBuilder
    private func cartes(_ c: ResultatImpot) -> some View {
        Section {
            SummaryPair(
                left: SummaryCard(title: "À provisionner",
                                  value: AppConfig.currency(c.provision),
                                  color: c.provision > 0 ? AppConfig.Palette.orange : AppConfig.Palette.green,
                                  icon: "banknote.fill"),
                right: SummaryCard(title: "Taux marginal",
                                   value: AppConfig.percent(c.marginal),
                                   color: AppConfig.Palette.blue,
                                   icon: "chart.line.uptrend.xyaxis"))
            SummaryPair(
                left: SummaryCard(title: "Impôt et cotisations",
                                  value: AppConfig.currency(c.totalAvantRetenues),
                                  color: AppConfig.Palette.brown,
                                  icon: "building.columns.fill"),
                right: SummaryCard(title: c.solde >= 0 ? "Solde à payer" : "Remboursement attendu",
                                   value: AppConfig.currency(abs(c.solde)),
                                   color: c.solde > 0 ? .red : AppConfig.Palette.green,
                                   icon: c.solde > 0 ? "arrow.up.circle.fill" : "arrow.down.circle.fill"))
            NoteBox("L'impôt à provisionner est celui des revenus **sans retenue à la source** — "
                    + "loyers et Uber. Taux effectif de \(AppConfig.percent(c.tauxEffectif)) du revenu net.",
                    kind: .source)
            NoteBox("**Estimation.** Elle ne tient compte que du montant personnel de base et des "
                    + "crédits liés au RRQ : ni personnes à charge, ni frais de garde, ni REER, ni "
                    + "crédits de solidarité ou de TPS. Elle sert à provisionner, pas à produire "
                    + "une déclaration.",
                    kind: .warning)
        } header: {
            Text("Impôt estimé \(String(year))")
        }
    }

    // MARK: - Saisie

    private var saisie: some View {
        Section("Vos autres revenus") {
            NoteBox("Sans votre salaire, l'estimation est fausse : c'est lui qui détermine la "
                    + "tranche d'imposition dans laquelle tombe le revenu locatif et le revenu Uber.")
            CurrencyField(title: "Salaire brut imposable (case A du relevé 1)",
                          value: champ(\.revenuT4))
            CurrencyField(title: "Impôt fédéral retenu", value: champ(\.impotRetenuFed))
            CurrencyField(title: "Impôt du Québec retenu", value: champ(\.impotRetenuQc))
            CurrencyField(title: "Gains ouvrant droit à pension déjà cotisés (case 26 du T4)",
                          value: champ(\.gainsRRQCotises))
            NoteBox("Indispensable : sans ce montant, l'app recotiserait au RRQ sur une tranche de "
                    + "revenu déjà cotisée par votre employeur, et surestimerait la facture de "
                    + "plusieurs milliers de dollars.",
                    kind: .source)
            CurrencyField(title: "Autres revenus", value: champ(\.autresRevenus))
            CurrencyField(title: "Autres déductions (REER…)", value: champ(\.autresDeductions))
        }
    }

    // MARK: - Détail du calcul

    @ViewBuilder
    private func detailRevenuNet(_ c: ResultatImpot) -> some View {
        let a = c.assiettes
        Section("Revenu net") {
            if a.t4 != 0 {
                AmountRow(label: "Salaire (T4 / relevé 1) — retenu à la source", amount: a.t4)
            }
            if moduleProperties {
                AmountRow(label: a.dpaLoc != 0
                            ? "Revenu net de location — après DPA de \(AppConfig.currency(a.dpaLoc))"
                            : "Revenu net de location",
                          amount: a.netLoc,
                          color: a.netLoc >= 0 ? .primary : .red)
            }
            if moduleRideshare {
                AmountRow(label: "Revenu net d'entreprise (Uber, Lyft) — "
                            + "\(AppConfig.currency(a.depEnt)) de dépenses",
                          amount: a.netEnt,
                          color: a.netEnt >= 0 ? .primary : .red)
            }
            if a.autres != 0 {
                AmountRow(label: "Autres revenus", amount: a.autres)
            }
            AmountRow(label: "Déduction — cotisations RRQ et RQAP",
                      amount: -a.deductionsCotisations, color: .red)
            // Lue dans la saisie et non déduite du revenu net : celui-ci est
            // borné à zéro, et la soustraction redonnerait un montant faux dès
            // que les déductions dépassent le revenu.
            let autresDeductions = data.ensureTaxInputs().autresDeductions
            if autresDeductions != 0 {
                AmountRow(label: "Autres déductions", amount: -autresDeductions, color: .red)
            }
            AmountRow(label: "Revenu net", amount: a.revenuNet, bold: true)
        }
    }

    @ViewBuilder
    private func detailImpot(_ c: ResultatImpot) -> some View {
        let a = c.assiettes
        let f = Fiscalite.params(year)
        Section("Impôt et cotisations") {
            AmountRow(label: "Impôt fédéral avant crédits", amount: c.fedBrut.impot)
            AmountRow(label: "Crédits (montant personnel \(AppConfig.currency(c.bpaFed)) + RRQ)",
                      amount: -c.creditsFed, color: .red)
            AmountRow(label: "Abattement du Québec (\(Socle.fmt(f.fed.abattementQc * 100, 1)) %)",
                      amount: -c.abattement, color: .red)
            AmountRow(label: "Impôt fédéral net", amount: c.fedNet, bold: true)
            AmountRow(label: "Impôt du Québec avant crédits", amount: c.qcBrut.impot)
            AmountRow(label: "Crédits (montant personnel \(AppConfig.currency(f.qc.bpa)) + RRQ)",
                      amount: -c.creditsQc, color: .red)
            AmountRow(label: "Impôt du Québec net", amount: c.qcNet, bold: true)
            if a.rrq.total != 0 {
                AmountRow(label: "Cotisation au RRQ — travailleur autonome", amount: a.rrq.total)
            }
            if a.rqap.montant != 0 {
                AmountRow(label: "Cotisation au RQAP", amount: a.rqap.montant)
            }
            if a.fss.montant != 0 {
                AmountRow(label: "Cotisation au FSS (annexe F)", amount: a.fss.montant)
            }
            AmountRow(label: "TOTAL", amount: c.totalAvantRetenues, bold: true,
                      color: AppConfig.Palette.brown)
            if a.rrq.total != 0 {
                NoteBox("RRQ : \(AppConfig.currency(a.rrq.base)) de cotisation de base et "
                        + "\(AppConfig.currency(a.rrq.supp)) de cotisation supplémentaire. "
                        + "\(AppConfig.currency(a.rrq.deductible)) sont déductibles du revenu, "
                        + "\(AppConfig.currency(a.rrq.credit)) donnent un crédit d'impôt. Le RRQ ne "
                        + "porte que sur le revenu d'entreprise — jamais sur le loyer net, qui est "
                        + "un revenu de biens.",
                        kind: .source)
            }
            if a.fss.montant != 0 {
                NoteBox("FSS : calculé sur "
                        + "\(AppConfig.currency(max(0, a.netEnt) + max(0, a.netLoc))) de revenu "
                        + "assujetti (revenu d'entreprise et revenu de placement), selon la grille "
                        + "de l'annexe F.",
                        kind: .source)
            }
        }
    }

    // MARK: - Acomptes provisionnels

    @ViewBuilder
    private func acomptes(_ ac: ResultatAcomptes) -> some View {
        Section("Acomptes provisionnels \(String(year))") {
            if !ac.requisFed && !ac.requisQc {
                NoteBox("Aucun acompte exigé : l'impôt net estimé reste sous le seuil de "
                        + "\(AppConfig.currency(ac.seuil)) au fédéral comme au Québec. Le seuil est "
                        + "de \(AppConfig.currency(ac.seuil)) — et non 3 000 $ — parce que vous "
                        + "résidez au Québec.")
            } else {
                if ac.manqueTotal > 0 {
                    NoteBox("**\(ac.retards.count) acompte\(ac.retards.count > 1 ? "s" : "") en "
                            + "retard — il manque \(AppConfig.currency(ac.manqueTotal))** au total "
                            + "(\(ac.retards.map { Self.dateLongue($0.date) }.joined(separator: ", "))). "
                            + "Versez le manque sans attendre l'échéance suivante : les intérêts "
                            + "courent par jour à partir de chaque date, et ils ne sont pas "
                            + "déductibles.",
                            kind: .warning)
                }
                if let p = ac.prochain, let j = ac.joursAvantProchain, j <= 14 {
                    NoteBox("**Prochain acompte \(j == 0 ? "aujourd'hui" : "dans \(j) jour\(j > 1 ? "s" : "")")**, "
                            + "le \(Self.dateLongue(p.date)) : \(AppConfig.currency(p.fed)) au "
                            + "fédéral et \(AppConfig.currency(p.qc)) au Québec.",
                            kind: .warning)
                }
                NoteBox("Des acomptes sont exigés : impôt net estimé de "
                        + "\(AppConfig.currency(ac.netFed)) au fédéral et "
                        + "\(AppConfig.currency(ac.netQc)) au Québec, au-delà du seuil de "
                        + "\(AppConfig.currency(ac.seuil)). Les intérêts sur acompte insuffisant ne "
                        + "sont pas déductibles.",
                        kind: .warning)
                AmountRow(label: "Total des quatre versements",
                          amount: ac.versements.reduce(0) { $0 + $1.fed + $1.qc }, bold: true)
            }
            NoteBox("Méthode du montant estimé de l'année courante : le total estimé divisé en "
                    + "quatre. L'administration envoie aussi des montants « sans calcul » fondés "
                    + "sur vos deux années précédentes — les verser met à l'abri des intérêts même "
                    + "si l'estimation change.",
                    kind: .source)
        }

        // Une section par échéance : les cinq colonnes du tableau de la PWA ne
        // tiennent pas sur un iPhone, et un acompte oublié coûte des intérêts
        // non déductibles — l'état de chaque versement doit rester lisible.
        ForEach(Array(ac.versements.enumerated()), id: \.offset) { i, v in
            Section {
                AmountRow(label: "À verser au fédéral", amount: v.fed)
                AmountRow(label: "À verser au Québec", amount: v.qc)
                CurrencyField(title: "Versé au fédéral", value: acompteBinding(.fed, i))
                CurrencyField(title: "Versé au Québec", value: acompteBinding(.qc, i))
            } header: {
                let etat = Self.etat(v)
                HStack(spacing: 6) {
                    Text(Self.dateLongue(v.date))
                    if !etat.0.isEmpty {
                        Text(etat.0)
                            .foregroundStyle(etat.1)
                    }
                }
            }
        }
    }

    // MARK: - Liaisons de saisie

    private func champ(_ keyPath: ReferenceWritableKeyPath<TaxInputs, Double>) -> Binding<Double> {
        let t = data.ensureTaxInputs()
        return Binding(get: { t[keyPath: keyPath] }, set: { t[keyPath: keyPath] = $0 })
    }

    private func acompteBinding(_ palier: PalierAcompte, _ i: Int) -> Binding<Double> {
        let t = data.ensureTaxInputs()
        return Binding(get: { t.acompte(palier, i) }, set: { t.setAcompte($0, palier, i) })
    }

    // MARK: - Présentation

    /// État d'un versement, en toutes lettres à côté de son échéance : « échu »
    /// seul ne dit pas si le versement a été fait.
    static func etat(_ v: Versement) -> (String, Color) {
        if v.enRetard {
            return ("⚠️ en retard · il manque \(AppConfig.currency(v.manqueFed + v.manqueQc))", .red)
        }
        if v.echue {
            return (v.fed + v.qc > 0 ? "✔ versé" : "échu",
                    v.fed + v.qc > 0 ? AppConfig.Palette.green : .secondary)
        }
        if v.fed == 0 && v.qc == 0 { return ("", .secondary) }
        if v.jours == 0 { return ("⏰ à verser aujourd'hui", .red) }
        if v.jours <= 14 { return ("⏰ dans \(v.jours) jour\(v.jours > 1 ? "s" : "")", .red) }
        if v.jours <= 45 { return ("dans \(v.jours) jours", AppConfig.Palette.orange) }
        return ("dans \(v.jours) jours", .secondary)
    }

    /// « 2026-03-15 » → « 15 mars ».
    static func dateLongue(_ iso: String) -> String {
        let lecteur = DateFormatter()
        lecteur.locale = Locale(identifier: "en_US_POSIX")
        lecteur.dateFormat = "yyyy-MM-dd"
        guard let d = lecteur.date(from: iso) else { return iso }
        let ecrivain = DateFormatter()
        ecrivain.locale = AppConfig.locale
        ecrivain.setLocalizedDateFormatFromTemplate("d MMMM")
        return ecrivain.string(from: d)
    }
}

// MARK: - Bandeau de provision (Accueil)

/// Ce que l'app peut dire d'utile en juin : l'argent à mettre de côté, visible
/// sans aller le chercher. Un retard d'acompte passe devant tout le reste.
struct ProvisionBanner: View {
    let year: Int

    @Environment(\.modelContext) private var context
    @Query private var allTaxInputs: [TaxInputs]
    @Query private var allEntries: [EntryAmount]
    @Query private var allAssets: [CapitalAsset]

    private var data: DataService { DataService(context: context, year: year) }

    var body: some View {
        let c = data.calculImpot()
        if c.provision > 0 {
            let ac = data.calculAcomptes()
            let retard = ac.manqueTotal > 0
            NavigationLink {
                TaxView(year: year)
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: "banknote.fill")
                        Text("Provision d'impôt à constituer")
                            .font(.caption)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                    }
                    .foregroundStyle(.white.opacity(0.9))
                    Text(AppConfig.currency(c.provision))
                        .font(.title3.bold())
                        .foregroundStyle(.white)
                    Text("\(echeance(ac, retard: retard)) · taux marginal \(AppConfig.percent(c.marginal))")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.85))
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(retard ? Color.red : AppConfig.Palette.orange)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
    }

    private func echeance(_ ac: ResultatAcomptes, retard: Bool) -> String {
        if retard {
            return "⚠️ \(ac.retards.count) acompte\(ac.retards.count > 1 ? "s" : "") en retard · "
                 + "il manque \(AppConfig.currency(ac.manqueTotal))"
        }
        if let p = ac.prochain, p.fed + p.qc > 0, let j = ac.joursAvantProchain {
            return j == 0
                ? "⏰ acompte à verser aujourd'hui"
                : "prochain acompte \(j <= 14 ? "⏰ " : "")dans \(j) jour\(j > 1 ? "s" : "") "
                  + "(\(TaxView.dateLongue(p.date)))"
        }
        return "au titre de \(String(year))"
    }
}
