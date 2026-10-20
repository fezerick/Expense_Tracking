// ════════════════════════════════════════════════════════════════════════════
// import-bancaire.js — IMPORT DES RELEVÉS AVEC RÈGLES APPRISES
//
// C'est la fonctionnalité qui change le temps passé dans l'app : au lieu de
// remplir des centaines de cellules, on revoit une file de transactions.
//
// Trois décisions de conception :
//
// 1. RIEN n'est écrit dans les cellules sans un geste explicite. Un import qui
//    classe tout seul produit des totaux que personne ne peut plus expliquer.
// 2. Les règles vivent dans `setup` (donc hors année, hors synchronisation
//    Firestore) : « HYDRO-QUEBEC → Électricité de l'immeuble X » reste vrai
//    d'une année à l'autre.
// 3. Chaque transaction importée laisse une empreinte (date + montant +
//    libellé). Réimporter le même relevé ne produit donc pas de doublon — le
//    chevauchement de deux relevés mensuels est la règle, pas l'exception.
//
// Aucune donnée ne quitte l'appareil : les fichiers sont lus par le navigateur.
// ════════════════════════════════════════════════════════════════════════════

function reglesImport() {
  if (!Array.isArray(setup.reglesImport)) setup.reglesImport = []
  return setup.reglesImport
}
function fileImport() {
  if (!Array.isArray(state.importQueue)) state.importQueue = []
  return state.importQueue
}
function empreintesImport() {
  if (!Array.isArray(state.importHashes)) state.importHashes = []
  return state.importHashes
}

// ── CIBLES DE CLASSEMENT ───────────────────────────────────────────────────
// Les dépenses déductibles et les postes du véhicule viennent de ventilation.js ;
// on y ajoute les revenus (un loyer encaissé est un dépôt au relevé) et le
// capital (une rénovation apparaît au relevé comme n'importe quelle dépense,
// mais ne se déduit pas la même année).
function ciblesImport() {
  const out = ciblesVentilation().map(c => ({ ...c, section: c.type === 'veh' ? 'veh' : 'deductibles' }))
  activeProps().forEach(p => {
    (p.revenus || []).forEach(cat => out.push({
      key: 'rev|' + p.id + '|' + cat, groupe: '💰 ' + shortLabel(p.label),
      cat, propId: p.id, type: 'prop', section: 'revenus'
    }))
    ;(p.capital || []).forEach(cat => out.push({
      key: 'cap|' + p.id + '|' + cat, groupe: '🏗 ' + shortLabel(p.label),
      cat, propId: p.id, type: 'prop', section: 'capital'
    }))
  })
  return out
}
function cibleImportParKey(key) { return ciblesImport().find(c => c.key === key) || null }

// ── LECTURE DES FICHIERS ───────────────────────────────────────────────────
// Découpe une ligne CSV en respectant les guillemets : un libellé bancaire
// contient très souvent une virgule (« PAIEMENT, SUCC 1234 »).
function csvDecouper(ligne, sep) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"') { if (q && ligne[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === sep && !q) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}

function detecterSeparateur(texte) {
  const l = texte.split(/\r?\n/).find(x => x.trim()) || ''
  const cands = [',', ';', '\t', '|']
  return cands.reduce((best, s) =>
    csvDecouper(l, s).length > csvDecouper(l, best).length ? s : best, ',')
}

// Les banques canadiennes n'ont pas d'en-tête commun. On reconnaît les colonnes
// par leur contenu plutôt que par leur nom : une date, un ou deux montants, et
// le reste est le libellé.
function parseCSVBancaire(texte) {
  const sep = detecterSeparateur(texte)
  const lignes = texte.split(/\r?\n/).filter(l => l.trim())
  if (!lignes.length) return []
  const grille = lignes.map(l => csvDecouper(l, sep))

  // Un en-tête est une première ligne dont aucune cellule n'est une date.
  const aEntete = !grille[0].some(c => parseDateBancaire(c))
  const entete = aEntete ? grille[0].map(c => c.toLowerCase()) : []
  const corps = aEntete ? grille.slice(1) : grille

  const idx = n => entete.findIndex(h => n.some(x => h.includes(x)))
  let iDate = idx(['date']), iDesc = idx(['description', 'libell', 'détail', 'detail', 'narrative', 'transaction'])
  let iDeb = idx(['débit', 'debit', 'retrait', 'withdraw']), iCred = idx(['crédit', 'credit', 'dépôt', 'depot', 'deposit'])
  let iMont = idx(['montant', 'amount'])

  const out = []
  corps.forEach(cells => {
    // Repli par détection : la première cellule qui est une date, le plus grand
    // nombre reconnaissable comme montant, et la plus longue cellule textuelle.
    let date = iDate >= 0 ? parseDateBancaire(cells[iDate]) : null
    if (!date) { for (const c of cells) { const d = parseDateBancaire(c); if (d) { date = d; break } } }
    if (!date) return

    let montant = null
    if (iDeb >= 0 || iCred >= 0) {
      const deb = iDeb >= 0 ? num(cells[iDeb]) : 0
      const cred = iCred >= 0 ? num(cells[iCred]) : 0
      montant = cred ? cred : -Math.abs(deb)
    } else if (iMont >= 0) {
      montant = num(cells[iMont])
    } else {
      const nums = cells.map((c, i) => ({ i, v: num(c), brut: c }))
        .filter(x => x.brut && /\d/.test(x.brut) && !parseDateBancaire(x.brut) && x.v !== 0)
      if (!nums.length) return
      montant = nums.reduce((a, b) => Math.abs(b.v) > Math.abs(a.v) ? b : a).v
    }
    if (!montant) return

    let libelle = iDesc >= 0 ? cells[iDesc] : ''
    if (!libelle) {
      libelle = cells.filter(c => /[A-Za-zÀ-ÿ]{3,}/.test(c) && !parseDateBancaire(c))
        .sort((a, b) => b.length - a.length)[0] || 'Transaction'
    }
    out.push({ date, libelle: libelle.replace(/\s+/g, ' ').trim(), montant })
  })
  return out
}

// Accepte AAAA-MM-JJ, JJ/MM/AAAA, MM/JJ/AAAA et AAAAMMJJ. Pour JJ/MM contre
// MM/JJ : si le premier nombre dépasse 12, c'est le jour ; sinon on suit le
// réglage de l'utilisateur, affiché dans l'écran d'import.
function parseDateBancaire(s, ordreUS) {
  s = String(s || '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return isoValide(m[1], m[2], m[3])
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return isoValide(m[1], m[2], m[3])
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (m) {
    const a = m[3].length === 2 ? '20' + m[3] : m[3]
    const us = ordreUS != null ? ordreUS : (setup.importOrdreUS === true)
    if (+m[1] > 12) return isoValide(a, m[2], m[1])
    if (+m[2] > 12) return isoValide(a, m[1], m[2])
    return us ? isoValide(a, m[1], m[2]) : isoValide(a, m[2], m[1])
  }
  return null
}

function isoValide(a, m, j) {
  a = +a; m = +m; j = +j
  if (!(a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && j >= 1 && j <= 31)) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`
}

// OFX/QFX : format des exports « Quicken » de la plupart des banques. Le corps
// est du SGML, pas du XML — on extrait les <STMTTRN> à la main.
function parseOFX(texte) {
  const out = []
  const blocs = texte.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || []
  blocs.forEach(b => {
    const tag = n => { const m = b.match(new RegExp('<' + n + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : '' }
    const dt = tag('DTPOSTED').slice(0, 8)
    const date = isoValide(dt.slice(0, 4), dt.slice(4, 6), dt.slice(6, 8))
    const montant = num(tag('TRNAMT'))
    const libelle = [tag('NAME'), tag('MEMO')].filter(Boolean).join(' — ') || 'Transaction'
    // FITID : identifiant unique attribué par l'institution financière, stable
    // d'un téléchargement à l'autre (spec OFX 2.x, § 11.4.3). C'est la seule
    // clé de dédoublonnage fiable ; l'empreinte date+montant+libellé, elle,
    // confond deux achats identiques du même jour au même commerçant.
    const fitid = tag('FITID')
    if (date && montant) out.push({ date, libelle, montant, fitid })
  })
  return out
}

// ── RÈGLES ─────────────────────────────────────────────────────────────────
function normaliserLibelle(s) {
  return String(s || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Un motif utile est la partie stable du libellé : le nom du commerçant, sans
// le numéro de succursale ni la date qui changent à chaque transaction.
function motifSuggere(libelle) {
  const n = normaliserLibelle(libelle)
  const mots = n.split(' ').filter(w => w.length > 2 && !/^\d+$/.test(w))
  return mots.slice(0, 3).join(' ') || n.slice(0, 20)
}

function regleCorrespondante(libelle) {
  const n = normaliserLibelle(libelle)
  // La règle la plus spécifique (motif le plus long) gagne, sinon « ENTRETIEN »
  // l'emporterait sur « ENTRETIEN PISCINE ».
  return reglesImport()
    .filter(r => r.motif && n.includes(normaliserLibelle(r.motif)))
    .sort((a, b) => b.motif.length - a.motif.length)[0] || null
}

function apprendreRegle(libelle, key) {
  const motif = motifSuggere(libelle)
  if (!motif) return
  const existante = reglesImport().find(r => normaliserLibelle(r.motif) === normaliserLibelle(motif))
  if (existante) existante.key = key
  else reglesImport().push({ id: uid(), motif, key, usages: 0 })
  saveSetup()
}

function supprimerRegle(id) {
  setup.reglesImport = reglesImport().filter(r => r.id !== id)
  saveSetup()
  renderImportBancaire()
}

function majRegle(id, champ, val) {
  const r = reglesImport().find(x => x.id === id)
  if (!r) return
  r[champ] = val
  saveSetup()
  if (champ === 'key') renderImportBancaire()
}

// ── IMPORT ─────────────────────────────────────────────────────────────────
// Empreinte HEURISTIQUE : la seule possible pour un CSV, qui ne porte aucun
// identifiant. Deux achats du même montant, le même jour, au même commerçant
// sont indistinguables — l'un des deux sera pris pour un doublon. C'est le
// compromis accepté pour le CSV, et la raison pour laquelle l'OFX est préféré.
function empreinteTx(t) {
  return t.date + '|' + Math.round(num(t.montant) * 100) + '|' + normaliserLibelle(t.libelle).slice(0, 24)
}

// Clés sous lesquelles une transaction est ENREGISTRÉE une fois traitée : les
// deux quand le FITID existe. Enregistrer aussi l'empreinte heuristique protège
// le cas où le même relevé, déjà importé en OFX, est retéléchargé en CSV — les
// clés des deux formats ne se croiseraient pas autrement.
function clesTx(t) {
  const cles = []
  if (t.fitid) cles.push('fitid|' + String(t.fitid).trim())
  cles.push(empreinteTx(t))
  return cles
}

// Clé sous laquelle une transaction est COMPARÉE à ce qui a déjà été vu : UNE
// seule, la plus forte disponible. C'est la dissymétrie qui fait tout l'intérêt
// du FITID : deux achats jumeaux (même jour, même montant, même commerçant)
// partagent la même empreinte heuristique, donc comparer aussi celle-ci ferait
// prendre le second pour un doublon — exactement le défaut que le FITID corrige.
function cleMatch(t) {
  return t.fitid ? 'fitid|' + String(t.fitid).trim() : empreinteTx(t)
}

function importerFichierBancaire(input) {
  if (guardClosed()) { input.value = ''; return }
  const f = input.files && input.files[0]
  if (!f) return
  const fr = new FileReader()
  fr.onload = () => {
    try { traiterContenuBancaire(String(fr.result), f.name) }
    catch (e) { toast('⚠️ Lecture impossible : ' + e.message, 4000) }
    input.value = ''
  }
  fr.onerror = () => { toast('⚠️ Fichier illisible'); input.value = '' }
  fr.readAsText(f, 'utf-8')
}

function traiterContenuBancaire(texte, nom) {
  const estOFX = /<STMTTRN>/i.test(texte) || /^OFXHEADER/im.test(texte)
  let tx = estOFX ? parseOFX(texte) : parseCSVBancaire(texte)
  if (!tx.length) { toast('⚠️ Aucune transaction reconnue dans ' + nom, 4000); return }

  const hors = tx.filter(t => yearOf(t.date) !== activeYear).length
  tx = tx.filter(t => yearOf(t.date) === activeYear)

  const vues = new Set(empreintesImport())
  const dejaFile = new Set()
  fileImport().forEach(t => clesTx(t).forEach(c => dejaFile.add(c)))
  let doublons = 0, ajoutes = 0
  tx.forEach(t => {
    const cle = cleMatch(t)
    if (vues.has(cle) || dejaFile.has(cle)) { doublons++; return }
    // On indexe la nouvelle transaction sous TOUTES ses clés, pour qu'un import
    // ultérieur dans l'autre format la retrouve.
    clesTx(t).forEach(c => dejaFile.add(c))
    const r = regleCorrespondante(t.libelle)
    fileImport().push({
      id: uid(), date: t.date, libelle: t.libelle, montant: num(t.montant),
      // Le FITID voyage avec la transaction dans la file : sans lui, un
      // classement fait demain ne pourrait plus enregistrer la bonne clé.
      fitid: t.fitid || '',
      key: r ? r.key : '', auto: !!r, source: nom
    })
    ajoutes++
  })
  save()
  renderImportBancaire()
  const parts = [ajoutes + ' transaction(s) importée(s)']
  if (doublons) parts.push(doublons + ' doublon(s) ignoré(s)')
  if (hors) parts.push(hors + ' hors ' + activeYear)
  toast('📥 ' + parts.join(' · '), 4200)
}

function majTxFile(id, champ, val) {
  const t = fileImport().find(x => x.id === id)
  if (!t) return
  t[champ] = val
  if (champ === 'key') t.auto = false
  autoSave()
  if (champ === 'key') renderImportBancaire()
}

// Applique une transaction : AJOUTE le montant à la cellule du mois de la date.
// L'addition — plutôt que le remplacement — est le bon comportement : plusieurs
// transactions du même poste tombent dans le même mois.
function appliquerTx(id, apprendre) {
  if (guardClosed()) return
  const t = fileImport().find(x => x.id === id)
  if (!t || !t.key) return
  const c = cibleImportParKey(t.key)
  if (!c) { toast('⚠️ Poste introuvable — a-t-il été renommé ?', 3500); return }
  const mi = monthOf(t.date)
  const montant = Math.abs(num(t.montant))

  if (c.section === 'veh') {
    state.vehicule.depenses[c.cat] = (num(state.vehicule.depenses[c.cat]) + montant).toFixed(2)
  } else {
    const actuel = getMonthlyVal(c.propId, c.section, c.cat, mi)
    setMonthlyVal(c.propId, c.section, c.cat, mi, (actuel + montant).toFixed(2))
  }
  if (apprendre) apprendreRegle(t.libelle, t.key)
  const r = regleCorrespondante(t.libelle)
  if (r) r.usages = (r.usages || 0) + 1, saveSetup()

  clesTx(t).forEach(c => empreintesImport().push(c))
  state.importQueue = fileImport().filter(x => x.id !== id)
  save()
  renderImportBancaire()
  refreshAll()
}

function ignorerTx(id, apprendre) {
  if (guardClosed()) return
  const t = fileImport().find(x => x.id === id)
  if (!t) return
  if (apprendre) apprendreRegle(t.libelle, 'ignore')
  clesTx(t).forEach(c => empreintesImport().push(c))
  state.importQueue = fileImport().filter(x => x.id !== id)
  save()
  renderImportBancaire()
}

function appliquerToutesTx() {
  if (guardClosed()) return
  const prets = fileImport().filter(t => t.key && t.key !== 'ignore')
  const aIgnorer = fileImport().filter(t => t.key === 'ignore')
  if (!prets.length && !aIgnorer.length) { toast('Aucune transaction classée'); return }
  if (!confirm(`Appliquer ${prets.length} transaction(s) classée(s)`
    + (aIgnorer.length ? ` et écarter ${aIgnorer.length} transaction(s) personnelle(s)` : '') + ' ?')) return
  prets.forEach(t => appliquerTx(t.id, false))
  aIgnorer.forEach(t => ignorerTx(t.id, false))
  toast('✅ ' + prets.length + ' transaction(s) appliquée(s)', 3200)
}

function viderFileImport() {
  if (!fileImport().length) return
  if (!confirm('Vider la file sans rien appliquer ? Les transactions non classées seront perdues (le relevé peut être réimporté).')) return
  state.importQueue = []
  save()
  renderImportBancaire()
}

// Permet de réimporter un relevé déjà traité, après une erreur de classement.
function oublierEmpreintes() {
  if (!confirm('Oublier l’historique des transactions déjà importées ?\n\nLes montants déjà inscrits dans les cellules ne sont PAS retirés : réimporter le même relevé les compterait une deuxième fois.')) return
  state.importHashes = []
  save()
  toast('Historique d’import effacé')
  renderImportBancaire()
}

// ── AFFICHAGE ──────────────────────────────────────────────────────────────
function optionsCibles(sel) {
  const cibles = ciblesImport()
  const groupes = [...new Set(cibles.map(c => c.groupe))]
  return `<option value="">— à classer —</option>
    <option value="ignore"${sel === 'ignore' ? ' selected' : ''}>🚫 Personnel (ignorer)</option>`
    + groupes.map(g => `<optgroup label="${escH(g)}">`
      + cibles.filter(c => c.groupe === g).map(c =>
        `<option value="${escH(c.key)}"${c.key === sel ? ' selected' : ''}>${escH(c.cat)}</option>`).join('')
      + '</optgroup>').join('')
}

function renderImportBancaire() {
  const el = document.getElementById('import-body')
  if (!el) return
  const file = fileImport()
  const classees = file.filter(t => t.key && t.key !== 'ignore').length
  const ignorees = file.filter(t => t.key === 'ignore').length
  const restantes = file.length - classees - ignorees
  const regles = reglesImport()

  const lignes = file
    .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(t => {
      const neg = num(t.montant) < 0
      return `<tr>
      <td style="white-space:nowrap">${fmtDate(t.date)}</td>
      <td style="font-size:11px;line-height:1.3">${escH(t.libelle)}
        ${t.auto ? '<span style="color:var(--green);font-size:10px"> ⚡ règle</span>' : ''}</td>
      <td style="text-align:right;white-space:nowrap;color:${neg ? 'var(--text)' : 'var(--green)'}">
        ${money(Math.abs(num(t.montant)))}</td>
      <td><select class="inp" style="font-size:11px;padding:4px"
            onchange="majTxFile('${t.id}','key',this.value)">${optionsCibles(t.key)}</select></td>
      <td style="white-space:nowrap">
        ${t.key === 'ignore'
          ? `<button class="btn btn-ghost btn-sm" onclick="ignorerTx('${t.id}',true)" title="Écarter et retenir la règle">🚫</button>`
          : t.key
            ? `<button class="btn btn-primary btn-sm" onclick="appliquerTx('${t.id}',true)" title="Appliquer et toujours classer ainsi">✓⚡</button>
               <button class="btn btn-ghost btn-sm" onclick="appliquerTx('${t.id}',false)" title="Appliquer cette fois seulement">✓</button>`
            : '<span style="color:var(--text2);font-size:11px">—</span>'}
      </td></tr>`
    })

  el.innerHTML = `
    ${card('📥 Import d’un relevé', `
      ${infoBox(`Formats acceptés : <strong>CSV</strong> (toutes les banques) et
        <strong>OFX/QFX</strong> (export « Quicken »). Le fichier est lu dans le navigateur :
        <strong>aucune donnée bancaire ne quitte l’appareil</strong>.`)}
      <label class="btn btn-primary btn-full" style="display:block;text-align:center">
        📂 Choisir un relevé (CSV / OFX / QFX)
        <input type="file" accept=".csv,.txt,.ofx,.qfx" style="display:none"
          onchange="importerFichierBancaire(this)">
      </label>
      <div class="field" style="margin-top:10px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:600">
          <input type="checkbox" ${setup.importOrdreUS ? 'checked' : ''}
            onchange="setup.importOrdreUS=this.checked;saveSetup();toast('Ordre des dates : '+(this.checked?'MM/JJ':'JJ/MM'))">
          Les dates ambiguës de mes relevés sont en MM/JJ/AAAA
        </label>
        ${sourceNote(`Sans ambiguïté possible (le 25/03), l’app décide seule. Cochez si votre
          banque écrit le 3 mai « 05/03 ».`)}
      </div>
    `, 'blue')}

    ${file.length ? card(`🗂 File d’attente — ${file.length} transaction(s)`, `
      <div class="summary-row">
        ${sumCard('Classées', classees, 'green')}
        ${sumCard('À classer', restantes, restantes ? 'orange' : 'blue')}
        ${sumCard('Personnelles', ignorees, 'blue')}
      </div>
      ${table(['Date', 'Libellé', ['Montant', 'right'], 'Poste', ''], lignes)}
      ${sourceNote(`<strong>✓⚡</strong> applique et retient la règle pour les prochains relevés ·
        <strong>✓</strong> applique cette fois seulement. Le montant s’<strong>ajoute</strong> à la
        cellule du mois de la transaction.`)}
      <div class="cat-row" style="gap:8px;margin-top:10px">
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="appliquerToutesTx()">
          ✅ Appliquer les ${classees + ignorees} classées</button>
        <button class="btn btn-ghost btn-sm" onclick="viderFileImport()">🗑 Vider</button>
      </div>
    `, 'dark') : ''}

    ${card(`⚡ Règles de classement — ${regles.length}`, `
      ${regles.length ? table(['Si le libellé contient', 'Classer dans', ''],
        regles.slice().sort((a, b) => (b.usages || 0) - (a.usages || 0)).map(r => `<tr>
          <td><input class="inp" style="font-size:11px;padding:4px" value="${escH(r.motif)}"
                onchange="majRegle('${r.id}','motif',this.value)"></td>
          <td><select class="inp" style="font-size:11px;padding:4px"
                onchange="majRegle('${r.id}','key',this.value)">${optionsCibles(r.key)}</select></td>
          <td style="white-space:nowrap"><span style="font-size:10px;color:var(--text2)">${r.usages || 0}×</span>
            <button class="btn btn-ghost btn-sm" onclick="supprimerRegle('${r.id}')">🗑</button></td>
        </tr>`))
        : infoBox(`Aucune règle encore. Chaque fois que vous classez avec <strong>✓⚡</strong>,
          l’app retient le marchand et classera seule la prochaine fois.`)}
      ${sourceNote('Les règles sont conservées hors année : elles s’appliquent à tous les relevés, de toutes les années.')}
    `, 'green')}

    ${empreintesImport().length ? card('🧾 Historique', `
      ${sourceNote(`${empreintesImport().length} transaction(s) déjà traitée(s) : réimporter le même
        relevé ne les comptera pas deux fois.`)}
      <button class="btn btn-ghost btn-sm btn-full" style="margin-top:8px" onclick="oublierEmpreintes()">
        ↺ Oublier l’historique (pour réimporter)</button>
    `, 'dark') : ''}`
}

registerModule({
  id: 'import-bancaire',
  label: 'Import bancaire',
  render: renderImportBancaire
})
