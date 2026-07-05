/* ============================================================
   SYNC.JS — persist user state (watchlist, portfolio, funnel
   re-entry tickets, Stage 6 answers) to a private GitHub repo
   via the Contents API. Same PAT already used for custom tickers.

   Data lives in userstate.json in your repo root. Private repo
   = only you can read it. No extra infrastructure needed.

   Design:
   - saveSync()  : debounced (2s) — called after every state change
   - loadSync()  : called once on page load, merges remote → local
   - All operations are best-effort: network failure falls back to
     localStorage silently, with a visible indicator in the UI.
   ============================================================ */

const SYNC_FILE = "userstate.json";
const SYNC_DEBOUNCE_MS = 2000;
let _syncTimer = null;
let syncStatus = "idle";   // idle | saving | saved | error | offline

/* ── core GitHub file read/write ── */
async function ghRead(cfg, path){
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`,
    {headers:{Authorization:`Bearer ${cfg.token}`, Accept:"application/vnd.github+json"}});
  if(!r.ok) return null;
  const j = await r.json();
  return {content: JSON.parse(atob(j.content.replace(/\n/g,""))), sha: j.sha};
}

async function ghWrite(cfg, path, data, sha){
  const body = {
    message:`sync: userstate ${new Date().toISOString().slice(0,10)}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
  };
  if(sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`,
    {method:"PUT", headers:{Authorization:`Bearer ${cfg.token}`,"Content-Type":"application/json"},
     body:JSON.stringify(body)});
  return r.ok;
}

/* ── gather everything worth persisting ── */
function gatherState(){
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    watchlist: State.watchlist || [],
    portfolio: State.portfolio || null,
    funnel: State.funnel || null,
    compare: State.compare || [],
    learnProgress: State.learnProgress || {},
  };
}

/* ── merge remote into local (remote wins on conflict, except for
   things that are purely local like UI state) ── */
function mergeRemote(remote){
  if(!remote || remote.version < 2) return;
  if(remote.watchlist?.length) State.watchlist = remote.watchlist;
  if(remote.portfolio) State.portfolio = remote.portfolio;
  if(remote.funnel) State.funnel = remote.funnel;
  if(remote.compare?.length) State.compare = remote.compare;
  if(remote.learnProgress) State.learnProgress = remote.learnProgress;
}

/* ── save (debounced) ── */
let _syncSha = null;   // cached SHA to avoid extra read on every write

function scheduleSync(){
  const cfg = getGithubCfg();
  if(!cfg.token || !cfg.repo) return;   // no config — localStorage only
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(()=> doSync(cfg), SYNC_DEBOUNCE_MS);
}

async function doSync(cfg){
  syncStatus = "saving"; renderSyncBadge();
  try {
    // Fetch current SHA if we don't have it
    if(!_syncSha){
      const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${SYNC_FILE}`,
        {headers:{Authorization:`Bearer ${cfg.token}`}});
      if(r.ok){ const j=await r.json(); _syncSha=j.sha; }
    }
    const ok = await ghWrite(cfg, SYNC_FILE, gatherState(), _syncSha);
    if(ok){
      // Refresh SHA after write
      const r2 = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${SYNC_FILE}`,
        {headers:{Authorization:`Bearer ${cfg.token}`}});
      if(r2.ok){ const j2=await r2.json(); _syncSha=j2.sha; }
      syncStatus = "saved";
    } else {
      syncStatus = "error";
    }
  } catch(e){
    syncStatus = "offline";
  }
  renderSyncBadge();
  setTimeout(()=>{ if(syncStatus!=="saving"){ syncStatus="idle"; renderSyncBadge(); }}, 3000);
}

/* ── load on startup ── */
async function loadSync(){
  const cfg = getGithubCfg();
  if(!cfg.token || !cfg.repo) return;
  syncStatus = "saving"; renderSyncBadge();
  try {
    const result = await ghRead(cfg, SYNC_FILE);
    if(result){
      _syncSha = result.sha;
      mergeRemote(result.content);
      syncStatus = "saved";
      render();
    } else {
      syncStatus = "idle";
    }
  } catch(e){
    syncStatus = "offline";
  }
  renderSyncBadge();
}

/* ── badge rendered into the topbar ── */
function renderSyncBadge(){
  const el = document.getElementById("syncBadge");
  if(!el) return;
  const cfg = getGithubCfg();
  if(!cfg.token || !cfg.repo){
    el.innerHTML = `<span style="font-size:11px;color:var(--dim)" title="Connect GitHub in Portfolio tab to sync watchlist and portfolio across devices">○ local only</span>`;
    return;
  }
  const map = {
    idle:    ["●","var(--good)","synced to GitHub"],
    saving:  ["◌","var(--dim)","syncing…"],
    saved:   ["●","var(--good)","saved to GitHub"],
    error:   ["●","var(--warn)","sync error — will retry"],
    offline: ["●","#b8860b","offline — saved locally"],
  };
  const [dot, color, label] = map[syncStatus] || map.idle;
  el.innerHTML = `<span style="font-size:11px;color:${color}" title="${label}">${dot} ${label}</span>`;
}

/* ── hook into State changes ── */
/* Call this after every meaningful state mutation */
function saveAndSync(){
  // localStorage as the primary safety net (always)
  try {
    localStorage.setItem("terminal_watchlist", JSON.stringify(State.watchlist||[]));
    localStorage.setItem("terminal_compare", JSON.stringify(State.compare||[]));
  } catch(e){}
  savePortfolio();
  saveFunnel();
  // GitHub sync (debounced, best-effort)
  scheduleSync();
}
