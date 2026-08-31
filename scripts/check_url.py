#!/usr/bin/env python3
"""Ruft beliebige Adressen ab und zeigt den Anfang der Antwort.

Gedacht zum Pruefen von Datenquellen (Kurse, Wetter, …), bevor sie fest
eingebaut werden. Aufruf: python3 scripts/check_url.py <url> [<url> ...]
"""

import sys
import urllib.error
import urllib.request

USER_AGENT = "personal-dashboard/1.0 (+https://github.com)"
TIMEOUT = 30
VORSCHAU = 700


def check(url: str) -> None:
    print(f"\n=== {url}")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read()
            print(f"    HTTP {response.status} | {response.headers.get('Content-Type', '?')} "
                  f"| {len(raw)} Bytes")
            if response.geturl() != url:
                print(f"    Weiterleitung -> {response.geturl()}")
    except urllib.error.HTTPError as exc:
        print(f"    FEHLER HTTP {exc.code} {exc.reason}")
        return
    except Exception as exc:  # noqa: BLE001 - jede Ursache ist hier interessant
        print(f"    FEHLER {type(exc).__name__}: {exc}")
        return

    text = raw[:VORSCHAU].decode("utf-8", errors="replace")
    for zeile in text.splitlines():
        print(f"    | {zeile}")


if __name__ == "__main__":
    for candidate in sys.argv[1:]:
        check(candidate.strip())
