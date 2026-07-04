/* ============================================================
   GATE.JS — animated landing page + passcode screen.
   NOT real security: passcode lives in this file (visible via
   View Source). Deters casual visitors only — not a real auth.
   ============================================================ */
(function(){
  const PASSCODE    = "letmein";   // ← change to your own passcode
  const SESSION_KEY = "terminal_unlocked";
  if (sessionStorage.getItem(SESSION_KEY) === "yes") return;

  /* ── ticker data (static; gives the feel without a live feed) ── */
  const TICKERS = [
    {t:"NVDA"  ,p:"$875.40",c:"+3.12%",up:true },
    {t:"GOOGL" ,p:"$178.22",c:"-0.43%",up:false},
    {t:"AMZN"  ,p:"$192.10",c:"+1.05%",up:true },
    {t:"TSLA"  ,p:"$248.50",c:"-1.87%",up:false},
    {t:"META"  ,p:"$524.90",c:"+2.31%",up:true },
    {t:"MSFT"  ,p:"$415.32",c:"+0.87%",up:true },
    {t:"RELIANCE",p:"₹2,941",c:"+0.62%",up:true },
    {t:"TCS"   ,p:"₹3,812",c:"-0.28%",up:false},
    {t:"INFY"  ,p:"₹1,654",c:"+0.94%",up:true },
    {t:"HDFCBANK",p:"₹1,723",c:"+1.18%",up:true },
    {t:"WIPRO" ,p:"₹487.60",c:"-0.55%",up:false},
    {t:"AAPL"  ,p:"$189.30",c:"+0.72%",up:true },
    {t:"BAJFINANCE",p:"₹6,834",c:"+1.44%",up:true},
    {t:"JPM"   ,p:"$198.40",c:"-0.31%",up:false},
    {t:"LTIM"  ,p:"₹5,123",c:"+2.08%",up:true },
  ];

  /* ── build ticker HTML (doubled for seamless loop) ── */
  const tickItem = ({t,p,c,up}) =>
    `<span class="gt-tick"><b>${t}</b> ${p} <em style="color:${up?'#22c55e':'#ef4444'}">${up?'▲':'▼'} ${c}</em></span>`;
  const tickHtml = [...TICKERS,...TICKERS].map(tickItem).join('<span class="gt-sep">·</span>');

  /* ── particles ── */
  const particles = Array.from({length:28}, (_,i) => {
    const x = Math.random()*100, size = 1+Math.random()*2.5;
    const dur = 8+Math.random()*14, delay = Math.random()*12;
    const op = 0.08+Math.random()*0.25;
    return `<div class="gt-p" style="left:${x}%;width:${size}px;height:${size}px;opacity:${op};animation-duration:${dur}s;animation-delay:-${delay}s"></div>`;
  }).join('');

  document.write(`
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    #gt{position:fixed;inset:0;z-index:9999;overflow:hidden;
      background:#060c12;font-family:-apple-system,system-ui,sans-serif;}

    /* grid overlay */
    #gt::before{content:'';position:absolute;inset:0;pointer-events:none;
      background-image:linear-gradient(rgba(14,110,92,.07) 1px,transparent 1px),
        linear-gradient(90deg,rgba(14,110,92,.07) 1px,transparent 1px);
      background-size:48px 48px;}

    /* radial glow */
    #gt::after{content:'';position:absolute;top:-30%;left:50%;transform:translateX(-50%);
      width:800px;height:600px;pointer-events:none;border-radius:50%;
      background:radial-gradient(ellipse at center,rgba(14,110,92,.22) 0%,transparent 70%);}

    /* ── ticker tape ── */
    .gt-tape{position:absolute;top:0;left:0;right:0;height:36px;z-index:10;
      background:rgba(6,12,18,.85);backdrop-filter:blur(8px);
      border-bottom:1px solid rgba(14,110,92,.3);
      display:flex;align-items:center;overflow:hidden;white-space:nowrap;}
    .gt-tape-inner{display:flex;align-items:center;gap:0;
      animation:gt-scroll 38s linear infinite;}
    .gt-tape:hover .gt-tape-inner{animation-play-state:paused;}
    .gt-tick{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;
      font-family:'SF Mono',Menlo,monospace;padding:0 18px;
      color:#c9d4df;letter-spacing:.01em;}
    .gt-tick b{color:#e8edf4;font-weight:600;}
    .gt-tick em{font-style:normal;font-size:11.5px;}
    .gt-sep{color:rgba(14,110,92,.5);padding:0 4px;}
    @keyframes gt-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

    /* ── particles ── */
    .gt-p{position:absolute;bottom:-8px;border-radius:50%;
      background:rgba(14,110,92,.7);
      animation:gt-rise linear infinite;}
    @keyframes gt-rise{
      0%  {transform:translateY(0)   scale(1);  opacity:inherit}
      80% {opacity:inherit}
      100%{transform:translateY(-105vh) scale(.4);opacity:0}}

    /* ── centre card ── */
    .gt-card{position:absolute;top:50%;left:50%;
      transform:translate(-50%,-50%);
      width:360px;max-width:calc(100vw - 32px);
      background:rgba(10,18,28,.82);
      border:1px solid rgba(14,110,92,.35);
      border-radius:16px;padding:36px 32px 32px;
      backdrop-filter:blur(16px);
      box-shadow:0 0 0 1px rgba(14,110,92,.08),
                 0 32px 80px rgba(0,0,0,.6),
                 inset 0 1px 0 rgba(255,255,255,.04);
      animation:gt-appear .6s cubic-bezier(.22,1,.36,1) both;}
    @keyframes gt-appear{from{opacity:0;transform:translate(-50%,-46%)}to{opacity:1;transform:translate(-50%,-50%)}}

    /* logo */
    .gt-logo{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:6px;}
    .gt-bars{display:flex;align-items:flex-end;gap:3px;height:24px;}
    .gt-bar{width:5px;border-radius:2px 2px 0 0;background:#0e6e5c;
      animation:gt-bar-pulse 2s ease-in-out infinite;}
    .gt-bar:nth-child(1){height:12px;animation-delay:0s}
    .gt-bar:nth-child(2){height:20px;animation-delay:.2s}
    .gt-bar:nth-child(3){height:16px;animation-delay:.4s}
    @keyframes gt-bar-pulse{0%,100%{opacity:.5;transform:scaleY(1)}50%{opacity:1;transform:scaleY(1.15)}}
    .gt-wordmark{font-size:22px;font-weight:800;letter-spacing:3px;color:#e8edf4;}

    .gt-sub{text-align:center;font-size:11px;letter-spacing:2px;color:rgba(14,110,92,.8);
      text-transform:uppercase;margin-bottom:18px;}

    /* pills */
    .gt-pills{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-bottom:24px;}
    .gt-pill{font-size:11.5px;padding:4px 11px;border-radius:20px;
      border:1px solid rgba(14,110,92,.3);color:#8eb8b0;
      background:rgba(14,110,92,.08);white-space:nowrap;}

    /* input */
    .gt-input{width:100%;padding:11px 14px;border-radius:8px;
      border:1px solid rgba(14,110,92,.3);
      background:rgba(6,12,18,.7);color:#e8edf4;font-size:14px;
      outline:none;transition:border-color .2s;margin-bottom:10px;
      font-family:inherit;}
    .gt-input:focus{border-color:rgba(14,110,92,.8);
      box-shadow:0 0 0 3px rgba(14,110,92,.12);}
    .gt-input::placeholder{color:rgba(200,210,220,.3);}

    /* button */
    .gt-btn{width:100%;padding:12px;border:none;border-radius:8px;
      background:linear-gradient(135deg,#0e6e5c,#0a5a4b);
      color:#fff;font-size:13.5px;font-weight:700;letter-spacing:1.5px;
      cursor:pointer;transition:all .2s;text-transform:uppercase;}
    .gt-btn:hover{background:linear-gradient(135deg,#12806b,#0e6e5c);
      transform:translateY(-1px);box-shadow:0 6px 24px rgba(14,110,92,.35);}
    .gt-btn:active{transform:translateY(0);}

    .gt-err{color:#f87171;font-size:12px;margin-top:8px;text-align:center;
      min-height:18px;transition:opacity .2s;}

    /* footer */
    .gt-footer{position:absolute;bottom:14px;left:0;right:0;text-align:center;
      font-size:11px;color:rgba(200,210,220,.2);letter-spacing:.5px;}

    /* exit animation */
    #gt.gt-exit{animation:gt-out .45s cubic-bezier(.4,0,1,1) both;}
    @keyframes gt-out{to{opacity:0;transform:scale(1.04)}}

    @media(prefers-reduced-motion:reduce){
      .gt-tape-inner,.gt-p,.gt-bar,.gt-card{animation:none!important}}
  </style>

  <div id="gt">
    <div class="gt-tape"><div class="gt-tape-inner">${tickHtml}</div></div>
    ${particles}
    <div class="gt-card">
      <div class="gt-logo">
        <div class="gt-bars">
          <div class="gt-bar"></div>
          <div class="gt-bar"></div>
          <div class="gt-bar"></div>
        </div>
        <div class="gt-wordmark">TERMINAL</div>
      </div>
      <div class="gt-sub">Equity Analytics · S&P 500 + Nifty 500</div>
      <div class="gt-pills">
        <span class="gt-pill">🌐 S&P 500 + Nifty 500</span>
        <span class="gt-pill">⚡ 20-signal engine</span>
        <span class="gt-pill">◎ DCF intrinsic value</span>
        <span class="gt-pill">📊 Macro read-through</span>
        <span class="gt-pill">🔍 6-stage funnel</span>
        <span class="gt-pill">📁 Portfolio audit</span>
      </div>
      <input class="gt-input" id="gateInput" type="password"
        placeholder="Enter passcode" autocomplete="current-password" autofocus/>
      <button class="gt-btn" id="gateBtn">ENTER TERMINAL →</button>
      <div class="gt-err" id="gateErr"></div>
    </div>
    <div class="gt-footer">Educational tool · Not investment advice · Free, no ads</div>
  </div>`);

  function unlock() {
    const input = document.getElementById("gateInput");
    const err   = document.getElementById("gateErr");
    if (input.value === PASSCODE) {
      sessionStorage.setItem(SESSION_KEY, "yes");
      const gate = document.getElementById("gt");
      gate.classList.add("gt-exit");
      gate.addEventListener("animationend", () => gate.remove(), {once:true});
    } else {
      err.textContent = "Incorrect passcode";
      input.value = "";
      input.focus();
      setTimeout(() => { err.textContent = ""; }, 2200);
    }
  }

  window.addEventListener("DOMContentLoaded", function() {
    document.getElementById("gateBtn").addEventListener("click", unlock);
    document.getElementById("gateInput").addEventListener("keydown", function(e) {
      if (e.key === "Enter") unlock();
    });
  });
})();
