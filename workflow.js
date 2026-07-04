/* ============================================================
   WORKFLOW.JS — the guided filtration funnel.

   A separate tab that walks a learner through shortlisting in
   explicit stages. Every stage follows the same contract:

     VALIDATE  — is the premise of this stage trustworthy?
     EXPLAIN   — what does this filter check, what failure mode
                 does it catch (with a real-world example), and
                 why the PREVIOUS stage could not have caught it
     APPLY     — run named conditions against the survivors,
                 show pass/fail per stock WITH the reason,
                 and issue a re-entry ticket for every reject

   Stage 0 is selection (market -> index -> sector). Stage 1
   (Data Integrity) is fully implemented. Stages 2-6 render as
   teaching previews with their planned conditions listed,
   pending approval of the condition map. Adding a stage later
   means filling in its `conditions` array — the engine,
   roster UI, tickets, and progress rail are already generic.
   ============================================================ */

/* ---------- classification.json (NSE index membership) ---------- */
let CLASSIFICATION = null;
fetch("classification.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  CLASSIFICATION = d;
  if (typeof render === "function") render();
}).catch(()=>{ /* fine — Stage 0 falls back to "all fetched Nifty names" */ });

let PLEDGING_DATA = null;
fetch("pledging.json").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  PLEDGING_DATA = d.symbols || d;
  if (typeof render === "function") render();
}).catch(()=>{ /* fine — the pledging condition reports honestly as unverified */ });

const IN_INDEX_LABELS = {
  NIFTY50:"Nifty 50", NIFTY100:"Nifty 100", NIFTY200:"Nifty 200", NIFTY500:"Nifty 500",
  NIFTYMIDCAP150:"Nifty Midcap 150", NIFTYSMALLCAP250:"Nifty Smallcap 250",
  NIFTYBANK:"Nifty Bank", NIFTYIT:"Nifty IT", NIFTYPHARMA:"Nifty Pharma",
  NIFTYAUTO:"Nifty Auto", NIFTYFMCG:"Nifty FMCG", NIFTYMETAL:"Nifty Metal",
  NIFTYENERGY:"Nifty Energy", NIFTYREALTY:"Nifty Realty",
};

/* ---------- funnel state (persisted) ---------- */
const FUNNEL_DEFAULT = {
  market:null, index:null, sector:"ALL",
  stage:0,                 // current stage the user is on
  readAck:{},              // stageId -> true once teaching card acknowledged
  stageResults:{},         // stageId -> {pass:[t], fail:[{t,n,reasons}], ranAt}
  tickets:[],              // re-entry tickets for rejected stocks
};
function loadFunnel(){
  try { return Object.assign({}, FUNNEL_DEFAULT, JSON.parse(localStorage.getItem("terminal_funnel")||"{}")); }
  catch(e){ return Object.assign({}, FUNNEL_DEFAULT); }
}
function saveFunnel(){ try{ localStorage.setItem("terminal_funnel", JSON.stringify(State.funnel)); }catch(e){} }
function resetFunnel(keepTickets){
  const tickets = keepTickets ? (State.funnel?.tickets||[]) : [];
  State.funnel = Object.assign({}, FUNNEL_DEFAULT, {tickets});
  saveFunnel();
}

/* ---------- universe slicing (Stage 0's output) ---------- */
function funnelUniverse(rows){
  const f = State.funnel;
  let r = rows.filter(s => f.market==="IN" ? s.mkt==="IN" : f.market==="US" ? s.mkt==="US" : false);
  if (f.market==="IN" && f.index && f.index!=="NIFTYALL" && CLASSIFICATION?.indices?.[f.index]){
    const set = new Set(CLASSIFICATION.indices[f.index]);
    r = r.filter(s=>set.has(s.t));
  }
  if (f.sector && f.sector!=="ALL") r = r.filter(s=>s.sec===f.sector);
  return r;
}

/* ============================================================
   STAGE DEFINITIONS
   Each condition.test(s, ctx) returns:
     {status:"pass"|"fail"|"na", reason, reentry}
   "na" = honestly not assessable for this stock (missing data,
   or check not applicable) — it does NOT fail the stock, but is
   shown so the learner sees what couldn't be verified.
   ============================================================ */
const FUNNEL_STAGES = [
  { id:0, name:"Choose your hunting ground", short:"Select",
    teach:{
      what:"Pick the market, the index, and (optionally) one sector before any filtering begins.",
      why:"Every later comparison — 'is this margin good?', 'is this P/E cheap?' — only means something RELATIVE to a peer group. A 5% margin is terrible for software and excellent for a supermarket. Choosing the pond first is what makes every later judgment fair.",
      example:"Comparing TCS's 25% margin to a refiner's 4% tells you nothing about which is better run — they play different games. Comparing TCS to Infosys and HCL tells you something real.",
      whyPrev:"This is the foundation — there is no previous stage. But notice what it already teaches: no number is good or bad in isolation.",
    },
  },
  { id:1, name:"Data Integrity", short:"Integrity",
    question:"Can I trust these numbers at all?",
    teach:{
      what:"Before judging the business, judge the DATA. This stage checks that the numbers agree with themselves (does market cap = price × shares? is the 52-week range physically plausible?) and, where possible, against the primary source — the company's own SEC filing for US stocks, NSE's own official figures for Indian stocks.",
      why:"If the input is wrong, every conclusion built on it is wrong — no matter how sophisticated the analysis. Free data aggregators are genuinely good, but they have known failure modes: stale quotes, share counts that lag a buyback, and above all historical prices that were never adjusted after a demerger or split.",
      example:"This dashboard's own history: Yahoo showed Vedanta with a 52-week high nearly double the real one, because the price series wasn't adjusted after a demerger. Every 'how far below its high?' signal for that stock was garbage until the integrity check caught it. Data errors don't announce themselves — you have to hunt them.",
      whyPrev:"Nothing comes before this, deliberately. Running a quality screen on a wrong number isn't analysis — it's astrology with extra steps.",
    },
    conditions:[
      { id:"internal", label:"Numbers reconcile internally",
        layman:"The figures must agree with each other: market cap should equal price × shares; the 52-week high shouldn't be double today's price (the classic sign of an unadjusted demerger); a P/E should roughly match profit ÷ shares. When a company's own numbers contradict each other, at least one of them is wrong.",
        test:(s)=>{
          const di = dataIntegrityChecks(s, null, null); // internal checks only
          const warns = di.checks.filter(c=>c.sev==="warn");
          if(!warns.length) return {status:"pass", reason:"All internal consistency checks passed."};
          return {status:"fail",
            reason: warns.map(w=>w.label).join(" · "),
            reentry:"Passes when the flagged figure is corrected or confirmed on a future data refresh — internal contradictions usually resolve when the aggregator catches up with a corporate action (split, demerger, buyback)."};
        }},
      { id:"external", label:"Matches the primary source",
        layman:"Where we have the company's OWN filed numbers (SEC for US, NSE for India), the aggregator's figures must match them within tolerance. When they disagree, the filing wins — it's the company's own signed statement, and the aggregator is just a copy of it.",
        test:(s)=>{
          const vUS = (typeof VERIFY_US!=="undefined") ? VERIFY_US : null;
          const vIN = (typeof VERIFY_IN!=="undefined") ? VERIFY_IN : null;
          const hasVerify = (s.mkt==="US" && vUS && vUS[s.t]) || (s.mkt==="IN" && vIN && vIN[s.t]);
          if(!hasVerify) return {status:"na", reason:"No primary-source cross-check loaded for this stock yet (run fetch_verify_us.py / fetch_verify_in.py) — not counted against it, but be aware it is unverified."};
          const di = dataIntegrityChecks(s, vUS, vIN);
          const extWarns = di.checks.filter(c=>c.sev==="warn" && /SEC|NSE/.test(c.label));
          if(!extWarns.length) return {status:"pass", reason:"Figures match the company's own filed numbers within normal tolerance."};
          return {status:"fail",
            reason: extWarns.map(w=>w.label).join(" · "),
            reentry:"Passes when the aggregator's figure converges with the filed figure on a future refresh — or when you've manually confirmed the filing and decided which number to trust."};
        }},
    ],
  },
  { id:2, name:"Forensic Honesty", short:"Forensics",
    question:"Are the numbers real, or manufactured?",
    teach:{
      what:"Statistical fraud-detection: the Beneish M-Score (the pattern of companies later caught manipulating earnings), the accruals smell test (is reported profit backed by actual cash?), the Altman distress score where applicable, promoter share pledging (India), and serial share dilution.",
      why:"Cheap-and-fraudulent is the most expensive mistake in investing, because every other metric of a manipulated company is fiction. You must check honesty BEFORE quality: a fake 40% ROE screens beautifully.",
      example:"Satyam (2009): ₹5,000+ crore of cash on the balance sheet simply did not exist. It passed every quality screen right up until it didn't. The Beneish-style accrual patterns were visible earlier than the confession.",
      whyPrev:"Stage 1 checked the numbers were TRANSCRIBED correctly — that the copy matches the original. This stage asks whether the original itself is telling the truth. An audited, correctly-copied lie sails through Stage 1.",
    },
    conditions:[
      { id:"beneish", label:"No earnings-manipulation pattern (Beneish M < −1.78)",
        layman:"Eight ratios that, in combination, matched companies later caught cooking their books — receivables growing faster than sales, fading margins papered over, profit running far ahead of cash. Above −1.78 doesn't prove fraud; it means the statistical fingerprint is present and the burden of proof shifts to the company.",
        test:(s)=>{
          const f = forensicScores(s);
          if(f.beneish?.score==null) return {status:"na", reason: s.sec==="Financial Services" ? "Not computed for financials (their balance sheets don't carry the required fields in comparable form)." : "Missing one or more required inputs (receivables, COGS, PPE, depreciation, SG&A history) — shown as unverified, not failed."};
          if(!f.beneish.flagged) return {status:"pass", reason:`M-Score ${f.beneish.score} — below the −1.78 manipulation-pattern threshold.`};
          return {status:"fail", reason:`M-Score ${f.beneish.score} — above −1.78: the statistical pattern of past manipulators is present.`,
            reentry:"Passes when next annual results bring M back below −1.78 — usually receivables normalizing against sales or the accrual wedge unwinding."};
        }},
      { id:"accruals", label:"Profit is backed by cash (accrual wedge < 8% of revenue)",
        layman:"Profit is an opinion; cash is a fact. When reported profit persistently runs far ahead of the cash actually arriving, decades of research (the Sloan anomaly) show these companies systematically disappoint later.",
        test:(s)=>{
          const v = veteranMetrics(s);
          if(v.accruals?.acc==null) return {status:"na", reason:"Not enough net-income / operating-cash history to measure the wedge."};
          if(v.accruals.acc < 8) return {status:"pass", reason:`Accruals ${v.accruals.acc.toFixed(1)}% of revenue — profit and cash tell the same story.`};
          return {status:"fail", reason:`Reported profit runs ${v.accruals.acc.toFixed(1)}% of revenue ahead of operating cash — a persistent accrual wedge.`,
            reentry:"Passes when the average wedge falls back below 8% of revenue on updated results — watch whether receivables/inventory stop outgrowing sales."};
        }},
      { id:"altman", label:"Not in statistical distress (Altman Z / Z″)",
        layman:"A bankruptcy-pattern score built from working capital, retained earnings, operating profit and leverage. Distress-zone companies statistically resemble firms that failed within about two years. Banks are exempt — the formula was never built for them.",
        test:(s)=>{
          const f = forensicScores(s);
          if(f.altman?.notApplicable) return {status:"na", reason:"Not applicable to financial companies — leverage is their business model; judge them on ROA, capital adequacy and asset quality instead."};
          if(f.altman?.score==null) return {status:"na", reason:"Missing balance-sheet fields for this stock — unverified, not failed."};
          if(f.altman.zone!=="Distress zone") return {status:"pass", reason:`${f.altman.variant}: ${f.altman.score} — ${f.altman.zone}.`};
          return {status:"fail", reason:`${f.altman.variant}: ${f.altman.score} — Distress zone.`,
            reentry:"Passes when the score climbs out of the distress zone — via debt reduction, an equity raise, or an earnings recovery. The ticket re-tests on every data refresh."};
        }},
      { id:"pledging", label:"Promoter pledging under control (India: < 50% of promoter holding)",
        layman:"Promoters borrowing against their own shares creates a doomsday loop: if the stock falls, lenders sell the pledged shares, which makes it fall more. Heavy pledging can destroy a fundamentally fine company's stock — the business is fine, the shareholding structure is the bomb.",
        test:(s)=>{
          if(s.mkt!=="IN") return {status:"na", reason:"India-specific check (US insider pledging is disclosed differently and is rarer at scale)."};
          const P = (typeof PLEDGING_DATA!=="undefined" && PLEDGING_DATA) ? PLEDGING_DATA[s.t] : null;
          if(!P || P.pledgedPctOfPromoter==null) return {status:"na", reason:"Pledging data not loaded for this stock — run fetch_pledging.py. Unverified, not failed: check the shareholding pattern on NSE before buying."};
          if(P.pledgedPctOfPromoter < 20) return {status:"pass", reason:`${P.pledgedPctOfPromoter.toFixed(1)}% of promoter holding pledged — comfortably low.`};
          if(P.pledgedPctOfPromoter < 50) return {status:"pass", reason:`⚠ ${P.pledgedPctOfPromoter.toFixed(1)}% of promoter holding pledged — passes, but this is the caution band (20–50%): a sharp price fall could start forcing sales.`};
          return {status:"fail", reason:`${P.pledgedPctOfPromoter.toFixed(1)}% of promoter holding is pledged — above 50%, the forced-selling doom-loop risk is structural.`,
            reentry:"Passes when pledging is released below 50% in a subsequent disclosure — promoters repaying or refinancing the loans."};
        }},
      { id:"dilution", label:"No serial dilution (share count grew ≤ 10% over the window; ≤ 15% for financials)",
        layman:"If the company keeps printing new shares, your slice of the pizza shrinks even while the pizza grows. Occasional issuance is normal; serial dilution means the business can't fund itself and is quietly paying its bills with YOUR ownership.",
        test:(s)=>{
          const d = s.bsDetail?.dilutedShares;
          if(!d || d.length<2 || d[0]==null) return {status:"na", reason:"Diluted share-count history not available for this stock — unverified, not failed."};
          const oldest = [...d].reverse().find(v=>v!=null);
          if(!oldest || oldest<=0) return {status:"na", reason:"Share-count history incomplete."};
          const growth = (d[0]-oldest)/oldest*100;
          const limit = s.sec==="Financial Services" ? 15 : 10;
          if(growth <= limit) return {status:"pass", reason:`Share count ${growth<=0?"flat or shrinking":"up only "+growth.toFixed(1)+"%"} across the window${growth<0?" — buybacks are concentrating your ownership":""}.`};
          return {status:"fail", reason:`Diluted share count grew ${growth.toFixed(1)}% across the window (limit ${limit}% for this sector) — persistent dilution.`,
            reentry:"Passes when the share count stabilizes for two consecutive periods — issuance stopping is the signal the self-funding problem ended."};
        }},
    ],
  },
  { id:3, name:"Business Quality", short:"Quality",
    question:"Is this a good business — durably?",
    teach:{
      what:"Only now, with real and honest numbers, does 'is it good?' mean anything. The five Decision Engine pillars (growth, profitability, cash quality, balance sheet, returns on capital) scored AS PERCENTILES against sector peers — a supermarket judged against supermarkets, a bank against banks — plus the Veteran durability lenses: steadiness, worst-year resilience, reinvestment effectiveness.",
      why:"One hot year is not a business. High ROE built on debt is not quality — it's leverage wearing quality's clothes. This stage separates businesses that COMPOUND from businesses that merely had a good year.",
      example:"IL&FS and several NBFCs (2018) showed superb ROE right up to the crisis — the returns were leverage, and when funding tightened, the 'quality' evaporated in weeks. The ROE/ROA gap was visible the whole time.",
      whyPrev:"Stage 2 confirmed the numbers are honest. But honest numbers can describe a genuinely mediocre business — thin margins, no growth, capital-hungry. Forensics can't tell you that; only quality analysis can.",
    },
    conditions:[
      { id:"relquality", label:"Better than most of its own competition (sector-relative quality ≥ 55)",
        layman:"Every metric here is a percentile against the stock's own sector peers in the same market — 60 means better than 60% of its direct competition. This is the fair test: a grocery chain is never asked to have software margins, and a software firm gets no credit for merely clearing a grocery bar.",
        test:(s,ctx)=>{
          const rq = sectorRelativeQuality(s, ctx.rows);
          const label = rq.fallback ? `absolute composite ${rq.score} (only ${rq.peerCount} peers — percentiles unavailable)` : `sector percentile ${rq.score} vs ${rq.peerCount} peers`;
          if(rq.score >= 55) return {status:"pass", reason:`Quality ${label}.${rq.parts?` Pillars: growth ${rq.parts.growth??"—"} · profit ${rq.parts.profitability??"—"} · cash ${rq.parts.cashQuality??"—"} · balance ${rq.parts.balanceSheet??"—"} · returns ${rq.parts.returns??"—"}.`:""}`};
          const weakest = rq.parts ? Object.entries(rq.parts).filter(([k,v])=>v!=null).sort((a,b)=>a[1]-b[1])[0] : null;
          return {status:"fail", reason:`Quality ${label} — below the 55 bar.${weakest?` Weakest pillar: ${weakest[0]} (${weakest[1]}th percentile).`:""}`,
            reentry:`Passes when the composite crosses 55 on new results${weakest?` — the pillar to watch is ${weakest[0]}, currently its weakest`:""}.`};
        }},
      { id:"realreturns", label:"Returns are real, not borrowed (no ROE>15% / ROA<3% / net-debt combination)",
        layman:"Return-on-equity can be manufactured with debt: borrow heavily, and even a mediocre business shows a glamorous ROE. The gap between ROE and ROA is the leverage — it amplifies on the way up and detonates on the way down. Banks are exempt: leverage IS their model, and they're judged in Stage 2/3 by other means.",
        test:(s)=>{
          if(s.sec==="Financial Services") return {status:"na", reason:"Financials run on leverage by design — this check would flag every healthy bank. Judge them on ROA (>1% is sound) and asset quality instead."};
          if(s.roe==null || s.roa==null) return {status:"na", reason:"ROE/ROA not available — unverified."};
          if(s.roe>15 && s.roa<3 && s.debt>0) return {status:"fail",
            reason:`ROE ${s.roe.toFixed(0)}% but ROA only ${s.roa.toFixed(1)}% with net debt — the returns are mostly borrowed, not earned.`,
            reentry:"Passes when ROA rises above 3% (the business itself becoming productive) or net leverage falls materially — either closes the gap between looking good and being good."};
          return {status:"pass", reason:`ROE ${s.roe.toFixed(0)}% / ROA ${s.roa.toFixed(1)}% — no leverage-manufactured-returns pattern.`};
        }},
      { id:"durability", label:"Durable, not a one-year wonder (steadiness + resilience + reinvestment average ≥ 50)",
        layman:"Three questions a 50-year investor asks that screeners don't: Are the results CONSISTENT year to year (steadiness)? How bad was the WORST year — because that's the one you must hold through (resilience)? And does capital spending actually buy growth, or is it treadmill maintenance (reinvestment)?",
        test:(s)=>{
          const v = veteranMetrics(s);
          const parts = [v.steadiness, v.resilience, v.reinvest].filter(p=>p&&p.score!=null);
          if(parts.length<2) return {status:"na", reason:"Not enough annual history to judge durability — unverified."};
          const avg = Math.round(parts.reduce((a,p)=>a+p.score,0)/parts.length);
          if(avg>=50) return {status:"pass", reason:`Durability ${avg} (steadiness ${v.steadiness.score} · resilience ${v.resilience.score} · reinvestment ${v.reinvest.score}).`};
          const weakest = [["steadiness",v.steadiness.score],["resilience",v.resilience.score],["reinvestment",v.reinvest.score]].sort((a,b)=>a[1]-b[1])[0];
          return {status:"fail", reason:`Durability ${avg} — below 50. Weakest lens: ${weakest[0]} (${weakest[1]}).`,
            reentry:"Improves slowly and only with time — each new year of steadier results lifts the average. This is by design: durability cannot be demonstrated quickly, and the ticket will re-test after each annual refresh."};
        }},
      { id:"fcfyears", label:"Produces spendable cash most years (FCF positive in ≥ 3 of 4 years)",
        layman:"A business that rarely produces free cash is living on other people's money — however exciting the story, someone must keep funding it. Cash-most-years is the minimum bar for calling something self-sustaining.",
        test:(s)=>{
          const fcf = (s.annual?.fcf||[]).filter(v=>v!=null);
          if(fcf.length<3) return {status:"na", reason:"Fewer than 3 years of FCF history — unverified."};
          const pos = fcf.filter(v=>v>0).length;
          const need = Math.min(3, fcf.length-1);
          if(pos>=need && fcf[0]>0) return {status:"pass", reason:`FCF positive in ${pos} of ${fcf.length} years, including the latest.`};
          if(pos>=need) return {status:"fail", reason:`FCF positive in ${pos} of ${fcf.length} years — but the LATEST year turned negative.`,
            reentry:"Passes when the latest year returns to positive free cash flow — one bad capex year can do this; two in a row is a different business."};
          return {status:"fail", reason:`FCF positive in only ${pos} of ${fcf.length} years.`,
            reentry:"Passes when positive-FCF years reach a majority including the latest — the ticket re-tests each annual refresh."};
        }},
    ],
  },
  { id:4, name:"Price", short:"Price",
    question:"Is this a good price for that quality?",
    teach:{
      what:"Quality and price are separate questions, filtered separately. Reverse-DCF (what growth does today's price already assume?) versus analyst consensus versus the company's own track record; sector-relative valuation percentile; FCF yield against the CORRECT country's 10-year bond.",
      why:"A great business at the wrong price is a mediocre investment. The market usually knows a business is good — the question is whether it's charging you for MORE goodness than the business can deliver.",
      example:"Cisco in 2000 was a genuinely great company — and a terrible stock for a decade, because the price assumed growth no company that size has ever sustained. The business delivered; the price still lost you money.",
      whyPrev:"Stage 3's quality metrics contain no price at all — a stock can score 90/100 on quality at any price, including one that guarantees poor returns. Only this stage asks what you're being charged.",
    },
    conditions:[
      { id:"beatable", label:"Expectations are beatable (implied growth ≤ consensus+3pts, or ≤ its own track record)",
        layman:"Every price is a forecast in disguise. This decodes it: what FCF growth must this company deliver for a decade to justify today's price? Then it asks two witnesses — the analysts who model it full-time, and the company's own history. If the price demands more than BOTH have ever supported, you're underwriting a transformation, not a continuation.",
        test:(s)=>{
          const ig = veteranMetrics(s).impliedGrowth;
          if(ig.implied==null && ig.impliedTxt!=="45%+") return {status:"na", reason:"Needs positive free cash flow to decode the price — unverified."};
          const consensus = (s.gRaw!=null && isFinite(s.gRaw)) ? s.gRaw : null;
          const hist = s.fcfCagr;
          if(consensus==null && hist==null) return {status:"na", reason:"No yardstick available — neither analyst consensus loaded (run fetch_estimates.py) nor a computable FCF track record."};
          const implied = ig.impliedTxt==="45%+" ? 46 : ig.implied;
          const okConsensus = consensus!=null && implied <= consensus+3;
          const okHist = hist!=null && implied <= hist;
          if(okConsensus || okHist){
            return {status:"pass", reason:`Price implies ${ig.impliedTxt} FCF growth — ${okConsensus?`within reach of consensus (${consensus.toFixed(0)}%)`:""}${okConsensus&&okHist?" and ":""}${okHist?`below its own delivered ${hist.toFixed(0)}% CAGR`:""}.`};
          }
          // Re-entry price: the price a conservative DCF supports at the best
          // evidence-backed growth rate (consensus first, else history).
          const yardstick = consensus!=null ? Math.max(0,Math.min(30,consensus)) : Math.max(0,Math.min(30,hist));
          const fair = dcf({...s, g:yardstick}, {discount:10, termGrowth:3, years:10});
          const fairTxt = (fair!=null && fair>0) ? ` Becomes interesting below ${fmtP(fair,s.mkt)} — the price at which implied growth drops to the evidence (${yardstick.toFixed(0)}%).` : "";
          return {status:"fail",
            reason:`Price implies ${ig.impliedTxt} sustained FCF growth — above consensus (${consensus!=null?consensus.toFixed(0)+"%":"n/a"}) and above its own record (${hist!=null?hist.toFixed(0)+"%":"n/a"}).${fairTxt}`,
            reentry: fairTxt ? fairTxt.trim() : "Passes when price falls (or delivered growth rises) until implied growth is covered by the evidence — re-tested each refresh."};
        }},
      { id:"sectorpe", label:"Not top-quartile expensive vs sector — unless quality earns it (≥70)",
        layman:"Paying more than 75% of comparable businesses needs a NAMED reason, not vibes. One acceptable reason exists and is applied transparently: top-decile business quality may earn a premium multiple. The exception is shown, never silent.",
        test:(s,ctx)=>{
          if(s.pe==null || s.pe<=0) return {status:"na", reason:"No meaningful P/E for this stock (loss-making or data missing) — unverified; lean on the other two price conditions."};
          const peers = ctx.rows.filter(x=>x.sec===s.sec && x.mkt===s.mkt && x.pe!=null && x.pe>0 && x.pe<200);
          if(peers.length<5) return {status:"na", reason:`Only ${peers.length} priced sector peers — too few for a fair percentile.`};
          const sorted = peers.map(x=>x.pe).sort((a,b)=>a-b);
          const q3 = sorted[Math.floor(sorted.length*0.75)];
          const rank = Math.round(sorted.filter(pe=>pe<=s.pe).length/sorted.length*100);
          if(s.pe <= q3) return {status:"pass", reason:`P/E ${s.pe.toFixed(1)} — ${rank}th percentile of ${peers.length} ${s.sec} peers (75th-percentile bar: ${q3.toFixed(1)}).`};
          const rq = sectorRelativeQuality(s, ctx.rows);
          if(rq.score>=70) return {status:"pass", reason:`⚠ P/E ${s.pe.toFixed(1)} is top-quartile (${rank}th pctile, bar ${q3.toFixed(1)}) — passed ONLY because sector-relative quality is ${rq.score}: premium quality earning a premium multiple. Know that this is the exception you're invoking.`};
          return {status:"fail",
            reason:`P/E ${s.pe.toFixed(1)} — ${rank}th percentile of sector, above the 75th-percentile bar of ${q3.toFixed(1)}, and quality (${rq.score}) doesn't earn the premium.`,
            reentry:`Passes below a P/E of ${q3.toFixed(1)} (price ≈ ${fmtP(s.price*q3/s.pe, s.mkt)} at current earnings) — or if quality climbs to 70.`};
        }},
      { id:"bondspread", label:"Cash yield within reach of the bond (FCF yield ≥ own-market 10Y − 2pts)",
        layman:"The government bond is the rent you could earn risk-free. A stock's cash yield can sit modestly below it if growth is real — but a chasm means you're paying almost entirely for the future, and Stage 4's first condition must then carry all the weight. Indian stocks are measured against the INDIAN bond, US against the US one.",
        test:(s)=>{
          if(s.fcfYield==null) return {status:"na", reason:"No FCF yield computable — unverified."};
          const macro = (typeof MACRO_DATA!=="undefined") ? MACRO_DATA : null;
          const rf = s.mkt==="IN" ? macro?.series?.in10y?.current : macro?.series?.us10y?.current;
          if(rf==null) return {status:"na", reason:`${s.mkt==="IN"?"India":"US"} 10-year yield not loaded (run fetch_macro.py) — refusing to benchmark against the wrong country's bond.`};
          const bar = rf-2;
          if(s.fcfYield >= bar) return {status:"pass", reason:`FCF yield ${s.fcfYield.toFixed(1)}% vs ${s.mkt==="IN"?"India":"US"} 10Y ${rf}% — spread ${(s.fcfYield-rf).toFixed(1)}pts, within the acceptable band.`};
          const f0 = s.annual?.fcf?.[0];
          let priceTxt="";
          if(f0!=null && f0>0 && bar>0 && s.shares>0){
            const maxMcap = f0*100/bar;
            priceTxt = ` Becomes interesting below ${fmtP(maxMcap/s.shares, s.mkt)} (where the yield clears the bar).`;
          }
          return {status:"fail",
            reason:`FCF yield ${s.fcfYield.toFixed(1)}% vs ${s.mkt==="IN"?"India":"US"} 10Y ${rf}% — ${(rf-s.fcfYield).toFixed(1)}pts below the bond, beyond the 2pt allowance.${priceTxt}`,
            reentry: priceTxt ? priceTxt.trim() : "Passes when price falls or FCF grows until the yield is within 2pts of the bond."};
        }},
    ],
  },
  { id:5, name:"Timing", short:"Timing",
    question:"Is now the moment — or is it getting cheaper for a reason?",
    teach:{
      what:"Analyst estimate revisions (are the people who model this company raising or cutting numbers?), price-versus-fundamentals divergence, the stock's own historical reaction pattern around earnings, and the macro regime for its sector. NOTE the design: only the first two can reject a stock. The last two are CAUTIONS — they annotate the decision but never make it, because timing signals are probabilities, not verdicts, and you should see that distinction explicitly.",
      why:"Even correct theses can get 30% cheaper first. Revisions are the most academically validated short-horizon signal freely available — they tell you whether the market is STARTING to agree with your Stage 3-4 conclusions, or still disagreeing.",
      example:"A stock that's cheap AND has estimates being cut is often a knife still falling — cheap gets cheaper. The same stock with estimates stabilizing and turning up is a different trade entirely, at the same price.",
      whyPrev:"Stage 4 established WHAT it's worth; it says nothing about WHEN the market will agree. Valuation is a compass, not a clock. This stage is the clock.",
    },
    conditions:[
      { id:"revisions", label:"HARD — Estimates not being cut (30-day EPS revision ≥ −2%)",
        layman:"Analysts who model this company full-time are raising or holding their numbers, not cutting them. Buying while estimates are being cut means betting the professionals are wrong AND that the market will realize it soon — two bets, not one.",
        test:(s)=>{
          const est = (typeof ESTIMATES_DATA!=="undefined") ? ESTIMATES_DATA[s.t] : null;
          const r30 = est?.estimateRevision30d;
          if(r30==null) return {status:"na", reason:"No revision data loaded for this stock (run fetch_estimates.py, or no analyst coverage) — unverified. For an uncovered small-cap, that itself is worth knowing."};
          if(r30 >= -2) return {status:"pass", reason:`30-day EPS revision ${r30>0?"+":""}${r30}% — estimates ${r30>0.5?"rising":"stable"}.`};
          return {status:"fail", reason:`EPS estimates cut ${r30}% in 30 days — the people who study this company are lowering their numbers.`,
            reentry:"Passes when the 30-day revision stabilizes above −2% — cuts ending is the classic bottom-forming signal. Re-tested on every estimates refresh."};
        }},
      { id:"outrun", label:"HARD — Not 'momentum outrunning fundamentals' (price >85% of range while growth decelerates)",
        layman:"Price near all-time highs while growth is SLOWING means the story has run ahead of the facts — the most common setup before a painful de-rating. It doesn't predict when; it tells you the risk/reward has inverted.",
        test:(s)=>{
          if(s.pricePos==null || s.revDecel==null) return {status:"na", reason:"52-week position or growth-trend data missing — unverified."};
          if(s.pricePos>85 && s.revDecel<-5) return {status:"fail",
            reason:`Price at ${s.pricePos.toFixed(0)}% of its 52-week range while growth decelerated ${Math.abs(s.revDecel).toFixed(0)}pts — narrative outrunning numbers.`,
            reentry:"Passes when growth re-accelerates (next results) or price cools below the 85th percentile of its range — either closes the gap between story and fact."};
          return {status:"pass", reason:`Price at ${s.pricePos.toFixed(0)}% of range, growth trend ${s.revDecel>0?"+":""}${s.revDecel.toFixed(0)}pts — no story/fact divergence.`};
        }},
      { id:"reactions", label:"SOFT — Earnings-reaction personality not habitually hostile (avg 60-day excess ≥ −3%)",
        layman:"Some stocks habitually sell off even on decent results — that's a personality, visible in history. History isn't destiny, so this NEVER rejects a stock; it warns you what this name tends to do around its filings, so the event doesn't surprise you.",
        test:(s)=>{
          const RD = (typeof REACTIONS_DATA!=="undefined") ? REACTIONS_DATA : [];
          const rec = RD.find(r=>r.ticker===s.t);
          if(!rec) return {status:"na", reason:"No earnings-reaction history loaded (run fetch_reactions.py) — unverified."};
          const ex = computeExcessReturns(rec, RD).map(r=>r.excess60d).filter(v=>v!=null);
          if(!ex.length) return {status:"na", reason:"Reaction history loaded but no computable excess returns yet."};
          const avg = ex.reduce((a,b)=>a+b,0)/ex.length;
          if(avg >= -3) return {status:"pass", reason:`Average 60-day excess return after past filings: ${avg>0?"+":""}${avg.toFixed(1)}% vs sector — no hostile pattern.`};
          return {status:"warn", reason:`⚠ CAUTION (does not reject): this stock has averaged ${avg.toFixed(1)}% vs sector in the 60 days after its past filings — a habitually hostile reaction pattern. Size and time your entry knowing the personality.`};
        }},
      { id:"macro", label:"SOFT — Sector macro regime not a strong headwind",
        layman:"In a headwind quarter, even correct stock-picks fight the tide. You may absolutely proceed — plenty of great entries happen in bad regimes — but you proceed KNOWING, which is the entire point of this stage.",
        test:(s)=>{
          const macro = (typeof MACRO_DATA!=="undefined") ? MACRO_DATA : null;
          if(!macro) return {status:"na", reason:"Macro data not loaded (run fetch_macro.py) — unverified."};
          const m = macroRead(s, macro);
          if(!m) return {status:"na", reason:"No macro read available for this sector."};
          if(m.score<=-2) return {status:"warn", reason:`⚠ CAUTION (does not reject): ${m.verdict.l} for ${s.sec} — ${m.notes.map(n=>n.txt).join(" ")} Proceeding is fine; proceeding unaware is not.`};
          return {status:"pass", reason:`${m.verdict.l} for ${s.sec}${m.notes.length?` — ${m.notes[0].txt}`:""}`};
        }},
    ],
  },
  { id:6, name:"Fit & Size", short:"Fit", special:true,
    question:"Does it fit YOU — and how much?",
    teach:{
      what:"The only stage about you rather than the stock: your horizon (the short-term and long-term paths diverge here), liquidity (can you actually trade it at your size?), position sizing from worst-year resilience, and a short qualitative checklist the machine honestly cannot answer — moat durability, management, regulatory risk, and whether you can state the bear case.",
      why:"A perfect stock in the wrong size is still a mistake: too big and you'll be forced to sell the worst year at the bottom; too illiquid and you can't exit at all. And the final questions — is the moat real? do you trust management? — have no dataset. Pretending otherwise would be dishonest, so the tool makes YOU answer them before it grants its final stamp.",
      example:"Plenty of investors were RIGHT about a business and still lost money, because the position was sized for the average year and the worst year shook them out at the bottom. Size for the floor, not the average.",
      whyPrev:"Every stage so far judged the stock. None judged the investor. The same stock can be correct for a 5-year holder and wrong for a 6-week swing — this stage is where those paths split.",
    },
  },
];

/* ============================================================
   STAGE 6 — special renderer (per-stock cards + user inputs)
   ============================================================ */
function wf6Assess(s, f){
  const out = {};
  // --- liquidity ---
  const ph = (typeof PRICE_HISTORY!=="undefined") ? PRICE_HISTORY[s.t] : null;
  const adv = ph?.adv;   // IN: ₹ crore/day · US: $ million/day
  const unit = s.mkt==="IN" ? "₹ lakh" : "$ thousand";
  if(adv==null){
    out.liquidity = {status:"na", reason:"Average daily traded value not loaded — re-run fetch_price_history.py (it now captures liquidity). Unverified: check the counter's typical volumes yourself before sizing up."};
  } else if(f.posSize>0){
    const capSameUnit = s.mkt==="IN" ? adv*5 : adv*50;   // 5% of a day's value, in input units
    if(f.posSize <= capSameUnit) out.liquidity = {status:"pass", reason:`Your ${f.posSize} ${unit} is within 5% of a typical day's trading (${s.mkt==="IN"?`₹${adv} cr/day`:`$${adv}M/day`} → cap ≈ ${Math.round(capSameUnit)} ${unit}).`};
    else out.liquidity = {status:"fail", reason:`Your ${f.posSize} ${unit} exceeds 5% of a typical day's trading (${s.mkt==="IN"?`₹${adv} cr/day`:`$${adv}M/day`} → cap ≈ ${Math.round(capSameUnit)} ${unit}) — exiting would take days of pushing the price against yourself. The fix is a smaller size, not a different stock.`};
  } else {
    out.liquidity = {status:"na", reason:"Enter your intended position size above to run the liquidity check."};
  }
  // --- short-term catalyst (ST path only) ---
  if(f.horizon==="ST"){
    const est = (typeof ESTIMATES_DATA!=="undefined") ? ESTIMATES_DATA[s.t] : null;
    const r30 = est?.estimateRevision30d;
    if(r30==null) out.catalyst = {status:"na", reason:"No revision data to detect a catalyst — and next-earnings-date isn't in the free dataset yet. Verify the earnings calendar manually before a swing entry."};
    else if(Math.abs(r30) > 2) out.catalyst = {status:"pass", reason:`Live revision impulse: EPS estimates moved ${r30>0?"+":""}${r30}% in 30 days — something is repricing within your window.`};
    else out.catalyst = {status:"fail", reason:`No catalyst detected: estimates flat (${r30}% in 30d). Nothing visible should move this in a weeks-to-months window — this is a long-term candidate wearing the wrong label. Routed to the long-term path; not a rejection of the stock.`, route:"LT"};
  }
  // --- position sizing from the worst year ---
  const v = veteranMetrics(s);
  const worstRev = v.resilience?.worstRev, worstFcf = v.resilience?.worstFcf;
  if(worstRev!=null || worstFcf!=null){
    const assumed = Math.min(80, Math.max(15,
      Math.abs(Math.min(worstRev??0,0))*1.5,
      Math.abs(Math.min(worstFcf??0,0))));
    const maxPos = f.lossTol / assumed * 100;
    out.sizing = { assumed, maxPos,
      text:`Worst year on record: revenue ${worstRev!=null?worstRev.toFixed(0)+"%":"n/a"}, FCF ${worstFcf!=null?worstFcf.toFixed(0)+"%":"n/a"}. Assuming a repeat could mark the stock down ~${assumed.toFixed(0)}% (stated assumption: 1.5× the worst revenue fall or the worst FCF fall, whichever is larger, floor 15%), a max position of ${maxPos.toFixed(1)}% of your portfolio keeps that repeat at your ${f.lossTol}% pain limit.` };
  } else {
    out.sizing = { text:"Not enough history to locate a worst year — without a floor to size against, start smaller than feels necessary." };
  }
  return out;
}

function wf6Qualified(s, f){
  const a = wf6Assess(s, f);
  const q = f.qualitative?.[s.t] || {};
  const answersDone = ["moat","mgmt","risk","bear"].every(k=>(q[k]||"").trim().length>0);
  const liquidityOk = a.liquidity.status!=="fail";
  const horizonOk = f.horizon!=="ST" || (a.catalyst && a.catalyst.status!=="fail");
  return { qualified: answersDone && liquidityOk && horizonOk, answersDone, liquidityOk, horizonOk, assess:a };
}

function renderStage6(survivors){
  const f = State.funnel;
  if(!f.horizon) f.horizon = "LT";   // the chips show LT by default; the state must agree
  if(f.lossTol==null) f.lossTol = 1.5;
  if(f.posSize==null) f.posSize = 0;
  if(!f.qualitative) f.qualitative = {};
  const unit = f.market==="IN" ? "₹ lakh" : "$ thousand";

  const settings = `<div class="panel wide">
    <div class="panelhead"><span class="panelt">Your parameters</span><span class="panels">the stage that judges the investor, not the stock</span></div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-end">
      <div><div class="kpiL" style="margin-bottom:6px">Horizon</div>
        ${wfChip("Long-term (multi-year hold)","data-wf6horizon='LT'", f.horizon!=="ST")}
        ${wfChip("Short-term (weeks–months swing)","data-wf6horizon='ST'", f.horizon==="ST")}
        ${f.horizon==="ST"?`<div class="hint" style="margin-top:6px">Short-term additionally requires a live catalyst — without one there's no reason for movement inside your window, and the stock is routed to the long-term list instead of rejected. Note: this dataset refreshes daily at best; the tool is honest that it cannot support intraday trading.</div>`:""}</div>
      <div><div class="kpiL" style="margin-bottom:6px">Intended position size (${unit})</div>
        <input id="wf6pos" type="number" min="0" value="${f.posSize||""}" placeholder="e.g. ${f.market==="IN"?"5":"10"}" style="width:130px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)"/></div>
      <div><div class="kpiL" style="margin-bottom:6px">Pain limit: worst-year repeat may cost me at most (% of portfolio)</div>
        <input id="wf6tol" type="number" min="0.5" max="5" step="0.5" value="${f.lossTol}" style="width:90px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)"/></div>
    </div></div>`;

  const cards = survivors.map(s=>{
    const st6 = wf6Qualified(s, f);
    const a = st6.assess;
    const q = f.qualitative[s.t] || {};
    const badge = st6.qualified
      ? `<span class="pill good" style="font-size:13px">✅ FULLY QUALIFIED</span>`
      : `<span class="pill neutral" style="font-size:13px">pending: ${[!st6.liquidityOk&&"liquidity", !st6.horizonOk&&"catalyst", !st6.answersDone&&"your 4 answers"].filter(Boolean).join(" + ")}</span>`;
    const row = (label, r) => r?`<div style="margin:6px 0;font-size:13.5px;line-height:1.55"><b style="color:${r.status==="pass"?"var(--good)":r.status==="fail"?"var(--warn)":"var(--dim)"}">${r.status==="pass"?"✓":r.status==="fail"?"✗":"◌"} ${label}:</b> <span style="color:var(--dim)">${r.reason}</span></div>`:"";
    const qa = (key, label, ph) => `<div style="margin:8px 0"><div style="font-size:13px;font-weight:600">${label}</div>
      <textarea data-wf6q="${s.t}:${key}" placeholder="${ph}" style="width:100%;min-height:44px;margin-top:4px;padding:8px;border:1px solid ${(q[key]||"").trim()?"var(--good)":"var(--line)"};border-radius:6px;background:var(--panel);color:var(--ink);font-size:13px">${q[key]||""}</textarea></div>`;
    return `<div class="panel wide" style="border-left:3px solid ${st6.qualified?"var(--good)":"var(--line)"}">
      <div class="panelhead"><span class="panelt">${s.t} <span class="tsub">${s.n}</span></span>${badge}</div>
      ${row("Liquidity", a.liquidity)}
      ${a.catalyst?row("Short-term catalyst", a.catalyst):""}
      <div style="margin:8px 0;padding:10px 14px;background:var(--accent-soft);border-radius:7px;font-size:13.5px;line-height:1.6"><b>Position size guidance:</b> ${a.sizing.text}</div>
      <div style="margin-top:10px"><div class="kpiL">The four questions the machine cannot answer — the stamp requires all four, in your own words:</div>
        ${qa("moat","1 · Is the moat durable for 5+ years — what specifically stops competitors?","e.g. switching costs on 20-year client contracts; brand pricing power; regulatory license...")}
        ${qa("mgmt","2 · Do you trust management's capital allocation — what's the evidence?","e.g. buybacks below intrinsic value; no empire-building acquisitions; promoter stake stable...")}
        ${qa("risk","3 · What regulatory or disruption overhang exists, and why is it survivable?","e.g. GST rate risk on this category is real but priced; AI displaces the low end of their work, they own the high end...")}
        ${qa("bear","4 · State the bear case in ONE sentence. If you can't, you don't understand the stock yet.","The single strongest argument someone sane would make against owning this.")}
        <div style="margin-top:6px">${wfBtn("Save answers",`data-wf6save="${s.t}"`,true)}</div>
      </div>
    </div>`;
  }).join("");

  const qualified = survivors.filter(s=>wf6Qualified(s,f).qualified);
  const report = qualified.length ? `<div class="panel wide" style="border:2px solid var(--good)">
    <div class="panelhead"><span class="panelt">📋 Final report — ${qualified.length} fully qualified</span><span class="panels">the complete audit trail, from index selection to stamp</span></div>
    <p class="hint" style="margin-top:0">Universe: ${f.market==="IN"?(IN_INDEX_LABELS[f.index]||"Nifty"):"S&P 500"}${f.sector!=="ALL"?` · ${f.sector}`:""} · Horizon: ${f.horizon==="ST"?"short-term swing":"long-term hold"} · Pain limit ${f.lossTol}%</p>
    ${qualified.map(s=>{
      const trail = [1,2,3,4,5].map(stg=>{
        const d = f.stageResults[stg]?.detail?.[s.t];
        if(!d) return null;
        const icons = d.map(c=>`${c.status==="pass"?"✓":c.status==="na"?"◌":c.status==="warn"?"⚠":"✗"} ${c.label.replace(/^(HARD|SOFT) — /,"")}`).join(" · ");
        return `<div style="font-size:12.5px;color:var(--dim);margin:2px 0"><b>S${stg} ${FUNNEL_STAGES[stg].short}:</b> ${icons}</div>`;
      }).filter(Boolean).join("");
      const a = wf6Assess(s,f); const q=f.qualitative[s.t]||{};
      return `<div style="padding:12px 14px;border:1px solid var(--line);border-radius:8px;margin-bottom:10px">
        <div style="font-weight:700;font-size:15px">${s.t} <span class="tsub">${s.n}</span> <span class="pill good">✅ qualified</span></div>
        ${trail}
        <div style="font-size:12.5px;margin-top:4px"><b>Size:</b> ${a.sizing.maxPos!=null?`max ${a.sizing.maxPos.toFixed(1)}% of portfolio`:"start small — no floor computable"} · <b>Your bear case:</b> <i>"${q.bear||""}"</i></div>
      </div>`;
    }).join("")}
    <p class="hint">This report is the product: every box that was checked, every caution that was noted, and your own written reasoning. Revisit it when the thesis is tested — that's when it earns its keep.</p>
  </div>` : `<div class="panel wide" style="border-style:dashed"><p class="hint" style="margin:4px 0">No stock is fully qualified yet — the stamp requires liquidity ok${f.horizon==="ST"?", a live catalyst":""} and all four written answers. That friction is deliberate.</p></div>`;

  return settings + cards + report;
}


function wfInProgressWarning(f){
  const n = Object.keys(f.stageResults||{}).length;
  if(!n) return "";
  const keys = Object.keys(f.stageResults).map(Number);
  const lastPass = f.stageResults[Math.max(...keys)]?.pass?.length ?? 0;
  return '<div style="margin-top:10px;padding:10px 14px;background:var(--warn-bg);border:1px solid var(--line);border-radius:8px;font-size:13.5px;color:var(--dim)">'
    + '⚠ A funnel is already in progress — '+n+' stage'+(n>1?'s':'')+' run, '+lastPass+' survivor'+(lastPass!==1?'s':'')+' so far. Changing the selection and restarting clears all stage results; re-entry tickets are kept.'
    + '<div style="margin-top:8px">'+wfBtn("Clear results &amp; restart","data-wfclearstart='1'")+'</div>'
    + '</div>';
}

function runFunnelStage(stageId){
  const stage = FUNNEL_STAGES.find(st=>st.id===stageId);
  if(!stage || !stage.conditions) return;
  const rows = computeRows();
  const prev = stageId===1 ? funnelUniverse(rows)
    : rows.filter(s => (State.funnel.stageResults[stageId-1]?.pass||[]).includes(s.t));
  const pass=[], fail=[], detail={};
  const ctx = {rows};   // sector-relative conditions rank against the FULL loaded universe, not just survivors — the peer group must stay unbiased
  prev.forEach(s=>{
    const results = stage.conditions.map(c=>({c, r:c.test(s, ctx)}));
    detail[s.t] = results.map(({c,r})=>({id:c.id, label:c.label, status:r.status, reason:r.reason}));
    const failed = results.filter(x=>x.r.status==="fail");
    if(failed.length===0){ pass.push(s.t); }
    else {
      fail.push({t:s.t, n:s.n, reasons:failed.map(x=>`${x.c.label}: ${x.r.reason}`)});
      // one re-entry ticket per stock per stage (replace any old one)
      State.funnel.tickets = State.funnel.tickets.filter(tk=>!(tk.t===s.t && tk.stage===stageId));
      State.funnel.tickets.push({
        t:s.t, n:s.n, stage:stageId, stageName:stage.name,
        reasons:failed.map(x=>x.r.reason),
        reentry:failed.map(x=>x.r.reentry).filter(Boolean),
        created:new Date().toISOString().slice(0,10), met:false,
      });
    }
  });
  State.funnel.stageResults[stageId] = {pass, fail, detail, total:prev.length, ranAt:new Date().toISOString()};
  saveFunnel();
}

/* Re-evaluate every ticket against fresh data; mark met=true when the
   disqualifying condition has flipped. This is what makes a "no" mean
   "not until this changes" instead of "never". */
function reevaluateTickets(){
  const rows = computeRows();
  const ctx = {rows};
  const byT = Object.fromEntries(rows.map(s=>[s.t,s]));
  let changed=false;
  (State.funnel.tickets||[]).forEach(tk=>{
    const stage = FUNNEL_STAGES.find(st=>st.id===tk.stage);
    const s = byT[tk.t];
    if(!stage || !stage.conditions || !s || tk.met) return;
    const stillFailing = stage.conditions.some(c=>c.test(s, ctx).status==="fail");
    if(!stillFailing){ tk.met=true; tk.metOn=new Date().toISOString().slice(0,10); changed=true; }
  });
  if(changed) saveFunnel();
}

/* ============================================================
   RENDERING
   ============================================================ */
function wfBtn(label, attrs, primary){
  return `<button ${attrs} style="padding:9px 18px;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${primary?'var(--accent)':'var(--line)'};background:${primary?'var(--accent)':'var(--panel)'};color:${primary?'#fff':'var(--ink)'}">${label}</button>`;
}
function wfChip(label, attrs, on){
  return `<button ${attrs} class="chip" style="cursor:pointer;border:1px solid ${on?'var(--accent)':'var(--line)'};background:${on?'var(--accent-soft)':'var(--panel)'};color:${on?'var(--accent)':'var(--dim)'};font-weight:${on?600:400}">${label}</button>`;
}

function renderWorkflow(){
  if(!State.funnel) State.funnel = loadFunnel();
  reevaluateTickets();
  const f = State.funnel;
  const rows = computeRows();

  /* ----- progress rail ----- */
  const rail = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0 18px">
    <button data-wfgoto0 style="padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--line);background:var(--panel);color:var(--dim)" title="Go back to Stage 0 and change your market/index/sector selection">↺ New search</button>
    <div style="width:1px;height:20px;background:var(--line);margin:0 4px"></div>
    ${
    FUNNEL_STAGES.map(st=>{
      const done = st.id<f.stage, cur = st.id===f.stage;
      const res = f.stageResults[st.id];
      return `<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;font-size:13px;font-family:var(--mono);
        background:${cur?'var(--ink)':done?'var(--good-bg)':'var(--panel)'};color:${cur?'#fff':done?'var(--good)':'var(--dim)'};border:1px solid ${cur?'var(--ink)':'var(--line)'}">
        <b>${st.id}</b> ${st.short}${res?` · ${res.pass.length}/${res.total}`:""}${st.locked?" 🔒":""}</div>`;
    }).join("")}</div>`;

  /* ----- Stage 0 ----- */
  if(f.stage===0){
    const st = FUNNEL_STAGES[0];
    const markets = [
      {id:"US", label:"United States", sub:"S&P 500", n:rows.filter(s=>s.mkt==="US").length},
      {id:"IN", label:"India", sub:"Nifty universe", n:rows.filter(s=>s.mkt==="IN").length},
    ];
    let indexPicker="";
    if(f.market==="IN"){
      const opts=[["NIFTYALL",`All fetched Nifty names (${rows.filter(s=>s.mkt==="IN").length})`]];
      if(CLASSIFICATION?.indices){
        Object.keys(CLASSIFICATION.indices).forEach(k=>{
          const have = CLASSIFICATION.indices[k].filter(sym=>rows.some(s=>s.t===sym)).length;
          opts.push([k, `${IN_INDEX_LABELS[k]||k} (${have} loaded)`]);
        });
      }
      indexPicker = `<div style="margin-top:14px"><div class="kpiL" style="margin-bottom:6px">Index ${CLASSIFICATION?`<span style="color:var(--dim);font-weight:400">· NSE official constituents, as of ${CLASSIFICATION.asOf}</span>`:`<span style="color:var(--neutral);font-weight:400">· classification.json not loaded — run fetch_nse_classification.py to unlock Nifty 50/100/Bank/IT subsets; using all fetched names meanwhile</span>`}</div>
        <div>${opts.map(([k,l])=>wfChip(l,`data-wfindex="${k}"`, (f.index||"NIFTYALL")===k)).join(" ")}</div></div>`;
    } else if(f.market==="US"){
      indexPicker = `<div style="margin-top:14px"><div class="kpiL" style="margin-bottom:6px">Index</div>
        ${wfChip(`S&P 500 (${rows.filter(s=>s.mkt==="US").length} loaded)`, `data-wfindex="SP500"`, true)}
        <span class="hint" style="margin-left:8px">US sub-indices (S&P 100, sector indices) can be added later the same way as the NSE ones.</span></div>`;
    }
    let sectorPicker="";
    if(f.market){
      const slice = funnelUniverse(rows.map(s=>({...s})));
      const bySec = {};
      // sector counts computed on the index slice, ignoring current sector filter
      const idxSlice = (()=>{ const keep=f.sector; f.sector="ALL"; const r=funnelUniverse(rows); f.sector=keep; return r; })();
      idxSlice.forEach(s=>{ if(s.sec) bySec[s.sec]=(bySec[s.sec]||0)+1; });
      sectorPicker = `<div style="margin-top:14px"><div class="kpiL" style="margin-bottom:6px">Sector <span style="color:var(--dim);font-weight:400">· optional — "All sectors" is a valid choice; you can re-run the funnel per sector later</span></div>
        <div>${wfChip(`All sectors (${idxSlice.length})`,`data-wfsector="ALL"`, f.sector==="ALL")}
        ${Object.entries(bySec).sort((a,b)=>b[1]-a[1]).map(([sec,n])=>wfChip(`${sec} (${n})`,`data-wfsector="${sec}"`, f.sector===sec)).join(" ")}</div></div>`;
    }
    const slice = f.market ? funnelUniverse(rows) : [];
    return `${rail}
    <div class="panel wide">
      <div class="panelhead"><span class="panelt">Stage 0 — ${st.name}</span></div>
      <p style="font-size:14.5px;line-height:1.65"><b>What this stage does:</b> ${st.teach.what}</p>
      <p style="font-size:14.5px;line-height:1.65;color:var(--dim)"><b>Why it comes first:</b> ${st.teach.why}</p>
      <p style="font-size:14px;line-height:1.6;background:var(--accent-soft);padding:10px 14px;border-radius:7px"><b>Example:</b> ${st.teach.example}</p>
      <div style="margin-top:16px"><div class="kpiL" style="margin-bottom:6px">Market</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">${markets.map(m=>`
          <div data-wfmarket="${m.id}" style="cursor:pointer;padding:14px 22px;border-radius:8px;border:2px solid ${f.market===m.id?'var(--accent)':'var(--line)'};background:${f.market===m.id?'var(--accent-soft)':'var(--panel)'}">
            <div style="font-weight:700;font-size:15px">${m.label}</div>
            <div style="font-size:13px;color:var(--dim)">${m.sub} · ${m.n} stocks loaded</div>
          </div>`).join("")}</div></div>
      ${indexPicker}${sectorPicker}
      ${f.market?`<div style="margin-top:20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        ${wfBtn(`Begin the funnel with ${slice.length} stocks →`,`data-wfbegin="1"`,true)}
        <span class="hint" style="margin:0">Your hunting ground: <b>${f.market==="IN"?(IN_INDEX_LABELS[f.index]||"All Nifty names"):"S&P 500"}</b>${f.sector!=="ALL"?` · <b>${f.sector}</b>`:" · all sectors"}</span>
      </div>
      ${wfInProgressWarning(f)}
      `:`<p class="hint">Select a market to continue.</p>`}
    </div>
    ${renderWfTickets()}`;
  }

  /* ----- Stages 1..6 ----- */
  const st = FUNNEL_STAGES.find(x=>x.id===f.stage);
  const res = f.stageResults[f.stage];
  const acked = !!f.readAck[f.stage];
  const survivors = f.stage===1 ? funnelUniverse(rows) : rows.filter(s=>(f.stageResults[f.stage-1]?.pass||[]).includes(s.t));

  const teachCard = `<div class="panel wide">
    <div class="panelhead"><span class="panelt">Stage ${st.id} — ${st.name}</span><span class="panels">${st.question||""}</span></div>
    <p style="font-size:14.5px;line-height:1.65"><b>What this filter checks:</b> ${st.teach.what}</p>
    <p style="font-size:14.5px;line-height:1.65"><b>The failure mode it catches:</b> ${st.teach.why}</p>
    <p style="font-size:14px;line-height:1.6;background:var(--warn-bg);padding:10px 14px;border-radius:7px"><b>Real-world example:</b> ${st.teach.example}</p>
    <p style="font-size:14.5px;line-height:1.65;background:var(--accent-soft);padding:10px 14px;border-radius:7px"><b>Why the previous stage couldn't catch this:</b> ${st.teach.whyPrev}</p>
    ${st.conditions?`
      <div style="margin-top:14px"><div class="kpiL" style="margin-bottom:8px">The exact conditions this stage will apply — read each before running:</div>
      ${st.conditions.map((c,i)=>`<div style="padding:10px 14px;border:1px solid var(--line);border-radius:7px;margin-bottom:8px">
        <div style="font-weight:600;font-size:14px">${i+1}. ${c.label}</div>
        <div style="font-size:13.5px;color:var(--dim);line-height:1.6;margin-top:4px">${c.layman}</div></div>`).join("")}
      </div>
      ${!acked?`<div style="margin-top:14px">${wfBtn("I've read and understood this — run the filter","data-wfack='1'",true)}</div>`:""}
    `:""}
    ${st.special&&!acked?`<div style="margin-top:14px">${wfBtn("I've read and understood this — begin the final stage","data-wfack='1'",true)}</div>`:""}
  </div>`;

  if(st.special){
    return `${rail}${teachCard}${acked ? renderStage6(survivors) : ""}${renderWfTickets()}
      <p class="hint" style="display:flex;gap:10px">${wfBtn("← Back a stage","data-wfback='1'")} ${wfBtn("Reset funnel (keep re-entry tickets)","data-wfreset='1'")}</p>`;
  }

  if(st.locked){
    return `${rail}${teachCard}
    <div class="panel wide" style="border-style:dashed">
      <div class="panelhead"><span class="panelt">🔒 Conditions pending your approval</span></div>
      <p style="font-size:14px;color:var(--dim);line-height:1.6">This stage's exact thresholds are in the condition map awaiting your sign-off. Planned conditions:</p>
      <ul style="font-size:14px;line-height:1.8;color:var(--dim)">${st.planned.map(p=>`<li>${p}</li>`).join("")}</ul>
      <p class="hint">You currently have <b>${survivors.length}</b> survivors from Stage ${st.id-1} waiting at this gate. ${wfBtn("← Back a stage","data-wfback='1'")}</p>
    </div>
    ${renderWfTickets()}`;
  }

  /* runnable stage (has conditions) */
  let rosterHtml="";
  if(acked && res){
    const detail = res.detail||{};
    const failRows = res.fail.map(fx=>`
      <tr><td class="left"><span class="tname">${fx.t}</span><span class="tsub">${fx.n}</span></td>
        <td><span class="pill warn">rejected</span></td>
        <td class="left" style="font-size:13px;line-height:1.55;color:var(--dim)">${fx.reasons.join("<br>")}</td></tr>`).join("");
    const passRows = res.pass.map(t=>{
      const d=(detail[t]||[]);
      const naCount=d.filter(x=>x.status==="na").length;
      const warnCount=d.filter(x=>x.status==="warn").length;
      return `<tr><td class="left"><span class="tname">${t}</span></td>
        <td><span class="pill good">passed</span>${warnCount?` <span class="pill neutral" title="soft cautions — annotate, never reject">${warnCount} caution${warnCount>1?"s":""}</span>`:""}${naCount?` <span class="pill neutral" title="some checks not assessable">${naCount} unverified</span>`:""}</td>
        <td class="left" style="font-size:13px;color:var(--dim)">${d.map(x=>`${x.status==="pass"?"✓":x.status==="na"?"◌":x.status==="warn"?"⚠":"✗"} ${x.label}`).join(" · ")}</td></tr>`;
    }).join("");
    rosterHtml = `<div class="panel wide" data-stageresult="1">
      <div class="panelhead"><span class="panelt">Result: ${res.pass.length} of ${res.total} pass Stage ${st.id}</span><span class="panels">every rejection shows its exact reason — that's the lesson</span></div>
      <div style="overflow-x:auto"><table class="grid" style="width:100%">
        <thead><tr><th class="left">Stock</th><th>Verdict</th><th class="left">Why</th></tr></thead>
        <tbody>${failRows}${passRows}</tbody></table></div>
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center">
        ${wfBtn(`Continue to Stage ${st.id+1} with ${res.pass.length} survivors →`,`data-wfnext="1"`,true)}
        ${wfBtn("Re-run this filter","data-wfrun='1'")}
        ${wfBtn("← Back","data-wfback='1'")}
      </div>
      <p class="hint">Every rejected stock received a <b>re-entry ticket</b> below — the exact condition that would make it worth re-testing. A "no" here means "not until this changes", not "never".</p>
    </div>`;
  } else if(acked){
    rosterHtml = `<div class="panel wide"><div class="panelhead"><span class="panelt">Ready</span></div>
      <p style="font-size:14px;color:var(--dim)">This will test <b>${survivors.length}</b> stocks against the ${st.conditions.length} conditions above.</p>
      <div style="margin-top:8px">${wfBtn(`Run Stage ${st.id} on ${survivors.length} stocks`,`data-wfrun="1"`,true)} ${wfBtn("← Back","data-wfback='1'")}</div></div>`;
  }

  return `${rail}${teachCard}${rosterHtml}${renderWfTickets()}
    <p class="hint">${wfBtn("Reset funnel (keep re-entry tickets)","data-wfreset='1'")}</p>`;
}

function renderWfTickets(){
  const tk = State.funnel?.tickets||[];
  if(!tk.length) return "";
  const met = tk.filter(x=>x.met), open = tk.filter(x=>!x.met);
  return `<div class="panel wide" style="margin-top:14px">
    <div class="panelhead"><span class="panelt">Re-entry watchlist (${tk.length})</span><span class="panels">rejects, and exactly what would change the answer</span></div>
    ${met.length?`<div style="margin-bottom:10px">${met.map(x=>`
      <div style="padding:10px 14px;border:1px solid var(--good);border-radius:7px;margin-bottom:6px;background:var(--good-bg)">
        <b>${x.t}</b> — re-entry condition MET on ${x.metOn}. It was rejected at Stage ${x.stage} (${x.stageName}); the disqualifying condition no longer fails. <span data-wfretest="${x.t}" style="color:var(--accent);cursor:pointer;font-weight:600">Re-run funnel from Stage ${x.stage} →</span></div>`).join("")}</div>`:""}
    ${open.map(x=>`<div style="padding:10px 14px;border:1px solid var(--line);border-radius:7px;margin-bottom:6px">
      <div><b>${x.t}</b> <span class="tsub">${x.n||""}</span> · rejected at Stage ${x.stage} (${x.stageName}) on ${x.created}</div>
      <div style="font-size:13px;color:var(--warn);margin-top:3px">${x.reasons.join(" · ")}</div>
      <div style="font-size:13px;color:var(--dim);margin-top:3px"><b>Comes back when:</b> ${x.reentry.length?x.reentry.join(" "):"the failed condition above flips on a future data refresh (re-checked automatically every time you open this tab)."}</div>
    </div>`).join("")}
  </div>`;
}

/* ---------- event wiring (called by app.js wire() after each render) ---------- */
function wireWorkflow(root){
  if(!State.funnel) return;
  const F = State.funnel;
  const on=(sel,fn)=>root.querySelectorAll(sel).forEach(el=>el.onclick=()=>fn(el));
  on("[data-wfmarket]", el=>{ F.market=el.dataset.wfmarket; F.index=F.market==="IN"?"NIFTYALL":"SP500"; F.sector="ALL"; saveFunnel(); render(); });
  on("[data-wfindex]",  el=>{ F.index=el.dataset.wfindex; F.sector="ALL"; saveFunnel(); render(); });
  on("[data-wfsector]", el=>{ F.sector=el.dataset.wfsector; saveFunnel(); render(); });
  on("[data-wfbegin]",  ()=>{ F.stage=1; saveFunnel(); render(); window.scrollTo(0,0); });
  on("[data-wfack]",    ()=>{ F.readAck[F.stage]=true; saveFunnel(); render(); });
  on("[data-wfrun]",    ()=>{ runFunnelStage(F.stage); render(); setTimeout(()=>{ const el=document.querySelector('[data-stageresult]'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },80); });
  on("[data-wfnext]",   ()=>{ F.stage=Math.min(F.stage+1, FUNNEL_STAGES.length-1); saveFunnel(); render(); setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50); });
  on("[data-wfback]",   ()=>{ F.stage=Math.max(F.stage-1, 0); saveFunnel(); render(); window.scrollTo(0,0); });
  on("[data-wfreset]",  ()=>{ resetFunnel(true); render(); window.scrollTo(0,0); });
  on("[data-wfgoto0]",  ()=>{
    // Go back to Stage 0 to change selection — keep results and tickets
    // so switching market mid-funnel is possible without losing everything
    F.stage=0; saveFunnel(); render(); window.scrollTo(0,0);
  });
  on("[data-wfclearstart]", ()=>{
    // User confirmed they want to change selection and restart — clear results
    // but keep re-entry tickets from prior runs (they may still be useful)
    F.stageResults={}; F.readAck={}; F.stage=0; saveFunnel(); render(); window.scrollTo(0,0);
  });
  on("[data-wf6horizon]", el=>{ F.horizon=el.dataset.wf6horizon; saveFunnel(); render(); });
  const pos=root.querySelector("#wf6pos"); if(pos) pos.onchange=e=>{ F.posSize=Math.max(0,+e.target.value||0); saveFunnel(); render(); };
  const tol=root.querySelector("#wf6tol"); if(tol) tol.onchange=e=>{ F.lossTol=Math.min(5,Math.max(0.5,+e.target.value||1.5)); saveFunnel(); render(); };
  on("[data-wf6save]", el=>{
    const t=el.dataset.wf6save;
    if(!F.qualitative) F.qualitative={};
    const ans={};
    root.querySelectorAll(`[data-wf6q^="${t}:"]`).forEach(ta=>{ ans[ta.dataset.wf6q.split(":")[1]]=ta.value; });
    F.qualitative[t]=ans; saveFunnel(); render();
  });
  on("[data-wfretest]", el=>{ const tk=F.tickets.find(x=>x.t===el.dataset.wfretest&&x.met); if(tk){ F.stage=tk.stage; F.tickets=F.tickets.filter(x=>x!==tk); saveFunnel(); render(); window.scrollTo(0,0);} });
}
