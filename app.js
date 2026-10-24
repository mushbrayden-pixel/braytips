```javascript
(() => {
  "use strict";

  // ============================================================
  // BRAYTIPS CONFIGURATION
  // ============================================================

  const CONFIG = {
    apiBase: "https://braytips-api.mushbrayden.workers.dev",
    timezone: "Africa/Nairobi",
    refreshIntervalMs: 5 * 60 * 1000
  };

  // ============================================================
  // APPLICATION STATE
  // ============================================================

  const state = {
    matches: [],
    predictions: [],
    overUnder: [],
    history: [],
    slips: [],
    lastUpdated: null,
    loading: false,
    error: null
  };

  let refreshTimer = null;

  // ============================================================
  // GENERAL HELPERS
  // ============================================================

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function formatKenyaDate(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-KE", {
      timeZone: CONFIG.timezone,
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function formatKenyaDateTime(value) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Not available";
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

  function formatKenyaTime(value) {
    if (!value) return "Time unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Time unavailable";
    }

    return new Intl.DateTimeFormat("en-KE", {
      timeZone: CONFIG.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(date);
  }

  function updateDates() {
    const now = new Date();
    const formatted = formatKenyaDate(now);

    ["header-date", "dashboard-date"].forEach(id => {
      const element = getElement(id);

      if (element) {
        element.textContent = formatted;
      }
    });
  }

  function formatOdds(value) {
    const odds = Number(value);

    return Number.isFinite(odds) && odds > 1
      ? odds.toFixed(2)
      : "—";
  }

  function formatProbability(value) {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    const probability = Number(value);

    if (!Number.isFinite(probability)) {
      return "—";
    }

    // Accept either a decimal probability (0.65) or percentage (65).
    const percentage =
      probability > 0 && probability <= 1
        ? probability * 100
        : probability;

    if (percentage < 0 || percentage > 100) {
      return "—";
    }

    return String(percentage.toFixed(1)) + "%";
  }

  function getResultClass(result) {
    const value = String(result || "").toLowerCase();

    if (["won", "win", "correct"].includes(value)) {
      return "result-won";
    }

    if (["lost", "loss", "incorrect"].includes(value)) {
      return "result-lost";
    }

    if (["void", "refunded", "push"].includes(value)) {
      return "result-void";
    }

    return "result-pending";
  }

  function getStatusLabel(status) {
    const value = String(status || "").toLowerCase();

    const labels = {
      upcoming: "Upcoming",
      pending: "Pending",
      scheduled: "Scheduled",
      ns: "Upcoming",
      live: "Live",
      "in progress": "Live",
      finished: "Finished",
      complete: "Finished",
      completed: "Finished",
      ft: "Finished",
      won: "Won",
      win: "Won",
      lost: "Lost",
      loss: "Lost",
      void: "Void",
      postponed: "Postponed",
      cancelled: "Cancelled",
      canceled: "Cancelled"
    };

    return labels[value] || (status ? String(status) : "Pending");
  }

  function showEmptyRow(elementId, columnCount, message) {
    const element = getElement(elementId);

    if (!element) return;

    element.innerHTML = `
      <tr>
        <td colspan="${columnCount}">
          ${escapeHTML(message)}
        </td>
      </tr>
    `;
  }

  // ============================================================
  // CONNECTION NOTICE
  // ============================================================

  function setConnectionNotice(type, title, message) {
    const notice = getElement("connection-notice");
    const titleElement = getElement("connection-notice-title");
    const messageElement = getElement("connection-notice-message");

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
  // NORMALIZE DATABASE MATCHES
  // ============================================================

  function normalizeMatch(record) {
    return {
      id: record.id,
      providerMatchId:
        record.provider_match_id ??
        record.providerMatchId ??
        null,

      homeTeam:
        record.home_team ??
        record.homeTeam ??
        "Home team",

      awayTeam:
        record.away_team ??
        record.awayTeam ??
        "Away team",

      competition:
        record.league_name ??
        record.competition ??
        record.leagueName ??
        "Competition unavailable",

      country: record.country ?? "",

      kickoff:
        record.kickoff_at ??
        record.kickoffAt ??
        record.date ??
        null,

      status:
        record.match_status ??
        record.status ??
        "upcoming",

      homePosition: record.home_position ?? null,
      awayPosition: record.away_position ?? null,
      homeForm: record.home_form ?? null,
      awayForm: record.away_form ?? null,
      homeXg: record.home_xg ?? null,
      awayXg: record.away_xg ?? null,
      homeGoals: record.home_goals ?? null,
      awayGoals: record.away_goals ?? null
    };
  }

  // ============================================================
  // NAVIGATION
  // ============================================================

  function setupNavigation() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener("click", event => {
        const targetId = link.getAttribute("href");

        if (!targetId || targetId === "#") return;

        const target = document.querySelector(targetId);

        if (!target) return;

        event.preventDefault();

        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        document.querySelectorAll('a[href^="#"]').forEach(item => {
          item.classList.remove("active");
        });

        link.classList.add("active");
      });
    });
  }

  // ============================================================
  // FIXTURE DISPLAY
  // ============================================================

  function renderFixtures() {
    const table = getElement("predictions-table");

    if (!table) return;

    /*
     * The existing Prediction Board table is reused to avoid
     * changing the original HTML or CSS.
     *
     * Actual fixtures are shown with "Fixture only" labels.
     * No betting selection, odds, or probability is invented.
     */

    if (!state.matches.length) {
      showEmptyRow(
        "predictions-table",
        7,
        "No fixtures are currently available from the data service."
      );

      return;
    }

    const sortedMatches = [...state.matches].sort((a, b) => {
      const dateA = a.kickoff ? new Date(a.kickoff).getTime() : Infinity;
      const dateB = b.kickoff ? new Date(b.kickoff).getTime() : Infinity;

      return dateA - dateB;
    });

    table.innerHTML = sortedMatches.map(match => {
      const home = escapeHTML(match.homeTeam);
      const away = escapeHTML(match.awayTeam);
      const competition = escapeHTML(
        match.country
          ? `${match.competition} · ${match.country}`
          : match.competition
      );

      const kickoff = escapeHTML(formatKenyaDateTime(match.kickoff));
      const status = escapeHTML(getStatusLabel(match.status));

      return `
        <tr>
          <td>
            <strong>${home} vs ${away}</strong>
            <br>
            <small>${kickoff} EAT</small>
          </td>

          <td>${competition}</td>

          <td>
            <span class="result-pending">
              Fixture only
            </span>
          </td>

          <td>—</td>

          <td>—</td>

          <td>
            <span>
              Verified prediction not available yet.
            </span>
          </td>

          <td>
            <span class="result-pending">
              ${status}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  }

  // ============================================================
  // PREDICTIONS
  // ============================================================

  function renderPredictions() {
    /*
     * Until the backend supplies actual predictions, display the
     * available fixtures without presenting them as betting tips.
     *
     * If verified predictions are later supplied, they can be
     * rendered here separately.
     */

    renderFixtures();
  }

  // ============================================================
  // OVER/UNDER MARKETS
  // ============================================================

  function renderOverUnder() {
    const table = getElement("over-under-table");

    if (!table) return;

    if (!state.overUnder.length) {
      showEmptyRow(
        "over-under-table",
        5,
        "No verified Over/Under markets are available yet."
      );

      return;
    }

    table.innerHTML = state.overUnder.map(record => {
      const home = record.homeTeam ?? record.home_team ?? "Home team";
      const away = record.awayTeam ?? record.away_team ?? "Away team";

      const market = record.market ?? record.selection ?? "Market unavailable";
      const odds = formatOdds(record.odds);
      const probability = formatProbability(record.probability);

      return `
        <tr>
          <td>${escapeHTML(home)} vs ${escapeHTML(away)}</td>
          <td>${escapeHTML(market)}</td>
          <td>${escapeHTML(odds)}</td>
          <td>${escapeHTML(probability)}</td>
          <td>
            ${escapeHTML(
              record.reason ??
              record.analysis ??
              "No supporting analysis available."
            )}
          </td>
        </tr>
      `;
    }).join("");
  }

  // ============================================================
  // PERFORMANCE OVERVIEW
  // ============================================================

  function calculatePerformance() {
    const settled = state.history.filter(record => {
      const result = String(record.result ?? "").toLowerCase();

      return [
        "won",
        "win",
        "lost",
        "loss",
        "void",
        "refunded",
        "push"
      ].includes(result);
    });

    const wins = settled.filter(record => {
      const result = String(record.result ?? "").toLowerCase();

      return ["won", "win"].includes(result);
    }).length;

    const losses = settled.filter(record => {
      const result = String(record.result ?? "").toLowerCase();

      return ["lost", "loss"].includes(result);
    }).length;

    const decided = wins + losses;

    const accuracy = decided
      ? (wins / decided) * 100
      : null;

    return {
      settled: settled.length,
      wins,
      losses,
      accuracy
    };
  }

  function renderPerformance() {
    const performance = calculatePerformance();

    const elements = {
      "settled-count": performance.settled,
      "won-count": performance.wins,
      "lost-count": performance.losses,
      "accuracy-count":
        performance.accuracy === null
          ? "—"
          : `${performance.accuracy.toFixed(1)}%`
    };

    Object.entries(elements).forEach(([id, value]) => {
      const element = getElement(id);

      if (element) {
        element.textContent = String(value);
      }
    });
  }

  // ============================================================
  // PREVIOUS DAYS / HISTORY
  // ============================================================

  function getPreviousDateKeys() {
    const today = new Date();

    const dateKeys = [];

    for (let offset = 1; offset <= 2; offset++) {
      const date = new Date(today);

      date.setDate(date.getDate() - offset);

      dateKeys.push(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: CONFIG.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(date)
      );
    }

    return dateKeys;
  }

  function getNairobiDateKey(value) {
    if (!value) return null;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: CONFIG.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const partsMap = {};

    parts.forEach(part => {
      partsMap[part.type] = part.value;
    });

    return `${partsMap.year}-${partsMap.month}-${partsMap.day}`;
  }

  function renderHistory() {
    const table = getElement("history-table");

    if (!table) return;

    if (!state.history.length) {
      showEmptyRow(
        "history-table",
        5,
        "No settled prediction history is available yet."
      );

      return;
    }

    const previousDates = getPreviousDateKeys();

    const history = state.history.filter(record => {
      const date = record.date ?? record.kickoff_at ?? record.created_at;
      const dateKey = getNairobiDateKey(date);

      return dateKey && previousDates.includes(dateKey);
    });

    if (!history.length) {
      showEmptyRow(
        "history-table",
        5,
        "No settled records are available for the previous two days."
      );

      return;
    }

    table.innerHTML = history.map(record => {
      const date = record.date ?? record.kickoff_at ?? record.created_at;

      const home = record.homeTeam ?? record.home_team ?? "Home team";
      const away = record.awayTeam ?? record.away_team ?? "Away team";

      const selection = record.selection ?? record.market ?? "—";
      const odds = formatOdds(record.odds);

      const result = getStatusLabel(record.result ?? record.status);

      return `
        <tr>
          <td>${escapeHTML(formatKenyaDateTime(date))}</td>
          <td>${escapeHTML(home)} vs ${escapeHTML(away)}</td>
          <td>${escapeHTML(selection)}</td>
          <td>${escapeHTML(odds)}</td>
          <td>
            <span class="${escapeHTML(getResultClass(record.result))}">
              ${escapeHTML(result)}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  }

  // ============================================================
  // BACKEND DATA
  // ============================================================

  async function fetchBackendData() {
    if (state.loading) return;

    state.loading = true;
    state.error = null;

    setConnectionNotice(
      "loading",
      "Connecting to football data...",
      "Checking the connection to the BrayTips data service."
    );

    try {
      const response = await fetch(
        `${CONFIG.apiBase.replace(/\/+$/, "")}/api/dashboard`,
        {
          method: "GET",
          headers: {
            Accept: "application/json"
          },
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(
          `The data service returned HTTP ${response.status}.`
        );
      }

      const data = await response.json();

      if (data.success === false) {
        throw new Error(
          data.error || "The data service reported an error."
        );
      }

      state.matches = Array.isArray(data.matches)
        ? data.matches.map(normalizeMatch)
        : [];

      state.predictions = Array.isArray(data.predictions)
        ? data.predictions
        : [];

      state.overUnder = Array.isArray(data.overUnder)
        ? data.overUnder
        : Array.isArray(data.over_under)
          ? data.over_under
          : [];

      state.history = Array.isArray(data.history)
        ? data.history
        : Array.isArray(data.results)
          ? data.results
          : [];

      state.slips = Array.isArray(data.slips)
        ? data.slips
        : [];

      state.lastUpdated =
        data.generatedAt ??
        data.lastUpdated ??
        new Date().toISOString();

      renderPredictions();
      renderOverUnder();
      renderPerformance();
      renderHistory();

      const matchCount = state.matches.length;

      if (matchCount > 0) {
        setConnectionNotice(
          "connected",
          "Football data connected",
          `${matchCount} fixture${matchCount === 1 ? "" : "s"} loaded successfully. Verified predictions and betting odds will only appear when supplied by the data service.`
        );
      } else {
        setConnectionNotice(
          "connected",
          "Football data connected",
          "The data service is responding, but no fixtures are currently available."
        );
      }

      console.info("BrayTips backend connected.", {
        fixtures: state.matches.length,
        predictions: state.predictions.length,
        overUnderMarkets: state.overUnder.length,
        historyRecords: state.history.length,
        slips: state.slips.length,
        generatedAt: state.lastUpdated
      });

    } catch (error) {
      state.error = error instanceof Error
        ? error.message
        : "An unexpected connection error occurred.";

      console.error("BrayTips backend error:", state.error);

      setConnectionNotice(
        "error",
        "Unable to load football data",
        `${state.error} Please try again shortly.`
      );

      if (!state.matches.length) {
        showEmptyRow(
          "predictions-table",
          7,
          "Fixtures could not be loaded. Check your connection and try again."
        );
      }

      if (!state.overUnder.length) {
        showEmptyRow(
          "over-under-table",
          5,
          "Over/Under markets could not be loaded."
        );
      }

    } finally {
      state.loading = false;
    }
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  function initialize() {
    updateDates();
    setupNavigation();

    renderPredictions();
    renderOverUnder();
    renderPerformance();
    renderHistory();

    updateDates();

    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    refreshTimer = setInterval(() => {
      updateDates();
      fetchBackendData();
    }, CONFIG.refreshIntervalMs);

    fetchBackendData();

    console.info("BrayTips initialized.", {
      backend: CONFIG.apiBase,
      timezone: CONFIG.timezone
    });
  }

  // ============================================================
  // PUBLIC API FOR DEBUGGING
  // ============================================================

  window.BrayTips = {
    formatKenyaDate,
    formatKenyaDateTime,
    formatKenyaTime,
    formatOdds,
    formatProbability,
    fetchBackendData,
    getState: () => ({
      ...state,
      matches: [...state.matches],
      predictions: [...state.predictions],
      overUnder: [...state.overUnder],
      history: [...state.history],
      slips: [...state.slips]
    })
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
```
