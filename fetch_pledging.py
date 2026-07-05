#!/usr/bin/env python3
"""
fetch_pledging.py — promoter share-pledging data for Indian stocks (Stage 2.4).

Why this matters: promoters borrowing against their own shares creates a
forced-selling doom-loop when the price falls. Above ~50% of the promoter
stake pledged, that risk is structural regardless of business quality
(the 2019 Zee / Yes Bank promoter episodes).

Source: NSE's own corporate disclosure API (SAST pledge disclosures) —
free and official, but NOT a stable documented API: it requires a browser
User-Agent and a cookie warm-up, and NSE has changed these endpoints
before. This fetcher is therefore deliberately defensive:

  - warms up a session against the NSE homepage first (cookie dance)
  - tries the known endpoint(s); tolerates missing/renamed fields
  - keeps whatever it got; NEVER overwrites a good pledging.json with
    an empty one
  - the dashboard condition treats a missing stock as "unverified",
    never as a pass or a fail — so a partial file is still useful

If NSE moves the endpoint (check the message this prints), the manual
fallback is NSE's quarterly Shareholding Pattern pages, and the condition
in the Workflow tab tells the user exactly that.

Run:
    pip install requests
    python fetch_pledging.py

Output: pledging.json
  { "asOf": ..., "symbols": { "SYM": {"pledgedPctOfPromoter": float,
                                       "promoterHoldingPct": float|null,
                                       "asOn": "..."} } }
"""

import json
import os
import time
from datetime import datetime, timezone

import requests

def _write_status(key, count, error=None):
    """Write this fetcher's result into status.json (shared across all fetchers)."""
    import json, os
    from datetime import datetime, timezone
    sf = "status.json"
    try:
        s = json.load(open(sf)) if os.path.exists(sf) else {}
    except Exception:
        s = {}
    s[key] = {"updatedAt": datetime.now(timezone.utc).isoformat(),
               "status": "ok" if not error else "error",
               "count": count, "error": error}
    json.dump(s, open(sf, "w"), indent=2)


HOME = "https://www.nseindia.com"
ENDPOINTS = [
    # primary: consolidated pledge data API used by the NSE website itself
    HOME + "/api/corporate-pledgedata?index=equities",
]

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/124.0 Safari/537.36"),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": HOME + "/companies-listing/corporate-filings-pledged-data",
}

# Field names NSE has used for "pledged as % of promoter holding" — the
# schema drifts, so try several; store raw record when unsure.
PCT_OF_PROMOTER_FIELDS = [
    "pledgedPctOfPromoter", "perOfPromoterHolding", "pctOfPromoterHolding",
    "totalPledgedSharesAsPerOfPromoterShares", "perPledged",
]
PROMOTER_HOLDING_FIELDS = ["promoterHoldingPct", "perOfTotalShareCapital", "promoterShareholdingPct"]
SYMBOL_FIELDS = ["symbol", "Symbol", "sym"]
DATE_FIELDS = ["asOnDate", "date", "recordDate", "asOn"]


def get_json(session, url):
    r = session.get(url, headers=HEADERS, timeout=25)
    if r.status_code != 200:
        return None
    try:
        return r.json()
    except Exception:
        return None


def first_field(rec, names):
    for n in names:
        if n in rec and rec[n] not in (None, "", "-"):
            return rec[n]
    return None


def to_float(v):
    try:
        return float(str(v).replace(",", "").replace("%", "").strip())
    except Exception:
        return None


def main():
    session = requests.Session()
    # cookie warm-up: NSE APIs 401 without a homepage visit first
    try:
        session.get(HOME, headers=HEADERS, timeout=25)
        time.sleep(1.5)
    except Exception as e:
        print(f"Warm-up failed ({e}) — NSE may be blocking non-browser traffic right now.")

    records = None
    used = None
    for url in ENDPOINTS:
        data = get_json(session, url)
        if data:
            # payload shapes seen: {"data":[...]} or bare list
            records = data.get("data") if isinstance(data, dict) else data
            if isinstance(records, list) and records:
                used = url
                break
            records = None
        time.sleep(1.5)

    if not records:
        print("Could not load pledge data from NSE's API. This endpoint is "
              "known to move — check the Pledged Data page under Corporate "
              "Filings on nseindia.com and update ENDPOINTS. Any existing "
              "pledging.json was left untouched; the dashboard will keep "
              "showing pledging as 'unverified' (never pass, never fail).")
        return

    symbols = {}
    skipped = 0
    for rec in records:
        if not isinstance(rec, dict):
            continue
        sym = first_field(rec, SYMBOL_FIELDS)
        pct = to_float(first_field(rec, PCT_OF_PROMOTER_FIELDS))
        if not sym or pct is None:
            skipped += 1
            continue
        as_on = first_field(rec, DATE_FIELDS) or ""
        # keep the most recent disclosure per symbol
        prev = symbols.get(sym)
        if prev is None or str(as_on) >= str(prev.get("asOn", "")):
            symbols[sym] = {
                "pledgedPctOfPromoter": pct,
                "promoterHoldingPct": to_float(first_field(rec, PROMOTER_HOLDING_FIELDS)),
                "asOn": as_on,
            }

    if not symbols:
        print(f"Endpoint responded ({used}) but no usable records were parsed "
              f"({skipped} skipped) — the field names have probably changed. "
              "Print one raw record and update PCT_OF_PROMOTER_FIELDS. "
              "Existing pledging.json left untouched.")
        return

    out = {
        "asOf": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "source": used,
        "note": ("pledgedPctOfPromoter = pledged shares as % of the promoter's "
                 "own holding (the doom-loop metric), not % of total equity."),
        "symbols": symbols,
    }
    target = "public/pledging.json" if os.path.isdir("public") else "pledging.json"
    json.dump(out, open(target, "w"), indent=2)
    print(f"Wrote {target}: {len(symbols)} symbols ({skipped} records skipped). Source: {used}")


# status written inside main() or by fetch_custom.py
if __name__ == "__main__":
    main()
