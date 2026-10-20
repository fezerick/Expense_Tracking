// ════════════════════════════════════════════════════════════════════════════
// recommandations.js — CE QUI PEUT RAPPORTER, CHIFFRÉ
//
// L'app sait additionner. Ce module répond à la question d'après : « qu'est-ce
// que je laisse sur la table ? »
//
// Règles que s'impose ce module, parce qu'une liste de conseils génériques ne
// vaut rien :
//
// • Chaque recommandation part des DONNÉES RÉELLES de l'année, pas d'un
//   catalogue. Pas de données ⇒ pas de recommandation.
// • Chacune porte un MONTANT estimé, et le tri se fait dessus. Sans montant, on
//   ne sait pas par quoi commencer.
// • Chacune dit POURQUOI, CE QU'IL FAUT FAIRE, et D'OÙ VIENT LA RÈGLE. Une
//   recommandation sans source n'est pas vérifiable.
// • Une recommandation déjà suivie disparaît. Une liste qui ne diminue jamais
//   finit par être ignorée.
//
// GREFFE : sous-onglet « Recommandations » de l'onglet Fiscal (#reco-body), et
// un résumé des trois premières sur l'accueil (#home-reco).
// ════════════════════════════════════════════════════════════════════════════

// r = { id, titre, montant, horizon, quoi, pourquoi, action, source, ton }
// horizon : 'annee' (récupérable cette année) | 'report' (impôt différé) |
//           'projet' (demande à faire) | 'risque' (perte évitée)
function recommandations() {
  const out = []
  const marginal = typeof tauxMarginalEstime === 'function' ? tauxMarginalEstime() : 0.40
  const ajouter = r => { if (r && (r.montant > 0 || r.toujours)) out.push(r) }

  // ── 1. DPA non réclamée ───────────────────────────────────────────────────
  // L'impôt économisé n'est pas un gain définitif : il est différé jusqu'à la
  // vente (récupération). Le dire, sinon la recommandation est malhonnête.
  try {
    const d = calculDPA(activeYear, true)
    if (d && d.pools.length) {
      const nonReclame = d.pools.reduce((s, p) => s + Math.max(0, p.dpaMax - p.reclamee), 0)
      const plafond = d.plafondLocatif == null ? Infinity : Math.max(0, d.plafondLocatif - d.totalLocatif)
      const utile = Math.min(nonReclame, plafond)
      ajouter({
        id: 'dpa-non-reclamee', montant: utile * marginal, horizon: 'report', ton: 'green',
        titre: 'Déduction pour amortissement non réclamée',
        quoi: `${money(utile)} de DPA encore réclamables cette année, soit environ
               ${money(utile * marginal)} d’impôt reporté au taux marginal de ${fmt(marginal * 100, 1)} %.`,
        pourquoi: `La DPA ne se reporte pas en arrière : une année sans réclamation n’est pas perdue
          (la FNACC demeure), mais l’argent reste chez le fisc plus longtemps que nécessaire.`,
        action: 'Onglet Fiscal → DPA → « Réclamer le maximum », puis vérifier l’arbitrage.',
        source: `Règl. de l’impôt, art. 1100(11) : la DPA ne peut créer ni augmenter une perte locative.
          Elle sera récupérée à la vente de l’immeuble.`
      })
    }
  } catch (e) {}

  // ── 2. Méthode du véhicule ────────────────────────────────────────────────
  try {
    if (typeof comparerMethodesVehicule === 'function' && setup.modules.rideshare) {
      const c = comparerMethodesVehicule()
      const ecart = Math.abs(c.m1.total - c.m2.total)
      if (ecart > 200) {
        const meilleure = c.m1.total >= c.m2.total ? 'les frais réels (méthode 1)' : 'le taux par kilomètre (méthode 2)'
        ajouter({
          id: 'veh-methode', montant: ecart * marginal, horizon: 'annee', ton: 'blue',
          titre: 'Écart entre les deux méthodes de calcul du véhicule',
          quoi: `${money(ecart)} de déduction d’écart. ${meilleure.charAt(0).toUpperCase() + meilleure.slice(1)}
                 donne le plus. Effet sur l’impôt : environ ${money(ecart * marginal)}.`,
          pourquoi: `L’app applique aujourd’hui ${money(c.actuelle)} de déduction. Un écart de cette
            taille mérite d’être vérifié avant de produire la déclaration.`,
          action: 'Onglet Véhicule → comparaison des méthodes.',
          source: `L’ARC attend les FRAIS RÉELS d’un travailleur autonome. Le taux par kilomètre est une
            indemnité versée à un employé ; il sert ici de contrôle de vraisemblance.`
        })
      }
    }
  } catch (e) {}

  // ── 3. Postes de dépenses jamais saisis ───────────────────────────────────
  // Une catégorie vide n'est pas une anomalie en soi ; une catégorie vide que
  // TOUT propriétaire paie (taxes, assurance) l'est.
  const INCONTOURNABLES = ['Taxes municipales', 'Assurance habitation',
                           'Intérêts sur hypothèque / frais bancaires']
  activeProps().forEach(p => {
    const manquants = INCONTOURNABLES.filter(cat =>
      (p.deductibles || []).includes(cat) &&
      Array.from({ length: 12 }, (_, mi) => getMonthlyVal(p.id, 'deductibles', cat, mi))
        .every(v => !v))
    if (manquants.length) {
      ajouter({
        id: 'postes-vides-' + p.id, montant: 0, toujours: true, horizon: 'annee', ton: 'orange',
        titre: `${shortLabel(p.label)} — dépenses courantes non saisies`,
        quoi: `Aucun montant pour : ${manquants.join(', ')}.`,
        pourquoi: `Ce sont des dépenses que tout propriétaire paie. Une case vide signifie presque
          toujours un oubli de saisie, donc une déduction perdue — pas une dépense inexistante.`,
        action: `Onglet Logements → ${escH(shortLabel(p.label))}, ou importer le relevé bancaire.`,
        source: 'T776 / TP-128 : les taxes, l’assurance et les intérêts hypothécaires sont déductibles intégralement sur un immeuble entièrement loué.'
      })
    }
  })

  // ── 4. Pièces justificatives manquantes ───────────────────────────────────
  try {
    const a = auditRecus()
    if (a.montantManquant > 1000) {
      ajouter({
        id: 'recus', montant: a.montantManquant * marginal, horizon: 'risque', ton: 'orange',
        titre: 'Déductions sans pièce justificative',
        quoi: `${money(a.montantManquant)} de dépenses déduites sans reçu attaché
               (${a.manquants.length} cellule(s)). En cas de refus, l’impôt supplémentaire serait
               d’environ ${money(a.montantManquant * marginal)}.`,
        pourquoi: `Ce n’est pas un gain à faire : c’est une perte à éviter. Une dépense sans pièce est
          la première refusée en vérification, et la charge de la preuve appartient au contribuable.`,
        action: 'Onglet Fiscal → Reçus → audit des pièces, trié par montant décroissant.',
        source: 'LIR art. 230(1) : obligation de tenir des registres et pièces justificatives.'
      })
    }
  } catch (e) {}

  // ── 5. Acomptes provisionnels ─────────────────────────────────────────────
  try {
    const r = calculImpot()
    const f = fiscal()
    if (r.solde > f.acomptes.seuilFed && r.acomptesVerses === 0) {
      // Les intérêts sur acomptes insuffisants ne sont pas déductibles.
      // Ordre de grandeur : le taux prescrit tourne autour de 8 % par an, appliqué
      // sur une moyenne d'environ six mois de retard.
      const interets = r.solde * 0.08 * 0.5
      ajouter({
        id: 'acomptes', montant: interets, horizon: 'risque', ton: 'orange',
        titre: 'Acomptes provisionnels à verser',
        quoi: `Solde estimé de ${money(r.solde)}, au-delà du seuil de
               ${money(f.acomptes.seuilFed, 0)}, et aucun acompte versé. Intérêts évitables :
               de l’ordre de ${money(interets)}.`,
        pourquoi: `Les intérêts sur acomptes insuffisants ne sont pas déductibles et s’ajoutent au
          solde. C’est de l’argent qui ne rapporte rien.`,
        action: `Onglet Fiscal → Impôt : quatre versements aux dates ${f.acomptes.dates.join(', ')}.`,
        source: 'LIR art. 156 et 161(4.01) ; Loi sur les impôts (Québec), art. 1025 et suivants. Seuil de 1 800 $ d’impôt net aux deux paliers.'
      })
    }
  } catch (e) {}

  // ── 6. Remboursement de TPS/TVQ pour immeuble d'habitation locatif neuf ───
  // Ne se déclenche que si un bâtiment a réellement été acquis récemment.
  try {
    const d = calculDPA(activeYear, true)
    const neufs = (d ? d.pools : []).filter(p => p.locatif && p.ajouts > 100000
      && CAT_BATIMENT.includes(String(p.categorie)))
    if (neufs.length) {
      const base = neufs.reduce((s, p) => s + p.ajouts, 0)
      ajouter({
        id: 'rembours-tps-neuf', montant: Math.min(base, 450000) * 0.05 * 0.36, horizon: 'projet', ton: 'green',
        titre: 'Remboursement de TPS/TVQ pour immeuble locatif neuf',
        quoi: `Un bâtiment de ${money(base, 0)} a été ajouté cette année. S’il s’agit d’un immeuble
          d’habitation NEUF destiné à la location à long terme, une partie de la TPS et de la TVQ
          payées est remboursable.`,
        pourquoi: `Ce remboursement ne s’obtient que sur demande, dans un délai limité. Personne ne
          l’envoie d’office, et il se chiffre en milliers de dollars.`,
        action: 'Formulaires FP-524 (TPS) et VD-370.67 (TVQ) auprès de Revenu Québec. Un immeuble d’au moins 4 logements dont la construction a débuté après le 13 septembre 2023 peut donner droit au remboursement BONIFIÉ de 100 % de la TPS.',
        source: 'Remboursement pour immeuble d’habitation locatif neuf (RIHLN) ; bonification pour les immeubles d’habitation construits expressément pour la location.'
      })
    }
  } catch (e) {}

  // ── 7. Travaux énergétiques subventionnés ─────────────────────────────────
  const capitalAnnee = activeProps().reduce((s, p) =>
    s + (p.capital || []).reduce((ss, c) =>
      ss + Array.from({ length: 12 }, (_, mi) => getMonthlyVal(p.id, 'capital', c, mi))
        .reduce((a, v) => a + v, 0), 0), 0)
  if (capitalAnnee > 3000) {
    ajouter({
      id: 'renoclimat', montant: Math.min(capitalAnnee * 0.15, 31000), horizon: 'projet', ton: 'green',
      titre: 'Subventions de rénovation énergétique non demandées',
      quoi: `${money(capitalAnnee, 0)} de travaux capitalisés cette année. Rénoclimat verse jusqu’à
        31 000 $ pour un duplex, un triplex ou un immeuble à logements multiples, et LogisVert
        d’Hydro-Québec s’y ajoute pour une thermopompe.`,
      pourquoi: `Une subvention reçue réduit le coût en capital du bien (donc la DPA future), mais
        elle entre dans le compte aujourd’hui. C’est le seul « revenu » non imposable de la liste.`,
      action: `Rénoclimat exige une ÉVALUATION ÉNERGÉTIQUE AVANT les travaux : la demande faite après
        coup est refusée. À planifier avant le prochain chantier.`,
      source: `Rénoclimat (quebec.ca) : immeubles résidentiels d’au plus 3 étages hors sol et 600 m²
        au sol, usage résidentiel à plus de 50 %. Chauffez vert a pris fin le 31 mars 2026.`
    })
  }

  // ── 8. Loyers non indexés ─────────────────────────────────────────────────
  try {
    if (typeof baux === 'function') {
      const sansIndexation = baux().filter(b => {
        const debut = String(b.dateDebut || '')
        return debut && (activeYear - (parseInt(debut.slice(0, 4), 10) || activeYear)) >= 2
      })
      if (sansIndexation.length) {
        const loyers = sansIndexation.reduce((s, b) => s + num(b.loyerMensuel), 0)
        // Ordre de grandeur : environ 3 % par année écoulée depuis le début du bail.
        const manqueAGagner = sansIndexation.reduce((s, b) => {
          const ans = activeYear - (parseInt(String(b.dateDebut).slice(0, 4), 10) || activeYear)
          return s + num(b.loyerMensuel) * 12 * 0.03 * Math.min(ans, 5)
        }, 0)
        ajouter({
          id: 'indexation', montant: manqueAGagner, horizon: 'annee', ton: 'blue',
          titre: 'Loyers inchangés depuis le début du bail',
          quoi: `${sansIndexation.length} bail/baux en cours depuis au moins deux ans, pour
            ${money(loyers)} de loyer mensuel. À 3 % par année, le manque à gagner annuel est de
            l’ordre de ${money(manqueAGagner)}.`,
          pourquoi: `Un loyer non ajusté ne se rattrape pas : la hausse permise se calcule sur le
            loyer actuel, et l’écart devient permanent.`,
          action: `Avis de modification du bail à remettre entre 3 et 6 mois avant la fin du bail
            (bail de 12 mois). Onglet Logements → Baux → report avec indexation.`,
          source: `Code civil du Québec, art. 1942 et 1945 ; critères de fixation du Tribunal
            administratif du logement. Le pourcentage réel dépend des taxes, de l’assurance et des
            travaux majeurs de l’immeuble.`
        })
      }
    }
  } catch (e) {}

  // ── 9. Répartition avec le conjoint ───────────────────────────────────────
  try {
    const { liste, partagee } = etatParCoproprietaire()
    const moi = liste.find(g => g.moi)
    if (partagee && moi && moi.net > 0) {
      ajouter({
        id: 'attribution', montant: 0, toujours: true, horizon: 'risque', ton: 'brown',
        titre: 'Répartition entre conjoints : attention aux règles d’attribution',
        quoi: `Le revenu locatif est réparti selon le pourcentage de propriété saisi
          (${fmt(moi.net > 0 ? 100 * moi.net / liste.reduce((s, g) => s + Math.abs(g.net), 0) : 0, 0)} %
          pour vous). Ce pourcentage doit refléter la MISE DE FONDS RÉELLE de chacun.`,
        pourquoi: `Si un conjoint a financé la part de l’autre, le revenu lui est réattribué : la
          répartition « avantageuse » est annulée et l’impôt recalculé, avec intérêts.`,
        action: `Conserver la preuve de la provenance des fonds (relevés de la mise de fonds,
          paiements hypothécaires) avec le dossier de l’année.`,
        source: `LIR art. 74.1(1) : attribution au conjoint du revenu tiré d’un bien transféré.
          Une contribution réellement payée par chacun n’entraîne pas d’attribution.`
      })
    }
  } catch (e) {}

  // ── 10. Clôture d'année ───────────────────────────────────────────────────
  if (!yearClosedInfo() && new Date().getFullYear() > activeYear) {
    ajouter({
      id: 'cloture', montant: 0, toujours: true, horizon: 'risque', ton: 'brown',
      titre: `Année ${activeYear} non clôturée`,
      quoi: `L’année est terminée mais reste modifiable. Les chiffres remis au comptable peuvent
        encore changer sans que personne ne s’en aperçoive.`,
      pourquoi: `Une modification après la production de la déclaration crée un écart silencieux
        entre ce qui a été déclaré et ce que l’app affiche.`,
      action: 'Onglet Fiscal → Clôture : l’app enregistre les totaux et une empreinte.',
      source: ''
    })
  }

  // ── 11. Structure de détention ────────────────────────────────────────────
  ajouter({
    id: 'structure', montant: 0, toujours: true, horizon: 'projet', ton: 'blue',
    titre: 'Détention personnelle ou en société par actions ?',
    quoi: `Pour un parc locatif résidentiel de cette taille, la détention personnelle reste
      généralement plus avantageuse : le revenu locatif d’une société sans employé à temps plein est
      un revenu de PLACEMENT, imposé à environ 50 % avant remboursement.`,
    pourquoi: `L’incorporation coûte en frais annuels et ne donne pas accès à la déduction pour
      petite entreprise sur ce revenu. Elle devient pertinente surtout à partir de 5 à 6 employés à
      temps plein, ou pour la protection d’actif et la transmission.`,
    action: 'Voir docs/FISCALITE.md — section « Inc. ou personnel », avec les sources officielles.',
    source: `LIR art. 125(7) « entreprise de placement déterminée » ; Loi sur les impôts (Québec)
      art. 771.2.1.4 : critère de 5 500 heures rémunérées pour le taux réduit québécois.`
  })

  return out.sort((a, b) => {
    const ordre = { risque: 0, annee: 1, report: 2, projet: 3 }
    return (b.montant - a.montant) || (ordre[a.horizon] - ordre[b.horizon])
  })
}

const HORIZON_LABEL = {
  annee: { txt: 'À récupérer cette année', c: '#2E7D32' },
  report: { txt: 'Impôt différé', c: '#0070C0' },
  projet: { txt: 'Démarche à faire', c: '#7B3F00' },
  risque: { txt: 'Perte à éviter', c: '#C62828' }
}

function renderRecommandations() {
  const el = document.getElementById('reco-body')
  if (!el) return
  const r = recommandations()
  const chiffrees = r.filter(x => x.montant > 0)
  const total = chiffrees.reduce((s, x) => s + x.montant, 0)

  el.innerHTML = `
    ${card('💡 Recommandations — ' + activeYear, `
      ${infoBox(`Chaque recommandation est calculée sur <strong>vos données de ${activeYear}</strong>.
        Elle disparaît une fois suivie. Les montants sont des ordres de grandeur destinés à classer
        les actions par priorité, pas des montants à déclarer.`)}
      ${chiffrees.length ? `<div class="summary-row">
        ${sumCard('Enjeu total estimé', money(total), 'green', chiffrees.length + ' action(s) chiffrée(s)')}
        ${sumCard('Actions', r.length, 'blue')}
      </div>` : ''}
    `, 'green')}

    ${r.length === 0 ? card('✅ Rien à signaler',
        infoBox('Aucune recommandation : les postes courants sont saisis, la DPA est optimisée et les pièces sont au dossier.'), 'green')
      : r.map(x => {
        const h = HORIZON_LABEL[x.horizon] || HORIZON_LABEL.projet
        return card(
          `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span>${escH(x.titre)}</span>
            ${x.montant > 0 ? `<span style="font-weight:800;white-space:nowrap">${money(x.montant, 0)}</span>` : ''}
          </div>`, `
          <div style="font-size:10px;font-weight:700;color:${h.c};text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">${h.txt}</div>
          <div style="margin-bottom:8px">${x.quoi}</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px"><strong>Pourquoi :</strong> ${x.pourquoi}</div>
          <div class="info-box" style="margin:0"><strong>À faire :</strong> ${x.action}</div>
          ${x.source ? sourceNote('<strong>Source :</strong> ' + x.source) : ''}
        `, x.ton || 'dark')
      }).join('')}`
}

// Résumé sur l'accueil : les trois premières, sans détail. L'accueil doit
// donner envie d'ouvrir la liste, pas la remplacer.
function renderRecoAccueil() {
  const el = document.getElementById('home-reco')
  if (!el) return
  let r = []
  try { r = recommandations().filter(x => x.montant > 0).slice(0, 3) } catch (e) { return }
  if (!r.length) { el.innerHTML = ''; return }
  const total = r.reduce((s, x) => s + x.montant, 0)
  el.innerHTML = `<div class="card" style="cursor:pointer" onclick="showTab('fiscal');showFiscalSub('reco')">
    <div class="card-header green">💡 ${money(total, 0)} à aller chercher</div>
    <div class="card-body" style="padding:10px 12px">
      ${r.map(x => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:3px 0">
        <span>${escH(x.titre)}</span>
        <strong style="white-space:nowrap">${money(x.montant, 0)}</strong></div>`).join('')}
      <div style="font-size:11px;color:var(--text2);margin-top:6px">Toucher pour voir le détail →</div>
    </div></div>`
}

registerModule({
  id: 'recommandations',
  label: 'Recommandations',
  render: renderRecommandations
})
