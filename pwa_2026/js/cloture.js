// ════════════════════════════════════════════════════════════════════════════
// cloture.js — CLÔTURE D'ANNÉE VERROUILLÉE
//
// Rien n'empêchait de modifier une année après avoir produit la déclaration.
// Les chiffres remis au comptable pouvaient donc dériver sans trace : six mois
// plus tard, impossible de dire si le total affiché est celui qui a été déclaré.
//
// La clôture fige l'année en lecture seule et enregistre une EMPREINTE des
// données fiscales. Le déverrouillage est possible — il faut bien pouvoir
// corriger — mais il est horodaté et conservé, et l'empreinte permet ensuite de
// détecter que les chiffres ne sont plus ceux de la clôture.
// ════════════════════════════════════════════════════════════════════════════

// Empreinte : hachage djb2 d'une sérialisation canonique (clés triées) des
// seules données fiscales. Les reçus (photos) et les notes sont exclus : une
// photo ajoutée après coup ne change pas un chiffre déclaré.
//
// La sérialisation ÉLAGUE les cellules vides. '' , null, 0 et '0' décrivent tous
// la même absence de montant, et le simple fait d'ouvrir un écran crée des
// structures vides — ensurePropBucket() ajoute par exemple `state.recurring[id] =
// {}` dès qu'on saisit un montant. Sans élagage, revenir sur un champ puis y
// remettre la valeur d'origine suffisait à faire dire à l'app que les chiffres
// déclarés ne correspondaient plus à la clôture : une fausse alerte qui ruine la
// confiance dans le verrou. Les positions dans un tableau de 12 mois sont en
// revanche conservées (un mois vide reste `null` au milieu de l'année).
function empreinteFiscale(st) {
  const EXCLUS = ['receipts', 'recusIndex', 'notes', 'closed', 'closedHistory', 'checklist', 'version']
  const canonique = val => {
    if (val === '' || val == null) return null
    if (typeof val === 'number') return val === 0 ? null : val
    if (typeof val === 'string' && !isNaN(+val)) return +val === 0 ? null : +val
    if (typeof val === 'boolean') return val
    if (Array.isArray(val)) {
      const a = val.map(canonique)
      return a.some(x => x !== null) ? a : null
    }
    if (typeof val === 'object') {
      const o = {}
      Object.keys(val).sort().forEach(k => {
        const c = canonique(val[k])
        if (c !== null) o[k] = c
      })
      return Object.keys(o).length ? o : null
    }
    return val
  }
  const pertinent = {}
  Object.keys(st).sort().forEach(k => {
    if (EXCLUS.includes(k)) return
    const c = canonique(st[k])
    if (c !== null) pertinent[k] = c
  })
  const canon = JSON.stringify(pertinent)
  let h = 5381
  for (let i = 0; i < canon.length; i++) h = ((h << 5) + h + canon.charCodeAt(i)) | 0
  return (h >>> 0).toString(16).padStart(8, '0') + '-' + canon.length.toString(36)
}

function totauxCloture(st) {
  // Les chiffres figés sont ceux du modèle de revenu du module d'impôt, et non
  // la somme brute de l'écran d'accueil : totalDepAll() additionne les dépenses
  // locatives et la part véhicule des activités de transport, si bien que son
  // « bénéfice net » ne correspond à aucune ligne déclarable. assiettes()
  // sépare locatif et entreprise et tient compte de la DPA réclamée.
  if (typeof assiettes === 'function') {
    const a = assiettes()
    return {
      rev: a.revLoc + a.revEnt,
      dep: a.depLoc + a.depEnt + a.dpaLoc + a.dpaEnt,
      net: a.netLoc + a.netEnt,
      netLoc: a.netLoc, netEnt: a.netEnt, dpa: a.dpaLoc + a.dpaEnt
    }
  }
  const rev = totalRevAll(), dep = totalDepAll()
  return { rev, dep, net: rev - dep }
}

function cloturerAnnee() {
  if (yearClosed()) return
  const emp = empreinteFiscale(state)
  const t = totauxCloture(state)
  const manques = auditAvantCloture()

  const html = `
    ${infoBox(`La clôture fige <strong>${activeYear}</strong> en lecture seule et enregistre
      l'empreinte des chiffres ci-dessous. Vous pourrez déverrouiller l'année, mais le
      déverrouillage sera inscrit au dossier.`)}
    <div class="summary-row">
      ${sumCard('Revenus', money(t.rev), 'blue')}
      ${sumCard('Dépenses', money(t.dep), 'brown')}
    </div>
    <div class="summary-row">
      ${sumCard('Bénéfice net', money(t.net), t.net >= 0 ? 'green' : 'red')}
      ${sumCard('Empreinte', '<span style="font-size:13px;font-family:ui-monospace,monospace">' + emp.split('-')[0] + '</span>', 'gray')}
    </div>
    ${t.netLoc != null ? sourceNote(`Détail : locatif ${money(t.netLoc)} (T776 / TP-128)
      · entreprise ${money(t.netEnt)} (T2125 / TP-80)
      ${t.dpa > 0 ? '· dont ' + money(t.dpa) + ' de DPA réclamée' : ''}`) : ''}
    ${manques.length
      ? warnBox('À vérifier avant de clôturer :<ul style="margin:6px 0 0 18px;padding:0">'
          + manques.map(m => `<li>${m}</li>`).join('') + '</ul>')
      : infoBox('✅ Aucune anomalie détectée dans les contrôles de cohérence.')}
    <div class="divider"></div>
    <button class="btn btn-primary btn-full" onclick="confirmerCloture()">🔒 Clôturer ${activeYear}</button>
    <button class="btn btn-ghost btn-sm btn-full" style="margin-top:8px" onclick="closeSheet()">Annuler</button>`

  openSheet('🔒 Clôturer l\'année ' + activeYear, html, () => renderCloture())
}

function confirmerCloture() {
  state.closed = {
    at: new Date().toISOString(),
    par: 'manuel',
    totaux: totauxCloture(state),
    empreinte: empreinteFiscale(state),
    fiscal: fiscal().verifie || null
  }
  save()
  closeSheet()
  toast('🔒 Année ' + activeYear + ' clôturée', 2600)
  renderCloture(); refreshAll()
}

function deverrouillerAnnee() {
  const c = yearClosedInfo()
  if (!c) return
  if (!confirm(`Déverrouiller ${activeYear} ?\n\nLe déverrouillage sera inscrit au dossier, avec les totaux de la clôture. Si vous modifiez ensuite les chiffres, l'app signalera qu'ils ne correspondent plus à ce qui a été clôturé.`)) return
  state.closedHistory = state.closedHistory || []
  state.closedHistory.push({ ...c, unlockedAt: new Date().toISOString() })
  delete state.closed
  save()
  toast('🔓 Année ' + activeYear + ' déverrouillée', 2600)
  renderCloture(); refreshAll()
}

// Contrôles de cohérence : ce qu'un comptable remarquerait en ouvrant le
// dossier. Volontairement conservateur — ce sont des avertissements, pas des
// blocages.
function auditAvantCloture() {
  const out = []
  const kmTotal = num(state.settings.kmTotalAnnuel)
  const kmAff = num(state.uber.km_online) + getLyftKmTotal() + getRentalKmTotal()
  if (kmTotal > 0 && kmAff > kmTotal) {
    out.push(`Les kilomètres d'affaires (${fmt(kmAff, 0)} km) dépassent le total annuel du véhicule (${fmt(kmTotal, 0)} km).`)
  }
  if (kmTotal <= 0 && kmAff > 0) out.push('Le kilométrage total annuel du véhicule n\'est pas saisi : toute la proration est à 0.')

  activeProps().forEach(p => {
    const t = propTotals(p.id)
    if (t.rev === 0 && t.dep > 0) out.push(`${escH(shortLabel(p.label))} : des dépenses mais aucun revenu déclaré.`)
    if (t.net < 0 && t.rev > 0) out.push(`${escH(shortLabel(p.label))} : perte locative de ${money(Math.abs(t.net))} — vérifiez qu'aucune DPA ne la crée (Règl. 1100(11)).`)
  })

  if (typeof auditRecus === 'function') {
    const a = auditRecus()
    if (a.manquants.length) out.push(`${a.manquants.length} montant(s) sans reçu joint, pour ${money(a.montantManquant)}.`)
  }
  if (typeof ventilations === 'function' && ventilations().some(v => !v.applique && num(v.montant) > 0)) {
    out.push('Des ventilations saisies ne sont pas appliquées aux cellules.')
  }
  return out
}

function renderCloture() {
  const el = document.getElementById('cloture-body')
  if (!el) return
  const c = yearClosedInfo()
  const hist = state.closedHistory || []

  if (!c) {
    const derive = hist.length
      ? sourceNote(`Cette année a déjà été clôturée puis déverrouillée ${hist.length} fois. Dernière clôture :
          ${new Date(hist[hist.length - 1].at).toLocaleDateString('fr-CA')} — bénéfice net alors
          ${money(hist[hist.length - 1].totaux.net)}.`)
      : ''
    el.innerHTML = card('🔓 Année ' + activeYear + ' — ouverte', `
      ${infoBox(`L'année est modifiable. Une fois la déclaration produite, la clôture fige les
        chiffres et permet de détecter toute modification ultérieure.`)}
      ${derive}
      <button class="btn btn-primary btn-full" style="margin-top:10px" onclick="cloturerAnnee()">🔒 Clôturer ${activeYear}</button>
    `, 'dark')
    return
  }

  const empActuelle = empreinteFiscale(state)
  const intacte = empActuelle === c.empreinte
  const t = c.totaux || {}

  el.innerHTML = card('🔒 Année ' + activeYear + ' — clôturée', `
    ${intacte
      ? infoBox(`✅ Les chiffres sont <strong>identiques</strong> à ceux de la clôture du
          ${new Date(c.at).toLocaleDateString('fr-CA')}.`)
      : warnBox(`⚠️ Les chiffres <strong>ne correspondent plus</strong> à l'empreinte de la clôture.
          Une modification a eu lieu malgré le verrou (import, synchronisation depuis un autre
          appareil, ou restauration de sauvegarde). Comparez avec les totaux ci-dessous avant de
          transmettre quoi que ce soit.
          ${typeof journalDepuisCloture === 'function' && journalDepuisCloture().length
            ? `<button class="btn btn-ghost btn-sm btn-full" style="margin-top:8px"
                 onclick="journalVoirDepuisCloture()">🕘 Voir les ${journalDepuisCloture().length}
                 modification(s) inscrites depuis la clôture</button>`
            : ''}`)}
    <div class="summary-row">
      ${sumCard('Revenus à la clôture', money(t.rev), 'blue')}
      ${sumCard('Dépenses à la clôture', money(t.dep), 'brown')}
    </div>
    <div class="summary-row">
      ${sumCard('Bénéfice net à la clôture', money(t.net), 'green')}
      ${sumCard('Bénéfice net actuel', money(totauxCloture(state).net), intacte ? 'gray' : 'red')}
    </div>
    ${sourceNote(`Clôturée le ${new Date(c.at).toLocaleString('fr-CA')}
      · empreinte <span style="font-family:ui-monospace,monospace">${escH(c.empreinte)}</span>
      ${c.fiscal ? '· paramètres fiscaux vérifiés le ' + escH(c.fiscal) : ''}`)}
    <button class="btn btn-ghost btn-sm btn-full" style="margin-top:10px" onclick="deverrouillerAnnee()">🔓 Déverrouiller pour corriger</button>
  `, 'green')
}

registerModule({
  id: 'cloture',
  label: 'Clôture d\'année',
  render: renderCloture
})
