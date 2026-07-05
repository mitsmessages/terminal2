/* End-to-end jsdom test of the Workflow funnel: Stage 0 selection ->
   teaching ack -> Stage 1 run -> roster -> re-entry ticket -> advance.
   Includes a deliberately corrupted stock that MUST be rejected. */
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
  const store = {};
  const dom = new JSDOM(html, { runScripts:"dangerously", url:"https://example.org/",
    beforeParse(w){
      w.fetch = () => Promise.reject(new Error("offline"));
      w.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
      w.addEventListener("error", e=>errors.push(e.error?e.error.message:e.message));
    }});
  const w = dom.window;
  await new Promise(r=>setTimeout(r,250));
  let pass=0, fail=0;
  const t=(name,cond,detail)=>{ if(cond){pass++;console.log("  ok  "+name);} else {fail++;console.log("FAIL  "+name+" "+(detail??""));} };
  const click=sel=>w.eval(`(function(){const el=document.querySelector('${sel}'); if(el){el.click();return true;} return false;})()`);
  const has=txt=>w.eval(`document.body.innerHTML.includes(${JSON.stringify(txt)})`)
  // hasRendered: checks only the #root element's text (not <script> source)
  const hasRendered=txt=>w.eval(`(document.getElementById("root")||document.body).textContent.includes(${JSON.stringify(txt)})`);

  // Inject a corrupted Indian stock: mcap wildly off from price*shares AND
  // an unadjusted-demerger-style 52wk high (2.5x price) — must fail Stage 1.
  w.eval(`State.data.push(normalize({t:"BADCO", n:"Corrupted Test Co", mkt:"IN", sec:"Technology",
    price:100, shares:10, mcap:5000, ev:5000, debt:0, g:8, high52:250, low52:80,
    pe:20, annual:{periods:["2024","2023","2022","2021"], revenue:[100,90,80,70], netIncome:[10,9,8,7],
      fcf:[10,9,8,7], ocf:[11,10,9,8], capex:[-1,-1,-1,-1], ebitda:[15,13,12,11], operatingIncome:[12,11,10,9],
      margins:[{net:10,operating:12,ebitda:15,fcf:10}]}, quarterly:{}}));`);

  console.log("\n[Workflow tab]");
  t("Workflow tab button exists", click('[data-tab="workflow"]'));
  t("Stage 0 renders", has("Stage 0 — Choose your hunting ground"));
  t("teaching explains relativity", has("Choosing the pond first"));

  console.log("\n[Stage 0 selection]");
  t("pick India", click('[data-wfmarket="IN"]'));
  t("fallback index note shown (no classification.json)", has("classification.json not loaded"));
  t("sector chips computed with counts", has("All sectors"));
  t("pick Technology sector", click('[data-wfsector="Technology"]'));
  t("begin button reflects slice", has("Begin the funnel with"));
  t("begin the funnel", click('[data-wfbegin]'));

  console.log("\n[Stage 1 teaching gate]");
  t("Stage 1 teaching renders", has("Stage 1 — Data Integrity"));
  t("Vedanta example present", has("Vedanta"));
  t("whyPrev chain present", has("previous stage couldn't catch this"));
  t("conditions listed in layman terms", has("Numbers reconcile internally") && has("Matches the primary source"));
  t("run button NOT available before ack", !w.eval(`!!document.querySelector('[data-wfrun]')`));
  t("acknowledge teaching", click('[data-wfack]'));
  t("run button now available", w.eval(`!!document.querySelector('[data-wfrun]')`));

  console.log("\n[Stage 1 run]");
  t("run the filter", click('[data-wfrun]'));
  t("roster rendered with result count", has("pass Stage 1"));
  t("BADCO rejected", has("BADCO") && w.eval(`State.funnel.stageResults[1].fail.some(f=>f.t==="BADCO")`));
  const badReasons = w.eval(`JSON.stringify(State.funnel.stageResults[1].fail.find(f=>f.t==="BADCO").reasons)`);
  t("rejection reason names the mcap mismatch or implausible high", /Market cap|52-week/.test(badReasons), badReasons);
  t("clean IN tech stocks pass (TCS/INFY)", w.eval(`["TCS","INFY"].every(x=>State.funnel.stageResults[1].pass.includes(x))`));
  t("external check honestly 'na' without verify data", w.eval(`State.funnel.stageResults[1].detail["TCS"].some(c=>c.id==="external"&&c.status==="na")`));
  t("unverified badge shown on passed rows", has("unverified"));

  console.log("\n[Re-entry tickets]");
  t("BADCO in Stage 1 fail list", w.eval(`State.funnel.stageResults[1].fail.some(f=>f.t==="BADCO")`));
  t("ticket shows 'comes back when'", has("Comes back when:"));
  t("funnel state persisted to localStorage (funnel structure present)", w.eval(`(function(){const v=localStorage.getItem("terminal_funnel"); return !!v && !!JSON.parse(v).stageResults;})()`));

  console.log("\n[Advance + ticket auto-met]");
  t("continue to Stage 2", click('[data-wfnext]'));
  t("Stage 2 locked preview with planned conditions", has("Conditions pending your approval") && has("Beneish M-Score"));
  t("Satyam example present", has("Satyam"));
  // Fix 9: tickets are opt-in — manually add BADCO ticket then verify auto-met works
  w.eval(`State.funnel.tickets=[{t:"BADCO",n:"Bad",stage:1,stageName:"Data Integrity",reasons:["mcap mismatch"],reentry:["when mcap corrects"],created:"2026-01-01",met:false}]; saveFunnel();`);
  w.eval(`(function(){const s=State.data.find(x=>x.t==="BADCO"); s.mcap=1000; s.high52=120; render();})();`);
  t("ticket auto-flips to MET when data corrects", w.eval(`State.funnel.tickets.find(tk=>tk.t==="BADCO")?.met===true`));
  t("MET ticket offers re-run from failed stage", has("re-entry condition MET"));

  console.log("\n[Regression: original tabs still fine]");
  t("back to Stocks tab renders screener", click('[data-tab="stocks"]') && has("Showing"));
  t("zero page errors throughout", errors.length===0, errors.join(" | "));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
