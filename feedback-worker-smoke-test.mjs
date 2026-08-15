// Contract smoke test for the integrated Cloudflare feedback Worker.
//
// This is intentionally network-free: GitHub and the static ASSETS binding are
// mocked so CI can verify routing, validation, privacy, and error handling without
// creating real issues or requiring a secret.
import assert from "node:assert/strict";
import worker from "./feedback-worker.js";

const API_URL = "https://adtona.com/api/feedback";
const ALLOWED_ORIGIN = "https://adtona.com";
const DISALLOWED_ORIGIN = "https://attacker.example";
const GITHUB_ISSUES_URL = "https://api.github.com/repos/christopher-013/Adtona/issues";
const MAX_BODY_BYTES = 16 * 1024;

let checks = 0;
const pass = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

const jsonRequest = (payload, {
  method = "POST",
  origin = ALLOWED_ORIGIN,
  contentType = "application/json",
  headers = {}
} = {}) => new Request(API_URL, {
  method,
  headers: {
    ...(origin == null ? {} : { Origin: origin }),
    ...(contentType == null ? {} : { "Content-Type": contentType }),
    ...headers
  },
  body: method === "GET" || method === "HEAD"
    ? undefined
    : (typeof payload === "string" ? payload : JSON.stringify(payload))
});

const validPayload = (overrides = {}) => ({
  category: "bug",
  summary: "Map route does not load",
  message: "The route preview stays blank after selecting Tuesday.",
  page: "/#maps",
  viewport: "390x844",
  version: "5.1.9",
  userAgent: "Adtona feedback smoke test",
  website: "",
  ...overrides
});

const responseJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    assert.fail(`Expected JSON response, received: ${text.slice(0, 160)}`);
  }
};

const expectUnsafeFeedback = async (overrides, label) => {
  const originalFetch = globalThis.fetch;
  let githubCalled = false;
  globalThis.fetch = async () => {
    githubCalled = true;
    return new Response("unexpected", { status: 500 });
  };
  try {
    const response = await worker.fetch(jsonRequest(validPayload(overrides)), baseEnv);
    pass(response.status === 400, `${label} must be rejected with 400`);
    const body = await responseJson(response);
    pass(
      body.error === "Feedback contains content that cannot be submitted.",
      `${label} must receive the generic unsafe-content response`
    );
    pass(!githubCalled, `${label} must be rejected before GitHub is called`);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const assetCalls = [];
const baseEnv = {
  GITHUB_TOKEN: "smoke-test-token",
  ASSETS: {
    fetch: async (request) => {
      assetCalls.push(new URL(request.url).pathname);
      return new Response(`asset:${new URL(request.url).pathname}`, {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    }
  }
};

// Non-API routes remain static-site routes, while only the exact feedback path is
// intercepted by the Worker.
{
  const response = await worker.fetch(new Request("https://adtona.com/styles.css"), baseEnv);
  pass(response.status === 200, "static assets must pass through to env.ASSETS");
  pass(await response.text() === "asset:/styles.css", "static asset response must be returned unchanged");

  const nearMatch = await worker.fetch(
    new Request("https://adtona.com/api/feedback-extra"),
    baseEnv
  );
  pass(nearMatch.status === 200, "non-exact feedback paths must pass through to env.ASSETS");
  pass(assetCalls.includes("/api/feedback-extra"), "near-match route must reach the ASSETS binding");
}

// CORS preflight is accepted only for configured origins.
{
  const allowed = await worker.fetch(new Request(API_URL, {
    method: "OPTIONS",
    headers: {
      Origin: ALLOWED_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  }), baseEnv);
  pass(allowed.status === 204, "allowed feedback preflight must return 204");
  pass(
    allowed.headers.get("Access-Control-Allow-Origin") === ALLOWED_ORIGIN,
    "allowed preflight must echo the allowed origin"
  );
  pass(
    /\bPOST\b/.test(allowed.headers.get("Access-Control-Allow-Methods") || ""),
    "allowed preflight must advertise POST"
  );

  const disallowed = await worker.fetch(new Request(API_URL, {
    method: "OPTIONS",
    headers: {
      Origin: DISALLOWED_ORIGIN,
      "Access-Control-Request-Method": "POST"
    }
  }), baseEnv);
  pass(disallowed.status === 403, "disallowed feedback preflight must return 403");
  pass(
    disallowed.headers.get("Access-Control-Allow-Origin") !== DISALLOWED_ORIGIN,
    "disallowed preflight must not grant the attacker origin"
  );
}

// The exact API route supports only POST and OPTIONS.
{
  const response = await worker.fetch(jsonRequest(null, { method: "GET" }), baseEnv);
  pass(response.status === 405, "GET /api/feedback must return 405");
  pass(!assetCalls.includes("/api/feedback"), "wrong API methods must not fall through to static assets");
}

// Origin is required even for otherwise valid payloads.
for (const origin of [DISALLOWED_ORIGIN, null]) {
  const response = await worker.fetch(jsonRequest(validPayload(), { origin }), baseEnv);
  pass(response.status === 403, `${origin || "missing"} origin must be rejected`);
}

// Only JSON is accepted.
for (const contentType of ["text/plain", "application/x-www-form-urlencoded", null]) {
  const response = await worker.fetch(jsonRequest(validPayload(), { contentType }), baseEnv);
  pass(response.status === 415, `${contentType || "missing"} content type must be rejected`);
}
{
  const response = await worker.fetch(
    jsonRequest(validPayload(), { contentType: "application/json; charset=utf-8" }),
    {
      ...baseEnv,
      GITHUB_TOKEN: ""
    }
  );
  pass(response.status === 500, "application/json with a charset must pass media-type validation");
}

// Reject the request before parsing when its UTF-8 representation exceeds 16 KiB.
{
  const oversized = JSON.stringify(validPayload({
    message: "x".repeat(MAX_BODY_BYTES)
  }));
  pass(
    new TextEncoder().encode(oversized).byteLength > MAX_BODY_BYTES,
    "test fixture must exceed the configured byte limit"
  );
  const response = await worker.fetch(jsonRequest(oversized), baseEnv);
  pass(response.status === 413, "feedback bodies over 16 KiB must return 413");
}

// Malformed JSON and blank summaries are clear client errors.
{
  const malformed = await worker.fetch(jsonRequest('{"summary":'), baseEnv);
  pass(malformed.status === 400, "malformed JSON must return 400");

  const blank = await worker.fetch(jsonRequest(validPayload({ summary: " \t\r\n " })), baseEnv);
  pass(blank.status === 400, "blank feedback summary must return 400");
}

// A real submission cannot proceed without the server-side GitHub secret.
{
  const response = await worker.fetch(jsonRequest(validPayload()), {
    ...baseEnv,
    GITHUB_TOKEN: ""
  });
  pass(response.status === 500, "missing GITHUB_TOKEN must return 500");
  const body = await responseJson(response);
  pass(body.ok === false, "missing-token response must not claim success");
}

// The production rate-limiting binding rejects bursts before they can consume
// GitHub API capacity.
{
  let receivedKey = "";
  const response = await worker.fetch(
    jsonRequest(validPayload(), {
      headers: { "CF-Connecting-IP": "203.0.113.9" }
    }),
    {
      ...baseEnv,
      FEEDBACK_RATE_LIMITER: {
        limit: async ({ key }) => {
          receivedKey = key;
          return { success: false };
        }
      }
    }
  );
  pass(receivedKey === "203.0.113.9", "rate limiter must key submissions by Cloudflare client IP");
  pass(response.status === 429, "rate-limited feedback must return 429");
  pass(response.headers.get("Retry-After") === "60", "429 response must advertise a retry delay");
}

// A rate-limiter service failure fails closed instead of sending an unmetered
// GitHub request.
{
  const response = await worker.fetch(jsonRequest(validPayload()), {
    ...baseEnv,
    FEEDBACK_RATE_LIMITER: {
      limit: async () => {
        throw new Error("simulated limiter failure");
      }
    }
  });
  pass(response.status === 503, "rate-limiter failure must return 503");
}

// Honeypot traffic receives a plausible success without touching GitHub or requiring
// the GitHub token. This avoids teaching simple bots how to bypass the trap.
{
  const originalFetch = globalThis.fetch;
  let githubCalled = false;
  globalThis.fetch = async () => {
    githubCalled = true;
    throw new Error("honeypot must not call GitHub");
  };
  try {
    const response = await worker.fetch(
      jsonRequest(validPayload({ website: "https://spam.example" })),
      { ...baseEnv, GITHUB_TOKEN: "" }
    );
    pass(response.status === 201, "honeypot submission must receive fake 201 success");
    assert.deepEqual(
      await responseJson(response),
      { ok: true, number: null },
      "honeypot response must match the minimal public success shape"
    );
    checks += 1;
    pass(!githubCalled, "honeypot submission must never call GitHub");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Unsafe user-authored content is rejected at the Worker boundary before any
// GitHub request. The same generic response prevents reflection or filter probing.
for (const [label, overrides] of [
  ["direct link", { message: "Visit https://attacker.example/payload" }],
  ["bare domain", { message: "Visit attacker.com now" }],
  ["Markdown link", { message: "[details](https://attacker.example)" }],
  ["obfuscated hxxp link", { message: "hxxps://attacker[.]com/path" }],
  ["word-obfuscated link", { message: "hxxps colon slash slash attacker [dot] com" }],
  ["percent-encoded link", { message: "https%3A%2F%2Fattacker.com" }],
  ["HTML entity link", { message: "https&colon;&sol;&sol;attacker&period;com" }],
  ["email address", { message: "Contact bad.actor@example.com" }],
  ["script element", { message: "<script>alert(1)</script>" }],
  ["event handler", { message: "<div onerror = alert(1)>broken</div>" }],
  ["JavaScript URI", { message: "javascript:alert(1)" }],
  ["active data URI", { message: "data:text/html,<script>alert(1)</script>" }],
  ["unsafe control", { message: "hello\u0007world" }],
  ["bidi override", { summary: "Broken route\u202Etxt" }],
  ["link in page metadata", { page: "https://attacker.com/collect" }],
  ["markup in viewport metadata", { viewport: "<img src=x onerror=alert(1)>" }],
  ["newline in version metadata", { version: "5.3.0\njavascript:alert(1)" }],
  ["link in user-agent metadata", { userAgent: "Mozilla/5.0 attacker dot com" }],
  ["plain profanity", { message: "This is fucking broken" }],
  ["obfuscated profanity", { message: "This is f.u.c.k.i.n.g broken" }],
  ["hidden over-limit payload", { message: `${"x".repeat(4000)} https://attacker.com` }]
]) {
  await expectUnsafeFeedback(overrides, label);
}

// Avoid broad substring false positives: legitimate destinations, filenames,
// multilingual text, prices, and a normal browser UA remain valid feedback.
{
  const originalFetch = globalThis.fetch;
  let githubCalled = false;
  globalThis.fetch = async () => {
    githubCalled = true;
    return new Response(JSON.stringify({ number: 120 }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    const response = await worker.fetch(jsonRequest(validPayload({
      summary: "Notes for Scunthorpe and Phuket",
      message: "Cockpit Country, Shiitake dinner, route.js, and photo.jpg all render. 東京 costs ¥2,500 😊",
      userAgent: "Mozilla/5.0 Chrome/139.0.0.0 Safari/537.36"
    })), baseEnv);
    pass(response.status === 201, "valid multilingual travel feedback must be accepted");
    pass(githubCalled, "valid multilingual travel feedback must reach GitHub");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// A valid submission creates an issue in the Adtona repository. User-authored text is
// normalized before entering the public issue, and the browser receives no GitHub URL.
{
  const originalFetch = globalThis.fetch;
  let githubRequest = null;
  globalThis.fetch = async (input, init) => {
    githubRequest = { url: String(input), init };
    return new Response(JSON.stringify({
      html_url: "https://github.com/christopher-013/Adtona/issues/321",
      number: 321
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    const payload = validPayload({
      category: "bug",
      summary: "Route preview stays blank",
      message: "First line\r\nSecond line with clear reproduction steps.",
      email: "private@example.com"
    });
    const response = await worker.fetch(jsonRequest(payload), baseEnv);
    pass(response.status === 201, "successful GitHub issue creation must return 201");
    assert.deepEqual(
      await responseJson(response),
      { ok: true, number: 321 },
      "success response must expose only ok and issue number"
    );
    checks += 1;

    pass(githubRequest?.url === GITHUB_ISSUES_URL, "feedback must target the Adtona issue tracker");
    pass(githubRequest?.init?.method === "POST", "GitHub issue creation must use POST");
    const headers = new Headers(githubRequest?.init?.headers);
    pass(
      headers.get("Authorization") === "Bearer smoke-test-token",
      "GitHub request must use the server-side token"
    );
    pass(
      headers.get("Content-Type") === "application/json",
      "GitHub request must send JSON"
    );

    const issue = JSON.parse(githubRequest.init.body);
    pass(issue.title.startsWith("[Bug] "), "issue title must contain the normalized category");
    pass(
      Array.isArray(issue.labels) && issue.labels.length === 1 && issue.labels[0] === "bug",
      "bug feedback must use the repository's existing bug label"
    );
    pass(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(issue.title + issue.body),
      "issue title/body must not contain unsafe control characters");
    pass(!/[\u202A-\u202E\u2066-\u2069]/.test(issue.title + issue.body),
      "issue title/body must not contain bidi override/isolate characters");
    pass(!/(^|[^A-Za-z0-9_])@(octocat|everyone)\b/i.test(issue.title + issue.body),
      "user text must not create active GitHub mentions");
    pass(!/<script\b/i.test(issue.body), "user HTML must be rendered inert in the GitHub issue");
    pass(!issue.body.includes("private@example.com") && !/\*\*Contact\b/i.test(issue.body),
      "public GitHub issues must not contain submitted contact information");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// GitHub failures stay generic: no upstream response body, repository detail, token,
// or issue URL is reflected to the browser.
{
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const logged = [];
  console.error = (...values) => logged.push(values.map(String).join(" "));
  globalThis.fetch = async () => new Response(
    "upstream diagnostic containing smoke-test-token and private details",
    { status: 422, headers: { "Content-Type": "text/plain" } }
  );
  try {
    const response = await worker.fetch(jsonRequest(validPayload()), baseEnv);
    pass(response.status === 502, "GitHub API failure must return 502");
    const text = await response.text();
    pass(!text.includes("smoke-test-token"), "502 response must not leak the GitHub token");
    pass(!text.includes("upstream diagnostic"), "502 response must not reflect GitHub diagnostics");
    pass(!text.includes(GITHUB_ISSUES_URL), "502 response must not expose the upstream endpoint");
    const body = JSON.parse(text);
    pass(body.ok === false, "502 response must clearly report failure");
    pass(!logged.join(" ").includes("smoke-test-token"), "Worker logs must not include the GitHub token");
    pass(!logged.join(" ").includes("upstream diagnostic"), "Worker logs must not include upstream response bodies");
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
}

// Network failures also stay in-app and expose no upstream implementation details.
{
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  console.error = () => {};
  globalThis.fetch = async () => {
    throw new Error("simulated network failure with smoke-test-token");
  };
  try {
    const response = await worker.fetch(jsonRequest(validPayload()), baseEnv);
    pass(response.status === 502, "GitHub network failure must return 502");
    const text = await response.text();
    pass(!text.includes("smoke-test-token"), "network failure response must not leak diagnostics");
    pass(!text.includes(GITHUB_ISSUES_URL), "network failure response must not expose GitHub endpoint");
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
}


// Usage pings record a timestamped line per event, not only a daily tally, so the
// log answers when something happened. The counters and the log are written
// separately: the count stays authoritative, the log is the timeline.
{
  const store = new Map();
  const kv = {
    get: async (key) => (store.has(key) ? store.get(key) : null),
    put: async (key, value) => { store.set(key, value); },
    list: async ({ prefix = "" } = {}) => ({
      keys: [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true
    })
  };
  const commentBodies = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (url.endsWith("/issues") && init?.method === "POST") {
      return new Response(JSON.stringify({ number: 42 }), { status: 201 });
    }
    if (url.includes("/issues/42/comments")) {
      commentBodies.push(body.body);
      return new Response(JSON.stringify({ id: 900 }), { status: 201 });
    }
    if (url.includes("/issues/comments/")) {
      commentBodies.push(body.body);
      return new Response("{}", { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };

  const pending = [];
  const ctx = { waitUntil: (promise) => pending.push(promise) };
  const env = {
    ...baseEnv,
    GITHUB_REPO: "christopher-013/Adtona",
    USAGE_COUNTS: kv,
    FEEDBACK_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
  const ping = (event, country = "US") => worker.fetch(
    new Request("https://adtona.com/api/ping", {
      method: "POST",
      headers: {
        Origin: "https://adtona.com",
        "Content-Type": "application/json",
        ...(country ? { "CF-IPCountry": country } : {})
      },
      body: JSON.stringify({ event })
    }),
    env,
    ctx
  );

  try {
    for (const event of ["open", "trip", "export"]) pass((await ping(event)).status === 204, event + " ping must answer 204");
    await Promise.all(pending);

    const day = new Date().toISOString().slice(0, 10);
    // A key per event, never appended to a shared one: KV reads are eventually
    // consistent, so read-modify-write on one key silently drops most events.
    const logKeys = [...store.keys()].filter((key) => key.startsWith("log:" + day + ":")).sort();
    pass(logKeys.length === 3, "each event must get its own KV key");
    pass(new Set(logKeys).size === logKeys.length, "two events must never share a key");
    const lines = logKeys.map((key) => store.get(key));
    pass(lines.length === 3, "every event must add one line, not one per day");
    pass(lines.every((line) => /^\d{2}:\d{2}:\d{2} (open|trip|export)( [A-Z]{2})?$/.test(line)),
      "each line must be a UTC time, an event name and at most a country code");
    pass(lines.map((line) => line.split(" ")[1]).join(",") === "open,trip,export",
      "lines must keep the order the events arrived in");
    pass(store.get("count:" + day + ":trip") === "1", "the daily counter must still be kept alongside the log");

    const withTimeline = commentBodies.filter((body) => body.includes("UTC —"));
    pass(withTimeline.length > 0, "the day comment must carry the timeline");
    const latest = withTimeline[withTimeline.length - 1];
    pass(/\*\*\d{4}-\d{2}-\d{2} \(UTC\)\*\*/.test(latest), "the comment must keep its daily summary heading");
    pass(/- `\d{2}:\d{2}:\d{2}` UTC — (Session|Trip|Export)/.test(latest),
      "timeline entries must render as a time and a readable event name");

    pass(lines.every((line) => line.endsWith(" US")), "the resolved country must be recorded on each line");
    pass(latest.includes("From: US 3"), "the timeline must open with a tally of the countries in it");
    pass(/- `\d{2}:\d{2}:\d{2}` UTC — (Session|Trip|Export) · US/.test(latest),
      "each published entry must name its country");

    // Cloudflare uses XX when it cannot resolve one and T1 for Tor. Neither is a
    // country, and recording them as one would misreport where visitors are.
    const placeholderPending = [];
    ctx.waitUntil = (promise) => placeholderPending.push(promise);
    await ping("trip", "T1");
    await ping("trip", "XX");
    await ping("trip", "");
    await Promise.all(placeholderPending);
    const afterPlaceholders = [...store.keys()]
      .filter((key) => key.startsWith("log:" + day + ":"))
      .sort()
      .slice(3)
      .map((key) => store.get(key));
    pass(afterPlaceholders.length === 3, "unresolvable countries must still record the event");
    pass(afterPlaceholders.every((line) => /^\d{2}:\d{2}:\d{2} trip$/.test(line)),
      "XX, T1 and a missing header must record no country rather than a fake one");

    // Nothing about the visitor may reach storage or the published log.
    const everything = [...store.keys(), ...store.values(), ...commentBodies].join(" ");
    pass(!/d+.d+.d+.d+/.test(everything), "no address may reach the usage log");
    pass(!/Mozilla|User-Agent/i.test(everything), "no user agent may reach the usage log");
  } finally {
    globalThis.fetch = originalFetch;
  }
}


// A day whose counters run ahead of its log — events counted before per-event
// logging was deployed, or a ping whose log write failed. The comment must say
// so plainly instead of blaming a 300-line cap it never came close to.
{
  const day = new Date().toISOString().slice(0, 10);
  const store = new Map([
    ["count:" + day + ":trip", "17"],
    ["count:total:trip", "17"]
  ]);
  const kv = {
    get: async (key) => (store.has(key) ? store.get(key) : null),
    put: async (key, value) => { store.set(key, value); },
    list: async ({ prefix = "" } = {}) => ({
      keys: [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true
    })
  };
  const bodies = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const parsed = init?.body ? JSON.parse(init.body) : {};
    if (url.endsWith("/issues") && init?.method === "POST") return new Response(JSON.stringify({ number: 7 }), { status: 201 });
    if (url.includes("/comments")) { bodies.push(parsed.body); return new Response(JSON.stringify({ id: 5 }), { status: 201 }); }
    return new Response("[]", { status: 200 });
  };
  const pending = [];
  try {
    await worker.fetch(
      new Request("https://adtona.com/api/ping", {
        method: "POST",
        headers: { Origin: "https://adtona.com", "Content-Type": "application/json", "CF-IPCountry": "PH" },
        body: JSON.stringify({ event: "trip" })
      }),
      {
        ...baseEnv,
        GITHUB_REPO: "christopher-013/Adtona",
        USAGE_COUNTS: kv,
        FEEDBACK_RATE_LIMITER: { limit: async () => ({ success: true }) }
      },
      { waitUntil: (promise) => pending.push(promise) }
    );
    await Promise.all(pending);

    const comment = bodies.filter((body) => body.includes("UTC —")).at(-1);
    pass(Boolean(comment), "the day comment must still be filed");
    pass(comment.includes("more counted today but not listed individually."),
      "a counter/log shortfall must be described as what it is");
    pass(!comment.includes("listing cap"),
      "a shortfall well under the cap must not be blamed on the cap");
    pass(comment.includes("- …and 17 more"),
      "the shortfall must count every event the log does not list");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log(`Feedback Worker smoke test passed (${checks} checks).`);
