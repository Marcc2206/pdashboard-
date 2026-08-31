#!/usr/bin/env python3
"""Prueft Feed-Adressen, bevor sie in feeds.json landen.

Aufruf:  python3 scripts/check_feeds.py <url> [<url> ...]
Gibt pro Adresse aus, ob sie erreichbar ist und wie viele Eintraege sie liefert.
"""

import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from fetch_feeds import USER_AGENT, parse_feed  # noqa: E402

TIMEOUT = 30


def check(url: str) -> None:
    print(f"\n=== {url}")
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read()
            final = response.geturl()
            ctype = response.headers.get("Content-Type", "?")
            print(f"    HTTP {response.status} | {ctype} | {len(raw)} Bytes")
            if final != url:
                print(f"    Weiterleitung -> {final}")
    except urllib.error.HTTPError as exc:
        print(f"    FEHLER HTTP {exc.code} {exc.reason}")
        return
    except Exception as exc:  # noqa: BLE001 - hier ist jede Ursache interessant
        print(f"    FEHLER {type(exc).__name__}: {exc}")
        return

    try:
        items = parse_feed(raw, 5)
    except Exception as exc:  # noqa: BLE001
        print(f"    NICHT LESBAR {type(exc).__name__}: {exc}")
        print(f"    Anfang: {raw[:160]!r}")
        return

    mit_text = sum(1 for i in items if i["summary"])
    print(f"    OK: {len(items)} Eintraege, davon {mit_text} mit Anreisser-Text")
    for item in items[:3]:
        print(f"      - [{item['published']}] {item['title'][:80]}")
        print(f"        Text: {item['summary'][:110] or '(keiner)'}")
    if not items:
        print(f"    Anfang: {raw[:160]!r}")


if __name__ == "__main__":
    for candidate in sys.argv[1:]:
        check(candidate.strip())
