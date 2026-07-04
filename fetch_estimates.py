#!/usr/bin/env python3
"""
fetch_estimates.py — analyst consensus estimates + revision trends.

Free, via yfinance's Ticker attributes (no separate API key, same
library already used everywhere else in this pipeline):
  - earnings_estimate  : consensus EPS estimate, # analysts, growth %
  - growth_estimates    : consensus growth rate by period
  - eps_trend           : how the EPS estimate has moved over 7/30/60/90 days
                          -- this is the revision-trend signal, one of the
                          most predictive short-term factors in the academic
                          literature, and it's genuinely free.
  - analyst_price_targets : mean/high/low/current target price
  - get_recommendations() : buy/hold/sell breakdown

None of this requires guessing -- it's the analyst community's own
published numbers, aggregated by Yahoo Finance for free.

Run:
    pip install yfinance
    python fetch_estimates.py

Output: estimates.json
"""

import json
import time
import yfinance as yf

SLEEP_SEC = 0.2
TEST_TICKERS = ["AAPL", "MSFT", "NVDA"]

SP500_PLACEHOLDER_NOTE = """
Uses the same ticker list convention as fetch_data.py -- import it directly
to stay in sync rather than duplicating the list here.
"""


def load_universe():
    """Reuse the exact ticker list fetch_data.py already maintains."""
    try:
        import fetch_data
        tickers = [(t, "US") for t in fetch_data.US] + [(t, "IN") for t in fetch_data.IN]
        return tickers
    except Exception as e:
        print(f"Could not import fetch_data.py ticker lists ({e}); using test list only.")
        return [(t, "US") for t in TEST_TICKERS]


def safe_get(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def pull_estimates(ticker, mkt):
    yq = ticker + (".NS" if mkt == "IN" else "")
    tk = yf.Ticker(yq)

    out = {"ticker": ticker}

    # --- Earnings estimate (consensus EPS, # analysts, growth) ---
    ee = safe_get(lambda: tk.earnings_estimate)
    if ee is not None and not ee.empty:
        try:
            row = ee.loc["0y"] if "0y" in ee.index else ee.iloc[0]
            out["epsEstimateCurrentYear"] = float(row.get("avg")) if row.get("avg") is not None else None
            out["numAnalysts"] = int(row.get("numberOfAnalysts")) if row.get("numberOfAnalysts") is not None else None
            out["epsGrowthCurrentYear"] = float(row.get("growth")) * 100 if row.get("growth") is not None else None
        except Exception:
            pass
        try:
            row1 = ee.loc["+1y"] if "+1y" in ee.index else None
            if row1 is not None:
                out["epsEstimateNextYear"] = float(row1.get("avg")) if row1.get("avg") is not None else None
                out["epsGrowthNextYear"] = float(row1.get("growth")) * 100 if row1.get("growth") is not None else None
        except Exception:
            pass

    # --- Revenue growth estimate ---
    ge = safe_get(lambda: tk.growth_estimates)
    if ge is not None and not ge.empty:
        try:
            out["revenueGrowthEstimate"] = float(ge.iloc[0].get(ticker if ticker in ge.columns else ge.columns[0])) * 100
        except Exception:
            pass

    # --- EPS trend (revision history: current / 7d ago / 30d ago / 60d ago / 90d ago) ---
    et = safe_get(lambda: tk.eps_trend)
    if et is not None and not et.empty:
        try:
            row = et.loc["0y"] if "0y" in et.index else et.iloc[0]
            current = row.get("current")
            days90 = row.get("90daysAgo")
            if current is not None and days90 is not None and days90 != 0:
                out["estimateRevision90d"] = round((current - days90) / abs(days90) * 100, 2)
            days30 = row.get("30daysAgo")
            if current is not None and days30 is not None and days30 != 0:
                out["estimateRevision30d"] = round((current - days30) / abs(days30) * 100, 2)
        except Exception:
            pass

    # --- Analyst price targets ---
    pt = safe_get(lambda: tk.analyst_price_targets)
    if pt is not None:
        out["priceTargetMean"] = pt.get("mean")
        out["priceTargetHigh"] = pt.get("high")
        out["priceTargetLow"] = pt.get("low")
        out["priceTargetCurrent"] = pt.get("current")

    # --- Recommendation breakdown ---
    rec = safe_get(lambda: tk.get_recommendations())
    if rec is not None and not rec.empty:
        try:
            row = rec.iloc[0]
            out["recStrongBuy"] = int(row.get("strongBuy", 0))
            out["recBuy"] = int(row.get("buy", 0))
            out["recHold"] = int(row.get("hold", 0))
            out["recSell"] = int(row.get("sell", 0))
            out["recStrongSell"] = int(row.get("strongSell", 0))
        except Exception:
            pass

    # Only keep records with at least some real signal
    has_data = any(k in out for k in
        ["epsEstimateCurrentYear", "priceTargetMean", "estimateRevision90d"])
    return out if has_data else None


def main(use_test_list=True):
    tickers = [(t, "US") for t in TEST_TICKERS] if use_test_list else load_universe()
    print(f"\nAnalyst estimates fetch — {len(tickers)} tickers")
    print("Source: Yahoo Finance consensus estimates (free, via yfinance)")
    print("=" * 55)

    try:
        existing = {e["ticker"]: e for e in json.load(open("estimates.json"))}
        print(f"Loaded {len(existing)} existing records.\n")
    except Exception:
        existing = {}

    results = dict(existing)
    for i, (ticker, mkt) in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}] {ticker}", end=" ... ")
        try:
            rec = pull_estimates(ticker, mkt)
            if rec:
                results[ticker] = rec
                print(f"got {len(rec)-1} fields")
            else:
                print("no analyst coverage found, skipping")
        except Exception as e:
            print(f"error: {e}")
        time.sleep(SLEEP_SEC)

    out = list(results.values())
    json.dump(out, open("estimates.json", "w"), indent=2)
    print(f"\nWrote estimates.json with {len(out)} companies.")
    print("The dashboard's Analyst Outlook panel will pick this up automatically.")


if __name__ == "__main__":
    main(use_test_list=True)
