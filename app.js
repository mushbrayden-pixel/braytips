```javascript
"use strict";

/* =========================================================
   BRAYTIPS — FRONTEND APPLICATION
   Cloudflare Pages + Cloudflare Worker + Supabase
   ========================================================= */

const API_BASE = "https://braytips-api.mushbrayden.workers.dev";

const state = {
  matches: [],
  predictions: [],
  slips: [],
  performance: {},
  currentView: "dashboard",
  loading: false
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

/* =========================================================
   UTILITIES
   ========================================================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value ?? "";
}

function formatDate(value) {
  if (!value) return "Date TBC";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date TBC";

  return date.toLocaleString("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPercent(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? `${number.toFixed(1)}%`
    : "—";
}

function showNotice(message, type = "info") {
  const notice = $("#notice");
  if (!notice) return;

  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;

  window.clearTimeout(showNotice.timeout);

  showNotice.timeout = window.setTimeout(() => {
    notice.hidden = true;
  }, 5000);
}

function setConnectionStatus(connected, message) {
  setText("#statusLabel", message);

  setText(
    "#footerApiStatus",
    connected ? "Connected" : "Connection issue"
  );

  const indicator = $(".status-indicator");

  if (indicator) {
    indicator.classList.toggle("online", connected);
    indicator.classList.toggle("offline", !connected);
  }
}

/* =========================================================
   API REQUESTS
   ========================================================= */

async function getJSON(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON received from ${path}`);
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed with HTTP ${response.status}`
    );
  }

  if (data && data.success === false) {
    throw new Error(
      data.error ||
      data.message ||
      `The API reported a failure for ${path}`
    );
  }

  return data;
}

/*
 * Supports common API response formats:
 *
 * [...]
 * { predictions: [...] }
 * { data: [...] }
 * { success: true, predictions: [...] }
 * { data: { predictions: [...] } }
 */
function unwrapArray(data, ...keys) {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }

  if (data.data && data.data !== data) {
    return unwrapArray(data.data, ...keys);
  }

  if (data.dashboard && data.dashboard !== data) {
    return unwrapArray(data.dashboard, ...keys);
  }

  return [];
}

/* =========================================================
   DATA NORMALIZATION
   ========================================================= */

function normalizeMatch(match) {
  return {
    ...match,

    home_team:
      match.home_team ??
      match.homeTeam ??
      match.home_name ??
      match.home ??
      "Home team",

    away_team:
      match.away_team ??
      match.awayTeam ??
      match.away_name ??
      match.away ??
      "Away team",

    league_name:
      match.league_name ??
      match.league ??
      match.competition ??
      "Football",

    kickoff_at:
      match.kickoff_at ??
      match.kickoff ??
      match.fixture_date ??
      match.date ??
      null,

    match_status:
      match.match_status ??
      match.status ??
      "scheduled"
  };
}

function normalizePrediction(prediction) {
  const market =
    prediction.market ??
    prediction.market_name ??
    prediction.prediction_type ??
    "Prediction";

  return {
    ...prediction,

    home_team:
      prediction.home_team ??
      prediction.homeTeam ??
      prediction.home_name ??
      "Home team",

    away_team:
      prediction.away_team ??
      prediction.awayTeam ??
      prediction.away_name ??
      "Away team",

    market,

    selection:
      prediction.selection ??
      prediction.prediction ??
      "Pending",

    odds:
      prediction.decimal_odds ??
      prediction.odds ??
      prediction.bookmaker_odds ??
      null,

    confidence:
      prediction.confidence_label ??
      prediction.confidence ??
      "Not rated",

    result: String(
      prediction.result ??
      prediction.status ??
      "pending"
    ).toLowerCase(),

    category: String(
      prediction.category ??
      ""
    ).toLowerCase()
  };
}

function normalizeSlip(slip) {
  return {
    ...slip,

    name:
      slip.name ??
      slip.title ??
      slip.category ??
      "Betting slip",

    category: String(
      slip.category ??
      ""
    ).toLowerCase(),

    odds:
      slip.combined_odds ??
      slip.total_odds ??
      slip.decimal_odds ??
      slip.odds ??
      slip.target_odds ??
      null,

    result: String(
      slip.status ??
      slip.result ??
      "pending"
    ).toLowerCase()
  };
}

/* =========================================================
   NAVIGATION
   ========================================================= */

const VALID_VIEWS = [
  "dashboard",
  "fixtures",
  "odds2",
  "odds5",
  "odds10",
  "overunder",
  "daily3",
  "performance"
];

function showView(name, updateHistory = true) {
  if (!VALID_VIEWS.includes(name)) {
    name = "dashboard";
  }

  state.currentView = name;

  $$(".view").forEach((view) => {
    view.classList.toggle(
      "active",
      view.id === `${name}View`
    );
  });

  $$(".nav-button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.view === name
    );
  });

  const nav = $("#mainNav");
  const toggle = $("#menuToggle");

  if (nav) nav.classList.remove("open");

  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
  }

  if (updateHistory && location.hash !== `#${name}`) {
    history.pushState(
      { view: name },
      "",
      `#${name}`
    );
  }

  window.scrollTo({
    top: 0,
    behavior: "auto"
  });
}

function initializeNavigation() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      showView(button.dataset.view);
    });
  });

  const toggle = $("#menuToggle");
  const nav = $("#mainNav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");

      toggle.setAttribute(
        "aria-expanded",
        String(open)
      );
    });
  }

  showView(
    location.hash.slice(1) || "dashboard",
    false
  );

  window.addEventListener("popstate", () => {
    showView(
      location.hash.slice(1) || "dashboard",
      false
    );
  });

  window.addEventListener("hashchange", () => {
    showView(
      location.hash.slice(1) || "dashboard",
      false
    );
  });
}

/* =========================================================
   FIXTURES
   ========================================================= */

function renderFixtures() {
  const container = $("#fixturesContainer");

  if (!container) return;

  const search = (
    $("#fixtureSearch")?.value || ""
  ).trim().toLowerCase();

  const league = $("#leagueFilter")?.value || "";

  const filtered = state.matches.filter((match) => {
    const searchableText = [
      match.home_team,
      match.away_team,
      match.league_name,
      match.country
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!search || searchableText.includes(search)) &&
      (!league || match.league_name === league)
    );
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No fixtures found</h3>
        <p>
          No matching fixtures are available in the database.
          Try another search or refresh.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = filtered.map((match) => `
    <article class="fixture-card">
      <div class="fixture-meta">
        <span>${escapeHTML(match.league_name)}</span>
        <span>${escapeHTML(formatDate(match.kickoff_at))}</span>
      </div>

      <div class="fixture-teams">
        <strong>${escapeHTML(match.home_team)}</strong>
        <span class="versus">VS</span>
        <strong>${escapeHTML(match.away_team)}</strong>
      </div>

      <div class="fixture-footer">
        <span>${escapeHTML(match.match_status)}</span>

        ${
          match.home_goals != null &&
          match.away_goals != null
            ? `
              <strong>
                ${escapeHTML(match.home_goals)}
                -
                ${escapeHTML(match.away_goals)}
              </strong>
            `
            : ""
        }
      </div>
    </article>
  `).join("");
}

function populateLeagueFilter() {
  const select = $("#leagueFilter");

  if (!select) return;

  const current = select.value;

  const leagues = [
    ...new Set(
      state.matches
        .map((match) => match.league_name)
        .filter(Boolean)
    )
  ].sort();

  select.innerHTML = `
    <option value="">All competitions</option>
    ${leagues.map((leagueName) => `
      <option value="${escapeHTML(leagueName)}">
        ${escapeHTML(leagueName)}
      </option>
    `).join("")}
  `;

  if (leagues.includes(current)) {
    select.value = current;
  }
}

/* =========================================================
   PREDICTION CARDS
   ========================================================= */

function predictionCard(prediction) {
  const odds = Number(prediction.odds);

  const hasOdds =
    prediction.odds !== null &&
    prediction.odds !== "" &&
    Number.isFinite(odds) &&
    odds > 0;

  const confidence = prediction.confidence;

  return `
    <article class="prediction-card">
      <div class="prediction-heading">
        <span>${escapeHTML(prediction.market)}</span>

        <span class="result-badge ${escapeHTML(prediction.result)}">
          ${escapeHTML(prediction.result)}
        </span>
      </div>

      <h3>
        ${escapeHTML(prediction.home_team)}
        vs
        ${escapeHTML(prediction.away_team)}
      </h3>

      <p class="prediction-selection">
        <strong>Selection:</strong>
        ${escapeHTML(prediction.selection)}
      </p>

      ${
        prediction.reasoning
          ? `
            <p class="prediction-reasoning">
              ${escapeHTML(prediction.reasoning)}
            </p>
          `
          : ""
      }

      <div class="prediction-details">
        <span>
          Odds:
          <strong>${hasOdds ? odds.toFixed(2) : "N/A"}</strong>
        </span>

        <span>
          Confidence:
          <strong>${escapeHTML(confidence)}</strong>
        </span>
      </div>

      ${
        prediction.kickoff_at
          ? `
            <div class="fixture-meta">
              ${escapeHTML(formatDate(prediction.kickoff_at))}
            </div>
          `
          : ""
      }
    </article>
  `;
}

/* =========================================================
   SLIP CARDS
   ========================================================= */

function slipCard(slip) {
  const odds = Number(slip.odds);

  const hasOdds =
    slip.odds !== null &&
    slip.odds !== "" &&
    Number.isFinite(odds) &&
    odds > 0;

  return `
    <article class="prediction-card">
      <div class="prediction-heading">
        <span>${escapeHTML(slip.name)}</span>

        <span class="result-badge ${escapeHTML(slip.result)}">
          ${escapeHTML(slip.result)}
        </span>
      </div>

      <h3>
        ${escapeHTML(slip.name)}
      </h3>

      <div class="prediction-details">
        <span>
          Combined odds:
          <strong>
            ${hasOdds ? odds.toFixed(2) : "Not recorded"}
          </strong>
        </span>
      </div>

      ${
        slip.reasoning
          ? `
            <p class="prediction-reasoning">
              ${escapeHTML(slip.reasoning)}
            </p>
          `
          : ""
      }

      ${
        slip.slip_date
          ? `
            <div class="fixture-meta">
              Date: ${escapeHTML(slip.slip_date)}
            </div>
          `
          : ""
      }
    </article>
  `;
}

/* =========================================================
   RENDER PREDICTIONS AND SLIPS
   ========================================================= */

function renderPredictions() {
  const predictions = state.predictions;

  const recent = $("#recentPredictions");

  if (recent) {
    recent.innerHTML = predictions.length
      ? predictions
          .slice(0, 6)
          .map(predictionCard)
          .join("")
      : `
        <div class="empty-state">
          <p>No published predictions are available yet.</p>
        </div>
      `;
  }

  /*
   * Individual predictions are categorized using both their
   * database category and market name.
   */

  const categories = {
    odds2: [],
    odds5: [],
    odds10: [],
    overunder: [],
    daily3: []
  };

  predictions.forEach((prediction) => {
    const category = String(
      prediction.category ?? ""
    ).toLowerCase();

    const market = String(
      prediction.market ?? ""
    ).toLowerCase();

    const combined = `${category} ${market}`;

    if (
      combined.includes("over") ||
      combined.includes("under") ||
      combined.includes("over_under") ||
      combined.includes("over/under")
    ) {
      categories.overunder.push(prediction);
    } else if (
      combined.includes("daily3") ||
      combined.includes("daily_3") ||
      combined.includes("daily 3") ||
      combined.includes("3-team") ||
      combined.includes("3 team")
    ) {
      categories.daily3.push(prediction);
    } else if (
      category.includes("odds10") ||
      category.includes("odds_10") ||
      category.includes("odds-10")
    ) {
      categories.odds10.push(prediction);
    } else if (
      category.includes("odds5") ||
      category.includes("odds_5") ||
      category.includes("odds-5")
    ) {
      categories.odds5.push(prediction);
    } else if (
      category.includes("odds2") ||
      category.includes("odds_2") ||
      category.includes("odds-2")
    ) {
      categories.odds2.push(prediction);
    }
  });

  /*
   * The 2, 5 and 10 odds pages should display saved slips
   * when the dashboard API supplies them.
   *
   * We do not fabricate slips or pretend that individual
   * predictions form a verified combined-odds ticket.
   */

  const slipsByCategory = {
    odds2: [],
    odds5: [],
    odds10: []
  };

  state.slips.forEach((slip) => {
    const category = String(
      slip.category ?? ""
    ).toLowerCase();

    if (
      category.includes("odds10") ||
      category.includes("odds_10") ||
      category.includes("odds-10") ||
      category === "10"
    ) {
      slipsByCategory.odds10.push(slip);
    } else if (
      category.includes("odds5") ||
      category.includes("odds_5") ||
      category.includes("odds-5") ||
      category === "5"
    ) {
      slipsByCategory.odds5.push(slip);
    } else if (
      category.includes("odds2") ||
      category.includes("odds_2") ||
      category.includes("odds-2") ||
      category === "2"
    ) {
      slipsByCategory.odds2.push(slip);
    }
  });

  const containers = {
    odds2: "#odds2Container",
    odds5: "#odds5Container",
    odds10: "#odds10Container",
    overunder: "#overunderContainer",
    daily3: "#daily3Container"
  };

  Object.entries(containers).forEach(([category, selector]) => {
    const container = $(selector);

    if (!container) return;

    if (category === "odds2" ||
        category === "odds5" ||
        category === "odds10") {

      const slips = slipsByCategory[category];

      container.innerHTML = slips.length
        ? slips.map(slipCard).join("")
        : `
          <div class="empty-state">
            <p>
              No published ${category === "odds2"
                ? "2-odds"
                : category === "odds5"
                  ? "5-odds"
                  : "10-odds"} slips are available yet.
            </p>
          </div>
        `;

      return;
    }

    const items = categories[category];

    container.innerHTML = items.length
      ? items.map(predictionCard).join("")
      : `
        <div class="empty-state">
          <p>
            No ${escapeHTML(category)} predictions are available yet.
          </p>
        </div>
      `;
  });

  setText("#predictionCount", predictions.length);
  setText("#slipCount", state.slips.length);
}

/* =========================================================
   PERFORMANCE
   ========================================================= */

function renderPerformance() {
  const performance = state.performance || {};
  const predictions = state.predictions;

  const won = predictions.filter(
    (item) => item.result === "won"
  ).length;

  const lost = predictions.filter(
    (item) => item.result === "lost"
  ).length;

  const pending = predictions.filter(
    (item) => item.result === "pending"
  ).length;

  const settled = won + lost;

  setText("#perfTotal", predictions.length);
  setText("#perfWon", won);
  setText("#perfLost", lost);
  setText("#perfPending", pending);

  setText(
    "#perfWinRate",
    formatPercent(
      settled ? (won / settled) * 100 : 0
    )
  );

  const profitValue =
    performance.profit ??
    performance.net_profit ??
    performance.netProfit;

  const profit = Number(profitValue);

  setText(
    "#perfProfit",
    profitValue != null && Number.isFinite(profit)
      ? profit.toFixed(2)
      : "—"
  );

  const slips = state.slips;

  const slipWon = slips.filter(
    (item) => item.result === "won"
  ).length;

  const slipLost = slips.filter(
    (item) => item.result === "lost"
  ).length;

  const slipSettled = slipWon + slipLost;

  setText("#slipPerfTotal", slips.length);
  setText("#slipPerfWon", slipWon);
  setText("#slipPerfLost", slipLost);

  setText(
    "#slipPerfRate",
    formatPercent(
      slipSettled
        ? (slipWon / slipSettled) * 100
        : 0
    )
  );

  setText(
    "#performanceUpdated",
    `Updated ${new Date().toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi"
    })}`
  );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {
  setText("#fixtureCount", state.matches.length);

  setText("#predictionCount", state.predictions.length);

  setText("#slipCount", state.slips.length);

  const won = state.predictions.filter(
    (item) => item.result === "won"
  ).length;

  const lost = state.predictions.filter(
    (item) => item.result === "lost"
  ).length;

  const settled = won + lost;

  setText(
    "#dashboardWinRate",
    formatPercent(
      settled ? (won / settled) * 100 : 0
    )
  );

  renderFixtures();
  renderPredictions();
  renderPerformance();
}

/* =========================================================
   LOAD API DATA
   ========================================================= */

async function loadDashboard() {
  if (state.loading) return;

  state.loading = true;

  const refreshButton = $("#refreshButton");

  if (refreshButton) {
    refreshButton.disabled = true;
  }

  setConnectionStatus(
    false,
    "Connecting to the BrayTips API..."
  );

  try {
    /*
     * Load the main dashboard and published predictions
     * independently.
     *
     * Previously, the homepage relied entirely on
     * dashboard.predictions. The live dashboard endpoint
     * does not currently return that field.
     *
     * Published predictions are therefore loaded directly
     * from /api/predictions.
     */

    const results = await Promise.allSettled([
      getJSON("/api/health"),
      getJSON("/api/dashboard"),
      getJSON("/api/predictions")
    ]);

    const healthResult =
      results[0].status === "fulfilled"
        ? results[0].value
        : null;

    const dashboardResult =
      results[1].status === "fulfilled"
        ? results[1].value
        : null;

    const predictionsResult =
      results[2].status === "fulfilled"
        ? results[2].value
        : null;

    /*
     * Dashboard data
     */

    if (dashboardResult) {
      const dashboard =
        dashboardResult.dashboard ??
        dashboardResult.data ??
        dashboardResult;

      state.matches = unwrapArray(
        dashboard,
        "matches",
        "fixtures"
      ).map(normalizeMatch);

      state.slips = unwrapArray(
        dashboard,
        "slips"
      ).map(normalizeSlip);

      state.performance =
        dashboard.performance ??
        dashboard.stats ??
        {};
    } else {
      console.error(
        "BrayTips dashboard API error:",
        results[1].reason
      );
    }

    /*
     * Published predictions endpoint.
     *
     * This is the important fix.
     */

    if (predictionsResult) {
      state.predictions = unwrapArray(
        predictionsResult,
        "predictions"
      ).map(normalizePrediction);
    } else {
      console.error(
        "BrayTips predictions API error:",
        results[2].reason
      );
    }

    /*
     * Render whatever data was retrieved successfully.
     */

    populateLeagueFilter();
    renderDashboard();

    /*
     * Connection status
     */

    const dashboardFailed =
      results[1].status === "rejected";

    const predictionsFailed =
      results[2].status === "rejected";

    if (dashboardFailed && predictionsFailed) {
      setConnectionStatus(
        false,
        "API connected with data-loading errors"
      );

      showNotice(
        "The API responded, but dashboard data and predictions could not be loaded. Check the API endpoints.",
        "error"
      );
    } else if (dashboardFailed) {
      setConnectionStatus(
        false,
        "Dashboard data unavailable"
      );

      showNotice(
        "Published predictions loaded, but fixtures or slips could not be loaded.",
        "error"
      );
    } else if (predictionsFailed) {
      setConnectionStatus(
        false,
        "Predictions unavailable"
      );

      showNotice(
        "Fixtures loaded, but published predictions could not be retrieved.",
        "error"
      );
    } else if (
      healthResult &&
      healthResult.ok === false
    ) {
      setConnectionStatus(
        false,
        "API responded with a warning"
      );
    } else {
      setConnectionStatus(
        true,
        "API Connected"
      );
    }

    setText(
      "#lastUpdated",
      `Last updated: ${new Date().toLocaleTimeString("en-GB", {
        timeZone: "Africa/Nairobi"
      })}`
    );

  } catch (error) {
    console.error(
      "BrayTips loading error:",
      error
    );

    setConnectionStatus(
      false,
      "Connection issue"
    );

    showNotice(
      "Could not load BrayTips data. Check your internet connection and try refreshing.",
      "error"
    );

  } finally {
    state.loading = false;

    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function initializeApp() {
  initializeNavigation();

  $("#refreshButton")?.addEventListener(
    "click",
    loadDashboard
  );

  $("#fixtureSearch")?.addEventListener(
    "input",
    renderFixtures
  );

  $("#leagueFilter")?.addEventListener(
    "change",
    renderFixtures
  );

  loadDashboard();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeApp,
    { once: true }
  );
} else {
  initializeApp();
}
```
