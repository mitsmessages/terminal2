/* Stages 4-6 end-to-end tests. Cast:
   CLEANCO  — cheap, growing, covered: must reach FULLY QUALIFIED
   PRICEYX  — implied growth far above consensus & history: fails 4.1 with a computed re-entry price
   PREMX    — top-quartile P/E but elite quality: passes 4.2 via the explicit exception
   CUTX     — estimates being cut: fails 5.1 (hard)
   HOSTILEX — hostile reaction history + macro headwind: WARNS on 5.3/5.4 but must still pass Stage 5
   BIGPOSX  — fails Stage 6 liquidity at the user's size */
const fs = require("fs");
const { JSDOM } = require("jsdom");

(async () => {
  const html = `<!DOCTYPE html><html><body><div id="root"></div>
    <script>${fs.readFileSync("engine.js","utf8")}<\/script>
    <script>${fs.readFileSync("charts.js","utf8")}<\/script>
    <script>${fs.readFileSync("workflow.js","utf8")}<\/script>
    <script>${fs.readFileSync("app.js","utf8")}<\/script>
  </body></html>`;
  const errors = [];
  const dom = new JSDOM(html, { runScripts:"dangerously", url:"https://example.org/",
    beforeParse(w){
      w.fetch = () => Promise.reject(new Error("offline"));
      w.addEventListener("error", e=>errors.push(e.error?e.error.message:e.message));
    }});
  const w = dom.window;
  await new Promise(r=>setTimeout(r,250));
  let pass=0, fail=0;
  const t=(name,cond,detail)=>{ if(cond){pass++;console.log("  ok  "+name);} else {fail++;console.log("FAIL  "+name+" "+(detail??""));} };
  const click=sel=>w.eval(`(function(){const el=document.querySelector('${sel}'); if(el){el.click();return true;} return false;})()`);
  const has=txt=>w.eval(`document.body.innerHTML.includes(${JSON.stringify(txt)})`);

  /* ---------- cast + injected data feeds ---------- */
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
    // CLEANCO: FCF 17 on mcap 1000 -> 1.7% yield... too low vs 6.8-2=4.8 bar!
    // Make CLEANCO genuinely cheap: mcap 300 (price 30), pe 8 -> fcf yield 5.7%
    State.data.push(mkTest("CLEANCO", { price:30, mcap:300, ev:270, pe:8, high52:36, low52:24 }));
    // PRICEYX: tiny FCF vs huge price -> implied growth heroic; consensus 12
    State.data.push(mkTest("PRICEYX", { price:1000, mcap:10000, ev:9970, pe:80, high52:1100, low52:700 }));
    // PREMX: top-quartile PE but elite metrics (best margins/growth/roe among peers)
    State.data.push(mkTest("PREMX", { price:60, mcap:600, ev:570, pe:39, roe:35, roa:22, high52:70, low52:45,
      annual:{ periods:["2024","2023","2022","2021"], revenue:[140,115,95,78], grossProfit:[90,74,61,50],
        operatingIncome:[45,36,29,23], ebitda:[52,42,34,27], netIncome:[34,27,22,17],
        ocf:[38,31,25,20], capex:[-4,-4,-3,-3], fcf:[34,27,22,17],
        margins:[{gross:64,operating:32,ebitda:37,net:24,fcf:24},{gross:64.3,operating:31.3,ebitda:36.5,net:23.5,fcf:23.5}] }}));
    // CUTX: cheap and fine, but estimates being slashed
    State.data.push(mkTest("CUTX", { price:30, mcap:300, ev:270, pe:8, high52:36, low52:24 }));
    // HOSTILEX: identical to CLEANCO but hostile reactions; sector macro headwind applies to all Tech
    State.data.push(mkTest("HOSTILEX", { price:30, mcap:300, ev:270, pe:8, high52:36, low52:24 }));
    // BIGPOSX: fine stock, thin liquidity
    State.data.push(mkTest("BIGPOSX", { price:30, mcap:300, ev:270, pe:8, high52:36, low52:24 }));
    // peers for percentiles (mediocre, cheap-ish PEs so PREMX is top quartile)
    for(let i=0;i<8;i++){ State.data.push(mkTest("PEER"+i, { pe:12+i, roe:8+i, roa:4, price:30, mcap:300, ev:300,
      annual:{ periods:["2024","2023","2022","2021"], revenue:[100,98,97,96], grossProfit:[40,39,39,38],
        operatingIncome:[10,10,9,9], ebitda:[14,14,13,13], netIncome:[7,7,7,6], ocf:[8,8,7,7],
        capex:[-3,-3,-3,-3], fcf:[5,5,4,4],
        margins:[{gross:40,operating:10,ebitda:14,net:7,fcf:5},{gross:39.8,operating:10.2,ebitda:14.3,net:7.1,fcf:5.1}] }})); }

    // injected feeds (fetches are offline in this harness)
    MACRO_DATA = { asOf:"test", series:{ us10y:{current:4.4, chg90d:8}, in10y:{current:6.8},
      crude:{chg90d:-8}, usdinr:{chg90d:2}, vix:{current:18} } };
    ESTIMATES_DATA = {
      CLEANCO:{revenueGrowthEstimate:12, estimateRevision30d:3.5, numAnalysts:10},
      PRICEYX:{revenueGrowthEstimate:12, estimateRevision30d:0.5, numAnalysts:20},
      PREMX:{revenueGrowthEstimate:20, estimateRevision30d:2.0, numAnalysts:15},
      CUTX:{revenueGrowthEstimate:10, estimateRevision30d:-7.5, numAnalysts:8},
      HOSTILEX:{revenueGrowthEstimate:12, estimateRevision30d:0.8, numAnalysts:6},
      BIGPOSX:{revenueGrowthEstimate:12, estimateRevision30d:0.8, numAnalysts:6},
    };
    applyEstimatesGrowth(State.data, ESTIMATES_DATA);
    REACTIONS_DATA = [
      { ticker:"HOSTILEX", sector:"Technology", returns:[
        {date:"2025-01-15", forward60d:-12, forward90d:-14},
        {date:"2024-10-15", forward60d:-10, forward90d:-12},
        {date:"2024-07-15", forward60d:-11, forward90d:-13}] },
      { ticker:"CLEANCO", sector:"Technology", returns:[
        {date:"2025-01-15", forward60d:5, forward90d:6},
        {date:"2024-10-15", forward60d:4, forward90d:5}] },
    ];
    PRICE_HISTORY = {
      CLEANCO:{ticker:"CLEANCO", adv: 40},   // ₹40 cr/day -> cap 200 lakh
      PREMX:{ticker:"PREMX", adv: 40},
      HOSTILEX:{ticker:"HOSTILEX", adv: 40},
      BIGPOSX:{ticker:"BIGPOSX", adv: 0.4},  // ₹0.4 cr/day -> cap 2 lakh
    };
  `);

  /* ---------- drive to Stage 4 ---------- */
  console.log("\n[Drive to Stage 4]");
  t("open Workflow", click('[data-tab="workflow"]'));
  w.eval(`resetFunnel(false); render();`);
  click('[data-wfmarket="IN"]'); click('[data-wfsector="Technology"]'); click('[data-wfbegin]');
  for(const stg of [1,2,3]){ click('[data-wfack]'); click('[data-wfrun]'); click('[data-wfnext]'); }
  t("test stocks reach Stage 4", w.eval(`["CLEANCO","PRICEYX","PREMX","CUTX","HOSTILEX","BIGPOSX"].every(x=>State.funnel.stageResults[3].pass.includes(x))`),
    w.eval(`JSON.stringify([2,3].map(k=>State.funnel.stageResults[k].fail.map(f=>f.t+": "+f.reasons.join("|"))))`));
  t("Stage 4 teaching (Cisco example)", has("Cisco in 2000"));

  console.log("\n[Stage 4 — Price]");
  click('[data-wfack]'); click('[data-wfrun]');
  const s4 = () => w.eval(`JSON.stringify({pass:State.funnel.stageResults[4].pass, fail:State.funnel.stageResults[4].fail.map(f=>({t:f.t,r:f.reasons.join(" | ")}))})`);
  t("PRICEYX rejected — expectations unbeatable", w.eval(`State.funnel.stageResults[4].fail.some(f=>f.t==="PRICEYX"&&/implies/.test(f.reasons.join()))`), s4());
  t("PRICEYX re-entry ticket carries a computed PRICE", w.eval(`State.funnel.tickets.some(tk=>tk.t==="PRICEYX"&&tk.stage===4&&/Becomes interesting below ₹/.test(tk.reentry.join()))`),
    w.eval(`JSON.stringify(State.funnel.tickets.filter(tk=>tk.t==="PRICEYX").map(tk=>tk.reentry))`));
  t("PREMX passes 4.2 via the EXPLICIT quality exception", w.eval(`State.funnel.stageResults[4].detail["PREMX"].some(c=>c.id==="sectorpe"&&c.status==="pass"&&/exception/.test(c.reason))`),
    w.eval(`JSON.stringify(State.funnel.stageResults[4].detail["PREMX"])`));
  t("CLEANCO passes all price checks incl. India-bond spread", w.eval(`State.funnel.stageResults[4].pass.includes("CLEANCO") && State.funnel.stageResults[4].detail["CLEANCO"].some(c=>c.id==="bondspread"&&/India 10Y 6.8/.test(c.reason))`), s4());
  click('[data-wfnext]');

  console.log("\n[Stage 5 — Timing: hard vs soft]");
  t("teaching states the hard/soft design", has("only the first two can reject"));
  click('[data-wfack]'); click('[data-wfrun]');
  const s5 = () => w.eval(`JSON.stringify({pass:State.funnel.stageResults[5].pass, fail:State.funnel.stageResults[5].fail.map(f=>({t:f.t,r:f.reasons.join(" | ")}))})`);
  t("CUTX rejected — estimates being cut (hard)", w.eval(`State.funnel.stageResults[5].fail.some(f=>f.t==="CUTX"&&/cut/.test(f.reasons.join()))`), s5());
  t("HOSTILEX PASSES despite hostile history — soft warns don't reject", w.eval(`State.funnel.stageResults[5].pass.includes("HOSTILEX")`), s5());
  t("HOSTILEX carries the reaction CAUTION in detail", w.eval(`State.funnel.stageResults[5].detail["HOSTILEX"].some(c=>c.id==="reactions"&&c.status==="warn"&&/personality/.test(c.reason))`));
  t("caution badge shown on passed roster row", has("caution"));
  t("CUTX re-entry: revisions stabilizing", w.eval(`State.funnel.tickets.some(tk=>tk.t==="CUTX"&&/stabilizes above/.test(tk.reentry.join()))`));
  click('[data-wfnext]');

  console.log("\n[Stage 6 — Fit & Size]");
  t("Stage 6 teaching gate", has("Size for the floor"));  // note: "&" is HTML-escaped in innerHTML, so avoid it in probes
  click('[data-wfack]');
  t("settings card renders", has("Your parameters") && has("Pain limit"));
  // default LT horizon; set position size 5 lakh
  w.eval(`document.querySelector("#wf6pos").value=5; document.querySelector("#wf6pos").onchange({target:{value:5}});`);
  t("BIGPOSX fails liquidity at 5 lakh vs ₹0.4cr/day", has("exceeds 5% of a typical day's trading"));
  t("CLEANCO liquidity ok at same size", w.eval(`wf6Assess(computeRows().find(s=>s.t==="CLEANCO"), State.funnel).liquidity.status==="pass"`));
  t("sizing guidance states its assumption", has("stated assumption: 1.5× the worst revenue fall"));
  t("nothing FULLY QUALIFIED before answers", !has("FULLY QUALIFIED</span>") || !w.eval(`computeRows().some(s=>typeof wf6Qualified==="function" && wf6Qualified(s,State.funnel).qualified)`));
  // answer CLEANCO's four questions
  w.eval(`(function(){ State.funnel.qualitative={ CLEANCO:{moat:"20-yr contracts", mgmt:"buybacks below value", risk:"GST survivable", bear:"Growth slows to sector average and the multiple compresses."} }; saveFunnel(); render(); })()`);
  t("CLEANCO now FULLY QUALIFIED", w.eval(`wf6Qualified(computeRows().find(s=>s.t==="CLEANCO"), State.funnel).qualified===true`));
  t("final report renders with audit trail + bear case", has("Final report") && has("Growth slows to sector average"));
  t("audit trail shows stage lines", has("S2 Forensics:") && has("S5 Timing:"));

  console.log("\n[Short-term fork]");
  click(`[data-wf6horizon="ST"]`);
  t("ST warns about intraday honestly", has("cannot support intraday"));
  t("HOSTILEX (flat revisions 0.8) routed to LT, not rejected", w.eval(`(function(){const a=wf6Assess(computeRows().find(s=>s.t==="HOSTILEX"), State.funnel); return a.catalyst.status==="fail" && /long-term/.test(a.catalyst.reason);})()`));
  t("CLEANCO (revision impulse 3.5) has a live catalyst", w.eval(`wf6Assess(computeRows().find(s=>s.t==="CLEANCO"), State.funnel).catalyst.status==="pass"`));

  console.log("\n[Regression]");
  t("stocks tab still renders", click('[data-tab="stocks"]') && has("Showing"));
  t("zero page errors throughout", errors.length===0, errors.join(" | "));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
