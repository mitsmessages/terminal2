# Fix Pack — Change Map

Every change, the condition it alters, and the on-screen behavior difference. Deploy the 5 modified files together (engine.js, app.js, fetch_data.py, fetch_macro.py, fetch_estimates.py). Verified: 32 edge-case unit tests + full jsdom browser smoke test (render → estimates merge → tearsheet open → score consistency), zero errors, including the null-data path.

## A1 — DCF growth now comes from analyst consensus
- `engine.js`: new `applyEstimatesGrowth(stocks, estimatesMap)`. Prefers `revenueGrowthEstimate`, then `epsGrowthNextYear`, then `epsGrowthCurrentYear`; clamps to 0–30%; records `gSource` for honest labeling. No coverage → keeps 8% but labels it "default assumption — low confidence."
- `app.js`: calls the merge when estimates.json loads; every intrinsic value, margin of safety, valuation pillar, and quadrant recomputes automatically. DCF panel now shows: "Starting growth: X% — analyst consensus (N analysts)" or the labeled default.
- `fetch_estimates.py`: **default run now fetches the full universe** — it previously defaulted to a 3-ticker test list, which would have starved this fix of data.
- Behavior change: growth stocks stop looking uniformly overvalued; slow growers stop looking falsely cheap. The DCF and Analyst Outlook panels can no longer contradict each other.

## A2 — Macro sensitivity map keys fixed
- `engine.js`: keys now match yfinance's exact sector strings; added Consumer Defensive, Basic Materials, Utilities (rates −2), Real Estate (rates −2). Previously ~7 of 11 sectors silently fell through to zero sensitivity.
- Behavior change: macro tailwind/headwind reads now appear for Healthcare, Industrials, Consumer, Communication Services, Utilities, Real Estate, Basic Materials stocks.

## A3 — Altman Z three-way routing
- Financial Services → **suppressed** with explanation (Altman excluded financials; leverage is the business model). No more "Distress zone" on healthy banks contradicting the Return Authenticity card.
- Manufacturers (Industrials, Basic Materials, Energy, Consumer Cyclical/Defensive) → original 1968 Z (zones 2.99 / 1.81).
- Everyone else (Tech, Healthcare, Comm, Utilities, Real Estate) → Altman Z″ non-manufacturer revision: 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·(book equity/liabilities), zones 2.6 / 1.1. Each read states which variant was used and why.

## A4 — Risk-free rate matches the stock's market
- `fetch_macro.py`: adds `in10y` series (manually-maintained constant, clearly labeled with update date — Yahoo has no reliable India 10Y ticker; the constant drifts quarterly, not daily).
- `engine.js` `valuationContext`: IN stocks benchmark FCF yield against India 10Y; US against US 10Y; returns the label. Missing India data → honest "—" instead of a wrong-country comparison.
- `app.js`: spread row shows which bond it used.
- Behavior change: removes a ~3pt systematic "cheapness" bias on every NIFTY name.

## A5 — LBO model charges interest
- `engine.js` `valuationExtras`: acquisition debt (4.5× EBITDA) now accrues 9% interest; only FCF **after interest** pays principal; if FCF can't cover interest, output is "no LBO floor exists" instead of a fabricated price. Capital structures separated: buyer pays EV, sellers receive EV − today's net debt.
- Behavior change: LBO floor prices drop materially (they were overstated); unleverageable businesses now say so.

## A6 — Quarterly signals are seasonality-free
- `engine.js`: new `qyoy()` (Q0 vs Q4). Primary quarterly warn is now "Quarterly revenue declining YoY"; sequential QoQ only fires as a fallback with an explicit "seasonality not stripped" caveat when fewer than 5 quarters exist. "Profit outpacing sales" and the momentum-pillar inflection check use YoY when available and say which basis was used. `revQyoy/niQyoy/fcfQyoy` exposed on every analyzed stock.
- Behavior change: festive-quarter Indian names and Q4-heavy US retail stop flip-flopping between warnings and greens each quarter.

## B1 — One quality score
- `engine.js`: `healthScore` is now **the same weighted pillar composite the Decision Engine quadrant uses** (growth 20 · profitability 20 · cash quality 25 · balance sheet 15 · returns 20). The old count-based formula (which double-counted correlated flags) is gone. `analyze()` also attaches `pillars` to every row.
- `app.js`: table hint and compare-view label updated ("Quality score").
- Behavior change: the screener table pill, the tearsheet, and the quadrant can never disagree — they are one number.

## B2 — Shared THRESH constants
- `engine.js`: new `THRESH` block (fcfNi 1.1/0.9/0.7, debt/EBITDA 1.5/3/4, EBITDA margin 30/15, FCF yield 5/2, PEG 1/2.5, MoS 25/10, decel −5/+3). Flag engine and cash-quality pillar both read it. Flag policy: warn fires at the pillar's serious-penalty line (<0.7), good at the pillar's positive line (≥0.9); the 0.7–0.9 band is the pillar's "moderate gap" with no flag.
- Behavior change: no more green flag beside a weak pillar for the same number. Future threshold edits happen in one place.

## B3 — Incremental economics guard
- Requires ≥5% cumulative revenue growth before dividing; near-flat revenue → "can't be measured meaningfully" instead of a 600% nonsense margin.

## B4 — Reverse-DCF ceiling honesty
- Search capped at 45% now reports `impliedTxt: "45%+"`, score 15, "beyond the range this model can even solve for" — instead of silently printing 45% as if it were the answer. Reverse-DCF also uses the same corrected fade as the forward DCF, so the two are directly comparable.

## B5 — cagr fixed
- New `cagrX()`: endpoint-to-endpoint with true period count (nulls inside no longer shrink the year count); a negative **middle** year computes with an annotation instead of erasing the figure; negative **endpoint** honestly returns null. `revCagrX/fcfCagrX` exposed with notes.

## B7 — Dividend yield version-proof
- `fetch_data.py`: computes `dividendRate / price × 100` (unambiguous); falls back to the raw field with fraction-vs-percent normalization.

## B8 — DCF math hardening
- Fade weights now `y/years`, so growth equals the terminal rate exactly in the final explicit year (old weights left a persistent upward bias).
- Guard: returns null when discount − terminal < 1pt (exploding Gordon denominator).
- `app.js`: sliders enforce terminal ≤ discount − 2 in both directions.

## Not changed (deliberately)
- Piotroski (already honestly adapted), Beneish (D&A approximation to be disclosed in UI text during the funnel build), sector-percentile scoring (B9 — that's the v2 scoring engine, next phase), screener presets (they reference fcfNi 0.9 which already matches THRESH).

## Next phase (agreed)
Interactive Workflow tab: Stage 0 index+sector selection (with NSE classification fetcher) → 6 teaching stages, each with validate → explain → apply, every filter condition mapped and documented in layman terms, re-entry tickets for disqualified stocks.
