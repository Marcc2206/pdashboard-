# Persönliches Dashboard

Statische Seite für GitHub Pages: links die Nachrichten aus mehreren RSS-Feeds,
rechts Platz für spätere Module. Die Seite selbst holt **keine** Feeds ab – das
macht alle 2 Stunden ein GitHub-Actions-Workflow und legt das Ergebnis als
`data/news.json` ab. Dadurch gibt es keine CORS-Probleme im Browser.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Grundgerüst der Seite |
| `assets/style.css` | Dunkles Design, zwei Spalten |
| `assets/app.js` | Lädt `data/news.json` und baut die Karten |
| `feeds.json` | **Hier die Feeds pflegen** |
| `data/news.json` | Ergebnis des letzten Abrufs (wird automatisch aktualisiert) |
| `scripts/fetch_feeds.py` | Holt und parst die Feeds (nur Python-Standardbibliothek) |
| `.github/workflows/update-news.yml` | Läuft alle 2 Stunden, committet `data/news.json` |

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

Nach dem Commit läuft der Workflow automatisch einmal neu.

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
