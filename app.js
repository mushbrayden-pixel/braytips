/*
 * BrayTips redesigned frontend.
 * API credentials remain in Cloudflare Worker secrets.
 */

const API_BASE = "https://braytips-api.mushbrayden.workers.dev";

const state = {
  matches: [],
  predictions: [],
  slips: [],
  analysis: [],
  performance: null,
  oddsHistory: [],
  currentView: "dashboard"
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function dateTime(value) {
  if (!value) return "Kick-off unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(date) + " EAT";
}

function shortDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function showNotice(message, error = false) {
  const notice = $("#notice");

  notice.textContent = message;
  notice.classList.toggle("error", error);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function moneyUnits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  const prefix = n > 0 ? "+" : "";
  return prefix + n.toFixed(2) + " units";
}

function decimalOdds(value) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 1) return null;

  return n;
}

function getMatch(prediction) {
  if (prediction.match) return prediction.match;

  return state.matches.find(
    match => String(match.id) === String(prediction.match_id)
  ) || null;
}

function fixtureTitle(match, prediction) {
  if (match) {
    return `${match.home_team || "Home"} vs ${match.away_team || "Away"}`;
  }

  return prediction.fixture ||
    `Match #${prediction.match_id ?? "—"}`;
}

function resultTag(result) {
  const value = normalize(result || "pending");

  if (value === "won") {
    return '<span class="tag green">WON</span>';
  }

  if (value === "lost") {
    return '<span class="tag red">LOST</span>';
  }

  if (value === "void") {
    return '<span class="tag">VOID</span>';
  }

  return '<span class="tag blue">PENDING</span>';
}

function fixtureCard(match) {
  const status = normalize(match.match_status || "upcoming");

  const statusLabel = {
    live: "LIVE",
    finished: "FT",
    postponed: "POSTPONED",
    cancelled: "CANCELLED",
    upcoming: "UPCOMING"
  }[status] || status.toUpperCase();

  const stats = [];

  if (match.home_position || match.away_position) {
    stats.push(
      `Positions: ${match.home_position ?? "—"} / ${match.away_position ?? "—"}`
    );
  }

  if (match.home_form || match.away_form) {
    stats.push(
      `Form: ${match.home_form || "—"} / ${match.away_form || "—"}`
    );
  }

  return `
    <article class="fixture-card">
      <div class="fixture-meta">
        <span class="league-name">
          ${escapeHTML(match.league_name || "Competition")}
          · ${escapeHTML(match.country || "")}
        </span>
        <span class="tag ${status === "live" ? "blue" : ""}">
          ${escapeHTML(statusLabel)}
        </span>
      </div>

      <div class="teams">
        <div class="team">${escapeHTML(match.home_team || "Home team")}</div>
        <div class="vs">VS</div>
        <div class="team">${escapeHTML(match.away_team || "Away team")}</div>
      </div>

      <div class="fixture-bottom">
        <span>${escapeHTML(dateTime(match.kickoff_at))}</span>
        <div class="stats-line">
          ${
            stats.length
              ? stats.map(item => `<span>${escapeHTML(item)}</span>`).join("")
              : "<span>Team statistics not yet available</span>"
          }
        </div>
      </div>
    </article>
  `;
}

function renderFixtures() {
  const container = $("#fixturesContainer");
  const leagueFilter = $("#leagueFilter");
  const searchInput = $("#fixtureSearch");

  if (!container || !leagueFilter || !searchInput) return;

  const selectedLeague = leagueFilter.value;
  const search = normalize(searchInput.value);

  const matches = state.matches.filter(match => {
    const leagueMatches =
      !selectedLeague || match.league_name === selectedLeague;

    const text = normalize(
      `${match.home_team || ""} ${match.away_team || ""} ${match.league_name || ""}`
    );

    return leagueMatches && (!search || text.includes(search));
  });

  if (!matches.length) {
    container.innerHTML = `
      <div class="empty-state">
        No matching fixtures found. Try a different competition or search term.
      </div>
    `;
    return;
  }

  container.innerHTML = matches.map(fixtureCard).join("");
}

function populateLeagueFilter() {
  const select = $("#leagueFilter");
  if (!select) return;

  const current = select.value;

  const leagues = [...new Set(
    state.matches.map(match => match.league_name).filter(Boolean)
  )].sort();

  select.innerHTML =
    '<option value="">All competitions</option>' +
    leagues.map(league =>
      `<option value="${escapeHTML(league)}">${escapeHTML(league)}</option>`
    ).join("");

  if (leagues.includes(current)) {
    select.value = current;
  }
}

function predictionMarket(prediction) {
  return normalize(prediction.market || "");
}

function predictionCategory(prediction) {
  return normalize(prediction.category || "");
}

function isOverUnder(prediction) {
  const market = predictionMarket(prediction);
  const selection = normalize(prediction.selection);

  return (
    market.includes("over/under") ||
    market.includes("over under") ||
    market.includes("goals") ||
    market.includes("total goals") ||
    selection.includes("over ") ||
    selection.includes("under ")
  );
}

function isTeamWinner(prediction) {
  const category = predictionCategory(prediction);
  const market = predictionMarket(prediction);

  return (
    category === "winner_team" ||
    market === "1x2" ||
    market.includes("match winner") ||
    market.includes("team winner")
  );
}

function slipCategory(slip) {
  return normalize(slip.category);
}

function renderPredictionCard(prediction) {
  const match = getMatch(prediction);
  const odds = decimalOdds(prediction.decimal_odds);
  const selection = prediction.selection || prediction.prediction || "Not specified";
  const market = prediction.market || "Market unavailable";

  return `
    <article class="content-card">
      <div class="fixture-meta">
        <span class="tag blue">${escapeHTML(prediction.category || "Prediction")}</span>
        ${resultTag(prediction.result)}
      </div>

      <h3>${escapeHTML(fixtureTitle(match, prediction))}</h3>

      <div class="selection-box">
        <span>${escapeHTML(market)}</span>
        <strong>${escapeHTML(selection)}</strong>
        <span>
          Recorded odds:
          ${odds ? odds.toFixed(2) : "Not available"}
        </span>
      </div>

      ${
        prediction.reasoning
          ? `<p>${escapeHTML(prediction.reasoning)}</p>`
          : ""
      }

      ${
        prediction.estimated_probability != null
          ? `<p>Model estimate: ${
              (Number(prediction.estimated_probability) * 100).toFixed(1)
            }%</p>`
          : ""
      }

      <div class="card-foot">
        <span>${escapeHTML(shortDate(prediction.prediction_date || prediction.created_at))}</span>
        <span>${escapeHTML(match?.league_name || "Competition unavailable")}</span>
      </div>
    </article>
  `;
}

function emptyMessage(message) {
  return `<div class="empty-state">${escapeHTML(message)}</div>`;
}

function renderPredictionList(containerSelector, predictions, message) {
  const container = $(containerSelector);
  if (!container) return;

  container.innerHTML = predictions.length
    ? predictions.map(renderPredictionCard).join("")
    : emptyMessage(message);
}

function renderSlips() {
  const byCategory = {
    odds2: [],
    odds5: [],
    odds10: []
  };

  for (const slip of state.slips) {
    const category = slipCategory(slip);

    if (category === "odds_2" || category.includes("2 odds")) {
      byCategory.odds2.push(slip);
    } else if (category === "odds_5" || category.includes("5 odds")) {
      byCategory.odds5.push(slip);
    } else if (category === "odds_10" || category.includes("10 odds")) {
      byCategory.odds10.push(slip);
    }
  }

  renderSlipList(
    "#odds2Container",
    byCategory.odds2,
    "No 2 Odds slips have been published yet."
  );

  renderSlipList(
    "#odds5Container",
    byCategory.odds5,
    "No 5 Odds slips have been published yet."
  );

  renderSlipList(
    "#odds10Container",
    byCategory.odds10,
    "No 10 Odds slips have been published yet."
  );
}

function renderSlipList(selector, slips, message) {
  const container = $(selector);
  if (!container) return;

  if (!slips.length) {
    container.innerHTML = emptyMessage(message);
    return;
  }

  container.innerHTML = slips.map(slip => {
    const odds = decimalOdds(slip.combined_odds);

    return `
      <article class="content-card">
        <div class="fixture-meta">
          <span class="tag blue">${escapeHTML(slip.category || "Football slip")}</span>
          ${resultTag(slip.status)}
        </div>

        <h3>Published slip</h3>

        <div class="selection-box">
          <span>Recorded combined odds</span>
          <strong class="odds-number">${odds ? odds.toFixed(2) : "Unavailable"}</strong>
          <span>Target: ${escapeHTML(slip.target_odds ?? "—")}</span>
        </div>

        <p>${escapeHTML(slip.reasoning || "No additional notes recorded.")}</p>

        <div class="card-foot">
          <span>${escapeHTML(shortDate(slip.slip_date))}</span>
          <span>${escapeHTML(slip.settled_at ? "Settled " + shortDate(slip.settled_at) : "Not settled")}</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderOverUnder() {
  const picks = state.predictions.filter(isOverUnder);

  renderPredictionList(
    "#overunderContainer",
    picks,
    "No Over/Under predictions have been published yet."
  );
}

function renderDaily3() {
  const picks = state.predictions.filter(isTeamWinner);

  renderPredictionList(
    "#daily3Container",
    picks,
    "No team-winner predictions have been published yet. This section will populate when selections are saved."
  );
}

function renderRecentPredictions() {
  renderPredictionList(
    "#recentPredictions",
    state.predictions.slice(0, 4),
    "No predictions have been published yet."
  );
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function renderPerformance() {
  const performance = state.performance;

  if (!performance) {
    [
      "#perfTotal",
      "#perfWon",
      "#perfLost",
      "#perfPending",
      "#perfWinRate",
      "#perfProfit",
      "#slipPerfTotal",
      "#slipPerfWon",
      "#slipPerfLost",
      "#slipPerfRate"
    ].forEach(selector => setText(selector, "—"));

    return;
  }

  const p = performance.predictions || {};
  const s = performance.slips || {};

  setText("#perfTotal", p.total ?? 0);
  setText("#perfWon", p.won ?? 0);
  setText("#perfLost", p.lost ?? 0);
  setText("#perfPending", p.pending ?? 0);
  setText("#perfWinRate", `${Number(p.winRatePercent || 0).toFixed(2)}%`);

  const profit = Number(p.profitUnits || 0);
  setText("#perfProfit", moneyUnits(profit));

  const profitElement = $("#perfProfit");

  if (profitElement) {
    profitElement.classList.toggle("positive", profit > 0);
    profitElement.classList.toggle("negative", profit < 0);
  }

  setText("#slipPerfTotal", s.total ?? 0);
  setText("#slipPerfWon", s.won ?? 0);
  setText("#slipPerfLost", s.lost ?? 0);
  setText("#slipPerfRate", `${Number(s.winRatePercent || 0).toFixed(2)}%`);

  setText(
    "#performanceUpdated",
    state.performance.generatedAt
      ? `Last calculated: ${dateTime(state.performance.generatedAt)}`
      : ""
  );

  setText(
    "#dashboardWinRate",
    `${Number(p.winRatePercent || 0).toFixed(1)}%`
  );
}

async function getJSON(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The API returned an unreadable response.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

async function loadDashboard() {
  const refreshButton = $("#refreshButton");

  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = "Loading...";
  }

  setText("#statusLabel", "Connecting...");

  try {
    const [health, dashboard] = await Promise.all([
      getJSON("/api/health"),
      getJSON("/api/dashboard")
    ]);

    state.matches = Array.isArray(dashboard.matches)
      ? dashboard.matches
      : [];

    state.predictions = Array.isArray(dashboard.predictions)
      ? dashboard.predictions
      : [];

    state.slips = Array.isArray(dashboard.slips)
      ? dashboard.slips
      : [];

    state.analysis = Array.isArray(dashboard.analysis)
      ? dashboard.analysis
      : [];

    state.performance = dashboard.performance || null;

    setText("#fixtureCount", state.matches.length);
    setText("#predictionCount", state.predictions.length);
    setText("#slipCount", state.slips.length);

    const indicator = $(".status-indicator");

    if (indicator) {
      indicator.classList.add("online");
      indicator.classList.remove("offline");
    }

    setText("#statusLabel", "API connected");

    setText(
      "#lastUpdated",
      `Updated ${new Intl.DateTimeFormat("en-KE", {
        timeZone: "Africa/Nairobi",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }).format(new Date())} EAT`
    );

    setText(
      "#footerApiStatus",
      health.footballApiConfigured
        ? "API: configured"
        : "API: database only"
    );

    populateLeagueFilter();
    renderFixtures();
    renderRecentPredictions();
    renderSlips();
    renderOverUnder();
    renderDaily3();
    renderPerformance();

    if (!state.matches.length) {
      showNotice(
        "Connected successfully, but no fixtures are stored in the database yet.",
        true
      );
    } else {
      showNotice(
        "Dashboard refreshed. Only saved database records are displayed."
      );
    }
  } catch (error) {
    const indicator = $(".status-indicator");

    if (indicator) {
      indicator.classList.add("offline");
      indicator.classList.remove("online");
    }

    setText("#statusLabel", "Connection unavailable");
    setText("#footerApiStatus", "API: unavailable");

    showNotice(
      `Could not load BrayTips: ${error.message}. Check the Worker and try again.`,
      true
    );
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = "↻ Refresh";
    }
  }
}

function showView(name) {
  const validViews = [
    "dashboard",
    "fixtures",
    "odds2",
    "odds5",
    "odds10",
    "overunder",
    "daily3",
    "performance"
  ];

  if (!validViews.includes(name)) name = "dashboard";

  state.currentView = name;

  $$(".view").forEach(view => {
    view.classList.toggle("active", view.id === `${name}View`);
  });

  $$(".nav-button").forEach(button => {
    button.classList.toggle("active", button.dataset.view === name);
  });

  const nav = $("#mainNav");
  const toggle = $("#menuToggle");

  if (nav) nav.classList.remove("open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");

  if (history.replaceState) {
    history.replaceState(null, "", `#${name}`);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initializeNavigation() {
  $$("[data-view]").forEach(button => {
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

  const hash = location.hash.replace("#", "");

  if (hash && $(`#${hash}View`)) {
    showView(hash);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializeNavigation();

  $("#refreshButton")?.addEventListener("click", loadDashboard);

  $("#leagueFilter")?.addEventListener("change", renderFixtures);

  $("#fixtureSearch")?.addEventListener("input", renderFixtures);

  loadDashboard();
});
