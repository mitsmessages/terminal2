const fs = require("fs");
const { JSDOM } = require("jsdom");

async function run(label){
  const html = `<!DOCTYPE html><html><body><div id="root"></div>
    <script>${fs.readFileSync("engine.js","utf8")}<\/script>
    <script>${fs.readFileSync("charts.js","utf8")}<\/script>
    <script>${fs.readFileSync("app.js","utf8")}<\/script>
  </body></html>`;
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously", url: "https://example.org/",
    beforeParse(window){
      window.fetch = () => Promise.reject(new Error("offline"));
      window.matchMedia = window.matchMedia || (()=>({matches:false,addListener(){},removeListener(){}}));
      window.addEventListener("error", e => errors.push(e.error ? e.error.message : e.message));
    }
  });
  const w = dom.window;
  await new Promise(r=>setTimeout(r, 250));
  try {
    w.eval(`if (typeof applyEstimatesGrowth==="function" && typeof State!=="undefined" && State.data && State.data.length) {
      applyEstimatesGrowth(State.data, {AAPL:{revenueGrowthEstimate:12, numAnalysts:30}, HDFCBANK:{epsGrowthNextYear:55}});
      render();
    } else { throw new Error("State/data not available"); }`);
  } catch(e){ errors.push("merge: " + e.message); }
  try {
    const opened = w.eval(`(function(){const r=document.querySelector('[data-open]'); if(r){r.click(); return document.body.innerHTML.length;} return 0;})()`);
    if(!opened) errors.push("no rows rendered to open");
    // verify the growth-source label made it into the tearsheet
    const hasLabel = w.eval(`document.body.innerHTML.includes("Starting growth")`);
    if(!hasLabel) errors.push("DCF growth-source label missing from tearsheet");
    // AAPL g should now be 12 not 8
    const g = w.eval(`State.data.find(s=>s.t==="AAPL").g`);
    if(g!==12) errors.push("AAPL growth not merged: g="+g);
    // healthScore consistency on a live rendered row
    const consistent = w.eval(`(function(){const rows=computeRows(); const s=rows[0];
      const P=s.pillars; const q=Math.round(P.growth.score*0.20+P.profitability.score*0.20+P.cashQuality.score*0.25+P.balanceSheet.score*0.15+P.returns.score*0.20);
      return s.healthScore===q;})()`);
    if(!consistent) errors.push("healthScore != pillar composite in live render");
  } catch(e){ errors.push("interact: " + e.message); }
  console.log(`${label}: ${errors.length===0 ? "OK — zero errors, tearsheet opened, growth merged, scores consistent" : "ERRORS:\n  " + errors.join("\n  ")}`);
  return errors.length;
}
(async ()=>{ const f = await run("browser-equivalent smoke (SAMPLE data, offline fetches)"); process.exit(f?1:0); })();
