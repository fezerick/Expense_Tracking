// ════════════════════════════════════════════════════════════════════════════
// verrou.js — CODE D'ACCÈS À L'OUVERTURE (chantier C.4)
//
// CE QUE CE VERROU FAIT
//   Il empêche de LIRE l'application sur un appareil déjà déverrouillé. Les
//   revenus, les adresses, les noms de copropriétaires et les photos de
//   factures ne s'affichent plus parce qu'on a pris le téléphone sur la table
//   ou ouvert l'onglet laissé sur le portable.
//
// CE QU'IL NE FAIT PAS, ET IL FAUT LE DIRE
//   Il ne chiffre rien. Les données restent en clair dans localStorage, et le
//   sel comme l'empreinte du code sont rangés juste à côté. Quelqu'un qui sait
//   ouvrir la console du navigateur passe outre en une minute, et un code à
//   quatre chiffres tombe hors ligne en une seconde.
//   Chiffrer pour de vrai aurait un prix qu'on refuse de payer : la clé
//   dériverait du code, donc la synchronisation, le service worker, les
//   exports et la restauration devraient tous la connaître — et un code oublié
//   effacerait définitivement le dossier fiscal.
//   Ce que l'empreinte PBKDF2 achète est modeste et réel : le code n'apparaît
//   en clair ni dans une sauvegarde, ni dans un export, ni sur une capture
//   d'écran du stockage, et il ne voyage JAMAIS vers Firestore
//   (`setupPourSync` le retire, comme le thème).
//
// Pour une protection réelle du contenu, la réponse est ailleurs : le
// chiffrement de l'appareil et le verrou du système d'exploitation.
// ════════════════════════════════════════════════════════════════════════════

// 310 000 itérations : l'ordre de grandeur recommandé par l'OWASP pour
// PBKDF2-HMAC-SHA256. Sur un téléphone, cela coûte une fraction de seconde à
// l'ouverture — et autant par essai à qui tente le code au hasard.
const VERROU_ITERATIONS = 310000
const VERROU_DELAIS = [0, 1, 5, 15, 60]
// Au-delà de deux essais ratés, chaque tentative attend. Les paliers sont
// volontairement courts au début : c'est un code qu'on tape d'une main.
const VERROU_PALIERS_MS = [5000, 15000, 60000, 300000]

// ── PARTIE PURE (testée par tests/pwa_verrou_suite.js) ─────────────────────

/// Ramène une configuration venue du stockage à une forme sûre. Toute valeur
/// inattendue retombe sur le défaut : une configuration corrompue ne doit ni
/// planter l'app, ni — surtout — passer pour un verrou actif.
function verrouNormalise(brut) {
  const conf = {
    actif: false,
    sel: '',
    hash: '',
    iterations: VERROU_ITERATIONS,
    delaiMinutes: 0,
    compte: null
  }
  if (!brut || typeof brut !== 'object') return conf
  conf.sel = typeof brut.sel === 'string' ? brut.sel : ''
  conf.hash = typeof brut.hash === 'string' ? brut.hash : ''
  const it = Number(brut.iterations)
  if (isFinite(it) && it >= 10000) conf.iterations = Math.floor(it)
  const d = Number(brut.delaiMinutes)
  if (VERROU_DELAIS.indexOf(d) >= 0) conf.delaiMinutes = d
  if (typeof brut.compte === 'string' && brut.compte) conf.compte = brut.compte
  // Un verrou sans empreinte n'est pas un verrou : refuser de le dire actif
  // évite un écran de déverrouillage qu'aucun code ne pourrait lever.
  conf.actif = brut.actif === true && !!conf.sel && !!conf.hash
  return conf
}

/// 4 à 8 chiffres. Pas de lettres : le clavier numérique est le seul qui
/// s'ouvre sur un téléphone, et un code qu'on ne peut pas taper n'est pas un
/// code.
function verrouCodeValide(code) {
  return typeof code === 'string' && /^[0-9]{4,8}$/.test(code)
}

/// Faut-il reposer le verrou au retour ? Isolée parce que c'est la seule
/// logique du verrou qui pourrait être fausse sans que rien ne le montre.
/// `dernierActif` à null signifie que l'app n'a jamais quitté le premier plan.
function verrouDoitVerrouiller(dernierActif, maintenant, delaiMinutes) {
  const t = Number(dernierActif)
  if (dernierActif == null || !isFinite(t)) return false
  const d = Math.max(0, Number(delaiMinutes) || 0)
  if (d <= 0) return true
  return (Number(maintenant) - t) >= d * 60000
}

/// Comparaison à temps constant. Sortir au premier caractère différent
/// mesurerait, chronomètre en main, combien de tête du code est juste.
function verrouEgalConstant(a, b) {
  const sa = String(a == null ? '' : a)
  const sb = String(b == null ? '' : b)
  const n = Math.max(sa.length, sb.length)
  let diff = sa.length ^ sb.length
  for (let i = 0; i < n; i++) {
    diff |= (sa.charCodeAt(i) || 0) ^ (sb.charCodeAt(i) || 0)
  }
  return diff === 0
}

/// Attente imposée avant le prochain essai, en millisecondes.
function verrouAttenteMs(echecs) {
  const e = Math.max(0, Math.floor(Number(echecs) || 0))
  if (e < 3) return 0
  return VERROU_PALIERS_MS[Math.min(e - 3, VERROU_PALIERS_MS.length - 1)]
}

function verrouDelaiLabel(minutes) {
  const m = Number(minutes) || 0
  if (m <= 0) return 'Immédiatement'
  if (m === 1) return 'Après 1 minute'
  if (m === 60) return 'Après 1 heure'
  return 'Après ' + m + ' minutes'
}

// ── EMPREINTE DU CODE ──────────────────────────────────────────────────────

/// `crypto.subtle` n'existe que sur une origine sûre (https ou localhost). Sur
/// http, le verrou est refusé plutôt que rabattu sur une empreinte faible :
/// une fausse sécurité est pire que pas de verrou du tout.
function verrouCrypto() {
  const c = (typeof crypto !== 'undefined' && crypto) ? crypto : null
  return (c && c.subtle && c.subtle.deriveBits && c.getRandomValues) ? c : null
}

function verrouDisponible() { return !!verrouCrypto() }

function verrouEnB64(octets) {
  let s = ''
  for (let i = 0; i < octets.length; i++) s += String.fromCharCode(octets[i])
  return btoa(s)
}

function verrouDeB64(b64) {
  const t = atob(String(b64 || ''))
  const a = new Uint8Array(t.length)
  for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i)
  return a
}

function verrouNouveauSel() {
  const c = verrouCrypto()
  if (!c) throw new Error('crypto indisponible')
  return verrouEnB64(c.getRandomValues(new Uint8Array(16)))
}

async function verrouHacher(code, selB64, iterations) {
  const c = verrouCrypto()
  if (!c) throw new Error('crypto.subtle indisponible')
  const cle = await c.subtle.importKey(
    'raw', new TextEncoder().encode(String(code)), 'PBKDF2', false, ['deriveBits'])
  const bits = await c.subtle.deriveBits(
    { name: 'PBKDF2', salt: verrouDeB64(selB64), iterations: iterations, hash: 'SHA-256' },
    cle, 256)
  return verrouEnB64(new Uint8Array(bits))
}

// ── CONFIGURATION STOCKÉE ──────────────────────────────────────────────────

function verrouConf() {
  return verrouNormalise(typeof setup !== 'undefined' ? setup.verrou : null)
}

function verrouEnregistrer(conf) {
  const n = verrouNormalise(conf)
  setup.verrou = n
  saveSetup()
  return n
}

// ── ÉTAT D'EXÉCUTION ───────────────────────────────────────────────────────

let _verrouPose = false
let _verrouDernierActif = null
let _verrouEchecs = 0
let _verrouEssaiApres = 0
let _verrouOccupe = false

// ── L'ÉCRAN ────────────────────────────────────────────────────────────────

function verrouInjecterStyle() {
  if (document.getElementById('verrou-style')) return
  const st = document.createElement('style')
  st.id = 'verrou-style'
  st.textContent = `
    /* L'attribut inert empêche d'atteindre la page derrière au clavier, mais
       pas de la faire défiler à la molette : sans ce blocage, les montants
       glissent derrière l'écran de verrouillage, et la barre de défilement
       laisse une bande non couverte sur le bord. */
    html.verrou-pose, html.verrou-pose body{overflow:hidden !important}
    #verrou-ecran{position:fixed;inset:0;z-index:100000;display:none;
      align-items:center;justify-content:center;background:var(--bg,#f2f2f7);
      padding:24px calc(16px + env(safe-area-inset-left,0px))}
    #verrou-ecran.open{display:flex}
    .verrou-boite{width:100%;max-width:320px;text-align:center}
    .verrou-icone{font-size:44px;line-height:1;margin-bottom:12px}
    .verrou-titre{font-size:18px;font-weight:700;color:var(--text1,#111)}
    .verrou-sous{font-size:13px;color:var(--text2,#666);margin:4px 0 18px}
    #verrou-code{width:100%;box-sizing:border-box;text-align:center;
      font-size:24px;letter-spacing:.35em;padding:12px;border-radius:12px;
      border:1px solid var(--border,#d1d1d6);background:var(--card,#fff);
      color:var(--text1,#111);margin-bottom:12px}
    #verrou-msg{min-height:18px;font-size:12px;margin-top:10px;line-height:1.5}
    #verrou-msg.err{color:#C62828}
    .verrou-lien{display:block;width:100%;margin-top:16px;background:none;
      border:none;font-size:12px;color:var(--text2,#666);text-decoration:underline;
      cursor:pointer}`
  document.head.appendChild(st)
}

function verrouInjecterEcran() {
  if (document.getElementById('verrou-ecran')) return
  verrouInjecterStyle()
  const d = document.createElement('div')
  d.id = 'verrou-ecran'
  d.setAttribute('role', 'dialog')
  d.setAttribute('aria-modal', 'true')
  d.innerHTML = `
    <div class="verrou-boite">
      <div class="verrou-icone">🔒</div>
      <div class="verrou-titre">Revenus et dépenses</div>
      <div class="verrou-sous">Entrez votre code d'accès</div>
      <input id="verrou-code" type="password" inputmode="numeric" autocomplete="off"
             maxlength="8" aria-label="Code d'accès">
      <button class="btn btn-primary btn-full" id="verrou-ok">Déverrouiller</button>
      <div id="verrou-msg"></div>
      <button class="verrou-lien" id="verrou-oubli">J'ai oublié mon code</button>
    </div>`
  document.body.appendChild(d)
  document.getElementById('verrou-ok').addEventListener('click', verrouEssayer)
  document.getElementById('verrou-oubli').addEventListener('click', verrouOublie)
  document.getElementById('verrou-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') verrouEssayer()
  })
}

/// Le reste de la page devient inerte : l'écran opaque suffit à l'œil, pas au
/// clavier ni au lecteur d'écran.
function verrouInerter(actif) {
  Array.prototype.forEach.call(document.body.children, el => {
    if (el.id === 'verrou-ecran') return
    if (actif) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  })
}

function verrouMessage(txt, erreur) {
  const el = document.getElementById('verrou-msg')
  if (!el) return
  el.textContent = txt || ''
  el.className = erreur ? 'err' : ''
}

function verrouPoser() {
  const conf = verrouConf()
  if (!conf.actif) return
  verrouInjecterEcran()
  _verrouPose = true
  document.documentElement.classList.add('verrou-pose')
  document.getElementById('verrou-ecran').classList.add('open')
  verrouInerter(true)
  const input = document.getElementById('verrou-code')
  if (input) { input.value = ''; setTimeout(() => input.focus(), 50) }
  verrouMessage('', false)
}

function verrouLever() {
  _verrouPose = false
  _verrouDernierActif = null
  document.documentElement.classList.remove('verrou-pose')
  const ecran = document.getElementById('verrou-ecran')
  if (ecran) ecran.classList.remove('open')
  verrouInerter(false)
  const input = document.getElementById('verrou-code')
  if (input) input.value = ''
}

async function verrouEssayer() {
  if (_verrouOccupe) return
  const conf = verrouConf()
  const input = document.getElementById('verrou-code')
  const code = input ? input.value : ''
  const attente = _verrouEssaiApres - Date.now()
  if (attente > 0) {
    verrouMessage('Trop d\'essais. Attendez ' + Math.ceil(attente / 1000) + ' s.', true)
    return
  }
  if (!verrouCodeValide(code)) {
    verrouMessage('Le code compte de 4 à 8 chiffres.', true)
    return
  }
  _verrouOccupe = true
  verrouMessage('Vérification…', false)
  let ok = false
  try {
    const hash = await verrouHacher(code, conf.sel, conf.iterations)
    ok = verrouEgalConstant(hash, conf.hash)
  } catch (e) {
    console.error('verrouEssayer', e)
    verrouMessage('Vérification impossible sur ce navigateur.', true)
    _verrouOccupe = false
    return
  }
  _verrouOccupe = false
  if (ok) {
    _verrouEchecs = 0
    _verrouEssaiApres = 0
    verrouLever()
    return
  }
  _verrouEchecs++
  const pause = verrouAttenteMs(_verrouEchecs)
  _verrouEssaiApres = pause ? Date.now() + pause : 0
  if (input) input.value = ''
  verrouMessage(pause
    ? 'Code incorrect. Prochain essai dans ' + Math.round(pause / 1000) + ' s.'
    : 'Code incorrect.', true)
}

/// Issue de secours. Elle ne contourne rien : elle demande le SECOND facteur
/// que l'utilisateur possède déjà, le compte Google de la synchronisation,
/// celui-là même qui donne accès aux données dans le cloud. Un bouton
/// « passer » serait une porte ouverte à qui tient le téléphone.
async function verrouOublie() {
  const conf = verrouConf()
  if (!conf.compte) {
    verrouMessage('Aucun compte Google n\'était connecté quand le verrou a été posé : '
      + 'il n\'y a pas d\'autre preuve à présenter que le code.', true)
    return
  }
  verrouMessage('Connexion à ' + conf.compte + '…', false)
  try {
    if (typeof initFirebase === 'function') initFirebase()
    const auth = window._fbAuth
    if (!auth || typeof firebase === 'undefined') throw new Error('hors ligne')
    const provider = new firebase.auth.GoogleAuthProvider()
    provider.setCustomParameters({ login_hint: conf.compte })
    const user = auth.currentUser
    const res = user
      ? await user.reauthenticateWithPopup(provider)
      : await auth.signInWithPopup(provider)
    const email = (res && res.user && res.user.email)
      || (auth.currentUser && auth.currentUser.email) || ''
    if (email.toLowerCase() !== conf.compte.toLowerCase()) {
      verrouMessage('Ce compte n\'est pas celui qui a posé le verrou.', true)
      return
    }
  } catch (e) {
    verrouMessage('Connexion impossible : ' + (e && e.message ? e.message : e)
      + ' (une connexion internet est nécessaire).', true)
    return
  }
  // Compte prouvé : on retire le verrou plutôt que de le lever une fois, pour
  // que l'utilisateur en choisisse un nouveau en connaissance de cause.
  verrouEnregistrer({ actif: false, delaiMinutes: conf.delaiMinutes, compte: conf.compte })
  verrouLever()
  verrouRendreReglages()
  toast('🔓 Verrou retiré — définissez un nouveau code dans les réglages', 4000)
}

// ── RÉGLAGES ───────────────────────────────────────────────────────────────

function verrouRendreReglages() {
  const el = document.getElementById('settings-verrou')
  if (!el) return
  if (!verrouDisponible()) {
    el.innerHTML = `<label>🔒 Code d'accès</label>` + infoBox(
      `Le verrou exige une connexion sécurisée (https). Cette page est servie
       autrement : le navigateur n'y donne pas accès aux fonctions de
       chiffrement, et poser un code sans elles ne protégerait rien.`)
    return
  }
  const conf = verrouConf()
  const options = VERROU_DELAIS.map(m =>
    `<option value="${m}" ${m === conf.delaiMinutes ? 'selected' : ''}>${escH(verrouDelaiLabel(m))}</option>`
  ).join('')
  el.innerHTML = `
    <label>🔒 Code d'accès</label>
    ${conf.actif ? `
      <div style="font-size:13px;color:var(--text1);margin-bottom:8px">
        ✅ Actif${conf.compte ? ' · secours par ' + escH(conf.compte) : ' · sans compte de secours'}
      </div>
      <div class="field" style="margin-bottom:8px">
        <label style="font-size:11px">Reverrouiller</label>
        <select id="verrou-delai" onchange="verrouChangerDelai(this.value)">${options}</select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="verrouFormulaire(true)">🔑 Changer le code</button>
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="verrouPoser()">🔒 Verrouiller</button>
      </div>
      <button class="btn btn-ghost btn-sm btn-full" style="margin-top:6px" onclick="verrouRetirer()">Désactiver le verrou</button>
    ` : `
      <button class="btn btn-ghost btn-sm btn-full" onclick="verrouFormulaire(false)">🔑 Définir un code d'accès</button>
    `}
    <div style="font-size:11px;color:var(--text2);margin-top:6px;line-height:1.5">
      Le code masque l'app à l'ouverture, pour que revenus, adresses et
      copropriétaires ne s'affichent pas sur un appareil laissé déverrouillé.
      Il ne chiffre pas les données : elles restent lisibles par qui sait ouvrir
      le stockage du navigateur. Le code ne quitte jamais cet appareil — il n'est
      pas synchronisé.
    </div>`
}

function verrouChangerDelai(val) {
  const conf = verrouConf()
  const m = Number(val)
  verrouEnregistrer({ ...conf, delaiMinutes: VERROU_DELAIS.indexOf(m) >= 0 ? m : 0 })
  toast('✅ Reverrouillage : ' + verrouDelaiLabel(m).toLowerCase())
}

function verrouFormulaire(changement) {
  const conf = verrouConf()
  const compte = (window._fbAuth && window._fbAuth.currentUser && window._fbAuth.currentUser.email) || null
  openSheet(changement ? 'Changer le code d\'accès' : 'Définir un code d\'accès', `
    ${changement ? `<div class="field">
      <label>Code actuel</label>
      <input id="vf-actuel" type="password" inputmode="numeric" maxlength="8">
    </div>` : ''}
    <div class="field">
      <label>Nouveau code (4 à 8 chiffres)</label>
      <input id="vf-code" type="password" inputmode="numeric" maxlength="8">
    </div>
    <div class="field">
      <label>Confirmer</label>
      <input id="vf-code2" type="password" inputmode="numeric" maxlength="8">
    </div>
    ${compte
      ? infoBox(`Si vous oubliez ce code, vous pourrez le retirer en vous
          reconnectant à <strong>${escH(compte)}</strong>.`)
      : warnBox(`Aucun compte Google n'est connecté. <strong>Un code oublié ne
          pourra pas être retiré</strong> autrement qu'en effaçant les données de
          ce navigateur. Connectez la synchronisation d'abord si vous voulez un
          filet.`)}
    <div id="vf-msg" style="font-size:12px;color:#C62828;min-height:16px;margin:6px 0"></div>
    <button class="btn btn-primary btn-full" onclick="verrouValiderFormulaire(${changement ? 'true' : 'false'})">
      ${changement ? 'Changer le code' : 'Activer le verrou'}
    </button>`)
}

async function verrouValiderFormulaire(changement) {
  const msg = t => { const el = document.getElementById('vf-msg'); if (el) el.textContent = t }
  const lire = id => { const el = document.getElementById(id); return el ? el.value : '' }
  const conf = verrouConf()
  if (changement) {
    const actuel = lire('vf-actuel')
    if (!verrouCodeValide(actuel)) { msg('Entrez votre code actuel.'); return }
    try {
      const h = await verrouHacher(actuel, conf.sel, conf.iterations)
      if (!verrouEgalConstant(h, conf.hash)) { msg('Code actuel incorrect.'); return }
    } catch (e) { msg('Vérification impossible : ' + e.message); return }
  }
  const code = lire('vf-code')
  if (!verrouCodeValide(code)) { msg('Le code compte de 4 à 8 chiffres.'); return }
  if (code !== lire('vf-code2')) { msg('Les deux codes ne correspondent pas.'); return }
  let sel, hash
  try {
    sel = verrouNouveauSel()
    hash = await verrouHacher(code, sel, VERROU_ITERATIONS)
  } catch (e) { msg('Chiffrement indisponible : ' + e.message); return }
  verrouEnregistrer({
    actif: true,
    sel: sel,
    hash: hash,
    iterations: VERROU_ITERATIONS,
    delaiMinutes: conf.delaiMinutes,
    // Le compte de secours est fixé maintenant : changer de compte Google plus
    // tard ne doit pas donner à un autre utilisateur le droit de lever ce
    // verrou.
    compte: (window._fbAuth && window._fbAuth.currentUser && window._fbAuth.currentUser.email)
      || conf.compte || null
  })
  closeSheet()
  verrouRendreReglages()
  toast(changement ? '✅ Code changé' : '✅ Verrou activé')
}

async function verrouRetirer() {
  const conf = verrouConf()
  const code = prompt('Entrez votre code d\'accès pour désactiver le verrou :')
  if (code == null) return
  if (!verrouCodeValide(code)) { toast('❌ Code invalide'); return }
  try {
    const h = await verrouHacher(code, conf.sel, conf.iterations)
    if (!verrouEgalConstant(h, conf.hash)) { toast('❌ Code incorrect'); return }
  } catch (e) { toast('❌ Vérification impossible'); return }
  verrouEnregistrer({ actif: false, delaiMinutes: conf.delaiMinutes, compte: conf.compte })
  verrouRendreReglages()
  toast('🔓 Verrou désactivé')
}

// ── CYCLE DE VIE ───────────────────────────────────────────────────────────

function verrouVisibilite() {
  const conf = verrouConf()
  if (!conf.actif) return
  if (document.hidden) {
    if (_verrouDernierActif == null) _verrouDernierActif = Date.now()
    // Délai nul : poser tout de suite, pour que la vignette gardée par le
    // système d'exploitation ne montre pas les montants.
    if (conf.delaiMinutes <= 0 && !_verrouPose) verrouPoser()
  } else if (!_verrouPose
      && verrouDoitVerrouiller(_verrouDernierActif, Date.now(), conf.delaiMinutes)) {
    verrouPoser()
  } else if (!_verrouPose) {
    _verrouDernierActif = null
  }
}

function verrouInit() {
  verrouRendreReglages()
  const conf = verrouConf()
  if (conf.actif) {
    verrouInjecterEcran()
    verrouPoser()
  }
  document.addEventListener('visibilitychange', verrouVisibilite)
}

// Pas de `label` : ce module n'a pas d'écran à lui, il n'apparaît donc pas
// parmi les modules fiscaux.
registerModule({ id: 'verrou', init: verrouInit })
