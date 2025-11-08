// ======================= CONFIG =======================
const BACKEND = 'https://script.google.com/macros/s/AKfycby_WylAsbz47zaXxwas32rKhucSdnc_pmkaZrmEf2WGA0sYybabwgj2FtGNImfZH4mH/exec';
const CB = () => Date.now().toString(36);

// GLOBALS
// UI flags
const SHOW_GRID_LOCK_BADGES = false;
let FIRST_LOCK_HYDRATION = true;
let __lastOpenedItem = '';
// ======================= HELPERS ======================
const qs = k => new URLSearchParams(location.search).get(k) || '';
const $  = s => document.querySelector(s);
const el = (t, c, txt) => {
  const e = document.createElement(t);
  if (c) e.className = c;
  if (txt != null) e.textContent = txt;
  return e;
};
// === CATEGORY ⇄ SIZES (UI only, no se envía al backend) =====================
const CATEGORY_SIZES = {
  YOUTH   : ['Y4XS','Y3XS','Y2XS','YXXS','YXS','YS','YM','YL','YXL'],
  ADULT   : ['XXS','XS','SM','MD','LG','XL','2XL','3XL','4XL','5XL'],
  WOMEN  : ['WXS','WS','WM','WL','WXL','W2XL','W3XL'],
  STANDARD: ['STD']
};
const SIZE_TO_CATEGORY = (() => {
  const m = {};
  Object.entries(CATEGORY_SIZES).forEach(([cat, arr]) => arr.forEach(sz => m[sz] = cat));
  return m;
})();

function populateCategorySelect(){
  if (!elCategory) return;
  // Si ya lo hicimos, no repetir
  if (elCategory.dataset.ready === '1') return;
  elCategory.innerHTML = '';

  // Placeholder
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = '— Select category —';
  elCategory.appendChild(opt0);

  // Orden amigable
  ['YOUTH','ADULT','WOMEN','STANDARD'].forEach(cat=>{
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = cat;
    elCategory.appendChild(o);
  });

  elCategory.dataset.ready = '1';
}

// Si el registro en edición trae una size (y por ende una categoría),
// garantizamos que exista esa opción en el select (por si el HTML no la tenía).
function ensureCategoryOption(cat){
  if (!elCategory || !cat) return;
  const has = Array.from(elCategory.options).some(o => o.value === cat);
  if (!has){
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = cat;
    elCategory.appendChild(o);
  }
}


function deriveCategoryFromSize(size){
  const s = String(size || '').toUpperCase().trim();
  return SIZE_TO_CATEGORY[s] || '';
}

function getSelectedSizeFromUI(){
  const active = elSizes.querySelector('.chip.active');
  return active ? active.textContent.trim() : '';
}

function renderSizeChipsForCategory(cat, preselect = ''){
  if (!elSizes || !eSizesRow) return;
  const row = eSizesRow;

  // Congela el pintado mientras repintamos (pero dejamos layout para poder medir)
  row.classList.add('no-anim');
  row.style.visibility = 'hidden';
  row.innerHTML = '';

  if (!cat){
    selectedSize = '';
    // Revelo ya “vacío” y salgo
    row.style.visibility = '';
    row.classList.remove('no-anim');
    return;
  }

  const sizes = CATEGORY_SIZES[cat] || [];
  const frag  = document.createDocumentFragment();

  sizes.forEach((sz, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = sz;
    btn.setAttribute('role','radio');
    btn.setAttribute('aria-checked','false');
    btn.tabIndex = (sz === preselect || (!preselect && i === 0)) ? 0 : -1;

    btn.addEventListener('click', () => {
      selectedSize = sz;
      [...row.children].forEach(ch => {
        ch.classList.remove('active');
        ch.setAttribute('aria-checked','false');
        ch.tabIndex = -1;
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked','true');
      btn.tabIndex = 0;
      try { centerSelectedSizeChipNow(); } catch(_){}
    });

    btn.addEventListener('keydown', (ev) => {
      const keys = ['ArrowLeft','ArrowRight','Home','End'];
      if (!keys.includes(ev.key)) return;
      const chips   = [...row.querySelectorAll('button.chip')];
      const current = chips.indexOf(btn);
      let target    = current;
      if (ev.key === 'ArrowLeft')  target = (current - 1 + chips.length) % chips.length;
      if (ev.key === 'ArrowRight') target = (current + 1) % chips.length;
      if (ev.key === 'Home')       target = 0;
      if (ev.key === 'End')        target = chips.length - 1;
      if (target !== current) {
        ev.preventDefault();
        chips[target].focus();
        chips[target].click();
      }
    });

    if (sz === preselect) { btn.classList.add('active'); btn.setAttribute('aria-checked','true'); }
    frag.appendChild(btn);
  });

  row.appendChild(frag);

  // Reset y centrado SIN animar (antes de mostrar)
  resetSizeScrollHard();
  selectedSize = preselect || (sizes[0] || '');
  if (selectedSize) { try { centerSelectedSizeChipNow(); } catch(_){ } }

  // Fuerzo layout para que el scrollLeft “pegue” antes de revelar
  void row.offsetWidth;

  // Revelo de una, ya con el contenido final y centrado
  row.style.visibility = '';
  row.classList.remove('no-anim');
}

// ==================== CATEGORY → SIZE (UI sin flicker) ====================
function onCategoryChange() {
  const cat = (elCategory.value || '').toUpperCase().trim();

  // Oculto el carrusel mientras repinto para evitar parpadeos
  try { if (eSizesRow) eSizesRow.style.visibility = 'hidden'; } catch(_){}

  if (!cat) {
    selectedSize = '';
    if (elSizes) elSizes.innerHTML = '';
    // en ADD ocultamos Size; en EDIT lo dejamos visible pero vacío
    if (elSizeField) elSizeField.hidden = (editorMode === 'add');
    resetSizeScrollHard();
    updateEditorState();
    // restauro visibilidad
    try { if (eSizesRow) eSizesRow.style.visibility = ''; } catch(_){}
    return;
  }

  // si había un size previo incompatible, lo limpiamos
  selectedSize = (selectedSize && deriveCategoryFromSize(selectedSize) === cat) ? selectedSize : '';

  if (elSizeField) elSizeField.hidden = false;   // mostrar bloque Size
  renderSizeChipsForCategory(cat, selectedSize); // repintar chips

  // Centro o reseteo el scroll del carrusel tras el repintado
  requestAnimationFrame(() => {
    if (selectedSize) centerSelectedSizeChip(false);
    else resetSizeScrollHard();
    updateEditorState();
    try { if (eSizesRow) eSizesRow.style.visibility = ''; } catch(_){}
  });
}


function requireFieldsOrStop(){
  const player = (elPlayer.value || '').trim();
  const cat    = (elCategory.value || '').toUpperCase();
  const size   = selectedSize || getSelectedSizeFromUI();

  if (!player){ alert('Player es obligatorio.'); elPlayer.focus(); return false; }
  if (!cat){ alert('Category es obligatoria.'); elCategory.focus(); return false; }
  if (!size){ alert('Size es obligatorio.'); elSizeField.scrollIntoView({behavior:'smooth', block:'center'}); return false; }
  return true;
}

// === ITEM CANON (arregla Ball vs BALL sin romper backend) ===================
const ITEM_CANON = new Map();
function initItemCanon(items){
  try{
    ITEM_CANON.clear();
    (items||[]).forEach(it=>{
      const k = String(it||'').trim();
      if (!k) return;
      ITEM_CANON.set(k.toLowerCase(), k);  // clave: lower → valor: forma oficial del backend
    });
  }catch(_){}
}
function canonItem(s){
  const k = String(s||'').trim();
  if (!k) return '';
  return ITEM_CANON.get(k.toLowerCase()) || k; // si no lo conocemos, queda tal cual
}

// ====== STORE MODE (auto, anti-parpadeo de candados) ======
const STORE_FORCE = (qs('store') || '').toLowerCase(); // ?store=on | off | 1 | 0
let   STORE_ON = (STORE_FORCE === '1' || STORE_FORCE === 'on'); // forzar desde URL
let   _storeLastForeign = 0;

// Señalar que detectamos otro owner real (enciende modo tienda ~60s)
function storeSawForeign(){
  _storeLastForeign = Date.now();
  if (!STORE_ON) STORE_ON = true;
  // Auto-off si no se ve nadie más en 60s, salvo que esté forzado por URL
  setTimeout(() => {
    if ((STORE_FORCE !== '1' && STORE_FORCE !== 'on') &&
        Date.now() - _storeLastForeign > 60_000) {
      STORE_ON = false;
    }
  }, 61_000);
}

async function retryOnce(fn){
  try { return await fn(); }
  catch(e){
    // red/timeout típicos → un único reintento rápido
    await new Promise(r=>setTimeout(r, 600));
    return await fn();
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ====== NETWORK SAFETY (timeout + JSON robusto) ======
// --- Perfil móvil + timeouts más laxos
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const FETCH_TIMEOUT_MS    = IS_MOBILE ? 30000 : 12000;
const LONGPOLL_TIMEOUT_MS = IS_MOBILE ? 45000 : 30000

// --- Wake Lock (si el navegador lo soporta): evita que se apague la pantalla mientras editás
let __wakeLock = null;
async function keepScreenAwake(on){
  if (!('wakeLock' in navigator)) return;
  try{
    if (on && !__wakeLock){
      __wakeLock = await navigator.wakeLock.request('screen');
      __wakeLock.addEventListener('release', ()=>{ __wakeLock = null; });
    }
    if (!on && __wakeLock){ await __wakeLock.release(); __wakeLock = null; }
  }catch(_){}
}

// Clave canónica para identificar filas de forma estable
function canonKeyFor(r){
  const norm = s => String(s||'').toLowerCase().trim();
  const z    = s => (String(s||'').trim()==='-' ? '' : String(s||'').trim());
  return [
    norm(r.player||''),
    String(r.size||'').trim().toUpperCase(),
    String(r.number||'').trim(),
    norm(z(r.name||'')),
    String(Number(r.units||1) || 1)
  ].join('|');
}

// Busca un TS real en el array local por clave canónica (última coincidencia)
function findTsByKey(item, key){
  const rows = rowsByItem[item] || [];
  for (let i = rows.length - 1; i >= 0; i--){
    const rr = rows[i];
    if (Number(rr.ts) > 0 && canonKeyFor(rr) === key) return Number(rr.ts);
  }
  return 0;
}

// Remueve una fila local por TS (si existe)
function removeRowLocalByTs(item, ts){
  const arr = rowsByItem[item] || [];
  const i = arr.findIndex(x => Number(x.ts) === Number(ts));
  if (i >= 0) arr.splice(i, 1);
}


// Llamalo cuando abras/cierres vistas intensivas:
//function onInteractiveStart(){ keepScreenAwake(true); }
//function onInteractiveStop(){ keepScreenAwake(false); }

// --- Rehidratación completa al “volver” de background/BFCache/offline
function rehydrateAfterResume(){
  if (!currentItemText) return;
  hydrationUntil = Date.now() + 900;
  const order = getCurrentOrder();
  try { primeLocksForItem(order, currentItemText).then(()=>{ if (currentItemText) renderList(); }).catch(()=>{}); } catch(_){}
  try { watchLoop(order, currentItemText); } catch(_){}
  try { startLocksWatcherForItem(order, currentItemText, 350); } catch(_){}
  try { startBackgroundWatchers(order, window.__ITEMS || []); } catch(_){}
}

// pageshow (BFCache iOS), focus y volver online
window.addEventListener('pageshow', (e)=>{ if (e.persisted) rehydrateAfterResume(); });
window.addEventListener('focus', rehydrateAfterResume);
window.addEventListener('online', ()=>{ showToast('↻ Conectado. Actualizando…'); rehydrateAfterResume(); });


function getDataVer(order){
  try { return Number((window.__DATA_VER ||= {})[order] || 0); } catch(_) { return 0; }
}
function setDataVer(order, ver){
  try {
    const v = Number(ver)||0;
    const ns = (window.__DATA_VER ||= {});
    ns[order] = Math.max(Number(ns[order]||0), v);
  } catch(_){}
}

// === Helper: ¿esta fila está “pineada” por un save en curso? ===
function isSavePinned(item, ts){
  if (!ts) return false;
  return pendingSaveLocks.has(delKey(item, Number(ts)));
}

// ===== Concurrency guard para evitar picos de sockets por pestaña =====
const MAX_INFLIGHT = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 8 : 12;

let __inflight = 0;
const __waiters = [];
function __waitForSlot(){
  return new Promise(res=>{
    if (__inflight < MAX_INFLIGHT){ __inflight++; res(); }
    else __waiters.push(res);
  });
}
function __releaseSlot(){
  __inflight = Math.max(0, __inflight - 1);
  const n = __waiters.shift();
  if (n){ __inflight++; n(); }
}


function withTimeout(promise, ms = FETCH_TIMEOUT_MS){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), ms);
  return {
    signal: ctrl.signal,
    run: async (url, init = {}) => {
      const skipLimiter = /\baction=(locks|watch)\b/.test(url);
      let tookSlot = false;
      if (!skipLimiter) {
        await __waitForSlot();
        tookSlot = true;
      }
      try {
        const res = await fetch(url, {
          ...init,
          signal: ctrl.signal,
          cache: 'no-store',
          mode: 'cors',
          credentials: 'omit'
        });
        return res;
      } finally {
        clearTimeout(t);
        if (tookSlot) __releaseSlot();
      }
    }
  };
}


if (typeof qs !== 'function') {
  function qs(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }
}

function sanitizeOrder(v){
  v = String(v || '').trim();
  if (!v) return '';
  const m = v.match(/[A-Za-z0-9][A-Za-z0-9._-]*/); // sin slash
  return m ? m[0] : '';
}

function getOrderFromPath(){
  const segs = (location.pathname || '/').split('/').filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--){
    const s = sanitizeOrder(segs[i]);
    if (s) return s;
  }
  return '';
}

function getOrderFromHash(){
  return sanitizeOrder((location.hash || '').replace(/^#/, ''));
}

function notifyUnlock(order, item, ts){
  if (!ts) return;
  const payload = { action:'unlock', order, item, ts, owner: EDITOR_OWNER };
  const tryUnlock = () => postForm_(payload).catch(()=>{});
  tryUnlock();
  setTimeout(tryUnlock, 500);
  setTimeout(tryUnlock, 1500);
  setTimeout(tryUnlock, 4000);
}

// === Anti-duplicados (clave cliente) ===
const NEW_CID = () => (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + '-' + Date.now().toString(36);
const _key4 = r => [
  String(r?.player||'').toLowerCase().trim(),
  String(r?.size||'').trim(),
  String(r?.number||'').trim(),
  String(r?.name||'').toLowerCase().trim(),
  Number(r?.units||1)||1
].join('|');


// ===== REALTIME TUNING =====
const HARD_RESYNC_MS      = 4000;   // si en 4s no avanza el ver del item abierto → reload fuerte
const BG_HARD_RESYNC_MS   = 15000;  // watchdog para BG watchers (otros ítems)

const _lastProgressByItem = Object.create(null);
function markProgress(item){ _lastProgressByItem[item] = Date.now(); }
function lastProgress(item){ return _lastProgressByItem[item] || 0; }

function isVisible(){ return document.visibilityState === 'visible'; }

// Long-poll JSON con timeout configurable (no pisa robustJSON)
async function getJSONwithTimeout(url, timeoutMs = LONGPOLL_TIMEOUT_MS){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort('timeout'), timeoutMs);
  try{
    const res = await fetch(url, { cache:'no-store', signal: ctrl.signal });
    return await safeJson(res);
  } finally {
    clearTimeout(t);
  }
}



// ——— Reintentos “anti-URL-fría” (GAS dormido / login) ———
const COLD_RETRY_MS = [0, 300, 900, 2000, 4000];
async function robustJSON(url, init = {}){
  for (let i = 0; i < COLD_RETRY_MS.length; i++){
    try {
      return await getJSON(url, init);      // usa tu safeJson + timeout
    } catch (e) {
      if (i === 0) {                        // 1er fallo: “despierto” el backend
        try { await fetch(`${BACKEND}?ping=1&_cb=${CB()}`, { cache:'no-store' }); } catch(_) {}
      }
      if (i === COLD_RETRY_MS.length - 1) throw e;
      await new Promise(r => setTimeout(r, COLD_RETRY_MS[i]));
    }
  }
}

function mergeInitialRows(order, item, serverRowsRaw, ver){
  let serverRows = (serverRowsRaw||[]).map(rowFromServer);

  // Respeta edición local si hay save-lock pendiente
  const localRows = rowsByItem[item] || [];
  serverRows = serverRows.map(sr => {
    const t = Number(sr.ts) || 0;
    if (t && isSavePinned(item, t)){
      const lr = localRows.find(x => Number(x.ts) === t);
      return lr || sr;
    }
    return sr;
  });

  // Reconciliar temporales locales contra TODO lo que vino del server
  for (const sr of serverRows) reconcileTempWithReal(localRows, sr);

  const temps = (localRows||[]).filter(x => Number(x.ts) === 0);

  pruneTombstones(item, serverRowsRaw);

  // Merge + dedupe fuerte
  let merged = dedupeRows(serverRows.concat(temps));

  // Ocultar tombstones y deletes en curso
  const tomb = tombstonesByItem[item];
  if (tomb && tomb.size) merged = merged.filter(r => !tomb.has(Number(r.ts)||0));
  const delSet = deletingTsByItem[item];
  if (delSet && delSet.size) merged = merged.filter(r => !delSet.has(Number(r.ts)||0));

  rowsByItem[item] = merged;
  try { lcWrite(order, item, merged, Number(ver||0)); } catch(_){}
}

// Intenta JSON; si viene HTML de Apps Script (login/error), muestra texto útil
async function safeJson(res){
  if (!res) throw new Error('No response');
  let text;
  try {
    return await res.clone().json();
  } catch(_){
    text = await res.clone().text();
  }
  // Caso Apps Script: HTML con <pre>... o página de error/login
  const m = text && text.match(/\{[\s\S]*\}$/);
  if (m) {
    try { return JSON.parse(m[0]); } catch(_) {}
  }
  const hint = (text||'').slice(0, 240).replace(/\s+/g,' ').trim();
  throw new Error(`HTTP ${res.status} ${res.statusText} — ${hint}`);
}


async function getJSON(url, init={}){
  const t = withTimeout(null);
  return safeJson(await t.run(url, { cache:'no-store', ...init }));
}

async function postJSON(bodyObj){
  const p = new URLSearchParams();
  for (const k in bodyObj) if (bodyObj[k]!=null) p.append(k, bodyObj[k]);
  p.append('_cb', CB());
  const t = withTimeout(null);
  const res = await t.run(BACKEND, {
    method:'POST',
    cache:'no-store',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
    body: p.toString()
  });
  return safeJson(res);
}
// ====== ACQUIRE-IN-FLIGHT (mientras pedís lock, el watcher no te pisa) ======
const acquiringByItem = Object.create(null);
function markAcquiring(item, ts){
  if (!ts) return;
  (acquiringByItem[item] || (acquiringByItem[item] = new Set())).add(Number(ts));
}
function clearAcquiring(item, ts){
  const s = acquiringByItem[item];
  if (!s) return;
  if (ts) s.delete(Number(ts)); else s.clear();
}
function isAcquiring(item, ts){
  const s = acquiringByItem[item];
  return !!(s && s.has(Number(ts)));
}

function pruneTombstones(item, serverRows){
  const tomb = tombstonesByItem[item];
  if (!tomb) return;
  const serverTs = new Set((serverRows||[]).map(r => Number(r.TS || r.ts || 0)));
  // Si el server YA NO trae esa fila, el tombstone se puede limpiar
  for (const ts of Array.from(tomb)) {
    if (!serverTs.has(Number(ts))) tomb.delete(Number(ts));
  }
}

// === Resync throttle tras delete (consistencia fuerte) ===
const resyncTimerByItem = new Map();
function scheduleResync(item, delay = 350){
  if (resyncTimerByItem.has(item)) return;
  const order = getCurrentOrder();
  const id = setTimeout(async ()=>{
    resyncTimerByItem.delete(item);
    try{
      await loadFromServer(order, item, /*force*/true);
      if (item === currentItemText) renderList();
    }catch(_){}
  }, delay);
  resyncTimerByItem.set(item, id);
}

// ——— Soft reconcile para cubrir eventos perdidos sin forzar todo el tiempo ———
let softReconcileTimer = null;

//function startSoftReconcile(order, item){
//  stopSoftReconcile();
//  softReconcileTimer = setInterval(() => {
//    loadFromServer(order, item, /*force*/false)
//      .then(() => { if (item === currentItemText) renderList(); })
//      .catch(() => {});
//  }, 5000); // cada 5s, liviano
//}

function stopSoftReconcile(){
  if (softReconcileTimer){
    clearInterval(softReconcileTimer);
    softReconcileTimer = null;
  }
}

window.__IN_LOCK_SNAPSHOT__ = false;

// Marca "desde cuándo" es visible la lista por item (se setea al abrir el sheet)
const listVisibleSinceByItem = Object.create(null);

function isForeignLiveLock(item, ts){
  ts = Number(ts)||0;
  if (!ts) return false;

  // si es mío en cualquier sentido, no es extranjero
  if (iOwnLock(item, ts)) return false;

  const owner = getLocksMap(item)?.get(ts);
  if (!owner || owner === EDITOR_OWNER) return false;

  const seen = getSeenMap(item)?.get(ts) || 0;
  const now  = Date.now();
  if ((now - seen) > STALE_LOCK_MS) return false;
  if (isUnlockDelayed(item, ts) || isLockSuppressed(item, ts)) return false;

  // Durante la hidratación del ítem ABIERTO, no exijas madurez (mostralo YA).
  if (!(item === currentItemText && isWithinHydration())) {
    if (!isMature(item, ts)) return false;
  }

  const vis = listVisibleSinceByItem[item] || 0;
  if (vis && seen < vis) return false;

  return true;
}

// Debounce para pedir lock solo si te quedás en el editor
let lockRequestTimer = null;
let lockRequestEpoch = 0;

function cancelPendingLockRequest(){
  if (lockRequestTimer){ clearTimeout(lockRequestTimer); lockRequestTimer = null; }
  lockRequestEpoch++; // invalida respuestas viejas
}

const storeGrace = {
  // Micro-gracias cuando hay concurrencia real; 0ms si estás sola
  unlock () { return STORE_ON ? 300 : 0; },   // al UNLOCK remoto
  handoff() { return STORE_ON ? 300 : 0; },   // al cerrar editor
  suppress(){ return STORE_ON ? 300 : 0; }    // tras UPSERT/DELETE
};

// cierra teclado & resetea scroll (iOS friendly)
function blurAllInputsAndScrollTop(){
  try {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    document.querySelectorAll('input,textarea,select').forEach(node=>{
      if (typeof node.blur === 'function') node.blur();
    });
  } catch(_) {}

  setTimeout(()=>{
    if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, left: 0 });
    } else {
      const scroller = document.scrollingElement || document.documentElement || document.body;
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
    }
  }, 30);
}

// ======= Editor: reset vertical duro (siempre arranca arriba) =======
function resetEditorScrollHard(){
  try{
    const sc = editorBody || editorSheet || document.scrollingElement || document.documentElement || document.body;
    const set0 = () => {
      try{
        sc.scrollTop = 0;
        if (sc.scrollTo) sc.scrollTo({ top: 0, left: 0 }); // sin smooth
      }catch(_){}
    };
    requestAnimationFrame(()=>{ set0(); requestAnimationFrame(set0); });
    setTimeout(set0, 0);
  }catch(_){}
}

// ======= Editor: guard anti-overscroll (no dejar “pasarse” del final) =======
function setupEditorScrollGuard(){
  try{
    const sc = editorBody || editorSheet;
    if (!sc) return;
    if (sc.__guardBound) return;

    const clamp = () => {
      const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
      if (sc.scrollTop < 0) sc.scrollTop = 0;
      if (sc.scrollTop > max) sc.scrollTop = max;
    };

    sc.__guardHandler = clamp;
    sc.addEventListener('scroll', clamp, { passive:true });
    sc.addEventListener('wheel', clamp, { passive:true });
    sc.addEventListener('touchmove', clamp, { passive:true });
    sc.__guardBound = true;

    // micro-ajuste inicial por si abre con rebote
    clamp();
  }catch(_){}
}

function teardownEditorScrollGuard(){
  try{
    const sc = editorBody || editorSheet;
    if (!sc || !sc.__guardBound) return;
    const h = sc.__guardHandler;
    sc.removeEventListener('scroll', h);
    sc.removeEventListener('wheel', h);
    sc.removeEventListener('touchmove', h);
    sc.__guardHandler = null;
    sc.__guardBound = false;
  }catch(_){}
}

// —— poner cerca de tus flags globales ——
let openingSheet = false;
let queuedRowClick = null;

function queueRowClick(idx){
  queuedRowClick = { item: currentItemText, idx };
}

function flushQueuedRowClick(){
  if (!queuedRowClick) return;
  if (queuedRowClick.item !== currentItemText) { queuedRowClick = null; return; }
  const rows = getRowsForCurrent();
  const r = rows[queuedRowClick.idx];
  if (r) openEditor(r, queuedRowClick.idx);
  queuedRowClick = null;
}

// ===== Local cache con versión (SWR inteligente) =====
const LC_NS = 'rows_cache_v3';
const lcKey = (order, item) => `${LC_NS}__${order}__${item}`;

function lcRead(order, item, maxAgeMs = 20 * 1000){
  try{
    const raw = localStorage.getItem(lcKey(order, item));
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !Array.isArray(obj.rows)) return null;
    if(Date.now() - (obj.t || 0) > maxAgeMs) return null;
    return obj; // {rows, ver, t}
  }catch(_){ return null; }
}

function lcWrite(order, item, rows, ver = 0){
  try{ localStorage.setItem(lcKey(order, item), JSON.stringify({ t: Date.now(), ver, rows })); }catch(_){}
}
function lcDel(order, item){
  try{ localStorage.removeItem(lcKey(order, item)); }catch(_){}
}
// Purga todas las claves de un order en localStorage
function lcPurgeByOrder(order){
  try{
    const prefix = `${LC_NS}__${order}__`;
    const toDel = [];
    for (let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toDel.push(k);
    }
    toDel.forEach(k => localStorage.removeItem(k));
  }catch(_){}
}

// ——— Placeholders de resumen (totales y tallas) ———
function setSummaryPlaceholders(){
  try{
    const totalDiv = document.querySelector('#summary > div:first-child');
    if (totalDiv) totalDiv.innerHTML = `<b>Total players:</b> — — <b>Total units:</b> —`;
    if (typeof sumSizes !== 'undefined' && sumSizes) sumSizes.textContent = 'Sizes: —';
  }catch(_){}
}

// ——— Leer cache ignorando vencimiento (para mostrar algo en caliente) ———
function lcPeek(order, item){
  try{
    const raw = localStorage.getItem(lcKey(order, item));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return (obj && Array.isArray(obj.rows)) ? obj : null; // {rows, ver, t}
  }catch(_){ return null; }
}

// Bloquea doble-tap select/zoom
document.addEventListener('dblclick', e => e.preventDefault(), { passive:false });

// Tap rápido sin rebotes
function bindFastAction(node, handler){
  if(!node) return;
  let armed=false;
  node.addEventListener('pointerdown',(e)=>{ e.preventDefault(); armed=true; },{passive:false});
  node.addEventListener('pointerup',(e)=>{
    if(!armed) return;
    e.preventDefault();
    armed=false;
    if (busy) return;
    handler();
    setTimeout(()=>document.activeElement?.blur?.(),0);
  },{passive:false});
  node.addEventListener('pointercancel', ()=>{ armed=false; }, {passive:true});
  node.addEventListener('click',(e)=>{ e.preventDefault(); },{passive:false});
}


// ============= BOOT OVERLAY ===========================
function showBoot(v=true, text='Loading…'){
  const mask = $('#bootMask');
  if(!mask) return;
  const t = mask.querySelector('.boot-text');
  if (t) t.textContent = text || 'Loading…';
  mask.style.display = v ? 'grid' : 'none';
}

// ================== SHEET 1 (LIST) ====================
const overlay    = $('#overlay');
const sheet      = $('#sheet');
const sheetBack  = $('#sheetBack');
const sheetTitle = $('#sheetTitle');
const btnAdd     = $('#btnAdd');
const listEl     = $('#list');
const sumSizes   = $('#summarySizes');
const emptyBox   = $('#empty');

let currentItemText = '';
let sizeOptions = null;

// Estructura en memoria: { [itemText]: Array<Row> } ; Row: {ts,player,size,number,name,units}
const rowsByItem = Object.create(null);

// Tombstones por item para ocultar jugadores borrados inmediatamente
const tombstonesByItem = Object.create(null);
// Borrados en curso (para feedback inmediato aunque el server tarde)
const deletingTsByItem = Object.create(null);
// helpers
function markDeleting(item, ts){
  if(!ts) return;
  (deletingTsByItem[item] || (deletingTsByItem[item] = new Set())).add(Number(ts));
}
function clearDeleting(item, ts){
  if(!deletingTsByItem[item]) return;
  if(ts) deletingTsByItem[item].delete(Number(ts));
  else deletingTsByItem[item].clear();
}

function markTombstone(item, ts){
  if(!ts && ts !== 0) return;
  (tombstonesByItem[item] || (tombstonesByItem[item] = new Set())).add(Number(ts));
}
function clearTombstones(item){
  if(tombstonesByItem[item]) tombstonesByItem[item].clear();
}

// ===== LOCK INDEX (estado local de locks por item/ts) =====
const locksByItem = Object.create(null);
function getLocksMap(item){
  item = canonItem(item);
  return (locksByItem[item] || (locksByItem[item] = new Map()));
}
function setLock(item, ts, owner){
  if(!ts) return;
  getLocksMap(item).set(Number(ts), String(owner||''));
}
function clearLock(item, ts){
  if(!locksByItem[item]) return;
  if(ts) locksByItem[item].delete(Number(ts));
  else locksByItem[item].clear();
}
function isLockedElsewhere(item, ts){
  ts = Number(ts)||0;
  if (!ts) return false;
  if (iOwnLock(item, ts)) return false; // nunca te marques como “otro”
  const m = getLocksMap(item);
  const owner = m ? m.get(ts) : null;
  return !!owner && owner !== EDITOR_OWNER;
}

// ================ SHEET 2 (EDITOR) ====================
const overlay2    = $('#overlay2');
const editorSheet = $('#editorSheet');
overlay2.addEventListener('click', (e) => {
  // No cerrar el editor al tocar fuera; solo limpiamos foco si hace falta
  e.stopPropagation();
  try{ document.activeElement?.blur?.(); }catch(_){}
});

const ePlayer   = $('#ePlayer');
const eSizesRow = $('#eSizes');
const eNumber   = $('#eNumber');
const eName     = $('#eName');
const eUnits    = $('#eUnits');
const qMinus    = $('#qMinus');
const qPlus     = $('#qPlus');
const eSave   = $('#eSave');
const eCancel = $('#eCancel');
const eDelete = $('#eDelete');
// ====== EDIT GUARD (registro eliminado en otro dispositivo) ======
// ====== EDIT GUARD (registro eliminado / bloqueado en otro dispositivo) ======
let editGone   = false;
let editLocked = false;               // ← NUEVO: bloqueo (otra sesión lo edita)
const EDITOR_OWNER = (() => {
  try {
    const K = 'editor_owner_v1';
    let id = localStorage.getItem(K);
    if (!id) {
      id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + '-' + Date.now().toString(36);
      localStorage.setItem(K, id);
    }
    return id;
  } catch (_) {
    return Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }
})();
let lockTs = 0;                  // TS actualmente bloqueado por esta sesión (si aplica)
let lockHeartbeat = null;
let lockMsg    = 'This player is being edited on another device.'; // texto del lock

function ensureGoneBanner(){
  let b = document.getElementById('editGoneBanner');
  if(!b){
    b = document.createElement('div');
    b.id = 'editGoneBanner';
    b.className = 'edit-banner';
    b.textContent = 'This player was deleted on another device.';
    const container = editorSheet.querySelector('.editor-inner') || editorSheet;
    container.insertAdjacentElement('afterbegin', b);
  }
  return b;
}
function ensureLockedBanner(){
  let b = document.getElementById('editLockedBanner');
  if(!b){
    b = document.createElement('div');
    b.id = 'editLockedBanner';
    b.className = 'edit-banner';
    const container = editorSheet.querySelector('.editor-inner') || editorSheet;
    container.insertAdjacentElement('afterbegin', b);
  }
  return b;
}

// Habilita/Deshabilita TODOS los controles de edición (excepto Cancel)
function setEditorInteractivity(enabled){
  const controls = [ePlayer, eNumber, eName, eUnits, qMinus, qPlus, eSave, eDelete, elCategory];
  controls.forEach(c => { if (c) c.disabled = !enabled; });

  // Chips de talla
  [...(eSizesRow?.querySelectorAll('.chip') || [])].forEach(chip => {
    chip.disabled = !enabled;
    chip.classList.toggle('chip--disabled', !enabled);
  });

  // Cancel SIEMPRE habilitado
  if (eCancel) eCancel.disabled = false;
}

// Aplica el estado visible y de interacción en base a flags
function updateEditorState(){
  if (editorSheet.hidden) return;

  const goneB   = ensureGoneBanner();
  const lockedB = ensureLockedBanner();

  if (editGone){
    // Prioridad absoluta: GONE
    goneB.hidden   = false;
    lockedB.hidden = true;
    setEditorInteractivity(false);
    return;
  }

  if (editLocked){
    goneB.hidden   = true;
    lockedB.hidden = false;
    lockedB.textContent = lockMsg || 'This player is being edited on another device.';
    setEditorInteractivity(false);
    return;
  }

  // Normal (nada raro)
  goneB.hidden   = true;
  lockedB.hidden = true;
  setEditorInteractivity(true);
}

// Reemplazo “show/hide” antiguos por setters de estado
function showEditGoneBanner(){
  editGone = true;
  updateEditorState();
}
function hideEditGoneBanner(){
  editGone = false;
  updateEditorState();
}
function showEditLockedBanner(msg='This player is being edited on another device.'){
  editLocked = true;
  lockMsg = msg || lockMsg;
  updateEditorState();
}
function hideEditLockedBanner(){
  editLocked = false;
  updateEditorState();
}

function holdSaveLock(item, ts){
  if (!ts) return;
  setLock(item, ts, EDITOR_OWNER);
  renderList();

  const beat = () => postForm_({
    action:'lock',
    order : getCurrentOrder(),
    item, ts, owner : EDITOR_OWNER
  }).catch(()=>{});
  beat();
  const id = setInterval(beat, 15_000);
  pendingSaveLocks.set(delKey(item, ts), id);

  // --- Watchdog: libera solo si, por algún motivo, nunca llega el upsert (2 min) ---
  setTimeout(() => {
    if (pendingSaveLocks.has(delKey(item, ts))) {
      releaseSaveLock(item, ts);
    }
  }, 40_000);
}

function releaseSaveLock(item, ts){
  if (!ts) return;
  const key = delKey(item, ts);
  const id = pendingSaveLocks.get(key);
  if (id) clearInterval(id);
  pendingSaveLocks.delete(key);

  // best-effort unlock
  postForm_({
    action:'unlock',
    order : getCurrentOrder(),
    item,
    ts,
    owner : EDITOR_OWNER
  }).catch(()=>{});

  clearLock(item, ts);
  renderList();
  updateItemGridLockBadges();
}

// === DOM del editor (Category + Size) =======================================
const elEditorSheet = document.getElementById('editorSheet');
const elCategory    = document.getElementById('eCategory');
const elSizeField   = document.getElementById('eSizeField'); // wrapper del Size
const elSizes       = document.getElementById('eSizes');      // contenedor de chips
const elPlayer      = document.getElementById('ePlayer');
const elNumber      = document.getElementById('eNumber');
const elName        = document.getElementById('eName');
const elUnits       = document.getElementById('eUnits');
const btnSave       = document.getElementById('eSave');
const btnDelete     = document.getElementById('eDelete');

// Estado efímero del editor
let editorMode   = 'add';   // 'add' | 'edit'

// footer/keyboard
const editorBody    = document.querySelector('.editor-body');
const actionsFooter = document.querySelector('.actions-footer');

let footerRO = null;
let currentEditIndex = -1;
let selectedSize = '';
let draft  = { ts:0, player:'', size:'', number:'', name:'', units:1 };
let gridScrollY = 0;
let lastBtn = null;
let dirty  = false;
let originalSnapshot = '';

function snapshotFromEditor(){
  return JSON.stringify({
    ts    : Number(draft.ts)||0,
    player: (ePlayer.value||'').trim(),
    size  : String(selectedSize||''),
    number: (eNumber.value||'').trim(),
    name  : (eName.value||'').trim(),
    units : Math.max(1,Math.min(100,Number(eUnits.value)||1))
  });
}

function recomputeDirty(){
  dirty = (snapshotFromEditor() !== originalSnapshot);
}

function onMinus(){
  if (busy) return;
  const v = Math.max(1,(Number(eUnits.value)||1)-1);
  if (String(v) !== eUnits.value){ eUnits.value = v; recomputeDirty(); }
}
function onPlus(){
  if (busy) return;
  const v = Math.min(100,(Number(eUnits.value)||1)+1);
  if (String(v) !== eUnits.value){ eUnits.value = v; recomputeDirty(); }
}

function rememberGridScroll(){ gridScrollY = window.scrollY || document.documentElement.scrollTop || 0; }
function restoreGridScroll(){
  if (typeof gridScrollY !== 'number') return;
  try{
    if (window.scrollTo) window.scrollTo({ top: gridScrollY, left: 0 });
    else window.scrollTop = gridScrollY;
  }catch(_){}
  if (lastBtn) { try{ lastBtn.focus(); }catch(_){ } }
}

const LOCAL_SIZE_FALLBACK = [
  'Y4XS','Y3XS','Y2XS','YXXS','YXS','YS','YM','YL','YXL',
  'XXS','XS','SM','MD','LG','XL','2XL','3XL','4XL','5XL',
  'WXS','WS','WM','WL','WXL','W2XL','W3XL',
  'STD'
];

// === Busy / Loading mask (sheet) ===
let busy = false;
function setBusy(v){
  busy = !!v;
  let mask = document.getElementById('busyMask');
  if(!mask){
    mask = document.createElement('div');
    mask.id = 'busyMask';
    mask.className = 'loading-mask';
    mask.innerHTML = '<div class="spinner" aria-label="Working…"></div>';
    sheet.appendChild(mask);
  }
  mask.classList.toggle('show', busy);
  [eSave, eDelete, eCancel, qMinus, qPlus, btnAdd].forEach(b=>{ if(b) b.disabled = busy; });
  sheet.classList.toggle('is-busy', busy);
  editorSheet.classList.toggle('is-busy', busy);
}

// ================ OVERLAYS =============================
function showOverlay(){ overlay.hidden=false; overlay.classList.add('show'); document.body.classList.add('modal-open'); }
function hideOverlay(){ overlay.classList.remove('show'); overlay.hidden=true; document.body.classList.remove('modal-open'); }
function showOverlay2(){ overlay2.hidden=false; overlay2.classList.add('show'); }
function hideOverlay2(){ overlay2.classList.remove('show'); overlay2.hidden=true; }

// ============== WATCHER (ver + deltas por TS) =========
let watchVer = 0;
let watchAbort = null;

// ===== FAST LOCK WATCH (merge + TTL) =====
let locksWatchAbort = null;
const locksVerByItem = Object.create(null);
const lockSeenAtByItem = Object.create(null); // item -> Map(ts -> lastSeenMs)
// --- SUPRESIÓN DE LOCKS TRAS UPSERT/DELETE (anti flicker) ---
const suppressLockUntilByItem = Object.create(null); // item -> Map(ts -> untilMs)

// --- Lock maturity / hydration guard ---
let   hydrationUntil    = 0;

const lockFirstSeenAtByItem = Object.create(null);
const lockSeenCountByItem   = Object.create(null);

function getFirstSeenMap(item){
  item = canonItem(item);
  return (lockFirstSeenAtByItem[item] || (lockFirstSeenAtByItem[item] = new Map()));
}
function getSeenCountMap(item){
  item = canonItem(item);
  return (lockSeenCountByItem[item] || (lockSeenCountByItem[item] = new Map()));
}
// noteSeen: ahora respeta snapshots (no suma contador si es snapshot)
function noteSeen(item, ts, now = Date.now(), countable /* opcional */){
  if (!ts) return;
  const fm = getFirstSeenMap(item);
  const cm = getSeenCountMap(item);

  if (!fm.has(ts)) fm.set(ts, now);

  // Si no te pasan el cuarto parámetro, decidimos en base al flag global:
  const shouldCount = (typeof countable === 'boolean')
    ? countable
    : !window.__IN_LOCK_SNAPSHOT__;

  if (shouldCount) cm.set(ts, (cm.get(ts) || 0) + 1);
}
function clearSeen(item, ts){
  if (!ts) return;
  getFirstSeenMap(item)?.delete(ts);
  getSeenCountMap(item)?.delete(ts);
}
function isWithinHydration(){ return Date.now() < hydrationUntil; }
function isMature(item, ts){
  const fm = getFirstSeenMap(item), cm = getSeenCountMap(item);
  const t0 = fm.get(ts) || 0, c = cm.get(ts) || 0;
  return (Date.now() - t0) >= LOCK_MATURITY_MS || c >= 2;
}
function isEffectivelyLockedElsewhere(item, ts){
  if (!isLockedElsewhere(item, ts)) return false;
  if (isWithinHydration() && !isMature(item, ts)) return false;
  return true;
}
// === GRACIA ultra corta para UNLOCK tras Cancel ===
function currentUnlockGraceMs(){
  // Cancel debe sentirse inmediato (sin parpadeo)
  return isWithinHydration() ? 0 : 180;
}

// === Envío confiable en background (extra al fetch keepalive) ===
function beaconUnlock(order, item, ts){
  try{
    if (!navigator.sendBeacon) return false;
    const data = new URLSearchParams({action:'unlock', order, item, ts:String(ts), owner: EDITOR_OWNER, _cb: CB()});
    return navigator.sendBeacon(
      BACKEND,
      new Blob([data.toString()], { type: 'application/x-www-form-urlencoded;charset=UTF-8' })
    );
  }catch(_){ return false; }
}


function suppressLockFor(item, ts, ms = 600){
  if (!ts) return;
  const mp = (suppressLockUntilByItem[item] || (suppressLockUntilByItem[item] = new Map()));
  mp.set(Number(ts), Date.now() + ms);
}

function isLockSuppressed(item, ts){
  const mp = suppressLockUntilByItem[item];
  if (!mp) return false;
  const until = mp.get(Number(ts)) || 0;
  if (until && Date.now() <= until) return true;
  if (until && Date.now() > until) mp.delete(Number(ts)); // limpieza
  return false;
}

// ===== GRID LOCK BADGES (candaditos en botones del grid) =====

// ¿Algún lock vivo de otro owner en este item?
function hasForeignLiveLock(item){
  item = canonItem(item);
  try{
    const mp   = getLocksMap(item);
    if (!mp || mp.size === 0) return false;
    const seen = getSeenMap(item);
    const now  = Date.now();
    for (const [ts, owner] of mp.entries()){
      if (!owner || owner === EDITOR_OWNER) continue;
      const lastSeen = seen?.get?.(Number(ts)) || 0;
      const live = (now - lastSeen) <= STALE_LOCK_MS
                && !isUnlockDelayed(item, ts)
                && !isLockSuppressed(item, ts);
      if (live && isMature(item, ts)) return true;
    }
    return false;
  }catch(_){ return false; }
}

function updateItemGridLockBadges(){
  const grid = document.querySelector('#itemsGrid');
  if (!grid) return;

  // limpiar restos previos
  grid.querySelectorAll('button.btn').forEach(b => {
    b.classList.remove('btn--locked');
    b.removeAttribute('aria-label');
    const old = b.querySelector('.btn-lock');
    if (old) old.remove();
  });

  if (!SHOW_GRID_LOCK_BADGES) return;

  // pintar locks vigentes
  grid.querySelectorAll('button.btn').forEach(b => {
    const it = b.dataset.item || b.textContent || '';
    if (!it) return;
    if (hasForeignLiveLock(it)) {
      b.classList.add('btn--locked');
      b.setAttribute('aria-label', 'Locked elsewhere');
      const badge = document.createElement('span');
      badge.className = 'btn-lock';
      badge.textContent = '🔒';
      b.appendChild(badge);
    }
  });
}


// === LOCK TIMING (consistentes) ===
const LOCK_REQUEST_DELAY_MS     = 0;
const HEARTBEAT_MS              = 5000;   // 1 solo canal (GAS: action=lock)
const LOCK_TTL_MS               = 45000;
const FULL_RECONCILE_EVERY_MS   = 10000;   // snapshot completo de locks cada 10s
const UNLOCK_GRACE_MS           = 0;      // anti-parpadeo al liberar
const HANDOFF_GRACE_MS          = 0;      // cambio rápido de TS A→B
const STALE_LOCK_MS             = Math.max(HEARTBEAT_MS * 3, 30000); // ~30s
const LOCK_MATURITY_MS          = 0;    // “madurez” mínima para mostrar 🔒

// Watchers (ajustes para 100+ usuarios)
const LOCKS_WATCH_INTERVAL_MS   = 500;    // intervalito del watcher de locks
const BG_POLL_MS                = 2400;   // pausa de los BG watchers de datos
const MAX_BG_WATCHED_ITEMS      = 3;      // tope de ítems vigilados en 2º plano
const WARMER_PERIOD_MS          = 5000;   // warmer global rotativo

// --- Tap guard para evitar aperturas dobles del editor ---
const LOCKS_ENDPOINT = null;              // ⛔️ desactivado el endpoint paralelo
let _openTapUntil = 0;
const OPEN_TAP_GUARD_MS = 350;


function gcLocks(item){
  try{
    const now = Date.now();
    const mp  = getLocksMap(item);
    const sm  = getSeenMap(item);
    if (!mp || !sm) return;
    for (const [ts, t] of sm.entries()){
      if ((now - t) > STALE_LOCK_MS){ sm.delete(ts); mp.delete(ts); }
    }
  }catch(_){}
}

// --- Unlock local inmediato + supresión anti-parpadeo ---
function localUnlockImmediate(item, ts, graceMs=0){
  if (!ts) return;
  clearLock(item, ts); // quitar YA del índice local
  if (graceMs > 0) suppressLockFor(item, ts, graceMs); // evita “reaparición” por snapshot rezagado
  if (item === currentItemText) renderList();
  updateItemGridLockBadges();
}

// Helper necesaria: solo desbloquea visualmente si el lock es tuyo
function localUnlockIfMine(item, ts, graceMs = 0){
  if (!ts) return;
  const cur = getLocksMap(item)?.get(Number(ts));
  if (cur === EDITOR_OWNER) {
    localUnlockImmediate(item, ts, graceMs);
  }
}

// Pendientes de "borrar lock" con delay: item -> Map(ts -> untilMs)
const delayedUnlockUntilByItem = Object.create(null);
function markUnlockDelay(item, ts, ms){
  if (!ts) return;
  const mp = (delayedUnlockUntilByItem[item] || (delayedUnlockUntilByItem[item] = new Map()));
  mp.set(Number(ts), Date.now() + ms);
}
function isUnlockDelayed(item, ts){
  const mp = delayedUnlockUntilByItem[item];
  if (!mp) return false;
  const until = mp.get(Number(ts)) || 0;
  if (until && Date.now() <= until) return true;
  if (until && Date.now() > until) mp.delete(Number(ts)); // limpieza
  return false;
}
// ClearLock pero respetando la gracia
function delayedClearLock(item, ts, ms = UNLOCK_GRACE_MS){
  if (!ts) return;
  const tsN = Number(ts);
  const owner = getLocksMap(item)?.get(tsN);

  // Si es nuestro (o lo seguimos sosteniendo por save/delete/granted), limpiá inmediato y no “parpadees”
  if (owner === EDITOR_OWNER || iOwnLock(item, tsN) || ms <= 0) {
    clearLock(item, tsN);
    if (item === currentItemText) renderList();
    updateItemGridLockBadges();
    return;
  }
  markUnlockDelay(item, tsN, ms);
  setTimeout(() => {
    if (isUnlockDelayed(item, tsN)) return;
    clearLock(item, tsN);
    if (item === currentItemText) renderList();
    updateItemGridLockBadges();
  }, ms + 10);
}



function getLocksVer(item){
  item = canonItem(item);
  return locksVerByItem[item] || 0;
}
function setLocksVer(item, ver){
  item = canonItem(item);
  locksVerByItem[item] = Number(ver)||0;
}

function getSeenMap(item){
  item = canonItem(item);
  return (lockSeenAtByItem[item] || (lockSeenAtByItem[item] = new Map()));
}
async function tryAcquireLock(order, item, ts){
  markAcquiring(item, ts);
  try{
    const j = await postForm_({
      action:'lock',
      order, item, ts,
      owner: EDITOR_OWNER
    });
    return j && j.ok && String(j.owner||'') === String(EDITOR_OWNER);
  } finally {
    clearAcquiring(item, ts);
  }
}



// ========== CANCEL EDIT (atómico, sin fantasmas) ==========
// ========== CANCEL EDIT (atómico, sin fantasmas) ==========
async function cancelEdit(order, item, ts, graceMs = 150){
  // 1) Cortar heartbeat del editor
  try { if (typeof stopEditHeartbeat === 'function') stopEditHeartbeat(); } catch(_) {}

  // 2) Unlock visual inmediato + anti-parpadeo (solo si el lock era tuyo)
  try {
    if (typeof localUnlockIfMine === 'function') {
      localUnlockIfMine(item, ts, graceMs);
    } else {
      if (typeof markUnlockDelay === 'function') markUnlockDelay(item, ts, graceMs);
      if (typeof clearLock === 'function') clearLock(item, ts);
      if (typeof renderList === 'function') renderList();
      if (typeof updateItemGridLockBadges === 'function') updateItemGridLockBadges();
    }
    try { if (typeof clearAcquiring === 'function') clearAcquiring(item, ts); } catch(_) {}
    try { if (typeof clearSeen === 'function') clearSeen(item, ts); } catch(_) {}
  } catch(_) {}

  // 3) Notificación al backend solo si el lock era realmente tuyo
  if (!ts) return; // nada que liberar en server si es alta (ts=0)
  const cur = getLocksMap(item)?.get(Number(ts));
  const owned = (cur === EDITOR_OWNER) || iOwnLock(item, ts);
  if (!owned) return;

  try {
    await postForm_({
      action:'unlock',
      order,
      item,
      ts,
      owner : EDITOR_OWNER,
      reason: 'cancel'
    });
  } catch(_) {
    // retry suave por si hay lag
    setTimeout(() => {
      postForm_({ action:'unlock', order, item, ts, owner: EDITOR_OWNER, reason:'cancel' }).catch(()=>{});
    }, 400);
  }
}

// === Locks Event Bus (global, una sola vez) ===
const lockListeners = new Set();
// ⛔ Si NO usás modules, QUITÁ "export"
function onLocksChange(fn){ lockListeners.add(fn); return () => lockListeners.delete(fn); }
function emitLocksChange(item, payload){ for (const fn of lockListeners) fn(item, payload); }

onLocksChange((item, {rows, snapshot, ver}) => {
  // Actualizá SOLO los nodos afectados (no repintar todo):
  for (const r of (rows || [])){
    const ts    = Number(r.ts || r.TS || 0);
    const owner = String(r.owner || '');
    if (!ts) continue;
    patchRowLockUI(item, ts, owner, { snapshot, ver, r });
  }
});

function patchRowLockUI(item, ts, owner, ctx){
  if (item !== currentItemText) return;
  const rowEl = listEl?.querySelector(`.row[data-ts="${Number(ts)||0}"]`);
  if (!rowEl) { renderList(); return; }

  const elseLocked = isForeignLiveLock(item, ts);
  rowEl.classList.toggle('row--locked', elseLocked);
  rowEl.setAttribute('data-locked', elseLocked ? 'else' : 'no');

  let badge = rowEl.querySelector('.lock');
  if (elseLocked){
    if (!badge){
      const left = rowEl.querySelector('.row__left');
      badge = document.createElement('span');
      badge.className = 'lock';
      badge.textContent = '🔒';
      left?.appendChild(badge);
    }
  } else {
    badge?.remove?.();
  }
}

let editBeatAbort;
function startEditHeartbeat(){ /* no-op: heartbeat unificado en openEditor() */ }
function stopEditHeartbeat(){
  try { if (editBeatAbort) editBeatAbort.abort(); } catch(_){}
  editBeatAbort = null;
}

async function startLocksWatcherForItem(order, item, intervalMs = 250){
  if (locksWatchAbort) locksWatchAbort.abort();
  locksWatchAbort = new AbortController();
  const signal = locksWatchAbort.signal;

  const mp     = getLocksMap(item);     // Map(ts -> owner)
  const seenMp = getSeenMap(item);      // Map(ts -> lastSeenMs)

  const norm = v => String(v||'').trim();
  const MY   = norm(EDITOR_OWNER);

  let lastFull = 0; // ← para reconciliaciones periódicas

  while(!signal.aborted){
    try{
      // cada FULL_RECONCILE_EVERY_MS fuerzo snapshot completo (since=0)
      const now = Date.now();
      const wantFull = (now - lastFull) > FULL_RECONCILE_EVERY_MS;
      const since    = wantFull ? 0 : getLocksVer(item);

      // ⚠️ asegurar getDataVer
      let dataVerNow = 0;
      try { dataVerNow = Number(getDataVer(order) || 0); } catch(_) { dataVerNow = 0; }

      const url = `${BACKEND}?action=locks&order=${encodeURIComponent(order)}&item=${encodeURIComponent(item)}&since=${since}&_cb=${CB()}`;
      const j = await robustJSON(url);

      if (j && j.ok){
        if (typeof j.ver === 'number' && j.ver > getLocksVer(item)) setLocksVer(item, j.ver);
        if (wantFull) lastFull = now;

        const isSnapshot = (since === 0) || (j.full === true) || (j.snapshot === true);
        const hasRows    = Array.isArray(j.rows);

        if (hasRows){
          if (isSnapshot){
            // LOS SNAPSHOTS NO MADURAN
            window.__IN_LOCK_SNAPSHOT__ = true;
            const presentNow = new Set();

            for (const r of j.rows){
              const ts    = Number(r.ts || r.TS || 0);
              const owner = norm(r.owner);
              if (!ts) continue;

              const unlockVer = Number(r.unlockAfterDataVer || 0);
              if (unlockVer && dataVerNow < unlockVer){
                seenMp.set(ts, now);
                noteSeen(item, ts, now, /*countable*/ false);
                presentNow.add(ts);
                if (owner) setLock(item, ts, owner);
                continue;
              }

              if (!owner) continue;

              // NO suprimir locks reales (con owner)
              if (isLockSuppressed(item, ts)) {
                if (owner) {
                  const mpSup = suppressLockUntilByItem[item];
                  mpSup?.delete?.(Number(ts));
                } else {
                  continue;
                }
              }

              // ⚠️ Quitado: no ignoramos locks ajenos aunque estemos acquiring

              setLock(item, ts, owner);
              seenMp.set(ts, now);
              noteSeen(item, ts, now, /*countable*/ false);
              presentNow.add(ts);
              if (owner !== MY) storeSawForeign();
            }

            // limpiar los que no vinieron en snapshot
            for (const [ts, curOwner] of mp.entries()){
              if (!presentNow.has(ts)) {
                if (isWithinHydration()) continue;
                if (norm(curOwner) === MY) continue;
                if (isUnlockDelayed(item, ts)) continue;
                mp.delete(ts);
                seenMp.delete(ts);
                clearSeen(item, ts);
              }
            }
            window.__IN_LOCK_SNAPSHOT__ = false;

          } else {
            // DELTAS (sí maduran)
            for (const r of j.rows){
              const ts    = Number(r.ts || r.TS || 0);
              const owner = norm(r.owner);
              if (!ts) continue;

              const unlockVer = Number(r.unlockAfterDataVer || 0);
              const curOwner  = norm(mp.get(ts));

              if (!owner){
                // UNLOCK
                if (unlockVer && dataVerNow < unlockVer){
                  seenMp.set(ts, now);
                  continue;
                }
                if (curOwner === MY) {
                  delayedClearLock(item, ts, currentUnlockGraceMs());
                  clearSeen(item, ts);
                  continue;
                }
                if (isLockSuppressed(item, ts)) {
                  continue;
                }
                mp.delete(ts);
                seenMp.delete(ts);
                clearSeen(item, ts);
                continue;
              }

              // LOCK
              if (isLockSuppressed(item, ts)) {
                const mpSup = suppressLockUntilByItem[item];
                mpSup?.delete?.(Number(ts));
              }

              // ⚠️ Quitado: no ignoramos locks ajenos aunque estemos acquiring

              setLock(item, ts, owner);
              seenMp.set(ts, now);
              noteSeen(item, ts, now, /*countable*/ true);
              if (owner !== MY) storeSawForeign();
            }
          }
        }

        // Anti-ghost
        for (const [ts, t] of seenMp.entries()){
          if ((now - t) > STALE_LOCK_MS){
            if (norm(mp.get(ts)) === MY) continue;
            seenMp.delete(ts);
            mp.delete(ts);
          }
        }

        emitLocksChange(item, { snapshot: isSnapshot, rows: j.rows || [], ver: j.ver });
        updateItemGridLockBadges();
      }
    }catch(_){ /* silenciar */ }

    await new Promise(r => setTimeout(r, intervalMs));
  }
}

function startGlobalLocksWarmer(order, items, periodMs = WARMER_PERIOD_MS){
  let cancelled = false;
  let i = 0;

  const tick = async () => {
    if (cancelled) return;
    try{
      if (!items || !items.length) return;
      if (document.hidden) { setTimeout(tick, periodMs); return; } // evita spam en background
      const it = items[i % items.length]; // 1 ítem por tick (rotación)
      i++;
      window.__IN_LOCK_SNAPSHOT__ = true;
      await primeLocksForItem(order, it);
      window.__IN_LOCK_SNAPSHOT__ = false;
      updateItemGridLockBadges();
    }catch(_){
      window.__IN_LOCK_SNAPSHOT__ = false;
    }
    const jitter = Math.floor(Math.random()*400);
    setTimeout(tick, periodMs + jitter);
  };

  tick();
  return () => { cancelled = true; };
}




function warmLocksInBackground(order, items, durationMs = 10 * 60 * 1000, periodMs = 3_000){
  // ↑ por defecto 10 minutos (antes 45s) — suficiente para que el segundo móvil llegue “precalentado”
  let stopAt = Date.now() + durationMs;
  let cancelled = false;

  const tick = async () => {
    if (cancelled || Date.now() > stopAt) return;
    try{
      // snapshot inmediato de locks por cada ítem (sin abrir watchers)
      for (const it of items){
        await primeLocksForItem(order, it);
      }
      if (currentItemText) renderList();
    }catch(_){}
    const jitter = Math.floor(Math.random() * 400); // desincroniza un poco la red
    setTimeout(tick, periodMs + jitter);
  };
  tick();

  return () => { cancelled = true; };
}

// ——— DATA Warmer (revalida sin mostrar "Loading...") ———
let cancelDataWarm = null;

function startDataWarmer(order, items, eagerMs = 4 * 60 * 1000, periodMs = 60 * 1000){
  let cancelled = false;
  const tick = async () => {
    if (cancelled) return;
    try{
      for (const it of items){
        const obj = lcPeek(order, it);
        const age = obj ? (Date.now() - (obj.t || 0)) : Infinity;
        // Revalida en background cuando falta poco para vencer (o no hay cache)
        if (age > eagerMs){
          await loadFromServer(order, it, /*force*/false).catch(()=>{});
        }
      }
    }catch(_){}
    setTimeout(tick, periodMs + Math.floor(Math.random()*400));
  };
  tick();
  return () => { cancelled = true; };
}

function stopDataWarmer(){ try{ cancelDataWarm && cancelDataWarm(); }catch(_){ } cancelDataWarm = null; }

function stopLocksWatcher(){
  if (locksWatchAbort){
    locksWatchAbort.abort();
    locksWatchAbort = null;
  }
}

// ===== Lock extendido para DELETE pendiente =====
const pendingDeleteLocks = new Map(); // key -> intervalId
const delKey = (item, ts) => `${item}::${ts}`;
const pendingSaveLocks = new Map(); // key -> intervalId (usa delKey(item, ts))

// === Own-lock authority (servidor lo concedió) ===
const grantedLocksByItem = Object.create(null);
function getGrantedSet(item){
  return (grantedLocksByItem[item] || (grantedLocksByItem[item] = new Set()));
}

// ¿Este cliente posee el lock de verdad?
function iOwnLock(item, ts){
  ts = Number(ts)||0;
  if (!ts) return false;
  // 1) Map local explícito
  const owner = getLocksMap(item)?.get(ts);
  if (owner === EDITOR_OWNER) return true;

  // 2) Lock del editor activo en este TS (con UI abierta y no denegado)
  if (!editorSheet.hidden && Number(lockTs||0) === ts && !editLocked) return true;

  // 3) Locks extendidos (save/delete) mientras impacta el upsert/delete remoto
  if (pendingSaveLocks.has(delKey(item, ts))) return true;
  if (pendingDeleteLocks.has(delKey(item, ts))) return true;

  // 4) Concesión explícita del backend (registrada al adquirir)
  if (getGrantedSet(item).has(ts)) return true;

  return false;
}

function holdDeleteLock(item, ts){
  if (!ts) return;
  // 1) bloqueo local + repintar
  setLock(item, ts, EDITOR_OWNER);
  renderList();

  // 2) lock en backend + heartbeat corto (TTL corto)
  const beat = () => postForm_({
    action:'lock',
    order : getCurrentOrder(),
    item,
    ts,
    owner : EDITOR_OWNER
  }).catch(()=>{});
  beat();
  const id = setInterval(beat, 15_000);
  pendingDeleteLocks.set(delKey(item, ts), id);
}

function resetSizeScroll(){
  try{
    if (!eSizesRow) return;
    if (eSizesRow.scrollTo) eSizesRow.scrollTo({ left: 0 });
    else eSizesRow.scrollLeft = 0;
  }catch(_){
    eSizesRow.scrollLeft = 0;
  }
}

// Reemplazá tu resetSizeScroll() por una versión "dura"
function resetSizeScrollHard(){
  try{
    if (!eSizesRow) return;
    const row = eSizesRow;
    const prevSB = row.style.scrollBehavior;
    const prevTr = row.style.transition;
    row.style.scrollBehavior = 'auto';
    row.style.transition = 'none';

    row.scrollLeft = 0;
    if (row.scrollTo) row.scrollTo({ left: 0 }); // instantáneo

    void row.offsetWidth;
    row.style.transition = prevTr || '';
    row.style.scrollBehavior = prevSB || '';
  }catch(_){}
}


// reset duro solo para la lista del sheet
function resetListScrollHard(){
  try{
    const sc = listEl || document.querySelector('.list');
    if(!sc) return;
    const set0 = () => {
      try{
        sc.scrollTop = 0; sc.scrollLeft = 0;
        if (sc.scrollTo) sc.scrollTo({ top: 0, left: 0 }); // sin smooth
      }catch(_){}
    };
    requestAnimationFrame(()=>{ set0(); requestAnimationFrame(set0); });
    setTimeout(set0, 0);
  }catch(_){}
}


function releaseDeleteLock(item, ts){
  if (!ts) return;
  const key = delKey(item, ts);

  const id = pendingDeleteLocks.get(key);
  if (id) clearInterval(id);
  pendingDeleteLocks.delete(key);

  // best-effort unlock (aunque ya no exista la fila)
  postForm_({
    action:'unlock',
    order : getCurrentOrder(),
    item,
    ts,
    owner : EDITOR_OWNER
  }).catch(()=>{});

  clearLock(item, ts);
  renderList();
  updateItemGridLockBadges();
}

// ===== Cola por item para serializar operaciones (evita pisarse en deletes rápidos) =====
const opQueueByItem = new Map(); // item -> Promise
function enqueueItemOp(item, taskFn){
  const prev = opQueueByItem.get(item) || Promise.resolve();
  const next = prev.then(
    () => taskFn(),
    () => taskFn() // incluso si la anterior falló, ejecuta esta
  );
  opQueueByItem.set(item, next);
  return next;
}


function rowFromServer(r){
  return {
    ts    : Number(r.TS || r.ts || 0),
    player: r.PLAYER|| r.player || '',
    size  : r.SIZE  || r.size   || '',
    number: r.NUMBER|| r.number || '',
    name  : r.NAME  || r.name   || '',
    units : Number(r.UNIT || r.units || 1) || 1,
    cid   : r.CID   || r.cid    || ''      // ← NUEVO
  };
}


function reconcileTempWithReal(rows, realRow){
  if (!realRow) return false;
  const rk = _key4(realRow);
  // 1) por CID (ideal: solo reconcilia la temporal de ESTE cliente)
  if (realRow.cid){
    const i = rows.findIndex(x => Number(x.ts)===0 && String(x.cid||'')===String(realRow.cid));
    if (i >= 0){ rows[i] = realRow; return true; }
  }
  // 2) por contenido (fallback)
  const j = rows.findIndex(x => Number(x.ts)===0 && _key4(x) === rk);
  if (j >= 0){ rows[j] = realRow; return true; }
  return false;
}

function dedupeRows(arr){
  const out=[], seenTs=new Set(), seenCid=new Set(), seenKey=new Set();
  for (const r of (arr||[])){
    const ts = Number(r?.ts)||0;
    const cid = String(r?.cid||'');
    const kk  = _key4(r);

    if (ts>0){
      if (seenTs.has(ts)) continue;
      seenTs.add(ts);
      seenKey.add(kk);
      if (cid) seenCid.add(cid);
      out.push(r);
    } else {
      // temp: descartá si ya existe el real equivalente
      if (cid && seenCid.has(cid)) continue;
      if (seenKey.has(kk)) continue;
      out.push(r);
    }
  }
  return out;
}


// ========== applyDelta (con rebase tras gaps, anti-parpadeo y fair-lock) ==========
function applyDelta(item, last){
  if (!last) return false;
  const rows = rowsByItem[item] || (rowsByItem[item] = []);

  // ---------- UPSERT ----------
  if (last.op === 'upsert' || last.op === 'add' || last.op === 'edit'){
    const r = rowFromServer(last.row || {});
    if (!r.ts) return false;

    const tsNum = Number(r.ts);
    const idx = rows.findIndex(x => Number(x.ts) === tsNum);
    if (idx >= 0){
      rows[idx] = r;
    } else {
      if (!reconcileTempWithReal(rows, r)){
        rows.push(r);
      }
    }

    const keySave = delKey(item, tsNum);
    if (pendingSaveLocks.has(keySave)) releaseSaveLock(item, tsNum);

    // limpiar/suprimir sólo si el lock es nuestro
    const ownerNow = getLocksMap(item)?.get(tsNum);
    if (ownerNow === EDITOR_OWNER){
      clearLock(item, tsNum);
      suppressLockFor(item, tsNum, storeGrace.suppress());
    } else {
      // mantener vivo lock remoto (evita parpadeo en otros clientes)
      try { getSeenMap(item)?.set(tsNum, Date.now()); } catch(_){}
    }

    const tsSet = tombstonesByItem[item];
    if (tsSet) tsSet.delete(tsNum);

    try { if (typeof markProgress === 'function') markProgress(item); } catch(_){}
    return true;
  }

  // ---------- DELETE ----------
  if (last.op === 'delete'){
    const ts = Number(last.row?.TS || last.row?.ts || 0);
    if (!ts) return false;

    clearLock(item, ts);
    suppressLockFor(item, ts, storeGrace.suppress());

    const i = rows.findIndex(x => Number(x.ts) === ts);
    if (i >= 0) rows.splice(i, 1);
    markTombstone(item, ts);

    const key = delKey(item, ts);
    if (pendingDeleteLocks.has(key)) releaseDeleteLock(item, ts);
    clearDeleting(item, ts);
    clearSeen(item, ts);

    // revalidación corta para evitar “fantasmas” si algún cliente se salteó el evento
    scheduleResync(item, 350);

    if (!editorSheet.hidden && Number(draft?.ts || 0) === ts){
      editGone = true;
      editLocked = false;
      updateEditorState();
      if (typeof showToast === 'function') showToast('⚠ Deleted on another device');
    }
    try { if (typeof markProgress === 'function') markProgress(item); } catch(_){}
    return true;
  }

  // ---------- LOCK / UNLOCK ----------
  if (last.op === 'lock' || last.op === 'unlock'){
    const ts    = Number(last.row?.TS || last.row?.ts || 0);
    const owner = String(last.row?.owner || '');
    if (!ts) return false;

    if (last.op === 'lock') {
      if (owner) {
        // fair-lock: si estoy adquiriendo este TS, ignoro locks ajenos entrantes
        if (owner !== EDITOR_OWNER && isAcquiring(item, ts)) return false;

        setLock(item, ts, owner);
        const mpDelay = delayedUnlockUntilByItem[item];
        mpDelay?.delete?.(Number(ts));
        try { getSeenMap(item)?.set(ts, Date.now()); } catch(_){}
        noteSeen(item, ts);
        if (owner !== EDITOR_OWNER) storeSawForeign();
      }
    } else {
      delayedClearLock(item, ts, currentUnlockGraceMs());
      clearSeen(item, ts);
    }

    const editingSame = !editorSheet.hidden && Number(draft?.ts || 0) === ts;
    if (editingSame){
      if (last.op === 'lock'){
        if (owner && owner !== EDITOR_OWNER){
          editLocked = true;
          lockMsg = 'This player is being edited on another device.';
          if (!editGone) updateEditorState();
          if (typeof showToast === 'function') showToast('⚠ Being edited elsewhere');
        }
      } else {
        if (!editGone){
          editLocked = false;
          updateEditorState();
        }
      }
    }

    if (item === currentItemText) renderList();
    updateItemGridLockBadges();
    try { if (typeof markProgress === 'function') markProgress(item); } catch(_){}
    return true;
  }

  return false;
}



function watchLoop(order, item){
  if (watchAbort) try{ watchAbort.abort(); }catch(_){}
  watchAbort = new AbortController();
  const { signal } = watchAbort;

  // Renombrado para evitar sombrear el helper lastProgress(item)
  let lastPollAt = Date.now();

  const run = async () => {
    while (!signal.aborted && item === currentItemText) {
      const prev = watchVer || 0;

      try{
        const url = `${BACKEND}?action=watch&order=${encodeURIComponent(order)}&item=${encodeURIComponent(item)}&since=${prev}&_cb=${CB()}`;
        // long-poll real: dejamos colgar hasta que haya novedad o venza el timeout
        const j = await getJSONwithTimeout(url, LONGPOLL_TIMEOUT_MS);

        if (signal.aborted || item !== currentItemText) break;

        if (j && j.ok && typeof j.ver === 'number' && j.ver > prev){
          let got = 0, changed = false;

          if (Array.isArray(j.events) && j.events.length){
            got = j.events.length;
            for (const ev of j.events) changed = applyDelta(item, ev) || changed;
          } else if (j.last) {
            got = 1;
            changed = applyDelta(item, j.last) || changed;
          }

          // gap → rebase fuerte
          if (got < (j.ver - prev)){
            await loadFromServer(order, item, /*force*/true).catch(()=>{});
            changed = true;
          }

          watchVer = j.ver;
          if (typeof setDataVer === 'function') setDataVer(order, watchVer);

          if (changed && item === currentItemText){
            try { lcWrite(order, item, rowsByItem[item], watchVer); } catch(_){}
            renderList();
          }

          lastPollAt = Date.now();
          markProgress(item);
        }

      } catch(_){
        if (signal.aborted) break;
        // caída de red: backoff corto
        await new Promise(r => setTimeout(r, 150));
      }

      // ⛑ watchdog de “no progreso”: si la pestaña está visible y no hubo eventos en HARD_RESYNC_MS → reload fuerte
      if (isVisible() && (Date.now() - lastPollAt) > HARD_RESYNC_MS){
        try {
          await loadFromServer(order, item, /*force*/true);
          if (item === currentItemText) renderList();
          lastPollAt = Date.now();
          markProgress(item);
        } catch(_) {}
      }
    }
  };

  run();

  // Stopper público
  stopWatch = () => {
    try{ watchAbort.abort(); }catch(_){}
    watchAbort = null;
  };
}

// === BACKGROUND DATA WATCHERS (event-driven, sin timers periódicos) ===
const watchVerByItem = Object.create(null);
function getItemVer(item){ return Number(watchVerByItem[item]||0); }
function setItemVer(item, v){ watchVerByItem[item] = Number(v)||0; }

const bgWatchers = new Map(); // item -> AbortController

function startBGWatch(order, item){
  stopBGWatch(item);
  const ctrl = new AbortController();
  const { signal } = ctrl;
  bgWatchers.set(item, ctrl);

  (async function loop(){
    let prev = getItemVer(item);
    while (!signal.aborted){
      try{
        const url = `${BACKEND}?action=watch&order=${encodeURIComponent(order)}&item=${encodeURIComponent(item)}&since=${prev}&_cb=${CB()}`;
        const j = await robustJSON(url);

        if (signal.aborted) break;

        if (j && j.ok && typeof j.ver === 'number' && j.ver > prev){
          let got = 0, changed = false;
          if (Array.isArray(j.events) && j.events.length){
            for (const ev of j.events){ changed = applyDelta(item, ev) || changed; got++; }
          } else if (j.last){
            changed = applyDelta(item, j.last) || changed; got = 1;
          }

          if (got < (j.ver - prev)) {
            await loadFromServer(order, item, /*force*/true).catch(()=>{});
            changed = true;
          }

          try { lcWrite(order, item, rowsByItem[item] || [], j.ver); } catch(_){}
          setItemVer(item, j.ver);
          prev = j.ver;
        }
      }catch(_){
        // red intermitente → pausa un poco más
        await sleep(BG_POLL_MS + 400);
      }

      // 🔧 PAUSA entre iteraciones para no “spamear”
      const jitter = Math.floor(Math.random() * 300);
      await sleep(BG_POLL_MS + jitter);
    }
  })();
}



function stopBGWatch(item){
  const ctrl = bgWatchers.get(item);
  if (!ctrl) return;
  try{ ctrl.abort(); }catch(_){}
  bgWatchers.delete(item);
}

function stopAllBGWatches(){
  for (const k of Array.from(bgWatchers.keys())) stopBGWatch(k);
}

// Inicia watchers para TODOS los ítems de la orden (excepto el que esté abierto)
function startBackgroundWatchers(order, items){
  stopAllBGWatches();
  const others = items.filter(it => it !== currentItemText);
  // Solo vigila los primeros N; el resto se refresca cuando se abren
  const slice = others.slice(0, MAX_BG_WATCHED_ITEMS);
  for (const it of slice) startBGWatch(order, it);
}



// ==================== LISTA ============================
function getRowsForCurrent(){
  if(!rowsByItem[currentItemText]) rowsByItem[currentItemText] = [];
  return rowsByItem[currentItemText];
}

function renderList(){
  if (!listEl) return;

  const norm = v => String(v||'').trim();
  const MY   = norm(EDITOR_OWNER);

  // <<< NUEVO: saber si el item abierto está en solo-lectura
  const itemIsRO = typeof isReadOnlyItem === 'function' ? isReadOnlyItem(currentItemText) : false;

  const totalDiv = document.querySelector('#summary > div:first-child') || null;

  let rows = Array.isArray(getRowsForCurrent()) ? getRowsForCurrent() : [];

  const tsSet = tombstonesByItem[currentItemText];
  if (tsSet && tsSet.size){
    rows = rows.filter(r => !tsSet.has(Number(r?.ts || 0)));
  }

  const delSet = deletingTsByItem[currentItemText];
  if (delSet && delSet.size){
    rows = rows.filter(r => !delSet.has(Number(r?.ts || 0)));
  }

  let totalUnits = 0;
  for (const r of rows) totalUnits += Number(r?.units) || 1;
  if (totalDiv) {
    totalDiv.innerHTML = `<b>Total players:</b> ${rows.length} — <b>Total units:</b> ${totalUnits}`;
  }

  if (!rows.length){
    if (sumSizes) sumSizes.textContent = 'Sizes: —';
    listEl.innerHTML = `<div class="row">No players yet.</div>`;
    return;
  }

  const freq = {};
  for (const r of rows) {
    const key = r && r.size ? String(r.size) : '—';
    const u   = Number(r?.units) || 1;
    freq[key] = (freq[key] || 0) + u;
  }
  const parts = Object.keys(freq).sort().map(k => `${k}(${freq[k]})`);
  if (sumSizes) sumSizes.textContent = `Sizes: ${parts.join(' ')}`;

  const countByKey = {};
  for (const r of rows) {
    const k = [
      String(r?.player||'').toLowerCase().trim(),
      String(r?.size||'').trim(),
      String(r?.number||'').trim(),
      String(r?.name||'').toLowerCase().trim()
    ].join('|');
    countByKey[k] = (countByKey[k] || 0) + 1;
  }

  const html = rows.map((r, idx) => {
    const units = Number(r?.units) || 1;

    const k = [
      String(r?.player||'').toLowerCase().trim(),
      String(r?.size||'').trim(),
      String(r?.number||'').trim(),
      String(r?.name||'').toLowerCase().trim()
    ].join('|');

    const dup  = (countByKey[k] > 1) ? ' row--dup' : '';
    const left = r?.player ? String(r.player) : '(No name)';

    const metaParts = [];
    if (r?.size)   metaParts.push(String(r.size));
    if (r?.number) metaParts.push('#' + String(r.number));
    if (r?.name && r.name !== '-') metaParts.push(String(r.name));
    const meta = metaParts.join(' | ');

    const tsNum = Number(r?.ts) || 0;
    const elseLocked = tsNum > 0 && isForeignLiveLock(currentItemText, tsNum);
    const ownerNow   = norm(getLocksMap(currentItemText).get(tsNum));
    const ownLocked  = tsNum > 0 && ownerNow === MY;
    const unlocking  = tsNum > 0 && isUnlockDelayed(currentItemText, tsNum);

    const showLock   = elseLocked;
    const lockCls    = (elseLocked ? ' row--locked' : '');
    const lockAriaLabel = elseLocked ? 'Locked elsewhere' : (ownLocked ? 'Editing here' : 'Releasing…');
    const lockBadge  = showLock ? `<span class="lock" aria-label="${lockAriaLabel}">🔒</span>` : '';
    const disabledAttr  = elseLocked ? 'aria-disabled="true"' : '';

    return `
      <div class="row${dup}${lockCls}" role="listitem" data-idx="${idx}" data-ts="${tsNum}" ${disabledAttr}
           data-locked="${elseLocked ? 'else' : (ownLocked ? 'own' : (unlocking ? 'unlocking' : 'no'))}"
           data-ro="${itemIsRO ? '1' : '0'}">
        <div class="row__left">${left} ${lockBadge}</div>
        <div class="row__meta">${meta} <span class="badge">x${units}</span></div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = html;
}

// ===== Lista: abrir editor con tap y bloquear si está en uso =====
if (listEl) {
  listEl.addEventListener('pointerup', (e) => {
    const row = e.target.closest('[data-idx]');
    if (!row) return;

    const idx = Number(row.dataset.idx);
    const r = getRowsForCurrent()[idx];
    if (!r) return;

    // Si sigue abriendo el sheet, encola el primer tap y listo
    if (openingSheet) {
      queueRowClick(idx);
      showToast('Opening…');
      return;
    }

    const tsNum = Number(r.ts) || 0;
    if (tsNum > 0 && isForeignLiveLock(currentItemText, tsNum)) {
      showToast('🔒 In use on another device');
      setTimeout(() => {
        if (!isLockedElsewhere(currentItemText, tsNum)) openEditor(r, idx);
      }, 500);
      return;
    }

    openEditor(r, idx);
  }, { passive:false });

  // Evita “click” retrasado en móviles
  listEl.addEventListener('click', (e)=> e.preventDefault(), { passive:false });
}

// --- Safety: default no-op, overwritten by watchLoop() cuando arranca ---
let stopWatch = () => {};

// ================== Semilla inicial de candados (snapshot) ==================
async function primeLocksForItem(order, item){
  try{
    const url = `${BACKEND}?action=locks&order=${encodeURIComponent(order)}&item=${encodeURIComponent(item)}&since=0&_cb=${CB()}`;
    const j = await robustJSON(url);
    if (!j || !j.ok) return;

    const mp  = getLocksMap(item);   // Map(ts -> owner)
    const sm  = getSeenMap(item);    // Map(ts -> lastSeenMs)
    const now = Date.now();

    const norm = v => String(v||'').trim();
    const MY   = norm(EDITOR_OWNER);

    // (1) preservar mis locks locales
    const mine = new Map();
    for (const [ts, owner] of mp.entries()){
      if (norm(owner) === MY) mine.set(Number(ts), MY);
    }
    mp.clear();
    for (const [ts, owner] of mine.entries()){
      mp.set(ts, owner);
      sm.set(ts, now);
      noteSeen(item, ts, now, /*countable*/ false);
    }

    // (2) snapshot (sin pisar adquisición justa)
    window.__IN_LOCK_SNAPSHOT__ = true;
    if (Array.isArray(j.rows)){
      for (const r of j.rows){
        const ts    = Number(r.ts || r.TS || 0);
        const owner = norm(r.owner);
        if (!ts || !owner) continue;
        if (isLockSuppressed(item, ts)) continue;
        if (owner !== MY && isAcquiring(item, ts)) continue; // fair-lock: no pises intento local

        mp.set(ts, owner);
        sm.set(ts, now);
        noteSeen(item, ts, now, /*countable*/ false);
        if (owner !== MY) storeSawForeign();
      }
    }
    if (typeof j.ver === 'number') setLocksVer(item, j.ver);
    window.__IN_LOCK_SNAPSHOT__ = false;

    if (item === currentItemText) renderList();
    updateItemGridLockBadges();
  }catch(_){
    window.__IN_LOCK_SNAPSHOT__ = false;
  }
}


// —— OPEN SHEET (sin "Loading…", render inmediato + pre-hidratación de locks) ——
async function openSheet(title){
  if (openingSheet) return;

  // 🧭 token anti-carreras (solo la última apertura puede pintar)
  openSheet._rid = (openSheet._rid || 0) + 1;
  const myRid = openSheet._rid;

  const item = canonItem(title);                 // clave oficial backend
  const isNewItem = (item !== __lastOpenedItem); // reset scroll solo si cambia

  openingSheet = true;
  try {
    currentItemText = item;
    sheetTitle.textContent = item;

    if (isNewItem) resetListScrollHard();

    listVisibleSinceByItem[item] = Date.now();
    hydrationUntil = Date.now() + 900;

    sheet.hidden = false;
    requestAnimationFrame(()=> sheet.classList.add('show'));
    showOverlay();

    if (!STORE_ON && STORE_FORCE !== '1' && STORE_FORCE !== 'on') {
      STORE_ON = true;
      setTimeout(() => {
        if (Date.now() - (listVisibleSinceByItem[item]||0) > 1800) STORE_ON = false;
      }, 2000);
    }

    const order  = getCurrentOrder();
    const hit    = lcRead(order, item);
    const peek   = lcPeek(order, item);
    const memVer = Number(getItemVer(item) || 0);
    watchVer     = Math.max(Number(hit?.ver || 0), memVer);
    setSummaryPlaceholders();

    const memRows = rowsByItem[item];
    if (hit && Array.isArray(hit.rows)
        && (Number(hit.ver||0) >= memVer || !Array.isArray(memRows) || memRows.length === 0)) {
      rowsByItem[item] = hit.rows.slice();
    } else if (Array.isArray(memRows) && memRows.length) {
      // mantener lo más fresco ya en memoria
    } else if (peek && Array.isArray(peek.rows)) {
      rowsByItem[item] = peek.rows.slice();
    } else {
      rowsByItem[item] = [];
    }

    // ⚠️ abortar si llegó una apertura más nueva
    if (myRid !== openSheet._rid) return;

    if (item === currentItemText) {
      if (!rowsByItem[item].length && listEl) listEl.innerHTML = '';
      renderList();
      if (isNewItem) resetListScrollHard();
    }

    try { stopBGWatch(item); } catch(_){}

    // 🔒 pre-hidratar locks con espera corta (race contra sleep)
    const primeP = primeLocksForItem(order, item).catch(()=>{});
    const waitMs = FIRST_LOCK_HYDRATION ? 260 : 80;
    await Promise.race([ primeP, sleep(waitMs) ]);
    FIRST_LOCK_HYDRATION = false;

    // ⚠️ abortar si llegó una apertura más nueva
    if (myRid !== openSheet._rid) return;

    if (item === currentItemText) {
      renderList();
      if (isNewItem) resetListScrollHard();
    }

    // ⚡ carga desde servidor (force=true para snapshot inicial confiable)
    loadFromServer(order, item, /*force*/true)
      .then(()=>{ if (item === currentItemText && myRid === openSheet._rid) renderList(); })
      .catch(()=>{});

    // 👀 watchers del item activo
    stopWatch();
    startLocksWatcherForItem(order, item, LOCKS_WATCH_INTERVAL_MS);
    watchLoop(order, item);

    // 🌡️ warmer global de locks (sin pisar el activo)
    try { if (window.cancelWarm) window.cancelWarm(); } catch(_){}
    const all = (window.__ITEMS || []);
    window.cancelWarm = startGlobalLocksWarmer(order, all.filter(x => x !== item), 3000);

  } finally {
    __lastOpenedItem = item;
    openingSheet = false;
    flushQueuedRowClick();
  }
}


// =========== Cerrar sheet y apagar watchers/overlays limpio ===========
function closeSheet(){
  // si el editor está abierto, cerrarlo como Cancel (con prompt)
  if (!editorSheet.hidden) {
    const ok = closeEditor(false);   // ← NO forzar
    if (ok === false) return;        // usuario canceló
  }

  try { typeof stopWatch === 'function' && stopWatch(); } catch(_){}
  try { stopLocksWatcher(); } catch(_){}
  try { stopSoftReconcile(); } catch(_){}

  try { if (window.cancelWarm) { window.cancelWarm(); window.cancelWarm = null; } } catch(_){}

  sheet.classList.remove('show');
  setTimeout(()=>{
    sheet.hidden = true;
    hideOverlay();
    restoreGridScroll();
    clearKeyboardGhost();
  }, 160);
}

bindFastAction(sheetBack, closeSheet);
overlay.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  if (!editorSheet.hidden) {
    const ok = closeEditor(false);
    if (ok === false) return;
    return;
  }

  if (!sheet.hidden) closeSheet();
});

// ==================== OPEN EDITOR (con fair-lock) ====================
function openEditor(prefill = null, index = -1) {
  if (busy) return;

  // ==== RO guard ====
  const kind = (prefill && Number(prefill.ts) > 0) ? 'edit' : 'add';
  if (guardReadOnly(kind, currentItemText)) return;

  // Asegura variable global para el heartbeat (por si no existe)
  if (typeof lockHeartbeat === 'undefined') window.lockHeartbeat = null;
  cancelPendingLockRequest();

  // Apaga cualquier heartbeat colgado
  if (lockHeartbeat) { clearInterval(lockHeartbeat); lockHeartbeat = null; }

  // --- Handoff si ya tenías un lock previo y vas a otro TS ---
  const prevTs = Number(lockTs) || 0;
  const nextTs = Number(prefill?.ts) || 0;
  if (prevTs > 0 && prevTs !== nextTs) {
    // 1) limpiar visual local con gracia corta para no parpadear (solo si era tuyo)
    localUnlockIfMine(currentItemText, prevTs, storeGrace.handoff());
    // 2) avisar al backend (dos intentos por las dudas)
    const payload = {
      action:'unlock',
      order : getCurrentOrder(),
      item  : currentItemText,
      ts    : prevTs,
      owner : EDITOR_OWNER
    };
    postForm_(payload).catch(()=>{});
    setTimeout(()=> postForm_(payload).catch(()=>{}), 200);
    // Cleanup acquiring si lo hubiera
    clearAcquiring(currentItemText, prevTs);
  }

  // ------- Preparar draft / estado inicial -------
  if (prefill) {
    draft = {
      ts    : Number(prefill.ts) || 0,
      player: prefill.player || '',
      size  : prefill.size   || '',
      number: prefill.number || '',
      name  : prefill.name   || '',
      units : Number(prefill.units) || 1
    };
    eDelete.hidden = false;
    currentEditIndex = index;
  } else {
    draft = { ts:0, player:'', size:'', number:'', name:'', units:1 };
    eDelete.hidden = true;
    currentEditIndex = -1;
  }

  // [CAT] — Modo del editor y selección inicial de size
  editorMode   = (draft.ts > 0) ? 'edit' : 'add';
  selectedSize = draft.size || '';

  // ⛔️ Flicker guard
  try {
    if (elSizeField) elSizeField.hidden = (editorMode === 'add');
    if (eSizesRow) {
      eSizesRow.style.visibility = 'hidden';
      eSizesRow.innerHTML = '';
      resetSizeScrollHard();
    }
  } catch (_){}

  // ===== Flags visuales =====
  editGone   = false;
  editLocked = false;
  lockMsg    = 'This player is being edited on another device.';

  // ===== Snapshot =====
  fillEditor();

  // [CAT] — Pintar Category/Size según ADD/EDIT
  try {
    if (editorMode === 'edit') {
      const cat = deriveCategoryFromSize(selectedSize);
      ensureCategoryOption(cat);
      if (elCategory) elCategory.value = cat || '';
      if (elSizeField) elSizeField.hidden = false;
      if (elSizes) renderSizeChipsForCategory(elCategory.value || '', selectedSize);
    } else {
      if (elCategory) elCategory.value = '';
      selectedSize = '';
      if (elSizes) elSizes.innerHTML = '';
      if (elSizeField) elSizeField.hidden = true;
    }
  } catch(_){}

  // snapshot/dirtiness
  originalSnapshot = snapshotFromEditor();
  dirty = false;

  // === reseteo vertical inmediato
  resetEditorScrollHard();

  // ===== Mostrar UI =====
  editorSheet.hidden = false;
  requestAnimationFrame(() => {
    editorSheet.classList.add('show');
    try { if (eSizesRow) eSizesRow.style.visibility = ''; } catch(_){}

    try {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      editorSheet.setAttribute('tabindex', '-1');
      editorSheet.focus({ preventScroll: true });
      setTimeout(() => editorSheet.removeAttribute('tabindex'), 200);
    } catch (_) {}

    const onEnd = (ev) => {
      if (ev && ev.target !== editorSheet) return;
      resetEditorScrollHard();
      if (selectedSize) {
        centerSelectedSizeChip(false);
      } else {
        resetSizeScrollHard();
      }
      editorSheet.removeEventListener('transitionend', onEnd);
    };
    editorSheet.addEventListener('transitionend', onEnd);
  });

  showOverlay2();
  measureFooter();
  updateEditorState();
  renderList();

  // Guard de no-overscroll
  setupEditorScrollGuard();

  // ===== Lock en background (solo edición real) =====
  const norm = v => String(v||'').trim();
  const MY   = norm(EDITOR_OWNER);

  lockTs = Number(draft.ts) || 0;

  if (lockTs > 0) {
    // Fair-lock
    markAcquiring(currentItemText, lockTs);
    setLock(currentItemText, lockTs, MY);
    try { getSeenMap(currentItemText).set(Number(lockTs), Date.now()); } catch(_){}
    renderList();

    const myEpoch = ++lockRequestEpoch;
    lockRequestTimer = setTimeout(() => {
      lockRequestTimer = null;
      if (myEpoch !== lockRequestEpoch || editorSheet.hidden) return;

      postForm_({
        action: 'lock',
        order : getCurrentOrder(),
        item  : currentItemText,
        ts    : lockTs,
        owner : MY
      }).then(j => {
        if (myEpoch !== lockRequestEpoch || editorSheet.hidden) return;

        const ownerResp = j && j.owner ? norm(j.owner) : '';

        if (!j || !j.ok) {
          clearAcquiring(currentItemText, lockTs);
          editLocked = true;
          lockMsg = 'Network/Server issue acquiring lock.';
          updateEditorState(); renderList();
          if (typeof showToast === 'function') showToast('⚠ Unable to acquire lock');
          if (lockHeartbeat) { clearInterval(lockHeartbeat); lockHeartbeat = null; }
          return;
        }

        if (ownerResp !== MY) {
          clearAcquiring(currentItemText, lockTs);
          if (ownerResp) {
            setLock(currentItemText, lockTs, ownerResp);
            getSeenMap(currentItemText).set(Number(lockTs), Date.now());
            storeSawForeign();
          }
          editLocked = true;
          lockMsg = 'This player is being edited on another device.';
          if (typeof showEditLockedBanner === 'function') showEditLockedBanner(lockMsg);
          else updateEditorState();
          renderList();
          if (typeof showToast === 'function') showToast('🔒 In use on another device');
          if (lockHeartbeat) { clearInterval(lockHeartbeat); lockHeartbeat = null; }
          return;
        }

        // ✅ Concedido
        clearAcquiring(currentItemText, lockTs);
        setLock(currentItemText, lockTs, MY);
        getSeenMap(currentItemText).set(Number(lockTs), Date.now());
        editLocked = false;
        updateEditorState(); renderList();

        // Pulso inmediato
        postForm_({
          action: 'lock',
          order : getCurrentOrder(),
          item  : currentItemText,
          ts    : lockTs,
          owner : MY
        }).catch(()=>{});

        if (lockHeartbeat) { clearInterval(lockHeartbeat); lockHeartbeat = null; }
        lockHeartbeat = setInterval(() => {
          postForm_({
            action: 'lock',
            order : getCurrentOrder(),
            item  : currentItemText,
            ts    : lockTs,
            owner : MY
          }).then(()=> {
            getSeenMap(currentItemText).set(Number(lockTs), Date.now());
          }).catch(()=>{});
        }, HEARTBEAT_MS);
      }).catch(() => {
        clearAcquiring(currentItemText, lockTs);
        editLocked = true;
        lockMsg = 'Network error acquiring lock.';
        updateEditorState(); renderList();
        if (typeof showToast === 'function') showToast('⚠ Network error while locking');
      });
    }, LOCK_REQUEST_DELAY_MS);
  } else {
    if (lockHeartbeat) { clearInterval(lockHeartbeat); lockHeartbeat = null; }
  }
}


function closeEditor(force = false) {
  try { if (typeof cancelPendingLockRequest === 'function') cancelPendingLockRequest(); } catch(_) {}

  if (!force && dirty && !editGone && !editLocked) {
    const ok = confirm('You have unsaved changes. Leave without saving?');
    if (!ok) return false;
  }

  if (typeof lockHeartbeat !== 'undefined' && lockHeartbeat) {
    clearInterval(lockHeartbeat);
    lockHeartbeat = null;
  }

  if (lockTs > 0) {
    const tsToFree = Number(lockTs);

    // 1) Evaluar propiedad ANTES de tocar estados locales
    const curOwner  = getLocksMap(currentItemText)?.get(tsToFree);
    const ownedNow  = (curOwner === EDITOR_OWNER)
                   || (Number(lockTs) === tsToFree)
                   || (getGrantedSet(currentItemText)?.has?.(tsToFree) === true);

    // 2) Unlock visual inmediato con gracia corta (Cancel ≠ handoff)
    localUnlockIfMine(currentItemText, tsToFree, /*grace*/120);
    try { clearAcquiring(currentItemText, tsToFree); } catch(_){}
    try { clearSeen(currentItemText, tsToFree); } catch(_){}

    // 3) Notificar UNLOCK al backend SIEMPRE (el backend valida si sos owner)
    const payload = {
      action:'unlock',
      order : getCurrentOrder(),
      item  : currentItemText,
      ts    : tsToFree,
      owner : EDITOR_OWNER
    };
    const tryUnlock = () => postForm_(payload).catch(()=>{});
    tryUnlock();                  // inmediato
    setTimeout(tryUnlock, 250);   // 0.25s
    setTimeout(tryUnlock, 750);   // 0.75s

    // Beacon como respaldo (salida de vista, cierre app, etc.)
    beaconUnlock(getCurrentOrder(), currentItemText, tsToFree);

    // 4) Recién ahora “olvidá” el lock del editor
    lockTs = 0;
  }

  // quitar el guard de overscroll del editor
  teardownEditorScrollGuard();

  blurAllInputsAndScrollTop();
  hideEditGoneBanner();
  hideEditLockedBanner();

  editorSheet.classList.remove('show');
  setTimeout(() => {
    editorSheet.hidden = true;
    hideOverlay2();

    clearKeyboardGhost();
    measureFooter();
  }, 180);

  return true;
}

window.addEventListener('pagehide', () => {
  // 1) unlock del lock del editor (intentá siempre; el server valida ownership)
  if (lockTs > 0) {
    const ts = Number(lockTs);
    const payload = {
      action:'unlock',
      order : getCurrentOrder(),
      item  : currentItemText,
      ts    : String(ts),
      owner : EDITOR_OWNER,
      _cb   : CB()
    };
    try {
      fetch(BACKEND, {
        method: 'POST',
        headers: { 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams(payload).toString(),
        keepalive: true
      });
    } catch(_){}
    // respaldo: beacon
    beaconUnlock(getCurrentOrder(), currentItemText, ts);
  }

  // 2) liberar locks extendidos de delete (si quedaron)
  try {
    for (const [key, id] of pendingDeleteLocks.entries()) {
      clearInterval(id);
      pendingDeleteLocks.delete(key);

      const [it, tsStr] = String(key).split('::');
      if (!it || !tsStr) continue;

      const payload = {
        action:'unlock',
        order : getCurrentOrder(),
        item  : it,
        ts    : tsStr,
        owner : EDITOR_OWNER,
        _cb   : CB()
      };
      try {
        fetch(BACKEND, {
          method:'POST',
          headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams(payload).toString(),
          keepalive: true
        });
      } catch(_){}
      // respaldo: beacon
      beaconUnlock(getCurrentOrder(), it, Number(tsStr));
    }
  } catch(_){}
});


// Flag para saber si veníamos de hidden
let wasHidden = false;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    try {
      try { if (typeof cancelPendingLockRequest === 'function') cancelPendingLockRequest(); } catch(_){}
      try { stopLocksWatcher(); } catch(_){}
      try { typeof stopWatch === 'function' && stopWatch(); } catch(_){}
      wasHidden = true;

      // Intentá liberar editor lock si existe (server valida ownership)
      if (lockTs > 0) {
        const ts = Number(lockTs);
        const payload = {
          action:'unlock',
          order : getCurrentOrder(),
          item  : currentItemText,
          ts    : String(ts),
          owner : EDITOR_OWNER,
          _cb   : CB()
        };
        try {
          fetch(BACKEND, {
            method:'POST',
            headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
            body: new URLSearchParams(payload).toString(),
            keepalive: true
          });
        } catch(_){}
        // respaldo: beacon
        beaconUnlock(getCurrentOrder(), currentItemText, ts);
      }

      // Liberar locks extendidos de delete (si quedaron)
      for (const [key, id] of pendingDeleteLocks.entries()) {
        clearInterval(id);
        pendingDeleteLocks.delete(key);
        const [it, tsStr] = String(key).split('::');
        if (!it || !tsStr) continue;

        const payload = {
          action:'unlock',
          order : getCurrentOrder(),
          item  : it,
          ts    : tsStr,
          owner : EDITOR_OWNER,
          _cb   : CB()
        };
        try {
          fetch(BACKEND, {
            method:'POST',
            headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
            body: new URLSearchParams(payload).toString(),
            keepalive: true
          });
        } catch(_){}
        // respaldo: beacon
        beaconUnlock(getCurrentOrder(), it, Number(tsStr));
      }
    } catch(_){}
  } else {
    try {
      if (wasHidden && currentItemText) {
        const order = getCurrentOrder();
        hydrationUntil = Date.now() + 900;

        primeLocksForItem(order, currentItemText)
          .then(() => { if (currentItemText) renderList(); })
          .catch(() => {});

        try { watchLoop(order, currentItemText); } catch(_){}
        try { startLocksWatcherForItem(order, currentItemText, 350); } catch(_){}

        // Reenciende watchers de fondo para todos los ítems
        try { startBackgroundWatchers(order, window.__ITEMS || []); } catch(_){}

        wasHidden = false;
      }
    } catch(_){}
  }
});

for (const node of [ePlayer, eNumber, eName, eUnits]) {
  if (!node) continue;
  ['input','change'].forEach(ev => node.addEventListener(ev, recomputeDirty));
}

function fillEditor(){
  if (!ePlayer || !eNumber || !eName || !eUnits) return;

  ePlayer.value = draft.player || '';
  eNumber.value = draft.number || '';
  eName.value   = draft.name   || '';
  eUnits.value  = draft.units  || 1;

  // ⛔️ NO pintar chips aquí; las pintamos por categoría en openEditor()
  // paintSizeChips(sizeOptions || []);  // ← QUITADO

  // Que el carrusel se resetee; el centrado lo hacemos luego de renderizar por categoría
  if (selectedSize) {
    // lo centraremos luego de render de categoría
  } else {
    resetSizeScrollHard();
  }
}


function paintSizeChips(sizes){
  eSizesRow.innerHTML='';
  (sizes || []).forEach(s=>{
    const chip = el('button','chip',s);
    chip.type = 'button';
    chip.setAttribute('role','radio');
    chip.setAttribute('tabindex','-1');
    chip.setAttribute('aria-label', `Size ${s}`);
    

    const on = (selectedSize === s);
    chip.setAttribute('aria-checked', String(on)); // (lo tenés)
    chip.setAttribute('aria-pressed', String(on)); // opcional, mejora compatibilidad con lectores
    chip.classList.toggle('active', on);

    chip.addEventListener('pointerdown', ev => { ev.preventDefault(); }, {passive:false});
    chip.addEventListener('pointerup', ev => {
      ev.preventDefault();
      if (busy) return;

      // Solo ensuciar si la talla realmente cambió
      if (s !== selectedSize){
        selectedSize = s;
        [...eSizesRow.children].forEach(c=>{
          const active = (c === chip);
          c.classList.toggle('active', active);
          c.setAttribute('aria-pressed', String(active));
        });
        recomputeDirty();
        centerSelectedSizeChip(true);
      }
      setTimeout(()=> chip.blur(), 0);
    }, {passive:false});

    eSizesRow.appendChild(chip);
  });
}

// --- Centrado de la talla seleccionada en el carrusel de chips ---
function centerChipInRow(chip, smooth = false){
  try{
    if (!chip || !eSizesRow) return;
    const row = eSizesRow;

    // Centro = dejar el chip en el medio del ancho visible
    const targetLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;

    // Limitar para no pasarse
    const maxScroll  = Math.max(0, row.scrollWidth - row.clientWidth);
    const clamped    = Math.max(0, Math.min(targetLeft, maxScroll));

    if (smooth && 'scrollTo' in row) {
      row.scrollTo({ left: clamped, behavior: 'smooth' });
    } else {
      row.scrollLeft = clamped; // sin animación (más compatible que behavior:'instant')
    }
  }catch(_){}
}

function centerSelectedSizeChip(smooth = false){
  try{
    if (!eSizesRow || !selectedSize) return;
    const chips = Array.from(eSizesRow.children || []);
    const chip = chips.find(c => (c.textContent || '').trim() === String(selectedSize).trim());
    if (!chip) return;

    // Espera un frame para asegurar layout antes de centrar
    requestAnimationFrame(()=> centerChipInRow(chip, smooth));
  }catch(_){}
}

function centerSelectedSizeChipNow(){
  try{
    if (!eSizesRow || !selectedSize) return;
    const row = eSizesRow;
    const chips = Array.from(row.children || []);
    const chip = chips.find(c => (c.textContent||'').trim() === String(selectedSize).trim());
    if (!chip) return;

    // Desactivar cualquier “smooth” temporalmente
    const prevSB = row.style.scrollBehavior;
    const prevTr = row.style.transition;
    row.style.scrollBehavior = 'auto';
    row.style.transition = 'none';

    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    const target = chip.offsetLeft - (row.clientWidth - chip.offsetWidth)/2;
    row.scrollLeft = Math.max(0, Math.min(target, max));

    // Forzar layout y restaurar estilos
    void row.offsetWidth;
    row.style.transition = prevTr || '';
    row.style.scrollBehavior = prevSB || '';
  }catch(_){}
}

// Units stepper
function onCancel(){ if (busy) return; closeEditor(false); }
bindFastAction(qMinus,onMinus);
bindFastAction(qPlus,onPlus);
bindFastAction(eCancel,onCancel);

// --- Solo dígitos en Number y Units + clamp de 1 a 100 en Units ---
[eNumber, eUnits].forEach(inp=>{
  if (!inp) return;
  inp.addEventListener('input', ()=>{
    const v = (inp.value || '').replace(/\D+/g, ''); // deja solo 0-9
    if (inp.value !== v) inp.value = v;
  });
});

// Asegura rango válido para Units al salir del campo
eUnits?.addEventListener('blur', ()=>{
  let v = parseInt(eUnits.value || '1', 10);
  if (!Number.isFinite(v)) v = 1;
  v = Math.max(1, Math.min(100, v));
  if (String(v) !== eUnits.value) eUnits.value = String(v);
  recomputeDirty();
});

// === REEMPLAZA tu getCurrentOrder() por esta versión ===
function getCurrentOrder(){
  // 1) ?order= tiene prioridad (respeta alfanuméricas tipo A1233-4)
  const o = qs('order');
  const ord = sanitizeOrder(o);
  if (ord) return ord;

  // 2) ?q= (modo legado). Primero intento todo el token limpio;
  //    si no hay, extraigo prefijo numérico (ej. "12345 - Cliente").
  const q = qs('q') || '';
  const s = sanitizeOrder(q);
  if (s) return s;

  const m = String(q).match(/(\d{3,})/);
  if (m) return m[1];

  // 3) #ORDEN
  const fromHash = getOrderFromHash();
  if (fromHash) return fromHash;

  // 4) /o/ORDEN o /ORDEN
  const fromPath = getOrderFromPath();
  if (fromPath) return fromPath;

  return '';
}

function postForm_(obj){
  const p = new URLSearchParams();
  for (const k in obj) if (obj[k] != null) p.append(k, obj[k]);
  p.append('_cb', CB());
  const t = withTimeout(null);
  return fetch(BACKEND, {
    method:'POST',
    cache:'no-store',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
    body: p.toString()
  }).then(res => safeJson(res));  // ← usar safeJson
}

// ========== fastForwardAfterSave (prioriza ver por item si existe) ==========
async function fastForwardAfterSave(item, ts, order) {
  if (!ts) return;
  const key = delKey(item, ts);
  const deadline = Date.now() + 2500; // hasta ~2.5s

  // Usa ver por item si está disponible (BG watcher); si no, fallback a watchVer/global
  let localSince = (typeof getItemVer === 'function' ? (getItemVer(item) || 0) : 0) || watchVer || 0;

  while (pendingSaveLocks.has(key) && Date.now() < deadline) {
    try {
      const url = `${BACKEND}?action=watch&order=${encodeURIComponent(order)}&item=${encodeURIComponent(item)}&since=${localSince}&_cb=${CB()}`;
      const res = await fetch(url, { cache:'no-store' });
      const j   = await safeJson(res);
      if (j && j.ok && j.ver && j.ver > localSince) {
        localSince = j.ver;

        // Aplica eventos para disparar releaseSaveLock en cuanto llegue el upsert
        if (Array.isArray(j.events) && j.events.length) {
          for (const ev of j.events) applyDelta(item, ev);
        } else {
          applyDelta(item, j.last || null);
        }

        if (item === currentItemText) {
          try { lcWrite(order, item, rowsByItem[item], localSince); } catch(_){}
          renderList();
        }

        try { if (typeof markProgress === 'function') markProgress(item); } catch(_){}

        // Si ya se liberó el save-lock, salimos
        if (!pendingSaveLocks.has(key)) break;
      }
    } catch(_) {}
    // micro pausa para no saturar CPU
    await new Promise(r => setTimeout(r, 30));
  }

  // Failsafe: si al final todavía no vimos el upsert, dispará un resync corto
  try { scheduleResync(item, 250); } catch(_){}
}

// ========== saveToServer (async/await, misma lógica) ==========
async function saveToServer(row){
  const order  = getCurrentOrder();
  const isEdit = Number(row.ts) > 0;

  // Clave canónica para reconciliar temporales aun si el backend normaliza
  const canonKey = (r) => {
    const norm = (s) => String(s||'').toLowerCase().trim();
    const z    = (s) => (String(s||'').trim()==='-' ? '' : String(s||'').trim());
    return [
      norm(r.player),
      String(r.size||'').trim().toUpperCase(),
      String(r.number||'').trim(),
      norm(z(r.name)),
      String(Number(r.units||1))
    ].join('|');
  };

  // Clave para reconciliar la fila temporal (ts=0) luego del ADD
  const tempMatchKey = {
    player: row.player,
    size  : row.size,
    number: row.number,
    name  : row.name,
    units : row.units
  };
  const tempKeyStr = canonKey(tempMatchKey);

  // Opcional: id de operación local para futuras correlaciones (inofensivo si el server lo ignora)
  const cid = `${EDITOR_OWNER}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,7)}`;

  const payload = {
    action: isEdit ? 'edit' : 'add',
    order,
    item  : currentItemText,
    ts    : isEdit ? Number(row.ts) : 0, // 0 => server genera ts
    player: row.player,
    size  : row.size,
    number: row.number,
    name  : row.name,
    unit  : row.units,
    cid
  };

  try {
    const j = await enqueueItemOp(currentItemText, () => postForm_(payload));

    if (j && j.ok) {
      showToast('✔ Saved');

      if (isEdit) { fastForwardAfterSave(currentItemText, Number(row.ts), order).catch(()=>{}); }

      // Si fue ADD y el server devolvió ts real → reconciliar sin duplicar
      if (!isEdit && j.ts) {
        const rows = getRowsForCurrent();
        const newTs = Number(j.ts);

        // 1) Intento principal: encontrar temporal por clave canónica y reemplazar ts
        let i = rows.findIndex(x => Number(x.ts) === 0 && canonKey(x) === tempKeyStr);

        // 1.b) Fallback permisivo: si no lo encuentro, tomar el ÚLTIMO temporal cuyo contenido
        //     coincida salvo normalizaciones comunes (p.ej. nombre '-' vs vacío)
        if (i < 0) {
          const relaxed = (x) =>
            Number(x.ts) === 0 &&
            String(x.size||'').trim().toUpperCase() === String(row.size||'').trim().toUpperCase() &&
            String(x.number||'').trim() === String(row.number||'').trim() &&
            (String(x.player||'').toLowerCase().trim() === String(row.player||'').toLowerCase().trim()) &&
            (String(x.name||'').toLowerCase().trim().replace(/^-$/,'') === String(row.name||'').toLowerCase().trim().replace(/^-$/,'')) &&
            Number(x.units||1) === Number(row.units||1);

          for (let k = rows.length - 1; k >= 0; k--) {
            if (relaxed(rows[k])) { i = k; break; }
          }
        }

        if (i >= 0) {
          // ¿ya existe una fila real con ese TS? → elimina el temporal (evita duplicado visual)
          const dupIdx = rows.findIndex((x, k) => k !== i && Number(x.ts) === newTs);
          if (dupIdx >= 0) {
            rows.splice(i, 1);
          } else {
            rows[i].ts = newTs;
          }
          try { lcWrite(getCurrentOrder(), currentItemText, rows, watchVer || getDataVer(getCurrentOrder()) || 0); } catch(_){}
          renderList();
        } else {
          // 2) Si no hay temp para reemplazar pero YA llegó el real por watcher, purgar temps iguales
          try{
            const realKeySet = new Set(rows.filter(r => Number(r.ts)>0).map(canonKey));
            const out = [];
            for (const r of rows){
              const isTemp = Number(r.ts)===0;
              const k = canonKey(r);
              if (isTemp && realKeySet.has(k)) continue; // descarta temp fantasma
              out.push(r);
            }
            if (out.length !== rows.length) {
              rows.length = 0; out.forEach(x=>rows.push(x));
              try { lcWrite(getCurrentOrder(), currentItemText, rows, watchVer || getDataVer(getCurrentOrder()) || 0); } catch(_){}
              renderList();
            }
          }catch(_){}
          // 3) Empujón para convergencia si algún evento se perdió
          try { scheduleResync(currentItemText, 250); } catch(_){}
        }
      }

      return; // ok

    } else {
      // Conflicto: el registro ya no existe en backend
      if (j && (j.gone || j.notFound || j.reason === 'not_found')) {
        if (typeof showEditGoneBanner === 'function') showEditGoneBanner();
        showToast('⚠ Player no longer exists');
        await loadFromServer(order, currentItemText, /*force*/true);
        renderList();
        return;
      }
      console.warn('Server rejected', j);
      showToast('⚠ Save failed');
    }
  } catch (err) {
    console.warn('saveToServer fail', err);
  }
}


async function deleteFromServer(ts, playerName){
  try{
    postForm_({action:'delete',order:getCurrentOrder(),item:currentItemText,ts,player:playerName||''})
      .then(j=>{ if(j.ok) showToast('🗑 Deleted'); }).catch(()=>{});
  }catch(err){ console.warn('deleteFromServer fail',err); }
}

async function loadFromServer(order, item, force = false){
  const hit = lcRead(order, item);
  if (hit){
    rowsByItem[item] = hit.rows.slice();
    gcLocks(item);
    if (item === currentItemText) renderList();
  }
  const since = (!force && hit && hit.ver) ? hit.ver : 0;

  try{
    const url = `${BACKEND}?action=load&order=${encodeURIComponent(order)}&item=${encodeURIComponent(item)}${force ? '&forceFresh=1' : ''}&since=${since}&_cb=${CB()}`;
    const data = await robustJSON(url);

    if (data.ok && data.unchanged){
      gcLocks(item);
      try { markProgress(item); } catch(_){}
      return;
    }

    if (data.ok && Array.isArray(data.rows)){
      let serverRows = data.rows.map(rowFromServer);

      // Respetar edición local si hay save-lock pendiente
      const localRows = rowsByItem[item] || [];
      serverRows = serverRows.map(sr => {
        const t = Number(sr.ts)||0;
        if (t && isSavePinned(item, t)){
          const lr = localRows.find(x => Number(x.ts) === t);
          return lr || sr;
        }
        return sr;
      });

      // Reconciliar temps locales con TODO lo nuevo
      for (const sr of serverRows) reconcileTempWithReal(localRows, sr);

      const temps = localRows.filter(x => Number(x.ts) === 0);

      pruneTombstones(item, data.rows);

      let merged = dedupeRows(serverRows.concat(temps));

      const tomb = tombstonesByItem[item];
      if (tomb && tomb.size) merged = merged.filter(r => !tomb.has(Number(r.ts)||0));
      const delSet = deletingTsByItem[item];
      if (delSet && delSet.size) merged = merged.filter(r => !delSet.has(Number(r.ts)||0));

      rowsByItem[item] = merged;
      const ver = Number(data.ver || 0);
      try { lcWrite(order, item, merged, ver); } catch(_){}

      gcLocks(item);
      if (item === currentItemText) renderList();
      try { markProgress(item); } catch(_){}
    } else {
      rowsByItem[item] = rowsByItem[item] || [];
      gcLocks(item);
      try { markProgress(item); } catch(_){}
    }
  } catch (err){
    console.warn('loadFromServer fail', err);
    rowsByItem[item] = rowsByItem[item] || [];
    gcLocks(item);
  }
}



// ================= SAVE / DELETE =======================
function onSave(){
  if (busy) return;

  // Guard RO
  const isEdit = currentEditIndex>=0;
  if (guardReadOnly(isEdit ? 'edit' : 'add', currentItemText)) return;

  // Anti doble-tap
  const nowTick = Date.now();
  if (onSave._last && (nowTick - onSave._last) < 300) return;
  onSave._last = nowTick;

  // Bloquear si está locked por otro
  if (typeof editLocked !== 'undefined' && editLocked){
    alert('This player is being edited on another device. Please close the editor.');
    return;
  }

  const rows = getRowsForCurrent();

  // No permitir guardar si el registro ya fue borrado en otro dispositivo
  if (editGone) {
    alert('This player was deleted on another device. Please close the editor.');
    return;
  }

  // Si estamos editando y el TS está marcado como borrado (tombstone)
  if (currentEditIndex >= 0 && Number(draft.ts) > 0) {
    const tsSet = tombstonesByItem[currentItemText];
    if (tsSet && tsSet.has(Number(draft.ts))) {
      alert('This player was deleted on another device. Please close the editor.');
      return;
    }
  }

  // Validaciones
  if (!requireFieldsOrStop()) return;

  const sizeToSend = selectedSize || getSelectedSizeFromUI();

  const tsForEdit = isEdit
    ? (Number(draft.ts)||Number(rows[currentEditIndex]?.ts)||0)
    : 0;

  const keyOf = (r) => {
    const norm = (s) => String(s||'').toLowerCase().trim();
    const z    = (s) => (String(s||'').trim()==='-' ? '' : String(s||'').trim());
    return [
      norm(ePlayer.value||r.player),
      String(sizeToSend||r.size||'').trim().toUpperCase(),
      String((eNumber.value||r.number||'')).trim(),
      norm(z(eName.value||r.name)),
      String(Math.max(1,Math.min(100, Number(eUnits.value||r.units||1) || 1)))
    ].join('|');
  };

  const payload = {
    ts    : tsForEdit,
    item  : currentItemText,
    player: (ePlayer.value||'').trim(),
    size  : String(sizeToSend||'').trim(),
    number: (eNumber.value||'').trim(),
    name  : (eName.value||'').trim(),
    units : Math.max(1,Math.min(100,Number(eUnits.value)||1))
  };

  if(!payload.player){ alert('Player is required.'); ePlayer.focus(); return; }
  if(!payload.size){ alert('Please select a Size.'); return; }
  if(payload.number && !/^\d+$/.test(payload.number)){ alert('Number must be numeric.'); eNumber.focus(); return; }

  if(isEdit) {
    rows[currentEditIndex]=payload;
  } else {
    const k = keyOf(payload);
    const hasReal = rows.some(r => Number(r.ts)>0 && keyOf(r)===k);
    if (!hasReal) rows.push(payload);
  }

  // **Lock extendido de SAVE**
  if (isEdit && tsForEdit > 0) {
    holdSaveLock(currentItemText, tsForEdit);
    if (lockHeartbeat) { clearInterval(lockHeartbeat); lockHeartbeat = null; }
    lockTs = 0; // evita unlock automático
  }

  // Limpieza anti-fantasmas
  try{
    const seenReal = new Set();
    const out = [];
    for (const r of rows){
      const k = keyOf(r);
      const isReal = Number(r.ts) > 0;
      if (isReal){
        seenReal.add(k);
        out.push(r);
      } else {
        if (!seenReal.has(k)) out.push(r);
      }
    }
    if (out.length !== rows.length) {
      rows.length = 0;
      out.forEach(x => rows.push(x));
    }
  }catch(_){}

  renderList();
  dirty=false;
  closeEditor(true);
  try { lcWrite(getCurrentOrder(), currentItemText, rows, watchVer || getDataVer(getCurrentOrder()) || 0); } catch(_){}

  saveToServer(payload);
}


async function onDelete(){
  if (busy) return;

  // Guard RO
  if (guardReadOnly('delete', currentItemText)) return;

  // Si otro la está editando, no dejamos borrar
  if (typeof editLocked !== 'undefined' && editLocked){
    alert('This player is being edited on another device. Please close the editor.');
    return;
  }
  if (!confirm('Are you sure you want to delete this player?')) return;

  const order = getCurrentOrder();
  const item  = currentItemText;
  const rows  = getRowsForCurrent();

  // 1) Clave canónica desde el editor
  const candidate = {
    player: (ePlayer.value || draft.player || '').trim(),
    size  : String(selectedSize || draft.size || '').trim(),
    number: (eNumber.value || draft.number || '').trim(),
    name  : (eName.value   || draft.name   || '').trim(),
    units : Math.max(1, Math.min(100, Number(eUnits.value || draft.units || 1) || 1))
  };
  const key = canonKeyFor(candidate);

  // 2) TS robusto
  let ts = Number(draft.ts) || 0;
  if (!ts) ts = findTsByKey(item, key);

  if (!ts){
    await loadFromServer(order, item, /*force*/true).catch(()=>{});
    ts = findTsByKey(item, key);
  }

  if (!ts){
    showToast('⚠ Unable to delete yet. Syncing…');
    scheduleResync(item, 250);
    return;
  }

  // 3) Optimistic UI
  removeRowLocalByTs(item, ts);
  markTombstone(item, ts);
  markDeleting(item, ts);
  renderList();
  try {
    const verHint = Math.max(Number(watchVer||0), Number(getDataVer(order)||0));
    lcWrite(order, item, rowsByItem[item] || [], verHint);
  } catch(_){}

  // 4) Lock extendido para DELETE
  holdDeleteLock(item, ts);
  lockTs = 0;
  closeEditor(true);

  // 5) Encolar op
  enqueueItemOp(item, async () => {
    for (let i=0; i<2; i++){
      const ok = await tryAcquireLock(order, item, ts).catch(()=>false);
      if (ok) break;
      await sleep(120);
    }
    const res = await retryOnce(() => postForm_({ action:'delete', order, item, ts, player: candidate.player }));
    return res;
  }).then(res => {
    clearDeleting(item, ts);
    releaseDeleteLock(item, ts);

    if (res && res.ok){
      showToast(res.deleted ? '🗑 Deleted' : 'ℹ Already deleted');
      scheduleResync(item, 150);
    } else {
      showToast('⚠ Delete failed');
      scheduleResync(item, 200);
    }
  }).catch(() => {
    clearDeleting(item, ts);
    releaseDeleteLock(item, ts);
    showToast('⚠ Network error');
    scheduleResync(item, 450);
  });
}



bindFastAction(eSave,   onSave);
bindFastAction(eDelete, onDelete);

// ================= UX MÓVIL (teclado) ==================
document.addEventListener('keydown',(e)=>{
  if(e.key!=='Enter') return;
  const t = e.target;
  if(!(t instanceof HTMLElement)) return;
  if(t.matches('input[type="text"],input[type="number"],input[type="tel"]')){ e.preventDefault(); t.blur(); }
});
editorSheet.addEventListener('click',(e)=>{
  if (busy) return;
  const node = e.target;
  if(!(node instanceof HTMLElement)) return;
  const interactive = node.closest('input,select,button,.chip,.qty');
  if(!interactive){
    const act=document.activeElement;
    if(act && act instanceof HTMLElement) act.blur();
  }
});

// Centrado robusto al abrir el teclado (dos intentos: antes y después de que aparezca)
function ensureVisible(el){
  if(!el) return;
  // primer intento (rápido) envuelto en rAF
  try{
    requestAnimationFrame(()=> {
      try{ el.scrollIntoView({ block:'center', behavior:'smooth' }); }catch(_){}
    });
  }catch(_){}
  // segundo intento tras abrir teclado (iOS/Android)
  setTimeout(()=>{
    try{ el.scrollIntoView({ block:'center', behavior:'smooth' }); }catch(_){}
  }, 300);
}

document.addEventListener('focusin',(e)=>{
  const t = e.target;
  if(!(t instanceof HTMLElement)) return;
  if(editorSheet.hidden) return;
  if(t.matches('input')){
    ensureVisible(t);
  }
});

function measureFooter(){
  if(!actionsFooter) return;
  const h=Math.ceil(actionsFooter.getBoundingClientRect().height||112);
  document.documentElement.style.setProperty('--footer-h',h+'px');
  const kb=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--kb-safe'))||0;
  if(editorBody) editorBody.style.paddingBottom=`calc(var(--footer-h) + ${kb}px)`;
}
function setupFooterObserver(){
  if(!actionsFooter) return;
  try{
    if(footerRO) footerRO.disconnect();
    footerRO=new ResizeObserver(()=>measureFooter());
    footerRO.observe(actionsFooter);
  }catch(_){}
  measureFooter();
}
function setupKeyboardAware(){
  if(!window.visualViewport) return;
  const vv=window.visualViewport;
  const apply=()=>{
    const kb=Math.max(0,window.innerHeight-vv.height-vv.offsetTop);
    document.documentElement.style.setProperty('--kb-safe',kb+'px');
    if(editorBody) editorBody.style.paddingBottom=`calc(var(--footer-h) + ${kb}px)`;
    if(kb>0) editorSheet.classList.add('kb-open'); else editorSheet.classList.remove('kb-open');
  };
  vv.addEventListener('resize',apply);
  vv.addEventListener('scroll',apply);
  window.addEventListener('orientationchange',()=>setTimeout(apply,200));
  apply();
}
// Fuerza repintado (soluciona artefactos de teclado en iOS/iPadOS)
function forceRepaint(node){
  try{
    if(!node) return;
    const prev = node.style.webkitTransform;
    node.style.webkitTransform = 'translateZ(0)'; // entra a nueva capa
    // flush layout
    void node.offsetHeight;
    // salimos de la capa en el próximo tick
    setTimeout(()=>{ node.style.webkitTransform = prev || ''; }, 0);
  }catch(_){}
}

// Limpia artefactos visuales del teclado (iOS/Android)
function clearKeyboardGhost(){
  try{
    // 1) quita cualquier foco (cierra teclado si quedó colgado)
    if (document.activeElement && typeof document.activeElement.blur === 'function'){
      document.activeElement.blur();
    }

    // 2) resetea variables y clases de teclado
    document.documentElement.style.setProperty('--kb-safe','0px');
    editorSheet.classList.remove('kb-open');

    // 3) micro scroll para forzar composición global
    window.scrollBy(0, 1);
    window.scrollBy(0,-1);

    // 4) repinta lo que más suele quedar “marcado”
    forceRepaint(document.querySelector('#sheet'));
    forceRepaint(document.querySelector('.list'));
    forceRepaint(document.body);
  }catch(_){}
}


// ================= TOAST ===============================
function showToast(msg){
  let t=document.querySelector('.toast');
  if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1600);
}

// ---- Skeleton de botones (placeholder por si quieres ver el grid detrás) ----
function paintSkeletonButtons(n=6){
  const grid = $('#itemsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for(let i=0;i<n;i++){
    const s = el('div','btn skeleton','…');
    grid.appendChild(s);
  }
}

// ================= START ===============================
async function fetchSizesSafe(){
  try{
    const res = await fetch(`${BACKEND}?sizes=1&_cb=${CB()}`,{cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    if(Array.isArray(data.sizes) && data.sizes.length) return data.sizes;
    return LOCAL_SIZE_FALLBACK.slice();
  }catch(_){
    return LOCAL_SIZE_FALLBACK.slice();
  }
}

// ======= READ-ONLY (Checklist LIMIT / LIMIT DATE) =======
let READ_ONLY_BY_ITEM = Object.create(null);   // { ITEM_CANON: true|false }
let ORDER_ALL_READ_ONLY = false;               // bool

function _canonItem_(s){ return String(s||'').trim().toUpperCase(); }

function isReadOnlyItem(item){
  return !!READ_ONLY_BY_ITEM[_canonItem_(item)];
}
function isAllReadOnly(){
  return !!ORDER_ALL_READ_ONLY;
}

// Aplica RO a la UI (SIN badges ni estilos extra)
function applyReadOnlyUI(orderId, itemsCanon){
  const addBtn = document.querySelector('#btnAdd') || (typeof eAdd !== 'undefined' ? eAdd : null);
  const allRO  = isAllReadOnly();

  if (addBtn){
    addBtn.disabled = allRO;
    addBtn.setAttribute('aria-disabled', allRO ? 'true' : 'false');
    addBtn.title = allRO ? 'Order is read-only' : '';
  }

  // <<< NUEVO: marcamos los botones de items como "solo-lectura" sin texto ni badge
  const grid = document.querySelector('#itemsGrid');
  if (grid && Array.isArray(itemsCanon)){
    itemsCanon.forEach(itC => {
      const btn = grid.querySelector(`button[data-item="${itC}"]`);
      if (!btn) return;
      const ro = isReadOnlyItem(itC);
      btn.setAttribute('data-ro', ro ? '1' : '0');   // solo atributo para que el CSS lo pinte
    });
  }
}


// Corta acciones cuando corresponda (sin marcas visuales)
function guardReadOnly(kind, item){
  const allRO = isAllReadOnly();
  const itRO  = item ? isReadOnlyItem(item) : false;

  const blocks =
    (kind === 'add'    && allRO) ||
    (kind === 'edit'   && (allRO || itRO)) ||
    (kind === 'delete' && (allRO || itRO));

  if (blocks){
    if (typeof showToast === 'function') showToast('🔒 Read mode only.');
    else alert('Read mode only.');
    return true;
  }
  return false;
}

// refrescar solo el mapa RO sin re-cargar todo
async function refreshRO(order){
  const url = `${BASE_URL}?action=readonly&order=${encodeURIComponent(order)}&${REALTIME_QS}=1`;
  const r = await fetch(url, { cache:'no-store' });
  const j = await r.json();
  if (j?.ok){
    state.readOnlyMap = j.readOnly || {};
    state.allReadOnly = !!j.allReadOnly;
    renderROBadges();
  }
}

// Helpers robustos para timing y auto-creación de header/grid
async function waitForEl(sel, timeout = 2000){
  const t0 = performance.now();
  let el = document.querySelector(sel);
  while(!el && performance.now() - t0 < timeout){
    await new Promise(r => setTimeout(r, 16));
    el = document.querySelector(sel);
  }
  return el;
}

function ensureHeader(){
  let name = document.getElementById('clientName');
  let info = document.getElementById('orderInfo');
  if (name && info) return { name, info };

  let header = document.querySelector('header#top');
  if (!header) {
    header = document.createElement('header');
    header.id = 'top';
    document.body.prepend(header);
  }
  if (!name) {
    name = document.createElement('div');
    name.id = 'clientName';
    name.className = 'title';
    name.textContent = '';
    header.appendChild(name);
  }
  if (!info) {
    info = document.createElement('div');
    info.id = 'orderInfo';
    info.className = 'subtitle';
    info.textContent = '';
    header.appendChild(info);
  }
  return { name, info };
}

function ensureGrid(){
  let grid = document.getElementById('itemsGrid');
  if (grid) return grid;
  const host = document.querySelector('main') || document.body;
  grid = document.createElement('section');
  grid.id = 'itemsGrid';
  grid.className = 'grid';
  host.prepend(grid);
  return grid;
}

// ===================== START (SWR-safe, con BG watchers de datos) =====================
async function start(){
  // Helpers locales (timing + autocreación de header y grid)
  async function waitForEl(sel, timeout = 1000){
    const t0 = performance.now();
    let el = document.querySelector(sel);
    while(!el && performance.now() - t0 < timeout){
      await new Promise(r => setTimeout(r, 16));
      el = document.querySelector(sel);
    }
    return el;
  }
  function ensureHeader(){
    let header = document.querySelector('header#top');
    if (!header) {
      header = document.createElement('header');
      header.id = 'top';
      document.body.prepend(header);
    }
    let nameEl = document.getElementById('clientName');
    if (!nameEl) {
      nameEl = document.createElement('div');
      nameEl.id = 'clientName';
      nameEl.className = 'title';
      header.appendChild(nameEl);
    }
    let infoEl = document.getElementById('orderInfo');
    if (!infoEl) {
      infoEl = document.createElement('div');
      infoEl.id = 'orderInfo';
      infoEl.className = 'subtitle';
      header.appendChild(infoEl);
    }
    return { nameEl, infoEl };
  }
  function ensureGrid(){
    let grid = document.getElementById('itemsGrid');
    if (grid) return grid;
    const host = document.querySelector('main') || document.body;
    grid = document.createElement('section');
    grid.id = 'itemsGrid';
    grid.className = 'grid';
    host.prepend(grid);
    return grid;
  }

  const CANON = (s) => String(s || '').trim().toUpperCase();
  const ciMap = (obj) => {
    const m = Object.create(null);
    if (obj && typeof obj === 'object') {
      for (const k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        m[CANON(k)] = obj[k];
      }
    }
    return m;
  };

  showBoot(true, 'Loading…');

  const q  = qs('q');
  const order = qs('order');
  const va = (qs('va')||'').toUpperCase();
  emptyBox.hidden = true;

  // Asegurar header antes de usarlo
  let nameEl = await waitForEl('#clientName', 500);
  let infoEl = await waitForEl('#orderInfo', 500);
  if (!nameEl || !infoEl) ({ nameEl, infoEl } = ensureHeader());

  if (!q && !order) {
    document.body.classList.add('no-data');
    nameEl.textContent = 'Missing parameter';
    infoEl.textContent = '';
    const grid0 = document.getElementById('itemsGrid') || ensureGrid();
    if (grid0) grid0.innerHTML = '';
    emptyBox.className = 'empty--full';
    emptyBox.innerHTML = `
      <div class="empty-box">
        <div class="t">No data for that order.</div>
        <div class="s">Please provide ?q= or ?order= in the URL.</div>
      </div>`;
    emptyBox.hidden = false;
    showBoot(false);
    return;
  }

  const currentUrlOrder = (order || q || '').toUpperCase().trim();
  try{
    const lastOrder = localStorage.getItem('last_order_used') || '';
    if (lastOrder && lastOrder !== currentUrlOrder){
      lcPurgeByOrder(lastOrder);
    }
    localStorage.setItem('last_order_used', currentUrlOrder);
  }catch(_){}

  nameEl.textContent = 'Loading…';
  infoEl.textContent  = q ? `ORDER ${q}` : (order ? `ORDER ${order}` : '');

  paintSkeletonButtons(6);

  const sizesP = fetchSizesSafe();
  let bootUrl = `${BACKEND}?action=bootstrap&_cb=${CB()}`;
  if (q)      bootUrl += `&q=${encodeURIComponent(q)}`;
  else if (order) bootUrl += `&order=${encodeURIComponent(order)}${va?`&va=${va}`:''}`;
  bootUrl += `&since=${encodeURIComponent(JSON.stringify({}))}`;

  try {
    const [sizes, boot] = await Promise.all([ sizesP, robustJSON(bootUrl) ]);
    sizeOptions = sizes;

    if (!boot || !boot.ok) throw new Error('bootstrap not available');

    // Header seguro
    if (!nameEl || !infoEl) ({ nameEl, infoEl } = ensureHeader());
    nameEl.textContent = boot.client || '(no client)';
    infoEl.textContent  = `ORDER ${boot.order || order || q || ''}`;

    // Grid segura
    let grid = document.getElementById('itemsGrid') || await waitForEl('#itemsGrid', 500);
    if (!grid) grid = ensureGrid();
    grid.innerHTML = '';

    const orderId   = boot.order || order || (q||'').toUpperCase();
    const rawItems  = Array.isArray(boot.items) ? boot.items : [];
    const itemsCanon= rawItems.map(CANON).filter(Boolean);

    if (!itemsCanon.length){
      document.body.classList.add('no-data');
      grid.innerHTML = '';
      emptyBox.className = 'empty--full';
      emptyBox.innerHTML = `
        <div class="empty-box">
          <div class="t">No data for that order.</div>
          <div class="s">Please use a valid order.</div>
        </div>`;
      emptyBox.hidden = false;

      rowsByItem && Object.keys(rowsByItem).forEach(k => delete rowsByItem[k]);
      const oid = (boot.order || order || (q||'').toUpperCase());
      if (oid) lcPurgeByOrder(oid);

      showBoot(false);
      return;
    } else {
      document.body.classList.remove('no-data');
      emptyBox.hidden = true;
    }

    // RO del backend (sin UI extra)
    READ_ONLY_BY_ITEM   = ciMap(boot.readOnly || {});
    ORDER_ALL_READ_ONLY = !!boot.allReadOnly;

    // Items globales (CANÓNICOS)
    window.__ITEMS = itemsCanon.slice();

    // Primer snapshot de locks (escalonado)
    try {
      itemsCanon.forEach((itC, idx) => {
        setTimeout(() => { primeLocksForItem(orderId, itC).catch(()=>{}); }, idx * 40);
      });
    } catch(_) {}

    // Warmers
    try { if (window.cancelWarm) window.cancelWarm(); } catch(_){}
    window.cancelWarm = startGlobalLocksWarmer(orderId, itemsCanon, 3000);

    try { stopDataWarmer(); } catch(_){}
    cancelDataWarm = startDataWarmer(orderId, itemsCanon, 45_000, 15_000);

    // Precarga + botones + merge SWR
    const bootDataCI = ciMap(boot.data || {});
    rawItems.forEach((label, idx) => {
      const itC = itemsCanon[idx];
      const pack = bootDataCI[itC];

      if (pack && !pack.unchanged && Array.isArray(pack.rows)) {
        mergeInitialRows(orderId, itC, pack.rows, Number(pack.ver||0));
      } else {
        const hit = lcRead(orderId, itC);
        if (hit) rowsByItem[itC] = hit.rows.slice();
      }

      const b = el('button','btn',label);
      b.dataset.item = itC;

      b.addEventListener('pointerup', async (ev) => {
        ev.preventDefault();
        if (busy) return;
        lastBtn = b;
        rememberGridScroll();
        await openSheet(itC);
      }, { passive:false });
      b.addEventListener('click', e => e.preventDefault(), { passive:false });
      grid.appendChild(b);
    });

    // Watchers BG (locks + datos)
    try {
      const tuning = {
        locksIntervalMs: LOCKS_WATCH_INTERVAL_MS,
        bgPollMs: BG_POLL_MS,
        maxItems: MAX_BG_WATCHED_ITEMS,
        reconcileEveryMs: FULL_RECONCILE_EVERY_MS
      };
      if (typeof setWatcherTuning === 'function') setWatcherTuning(tuning);
      if (typeof startBackgroundWatchers === 'function') startBackgroundWatchers(orderId, itemsCanon, tuning);
    } catch(_){}

    // RO UI (ADD solo deshabilita si toda la orden está RO)
    applyReadOnlyUI(orderId, itemsCanon);

    updateItemGridLockBadges();
    showBoot(false);

  } catch(_err) {
    // -------- Fallback: HEAD + BULKLOAD --------
    try {
      sizeOptions = await sizesP;

      let headUrl = '';
      if (q) headUrl = `${BACKEND}?q=${encodeURIComponent(q)}&_cb=${CB()}`;
      else if (order) headUrl = `${BACKEND}?order=${encodeURIComponent(order)}${va?`&va=${va}`:''}&_cb=${CB()}`;
      else {
        if (!nameEl || !infoEl) ({ nameEl, infoEl } = ensureHeader());
        nameEl.textContent='Missing parameter q or order';
        showBoot(false);
        return;
      }

      const head = await robustJSON(headUrl);
      emptyBox.hidden = true;

      if (!head.ok && head.needValidation){
        if (!nameEl || !infoEl) ({ nameEl, infoEl } = ensureHeader());
        nameEl.textContent = 'Validation required';
        infoEl.textContent  = `ORDER ${head.order}`;
        let g = document.getElementById('itemsGrid') || await waitForEl('#itemsGrid', 500);
        if (!g) g = ensureGrid();
        const msg = el('div','empty', head.msg);
        msg.style.color = '#c00000';
        msg.style.fontWeight = '600';
        msg.style.marginTop = '40px';
        g.innerHTML = '';
        g.appendChild(msg);
        showBoot(false);
        return;
      }

      const rawItems   = (head.ok && Array.isArray(head.items)) ? head.items : [];
      const itemsCanon = rawItems.map(CANON).filter(Boolean);

      if (!head.ok || !itemsCanon.length){
        document.body.classList.add('no-data');
        let g = document.getElementById('itemsGrid') || await waitForEl('#itemsGrid', 500) || ensureGrid();
        g.innerHTML = '';
        emptyBox.className = 'empty--full';
        emptyBox.innerHTML = `
          <div class="empty-box">
            <div class="t">No data for that order.</div>
            <div class="s">Please use a valid order.</div>
          </div>`;
        emptyBox.hidden = false;

        rowsByItem && Object.keys(rowsByItem).forEach(k => delete rowsByItem[k]);
        const oid = (head.order || order || (q||'').toUpperCase());
        if (oid) lcPurgeByOrder(oid);

        showBoot(false);
        return;
      } else {
        document.body.classList.remove('no-data');
        emptyBox.hidden = true;
      }

      if (!nameEl || !infoEl) ({ nameEl, infoEl } = ensureHeader());
      nameEl.textContent = head.client || '(no client)';
      infoEl.textContent = `ORDER ${head.order}`;

      const sinceMap = {};
      const bulkUrl  = `${BACKEND}?action=bulkload&order=${encodeURIComponent(head.order)}&items=${encodeURIComponent(rawItems.join('|'))}&since=${encodeURIComponent(JSON.stringify(sinceMap))}&_cb=${CB()}`;
      const bulk     = await robustJSON(bulkUrl);

      let grid = document.getElementById('itemsGrid') || await waitForEl('#itemsGrid', 500);
      if (!grid) grid = ensureGrid();
      grid.innerHTML = '';

      // fallback: asumimos no-RO
      READ_ONLY_BY_ITEM   = Object.create(null);
      ORDER_ALL_READ_ONLY = false;

      window.__ITEMS = itemsCanon.slice();

      try {
        itemsCanon.forEach((itC, idx) => {
          setTimeout(() => { primeLocksForItem(head.order, itC).catch(()=>{}); }, idx * 40);
        });
      } catch(_) {}

      try { if (window.cancelWarm) window.cancelWarm(); } catch(_){}
      window.cancelWarm = startGlobalLocksWarmer(head.order, itemsCanon, 3000);

      try { stopDataWarmer(); } catch(_){}
      cancelDataWarm = startDataWarmer(head.order, itemsCanon, 45_000, 15_000);

      const bulkDataCI = ciMap(bulk.data || {});
      rawItems.forEach((label, idx) => {
        const itC = itemsCanon[idx];
        const pack = bulkDataCI[itC];

        if (pack && !pack.unchanged && Array.isArray(pack.rows)) {
          mergeInitialRows(head.order, itC, pack.rows, Number(pack.ver||0));
        } else {
          const hit = lcRead(head.order, itC);
          if (hit) rowsByItem[itC] = hit.rows.slice();
        }

        const b = el('button','btn',label);
        b.dataset.item = itC;
        b.addEventListener('pointerup', (ev) => {
          ev.preventDefault();
          if (busy) return;
          lastBtn = b;
          rememberGridScroll();
          openSheet(itC);
        }, { passive:false });
        b.addEventListener('click', e => e.preventDefault(), { passive:false });
        grid.appendChild(b);
      });

      try {
        const tuning = {
          locksIntervalMs: LOCKS_WATCH_INTERVAL_MS,
          bgPollMs: BG_POLL_MS,
          maxItems: MAX_BG_WATCHED_ITEMS,
          reconcileEveryMs: FULL_RECONCILE_EVERY_MS
        };
        if (typeof setWatcherTuning === 'function') setWatcherTuning(tuning);
        if (typeof startBackgroundWatchers === 'function') startBackgroundWatchers(head.order, itemsCanon, tuning);
      } catch(_){}

      applyReadOnlyUI(head.order, itemsCanon);
      updateItemGridLockBadges();
      showBoot(false);

    } catch(err2){
      try{
        if (!nameEl || !infoEl) ({ nameEl, infoEl } = ensureHeader());
        nameEl.textContent = 'Load error';
        infoEl.textContent  = navigator.onLine ? String(err2) : 'Sin conexión. Reintentá.';
        const grid = document.getElementById('itemsGrid') || ensureGrid();
        if (grid) grid.innerHTML = '';
      } finally {
        showBoot(false);
        console.error('start() failed:', err2);
      }
    }
  }
}



// Botón ADD (idéntico, con guard)
bindFastAction(btnAdd, () => {
  const now = Date.now();
  if (now < _openTapUntil) return;
  _openTapUntil = now + OPEN_TAP_GUARD_MS;
  setTimeout(() => { if (_openTapUntil < Date.now()) _openTapUntil = 0; }, OPEN_TAP_GUARD_MS);
  openEditor(null);
});

// Inicializaciones
setupFooterObserver();
setupKeyboardAware();
// Refuerzo: bloquea enfoque por taps en labels (especialmente iOS viejito)
document.addEventListener('mousedown', (e) => {
  const lab = e.target.closest('.field > label');
  if (lab) e.preventDefault();
}, true);

document.addEventListener('touchstart', (e) => {
  const lab = e.target.closest('.field > label');
  if (lab) e.preventDefault();
}, { passive:false, capture:true });
start();

function initCategorySizeUI(){
  if (elCategory){
    populateCategorySelect();
    elCategory.addEventListener('change', onCategoryChange);
    elCategory.addEventListener('input', onCategoryChange);
  }
}
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initCategorySizeUI);
} else {
  initCategorySizeUI();
}

/* ======== PORTRAIT-ONLY ENFORCER (non-intrusive) ======== */
(() => {
  const overlay = document.getElementById('rotate-overlay');
  if (!overlay) return;

  // Media queries que observamos
  const mqLandscape = window.matchMedia('(orientation: landscape)');
  const mqCoarse   = window.matchMedia('(hover: none) and (pointer: coarse)');

  // Detección amplia de móvil/tablet (incluye iPadOS que se hace pasar por "Mac")
  function isMobileOrTabletUA() {
    const ua = navigator.userAgent || '';
    return /Mobi|Android|iPhone|iPad|iPod|Tablet|IEMobile|Kindle|Silk|PlayBook|BB10/i.test(ua);
  }
  function isTouchDevice() {
    return (navigator.maxTouchPoints || 0) > 0 || mqCoarse.matches;
  }
  function isSmallishViewport() {
    // Evita “falsos positivos” en laptops táctiles: si la ventana es enorme, probablemente no es tablet.
    return Math.min(window.innerWidth, window.innerHeight) <= 1024;
  }

  function shouldShowOverlay() {
    // Landscape + (táctil o UA móvil/tablet) + tamaño razonable
    return mqLandscape.matches && (isTouchDevice() || isMobileOrTabletUA()) && isSmallishViewport();
  }

  function update() {
    const show = shouldShowOverlay();
    // Añadimos clase a <html> para que CSS lo pueda mostrar sin depender de JS
    document.documentElement.classList.toggle('landscape-touch', show);
    overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
    // No bloqueamos scroll con JS: el overlay ya cubre todo y previene interacción debajo.
  }

  // Eventos relevantes
  const opts = { passive: true };
  ['DOMContentLoaded', 'load', 'pageshow', 'resize', 'orientationchange', 'visibilitychange'].forEach(evt =>
    window.addEventListener(evt, update, opts)
  );

  // Escuchar cambios de media query (Safari moderno soporta .addEventListener)
  mqLandscape.addEventListener?.('change', update);
  mqCoarse.addEventListener?.('change', update);

  // Primera evaluación
  update();
})();
