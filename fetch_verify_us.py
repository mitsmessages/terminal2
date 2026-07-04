#!/usr/bin/env python3
"""
fetch_verify_us.py — cross-checks data.json's US fundamentals against the
actual figures companies filed with the SEC.

Yahoo Finance (and yfinance) aggregate and sometimes re-derive financial
statement figures, which occasionally diverge from what a company actually
filed -- different fiscal period alignment, different consolidation
treatment, or a straightforward parsing slip on the aggregator's side.

The SEC's XBRL "Company Facts" API returns the exact tagged figures from
official filings -- free, no API key, no rate-limit key needed beyond a
descriptive User-Agent (same requirement as fetch_edgar.py).

This does NOT replace data.json's numbers -- it produces a separate
verify_us.json the dashboard uses to show a "does this match the primary
source" badge, so you can see at a glance which stocks' figures are
independently confirmed versus which show a gap worth investigating.

Run:
    pip install requests
    python fetch_verify_us.py

Output: verify_us.json
"""

import json
import time
import requests

USER_AGENT = "TerminalDashboard yourname@email.com"  # same requirement as fetch_edgar.py
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}
SLEEP_SEC = 0.15
TEST_TICKERS = ["AAPL", "MSFT", "NVDA"]

REVENUE_TAGS = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues",
                "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"]
NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss"]
ASSETS_TAGS = ["Assets"]
LIABILITIES_TAGS = ["Liabilities", "LiabilitiesAndStockholdersEquity"]


def get_cik_map():
    print("Loading EDGAR ticker→CIK map...")
    r = requests.get("https://www.sec.gov/files/company_tickers.json",
                      headers={"User-Agent": USER_AGENT}, timeout=15)
    r.raise_for_status()
    raw = r.json()
    return {v["ticker"].upper(): str(v["cik_str"]).zfill(10) for v in raw.values()}


def latest_annual_value(facts, tags):
    """Pull the most recent 10-K (annual, ~365-day period) value for the first matching tag."""
    for tag in tags:
        node = facts.get("us-gaap", {}).get(tag)
        if not node:
            continue
        units = node.get("units", {}).get("USD", [])
        annual = [u for u in units if u.get("form") == "10-K" and u.get("fp") == "FY"]
        if not annual:
            annual = [u for u in units if u.get("form") == "10-K"]
        if not annual:
            continue
        annual.sort(key=lambda u: u.get("end", ""), reverse=True)
        return annual[0]["val"], annual[0].get("end")
    return None, None


def load_data_json():
    try:
        return {s["t"]: s for s in json.load(open("data.json")) if s.get("mkt") == "US"}
    except Exception:
        return {}


def pct_diff(a, b):
    if a is None or b is None or b == 0:
        return None
    return round((a - b) / abs(b) * 100, 2)


def main(use_test_list=True):
    stocks = load_data_json()
    tickers = TEST_TICKERS if use_test_list else list(stocks.keys())
    if not stocks:
        print("data.json not found or has no US stocks — run fetch_data.py first.")
        return

    cik_map = get_cik_map()
    print(f"\nVerifying {len(tickers)} US tickers against SEC-filed figures...\n")

    try:
        existing = {e["ticker"]: e for e in json.load(open("verify_us.json"))}
    except Exception:
        existing = {}

    results = dict(existing)
    for i, ticker in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}] {ticker}", end=" ... ")
        if ticker not in cik_map:
            print("no CIK found, skipping")
            continue
        if ticker not in stocks:
            print("not in data.json, skipping")
            continue
        cik = cik_map[ticker]
        try:
            r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json",
                              headers=HEADERS, timeout=20)
            time.sleep(SLEEP_SEC)
            if r.status_code != 200:
                print(f"SEC returned {r.status_code}, skipping")
                continue
            facts = r.json()
            sec_rev, rev_date = latest_annual_value(facts, REVENUE_TAGS)
            sec_ni, ni_date = latest_annual_value(facts, NET_INCOME_TAGS)
            sec_assets, assets_date = latest_annual_value(facts, ASSETS_TAGS)
            sec_liab, liab_date = latest_annual_value(facts, LIABILITIES_TAGS)

            yf_rev = (stocks[ticker].get("annual", {}).get("revenue") or [None])[0]
            yf_ni = (stocks[ticker].get("annual", {}).get("netIncome") or [None])[0]
            yf_assets = (stocks[ticker].get("bsDetail", {}).get("totalAssets") or [None])[0]
            yf_liab = (stocks[ticker].get("bsDetail", {}).get("totalLiab") or [None])[0]
            # data.json stores in $bn; SEC gives raw dollars
            yf_rev_raw = yf_rev * 1e9 if yf_rev is not None else None
            yf_ni_raw = yf_ni * 1e9 if yf_ni is not None else None
            yf_assets_raw = yf_assets * 1e9 if yf_assets is not None else None
            yf_liab_raw = yf_liab * 1e9 if yf_liab is not None else None

            rev_diff = pct_diff(yf_rev_raw, sec_rev)
            ni_diff = pct_diff(yf_ni_raw, sec_ni)
            assets_diff = pct_diff(yf_assets_raw, sec_assets)
            liab_diff = pct_diff(yf_liab_raw, sec_liab)

            results[ticker] = {
                "ticker": ticker,
                "secRevenue": round(sec_rev / 1e9, 3) if sec_rev else None,
                "secNetIncome": round(sec_ni / 1e9, 3) if sec_ni else None,
                "secAssets": round(sec_assets / 1e9, 3) if sec_assets else None,
                "secLiabilities": round(sec_liab / 1e9, 3) if sec_liab else None,
                "secRevenueDate": rev_date, "secNetIncomeDate": ni_date,
                "revenueDiffPct": rev_diff if rev_diff and abs(rev_diff) > 8 else None,
                "netIncomeDiffPct": ni_diff if ni_diff and abs(ni_diff) > 8 else None,
                "assetsDiffPct": assets_diff if assets_diff and abs(assets_diff) > 8 else None,
                "liabilitiesDiffPct": liab_diff if liab_diff and abs(liab_diff) > 8 else None,
            }
            flags = [results[ticker][k] for k in
                     ("revenueDiffPct","netIncomeDiffPct","assetsDiffPct","liabilitiesDiffPct")]
            flag = " ⚑" if any(flags) else ""
            print(f"rev diff {rev_diff}%, NI diff {ni_diff}%, assets diff {assets_diff}%, liab diff {liab_diff}%{flag}")
        except Exception as e:
            print(f"error: {e}")

    json.dump(list(results.values()), open("verify_us.json", "w"), indent=2)
    print(f"\nWrote verify_us.json with {len(results)} companies.")
    print("The dashboard's Data Integrity panel will pick this up automatically.")


if __name__ == "__main__":
    main(use_test_list=True)
