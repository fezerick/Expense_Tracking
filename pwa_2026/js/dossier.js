// ════════════════════════════════════════════════════════════════════════════
// dossier.js — DOSSIER COMPTABLE EN UN SEUL FICHIER
//
// Ce qu'on remet aujourd'hui à un comptable : un PDF, un CSV, et des photos
// envoyées séparément dont les noms (« IMG_4812.jpg ») ne disent pas à quelle
// dépense elles correspondent. Le comptable redemande, on recherche, on renvoie.
//
// Un ZIP règle le problème à condition de nommer les pièces : chaque reçu porte
// l'immeuble, la catégorie, le mois et le montant de la cellule qu'il justifie,
// et un index.csv rétablit la correspondance exacte avec la cellule.
//
// Tout est assemblé dans le navigateur — rien n'est téléversé.
// ════════════════════════════════════════════════════════════════════════════

const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'

function nomFichierSain(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\s+/g, '_').slice(0, 60)
}

// Un data URL « data:image/jpeg;base64,… » → { base64, ext }
function decouperDataURL(src) {
  const m = String(src || '').match(/^data:([^;]+);base64,(.*)$/)
  if (!m) return null
  const mime = m[1]
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp'
            : mime.includes('pdf') ? 'pdf' : 'jpg'
  return { base64: m[2], ext, mime }
}

async function genererDossierZIP() {
  const bouton = document.getElementById('btn-zip')
  if (bouton) { bouton.disabled = true; bouton.textContent = '⏳ Assemblage…' }
  try {
    await loadScript(JSZIP_CDN)
    const zip = new JSZip()
    const an = activeYear
    const journal = []

    // 1 ── Le rapport PDF, identique à celui du bouton « Rapport PDF ».
    try {
      const doc = await generatePDF({ retourner: true })
      if (doc) {
        zip.file(`Sommaire_fiscal_${an}.pdf`, doc.output('blob'))
        journal.push('Sommaire_fiscal_' + an + '.pdf (' + (generatePDF._lastPages || '?') + ' pages)')
      }
    } catch (e) {
      journal.push('⚠️ Rapport PDF non inclus : ' + e.message)
    }

    // 2 ── Les données chiffrées, réutilisables dans un tableur.
    zip.file(`Depenses_${an}.csv`, '﻿' + exportCSV({ retourner: true }))
    journal.push(`Depenses_${an}.csv`)

    // 3 ── Les reçus, nommés d'après la cellule qu'ils justifient.
    const receipts = state.receipts || {}
    const notes = state.notes || {}
    const idx = [csvLigne(['Fichier', 'Immeuble', 'Section', 'Categorie', 'Mois', 'Montant', 'Note', 'Cle interne'])]
    let nbRecus = 0, sansPiece = 0
    const cles = Object.keys(receipts).sort()
    cles.forEach(key => {
      const d = decouperDataURL(receipts[key])
      if (!d) return
      const p = typeof parseCleRecu === 'function' ? parseCleRecu(key) : null
      const prop = p ? propById(p.propId) : null
      const etiq = prop ? shortLabel(prop.label) : (p ? p.propId : 'autre')
      const mois = p ? String(p.mi + 1).padStart(2, '0') : '00'
      const montant = p ? getMonthlyVal(p.propId, p.section, p.cat, p.mi) : 0
      const nom = [nomFichierSain(etiq), mois, nomFichierSain(p ? p.cat : key), fmt(montant).replace(/\s/g, '')]
        .filter(Boolean).join('_') + '.' + d.ext
      zip.file('recus/' + nom, d.base64, { base64: true })
      idx.push(csvLigne([nom, etiq, p ? p.section : '', p ? p.cat : '',
        p ? MONTHS_FR[p.mi] : '', fmt(montant), notes[key] || '', key]))
      nbRecus++
    })

    // Les cellules qui portent un montant SANS pièce : la liste qu'une
    // vérification demande en premier, livrée dans le dossier plutôt que
    // découverte six mois plus tard.
    if (typeof auditRecus === 'function') {
      const a = auditRecus()
      sansPiece = a.manquants.length
      const m = [csvLigne(['Immeuble', 'Section', 'Categorie', 'Mois', 'Montant'])]
      a.manquants.forEach(x => m.push(csvLigne([x.prop, x.section, x.cat, MONTHS_FR[x.mi], fmt(x.montant)])))
      m.push('')
      m.push(csvLigne(['Montant sans piece', fmt(a.montantManquant)]))
      m.push(csvLigne(['Montant justifie', fmt(a.montantPresent)]))
      m.push(csvLigne(['Couverture (%)', fmt(a.couverture * 100, 1)]))
      zip.file('pieces_manquantes.csv', '﻿' + m.join('\n'))
      journal.push('pieces_manquantes.csv (' + sansPiece + ' cellule(s))')
    }

    if (nbRecus) {
      zip.file('recus/index.csv', '﻿' + idx.join('\n'))
      journal.push('recus/ — ' + nbRecus + ' pièce(s) + index.csv')
    }

    // 4 ── Les notes attachées à des cellules sans photo : une explication
    // écrite vaut une pièce pour une dépense sans facture (un dépôt bancaire).
    const notesSeules = Object.keys(notes).filter(k => notes[k] && !receipts[k])
    if (notesSeules.length) {
      const n = [csvLigne(['Cle', 'Note'])]
      notesSeules.sort().forEach(k => n.push(csvLigne([k, notes[k]])))
      zip.file('notes.csv', '﻿' + n.join('\n'))
      journal.push('notes.csv (' + notesSeules.length + ')')
    }

    // 5 ── Les annexes produites par les modules fiscaux.
    const annexes = [
      ['registre_kilometrage.csv', () => registreKmCSV()],
      ['rl31_sommaire.csv', () => (typeof bauxRL31 === 'function' && bauxRL31().length) ? rl31CSV() : null],
      ['dpa_registre.csv', () => (typeof calculDPA === 'function') ? dpaCSV() : null],
      ['etat_coproprietaires.csv', () => coproCSV()],
      ['impot_estime.csv', () => (typeof calculImpot === 'function') ? impotCSV() : null],
      ['fpz500_tps_tvq.csv', () => (typeof calculTaxes === 'function' && setup.modules.rideshare) ? taxesCSV() : null]
    ]
    annexes.forEach(([nom, fn]) => {
      try {
        const c = fn()
        if (c) { zip.file('annexes/' + nom, '﻿' + c); journal.push('annexes/' + nom) }
      } catch (e) { journal.push('⚠️ annexes/' + nom + ' : ' + e.message) }
    })

    // 6 ── La sauvegarde complète : seul fichier qui permette de reconstituer
    // l'année à l'identique dans l'app.
    zip.file(`sauvegarde_${an}.json`, JSON.stringify(backupPayload(), null, 2))
    journal.push(`sauvegarde_${an}.json`)

    // 7 ── Le mode d'emploi, pour que le destinataire sache quoi ouvrir.
    const verrou = yearClosedInfo()
    zip.file('LISEZ-MOI.txt', [
      `DOSSIER COMPTABLE — ANNÉE ${an}`,
      `Généré le ${new Date().toLocaleString('fr-CA')}`,
      verrou ? `Année CLÔTURÉE le ${(verrou.at || '').slice(0, 10)} — chiffres figés.`
             : `Année NON clôturée : les chiffres peuvent encore changer.`,
      '',
      'CONTENU',
      ...journal.map(j => '  • ' + j),
      '',
      'COMMENT LIRE LES NOMS DE REÇUS',
      '  Immeuble_MM_Catégorie_Montant.jpg',
      '  Le fichier recus/index.csv donne la correspondance exacte avec la',
      '  cellule du tableau (immeuble, section, catégorie, mois, montant).',
      '',
      'AVERTISSEMENT',
      '  Les montants d’impôt, de DPA et de TPS/TVQ sont des estimations',
      '  produites par l’application à partir des paramètres fiscaux de',
      '  l’année. Ils aident à préparer la déclaration ; ils ne la remplacent',
      '  pas et doivent être validés avant production.'
    ].join('\n'))

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    dl(`Dossier_comptable_${an}.zip`, blob, 'application/zip')
    toast(`📦 Dossier assemblé — ${nbRecus} reçu(s), ${journal.length} fichier(s)`, 4200)
  } catch (e) {
    toast('❌ ' + e.message, 5000)
    console.error(e)
  } finally {
    if (bouton) { bouton.disabled = false; bouton.textContent = '📦 Générer le dossier comptable (ZIP)' }
  }
}

// ── ANNEXES EN CSV ─────────────────────────────────────────────────────────
// Chaque annexe réutilise le calcul de son module : aucun chiffre n'est
// recalculé ici, sinon le ZIP finirait par contredire l'écran.
function registreKmCSV() {
  const c = coherenceKm()
  const L = [csvLigne(['Date', 'Destination', 'Motif', 'Km'])]
  c.trips.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(t => {
    const p = propById(t.property)
    L.push(csvLigne([t.date, t.property === 'other' ? (t.customDest || 'Autre') : shortLabel((p || {}).label || ''),
      t.reason || '', fmt(num(t.km), 1)]))
  })
  L.push('', csvLigne(['Odometre 1er janvier', c.odoDebut || '']),
            csvLigne(['Odometre 31 decembre', c.odoFin || '']),
            csvLigne(['Km affaires', fmt(c.kmAffaires, 1)]),
            csvLigne(['Km total annuel', fmt(c.kmDeclare, 0)]),
            csvLigne(['Part affaires (%)', fmt(c.prorata * 100, 2)]))
  return L.join('\n')
}

function rl31CSV() {
  const L = [csvLigne(['Adresse', 'Unite', 'Nb chambres', 'Nb locataires', 'Locataires', 'Loyer mensuel'])]
  bauxRL31().forEach(r => L.push(csvLigne([r.adresse, r.unite, r.nbChambres, r.nbLocataires,
    r.locataires, fmt(r.loyerMensuel)])))
  return L.join('\n')
}

function dpaCSV() {
  const d = calculDPA(activeYear, true)
  if (!d || !d.pools.length) return null
  const L = [csvLigne(['Immeuble', 'Categorie', 'Taux', 'FNACC ouverture', 'Ajouts', 'Dispositions',
                       'Reduction demi-taux', 'Base', 'DPA maximale', 'DPA reclamee', 'FNACC cloture',
                       'Classe distincte'])]
  d.pools.forEach(p => L.push(csvLigne([p.nomProp, 'cat. ' + p.cat.code, fmt(p.taux * 100, 1) + '%',
    fmt(p.ouverture), fmt(p.ajouts), fmt(p.dispositions), fmt(p.reduction), fmt(p.base),
    fmt(p.dpaMax), fmt(p.reclamee), fmt(p.fermeture), p.distincte ? 'oui' : 'non'])))
  L.push('', csvLigne(['DPA totale reclamee', fmt(d.total)]),
            csvLigne(['dont locatif', fmt(d.totalLocatif)]),
            csvLigne(['Plafond art. 1100(11) - revenu locatif net avant DPA',
                      d.plafondLocatif == null ? 'n/d' : fmt(d.plafondLocatif)]))
  return L.join('\n')
}

function coproCSV() {
  if (typeof etatParCoproprietaire !== 'function') return null
  const { liste, partagee } = etatParCoproprietaire()
  if (!partagee) return null
  const L = [csvLigne(['Personne', 'Immeuble', 'Part (%)', 'Revenus', 'Depenses', 'Benefice net'])]
  liste.forEach(g => {
    g.immeubles.forEach(i => L.push(csvLigne([g.nom, i.label, fmt(i.pct, 2),
      fmt(i.rev), fmt(i.dep), fmt(i.net)])))
    L.push(csvLigne([g.nom, 'TOTAL', '', fmt(g.rev), fmt(g.dep), fmt(g.net)]))
  })
  return L.join('\n')
}

function impotCSV() {
  const r = calculImpot()
  const L = [csvLigne(['Poste', 'Montant'])]
  const add = (k, v) => L.push(csvLigne([k, fmt(v)]))
  add('Revenus locatifs', r.revLoc)
  add('Depenses locatives', r.depLoc)
  add('DPA locative reclamee', r.dpaLoc)
  add('Revenu locatif net', r.netLoc)
  add('Revenus Uber + Lyft', r.revEnt)
  add('Depenses entreprise (vehicule + DPA)', r.depEnt)
  add('Revenu entreprise net', r.netEnt)
  add('Revenu T4', r.t4)
  add('Autres revenus nets', r.autres)
  add('Revenu net total', r.revenuNet)
  L.push('')
  add('Impot federal net', r.fedNet)
  add('Impot Quebec net', r.qcNet)
  add('RRQ (total)', r.rrq.total)
  add('RQAP', r.rqap.montant)
  add('FSS', r.fss.montant)
  add('TOTAL avant retenues', r.totalAvantRetenues)
  add('Retenues a la source', r.retenues)
  add('Acomptes deja verses', r.acomptesVerses)
  add('Solde estime', r.solde)
  add('Provision a constituer (hors T4)', r.provision)
  L.push('', csvLigne(['Taux marginal (%)', fmt(r.marginal * 100, 2)]),
            csvLigne(['Taux effectif (%)', fmt(r.tauxEffectif * 100, 2)]))
  L.push('', csvLigne(['AVERTISSEMENT',
    'Estimation produite par l application. A valider avant production de la declaration.']))
  return L.join('\n')
}

function taxesCSV() {
  const t = calculTaxes()
  const L = [csvLigne(['Ligne FPZ-500', 'Libelle', 'Montant'])]
  L.push(csvLigne(['101', 'Fournitures taxables (hors taxes)', fmt(t.fournituresTaxables)]))
  L.push(csvLigne(['105', 'TPS percue', fmt(t.tpsPercue)]))
  L.push(csvLigne(['205', 'TVQ percue', fmt(t.tvqPercue)]))
  L.push(csvLigne(['108', 'CTI', fmt(t.cti)]))
  L.push(csvLigne(['208', 'RTI', fmt(t.rti)]))
  L.push(csvLigne(['109', 'TPS nette', fmt(t.tpsNette)]))
  L.push(csvLigne(['209', 'TVQ nette', fmt(t.tvqNette)]))
  L.push('')
  L.push(csvLigne(['', 'TPS deja versee par la plateforme', fmt(t.tpsVerseeUber)]))
  L.push(csvLigne(['', 'TVQ deja versee par la plateforme', fmt(t.tvqVerseeUber)]))
  L.push(csvLigne(['', 'Solde TPS', fmt(t.tpsSolde)]))
  L.push(csvLigne(['', 'Solde TVQ', fmt(t.tvqSolde)]))
  L.push('')
  L.push(csvLigne(['', 'Part commerciale du vehicule (%)', fmt(t.prorata * 100, 2)]))
  L.push(csvLigne(['', 'Km commerciaux', fmt(t.kmComm, 0)]))
  L.push(csvLigne(['', 'Km total annuel', fmt(t.kmTotal, 0)]))
  return L.join('\n')
}

// ── AFFICHAGE ──────────────────────────────────────────────────────────────
function renderDossier() {
  const el = document.getElementById('dossier-body')
  if (!el) return
  const nbRecus = Object.keys(state.receipts || {}).length
  const audit = typeof auditRecus === 'function' ? auditRecus() : null
  const verrou = yearClosedInfo()

  el.innerHTML = card('📦 Dossier comptable — ' + activeYear, `
    ${infoBox(`Un seul fichier à remettre au comptable : le rapport PDF, le CSV des chiffres,
      <strong>les reçus nommés d’après la cellule qu’ils justifient</strong>, les annexes fiscales
      et la sauvegarde complète.`)}
    <div class="summary-row">
      ${sumCard('Reçus', nbRecus, 'blue')}
      ${audit ? sumCard('Sans pièce', audit.manquants.length,
        audit.manquants.length ? 'orange' : 'green', money(audit.montantManquant)) : ''}
      ${sumCard('Couverture', audit ? fmt(audit.couverture * 100, 0) + ' %' : '—',
        audit && audit.couverture > 0.9 ? 'green' : 'orange')}
    </div>
    ${!verrou ? warnBox(`L’année n’est <strong>pas clôturée</strong>. Le dossier reflétera les
      chiffres d’aujourd’hui, qui pourront encore changer. Pour un dossier qui ne dérive plus,
      clôturez l’année d’abord.`) : ''}
    <button class="btn btn-primary btn-full" id="btn-zip" onclick="genererDossierZIP()">
      📦 Générer le dossier comptable (ZIP)</button>
    ${sourceNote(`L’assemblage se fait entièrement dans le navigateur. JSZip est chargé depuis un
      CDN au premier usage : une connexion est nécessaire cette fois-là.`)}
  `, 'blue')
}

registerModule({
  id: 'dossier',
  label: 'Dossier comptable',
  render: renderDossier
})
