```javascript
"use strict";

/* ==========================================
   BRAYTIPS CONFIGURATION
   ========================================== */

const CONFIG = {
  apiBase: "https://braytips-api.mushbrayden.workers.dev",
  timezone: "Africa/Nairobi",
  refreshIntervalMs: 5 * 60 * 1000,
  performanceDays: 2
};

const $ = (selector) => document.querySelector(selector);

const state = {
  matches: [],
  predictions: [],
  slips: [],
  lastUpdated: null,
  loading: false
};


/* ==========================================
   GENERAL HELPERS
   ========================================== */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatOdds(value) {
  const odds = Number(value);
  return Number.isFinite(odds) && odds > 1
    ? odds.toFixed(2)
    : "N/A";
}

function formatDate(value, includeTime = false) {
  if (!value) return "Date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  const options = {
    timeZone: CONFIG.timezone,
    day: "numeric",
    month: "short",
    year: "numeric"
  };

  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
    options.hour12 = false;
  }

  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

function todayInNairobi() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function dateKey(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function isToday(value) {
  return dateKey(value) === todayInNairobi();
}

function isWithinRecentDays(value, days = CONFIG.performanceDays) {
  const key = dateKey(value);
  if (!key) return false;

  const today = todayInNairobi();

  const todayDate = new Date(`${today}T00:00:00+03:00`);
  const itemDate = new Date(`${key}T00:00:00+03:00`);

  const difference = Math.round(
    (todayDate.getTime() - itemDate.getTime()) / 86400000
  );

  return difference >= 0 && difference < days;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function setHTML(selector, value) {
  const element = $(selector);
  if (element) element.innerHTML = value;
}

function resultClass(result) {
  const normalized = String(result || "pending").toLowerCase();

  if (normalized === "won") return "result-won";
  if (normalized === "lost") return "result-lost";
  if (normalized === "void") return "result-void";

  return "result-pending";
}

function resultLabel(result) {
  const normalized = String(result || "pending").toLowerCase();

  if (normalized === "won") return "WON";
  if (normalized === "lost") return "LOST";
  if (normalized === "void") return "VOID";

  return "PENDING";
}

function emptyCard(message) {
  return `
    <article class="empty-card">
      <div class="empty">${escapeHTML(message)}</div>
    </article>
  `;
}

function errorMessage(message) {
  return `
    <article class="empty-card">
      <div class="empty">${escapeHTML(message)}</div>
    </article>
  `;
}


/* ==========================================
   CONNECTION STATUS
   ========================================== */

function setConnectionStatus(status, message) {
  const badge = $("#connection-status");
  if (!badge) return;

  badge.classList.remove("online", "error");

  if (status === "online") badge.classList.add("online");
  if (status === "error") badge.classList.add("error");

  badge.textContent = message;
}


/* ==========================================
   FETCH DASHBOARD DATA
   ========================================== */

async function fetchDashboard() {
  if (state.loading) return;

  state.loading = true;

  try {
    setConnectionStatus("loading", "Updating data...");

    const response = await fetch(`${CONFIG.apiBase}/api/dashboard`, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Dashboard request failed (${response.status})`);
    }

    const data = await response.json();

    if (data.success === false || data.error) {
      throw new Error(data.error || "The dashboard returned an error.");
    }

    /*
      Expected response:
      {
        matches: [],
        predictions: [],
        slips: []
      }
    */

    state.matches = Array.isArray(data.matches) ? data.matches : [];
    state.predictions = Array.isArray(data.predictions)
      ? data.predictions
      : [];
    state.slips = Array.isArray(data.slips) ? data.slips : [];

    state.lastUpdated = new Date();

    renderDashboard();

    setConnectionStatus(
      "online",
      `Connected · ${new Intl.DateTimeFormat("en-GB", {
        timeZone: CONFIG.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(state.lastUpdated)}`
    );

  } catch (error) {
    console.error("BrayTips dashboard error:", error);

    setConnectionStatus("error", "Connection error");

    showConnectionErrors(
      "Unable to load dashboard data. Check the API connection and try again."
    );

  } finally {
    state.loading = false;
  }
}


/* ==========================================
   ERROR DISPLAY
   ========================================== */

function showConnectionErrors(message) {
  const containers = [
    "#slips-container",
    "#team-picks-container",
    "#goals-container",
    "#fixtures-container"
  ];

  containers.forEach((selector) => {
    const element = $(selector);
    if (element) element.innerHTML = errorMessage(message);
  });

  setHTML(
    "#performance-table",
    `<tr><td colspan="6" class="empty">${escapeHTML(message)}</td></tr>`
  );
}


/* ==========================================
   MATCH LOOKUP
   ========================================== */

function matchForPrediction(prediction) {
  const matchId = prediction.match_id;

  if (matchId !== undefined && matchId !== null) {
    const match = state.matches.find(
      (item) => String(item.id) === String(matchId)
    );

    if (match) return match;
  }

  return prediction.match || prediction.matches || null;
}

function predictionMatchName(prediction) {
  const match = matchForPrediction(prediction);

  if (match) {
    const home = match.home_team || match.homeTeam || "";
    const away = match.away_team || match.awayTeam || "";

    if (home || away) return `${home} vs ${away}`;
  }

  return prediction.match_name ||
    prediction.fixture_name ||
    prediction.matchName ||
    "Match details unavailable";
}

function predictionKickoff(prediction) {
  const match = matchForPrediction(prediction);

  return prediction.kickoff_at ||
    prediction.kickoff ||
    match?.kickoff_at ||
    match?.kickoff ||
    null;
}


/* ==========================================
   DASHBOARD OVERVIEW
   ========================================== */

function renderStats() {
  const todayMatches = state.matches.filter((match) =>
    isToday(match.kickoff_at)
  );

  const todayPredictions = state.predictions.filter((prediction) =>
    isToday(prediction.prediction_date || prediction.created_at)
  );

  const pending = todayPredictions.filter((prediction) =>
    String(prediction.result || "pending").toLowerCase() === "pending"
  );

  const settled = todayPredictions.filter((prediction) =>
    ["won", "lost"].includes(
      String(prediction.result || "").toLowerCase()
    )
  );

  setText("#stat-fixtures", todayMatches.length);
  setText("#stat-predictions", todayPredictions.length);
  setText("#stat-pending", pending.length);
  setText("#stat-settled", settled.length);
}


/* ==========================================
   FIXTURES
   ========================================== */

function renderFixtures() {
  const container = $("#fixtures-container");
  if (!container) return;

  const fixtures = state.matches
    .filter((match) => {
      return isToday(match.kickoff_at) &&
        ["upcoming", "live"].includes(
          String(match.match_status || "upcoming").toLowerCase()
        );
    })
    .sort((a, b) =>
      new Date(a.kickoff_at) - new Date(b.kickoff_at)
    );

  if (!fixtures.length) {
    container.innerHTML = emptyCard(
      "No upcoming fixtures found for today in the database."
    );
    return;
  }

  container.innerHTML = fixtures.slice(0, 12).map((match) => `
    <article class="fixture-card">
      <div class="fixture-league">
        ${escapeHTML(match.league_name || "Football")}
        ${match.country ? ` · ${escapeHTML(match.country)}` : ""}
      </div>

      <div class="fixture-teams">
        ${escapeHTML(match.home_team || "Home team")}
        <br>
        <span style="color:#758399;font-weight:500">vs</span>
        <br>
        ${escapeHTML(match.away_team || "Away team")}
      </div>

      <div class="fixture-time">
        Kickoff: ${escapeHTML(formatDate(match.kickoff_at, true))}
      </div>

      <span class="fixture-status">
        ${escapeHTML(match.match_status || "upcoming")}
      </span>
    </article>
  `).join("");
}


/* ==========================================
   PREDICTION CATEGORIES
   ========================================== */

function isWinnerPrediction(prediction) {
  return String(prediction.category || "").toLowerCase() === "winner_team";
}

function isGoalsPrediction(prediction) {
  const category = String(prediction.category || "").toLowerCase();
  const market = String(prediction.market || "").toLowerCase();

  return category === "over_under" ||
    market.includes("over") ||
    market.includes("under") ||
    market.includes("total goals");
}

function predictionCard(prediction) {
  const result = String(prediction.result || "pending").toLowerCase();
  const probability = Number(prediction.estimated_probability);

  const probabilityText = Number.isFinite(probability)
    ? `${Math.round(probability <= 1 ? probability * 100 : probability)}%`
    : "Not available";

  return `
    <article class="fixture-card">
      <div class="fixture-league">
        ${escapeHTML(prediction.market || "Prediction")}
      </div>

      <div class="fixture-teams">
        ${escapeHTML(predictionMatchName(prediction))}
      </div>

      <div class="fixture-time">
        Pick: <strong>${escapeHTML(prediction.selection || "Not specified")}</strong>
      </div>

      <div class="fixture-time">
        Odds: <strong>${escapeHTML(formatOdds(prediction.decimal_odds))}</strong>
        &nbsp; · &nbsp;
        Probability: ${escapeHTML(probabilityText)}
      </div>

      ${prediction.reasoning ? `
        <p>${escapeHTML(prediction.reasoning)}</p>
      ` : ""}

      <span class="result-badge ${resultClass(result)}">
        ${escapeHTML(resultLabel(result))}
      </span>
    </article>
  `;
}

function renderPredictions() {
  const todayPredictions = state.predictions.filter((prediction) =>
    isToday(prediction.prediction_date || prediction.created_at)
  );

  const teamPicks = todayPredictions.filter(isWinnerPrediction);
  const goalsPicks = todayPredictions.filter(isGoalsPrediction);

  const teamContainer = $("#team-picks-container");
  const goalsContainer = $("#goals-container");

  if (teamContainer) {
    teamContainer.innerHTML = teamPicks.length
      ? teamPicks.slice(0, 3).map(predictionCard).join("")
      : emptyCard("No team predictions have been published for today.");
  }

  if (goalsContainer) {
    goalsContainer.innerHTML = goalsPicks.length
      ? goalsPicks.map(predictionCard).join("")
      : emptyCard("No over/under predictions have been published for today.");
  }
}


/* ==========================================
   ODDS SLIPS
   ========================================== */

const SLIP_CATEGORIES = [
  { category: "odds_2", target: 2.00, label: "LOWER TARGET" },
  { category: "odds_5", target: 5.00, label: "MID TARGET" },
  { category: "odds_10", target: 10.00, label: "HIGH TARGET" }
];

function slipSelections(slip) {
  if (Array.isArray(slip.selections)) return slip.selections;
  if (Array.isArray(slip.slip_selections)) return slip.slip_selections;
  return [];
}

function selectionPrediction(selection) {
  if (selection.prediction && typeof selection.prediction === "object") {
    return selection.prediction;
  }

  if (selection.predictions && typeof selection.predictions === "object") {
    return selection.predictions;
  }

  return state.predictions.find(
    (prediction) =>
      String(prediction.id) === String(selection.prediction_id)
  ) || null;
}

function selectionMatchName(selection) {
  const prediction = selectionPrediction(selection);

  if (prediction) return predictionMatchName(prediction);

  const match = state.matches.find(
    (item) => String(item.id) === String(selection.match_id)
  );

  if (match) {
    return `${match.home_team} vs ${match.away_team}`;
  }

  return selection.match_name || "Match details unavailable";
}

function renderSlipCard(categoryConfig) {
  const slip = state.slips.find((item) =>
    item.category === categoryConfig.category &&
    isToday(item.slip_date || item.created_at)
  );

  if (!slip) {
    return `
      <article class="slip-card">
        <div class="slip-top">
          <strong>${categoryConfig.target.toFixed(2)}</strong>
          <span>${categoryConfig.label}</span>
        </div>
        <h3>${categoryConfig.target.toFixed(2)} Odds Slip</h3>
        <p>No published slip is available for today.</p>
      </article>
    `;
  }

  const selections = slipSelections(slip);

  const combinedOdds = Number(slip.combined_odds);
  const displayedOdds = Number.isFinite(combinedOdds) && combinedOdds > 1
    ? combinedOdds.toFixed(2)
    : "Pending";

  const selectionHTML = selections.length
    ? `
      <ul class="slip-selections">
        ${selections.map((selection) => {
          const prediction = selectionPrediction(selection);

          const odds = selection.odds_at_publication ??
            prediction?.decimal_odds;

          return `
            <li>
              <span>${escapeHTML(selectionMatchName(selection))}
                <br>
                <span style="color:#758399">
                  ${escapeHTML(prediction?.selection || "")}
                </span>
              </span>
              <strong>${escapeHTML(formatOdds(odds))}</strong>
            </li>
          `;
        }).join("")}
      </ul>
    `
    : `<p>Slip exists, but selection details were not returned by the API.</p>`;

  return `
    <article class="slip-card">
      <div class="slip-top">
        <strong>${escapeHTML(displayedOdds)}</strong>
        <span>${escapeHTML(categoryConfig.label)}</span>
      </div>

      <h3>${categoryConfig.target.toFixed(2)} Odds Slip</h3>

      <p>
        Status:
        <span class="result-badge ${resultClass(slip.status)}">
          ${escapeHTML(resultLabel(slip.status))}
        </span>
      </p>

      ${selectionHTML}
    </article>
  `;
}

function renderSlips() {
  const container = $("#slips-container");
  if (!container) return;

  container.innerHTML = SLIP_CATEGORIES
    .map(renderSlipCard)
    .join("");
}


/* ==========================================
   PERFORMANCE — LAST TWO DAYS
   ========================================== */

function renderPerformance() {
  const recentPredictions = state.predictions.filter((prediction) =>
    isWithinRecentDays(
      prediction.prediction_date || prediction.created_at
    )
  );

  const settled = recentPredictions.filter((prediction) =>
    ["won", "lost"].includes(
      String(prediction.result || "").toLowerCase()
    )
  );

  const won = settled.filter((prediction) =>
    String(prediction.result).toLowerCase() === "won"
  );

  const lost = settled.filter((prediction) =>
    String(prediction.result).toLowerCase() === "lost"
  );

  const winRate = settled.length
    ? Math.round((won.length / settled.length) * 100)
    : 0;

  setText("#performance-settled", settled.length);
  setText("#performance-won", won.length);
  setText("#performance-lost", lost.length);
  setText("#performance-rate", `${winRate}%`);

  const table = $("#performance-table");
  if (!table) return;

  const sorted = [...recentPredictions].sort((a, b) => {
    const dateA = new Date(a.prediction_date || a.created_at || 0);
    const dateB = new Date(b.prediction_date || b.created_at || 0);
    return dateB - dateA;
  });

  if (!sorted.length) {
    table.innerHTML = `
      <tr>
        <td colspan="6" class="empty">
          No prediction history is available for the previous two days.
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = sorted.map((prediction) => `
    <tr>
      <td>${escapeHTML(formatDate(
        prediction.prediction_date || prediction.created_at
      ))}</td>
      <td class="match-name">${escapeHTML(predictionMatchName(prediction))}</td>
      <td>${escapeHTML(prediction.market || "—")}</td>
      <td>${escapeHTML(prediction.selection || "—")}</td>
      <td>
        <span class="odds-badge">
          ${escapeHTML(formatOdds(prediction.decimal_odds))}
        </span>
      </td>
      <td>
        <span class="result-badge ${resultClass(prediction.result)}">
          ${escapeHTML(resultLabel(prediction.result))}
        </span>
      </td>
    </tr>
  `).join("");
}


/* ==========================================
   RENDER ALL SECTIONS
   ========================================== */

function renderDashboard() {
  renderStats();
  renderFixtures();
  renderPredictions();
  renderSlips();
  renderPerformance();
}


/* ==========================================
   DATE DISPLAY
   ========================================== */

function renderDate() {
  const dateElement = $("#current-date");
  if (!dateElement) return;

  dateElement.textContent = new Intl.DateTimeFormat("en-GB", {
    timeZone: CONFIG.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date());
}


/* ==========================================
   MOBILE SIDEBAR
   ========================================== */

function setupSidebar() {
  const sidebar = $("#sidebar");
  const toggle = $("#menu-toggle");
  const overlay = $("#sidebar-overlay");

  if (!sidebar || !toggle) return;

  function closeSidebar() {
    sidebar.classList.remove("open");

    if (overlay) overlay.classList.remove("active");

    toggle.setAttribute("aria-expanded", "false");
  }

  function openSidebar() {
    sidebar.classList.add("open");

    if (overlay) overlay.classList.add("active");

    toggle.setAttribute("aria-expanded", "true");
  }

  toggle.addEventListener("click", () => {
    sidebar.classList.contains("open")
      ? closeSidebar()
      : openSidebar();
  });

  if (overlay) {
    overlay.addEventListener("click", closeSidebar);
  }

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((item) => {
        item.classList.remove("active");
      });

      link.classList.add("active");
      closeSidebar();
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) closeSidebar();
  });
}


/* ==========================================
   INITIALIZATION
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
  renderDate();
  setupSidebar();
  fetchDashboard();

  window.setInterval(() => {
    fetchDashboard();
  }, CONFIG.refreshIntervalMs);
});
```
