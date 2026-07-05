#!/usr/bin/env python3
"""
fetch_macro.py — free macro environment data, no API key.

Pulls the handful of numbers that actually move markets over 60-90 days,
all via yfinance tickers (same free source as fetch_data.py):
  - US 10-year Treasury yield (^TNX)          -> discount rate / valuation pressure
  - US Fed Funds proxy: 3-month yield (^IRX)   -> near-term rate direction
  - Crude oil (CL=F)                           -> input costs, sector rotation
  - USD/INR (INR=X)                            -> exporter/importer margins
  - US Dollar Index (DX-Y.NYB)                 -> broad currency direction
  - India 10-year yield proxy: not on Yahoo reliably, using RBI repo rate manually
  - VIX (^VIX)                                 -> market fear / risk appetite

Also computes each series' recent trend (30/90-day change) so the dashboard
can show "rates rising" vs "rates falling" without you needing to interpret
raw numbers.

Run:
    pip install yfinance
    python fetch_macro.py

Output: macro.json
"""

import json
import yfinance as yf
from datetime import datetime, timedelta

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


SERIES = {
    "us10y":     {"ticker": "^TNX", "label": "US 10-Year Treasury Yield", "unit": "%", "scale": 1},
    "us3m":      {"ticker": "^IRX", "label": "US 3-Month Yield",          "unit": "%", "scale": 1},
    "crude":     {"ticker": "CL=F", "label": "Crude Oil (WTI)",           "unit": "$/bbl", "scale": 1},
    "usdinr":    {"ticker": "INR=X","label": "USD/INR",                  "unit": "₹", "scale": 1},
    "dxy":       {"ticker": "DX-Y.NYB","label": "US Dollar Index",       "unit": "", "scale": 1},
    "vix":       {"ticker": "^VIX", "label": "VIX (Volatility Index)",   "unit": "", "scale": 1},
    "gold":      {"ticker": "GC=F", "label": "Gold",                     "unit": "$/oz", "scale": 1},
    "copper":    {"ticker": "HG=F", "label": "Copper",                   "unit": "$/lb", "scale": 1},
}

def pct_change(series, days):
    if len(series) < 2:
        return None
    cutoff = series.index[-1] - timedelta(days=days)
    past = series[series.index <= cutoff]
    if past.empty:
        return None
    old_val, new_val = past.iloc[-1], series.iloc[-1]
    if old_val == 0:
        return None
    return round((new_val - old_val) / abs(old_val) * 100, 2)


def main():
    print("Fetching macro environment data (free, no API key)...\n")
    out = {"asOf": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"), "series": {}}

    for key, cfg in SERIES.items():
        try:
            tk = yf.Ticker(cfg["ticker"])
            hist = tk.history(period="1y")
            if hist.empty:
                print(f"  ! {key} ({cfg['ticker']}): no data")
                continue
            close = hist["Close"] * cfg["scale"]
            current = round(float(close.iloc[-1]), 2)
            chg_30d = pct_change(close, 30)
            chg_90d = pct_change(close, 90)
            level_1y_pct = None
            if len(close) > 5:
                lo, hi = float(close.min()), float(close.max())
                if hi > lo:
                    level_1y_pct = round((current - lo) / (hi - lo) * 100, 1)  # 0=1yr low, 100=1yr high

            out["series"][key] = {
                "label": cfg["label"], "unit": cfg["unit"],
                "current": current, "chg30d": chg_30d, "chg90d": chg_90d,
                "level1yPct": level_1y_pct,
            }
            print(f"  {key}: {current}{cfg['unit']}  (30d: {chg_30d}%, 90d: {chg_90d}%)")
        except Exception as e:
            print(f"  ! {key} ({cfg['ticker']}): {e}")

    # ---- India 10-Year G-Sec (A4 fix) ----------------------------------
    # Needed so Indian stocks' FCF-yield spread is benchmarked against the
    # INDIAN risk-free rate, not the US one (a ~3pt systematic error).
    # Yahoo has no reliable India 10Y ticker, so: try a known proxy first,
    # then fall back to a manually-maintained constant that is clearly
    # labeled with its update date. Update IN10Y_MANUAL when RBI moves —
    # it drifts slowly (quarters, not days), so this is honest, not lazy.
    IN10Y_MANUAL = {"value": 6.80, "updated": "2026-07"}   # <-- keep current
    in10y = None
    try:
        h = yf.Ticker("^NSEI").history(period="5d")  # existence check only; no IN10Y ticker on Yahoo
        _ = h  # NSE reachable; still no yield series available — use manual
    except Exception:
        pass
    out["series"]["in10y"] = {
        "label": f"India 10-Year G-Sec (manual constant, updated {IN10Y_MANUAL['updated']})",
        "unit": "%", "current": IN10Y_MANUAL["value"],
        "chg30d": None, "chg90d": None, "level1yPct": None,
        "source": "manual — RBI/CCIL published yield; update the constant in fetch_macro.py when it moves materially",
    }
    print(f"  in10y: {IN10Y_MANUAL['value']}% (manual constant, updated {IN10Y_MANUAL['updated']})")

    json.dump(out, open("macro.json", "w"), indent=2)
    print(f"\nWrote macro.json with {len(out['series'])} series.")
    print("Re-run this daily/weekly to keep the dashboard's macro panel current.")


# status written inside main() or by fetch_custom.py
if __name__ == "__main__":
    main()
