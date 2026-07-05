/* ============================================================
   APP.JS — state, rendering, and event wiring.
   No framework. Renders into #root via template strings.
   ============================================================ */

const State = {
  data: SAMPLE,
  live: false,
  tab: "stocks",
  mkt: "ALL",
  capTier: "ALL",
  preset: "all",
  q: "",
  sort: "health",
  sel: null,
  discount: 10,
  termGrowth: 3,
  driverDir: Object.fromEntries(MACRO_DRIVERS.map(d=>[d.id,"down"])),
  phase: 0,
  view: "annual",
  kpiExpanded: false,
  learnMode: true,
  showWatchlist: false,
  watchlist: JSON.parse(localStorage.getItem("terminal_watchlist")||"[]"),
  compare: [],
  filters: { sectors: [], revG:{min:null,max:null}, fcfG:{min:null,max:null}, pe:{min:null,max:null},
             mos:{min:null,max:null}, health:{min:null,max:null}, mcap:{min:null,max:null} },
  filterLogic: "AND",
  filtersOpen: true,
  playbookCat: "all",
  playbookMkt: "ALL",
  playbookOpen: null,
  learnSection: "all",
  learnSearch: "",
  decisionOpen: "pillars",
  veteranOpen: null,
  veteranView: "sector",
  veteranMkt: "ALL",
  funnel: null,   // lazy-loaded by renderWorkflow() from localStorage
  portfolio: null, // lazy-loaded by renderPortfolio() from localStorage
  returnTab: null,  // Fix 6: which tab opened the tearsheet — back button returns here
  pfConcOpen: null,  // Portfolio: which Concentration sector is expanded
  pfGateOpen: null,  // Portfolio: which holding's 6-gate detail is expanded
  aiChat: {t:null, msgs:[], busy:false, error:null},  // per-stock live AI chat (Gemini)
  aiKeyEdit: false,
};

function saveWatchlist(){ localStorage.setItem("terminal_watchlist", JSON.stringify(State.watchlist)); }
function toggleWatch(t){
  const i=State.watchlist.indexOf(t);
  if(i>=0) State.watchlist.splice(i,1); else State.watchlist.push(t);
  saveWatchlist(); render();
}
function toggleCompare(t){
  const i=State.compare.indexOf(t);
  if(i>=0){ State.compare.splice(i,1); }
  else { if(State.compare.length>=5){ alert("You can compare up to 5 stocks at a time. Remove one first."); return; } State.compare.push(t); }
  if(typeof saveAndSync==="function") saveAndSync(); else render();
}

/* ── startup data loading ──────────────────────────────────────────────────
   Fix 2: previously each of 7 fetches called render() independently, causing
   up to 7 full re-renders (each running computeRows() on every stock) before
   the user saw a stable screen. Now: a single debounced render fires at most
   once per 80ms, so all fetches that resolve within the same network batch
   (almost always all of them) produce exactly one render. Individual fetches
   still update their globals immediately so data is never lost on a timeout.
   ─────────────────────────────────────────────────────────────────────────*/
let _renderTimer = null;
function scheduleRender(){
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(render, 80);
}

fetch("data.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  if(Array.isArray(d)&&d.length){ State.data=d; State.live=true; scheduleRender(); }
}).catch(()=>{});

let MACRO_DATA = null;
fetch("macro.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  MACRO_DATA = d; scheduleRender();
}).catch(()=>{ /* fine — macro panel just won't show live numbers yet */ });

let REACTIONS_DATA = [];
fetch("reactions.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  if(Array.isArray(d)) REACTIONS_DATA = d; scheduleRender();
}).catch(()=>{ /* fine — track record panel shows a setup message instead */ });

let STATUS_DATA = {};
fetch("status.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  STATUS_DATA = d; scheduleRender();
}).catch(()=>{ /* fine — strip hidden when no status */ });

let ESTIMATES_DATA = {};
fetch("estimates.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  if(Array.isArray(d)) d.forEach(rec=>{ if(rec.ticker) ESTIMATES_DATA[rec.ticker]=rec; });
  applyEstimatesGrowth(State.data, ESTIMATES_DATA);
  invalidateRowsCache();  // estimates changed g on many stocks
  scheduleRender();
}).catch(()=>{ /* fine — DCF falls back to the labeled default growth */ });

let VERIFY_US = null;
fetch("verify_us.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  if(Array.isArray(d)){ VERIFY_US={}; d.forEach(rec=>{ if(rec.ticker) VERIFY_US[rec.ticker]=rec; }); scheduleRender(); }
}).catch(()=>{ /* fine — data integrity panel skips the SEC cross-check */ });

let VERIFY_IN = null;
fetch("verify_in.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  if(Array.isArray(d)){ VERIFY_IN={}; d.forEach(rec=>{ if(rec.ticker) VERIFY_IN[rec.ticker]=rec; }); scheduleRender(); }
}).catch(()=>{ /* fine — data integrity panel skips the NSE cross-check */ });

let PRICE_HISTORY = {};
fetch("price_history.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  if(Array.isArray(d)) d.forEach(rec=>{ if(rec.ticker) PRICE_HISTORY[rec.ticker]=rec; });
  scheduleRender();
}).catch(()=>{ /* fine — price chart shows a setup message instead */ });

let CLASSIFICATION = null;
fetch("classification.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  CLASSIFICATION = d; scheduleRender();
}).catch(()=>{ /* fine — Stage 0 falls back to all fetched Nifty names */ });

let PLEDGING_DATA = null;
fetch("pledging.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  PLEDGING_DATA = d.symbols || d; scheduleRender();
}).catch(()=>{ /* fine — pledging condition reports honestly as unverified */ });

/* ── Fix 3: memoized computeRows ───────────────────────────────────────────
   Running dcf() + analyze() on every stock on every render is O(n) with a
   large constant — at 500 stocks it means 500 DCF computations per keypress.
   We cache the result and only recompute when the inputs that affect it change:
   the data array reference, the discount rate, or the terminal growth rate.
   Invalidate by setting _rowsCache = null (e.g. after estimates merge).
   ─────────────────────────────────────────────────────────────────────────*/
let _rowsCache = null;
let _rowsCacheKey = null;

function invalidateRowsCache(){ _rowsCache = null; _rowsCacheKey = null; }

function computeRows(){
  const key = `${State.data.length}|${State.discount}|${State.termGrowth}|${State.data[0]?.g||""}`;
  if(_rowsCache && _rowsCacheKey === key) return _rowsCache;
  _rowsCache = State.data.map(s=>{
    const intrinsic = dcf(normalize(s), {discount:State.discount, termGrowth:State.termGrowth, years:10});
    return analyze(s, intrinsic);
  });
  _rowsCacheKey = key;
  return _rowsCache;
}

function capTierOf(s){
  const usdMcap = s.mkt==="US" ? s.mcap : s.mcap/830;
  if(usdMcap>200) return "mega";
  if(usdMcap>10) return "large";
  return "mid";
}

const PRESETS=[
  {id:"all", label:"All stocks", n:"", test:()=>true},
  {id:"quality", label:"Quality compounders", n:"ROE>20% · FCF/NI≥1 · low debt",
   test:s=>s.roe>20 && (s.fcfNi==null||s.fcfNi>=0.9) && (s.debtToEbitda==null||s.debtToEbitda<2)},
  {id:"qfp", label:"Quality at fair price", n:"ROE>18% · FCF/NI≥0.9 · DCF gap>10% · FCF growing",
   test:s=>s.roe!=null && s.roe>18 && (s.fcfNi==null||s.fcfNi>=0.9) && (s.debtToEbitda==null||s.debtToEbitda<2.5) && s.mos!=null && s.mos>10 && s.fcfG!=null && s.fcfG>0},
  {id:"value", label:"Undervalued + growing", n:"DCF gap>15% · FCF growing",
   test:s=>s.mos!=null && s.mos>15 && s.fcfG!=null && s.fcfG>0},
  {id:"cash", label:"Cash machines", n:"Top FCF yield",
   test:s=>s.fcfYield!=null && s.fcfYield>5},
  {id:"flags", label:"Red flags", n:"Warning signals firing",
   test:s=>s.flags.some(f=>f.s==="warn")},
  {id:"watch", label:"★ Watchlist", n:"",
   test:s=>State.watchlist.includes(s.t)},
];

function distinctSectors(){
  return [...new Set(State.data.map(s=>s.sec).filter(Boolean))].sort();
}

function advancedFilterActive(){
  const F = State.filters;
  return F.sectors.length>0 || ["revG","fcfG","pe","mos","health","mcap"].some(k=>F[k].min!=null||F[k].max!=null);
}

function passesRange(val, range){
  if(range.min==null && range.max==null) return null; // inactive
  if(val==null) return false;
  if(range.min!=null && val<range.min) return false;
  if(range.max!=null && val>range.max) return false;
  return true;
}

function passesAdvancedFilters(s){
  const F = State.filters;
  const preds = [];
  if(F.sectors.length>0) preds.push(F.sectors.includes(s.sec));
  const fields = [["revG","revG"],["fcfG","fcfG"],["pe","pe"],["mos","mos"],["health","healthScore"],["mcap","mcap"]];
  fields.forEach(([fk,sk])=>{ const r=passesRange(s[sk], F[fk]); if(r!==null) preds.push(r); });
  if(preds.length===0) return true;
  return State.filterLogic==="AND" ? preds.every(Boolean) : preds.some(Boolean);
}

function filteredRows(){
  let rows = computeRows();
  const preset = PRESETS.find(p=>p.id===State.preset) || PRESETS[0];
  rows = rows.filter(s=>
    (State.mkt==="ALL"||s.mkt===State.mkt) &&
    (State.capTier==="ALL"||capTierOf(s)===State.capTier) &&
    (State.q===""||s.t.toLowerCase().includes(State.q.toLowerCase())||s.n.toLowerCase().includes(State.q.toLowerCase())) &&
    preset.test(s) && passesAdvancedFilters(s)
  );
  const dir = {health:-1,mcap:-1,revG:-1,fcfG:-1,mos:-1,roe:-1,pe:1}[State.sort] || -1;
  rows.sort((a,b)=>{
    const av = State.sort==="health"?a.healthScore:a[State.sort];
    const bv = State.sort==="health"?b.healthScore:b[State.sort];
    return ((av??-1e9)-(bv??-1e9))*dir;
  });
  return rows;
}

function clr(v){ return v==null?"#6b6b68":v>0?"var(--good)":"var(--warn)"; }

function globalSearchMatches(query, limit=7){
  const q = query.trim().toLowerCase();
  if(!q) return [];
  const starts = [], contains = [];
  State.data.forEach(s=>{
    const t = s.t.toLowerCase(), n = (s.n||"").toLowerCase();
    if(t.startsWith(q)) starts.push(s);
    else if(t.includes(q) || n.includes(q)) contains.push(s);
  });
  return [...starts, ...contains].slice(0, limit);
}

function renderHeader(){
  const matches = globalSearchMatches(State.q);
  return `
  <header class="app">
    <div class="headrow">
      <span class="brand" data-home style="cursor:pointer"><span class="dot">▮▮</span> TERMINAL</span>
      <div class="tabs">
        <button data-tab="stocks" class="${State.tab==='stocks'?'on':''}">Stocks</button>
        <button data-tab="workflow" class="${State.tab==='workflow'?'on':''}">Workflow</button>
        <button data-tab="portfolio" class="${State.tab==='portfolio'?'on':''}">Portfolio</button>
        <button data-tab="sectors" class="${State.tab==='sectors'?'on':''}">Sectors &amp; cycles</button>
        <button data-tab="compare" class="${State.tab==='compare'?'on':''}">Compare${State.compare.length?` (${State.compare.length})`:''}</button>
        <button data-tab="playbook" class="${State.tab==='playbook'?'on':''}">Playbook</button>
        <button data-tab="learn" class="${State.tab==='learn'?'on':''}">Learn</button>
        <button data-tab="veteran" class="${State.tab==='veteran'?'on':''}">Veteran's Lens</button>
      </div>
      <div style="position:relative;flex:1;min-width:160px;max-width:260px">
        <input class="search" id="globalSearchBox" placeholder="Jump to any stock…" value="${State.q}" style="width:100%"/>
        ${matches.length?`
        <div style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--panel);border:1px solid var(--line);
          border-radius:8px;box-shadow:0 8px 24px rgba(20,20,18,.12);z-index:50;overflow:hidden;max-height:320px;overflow-y:auto">
          ${matches.map(s=>`
            <div data-jumpto="${s.t}" style="padding:9px 12px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line)">
              <span><b style="font-size:13px">${s.t}</b> <span style="font-size:12px;color:var(--dim)">${s.n}</span></span>
              <span style="font-size:11px;color:var(--dim);flex-shrink:0">${s.mkt==="US"?"S&P":"Nifty"}</span>
            </div>`).join("")}
        </div>`:""}
      </div>
      <button class="watchbtn" id="watchToggle">★ Watchlist (${State.watchlist.length})</button>
      <span class="livebadge ${State.live?'live':'sample'}">${State.live?'● LIVE · YAHOO':'● SAMPLE DATA'} · ${State.data.length} names</span>
    </div>
  </header>`;
}

function renderPresets(){
  return `<div class="presets">${PRESETS.map(p=>`
    <button class="preset ${State.preset===p.id?'on':''}" data-preset="${p.id}">
      ${p.label}${p.n?`<span class="n">${p.n}</span>`:''}
    </button>`).join("")}</div>`;
}

function renderFilterRow(){
  const sectors = distinctSectors();
  const F = State.filters;
  const activeCount = (F.sectors.length>0?1:0) +
    ["revG","fcfG","pe","mos","health","mcap"].filter(k=>F[k].min!=null||F[k].max!=null).length;
  const numFilters = [
    ["revG","Rev YoY %","-50","200"],["fcfG","FCF YoY %","-50","200"],
    ["pe","P/E","0","100"],["mos","DCF gap %","-100","100"],
    ["health","Score","0","100"],["mcap","Mkt cap","0",""],
  ];
  return `
  <div class="panel" style="margin-bottom:16px;padding:0">
    <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer" data-filterstoggle>
      <span style="font-weight:700;font-size:13.5px">${State.filtersOpen?"▾":"▸"} Filters${activeCount>0?` <span class="pill good" style="margin-left:6px">${activeCount} active</span>`:""}</span>
      ${activeCount>0?`<button class="preset" data-clearfilters style="padding:4px 10px;font-size:12px">Clear all</button>`:""}
    </div>
    ${State.filtersOpen?`
    <div style="padding:0 16px 16px;border-top:1px solid var(--line)">
      <div style="margin-top:14px;margin-bottom:6px;font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.4px">Sector (select any)</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
        ${sectors.map(sec=>`<button class="preset ${F.sectors.includes(sec)?'on':''}" data-sectorchip="${sec}" style="padding:5px 11px;font-size:12.5px">${sec}</button>`).join("")}
      </div>
      <div style="margin-bottom:6px;font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.4px">Numeric ranges (leave blank = no limit)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px">
        ${numFilters.map(([k,label,phMin,phMax])=>`
          <div>
            <div style="font-size:12px;color:#444;margin-bottom:4px">${label}</div>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" data-numfilter="${k}" data-bound="min" placeholder="${phMin}" value="${F[k].min??''}"
                style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:12.5px"/>
              <span style="color:var(--dim);font-size:11px">to</span>
              <input type="number" data-numfilter="${k}" data-bound="max" placeholder="${phMax}" value="${F[k].max??''}"
                style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:12.5px"/>
            </div>
          </div>`).join("")}
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:12px;color:#444">Combine filters with:</span>
        <div class="seg">
          <button data-filterlogic="AND" class="${State.filterLogic==='AND'?'on':''}">Match ALL (AND)</button>
          <button data-filterlogic="OR" class="${State.filterLogic==='OR'?'on':''}">Match ANY (OR)</button>
        </div>
      </div>
      <p style="font-size:11px;color:var(--dim);margin:10px 0 0;line-height:1.5">Sector selections always combine with each other as OR (pick any of several sectors). The AND/OR toggle governs how sector + numeric-range filters combine with one another. Market, cap-size, search, and preset filters above always apply as AND regardless of this setting.</p>
    </div>`:""}
  </div>`;
}

function renderScreener(){
  const rows = filteredRows();
  const cols=[["t","Ticker"],["mcap","Mkt cap"],["price","Price"],["revG","Rev YoY"],
    ["fcfG","FCF YoY"],["pe","P/E"],["mos","DCF gap"],["health","Score"]];
  return `
  ${renderPresets()}
  <div class="toolbar">
    <div class="seg">
      ${["ALL","US","IN"].map(m=>`<button data-mkt="${m}" class="${State.mkt===m?'on':''}">${m==="US"?"S&P 500":m==="IN"?"Nifty":"All markets"}</button>`).join("")}
    </div>
    <div class="seg">
      ${[["ALL","All sizes"],["mega","Mega cap"],["large","Large cap"],["mid","Mid cap"]].map(([k,l])=>`<button data-cap="${k}" class="${State.capTier===k?'on':''}">${l}</button>`).join("")}
    </div>
    </div>
  ${renderFilterRow()}
  <div style="overflow-x:auto">
  <table class="grid">
    <thead><tr>
      <th></th>
      <th></th>
      ${cols.map(([k,l])=>`<th class="${k==='t'?'left':''}" data-sort="${k}" style="${State.sort===k?'color:var(--accent)':''}">${l}</th>`).join("")}
      <th>5Q trend</th>
    </tr></thead>
    <tbody>
      ${rows.length===0?`<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--dim)">No stocks match these filters. Try a broader preset.</td></tr>`:
      rows.map(s=>`
        <tr class="row" data-open="${s.t}">
          <td><span class="star ${State.watchlist.includes(s.t)?'on':''}" data-star="${s.t}">★</span></td>
          <td><span class="cmpbox ${State.compare.includes(s.t)?'on':''}" data-cmp="${s.t}" title="Add to compare">${State.compare.includes(s.t)?'✓':'+'}</span></td>
          <td class="left"><span class="tname">${s.t}</span><span class="tsub">${s.n}</span></td>
          <td>${fmtB(s.mcap,s.mkt)}</td>
          <td>${fmtP(s.price,s.mkt)}</td>
          <td style="color:${clr(s.revG)}">${sign(s.revG)}</td>
          <td style="color:${clr(s.fcfG)}">${sign(s.fcfG)}</td>
          <td>${s.pe==null?"—":s.pe.toFixed(0)}</td>
          <td style="color:${clr(s.mos)}">${sign(s.mos)}</td>
          <td><span class="pill ${s.verdict.l==='Constructive'?'good':s.verdict.l==='Caution'?'warn':'neutral'}">${s.healthScore}</span></td>
          <td>${svgSpark((s.quarterly.revenue||[]).slice(0,5))}</td>
        </tr>`).join("")}
    </tbody>
  </table>
  </div>
  <p class="hint">Showing ${rows.length} of ${State.data.length} stocks. Click any row for the full tearsheet. Score is the Decision Engine quality composite (growth 20% · profitability 20% · cash quality 25% · balance sheet 15% · returns 20%) — the same number the quadrant uses, so the table and the tearsheet can never disagree.</p>
  `;
}

function renderTearsheet(t){
  const rows = computeRows();
  const s = rows.find(r=>r.t===t);
  if(!s) { State.sel=null; return renderScreener(); }
  const isQ = State.view==="quarterly";
  const P = isQ ? s.quarterly : s.annual;
  const A = s.annual;
  const periods = P.periods;

  const coreKpis = [
    ["Market cap", fmtB(s.mcap,s.mkt)], ["DCF intrinsic", fmtP(s.intrinsic,s.mkt)],
    ["Free cash flow", fmtB(A.fcf[0],s.mkt)], ["Net margin", s.nmNow==null?"—":s.nmNow.toFixed(1)+"%"],
    ["FCF / Net income", s.fcfNi==null?"—":s.fcfNi.toFixed(2)], ["ROE", s.roe==null?"—":s.roe.toFixed(0)+"%"],
  ];
  const extraKpis = [
    ["Enterprise value", fmtB(s.ev,s.mkt)], ["Revenue (TTM)", fmtB(A.revenue[0],s.mkt)],
    ["EBITDA", fmtB(A.ebitda[0],s.mkt)], ["Net income", fmtB(A.netIncome[0],s.mkt)],
    ["Rev CAGR 3y", sign(s.revCagr)], ["FCF CAGR 3y", sign(s.fcfCagr)],
    ["Net debt", fmtB(s.debt,s.mkt)], ["FCF yield", s.fcfYield==null?"—":s.fcfYield.toFixed(1)+"%"],
    ["P/E", s.pe==null?"—":s.pe.toFixed(1)], ["EV/EBITDA", s.evEbitda==null?"—":s.evEbitda.toFixed(1)],
    ["PEG", s.peg==null?"—":s.peg.toFixed(2)], ["Net debt/EBITDA", s.debtToEbitda==null?(s.debt<0?"net cash":"—"):s.debtToEbitda.toFixed(1)+"×"],
    [s.mkt==="IN"?"Promoter holding":"Insider ownership", s.insiderPct==null?"—":s.insiderPct.toFixed(1)+"%"+(s.insiderTrend!=null?(s.insiderTrend>0?" ▲":" ▼"):"")],
  ];

  return `
  <button class="backbtn" id="backBtn">← All stocks</button>
  <button class="backbtn backbtn-float" id="backBtnFloat" style="position:fixed;left:14px;top:64px;z-index:45;margin:0" title="Back to ${State.returnTab&&State.returnTab!=="stocks"?State.returnTab:"stock list"}">← Back</button>

  <div class="tshead">
    <div>
      <div class="tsticker">${s.t}<span class="tsmkt">${s.mkt==="US"?"NYSE/NASDAQ":"NSE"}</span></div>
      <div class="tsname">${s.n}</div>
      <div class="tssec">${s.sec}${s.ind?` · ${s.ind}`:""}</div>
    </div>
    <div class="tspricebox">
      <div class="tsprice">${fmtP(s.price,s.mkt)}</div>
      <div class="tsrange">52wk ${fmtP(s.low52,s.mkt)} — ${fmtP(s.high52,s.mkt)}</div>
      ${s.pricePos!=null?`<div class="rangebar"><div class="rangefill" style="width:${s.pricePos}%"></div></div>`:""}
    </div>
    <div class="tsverdict" style="border-color:${s.verdict.c}">
      <span class="l" style="color:${s.verdict.c}">${s.verdict.l.toUpperCase()}</span>
      <span class="sub">${s.flags.filter(f=>f.s==="good").length} positive · ${s.flags.filter(f=>f.s==="warn").length} caution</span>
    </div>
    <span class="star ${State.watchlist.includes(s.t)?'on':''}" data-star="${s.t}" style="font-size:24px;align-self:center">★</span>
    <button class="watchbtn" data-cmp="${s.t}" style="align-self:center">${State.compare.includes(s.t)?'✓ In compare':'+ Add to compare'}</button>
  </div>

  ${renderPriceChart(s)}
  <div class="takeaway">${takeaway(s)}</div>
  ${renderDataIntegrity(s)}
  ${renderDecisionEngine(s)}
  ${renderIntegratedVerdict(s, rows)}

  <div class="kpiCore">
    ${coreKpis.map(([l,v])=>`<div class="kpi"><div class="kpiV">${v}</div><div class="kpiL">${l}</div></div>`).join("")}
  </div>
  <button class="showmore" id="kpiToggle">${State.kpiExpanded?"− Show fewer metrics":"+ Show all metrics"}</button>
  <div class="kpiCore kpiExtra ${State.kpiExpanded?'show':''}">
    ${extraKpis.map(([l,v])=>`<div class="kpi"><div class="kpiV">${v}</div><div class="kpiL">${l}</div></div>`).join("")}
  </div>

  <div class="panelgrid" style="margin-top:14px">
    ${renderMacroPanel(s)}
    ${renderValuationPanel(s, rows)}
    ${renderForensicPanel(s)}
    ${renderAnalystPanel(s)}
  </div>

  ${renderAIChat(s)}
  ${renderAskClaude(s)}
  ${renderEarningsSentiment(s)}
  ${renderTrackRecord(s)}

  <div class="viewtoggle">
    <button data-view="annual" class="${!isQ?'on':''}">Annual</button>
    <button data-view="quarterly" class="${isQ?'on':''}">Quarterly (QoQ)</button>
  </div>

  <div class="panelgrid">
    <div class="panel"><div class="panelhead"><span class="panelt">Revenue</span><span class="panels">${isQ?`QoQ ${sign(qoq(P.revenue))}`:`YoY ${sign(yoy(P.revenue))}`}</span></div>${svgBarChart(P.revenue,periods,"#0e6e5c")}</div>
    <div class="panel"><div class="panelhead"><span class="panelt">EBITDA</span><span class="panels">${isQ?`QoQ ${sign(qoq(P.ebitda))}`:`YoY ${sign(yoy(P.ebitda))}`}</span></div>${svgBarChart(P.ebitda,periods,"#6d5dd3")}</div>
    <div class="panel"><div class="panelhead"><span class="panelt">Net income</span><span class="panels">${isQ?`QoQ ${sign(qoq(P.netIncome))}`:`YoY ${sign(yoy(P.netIncome))}`}</span></div>${svgBarChart(P.netIncome,periods,"#1a8a63")}</div>
    <div class="panel"><div class="panelhead"><span class="panelt">Free cash flow</span><span class="panels">${isQ?`QoQ ${sign(qoq(P.fcf))}`:`YoY ${sign(yoy(P.fcf))}`}</span></div>${svgBarChart(P.fcf,periods,"#2aa37c")}</div>

    <div class="panel wide">
      <div class="panelhead"><span class="panelt">Margin ladder</span><span class="panels">Operating · EBITDA · Net · FCF</span></div>
      ${svgLineChart([
        {color:"#0e6e5c",data:P.margins.map(m=>m.operating)},
        {color:"#6d5dd3",data:P.margins.map(m=>m.ebitda)},
        {color:"#1a8a63",data:P.margins.map(m=>m.net)},
        {color:"#2aa37c",data:P.margins.map(m=>m.fcf)},
      ],periods)}
      <div class="legend">
        <span class="legitem"><i style="background:#0e6e5c"></i>Operating</span>
        <span class="legitem"><i style="background:#6d5dd3"></i>EBITDA</span>
        <span class="legitem"><i style="background:#1a8a63"></i>Net</span>
        <span class="legitem"><i style="background:#2aa37c"></i>FCF</span>
      </div>
    </div>

    <div class="panel wide">
      <div class="panelhead"><span class="panelt">Revenue vs free cash flow</span><span class="panels">Do sales convert to cash?</span></div>
      ${svgLineChart([{color:"#0e6e5c",data:P.revenue},{color:"#2aa37c",data:P.fcf}],periods)}
      <div class="legend"><span class="legitem"><i style="background:#0e6e5c"></i>Revenue</span><span class="legitem"><i style="background:#2aa37c"></i>Free cash flow</span></div>
    </div>

    <div class="panel">
      <div class="panelhead"><span class="panelt">Valuation multiples</span></div>
      ${renderKV([["P/E (trailing)",s.pe?.toFixed(1)],["P/E (forward)",s.fpe?.toFixed(1)],["EV/EBITDA",s.evEbitda?.toFixed(1)],["Price/Sales",s.ps?.toFixed(1)],["Price/Book",s.pb?.toFixed(1)],["Div yield",s.divYield?s.divYield.toFixed(1)+"%":"—"]])}
    </div>
    <div class="panel">
      <div class="panelhead"><span class="panelt">Quality &amp; returns</span></div>
      ${renderKV([["Return on equity",s.roe?s.roe.toFixed(0)+"%":"—"],["Return on assets",s.roa?s.roa.toFixed(0)+"%":"—"],["ROIC",s.roic!=null?s.roic.toFixed(1)+"%":"—"],["Interest coverage",s.interestCoverage!=null?s.interestCoverage.toFixed(1)+"×":"—"],["Current ratio",s.currentRatio!=null?s.currentRatio.toFixed(2):"—"],["Quick ratio",s.quickRatio!=null?s.quickRatio.toFixed(2):"—"],["Gross margin 3Y Δ",s.grossMarginTrend3y!=null?(s.grossMarginTrend3y>0?"+":"")+s.grossMarginTrend3y.toFixed(1)+"pts":"—"],["Net debt/equity",s.netDebtToEquity!=null?s.netDebtToEquity+"%":"—"],["Dividend payout",s.divPayout!=null?s.divPayout+"%":"—"],["FCF/Net income",s.fcfNi?s.fcfNi.toFixed(2):"—"],["Net debt/Mkt cap",(!s.mcap||s.mcap<=0)?"—":(s.debt/s.mcap*100).toFixed(0)+"%"],["Beta",s.beta!=null?s.beta.toFixed(2):"—"],["FCF margin",A.margins[0]?.fcf!=null?A.margins[0].fcf.toFixed(1)+"%":"—"]])}
    </div>

    <div class="panel">
      <div class="panelhead"><span class="panelt">DCF intrinsic value</span><span class="panels">${State.discount}% disc · ${State.termGrowth}% terminal</span></div>
      <div class="dcfbox">
        <div><div class="kpiL">Intrinsic/share</div><div class="dcfval" style="color:${s.verdict.c}">${fmtP(s.intrinsic,s.mkt)}</div></div>
        <div><div class="kpiL">Market price</div><div class="dcfval">${fmtP(s.price,s.mkt)}</div></div>
        <div><div class="kpiL">Gap</div><div class="dcfval" style="color:${clr(s.mos)}">${sign(s.mos)}</div></div>
      </div>
      <p class="hint" style="margin:6px 0 2px">Starting growth: <b>${s.g?.toFixed(1)}%</b> — ${s.gSource || "default assumption — run fetch_estimates.py to use real analyst consensus"}. This is the single most important input to this valuation.</p>
      <div class="dcfsliders">
        <label>Discount ${State.discount}%</label><input type="range" min="6" max="16" value="${State.discount}" id="discountSlider"/>
        <label>Terminal ${State.termGrowth}%</label><input type="range" min="1" max="5" value="${State.termGrowth}" id="termSlider"/>
      </div>
    </div>
    <div class="panel">
      <div class="panelhead"><span class="panelt">Efficiency &amp; risk</span></div>
      ${renderKV([["FCF yield",s.fcfYield?s.fcfYield.toFixed(1)+"%":"—"],["Earnings yield",s.earnYield?s.earnYield.toFixed(1)+"%":"—"],["PEG ratio",s.peg?s.peg.toFixed(2)+(s.pegSource==="ni"?" (NI est.)":""):"—"],["Rule of 40",s.ruleOf40!=null?s.ruleOf40.toFixed(0)+(s.ruleOf40>=40?" ✓ passes":" ✗ fails"):"—"],["Net debt/EBITDA",s.debtToEbitda?s.debtToEbitda.toFixed(1)+"×":(s.debt<0?"net cash":"—")],["Capex intensity",s.capexIntensity?s.capexIntensity.toFixed(1)+"%":"—"],["Rev growth Δ",s.revDecel!=null?sign(s.revDecel)+" pts":s.revRecovery?"↑ recovering":"—"],["EV/FCF",s.evFcf?s.evFcf.toFixed(1)+"×":"—"],["EV/EBITDA (annual)",s.evEbitdaCalc?s.evEbitdaCalc.toFixed(1)+"×":(s.evEbitda?s.evEbitda.toFixed(1)+"× (Yahoo TTM)":"—")]])}
    </div>
  </div>

  ${renderSignalMatrix(s)}
  ${renderSources(s)}
  `;
}
function renderKV(rows){
  return `<div class="kv">${rows.map(([k,v])=>`<div class="kvrow"><span class="kvk">${k}</span><span class="kvv">${v??"—"}</span></div>`).join("")}</div>`;
}

function renderSignalMatrix(s){
  const dirs=[
    ["Price (52wk pos)",s.pricePos,v=>v>50],["Revenue YoY",s.revG,v=>v>0],
    ["EBITDA YoY",s.ebitdaG,v=>v>0],["Net income YoY",s.niG,v=>v>0],
    ["Free cash flow YoY",s.fcfG,v=>v>0],["Net margin trend",s.marginTrend,v=>v>0],
    ["Cash conversion",s.fcfNi==null?null:(s.fcfNi-1)*100,v=>v>=-20],
  ];
  const cats={};
  s.flags.forEach((f,i)=>{(cats[f.cat]=cats[f.cat]||[]).push({...f,i});});
  return `
  <div class="matrix">
    <div class="matrixhead">SIGNAL MATRIX · direction of each driver
      <button class="learntoggle" id="learnToggle">${State.learnMode?"Learn mode: ON":"Learn mode: OFF"}</button>
    </div>
    <div class="matrixgrid">
      ${dirs.map(([l,v,ok])=>{const good=v!=null&&ok(v);
        return `<div class="matrixcell"><span>${l}</span><span class="matrixarrow" style="color:${v==null?'#999':good?'var(--good)':'var(--warn)'}">${v==null?"—":good?"▲":"▼"}</span></div>`;
      }).join("")}
    </div>
    ${s.flags.length===0?`<p style="padding:16px 18px;color:var(--dim);font-size:13px">No strong signal combinations triggered — readings are neutral.</p>`:
    Object.entries(cats).map(([cat,flags])=>`
      <div class="catlabel">${cat}</div>
      ${flags.map(f=>`
        <div class="flag ${f.s}">
          <div class="flagtop" data-flagtoggle="${f.i}">
            <span class="flagtag ${f.s}">${f.tag}</span>
            <span class="flagtxt">${f.txt}</span>
          </div>
          <div class="flagdetail" style="display:${State.learnMode?'flex':'none'}" data-flagdetail="${f.i}">
            <div><span class="flagseclbl">WHY IT MATTERS</span><p class="flagsectxt">${f.why}</p></div>
            <div><span class="flagseclbl">HOW TO READ IT</span><p class="flagsectxt">${f.how}</p></div>
          </div>
        </div>`).join("")}
    `).join("")}
  </div>`;
}

function renderSources(s){
  const enc = encodeURIComponent;
  const isUS = s.mkt==="US";
  const ySym = isUS ? s.t : `${s.t}.NS`;
  const links = isUS ? [
    ["Morningstar quote", `https://www.morningstar.com/stocks/xnas/${s.t.toLowerCase()}/quote`, "Free quote page · star rating & fair value"],
    ["SEC EDGAR filings", `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${enc(s.n)}&type=10-K`, "Primary 10-K / 10-Q filings"],
    ["Yahoo Finance", `https://finance.yahoo.com/quote/${ySym}`, "Financials, statistics, estimates"],
    ["Investor relations", `https://www.google.com/search?q=${enc(s.n+" investor relations")}`, "Annual reports, earnings decks"],
    ["Earnings call transcript", `https://www.google.com/search?q=${enc(s.n+" latest earnings call transcript")}`, "Management's own words"],
  ] : [
    ["Morningstar India", `https://www.morningstar.in/stocks/${enc(s.t)}/overview.aspx`, "Free quote & summary"],
    ["Screener.in", `https://www.screener.in/company/${s.t}/`, "Best free Indian fundamentals"],
    ["NSE filings", `https://www.nseindia.com/get-quotes/equity?symbol=${enc(s.t)}`, "Primary exchange filings"],
    ["Yahoo Finance", `https://finance.yahoo.com/quote/${ySym}`, "Financials & estimates"],
    ["Investor relations", `https://www.google.com/search?q=${enc(s.n+" investor relations annual report")}`, "Annual reports & decks"],
  ];
  return `
  <div class="sources">
    <div class="sourceshead">↗ Primary sources &amp; deeper research</div>
    <div class="sourcesgrid">
      ${links.map(([l,u,d])=>`<a class="sourcecard" href="${u}" target="_blank" rel="noopener noreferrer"><span class="sourcelabel">${l}</span><span class="sourcedesc">${d}</span></a>`).join("")}
    </div>
  </div>`;
}

function buildPrompt(s, depth){
  const A=s.annual;
  const data={ticker:s.t,name:s.n,market:s.mkt,sector:s.sec,price:s.price,intrinsicDCF:s.intrinsic,
    dcfGapPct:s.mos,marketCap:s.mcap,netDebt:s.debt,pe:s.pe,evEbitda:s.evEbitda,roe:s.roe,
    fcfToNetIncome:s.fcfNi, revenueCAGR3y:s.revCagr, fcfCAGR3y:s.fcfCagr,
    annualRevenue:A.revenue, annualEBITDA:A.ebitda, annualNetIncome:A.netIncome, annualFCF:A.fcf,
    annualMargins:A.margins, triggeredSignals:s.flags.map(f=>`[${f.cat}] ${f.tag}: ${f.txt}`)};
  const sections = depth==="full"
    ? "1. BUSINESS MODEL\n2. ECONOMIC MOAT (None/Narrow/Wide + trend)\n3. GROWTH ANALYSIS\n4. PROFITABILITY & RETURNS\n5. CASH FLOW & CAPITAL ALLOCATION\n6. BALANCE SHEET & RISK\n7. FAIR VALUE (triangulate using DCF + multiples)\n8. BULL CASE\n9. BEAR CASE\n10. VERDICT"
    : "1. SNAPSHOT\n2. MOAT (None/Narrow/Wide, one sentence)\n3. FAIR VALUE (undervalued/fair/overvalued, vs DCF)\n4. BULL CASE\n5. BEAR CASE\n6. VERDICT";
  return `You are a senior equity analyst writing an independent research brief for a non-expert investor. Use ONLY the data below — do not invent facts you can't derive from it. Use these exact section headers in CAPS:\n\n${sections}\n\n${depth==="full"?"450-650 words.":"200-300 words."} Data:\n${JSON.stringify(data)}`;
}

/* ---------- EDGAR transcript store (loaded once at startup) ---------- */
let EDGAR_DATA = {};  // ticker → {quarters:[{date,text,key_sections,url},...]}
fetch("edgar_transcripts.json").then(r=>r.ok?r.json():Promise.reject())
  .then(d=>{
    if(Array.isArray(d)) d.forEach(rec=>{ if(rec.ticker) EDGAR_DATA[rec.ticker]=rec; });
    console.log("EDGAR: loaded",Object.keys(EDGAR_DATA).length,"companies");
  }).catch(()=>{});  // silently fine if file doesn't exist yet

function getEdgarText(ticker){
  const rec = EDGAR_DATA[ticker];
  if(!rec || !rec.quarters || !rec.quarters.length) return null;
  return rec.quarters.map(q=>
    `[${q.date}]\n${q.key_sections||q.text||""}`
  ).join("\n\n---NEXT CALL---\n\n");
}

function buildEarningsPrompt(s, transcriptText){
  const data={ticker:s.t,name:s.n,sector:s.sec,
    recentRevenueYoY:s.revG, recentFcfYoY:s.fcfG, recentMarginTrend:s.marginTrend,
    triggeredSignals:s.flags.map(f=>`[${f.cat}] ${f.tag}`)};
  return `You are an equity analyst scoring management tone from an earnings call transcript. Read the transcript below and score it on these exact dimensions, each with a one-line justification quoting or closely paraphrasing the transcript (keep any quotes under 15 words):

TONE SCORE: rate -2 (very cautious/defensive) to +2 (very confident/bullish), with reasoning
GUIDANCE LANGUAGE: did management raise, maintain, lower, or avoid giving forward guidance? Quote the key phrase.
HEDGING & DEFLECTION: count notable instances of hedging language ("uncertain," "challenging," "headwinds," evasive answers to analyst questions) vs confident, specific language
ANALYST Q&A TENSION: did analysts push back or express skepticism? How did management respond?
COMPARED TO FUNDAMENTALS: this company's recent numbers show revenue YoY of ${s.revG!=null?s.revG.toFixed(1)+'%':'unavailable'} and FCF YoY of ${s.fcfG!=null?s.fcfG.toFixed(1)+'%':'unavailable'}. Does management's tone match the numbers, sound more optimistic than the numbers justify, or more cautious than the numbers justify? This mismatch (if any) is the most useful signal — flag it clearly.
OVERALL SENTIMENT: Bullish / Neutral / Cautious / Bearish, one paragraph summary.

If I paste multiple transcripts (separated by "---NEXT CALL---"), score each one separately using the same format, then add a final TREND ACROSS CALLS section describing whether management tone is improving, stable, or deteriorating quarter over quarter.

Company: ${JSON.stringify(data)}

TRANSCRIPT(S):
${transcriptText || "[paste the earnings call transcript here before sending — search \"" + s.n + " earnings call transcript\" to find the latest one, e.g. on Motley Fool, Seeking Alpha (free transcripts), or the company's own IR site]"}`;
}

function renderEarningsSentiment(s){
  const edgarRec = EDGAR_DATA[s.t];
  const hasEdgar = edgarRec && edgarRec.quarters && edgarRec.quarters.length > 0;
  const edgarStatus = hasEdgar
    ? `<span style="color:var(--good);font-size:12px">✓ ${edgarRec.quarters.length} quarters of EDGAR filings loaded automatically</span>`
    : s.mkt==="IN"
      ? `<span style="color:var(--dim);font-size:12px">Indian stocks are not on SEC EDGAR. Find concall transcripts on <a href="https://www.screener.in/company/${s.t}/" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">Screener.in</a> or <a href="https://www.bseindia.com/stock-share-price/${s.t}/" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">BSE India</a> and paste below.</span>`
      : `<span style="color:var(--neutral);font-size:12px">Run <code>python fetch_edgar.py</code> locally to auto-populate this — or paste a transcript manually below.</span>`;
  return `
  <div class="askbox" style="background:linear-gradient(135deg,#f3eefc,#ece4fa);border-color:#d8c8f2">
    <div class="askhead">
      <div>
        <div class="asktitle" style="color:#6d3dd3">◆ Earnings call sentiment</div>
        <div class="asksub">Analyzes the tone, guidance language, and management confidence from official earnings filings. Compares management's words against ${s.t}'s actual numbers — the mismatch is the real signal.</div>
      </div>
    </div>
    <div style="margin:10px 0 6px">${edgarStatus}</div>
    ${hasEdgar ? `
    <div style="font-size:12px;color:var(--dim);margin-bottom:8px">
      Quarters: ${edgarRec.quarters.map(q=>`<a href="${q.url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);margin-right:8px">${q.date}</a>`).join("")}
    </div>` : ""}
    <textarea id="transcriptBox" placeholder="${hasEdgar
      ? "EDGAR text loaded above — edit or add the Q&A section if you have it, then analyze."
      : "Paste earnings call transcript(s) here (separate multiple with ---NEXT CALL--- to track sentiment trend)…"
    }" style="width:100%;min-height:${hasEdgar?'60px':'90px'};margin:6px 0;padding:10px 12px;border:1px solid var(--line);border-radius:7px;font-family:var(--sans);font-size:13px;box-sizing:border-box;resize:vertical"></textarea>
    <div class="askbtns">
      <button class="askbtn" style="background:#6d3dd3" data-earnings="${s.t}">Analyze sentiment →</button>
      ${hasEdgar?`<button class="askbtn secondary" style="border-color:#6d3dd3;color:#6d3dd3" data-edgarfill="${s.t}">Load EDGAR text into box</button>`:""}
    </div>
    <div class="askdone" id="earningsDone">✓ Prompt copied — claude.ai opened in a new tab. Paste (Ctrl/Cmd+V) and press enter.</div>
  </div>`;
}

/* ============================================================
   LIVE AI RESEARCH CHAT — per-stock, powered by Google Gemini.
   The API key is entered once in the panel below and stored ONLY
   in this browser's localStorage ("terminal_gemini_key") — it is
   never sent anywhere except directly to Google's API endpoint.
   Get a free key at https://aistudio.google.com/apikey
   ============================================================ */
function getGeminiKey(){ try{ return localStorage.getItem("terminal_gemini_key")||""; }catch(e){ return ""; } }
function setGeminiKey(k){ try{ if(k) localStorage.setItem("terminal_gemini_key",k); else localStorage.removeItem("terminal_gemini_key"); }catch(e){} }

function aiFmt(text){
  // minimal safe formatting: escape HTML, then **bold** and line breaks
  const esc = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/^[*-] /gm,"• ").replace(/\n/g,"<br>");
}

function renderAIChat(s){
  if(State.aiChat.t!==s.t) State.aiChat={t:s.t, msgs:[], busy:false, error:null};
  const key = getGeminiKey();
  const C = State.aiChat;
  const chips = ["Latest news and quarterly results","Any recent red flags, regulator or auditor issues?","What are analysts saying about it right now?","Explain this company's business model simply"];
  const keyUI = (!key || State.aiKeyEdit) ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0">
      <input id="aiKeyInput" type="password" placeholder="Paste your Google AI (Gemini) API key…" value="${key}"
        style="flex:1;min-width:220px;padding:8px 10px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--ink);font-size:13px"/>
      <button class="askbtn" data-aikeysave>Save key</button>
    </div>
    <p style="font-size:12px;color:var(--dim);margin:0 0 8px;line-height:1.5">Free key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">aistudio.google.com/apikey</a>. Stored only in this browser's localStorage — sent nowhere except Google's API. With Search grounding, answers include live web information.</p>`
  : `<p style="font-size:12px;color:var(--good);margin:6px 0 8px">✓ Gemini key saved in this browser <span data-aikeyedit style="color:var(--accent);cursor:pointer;margin-left:8px">change / remove</span></p>`;
  return `
  <div class="askbox" style="background:linear-gradient(135deg,#e8f4f0,#ddeee8);border-color:#bcd9cf">
    <div class="askhead"><div>
      <div class="asktitle">⚡ Live research — ask anything about ${s.t}</div>
      <div class="asksub">Answers come live from Google's Gemini API (with Search grounding when available) combined with this terminal's own numbers for ${s.t}. Nothing here is investment advice.</div>
    </div></div>
    ${keyUI}
    ${key?`
    ${C.msgs.length?`<div id="aiChatMsgs" style="max-height:340px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:10px 12px;margin-bottom:8px">
      ${C.msgs.map(m=>`<div style="margin:6px 0;font-size:13.5px;line-height:1.6;${m.role==="user"?"font-weight:600":""}">
        <span style="color:${m.role==="user"?"var(--accent)":"#6d3dd3"};font-weight:700">${m.role==="user"?"You":"AI"}:</span> ${aiFmt(m.text)}</div>`).join("")}
      ${C.busy?`<div style="color:var(--dim);font-size:13px">… fetching live answer</div>`:""}
    </div>`:""}
    ${C.error?`<p style="font-size:12.5px;color:var(--warn);margin:4px 0">⚠ ${C.error}</p>`:""}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      ${chips.map(q=>`<button class="preset" data-aichip="${q.replace(/"/g,"&quot;")}" style="font-size:12px;padding:4px 10px" ${C.busy?"disabled":""}>${q}</button>`).join("")}
    </div>
    <div style="display:flex;gap:8px">
      <input id="aiChatInput" placeholder="e.g. did ${s.t} announce anything this month?" ${C.busy?"disabled":""}
        style="flex:1;padding:9px 12px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--ink);font-size:13.5px"/>
      <button class="askbtn" data-aisend ${C.busy?"disabled":""}>${C.busy?"…":"Send →"}</button>
    </div>`:""}
  </div>`;
}

/* Model discovery: Google retires model IDs (gemini-2.0-flash was retired
   2026-03 and now returns "limit: 0" quota errors), so never hard-code one.
   Ask the API which models THIS key can use, prefer the evergreen "-latest"
   flash aliases, and remember whichever one worked. */
let GEMINI_MODELS_CACHE = null;
async function geminiCandidateModels(key){
  const saved = (()=>{ try{ return localStorage.getItem("terminal_gemini_model"); }catch(e){ return null; } })();
  if(!GEMINI_MODELS_CACHE){
    let names = [];
    try{
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`);
      if(r.ok){ const j = await r.json();
        names = (j.models||[])
          .filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent"))
          .map(m=>(m.name||"").replace(/^models\//,""))
          .filter(n=>/flash/i.test(n) && !/(image|tts|audio|live|embed|thinking)/i.test(n));
      }
    }catch(e){}
    const pref = ["gemini-flash-latest","gemini-flash-lite-latest"];
    GEMINI_MODELS_CACHE = [...new Set([
      ...pref.filter(p=>names.includes(p)),
      ...names.sort().reverse(),                      // newest version numbers first
      "gemini-flash-latest","gemini-2.5-flash","gemini-2.5-flash-lite",  // fallback guesses if listing failed
    ])];
  }
  return [...new Set([...(saved?[saved]:[]), ...GEMINI_MODELS_CACHE])].slice(0,6);
}

async function sendAIMessage(t, text){
  const key=getGeminiKey();
  if(!key || !text || !text.trim() || State.aiChat.busy) return;
  if(State.aiChat.t!==t) State.aiChat={t, msgs:[], busy:false, error:null};
  State.aiChat.msgs.push({role:"user", text:text.trim()});
  State.aiChat.busy=true; State.aiChat.error=null; render();
  const s = computeRows().find(r=>r.t===t);
  const snap = s?{price:s.price, mktCap:s.mcap, pe:s.pe, revYoY:s.revG, fcfYoY:s.fcfG, roe:s.roe, dcfGapPct:s.mos, sector:s.sec}:{};
  const sys = `You are an equity research assistant inside a stock terminal. The user is viewing ${t}${s?` (${s.n})`:""}, listed in ${s?.mkt==="IN"?"India (NSE)":"the US"}. Terminal snapshot (may lag live data): ${JSON.stringify(snap)}. Use web search for anything recent — news, results, corporate actions, analyst views — and state dates for time-sensitive facts. Be concise and factual. End nothing with disclaimers; the UI already shows one.`;
  const contents = State.aiChat.msgs.map(m=>({role:m.role==="user"?"user":"model", parts:[{text:m.text}]}));
  try{
    const models = await geminiCandidateModels(key);
    let lastErr = "No usable Gemini model found for this key — open aistudio.google.com to check which models your key can access.";
    let done = false;
    // Remember whether Search grounding works for this key — retrying it on
    // every message wastes free-tier quota (~10 requests/min).
    const toolsPref = (()=>{ try{ return localStorage.getItem("terminal_gemini_tools")!=="0"; }catch(e){ return true; } })();
    outer:
    for(const model of models){
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      for(const withTools of (toolsPref ? [true,false] : [false])){
        const body = {system_instruction:{parts:[{text:sys}]}, contents};
        if(withTools) body.tools = [{google_search:{}}];
        let r;
        try{ r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); }
        catch(err){ lastErr = err.message; continue outer; }
        if(r.ok){
          const j = await r.json();
          const out = (j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim();
          State.aiChat.msgs.push({role:"model", text: out||"(empty response — try rephrasing)"});
          try{ localStorage.setItem("terminal_gemini_model", model);
               localStorage.setItem("terminal_gemini_tools", withTools?"1":"0"); }catch(e){}
          done = true; break outer;
        }
        const eBody = await r.json().catch(()=>({}));
        const msg = eBody?.error?.message || `HTTP ${r.status}`;
        lastErr = `${model}: ${msg}`;
        // model retired or has zero quota on this key's tier -> try the next model
        if(r.status===404 || (r.status===429 && /limit:\s*0/.test(msg))){
          try{ localStorage.removeItem("terminal_gemini_model"); }catch(e){}
          continue outer;
        }
        // rate-limited WITH the search tool -> the grounding quota may be the
        // bottleneck; drop the tool and try once more before giving up
        if(r.status===429 && withTools){
          try{ localStorage.setItem("terminal_gemini_tools","0"); }catch(e){}
          continue;
        }
        // genuine rate limit -> tell the user how long to wait, don't burn more quota
        if(r.status===429){
          const m = msg.match(/retry in ([\d.]+)s/i);
          throw new Error(`Rate limit reached on ${model} — wait ~${m?Math.ceil(+m[1]):60}s, then resend (your question is kept in the box below). Free-tier keys allow roughly 10 requests/minute. Live-search grounding has been switched off to save quota; re-save your key to turn it back on.`);
        }
        // search-grounding tool rejected -> retry the same model without it
        if(withTools && (r.status===400 || /tool|search/i.test(msg))) continue;
        throw new Error(msg);
      }
    }
    if(!done) throw new Error(lastErr);
  }catch(e){
    State.aiChat.error = /API key/i.test(e.message) ? e.message+" — re-check the key (change/remove link above)." : e.message;
    State.aiChat.msgs.pop();   // put the question back in the input on failure
    State.aiChat.failedText = text;
  }
  State.aiChat.busy=false; render();
  const box=document.getElementById("aiChatMsgs"); if(box) box.scrollTop=box.scrollHeight;
  const inp=document.getElementById("aiChatInput");
  if(inp && State.aiChat.failedText){ inp.value=State.aiChat.failedText; State.aiChat.failedText=null; }
}

async function handleEarnings(ticker){
  const rows = computeRows();
  const s = rows.find(r=>r.t===ticker);
  if(!s) return;
  const box = document.getElementById("transcriptBox");
  let text = box ? box.value.trim() : "";
  // If box is empty, auto-inject EDGAR text
  if(!text){ const edgarText=getEdgarText(ticker); if(edgarText) text=edgarText; }
  const prompt = buildEarningsPrompt(s, text);
  try{ await navigator.clipboard.writeText(prompt); }
  catch(e){
    const ta=document.createElement("textarea"); ta.value=prompt; document.body.appendChild(ta);
    // Fix 4: execCommand("copy") deprecated — use async clipboard API with fallback
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(ta.value).catch(()=>{ ta.select(); document.execCommand("copy"); });
  } else { ta.select(); document.execCommand("copy"); }
  document.body.removeChild(ta);
  }
  window.open("https://claude.ai/new", "_blank");
  const done=document.getElementById("earningsDone");
  if(done) done.classList.add("show");
}

/* ============================================================
   INTEGRATED VERDICT — combines fundamentals + macro + valuation
   context into one synthesized read, with explicit caveats.
   This is the "so what" that ties every layer together instead
   of leaving you to mentally combine six separate panels.
   ============================================================ */
function renderIntegratedVerdict(s, allRows){
  const macro = macroRead(s, MACRO_DATA);
  const val = valuationContext(s, allRows, MACRO_DATA);

  const layers = [];
  // Layer 1: fundamentals (from signal engine)
  layers.push({
    label:"Fundamentals", verdict:s.verdict.l, color:s.verdict.c,
    detail:`${s.flags.filter(f=>f.s==="good").length} positive signals, ${s.flags.filter(f=>f.s==="warn").length} caution flags.`
  });
  // Layer 2: macro
  if(macro){
    layers.push({label:"Macro environment", verdict:macro.verdict.l, color:macro.verdict.c,
      detail: macro.notes.length ? macro.notes[0].txt : "No strong macro signal detected for this sector right now."});
  } else {
    layers.push({label:"Macro environment", verdict:"Not loaded", color:"#999",
      detail:"Run fetch_macro.py to activate live macro context (free, no API key)."});
  }
  // Layer 3: valuation in context
  if(val.peVsSector!=null){
    const cheap = val.peVsSector < -15, rich = val.peVsSector > 15;
    layers.push({label:"Valuation vs peers", verdict: cheap?"Cheap vs sector":rich?"Rich vs sector":"In line with sector",
      color: cheap?"#1a8a63":rich?"#c0392b":"#b8860b",
      detail:`P/E is ${Math.abs(val.peVsSector).toFixed(0)}% ${val.peVsSector<0?"below":"above"} the ${s.sec} sector median (${val.peerCount} peers compared).`});
  }

  // Overall synthesis: count how many layers agree
  const positive = layers.filter(l=>["Constructive","Macro tailwind","Cheap vs sector"].includes(l.verdict)).length;
  const negative = layers.filter(l=>["Caution","Macro headwind","Rich vs sector"].includes(l.verdict)).length;
  let overall, overallColor, overallCaveat;
  if(positive>=2 && negative===0){ overall="Multiple layers aligned positively"; overallColor="#1a8a63";
    overallCaveat="Fundamentals, macro, and valuation are pointing the same direction — the strongest setup, but still verify against the primary sources below before acting."; }
  else if(negative>=2 && positive===0){ overall="Multiple layers aligned negatively"; overallColor="#c0392b";
    overallCaveat="Fundamentals, macro, and valuation are pointing the same direction — worth understanding why before assuming it's a buying opportunity."; }
  else { overall="Layers disagree — mixed picture"; overallColor="#b8860b";
    overallCaveat="Fundamentals, macro, and valuation aren't telling the same story. This is common and not necessarily bad — it just means no single factor should drive the decision alone."; }

  return `
  <div class="matrix" style="margin-top:16px">
    <div class="matrixhead">INTEGRATED VERDICT · fundamentals + macro + valuation combined</div>
    <div style="padding:14px 18px">
      <div style="font-weight:800;font-size:15px;color:${overallColor};margin-bottom:6px">${overall}</div>
      <p style="font-size:12.5px;color:var(--dim);margin:0 0 14px;line-height:1.5">${overallCaveat}</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${layers.map(l=>`
          <div style="display:flex;align-items:baseline;gap:10px;padding:8px 0;border-top:1px solid var(--line)">
            <span style="font-size:11px;font-family:var(--mono);color:var(--dim);width:130px;flex-shrink:0">${l.label}</span>
            <span style="font-size:12.5px;font-weight:700;color:${l.color};width:150px;flex-shrink:0">${l.verdict}</span>
            <span style="font-size:12px;color:#444;line-height:1.45">${l.detail}</span>
          </div>`).join("")}
      </div>
    </div>
  </div>`;
}

/* ---------- macro context panel ---------- */
/* ---------- data integrity panel ---------- */
/* ---------- price chart: price + DCF line + earnings markers ---------- */
function renderPriceChart(s){
  const ph = PRICE_HISTORY[s.t];
  if(!ph || !ph.dates || ph.dates.length<2){
    return `<div class="panel" style="margin:14px 0">
      <div class="panelhead"><span class="panelt">Price history</span></div>
      <p style="font-size:12.5px;color:var(--dim);line-height:1.6">Not loaded yet. Run <code>python fetch_price_history.py</code> locally (free, no API key) to activate the price chart with DCF overlay and earnings markers for ${s.t}.</p>
    </div>`;
  }
  const edgarRec = EDGAR_DATA[s.t];
  const earningsDates = (edgarRec?.quarters||[]).map(q=>({date:q.date}));
  const chart = svgPriceChart(ph.dates, ph.closes, {
    height:220, intrinsic:s.intrinsic, low52:s.low52, high52:s.high52, earningsDates
  });
  if(!chart) return "";
  return `
  <div class="panel wide" style="margin:14px 0">
    <div class="panelhead">
      <span class="panelt">Price history (2yr, weekly)</span>
      <span class="panels">green = price · purple dashed = DCF intrinsic value · amber dots = earnings dates</span>
    </div>
    ${chart}
    <p style="font-size:10.5px;color:var(--dim);margin-top:8px;line-height:1.5">Shaded band marks the current 52-week range. Click an amber dot to jump to that quarter in the Earnings Track Record panel below. Weekly closes, free via Yahoo Finance — run <code>fetch_price_history.py</code> to keep this current.</p>
  </div>`;
}

function renderDataIntegrity(s){
  const D = dataIntegrityChecks(s, VERIFY_US, VERIFY_IN);
  if(D.checks.length===0) return "";  // nothing to say, don't clutter the page
  const warns = D.checks.filter(c=>c.sev==="warn");
  const infos = D.checks.filter(c=>c.sev==="info");
  const goods = D.checks.filter(c=>c.sev==="good");
  const badgeColor = D.warnCount>0 ? "#c0392b" : goods.length ? "#1a8a63" : "#b8860b";
  return `
  <div class="matrix" style="margin-top:16px;border-color:${badgeColor}">
    <div class="matrixhead" style="background:${badgeColor}10">
      DATA INTEGRITY · ${D.overall}${D.warnCount>0?` (${D.warnCount})`:""}
      <span style="font-size:11px;color:var(--dim);font-weight:400">cross-checked against independent sources where available</span>
    </div>
    <div style="padding:14px 18px;display:flex;flex-direction:column;gap:8px">
      ${[...warns,...infos,...goods].map(c=>`
        <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--line)">
          <span style="font-size:14px;flex-shrink:0">${c.sev==="warn"?"⚑":c.sev==="good"?"✓":"ℹ"}</span>
          <div>
            <b style="font-size:12.5px;color:${c.sev==="warn"?"#c0392b":c.sev==="good"?"#1a8a63":"#444"}">${c.label}</b>
            <p style="font-size:12px;color:#444;line-height:1.55;margin:4px 0 0">${c.detail}</p>
          </div>
        </div>`).join("")}
    </div>
    <p style="font-size:10.5px;color:var(--dim);padding:0 18px 14px;margin:0;line-height:1.5">Internal checks (market cap reconciliation, YoY jump detection, 52-week range plausibility) run automatically on every stock. External cross-checks — revenue, net income, total assets &amp; liabilities against SEC filings (US); current price and 52-week range against NSE's own quote and adjusted-range reports (India) — run only after <code>fetch_verify_us.py</code> / <code>fetch_verify_in.py</code> have been run. Not every field is verified against an outside source — see README for the exact scope.</p>
  </div>`;
}


function renderMacroPanel(s){
  const macro = macroRead(s, MACRO_DATA);
  if(!macro){
    return `<div class="panel"><div class="panelhead"><span class="panelt">Macro environment</span></div>
      <p style="font-size:12.5px;color:var(--dim);line-height:1.6">Not loaded yet. Run <code>python fetch_macro.py</code> locally (free, no API key) to activate live rates, crude, and currency context, applied automatically based on ${s.t}'s sector.</p></div>`;
  }
  const m = MACRO_DATA.series;
  const rows = [];
  if(m.us10y) rows.push(["10Y Treasury yield", `${m.us10y.current}%`, sign(m.us10y.chg90d)+" (90d)"]);
  if(m.crude) rows.push(["Crude oil (WTI)", `$${m.crude.current}`, sign(m.crude.chg90d)+" (90d)"]);
  if(s.mkt==="IN" && m.usdinr) rows.push(["USD/INR", `₹${m.usdinr.current}`, sign(m.usdinr.chg90d)+" (90d)"]);
  if(m.vix) rows.push(["VIX", m.vix.current, m.vix.current>25?"elevated fear":m.vix.current<15?"calm":"normal"]);
  return `
  <div class="panel">
    <div class="panelhead"><span class="panelt">Macro environment</span><span class="panels" style="color:${macro.verdict.c}">${macro.verdict.l}</span></div>
    <div class="kv">
      ${rows.map(([k,v,sub])=>`<div class="kvrow"><span class="kvk">${k}</span><span class="kvv">${v} <span style="font-weight:400;color:var(--dim);font-size:11px">${sub}</span></span></div>`).join("")}
    </div>
    ${macro.notes.length?`<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
      ${macro.notes.map(n=>`<p style="font-size:12px;line-height:1.5;margin:0;color:${n.dir==='tailwind'?'var(--good)':n.dir==='headwind'?'var(--warn)':'#444'}">${n.dir==='tailwind'?'▲':n.dir==='headwind'?'▼':'•'} ${n.txt}</p>`).join("")}
    </div>`:`<p style="font-size:12px;color:var(--dim);margin-top:10px">No strong macro signal for ${s.sec} right now.</p>`}
    <p style="font-size:10.5px;color:var(--dim);margin-top:10px;font-family:var(--mono)">As of ${macro.asOf}</p>
  </div>`;
}

/* ---------- valuation in context panel ---------- */
function renderValuationPanel(s, allRows){
  const val = valuationContext(s, allRows, MACRO_DATA);
  const ext = valuationExtras(s);
  return `
  <div class="panel">
    <div class="panelhead"><span class="panelt">Valuation in context</span><span class="panels">vs peers &amp; risk-free rate</span></div>
    <div class="kv">
      <div class="kvrow"><span class="kvk">P/E vs sector median</span><span class="kvv" style="color:${val.peVsSector==null?'inherit':val.peVsSector<-10?'var(--good)':val.peVsSector>10?'var(--warn)':'inherit'}">${val.peVsSector==null?"—":sign(val.peVsSector)}</span></div>
      <div class="kvrow"><span class="kvk">Sector median P/E</span><span class="kvv">${val.sectorMedianPE==null?"—":val.sectorMedianPE.toFixed(1)+"× ("+val.peerCount+" peers)"}</span></div>
      <div class="kvrow"><span class="kvk">FCF yield vs ${val.riskFreeLabel||"risk-free rate"}</span><span class="kvv" style="color:${val.fcfYieldSpread==null?'inherit':val.fcfYieldSpread>2?'var(--good)':val.fcfYieldSpread<0?'var(--warn)':'inherit'}">${val.fcfYieldSpread==null?"—":sign(val.fcfYieldSpread)+" pts"}${val.fcfYieldSpread==null&&val.riskFreeLabel==="India 10Y G-Sec"?" (India 10Y not loaded — run fetch_macro.py)":""}</span></div>
      <div class="kvrow"><span class="kvk">52-week range position</span><span class="kvv">${val.pricePos==null?"—":val.pricePos.toFixed(0)+"% (0=low, 100=high)"}</span></div>
      <div class="kvrow"><span class="kvk">Price / Tangible book</span><span class="kvv">${ext.priceToTangibleBook==null?"—":ext.priceToTangibleBook.toFixed(2)+"×"}</span></div>
      <div class="kvrow"><span class="kvk">LBO-implied price (~20% IRR)</span><span class="kvv" style="color:${ext.lboGapPct==null?'inherit':ext.lboGapPct>15?'var(--good)':ext.lboGapPct<-15?'var(--warn)':'inherit'}">${ext.lboImpliedPrice==null?"—":fmtP(ext.lboImpliedPrice,s.mkt)+" ("+sign(ext.lboGapPct)+")"}</span></div>
    </div>
    <p style="font-size:11.5px;color:var(--dim);margin-top:12px;line-height:1.5">FCF yield spread compares the cash return you're getting to the "safe" 10-year Treasury yield. Tangible book strips out goodwill/intangibles — what's left if you sold the hard assets. LBO-implied price is a rough estimate of what a financial buyer could pay today and still hit a 20% annual return in 5 years, assuming ~4.5x EBITDA debt paydown from free cash flow and an unchanged exit multiple — a simplified, directional read, not a real banker's model.</p>
  </div>`;
}

/* ---------- forensic scores panel ---------- */
function renderForensicPanel(s){
  const F = forensicScores(s);
  const row=(label,m,scoreTxt)=>`
    <div style="border-bottom:1px solid var(--line);padding:10px 0">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <b style="font-size:13px">${label}</b>
        <span style="font-weight:800;font-size:13px;color:${m.color||'var(--dim)'}">${scoreTxt}</span>
      </div>
      <p style="font-size:12px;color:#444;line-height:1.55;margin:5px 0 0">${m.read}</p>
    </div>`;
  return `
  <div class="panel">
    <div class="panelhead"><span class="panelt">Forensic scores</span><span class="panels">Altman Z · Piotroski F · Beneish M</span></div>
    ${row("Altman Z-Score (bankruptcy risk)", F.altman, F.altman.score==null?"—":F.altman.score+" · "+F.altman.zone)}
    ${row("Piotroski F-Score (fundamental trajectory)", F.piotroski, F.piotroski.score==null?"—":F.piotroski.score+"/"+F.piotroski.possible)}
    ${row("Beneish M-Score (manipulation risk)", F.beneish, F.beneish.score==null?"—":F.beneish.score+(F.beneish.flagged?" ⚑":""))}
    <p style="font-size:10.5px;color:var(--dim);margin-top:10px;line-height:1.5">Three public, academically-documented formulas computed from real balance sheet data (not approximated). None of these are predictions — they're statistical pattern-matches against historical distress/manipulation cases. Needs 2 years of balance sheet history; if a score shows "—", that history isn't available yet for this stock.</p>
  </div>`;
}

/* ---------- analyst outlook panel ---------- */
function renderAnalystPanel(s){
  const E = ESTIMATES_DATA[s.t];
  if(!E){
    return `<div class="panel"><div class="panelhead"><span class="panelt">Analyst outlook</span></div>
      <p style="font-size:12.5px;color:var(--dim);line-height:1.6">Not loaded yet. Run <code>python fetch_estimates.py</code> locally (free, no API key) to activate consensus growth estimates, revision trends, and price targets for ${s.t}.</p></div>`;
  }
  const revColor = v=>v==null?'inherit':v>2?'var(--good)':v<-2?'var(--warn)':'inherit';
  const targetGap = E.priceTargetMean!=null ? ((E.priceTargetMean-s.price)/s.price*100) : null;
  const totalRecs = (E.recStrongBuy||0)+(E.recBuy||0)+(E.recHold||0)+(E.recSell||0)+(E.recStrongSell||0);
  return `
  <div class="panel">
    <div class="panelhead"><span class="panelt">Analyst outlook</span><span class="panels">consensus estimates · free via Yahoo</span></div>
    <div class="kv">
      <div class="kvrow"><span class="kvk">EPS growth est. (this year)</span><span class="kvv" style="color:${revColor(E.epsGrowthCurrentYear)}">${E.epsGrowthCurrentYear==null?"—":sign(E.epsGrowthCurrentYear)}</span></div>
      <div class="kvrow"><span class="kvk">EPS growth est. (next year)</span><span class="kvv" style="color:${revColor(E.epsGrowthNextYear)}">${E.epsGrowthNextYear==null?"—":sign(E.epsGrowthNextYear)}</span></div>
      <div class="kvrow"><span class="kvk">Estimate revision (30d)</span><span class="kvv" style="color:${revColor(E.estimateRevision30d)}">${E.estimateRevision30d==null?"—":sign(E.estimateRevision30d)}</span></div>
      <div class="kvrow"><span class="kvk">Estimate revision (90d)</span><span class="kvv" style="color:${revColor(E.estimateRevision90d)}">${E.estimateRevision90d==null?"—":sign(E.estimateRevision90d)}</span></div>
      <div class="kvrow"><span class="kvk">Analyst price target (mean)</span><span class="kvv">${E.priceTargetMean==null?"—":fmtP(E.priceTargetMean,s.mkt)+" ("+sign(targetGap)+" vs current)"}</span></div>
      <div class="kvrow"><span class="kvk">Analysts covering</span><span class="kvv" style="color:${E.numAnalysts!=null&&E.numAnalysts<5?'var(--warn)':'inherit'}">${E.numAnalysts==null?"—":E.numAnalysts}${E.numAnalysts!=null&&E.numAnalysts<5?" ⚑ thin":""}</span></div>
    </div>
    ${totalRecs>0?`<div style="margin-top:10px;font-size:11.5px;color:var(--dim)">Recommendations: ${E.recStrongBuy||0} strong buy · ${E.recBuy||0} buy · ${E.recHold||0} hold · ${E.recSell||0} sell · ${E.recStrongSell||0} strong sell</div>`:""}
    <p style="font-size:10.5px;color:var(--dim);margin-top:10px;line-height:1.5">Revision trend matters more than the absolute estimate — analysts raising numbers over the last 30-90 days is one of the more empirically predictive short-term signals available. Compare against the Veteran's Lens "implied growth" (what the price assumes) for a three-way triangulation: trailing actual, market-implied, and analyst-expected.${E.numAnalysts!=null&&E.numAnalysts<5?` <b style="color:var(--warn)">Coverage is thin (${E.numAnalysts} analysts)</b> — a single upgrade or downgrade can swing this "trend" on its own. Weight it much less than the same reading on a widely-covered stock.`:""}</p>
  </div>`;
}


function renderTrackRecord(s){
  const rec = REACTIONS_DATA.find(r=>r.ticker===s.t);
  if(!rec || !rec.returns || !rec.returns.length){
    return `
    <div class="askbox" style="background:#f7f7f5;border-color:var(--line)">
      <div class="askhead"><div>
        <div class="asktitle" style="color:var(--dim)">◆ Earnings track record</div>
        <div class="asksub">Not loaded yet. After running <code>fetch_edgar.py</code>, run <code>python fetch_reactions.py</code> to compute how ${s.t} actually moved around each of its last 10 earnings dates — independent of any sentiment read, so you can test your own sentiment judgment against what really happened.</div>
      </div></div>
    </div>`;
  }
  const withExcess = computeExcessReturns(rec, REACTIONS_DATA);
  const validCount = withExcess.filter(r=>r.forward60d!=null).length;
  return `
  <div class="askbox" style="background:#f0f4f8;border-color:#c8d6e5">
    <div class="askhead"><div>
      <div class="asktitle" style="color:#2563eb">◆ Earnings track record — what actually happened</div>
      <div class="asksub">Price behavior around ${s.t}'s last ${withExcess.length} filing dates, independent of any sentiment score. Excess return = stock return minus the average return of its sector peers over the same window — this strips out macro and sector moves so what's left is closer to company-specific reaction. Compare this against your own sentiment read from the panel above; agreement or disagreement is the useful signal.</div>
    </div></div>
    <div style="overflow-x:auto;margin-top:10px">
    <table class="grid" style="border:none">
      <thead><tr>
        ${["Filing date","Price then","1-day move","60-day fwd","90-day fwd","60-day excess*"].map(h=>`<th class="${h==='Filing date'?'left':''}" style="font-size:10px">${h}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${withExcess.map(r=>`
          <tr id="earnrow-${r.date}">
            <td class="left">${r.date}</td>
            <td>${r.priceAtFiling==null?"—":fmtP(r.priceAtFiling,s.mkt)}</td>
            <td style="color:${clr(r.reaction1d)}">${sign(r.reaction1d)}</td>
            <td style="color:${clr(r.forward60d)}">${sign(r.forward60d)}</td>
            <td style="color:${clr(r.forward90d)}">${sign(r.forward90d)}</td>
            <td style="color:${clr(r.excess60d)};font-weight:700">${r.excess60d==null?"—":sign(r.excess60d)}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>
    <p style="font-size:10.5px;color:var(--dim);margin-top:10px;line-height:1.5">*Excess return needs peer data for ${s.sec} in the same reactions.json file to compute — if it shows "—", run the full-universe fetch so sector peers are available for comparison. ${validCount<withExcess.length?`Some dates are missing forward price data (too recent, less than 60/90 days old yet).`:""} This is descriptive, not predictive — it shows what happened after past calls, not a guarantee of what will happen after the next one, and 60-90 day windows are still influenced by company-specific news beyond the earnings call itself.</p>
  </div>`;
}

function renderAskClaude(s){
  return `
  <div class="askbox">
    <div class="askhead">
      <div>
        <div class="asktitle">◆ Ask Claude — free research brief</div>
        <div class="asksub">Copies a data-grounded prompt for ${s.t} to your clipboard and opens claude.ai in a new tab. Paste it in and hit enter — no API key, no cost.</div>
      </div>
      <div class="askbtns">
        <button class="askbtn secondary" data-ask="concise" data-tk="${s.t}">Quick take</button>
        <button class="askbtn" data-ask="full" data-tk="${s.t}">Full research brief</button>
      </div>
    </div>
    <div class="askdone" id="askDone">✓ Prompt copied — claude.ai opened in a new tab. Paste (Ctrl/Cmd+V) and press enter.</div>
  </div>`;
}

async function handleAsk(ticker, depth){
  const rows = computeRows();
  const s = rows.find(r=>r.t===ticker);
  if(!s) return;
  const prompt = buildPrompt(s, depth);
  try{ await navigator.clipboard.writeText(prompt); }
  catch(e){
    const ta=document.createElement("textarea"); ta.value=prompt; document.body.appendChild(ta);
    // Fix 4: execCommand("copy") deprecated — use async clipboard API with fallback
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(ta.value).catch(()=>{ ta.select(); document.execCommand("copy"); });
  } else { ta.select(); document.execCommand("copy"); }
  document.body.removeChild(ta);
  }
  window.open("https://claude.ai/new", "_blank");
  const done=document.getElementById("askDone");
  if(done) done.classList.add("show");
}

function renderSectors(){
  const rows = computeRows();
  const bySector={};
  rows.forEach(s=>{(bySector[s.sec]=bySector[s.sec]||[]).push(s);});
  const sectors = Object.entries(bySector).map(([sec,list])=>{
    const avg=k=>{const v=list.map(x=>x[k]).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
    return {sec,n:list.length,list,roe:avg("roe"),revG:avg("revG"),fcfG:avg("fcfG"),pe:avg("pe"),profile:profileFor(sec)};
  }).sort((a,b)=>(b.roe??-1)-(a.roe??-1));

  const reads = MACRO_DRIVERS.map(d=>{
    const dir = State.driverDir[d.id], isUp = dir==="up";
    let helps,hurts;
    if(d.upDriver){ helps=isUp?d.helpsWhenUp:d.hurtsWhenUp; hurts=isUp?d.hurtsWhenUp:d.helpsWhenUp; }
    else { helps=isUp?(d.hurtsWhenDown||[]):d.helpsWhenDown; hurts=isUp?d.helpsWhenDown:(d.hurtsWhenDown||[]); }
    return {...d,dir,helps,hurts};
  });
  const cycColor = c => c==="Defensive"?"var(--good)":c.includes("Cyclical")?"var(--warn)":c.includes("Growth")?"#6d5dd3":"#444";

  return `
  <div class="secintro">
    <h2>Sector cycles &amp; cross-asset read-through</h2>
    <p>Set each macro driver's direction. The board translates it into which sectors get a margin tailwind and which face a headwind. Example: push crude to <b style="color:var(--good)">down</b> and watch paints, airlines and tyres light up.</p>
  </div>

  <div class="driverboard">
    ${reads.map(d=>`
      <div class="drivercard">
        <div class="drivertop">
          <span class="drivername">${d.name}</span>
          <div class="seg">
            <button data-driver="${d.id}" data-dir="down" class="${d.dir==='down'?'on':''}" style="${d.dir==='down'?'background:#fbf3e0;color:var(--neutral)':''}">▼ Down</button>
            <button data-driver="${d.id}" data-dir="up" class="${d.dir==='up'?'on':''}" style="${d.dir==='up'?'background:var(--good-bg);color:var(--good)':''}">▲ Up</button>
          </div>
        </div>
        <div class="driverflow">
          <div class="flowcol"><span class="flowlblgood">TAILWIND →</span>${d.helps.map(x=>`<span class="chip good">${x}</span>`).join("")}</div>
          <div class="flowcol"><span class="flowlblbad">HEADWIND →</span>${d.hurts.map(x=>`<span class="chip bad">${x}</span>`).join("")}</div>
        </div>
        <p class="driverwhy">${d.why}</p>
        <p class="driverEg">↳ ${d.example}</p>
      </div>`).join("")}
  </div>

  <div class="cyclebox">
    <div class="cyclehead">WHERE ARE WE IN THE CYCLE? · sector rotation map</div>
    <div class="phaserow">
      ${CYCLE_PHASES.map((p,i)=>`<button class="phasebtn ${State.phase===i?'on':''}" data-phase="${i}">${p.ph}</button>`).join("")}
    </div>
    <div class="phasedetail">
      <p style="font-size:14px;margin:6px 0 0">${CYCLE_PHASES[State.phase].desc}</p>
      <div class="phasecols">
        <div><span class="flowlblgood">LEADERS</span><div style="margin-top:6px">${CYCLE_PHASES[State.phase].lead.map(x=>`<span class="chip good">${x}</span>`).join("")}</div></div>
        <div><span class="flowlblbad">LAGGARDS</span><div style="margin-top:6px">${CYCLE_PHASES[State.phase].lag.map(x=>`<span class="chip bad">${x}</span>`).join("")}</div></div>
      </div>
      <p style="font-size:12px;color:var(--dim);margin-top:14px;max-width:760px;line-height:1.6">Sectors rotate predictably as the economy moves through these phases. Money flows from defensives into cyclicals on the way up, and back to safety on the way down — leading the real economy by 6-12 months.</p>
    </div>
  </div>

  <div class="scorebox">
    <div class="cyclehead">YOUR UNIVERSE BY SECTOR · fundamentals + cycle profile</div>
    <div style="overflow-x:auto">
    <table class="grid" style="border:none;border-radius:0">
      <thead><tr>
        ${["Sector","#","Cycle type","Avg ROE","Avg rev YoY","Avg FCF YoY","Avg P/E","Defensiveness","Key drivers"].map(h=>`<th class="${h==="Sector"||h==="Cycle type"||h==="Key drivers"?"left":""}">${h}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${sectors.map(sec=>`
          <tr class="row" data-opensector="${sec.list[0]?.t||''}">
            <td class="left" style="font-weight:700">${sec.sec}</td>
            <td>${sec.n}</td>
            <td class="left" style="color:${cycColor(sec.profile.cyc)}">${sec.profile.cyc}</td>
            <td>${sec.roe==null?"—":sec.roe.toFixed(0)+"%"}</td>
            <td style="color:${clr(sec.revG)}">${sign(sec.revG)}</td>
            <td style="color:${clr(sec.fcfG)}">${sign(sec.fcfG)}</td>
            <td>${sec.pe==null?"—":sec.pe.toFixed(0)}</td>
            <td><div class="defbar"><div class="deffill" style="width:${sec.profile.defensiveness}%;background:${sec.profile.defensiveness>60?'var(--good)':sec.profile.defensiveness>40?'var(--neutral)':'var(--warn)'}"></div></div></td>
            <td class="left" style="font-size:11px;color:var(--dim)">${sec.profile.drivers.join(" · ")||"—"}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>
    <p style="font-size:11.5px;color:var(--dim);padding:12px 18px;margin:0">Defensiveness = how steady earnings stay through a downturn. Click a sector row to jump to a constituent. Averages are equal-weighted across names in your dataset.</p>
  </div>`;
}

function renderCompare(){
  if(State.compare.length===0){
    return `
    <div class="secintro">
      <h2>Compare stocks</h2>
      <p>Pick up to 5 stocks to compare side-by-side across valuation, quality, forensics, and every funnel condition. Click <b>+</b> on any stock in the Stocks tab, or search below.</p>
    </div>
    <div class="panel wide" style="padding:20px">
      <div class="kpiL" style="margin-bottom:8px">Search and add stocks to compare</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input id="cmpSearch" placeholder="Type ticker e.g. BPCL, IOC, AAPL…" style="width:220px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);font-size:13px"/>
        <button data-cmpadd style="padding:8px 16px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:600;cursor:pointer">Add</button>
      </div>
    </div>
    <div class="panel" style="text-align:center;padding:40px 20px;color:var(--dim)">No stocks selected. Add from the Stocks tab (+) or search above.</div>`;
  }

  const rows = computeRows();
  const stocks = State.compare.map(t=>rows.find(r=>r.t===t)).filter(Boolean);
  if(!stocks.length) return `<div class="panel"><p class="hint">Selected stocks not found in loaded data.</p></div>`;

  const colW = `${Math.floor(85/(stocks.length))}%`;
  const ctx = {rows};

  /* ── helpers ── */
  const best = (vals, lowerBetter) => {
    const nums = vals.map(v=>parseFloat(v)).filter(n=>!isNaN(n));
    if(!nums.length) return null;
    return lowerBetter ? Math.min(...nums) : Math.max(...nums);
  };
  const cellStyle = (val, bestVal, lowerBetter, colorFn) => {
    if(colorFn) return `color:${colorFn(val)}`;
    const n = parseFloat(val);
    if(isNaN(n)||bestVal===null) return "";
    const isBest = lowerBetter ? n===bestVal : n===bestVal;
    return isBest ? "color:var(--good);font-weight:800" : "";
  };

  /* ── section renderer ── */
  const section = (title, subtitle, metricRows) => {
    const lowerSet = new Set(["P/E","EV/EBITDA","PEG","Net debt/EBITDA","Debt/Mkt cap","Beneish M","Altman Z"]);
    return `
      <tr><td colspan="${stocks.length+1}" style="padding:10px 0 4px;font-size:12px;font-weight:700;letter-spacing:1px;color:var(--dim);text-transform:uppercase;border-bottom:2px solid var(--line)">${title}${subtitle?`<span style="font-weight:400;text-transform:none;letter-spacing:0;margin-left:8px">${subtitle}</span>`:""}</td></tr>
      ${metricRows.map(([label, vals, colorFns, note])=>{
        const lb = lowerSet.has(label);
        const bestVal = best(vals.map(v=>typeof v==="string"?v.replace(/[%×₹$,]/g,""):v), lb);
        return `<tr>
          <td class="left" style="color:var(--dim);font-size:12.5px;padding:5px 0">${label}${note?`<span title="${note}" style="color:var(--dim);cursor:help;margin-left:4px">ⓘ</span>`:""}
          </td>
          ${vals.map((v,i)=>{
            const display = v==null||v===""?"—":v;
            const style = cellStyle(display, bestVal, lb, colorFns?.[i]);
            return `<td class="left" style="font-weight:600;font-size:13px;${style}">${display}</td>`;
          }).join("")}
        </tr>`;
      }).join("")}`;
  };

  /* ── compute all values ── */
  const f = s => val => val==null ? "—" : val;
  const pct = v => v==null?"—":v.toFixed(1)+"%";
  const x = v => v==null?"—":v.toFixed(1)+"×";
  const num = v => v==null?"—":v.toFixed(1);

  // Forensic scores
  const forensics = stocks.map(s=>forensicScores(s));
  const veteran = stocks.map(s=>veteranMetrics(s));
  const rq = stocks.map(s=>sectorRelativeQuality(s, rows));

  // Funnel conditions (all 5 stages)
  const funnelAudit = stocks.map(s=>{
    const stageResults = {};
    FUNNEL_STAGES.filter(st=>st.id>=1&&st.id<=5&&st.conditions).forEach(st=>{
      stageResults[st.id] = st.conditions.map(c=>{
        let r; try { r=c.test(s,ctx); } catch(e){ r={status:"na",reason:"err"}; }
        return {id:c.id, label:c.label.replace(/^(HARD|SOFT) — /,"").slice(0,40), status:r.status};
      });
    });
    return stageResults;
  });

  const stageIcon = status => status==="pass"?"✓":status==="warn"?"⚠":status==="na"?"◌":"✗";
  const stageColor = status => status==="pass"?"var(--good)":status==="warn"?"#b8860b":status==="na"?"var(--dim)":"var(--warn)";

  return `
  <div class="secintro" style="margin-bottom:10px">
    <h2>Compare</h2>
    <p>${stocks.length} stocks · click a metric to understand it · green = best in this comparison</p>
  </div>

  <!-- search bar always visible -->
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
    <input id="cmpSearch" placeholder="Add another ticker…" style="width:190px;padding:7px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);font-size:13px"/>
    <button data-cmpadd style="padding:7px 14px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:600;cursor:pointer;font-size:13px">Add</button>
    ${stocks.map(s=>`<button class="preset on" data-cmp="${s.t}" style="font-size:12px">${s.t} ×</button>`).join("")}
  </div>

  <div style="overflow-x:auto">
  <table class="grid" style="min-width:600px">
    <thead><tr>
      <th class="left" style="width:170px;font-size:12px">Metric</th>
      ${stocks.map((s,i)=>`<th class="left" style="width:${colW}">
        <span class="tname" style="cursor:pointer" data-open="${s.t}">${s.t}</span>
        <span class="tsub">${s.n}</span>
        <div style="font-size:11px;color:var(--dim);margin-top:2px">${s.sec||""} · ${s.mkt}</div>
      </th>`).join("")}
    </tr></thead>
    <tbody>

    ${section("Valuation", "lower P/E, EV/EBITDA, PEG = better; higher FCF yield = better", [
      ["Price",           stocks.map(s=>fmtP(s.price,s.mkt))],
      ["Market cap",      stocks.map(s=>fmtB(s.mcap,s.mkt))],
      ["P/E",             stocks.map(s=>s.pe?.toFixed(1)||"—")],
      ["EV/EBITDA",       stocks.map(s=>s.evEbitda?.toFixed(1)||"—")],
      ["EV/EBITDA (annual)",stocks.map(s=>s.evEbitdaCalc?s.evEbitdaCalc.toFixed(1)+"×":"—"),null,
        "Self-computed from annual EBITDA (consistent with charts). Yahoo's TTM figure may differ for growing companies."],
      ["EV/FCF",          stocks.map(s=>s.evFcf?s.evFcf.toFixed(1)+"×":"—"),null,
        "Enterprise value / free cash flow. Cleaner than EV/EBITDA for capex-heavy businesses; n/a if FCF negative."],
      ["PEG",             stocks.map(s=>s.peg?s.peg.toFixed(2)+(s.pegSource==="ni"?" (NI)":""):"—"),null,"PEG uses EPS growth when analyst consensus available, net income growth otherwise"],
      ["FCF yield",       stocks.map(s=>pct(s.fcfYield))],
      ["Earnings yield",  stocks.map(s=>pct(s.earnYield))],
      ["DCF gap (MoS)",   stocks.map(s=>sign(s.mos)), stocks.map(s=>()=>clr(s.mos))],
      ["Rule of 40",      stocks.map(s=>s.ruleOf40!=null?s.ruleOf40.toFixed(0)+(s.ruleOf40>=40?" ✓":""):"—")],
    ])}

    ${section("Growth", "", [
      ["Revenue YoY",     stocks.map(s=>sign(s.revG)),    stocks.map(s=>()=>clr(s.revG))],
      ["Revenue CAGR 3y", stocks.map(s=>sign(s.revCagr)), stocks.map(s=>()=>clr(s.revCagr))],
      ["FCF YoY",         stocks.map(s=>sign(s.fcfG)),    stocks.map(s=>()=>clr(s.fcfG))],
      ["FCF CAGR 3y",     stocks.map(s=>sign(s.fcfCagr)), stocks.map(s=>()=>clr(s.fcfCagr))],
      ["NI YoY",          stocks.map(s=>sign(s.niG)),     stocks.map(s=>()=>clr(s.niG))],
      ["Rev decel",       stocks.map(s=>s.revDecel!=null?sign(s.revDecel)+" pts":(s.revRecovery?"↑ recovery":"—"))],
    ])}

    ${section("Profitability & Cash", "", [
      ["Net margin",      stocks.map(s=>pct(s.nmNow))],
      ["Op margin",       stocks.map(s=>pct(s.omNow))],
      ["EBITDA margin",   stocks.map(s=>pct(s.emNow))],
      ["FCF / NI",        stocks.map(s=>s.fcfNi?.toFixed(2)||"—"), stocks.map(s=>()=>s.fcfNi>=THRESH.fcfNi.ok?"var(--good)":s.fcfNi<THRESH.fcfNi.weak?"var(--warn)":"inherit")],
      ["Capex intensity", stocks.map(s=>pct(s.capexIntensity))],
    ])}

    ${section("Returns & Balance Sheet", "", [
      ["ROE",             stocks.map(s=>pct(s.roe))],
      ["ROA",             stocks.map(s=>pct(s.roa))],
      ["ROIC",            stocks.map(s=>s.roic!=null?s.roic.toFixed(1)+"%":"—"),
        stocks.map(s=>()=>s.roic!=null?(s.roic>=15?"var(--good)":s.roic<8?"var(--warn)":"inherit"):"inherit"),
        "Return on Invested Capital = NOPAT / (equity + net debt). Above 15% = above cost of capital = value creation."],
      ["Interest coverage",stocks.map(s=>s.interestCoverage!=null?s.interestCoverage.toFixed(1)+"×":"—"),
        stocks.map(s=>()=>s.interestCoverage!=null?(s.interestCoverage>=5?"var(--good)":s.interestCoverage<2?"var(--warn)":"inherit"):"inherit"),
        "EBIT / interest expense. Below 2× = earnings barely cover debt service."],
      ["Current ratio",   stocks.map(s=>s.currentRatio?.toFixed(2)||"—"),null,"Current assets / current liabilities. Below 1 = potential short-term liquidity issue."],
      ["Quick ratio",     stocks.map(s=>s.quickRatio?.toFixed(2)||"—"),null,"(Current assets - inventory) / current liabilities. Stricter liquidity test."],
      ["Net debt/EBITDA", stocks.map(s=>s.debtToEbitda?.toFixed(1)+"×"||"—")],
      ["Net debt/equity", stocks.map(s=>s.netDebtToEquity!=null?s.netDebtToEquity+"%":"—")],
      ["Gross margin 3Y Δ",stocks.map(s=>s.grossMarginTrend3y!=null?(s.grossMarginTrend3y>0?"+":"")+s.grossMarginTrend3y.toFixed(1)+"pts":"—"),
        stocks.map(s=>()=>s.grossMarginTrend3y!=null?(s.grossMarginTrend3y>0?"var(--good)":s.grossMarginTrend3y<-3?"var(--warn)":"inherit"):"inherit"),
        "3-year gross margin trend. Sustained compression = pricing power erosion."],
    ])}

    ${section("Quality (sector-relative percentile)", "each score = % of sector peers this stock beats", [
      ["Overall quality", stocks.map(s=>rq[stocks.indexOf(s)].score+(rq[stocks.indexOf(s)].fallback?" (abs)":"th pct")),
        stocks.map((s,i)=>()=>rq[i].score>=60?"var(--good)":rq[i].score<40?"var(--warn)":"inherit"),
        "Percentile vs sector peers in same market. 60 = better than 60% of direct competitors."],
      ["Growth pct",      stocks.map((s,i)=>rq[i].parts?.growth!=null?rq[i].parts.growth+"th":"—")],
      ["Profitability pct",stocks.map((s,i)=>rq[i].parts?.profitability!=null?rq[i].parts.profitability+"th":"—")],
      ["Cash quality pct",stocks.map((s,i)=>rq[i].parts?.cashQuality!=null?rq[i].parts.cashQuality+"th":"—")],
      ["Balance sheet pct",stocks.map((s,i)=>rq[i].parts?.balanceSheet!=null?rq[i].parts.balanceSheet+"th":"—")],
      ["Returns pct",     stocks.map((s,i)=>rq[i].parts?.returns!=null?rq[i].parts.returns+"th":"—")],
      ["Decision verdict",stocks.map(s=>s.verdict?.l||"—"), stocks.map(s=>()=>s.verdict?.c||"inherit")],
    ])}

    ${section("Forensic Scores", "fraud/distress detection", [
      ["Beneish M",       stocks.map((s,i)=>forensics[i].beneish?.score?.toFixed(2)||"n/a"),
        stocks.map((s,i)=>()=>forensics[i].beneish?.flagged?"var(--warn)":"var(--good)"),
        "Below −1.78 = manipulation pattern absent. n/a for financials."],
      ["Beneish verdict", stocks.map((s,i)=>forensics[i].beneish?.flagged?"⚠ flagged":"✓ clean")],
      ["Altman Z / Z″",   stocks.map((s,i)=>forensics[i].altman?.notApplicable?"n/a (financials)":forensics[i].altman?.score?.toFixed(2)||"—"),
        stocks.map((s,i)=>()=>forensics[i].altman?.zone==="Safe zone"?"var(--good)":forensics[i].altman?.zone==="Distress zone"?"var(--warn)":"#b8860b")],
      ["Altman zone",     stocks.map((s,i)=>forensics[i].altman?.notApplicable?"n/a":forensics[i].altman?.zone||"—")],
      ["Piotroski F",     stocks.map((s,i)=>forensics[i].piotroski?.score!=null?forensics[i].piotroski.score+"/9":"—"),
        stocks.map((s,i)=>()=>forensics[i].piotroski?.score>=7?"var(--good)":forensics[i].piotroski?.score<=3?"var(--warn)":"inherit"),
        "9 = strongest financial health. 0–3 = weak."],
    ])}

    ${section("Veteran's Lens", "durability beyond one-year snapshots", [
      ["Steadiness",      stocks.map((s,i)=>veteran[i].steadiness?.score!=null?veteran[i].steadiness.score+"/100":"—"),
        stocks.map((s,i)=>()=>veteran[i].steadiness?.score>=60?"var(--good)":veteran[i].steadiness?.score<40?"var(--warn)":"inherit")],
      ["Resilience",      stocks.map((s,i)=>veteran[i].resilience?.score!=null?veteran[i].resilience.score+"/100":"—"),
        stocks.map((s,i)=>()=>veteran[i].resilience?.score>=60?"var(--good)":veteran[i].resilience?.score<40?"var(--warn)":"inherit")],
      ["Reinvestment",    stocks.map((s,i)=>veteran[i].reinvest?.score!=null?veteran[i].reinvest.score+"/100":"—"),
        stocks.map((s,i)=>()=>veteran[i].reinvest?.score>=60?"var(--good)":veteran[i].reinvest?.score<40?"var(--warn)":"inherit")],
      ["Worst rev year",  stocks.map((s,i)=>veteran[i].resilience?.worstRev!=null?veteran[i].resilience.worstRev.toFixed(0)+"%":"—"),null,
        "Worst single-year revenue decline. Used for position sizing."],
      ["Implied growth",  stocks.map((s,i)=>veteran[i].impliedGrowth?.impliedTxt||"—"),null,
        "What FCF growth the current price assumes. Compare to analyst consensus."],
      ["Veteran composite",stocks.map((s,i)=>veteran[i].composite!=null?Math.round(veteran[i].composite)+"/100":"—"),
        stocks.map((s,i)=>()=>veteran[i].composite>=60?"var(--good)":veteran[i].composite<40?"var(--warn)":"inherit")],
    ])}

    ${section("Funnel Audit — Stage 1 (Data Integrity)", "", [
      ...( FUNNEL_STAGES.find(st=>st.id===1)?.conditions||[] ).map(c=>[
        c.label.replace(/^(HARD|SOFT) — /,"").slice(0,45),
        funnelAudit.map((fa,i)=>{ const r=fa[1]?.find(x=>x.id===c.id); return r?stageIcon(r.status):"—"; }),
        funnelAudit.map((fa,i)=>()=>{ const r=fa[1]?.find(x=>x.id===c.id); return r?stageColor(r.status):"inherit"; }),
      ])
    ])}

    ${section("Funnel Audit — Stage 2 (Forensic Honesty)", "", [
      ...( FUNNEL_STAGES.find(st=>st.id===2)?.conditions||[] ).map(c=>[
        c.label.replace(/^(HARD|SOFT) — /,"").slice(0,45),
        funnelAudit.map((fa,i)=>{ const r=fa[2]?.find(x=>x.id===c.id); return r?stageIcon(r.status):"—"; }),
        funnelAudit.map((fa,i)=>()=>{ const r=fa[2]?.find(x=>x.id===c.id); return r?stageColor(r.status):"inherit"; }),
      ])
    ])}

    ${section("Funnel Audit — Stage 3 (Business Quality)", "", [
      ...( FUNNEL_STAGES.find(st=>st.id===3)?.conditions||[] ).map(c=>[
        c.label.replace(/^(HARD|SOFT) — /,"").slice(0,45),
        funnelAudit.map((fa,i)=>{ const r=fa[3]?.find(x=>x.id===c.id); return r?stageIcon(r.status):"—"; }),
        funnelAudit.map((fa,i)=>()=>{ const r=fa[3]?.find(x=>x.id===c.id); return r?stageColor(r.status):"inherit"; }),
      ])
    ])}

    ${section("Funnel Audit — Stage 4 (Price)", "", [
      ...( FUNNEL_STAGES.find(st=>st.id===4)?.conditions||[] ).map(c=>[
        c.label.replace(/^(HARD|SOFT) — /,"").slice(0,45),
        funnelAudit.map((fa,i)=>{ const r=fa[4]?.find(x=>x.id===c.id); return r?stageIcon(r.status):"—"; }),
        funnelAudit.map((fa,i)=>()=>{ const r=fa[4]?.find(x=>x.id===c.id); return r?stageColor(r.status):"inherit"; }),
      ])
    ])}

    ${section("Funnel Audit — Stage 5 (Timing)", "⚠ = soft caution (never rejects)", [
      ...( FUNNEL_STAGES.find(st=>st.id===5)?.conditions||[] ).map(c=>[
        c.label.replace(/^(HARD|SOFT) — /,"").slice(0,45),
        funnelAudit.map((fa,i)=>{ const r=fa[5]?.find(x=>x.id===c.id); return r?stageIcon(r.status):"—"; }),
        funnelAudit.map((fa,i)=>()=>{ const r=fa[5]?.find(x=>x.id===c.id); return r?stageColor(r.status):"inherit"; }),
      ])
    ])}

    </tbody>
  </table>
  </div>
  <p class="hint" style="margin-top:12px">✓ = passes · ✗ = fails · ⚠ = soft caution · ◌ = not assessable (data missing). Green values = best in this comparison. Funnel conditions are re-evaluated live — not from a prior run.</p>

  <!-- overlay line charts -->
  <div class="panelgrid" style="margin-top:18px">
    <div class="panel wide">
      <div class="panelhead"><span class="panelt">Revenue trend</span><span class="panels">overlaid · last 4 years</span></div>
      ${svgLineChart(stocks.map((s,i)=>({color:CMP_COLORS[i%CMP_COLORS.length],data:s.annual.revenue})), stocks[0]?.annual.periods||[])}
      <div class="legend">${stocks.map((s,i)=>`<span class="legitem"><i style="background:${CMP_COLORS[i%CMP_COLORS.length]}"></i>${s.t}</span>`).join("")}</div>
    </div>
    <div class="panel wide">
      <div class="panelhead"><span class="panelt">Free cash flow trend</span><span class="panels">overlaid · last 4 years</span></div>
      ${svgLineChart(stocks.map((s,i)=>({color:CMP_COLORS[i%CMP_COLORS.length],data:s.annual.fcf})), stocks[0]?.annual.periods||[])}
      <div class="legend">${stocks.map((s,i)=>`<span class="legitem"><i style="background:${CMP_COLORS[i%CMP_COLORS.length]}"></i>${s.t}</span>`).join("")}</div>
    </div>
    <div class="panel wide">
      <div class="panelhead"><span class="panelt">Net margin trend</span><span class="panels">overlaid · last 4 years</span></div>
      ${svgLineChart(stocks.map((s,i)=>({color:CMP_COLORS[i%CMP_COLORS.length],data:(s.annual.margins||[]).map(m=>m?.net)})), stocks[0]?.annual.periods||[])}
      <div class="legend">${stocks.map((s,i)=>`<span class="legitem"><i style="background:${CMP_COLORS[i%CMP_COLORS.length]}"></i>${s.t}</span>`).join("")}</div>
    </div>
  </div>
  <p class="hint">Charts overlay trend shapes — absolute scale differs for cross-market (₹ vs $) comparisons.</p>`;
}

const CMP_COLORS=["#0e6e5c","#6d5dd3","#c0392b","#b8860b","#2563eb"];

/* ============================================================
   PLAYBOOK TAB — the combinations catalog. Each entry is a named,
   multi-metric pattern with a live match count against your
   current dataset. Click a card to see which stocks match right
   now; click a match to open its tearsheet.
   ============================================================ */
function renderPlaybook(){
  const allRows = computeRows();
  const rows = State.playbookMkt==="ALL" ? allRows : allRows.filter(s=>s.mkt===State.playbookMkt);
  const ctx = { macro: MACRO_DATA, rows };

  const withMatches = PLAYBOOK.map(p=>{
    let matches = [];
    try { matches = rows.filter(s=>p.test(s, ctx)); } catch(e){ matches = []; }
    return {...p, matches};
  });

  const cats = ["all", ...PLAYBOOK_CATEGORIES];
  const filtered = State.playbookCat==="all" ? withMatches : withMatches.filter(p=>p.cat===State.playbookCat);

  return `
  <div class="secintro">
    <h2>The Combinations Playbook</h2>
    <p>Twenty-two named, multi-metric patterns — the kind of cross-referencing a professional analyst does by habit. Each one combines several signals into a single recognizable setup, with a live count of how many stocks in your dataset match it right now. Click a card to see exactly which ones.</p>
  </div>

  <div class="toolbar" style="margin-bottom:14px">
    <div class="seg">
      ${["ALL","US","IN"].map(m=>`<button data-pbmkt="${m}" class="${State.playbookMkt===m?'on':''}">${m==="US"?"S&P 500":m==="IN"?"Nifty":"All markets"}</button>`).join("")}
    </div>
    <span style="font-size:12px;color:var(--dim);align-self:center">${rows.length} stocks in scope</span>
  </div>

  <div class="presets" style="margin-bottom:18px">
    ${cats.map(c=>`<button class="preset ${State.playbookCat===c?'on':''}" data-pbcat="${c}">${c==="all"?"All categories":c}</button>`).join("")}
  </div>

  <div style="display:flex;flex-direction:column;gap:10px">
    ${filtered.map(p=>{
      const isOpen = State.playbookOpen===p.id;
      const n = p.matches.length;
      return `
      <div class="panel" style="padding:0;overflow:hidden">
        <div style="padding:16px 20px;cursor:pointer;display:flex;justify-content:space-between;align-items:flex-start;gap:16px" data-pbtoggle="${p.id}">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="font-weight:800;font-size:15px">${p.name}</span>
              <span style="font-size:10px;color:var(--dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.4px">${p.cat}</span>
            </div>
            <div style="font-family:var(--mono);font-size:11.5px;color:var(--accent);margin-top:6px">${p.formula}</div>
          </div>
          <span class="pill ${n>0?'good':'neutral'}" style="flex-shrink:0;white-space:nowrap">${n} match${n===1?'':'es'}</span>
        </div>
        ${isOpen?`
        <div style="padding:0 20px 18px;border-top:1px solid var(--line)">
          <p style="font-size:13px;color:#333;line-height:1.6;margin:14px 0 10px"><b>What it means:</b> ${p.meaning}</p>
          <p style="font-size:13px;color:#333;line-height:1.6;margin:0 0 14px"><b>How to read it:</b> ${p.read}</p>
          ${n===0?`<p style="font-size:12.5px;color:var(--dim)">No stocks in your current dataset match this combination right now.</p>`:`
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${p.matches.slice(0,30).map(s=>`
              <button class="preset" data-open="${s.t}" style="padding:6px 12px">
                <b>${s.t}</b><span class="n">${sign(s.mos)} vs DCF</span>
              </button>`).join("")}
            ${n>30?`<span style="font-size:12px;color:var(--dim);align-self:center">+${n-30} more</span>`:''}
          </div>`}
        </div>`:''}
      </div>`;
    }).join("")}
  </div>
  <p class="hint">Combinations recompute live from your current dataset every time you open this tab. Some (Macro Tailwind Compounder, Fighting the Tide) need <code>macro.json</code> loaded to activate — see the Macro Environment panel on any tearsheet for setup.</p>
  `;
}

/* ============================================================
   LEARN TAB — the complete reference guide. Every ratio, signal,
   combination, and concept used anywhere in the dashboard,
   explained in plain English with worked examples, organized
   into sections a non-expert can read as a course or reference.
   ============================================================ */
const LEARN_CONTENT = [
  /* ────────────────────────────────────────────────────────
     SECTION 1: THE FUNDAMENTALS OF FUNDAMENTALS
  ──────────────────────────────────────────────────────── */
  { section:"The fundamentals of fundamentals",
    items:[
      { term:"Revenue", also:"Sales, Top line",
        what:"The total money a company receives from selling its products or services, before any costs are subtracted.",
        why:"It's the starting point for everything — a business that can't grow revenue has limited options. But revenue is also the most easily manipulated headline number, which is why analysts never stop at revenue alone.",
        how:"Look at the trend, not a single year. Is it growing, flat, or declining? Is the growth rate accelerating or decelerating? A business growing 20% then 10% then 5% is telling you something important even though all three numbers are positive.",
        example:"Apple reports $391B in revenue. That number alone tells you size. The +2% YoY growth is what tells you the pace. The fact that FCF grew at a different rate is what tells you quality.",
        trap:"Revenue growth funded by aggressive discounting or channel-stuffing (shipping excess inventory to dealers) inflates the number without creating real value. Always cross-check with FCF and margin direction."},

      { term:"EBITDA", also:"Earnings Before Interest, Taxes, Depreciation & Amortisation",
        what:"Operating profit before accounting adjustments — essentially, what the business earns from its operations before the cost of debt, taxes, or depreciation of past investments.",
        why:"It's the most commonly used proxy for 'operating cash profit' because it strips out financing choices (interest) and tax structures (which vary by country) and accounting charges (depreciation/amortisation) that differ across companies. Allows fairer cross-company comparisons.",
        how:"Use EBITDA margin (EBITDA÷Revenue) to compare profitability across companies regardless of their capital structure. A 30%+ EBITDA margin typically signals pricing power — the business keeps a large fraction of every sales dollar before these costs.",
        example:"Two companies both earn $100M in net income. Company A has EBITDA of $200M (low depreciation, no debt). Company B has EBITDA of $400M but heavy debt and depreciation. EBITDA reveals B is operationally stronger, even though net income is the same.",
        trap:"EBITDA ignores the cash cost of replacing equipment (capex) and is therefore a less reliable measure for capital-intensive businesses like manufacturers or telecom companies. For asset-light businesses like software, it's a reasonable approximation."},

      { term:"Net income", also:"Profit, Bottom line, Earnings",
        what:"What's left after every cost — operating expenses, interest on debt, taxes, depreciation — has been subtracted from revenue.",
        why:"The headline number most people watch, and consequently the most managed number in a company's accounts. Management teams have legitimate leeway in how and when they recognise revenue, how they estimate depreciation, and how they treat one-off charges.",
        how:"Treat net income as a starting point, not an endpoint. The key cross-check is FCF/Net income. If net income is growing but free cash flow isn't keeping pace, the profit growth is partly accounting-driven rather than real.",
        example:"A company reports $5B net income, up 20% YoY. But FCF is $2B, flat. FCF/NI = 0.4 — only 40 cents of every dollar of reported profit is cash. The growth in earnings is partly on paper.",
        trap:"'Non-GAAP' or 'adjusted' earnings exclude charges management considers one-off. Sometimes that's reasonable (a genuine restructuring). Sometimes the same charge appears every year — a red flag that 'exceptional' items are actually part of the business."},

      { term:"Free cash flow (FCF)", also:"Owner earnings, True profit",
        what:"Operating cash flow minus capital expenditure (capex). The actual cash the business generates after paying to maintain and grow its physical assets — the money that can be paid to shareholders, used for acquisitions, or reinvested.",
        why:"If net income is an opinion, FCF is a fact. You cannot fake cash in a bank account the way you can manage an accounting profit number. FCF is what Warren Buffett means by 'owner earnings' — the real return to the business's owners.",
        how:"Compare FCF to net income (FCF/NI ratio). Above 1.0 means cash exceeds accounting profit — excellent quality. Below 0.7 means profit is running ahead of cash — use caution. Look at multi-year FCF trend, not a single year (one bad capex year can distort it).",
        example:"Microsoft reports $88B net income and $74B FCF. FCF/NI = 0.84. Respectable. Apple reports $94B net income and $108B FCF. FCF/NI = 1.15 — cash actually exceeds reported profit. Apple generates more cash than its accounting says it earns.",
        trap:"FCF can look low during a genuine growth investment phase (heavy capex for a new factory, data centre build-out) that will generate returns later. Always ask: is the capex maintenance (replacing worn equipment) or growth (building new capacity)?"},
    ]},

  /* ────────────────────────────────────────────────────────
     SECTION 2: MARGINS — READING THE ECONOMICS
  ──────────────────────────────────────────────────────── */
  { section:"Margins — reading the economics",
    items:[
      { term:"Gross margin", also:"Gross profit margin",
        what:"(Revenue − Cost of goods sold) ÷ Revenue. What's left after paying for the direct cost of making or delivering the product/service.",
        why:"Gross margin is the clearest indicator of pricing power. A high gross margin means the market pays significantly more than it costs to produce — the business has something competitors can't easily replicate. Software businesses can have 70-80% gross margins. Retailers might run 25%.",
        how:"Look at the trend. Expanding gross margin while growing is the cleanest sign that the business is getting structurally stronger. Contracting gross margin during growth means rising input costs or discounting to win share — both worth understanding.",
        example:"Hindustan Unilever's gross margin tells you how much room it has between what it charges for soap and shampoo and what it pays for palm oil and packaging. When crude-derived input costs fall, gross margin expands before the market notices.",
        trap:"Some industries (financial services, banks) don't have a meaningful 'gross margin' in the traditional sense. Don't compare gross margins across radically different industries — compare within sector."},

      { term:"Operating margin", also:"EBIT margin",
        what:"Operating income ÷ Revenue. Profit after operating costs (salaries, rent, R&D) but before interest and taxes.",
        why:"Shows how efficiently the core business runs, independent of how it's financed. Two otherwise identical businesses with different debt levels will show different net margins but the same operating margin — making it fairer for comparison.",
        how:"Expanding operating margin while growing revenue = operating leverage at work. Stable operating margin while growing = healthy, sustainable business. Compressing operating margin while growing revenue = buying growth, not earning it.",
        example:"If TCS grows revenue 10% but operating margin rises from 24% to 25%, that extra 1 point on a $25B revenue base is $250M of additional profit falling straight to the bottom line from the same basic business structure.",
        trap:"Operating margin can be manipulated by cutting R&D or marketing — costs that don't hurt today's profit but hurt tomorrow's revenue. Check that margin expansion is coming from genuine efficiency, not underinvestment."},

      { term:"Net margin", also:"Net profit margin",
        what:"Net income ÷ Revenue. The final percentage of every sales rupee or dollar that ends up as profit after every single cost.",
        why:"The bottom-line efficiency of the whole enterprise, including its financing and tax situation. Useful but noisier than operating margin because it's affected by debt levels and tax structures.",
        how:"Compare within a sector and over time for the same company. A net margin of 25% is world-class for a consumer goods company and mediocre for a software business. Context is everything.",
        example:"Infosys earns ~16% net margin on IT services revenue. HCL Technologies earns ~14%. Both respectable. A tyre manufacturer earning 6% net margin is doing fine; a software company earning 6% has a problem.",
        trap:"Net margin can be flattered by one-off gains (selling a building, releasing a tax provision) or crushed by one-off charges (write-offs, restructuring). Always check whether the margin is sustainable or driven by something non-recurring."},

      { term:"FCF margin", also:"Free cash flow margin",
        what:"Free cash flow ÷ Revenue. What percentage of each sales dollar actually becomes cash.",
        why:"The most honest profitability measure. Unlike net margin (accounting opinion) or EBITDA margin (ignores capex), FCF margin reflects what the business truly generates after all real cash costs, including the cost of sustaining its asset base.",
        how:"Compare to net margin. FCF margin > net margin = strong cash conversion, a quality signal. FCF margin substantially below net margin = watch carefully, accounting profit may be overstated relative to real cash generation.",
        example:"Apple: $108B FCF ÷ $391B revenue = 27.6% FCF margin. For every dollar of iPhone or service revenue, 27 cents becomes actual cash. That's exceptional. Compare to a retailer with $100B revenue and $1B FCF = 1% FCF margin.",
        trap:"A low FCF margin in one year can be justified by an investment phase (heavy capex). The question is always: is this temporary and purposeful, or is this structural?"},
    ]},

  /* ────────────────────────────────────────────────────────
     SECTION 3: VALUATION — WHAT ARE YOU PAYING?
  ──────────────────────────────────────────────────────── */
  { section:"Valuation — what are you paying?",
    items:[
      { term:"P/E ratio", also:"Price-to-earnings, earnings multiple",
        what:"Market price per share ÷ Earnings per share. How many rupees/dollars you pay for each rupee/dollar of annual profit.",
        why:"The most widely-used valuation metric. A P/E of 20 means you're paying 20 years' worth of current earnings for the stock. It tells you the market's confidence in the earnings: high P/E = high growth expected; low P/E = low growth or uncertainty expected.",
        how:"Never look at P/E in isolation. Always ask: high or low relative to (1) its own history, (2) its sector peers, and (3) its growth rate (see PEG). A P/E of 30 on 30% growth is reasonable. A P/E of 30 on 5% growth is expensive.",
        example:"Apple trades at P/E 33. Microsoft at P/E 38. The sector trades at P/E 28. Both are above the sector median — the market is paying a premium for their scale, brand, and ecosystem lock-in. Whether that premium is justified is the question the rest of the analysis answers.",
        trap:"P/E is meaningless when earnings are negative, or when earnings are temporarily depressed or inflated by one-off items. During a cyclical trough, P/E can look deceptively high (suppressed earnings); at a peak, deceptively low (inflated earnings). Always use normalised earnings for cyclicals."},

      { term:"PEG ratio", also:"Price/Earnings-to-Growth",
        what:"P/E ratio ÷ Earnings growth rate. Adjusts the earnings multiple for how fast those earnings are growing.",
        why:"A P/E of 30 sounds expensive until you learn earnings are growing 40% — then it's cheap. PEG normalises for this. A PEG below 1.0 traditionally suggests you're not paying a full premium for the growth you're getting.",
        how:"Use PEG only when both the P/E and the growth rate are positive. PEG < 1.0 = Growth at a Reasonable Price. PEG > 2.0 = paying richly for growth. The growth rate used matters enormously — use a sustainable multi-year estimate, not one exceptional quarter.",
        example:"NVIDIA at P/E 53, earnings growth 80% → PEG 0.66. Very cheap on a PEG basis, despite looking expensive on raw P/E. But is 80% growth sustainable? If it falls to 20%, PEG suddenly becomes 2.7 — expensive.",
        trap:"PEG is nearly useless for cyclical companies (earnings swing too much), financial companies (different business model), and capital-intensive businesses. Use it for stable-growth businesses only. And always stress-test the growth rate assumption."},

      { term:"EV/EBITDA", also:"Enterprise value to EBITDA",
        what:"Enterprise Value (market cap + net debt) ÷ EBITDA. How many years of operating cash profit you're paying for the whole business, including its debt.",
        why:"The multiple professional acquirers and investment bankers actually use, because it accounts for capital structure. Two companies with identical P/Es but different debt loads will have very different EV/EBITDA ratios — the one with more debt is cheaper on P/E but not necessarily a better deal.",
        how:"Under 10× on solid margins is historically inexpensive for an established business. 15-20× is normal for quality. Above 25× implies significant premium or growth expectations. Compare within sector. Use median of past 3-5 years to get a sense of 'normal' for that company.",
        example:"Reliance Industries at EV/EBITDA 11× with 18% EBITDA margin. TCS at EV/EBITDA 18× with 27% EBITDA margin. TCS is more expensive on this metric but arguably warrants it — higher margins, less capital intensity, better FCF conversion.",
        trap:"EV/EBITDA ignores capex. A business with a 10× EV/EBITDA multiple but 60% of EBITDA consumed by maintenance capex (like a telco or utility) is not as cheap as the multiple implies. Always pair with FCF yield."},

      { term:"Price/Sales (P/S)", also:"Revenue multiple",
        what:"Market cap ÷ Annual revenue. What you're paying per unit of sales.",
        why:"Useful when a company has no earnings yet (loss-making growth businesses) or when earnings are temporarily distorted. Also useful for comparing across industries where profit margins are structurally different.",
        how:"P/S means very little without margin context. A P/S of 5× on a 30% FCF margin business is reasonable. A P/S of 5× on a 2% net margin business means the market is pricing in a very large margin improvement that hasn't happened yet.",
        example:"Early-stage software companies are often valued on P/S because they're investing aggressively and running losses. A P/S of 10× means the market expects them to eventually achieve competitive margins on that revenue base.",
        trap:"P/S is the most easily misused multiple because it ignores profitability entirely. A company with £10B revenue and £9.9B of costs has the same P/S as one with £10B revenue and £7B of costs. Never use P/S without checking the margin profile."},

      { term:"DCF — intrinsic value", also:"Discounted cash flow, fundamental value",
        what:"A method to calculate what a business is worth today based on all the cash it will generate in the future, discounted back to present value because money today is worth more than the same amount in the future.",
        why:"The theoretically correct way to value any income-producing asset. Forces you to make your assumptions explicit — what growth rate, for how long, and what discount rate — rather than hiding them in a multiple.",
        how:"The dashboard uses a two-stage model: FCF grows at the stock's current rate (fading over 10 years to the terminal rate), discounted at your chosen rate. Adjust the sliders on the tearsheet. The discount rate should roughly equal your required return (typically 10-12% for equities). Terminal rate should be conservative (2-3%).",
        example:"If Apple's FCF is $108B growing at 8% for 10 years then 3% forever, discounted at 10%, the intrinsic value per share works out to roughly $127. Current price is $213. So at 10% discount rate, Apple looks expensive on DCF. But if you used 8% discount rate, the picture changes significantly — which is exactly why the slider matters.",
        trap:"DCF is extremely sensitive to assumptions. A 1% change in the terminal growth rate can move the intrinsic value by 30-40%. The dashboard's DCF is a starting point for structured thinking, not a precision instrument. Always stress-test it with conservative assumptions before concluding something is 'cheap.'"},

      { term:"FCF yield", also:"Owner earnings yield, cash return",
        what:"Free cash flow ÷ Market cap. The percentage return you'd receive if the company paid out all its free cash flow to you.",
        why:"The cleanest single valuation metric for a cash-generative business. Directly comparable to a bond yield: you can ask 'what's the risk-free rate?' and judge whether the equity's cash return compensates for the additional risk.",
        how:"Compare FCF yield to the 10-year government bond yield. Spread of >2 points above the risk-free rate suggests reasonable equity compensation. Spread close to zero or negative means bonds currently pay as well or better — you need significant growth to justify the equity risk.",
        example:"If a company has 6% FCF yield and the 10-year Treasury yields 4.5%, your spread is 1.5 points — modest. If the same company also has 10% FCF growth, the yield expands over time, making the current entry point more attractive. Context: a company with 3% FCF yield and 25% growth is different from one with 8% FCF yield and 2% growth.",
        trap:"FCF yield is only useful on businesses with stable, recurring FCF. On cyclical businesses (miners, energy, construction) FCF swings wildly with commodity prices — don't use peak-cycle FCF yield to conclude it's cheap. Use mid-cycle estimates."},
    ]},

  /* ────────────────────────────────────────────────────────
     SECTION 4: RETURNS — IS CAPITAL BEING USED WELL?
  ──────────────────────────────────────────────────────── */
  { section:"Returns — is capital being used well?",
    items:[
      { term:"ROE — Return on Equity",
        what:"Net income ÷ Shareholders' equity. How much profit the company earns on the money shareholders have invested.",
        why:"Buffett's favourite metric. A high, sustained ROE tells you the business earns exceptional returns on the capital it employs — the hallmark of a competitive advantage. Mediocre ROE means the business is ordinary, regardless of size.",
        how:"Above 20% sustained = strong indication of competitive advantage. 10-20% = reasonable but not exceptional. Below 10% = business is earning less than equity's typical cost of capital — destroying value. Always ask: is the ROE high because of genuine business quality, or because of heavy borrowing?",
        example:"TCS: ROE 51%. This means for every ₹100 of shareholder equity, TCS earns ₹51 of profit. That's a formidable return sustained over many years — proof of structural advantage in IT services. Compare to a steel company at ROE 8%, which might be earning less than its cost of capital.",
        trap:"Leverage inflates ROE automatically. If a company borrows heavily and earns a mediocre 8% return on assets, it can still show a 20%+ ROE just from the mathematics of leverage. Always check ROA alongside ROE. If ROE is high but ROA is low, debt is doing the work, not the business."},

      { term:"ROA — Return on Assets",
        what:"Net income ÷ Total assets. How efficiently the company uses its total asset base (funded by both equity and debt) to generate profit.",
        why:"Strips out the leverage effect that can make ROE misleading. Two businesses with identical ROA can have wildly different ROEs if one uses more debt. ROA reveals the underlying operational productivity of the asset base.",
        how:"For non-financial companies: above 10% is strong, 5-10% is acceptable, below 5% is often mediocre. For banks: 1%+ is generally sound (banks use very high leverage by design, so ROA naturally looks low).",
        example:"A bank with 15% ROE and 1.2% ROA is doing fine — leverage is intentional and regulated. A manufacturing company with 18% ROE and 2% ROA is using 9:1 leverage to achieve a mediocre ROA, which is a red flag unless it's a utility-type business with contracted revenues.",
        trap:"Asset values on balance sheets can be stale (land bought decades ago at old prices) or aggressive (goodwill from past acquisitions that may be impaired). Don't take book asset values at face value without checking footnotes."},

      { term:"ROIC — Return on Invested Capital",
        what:"NOPAT (Net Operating Profit After Tax) ÷ Invested Capital. The return the business earns on the capital it has deployed to run its operations.",
        why:"Arguably the most theoretically correct return metric. A business creates value when its ROIC exceeds its Weighted Average Cost of Capital (WACC). Below WACC, it's destroying value even while reporting positive earnings.",
        how:"Most valuable when compared to a rough cost of capital estimate (~8-12% for most businesses). ROIC consistently above 15% = genuine compounder. ROIC near or below cost of capital = value-destroying treadmill regardless of reported profit growth.",
        example:"If a company earns 18% ROIC and its cost of capital is 10%, every rupee reinvested creates 80 paise of new value per rupee deployed. Over 10 years, compounded, this becomes the difference between a good business and a great one.",
        trap:"Goodwill from acquisitions is often excluded from Invested Capital in 'cash ROIC' calculations — making it look higher than the economic reality. Both measures have their uses; just know which one you're looking at."},
    ]},

  /* ────────────────────────────────────────────────────────
     SECTION 5: BALANCE SHEET — CAN IT SURVIVE?
  ──────────────────────────────────────────────────────── */
  { section:"Balance sheet — can it survive?",
    items:[
      { term:"Net debt / EBITDA",
        what:"Net debt (total borrowings minus cash) ÷ EBITDA. How many years of operating profit it would take to repay all borrowings.",
        why:"The most intuitive leverage measure. It standardises debt across different-sized businesses and tells you how burdensome the debt is relative to the business's earnings power.",
        how:"0-1.5× = conservative, comfortable. 1.5-3× = moderate, manageable in normal conditions. 3-4× = elevated, limited room for error. Above 4× = high risk, business is highly vulnerable to a downturn or rate rise.",
        example:"Reliance Industries has significant net debt but strong EBITDA — their debt/EBITDA has trended down as earnings grew. A company acquiring rapidly might spike to 4× debt/EBITDA before deleveraging over 3-4 years. The direction of travel matters as much as the current level.",
        trap:"Capital-intensive businesses (utilities, infrastructure) can safely carry higher leverage because of stable, contracted revenues. Consumer cyclicals at 4× leverage are in trouble. Always calibrate to business stability, not a generic rule."},

      { term:"Net cash / Net debt position",
        what:"Cash and liquid investments minus all financial debt. Positive = net cash (assets exceed debt). Negative = net debt (debt exceeds cash).",
        why:"A net cash company controls its own destiny. It can invest opportunistically, weather a downturn, buy back shares, or pay dividends without needing to borrow or dilute shareholders. A net debt company must service that debt regardless of business conditions.",
        how:"Net cash is a quality signal that needs interpretation: great if being reinvested at high returns or returned to shareholders; wasteful if just accumulating in a bank account earning below the cost of equity.",
        example:"Microsoft has net cash. During COVID and subsequent downturns, this let them make acquisitions (Activision, Nuance) while competitors retrenched. TCS has net cash — it's steadily returned it via dividends and buybacks over years.",
        trap:"A company can hold 'cash' that's actually pledged as collateral for loans, or restricted (can't be repatriated from overseas without tax consequences). Read the footnotes before counting foreign cash at full face value."},

      { term:"Promoter / Insider ownership",
        what:"The percentage of the company's shares held by its founders, promoter group (India), or senior management (US/global). A measure of how much skin-in-the-game the people running the business actually have.",
        why:"Insiders have information no outsider possesses. When they voluntarily increase their stake with their own money, it's one of the highest-conviction signals of confidence in the business's future that exists. When they reduce it, it warrants understanding why.",
        how:"Look at the trend, not just the level. Rising stake = positive signal. Falling stake = needs an explanation. For Indian companies, promoter holding between 40-75% is typically healthy. Above 75% creates thin free float and governance risk. Below 30% may indicate diminishing founder commitment.",
        example:"If an Indian promoter increases stake from 52% to 54% by open-market purchase during a market dip, that's meaningful signal — they chose to deploy their personal capital into their own company at that price. If a promoter is pledging shares (borrowing against them), that's the opposite signal even with high stated holding.",
        trap:"Insider selling is not automatically bearish — could be diversification, estate planning, or tax-driven. Insider buying is almost always bullish because it's entirely voluntary and cash-cost. Weight buying signals more heavily than selling signals."},
    ]},

  /* ────────────────────────────────────────────────────────
     SECTION 6: SIGNAL COMBINATIONS — WHAT THEY REVEAL TOGETHER
  ──────────────────────────────────────────────────────── */
  { section:"Signal combinations — what they reveal together",
    items:[
      { term:"Revenue ↑ + FCF ↓",
        what:"Revenue growing, free cash flow declining simultaneously.",
        why:"The most important divergence to catch early. Growth is consuming cash rather than generating it — the business model is either structurally cash-hungry, or something operational has changed.",
        how:"Check the Cash Bridge on the tearsheet. Is the gap from capex (often defensible) or from operating cash flow (more concerning)? If OCF and FCF are both declining, working capital is the issue — growing receivables or inventory are common culprits.",
        example:"A fast-growing e-commerce company spends heavily on warehouses and inventory to support growth. FCF is negative but OCF is positive and growing. That's an investment phase, not deterioration. But if OCF also declines while revenue grows, customers are paying slowly or returns are rising.",
        trap:"One year of this is a data point. Three consecutive years is a structural pattern. Single-year capex cycles are common and normal. Multi-year FCF/revenue divergence is the real warning."},

      { term:"High ROE + Low ROA",
        what:"Return on equity looks strong, but return on total assets is thin.",
        why:"The gap between ROE and ROA is precisely the leverage effect. Heavy borrowing amplifies a mediocre underlying return into an apparently impressive equity return — but it also amplifies downside.",
        how:"For every percentage point of ROA gap below ROE, estimate how much is leverage-driven. A business with 20% ROE and 3% ROA is using roughly 7:1 leverage. Is that appropriate for the business model?",
        example:"A retail chain with 18% ROE and 2.5% ROA: the real underlying return is thin, and the equity return depends on continuing to operate with significant lease and supplier credit leverage. Fine in a growing market, fragile in a downturn.",
        trap:"Normal and expected for banks and regulated utilities — do not apply this flag to financial businesses. For non-financial companies, treat as a flag worth investigating."},

      { term:"Falling insider stake + Declining fundamentals",
        what:"Promoters or insiders reducing their stake while revenue, FCF, or margins are deteriorating.",
        why:"Three independent negative signals reinforcing each other. The people with the best information about the business are leaving at the same time the business itself is weakening. This combination removes the benefit of the doubt entirely.",
        how:"Verify whether the selling was open-market (most bearish), or a pledging/forced sale situation. A pledge call (lender selling shares pledged as collateral) may reflect personal liquidity issues rather than business outlook — still worth investigating.",
        example:"If a promoter goes from 55% to 51% over four quarters while EBITDA margin contracts and FCF declines, it's a significant compound warning. If the same selling happened while fundamentals improved, it's much less concerning.",
        trap:"Promoter selling alone is not always negative (see above). The combination with weakening fundamentals is what creates the compound signal."},

      { term:"Low P/E + Declining revenue",
        what:"A stock trading at a low multiple while its revenue is shrinking.",
        why:"The classic value trap: statistically cheap, but the business is getting smaller. The low P/E may stay low or get lower because the E in P/E keeps declining. The multiple can look cheap all the way to zero.",
        how:"Ask: what specifically has to be true for the revenue decline to reverse? Is there a concrete catalyst (new product, turnaround plan, cyclical recovery with a visible inflection)? Or is this structural decline with no clear end?",
        example:"A traditional print media company trades at P/E 8. Revenues declining 10% per year. The P/E looks attractive until you project forward: at -10% revenue for 3 years, the earnings base shrinks by 27% and the P/E reverts to looking normal or expensive on that smaller base.",
        trap:"Not all cheap-and-declining businesses are value traps. A cyclical business at the bottom of its cycle (chemicals, commodities) can look similar but recover strongly. The distinction is structural versus cyclical decline."},

      { term:"EBITDA margin high + FCF margin low",
        what:"Strong operating profit margin but weak free cash flow margin — a large gap between them.",
        why:"The gap between EBITDA and FCF is depreciation + capex + working capital change. If EBITDA is high but FCF is low, one of these bridges is consuming the cash. This matters enormously for whether the earnings multiple is justified.",
        how:"Check capex intensity (capex÷revenue). If capex is consistently 15-20% of revenue just to maintain the business, EBITDA is an inflated proxy for cash profit. Use FCF yield, not EBITDA yield, as your valuation anchor for such businesses.",
        example:"A telecom company with 35% EBITDA margin sounds impressive. But 20% of revenue goes to network maintenance capex. FCF margin is actually 8-10% — much more modest, and the right basis for valuation.",
        trap:"This doesn't mean high capex businesses are bad investments — it means you need to use the right metric (FCF yield) to value them, not the wrong one (EV/EBITDA), which ignores capex entirely."},

      { term:"Revenue growing + Margins compressing",
        what:"Top-line growth but declining profitability — the company is growing but getting less efficient.",
        why:"Growing revenue with falling margins usually means one of three things: discounting to win share, rising input costs being absorbed, or heavy investment in sales/marketing ahead of future revenue. Each has a different implication.",
        how:"Check gross margin first. If gross margin is stable but operating margin is falling, the cost pressure is in overhead or investment spending — possibly temporary. If gross margin is falling, the core pricing power is under pressure — harder to recover.",
        example:"A consumer brand grows 12% revenue but gross margin falls 2 points as raw material costs rise. If management can push through price increases over the next 2 quarters, the margin recovers. If the category is too competitive for price increases, the erosion continues.",
        trap:"Deliberate investment-phase margin compression (a company hiring 2,000 engineers ahead of a product launch) is very different from structural deterioration. Management's explanation matters — but so does whether they've been accurate in the past."},
    ]},

  /* ────────────────────────────────────────────────────────
     SECTION 7: MACRO FACTORS — THE WATER LEVEL AFFECTS ALL BOATS
  ──────────────────────────────────────────────────────── */
  { section:"Macro factors — the water level affects all boats",
    items:[
      { term:"Interest rates & equity valuation",
        what:"The relationship between the risk-free rate (government bond yield) and how stocks are priced.",
        why:"Every stock is priced as its future cash flows discounted to present value. The discount rate is closely related to interest rates. When rates rise, future cash flows are worth less today — mechanically reducing intrinsic values. Long-duration businesses (high-growth tech with cash flows far in the future) are hit hardest.",
        how:"When you raise the discount rate slider on the tearsheet, you're simulating rising rates. A stock that looks cheap at 8% discount rate and expensive at 12% is highly interest-rate sensitive. Stocks that look cheap at both rates have more genuine margin of safety.",
        example:"A software company with most of its value in years 5-15 of projected cash flows sees a 25-30% drop in intrinsic value when rates rise from 5% to 8%. A mature bank with earnings mostly in the near term is much less affected (and actually benefits from the rate rise through wider spreads).",
        trap:"Rate sensitivity works both ways — the companies most hurt by rising rates are the ones most helped by falling rates. Rising-rate environments aren't uniformly bad for all equities; they're very specifically bad for long-duration growth."},

      { term:"Crude oil — the pass-through economy",
        what:"Oil prices as an input cost driver that flows through to margins across multiple industries, often with a 1-2 quarter lag.",
        why:"Crude is a direct input for paints (solvents, resins), tyres, plastics, fertilisers, aviation fuel, and freight. It's also an indirect input for anything manufactured or transported. A significant move in crude creates winners and losers that are predictable before quarterly results confirm it.",
        how:"When crude falls: watch paints (Asian Paints, Berger), tyres (MRF, Balkrishna), airlines (IndiGo), logistics companies for margin tailwinds. When crude rises: these become headwinds; oil E&P companies (ONGC, Oil India) see revenue uplift. Margin impact typically shows in results 1-2 quarters after the price moves.",
        example:"If crude falls from $90 to $70/bbl, a paint company's solvent costs drop meaningfully. In the next quarterly result, gross margin expands even if revenue is flat. Analysts who tracked crude's movement could predict the margin improvement before the results came out.",
        trap:"Commodity prices are volatile and unpredictable. Don't overweight macro tailwinds/headwinds in isolation — pair them with the underlying quality of the business."},

      { term:"Currency (INR/USD for Indian stocks)",
        what:"The exchange rate between the Indian rupee and US dollar — the key currency pair for Indian IT exporters and commodity importers.",
        why:"Indian IT companies (TCS, Infosys, Wipro, HCL) bill clients in dollars but pay most costs in rupees. A weaker rupee means the same dollar revenue translates to more rupees — a direct, mechanical margin benefit. Conversely, Indian companies that import crude, equipment, or electronics face higher rupee costs when the rupee weakens.",
        how:"Approximate rule: a 5% rupee depreciation vs USD → ~1.5-2 percentage point tailwind to EBITDA margins for Indian IT exporters. For crude importers (Reliance's refining business, airlines), the same move is a corresponding headwind.",
        example:"If USD/INR moves from ₹83 to ₹87 (5% depreciation), Infosys's dollar revenues convert to 5% more rupees with no change in the underlying business. If IT margins were 21%, they might expand to 22.5% from this alone.",
        trap:"Many companies hedge their currency exposure — check whether the company actively hedges (in which case the immediate benefit is muted but volatility is reduced) or runs unhedged (full benefit/risk from currency moves)."},

      { term:"VIX — the fear gauge",
        what:"The CBOE Volatility Index, measuring the market's expectation of near-term equity volatility in the US — widely watched as a sentiment indicator.",
        why:"High VIX = elevated fear, risk-off environment. In such periods, even fundamentally strong stocks often fall as investors sell indiscriminately. Low VIX = calm markets, where stock-specific factors dominate. Knowing the VIX level helps you interpret price moves: was it company-specific, or was everything falling?",
        how:"VIX above 30 = significant stress, risk-off. 20-30 = elevated concern. 15-20 = normal range. Below 15 = complacency, stock-specific factors likely to dominate. In high-VIX environments, fundamental analysis can identify opportunities, but timing matters because everything can get cheaper still.",
        example:"During March 2020, VIX spiked to 80+ and every stock fell regardless of quality. Companies with solid fundamentals recovered fastest once VIX normalized. If you were analyzing a company during peak VIX and it looked fundamentally sound, waiting for VIX to normalize before acting preserved capital while capturing most of the upside.",
        trap:"Don't use VIX as a buy/sell signal on its own. Use it as context for interpreting price moves — was that 15% decline company-specific bad news, or was the whole market down 15%?"},
    ]},

  /* ────────────────────────────────────────────────────────
     SECTION 8: THE PLAYBOOK PATTERNS — IN DEPTH
  ──────────────────────────────────────────────────────── */
  { section:"The playbook patterns — in depth",
    items: PLAYBOOK.map(p=>({
      term: p.name,
      also: `Category: ${p.cat} · Formula: ${p.formula}`,
      what: p.meaning,
      why: p.read,
      how: "Open the Playbook tab and click this pattern to see which stocks in your dataset match it right now. Then open each match's tearsheet for the full picture.",
      example: "",
      trap: ""
    }))
  },
];

function renderLearn(){
  const sections = LEARN_CONTENT.map(s=>s.section);
  const q = State.learnSearch.toLowerCase().trim();

  // Filter items if searching
  const filtered = LEARN_CONTENT.map(sec=>({
    ...sec,
    items: q ? sec.items.filter(item=>
      item.term.toLowerCase().includes(q) ||
      (item.also||"").toLowerCase().includes(q) ||
      item.what.toLowerCase().includes(q) ||
      item.why.toLowerCase().includes(q)
    ) : sec.items
  })).filter(sec=> sec.items.length>0 &&
    (State.learnSection==="all" || sec.section===State.learnSection));

  return `
  <div class="secintro">
    <h2>The Financial Intelligence Guide</h2>
    <p>Every ratio, every signal, and every combination used in this dashboard — explained in plain English with worked examples, the reason it matters, and the trap to avoid. Read it as a course from top to bottom, or search for any specific concept.</p>
  </div>

  <div class="toolbar" style="margin-bottom:18px">
    <input class="search" id="learnSearch" placeholder="Search any concept, ratio, or term…" value="${State.learnSearch}" style="max-width:320px"/>
    <div class="seg" style="flex-wrap:wrap">
      <button class="seg ${State.learnSection==='all'?'on':''}" data-learnsec="all">All</button>
      ${sections.map(s=>`<button class="seg ${State.learnSection===s?'on':''}" data-learnsec="${s}">${s}</button>`).join("")}
    </div>
  </div>

  ${filtered.length===0?`<p style="color:var(--dim);font-size:13px">No concepts match "${State.learnSearch}". Try a different term.</p>`:""}

  ${filtered.map(sec=>`
    <div style="margin-bottom:40px">
      <div style="font-family:var(--mono);font-size:11px;letter-spacing:1px;text-transform:uppercase;
        color:var(--accent);font-weight:700;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--accent)">
        ${sec.section}
      </div>
      ${sec.items.map(item=>`
        <div style="margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid var(--line)">

          <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:8px">
            <span style="font-size:17px;font-weight:800;color:var(--ink)">${item.term}</span>
            ${item.also?`<span style="font-size:11.5px;color:var(--dim);font-family:var(--mono)">${item.also}</span>`:""}
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:8px">

            <div style="background:var(--accent-soft);border-radius:8px;padding:14px 16px">
              <div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
                color:var(--accent);font-family:var(--mono);margin-bottom:6px">What it is</div>
              <p style="font-size:13.5px;color:#0a3d32;line-height:1.6;margin:0">${item.what}</p>
            </div>

            <div style="background:#f8f4ff;border-radius:8px;padding:14px 16px">
              <div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
                color:#6d3dd3;font-family:var(--mono);margin-bottom:6px">Why it matters</div>
              <p style="font-size:13.5px;color:#2d1a5e;line-height:1.6;margin:0">${item.why}</p>
            </div>

            ${item.how?`
            <div style="background:#fff9f0;border-radius:8px;padding:14px 16px">
              <div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
                color:#b8860b;font-family:var(--mono);margin-bottom:6px">How to use it</div>
              <p style="font-size:13.5px;color:#4a3800;line-height:1.6;margin:0">${item.how}</p>
            </div>`:""}

            ${item.example?`
            <div style="background:#f0f6ff;border-radius:8px;padding:14px 16px">
              <div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
                color:#2563eb;font-family:var(--mono);margin-bottom:6px">Worked example</div>
              <p style="font-size:13px;color:#1a2c5e;line-height:1.6;margin:0">${item.example}</p>
            </div>`:""}

            ${item.trap?`
            <div style="background:#fef3f0;border-radius:8px;padding:14px 16px">
              <div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
                color:var(--warn);font-family:var(--mono);margin-bottom:6px">⚠ Common trap</div>
              <p style="font-size:13px;color:#5e1a14;line-height:1.6;margin:0">${item.trap}</p>
            </div>`:""}

          </div>
        </div>
      `).join("")}
    </div>
  `).join("")}
  <p class="hint" style="margin-top:10px">The Playbook Patterns section above is auto-generated from the live combinations — if you add new patterns to the Playbook, they automatically appear here too.</p>
  `;
}

function renderWatchDrawer(){
  if(!State.showWatchlist) return "";
  const rows = computeRows().filter(s=>State.watchlist.includes(s.t));
  return `
  <div class="watchlist show">
    <div style="font-weight:700;margin-bottom:10px">★ Your watchlist</div>
    ${rows.length===0?`<div class="watchempty">No stocks pinned yet — click the star on any row or tearsheet to add one.</div>`:
    rows.map(s=>`<div class="watchrow"><span data-open="${s.t}" style="cursor:pointer;font-weight:600">${s.t} <span style="color:var(--dim);font-weight:400">${s.n}</span></span><span style="color:${clr(s.mos)}">${sign(s.mos)} vs DCF</span></div>`).join("")}
  </div>`;
}


/* ============================================================
   DECISION ENGINE UI — the analytical pyramid rendered:
   quadrant map, pillar bars with evidence, cross-linkage verdict
   cards, reasoning chain, confidence, and thesis monitors.
   ============================================================ */
function renderDecisionEngine(s){
  const P = pillarScores(s);
  const L = crossLinkages(s, P);
  const D = decisionSynthesis(s, P, L, MACRO_DATA);
  const V = veteranMetrics(s);
  const reconciliation = reconcileLenses(s, P, D, V);
  const open = State.decisionOpen;

  // quadrant map: x = price attractiveness, y = quality
  const px = 20 + (D.price/100)*160, py = 180 - (D.quality/100)*160;

  return `
  <div class="matrix" style="margin-top:16px;border-width:2px;border-color:${D.qColor}">
    <div class="matrixhead" style="background:${D.qColor}10">
      DECISION ENGINE · the full analytical pyramid
      <span style="font-size:11px;color:var(--dim);font-weight:400">confidence: <b style="color:${D.confidence==='High'?'var(--good)':D.confidence==='Moderate'?'var(--neutral)':'var(--warn)'}">${D.confidence}</b></span>
    </div>

    <div style="padding:18px;display:grid;grid-template-columns:220px 1fr;gap:24px;align-items:start">
      <div>
        <svg viewBox="0 0 200 200" style="width:100%;max-width:220px;display:block">
          <rect x="20" y="20" width="80" height="80" fill="#fdecea" opacity="0.6"/>
          <rect x="100" y="20" width="80" height="80" fill="#e9f7f1" opacity="0.8"/>
          <rect x="20" y="100" width="80" height="80" fill="#fdecea" opacity="0.9"/>
          <rect x="100" y="100" width="80" height="80" fill="#fbf3e0" opacity="0.8"/>
          <line x1="100" y1="20" x2="100" y2="180" stroke="#ccc" stroke-width="0.7"/>
          <line x1="20" y1="100" x2="180" y2="100" stroke="#ccc" stroke-width="0.7"/>
          <text x="60" y="15" text-anchor="middle" font-size="7" fill="#888">EXPENSIVE</text>
          <text x="140" y="15" text-anchor="middle" font-size="7" fill="#888">CHEAP</text>
          <text x="12" y="60" text-anchor="middle" font-size="7" fill="#888" transform="rotate(-90 12 60)">HIGH QUALITY</text>
          <text x="12" y="140" text-anchor="middle" font-size="7" fill="#888" transform="rotate(-90 12 140)">LOW QUALITY</text>
          <text x="140" y="55" text-anchor="middle" font-size="6.5" fill="#1a8a63" font-weight="bold">PRIME</text>
          <text x="60" y="55" text-anchor="middle" font-size="6.5" fill="#b8860b" font-weight="bold">WATCHLIST</text>
          <text x="140" y="145" text-anchor="middle" font-size="6.5" fill="#b8860b" font-weight="bold">TRAP RISK</text>
          <text x="60" y="145" text-anchor="middle" font-size="6.5" fill="#c0392b" font-weight="bold">AVOID</text>
          <circle cx="${px}" cy="${py}" r="7" fill="${D.qColor}" stroke="#fff" stroke-width="2"/>
          <text x="${px}" y="${py+2.5}" text-anchor="middle" font-size="6" fill="#fff" font-weight="bold">●</text>
        </svg>
        <div style="text-align:center;margin-top:8px">
          <div style="font-weight:800;font-size:14px;color:${D.qColor}">${D.quadrant}</div>
          <div style="font-size:11px;color:var(--dim);font-family:var(--mono)">Quality ${D.quality} · Price ${D.price}</div>
        </div>
      </div>

      <div>
        <p style="font-size:15px;font-weight:700;margin:0 0 6px">${D.headline}</p>
        <p style="font-size:13px;color:#333;line-height:1.6;margin:0 0 12px">${D.guidance}</p>
        <div style="font-size:11px;letter-spacing:.5px;color:var(--dim);font-weight:700;margin-bottom:6px">WHY IT LANDS HERE</div>
        ${D.reasoning.map(r=>`<p style="font-size:12.5px;color:#444;margin:0 0 5px;line-height:1.5">· ${r}</p>`).join("")}
        <p style="font-size:11.5px;color:var(--dim);margin:10px 0 0;font-style:italic">${D.confNote}</p>
      </div>
    </div>

    <div style="padding:0 18px 6px">
      <button class="learntoggle" data-decision="pillars">${open==='pillars'?'▾':'▸'} Level 2 — Pillar scores &amp; evidence (8)</button>
      <button class="learntoggle" data-decision="linkages" style="margin-left:6px">${open==='linkages'?'▾':'▸'} Level 3 — Cross-linkages (${L.length})</button>
      <button class="learntoggle" data-decision="monitors" style="margin-left:6px">${open==='monitors'?'▾':'▸'} Level 5 — What would change this verdict</button>
      ${reconciliation.length?`<button class="learntoggle" data-decision="reconcile" style="margin-left:6px;border-color:#6d3dd3;color:#6d3dd3">${open==='reconcile'?'▾':'▸'} ⚖ Veteran's Lens disagrees here — why (${reconciliation.length})</button>`:''}
    </div>

    ${open==='pillars'?`
    <div style="padding:8px 18px 18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px">
      ${Object.values(P).map(p=>`
        <div style="border:1px solid var(--line);border-radius:8px;padding:12px 14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-weight:700;font-size:13px">${p.name}</span>
            <span style="font-weight:800;font-size:13px;color:${p.color}">${p.score} · ${p.verdict}</span>
          </div>
          <div class="defbar" style="width:100%"><div class="deffill" style="width:${p.score}%;background:${p.color}"></div></div>
          <div style="margin-top:8px">
            ${p.evidence.map(e=>`<p style="font-size:11.5px;margin:3px 0;color:${e.pts>0?'var(--good)':e.pts<0?'var(--warn)':'var(--dim)'}">${e.pts>0?'▲':e.pts<0?'▼':'•'} ${e.txt}</p>`).join("")}
          </div>
        </div>`).join("")}
    </div>`:''}

    ${open==='linkages'?`
    <div style="padding:8px 18px 18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px">
      ${L.map(l=>`
        <div style="border:1px solid var(--line);border-left:4px solid ${l.color};border-radius:8px;padding:12px 14px">
          <div style="font-size:10px;letter-spacing:.5px;color:var(--dim);font-family:var(--mono);text-transform:uppercase">${l.a} × ${l.b}</div>
          <div style="font-weight:700;font-size:13px;margin:3px 0">${l.question}</div>
          <div style="font-weight:800;font-size:13.5px;color:${l.color};margin-bottom:6px">→ ${l.verdict}</div>
          <p style="font-size:12px;color:#444;line-height:1.5;margin:0 0 6px">${l.insight}</p>
          <p style="font-size:11.5px;color:var(--accent);line-height:1.5;margin:0"><b>Next step:</b> ${l.action}</p>
        </div>`).join("")}
    </div>`:''}

    ${open==='monitors'?`
    <div style="padding:8px 18px 18px">
      <p style="font-size:12px;color:var(--dim);margin:0 0 10px">These are the metrics currently closest to a verdict boundary — the specific things that would move this stock to a different quadrant if they change:</p>
      ${D.monitors.map(m=>`<div style="border:1px solid var(--line);border-radius:8px;padding:11px 14px;margin-bottom:8px;font-size:12.5px;color:#333;line-height:1.55">⚑ ${m}</div>`).join("")}
    </div>`:''}

    ${open==='reconcile'?`
    <div style="padding:8px 18px 18px">
      <p style="font-size:12px;color:var(--dim);margin:0 0 12px">Veteran's Lens and this Decision Engine sometimes read the same stock differently — not because one is wrong, but because they're built to answer different questions. Here's exactly why, for this stock:</p>
      ${reconciliation.map(n=>`
        <div style="border:1px solid #d8c8f2;background:#f8f4ff;border-radius:8px;padding:14px 16px;margin-bottom:10px">
          <div style="font-weight:700;font-size:13.5px;color:#2d1a5e;margin-bottom:8px">${n.title}</div>
          <p style="font-size:12.5px;color:#333;line-height:1.6;margin:0 0 8px"><b>What's happening:</b> ${n.mechanism}</p>
          <p style="font-size:12.5px;color:#2d1a5e;line-height:1.6;margin:0"><b>Which to weight more:</b> ${n.moreRelevant}</p>
        </div>`).join("")}
    </div>`:''}
  </div>`;
}


/* ============================================================
   VETERAN'S LENS TAB — six assessments a 50-year investor uses
   that standard screeners never show, ranked across the universe.
   ============================================================ */
const VETERAN_LENSES=[
  ["steadiness","1. Steadiness over flash","Consistency of results is worth more than their level. A business earning a steady 15% beats one oscillating 5%→30% — because you can actually hold, size, and compound the steady one. Screeners rank the average; veterans rank the variance."],
  ["incremental","2. Incremental economics","Not \"what is the margin\" but \"what margin did the LAST dollar of revenue arrive at?\" Improving marginal economics precede reported margin expansion by years — it is the future arriving early, visible only if you compute it."],
  ["impliedGrowth","3. What the price already assumes","Invert the DCF: solve for the growth the current price implies, then ask — has this company EVER delivered that? The gap between implied and demonstrated is where returns actually come from. Everything else is commentary."],
  ["accruals","4. The accruals smell test","(Profit − operating cash) ÷ revenue. When earnings persistently run ahead of cash, companies systematically disappoint later — the most academically validated red flag in accounting (the Sloan anomaly), and almost never on a retail screen."],
  ["reinvest","5. Reinvestment effectiveness","Revenue added per dollar of capex. Did management's spending buy growth, or is it treadmill maintenance dressed as investment? This is the capital-allocation report card nobody publishes."],
  ["resilience","6. Worst-year resilience","Veterans size positions by the floor, not the average. What did the WORST year in the window look like? That is the year you must be able to hold through — and the averages hide it."],
];
function renderVeteran(){
  const allRows = computeRows();
  const scoped = State.veteranMkt==="ALL" ? allRows : allRows.filter(s=>s.mkt===State.veteranMkt);
  const rows = scoped.map(s=>({s, V:veteranMetrics(s)}))
    .sort((a,b)=>b.V.composite-a.V.composite);

  const bySector = {};
  rows.forEach(r=>{ (bySector[r.s.sec]=bySector[r.s.sec]||[]).push(r); });
  const sectorNames = Object.keys(bySector).sort((a,b)=>bySector[b].length-bySector[a].length);

  const intro = `
  <div class="secintro">
    <h2>The Veteran's Lens</h2>
    <p>Six assessments drawn from how investors with decades of scar tissue actually filter — none of them standard screener parameters, because anything everyone screens on is already in the price. Each lens below explains its own reasoning. Click any stock for the full six-lens breakdown.</p>
  </div>
  <div class="panelgrid" style="margin-bottom:22px">
    ${VETERAN_LENSES.map(([k,t,d])=>`<div class="panel"><div class="panelt" style="margin-bottom:6px">${t}</div><p style="font-size:13px;color:#444;line-height:1.6;margin:0">${d}</p></div>`).join("")}
  </div>
  <div class="toolbar" style="margin-bottom:14px">
    <div class="seg">
      ${["ALL","US","IN"].map(m=>`<button data-vmkt="${m}" class="${State.veteranMkt===m?'on':''}">${m==="US"?"S&P 500":m==="IN"?"Nifty":"All markets"}</button>`).join("")}
    </div>
    <span style="font-size:12px;color:var(--dim);align-self:center">${rows.length} stocks in scope</span>
  </div>
  <div class="viewtoggle" style="margin-bottom:18px">
    <button data-vview="sector" class="${State.veteranView==='sector'?'on':''}">Top 5 by sector</button>
    <button data-vview="full" class="${State.veteranView==='full'?'on':''}">Full ranking</button>
  </div>`;

  if(State.veteranView==="sector"){
    return intro + `
    <div style="display:flex;flex-direction:column;gap:22px">
      ${sectorNames.map(sec=>{
        const top5 = bySector[sec].slice(0,5);
        return `
        <div class="scorebox">
          <div class="cyclehead">${sec.toUpperCase()} · top ${top5.length} of ${bySector[sec].length} by Veteran Score</div>
          <div style="overflow-x:auto">
          <table class="grid" style="border:none;border-radius:0">
            <thead><tr>
              <th class="left">Rank</th><th class="left">Stock</th><th>Steadiness</th><th>Incremental</th><th>Implied vs proven</th><th>Accruals</th><th>Reinvestment</th><th>Worst year</th><th>Veteran score</th>
            </tr></thead>
            <tbody>
              ${top5.map(({s,V},i)=>{
                const cell=m=>`<td><span class="pill ${m.score>=68?'good':m.score>=45?'neutral':'warn'}" title="${m.verdict}">${m.score}</span></td>`;
                const isOpen=State.veteranOpen===s.t;
                return `
                <tr class="row" data-vopen="${s.t}">
                  <td class="left" style="color:var(--dim);font-family:var(--mono)">#${i+1}</td>
                  <td class="left"><span class="tname">${s.t}</span><span class="tsub">${s.n}</span></td>
                  ${cell(V.steadiness)}${cell(V.incremental)}${cell(V.impliedGrowth)}${cell(V.accruals)}${cell(V.reinvest)}${cell(V.resilience)}
                  <td><span class="pill ${V.composite>=65?'good':V.composite>=48?'neutral':'warn'}" style="font-size:13px">${V.composite}</span></td>
                </tr>
                ${isOpen?`<tr><td colspan="9" style="text-align:left;background:#fafaf8;padding:18px 22px">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <b style="font-size:15px">${s.n} — the six lenses</b>
                    <button class="preset" data-open="${s.t}">Open full tearsheet →</button>
                  </div>
                  ${VETERAN_LENSES.map(([k,t])=>{const m=V[k];return `
                  <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line)">
                    <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
                      <b style="font-size:13.5px">${t.replace(/^\d+\. /,'')}</b>
                      <span class="pill ${m.score>=68?'good':m.score>=45?'neutral':'warn'}">${m.score} · ${m.verdict}</span>
                    </div>
                    <p style="font-size:13px;color:#333;line-height:1.6;margin:6px 0 0">${m.read}</p>
                  </div>`;}).join("")}
                </td></tr>`:''}`;
              }).join("")}
            </tbody>
          </table>
          </div>
        </div>`;
      }).join("")}
    </div>
    <p class="hint" style="margin-top:18px">Ranked by Veteran Score (equal-weighted average of all six lenses) within each sector. Sectors with fewer than 5 names show all available. Honest caveat: several lenses (steadiness, resilience, reinvestment) work best with 8-10 years of history; this dataset carries 4, so treat borderline scores gently.</p>
    `;
  }

  return intro + `
  <div style="overflow-x:auto">
  <table class="grid">
    <thead><tr>
      <th class="left">Stock</th><th>Steadiness</th><th>Incremental</th><th>Implied vs proven</th><th>Accruals</th><th>Reinvestment</th><th>Worst year</th><th>Veteran score</th>
    </tr></thead>
    <tbody>
      ${rows.map(({s,V})=>{
        const cell=m=>`<td><span class="pill ${m.score>=68?'good':m.score>=45?'neutral':'warn'}" title="${m.verdict}">${m.score}</span></td>`;
        const isOpen=State.veteranOpen===s.t;
        return `
        <tr class="row" data-vopen="${s.t}">
          <td class="left"><span class="tname">${s.t}</span><span class="tsub">${s.n}</span></td>
          ${cell(V.steadiness)}${cell(V.incremental)}${cell(V.impliedGrowth)}${cell(V.accruals)}${cell(V.reinvest)}${cell(V.resilience)}
          <td><span class="pill ${V.composite>=65?'good':V.composite>=48?'neutral':'warn'}" style="font-size:13px">${V.composite}</span></td>
        </tr>
        ${isOpen?`<tr><td colspan="8" style="text-align:left;background:#fafaf8;padding:18px 22px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <b style="font-size:15px">${s.n} — the six lenses</b>
            <button class="preset" data-open="${s.t}">Open full tearsheet →</button>
          </div>
          ${VETERAN_LENSES.map(([k,t])=>{const m=V[k];return `
          <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line)">
            <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
              <b style="font-size:13.5px">${t.replace(/^\d+\. /,'')}</b>
              <span class="pill ${m.score>=68?'good':m.score>=45?'neutral':'warn'}">${m.score} · ${m.verdict}</span>
            <p style="font-size:13px;color:#333;line-height:1.6;margin:6px 0 0">${m.read}</p>
          </div>`;}).join("")}
        </td></tr>`:''}`;
      }).join("")}
    </tbody>
  </table>
  </div>
  <p class="hint">Honest caveat: several lenses (steadiness, resilience, reinvestment) work best with 8-10 years of history; this dataset carries 4, so treat borderline scores gently. The implied-growth lens uses a 10% discount rate fading to 3% terminal — the same conservative frame throughout the dashboard.</p>
  `;
}

function render(){
  const root = document.getElementById("root");
  const dataHealthStrip = (() => {
    const S = STATUS_DATA || {};
    const keys = Object.keys(S).filter(k=>k!=="fetch_custom");
    if(!keys.length) return "";
    const items = keys.map(k=>{
      const r = S[k];
      const ok = r.status==="ok"||r.status==="partial";
      const age = r.updatedAt ? (() => {
        const mins = Math.round((Date.now()-new Date(r.updatedAt).getTime())/60000);
        return mins<60 ? mins+"m ago" : Math.round(mins/60)+"h ago";
      })() : "?";
      const count = r.count!=null ? ` ${r.count}` : "";
      return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px">
        <span style="width:6px;height:6px;border-radius:50%;background:${ok?"var(--good)":"var(--warn)"}"></span>
        <span style="color:var(--dim)">${k.replace("fetch_","")}</span><span style="color:${ok?"var(--good)":"var(--warn)"}">${age}${count}</span>
      </span>`;
    });
    const latest = keys.map(k=>S[k].updatedAt).filter(Boolean).sort().pop();
    const latestAge = latest ? (() => {
      const mins = Math.round((Date.now()-new Date(latest).getTime())/60000);
      return mins<60 ? mins+"m ago" : Math.round(mins/60)+"h ago";
    })() : null;
    const allOk = keys.every(k=>S[k].status==="ok"||S[k].status==="partial");
    return `<div style="background:var(--panel);border-bottom:1px solid var(--line);padding:3px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:11px;font-weight:600;color:${allOk?"var(--good)":"var(--warn)"}">${allOk?"✓":"⚠"} Data</span>
      ${latestAge?`<span style="font-size:11px;color:var(--dim)">last refresh ${latestAge}</span>`:""}
      <div style="display:flex;gap:10px;flex-wrap:wrap">${items.join("")}</div>
    </div>`;
  })();
  root.innerHTML = `
    ${renderHeader()}
    ${dataHealthStrip}
    <div class="wrap">
      ${renderWatchDrawer()}
      ${State.tab==="portfolio" ? renderPortfolio() : State.tab==="workflow" ? renderWorkflow() : State.tab==="sectors" ? renderSectors() : State.tab==="compare" ? renderCompare() : State.tab==="playbook" ? renderPlaybook() : State.tab==="learn" ? renderLearn() : State.tab==="veteran" ? renderVeteran() : (State.sel ? renderTearsheet(State.sel) : renderScreener())}
    </div>
  `;
  wireEvents();
}

function wireEvents(){
  const root = document.getElementById("root");

  root.querySelectorAll("[data-tab]").forEach(el=>el.onclick=()=>{State.tab=el.dataset.tab;State.sel=null;render();});
  if (typeof wireWorkflow === "function" && State.tab === "workflow") wireWorkflow(root);
  if (typeof wirePortfolio === "function" && State.tab === "portfolio") wirePortfolio(root);
  const homeLink=root.querySelector("[data-home]");
  if(homeLink) homeLink.onclick=()=>{State.tab="stocks";State.sel=null;State.preset="all";State.mkt="ALL";State.capTier="ALL";State.q="";render();window.scrollTo(0,0);};
  const watchToggle=document.getElementById("watchToggle");
  if(watchToggle) watchToggle.onclick=()=>{State.showWatchlist=!State.showWatchlist;render();};

  root.querySelectorAll("[data-preset]").forEach(el=>el.onclick=()=>{State.preset=el.dataset.preset;render();});
  root.querySelectorAll("[data-mkt]").forEach(el=>el.onclick=()=>{State.mkt=el.dataset.mkt;render();});
  root.querySelectorAll("[data-cap]").forEach(el=>el.onclick=()=>{State.capTier=el.dataset.cap;render();});

  const filtersToggle = root.querySelector("[data-filterstoggle]");
  if(filtersToggle) filtersToggle.onclick=(e)=>{ if(e.target.closest('[data-clearfilters]'))return; State.filtersOpen=!State.filtersOpen;render();};
  const clearFiltersBtn = root.querySelector("[data-clearfilters]");
  if(clearFiltersBtn) clearFiltersBtn.onclick=(e)=>{ e.stopPropagation();
    State.filters = { sectors:[], revG:{min:null,max:null}, fcfG:{min:null,max:null}, pe:{min:null,max:null},
      mos:{min:null,max:null}, health:{min:null,max:null}, mcap:{min:null,max:null} };
    render(); };
  root.querySelectorAll("[data-sectorchip]").forEach(el=>el.onclick=()=>{
    const sec = el.dataset.sectorchip;
    const i = State.filters.sectors.indexOf(sec);
    if(i>=0) State.filters.sectors.splice(i,1); else State.filters.sectors.push(sec);
    render();
  });
  root.querySelectorAll("[data-numfilter]").forEach(el=>{
    el.onchange=(e)=>{
      const k=el.dataset.numfilter, bound=el.dataset.bound;
      const v = e.target.value.trim()==="" ? null : parseFloat(e.target.value);
      State.filters[k][bound] = (v!=null && isNaN(v)) ? null : v;
      render();
    };
  });
  root.querySelectorAll("[data-filterlogic]").forEach(el=>el.onclick=()=>{State.filterLogic=el.dataset.filterlogic;render();});
  root.querySelectorAll("[data-sort]").forEach(el=>el.onclick=()=>{State.sort=el.dataset.sort;render();});
  const globalSearchBox=document.getElementById("globalSearchBox");
  if(globalSearchBox){
    globalSearchBox.oninput=e=>{State.q=e.target.value;render();};
    globalSearchBox.onkeydown=e=>{
      if(e.key==="Enter"){
        const matches=globalSearchMatches(State.q,1);
        if(matches.length){ State.returnTab=State.tab; State.sel=matches[0].t; State.tab="stocks"; State.q=""; render(); window.scrollTo(0,0); }
      } else if(e.key==="Escape"){ State.q=""; render(); }
    };
    globalSearchBox.focus(); globalSearchBox.setSelectionRange(State.q.length,State.q.length);
  }
  root.querySelectorAll("[data-jumpto]").forEach(el=>el.onclick=()=>{
    State.returnTab=State.tab; State.sel=el.dataset.jumpto; State.tab="stocks"; State.q=""; State.kpiExpanded=false; render(); window.scrollTo(0,0);
  });

  root.querySelectorAll("[data-earningmarker]").forEach(el=>el.onclick=(e)=>{
    e.stopPropagation();
    const row = document.getElementById(`earnrow-${el.dataset.earningmarker}`);
    if(row){
      row.scrollIntoView({behavior:"smooth", block:"center"});
      row.style.transition="background .3s"; row.style.background="var(--accent-soft)";
      setTimeout(()=>{ row.style.background=""; }, 1600);
    }
  });

  root.querySelectorAll("[data-open]").forEach(el=>el.onclick=(e)=>{ if(e.target.closest('[data-star]')||e.target.closest('[data-cmp]'))return; State.returnTab=State.tab; State.sel=el.dataset.open;State.tab="stocks";State.kpiExpanded=false;render();window.scrollTo(0,0);});
  root.querySelectorAll("[data-opensector]").forEach(el=>el.onclick=()=>{ if(el.dataset.opensector){State.returnTab=State.tab; State.sel=el.dataset.opensector;State.tab="stocks";render();window.scrollTo(0,0);}});
  const goBack=()=>{State.sel=null; const rt=State.returnTab; if(rt&&rt!=="stocks"){State.tab=rt; State.returnTab=null;} render(); window.scrollTo({top:0,behavior:"smooth"});};
  const backBtn=document.getElementById("backBtn");
  if(backBtn) backBtn.onclick=()=>{State.sel=null; const rt=State.returnTab; if(rt&&rt!=="stocks"){State.tab=rt; State.returnTab=null;} render(); window.scrollTo({top:0,behavior:"smooth"});};

  root.querySelectorAll("[data-star]").forEach(el=>el.onclick=(e)=>{e.stopPropagation();toggleWatch(el.dataset.star);});
  root.querySelectorAll("[data-cmp]").forEach(el=>el.onclick=(e)=>{e.stopPropagation();toggleCompare(el.dataset.cmp);});

  const kpiToggle=document.getElementById("kpiToggle");
  if(kpiToggle) kpiToggle.onclick=()=>{State.kpiExpanded=!State.kpiExpanded;render();};

  root.querySelectorAll("[data-view]").forEach(el=>el.onclick=()=>{State.view=el.dataset.view;render();});

  const discountSlider=document.getElementById("discountSlider");
  if(discountSlider) discountSlider.oninput=e=>{State.discount=+e.target.value; if(State.termGrowth>State.discount-2) State.termGrowth=Math.max(1,State.discount-2); invalidateRowsCache(); render();};
  const termSlider=document.getElementById("termSlider");
  if(termSlider) termSlider.oninput=e=>{State.termGrowth=Math.min(+e.target.value, Math.max(1,State.discount-2)); invalidateRowsCache(); render();};

  const learnToggle=document.getElementById("learnToggle");
  if(learnToggle) learnToggle.onclick=()=>{State.learnMode=!State.learnMode;render();};
  root.querySelectorAll("[data-flagtoggle]").forEach(el=>el.onclick=()=>{
    if(State.learnMode) return;
    const detail=root.querySelector(`[data-flagdetail="${el.dataset.flagtoggle}"]`);
    if(detail) detail.style.display = detail.style.display==="none" ? "flex" : "none";
  });

  /* live AI chat (Gemini) */
  const aiKeySave=root.querySelector("[data-aikeysave]");
  if(aiKeySave) aiKeySave.onclick=()=>{ const v=(document.getElementById("aiKeyInput")?.value||"").trim(); setGeminiKey(v);
    try{ localStorage.removeItem("terminal_gemini_model"); localStorage.removeItem("terminal_gemini_tools"); }catch(e){}
    GEMINI_MODELS_CACHE=null; State.aiKeyEdit=false; render(); };
  const aiKeyEdit=root.querySelector("[data-aikeyedit]");
  if(aiKeyEdit) aiKeyEdit.onclick=()=>{ State.aiKeyEdit=true; render(); };
  const aiSend=root.querySelector("[data-aisend]");
  const aiFire=()=>{ const inp=document.getElementById("aiChatInput"); if(inp && inp.value.trim() && State.sel) sendAIMessage(State.sel, inp.value); };
  if(aiSend) aiSend.onclick=aiFire;
  const aiInput=document.getElementById("aiChatInput");
  if(aiInput) aiInput.onkeydown=e=>{ if(e.key==="Enter") aiFire(); };
  root.querySelectorAll("[data-aichip]").forEach(el=>el.onclick=()=>{ if(State.sel) sendAIMessage(State.sel, el.dataset.aichip); });

  root.querySelectorAll("[data-ask]").forEach(el=>el.onclick=()=>handleAsk(el.dataset.tk, el.dataset.ask));
  root.querySelectorAll("[data-earnings]").forEach(el=>el.onclick=()=>handleEarnings(el.dataset.earnings));
  root.querySelectorAll("[data-edgarfill]").forEach(el=>el.onclick=()=>{
    const box=document.getElementById("transcriptBox");
    if(box){ const t=getEdgarText(el.dataset.edgarfill); if(t) box.value=t; box.focus(); }
  });

  root.querySelectorAll("[data-driver]").forEach(el=>el.onclick=()=>{State.driverDir[el.dataset.driver]=el.dataset.dir;render();});
  root.querySelectorAll("[data-phase]").forEach(el=>el.onclick=()=>{State.phase=+el.dataset.phase;render();});

  root.querySelectorAll("[data-pbcat]").forEach(el=>el.onclick=()=>{State.playbookCat=el.dataset.pbcat;render();});
  root.querySelectorAll("[data-pbmkt]").forEach(el=>el.onclick=()=>{State.playbookMkt=el.dataset.pbmkt;render();});
  root.querySelectorAll("[data-pbtoggle]").forEach(el=>el.onclick=()=>{
    State.playbookOpen = State.playbookOpen===el.dataset.pbtoggle ? null : el.dataset.pbtoggle;
    render();
  });

  root.querySelectorAll("[data-decision]").forEach(el=>el.onclick=()=>{
    State.decisionOpen = State.decisionOpen===el.dataset.decision ? null : el.dataset.decision;
    render();
  });

  root.querySelectorAll("[data-learnsec]").forEach(el=>el.onclick=()=>{State.learnSection=el.dataset.learnsec;render();});
  root.querySelectorAll("[data-vopen]").forEach(el=>el.onclick=(e)=>{ if(e.target.closest('[data-open]'))return; State.veteranOpen=State.veteranOpen===el.dataset.vopen?null:el.dataset.vopen;render();});
  root.querySelectorAll("[data-vview]").forEach(el=>el.onclick=()=>{State.veteranView=el.dataset.vview;State.veteranOpen=null;render();});
  root.querySelectorAll("[data-vmkt]").forEach(el=>el.onclick=()=>{State.veteranMkt=el.dataset.vmkt;State.veteranOpen=null;render();});
  const learnSearch=document.getElementById("learnSearch");
  if(learnSearch){ learnSearch.oninput=e=>{State.learnSearch=e.target.value;render();}; }

  // Gemini AI chat handlers
  const aiKeyInput=document.getElementById("aiKeyInput");
  root.querySelectorAll("[data-aikeysave]").forEach(el=>el.onclick=()=>{
    const inp=document.getElementById("aiKeyInput");
    const k=(inp?.value||"").trim();
    if(k){ setGeminiKey(k); GEMINI_MODELS_CACHE=null; }
    State.aiKeyEdit=false; render();
  });
  root.querySelectorAll("[data-aikeyedit]").forEach(el=>el.onclick=()=>{State.aiKeyEdit=true; render();});
  root.querySelectorAll("[data-aichip]").forEach(el=>el.onclick=()=>{
    if(State.sel) sendAIMessage(State.sel, el.dataset.aichip);
  });
  root.querySelectorAll("[data-aisend]").forEach(el=>el.onclick=()=>{
    const inp=document.getElementById("aiChatInput");
    if(inp && State.sel) sendAIMessage(State.sel, inp.value);
  });
  const aiChatInput=document.getElementById("aiChatInput");
  if(aiChatInput) aiChatInput.onkeydown=e=>{
    if(e.key==="Enter" && !e.shiftKey && State.sel){ e.preventDefault(); sendAIMessage(State.sel, aiChatInput.value); }
  };
}

render();
