/* ============================================================
   PORTFOLIO.JS — analyze YOUR holdings with the exact same logic
   as the screener and the funnel, then suggest optimizations.

   Design decisions (honest constraints of a static site):
   - A browser cannot fetch Yahoo fundamentals directly (CORS), so
     stocks OUTSIDE the loaded universe cannot be analyzed on the
     spot. Instead, this tab maintains custom_tickers.json: add a
     ticker here, download the file into the repo, and the next
     pipeline run (fetch_data.py) analyzes it with identical logic.
     The tab tracks these as "pending" until data arrives.
   - Import accepts CSV natively and .xlsx via SheetJS (loaded from
     CDN in index.html; if offline/blocked, the tab says so and
     asks for CSV).
   - Optimization suggestions are RULE-BASED and each states its
     evidence. This is educational analysis, not investment advice
     — the tab says that too, prominently.
   ============================================================ */

/* ---------- persisted portfolio state ---------- */
const PORTFOLIO_DEFAULT = { holdings:[], custom:{US:[],IN:[]}, lossTol:1.5 };
function loadPortfolio(){
  try { const p = JSON.parse(localStorage.getItem("terminal_portfolio")||"{}");
    return Object.assign({}, PORTFOLIO_DEFAULT, p, {custom:Object.assign({US:[],IN:[]}, p.custom||{})}); }
  catch(e){ return JSON.parse(JSON.stringify(PORTFOLIO_DEFAULT)); }
}
function savePortfolio(){ try{ localStorage.setItem("terminal_portfolio", JSON.stringify(State.portfolio)); }catch(e){} }

/* ---------- CSV parsing (delimiter + header autodetection) ---------- */
const PF_ALIASES = {
  t:   ["ticker","symbol","stock","scrip","tradingsymbol","instrument","name of company","company"],
  qty: ["qty","quantity","shares","units","holding","qty.","quantity available"],
  cost:["avgcost","avg cost","avg. cost","avg price","avg. price","average price","buy price","buyprice","cost","purchase price","avg buy"],
  mkt: ["market","mkt","exchange","country"],
};
function parseHoldingsCSV(text){
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l);
  if(!lines.length) return {rows:[], error:"Empty file."};
  const delim = [",",";","\t"].map(d=>({d, n:(lines[0].match(new RegExp(d==="\t"?"\t":"\\"+d,"g"))||[]).length}))
    .sort((a,b)=>b.n-a.n)[0].n>0 ? [",",";","\t"].sort((a,b)=>
      (lines[0].split(b).length)-(lines[0].split(a).length))[0] : ",";
  const split = l => l.split(delim).map(c=>c.replace(/^["']|["']$/g,"").trim());
  const header = split(lines[0]).map(h=>h.toLowerCase());
  const col = key => header.findIndex(h=>PF_ALIASES[key].some(a=>h===a || h.includes(a)));
  const iT=col("t"), iQ=col("qty"), iC=col("cost"), iM=col("mkt");
  if(iT<0) return {rows:[], error:`Couldn't find a ticker/symbol column. Headers seen: ${header.join(", ")}. Expected one of: ${PF_ALIASES.t.join(", ")}.`};
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const c = split(lines[i]);
    let t = (c[iT]||"").toUpperCase().trim();
    if(!t) continue;
    let mkt = null;
    if(/\.(NS|BO)$/.test(t)){ mkt="IN"; t=t.replace(/\.(NS|BO)$/,""); }
    if(iM>=0){ const m=(c[iM]||"").toUpperCase(); if(/IN|NSE|BSE|INDIA/.test(m)) mkt="IN"; else if(/US|NYSE|NASDAQ|NYQ/.test(m)) mkt="US"; }
    const num = v => { const n=parseFloat(String(v||"").replace(/[₹$,]/g,"")); return isFinite(n)?n:null; };
    rows.push({ t, mkt, qty: iQ>=0?num(c[iQ]):null, cost: iC>=0?num(c[iC]):null });
  }
  return {rows, error: rows.length? null : "No data rows found under the header."};
}

/* Merge parsed rows into holdings; classify matched vs unknown. */
function importHoldingsRows(rows){
  const P = State.portfolio;
  const uni = Object.fromEntries(State.data.map(s=>[s.t, s]));
  const report = {matched:0, pending:0, unknown:[]};
  rows.forEach(r=>{
    const inUni = uni[r.t];
    const mkt = inUni ? inUni.mkt : r.mkt;
    const existing = P.holdings.find(h=>h.t===r.t);
    if(existing){ if(r.qty!=null) existing.qty=r.qty; if(r.cost!=null) existing.cost=r.cost; if(mkt) existing.mkt=mkt; }
    else P.holdings.push({t:r.t, mkt, qty:r.qty, cost:r.cost});
    if(inUni) report.matched++;
    else if(mkt){ if(!P.custom[mkt].includes(r.t)) P.custom[mkt].push(r.t); report.pending++; }
    else report.unknown.push(r.t);
  });
  savePortfolio();
  return report;
}

/* ---------- audit a holding through the funnel's own conditions ---------- */
function auditHolding(s, ctx){
  const out = {stages:{}, hardFails:[], warns:[], nas:0};
  [1,2,3,4,5].forEach(id=>{
    const stage = FUNNEL_STAGES.find(st=>st.id===id);
    if(!stage?.conditions) return;
    const res = stage.conditions.map(c=>({label:c.label.replace(/^(HARD|SOFT) — /,""), ...c.test(s, ctx)}));
    out.stages[id] = res;
    res.forEach(r=>{
      if(r.status==="fail") out.hardFails.push({stage:id, stageName:stage.short, label:r.label, reason:r.reason, reentry:r.reentry});
      else if(r.status==="warn") out.warns.push({stage:id, label:r.label, reason:r.reason});
      else if(r.status==="na") out.nas++;
    });
  });
  return out;
}

/* Position-size guidance (same floor logic as Stage 6, standalone) */
function pfSizeGuidance(s, lossTol){
  const v = veteranMetrics(s);
  const wr = v.resilience?.worstRev, wf = v.resilience?.worstFcf;
  if(wr==null && wf==null) return null;
  const assumed = Math.min(80, Math.max(15, Math.abs(Math.min(wr??0,0))*1.5, Math.abs(Math.min(wf??0,0))));
  return { assumed, maxPos: lossTol/assumed*100 };
}

/* ---------- portfolio math (mixed currency handled explicitly) ---------- */
function pfCompute(){
  const P = State.portfolio;
  const uni = Object.fromEntries(State.data.map(s=>[s.t, s]));
  const fx = (typeof MACRO_DATA!=="undefined" && MACRO_DATA?.series?.usdinr?.current) || 84;
  const rows = computeRows();
  const ctx = {rows};
  const items=[], pending=[];
  // Prune P.custom: remove any ticker that has arrived in State.data
  const inData = new Set(rows.map(r=>r.t));
  P.custom.US = P.custom.US.filter(t=>!inData.has(t));
  P.custom.IN = P.custom.IN.filter(t=>!inData.has(t));
  P.holdings.forEach(h=>{
    const s = rows.find(x=>x.t===h.t);
    if(!s){ pending.push(h); return; }
    const value = (h.qty!=null && s.price!=null) ? h.qty*s.price : null;   // ₹ for IN, $ for US
    const valueInr = value==null? null : (s.mkt==="IN"? value : value*fx);
    const pnl = (h.cost && s.price) ? (s.price-h.cost)/h.cost*100 : null;
    items.push({h, s, value, valueInr, pnl, audit:auditHolding(s, ctx),
      rq:sectorRelativeQuality(s, rows), size:pfSizeGuidance(s, P.lossTol)});
  });
  const total = items.reduce((a,x)=>a+(x.valueInr||0),0);
  items.forEach(x=>{ x.weight = (total>0 && x.valueInr!=null) ? x.valueInr/total*100 : null; });
  const bySec = {};
  items.forEach(x=>{ if(x.weight!=null){ const k=`${x.s.sec} (${x.s.mkt})`; bySec[k]=(bySec[k]||0)+x.weight; } });
  return {items, pending, total, fx, bySec, ctx, rows,
    weightsValid: items.length>0 && items.every(x=>x.weight!=null)};
}

/* ---------- 6-gate scoring (same rule as the Workflow funnel) ----------
   Gates 1–5 = funnel stages (Integrity, Forensics, Quality, Price, Timing):
   a gate passes when NONE of its conditions hard-fail ("na" never fails a
   gate, matching the funnel's own philosophy — unverified ≠ failed).
   Gate 6 = Fit & Size: position within the worst-year sizing floor.
   Colors: 5–6 passed = green · 3–4 = orange · 0–2 = red. */
function pfGates(x){
  const gates = [1,2,3,4,5].map(id=>{
    const res = x.audit.stages[id]||[];
    const fails = res.filter(r=>r.status==="fail");
    const warns = res.filter(r=>r.status==="warn");
    const allNa = res.length>0 && res.every(r=>r.status==="na");
    return {id, name:FUNNEL_STAGES.find(st=>st.id===id)?.short||("S"+id),
      status: fails.length?"fail":allNa?"na":"pass", fails, warns, res};
  });
  let g6status="na", g6reason="Add quantity & avg cost to check position size against the worst-year floor.";
  if(x.weight!=null && x.size){
    if(x.weight <= x.size.maxPos*1.25){ g6status="pass"; g6reason=`Position ${x.weight.toFixed(1)}% of portfolio — within the worst-year sizing guidance (≤ ${x.size.maxPos.toFixed(1)}%).`; }
    else { g6status="fail"; g6reason=`Position ${x.weight.toFixed(1)}% of portfolio exceeds the worst-year sizing guidance of ≤ ${x.size.maxPos.toFixed(1)}% (assumed ~${x.size.assumed.toFixed(0)}% worst-year markdown vs your ${State.portfolio.lossTol}% pain limit).`; }
  } else if(x.weight!=null){ g6status="pass"; g6reason="No worst-year history to size against — treated as passing, but start smaller than feels necessary."; }
  gates.push({id:6, name:"Fit", status:g6status,
    fails: g6status==="fail"?[{label:"Position size", status:"fail", reason:g6reason}]:[],
    warns:[], res:[{label:"Position size within worst-year floor", status:g6status, reason:g6reason}]});
  const passed = gates.filter(g=>g.status!=="fail").length;
  return {gates, passed,
    color: passed>=5?"var(--good)":passed>=3?"#b8860b":"var(--warn)",
    band:  passed>=5?"green":passed>=3?"orange":"red"};
}

/* ---------- optimization suggestions (rule-based, evidence-first) ---------- */
function pfOptimize(pc){
  const S=[];
  const add=(sev,title,detail)=>S.push({sev,title,detail});
  // R1: failed funnel conditions — severity now follows the 6-gate rule
  // (a stock passing 5/6 gates with one data quirk is NOT treated like a
  //  stock failing half the funnel).
  pc.items.forEach(x=>{
    const fails = x.audit.hardFails;
    if(!fails.length) return;
    const g = pfGates(x);
    const sev = g.passed<=2 ? 1 : g.passed<=4 ? 2 : 3;
    const failedStages = [...new Set(fails.map(f=>`S${f.stage} ${f.stageName}`))].join(", ");
    add(sev, `${x.h.t}: ${g.passed}/6 gates passed — failing condition${fails.length>1?"s":""} in ${failedStages}`,
      `${fails.map(f=>`<b>S${f.stage} ${f.stageName} — ${f.label}:</b> ${f.reason}${f.reentry?` <i style="color:var(--dim)">Clears when: ${f.reentry}</i>`:""}`).join("<br>")}<br>${
        g.passed>=5
        ? `Everything else qualifies — one failing condition in an otherwise passing stock. Check whether the DATA changed (splits, mergers and bonus issues often distort share-count or price history) or the BUSINESS changed; they demand very different responses.`
        : `Holding a stock exempts it from nothing — if it wouldn't get in today, ask why it stays.`}`);
  });
  // R2: oversized vs the worst-year floor
  pc.items.forEach(x=>{
    if(x.weight!=null && x.size && x.weight > x.size.maxPos*1.25 && x.weight>3)
      add(2, `${x.h.t} is ${x.weight.toFixed(1)}% of the portfolio — the worst-year floor suggests ≤ ${x.size.maxPos.toFixed(1)}%`,
        `A repeat of its worst historical year (assumed ~${x.size.assumed.toFixed(0)}% markdown) would cost ${(x.weight*x.size.assumed/100).toFixed(1)}% of the portfolio, beyond your ${State.portfolio.lossTol}% pain limit. Trimming toward ${x.size.maxPos.toFixed(1)}% sizes it to the floor, not the average.`);
  });
  // R3/R4: concentration
  Object.entries(pc.bySec).forEach(([k,wt])=>{
    if(wt>40) add(2, `${wt.toFixed(0)}% concentrated in ${k}`,
      `Beyond ~40% in one sector, single-sector shocks (regulation, cycle, rates) dominate portfolio outcomes regardless of stock selection quality within it.`);
  });
  pc.items.forEach(x=>{ if(x.weight!=null && x.weight>25)
    add(2, `${x.h.t} alone is ${x.weight.toFixed(0)}% of the portfolio`,
      `Above ~25%, this single name IS the portfolio — its worst year becomes yours, whatever else you own.`); });
  // R5: quality laggards with researchable upgrades in the same sector
  pc.items.forEach(x=>{
    if(x.rq.fallback || x.rq.score>=45) return;
    const held = new Set(pc.items.map(i=>i.h.t));
    const cands = pc.rows.filter(c=>c.sec===x.s.sec && c.mkt===x.s.mkt && !held.has(c.t))
      .map(c=>({c, q:sectorRelativeQuality(c, pc.rows)}))
      .filter(o=>!o.q.fallback && o.q.score>=x.rq.score+15)
      .filter(o=>{ const a=auditHolding(o.c, pc.ctx); return !a.hardFails.some(f=>f.stage<=3); })
      .sort((a,b)=>b.q.score-a.q.score).slice(0,2);
    if(cands.length) add(3, `${x.h.t} ranks in the bottom of its sector (quality percentile ${x.rq.score})`,
      `Same-sector names that currently pass the honesty and quality gates with materially higher percentiles: ${cands.map(o=>`${o.c.t} (${o.q.score})`).join(", ")}. Worth researching as candidates — run them through the Workflow funnel yourself; this is a research pointer, not a swap instruction.`);
  });
  // R6: holdings priced for perfection (informational)
  pc.items.forEach(x=>{
    const f4 = x.audit.hardFails.find(f=>f.stage===4 && /implies/.test(f.reason));
    if(f4) add(3, `${x.h.t}: today's price already assumes heroic growth`,
      `${f4.reason} You hold it, so this isn't a sell signal by itself — it's a reminder that from here, the company must EXCEED those expectations for the stock to work.`);
  });
  // R7: pending custom tickers
  if(pc.pending.length) add(3, `${pc.pending.length} holding(s) awaiting pipeline data: ${pc.pending.map(h=>h.t).join(", ")}`,
    `Download custom_tickers.json below, put it in the repo root, run python fetch_data.py, and these get the identical full analysis on the next load.`);
  S.sort((a,b)=>a.sev-b.sev);
  return S;
}

/* ============================================================
   RENDER
   ============================================================ */
function renderPortfolio(){
  if(!State.portfolio) State.portfolio = loadPortfolio();
  if(!State.funnel) State.funnel = loadFunnel();
  const P = State.portfolio;
  const pc = pfCompute();
  const curSym = m => m==="IN"?"₹":"$";

  const importCard = `<div class="panel wide">
    <div class="panelhead"><span class="panelt">Import your portfolio</span><span class="panels">CSV or Excel — broker exports usually work as-is</span></div>
    <p style="font-size:13.5px;color:var(--dim);line-height:1.6">Needs a <b>ticker/symbol</b> column; <b>quantity</b> and <b>avg cost</b> are optional but unlock value, weight and P&L analysis. Recognized header names include: ticker, symbol, scrip, qty, quantity, avg cost, buy price. Indian tickers may carry .NS/.BO suffixes — they're handled.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:8px 0">
      <input type="file" id="pfFile" accept=".csv,.xlsx,.xls" style="font-size:13px"/>
      ${wfBtn("Import file","data-pfimportfile='1'",true)}
    </div>
    <details style="margin-top:6px"><summary style="cursor:pointer;font-size:13px;color:var(--accent)">…or paste CSV text</summary>
      <textarea id="pfPaste" placeholder="ticker,qty,avg cost&#10;TCS,10,3200&#10;AAPL,5,180" style="width:100%;min-height:80px;margin-top:6px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);font-family:var(--mono);font-size:12.5px"></textarea>
      <div style="margin-top:6px">${wfBtn("Import pasted text","data-pfimportpaste='1'")}</div>
    </details>
    ${P.lastImport?`<p class="hint" style="margin-top:8px">${P.lastImport}</p>`:""}
  </div>`;

  const addCard = `<div class="panel wide">
    <div class="panelhead"><span class="panelt">Add a single stock — including OUTSIDE the built-in list</span></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div><div class="kpiL">Ticker</div><input id="pfTicker" placeholder="e.g. DIVISLAB or AMD" style="width:140px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)"/></div>
      <div><div class="kpiL">Market</div>${wfChip("India","data-pfmkt='IN'", P.addMkt!=="US")} ${wfChip("US","data-pfmkt='US'", P.addMkt==="US")}</div>
      <div><div class="kpiL">Qty (optional)</div><input id="pfQty" type="number" style="width:90px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)"/></div>
      <div><div class="kpiL">Avg cost (optional)</div><input id="pfCost" type="number" style="width:100px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)"/></div>
      ${wfBtn("Add","data-pfadd='1'",true)}
    </div>
    <p class="hint" style="margin-top:8px">If the ticker is already in the loaded universe it's analyzed instantly. If not, it goes on the custom list below — the browser can't fetch Yahoo data directly (CORS), so the pipeline does it on its next run, with the exact same logic as every other stock. No code editing needed.</p>
  </div>`;

  const cfg = getGithubCfg();
  const customList = (P.custom.US.length+P.custom.IN.length) ? `<div class="panel wide" style="border-left:3px solid var(--accent)">
    <div class="panelhead"><span class="panelt">Custom tickers queued (${P.custom.US.length+P.custom.IN.length} awaiting pipeline)</span></div>
    <p style="font-size:13.5px;color:var(--dim)">${P.custom.IN.length?"IN: "+P.custom.IN.join(", "):""} ${P.custom.US.length?" · US: "+P.custom.US.join(", "):""}</p>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      ${cfg.token&&cfg.repo ? wfBtn("Push to GitHub automatically →","data-pfghpush='1'",true) : ""}
      ${wfBtn("Download custom_tickers.json","data-pfdlcustom='1'")}
    </div>
    ${!cfg.token||!cfg.repo ? "<p class='hint' style='margin-top:8px'>↓ Connect GitHub below to push automatically — no manual file steps needed.</p>" : "<p class='hint' style='margin-top:8px'>After pushing, the fetch-custom.yml workflow fetches only these tickers (~2 min). Reload when done.</p>"}
  </div>` : "";

  /* holdings table */
  const ghCard = `<div class="panel wide">
    <div class="panelhead"><span class="panelt">GitHub auto-push (optional)</span><span class="panels">push custom_tickers.json automatically — no manual file steps</span></div>
    <p style="font-size:13.5px;color:var(--dim);line-height:1.6">Set once. Every time you add a custom ticker, the file is pushed to your repo automatically and the GitHub Actions workflow fetches it within ~2 minutes. Needs a <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">fine-grained PAT</a> with <b>read+write Contents</b> on your repo. The token is stored only in your browser's localStorage — never sent anywhere but GitHub.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div><div class="kpiL">GitHub token (fine-grained PAT)</div>
        <input id="pfGhToken" type="password" placeholder="github_pat_..." value="${cfg.token||""}"
          style="width:260px;padding:8px;border:1px solid ${cfg.token?"var(--good)":"var(--line)"};border-radius:6px;background:var(--panel);color:var(--ink);font-size:13px"/></div>
      <div><div class="kpiL">Repo (owner/repo)</div>
        <input id="pfGhRepo" placeholder="yourname/terminal" value="${cfg.repo||""}"
          style="width:200px;padding:8px;border:1px solid ${cfg.repo?"var(--good)":"var(--line)"};border-radius:6px;background:var(--panel);color:var(--ink);font-size:13px"/></div>
      ${wfBtn("Save","data-pfghsave='1'",!!(cfg.token&&cfg.repo))}
      ${cfg.token&&cfg.repo ? "<span class='hint' style='margin:0'>✓ Connected — new tickers will push automatically</span>" : ""}
    </div>
  </div>`;
  let holdingsCard = "";
  if(P.holdings.length){
    const rowsHtml = pc.items.sort((a,b)=>(b.weight??-1)-(a.weight??-1)).map(x=>{
      const hf = x.audit.hardFails;
      const byStage = {}; hf.forEach(f=>{ byStage[f.stage]=(byStage[f.stage]||0)+1; });
      const stageLbl = Object.keys(byStage).sort().map(st=>`S${st}${byStage[st]>1?"×"+byStage[st]:""}`).join(", ");
      const auditPill = hf.length
        ? `<span class="pill warn" title="${hf.map(f=>`S${f.stage} ${f.stageName}: ${f.reason}`).join(" | ").replace(/"/g,"'")}">✗ ${stageLbl}</span>`
        : `<span class="pill good">✓ funnel-clean</span>`;
      const warnPill = x.audit.warns.length?` <span class="pill neutral">${x.audit.warns.length}⚠</span>`:"";
      return `<tr>
        <td class="left"><span class="tname" data-open="${x.s.t}" style="cursor:pointer">${x.s.t}</span><span class="tsub">${x.s.n}</span></td>
        <td>${x.h.qty??"—"}</td>
        <td>${x.h.cost!=null?curSym(x.s.mkt)+x.h.cost:"—"}</td>
        <td>${fmtP(x.s.price,x.s.mkt)}</td>
        <td style="color:${x.pnl==null?'inherit':x.pnl>=0?'var(--good)':'var(--warn)'}">${x.pnl==null?"—":(x.pnl>0?"+":"")+x.pnl.toFixed(1)+"%"}</td>
        <td>${x.weight!=null?x.weight.toFixed(1)+"%":"—"}</td>
        <td>${x.rq.fallback?`${x.rq.score}*`:x.rq.score}</td>
        <td>${auditPill}${warnPill}</td>
        <td><span data-pfrm="${x.h.t}" style="cursor:pointer;color:var(--warn)">✕</span></td></tr>`;
    }).join("");
    const pendingHtml = pc.pending.map(h=>`<tr><td class="left"><span class="tname">${h.t}</span><span class="tsub">awaiting pipeline data</span></td>
      <td>${h.qty??"—"}</td><td>${h.cost??"—"}</td><td colspan="4" class="left hint" style="font-size:12px">pending — download custom_tickers.json above and run the pipeline</td>
      <td><span class="pill neutral">pending</span></td><td><span data-pfrm="${h.t}" style="cursor:pointer;color:var(--warn)">✕</span></td></tr>`).join("");
    holdingsCard = `<div class="panel wide">
      <div class="panelhead"><span class="panelt">Holdings (${P.holdings.length})</span>
        <span class="panels">${pc.weightsValid?`total ≈ ₹${(pc.total/1e5).toFixed(1)} lakh (US converted at ₹${pc.fx}/$${(typeof MACRO_DATA==="undefined"||!MACRO_DATA?.series?.usdinr)?" — fallback rate; run fetch_macro.py":""})`:"add quantities to unlock weights & totals"}</span></div>
      <div style="overflow-x:auto"><table class="grid" style="width:100%">
        <thead><tr><th class="left">Stock</th><th>Qty</th><th>Avg cost</th><th>Price</th><th>P&L</th><th>Weight</th><th title="sector-relative quality percentile; * = absolute fallback (few peers)">Quality</th><th title="run through the same Stage 1-5 conditions as the Workflow funnel">Funnel audit</th><th></th></tr></thead>
        <tbody>${rowsHtml}${pendingHtml}</tbody></table></div>
      <p class="hint">Funnel audit = every holding tested against the SAME Stage 1–5 conditions a new stock would face. Tap a ticker for its full tearsheet; hover/tap ✗ pills for reasons. Quality = sector percentile (60 beats 60% of its own sector).</p>
    </div>`;
  }

  /* sector concentration — click a sector to expand its holdings */
  let concCard = "";
  if(pc.weightsValid && Object.keys(pc.bySec).length){
    concCard = `<div class="panel wide"><div class="panelhead"><span class="panelt">Concentration</span><span class="panels">click a sector to see which holdings drive it</span></div>
      ${Object.entries(pc.bySec).sort((a,b)=>b[1]-a[1]).map(([k,wt])=>{
        const open = State.pfConcOpen===k;
        const inSec = pc.items.filter(x=>x.weight!=null && `${x.s.sec} (${x.s.mkt})`===k).sort((a,b)=>b.weight-a.weight);
        return `
        <div data-pfconc="${k.replace(/"/g,"&quot;")}" style="display:flex;align-items:center;gap:10px;margin:5px 0;cursor:pointer" title="Click to ${open?"collapse":"expand"}">
          <div style="width:220px;font-size:13px">${open?"▾":"▸"} ${k} <span style="color:var(--dim);font-size:11.5px">(${inSec.length})</span></div>
          <div style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:4px;height:16px"><div style="width:${Math.min(wt,100)}%;height:100%;border-radius:3px;background:${wt>40?"var(--warn)":"var(--accent)"}"></div></div>
          <div style="width:52px;text-align:right;font-family:var(--mono);font-size:13px;color:${wt>40?"var(--warn)":"var(--ink)"}">${wt.toFixed(1)}%</div></div>
        ${open?`<div style="margin:2px 0 10px 24px;padding:8px 12px;border-left:2px solid var(--line)">
          ${inSec.map(x=>`<div style="display:flex;align-items:center;gap:10px;margin:3px 0;font-size:13px">
            <span class="tname" data-open="${x.s.t}" style="cursor:pointer;width:120px">${x.s.t}</span>
            <span style="color:var(--dim);flex:1">${x.s.n}</span>
            <span style="color:${x.pnl==null?'var(--dim)':x.pnl>=0?'var(--good)':'var(--warn)'};width:70px;text-align:right;font-family:var(--mono);font-size:12.5px">${x.pnl==null?"—":(x.pnl>0?"+":"")+x.pnl.toFixed(1)+"%"}</span>
            <span style="width:56px;text-align:right;font-family:var(--mono)">${x.weight.toFixed(1)}%</span></div>`).join("")}
          <div style="font-size:11.5px;color:var(--dim);margin-top:6px">weight = share of total portfolio · click a ticker for its tearsheet</div>
        </div>`:""}`;
      }).join("")}
    </div>`;
  }

  /* optimization */
  let optCard = "";
  if(pc.items.length){
    const sugg = pfOptimize(pc);
    const icon = st => st==="pass"?"✓":st==="warn"?"⚠":st==="na"?"◌":"✗";
    const iclr = st => st==="pass"?"var(--good)":st==="warn"?"#b8860b":st==="na"?"var(--dim)":"var(--warn)";
    const gateRows = pc.items.slice().sort((a,b)=>(b.weight??-1)-(a.weight??-1)).map(x=>{
      const g = pfGates(x);
      const open = State.pfGateOpen===x.h.t;
      return `
      <div style="border:1px solid var(--line);border-left:3px solid ${g.color};border-radius:7px;margin-bottom:6px">
        <div data-pfgate="${x.h.t}" style="display:flex;align-items:center;gap:12px;padding:8px 12px;cursor:pointer;flex-wrap:wrap">
          <span style="width:14px;color:var(--dim)">${open?"▾":"▸"}</span>
          <span class="tname" data-open="${x.s.t}" style="cursor:pointer;width:110px">${x.h.t}</span>
          <span style="font-family:var(--mono);font-weight:700;color:${g.color};width:88px">${g.band==="green"?"🟢":g.band==="orange"?"🟠":"🔴"} ${g.passed}/6 gates</span>
          <span style="display:flex;gap:8px;font-size:12px;font-family:var(--mono)">
            ${g.gates.map(gt=>`<span title="S${gt.id} ${gt.name}${gt.fails.length?": "+gt.fails.map(f=>f.reason).join(" | ").replace(/"/g,"'"):""}" style="color:${iclr(gt.status)}">S${gt.id}${icon(gt.status)}</span>`).join("")}
          </span>
          ${x.weight!=null?`<span style="margin-left:auto;font-size:12px;color:var(--dim);font-family:var(--mono)">${x.weight.toFixed(1)}%</span>`:""}
        </div>
        ${open?`<div style="padding:4px 14px 12px 38px;border-top:1px solid var(--line)">
          ${g.gates.map(gt=>`
            <div style="margin-top:8px">
              <div style="font-size:12.5px;font-weight:700;color:${iclr(gt.status)}">S${gt.id} ${FUNNEL_STAGES.find(st=>st.id===gt.id)?.name||gt.name} — ${gt.status==="fail"?"GATE FAILED":gt.status==="na"?"unverified":"gate passed"}</div>
              ${(gt.res||[]).map(r=>`<div style="font-size:12.5px;color:var(--dim);line-height:1.55;margin:2px 0 0 12px"><span style="color:${iclr(r.status)}">${icon(r.status)}</span> <b>${r.label}</b>${r.reason?` — ${r.reason}`:""}</div>`).join("")}
            </div>`).join("")}
        </div>`:""}
      </div>`;
    }).join("");
    optCard = `<div class="panel wide" style="border:2px solid var(--accent)">
      <div class="panelhead"><span class="panelt">🎯 Optimization analysis (${sugg.length})</span><span class="panels">rule-based, evidence shown — you decide</span></div>
      <div style="margin-bottom:14px">
        <p style="font-size:12.5px;color:var(--dim);line-height:1.55;margin:0 0 8px">Gates = funnel stages S1 Integrity · S2 Forensics · S3 Quality · S4 Price · S5 Timing · S6 Fit&nbsp;&amp;&nbsp;Size. A gate fails only on a hard fail — ◌ unverified never counts against a stock. <b style="color:var(--good)">5–6 = green</b> · <b style="color:#b8860b">3–4 = orange</b> · <b style="color:var(--warn)">0–2 = red</b>. Click a row for every condition and reason.</p>
        ${gateRows}
      </div>
      ${sugg.length? sugg.map(s=>`<div style="padding:10px 14px;border:1px solid var(--line);border-left:3px solid ${s.sev===1?"var(--warn)":s.sev===2?"#b8860b":"var(--accent)"};border-radius:7px;margin-bottom:8px">
        <div style="font-weight:600;font-size:14px">${s.sev===1?"🔴":s.sev===2?"🟠":"🔵"} ${s.title}</div>
        <div style="font-size:13.5px;color:var(--dim);line-height:1.6;margin-top:4px">${s.detail}</div></div>`).join("")
      : `<p style="font-size:14px;color:var(--good)">No rule-based concerns found: every holding passes the honesty gates, no position exceeds its worst-year sizing, and concentration is within bounds. That's rarer than you'd think.</p>`}
      <p class="hint" style="margin-top:10px"><b>This is educational analysis, not investment advice.</b> Every suggestion above shows the rule and evidence that produced it. Selling, trimming and buying have tax, cost and timing consequences this tool cannot see — the decisions, and the research behind them, are yours.</p>
    </div>`;
  }

  return `<div style="margin-top:10px"></div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${wfChip("Holdings &amp; Analysis","data-pfview='holdings'", (State.pfView||"holdings")==="holdings")}
      ${wfChip("Performance","data-pfview='performance'", State.pfView==="performance")}
    </div>
    ${(State.pfView||"holdings")==="performance" ? renderPfPerformance(pc) : `
      ${importCard}${addCard}${ghCard}${customList}${holdingsCard}${concCard}${optCard}
      ${P.holdings.length?`<p class="hint">${wfBtn("Clear portfolio","data-pfclear='1'")}</p>`:""}
    `}`;
}

/* ============================================================
   PERFORMANCE ANALYTICS ENGINE
   All maths run client-side on the existing price_history.json
   weekly closes. No paid API required.
   ============================================================ */

/* Align two date arrays → returns {dates, aReturns, bReturns} for the
   overlapping window. Returns weekly log returns (approx = simple for small moves). */
function pfAlignReturns(datesA, closesA, datesB, closesB){
  const mapB = new Map(datesB.map((d,i)=>[d, closesB[i]]));
  const result = {dates:[], aRet:[], bRet:[]};
  for(let i=1; i<datesA.length; i++){
    const d = datesA[i], bv = mapB.get(d);
    if(bv==null || closesA[i-1]==null || closesA[i]==null) continue;
    // find prev date in B
    const prevD = datesA[i-1], prevB = mapB.get(prevD);
    if(prevB==null) continue;
    result.dates.push(d);
    result.aRet.push(closesA[i]/closesA[i-1] - 1);
    result.bRet.push(bv/prevB - 1);
  }
  return result;
}

/* Build a rebased (start=100) price series from returns. */
function pfRebaseFromReturns(returns){
  const out=[100];
  for(const r of returns) out.push(out[out.length-1]*(1+r));
  return out;
}

/* Core risk/return stats from an array of weekly simple returns. */
function pfStats(returns, benchReturns, riskFreeWeekly){
  if(!returns.length) return null;
  const n = returns.length;
  const rf = riskFreeWeekly ?? 0;
  const annFactor = 52;

  const mean = returns.reduce((a,b)=>a+b,0)/n;
  const annReturn = Math.pow(1+mean, annFactor) - 1;

  const variance = returns.reduce((a,b)=>a+(b-mean)**2,0)/n;
  const vol = Math.sqrt(variance * annFactor);

  // Max drawdown on the rebased series
  const rebased = pfRebaseFromReturns(returns);
  let maxDD = 0, peak = rebased[0];
  for(const v of rebased){ if(v>peak) peak=v; const dd=(v-peak)/peak; if(dd<maxDD) maxDD=dd; }

  // Sharpe
  const excessMean = mean - rf;
  const sharpe = vol>0 ? (excessMean * annFactor) / vol : null;

  // Sortino (downside std vs rf)
  const downReturns = returns.filter(r=>r<rf);
  const downVar = downReturns.length ? downReturns.reduce((a,b)=>a+(b-rf)**2,0)/downReturns.length : 0;
  const downVol = Math.sqrt(downVar * annFactor);
  const sortino = downVol>0 ? ((annReturn - rf*annFactor)) / downVol : null;

  // Beta & alpha vs benchmark
  let beta=null, alpha=null, corr=null;
  if(benchReturns && benchReturns.length===returns.length){
    const bMean = benchReturns.reduce((a,b)=>a+b,0)/n;
    const cov = returns.reduce((s,r,i)=>s+(r-mean)*(benchReturns[i]-bMean),0)/n;
    const bVar = benchReturns.reduce((s,r)=>s+(r-bMean)**2,0)/n;
    beta = bVar>0 ? cov/bVar : null;
    const bAnnReturn = Math.pow(1+bMean, annFactor)-1;
    alpha = beta!=null ? (annReturn - (rf*annFactor + beta*(bAnnReturn - rf*annFactor))) : null;
    const bVol = Math.sqrt(bVar*annFactor);
    corr = (vol>0 && bVol>0) ? cov/(Math.sqrt(variance)*Math.sqrt(bVar)) : null;
  }

  return { n, annReturn, vol, maxDD, sharpe, sortino, beta, alpha, corr,
    totalReturn: rebased[rebased.length-1]/100 - 1 };
}

/* Build the portfolio's synthetic price series by blending individual
   stock returns according to their weights at the portfolio level.
   Limitation: uses CURRENT weights throughout (buy-and-hold approximation).
   True TWR would need transaction dates we don't have from a static import. */
function pfBuildPortfolioSeries(pc){
  const PH = (typeof PRICE_HISTORY !== "undefined") ? PRICE_HISTORY : null;
  if(!PH) return null;
  const phMap = Object.fromEntries(PH.map(e=>[e.ticker, e]));

  // Only include weighted holdings that have price history
  const weighted = pc.items.filter(x=>x.weight!=null && x.weight>0 && phMap[x.h.t]);
  if(!weighted.length) return null;

  const totalW = weighted.reduce((a,x)=>a+x.weight,0);

  // Find the common date range: union of all dates, each stock's return on that week
  // Use the stock with the most history as the date spine
  const spine = weighted.reduce((a,b)=>
    (phMap[b.h.t]?.dates?.length??0)>(phMap[a.h.t]?.dates?.length??0)?b:a);
  const spineDates = phMap[spine.h.t].dates;

  const portReturns=[], portDates=[];
  for(let i=1; i<spineDates.length; i++){
    const d = spineDates[i], prev = spineDates[i-1];
    let wSum=0, rSum=0;
    for(const x of weighted){
      const ph = phMap[x.h.t];
      const iD = ph.dates.indexOf(d), iP = ph.dates.indexOf(prev);
      if(iD<0||iP<0||ph.closes[iP]==null||ph.closes[iD]==null) continue;
      const r = ph.closes[iD]/ph.closes[iP]-1;
      rSum += r * (x.weight/totalW);
      wSum += x.weight/totalW;
    }
    if(wSum<0.5) continue; // less than 50% of portfolio had data this week — skip
    portReturns.push(rSum/wSum); // normalize to the participating weight
    portDates.push(d);
  }
  return {dates: portDates, returns: portReturns};
}

/* Pairwise correlation matrix for all weighted holdings. */
function pfCorrelation(pc){
  const PH = (typeof PRICE_HISTORY !== "undefined") ? PRICE_HISTORY : null;
  if(!PH) return null;
  const phMap = Object.fromEntries(PH.map(e=>[e.ticker,e]));
  const items = pc.items.filter(x=>x.weight!=null && phMap[x.h.t]);
  if(items.length<2) return null;

  // Build weekly returns per stock on the common date spine
  const spine = phMap[items.reduce((a,b)=>
    (phMap[b.h.t]?.dates?.length??0)>(phMap[a.h.t]?.dates?.length??0)?b:a).h.t].dates;

  const returns = items.map(x=>{
    const ph=phMap[x.h.t], rets=[];
    for(let i=1;i<spine.length;i++){
      const d=spine[i],p=spine[i-1];
      const iD=ph.dates.indexOf(d),iP=ph.dates.indexOf(p);
      rets.push(iD>=0&&iP>=0&&ph.closes[iP]>0 ? ph.closes[iD]/ph.closes[iP]-1 : null);
    }
    return rets;
  });

  const tickers = items.map(x=>x.h.t);
  const matrix = tickers.map((t,i)=>tickers.map((u,j)=>{
    if(i===j) return 1;
    const pairs=returns[i].map((r,k)=>r!=null&&returns[j][k]!=null?[r,returns[j][k]]:null).filter(Boolean);
    if(pairs.length<8) return null;
    const mA=pairs.reduce((s,p)=>s+p[0],0)/pairs.length;
    const mB=pairs.reduce((s,p)=>s+p[1],0)/pairs.length;
    const cov=pairs.reduce((s,p)=>s+(p[0]-mA)*(p[1]-mB),0)/pairs.length;
    const sA=Math.sqrt(pairs.reduce((s,p)=>s+(p[0]-mA)**2,0)/pairs.length);
    const sB=Math.sqrt(pairs.reduce((s,p)=>s+(p[1]-mB)**2,0)/pairs.length);
    return sA>0&&sB>0 ? cov/(sA*sB) : null;
  }));
  return {tickers, matrix};
}

/* Attribution: contribution of each holding to portfolio return. */
function pfAttribution(pc){
  const PH = (typeof PRICE_HISTORY !== "undefined") ? PRICE_HISTORY : null;
  if(!PH) return [];
  const phMap = Object.fromEntries(PH.map(e=>[e.ticker,e]));
  return pc.items
    .filter(x=>x.weight!=null && x.weight>0 && phMap[x.h.t])
    .map(x=>{
      const ph=phMap[x.h.t];
      if(!ph.closes.length) return null;
      const first=ph.closes.find(c=>c!=null), last=ph.closes.filter(c=>c!=null).pop();
      if(!first||!last) return null;
      const totalRet=last/first-1;
      return {t:x.h.t, n:x.s.n, sec:x.s.sec, weight:x.weight,
        totalRet, contribution: totalRet*(x.weight/100)};
    }).filter(Boolean).sort((a,b)=>b.contribution-a.contribution);
}

/* ============================================================
   PERFORMANCE VIEW RENDERER
   ============================================================ */
function renderPfPerformance(pc){
  const PH = (typeof PRICE_HISTORY !== "undefined") ? PRICE_HISTORY : null;
  const macro = (typeof MACRO_DATA !== "undefined") ? MACRO_DATA : null;

  if(!pc.items.filter(x=>x.weight!=null).length){
    return `<div class="panel wide"><p style="font-size:14px;color:var(--dim)">Add holdings with quantities to unlock performance analytics — weights are needed to build the blended portfolio series.</p></div>`;
  }
  if(!PH){
    return `<div class="panel wide"><p style="font-size:14px;color:var(--dim)">Run <code>python fetch_price_history.py</code> to load price history — needed for all performance calculations.</p></div>`;
  }

  const phMap = Object.fromEntries(PH.map(e=>[e.ticker,e]));

  // Pick the right benchmark by dominant market in portfolio
  const inWeight = pc.items.filter(x=>x.s?.mkt==="IN"&&x.weight!=null).reduce((a,x)=>a+x.weight,0);
  const usWeight = pc.items.filter(x=>x.s?.mkt==="US"&&x.weight!=null).reduce((a,x)=>a+x.weight,0);
  const bmTicker = inWeight>=usWeight ? "__NIFTY50__" : "__SP500__";
  const bm = phMap[bmTicker];
  const bmLabel = bm?.label ?? (inWeight>=usWeight ? "Nifty 50" : "S&P 500");

  const portSeries = pfBuildPortfolioSeries(pc);
  if(!portSeries || portSeries.returns.length<4){
    return `<div class="panel wide"><p style="font-size:14px;color:var(--dim)">Not enough overlapping price history to compute returns — check that <code>fetch_price_history.py</code> has been run with the full universe.</p></div>`;
  }

  // Align portfolio and benchmark returns on the same date spine
  const portRebasedDates = portSeries.dates;
  let bmReturns=null, bmRebased=null, bmStats=null;
  if(bm){
    const aligned = pfAlignReturns(portSeries.dates, pfRebaseFromReturns(portSeries.returns),
                                   bm.dates, bm.closes);
    // Recompute bm returns aligned to port dates
    const bmMap = new Map(bm.dates.map((d,i)=>[d, bm.closes[i]]));
    bmReturns = portSeries.dates.map((d,i)=>{
      if(i===0) return 0;
      const prev=portSeries.dates[i-1];
      const c=bmMap.get(d), p=bmMap.get(prev);
      return (c!=null&&p!=null&&p>0)?c/p-1:null;
    }).slice(1).filter(v=>v!==null);
    bmRebased = pfRebaseFromReturns(bmReturns);
    const rfW = macro?.series?.us10y?.current!=null ? macro.series.us10y.current/100/52 : 4.5/100/52;
    bmStats = pfStats(bmReturns, null, rfW);
  }

  const rfW = macro?.series?.us10y?.current!=null ? macro.series.us10y.current/100/52 : 4.5/100/52;
  const portStats = pfStats(portSeries.returns, bmReturns, rfW);
  const portRebased = pfRebaseFromReturns(portSeries.returns);

  const fmt1 = v => v==null?"—":(v>=0?"+":"")+v.toFixed(1)+"%";
  const fmt2 = v => v==null?"—":v.toFixed(2);
  const fmtPct = v => v==null?"—":(v*100).toFixed(1)+"%";
  const clr = (v,good=true) => v==null?"var(--ink)":((v>0)===good?"var(--good)":"var(--warn)");

  /* --- SVG chart: portfolio vs benchmark rebased to 100 --- */
  const W=680, H=200, PAD={t:10,r:10,b:30,l:44};
  const allVals=[...portRebased, ...(bmRebased||[])];
  const minV=Math.min(...allVals)*0.98, maxV=Math.max(...allVals)*1.02;
  const xScale = i => PAD.l + (i/(portRebased.length-1))*(W-PAD.l-PAD.r);
  const yScale = v => PAD.t + (1-(v-minV)/(maxV-minV))*(H-PAD.t-PAD.b);
  const polyline = vals => vals.map((v,i)=>`${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
  // Y axis labels
  const yTicks=[minV, (minV+maxV)/2, maxV].map(v=>`
    <line x1="${PAD.l-4}" y1="${yScale(v).toFixed(1)}" x2="${PAD.l}" y2="${yScale(v).toFixed(1)}" stroke="var(--line)"/>
    <text x="${PAD.l-6}" y="${(yScale(v)+4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--dim)">${v.toFixed(0)}</text>`).join("");
  // X axis: show ~6 date labels
  const step = Math.floor(portRebasedDates.length/5);
  const xTicks = portRebasedDates.filter((_,i)=>i%step===0||(i===portRebasedDates.length-1)).map(d=>{
    const i=portRebasedDates.indexOf(d);
    return `<text x="${xScale(i).toFixed(1)}" y="${H-PAD.b+14}" text-anchor="middle" font-size="10" fill="var(--dim)">${d.slice(0,7)}</text>`;
  }).join("");
  const chart = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;margin:10px 0">
    <line x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${H-PAD.b}" stroke="var(--line)" stroke-width="1"/>
    <line x1="${PAD.l}" y1="${H-PAD.b}" x2="${W-PAD.r}" y2="${H-PAD.b}" stroke="var(--line)" stroke-width="1"/>
    <line x1="${PAD.l}" y1="${yScale(100).toFixed(1)}" x2="${W-PAD.r}" y2="${yScale(100).toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="4,3"/>
    ${yTicks}${xTicks}
    ${bmRebased?`<polyline points="${polyline(bmRebased)}" fill="none" stroke="var(--dim)" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>`:""}
    <polyline points="${polyline(portRebased)}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    <text x="${W-PAD.r}" y="${yScale(portRebased[portRebased.length-1]).toFixed(1)}" font-size="10" fill="var(--accent)" text-anchor="end">Portfolio</text>
    ${bmRebased?`<text x="${W-PAD.r}" y="${(yScale(bmRebased[bmRebased.length-1])+12).toFixed(1)}" font-size="10" fill="var(--dim)" text-anchor="end">${bmLabel}</text>`:""}
  </svg>`;

  /* --- Risk metrics table --- */
  const metricRow=(label,port,bench,goodHigh=true)=>`
    <tr>
      <td style="padding:7px 12px;font-size:13px;color:var(--dim)">${label}</td>
      <td style="padding:7px 12px;font-size:13px;font-family:var(--mono);color:${clr(port!=null?(goodHigh?port:-port):null)};font-weight:600">${port}</td>
      <td style="padding:7px 12px;font-size:13px;font-family:var(--mono);color:var(--dim)">${bench??'—'}</td>
    </tr>`;

  const metricsTable = `<table style="width:100%;border-collapse:collapse;margin-top:8px">
    <thead><tr>
      <th style="padding:6px 12px;text-align:left;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)">Metric</th>
      <th style="padding:6px 12px;text-align:left;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)">Portfolio</th>
      <th style="padding:6px 12px;text-align:left;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)">${bmLabel}</th>
    </tr></thead>
    <tbody>
    ${metricRow("Total return (period)", fmt1(portStats?.totalReturn), fmt1(bmStats?.totalReturn))}
    ${metricRow("Annualized return", fmt1(portStats?.annReturn), fmt1(bmStats?.annReturn))}
    ${metricRow("Annualized volatility", fmtPct(portStats?.vol), fmtPct(bmStats?.vol), false)}
    ${metricRow("Max drawdown", fmtPct(portStats?.maxDD), fmtPct(bmStats?.maxDD), false)}
    ${metricRow("Sharpe ratio", fmt2(portStats?.sharpe), fmt2(bmStats?.sharpe))}
    ${metricRow("Sortino ratio", fmt2(portStats?.sortino), fmt2(bmStats?.sortino))}
    ${portStats?.beta!=null?metricRow("Beta to "+bmLabel, fmt2(portStats.beta), "1.00"):""}
    ${portStats?.alpha!=null?metricRow("Alpha (annualized)", fmt1(portStats.alpha), "—"):""}
    ${portStats?.corr!=null?metricRow("Correlation to "+bmLabel, fmt2(portStats.corr), "—"):""}
    </tbody>
  </table>`;

  /* --- Attribution table --- */
  const contrib = pfAttribution(pc);
  const attrTable = contrib.length ? `
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead><tr>
        <th style="padding:5px 12px;text-align:left;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)">Holding</th>
        <th style="padding:5px 12px;text-align:left;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)">Sector</th>
        <th style="padding:5px 12px;text-align:right;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)">Weight</th>
        <th style="padding:5px 12px;text-align:right;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)">Stock return</th>
        <th style="padding:5px 12px;text-align:right;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)">Contribution</th>
      </tr></thead>
      <tbody>${contrib.map(c=>`<tr>
        <td style="padding:5px 12px;font-size:13px"><span class="tname" data-open="${c.t}" style="cursor:pointer">${c.t}</span> <span class="tsub">${c.n}</span></td>
        <td style="padding:5px 12px;font-size:12.5px;color:var(--dim)">${c.sec}</td>
        <td style="padding:5px 12px;font-family:var(--mono);font-size:13px;text-align:right">${c.weight.toFixed(1)}%</td>
        <td style="padding:5px 12px;font-family:var(--mono);font-size:13px;text-align:right;color:${c.totalRet>=0?"var(--good)":"var(--warn)"}">${fmt1(c.totalRet)}</td>
        <td style="padding:5px 12px;font-family:var(--mono);font-size:13px;text-align:right;color:${c.contribution>=0?"var(--good)":"var(--warn)"};font-weight:600">${fmt1(c.contribution)}</td>
      </tr>`).join("")}</tbody>
    </table>
    <p class="hint">Stock return = first to last close in price_history.json (approx 2yr). Contribution = stock return × portfolio weight. Contributions do not sum exactly to portfolio total because weights are normalized and the portfolio series uses live weekly data.</p>` : "";

  /* --- Correlation heatmap --- */
  let corrHtml = "";
  const corrData = pfCorrelation(pc);
  if(corrData && corrData.tickers.length>=2){
    const N=corrData.tickers.length;
    const cellW=Math.min(72, Math.floor(440/N));
    const corrColor = v => {
      if(v==null) return "#ccc";
      const r=v<0?Math.round(255*(1+v)):255, g=Math.round(255*(1-Math.abs(v))), b=v>0?Math.round(255*(1-v)):255;
      return `rgb(${r},${g},${b})`;
    };
    corrHtml = `<div style="overflow-x:auto"><table style="border-collapse:collapse;margin-top:8px">
      <tr><td style="width:${cellW}px"></td>${corrData.tickers.map(t=>`<th style="width:${cellW}px;font-size:11px;text-align:center;padding:3px;color:var(--dim)">${t}</th>`).join("")}</tr>
      ${corrData.matrix.map((row,i)=>`<tr>
        <th style="font-size:11px;text-align:right;padding:3px 6px;color:var(--dim)">${corrData.tickers[i]}</th>
        ${row.map((v,j)=>`<td style="width:${cellW}px;height:${cellW}px;text-align:center;font-size:11px;font-family:var(--mono);background:${corrColor(v)};color:${v==null||Math.abs(v)<0.5?"#333":"#fff"}">${v!=null?v.toFixed(2):"—"}</td>`).join("")}
      </tr>`).join("")}
    </table></div>
    <p class="hint" style="margin-top:6px">Correlation matrix — weekly returns over the available history. Green = negative correlation (diversifying), red = positive (concentrated). Based on the available overlapping weekly price history per pair.</p>`;
  }

  const caveat = `<p class="hint" style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">
    <b>Honest limitations:</b> Portfolio return uses current weights throughout (buy-and-hold approximation — true TWR needs transaction dates). Max drawdown is on the blended series, not individual peaks. Benchmark comparison uses the full available history, not your actual holding period. Risk-free rate: US 10Y from macro data (${macro?.series?.us10y?.current??4.5}%). This is educational analysis, not a performance audit.
  </p>`;

  return `
    <div class="panel wide">
      <div class="panelhead"><span class="panelt">Portfolio vs ${bmLabel}</span><span class="panels">rebased to 100 · weekly closes · ~2yr window</span></div>
      ${chart}
    </div>
    <div class="panel wide">
      <div class="panelhead"><span class="panelt">Risk &amp; return metrics</span></div>
      ${metricsTable}
    </div>
    ${contrib.length?`<div class="panel wide"><div class="panelhead"><span class="panelt">Return attribution</span><span class="panels">contribution of each holding to total portfolio return</span></div>${attrTable}</div>`:""}
    ${corrHtml?`<div class="panel wide"><div class="panelhead"><span class="panelt">Correlation matrix</span></div>${corrHtml}</div>`:""}
    ${caveat}`;
}

/* ============================================================
   WIRING (unchanged + pfView tab switch + pfConc + pfGate)
   ============================================================ */
async function pushCustomToGitHub(customObj){
  const cfg = getGithubCfg();
  if(!cfg.token || !cfg.repo) return false;
  const path = "custom_tickers.json";
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(customObj, null, 2))));
  const base = `https://api.github.com/repos/${cfg.repo}/contents/${path}`;
  let sha = null;
  try { const r = await fetch(base, {headers:{Authorization:`Bearer ${cfg.token}`}});
    if(r.ok){ const j=await r.json(); sha=j.sha; } } catch(e){}
  const body = {message:`custom: update tickers ${new Date().toISOString().slice(0,10)}`, content};
  if(sha) body.sha = sha;
  const res = await fetch(base, {method:"PUT", headers:{Authorization:`Bearer ${cfg.token}`,"Content-Type":"application/json"}, body:JSON.stringify(body)});
  return res.ok;
}
function getGithubCfg(){ try{ return JSON.parse(localStorage.getItem("terminal_gh")||"{}"); }catch(e){ return {}; } }
function saveGithubCfg(cfg){ localStorage.setItem("terminal_gh", JSON.stringify(cfg)); }

function wirePortfolio(root){
  if(!State.portfolio) return;
  const P = State.portfolio;
  const on=(sel,fn)=>root.querySelectorAll(sel).forEach(el=>el.onclick=()=>fn(el));

  const doImportText = text => {
    const parsed = parseHoldingsCSV(text);
    if(parsed.error){ P.lastImport = `⚠ ${parsed.error}`; savePortfolio(); render(); return; }
    const rep = importHoldingsRows(parsed.rows);
    P.lastImport = `Imported ${parsed.rows.length} rows: ${rep.matched} analyzed now, ${rep.pending} pending pipeline${rep.unknown.length?`, ${rep.unknown.length} need a market (${rep.unknown.join(", ")} — add them individually below and pick IN/US)`:""}.`;
    savePortfolio(); render();
  };

  on("[data-pfimportpaste]", ()=>{ const ta=root.querySelector("#pfPaste"); if(ta && ta.value.trim()) doImportText(ta.value); });
  on("[data-pfimportfile]", ()=>{
    const inp = root.querySelector("#pfFile");
    const file = inp?.files?.[0];
    if(!file){ P.lastImport="⚠ Choose a file first."; savePortfolio(); render(); return; }
    const reader = new FileReader();
    reader.onload = e => {
      if(file.name.endsWith(".csv")||file.name.endsWith(".txt")){ doImportText(e.target.result); return; }
      // Excel: try SheetJS
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), {type:"array"});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        doImportText(csv);
      } catch(err) {
        P.lastImport = "⚠ Excel parsing failed (SheetJS not loaded or file corrupt). Try exporting as CSV from your broker instead.";
        savePortfolio(); render();
      }
    };
    file.name.endsWith(".csv")||file.name.endsWith(".txt") ? reader.readAsText(file) : reader.readAsArrayBuffer(file);
  });

  on("[data-pfmkt]", el=>{ P.addMkt=el.dataset.pfmkt; savePortfolio(); render(); });
  on("[data-pfadd]", async ()=>{
    const t=(root.querySelector("#pfTicker")?.value||"").toUpperCase().trim();
    const mkt=P.addMkt||"IN";
    const qty=parseFloat(root.querySelector("#pfQty")?.value||"");
    const cost=parseFloat(root.querySelector("#pfCost")?.value||"");
    if(!t){ P.lastImport="⚠ Enter a ticker first."; savePortfolio(); render(); return; }
    importHoldingsRows([{t, mkt, qty:isNaN(qty)?null:qty, cost:isNaN(cost)?null:cost}]);
    const inUni = State.data.some(s=>s.t===t);
    if(inUni){
      P.lastImport = `${t} added — already in the loaded universe, analyzed below.`;
    } else {
      const cfg = getGithubCfg();
      if(cfg.token && cfg.repo){
        P.lastImport = `${t} added — pushing custom_tickers.json to GitHub automatically…`;
        savePortfolio(); render();
        const ok = await pushCustomToGitHub({US:P.custom.US, IN:P.custom.IN});
        P.lastImport = ok
          ? `${t} pushed to GitHub ✓ — the Actions workflow will fetch it in ~2 minutes. Reload the page when the pipeline completes to see the full analysis.`
          : `${t} added to custom list but GitHub push failed — check your token and repo in the GitHub settings below, or download the file manually.`;
      } else {
        P.lastImport = `${t} added to the custom list. Connect GitHub below to push automatically, or download custom_tickers.json and commit it to your repo.`;
      }
    }
    savePortfolio(); render();
  });
  on("[data-pfrm]", el=>{ P.holdings=P.holdings.filter(h=>h.t!==el.dataset.pfrm);
    P.custom.US=P.custom.US.filter(t=>t!==el.dataset.pfrm); P.custom.IN=P.custom.IN.filter(t=>t!==el.dataset.pfrm);
    savePortfolio(); render(); });
  on("[data-pfclear]", ()=>{ State.portfolio=JSON.parse(JSON.stringify(PORTFOLIO_DEFAULT)); savePortfolio(); render(); });
  on("[data-pfdlcustom]", ()=>{
    const blob=new Blob([JSON.stringify({US:P.custom.US, IN:P.custom.IN}, null, 2)], {type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="custom_tickers.json"; a.click();
  });
  on("[data-pfghpush]", async ()=>{
    P.lastImport = "Pushing custom_tickers.json to GitHub…"; savePortfolio(); render();
    const ok = await pushCustomToGitHub({US:P.custom.US, IN:P.custom.IN});
    P.lastImport = ok ? "Pushed ✓ — reload in ~2 minutes once the Actions workflow completes." : "Push failed — check your token and repo name below.";
    savePortfolio(); render();
  });
  on("[data-pfghsave]", ()=>{
    const token=(root.querySelector("#pfGhToken")?.value||"").trim();
    const repo=(root.querySelector("#pfGhRepo")?.value||"").trim();
    saveGithubCfg({token, repo});
    P.lastImport = token&&repo ? `GitHub connected: ${repo}` : "GitHub config cleared.";
    savePortfolio(); render();
  });
  on("[data-pfview]", el=>{ State.pfView=el.dataset.pfview; render(); });
  on("[data-pfconc]", el=>{ State.pfConcOpen = State.pfConcOpen===el.dataset.pfconc?null:el.dataset.pfconc; render(); });
  on("[data-pfgate]", el=>{ State.pfGateOpen = State.pfGateOpen===el.dataset.pfgate?null:el.dataset.pfgate; render(); });
}
