#!/usr/bin/env python3
"""
fetch_price_history.py — weekly closing price history for the tearsheet's
price chart.

Pulls ~2 years of price history per ticker via yfinance (the same source
as everything else in this pipeline), downsampled to weekly closes. Daily
closes for 900+ stocks would make price_history.json needlessly large for
no real benefit at the zoom level this chart is actually viewed at.

Run:
    pip install yfinance
    python fetch_price_history.py

Output: price_history.json
"""

import json
import time
import yfinance as yf

SLEEP_SEC = 0.15
TEST_TICKERS = ["AAPL", "MSFT", "NVDA", "TCS"]


def load_universe():
    """Reuse the exact ticker list fetch_data.py already maintains."""
    try:
        import fetch_data
        return [(t, "US") for t in fetch_data.US] + [(t, "IN") for t in fetch_data.IN]
    except Exception as e:
        print(f"Could not import fetch_data.py ticker lists ({e}); using test list only.")
        return [(t, "US") for t in TEST_TICKERS]


def pull_history(ticker, mkt):
    yq = ticker + (".NS" if mkt == "IN" else "")
    tk = yf.Ticker(yq)
    hist = tk.history(period="2y", interval="1wk")
    if hist.empty:
        return None
    dates = [d.strftime("%Y-%m-%d") for d in hist.index]
    closes = [round(float(c), 2) for c in hist["Close"]]
    # Average daily traded VALUE over the last ~quarter (13 weekly bars):
    # weekly Volume x Close / 5 trading days. Feeds the Stage 6 liquidity
    # check ("is my position <= 5% of a typical day's trading?").
    # Scaled: IN -> ₹ crore/day, US -> $ million/day.
    adv = None
    try:
        recent = hist.tail(13)
        vals = (recent["Close"] * recent["Volume"]).dropna()
        if len(vals) >= 4:
            daily = float(vals.mean()) / 5.0
            adv = round(daily / (1e7 if mkt == "IN" else 1e6), 2)
    except Exception:
        pass
    return dates, closes, adv


def main(use_test_list=False):
    tickers = [(t, "US") for t in TEST_TICKERS] if use_test_list else load_universe()
    print(f"\nPrice history fetch — {len(tickers)} tickers")
    print("Source: Yahoo Finance weekly closes, 2yr window (free, via yfinance)")
    print("=" * 55)

    try:
        existing = {e["ticker"]: e for e in json.load(open("price_history.json"))}
        print(f"Loaded {len(existing)} existing records.\n")
    except Exception:
        existing = {}

    results = dict(existing)
    for i, (ticker, mkt) in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}] {ticker}", end=" ... ")
        try:
            r = pull_history(ticker, mkt)
            if r is None:
                print("no data, skipping")
                continue
            dates, closes, adv = r
            results[ticker] = {"ticker": ticker, "dates": dates, "closes": closes, "adv": adv}
            print(f"{len(dates)} weekly points" + (f", ADV {adv}" if adv else ""))
        except Exception as e:
            print(f"error: {e}")
        time.sleep(SLEEP_SEC)

    out = list(results.values())
    json.dump(out, open("price_history.json", "w"))
    print(f"\nWrote price_history.json with {len(out)} companies.")
    print("The dashboard's price chart will pick this up automatically.")
    print("To run the full universe (~2-3 hrs): change use_test_list=False in main()")


if __name__ == "__main__":
    main(use_test_list=False)  # full universe by default — Stage 6 liquidity needs coverage
