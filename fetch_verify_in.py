#!/usr/bin/env python3
"""
fetch_verify_in.py — cross-checks data.json's Indian price data against
NSE's own official numbers, two ways:

  1. Current price + previous close, via NSE's per-symbol quote API
     (api/quote-equity). This needs a real browser session (visit the site
     once to receive cookies, then call the API with those cookies) --
     the same pattern used by widely-adopted open-source NSE tools like
     nsepython and jugaad-data. This is the more valuable check, because
     price drives every ratio computed elsewhere in the dashboard.

  2. 52-week high/low, via NSE's official "adjusted for corporate actions"
     report -- a plain CSV archive, no session needed. This is what
     originally caught the Vedanta demerger issue.

Honest caveat: NSE's website has changed access patterns before (a static
bhavcopy path broke in July 2024) and can rate-limit or bot-block requests
that come in too fast or without realistic browser headers. This script
paces requests deliberately and fails gracefully -- a stock that can't be
verified just gets skipped, not treated as an error.

Run:
    pip install requests
    python fetch_verify_in.py

Output: verify_in.json
"""

import json
import csv
import io
import time
from datetime import datetime, timedelta
import requests

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
API_HEADERS = {
    **BROWSER_HEADERS,
    "Accept": "application/json",
    "Referer": "https://www.nseindia.com/",
    "X-Requested-With": "XMLHttpRequest",
}
SLEEP_SEC = 0.6  # deliberately gentle -- this is a shared public site, not a dedicated API
TEST_TICKERS = ["RELIANCE", "TCS", "INFY"]


def load_data_json():
    try:
        return {s["t"]: s for s in json.load(open("data.json")) if s.get("mkt") == "IN"}
    except Exception:
        return {}


def new_session():
    """Visit the site once to get a valid session/cookies before hitting the API."""
    s = requests.Session()
    try:
        s.get("https://www.nseindia.com/", headers=BROWSER_HEADERS, timeout=15)
        time.sleep(0.5)
        s.get("https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE",
              headers=BROWSER_HEADERS, timeout=15)
    except Exception as e:
        print(f"  Warning: couldn't establish NSE session ({e}) -- quote checks will be skipped.")
    return s


def fetch_quote(session, symbol):
    try:
        r = session.get(f"https://www.nseindia.com/api/quote-equity?symbol={symbol}",
                         headers=API_HEADERS, timeout=15)
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def try_fetch_nse_52wk(days_back_max=10):
    today = datetime.utcnow() + timedelta(hours=5, minutes=30)  # IST
    for days_back in range(days_back_max):
        d = today - timedelta(days=days_back)
        date_str = d.strftime("%d%m%Y")
        url = f"https://nsearchives.nseindia.com/content/CM_52_wk_High_low_{date_str}.csv"
        try:
            r = requests.get(url, headers=BROWSER_HEADERS, timeout=15)
            if r.status_code == 200 and "SYMBOL" in r.text[:2000]:
                print(f"  Found 52wk report for {d.strftime('%d-%b-%Y')}")
                return r.text
        except Exception:
            pass
        time.sleep(0.2)
    return None


def parse_nse_csv(text):
    out = {}
    reader = csv.reader(io.StringIO(text))
    header_seen = False
    for row in reader:
        if not row or len(row) < 5:
            continue
        if not header_seen:
            if "SYMBOL" in row[0].upper():
                header_seen = True
            continue
        try:
            symbol = row[0].strip().strip('"')
            high = float(row[2].strip().strip('"'))
            low = float(row[4].strip().strip('"'))
            out[symbol] = (high, low)
        except (ValueError, IndexError):
            continue
    return out


def pct_diff(a, b):
    if a is None or b is None or b == 0:
        return None
    return round((a - b) / abs(b) * 100, 2)


def main(use_test_list=True):
    stocks = load_data_json()
    tickers = TEST_TICKERS if use_test_list else list(stocks.keys())
    if not stocks:
        print("data.json not found or has no Indian stocks — run fetch_data.py first.")
        return

    try:
        existing = {e["ticker"]: e for e in json.load(open("verify_in.json"))}
    except Exception:
        existing = {}
    results = dict(existing)

    # ---- Part 1: current price + previous close, per symbol ----
    print("Establishing NSE session for live price verification...")
    session = new_session()
    price_verified = 0
    for i, ticker in enumerate(tickers, 1):
        if ticker not in stocks:
            continue
        print(f"[{i}/{len(tickers)}] {ticker} price check", end=" ... ")
        quote = fetch_quote(session, ticker)
        time.sleep(SLEEP_SEC)
        if not quote:
            print("no response, skipping")
            continue
        try:
            nse_price = quote.get("priceInfo", {}).get("lastPrice")
            nse_prev_close = quote.get("priceInfo", {}).get("previousClose")
            yf_price = stocks[ticker].get("price")
            price_diff = pct_diff(yf_price, nse_price)
            rec = results.get(ticker, {"ticker": ticker})
            rec["nsePrice"] = nse_price
            rec["priceDiffPct"] = price_diff if price_diff and abs(price_diff) > 3 else None
            results[ticker] = rec
            price_verified += 1
            print(f"Yahoo {yf_price} vs NSE {nse_price}" + (" ⚑" if rec["priceDiffPct"] else ""))
        except Exception as e:
            print(f"parse error: {e}")

    # ---- Part 2: official adjusted 52-week high/low (no session needed) ----
    print("\nFetching NSE's official adjusted 52-week high/low report...")
    csv_text = try_fetch_nse_52wk()
    range_verified = 0
    if csv_text:
        nse_data = parse_nse_csv(csv_text)
        print(f"Parsed {len(nse_data)} symbols.\n")
        for ticker in tickers:
            if ticker not in stocks or ticker not in nse_data:
                continue
            nse_high, nse_low = nse_data[ticker]
            yf_high, yf_low = stocks[ticker].get("high52"), stocks[ticker].get("low52")
            high_diff = pct_diff(yf_high, nse_high)
            low_diff = pct_diff(yf_low, nse_low)
            rec = results.get(ticker, {"ticker": ticker})
            rec["nseHigh52"], rec["nseLow52"] = nse_high, nse_low
            rec["high52DiffPct"] = high_diff if high_diff and abs(high_diff) > 5 else None
            rec["low52DiffPct"] = low_diff if low_diff and abs(low_diff) > 5 else None
            results[ticker] = rec
            range_verified += 1
            if rec["high52DiffPct"] or rec["low52DiffPct"]:
                print(f"  ⚑ {ticker}: Yahoo {yf_high}/{yf_low} vs NSE {nse_high}/{nse_low}")
    else:
        print("Could not reach NSE's 52-week report today -- NSE periodically changes")
        print("endpoint structure (happened mid-2024). Price verification above is")
        print("unaffected; this just means the range check is skipped this run.")

    json.dump(list(results.values()), open("verify_in.json", "w"), indent=2)
    print(f"\nWrote verify_in.json — {price_verified} price checks, {range_verified} range checks.")
    print("The dashboard's Data Integrity panel will pick this up automatically.")


if __name__ == "__main__":
    main(use_test_list=True)
