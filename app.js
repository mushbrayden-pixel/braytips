/*
 * BrayTips public frontend.
 * All private API credentials remain in Cloudflare Worker secrets.
 */
const API_BASE = "https://braytips-api.mushbrayden.workers.dev";

const state = {
  matches: [],
  predictions: [],
  slips: []
};

const $ = (selector) => document.querySelector(selector);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function dateTime(value) {
  if (!value) return "Kick-off time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Kick-off time unavailable";
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

function showNotice(message, isError = false) {
  const notice = $("#notice");
  notice.innerHTML = `<span class="notice-icon">${isError ? "!" : "i"}</span><span>${escapeHTML(message)}</span>`;
  notice.style.background = isError ? "#fff0ee" : "#edf4ff";
  notice.style.borderColor = isError ? "#ffd9d4" : "#dce8ff";
}

function normalizeStatus(status) {
  return String(status || "upcoming").toLowerCase();
}

function fixtureCard(match) {
  const raw = match.raw_data || {};
  const homePosition = match.home_position ? `#${match.home_position}` : null;
  const awayPosition = match.away_position ? `#${match.away_position}` : null;
  const homeForm = match.home_form || null;
  const awayForm = match.away_form || null;
  const stats = [];
  if (homePosition || awayPosition) stats.push(`Table: ${homePosition || "—"} / ${awayPosition || "—"}`);
  if (homeForm || awayForm) stats.push(`Form: ${homeForm || "—"} / ${awayForm || "—"}`);
  const status = normalizeStatus(match.match_status);
  const statusLabel = status === "live" ? "LIVE" : status === "finished" ? "FT" : status === "postponed" ? "POSTPONED" : "UPCOMING";

  return `
    <article class="fixture-card">
      <div class="fixture-meta">
        <span class="league-name">${escapeHTML(match.league_name || "Competition")} · ${escapeHTML(match.country || "")}</span>
        <span class="tag ${status === "live" ? "blue" : ""}">${escapeHTML(statusLabel)}</span>
      </div>
      <div class="teams">
        <div class="team">${escapeHTML(match.home_team || "Home team")}</div>
        <div class="vs">VS</div>
        <div class="team">${escapeHTML(match.away_team || "Away team")}</div>
      </div>
      <div class="fixture-bottom">
        <span>${escapeHTML(dateTime(match.kickoff_at))}</span>
        <div class="stats-line">${stats.length ? stats.map(s => `<span>${escapeHTML(s)}</span>`).join("") : `<span>Statistics not yet available</span>`}</div>
      </div>
    </article>`;
}

function renderFixtures() {
  const filter = $("#leagueFilter").value;
  const search = $("#fixtureSearch").value.trim().toLowerCase();

  const filtered = state.matches.filter((match) => {
    const leagueMatch = !filter || match.league_name === filter;
    const searchMatch = !search ||
      `${match.home_team || ""} ${match.away_team || ""} ${match.league_name || ""}`.toLowerCase().includes(search);
    return leagueMatch && searchMatch;
  });

  const container = $("#fixturesContainer");
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">No matching fixtures were found. Try another competition or search term.</div>`;
    return;
  }
  container.innerHTML = filtered.map(fixtureCard).join("");
}

function renderPredictions() {
  const container = $("#predictionsContainer");
  if (!state.predictions.length) {
    container.innerHTML = `<div class="empty-state">No predictions have been published yet. This section will populate when verified selections are saved to the database.</div>`;
    return;
  }

  container.innerHTML = state.predictions.map((prediction) => {
    const match = state.matches.find(m => String(m.id) === String(prediction.match_id));
    const fixtureTitle = match
      ? `${match.home_team} vs ${match.away_team}`
      : (prediction.fixture || `Match #${prediction.match_id ?? "—"}`);
    return `
      <article class="content-card">
        <span class="tag blue">${escapeHTML(prediction.category || prediction.market || "Prediction")}</span>
        <h3>${escapeHTML(fixtureTitle)}</h3>
        <p><strong>Selection:</strong> ${escapeHTML(prediction.prediction || "Not specified")}</p>
        ${prediction.market ? `<p><strong>Market:</strong> ${escapeHTML(prediction.market)}</p>` : ""}
        ${prediction.reasoning ? `<p>${escapeHTML(prediction.reasoning)}</p>` : ""}
        <div class="card-foot"><span>Published selection</span><span>${escapeHTML(prediction.date ? dateTime(prediction.date) : "Date unavailable")}</span></div>
      </article>`;
  }).join("");
}

function renderSlips() {
  const container = $("#slipsContainer");
  if (!state.slips.length) {
    container.innerHTML = `<div class="empty-state">No slips have been published yet. Saved slips will appear here with their recorded status and odds.</div>`;
    return;
  }

  container.innerHTML = state.slips.map((slip) => {
    const status = String(slip.status || "pending");
    return `
      <article class="content-card">
        <div class="fixture-meta"><span class="league-name">Slip · ${escapeHTML(slip.slip_date || "Date unavailable")}</span><span class="tag">${escapeHTML(status.toUpperCase())}</span></div>
        <h3>${escapeHTML(slip.category || "Football slip")}</h3>
        <p>${escapeHTML(slip.reasoning || "No additional notes recorded.")}</p>
        <div class="stats-line">
          <span>Target odds: ${escapeHTML(slip.target_odds ?? "—")}</span>
          <span>Combined odds: ${escapeHTML(slip.combined_odds ?? "—")}</span>
        </div>
        <div class="card-foot"><span>Recorded status</span><span>${escapeHTML(slip.settled_at || "Not settled")}</span></div>
      </article>`;
  }).join("");
}

function populateLeagueFilter() {
  const select = $("#leagueFilter");
  const selected = select.value;
  const leagues = [...new Set(state.matches.map(m => m.league_name).filter(Boolean))].sort();
  select.innerHTML = `<option value="">All competitions</option>` +
    leagues.map(league => `<option value="${escapeHTML(league)}">${escapeHTML(league)}</option>`).join("");
  if (leagues.includes(selected)) select.value = selected;
}

async function getJSON(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Accept": "application/json" }
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
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing…";
  $("#statusLabel").textContent = "Connecting…";

  try {
    const [health, dashboard] = await Promise.all([
      getJSON("/api/health"),
      getJSON("/api/dashboard")
    ]);

    state.matches = Array.isArray(dashboard.matches) ? dashboard.matches : [];
    state.predictions = Array.isArray(dashboard.predictions) ? dashboard.predictions : [];
    state.slips = Array.isArray(dashboard.slips) ? dashboard.slips : [];

    $("#fixtureCount").textContent = state.matches.length;
    $("#predictionCount").textContent = state.predictions.length;
    $("#slipCount").textContent = state.slips.length;
    $("#lastUpdated").textContent = `Last updated ${new Intl.DateTimeFormat("en-KE", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(new Date())} EAT`;

    $("#statusLabel").textContent = "Connected";
    $("#statusLabel").className = "status-pill ok";
    $("#footerApiStatus").textContent = health.footballApiConfigured
      ? "API status: connected"
      : "API status: database only";

    populateLeagueFilter();
    renderFixtures();
    renderPredictions();
    renderSlips();

    if (!state.matches.length) {
      showNotice("The API is connected, but no matches are stored yet. Import fixtures from the protected Worker endpoint.", true);
    } else if (!state.predictions.length) {
      showNotice("Fixtures loaded. No predictions have been published yet; no picks or odds are being fabricated.");
    } else {
      showNotice("Dashboard refreshed. Displaying only records saved in the BrayTips database.");
    }
  } catch (error) {
    $("#statusLabel").textContent = "Unavailable";
    $("#statusLabel").className = "status-pill error";
    $("#footerApiStatus").textContent = "API status: unavailable";
    showNotice(`Could not load BrayTips data: ${error.message}. Check the Worker health endpoint and try again.`, true);
    $("#fixturesContainer").innerHTML = `<div class="empty-state">Unable to load fixtures. Use Refresh data to try again.</div>`;
    $("#predictionsContainer").innerHTML = `<div class="empty-state">Predictions could not be loaded.</div>`;
    $("#slipsContainer").innerHTML = `<div class="empty-state">Slips could not be loaded.</div>`;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh data";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refreshButton").addEventListener("click", loadDashboard);
  $("#leagueFilter").addEventListener("change", renderFixtures);
  $("#fixtureSearch").addEventListener("input", renderFixtures);
  loadDashboard();
});
