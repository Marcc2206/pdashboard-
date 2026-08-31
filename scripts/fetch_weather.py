#!/usr/bin/env python3
"""Holt die Wettervorhersage und schreibt sie nach data/weather.json.

Datenquelle ist Open-Meteo (open-meteo.com): kostenlos, ohne Anmeldung und
ohne Schluessel. Ort und Umfang stehen in weather.json.

Sind dort latitude/longitude nicht gesetzt, wird der Ort ueber die
Geocoding-Schnittstelle von Open-Meteo nachgeschlagen.
"""

import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG_FILE = ROOT / "weather.json"
OUT_FILE = ROOT / "data" / "weather.json"

USER_AGENT = "personal-dashboard/1.0 (+https://github.com)"
TIMEOUT = 30
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# WMO-Wettercodes, wie Open-Meteo sie liefert.
WEATHER_CODES = {
    0: ("Klar", "☀️"),
    1: ("Überwiegend klar", "🌤️"),
    2: ("Teils bewölkt", "⛅"),
    3: ("Bedeckt", "☁️"),
    45: ("Nebel", "🌫️"),
    48: ("Reifnebel", "🌫️"),
    51: ("Leichter Sprühregen", "🌦️"),
    53: ("Sprühregen", "🌦️"),
    55: ("Starker Sprühregen", "🌧️"),
    56: ("Gefrierender Sprühregen", "🌧️"),
    57: ("Gefrierender Sprühregen", "🌧️"),
    61: ("Leichter Regen", "🌦️"),
    63: ("Regen", "🌧️"),
    65: ("Starker Regen", "🌧️"),
    66: ("Gefrierender Regen", "🌧️"),
    67: ("Gefrierender Regen", "🌧️"),
    71: ("Leichter Schneefall", "🌨️"),
    73: ("Schneefall", "🌨️"),
    75: ("Starker Schneefall", "❄️"),
    77: ("Schneegriesel", "🌨️"),
    80: ("Leichte Schauer", "🌦️"),
    81: ("Schauer", "🌦️"),
    82: ("Kräftige Schauer", "🌧️"),
    85: ("Schneeschauer", "🌨️"),
    86: ("Starke Schneeschauer", "❄️"),
    95: ("Gewitter", "⛈️"),
    96: ("Gewitter mit Hagel", "⛈️"),
    99: ("Schweres Gewitter mit Hagel", "⛈️"),
}


def get_json(url: str, params: dict) -> dict:
    full = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def describe(code) -> dict:
    text, icon = WEATHER_CODES.get(code, ("Unbekannt", "•"))
    return {"code": code, "text": text, "icon": icon}


def resolve_place(config: dict) -> tuple:
    """Koordinaten aus der Konfiguration oder per Ortssuche."""
    lat, lon = config.get("latitude"), config.get("longitude")
    if lat is not None and lon is not None:
        return float(lat), float(lon), config.get("ort", "")

    name = config.get("ort")
    if not name:
        raise ValueError("weather.json enthaelt weder Koordinaten noch einen Ort.")

    data = get_json(GEOCODE_URL, {"name": name, "count": 5, "language": "de", "format": "json"})
    treffer = data.get("results") or []
    if not treffer:
        raise ValueError(f"Ort '{name}' nicht gefunden.")

    # Bei mehreren gleichnamigen Orten den im konfigurierten Land bevorzugen.
    land = (config.get("land") or "").lower()
    best = treffer[0]
    for eintrag in treffer:
        if land and (eintrag.get("country", "").lower() == land):
            best = eintrag
            break

    print(
        f"Ort gefunden: {best.get('name')}, {best.get('admin1')}, {best.get('country')} "
        f"({best['latitude']}, {best['longitude']})"
    )
    for eintrag in treffer:
        print(f"   Treffer: {eintrag.get('name')}, {eintrag.get('admin1')}, "
              f"{eintrag.get('country')} ({eintrag['latitude']}, {eintrag['longitude']})")
    return float(best["latitude"]), float(best["longitude"]), best.get("name", name)


def main() -> int:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    zeitzone = config.get("zeitzone", "Europe/Berlin")
    tage = int(config.get("tage", 4))

    try:
        lat, lon, ort = resolve_place(config)
        data = get_json(
            FORECAST_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "timezone": zeitzone,
                "forecast_days": tage,
                "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
                           "precipitation,weather_code,wind_speed_10m",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,"
                         "precipitation_probability_max,sunrise,sunset",
            },
        )
    except (urllib.error.URLError, OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"FEHLER {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    current = data.get("current", {})
    daily = data.get("daily", {})
    einheiten = data.get("current_units", {})

    tage_liste = []
    for index, datum in enumerate(daily.get("time", [])):
        tage_liste.append(
            {
                "datum": datum,
                "max": daily.get("temperature_2m_max", [None] * (index + 1))[index],
                "min": daily.get("temperature_2m_min", [None] * (index + 1))[index],
                "regenwahrscheinlichkeit": daily.get(
                    "precipitation_probability_max", [None] * (index + 1)
                )[index],
                "sonnenaufgang": daily.get("sunrise", [None] * (index + 1))[index],
                "sonnenuntergang": daily.get("sunset", [None] * (index + 1))[index],
                "wetter": describe(daily.get("weather_code", [None] * (index + 1))[index]),
            }
        )

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ort": ort,
        "quelle": "Open-Meteo",
        "koordinaten": {"latitude": lat, "longitude": lon},
        "jetzt": {
            "zeit": current.get("time"),
            "temperatur": current.get("temperature_2m"),
            "gefuehlt": current.get("apparent_temperature"),
            "luftfeuchte": current.get("relative_humidity_2m"),
            "niederschlag": current.get("precipitation"),
            "wind": current.get("wind_speed_10m"),
            "einheit": einheiten.get("temperature_2m", "°C"),
            "windEinheit": einheiten.get("wind_speed_10m", "km/h"),
            "wetter": describe(current.get("weather_code")),
        },
        "tage": tage_liste,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    jetzt = result["jetzt"]
    print(
        f"-> data/weather.json: {ort}, {jetzt['temperatur']}{jetzt['einheit']}, "
        f"{jetzt['wetter']['text']}, {len(tage_liste)} Tage Vorhersage"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
