```javascript
"use strict";

const BRAYTIPS_CONFIG = {
  apiBase: "https://braytips-api.mushbrayden.workers.dev",
  timezone: "Africa/Nairobi",
  refreshInterval: 5 * 60 * 1000
};

const dashboardState = {
  matches: [],
  predictions: [],
  slips: [],
  history: [],
  lastUpdated: null
};

const $ = (selector) => document.querySelector(selector);

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatDateTime(value) {
  if (!value) return "Time unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-KE", {
    timeZone: BRAYTIPS_CONFIG.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function formatOdds(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

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

  if (!Number.isFinite(probability)) return "—";

  const percentage =
    probability >= 0 && probability <= 1
      ? probability * 100
      : probability;

  return percentage >= 0 && percentage <= 100
    ? `${percentage.toFixed(1)}%`
    : "—";
}

function normalizeResult(value) {
  const result = String(value || "pending").toLowerCase();

  if (["won", "win"].includes(result)) return "won";
  if (["lost", "loss"].includes(result)) return "lost";
  if (result === "void") return "void";

  return "pending";
}

function resultBadge(value) {
  const result = normalizeResult(value);
  const labels = {
    won: "Won",
    lost: "Lost",
    void: "Void",
    pending: "Pending"
  };

  return `<span class="result-badge result-${result}">
    ${labels[result]}
  </span>`;
}

function updateConnection(message, status = "") {
  const element = $("#connection-status");

  if (!element) return;

  element.textContent = message;
  element.className = `connection-badge ${status}`.trim();
}

function getKenyaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAYTIPS_CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = {};

  parts.forEach((part) => {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
}

function getPreviousDateKeys(count = 2) {
  const today = getKenyaDateKey();
  const [year, month, day] = today.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  const dates = [];

  for (let i = 1; i <= count; i++) {
    const date = new Date(base);
    date.setUTCDate(date.getUTCDate() - i);
    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}

function updateDateDisplay() {
  const formatted = new Intl.DateTimeFormat("en-KE", {
    timeZone: BRAYTIPS_CONFIG.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());

  const element = $("#current-date");

  if (element) element.textContent = formatted;
}

function renderFixtures() {
  const container = $("#fixtures-list");
  const count = $("#fixtures-count");
  const note = $("#fixtures-note");

  if (!container) return;

  const fixtures = [...dashboardState.matches].sort((a, b) =>
    String(a.kickoff_at || "").localeCompare(
      String(b.kickoff_at || "")
    )
  );

  if (count) count.textContent = String(fixtures.length);

  if (note) {
    note.textContent = `${fixtures.length} fixtures in database`;
  }

  if (!fixtures.length) {
    container.innerHTML = `
      <div class="empty-card">
        <strong>No fixtures loaded</strong>
        <p>
          The database currently contains no fixtures. Run your
          existing fixture import process before expecting matches here.
        </p>
      </div>`;
    return;
  }

  container.innerHTML = fixtures.slice(0, 18).map((match) => {
    const status = String(match.match_status || "upcoming").toLowerCase();

    const statusLabels = {
      upcoming: "Upcoming",
      live: "Live",
      finished: "Finished",
      postponed: "Postponed",
      cancelled: "Cancelled"
    };

    const hasScore =
      match.home_goals !== null &&
      match.home_goals !== undefined &&
      match.away_goals !== null &&
      match.away_goals !== undefined;

    const scoreHTML = hasScore
      ? `<div class="fixture-time">
           Score: ${safeText(match.home_goals)} – ${safeText(match.away_goals)}
         </div>`
      : "";

    return `
      <article class="fixture-card">
        <div class="fixture-league">
          ${safeText(match.league_name || "Competition")}
          ${match.country ? ` · ${safeText(match.country)}` : ""}
        </div>

        <div class="fixture-teams">
          ${safeText(match.home_team || "Home")}
          <span>vs</span>
          ${safeText(match.away_team || "Away")}
        </div>

        <div class="fixture-time">
          ${safeText(formatDateTime(match.kickoff_at))}
        </div>

        ${scoreHTML}

        <span class="fixture-status">
          ${safeText(statusLabels[status] || status)}
        </span>
      </article>`;
  }).join("");
}

function renderTeamPicks() {
  const body = $("#team-picks-table");
  const count = $("#predictions-count");

  if (count) {
    count.textContent = String(dashboardState.predictions.length);
  }

  if (!body) return;

  const predictions = dashboardState.predictions.filter(
    (item) => item.category !== "over_under"
  );

  if (!predictions.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          No published team picks are currently available.
          Fixtures alone are not predictions.
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = predictions.map((item) => {
    const match = item.matches || {};

    const home = match.home_team || item.home_team || "—";
    const away = match.away_team || item.away_team || "—";

    return `
      <tr>
        <td class="match-name">
          ${safeText(home)} vs ${safeText(away)}
        </td>

        <td>${safeText(match.league_name || item.league_name || "—")}</td>

        <td>${safeText(item.selection || "—")}</td>

        <td><span class="odds-badge">
          ${formatOdds(item.decimal_odds)}
        </span></td>

        <td>${formatProbability(item.estimated_probability)}</td>

        <td>${safeText(item.reasoning || "—")}</td>

        <td>${resultBadge(item.result)}</td>
      </tr>`;
  }).join("");
}

function renderGoalMarkets() {
  const body = $("#goals-table");

  if (!body) return;

  const predictions = dashboardState.predictions.filter(
    (item) => item.category === "over_under"
  );

  if (!predictions.length) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="empty">
          No saved Over/Under predictions are available yet.
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = predictions.map((item) => {
    const match = item.matches || {};

    return `
      <tr>
        <td class="match-name">
          ${safeText(match.home_team || "—")} vs
          ${safeText(match.away_team || "—")}
        </td>

        <td>${safeText(item.market || item.selection || "—")}</td>

        <td><span class="odds-badge">
          ${formatOdds(item.decimal_odds)}
        </span></td>

        <td>${formatProbability(item.estimated_probability)}</td>

        <td>${safeText(item.reasoning || "—")}</td>
      </tr>`;
  }).join("");
}

function renderSlips() {
  const slipDefinitions = [
    { category: "odds_2", selector: "#slip-2", target: "2.00", title: "Conservative Slip" },
    { category: "odds_5", selector: "#slip-5", target: "5.00", title: "Medium Odds Slip" },
    { category: "odds_10", selector: "#slip-10", target: "10.00", title: "High Odds Slip" }
  ];

  slipDefinitions.forEach((definition) => {
    const container = $(definition.selector);

    if (!container) return;

    const slip = dashboardState.slips.find(
      (item) => item.category === definition.category
    );

    if (!slip) {
      container.innerHTML = `
        <div class="slip-top">
          <strong>${definition.target}</strong>
          <span>TARGET ODDS</span>
        </div>

        <h3>${definition.title}</h3>

        <p>
          No published slip is available. This section will update
          when a slip is saved in the database.
        </p>`;
      return;
    }

    container.innerHTML = `
      <div class="slip-top">
        <strong>${definition.target}</strong>
        <span>TARGET ODDS</span>
      </div>

      <h3>${definition.title}</h3>

      <p>
        Combined odds:
        <strong>${formatOdds(slip.combined_odds)}</strong>
      </p>

      <p>
        Date: ${safeText(String(slip.slip_date || "—").slice(0, 10))}
      </p>

      <p>${safeText(slip.reasoning || "Published slip")}</p>

      ${resultBadge(slip.status)}`;
  });
}

function calculatePerformance(records) {
  const settled = records.filter((item) =>
    ["won", "lost"].includes(normalizeResult(item.result))
  );

  const won = settled.filter(
    (item) => normalizeResult(item.result) === "won"
  ).length;

  const lost = settled.length - won;

  return {
    won,
    lost,
    settled: settled.length,
    accuracy: settled.length
      ? Math.round((won / settled.length) * 1000) / 10
      : 0
  };
}

function renderPerformance() {
  const allowedDates = getPreviousDateKeys(2);

  const recentRecords = dashboardState.history.filter((item) => {
    const date = String(
      item.date ||
      item.prediction_date ||
      item.slip_date ||
      ""
    ).slice(0, 10);

    return allowedDates.includes(date);
  });

  const performance = calculatePerformance(recentRecords);

  if ($("#won-count")) {
    $("#won-count").textContent = String(performance.won);
  }

  if ($("#lost-count")) {
    $("#lost-count").textContent = String(performance.lost);
  }

  if ($("#settled-count")) {
    $("#settled-count").textContent = String(performance.settled);
  }

  if ($("#recent-settled-count")) {
    $("#recent-settled-count").textContent = String(performance.settled);
  }

  if ($("#accuracy-count")) {
    $("#accuracy-count").textContent = `${performance.accuracy}%`;
  }

  if ($("#last-updated")) {
    $("#last-updated").textContent = dashboardState.lastUpdated
      ? formatDateTime(dashboardState.lastUpdated)
      : "—";
  }

  const body = $("#history-table");

  if (!body) return;

  if (!recentRecords.length) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="empty">
          No prediction results were recorded during the previous
          two days. Pending predictions are not counted as wins or losses.
        </td>
      </tr>`;
    return;
  }

  recentRecords.sort((a, b) => {
    const dateA = String(a.date || a.prediction_date || a.slip_date || "");
    const dateB = String(b.date || b.prediction_date || b.slip_date || "");
    return dateB.localeCompare(dateA);
  });

  body.innerHTML = recentRecords.map((item) => {
    const date = String(
      item.date ||
      item.prediction_date ||
      item.slip_date ||
      "—"
    ).slice(0, 10);

    const match = item.matches || {};

    const matchName =
      item.home_team && item.away_team
        ? `${item.home_team} vs ${item.away_team}`
        : match.home_team && match.away_team
          ? `${match.home_team} vs ${match.away_team}`
          : item.category && item.category.startsWith("odds_")
            ? `${item.category.replace("odds_", "")}.00 odds slip`
            : "—";

    return `
      <tr>
        <td>${safeText(date)}</td>
        <td>${safeText(matchName)}</td>
        <td>${safeText(item.selection || item.category || "—")}</td>
        <td>${formatOdds(item.decimal_odds ?? item.combined_odds)}</td>
        <td>${resultBadge(item.result || item.status)}</td>
      </tr>`;
  }).join("");
}

async function loadDashboard() {
  updateConnection("Connecting to BrayTips...");

  try {
    const response = await fetch(
      `${BRAYTIPS_CONFIG.apiBase}/api/dashboard`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(`Dashboard API returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "The dashboard API returned an error.");
    }

    dashboardState.matches = Array.isArray(data.matches)
      ? data.matches
      : [];

    dashboardState.predictions = Array.isArray(data.predictions)
      ? data.predictions
      : [];

    dashboardState.slips = Array.isArray(data.slips)
      ? data.slips
      : [];

    dashboardState.history = [
      ...dashboardState.predictions.map((item) => ({
        ...item,
        date: item.prediction_date
      })),
      ...dashboardState.slips.map((item) => ({
        ...item,
        date: item.slip_date,
        result: item.status
      }))
    ];

    dashboardState.lastUpdated =
      data.generatedAt || new Date().toISOString();

    updateConnection("Connected to BrayTips API", "online");

    renderFixtures();
    renderTeamPicks();
    renderGoalMarkets();
    renderSlips();
    renderPerformance();

    console.log("BrayTips dashboard updated", {
      fixtures: dashboardState.matches.length,
      predictions: dashboardState.predictions.length,
      slips: dashboardState.slips.length
    });

  } catch (error) {
    console.error("BrayTips dashboard error:", error);
    updateConnection("Connection error", "error");

    const container = $("#fixtures-list");

    if (container && !dashboardState.matches.length) {
      container.innerHTML = `
        <div class="empty-card">
          <strong>Unable to load dashboard data</strong>
          <p>${safeText(error.message)}</p>
          <p>
            Check that the BrayTips Worker is deployed and its
            /api/dashboard endpoint is working.
          </p>
        </div>`;
    }
  }
}

function setupNavigation() {
  const sidebar = $("#sidebar");
  const toggle = $("#menu-toggle");

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((item) => {
        item.classList.remove("active");
      });

      link.classList.add("active");

      if (sidebar) sidebar.classList.remove("open");
    });
  });

  if (toggle && sidebar) {
    toggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }
}

function initializeBrayTips() {
  updateDateDisplay();
  setupNavigation();
  loadDashboard();

  setInterval(updateDateDisplay, 60 * 1000);
  setInterval(loadDashboard, BRAYTIPS_CONFIG.refreshInterval);
}

window.BrayTips = {
  loadDashboard,
  calculatePerformance,
  getState: () => structuredClone(dashboardState)
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeBrayTips);
} else {
  initializeBrayTips();
}
```
