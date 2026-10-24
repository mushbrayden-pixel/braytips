```javascript
"use strict";

(() => {
  const CONFIG = {
    // Leave empty until we deploy and configure the backend.
    // Later, this will be your Cloudflare Worker URL.
    apiBase: "",

    timezone: "Africa/Nairobi",
    refreshIntervalMs: 5 * 60 * 1000
  };

  const state = {
    predictions: [],
    overUnder: [],
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

  function formatKenyaDateTime(date = new Date()) {
    return new Intl.DateTimeFormat("en-KE", {
      timeZone: CONFIG.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(date);
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

    return Number(combined.toFixed(4));
  }

  function checkOddsTarget(odds, target) {
    const combined = calculateCombinedOdds(odds);
    const targetValue = Number(target);

    if (combined === null || !Number.isFinite(targetValue) || targetValue <= 1) {
      return {
        valid: false,
        combinedOdds: null,
        targetReached: false,
        difference: null
      };
    }

    return {
      valid: true,
      combinedOdds: combined,
      targetReached: combined >= targetValue,
      difference: Number((combined - targetValue).toFixed(4))
    };
  }

  function impliedProbability(decimalOdds) {
    const odds = Number(decimalOdds);

    if (!Number.isFinite(odds) || odds <= 1) {
      return null;
    }

    // Raw implied probability; this is not a calibrated model prediction.
    return Number((100 / odds).toFixed(2));
  }

  function formatOdds(value) {
    const odds = Number(value);

    if (!Number.isFinite(odds) || odds <= 1) {
      return "—";
    }

    return odds.toFixed(2);
  }

  function formatProbability(value) {
    const probability = Number(value);

    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      return "—";
    }

    return `${probability.toFixed(1)}%`;
  }

  function getResultClass(result) {
    const value = String(result || "").toLowerCase();

    if (value === "won" || value === "win") return "green";
    if (value === "lost" || value === "loss") return "red";
    if (value === "void" || value === "pending") return "yellow";

    return "";
  }

  function getStatusLabel(result) {
    const value = String(result || "pending").toLowerCase();

    if (value === "won" || value === "win") return "Won";
    if (value === "lost" || value === "loss") return "Lost";
    if (value === "void") return "Void";

    return "Pending";
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

  function renderPredictions(records = state.predictions) {
    const tableBody = $("#predictions-table");

    if (!tableBody) return;

    if (!Array.isArray(records) || records.length === 0) {
      showEmptyRow(
        tableBody,
        7,
        "No verified predictions available",
        "Connect the backend to load real fixtures, odds, probability estimates and analysis."
      );
      return;
    }

    tableBody.innerHTML = records.map((record) => {
      const home = escapeHTML(record.homeTeam || "Home team");
      const away = escapeHTML(record.awayTeam || "Away team");
      const fixture = `${home} vs ${away}`;
      const competition = escapeHTML(record.competition || "—");
      const selection = escapeHTML(record.selection || "—");
      const odds = formatOdds(record.odds);
      const probability = formatProbability(record.probability);
      const analysis = escapeHTML(record.reason || record.analysis || "—");
      const result = getStatusLabel(record.result);
      const resultClass = getResultClass(record.result);

      return `
        <tr>
          <td>
            <div class="match-teams">
              <span class="team-dot">${escapeHTML(home.slice(0, 1))}</span>
              <span>${fixture}</span>
            </div>
          </td>
          <td>${competition}</td>
          <td>${selection}</td>
          <td><span class="odds-value">${odds}</span></td>
          <td>${probability}</td>
          <td>${analysis}</td>
          <td><span class="status-pill ${resultClass}">${result}</span></td>
        </tr>
      `;
    }).join("");
  }

  function renderOverUnder(records = state.overUnder) {
    const tableBody = $("#over-under-table");

    if (!tableBody) return;

    if (!Array.isArray(records) || records.length === 0) {
      showEmptyRow(
        tableBody,
        5,
        "No verified goal-market predictions yet",
        "Goal-market predictions will appear after the data provider and backend are connected."
      );
      return;
    }

    tableBody.innerHTML = records.map((record) => `
      <tr>
        <td>${escapeHTML(record.homeTeam || "Home team")} vs ${escapeHTML(record.awayTeam || "Away team")}</td>
        <td>${escapeHTML(record.market || "—")}</td>
        <td><span class="odds-value">${formatOdds(record.odds)}</span></td>
        <td>${formatProbability(record.probability)}</td>
        <td>${escapeHTML(record.reason || "—")}</td>
      </tr>
    `).join("");
  }

  function calculatePerformance(records = []) {
    const settled = records.filter((record) => {
      const result = String(record.result || "").toLowerCase();
      return ["won", "win", "lost", "loss"].includes(result);
    });

    const wins = settled.filter((record) =>
      ["won", "win"].includes(String(record.result).toLowerCase())
    ).length;

    const losses = settled.length - wins;

    const accuracy = settled.length > 0
      ? (wins / settled.length) * 100
      : 0;

    return {
      settled: settled.length,
      wins,
      losses,
      accuracy: Number(accuracy.toFixed(1))
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

    if (!Array.isArray(records) || records.length === 0) {
      showEmptyRow(
        tableBody,
        5,
        "No recorded results yet",
        "The table will populate when published predictions have settled results."
      );
      return;
    }

    const now = new Date();

    const currentKenyaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: CONFIG.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);

    const allowedDates = getPreviousDateKeys(currentKenyaDate, 2);

    const recentRecords = records
      .filter((record) => allowedDates.includes(String(record.date || "").slice(0, 10)))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    if (recentRecords.length === 0) {
      showEmptyRow(
        tableBody,
        5,
        "No results in the previous two days",
        "Once the backend saves published predictions and verified outcomes, they will appear here."
      );
      return;
    }

    tableBody.innerHTML = recentRecords.map((record) => {
      const result = getStatusLabel(record.result);
      const resultClass = getResultClass(record.result);

      return `
        <tr>
          <td>${escapeHTML(record.date || "—")}</td>
          <td>${escapeHTML(record.homeTeam || "Home team")} vs ${escapeHTML(record.awayTeam || "Away team")}</td>
          <td>${escapeHTML(record.selection || "—")}</td>
          <td>${formatOdds(record.odds)}</td>
          <td><span class="status-pill ${resultClass}">${result}</span></td>
        </tr>
      `;
    }).join("");
  }

  function getPreviousDateKeys(currentDate, daysBack) {
    const [year, month, day] = currentDate.split("-").map(Number);

    // UTC arithmetic avoids local computer timezone differences.
    const base = new Date(Date.UTC(year, month - 1, day));
    const dates = [];

    for (let i = 1; i <= daysBack; i++) {
      const date = new Date(base);
      date.setUTCDate(date.getUTCDate() - i);
      dates.push(date.toISOString().slice(0, 10));
    }

    return dates;
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
    if (!CONFIG.apiBase) {
      // Backend not configured yet. Keep the dashboard honest and empty.
      return;
    }

    if (state.loading) return;

    state.loading = true;
    state.error = null;

    try {
      const response = await fetch(`${CONFIG.apiBase.replace(/\/$/, "")}/api/dashboard`, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Backend request failed with HTTP ${response.status}`);
      }

      const data = await response.json();

      state.predictions = Array.isArray(data.predictions) ? data.predictions : [];
      state.overUnder = Array.isArray(data.overUnder) ? data.overUnder : [];
      state.history = Array.isArray(data.history) ? data.history : [];
      state.lastUpdated = data.lastUpdated || new Date().toISOString();

      renderPredictions();
      renderOverUnder();
      renderPerformance();
      renderHistory();
    } catch (error) {
      state.error = error.message;
      console.error("BrayTips backend error:", error);

      // Do not invent data if the provider or backend is unavailable.
    } finally {
      state.loading = false;
    }
  }

  function initialize() {
    updateDates();
    setupNavigation();

    renderPredictions();
    renderOverUnder();
    renderPerformance();
    renderHistory();

    // Refresh the date without reloading the page.
    setInterval(updateDates, 60 * 1000);

    // Only requests data after a backend URL is configured.
    if (CONFIG.apiBase) {
      fetchBackendData();
      setInterval(fetchBackendData, CONFIG.refreshIntervalMs);
    }

    console.info("BrayTips dashboard initialized.");
    console.info("Backend connected:", Boolean(CONFIG.apiBase));
  }

  // Expose utilities for later integration and testing.
  window.BrayTips = {
    calculateCombinedOdds,
    checkOddsTarget,
    impliedProbability,
    calculatePerformance,
    renderPredictions,
    renderOverUnder,
    renderPerformance,
    renderHistory,
    fetchBackendData,
    getState: () => ({ ...state })
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
```