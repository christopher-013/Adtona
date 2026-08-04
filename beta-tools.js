/* beta-tools.js — Public-beta instrumentation for Adtona.
 *
 * Three self-contained, dependency-free features:
 *   1. Cloudflare Web Analytics beacon (aggregate visitor / page-view counts).
 *   2. An in-app feedback form submitted through the same-origin Worker.
 *   3. A private, local (this-browser-only) usage log + a hidden metrics report.
 *
 * Loaded as a classic script before app.js, so it shares the global scope and
 * exposes window.ptgTrack() for app.js to call at milestones. Everything degrades
 * gracefully: with no Cloudflare token the beacon is never injected and no external
 * request is made; the local log and feedback form work with zero configuration.
 */
(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────

  // Cloudflare Web Analytics beacon token.
  //   Cloudflare dashboard → Analytics & Logs → Web Analytics → (your site) →
  //   "Manage site" → copy the token shown in the JS snippet's
  //   data-cf-beacon='{"token":"XXXXXXXX"}'. Paste that value below.
  //   Leave it "" to keep analytics OFF (no third-party request is made).
  var CF_BEACON_TOKEN = "a7ddbdbdc90e436d98590a41f3cbf190";

  // Same-origin Cloudflare Worker route. The GitHub token stays in Cloudflare's secret
  // store; it is never sent to or embedded in the browser application.
  var FEEDBACK_ENDPOINT = "/api/feedback";
  var METRICS_KEY = "ptg_beta_metrics_v1";
  var MAX_EVENTS = 500;

  // ─────────────────────────────────────────────────────────────────────────
  // Local metrics store (this browser only — never leaves the device)
  // ─────────────────────────────────────────────────────────────────────────

  function loadStore() {
    try {
      var raw = localStorage.getItem(METRICS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          parsed.counts = parsed.counts || {};
          parsed.events = Array.isArray(parsed.events) ? parsed.events : [];
          return parsed;
        }
      }
    } catch (e) { /* corrupted or unavailable storage — start fresh */ }
    return { firstSeen: Date.now(), sessions: 0, counts: {}, events: [] };
  }

  function saveStore() {
    try { localStorage.setItem(METRICS_KEY, JSON.stringify(store)); } catch (e) { /* private mode / quota */ }
  }

  var store = loadStore();

  function track(event, props) {
    if (!event || typeof event !== "string") return;
    store.counts[event] = (store.counts[event] || 0) + 1;
    store.events.push({ t: Date.now(), e: event, p: props && typeof props === "object" ? props : (props != null ? { v: props } : null) });
    if (store.events.length > MAX_EVENTS) store.events = store.events.slice(-MAX_EVENTS);
    saveStore();
  }

  // Exposed so app.js can record milestones: window.ptgTrack("trip_generated", {...})
  window.ptgTrack = track;

  // One "session_start" per browser tab session.
  try {
    if (!sessionStorage.getItem("ptg_session_started")) {
      sessionStorage.setItem("ptg_session_started", "1");
      store.sessions = (store.sessions || 0) + 1;
      saveStore();
      var ref = "direct";
      try { if (document.referrer) ref = new URL(document.referrer).hostname || "direct"; } catch (e) {}
      track("session_start", { ref: ref });
    }
  } catch (e) { /* sessionStorage unavailable */ }

  // ─────────────────────────────────────────────────────────────────────────
  // Cloudflare Web Analytics beacon (aggregate visitors — privacy-first, no cookies)
  // ─────────────────────────────────────────────────────────────────────────

  function injectBeacon() {
    if (!CF_BEACON_TOKEN) return;
    if (document.querySelector("script[data-cf-beacon]")) return;
    var s = document.createElement("script");
    s.defer = true;
    s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: CF_BEACON_TOKEN }));
    (document.head || document.documentElement).appendChild(s);
  }
  injectBeacon();

  // ─────────────────────────────────────────────────────────────────────────
  // Feedback → server-side submission to the public project tracker
  // ─────────────────────────────────────────────────────────────────────────

  var feedbackDialog = null;
  function getFeedbackDialog() {
    if (feedbackDialog) return feedbackDialog;
    feedbackDialog = document.getElementById("feedbackDialog");
    if (!feedbackDialog) return null;

    var form = feedbackDialog.querySelector("#feedbackForm");
    var closeBtn = feedbackDialog.querySelector("#feedbackDialogClose");
    var cancelBtn = feedbackDialog.querySelector("#feedbackCancel");
    var status = feedbackDialog.querySelector("#feedbackStatus");

    function close() {
      try { feedbackDialog.close(); } catch (e) { feedbackDialog.removeAttribute("open"); }
    }

    closeBtn && closeBtn.addEventListener("click", close);
    cancelBtn && cancelBtn.addEventListener("click", close);

    var submitBtn = form && form.querySelector('button[type="submit"]');

    form && form.addEventListener("submit", function (event) {
      event.preventDefault();
      var fields = {
        category: (form.querySelector('input[name="feedbackCategory"]:checked') || {}).value || "other",
        summary: (form.querySelector("#feedbackSummary") || {}).value || "",
        message: (form.querySelector("#feedbackMessage") || {}).value || "",
        website: (form.querySelector("#feedbackWebsite") || {}).value || ""
      };
      track("feedback_submitted", { category: fields.category });

      // The same-origin Worker files the issue with its server-side GitHub credential.
      // The visitor stays in Adtona for both success and retry states.
      if (status) status.textContent = "Sending…";
      if (submitBtn) submitBtn.disabled = true;
      fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: fields.category,
          summary: fields.summary,
          message: fields.message,
          website: fields.website,
          page: location.pathname + location.hash,
          viewport: window.innerWidth + "x" + window.innerHeight,
          version: globalThis.ADTONA_VERSION || globalThis.PLANTOGUIDE_VERSION || "",
          userAgent: navigator.userAgent
        })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
          if (data.ok !== true) throw new Error("Invalid feedback response");
          return data;
        });
      }).then(function (data) {
        if (status) {
          status.textContent = "Thank you — feedback was sent.";
        }
        if (form.reset) form.reset();
        window.setTimeout(close, 1800);
      }).catch(function () {
        track("feedback_submit_failed");
        if (status) {
          status.textContent = "Couldn’t send right now — please check your connection and try again.";
        }
      }).then(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
    });

    return feedbackDialog;
  }

  function openFeedback(source) {
    var dialog = getFeedbackDialog();
    track("feedback_opened", { source: source || "link" });
    if (!dialog) return;
    var status = dialog.querySelector("#feedbackStatus");
    if (status) status.textContent = "";
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }
  window.ptgOpenFeedback = openFeedback;

  // ─────────────────────────────────────────────────────────────────────────
  // Hidden metrics report  (open with #beta-metrics, or press Ctrl/Cmd+Shift+M)
  // ─────────────────────────────────────────────────────────────────────────

  var FUNNEL = [
    ["session_start", "Sessions started"],
    ["splash_continue", "Started planning (splash)"],
    ["step_reached_2", "Reached Adventure (step 2)"],
    ["suggestion_decision", "Swipe decisions made"],
    ["step_reached_4", "Reached Constraints (step 4)"],
    ["trip_generated", "Trips generated"],
    ["export_clicked", "Exports opened"],
    ["feedback_opened", "Feedback opened"]
  ];

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString(); } catch (e) { return String(ts); }
  }

  function renderMetricsReport() {
    if (document.getElementById("ptgMetricsOverlay")) return;
    store = loadStore();

    var overlay = document.createElement("div");
    overlay.id = "ptgMetricsOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Beta metrics report");

    var counts = store.counts || {};
    var funnelRows = FUNNEL.map(function (row) {
      return '<tr><td>' + row[1] + '</td><td class="ptg-num">' + (counts[row[0]] || 0) + "</td></tr>";
    }).join("");

    var otherKeys = Object.keys(counts).sort();
    var otherRows = otherKeys.map(function (k) {
      return '<tr><td>' + escapeText(k) + '</td><td class="ptg-num">' + counts[k] + "</td></tr>";
    }).join("");

    var recent = (store.events || []).slice(-25).reverse().map(function (ev) {
      return '<tr><td>' + fmtDate(ev.t) + '</td><td>' + escapeText(ev.e) + "</td><td>" +
        escapeText(ev.p ? JSON.stringify(ev.p) : "") + "</td></tr>";
    }).join("");

    overlay.innerHTML =
      '<div class="ptg-metrics-card">' +
      '<button class="ptg-metrics-close" type="button" aria-label="Close report">×</button>' +
      "<h2>Adtona — beta metrics</h2>" +
      '<p class="ptg-metrics-note">This report reflects <strong>this browser only</strong>. Aggregate visitor counts across everyone live in your ' +
      '<a href="https://dash.cloudflare.com/?to=/:account/web-analytics" target="_blank" rel="noopener noreferrer">Cloudflare Web Analytics</a> dashboard' +
      (CF_BEACON_TOKEN ? " (beacon active)." : " (beacon not yet configured — paste your token in beta-tools.js).") + "</p>" +
      '<div class="ptg-metrics-stats"><span><b>' + (store.sessions || 0) + "</b>sessions (this browser)</span>" +
      "<span><b>" + (store.events ? store.events.length : 0) + "</b>events logged</span>" +
      "<span><b>" + fmtDate(store.firstSeen) + "</b>first seen</span></div>" +
      "<h3>Funnel</h3><table class=\"ptg-metrics-table\"><tbody>" + funnelRows + "</tbody></table>" +
      "<h3>All counters</h3><table class=\"ptg-metrics-table\"><tbody>" + (otherRows || '<tr><td colspan="2">No events yet.</td></tr>') + "</tbody></table>" +
      "<h3>Recent events</h3><table class=\"ptg-metrics-table ptg-metrics-events\"><tbody>" + (recent || '<tr><td colspan="3">None.</td></tr>') + "</tbody></table>" +
      '<div class="ptg-metrics-actions"><button type="button" class="ptg-metrics-copy">Copy JSON</button>' +
      '<button type="button" class="ptg-metrics-reset">Reset local data</button></div>' +
      "</div>";

    function close() {
      overlay.remove();
      if (location.hash === "#beta-metrics") {
        history.replaceState(null, "", location.pathname + location.search);
      }
    }
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelector(".ptg-metrics-close").addEventListener("click", close);
    overlay.querySelector(".ptg-metrics-copy").addEventListener("click", function () {
      var text = JSON.stringify(store, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
      this.textContent = "Copied";
      var btn = this;
      window.setTimeout(function () { btn.textContent = "Copy JSON"; }, 1200);
    });
    overlay.querySelector(".ptg-metrics-reset").addEventListener("click", function () {
      if (!window.confirm("Clear this browser's local beta metrics? (Cloudflare data is unaffected.)")) return;
      try { localStorage.removeItem(METRICS_KEY); } catch (e) {}
      store = loadStore();
      close();
    });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape" && document.getElementById("ptgMetricsOverlay")) { close(); document.removeEventListener("keydown", esc); }
    });

    document.body.appendChild(overlay);
  }

  function escapeText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function maybeOpenReportFromHash() {
    if (location.hash === "#beta-metrics") renderMetricsReport();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Wiring: feedback links + lightweight interaction tracking (delegated)
  // ─────────────────────────────────────────────────────────────────────────

  function onReady() {
    // Intercept every feedback entry point → open the in-app form.
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest(".feedback-link, .feedback-header-link, [data-open-feedback]");
      if (link) {
        event.preventDefault();
        openFeedback(link.classList.contains("feedback-header-link") ? "header" : "footer");
        return;
      }
    });

    // Delegated milestone tracking that needs no changes inside app.js.
    document.addEventListener("click", function (event) {
      var t = event.target;
      var nav = t.closest && t.closest(".app-nav-button");
      if (nav && nav.dataset.tab) { track("tab_view", { tab: nav.dataset.tab }); return; }
      var el = t.closest && t.closest("#startSplashContinue,#nextStepButton,#createTripButton,#exportTripButton,#heroExportTripButton");
      if (!el) return;
      if (el.id === "startSplashContinue") track("splash_continue");
      else if (el.id === "nextStepButton") track("step_next", { from: 1 });
      else if (el.id === "createTripButton") track("create_trip_clicked");
      else track("export_clicked");
    });

    maybeOpenReportFromHash();
    window.addEventListener("hashchange", maybeOpenReportFromHash);
    document.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "M" || event.key === "m")) {
        event.preventDefault();
        renderMetricsReport();
      }
    });

    track("app_load");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
