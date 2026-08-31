# Persönliches Dashboard

Statische Seite für GitHub Pages: links die Nachrichten aus mehreren RSS-Feeds,
rechts das Wetter und Platz für weitere Module. Die Seite holt selbst **nichts**
ab – das macht alle 2 Stunden ein GitHub-Actions-Workflow und legt das Ergebnis
als `data/news.json` und `data/weather.json` ab. Dadurch gibt es keine
CORS-Probleme im Browser.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Grundgerüst der Seite |
| `assets/style.css` | Dunkles Design, zwei Spalten |
| `assets/app.js` | Lädt `data/news.json` und baut die Karten |
| `feeds.json` | **Hier die Feeds pflegen** |
| `weather.json` | **Hier den Wetterort pflegen** |
| `markets.json` | **Hier die Kurse pflegen** |
| `data/news.json` | Schlagzeilen des letzten Abrufs (automatisch) |
| `data/weather.json` | Wetter des letzten Abrufs (automatisch) |
| `data/markets.json` | Kurse des letzten Abrufs (automatisch) |
| `scripts/fetch_feeds.py` | Holt und parst die Feeds (nur Python-Standardbibliothek) |
| `scripts/fetch_weather.py` | Holt die Vorhersage von Open-Meteo (kostenlos, ohne Anmeldung) |
| `scripts/fetch_markets.py` | Holt Kurse von Yahoo Finance und CoinGecko |
| `scripts/check_feeds.py` | Prüft Feed-Adressen, bevor sie in `feeds.json` kommen |
| `scripts/check_url.py` | Prüft beliebige Datenquellen |
| `.github/workflows/update-news.yml` | Läuft alle 2 Stunden, committet die Daten |
| `.github/workflows/check-feeds.yml` | Manueller Test von Adressen |

## Feeds ändern

`feeds.json` bearbeiten – RSS und Atom werden beide unterstützt:

```json
{
  "feeds": [
    { "id": "kurzname", "name": "Anzeigename", "url": "https://…/feed.xml", "site": "https://…" }
  ],
  "maxItemsPerFeed": 5
}
```

Nach dem Commit läuft der Workflow automatisch einmal neu. Vorher testen:
**Actions → „Feed-Adressen testen" → Run workflow**, Adressen durch Leerzeichen
getrennt eintragen. Die Ausgabe zeigt, ob die Quelle antwortet, wie viele
Einträge sie liefert und ob Anreißer-Texte dabei sind.

## Wetterort ändern

`weather.json` bearbeiten. Entweder Koordinaten eintragen oder `latitude` und
`longitude` auf `null` setzen – dann wird `ort` über die Ortssuche von
Open-Meteo aufgelöst.

## Kurse ändern

`markets.json` bearbeiten. `symbol` ist das Kürzel bei Yahoo Finance – deutsche
Aktien enden auf `.DE` (z. B. `BMW.DE`), Indizes beginnen mit `^` (z. B. `^GDAXI`).
Für Kryptowährungen `"quelle": "coingecko"` setzen; `symbol` ist dann der Name
bei CoinGecko (z. B. `ethereum`).

## GitHub Pages einschalten

1. Branch nach `main` mergen.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   Branch `main`, Ordner `/ (root)`, speichern.
3. Nach ein bis zwei Minuten ist die Seite unter
   `https://<benutzername>.github.io/<repo>/` erreichbar.

## Feeds sofort abrufen

**Actions → „RSS-Feeds aktualisieren“ → Run workflow.** Schlägt der Push fehl,
unter **Settings → Actions → General → Workflow permissions** „Read and write
permissions“ aktivieren.

Hinweis: GitHub pausiert `schedule`-Workflows in Repos, in denen 60 Tage lang
nichts passiert. Ein manueller Lauf reaktiviert sie.
