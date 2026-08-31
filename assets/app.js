/* Liest data/news.json (von der GitHub Action erzeugt) und baut die Karten. */
(function () {
  "use strict";

  var NEWS_URL = "data/news.json";
  var TIME_ZONE = "Europe/Berlin";

  var newsEl = document.getElementById("news");
  var statusEl = document.getElementById("status");
  var generatedEl = document.getElementById("generated");
  var clockEl = document.getElementById("clock");
  var reloadBtn = document.getElementById("reload");

  var timeFmt = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE
  });
  var dateTimeFmt = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE
  });
  var fullFmt = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE
  });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text; // textContent = kein HTML aus dem Feed
    return node;
  }

  function dayKey(date) {
    return new Intl.DateTimeFormat("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: TIME_ZONE
    }).format(date);
  }

  /* Heute nur die Uhrzeit, aeltere Meldungen zusaetzlich mit Datum. */
  function formatStamp(iso) {
    if (!iso) return "";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    if (dayKey(date) === dayKey(new Date())) return timeFmt.format(date) + " Uhr";
    return dateTimeFmt.format(date) + " Uhr";
  }

  function buildCard(feed) {
    var card = el("article", "card");
    var head = el("header", "card-head");

    var title = el("h3");
    if (feed.site) {
      var siteLink = el("a", null, feed.name || "Feed");
      siteLink.href = feed.site;
      siteLink.target = "_blank";
      siteLink.rel = "noopener noreferrer";
      title.appendChild(siteLink);
    } else {
      title.textContent = feed.name || "Feed";
    }
    head.appendChild(title);

    var items = Array.isArray(feed.items) ? feed.items : [];
    if (items.length) {
      var count = items.length === 1 ? "1 Meldung" : items.length + " Meldungen";
      head.appendChild(el("span", "card-count", count));
    }
    card.appendChild(head);

    if (!items.length) {
      var message = feed.error
        ? "Feed konnte zuletzt nicht geladen werden."
        : "Keine Einträge vorhanden.";
      card.appendChild(el("p", feed.error ? "card-error" : "placeholder-text", message));
      return card;
    }

    var list = el("ul", "headlines");
    items.forEach(function (item) {
      var link = el("a", "headline");
      link.href = item.link || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.appendChild(el("span", "headline-title", item.title || "Ohne Titel"));

      var stamp = formatStamp(item.published);
      if (stamp) {
        var time = el("time", "headline-time", stamp);
        time.dateTime = item.published;
        link.appendChild(time);
      }
      if (item.summary) link.title = item.summary;

      var li = document.createElement("li");
      li.appendChild(link);
      list.appendChild(li);
    });

    card.appendChild(list);
    return card;
  }

  function render(data) {
    var feeds = Array.isArray(data.feeds) ? data.feeds : [];
    newsEl.textContent = "";

    if (!feeds.length) {
      newsEl.appendChild(el("p", "placeholder-text", "Keine Feeds konfiguriert."));
    } else {
      feeds.forEach(function (feed) {
        newsEl.appendChild(buildCard(feed));
      });
    }

    var failed = feeds.filter(function (f) { return f.error; }).length;
    statusEl.textContent = failed
      ? failed + " von " + feeds.length + " Feeds mit Fehler"
      : "aktuell";
    statusEl.classList.toggle("is-error", failed > 0);

    var generated = data.generatedAt ? new Date(data.generatedAt) : null;
    generatedEl.textContent =
      generated && !isNaN(generated.getTime())
        ? "Stand der Daten: " + fullFmt.format(generated) + " Uhr"
        : "Stand der Daten: unbekannt";
  }

  function load() {
    reloadBtn.disabled = true;
    statusEl.classList.remove("is-error");
    statusEl.textContent = "lädt …";

    // Cache-Buster, damit das iPad nach einem Action-Lauf nicht die alte JSON zeigt.
    fetch(NEWS_URL + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(render)
      .catch(function (error) {
        newsEl.textContent = "";
        newsEl.appendChild(
          el("p", "card-error", "data/news.json konnte nicht geladen werden (" + error.message + ").")
        );
        statusEl.textContent = "Fehler";
        statusEl.classList.add("is-error");
      })
      .then(function () {
        reloadBtn.disabled = false;
      });
  }

  function tickClock() {
    clockEl.textContent = timeFmt.format(new Date());
  }

  reloadBtn.addEventListener("click", load);

  // Wenn das iPad aus dem Standby kommt: frische Daten holen.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) load();
  });

  tickClock();
  setInterval(tickClock, 30 * 1000);
  setInterval(load, 15 * 60 * 1000);
  load();
})();
