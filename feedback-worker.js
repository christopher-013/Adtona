/**
 * Adtona feedback API + static asset Worker.
 *
 * The browser posts to the same-origin /api/feedback route. This Worker keeps the
 * GitHub credential in the encrypted GITHUB_TOKEN secret and creates the public
 * issue on the reporter's behalf. Every non-API request passes through to the
 * Cloudflare static-assets binding.
 */

const API_PATH = "/api/feedback";
/**
 * Anonymous completion counter. It answers one question — did a real person
 * finish a trip today — because the site keeps no visitor logs and nothing else
 * can tell you whether it is used.
 */
const PING_PATH = "/api/ping";
/**
 * The events accepted. Anything else is discarded without comment.
 *
 * Three separate tallies, never joined: nothing links an `open` to the `trip`
 * that may have followed it, because no request carries anything to join on.
 * `trip` still requires a multi-step workflow completed by hand; `open` counts
 * more automated traffic precisely because it asks nothing of the visitor.
 */
const PING_EVENTS = new Set(["trip", "export", "open"]);
/** Ordered for display: the funnel reads open, then trip, then export. */
const REPORTED_EVENTS = ["open", "trip", "export"];
const EVENT_LABELS = { open: "Sessions", trip: "Trips", export: "Exports" };
/** A ping is one short field; anything larger is not one. */
const MAX_PING_BYTES = 256;
/** Roughly 13 months, so a year-over-year read still has something to show. */
const COUNT_TTL_SECONDS = 400 * 24 * 60 * 60;
const USAGE_ISSUE_TITLE = "Adtona usage log";
const USAGE_ISSUE_KEY = "usage:issue";
/**
 * Lifetime figures, kept without a TTL: the daily keys expire, these must not.
 *
 * `first`, `best` and `active` exist because they cannot be derived from a
 * bounded window — a best day in 2026 is still the best day in 2027, and an
 * average per active day needs every active day, not the last thirty.
 */
const totalKey = (event) => `count:total:${event}`;
const firstDayKey = (event) => `stats:first:${event}`;
const bestDayKey = (event) => `stats:best:${event}`;
const activeDaysKey = (event) => `stats:active:${event}`;
/** How far back the rolling windows look. Also caps the streak search. */
const WINDOW_DAYS = 30;
/** The issue is rewritten as trips arrive, so writes are throttled to one a minute. */
const ISSUE_SYNC_KEY = "usage:issue-synced";
const ISSUE_SYNC_MIN_MS = 60000;
/**
 * Automated clients that announce themselves. This is a courtesy filter, not a
 * security control — the real defence is that a ping is only sent after someone
 * completes a multi-step workflow that needs typing, choosing and swiping. The
 * agent string is matched and discarded; it is never stored.
 */
const BOT_AGENT_PATTERN = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|lighthouse|curl|wget|python-requests|axios|monitor|preview|scanner/i;
const DEFAULT_REPO = "christopher-013/Adtona";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://adtona.com",
  "https://www.adtona.com",
  "https://adtona.cch13.workers.dev",
  "http://127.0.0.1:8767",
  "http://localhost:8767"
];

const MAX_BODY_BYTES = 16 * 1024;
const MAX_SUMMARY = 140;
const MAX_MESSAGE = 4000;
const MAX_PAGE = 300;
const MAX_VIEWPORT = 40;
const MAX_VERSION = 40;
const MAX_USER_AGENT = 400;
const UNSAFE_FEEDBACK_ERROR = "Feedback contains content that cannot be submitted.";
const CATEGORIES = ["bug", "idea", "praise", "other"];
const CATEGORY_LABELS = {
  bug: ["bug"],
  idea: ["enhancement"],
  praise: [],
  other: []
};

export default {
  /** Cron entry point: files the previous day count as a comment on the usage log. */
  async scheduled(event, env, ctx) {
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(postDailyDigest(env));
    else await postDailyDigest(env);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === PING_PATH) return handlePing(request, env, ctx);
    if (url.pathname !== API_PATH) {
      const redirect = canonicalRedirect(url, request.method);
      if (redirect) return redirect;
      if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(request);
      }
      return new Response("Not found", { status: 404 });
    }

    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const origin = request.headers.get("Origin") || "";
    const originAllowed = allowedOrigins.includes(origin);
    const cors = corsHeaders(originAllowed ? origin : "");

    if (request.method === "OPTIONS") {
      if (!originAllowed) {
        return json({ ok: false, error: "Origin not allowed" }, 403, cors);
      }
      return new Response(null, { status: 204, headers: cors });
    }
    if (!originAllowed) {
      return json({ ok: false, error: "Origin not allowed" }, 403, cors);
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, cors);
    }

    const mediaType = (request.headers.get("Content-Type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== "application/json") {
      return json({ ok: false, error: "Content-Type must be application/json" }, 415, cors);
    }

    const declaredLength = Number.parseInt(request.headers.get("Content-Length") || "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: "Feedback is too large" }, 413, cors);
    }

    let rawBody;
    try {
      rawBody = await request.text();
    } catch {
      return json({ ok: false, error: "Could not read request body" }, 400, cors);
    }
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: "Feedback is too large" }, 413, cors);
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400, cors);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ ok: false, error: "Invalid feedback payload" }, 400, cors);
    }

    // Quietly accept bot submissions that fill the hidden field. Do this before
    // checking the GitHub secret so the trap behaves consistently in every environment.
    if (String(payload.website || "").trim()) {
      return json({ ok: true, number: null }, 201, cors);
    }

    const fieldsToValidate = [
      ["summary", payload.summary, MAX_SUMMARY, true],
      ["message", payload.message, MAX_MESSAGE, false],
      ["page", payload.page || "—", MAX_PAGE, true],
      ["viewport", payload.viewport || "—", MAX_VIEWPORT, true],
      ["version", payload.version || "—", MAX_VERSION, true],
      ["userAgent", payload.userAgent || "—", MAX_USER_AGENT, true]
    ];
    if (fieldsToValidate.some(([, value, maxLength, singleLine]) =>
      !isSafeFeedbackText(value, { maxLength, singleLine })
    )) {
      return json({ ok: false, error: UNSAFE_FEEDBACK_ERROR }, 400, cors);
    }

    const summary = sanitizeUserText(payload.summary, MAX_SUMMARY, true);
    if (!summary) {
      return json({ ok: false, error: "A summary is required." }, 400, cors);
    }

    if (env.FEEDBACK_RATE_LIMITER && typeof env.FEEDBACK_RATE_LIMITER.limit === "function") {
      const clientKey = request.headers.get("CF-Connecting-IP") || "unknown-client";
      let rateLimitResult;
      try {
        rateLimitResult = await env.FEEDBACK_RATE_LIMITER.limit({ key: clientKey });
      } catch {
        return json(
          { ok: false, error: "Feedback service is temporarily unavailable." },
          503,
          cors
        );
      }
      if (!rateLimitResult?.success) {
        return json(
          { ok: false, error: "Too many feedback submissions. Please try again shortly." },
          429,
          { ...cors, "Retry-After": "60" }
        );
      }
    }

    if (!env.GITHUB_TOKEN) {
      return json(
        { ok: false, error: "Feedback service is temporarily unavailable." },
        500,
        cors
      );
    }

    const category = CATEGORIES.includes(payload.category) ? payload.category : "other";
    const typeLabel = {
      bug: "Bug",
      idea: "Idea",
      praise: "Praise",
      other: "Feedback"
    }[category];
    const message = sanitizeUserText(payload.message, MAX_MESSAGE, false);
    const page = sanitizeUserText(payload.page || "—", MAX_PAGE, true);
    const viewport = sanitizeUserText(payload.viewport || "—", MAX_VIEWPORT, true);
    const version = sanitizeUserText(payload.version || "—", MAX_VERSION, true);
    const userAgent = sanitizeUserText(payload.userAgent || "—", MAX_USER_AGENT, true);

    const issueTitle = `[${typeLabel}] ${summary}`;
    const issueBody = [
      `**Type:** ${typeLabel}`,
      "",
      message || "_(no description provided)_",
      "",
      "---",
      `**Page:** ${page}`,
      `**Viewport:** ${viewport}`,
      `**Version:** ${version}`,
      `**User agent:** ${userAgent}`,
      "",
      "_Filed automatically from the Adtona in-app beta feedback form._"
    ].join("\n");

    const repo = String(env.GITHUB_REPO || DEFAULT_REPO).trim() || DEFAULT_REPO;
    let githubResponse;
    try {
      githubResponse = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "Adtona-Feedback-Worker"
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: CATEGORY_LABELS[category]
        })
      });
    } catch {
      console.error("GitHub feedback issue request failed");
      return json(
        { ok: false, error: "Feedback could not be submitted right now." },
        502,
        cors
      );
    }

    if (!githubResponse.ok) {
      console.error("GitHub feedback issue creation failed", {
        status: githubResponse.status
      });
      return json(
        { ok: false, error: "Feedback could not be submitted right now." },
        502,
        cors
      );
    }

    const issue = await githubResponse.json().catch(() => ({}));
    return json({
      ok: true,
      number: Number.isFinite(issue.number) ? issue.number : null
    }, 201, cors);
  }
};

function parseAllowedOrigins(value) {
  if (!value) return DEFAULT_ALLOWED_ORIGINS;
  const configured = String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(allowedOrigin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
  if (allowedOrigin) headers["Access-Control-Allow-Origin"] = allowedOrigin;
  return headers;
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function sanitizeUserText(value, maxLength, singleLine) {
  let text = String(value == null ? "" : value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/@/g, "＠")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (singleLine) text = text.replace(/\s+/g, " ");
  text = text.trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function isSafeFeedbackText(value, { maxLength, singleLine }) {
  const raw = String(value == null ? "" : value);
  if (raw.length > maxLength) return false;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(raw)) {
    return false;
  }
  if (singleLine && /[\r\n]/u.test(raw)) return false;

  const text = canonicalizeForDetection(raw);
  if (!text) return true;

  // Reject executable markup and URI payloads while still allowing useful bug
  // report snippets such as CSS selectors, route.js, and ordinary punctuation.
  if (/<\s*\/?\s*(?:script|iframe|img|svg|object|embed|link|meta|style|form|input|button|video|audio|source|base|math)\b/iu.test(text)) {
    return false;
  }
  if (/\bon[a-z]{2,30}\s*=/iu.test(text)) return false;
  if (/\b(?:javascript|vbscript)\s*:/iu.test(text)) return false;
  if (/\bdata\s*:\s*(?:text\/html|image\/svg\+xml|application\/(?:javascript|xhtml\+xml))/iu.test(text)) {
    return false;
  }
  if (containsLinkOrContact(text)) return false;
  if (containsProfanity(text)) return false;
  return true;
}

function canonicalizeForDetection(value) {
  let text = String(value || "").normalize("NFKC");
  for (let pass = 0; pass < 2; pass += 1) {
    text = text
      .replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));?/giu, (_, hex, decimal) => {
        const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
        try { return String.fromCodePoint(codePoint); } catch { return ""; }
      })
      .replace(/&(?:colon|period|sol|commat|lpar|rpar);?/giu, (entity) => ({
        "&colon;": ":", "&colon": ":", "&period;": ".", "&period": ".",
        "&sol;": "/", "&sol": "/", "&commat;": "@", "&commat": "@",
        "&lpar;": "(", "&lpar": "(", "&rpar;": ")", "&rpar": ")"
      })[entity.toLowerCase()] || entity);
    try { text = decodeURIComponent(text); } catch { /* keep malformed escapes */ }
  }
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200F\u2060\uFEFF]/gu, "")
    .replace(/[\u3002\uFF0E\uFF61]/gu, ".")
    .replace(/[\u2215\u2044\uFF0F]/gu, "/")
    .replace(/\bhxxps?\b/giu, "http")
    .replace(/\b(https?)\s*(?:colon|:)\s*(?:slash|\/)\s*(?:slash|\/)/giu, "$1://")
    .replace(/\[\s*(?:dot|\.)\s*\]|\(\s*(?:dot|\.)\s*\)/giu, ".")
    .replace(/\s+dot\s+/giu, ".")
    .replace(/\s+colon\s+/giu, ":")
    .replace(/\s+slash\s+/giu, "/");
}

function containsLinkOrContact(text) {
  if (/!?\[[^\]\r\n]{0,300}\]\s*\([^)\r\n]{1,500}\)/u.test(text)) return true;
  if (/\b(?:https?|ftp|ftps|file):\s*\/\//iu.test(text)) return true;
  if (/\bwww\s*\./iu.test(text)) return true;
  if (/(?:^|[^\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}.-]+\.[\p{L}]{2,24}(?=$|[^\p{L}\p{N}_-])/iu.test(text)) {
    return true;
  }
  if (/(?:^|[\s(])(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?=$|[\s/:),])/iu.test(text)) return true;

  // This curated public-suffix list catches links without treating filenames
  // such as route.js and photo.jpg as domains.
  const publicSuffix = "(?:com|org|net|edu|gov|mil|io|co|uk|ca|au|de|fr|it|es|jp|cn|in|ph|nz|sg|eu|ch|nl|se|no|dk|fi|be|at|ie|pt|gr|pl|cz|sk|hu|ro|bg|hr|rs|ua|ru|tr|il|ae|sa|za|eg|ma|ke|ng|gh|br|ar|cl|pe|mx|cr|pa|hk|tw|kr|th|vn|id|my|travel|app|dev|me|us|info|biz|xyz|online|site|store|tech|ai|cloud|ly|tv|museum|name|mobi|pro)";
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_-])(?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?\\.)+${publicSuffix}(?=$|[^\\p{L}\\p{N}_-])`,
    "iu"
  ).test(text);
}

function containsProfanity(text) {
  const normalized = text
    .replace(/[@4]/gu, "a")
    .replace(/3/gu, "e")
    .replace(/[!1|]/gu, "i")
    .replace(/0/gu, "o")
    .replace(/[$5]/gu, "s")
    .replace(/7/gu, "t");
  const blockedWords = [
    "fuck", "fucking", "motherfucker", "shit", "bullshit", "bitch", "asshole",
    "bastard", "cunt", "dick", "pussy", "whore", "slut", "nigger", "nigga",
    "faggot", "retard"
  ];
  return blockedWords.some((word) => {
    const letters = [...word].map((letter) => escapeRegExp(letter)).join("[\\s._-]*");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${letters}(?=$|[^\\p{L}\\p{N}])`, "iu").test(normalized);
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Records one completed trip.
 *
 * Stores a date and a number, nothing else. There is no identifier, cookie,
 * user agent or IP retention — the client address is used as a rate-limit key
 * and is never written down. Always answers 204, so a caller learns nothing
 * from probing it and the browser has nothing to wait on.
 */
async function handlePing(request, env, ctx) {
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const origin = request.headers.get("Origin") || "";
  const originAllowed = allowed.includes(origin);
  const cors = corsHeaders(originAllowed ? origin : "");

  if (request.method === "OPTIONS") {
    return originAllowed
      ? new Response(null, { status: 204, headers: cors })
      : json({ ok: false, error: "Origin not allowed" }, 403, cors);
  }
  if (!originAllowed) return json({ ok: false, error: "Origin not allowed" }, 403, cors);
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, cors);

  // Declared oversize bodies are dropped before they are read.
  const declared = Number.parseInt(request.headers.get("Content-Length") || "", 10);
  if (Number.isFinite(declared) && declared > MAX_PING_BYTES) {
    return new Response(null, { status: 204, headers: cors });
  }

  // Self-identifying automation is not a person finishing a trip.
  if (BOT_AGENT_PATTERN.test(request.headers.get("User-Agent") || "")) {
    return new Response(null, { status: 204, headers: cors });
  }

  let payload;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PING_BYTES) {
      return new Response(null, { status: 204, headers: cors });
    }
    payload = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 204, headers: cors });
  }
  const event = payload && typeof payload === "object" ? payload.event : null;
  if (!PING_EVENTS.has(event)) return new Response(null, { status: 204, headers: cors });

  // A counter without a throttle is a counter anyone can inflate at will. A
  // distinct key prefix keeps counting from consuming somebody's feedback budget.
  const limiter = env.FEEDBACK_RATE_LIMITER;
  if (typeof limiter?.limit !== "function") {
    console.error("Usage counter is missing its rate limiter binding");
    return new Response(null, { status: 204, headers: cors });
  }
  const client = request.headers.get("CF-Connecting-IP") || "unknown";
  try {
    if (!(await limiter.limit({ key: `ping:${client}` })).success) {
      return new Response(null, { status: 204, headers: cors });
    }
  } catch {
    return new Response(null, { status: 204, headers: cors });
  }

  const counts = env.USAGE_COUNTS;
  if (!counts || typeof counts.get !== "function") {
    console.error("Usage counter is missing its KV binding");
    return new Response(null, { status: 204, headers: cors });
  }

  // Read-modify-write is not atomic in KV, so simultaneous pings can lose one.
  // That is the right trade here: the question is whether people finish trips,
  // not the exact number, and the alternative — a row per event — would store
  // strictly more about visitors.
  const day = new Date().toISOString().slice(0, 10);
  let recorded = null;
  try {
    const dayKey = `count:${day}:${event}`;
    const current = readInt(await counts.get(dayKey));
    const next = current + 1;
    await counts.put(dayKey, String(next), { expirationTtl: COUNT_TTL_SECONDS });

    const nextTotal = readInt(await counts.get(totalKey(event))) + 1;
    await counts.put(totalKey(event), String(nextTotal));

    // A day becoming active is the only moment these can change, so they are
    // maintained here rather than recounted from history that expires.
    if (current === 0) {
      await counts.put(activeDaysKey(event), String(readInt(await counts.get(activeDaysKey(event))) + 1));
      if (!(await counts.get(firstDayKey(event)))) await counts.put(firstDayKey(event), day);
    }
    const best = parseBest(await counts.get(bestDayKey(event)));
    if (next > best.count) await counts.put(bestDayKey(event), `${day}:${next}`);

    // KV is eventually consistent, so the publisher below can read back the
    // values from before these writes. Hand it what was actually written and
    // let it take the larger of the two, which can never under-report.
    recorded = { event, day, count: next, total: nextTotal };
  } catch (error) {
    console.error("Usage counter could not record a ping", { message: String(error?.message || "") });
  }

  // Publish after responding: the traveler's guide is already built, and
  // nothing they see should wait on GitHub.
  if (recorded && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(
      syncUsageIssue(env, counts, recorded).then(() => syncDailyComment(env, counts, day))
    );
  }
  return new Response(null, { status: 204, headers: cors });
}

/**
 * Keeps a single issue's body showing the current totals.
 *
 * It publishes a date and two numbers, because a date and two numbers are all
 * that is stored. Throttled so a burst of trips cannot become a burst of
 * GitHub writes.
 */
async function syncUsageIssue(env, counts, fresh) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return;
  try {
    const lastSynced = Number.parseInt((await counts.get(ISSUE_SYNC_KEY)) || "0", 10);
    if (Number.isFinite(lastSynced) && Date.now() - lastSynced < ISSUE_SYNC_MIN_MS) return;
    await counts.put(ISSUE_SYNC_KEY, String(Date.now()));

    const day = new Date().toISOString().slice(0, 10);
    const stats = [];
    for (const name of REPORTED_EVENTS) stats.push(await eventStats(counts, name, day, fresh));
    const body = usageIssueBody(stats, day);

    const headers = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "adtona-usage-log"
    };
    // redirect: "manual" throughout — GitHub answers a renamed repository with a
    // 301, and a followed redirect turns a POST into a GET, which would report
    // success without writing anything.
    const known = await counts.get(USAGE_ISSUE_KEY);
    if (known) {
      await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues/${known}`, {
        method: "PATCH", headers, redirect: "manual", body: JSON.stringify({ body })
      });
      return;
    }
    const created = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: "POST", headers, redirect: "manual",
      body: JSON.stringify({ title: USAGE_ISSUE_TITLE, body })
    });
    if (!created.ok) {
      console.error("Usage log issue could not be created", { status: created.status });
      return;
    }
    const issue = await created.json();
    if (issue?.number) await counts.put(USAGE_ISSUE_KEY, String(issue.number));
  } catch (error) {
    console.error("Usage log issue could not be updated", { message: String(error?.message || "") });
  }
}

/**
 * Posts one comment a day carrying the previous day's count.
 *
 * The issue body shows the live total, but a body that is rewritten keeps no
 * history — these comments are the day-by-day record you read down the issue.
 * Days with no trips are skipped, so the log carries only real signal.
 */
const DIGEST_POSTED_KEY = "usage:digest-posted";

async function postDailyDigest(env) {
  const counts = env.USAGE_COUNTS;
  if (!counts || typeof counts.get !== "function") {
    console.error("Daily digest is missing its KV binding");
    return;
  }
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    // A cron that fires twice must not file the same day twice.
    if ((await counts.get(DIGEST_POSTED_KEY)) === yesterday) return;
    // Trips normally file their day comment as they happen, so the cron is only a
    // backstop for a day whose live writes never landed.
    if (await counts.get(`${DAY_COMMENT_PREFIX}${yesterday}`)) {
      await counts.put(DIGEST_POSTED_KEY, yesterday);
      return;
    }

    const stats = [];
    for (const name of REPORTED_EVENTS) stats.push(await eventStats(counts, name, yesterday, null));
    if (stats.every((s) => s.today === 0)) {
      // Nothing happened; record the day as handled so it is not reconsidered.
      await counts.put(DIGEST_POSTED_KEY, yesterday);
      return;
    }

    // The issue is created by the first ping; if it is somehow absent, make it now.
    let issue = await counts.get(USAGE_ISSUE_KEY);
    if (!issue) {
      await syncUsageIssue(env, counts);
      issue = await counts.get(USAGE_ISSUE_KEY);
      if (!issue) return;
    }

    const body = `**${yesterday} (UTC)** — ${dailySummary(stats)}`;
    const response = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/issues/${issue}/comments`,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "adtona-usage-log"
        },
        body: JSON.stringify({ body })
      }
    );
    if (!response.ok) {
      console.error("Daily digest could not be posted", { status: response.status });
      return;
    }
    await counts.put(DIGEST_POSTED_KEY, yesterday);
  } catch (error) {
    console.error("Daily digest failed", { message: String(error?.message || "") });
  }
}


/**
 * Sends the alternate hostnames to the canonical one.
 *
 * The same build is served from www, the workers.dev subdomain and the canonical
 * apex, so a crawler finds three copies of every page. The canonical tag already
 * tells Google which to keep — that is why Search Console reports the others as
 * "Alternate page with proper canonical tag", which is the tag working — but a
 * redirect is stronger: the duplicates stop being crawled at all and their
 * ranking signals consolidate onto one URL.
 *
 * Only safe, idempotent document requests are redirected. The API is left alone
 * so it keeps answering on every allowed origin, and a 301 on a POST would be
 * rewritten to a GET by the client.
 */
const CANONICAL_HOST = "adtona.com";
const REDIRECTING_HOSTS = new Set(["www.adtona.com", "adtona.cch13.workers.dev"]);

function canonicalRedirect(url, method) {
  if (method !== "GET" && method !== "HEAD") return null;
  if (!REDIRECTING_HOSTS.has(url.hostname)) return null;
  if (url.pathname.startsWith("/api/")) return null;
  const target = new URL(url.toString());
  target.protocol = "https:";
  target.hostname = CANONICAL_HOST;
  target.port = "";
  return Response.redirect(target.toString(), 301);
}

/**
 * Creates the day's log comment on its first trip, then keeps that same comment
 * current as more arrive.
 *
 * Waiting for the cron meant a day's first trip was invisible until the next
 * morning. Creating the comment immediately makes the log live; updating one
 * comment per day rather than filing one per trip keeps the history readable
 * however busy a day gets.
 */
const DAY_COMMENT_PREFIX = "usage:comment:";
const DAY_COMMENT_SYNC_PREFIX = "usage:comment-synced:";

/**
 * Renders the board.
 *
 * Every column is either a stored counter or arithmetic on stored counters.
 * Nothing here needed a new fact about a visitor to be collected, which is why
 * the privacy promise reads the same after this table as it did before it.
 */
function usageIssueBody(stats, day) {
  const trips = stats.find((s) => s.event === "trip") ?? stats[0];
  const rows = stats.map((s) =>
    `| ${EVENT_LABELS[s.event]} | ${s.total} | ${s.today} | ${s.last7} | ${s.last30} | ` +
    `${s.activeDays} | ${s.perActiveDay} | ${s.bestDay ? `${s.bestCount} on ${s.bestDay}` : "—"} |`);

  return [
    "Anonymous counts. No identifiers, cookies, user agents or IP addresses are",
    "stored — only daily totals, and every other column here is arithmetic on",
    "those totals. The three counts are never joined to one another.",
    "",
    `**Total trips generated:** ${trips.total}`,
    `**Today (${day} UTC):** ${trips.today}`,
    "",
    "| | Total | Today | 7 days | 30 days | Active days | Avg/active day | Best day |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows,
    "",
    `Active ${trips.activeDays} day${trips.activeDays === 1 ? "" : "s"} since ` +
      `${trips.firstDay || "—"}${trips.streak > 0 ? `, currently ${trips.streak} day${trips.streak === 1 ? "" : "s"} running` : ""}.`,
    "",
    `_Updated ${new Date().toISOString()}_`
  ].join("\n");
}

/** One line summarising a day across all three counters. */
function dailySummary(stats) {
  const parts = stats
    .filter((s) => s.today > 0)
    .map((s) => `${s.today} ${EVENT_LABELS[s.event].toLowerCase()}`);
  const trips = stats.find((s) => s.event === "trip");
  return `${parts.join(", ") || "no activity"}. Running total: ${trips ? trips.total : 0} trips.`;
}

/**
 * Everything known about one counter, from the stored figures plus a bounded
 * window of daily keys. `fresh` is what the caller has just written; taking the
 * larger of the two survives KV's eventual consistency without over-reporting.
 */
async function eventStats(counts, event, day, fresh) {
  const override = fresh && fresh.event === event ? fresh : null;
  const read = async (key) => readInt(await counts.get(key).catch(() => null));

  let total = await read(totalKey(event));
  if (override) total = Math.max(total, override.total);

  const days = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const on = new Date(Date.parse(`${day}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
    let value = await read(`count:${on}:${event}`);
    if (override && override.day === on) value = Math.max(value, override.count);
    days.push(value);
  }

  const last7 = days.slice(0, 7).reduce((a, b) => a + b, 0);
  const last30 = days.reduce((a, b) => a + b, 0);
  // A lifetime figure cannot be smaller than a window inside it, which it can
  // look like when counting predates the lifetime key.
  total = Math.max(total, last30);

  // Counted backwards from the given day, stopping at the first blank one. That
  // day being blank is not a broken streak yet, so the search starts a day back.
  let streak = 0;
  for (let i = days[0] > 0 ? 0 : 1; i < days.length; i++) {
    if (days[i] <= 0) break;
    streak++;
  }

  const activeDays = Math.max(await read(activeDaysKey(event)), days.filter((d) => d > 0).length);
  const best = parseBest(await counts.get(bestDayKey(event)).catch(() => null));
  if (override && override.count > best.count) {
    best.count = override.count;
    best.day = override.day;
  }

  return {
    event,
    total,
    today: days[0],
    last7,
    last30,
    activeDays,
    streak,
    perActiveDay: activeDays > 0 ? (total / activeDays).toFixed(1) : "0.0",
    bestDay: best.day,
    bestCount: best.count,
    firstDay: (await counts.get(firstDayKey(event)).catch(() => null)) || ""
  };
}

function readInt(value) {
  const parsed = Number.parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Stored as `YYYY-MM-DD:count`, so a single key carries both halves. */
function parseBest(value) {
  const [day, count] = String(value || "").split(":");
  return { day: day || "", count: readInt(count) };
}

async function syncDailyComment(env, counts, day) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return;
  try {
    const commentKey = `${DAY_COMMENT_PREFIX}${day}`;
    const existing = await counts.get(commentKey);

    // Updates are throttled; the first trip of a day is never throttled, because
    // that is the write which makes the day appear at all.
    if (existing) {
      const syncKey = `${DAY_COMMENT_SYNC_PREFIX}${day}`;
      const last = Number.parseInt((await counts.get(syncKey)) || "0", 10);
      if (Number.isFinite(last) && Date.now() - last < ISSUE_SYNC_MIN_MS) return;
      await counts.put(syncKey, String(Date.now()), { expirationTtl: COUNT_TTL_SECONDS });
    }

    const issue = await counts.get(USAGE_ISSUE_KEY);
    if (!issue) return; // the body sync creates it; the next ping will find it

    const stats = [];
    for (const name of REPORTED_EVENTS) stats.push(await eventStats(counts, name, day, null));
    const body = `**${day} (UTC)** — ${dailySummary(stats)}`;

    const headers = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "adtona-usage-log"
    };
    const repo = env.GITHUB_REPO;
    if (existing) {
      await fetch(`https://api.github.com/repos/${repo}/issues/comments/${existing}`, {
        method: "PATCH", headers, redirect: "manual", body: JSON.stringify({ body })
      });
      return;
    }
    const created = await fetch(`https://api.github.com/repos/${repo}/issues/${issue}/comments`, {
      method: "POST", headers, redirect: "manual", body: JSON.stringify({ body })
    });
    if (!created.ok) {
      console.error("Daily comment could not be created", { status: created.status });
      return;
    }
    const comment = await created.json();
    if (comment?.id) {
      await counts.put(commentKey, String(comment.id), { expirationTtl: COUNT_TTL_SECONDS });
      await counts.put(`${DAY_COMMENT_SYNC_PREFIX}${day}`, String(Date.now()), { expirationTtl: COUNT_TTL_SECONDS });
    }
  } catch (error) {
    console.error("Daily comment failed", { message: String(error?.message || "") });
  }
}
