/* Liest data/news.json (von der GitHub Action erzeugt) und baut die Karten. */
(function () {
  "use strict";

  var NEWS_URL = "data/news.json";
  var WEATHER_URL = "data/weather.json";
  var MARKETS_URL = "data/markets.json";
  var KNOWLEDGE_URL = "knowledge.json";
  var VOCAB_URL = "vocab.json";
  var TIME_ZONE = "Europe/Berlin";

  var newsEl = document.getElementById("news");
  var statusEl = document.getElementById("status");
  var generatedEl = document.getElementById("generated");
  var clockEl = document.getElementById("clock");
  var reloadBtn = document.getElementById("reload");
  var weatherEl = document.getElementById("weather");
  var weatherPlaceEl = document.getElementById("weather-place");
  var weatherUpdatedEl = document.getElementById("weather-updated");
  var marketsEl = document.getElementById("markets");
  var marketsUpdatedEl = document.getElementById("markets-updated");
  var knowledgeEl = document.getElementById("knowledge");
  var knowledgeNextBtn = document.getElementById("knowledge-next");
  var vocabEl = document.getElementById("vocab");
  var vocabNextBtn = document.getElementById("vocab-next");

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

      if (item.summary) {
        link.appendChild(el("span", "headline-summary", item.summary));
      }

      var stamp = formatStamp(item.published);
      if (stamp) {
        var time = el("time", "headline-time", stamp);
        time.dateTime = item.published;
        link.appendChild(time);
      }

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


  /* ---------- Wetter ---------- */

  var weekdayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: TIME_ZONE });

  function clockOf(iso) {
    if (!iso) return "";
    // Open-Meteo liefert lokale Zeiten ohne Zeitzonen-Kennung ("2026-08-31T14:30").
    var match = /T(\d{2}:\d{2})/.exec(iso);
    return match ? match[1] : "";
  }

  function labelForDay(iso, index) {
    if (index === 0) return "Heute";
    if (index === 1) return "Morgen";
    var date = new Date(iso + "T12:00:00");
    return isNaN(date.getTime()) ? iso : weekdayFmt.format(date);
  }

  function degrees(value, unit) {
    return value == null ? "–" : Math.round(value) + (unit || "°");
  }

  function renderWeather(data) {
    weatherEl.textContent = "";
    weatherPlaceEl.textContent = "Wetter " + (data.ort || "");

    var now = data.jetzt || {};
    var unit = now.einheit || "°C";
    var wetter = now.wetter || {};

    var head = el("div", "weather-now");
    head.appendChild(el("span", "weather-icon", wetter.icon || "•"));

    var block = el("div", "weather-now-text");
    block.appendChild(el("span", "weather-temp", degrees(now.temperatur, unit)));
    block.appendChild(el("span", "weather-desc", wetter.text || ""));
    head.appendChild(block);
    weatherEl.appendChild(head);

    var facts = [];
    if (now.gefuehlt != null) facts.push("gefühlt " + degrees(now.gefuehlt, unit));
    if (now.wind != null) facts.push("Wind " + Math.round(now.wind) + " " + (now.windEinheit || "km/h"));
    if (now.luftfeuchte != null) facts.push(now.luftfeuchte + " % Luftfeuchte");
    if (facts.length) weatherEl.appendChild(el("p", "weather-facts", facts.join(" · ")));

    var days = Array.isArray(data.tage) ? data.tage : [];
    if (days.length) {
      var list = el("ul", "forecast");
      days.forEach(function (day, index) {
        var row = document.createElement("li");
        row.appendChild(el("span", "forecast-day", labelForDay(day.datum, index)));
        row.appendChild(el("span", "forecast-icon", (day.wetter || {}).icon || "•"));

        var rain = day.regenwahrscheinlichkeit;
        row.appendChild(el("span", "forecast-rain", rain == null ? "" : rain + " %"));
        row.appendChild(
          el("span", "forecast-temp", degrees(day.max, "°") + " / " + degrees(day.min, "°"))
        );
        list.appendChild(row);
      });
      weatherEl.appendChild(list);

      var today = days[0];
      if (today && today.sonnenaufgang && today.sonnenuntergang) {
        weatherEl.appendChild(
          el(
            "p",
            "weather-sun",
            "Sonne heute: " + clockOf(today.sonnenaufgang) + " bis " + clockOf(today.sonnenuntergang) + " Uhr"
          )
        );
      }
    }

    var stamp = data.generatedAt ? new Date(data.generatedAt) : null;
    weatherUpdatedEl.textContent =
      stamp && !isNaN(stamp.getTime()) ? timeFmt.format(stamp) + " Uhr" : "";
  }

  function loadWeather() {
    fetch(WEATHER_URL + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(renderWeather)
      .catch(function () {
        weatherEl.textContent = "";
        weatherEl.appendChild(el("p", "placeholder-text", "Wetterdaten noch nicht verfügbar."));
        weatherUpdatedEl.textContent = "";
      });
  }


  /* ---------- Kurse ---------- */

  var priceFmt = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  var percentFmt = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always"
  });

  var CURRENCY_SIGNS = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" };

  function formatPrice(value, currency, typ) {
    if (value == null) return "–";
    // Grosse Zahlen (Index, Bitcoin) ohne Nachkommastellen - liest sich ruhiger.
    var rounded = Math.abs(value) >= 1000
      ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value)
      : priceFmt.format(value);
    // Ein Index ist ein Punktestand, keine Geldsumme - dort keine Waehrung.
    if (typ === "index") return rounded;
    var sign = CURRENCY_SIGNS[currency];
    return sign ? rounded + " " + sign : rounded + (currency ? " " + currency : "");
  }


  /* Kleine Verlaufskurve als SVG. Die Werte werden auf die Box normiert,
     es geht also um die Form, nicht um absolute Hoehen. */
  function sparkline(werte, prozent) {
    var breite = 62;
    var hoehe = 24;
    var rand = 2;
    var min = Math.min.apply(null, werte);
    var max = Math.max.apply(null, werte);
    var spanne = max - min || 1;

    var punkte = werte.map(function (wert, index) {
      var x = (index / (werte.length - 1)) * breite;
      var y = hoehe - rand - ((wert - min) / spanne) * (hoehe - 2 * rand);
      return x.toFixed(1) + "," + y.toFixed(1);
    });

    var farbe = prozent > 0 ? "#5fd39a" : prozent < 0 ? "#ff8a8a" : "#9aa7b4";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "spark");
    svg.setAttribute("viewBox", "0 0 " + breite + " " + hoehe);
    svg.setAttribute("width", String(breite));
    svg.setAttribute("height", String(hoehe));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    var linie = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    linie.setAttribute("points", punkte.join(" "));
    linie.setAttribute("fill", "none");
    linie.setAttribute("stroke", farbe);
    linie.setAttribute("stroke-width", "1.6");
    linie.setAttribute("stroke-linejoin", "round");
    linie.setAttribute("stroke-linecap", "round");
    svg.appendChild(linie);

    // Punkt auf dem aktuellsten Wert, damit die Leserichtung klar ist.
    var letzte = punkte[punkte.length - 1].split(",");
    var punkt = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    punkt.setAttribute("cx", letzte[0]);
    punkt.setAttribute("cy", letzte[1]);
    punkt.setAttribute("r", "1.9");
    punkt.setAttribute("fill", farbe);
    svg.appendChild(punkt);

    return svg;
  }

  function buildRow(wert) {
    var row = document.createElement("li");
    row.className = "quote";

    var left = el("div", "quote-name");
    left.appendChild(el("span", "quote-label", wert.name || wert.symbol || "?"));
    if (wert.symbol && wert.symbol !== wert.name) {
      left.appendChild(el("span", "quote-symbol", wert.symbol));
    }
    row.appendChild(left);

    if (wert.error || wert.kurs == null) {
      row.appendChild(el("div", "quote-value quote-missing", "keine Daten"));
      return row;
    }

    var verlauf = Array.isArray(wert.verlauf) ? wert.verlauf : [];
    if (verlauf.length >= 2) {
      row.appendChild(sparkline(verlauf, wert.prozent));
    }

    var right = el("div", "quote-value");
    right.appendChild(el("span", "quote-price", formatPrice(wert.kurs, wert.waehrung, wert.typ)));

    if (wert.prozent != null) {
      var richtung = wert.prozent > 0 ? " is-up" : wert.prozent < 0 ? " is-down" : "";
      var text = percentFmt.format(wert.prozent) + " %";
      if (wert.veraenderung != null) {
        text += " (" + percentFmt.format(wert.veraenderung) + ")";
      }
      right.appendChild(el("span", "quote-change" + richtung, text));
    }

    row.appendChild(right);
    return row;
  }

  function renderMarkets(data) {
    marketsEl.textContent = "";
    var werte = Array.isArray(data.werte) ? data.werte : [];

    if (!werte.length) {
      marketsEl.appendChild(el("p", "placeholder-text", "Keine Kurse konfiguriert."));
      marketsUpdatedEl.textContent = "";
      return;
    }

    var list = el("ul", "quotes");
    werte.forEach(function (wert) {
      list.appendChild(buildRow(wert));
    });
    marketsEl.appendChild(list);
    marketsEl.appendChild(
      el("p", "quotes-note", "Kurse verzögert, alle 2 Stunden abgerufen. Keine Anlageberatung.")
    );

    var stamp = data.generatedAt ? new Date(data.generatedAt) : null;
    marketsUpdatedEl.textContent =
      stamp && !isNaN(stamp.getTime()) ? timeFmt.format(stamp) + " Uhr" : "";
  }

  function loadMarkets() {
    fetch(MARKETS_URL + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(renderMarkets)
      .catch(function () {
        marketsEl.textContent = "";
        marketsEl.appendChild(el("p", "placeholder-text", "Kursdaten noch nicht verfügbar."));
        marketsUpdatedEl.textContent = "";
      });
  }


  /* ---------- Lernmodule (Allgemeinwissen, Englisch) ---------- */

  /* Tagesnummer seit 1970. Dadurch wechselt der Inhalt taeglich von selbst,
     bleibt aber innerhalb eines Tages gleich. */
  function tagesNummer() {
    var jetzt = new Date();
    return Math.floor(
      Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate()) / 86400000
    );
  }

  /* Nimmt 'anzahl' Eintraege ab einer Startstelle und laeuft am Ende
     wieder vorne weiter, sodass die Liste endlos rotiert. */
  function auswahl(liste, anzahl, verschiebung) {
    var ergebnis = [];
    if (!liste.length) return ergebnis;
    var start = ((tagesNummer() + verschiebung) * anzahl) % liste.length;
    for (var i = 0; i < Math.min(anzahl, liste.length); i++) {
      ergebnis.push(liste[(start + i) % liste.length]);
    }
    return ergebnis;
  }

  function lernModul(behaelter, knopf, url, zeichne) {
    var eintraege = [];
    var proTag = 3;
    var verschiebung = 0;

    function zeigen() {
      behaelter.textContent = "";
      var teil = auswahl(eintraege, proTag, verschiebung);
      if (!teil.length) {
        behaelter.appendChild(el("p", "placeholder-text", "Keine Einträge vorhanden."));
        return;
      }
      teil.forEach(function (eintrag) {
        behaelter.appendChild(zeichne(eintrag));
      });
    }

    knopf.addEventListener("click", function () {
      verschiebung += 1;
      zeigen();
    });

    fetch(url, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        eintraege = Array.isArray(data.eintraege) ? data.eintraege : [];
        proTag = data.proTag || proTag;
        zeigen();
      })
      .catch(function () {
        behaelter.textContent = "";
        behaelter.appendChild(el("p", "placeholder-text", "Inhalte konnten nicht geladen werden."));
        knopf.disabled = true;
      });
  }

  function zeichneWissen(eintrag) {
    var block = el("article", "lern-eintrag");
    var kopf = el("div", "lern-kopf");
    kopf.appendChild(el("h4", "lern-titel", eintrag.titel || ""));
    if (eintrag.kategorie) kopf.appendChild(el("span", "lern-tag", eintrag.kategorie));
    block.appendChild(kopf);
    block.appendChild(el("p", "lern-text", eintrag.text || ""));
    return block;
  }

  function zeichneVokabel(eintrag) {
    var block = el("article", "lern-eintrag");
    var kopf = el("div", "lern-kopf");
    kopf.appendChild(el("h4", "lern-titel", "statt „" + (eintrag.einfach || "") + "“"));
    block.appendChild(kopf);

    var liste = el("ul", "vokabeln");
    (eintrag.alternativen || []).forEach(function (alternative) {
      var zeile = document.createElement("li");
      zeile.appendChild(el("span", "vokabel-wort", alternative.wort || ""));
      zeile.appendChild(el("span", "vokabel-bedeutung", alternative.bedeutung || ""));
      if (alternative.beispiel) {
        zeile.appendChild(el("span", "vokabel-beispiel", alternative.beispiel));
      }
      liste.appendChild(zeile);
    });
    block.appendChild(liste);

    if (eintrag.tipp) block.appendChild(el("p", "lern-tipp", eintrag.tipp));
    return block;
  }

  function tickClock() {
    clockEl.textContent = timeFmt.format(new Date());
  }

  function loadAll() {
    load();
    loadWeather();
    loadMarkets();
  }

  reloadBtn.addEventListener("click", loadAll);

  // Wenn das iPad aus dem Standby kommt: frische Daten holen.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) loadAll();
  });

  lernModul(knowledgeEl, knowledgeNextBtn, KNOWLEDGE_URL, zeichneWissen);
  lernModul(vocabEl, vocabNextBtn, VOCAB_URL, zeichneVokabel);

  tickClock();
  setInterval(tickClock, 30 * 1000);
  setInterval(loadAll, 15 * 60 * 1000);
  loadAll();
})();
