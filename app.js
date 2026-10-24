```javascript
"use strict";

/* =========================================================
   BRAYTIPS — FRONTEND APPLICATION
   API: Cloudflare Worker
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

function setHTML(selector, value) {
  const element = $(selector);
  if (element) element.innerHTML = value ?? "";
}

function formatDate(value) {
  if (!value) return "Date TBC";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date TBC";
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number.toFixed(1)}%`;
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
  setText("#footerApiStatus", connected ? "Connected" : "Connection issue");

  const indicator = $(".status-indicator");
  if (indicator) {
    indicator.classList.toggle("online", connected);
    indicator.classList.toggle("offline", !connected);
  }
}

async function getJSON(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON received from ${path}`);
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function unwrapArray(data, ...keys) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

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
  return {
    ...prediction,
    home_team: prediction.home_team ?? prediction.homeTeam ?? "Home team",
    away_team: prediction.away_team ?? prediction.awayTeam ?? "Away team",
    market: prediction.market ?? prediction.market_name ?? "Prediction",
    selection: prediction.selection ?? prediction.prediction ?? "Pending",
    odds: prediction.odds ?? prediction.decimal_odds ?? null,
    confidence: prediction.confidence ?? "Not rated",
    result: String(prediction.result ?? prediction.status ?? "pending").toLowerCase()
  };
}

function normalizeSlip(slip) {
  return {
    ...slip,
    name: slip.name ?? slip.title ?? slip.category ?? "Betting slip",
    odds: slip.odds ?? slip.total_odds ?? null,
    result: String(slip.result ?? slip.status ?? "pending").toLowerCase()
  };
}

/* =========================================================
   NAVIGATION — supports browser Back and Forward
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
  if (!VALID_VIEWS.includes(name)) name = "dashboard";

  state.currentView = name;

  $$(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${name}View`);
  });

  $$(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });

  const nav = $("#mainNav");
  const toggle = $("#menuToggle");

  if (nav) nav.classList.remove("open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");

  if (updateHistory && location.hash !== `#${name}`) {
    history.pushState({ view: name }, "", `#${name}`);
  }

  window.scrollTo({ top: 0, behavior: "auto" });
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
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  showView(location.hash.slice(1) || "dashboard", false);

  window.addEventListener("popstate", () => {
    showView(location.hash.slice(1) || "dashboard", false);
  });

  window.addEventListener("hashchange", () => {
    showView(location.hash.slice(1) || "dashboard", false);
  });
}

/* =========================================================
   FIXTURES
   ========================================================= */

function renderFixtures() {
  const container = $("#fixturesContainer");
  if (!container) return;

  const search = ($("#fixtureSearch")?.value || "").trim().toLowerCase();
  const league = $("#leagueFilter")?.value || "";

  const filtered = state.matches.filter((match) => {
    const text = [
      match.home_team,
      match.away_team,
      match.league_name,
      match.country
    ].join(" ").toLowerCase();

    return (!search || text.includes(search)) &&
      (!league || match.league_name === league);
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No fixtures found</h3>
        <p>Try another search or refresh the fixtures.</p>
      </div>`;
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
        ${match.home_goals != null && match.away_goals != null
          ? `<strong>${escapeHTML(match.home_goals)} - ${escapeHTML(match.away_goals)}</strong>`
          : ""}
      </div>
    </article>
  `).join("");
}

function populateLeagueFilter() {
  const select = $("#leagueFilter");
  if (!select) return;

  const current = select.value;
  const leagues = [...new Set(
    state.matches.map((match) => match.league_name).filter(Boolean)
  )].sort();

  select.innerHTML =
    `<option value="">All leagues</option>` +
    leagues.map((leagueName) =>
      `<option value="${escapeHTML(leagueName)}">${escapeHTML(leagueName)}</option>`
    ).join("");

  if (leagues.includes(current)) select.value = current;
}

/* =========================================================
   PREDICTIONS
   ========================================================= */

function predictionCard(prediction) {
  const odds = Number(prediction.odds);
  const hasOdds = Number.isFinite(odds) && odds > 0;

  return `
    <article class="prediction-card">
      <div class="prediction-heading">
        <span>${escapeHTML(prediction.market)}</span>
        <span class="result-badge ${escapeHTML(prediction.result)}">
          ${escapeHTML(prediction.result)}
        </span>
      </div>
      <h3>${escapeHTML(prediction.home_team)} vs ${escapeHTML(prediction.away_team)}</h3>
      <p class="prediction-selection">
        <strong>Selection:</strong> ${escapeHTML(prediction.selection)}
      </p>
      <div class="prediction-details">
        <span>Odds: <strong>${hasOdds ? odds.toFixed(2) : "N/A"}</strong></span>
        <span>Confidence: <strong>${escapeHTML(prediction.confidence)}</strong></span>
      </div>
    </article>`;
}

function renderPredictions() {
  const predictions = state.predictions;

  const recent = $("#recentPredictions");
  if (recent) {
    recent.innerHTML = predictions.length
      ? predictions.slice(0, 6).map(predictionCard).join("")
      : `<div class="empty-state"><p>No predictions available yet.</p></div>`;
  }

  const categories = {
    odds2: [],
    odds5: [],
    odds10: [],
    overunder: [],
    daily3: []
  };

  predictions.forEach((prediction) => {
    const category = String(prediction.category ?? "").toLowerCase();

    if (category.includes("over") || category.includes("under")) {
      categories.overunder.push(prediction);
    } else if (category.includes("daily3") || category.includes("daily_3")) {
      categories.daily3.push(prediction);
    } else if (category.includes("odds10") || category.includes("odds_10")) {
      categories.odds10.push(prediction);
    } else if (category.includes("odds5") || category.includes("odds_5")) {
      categories.odds5.push(prediction);
    } else if (category.includes("odds2") || category.includes("odds_2")) {
      categories.odds2.push(prediction);
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

    const items = categories[category];

    container.innerHTML = items.length
      ? items.map(predictionCard).join("")
      : `<div class="empty-state"><p>No ${escapeHTML(category)} predictions available.</p></div>`;
  });

  setText("#predictionCount", predictions.length);
}

/* =========================================================
   PERFORMANCE
   ========================================================= */

function renderPerformance() {
  const performance = state.performance || {};
  const predictions = state.predictions;

  const won = predictions.filter((item) => item.result === "won").length;
  const lost = predictions.filter((item) => item.result === "lost").length;
  const pending = predictions.filter((item) => item.result === "pending").length;
  const settled = won + lost;
  const winRate = settled ? (won / settled) * 100 : 0;

  setText("#perfTotal", predictions.length);
  setText("#perfWon", won);
  setText("#perfLost", lost);
  setText("#perfPending", pending);
  setText("#perfWinRate", formatPercent(winRate));

  const profit = Number(
    performance.profit ??
    performance.net_profit ??
    performance.netProfit
  );

  setText("#perfProfit", Number.isFinite(profit) ? profit.toFixed(2) : "—");

  const slips = state.slips;
  const slipWon = slips.filter((item) => item.result === "won").length;
  const slipLost = slips.filter((item) => item.result === "lost").length;
  const slipSettled = slipWon + slipLost;

  setText("#slipPerfTotal", slips.length);
  setText("#slipPerfWon", slipWon);
  setText("#slipPerfLost", slipLost);
  setText(
    "#slipPerfRate",
    formatPercent(slipSettled ? (slipWon / slipSettled) * 100 : 0)
  );

  setText("#performanceUpdated", `Updated ${new Date().toLocaleString()}`);
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {
  setText("#fixtureCount", state.matches.length);
  setText("#slipCount", state.slips.length);

  const won = state.predictions.filter((item) => item.result === "won").length;
  const lost = state.predictions.filter((item) => item.result === "lost").length;
  const settled = won + lost;

  setText(
    "#dashboardWinRate",
    formatPercent(settled ? (won / settled) * 100 : 0)
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
  if (refreshButton) refreshButton.disabled = true;

  setConnectionStatus(false, "Connecting to the BrayTips API...");

  try {
    const [healthResult, dashboardResult] = await Promise.all([
      getJSON("/api/health"),
      getJSON("/api/dashboard")
    ]);

    const dashboard = dashboardResult.dashboard ?? dashboardResult.data ?? dashboardResult;

    state.matches = unwrapArray(
      dashboard.matches ?? dashboard.fixtures,
      "matches",
      "fixtures",
      "data"
    ).map(normalizeMatch);

    state.predictions = unwrapArray(
      dashboard.predictions,
      "predictions"
    ).map(normalizePrediction);

    state.slips = unwrapArray(
      dashboard.slips,
      "slips"
    ).map(normalizeSlip);

    state.performance =
      dashboard.performance ??
      dashboard.stats ??
      {};

    populateLeagueFilter();
    renderDashboard();

    setConnectionStatus(true, "API Connected");
    setText("#lastUpdated", `Last updated: ${new Date().toLocaleTimeString()}`);

    if (healthResult.ok === false) {
      setConnectionStatus(false, "API responded with a warning");
    }
  } catch (error) {
    console.error("BrayTips loading error:", error);

    setConnectionStatus(false, "Connection issue");

    const container = $("#fixturesContainer");
    if (container && !state.matches.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Unable to load fixtures</h3>
          <p>The API could not be reached. Check your connection and try again.</p>
          <button type="button" id="retryLoadButton">Try again</button>
        </div>`;

      $("#retryLoadButton")?.addEventListener("click", loadDashboard);
    }

    showNotice(
      "Could not load BrayTips data. Check the browser console for details.",
      "error"
    );
  } finally {
    state.loading = false;
    if (refreshButton) refreshButton.disabled = false;
  }
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function initializeApp() {
  initializeNavigation();

  $("#refreshButton")?.addEventListener("click", loadDashboard);
  $("#fixtureSearch")?.addEventListener("input", renderFixtures);
  $("#leagueFilter")?.addEventListener("change", renderFixtures);

  loadDashboard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}
```
