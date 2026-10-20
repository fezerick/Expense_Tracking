// ════════════════════════════════════════════════════════════════════════════
// app-modules.js — SOCLE DES MODULES
//
// Les fonctionnalités ajoutées après la version monofichier vivent chacune dans
// son propre fichier js/. Ce socle leur donne :
//   • un registre (registerModule) et des points d'accroche appelés par init()
//     et showTab() de index.html, sans que index.html connaisse les modules ;
//   • une feuille modale réutilisable, pour ne pas dupliquer un <div class=sheet>
//     par fonctionnalité ;
//   • les utilitaires partagés (nombres, échappement, téléchargement, lecture
//     d'une AUTRE année que l'année active) ;
//   • le verrou de clôture d'année, consulté par tous les points de saisie.
// ════════════════════════════════════════════════════════════════════════════

const APP_MODULES = []

// m = { id, label, icon, subtab?, init?, render?, onYearChange? }
function registerModule(m) { APP_MODULES.push(m); return m }
function moduleById(id) { return APP_MODULES.find(m => m.id === id) || null }

function initModules() {
  injectSheetHost()
  APP_MODULES.forEach(m => {
    try { m.init && m.init() }
    catch (e) { console.error('[module ' + m.id + '] init', e) }
  })
}

function notifyModulesYearChange() {
  APP_MODULES.forEach(m => {
    try { m.onYearChange && m.onYearChange() }
    catch (e) { console.error('[module ' + m.id + '] onYearChange', e) }
  })
}

// ── UTILITAIRES PARTAGÉS ───────────────────────────────────────────────────

function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  if (v == null || v === '') return 0
  // Accepte « 1 234,56 $ », « 1,234.56 », « (123,45) » (négatif comptable).
  let s = String(v).trim().replace(/ /g, ' ')
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s)
  s = s.replace(/[()\-]/g, '').replace(/[^\d.,]/g, '')
  const dernierePoint = s.lastIndexOf('.'), derniereVirgule = s.lastIndexOf(',')
  if (dernierePoint > -1 && derniereVirgule > -1) {
    // Le séparateur décimal est le dernier des deux.
    s = derniereVirgule > dernierePoint
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  } else if (derniereVirgule > -1) {
    // Une seule virgule : décimale si 1 ou 2 chiffres suivent, sinon millier.
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return isFinite(n) ? (neg ? -n : n) : 0
}

function money(n, dec = 2) { return fmt(n, dec) + ' $' }

// Échappement strict, à utiliser pour tout texte saisi par l'utilisateur injecté
// dans du HTML. `onbEsc` de index.html laisse passer > et ' : on ne s'en sert
// pas ici, parce que les baux contiennent des noms de personnes.
function escH(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
// Pour un texte injecté dans un attribut onclick='...'
function escJS(s) { return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ') }

function dl(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
function csvLigne(cells) { return cells.map(csvCell).join(',') }

// Charge une dépendance CDN à la demande (JSZip, Tesseract…). Une seule fois.
const _scriptsCharges = {}
function loadScript(url) {
  if (_scriptsCharges[url]) return _scriptsCharges[url]
  _scriptsCharges[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = url
    s.onload = () => resolve()
    s.onerror = () => { delete _scriptsCharges[url]; reject(new Error('Impossible de charger ' + url + '. Vérifiez votre connexion.')) }
    document.head.appendChild(s)
  })
  return _scriptsCharges[url]
}

// ── LECTURE D'UNE AUTRE ANNÉE ──────────────────────────────────────────────
// Indispensable au report de la DPA et au tableau de bord pluriannuel : chaque
// année vit dans sa propre clé localStorage, et l'app n'en chargeait qu'une.
function readYear(year) {
  if (year === activeYear) return state
  try {
    const s = localStorage.getItem(STORE_PREFIX + year)
    return s ? mergeState(JSON.parse(s)) : null
  } catch (e) { return null }
}

function writeYear(year, st) {
  if (year === activeYear) { state = st; save(); return true }
  try { localStorage.setItem(STORE_PREFIX + year, JSON.stringify(st)); return true }
  catch (e) { toast('⚠️ Écriture impossible (stockage plein ?)'); return false }
}

function anneesDisponibles() { return getAvailableYears() }

// ── VERROU DE CLÔTURE D'ANNÉE ──────────────────────────────────────────────
// state.closed = { at: ISO, par: 'manuel', totaux: {rev, dep, net}, empreinte }
function yearClosedInfo(year) {
  const st = year == null || year === activeYear ? state : readYear(year)
  return (st && st.closed) || null
}
function yearClosed(year) { return !!yearClosedInfo(year) }

// À appeler en tête de TOUT point de saisie. Renvoie true si la saisie doit
// être refusée, et le dit à l'utilisateur.
function guardClosed() {
  const c = yearClosedInfo()
  if (!c) return false
  toast('🔒 Année ' + activeYear + ' clôturée le ' + (c.at || '').slice(0, 10) + ' — déverrouillez-la pour modifier', 3200)
  return true
}

// ── FEUILLE MODALE RÉUTILISABLE ────────────────────────────────────────────
let _sheetHost = null
function injectSheetHost() {
  if (document.getElementById('mod-sheet')) { _sheetHost = document.getElementById('mod-sheet'); return }
  const wrap = document.createElement('div')
  wrap.innerHTML = `
    <div class="sheet-overlay" id="mod-overlay" onclick="closeSheet()"></div>
    <div class="sheet" id="mod-sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title" id="mod-sheet-title"></div>
      <div class="sheet-body" id="mod-sheet-body"></div>
    </div>`
  while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild)
  _sheetHost = document.getElementById('mod-sheet')
}

let _sheetOnClose = null
function openSheet(title, html, onClose) {
  injectSheetHost()
  document.getElementById('mod-sheet-title').innerHTML = title
  document.getElementById('mod-sheet-body').innerHTML = html
  document.getElementById('mod-overlay').classList.add('open')
  requestAnimationFrame(() => _sheetHost.classList.add('open'))
  _sheetOnClose = onClose || null
}

function refreshSheet(html) {
  const b = document.getElementById('mod-sheet-body')
  if (b) b.innerHTML = html
}

function closeSheet() {
  if (!_sheetHost) return
  _sheetHost.classList.remove('open')
  setTimeout(() => { const o = document.getElementById('mod-overlay'); if (o) o.classList.remove('open') }, 300)
  const cb = _sheetOnClose; _sheetOnClose = null
  if (cb) try { cb() } catch (e) { console.error(e) }
}

// ── FABRIQUES DE MARQUAGE ──────────────────────────────────────────────────
// Les modules produisent beaucoup de cartes et de tableaux : les factoriser
// évite que chacun réinvente son HTML et dérive visuellement.
function card(header, body, headerClass = 'dark', opts = {}) {
  return `<div class="card" ${opts.style ? 'style="' + opts.style + '"' : ''}>
    <div class="card-header ${headerClass}" ${opts.headerStyle ? 'style="' + opts.headerStyle + '"' : ''}>${header}</div>
    <div class="card-body">${body}</div>
  </div>`
}

function sumCard(label, value, tone = 'blue', hint = '') {
  return `<div class="sum-card ${tone}">
    <div class="s-lbl">${label}</div>
    <div class="s-val sm">${value}</div>
    ${hint ? `<div style="font-size:10px;opacity:.75;margin-top:2px">${hint}</div>` : ''}
  </div>`
}

function infoBox(html) { return `<div class="info-box">${html}</div>` }
function warnBox(html) { return `<div class="warn-box">${html}</div>` }

function table(headers, rows, foot) {
  const th = headers.map(h => {
    const [lbl, align] = Array.isArray(h) ? h : [h, 'left']
    return `<th style="text-align:${align}">${lbl}</th>`
  }).join('')
  return `<div style="overflow-x:auto"><table class="annual-table" style="font-size:12px">
    <thead><tr>${th}</tr></thead>
    <tbody>${rows.join('')}</tbody>
    ${foot ? `<tfoot>${foot}</tfoot>` : ''}
  </table></div>`
}

function tr(cells, cls = '') {
  return `<tr${cls ? ' class="' + cls + '"' : ''}>` + cells.map(c => {
    const [v, align, style] = Array.isArray(c) ? c : [c, 'left', '']
    return `<td style="text-align:${align};${style || ''}">${v}</td>`
  }).join('') + '</tr>'
}

// Petit indicateur de provenance d'un chiffre : « d'où vient ce montant ».
function sourceNote(txt) {
  return `<div style="font-size:11px;color:var(--text2);margin-top:6px;line-height:1.45">${txt}</div>`
}

// Bandeau d'avertissement lorsque les paramètres fiscaux de l'année active
// n'existent pas encore et que l'app retombe sur une année antérieure.
function bandeauRepli(year) {
  if (!fiscalEstRepli(year)) return ''
  return warnBox(`⚠️ Les paramètres fiscaux de <strong>${year || activeYear}</strong> ne sont pas
    encore intégrés. Les calculs utilisent ceux de <strong>${fiscal(year)._repli}</strong> :
    traitez-les comme un ordre de grandeur, pas comme un montant à déclarer.`)
}
