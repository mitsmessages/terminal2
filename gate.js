/* ============================================================
   GATE.JS — simple passcode screen.
   NOT real security: the passcode lives in this file, which
   anyone can view via "View Source" or browser dev tools. This
   only deters casual visitors, it does not protect sensitive
   data. For genuine authentication, see README.md.
   ============================================================ */
(function(){
  const PASSCODE = "letmein"; // <-- change this to your own passcode
  const SESSION_KEY = "terminal_unlocked";

  if (sessionStorage.getItem(SESSION_KEY) === "yes") return; // already unlocked this session

  document.write(`
    <div id="gate" style="position:fixed;inset:0;background:#0a0e14;color:#e8edf4;
      display:flex;align-items:center;justify-content:center;z-index:9999;
      font-family:-apple-system,system-ui,sans-serif;">
      <form id="gateForm" style="background:#10161f;border:1px solid #2a3441;border-radius:10px;
        padding:32px 36px;width:280px;text-align:center;">
        <div style="font-weight:800;letter-spacing:1px;margin-bottom:18px;font-size:15px;color:#38bdf8;">▮▮ TERMINAL</div>
        <input id="gateInput" type="password" placeholder="Enter passcode" autofocus
          style="width:100%;padding:10px 12px;border-radius:6px;border:1px solid #2a3441;
          background:#0a0e14;color:#e8edf4;font-size:14px;box-sizing:border-box;outline:none;"/>
        <button type="submit" style="width:100%;margin-top:10px;padding:10px;border:none;
          border-radius:6px;background:#38bdf8;color:#04121c;font-weight:700;cursor:pointer;">Enter</button>
        <div id="gateError" style="color:#f87171;font-size:12px;margin-top:10px;display:none;">Incorrect passcode</div>
      </form>
    </div>
  `);

  window.addEventListener("DOMContentLoaded", function(){
    const form = document.getElementById("gateForm");
    const input = document.getElementById("gateInput");
    const err = document.getElementById("gateError");
    form.addEventListener("submit", function(e){
      e.preventDefault();
      if (input.value === PASSCODE) {
        sessionStorage.setItem(SESSION_KEY, "yes");
        document.getElementById("gate").remove();
      } else {
        err.style.display = "block";
        input.value = "";
        input.focus();
      }
    });
  });
})();
