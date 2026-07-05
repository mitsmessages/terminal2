#!/usr/bin/env python3
"""
fetch_edgar.py — Free earnings call text fetcher using SEC EDGAR.

For every US ticker in your list, this script:
  1. Looks up the company's CIK number from EDGAR's public ticker map
  2. Finds the last 10 quarters of 8-K filings (Item 2.02 = earnings release)
  3. Fetches the EX-99.1 exhibit — the official earnings press release text
     (revenue, EPS, guidance, management commentary, forward outlook)
  4. Extracts key sections and saves them to edgar_transcripts.json

Free, legal, no API key, no signup. SEC EDGAR is a public US government database.
The press release text is NOT the full earnings call transcript (no Q&A), but it
contains the official prepared management statement and guidance — often the most
carefully worded, signal-rich part of the whole call.

Run:
    pip install requests beautifulsoup4
    python fetch_edgar.py

Output: edgar_transcripts.json  (consumed by the dashboard's sentiment panel)

Coverage: S&P 500 US stocks only. Indian (NSE) stocks are not on EDGAR.
Indian equivalents: BSE/NSE filings on bseindia.com / nseindia.com (manual for now).
"""

import json
import time
import re
import requests
from bs4 import BeautifulSoup

def _get(session, url, max_retries=3, backoff=2.0):
    """GET with exponential-backoff retry. Respects 429 Retry-After header."""
    for attempt in range(max_retries):
        try:
            r = session.get(url, timeout=20)
            if r.status_code == 429:
                wait = float(r.headers.get("Retry-After", backoff * (attempt+1)))
                print(f"    429 rate-limited — waiting {wait:.0f}s")
                time.sleep(wait)
                continue
            return r
        except requests.RequestException as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(backoff * (attempt+1))
    return None

# ------------------------------------------------------------------ #
#  CONFIG
# ------------------------------------------------------------------ #

# EDGAR requires a descriptive User-Agent with a real contact email.
# SEC policy: https://www.sec.gov/os/accessing-edgar-data
# Replace with your own email — do not use the placeholder below.
# Fix: Replace with your real email — SEC EDGAR policy requires a valid contact.
# Using a placeholder will eventually trigger SEC bot detection.
USER_AGENT = "TerminalEquityDashboard terminal@mitsanalytics.com"  # ← update to your real email

MAX_QUARTERS = 10      # how many 8-K filings to fetch per company
SLEEP_SEC    = 0.15    # SEC rate limit: max 10 req/sec; 0.15s = ~6/sec (safe)

# Subset to test first — comment out to use the full SP500 list below
TEST_TICKERS = ["AAPL", "MSFT", "NVDA", "RELIANCE"]  # RELIANCE will be skipped (India)

# Full S&P 500 ticker list — same as your fetch_data.py
SP500 = [
    "MMM","AOS","ABT","ABBV","ACN","ADBE","AMD","AES","AFL","A",
    "APD","ABNB","AKAM","ALB","ARE","ALGN","ALLE","LNT","ALL","GOOGL",
    "GOOG","MO","AMZN","AMCR","AEE","AEP","AXP","AIG","AMT","AWK",
    "AMP","AME","AMGN","APH","ADI","ANSS","AON","APA","APO","AAPL",
    "AMAT","APTV","ACGL","ADM","ANET","AJG","AIZ","T","ATO","ADSK",
    "ADP","AZO","AVB","AVY","AXON","BKR","BALL","BAC","BAX","BDX",
    "BRK-B","BBY","TECH","BIIB","BLK","BX","BK","BA","BKNG","BWA",
    "BSX","BMY","AVGO","BR","BRO","BLDR","BG","BXP","CHRW","CDNS",
    "CPT","CPB","COF","CAH","KMX","CCL","CARR","CAT","CBOE","CBRE",
    "CDW","COR","CNC","CNP","CF","SCHW","CHTR","CVX","CMG","CB",
    "CHD","CI","CINF","CTAS","CSCO","C","CFG","CLX","CME","CMS",
    "KO","CTSH","CL","CMCSA","CAG","COP","ED","STZ","CEG","COO",
    "CPRT","GLW","COST","CTRA","CRWD","CCI","CSX","CMI","CVS","DHR",
    "DRI","DVA","DECK","DE","DAL","DVN","DXCM","FANG","DLR","DFS",
    "DG","DLTR","D","DPZ","DOV","DOW","DHI","DTE","DUK","DD",
    "EMN","ETN","EBAY","ECL","EIX","EW","EA","ELV","EMR","ENPH",
    "ETR","EOG","EQT","EFX","EQIX","EQR","ESS","EL","EG","ES",
    "EXC","EXPE","EXPD","EXR","XOM","FFIV","FDS","FICO","FAST","FRT",
    "FDX","FIS","FITB","FSLR","FE","FI","FMC","F","FTNT","FTV",
    "FOXA","FOX","BEN","FCX","GRMN","IT","GE","GEHC","GEN","GNRC",
    "GD","GIS","GM","GPC","GILD","GPN","GL","GDDY","GS","HAL",
    "HIG","HAS","HCA","HSIC","HSY","HES","HPE","HLT","HOLX","HD",
    "HON","HRL","HST","HWM","HPQ","HUBB","HUM","HBAN","HII","IBM",
    "IEX","IDXX","ITW","INCY","IR","INTC","ICE","IFF","IP","IPG",
    "INTU","ISRG","IVZ","IQV","IRM","JBHT","JBL","J","JNJ","JCI",
    "JPM","JNPR","K","KDP","KEY","KEYS","KMB","KIM","KMI","KKR",
    "KLAC","KHC","KR","LHX","LH","LRCX","LW","LVS","LDOS","LEN",
    "LII","LLY","LIN","LYV","LKQ","LMT","L","LOW","LULU","LYB",
    "MTB","MPC","MKTX","MAR","MMC","MLM","MAS","MA","MKC","MCD",
    "MCK","MDT","MRK","META","MET","MTD","MGM","MCHP","MU","MSFT",
    "MAA","MRNA","MOH","TAP","MDLZ","MPWR","MNST","MCO","MS","MOS",
    "MSI","MSCI","NDAQ","NTAP","NFLX","NEM","NWSA","NWS","NEE","NKE",
    "NI","NSC","NTRS","NOC","NCLH","NRG","NUE","NVDA","NVR","NXPI",
    "ORLY","OXY","ODFL","OMC","ON","OKE","ORCL","OTIS","PCAR","PKG",
    "PLTR","PANW","PH","PAYX","PYPL","PEP","PFE","PCG","PM","PSX",
    "PNW","PNC","POOL","PPG","PPL","PFG","PG","PGR","PLD","PRU",
    "PEG","PTC","PSA","PHM","PWR","QCOM","DGX","RL","RJF","RTX",
    "O","REG","REGN","RF","RSG","RMD","ROK","ROL","ROP","ROST",
    "RCL","SPGI","CRM","SBAC","SLB","STX","SRE","NOW","SHW","SPG",
    "SJM","SW","SNA","SO","SWK","SBUX","STT","STLD","STE","SYK",
    "SYF","SNPS","SYY","TMUS","TROW","TTWO","TPR","TRGP","TGT","TEL",
    "TDY","TFX","TER","TSLA","TXN","TXT","TMO","TJX","TSCO","TT",
    "TDG","TRV","TRMB","TFC","TYL","TSN","USB","UBER","UNP","UAL",
    "UPS","URI","UNH","UHS","VLO","VTR","VRSN","VRSK","VZ","VRTX",
    "VTRS","VICI","V","VMC","GWW","WAB","WBA","WMT","DIS","WBD",
    "WM","WAT","WEC","WFC","WELL","WST","WDC","WY","WSM","WMB",
    "WTW","WDAY","WYNN","XEL","XYL","YUM","ZBRA","ZBH","ZTS",
]

HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}

# ------------------------------------------------------------------ #
#  STEP 1: Build ticker → CIK mapping
# ------------------------------------------------------------------ #

def get_cik_map():
    """Download EDGAR's full company ticker→CIK map (one request, free)."""
    print("Loading EDGAR ticker→CIK map…")
    url = "https://www.sec.gov/files/company_tickers.json"
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
    r.raise_for_status()
    raw = r.json()
    # Format: {"0":{"cik_str":320193,"ticker":"AAPL","title":"Apple Inc."},...}
    return {v["ticker"].upper(): str(v["cik_str"]).zfill(10) for v in raw.values()}


# ------------------------------------------------------------------ #
#  STEP 2: Get 8-K filing list for a CIK
# ------------------------------------------------------------------ #

def get_8k_filings(cik10, max_count=MAX_QUARTERS):
    """
    Fetch the submissions JSON for a CIK and return the most recent
    8-K filings that contain Item 2.02 (earnings results).
    Returns list of (accession_number, filing_date, primary_doc).
    """
    url = f"https://data.sec.gov/submissions/CIK{cik10}.json"
    r = requests.get(url, headers=HEADERS, timeout=15)
    time.sleep(SLEEP_SEC)
    r.raise_for_status()
    d = r.json()

    recent = d.get("filings", {}).get("recent", {})
    forms       = recent.get("form", [])
    dates       = recent.get("filingDate", [])
    accessions  = recent.get("accessionNumber", [])
    items_list  = recent.get("items", [])   # e.g. "2.02,9.01" for earnings 8-Ks
    primary_docs= recent.get("primaryDocument", [])

    results = []
    for form, date, acc, items, doc in zip(forms, dates, accessions, items_list, primary_docs):
        if form != "8-K":
            continue
        # Item 2.02 = Results of Operations (the earnings 8-K)
        if "2.02" not in str(items):
            continue
        results.append((acc, date, doc))
        if len(results) >= max_count:
            break

    return results


# ------------------------------------------------------------------ #
#  STEP 3: Fetch and extract the EX-99.1 earnings press release text
# ------------------------------------------------------------------ #

def get_filing_index(cik10, accession):
    """Get the filing index page to find EX-99.1 document URL."""
    acc_clean = accession.replace("-", "")
    url = f"https://www.sec.gov/Archives/edgar/data/{int(cik10)}/{acc_clean}/{accession}-index.json"
    r = requests.get(url, headers=HEADERS, timeout=15)
    time.sleep(SLEEP_SEC)
    if r.status_code != 200:
        # Fallback: try the HTML index
        url2 = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik10}&type=8-K&dateb=&owner=include&count=40&search_text="
        return None
    return r.json()


def extract_exhibit_url(cik10, accession):
    """
    Find the EX-99.1 URL by scraping the human-readable filing index page.
    This is more reliable than the JSON index because it's what EDGAR
    actually guarantees to exist for every filing.
    Format: https://www.sec.gov/Archives/edgar/data/{CIK}/{ACC_CLEAN}/
    """
    acc_clean = accession.replace("-", "")
    cik_int   = str(int(cik10))          # strip leading zeros for the path

    # The directory listing — always exists
    dir_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik_int}&type=8-K&dateb=&owner=include&count=1&search_text="

    # More reliable: use the filing index HTML page
    idx_url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_clean}/"
    r = requests.get(idx_url, headers={"User-Agent": USER_AGENT}, timeout=15)
    time.sleep(SLEEP_SEC)

    if r.status_code != 200:
        return None

    soup = BeautifulSoup(r.text, "html.parser")

    # All links in the directory listing
    links = soup.find_all("a", href=True)
    candidates = []
    for a in links:
        href = a["href"]
        text = a.get_text(strip=True).lower()
        href_lower = href.lower()
        # Match EX-99.1 by link text or filename
        if ("ex-99.1" in text or "ex99.1" in text or
            "ex-99" in text or "exhibit 99" in text or
            "ex99" in href_lower or "ex-99" in href_lower):
            # Make absolute URL
            if href.startswith("/Archives"):
                candidates.append(("https://www.sec.gov" + href, 1))
            elif href.startswith("http"):
                candidates.append((href, 1))
            else:
                candidates.append((f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_clean}/{href}", 1))

    if candidates:
        # Prefer .htm files over .txt
        htm = [u for u,_ in candidates if u.endswith(".htm") or u.endswith(".html")]
        return htm[0] if htm else candidates[0][0]

    # Last resort: look for any .htm file that isn't the main 8-K form
    for a in links:
        href = a["href"].lower()
        if (href.endswith(".htm") and
            "8-k" not in href and
            "form" not in href and
            href != "/"):
            full = a["href"]
            if not full.startswith("http"):
                full = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_clean}/{full}"
            return full

    return None


def fetch_and_clean(url):
    """
    Fetch an HTML or text filing and return cleaned plain text.
    Strips XBRL/boilerplate, keeps substantive paragraphs.
    """
    if not url:
        return None
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
    time.sleep(SLEEP_SEC)
    if r.status_code != 200:
        return None
    content_type = r.headers.get("Content-Type", "")
    raw = r.text

    if "html" in content_type or url.lower().endswith((".htm",".html")):
        soup = BeautifulSoup(raw, "html.parser")
        # Remove noise tags
        for tag in soup(["script","style","head",
                          "ix:header","ix:nonnumeric","ix:nonfraction",
                          "xbrli:xbrl","link","meta"]):
            tag.decompose()
        # Remove XBRL inline namespace tags but keep their text
        for tag in soup.find_all(True):
            if ":" in tag.name:   # e.g. ix:continuation
                tag.unwrap()
        text = soup.get_text(separator="\n")
    else:
        text = raw

    # Clean whitespace — keep lines with real content (>25 chars)
    lines = [l.strip() for l in text.splitlines() if len(l.strip()) > 25]
    # Remove obvious boilerplate lines
    boiler = {"emerging growth company","accelerated filer","check the appropriate box",
               "indicate by check","pursuant to section","commission file number",
               "securities registered","none.","yes \u25a0","no \u25a0","yes \u25a1","no \u25a1"}
    lines = [l for l in lines if l.lower()[:60] not in boiler and
             not l.lower().startswith(("item 9.01","item 2.02","signatures","pursuant to the"))]
    text = "\n".join(lines)
    # Truncate to ~10000 chars — enough for 10-quarter sentiment across all quarters
    return text[:10000] if len(text) > 10000 else text


# ------------------------------------------------------------------ #
#  STEP 4: Extract the most signal-rich sections
# ------------------------------------------------------------------ #

def extract_key_sections(text):
    """
    From a full press release, pull out the sections that matter most
    for sentiment analysis: management statement, guidance, revenue table.
    Returns a shorter, focused excerpt.
    """
    if not text:
        return ""
    # Common section headers in earnings press releases
    signal_phrases = [
        "guidance", "outlook", "full year", "fiscal year",
        "expects", "anticipates", "projects", "targets",
        "revenue", "net income", "operating income", "earnings per share",
        "fourth quarter", "third quarter", "second quarter", "first quarter",
        "q4", "q3", "q2", "q1",
        "management", "ceo", "chief executive", "we are",
        "we delivered", "we continued", "reflecting", "despite", "headwind",
        "growth", "margin", "cash flow",
    ]
    lines = text.splitlines()
    scored = []
    for i, line in enumerate(lines):
        line_lower = line.lower()
        score = sum(1 for phrase in signal_phrases if phrase in line_lower)
        if score > 0:
            # Include surrounding context (window of 2 lines)
            start = max(0, i-1)
            end = min(len(lines), i+3)
            scored.append((score, i, "\n".join(lines[start:end])))
    # Sort by score, take top sections, de-duplicate
    scored.sort(key=lambda x: -x[0])
    seen = set()
    result = []
    for score, idx, section in scored[:20]:
        key = section[:50]
        if key not in seen:
            seen.add(key)
            result.append(section)
    return "\n\n".join(result)[:5000]


# ------------------------------------------------------------------ #
#  STEP 5: Sentiment summary prompt builder
#  (called from the dashboard's Ask Claude panel)
# ------------------------------------------------------------------ #

def build_sentiment_data(ticker, filings_data):
    """
    Package the fetched earnings text into the format the dashboard
    expects for its sentiment analysis panel.
    """
    return {
        "ticker": ticker,
        "source": "SEC EDGAR 8-K filings (official earnings press releases)",
        "coverage": "US only (S&P 500). India: use Screener.in / BSE filings.",
        "quarters": [
            {
                "date": f["date"],
                "accession": f["accession"],
                "text": f["text"],
                "key_sections": f["key_sections"],
                "url": f["url"],
            }
            for f in filings_data
        ]
    }


# ------------------------------------------------------------------ #
#  MAIN
# ------------------------------------------------------------------ #

def main(use_test_list=True):
    """
    Set use_test_list=True to run on just 3 tickers first (recommended).
    Set use_test_list=False to run the full SP500 (takes ~2-3 hours).
    """
    tickers = TEST_TICKERS if use_test_list else SP500
    print(f"\nEDGAR earnings fetch — {len(tickers)} tickers")
    print("Source: SEC EDGAR (free, legal, official press releases)")
    print("="*55)

    # Load CIK map (one request)
    cik_map = get_cik_map()
    print(f"CIK map loaded: {len(cik_map)} companies\n")

    # Load existing output (incremental — don't re-fetch what we have)
    try:
        existing = json.load(open("edgar_transcripts.json"))
        results = {e["ticker"]: e for e in existing}
        print(f"Loaded {len(results)} existing records.\n")
    except Exception:
        results = {}

    skipped_india = 0
    for i, ticker in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}] {ticker}", end=" ... ")

        # Skip Indian tickers (not on EDGAR)
        if ticker not in cik_map:
            print("⏭  not in EDGAR (likely India/NSE ticker, skipped)")
            skipped_india += 1
            continue

        # Skip if already fetched and has data
        if ticker in results and len(results[ticker].get("quarters", [])) >= MAX_QUARTERS:
            print(f"✓  already have {len(results[ticker]['quarters'])} quarters, skipping")
            continue

        try:
            cik10 = cik_map[ticker]
            # Get list of earnings 8-K filings
            filings = get_8k_filings(cik10, max_count=MAX_QUARTERS)
            if not filings:
                print("⚠  no earnings 8-Ks found")
                continue
            print(f"found {len(filings)} 8-Ks")

            quarters = []
            for acc, date, primary_doc in filings:
                # Find the EX-99.1 exhibit URL
                exhibit_url = extract_exhibit_url(cik10, acc)
                if not exhibit_url:
                    print(f"    {date}: no EX-99.1 found, skipping")
                    continue

                # Fetch and clean the press release text
                text = fetch_and_clean(exhibit_url)
                if not text or len(text) < 200:
                    print(f"    {date}: text too short ({len(text or '')} chars), skipping")
                    continue
                key_sections = extract_key_sections(text)
                # Fix 4: cap stored text to prevent edgar_transcripts.json
                # growing to 50-100MB as the universe scales. key_sections has
                # the structured highlights; the raw text truncation only affects
                # the manual paste-back preview, which the user can always get
                # by visiting the url directly.
                MAX_TEXT = 4000
                quarters.append({
                    "date": date, "accession": acc,
                    "url": exhibit_url,
                    "text": text[:MAX_TEXT] + ("…[truncated — open URL for full text]" if len(text)>MAX_TEXT else ""),
                    "key_sections": key_sections,
                })
                print(f"    {date}: {len(text)} chars ✓")

            results[ticker] = build_sentiment_data(ticker, quarters)

        except Exception as e:
            print(f"  ! error: {e}")

    # Save output
    output = list(results.values())
    json.dump(output, open("edgar_transcripts.json", "w"), indent=2)
    print(f"\n{'='*55}")
    print(f"Wrote edgar_transcripts.json with {len(output)} companies.")
    if skipped_india:
        print(f"(Skipped {skipped_india} tickers not on EDGAR — India/NSE names)")
    print("\nNext: the dashboard's 'Earnings call sentiment' panel will")
    print("auto-load this file and pre-fill the text box when you open a stock.")
    print("\nTo run the full SP500 (~2-3 hrs): change use_test_list=False in main()")


if __name__ == "__main__":
    # Change to False to run the full SP500
    main(use_test_list=True)
