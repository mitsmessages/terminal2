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

/* ---------- optimization suggestions (rule-based, evidence-first) ---------- */
function pfOptimize(pc){
  const S=[];
  const add=(sev,title,detail)=>S.push({sev,title,detail});
  // R1: honesty/integrity failures — highest priority
  pc.items.forEach(x=>{
    const f12 = x.audit.hardFails.filter(f=>f.stage<=2);
    if(f12.length) add(1, `Review ${x.h.t} — fails the honesty gates you'd apply to a NEW stock`,
      `${f12.map(f=>`${f.stageName}: ${f.reason}`).join(" ")} Holding a stock exempts it from nothing — if it wouldn't get in today, ask why it stays.`);
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

  const customList = (P.custom.US.length+P.custom.IN.length) ? `<div class="panel wide" style="border-left:3px solid var(--accent)">
    <div class="panelhead"><span class="panelt">Custom tickers pending pipeline run (${P.custom.US.length+P.custom.IN.length})</span></div>
    <p style="font-size:13.5px;color:var(--dim)">${P.custom.IN.length?`IN: ${P.custom.IN.join(", ")}`:""} ${P.custom.US.length?` · US: ${P.custom.US.join(", ")}`:""}</p>
    <div style="display:flex;gap:10px;align-items:center">${wfBtn("Download custom_tickers.json","data-pfdlcustom='1'",true)}
      <span class="hint" style="margin:0">→ put it in the repo root → <code>python fetch_data.py</code> → commit data.json. Done.</span></div>
  </div>` : "";

  /* holdings table */
  let holdingsCard = "";
  if(P.holdings.length){
    const rowsHtml = pc.items.sort((a,b)=>(b.weight??-1)-(a.weight??-1)).map(x=>{
      const hf = x.audit.hardFails;
      const auditPill = hf.length
        ? `<span class="pill warn" title="${hf.map(f=>f.reason).join(" | ").replace(/"/g,"'")}">✗ S${hf.map(f=>f.stage).join(",S")}</span>`
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

  /* sector concentration */
  let concCard = "";
  if(pc.weightsValid && Object.keys(pc.bySec).length){
    concCard = `<div class="panel wide"><div class="panelhead"><span class="panelt">Concentration</span></div>
      ${Object.entries(pc.bySec).sort((a,b)=>b[1]-a[1]).map(([k,wt])=>`
        <div style="display:flex;align-items:center;gap:10px;margin:5px 0">
          <div style="width:220px;font-size:13px">${k}</div>
          <div style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:4px;height:16px"><div style="width:${Math.min(wt,100)}%;height:100%;border-radius:3px;background:${wt>40?"var(--warn)":"var(--accent)"}"></div></div>
          <div style="width:52px;text-align:right;font-family:var(--mono);font-size:13px;color:${wt>40?"var(--warn)":"var(--ink)"}">${wt.toFixed(1)}%</div></div>`).join("")}
    </div>`;
  }

  /* optimization */
  let optCard = "";
  if(pc.items.length){
    const sugg = pfOptimize(pc);
    optCard = `<div class="panel wide" style="border:2px solid var(--accent)">
      <div class="panelhead"><span class="panelt">🎯 Optimization analysis (${sugg.length})</span><span class="panels">rule-based, evidence shown — you decide</span></div>
      ${sugg.length? sugg.map(s=>`<div style="padding:10px 14px;border:1px solid var(--line);border-left:3px solid ${s.sev===1?"var(--warn)":s.sev===2?"#b8860b":"var(--accent)"};border-radius:7px;margin-bottom:8px">
        <div style="font-weight:600;font-size:14px">${s.sev===1?"🔴":s.sev===2?"🟠":"🔵"} ${s.title}</div>
        <div style="font-size:13.5px;color:var(--dim);line-height:1.6;margin-top:4px">${s.detail}</div></div>`).join("")
      : `<p style="font-size:14px;color:var(--good)">No rule-based concerns found: every holding passes the honesty gates, no position exceeds its worst-year sizing, and concentration is within bounds. That's rarer than you'd think.</p>`}
      <p class="hint" style="margin-top:10px"><b>This is educational analysis, not investment advice.</b> Every suggestion above shows the rule and evidence that produced it. Selling, trimming and buying have tax, cost and timing consequences this tool cannot see — the decisions, and the research behind them, are yours.</p>
    </div>`;
  }

  return `<div style="margin-top:10px"></div>${importCard}${addCard}${customList}${holdingsCard}${concCard}${optCard}
    ${P.holdings.length?`<p class="hint">${wfBtn("Clear portfolio","data-pfclear='1'")}</p>`:""}`;
}

/* ---------- wiring ---------- */
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
    if(/\.xlsx?$/i.test(file.name)){
      if(typeof XLSX==="undefined"){ P.lastImport="⚠ Excel support needs the SheetJS library (CDN) which didn't load — export the sheet as CSV instead; the import is identical."; savePortfolio(); render(); return; }
      const rd=new FileReader();
      rd.onload=e=>{ try{
        const wb=XLSX.read(new Uint8Array(e.target.result), {type:"array"});
        const csv=XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
        doImportText(csv);
      }catch(err){ P.lastImport="⚠ Couldn't read that Excel file ("+err.message+") — export as CSV instead."; savePortfolio(); render(); } };
      rd.readAsArrayBuffer(file);
    } else {
      const rd=new FileReader();
      rd.onload=e=>doImportText(e.target.result);
      rd.readAsText(file);
    }
  });
  on("[data-pfmkt]", el=>{ P.addMkt=el.dataset.pfmkt; savePortfolio(); render(); });
  on("[data-pfadd]", ()=>{
    const t=(root.querySelector("#pfTicker")?.value||"").toUpperCase().trim().replace(/\.(NS|BO)$/,"");
    if(!t) return;
    const qty=parseFloat(root.querySelector("#pfQty")?.value)||null;
    const cost=parseFloat(root.querySelector("#pfCost")?.value)||null;
    const mkt=P.addMkt||"IN";
    importHoldingsRows([{t, mkt, qty, cost}]);
    P.lastImport = State.data.some(s=>s.t===t) ? `${t} added — analyzed below.` : `${t} added to the custom list — download custom_tickers.json and run the pipeline to analyze it.`;
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
}
