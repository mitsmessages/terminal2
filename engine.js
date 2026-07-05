/* ============================================================
   ENGINE.JS — data, formatting, DCF, and the signal-analysis
   engine. No framework. Loads data.json; falls back to SAMPLE.
   ============================================================ */

const YRS = ["2024","2023","2022","2021"];
const QTRS = ["Q4'24","Q3'24","Q2'24","Q1'24","Q4'23","Q3'23","Q2'23","Q1'23"];

function marginsOf(rev,g,o,e,n,f){
  return rev.map((r,i)=>({
    gross:g?+(g[i]/r*100).toFixed(1):null,
    operating:+(o[i]/r*100).toFixed(1),
    ebitda:+(e[i]/r*100).toFixed(1),
    net:+(n[i]/r*100).toFixed(1),
    fcf:+(f[i]/r*100).toFixed(1),
  }));
}
function mk(t,n,mkt,sec,ind,price,shares,mcap,ev,debt,g,mult,A,Q){
  return {t,n,mkt,sec,ind,price,shares,mcap,ev,debt,g,...mult,
    annual:{periods:YRS,...A,margins:marginsOf(A.revenue,A.grossProfit,A.operatingIncome,A.ebitda,A.netIncome,A.fcf)},
    quarterly:{periods:QTRS,...Q,margins:marginsOf(Q.revenue,null,Q.operatingIncome,Q.ebitda,Q.netIncome,Q.fcf)}};
}

const SAMPLE=[
 mk("AAPL","Apple Inc.","US","Technology","Consumer Electronics",213,15.2,3238,3258,50,8,
  {pe:33,fpe:30,pb:51,ps:8.3,evEbitda:24,divYield:0.5,roe:147,roa:29,beta:1.25,high52:237,low52:164,insiderPct:2.1,prevInsiderPct:1.8},
  {revenue:[391,383,394,366],grossProfit:[180,169,171,153],operatingIncome:[123,114,119,109],ebitda:[135,126,130,120],netIncome:[94,97,100,95],ocf:[118,111,122,104],capex:[-10,-11,-11,-11],fcf:[108,100,111,93]},
  {revenue:[124,95,86,91,120,90,82,95],operatingIncome:[42,29,26,28,40,27,23,30],ebitda:[46,33,30,32,44,31,27,34],netIncome:[36,15,21,24,34,23,20,28],fcf:[35,21,22,28,33,19,21,27]}),
 mk("MSFT","Microsoft Corp.","US","Technology","Software—Infrastructure",497,7.43,3693,3663,-30,13,
  {pe:38,fpe:33,pb:11,ps:14,evEbitda:25,divYield:0.7,roe:35,roa:18,beta:0.9,high52:510,low52:385},
  {revenue:[245,212,198,168],grossProfit:[171,146,135,115],operatingIncome:[109,89,83,70],ebitda:[129,105,98,82],netIncome:[88,72,73,61],ocf:[119,87,89,77],capex:[-45,-28,-24,-21],fcf:[74,59,65,56]},
  {revenue:[70,65,62,62,62,57,56,53],operatingIncome:[32,29,28,28,27,25,24,22],ebitda:[37,34,33,32,32,30,29,27],netIncome:[26,25,22,22,22,20,18,17],fcf:[20,21,17,20,19,17,16,15]}),
 mk("NVDA","NVIDIA Corp.","US","Technology","Semiconductors",158,24.6,3887,3857,-30,25,
  {pe:53,fpe:38,pb:48,ps:30,evEbitda:42,divYield:0.02,roe:119,roa:80,beta:1.6,high52:174,low52:86},
  {revenue:[130,61,27,27],grossProfit:[98,44,15,17],operatingIncome:[81,33,4,10],ebitda:[83,35,6,11],netIncome:[73,30,4,9],ocf:[64,28,5,9],capex:[-4,-1,-1,-1],fcf:[60,27,4,8]},
  {revenue:[39,35,30,26,22,18,13,7],operatingIncome:[24,22,18,17,14,11,7,3],ebitda:[25,23,19,18,15,12,8,4],netIncome:[22,19,17,15,12,9,6,2],fcf:[16,15,15,14,11,8,6,3]}),
 mk("META","Meta Platforms","US","Communication Services","Internet Content",710,2.53,1796,1826,-30,14,
  {pe:29,fpe:26,pb:9,ps:11,evEbitda:18,divYield:0.3,roe:36,roa:24,beta:1.2,high52:740,low52:442},
  {revenue:[164,135,116,118],grossProfit:[134,108,92,93],operatingIncome:[69,47,29,47],ebitda:[87,62,42,57],netIncome:[62,39,23,39],ocf:[91,71,50,57],capex:[-37,-28,-32,-19],fcf:[54,43,18,38]},
  {revenue:[48,41,39,36,40,34,32,29],operatingIncome:[23,17,15,14,16,13,11,7],ebitda:[28,22,20,18,21,18,15,11],netIncome:[21,16,13,12,14,12,8,5],fcf:[13,15,11,15,12,10,5,11]}),
 mk("RELIANCE","Reliance Industries","IN","Energy","Oil & Gas Refining",1490,1353,201600,317600,116000,10,
  {pe:25,fpe:21,pb:2.1,ps:2.0,evEbitda:11,divYield:0.4,roe:8.5,roa:3.8,beta:1.0,high52:1609,low52:1115,insiderPct:50.3,prevInsiderPct:50.6},
  {revenue:[1000000,974000,976000,792000],grossProfit:null,operatingIncome:[145000,138000,130000,110000],ebitda:[178000,166000,158000,128000],netIncome:[79000,73000,67000,60000],ocf:[160000,115000,110000,98000],capex:[-125000,-118000,-141000,-95000],fcf:[35000,-3000,-31000,3000]},
  {revenue:[267000,258000,250000,236000],operatingIncome:[40000,38000,36000,34000],ebitda:[48000,45000,44000,42000],netIncome:[21000,19000,18000,17000],fcf:[12000,8000,9000,6000]}),
 mk("TCS","Tata Consultancy","IN","Technology","IT Services",3450,362,124890,74890,-50000,9,
  {pe:27,fpe:25,pb:14,ps:6.0,evEbitda:18,divYield:1.4,roe:51,roa:38,beta:0.7,high52:4585,low52:3060},
  {revenue:[255000,240000,225000,191000],grossProfit:null,operatingIncome:[62000,57000,53000,46000],ebitda:[68000,63000,58000,50000],netIncome:[46000,45000,42000,38000],ocf:[48000,42000,40000,35000],capex:[-6000,-4000,-3000,-3000],fcf:[42000,38000,37000,32000]},
  {revenue:[64000,64000,62000,61000],operatingIncome:[16000,15500,15000,15000],ebitda:[17500,17000,16500,16000],netIncome:[12000,11900,11000,11000],fcf:[11000,10000,10500,10000]}),
 mk("HDFCBANK","HDFC Bank","IN","Financial Services","Banks—Regional",1980,765,151470,151470,0,14,
  {pe:21,fpe:18,pb:2.8,ps:4.6,evEbitda:null,divYield:1.0,roe:17,roa:1.9,beta:0.9,high52:2038,low52:1588},
  {revenue:[330000,205000,170000,146000],grossProfit:null,operatingIncome:[88000,55000,46000,41000],ebitda:[90000,57000,47000,42000],netIncome:[65000,46000,44000,38000],ocf:[70000,50000,45000,40000],capex:[-5000,-4000,-3000,-3000],fcf:[65000,46000,42000,37000]},
  {revenue:[85000,82000,80000,78000],operatingIncome:[23000,22000,21000,20000],ebitda:[23500,22500,21500,20500],netIncome:[17000,16500,16000,15500],fcf:[16500,16000,15500,15000]}),
 mk("INFY","Infosys","IN","Technology","IT Services",1560,415,64740,34740,-30000,9,
  {pe:25,fpe:23,pb:8,ps:4.0,evEbitda:15,divYield:2.3,roe:32,roa:23,beta:0.8,high52:2007,low52:1352},
  {revenue:[163000,153000,146000,121000],grossProfit:null,operatingIncome:[34000,32000,31000,27000],ebitda:[37000,35000,33000,29000],netIncome:[26000,25000,24000,22000],ocf:[31000,27000,25000,23000],capex:[-3000,-2000,-2000,-2000],fcf:[28000,25000,23000,21000]},
  {revenue:[41000,40000,39000,38000],operatingIncome:[8700,8500,8200,8000],ebitda:[9400,9200,8900,8700],netIncome:[6600,6500,6400,6300],fcf:[7000,6800,6500,6200]}),
];

/* ---------- formatting ---------- */
const curOf = m => m==="US" ? "$" : "₹";
const fmtB = (v,m) => v==null ? "—" : (m==="US" ? `$${v.toFixed(1)}B` : `₹${(v/1000).toFixed(1)}k cr`);
const fmtP = (v,m) => v==null ? "—" : curOf(m)+v.toLocaleString(undefined,{maximumFractionDigits:0});
const sign = v => v==null ? "—" : `${v>0?"+":""}${v.toFixed(1)}%`;
const xMult = v => v==null ? "—" : `${v.toFixed(1)}×`;
const pctStr = v => v==null ? "—" : `${v.toFixed(1)}%`;

/* ---------- SHARED THRESHOLDS (single source of truth) ----------
   Every band used by BOTH the flag engine and the pillar engine lives
   here, so the two can never drift apart and show a green flag next to
   a weak pillar (or vice versa) for the same underlying number. */
const THRESH = {
  fcfNi:   { strong: 1.1, ok: 0.9, weak: 0.7 },   // FCF / Net income
  debtEbitda: { safe: 1.5, watch: 3.0, danger: 4.0 },
  ebitdaMargin: { premium: 30, healthy: 15 },
  fcfYield: { rich: 5, thin: 2 },
  peg:     { cheap: 1.0, rich: 2.5 },
  mos:     { wide: 25, some: 10 },                 // DCF margin of safety %
  revDecel: { concern: -5, accel: 3 },
};

/* ---------- growth math ---------- */
const arr = v => Array.isArray(v) ? v : [];
const yoy = s => { const a=arr(s); return (a.length>1 && a[1]) ? (a[0]-a[1])/Math.abs(a[1])*100 : null; };
const qoq = yoy;
/* Same-quarter YoY (index 0 vs 4 in an 8-quarter series) — the seasonality-
   free quarterly read. Sequential QoQ stays available as secondary context. */
const qyoy = s => { const a=arr(s); return (a.length>4 && a[4]) ? (a[0]-a[4])/Math.abs(a[4])*100 : null; };
/* CAGR endpoint-to-endpoint with honest period counting: nulls inside the
   series no longer shrink the year count, and a negative year in the MIDDLE
   no longer erases the whole figure (the result is annotated instead).
   Returns {v, note} or null when an ENDPOINT is non-positive (a true CAGR
   genuinely doesn't exist in that case). */
const cagrX = s => {
  const a = arr(s);
  let first=-1, last=-1;
  for(let i=0;i<a.length;i++){ if(a[i]!=null){ if(first<0)first=i; last=i; } }
  if(first<0 || last===first) return null;
  const newest=a[first], oldest=a[last], yrs=last-first;
  if(newest==null||oldest==null||newest<=0||oldest<=0) return null;
  const v=(Math.pow(newest/oldest,1/yrs)-1)*100;
  const dipped=a.slice(first,last+1).some(x=>x!=null&&x<=0);
  return { v, note: dipped?"includes a negative year inside the window":null };
};
const cagr = s => { const c=cagrX(s); return c?c.v:null; };

/* ---------- DCF (two-stage) ----------
   Fade fix: growth is weighted by (y/years) so that in the FINAL explicit
   year growth equals the terminal rate exactly — the old (y-1)/years weights
   left year-N growth above terminal, a small persistent upward bias in every
   intrinsic value. Guard: terminal value requires discount > terminal + 1pt,
   otherwise the Gordon denominator explodes and the output is meaningless. */
function dcf(s,{discount,termGrowth,years}){
  const r=discount/100, tg=termGrowth/100, g0=s.g/100;
  if (r - tg < 0.01) return null; // refuse to fabricate an exploding terminal value
  const base = arr(s.annual.fcf)[0];
  if (base==null || base<=0) return null;
  let pv=0, fcf=base;
  for (let y=1;y<=years;y++){
    const w = y/years;                 // 1/N … 1 — reaches tg in the last year
    const gr = g0*(1-w) + tg*w;
    fcf *= (1+gr);
    pv += fcf/Math.pow(1+r,y);
  }
  pv += (fcf*(1+tg))/(r-tg) / Math.pow(1+r,years);
  return (pv - s.debt) / s.shares;
}

/* ---------- A1: growth source (analyst consensus > hardcoded default) ----
   Called by app.js once estimates.json loads. Replaces the pipeline's
   hardcoded g (8% for nearly every stock) with real consensus growth where
   coverage exists, clamped to a sane band, and records WHERE the number
   came from so the DCF panel can label it honestly. */
function applyEstimatesGrowth(stocks, estimatesMap){
  stocks.forEach(s=>{
    const est = estimatesMap && estimatesMap[s.t];
    // Prefer revenue growth (closest to what a two-stage FCF model wants),
    // then next-year EPS growth, then current-year EPS growth.
    const cand = est && (est.revenueGrowthEstimate ?? est.epsGrowthNextYear ?? est.epsGrowthCurrentYear);
    if(cand!=null && isFinite(cand)){
      s.g = Math.max(0, Math.min(30, cand));       // clamp: 0–30% starting growth
      s.gSource = `analyst consensus (${est.numAnalysts||"n/a"} analysts)`;
      s.gRaw = cand;
    } else if(!s.gSource){
      s.gSource = "default assumption — no analyst coverage loaded; treat the DCF as low-confidence";
    }
  });
}

/* ---------- normalize a stock record so nothing ever crashes ---------- */
function normalize(x){
  const na = v => Array.isArray(v) ? v : [];
  const normSeries = obj => ({
    periods: na(obj?.periods), revenue: na(obj?.revenue), ebitda: na(obj?.ebitda),
    netIncome: na(obj?.netIncome), fcf: na(obj?.fcf), ocf: na(obj?.ocf), capex: na(obj?.capex),
    operatingIncome: na(obj?.operatingIncome), grossProfit: na(obj?.grossProfit), margins: na(obj?.margins),
  });
  return { ...x, annual: normSeries(x.annual), quarterly: normSeries(x.quarterly) };
}

/* ============================================================
   SIGNAL ENGINE — 20 factor-combination checks, each with a
   plain read, why it matters, and how to read it (teaching).
   ============================================================ */
function analyze(raw, intrinsic){
  const s = normalize(raw);
  const A = s.annual, Q = s.quarterly;
  const at0 = v => (v.length && v[0]!=null) ? v[0] : null;

  const revG=yoy(A.revenue), niG=yoy(A.netIncome), fcfG=yoy(A.fcf), ebitdaG=yoy(A.ebitda);
  const revQ=qoq(Q.revenue), fcfQ=qoq(Q.fcf), niQ=qoq(Q.netIncome);
  /* A6 fix: same-quarter YoY (Q0 vs Q4) is the seasonality-free quarterly
     read and is used as the PRIMARY quarterly signal wherever available;
     sequential QoQ above is kept as secondary context only. */
  const revQyoy=qyoy(Q.revenue), fcfQyoy=qyoy(Q.fcf), niQyoy=qyoy(Q.netIncome);
  const m0=A.margins[0]||{}, m1=A.margins[1]||{};
  const nmNow=m0.net??null, nmPrev=m1.net??null;
  const omNow=m0.operating??null, omPrev=m1.operating??null;
  const emNow=m0.ebitda??null;
  const fcfmNow=m0.fcf??null;
  const marginTrend=(nmNow!=null&&nmPrev!=null)?nmNow-nmPrev:null;
  const opMarginTrend=(omNow!=null&&omPrev!=null)?omNow-omPrev:null;
  const f0=at0(A.fcf), ni0=at0(A.netIncome), ebitda0=at0(A.ebitda), rev0=at0(A.revenue), capex0=at0(A.capex);
  const fcfNi=(f0!=null&&ni0)?f0/ni0:null;
  const mos=intrinsic?(intrinsic-s.price)/s.price*100:null;
  const pricePos=(s.high52&&s.low52)?(s.price-s.low52)/(s.high52-s.low52)*100:null;
  const fcfYield=(f0!=null&&s.mcap)?f0/s.mcap*100:null;
  const earnYield=s.pe?100/s.pe:null;
  const ruleOf40=(revG!=null&&fcfmNow!=null)?revG+fcfmNow:null;
  const debtToEbitda=(ebitda0&&ebitda0>0)?s.debt/ebitda0:null;
  const revPrior = A.revenue.length>1 ? yoy(A.revenue.slice(1)) : null;
  const revDecel=(revG!=null&&revPrior!=null)?revG-revPrior:null;
  const peg=(s.pe&&niG&&niG>0)?s.pe/niG:null;
  const capexIntensity=(capex0!=null&&rev0)?Math.abs(capex0)/rev0*100:null;

  const up=(v,t=2)=>v!=null&&v>t, dn=(v,t=-2)=>v!=null&&v<t;
  const F=[];
  const add=(sev,cat,tag,txt,why,how)=>F.push({s:sev,cat,tag,txt,why,how});

  if(up(revG)&&dn(fcfG))add("warn","Growth","Cash divergence",
    "Revenue is rising while free cash flow is falling — growth is consuming cash rather than producing it.",
    "Revenue can be booked before cash arrives. When sales climb but cash drops, the gap usually hides in unpaid customer invoices, unsold stock, or heavy capex. A business can look profitable and still run out of money.",
    "Check the Cash bridge. If Operating CF is flat while revenue rises, working capital is the leak. If capex spiked instead, it may just be an investment phase.");
  if(revDecel!=null&&revDecel<-5&&up(revG))add("warn","Growth","Growth decelerating",
    `Still growing, but the rate slowed about ${Math.abs(revDecel).toFixed(0)} points versus the prior year.`,
    "Markets price the change in growth rate, not just growth itself. Deceleration is the most common trigger for a high-multiple stock falling, even while still growing.",
    "Compare each year's revenue step-up — is it shrinking? Pair with valuation: a slowing grower on a high P/E is riskier than the same slowdown on a cheap multiple.");
  if(up(revG,8)&&up(fcfG,8)&&(marginTrend==null||marginTrend>-0.5))add("good","Growth","Clean compounding",
    "Revenue and free cash flow are growing together with stable margins — the highest-quality growth profile.",
    "When cash flow grows as fast as sales, the business scales without losing efficiency, letting it reinvest or return capital from its own engine.",
    "Confirm the FCF line tracks revenue rather than flattening, across several years not just one.");
  if(up(revG)&&marginTrend!=null&&marginTrend<-1)add("warn","Margins","Margin compression",
    "Sales grew but net margin contracted — converting less of each rupee/dollar of revenue into profit.",
    "Shrinking margins during growth usually mean discounting to win share, or costs rising faster than pricing power can offset.",
    "Check whether operating margin (the core business) or only net margin (often one-off items) is the one falling.");
  if(opMarginTrend!=null&&opMarginTrend>1.5)add("good","Margins","Operating leverage",
    `Operating margin expanded about ${opMarginTrend.toFixed(1)} points — costs growing slower than revenue.`,
    "Once fixed costs are covered, extra revenue drops mostly to profit. Expanding margin while growing is proof the model gets more profitable at scale.",
    "Make sure margin expanded because revenue grew, not because costs were cut in a shrinking business.");
  if(emNow!=null&&emNow>30)add("good","Margins","Premium profitability",
    `EBITDA margin near ${emNow.toFixed(0)}% — keeps an unusually large share of revenue as cash profit.`,
    "High, durable margins are the fingerprint of a moat — brand, network, or switching costs that block price competition.",
    "Check durability across years on the margin ladder chart — steady or rising is a moat, choppy is cyclical.");
  /* Bands come from THRESH so the flag and the cash-quality pillar can never
     disagree: warn fires at the same line as the pillar's serious penalty
     (<0.7); good fires at the same line as the pillar's positive credit
     (>=0.9); the 0.7-0.9 band gets no flag — the pillar's "moderate gap"
     covers that gradation. */
  if(fcfNi!=null&&fcfNi<THRESH.fcfNi.weak)add("warn","Cash quality","Low cash conversion",
    `Only about ${(fcfNi*100).toFixed(0)}% of reported profit shows up as cash (FCF/NI ${fcfNi.toFixed(2)}).`,
    "Net income is an accounting opinion; free cash flow is a fact. A persistent gap is one of the most reliable predictors of future disappointment.",
    "A single low year can be a capex cycle. A multi-year pattern is the real warning sign — check the Cash bridge.");
  if(fcfNi!=null&&fcfNi>=THRESH.fcfNi.ok)add("good","Cash quality","High earnings quality",
    `Free cash flow meets or exceeds net income (FCF/NI ${fcfNi.toFixed(2)}) — profit fully backed by cash.`,
    "No gap to hide bad news in. The quiet signature of a high-quality business.",
    "Confirm it holds across multiple years, then combine with high ROE for the gold standard.");
  if(fcfYield!=null&&fcfYield>5)add("good","Cash quality","Strong owner yield",
    `Free-cash-flow yield around ${fcfYield.toFixed(1)}% — cash thrown off relative to price.`,
    "FCF yield is what you'd earn if the business paid out all its free cash to you. Compare to a bond yield — but this stream can grow.",
    "Compare to the 10-year government bond yield in that market. Well above it = cheap; below it = paying up for growth.");
  if(mos!=null&&mos>20&&up(fcfG))add("good","Valuation","Value + momentum",
    `Trades roughly ${mos.toFixed(0)}% below DCF value while cash flow still grows — cheap and improving at once.`,
    "Cheap relative to intrinsic value gives a margin of safety; growing cash flow means that value is rising while you wait.",
    "Push the discount rate to 12-13% and terminal growth to 2%. If it still looks cheap, the margin of safety is real.");
  if(mos!=null&&mos<-25)add("warn","Valuation","Priced for perfection",
    `Market price sits about ${Math.abs(mos).toFixed(0)}% above intrinsic value — years of flawless execution already priced in.`,
    "A rich valuation removes your safety net — even a small stumble can trigger a sharp re-rating when expectations are this high.",
    "Raise your DCF growth assumption until intrinsic = price. If that rate looks heroic versus history, the risk is asymmetric.");
  if(peg!=null&&peg<1&&niG>0)add("good","Valuation","Growth at reasonable price",
    `P/E low relative to earnings growth (PEG ≈ ${peg.toFixed(2)}) — not overpaying for the growth you're getting.`,
    "PEG normalises P/E for growth. Below 1.0 traditionally signals growth bought without a premium.",
    "Use a conservative growth estimate, not one hot year. Avoid PEG entirely on cyclicals or financials.");
  if(s.evEbitda!=null&&s.evEbitda<10&&emNow!=null&&emNow>15)add("good","Valuation","Cheap on cash earnings",
    `EV/EBITDA around ${s.evEbitda.toFixed(1)}× on a healthy ${emNow.toFixed(0)}% margin — inexpensive vs operating cash profit.`,
    "EV/EBITDA values the whole business including debt, the multiple acquirers actually use. Under ~10× on solid margins is historically cheap.",
    "Pair with FCF yield — EV/EBITDA ignores capex, so a capital-hungry business can look falsely cheap on this metric alone.");
  if(s.debt<0)add("good","Balance sheet","Net cash fortress",
    "Holds more cash than debt — can fund buybacks, acquisitions, or survive a downturn without raising money.",
    "A net-cash company controls its own destiny and can act when leveraged rivals are forced to retrench.",
    "Great unless lazy — check whether cash is being returned or reinvested at high ROE, not just sitting idle.");
  if(debtToEbitda!=null&&debtToEbitda>3)add("warn","Balance sheet","Elevated leverage",
    `Net debt is roughly ${debtToEbitda.toFixed(1)}× EBITDA.`,
    "Above ~3× EBITDA, little room for error — a downturn or rate rise can force emergency action, and equity holders are wiped first.",
    "Judge against business stability. Watch the trend — rising leverage into a slowdown is the dangerous combination.");
  else if(debtToEbitda!=null&&debtToEbitda>0&&debtToEbitda<1.5)add("good","Balance sheet","Conservative leverage",
    `Net debt only about ${debtToEbitda.toFixed(1)}× EBITDA — comfortably serviceable.`,
    "Modest, cheap debt that disciplines management while retaining flexibility to invest or weather a downturn.",
    "Pair with high ROE for the ideal combination — returns earned from the business, not borrowed.");
  if(s.roe!=null&&s.roe>20&&(fcfNi==null||fcfNi>0.8))add("good","Returns","High returns on capital",
    `ROE around ${s.roe.toFixed(0)}% with sound cash conversion — compounds shareholder capital efficiently.`,
    "Sustained high ROE usually signals a competitive advantage — a business that can reinvest at high rates.",
    "Check ROE isn't manufactured by debt — compare with ROA. High on both is the real thing.");
  if(s.roe!=null&&s.roa!=null&&s.roe>15&&s.roa<3&&s.debt>0)add("warn","Returns","Returns are leverage-driven",
    `ROE looks strong (${s.roe.toFixed(0)}%) but ROA is thin (${s.roa.toFixed(1)}%) — mostly borrowing, not operations.`,
    "The gap between ROE and ROA is leverage. It amplifies a mediocre underlying return and reverses violently in bad times.",
    "Normal for banks (ROA ~1%+ with mid-teens ROE is sound); a red flag elsewhere.");
  if(revQyoy!=null&&revQyoy<-3)add("warn","Momentum","Quarterly revenue declining YoY",
    `Latest quarter revenue fell about ${Math.abs(revQyoy).toFixed(0)}% versus the SAME quarter last year${revQ!=null?` (sequentially: ${sign(revQ)})`:""}.`,
    "Same-quarter comparison strips out seasonality — this is a genuine decline, not a festive-quarter or holiday-quarter calendar effect.",
    "Check whether the annual trend confirms it. One down quarter can be timing; a down quarter plus decelerating annual growth is the real turn.");
  else if(revQyoy==null&&revQ!=null&&revQ<-3)add("warn","Momentum","Sequential slowdown (seasonality not stripped)",
    `Latest quarter revenue fell about ${Math.abs(revQ).toFixed(0)}% versus the prior quarter — but only 4 quarters of data are loaded, so this could be pure seasonality.`,
    "QoQ is the earliest read on a turning business, but also the noisiest — many businesses are seasonal.",
    "Treat with caution until the same quarter last year is available for comparison. A drop confirmed both QoQ and YoY is the real signal.");
  const _rq = revQyoy ?? revQ, _nq = niQyoy ?? niQ, _qBasis = revQyoy!=null ? "vs the same quarter last year" : "sequentially (seasonality not stripped)";
  if(_rq!=null&&_nq!=null&&_rq>2&&_nq>_rq*1.5)add("good","Momentum","Profit outpacing sales",
    `Latest quarter's profit grew faster than revenue ${_qBasis} — early evidence of operating leverage or improving mix.`,
    "Caught early in quarterly data, this often precedes upward earnings revisions, which is what tends to move stocks.",
    "Confirm it's operational and not a one-off tax benefit or asset sale.");

  // ---------- OWNERSHIP (promoter holding / insider ownership) ----------
  const insiderTrend = (s.insiderPct!=null && s.prevInsiderPct!=null) ? s.insiderPct - s.prevInsiderPct : null;
  if(insiderTrend!=null && insiderTrend>1)add("good","Ownership","Promoters/insiders increasing stake",
    `${s.mkt==="IN"?"Promoter":"Insider"} holding rose from ${s.prevInsiderPct.toFixed(1)}% to ${s.insiderPct.toFixed(1)}% — the people who know the business best are buying more of it.`,
    "Insiders have information no outsider has. When they voluntarily increase their own stake — using their own money — it's one of the strongest votes of confidence available, far more reliable than anything management says in a press release.",
    "Check whether the increase came from open-market buying (bullish) or a preferential allotment/ESOP exercise (more neutral). Pair with rising FCF for the strongest combination.");
  if(insiderTrend!=null && insiderTrend<-1)add("warn","Ownership",`${s.mkt==="IN"?"Promoter":"Insider"} stake declining`,
    `${s.mkt==="IN"?"Promoter":"Insider"} holding fell from ${s.prevInsiderPct.toFixed(1)}% to ${s.insiderPct.toFixed(1)}%.`,
    "Insiders selling isn't always bearish — it can be diversification, pledging shares for a loan, or estate planning. But a sustained decline, especially alongside weak fundamentals, is worth taking seriously since it removes the strongest aligned shareholder.",
    "Look for the reason if disclosed (pledge, OFS, block deal). One quarter's dip is noise; a multi-quarter decline paired with other warning flags is the real signal.");
  if(s.insiderPct!=null && s.insiderPct>50 && insiderTrend==null)add("good","Ownership","High insider alignment",
    `${s.mkt==="IN"?"Promoters hold":"Insiders hold"} ${s.insiderPct.toFixed(0)}% of the company — strong skin in the game.`,
    "High insider ownership aligns management's incentives with shareholders' — they win and lose alongside you, which tends to discourage empire-building and excessive risk-taking with your capital.",
    "Very high concentration (>75%) can cut the other way — thin free float, harder for outside shareholders to influence governance. Moderate-to-high (40-70%) is usually the sweet spot.");
  if(s.insiderPct!=null && s.insiderPct<5)add("warn","Ownership","Low insider ownership",
    `${s.mkt==="IN"?"Promoters hold":"Insiders hold"} only ${s.insiderPct.toFixed(1)}% of the company.`,
    "When management owns very little of the business, their financial incentives are weighted toward salary and bonus rather than the stock price — the classic agency problem between owners and managers.",
    "Less concerning for mega-cap, widely-held companies with strong governance; more concerning for smaller or founder-led businesses where you'd expect higher alignment.");

  const goods=F.filter(f=>f.s==="good").length, warns=F.filter(f=>f.s==="warn").length;
  const verdict = goods-warns>=2 ? {l:"Constructive",c:"#1a8a63"} : warns-goods>=2 ? {l:"Caution",c:"#c0392b"} : {l:"Mixed signals",c:"#b8860b"};

  const result = { ...s, intrinsic, revG,niG,fcfG,ebitdaG,revQ,fcfQ,niQ,revQyoy,fcfQyoy,niQyoy,
    marginTrend,opMarginTrend,fcfNi,mos,pricePos,
    nmNow,omNow,emNow, fcfYield,earnYield,ruleOf40,debtToEbitda,revDecel,peg,capexIntensity,insiderTrend,
    revCagr:cagr(A.revenue), fcfCagr:cagr(A.fcf), niCagr:cagr(A.netIncome),
    revCagrX:cagrX(A.revenue), fcfCagrX:cagrX(A.fcf),
    flags:F, verdict };
  /* B1 fix: the old healthScore (50 + goods×9 − warns×9 + adjustments)
     double-counted correlated flags and could contradict the Decision
     Engine's quadrant on the same screen. There is now ONE quality number:
     the same weighted pillar composite decisionSynthesis() uses. The flags
     remain as the explanation layer; they no longer form a second score. */
  const P = pillarScores(result);
  result.pillars = P;
  result.healthScore = Math.round(
    P.growth.score*0.20 + P.profitability.score*0.20 + P.cashQuality.score*0.25 +
    P.balanceSheet.score*0.15 + P.returns.score*0.20 );
  return result;
}

/* ============================================================
   MACRO SENSITIVITY — how each sector/stock is exposed to the
   handful of macro variables that actually move 60-90 day returns.
   Applied automatically once macro.json loads; no manual toggling.
   ============================================================ */
const MACRO_SENSITIVITY = {
  // A2 fix: keys are yfinance's EXACT sector strings — the previous
  // shorthand keys ("Health", "Indus", "Comm", "Consumer") matched nothing
  // in the real data, silently disabling the macro layer for ~7 of 11
  // sectors. Each value: -2 (strong headwind when driver rises) .. +2
  // (strong tailwind when driver rises).
  "Technology":             {rates:-2, crude:0,  usdStrength:-1, ratesNote:"long-duration cash flows, hit hardest by rising discount rates"},
  "Financial Services":     {rates:1,  crude:0,  usdStrength:0,  ratesNote:"higher rates can widen lending margins, but too-fast rises hurt credit"},
  "Energy":                 {rates:0,  crude:2,  usdStrength:-1, ratesNote:"earnings track crude directly"},
  "Consumer Cyclical":      {rates:-1, crude:-1, usdStrength:0,  ratesNote:"discretionary spending softens as rates rise; fuel/input costs bite margins"},
  "Consumer Defensive":     {rates:0,  crude:-1, usdStrength:0,  ratesNote:"staples demand is rate-insensitive; input costs (packaging, freight, agri) track crude"},
  "Healthcare":             {rates:0,  crude:0,  usdStrength:1,  ratesNote:"defensive, largely rate-insensitive; exporters (Indian pharma) gain from weak home currency"},
  "Communication Services": {rates:-1, crude:0,  usdStrength:0,  ratesNote:"capital-intensive networks and long-duration ad/streaming growth, moderately rate-sensitive"},
  "Industrials":            {rates:-1, crude:-1, usdStrength:-1, ratesNote:"capex-driven, sensitive to borrowing costs and input costs"},
  "Basic Materials":        {rates:0,  crude:1,  usdStrength:-1, ratesNote:"commodity producers — output prices loosely track the energy/commodity complex"},
  "Utilities":              {rates:-2, crude:-1, usdStrength:0,  ratesNote:"bond-proxy sector — heavy debt loads and regulated returns make rising rates the dominant headwind"},
  "Real Estate":            {rates:-2, crude:0,  usdStrength:0,  ratesNote:"financing-cost driven and valued on cap rates — the most directly rate-sensitive sector"},
};
function macroSensitivityFor(sec){ return MACRO_SENSITIVITY[sec] || {rates:0,crude:0,usdStrength:0,ratesNote:"no strong macro sensitivity profile on file for this sector"}; }

/* Given live macro.json series + a stock's sector, produce a plain read */
function macroRead(stock, macro){
  if(!macro || !macro.series) return null;
  const sens = macroSensitivityFor(stock.sec);
  const us10y = macro.series.us10y;
  const crude = macro.series.crude;
  const usdinr = macro.series.usdinr;
  const dxy = macro.series.dxy;
  const vix = macro.series.vix;

  const notes = [];
  let score = 0; // net macro tailwind(+)/headwind(-) score

  if(us10y && us10y.chg90d!=null){
    const ratesRising = us10y.chg90d > 3;
    const ratesFalling = us10y.chg90d < -3;
    if(ratesRising && sens.rates!==0){
      score += sens.rates<0 ? -1 : 1;
      notes.push({dir: sens.rates<0?"headwind":"tailwind",
        txt:`10-year yield up ${us10y.chg90d}% over 90 days — ${sens.ratesNote}.`});
    } else if(ratesFalling && sens.rates!==0){
      score += sens.rates<0 ? 1 : -1;
      notes.push({dir: sens.rates<0?"tailwind":"headwind",
        txt:`10-year yield down ${Math.abs(us10y.chg90d)}% over 90 days — eases the pressure that normally hits ${stock.sec.toLowerCase()} names.`});
    }
  }
  if(crude && crude.chg90d!=null && sens.crude!==0){
    const crudeUp = crude.chg90d > 5, crudeDown = crude.chg90d < -5;
    if(crudeUp){ score += sens.crude>0?1:-1;
      notes.push({dir:sens.crude>0?"tailwind":"headwind", txt:`Crude up ${crude.chg90d}% over 90 days.`}); }
    else if(crudeDown){ score += sens.crude>0?-1:1;
      notes.push({dir:sens.crude>0?"headwind":"tailwind", txt:`Crude down ${Math.abs(crude.chg90d)}% over 90 days — input-cost relief.`}); }
  }
  if(usdinr && usdinr.chg90d!=null && stock.mkt==="IN"){
    const inrWeaker = usdinr.chg90d > 1; // INR depreciated vs USD
    if(inrWeaker && sens.usdStrength!==0){
      score += sens.usdStrength>0?1:-1;
      notes.push({dir:sens.usdStrength>0?"tailwind":"headwind",
        txt:`Rupee weakened ${usdinr.chg90d}% vs USD over 90 days — ${sens.usdStrength>0?"margin tailwind for exporters":"cost headwind for importers"}.`});
    }
  }
  if(vix && vix.current!=null){
    if(vix.current > 25) notes.push({dir:"caution", txt:`VIX at ${vix.current} — elevated market fear; even good stocks get pulled down in broad risk-off moves.`});
    else if(vix.current < 15) notes.push({dir:"neutral", txt:`VIX at ${vix.current} — calm market, stock-specific factors likely to dominate over macro noise.`});
  }

  const verdict = score>=2?{l:"Macro tailwind",c:"#1a8a63"}:score<=-2?{l:"Macro headwind",c:"#c0392b"}:{l:"Macro neutral",c:"#b8860b"};
  return {score, notes, verdict, asOf: macro.asOf};
}

/* ============================================================
   VALUATION IN CONTEXT — is this multiple actually cheap/expensive,
   relative to the stock's own history and its sector peers (not
   just an absolute number with no reference point).
   ============================================================ */
function valuationContext(stock, allStocks, macro){
  const peers = allStocks.filter(s=>s.sec===stock.sec && s.t!==stock.t && s.pe!=null && s.pe>0 && s.pe<200);
  const peerPEs = peers.map(s=>s.pe).sort((a,b)=>a-b);
  const sectorMedianPE = peerPEs.length ? peerPEs[Math.floor(peerPEs.length/2)] : null;
  const peVsSector = (stock.pe!=null && sectorMedianPE) ? (stock.pe/sectorMedianPE-1)*100 : null;

  // A4 fix: the risk-free comparator must match the stock's market. Using
  // the US 10-year (~4%) for Indian stocks made every NIFTY name look ~3pts
  // cheaper on the FCF-yield spread than it really is against the Indian
  // 10-year (~7%). If in10y isn't loaded, return null honestly rather than
  // benchmarking against the wrong country's bond.
  const riskFreeRate = stock.mkt==="IN"
    ? (macro?.series?.in10y?.current ?? null)
    : (macro?.series?.us10y?.current ?? null);
  const riskFreeLabel = stock.mkt==="IN" ? "India 10Y G-Sec" : "US 10Y Treasury";
  const fcfYieldSpread = (stock.fcfYield!=null && riskFreeRate!=null) ? stock.fcfYield - riskFreeRate : null;

  const pricePos = stock.pricePos; // already 0-100 within 52wk range

  return { sectorMedianPE, peVsSector, riskFreeRate, riskFreeLabel, fcfYieldSpread, pricePos, peerCount: peers.length };
}

/* ============================================================
   EARNINGS TRACK RECORD — reads reactions.json (price behavior
   around past filing dates) computed independently of any
   sentiment score, so you can compare your own sentiment read
   against what the stock actually did, without hindsight bias
   creeping into the sentiment assignment itself.
   ============================================================ */
function computeExcessReturns(tickerReactions, allReactions){
  // Build sector benchmark: equal-weighted average forward return of
  // OTHER tickers in the same sector, for each date bucket, using
  // whatever peer data exists in allReactions (no extra fetching).
  if(!tickerReactions || !tickerReactions.returns) return [];
  const sector = tickerReactions.sector;
  const peers = allReactions.filter(r=>r.sector===sector && r.ticker!==tickerReactions.ticker);

  return tickerReactions.returns.map(r=>{
    // Sector benchmark = avg forward60d/90d of peers' closest-dated filing
    const peerVals60 = peers.map(p=>{
      const closest = (p.returns||[]).find(x=>x.forward60d!=null);
      return closest ? closest.forward60d : null;
    }).filter(v=>v!=null);
    const peerVals90 = peers.map(p=>{
      const closest = (p.returns||[]).find(x=>x.forward90d!=null);
      return closest ? closest.forward90d : null;
    }).filter(v=>v!=null);
    const bench60 = peerVals60.length ? peerVals60.reduce((a,b)=>a+b,0)/peerVals60.length : null;
    const bench90 = peerVals90.length ? peerVals90.reduce((a,b)=>a+b,0)/peerVals90.length : null;
    return {
      ...r,
      excess60d: (r.forward60d!=null && bench60!=null) ? +(r.forward60d-bench60).toFixed(2) : null,
      excess90d: (r.forward90d!=null && bench90!=null) ? +(r.forward90d-bench90).toFixed(2) : null,
      sectorBench60: bench60!=null ? +bench60.toFixed(2) : null,
    };
  });
}


function takeaway(s){
  const bits=[];
  if(s.mos!=null) bits.push(s.mos>15?`trading ${s.mos.toFixed(0)}% below estimated value`:
    s.mos<-15?`trading ${Math.abs(s.mos).toFixed(0)}% above estimated value`:"trading near estimated value");
  if(s.revG!=null&&s.fcfG!=null){
    if(s.revG>0&&s.fcfG>0) bits.push("with revenue and cash flow both growing");
    else if(s.revG>0&&s.fcfG<0) bits.push("with revenue up but cash flow falling");
    else if(s.revG<0) bits.push("with revenue declining");
  }
  const lead = bits.length ? bits.join(", ") : "limited recent trend data";
  const tone = s.verdict.l==="Constructive" ? "a constructive setup" :
               s.verdict.l==="Caution" ? "several caution flags" : "a mixed picture";
  return `${s.n} is ${lead} — ${tone}.`;
}

/* ============================================================
   DECISION ENGINE — the analytical pyramid.
   Level 2: 8 pillar scores (0-100) each with an evidence chain.
   Level 3: 8 cross-linkages, each a derived verdict from two pillars.
   Level 4: synthesis into a Quality × Price quadrant with explicit
            reasoning and a confidence level.
   Level 5: thesis monitors — what would change the verdict.
   ============================================================ */

function _mkPillar(name, base, evidence){
  let score = base;
  evidence.forEach(e=>{ score += e.pts; });
  score = Math.round(Math.max(0, Math.min(100, score)));
  const verdict = score>=65?"Strong":score>=45?"Adequate":"Weak";
  const color = score>=65?"#1a8a63":score>=45?"#b8860b":"#c0392b";
  return {name, score, verdict, color, evidence};
}
const _ev = (txt, pts)=>({txt, pts});

function pillarScores(s){
  const P = {};
  { const e=[];
    if(s.revG!=null){ if(s.revG>15)e.push(_ev(`Revenue growing ${s.revG.toFixed(0)}% YoY`,15)); else if(s.revG>5)e.push(_ev(`Revenue growing ${s.revG.toFixed(0)}% YoY`,8)); else if(s.revG>0)e.push(_ev(`Revenue up modestly (${s.revG.toFixed(1)}%)`,2)); else e.push(_ev(`Revenue declining (${s.revG.toFixed(1)}%)`,-15)); }
    if(s.revCagr!=null){ if(s.revCagr>12)e.push(_ev(`3yr revenue CAGR ${s.revCagr.toFixed(0)}% — sustained, not one-off`,8)); else if(s.revCagr<0)e.push(_ev(`3yr revenue CAGR negative — multi-year shrinkage`,-10)); }
    if(s.revDecel!=null && s.revDecel<-5)e.push(_ev(`Growth decelerating ${Math.abs(s.revDecel).toFixed(0)}pts vs prior year`,-10));
    if(s.revDecel!=null && s.revDecel>3)e.push(_ev(`Growth accelerating vs prior year`,8));
    if(s.fcfG!=null && s.fcfG>10)e.push(_ev(`FCF growing ${s.fcfG.toFixed(0)}% alongside revenue`,7));
    P.growth = _mkPillar("Growth", 50, e); }
  { const e=[];
    if(s.emNow!=null){ if(s.emNow>30)e.push(_ev(`EBITDA margin ${s.emNow.toFixed(0)}% — premium profitability`,12)); else if(s.emNow>15)e.push(_ev(`EBITDA margin ${s.emNow.toFixed(0)}% — healthy`,5)); else e.push(_ev(`EBITDA margin ${s.emNow.toFixed(0)}% — thin`,-8)); }
    if(s.opMarginTrend!=null){ if(s.opMarginTrend>1.5)e.push(_ev(`Operating margin expanding ${s.opMarginTrend.toFixed(1)}pts — operating leverage`,12)); else if(s.opMarginTrend<-1.5)e.push(_ev(`Operating margin compressing ${Math.abs(s.opMarginTrend).toFixed(1)}pts`,-12)); }
    if(s.marginTrend!=null && s.marginTrend<-1 && s.revG!=null && s.revG>0)e.push(_ev(`Net margin falling while revenue grows — buying growth`,-8));
    P.profitability = _mkPillar("Profitability", 50, e); }
  { const e=[];
    if(s.fcfNi!=null){ if(s.fcfNi>=THRESH.fcfNi.strong)e.push(_ev(`FCF exceeds net income (${s.fcfNi.toFixed(2)}×) — profit fully cash-backed`,18)); else if(s.fcfNi>=THRESH.fcfNi.ok)e.push(_ev(`FCF ≈ net income (${s.fcfNi.toFixed(2)}×) — sound conversion`,10)); else if(s.fcfNi>=THRESH.fcfNi.weak)e.push(_ev(`FCF only ${(s.fcfNi*100).toFixed(0)}% of profit — moderate gap`,-8)); else e.push(_ev(`FCF just ${(s.fcfNi*100).toFixed(0)}% of reported profit — earnings quality concern`,-18)); }
    if(s.fcfYield!=null && s.fcfYield>THRESH.fcfYield.rich)e.push(_ev(`FCF yield ${s.fcfYield.toFixed(1)}% — substantial cash return`,8));
    if(s.capexIntensity!=null && s.capexIntensity>15)e.push(_ev(`Capex is ${s.capexIntensity.toFixed(0)}% of revenue — capital-hungry model`,-6));
    if(s.revG!=null&&s.revG>8 && s.fcfG!=null&&s.fcfG<0)e.push(_ev(`Revenue up but FCF down — growth consuming cash`,-12));
    P.cashQuality = _mkPillar("Cash quality", 50, e); }
  { const e=[];
    if(s.debt<0)e.push(_ev(`Net cash position — no financial fragility`,18));
    else if(s.debtToEbitda!=null){ if(s.debtToEbitda<1.5)e.push(_ev(`Net debt only ${s.debtToEbitda.toFixed(1)}× EBITDA — conservative`,10)); else if(s.debtToEbitda<3)e.push(_ev(`Net debt ${s.debtToEbitda.toFixed(1)}× EBITDA — manageable`,0)); else if(s.debtToEbitda<4)e.push(_ev(`Net debt ${s.debtToEbitda.toFixed(1)}× EBITDA — elevated`,-12)); else e.push(_ev(`Net debt ${s.debtToEbitda.toFixed(1)}× EBITDA — high risk`,-20)); }
    if(s.debtToEbitda!=null&&s.debtToEbitda>3 && s.fcfG!=null&&s.fcfG<0)e.push(_ev(`High leverage while cash flow shrinks — compounding fragility`,-10));
    P.balanceSheet = _mkPillar("Balance sheet", 50, e); }
  { const e=[];
    const isFin = s.sec==="Financial Services"||s.sec==="Fin";
    if(s.roe!=null){ if(s.roe>25)e.push(_ev(`ROE ${s.roe.toFixed(0)}% — exceptional returns on equity`,15)); else if(s.roe>15)e.push(_ev(`ROE ${s.roe.toFixed(0)}% — strong`,8)); else if(s.roe<8)e.push(_ev(`ROE ${s.roe.toFixed(0)}% — below typical cost of capital`,-12)); }
    if(!isFin && s.roe!=null&&s.roe>15 && s.roa!=null&&s.roa<3 && s.debt>0)e.push(_ev(`ROE/ROA gap — returns are leverage-driven, not operational`,-12));
    if(s.roa!=null && s.roa>10 && !isFin)e.push(_ev(`ROA ${s.roa.toFixed(0)}% — assets genuinely productive`,8));
    P.returns = _mkPillar("Returns on capital", 50, e); }
  { const e=[];
    if(s.mos!=null){ if(s.mos>25)e.push(_ev(`Trading ${s.mos.toFixed(0)}% below DCF value — wide margin of safety`,15)); else if(s.mos>10)e.push(_ev(`Trading ${s.mos.toFixed(0)}% below DCF value`,8)); else if(s.mos<-25)e.push(_ev(`Trading ${Math.abs(s.mos).toFixed(0)}% above DCF value — priced for perfection`,-15)); else if(s.mos<-10)e.push(_ev(`Trading ${Math.abs(s.mos).toFixed(0)}% above DCF value`,-8)); }
    if(s.peg!=null){ if(s.peg<1)e.push(_ev(`PEG ${s.peg.toFixed(2)} — not overpaying for growth`,10)); else if(s.peg>2.5)e.push(_ev(`PEG ${s.peg.toFixed(2)} — paying richly for growth`,-8)); }
    if(s.fcfYield!=null){ if(s.fcfYield>5)e.push(_ev(`FCF yield ${s.fcfYield.toFixed(1)}% — cash return competitive with bonds`,8)); else if(s.fcfYield<2)e.push(_ev(`FCF yield ${s.fcfYield.toFixed(1)}% — thin cash return at this price`,-8)); }
    P.valuation = _mkPillar("Valuation", 50, e); }
  { const e=[];
    if(s.insiderTrend!=null){ if(s.insiderTrend>1)e.push(_ev(`Insider/promoter stake rising ${s.insiderTrend.toFixed(1)}pts — conviction with their own money`,18)); else if(s.insiderTrend<-1)e.push(_ev(`Insider/promoter stake falling ${Math.abs(s.insiderTrend).toFixed(1)}pts`,-12)); }
    if(s.insiderPct!=null){ if(s.insiderPct>40&&s.insiderPct<=75)e.push(_ev(`${s.insiderPct.toFixed(0)}% insider held — strong alignment`,8)); else if(s.insiderPct<5)e.push(_ev(`Only ${s.insiderPct.toFixed(1)}% insider held — weak alignment`,-5)); }
    if(!e.length)e.push(_ev(`No ownership trend data yet (builds after two data refreshes)`,0));
    P.ownership = _mkPillar("Ownership", 50, e); }
  { const e=[];
    if(s.pricePos!=null){ if(s.pricePos>75)e.push(_ev(`Near 52wk high (${s.pricePos.toFixed(0)}%) — market already recognizes the story`,3)); else if(s.pricePos<25)e.push(_ev(`Near 52wk low (${s.pricePos.toFixed(0)}%) — market pessimism priced in`,3)); }
    if(s.pricePos!=null&&s.pricePos<25 && s.revG!=null&&s.revG>0 && s.fcfNi!=null&&s.fcfNi>=0.9)e.push(_ev(`Price weak but fundamentals sound — price/fundamentals divergence`,10));
    if(s.pricePos!=null&&s.pricePos>85 && s.revDecel!=null&&s.revDecel<0)e.push(_ev(`Price at highs while growth decelerates — momentum outrunning fundamentals`,-10));
    { const rq=s.revQyoy??s.revQ, nq=s.niQyoy??s.niQ;
      if(rq!=null&&nq!=null&&rq>2&&nq>rq*1.5)e.push(_ev(`Latest quarter profit outpacing sales ${s.revQyoy!=null?"(YoY, seasonality-free)":"(sequential — seasonality caveat)"} — early positive inflection`,8)); }
    P.momentum = _mkPillar("Price vs Fundamentals", 50, e); }
  return P;
}

function crossLinkages(s, P){
  const L=[];
  const add=(name, question, a, b, verdict, color, insight, action)=>
    L.push({name, question, a, b, verdict, color, insight, action});

  { const g=P.growth.score, c=P.cashQuality.score;
    if(g>=60&&c>=60)add("Growth reality check","Is the reported growth real?","Growth","Cash quality","Real growth","#1a8a63","Revenue growth is backed by matching cash generation — the growth is genuine, not an accounting artifact.","This combination compounds. The main question shifts to price, not quality.");
    else if(g>=60&&c<45)add("Growth reality check","Is the reported growth real?","Growth","Cash quality","Growth mirage risk","#c0392b","Growth looks strong on paper but cash isn't following — receivables, inventory, or capex are absorbing it.","Check the Revenue-vs-FCF chart. If the gap persists 3+ quarters, treat reported growth with skepticism.");
    else if(g<45&&c>=60)add("Growth reality check","Is the reported growth real?","Growth","Cash quality","Cash-rich but stalled","#b8860b","Converts profit to cash superbly, but the top line isn't growing. A cash cow, not a compounder.","Value it on FCF yield like a bond, not growth multiples. Check what management does with the cash.");
    else add("Growth reality check","Is the reported growth real?","Growth","Cash quality","Both weak","#c0392b","Neither growth nor cash conversion is working — the core engine is struggling.","Requires a specific turnaround catalyst to be interesting. Absent one, look elsewhere."); }

  { const g=P.growth.score, v=P.valuation.score;
    if(g>=60&&v>=60)add("Price of growth","Are you paying fairly for the growth?","Growth","Valuation","GARP setup","#1a8a63","Genuine growth available at a reasonable or discounted price — the rare overlap markets usually close quickly.","Ask what the market is worried about that the numbers don't show. If nothing structural, this is the priority setup.");
    else if(g>=60&&v<45)add("Price of growth","Are you paying fairly for the growth?","Growth","Valuation","Growth fully priced","#b8860b","Real growth, but the market has already paid itself for years of it — upside needs beating high expectations.","Wait-for-price candidate. Star it; act on a broad selloff that drags it down indiscriminately.");
    else if(g<45&&v>=60)add("Price of growth","Are you paying fairly for the growth?","Growth","Valuation","Cheap for a reason?","#b8860b","Statistically cheap, but the growth engine is weak — the discount may be deserved.","Distinguish cyclical trough (recoverable) from structural decline (value trap).");
    else add("Price of growth","Are you paying fairly for the growth?","Growth","Valuation","Expensive stagnation","#c0392b","Paying a premium for a business that isn't growing — the worst quadrant of this pairing.","Hard to justify without a very specific catalyst thesis."); }

  { const p=P.profitability.score, g=P.growth.score;
    if(p>=60&&g>=60)add("Scale economics","Does growing make it more profitable?","Profitability","Growth","Operating leverage engine","#1a8a63","Margins expanding while revenue grows — each new unit of revenue is more profitable than the last.","The most powerful compounding pattern. Check how much runway remains before margins normalize.");
    else if(p<45&&g>=60)add("Scale economics","Does growing make it more profitable?","Profitability","Growth","Buying growth","#b8860b","Revenue is growing but margins are being sacrificed to get it — discounting or cost absorption.","Check gross margin: stable gross + falling operating margin = investment phase; falling gross = pricing power erosion.");
    else if(p>=60&&g<45)add("Scale economics","Does growing make it more profitable?","Profitability","Growth","Profitable but static","#b8860b","Strong margins with little growth — a well-run business in a mature market.","Fine as a stability holding at the right price. Beware paying growth multiples for it.");
    else add("Scale economics","Does growing make it more profitable?","Profitability","Growth","Struggling on both","#c0392b","Neither growing nor particularly profitable.","Needs a fundamental business change, not just a cheap price, to be interesting."); }

  { const b=P.balanceSheet.score, g=P.growth.score;
    if(b>=60&&g>=60)add("Growth funding","Who is funding the growth?","Balance sheet","Growth","Self-funded growth","#1a8a63","Growing from its own cash generation without leaning on debt — immune to credit conditions.","Structurally the safest growth. This combination deserves a durability premium.");
    else if(b<45&&g>=60)add("Growth funding","Who is funding the growth?","Balance sheet","Growth","Borrowed growth","#c0392b","The growth is running on leverage — works while conditions are good, punishing when rates rise or demand dips.","Check the Macro panel for rate direction — this combination is most vulnerable to a tightening cycle.");
    else if(b>=60&&g<45)add("Growth funding","Who is funding the growth?","Balance sheet","Growth","Fortress without ambition","#b8860b","Rock-solid balance sheet but the capital isn't producing growth — possibly under-deployed.","Watch capital allocation: buybacks/dividends at fair prices are fine; idle cash is value slowly leaking.");
    else add("Growth funding","Who is funding the growth?","Balance sheet","Growth","Weak and constrained","#c0392b","Leveraged and not growing — the debt limits every strategic option.","The balance sheet has to be repaired before the equity story can work."); }

  { const r=P.returns.score, b=P.balanceSheet.score;
    const isFin = s.sec==="Financial Services"||s.sec==="Fin";
    if(isFin)add("Return authenticity","Are the returns real or leverage?","Returns","Balance sheet","Financial-sector norm","#b8860b","Banks and financials run on leverage by design — the ROE/ROA gap is expected here, not a warning.","Judge financials on ROA (>1% is sound), asset quality, and capital ratios instead.");
    else if(r>=60&&b>=60)add("Return authenticity","Are the returns real or leverage?","Returns","Balance sheet","Genuine quality","#1a8a63","High returns earned without leaning on debt — the returns come from the business itself.","This is what a durable competitive advantage looks like in the numbers.");
    else if(r>=60&&b<45)add("Return authenticity","Are the returns real or leverage?","Returns","Balance sheet","Leverage-assisted returns","#b8860b","Returns look strong but significant debt is amplifying them — the underlying return is more modest.","Mentally discount the ROE. Stress-test: what happens if borrowing costs rise 2 points?");
    else add("Return authenticity","Are the returns real or leverage?","Returns","Balance sheet","Weak returns","#c0392b","Returns on capital are below what the risk justifies.","Capital is being consumed rather than compounded here."); }

  { const v=P.valuation.score, m=P.momentum.score;
    if(v>=60&&m>=55)add("Price vs perception","What is the market missing or overdoing?","Valuation","Price vs Fundamentals","Recognized value","#1a8a63","Undervalued on fundamentals AND price action has started confirming — the market may be catching on.","Often the best entry window: the discount exists but the downtrend has stopped.");
    else if(v>=60&&m<45)add("Price vs perception","What is the market missing or overdoing?","Valuation","Price vs Fundamentals","Falling knife or hidden gem","#b8860b","Cheap on fundamentals but the market keeps selling — someone disagrees with the numbers.","Do NOT assume the market is wrong. Check recent news and whether insiders are buying the dip before acting.");
    else if(v<45&&m>=55)add("Price vs perception","What is the market missing or overdoing?","Valuation","Price vs Fundamentals","Price-carried, fundamentals lag","#b8860b","Price strength without valuation support — running on narrative and flows.","Can continue longer than seems rational, but risk/reward is asymmetric. Size accordingly if at all.");
    else add("Price vs perception","What is the market missing or overdoing?","Valuation","Price vs Fundamentals","No support either way","#c0392b","Neither cheap nor showing positive price behavior.","No edge visible from either angle right now."); }

  { const o=P.ownership.score;
    const fundAvg=(P.growth.score+P.cashQuality.score)/2;
    if(o>=60&&fundAvg>=55)add("Insider confirmation","Do insiders confirm what the numbers say?","Ownership","Fundamentals","Insiders confirm","#1a8a63","The people with the best information are increasing their stake while fundamentals genuinely improve — independent confirmation.","One of the highest-conviction combinations this dashboard can surface.");
    else if(o<45&&fundAvg<45)add("Insider confirmation","Do insiders confirm what the numbers say?","Ownership","Fundamentals","Insiders + numbers both negative","#c0392b","Insiders reducing stake while fundamentals deteriorate — two independent negative signals agreeing.","The benefit of the doubt is gone. Treat any bull thesis here with heavy skepticism.");
    else if(o>=60&&fundAvg<45)add("Insider confirmation","Do insiders confirm what the numbers say?","Ownership","Fundamentals","Insiders see something","#b8860b","Fundamentals look weak but insiders are buying anyway — they may see a turn the numbers don't show yet.","Insider buying into weakness is historically one of the better contrarian signals. Worth finding what they see.");
    else add("Insider confirmation","Do insiders confirm what the numbers say?","Ownership","Fundamentals","No insider signal","#b8860b","No meaningful ownership signal in either direction (or data still accumulating).","Neutral — rely on the other linkages."); }

  { const c=P.cashQuality.score, v=P.valuation.score;
    if(c>=60&&v>=60)add("Yield authenticity","Is the cash yield at this price real?","Cash quality","Valuation","Real yield, fair price","#1a8a63","Strong genuine cash generation available at a price that makes the yield meaningful.","Compare the FCF yield against the 10yr bond — the spread is your compensation for equity risk, backed by real cash.");
    else if(c<45&&v>=60)add("Yield authenticity","Is the cash yield at this price real?","Cash quality","Valuation","Paper cheap","#c0392b","Looks cheap on earnings multiples, but earnings aren't converting to cash — the cheapness is partly an illusion.","Re-value using FCF yield instead of P/E. Many 'cheap' stocks stop looking cheap on this basis.");
    else if(c>=60&&v<45)add("Yield authenticity","Is the cash yield at this price real?","Cash quality","Valuation","Quality, fully priced","#b8860b","The cash generation is real but you're paying a full price for it.","The business is fine; the entry point is the problem. Patience is the position.");
    else add("Yield authenticity","Is the cash yield at this price real?","Cash quality","Valuation","Neither","#c0392b","Weak cash conversion and no valuation cushion.","No margin of safety from either direction."); }

  return L;
}

function decisionSynthesis(s, P, L, macro){
  const quality0 = Math.round(
    P.growth.score*0.20 + P.profitability.score*0.20 + P.cashQuality.score*0.25 +
    P.balanceSheet.score*0.15 + P.returns.score*0.20 );
  const price = P.valuation.score;

  let qMod=0, notes=[];
  if(P.ownership.score>=65){ qMod+=4; notes.push("Insider conviction adds confidence to the quality read."); }
  if(P.ownership.score<40){ qMod-=4; notes.push("Insider selling subtracts confidence from the quality read."); }
  const m = macro ? macroRead(s, macro) : null;
  if(m && m.score>=2) notes.push("Current macro backdrop is a tailwind for this sector — flatters near-term results.");
  if(m && m.score<=-2) notes.push("Current macro backdrop is a headwind — near-term results face external pressure regardless of quality.");
  const quality = Math.max(0,Math.min(100, quality0+qMod));

  const hiQ = quality>=58, hiP = price>=58;
  let quadrant, qColor, headline, guidance;
  if(hiQ&&hiP){ quadrant="PRIME CANDIDATE"; qColor="#1a8a63";
    headline="High business quality at an attractive price — the rare overlap.";
    guidance="This is the setup worth your deepest work. Run the full Stage 3 deep-dive (see tutorial), read the bear case via Ask Claude, and ask what the market is worried about. If nothing structural emerges, this is as good as screening gets."; }
  else if(hiQ&&!hiP){ quadrant="QUALITY WATCHLIST"; qColor="#b8860b";
    headline="A business worth owning, at a price worth waiting on.";
    guidance="Star it. The business does the compounding; your job is the entry. Broad selloffs that drag everything down indiscriminately are when these become buyable."; }
  else if(!hiQ&&hiP){ quadrant="TRAP-RISK VALUE"; qColor="#b8860b";
    headline="Statistically cheap, but the business itself is questionable.";
    guidance="Cheapness alone is not a thesis. This only works with a specific, identifiable catalyst (new management, cycle turn, restructuring). Name the catalyst explicitly before acting — if you can't, pass."; }
  else { quadrant="AVOID FOR NOW"; qColor="#c0392b";
    headline="Neither the quality nor the price argues for your capital.";
    guidance="No edge here from any angle the dashboard measures. Your time is better spent on the other quadrants — revisit only if something material changes."; }

  const scores=[P.growth.score,P.profitability.score,P.cashQuality.score,P.balanceSheet.score,P.returns.score];
  const nonNullMetrics=[s.revG,s.fcfG,s.fcfNi,s.roe,s.mos,s.pe,s.emNow].filter(v=>v!=null).length;
  const mean=scores.reduce((a,b)=>a+b,0)/scores.length;
  const spread=Math.sqrt(scores.reduce((a,b)=>a+(b-mean)**2,0)/scores.length);
  const confidence = nonNullMetrics>=6 && spread<15 ? "High" : nonNullMetrics>=5 ? "Moderate" : "Low";
  const confNote = confidence==="High" ? "Data is complete and the pillars broadly agree."
    : confidence==="Moderate" ? (spread>=15?"Pillars disagree meaningfully — the mixed picture is itself the finding.":"Some metrics unavailable; read the pillar detail before leaning on the quadrant.")
    : "Significant data gaps — treat this placement as provisional.";

  const coreP=[P.growth,P.profitability,P.cashQuality,P.balanceSheet,P.returns];
  const sorted=[...coreP].sort((a,b)=>b.score-a.score);
  const strongest=sorted[0], weakest=sorted[sorted.length-1];
  const reasoning=[
    `Business quality scores ${quality}/100 — driven most by ${strongest.name.toLowerCase()} (${strongest.score}), held back most by ${weakest.name.toLowerCase()} (${weakest.score}).`,
    `Price attractiveness scores ${price}/100 — ${price>=58?"the market is offering a discount to estimated value":"the market is charging a full or premium price"}.`,
    ...notes,
  ];

  const monitors=[];
  if(s.fcfNi!=null&&s.fcfNi>=0.7&&s.fcfNi<1.0)monitors.push("FCF/Net income sits in the caution band — if next results push it below 0.7, the cash-quality pillar flips negative.");
  if(s.revDecel!=null&&Math.abs(s.revDecel)<7)monitors.push("Growth trajectory is near an inflection — watch whether next quarter's growth accelerates or keeps fading.");
  if(s.debtToEbitda!=null&&s.debtToEbitda>2&&s.debtToEbitda<3.5)monitors.push("Leverage is in the middle band — a weak EBITDA quarter would push net debt/EBITDA into the danger zone.");
  if(s.mos!=null&&Math.abs(s.mos)<15)monitors.push("Price sits near estimated intrinsic value — modest moves either way change the valuation verdict.");
  if(s.insiderTrend!=null)monitors.push(`Insider stake trend (currently ${s.insiderTrend>0?"rising":"falling"}) — a reversal would ${s.insiderTrend>0?"remove a key support of":"add support to"} the current read.`);
  if(!monitors.length)monitors.push("No metrics are near a verdict boundary — the current read is stable unless results surprise.");

  return {quality, price, quadrant, qColor, headline, guidance, confidence, confNote, reasoning, monitors:monitors.slice(0,3)};
}

/* ============================================================
   VETERAN'S LENS — six assessments a 50-year investor uses that
   standard screeners never show. Computed from data already loaded.
   ============================================================ */
function veteranMetrics(s){
  const A=s.annual; const rev=A.revenue||[], fcf=A.fcf||[], ni=A.netIncome||[], ocf=A.ocf||[], ebitda=A.ebitda||[], capex=A.capex||[];
  const M={};

  // 1. STEADINESS — variability of growth + FCF positivity streak
  {
    const gs=[]; for(let i=0;i<rev.length-1;i++){ if(rev[i+1]) gs.push((rev[i]-rev[i+1])/Math.abs(rev[i+1])*100); }
    let vol=null; if(gs.length>=2){ const m=gs.reduce((a,b)=>a+b,0)/gs.length; vol=Math.sqrt(gs.reduce((a,b)=>a+(b-m)**2,0)/gs.length); }
    const posYears=fcf.filter(v=>v!=null&&v>0).length, totYears=fcf.filter(v=>v!=null).length;
    let score=50; if(vol!=null){ if(vol<5)score+=25; else if(vol<10)score+=12; else if(vol>20)score-=20; else if(vol>12)score-=8; }
    if(totYears>=3){ if(posYears===totYears)score+=15; else if(posYears<totYears/2)score-=20; }
    M.steadiness={score:Math.max(0,Math.min(100,score)), vol, posYears, totYears,
      verdict: score>=68?"Metronome":score>=48?"Workable":"Erratic",
      read: vol==null?"Not enough history to judge.":`Revenue growth volatility of ±${vol.toFixed(1)}pts across the window; FCF positive in ${posYears}/${totYears} years. ${vol<8?"This business would not embarrass you in a bad year — the pattern is the asset.":vol>15?"Results swing widely — whatever the average says, you cannot count on any single year.":"Moderate variability — readable, but verify the drivers of the swings."}`};
  }

  // 2. INCREMENTAL ECONOMICS — margin on the marginal dollar
  {
    let inc=null, avg=null, tooFlat=false;
    // B3 fix: require at least 5% cumulative revenue growth before dividing —
    // a near-zero denominator turns one EBITDA recovery into an absurd
    // "600% incremental margin" that means nothing.
    if(rev.length>=4&&ebitda.length>=4&&rev[0]!=null&&rev[3]!=null&&rev[3]>0){
      const cumGrowth=(rev[0]-rev[3])/rev[3];
      if(cumGrowth>0.05){
        inc=(ebitda[0]-ebitda[3])/(rev[0]-rev[3])*100;
        avg=ebitda[0]/rev[0]*100;
      } else if(cumGrowth>-0.02) tooFlat=true;
    }
    let score=50, read = tooFlat
      ? "Revenue is essentially flat across the window — incremental margin can't be measured meaningfully (dividing by a near-zero revenue change produces noise, not insight)."
      : "Insufficient data (needs 4 years and growing revenue).";
    if(inc!=null){
      const gap=inc-avg;
      if(gap>8){score=80; read=`Each new dollar of revenue came in at ${inc.toFixed(0)}% EBITDA margin vs ${avg.toFixed(0)}% average — the marginal dollar is far more profitable than the historical one. Reported margins will keep rising mechanically. This is the future arriving early.`;}
      else if(gap>2){score=65; read=`Incremental margin ${inc.toFixed(0)}% vs ${avg.toFixed(0)}% average — new business is modestly more profitable. Gentle structural improvement underway.`;}
      else if(gap>-5){score=50; read=`Incremental margin ${inc.toFixed(0)}% ≈ average ${avg.toFixed(0)}% — growing at constant economics. Fine, but no hidden margin story.`;}
      else {score=30; read=`Incremental margin ${inc.toFixed(0)}% is BELOW the ${avg.toFixed(0)}% average — each new dollar of revenue is less profitable than the old ones. Reported margins will erode as this mix compounds, even if headline growth looks fine.`;}
    }
    M.incremental={score, inc, avg, verdict: score>=68?"Improving engine":score>=45?"Constant economics":"Deteriorating mix", read};
  }

  // 3. REVERSE DCF — the growth rate the price already assumes
  {
    let implied=null, atCeiling=false;
    const base=fcf[0];
    if(base!=null&&base>0&&s.shares&&s.price){
      // binary search initial growth g0 (fading to 3% terminal over 10y, 10%
      // discount) matching price — using the SAME corrected fade weights as
      // dcf(), so implied growth here is directly comparable to the forward
      // DCF's assumption.
      const target=s.price;
      const HI=0.45;
      let lo=-0.10, hi=HI;
      for(let iter=0;iter<40;iter++){
        const g0=(lo+hi)/2; let pv=0,f=base; const r=0.10,tg=0.03,yrs=10;
        for(let y=1;y<=yrs;y++){ const w=y/yrs, gr=g0*(1-w)+tg*w; f*=(1+gr); pv+=f/Math.pow(1+r,y); }
        pv+=(f*(1+tg))/(r-tg)/Math.pow(1+r,yrs);
        const perShare=(pv-s.debt)/s.shares;
        if(perShare<target) lo=g0; else hi=g0;
      }
      implied=((lo+hi)/2)*100;
      // B4 fix: if the search terminated at the ceiling, the truth is
      // "45%+", not "45%" — report the boundary as the finding it is.
      if(implied>HI*100-0.5) atCeiling=true;
    }
    const hist=s.fcfCagr;
    let score=50, read="Cannot compute (needs positive FCF).";
    let impliedTxt = implied!=null ? `~${implied.toFixed(0)}%` : null;
    if(implied!=null && atCeiling){
      score=15;
      impliedTxt="45%+";
      read=`The price implies MORE than 45% sustained starting FCF growth — beyond the range this model can even solve for.${hist!=null?` Historically it has delivered ${hist.toFixed(0)}% FCF CAGR.`:""} Expectations this extreme are themselves the finding: the price is a bet on transformation at a scale almost no company has ever sustained for a decade.`;
    }
    else if(implied!=null){
      const gapTxt = hist!=null?` Historically it has delivered ${hist.toFixed(0)}% FCF CAGR.`:"";
      if(hist!=null){
        const gap=implied-hist;
        if(gap<-8){score=80; read=`The price implies only ~${implied.toFixed(0)}% starting FCF growth (10% discount, fading to 3%).${gapTxt} The market is asking for LESS than the company has proven — expectations are beatable. This gap is where returns come from.`;}
        else if(gap<3){score=60; read=`Price implies ~${implied.toFixed(0)}% FCF growth.${gapTxt} Expectations roughly match the track record — fairly priced against its own history.`;}
        else if(gap<12){score=38; read=`Price implies ~${implied.toFixed(0)}% growth.${gapTxt} The market demands more than the company has ever delivered — you're underwriting an acceleration that hasn't happened yet.`;}
        else {score=20; read=`Price implies ~${implied.toFixed(0)}% sustained growth.${gapTxt} That's far beyond the demonstrated record — the price is a bet on transformation, not continuation. Ask precisely what changed.`;}
      } else { read=`Price implies ~${implied.toFixed(0)}% starting FCF growth, fading to 3% terminal. Judge that against what you believe this business can do.`; }
    }
    M.impliedGrowth={score, implied: atCeiling?null:implied, impliedTxt, hist, verdict: score>=68?"Beatable expectations":score>=45?"Fairly demanded":"Heroic assumptions", read};
  }

  // 4. ACCRUALS SMELL TEST — profit vs cash gap (Sloan anomaly)
  {
    const pairs=[]; for(let i=0;i<Math.min(ni.length,ocf.length,rev.length);i++){ if(ni[i]!=null&&ocf[i]!=null&&rev[i]) pairs.push((ni[i]-ocf[i])/rev[i]*100); }
    const acc=pairs.length?pairs.reduce((a,b)=>a+b,0)/pairs.length:null;
    let score=50, read="Insufficient data.";
    if(acc!=null){
      if(acc<-3){score=78; read=`Operating cash exceeds reported profit by ${Math.abs(acc).toFixed(1)}% of revenue on average — earnings are conservative, cash arrives before the accounting admits it. The cleanest smell there is.`;}
      else if(acc<3){score=60; read=`Accruals near zero (${acc.toFixed(1)}% of revenue) — profit and cash tell the same story. Nothing to distrust here.`;}
      else if(acc<8){score=38; read=`Reported profit runs ${acc.toFixed(1)}% of revenue ahead of operating cash — a persistent accrual wedge. Decades of research (the Sloan anomaly) show these companies systematically disappoint later. Not proof of trouble, but the burden of proof shifts to the company.`;}
      else {score=18; read=`Accruals of ${acc.toFixed(1)}% of revenue — profit is far ahead of the cash arriving. This is the forensic accountant's first stop. Something in receivables, inventory, or recognition policy deserves a hard look before believing the earnings.`;}
    }
    M.accruals={score, acc, verdict: score>=68?"Smells like cash":score>=45?"Clean":"Profit ahead of cash", read};
  }

  // 5. REINVESTMENT EFFECTIVENESS — revenue bought per capex dollar
  {
    let eff=null;
    const capSum=capex.filter(v=>v!=null).reduce((a,b)=>a+Math.abs(b),0);
    if(rev.length>=4&&rev[0]!=null&&rev[3]!=null&&capSum>0) eff=(rev[0]-rev[3])/capSum;
    let score=50, read="Insufficient data.";
    if(eff!=null){
      if(eff>1.5){score=78; read=`Every dollar of capex over the window bought $${eff.toFixed(2)} of new annual revenue — reinvestment is genuinely compounding. Management's spending earns its keep.`;}
      else if(eff>0.5){score=58; read=`$${eff.toFixed(2)} of new revenue per capex dollar — respectable reinvestment economics, in line with a healthy capital-using business.`;}
      else if(eff>0){score=38; read=`Only $${eff.toFixed(2)} of new revenue per capex dollar — heavy spending, little growth to show. Much of this capex is treadmill maintenance dressed as investment, or the returns haven't arrived yet. Ask which.`;}
      else {score=22; read=`Revenue SHRANK despite ${(capSum).toFixed(0)} of cumulative capex — capital is being consumed defending a declining position. The worst use of shareholder money.`;}
    }
    M.reinvest={score, eff, verdict: score>=68?"Compounding capex":score>=45?"Earning its keep":"Treadmill spending", read};
  }

  // 6. WORST-YEAR RESILIENCE — the floor, not the average
  {
    let worstRev=null, worstFcf=null;
    for(let i=0;i<rev.length-1;i++){ if(rev[i+1]){ const g=(rev[i]-rev[i+1])/Math.abs(rev[i+1])*100; if(worstRev==null||g<worstRev)worstRev=g; } }
    for(let i=0;i<fcf.length-1;i++){ if(fcf[i+1]&&fcf[i+1]!==0){ const g=(fcf[i]-fcf[i+1])/Math.abs(fcf[i+1])*100; if(worstFcf==null||g<worstFcf)worstFcf=g; } }
    let score=50, read="Insufficient history.";
    if(worstRev!=null){
      if(worstRev>0&&(worstFcf==null||worstFcf>-15)){score=80; read=`Even the WORST year in the window grew revenue (${worstRev.toFixed(1)}%)${worstFcf!=null?` with FCF never falling more than ${Math.abs(Math.min(worstFcf,0)).toFixed(0)}%`:""}. The floor is high — this is what lets you size a position with confidence and sleep.`;}
      else if(worstRev>-5){score=60; read=`Worst year: revenue ${worstRev.toFixed(1)}%${worstFcf!=null?`, FCF ${worstFcf.toFixed(0)}%`:""}. Shallow drawdowns — the business bends without breaking.`;}
      else if(worstRev>-15){score=40; read=`Worst year saw revenue fall ${Math.abs(worstRev).toFixed(0)}%${worstFcf!=null?` and FCF move ${worstFcf.toFixed(0)}%`:""}. Meaningful cyclicality — size the position by this year, not the average one.`;}
      else {score=22; read=`Worst year: revenue ${worstRev.toFixed(0)}%${worstFcf!=null?`, FCF ${worstFcf.toFixed(0)}%`:""}. Deep drawdowns are part of this business's character. Whatever the averages say, THIS is what you must be able to hold through.`;}
    }
    M.resilience={score, worstRev, worstFcf, verdict: score>=68?"High floor":score>=45?"Bends, doesn't break":"Deep drawdowns", read};
  }

  const parts=[M.steadiness,M.incremental,M.impliedGrowth,M.accruals,M.reinvest,M.resilience];
  M.composite=Math.round(parts.reduce((a,p)=>a+p.score,0)/parts.length);
  return M;
}

/* ============================================================
   FORENSIC SCORES — Altman Z (bankruptcy risk), Piotroski F
   (fundamental strength trajectory), Beneish M (earnings
   manipulation probability). All three are public, well-
   documented academic formulas, computed here from real balance
   sheet detail (bsDetail) fetched via yfinance -- no paid data,
   no approximation. If a required field is missing for a given
   stock, the score returns null with an honest reason rather
   than guessing.
   ============================================================ */
function forensicScores(s){
  const bs = s.bsDetail;
  const A = s.annual;
  const v0=a=>(a&&a.length&&a[0]!=null)?a[0]:null;
  const v1=a=>(a&&a.length>1&&a[1]!=null)?a[1]:null;

  const out = { altman:null, piotroski:null, beneish:null };

  if(!bs){
    return { altman:{score:null,read:"Balance sheet detail not yet loaded for this stock — run the updated fetch_data.py to activate."},
             piotroski:{score:null,read:"Balance sheet detail not yet loaded for this stock — run the updated fetch_data.py to activate."},
             beneish:{score:null,read:"Balance sheet detail not yet loaded for this stock — run the updated fetch_data.py to activate."} };
  }

  const ta=v0(bs.totalAssets), tl=v0(bs.totalLiab), ca=v0(bs.currentAssets), cl=v0(bs.currentLiab),
        re=v0(bs.retainedEarnings), ebit=v0(A.operatingIncome), sales=v0(A.revenue), mcap=s.mcap;

  /* ---------- ALTMAN Z-SCORE ----------
     A3 fix, three-way routing:
     1. FINANCIALS: suppressed entirely. Altman explicitly excluded banks
        and financial firms — deposits are liabilities and leverage is the
        business model, so "working capital / total assets" is meaningless
        and a perfectly healthy bank scores "Distress." Showing that number
        would directly contradict the Return-Authenticity linkage, which
        correctly treats financial leverage as the sector norm.
     2. MANUFACTURERS (Industrials, Basic Materials, Energy, Consumer):
        original 1968 five-factor Z, the population it was fitted on.
        Zones: >2.99 safe, 1.81-2.99 grey, <1.81 distress.
     3. EVERYONE ELSE (tech, healthcare, services, utilities, real estate):
        Altman's own Z'' revision for non-manufacturers — drops the
        sales/assets turnover term (which structurally penalises
        asset-light service firms) and uses book equity instead of market
        cap. Zones: >2.6 safe, 1.1-2.6 grey, <1.1 distress. */
  const isFinSector = s.sec==="Financial Services";
  const MFG_SECTORS = new Set(["Industrials","Basic Materials","Energy","Consumer Cyclical","Consumer Defensive"]);
  if(isFinSector){
    out.altman = {score:null, notApplicable:true,
      read:"Not applicable to banks and financial companies — Altman explicitly excluded them, because deposits count as liabilities and leverage IS the business model, so the formula misreads a healthy bank as distressed. Judge financial-sector balance-sheet risk on ROA, capital adequacy, and asset quality instead (see the Return Authenticity card, which handles this sector correctly)."};
  } else if(ta&&tl&&ebit!=null&&ca!=null&&cl!=null&&ta>0&&tl>0){
    const wcTa=(ca-cl)/ta, reTa=(re||0)/ta, ebitTa=ebit/ta;
    if(MFG_SECTORS.has(s.sec) && sales!=null && mcap!=null){
      const z = 1.2*wcTa + 1.4*reTa + 3.3*ebitTa + 0.6*(mcap/tl) + 1.0*(sales/ta);
      const zone = z>2.99?"Safe zone":z>1.81?"Grey zone":"Distress zone";
      const color = z>2.99?"#1a8a63":z>1.81?"#b8860b":"#c0392b";
      out.altman = {score:+z.toFixed(2), zone, color, variant:"Z (manufacturer, 1968)",
        read:`Z-Score ${z.toFixed(2)} — ${zone} (original manufacturer formula — this stock's sector is what the model was built on). ${z>2.99?"Statistically well outside the bankruptcy-risk range over a 2-year horizon; asset base, retained earnings, and market cushion all support the balance sheet.":z>1.81?"In the historically ambiguous range — not a red flag on its own, but worth checking alongside the Balance Sheet pillar before treating leverage as safe.":"Falls in the range Altman's original research associated with elevated bankruptcy risk within about 2 years. Not a prediction of imminent distress, but a genuine statistical flag worth weighing seriously."}`};
    } else {
      const bookEq = ta - tl;
      const z = 6.56*wcTa + 3.26*reTa + 6.72*ebitTa + 1.05*(bookEq/tl);
      const zone = z>2.6?"Safe zone":z>1.1?"Grey zone":"Distress zone";
      const color = z>2.6?"#1a8a63":z>1.1?"#b8860b":"#c0392b";
      out.altman = {score:+z.toFixed(2), zone, color, variant:"Z'' (non-manufacturer)",
        read:`Z''-Score ${z.toFixed(2)} — ${zone} (Altman's non-manufacturer revision, which removes the asset-turnover term that structurally penalises asset-light businesses like this one). ${z>2.6?"Comfortably outside the statistical distress range.":z>1.1?"In the ambiguous middle band — read alongside the Balance Sheet pillar rather than in isolation.":"In the band Altman's research associated with elevated distress risk — a genuine statistical flag, not a verdict."}`};
    }
  }
  if(!out.altman) out.altman={score:null, read:"Missing one or more required fields (total assets, liabilities, working capital, or EBIT) for this specific stock."};

  /* ---------- PIOTROSKI F-SCORE ---------- */
  {
    const ta1=v1(bs.totalAssets), ca1=v1(bs.currentAssets), cl1=v1(bs.currentLiab),
          ltd0=v0(bs.ltDebt), ltd1=v1(bs.ltDebt), ni0=v0(A.netIncome), ni1=v1(A.netIncome),
          ocf0=v0(A.ocf), ocf1=v1(A.ocf), gp0=v0(A.grossProfit), gp1=v1(A.grossProfit),
          sales1=v1(A.revenue), dsh0=bs.dilutedShares&&bs.dilutedShares[0], dsh1=bs.dilutedShares&&bs.dilutedShares[1];
    let pts=0, possible=0; const checks=[];
    const check=(cond,label)=>{ if(cond==null)return; possible++; if(cond)pts++; checks.push({label,pass:!!cond}); };

    check(ta&&ni0!=null?ni0/ta>0:null, "Positive ROA this year");
    check(ocf0!=null?ocf0>0:null, "Positive operating cash flow");
    check((ta&&ta1&&ni0!=null&&ni1!=null)?(ni0/ta)>(ni1/ta1):null, "ROA improving YoY");
    check((ocf0!=null&&ni0!=null)?ocf0>ni0:null, "Cash flow exceeds net income (quality)");
    check((ta&&ta1&&ltd0!=null&&ltd1!=null)?(ltd0/ta)<(ltd1/ta1):null, "Leverage (LT debt/assets) declining");
    check((ca!=null&&cl&&ca1!=null&&cl1)?(ca/cl)>(ca1/cl1):null, "Current ratio improving");
    check((dsh0!=null&&dsh1!=null)?dsh0<=dsh1*1.01:null, "No meaningful new share issuance");
    check((gp0!=null&&gp1!=null&&sales&&sales1)?(gp0/sales)>(gp1/sales1):null, "Gross margin improving");
    check((ta&&ta1&&sales&&sales1)?(sales/ta)>(sales1/ta1):null, "Asset turnover improving");

    if(possible>=6){
      const pct=pts/possible;
      const verdict = pct>=0.78?"Strengthening broadly":pct>=0.44?"Mixed signals":"Weakening broadly";
      const color = pct>=0.78?"#1a8a63":pct>=0.44?"#b8860b":"#c0392b";
      out.piotroski = {score:pts, possible, verdict, color, checks,
        read:`${pts} of ${possible} assessable checks passed — ${verdict.toLowerCase()}. ${pct>=0.78?"Strong fundamental improvement across profitability, leverage, and efficiency simultaneously — historically the profile of a genuine turnaround rather than a value trap.":pct>=0.44?"Some dimensions improving, others not — a mixed trajectory that doesn't confirm a turnaround thesis on its own.":"Multiple independent dimensions deteriorating at once — if this stock also screens cheap, that cheapness likely reflects real, ongoing fundamental weakness rather than a market overreaction."}`};
    } else {
      out.piotroski = {score:null, read:`Only ${possible} of 9 checks had enough historical data to assess — needs at least 2 years of balance sheet history for most of this score.`};
    }
  }

  /* ---------- BENEISH M-SCORE ---------- */
  {
    const rec0=v0(bs.receivables), rec1=v1(bs.receivables), cogs0=v0(bs.cogs), cogs1=v1(bs.cogs),
          ca1=v1(bs.currentAssets), ppe0=v0(bs.ppeNet), ppe1=v1(bs.ppeNet), ta1=v1(bs.totalAssets),
          sales1=v1(A.revenue), dep0=v0(bs.depreciation), dep1=v1(bs.depreciation),
          sga0=v0(bs.sga), sga1=v1(bs.sga), ltd0=v0(bs.ltDebt), ltd1=v1(bs.ltDebt),
          cl1=v1(bs.currentLiab), ni0=v0(A.netIncome), ocf0=v0(A.ocf);

    const need=[rec0,rec1,cogs0,cogs1,ca,ca1,ppe0,ppe1,ta,ta1,sales,sales1,dep0,dep1,sga0,sga1,ltd0,ltd1,cl,cl1,ni0,ocf0];
    if(need.every(v=>v!=null) && sales1&&sales&&ta&&ta1&&(ppe0+dep0)>0&&(ppe1+dep1)>0&&sga1&&cogs1!==sales1){
      const dsri = (rec0/sales)/(rec1/sales1);
      const gmi  = ((sales1-cogs1)/sales1)/((sales-cogs0)/sales);
      const aqi  = (1-(ca+ppe0)/ta)/(1-(ca1+ppe1)/ta1);
      const sgi  = sales/sales1;
      const depi = (dep1/(ppe1+dep1))/(dep0/(ppe0+dep0));
      const sgai = (sga0/sales)/(sga1/sales1);
      const lvgi = ((ltd0+cl)/ta)/((ltd1+cl1)/ta1);
      const tata = (ni0-ocf0)/ta;
      const m = -4.84 + 0.92*dsri + 0.528*gmi + 0.404*aqi + 0.892*sgi + 0.115*depi - 0.172*sgai + 4.679*tata - 0.327*lvgi;
      const flagged = m > -1.78;
      out.beneish = {score:+m.toFixed(2), flagged, color: flagged?"#c0392b":"#1a8a63",
        read:`M-Score ${m.toFixed(2)} — ${flagged?"above the -1.78 threshold Beneish's research associated with elevated manipulation risk":"below the -1.78 threshold, in the range typical of non-manipulators"}. ${flagged?"This doesn't prove anything improper — it means the pattern across receivables growth, margins, asset quality, and accruals resembles companies that later turned out to have manipulated earnings. Worth a closer read of the footnotes before trusting the headline numbers at face value.":"The combination of receivables growth, margin trend, asset quality, and accruals doesn't show the pattern associated with earnings manipulation. Not a certification of clean books — just the absence of this particular statistical red flag."}`};
    } else {
      out.beneish = {score:null, read:"Needs 2 years of receivables, COGS, PPE, depreciation, and SG&A data — one or more of these fields isn't available for this stock (common for financials and some non-US filers, which report balance sheets differently)."};
    }
  }

  return out;
}

/* ============================================================
   VALUATION EXTRAS — tangible book value and rough LBO capacity.
   Both computed entirely from data already fetched; no new
   pipeline needed beyond the balance-sheet fields above.
   ============================================================ */
function valuationExtras(s){
  const bs = s.bsDetail;
  const out = {tangibleBookPerShare:null, priceToTangibleBook:null, lboImpliedPrice:null, lboGapPct:null};
  if(!bs || !s.shares) return out;

  const v0=a=>(a&&a.length&&a[0]!=null)?a[0]:null;
  const ta=v0(bs.totalAssets), tl=v0(bs.totalLiab), gi=v0(bs.goodwillIntangibles);
  if(ta!=null&&tl!=null){
    const tangibleEquity = ta - (gi||0) - tl;
    out.tangibleBookPerShare = tangibleEquity / s.shares;
    out.priceToTangibleBook = out.tangibleBookPerShare>0 ? s.price/out.tangibleBookPerShare : null;
  }

  // Rough LBO capacity: what could a financial buyer pay and still hit a
  // 20% IRR in 5 years? A5 fix — the previous version ignored interest on
  // the acquisition debt entirely (at ~9% on 4.5x EBITDA of new debt, the
  // interest bill often exceeded the paydown it was modelling), which badly
  // overstated the LBO floor. This version:
  //   - charges interest each year on the outstanding acquisition debt
  //   - pays down debt only with FCF remaining AFTER interest
  //   - keeps the two capital structures separate: the buyer pays EV;
  //     today's shareholders receive EV minus TODAY'S net debt.
  // Still simplified (flat FCF, flat exit multiple, no fees) — labeled as a
  // conservative floor estimate, not a prediction.
  const ebitda0 = s.annual?.ebitda?.[0];
  const fcf0 = s.annual?.fcf?.[0];
  const LBO_RATE = 0.09;        // assumed blended cost of acquisition debt
  const LBO_LEV  = 4.5;         // typical leverage, x EBITDA
  const TARGET_IRR = 0.20;
  if(ebitda0>0 && fcf0!=null && fcf0>0 && s.evEbitda){
    const entryMultiple = s.evEbitda;   // assume exit at the same multiple
    const debtCapacity = ebitda0 * LBO_LEV;
    // Simulate 5 years: FCF services interest first, remainder pays principal.
    let debt = debtCapacity, broken=false;
    for(let y=0;y<5;y++){
      const interest = debt * LBO_RATE;
      const available = fcf0 - interest;
      if(available <= 0){ broken=true; break; }  // FCF can't even cover interest
      debt = Math.max(0, debt - available);
    }
    if(!broken){
      const exitEv = ebitda0 * entryMultiple;    // flat EBITDA, flat multiple
      const exitEquity = exitEv - debt;
      if(exitEquity > 0){
        const affordableEquityCheck = exitEquity / Math.pow(1+TARGET_IRR,5);
        const affordableEv = affordableEquityCheck + debtCapacity;
        // Sellers (today's shareholders) receive EV minus today's net debt.
        out.lboImpliedPrice = (affordableEv - s.debt) / s.shares;
        out.lboGapPct = ((out.lboImpliedPrice - s.price)/s.price)*100;
      }
    }
    if(broken) out.lboNote = "FCF cannot cover interest on typical LBO leverage — a financial buyer could not lever this business at all, so no LBO floor exists.";
  }
  return out;
}

/* ============================================================
   DATA INTEGRITY — catches exactly the kind of problem Vedanta's
   unadjusted 52-week high exposed: internal inconsistencies (no
   fetch needed) plus, when available, cross-checks against
   independent primary sources (SEC XBRL for US, NSE's own
   adjusted-for-corporate-actions report for India).
   ============================================================ */
function dataIntegrityChecks(s, verifyUS, verifyIN){
  const checks = [];
  const add=(sev,label,detail)=>checks.push({sev,label,detail});
  const A = s.annual;

  /* ---------- always-on internal consistency (no fetch needed) ---------- */
  if(s.high52!=null && s.price>0 && s.high52/s.price>2.2){
    add("warn","52-week high looks implausible",
      `52-week high (${fmtP(s.high52,s.mkt)}) is ${(s.high52/s.price).toFixed(1)}× the current price. This pattern typically means a demerger, stock split, or bonus issue happened during the window and the historical price wasn't adjusted for it — not that the stock actually fell this far. Treat the 52-week range position (and anything derived from it, like the Price vs Fundamentals pillar) with caution for this stock specifically.`);
  }
  if(s.low52!=null && s.price>0 && s.price/s.low52>3){
    add("info","52-week low sits far below current price",
      `Current price is ${(s.price/s.low52).toFixed(1)}× the 52-week low — worth a quick sanity check that this reflects a real rally rather than an unadjusted pre-split/demerger low.`);
  }
  if(s.shares>0 && s.price>0){
    const impliedMcap = s.price*s.shares;
    const diff = s.mcap>0 ? Math.abs(impliedMcap-s.mcap)/s.mcap*100 : null;
    if(diff!=null && diff>8){
      add("warn","Market cap doesn't reconcile with price × shares",
        `Stated market cap (${fmtB(s.mcap,s.mkt)}) differs from price×shares (${fmtB(impliedMcap,s.mkt)}) by ${diff.toFixed(0)}% — could mean a stale shares-outstanding count after a buyback, split, or recent share issuance.`);
    }
  }
  if(s.pe!=null && A.netIncome?.[0]!=null && s.shares>0 && A.netIncome[0]!==0){
    const impliedEps = A.netIncome[0]/s.shares;
    const impliedPe = impliedEps>0 ? s.price/impliedEps : null;
    if(impliedPe!=null && s.pe>0){
      const diff = Math.abs(impliedPe-s.pe)/s.pe*100;
      if(diff>25) add("info","P/E doesn't fully reconcile with reported net income",
        `Stated P/E (${s.pe.toFixed(1)}) implies EPS different from net income ÷ shares outstanding by ${diff.toFixed(0)}% — often explained by one-off items excluded from "adjusted" EPS, preferred dividends, or a recent share count change. Not necessarily wrong, just worth knowing which EPS definition is in play.`);
    }
  }
  const revG = yoy(A.revenue), niG = yoy(A.netIncome);
  if(revG!=null && Math.abs(revG)>150) add("info","Unusually large YoY revenue swing",
    `Revenue moved ${sign(revG)} year-over-year — magnitudes this large are usually a real event (M&A, divestiture, demerger) rather than organic performance. Worth confirming what happened before treating this as a pure growth signal.`);
  if(niG!=null && Math.abs(niG)>300) add("info","Unusually large YoY net income swing",
    `Net income moved ${sign(niG)} year-over-year — check for one-off items (asset sales, impairments, tax adjustments) before reading this as an operating trend.`);

  if(s.bsDetail){
    const ta=s.bsDetail.totalAssets?.[0], tl=s.bsDetail.totalLiab?.[0];
    if(ta!=null && tl!=null && ta>0 && tl>ta*1.5) add("warn","Liabilities substantially exceed assets",
      `Total liabilities run well above total assets — could indicate negative equity (common for some leveraged buyouts or heavily bought-back companies, but worth confirming it's not a data-parsing issue for this specific filer).`);
  }

  /* ---------- external verification (only when loaded) ---------- */
  if(s.mkt==="US" && verifyUS){
    const v = verifyUS[s.t];
    if(v){
      if(v.revenueDiffPct!=null && Math.abs(v.revenueDiffPct)>8)
        add("warn","Revenue differs from SEC-filed figure",
          `Yahoo-sourced revenue differs from what was actually filed with the SEC (XBRL company facts) by ${sign(v.revenueDiffPct)}. SEC figure: ${fmtB(v.secRevenue,s.mkt)}. This is the primary source — worth trusting it over the aggregator when they disagree.`);
      if(v.netIncomeDiffPct!=null && Math.abs(v.netIncomeDiffPct)>8)
        add("warn","Net income differs from SEC-filed figure",
          `Yahoo-sourced net income differs from the SEC-filed figure by ${sign(v.netIncomeDiffPct)}. SEC figure: ${fmtB(v.secNetIncome,s.mkt)}.`);
      if(v.assetsDiffPct!=null && Math.abs(v.assetsDiffPct)>8)
        add("warn","Total assets differ from SEC-filed figure",
          `Yahoo-sourced total assets differ from the SEC-filed figure by ${sign(v.assetsDiffPct)}. SEC figure: ${fmtB(v.secAssets,s.mkt)}. This feeds directly into the Altman Z and Piotroski F forensic scores — a large gap here means those scores deserve extra skepticism for this stock.`);
      if(v.liabilitiesDiffPct!=null && Math.abs(v.liabilitiesDiffPct)>8)
        add("warn","Total liabilities differ from SEC-filed figure",
          `Yahoo-sourced total liabilities differ from the SEC-filed figure by ${sign(v.liabilitiesDiffPct)}. SEC figure: ${fmtB(v.secLiabilities,s.mkt)}.`);
      if(!v.revenueDiffPct && !v.netIncomeDiffPct && !v.assetsDiffPct && !v.liabilitiesDiffPct)
        add("good","Cross-checked against SEC filings","Revenue, net income, total assets, and total liabilities all match the company's own SEC-filed figures within a normal tolerance.");
    }
  }
  if(s.mkt==="IN" && verifyIN){
    const v = verifyIN[s.t];
    if(v){
      if(v.priceDiffPct!=null && Math.abs(v.priceDiffPct)>3)
        add("warn","Current price differs from NSE's live quote",
          `Yahoo-sourced price differs from NSE's own last-traded price by ${sign(v.priceDiffPct)} (NSE: ${fmtP(v.nsePrice,s.mkt)}). Since every ratio on this tearsheet is built on price, a gap this size is worth resolving before trusting the numbers — most likely explanation is simply a stale Yahoo quote at the time data.json was last refreshed.`);
      if(v.high52DiffPct!=null && Math.abs(v.high52DiffPct)>5)
        add("warn","52-week high differs from NSE's official adjusted figure",
          `Yahoo-sourced 52-week high differs from NSE's own corporate-action-adjusted report by ${sign(v.high52DiffPct)}. NSE figure: ${fmtP(v.nseHigh52,s.mkt)} — this is the authoritative source for Indian equities.`);
      if(v.low52DiffPct!=null && Math.abs(v.low52DiffPct)>5)
        add("warn","52-week low differs from NSE's official adjusted figure",
          `Yahoo-sourced 52-week low differs from NSE's adjusted report by ${sign(v.low52DiffPct)}. NSE figure: ${fmtP(v.nseLow52,s.mkt)}.`);
      if(!v.priceDiffPct && !v.high52DiffPct && !v.low52DiffPct)
        add("good","Cross-checked against NSE","Current price and 52-week range both match NSE's own official figures.");
    }
  }

  const warnCount = checks.filter(c=>c.sev==="warn").length;
  const overall = warnCount>0 ? "Flagged" : checks.some(c=>c.sev==="good") ? "Verified" : "No issues found";
  return { checks, warnCount, overall };
}

/* ============================================================
   LENS RECONCILIATION — when Veteran's Lens and the Decision
   Engine read a stock differently, explain the specific mechanism
   causing the disagreement and state which lens is more relevant
   for the decision at hand, rather than leaving the contradiction
   unexplained.
   ============================================================ */
function reconcileLenses(s, P, D, V){
  const notes = [];

  // 1. Implied growth (Veteran, reverse-DCF vs trailing CAGR) vs the
  //    primary Valuation pillar (Decision Engine, standard conservative DCF)
  if(V.impliedGrowth.score>=60 && P.valuation.score<50){
    const histTxt = V.impliedGrowth.hist!=null ? `${V.impliedGrowth.hist.toFixed(0)}%` : "a very high rate";
    notes.push({
      title:`Why Veteran's Lens says "beatable expectations" but Valuation scores weak`,
      mechanism:`Veteran's Lens compares the growth rate priced in today against ${s.t}'s own trailing FCF CAGR (${histTxt}) — a momentum check against recent history, not a full valuation. The primary DCF instead uses a standard, conservative assumption (10% discount rate, fading to 3% terminal growth over 10 years) and finds the price still asks for more than that conservative case supports.`,
      moreRelevant:`Weight the primary Valuation pillar more heavily for an actual hold/buy decision — sustaining ${histTxt} growth for a full 10-year DCF window is rare for any company. Read the Veteran signal as "priced below its own recent hot streak," not as "cheap" in an absolute sense.`
    });
  }

  // 2. Clean accruals (Veteran, NI vs OCF) vs weak Cash Quality
  //    pillar (Decision Engine, NI vs FCF = OCF minus capex)
  if(V.accruals.score>=55 && P.cashQuality.score<45){
    notes.push({
      title:`Why accruals look "Clean" but Cash Quality scores weak`,
      mechanism:`Accruals compares Net Income to Operating Cash Flow — an accounting-credibility check. Cash Quality compares Net Income to Free Cash Flow, which is Operating Cash Flow minus capex. Reported profit here is trustworthy (OCF tracks NI closely), but capex is consuming the cash before it becomes free cash flow shareholders can actually access.`,
      moreRelevant:`Cash Quality is more relevant for what actually reaches shareholders. Check the capex-intensity figure on the tearsheet — if capex is unusually elevated this year only, this may be a temporary investment phase; if it persists across multiple years, it's a real structural concern the clean-accruals reading alone won't show you.`
    });
  }

  // 3. Overall composite vs quadrant disagreement, when neither of the
  //    specific mechanisms above already explains it
  const compositeHigh = V.composite>=65, compositeLow = V.composite<48;
  const quadrantBearish = D.quadrant==="AVOID FOR NOW" || D.quadrant==="TRAP-RISK VALUE";
  const quadrantBullish = D.quadrant==="PRIME CANDIDATE" || D.quadrant==="QUALITY WATCHLIST";
  if(compositeHigh && quadrantBearish && notes.length===0){
    notes.push({
      title:`Why Veteran's Lens reads well overall but the Decision Engine says avoid`,
      mechanism:`Veteran's Lens scores six specific business-quality characteristics (steadiness, incremental margins, reinvestment effectiveness, and more) largely independent of today's price. The Decision Engine's quadrant explicitly weighs quality against price attractiveness, plus macro and ownership context layered on top.`,
      moreRelevant:`The Decision Engine is more relevant for a fresh capital-allocation decision right now — it's the one actually pricing the business, not just characterizing it. Treat Veteran's Lens as telling you this is a business worth tracking, even if today's price isn't the right entry.`
    });
  } else if(compositeLow && quadrantBullish && notes.length===0){
    notes.push({
      title:`Why the Decision Engine likes this but Veteran's Lens is lukewarm`,
      mechanism:`The Decision Engine's quality composite can score well on recent-period pillars (growth, margins, returns) even when the Veteran lenses — which specifically probe durability across a longer window (steadiness, worst-year resilience, reinvestment effectiveness) — see less consistency underneath.`,
      moreRelevant:`Weight Veteran's Lens more heavily for a multi-year hold — it's specifically testing whether this period's good numbers are a genuine pattern or a one-off. Open the Veteran's Lens breakdown for this stock and see which specific lens is dragging the composite down before trusting the Decision Engine's more recent-weighted read.`
    });
  }

  return notes;
}
