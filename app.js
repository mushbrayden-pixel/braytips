(function () {
  "use strict";

  // ============================================================
  // BRAYTIPS CONFIGURATION
  // ============================================================

  var CONFIG = {
    apiBase: "https://braytips-api.mushbrayden.workers.dev",
    timezone: "Africa/Nairobi",
    refreshIntervalMs: 300000
  };

  var state = {
    matches: [],
    predictions: [],
    slips: [],
    lastUpdated: null,
    connectionError: false
  };

  // ============================================================
  // BASIC HELPERS
  // ============================================================

  function getElement(id) {
    return document.getElementById(id);
  }

  function escapeHTML(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setText(id, value) {
    var element = getElement(id);

    if (element) {
      element.textContent = value;
    }
  }

  function formatDate(value) {
    if (!value) {
      return "Date unavailable";
    }

    var date = new Date(value);

    if (isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-KE", {
      timeZone: CONFIG.timezone,
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) {
      return "Time unavailable";
    }

    var date = new Date(value);

    if (isNaN(date.getTime())) {
      return "Time unavailable";
    }

    return new Intl.DateTimeFormat("en-KE", {
      timeZone: CONFIG.timezone,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(date);
  }

  function formatOdds(value) {
    var number = Number(value);

    if (value === null || value === undefined ||
        value === "" || !isFinite(number) || number <= 1) {
      return "—";
    }

    return number.toFixed(2);
  }

  function formatProbability(value) {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    var number = Number(value);

    if (!isFinite(number)) {
      return "—";
    }

    if (number >= 0 && number <= 1) {
      number = number * 100;
    }

    if (number < 0 || number > 100) {
      return "—";
    }

    return String(number.toFixed(1)) + "%";
  }

  function getMatchDate(match) {
    return match.kickoff_at ||
      match.kickoff ||
      match.fixture_date ||
      match.match_date ||
      match.date ||
      null;
  }

  function getHomeTeam(match) {
    return match.home_team ||
      match.homeTeam ||
      match.home ||
      "Home team";
  }

  function getAwayTeam(match) {
    return match.away_team ||
      match.awayTeam ||
      match.away ||
      "Away team";
  }

  function getLeague(match) {
    return match.league_name ||
      match.league ||
      match.competition ||
      "Competition unavailable";
  }

  function getMatchName(match) {
    return getHomeTeam(match) + " vs " + getAwayTeam(match);
  }

  function getStatusLabel(status) {
    var value = String(status || "").toLowerCase();

    var labels = {
      won: "Won",
      win: "Won",
      lost: "Lost",
      loss: "Lost",
      pending: "Pending",
      upcoming: "Upcoming",
      settled: "Settled",
      correct: "Won",
      incorrect: "Lost",
      live: "Live",
      ns: "Upcoming",
      ft: "Finished"
    };

    return labels[value] || (status ? String(status) : "Pending");
  }

  function getResultClass(result) {
    var value = String(result || "").toLowerCase();

    if (["won", "win", "correct"].indexOf(value) !== -1) {
      return "won";
    }

    if (["lost", "loss", "incorrect"].indexOf(value) !== -1) {
      return "lost";
    }

    return "pending";
  }

  function showEmptyRow(elementId, columnCount, message) {
    var element = getElement(elementId);

    if (!element) {
      return;
    }

    var cells = '<tr><td colspan="' + columnCount + '">' +
      escapeHTML(message) +
      "</td></tr>";

    element.innerHTML = cells;
  }

  // ============================================================
  // CONNECTION NOTICE
  // ============================================================

  function setConnectionNotice(type, title, message) {
    var notice = getElement("connection-notice");
    var titleElement = getElement("connection-notice-title");
    var messageElement = getElement("connection-notice-message");

    if (titleElement) {
      titleElement.textContent = title;
    }

    if (messageElement) {
      messageElement.textContent = message;
    }

    if (notice) {
      notice.dataset.status = type;
      notice.setAttribute("aria-live", "polite");
    }
  }

  // ============================================================
  // HEADER DATES
  // ============================================================

  function updateDates() {
    var now = new Date();

    var dateText = new Intl.DateTimeFormat("en-KE", {
      timeZone: CONFIG.timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(now);

    setText("header-date", dateText);
    setText("dashboard-date", dateText);
  }

  // ============================================================
  // PREDICTION BOARD
  // ============================================================

  function renderPredictions() {
    var table = getElement("predictions-table");

    if (!table) {
      return;
    }

    var rows = [];
    var predictions = state.predictions;
    var matches = state.matches;

    if (predictions.length > 0) {
      predictions.forEach(function (prediction) {
        var home = getHomeTeam(prediction);
        var away = getAwayTeam(prediction);
        var matchName = prediction.home_team || prediction.away_team
          ? getMatchName(prediction)
          : prediction.fixture || prediction.match_name ||
            prediction.match || "Match";

        var league = getLeague(prediction);
        var selection = prediction.selection ||
          prediction.prediction ||
          prediction.pick ||
          prediction.market ||
          "Selection unavailable";

        var odds = prediction.odds ||
          prediction.decimal_odds ||
          prediction.bookmaker_odds;

        var probability = prediction.probability;
        if (probability === undefined) {
          probability = prediction.confidence;
        }

        var status = getStatusLabel(
          prediction.status || prediction.result || "Pending"
        );

        var analysis = prediction.analysis ||
          prediction.reason ||
          prediction.explanation ||
          "—";

        rows.push(
          "<tr>" +
            "<td>" + escapeHTML(matchName) + "</td>" +
            "<td>" + escapeHTML(league) + "</td>" +
            "<td>" + escapeHTML(selection) + "</td>" +
            "<td>" + escapeHTML(formatOdds(odds)) + "</td>" +
            "<td>" + escapeHTML(formatProbability(probability)) + "</td>" +
            "<td>" + escapeHTML(analysis) + "</td>" +
            '<td><span class="status ' +
              escapeHTML(getResultClass(status)) + '">' +
              escapeHTML(status) +
            "</span></td>" +
          "</tr>"
        );
      });
    } else if (matches.length > 0) {
      matches.forEach(function (match) {
        rows.push(
          "<tr>" +
            "<td>" + escapeHTML(getMatchName(match)) + "</td>" +
            "<td>" + escapeHTML(getLeague(match)) + "</td>" +
            "<td>Fixture only</td>" +
            "<td>—</td>" +
            "<td>—</td>" +
            "<td>Analysis not available</td>" +
            '<td><span class="status pending">Upcoming</span></td>' +
          "</tr>"
        );
      });
    }

    if (rows.length === 0) {
      showEmptyRow(
        "predictions-table",
        7,
        "No fixtures or published predictions are available yet."
      );
      return;
    }

    table.innerHTML = rows.join("");
  }

  // ============================================================
  // OVER / UNDER TABLE
  // ============================================================

  function renderOverUnder() {
    var table = getElement("over-under-table");

    if (!table) {
      return;
    }

    var matches = state.matches;

    if (!matches.length) {
      showEmptyRow(
        "over-under-table",
        5,
        "No fixtures available for over/under analysis."
      );
      return;
    }

    var rows = [];

    matches.forEach(function (match) {
      var date = getMatchDate(match);

      rows.push(
        "<tr>" +
          "<td>" + escapeHTML(getMatchName(match)) + "</td>" +
          "<td>" + escapeHTML(getLeague(match)) + "</td>" +
          "<td>" + escapeHTML(formatDateTime(date)) + "</td>" +
          "<td>—</td>" +
          "<td>Not analysed</td>" +
        "</tr>"
      );
    });

    table.innerHTML = rows.join("");
  }

  // ============================================================
  // PERFORMANCE SUMMARY
  // ============================================================

  function renderPerformance() {
    var settled = 0;
    var won = 0;
    var lost = 0;

    state.predictions.forEach(function (prediction) {
      var result = String(
        prediction.result || prediction.status || ""
      ).toLowerCase();

      if (["won", "win", "correct"].indexOf(result) !== -1) {
        won++;
        settled++;
      } else if (["lost", "loss", "incorrect"].indexOf(result) !== -1) {
        lost++;
        settled++;
      }
    });

    state.slips.forEach(function (slip) {
      var result = String(
        slip.result || slip.status || ""
      ).toLowerCase();

      if (["won", "win", "correct"].indexOf(result) !== -1) {
        won++;
        settled++;
      } else if (["lost", "loss", "incorrect"].indexOf(result) !== -1) {
        lost++;
        settled++;
      }
    });

    var accuracy = settled > 0
      ? String(Math.round((won / settled) * 100)) + "%"
      : "—";

    setText("settled-count", String(settled));
    setText("won-count", String(won));
    setText("lost-count", String(lost));
    setText("accuracy-count", accuracy);
  }

  // ============================================================
  // HISTORY TABLE
  // ============================================================

  function renderHistory() {
    var table = getElement("history-table");

    if (!table) {
      return;
    }

    var history = [];

    state.predictions.forEach(function (prediction) {
      var result = String(
        prediction.result || prediction.status || ""
      ).toLowerCase();

      if (["won", "win", "correct", "lost", "loss", "incorrect"]
          .indexOf(result) !== -1) {
        history.push(prediction);
      }
    });

    if (!history.length) {
      showEmptyRow(
        "history-table",
        5,
        "No settled prediction history is available yet."
      );
      return;
    }

    var rows = [];

    history.forEach(function (item) {
      var matchName = item.home_team || item.away_team
        ? getMatchName(item)
        : item.fixture || item.match_name || item.match || "Match";

      var result = item.result || item.status || "Settled";

      rows.push(
        "<tr>" +
          "<td>" + escapeHTML(matchName) + "</td>" +
          "<td>" + escapeHTML(getLeague(item)) + "</td>" +
          "<td>" + escapeHTML(item.selection || item.prediction || "—") +
          "</td>" +
          "<td>" + escapeHTML(formatOdds(item.odds)) + "</td>" +
          "<td><span class=\"status " +
            escapeHTML(getResultClass(result)) + "\">" +
            escapeHTML(getStatusLabel(result)) +
          "</span></td>" +
        "</tr>"
      );
    });

    table.innerHTML = rows.join("");
  }

  // ============================================================
  // ODDS SLIPS
  // ============================================================

  function renderSlips() {
    var container = getElement("odds-slips");

    if (!container) {
      return;
    }

    if (!state.slips.length) {
      return;
    }

    var rows = [];

    state.slips.forEach(function (slip) {
      var selections = Array.isArray(slip.selections)
        ? slip.selections
        : [];

      var selectionNames = selections.map(function (selection) {
        return selection.selection ||
          selection.prediction ||
          selection.match_name ||
          selection.match ||
          "Selection";
      });

      var odds = slip.combined_odds ||
        slip.total_odds ||
        slip.odds;

      rows.push(
        '<article class="slip-card">' +
          "<h3>" + escapeHTML(slip.name || "Prediction slip") + "</h3>" +
          "<p>Combined odds: " + escapeHTML(formatOdds(odds)) + "</p>" +
          "<p>" + escapeHTML(
            selectionNames.length
              ? selectionNames.join(", ")
              : "Selections unavailable"
          ) + "</p>" +
        "</article>"
      );
    });

    container.innerHTML = rows.join("");
  }

  // ============================================================
  // NAVIGATION
  // ============================================================

  function setupNavigation() {
    var links = document.querySelectorAll(
      "[data-section], .nav-link, .sidebar a"
    );

    links.forEach(function (link) {
      link.addEventListener("click", function (event) {
        var target = link.getAttribute("data-section");

        if (!target) {
          var href = link.getAttribute("href");

          if (href && href.charAt(0) === "#") {
            target = href.substring(1);
          }
        }

        if (!target) {
          return;
        }

        var section = getElement(target);

        if (section) {
          event.preventDefault();

          section.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      });
    });
  }

  // ============================================================
  // RENDER DASHBOARD
  // ============================================================

  function renderDashboard() {
    renderPredictions();
    renderOverUnder();
    renderPerformance();
    renderHistory();
    renderSlips();
  }

  // ============================================================
  // CONNECT TO CLOUDFLARE WORKER
  // ============================================================

  function fetchBackendData() {
    setConnectionNotice(
      "loading",
      "Connecting to football data...",
      "Checking the connection to the BrayTips data service."
    );

    return fetch(CONFIG.apiBase + "/api/dashboard", {
      method: "GET",
      headers: {
        "Accept": "application/json"
      },
      cache: "no-store"
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Dashboard request failed: HTTP " +
            response.status);
        }

        return response.json();
      })
      .then(function (data) {
        if (!data || data.success === false) {
          throw new Error(
            data && data.error
              ? data.error
              : "The dashboard returned an invalid response."
          );
        }

        state.matches = Array.isArray(data.matches)
          ? data.matches
          : [];

        state.predictions = Array.isArray(data.predictions)
          ? data.predictions
          : [];

        state.slips = Array.isArray(data.slips)
          ? data.slips
          : [];

        state.lastUpdated = data.lastUpdated ||
          data.generatedAt ||
          new Date().toISOString();

        state.connectionError = false;

        renderDashboard();

        if (state.matches.length > 0 ||
            state.predictions.length > 0 ||
            state.slips.length > 0) {
          setConnectionNotice(
            "success",
            "Connected to BrayTips data",
            state.matches.length + " fixtures loaded. " +
            state.predictions.length +
            " published predictions available."
          );
        } else {
          setConnectionNotice(
            "success",
            "Connected to BrayTips data",
            "The connection works, but no fixtures or predictions " +
            "are currently available."
          );
        }

        return data;
      })
      .catch(function (error) {
        state.connectionError = true;

        console.error("BrayTips dashboard connection failed:", error);

        setConnectionNotice(
          "error",
          "Unable to load football data",
          "Check the connection and try refreshing the page."
        );

        if (!state.matches.length && !state.predictions.length) {
          showEmptyRow(
            "predictions-table",
            7,
            "Unable to load fixtures. Please try refreshing the page."
          );

          showEmptyRow(
            "over-under-table",
            5,
            "Football data is temporarily unavailable."
          );
        }
      });
  }

  // ============================================================
  // START APPLICATION
  // ============================================================

  function initialize() {
    updateDates();
    setupNavigation();

    showEmptyRow(
      "predictions-table",
      7,
      "Loading fixtures and predictions..."
    );

    showEmptyRow(
      "over-under-table",
      5,
      "Loading football data..."
    );

    renderPerformance();

    fetchBackendData();

    window.setInterval(function () {
      fetchBackendData();
    }, CONFIG.refreshIntervalMs);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
