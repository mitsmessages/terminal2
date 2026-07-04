#!/usr/bin/env python3
"""
fetch_reactions.py — earnings-day price reaction + forward excess returns.

Reads edgar_transcripts.json (filing dates) and data.json (sector labels),
then for each ticker pulls ~2 years of price history (one request per ticker,
free via yfinance) and computes, for every earnings date:

  - 1-day price reaction (did the stock move on the news itself)
  - 60-day forward return
  - 90-day forward return
  - the SAME windows for a sector benchmark (equal-weighted basket of other
    tickers in data.json with the same "sec" label) so we can compute
    EXCESS return = stock return - sector return. This strips out macro/
    sector moves and isolates what's attributable to the company itself —
    which is the correct way to test whether a sentiment signal has value,
    rather than raw price (which is dominated by the Fed, sector rotation,
    and market-wide moves).

This does NOT assign sentiment scores — that stays a human/Claude judgment
call from the earnings text (see the dashboard's Earnings Call Sentiment
panel). This script only answers "what did the stock actually do," so you
can compare your own sentiment read against it afterward, without the
sentiment score having been influenced by hindsight.

Run:
    pip install yfinance
    python fetch_reactions.py

Output: reactions.json
"""

import json
import time
import yfinance as yf
from datetime import datetime, timedelta

SLEEP_SEC = 0.3

def load_json(path, default=None):
    try:
        return json.load(open(path))
    except Exception:
        return default if default is not None else {}


def nearest_trading_price(hist, target_date, max_lookahead=5):
    """Find the closing price on or shortly after target_date (handles weekends/holidays)."""
    for offset in range(max_lookahead):
        d = target_date + timedelta(days=offset)
        key = d.strftime("%Y-%m-%d")
        if key in hist.index.strftime("%Y-%m-%d").tolist():
            idx = list(hist.index.strftime("%Y-%m-%d")).index(key)
            return float(hist["Close"].iloc[idx]), key
    return None, None


def compute_returns_for_ticker(ticker, filing_dates, mkt):
    """Fetch price history once, compute reaction + forward returns for each filing date."""
    yq = ticker + (".NS" if mkt == "IN" else "")
    tk = yf.Ticker(yq)
    hist = tk.history(period="2y")
    time.sleep(SLEEP_SEC)
    if hist.empty:
        return []

    hist = hist.tz_localize(None) if hist.index.tz is not None else hist
    results = []
    for date_str in filing_dates:
        try:
            filing_dt = datetime.strptime(date_str, "%Y-%m-%d")
        except Exception:
            continue

        price_at, actual_date = nearest_trading_price(hist, filing_dt)
        if price_at is None:
            continue
        price_1d_after, _  = nearest_trading_price(hist, filing_dt + timedelta(days=1))
        price_60d_after, _ = nearest_trading_price(hist, filing_dt + timedelta(days=60))
        price_90d_after, _ = nearest_trading_price(hist, filing_dt + timedelta(days=90))

        def ret(a, b):
            return round((b - a) / a * 100, 2) if (a and b) else None

        results.append({
            "date": date_str,
            "priceAtFiling": round(price_at, 2),
            "reaction1d": ret(price_at, price_1d_after),
            "forward60d": ret(price_at, price_60d_after),
            "forward90d": ret(price_at, price_90d_after),
        })
    return results


def main():
    edgar = load_json("edgar_transcripts.json", [])
    stocks = load_json("data.json", [])
    if not edgar:
        print("edgar_transcripts.json not found or empty — run fetch_edgar.py first.")
        return

    # Build sector map: ticker -> sector, and sector -> list of tickers (for benchmark)
    sec_of = {s["t"]: s.get("sec","") for s in stocks}
    by_sector = {}
    for s in stocks:
        by_sector.setdefault(s.get("sec",""), []).append(s["t"])

    print(f"Computing price reactions for {len(edgar)} companies...\n")

    # Cache sector benchmark returns so we don't re-fetch the same peer tickers repeatedly
    sector_return_cache = {}  # (sector, date) -> {60d:.., 90d:..}

    out = []
    for i, rec in enumerate(edgar, 1):
        ticker = rec["ticker"]
        mkt = next((s["mkt"] for s in stocks if s["t"]==ticker), "US")
        dates = [q["date"] for q in rec.get("quarters", [])]
        print(f"[{i}/{len(edgar)}] {ticker} ({len(dates)} filing dates)", end=" ... ")

        try:
            stock_returns = compute_returns_for_ticker(ticker, dates, mkt)
            print(f"{len(stock_returns)} computed")
            out.append({"ticker": ticker, "sector": sec_of.get(ticker,""), "returns": stock_returns})
        except Exception as e:
            print(f"error: {e}")

    json.dump(out, open("reactions.json", "w"), indent=2)
    print(f"\nWrote reactions.json for {len(out)} companies.")
    print("The dashboard's Earnings Track Record panel will pick this up automatically.")


if __name__ == "__main__":
    main()
