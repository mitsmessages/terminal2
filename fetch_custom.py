#!/usr/bin/env python3
"""
fetch_custom.py — incremental fetch for custom tickers only.

The full fetch_data.py takes 2-3 hours for the whole S&P 500 + Nifty 500
universe. When a user adds a stock via the Portfolio tab and downloads
custom_tickers.json, they shouldn't have to wait 3 hours for that stock
to appear in the dashboard.

This script:
  1. Reads custom_tickers.json
  2. Loads the existing data.json
  3. Fetches ONLY the custom tickers not already in data.json
  4. Merges them in and writes data.json back
  5. Writes status.json with the result

Triggered by: .github/workflows/fetch-custom.yml on push to custom_tickers.json
Runtime: ~5-10 seconds per new ticker (typically 2-3 min total)
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import yfinance as yf

STATUS_FILE = "status.json"
DATA_FILE = "public/data.json" if os.path.isdir("public") else "data.json"
CUSTOM_FILE = "custom_tickers.json"


def load_status():
    try:
        return json.load(open(STATUS_FILE))
    except Exception:
        return {}


def write_status(status):
    json.dump(status, open(STATUS_FILE, "w"), indent=2)


def load_existing_tickers():
    try:
        data = json.load(open(DATA_FILE))
        return {rec["t"] for rec in data if rec.get("t")}
    except Exception:
        return set()


def fetch_one(sym, mkt):
    """Minimal fetch for a custom ticker — same logic as fetch_data.py pull()."""
    try:
        suffix = ".NS" if mkt == "IN" else ""
        tk = yf.Ticker(sym + suffix)
        info = tk.info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        if not price:
            return None, "no price"

        # Basic fields — same keys fetch_data.py uses
        rec = {
            "t": sym, "n": info.get("shortName") or info.get("longName") or sym,
            "mkt": mkt, "sec": info.get("sector", ""),
            "price": round(float(price), 2),
            "mcap": info.get("marketCap"),
            "ev": info.get("enterpriseValue"),
            "pe": info.get("trailingPE"),
            "debt": (info.get("totalDebt") or 0) - (info.get("totalCash") or 0),
            "shares": info.get("sharesOutstanding"),
            "roe": round(info.get("returnOnEquity", 0) * 100, 2) if info.get("returnOnEquity") else None,
            "roa": round(info.get("returnOnAssets", 0) * 100, 2) if info.get("returnOnAssets") else None,
            "g": 8,  # default; overridden by fetch_estimates.py
            "divYield": round((info.get("dividendRate") or 0) / price * 100, 2) if price else 0,
            "high52": info.get("fiftyTwoWeekHigh"),
            "low52": info.get("fiftyTwoWeekLow"),
            "evEbitda": info.get("enterpriseToEbitda"),
            "annual": {}, "quarterly": {}, "bsDetail": {},
        }

        # Income statement
        try:
            inc = tk.income_stmt
            if not inc.empty:
                def get_row(df, *names):
                    for n in names:
                        if n in df.index:
                            return [float(v) / 1e7 if mkt == "IN" else float(v) / 1e6
                                    for v in df.loc[n].head(4) if v == v]
                    return []
                rec["annual"]["revenue"] = get_row(inc, "Total Revenue")
                rec["annual"]["netIncome"] = get_row(inc, "Net Income")
                rec["annual"]["grossProfit"] = get_row(inc, "Gross Profit")
                rec["annual"]["operatingIncome"] = get_row(inc, "Operating Income")
                rec["annual"]["ebitda"] = get_row(inc, "EBITDA", "Normalized EBITDA")
                rec["annual"]["periods"] = [str(c)[:10] for c in inc.columns[:4]]
        except Exception:
            pass

        # Cash flow
        try:
            cf = tk.cashflow
            if not cf.empty:
                def get_cf(df, *names):
                    for n in names:
                        if n in df.index:
                            return [float(v) / 1e7 if mkt == "IN" else float(v) / 1e6
                                    for v in df.loc[n].head(4) if v == v]
                    return []
                rec["annual"]["ocf"] = get_cf(cf, "Operating Cash Flow", "Cash From Operations")
                rec["annual"]["capex"] = get_cf(cf, "Capital Expenditure")
                ocf = rec["annual"].get("ocf", [])
                capex = rec["annual"].get("capex", [])
                rec["annual"]["fcf"] = [o + c for o, c in zip(ocf, capex)] if ocf and capex else []
        except Exception:
            pass

        return rec, None
    except Exception as e:
        return None, str(e)


def main():
    status = load_status()
    status["fetch_custom"] = {
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "status": "running"
    }
    write_status(status)

    # Load custom list
    try:
        custom = json.load(open(CUSTOM_FILE))
    except FileNotFoundError:
        print("No custom_tickers.json found — nothing to do.")
        status["fetch_custom"] = {"status": "skipped", "reason": "no custom_tickers.json",
                                  "updatedAt": datetime.now(timezone.utc).isoformat()}
        write_status(status)
        return
    except Exception as e:
        status["fetch_custom"] = {"status": "error", "error": str(e),
                                  "updatedAt": datetime.now(timezone.utc).isoformat()}
        write_status(status)
        sys.exit(1)

    jobs = [(t.strip().upper(), "US") for t in custom.get("US", [])] + \
           [(t.strip().upper(), "IN") for t in custom.get("IN", [])]

    existing = load_existing_tickers()
    new_jobs = [(t, m) for t, m in jobs if t not in existing]

    if not new_jobs:
        print(f"All {len(jobs)} custom tickers already in data.json — nothing to fetch.")
        status["fetch_custom"] = {"status": "ok", "fetched": 0, "skipped": len(jobs),
                                  "updatedAt": datetime.now(timezone.utc).isoformat()}
        write_status(status)
        return

    print(f"Fetching {len(new_jobs)} new custom ticker(s): {[t for t,m in new_jobs]}")

    # Load existing data
    try:
        data = json.load(open(DATA_FILE))
    except Exception:
        data = []

    fetched, failed = [], []
    for sym, mkt in new_jobs:
        print(f"  {sym} ({mkt}) ... ", end="", flush=True)
        rec, err = fetch_one(sym, mkt)
        if rec:
            data.append(rec)
            fetched.append(sym)
            print("ok")
        else:
            failed.append(sym)
            print(f"failed: {err}")
        time.sleep(1.5)  # be polite to Yahoo

    json.dump(data, open(DATA_FILE, "w"), indent=2)
    print(f"\nDone: {len(fetched)} fetched, {len(failed)} failed.")
    if failed:
        print(f"Failed tickers: {failed}")

    status["fetch_custom"] = {
        "status": "ok" if not failed else "partial",
        "fetched": len(fetched), "failed": len(failed),
        "failedTickers": failed,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    write_status(status)


if __name__ == "__main__":
    main()
