#!/usr/bin/env python3
"""Liest die Feeds aus feeds.json und schreibt das Ergebnis nach data/news.json.

Bewusst ohne externe Abhaengigkeiten (nur Python-Standardbibliothek), damit der
GitHub-Actions-Workflow ohne pip-Install auskommt.
"""

import json
import pathlib
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

ROOT = pathlib.Path(__file__).resolve().parent.parent
FEEDS_FILE = ROOT / "feeds.json"
OUT_FILE = ROOT / "data" / "news.json"

USER_AGENT = "personal-dashboard/1.0 (+https://github.com)"
TIMEOUT = 30

# Namensraeume, die in RSS/Atom vorkommen. Wir strippen sie beim Parsen weg.
TAG_RE = re.compile(r"^\{[^}]*\}")


def local(tag: str) -> str:
    """'{http://www.w3.org/2005/Atom}entry' -> 'entry'"""
    return TAG_RE.sub("", tag)


def find_child(node, *names):
    """Erstes Kind, dessen lokaler Tagname in names steht."""
    for child in node:
        if local(child.tag) in names:
            return child
    return None


def text_of(node) -> str:
    if node is None:
        return ""
    return " ".join("".join(node.itertext()).split())


def strip_html(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = (
        value.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    return " ".join(value.split())


def parse_date(value: str):
    """RSS (RFC 822) und Atom (ISO 8601) Datumsangaben -> aware datetime."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt is not None:
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        pass
    cleaned = value.replace("Z", "+00:00")
    for candidate in (cleaned, cleaned[:19]):
        try:
            dt = datetime.fromisoformat(candidate)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def entry_link(node) -> str:
    """RSS: <link>URL</link>. Atom: <link href="URL" rel="alternate"/>."""
    fallback = ""
    for child in node:
        if local(child.tag) != "link":
            continue
        href = child.attrib.get("href")
        if href:
            rel = child.attrib.get("rel", "alternate")
            if rel == "alternate":
                return href
            fallback = fallback or href
        elif text_of(child):
            return text_of(child)
    return fallback


def fetch(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return response.read()


def parse_feed(raw: bytes, limit: int):
    root = ElementTree.fromstring(raw)
    if local(root.tag) == "rss":
        channel = find_child(root, "channel")
        nodes = [c for c in (channel if channel is not None else []) if local(c.tag) == "item"]
    elif local(root.tag) == "feed":
        nodes = [c for c in root if local(c.tag) == "entry"]
    else:  # RDF / RSS 1.0
        nodes = [c for c in root.iter() if local(c.tag) == "item"]

    items = []
    seen = set()
    for node in nodes:
        title = strip_html(text_of(find_child(node, "title")))
        link = entry_link(node).strip()
        if not title or not link:
            continue
        # Manche Feeds listen denselben Artikel mehrfach (z. B. in zwei Rubriken).
        if link in seen:
            continue
        seen.add(link)
        date_node = find_child(node, "pubDate", "published", "updated", "date")
        published = parse_date(text_of(date_node))
        summary = strip_html(text_of(find_child(node, "description", "summary")))
        if len(summary) > 220:
            summary = summary[:219].rstrip() + "…"
        items.append(
            {
                "title": title,
                "link": link,
                "published": published.astimezone(timezone.utc).isoformat() if published else None,
                "summary": summary,
            }
        )

    # Neueste zuerst; Eintraege ohne Datum behalten ihre Feed-Reihenfolge hinten.
    items.sort(key=lambda i: i["published"] or "", reverse=True)
    return items[:limit]


def main() -> int:
    config = json.loads(FEEDS_FILE.read_text(encoding="utf-8"))
    feeds = config.get("feeds", [])
    limit = int(config.get("maxItemsPerFeed", 5))

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "feeds": [],
    }
    failures = 0

    for feed in feeds:
        name = feed.get("name") or feed.get("id") or feed.get("url", "Feed")
        entry = {
            "id": feed.get("id") or name.lower().replace(" ", "-"),
            "name": name,
            "site": feed.get("site") or feed.get("url", ""),
            "url": feed.get("url", ""),
            "items": [],
            "error": None,
        }
        try:
            entry["items"] = parse_feed(fetch(entry["url"]), limit)
            print(f"OK   {name}: {len(entry['items'])} Eintraege")
        except (urllib.error.URLError, ElementTree.ParseError, ValueError, OSError) as exc:
            failures += 1
            entry["error"] = f"{type(exc).__name__}: {exc}"
            print(f"FAIL {name}: {entry['error']}", file=sys.stderr)
        result["feeds"].append(entry)

    # Wenn sich inhaltlich nichts geaendert hat, den alten Zeitstempel behalten.
    # Dann erzeugt der Workflow keinen leeren Commit alle zwei Stunden.
    if OUT_FILE.exists():
        try:
            previous = json.loads(OUT_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            previous = None
        if previous and previous.get("feeds") == result["feeds"]:
            result["generatedAt"] = previous.get("generatedAt", result["generatedAt"])

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"-> {OUT_FILE.relative_to(ROOT)} geschrieben ({len(result['feeds'])} Feeds, {failures} Fehler)")

    # Nur abbrechen, wenn wirklich kein einziger Feed geklappt hat.
    return 1 if feeds and failures == len(feeds) else 0


if __name__ == "__main__":
    raise SystemExit(main())
