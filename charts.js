/* ============================================================
   CHARTS.JS — tiny SVG chart helpers (no library) + sector
   cycle intelligence knowledge base.
   ============================================================ */

function svgBarChart(series, labels, color, height){
  height = height||130;
  const data=[...series].reverse(), labs=[...labels].reverse();
  const vals=data.map(v=>v||0);
  const max=Math.max(...vals,0), min=Math.min(...vals,0), span=(max-min)||1;
  const zero = max>0&&min<0 ? max/span*100 : (min>=0?100:0);
  const w=data.length?100/data.length:100;
  const bars=data.map((v,i)=>{
    const val=v||0, h=Math.abs(val)/span*100, y=val>=0?zero-h:zero, neg=val<0;
    return `<rect x="${i*w+w*0.18}" width="${w*0.64}" y="${y}" height="${Math.max(h,0.5)}"
      fill="${neg?'#c0392b':color}" opacity="${i===data.length-1?1:0.5}" rx="0.6"/>`;
  }).join("");
  const labelsHtml = labs.map(l=>`<span style="width:${w}%;text-align:center;font-size:10px;color:#8a8a86;font-family:var(--mono)">${l}</span>`).join("");
  return `<div style="width:100%">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block">
      <line x1="0" y1="${zero}" x2="100" y2="${zero}" stroke="#e3e1db" stroke-width="0.5"/>
      ${bars}
    </svg>
    <div style="display:flex">${labelsHtml}</div>
  </div>`;
}

function svgLineChart(datasets, labels, height){
  height = height||150;
  const allLabs=[...labels].reverse();
  const series=datasets.map(d=>({...d,data:[...d.data].reverse()}));
  const flat=series.flatMap(s=>s.data.filter(v=>v!=null));
  const max=Math.max(...flat,0), min=Math.min(...flat,0), span=(max-min)||1;
  const n=allLabs.length;
  const xpos=i=>n>1?i/(n-1)*100:50;
  const ypos=v=>100-((v-min)/span*92+4);
  const lines=series.map(s=>{
    const pts=s.data.map((v,i)=>v==null?null:`${xpos(i)},${ypos(v)}`).filter(Boolean).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
  }).join("");
  const dots=series.map(s=>s.data.map((v,i)=>v==null?"":`<circle cx="${xpos(i)}" cy="${ypos(v)}" r="1.3" fill="${s.color}"/>`).join("")).join("");
  const gridlines=[0.25,0.5,0.75].map(g=>`<line x1="0" y1="${g*100}" x2="100" y2="${g*100}" stroke="#eeece6" stroke-width="0.3"/>`).join("");
  const labelsHtml = allLabs.map(l=>`<span style="font-size:10px;color:#8a8a86;font-family:var(--mono)">${l}</span>`).join("");
  return `<div style="width:100%">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block">
      ${gridlines}${lines}${dots}
    </svg>
    <div style="display:flex;justify-content:space-between;margin-top:4px">${labelsHtml}</div>
  </div>`;
}

function svgSpark(data, w, h){
  w=w||70; h=h||22;
  const d=(data||[]).filter(v=>v!=null).slice().reverse();
  if(d.length<2) return `<svg width="${w}" height="${h}"></svg>`;
  const max=Math.max(...d),min=Math.min(...d),span=(max-min)||1;
  const pts=d.map((v,i)=>`${i/(d.length-1)*w},${h-((v-min)/span*(h-4)+2)}`).join(" ");
  const up=d[d.length-1]>=d[0];
  return `<svg width="${w}" height="${h}" style="display:block">
    <polyline points="${pts}" fill="none" stroke="${up?'#1a8a63':'#c0392b'}" stroke-width="1.4"/>
  </svg>`;
}

/* ============================================================
   PRICE CHART — price history with DCF intrinsic value overlay
   and clickable earnings-date markers. The connective chart that
   ties price, valuation, and earnings reactions together instead
   of leaving them as three separate panels with no visual link.
   ============================================================ */
function svgPriceChart(dates, closes, opts){
  opts = opts || {};
  const height = opts.height || 220;
  const intrinsic = opts.intrinsic, low52 = opts.low52, high52 = opts.high52;
  const earningsDates = opts.earningsDates || []; // [{date:"YYYY-MM-DD"}]

  const n = closes.length;
  if(n < 2) return null;

  const allVals = closes.filter(v=>v!=null).slice();
  if(intrinsic!=null) allVals.push(intrinsic);
  if(low52!=null) allVals.push(low52);
  if(high52!=null) allVals.push(high52);
  if(!allVals.length) return null;
  const max = Math.max(...allVals), min = Math.min(...allVals);
  const pad = (max-min)*0.08 || max*0.05 || 1;
  const vmax = max+pad, vmin = Math.max(0, min-pad);
  const span = (vmax-vmin) || 1;

  const xpos = i => n>1 ? i/(n-1)*100 : 50;
  const ypos = v => 100 - ((v-vmin)/span*90 + 5);

  const bandHtml = (low52!=null && high52!=null) ?
    `<rect x="0" y="${ypos(high52).toFixed(2)}" width="100" height="${(ypos(low52)-ypos(high52)).toFixed(2)}" fill="#0e6e5c" opacity="0.06"/>` : "";

  const pricePts = closes.map((v,i)=>v==null?null:`${xpos(i).toFixed(2)},${ypos(v).toFixed(2)}`).filter(Boolean).join(" ");
  const priceLine = `<polyline points="${pricePts}" fill="none" stroke="#0e6e5c" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;

  const intrinsicLine = intrinsic!=null ?
    `<line x1="0" y1="${ypos(intrinsic).toFixed(2)}" x2="100" y2="${ypos(intrinsic).toFixed(2)}" stroke="#6d5dd3" stroke-width="1" stroke-dasharray="2,1.5" vector-effect="non-scaling-stroke"/>` : "";

  const closestIdx = targetDate => {
    let best=0, bestDiff=Infinity;
    const t = new Date(targetDate).getTime();
    dates.forEach((dt,i)=>{ const diff=Math.abs(new Date(dt).getTime()-t); if(diff<bestDiff){bestDiff=diff;best=i;} });
    return best;
  };
  const markers = earningsDates.map(ed=>{
    const idx = closestIdx(ed.date);
    if(closes[idx]==null) return "";
    return `<circle cx="${xpos(idx).toFixed(2)}" cy="${ypos(closes[idx]).toFixed(2)}" r="1.9" fill="#b8860b" stroke="#fff" stroke-width="0.6" data-earningmarker="${ed.date}" style="cursor:pointer"><title>Earnings: ${ed.date}</title></circle>`;
  }).join("");

  const gridlines=[0.25,0.5,0.75].map(g=>`<line x1="0" y1="${g*100}" x2="100" y2="${g*100}" stroke="#eeece6" stroke-width="0.3"/>`).join("");
  const labelDates = n>=3 ? [dates[0], dates[Math.floor(n/2)], dates[n-1]] : [dates[0], dates[n-1]];

  return `<div style="width:100%">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block">
      ${bandHtml}${gridlines}${intrinsicLine}${priceLine}${markers}
    </svg>
    <div style="display:flex;justify-content:space-between;margin-top:4px">
      ${labelDates.map(d=>`<span style="font-size:10px;color:#8a8a86;font-family:var(--mono)">${d}</span>`).join("")}
    </div>
  </div>`;
}


/* ============================================================
   SECTOR CYCLE INTELLIGENCE — same knowledge base as before.
   ============================================================ */
const MACRO_DRIVERS=[
  {id:"crude",name:"Crude oil",
   helpsWhenDown:["Paints","Airlines","Tyres","Logistics","Consumer staples","Aviation"],
   hurtsWhenDown:["Oil & gas E&P","Energy"],
   why:"Crude is a direct raw material (paints, tyres, plastics, fertilisers) and the biggest cost line for transport. When it falls, their input costs drop and margins expand — often before it shows in price. Upstream oil producers earn less.",
   example:"Crude −20% → paint-makers' margins typically expand 2-4 points over 1-2 quarters."},
  {id:"rates",name:"Interest rates",
   helpsWhenDown:["Real estate","Autos","NBFCs","Capital goods","Banks (lending volume)","Technology"],
   hurtsWhenDown:["Banks (margin)","Insurance"],
   why:"Rates are the price of money. Falling rates cut EMIs and unlock big-ticket demand. They also lift the present value of future profits, helping long-duration growth stocks. Lenders see more volume but thinner spreads.",
   example:"Rate-cut cycle → autos and real estate usually lead the recovery."},
  {id:"inr",name:"INR / USD",
   helpsWhenDown:["IT services","Pharma (exports)","Specialty chemicals","Textiles"],
   hurtsWhenDown:["Oil importers","Airlines","Capital goods (imports)"],
   why:"A weaker rupee means exporters earn more rupees per dollar of revenue — pure margin tailwind for IT and pharma. Importers pay more for the same goods.",
   example:"₹ depreciates 5% → IT-services EBITDA margins get roughly a 1.5-2 point mechanical lift."},
  {id:"metals",name:"Industrial metals",
   helpsWhenDown:["Autos","Consumer durables","Capital goods","Construction","Infrastructure"],
   hurtsWhenDown:["Metals & mining","Steel"],
   why:"Steel, aluminium and copper are inputs for anyone who builds things. Cheaper metals lift margins for autos and infra. Miners and steelmakers earn less.",
   example:"Steel prices soften → auto-component margins improve with a 1-quarter lag."},
  {id:"growth",name:"Economic growth (GDP)",upDriver:true,
   helpsWhenUp:["Banks","Capital goods","Autos","Consumer discretionary","Industrials","Real estate"],
   hurtsWhenUp:["Consumer staples (relative)","Gold","Utilities (relative)"],
   why:"In an expansion, cyclicals lead — banks lend more, factories order machines, people travel. Defensives still grow but lag as investors rotate into growth.",
   example:"Early-cycle upturn → financials and industrials outperform; late-cycle → rotate toward staples."},
];
const SECTOR_PROFILE={
  "Technology":{cyc:"Growth/Cyclical",drivers:["INR weak ↑","Rates low ↑"],defensiveness:35,note:"Exporter economics; long-duration so rate-sensitive."},
  "Energy":{cyc:"Cyclical",drivers:["Crude high ↑"],defensiveness:30,note:"Earnings track crude and refining spreads."},
  "Financial Services":{cyc:"Cyclical",drivers:["Growth ↑"],defensiveness:25,note:"A geared play on the economy."},
  "Consumer":{cyc:"Defensive",drivers:["Crude low ↑"],defensiveness:80,note:"Steady demand; input costs drive the margin cycle."},
  "Cons":{cyc:"Defensive",drivers:["Crude low ↑"],defensiveness:78,note:"Steady demand through cycles."},
  "Health":{cyc:"Defensive",drivers:["INR weak ↑"],defensiveness:75,note:"Inelastic demand; exporters gain from a weak rupee."},
  "Comm":{cyc:"Growth",drivers:["Rates low ↑"],defensiveness:45,note:"Subscriber and ad-revenue driven."},
  "Indus":{cyc:"Cyclical",drivers:["Growth ↑","Metals low ↑"],defensiveness:30,note:"Order books track capex spending."},
  "Fin":{cyc:"Cyclical",drivers:["Growth ↑"],defensiveness:25,note:"Geared to credit growth and asset quality."},
  "Tech":{cyc:"Growth",drivers:["INR weak ↑","Rates low ↑"],defensiveness:35,note:"Exporter economics; rate-sensitive."},
};
function profileFor(sec){return SECTOR_PROFILE[sec]||{cyc:"—",drivers:[],defensiveness:50,note:"Cycle profile not classified for this label."};}
const CYCLE_PHASES=[
  {ph:"Early recovery",desc:"Rates falling, growth bottoming and turning up.",lead:["Financials","Autos","Real estate","Consumer discretionary"],lag:["Utilities","Staples"]},
  {ph:"Mid expansion",desc:"Growth accelerating, capex returning, rates stable.",lead:["Industrials","Capital goods","Technology","Materials"],lag:["Bonds","Gold"]},
  {ph:"Late cycle",desc:"Growth strong but peaking, inflation/rates rising.",lead:["Energy","Materials","Staples"],lag:["Discretionary","Real estate"]},
  {ph:"Slowdown / recession",desc:"Growth contracting, rates being cut.",lead:["Consumer staples","Healthcare","Utilities","Gold"],lag:["Financials","Industrials","Discretionary"]},
];

/* ============================================================
   COMBINATIONS PLAYBOOK — named, multi-metric patterns an analyst
   actually looks for, each with a formula, meaning, and a live
   test function run against every stock's already-computed fields
   (from analyze() in engine.js). No new data needed — pure
   cross-referencing of what's already on the tearsheet.
   ============================================================ */
/* helper: where does this stock's P/E rank within its own sector (0=cheapest, 1=priciest) */
function sectorPEQuartile(stock, rows){
  if(!rows || stock.pe==null || stock.pe<=0) return null;
  const peers = rows.filter(s=>s.sec===stock.sec && s.pe!=null && s.pe>0 && s.pe<200);
  if(peers.length<3) return null;
  const sorted = peers.map(s=>s.pe).sort((a,b)=>a-b);
  const rank = sorted.filter(pe=>pe<=stock.pe).length;
  return rank / sorted.length;
}

const PLAYBOOK = [
  /* ---------------- GROWTH QUALITY ---------------- */
  {id:"compounder", cat:"Growth quality", name:"The Compounder",
   formula:"Revenue YoY > 10%  AND  FCF YoY > 10%  AND  margin trend ≥ 0",
   meaning:"Revenue and cash flow are growing together at double digits, without sacrificing margin. This is the cleanest, highest-quality growth pattern that exists — the business is scaling without losing efficiency.",
   read:"When you find this, the main risk isn't the business — it's overpaying. Check the DCF gap and sector-relative P/E before acting; a great compounder at a rich price can still be a poor trade.",
   test:s=>s.revG!=null&&s.revG>10 && s.fcfG!=null&&s.fcfG>10 && (s.marginTrend==null||s.marginTrend>=0)},

  {id:"mirage", cat:"Growth quality", name:"The Growth Mirage",
   formula:"Revenue YoY > 8%  AND  FCF YoY < 0",
   meaning:"Sales are climbing but cash generation is going the other way. Revenue can be booked before cash arrives — this pattern usually means receivables are building, inventory is piling up, or capex has quietly ramped.",
   read:"Not automatically bad — could be a deliberate investment phase. But if this persists more than 2-3 quarters, the 'growth' is optical rather than real. Check the Cash Bridge chart to see exactly where the gap comes from.",
   test:s=>s.revG!=null&&s.revG>8 && s.fcfG!=null&&s.fcfG<0},

  {id:"decel_trap", cat:"Growth quality", name:"The Deceleration Trap",
   formula:"Revenue growth still positive  AND  Rev growth Δ < -5pts  AND  P/E in top half of sector",
   meaning:"Still growing, but the growth rate is visibly slowing, while the market is still paying a premium multiple as if the old growth rate will continue.",
   read:"Markets price the change in growth, not the growth itself. This is the single most common trigger for a expensive stock re-rating down, even while headline growth stays positive. High risk of disappointment at the next print.",
   test:s=>s.revG!=null&&s.revG>0 && s.revDecel!=null&&s.revDecel<-5 && s.pe!=null&&s.pe>25},

  {id:"leverage_engine", cat:"Growth quality", name:"Operating Leverage Engine",
   formula:"Revenue YoY > 5%  AND  operating margin trend > +1.5pts",
   meaning:"Costs are growing meaningfully slower than revenue — the classic signature of a business getting more profitable simply by getting bigger, with no change in strategy needed.",
   read:"This tends to compound: once leverage kicks in, it often continues for several quarters as fixed costs stay flat. Worth checking how many more quarters of this runway plausibly remain before margins normalize.",
   test:s=>s.revG!=null&&s.revG>5 && s.opMarginTrend!=null&&s.opMarginTrend>1.5},

  /* ---------------- CASH & EARNINGS QUALITY ---------------- */
  {id:"cash_king", cat:"Cash & earnings quality", name:"Cash King",
   formula:"FCF/NI > 1.2  AND  FCF yield > 6%  AND  net debt < 0 (net cash)",
   meaning:"Profit is more than fully backed by cash, that cash is a large fraction of the market price, and there's no debt dragging on the balance sheet. This is about as clean a cash profile as exists.",
   read:"These businesses can fund buybacks, dividends, or acquisitions entirely from their own operations. The question becomes capital allocation skill, not survival — check what management actually does with the cash.",
   test:s=>s.fcfNi!=null&&s.fcfNi>1.2 && s.fcfYield!=null&&s.fcfYield>6 && s.debt<0},

  {id:"earnings_mirage", cat:"Cash & earnings quality", name:"Earnings Mirage",
   formula:"Net income YoY > 5%  AND  FCF/NI < 0.7",
   meaning:"Reported profit is growing, but only about 70 cents of every accounting dollar shows up as real cash. The earnings growth may be partly built on non-cash items or aggressive recognition.",
   read:"This is one of the more reliable predictors of a future earnings disappointment or restatement. Treat the P/E on this stock with real skepticism — it's priced off a profit number that isn't fully real yet.",
   test:s=>s.niG!=null&&s.niG>5 && s.fcfNi!=null&&s.fcfNi<0.7},

  {id:"self_funding", cat:"Cash & earnings quality", name:"Self-Funding Compounder",
   formula:"FCF > 3× Capex  AND  ROE > 15%",
   meaning:"The business generates several times what it spends on maintaining and growing itself, while also earning strong returns on shareholder capital. It doesn't need debt or new shares to fund its own growth.",
   read:"Structurally the most independent kind of company — immune to a shut credit market or a weak IPO window. Worth a premium multiple relative to a similar business that depends on external financing.",
   test:s=>{const A=s.annual; const capex0=A?.capex?.[0]; const fcf0=A?.fcf?.[0]; return capex0&&fcf0&&Math.abs(capex0)>0 && (fcf0/Math.abs(capex0))>3 && s.roe!=null&&s.roe>15;}},

  /* ---------------- VALUATION CROSS ---------------- */
  {id:"qfp2", cat:"Valuation cross", name:"Quality at a Fair Price",
   formula:"ROE > 18%  AND  FCF/NI ≥ 0.9  AND  DCF gap > 10%  AND  FCF growing",
   meaning:"A genuinely good business — strong returns, real cash backing — trading below its own estimated intrinsic value while still growing. The rare overlap of 'great' and 'cheap.'",
   read:"This combination is uncommon by design; markets are usually decent at pricing obvious quality fairly. When it appears, ask what the market is worried about that the numbers don't yet show — sometimes it's a real, temporary concern worth understanding before buying.",
   test:s=>s.roe!=null&&s.roe>18 && (s.fcfNi==null||s.fcfNi>=0.9) && (s.debtToEbitda==null||s.debtToEbitda<2.5) && s.mos!=null&&s.mos>10 && s.fcfG!=null&&s.fcfG>0},

  {id:"value_trap", cat:"Valuation cross", name:"Value Trap Warning",
   formula:"P/E in bottom quartile of sector  AND  Revenue YoY < 0  AND  FCF YoY < 0",
   meaning:"Looks statistically cheap, but both the top line and cash generation are shrinking. Cheap for a reason, not cheap by accident — the classic value trap pattern.",
   read:"A low multiple on a shrinking business often gets cheaper, not more expensive, because the E in P/E keeps falling too. Verify there's a specific, identifiable turnaround catalyst before treating this as opportunity rather than decline.",
   test:(s,ctx)=>{ if(s.pe==null||s.pe<=0) return false; const q=sectorPEQuartile(s,ctx.rows); return q!=null&&q<=0.25 && s.revG!=null&&s.revG<0 && s.fcfG!=null&&s.fcfG<0; }},

  {id:"priced_perfection", cat:"Valuation cross", name:"Priced for Perfection",
   formula:"DCF gap < -25%  AND  Rev growth Δ < 0  AND  P/E in top quartile of sector",
   meaning:"Trading well above estimated intrinsic value, growth is already decelerating, and the market multiple assumes flawless continued execution.",
   read:"The risk here is asymmetric — limited extra upside if things go right, sharp downside if they go merely okay instead of great. Worth explicitly asking: what does the current price require to be true for the next 3 years?",
   test:(s,ctx)=>{ const q=sectorPEQuartile(s,ctx.rows); return s.mos!=null&&s.mos<-25 && s.revDecel!=null&&s.revDecel<0 && q!=null&&q>=0.75; }},

  {id:"hidden_compounder", cat:"Valuation cross", name:"Hidden Compounder",
   formula:"P/E in bottom half of sector  AND  ROE > 18%  AND  FCF growing",
   meaning:"Earning strong returns on capital, with cash flow still expanding, yet priced below sector-typical multiples. Either overlooked, or the market has a concern not yet visible in the numbers.",
   read:"Worth a full Stage 3 deep-dive (see the tutorial) specifically to figure out which of those two it is. If the concern turns out to be temporary or already-priced-in, this is exactly the setup where patient capital gets rewarded.",
   test:(s,ctx)=>{ const q=sectorPEQuartile(s,ctx.rows); return s.roe!=null&&s.roe>18 && s.fcfG!=null&&s.fcfG>0 && q!=null&&q<=0.5; }},

  {id:"garp", cat:"Valuation cross", name:"Growth at a Reasonable Price",
   formula:"PEG < 1.0  AND  Revenue YoY > 10%",
   meaning:"The P/E is low relative to how fast earnings are actually growing — you're not paying a premium for the growth you're getting, a classic GARP setup.",
   read:"PEG is only as good as the growth estimate behind it — make sure the growth rate used is sustainable, not one unusually strong quarter. Avoid leaning on this signal for cyclicals or financials, where PEG is less meaningful.",
   test:s=>s.peg!=null&&s.peg<1 && s.revG!=null&&s.revG>10},

  /* ---------------- BALANCE SHEET & RETURNS ---------------- */
  {id:"fortress", cat:"Balance sheet & returns", name:"Fortress Compounder",
   formula:"Net cash (debt < 0)  AND  ROE > 20%  AND  FCF growing",
   meaning:"No debt, strong returns on capital, and cash generation still expanding. Maximum resilience combined with genuine quality — a company that controls its own destiny in any environment.",
   read:"These names tend to underperform in speculative, risk-on rallies (nothing to lever up) and meaningfully outperform in downturns and credit crunches. Useful as a core holding precisely because it needs the least monitoring.",
   test:s=>s.debt<0 && s.roe!=null&&s.roe>20 && s.fcfG!=null&&s.fcfG>0},

  {id:"leveraged_fragility", cat:"Balance sheet & returns", name:"Leveraged Fragility",
   formula:"Net debt/EBITDA > 3.5×  AND  FCF YoY < 0  AND  margin trend < 0",
   meaning:"High debt load, shrinking cash flow, and compressing margins — all three moving the wrong direction at once. Each alone is manageable; together they compound risk quickly.",
   read:"This is the profile that precedes real financial distress if it continues. Check covenant language if available, and treat any further deterioration as a serious warning rather than noise.",
   test:s=>s.debtToEbitda!=null&&s.debtToEbitda>3.5 && s.fcfG!=null&&s.fcfG<0 && s.marginTrend!=null&&s.marginTrend<0},

  {id:"borrowed_returns", cat:"Balance sheet & returns", name:"Borrowed Returns",
   formula:"ROE > 15%  AND  ROA < 3%  AND  net debt > 0",
   meaning:"Return on equity looks strong, but return on total assets is thin — the gap is leverage doing the work, not the underlying operations.",
   read:"Normal and expected for banks (don't flag this for financials). For a non-financial company, this means the 'quality' implied by ROE alone is partly manufactured — check ROA directly rather than trusting ROE in isolation.",
   test:s=>s.roe!=null&&s.roe>15 && s.roa!=null&&s.roa<3 && s.debt>0 && s.sec!=="Financial Services" && s.sec!=="Fin"},

  /* ---------------- OWNERSHIP & SENTIMENT ---------------- */
  {id:"insider_conviction", cat:"Ownership & sentiment", name:"Insider Conviction",
   formula:"Insider/promoter stake rising  AND  FCF growing  AND  DCF gap > 0",
   meaning:"The people who know the business best are buying more of it with their own money, cash flow is expanding, and the stock is trading below estimated value. Three independent positive signals pointing the same direction.",
   read:"Insider buying is one of the highest-conviction signals available precisely because it's costly and voluntary. Combined with cash growth and a valuation cushion, this is close to the strongest setup the dashboard can surface.",
   test:s=>s.insiderTrend!=null&&s.insiderTrend>1 && s.fcfG!=null&&s.fcfG>0 && s.mos!=null&&s.mos>0},

  {id:"smart_money_exit", cat:"Ownership & sentiment", name:"Smart Money Exit",
   formula:"Insider/promoter stake falling  AND  Revenue YoY < 0  AND  FCF YoY < 0",
   meaning:"Insiders are reducing their stake at the same time the business itself is shrinking on both the top line and cash generation. Three negative signals reinforcing each other.",
   read:"Insider selling alone isn't automatically bearish (could be diversification or estate planning) — but paired with genuinely weakening fundamentals, it removes the benefit of the doubt. Worth checking if the selling was open-market or a pledge/forced sale.",
   test:s=>s.insiderTrend!=null&&s.insiderTrend<-1 && s.revG!=null&&s.revG<0 && s.fcfG!=null&&s.fcfG<0},

  /* ---------------- MACRO CROSS ---------------- */
  {id:"macro_tailwind_compounder", cat:"Macro cross", name:"Macro Tailwind Compounder",
   formula:"ROE > 18%  AND  FCF growing  AND  sector macro read = tailwind",
   meaning:"A genuinely good business that also happens to have the current rate/crude/currency environment working in its favor right now, not just its own fundamentals.",
   read:"Two independent things are pointing the same way — but remember macro tailwinds can reverse faster than fundamentals do. Don't mistake a temporary cyclical assist for permanent quality; re-check this one if the macro backdrop shifts.",
   test:(s,ctx)=>{ if(!ctx.macro) return false; const m=macroRead(s,ctx.macro); return s.roe!=null&&s.roe>18 && s.fcfG!=null&&s.fcfG>0 && m&&m.score>=1; }},

  {id:"fighting_tide", cat:"Macro cross", name:"Fighting the Tide",
   formula:"ROE > 18%  AND  FCF growing  AND  sector macro read = headwind",
   meaning:"Strong underlying business, but currently working against an unfavorable rate/currency/commodity backdrop for its sector. Good company, bad timing.",
   read:"These often become the Insider Conviction or Hidden Compounder setups a few quarters later, once the macro backdrop normalizes — worth watching rather than dismissing, but timing entry around the macro read matters here more than usual.",
   test:(s,ctx)=>{ if(!ctx.macro) return false; const m=macroRead(s,ctx.macro); return s.roe!=null&&s.roe>18 && s.fcfG!=null&&s.fcfG>0 && m&&m.score<=-1; }},

  /* ---------------- MOMENTUM & REVERSION ---------------- */
  {id:"beaten_down", cat:"Momentum & reversion", name:"Beaten Down But Sound",
   formula:"52wk range position < 25%  AND  Revenue YoY > 0  AND  FCF/NI ≥ 0.9",
   meaning:"Trading near its 52-week low, yet revenue is still growing and cash conversion remains healthy. The price action and the fundamentals are telling different stories.",
   read:"Worth investigating why the price fell — a sector-wide selloff dragging a sound company down with weaker peers is a very different situation from company-specific bad news that hasn't shown up in the numbers yet. Check the Sources panel for recent news before concluding it's an overreaction.",
   test:s=>s.pricePos!=null&&s.pricePos<25 && s.revG!=null&&s.revG>0 && (s.fcfNi==null||s.fcfNi>=0.9)},

  {id:"momentum_no_substance", cat:"Momentum & reversion", name:"Momentum Without Substance",
   formula:"52wk range position > 85%  AND  Rev growth Δ < 0  AND  DCF gap < -15%",
   meaning:"Trading near its 52-week high, growth is already decelerating, and the price sits well above estimated value. The stock's momentum has outrun its fundamentals.",
   read:"Not a prediction of an imminent fall — momentum can persist longer than fundamentals justify. But the risk/reward here is skewed: you're paying a high price for a growth rate that's already slowing, with limited margin for disappointment.",
   test:s=>s.pricePos!=null&&s.pricePos>85 && s.revDecel!=null&&s.revDecel<0 && s.mos!=null&&s.mos<-15},

  {id:"turnaround", cat:"Momentum & reversion", name:"The Turnaround Candidate",
   formula:"Quarterly revenue accelerating (QoQ > prior QoQ)  AND  DCF gap > 0",
   meaning:"The most recent quarter shows sequential improvement versus the one before it, while the stock still trades below estimated intrinsic value — an early sign the business may be inflecting before the market has caught up.",
   read:"One quarter of improvement is a data point, not a trend — check it holds for 2+ quarters before treating it as confirmed. If it does, this is often the earliest, cheapest point to notice a genuine turnaround.",
   test:s=>{const q=s.quarterly?.revenue; if(!q||q.length<3) return false; const latest=yoy(q), prior=yoy(q.slice(1)); return latest!=null&&prior!=null&&latest>prior && s.mos!=null&&s.mos>0;}},
];

const PLAYBOOK_CATEGORIES = [...new Set(PLAYBOOK.map(p=>p.cat))];

