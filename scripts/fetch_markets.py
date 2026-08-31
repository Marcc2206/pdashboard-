#!/usr/bin/env python3
"""Holt Kurse und schreibt sie nach data/markets.json.

Quellen (beide kostenlos und ohne Anmeldung):
  - Yahoo Finance Chart-Schnittstelle fuer Indizes und Aktien
  - CoinGecko fuer Kryptowaehrungen

Welche Werte geholt werden, steht in markets.json.
"""

import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG_FILE = ROOT / "markets.json"
OUT_FILE = ROOT / "data" / "markets.json"

USER_AGENT = "personal-dashboard/1.0 (+https://github.com)"
TIMEOUT = 30
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/"
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"


def get_json(url: str, params: dict = None) -> dict:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def from_yahoo(eintrag: dict) -> dict:
    symbol = eintrag["symbol"]
    data = get_json(
        YAHOO_URL + urllib.parse.quote(symbol),
        {"interval": "1d", "range": "5d"},
    )
    ergebnis = (data.get("chart", {}).get("result") or [None])[0]
    if not ergebnis:
        raise ValueError(f"Keine Daten fuer {symbol}")
    meta = ergebnis.get("meta", {})

    kurs = meta.get("regularMarketPrice")
    prozent = meta.get("regularMarketChangePercent")

    # chartPreviousClose ist der Schluss VOR dem abgefragten Zeitraum, nicht der
    # Vortagesschluss - daraus berechnete Prozente waeren falsch. Deshalb gilt
    # regularMarketChangePercent, und der Vortageswert wird daraus zurueckgerechnet.
    if prozent is not None and kurs is not None:
        vortag = kurs / (1 + prozent / 100) if prozent != -100 else None
    else:
        vortag = meta.get("chartPreviousClose") or meta.get("previousClose")
        if prozent is None and kurs is not None and vortag:
            prozent = (kurs - vortag) / vortag * 100

    return {
        "kurs": kurs,
        "waehrung": meta.get("currency", ""),
        "veraenderung": None if (kurs is None or vortag is None) else kurs - vortag,
        "prozent": prozent,
        "vortag": vortag,
        "hoch52": meta.get("fiftyTwoWeekHigh"),
        "tief52": meta.get("fiftyTwoWeekLow"),
        "stand": meta.get("regularMarketTime"),
        "boerse": meta.get("fullExchangeName", ""),
    }


def from_coingecko(eintrag: dict) -> dict:
    waehrung = (eintrag.get("waehrung") or "eur").lower()
    coin = eintrag["symbol"]
    data = get_json(
        COINGECKO_URL,
        {"ids": coin, "vs_currencies": waehrung, "include_24hr_change": "true"},
    )
    werte = data.get(coin)
    if not werte:
        raise ValueError(f"Keine Daten fuer {coin}")

    kurs = werte.get(waehrung)
    prozent = werte.get(f"{waehrung}_24h_change")
    vortag = None
    if kurs is not None and prozent is not None:
        vortag = kurs / (1 + prozent / 100)

    return {
        "kurs": kurs,
        "waehrung": waehrung.upper(),
        "veraenderung": None if vortag is None else kurs - vortag,
        "prozent": prozent,
        "vortag": vortag,
        "hoch52": None,
        "tief52": None,
        "stand": None,
        "boerse": "CoinGecko",
    }


HOLER = {"yahoo": from_yahoo, "coingecko": from_coingecko}


def main() -> int:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    werte = config.get("werte", [])

    result = {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "werte": []}
    fehler = 0

    for eintrag in werte:
        name = eintrag.get("name") or eintrag.get("symbol", "?")
        zeile = {
            "id": eintrag.get("id") or name.lower(),
            "name": name,
            "symbol": eintrag.get("symbol", ""),
            "typ": eintrag.get("typ", ""),
            "error": None,
        }
        holer = HOLER.get(eintrag.get("quelle", "yahoo"))
        try:
            if holer is None:
                raise ValueError(f"Unbekannte Quelle '{eintrag.get('quelle')}'")
            zeile.update(holer(eintrag))
            prozent = zeile.get("prozent")
            zusatz = "" if prozent is None else f" ({prozent:+.2f} %)"
            print(f"OK   {name}: {zeile['kurs']} {zeile['waehrung']}{zusatz}")
        except (urllib.error.URLError, OSError, ValueError, KeyError,
                TypeError, json.JSONDecodeError) as exc:
            fehler += 1
            zeile["error"] = f"{type(exc).__name__}: {exc}"
            zeile.setdefault("kurs", None)
            print(f"FAIL {name}: {zeile['error']}", file=sys.stderr)
        result["werte"].append(zeile)

    # Zeitstempel beibehalten, wenn sich kein Kurs geaendert hat.
    if OUT_FILE.exists():
        try:
            previous = json.loads(OUT_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            previous = None
        if previous and previous.get("werte") == result["werte"]:
            result["generatedAt"] = previous.get("generatedAt", result["generatedAt"])

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"-> data/markets.json ({len(result['werte'])} Werte, {fehler} Fehler)")

    return 1 if werte and fehler == len(werte) else 0


if __name__ == "__main__":
    raise SystemExit(main())
