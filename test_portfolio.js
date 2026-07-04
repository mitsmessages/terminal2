/* Portfolio tab end-to-end tests.
   Covers: messy-header CSV import (.NS suffixes, currency symbols),
   matched/pending/unknown classification, same-logic funnel audit on
   holdings, mixed-currency weights via USDINR, every optimizer rule,
   custom-ticker flow, remove/clear, regression. */
const fs = require("fs");
const { JSDOM } = require("jsdom");

(async () => {
  const html = `<!DOCTYPE html><html><body><div id="root"></div>
    <script>${fs.readFileSync("engine.js","utf8")}<\/script>
    <script>${fs.readFileSync("charts.js","utf8")}<\/script>
    <script>${fs.readFileSync("workflow.js","utf8")}<\/script>
    <script>${fs.readFileSync("portfolio.js","utf8")}<\/script>
    <script>${fs.readFileSync("app.js","utf8")}<\/script>
  </body></html>`;
  const errors = [];
  const dom = new JSDOM(html, { runScripts:"dangerously", url:"https://example.org/",
    beforeParse(w){
      w.fetch = () => Promise.reject(new Error("offline"));
      w.URL.createObjectURL = ()=>"blob:test";
      w.addEventListener("error", e=>errors.push(e.error?e.error.message:e.message));
    }});
  const w = dom.window;
  await new Promise(r=>setTimeout(r,250));
  let pass=0, fail=0;
  const t=(name,cond,detail)=>{ if(cond){pass++;console.log("  ok  "+name);} else {fail++;console.log("FAIL  "+name+" "+(detail??""));} };
  const click=sel=>w.eval(`(function(){const el=document.querySelector('${sel}'); if(el){el.click();return true;} return false;})()`);
  const has=txt=>w.eval(`document.body.innerHTML.includes(${JSON.stringify(txt)})`);

  /* ---------- cast (same mkTest pattern) ---------- */
  w.eval(`window.mkTest = function(t, over){
    const base = {t, n:t+" Ltd", mkt:"IN", sec:"Technology", price:100, shares:10, mcap:1000, ev:970, debt:-30, g:10,
      pe:20, roe:22, roa:14, high52:120, low52:80,
      bsDetail:{ totalAssets:[200,180], totalLiab:[60,58], currentAssets:[90,80], currentLiab:[40,38],
        retainedEarnings:[80,70], ltDebt:[10,12], receivables:[15,14], ppeNet:[50,48],
        goodwillIntangibles:[5,5], cogs:[40,37], sga:[20,19], depreciation:[8,8], dilutedShares:[10,10] },
      annual:{ periods:["2024","2023","2022","2021"], revenue:[100,90,80,72], grossProfit:[60,54,48,43],
        operatingIncome:[25,22,19,17], ebitda:[30,26,23,20], netIncome:[18,16,14,12],
        ocf:[20,18,16,14], capex:[-3,-3,-3,-3], fcf:[17,15,13,11],
        margins:[{gross:60,operating:25,ebitda:30,net:18,fcf:17},{gross:60,operating:24.4,ebitda:28.9,net:17.8,fcf:16.7}] },
      quarterly:{ periods:["a","b","c","d","e","f","g","h"], revenue:[27,26,25,24,24,23,22,21],
        netIncome:[5,4.8,4.6,4.4,4.3,4.1,4,3.8], fcf:[4.5,4.3,4.1,4,3.9,3.7,3.6,3.5],
        ebitda:[8,7.7,7.4,7.2,7,6.8,6.6,6.4], operatingIncome:[7,6.7,6.4,6.2,6,5.8,5.6,5.4], margins:[] } };
    return normalize(Object.assign(base, over||{}));
  };`);

  w.eval(`
    // GOODCO: clean, cheap — funnel-clean holding
    State.data.push(mkTest("GOODCO", { price:30, mcap:300, ev:270, pe:8, high52:36, low52:24 }));
    // ACCRUALY: profit far ahead of cash -> fails S2 audit while held
    State.data.push(mkTest("ACCRUALY", { annual:{ periods:["2024","2023","2022","2021"],
      revenue:[100,90,80,72], grossProfit:[60,54,48,43], operatingIncome:[25,22,19,17], ebitda:[30,26,23,20],
      netIncome:[20,18,16,14], ocf:[6,5,5,4], capex:[-3,-3,-3,-3], fcf:[3,2,2,1],
      margins:[{gross:60,operating:25,ebitda:30,net:20,fcf:3},{gross:60,operating:24.4,ebitda:28.9,net:20,fcf:2.2}] }}));
    // CYCLIX: deep worst year (revenue -30%) -> tiny max position; we'll hold it BIG
    State.data.push(mkTest("CYCLIX", { price:50, mcap:500, ev:470, pe:10, high52:60, low52:35,
      annual:{ periods:["2024","2023","2022","2021"], revenue:[100,70,100,95], grossProfit:[60,40,60,57],
      operatingIncome:[25,10,25,23], ebitda:[30,14,30,28], netIncome:[18,5,18,17],
      ocf:[20,7,20,19], capex:[-3,-3,-3,-3], fcf:[17,4,17,16],
      margins:[{gross:60,operating:25,ebitda:30,net:18,fcf:17},{gross:57,operating:14.3,ebitda:20,net:7.1,fcf:5.7}] }}));
    // LAGX: bottom-of-sector quality laggard
    State.data.push(mkTest("LAGX", { roe:4, roa:1.5, pe:25, debt:80, ev:1080,
      annual:{ periods:["2024","2023","2022","2021"], revenue:[100,99,98,98], grossProfit:[30,30,29,29],
      operatingIncome:[5,5,5,5], ebitda:[8,8,8,8], netIncome:[3,3,3,3], ocf:[3.5,3.4,3.4,3.3],
      capex:[-2,-2,-2,-2], fcf:[1.5,1.4,1.4,1.3],
      margins:[{gross:30,operating:5,ebitda:8,net:3,fcf:1.5},{gross:30.3,operating:5.1,ebitda:8.1,net:3,fcf:1.4}] }}));
    // STRONGA/STRONGB: same-sector upgrades (not held) that pass honesty+quality
    ["STRONGA","STRONGB"].forEach((n,i)=>State.data.push(mkTest(n, { price:30, mcap:300, ev:270, pe:9+i, roe:30, roa:18, high52:36, low52:24,
      annual:{ periods:["2024","2023","2022","2021"], revenue:[130,112,96,82], grossProfit:[82,70,60,51],
      operatingIncome:[40,34,29,24], ebitda:[46,39,33,28], netIncome:[30,25,21,18],
      ocf:[34,28,24,20], capex:[-3,-3,-3,-3], fcf:[31,25,21,17],
      margins:[{gross:63,operating:31,ebitda:35,net:23,fcf:24},{gross:62.5,operating:30.4,ebitda:34.8,net:22.3,fcf:22.3}] }})));
    for(let i=0;i<6;i++){ State.data.push(mkTest("PEER"+i, { pe:12+i, roe:10+i, roa:5 })); }
    MACRO_DATA = { asOf:"test", series:{ us10y:{current:4.4, chg90d:8}, in10y:{current:6.8},
      crude:{chg90d:-8}, usdinr:{current:84.5, chg90d:2}, vix:{current:18} } };
    ESTIMATES_DATA = { GOODCO:{revenueGrowthEstimate:12, estimateRevision30d:1.0, numAnalysts:5} };
    applyEstimatesGrowth(State.data, ESTIMATES_DATA);
  `);

  console.log("\n[CSV import — messy real-world headers]");
  t("open Portfolio tab", click('[data-tab="portfolio"]'));
  t("import + add + honest CORS note render", has("Import your portfolio") && has("CORS"));
  w.eval(`(function(){
    document.querySelector("#pfPaste").value = [
      "Symbol;Quantity Available;Avg. Cost;Exchange",
      "GOODCO.NS;100;₹25;NSE",
      "ACCRUALY;10;90;NSE",
      "CYCLIX;400;40;NSE",
      "LAGX;20;110;NSE",
      "AAPL;5;$150;NASDAQ",
      "MYSTERY;7;12;"
    ].join("\\n");
  })()`);
  t("import pasted (semicolon delim, suffix, currency symbols)", click('[data-pfimportpaste]'));
  t("report: 5 analyzed, 1 needs market", has("5 analyzed now") && has("MYSTERY"), w.eval(`State.portfolio.lastImport`));
  t(".NS suffix stripped, ₹ parsed", w.eval(`(function(){const h=State.portfolio.holdings.find(h=>h.t==="GOODCO"); return h && h.qty===100 && h.cost===25;})()`));
  t("$ cost parsed for AAPL", w.eval(`State.portfolio.holdings.find(h=>h.t==="AAPL").cost===150`));

  console.log("\n[Holdings analysis — same logic as the funnel]");
  t("GOODCO shows funnel-clean", w.eval(`(function(){const pc=pfCompute(); const x=pc.items.find(i=>i.h.t==="GOODCO"); return x.audit.hardFails.length===0;})()`),
    w.eval(`JSON.stringify(pfCompute().items.find(i=>i.h.t==="GOODCO").audit.hardFails)`));
  t("ACCRUALY audit flags S2 accruals", w.eval(`pfCompute().items.find(i=>i.h.t==="ACCRUALY").audit.hardFails.some(f=>f.stage===2&&/accrual/i.test(f.reason))`));
  t("audit pills rendered in table", has("funnel-clean") && has("✗ S"));
  t("P&L computed (GOODCO 30 vs cost 25 = +20%)", w.eval(`Math.abs(pfCompute().items.find(i=>i.h.t==="GOODCO").pnl-20)<0.01`));
  t("mixed currency: AAPL value converted at 84.5", w.eval(`(function(){const pc=pfCompute(); const a=pc.items.find(i=>i.h.t==="AAPL"); return a && Math.abs(a.valueInr - a.value*84.5)<1;})()`));
  t("weights sum ≈ 100", w.eval(`Math.abs(pfCompute().items.reduce((a,x)=>a+(x.weight||0),0)-100)<0.5`));

  console.log("\n[Optimizer rules]");
  const sugg = () => w.eval(`JSON.stringify(pfOptimize(pfCompute()).map(s=>s.title))`);
  t("R1: ACCRUALY flagged for honesty-gate failure", w.eval(`pfOptimize(pfCompute()).some(s=>s.sev===1&&/ACCRUALY/.test(s.title))`), sugg());
  t("R2: CYCLIX oversized vs worst-year floor", w.eval(`pfOptimize(pfCompute()).some(s=>/CYCLIX is .*worst-year floor/.test(s.title))`), sugg());
  t("R3: Technology concentration flagged (>40%)", w.eval(`pfOptimize(pfCompute()).some(s=>/concentrated in Technology/.test(s.title))`), sugg());
  t("R5: LAGX laggard with STRONGA/STRONGB research pointers", w.eval(`pfOptimize(pfCompute()).some(s=>/LAGX/.test(s.title)&&/STRONG/.test(s.detail))`), sugg());
  t("suggestions framed as research, with disclaimer", has("not investment advice") && has("research pointer"));
  t("evidence shown, sorted by severity", w.eval(`(function(){const S=pfOptimize(pfCompute()); return S.length>1 && S[0].sev<=S[S.length-1].sev && S.every(s=>s.detail.length>40);})()`));

  console.log("\n[Custom ticker flow]");
  w.eval(`document.querySelector("#pfTicker").value="NEWIPO";`);
  t("add unknown ticker", click('[data-pfadd]'));
  t("NEWIPO on custom IN list + pending row", w.eval(`State.portfolio.custom.IN.includes("NEWIPO")`) && has("awaiting pipeline data"));
  t("download custom_tickers.json button present", w.eval(`!!document.querySelector("[data-pfdlcustom]")`));
  t("R7 suggestion mentions pipeline for pending", w.eval(`pfOptimize(pfCompute()).some(s=>/awaiting pipeline/.test(s.title))`));

  console.log("\n[Remove / persist / regression]");
  t("remove MYSTERY", click(`[data-pfrm="MYSTERY"]`) && w.eval(`!State.portfolio.holdings.some(h=>h.t==="MYSTERY")`));
  t("portfolio persisted", w.eval(`(function(){const v=localStorage.getItem("terminal_portfolio"); return !!v && JSON.parse(v).holdings.length>0;})()`));
  t("workflow tab unaffected", click('[data-tab="workflow"]') && has("Stage 0"));
  t("stocks tab unaffected", click('[data-tab="stocks"]') && has("Showing"));
  t("zero page errors", errors.length===0, errors.join(" | "));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
