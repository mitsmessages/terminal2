#!/usr/bin/env python3
"""
fetch_nse_classification.py — official NSE index membership + industry labels.

Pulls the constituent CSVs that NSE/Nifty Indices publish for each index
(free, official, no API key). Each CSV carries: Company Name, Industry
(NSE's own classification), Symbol, Series, ISIN Code.

This gives the dashboard three things at once:
  1. Index subsetting  — the Workflow funnel's Stage 0 lets you pick
     "Nifty 50" vs "Nifty 500" vs a sectoral index, instead of always
     screening the entire universe.
  2. NSE's official industry labels — Indian peer comparisons can use the
     classification Indian investors actually think in, alongside (not
     replacing) yfinance's sector strings.
  3. A free integrity cross-check — where NSE's industry and Yahoo's
     sector disagree materially, that's worth a flag (same philosophy as
     the existing SEC/NSE verification fetchers: primary source wins).

Operational lesson applied (see PROJECT_CONTEXT.md): NSE endpoints drift.
So this script tries TWO known bases per file, keeps whatever it got even
if some indices fail, and never dies on a single bad index. If everything
fails, it leaves any previous classification.json untouched rather than
overwriting good data with nothing.

Run:
    pip install requests
    python fetch_nse_classification.py

Output: classification.json
"""

import csv
import io
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


# Two bases publishing the same files — niftyindices.com is primary,
# nsearchives is the fallback. Both have changed paths before; if both
# fail, the honest failure message tells you where to look.
BASES = [
    "https://niftyindices.com/IndexConstituent/",
    "https://nsearchives.nseindia.com/content/indices/",
]

INDICES = {
    # broad
    "NIFTY50":     "ind_nifty50list.csv",
    "NIFTY100":    "ind_nifty100list.csv",
    "NIFTY200":    "ind_nifty200list.csv",
    "NIFTY500":    "ind_nifty500list.csv",
    "NIFTYMIDCAP150": "ind_niftymidcap150list.csv",
    "NIFTYSMALLCAP250": "ind_niftysmallcap250list.csv",
    # sectoral (extend freely — Stage 0 picks these up automatically)
    "NIFTYBANK":   "ind_niftybanklist.csv",
    "NIFTYIT":     "ind_niftyitlist.csv",
    "NIFTYPHARMA": "ind_niftypharmalist.csv",
    "NIFTYAUTO":   "ind_niftyautolist.csv",
    "NIFTYFMCG":   "ind_niftyfmcglist.csv",
    "NIFTYMETAL":  "ind_niftymetallist.csv",
    "NIFTYENERGY": "ind_niftyenergylist.csv",
    "NIFTYREALTY": "ind_niftyrealtylist.csv",
}

HEADERS = {
    # NSE endpoints reject default python UAs
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/124.0 Safari/537.36"),
    "Accept": "text/csv,application/csv,*/*",
    "Referer": "https://www.niftyindices.com/",
}


def fetch_csv(filename):
    """Try each base in order; return parsed rows or None."""
    for base in BASES:
        url = base + filename
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            if r.status_code != 200 or len(r.text) < 100:
                continue
            rows = list(csv.DictReader(io.StringIO(r.text)))
            # sanity: must contain Symbol column and >3 rows
            if rows and any("Symbol" in k for k in rows[0].keys()) and len(rows) > 3:
                return rows, url
        except Exception:
            continue
    return None, None


def norm_key(row, *candidates):
    """CSV headers sometimes carry stray spaces/BOM — match loosely."""
    for k, v in row.items():
        clean = (k or "").strip().lstrip("\ufeff").lower()
        for c in candidates:
            if clean == c.lower():
                return (v or "").strip()
    return ""


def main():
    out = {
        "asOf": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "source": "NSE / Nifty Indices official constituent files",
        "indices": {},      # index name -> [symbols]
        "industry": {},     # symbol -> {industry, name, isin}
        "failures": [],     # honest record of which indices didn't load
    }

    for name, filename in INDICES.items():
        print(f"[{name}] {filename} ... ", end="", flush=True)
        rows, url = fetch_csv(filename)
        if rows is None:
            print("FAILED (both bases)")
            out["failures"].append(name)
            time.sleep(1.0)
            continue

        symbols = []
        for row in rows:
            sym = norm_key(row, "Symbol")
            if not sym:
                continue
            symbols.append(sym)
            # Industry map: first-seen wins; broad + sectoral files agree
            if sym not in out["industry"]:
                out["industry"][sym] = {
                    "industry": norm_key(row, "Industry"),
                    "name": norm_key(row, "Company Name"),
                    "isin": norm_key(row, "ISIN Code"),
                }
        out["indices"][name] = symbols
        print(f"{len(symbols)} constituents  ({url.split('/')[2]})")
        time.sleep(1.0)  # be polite; these are static files

    if not out["indices"]:
        print("\nEvery index failed to load — NOT overwriting any existing "
              "classification.json. Both NSE bases may have moved; check "
              "niftyindices.com > Index Constituents manually for the new path.")
        return

    target = "public/classification.json" if os.path.isdir("public") else "classification.json"
    json.dump(out, open(target, "w"), indent=2)
    print(f"\nWrote {target}: {len(out['indices'])} indices, "
          f"{len(out['industry'])} symbols with NSE industry labels."
          + (f"  (failed: {', '.join(out['failures'])})" if out["failures"] else ""))


# status written inside main() or by fetch_custom.py
if __name__ == "__main__":
    main()
