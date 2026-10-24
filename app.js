"use strict";

(() => {
  const CONFIG = {
    apiBase: "https://braytips-api.mushbrayden.workers.dev",
    timezone: "Africa/Nairobi",
    refreshIntervalMs: 5 * 60 * 1000,
    historyDays: 2
  };

  const state = {
    matches: [],
    predictions: [],
    overUnder: [],
    slips: [],
    history: [],
    lastUpdated: null,
    loading: false,
    error: null
  };

  const $ = (selector) => document.querySelector(selector);

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function formatKenyaDate(date = new Date()) {
    return new Intl.DateTimeFormat("en-KE", {
      timeZone: CONFIG.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function formatKenyaDateTime(date) {
    if (!date) return "Kickoff time unavailable";

    return new Intl.DateTimeFormat("en-KE", {
      timeZone: CONFIG.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(new Date(date));
  }

  function getKenyaDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: CONFIG.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const values = {};

    for (const part of parts) {
      values[part.type] = part.value;
    }

    return `${values.year}-${values.month}-${values.day}`;
  }

  function updateDates() {
    const now = new Date();
    const headerDate = $("#header-date");
    const dashboardDate = $("#dashboard-date");

    if (headerDate) {
      headerDate.textContent = formatKenyaDate(now);
    }

    if (dashboardDate) {
      dashboardDate.textContent = `Kenya time · ${formatKenyaDate(now)}`;
    }
  }

  function calculateCombinedOdds(odds) {
    if (!Array.isArray(odds) || odds.length === 0) {
      return null;
    }

    let combined = 1;

    for (const odd of odds) {
      const value = Number(odd);

      if (!Number.isFinite(value) || value <= 1) {
        return null;
      }

      combined *= value;
    }

    return Number(combined.toFixed(3));
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

    if (!Number.isFinite(probability)) return "—";

    // Accept either a percentage (0–100) or a fraction (0–1).
    const percentage = probability <= 1
      ? probability * 100
      : probability;

    if (percentage < 0 || percentage > 100) return "—";

    return `${percentage.toFixed(1)}%`;
  }

  function normalizeResult(result) {
    const value = String(result || "pending").toLowerCase();

    if (["won", "win"].includes(value)) return "won";
    if (["lost", "loss"].includes(value)) return "lost";
    if (value === "void") return "void";

    return "pending";
  }

  function getStatusLabel(result) {
    const value = normalizeResult(result);

    return {
      won: "Won",
      lost: "Lost",
      void: "Void",
      pending: "Pending"
    }[value];
  }

  function getResultClass(result) {
    const value = normalizeResult(result);

    return {
      won: "green",
      lost: "red",
      void: "yellow",
      pending: "yellow"
    }[value];
  }

  function showEmptyRow(tableBody, columnCount, title, description) {
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="${columnCount}" class="empty-state">
          <strong>${escapeHTML(title)}</strong>
          <span>${escapeHTML(description)}</span>
        </td>
      </tr>
    `;
  }

  function getMatchName(match) {
    return `${match.home_team || match.homeTeam || "Home team"} vs ${
      match.away_team || match.awayTeam || "Away team"
    }`;
  }

  function getMatchStatus(match) {
    const status = String(match.match_status || match.status || "").toLowerCase();

    if (["finished", "ft", "aet", "pen"].includes(status)) return "Finished";
    if (["live", "1h", "2h", "ht", "et", "bt"].includes(status)) return "Live";
    if (["postponed", "pst"].includes(status)) return "Postponed";
    if (["cancelled", "canceled", "canc"].includes(status)) return "Cancelled";

    return "Upcoming";
  }

  function renderFixtures(records = state.matches) {
    const containers = [
      "#fixtures-list",
      "#matches-list",
      "#fixtures-container",
      "#matches-container",
      "#upcoming-fixtures"
    ];

    const container = containers.map((selector) => $(selector)).find(Boolean);

    // Use a dedicated fixture container if the existing HTML has one.
    if (container) {
      if (!records.length) {
        container.innerHTML = `
          <div class="empty-state">
            <strong>No fixtures available</strong>
            <span>Check back after the next fixture import.</span>
          </div>
        `;
        return;
      }

      container.innerHTML = records.map((match) => `
        <article class="fixture-card">
          <div class="fixture-competition">
            ${escapeHTML(match.league_name || match.competition || "Competition")}
            ${match.country ? ` · ${escapeHTML(match.country)}` : ""}
          </div>
          <div class="fixture-teams">${escapeHTML(getMatchName(match))}</div>
          <div class="fixture-time">${escapeHTML(formatKenyaDateTime(match.kickoff_at || match.kickoff))}</div>
          <div class="fixture-status">${escapeHTML(getMatchStatus(match))}</div>
        </article>
      `).join("");

      return;
    }

    // The existing HTML may not contain a fixture container.
    // Do not overwrite unrelated sections or invent a container.
    console.info("BrayTips fixture data loaded:", records.length);
  }

  function renderPredictions(records = state.predictions) {
    const tableBody = $("#predictions-table");

    if (!tableBody) return;

    if (!records.length) {
      showEmptyRow(
        tableBody,
        7,
        "No verified predictions available",
        "Real fixtures are loaded separately. Predictions will appear once the backend generates and verifies them."
      );
      return;
    }

    tableBody.innerHTML = records.map((record) => {
      const match = record.matches || {};
      const home = record.homeTeam || record.home_team || match.home_team || "Home team";
      const away = record.awayTeam || record.away_team || match.away_team || "Away team";
      const competition = record.competition || record.league_name || match.league_name || "—";
      const selection = record.selection || "—";
      const odds = formatOdds(record.decimal_odds ?? record.odds);
      const probability = formatProbability(
        record.estimated_probability ?? record.probability
      );
      const analysis = record.reasoning || record.reason || record.analysis || "—";
      const result = getStatusLabel(record.result);

      return `
        <tr>
          <td><div class="match-teams">${escapeHTML(home)} vs ${escapeHTML(away)}</div></td>
          <td>${escapeHTML(competition)}</td>
          <td>${escapeHTML(selection)}</td>
          <td><span class="odds-value">${odds}</span></td>
          <td>${probability}</td>
          <td>${escapeHTML(analysis)}</td>
          <td><span class="status-pill ${getResultClass(record.result)}">${result}</span></td>
        </tr>
      `;
    }).join("");
  }

  function renderOverUnder(records = state.overUnder) {
    const tableBody = $("#over-under-table");

    if (!tableBody) return;

    if (!records.length) {
      showEmptyRow(
        tableBody,
        5,
        "No verified goal-market predictions yet",
        "No goal-market predictions have been generated by the backend."
      );
      return;
    }

    tableBody.innerHTML = records.map((record) => {
      const match = record.matches || {};

      return `
        <tr>
          <td>${escapeHTML(
            record.homeTeam || match.home_team || "Home team"
          )} vs ${escapeHTML(
            record.awayTeam || match.away_team || "Away team"
          )}</td>
          <td>${escapeHTML(record.market || record.selection || "—")}</td>
          <td><span class="odds-value">${formatOdds(record.decimal_odds ?? record.odds)}</span></td>
          <td>${formatProbability(record.estimated_probability ?? record.probability)}</td>
          <td>${escapeHTML(record.reasoning || record.reason || "—")}</td>
        </tr>
      `;
    }).join("");
  }

  function getPreviousDateKeys(currentDate, daysBack) {
    const [year, month, day] = currentDate.split("-").map(Number);
    const base = new Date(Date.UTC(year, month - 1, day));
    const dates = [];

    for (let i = 1; i <= daysBack; i++) {
      const date = new Date(base);
      date.setUTCDate(date.getUTCDate() - i);
      dates.push(date.toISOString().slice(0, 10));
    }

    return dates;
  }

  function calculatePerformance(records = []) {
    const settled = records.filter((record) =>
      ["won", "lost"].includes(normalizeResult(record.result))
    );

    const wins = settled.filter((record) =>
      normalizeResult(record.result) === "won"
    ).length;

    const losses = settled.length - wins;

    return {
      settled: settled.length,
      wins,
      losses,
      accuracy: settled.length
        ? Number(((wins / settled.length) * 100).toFixed(1))
        : 0
    };
  }

  function renderPerformance(records = state.history) {
    const stats = calculatePerformance(records);

    const settledElement = $("#settled-count");
    const wonElement = $("#won-count");
    const lostElement = $("#lost-count");
    const accuracyElement = $("#accuracy-count");

    if (settledElement) settledElement.textContent = stats.settled;
    if (wonElement) wonElement.textContent = stats.wins;
    if (lostElement) lostElement.textContent = stats.losses;

    if (accuracyElement) {
      accuracyElement.textContent = `${stats.accuracy}%`;
    }
  }

  function renderHistory(records = state.history) {
    const tableBody = $("#history-table");

    if (!tableBody) return;

    const currentDate = getKenyaDateKey();
    const allowedDates = getPreviousDateKeys(currentDate, CONFIG.historyDays);

    const recentRecords = records
      .filter((record) => {
        const date = String(
          record.date || record.prediction_date || record.slip_date || ""
        ).slice(0, 10);

        return allowedDates.includes(date);
      })
      .sort((a, b) => {
        const dateA = String(a.date || a.prediction_date || a.slip_date || "");
        const dateB = String(b.date || b.prediction_date || b.slip_date || "");
        return dateB.localeCompare(dateA);
      });

    if (!recentRecords.length) {
      showEmptyRow(
        tableBody,
        5,
        "No recorded results in the previous two days",
        "Results will appear after published predictions have verified outcomes."
      );
      return;
    }

    tableBody.innerHTML = recentRecords.map((record) => {
      const match = record.matches || {};
      const home = record.homeTeam || match.home_team || record.home_team || "Home team";
      const away = record.awayTeam || match.away_team || record.away_team || "Away team";
      const date = record.date || record.prediction_date || record.slip_date || "—";

      return `
        <tr>
          <td>${escapeHTML(String(date).slice(0, 10))}</td>
          <td>${escapeHTML(home)} vs ${escapeHTML(away)}</td>
          <td>${escapeHTML(record.selection || record.category || "—")}</td>
          <td>${formatOdds(record.decimal_odds ?? record.odds ?? record.combined_odds)}</td>
          <td><span class="status-pill ${getResultClass(record.result || record.status)}">${
            getStatusLabel(record.result || record.status)
          }</span></td>
        </tr>
      `;
    }).join("");
  }

  function renderSlipSection(category, records = state.slips) {
    const selectors = {
      odds_2: ["#odds-2-slip", "#slip-2", "#odds2-slip"],
      odds_5: ["#odds-5-slip", "#slip-5", "#odds5-slip"],
      odds_10: ["#odds-10-slip", "#slip-10", "#odds10-slip"]
    };

    const container = (selectors[category] || [])
      .map((selector) => $(selector))
      .find(Boolean);

    if (!container) return;

    const slip = records.find((item) => item.category === category);

    if (!slip) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>No published ${category.replace("odds_", "")} odds slip</strong>
          <span>Only verified selections will be displayed here.</span>
        </div>
      `;
      return;
    }

    const selections = Array.isArray(slip.selections) ? slip.selections : [];
    const odds = selections.map((item) => item.odds_at_publication);
    const calculated = calculateCombinedOdds(odds);
    const combined = calculated ?? Number(slip.combined_odds);

    container.innerHTML = `
      <div class="slip-header">
        <strong>${escapeHTML(category.replace("odds_", "") + ".00 odds slip")}</strong>
        <span>Combined odds: ${formatOdds(combined)}</span>
      </div>
      ${
        selections.length
          ? `<ul>${selections.map((item) => `
              <li>
                ${escapeHTML(item.predictions?.selection || item.selection || "Selection")}
                <span>${formatOdds(item.odds_at_publication)}</span>
              </li>
            `).join("")}</ul>`
          : `<p>No selection details were returned by the backend.</p>`
      }
      <span class="status-pill ${getResultClass(slip.status)}">${escapeHTML(getStatusLabel(slip.status))}</span>
    `;
  }

  function renderAllSlips() {
    renderSlipSection("odds_2");
    renderSlipSection("odds_5");
    renderSlipSection("odds_10");
  }

  function setupNavigation() {
    const sidebar = $("#sidebar");
    const toggle = $("#menu-toggle");
    const navLinks = document.querySelectorAll(".nav-link");

    if (toggle && sidebar) {
      toggle.addEventListener("click", () => {
        const isOpen = sidebar.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
        toggle.textContent = isOpen ? "×" : "☰";
      });
    }

    navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.forEach((item) => item.classList.remove("active"));
        link.classList.add("active");

        if (sidebar) sidebar.classList.remove("open");

        if (toggle) {
          toggle.setAttribute("aria-expanded", "false");
          toggle.setAttribute("aria-label", "Open navigation");
          toggle.textContent = "☰";
        }
      });
    });
  }

  async function fetchBackendData() {
    if (state.loading) return;

    state.loading = true;
    state.error = null;

    try {
      const response = await fetch(
        `${CONFIG.apiBase.replace(/\/$/, "")}/api/dashboard`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(`Backend request failed with HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "The backend returned an error.");
      }

      state.matches = Array.isArray(data.matches) ? data.matches : [];
      state.predictions = Array.isArray(data.predictions) ? data.predictions : [];
      state.slips = Array.isArray(data.slips) ? data.slips : [];

      // The current Worker returns predictions and slips only.
      // These fields will be populated when the backend adds explicit categories.
      state.overUnder = state.predictions.filter((record) =>
        record.category === "over_under"
      );

      state.history = [
        ...state.predictions.map((record) => ({
          ...record,
          date: record.prediction_date
        })),
        ...state.slips.map((record) => ({
          ...record,
          date: record.slip_date,
          odds: record.combined_odds,
          result: record.status
        }))
      ];

      state.lastUpdated = data.generatedAt || new Date().toISOString();

      renderFixtures();
      renderPredictions();
      renderOverUnder();
      renderPerformance();
      renderHistory();
      renderAllSlips();

      console.info("BrayTips data loaded:", {
        matches: state.matches.length,
        predictions: state.predictions.length,
        slips: state.slips.length,
        lastUpdated: state.lastUpdated
      });

    } catch (error) {
      state.error = error.message;
      console.error("BrayTips backend error:", error);

      const statusElement = $("#connection-status");

      if (statusElement) {
        statusElement.textContent = "Data connection error";
      }

    } finally {
      state.loading = false;
    }
  }

  function initialize() {
    updateDates();
    setupNavigation();

    renderFixtures();
    renderPredictions();
    renderOverUnder();
    renderPerformance();
    renderHistory();
    renderAllSlips();

    fetchBackendData();

    setInterval(updateDates, 60 * 1000);
    setInterval(fetchBackendData, CONFIG.refreshIntervalMs);

    console.info("BrayTips dashboard initialized.");
    console.info("Backend URL:", CONFIG.apiBase);
  }

  window.BrayTips = {
    calculateCombinedOdds,
    formatOdds,
    formatProbability,
    calculatePerformance,
    renderFixtures,
    renderPredictions,
    renderOverUnder,
    renderPerformance,
    renderHistory,
    fetchBackendData,
    getState: () => ({
      ...state,
      matches: [...state.matches],
      predictions: [...state.predictions],
      overUnder: [...state.overUnder],
      slips: [...state.slips],
      history: [...state.history]
    })
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
