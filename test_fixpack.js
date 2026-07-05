/* Edge-case tests for the fix pack — run: node test_fixpack.js */
const fs = require("fs"), vm = require("vm");
const ctx = { console, Math, JSON };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("engine.js", "utf8"), ctx);

let pass = 0, fail = 0;
const t = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail ?? ""}`); }
};

console.log("\n[B8] DCF guard & fade");
const mkStock = (over={}) => vm.runInContext(`normalize(${JSON.stringify({
  t:"TST", n:"Test", mkt:"US", sec:"Technology", price:100, shares:1, mcap:100, ev:100, debt:0, g:8,
  annual:{periods:["2024","2023","2022","2021"], revenue:[100,90,80,70], netIncome:[10,9,8,7],
    fcf:[10,9,8,7], ocf:[11,10,9,8], capex:[-1,-1,-1,-1], ebitda:[15,13,12,11], operatingIncome:[12,11,10,9], grossProfit:[50,45,40,35],
    margins:[{net:10,operating:12,ebitda:15,fcf:10},{net:10,operating:12.2,ebitda:14,fcf:10}]},
  quarterly:{periods:[],revenue:[],netIncome:[],fcf:[],ebitda:[],operatingIncome:[],margins:[]},
  ...over})})`, ctx);

t("r-tg guard returns null at 6% disc / 5% terminal",
  vm.runInContext(`dcf(${JSON.stringify(mkStock())}, {discount:6, termGrowth:5, years:10})`, ctx) === null);
t("normal DCF returns positive number",
  vm.runInContext(`dcf(${JSON.stringify(mkStock())}, {discount:10, termGrowth:3, years:10})`, ctx) > 0);
// fade check: with g0 == tg the fade is inert, value must equal a pure-tg model
const vSame = vm.runInContext(`dcf(${JSON.stringify(mkStock({g:3}))}, {discount:10, termGrowth:3, years:10})`, ctx);
let pvRef = 0, f = 10; for (let y=1;y<=10;y++){ f*=1.03; pvRef += f/Math.pow(1.10,y); } pvRef += (f*1.03)/(0.10-0.03)/Math.pow(1.10,10);
t("fade reaches terminal exactly (g0==tg case matches closed form)", Math.abs(vSame - pvRef) < 1e-6, `got ${vSame} want ${pvRef}`);

console.log("\n[B5] cagrX");
t("null middle year doesn't shrink period count",
  Math.abs(vm.runInContext(`cagrX([121,null,null,100]).v`, ctx) - 6.5595) < 0.01);
t("negative MIDDLE year still computes, with note",
  (()=>{ const c = vm.runInContext(`cagrX([120,-5,90,100])`, ctx); return c && c.v!=null && c.note!=null; })());
t("negative ENDPOINT returns null", vm.runInContext(`cagrX([120,90,100,-10])`, ctx) === null);

console.log("\n[A6] quarterly YoY");
t("qyoy computes Q0 vs Q4", Math.abs(vm.runInContext(`qyoy([110,80,70,60,100,75,65,55])`, ctx) - 10) < 1e-9);
t("qyoy null with only 4 quarters", vm.runInContext(`qyoy([110,80,70,60])`, ctx) === null);

console.log("\n[analyze] full run, seasonal stock");
// Seasonal: Q0 sequential drop of -27% but YoY +10% → must NOT warn "declining YoY"
const seasonal = mkStock({ quarterly:{periods:["a","b","c","d","e","f","g","h"],
  revenue:[110,150,90,80,100,140,85,75], netIncome:[11,15,9,8,10,14,8,7], fcf:[10,14,8,7,9,13,8,6],
  ebitda:[16,20,13,12,15,19,12,11], operatingIncome:[13,17,11,10,12,16,10,9], margins:[]}});
const an = vm.runInContext(`analyze(${JSON.stringify(seasonal)}, 120)`, ctx);
t("no spurious seasonal warn (YoY positive)", !an.flags.some(f=>f.tag==="Quarterly revenue declining YoY" || f.tag==="Sequential slowdown (seasonality not stripped)"), JSON.stringify(an.flags.map(f=>f.tag)));
t("revQyoy exposed on result", Math.abs(an.revQyoy - 10) < 1e-9);
t("healthScore equals pillar composite", (()=>{ const P=an.pillars; const q=Math.round(P.growth.score*0.20+P.profitability.score*0.20+P.cashQuality.score*0.25+P.balanceSheet.score*0.15+P.returns.score*0.20); return an.healthScore===q; })(), `hs=${an.healthScore}`);

// True YoY decline must warn
const declining = mkStock({ quarterly:{periods:["a","b","c","d","e","f","g","h"],
  revenue:[90,150,90,80,100,140,85,75], netIncome:[9,15,9,8,10,14,8,7], fcf:[8,14,8,7,9,13,8,6],
  ebitda:[13,20,13,12,15,19,12,11], operatingIncome:[10,17,11,10,12,16,10,9], margins:[]}});
const an2 = vm.runInContext(`analyze(${JSON.stringify(declining)}, 120)`, ctx);
t("true YoY decline warns", an2.flags.some(f=>f.tag==="Quarterly revenue declining YoY"));

console.log("\n[B2] threshold alignment (fcfNi=0.75 band)");
const midBand = mkStock({ annual:{periods:["2024","2023","2022","2021"], revenue:[100,90,80,70], netIncome:[10,9,8,7],
  fcf:[7.5,9,8,7], ocf:[11,10,9,8], capex:[-3.5,-1,-1,-1], ebitda:[15,13,12,11], operatingIncome:[12,11,10,9], grossProfit:[50,45,40,35],
  margins:[{net:10,operating:12,ebitda:15,fcf:7.5},{net:10,operating:12.2,ebitda:14,fcf:10}]} });
const an3 = vm.runInContext(`analyze(${JSON.stringify(midBand)}, null)`, ctx);
t("fcfNi 0.75: NO warn flag (pillar's moderate-gap band covers it)", !an3.flags.some(f=>f.tag==="Low cash conversion"), `fcfNi=${an3.fcfNi}`);
t("fcfNi 0.75: pillar shows moderate gap", an3.pillars.cashQuality.evidence.some(e=>/moderate gap/.test(e.txt)));

console.log("\n[A3] Altman routing");
const finStock = {...an, sec:"Financial Services", bsDetail:{totalAssets:[1000,900],totalLiab:[900,820],currentAssets:[100,90],currentLiab:[300,280],retainedEarnings:[50,45],ltDebt:[200,190]}};
const fz = vm.runInContext(`forensicScores(${JSON.stringify(finStock)})`, ctx);
t("financials: Altman suppressed", fz.altman.score===null && fz.altman.notApplicable===true);
const techStock = {...an, sec:"Technology", mcap:200, bsDetail:{totalAssets:[100,90],totalLiab:[40,38],currentAssets:[50,45],currentLiab:[20,18],retainedEarnings:[30,25],ltDebt:[10,10]}};
const tz = vm.runInContext(`forensicScores(${JSON.stringify(techStock)})`, ctx);
t("tech: Z'' variant used", tz.altman.variant && tz.altman.variant.startsWith("Z''"), JSON.stringify(tz.altman));
const indStock = {...techStock, sec:"Industrials"};
const iz = vm.runInContext(`forensicScores(${JSON.stringify(indStock)})`, ctx);
t("industrial: original Z used", iz.altman.variant && iz.altman.variant.startsWith("Z (manufacturer"), JSON.stringify(iz.altman.variant));

console.log("\n[A2] macro sector keys");
const macro = {asOf:"x", series:{us10y:{current:4.4, chg90d:8}, crude:{chg90d:-8}, usdinr:{chg90d:2}, vix:{current:18}}};
const mrHealth = vm.runInContext(`macroRead(${JSON.stringify({sec:"Healthcare",mkt:"IN"})}, ${JSON.stringify(macro)})`, ctx);
t("Healthcare now has usdStrength read for IN", mrHealth.notes.some(n=>/Rupee weakened/.test(n.txt)), JSON.stringify(mrHealth.notes));
const mrUtil = vm.runInContext(`macroRead(${JSON.stringify({sec:"Utilities",mkt:"US"})}, ${JSON.stringify(macro)})`, ctx);
t("Utilities now rate-sensitive (headwind on rising rates)", mrUtil.notes.some(n=>n.dir==="headwind"), JSON.stringify(mrUtil.notes));
const mrRE = vm.runInContext(`macroSensitivityFor("Real Estate")`, ctx);
t("Real Estate mapped", mrRE.rates === -2);

console.log("\n[B3] incremental flat-revenue guard");
const flat = mkStock({ annual:{periods:["2024","2023","2022","2021"], revenue:[100,101,99,100], netIncome:[10,2,8,7],
  fcf:[10,2,8,7], ocf:[11,3,9,8], capex:[-1,-1,-1,-1], ebitda:[15,5,12,11], operatingIncome:[12,3,10,9], grossProfit:[50,45,40,35], margins:[{net:10,operating:12,ebitda:15,fcf:10}]} });
const vet = vm.runInContext(`veteranMetrics(${JSON.stringify(flat)})`, ctx);
t("flat revenue → 'can't be measured' read, score 50", vet.incremental.inc===null && /flat/.test(vet.incremental.read), vet.incremental.read);

console.log("\n[B4] reverse-DCF ceiling");
const hype = vm.runInContext(`(function(){ const s = Object.assign({}, analyze(${JSON.stringify(mkStock({price:100000, mcap:100000}))}, null)); return veteranMetrics(s); })()`, ctx);
t("price far beyond model range → impliedTxt '45%+'", hype.impliedGrowth.impliedTxt==="45%+", JSON.stringify(hype.impliedGrowth.impliedTxt));
t("ceiling case scores as heroic", hype.impliedGrowth.score===15);

console.log("\n[A1] applyEstimatesGrowth");
const stocks = [{t:"A", g:8},{t:"B", g:8},{t:"C", g:8}];
vm.runInContext(`applyEstimatesGrowth(${JSON.stringify(stocks)}, {A:{revenueGrowthEstimate:22, numAnalysts:15}, B:{epsGrowthNextYear:55}})`, ctx);
// note: vm serialization — rerun inside context to inspect
const merged = vm.runInContext(`(function(){ const st=[{t:"A",g:8},{t:"B",g:8},{t:"C",g:8}]; applyEstimatesGrowth(st, {A:{revenueGrowthEstimate:22,numAnalysts:15}, B:{epsGrowthNextYear:55}, C:null}); return st; })()`, ctx);
t("consensus replaces default", merged[0].g===22 && /consensus/.test(merged[0].gSource));
t("clamped at 30", merged[1].g===30);
t("no coverage → labeled low-confidence default", merged[2].g===8 && /default/.test(merged[2].gSource));

console.log("\n[A5] LBO interest");
const lboOK = vm.runInContext(`valuationExtras(${JSON.stringify({...mkStock(), evEbitda:8, bsDetail:{totalAssets:[100],totalLiab:[40],goodwillIntangibles:[5]}, annual:{ebitda:[15], fcf:[10]}, shares:1, price:100, debt:0, mcap:100})})`, ctx);
t("healthy LBO returns a price", lboOK.lboImpliedPrice!=null && isFinite(lboOK.lboImpliedPrice));
const lboBroken = vm.runInContext(`valuationExtras(${JSON.stringify({...mkStock(), evEbitda:8, bsDetail:{totalAssets:[100],totalLiab:[40],goodwillIntangibles:[5]}, annual:{ebitda:[100], fcf:[5]}, shares:1, price:100, debt:0, mcap:100})})`, ctx);
t("FCF < interest → no floor, honest note", lboBroken.lboImpliedPrice==null && /cannot cover interest/.test(lboBroken.lboNote||""), JSON.stringify(lboBroken));
// interest actually reduces the floor vs interest-free math:
t("interest lowers implied price vs old model", (()=>{
  // old model paydown: debt = max(0, 4.5*15 - 10*5) = 17.5 ; new model pays less principal → higher exit debt → lower affordable EV
  return lboOK.lboImpliedPrice < ( ( ( (15*8) - Math.max(0, 4.5*15-10*5) ) / Math.pow(1.20,5) + 4.5*15 ) - 0 ) / 1;
})());

console.log("\n[null-data path]");
const empty = vm.runInContext(`analyze(normalize({t:"E",n:"Empty",mkt:"US",sec:"",price:10,shares:1,mcap:10,ev:10,debt:0,g:8,annual:{},quarterly:{}}), null)`, ctx);
t("empty stock analyzes without crash", empty && empty.healthScore>=0 && empty.pillars!=null);
const emptyVet = vm.runInContext(`veteranMetrics(${JSON.stringify(empty)})`, ctx);
t("empty stock veteran lens no crash", emptyVet.composite>=0);
const emptyFor = vm.runInContext(`forensicScores(${JSON.stringify(empty)})`, ctx);
t("empty stock forensic honest nulls", emptyFor.altman.score===null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
