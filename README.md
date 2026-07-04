# ▮▮ TERMINAL — Equity Analytics (static, no build step)

A Bloomberg-style screener + sector-cycle dashboard for S&P 500 + Nifty stocks.
Plain HTML/CSS/JS — no React, no Node, no npm install. Free to run and free to host.

---

## Run it locally (to check it before going live)

Browsers block `fetch()` of local files opened directly (`file://`), so you need
a tiny local server — no install required, Python already has one built in.

```
cd terminal-web
python -m http.server 8000
```
(Mac/Linux: `python3 -m http.server 8000`)

Then open **http://localhost:8000** in your browser. That's it — no npm, no build,
no `node_modules`.

---

## Refresh the data

```
pip install yfinance
python fetch_data.py
```

Writes `data.json` right next to `index.html`. Refresh the browser tab to see it.
Edit the `US` / `IN` ticker lists inside `fetch_data.py` to add or remove names.

---

## Go live for free — GitHub Pages + auto-refresh

This makes the dashboard a real public URL that refreshes itself daily, at zero cost.

### 1. Create the GitHub repo
- Go to github.com/new, create a repository (e.g. `terminal`)
- Make it **Public** (required for free Pages hosting)

### 2. Upload these files
Either drag-and-drop all files in this folder into the GitHub web UI ("Add file ->
Upload files"), or if you're comfortable with git:
```
git init
git add .
git commit -m "Initial dashboard"
git remote add origin https://github.com/YOUR_USERNAME/terminal.git
git push -u origin main
```

### 3. Turn on GitHub Pages
- In the repo: Settings -> Pages
- Source: Deploy from a branch -> Branch: main, folder: / (root)
- Save. After a minute your dashboard is live at:
  https://YOUR_USERNAME.github.io/terminal/

### 4. Turn on the daily auto-refresh
The `.github/workflows/refresh-data.yml` file is already included -- GitHub Actions
will automatically run `fetch_data.py` once a day and commit the fresh `data.json`,
so your live page always shows recent numbers without you touching anything.

To confirm it's working: repo -> Actions tab -> you should see "Refresh market
data" runs appearing daily. You can also click "Run workflow" there to trigger
an immediate refresh instead of waiting for the schedule.

This uses GitHub's free Actions minutes (a script this size uses only a few
minutes per run, well within the free monthly quota for any account).

---

## Promoter holding / insider ownership
Each tearsheet now tracks promoter holding (India) / insider ownership (US) as
a real metric, with a rising/falling signal in the Ownership category of the
signal matrix. Yahoo only exposes a current snapshot, not history -- so the
trend builds itself automatically: every time you re-run `fetch_data.py`, it
reads the previous `data.json` first and carries forward last run's value as
`prevInsiderPct`, so the trend accumulates for free across successive refreshes
(including the daily GitHub Action). The first run after this update will show
no trend yet -- it appears starting from the second refresh onward.

## Earnings call sentiment (on-demand)
Each tearsheet has an "Earnings call sentiment" panel: paste a transcript (or
several, separated by `---NEXT CALL---`, to track tone over quarters), click
"Analyze sentiment," and it builds a structured scoring prompt -- tone, guidance
language, hedging, analyst pushback, and critically, whether management's tone
matches the company's actual recent numbers -- then opens claude.ai with it
copied to your clipboard. Paste and enter, same free pattern as Ask Claude.

Honest limitation: there's no free bulk transcript API, so this only works one
stock at a time, on demand, when you paste in a transcript yourself. Free
transcript sources to search: Motley Fool, the company's own investor relations
page, or Seeking Alpha (some free, most paywalled).

## The complete analysis stack

Each tearsheet now integrates five layers instead of looking at a stock in
isolation. This is what "sophisticated" actually means here — not more
numbers, but numbers in the right context.

### 1. Fundamentals (original)
Revenue, FCF, margins, DCF, the 20-signal engine.

### 2. Macro environment — `fetch_macro.py`
Free, no API key, via yfinance tickers for US 10-year yield, crude oil,
USD/INR, VIX, gold, copper. Each stock's sector has a sensitivity profile
(e.g. Technology is hit hardest by rising rates; Energy tracks crude
directly) so the macro read is automatically tailored per stock rather
than a generic "the Fed did X" headline.
```
python fetch_macro.py     # ~10 seconds, run daily/weekly
```
Writes `macro.json`. The tearsheet's Macro Environment panel and the
Integrated Verdict pick it up automatically.

### 3. Valuation in context
Computed entirely client-side from data you already have — no extra
fetch needed. Compares a stock's P/E to its sector's median (calculated
across your whole dataset) and its FCF yield to the current risk-free
rate (10-year Treasury from macro.json). "P/E of 33" becomes "P/E is 15%
above the sector median" — the reference point that makes a multiple
meaningful.

### 4. Earnings track record — `fetch_reactions.py`
Reads the filing dates already in `edgar_transcripts.json`, pulls each
ticker's price history once (free, yfinance), and computes what the stock
actually did around each of its last ~10 earnings dates: 1-day reaction,
60/90-day forward return, and — importantly — the **excess return**
(stock return minus the average return of its sector peers over the same
window). Excess return is what's left after removing macro and sector
moves, so it's a fairer test of company-specific reaction than raw price.

This is descriptive, not predictive: it shows what happened after past
calls, not a guarantee about the next one. Deliberately built so the
sentiment score (from the Earnings Call Sentiment panel) is assigned
independently, without seeing this data first — compare your own read
against what actually happened afterward, rather than letting hindsight
bias the score.
```
python fetch_edgar.py       # must run first — provides filing dates
python fetch_reactions.py   # ~1-2 min per 10 tickers
```
Writes `reactions.json`.

### 5. Integrated verdict
Combines all of the above into one synthesized read at the top of each
tearsheet: fundamentals direction + macro tailwind/headwind + valuation
vs peers, with an explicit note on whether the layers agree or disagree.
Layers agreeing is the strongest signal; layers disagreeing is flagged as
a genuinely mixed picture rather than forced into a false consensus.

### Honest limitations across all of this
- Macro sensitivity profiles are sector-level generalizations — a specific
  company can behave differently from its sector (e.g. a debt-free tech
  company is less rate-sensitive than a leveraged one in the same sector).
- The excess-return calculation needs multiple companies per sector in
  `reactions.json` to compute a meaningful peer benchmark — run the full
  S&P 500 fetch (not just the 3-4 ticker test list) for this to work well.
- 60-90 day windows are still influenced by company-specific news beyond
  the earnings call (product launches, lawsuits, M&A) — excess return
  strips out macro/sector noise, not everything else.
- None of this predicts the future; it organizes the present and recent
  past clearly enough that you can form your own judgment faster and with
  more context than reading the numbers in isolation.

## "Ask Claude" / "Deep Research" -- free, no API key

These buttons don't call any API and cost nothing to use:
1. Click "Quick take" or "Full research brief" on any stock's tearsheet
2. The prompt (built from that stock's real numbers) is copied to your clipboard
   and claude.ai opens in a new tab
3. Paste (Ctrl/Cmd+V) into the message box and press enter

No backend, no API key, no per-click cost -- you're just using your own claude.ai
account the normal way, pre-loaded with the right prompt.

---

## What's inside

- `index.html` -- page shell
- `style.css` -- all styling
- `engine.js` -- data, DCF math, the 20-signal analysis engine
- `charts.js` -- SVG chart helpers + sector cycle knowledge base
- `app.js` -- state, rendering, all interactivity
- `fetch_data.py` -- pulls live fundamentals from Yahoo Finance (free)
- `data.json` -- the data file the page reads (generated by the script above)
- `.github/workflows/refresh-data.yml` -- free daily auto-refresh on GitHub
- `gate.js` -- simple passcode screen (see below)

## Passcode gate (simple, not real security)
The site is protected by a basic passcode prompt. Open `gate.js` and change this line
near the top to your own passcode:
```
const PASSCODE = "letmein";
```
Important honest caveat: this is NOT real security. Anyone who views the page
source or opens browser dev tools can read the passcode directly in `gate.js`.
It only deters casual visitors from stumbling onto the page -- it does not protect
sensitive data. For genuine authentication, the site would need to migrate to
Cloudflare Pages + Cloudflare Access (free, but requires moving off GitHub Pages).

After changing the passcode, re-upload `gate.js` to GitHub (Add file -> Upload
files, overwrite the existing one) and commit.

## Compare stocks
Click the "+" icon next to any stock in the Stocks tab (or "+ Add to compare" on
a tearsheet) to add it to the Compare tab -- up to 5 at once. The Compare tab
lines them up side by side across valuation, growth, cash quality, returns, and
balance-sheet metrics, plus overlaid revenue and free-cash-flow trend charts.

## Notes
- Smart filter presets (Quality compounders, Undervalued+growing, Cash machines,
  Red flags, Watchlist) sort your ~900 stocks down to what's actually relevant --
  use these instead of scrolling the full list.
- Your watchlist star and passcode unlock are saved in your browser (private to you).
- Price data is ~15 minutes delayed (Yahoo). Fine for fundamental analysis, not
  for intraday trading.
- This is an educational tool, not investment advice. Verify anything important
  against the primary sources linked on each tearsheet before acting.
