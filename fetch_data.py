#!/usr/bin/env python3
"""
fetch_data.py  v2  —  Bloomberg-style data puller (free, Yahoo Finance).

Pulls for each ticker:
  - 4 years annual + up to 8 quarters of: revenue, EBITDA, net income,
    operating income, gross profit, FCF, operating cash flow, capex
  - balance sheet: total debt, cash, equity, total assets
  - derived per-period margins (gross, operating, EBITDA, net, FCF)
  - latest price, market cap, shares, EV, valuation multiples
  - ROE / ROA, beta, 52-week range, dividend yield

Output: data.json  (consumed by the dashboard).

Run:
    pip install yfinance
    python fetch_data.py
"""

import json, time
import yfinance as yf

US = [
    "MMM","AOS","ABT","ABBV","ACN","ADBE","AMD","AES","AFL","A",
    "APD","ABNB","AKAM","ALB","ARE","ALGN","ALLE","LNT","ALL","GOOGL",
    "GOOG","MO","AMZN","AMCR","AEE","AEP","AXP","AIG","AMT","AWK",
    "AMP","AME","AMGN","APH","ADI","ANSS","AON","APA","APO","AAPL",
    "AMAT","APTV","ACGL","ADM","ANET","AJG","AIZ","T","ATO","ADSK",
    "ADP","AZO","AVB","AVY","AXON","BKR","BALL","BAC","BAX","BDX",
    "BRK.B","BBY","TECH","BIIB","BLK","BX","BK","BA","BKNG","BWA",
    "BSX","BMY","AVGO","BR","BRO","BF.B","BLDR","BG","BXP","CHRW",
    "CDNS","CZR","CPT","CPB","COF","CAH","KMX","CCL","CARR","CTLT",
    "CAT","CBOE","CBRE","CDW","CE","COR","CNC","CNP","CF","CRL",
    "SCHW","CHTR","CVX","CMG","CB","CHD","CI","CINF","CTAS","CSCO",
    "C","CFG","CLX","CME","CMS","KO","CTSH","CL","CMCSA","CMA",
    "CAG","COP","ED","STZ","CEG","COO","CPRT","GLW","CPAY","CTVA",
    "CSGP","COST","CTRA","CRWD","CCI","CSX","CMI","CVS","DHR","DRI",
    "DVA","DAY","DECK","DE","DAL","DVN","DXCM","FANG","DLR","DFS",
    "DG","DLTR","D","DPZ","DOV","DOW","DHI","DTE","DUK","DD",
    "EMN","ETN","EBAY","ECL","EIX","EW","EA","ELV","EMR","ENPH",
    "ETR","EOG","EPAM","EQT","EFX","EQIX","EQR","ERIE","ESS","EL",
    "EG","EVRG","ES","EXC","EXPE","EXPD","EXR","XOM","FFIV","FDS",
    "FICO","FAST","FRT","FDX","FIS","FITB","FSLR","FE","FI","FMC",
    "F","FTNT","FTV","FOXA","FOX","BEN","FCX","GRMN","IT","GE",
    "GEHC","GEV","GEN","GNRC","GD","GIS","GM","GPC","GILD","GPN",
    "GL","GDDY","GS","HAL","HIG","HAS","HCA","DOC","HSIC","HSY",
    "HES","HPE","HLT","HOLX","HD","HON","HRL","HST","HWM","HPQ",
    "HUBB","HUM","HBAN","HII","IBM","IEX","IDXX","ITW","INCY","IR",
    "PODD","INTC","ICE","IFF","IP","IPG","INTU","ISRG","IVZ","INVH",
    "IQV","IRM","JBHT","JBL","JKHY","J","JNJ","JCI","JPM","JNPR",
    "K","KVUE","KDP","KEY","KEYS","KMB","KIM","KMI","KKR","KLAC",
    "KHC","KR","LHX","LH","LRCX","LW","LVS","LDOS","LEN","LII",
    "LLY","LIN","LYV","LKQ","LMT","L","LOW","LULU","LYB","MTB",
    "MPC","MKTX","MAR","MMC","MLM","MAS","MA","MTCH","MKC","MCD",
    "MCK","MDT","MRK","META","MET","MTD","MGM","MCHP","MU","MSFT",
    "MAA","MRNA","MHK","MOH","TAP","MDLZ","MPWR","MNST","MCO","MS",
    "MOS","MSI","MSCI","NDAQ","NTAP","NFLX","NEM","NWSA","NWS","NEE",
    "NKE","NI","NDSN","NSC","NTRS","NOC","NCLH","NRG","NUE","NVDA",
    "NVR","NXPI","ORLY","OXY","ODFL","OMC","ON","OKE","ORCL","OTIS",
    "PCAR","PKG","PLTR","PANW","PARA","PH","PAYX","PAYC","PYPL","PNR",
    "PEP","PFE","PCG","PM","PSX","PNW","PNC","POOL","PPG","PPL",
    "PFG","PG","PGR","PLD","PRU","PEG","PTC","PSA","PHM","PWR",
    "QCOM","DGX","RL","RJF","RTX","O","REG","REGN","RF","RSG",
    "RMD","RVTY","ROK","ROL","ROP","ROST","RCL","SPGI","CRM","SBAC",
    "SLB","STX","SRE","NOW","SHW","SPG","SWKS","SJM","SW","SNA",
    "SOLV","SO","LUV","SWK","SBUX","STT","STLD","STE","SYK","SMCI",
    "SYF","SNPS","SYY","TMUS","TROW","TTWO","TPR","TRGP","TGT","TEL",
    "TDY","TFX","TER","TSLA","TXN","TPL","TXT","TMO","TJX","TKO",
    "TSCO","TT","TDG","TRV","TRMB","TFC","TYL","TSN","USB","UBER",
    "UDR","ULTA","UNP","UAL","UPS","URI","UNH","UHS","VLO","VTR",
    "VLTO","VRSN","VRSK","VZ","VRTX","VTRS","VICI","V","VST","VMC",
    "WRB","GWW","WAB","WBA","WMT","DIS","WBD","WM","WAT","WEC",
    "WFC","WELL","WST","WDC","WY","WSM","WMB","WTW","WDAY","WYNN",
    "XEL","XYL","YUM","ZBRA","ZBH","ZTS",
]
IN = [
    "RELIANCE","TCS","HDFCBANK","ICICIBANK","BHARTIARTL","SBIN","INFY","LICI","ITC","HINDUNILVR",
    "LT","BAJFINANCE","HCLTECH","MARUTI","SUNPHARMA","KOTAKBANK","M&M","ULTRACEMCO","AXISBANK","NTPC",
    "ONGC","TITAN","ADANIENT","ADANIPORTS","BAJAJFINSV","ASIANPAINT","COALINDIA","WIPRO","JSWSTEEL","POWERGRID",
    "NESTLEIND","BEL","TATAMOTORS","IOC","TATASTEEL","HAL","DLF","TRENT","GRASIM","SBILIFE",
    "TECHM","ADANIPOWER","HDFCLIFE","JIOFIN","VEDL","BAJAJ-AUTO","CIPLA","HINDALCO","EICHERMOT","PIDILITIND",
    "GODREJCP","AMBUJACEM","SHREECEM","DABUR","BRITANNIA","DRREDDY","TVSMOTOR","SIEMENS","INDIGO","HEROMOTOCO",
    "BANKBARODA","TATACONSUM","APOLLOHOSP","DIVISLAB","PNB","CANBK","ZOMATO","HAVELLS","BPCL","INDUSINDBK",
    "GAIL","TATAPOWER","LTIM","CHOLAFIN","ICICIPRULI","ICICIGI","ABB","UNITDSPR","IRCTC","DMART",
    "MOTHERSON","PFC","RECLTD","SRF","TORNTPHARM","MARICO","PIIND","BERGEPAINT","COLPAL","MUTHOOTFIN",
    "NAUKRI","JINDALSTEL","LUPIN","BOSCHLTD","ALKEM","AUROPHARMA","BIOCON","MAXHEALTH","POLYCAB","ESCORTS",
    "PERSISTENT","COFORGE","MPHASIS","LTTS","OBEROIRLTY","OFSS","SUPREMEIND","ABCAPITAL","SAIL","NMDC",
    "HINDZINC","JSWENERGY","NHPC","SJVN","UNIONBANK","IDFCFIRSTB","FEDERALBNK","BANKINDIA","AUBANK","RBLBANK",
    "YESBANK","PAYTM","POLICYBZR","NYKAA","DELHIVERY","PAGEIND","DIXON","AMBER","KAYNES","CGPOWER",
    "SUZLON","BHEL","BEML","COCHINSHIP","MAZDOCK","GRSE","HUDCO","IRFC","IREDA","RVNL",
    "RAILTEL","CONCOR","GMRAIRPORT","ADANIGREEN","ADANIENSOL","TATAELXSI","KPITTECH","CYIENT","TATACOMM","INDUSTOWER",
    "HFCL","ROUTE","TANLA","RATNAMANI","JKCEMENT","ACC","DALBHARAT","JKLAKSHMI","RAMCOCEM","HEIDELBERG",
    "ASTRAL","FINPIPE","SUNDARMFIN","SUNDRMFAST","BALKRISIND","APOLLOTYRE","MRF","CEAT","EXIDEIND","AMARAJABAT",
    "BHARATFORG","CUMMINSIND","THERMAX","KIRLOSENG","GREAVESCOT","VOLTAS","BLUESTARCO","WHIRLPOOL","CROMPTON","ORIENTELEC",
    "VGUARD","SYMPHONY","KAJARIACER","CERA","SOBHA","BRIGADE","GODREJPROP","PRESTIGE","SUNTECK","MAHLIFE",
    "PHOENIXLTD","LODHA","SIGNATUREGLOBAL","ANANTRAJ","GODFRYPHLP","EMAMILTD","JYOTHYLAB","VBL","RADICO","UBL",
    "TATACHEM","DEEPAKNTR","AARTIIND","NAVINFLUOR","ATUL","GUJALKALI","GHCL","CHAMBLFERT","COROMANDEL","GNFC",
    "RCF","GSFC","UPL","RALLIS","BAYERCROP","SUMICHEM","INSECTICID","DHANUKA","SOLARINDS","DEEPAKFERT",
    "NATCOPHARM","LAURUSLABS","GLENMARK","TORNTPOWER","AJANTPHARM","ABBOTINDIA","SANOFI","PFIZER","GLAXO","FORTIS",
    "METROPOLIS","LALPATHLAB","KIMS","MEDANTA","RAINBOW","ASTERDM","SHALBY","POLYMED","JBCHEPHARM","GLAND",
    "SYNGENE","GRANULES","IPCALAB","STAR","INDOCO","CAPLIPOINT","NIVABUPA","GICRE","NIACL","ICICILOMB",
    "HDFCAMC","UTIAMC","NAM-INDIA","ANANDRATHI","MOTILALOFS","IIFL","ANGELONE","CDSL","MCX","BSE",
    "CAMS","KFINTECH","NUVAMA","JMFINANCIL","MANAPPURAM","SHRIRAMFIN","M&MFIN","CHOLAHLDNG","BAJAJHLDNG","LICHSGFIN",
    "CANFINHOME","REPCOHOME","PNBHOUSING","AAVAS","HOMEFIRST","APTUS","SPANDANA","CREDITACC","FUSION","UJJIVANSFB",
    "EQUITASBNK","DCBBANK","SOUTHBANK","KARURVYSYA","CSBBANK","J&KBANK","CENTRALBK","INDIANB","UCOBANK","MAHABANK",
    "IOB","BANDHANBNK","CITYUNIONBK","ZYDUSLIFE","JUBLFOOD","JUBLPHARMA","JUBLINGREA","DEVYANI","SAPPHIRE","WESTLIFE",
    "GODREJIND","GODREJAGRO","KSCL","BASF","CLEAN","VINATIORGA","ALKYLAMINE","FINEORG","AETHER","PCBL",
    "GALAXYSURF","NOCIL","TATAINVEST","TIINDIA","SCHAEFFLER","SKFINDIA","NRBBEARING","TIMKEN","FIEMIND","ENDURANCE",
    "SUBROS","UNOMINDA","SANSERA","JAMNAAUTO","RKFORGE","GABRIEL","SETCO","PRINCEPIPE","APLAPOLLO","RATNAVEER",
    "WELCORP","SHYAMMETL","MIDHANI","RAJRATAN","SURYAROSNI","GREENPLY","CENTURYPLY","GREENPANEL","ORIENTCEM","INDIACEM",
    "BIRLACORPN","SAGCEM","JKPAPER","WESTCOAST","TNPL","BALRAMCHIN","TRIVENI","DALMIASUG","DWARKESH","KSL",
    "RENUKA","UTTAMSUGAR","VARUNBEV","HATSUN","KRBL","LTFOODS","GOPALSNAC","BIKAJI","DODLA","HERITGFOOD",
    "PARAGMILK","VADILALIND","PRATAAPSN","DBCORP","JAGRAN","HTMEDIA","NETWORK18","TV18BRDCST","ZEEL","SUNTV",
    "PVRINOX","INOXWIND","WAAREE","KPIGREEN","ACMESOLAR","GENSOL","ORIENTGREN","JPPOWER","RTNPOWER","JSL",
    "JSPL","WELSPUNLIV","WELSPUNIND","TRIDENT","VARDHMAN","RAYMOND","ARVIND","KPRMILL","GOKEX","LUXIND",
    "RUPA","DOLLAR","SAFARI","VIPIND","BLUEDART","ALLCARGO","TCI","MAHLOG","GATI","SNOWMAN",
    "SCI","GESHIP","CESC","NLCINDIA","KEC","KALPATPOWR","NCC","GMRINFRA","IRB","PNCINFRA",
    "HGINFRA","ASHOKA","GPIL","JSWHL","JINDALSAW","WELENT","RAJESHEXPO","TITAGARH","TEXRAIL","JWL",
    "GRINDWELL","CARBORUNIV","SCHNEIDER","HONAUT","CGCL","BLS","INDIAMART","JUSTDIAL","INFIBEAM","EASEMYTRIP",
    "YATRA","MAPMYINDIA","NETWEB","RATEGAIN","HAPPSTMNDS","ZENSARTECH","SONATSOFTW","INTELLECT","NEWGEN","DATAPATTNS",
    "CENTUM","BHARTIHEXA","TEJASNET","ECLERX","FIRSTSOURCE",
]

DEFAULT_G = 8.0
G_OVERRIDE = {"NVDA":25,"MSFT":13,"BAJFINANCE":22,"BHARTIARTL":16}


def row(df, *names):
    """Full time-series (list, newest first) for the first matching statement row."""
    if df is None or df.empty:
        return None
    for n in names:
        if n in df.index:
            return [None if (v != v) else float(v) for v in df.loc[n].values]
    return None


def at(series, i):
    return series[i] if series and i < len(series) and series[i] is not None else None


def margins(rev, *items):
    out = []
    for i in range(len(rev) if rev else 0):
        r = at(rev, i)
        vals = {}
        for label, s in items:
            v = at(s, i)
            vals[label] = round(v / r * 100, 2) if (r and v is not None and r != 0) else None
        out.append(vals)
    return out


def scaled(series, mkt):
    if not series:
        return []
    d = 1e9 if mkt == "US" else 1e7   # USD bn  /  INR crore
    return [round(v / d, 2) if v is not None else None for v in series]


def periods(df):
    if df is None or df.empty:
        return []
    return [str(c)[:10] for c in df.columns]


def block(fin, cf):
    rev    = row(fin, "Total Revenue", "Operating Revenue")
    gp     = row(fin, "Gross Profit")
    oi     = row(fin, "Operating Income", "Operating Income Or Loss")
    ebitda = row(fin, "EBITDA", "Normalized EBITDA")
    ni     = row(fin, "Net Income", "Net Income Common Stockholders")
    ocf    = row(cf, "Operating Cash Flow", "Total Cash From Operating Activities")
    capex  = row(cf, "Capital Expenditure", "Capital Expenditures")
    fcf    = row(cf, "Free Cash Flow")
    if not fcf and ocf and capex:
        fcf = [(o + c) if (o is not None and c is not None) else None
               for o, c in zip(ocf, capex)]
    return rev, gp, oi, ebitda, ni, ocf, capex, fcf


def pull(sym, mkt):
    yq = sym + (".NS" if mkt == "IN" else "")
    tk = yf.Ticker(yq)
    info = tk.get_info()

    fin, cf, bs = tk.financials, tk.cashflow, tk.balance_sheet
    qfin, qcf = tk.quarterly_financials, tk.quarterly_cashflow

    arev, agp, aoi, aebitda, ani, aocf, acapex, afcf = block(fin, cf)
    qrev, qgp, qoi, qebitda, qni, qocf, qcapex, qfcf = block(qfin, qcf)

    debt = row(bs, "Total Debt")
    cash = row(bs, "Cash And Cash Equivalents",
               "Cash Cash Equivalents And Short Term Investments")

    shares = info.get("sharesOutstanding")
    price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
    if not (arev and ani and afcf and shares and price):
        print(f"  ! {sym}: missing core fields (revenue/income/FCF/price), skipping"); return None

    total_debt = at(debt, 0) or info.get("totalDebt") or 0
    total_cash = at(cash, 0) or info.get("totalCash") or 0
    net_debt = total_debt - total_cash
    mcap = price * shares
    ev = mcap + total_debt - total_cash

    # ---- Balance sheet detail for forensic scores (Altman Z, Piotroski F,
    # Beneish M) and tangible book value. All pulled the same way as the
    # existing fields above -- multi-year series from yfinance's free
    # balance_sheet/income_stmt, no new data source, no paid API.
    total_assets    = row(bs, "Total Assets")
    total_liab      = row(bs, "Total Liabilities Net Minority Interest", "Total Liab")
    current_assets  = row(bs, "Current Assets", "Total Current Assets")
    current_liab    = row(bs, "Current Liabilities", "Total Current Liabilities")
    retained_earn   = row(bs, "Retained Earnings")
    lt_debt         = row(bs, "Long Term Debt", "Long Term Debt And Capital Lease Obligation")
    receivables     = row(bs, "Accounts Receivable", "Receivables")
    ppe_net         = row(bs, "Net PPE", "Net Property Plant And Equipment")
    goodwill_intang = row(bs, "Goodwill And Other Intangible Assets", "Goodwill")
    cogs            = row(fin, "Cost Of Revenue", "Reconciled Cost Of Revenue")
    sga             = row(fin, "Selling General And Administration", "SG&A Expense")
    depr            = row(cf, "Depreciation And Amortization", "Depreciation")
    diluted_shares  = row(fin, "Diluted Average Shares")

    return {
        "t": sym, "n": info.get("shortName") or sym, "mkt": mkt,
        "sec": info.get("sector") or "", "ind": info.get("industry") or "",
        "price": round(price, 2),
        "shares": round(shares / (1e9 if mkt == "US" else 1e7), 4),
        "mcap": round(scaled([mcap], mkt)[0], 2),
        "ev": round(scaled([ev], mkt)[0], 2),
        "debt": round(scaled([net_debt], mkt)[0], 2),
        "g": G_OVERRIDE.get(sym, DEFAULT_G),
        "pe": info.get("trailingPE"), "fpe": info.get("forwardPE"),
        "pb": info.get("priceToBook"), "ps": info.get("priceToSalesTrailing12Months"),
        "evEbitda": info.get("enterpriseToEbitda"),
        "divYield": round((info.get("dividendYield") or 0), 2),
        "roe": round((info.get("returnOnEquity") or 0) * 100, 2) if info.get("returnOnEquity") else None,
        "roa": round((info.get("returnOnAssets") or 0) * 100, 2) if info.get("returnOnAssets") else None,
        "beta": info.get("beta"),
        "high52": info.get("fiftyTwoWeekHigh"), "low52": info.get("fiftyTwoWeekLow"),
        "insiderPct": round((info.get("heldPercentInsiders") or 0) * 100, 2) if info.get("heldPercentInsiders") else None,
        "prevInsiderPct": None,
        # Balance-sheet detail, multi-year (index 0 = most recent), unscaled
        # to raw currency units -- forensic formulas below use ratios so
        # absolute scale cancels out; keeping raw avoids compounding
        # rounding error across three multi-factor scores.
        "bsDetail": {
            "totalAssets": scaled(total_assets, mkt), "totalLiab": scaled(total_liab, mkt),
            "currentAssets": scaled(current_assets, mkt), "currentLiab": scaled(current_liab, mkt),
            "retainedEarnings": scaled(retained_earn, mkt), "ltDebt": scaled(lt_debt, mkt),
            "receivables": scaled(receivables, mkt), "ppeNet": scaled(ppe_net, mkt),
            "goodwillIntangibles": scaled(goodwill_intang, mkt), "cogs": scaled(cogs, mkt),
            "sga": scaled(sga, mkt), "depreciation": scaled(depr, mkt),
            "dilutedShares": diluted_shares,  # count, not currency -- left unscaled (only used for YoY change check)
        },
        "annual": {
            "periods": periods(fin),
            "revenue": scaled(arev, mkt), "grossProfit": scaled(agp, mkt),
            "operatingIncome": scaled(aoi, mkt), "ebitda": scaled(aebitda, mkt),
            "netIncome": scaled(ani, mkt), "ocf": scaled(aocf, mkt),
            "capex": scaled(acapex, mkt), "fcf": scaled(afcf, mkt),
            "margins": margins(arev, ("gross", agp), ("operating", aoi),
                               ("ebitda", aebitda), ("net", ani), ("fcf", afcf)),
        },
        "quarterly": {
            "periods": periods(qfin),
            "revenue": scaled(qrev, mkt), "ebitda": scaled(qebitda, mkt),
            "netIncome": scaled(qni, mkt), "fcf": scaled(qfcf, mkt),
            "operatingIncome": scaled(qoi, mkt),
            "margins": margins(qrev, ("operating", qoi), ("ebitda", qebitda),
                               ("net", qni), ("fcf", qfcf)),
        },
    }


def main():
    import os
    target = "public/data.json" if os.path.isdir("public") else "data.json"

    # Load the previous run's output (if any) so we can carry forward last
    # period's insider/promoter % as prevInsiderPct -- this is how the trend
    # accumulates for free across successive runs, with no paid history API.
    prev_insider = {}
    try:
        old = json.load(open(target))
        for rec in old:
            if rec.get("insiderPct") is not None:
                prev_insider[rec["t"]] = rec["insiderPct"]
    except Exception:
        pass  # first run ever, or file missing/corrupt -- fine, just no history yet

    out, jobs = [], [(s, "US") for s in US] + [(s, "IN") for s in IN]
    est_min = round(len(jobs) * 1.0 / 60, 1)
    print(f"Fetching {len(jobs)} tickers (~{est_min} min at 1 req/sec)...\n")
    for i, (s, m) in enumerate(jobs, 1):
        print(f"[{i}/{len(jobs)}] {s} ({m})")
        try:
            r = pull(s, m)
            if r:
                # carry forward last run's value as prevInsiderPct, but only
                # if it actually differs from today's (otherwise no new info)
                old_val = prev_insider.get(s)
                if old_val is not None and old_val != r.get("insiderPct"):
                    r["prevInsiderPct"] = old_val
                out.append(r)
        except Exception as e:
            print(f"  ! {s}: {e}")
        time.sleep(1.0)
    def clean(o):
        if isinstance(o, float):
            return None if (o != o or o in (float("inf"), float("-inf"))) else o
        if isinstance(o, list):
            return [clean(x) for x in o]
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        return o
    out = clean(out)
    json.dump(out, open(target, "w"), indent=2, allow_nan=False)
    print(f"\nWrote {target} with {len(out)} stocks. Refresh the browser to load it.")


if __name__ == "__main__":
    main()
